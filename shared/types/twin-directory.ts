/**
 * R8 关注一个分身 + 行业目录（L8 第 3 批 3B，`TWIN_DIRECTORY_V1_ENABLED` / `TWIN_FOLLOW_V1_ENABLED`，默认关）。
 *
 * - 目录：主人另外点一次「进目录」，填行业、城市、一句话、关键词。T6 收录开着，才会出现在目录里（后端每次现查，不缓存）。
 * - 关注：访客填邮箱 → 收确认邮件 → 点了才算关注（双重确认）；每封邮件带一键退订。
 * - 推送：主人写一条 → 预览 → 确认才发；每个分身每周至多 2 条；只发邮件。
 *
 * 合同里**没有**关注者的完整邮箱：主人只看数量和打码后的地址（`a***@e***.com`）。
 * 解码函数拒收未知字段，失败时返回 `reasonCode` 和字段名，不抛异常。
 */
export const TWIN_DIRECTORY_SCHEMA_VERSION_V1 = 1 as const;

export const TWIN_DIRECTORY_FLAG_V1 = 'TWIN_DIRECTORY_V1_ENABLED';
export const TWIN_FOLLOW_FLAG_V1 = 'TWIN_FOLLOW_V1_ENABLED';
export const TWIN_DIRECTORY_WEB_FLAG_V1 = 'NEXT_PUBLIC_TWIN_DIRECTORY_ENABLED';

export const TWIN_DIRECTORY_INDUSTRIES_V1 = [
  'consulting',
  'design',
  'engineering',
  'legal',
  'finance',
  'marketing',
  'education',
  'health',
  'creative',
  'other',
] as const;
export type TwinDirectoryIndustryV1 = (typeof TWIN_DIRECTORY_INDUSTRIES_V1)[number];

export const TWIN_BROADCAST_KINDS_V1 = ['new_slot', 'new_case'] as const;
export type TwinBroadcastKindV1 = (typeof TWIN_BROADCAST_KINDS_V1)[number];

export const TWIN_BROADCAST_STATUSES_V1 = ['previewed', 'sent', 'failed'] as const;
export type TwinBroadcastStatusV1 = (typeof TWIN_BROADCAST_STATUSES_V1)[number];

export const TWIN_FOLLOWER_STATUSES_V1 = ['pending', 'confirmed', 'unsubscribed'] as const;
export type TwinFollowerStatusV1 = (typeof TWIN_FOLLOWER_STATUSES_V1)[number];

export const TWIN_DIRECTORY_LIMITS_V1 = {
  displayNameMax: 100,
  cityMax: 60,
  taglineMax: 160,
  keywordsMax: 8,
  keywordMax: 24,
  queryMax: 60,
  pageSize: 24,
  /** 现查收录状态之前，库里最多取多少条候选。 */
  candidateScanMax: 200,
  emailMax: 254,
  subjectMax: 120,
  bodyMax: 1000,
  /** 每个分身每个滚动 7 天最多发几条推送。 */
  broadcastsPerWeek: 2,
  /** 同一个邮箱对同一个分身，两次确认邮件之间至少隔多少秒。 */
  confirmMailCooldownSeconds: 600,
  /** 单个分身，待确认的关注上限（防灌水）。 */
  pendingPerAgentMax: 200,
} as const;

export const TWIN_DIRECTORY_REASON_CODES_V1 = [
  'unsupported_schema_version',
  'unknown_field',
  'missing_field',
  'invalid_type',
  'invalid_value',
] as const;
export type TwinDirectoryReasonCodeV1 = (typeof TWIN_DIRECTORY_REASON_CODES_V1)[number];

export type TwinDirectoryDecodeResultV1<T> =
  | { ok: true; value: T }
  | { ok: false; reasonCode: TwinDirectoryReasonCodeV1; field: string };

/** 主人提交的目录信息。 */
export interface TwinDirectoryListingInputV1 {
  schemaVersion: typeof TWIN_DIRECTORY_SCHEMA_VERSION_V1;
  displayName: string;
  industry: TwinDirectoryIndustryV1;
  city: string | null;
  tagline: string;
  keywords: string[];
}

/** 目录页上一条公开的名片。只有名片页地址、没有主人的账户 id。 */
export interface TwinDirectoryCardV1 {
  externalId: string;
  canonicalPath: string;
  displayName: string;
  industry: TwinDirectoryIndustryV1;
  city: string | null;
  tagline: string;
  keywords: string[];
}

