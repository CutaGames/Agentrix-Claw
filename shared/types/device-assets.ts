/**
 * L9 devices and assets (E138), the "My things" ledger. One row per thing the owner has: what it is, what it is worth,
 * warranty, whether a registered device is linked, whether it can be sold. Serial number, IMEI, receipt number and notes
 * are private and are only accepted while the owner data key switch is on (sealed with the owner's key); with it off a
 * request that carries them is refused as a whole (409 `owner_data_keys_off`).
 *
 * Behind `DEVICE_ASSETS_LEDGER_V1_ENABLED` (server, default off, exactly `'1'`) and the audience list
 * `DEVICE_ASSETS_AUDIENCE_V1` (`*` or comma separated user ids, missing = nobody). Off, or not on the list: every route
 * answers the same 404 and nothing is read or written. Clients: web `NEXT_PUBLIC_DEVICE_ASSETS_ENABLED`, mobile
 * `EXPO_PUBLIC_DEVICE_ASSETS_ENABLED`.
 *
 * Owner routes (`/device-assets`, signed in, the caller's own rows only):
 * - `GET  items?status=&limit=`            → `{ success, data: DeviceAssetListV1 }` (no private fields)
 * - `GET  items/:assetRef`                 → `{ success, data: DeviceAssetViewV1 }`
 * - `POST items`                           body `DeviceAssetInputV1` (create) → `DeviceAssetViewV1`
 * - `PATCH items/:assetRef`                body `DeviceAssetInputV1` (update) → `DeviceAssetViewV1`
 * - `DELETE items/:assetRef`               → `{ deleted: true }`
 * - `GET  linkable-devices`                → `{ success, data: DeviceAssetLinkableDevicesV1 }`
 * - `POST items/:assetRef/recycle-quote`   body `DeviceAssetRecycleQuoteInputV1` → `DeviceAssetViewV1`
 * - `POST items/:assetRef/device-record`   body `DeviceAssetRecordUploadV1` → `{ success, data: DeviceAssetRecordViewV1 }` (L2)
 * - `GET  items/:assetRef/device-record`   → `{ success, data: DeviceAssetRecordViewV1 }` (L2)
 *
 * Error bodies carry only `code` (one of `DEVICE_ASSETS_ERROR_CODES_V1`) and a one-line `message` in both languages.
 */
import { canonicalize, sha256Hex } from '../soul-core-l1/v1_1/canonical';
import { DEVICE_CAPABILITY_DECLARATION_MAX_ITEMS, DEVICE_CAPABILITY_STATES_V0, DEVICE_CAPABILITY_TYPE_PATTERN_V0, type DeviceCapabilityStateV0 } from './device-capability';
import { DEVICE_RISK_STATUSES, type DeviceRiskStatusV1 } from './device-lifecycle';

// ── switches ──────────────────────────────────────────────────────────────────────────────────

export const DEVICE_ASSETS_LEDGER_FLAG_V1 = 'DEVICE_ASSETS_LEDGER_V1_ENABLED' as const;
/** Who may use the owner side while P1-0 (per-person switches) does not exist yet. Not a switch: `*` or user ids. */
export const DEVICE_ASSETS_AUDIENCE_ENV_V1 = 'DEVICE_ASSETS_AUDIENCE_V1' as const;
export const DEVICE_ASSETS_AUDIENCE_MAX_V1 = 200;
/** L2: the desktop reads and signs its own serial number and battery facts into the owner's record. */
export const DEVICE_ASSET_RECORD_FLAG_V1 = 'DEVICE_ASSET_RECORD_V1_ENABLED' as const;
export const DEVICE_ASSETS_WEB_FLAG_V1 = 'NEXT_PUBLIC_DEVICE_ASSETS_ENABLED' as const;
export const DEVICE_ASSETS_MOBILE_FLAG_V1 = 'EXPO_PUBLIC_DEVICE_ASSETS_ENABLED' as const;
export const DEVICE_ASSET_RECORD_DESKTOP_FLAG_V1 = 'VITE_DEVICE_ASSET_RECORD_ENABLED' as const;

// ── paths ─────────────────────────────────────────────────────────────────────────────────────

export const DEVICE_ASSETS_PATH_V1 = '/device-assets';
export const DEVICE_ASSETS_ITEMS_PATH_V1 = '/device-assets/items';
export const DEVICE_ASSETS_LINKABLE_DEVICES_PATH_V1 = '/device-assets/linkable-devices';
export function deviceAssetPathV1(assetRef: string): string {
  return `${DEVICE_ASSETS_ITEMS_PATH_V1}/${encodeURIComponent(assetRef)}`;
}
export function deviceAssetRecycleQuotePathV1(assetRef: string): string {
  return `${deviceAssetPathV1(assetRef)}/recycle-quote`;
}

// ── vocabulary ────────────────────────────────────────────────────────────────────────────────

/**
 * What can be recorded and sold. Deliberately no services, financial products, tickets, vapes, medicine, weapons,
 * alcohol or tobacco, and no animals (design 3.3 item 8).
 */
