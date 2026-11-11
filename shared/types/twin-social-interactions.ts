/**
 * 第 14 批「分身社交二」（E251）S3 和安全底座：关注者对一条更新「提问」「感兴趣」，只给本人；静音、举报、发起权限。
 * 建在第 12 批的站内关注和更新详情上（`twin-social.ts`）。
 *
 * - 提问：只有能看这条更新的关注者能问（关注早于发送、仍在关注、分身仍公开），本人不能问自己。分身当场只拿本人确认过的
 *   回答作答，别的都「转给本人」；答案只回给提问人，不存。本人看得到问题，提问人只显示一个在这个分身下不变的暗号。
 * - 感兴趣：关注者自己填一个给本人看的称呼，记进本人的关系簿（来源 lead，身份 user，没有联系方式）；撤回时这个称呼从
 *   关系簿里去掉。
 * - 本人可以关掉一条更新的互动，也可以静音一个提问人：之后这个人的提问、感兴趣都不再到本人这里，对方看到的和平常一样。
 * - 举报进后台队列，由人处理。一周内 3 个不同的人举报同一个账号，自动停掉它主动发起的权限，等人工看。
 * - 可能认识的人（S4）：自己打开「愿意被推荐」、目录卡片公开且填了城市的人之间，每周最多看到 5 位同城同行。
 *   名片请求要对方接受，接受后两边的关系簿各记一条（来源 card，只有名字）；被拒或过期，发的一方只看到「没有交换」。
 * - 圈子（S5）：有公开名片的人最多建 3 个圈子，每个最多 50 人；入圈要圈主邀请、对方接受，或对方申请、圈主同意。
 *   圈主每 7 天最多发 2 条公告，只有成员看得到；成员可以在公告下提问，只给圈主。后台可以冻结圈子。
 *
 * 开关精确等于 `'1'` 才开，默认全关。解码函数拒收未知字段，失败时返回 `reasonCode` 和字段名，不抛异常。
 */
import { AGENT_EXTERNAL_ID_PATTERN_V1, agentPublicCanonicalPathV1 } from './agent-public-entry';
import {
  TWIN_BROADCAST_REF_PATTERN_V1,
  TWIN_DIRECTORY_INDUSTRIES_V1,
  TWIN_DIRECTORY_LIMITS_V1,
  type TwinDirectoryDecodeResultV1,
  type TwinDirectoryIndustryV1,
  type TwinDirectoryReasonCodeV1,
} from './twin-directory';
import { TWIN_SOCIAL_SCHEMA_VERSION_V1 } from './twin-social';

export { TWIN_SOCIAL_SCHEMA_VERSION_V1 };

export const TWIN_UPDATE_INTERACTIONS_FLAG_V1 = 'TWIN_UPDATE_INTERACTIONS_V1_ENABLED';
export const TWIN_RECOMMENDATIONS_FLAG_V1 = 'TWIN_RECOMMENDATIONS_V1_ENABLED';
export const TWIN_CIRCLES_FLAG_V1 = 'TWIN_CIRCLES_V1_ENABLED';
/** 静音和举报跟着这三个开关走：任一开着就能用，全关时路由 404。 */
export const TWIN_SOCIAL_SAFETY_FLAGS_V1 = [TWIN_UPDATE_INTERACTIONS_FLAG_V1, TWIN_RECOMMENDATIONS_FLAG_V1, TWIN_CIRCLES_FLAG_V1] as const;
export const TWIN_UPDATE_INTERACTIONS_WEB_FLAG_V1 = 'NEXT_PUBLIC_TWIN_UPDATE_INTERACTIONS_ENABLED';
export const TWIN_RECOMMENDATIONS_WEB_FLAG_V1 = 'NEXT_PUBLIC_TWIN_RECOMMENDATIONS_ENABLED';
export const TWIN_CIRCLES_WEB_FLAG_V1 = 'NEXT_PUBLIC_TWIN_CIRCLES_ENABLED';

export const TWIN_SOCIAL_INTERACTION_LIMITS_V1 = {
  questionMax: 280,
  /** 同一个人对同一条更新最多问几次。 */
  questionsPerUpdatePerUser: 3,
  /** 一个人 24 小时内最多问几次（所有分身合计）。 */
  questionsPerUserPerDay: 20,
  /** 一个分身 24 小时内最多收几个问题（所有人合计）。 */
  questionsPerTwinPerDay: 200,
  displayNameMax: 40,
  /** 本人一次看到的问题条数（新的在前）。 */
  ownerQuestionsMax: 200,
  answerMax: 4000,
  retentionDays: 180,
} as const;

export const TWIN_SOCIAL_SAFETY_LIMITS_V1 = {
  reportNoteMax: 200,
  /** 一个人 24 小时内最多举报几次。 */
  reportsPerUserPerDay: 10,
  /** 7 天内有这么多个不同的人举报同一个账号，就自动停掉它主动发起的权限。 */
  autoRestrictReporters: 3,
  autoRestrictWindowDays: 7,
  mutesListMax: 500,
  /** 名片请求那边静音时记下的对方名片名字最长多少。 */
  muteLabelMax: 100,
} as const;

export const TWIN_SOCIAL_SUBJECT_KINDS_V1 = ['update', 'announcement'] as const;
export type TwinSocialSubjectKindV1 = (typeof TWIN_SOCIAL_SUBJECT_KINDS_V1)[number];

export const TWIN_SOCIAL_INTERACTION_KINDS_V1 = ['question', 'interest'] as const;
export type TwinSocialInteractionKindV1 = (typeof TWIN_SOCIAL_INTERACTION_KINDS_V1)[number];

/**
 * 能举报的东西：一条更新（关注者举报本人）、一个问题（本人举报提问人）、一个分身（推荐或名片请求里看到的）、
 * 一条圈子公告（成员举报圈主）、一个圈子（看得到它的人举报圈主）。
 */
export const TWIN_SOCIAL_REPORT_SUBJECT_KINDS_V1 = ['update', 'question', 'twin', 'announcement', 'circle'] as const;
export type TwinSocialReportSubjectKindV1 = (typeof TWIN_SOCIAL_REPORT_SUBJECT_KINDS_V1)[number];

export const TWIN_SOCIAL_REPORT_REASONS_V1 = ['spam', 'harassment', 'impersonation', 'inappropriate', 'other'] as const;
export type TwinSocialReportReasonV1 = (typeof TWIN_SOCIAL_REPORT_REASONS_V1)[number];

/** 从哪里静音一个人：问题列表里的「静音提问人」，名片请求、圈子邀请（或入圈申请）里的「不再看此人」。 */
export const TWIN_SOCIAL_MUTE_SOURCES_V1 = ['question', 'card_request', 'circle_invite'] as const;
export type TwinSocialMuteSourceV1 = (typeof TWIN_SOCIAL_MUTE_SOURCES_V1)[number];

export const TWIN_SOCIAL_QUESTION_REF_PATTERN_V1 = /^tsq_[A-Za-z0-9_-]{22}$/;
export const TWIN_SOCIAL_ASKER_REF_PATTERN_V1 = /^[A-Za-z0-9_-]{12}$/;
export const TWIN_SOCIAL_MUTE_REF_PATTERN_V1 = /^tsm_[A-Za-z0-9_-]{22}$/;

/** 问题和称呼里不能带链接（E251）：网址、`www.`、常见后缀的域名。 */
export const TWIN_SOCIAL_LINK_PATTERN_V1 = /(https?:\/\/|www\.|\b[a-z0-9-]+\.(com|cn|net|org|io|co|sg|me|xyz|top|app|link|ly|info|biz)\b)/i;

/** 站内通知的 `data.kind`：本人的更新有新的提问或感兴趣，每条更新每天最多一条。 */
export const TWIN_UPDATE_INTERACTION_NOTIFICATION_KIND_V1 = 'twin_update_interaction';

export function twinUpdateInteractionDedupeKeyV1(broadcastRef: string, day: string): string {
  return `twin-update-interaction:${broadcastRef}:${day}`;
}

/** 感兴趣在关系簿里的来源编号：撤回时按它把这一条找回来。 */
export function twinUpdateInterestSourceRefV1(broadcastRef: string): string {
  return `twin-update:${broadcastRef}`;
}

// ── 请求 ──────────────────────────────────────────────────────────────────────────

export interface TwinUpdateQuestionInputV1 {
  schemaVersion: typeof TWIN_SOCIAL_SCHEMA_VERSION_V1;
  question: string;
  language?: 'zh-CN' | 'en';
}

export interface TwinUpdateInterestInputV1 {
  schemaVersion: typeof TWIN_SOCIAL_SCHEMA_VERSION_V1;
  /** 给本人看的称呼，关注者自己填。 */
  displayName: string;
}

export interface TwinUpdateInteractionsClosedInputV1 {
  schemaVersion: typeof TWIN_SOCIAL_SCHEMA_VERSION_V1;
  closed: boolean;
}

export interface TwinSocialMuteInputV1 {
  schemaVersion: typeof TWIN_SOCIAL_SCHEMA_VERSION_V1;
  source: TwinSocialMuteSourceV1;
  /** `question`：问题编号（`questionRef`）。 */
  ref: string;
}

export interface TwinSocialReportInputV1 {
  schemaVersion: typeof TWIN_SOCIAL_SCHEMA_VERSION_V1;
  subjectKind: TwinSocialReportSubjectKindV1;
  /** `update`：更新编号；`question`：问题编号。 */
  subjectRef: string;
  reason: TwinSocialReportReasonV1;
  note?: string;
}

