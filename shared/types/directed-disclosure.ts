/**
 * 草案 v0（L8 第 3 批第 0 步，coord 10-20）：线 N 实现时可加字段，不可改语义。
 *
 * E2「定向披露」：主人把收货地址、证件、联系方式这类个人数据，经自己批准，直接送给一个指定的 https 接收方，
 * 数据不经过模型。Agent 只拿得到一个不透明的句柄：
 *
 * 1. Agent 调工具 `disclosure_request`（字段集合、目的地、目的）→ 返回 `disclosureRef` 和状态 `approval_required`。
 * 2. 主人在批准卡上看到字段名、目的地和目的，确认时走 step-up（`common/security/visibility-step-up.ts`）。
 * 3. 批准以后由服务端直接 POST 给目的地：正文是字段值，头里带一份 ES256 JWS 证明
 *    （头 `typ: disclosure-proof+jwt`，签名走 `PlatformJwsSignerPortV1`）。
 *    证明里有 `jti`、`iat`、`exp`（至多 5 分钟）、`aud`（目的地）、字段名集合的摘要和主人的化名。
 *    接收方要回同一个 `jti`；同一个 `jti` 至多投递一次；字段集合和批准时的不完全一致就不投。
 *
 * 所以这份合同里**没有任何地方放字段值**：工具结果只回 `DisclosureRequestResultV1`（句柄和状态），解码函数拒收其他字段。
 * 字段值只存在于 owner_disclosure_fields（A7 加密）和投递那一次的 POST 正文里。
 *
 * 开关：`DIRECTED_DISCLOSURE_V1_ENABLED`，只认精确的 `'1'`，默认关；关着时工具根本不注入。
 * 非生产的假接收端另有 `TEST_MERCHANT_V1_ENABLED`。
 * 解码函数拒收未知字段和错误类型，失败时给出 `reasonCode` 和出错的字段名，不抛异常。
 */
import { sha256Hex } from '../soul-core-l1/v1_1/canonical';

export const DISCLOSURE_SCHEMA_VERSION_V1 = 1 as const;

export const DIRECTED_DISCLOSURE_FLAG_V1 = 'DIRECTED_DISCLOSURE_V1_ENABLED';
export const TEST_MERCHANT_FLAG_V1 = 'TEST_MERCHANT_V1_ENABLED';

/** 主人的「可披露字段」：收货地址、证件（类型、号码）、联系方式（邮箱、电话）。 */
export const DISCLOSURE_FIELD_NAMES_V1 = ['shipping_address', 'id_document_type', 'id_document_number', 'contact_email', 'contact_phone'] as const;
export type DisclosureFieldNameV1 = (typeof DISCLOSURE_FIELD_NAMES_V1)[number];

export const DISCLOSURE_STATUSES_V1 = ['approval_required', 'approved', 'delivered', 'rejected', 'expired', 'failed'] as const;
export type DisclosureStatusV1 = (typeof DISCLOSURE_STATUSES_V1)[number];

/** 工具名和工具类别（`tool-registry`）。 */
export const DISCLOSURE_TOOL_NAME_V1 = 'disclosure_request';
export const DISCLOSURE_TOOL_CATEGORY_V1 = 'DISCLOSURE';

/** 投递证明的 JWS 头 `typ`。 */
export const DISCLOSURE_PROOF_TYP_V1 = 'disclosure-proof+jwt';

export const DISCLOSURE_LIMITS_V1 = {
  urlMax: 2048,
  purposeMax: 200,
  /** 证明的有效期上限（秒）：5 分钟。 */
  proofTtlSecondsMax: 300,
  /** 请求在批准前的有效期上限（秒）。 */
  requestTtlSecondsMax: 24 * 60 * 60,
} as const;

export const DISCLOSURE_REASON_CODES_V1 = [
  'unsupported_schema_version',
  'unknown_field',
  'missing_field',
  'invalid_type',
  'invalid_value',
  /** 字段集合和批准时的不一致（多一个、少一个都算）。 */
  'field_set_mismatch',
  /** 目的地不在登记的接收方里，或者指向内网，或者回了 3xx。 */
  'destination_not_allowed',
  'not_approved',
  /** 同一个 `jti` 已经投递过。 */
  'replayed',
  /** 主人开了锁定（A4 出网清单），工具被拦。 */
  'locked',
  /** 不存在，或者不是这个主人的（不区分，不给探测）。 */
  'not_found',
  /** 没有注册实现：默认拒绝。 */
  'port_unavailable',
  /** `DIRECTED_DISCLOSURE_V1_ENABLED` 没开。 */
  'feature_disabled',
] as const;
export type DisclosureReasonCodeV1 = (typeof DISCLOSURE_REASON_CODES_V1)[number];

export type DisclosureDecodeResultV1<T> =
  | { ok: true; value: T }
  | { ok: false; reasonCode: DisclosureReasonCodeV1; field: string };