export const RESALE_CATEGORIES_V1 = [
  'phone',
  'laptop',
  'tablet',
  'camera',
  'audio',
  'wearable',
  'gaming',
  'monitor_pc_parts',
  'furniture',
  'home_appliance',
  'baby_kids_gear',
  'sports_outdoor',
  'books_media',
  'fashion_bags',
  'other',
] as const;
export type ResaleCategoryV1 = (typeof RESALE_CATEGORIES_V1)[number];
export const RESALE_CATEGORY_COPY_V1: Record<ResaleCategoryV1, { zh: string; en: string }> = {
  phone: { zh: '手机', en: 'Phone' },
  laptop: { zh: '笔记本电脑', en: 'Laptop' },
  tablet: { zh: '平板', en: 'Tablet' },
  camera: { zh: '相机', en: 'Camera' },
  audio: { zh: '耳机音响', en: 'Audio' },
  wearable: { zh: '手表和穿戴', en: 'Watches and wearables' },
  gaming: { zh: '游戏机', en: 'Gaming' },
  monitor_pc_parts: { zh: '显示器和电脑配件', en: 'Monitors and PC parts' },
  furniture: { zh: '家具', en: 'Furniture' },
  home_appliance: { zh: '家电', en: 'Home appliances' },
  baby_kids_gear: { zh: '婴儿和儿童用品', en: 'Baby and kids gear' },
  sports_outdoor: { zh: '运动户外', en: 'Sports and outdoor' },
  books_media: { zh: '书和影音', en: 'Books and media' },
  fashion_bags: { zh: '服饰和包', en: 'Fashion and bags' },
  other: { zh: '其他', en: 'Other' },
};

export const DEVICE_ASSET_CONDITIONS_V1 = ['new', 'like_new', 'good', 'fair', 'for_parts'] as const;
export type DeviceAssetConditionV1 = (typeof DEVICE_ASSET_CONDITIONS_V1)[number];
export const DEVICE_ASSET_CONDITION_COPY_V1: Record<DeviceAssetConditionV1, { zh: string; en: string }> = {
  new: { zh: '全新', en: 'New' },
  like_new: { zh: '几乎全新', en: 'Like new' },
  good: { zh: '良好', en: 'Good' },
  fair: { zh: '一般', en: 'Fair' },
  for_parts: { zh: '只能拆件', en: 'For parts' },
};

/** `listed` is written only by the listing service (on publish). */
export const DEVICE_ASSET_STATUSES_V1 = ['owned', 'listed', 'sold', 'recycled', 'given_away', 'disposed'] as const;
export type DeviceAssetStatusV1 = (typeof DEVICE_ASSET_STATUSES_V1)[number];
/** What the owner may set by hand: between `owned` and the last four. */
export const DEVICE_ASSET_MANUAL_STATUSES_V1 = ['owned', 'sold', 'recycled', 'given_away', 'disposed'] as const;
export type DeviceAssetManualStatusV1 = (typeof DEVICE_ASSET_MANUAL_STATUSES_V1)[number];

export const DEVICE_ASSET_CURRENCIES_V1 = ['SGD', 'USD'] as const;
export type DeviceAssetCurrencyV1 = (typeof DEVICE_ASSET_CURRENCIES_V1)[number];
/** `owner` = typed by the owner; `recycle_quote` = a quote the owner copied from a destination in the recycle list. */
export const DEVICE_ASSET_ESTIMATE_SOURCES_V1 = ['owner', 'recycle_quote'] as const;
export type DeviceAssetEstimateSourceV1 = (typeof DEVICE_ASSET_ESTIMATE_SOURCES_V1)[number];
/** `sealed` = opened from the sealed table; `unreadable` = sealed and cannot be opened now (never an error). */
export const DEVICE_ASSET_PRIVATE_STATES_V1 = ['none', 'sealed', 'unreadable'] as const;
export type DeviceAssetPrivateStateV1 = (typeof DEVICE_ASSET_PRIVATE_STATES_V1)[number];

export const DEVICE_ASSET_LIMITS_V1 = {
  nameMax: 80,
  brandMax: 40,
  modelMax: 60,
  serialNumberMax: 64,
  receiptRefMax: 64,
  notesMax: 500,
  amountMinorMin: 0,
  amountMinorMax: 10_000_000,
  perOwnerMax: 500,
  listDefault: 50,
  listMax: 200,
  earliestDate: '1990-01-01',
  /** The list marks a warranty that ends within this many days. */
  warrantySoonDays: 30,
} as const;

export const DEVICE_ASSET_REF_PATTERN_V1 = /^das_[0-9a-f]{32}$/;
/** A registered device's public id (`clawcore_devices.device_id`, varchar 64). */
export const DEVICE_ASSET_LINKED_DEVICE_REF_PATTERN_V1 = /^[A-Za-z0-9:._-]{1,64}$/;
export const DEVICE_ASSET_SERIAL_NUMBER_PATTERN_V1 = /^[A-Za-z0-9 ._/-]{1,64}$/;

export const DEVICE_ASSETS_ERROR_CODES_V1 = [
  'not_found',
  'invalid_input',
  'owner_data_keys_off',
  'device_already_linked',
  'asset_limit',
  'device_assets_unavailable',
  'device_status_unavailable',
] as const;
export type DeviceAssetsErrorCodeV1 = (typeof DEVICE_ASSETS_ERROR_CODES_V1)[number];
export const DEVICE_ASSETS_ERROR_MESSAGES_V1: Record<DeviceAssetsErrorCodeV1, string> = {
  not_found: '没有找到。 Not found.',
  invalid_input: '有一项填得不对。 One of the fields is not valid.',
  owner_data_keys_off: '开启加密以后才能填序列号、IMEI、收据号和备注。 Serial number, IMEI, receipt number and notes can be entered once encryption is on.',
  device_already_linked: '这台设备已经挂在另一件东西上。 This device is already linked to another item.',
  asset_limit: '最多记 500 件东西。 You can record up to 500 items.',
  device_assets_unavailable: '「我的东西」暂时用不了，请稍后再试。 My things is unavailable right now. Please try again later.',
  device_status_unavailable: '暂时读不到设备状态，请稍后再试。 The device status cannot be read right now. Please try again later.',
};