// ── 响应 ──────────────────────────────────────────────────────────────────────────

/** `answered`：分身拿本人确认过的回答答了；`passed_to_owner`：分身不答，问题已到本人那里。 */
export type TwinUpdateQuestionStatusV1 = 'answered' | 'passed_to_owner';

export interface TwinUpdateQuestionResultV1 {
  schemaVersion: typeof TWIN_SOCIAL_SCHEMA_VERSION_V1;
  status: TwinUpdateQuestionStatusV1;
  /** 只在 `answered` 时有；`label` 是回答旁边必须显示的来源标注。 */
  answer: { text: string; label: { zh: string; en: string } } | null;
  askedAt: string;
  /** 这条更新上还能问几次。 */
  remaining: number;
}

/** 关注者在一条更新上自己的互动。 */
export interface TwinUpdateMineV1 {
  schemaVersion: typeof TWIN_SOCIAL_SCHEMA_VERSION_V1;
  /** 本人没有关掉这条的互动。 */
  open: boolean;
  interested: boolean;
  remaining: number;
  questions: Array<{ question: string; askedAt: string; status: TwinUpdateQuestionStatusV1 }>;
}

/** 本人看一条更新收到的互动：问题和感兴趣的人数。提问人只有暗号，没有名字和账号。 */
export interface TwinUpdateInteractionsV1 {
  schemaVersion: typeof TWIN_SOCIAL_SCHEMA_VERSION_V1;
  broadcastRef: string;
  open: boolean;
  interestCount: number;
  questions: Array<{ questionRef: string; askerRef: string; question: string; askedAt: string; status: TwinUpdateQuestionStatusV1 }>;
}

export interface TwinSocialMuteListV1 {
  schemaVersion: typeof TWIN_SOCIAL_SCHEMA_VERSION_V1;
  /** `label`：提问人是静音时看到的暗号（不是名字）；名片请求是对方公开名片上的名字。 */
  items: Array<{ muteRef: string; source: TwinSocialMuteSourceV1; label: string | null; mutedAt: string }>;
}

/** 静音、举报都只回这一句：不说对方是谁，也不说举报之后发生了什么。 */
export interface TwinSocialAckV1 {
  schemaVersion: typeof TWIN_SOCIAL_SCHEMA_VERSION_V1;
  ok: true;
}

// ── 小工具 ──────────────────────────────────────────────────────────────────────────

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

/** 非空、不超长、没有控制字符（`allowNewlines` 时可以换行）。 */
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

function member<T extends string>(list: readonly T[], value: unknown): value is T {
  return typeof value === 'string' && (list as readonly string[]).includes(value);
}

function count(value: unknown, max: number): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= max;
}

const STATUSES: readonly TwinUpdateQuestionStatusV1[] = ['answered', 'passed_to_owner'];

// ── 解码：请求 ──────────────────────────────────────────────────────────────────────

export function decodeTwinUpdateQuestionInputV1(value: unknown): TwinDirectoryDecodeResultV1<TwinUpdateQuestionInputV1> {
  if (!isRecord(value)) return fail('invalid_type', '$');
  const bad = envelope(value, ['question', 'language'], ['question']);
  if (bad) return bad;
  const question = plain(value.question, TWIN_SOCIAL_INTERACTION_LIMITS_V1.questionMax, true);
  if (question === null || TWIN_SOCIAL_LINK_PATTERN_V1.test(question)) return wrong(value.question, 'question');
  if (value.language !== undefined && value.language !== 'zh-CN' && value.language !== 'en') return wrong(value.language, 'language');
  return {
    ok: true,
    value: { schemaVersion: TWIN_SOCIAL_SCHEMA_VERSION_V1, question: question.trim(), ...(value.language ? { language: value.language as 'zh-CN' | 'en' } : {}) },
  };
}

export function decodeTwinUpdateInterestInputV1(value: unknown): TwinDirectoryDecodeResultV1<TwinUpdateInterestInputV1> {
  if (!isRecord(value)) return fail('invalid_type', '$');
  const bad = envelope(value, ['displayName'], ['displayName']);
  if (bad) return bad;
  const displayName = plain(value.displayName, TWIN_SOCIAL_INTERACTION_LIMITS_V1.displayNameMax);
  if (displayName === null || TWIN_SOCIAL_LINK_PATTERN_V1.test(displayName)) return wrong(value.displayName, 'displayName');
  return { ok: true, value: { schemaVersion: TWIN_SOCIAL_SCHEMA_VERSION_V1, displayName: displayName.trim() } };
}

export function decodeTwinUpdateInteractionsClosedInputV1(value: unknown): TwinDirectoryDecodeResultV1<TwinUpdateInteractionsClosedInputV1> {
  if (!isRecord(value)) return fail('invalid_type', '$');
  const bad = envelope(value, ['closed'], ['closed']);
  if (bad) return bad;
  if (typeof value.closed !== 'boolean') return fail('invalid_type', 'closed');
  return { ok: true, value: { schemaVersion: TWIN_SOCIAL_SCHEMA_VERSION_V1, closed: value.closed } };
}

export function decodeTwinSocialMuteInputV1(value: unknown): TwinDirectoryDecodeResultV1<TwinSocialMuteInputV1> {
  if (!isRecord(value)) return fail('invalid_type', '$');
  const bad = envelope(value, ['source', 'ref'], ['source', 'ref']);
  if (bad) return bad;
  if (!member(TWIN_SOCIAL_MUTE_SOURCES_V1, value.source)) return wrong(value.source, 'source');
  const refPattern =
    value.source === 'card_request'
      ? TWIN_CARD_REQUEST_REF_PATTERN_V1
      : value.source === 'circle_invite'
        ? TWIN_CIRCLE_INVITE_REF_PATTERN_V1
        : TWIN_SOCIAL_QUESTION_REF_PATTERN_V1;
  if (typeof value.ref !== 'string' || !refPattern.test(value.ref)) return wrong(value.ref, 'ref');
  return { ok: true, value: { schemaVersion: TWIN_SOCIAL_SCHEMA_VERSION_V1, source: value.source, ref: value.ref } };
}

export function decodeTwinSocialReportInputV1(value: unknown): TwinDirectoryDecodeResultV1<TwinSocialReportInputV1> {
  if (!isRecord(value)) return fail('invalid_type', '$');
  const bad = envelope(value, ['subjectKind', 'subjectRef', 'reason', 'note'], ['subjectKind', 'subjectRef', 'reason']);
  if (bad) return bad;
  if (!member(TWIN_SOCIAL_REPORT_SUBJECT_KINDS_V1, value.subjectKind)) return wrong(value.subjectKind, 'subjectKind');
  const patterns: Record<TwinSocialReportSubjectKindV1, RegExp> = {
    update: TWIN_BROADCAST_REF_PATTERN_V1,
    question: TWIN_SOCIAL_QUESTION_REF_PATTERN_V1,
    twin: AGENT_EXTERNAL_ID_PATTERN_V1,
    announcement: TWIN_CIRCLE_ANNOUNCEMENT_REF_PATTERN_V1,
    circle: TWIN_CIRCLE_REF_PATTERN_V1,
  };
  const pattern = patterns[value.subjectKind];
  if (typeof value.subjectRef !== 'string' || !pattern.test(value.subjectRef)) return wrong(value.subjectRef, 'subjectRef');
  if (!member(TWIN_SOCIAL_REPORT_REASONS_V1, value.reason)) return wrong(value.reason, 'reason');
  let note: string | undefined;
  if (value.note !== undefined && value.note !== '') {
    const checked = plain(value.note, TWIN_SOCIAL_SAFETY_LIMITS_V1.reportNoteMax, true);
    if (checked === null) return wrong(value.note, 'note');
    note = checked.trim();
  }
  return {
    ok: true,
    value: { schemaVersion: TWIN_SOCIAL_SCHEMA_VERSION_V1, subjectKind: value.subjectKind, subjectRef: value.subjectRef, reason: value.reason, ...(note ? { note } : {}) },
  };
}

// ── 解码：响应（网页端每个调用方都过一遍）──────────────────────────────────────────────

export function decodeTwinUpdateQuestionResultV1(value: unknown): TwinDirectoryDecodeResultV1<TwinUpdateQuestionResultV1> {
  if (!isRecord(value)) return fail('invalid_type', '$');
  const keys = ['status', 'answer', 'askedAt', 'remaining'];
  const bad = envelope(value, keys, keys);
  if (bad) return bad;
  if (!member(STATUSES, value.status)) return wrong(value.status, 'status');
  let answer: TwinUpdateQuestionResultV1['answer'] = null;
  if (value.status === 'answered') {
    if (!isRecord(value.answer)) return fail('invalid_type', 'answer');
    const extra = fields(value.answer, ['text', 'label'], ['text', 'label'], 'answer.');
    if (extra) return extra;
    const text = plain(value.answer.text, TWIN_SOCIAL_INTERACTION_LIMITS_V1.answerMax, true);
    if (text === null) return wrong(value.answer.text, 'answer.text');
    const label = value.answer.label;
    if (!isRecord(label)) return fail('invalid_type', 'answer.label');
    const labelExtra = fields(label, ['zh', 'en'], ['zh', 'en'], 'answer.label.');
    if (labelExtra) return labelExtra;
    const zh = plain(label.zh, 80);
    const en = plain(label.en, 80);
    if (zh === null) return wrong(label.zh, 'answer.label.zh');
    if (en === null) return wrong(label.en, 'answer.label.en');
    answer = { text, label: { zh, en } };
  } else if (value.answer !== null) {
    return fail('invalid_value', 'answer');
  }
  if (!isInstant(value.askedAt)) return wrong(value.askedAt, 'askedAt');
  if (!count(value.remaining, TWIN_SOCIAL_INTERACTION_LIMITS_V1.questionsPerUpdatePerUser)) return wrong(value.remaining, 'remaining', 'number');
  return {
    ok: true,
    value: { schemaVersion: TWIN_SOCIAL_SCHEMA_VERSION_V1, status: value.status, answer, askedAt: value.askedAt, remaining: value.remaining },
  };
}