/** Agent 调 `disclosure_request` 的参数。属主不在里面，由服务端从登录态取。 */
export interface DisclosureRequestInputV1 {
  schemaVersion: typeof DISCLOSURE_SCHEMA_VERSION_V1;
  /** 1 到 5 个，不重复；解码后按 `DISCLOSURE_FIELD_NAMES_V1` 的顺序排好。 */
  fields: DisclosureFieldNameV1[];
  /** 精确的 https 地址，要在登记过的接收方里（测试商户，或 R7 引荐回执里对方的地址）。 */
  destination: string;
  /** 给主人看的目的，1–200 字。 */
  purpose: string;
}

/** 工具结果：只有句柄和状态。没有字段值，也不许有。 */
export interface DisclosureRequestResultV1 {
  schemaVersion: typeof DISCLOSURE_SCHEMA_VERSION_V1;
  /** `disc_` + 32 位小写十六进制。 */
  disclosureRef: string;
  status: DisclosureStatusV1;
}

/** 投递证明的 JWS 载荷（claims）。 */
export interface DisclosureProofClaimsV1 {
  iss: string;
  /** 主人在这个接收方面前的化名，不是账户 id。 */
  sub: string;
  /** 目的地（精确的 https 地址）。 */
  aud: string;
  /** 一次性：同一个 `jti` 至多投递一次，接收方要回同一个值。 */
  jti: string;
  iat: number;
  exp: number;
  /** `disclosureFieldSetDigestV1` 的结果。 */
  fields_digest: string;
}

/** 接收方的回执：只带 `jti`。 */
export interface DisclosureReceiptV1 {
  schemaVersion: typeof DISCLOSURE_SCHEMA_VERSION_V1;
  jti: string;
}

// ── 字段集合 ─────────────────────────────────────────────────────────────────────────

/** 字段名集合的摘要：按固定顺序去重排好，用换行连起来做 SHA-256，前缀 `sha256:`。顺序不同、集合相同，摘要相同。 */
export function disclosureFieldSetDigestV1(fields: readonly DisclosureFieldNameV1[]): string {
  const sorted = DISCLOSURE_FIELD_NAMES_V1.filter((name) => fields.includes(name));
  return `sha256:${sha256Hex(sorted.join('\n'))}`;
}

/** 两个集合完全一样（不管顺序）。多一个、少一个、有重复都不算一样。 */
export function disclosureFieldSetsEqualV1(a: readonly string[], b: readonly string[]): boolean {
  if (new Set(a).size !== a.length || new Set(b).size !== b.length) return false;
  return a.length === b.length && a.every((name) => b.includes(name));
}

// ── 解码 ────────────────────────────────────────────────────────────────────────────