// ── shapes ────────────────────────────────────────────────────────────────────────────────────

export interface DeviceAssetMoneyV1 {
  /** Minor units (cents), an integer from 0 to 10,000,000. */
  amountMinor: number;
  currency: DeviceAssetCurrencyV1;
}
export interface DeviceAssetPrivateFieldsV1 {
  serialNumber: string | null;
  imei: string | null;
  receiptRef: string | null;
  notes: string | null;
}
/** A create (`name`, `category`, `condition` required, no `status`) or an edit (any subset). `null` clears. */
export interface DeviceAssetInputV1 {
  name?: string;
  category?: ResaleCategoryV1;
  brand?: string | null;
  model?: string | null;
  /** `YYYY-MM-DD`, from 1990-01-01 to today. */
  purchasedOn?: string | null;
  purchasePrice?: DeviceAssetMoneyV1 | null;
  condition?: DeviceAssetConditionV1;
  /** `YYYY-MM-DD`, not before `purchasedOn`. */
  warrantyUntil?: string | null;
  /** One of the owner's own active registered devices; one device is linked to at most one owned or listed item. */
  linkedDeviceRef?: string | null;
  /** What the owner thinks it is worth (`estimateSource` becomes `owner`). */
  estimate?: DeviceAssetMoneyV1 | null;
  /** Edit only. */
  status?: DeviceAssetManualStatusV1;
  /** Only while the owner data key switch is on; `null` clears all four. */
  private?: Partial<DeviceAssetPrivateFieldsV1> | null;
}
export interface DeviceAssetEstimateV1 {
  amountMinor: number;
  currency: DeviceAssetCurrencyV1;
  source: DeviceAssetEstimateSourceV1;
  /** Set when `source` is `recycle_quote`: an id from `RESALE_RECYCLE_DESTINATIONS_V1`. */
  destinationId: string | null;
  /** When the owner typed it, or the day the quote was given. */
  at: string;
}
/** A list row. No private fields. */
export interface DeviceAssetSummaryV1 {
  assetRef: string;
  name: string;
  category: ResaleCategoryV1;
  brand: string | null;
  model: string | null;
  condition: DeviceAssetConditionV1;
  status: DeviceAssetStatusV1;
  purchasedOn: string | null;
  purchasePrice: DeviceAssetMoneyV1 | null;
  warrantyUntil: string | null;
  estimate: DeviceAssetEstimateV1 | null;
  linkedDeviceRef: string | null;
  createdAt: string;
  updatedAt: string;
}
export interface DeviceAssetViewV1 extends DeviceAssetSummaryV1 {
  privateState: DeviceAssetPrivateStateV1;
  /** Only when `privateState` is `sealed`. */
  private: DeviceAssetPrivateFieldsV1 | null;
  /** Derived: `owned`, and no linked device or the linked device's risk status is `clear`. */
  sellable: boolean;
  /** Derived; `null` while the rental switch is off (the web shows nothing). */
  rentable: boolean | null;
  /**
   * L2 (S17): what a computer read about itself and signed for this item, `null` when there is none. Only while
   * `DEVICE_ASSET_RECORD_V1_ENABLED` is on and its table is there; otherwise the key is not in the answer at all.
   */
  deviceRecord?: DeviceAssetRecordSummaryV1 | null;
}
export interface DeviceAssetListV1 {
  schemaVersion: 1;
  items: DeviceAssetSummaryV1[];
  /** The owner data key switch at run time: the web greys out the private fields when it is `false`. */
  privateFieldsEnabled: boolean;
}
/** One thing a device said it can do (the device passport's capability list, `DEVICE_MARKET_V0_ENABLED`). */
export interface DeviceAssetPassportCapabilityV1 {
  type: string;
  state: DeviceCapabilityStateV0;
}
/**
 * L6 (S15): what the device said about itself on the device mesh. `online` means a capability declaration of this device
 * has not expired yet (the device re-declares every few minutes); a device with none is `online: false`, no times and no
 * capabilities. Only an answer to a read made while the device passport switch is on carries it.
 */
export interface DeviceAssetPassportV1 {
  online: boolean;
  declaredAt: string | null;
  expiresAt: string | null;
  capabilities: DeviceAssetPassportCapabilityV1[];
}
/**
 * A registered device the owner can link. Name, kind and risk status (D22). `passport` (L6) is there only while the device
 * passport switch is on and the passports could be read; without the key the answer is the one the MVP gave.
 */
export interface DeviceAssetLinkableDeviceV1 {
  deviceRef: string;
  name: string | null;
  kind: string;
  riskStatus: DeviceRiskStatusV1;
  /** The owned or listed item it is linked to, if any. */
  linkedAssetRef: string | null;
  passport?: DeviceAssetPassportV1;
}
export interface DeviceAssetLinkableDevicesV1 {
  schemaVersion: 1;
  items: DeviceAssetLinkableDeviceV1[];
}
export interface DeviceAssetRecycleQuoteInputV1 {
  /** An id from `RESALE_RECYCLE_DESTINATIONS_V1` (`resale.ts`, which also holds the validator). */
  destinationId: string;
  amount: DeviceAssetMoneyV1;
  /** `YYYY-MM-DD`, not after today. */
  quotedOn: string;
}