export function decodeTwinUpdateMineV1(value: unknown): TwinDirectoryDecodeResultV1<TwinUpdateMineV1> {
  if (!isRecord(value)) return fail('invalid_type', '$');
  const keys = ['open', 'interested', 'remaining', 'questions'];
  const bad = envelope(value, keys, keys);
  if (bad) return bad;
  if (typeof value.open !== 'boolean') return fail('invalid_type', 'open');
  if (typeof value.interested !== 'boolean') return fail('invalid_type', 'interested');
  if (!count(value.remaining, TWIN_SOCIAL_INTERACTION_LIMITS_V1.questionsPerUpdatePerUser)) return wrong(value.remaining, 'remaining', 'number');
  if (!Array.isArray(value.questions)) return fail('invalid_type', 'questions');
  if (value.questions.length > TWIN_SOCIAL_INTERACTION_LIMITS_V1.questionsPerUpdatePerUser) return fail('invalid_value', 'questions');
  const questions: TwinUpdateMineV1['questions'] = [];
  for (let index = 0; index < value.questions.length; index += 1) {
    const item: unknown = value.questions[index];
    const at = `questions.${index}`;
    if (!isRecord(item)) return fail('invalid_type', at);
    const extra = fields(item, ['question', 'askedAt', 'status'], ['question', 'askedAt', 'status'], `${at}.`);
    if (extra) return extra;
    const question = plain(item.question, TWIN_SOCIAL_INTERACTION_LIMITS_V1.questionMax, true);
    if (question === null) return wrong(item.question, `${at}.question`);
    if (!isInstant(item.askedAt)) return wrong(item.askedAt, `${at}.askedAt`);
    if (!member(STATUSES, item.status)) return wrong(item.status, `${at}.status`);
    questions.push({ question, askedAt: item.askedAt, status: item.status });
  }
  return {
    ok: true,
    value: { schemaVersion: TWIN_SOCIAL_SCHEMA_VERSION_V1, open: value.open, interested: value.interested, remaining: value.remaining, questions },
  };
}

export function decodeTwinUpdateInteractionsV1(value: unknown): TwinDirectoryDecodeResultV1<TwinUpdateInteractionsV1> {
  if (!isRecord(value)) return fail('invalid_type', '$');
  const keys = ['broadcastRef', 'open', 'interestCount', 'questions'];
  const bad = envelope(value, keys, keys);
  if (bad) return bad;
  if (typeof value.broadcastRef !== 'string' || !TWIN_BROADCAST_REF_PATTERN_V1.test(value.broadcastRef)) return wrong(value.broadcastRef, 'broadcastRef');
  if (typeof value.open !== 'boolean') return fail('invalid_type', 'open');
  if (!count(value.interestCount, Number.MAX_SAFE_INTEGER)) return wrong(value.interestCount, 'interestCount', 'number');
  if (!Array.isArray(value.questions)) return fail('invalid_type', 'questions');
  if (value.questions.length > TWIN_SOCIAL_INTERACTION_LIMITS_V1.ownerQuestionsMax) return fail('invalid_value', 'questions');
  const questions: TwinUpdateInteractionsV1['questions'] = [];
  const keysOfItem = ['questionRef', 'askerRef', 'question', 'askedAt', 'status'];
  for (let index = 0; index < value.questions.length; index += 1) {
    const item: unknown = value.questions[index];
    const at = `questions.${index}`;
    if (!isRecord(item)) return fail('invalid_type', at);
    const extra = fields(item, keysOfItem, keysOfItem, `${at}.`);
    if (extra) return extra;
    if (typeof item.questionRef !== 'string' || !TWIN_SOCIAL_QUESTION_REF_PATTERN_V1.test(item.questionRef)) return wrong(item.questionRef, `${at}.questionRef`);
    if (typeof item.askerRef !== 'string' || !TWIN_SOCIAL_ASKER_REF_PATTERN_V1.test(item.askerRef)) return wrong(item.askerRef, `${at}.askerRef`);
    const question = plain(item.question, TWIN_SOCIAL_INTERACTION_LIMITS_V1.questionMax, true);
    if (question === null) return wrong(item.question, `${at}.question`);
    if (!isInstant(item.askedAt)) return wrong(item.askedAt, `${at}.askedAt`);
    if (!member(STATUSES, item.status)) return wrong(item.status, `${at}.status`);
    questions.push({ questionRef: item.questionRef, askerRef: item.askerRef, question, askedAt: item.askedAt, status: item.status });
  }
  return {
    ok: true,
    value: { schemaVersion: TWIN_SOCIAL_SCHEMA_VERSION_V1, broadcastRef: value.broadcastRef, open: value.open, interestCount: value.interestCount, questions },
  };
}

export function decodeTwinSocialMuteListV1(value: unknown): TwinDirectoryDecodeResultV1<TwinSocialMuteListV1> {
  if (!isRecord(value)) return fail('invalid_type', '$');
  const bad = envelope(value, ['items'], ['items']);
  if (bad) return bad;
  if (!Array.isArray(value.items)) return fail('invalid_type', 'items');
  if (value.items.length > TWIN_SOCIAL_SAFETY_LIMITS_V1.mutesListMax) return fail('invalid_value', 'items');
  const items: TwinSocialMuteListV1['items'] = [];
  const keys = ['muteRef', 'source', 'label', 'mutedAt'];
  for (let index = 0; index < value.items.length; index += 1) {
    const item: unknown = value.items[index];
    const at = `items.${index}`;
    if (!isRecord(item)) return fail('invalid_type', at);
    const extra = fields(item, keys, keys, `${at}.`);
    if (extra) return extra;
    if (typeof item.muteRef !== 'string' || !TWIN_SOCIAL_MUTE_REF_PATTERN_V1.test(item.muteRef)) return wrong(item.muteRef, `${at}.muteRef`);
    if (!member(TWIN_SOCIAL_MUTE_SOURCES_V1, item.source)) return wrong(item.source, `${at}.source`);
    if (item.label !== null && !muteLabel(item.source, item.label)) return wrong(item.label, `${at}.label`);
    if (!isInstant(item.mutedAt)) return wrong(item.mutedAt, `${at}.mutedAt`);
    items.push({ muteRef: item.muteRef, source: item.source, label: item.label as string | null, mutedAt: item.mutedAt });
  }
  return { ok: true, value: { schemaVersion: TWIN_SOCIAL_SCHEMA_VERSION_V1, items } };
}

export function decodeTwinSocialAckV1(value: unknown): TwinDirectoryDecodeResultV1<TwinSocialAckV1> {
  if (!isRecord(value)) return fail('invalid_type', '$');
  const bad = envelope(value, ['ok'], ['ok']);
  if (bad) return bad;
  if (value.ok !== true) return wrong(value.ok, 'ok', 'boolean');
  return { ok: true, value: { schemaVersion: TWIN_SOCIAL_SCHEMA_VERSION_V1, ok: true } };
}

/** 静音名单里的称呼：提问人只显示暗号；名片请求和圈子邀请显示对方公开名片上的名字。 */
function muteLabel(source: TwinSocialMuteSourceV1, label: unknown): boolean {
  if (source === 'question') return typeof label === 'string' && TWIN_SOCIAL_ASKER_REF_PATTERN_V1.test(label);
  return plain(label, TWIN_SOCIAL_SAFETY_LIMITS_V1.muteLabelMax) !== null;
}

// ── S4：可能认识的人、名片请求 ──────────────────────────────────────────────────────────

export const TWIN_RECOMMENDATION_LIMITS_V1 = {
  /** 每人每周（周一 00:00 UTC 起）最多看到几位。 */
  perWeek: 5,
  /** 同一个人最多在几个不同的周出现在同一个人的推荐里。 */
  weeksPerPerson: 2,
  /** 每人 24 小时内最多发几个名片请求。 */
  cardRequestsPerDay: 10,
  /** 没有交换（被拒或过期）后多少天内不能再向同一人发。 */
  cooldownDays: 90,
  /** 名片请求多少天没回就过期。 */
  expiryDays: 14,
  /** 发给我的、我发出的，各最多列几条。 */
  cardRequestListMax: 50,
  /** 推荐展示记录留几天。 */
  impressionRetentionDays: 56,
  /** 没有交换的名片请求留几天（从被拒或过期那天算）。 */
  closedRequestRetentionDays: 90,
  /** 挑候选时最多看多少张同行业的目录卡片。 */
  candidateScanMax: 500,
} as const;

/** 推荐理由只有这一句，不写别的。 */
export const TWIN_RECOMMENDATION_REASON_V1 = { zh: '同城 · 同行业', en: 'Same city · same industry' } as const;

export const TWIN_CARD_REQUEST_REF_PATTERN_V1 = /^tcr_[A-Za-z0-9_-]{22}$/;

