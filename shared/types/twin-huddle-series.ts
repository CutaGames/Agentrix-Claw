/**
 * 每周固定（twin huddle series，合同 v0；设计稿 `.agents/tasks/twin-social-net/recurring-design.md`）。
 *
 * 一件每周重复的事（周四晚上的羽毛球）：发起一次，以后每周由平台替发起人开一张普通的商量单（`twin-huddle.ts`），
 * 候选时间只有这一周的那一个。
 *
 * - 朋友要先「加入」，没加入的人不会被排进每周的单（`twinHuddleSeriesRosterV0`）。发起人只看得到「已加入 / 还没加入」，
 *   分不出没理、不加入、邀请作废和退出。
 * - 「照旧就不用问我」是每个人对每件事单独开的开关，默认关，只有本人能开，随时能关。发起人也有一个（大家都行就不用
 *   我再选时间）。
 * - 「照旧」的定义很窄（`twinHuddleSeriesStandingV0`）：这一周所有被约的人都答了「行」。这时发起人开着开关就替他选这个时间；
 *   进入确认后，开着开关的人直接记为确认。只要有一个人不是「行」，这一周谁都不替谁确认，整张单按平常的商量走。
 * - 每件事一期 12 次，到期要发起人续；时间和人选不能改，要改就结束了重新发起，所以授权不会带到另一个安排上。
 * - 每周的单照样占商量的限额，照样过代答的三道关；开不出来就跳过这一周（`TWIN_HUDDLE_SERIES_SKIP_CODES_V0`）。
 * - 只存第一次的时刻，以后每次加 7 天；有夏令时的地区换季会差一小时，v0 不处理。
 *
 * 开关（后端接线时才读）：服务端 `TWIN_HUDDLE_SERIES_V0_ENABLED`（还要 `TWIN_HUDDLE_V0_ENABLED`），手机
 * `EXPO_PUBLIC_TWIN_HUDDLE_SERIES`，都只认精确的 `'1'`。
 * 本文件只有常量、类型和纯函数：不读环境变量、不碰数据库、不调模型。
 */
import type { AgentPassTierPresetV1 } from './agent-pass';
import { INTRODUCTION_NEED_REGIONS_V1, type IntroductionNeedRegionV1 } from './introduction';
import {
  decodeTwinHuddleRequestV0,
  TWIN_HUDDLE_BUDGET_BANDS_V0,
  TWIN_HUDDLE_ID_PATTERN_V0,
  TWIN_HUDDLE_KINDS_V0,
  type TwinHuddleBudgetBandV0,
  type TwinHuddleKindV0,
  type TwinHuddleReasonCodeV0,
} from './twin-huddle';
import type { TwinPrechatSlotV0 } from './twin-prechat';

export const TWIN_HUDDLE_SERIES_SCHEMA_VERSION_V0 = 'agentrix.twin-huddle-series.v0' as const;
export const TWIN_HUDDLE_SERIES_FLAG_V0 = 'TWIN_HUDDLE_SERIES_V0_ENABLED';
export const TWIN_HUDDLE_SERIES_MOBILE_FLAG_V0 = 'EXPO_PUBLIC_TWIN_HUDDLE_SERIES';

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

export const TWIN_HUDDLE_SERIES_LIMITS_V0 = {
  friendsMax: 9,
  /** 每人最多几件进行中的固定的事。 */
  activePerInitiatorMax: 3,
  /** 每人每天最多收几个「要不要加入」。 */
  invitesPerFriendPerDayMax: 5,
  /** 邀请多久没理就作废。 */
  inviteTtlMs: 7 * DAY_MS,
  periodMs: 7 * DAY_MS,
  /** 每次开始前多久开这一周的单。 */
  openLeadMs: 3 * DAY_MS,
  /** 离开始不到这么久就不开了，记为错过。发起时第一次也至少要在这么久以后。 */
  minNoticeMs: 6 * HOUR_MS,
  /** 刚发起时朋友还没决定加不加入：该开的单最多等到发起后这么久。 */
  inviteGraceMs: 24 * HOUR_MS,
  /** 等邀请最晚等到离开始还有这么久（比 `minNoticeMs` 多一小时，不会等到错过）。 */
  lastCallMs: 7 * HOUR_MS,
  /** 一期几次；到期要发起人续。 */
  occurrencesPerTerm: 12,
  /** 详情页带最近几周。 */
  runsShown: 6,
  retentionMs: 90 * DAY_MS,
} as const;