// ── shape checks (used by this file and resale.ts; not a client API) ─────────────────────────────

export type DeviceAssetsShapeCheckV1 = (value: unknown) => boolean;
type Check = DeviceAssetsShapeCheckV1;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
/** The first key that is unknown, missing or wrong, or `null` when the object has exactly the keys asked for. */
function exactKeysFailure(value: Record<string, unknown>, required: Record<string, Check>, optional: Record<string, Check> = {}): string | null {
  for (const key of Object.keys(value)) {
    if (!Object.prototype.hasOwnProperty.call(required, key) && !Object.prototype.hasOwnProperty.call(optional, key)) return key;
  }
  for (const key of Object.keys(required)) {
    if (!Object.prototype.hasOwnProperty.call(value, key) || !required[key](value[key])) return key;
  }
  for (const key of Object.keys(optional)) {
    if (Object.prototype.hasOwnProperty.call(value, key) && !optional[key](value[key])) return key;
  }
  return null;
}
/** `YYYY-MM-DD` that is a real calendar day. */
export function isIsoDateV1(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [y, m, d] = value.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}
export const deviceAssetsShapeV1 = {
  isRecord,
  exactKeysFailure,
  text: (max: number, min = 1): Check => (v) => typeof v === 'string' && v.length >= min && v.length <= max,
  nullable: (check: Check): Check => (v) => v === null || check(v),
  oneOf: (list: readonly string[]): Check => (v) => typeof v === 'string' && list.indexOf(v) >= 0,
  literal: (expected: unknown): Check => (v) => v === expected,
  bool: ((v: unknown) => typeof v === 'boolean') as Check,
  int: (min: number, max: number): Check => (v) => typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max,
  pattern: (re: RegExp): Check => (v) => typeof v === 'string' && re.test(v),
  isoTime: ((v: unknown) => typeof v === 'string' && v.length <= 40 && !Number.isNaN(Date.parse(v))) as Check,
  isoDate: ((v: unknown) => isIsoDateV1(v)) as Check,
  arrayOf: (check: Check, max: number): Check => (v) => Array.isArray(v) && v.length <= max && v.every((item) => check(item)),
  object: (required: Record<string, Check>, optional: Record<string, Check> = {}): Check => (v) => isRecord(v) && exactKeysFailure(v, required, optional) === null,
  /** Server bodies are `{ success, data }`; the decoders accept that or the bare value. */
  unwrap(body: unknown): unknown {
    if (!isRecord(body) || !isRecord(body.data)) return body;
    return Object.keys(body).every((key) => key === 'success' || key === 'data') ? body.data : body;
  },
};
const S = deviceAssetsShapeV1;

// ── text and number rules (server and clients share them) ───────────────────────────────────────

// eslint-disable-next-line no-control-regex
const ANY_CONTROL = /[\u0000-\u001f\u007f-\u009f]/;
// eslint-disable-next-line no-control-regex
const CONTROL_EXCEPT_LINES = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/;

/** Trimmed single-line text of 1..max, or `null` (control characters, line breaks included, are refused, not removed). */
function singleLine(value: unknown, max: number): string | null {
  if (typeof value !== 'string' || ANY_CONTROL.test(value)) return null;
  const text = value.trim();
  return text.length >= 1 && text.length <= max ? text : null;
}
/** Like `singleLine`, but line breaks and tabs are allowed. */
function multiLine(value: unknown, max: number): string | null {
  if (typeof value !== 'string' || CONTROL_EXCEPT_LINES.test(value)) return null;
  const text = value.trim();
  return text.length >= 1 && text.length <= max ? text : null;
}

/** 15 digits and a valid Luhn check digit. */
export function isValidImeiV1(value: string): boolean {
  if (typeof value !== 'string' || !/^\d{15}$/.test(value)) return false;
  let sum = 0;
  for (let i = 0; i < 15; i += 1) {
    let digit = value.charCodeAt(14 - i) - 48;
    if (i % 2 === 1) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
  }
  return sum % 10 === 0;
}

export function isDeviceAssetMoneyV1(value: unknown): value is DeviceAssetMoneyV1 {
  return S.object({
    amountMinor: S.int(DEVICE_ASSET_LIMITS_V1.amountMinorMin, DEVICE_ASSET_LIMITS_V1.amountMinorMax),
    currency: S.oneOf(DEVICE_ASSET_CURRENCIES_V1),
  })(value);
}

/** Today in UTC as `YYYY-MM-DD`. */
export function deviceAssetsTodayV1(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}

export type DeviceAssetInputResultV1 = { ok: true; value: DeviceAssetInputV1 } | { ok: false; code: 'invalid_input'; field: string };

const INPUT_KEYS = [
  'name',
  'category',
  'brand',
  'model',
  'purchasedOn',
  'purchasePrice',
  'condition',
  'warrantyUntil',
  'linkedDeviceRef',
  'estimate',
  'status',
  'private',
] as const;
const PRIVATE_KEYS = ['serialNumber', 'imei', 'receiptRef', 'notes'] as const;

/**
 * Checks and cleans an owner's create or edit body. Unknown fields, enum values outside the lists, out-of-range prices
 * and dates, control characters and a bad IMEI are refused (`invalid_input` with the field name, for the message).
 * Whether the private fields may be stored at all (the key switch) and who owns the linked device are the server's checks.
 */
