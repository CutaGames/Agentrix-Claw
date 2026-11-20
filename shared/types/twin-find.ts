/**
 * 帮我找人（twin find，「朋友的朋友」，合同 v0；设计稿 `.agents/tasks/twin-social-net/fof-design.md`）。
 *
 * 提问的人选一个话题、写一句问题（120 字以内），一次问 1–10 位朋友「你认识合适的人吗」。
 *
 * - 问谁（`twinFindCanStartV0`）：只问双方互相定过档、已注册、没有互相屏蔽、当天没被问满的朋友（`app`）；其余的不建行
 *   （`unavailable`）。同一对人一周最多 3 次（`pair_weekly_limit`）。
 * - 朋友怎么答：只能本人，分身不代答。「牵个线」选一个人（自己朋友名单里的人，或写一个称呼），可以写一句介绍；或者
 *   「不认识合适的人」。选的人已注册、和这位朋友互相定过档、没有屏蔽、当天没被问满的，平台在站内问他（`app`）；否则平台
 *   不联系他，给这位朋友一条链接由他自己转（`link`，`twinFindCandidateRouteV0`）。
 * - 被介绍的人：同意或不同意。同意时自己写给提问的人看的称呼和一句话。链接同意的标「未验证」。
 * - 提问的人看到的（`twinFindPersonStateV0`）：对方点头之前，朋友没理、朋友说不认识、朋友选了人、对方拒绝，看起来都一样：
 *   进行中是「还在问」，结束后是「没有牵线」。对方点头以后才看到对方自己写的称呼和一句话，以及朋友写的介绍。朋友给对方
 *   起的称呼永远不给提问的人。
 * - 接上：提问的人对一位已同意的人点「请 TA 牵线」。平台签一张回执（`TwinFindIntroClaimsV0`，不带任何 id 和名字）。
 *   平台不交换联系方式：怎么联系由牵线的朋友来带。
 * - 结束：72 小时到，或提问的人提前结束；没接上的行里对方写的字一起清掉。90 天后整条删除。
 * - 分身的提醒（`twinFindSuggestV0`）：朋友自己关系簿里备注和问题对得上的人，最多 3 个。只按关键词对，只给朋友本人看。
 * - 自由文本只有问题、朋友写的介绍、称呼和被介绍的人那一句话：都不许带联系方式、地址和链接（`twinAskTextViolationsV0`）。
 * - 「找对象」话题（`dating`，设计稿 `find-meet-dating-design.md`）多三条：站内只问自己开了「我也在找」的人，其余
 *   的只给朋友链接；提问的人发起时、被介绍的人同意时都要声明已满 18 岁（只是声明，不验证件）；列表和通知里不出现
 *   话题和问题。
 * - 「先对条件卡」（`twin-find-card.ts`，设计稿 `find-card-design.md`）：找对象时平台要在站内问被选中的人之前，先对
 *   提问的人和他的两张卡；对不上那一行是 `mismatched`，不问他，朋友可以换一位。提问的人看到的和其他没接上的一样。
 * - 「牵上以后接着约」（同一份设计稿）：接上以后，牵线的朋友的视图里带上要约的两个人在他自己名单里的编号
 *   （`TwinFindMeetV0`），手机拿去填「分身们商量」的发起页。这里不开单，也不记商量单的编号。
 *
 * 开关（后端接线时才读）：服务端 `TWIN_FIND_V0_ENABLED`，只认精确的 `'1'`；网页 `NEXT_PUBLIC_TWIN_FIND_ENABLED`；
 * 手机 `EXPO_PUBLIC_TWIN_FIND`。找对象另有 `TWIN_FIND_DATING_V0_ENABLED` / `EXPO_PUBLIC_TWIN_FIND_DATING`，接着约另有
 * `TWIN_FIND_MEET_V0_ENABLED` / `EXPO_PUBLIC_TWIN_FIND_MEET`；都要先开着上面那一组。条件卡另有
 * `TWIN_FIND_CARD_V0_ENABLED` / `EXPO_PUBLIC_TWIN_FIND_CARD`，还要先开着找对象那一组。找对象（连同条件卡）服务端另有自己的
 * 名单 `TWIN_FIND_DATING_USER_IDS`（`twinFindDatingAdmitsV0`），手机按服务端回的 `datingAvailable` 决定显不显示入口。
 *
 * 本文件只有常量、类型和纯函数：不读环境变量、不碰数据库、不调模型。
 */
import { AGENT_PASS_TIER_PRESETS_V1, type AgentPassTierPresetV1 } from './agent-pass';
import { TWIN_ASK_TOPIC_LABELS_V0, TWIN_ASK_TOPICS_V0, twinAskTextViolationsV0 } from './twin-ask';

export const TWIN_FIND_SCHEMA_VERSION_V0 = 'agentrix.twin-find.v0' as const;
export const TWIN_FIND_FLAG_V0 = 'TWIN_FIND_V0_ENABLED';
export const TWIN_FIND_WEB_FLAG_V0 = 'NEXT_PUBLIC_TWIN_FIND_ENABLED';
export const TWIN_FIND_MOBILE_FLAG_V0 = 'EXPO_PUBLIC_TWIN_FIND';
/** 「找对象」话题。服务端关着时不能发起、不能改「我也在找」，选人时人人都按没开算。 */
export const TWIN_FIND_DATING_FLAG_V0 = 'TWIN_FIND_DATING_V0_ENABLED';
export const TWIN_FIND_DATING_MOBILE_FLAG_V0 = 'EXPO_PUBLIC_TWIN_FIND_DATING';
/**
 * 找对象自己的名单（逗号分隔的主人 id）：服务端找对象开着时，也只有名单里的人能发起、能打开「我也在找」、能存条件卡，
 * 朋友选人时名单外的人按没开「我也在找」算。和持牌名单 `L9_REGULATED_USER_IDS` 一个写法：只认精确 id，`*` 当没写，
 * 空名单在所有环境都没有人。L9 名单 `L9_COHORT_USER_IDS` 的 `*` 管不到这里。
 */
export const TWIN_FIND_DATING_USER_IDS_VAR_V0 = 'TWIN_FIND_DATING_USER_IDS';
/** 只认 `'1'`：开着时找对象不再看上面那份名单，L9 名单里的人都能用。改它只要重载后端，不用重新发版。 */
export const TWIN_FIND_DATING_ALL_USERS_FLAG_V0 = 'TWIN_FIND_DATING_ALL_USERS_V0_ENABLED';

