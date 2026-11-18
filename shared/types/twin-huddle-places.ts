/**
 * 「一起定去哪」v0 的合同（设计 `.agents/tasks/twin-social-net/places-design.md`）。
 *
 * 商量单（`twin-huddle.ts`）上除了时间，再摆几个候选地点。地点来自人，不接外部店铺数据：
 * - 发起人最多填 3 个，每位在站内被约的人最多填 1 个。店名是这里唯一的自由文字，要过 `twinPrechatTextViolationsV0`
 *   （不许有钱数、联系方式、门牌地址、链接）：写店名就行。
 * - 只有被约的人标「这家我可以」；分身不替任何人标。每家只显示几位可以，不显示是谁。
 * - 发起人从候选里定一个，也可以不定。
 * - 只在商量单「收时间」和「等发起人选时间」两个阶段能改；发起人一选时间就定死，大家确认来不来时看到的地点不再变。
 * - 走链接的人这一版看不到地点；「每周固定」开出来的单不带地点。
 *
 * 开关只认精确的 `'1'`，还要商量的开关开着。关着时路由 404，商量和原来一模一样。
 */
import { TWIN_HUDDLE_ID_PATTERN_V0, TWIN_HUDDLE_LIMITS_V0, type TwinHuddleDecodeResultV0, type TwinHuddleReasonCodeV0, type TwinHuddleStatusV0 } from './twin-huddle';
import { twinPrechatTextViolationsV0 } from './twin-prechat';

export const TWIN_HUDDLE_PLACES_SCHEMA_VERSION_V0 = 'agentrix.twin-huddle-places.v0' as const;
export const TWIN_HUDDLE_PLACES_FLAG_V0 = 'TWIN_HUDDLE_PLACES_V0_ENABLED';
export const TWIN_HUDDLE_PLACES_MOBILE_FLAG_V0 = 'EXPO_PUBLIC_TWIN_HUDDLE_PLACES';

export const TWIN_HUDDLE_PLACES_LIMITS_V0 = {
  /** 发起人最多填几个。 */
  initiatorMax: 3,
  /** 每位被约的人最多填几个。 */
  invitedMax: 1,
  labelMin: 2,
  labelMax: 30,
} as const;

const L = TWIN_HUDDLE_PLACES_LIMITS_V0;

/** 一张单上最多有几个候选地点。 */
export const TWIN_HUDDLE_PLACES_TOTAL_MAX_V0 = L.initiatorMax + TWIN_HUDDLE_LIMITS_V0.friendsMax * L.invitedMax;

export const TWIN_HUDDLE_PLACE_ROLES_V0 = ['initiator', 'invited'] as const;
export type TwinHuddlePlaceRoleV0 = (typeof TWIN_HUDDLE_PLACE_ROLES_V0)[number];

/** 谁填的，从看的人的角度：我、发起人、另一位被约的人。被约的人不知道「另一位」是谁。 */
export const TWIN_HUDDLE_PLACE_SOURCES_V0 = ['me', 'initiator', 'friend'] as const;
export type TwinHuddlePlaceSourceV0 = (typeof TWIN_HUDDLE_PLACE_SOURCES_V0)[number];

/** 请求本身没问题、但现在做不了的原因（409 的 `code`）。 */
export const TWIN_HUDDLE_PLACE_CONFLICT_CODES_V0 = ['places_closed', 'place_limit', 'duplicate_place', 'place_chosen', 'place_gone'] as const;
export type TwinHuddlePlaceConflictCodeV0 = (typeof TWIN_HUDDLE_PLACE_CONFLICT_CODES_V0)[number];

/** 地点还能不能改：只看商量单的阶段。过没过这一阶段的截止时间由服务端另外查。 */
export function twinHuddlePlacesOpenV0(status: TwinHuddleStatusV0): boolean {
  return status === 'collecting' || status === 'choosing';
}

export function twinHuddlePlaceQuotaV0(role: TwinHuddlePlaceRoleV0): number {
  return role === 'initiator' ? L.initiatorMax : L.invitedMax;
}

/** 两个店名算不算同一个：全角半角、大小写、空白都不算区别。 */
export function twinHuddlePlaceKeyV0(label: string): string {
  return label.normalize('NFKC').toLowerCase().replace(/\s+/g, '');
}

type Failure = { ok: false; reasonCode: TwinHuddleReasonCodeV0; field: string };

const CONTROL = /[\u0000-\u001f\u007f]/;

