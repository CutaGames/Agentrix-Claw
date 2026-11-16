/**
 * 分身们商量（twin huddle，合同 v0；设计稿 `.agents/tasks/twin-social-net/brief.md`）。
 *
 * 发起人说一句「这周找老张、阿 May 吃个饭」：发起人的分身给 1–9 位朋友发一张商量单（事由、候选时间、地区、
 * 人均档、可选的一句备注）。每位朋友的分身对每个候选时间只答「行 / 不行 / 要问本人」，依据只有四种：本人确认过的话、
 * 本人公开的空档、本人在朋友档里放开的偏好、本人亲自回的一句。不推断、不承诺、不谈钱、不给联系方式（同
 * `twin-prechat.ts`）。默认不给理由：对外只有「这个时间不行」。
 *
 * - 谁怎么作答（`twinHuddleCanStartV0`）：双方互相定过档（`agent-pass.ts` 的四档任一档，两个方向都要有）、有分身且
 *   开了商量的，由分身作答（`twin`）；双向定过档、但没建分身或没开商量的，平台在站内请本人点选（`owner`）。不是双向的、
 *   屏蔽了发起人的、当天被约满的，平台不联系对方，只给发起人一条个人链接由发起人自己转（`link`），发起人看不出是哪一条。
 * - 链接名额（`guestLabels`，owner 11-15 定）：没注册的朋友也能约。发起人只填一个称呼、不填联系方式，对方打开链接
 *   不用登录就能点选。朋友和链接名额合计 1–9 人；名额的 ref 是 `guest:<序号>`（`twinHuddleGuestRefV0`）。
 * - 方案（`twinHuddleProposalsV0`）是确定性计算：先排所有被约的人都说「行」的时间；没有的话排能来人最多的时间；
 *   最多 3 个。人均档取发起人和能来的人里最低的一档；忌口可能透露信仰或健康，只给合并后的清单，不标是谁的。
 *   「要问本人」到收集截止还没回的，按「不行」算。模型只在 `TWIN_HUDDLE_FIXED_PHRASES_V0` 里把方案写成句子。
 * - 状态（`twinHuddleNextStatusV0`）：draft → collecting → choosing → confirming → settled；未结束时发起人可以
 *   取消（cancelled），凑不齐时间、发起人超时不选、没人确认都是 expired。确认阶段超时不回的人算不参加，
 *   不替人默认同意（`twinHuddleConfirmEventV0`）。
 * - 自由文本只有发起人的备注一处，要过 `twinPrechatTextViolationsV0`。
 * - v0 不含：订位定金和 AA、每条作答前的代表权限检查（后端接线时照 `twin-prechat.ts` 接
 *   `representation-mandate.ts`）。
 *
 * 开关（后端接线时才读）：服务端 `TWIN_HUDDLE_V0_ENABLED`，只认精确的 `'1'`；网页 `NEXT_PUBLIC_TWIN_HUDDLE_ENABLED`；
 * 手机 `EXPO_PUBLIC_TWIN_HUDDLE`。
 * 本文件只有常量、类型和纯函数：不读环境变量、不碰数据库、不调模型。
 */
import { AGENT_PASS_TIER_PRESETS_V1, type AgentPassTierPresetV1 } from './agent-pass';
import type { CalendarWindowForChatV1 } from './calendar-event-window';
import { INTRODUCTION_NEED_REGIONS_V1, type IntroductionNeedRegionV1 } from './introduction';
import { twinPrechatTextViolationsV0, type TwinPrechatSlotV0 } from './twin-prechat';

export const TWIN_HUDDLE_SCHEMA_VERSION_V0 = 'agentrix.twin-huddle.v0' as const;
export const TWIN_HUDDLE_FLAG_V0 = 'TWIN_HUDDLE_V0_ENABLED';
export const TWIN_HUDDLE_WEB_FLAG_V0 = 'NEXT_PUBLIC_TWIN_HUDDLE_ENABLED';
export const TWIN_HUDDLE_MOBILE_FLAG_V0 = 'EXPO_PUBLIC_TWIN_HUDDLE';

export const TWIN_HUDDLE_LIMITS_V0 = {
  /** 朋友和链接名额合计的上限。 */
  friendsMax: 9,
  /** 链接名额的称呼最多几个字。 */
  guestLabelMax: 20,
  candidatesMax: 6,
  slotMinMs: 30 * 60 * 1000,
  slotMaxMs: 12 * 60 * 60 * 1000,
  /** 候选时间最晚从现在起多久之内开始。 */
  horizonMs: 30 * 24 * 60 * 60 * 1000,
  proposalsMax: 3,
  noteMax: 300,
  collectWindowMs: 24 * 60 * 60 * 1000,
  chooseWindowMs: 24 * 60 * 60 * 1000,
  confirmWindowMs: 24 * 60 * 60 * 1000,
  perInitiatorPerDay: 5,
  /** 每人每天被约的上限；本人只能调低。 */
  perFriendPerDayMax: 10,
  perPairPerWeek: 5,
  retentionDays: 90,
} as const;

export const TWIN_HUDDLE_KINDS_V0 = ['meal', 'sport', 'outing', 'carpool', 'party', 'other'] as const;
export type TwinHuddleKindV0 = (typeof TWIN_HUDDLE_KINDS_V0)[number];

/** 人均档，从低到高；`any` 是不限。只是档位，不是金额。 */
export const TWIN_HUDDLE_BUDGET_BANDS_V0 = ['any', 'low', 'mid', 'high'] as const;
export type TwinHuddleBudgetBandV0 = (typeof TWIN_HUDDLE_BUDGET_BANDS_V0)[number];

/** 忌口。只在本人放开给朋友档、或本人亲自回了时才有。 */
export const TWIN_HUDDLE_DIET_TAGS_V0 = ['no_spicy', 'vegetarian', 'vegan', 'halal', 'no_beef', 'no_pork', 'no_seafood', 'no_alcohol'] as const;
export type TwinHuddleDietTagV0 = (typeof TWIN_HUDDLE_DIET_TAGS_V0)[number];

export const TWIN_HUDDLE_AVAILABILITY_V0 = ['yes', 'no', 'needs_owner'] as const;
export type TwinHuddleAvailabilityV0 = (typeof TWIN_HUDDLE_AVAILABILITY_V0)[number];

/** 「行 / 不行」的依据；`needs_owner` 不带依据。 */
export const TWIN_HUDDLE_BASES_V0 = ['owner_confirmed', 'published_slots', 'friend_tier', 'owner_reply'] as const;
export type TwinHuddleBasisV0 = (typeof TWIN_HUDDLE_BASES_V0)[number];

export const TWIN_HUDDLE_STATUSES_V0 = ['draft', 'collecting', 'choosing', 'confirming', 'settled', 'cancelled', 'expired'] as const;
export type TwinHuddleStatusV0 = (typeof TWIN_HUDDLE_STATUSES_V0)[number];

export const TWIN_HUDDLE_EVENTS_V0 = [
  'send',
  'answers_complete',
  'collect_timeout',
  'choose',
  'no_common_time',
  'choose_timeout',
  'confirm_complete',
  'confirm_timeout',
  'nobody_confirmed',
  'cancel',
] as const;
export type TwinHuddleEventV0 = (typeof TWIN_HUDDLE_EVENTS_V0)[number];

export const TWIN_HUDDLE_CONFIRMATIONS_V0 = ['confirmed', 'declined'] as const;
export type TwinHuddleConfirmationV0 = (typeof TWIN_HUDDLE_CONFIRMATIONS_V0)[number];

/** 按 `twinHuddleCanStartV0` 的判断顺序排。 */
export const TWIN_HUDDLE_REFUSAL_CODES_V0 = ['initiator_not_opted_in', 'initiator_daily_limit', 'friend_count', 'duplicate_friend', 'none_available'] as const;
export type TwinHuddleRefusalCodeV0 = (typeof TWIN_HUDDLE_REFUSAL_CODES_V0)[number];

