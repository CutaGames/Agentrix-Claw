/**
 * 问遍身边人（twin ask，合同 v0；设计稿 `.agents/tasks/twin-social-net/ask-design.md`）。
 *
 * 发起人选一个话题、写一句问题（120 字以内），一次问 1–20 个人：自己关系簿里的朋友，加上没注册的朋友的链接名额。
 *
 * - 谁来答（`twinAskCanStartV0`）：双方互相定过档、对方开了「可以被朋友问」、有分身的，先由对方的分身答（`twin`）；
 *   双向定过档、但没开或没有分身的，平台在站内请本人回答（`owner`）。不是双向的、任何一方屏蔽了对方的、当天被问满的，
 *   平台不联系对方，只给发起人一条个人链接由发起人自己转（`link`）。同一对人一周最多问 5 次（`pair_weekly_limit`）。
 *   发起人只看到「站内」或「链接」（`twinAskPublicRouteV0`），看不出对方开没开「可以被朋友问」。
 * - 分身怎么答：只从本人写的「可以告诉朋友」条目（`TwinFriendFactV0`）里挑，最多 2 条，原文照发，不改写、不总结、
 *   不补充。三道关：本人开着「可以被朋友问」；代表授权放行（话题 `twin_ask`）；本人给发起人那一档的 Pass 里开了这个话题
 *   （类目 `twinAskPassCategoryV0(topic)` × 目的 `friend_ask`）。哪一道没过、没有合适的条目、模型不可用，都转本人。
 * - 只问本人（`twinAskQuestionIsOwnerOnlyV0`）：话题「其他」，和问题里提到健康、钱、法律、宗教、政治、感情的，分身一律
 *   不答。这些话题也没有 Pass 类目。
 * - 发起人看到的：每个人一行，回答标「分身转述」「本人回答」或「未验证」（链接回答）。没回答和不想回答看起来一样：
 *   进行中都是「还没回答」，结束后都是「没有回答」。
 * - 结束：24 小时到、所有人都回答了、或发起人提前结束。结束时平台签一张回执（`TwinAskReceiptClaimsV0`）；每条回答
 *   也各有一张平台签的凭证（`TwinAskAnswerClaimsV0`）。两种都不带任何 id。90 天后整条删除；回答的人随时可以撤回。
 * - 自由文本只有问题、条目、回复和链接名额的称呼：都不许带联系方式、地址和链接（`twinAskTextViolationsV0`）；
 *   条目还不许提钱（分身会原样转述，分身不谈钱）。问题提到钱不拦，只是只问本人。
 *
 * 开关（后端接线时才读）：服务端 `TWIN_ASK_V0_ENABLED`，只认精确的 `'1'`；网页 `NEXT_PUBLIC_TWIN_ASK_ENABLED`；
 * 手机 `EXPO_PUBLIC_TWIN_ASK`。
 *
 * 第 2 阶段（设计稿 `.agents/tasks/twin-social-net/ask-phase2-design.md`）：
 * - 站内本人回答可以带一段本人手机设备钥匙的签名（`TwinAskDeviceProofV0`）：服务端验过才收，发起人那边「本人回答」
 *   后面多一句「已在本人手机上确认」。分身转述和链接回答不签。开关：服务端 `TWIN_ASK_DEVICE_PROOF_V0_ENABLED`，
 *   手机 `EXPO_PUBLIC_TWIN_ASK_DEVICE_PROOF`，都只认精确的 `'1'`。
 * - 条目多一种来源 `memory`：记忆审核里接受一条记忆时勾了「也可以告诉朋友」，文字是本人在那里确认或改过的一句。
 *
 * 本文件只有常量、类型和纯函数：不读环境变量、不碰数据库、不调模型。
 */
import {
  AGENT_PASS_TIER_PRESETS_V1,
  type AgentPassCategoryV1,
  type AgentPassPurposeV1,
  type AgentPassScopeV1,
  type AgentPassTierPresetV1,
} from './agent-pass';
import { sha256Hex, utf8Encode } from './trust-loop-primitives';
import { twinPrechatTextViolationsV0 } from './twin-prechat';

export const TWIN_ASK_SCHEMA_VERSION_V0 = 'agentrix.twin-ask.v0' as const;
export const TWIN_ASK_FLAG_V0 = 'TWIN_ASK_V0_ENABLED';
export const TWIN_ASK_WEB_FLAG_V0 = 'NEXT_PUBLIC_TWIN_ASK_ENABLED';
export const TWIN_ASK_MOBILE_FLAG_V0 = 'EXPO_PUBLIC_TWIN_ASK';
/** 本人回答在手机上确认（第 2 阶段）：服务端和手机各一个开关，都只认精确的 `'1'`。 */
export const TWIN_ASK_DEVICE_PROOF_FLAG_V0 = 'TWIN_ASK_DEVICE_PROOF_V0_ENABLED';
export const TWIN_ASK_DEVICE_PROOF_MOBILE_FLAG_V0 = 'EXPO_PUBLIC_TWIN_ASK_DEVICE_PROOF';

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

export const TWIN_ASK_LIMITS_V0 = {
  questionMax: 120,
  replyMax: 300,
  factMax: 300,
  guestLabelMax: 20,
  /** 朋友和链接名额合计。 */
  peopleMax: 20,
  /** 每人每天最多发起几次。 */
  asksPerDayMax: 10,
  /** 每人每天最多被问几次：平台默认，也是上限；本人只能调低（`TwinAskProfileV0.dailyCap`）。 */
  perFriendPerDayMax: 10,
  /** 同一个发起人一周最多问同一个人几次。 */
  perPairPerWeekMax: 5,
  /** 分身一次最多转述几条条目。 */
  quotesMax: 2,
  /** 每人最多写几条「可以告诉朋友」，每个话题最多几条。 */
  factsMax: 60,
  factsPerTopicMax: 20,
  openMs: DAY_MS,
  /** 链接比问题多留一小时，给定时任务的延迟。 */
  linkTtlMs: DAY_MS + HOUR_MS,
  retentionMs: 90 * DAY_MS,
} as const;

// ── 话题 ──────────────────────────────────────────────────────────────────────

export const TWIN_ASK_TOPICS_V0 = ['food', 'travel', 'kids_school', 'home', 'work', 'local_services', 'other'] as const;
export type TwinAskTopicV0 = (typeof TWIN_ASK_TOPICS_V0)[number];

/** 分身可以代答的话题：除「其他」以外的六个，各对应一个 Pass 类目（`twinAskPassCategoryV0`）。 */
export const TWIN_ASK_TWIN_TOPICS_V0 = ['food', 'travel', 'kids_school', 'home', 'work', 'local_services'] as const;
export type TwinAskTwinTopicV0 = (typeof TWIN_ASK_TWIN_TOPICS_V0)[number];

export const TWIN_ASK_TOPIC_LABELS_V0: Readonly<Record<TwinAskTopicV0, { zh: string; en: string }>> = {
  food: { zh: '吃喝', en: 'Food and drink' },
  travel: { zh: '出行', en: 'Getting around' },
  kids_school: { zh: '孩子和学校', en: 'Kids and school' },
  home: { zh: '装修和家务', en: 'Home and housework' },
  work: { zh: '工作和行业', en: 'Work and industry' },
  local_services: { zh: '本地服务', en: 'Local services' },
  other: { zh: '其他', en: 'Other' },
};

