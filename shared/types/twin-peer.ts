/**
 * L9 P1-3a 同行名单（信得过名单）：A 的主人列出自己信得过的同行，每条有擅长、区域、价格带。
 *
 * 硬规则（target-l9 3.2 规则 0）：
 * - **B 先同意才能被列入、被提及。**A 发一个邀请链接，B 打开后在页面上直接同意（不需要账号），记同意时间和文案版本。
 *   没有同意（`invited`）、撤回（`revoked`）、被 A 移除（`removed`）的人，名单读取函数一律不返回，分身不提、`people_find` 不出。
 * - **撤回立即生效。**撤回把条目清成空壳：擅长、区域、价格带、联系方式全部清掉，之后所有读取都看不到。
 * - 档期和响应时间只来自 B 自己公开的名片或日历；没有就不报。本版没有可读的来源，所以 `availability` 恒为 `null`。
 * - 分身不替 B 报档期、不承诺回复多久、不替 B 或 A 说价格。`priceBand` 只在主人自己的名单页给主人看，不对访客说。
 *
 * 开关：`PEER_LIST_V1_ENABLED`（只认精确的 `'1'`，默认关）；分身提转介另有 `TWIN_REFERRAL_OFFER_V1_ENABLED`。
 * 主人侧入口再受 P1-0 名单（`L9_COHORT_USER_IDS`）约束；B 的邀请页、同意、撤回只受 `PEER_LIST_V1_ENABLED` 约束，
 * 因为它们只处理名单内主人建出来的条目，且撤回永远不能被名单挡住。
 * 解码函数拒收未知字段，失败时给原因码和字段名，不抛异常。
 */
import {
  INTRODUCTION_NEED_CATEGORIES_V1,
  INTRODUCTION_NEED_REGIONS_V1,
  normalizeIntroductionContactV1,
  type IntroductionContactKindV1,
  type IntroductionContactV1,
  type IntroductionNeedCategoryV1,
  type IntroductionNeedRegionV1,
} from './introduction';

export const TWIN_PEER_SCHEMA_VERSION_V1 = 1 as const;
export const PEER_LIST_FLAG_V1 = 'PEER_LIST_V1_ENABLED';
export const TWIN_REFERRAL_OFFER_FLAG_V1 = 'TWIN_REFERRAL_OFFER_V1_ENABLED';

/** B 同意的文案版本。改了文案就换这个字符串，旧同意不自动算新文案。 */
export const TWIN_PEER_CONSENT_VERSION_V1 = '2026-10-31.2';
export const TWIN_PEER_CONSENT_COPY_V1 = {
  'zh-CN': '我同意让这位同行把我列入邀请人信得过的名单：当邀请人接不了某位客户时，邀请人的 AI 分身可以向客户提到我的姓名和擅长的科目，并在客户同意后请我看这位客户的需求。我随时可以在这个页面撤回，撤回后立即不再被提及。',
  en: 'I agree to be listed on this person’s trusted list: when they cannot take a client, their AI twin may mention my name and what I do to that client, and ask me to look at the client’s request once the client agrees. I can withdraw on this page at any time, and from then on I will not be mentioned.',
} as const;

export const TWIN_PEER_STATUSES_V1 = ['invited', 'listed', 'revoked', 'removed'] as const;
export type TwinPeerStatusV1 = (typeof TWIN_PEER_STATUSES_V1)[number];

export const TWIN_PEER_PRICE_BANDS_V1 = ['budget', 'standard', 'premium'] as const;
export type TwinPeerPriceBandV1 = (typeof TWIN_PEER_PRICE_BANDS_V1)[number];