/** 朋友自己的情况。平台不联系对方，发起人只拿到一条个人链接（`link`），看不到是哪一条；原因只进朋友本人的复核。 */
export const TWIN_HUDDLE_FRIEND_PRIVATE_REASONS_V0 = ['not_mutual', 'blocked', 'daily_limit'] as const;
export type TwinHuddleFriendPrivateReasonV0 = (typeof TWIN_HUDDLE_FRIEND_PRIVATE_REASONS_V0)[number];

/**
 * `twin` 由分身作答；`owner` 由平台在站内请本人点选；`link` 平台不联系对方，由发起人自己转个人链接；
 * `pair_weekly_limit` 这一对本周约满了，这次不约；`unavailable` 是 ref 已经不指向一个人（后端用），这次不约。
 */
export const TWIN_HUDDLE_FRIEND_ROUTES_V0 = ['twin', 'owner', 'link', 'pair_weekly_limit', 'unavailable'] as const;
export type TwinHuddleFriendRouteV0 = (typeof TWIN_HUDDLE_FRIEND_ROUTES_V0)[number];

export const TWIN_HUDDLE_REASON_CODES_V0 = ['invalid_type', 'invalid_value', 'unknown_field', 'missing_field', 'too_long', 'text_violation'] as const;
export type TwinHuddleReasonCodeV0 = (typeof TWIN_HUDDLE_REASON_CODES_V0)[number];

export type TwinHuddleDecodeResultV0<T> = { ok: true; value: T } | { ok: false; reasonCode: TwinHuddleReasonCodeV0; field: string };

// ── 商量单和作答 ────────────────────────────────────────────────────────────────

export interface TwinHuddleRequestV0 {
  kind: TwinHuddleKindV0;
  /** 1–6 个候选时间，按开始时间从早到晚、不重复；作答里的 `candidate` 就是这里的下标。 */
  candidates: TwinPrechatSlotV0[];
  /** 不填就是哪里都行。 */
  region?: IntroductionNeedRegionV1;
  budget: TwinHuddleBudgetBandV0;
  /** 朋友的不透明 ref，不重复，不能以 `guest:` 开头；只约链接名额时可以为空。 */
  friendRefs: string[];
  /** 链接名额的称呼，1–20 个字，不重复；和 `friendRefs` 合计 1–9。解码后为空就不出现。 */
  guestLabels?: string[];
  note?: string;
}

export interface TwinHuddleSlotAnswerV0 {
  candidate: number;
  value: TwinHuddleAvailabilityV0;
  /** `yes` / `no` 必带，`needs_owner` 不带。 */
  basis?: TwinHuddleBasisV0;
}

export interface TwinHuddleAnswerV0 {
  friendRef: string;
  /** 每个候选时间正好一条，按下标排好。 */
  slots: TwinHuddleSlotAnswerV0[];
  budgetMax?: TwinHuddleBudgetBandV0;
  /** 按 `TWIN_HUDDLE_DIET_TAGS_V0` 的顺序。 */
  dietTags?: TwinHuddleDietTagV0[];
}

export interface TwinHuddleProposalV0 {
  candidate: number;
  slot: TwinPrechatSlotV0;
  /** 说「行」的朋友，按 ref 排序。 */
  attendees: string[];
  /** 所有被约的朋友都说了「行」。 */
  everyone: boolean;
  budget: TwinHuddleBudgetBandV0;
  /** 能来的人的忌口合并后的清单，按 `TWIN_HUDDLE_DIET_TAGS_V0` 的顺序，不标是谁的。 */
  dietTags: TwinHuddleDietTagV0[];
}

export interface TwinHuddleFriendStateV0 {
  ref: string;
  /** ref 还指向发起人协作关系里的一个人；那条关系删了就是 false，路线是 `unavailable`。 */
  known: boolean;
  /** 平台能在站内找到他：有账号，而且这个功能对他开放。找不到就走链接。 */
  inApp: boolean;
  /** 发起人给这位朋友定的档；没定是 null。 */
  tierFromInitiator: AgentPassTierPresetV1 | null;
  /** 这位朋友给发起人定的档；没定是 null。 */
  tierToInitiator: AgentPassTierPresetV1 | null;
  /** 朋友开了「让分身替我商量」。 */
  optedIn: boolean;
  hasTwin: boolean;
  blockedInitiator: boolean;
  invitedToday: number;
  /** 本人调低过的每日上限；没调是 null。 */
  dailyCap: number | null;
  pairThisWeek: number;
}

export interface TwinHuddleStartInputV0 {
  initiatorOptedIn: boolean;
  initiatorStartedToday: number;
  friends: TwinHuddleFriendStateV0[];
  /** 链接名额的个数；没有就是 0。 */
  guestCount?: number;
}

export type TwinHuddleStartResultV0 =
  | { ok: true; routes: { ref: string; route: TwinHuddleFriendRouteV0 }[] }
  | { ok: false; code: TwinHuddleRefusalCodeV0 };

// ── 固定句和标签 ────────────────────────────────────────────────────────────────

/** 分身说的话和发给本人的通知只用这些，每一句都得能过 `twinPrechatTextViolationsV0`。 */
export const TWIN_HUDDLE_FIXED_PHRASES_V0 = {
  askTimes: { zh: '朋友在约时间，这几个时间哪个行？', en: 'A friend is making plans. Which of these times work?' },
  yes: { zh: '这个时间可以。', en: 'This time works.' },
  no: { zh: '这个时间不行。', en: 'This time does not work.' },
  needsOwner: { zh: '这个要问本人。', en: 'This one needs the owner.' },
  everyoneIntro: { zh: '大家都能来的时间：', en: 'Times that work for everyone:' },
  mostIntro: { zh: '能来的人最多的时间：', en: 'Times that work for the most people:' },
  confirmAsk: { zh: '就定这个？', en: 'Lock this in?' },
  settled: { zh: '定了，已经告诉大家。', en: 'Settled. Everyone has been told.' },
  noCommonTime: { zh: '这几个时间凑不齐，换几个时间再约吧。', en: 'No time works yet. Try a few other times.' },
  unavailable: { zh: '暂时约不到。', en: 'Not available right now.' },
  sendLink: { zh: '把这条链接发给他，他点开就能选时间。', en: 'Send them this link. They can pick times from it.' },
  pickTime: { zh: '时间收齐了，来选吧。', en: 'The answers are in. Pick a time.' },
  cancelled: { zh: '发起人取消了这次商量。', en: 'The organizer cancelled this plan.' },
  ended: { zh: '这次没定下来，已经结束了。', en: 'This plan ended without a time.' },
} as const;

export const TWIN_HUDDLE_KIND_LABELS_V0: Readonly<Record<TwinHuddleKindV0, { zh: string; en: string }>> = {
  meal: { zh: '吃饭', en: 'Meal' },
  sport: { zh: '运动', en: 'Sport' },
  outing: { zh: '出游', en: 'Outing' },
  carpool: { zh: '拼车', en: 'Carpool' },
  party: { zh: '聚会', en: 'Party' },
  other: { zh: '其他', en: 'Other' },
};

export const TWIN_HUDDLE_BUDGET_LABELS_V0: Readonly<Record<TwinHuddleBudgetBandV0, { zh: string; en: string }>> = {
  any: { zh: '都行', en: 'Any' },
  low: { zh: '实惠', en: 'Casual' },
  mid: { zh: '适中', en: 'Mid-range' },
  high: { zh: '讲究', en: 'Upscale' },
};