/** Pass 的目的：只和下面六个类目配对。 */
export const TWIN_ASK_PASS_PURPOSE_V0: Extract<AgentPassPurposeV1, 'friend_ask'> = 'friend_ask';

const PASS_CATEGORIES: Readonly<Record<TwinAskTwinTopicV0, AgentPassCategoryV1>> = {
  food: 'friend_fact_food',
  travel: 'friend_fact_travel',
  kids_school: 'friend_fact_kids_school',
  home: 'friend_fact_home',
  work: 'friend_fact_work',
  local_services: 'friend_fact_local_services',
};

/** 代表授权检查用的话题。授权里列了话题的，要把它加进去才放行。 */
export const TWIN_ASK_MANDATE_TOPIC_V0 = 'twin_ask';

export function isTwinAskTwinTopicV0(topic: unknown): topic is TwinAskTwinTopicV0 {
  return isOneOf(TWIN_ASK_TWIN_TOPICS_V0, topic);
}

export function twinAskPassCategoryV0(topic: TwinAskTwinTopicV0): AgentPassCategoryV1 {
  return PASS_CATEGORIES[topic];
}

// ── 只问本人 ──────────────────────────────────────────────────────────────────

/** 健康、钱、法律、宗教、政治、感情。宁可多拦：拦下只是改成只问本人，问题照样发出去。 */
const SENSITIVE_ZH =
  /病|医|药|诊所|症|疼|痛|孕|心理|抑郁|焦虑|体检|手术|疫苗|钱|贷|债|投资|理财|股票|基金|保险|工资|薪|收入|税|律师|法律|法院|官司|起诉|诉讼|合同|离婚|警察|报警|犯罪|宗教|信仰|教会|教堂|寺|庙|清真|佛|基督|伊斯兰|政治|政府|选举|政党|投票|感情|恋爱|分手|出轨|约会|相亲|婚/;
const SENSITIVE_EN =
  /\b(?:health|ill(?:ness)?|sick|doctors?|hospitals?|clinics?|medic\w*|drugs?|pregnan\w*|therap\w*|depress\w*|anxiety|vaccin\w*|surgery|loans?|debts?|invest\w*|stocks?|insurance|salary|income|tax(?:es)?|lawyers?|legal|lawsuits?|sue|courts?|police|crimes?|divorce|religio\w*|church\w*|temples?|mosques?|faith|politic\w*|elections?|government|votes?|voting|dating|boyfriend|girlfriend|breakup|marriage|affair)\b/i;

/** 话题「其他」、问题里提到上面这些或提到钱的：分身一律不答，只问本人。 */
export function twinAskQuestionIsOwnerOnlyV0(topic: TwinAskTopicV0, question: string): boolean {
  if (!isTwinAskTwinTopicV0(topic)) return true;
  const text = question.normalize('NFKC');
  return SENSITIVE_ZH.test(text) || SENSITIVE_EN.test(text) || twinPrechatTextViolationsV0(text).includes('money');
}

// ── 枚举 ──────────────────────────────────────────────────────────────────────

/**
 * 每位朋友的路线：`twin` 先由分身答；`owner` 平台在站内请本人答；`link` 平台不联系对方，发起人自己转链接；
 * `pair_weekly_limit` 这一周问这个人问满了；`unavailable` 关系没了、指向自己、或和前面的是同一个人。后两种不建行。
 */
export const TWIN_ASK_FRIEND_ROUTES_V0 = ['twin', 'owner', 'link', 'pair_weekly_limit', 'unavailable'] as const;
export type TwinAskFriendRouteV0 = (typeof TWIN_ASK_FRIEND_ROUTES_V0)[number];

/** 发起人看到的路线：站内（分身或本人，不说是哪个）或链接。 */
export const TWIN_ASK_PUBLIC_ROUTES_V0 = ['app', 'link', 'pair_weekly_limit', 'unavailable'] as const;
export type TwinAskPublicRouteV0 = (typeof TWIN_ASK_PUBLIC_ROUTES_V0)[number];

export function twinAskPublicRouteV0(route: TwinAskFriendRouteV0): TwinAskPublicRouteV0 {
  return route === 'twin' || route === 'owner' ? 'app' : route;
}

/** 发不出去的原因。不是错误：表单原样留着。 */
export const TWIN_ASK_REFUSAL_CODES_V0 = ['asker_daily_limit', 'people_count', 'duplicate_friend', 'none_available'] as const;
export type TwinAskRefusalCodeV0 = (typeof TWIN_ASK_REFUSAL_CODES_V0)[number];

export const TWIN_ASK_REASON_CODES_V0 = ['invalid_type', 'invalid_value', 'unknown_field', 'missing_field', 'too_long', 'text_violation'] as const;
export type TwinAskReasonCodeV0 = (typeof TWIN_ASK_REASON_CODES_V0)[number];

export type TwinAskDecodeResultV0<T> = { ok: true; value: T } | { ok: false; reasonCode: TwinAskReasonCodeV0; field: string };

export const TWIN_ASK_STATUSES_V0 = ['open', 'closed'] as const;
export type TwinAskStatusV0 = (typeof TWIN_ASK_STATUSES_V0)[number];

export const TWIN_ASK_CLOSE_REASONS_V0 = ['all_answered', 'asker_closed', 'expired'] as const;
export type TwinAskCloseReasonV0 = (typeof TWIN_ASK_CLOSE_REASONS_V0)[number];

/**
 * 库里每位被问的人一行的状态：`twin_pending` 等分身看；`needs_owner` 等本人在站内答；`waiting_link` 等链接那头；
 * `answered`；`declined` 本人说不想答（对发起人和没回答一样）；`withdrawn` 答过又撤回了（原文已删）。
 */
export const TWIN_ASK_ANSWER_STATES_V0 = ['twin_pending', 'needs_owner', 'waiting_link', 'answered', 'declined', 'withdrawn'] as const;
export type TwinAskAnswerStateV0 = (typeof TWIN_ASK_ANSWER_STATES_V0)[number];

/** 谁答的：分身转述、本人回答、链接回答（未验证）。 */
export const TWIN_ASK_ANSWERED_BY_V0 = ['twin', 'owner', 'guest'] as const;
export type TwinAskAnsweredByV0 = (typeof TWIN_ASK_ANSWERED_BY_V0)[number];

/**
 * 条目从哪来：设置页里写的；回答朋友时勾了「以后这类问题让分身直接用这句」；记忆审核里接受一条记忆时勾了
 * 「也可以告诉朋友」（`memory`：文字是本人在那里确认或改过的一句，不是模型写的原文直接入库）。
 */
export const TWIN_ASK_FACT_SOURCES_V0 = ['settings', 'owner_reply', 'memory'] as const;
export type TwinAskFactSourceV0 = (typeof TWIN_ASK_FACT_SOURCES_V0)[number];

/** 新建条目时客户端可以说的来源；`owner_reply` 只能由回答接口产生。 */
export const TWIN_ASK_FACT_INPUT_SOURCES_V0 = ['settings', 'memory'] as const;
export type TwinAskFactInputSourceV0 = (typeof TWIN_ASK_FACT_INPUT_SOURCES_V0)[number];

// ── 解码 ──────────────────────────────────────────────────────────────────────

type Failure = { ok: false; reasonCode: TwinAskReasonCodeV0; field: string };