const HTTPS_URL = /^https:\/\/[A-Za-z0-9](?:[A-Za-z0-9.-]*[A-Za-z0-9])?(?::\d{1,5})?(?:\/[^\s#"<>\\^`{|}]*)?$/;
const DISCLOSURE_REF = /^disc_[0-9a-f]{32}$/;
const JTI = /^[A-Za-z0-9_-]{22,64}$/;
const PSEUDONYM = /^[A-Za-z0-9_-]{22,64}$/;
const DIGEST = /^sha256:[0-9a-f]{64}$/;
const CONTROL = /[\u0000-\u001f\u007f]/;

type Failure = { ok: false; reasonCode: DisclosureReasonCodeV1; field: string };

function fail(reasonCode: DisclosureReasonCodeV1, field: string): Failure {
  return { ok: false, reasonCode, field };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isOneOf<T extends string>(list: readonly T[], value: unknown): value is T {
  return typeof value === 'string' && (list as readonly string[]).includes(value);
}

/** https URL，没有账号密码、片段、`.` / `..` 段，也没有会破坏头部引号的字符。 */
function isHttpsUrl(value: unknown): value is string {
  if (typeof value !== 'string' || value.length > DISCLOSURE_LIMITS_V1.urlMax || !HTTPS_URL.test(value)) return false;
  const path = value.replace(/^https:\/\/[^/]*/, '').split('?')[0];
  return !/(?:^|\/)\.\.?(?:\/|$)/.test(path);
}

function checkEnvelope(value: Record<string, unknown>, allowed: readonly string[], required: readonly string[]): Failure | null {
  if (value.schemaVersion === undefined) return fail('missing_field', 'schemaVersion');
  if (typeof value.schemaVersion !== 'number') return fail('invalid_type', 'schemaVersion');
  if (value.schemaVersion !== DISCLOSURE_SCHEMA_VERSION_V1) return fail('unsupported_schema_version', 'schemaVersion');
  for (const key of Object.keys(value)) if (!allowed.includes(key)) return fail('unknown_field', key);
  for (const key of required) if (value[key] === undefined) return fail('missing_field', key);
  return null;
}

export function decodeDisclosureRequestInputV1(value: unknown): DisclosureDecodeResultV1<DisclosureRequestInputV1> {
  if (!isRecord(value)) return fail('invalid_type', '$');
  const bad = checkEnvelope(value, ['schemaVersion', 'fields', 'destination', 'purpose'], ['fields', 'destination', 'purpose']);
  if (bad) return bad;
  if (!Array.isArray(value.fields)) return fail('invalid_type', 'fields');
  const fields: unknown[] = value.fields;
  if (fields.length === 0 || fields.length > DISCLOSURE_FIELD_NAMES_V1.length) return fail('invalid_value', 'fields');
  for (const field of fields) {
    if (typeof field !== 'string') return fail('invalid_type', 'fields');
    if (!isOneOf(DISCLOSURE_FIELD_NAMES_V1, field)) return fail('invalid_value', 'fields');
  }
  if (new Set(fields).size !== fields.length) return fail('invalid_value', 'fields');
  if (typeof value.destination !== 'string') return fail('invalid_type', 'destination');
  if (!isHttpsUrl(value.destination)) return fail('invalid_value', 'destination');
  if (typeof value.purpose !== 'string') return fail('invalid_type', 'purpose');
  const purpose = value.purpose.trim();
  if (purpose.length === 0 || purpose.length > DISCLOSURE_LIMITS_V1.purposeMax || CONTROL.test(purpose)) return fail('invalid_value', 'purpose');
  return {
    ok: true,
    value: {
      schemaVersion: DISCLOSURE_SCHEMA_VERSION_V1,
      fields: DISCLOSURE_FIELD_NAMES_V1.filter((name) => fields.includes(name)),
      destination: value.destination,
      purpose,
    },
  };
}

export function decodeDisclosureRequestResultV1(value: unknown): DisclosureDecodeResultV1<DisclosureRequestResultV1> {
  if (!isRecord(value)) return fail('invalid_type', '$');
  const bad = checkEnvelope(value, ['schemaVersion', 'disclosureRef', 'status'], ['disclosureRef', 'status']);
  if (bad) return bad;
  if (typeof value.disclosureRef !== 'string') return fail('invalid_type', 'disclosureRef');
  if (!DISCLOSURE_REF.test(value.disclosureRef)) return fail('invalid_value', 'disclosureRef');
  if (typeof value.status !== 'string') return fail('invalid_type', 'status');
  if (!isOneOf(DISCLOSURE_STATUSES_V1, value.status)) return fail('invalid_value', 'status');
  return { ok: true, value: { schemaVersion: DISCLOSURE_SCHEMA_VERSION_V1, disclosureRef: value.disclosureRef, status: value.status } };
}

export function decodeDisclosureProofClaimsV1(value: unknown): DisclosureDecodeResultV1<DisclosureProofClaimsV1> {
  if (!isRecord(value)) return fail('invalid_type', '$');
  const keys = ['iss', 'sub', 'aud', 'jti', 'iat', 'exp', 'fields_digest'];
  for (const key of Object.keys(value)) if (!keys.includes(key)) return fail('unknown_field', key);
  for (const key of keys) if (value[key] === undefined) return fail('missing_field', key);
  for (const key of ['iss', 'sub', 'aud', 'jti', 'fields_digest']) if (typeof value[key] !== 'string') return fail('invalid_type', key);
  if (!isHttpsUrl(value.iss)) return fail('invalid_value', 'iss');
  if (!PSEUDONYM.test(value.sub as string)) return fail('invalid_value', 'sub');
  if (!isHttpsUrl(value.aud)) return fail('invalid_value', 'aud');
  if (!JTI.test(value.jti as string)) return fail('invalid_value', 'jti');
  if (!DIGEST.test(value.fields_digest as string)) return fail('invalid_value', 'fields_digest');
  for (const key of ['iat', 'exp']) {
    if (typeof value[key] !== 'number') return fail('invalid_type', key);
    if (!Number.isInteger(value[key]) || (value[key] as number) < 1) return fail('invalid_value', key);
  }
  const ttl = (value.exp as number) - (value.iat as number);
  if (ttl < 1 || ttl > DISCLOSURE_LIMITS_V1.proofTtlSecondsMax) return fail('invalid_value', 'exp');
  return { ok: true, value: Object.fromEntries(keys.map((key) => [key, value[key]])) as unknown as DisclosureProofClaimsV1 };
}

export function decodeDisclosureReceiptV1(value: unknown): DisclosureDecodeResultV1<DisclosureReceiptV1> {
  if (!isRecord(value)) return fail('invalid_type', '$');
  const bad = checkEnvelope(value, ['schemaVersion', 'jti'], ['jti']);
  if (bad) return bad;
  if (typeof value.jti !== 'string') return fail('invalid_type', 'jti');
  if (!JTI.test(value.jti)) return fail('invalid_value', 'jti');
  return { ok: true, value: { schemaVersion: DISCLOSURE_SCHEMA_VERSION_V1, jti: value.jti } };
}