export const TWIN_HUDDLE_DIET_LABELS_V0: Readonly<Record<TwinHuddleDietTagV0, { zh: string; en: string }>> = {
  no_spicy: { zh: '不吃辣', en: 'No spicy food' },
  vegetarian: { zh: '素食', en: 'Vegetarian' },
  vegan: { zh: '纯素', en: 'Vegan' },
  halal: { zh: '清真', en: 'Halal' },
  no_beef: { zh: '不吃牛肉', en: 'No beef' },
  no_pork: { zh: '不吃猪肉', en: 'No pork' },
  no_seafood: { zh: '不吃海鲜', en: 'No seafood' },
  no_alcohol: { zh: '不喝酒', en: 'No alcohol' },
};

// ── 解码 ────────────────────────────────────────────────────────────────────

type Failure = { ok: false; reasonCode: TwinHuddleReasonCodeV0; field: string };

const L = TWIN_HUDDLE_LIMITS_V0;
const REF = /^[A-Za-z0-9][A-Za-z0-9:_.-]{0,127}$/;
const GUEST_REF_PREFIX = 'guest:';
// eslint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u001f\u007f]/;

function fail(reasonCode: TwinHuddleReasonCodeV0, field: string): Failure {
  return { ok: false, reasonCode, field };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function isOneOf<T extends string>(list: readonly T[], value: unknown): value is T {
  return typeof value === 'string' && (list as readonly string[]).includes(value);
}

function strict(value: unknown, field: string, allowed: readonly string[], required: readonly string[]): TwinHuddleDecodeResultV0<Record<string, unknown>> {
  if (!isRecord(value)) return fail('invalid_type', field);
  for (const key of Object.keys(value)) if (!allowed.includes(key)) return fail('unknown_field', `${field}.${key}`);
  for (const key of required) if (value[key] === undefined) return fail('missing_field', `${field}.${key}`);
  return { ok: true, value };
}

function decodeEnum<T extends string>(list: readonly T[], value: unknown, field: string): TwinHuddleDecodeResultV0<T> {
  if (typeof value !== 'string') return fail('invalid_type', field);
  return isOneOf(list, value) ? { ok: true, value } : fail('invalid_value', field);
}

function decodeRef(value: unknown, field: string): TwinHuddleDecodeResultV0<string> {
  if (typeof value !== 'string') return fail('invalid_type', field);
  return REF.test(value) ? { ok: true, value } : fail('invalid_value', field);
}

function decodeIso(value: unknown, field: string): TwinHuddleDecodeResultV0<string> {
  if (typeof value !== 'string') return fail('invalid_type', field);
  const ms = value.length <= 40 ? Date.parse(value) : NaN;
  return Number.isFinite(ms) ? { ok: true, value: new Date(ms).toISOString() } : fail('invalid_value', field);
}

function decodeNote(value: unknown, field: string): TwinHuddleDecodeResultV0<string> {
  if (typeof value !== 'string') return fail('invalid_type', field);
  const text = value.trim();
  if (text.length === 0 || CONTROL.test(text)) return fail('invalid_value', field);
  if (Array.from(text).length > L.noteMax) return fail('too_long', field);
  if (twinPrechatTextViolationsV0(text).length > 0) return fail('text_violation', field);
  return { ok: true, value: text };
}

function decodeCandidates(value: unknown, field: string): TwinHuddleDecodeResultV0<TwinPrechatSlotV0[]> {
  if (!Array.isArray(value)) return fail('invalid_type', field);
  if (value.length === 0 || value.length > L.candidatesMax) return fail('invalid_value', field);
  const slots: TwinPrechatSlotV0[] = [];
  let previousStart = -Infinity;
  for (let i = 0; i < value.length; i += 1) {
    const f = `${field}[${i}]`;
    const rec = strict(value[i], f, ['startAt', 'endAt'], ['startAt', 'endAt']);
    if (rec.ok === false) return rec;
    const startAt = decodeIso(rec.value.startAt, `${f}.startAt`);
    if (startAt.ok === false) return startAt;
    const endAt = decodeIso(rec.value.endAt, `${f}.endAt`);
    if (endAt.ok === false) return endAt;
    const start = Date.parse(startAt.value);
    const length = Date.parse(endAt.value) - start;
    if (length < L.slotMinMs || length > L.slotMaxMs || start <= previousStart) return fail('invalid_value', f);
    previousStart = start;
    slots.push({ startAt: startAt.value, endAt: endAt.value });
  }
  return { ok: true, value: slots };
}

function decodeFriendRefs(value: unknown, field: string): TwinHuddleDecodeResultV0<string[]> {
  if (!Array.isArray(value)) return fail('invalid_type', field);
  if (value.length > L.friendsMax) return fail('invalid_value', field);
  const refs: string[] = [];
  for (let i = 0; i < value.length; i += 1) {
    const ref = decodeRef(value[i], `${field}[${i}]`);
    if (ref.ok === false) return ref;
    if (ref.value.startsWith(GUEST_REF_PREFIX)) return fail('invalid_value', `${field}[${i}]`);
    if (refs.includes(ref.value)) return fail('invalid_value', `${field}[${i}]`);
    refs.push(ref.value);
  }
  return { ok: true, value: refs };
}

function decodeGuestLabels(value: unknown, field: string): TwinHuddleDecodeResultV0<string[]> {
  if (!Array.isArray(value)) return fail('invalid_type', field);
  if (value.length > L.friendsMax) return fail('invalid_value', field);
  const labels: string[] = [];
  for (let i = 0; i < value.length; i += 1) {
    const path = `${field}[${i}]`;
    const item: unknown = value[i];
    if (typeof item !== 'string') return fail('invalid_type', path);
    const label = item.trim();
    if (label.length === 0 || CONTROL.test(label)) return fail('invalid_value', path);
    if (Array.from(label).length > L.guestLabelMax) return fail('too_long', path);
    if (twinPrechatTextViolationsV0(label).length > 0) return fail('text_violation', path);
    if (labels.includes(label)) return fail('invalid_value', path);
    labels.push(label);
  }
  return { ok: true, value: labels };
}

function decodeSlotAnswers(value: unknown, candidateCount: number, field: string): TwinHuddleDecodeResultV0<TwinHuddleSlotAnswerV0[]> {
  if (!Array.isArray(value)) return fail('invalid_type', field);
  if (value.length !== candidateCount) return fail('invalid_value', field);
  const byCandidate = new Map<number, TwinHuddleSlotAnswerV0>();
  for (let i = 0; i < value.length; i += 1) {
    const f = `${field}[${i}]`;
    const rec = strict(value[i], f, ['candidate', 'value', 'basis'], ['candidate', 'value']);
    if (rec.ok === false) return rec;
    const candidate = rec.value.candidate;
    if (typeof candidate !== 'number') return fail('invalid_type', `${f}.candidate`);
    if (!Number.isInteger(candidate) || candidate < 0 || candidate >= candidateCount || byCandidate.has(candidate)) {
      return fail('invalid_value', `${f}.candidate`);
    }
    const availability = decodeEnum(TWIN_HUDDLE_AVAILABILITY_V0, rec.value.value, `${f}.value`);
    if (availability.ok === false) return availability;
    if (availability.value === 'needs_owner') {
      if (rec.value.basis !== undefined) return fail('invalid_value', `${f}.basis`);
      byCandidate.set(candidate, { candidate, value: 'needs_owner' });
      continue;
    }
    if (rec.value.basis === undefined) return fail('missing_field', `${f}.basis`);
    const basis = decodeEnum(TWIN_HUDDLE_BASES_V0, rec.value.basis, `${f}.basis`);
    if (basis.ok === false) return basis;
    byCandidate.set(candidate, { candidate, value: availability.value, basis: basis.value });
  }
  const slots: TwinHuddleSlotAnswerV0[] = [];
  for (let c = 0; c < candidateCount; c += 1) {
    const slot = byCandidate.get(c);
    if (slot) slots.push(slot);
  }
  return { ok: true, value: slots };
}

function decodeDietTags(value: unknown, field: string): TwinHuddleDecodeResultV0<TwinHuddleDietTagV0[]> {
  if (!Array.isArray(value)) return fail('invalid_type', field);
  const seen = new Set<TwinHuddleDietTagV0>();
  for (let i = 0; i < value.length; i += 1) {
    const tag = decodeEnum(TWIN_HUDDLE_DIET_TAGS_V0, value[i], `${field}[${i}]`);
    if (tag.ok === false) return tag;
    if (seen.has(tag.value)) return fail('invalid_value', `${field}[${i}]`);
    seen.add(tag.value);
  }
  return { ok: true, value: TWIN_HUDDLE_DIET_TAGS_V0.filter((tag) => seen.has(tag)) };
}

export function decodeTwinHuddleRequestV0(value: unknown, field = 'request'): TwinHuddleDecodeResultV0<TwinHuddleRequestV0> {
  const rec = strict(value, field, ['kind', 'candidates', 'region', 'budget', 'friendRefs', 'guestLabels', 'note'], ['kind', 'candidates', 'budget', 'friendRefs']);
  if (rec.ok === false) return rec;
  const kind = decodeEnum(TWIN_HUDDLE_KINDS_V0, rec.value.kind, `${field}.kind`);
  if (kind.ok === false) return kind;
  const candidates = decodeCandidates(rec.value.candidates, `${field}.candidates`);
  if (candidates.ok === false) return candidates;
  const budget = decodeEnum(TWIN_HUDDLE_BUDGET_BANDS_V0, rec.value.budget, `${field}.budget`);
  if (budget.ok === false) return budget;
  const friendRefs = decodeFriendRefs(rec.value.friendRefs, `${field}.friendRefs`);
  if (friendRefs.ok === false) return friendRefs;
  let guestLabels: string[] = [];
  if (rec.value.guestLabels !== undefined) {
    const guests = decodeGuestLabels(rec.value.guestLabels, `${field}.guestLabels`);
    if (guests.ok === false) return guests;
    guestLabels = guests.value;
  }
  const people = friendRefs.value.length + guestLabels.length;
  if (people === 0 || people > L.friendsMax) return fail('invalid_value', guestLabels.length > 0 ? `${field}.guestLabels` : `${field}.friendRefs`);
  const out: TwinHuddleRequestV0 = { kind: kind.value, candidates: candidates.value, budget: budget.value, friendRefs: friendRefs.value };
  if (guestLabels.length > 0) out.guestLabels = guestLabels;
  if (rec.value.region !== undefined) {
    const region = decodeEnum(INTRODUCTION_NEED_REGIONS_V1, rec.value.region, `${field}.region`);
    if (region.ok === false) return region;
    out.region = region.value;
  }
  if (rec.value.note !== undefined) {
    const note = decodeNote(rec.value.note, `${field}.note`);
    if (note.ok === false) return note;
    out.note = note.value;
  }
  return { ok: true, value: out };
}

/** 第 `index` 个链接名额（从 0 数）的 ref：`guest:1`、`guest:2`…… */
export function twinHuddleGuestRefV0(index: number): string {
  return `${GUEST_REF_PREFIX}${index + 1}`;
}

/** 商量单约到的全部 ref：朋友在前，链接名额在后。后端还要去掉这次不约的（`pair_weekly_limit`、`unavailable`）。 */
export function twinHuddleInvitedRefsV0(request: Pick<TwinHuddleRequestV0, 'friendRefs' | 'guestLabels'>): string[] {
  return [...request.friendRefs, ...(request.guestLabels ?? []).map((_, index) => twinHuddleGuestRefV0(index))];
}

/** `candidateCount` 是商量单里候选时间的个数。 */
export function decodeTwinHuddleAnswerV0(value: unknown, candidateCount: number, field = 'answer'): TwinHuddleDecodeResultV0<TwinHuddleAnswerV0> {
  if (!Number.isInteger(candidateCount) || candidateCount < 1 || candidateCount > L.candidatesMax) return fail('invalid_value', `${field}.slots`);
  const rec = strict(value, field, ['friendRef', 'slots', 'budgetMax', 'dietTags'], ['friendRef', 'slots']);
  if (rec.ok === false) return rec;
  const friendRef = decodeRef(rec.value.friendRef, `${field}.friendRef`);
  if (friendRef.ok === false) return friendRef;
  const slots = decodeSlotAnswers(rec.value.slots, candidateCount, `${field}.slots`);
  if (slots.ok === false) return slots;
  const out: TwinHuddleAnswerV0 = { friendRef: friendRef.value, slots: slots.value };
  if (rec.value.budgetMax !== undefined) {
    const budgetMax = decodeEnum(TWIN_HUDDLE_BUDGET_BANDS_V0, rec.value.budgetMax, `${field}.budgetMax`);
    if (budgetMax.ok === false) return budgetMax;
    out.budgetMax = budgetMax.value;
  }
  if (rec.value.dietTags !== undefined) {
    const dietTags = decodeDietTags(rec.value.dietTags, `${field}.dietTags`);
    if (dietTags.ok === false) return dietTags;
    out.dietTags = dietTags.value;
  }
  return { ok: true, value: out };
}

// ── 规则 ────────────────────────────────────────────────────────────────────

/** 发出前再查一次：每个候选时间都要在现在之后、`horizonMs` 之内开始。 */
export function twinHuddleCandidatesValidV0(candidates: readonly TwinPrechatSlotV0[], now: string): boolean {
  const nowMs = Date.parse(now);
  if (!Number.isFinite(nowMs) || candidates.length === 0) return false;
  return candidates.every((slot) => {
    const start = Date.parse(slot.startAt);
    return Number.isFinite(start) && start > nowMs && start - nowMs <= L.horizonMs;
  });
}

export function twinHuddleFriendDailyCapV0(dailyCap: number | null): number {
  if (dailyCap === null || !Number.isFinite(dailyCap)) return L.perFriendPerDayMax;
  return Math.max(0, Math.min(L.perFriendPerDayMax, Math.floor(dailyCap)));
}

export function twinHuddleFriendPrivateReasonV0(friend: TwinHuddleFriendStateV0): TwinHuddleFriendPrivateReasonV0 | null {
  if (friend.tierFromInitiator === null || friend.tierToInitiator === null) return 'not_mutual';
  if (friend.blockedInitiator) return 'blocked';
  if (friend.invitedToday >= twinHuddleFriendDailyCapV0(friend.dailyCap)) return 'daily_limit';
  return null;
}

function friendRoute(friend: TwinHuddleFriendStateV0): TwinHuddleFriendRouteV0 {
  if (!friend.known) return 'unavailable';
  if (friend.pairThisWeek >= L.perPairPerWeek) return 'pair_weekly_limit';
  if (!friend.inApp || twinHuddleFriendPrivateReasonV0(friend) !== null) return 'link';
  return friend.hasTwin && friend.optedIn ? 'twin' : 'owner';
}

/** 先查发起人自己，再逐个查朋友。朋友约不到不挡整张单；没有链接名额、朋友又一个都约不到才拒。 */
export function twinHuddleCanStartV0(input: TwinHuddleStartInputV0): TwinHuddleStartResultV0 {
  if (!input.initiatorOptedIn) return { ok: false, code: 'initiator_not_opted_in' };
  if (input.initiatorStartedToday >= L.perInitiatorPerDay) return { ok: false, code: 'initiator_daily_limit' };
  const guests = input.guestCount ?? 0;
  const people = input.friends.length + guests;
  if (!Number.isInteger(guests) || guests < 0 || people === 0 || people > L.friendsMax) return { ok: false, code: 'friend_count' };
  if (new Set(input.friends.map((friend) => friend.ref)).size !== input.friends.length) return { ok: false, code: 'duplicate_friend' };
  const routes = input.friends.map((friend) => ({ ref: friend.ref, route: friendRoute(friend) }));
  if (guests === 0 && !routes.some((r) => r.route === 'twin' || r.route === 'owner' || r.route === 'link')) return { ok: false, code: 'none_available' };
  return { ok: true, routes };
}

const BUDGET_RANK: Readonly<Record<Exclude<TwinHuddleBudgetBandV0, 'any'>, number>> = { low: 0, mid: 1, high: 2 };

function lowestBand(bands: readonly TwinHuddleBudgetBandV0[]): TwinHuddleBudgetBandV0 {
  let lowest: TwinHuddleBudgetBandV0 = 'any';
  for (const band of bands) {
    if (band === 'any') continue;
    if (lowest === 'any' || BUDGET_RANK[band] < BUDGET_RANK[lowest]) lowest = band;
  }
  return lowest;
}

/** `invitedRefs` 是这次真正约了的人：`twin`、`owner`、`link` 路线的朋友和链接名额。没被约的人的作答不算。 */
export function twinHuddleProposalsV0(
  request: TwinHuddleRequestV0,
  invitedRefs: readonly string[],
  answers: readonly TwinHuddleAnswerV0[],
): TwinHuddleProposalV0[] {
  const invited = new Set(invitedRefs);
  const byFriend = new Map<string, TwinHuddleAnswerV0>();
  for (const answer of answers) {
    if (invited.has(answer.friendRef) && !byFriend.has(answer.friendRef)) byFriend.set(answer.friendRef, answer);
  }
  const options: TwinHuddleProposalV0[] = [];
  request.candidates.forEach((slot, candidate) => {
    const coming = [...byFriend.values()]
      .filter((answer) => answer.slots.some((s) => s.candidate === candidate && s.value === 'yes'))
      .sort((a, b) => (a.friendRef < b.friendRef ? -1 : a.friendRef > b.friendRef ? 1 : 0));
    if (coming.length === 0) return;
    options.push({
      candidate,
      slot: { startAt: slot.startAt, endAt: slot.endAt },
      attendees: coming.map((answer) => answer.friendRef),
      everyone: coming.length === invited.size,
      budget: lowestBand([request.budget, ...coming.map((answer) => answer.budgetMax ?? 'any')]),
      dietTags: TWIN_HUDDLE_DIET_TAGS_V0.filter((tag) => coming.some((answer) => (answer.dietTags ?? []).includes(tag))),
    });
  });
  const everyone = options.filter((option) => option.everyone);
  const ranked = everyone.length > 0 ? everyone : [...options].sort((a, b) => b.attendees.length - a.attendees.length || a.candidate - b.candidate);
  return ranked.slice(0, L.proposalsMax);
}

function reached(now: string, deadline: string): boolean {
  const nowMs = Date.parse(now);
  const deadlineMs = Date.parse(deadline);
  return Number.isFinite(nowMs) && Number.isFinite(deadlineMs) && nowMs >= deadlineMs;
}

/** 所有被约的朋友都答完（没有「要问本人」），或者到了收集截止。 */
export function twinHuddleReadyToProposeV0(
  invitedRefs: readonly string[],
  answers: readonly TwinHuddleAnswerV0[],
  clock: { now: string; collectEndsAt: string },
): boolean {
  if (reached(clock.now, clock.collectEndsAt)) return true;
  return invitedRefs.every((ref) => answers.some((answer) => answer.friendRef === ref && answer.slots.every((s) => s.value !== 'needs_owner')));
}

/** 确认阶段的结果；还在等是 null。超时不回的人算不参加。 */
export function twinHuddleConfirmEventV0(
  attendees: readonly string[],
  confirmations: ReadonlyMap<string, TwinHuddleConfirmationV0>,
  clock: { now: string; confirmEndsAt: string },
): 'confirm_complete' | 'confirm_timeout' | 'nobody_confirmed' | null {
  const confirmed = attendees.filter((ref) => confirmations.get(ref) === 'confirmed').length;
  const pending = attendees.filter((ref) => !confirmations.has(ref)).length;
  if (pending === 0) return confirmed > 0 ? 'confirm_complete' : 'nobody_confirmed';
  if (!reached(clock.now, clock.confirmEndsAt)) return null;
  return confirmed > 0 ? 'confirm_timeout' : 'nobody_confirmed';
}

const TRANSITIONS: Readonly<Record<TwinHuddleStatusV0, Partial<Record<TwinHuddleEventV0, TwinHuddleStatusV0>>>> = {
  draft: { send: 'collecting', cancel: 'cancelled' },
  collecting: { answers_complete: 'choosing', collect_timeout: 'choosing', cancel: 'cancelled' },
  choosing: { choose: 'confirming', no_common_time: 'expired', choose_timeout: 'expired', cancel: 'cancelled' },
  confirming: { confirm_complete: 'settled', confirm_timeout: 'settled', nobody_confirmed: 'expired', cancel: 'cancelled' },
  settled: {},
  cancelled: {},
  expired: {},
};

/** 不允许的组合返回 null；已结束的单不再变。 */
export function twinHuddleNextStatusV0(status: TwinHuddleStatusV0, event: TwinHuddleEventV0): TwinHuddleStatusV0 | null {
  return TRANSITIONS[status][event] ?? null;
}

// ── 设置 ───────────────────────────────────────────────────────────────

export interface TwinHuddleProfileV0 {
  /** 让分身替我商量：发起要先打开；朋友约我时分身先按日历答，答不了的再问我。 */
  optIn: boolean;
  /** 每天最多被约几次，0–10；没调过是 null，按 10 算。 */
  dailyCap: number | null;
  /** 忌口，按 `TWIN_HUDDLE_DIET_TAGS_V0` 的顺序；只合并、不署名地给发起人看。 */
  dietTags: TwinHuddleDietTagV0[];
  /** 人均最多到哪一档；没填是 null。 */
  budgetMax: TwinHuddleBudgetBandV0 | null;
}

export const TWIN_HUDDLE_EMPTY_PROFILE_V0: Readonly<TwinHuddleProfileV0> = Object.freeze({ optIn: false, dailyCap: null, dietTags: [], budgetMax: null });

/** 改设置：只带要改的字段，至少一个。 */
export function decodeTwinHuddleProfilePatchV0(value: unknown, field = 'profile'): TwinHuddleDecodeResultV0<Partial<TwinHuddleProfileV0>> {
  const rec = strict(value, field, ['optIn', 'dailyCap', 'dietTags', 'budgetMax'], []);
  if (rec.ok === false) return rec;
  if (Object.keys(rec.value).length === 0) return fail('missing_field', field);
  const { optIn, dailyCap, dietTags, budgetMax } = rec.value;
  const out: Partial<TwinHuddleProfileV0> = {};
  if (optIn !== undefined) {
    if (typeof optIn !== 'boolean') return fail('invalid_type', `${field}.optIn`);
    out.optIn = optIn;
  }
  if (dailyCap === null) out.dailyCap = null;
  else if (dailyCap !== undefined) {
    if (typeof dailyCap !== 'number') return fail('invalid_type', `${field}.dailyCap`);
    if (!Number.isInteger(dailyCap) || dailyCap < 0 || dailyCap > L.perFriendPerDayMax) return fail('invalid_value', `${field}.dailyCap`);
    out.dailyCap = dailyCap;
  }
  if (dietTags !== undefined) {
    const tags = decodeDietTags(dietTags, `${field}.dietTags`);
    if (tags.ok === false) return tags;
    out.dietTags = tags.value;
  }
  if (budgetMax === null) out.budgetMax = null;
  else if (budgetMax !== undefined) {
    const band = decodeEnum(TWIN_HUDDLE_BUDGET_BANDS_V0, budgetMax, `${field}.budgetMax`);
    if (band.ok === false) return band;
    out.budgetMax = band.value;
  }
  return { ok: true, value: out };
}

// ── 本人作答和分身代答 ─────────────────────────────────────────────────

/** 本人（站内卡片或链接页）的作答：每个候选时间正好一条，只能是「行」或「不行」。 */
export interface TwinHuddleReplyV0 {
  slots: { candidate: number; value: 'yes' | 'no' }[];
}

const REPLY_VALUES = ['yes', 'no'] as const;

export function decodeTwinHuddleReplyV0(value: unknown, candidateCount: number, field = 'reply'): TwinHuddleDecodeResultV0<TwinHuddleReplyV0> {
  if (!Number.isInteger(candidateCount) || candidateCount < 1 || candidateCount > L.candidatesMax) return fail('invalid_value', `${field}.slots`);
  const rec = strict(value, field, ['slots'], ['slots']);
  if (rec.ok === false) return rec;
  const list = rec.value.slots;
  if (!Array.isArray(list)) return fail('invalid_type', `${field}.slots`);
  if (list.length !== candidateCount) return fail('invalid_value', `${field}.slots`);
  const byCandidate = new Map<number, 'yes' | 'no'>();
  for (let i = 0; i < list.length; i += 1) {
    const f = `${field}.slots[${i}]`;
    const item = strict(list[i], f, ['candidate', 'value'], ['candidate', 'value']);
    if (item.ok === false) return item;
    const candidate = item.value.candidate;
    if (typeof candidate !== 'number') return fail('invalid_type', `${f}.candidate`);
    if (!Number.isInteger(candidate) || candidate < 0 || candidate >= candidateCount || byCandidate.has(candidate)) return fail('invalid_value', `${f}.candidate`);
    const answer = decodeEnum(REPLY_VALUES, item.value.value, `${f}.value`);
    if (answer.ok === false) return answer;
    byCandidate.set(candidate, answer.value);
  }
  const slots: TwinHuddleReplyV0['slots'] = [];
  for (let c = 0; c < candidateCount; c += 1) slots.push({ candidate: c, value: byCandidate.get(c) as 'yes' | 'no' });
  return { ok: true, value: { slots } };
}

/** 本人的作答存下来时，依据都是 `owner_reply`。 */
export function twinHuddleReplySlotsV0(reply: TwinHuddleReplyV0): TwinHuddleSlotAnswerV0[] {
  return reply.slots.map((slot) => ({ candidate: slot.candidate, value: slot.value, basis: 'owner_reply' }));
}

/**
 * 分身按日历替朋友答（代答的第三道关）。只看忙闲，不看事件内容，依据都是 `friend_tier`：
 * - 没连日历、读不到，或者有事件没列全：每个时间都「要问本人」；
 * - 不在日历窗口（7 天）里的时间：「要问本人」；
 * - 和有具体时间的事件重叠是「不行」，只和全天事件重叠是「要问本人」，都不重叠是「行」。
 * 「行」只表示日历上有空，去不去由本人在确认那一步点。
 */
export function twinHuddleTwinSlotsV0(candidates: readonly TwinPrechatSlotV0[], window: CalendarWindowForChatV1 | null): TwinHuddleSlotAnswerV0[] {
  const ask = (candidate: number): TwinHuddleSlotAnswerV0 => ({ candidate, value: 'needs_owner' });
  if (!window || window.status !== 'ready' || window.omitted > 0) return candidates.map((_, candidate) => ask(candidate));
  const from = Date.parse(window.windowStart);
  const to = Date.parse(window.windowEnd);
  const events = window.events.map((event) => ({ start: Date.parse(event.start), end: Date.parse(event.end), allDay: event.allDay }));
  const readable = Number.isFinite(from) && Number.isFinite(to) && events.every((event) => Number.isFinite(event.start) && Number.isFinite(event.end));
  return candidates.map((slot, candidate) => {
    const start = Date.parse(slot.startAt);
    const end = Date.parse(slot.endAt);
    if (!readable || !Number.isFinite(start) || !Number.isFinite(end) || start < from || end > to) return ask(candidate);
    const clashes = events.filter((event) => event.start < end && event.end > start);
    if (clashes.some((event) => !event.allDay)) return { candidate, value: 'no', basis: 'friend_tier' };
    if (clashes.length > 0) return ask(candidate);
    return { candidate, value: 'yes', basis: 'friend_tier' };
  });
}

// ── 各方看到的内容 ──────────────────────────────────────────────────────

/** 链接码：128 位随机数的 base64url，22 个字符。放在链接的 `#` 后面，服务器只存 SHA-256。 */
export const TWIN_HUDDLE_LINK_CODE_PATTERN_V0 = /^[A-Za-z0-9_-]{22}$/;

/** 商量的内容，不含被约的人。 */
export type TwinHuddleDetailsV0 = Omit<TwinHuddleRequestV0, 'friendRefs' | 'guestLabels'>;

export interface TwinHuddleChosenV0 {
  candidate: number;
  slot: TwinPrechatSlotV0;
}

/** 发起人那边的一个被约的人。不带对方的作答，也不带回没回。 */
export interface TwinHuddlePersonV0 {
  ref: string;
  /** 发起人自己那边的称呼：关系里的身份，或者链接名额的称呼。 */
  label: string;
  route: 'twin' | 'owner' | 'link';
}

export interface TwinHuddleInitiatorViewV0 {
  schemaVersion: typeof TWIN_HUDDLE_SCHEMA_VERSION_V0;
  id: string;
  role: 'initiator';
  status: TwinHuddleStatusV0;
  /** 这一阶段的截止时间；已结束是 null。 */
  stageEndsAt: string | null;
  createdAt: string;
  details: TwinHuddleDetailsV0;
  people: TwinHuddlePersonV0[];
  /** 选方案阶段才有；每个方案只列能来的人。 */
  proposals: TwinHuddleProposalV0[];
  chosen: TwinHuddleChosenV0 | null;
  /** 确认要来的人。 */
  confirmed: string[];
}

export interface TwinHuddleInvitedViewV0 {
  schemaVersion: typeof TWIN_HUDDLE_SCHEMA_VERSION_V0;
  id: string;
  role: 'invited';
  status: TwinHuddleStatusV0;
  stageEndsAt: string | null;
  createdAt: string;
  /** 发起人的昵称。 */
  initiatorName: string;
  details: TwinHuddleDetailsV0;
  /** 我的作答，分身代答的也算；还没答是 null。 */
  myAnswer: TwinHuddleSlotAnswerV0[] | null;
  answeredBy: 'twin' | 'owner' | null;
  /** 收集阶段，而且我还没答，或者还有「要问本人」。 */
  canAnswer: boolean;
  chosen: TwinHuddleChosenV0 | null;
  /** 确认阶段，我在选定的方案里，而且还没回。 */
  canConfirm: boolean;
  myConfirmation: TwinHuddleConfirmationV0 | null;
  confirmedCount: number;
}

/** 链接页只给这些：不显示其他被约的人，也不显示发起人给他起的称呼和备注。 */
export interface TwinHuddleGuestViewV0 {
  schemaVersion: typeof TWIN_HUDDLE_SCHEMA_VERSION_V0;
  status: TwinHuddleStatusV0;
  stageEndsAt: string | null;
  initiatorName: string;
  kind: TwinHuddleKindV0;
  candidates: TwinPrechatSlotV0[];
  region?: IntroductionNeedRegionV1;
  budget: TwinHuddleBudgetBandV0;
  myAnswer: TwinHuddleSlotAnswerV0[] | null;
  canAnswer: boolean;
  chosen: TwinHuddleChosenV0 | null;
  canConfirm: boolean;
  myConfirmation: TwinHuddleConfirmationV0 | null;
}

export interface TwinHuddleListItemV0 {
  id: string;
  role: 'initiator' | 'invited';
  kind: TwinHuddleKindV0;
  status: TwinHuddleStatusV0;
  stageEndsAt: string | null;
  createdAt: string;
  /** 轮到我了：被约的人要作答或确认，发起人要选方案。 */
  needsMe: boolean;
}

/** 发起的结果。`links` 只在这一次给：服务器只存哈希，丢了只能重新生成。 */
export type TwinHuddleStartOutcomeV0 =
  | { started: true; huddleId: string; routes: { ref: string; route: TwinHuddleFriendRouteV0 }[]; links: { ref: string; code: string }[] }
  | { started: false; code: TwinHuddleRefusalCodeV0 };

// ── 回执 ───────────────────────────────────────────────────────────────

export const TWIN_HUDDLE_RECEIPT_TYP_V0 = 'agentrix.twin-huddle-receipt.v0' as const;

/** 商量结束时签的回执：分身代答了几次、凭的哪份代表授权和通行证。不含任何人的 id 和称呼。 */
export interface TwinHuddleReceiptClaimsV0 {
  schemaVersion: typeof TWIN_HUDDLE_SCHEMA_VERSION_V0;
  huddleId: string;
  status: 'settled' | 'cancelled' | 'expired';
  closedAt: string;
  kind: TwinHuddleKindV0;
  candidates: number;
  chosen: TwinPrechatSlotV0 | null;
  invited: number;
  confirmed: number;
  twinAnswers: { grantRef: string; grantVersion: number; passId: string }[];
}

// ── 手机和网页读服务器的回答 ───────────────────────────

/** 链接页的路径。链接码放在 `#` 后面，浏览器不会把这一段发给服务器。 */
export const TWIN_HUDDLE_GUEST_PAGE_PATH_V0 = '/huddle';

export function twinHuddleGuestLinkV0(origin: string, code: string): string {
  return `${origin.replace(/\/+$/, '')}${TWIN_HUDDLE_GUEST_PAGE_PATH_V0}#${code}`;
}

/** 商量的 id 是 uuid；格式不对的不必发请求，服务器对它只回 404。 */
export const TWIN_HUDDLE_ID_PATTERN_V0 = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** `GET /twin-huddle/friends` 的一项：只有发起人自己关系里的身份和档位，不说对方开没开商量、有没有分身。 */
export interface TwinHuddleFriendOptionV0 {
  friendRef: string;
  label: string;
  tier: AgentPassTierPresetV1;
}

/*
 * 下面的 decode…V0 只用来读服务器的回答：认识的字段逐个检查，多出来的字段不管（服务器以后加字段不会弄坏旧版本），
 * 外面包一层 `{ data: … }` 也认。对不上就返回 null，调用方按「读不出来」处理。
 */
function unwrapData(body: unknown, marker: string): unknown {
  return isRecord(body) && isRecord(body.data) && body[marker] === undefined ? body.data : body;
}

function isTime(value: unknown): value is string {
  return typeof value === 'string' && value.length <= 40 && !Number.isNaN(Date.parse(value));
}

function isIndexBelow(value: unknown, count: number): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value < count;
}