const L = TWIN_ASK_LIMITS_V0;
const REF = /^[A-Za-z0-9][A-Za-z0-9:_.-]{0,127}$/;
const GUEST_REF_PREFIX = 'guest:';
// eslint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u001f\u007f]/;
/** 条目和回复可以换行。 */
// eslint-disable-next-line no-control-regex
const CONTROL_EXCEPT_NEWLINE = /[\u0000-\u0009\u000b-\u001f\u007f]/;
const DIGEST = /^[\x21-\x7e]{8,200}$/;

function fail(reasonCode: TwinAskReasonCodeV0, field: string): Failure {
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

function isCountOrNull(value: unknown): value is number | null {
  return value === null || isCount(value);
}

function isStringOrNull(value: unknown): value is string | null {
  return value === null || typeof value === 'string';
}

function strict(value: unknown, field: string, allowed: readonly string[], required: readonly string[]): TwinAskDecodeResultV0<Record<string, unknown>> {
  if (!isRecord(value)) return fail('invalid_type', field);
  for (const key of Object.keys(value)) if (!allowed.includes(key)) return fail('unknown_field', `${field}.${key}`);
  for (const key of required) if (value[key] === undefined) return fail('missing_field', `${field}.${key}`);
  return { ok: true, value };
}

function decodeEnum<T extends string>(list: readonly T[], value: unknown, field: string): TwinAskDecodeResultV0<T> {
  if (typeof value !== 'string') return fail('invalid_type', field);
  return isOneOf(list, value) ? { ok: true, value } : fail('invalid_value', field);
}

function decodeRef(value: unknown, field: string): TwinAskDecodeResultV0<string> {
  if (typeof value !== 'string') return fail('invalid_type', field);
  return REF.test(value) ? { ok: true, value } : fail('invalid_value', field);
}

type TextKind = 'question' | 'label' | 'fact' | 'reply';
const TEXT_MAX: Readonly<Record<TextKind, number>> = { question: L.questionMax, label: L.guestLabelMax, fact: L.factMax, reply: L.replyMax };

/**
 * 「孩子和学校」是话题之一。介绍附言把「两个字以上加学校字样」当成学校名拦（`introductionNeedNoteHasPersonalDataV1`），
 * 中文不分词，「附近哪个幼儿园好？」也会被拦；所以先换掉学校字样再过滤。联系方式、号码、链接、地址和孩子的名字照拦。
 */
const SCHOOL_WORDS = /小学|中学|学校|书院|幼儿园|学院|初中|高中|\b(?:Primary|Secondary|Junior College|Polytechnic|International School|High School|Kindergarten)\b/g;

/** 问题、条目、回复和称呼都按它过滤，客户端可以拿它提前提示。 */
export function twinAskTextViolationsV0(text: string): ReturnType<typeof twinPrechatTextViolationsV0> {
  return twinPrechatTextViolationsV0(text.replace(SCHOOL_WORDS, '·'));
}

/** 联系方式、地址、链接一律不许；`noMoney` 时提钱也不许。长度另算，不用过滤器的上限。 */
function textBlocked(text: string, noMoney: boolean): boolean {
  return twinAskTextViolationsV0(text).some((violation) => violation !== 'too_long' && (noMoney || violation !== 'money'));
}

/** 去掉首尾空白后 1 到上限个字（按码位数）。条目不许提钱。 */
function decodeText(value: unknown, field: string, kind: TextKind): TwinAskDecodeResultV0<string> {
  if (typeof value !== 'string') return fail('invalid_type', field);
  const text = value.trim();
  const control = kind === 'fact' || kind === 'reply' ? CONTROL_EXCEPT_NEWLINE : CONTROL;
  if (text.length === 0 || control.test(text)) return fail('invalid_value', field);
  if (Array.from(text).length > TEXT_MAX[kind]) return fail('too_long', field);
  if (textBlocked(text, kind === 'fact')) return fail('text_violation', field);
  return { ok: true, value: text };
}

function decodeFriendRefs(value: unknown, field: string): TwinAskDecodeResultV0<string[]> {
  if (!Array.isArray(value)) return fail('invalid_type', field);
  if (value.length > L.peopleMax) return fail('invalid_value', field);
  const refs: string[] = [];
  for (let i = 0; i < value.length; i += 1) {
    const ref = decodeRef(value[i], `${field}[${i}]`);
    if (ref.ok === false) return ref;
    if (ref.value.startsWith(GUEST_REF_PREFIX) || refs.includes(ref.value)) return fail('invalid_value', `${field}[${i}]`);
    refs.push(ref.value);
  }
  return { ok: true, value: refs };
}

function decodeGuestLabels(value: unknown, field: string): TwinAskDecodeResultV0<string[]> {
  if (!Array.isArray(value)) return fail('invalid_type', field);
  if (value.length > L.peopleMax) return fail('invalid_value', field);
  const labels: string[] = [];
  for (let i = 0; i < value.length; i += 1) {
    const label = decodeText(value[i], `${field}[${i}]`, 'label');
    if (label.ok === false) return label;
    labels.push(label.value);
  }
  return { ok: true, value: labels };
}

function decodeTopics(value: unknown, field: string): TwinAskDecodeResultV0<TwinAskTwinTopicV0[]> {
  if (!Array.isArray(value)) return fail('invalid_type', field);
  if (value.length > TWIN_ASK_TWIN_TOPICS_V0.length) return fail('invalid_value', field);
  const picked = new Set<TwinAskTwinTopicV0>();
  for (let i = 0; i < value.length; i += 1) {
    const topic = decodeEnum(TWIN_ASK_TWIN_TOPICS_V0, value[i], `${field}[${i}]`);
    if (topic.ok === false) return topic;
    if (picked.has(topic.value)) return fail('invalid_value', `${field}[${i}]`);
    picked.add(topic.value);
  }
  return { ok: true, value: TWIN_ASK_TWIN_TOPICS_V0.filter((topic) => picked.has(topic)) };
}

// ── 发起 ──────────────────────────────────────────────────────────────────────

export interface TwinAskRequestV0 {
  topic: TwinAskTopicV0;
  question: string;
  /** 发起人自己关系簿里的人：`rel:<关系 id>`。 */
  friendRefs: string[];
  /** 没注册的朋友：只填一个称呼，不填联系方式。名额的 ref 是 `guest:<序号>`（`twinAskGuestRefV0`）。 */
  guestLabels?: string[];
}

export function decodeTwinAskRequestV0(value: unknown, field = 'request'): TwinAskDecodeResultV0<TwinAskRequestV0> {
  const rec = strict(value, field, ['topic', 'question', 'friendRefs', 'guestLabels'], ['topic', 'question', 'friendRefs']);
  if (rec.ok === false) return rec;
  const topic = decodeEnum(TWIN_ASK_TOPICS_V0, rec.value.topic, `${field}.topic`);
  if (topic.ok === false) return topic;
  const question = decodeText(rec.value.question, `${field}.question`, 'question');
  if (question.ok === false) return question;
  const friendRefs = decodeFriendRefs(rec.value.friendRefs, `${field}.friendRefs`);
  if (friendRefs.ok === false) return friendRefs;
  let guestLabels: string[] = [];
  if (rec.value.guestLabels !== undefined) {
    const labels = decodeGuestLabels(rec.value.guestLabels, `${field}.guestLabels`);
    if (labels.ok === false) return labels;
    guestLabels = labels.value;
  }
  const people = friendRefs.value.length + guestLabels.length;
  if (people === 0 || people > L.peopleMax) return fail('invalid_value', `${field}.friendRefs`);
  return {
    ok: true,
    value: { topic: topic.value, question: question.value, friendRefs: friendRefs.value, ...(guestLabels.length > 0 ? { guestLabels } : {}) },
  };
}

export function twinAskGuestRefV0(index: number): string {
  return `${GUEST_REF_PREFIX}${index + 1}`;
}

/** 发起时每位朋友的情况（服务端查好再交给 `twinAskCanStartV0`）。 */
export interface TwinAskFriendStateV0 {
  ref: string;
  /** 关系行还在、指向一个人，不是自己，也不是和前面同一个人。 */
  known: boolean;
  /** 对方注册了，而且在当前开放名单里。 */
  inApp: boolean;
  /** 发起人给对方定的档。 */
  tierFromAsker: AgentPassTierPresetV1 | null;
  /** 对方给发起人定的档。 */
  tierToAsker: AgentPassTierPresetV1 | null;
  optedIn: boolean;
  hasTwin: boolean;
  /** 任何一方屏蔽了另一方。 */
  blocked: boolean;
  askedToday: number;
  dailyCap: number | null;
  pairThisWeek: number;
}

export interface TwinAskStartInputV0 {
  askerAskedToday: number;
  friends: readonly TwinAskFriendStateV0[];
  guestCount: number;
  /** `twinAskQuestionIsOwnerOnlyV0` 的结果。 */
  ownerOnly: boolean;
}

export type TwinAskStartResultV0 = { ok: true; routes: { ref: string; route: TwinAskFriendRouteV0 }[] } | { ok: false; code: TwinAskRefusalCodeV0 };

export function twinAskFriendDailyCapV0(dailyCap: number | null): number {
  const max = L.perFriendPerDayMax;
  return dailyCap === null || !Number.isInteger(dailyCap) ? max : Math.max(0, Math.min(max, dailyCap));
}

export function twinAskFriendRouteV0(friend: TwinAskFriendStateV0, ownerOnly: boolean): TwinAskFriendRouteV0 {
  if (!friend.known) return 'unavailable';
  if (friend.inApp && friend.pairThisWeek >= L.perPairPerWeekMax) return 'pair_weekly_limit';
  const mutual = friend.tierFromAsker !== null && friend.tierToAsker !== null;
  if (!friend.inApp || !mutual || friend.blocked || friend.askedToday >= twinAskFriendDailyCapV0(friend.dailyCap)) return 'link';
  return !ownerOnly && friend.optedIn && friend.hasTwin ? 'twin' : 'owner';
}

export function twinAskCanStartV0(input: TwinAskStartInputV0): TwinAskStartResultV0 {
  if (input.askerAskedToday >= L.asksPerDayMax) return { ok: false, code: 'asker_daily_limit' };
  const people = input.friends.length + input.guestCount;
  if (people < 1 || people > L.peopleMax) return { ok: false, code: 'people_count' };
  const refs = new Set<string>();
  for (const friend of input.friends) {
    if (refs.has(friend.ref)) return { ok: false, code: 'duplicate_friend' };
    refs.add(friend.ref);
  }
  const routes = input.friends.map((friend) => ({ ref: friend.ref, route: twinAskFriendRouteV0(friend, input.ownerOnly) }));
  const reachable = routes.some((item) => item.route === 'twin' || item.route === 'owner' || item.route === 'link');
  if (!reachable && input.guestCount === 0) return { ok: false, code: 'none_available' };
  return { ok: true, routes };
}

// ── 分身挑条目 ────────────────────────────────────────────────────────────────

/**
 * 从模型的回答里读出它挑的条目编号（1 起）。只认一对方括号里的编号，例如 `[2]`、`[1, 3]`、`[]`；编号超出范围、
 * 括号里有别的东西、或者读不出来，整个作废（空表，转本人）。重复的去掉，最多 `quotesMax` 个。
 */
export function twinAskPickedNumbersV0(modelText: string, count: number): number[] {
  const match = /\[([^\]]*)\]/.exec(modelText);
  if (!match) return [];
  const picked: number[] = [];
  for (const piece of match[1].split(',')) {
    const token = piece.trim();
    if (token === '') continue;
    if (!/^\d{1,3}$/.test(token)) return [];
    const value = Number(token);
    if (value < 1 || value > count) return [];
    if (!picked.includes(value)) picked.push(value);
  }
  return picked.slice(0, L.quotesMax);
}

