/**
 * 第 12 批「分身社交一」：站内关注一个分身、看它发的更新（S1）；分身代拟更新、本人确认才发（S2）。
 * 建在 R8 关注和推送（`twin-directory.ts`）上，不用旧的 `backend/src/modules/social`。
 *
 * - 站内关注：登录用户一键关注一个公开的分身，取消就删记录。主人只看人数，看不到是谁。
 * - 更新流：只列关注之后发出的更新；分身不再公开就不列。详情只给关注者（关注早于发送、现在仍关注）和主人本人看。
 * - 发送：照旧先预览、确认才发，每个分身每 7 天至多 2 条。站内关注者各收一条站内通知（不推手机），
 *   邮件和站内合起来算一条。
 * - 分身代拟：只拿本人确认过的回答起草一条「新案例」，只给主人看、不存正文、不会自己发出；
 *   用了草稿发出的那条，详情页和邮件末尾标「分身起草，本人确认后发出」。
 *
 * 开关精确等于 `'1'` 才开，默认全关。解码函数拒收未知字段，失败时返回 `reasonCode` 和字段名，不抛异常。
 */
import { agentPublicCanonicalPathV1 } from './agent-public-entry';
import {
  TWIN_BROADCAST_KINDS_V1,
  TWIN_BROADCAST_REF_PATTERN_V1,
  TWIN_DIRECTORY_LIMITS_V1,
  TWIN_UPDATE_DRAFT_REF_PATTERN_V1,
  type TwinBroadcastKindV1,
  type TwinDirectoryDecodeResultV1,
  type TwinDirectoryReasonCodeV1,
} from './twin-directory';

export { TWIN_UPDATE_DRAFT_REF_PATTERN_V1 };

export const TWIN_SOCIAL_SCHEMA_VERSION_V1 = 1 as const;

export const TWIN_SOCIAL_FEED_FLAG_V1 = 'TWIN_SOCIAL_FEED_V1_ENABLED';
export const TWIN_UPDATE_DRAFT_FLAG_V1 = 'TWIN_UPDATE_DRAFT_V1_ENABLED';
export const TWIN_SOCIAL_FEED_WEB_FLAG_V1 = 'NEXT_PUBLIC_TWIN_SOCIAL_FEED_ENABLED';
export const TWIN_UPDATE_DRAFT_WEB_FLAG_V1 = 'NEXT_PUBLIC_TWIN_UPDATE_DRAFT_ENABLED';

export const TWIN_SOCIAL_LIMITS_V1 = {
  /** 一个人最多关注多少个分身。 */
  followsPerUserMax: 500,
  feedPageSize: 20,
  /** 一次发送最多通知多少个站内关注者（和邮件一样）。 */
  inSiteRecipientsMax: 5000,
  /** 每个分身每 24 小时最多起草几次。 */
  draftsPerDay: 6,
  /** 起草时最多往回看几天、最多用几条本人确认过的回答。 */
  draftLookbackDays: 14,
  draftSourcesMax: 12,
} as const;

/** 只有「新案例」能让分身起草：「新空档」要真实的时间，分身不能编。 */
export const TWIN_UPDATE_DRAFT_KINDS_V1 = ['new_case'] as const;
export type TwinUpdateDraftKindV1 = (typeof TWIN_UPDATE_DRAFT_KINDS_V1)[number];

export const TWIN_UPDATE_DRAFT_LANGUAGES_V1 = ['zh-CN', 'en'] as const;
export type TwinUpdateDraftLanguageV1 = (typeof TWIN_UPDATE_DRAFT_LANGUAGES_V1)[number];

/** 用了分身草稿发出的更新带这句（详情页、邮件末尾）。 */
export const TWIN_UPDATE_DRAFT_MARK_V1 = { zh: '分身起草，本人确认后发出。', en: 'Drafted by the twin, sent after the owner confirmed it.' } as const;

/** 站内通知的 `data.kind`。同一条更新对同一个人只记一次（去重键），点通知去详情页。 */
export const TWIN_FOLLOW_UPDATE_NOTIFICATION_KIND_V1 = 'twin_follow_update';

export function twinFollowUpdateDedupeKeyV1(broadcastRef: string): string {
  return `twin-update:${broadcastRef}`;
}

export function twinFollowUpdatePathV1(broadcastRef: string): string {
  return `/following/updates/${encodeURIComponent(broadcastRef)}`;
}

/** 名片页上「站内关注」按钮的状态。`ownTwin`：这是看的人自己的分身（不能关注自己）。 */
export interface TwinFollowStateV1 {
  schemaVersion: typeof TWIN_SOCIAL_SCHEMA_VERSION_V1;
  following: boolean;
  followedAt: string | null;
  ownTwin: boolean;
}