/** 打开「愿意被推荐」还缺什么：公开的目录卡片、卡片上的城市。 */
export const TWIN_RECOMMENDATION_MISSING_V1 = ['listing', 'city'] as const;
export type TwinRecommendationMissingV1 = (typeof TWIN_RECOMMENDATION_MISSING_V1)[number];

export const TWIN_CARD_REQUEST_STATUSES_V1 = ['pending', 'accepted', 'declined', 'expired'] as const;
export type TwinCardRequestStatusV1 = (typeof TWIN_CARD_REQUEST_STATUSES_V1)[number];

/** 推荐卡片上我和对方的名片关系。被拒和过期都算「没有交换」，发的一方分不出来。 */
export const TWIN_CARD_EXCHANGE_STATES_V1 = ['none', 'pending', 'exchanged', 'not_exchanged'] as const;
export type TwinCardExchangeStateV1 = (typeof TWIN_CARD_EXCHANGE_STATES_V1)[number];

export interface TwinRecommendationOptInInputV1 {
  schemaVersion: typeof TWIN_SOCIAL_SCHEMA_VERSION_V1;
  optedIn: boolean;
}

export interface TwinCardRequestInputV1 {
  schemaVersion: typeof TWIN_SOCIAL_SCHEMA_VERSION_V1;
  /** 推荐卡片上那个分身的外部编号。 */
  agentExternalId: string;
}

export interface TwinRecommendationOptInV1 {
  schemaVersion: typeof TWIN_SOCIAL_SCHEMA_VERSION_V1;
  optedIn: boolean;
  /** 不为空时打不开。 */
  missing: TwinRecommendationMissingV1[];
}

/** 推荐、名片请求和圈子里显示的对方：只有公开目录卡片上的东西，没有联系方式。圈子里没填城市时 `city` 是空串。 */
export interface TwinPeopleCardV1 {
  externalId: string;
  canonicalPath: string;
  displayName: string;
  industry: TwinDirectoryIndustryV1;
  city: string;
  tagline: string;
}

export interface TwinRecommendationListV1 {
  schemaVersion: typeof TWIN_SOCIAL_SCHEMA_VERSION_V1;
  optedIn: boolean;
  items: Array<{ twin: TwinPeopleCardV1; card: TwinCardExchangeStateV1 }>;
}

export interface TwinCardRequestListV1 {
  schemaVersion: typeof TWIN_SOCIAL_SCHEMA_VERSION_V1;
  incoming: Array<{ requestRef: string; from: TwinPeopleCardV1; sentAt: string; expiresAt: string }>;
  outgoing: Array<{ requestRef: string; to: TwinPeopleCardV1; sentAt: string; state: Exclude<TwinCardExchangeStateV1, 'none'> }>;
}

export function decodeTwinRecommendationOptInInputV1(value: unknown): TwinDirectoryDecodeResultV1<TwinRecommendationOptInInputV1> {
  if (!isRecord(value)) return fail('invalid_type', '$');
  const bad = envelope(value, ['optedIn'], ['optedIn']);
  if (bad) return bad;
  if (typeof value.optedIn !== 'boolean') return wrong(value.optedIn, 'optedIn', 'boolean');
  return { ok: true, value: { schemaVersion: TWIN_SOCIAL_SCHEMA_VERSION_V1, optedIn: value.optedIn } };
}

export function decodeTwinCardRequestInputV1(value: unknown): TwinDirectoryDecodeResultV1<TwinCardRequestInputV1> {
  if (!isRecord(value)) return fail('invalid_type', '$');
  const bad = envelope(value, ['agentExternalId'], ['agentExternalId']);
  if (bad) return bad;
  if (typeof value.agentExternalId !== 'string' || !AGENT_EXTERNAL_ID_PATTERN_V1.test(value.agentExternalId)) {
    return wrong(value.agentExternalId, 'agentExternalId');
  }
  return { ok: true, value: { schemaVersion: TWIN_SOCIAL_SCHEMA_VERSION_V1, agentExternalId: value.agentExternalId } };
}

export function decodeTwinRecommendationOptInV1(value: unknown): TwinDirectoryDecodeResultV1<TwinRecommendationOptInV1> {
  if (!isRecord(value)) return fail('invalid_type', '$');
  const bad = envelope(value, ['optedIn', 'missing'], ['optedIn', 'missing']);
  if (bad) return bad;
  if (typeof value.optedIn !== 'boolean') return wrong(value.optedIn, 'optedIn', 'boolean');
  if (!Array.isArray(value.missing)) return fail('invalid_type', 'missing');
  const missing: TwinRecommendationMissingV1[] = [];
  for (const item of value.missing as unknown[]) {
    if (!member(TWIN_RECOMMENDATION_MISSING_V1, item) || missing.includes(item)) return fail('invalid_value', 'missing');
    missing.push(item);
  }
  return { ok: true, value: { schemaVersion: TWIN_SOCIAL_SCHEMA_VERSION_V1, optedIn: value.optedIn, missing } };
}

const PEOPLE_CARD_FIELDS = ['externalId', 'canonicalPath', 'displayName', 'industry', 'city', 'tagline'];
function peopleCard(value: unknown, field: string, cityOptional = false): TwinDirectoryDecodeResultV1<TwinPeopleCardV1> {
  if (!isRecord(value)) return fail('invalid_type', field);
  const bad = fields(value, PEOPLE_CARD_FIELDS, PEOPLE_CARD_FIELDS, `${field}.`);
  if (bad) return bad;
  if (typeof value.externalId !== 'string' || !AGENT_EXTERNAL_ID_PATTERN_V1.test(value.externalId)) return wrong(value.externalId, `${field}.externalId`);
  if (value.canonicalPath !== agentPublicCanonicalPathV1(value.externalId)) return wrong(value.canonicalPath, `${field}.canonicalPath`);
  const displayName = plain(value.displayName, TWIN_DIRECTORY_LIMITS_V1.displayNameMax);
  if (displayName === null) return wrong(value.displayName, `${field}.displayName`);
  if (!member(TWIN_DIRECTORY_INDUSTRIES_V1, value.industry)) return wrong(value.industry, `${field}.industry`);
  const city = cityOptional && value.city === '' ? '' : plain(value.city, TWIN_DIRECTORY_LIMITS_V1.cityMax);
  if (city === null) return wrong(value.city, `${field}.city`);
  if (typeof value.tagline !== 'string' || value.tagline.length > TWIN_DIRECTORY_LIMITS_V1.taglineMax || CONTROL.test(value.tagline)) {
    return wrong(value.tagline, `${field}.tagline`);
  }
  return { ok: true, value: { externalId: value.externalId, canonicalPath: value.canonicalPath, displayName, industry: value.industry, city, tagline: value.tagline } };
}

export function decodeTwinRecommendationListV1(value: unknown): TwinDirectoryDecodeResultV1<TwinRecommendationListV1> {
  if (!isRecord(value)) return fail('invalid_type', '$');
  const bad = envelope(value, ['optedIn', 'items'], ['optedIn', 'items']);
  if (bad) return bad;
  if (typeof value.optedIn !== 'boolean') return wrong(value.optedIn, 'optedIn', 'boolean');
  if (!Array.isArray(value.items)) return fail('invalid_type', 'items');
  if (value.items.length > TWIN_RECOMMENDATION_LIMITS_V1.perWeek) return fail('invalid_value', 'items');
  const items: TwinRecommendationListV1['items'] = [];
  for (let index = 0; index < value.items.length; index += 1) {
    const item: unknown = value.items[index];
    const at = `items.${index}`;
    if (!isRecord(item)) return fail('invalid_type', at);
    const extra = fields(item, ['twin', 'card'], ['twin', 'card'], `${at}.`);
    if (extra) return extra;
    const twin = peopleCard(item.twin, `${at}.twin`);
    if (twin.ok === false) return twin;
    if (!member(TWIN_CARD_EXCHANGE_STATES_V1, item.card)) return wrong(item.card, `${at}.card`);
    items.push({ twin: twin.value, card: item.card });
  }
  return { ok: true, value: { schemaVersion: TWIN_SOCIAL_SCHEMA_VERSION_V1, optedIn: value.optedIn, items } };
}