// ── 回答 ──────────────────────────────────────────────────────────────────────

/**
 * 本人回答时，本人手机设备钥匙对这条回答的签名（第 2 阶段）。钥匙在手机的安全硬件里，用之前要过指纹或面容；公钥是
 * 这台手机登记设备时交给服务端的。它证明的是「这条回答是在本人登记过的这台手机上、过了指纹或面容之后发的」，
 * 不证明回答的内容是真的。
 */
export interface TwinAskDeviceProofV0 {
  /** 这台手机登记的设备号。 */
  deviceId: string;
  /** 被问的人的视图里的 `deviceNonce`，原样带回；这一行每变一次它就换一个，旧签名不能再用。 */
  nonce: string;
  /** P-256 ECDSA（SHA-256）签名，IEEE P1363（r‖s 共 64 字节），base64url 不带填充。签的是 `twinAskAnswerDeviceMessageV0`。 */
  signature: string;
}

/** 和设备登记用的设备号是同一个格式（`SELF_CERTIFYING_DEVICE_ID_PATTERN_V1`）。 */
export const TWIN_ASK_DEVICE_ID_PATTERN_V0 = /^dev_[0-9a-f]{32}$/;
const DEVICE_NONCE = /^[A-Za-z0-9:.+_-]{8,40}$/;
const DEVICE_SIGNATURE = /^[A-Za-z0-9_-]{86}$/;

export function isTwinAskDeviceNonceV0(value: unknown): value is string {
  return typeof value === 'string' && DEVICE_NONCE.test(value);
}

function decodeDeviceProof(value: unknown, field: string): TwinAskDecodeResultV0<TwinAskDeviceProofV0> {
  const rec = strict(value, field, ['deviceId', 'nonce', 'signature'], ['deviceId', 'nonce', 'signature']);
  if (rec.ok === false) return rec;
  const { deviceId, nonce, signature } = rec.value;
  if (typeof deviceId !== 'string') return fail('invalid_type', `${field}.deviceId`);
  if (!TWIN_ASK_DEVICE_ID_PATTERN_V0.test(deviceId)) return fail('invalid_value', `${field}.deviceId`);
  if (typeof nonce !== 'string') return fail('invalid_type', `${field}.nonce`);
  if (!DEVICE_NONCE.test(nonce)) return fail('invalid_value', `${field}.nonce`);
  if (typeof signature !== 'string') return fail('invalid_type', `${field}.signature`);
  if (!DEVICE_SIGNATURE.test(signature)) return fail('invalid_value', `${field}.signature`);
  return { ok: true, value: { deviceId, nonce, signature } };
}

/** 回答原文的 SHA-256 十六进制：几段用换行连起来再算，和回答凭证里的 `textSha256` 是同一个算法。 */
export function twinAskAnswerTextSha256V0(parts: readonly string[]): string {
  return sha256Hex(utf8Encode(parts.join('\n')));
}

/**
 * 手机设备钥匙签的那段文字：一行一项，顺序固定。问题和回答只放 SHA-256；回答按去掉首尾空白后的文字算（和
 * `decodeTwinAskReplyV0` 收下的一样）。手机和服务端都用这个函数拼，不各写一份。
 */