export function validateDeviceAssetInputV1(value: unknown, options: { mode: 'create' | 'update'; today?: string }): DeviceAssetInputResultV1 {
  const bad = (field: string): DeviceAssetInputResultV1 => ({ ok: false, code: 'invalid_input', field });
  const today = options.today ?? deviceAssetsTodayV1();
  if (!isRecord(value)) return bad('$');
  for (const key of Object.keys(value)) if (!(INPUT_KEYS as readonly string[]).includes(key)) return bad(key);
  if (options.mode === 'create') {
    for (const key of ['name', 'category', 'condition'] as const) if (value[key] === undefined || value[key] === null) return bad(key);
    if (value.status !== undefined) return bad('status');
  } else if (Object.keys(value).length === 0) {
    return bad('$');
  }
  const out: DeviceAssetInputV1 = {};
  if (value.name !== undefined) {
    const name = singleLine(value.name, DEVICE_ASSET_LIMITS_V1.nameMax);
    if (name === null) return bad('name');
    out.name = name;
  }
  if (value.category !== undefined) {
    if (!S.oneOf(RESALE_CATEGORIES_V1)(value.category)) return bad('category');
    out.category = value.category as ResaleCategoryV1;
  }
  if (value.condition !== undefined) {
    if (!S.oneOf(DEVICE_ASSET_CONDITIONS_V1)(value.condition)) return bad('condition');
    out.condition = value.condition as DeviceAssetConditionV1;
  }
  for (const [key, max] of [['brand', DEVICE_ASSET_LIMITS_V1.brandMax], ['model', DEVICE_ASSET_LIMITS_V1.modelMax]] as const) {
    const raw = value[key];
    if (raw === undefined) continue;
    if (raw === null) {
      out[key] = null;
      continue;
    }
    const text = singleLine(raw, max);
    if (text === null) return bad(key);
    out[key] = text;
  }
  if (value.purchasedOn !== undefined) {
    const raw = value.purchasedOn;
    if (raw !== null && (!isIsoDateV1(raw) || raw < DEVICE_ASSET_LIMITS_V1.earliestDate || raw > today)) return bad('purchasedOn');
    out.purchasedOn = raw as string | null;
  }
  if (value.warrantyUntil !== undefined) {
    const raw = value.warrantyUntil;
    if (raw !== null && (!isIsoDateV1(raw) || raw < DEVICE_ASSET_LIMITS_V1.earliestDate)) return bad('warrantyUntil');
    if (raw !== null && typeof out.purchasedOn === 'string' && (raw as string) < out.purchasedOn) return bad('warrantyUntil');
    out.warrantyUntil = raw as string | null;
  }
  for (const key of ['purchasePrice', 'estimate'] as const) {
    const raw = value[key];
    if (raw === undefined) continue;
    if (raw !== null && !isDeviceAssetMoneyV1(raw)) return bad(key);
    out[key] = raw === null ? null : { amountMinor: (raw as DeviceAssetMoneyV1).amountMinor, currency: (raw as DeviceAssetMoneyV1).currency };
  }
  if (value.linkedDeviceRef !== undefined) {
    const raw = value.linkedDeviceRef;
    if (raw !== null && !S.pattern(DEVICE_ASSET_LINKED_DEVICE_REF_PATTERN_V1)(raw)) return bad('linkedDeviceRef');
    out.linkedDeviceRef = raw as string | null;
  }
  if (value.status !== undefined) {
    if (!S.oneOf(DEVICE_ASSET_MANUAL_STATUSES_V1)(value.status)) return bad('status');
    out.status = value.status as DeviceAssetManualStatusV1;
  }
  if (value.private !== undefined) {
    const raw = value.private;
    if (raw === null) {
      out.private = null;
    } else {
      if (!isRecord(raw)) return bad('private');
      const keys = Object.keys(raw);
      if (keys.length === 0) return bad('private');
      for (const key of keys) if (!(PRIVATE_KEYS as readonly string[]).includes(key)) return bad(`private.${key}`);
      const fields: Partial<DeviceAssetPrivateFieldsV1> = {};
      for (const key of PRIVATE_KEYS) {
        const item = raw[key];
        if (item === undefined) continue;
        if (item === null) {
          fields[key] = null;
          continue;
        }
        let text: string | null;
        if (key === 'serialNumber') {
          text = singleLine(item, DEVICE_ASSET_LIMITS_V1.serialNumberMax);
          if (text !== null && !DEVICE_ASSET_SERIAL_NUMBER_PATTERN_V1.test(text)) text = null;
        } else if (key === 'imei') {
          text = singleLine(item, 15);
          if (text !== null && !isValidImeiV1(text)) text = null;
        } else if (key === 'receiptRef') {
          text = singleLine(item, DEVICE_ASSET_LIMITS_V1.receiptRefMax);
        } else {
          text = multiLine(item, DEVICE_ASSET_LIMITS_V1.notesMax);
        }
        if (text === null) return bad(`private.${key}`);
        fields[key] = text;
      }
      out.private = fields;
    }
  }
  return { ok: true, value: out };
}

/** True when a private field would be written (the server refuses the whole body with 409 while the key switch is off). */
export function deviceAssetInputHasPrivateV1(input: DeviceAssetInputV1): boolean {
  return input.private !== undefined && input.private !== null && PRIVATE_KEYS.some((key) => typeof input.private?.[key] === 'string');
}