export const TWIN_PEER_LIMITS_V1 = {
  displayNameMax: 100,
  categoriesMax: 3,
  subjectsMax: 5,
  subjectMax: 30,
  regionsMax: 3,
  /** 每位主人名单里未移除的条目上限。 */
  entriesPerOwnerMax: 50,
  /** 邀请链接在 B 还没同意之前的有效期；B 同意之后，撤回入口不再过期。 */
  inviteDays: 30,
  /** 每令牌每分钟、每网络地址每分钟（同 introduction 的免登录规则）。 */
  tokenPerMinute: 30,
  ipPerMinute: 60,
  consentPerIpPerHour: 10,
} as const;

/** 免登录邀请令牌：32 字节随机的 base64url，43 个字符。格式不对的直接当作不存在。 */
export const TWIN_PEER_TOKEN_PATTERN_V1 = /^[A-Za-z0-9_-]{43}$/;

export const TWIN_PEER_REASON_CODES_V1 = [
  'unsupported_schema_version',
  'unknown_field',
  'missing_field',
  'invalid_type',
  'invalid_value',
  'contact_invalid_email',
  'contact_invalid_phone',
  'consent_version_mismatch',
] as const;
export type TwinPeerReasonCodeV1 = (typeof TWIN_PEER_REASON_CODES_V1)[number];
export type TwinPeerDecodeResultV1<T> = { ok: true; value: T } | { ok: false; reasonCode: TwinPeerReasonCodeV1; field: string };

/** 名单里的一位同行，分身和工具能读到的全部字段。没有联系方式、没有档期、没有价格。 */
export interface TwinPeerListedV1 {
  peerId: string;
  displayName: string;
  categories: IntroductionNeedCategoryV1[];
  subjects: string[];
  regions: IntroductionNeedRegionV1[];
  /** 档期和响应时间只来自 B 公开的名片或日历；本版没有来源，恒为 null。 */
  availability: null;
}

/** 给主人看的一条。不含令牌、不含联系方式的值，只说有没有留联系方式。 */
export interface TwinPeerEntryViewV1 {
  schemaVersion: typeof TWIN_PEER_SCHEMA_VERSION_V1;
  id: string;
  displayName: string;
  categories: IntroductionNeedCategoryV1[];
  subjects: string[];
  regions: IntroductionNeedRegionV1[];
  priceBand: TwinPeerPriceBandV1 | null;
  status: TwinPeerStatusV1;
  hasContact: boolean;
  contactKind: IntroductionContactKindV1 | null;
  consentAt: string | null;
  consentVersion: string | null;
  inviteExpiresAt: string | null;
  createdAt: string;
}

/** B 在邀请页上看到的：A 的名字，以及 A 想把 B 列成什么样。已撤回的只剩状态。 */
export interface TwinPeerInviteViewV1 {
  schemaVersion: typeof TWIN_PEER_SCHEMA_VERSION_V1;
  status: 'invited' | 'listed' | 'revoked';
  ownerDisplayName: string | null;
  listing: { displayName: string; categories: IntroductionNeedCategoryV1[]; subjects: string[]; regions: IntroductionNeedRegionV1[] } | null;
  consentVersion: string;
  consentCopy: typeof TWIN_PEER_CONSENT_COPY_V1;
}

export interface TwinPeerSettingsV1 {
  schemaVersion: typeof TWIN_PEER_SCHEMA_VERSION_V1;
  /** 满额或不对口时，允许分身向访客提出转介（默认关）。 */
  referralOfferEnabled: boolean;
  /** 「这段时间满额」一键开关（默认关）。 */
  capacityFull: boolean;
}

export interface TwinPeerCreateCommandV1 {
  schemaVersion: typeof TWIN_PEER_SCHEMA_VERSION_V1;
  displayName: string;
  categories: IntroductionNeedCategoryV1[];
  subjects: string[];
  regions: IntroductionNeedRegionV1[];
  priceBand: TwinPeerPriceBandV1 | null;
  /** B 的联系方式（可不填），封存存储，只用来在 A 批准转介后通知 B。 */
  contact: IntroductionContactV1 | null;
}