/** 这位主人在不在找对象自己的名单里（总开关和 L9 名单由服务端另外看）。没有主人 id 一律不在。 */
export function twinFindDatingAdmitsV0(input: { userId: string | null | undefined; raw: string | undefined; allUsers: string | undefined }): boolean {
  if (typeof input.userId !== 'string' || input.userId.length === 0 || input.userId === '*') return false;
  if (input.allUsers === '1') return true;
  return (input.raw ?? '')
    .split(',')
    .map((item) => item.trim())
    .filter((item) => item.length > 0 && item !== '*')
    .includes(input.userId);
}
/** 「牵上以后接着约」。服务端关着时牵线朋友的视图里没有 `meet`。 */
export const TWIN_FIND_MEET_FLAG_V0 = 'TWIN_FIND_MEET_V0_ENABLED';
export const TWIN_FIND_MEET_MOBILE_FLAG_V0 = 'EXPO_PUBLIC_TWIN_FIND_MEET';

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

export const TWIN_FIND_LIMITS_V0 = {
  questionMax: 120,
  /** 朋友写的一句介绍。 */
  noteMax: 120,
  /** 朋友给没在名单里的人写的称呼：只给朋友自己和那个人看。 */
  labelMax: 20,
  /** 被介绍的人写给提问的人看的称呼和一句话。 */
  displayNameMax: 20,
  lineMax: 60,
  friendsMax: 10,
  /** 每人每天最多发起几次。 */
  findsPerDayMax: 5,
  /** 每人每天最多被朋友问几次「你认识合适的人吗」。 */
  perFriendPerDayMax: 5,
  /** 同一个提问的人一周最多问同一位朋友几次。 */
  perPairPerWeekMax: 3,
  /** 每人每天最多在站内被问几次「愿不愿意被介绍」；超过的走链接。 */
  introsPerDayMax: 5,
  /** 一次提问里，一位朋友最多选几次人（对方拒绝或撤回后可以换人）。 */
  picksPerBridgeMax: 3,
  suggestionsMax: 3,
  openMs: 3 * DAY_MS,
  /** 链接比提问多留一小时，给定时任务的延迟。 */
  linkTtlMs: 3 * DAY_MS + HOUR_MS,
  retentionMs: 90 * DAY_MS,
} as const;

/**
 * 话题是「问遍身边人」的那七个，加「找对象」（`dating`）。找对象只在这里有：那边分身会代答，找对象不该由分身答。
 * 这里没有「只问本人」：每一步都是本人点的，分身不代答。
 */
export const TWIN_FIND_DATING_TOPIC_V0 = 'dating' as const;
export const TWIN_FIND_TOPICS_V0 = [...TWIN_ASK_TOPICS_V0, TWIN_FIND_DATING_TOPIC_V0] as const;
export type TwinFindTopicV0 = (typeof TWIN_FIND_TOPICS_V0)[number];

export const TWIN_FIND_TOPIC_LABELS_V0: Readonly<Record<TwinFindTopicV0, { zh: string; en: string }>> = {
  ...TWIN_ASK_TOPIC_LABELS_V0,
  dating: { zh: '找对象', en: 'Dating' },
};

/**
 * 找对象多出来的三条规矩都从这里判断：站内只问开了「我也在找」的人（`twinFindCandidateRouteV0`），提问的人发起时和
 * 被介绍的人同意时都要声明已满 18 岁（`twinFindRequestMissingAdultV0`、`twinFindConsentMissingAdultV0`），列表和通知里
 * 不出现话题和问题（`twinFindListQuietV0`、`TWIN_FIND_FIXED_PHRASES_V0` 里带 `Quiet` 的两句）。
 */
export function twinFindIsDatingV0(topic: TwinFindTopicV0): boolean {
  return topic === TWIN_FIND_DATING_TOPIC_V0;
}

// ── 枚举 ──────────────────────────────────────────────────────────────────────

export const TWIN_FIND_STATUSES_V0 = ['open', 'closed'] as const;
export type TwinFindStatusV0 = (typeof TWIN_FIND_STATUSES_V0)[number];

export const TWIN_FIND_CLOSE_REASONS_V0 = ['asker_closed', 'expired'] as const;
export type TwinFindCloseReasonV0 = (typeof TWIN_FIND_CLOSE_REASONS_V0)[number];

/**
 * 每位被问的朋友一行：`asked` 等朋友作答；`declined` 朋友说不认识；`picked` 朋友选了人，等对方同意；`c_declined` 对方
 * 不同意或同意后撤回；`withdrawn` 朋友撤回牵线；`offered` 对方同意了，提问的人可以看到；`connected` 提问的人点了头；
 * `passed` 提问的人说先不用；`expired` 提问结束时还没接上。后三种是终点。`mismatched`：找对象时朋友选的人和提问的人
 * 两张条件卡没对上，平台没有去问他（`twin-find-card.ts`）；行里不留任何关于他的东西。
 */
export const TWIN_FIND_BRIDGE_STATES_V0 = ['asked', 'declined', 'picked', 'c_declined', 'withdrawn', 'mismatched', 'offered', 'connected', 'passed', 'expired'] as const;
export type TwinFindBridgeStateV0 = (typeof TWIN_FIND_BRIDGE_STATES_V0)[number];

/** 朋友在这些状态下可以选人（第一次选，或者换一个人）。 */
export const TWIN_FIND_PICK_FROM_V0: readonly TwinFindBridgeStateV0[] = ['asked', 'declined', 'c_declined', 'withdrawn', 'mismatched'];
/** 这些状态下行里带着被介绍的人的信息；离开它们时一起清掉（`connected` 留到保留期满）。 */
export const TWIN_FIND_CANDIDATE_STATES_V0: readonly TwinFindBridgeStateV0[] = ['picked', 'offered', 'connected'];
export const TWIN_FIND_FINAL_STATES_V0: readonly TwinFindBridgeStateV0[] = ['connected', 'passed', 'expired'];

/** 发起时每位朋友的路线：`app` 平台在站内问；后两种不建行。 */
export const TWIN_FIND_FRIEND_ROUTES_V0 = ['app', 'pair_weekly_limit', 'unavailable'] as const;
export type TwinFindFriendRouteV0 = (typeof TWIN_FIND_FRIEND_ROUTES_V0)[number];

/** 被介绍的人怎么被问到：`app` 平台在站内问；`link` 平台不联系，朋友自己转链接。 */
export const TWIN_FIND_CANDIDATE_ROUTES_V0 = ['app', 'link'] as const;
export type TwinFindCandidateRouteV0 = (typeof TWIN_FIND_CANDIDATE_ROUTES_V0)[number];

export const TWIN_FIND_REFUSAL_CODES_V0 = ['asker_daily_limit', 'people_count', 'none_available'] as const;
export type TwinFindRefusalCodeV0 = (typeof TWIN_FIND_REFUSAL_CODES_V0)[number];

export const TWIN_FIND_REASON_CODES_V0 = ['invalid_type', 'invalid_value', 'unknown_field', 'missing_field', 'too_long', 'text_violation'] as const;
export type TwinFindReasonCodeV0 = (typeof TWIN_FIND_REASON_CODES_V0)[number];