// ── decoding (web, mobile) ──────────────────────────────────────────────────────────────────────

export type DeviceAssetsDecodeResultV1<T> = { ok: true; value: T } | { ok: false; field: string };

const MONEY: Check = (v) => isDeviceAssetMoneyV1(v);
const ESTIMATE: Check = S.object({
  amountMinor: S.int(DEVICE_ASSET_LIMITS_V1.amountMinorMin, DEVICE_ASSET_LIMITS_V1.amountMinorMax),
  currency: S.oneOf(DEVICE_ASSET_CURRENCIES_V1),
  source: S.oneOf(DEVICE_ASSET_ESTIMATE_SOURCES_V1),
  destinationId: S.nullable(S.text(32)),
  at: S.isoTime,
});
const SUMMARY_KEYS: Record<string, Check> = {
  assetRef: S.pattern(DEVICE_ASSET_REF_PATTERN_V1),
  name: S.text(DEVICE_ASSET_LIMITS_V1.nameMax),
  category: S.oneOf(RESALE_CATEGORIES_V1),
  brand: S.nullable(S.text(DEVICE_ASSET_LIMITS_V1.brandMax)),
  model: S.nullable(S.text(DEVICE_ASSET_LIMITS_V1.modelMax)),
  condition: S.oneOf(DEVICE_ASSET_CONDITIONS_V1),
  status: S.oneOf(DEVICE_ASSET_STATUSES_V1),
  purchasedOn: S.nullable(S.isoDate),
  purchasePrice: S.nullable(MONEY),
  warrantyUntil: S.nullable(S.isoDate),
  estimate: S.nullable(ESTIMATE),
  linkedDeviceRef: S.nullable(S.pattern(DEVICE_ASSET_LINKED_DEVICE_REF_PATTERN_V1)),
  createdAt: S.isoTime,
  updatedAt: S.isoTime,
};
const PRIVATE_VIEW: Check = S.object({
  serialNumber: S.nullable(S.text(DEVICE_ASSET_LIMITS_V1.serialNumberMax)),
  imei: S.nullable(S.text(15)),
  receiptRef: S.nullable(S.text(DEVICE_ASSET_LIMITS_V1.receiptRefMax)),
  notes: S.nullable(S.text(DEVICE_ASSET_LIMITS_V1.notesMax)),
});
const VIEW_KEYS: Record<string, Check> = {
  ...SUMMARY_KEYS,
  privateState: S.oneOf(DEVICE_ASSET_PRIVATE_STATES_V1),
  private: S.nullable(PRIVATE_VIEW),
  sellable: S.bool,
  rentable: S.nullable(S.bool),
};
const PASSPORT_CAPABILITY: Check = S.object({
  type: S.pattern(DEVICE_CAPABILITY_TYPE_PATTERN_V0),
  state: S.oneOf(DEVICE_CAPABILITY_STATES_V0),
});
/** Online means times; offline means none and no capabilities (`passport.online` decides, a mix is unreadable). */
const PASSPORT: Check = (value) => {
  if (!S.object({ online: S.bool, declaredAt: S.nullable(S.isoTime), expiresAt: S.nullable(S.isoTime), capabilities: S.arrayOf(PASSPORT_CAPABILITY, DEVICE_CAPABILITY_DECLARATION_MAX_ITEMS) })(value)) return false;
  const passport = value as DeviceAssetPassportV1;
  return passport.online ? passport.declaredAt !== null && passport.expiresAt !== null : passport.declaredAt === null && passport.expiresAt === null && passport.capabilities.length === 0;
};
const LINKABLE_DEVICE: Check = S.object(
  {
    deviceRef: S.pattern(DEVICE_ASSET_LINKED_DEVICE_REF_PATTERN_V1),
    name: S.nullable(S.text(80)),
    kind: S.text(32),
    riskStatus: S.oneOf(DEVICE_RISK_STATUSES),
    linkedAssetRef: S.nullable(S.pattern(DEVICE_ASSET_REF_PATTERN_V1)),
  },
  { passport: PASSPORT },
);

function decodeExact<T>(body: unknown, keys: Record<string, Check>, optional: Record<string, Check> = {}): DeviceAssetsDecodeResultV1<T> {
  const value = S.unwrap(body);
  if (!isRecord(value)) return { ok: false, field: '$' };
  const field = exactKeysFailure(value, keys, optional);
  return field === null ? { ok: true, value: value as unknown as T } : { ok: false, field };
}

/** `GET /device-assets/items`. Unknown keys anywhere make it unreadable. */
export function decodeDeviceAssetListV1(body: unknown): DeviceAssetsDecodeResultV1<DeviceAssetListV1> {
  return decodeExact<DeviceAssetListV1>(body, {
    schemaVersion: S.literal(1),
    items: S.arrayOf(S.object(SUMMARY_KEYS), DEVICE_ASSET_LIMITS_V1.listMax),
    privateFieldsEnabled: S.bool,
  });
}
/** `GET /device-assets/items/:assetRef` and the create, edit and recycle-quote answers. */
export function decodeDeviceAssetViewV1(body: unknown): DeviceAssetsDecodeResultV1<DeviceAssetViewV1> {
  // `deviceRecord` (L2) is the one optional key: absent while its switch is off.
  const decoded = decodeExact<DeviceAssetViewV1>(body, VIEW_KEYS, { deviceRecord: (v) => v === null || DEVICE_ASSET_RECORD_SUMMARY(v) });
  if (decoded.ok === false) return decoded;
  // Private values only travel with `sealed`.
  if ((decoded.value.private !== null) !== (decoded.value.privateState === 'sealed')) return { ok: false, field: 'private' };
  return decoded;
}
/** `GET /device-assets/linkable-devices`. */
export function decodeDeviceAssetLinkableDevicesV1(body: unknown): DeviceAssetsDecodeResultV1<DeviceAssetLinkableDevicesV1> {
  return decodeExact<DeviceAssetLinkableDevicesV1>(body, { schemaVersion: S.literal(1), items: S.arrayOf(LINKABLE_DEVICE, 500) });
}