function fail(reasonCode: TwinHuddleReasonCodeV0, field: string): Failure {
  return { ok: false, reasonCode, field };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function only(value: unknown, key: string, field: string): TwinHuddleDecodeResultV0<unknown> {
  if (!isRecord(value)) return fail('invalid_type', field);
  for (const name of Object.keys(value)) if (name !== key) return fail('unknown_field', `${field}.${name}`);
  if (value[key] === undefined) return fail('missing_field', `${field}.${key}`);
  return { ok: true, value: value[key] };
}

function isPlaceId(value: unknown): value is string {
  return typeof value === 'string' && TWIN_HUDDLE_ID_PATTERN_V0.test(value);
}

/** `POST …/places` 的请求：`{ label }`。店名去掉首尾空白后 2–30 个字。 */
export function decodeTwinHuddlePlaceAddV0(value: unknown, field = 'body'): TwinHuddleDecodeResultV0<{ label: string }> {
  const inner = only(value, 'label', field);
  if (inner.ok === false) return inner;
  const at = `${field}.label`;
  if (typeof inner.value !== 'string') return fail('invalid_type', at);
  const label = inner.value.trim();
  const length = Array.from(label).length;
  if (length < L.labelMin || CONTROL.test(label)) return fail('invalid_value', at);
  if (length > L.labelMax) return fail('too_long', at);
  if (twinPrechatTextViolationsV0(label).length > 0) return fail('text_violation', at);
  return { ok: true, value: { label } };
}

/** `PUT …/places/picks` 的请求：`{ placeIds }`，我可以的那几家，整组替换；空数组就是一家都没标。 */
export function decodeTwinHuddlePlacePicksV0(value: unknown, field = 'body'): TwinHuddleDecodeResultV0<{ placeIds: string[] }> {
  const inner = only(value, 'placeIds', field);
  if (inner.ok === false) return inner;
  const at = `${field}.placeIds`;
  if (!Array.isArray(inner.value)) return fail('invalid_type', at);
  if (inner.value.length > TWIN_HUDDLE_PLACES_TOTAL_MAX_V0) return fail('too_long', at);
  const placeIds: string[] = [];
  for (const [index, item] of inner.value.entries()) {
    if (!isPlaceId(item)) return fail('invalid_value', `${at}[${index}]`);
    const id = item.toLowerCase();
    if (placeIds.includes(id)) return fail('invalid_value', `${at}[${index}]`);
    placeIds.push(id);
  }
  return { ok: true, value: { placeIds } };
}

/** `PUT …/places/chosen` 的请求：`{ placeId }`，定哪一个；`null` 是先不定。 */
export function decodeTwinHuddlePlaceChosenV0(value: unknown, field = 'body'): TwinHuddleDecodeResultV0<{ placeId: string | null }> {
  const inner = only(value, 'placeId', field);
  if (inner.ok === false) return inner;
  if (inner.value === null) return { ok: true, value: { placeId: null } };
  if (!isPlaceId(inner.value)) return fail(typeof inner.value === 'string' ? 'invalid_value' : 'invalid_type', `${field}.placeId`);
  return { ok: true, value: { placeId: inner.value.toLowerCase() } };
}

// ── 视图 ─────────────────────────────────────────────────────────────────────────

export interface TwinHuddlePlaceV0 {
  id: string;
  label: string;
  by: TwinHuddlePlaceSourceV0;
  /** 只给发起人：是哪位朋友填的（发起人自己名单里的 ref）。其余情况是 null。 */
  byRef: string | null;
  /** 几位被约的人标了「这家我可以」。 */
  okCount: number;
  /** 我标没标。发起人不标，永远是 false。 */
  ok: boolean;
  /** 发起人定下的那一个。 */
  chosen: boolean;
  canRemove: boolean;
}

export interface TwinHuddlePlacesViewV0 {
  schemaVersion: typeof TWIN_HUDDLE_PLACES_SCHEMA_VERSION_V0;
  huddleId: string;
  role: TwinHuddlePlaceRoleV0;
  /** 地点现在还能不能改。 */
  open: boolean;
  /** 按填的先后。 */
  places: TwinHuddlePlaceV0[];
  canAdd: boolean;
  canPick: boolean;
  canChoose: boolean;
}

/*
 * 下面的 decode…V0 只用来读服务器的回答：认识的字段逐个检查，多出来的字段不管，外面包一层 `{ data: … }` 也认。
 * 对不上就返回 null，调用方按「读不出来」处理。
 */

function isOneOf<T extends string>(list: readonly T[], value: unknown): value is T {
  return typeof value === 'string' && (list as readonly string[]).includes(value);
}

function readPlace(value: unknown): TwinHuddlePlaceV0 | null {
  if (!isRecord(value)) return null;
  const { id, label, by, byRef, okCount, ok, chosen, canRemove } = value;
  if (typeof id !== 'string' || typeof label !== 'string' || !isOneOf(TWIN_HUDDLE_PLACE_SOURCES_V0, by)) return null;
  if (byRef !== null && typeof byRef !== 'string') return null;
  if (typeof okCount !== 'number' || !Number.isInteger(okCount) || okCount < 0) return null;
  if (typeof ok !== 'boolean' || typeof chosen !== 'boolean' || typeof canRemove !== 'boolean') return null;
  return { id, label, by, byRef: typeof byRef === 'string' ? byRef : null, okCount, ok, chosen, canRemove };
}

export function decodeTwinHuddlePlacesViewV0(body: unknown): TwinHuddlePlacesViewV0 | null {
  const value = isRecord(body) && isRecord(body.data) && body.places === undefined ? body.data : body;
  if (!isRecord(value)) return null;
  const { huddleId, role, open, canAdd, canPick, canChoose } = value;
  if (value.schemaVersion !== TWIN_HUDDLE_PLACES_SCHEMA_VERSION_V0 || typeof huddleId !== 'string' || !isOneOf(TWIN_HUDDLE_PLACE_ROLES_V0, role)) return null;
  if (typeof open !== 'boolean' || typeof canAdd !== 'boolean' || typeof canPick !== 'boolean' || typeof canChoose !== 'boolean') return null;
  if (!Array.isArray(value.places)) return null;
  const places: TwinHuddlePlaceV0[] = [];
  for (const item of value.places) {
    const place = readPlace(item);
    if (place === null) return null;
    places.push(place);
  }
  if (places.filter((place) => place.chosen).length > 1) return null;
  return { schemaVersion: TWIN_HUDDLE_PLACES_SCHEMA_VERSION_V0, huddleId, role, open, places, canAdd, canPick, canChoose };
}
