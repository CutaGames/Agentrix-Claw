/**
 * 「缺人一键问」v0 的合同（设计 `.agents/tasks/twin-social-net/huddle-fill-design.md`）。
 *
 * 商量单（`twin-huddle.ts`）定下来以后人不够：发起人点一下「还缺 N 个」，这张单上确认要来、在站内的朋友各自可以带一个人。
 * - 只有已定（`settled`）、定的时间还没开始的单能发；一张单只发一次；缺 1–3 个。
 * - 带人的朋友从自己的名单里选一个人（平台在站内问他），或者拿一条链接自己转；站内问不了的一律改给链接，不说原因。
 * - 被带的人自己点「来」、自己写一个给发起人看的称呼；走链接的标「未验证」。发起人说「好」才算加进这一次。
 * - 被带的人在发起人说「好」之前看不到发起人是谁、看不到别的人；发起人在对方点「来」之前看不到任何关于他的字。
 * - 凑够就停，有人退出又开；只管这一次：不进「每周固定」、记账单、Telegram 群名单和地点，不建关系、不定档。
 *
 * 开关只认精确的 `'1'`，还要商量的开关开着。关着时路由 404，商量和原来一模一样。
 */
import type { AgentPassTierPresetV1 } from './agent-pass';
import { INTRODUCTION_NEED_REGIONS_V1, type IntroductionNeedRegionV1 } from './introduction';
import {
  TWIN_HUDDLE_ID_PATTERN_V0,
  TWIN_HUDDLE_KINDS_V0,
  type TwinHuddleDecodeResultV0,
  type TwinHuddleKindV0,
  type TwinHuddleReasonCodeV0,
  type TwinHuddleStatusV0,
} from './twin-huddle';
import { twinPrechatTextViolationsV0, type TwinPrechatSlotV0 } from './twin-prechat';

export const TWIN_HUDDLE_FILL_SCHEMA_VERSION_V0 = 'agentrix.twin-huddle-fill.v0' as const;
export const TWIN_HUDDLE_FILL_FLAG_V0 = 'TWIN_HUDDLE_FILL_V0_ENABLED';
export const TWIN_HUDDLE_FILL_MOBILE_FLAG_V0 = 'EXPO_PUBLIC_TWIN_HUDDLE_FILL';

const HOUR_MS = 60 * 60 * 1000;

export const TWIN_HUDDLE_FILL_LIMITS_V0 = {
  wantedMin: 1,
  wantedMax: 3,
  /** 每位带人的朋友每次「缺人」最多选几次人（站内和链接合计，撤回的也算）。 */
  bringTriesMax: 3,
  /** 每人每天在站内被问「愿不愿意被带去」最多几次；满了改走链接。 */
  askedPerDayMax: 5,
  /** 发起人每天最多发几次「缺人」（和发起商量分开数）。 */
  perInitiatorPerDay: 5,
  /** 发出以后最长开多久；定的时间先到就先停。 */
  windowMs: 48 * HOUR_MS,
  labelMin: 1,
  labelMax: 20,
} as const;

const L = TWIN_HUDDLE_FILL_LIMITS_V0;

/**
 * 被带的人那一行：`asked` 站内问了、`link` 链接发出去了还没人回；`agreed` 愿意来，等发起人；`declined` 不去；
 * `accepted` 发起人说好；`passed` 发起人说先不用；`withdrawn` 带人的朋友撤回，或被带的人撤回 / 来不了。
 */
export const TWIN_HUDDLE_FILL_PERSON_STATES_V0 = ['asked', 'link', 'agreed', 'declined', 'accepted', 'passed', 'withdrawn'] as const;
export type TwinHuddleFillPersonStateV0 = (typeof TWIN_HUDDLE_FILL_PERSON_STATES_V0)[number];

/** 还占着带人朋友那一个名额的几种：同一时间每位朋友只能有一行在这几种里。 */
export const TWIN_HUDDLE_FILL_LIVE_STATES_V0: readonly TwinHuddleFillPersonStateV0[] = ['asked', 'link', 'agreed', 'accepted'];

export const TWIN_HUDDLE_FILL_ROUTES_V0 = ['app', 'link'] as const;
export type TwinHuddleFillRouteV0 = (typeof TWIN_HUDDLE_FILL_ROUTES_V0)[number];