export function twinAskAnswerDeviceMessageV0(input: { askId: string; question: string; text: string; nonce: string; deviceId: string }): string {
  return [
    'Agentrix twin-ask answer v1',
    `ask: ${input.askId}`,
    `question-sha256: ${twinAskAnswerTextSha256V0([input.question])}`,
    `answer-sha256: ${twinAskAnswerTextSha256V0([input.text.trim()])}`,
    `nonce: ${input.nonce}`,
    `device: ${input.deviceId}`,
  ].join('\n');
}

export interface TwinAskReplyV0 {
  text: string;
  /** 只有站内本人回答可以勾：「以后这类问题让分身直接用这句」，存成一条「可以告诉朋友」。默认不勾。 */
  saveAsFact?: boolean;
  /** 只有站内本人回答、视图里 `canDeviceConfirm` 为真时可以带：这条回答在本人手机上确认过。 */
  deviceProof?: TwinAskDeviceProofV0;
}

/**
 * `allowSave`：站内本人回答；链接回答不能带 `saveAsFact`。要存成条目的回答也不许提钱。
 * `allowDeviceProof`：站内本人回答、服务端开着设备确认时才收 `deviceProof`；这里只看格式，验签在服务端。
 */
export function decodeTwinAskReplyV0(value: unknown, allowSave: boolean, field = 'reply', allowDeviceProof = false): TwinAskDecodeResultV0<TwinAskReplyV0> {
  const allowed = ['text', ...(allowSave ? ['saveAsFact'] : []), ...(allowDeviceProof ? ['deviceProof'] : [])];
  const rec = strict(value, field, allowed, ['text']);
  if (rec.ok === false) return rec;
  const text = decodeText(rec.value.text, `${field}.text`, 'reply');
  if (text.ok === false) return text;
  const reply: TwinAskReplyV0 = { text: text.value };
  const save = rec.value.saveAsFact;
  if (save !== undefined && save !== false) {
    if (typeof save !== 'boolean') return fail('invalid_type', `${field}.saveAsFact`);
    if (Array.from(text.value).length > L.factMax || textBlocked(text.value, true)) return fail('text_violation', `${field}.saveAsFact`);
    reply.saveAsFact = true;
  }
  if (rec.value.deviceProof !== undefined) {
    const proof = decodeDeviceProof(rec.value.deviceProof, `${field}.deviceProof`);
    if (proof.ok === false) return proof;
    reply.deviceProof = proof.value;
  }
  return { ok: true, value: reply };
}

// ── 设置：可以被朋友问 ────────────────────────────────────────────────────────

export interface TwinAskProfileV0 {
  /** 「可以被朋友问」：开了，互相定过档的朋友问到时先由分身答。默认关。 */
  optIn: boolean;
  /** 每天最多被问几次；null 是平台默认（`perFriendPerDayMax`），只能调低。 */
  dailyCap: number | null;
}

export const TWIN_ASK_EMPTY_PROFILE_V0: Readonly<TwinAskProfileV0> = Object.freeze({ optIn: false, dailyCap: null });

export function decodeTwinAskProfilePatchV0(value: unknown, field = 'profile'): TwinAskDecodeResultV0<Partial<TwinAskProfileV0>> {
  const rec = strict(value, field, ['optIn', 'dailyCap'], []);
  if (rec.ok === false) return rec;
  const { optIn, dailyCap } = rec.value;
  if (optIn === undefined && dailyCap === undefined) return fail('missing_field', `${field}.optIn`);
  const patch: Partial<TwinAskProfileV0> = {};
  if (optIn !== undefined) {
    if (typeof optIn !== 'boolean') return fail('invalid_type', `${field}.optIn`);
    patch.optIn = optIn;
  }
  if (dailyCap !== undefined) {
    if (dailyCap === null) {
      patch.dailyCap = null;
    } else {
      if (typeof dailyCap !== 'number') return fail('invalid_type', `${field}.dailyCap`);
      if (!Number.isInteger(dailyCap) || dailyCap < 0 || dailyCap > L.perFriendPerDayMax) return fail('invalid_value', `${field}.dailyCap`);
      patch.dailyCap = dailyCap;
    }
  }
  return { ok: true, value: patch };
}

// ── 设置：可以告诉朋友的条目 ──────────────────────────────────────────────────

export interface TwinFriendFactV0 {
  id: string;
  topic: TwinAskTwinTopicV0;
  text: string;
  source: TwinAskFactSourceV0;
  createdAt: string;
  updatedAt: string;
}

export interface TwinFriendFactInputV0 {
  topic: TwinAskTwinTopicV0;
  text: string;
  /** 只有新建时可以带；不带就是 `settings`。 */
  source?: TwinAskFactInputSourceV0;
}

/**
 * 新建和修改都用它（修改是整条换掉）。话题只能是分身能答的六个。
 * `allowSource`：新建时可以带来源（`TWIN_ASK_FACT_INPUT_SOURCES_V0`）；修改不能改来源。
 */
export function decodeTwinFriendFactInputV0(value: unknown, field = 'fact', allowSource = false): TwinAskDecodeResultV0<TwinFriendFactInputV0> {
  const rec = strict(value, field, allowSource ? ['topic', 'text', 'source'] : ['topic', 'text'], ['topic', 'text']);
  if (rec.ok === false) return rec;
  const topic = decodeEnum(TWIN_ASK_TWIN_TOPICS_V0, rec.value.topic, `${field}.topic`);
  if (topic.ok === false) return topic;
  const text = decodeText(rec.value.text, `${field}.text`, 'fact');
  if (text.ok === false) return text;
  if (rec.value.source === undefined) return { ok: true, value: { topic: topic.value, text: text.value } };
  const source = decodeEnum(TWIN_ASK_FACT_INPUT_SOURCES_V0, rec.value.source, `${field}.source`);
  if (source.ok === false) return source;
  return { ok: true, value: { topic: topic.value, text: text.value, source: source.value } };
}

// ── 设置：每一档朋友能问哪些话题（Pass）────────────────────────────────────────

export interface TwinAskSharingTierV0 {
  tier: AgentPassTierPresetV1;
  /** 这一档的朋友问到这些话题时，分身可以转述条目。 */
  topics: TwinAskTwinTopicV0[];
  /** 这一档的默认 Pass 在用。撤销了、或者还没有分身时为 false，这一档不能开话题。 */
  available: boolean;
}

export interface TwinAskSharingV0 {
  /** 按 `AGENT_PASS_TIER_PRESETS_V1` 的顺序，四档都在。 */
  tiers: TwinAskSharingTierV0[];
}

export interface TwinAskSharingDraftV0 {
  tier: AgentPassTierPresetV1;
  topics: TwinAskTwinTopicV0[];
}

/** 预览的结果：放宽（多开了话题）要带着摘要、并且最近登录过才能提交；收紧直接生效。 */
export interface TwinAskSharingPreviewV0 extends TwinAskSharingDraftV0 {
  expectedVersion: number;
  previewDigest: string;
  requiresStepUp: boolean;
}

export interface TwinAskSharingCommitV0 extends TwinAskSharingDraftV0 {
  expectedVersion: number;
  previewDigest: string;
}