export const TWIN_HUDDLE_SERIES_STATUSES_V0 = ['active', 'ended'] as const;
export type TwinHuddleSeriesStatusV0 = (typeof TWIN_HUDDLE_SERIES_STATUSES_V0)[number];

export const TWIN_HUDDLE_SERIES_END_REASONS_V0 = ['initiator_ended', 'finished'] as const;
export type TwinHuddleSeriesEndReasonV0 = (typeof TWIN_HUDDLE_SERIES_END_REASONS_V0)[number];

/** `declined`（不加入）、`lapsed`（邀请作废）、`left`（退出）对发起人都是「还没加入」。 */
export const TWIN_HUDDLE_SERIES_MEMBER_STATES_V0 = ['invited', 'joined', 'declined', 'lapsed', 'left'] as const;
export type TwinHuddleSeriesMemberStateV0 = (typeof TWIN_HUDDLE_SERIES_MEMBER_STATES_V0)[number];

export const TWIN_HUDDLE_SERIES_RUN_OUTCOMES_V0 = ['opened', 'skipped'] as const;
export type TwinHuddleSeriesRunOutcomeV0 = (typeof TWIN_HUDDLE_SERIES_RUN_OUTCOMES_V0)[number];

/**
 * 这一周没开成的原因。`nobody_joined`：名单是空的（还没有人加入，或者加入的人这一周都点了跳过）；
 * `missed`：轮到开单时离开始已经太近；`failed`：开单时出了错。
 */
export const TWIN_HUDDLE_SERIES_SKIP_CODES_V0 = ['nobody_joined', 'initiator_not_opted_in', 'initiator_daily_limit', 'none_available', 'missed', 'failed'] as const;
export type TwinHuddleSeriesSkipCodeV0 = (typeof TWIN_HUDDLE_SERIES_SKIP_CODES_V0)[number];

export const TWIN_HUDDLE_SERIES_REFUSAL_CODES_V0 = ['initiator_not_opted_in', 'active_limit', 'none_available'] as const;
export type TwinHuddleSeriesRefusalCodeV0 = (typeof TWIN_HUDDLE_SERIES_REFUSAL_CODES_V0)[number];

/** `invite`：平台在站内问他要不要加入；`unavailable`：不联系，也不建行。 */
export const TWIN_HUDDLE_SERIES_FRIEND_ROUTES_V0 = ['invite', 'unavailable'] as const;
export type TwinHuddleSeriesFriendRouteV0 = (typeof TWIN_HUDDLE_SERIES_FRIEND_ROUTES_V0)[number];

export type TwinHuddleSeriesDecodeResultV0<T> = { ok: true; value: T } | { ok: false; reasonCode: TwinHuddleReasonCodeV0; field: string };

export const TWIN_HUDDLE_SERIES_ID_PATTERN_V0 = TWIN_HUDDLE_ID_PATTERN_V0;

// ── 发起 ─────────────────────────────────────────────────────────────────────────

export interface TwinHuddleSeriesDetailsV0 {
  kind: TwinHuddleKindV0;
  region?: IntroductionNeedRegionV1;
  budget: TwinHuddleBudgetBandV0;
  note?: string;
}

export interface TwinHuddleSeriesRequestV0 extends TwinHuddleSeriesDetailsV0 {
  /** 第一次的时间；以后每 7 天一次。 */
  first: TwinPrechatSlotV0;
  /** 1–9 位朋友的不透明 ref，不重复。不支持链接名额。 */
  friendRefs: string[];
  /** 发起人自己的开关：大家都行就不用我再选时间。不带就是关。 */
  auto: boolean;
}

type Failure = { ok: false; reasonCode: TwinHuddleReasonCodeV0; field: string };

const L = TWIN_HUDDLE_SERIES_LIMITS_V0;