/** 「缺人」这件事：开着、人够了（有人退出会重新开）、结束了。由计数和时间算出来，不存。 */
export const TWIN_HUDDLE_FILL_STATES_V0 = ['open', 'full', 'ended'] as const;
export type TwinHuddleFillStateV0 = (typeof TWIN_HUDDLE_FILL_STATES_V0)[number];

/** 谁在看这张单的「缺人」：发起人，或者这张单上在站内的被约的人（确认要来的才能带人）。 */
export const TWIN_HUDDLE_FILL_ROLES_V0 = ['initiator', 'bridge'] as const;
export type TwinHuddleFillRoleV0 = (typeof TWIN_HUDDLE_FILL_ROLES_V0)[number];

export const TWIN_HUDDLE_FILL_DECISIONS_V0 = ['accept', 'pass'] as const;
export type TwinHuddleFillDecisionV0 = (typeof TWIN_HUDDLE_FILL_DECISIONS_V0)[number];

export const TWIN_HUDDLE_FILL_ANSWERS_V0 = ['come', 'decline'] as const;
export type TwinHuddleFillAnswerV0 = (typeof TWIN_HUDDLE_FILL_ANSWERS_V0)[number];

/** 带人的朋友看到的自己带的人：不去、先不用、人够了、结束了没轮上，都只说「这次不了」（`not_this_time`）。 */
export const TWIN_HUDDLE_FILL_MINE_STATES_V0 = ['waiting', 'agreed', 'accepted', 'not_this_time', 'withdrawn'] as const;
export type TwinHuddleFillMineStateV0 = (typeof TWIN_HUDDLE_FILL_MINE_STATES_V0)[number];

/** 被带的人看到的自己：先不用、人够了、结束了没轮上，都只说「这次人已经够了」（`not_this_time`）。 */
export const TWIN_HUDDLE_FILL_INVITE_STATES_V0 = ['waiting', 'agreed', 'accepted', 'declined', 'not_this_time', 'withdrawn'] as const;
export type TwinHuddleFillInviteStateV0 = (typeof TWIN_HUDDLE_FILL_INVITE_STATES_V0)[number];

/** 请求本身没问题、但现在做不了的原因（409 的 `code`）。 */
export const TWIN_HUDDLE_FILL_CONFLICT_CODES_V0 = [
  'fill_closed',
  'fill_started',
  'fill_daily_limit',
  'no_bridge',
  'fill_full',
  'bring_limit',
  'bring_waiting',
  'answer_closed',
  'decide_closed',
] as const;
export type TwinHuddleFillConflictCodeV0 = (typeof TWIN_HUDDLE_FILL_CONFLICT_CODES_V0)[number];

/** 发给本人的站内通知只用这些，每一句都得能过 `twinPrechatTextViolationsV0`。不带名字、时间和地点。 */
export const TWIN_HUDDLE_FILL_FIXED_PHRASES_V0 = {
  askBridge: { zh: '定好的局还缺人，你能带个朋友来吗？', en: 'A plan you are in is short of people. Can you bring a friend?' },
  askBrought: { zh: '有朋友想带你去一个局，去看看？', en: 'A friend would like to bring you along. Take a look?' },
  agreed: { zh: '朋友带来了一位，等你点头。', en: 'A friend is bringing someone. It is your call.' },
  accepted: { zh: '定了，欢迎一起来。', en: 'You are in. See you there.' },
} as const;

// ── 规则 ──────────────────────────────────────────────────────────────────────────

/** 截止时间：发出后 48 小时和定的时间开始，哪个早算哪个。 */
export function twinHuddleFillEndsAtV0(now: string, slotStartAt: string): string {
  return new Date(Math.min(Date.parse(now) + L.windowMs, Date.parse(slotStartAt))).toISOString();
}

/** 「缺人」现在是什么样：发起人点了结束或过了截止时间是 `ended`；加进来的人到了要的数是 `full`；否则 `open`。 */
export function twinHuddleFillStateV0(fill: { wanted: number; endsAt: string; endedAt: string | null }, accepted: number, now: string): TwinHuddleFillStateV0 {
  if (fill.endedAt !== null || !(Date.parse(now) < Date.parse(fill.endsAt))) return 'ended';
  return accepted >= fill.wanted ? 'full' : 'open';
}