export interface TwinDirectoryPageV1 {
  schemaVersion: typeof TWIN_DIRECTORY_SCHEMA_VERSION_V1;
  items: TwinDirectoryCardV1[];
}

export interface TwinFollowInputV1 {
  schemaVersion: typeof TWIN_DIRECTORY_SCHEMA_VERSION_V1;
  agentExternalId: string;
  email: string;
}

export interface TwinBroadcastInputV1 {
  schemaVersion: typeof TWIN_DIRECTORY_SCHEMA_VERSION_V1;
  kind: TwinBroadcastKindV1;
  subject: string;
  body: string;
}

/** 主人看到的关注者概况：数量加打码地址。 */
export interface TwinFollowersViewV1 {
  schemaVersion: typeof TWIN_DIRECTORY_SCHEMA_VERSION_V1;
  confirmed: number;
  pending: number;
  unsubscribed: number;
  recent: Array<{ maskedEmail: string; status: TwinFollowerStatusV1; at: string }>;
}

export interface TwinBroadcastPreviewV1 {
  schemaVersion: typeof TWIN_DIRECTORY_SCHEMA_VERSION_V1;
  broadcastRef: string;
  kind: TwinBroadcastKindV1;
  subject: string;
  body: string;
  /** 现在会收到的人数（只算已确认、未退订的）。 */
  recipientCount: number;
  sendsLeftThisWeek: number;
}

export const TWIN_BROADCAST_REF_PATTERN_V1 = /^tbc_[0-9a-f]{32}$/;
export const TWIN_FOLLOWER_REF_PATTERN_V1 = /^tfl_[0-9a-f]{32}$/;

// ── 小工具 ──────────────────────────────────────────────────────────────────────────

const CONTROL = /[\u0000-\u001f\u007f]/;
/** 够用的邮箱形状：一个 @，域名里有点，没有空白和尖括号。不追求 RFC 全集。 */
const EMAIL = /^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]{1,64}@[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?)+$/;
const EXTERNAL_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{2,79}$/;

function fail(reasonCode: TwinDirectoryReasonCodeV1, field: string): { ok: false; reasonCode: TwinDirectoryReasonCodeV1; field: string } {
  return { ok: false, reasonCode, field };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function envelope(value: Record<string, unknown>, allowed: readonly string[], required: readonly string[]) {
  if (value.schemaVersion === undefined) return fail('missing_field', 'schemaVersion');
  if (typeof value.schemaVersion !== 'number') return fail('invalid_type', 'schemaVersion');
  if (value.schemaVersion !== TWIN_DIRECTORY_SCHEMA_VERSION_V1) return fail('unsupported_schema_version', 'schemaVersion');
  for (const key of Object.keys(value)) if (!allowed.includes(key)) return fail('unknown_field', key);
  for (const key of required) if (value[key] === undefined) return fail('missing_field', key);
  return null;
}

function text(value: unknown, max: number, allowNewlines = false): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (trimmed.length === 0 || trimmed.length > max) return null;
  if (allowNewlines ? /[\u0000-\u0009\u000b\u000c\u000e-\u001f\u007f]/.test(trimmed) : CONTROL.test(trimmed)) return null;
  return trimmed;
}

/** 邮箱统一成小写去空白；形状不对返回 null。 */
export function normalizeTwinFollowEmailV1(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const email = value.trim().toLowerCase();
  if (email.length === 0 || email.length > TWIN_DIRECTORY_LIMITS_V1.emailMax || !EMAIL.test(email)) return null;
  if (email.includes('..')) return null;
  return email;
}

/** `a***@e***.com`：主人和日志里只出现这个。 */
export function maskTwinFollowEmailV1(email: string): string {
  const at = email.lastIndexOf('@');
  if (at < 1) return '***';
  const domain = email.slice(at + 1);
  const dot = domain.lastIndexOf('.');
  const tld = dot > 0 ? domain.slice(dot) : '';
  return `${email[0]}***@${domain[0] ?? ''}***${tld}`;
}

/** 搜索词里的 `%`、`_`、`\` 要转义，免得变成通配符。 */
export function escapeTwinDirectoryLikeV1(value: string): string {
  return value.replace(/[\\%_]/g, (ch) => `\\${ch}`);
}

// ── 解码 ────────────────────────────────────────────────────────────────────────────