function fail(reasonCode: TwinHuddleReasonCodeV0, field: string): Failure {
  return { ok: false, reasonCode, field };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function isOneOf<T extends string>(list: readonly T[], value: unknown): value is T {
  return typeof value === 'string' && (list as readonly string[]).includes(value);
}

/**
 * 事由、时间、地区、人均档、备注和朋友的规则和商量单完全一样（借 `decodeTwinHuddleRequestV0` 检查），只是候选时间正好一个、
 * 不认链接名额。时间是不是太近太远要对着现在看，由调用方用 `twinHuddleSeriesFirstValidV0` 查。
 */
export function decodeTwinHuddleSeriesRequestV0(value: unknown, field = 'request'): TwinHuddleSeriesDecodeResultV0<TwinHuddleSeriesRequestV0> {
  if (!isRecord(value)) return fail('invalid_type', field);
  const allowed = ['kind', 'first', 'region', 'budget', 'friendRefs', 'note', 'auto'];
  for (const key of Object.keys(value)) if (!allowed.includes(key)) return fail('unknown_field', `${field}.${key}`);
  if (value.first === undefined) return fail('missing_field', `${field}.first`);
  if (value.auto !== undefined && typeof value.auto !== 'boolean') return fail('invalid_type', `${field}.auto`);
  const { first, auto, ...rest } = value;
  const inner = decodeTwinHuddleRequestV0({ ...rest, candidates: [first] }, field);
  if (inner.ok === false) return fail(inner.reasonCode, inner.field.replace(`${field}.candidates[0]`, `${field}.first`).replace(`${field}.candidates`, `${field}.first`));
  const out: TwinHuddleSeriesRequestV0 = {
    kind: inner.value.kind,
    first: inner.value.candidates[0],
    budget: inner.value.budget,
    friendRefs: inner.value.friendRefs,
    auto: auto === true,
  };
  if (inner.value.region !== undefined) out.region = inner.value.region;
  if (inner.value.note !== undefined) out.note = inner.value.note;
  return { ok: true, value: out };
}

/** 发起时第一次的时间：离现在至少 `minNoticeMs`。（最远 30 天由商量单自己的规则管。） */
export function twinHuddleSeriesFirstValidV0(first: TwinPrechatSlotV0, now: string): boolean {
  return Date.parse(first.startAt) - Date.parse(now) >= L.minNoticeMs;
}

export interface TwinHuddleSeriesFriendStateV0 {
  ref: string;
  /** ref 还指向发起人协作关系里的一个人。 */
  known: boolean;
  /** 平台能在站内找到他。 */
  inApp: boolean;
  tierFromInitiator: AgentPassTierPresetV1 | null;
  tierToInitiator: AgentPassTierPresetV1 | null;
  /** 任一方屏蔽了另一方。 */
  blocked: boolean;
  /** 他过去 24 小时收到的「要不要加入」。 */
  invitesToday: number;
}

export interface TwinHuddleSeriesStartInputV0 {
  initiatorOptedIn: boolean;
  /** 发起人进行中的固定的事有几件。 */
  activeSeries: number;
  friends: readonly TwinHuddleSeriesFriendStateV0[];
}

export type TwinHuddleSeriesStartResultV0 =
  | { ok: true; routes: { ref: string; route: TwinHuddleSeriesFriendRouteV0 }[] }
  | { ok: false; code: TwinHuddleSeriesRefusalCodeV0 };

/** 只邀请双向定过档、已注册、没有互相屏蔽、当天邀请没收满的朋友；其余的不联系，发起人只看到「暂时约不了」。 */
export function twinHuddleSeriesFriendRouteV0(friend: TwinHuddleSeriesFriendStateV0): TwinHuddleSeriesFriendRouteV0 {
  if (!friend.known || !friend.inApp || friend.tierFromInitiator === null || friend.tierToInitiator === null || friend.blocked) return 'unavailable';
  return friend.invitesToday >= L.invitesPerFriendPerDayMax ? 'unavailable' : 'invite';
}

export function twinHuddleSeriesCanStartV0(input: TwinHuddleSeriesStartInputV0): TwinHuddleSeriesStartResultV0 {
  if (!input.initiatorOptedIn) return { ok: false, code: 'initiator_not_opted_in' };
  if (input.activeSeries >= L.activePerInitiatorMax) return { ok: false, code: 'active_limit' };
  const routes = input.friends.map((friend) => ({ ref: friend.ref, route: twinHuddleSeriesFriendRouteV0(friend) }));
  return routes.some((item) => item.route === 'invite') ? { ok: true, routes } : { ok: false, code: 'none_available' };
}

// ── 每周开单 ─────────────────────────────────────────────────────────────────────

/** 第 `occurrence` 次（从 0 数）的时间：第一次加若干个 7 天。 */
export function twinHuddleSeriesSlotV0(first: TwinPrechatSlotV0, occurrence: number): TwinPrechatSlotV0 {
  const shift = occurrence * L.periodMs;
  return { startAt: new Date(Date.parse(first.startAt) + shift).toISOString(), endAt: new Date(Date.parse(first.endAt) + shift).toISOString() };
}

/** 从现在起第一个还来得及开单的是第几次。续期时用。 */
export function twinHuddleSeriesUpcomingV0(first: TwinPrechatSlotV0, now: string): number {
  const gap = Date.parse(now) + L.minNoticeMs - Date.parse(first.startAt);
  return gap <= 0 ? 0 : Math.ceil(gap / L.periodMs);
}

export type TwinHuddleSeriesDueV0 =
  | { due: 'wait'; occurrence: number; slot: TwinPrechatSlotV0; openAt: string }
  | { due: 'open'; occurrence: number; slot: TwinPrechatSlotV0 }
  | { due: 'missed'; occurrence: number; slot: TwinPrechatSlotV0 }
  | { due: 'finished' };

/** 现在该拿下一次怎么办：还没到开单的时候、该开了、已经太近（记为错过）、这一期开完了。 */
export function twinHuddleSeriesDueV0(input: { first: TwinPrechatSlotV0; nextOccurrence: number; occurrencesMax: number; now: string }): TwinHuddleSeriesDueV0 {
  if (input.nextOccurrence >= input.occurrencesMax) return { due: 'finished' };
  const occurrence = input.nextOccurrence;
  const slot = twinHuddleSeriesSlotV0(input.first, occurrence);
  const start = Date.parse(slot.startAt);
  const now = Date.parse(input.now);
  if (now < start - L.openLeadMs) return { due: 'wait', occurrence, slot, openAt: new Date(start - L.openLeadMs).toISOString() };
  if (start - now < L.minNoticeMs) return { due: 'missed', occurrence, slot };
  return { due: 'open', occurrence, slot };
}

/**
 * 该开单了，但还有人没决定加不加入：先等等，最晚等到发起后 24 小时或者离开始只剩 7 小时（先到的为准），
 * 再用已经加入的人开。邀请 7 天作废，所以只有头一两周会等。
 */
export function twinHuddleSeriesHoldForInvitesV0(input: { createdAt: string; slot: TwinPrechatSlotV0; now: string; pendingInvites: number }): boolean {
  if (input.pendingInvites <= 0) return false;
  return Date.parse(input.now) < Math.min(Date.parse(input.createdAt) + L.inviteGraceMs, Date.parse(input.slot.startAt) - L.lastCallMs);
}
/** 这一周的单约谁：已加入、没点「下周跳过我」的人，按 ref 排序。 */
export function twinHuddleSeriesRosterV0(members: readonly { ref: string; state: TwinHuddleSeriesMemberStateV0; skipNext: boolean }[]): string[] {
  return members
    .filter((member) => member.state === 'joined' && !member.skipNext)
    .map((member) => member.ref)
    .sort();
}

export interface TwinHuddleSeriesStandingInputV0 {
  /** 这张单上所有被约的人都答了「行」（`TwinHuddleProposalV0.everyone`）。 */
  everyone: boolean;
  initiatorAuto: boolean;
  /** 这张单上的人和他对这件事的开关（读的是此刻的开关，不是开单时的）。 */
  members: readonly { ref: string; auto: boolean }[];
}

/**
 * 「照旧」时能替谁做什么。不是所有人都行：什么都不替。都行：发起人开着开关就替他选这个时间（`choose`）；
 * 进入确认后开着开关的人记为确认（`confirmRefs`，按 ref 排序）。
 */
export function twinHuddleSeriesStandingV0(input: TwinHuddleSeriesStandingInputV0): { choose: boolean; confirmRefs: string[] } {
  if (!input.everyone) return { choose: false, confirmRefs: [] };
  return {
    choose: input.initiatorAuto,
    confirmRefs: input.members
      .filter((member) => member.auto)
      .map((member) => member.ref)
      .sort(),
  };
}

// ── 自己的开关 ───────────────────────────────────────────────────────────────────

export interface TwinHuddleSeriesMineV0 {
  /** 照旧就不用问我。 */
  auto?: boolean;
  /** 下周跳过我：只管下一张单，用过复位。发起人没有这一项。 */
  skipNext?: boolean;
}

/** `PUT …/me` 的请求：至少带一项。 */
export function decodeTwinHuddleSeriesMineV0(value: unknown, field = 'body'): TwinHuddleSeriesDecodeResultV0<TwinHuddleSeriesMineV0> {
  if (!isRecord(value)) return fail('invalid_type', field);
  for (const key of Object.keys(value)) if (key !== 'auto' && key !== 'skipNext') return fail('unknown_field', `${field}.${key}`);
  const out: TwinHuddleSeriesMineV0 = {};
  if (value.auto !== undefined) {
    if (typeof value.auto !== 'boolean') return fail('invalid_type', `${field}.auto`);
    out.auto = value.auto;
  }
  if (value.skipNext !== undefined) {
    if (typeof value.skipNext !== 'boolean') return fail('invalid_type', `${field}.skipNext`);
    out.skipNext = value.skipNext;
  }
  if (out.auto === undefined && out.skipNext === undefined) return fail('missing_field', `${field}.auto`);
  return { ok: true, value: out };
}

/** `POST …/join` 的请求：可以顺手带上开关；不带就是关。 */
export function decodeTwinHuddleSeriesJoinV0(value: unknown, field = 'body'): TwinHuddleSeriesDecodeResultV0<{ auto: boolean }> {
  if (value === undefined || value === null) return { ok: true, value: { auto: false } };
  if (!isRecord(value)) return fail('invalid_type', field);
  for (const key of Object.keys(value)) if (key !== 'auto') return fail('unknown_field', `${field}.${key}`);
  if (value.auto !== undefined && typeof value.auto !== 'boolean') return fail('invalid_type', `${field}.auto`);
  return { ok: true, value: { auto: value.auto === true } };
}

// ── 视图 ─────────────────────────────────────────────────────────────────────────

export interface TwinHuddleSeriesNextV0 {
  occurrence: number;
  slot: TwinPrechatSlotV0;
  /** 这一周的单什么时候开。 */
  openAt: string;
}

/** 发起人看到的一位朋友：称呼是发起人自己名单里的标识；只有「已加入 / 还没加入」。 */
export interface TwinHuddleSeriesPersonV0 {
  ref: string;
  label: string;
  joined: boolean;
}

export interface TwinHuddleSeriesRunV0 {
  occurrence: number;
  startAt: string;
  outcome: TwinHuddleSeriesRunOutcomeV0;
  /** 开出来的那张商量单；跳过的那一周没有。 */
  huddleId: string | null;
  skipCode: TwinHuddleSeriesSkipCodeV0 | null;
}

interface TwinHuddleSeriesCommonV0 {
  schemaVersion: typeof TWIN_HUDDLE_SERIES_SCHEMA_VERSION_V0;
  id: string;
  status: TwinHuddleSeriesStatusV0;
  details: TwinHuddleSeriesDetailsV0;
  first: TwinPrechatSlotV0;
  /** 下一次；结束了或这一期开完了就是 null。 */
  next: TwinHuddleSeriesNextV0 | null;
  createdAt: string;
}

export interface TwinHuddleSeriesInitiatorViewV0 extends TwinHuddleSeriesCommonV0 {
  role: 'initiator';
  endedReason: TwinHuddleSeriesEndReasonV0 | null;
  /** 这一期还剩几次。 */
  occurrencesLeft: number;
  canEnd: boolean;
  canRenew: boolean;
  people: TwinHuddleSeriesPersonV0[];
  /** 我的开关：大家都行就不用我再选时间。 */
  auto: boolean;
  /** 最近几周，新的在前。 */
  runs: TwinHuddleSeriesRunV0[];
}

export const TWIN_HUDDLE_SERIES_MY_STATES_V0 = ['invited', 'joined'] as const;
export type TwinHuddleSeriesMyStateV0 = (typeof TWIN_HUDDLE_SERIES_MY_STATES_V0)[number];

/** 朋友看到的。不加入、邀请作废、退出以后这件事就不再是他的，没有视图。 */
export interface TwinHuddleSeriesMemberViewV0 extends TwinHuddleSeriesCommonV0 {
  role: 'member';
  initiatorName: string;
  /** 发起人一共邀请了几位（含我）。 */
  peopleCount: number;
  myState: TwinHuddleSeriesMyStateV0;
  /** 还没加入时：邀请什么时候作废。 */
  inviteEndsAt: string | null;
  auto: boolean;
  skipNext: boolean;
  canJoin: boolean;
  canLeave: boolean;
}

export const TWIN_HUDDLE_SERIES_ROLES_V0 = ['initiator', 'member'] as const;
export type TwinHuddleSeriesRoleV0 = (typeof TWIN_HUDDLE_SERIES_ROLES_V0)[number];

export interface TwinHuddleSeriesListItemV0 {
  id: string;
  role: TwinHuddleSeriesRoleV0;
  status: TwinHuddleSeriesStatusV0;
  kind: TwinHuddleKindV0;
  first: TwinPrechatSlotV0;
  /** 下一次的开始时间；没有下一次就是 null。 */
  nextStartAt: string | null;
  /** 现在轮到我点：朋友还没决定加不加入；发起人的这一期开完了等他续。 */
  needsMe: boolean;
  /** 只有我发起的有：已加入几位。 */
  joined: number | null;
  createdAt: string;
}

export type TwinHuddleSeriesStartOutcomeV0 =
  | { started: true; seriesId: string; routes: { ref: string; route: TwinHuddleSeriesFriendRouteV0 }[] }
  | { started: false; code: TwinHuddleSeriesRefusalCodeV0 };

/** 站内通知的标题（中文）和正文（英文）。只发站内，不推送到手机。 */
export const TWIN_HUDDLE_SERIES_FIXED_PHRASES_V0 = {
  invite: { zh: '朋友想每周固定约你，看看要不要加入', en: 'A friend would like a weekly plan with you. Join if you like.' },
  joined: { zh: '有朋友加入了你的每周固定', en: 'A friend joined your weekly plan.' },
  asUsual: { zh: '这周照旧，已按你的授权确认', en: 'Same as usual this week. Confirmed under your standing permission.' },
  autoChosen: { zh: '这周大家都行，已按你的设置定了时间，等大家确认', en: 'Everyone can make it this week. The time is set as you asked; waiting for confirmations.' },
  skipped: { zh: '这周的没开成，下周再试', en: 'This week could not be set up. It will try again next week.' },
  finished: { zh: '每周固定到期了，要不要再续 12 周', en: 'Your weekly plan has run its term. Renew for 12 more weeks?' },
  ended: { zh: '发起人结束了这个每周固定', en: 'The organizer ended this weekly plan.' },
} as const;

export const TWIN_HUDDLE_SERIES_SKIP_LABELS_V0: Readonly<Record<TwinHuddleSeriesSkipCodeV0, { zh: string; en: string }>> = {
  nobody_joined: { zh: '这一周没有可约的人', en: 'Nobody to ask this week' },
  initiator_not_opted_in: { zh: '你关掉了「让分身替我商量」', en: 'You turned off planning by your twin' },
  initiator_daily_limit: { zh: '那天你发起的商量已经满了', en: 'You had reached the daily limit of plans' },
  none_available: { zh: '那天联系不上任何一位', en: 'Nobody could be reached that day' },
  missed: { zh: '没赶上开单', en: 'It was too late to set up' },
  failed: { zh: '开单时出了问题', en: 'Something went wrong while setting up' },
};

// ── 客户端读服务器的回答 ──────────────────────────────────────────────────────

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

function isCount(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0;
}

function isText(value: unknown): value is string {
  return typeof value === 'string';
}

/**
 * 可以是 null 的字段：对不上返回 undefined。写成函数而不是就地 `x !== null && !is(x)`：
 * 后端编译不开 strictNullChecks，就地判断收窄不了 unknown，这个文件在两种设置下都要能编译。
 */
function orNull<T>(value: unknown, is: (item: unknown) => item is T): T | null | undefined {
  if (value === null) return null;
  return is(value) ? value : undefined;
}

const isSkipCode = (value: unknown): value is TwinHuddleSeriesSkipCodeV0 => isOneOf(TWIN_HUDDLE_SERIES_SKIP_CODES_V0, value);
const isEndReason = (value: unknown): value is TwinHuddleSeriesEndReasonV0 => isOneOf(TWIN_HUDDLE_SERIES_END_REASONS_V0, value);

function readList<T>(value: unknown, read: (item: unknown) => T | null): T[] | null {
  if (!Array.isArray(value)) return null;
  const out: T[] = [];
  for (const item of value) {
    const parsed = read(item);
    if (parsed === null) return null;
    out.push(parsed);
  }
  return out;
}

function readSlot(value: unknown): TwinPrechatSlotV0 | null {
  if (!isRecord(value) || !isTime(value.startAt) || !isTime(value.endAt)) return null;
  return { startAt: value.startAt, endAt: value.endAt };
}

function readDetails(value: unknown): TwinHuddleSeriesDetailsV0 | null {
  if (!isRecord(value) || !isOneOf(TWIN_HUDDLE_KINDS_V0, value.kind) || !isOneOf(TWIN_HUDDLE_BUDGET_BANDS_V0, value.budget)) return null;
  const out: TwinHuddleSeriesDetailsV0 = { kind: value.kind, budget: value.budget };
  if (value.region !== undefined && value.region !== null) {
    if (!isOneOf(INTRODUCTION_NEED_REGIONS_V1, value.region)) return null;
    out.region = value.region;
  }
  if (value.note !== undefined && value.note !== null) {
    if (typeof value.note !== 'string') return null;
    out.note = value.note;
  }
  return out;
}

function readNext(value: unknown): TwinHuddleSeriesNextV0 | null {
  if (!isRecord(value) || !isCount(value.occurrence) || !isTime(value.openAt)) return null;
  const slot = readSlot(value.slot);
  return slot === null ? null : { occurrence: value.occurrence, slot, openAt: value.openAt };
}

function readCommon(value: Record<string, unknown>): TwinHuddleSeriesCommonV0 | null {
  const { schemaVersion, id, status, createdAt } = value;
  if (schemaVersion !== TWIN_HUDDLE_SERIES_SCHEMA_VERSION_V0 || typeof id !== 'string' || !TWIN_HUDDLE_SERIES_ID_PATTERN_V0.test(id)) return null;
  if (!isOneOf(TWIN_HUDDLE_SERIES_STATUSES_V0, status) || !isTime(createdAt)) return null;
  const details = readDetails(value.details);
  const first = readSlot(value.first);
  if (details === null || first === null) return null;
  let next: TwinHuddleSeriesNextV0 | null = null;
  if (value.next !== null && value.next !== undefined) {
    next = readNext(value.next);
    if (next === null) return null;
  }
  return { schemaVersion, id, status, details, first, next, createdAt };
}

function readPerson(value: unknown): TwinHuddleSeriesPersonV0 | null {
  if (!isRecord(value) || typeof value.ref !== 'string' || typeof value.label !== 'string' || typeof value.joined !== 'boolean') return null;
  return { ref: value.ref, label: value.label, joined: value.joined };
}

function readRun(value: unknown): TwinHuddleSeriesRunV0 | null {
  if (!isRecord(value)) return null;
  const { occurrence, startAt, outcome } = value;
  if (!isCount(occurrence) || !isTime(startAt) || !isOneOf(TWIN_HUDDLE_SERIES_RUN_OUTCOMES_V0, outcome)) return null;
  const huddleId = orNull(value.huddleId, isText);
  const skipCode = orNull(value.skipCode, isSkipCode);
  if (huddleId === undefined || skipCode === undefined) return null;
  return { occurrence, startAt, outcome, huddleId, skipCode };
}

function readInitiatorView(value: Record<string, unknown>): TwinHuddleSeriesInitiatorViewV0 | null {
  const common = readCommon(value);
  if (!common) return null;
  const { occurrencesLeft, canEnd, canRenew, auto } = value;
  const endedReason = orNull(value.endedReason, isEndReason);
  if (endedReason === undefined) return null;
  if (!isCount(occurrencesLeft) || typeof canEnd !== 'boolean' || typeof canRenew !== 'boolean' || typeof auto !== 'boolean') return null;
  const people = readList(value.people, readPerson);
  const runs = readList(value.runs, readRun);
  if (people === null || runs === null) return null;
  return { ...common, role: 'initiator', endedReason, occurrencesLeft, canEnd, canRenew, people, auto, runs };
}

function readMemberView(value: Record<string, unknown>): TwinHuddleSeriesMemberViewV0 | null {
  const common = readCommon(value);
  if (!common) return null;
  const { initiatorName, peopleCount, myState, auto, skipNext, canJoin, canLeave } = value;
  if (typeof initiatorName !== 'string' || !isCount(peopleCount) || !isOneOf(TWIN_HUDDLE_SERIES_MY_STATES_V0, myState)) return null;
  const inviteEndsAt = orNull(value.inviteEndsAt, isTime);
  if (inviteEndsAt === undefined) return null;
  if (typeof auto !== 'boolean' || typeof skipNext !== 'boolean' || typeof canJoin !== 'boolean' || typeof canLeave !== 'boolean') return null;
  return { ...common, role: 'member', initiatorName, peopleCount, myState, inviteEndsAt, auto, skipNext, canJoin, canLeave };
}

export function decodeTwinHuddleSeriesViewV0(body: unknown): TwinHuddleSeriesInitiatorViewV0 | TwinHuddleSeriesMemberViewV0 | null {
  const value = unwrapData(body, 'role');
  if (!isRecord(value)) return null;
  if (value.role === 'initiator') return readInitiatorView(value);
  if (value.role === 'member') return readMemberView(value);
  return null;
}

/** 不加入、退出以后的回答：这件事不再是我的，`{ view: null }`。 */
export function decodeTwinHuddleSeriesGoneV0(body: unknown): { view: null } | null {
  const value = unwrapData(body, 'view');
  return isRecord(value) && value.view === null ? { view: null } : null;
}

function readListItem(value: unknown): TwinHuddleSeriesListItemV0 | null {
  if (!isRecord(value)) return null;
  const { id, role, status, kind, needsMe, createdAt } = value;
  if (typeof id !== 'string' || !isOneOf(TWIN_HUDDLE_SERIES_ROLES_V0, role) || !isOneOf(TWIN_HUDDLE_SERIES_STATUSES_V0, status)) return null;
  if (!isOneOf(TWIN_HUDDLE_KINDS_V0, kind) || typeof needsMe !== 'boolean' || !isTime(createdAt)) return null;
  const nextStartAt = orNull(value.nextStartAt, isTime);
  const joined = orNull(value.joined, isCount);
  if (nextStartAt === undefined || joined === undefined) return null;
  const first = readSlot(value.first);
  if (first === null) return null;
  return { id, role, status, kind, first, nextStartAt, needsMe, joined, createdAt };
}

export function decodeTwinHuddleSeriesListV0(body: unknown): TwinHuddleSeriesListItemV0[] | null {
  const value = unwrapData(body, 'items');
  return isRecord(value) ? readList(value.items, readListItem) : null;
}

function readRoute(value: unknown): { ref: string; route: TwinHuddleSeriesFriendRouteV0 } | null {
  if (!isRecord(value) || typeof value.ref !== 'string' || !isOneOf(TWIN_HUDDLE_SERIES_FRIEND_ROUTES_V0, value.route)) return null;
  return { ref: value.ref, route: value.route };
}

export function decodeTwinHuddleSeriesStartOutcomeV0(body: unknown): TwinHuddleSeriesStartOutcomeV0 | null {
  const value = unwrapData(body, 'started');
  if (!isRecord(value)) return null;
  if (value.started === false) return isOneOf(TWIN_HUDDLE_SERIES_REFUSAL_CODES_V0, value.code) ? { started: false, code: value.code } : null;
  if (value.started !== true || typeof value.seriesId !== 'string' || !TWIN_HUDDLE_SERIES_ID_PATTERN_V0.test(value.seriesId)) return null;
  const routes = readList(value.routes, readRoute);
  return routes === null ? null : { started: true, seriesId: value.seriesId, routes };
}