function readList<T>(value: unknown, read: (item: unknown) => T | null): T[] | null {
  if (!Array.isArray(value)) return null;
  const out: T[] = [];
  for (const item of value) {
    const decoded = read(item);
    if (decoded === null) return null;
    out.push(decoded);
  }
  return out;
}

function readText(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function readEnumList<T extends string>(list: readonly T[], value: unknown): T[] | null {
  return readList(value, (item): T | null => (isOneOf(list, item) ? item : null));
}

function readSlot(value: unknown): TwinPrechatSlotV0 | null {
  if (!isRecord(value)) return null;
  const { startAt, endAt } = value;
  return isTime(startAt) && isTime(endAt) ? { startAt, endAt } : null;
}

function readDetails(value: unknown): TwinHuddleDetailsV0 | null {
  if (!isRecord(value)) return null;
  const { kind, budget, region, note } = value;
  if (!isOneOf(TWIN_HUDDLE_KINDS_V0, kind) || !isOneOf(TWIN_HUDDLE_BUDGET_BANDS_V0, budget)) return null;
  const candidates = readList(value.candidates, readSlot);
  if (candidates === null || candidates.length === 0) return null;
  const details: TwinHuddleDetailsV0 = { kind, candidates, budget };
  if (region !== undefined) {
    if (!isOneOf(INTRODUCTION_NEED_REGIONS_V1, region)) return null;
    details.region = region;
  }
  if (note !== undefined) {
    if (typeof note !== 'string') return null;
    details.note = note;
  }
  return details;
}

function readChosen(value: unknown, count: number): TwinHuddleChosenV0 | null {
  if (!isRecord(value) || !isIndexBelow(value.candidate, count)) return null;
  const slot = readSlot(value.slot);
  return slot === null ? null : { candidate: value.candidate, slot };
}

function readProposal(value: unknown, count: number): TwinHuddleProposalV0 | null {
  if (!isRecord(value) || !isIndexBelow(value.candidate, count)) return null;
  const { everyone, budget } = value;
  if (typeof everyone !== 'boolean' || !isOneOf(TWIN_HUDDLE_BUDGET_BANDS_V0, budget)) return null;
  const slot = readSlot(value.slot);
  const attendees = readList(value.attendees, readText);
  const dietTags = readEnumList(TWIN_HUDDLE_DIET_TAGS_V0, value.dietTags);
  if (slot === null || attendees === null || dietTags === null) return null;
  return { candidate: value.candidate, slot, attendees, everyone, budget, dietTags };
}

const PERSON_ROUTES = ['twin', 'owner', 'link'] as const;

function readPerson(value: unknown): TwinHuddlePersonV0 | null {
  if (!isRecord(value)) return null;
  const { ref, label, route } = value;
  return typeof ref === 'string' && typeof label === 'string' && isOneOf(PERSON_ROUTES, route) ? { ref, label, route } : null;
}

function readSlotAnswer(value: unknown, count: number): TwinHuddleSlotAnswerV0 | null {
  if (!isRecord(value) || !isIndexBelow(value.candidate, count) || !isOneOf(TWIN_HUDDLE_AVAILABILITY_V0, value.value)) return null;
  const answer: TwinHuddleSlotAnswerV0 = { candidate: value.candidate, value: value.value };
  const { basis } = value;
  if (basis !== undefined) {
    if (!isOneOf(TWIN_HUDDLE_BASES_V0, basis)) return null;
    answer.basis = basis;
  }
  return answer;
}

interface ViewHead {
  id: string;
  status: TwinHuddleStatusV0;
  stageEndsAt: string | null;
  createdAt: string;
  details: TwinHuddleDetailsV0;
}

function readViewHead(value: Record<string, unknown>): ViewHead | null {
  const { id, status, stageEndsAt, createdAt } = value;
  if (typeof id !== 'string' || !TWIN_HUDDLE_ID_PATTERN_V0.test(id) || !isOneOf(TWIN_HUDDLE_STATUSES_V0, status) || !isTime(createdAt)) return null;
  const details = readDetails(value.details);
  if (details === null) return null;
  const head: ViewHead = { id, status, stageEndsAt: null, createdAt, details };
  if (stageEndsAt !== null) {
    if (!isTime(stageEndsAt)) return null;
    head.stageEndsAt = stageEndsAt;
  }
  return head;
}

function readInitiatorView(value: Record<string, unknown>, head: ViewHead): TwinHuddleInitiatorViewV0 | null {
  const count = head.details.candidates.length;
  const people = readList(value.people, readPerson);
  const proposals = readList(value.proposals, (item) => readProposal(item, count));
  const confirmed = readList(value.confirmed, readText);
  if (people === null || proposals === null || confirmed === null) return null;
  const view: TwinHuddleInitiatorViewV0 = { schemaVersion: TWIN_HUDDLE_SCHEMA_VERSION_V0, ...head, role: 'initiator', people, proposals, chosen: null, confirmed };
  if (value.chosen !== null) {
    const chosen = readChosen(value.chosen, count);
    if (chosen === null) return null;
    view.chosen = chosen;
  }
  return view;
}

const ANSWERED_BY = ['twin', 'owner'] as const;

function readInvitedView(value: Record<string, unknown>, head: ViewHead): TwinHuddleInvitedViewV0 | null {
  const count = head.details.candidates.length;
  const { initiatorName, answeredBy, canAnswer, canConfirm, myConfirmation, confirmedCount } = value;
  if (typeof initiatorName !== 'string' || typeof canAnswer !== 'boolean' || typeof canConfirm !== 'boolean') return null;
  if (typeof confirmedCount !== 'number' || !Number.isInteger(confirmedCount) || confirmedCount < 0) return null;
  const view: TwinHuddleInvitedViewV0 = {
    schemaVersion: TWIN_HUDDLE_SCHEMA_VERSION_V0,
    ...head,
    role: 'invited',
    initiatorName,
    myAnswer: null,
    answeredBy: null,
    canAnswer,
    chosen: null,
    canConfirm,
    myConfirmation: null,
    confirmedCount,
  };
  if (value.myAnswer !== null) {
    const myAnswer = readList(value.myAnswer, (item) => readSlotAnswer(item, count));
    if (myAnswer === null) return null;
    view.myAnswer = myAnswer;
  }
  if (answeredBy !== null) {
    if (!isOneOf(ANSWERED_BY, answeredBy)) return null;
    view.answeredBy = answeredBy;
  }
  if (value.chosen !== null) {
    const chosen = readChosen(value.chosen, count);
    if (chosen === null) return null;
    view.chosen = chosen;
  }
  if (myConfirmation !== null) {
    if (!isOneOf(TWIN_HUDDLE_CONFIRMATIONS_V0, myConfirmation)) return null;
    view.myConfirmation = myConfirmation;
  }
  return view;
}

/** `GET /twin-huddle/:id` 和各个动作的回答：按 `role` 分成发起人看的和被约的人看的。 */
export function decodeTwinHuddleViewV0(body: unknown): TwinHuddleInitiatorViewV0 | TwinHuddleInvitedViewV0 | null {
  const value = unwrapData(body, 'schemaVersion');
  if (!isRecord(value) || value.schemaVersion !== TWIN_HUDDLE_SCHEMA_VERSION_V0) return null;
  const head = readViewHead(value);
  if (head === null) return null;
  if (value.role === 'initiator') return readInitiatorView(value, head);
  return value.role === 'invited' ? readInvitedView(value, head) : null;
}

const VIEW_ROLES = ['initiator', 'invited'] as const;

function readListItem(value: unknown): TwinHuddleListItemV0 | null {
  if (!isRecord(value)) return null;
  const { id, role, kind, status, stageEndsAt, createdAt, needsMe } = value;
  if (typeof id !== 'string' || !TWIN_HUDDLE_ID_PATTERN_V0.test(id) || !isOneOf(VIEW_ROLES, role)) return null;
  if (!isOneOf(TWIN_HUDDLE_KINDS_V0, kind) || !isOneOf(TWIN_HUDDLE_STATUSES_V0, status) || !isTime(createdAt) || typeof needsMe !== 'boolean') return null;
  const item: TwinHuddleListItemV0 = { id, role, kind, status, stageEndsAt: null, createdAt, needsMe };
  if (stageEndsAt !== null) {
    if (!isTime(stageEndsAt)) return null;
    item.stageEndsAt = stageEndsAt;
  }
  return item;
}

/** `GET /twin-huddle` 的 `{ items }`。 */
export function decodeTwinHuddleListV0(body: unknown): TwinHuddleListItemV0[] | null {
  const value = unwrapData(body, 'items');
  return isRecord(value) ? readList(value.items, readListItem) : null;
}

export function decodeTwinHuddleProfileV0(body: unknown): TwinHuddleProfileV0 | null {
  const value = unwrapData(body, 'optIn');
  if (!isRecord(value)) return null;
  const { optIn, dailyCap, budgetMax } = value;
  const dietTags = readEnumList(TWIN_HUDDLE_DIET_TAGS_V0, value.dietTags);
  if (typeof optIn !== 'boolean' || dietTags === null) return null;
  const profile: TwinHuddleProfileV0 = { optIn, dailyCap: null, dietTags, budgetMax: null };
  if (dailyCap !== null) {
    if (typeof dailyCap !== 'number' || !Number.isInteger(dailyCap) || dailyCap < 0 || dailyCap > L.perFriendPerDayMax) return null;
    profile.dailyCap = dailyCap;
  }
  if (budgetMax !== null) {
    if (!isOneOf(TWIN_HUDDLE_BUDGET_BANDS_V0, budgetMax)) return null;
    profile.budgetMax = budgetMax;
  }
  return profile;
}

/** `GET /twin-huddle/friends` 的 `{ friends }`。 */
export function decodeTwinHuddleFriendOptionsV0(body: unknown): TwinHuddleFriendOptionV0[] | null {
  const value = unwrapData(body, 'friends');
  if (!isRecord(value)) return null;
  return readList(value.friends, (item): TwinHuddleFriendOptionV0 | null => {
    if (!isRecord(item)) return null;
    const { friendRef, label, tier } = item;
    if (typeof friendRef !== 'string' || !REF.test(friendRef) || friendRef.startsWith(GUEST_REF_PREFIX)) return null;
    return typeof label === 'string' && isOneOf(AGENT_PASS_TIER_PRESETS_V1, tier) ? { friendRef, label, tier } : null;
  });
}

function readLink(value: unknown): { ref: string; code: string } | null {
  if (!isRecord(value)) return null;
  const { ref, code } = value;
  return typeof ref === 'string' && typeof code === 'string' && TWIN_HUDDLE_LINK_CODE_PATTERN_V0.test(code) ? { ref, code } : null;
}

/** `POST /twin-huddle` 的回答。链接码只在这里出现一次，丢了只能换一条（`relink`）。 */
export function decodeTwinHuddleStartOutcomeV0(body: unknown): TwinHuddleStartOutcomeV0 | null {
  const value = unwrapData(body, 'started');
  if (!isRecord(value)) return null;
  const { started, code, huddleId } = value;
  if (started === false) return isOneOf(TWIN_HUDDLE_REFUSAL_CODES_V0, code) ? { started: false, code } : null;
  if (started !== true || typeof huddleId !== 'string' || !TWIN_HUDDLE_ID_PATTERN_V0.test(huddleId)) return null;
  const routes = readList(value.routes, (item): { ref: string; route: TwinHuddleFriendRouteV0 } | null => {
    if (!isRecord(item)) return null;
    const { ref, route } = item;
    return typeof ref === 'string' && isOneOf(TWIN_HUDDLE_FRIEND_ROUTES_V0, route) ? { ref, route } : null;
  });
  const links = readList(value.links, readLink);
  if (routes === null || links === null) return null;
  return { started: true, huddleId, routes, links };
}

/** `POST /twin-huddle/:id/relink` 的 `{ ref, code }`：新链接码，旧的立刻作废。 */
export function decodeTwinHuddleRelinkV0(body: unknown): { ref: string; code: string } | null {
  return readLink(unwrapData(body, 'code'));
}