export function decodeTwinCardRequestListV1(value: unknown): TwinDirectoryDecodeResultV1<TwinCardRequestListV1> {
  if (!isRecord(value)) return fail('invalid_type', '$');
  const bad = envelope(value, ['incoming', 'outgoing'], ['incoming', 'outgoing']);
  if (bad) return bad;
  if (!Array.isArray(value.incoming)) return fail('invalid_type', 'incoming');
  if (!Array.isArray(value.outgoing)) return fail('invalid_type', 'outgoing');
  const max = TWIN_RECOMMENDATION_LIMITS_V1.cardRequestListMax;
  if (value.incoming.length > max) return fail('invalid_value', 'incoming');
  if (value.outgoing.length > max) return fail('invalid_value', 'outgoing');
  const incoming: TwinCardRequestListV1['incoming'] = [];
  const incomingKeys = ['requestRef', 'from', 'sentAt', 'expiresAt'];
  for (let index = 0; index < value.incoming.length; index += 1) {
    const item: unknown = value.incoming[index];
    const at = `incoming.${index}`;
    if (!isRecord(item)) return fail('invalid_type', at);
    const extra = fields(item, incomingKeys, incomingKeys, `${at}.`);
    if (extra) return extra;
    if (typeof item.requestRef !== 'string' || !TWIN_CARD_REQUEST_REF_PATTERN_V1.test(item.requestRef)) return wrong(item.requestRef, `${at}.requestRef`);
    const from = peopleCard(item.from, `${at}.from`);
    if (from.ok === false) return from;
    if (!isInstant(item.sentAt)) return wrong(item.sentAt, `${at}.sentAt`);
    if (!isInstant(item.expiresAt)) return wrong(item.expiresAt, `${at}.expiresAt`);
    incoming.push({ requestRef: item.requestRef, from: from.value, sentAt: item.sentAt, expiresAt: item.expiresAt });
  }
  const outgoing: TwinCardRequestListV1['outgoing'] = [];
  const outgoingKeys = ['requestRef', 'to', 'sentAt', 'state'];
  const states = TWIN_CARD_EXCHANGE_STATES_V1.filter((state): state is Exclude<TwinCardExchangeStateV1, 'none'> => state !== 'none');
  for (let index = 0; index < value.outgoing.length; index += 1) {
    const item: unknown = value.outgoing[index];
    const at = `outgoing.${index}`;
    if (!isRecord(item)) return fail('invalid_type', at);
    const extra = fields(item, outgoingKeys, outgoingKeys, `${at}.`);
    if (extra) return extra;
    if (typeof item.requestRef !== 'string' || !TWIN_CARD_REQUEST_REF_PATTERN_V1.test(item.requestRef)) return wrong(item.requestRef, `${at}.requestRef`);
    const to = peopleCard(item.to, `${at}.to`);
    if (to.ok === false) return to;
    if (!isInstant(item.sentAt)) return wrong(item.sentAt, `${at}.sentAt`);
    if (!member(states, item.state)) return wrong(item.state, `${at}.state`);
    outgoing.push({ requestRef: item.requestRef, to: to.value, sentAt: item.sentAt, state: item.state });
  }
  return { ok: true, value: { schemaVersion: TWIN_SOCIAL_SCHEMA_VERSION_V1, incoming, outgoing } };
}

/** 站内通知的 `data.kind`：有人请你交换名片，或你的名片请求被接受了。 */
export const TWIN_CARD_REQUEST_NOTIFICATION_KIND_V1 = 'twin_card_request';

export function twinCardRequestDedupeKeyV1(requestRef: string, event: 'sent' | 'accepted'): string {
  return `twin-card-request:${requestRef}:${event}`;
}

/** 交换名片在关系簿里的来源编号。 */
export function twinCardExchangeSourceRefV1(requestRef: string): string {
  return `twin-card:${requestRef}`;
}

/** 网页上「可能认识的人」的页面，通知也点到这里。 */
export const TWIN_PEOPLE_PATH_V1 = '/people';

export interface TwinCardRequestResultV1 {
  schemaVersion: typeof TWIN_SOCIAL_SCHEMA_VERSION_V1;
  /** 对方先请过我时，我这一请就是同意，直接交换。 */
  state: 'pending' | 'exchanged';
}

export function decodeTwinCardRequestResultV1(value: unknown): TwinDirectoryDecodeResultV1<TwinCardRequestResultV1> {
  if (!isRecord(value)) return fail('invalid_type', '$');
  const bad = envelope(value, ['state'], ['state']);
  if (bad) return bad;
  if (value.state !== 'pending' && value.state !== 'exchanged') return wrong(value.state, 'state');
  return { ok: true, value: { schemaVersion: TWIN_SOCIAL_SCHEMA_VERSION_V1, state: value.state } };
}

// ── S5：多人圈子 ──────────────────────────────────────────────────────────────────────────

export const TWIN_CIRCLE_LIMITS_V1 = {
  nameMax: 40,
  /** 一个人同时最多有几个自己建的圈子（解散的不算）。 */
  ownedPerUser: 3,
  /** 每个圈子最多几个人，圈主算在内。 */
  membersMax: 50,
  /** 一个人 24 小时内最多发几个邀请和入圈申请（合计）。 */
  invitesPerDay: 20,
  /** 邀请或申请没成（被拒或过期，发的一方分不出），多少天内不能对同一个圈子、同一个人再发。 */
  cooldownDays: 90,
  expiryDays: 14,
  /** 每个圈子滚动 7 天内最多几条公告。 */
  announcementsPerWeek: 2,
  announcementMax: 1000,
  /** 成员一次看到的公告条数（新的在前）。 */
  announcementsShown: 20,
  /** 首页一次列出的圈子和邀请各几条；圈主一次看到的待处理邀请和申请各几条。 */
  listMax: 50,
  /** 圈主一次看到的公告提问条数（新的在前）。 */
  questionsShown: 200,
  dissolvedRetentionDays: 30,
  closedInviteRetentionDays: 90,
} as const;

export const TWIN_CIRCLE_REF_PATTERN_V1 = /^tci_[A-Za-z0-9_-]{22}$/;
export const TWIN_CIRCLE_MEMBER_REF_PATTERN_V1 = /^tcm_[A-Za-z0-9_-]{22}$/;
export const TWIN_CIRCLE_INVITE_REF_PATTERN_V1 = /^tcv_[A-Za-z0-9_-]{22}$/;
export const TWIN_CIRCLE_ANNOUNCEMENT_REF_PATTERN_V1 = /^tca_[A-Za-z0-9_-]{22}$/;

/** 邀请（圈主请人）和入圈申请（别人请圈主）用同一张表。 */
export const TWIN_CIRCLE_INVITE_KINDS_V1 = ['invite', 'application'] as const;
export type TwinCircleInviteKindV1 = (typeof TWIN_CIRCLE_INVITE_KINDS_V1)[number];

export const TWIN_CIRCLE_INVITE_STATUSES_V1 = ['pending', 'accepted', 'declined', 'expired'] as const;
export type TwinCircleInviteStatusV1 = (typeof TWIN_CIRCLE_INVITE_STATUSES_V1)[number];

export const TWIN_CIRCLE_ROLES_V1 = ['owner', 'member'] as const;
export type TwinCircleRoleV1 = (typeof TWIN_CIRCLE_ROLES_V1)[number];

export const TWIN_CIRCLE_VIEWERS_V1 = ['owner', 'member', 'visitor'] as const;
export type TwinCircleViewerV1 = (typeof TWIN_CIRCLE_VIEWERS_V1)[number];

/**
 * 访客和这个圈子的关系：可以申请、要先有公开名片、申请中、这次没进（被拒和过期不分，冷却期内不能再申请）、
 * 收到了邀请（给出 `inviteRef`，可以当场接受）。圈主和成员都是 `none`。
 */
export const TWIN_CIRCLE_JOIN_STATES_V1 = ['none', 'needs_card', 'applied', 'not_joined', 'invited'] as const;
export type TwinCircleJoinStateV1 = (typeof TWIN_CIRCLE_JOIN_STATES_V1)[number];

/** 首页上能不能建圈：可以、要先有公开名片、建满了。 */
export const TWIN_CIRCLE_CREATE_STATES_V1 = ['ok', 'needs_card', 'limit'] as const;
export type TwinCircleCreateStateV1 = (typeof TWIN_CIRCLE_CREATE_STATES_V1)[number];

/** 409 的 `code`：圈子被冻结、人满了、建满了、要先有公开名片、圈主不能退出（只能解散）。 */
export const TWIN_CIRCLE_ERROR_CODES_V1 = {
  frozen: 'circle_frozen',
  full: 'circle_full',
  ownedLimit: 'circle_limit',
  needsCard: 'circle_needs_card',
  owner: 'circle_owner',
} as const;

export const TWIN_CIRCLES_PATH_V1 = '/circles';

export function twinCirclePathV1(circleRef: string): string {
  return `${TWIN_CIRCLES_PATH_V1}/${circleRef}`;
}

/** 站内通知的 `data.kind`：邀请、申请、入圈、新公告、公告下的新提问。 */
export const TWIN_CIRCLE_NOTIFICATION_KIND_V1 = 'twin_circle';

/** `scope` 让同一件事对不同的人各有一条（公告按成员编号，提问按天）。 */
export function twinCircleDedupeKeyV1(ref: string, event: 'invited' | 'applied' | 'joined' | 'announced' | 'asked', scope?: string): string {
  return `twin-circle:${ref}:${event}${scope ? `:${scope}` : ''}`;
}

export interface TwinCircleCreateInputV1 {
  schemaVersion: typeof TWIN_SOCIAL_SCHEMA_VERSION_V1;
  name: string;
}

export interface TwinCircleInviteInputV1 {
  schemaVersion: typeof TWIN_SOCIAL_SCHEMA_VERSION_V1;
  /** 要邀请的分身的外部编号（它公开名片上的那个）。 */
  agentExternalId: string;
}

export interface TwinCircleAnnouncementInputV1 {
  schemaVersion: typeof TWIN_SOCIAL_SCHEMA_VERSION_V1;
  body: string;
}

export interface TwinCircleQuestionInputV1 {
  schemaVersion: typeof TWIN_SOCIAL_SCHEMA_VERSION_V1;
  question: string;
}

export interface TwinCircleSummaryV1 {
  circleRef: string;
  name: string;
  role: TwinCircleRoleV1;
  memberCount: number;
  frozen: boolean;
}

export interface TwinCircleHomeV1 {
  schemaVersion: typeof TWIN_SOCIAL_SCHEMA_VERSION_V1;
  create: TwinCircleCreateStateV1;
  /** 「接受圈子邀请」：默认关；关着时圈主邀请不到你，你自己申请过的圈子除外。 */
  acceptInvites: boolean;
  circles: TwinCircleSummaryV1[];
  /** 收到的、还没回的邀请。`from` 是圈主的公开名片，不再公开时为 `null`。 */
  invites: Array<{ inviteRef: string; circle: { circleRef: string; name: string }; from: TwinPeopleCardV1 | null; sentAt: string; expiresAt: string }>;
}