/** 话题按 `TWIN_ASK_TWIN_TOPICS_V0` 的顺序排好。 */
export function decodeTwinAskSharingDraftV0(value: unknown, field = 'sharing'): TwinAskDecodeResultV0<TwinAskSharingDraftV0> {
  const rec = strict(value, field, ['tier', 'topics'], ['tier', 'topics']);
  if (rec.ok === false) return rec;
  return draftOf(rec.value, field);
}

export function decodeTwinAskSharingCommitV0(value: unknown, field = 'sharing'): TwinAskDecodeResultV0<TwinAskSharingCommitV0> {
  const rec = strict(value, field, ['tier', 'topics', 'expectedVersion', 'previewDigest'], ['tier', 'topics', 'expectedVersion', 'previewDigest']);
  if (rec.ok === false) return rec;
  const draft = draftOf(rec.value, field);
  if (draft.ok === false) return draft;
  const { expectedVersion, previewDigest } = rec.value;
  if (typeof expectedVersion !== 'number') return fail('invalid_type', `${field}.expectedVersion`);
  if (!Number.isInteger(expectedVersion) || expectedVersion < 1) return fail('invalid_value', `${field}.expectedVersion`);
  if (typeof previewDigest !== 'string') return fail('invalid_type', `${field}.previewDigest`);
  if (!DIGEST.test(previewDigest)) return fail('invalid_value', `${field}.previewDigest`);
  return { ok: true, value: { ...draft.value, expectedVersion, previewDigest } };
}

function draftOf(rec: Record<string, unknown>, field: string): TwinAskDecodeResultV0<TwinAskSharingDraftV0> {
  const tier = decodeEnum(AGENT_PASS_TIER_PRESETS_V1, rec.tier, `${field}.tier`);
  if (tier.ok === false) return tier;
  const topics = decodeTopics(rec.topics, `${field}.topics`);
  if (topics.ok === false) return topics;
  return { ok: true, value: { tier: tier.value, topics: topics.value } };
}

/** 一张 Pass 里开了哪些话题。 */
export function twinAskSharedTopicsV0(scopes: readonly AgentPassScopeV1[]): TwinAskTwinTopicV0[] {
  return TWIN_ASK_TWIN_TOPICS_V0.filter((topic) =>
    scopes.some((scope) => scope.purpose === TWIN_ASK_PASS_PURPOSE_V0 && scope.category === PASS_CATEGORIES[topic]),
  );
}

/** 换掉一张 Pass 里「问遍身边人」的那几对，别的原样按原顺序留着；新的按话题顺序接在后面。结果是确定的。 */
export function twinAskScopesWithTopicsV0(scopes: readonly AgentPassScopeV1[], topics: readonly TwinAskTwinTopicV0[]): AgentPassScopeV1[] {
  const kept = scopes.filter((scope) => scope.purpose !== TWIN_ASK_PASS_PURPOSE_V0).map((scope) => ({ category: scope.category, purpose: scope.purpose }));
  const added = TWIN_ASK_TWIN_TOPICS_V0.filter((topic) => topics.includes(topic)).map((topic) => ({
    category: PASS_CATEGORIES[topic],
    purpose: TWIN_ASK_PASS_PURPOSE_V0,
  }));
  return [...kept, ...added];
}

// ── 三方看到的 ────────────────────────────────────────────────────────────────

export interface TwinAskFriendOptionV0 {
  friendRef: string;
  label: string;
  tier: AgentPassTierPresetV1;
}

export interface TwinAskPersonV0 {
  ref: string;
  /** 关系簿里的称呼，或链接名额的称呼。 */
  label: string;
  via: 'app' | 'link';
  /** 进行中没回答的（包括不想回答的）是 `waiting`，结束后是 `no_answer`。撤回的也是这两种之一。 */
  state: 'waiting' | 'answered' | 'no_answer';
  answeredBy: TwinAskAnsweredByV0 | null;
  /** 分身转述：1–2 条本人写的原文；本人回答或链接回答：一段。 */
  parts: string[];
  answeredAt: string | null;
  /** 本人回答在本人登记过的手机上确认过（设备钥匙签名，服务端验过）。只有为真时才出现。 */
  deviceConfirmed?: boolean;
}

export interface TwinAskAskerViewV0 {
  schemaVersion: typeof TWIN_ASK_SCHEMA_VERSION_V0;
  id: string;
  role: 'asker';
  status: TwinAskStatusV0;
  closedReason: TwinAskCloseReasonV0 | null;
  topic: TwinAskTopicV0;
  question: string;
  createdAt: string;
  endsAt: string;
  closedAt: string | null;
  people: TwinAskPersonV0[];
  /** 结束后平台签的回执；签不上时为 false，每天补签。 */
  receiptSigned: boolean;
}

/** 被问的人看到的我这一行：分身在看、等我答、答过了、说了不想答、撤回了。 */
export const TWIN_ASK_MY_STATES_V0 = ['twin_pending', 'needs_me', 'answered', 'declined', 'withdrawn'] as const;
export type TwinAskMyStateV0 = (typeof TWIN_ASK_MY_STATES_V0)[number];

export interface TwinAskInvitedViewV0 {
  schemaVersion: typeof TWIN_ASK_SCHEMA_VERSION_V0;
  id: string;
  role: 'invited';
  status: TwinAskStatusV0;
  topic: TwinAskTopicV0;
  question: string;
  askerName: string;
  createdAt: string;
  endsAt: string;
  myState: TwinAskMyStateV0;
  answeredBy: 'twin' | 'owner' | null;
  myParts: string[];
  canAnswer: boolean;
  canDecline: boolean;
  canWithdraw: boolean;
  /** 话题是分身能答的六个之一时，回答可以勾「以后这类问题让分身直接用这句」。 */
  canSaveAsFact: boolean;
  /** 现在回答可以在手机上确认（服务端开着设备确认，而且我能回答）。只有为真时才出现，并且一定带 `deviceNonce`。 */
  canDeviceConfirm?: boolean;
  /** 签名要带的一次性码（`TwinAskDeviceProofV0.nonce`）。 */
  deviceNonce?: string;
  /** 我这条本人回答在手机上确认过。只有为真时才出现。 */
  deviceConfirmed?: boolean;
}

/** 链接那头看到的：不显示别人，不显示发起人以外的任何名字。 */
export interface TwinAskGuestViewV0 {
  schemaVersion: typeof TWIN_ASK_SCHEMA_VERSION_V0;
  status: TwinAskStatusV0;
  askerName: string;
  topic: TwinAskTopicV0;
  question: string;
  endsAt: string;
  myReply: string | null;
  canAnswer: boolean;
  canWithdraw: boolean;
}

export interface TwinAskListItemV0 {
  id: string;
  role: 'asker' | 'invited';
  status: TwinAskStatusV0;
  topic: TwinAskTopicV0;
  question: string;
  createdAt: string;
  endsAt: string;
  /** 发起人：已回答的人数和总人数。被问的人看不到别人的情况，两个都是 null。 */
  answered: number | null;
  people: number | null;
  /** 被问的人：还在等我回答。 */
  needsMe: boolean;
}

export type TwinAskStartOutcomeV0 =
  | { started: true; askId: string; routes: { ref: string; route: TwinAskPublicRouteV0 }[]; links: { ref: string; code: string }[] }
  | { started: false; code: TwinAskRefusalCodeV0 };

// ── 平台签的凭证和回执（都不带 id）────────────────────────────────────────────

