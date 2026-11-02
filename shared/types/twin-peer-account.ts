/**
 * L9 P1-3a 同行名单，B 有账号时的一侧：B 在邀请页同意之后，登录状态下可以把这一条关联到自己的账号（凭邀请令牌，令牌放请求体），
 * 之后在设置里能看到「我在哪些人的名单里」，一键撤回，立即生效。
 *
 * 硬规则：
 * - 只有 B 本人、登录、凭邀请令牌、并且已经同意，才能关联；主人看不到 B 的账号；主人自己的账号不能当 B。
 * - 这些接口不受 P1-0 名单约束：B 常常不在名单里，撤回永远不能被挡。
 * - 撤回或被主人移除时，关联一起清掉（迁移 2203 的 CHECK 在数据库层兜底）。
 * - 视图里没有令牌、没有联系方式、没有价格带。
 *
 * 开关：`PEER_LIST_V1_ENABLED`（只认精确的 `'1'`，默认关）；网页 `NEXT_PUBLIC_PEER_LIST_ENABLED`。
 * 解码函数拒收未知字段，失败时给原因码和字段名，不抛异常。
 */
import { INTRODUCTION_NEED_CATEGORIES_V1, INTRODUCTION_NEED_REGIONS_V1, type IntroductionNeedCategoryV1, type IntroductionNeedRegionV1 } from './introduction';
import { TWIN_PEER_LIMITS_V1, TWIN_PEER_SCHEMA_VERSION_V1, isTwinPeerId, type TwinPeerDecodeResultV1 } from './twin-peer';

export const TWIN_PEER_ACCOUNT_ROUTES_V1 = {
  mine: '/peers/mine',
  link: '/peers/mine/link',
} as const;

export function twinPeerMineWithdrawPathV1(id: string): string {
  return `${TWIN_PEER_ACCOUNT_ROUTES_V1.mine}/${encodeURIComponent(id)}/withdraw`;
}

/** B 在设置里看到的一条：谁的名单、写的是什么、什么时候同意的。 */
export interface TwinPeerMembershipViewV1 {
  schemaVersion: typeof TWIN_PEER_SCHEMA_VERSION_V1;
  id: string;
  /** 名单主人的昵称；没有就是 null（页面写「一位同行」）。 */
  ownerDisplayName: string | null;
  /** `listed`：已同意，会被提到；`invited`：主人改了写法，要重新同意，之前不会被提到。 */
  status: 'invited' | 'listed';
  listing: { displayName: string; categories: IntroductionNeedCategoryV1[]; subjects: string[]; regions: IntroductionNeedRegionV1[] };
  consentAt: string | null;
}

type Failure = { ok: false; reasonCode: 'unsupported_schema_version' | 'unknown_field' | 'missing_field' | 'invalid_type' | 'invalid_value'; field: string };
const CONTROL = /[\u0000-\u001f\u007f]/;

function fail(reasonCode: Failure['reasonCode'], field: string): Failure {
  return { ok: false, reasonCode, field };
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function text(value: unknown, field: string, max: number): Failure | { ok: true; value: string } {
  if (typeof value !== 'string') return fail('invalid_type', field);
  const trimmed = value.replace(/\s+/g, ' ').trim();
  if (trimmed.length === 0 || Array.from(trimmed).length > max || CONTROL.test(trimmed)) return fail('invalid_value', field);
  return { ok: true, value: trimmed };
}
function enumList<T extends string>(value: unknown, field: string, list: readonly T[], max: number): Failure | { ok: true; value: T[] } {
  if (!Array.isArray(value) || value.length > max) return fail('invalid_value', field);
  const out: T[] = [];
  for (const item of value) {
    if (typeof item !== 'string' || !(list as readonly string[]).includes(item)) return fail('invalid_value', field);
    if (!out.includes(item as T)) out.push(item as T);
  }
  return { ok: true, value: out };
}
function subjectList(value: unknown, field: string): Failure | { ok: true; value: string[] } {
  if (!Array.isArray(value) || value.length > TWIN_PEER_LIMITS_V1.subjectsMax) return fail('invalid_value', field);
  const out: string[] = [];
  for (const item of value) {
    const one = text(item, field, TWIN_PEER_LIMITS_V1.subjectMax);
    if (one.ok === false) return one;
    if (!out.includes(one.value)) out.push(one.value);
  }
  return { ok: true, value: out };
}

export function decodeTwinPeerMembershipViewV1(value: unknown): TwinPeerDecodeResultV1<TwinPeerMembershipViewV1> {
  if (!isRecord(value)) return fail('invalid_type', '$');
  if (value.schemaVersion === undefined) return fail('missing_field', 'schemaVersion');
  if (value.schemaVersion !== TWIN_PEER_SCHEMA_VERSION_V1) return fail('unsupported_schema_version', 'schemaVersion');
  const keys = ['id', 'ownerDisplayName', 'status', 'listing', 'consentAt'];
  for (const key of Object.keys(value)) if (key !== 'schemaVersion' && !keys.includes(key)) return fail('unknown_field', key);
  for (const key of keys) if (value[key] === undefined) return fail('missing_field', key);
  if (!isTwinPeerId(value.id)) return fail('invalid_value', 'id');
  if (value.ownerDisplayName !== null && typeof value.ownerDisplayName !== 'string') return fail('invalid_type', 'ownerDisplayName');
  if (value.status !== 'invited' && value.status !== 'listed') return fail('invalid_value', 'status');
  if (!isRecord(value.listing)) return fail('invalid_type', 'listing');
  for (const key of Object.keys(value.listing)) if (!['displayName', 'categories', 'subjects', 'regions'].includes(key)) return fail('unknown_field', `listing.${key}`);
  const displayName = text(value.listing.displayName, 'listing.displayName', TWIN_PEER_LIMITS_V1.displayNameMax);
  if (displayName.ok === false) return displayName;
  const categories = enumList(value.listing.categories, 'listing.categories', INTRODUCTION_NEED_CATEGORIES_V1, TWIN_PEER_LIMITS_V1.categoriesMax);
  if (categories.ok === false) return categories;
  const subjects = subjectList(value.listing.subjects, 'listing.subjects');
  if (subjects.ok === false) return subjects;
  const regions = enumList(value.listing.regions, 'listing.regions', INTRODUCTION_NEED_REGIONS_V1, TWIN_PEER_LIMITS_V1.regionsMax);
  if (regions.ok === false) return regions;
  if (value.consentAt !== null && typeof value.consentAt !== 'string') return fail('invalid_type', 'consentAt');
  return {
    ok: true,
    value: {
      schemaVersion: TWIN_PEER_SCHEMA_VERSION_V1,
      id: value.id,
      ownerDisplayName: value.ownerDisplayName as string | null,
      status: value.status,
      listing: { displayName: displayName.value, categories: categories.value, subjects: subjects.value, regions: regions.value },
      consentAt: value.consentAt as string | null,
    },
  };
}