export interface TwinHuddleFillStartInputV0 {
  status: TwinHuddleStatusV0;
  /** 定下的那个时间的开始；没定是 null。 */
  slotStartAt: string | null;
  now: string;
  /** 这张单已经发过「缺人」。 */
  started: boolean;
  /** 发起人过去 24 小时发了几次。 */
  startedToday: number;
  /** 确认要来、在站内的被约的人有几位。 */
  bridges: number;
}

/** 按这个顺序查；能发返回 null。 */
export function twinHuddleFillRefusalV0(input: TwinHuddleFillStartInputV0): Extract<TwinHuddleFillConflictCodeV0, 'fill_closed' | 'fill_started' | 'fill_daily_limit' | 'no_bridge'> | null {
  if (input.status !== 'settled' || input.slotStartAt === null || !(Date.parse(input.now) < Date.parse(input.slotStartAt))) return 'fill_closed';
  if (input.started) return 'fill_started';
  if (input.startedToday >= L.perInitiatorPerDay) return 'fill_daily_limit';
  if (input.bridges === 0) return 'no_bridge';
  return null;
}

/** 带人的朋友从自己名单里选的那个人，此刻的情况。 */
export interface TwinHuddleFillFriendStateV0 {
  /** ref 还指向带人朋友协作关系里的一个人。 */
  known: boolean;
  /** 平台能在站内找到他：有账号，而且这个功能对他开放。 */
  inApp: boolean;
  /** 带人的朋友给他定的档；没定是 null。 */
  tierFromBridge: AgentPassTierPresetV1 | null;
  /** 他给带人的朋友定的档；没定是 null。 */
  tierToBridge: AgentPassTierPresetV1 | null;
  /** 他和带人的朋友、或者和发起人之间，有一方屏蔽了另一方（查不了也算）。 */
  blocked: boolean;
  /** 过去 24 小时他在站内被问过几次「愿不愿意被带去」。 */
  askedToday: number;
  /** 他是发起人本人、已经在这张单上，或者这次已经被人在站内问过。 */
  onHuddle: boolean;
}

/** 站内问还是给链接。任何一条不满足都改走链接，不告诉带人的朋友是哪一条。 */
export function twinHuddleFillRouteV0(friend: TwinHuddleFillFriendStateV0): TwinHuddleFillRouteV0 {
  if (!friend.known || !friend.inApp || friend.onHuddle || friend.blocked) return 'link';
  if (friend.tierFromBridge === null || friend.tierToBridge === null) return 'link';
  if (friend.askedToday >= L.askedPerDayMax) return 'link';
  return 'app';
}

/** 这一行还在等回答：站内问了或链接发出去了。 */
export function twinHuddleFillWaitingV0(state: TwinHuddleFillPersonStateV0): boolean {
  return state === 'asked' || state === 'link';
}

/** 带人的朋友看到的样子。 */
export function twinHuddleFillMineStateV0(state: TwinHuddleFillPersonStateV0, fill: TwinHuddleFillStateV0): TwinHuddleFillMineStateV0 {
  if (state === 'accepted') return 'accepted';
  if (state === 'withdrawn') return 'withdrawn';
  if (twinHuddleFillWaitingV0(state)) return fill === 'open' ? 'waiting' : 'not_this_time';
  if (state === 'agreed') return fill === 'open' ? 'agreed' : 'not_this_time';
  return 'not_this_time';
}

/** 被带的人看到的样子。 */
export function twinHuddleFillInviteStateV0(state: TwinHuddleFillPersonStateV0, fill: TwinHuddleFillStateV0): TwinHuddleFillInviteStateV0 {
  if (state === 'accepted') return 'accepted';
  if (state === 'withdrawn') return 'withdrawn';
  if (state === 'declined') return 'declined';
  if (twinHuddleFillWaitingV0(state)) return fill === 'open' ? 'waiting' : 'not_this_time';
  if (state === 'agreed') return fill === 'open' ? 'agreed' : 'not_this_time';
  return 'not_this_time';
}

// ── 请求 ──────────────────────────────────────────────────────────────────────────

type Failure = { ok: false; reasonCode: TwinHuddleReasonCodeV0; field: string };