export const TWIN_ASK_ANSWER_TYP_V0 = 'agentrix.twin-ask-answer.v0' as const;

export interface TwinAskAnswerClaimsV0 {
  schemaVersion: typeof TWIN_ASK_SCHEMA_VERSION_V0;
  kind: 'answer';
  topic: TwinAskTopicV0;
  answeredBy: TwinAskAnsweredByV0;
  answeredAt: string;
  /** 回答原文（几段用换行连起来）的 SHA-256 十六进制。 */
  textSha256: string;
  /** 本人回答在本人登记过的手机上确认过。只有为真时才出现；设备号和签名不进凭证。 */
  deviceConfirmed?: true;
}

export const TWIN_ASK_RECEIPT_TYP_V0 = 'agentrix.twin-ask-receipt.v0' as const;

export interface TwinAskReceiptClaimsV0 {
  schemaVersion: typeof TWIN_ASK_SCHEMA_VERSION_V0;
  kind: 'receipt';
  topic: TwinAskTopicV0;
  createdAt: string;
  closedAt: string;
  closedReason: TwinAskCloseReasonV0;
  people: number;
  answered: Record<TwinAskAnsweredByV0, number>;
}

// ── 链接、文案 ────────────────────────────────────────────────────────────────

export const TWIN_ASK_LINK_CODE_PATTERN_V0 = /^[A-Za-z0-9_-]{22}$/;
export const TWIN_ASK_ID_PATTERN_V0 = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const TWIN_ASK_GUEST_PAGE_PATH_V0 = '/ask';

/** 链接码放在 `#` 后面：不进服务器日志，也不随 Referer 带出去。 */
export function twinAskGuestLinkV0(origin: string, code: string): string {
  return `${origin.replace(/\/+$/, '')}${TWIN_ASK_GUEST_PAGE_PATH_V0}#${code}`;
}

export const TWIN_ASK_ANSWERED_BY_LABELS_V0: Readonly<Record<TwinAskAnsweredByV0, { zh: string; en: string }>> = {
  twin: { zh: '分身转述', en: 'Relayed by their twin' },
  owner: { zh: '本人回答', en: 'Answered in person' },
  guest: { zh: '未验证', en: 'Unverified' },
};

/** 本人回答在本人手机上确认过时，接在「本人回答」后面。 */
export const TWIN_ASK_DEVICE_CONFIRMED_LABEL_V0 = { zh: '已在本人手机上确认', en: 'Confirmed on their own phone' } as const;

/** 设置页里条目下面的一行小字；设置页里写的不标。 */
export const TWIN_ASK_FACT_SOURCE_LABELS_V0: Readonly<Record<Exclude<TwinAskFactSourceV0, 'settings'>, { zh: string; en: string }>> = {
  owner_reply: { zh: '来自你的一次回答', en: 'From one of your answers' },
  memory: { zh: '来自记忆审核', en: 'From memory review' },
};