export type TwinPeerUpdateCommandV1 = Partial<Pick<TwinPeerCreateCommandV1, 'displayName' | 'categories' | 'subjects' | 'regions' | 'priceBand'>> & {
  schemaVersion: typeof TWIN_PEER_SCHEMA_VERSION_V1;
};

/** 免登录命令：令牌放请求体，不进网址、不进访问日志。 */
export interface TwinPeerTokenCommandV1 {
  schemaVersion: typeof TWIN_PEER_SCHEMA_VERSION_V1;
  token: string;
}

export interface TwinPeerConsentCommandV1 extends TwinPeerTokenCommandV1 {
  consentVersion: string;
}

// ── 解码 ────────────────────────────────────────────────────────────────────────────

type Failure = { ok: false; reasonCode: TwinPeerReasonCodeV1; field: string };
const CONTROL = /[\u0000-\u001f\u007f]/;
const OPAQUE_ID_OR_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function fail(reasonCode: TwinPeerReasonCodeV1, field: string): Failure {
  return { ok: false, reasonCode, field };
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
/** `envelope` 只放行只含允许字段的记录，所以放行的记录里不会有 `ok` 键；带 `ok: false` 的就是失败。 */
function isFailure(value: Failure | Record<string, unknown>): value is Failure {
  return value.ok === false && typeof value.reasonCode === 'string';
}
function envelope(value: unknown, allowed: readonly string[], required: readonly string[]): Failure | Record<string, unknown> {
  if (!isRecord(value)) return fail('invalid_type', '$');
  if (value.schemaVersion === undefined) return fail('missing_field', 'schemaVersion');
  if (typeof value.schemaVersion !== 'number') return fail('invalid_type', 'schemaVersion');
  if (value.schemaVersion !== TWIN_PEER_SCHEMA_VERSION_V1) return fail('unsupported_schema_version', 'schemaVersion');
  for (const key of Object.keys(value)) if (key !== 'schemaVersion' && !allowed.includes(key)) return fail('unknown_field', key);
  for (const key of required) if (value[key] === undefined) return fail('missing_field', key);
  return value;
}
function text(value: unknown, field: string, max: number): TwinPeerDecodeResultV1<string> {
  if (typeof value !== 'string') return fail('invalid_type', field);
  const trimmed = value.replace(/\s+/g, ' ').trim();
  if (trimmed.length === 0 || Array.from(trimmed).length > max || CONTROL.test(trimmed)) return fail('invalid_value', field);
  return { ok: true, value: trimmed };
}
function enumList<T extends string>(value: unknown, field: string, list: readonly T[], min: number, max: number): TwinPeerDecodeResultV1<T[]> {
  if (!Array.isArray(value)) return fail('invalid_type', field);
  if (value.length < min || value.length > max) return fail('invalid_value', field);
  const out: T[] = [];
  for (const item of value) {
    if (typeof item !== 'string' || !(list as readonly string[]).includes(item)) return fail('invalid_value', field);
    if (!out.includes(item as T)) out.push(item as T);
  }
  return { ok: true, value: out };
}
function subjectList(value: unknown, field: string): TwinPeerDecodeResultV1<string[]> {
  if (!Array.isArray(value)) return fail('invalid_type', field);
  if (value.length > TWIN_PEER_LIMITS_V1.subjectsMax) return fail('invalid_value', field);
  const out: string[] = [];
  for (const item of value) {
    const one = text(item, field, TWIN_PEER_LIMITS_V1.subjectMax);
    if (one.ok === false) return one;
    if (!out.includes(one.value)) out.push(one.value);
  }
  return { ok: true, value: out };
}
function priceBand(value: unknown, field: string): TwinPeerDecodeResultV1<TwinPeerPriceBandV1 | null> {
  if (value === null) return { ok: true, value: null };
  if (typeof value !== 'string') return fail('invalid_type', field);
  if (!(TWIN_PEER_PRICE_BANDS_V1 as readonly string[]).includes(value)) return fail('invalid_value', field);
  return { ok: true, value: value as TwinPeerPriceBandV1 };
}

export function decodeTwinPeerCreateCommandV1(value: unknown): TwinPeerDecodeResultV1<TwinPeerCreateCommandV1> {
  const rec = envelope(value, ['displayName', 'categories', 'subjects', 'regions', 'priceBand', 'contact'], ['displayName', 'categories']);
  if (isFailure(rec)) return rec;
  const displayName = text(rec.displayName, 'displayName', TWIN_PEER_LIMITS_V1.displayNameMax);
  if (displayName.ok === false) return displayName;
  const categories = enumList(rec.categories, 'categories', INTRODUCTION_NEED_CATEGORIES_V1, 1, TWIN_PEER_LIMITS_V1.categoriesMax);
  if (categories.ok === false) return categories;
  const subjects = subjectList(rec.subjects ?? [], 'subjects');
  if (subjects.ok === false) return subjects;
  const regions = enumList(rec.regions ?? [], 'regions', INTRODUCTION_NEED_REGIONS_V1, 0, TWIN_PEER_LIMITS_V1.regionsMax);
  if (regions.ok === false) return regions;
  const band = priceBand(rec.priceBand ?? null, 'priceBand');
  if (band.ok === false) return band;
  let contact: IntroductionContactV1 | null = null;
  if (rec.contact !== undefined && rec.contact !== null) {
    if (!isRecord(rec.contact)) return fail('invalid_type', 'contact');
    for (const key of Object.keys(rec.contact)) if (key !== 'kind' && key !== 'value') return fail('unknown_field', `contact.${key}`);
    const normalized = normalizeIntroductionContactV1(rec.contact.kind, rec.contact.value, 'contact');
    if (normalized.ok === false) return fail(normalized.reasonCode === 'contact_invalid_email' || normalized.reasonCode === 'contact_invalid_phone' ? normalized.reasonCode : 'invalid_value', normalized.field);
    contact = normalized.value;
  }
  return {
    ok: true,
    value: { schemaVersion: TWIN_PEER_SCHEMA_VERSION_V1, displayName: displayName.value, categories: categories.value, subjects: subjects.value, regions: regions.value, priceBand: band.value, contact },
  };
}

export function decodeTwinPeerUpdateCommandV1(value: unknown): TwinPeerDecodeResultV1<TwinPeerUpdateCommandV1> {
  const rec = envelope(value, ['displayName', 'categories', 'subjects', 'regions', 'priceBand'], []);
  if (isFailure(rec)) return rec;
  const out: TwinPeerUpdateCommandV1 = { schemaVersion: TWIN_PEER_SCHEMA_VERSION_V1 };
  if (rec.displayName !== undefined) {
    const displayName = text(rec.displayName, 'displayName', TWIN_PEER_LIMITS_V1.displayNameMax);
    if (displayName.ok === false) return displayName;
    out.displayName = displayName.value;
  }
  if (rec.categories !== undefined) {
    const categories = enumList(rec.categories, 'categories', INTRODUCTION_NEED_CATEGORIES_V1, 1, TWIN_PEER_LIMITS_V1.categoriesMax);
    if (categories.ok === false) return categories;
    out.categories = categories.value;
  }
  if (rec.subjects !== undefined) {
    const subjects = subjectList(rec.subjects, 'subjects');
    if (subjects.ok === false) return subjects;
    out.subjects = subjects.value;
  }
  if (rec.regions !== undefined) {
    const regions = enumList(rec.regions, 'regions', INTRODUCTION_NEED_REGIONS_V1, 0, TWIN_PEER_LIMITS_V1.regionsMax);
    if (regions.ok === false) return regions;
    out.regions = regions.value;
  }
  if (rec.priceBand !== undefined) {
    const band = priceBand(rec.priceBand, 'priceBand');
    if (band.ok === false) return band;
    out.priceBand = band.value;
  }
  if (Object.keys(out).length === 1) return fail('missing_field', '$');
  return { ok: true, value: out };
}

function tokenOf(rec: Record<string, unknown>): TwinPeerDecodeResultV1<string> {
  if (typeof rec.token !== 'string') return fail('invalid_type', 'token');
  if (!TWIN_PEER_TOKEN_PATTERN_V1.test(rec.token)) return fail('invalid_value', 'token');
  return { ok: true, value: rec.token };
}

export function decodeTwinPeerTokenCommandV1(value: unknown): TwinPeerDecodeResultV1<TwinPeerTokenCommandV1> {
  const rec = envelope(value, ['token'], ['token']);
  if (isFailure(rec)) return rec;
  const token = tokenOf(rec);
  if (token.ok === false) return token;
  return { ok: true, value: { schemaVersion: TWIN_PEER_SCHEMA_VERSION_V1, token: token.value } };
}

export function decodeTwinPeerConsentCommandV1(value: unknown): TwinPeerDecodeResultV1<TwinPeerConsentCommandV1> {
  const rec = envelope(value, ['token', 'consentVersion'], ['token', 'consentVersion']);
  if (isFailure(rec)) return rec;
  const token = tokenOf(rec);
  if (token.ok === false) return token;
  if (typeof rec.consentVersion !== 'string') return fail('invalid_type', 'consentVersion');
  if (rec.consentVersion !== TWIN_PEER_CONSENT_VERSION_V1) return fail('consent_version_mismatch', 'consentVersion');
  return { ok: true, value: { schemaVersion: TWIN_PEER_SCHEMA_VERSION_V1, token: token.value, consentVersion: rec.consentVersion } };
}

export function decodeTwinPeerSettingsV1(value: unknown): TwinPeerDecodeResultV1<TwinPeerSettingsV1> {
  const rec = envelope(value, ['referralOfferEnabled', 'capacityFull'], ['referralOfferEnabled', 'capacityFull']);
  if (isFailure(rec)) return rec;
  if (typeof rec.referralOfferEnabled !== 'boolean') return fail('invalid_type', 'referralOfferEnabled');
  if (typeof rec.capacityFull !== 'boolean') return fail('invalid_type', 'capacityFull');
  return { ok: true, value: { schemaVersion: TWIN_PEER_SCHEMA_VERSION_V1, referralOfferEnabled: rec.referralOfferEnabled, capacityFull: rec.capacityFull } };
}

export function isTwinPeerId(value: unknown): value is string {
  return typeof value === 'string' && OPAQUE_ID_OR_UUID.test(value);
}

/** 校验服务端发来的主人侧条目视图（网页用）。 */
export function decodeTwinPeerEntryViewV1(value: unknown): TwinPeerDecodeResultV1<TwinPeerEntryViewV1> {
  if (!isRecord(value)) return fail('invalid_type', '$');
  const keys = ['id', 'displayName', 'categories', 'subjects', 'regions', 'priceBand', 'status', 'hasContact', 'contactKind', 'consentAt', 'consentVersion', 'inviteExpiresAt', 'createdAt'];
  const rec = envelope(value, keys, keys);
  if (isFailure(rec)) return rec;
  if (!isTwinPeerId(rec.id)) return fail('invalid_value', 'id');
  const displayName = text(rec.displayName, 'displayName', TWIN_PEER_LIMITS_V1.displayNameMax);
  if (displayName.ok === false) return displayName;
  const categories = enumList(rec.categories, 'categories', INTRODUCTION_NEED_CATEGORIES_V1, 0, TWIN_PEER_LIMITS_V1.categoriesMax);
  if (categories.ok === false) return categories;
  const subjects = subjectList(rec.subjects, 'subjects');
  if (subjects.ok === false) return subjects;
  const regions = enumList(rec.regions, 'regions', INTRODUCTION_NEED_REGIONS_V1, 0, TWIN_PEER_LIMITS_V1.regionsMax);
  if (regions.ok === false) return regions;
  const band = priceBand(rec.priceBand, 'priceBand');
  if (band.ok === false) return band;
  if (typeof rec.status !== 'string' || !(TWIN_PEER_STATUSES_V1 as readonly string[]).includes(rec.status)) return fail('invalid_value', 'status');
  if (typeof rec.hasContact !== 'boolean') return fail('invalid_type', 'hasContact');
  if (rec.contactKind !== null && rec.contactKind !== 'email' && rec.contactKind !== 'phone') return fail('invalid_value', 'contactKind');
  for (const key of ['consentAt', 'consentVersion', 'inviteExpiresAt']) if (rec[key] !== null && typeof rec[key] !== 'string') return fail('invalid_type', key);
  if (typeof rec.createdAt !== 'string') return fail('invalid_type', 'createdAt');
  return {
    ok: true,
    value: {
      schemaVersion: TWIN_PEER_SCHEMA_VERSION_V1,
      id: rec.id,
      displayName: displayName.value,
      categories: categories.value,
      subjects: subjects.value,
      regions: regions.value,
      priceBand: band.value,
      status: rec.status as TwinPeerStatusV1,
      hasContact: rec.hasContact,
      contactKind: rec.contactKind as IntroductionContactKindV1 | null,
      consentAt: rec.consentAt as string | null,
      consentVersion: rec.consentVersion as string | null,
      inviteExpiresAt: rec.inviteExpiresAt as string | null,
      createdAt: rec.createdAt,
    },
  };
}

/** 校验邀请页视图（B 的网页用）。已撤回的 `listing` 必须为 null。 */
export function decodeTwinPeerInviteViewV1(value: unknown): TwinPeerDecodeResultV1<TwinPeerInviteViewV1> {
  const keys = ['status', 'ownerDisplayName', 'listing', 'consentVersion', 'consentCopy'];
  const rec = envelope(value, keys, keys);
  if (isFailure(rec)) return rec;
  if (rec.status !== 'invited' && rec.status !== 'listed' && rec.status !== 'revoked') return fail('invalid_value', 'status');
  if (rec.ownerDisplayName !== null && typeof rec.ownerDisplayName !== 'string') return fail('invalid_type', 'ownerDisplayName');
  if (typeof rec.consentVersion !== 'string') return fail('invalid_type', 'consentVersion');
  let listing: TwinPeerInviteViewV1['listing'] = null;
  if (rec.listing !== null) {
    if (!isRecord(rec.listing)) return fail('invalid_type', 'listing');
    const displayName = text(rec.listing.displayName, 'listing.displayName', TWIN_PEER_LIMITS_V1.displayNameMax);
    if (displayName.ok === false) return displayName;
    const categories = enumList(rec.listing.categories, 'listing.categories', INTRODUCTION_NEED_CATEGORIES_V1, 0, TWIN_PEER_LIMITS_V1.categoriesMax);
    if (categories.ok === false) return categories;
    const subjects = subjectList(rec.listing.subjects, 'listing.subjects');
    if (subjects.ok === false) return subjects;
    const regions = enumList(rec.listing.regions, 'listing.regions', INTRODUCTION_NEED_REGIONS_V1, 0, TWIN_PEER_LIMITS_V1.regionsMax);
    if (regions.ok === false) return regions;
    listing = { displayName: displayName.value, categories: categories.value, subjects: subjects.value, regions: regions.value };
  }
  if (rec.status === 'revoked' && listing !== null) return fail('invalid_value', 'listing');
  return {
    ok: true,
    value: {
      schemaVersion: TWIN_PEER_SCHEMA_VERSION_V1,
      status: rec.status,
      ownerDisplayName: rec.ownerDisplayName as string | null,
      listing,
      consentVersion: rec.consentVersion,
      consentCopy: TWIN_PEER_CONSENT_COPY_V1,
    },
  };
}

export function decodeTwinPeerSettingsViewV1(value: unknown): TwinPeerDecodeResultV1<TwinPeerSettingsV1> {
  return decodeTwinPeerSettingsV1(value);
}