export type TwinFindDecodeResultV0<T> = { ok: true; value: T } | { ok: false; reasonCode: TwinFindReasonCodeV0; field: string };

/** 提问的人看到的每位朋友的状态。 */
export const TWIN_FIND_PERSON_STATES_V0 = ['waiting', 'offered', 'connected', 'passed', 'none'] as const;
export type TwinFindPersonStateV0 = (typeof TWIN_FIND_PERSON_STATES_V0)[number];

/** 对方点头之前的每一种情况，提问的人看到的都一样。 */
export function twinFindPersonStateV0(state: TwinFindBridgeStateV0, open: boolean): TwinFindPersonStateV0 {
  if (state === 'connected' || state === 'passed') return state;
  if (state === 'offered' && open) return 'offered';
  return open && state !== 'expired' ? 'waiting' : 'none';
}

/** 被介绍的人看到的自己的状态；行里已经不是他了的时候没有视图（404）。 */
export const TWIN_FIND_INTRO_STATES_V0 = ['asked', 'agreed', 'connected'] as const;
export type TwinFindIntroStateV0 = (typeof TWIN_FIND_INTRO_STATES_V0)[number];

export function twinFindIntroStateV0(state: TwinFindBridgeStateV0): TwinFindIntroStateV0 | null {
  if (state === 'picked') return 'asked';
  if (state === 'offered') return 'agreed';
  return state === 'connected' ? 'connected' : null;
}

// ── 解码 ──────────────────────────────────────────────────────────────────────

type Failure = { ok: false; reasonCode: TwinFindReasonCodeV0; field: string };

const L = TWIN_FIND_LIMITS_V0;
const REF = /^[A-Za-z0-9][A-Za-z0-9:_.-]{0,127}$/;
// eslint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u001f\u007f]/;