/** 站内通知的标题（中文）和正文（英文）。只发站内，不推送到手机。 */
export const TWIN_ASK_FIXED_PHRASES_V0 = {
  asked: { zh: '有朋友问了你一个问题', en: 'A friend asked you a question.' },
  twinAnswered: { zh: '你的分身替你回答了朋友的一个问题，可以去看看或撤回', en: 'Your twin answered a friend’s question for you. You can review or withdraw it.' },
  answered: { zh: '你问的问题有新回答了', en: 'Your question has a new answer.' },
  closed: { zh: '你问的问题结束了，去看看大家的回答', en: 'Your question has closed. See the answers.' },
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

function isCount(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0;
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

/** 时间或 null；别的都算读不出（返回 undefined）。 */
function readOptionalTime(value: unknown): string | null | undefined {
  if (value === null) return null;
  return isTime(value) ? value : undefined;
}

function readPerson(value: unknown): TwinAskPersonV0 | null {
  if (!isRecord(value)) return null;
  const { ref, label, via, state, answeredBy, deviceConfirmed } = value;
  if (typeof ref !== 'string' || typeof label !== 'string') return null;
  if (via !== 'app' && via !== 'link') return null;
  if (state !== 'waiting' && state !== 'answered' && state !== 'no_answer') return null;
  if (!isOneOfOrNull(TWIN_ASK_ANSWERED_BY_V0, answeredBy)) return null;
  const parts = readList(value.parts, readText);
  const answeredAt = readOptionalTime(value.answeredAt);
  if (parts === null || answeredAt === undefined) return null;
  if (deviceConfirmed !== undefined && typeof deviceConfirmed !== 'boolean') return null;
  // 「已在本人手机上确认」只跟着本人回答走：别的回答带了也不认。
  const confirmed = deviceConfirmed === true && state === 'answered' && answeredBy === 'owner';
  return { ref, label, via, state, answeredBy, parts, answeredAt, ...(confirmed ? { deviceConfirmed: true } : {}) };
}

function readCommon(value: Record<string, unknown>) {
  const { schemaVersion, id, status, topic, question, createdAt, endsAt } = value;
  if (schemaVersion !== TWIN_ASK_SCHEMA_VERSION_V0 || typeof id !== 'string' || typeof question !== 'string') return null;
  if (!isOneOf(TWIN_ASK_STATUSES_V0, status) || !isOneOf(TWIN_ASK_TOPICS_V0, topic) || !isTime(createdAt) || !isTime(endsAt)) return null;
  return { schemaVersion, id, status, topic, question, createdAt, endsAt };
}

function readAskerView(value: Record<string, unknown>): TwinAskAskerViewV0 | null {
  const common = readCommon(value);
  if (!common) return null;
  const { closedReason, receiptSigned } = value;
  if (!isOneOfOrNull(TWIN_ASK_CLOSE_REASONS_V0, closedReason)) return null;
  if (typeof receiptSigned !== 'boolean') return null;
  const closedAt = readOptionalTime(value.closedAt);
  const people = readList(value.people, readPerson);
  if (closedAt === undefined || people === null) return null;
  return { ...common, role: 'asker', closedReason, closedAt, people, receiptSigned };
}

function readInvitedView(value: Record<string, unknown>): TwinAskInvitedViewV0 | null {
  const common = readCommon(value);
  if (!common) return null;
  const { askerName, myState, answeredBy, canAnswer, canDecline, canWithdraw, canSaveAsFact, canDeviceConfirm, deviceNonce, deviceConfirmed } = value;
  if (typeof askerName !== 'string' || !isOneOf(TWIN_ASK_MY_STATES_V0, myState)) return null;
  if (!isOneOfOrNull(['twin', 'owner'] as const, answeredBy)) return null;
  if (typeof canAnswer !== 'boolean' || typeof canDecline !== 'boolean' || typeof canWithdraw !== 'boolean' || typeof canSaveAsFact !== 'boolean') {
    return null;
  }
  const myParts = readList(value.myParts, readText);
  if (myParts === null) return null;
  if (canDeviceConfirm !== undefined && typeof canDeviceConfirm !== 'boolean') return null;
  if (deviceConfirmed !== undefined && typeof deviceConfirmed !== 'boolean') return null;
  const nonce = isTwinAskDeviceNonceV0(deviceNonce) ? deviceNonce : null;
  if (deviceNonce !== undefined && nonce === null) return null;
  if (canDeviceConfirm === true && nonce === null) return null;
  const device = {
    ...(canDeviceConfirm === true && canAnswer && nonce !== null ? { canDeviceConfirm: true, deviceNonce: nonce } : {}),
    ...(deviceConfirmed === true && myState === 'answered' && answeredBy === 'owner' ? { deviceConfirmed: true } : {}),
  };
  return { ...common, role: 'invited', askerName, myState, answeredBy, myParts, canAnswer, canDecline, canWithdraw, canSaveAsFact, ...device };
}

export function decodeTwinAskViewV0(body: unknown): TwinAskAskerViewV0 | TwinAskInvitedViewV0 | null {
  const value = unwrapData(body, 'role');
  if (!isRecord(value)) return null;
  if (value.role === 'asker') return readAskerView(value);
  if (value.role === 'invited') return readInvitedView(value);
  return null;
}

function readListItem(value: unknown): TwinAskListItemV0 | null {
  if (!isRecord(value)) return null;
  const { id, role, status, topic, question, createdAt, endsAt, answered, people, needsMe } = value;
  if (typeof id !== 'string' || (role !== 'asker' && role !== 'invited') || typeof question !== 'string' || typeof needsMe !== 'boolean') return null;
  if (!isOneOf(TWIN_ASK_STATUSES_V0, status) || !isOneOf(TWIN_ASK_TOPICS_V0, topic) || !isTime(createdAt) || !isTime(endsAt)) return null;
  if (!isCountOrNull(answered) || !isCountOrNull(people)) return null;
  return { id, role, status, topic, question, createdAt, endsAt, answered, people, needsMe };
}

export function decodeTwinAskListV0(body: unknown): TwinAskListItemV0[] | null {
  const value = unwrapData(body, 'items');
  return isRecord(value) ? readList(value.items, readListItem) : null;
}

export function decodeTwinAskProfileV0(body: unknown): TwinAskProfileV0 | null {
  const value = unwrapData(body, 'optIn');
  if (!isRecord(value)) return null;
  const { optIn, dailyCap } = value;
  if (typeof optIn !== 'boolean') return null;
  if (!isCountOrNull(dailyCap) || (dailyCap !== null && dailyCap > L.perFriendPerDayMax)) return null;
  return { optIn, dailyCap };
}

function readFriendOption(value: unknown): TwinAskFriendOptionV0 | null {
  if (!isRecord(value)) return null;
  const { friendRef, label, tier } = value;
  if (typeof friendRef !== 'string' || typeof label !== 'string' || !isOneOf(AGENT_PASS_TIER_PRESETS_V1, tier)) return null;
  return { friendRef, label, tier };
}

export function decodeTwinAskFriendOptionsV0(body: unknown): TwinAskFriendOptionV0[] | null {
  const value = unwrapData(body, 'friends');
  return isRecord(value) ? readList(value.friends, readFriendOption) : null;
}

function readRoute(value: unknown): { ref: string; route: TwinAskPublicRouteV0 } | null {
  if (!isRecord(value) || typeof value.ref !== 'string' || !isOneOf(TWIN_ASK_PUBLIC_ROUTES_V0, value.route)) return null;
  return { ref: value.ref, route: value.route };
}

function readLink(value: unknown): { ref: string; code: string } | null {
  if (!isRecord(value) || typeof value.ref !== 'string' || typeof value.code !== 'string') return null;
  return TWIN_ASK_LINK_CODE_PATTERN_V0.test(value.code) ? { ref: value.ref, code: value.code } : null;
}

export function decodeTwinAskStartOutcomeV0(body: unknown): TwinAskStartOutcomeV0 | null {
  const value = unwrapData(body, 'started');
  if (!isRecord(value)) return null;
  if (value.started === false) return isOneOf(TWIN_ASK_REFUSAL_CODES_V0, value.code) ? { started: false, code: value.code } : null;
  if (value.started !== true || typeof value.askId !== 'string' || !TWIN_ASK_ID_PATTERN_V0.test(value.askId)) return null;
  const routes = readList(value.routes, readRoute);
  const links = readList(value.links, readLink);
  if (routes === null || links === null) return null;
  return { started: true, askId: value.askId, routes, links };
}

export function decodeTwinAskRelinkV0(body: unknown): { ref: string; code: string } | null {
  return readLink(unwrapData(body, 'code'));
}

export function decodeTwinAskGuestViewV0(body: unknown): TwinAskGuestViewV0 | null {
  const value = unwrapData(body, 'question');
  if (!isRecord(value)) return null;
  const { schemaVersion, status, askerName, topic, question, endsAt, myReply, canAnswer, canWithdraw } = value;
  if (schemaVersion !== TWIN_ASK_SCHEMA_VERSION_V0 || !isOneOf(TWIN_ASK_STATUSES_V0, status) || !isOneOf(TWIN_ASK_TOPICS_V0, topic)) return null;
  if (typeof askerName !== 'string' || typeof question !== 'string' || !isTime(endsAt)) return null;
  if (!isStringOrNull(myReply) || typeof canAnswer !== 'boolean' || typeof canWithdraw !== 'boolean') return null;
  return { schemaVersion, status, askerName, topic, question, endsAt, myReply, canAnswer, canWithdraw };
}

function readFact(value: unknown): TwinFriendFactV0 | null {
  if (!isRecord(value)) return null;
  const { id, topic, text, source, createdAt, updatedAt } = value;
  if (typeof id !== 'string' || !isTwinAskTwinTopicV0(topic) || typeof text !== 'string' || !isOneOf(TWIN_ASK_FACT_SOURCES_V0, source)) return null;
  return isTime(createdAt) && isTime(updatedAt) ? { id, topic, text, source, createdAt, updatedAt } : null;
}

export function decodeTwinFriendFactsV0(body: unknown): TwinFriendFactV0[] | null {
  const value = unwrapData(body, 'facts');
  return isRecord(value) ? readList(value.facts, readFact) : null;
}

export function decodeTwinFriendFactV0(body: unknown): TwinFriendFactV0 | null {
  const value = unwrapData(body, 'fact');
  return isRecord(value) ? readFact(value.fact) : null;
}

function readSharingTier(value: unknown): TwinAskSharingTierV0 | null {
  if (!isRecord(value) || !isOneOf(AGENT_PASS_TIER_PRESETS_V1, value.tier) || typeof value.available !== 'boolean') return null;
  const topics = readList(value.topics, (item) => (isTwinAskTwinTopicV0(item) ? item : null));
  return topics === null ? null : { tier: value.tier, topics, available: value.available };
}

export function decodeTwinAskSharingV0(body: unknown): TwinAskSharingV0 | null {
  const value = unwrapData(body, 'tiers');
  if (!isRecord(value)) return null;
  const tiers = readList(value.tiers, readSharingTier);
  return tiers === null ? null : { tiers };
}

export function decodeTwinAskSharingPreviewV0(body: unknown): TwinAskSharingPreviewV0 | null {
  const value = unwrapData(body, 'previewDigest');
  if (!isRecord(value)) return null;
  const { tier, expectedVersion, previewDigest, requiresStepUp } = value;
  if (!isOneOf(AGENT_PASS_TIER_PRESETS_V1, tier) || !isCount(expectedVersion) || expectedVersion < 1) return null;
  if (typeof previewDigest !== 'string' || !DIGEST.test(previewDigest) || typeof requiresStepUp !== 'boolean') return null;
  const topics = readList(value.topics, (item) => (isTwinAskTwinTopicV0(item) ? item : null));
  return topics === null ? null : { tier, topics, expectedVersion, previewDigest, requiresStepUp };
}