/** 圈里的一个人：只有公开名片上的东西，名片不再公开时 `card` 为 `null`。`memberRef` 只在这个圈子里有意义。 */
export interface TwinCircleMemberV1 {
  memberRef: string;
  card: TwinPeopleCardV1 | null;
  role: TwinCircleRoleV1;
  joinedAt: string;
}

export interface TwinCircleViewV1 {
  schemaVersion: typeof TWIN_SOCIAL_SCHEMA_VERSION_V1;
  circleRef: string;
  name: string;
  owner: TwinPeopleCardV1 | null;
  memberCount: number;
  frozen: boolean;
  viewer: TwinCircleViewerV1;
  /** 只给圈主和成员；访客是空的。 */
  members: TwinCircleMemberV1[];
  /** 只给圈主和成员；访客是空的。 */
  announcements: Array<{ announcementRef: string; body: string; postedAt: string }>;
  join: TwinCircleJoinStateV1;
  /** `join` 是 `invited` 时的邀请编号，其余时候为 `null`。 */
  inviteRef: string | null;
  /** 只给圈主：发出去还没回的邀请、收到的申请、这 7 天还能发几条公告。 */
  manage: null | {
    invites: Array<{ inviteRef: string; to: TwinPeopleCardV1 | null; sentAt: string }>;
    applications: Array<{ inviteRef: string; from: TwinPeopleCardV1 | null; sentAt: string; expiresAt: string }>;
    announcementsLeft: number;
  };
}

/** 圈主看公告下的提问：提问人只有暗号。 */
export interface TwinCircleQuestionsV1 {
  schemaVersion: typeof TWIN_SOCIAL_SCHEMA_VERSION_V1;
  items: Array<{ questionRef: string; announcementRef: string; askerRef: string; question: string; askedAt: string }>;
}

/** 对方先申请或先被邀请过时，这一下就是同意，直接入圈。 */
export interface TwinCircleJoinResultV1 {
  schemaVersion: typeof TWIN_SOCIAL_SCHEMA_VERSION_V1;
  state: 'pending' | 'joined';
}

export function decodeTwinCircleCreateInputV1(value: unknown): TwinDirectoryDecodeResultV1<TwinCircleCreateInputV1> {
  if (!isRecord(value)) return fail('invalid_type', '$');
  const bad = envelope(value, ['name'], ['name']);
  if (bad) return bad;
  const name = plain(value.name, TWIN_CIRCLE_LIMITS_V1.nameMax);
  if (name === null || TWIN_SOCIAL_LINK_PATTERN_V1.test(name)) return wrong(value.name, 'name');
  return { ok: true, value: { schemaVersion: TWIN_SOCIAL_SCHEMA_VERSION_V1, name: name.trim() } };
}

export function decodeTwinCircleInviteInputV1(value: unknown): TwinDirectoryDecodeResultV1<TwinCircleInviteInputV1> {
  if (!isRecord(value)) return fail('invalid_type', '$');
  const bad = envelope(value, ['agentExternalId'], ['agentExternalId']);
  if (bad) return bad;
  if (typeof value.agentExternalId !== 'string' || !AGENT_EXTERNAL_ID_PATTERN_V1.test(value.agentExternalId)) return wrong(value.agentExternalId, 'agentExternalId');
  return { ok: true, value: { schemaVersion: TWIN_SOCIAL_SCHEMA_VERSION_V1, agentExternalId: value.agentExternalId } };
}

export function decodeTwinCircleAnnouncementInputV1(value: unknown): TwinDirectoryDecodeResultV1<TwinCircleAnnouncementInputV1> {
  if (!isRecord(value)) return fail('invalid_type', '$');
  const bad = envelope(value, ['body'], ['body']);
  if (bad) return bad;
  const body = plain(value.body, TWIN_CIRCLE_LIMITS_V1.announcementMax, true);
  if (body === null || TWIN_SOCIAL_LINK_PATTERN_V1.test(body)) return wrong(value.body, 'body');
  return { ok: true, value: { schemaVersion: TWIN_SOCIAL_SCHEMA_VERSION_V1, body: body.trim() } };
}

export function decodeTwinCircleQuestionInputV1(value: unknown): TwinDirectoryDecodeResultV1<TwinCircleQuestionInputV1> {
  if (!isRecord(value)) return fail('invalid_type', '$');
  const bad = envelope(value, ['question'], ['question']);
  if (bad) return bad;
  const question = plain(value.question, TWIN_SOCIAL_INTERACTION_LIMITS_V1.questionMax, true);
  if (question === null || TWIN_SOCIAL_LINK_PATTERN_V1.test(question)) return wrong(value.question, 'question');
  return { ok: true, value: { schemaVersion: TWIN_SOCIAL_SCHEMA_VERSION_V1, question: question.trim() } };
}

function nullableCard(value: unknown, field: string): TwinDirectoryDecodeResultV1<TwinPeopleCardV1 | null> {
  return value === null ? { ok: true, value: null } : peopleCard(value, field, true);
}

function circleRef(value: unknown): value is string {
  return typeof value === 'string' && TWIN_CIRCLE_REF_PATTERN_V1.test(value);
}

function inviteRef(value: unknown): value is string {
  return typeof value === 'string' && TWIN_CIRCLE_INVITE_REF_PATTERN_V1.test(value);
}

function circleName(value: unknown): string | null {
  return plain(value, TWIN_CIRCLE_LIMITS_V1.nameMax);
}

/** 「接受圈子邀请」开关。关掉只挡新的邀请，已经收到的还在。 */
export interface TwinCirclePrefsInputV1 {
  schemaVersion: typeof TWIN_SOCIAL_SCHEMA_VERSION_V1;
  acceptInvites: boolean;
}

export function decodeTwinCirclePrefsInputV1(value: unknown): TwinDirectoryDecodeResultV1<TwinCirclePrefsInputV1> {
  if (!isRecord(value)) return fail('invalid_type', '$');
  const bad = envelope(value, ['acceptInvites'], ['acceptInvites']);
  if (bad) return bad;
  if (typeof value.acceptInvites !== 'boolean') return wrong(value.acceptInvites, 'acceptInvites', 'boolean');
  return { ok: true, value: { schemaVersion: TWIN_SOCIAL_SCHEMA_VERSION_V1, acceptInvites: value.acceptInvites } };
}

export function decodeTwinCircleHomeV1(value: unknown): TwinDirectoryDecodeResultV1<TwinCircleHomeV1> {
  if (!isRecord(value)) return fail('invalid_type', '$');
  const bad = envelope(value, ['create', 'acceptInvites', 'circles', 'invites'], ['create', 'acceptInvites', 'circles', 'invites']);
  if (bad) return bad;
  if (!member(TWIN_CIRCLE_CREATE_STATES_V1, value.create)) return wrong(value.create, 'create');
  if (typeof value.acceptInvites !== 'boolean') return wrong(value.acceptInvites, 'acceptInvites', 'boolean');
  if (!Array.isArray(value.circles) || value.circles.length > TWIN_CIRCLE_LIMITS_V1.listMax) return fail('invalid_value', 'circles');
  if (!Array.isArray(value.invites) || value.invites.length > TWIN_CIRCLE_LIMITS_V1.listMax) return fail('invalid_value', 'invites');
  const circles: TwinCircleSummaryV1[] = [];
  const summaryKeys = ['circleRef', 'name', 'role', 'memberCount', 'frozen'];
  for (let index = 0; index < value.circles.length; index += 1) {
    const item: unknown = value.circles[index];
    const at = `circles.${index}`;
    if (!isRecord(item)) return fail('invalid_type', at);
    const extra = fields(item, summaryKeys, summaryKeys, `${at}.`);
    if (extra) return extra;
    if (!circleRef(item.circleRef)) return wrong(item.circleRef, `${at}.circleRef`);
    const name = circleName(item.name);
    if (name === null) return wrong(item.name, `${at}.name`);
    if (!member(TWIN_CIRCLE_ROLES_V1, item.role)) return wrong(item.role, `${at}.role`);
    if (!count(item.memberCount, TWIN_CIRCLE_LIMITS_V1.membersMax) || item.memberCount < 1) return wrong(item.memberCount, `${at}.memberCount`, 'number');
    if (typeof item.frozen !== 'boolean') return wrong(item.frozen, `${at}.frozen`, 'boolean');
    circles.push({ circleRef: item.circleRef, name, role: item.role, memberCount: item.memberCount, frozen: item.frozen });
  }
  const invites: TwinCircleHomeV1['invites'] = [];
  const inviteKeys = ['inviteRef', 'circle', 'from', 'sentAt', 'expiresAt'];
  for (let index = 0; index < value.invites.length; index += 1) {
    const item: unknown = value.invites[index];
    const at = `invites.${index}`;
    if (!isRecord(item)) return fail('invalid_type', at);
    const extra = fields(item, inviteKeys, inviteKeys, `${at}.`);
    if (extra) return extra;
    if (!inviteRef(item.inviteRef)) return wrong(item.inviteRef, `${at}.inviteRef`);
    if (!isRecord(item.circle)) return fail('invalid_type', `${at}.circle`);
    const circleExtra = fields(item.circle, ['circleRef', 'name'], ['circleRef', 'name'], `${at}.circle.`);
    if (circleExtra) return circleExtra;
    if (!circleRef(item.circle.circleRef)) return wrong(item.circle.circleRef, `${at}.circle.circleRef`);
    const name = circleName(item.circle.name);
    if (name === null) return wrong(item.circle.name, `${at}.circle.name`);
    const from = nullableCard(item.from, `${at}.from`);
    if (from.ok === false) return from;
    if (!isInstant(item.sentAt)) return wrong(item.sentAt, `${at}.sentAt`);
    if (!isInstant(item.expiresAt)) return wrong(item.expiresAt, `${at}.expiresAt`);
    invites.push({ inviteRef: item.inviteRef, circle: { circleRef: item.circle.circleRef, name }, from: from.value, sentAt: item.sentAt, expiresAt: item.expiresAt });
  }
  return { ok: true, value: { schemaVersion: TWIN_SOCIAL_SCHEMA_VERSION_V1, create: value.create, acceptInvites: value.acceptInvites, circles, invites } };
}