/** 列表和更新里的分身：只有名片页地址和名字，没有主人的账户 id。 */
export interface TwinSocialTwinV1 {
  externalId: string;
  displayName: string;
  canonicalPath: string;
}

export interface TwinFollowingListV1 {
  schemaVersion: typeof TWIN_SOCIAL_SCHEMA_VERSION_V1;
  items: Array<TwinSocialTwinV1 & { followedAt: string }>;
}

export interface TwinUpdateSummaryV1 {
  broadcastRef: string;
  kind: TwinBroadcastKindV1;
  subject: string;
  sentAt: string;
  twin: TwinSocialTwinV1;
  /** 用了分身草稿（本人确认后发出）。 */
  twinDrafted: boolean;
}

export interface TwinUpdateFeedPageV1 {
  schemaVersion: typeof TWIN_SOCIAL_SCHEMA_VERSION_V1;
  items: TwinUpdateSummaryV1[];
  /** 下一页把它当 `before` 传回；没有下一页是 null。 */
  nextBefore: string | null;
}

export interface TwinUpdateDetailV1 extends TwinUpdateSummaryV1 {
  schemaVersion: typeof TWIN_SOCIAL_SCHEMA_VERSION_V1;
  body: string;
  viewer: 'follower' | 'owner';
}

/** 主人请分身起草一条更新。 */
export interface TwinUpdateDraftInputV1 {
  schemaVersion: typeof TWIN_SOCIAL_SCHEMA_VERSION_V1;
  kind: TwinUpdateDraftKindV1;
  language: TwinUpdateDraftLanguageV1;
}

/** 分身给的草稿：只回给主人，不存正文；主人改完照旧预览、确认发送，预览时带上 `draftRef`。 */
export interface TwinUpdateDraftV1 {
  schemaVersion: typeof TWIN_SOCIAL_SCHEMA_VERSION_V1;
  draftRef: string;
  kind: TwinUpdateDraftKindV1;
  subject: string;
  body: string;
  /** 用了几条本人确认过的回答。 */
  sourceCount: number;
  /** false：模型没开或出错，草稿是把问答原样排好。 */
  usedModel: boolean;
}

// ── 小工具 ──────────────────────────────────────────────────────────────────────────

const EXTERNAL_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{2,79}$/;
const ISO_INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/;
const CONTROL = /[\u0000-\u001f\u007f]/;
const CONTROL_EXCEPT_NEWLINES = /[\u0000-\u0009\u000b\u000c\u000e-\u001f\u007f]/;

type Failure = { ok: false; reasonCode: TwinDirectoryReasonCodeV1; field: string };