export function decodeTwinDirectoryListingInputV1(value: unknown): TwinDirectoryDecodeResultV1<TwinDirectoryListingInputV1> {
  if (!isRecord(value)) return fail('invalid_type', '$');
  const bad = envelope(value, ['schemaVersion', 'displayName', 'industry', 'city', 'tagline', 'keywords'], ['displayName', 'industry', 'tagline']);
  if (bad) return bad;
  const displayName = text(value.displayName, TWIN_DIRECTORY_LIMITS_V1.displayNameMax);
  if (!displayName) return fail(typeof value.displayName === 'string' ? 'invalid_value' : 'invalid_type', 'displayName');
  if (typeof value.industry !== 'string') return fail('invalid_type', 'industry');
  if (!(TWIN_DIRECTORY_INDUSTRIES_V1 as readonly string[]).includes(value.industry)) return fail('invalid_value', 'industry');
  let city: string | null = null;
  if (value.city !== undefined && value.city !== null) {
    city = text(value.city, TWIN_DIRECTORY_LIMITS_V1.cityMax);
    if (!city) return fail(typeof value.city === 'string' ? 'invalid_value' : 'invalid_type', 'city');
  }
  const tagline = text(value.tagline, TWIN_DIRECTORY_LIMITS_V1.taglineMax);
  if (!tagline) return fail(typeof value.tagline === 'string' ? 'invalid_value' : 'invalid_type', 'tagline');
  const keywords: string[] = [];
  if (value.keywords !== undefined) {
    if (!Array.isArray(value.keywords)) return fail('invalid_type', 'keywords');
    if (value.keywords.length > TWIN_DIRECTORY_LIMITS_V1.keywordsMax) return fail('invalid_value', 'keywords');
    for (const item of value.keywords as unknown[]) {
      const keyword = text(item, TWIN_DIRECTORY_LIMITS_V1.keywordMax);
      if (!keyword || keyword.includes(',')) return fail(typeof item === 'string' ? 'invalid_value' : 'invalid_type', 'keywords');
      if (!keywords.some((existing) => existing.toLowerCase() === keyword.toLowerCase())) keywords.push(keyword);
    }
  }
  return {
    ok: true,
    value: { schemaVersion: TWIN_DIRECTORY_SCHEMA_VERSION_V1, displayName, industry: value.industry as TwinDirectoryIndustryV1, city, tagline, keywords },
  };
}

export function decodeTwinFollowInputV1(value: unknown): TwinDirectoryDecodeResultV1<TwinFollowInputV1> {
  if (!isRecord(value)) return fail('invalid_type', '$');
  const bad = envelope(value, ['schemaVersion', 'agentExternalId', 'email'], ['agentExternalId', 'email']);
  if (bad) return bad;
  if (typeof value.agentExternalId !== 'string') return fail('invalid_type', 'agentExternalId');
  if (!EXTERNAL_ID.test(value.agentExternalId)) return fail('invalid_value', 'agentExternalId');
  if (typeof value.email !== 'string') return fail('invalid_type', 'email');
  const email = normalizeTwinFollowEmailV1(value.email);
  if (!email) return fail('invalid_value', 'email');
  return { ok: true, value: { schemaVersion: TWIN_DIRECTORY_SCHEMA_VERSION_V1, agentExternalId: value.agentExternalId, email } };
}

export function decodeTwinBroadcastInputV1(value: unknown): TwinDirectoryDecodeResultV1<TwinBroadcastInputV1> {
  if (!isRecord(value)) return fail('invalid_type', '$');
  const bad = envelope(value, ['schemaVersion', 'kind', 'subject', 'body'], ['kind', 'subject', 'body']);
  if (bad) return bad;
  if (typeof value.kind !== 'string') return fail('invalid_type', 'kind');
  if (!(TWIN_BROADCAST_KINDS_V1 as readonly string[]).includes(value.kind)) return fail('invalid_value', 'kind');
  const subject = text(value.subject, TWIN_DIRECTORY_LIMITS_V1.subjectMax);
  if (!subject) return fail(typeof value.subject === 'string' ? 'invalid_value' : 'invalid_type', 'subject');
  const body = text(value.body, TWIN_DIRECTORY_LIMITS_V1.bodyMax, true);
  if (!body) return fail(typeof value.body === 'string' ? 'invalid_value' : 'invalid_type', 'body');
  return { ok: true, value: { schemaVersion: TWIN_DIRECTORY_SCHEMA_VERSION_V1, kind: value.kind as TwinBroadcastKindV1, subject, body } };
}