const VIEW_KEYS = ['circleRef', 'name', 'owner', 'memberCount', 'frozen', 'viewer', 'members', 'announcements', 'join', 'inviteRef', 'manage'];

export function decodeTwinCircleViewV1(value: unknown): TwinDirectoryDecodeResultV1<TwinCircleViewV1> {
  if (!isRecord(value)) return fail('invalid_type', '$');
  const bad = envelope(value, VIEW_KEYS, VIEW_KEYS);
  if (bad) return bad;
  const limits = TWIN_CIRCLE_LIMITS_V1;
  if (!circleRef(value.circleRef)) return wrong(value.circleRef, 'circleRef');
  const name = circleName(value.name);
  if (name === null) return wrong(value.name, 'name');
  const owner = nullableCard(value.owner, 'owner');
  if (owner.ok === false) return owner;
  if (!count(value.memberCount, limits.membersMax) || value.memberCount < 1) return wrong(value.memberCount, 'memberCount', 'number');
  if (typeof value.frozen !== 'boolean') return wrong(value.frozen, 'frozen', 'boolean');
  if (!member(TWIN_CIRCLE_VIEWERS_V1, value.viewer)) return wrong(value.viewer, 'viewer');
  const viewer = value.viewer;

  if (!Array.isArray(value.members) || value.members.length > limits.membersMax || (viewer === 'visitor' && value.members.length > 0)) return fail('invalid_value', 'members');
  const members: TwinCircleMemberV1[] = [];
  const memberKeys = ['memberRef', 'card', 'role', 'joinedAt'];
  for (let index = 0; index < value.members.length; index += 1) {
    const item: unknown = value.members[index];
    const at = `members.${index}`;
    if (!isRecord(item)) return fail('invalid_type', at);
    const extra = fields(item, memberKeys, memberKeys, `${at}.`);
    if (extra) return extra;
    if (typeof item.memberRef !== 'string' || !TWIN_CIRCLE_MEMBER_REF_PATTERN_V1.test(item.memberRef)) return wrong(item.memberRef, `${at}.memberRef`);
    const card = nullableCard(item.card, `${at}.card`);
    if (card.ok === false) return card;
    if (!member(TWIN_CIRCLE_ROLES_V1, item.role)) return wrong(item.role, `${at}.role`);
    if (!isInstant(item.joinedAt)) return wrong(item.joinedAt, `${at}.joinedAt`);
    members.push({ memberRef: item.memberRef, card: card.value, role: item.role, joinedAt: item.joinedAt });
  }

  if (!Array.isArray(value.announcements) || value.announcements.length > limits.announcementsShown || (viewer === 'visitor' && value.announcements.length > 0)) {
    return fail('invalid_value', 'announcements');
  }
  const announcements: TwinCircleViewV1['announcements'] = [];
  const announcementKeys = ['announcementRef', 'body', 'postedAt'];
  for (let index = 0; index < value.announcements.length; index += 1) {
    const item: unknown = value.announcements[index];
    const at = `announcements.${index}`;
    if (!isRecord(item)) return fail('invalid_type', at);
    const extra = fields(item, announcementKeys, announcementKeys, `${at}.`);
    if (extra) return extra;
    if (typeof item.announcementRef !== 'string' || !TWIN_CIRCLE_ANNOUNCEMENT_REF_PATTERN_V1.test(item.announcementRef)) return wrong(item.announcementRef, `${at}.announcementRef`);
    const body = plain(item.body, limits.announcementMax, true);
    if (body === null) return wrong(item.body, `${at}.body`);
    if (!isInstant(item.postedAt)) return wrong(item.postedAt, `${at}.postedAt`);
    announcements.push({ announcementRef: item.announcementRef, body, postedAt: item.postedAt });
  }

  if (!member(TWIN_CIRCLE_JOIN_STATES_V1, value.join) || (viewer !== 'visitor' && value.join !== 'none')) return wrong(value.join, 'join');
  const join = value.join;
  if (join === 'invited' ? !inviteRef(value.inviteRef) : value.inviteRef !== null) return wrong(value.inviteRef, 'inviteRef');
  const invitedBy = join === 'invited' ? (value.inviteRef as string) : null;

  let manage: TwinCircleViewV1['manage'] = null;
  if (viewer === 'owner') {
    if (!isRecord(value.manage)) return fail('invalid_type', 'manage');
    const manageKeys = ['invites', 'applications', 'announcementsLeft'];
    const extra = fields(value.manage, manageKeys, manageKeys, 'manage.');
    if (extra) return extra;
    const { invites: rawInvites, applications: rawApplications, announcementsLeft } = value.manage;
    if (!Array.isArray(rawInvites) || rawInvites.length > limits.listMax) return fail('invalid_value', 'manage.invites');
    if (!Array.isArray(rawApplications) || rawApplications.length > limits.listMax) return fail('invalid_value', 'manage.applications');
    if (!count(announcementsLeft, limits.announcementsPerWeek)) return wrong(announcementsLeft, 'manage.announcementsLeft', 'number');
    const invites: NonNullable<TwinCircleViewV1['manage']>['invites'] = [];
    for (let index = 0; index < rawInvites.length; index += 1) {
      const item: unknown = rawInvites[index];
      const at = `manage.invites.${index}`;
      if (!isRecord(item)) return fail('invalid_type', at);
      const keys = ['inviteRef', 'to', 'sentAt'];
      const itemExtra = fields(item, keys, keys, `${at}.`);
      if (itemExtra) return itemExtra;
      if (!inviteRef(item.inviteRef)) return wrong(item.inviteRef, `${at}.inviteRef`);
      const to = nullableCard(item.to, `${at}.to`);
      if (to.ok === false) return to;
      if (!isInstant(item.sentAt)) return wrong(item.sentAt, `${at}.sentAt`);
      invites.push({ inviteRef: item.inviteRef, to: to.value, sentAt: item.sentAt });
    }
    const applications: NonNullable<TwinCircleViewV1['manage']>['applications'] = [];
    for (let index = 0; index < rawApplications.length; index += 1) {
      const item: unknown = rawApplications[index];
      const at = `manage.applications.${index}`;
      if (!isRecord(item)) return fail('invalid_type', at);
      const keys = ['inviteRef', 'from', 'sentAt', 'expiresAt'];
      const itemExtra = fields(item, keys, keys, `${at}.`);
      if (itemExtra) return itemExtra;
      if (!inviteRef(item.inviteRef)) return wrong(item.inviteRef, `${at}.inviteRef`);
      const from = nullableCard(item.from, `${at}.from`);
      if (from.ok === false) return from;
      if (!isInstant(item.sentAt)) return wrong(item.sentAt, `${at}.sentAt`);
      if (!isInstant(item.expiresAt)) return wrong(item.expiresAt, `${at}.expiresAt`);
      applications.push({ inviteRef: item.inviteRef, from: from.value, sentAt: item.sentAt, expiresAt: item.expiresAt });
    }
    manage = { invites, applications, announcementsLeft };
  } else if (value.manage !== null) {
    return wrong(value.manage, 'manage');
  }

  return {
    ok: true,
    value: {
      schemaVersion: TWIN_SOCIAL_SCHEMA_VERSION_V1,
      circleRef: value.circleRef,
      name,
      owner: owner.value,
      memberCount: value.memberCount,
      frozen: value.frozen,
      viewer,
      members,
      announcements,
      join,
      inviteRef: invitedBy,
      manage,
    },
  };
}

export function decodeTwinCircleQuestionsV1(value: unknown): TwinDirectoryDecodeResultV1<TwinCircleQuestionsV1> {
  if (!isRecord(value)) return fail('invalid_type', '$');
  const bad = envelope(value, ['items'], ['items']);
  if (bad) return bad;
  if (!Array.isArray(value.items) || value.items.length > TWIN_CIRCLE_LIMITS_V1.questionsShown) return fail('invalid_value', 'items');
  const items: TwinCircleQuestionsV1['items'] = [];
  const keys = ['questionRef', 'announcementRef', 'askerRef', 'question', 'askedAt'];
  for (let index = 0; index < value.items.length; index += 1) {
    const item: unknown = value.items[index];
    const at = `items.${index}`;
    if (!isRecord(item)) return fail('invalid_type', at);
    const extra = fields(item, keys, keys, `${at}.`);
    if (extra) return extra;
    if (typeof item.questionRef !== 'string' || !TWIN_SOCIAL_QUESTION_REF_PATTERN_V1.test(item.questionRef)) return wrong(item.questionRef, `${at}.questionRef`);
    if (typeof item.announcementRef !== 'string' || !TWIN_CIRCLE_ANNOUNCEMENT_REF_PATTERN_V1.test(item.announcementRef)) return wrong(item.announcementRef, `${at}.announcementRef`);
    if (typeof item.askerRef !== 'string' || !TWIN_SOCIAL_ASKER_REF_PATTERN_V1.test(item.askerRef)) return wrong(item.askerRef, `${at}.askerRef`);
    const question = plain(item.question, TWIN_SOCIAL_INTERACTION_LIMITS_V1.questionMax, true);
    if (question === null) return wrong(item.question, `${at}.question`);
    if (!isInstant(item.askedAt)) return wrong(item.askedAt, `${at}.askedAt`);
    items.push({ questionRef: item.questionRef, announcementRef: item.announcementRef, askerRef: item.askerRef, question, askedAt: item.askedAt });
  }
  return { ok: true, value: { schemaVersion: TWIN_SOCIAL_SCHEMA_VERSION_V1, items } };
}