/** The list marks a warranty that ends within 30 days (today included, already ended not). */
export function deviceAssetWarrantyEndsSoonV1(warrantyUntil: string | null, today: string = deviceAssetsTodayV1()): boolean {
  if (!isIsoDateV1(warrantyUntil) || !isIsoDateV1(today) || warrantyUntil < today) return false;
  const days = (Date.parse(`${warrantyUntil}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000;
  return days <= DEVICE_ASSET_LIMITS_V1.warrantySoonDays;
}

// ── L2 (S17): what a computer read about itself, signed with its device key ─────────────────────
//
// The desktop reads its own serial number, battery cycle count and capacity (Rust, `device_asset_record_read`, fixed
// commands), computes `deviceAssetRecordDigestV1(fields)` and signs `deviceAssetRecordMessageV1` with its device key
// (ECDSA P-256 / SHA-256, IEEE P1363, base64url, the same key as its capability declarations). The server checks the
// signature once against the owner's current E32 signing credential of that device, and keeps only which device, which
// credential, when, the digest and the signature: never the serial number or the battery figures, which stay on the
// computer that read them. It is "read and signed by this computer", not an inspection or a certification. Behind
// `DEVICE_ASSET_RECORD_V1_ENABLED` (needs the ledger switch and `TRUST_CORE_DEVICE_SIGNING_CREDENTIAL_V1_ENABLED`) and
// on the desktop `VITE_DEVICE_ASSET_RECORD_ENABLED`.

export const DEVICE_ASSET_RECORD_DOMAIN_V1 = 'agentrix.device.asset.record.v1' as const;
/** macOS on Intel reports the full charge capacity in mAh; Windows reports both capacities in mWh. */
export const DEVICE_ASSET_RECORD_CAPACITY_UNITS_V1 = ['mAh', 'mWh'] as const;
export type DeviceAssetRecordCapacityUnitV1 = (typeof DEVICE_ASSET_RECORD_CAPACITY_UNITS_V1)[number];
export const DEVICE_ASSET_RECORD_LIMITS_V1 = {
  cycleCountMax: 100_000,
  capacityMax: 1_000_000,
  /** Apple silicon reports only "maximum capacity" as a percentage of the design capacity. */
  percentMax: 200,
  /** A reading may be at most this far ahead of the server clock… */
  readAtFutureSkewMs: 5 * 60_000,
  /** …and at most this old when it is handed in. */
  readAtMaxAgeMs: 24 * 60 * 60_000,
} as const;
export const DEVICE_ASSET_RECORD_SIGNATURE_PATTERN_V1 = /^[A-Za-z0-9_-]{86}$/;
/** The E32 credential reference (`device-signing:<uuid>:v<n>`), shared OPAQUE. */
export const DEVICE_ASSET_RECORD_SIGNER_REF_PATTERN_V1 = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
/** RFC 3339 UTC to the second, the only form the desktop signs. */
export const DEVICE_ASSET_RECORD_READ_AT_PATTERN_V1 = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/;
export const DEVICE_ASSET_RECORD_DIGEST_PATTERN_V1 = /^sha256:[0-9a-f]{64}$/;

/** The six facts, each `null` when the system did not report it. */
export interface DeviceAssetRecordFieldsV1 {
  serialNumber: string | null;
  batteryCycleCount: number | null;
  batteryDesignCapacity: number | null;
  batteryFullChargeCapacity: number | null;
  /** Set exactly when one of the two capacities is. */
  batteryCapacityUnit: DeviceAssetRecordCapacityUnitV1 | null;
  batteryMaximumCapacityPercent: number | null;
}
/** `POST items/:assetRef/device-record`. */
export interface DeviceAssetRecordUploadV1 {
  /** This computer's device id: one of the owner's own active registered devices. */
  deviceId: string;
  /** The owner's current E32 signing credential of that device. */
  signerRef: string;
  readAt: string;
  fields: DeviceAssetRecordFieldsV1;
  signature: string;
}
/** What the ledger shows: which computer signed, when it read, when it was handed in, and the digest. No figures. */
export interface DeviceAssetRecordSummaryV1 {
  deviceRef: string;
  readAt: string;
  receivedAt: string;
  digest: string;
}
export interface DeviceAssetRecordViewV1 {
  schemaVersion: 1;
  record: DeviceAssetRecordSummaryV1 | null;
}

export function deviceAssetRecordPathV1(assetRef: string): string {
  return `${deviceAssetPathV1(assetRef)}/device-record`;
}

/** `sha256:` + lowercase hex of the SHA-256 of the canonical JSON of the six fields (keys sorted, no whitespace). */
export function deviceAssetRecordDigestV1(fields: DeviceAssetRecordFieldsV1): string {
  const exact: DeviceAssetRecordFieldsV1 = {
    serialNumber: fields.serialNumber,
    batteryCycleCount: fields.batteryCycleCount,
    batteryDesignCapacity: fields.batteryDesignCapacity,
    batteryFullChargeCapacity: fields.batteryFullChargeCapacity,
    batteryCapacityUnit: fields.batteryCapacityUnit,
    batteryMaximumCapacityPercent: fields.batteryMaximumCapacityPercent,
  };
  return `sha256:${sha256Hex(canonicalize(exact))}`;
}

/** What the device key signs: five lines (domain, device, item, digest, readAt), `\n`, no trailing newline. */
export function deviceAssetRecordMessageV1(input: { deviceId: string; assetRef: string; digest: string; readAt: string }): string {
  return [DEVICE_ASSET_RECORD_DOMAIN_V1, input.deviceId, input.assetRef, input.digest, input.readAt].join('\n');
}

const RECORD_COUNT: Check = S.nullable(S.int(0, DEVICE_ASSET_RECORD_LIMITS_V1.cycleCountMax));
const RECORD_CAPACITY: Check = S.nullable(S.int(1, DEVICE_ASSET_RECORD_LIMITS_V1.capacityMax));
/** The fields exactly: a serial number of the ledger's own pattern (trimmed), whole numbers in range, a unit iff a capacity. */
export function isDeviceAssetRecordFieldsV1(value: unknown): value is DeviceAssetRecordFieldsV1 {
  const shape = S.object({
    serialNumber: S.nullable((v) => typeof v === 'string' && v.trim() === v && DEVICE_ASSET_SERIAL_NUMBER_PATTERN_V1.test(v)),
    batteryCycleCount: RECORD_COUNT,
    batteryDesignCapacity: RECORD_CAPACITY,
    batteryFullChargeCapacity: RECORD_CAPACITY,
    batteryCapacityUnit: S.nullable(S.oneOf(DEVICE_ASSET_RECORD_CAPACITY_UNITS_V1)),
    batteryMaximumCapacityPercent: S.nullable(S.int(1, DEVICE_ASSET_RECORD_LIMITS_V1.percentMax)),
  });
  if (!shape(value)) return false;
  const fields = value as DeviceAssetRecordFieldsV1;
  const hasCapacity = fields.batteryDesignCapacity !== null || fields.batteryFullChargeCapacity !== null;
  return hasCapacity === (fields.batteryCapacityUnit !== null);
}

export type DeviceAssetRecordUploadResultV1 = { ok: true; value: DeviceAssetRecordUploadV1 } | { ok: false; code: 'invalid_input'; field: string };

/** The server's check of an upload's shape and time (who owns the device and whether the signature holds are its own checks). */
export function validateDeviceAssetRecordUploadV1(value: unknown, now: Date = new Date()): DeviceAssetRecordUploadResultV1 {
  const bad = (field: string): DeviceAssetRecordUploadResultV1 => ({ ok: false, code: 'invalid_input', field });
  if (!isRecord(value)) return bad('$');
  const field = exactKeysFailure(value, {
    deviceId: S.pattern(DEVICE_ASSET_LINKED_DEVICE_REF_PATTERN_V1),
    signerRef: S.pattern(DEVICE_ASSET_RECORD_SIGNER_REF_PATTERN_V1),
    readAt: S.pattern(DEVICE_ASSET_RECORD_READ_AT_PATTERN_V1),
    fields: (v) => isDeviceAssetRecordFieldsV1(v),
    signature: S.pattern(DEVICE_ASSET_RECORD_SIGNATURE_PATTERN_V1),
  });
  if (field !== null) return bad(field);
  const readAt = Date.parse(value.readAt as string);
  if (!Number.isFinite(readAt) || new Date(readAt).toISOString().slice(0, 19) !== (value.readAt as string).slice(0, 19)) return bad('readAt');
  if (readAt > now.getTime() + DEVICE_ASSET_RECORD_LIMITS_V1.readAtFutureSkewMs || readAt < now.getTime() - DEVICE_ASSET_RECORD_LIMITS_V1.readAtMaxAgeMs) return bad('readAt');
  const fields = value.fields as DeviceAssetRecordFieldsV1;
  return {
    ok: true,
    value: {
      deviceId: value.deviceId as string,
      signerRef: value.signerRef as string,
      readAt: value.readAt as string,
      fields: {
        serialNumber: fields.serialNumber,
        batteryCycleCount: fields.batteryCycleCount,
        batteryDesignCapacity: fields.batteryDesignCapacity,
        batteryFullChargeCapacity: fields.batteryFullChargeCapacity,
        batteryCapacityUnit: fields.batteryCapacityUnit,
        batteryMaximumCapacityPercent: fields.batteryMaximumCapacityPercent,
      },
      signature: value.signature as string,
    },
  };
}

const DEVICE_ASSET_RECORD_SUMMARY: Check = S.object({
  deviceRef: S.pattern(DEVICE_ASSET_LINKED_DEVICE_REF_PATTERN_V1),
  readAt: S.isoTime,
  receivedAt: S.isoTime,
  digest: S.pattern(DEVICE_ASSET_RECORD_DIGEST_PATTERN_V1),
});

/** `GET` / `POST items/:assetRef/device-record`. */
export function decodeDeviceAssetRecordViewV1(body: unknown): DeviceAssetsDecodeResultV1<DeviceAssetRecordViewV1> {
  return decodeExact<DeviceAssetRecordViewV1>(body, { schemaVersion: S.literal(1), record: S.nullable(DEVICE_ASSET_RECORD_SUMMARY) });
}