const CONTROL = /[\u0000-\u001f\u007f]/;
const REL_REF = /^rel:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function fail(reasonCode: TwinHuddleReasonCodeV0, field: string): Failure {
  return { ok: false, reasonCode, field };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

/** 只允许 `required` 和 `optional` 里的键，`required` 的必须有。 */
function fields(value: unknown, required: readonly string[], optional: readonly string[], field: string): TwinHuddleDecodeResultV0<Record<string, unknown>> {
  if (!isRecord(value)) return fail('invalid_type', field);
  for (const name of Object.keys(value)) if (!required.includes(name) && !optional.includes(name)) return fail('unknown_field', `${field}.${name}`);
  for (const name of required) if (value[name] === undefined) return fail('missing_field', `${field}.${name}`);
  return { ok: true, value };
}

function isOneOf<T extends string>(list: readonly T[], value: unknown): value is T {
  return typeof value === 'string' && (list as readonly string[]).includes(value);
}

function personId(value: unknown, at: string): TwinHuddleDecodeResultV0<string> {
  if (typeof value !== 'string') return fail('invalid_type', at);
  if (!TWIN_HUDDLE_ID_PATTERN_V0.test(value)) return fail('invalid_value', at);
  return { ok: true, value: value.toLowerCase() };
}

/** 被带的人写给发起人看的称呼：去掉首尾空白后 1–20 个字，没有控制字符，过文字规则（不许电话、邮箱、链接这些）。 */
export function decodeTwinHuddleFillLabelV0(value: unknown, field = 'body.label'): TwinHuddleDecodeResultV0<string> {
  if (typeof value !== 'string') return fail('invalid_type', field);
  const label = value.trim();
  const length = Array.from(label).length;
  if (length < L.labelMin || CONTROL.test(label)) return fail('invalid_value', field);
  if (length > L.labelMax) return fail('too_long', field);
  if (twinPrechatTextViolationsV0(label).length > 0) return fail('text_violation', field);
  return { ok: true, value: label };
}

/** `POST …/:id/fill` 的请求：`{ wanted }`，缺几个（1–3）。 */
export function decodeTwinHuddleFillStartV0(value: unknown, field = 'body'): TwinHuddleDecodeResultV0<{ wanted: number }> {
  const decoded = fields(value, ['wanted'], [], field);
  if (decoded.ok === false) return decoded;
  const wanted = decoded.value.wanted;
  if (typeof wanted !== 'number') return fail('invalid_type', `${field}.wanted`);
  if (!Number.isInteger(wanted) || wanted < L.wantedMin || wanted > L.wantedMax) return fail('invalid_value', `${field}.wanted`);
  return { ok: true, value: { wanted } };
}

/** `POST …/:id/fill/decide` 的请求：`{ personId, decision }`。 */
export function decodeTwinHuddleFillDecideV0(value: unknown, field = 'body'): TwinHuddleDecodeResultV0<{ personId: string; decision: TwinHuddleFillDecisionV0 }> {
  const decoded = fields(value, ['personId', 'decision'], [], field);
  if (decoded.ok === false) return decoded;
  const id = personId(decoded.value.personId, `${field}.personId`);
  if (id.ok === false) return id;
  const decision = decoded.value.decision;
  if (typeof decision !== 'string') return fail('invalid_type', `${field}.decision`);
  if (!isOneOf(TWIN_HUDDLE_FILL_DECISIONS_V0, decision)) return fail('invalid_value', `${field}.decision`);
  return { ok: true, value: { personId: id.value, decision } };
}

/** `POST …/:id/fill/bring` 的请求：`{}` 是拿一条链接自己转；`{ friendRef }` 是从自己名单里选的人（`rel:…`）。 */
export function decodeTwinHuddleFillBringV0(value: unknown, field = 'body'): TwinHuddleDecodeResultV0<{ friendRef: string | null }> {
  const decoded = fields(value, [], ['friendRef'], field);
  if (decoded.ok === false) return decoded;
  const ref = decoded.value.friendRef;
  if (ref === undefined) return { ok: true, value: { friendRef: null } };
  if (typeof ref !== 'string') return fail('invalid_type', `${field}.friendRef`);
  if (!REL_REF.test(ref)) return fail('invalid_value', `${field}.friendRef`);
  return { ok: true, value: { friendRef: `rel:${ref.slice(4).toLowerCase()}` } };
}

/** `POST …/:id/fill/withdraw` 的请求：`{ personId }`，带人的朋友撤回自己带的那一位。 */
export function decodeTwinHuddleFillWithdrawV0(value: unknown, field = 'body'): TwinHuddleDecodeResultV0<{ personId: string }> {
  const decoded = fields(value, ['personId'], [], field);
  if (decoded.ok === false) return decoded;
  const id = personId(decoded.value.personId, `${field}.personId`);
  return id.ok === false ? id : { ok: true, value: { personId: id.value } };
}

/** 被带的人的回答：`{ decision: 'come', label }` 或 `{ decision: 'decline' }`（不去不写理由，也不带称呼）。`extra` 是链接页多带的 `code`。 */
export function decodeTwinHuddleFillAnswerV0(
  value: unknown,
  field = 'body',
  extra: readonly string[] = [],
): TwinHuddleDecodeResultV0<{ decision: TwinHuddleFillAnswerV0; label: string | null }> {
  const decoded = fields(value, ['decision', ...extra], ['label'], field);
  if (decoded.ok === false) return decoded;
  const decision = decoded.value.decision;
  if (typeof decision !== 'string') return fail('invalid_type', `${field}.decision`);
  if (!isOneOf(TWIN_HUDDLE_FILL_ANSWERS_V0, decision)) return fail('invalid_value', `${field}.decision`);
  if (decision === 'decline') {
    if (decoded.value.label !== undefined) return fail('unknown_field', `${field}.label`);
    return { ok: true, value: { decision, label: null } };
  }
  if (decoded.value.label === undefined) return fail('missing_field', `${field}.label`);
  const label = decodeTwinHuddleFillLabelV0(decoded.value.label, `${field}.label`);
  return label.ok === false ? label : { ok: true, value: { decision, label: label.value } };
}

// ── 视图 ─────────────────────────────────────────────────────────────────────────────

export interface TwinHuddleFillSummaryV0 {
  wanted: number;
  /** 发起人说了「好」、还在的人数。 */
  accepted: number;
  endsAt: string;
  state: TwinHuddleFillStateV0;
}

/** 发起人看到的一位被带来的人。对方点「来」之前没有这一条。 */
export interface TwinHuddleFillPersonV0 {
  id: string;
  /** 带他来的朋友：发起人自己名单里的 ref（和商量单上 `people` 的 `ref` 一样）。 */
  bridgeRef: string;
  /** 对方自己写的称呼。 */
  label: string;
  /** 站内问来的是 true；走链接来的平台没核实过是谁，是 false（显示「未验证」）。 */
  verified: boolean;
  state: 'agreed' | 'accepted';
  canDecide: boolean;
}

/** 带人的朋友看到的自己带的一位。 */
export interface TwinHuddleFillMineV0 {
  id: string;
  route: TwinHuddleFillRouteV0;
  /** 站内带的人是谁：带人朋友自己名单里的 ref。链接是 null。 */
  friendRef: string | null;
  state: TwinHuddleFillMineStateV0;
  canWithdraw: boolean;
}

/** `GET …/:id/fill`：发起人和这张单上在站内的被约的人看到的「缺人」。 */
export interface TwinHuddleFillViewV0 {
  schemaVersion: typeof TWIN_HUDDLE_FILL_SCHEMA_VERSION_V0;
  huddleId: string;
  role: TwinHuddleFillRoleV0;
  /** 没发过是 null。 */
  fill: TwinHuddleFillSummaryV0 | null;
  /** 只有发起人可能是 true。 */
  canStart: boolean;
  canEnd: boolean;
  /** 只给发起人：愿意来、等他点头的（人够了、结束了就不列）和已经加进来的，按回答先后。带人的朋友是空数组。 */
  people: TwinHuddleFillPersonV0[];
  /** 只给带人的朋友：自己这次带过的人，按先后。发起人是空数组。 */
  mine: TwinHuddleFillMineV0[];
  canBring: boolean;
  /** 带人的朋友这次还能选几次。发起人是 0。 */
  triesLeft: number;
}

/** `POST …/:id/fill/bring` 的回答。 */
export interface TwinHuddleFillBringOutcomeV0 {
  view: TwinHuddleFillViewV0;
  route: TwinHuddleFillRouteV0;
  /** 只在 `link` 时有，只给这一次：服务器只存它的 SHA-256。放在 `/huddle/bring#` 后面。 */
  code?: string;
}

/** 被带的人的链接页。链接码放在 `#` 后面，浏览器不会把这一段发给服务器。 */
export const TWIN_HUDDLE_FILL_GUEST_PAGE_PATH_V0 = '/huddle/bring';

export function twinHuddleFillGuestLinkV0(origin: string, code: string): string {
  return `${origin.replace(/\/+$/, '')}${TWIN_HUDDLE_FILL_GUEST_PAGE_PATH_V0}#${code}`;
}

/** 被带的人看到的邀请（站内和链接页一样）。 */
export interface TwinHuddleFillInviteV0 {
  schemaVersion: typeof TWIN_HUDDLE_FILL_SCHEMA_VERSION_V0;
  /** 站内的那一行；链接页是 null。 */
  id: string | null;
  /** 带你的朋友在平台上的昵称；没有是空串。 */
  bridgeName: string;
  kind: TwinHuddleKindV0;
  /** 定下的那个时间。 */
  slot: TwinPrechatSlotV0;
  region: IntroductionNeedRegionV1 | null;
  /** 现在确定来的人数：发起人、确认来的被约的人、已经加进来的被带的人。 */
  headcount: number;
  state: TwinHuddleFillInviteStateV0;
  /** 发起人说「好」以后才有。 */
  initiatorName: string | null;
  /** 自己写的称呼；只在 `agreed` / `accepted` 时有。 */
  label: string | null;
  canAnswer: boolean;
  canWithdraw: boolean;
}

/** `GET /twin-huddle/fill/invites` 的一项。 */
export interface TwinHuddleFillInviteItemV0 {
  id: string;
  kind: TwinHuddleKindV0;
  startAt: string;
  state: TwinHuddleFillInviteStateV0;
  needsMe: boolean;
}

/*
 * 下面的 decode…V0 只用来读服务器的回答：认识的字段逐个检查，多出来的字段不管，外面包一层 `{ data: … }` 也认。
 * 对不上就返回 null，调用方按「读不出来」处理。
 */

const isCount = (value: unknown): value is number => typeof value === 'number' && Number.isInteger(value) && value >= 0;
const isIso = (value: unknown): value is string => typeof value === 'string' && Number.isFinite(Date.parse(value));

function unwrap(body: unknown, key: string): unknown {
  return isRecord(body) && isRecord(body.data) && body[key] === undefined ? body.data : body;
}

function readList<T>(value: unknown, read: (item: unknown) => T | null): T[] | null {
  if (!Array.isArray(value)) return null;
  const out: T[] = [];
  for (const item of value) {
    const read1 = read(item);
    if (read1 === null) return null;
    out.push(read1);
  }
  return out;
}

function readSummary(value: unknown): TwinHuddleFillSummaryV0 | null {
  if (!isRecord(value)) return null;
  const { wanted, accepted, endsAt, state } = value;
  if (!isCount(wanted) || wanted < L.wantedMin || wanted > L.wantedMax || !isCount(accepted) || accepted > wanted) return null;
  if (!isIso(endsAt) || !isOneOf(TWIN_HUDDLE_FILL_STATES_V0, state)) return null;
  return { wanted, accepted, endsAt, state };
}

function readPerson(value: unknown): TwinHuddleFillPersonV0 | null {
  if (!isRecord(value)) return null;
  const { id, bridgeRef, label, verified, state, canDecide } = value;
  if (typeof id !== 'string' || typeof bridgeRef !== 'string' || typeof label !== 'string') return null;
  if (typeof verified !== 'boolean' || (state !== 'agreed' && state !== 'accepted') || typeof canDecide !== 'boolean') return null;
  return { id, bridgeRef, label, verified, state, canDecide };
}

function readMine(value: unknown): TwinHuddleFillMineV0 | null {
  if (!isRecord(value)) return null;
  const { id, route, friendRef, state, canWithdraw } = value;
  if (typeof id !== 'string' || !isOneOf(TWIN_HUDDLE_FILL_ROUTES_V0, route)) return null;
  if (friendRef !== null && typeof friendRef !== 'string') return null;
  if (!isOneOf(TWIN_HUDDLE_FILL_MINE_STATES_V0, state) || typeof canWithdraw !== 'boolean') return null;
  return { id, route, friendRef: typeof friendRef === 'string' ? friendRef : null, state, canWithdraw };
}

export function decodeTwinHuddleFillViewV0(body: unknown): TwinHuddleFillViewV0 | null {
  const value = unwrap(body, 'schemaVersion');
  if (!isRecord(value) || value.schemaVersion !== TWIN_HUDDLE_FILL_SCHEMA_VERSION_V0) return null;
  const { huddleId, role, canStart, canEnd, canBring, triesLeft } = value;
  if (typeof huddleId !== 'string' || !isOneOf(TWIN_HUDDLE_FILL_ROLES_V0, role)) return null;
  if (typeof canStart !== 'boolean' || typeof canEnd !== 'boolean' || typeof canBring !== 'boolean' || !isCount(triesLeft)) return null;
  const fill = value.fill === null ? null : readSummary(value.fill);
  if (value.fill !== null && fill === null) return null;
  const people = readList(value.people, readPerson);
  const mine = readList(value.mine, readMine);
  if (people === null || mine === null) return null;
  return { schemaVersion: TWIN_HUDDLE_FILL_SCHEMA_VERSION_V0, huddleId, role, fill, canStart, canEnd, people, mine, canBring, triesLeft };
}

export function decodeTwinHuddleFillBringOutcomeV0(body: unknown): TwinHuddleFillBringOutcomeV0 | null {
  const value = unwrap(body, 'view');
  if (!isRecord(value) || !isOneOf(TWIN_HUDDLE_FILL_ROUTES_V0, value.route)) return null;
  const view = decodeTwinHuddleFillViewV0(value.view);
  if (view === null) return null;
  if (value.route === 'link') {
    if (typeof value.code !== 'string' || value.code.length === 0) return null;
    return { view, route: 'link', code: value.code };
  }
  return { view, route: 'app' };
}

function readSlot(value: unknown): TwinPrechatSlotV0 | null {
  if (!isRecord(value) || !isIso(value.startAt) || !isIso(value.endAt)) return null;
  return { startAt: value.startAt, endAt: value.endAt };
}

export function decodeTwinHuddleFillInviteV0(body: unknown): TwinHuddleFillInviteV0 | null {
  const value = unwrap(body, 'schemaVersion');
  if (!isRecord(value) || value.schemaVersion !== TWIN_HUDDLE_FILL_SCHEMA_VERSION_V0) return null;
  const { id, bridgeName, kind, region, headcount, state, initiatorName, label, canAnswer, canWithdraw } = value;
  if ((id !== null && typeof id !== 'string') || typeof bridgeName !== 'string' || !isOneOf(TWIN_HUDDLE_KINDS_V0, kind)) return null;
  const slot = readSlot(value.slot);
  if (slot === null || (region !== null && !isOneOf(INTRODUCTION_NEED_REGIONS_V1, region)) || !isCount(headcount)) return null;
  if (!isOneOf(TWIN_HUDDLE_FILL_INVITE_STATES_V0, state)) return null;
  if ((initiatorName !== null && typeof initiatorName !== 'string') || (label !== null && typeof label !== 'string')) return null;
  if (typeof canAnswer !== 'boolean' || typeof canWithdraw !== 'boolean') return null;
  return {
    schemaVersion: TWIN_HUDDLE_FILL_SCHEMA_VERSION_V0,
    id: typeof id === 'string' ? id : null,
    bridgeName,
    kind,
    slot,
    region: region === null ? null : (region as IntroductionNeedRegionV1),
    headcount,
    state,
    initiatorName: typeof initiatorName === 'string' ? initiatorName : null,
    label: typeof label === 'string' ? label : null,
    canAnswer,
    canWithdraw,
  };
}

function readInviteItem(value: unknown): TwinHuddleFillInviteItemV0 | null {
  if (!isRecord(value)) return null;
  const { id, kind, startAt, state, needsMe } = value;
  if (typeof id !== 'string' || !isOneOf(TWIN_HUDDLE_KINDS_V0, kind) || !isIso(startAt)) return null;
  if (!isOneOf(TWIN_HUDDLE_FILL_INVITE_STATES_V0, state) || typeof needsMe !== 'boolean') return null;
  return { id, kind, startAt, state, needsMe };
}

export function decodeTwinHuddleFillInviteListV0(body: unknown): TwinHuddleFillInviteItemV0[] | null {
  const value = unwrap(body, 'items');
  return isRecord(value) ? readList(value.items, readInviteItem) : null;
}