function fail(reasonCode: TwinDirectoryReasonCodeV1, field: string): Failure {
  return { ok: false, reasonCode, field };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function fields(value: Record<string, unknown>, allowed: readonly string[], required: readonly string[], prefix = ''): Failure | null {
  for (const key of Object.keys(value)) if (!allowed.includes(key)) return fail('unknown_field', `${prefix}${key}`);
  for (const key of required) if (value[key] === undefined) return fail('missing_field', `${prefix}${key}`);
  return null;
}

function envelope(value: Record<string, unknown>, allowed: readonly string[], required: readonly string[]): Failure | null {
  if (value.schemaVersion === undefined) return fail('missing_field', 'schemaVersion');
  if (typeof value.schemaVersion !== 'number') return fail('invalid_type', 'schemaVersion');
  if (value.schemaVersion !== TWIN_SOCIAL_SCHEMA_VERSION_V1) return fail('unsupported_schema_version', 'schemaVersion');
  return fields(value, ['schemaVersion', ...allowed], required);
}

/** 非空、不超长、没有控制字符（正文可以换行）。 */
function plain(value: unknown, max: number, allowNewlines = false): string | null {
  if (typeof value !== 'string' || value.trim().length === 0 || value.length > max) return null;
  return (allowNewlines ? CONTROL_EXCEPT_NEWLINES : CONTROL).test(value) ? null : value;
}

function isInstant(value: unknown): value is string {
  return typeof value === 'string' && ISO_INSTANT.test(value) && !Number.isNaN(Date.parse(value));
}

function wrong(value: unknown, field: string, expected: 'string' | 'boolean' | 'number' = 'string'): Failure {
  return fail(typeof value === expected ? 'invalid_value' : 'invalid_type', field);
}

function decodeTwin(value: unknown, field: string): TwinDirectoryDecodeResultV1<TwinSocialTwinV1> {
  if (!isRecord(value)) return fail('invalid_type', field);
  const bad = fields(value, ['externalId', 'displayName', 'canonicalPath'], ['externalId', 'displayName', 'canonicalPath'], `${field}.`);
  if (bad) return bad;
  if (typeof value.externalId !== 'string' || !EXTERNAL_ID.test(value.externalId)) return wrong(value.externalId, `${field}.externalId`);
  const displayName = plain(value.displayName, TWIN_DIRECTORY_LIMITS_V1.displayNameMax);
  if (displayName === null) return wrong(value.displayName, `${field}.displayName`);
  if (value.canonicalPath !== agentPublicCanonicalPathV1(value.externalId)) return wrong(value.canonicalPath, `${field}.canonicalPath`);
  return { ok: true, value: { externalId: value.externalId, displayName, canonicalPath: value.canonicalPath } };
}

const SUMMARY_FIELDS = ['broadcastRef', 'kind', 'subject', 'sentAt', 'twin', 'twinDrafted'] as const;

function decodeSummary(value: Record<string, unknown>, prefix: string): TwinDirectoryDecodeResultV1<TwinUpdateSummaryV1> {
  const at = (key: string) => `${prefix}${key}`;
  if (typeof value.broadcastRef !== 'string' || !TWIN_BROADCAST_REF_PATTERN_V1.test(value.broadcastRef)) return wrong(value.broadcastRef, at('broadcastRef'));
  if (typeof value.kind !== 'string' || !(TWIN_BROADCAST_KINDS_V1 as readonly string[]).includes(value.kind)) return wrong(value.kind, at('kind'));
  const subject = plain(value.subject, TWIN_DIRECTORY_LIMITS_V1.subjectMax);
  if (subject === null) return wrong(value.subject, at('subject'));
  if (!isInstant(value.sentAt)) return wrong(value.sentAt, at('sentAt'));
  const twin = decodeTwin(value.twin, at('twin'));
  if (twin.ok === false) return twin;
  if (typeof value.twinDrafted !== 'boolean') return fail('invalid_type', at('twinDrafted'));
  return {
    ok: true,
    value: { broadcastRef: value.broadcastRef, kind: value.kind as TwinBroadcastKindV1, subject, sentAt: value.sentAt, twin: twin.value, twinDrafted: value.twinDrafted },
  };
}

// ── 解码：请求 ──────────────────────────────────────────────────────────────────────

export function decodeTwinUpdateDraftInputV1(value: unknown): TwinDirectoryDecodeResultV1<TwinUpdateDraftInputV1> {
  if (!isRecord(value)) return fail('invalid_type', '$');
  const bad = envelope(value, ['kind', 'language'], ['kind']);
  if (bad) return bad;
  if (typeof value.kind !== 'string' || !(TWIN_UPDATE_DRAFT_KINDS_V1 as readonly string[]).includes(value.kind)) return wrong(value.kind, 'kind');
  const language = value.language === undefined ? 'zh-CN' : value.language;
  if (typeof language !== 'string' || !(TWIN_UPDATE_DRAFT_LANGUAGES_V1 as readonly string[]).includes(language)) return wrong(language, 'language');
  return {
    ok: true,
    value: { schemaVersion: TWIN_SOCIAL_SCHEMA_VERSION_V1, kind: value.kind as TwinUpdateDraftKindV1, language: language as TwinUpdateDraftLanguageV1 },
  };
}

// ── 解码：响应（网页端每个调用方都过一遍）──────────────────────────────────────────────

export function decodeTwinFollowStateV1(value: unknown): TwinDirectoryDecodeResultV1<TwinFollowStateV1> {
  if (!isRecord(value)) return fail('invalid_type', '$');
  const bad = envelope(value, ['following', 'followedAt', 'ownTwin'], ['following', 'followedAt', 'ownTwin']);
  if (bad) return bad;
  if (typeof value.following !== 'boolean') return fail('invalid_type', 'following');
  if (typeof value.ownTwin !== 'boolean') return fail('invalid_type', 'ownTwin');
  if (value.followedAt !== null && !isInstant(value.followedAt)) return wrong(value.followedAt, 'followedAt');
  if (value.following !== (value.followedAt !== null)) return fail('invalid_value', 'followedAt');
  return {
    ok: true,
    value: { schemaVersion: TWIN_SOCIAL_SCHEMA_VERSION_V1, following: value.following, followedAt: value.followedAt as string | null, ownTwin: value.ownTwin },
  };
}

export function decodeTwinFollowingListV1(value: unknown): TwinDirectoryDecodeResultV1<TwinFollowingListV1> {
  if (!isRecord(value)) return fail('invalid_type', '$');
  const bad = envelope(value, ['items'], ['items']);
  if (bad) return bad;
  if (!Array.isArray(value.items)) return fail('invalid_type', 'items');
  if (value.items.length > TWIN_SOCIAL_LIMITS_V1.followsPerUserMax) return fail('invalid_value', 'items');
  const items: TwinFollowingListV1['items'] = [];
  for (let index = 0; index < value.items.length; index += 1) {
    const item: unknown = value.items[index];
    if (!isRecord(item)) return fail('invalid_type', `items.${index}`);
    const { followedAt, ...rest } = item;
    if (followedAt === undefined) return fail('missing_field', `items.${index}.followedAt`);
    if (!isInstant(followedAt)) return wrong(followedAt, `items.${index}.followedAt`);
    const twin = decodeTwin(rest, `items.${index}`);
    if (twin.ok === false) return twin;
    items.push({ ...twin.value, followedAt });
  }
  return { ok: true, value: { schemaVersion: TWIN_SOCIAL_SCHEMA_VERSION_V1, items } };
}

export function decodeTwinUpdateFeedPageV1(value: unknown): TwinDirectoryDecodeResultV1<TwinUpdateFeedPageV1> {
  if (!isRecord(value)) return fail('invalid_type', '$');
  const bad = envelope(value, ['items', 'nextBefore'], ['items', 'nextBefore']);
  if (bad) return bad;
  if (!Array.isArray(value.items)) return fail('invalid_type', 'items');
  if (value.items.length > TWIN_SOCIAL_LIMITS_V1.feedPageSize) return fail('invalid_value', 'items');
  const items: TwinUpdateSummaryV1[] = [];
  for (let index = 0; index < value.items.length; index += 1) {
    const item: unknown = value.items[index];
    if (!isRecord(item)) return fail('invalid_type', `items.${index}`);
    const extra = fields(item, SUMMARY_FIELDS, SUMMARY_FIELDS, `items.${index}.`);
    if (extra) return extra;
    const summary = decodeSummary(item, `items.${index}.`);
    if (summary.ok === false) return summary;
    items.push(summary.value);
  }
  if (value.nextBefore !== null && !isInstant(value.nextBefore)) return wrong(value.nextBefore, 'nextBefore');
  return { ok: true, value: { schemaVersion: TWIN_SOCIAL_SCHEMA_VERSION_V1, items, nextBefore: value.nextBefore as string | null } };
}

export function decodeTwinUpdateDetailV1(value: unknown): TwinDirectoryDecodeResultV1<TwinUpdateDetailV1> {
  if (!isRecord(value)) return fail('invalid_type', '$');
  const bad = envelope(value, [...SUMMARY_FIELDS, 'body', 'viewer'], [...SUMMARY_FIELDS, 'body', 'viewer']);
  if (bad) return bad;
  const summary = decodeSummary(value, '');
  if (summary.ok === false) return summary;
  const body = plain(value.body, TWIN_DIRECTORY_LIMITS_V1.bodyMax, true);
  if (body === null) return wrong(value.body, 'body');
  if (value.viewer !== 'follower' && value.viewer !== 'owner') return wrong(value.viewer, 'viewer');
  return { ok: true, value: { schemaVersion: TWIN_SOCIAL_SCHEMA_VERSION_V1, ...summary.value, body, viewer: value.viewer } };
}

export function decodeTwinUpdateDraftV1(value: unknown): TwinDirectoryDecodeResultV1<TwinUpdateDraftV1> {
  if (!isRecord(value)) return fail('invalid_type', '$');
  const keys = ['draftRef', 'kind', 'subject', 'body', 'sourceCount', 'usedModel'];
  const bad = envelope(value, keys, keys);
  if (bad) return bad;
  if (typeof value.draftRef !== 'string' || !TWIN_UPDATE_DRAFT_REF_PATTERN_V1.test(value.draftRef)) return wrong(value.draftRef, 'draftRef');
  if (typeof value.kind !== 'string' || !(TWIN_UPDATE_DRAFT_KINDS_V1 as readonly string[]).includes(value.kind)) return wrong(value.kind, 'kind');
  const subject = plain(value.subject, TWIN_DIRECTORY_LIMITS_V1.subjectMax);
  if (subject === null) return wrong(value.subject, 'subject');
  const body = plain(value.body, TWIN_DIRECTORY_LIMITS_V1.bodyMax, true);
  if (body === null) return wrong(value.body, 'body');
  const sourceCount = value.sourceCount;
  if (typeof sourceCount !== 'number' || !Number.isInteger(sourceCount) || sourceCount < 1 || sourceCount > TWIN_SOCIAL_LIMITS_V1.draftSourcesMax) {
    return wrong(sourceCount, 'sourceCount', 'number');
  }
  if (typeof value.usedModel !== 'boolean') return fail('invalid_type', 'usedModel');
  return {
    ok: true,
    value: {
      schemaVersion: TWIN_SOCIAL_SCHEMA_VERSION_V1,
      draftRef: value.draftRef,
      kind: value.kind as TwinUpdateDraftKindV1,
      subject,
      body,
      sourceCount,
      usedModel: value.usedModel,
    },
  };
}