function fail(reasonCode: TwinFindReasonCodeV0, field: string): Failure {
  return { ok: false, reasonCode, field };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function isOneOf<T extends string>(list: readonly T[], value: unknown): value is T {
  return typeof value === 'string' && (list as readonly string[]).includes(value);
}

/** 后端用非严格模式编译这份文件，那里 `x !== null && …` 收窄不了 `unknown`；可以为空的字段一律用这几个守卫。 */
function isOneOfOrNull<T extends string>(list: readonly T[], value: unknown): value is T | null {
  return value === null || isOneOf(list, value);
}

function isStringOrNull(value: unknown): value is string | null {
  return value === null || typeof value === 'string';
}

function strict(value: unknown, field: string, allowed: readonly string[], required: readonly string[]): TwinFindDecodeResultV0<Record<string, unknown>> {
  if (!isRecord(value)) return fail('invalid_type', field);
  for (const key of Object.keys(value)) if (!allowed.includes(key)) return fail('unknown_field', `${field}.${key}`);
  for (const key of required) if (value[key] === undefined) return fail('missing_field', `${field}.${key}`);
  return { ok: true, value };
}

function decodeEnum<T extends string>(list: readonly T[], value: unknown, field: string): TwinFindDecodeResultV0<T> {
  if (typeof value !== 'string') return fail('invalid_type', field);
  return isOneOf(list, value) ? { ok: true, value } : fail('invalid_value', field);
}

function decodeRef(value: unknown, field: string): TwinFindDecodeResultV0<string> {
  if (typeof value !== 'string') return fail('invalid_type', field);
  return REF.test(value) ? { ok: true, value } : fail('invalid_value', field);
}

type TextKind = 'question' | 'note' | 'label' | 'displayName' | 'line';
const TEXT_MAX: Readonly<Record<TextKind, number>> = {
  question: L.questionMax,
  note: L.noteMax,
  label: L.labelMax,
  displayName: L.displayNameMax,
  line: L.lineMax,
};

/** 联系方式、地址、链接一律不许；长度另算。客户端可以拿它提前提示。 */
export function twinFindTextBlockedV0(text: string): boolean {
  return twinAskTextViolationsV0(text).some((violation) => violation !== 'too_long' && violation !== 'money');
}

/** 去掉首尾空白后 1 到上限个字（按码位数），一行。 */
function decodeText(value: unknown, field: string, kind: TextKind): TwinFindDecodeResultV0<string> {
  if (typeof value !== 'string') return fail('invalid_type', field);
  const text = value.trim();
  if (text.length === 0 || CONTROL.test(text)) return fail('invalid_value', field);
  if (Array.from(text).length > TEXT_MAX[kind]) return fail('too_long', field);
  if (twinFindTextBlockedV0(text)) return fail('text_violation', field);
  return { ok: true, value: text };
}

// ── 发起 ──────────────────────────────────────────────────────────────────────

export interface TwinFindRequestV0 {
  topic: TwinFindTopicV0;
  question: string;
  /** 提问的人自己朋友名单里的人：`rel:<关系 id>`。 */
  friendRefs: string[];
  /** 本人声明已满 18 岁，只能是 `true`。找对象必须带（`twinFindRequestMissingAdultV0`），别的话题带不带都行。 */
  adult?: true;
}

export function decodeTwinFindRequestV0(value: unknown, field = 'request'): TwinFindDecodeResultV0<TwinFindRequestV0> {
  const rec = strict(value, field, ['topic', 'question', 'friendRefs', 'adult'], ['topic', 'question', 'friendRefs']);
  if (rec.ok === false) return rec;
  const topic = decodeEnum(TWIN_FIND_TOPICS_V0, rec.value.topic, `${field}.topic`);
  if (topic.ok === false) return topic;
  const question = decodeText(rec.value.question, `${field}.question`, 'question');
  if (question.ok === false) return question;
  const list = rec.value.friendRefs;
  if (!Array.isArray(list)) return fail('invalid_type', `${field}.friendRefs`);
  if (list.length === 0 || list.length > L.friendsMax) return fail('invalid_value', `${field}.friendRefs`);
  const friendRefs: string[] = [];
  for (let i = 0; i < list.length; i += 1) {
    const ref = decodeRef(list[i], `${field}.friendRefs[${i}]`);
    if (ref.ok === false) return ref;
    if (friendRefs.includes(ref.value)) return fail('invalid_value', `${field}.friendRefs[${i}]`);
    friendRefs.push(ref.value);
  }
  if (rec.value.adult !== undefined && rec.value.adult !== true) return fail('invalid_value', `${field}.adult`);
  const adult: { adult?: true } = rec.value.adult === true ? { adult: true } : {};
  return { ok: true, value: { topic: topic.value, question: question.value, friendRefs, ...adult } };
}

/** 和同意时一样，不单独存这个声明：找对象的提问只要建了行，就是声明过的。 */
export function twinFindRequestMissingAdultV0(request: TwinFindRequestV0): boolean {
  return twinFindIsDatingV0(request.topic) && request.adult !== true;
}

export interface TwinFindFriendStateV0 {
  ref: string;
  /** 这条关系还在，指向的不是提问的人自己，也不是前面出现过的同一个人。 */
  known: boolean;
  /** 对方已注册（并且在名单里）。 */
  inApp: boolean;
  tierFromAsker: AgentPassTierPresetV1 | null;
  tierToAsker: AgentPassTierPresetV1 | null;
  /** 任何一方屏蔽了另一方。 */
  blocked: boolean;
  /** 对方今天已经被问了几次。 */
  askedToday: number;
  /** 提问的人这一周已经问了对方几次。 */
  pairThisWeek: number;
}

export interface TwinFindStartInputV0 {
  askerFoundToday: number;
  friends: readonly TwinFindFriendStateV0[];
}

export type TwinFindStartResultV0 = { ok: true; routes: { ref: string; route: TwinFindFriendRouteV0 }[] } | { ok: false; code: TwinFindRefusalCodeV0 };

export function twinFindFriendRouteV0(friend: TwinFindFriendStateV0): TwinFindFriendRouteV0 {
  if (!friend.known || !friend.inApp || friend.tierFromAsker === null || friend.tierToAsker === null || friend.blocked) return 'unavailable';
  if (friend.askedToday >= L.perFriendPerDayMax) return 'unavailable';
  return friend.pairThisWeek >= L.perPairPerWeekMax ? 'pair_weekly_limit' : 'app';
}

export function twinFindCanStartV0(input: TwinFindStartInputV0): TwinFindStartResultV0 {
  if (input.askerFoundToday >= L.findsPerDayMax) return { ok: false, code: 'asker_daily_limit' };
  if (input.friends.length === 0 || input.friends.length > L.friendsMax) return { ok: false, code: 'people_count' };
  const routes = input.friends.map((friend) => ({ ref: friend.ref, route: twinFindFriendRouteV0(friend) }));
  return routes.some((item) => item.route === 'app') ? { ok: true, routes } : { ok: false, code: 'none_available' };
}

// ── 朋友作答 ──────────────────────────────────────────────────────────────────

/** 朋友选的人：自己朋友名单里的一位（`rel:<关系 id>`），或者一个称呼。 */
export type TwinFindPickPersonV0 = { kind: 'friend'; ref: string } | { kind: 'guest'; label: string };

export interface TwinFindPickV0 {
  person: TwinFindPickPersonV0;
  /** 朋友写的一句介绍：被介绍的人看得到；对方同意以后提问的人也看得到。 */
  note?: string;
}

export function decodeTwinFindPickV0(value: unknown, field = 'pick'): TwinFindDecodeResultV0<TwinFindPickV0> {
  const rec = strict(value, field, ['person', 'note'], ['person']);
  if (rec.ok === false) return rec;
  const personField = `${field}.person`;
  if (!isRecord(rec.value.person)) return fail('invalid_type', personField);
  const kind = decodeEnum(['friend', 'guest'] as const, rec.value.person.kind, `${personField}.kind`);
  if (kind.ok === false) return kind;
  let person: TwinFindPickPersonV0;
  if (kind.value === 'friend') {
    const inner = strict(rec.value.person, personField, ['kind', 'ref'], ['kind', 'ref']);
    if (inner.ok === false) return inner;
    const ref = decodeRef(inner.value.ref, `${personField}.ref`);
    if (ref.ok === false) return ref;
    person = { kind: 'friend', ref: ref.value };
  } else {
    const inner = strict(rec.value.person, personField, ['kind', 'label'], ['kind', 'label']);
    if (inner.ok === false) return inner;
    const label = decodeText(inner.value.label, `${personField}.label`, 'label');
    if (label.ok === false) return label;
    person = { kind: 'guest', label: label.value };
  }
  if (rec.value.note === undefined) return { ok: true, value: { person } };
  const note = decodeText(rec.value.note, `${field}.note`, 'note');
  if (note.ok === false) return note;
  return { ok: true, value: { person, note: note.value } };
}

export interface TwinFindCandidateStateV0 {
  /** 朋友名单里的人，已注册（并且在名单里）。选到自己或提问的人，服务端直接拒收，不到这一步。 */
  inApp: boolean;
  /** 这位朋友和对方互相定过档。 */
  mutual: boolean;
  /** 对方和这位朋友之间、对方和提问的人之间，任何一方屏蔽了另一方。 */
  blocked: boolean;
  /** 对方今天已经在站内被问了几次「愿不愿意被介绍」。 */
  introsToday: number;
  /** 只有找对象才看：对方自己开着「我也在找」。没给就按没开算。 */
  datingOpen?: boolean;
}

/**
 * 平台只在站内联系和这位朋友互相定过档的人；其余的一律不联系，给朋友一条链接。找对象还要对方自己开着「我也在找」：
 * 平台不主动去问一个没说过自己在找的人，由朋友自己判断合不合适、自己转链接。
 */
export function twinFindCandidateRouteV0(candidate: TwinFindCandidateStateV0, topic: TwinFindTopicV0): TwinFindCandidateRouteV0 {
  if (twinFindIsDatingV0(topic) && candidate.datingOpen !== true) return 'link';
  return candidate.inApp && candidate.mutual && !candidate.blocked && candidate.introsToday < L.introsPerDayMax ? 'app' : 'link';
}

// ── 被介绍的人 ────────────────────────────────────────────────────────────────

export const TWIN_FIND_DECISIONS_V0 = ['agree', 'decline'] as const;
export type TwinFindDecisionV0 = (typeof TWIN_FIND_DECISIONS_V0)[number];

/** `adult`：本人声明已满 18 岁，只能是 `true`。找对象必须带（`twinFindConsentMissingAdultV0`），别的话题带不带都行。 */
export type TwinFindConsentV0 = { decision: 'agree'; displayName: string; line: string | null; adult?: true } | { decision: 'decline' };

/** 找对象：同意里没有「已满 18 岁」的声明，不收。只是声明，不验证件；不单独存，找对象的行有同意时间就是声明过的。 */
export function twinFindConsentMissingAdultV0(topic: TwinFindTopicV0, consent: TwinFindConsentV0): boolean {
  return twinFindIsDatingV0(topic) && consent.decision === 'agree' && consent.adult !== true;
}

/** 同意要带称呼（给提问的人看），可以带一句话；不同意什么都不带。 */
export function decodeTwinFindConsentV0(value: unknown, field = 'consent'): TwinFindDecodeResultV0<TwinFindConsentV0> {
  const rec = strict(value, field, ['decision', 'displayName', 'line', 'adult'], ['decision']);
  if (rec.ok === false) return rec;
  const decision = decodeEnum(TWIN_FIND_DECISIONS_V0, rec.value.decision, `${field}.decision`);
  if (decision.ok === false) return decision;
  if (decision.value === 'decline') {
    if (rec.value.displayName !== undefined) return fail('unknown_field', `${field}.displayName`);
    if (rec.value.line !== undefined) return fail('unknown_field', `${field}.line`);
    if (rec.value.adult !== undefined) return fail('unknown_field', `${field}.adult`);
    return { ok: true, value: { decision: 'decline' } };
  }
  if (rec.value.adult !== undefined && rec.value.adult !== true) return fail('invalid_value', `${field}.adult`);
  const adult: { adult?: true } = rec.value.adult === true ? { adult: true } : {};
  if (rec.value.displayName === undefined) return fail('missing_field', `${field}.displayName`);
  const displayName = decodeText(rec.value.displayName, `${field}.displayName`, 'displayName');
  if (displayName.ok === false) return displayName;
  if (rec.value.line === undefined || rec.value.line === null || rec.value.line === '') {
    return { ok: true, value: { decision: 'agree', displayName: displayName.value, line: null, ...adult } };
  }
  const line = decodeText(rec.value.line, `${field}.line`, 'line');
  if (line.ok === false) return line;
  return { ok: true, value: { decision: 'agree', displayName: displayName.value, line: line.value, ...adult } };
}

/** 提问的人对一位朋友那一行点头或说先不用：只带那一行的 ref。 */
export function decodeTwinFindRefV0(value: unknown, field = 'body'): TwinFindDecodeResultV0<{ ref: string }> {
  const rec = strict(value, field, ['ref'], ['ref']);
  if (rec.ok === false) return rec;
  const ref = decodeRef(rec.value.ref, `${field}.ref`);
  if (ref.ok === false) return ref;
  return { ok: true, value: { ref: ref.value } };
}

// ── 分身的提醒 ────────────────────────────────────────────────────────────────

/** 朋友自己关系簿里的一个人：称呼和朋友自己写的备注。只在算提醒的那一刻用，不写进任何表。 */
export interface TwinFindBookEntryV0 {
  ref: string;
  label: string;
  note: string;
}

export interface TwinFindSuggestionV0 {
  ref: string;
  label: string;
}

/** 问句里常见、但说不出要找什么人的词。 */
const STOP_ZH = new Set([
  '认识', '靠谱', '推荐', '哪个', '哪家', '哪位', '有没', '没有', '什么', '怎么', '可以', '一个', '一位', '朋友', '知道', '请问',
  '附近', '最近', '比较', '想找', '找个', '找人', '帮忙', '介绍', '师傅', '需要', '不错', '好点', '一下', '大家', '身边',
]);
const STOP_EN = new Set([
  'who', 'knows', 'know', 'good', 'reliable', 'anyone', 'any', 'the', 'for', 'and', 'can', 'you', 'recommend', 'need', 'looking',
  'find', 'someone', 'somebody', 'does', 'with', 'that', 'near', 'around', 'please', 'help',
]);
/** 带这些字的两字词多半是虚词拼出来的，不拿来对。 */
const FUNCTION_CHARS = /[的吗呢了谁吧啊呀么哪和与或是在有个要想找请能会很都也就还给让把被我你他她它们这那]/;

/** 问题里拿来和备注对的词：两个字的中文词，三个字母以上的英文词和数字。 */
export function twinFindKeywordsV0(question: string): string[] {
  const text = question.normalize('NFKC').toLowerCase();
  const words = new Set<string>();
  for (const run of text.match(/[\u4e00-\u9fff]+/g) ?? []) {
    const chars = Array.from(run);
    for (let i = 0; i + 1 < chars.length; i += 1) {
      const word = `${chars[i]}${chars[i + 1]}`;
      if (!FUNCTION_CHARS.test(word) && !STOP_ZH.has(word)) words.add(word);
    }
  }
  for (const word of text.match(/[a-z0-9]{3,}/g) ?? []) if (!STOP_EN.has(word)) words.add(word);
  return [...words];
}

/**
 * 朋友的关系簿里，称呼或备注和问题对得上的人，最多 3 个：对上的词多的在前，一样多按原来的顺序。只按关键词对，不调模型；
 * 结果只放进这位朋友自己的视图。
 */
export function twinFindSuggestV0(question: string, entries: readonly TwinFindBookEntryV0[]): TwinFindSuggestionV0[] {
  const keywords = twinFindKeywordsV0(question);
  if (keywords.length === 0) return [];
  const scored: { ref: string; label: string; score: number; order: number }[] = [];
  entries.forEach((entry, order) => {
    const label = entry.label.trim();
    if (!label || !REF.test(entry.ref)) return;
    const text = `${label} ${entry.note}`.normalize('NFKC').toLowerCase();
    const score = keywords.filter((word) => text.includes(word)).length;
    if (score > 0) scored.push({ ref: entry.ref, label: Array.from(label).slice(0, L.labelMax).join(''), score, order });
  });
  return scored
    .sort((a, b) => b.score - a.score || a.order - b.order)
    .slice(0, L.suggestionsMax)
    .map(({ ref, label }) => ({ ref, label }));
}

// ── 视图 ──────────────────────────────────────────────────────────────────────

export interface TwinFindFriendOptionV0 {
  friendRef: string;
  label: string;
  tier: AgentPassTierPresetV1;
}

/** 对方点头以后提问的人看到的：称呼和一句话是对方自己写的，介绍是朋友写的。 */
export interface TwinFindOfferV0 {
  displayName: string;
  line: string | null;
  note: string | null;
  /** 对方是在站内登录着同意的；走链接同意的是 false，界面标「未验证」。 */
  verified: boolean;
}

export interface TwinFindPersonV0 {
  ref: string;
  label: string;
  state: TwinFindPersonStateV0;
  /** 只有 `offered` 和 `connected` 有。 */
  offer: TwinFindOfferV0 | null;
  connectedAt: string | null;
}

export interface TwinFindAskerViewV0 {
  schemaVersion: typeof TWIN_FIND_SCHEMA_VERSION_V0;
  id: string;
  role: 'asker';
  status: TwinFindStatusV0;
  closedReason: TwinFindCloseReasonV0 | null;
  topic: TwinFindTopicV0;
  question: string;
  createdAt: string;
  endsAt: string;
  closedAt: string | null;
  people: TwinFindPersonV0[];
}

/** 朋友选的人：称呼是朋友自己看的（名单里的标识，或他写的称呼）。 */
export interface TwinFindPickedV0 {
  route: TwinFindCandidateRouteV0;
  label: string;
  note: string | null;
}

/**
 * 「牵上以后接着约」：接上以后，牵线的朋友可以开一张商量单约这两个人。这里给的都是他自己名单里的编号（`rel:<关系 id>`）
 * 和他当初自己写的称呼，没有任何他本来不知道的东西。提问的人已经不在他名单里时 `askerRef` 是 null，约不了。被介绍的
 * 人是从名单里选的就有 `candidateRef`，是写称呼走链接的就有 `candidateLabel`。
 */
export interface TwinFindMeetV0 {
  askerRef: string | null;
  candidateRef: string | null;
  candidateLabel: string | null;
}

/** 商量发起页要的两样：名单里的人和链接名额的称呼。少一个人就约不了，是 null。 */
export function twinFindMeetPeopleV0(meet: TwinFindMeetV0): { friendRefs: string[]; guestLabels: string[] } | null {
  if (meet.askerRef === null) return null;
  if (meet.candidateRef !== null) return meet.candidateRef === meet.askerRef ? null : { friendRefs: [meet.askerRef, meet.candidateRef], guestLabels: [] };
  return meet.candidateLabel !== null ? { friendRefs: [meet.askerRef], guestLabels: [meet.candidateLabel] } : null;
}

export interface TwinFindBridgeViewV0 {
  schemaVersion: typeof TWIN_FIND_SCHEMA_VERSION_V0;
  id: string;
  role: 'bridge';
  status: TwinFindStatusV0;
  topic: TwinFindTopicV0;
  question: string;
  askerName: string;
  createdAt: string;
  endsAt: string;
  myState: TwinFindBridgeStateV0;
  /** 只有 `picked`、`offered`、`connected` 有。 */
  picked: TwinFindPickedV0 | null;
  picksLeft: number;
  canPick: boolean;
  canDecline: boolean;
  canWithdraw: boolean;
  /** 链接丢了可以换一条：只有等对方同意、走链接的时候。 */
  canRelink: boolean;
  /** 分身的提醒：只在还能选人的时候给，只给这位朋友本人。 */
  suggestions: TwinFindSuggestionV0[];
  connectedAt: string | null;
  /** 只有 `connected`、服务端开着「牵上以后接着约」时才有。 */
  meet?: TwinFindMeetV0 | null;
}

export interface TwinFindIntroViewV0 {
  schemaVersion: typeof TWIN_FIND_SCHEMA_VERSION_V0;
  /** 站内的有；链接页没有。 */
  bridgeId: string | null;
  role: 'candidate';
  status: TwinFindStatusV0;
  topic: TwinFindTopicV0;
  question: string;
  askerName: string;
  bridgeName: string;
  note: string | null;
  endsAt: string;
  myState: TwinFindIntroStateV0;
  myDisplayName: string | null;
  myLine: string | null;
  canConsent: boolean;
  canRevoke: boolean;
  connectedAt: string | null;
}

export const TWIN_FIND_ROLES_V0 = ['asker', 'bridge', 'candidate'] as const;
export type TwinFindRoleV0 = (typeof TWIN_FIND_ROLES_V0)[number];

export interface TwinFindListItemV0 {
  id: string;
  /** 被介绍的人的那一条才有：详情走 `/twin-find/intro/:bridgeId`。 */
  bridgeId: string | null;
  role: TwinFindRoleV0;
  status: TwinFindStatusV0;
  topic: TwinFindTopicV0;
  question: string;
  createdAt: string;
  endsAt: string;
  /** 现在轮到我点：提问的人有人可接，朋友还没作答，被介绍的人还没表态。 */
  needsMe: boolean;
  /** 只有我发起的有：已同意待我点头的几位、已接上的几位。 */
  offers: number | null;
  connected: number | null;
}

/**
 * 列表里别人的找对象问题（我是被问的朋友，或者被介绍的人）：服务端不下发问题原文（`question` 是空串），界面不写话题，
 * 只写 `TWIN_FIND_FIXED_PHRASES_V0.askedQuiet`；点进详情才看得到。自己发起的照常。
 */
export function twinFindListQuietV0(role: TwinFindRoleV0, topic: TwinFindTopicV0): boolean {
  return role !== 'asker' && twinFindIsDatingV0(topic);
}

// ── 「我也在找」 ───────────────────────────────────────────────────────────────

/**
 * 每人一个开关，默认关，只能本人改。只用来决定找对象时平台在不在站内问他；不进任何别人的视图，不进日志和回执。
 * 选了他的那位朋友能从「平台已在站内问他」看出他开着：开关旁边要写明（`TWIN_FIND_DATING_OPEN_NOTICE_V0`）。
 */
export interface TwinFindProfileV0 {
  schemaVersion: typeof TWIN_FIND_SCHEMA_VERSION_V0;
  datingOpen: boolean;
  /**
   * 这个人现在能不能用找对象：总开关、L9 名单、找对象自己的名单都过了。手机按它显示找对象的话题、「我也在找」和条件卡；
   * 不能用的人「我也在找」开着时手机还显示开关，好让他关掉。旧服务端不回这一项，按 `false` 算。
   */
  datingAvailable: boolean;
}

export const TWIN_FIND_DATING_OPEN_NOTICE_V0 = {
  zh: '打开以后，朋友替别人找对象、选中你的时候，平台会直接在站内问你愿不愿意被介绍；选中你的那位朋友也因此知道你开着。别人看不到这个开关。关着的时候，平台不会为找对象的事联系你。',
  en: 'While this is on, when a friend picks you for someone who is looking for a partner, Agentrix asks you directly whether you want to be introduced, and that friend can tell it is on. Nobody else can see this switch. While it is off, Agentrix never contacts you about dating.',
} as const;

export function decodeTwinFindProfilePatchV0(value: unknown, field = 'profile'): TwinFindDecodeResultV0<{ datingOpen: boolean }> {
  const rec = strict(value, field, ['datingOpen'], ['datingOpen']);
  if (rec.ok === false) return rec;
  if (typeof rec.value.datingOpen !== 'boolean') return fail('invalid_type', `${field}.datingOpen`);
  return { ok: true, value: { datingOpen: rec.value.datingOpen } };
}

export type TwinFindStartOutcomeV0 =
  | { started: true; findId: string; routes: { ref: string; route: TwinFindFriendRouteV0 }[] }
  | { started: false; code: TwinFindRefusalCodeV0 };

/** 被介绍的人表态或撤回以后：不同意、撤回以后那一行就不再是他的，没有视图。 */
export interface TwinFindConsentOutcomeV0 {
  view: TwinFindIntroViewV0 | null;
}

/** 选人以后：走链接的带一次链接码（只在这一次回答里出现，服务端只存哈希）。 */
export interface TwinFindPickOutcomeV0 {
  view: TwinFindBridgeViewV0;
  link: { code: string } | null;
}

// ── 平台签的回执 ──────────────────────────────────────────────────────────────

export const TWIN_FIND_INTRO_TYP_V0 = 'agentrix.twin-find-intro.v0' as const;

/** 三方都点头的那一刻签。不带任何 id、名字和原文。 */
export interface TwinFindIntroClaimsV0 {
  schemaVersion: typeof TWIN_FIND_SCHEMA_VERSION_V0;
  topic: TwinFindTopicV0;
  connectedAt: string;
  /** 被介绍的人是在站内登录着同意的。 */
  verified: boolean;
  questionSha256: string;
}

// ── 链接、文案 ────────────────────────────────────────────────────────────────

export const TWIN_FIND_LINK_CODE_PATTERN_V0 = /^[A-Za-z0-9_-]{22}$/;
export const TWIN_FIND_ID_PATTERN_V0 = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const TWIN_FIND_GUEST_PAGE_PATH_V0 = '/find';

/** 链接码放在 `#` 后面：不进服务器日志，也不随 Referer 带出去。 */
export function twinFindGuestLinkV0(origin: string, code: string): string {
  return `${origin.replace(/\/+$/, '')}${TWIN_FIND_GUEST_PAGE_PATH_V0}#${code}`;
}

export const TWIN_FIND_UNVERIFIED_LABEL_V0 = { zh: '未验证', en: 'Unverified' } as const;

/** 站内通知的标题（中文）和正文（英文）。只发站内，不推送到手机。 */
export const TWIN_FIND_FIXED_PHRASES_V0 = {
  asked: { zh: '有朋友想请你帮忙找人', en: 'A friend is asking whether you know someone.' },
  intro: { zh: '有朋友想把你介绍给他的朋友，等你点头', en: 'A friend would like to introduce you to a friend of theirs. It is up to you.' },
  /** 找对象时代替上面两句：不说是找人、介绍人，更不带话题。列表里别人的找对象问题也只写第一句。 */
  askedQuiet: { zh: '有朋友想请你帮个忙', en: 'A friend is asking you for a favour.' },
  introQuiet: { zh: '有朋友想请你帮个忙，等你点头', en: 'A friend is asking you for a favour. It is up to you.' },
  offered: { zh: '你找的人有朋友愿意牵线了', en: 'A friend can introduce you to someone.' },
  connected: { zh: '牵线成了：三方都同意了', en: 'The introduction is on: all three of you agreed.' },
  notNow: { zh: '这次介绍没有继续', en: 'This introduction did not go ahead.' },
  /** 接上以后牵线的朋友看到的一句。平台不交换联系方式。 */
  bridgeNext: { zh: '三方都同意了。接下来请你把他们拉到一起。', en: 'All three of you agreed. Please bring the two of them together.' },
} as const;

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

function isTimeOrNull(value: unknown): value is string | null {
  return value === null || isTime(value);
}

function isCount(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0;
}

function isCountOrNull(value: unknown): value is number | null {
  return value === null || isCount(value);
}

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

function readOffer(value: unknown): TwinFindOfferV0 | null {
  if (!isRecord(value)) return null;
  const { displayName, line, note, verified } = value;
  if (typeof displayName !== 'string' || !isStringOrNull(line) || !isStringOrNull(note) || typeof verified !== 'boolean') return null;
  return { displayName, line, note, verified };
}

function readPerson(value: unknown): TwinFindPersonV0 | null {
  if (!isRecord(value)) return null;
  const { ref, label, state, connectedAt } = value;
  if (typeof ref !== 'string' || typeof label !== 'string' || !isOneOf(TWIN_FIND_PERSON_STATES_V0, state) || !isTimeOrNull(connectedAt)) return null;
  const shows = state === 'offered' || state === 'connected';
  if (value.offer === null || value.offer === undefined) return shows ? null : { ref, label, state, offer: null, connectedAt };
  const offer = readOffer(value.offer);
  // 对方点头之前带了对方的信息：整条不认。
  if (offer === null || !shows) return null;
  return { ref, label, state, offer, connectedAt };
}

function readCommon(value: Record<string, unknown>) {
  const { schemaVersion, status, topic, question, endsAt } = value;
  if (schemaVersion !== TWIN_FIND_SCHEMA_VERSION_V0 || typeof question !== 'string') return null;
  if (!isOneOf(TWIN_FIND_STATUSES_V0, status) || !isOneOf(TWIN_FIND_TOPICS_V0, topic) || !isTime(endsAt)) return null;
  return { schemaVersion, status, topic, question, endsAt };
}

function readAskerView(value: Record<string, unknown>): TwinFindAskerViewV0 | null {
  const common = readCommon(value);
  if (!common) return null;
  const { id, closedReason, createdAt, closedAt } = value;
  if (typeof id !== 'string' || !isTime(createdAt) || !isTimeOrNull(closedAt) || !isOneOfOrNull(TWIN_FIND_CLOSE_REASONS_V0, closedReason)) return null;
  const people = readList(value.people, readPerson);
  if (people === null) return null;
  return { ...common, id, role: 'asker', closedReason, createdAt, closedAt, people };
}

function readSuggestion(value: unknown): TwinFindSuggestionV0 | null {
  if (!isRecord(value) || typeof value.ref !== 'string' || typeof value.label !== 'string') return null;
  return { ref: value.ref, label: value.label };
}

function readPicked(value: unknown): TwinFindPickedV0 | null {
  if (!isRecord(value)) return null;
  const { route, label, note } = value;
  if (!isOneOf(TWIN_FIND_CANDIDATE_ROUTES_V0, route) || typeof label !== 'string' || !isStringOrNull(note)) return null;
  return { route, label, note };
}

function readMeet(value: unknown): TwinFindMeetV0 | null {
  if (!isRecord(value)) return null;
  const { askerRef, candidateRef, candidateLabel } = value;
  if (!isStringOrNull(askerRef) || !isStringOrNull(candidateRef) || !isStringOrNull(candidateLabel)) return null;
  return { askerRef, candidateRef, candidateLabel };
}

function readBridgeView(value: Record<string, unknown>): TwinFindBridgeViewV0 | null {
  const common = readCommon(value);
  if (!common) return null;
  const { id, askerName, createdAt, myState, picksLeft, canPick, canDecline, canWithdraw, canRelink, connectedAt } = value;
  if (typeof id !== 'string' || typeof askerName !== 'string' || !isTime(createdAt) || !isTimeOrNull(connectedAt)) return null;
  if (!isOneOf(TWIN_FIND_BRIDGE_STATES_V0, myState) || !isCount(picksLeft)) return null;
  if (typeof canPick !== 'boolean' || typeof canDecline !== 'boolean' || typeof canWithdraw !== 'boolean' || typeof canRelink !== 'boolean') return null;
  const suggestions = readList(value.suggestions, readSuggestion);
  if (suggestions === null) return null;
  let picked: TwinFindPickedV0 | null = null;
  if (value.picked !== null && value.picked !== undefined) {
    picked = readPicked(value.picked);
    if (picked === null) return null;
  }
  // 没开「接着约」的服务器不带这一项；带了但读不懂，整条不认。
  let meet: TwinFindMeetV0 | null = null;
  if (value.meet !== null && value.meet !== undefined) {
    meet = readMeet(value.meet);
    if (meet === null) return null;
  }
  const view: TwinFindBridgeViewV0 = { ...common, id, role: 'bridge', askerName, createdAt, myState, picked, picksLeft, canPick, canDecline, canWithdraw, canRelink, suggestions, connectedAt };
  return meet === null ? view : { ...view, meet };
}

export function decodeTwinFindViewV0(body: unknown): TwinFindAskerViewV0 | TwinFindBridgeViewV0 | null {
  const value = unwrapData(body, 'role');
  if (!isRecord(value)) return null;
  if (value.role === 'asker') return readAskerView(value);
  if (value.role === 'bridge') return readBridgeView(value);
  return null;
}

function readIntroView(value: unknown): TwinFindIntroViewV0 | null {
  if (!isRecord(value) || value.role !== 'candidate') return null;
  const common = readCommon(value);
  if (!common) return null;
  const { bridgeId, askerName, bridgeName, note, myState, myDisplayName, myLine, canConsent, canRevoke, connectedAt } = value;
  if (!isStringOrNull(bridgeId) || typeof askerName !== 'string' || typeof bridgeName !== 'string' || !isStringOrNull(note)) return null;
  if (!isOneOf(TWIN_FIND_INTRO_STATES_V0, myState) || !isStringOrNull(myDisplayName) || !isStringOrNull(myLine)) return null;
  if (typeof canConsent !== 'boolean' || typeof canRevoke !== 'boolean' || !isTimeOrNull(connectedAt)) return null;
  return { ...common, bridgeId, role: 'candidate', askerName, bridgeName, note, myState, myDisplayName, myLine, canConsent, canRevoke, connectedAt };
}

/** 站内和链接页是同一个形状：链接页的 `bridgeId` 是 null。 */
export function decodeTwinFindIntroViewV0(body: unknown): TwinFindIntroViewV0 | null {
  return readIntroView(unwrapData(body, 'role'));
}

/** 同意、不同意、撤回同意以后的回答：那一行已经不是我的了（不同意、撤回）就是 `{ view: null }`。 */
export function decodeTwinFindConsentOutcomeV0(body: unknown): TwinFindConsentOutcomeV0 | null {
  const value = unwrapData(body, 'view');
  if (!isRecord(value) || value.view === undefined) return null;
  if (value.view === null) return { view: null };
  const view = readIntroView(value.view);
  return view === null ? null : { view };
}

export function decodeTwinFindProfileV0(body: unknown): TwinFindProfileV0 | null {
  const value = unwrapData(body, 'datingOpen');
  if (!isRecord(value) || value.schemaVersion !== TWIN_FIND_SCHEMA_VERSION_V0 || typeof value.datingOpen !== 'boolean') return null;
  return { schemaVersion: TWIN_FIND_SCHEMA_VERSION_V0, datingOpen: value.datingOpen, datingAvailable: value.datingAvailable === true };
}

function readListItem(value: unknown): TwinFindListItemV0 | null {
  if (!isRecord(value)) return null;
  const { id, bridgeId, role, status, topic, question, createdAt, endsAt, needsMe, offers, connected } = value;
  if (typeof id !== 'string' || !isStringOrNull(bridgeId) || !isOneOf(TWIN_FIND_ROLES_V0, role) || typeof question !== 'string') return null;
  if (!isOneOf(TWIN_FIND_STATUSES_V0, status) || !isOneOf(TWIN_FIND_TOPICS_V0, topic) || !isTime(createdAt) || !isTime(endsAt)) return null;
  if (typeof needsMe !== 'boolean' || !isCountOrNull(offers) || !isCountOrNull(connected)) return null;
  if (role === 'candidate' && bridgeId === null) return null;
  return { id, bridgeId, role, status, topic, question, createdAt, endsAt, needsMe, offers, connected };
}

export function decodeTwinFindListV0(body: unknown): TwinFindListItemV0[] | null {
  const value = unwrapData(body, 'items');
  return isRecord(value) ? readList(value.items, readListItem) : null;
}

function readFriendOption(value: unknown): TwinFindFriendOptionV0 | null {
  if (!isRecord(value)) return null;
  const { friendRef, label, tier } = value;
  if (typeof friendRef !== 'string' || typeof label !== 'string' || !isOneOf(AGENT_PASS_TIER_PRESETS_V1, tier)) return null;
  return { friendRef, label, tier };
}

export function decodeTwinFindFriendOptionsV0(body: unknown): TwinFindFriendOptionV0[] | null {
  const value = unwrapData(body, 'friends');
  return isRecord(value) ? readList(value.friends, readFriendOption) : null;
}

function readRoute(value: unknown): { ref: string; route: TwinFindFriendRouteV0 } | null {
  if (!isRecord(value) || typeof value.ref !== 'string' || !isOneOf(TWIN_FIND_FRIEND_ROUTES_V0, value.route)) return null;
  return { ref: value.ref, route: value.route };
}

export function decodeTwinFindStartOutcomeV0(body: unknown): TwinFindStartOutcomeV0 | null {
  const value = unwrapData(body, 'started');
  if (!isRecord(value)) return null;
  if (value.started === false) return isOneOf(TWIN_FIND_REFUSAL_CODES_V0, value.code) ? { started: false, code: value.code } : null;
  if (value.started !== true || typeof value.findId !== 'string' || !TWIN_FIND_ID_PATTERN_V0.test(value.findId)) return null;
  const routes = readList(value.routes, readRoute);
  if (routes === null) return null;
  return { started: true, findId: value.findId, routes };
}

function readLink(value: unknown): { code: string } | null {
  if (!isRecord(value) || typeof value.code !== 'string') return null;
  return TWIN_FIND_LINK_CODE_PATTERN_V0.test(value.code) ? { code: value.code } : null;
}

export function decodeTwinFindPickOutcomeV0(body: unknown): TwinFindPickOutcomeV0 | null {
  const value = unwrapData(body, 'view');
  if (!isRecord(value) || !isRecord(value.view)) return null;
  const view = readBridgeView(value.view);
  if (view === null) return null;
  if (value.link === null || value.link === undefined) return { view, link: null };
  const link = readLink(value.link);
  return link === null ? null : { view, link };
}

export function decodeTwinFindRelinkV0(body: unknown): { code: string } | null {
  return readLink(unwrapData(body, 'code'));
}