export function decodeTwinCircleJoinResultV1(value: unknown): TwinDirectoryDecodeResultV1<TwinCircleJoinResultV1> {
  if (!isRecord(value)) return fail('invalid_type', '$');
  const bad = envelope(value, ['state'], ['state']);
  if (bad) return bad;
  if (value.state !== 'pending' && value.state !== 'joined') return wrong(value.state, 'state');
  return { ok: true, value: { schemaVersion: TWIN_SOCIAL_SCHEMA_VERSION_V1, state: value.state } };
}

// ---------------------------------------------------------------------------
// Reports queue for admins (L9.2 batch 14, E251): admin console only, permission `twin_social.moderate`.
// ---------------------------------------------------------------------------

export const TWIN_SOCIAL_REPORT_REF_PATTERN_V1 = /^tsr_[A-Za-z0-9_-]{22}$/;
export const TWIN_SOCIAL_REPORT_STATUSES_V1 = ['open', 'dismissed', 'actioned'] as const;
export type TwinSocialReportStatusV1 = (typeof TWIN_SOCIAL_REPORT_STATUSES_V1)[number];

/**
 * `dismiss` closes a report as not a problem; `pause` stops the reported person from starting anything (questions, card
 * requests, circles) and closes the report as acted on; `lift` ends that pause; `freeze` / `unfreeze` act on the circle of
 * a circle or announcement report (`freeze` also closes the report as acted on).
 */
export const TWIN_SOCIAL_ADMIN_ACTIONS_V1 = ['dismiss', 'pause', 'lift', 'freeze', 'unfreeze'] as const;
export type TwinSocialAdminActionV1 = (typeof TWIN_SOCIAL_ADMIN_ACTIONS_V1)[number];

/** Under the admin API base: `GET` lists (`?status=all` for closed ones too), `POST <path>/<reportRef>/<action>` acts. */
export const TWIN_SOCIAL_ADMIN_REPORTS_PATH_V1 = '/admin/twin-social/reports';
export const TWIN_SOCIAL_ADMIN_LIMITS_V1 = { listMax: 100, previewMax: 280 } as const;
export const TWIN_SOCIAL_ADMIN_TARGET_REF_PATTERN_V1 = /^tgt_[0-9a-f]{16}$/;

/**
 * One report in the admin queue. Who reported never appears. The reported person appears only as `target.ref`, a digest
 * that stays the same across reports (so a repeat target is visible), never an account id.
 */
export interface TwinSocialAdminReportV1 {
  reportRef: string;
  subjectKind: TwinSocialReportSubjectKindV1;
  subjectRef: string;
  reason: TwinSocialReportReasonV1;
  note: string | null;
  status: TwinSocialReportStatusV1;
  reportedAt: string;
  resolvedAt: string | null;
  target: { ref: string; paused: boolean; openReports: number };
  /** What was reported, as it is now (at most 280 characters); null once it is gone. */
  preview: string | null;
  /** Circle and announcement reports only: the circle and whether it is frozen; null for other kinds and dissolved circles. */
  circle: { circleRef: string; frozen: boolean } | null;
}

export interface TwinSocialAdminReportListV1 {
  schemaVersion: typeof TWIN_SOCIAL_SCHEMA_VERSION_V1;
  items: TwinSocialAdminReportV1[];
  /** Open reports in the whole table, not only the listed ones. */
  openCount: number;
}

const ADMIN_REPORT_KEYS = ['reportRef', 'subjectKind', 'subjectRef', 'reason', 'note', 'status', 'reportedAt', 'resolvedAt', 'target', 'preview', 'circle'];
const ADMIN_SUBJECT_REF = /^[A-Za-z0-9_-]{1,64}$/;

export function decodeTwinSocialAdminReportListV1(value: unknown): TwinDirectoryDecodeResultV1<TwinSocialAdminReportListV1> {
  if (!isRecord(value)) return fail('invalid_type', '$');
  const bad = envelope(value, ['items', 'openCount'], ['items', 'openCount']);
  if (bad) return bad;
  if (!count(value.openCount, Number.MAX_SAFE_INTEGER)) return wrong(value.openCount, 'openCount', 'number');
  if (!Array.isArray(value.items) || value.items.length > TWIN_SOCIAL_ADMIN_LIMITS_V1.listMax) return fail('invalid_value', 'items');
  const items: TwinSocialAdminReportV1[] = [];
  for (let index = 0; index < value.items.length; index += 1) {
    const item: unknown = value.items[index];
    const at = `items.${index}`;
    if (!isRecord(item)) return fail('invalid_type', at);
    const extra = fields(item, ADMIN_REPORT_KEYS, ADMIN_REPORT_KEYS, `${at}.`);
    if (extra) return extra;
    if (typeof item.reportRef !== 'string' || !TWIN_SOCIAL_REPORT_REF_PATTERN_V1.test(item.reportRef)) return wrong(item.reportRef, `${at}.reportRef`);
    if (!member(TWIN_SOCIAL_REPORT_SUBJECT_KINDS_V1, item.subjectKind)) return wrong(item.subjectKind, `${at}.subjectKind`);
    if (typeof item.subjectRef !== 'string' || !ADMIN_SUBJECT_REF.test(item.subjectRef)) return wrong(item.subjectRef, `${at}.subjectRef`);
    if (!member(TWIN_SOCIAL_REPORT_REASONS_V1, item.reason)) return wrong(item.reason, `${at}.reason`);
    const note = item.note === null ? null : plain(item.note, TWIN_SOCIAL_SAFETY_LIMITS_V1.reportNoteMax, true);
    if (item.note !== null && note === null) return wrong(item.note, `${at}.note`);
    if (!member(TWIN_SOCIAL_REPORT_STATUSES_V1, item.status)) return wrong(item.status, `${at}.status`);
    if (!isInstant(item.reportedAt)) return wrong(item.reportedAt, `${at}.reportedAt`);
    if (item.resolvedAt !== null && !isInstant(item.resolvedAt)) return wrong(item.resolvedAt, `${at}.resolvedAt`);
    const target = item.target;
    if (!isRecord(target)) return fail('invalid_type', `${at}.target`);
    const targetExtra = fields(target, ['ref', 'paused', 'openReports'], ['ref', 'paused', 'openReports'], `${at}.target.`);
    if (targetExtra) return targetExtra;
    if (typeof target.ref !== 'string' || !TWIN_SOCIAL_ADMIN_TARGET_REF_PATTERN_V1.test(target.ref)) return wrong(target.ref, `${at}.target.ref`);
    if (typeof target.paused !== 'boolean') return wrong(target.paused, `${at}.target.paused`, 'boolean');
    if (!count(target.openReports, Number.MAX_SAFE_INTEGER)) return wrong(target.openReports, `${at}.target.openReports`, 'number');
    const preview = item.preview === null ? null : plain(item.preview, TWIN_SOCIAL_ADMIN_LIMITS_V1.previewMax, true);
    if (item.preview !== null && preview === null) return wrong(item.preview, `${at}.preview`);
    let circle: TwinSocialAdminReportV1['circle'] = null;
    if (item.circle !== null) {
      if (item.subjectKind !== 'circle' && item.subjectKind !== 'announcement') return fail('invalid_value', `${at}.circle`);
      if (!isRecord(item.circle)) return fail('invalid_type', `${at}.circle`);
      const circleExtra = fields(item.circle, ['circleRef', 'frozen'], ['circleRef', 'frozen'], `${at}.circle.`);
      if (circleExtra) return circleExtra;
      if (typeof item.circle.circleRef !== 'string' || !TWIN_CIRCLE_REF_PATTERN_V1.test(item.circle.circleRef)) return wrong(item.circle.circleRef, `${at}.circle.circleRef`);
      if (typeof item.circle.frozen !== 'boolean') return wrong(item.circle.frozen, `${at}.circle.frozen`, 'boolean');
      circle = { circleRef: item.circle.circleRef, frozen: item.circle.frozen };
    }
    items.push({
      reportRef: item.reportRef,
      subjectKind: item.subjectKind,
      subjectRef: item.subjectRef,
      reason: item.reason,
      note,
      status: item.status,
      reportedAt: item.reportedAt,
      resolvedAt: item.resolvedAt === null ? null : (item.resolvedAt as string),
      target: { ref: target.ref, paused: target.paused, openReports: target.openReports },
      preview,
      circle,
    });
  }
  return { ok: true, value: { schemaVersion: TWIN_SOCIAL_SCHEMA_VERSION_V1, items, openCount: value.openCount } };
}
