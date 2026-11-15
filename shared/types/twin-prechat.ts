/**
 * 两个分身先聊一轮（S7 第 1 批，合同 v0；规则稿 `.rebuild-board/gtm/s7-twin-prechat-rules-v0.md`）。
 *
 * 客户在先问客户流程里同意了转介（`c_consented`）以后，A 的分身拿着客户同意过的需求卡，先和 B 的分身对一轮：B 做不做这类、
 * 时间窗里哪些空档、B 名片上写过的条件。两边分身只说本人确认过的原话、本人公开的空档和固定句：不推断、不承诺、
 * 不谈钱、不给联系方式。结果放进 A 的批准卡和 B 的接收页；两位本人的确认就是转介现有的批准（`a_approved`）和
 * 接受（`active`），转介状态机不改。A 批准之前，B 本人看不到这一轮。
 *
 * - 顺序：`ask`（发起方：需求卡加问题）→ `answer`（应答方，可以带最多 2 个回问的需求卡字段）→ 有回问时
 *   `clarify_answer`（发起方，只照需求卡答）→ 最终 `answer`（不再回问）→ `close`（服务端）。最多 6 条、10 分钟。
 * - 每条消息发出前查说话一方的代表权限：`twinPrechatMandateRequestV0` 生成请求，交给 `evaluateRepresentationMandateV1`
 *   （`representation-mandate.ts`）。对方只看到 `needs_owner`，拒绝原因只进本人的复核。
 * - 自由文本只有两处：本人确认过的原话（`owner_confirmed` 的 `text`）和需求卡的一句话，两处都要过
 *   `twinPrechatTextViolationsV0`。没过的那条由服务端整条换成 `needs_owner`，所以存下来的消息里没有违规文本，
 *   解码也一律拒。
 * - 回执（`TwinPrechatReceiptClaimsV0`）只有哈希、版本、种类和计数，不放需求卡，不放联系方式；多一个字段就拒。
 * - 保留：全文跟着转介保留 90 天。
 *
 * 开关（第 2 批起才读）：服务端 `TWIN_PRECHAT_V0_ENABLED`，只认精确的 `'1'`；网页 `NEXT_PUBLIC_TWIN_PRECHAT_ENABLED`。
 * 本文件只有常量、类型和纯函数：不读环境变量、不碰数据库、不调模型。
 */
import {
  INTRODUCTION_CONSENT_VERSION_TWIN_PRECHAT_V1,
  INTRODUCTION_NEED_CATEGORIES_V1,
  INTRODUCTION_NEED_REGIONS_V1,
  decodeIntroductionNeedCardV1,
  introductionNeedNoteHasPersonalDataV1,
  introductionNeedNoteMentionsMoneyV1,
  type IntroductionAnyStatusV1,
  type IntroductionFlowV1,
  type IntroductionNeedCardV1,
  type IntroductionNeedCategoryV1,
  type IntroductionNeedRegionV1,
  type IntroductionNeedWindowV1,
} from './introduction';
import type { RepresentationDenialReasonV1, RepresentationMandateCheckRequestV1 } from './representation-mandate';

export const TWIN_PRECHAT_SCHEMA_VERSION_V0 = 'agentrix.twin-prechat.v0' as const;
export const TWIN_PRECHAT_FLAG_V0 = 'TWIN_PRECHAT_V0_ENABLED';
export const TWIN_PRECHAT_WEB_FLAG_V0 = 'NEXT_PUBLIC_TWIN_PRECHAT_ENABLED';

export const TWIN_PRECHAT_LIMITS_V0 = {
  /** 一轮的消息总数，含服务端的 `close`。 */
  messagesMax: 6,
  /** 一条本人原话的字符上限。 */
  textMax: 300,
  /** 从这一轮建起算，到时由服务端收尾。 */
  windowMs: 10 * 60 * 1000,
  clarifyMax: 2,
  slotsMax: 3,
  slotMinMs: 15 * 60 * 1000,
  slotMaxMs: 4 * 60 * 60 * 1000,
  conditionsMax: 3,
  perInitiatorPerDay: 20,
  /** 应答方每天被对的上限；本人只能调低。 */
  perResponderPerDayMax: 30,
  perPairPerWeek: 5,
  retentionDays: 90,
} as const;

export const TWIN_PRECHAT_QUESTION_KINDS_V0 = ['fit', 'slots', 'condition'] as const;
export type TwinPrechatQuestionKindV0 = (typeof TWIN_PRECHAT_QUESTION_KINDS_V0)[number];

export const TWIN_PRECHAT_CLARIFY_FIELDS_V0 = ['category', 'region', 'window', 'note'] as const;
export type TwinPrechatClarifyFieldV0 = (typeof TWIN_PRECHAT_CLARIFY_FIELDS_V0)[number];

/** 每一句的依据。v0 没有「推断」。 */
export const TWIN_PRECHAT_BASES_V0 = ['owner_confirmed', 'published_slots', 'need_card', 'needs_owner'] as const;
export type TwinPrechatBasisV0 = (typeof TWIN_PRECHAT_BASES_V0)[number];

export const TWIN_PRECHAT_VERDICTS_V0 = ['yes', 'no'] as const;
export type TwinPrechatVerdictV0 = (typeof TWIN_PRECHAT_VERDICTS_V0)[number];

export const TWIN_PRECHAT_OUTCOMES_V0 = ['fit', 'not_fit', 'needs_owner', 'incomplete'] as const;
export type TwinPrechatOutcomeV0 = (typeof TWIN_PRECHAT_OUTCOMES_V0)[number];

/** 被过滤的那条只换成 `needs_owner`，不结束这一轮，所以这里没有「被过滤」。 */
export const TWIN_PRECHAT_CLOSE_REASONS_V0 = ['done', 'timeout', 'message_cap', 'mandate_denied', 'opted_out', 'blocked', 'withdrawn'] as const;
export type TwinPrechatCloseReasonV0 = (typeof TWIN_PRECHAT_CLOSE_REASONS_V0)[number];

/** 按 `twinPrechatCanStartV0` 的判断顺序排：先查发起方自己和两人之间的条件，最后才查应答方自己的设置。 */
export const TWIN_PRECHAT_REFUSAL_CODES_V0 = [
  'flow_not_customer_first',
  'status_not_consented',
  'consent_predates_prechat',
  'initiator_not_in_cohort',
  'initiator_not_opted_in',
  'need_card_filtered',
  'initiator_daily_limit',
  'responder_not_in_peer_list',
  'responder_not_agreed',
  'regulated_mismatch',
  'already_ran',
  'pair_weekly_limit',
  'responder_not_in_cohort',
  'responder_has_no_twin',
  'responder_not_opted_in',
  'blocked',
  'responder_daily_limit',
] as const;
export type TwinPrechatRefusalCodeV0 = (typeof TWIN_PRECHAT_REFUSAL_CODES_V0)[number];

/** 应答方自己的设置。发起方看不到是哪一条（包括有没有被对方屏蔽），只看到 `responder_unavailable`。 */
export const TWIN_PRECHAT_RESPONDER_PRIVATE_REFUSALS_V0 = ['responder_not_in_cohort', 'responder_has_no_twin', 'responder_not_opted_in', 'blocked', 'responder_daily_limit'] as const;
export type TwinPrechatInitiatorRefusalV0 = Exclude<TwinPrechatRefusalCodeV0, (typeof TWIN_PRECHAT_RESPONDER_PRIVATE_REFUSALS_V0)[number]> | 'responder_unavailable';

export const TWIN_PRECHAT_VIOLATIONS_V0 = ['money', 'contact', 'address', 'link', 'too_long'] as const;
export type TwinPrechatViolationV0 = (typeof TWIN_PRECHAT_VIOLATIONS_V0)[number];

export const TWIN_PRECHAT_REASON_CODES_V0 = ['invalid_type', 'invalid_value', 'unknown_field', 'missing_field', 'too_long', 'text_violation'] as const;
export type TwinPrechatReasonCodeV0 = (typeof TWIN_PRECHAT_REASON_CODES_V0)[number];

export type TwinPrechatDecodeResultV0<T> = { ok: true; value: T } | { ok: false; reasonCode: TwinPrechatReasonCodeV0; field: string };

// ── 消息 ─────────────────────────────────────────────────────────────────────────────────

export interface TwinPrechatSlotV0 {
  /** `toISOString()` 形式。 */
  startAt: string;
  endAt: string;
}

export interface TwinPrechatQuestionV0 {
  kind: TwinPrechatQuestionKindV0;
  /** 只有 `condition` 带：B 名片上那条本人确认过的条件的 id。 */
  conditionRef?: string;
}

export interface TwinPrechatFitAnswerV0 {
  question: 'fit';
  basis: 'owner_confirmed';
  facetRef: string;
  text: string;
  verdict: TwinPrechatVerdictV0;
}

export interface TwinPrechatConditionAnswerV0 {
  question: 'condition';
  conditionRef: string;
  basis: 'owner_confirmed';
  facetRef: string;
  text: string;
}

export interface TwinPrechatSlotsAnswerV0 {
  question: 'slots';
  basis: 'published_slots';
  slots: TwinPrechatSlotV0[];
}

/** 要问本人：不带任何内容，显示固定句。 */
export interface TwinPrechatNeedsOwnerAnswerV0 {
  question: TwinPrechatQuestionKindV0;
  conditionRef?: string;
  basis: 'needs_owner';
}

export type TwinPrechatAnswerV0 = TwinPrechatFitAnswerV0 | TwinPrechatConditionAnswerV0 | TwinPrechatSlotsAnswerV0 | TwinPrechatNeedsOwnerAnswerV0;

export type TwinPrechatClarifyAnswerV0 =
  | { field: TwinPrechatClarifyFieldV0; basis: 'need_card'; value: string }
  | { field: TwinPrechatClarifyFieldV0; basis: 'needs_owner' };

export interface TwinPrechatAskMessageV0 {
  seq: 1;
  side: 'initiator';
  kind: 'ask';
  needCard: IntroductionNeedCardV1;
  questions: TwinPrechatQuestionV0[];
}

export interface TwinPrechatAnswerMessageV0 {
  seq: number;
  side: 'responder';
  kind: 'answer';
  answers: TwinPrechatAnswerV0[];
  /** 只有第一条 `answer` 能带。 */
  clarify?: TwinPrechatClarifyFieldV0[];
}

export interface TwinPrechatClarifyAnswerMessageV0 {
  seq: number;
  side: 'initiator';
  kind: 'clarify_answer';
  answers: TwinPrechatClarifyAnswerV0[];
}

export interface TwinPrechatCloseMessageV0 {
  seq: number;
  side: 'server';
  kind: 'close';
  reason: TwinPrechatCloseReasonV0;
}

export type TwinPrechatMessageV0 = TwinPrechatAskMessageV0 | TwinPrechatAnswerMessageV0 | TwinPrechatClarifyAnswerMessageV0 | TwinPrechatCloseMessageV0;

// ── 过滤 ─────────────────────────────────────────────────────────────────────────────────

const MONEY_WORDS_ZH = /租金|房租|月租|租价|价格|价钱|报价|开价|预算|押金|定金|订金|首付|折扣|优惠|砍价|议价|讲价|多少钱|费用|收费|中介费|免佣/;
/** 不拦光秃秃的 rent / rental：租房是房产圈的本行，租金数字由下面的金额规则拦。 */
const MONEY_WORDS_EN = /\b(?:prices?|pricing|priced|deposits?|budgets?|discounts?|fees?|costs?|rebates?|psf|how\s+much|asking)\b/i;
const MONEY_AMOUNTS: readonly RegExp[] = [
  /(?:S\$|SGD|US\$|USD|HK\$|RMB|CNY|\$|¥|￥|€|£)\s?\d/i,
  /\d[\d,.]*\s?(?:元|块|万|千|k\b|sgd\b|dollars?\b|bucks\b)/i,
  /\d[\d,.]*\s*(?:\/\s*(?:mo|mth|month)\b|\/\s*月|per\s+month|a\s+month|每月)/i,
  /[一二两三四五六七八九十百千]+\s?(?:元|块|万)/,
];
const CONTACT: readonly RegExp[] = [
  /\b(?:whats\s?app|wa\.me|telegram|t\.me|wechat|weixin|line\s?id|signal|viber|skype)\b/i,
  /\bvx\b/i,
  /微信|威信|薇信|加我|私聊|私信|电话|手机|联系方式|联系我|打给我/,
  /(?:^|[^\w@.])@[A-Za-z0-9_.]{2,}/,
  /(?:\d\s*){8,}/,
  /[零〇一二两三四五六七八九]{8,}/,
];
const ADDRESS: readonly RegExp[] = [
  /\b(?:blk|block)\s*\d+[a-z]?\b/i,
  /#\s?\d{1,3}\s?-\s?\d{1,5}\b/,
  /(?:^|\D)\d{6}(?:\D|$)/,
  /\d+\s*(?:座|号楼|栋)/,
];
const LINK: readonly RegExp[] = [
  /\b[a-z][a-z0-9+.-]*:\/\/\S+/i,
  /\bwww\.\S+/i,
  /\b[a-z0-9-]+(?:\.[a-z0-9-]+)*\.(?:com|net|org|sg|io|co|me|ly|app|link|info|biz|xyz|cn|hk|my)\b/i,
];
const INVISIBLE = /[\u00ad\u200b-\u200f\u202a-\u202e\u2060-\u2064\ufeff]/g;

/**
 * 一段要发给对方分身的文字里有哪些不许出现的东西；空表示通过。尽力而为，误拦比漏拦好：被拦的那条只是换成
 * `needs_owner`。提钱对所有账户都拦（规则第 4 条），不只持牌账户。全角、上标字符先折成普通字符，零宽和方向控制字符
 * 先去掉再查；只用于检查，不改原文。
 */
export function twinPrechatTextViolationsV0(raw: string): TwinPrechatViolationV0[] {
  const text = raw.normalize('NFKC').replace(INVISIBLE, '');
  const out: TwinPrechatViolationV0[] = [];
  if (introductionNeedNoteMentionsMoneyV1(text) || MONEY_WORDS_ZH.test(text) || MONEY_WORDS_EN.test(text) || MONEY_AMOUNTS.some((p) => p.test(text))) {
    out.push('money');
  }
  if (introductionNeedNoteHasPersonalDataV1(text) || CONTACT.some((p) => p.test(text))) out.push('contact');
  if (ADDRESS.some((p) => p.test(text))) out.push('address');
  if (LINK.some((p) => p.test(text))) out.push('link');
  if (Array.from(raw).length > TWIN_PRECHAT_LIMITS_V0.textMax) out.push('too_long');
  return out;
}

/** 固定句：分身自己说的话只有这些，其余都是本人原话或结构化的空档。每一句都得能过 `twinPrechatTextViolationsV0`。 */
export const TWIN_PRECHAT_FIXED_PHRASES_V0 = {
  askFit: { zh: '这类需求您那边做不做？', en: 'Do you take this kind of request?' },
  askSlots: { zh: '时间窗里哪些时间可以？', en: 'Which times in this window work?' },
  askCondition: { zh: '这一条您的名片上怎么写的？', en: 'What does your card say about this?' },
  slotsIntro: { zh: '可以约的时间（本人公开的空档）：', en: 'Open times (from the owner’s published slots):' },
  needsOwner: { zh: '这个要问本人。', en: 'This one needs the owner.' },
  closeDone: { zh: '对完了，交给两位本人确认。', en: 'Done. Over to both owners to confirm.' },
  closeOther: { zh: '这一轮先停在这里，交给两位本人。', en: 'Stopping here. Over to both owners.' },
} as const;

export const TWIN_PRECHAT_BASIS_LABELS_V0: Readonly<Record<TwinPrechatBasisV0, { zh: string; en: string }>> = {
  owner_confirmed: { zh: '本人确认', en: 'Confirmed by the owner' },
  published_slots: { zh: '公开空档', en: 'Published slots' },
  need_card: { zh: '需求卡', en: 'Need card' },
  needs_owner: { zh: '要问本人', en: 'Needs the owner' },
};

export function twinPrechatBasisLabelV0(basis: TwinPrechatBasisV0): { zh: string; en: string } {
  return TWIN_PRECHAT_BASIS_LABELS_V0[basis];
}

/** 分身永远署名「某某的分身（AI）」；没有「我就是某某」的写法。 */
export function twinPrechatSpeakerLabelV0(name: string): { zh: string; en: string } {
  const clean = name.trim() || '?';
  return { zh: `${clean} 的分身（AI）`, en: `${clean}'s twin (AI)` };
}

/** 看的人自己的分身：一样署「AI」，不写成「我」。页面上拿不到本人名字的地方用它。 */
export function twinPrechatOwnSpeakerLabelV0(): { zh: string; en: string } {
  return { zh: '你的分身（AI）', en: 'Your twin (AI)' };
}

// ── 解码 ─────────────────────────────────────────────────────────────────────────────────

type Failure = { ok: false; reasonCode: TwinPrechatReasonCodeV0; field: string };

const L = TWIN_PRECHAT_LIMITS_V0;
const CONTROL = /[\u0000-\u001f\u007f]/;
const REF = /^[A-Za-z0-9][A-Za-z0-9:_.-]{0,127}$/;
const HEX64 = /^[0-9a-f]{64}$/;
const SIDE_OF_KIND: Readonly<Record<string, string>> = { ask: 'initiator', answer: 'responder', clarify_answer: 'initiator', close: 'server' };
const KEYS_OF_KIND: Readonly<Record<string, readonly string[]>> = {
  ask: ['seq', 'side', 'kind', 'needCard', 'questions'],
  answer: ['seq', 'side', 'kind', 'answers', 'clarify'],
  clarify_answer: ['seq', 'side', 'kind', 'answers'],
  close: ['seq', 'side', 'kind', 'reason'],
};

function fail(reasonCode: TwinPrechatReasonCodeV0, field: string): Failure {
  return { ok: false, reasonCode, field };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function isOneOf<T extends string>(list: readonly T[], value: unknown): value is T {
  return typeof value === 'string' && (list as readonly string[]).includes(value);
}

function strict(value: unknown, field: string, allowed: readonly string[], required: readonly string[]): TwinPrechatDecodeResultV0<Record<string, unknown>> {
  if (!isRecord(value)) return fail('invalid_type', field);
  for (const key of Object.keys(value)) if (!allowed.includes(key)) return fail('unknown_field', `${field}.${key}`);
  for (const key of required) if (value[key] === undefined) return fail('missing_field', `${field}.${key}`);
  return { ok: true, value };
}

function decodeRef(value: unknown, field: string): TwinPrechatDecodeResultV0<string> {
  if (typeof value !== 'string') return fail('invalid_type', field);
  return REF.test(value) ? { ok: true, value } : fail('invalid_value', field);
}

function decodeText(value: unknown, field: string): TwinPrechatDecodeResultV0<string> {
  if (typeof value !== 'string') return fail('invalid_type', field);
  const text = value.trim();
  if (text.length === 0 || CONTROL.test(text)) return fail('invalid_value', field);
  if (Array.from(text).length > L.textMax) return fail('too_long', field);
  if (twinPrechatTextViolationsV0(text).length > 0) return fail('text_violation', field);
  return { ok: true, value: text };
}

function decodeIso(value: unknown, field: string): TwinPrechatDecodeResultV0<string> {
  if (typeof value !== 'string') return fail('invalid_type', field);
  const ms = value.length <= 40 ? Date.parse(value) : NaN;
  return Number.isFinite(ms) ? { ok: true, value: new Date(ms).toISOString() } : fail('invalid_value', field);
}

function decodeSlots(value: unknown, field: string): TwinPrechatDecodeResultV0<TwinPrechatSlotV0[]> {
  if (!Array.isArray(value)) return fail('invalid_type', field);
  if (value.length === 0 || value.length > L.slotsMax) return fail('invalid_value', field);
  const slots: TwinPrechatSlotV0[] = [];
  for (let i = 0; i < value.length; i += 1) {
    const f = `${field}[${i}]`;
    const rec = strict(value[i], f, ['startAt', 'endAt'], ['startAt', 'endAt']);
    if (rec.ok === false) return rec;
    const startAt = decodeIso(rec.value.startAt, `${f}.startAt`);
    if (startAt.ok === false) return startAt;
    const endAt = decodeIso(rec.value.endAt, `${f}.endAt`);
    if (endAt.ok === false) return endAt;
    if (Date.parse(endAt.value) <= Date.parse(startAt.value)) return fail('invalid_value', f);
    slots.push({ startAt: startAt.value, endAt: endAt.value });
  }
  return { ok: true, value: slots };
}

/** 需求卡照转介的规则解码，再加一道这里的过滤（转介只对持牌账户拦提钱，这里对所有人拦）。 */
function decodeNeedCard(value: unknown, field: string): TwinPrechatDecodeResultV0<IntroductionNeedCardV1> {
  const card = decodeIntroductionNeedCardV1(value, field);
  if (card.ok === false) {
    if (card.reasonCode === 'need_note_too_long') return fail('too_long', card.field);
    if (card.reasonCode === 'need_note_personal') return fail('text_violation', card.field);
    return fail(isOneOf(TWIN_PRECHAT_REASON_CODES_V0, card.reasonCode) ? card.reasonCode : 'invalid_value', card.field);
  }
  if (twinPrechatTextViolationsV0(card.value.note).length > 0) return fail('text_violation', `${field}.note`);
  return { ok: true, value: card.value };
}

function decodeQuestions(value: unknown, field: string): TwinPrechatDecodeResultV0<TwinPrechatQuestionV0[]> {
  if (!Array.isArray(value)) return fail('invalid_type', field);
  if (value.length === 0 || value.length > 2 + L.conditionsMax) return fail('invalid_value', field);
  const questions: TwinPrechatQuestionV0[] = [];
  const seen: string[] = [];
  for (let i = 0; i < value.length; i += 1) {
    const f = `${field}[${i}]`;
    const rec = strict(value[i], f, ['kind', 'conditionRef'], ['kind']);
    if (rec.ok === false) return rec;
    const kind = rec.value.kind;
    if (typeof kind !== 'string') return fail('invalid_type', `${f}.kind`);
    if (!isOneOf(TWIN_PRECHAT_QUESTION_KINDS_V0, kind)) return fail('invalid_value', `${f}.kind`);
    if (kind === 'condition') {
      if (rec.value.conditionRef === undefined) return fail('missing_field', `${f}.conditionRef`);
      const ref = decodeRef(rec.value.conditionRef, `${f}.conditionRef`);
      if (ref.ok === false) return ref;
      questions.push({ kind, conditionRef: ref.value });
    } else {
      if (rec.value.conditionRef !== undefined) return fail('unknown_field', `${f}.conditionRef`);
      questions.push({ kind });
    }
    const key = questionKey(questions[questions.length - 1]);
    if (seen.includes(key)) return fail('invalid_value', f);
    seen.push(key);
  }
  if (!seen.includes('fit')) return fail('invalid_value', field);
  return { ok: true, value: questions };
}

const ANSWER_CONTENT_KEYS = ['facetRef', 'text', 'verdict', 'slots'] as const;

function decodeAnswer(value: unknown, field: string): TwinPrechatDecodeResultV0<TwinPrechatAnswerV0> {
  const rec = strict(value, field, ['question', 'basis', 'conditionRef', ...ANSWER_CONTENT_KEYS], ['question', 'basis']);
  if (rec.ok === false) return rec;
  const v = rec.value;
  const question = v.question;
  if (typeof question !== 'string') return fail('invalid_type', `${field}.question`);
  if (!isOneOf(TWIN_PRECHAT_QUESTION_KINDS_V0, question)) return fail('invalid_value', `${field}.question`);
  const basis = v.basis;
  if (typeof basis !== 'string') return fail('invalid_type', `${field}.basis`);
  if (!isOneOf(TWIN_PRECHAT_BASES_V0, basis) || basis === 'need_card') return fail('invalid_value', `${field}.basis`);
  let conditionRef: string | undefined;
  if (question === 'condition') {
    if (v.conditionRef === undefined) return fail('missing_field', `${field}.conditionRef`);
    const ref = decodeRef(v.conditionRef, `${field}.conditionRef`);
    if (ref.ok === false) return ref;
    conditionRef = ref.value;
  } else if (v.conditionRef !== undefined) {
    return fail('unknown_field', `${field}.conditionRef`);
  }
  const allowed: readonly string[] =
    basis === 'published_slots' ? ['slots'] : basis === 'owner_confirmed' ? (question === 'fit' ? ['facetRef', 'text', 'verdict'] : ['facetRef', 'text']) : [];
  for (const key of ANSWER_CONTENT_KEYS) {
    if (!allowed.includes(key) && v[key] !== undefined) return fail('unknown_field', `${field}.${key}`);
    if (allowed.includes(key) && v[key] === undefined) return fail('missing_field', `${field}.${key}`);
  }

  if (basis === 'needs_owner') {
    return { ok: true, value: conditionRef === undefined ? { question, basis } : { question, conditionRef, basis } };
  }
  if (basis === 'published_slots') {
    if (question !== 'slots') return fail('invalid_value', `${field}.basis`);
    const slots = decodeSlots(v.slots, `${field}.slots`);
    if (slots.ok === false) return slots;
    return { ok: true, value: { question, basis, slots: slots.value } };
  }
  if (question === 'slots') return fail('invalid_value', `${field}.basis`);
  const facetRef = decodeRef(v.facetRef, `${field}.facetRef`);
  if (facetRef.ok === false) return facetRef;
  const text = decodeText(v.text, `${field}.text`);
  if (text.ok === false) return text;
  if (question === 'condition') {
    return { ok: true, value: { question, conditionRef: conditionRef ?? '', basis, facetRef: facetRef.value, text: text.value } };
  }
  const verdict = v.verdict;
  if (typeof verdict !== 'string') return fail('invalid_type', `${field}.verdict`);
  if (!isOneOf(TWIN_PRECHAT_VERDICTS_V0, verdict)) return fail('invalid_value', `${field}.verdict`);
  return { ok: true, value: { question, basis, facetRef: facetRef.value, text: text.value, verdict } };
}

function decodeClarifyFields(value: unknown, field: string): TwinPrechatDecodeResultV0<TwinPrechatClarifyFieldV0[]> {
  if (!Array.isArray(value)) return fail('invalid_type', field);
  if (value.length === 0 || value.length > L.clarifyMax) return fail('invalid_value', field);
  const fields: TwinPrechatClarifyFieldV0[] = [];
  for (let i = 0; i < value.length; i += 1) {
    const item: unknown = value[i];
    if (typeof item !== 'string') return fail('invalid_type', `${field}[${i}]`);
    if (!isOneOf(TWIN_PRECHAT_CLARIFY_FIELDS_V0, item) || fields.includes(item)) return fail('invalid_value', `${field}[${i}]`);
    fields.push(item);
  }
  return { ok: true, value: fields };
}

function decodeClarifyAnswer(value: unknown, field: string): TwinPrechatDecodeResultV0<TwinPrechatClarifyAnswerV0> {
  const rec = strict(value, field, ['field', 'basis', 'value'], ['field', 'basis']);
  if (rec.ok === false) return rec;
  const name = rec.value.field;
  if (typeof name !== 'string') return fail('invalid_type', `${field}.field`);
  if (!isOneOf(TWIN_PRECHAT_CLARIFY_FIELDS_V0, name)) return fail('invalid_value', `${field}.field`);
  const basis = rec.value.basis;
  if (basis === 'needs_owner') {
    if (rec.value.value !== undefined) return fail('unknown_field', `${field}.value`);
    return { ok: true, value: { field: name, basis } };
  }
  if (basis !== 'need_card') return fail(typeof basis === 'string' ? 'invalid_value' : 'invalid_type', `${field}.basis`);
  if (rec.value.value === undefined) return fail('missing_field', `${field}.value`);
  const text = decodeText(rec.value.value, `${field}.value`);
  if (text.ok === false) return text;
  return { ok: true, value: { field: name, basis, value: text.value } };
}

function decodeList<T>(value: unknown, field: string, max: number, item: (v: unknown, f: string) => TwinPrechatDecodeResultV0<T>): TwinPrechatDecodeResultV0<T[]> {
  if (!Array.isArray(value)) return fail('invalid_type', field);
  if (value.length === 0 || value.length > max) return fail('invalid_value', field);
  const out: T[] = [];
  for (let i = 0; i < value.length; i += 1) {
    const decoded = item(value[i], `${field}[${i}]`);
    if (decoded.ok === false) return decoded;
    out.push(decoded.value);
  }
  return { ok: true, value: out };
}

/** 只留认识的字段；未知字段、超长、依据和问题不配套、违规文本一律拒。前后顺序由 `twinPrechatSequenceErrorV0` 查。 */
export function decodeTwinPrechatMessageV0(value: unknown, field = 'message'): TwinPrechatDecodeResultV0<TwinPrechatMessageV0> {
  if (!isRecord(value)) return fail('invalid_type', field);
  const kind = value.kind;
  if (kind === undefined) return fail('missing_field', `${field}.kind`);
  if (typeof kind !== 'string') return fail('invalid_type', `${field}.kind`);
  const allowed = KEYS_OF_KIND[kind];
  if (!allowed) return fail('invalid_value', `${field}.kind`);
  const rec = strict(value, field, allowed, allowed.filter((key) => key !== 'clarify'));
  if (rec.ok === false) return rec;
  const v = rec.value;
  const seq = v.seq;
  if (typeof seq !== 'number') return fail('invalid_type', `${field}.seq`);
  if (!Number.isInteger(seq) || seq < 1 || seq > L.messagesMax) return fail('invalid_value', `${field}.seq`);
  if (v.side !== SIDE_OF_KIND[kind]) return fail(typeof v.side === 'string' ? 'invalid_value' : 'invalid_type', `${field}.side`);

  if (kind === 'ask') {
    if (seq !== 1) return fail('invalid_value', `${field}.seq`);
    const needCard = decodeNeedCard(v.needCard, `${field}.needCard`);
    if (needCard.ok === false) return needCard;
    const questions = decodeQuestions(v.questions, `${field}.questions`);
    if (questions.ok === false) return questions;
    return { ok: true, value: { seq: 1, side: 'initiator', kind: 'ask', needCard: needCard.value, questions: questions.value } };
  }
  if (kind === 'answer') {
    const answers = decodeList(v.answers, `${field}.answers`, 2 + L.conditionsMax, decodeAnswer);
    if (answers.ok === false) return answers;
    if (v.clarify === undefined) return { ok: true, value: { seq, side: 'responder', kind: 'answer', answers: answers.value } };
    const clarify = decodeClarifyFields(v.clarify, `${field}.clarify`);
    if (clarify.ok === false) return clarify;
    return { ok: true, value: { seq, side: 'responder', kind: 'answer', answers: answers.value, clarify: clarify.value } };
  }
  if (kind === 'clarify_answer') {
    const answers = decodeList(v.answers, `${field}.answers`, L.clarifyMax, decodeClarifyAnswer);
    if (answers.ok === false) return answers;
    return { ok: true, value: { seq, side: 'initiator', kind: 'clarify_answer', answers: answers.value } };
  }
  const reason = v.reason;
  if (typeof reason !== 'string') return fail('invalid_type', `${field}.reason`);
  if (!isOneOf(TWIN_PRECHAT_CLOSE_REASONS_V0, reason)) return fail('invalid_value', `${field}.reason`);
  return { ok: true, value: { seq, side: 'server', kind: 'close', reason } };
}

// ── 顺序、下一步、结果 ─────────────────────────────────────────────────────────────────────────

function questionKey(question: TwinPrechatQuestionV0): string {
  return question.kind === 'condition' ? `condition:${question.conditionRef ?? ''}` : question.kind;
}

function answerKey(answer: TwinPrechatAnswerV0): string {
  return answer.question === 'condition' ? `condition:${answer.conditionRef ?? ''}` : answer.question;
}

function answersCoverQuestions(answers: readonly TwinPrechatAnswerV0[], questions: readonly TwinPrechatQuestionV0[]): boolean {
  if (answers.length !== questions.length) return false;
  const got = answers.map(answerKey);
  if (new Set(got).size !== got.length) return false;
  return questions.every((question) => got.includes(questionKey(question)));
}

export const TWIN_PRECHAT_SEQUENCE_ERRORS_V0 = [
  'too_many',
  'seq_gap',
  'first_not_ask',
  'out_of_order',
  'after_close',
  'answers_mismatch',
  'clarify_twice',
  'clarify_mismatch',
  'need_card_mismatch',
] as const;
export type TwinPrechatSequenceErrorCodeV0 = (typeof TWIN_PRECHAT_SEQUENCE_ERRORS_V0)[number];

/**
 * 一串（已解码的）消息合不合顺序；合就返回 null。`close` 可以出现在任何一步之后（包括还没问就被权限拦下），
 * 但只能是最后一条。不看时间：空档是否在时间窗里由发送前的 `twinPrechatSlotsValidV0` 查。
 */
export function twinPrechatSequenceErrorV0(messages: readonly TwinPrechatMessageV0[]): { seq: number; code: TwinPrechatSequenceErrorCodeV0 } | null {
  if (messages.length > L.messagesMax) return { seq: L.messagesMax + 1, code: 'too_many' };
  let ask: TwinPrechatAskMessageV0 | null = null;
  let pending: TwinPrechatClarifyFieldV0[] | null = null;
  let expect: 'ask' | 'answer' | 'clarify_answer' | 'final_answer' | 'close' | 'end' = 'ask';
  for (let i = 0; i < messages.length; i += 1) {
    const message = messages[i];
    const seq = i + 1;
    if (message.seq !== seq) return { seq, code: 'seq_gap' };
    if (expect === 'end') return { seq, code: 'after_close' };
    if (message.kind === 'close') {
      expect = 'end';
      continue;
    }
    if (expect === 'ask') {
      if (message.kind !== 'ask') return { seq, code: 'first_not_ask' };
      ask = message;
      expect = 'answer';
      continue;
    }
    if (!ask) return { seq, code: 'first_not_ask' };
    if (expect === 'answer' || expect === 'final_answer') {
      if (message.kind !== 'answer') return { seq, code: 'out_of_order' };
      if (!answersCoverQuestions(message.answers, ask.questions)) return { seq, code: 'answers_mismatch' };
      if (message.clarify) {
        if (expect === 'final_answer') return { seq, code: 'clarify_twice' };
        pending = message.clarify;
        expect = 'clarify_answer';
      } else {
        expect = 'close';
      }
      continue;
    }
    if (expect === 'clarify_answer' && message.kind === 'clarify_answer' && pending) {
      const fields = message.answers.map((answer) => answer.field);
      if (fields.length !== pending.length || new Set(fields).size !== fields.length || !pending.every((name) => fields.includes(name))) {
        return { seq, code: 'clarify_mismatch' };
      }
      const card = ask.needCard;
      for (const answer of message.answers) if (answer.basis === 'need_card' && answer.value !== card[answer.field]) return { seq, code: 'need_card_mismatch' };
      pending = null;
      expect = 'final_answer';
      continue;
    }
    return { seq, code: 'out_of_order' };
  }
  return null;
}

export type TwinPrechatNextStepV0 =
  | { step: 'send'; side: 'initiator'; kind: 'ask' }
  | { step: 'send'; side: 'responder'; kind: 'answer'; mayClarify: boolean }
  | { step: 'send'; side: 'initiator'; kind: 'clarify_answer'; fields: TwinPrechatClarifyFieldV0[] }
  | { step: 'close'; reason: TwinPrechatCloseReasonV0 }
  | { step: 'closed' };

/** 一串合顺序的消息之后该谁发什么。到时和满条先于一切；最后一个名额留给服务端的 `close`。 */
export function twinPrechatNextV0(messages: readonly TwinPrechatMessageV0[], clock: { startedAt: string; now: string }): TwinPrechatNextStepV0 {
  const last = messages.length > 0 ? messages[messages.length - 1] : null;
  if (last && last.kind === 'close') return { step: 'closed' };
  const started = Date.parse(clock.startedAt);
  const now = Date.parse(clock.now);
  if (!Number.isFinite(started) || !Number.isFinite(now) || now - started >= L.windowMs) return { step: 'close', reason: 'timeout' };
  if (messages.length >= L.messagesMax - 1) return { step: 'close', reason: 'message_cap' };
  if (!last) return { step: 'send', side: 'initiator', kind: 'ask' };
  if (last.kind === 'ask') return { step: 'send', side: 'responder', kind: 'answer', mayClarify: true };
  if (last.kind === 'clarify_answer') return { step: 'send', side: 'responder', kind: 'answer', mayClarify: false };
  if (last.kind === 'answer' && last.clarify && !messages.some((message) => message.kind === 'clarify_answer')) {
    return { step: 'send', side: 'initiator', kind: 'clarify_answer', fields: last.clarify };
  }
  return { step: 'close', reason: 'done' };
}

/** 看最后一条 `answer` 里对 `fit` 的回答；没答到就结束是 `incomplete`，被代表权限拦下的算 `needs_owner`。 */
export function twinPrechatOutcomeV0(messages: readonly TwinPrechatMessageV0[]): TwinPrechatOutcomeV0 {
  let fit: TwinPrechatAnswerV0 | undefined;
  let closeReason: TwinPrechatCloseReasonV0 | null = null;
  for (const message of messages) {
    if (message.kind === 'answer') fit = message.answers.find((answer) => answer.question === 'fit') ?? fit;
    if (message.kind === 'close') closeReason = message.reason;
  }
  if (!fit) return closeReason === 'mandate_denied' ? 'needs_owner' : 'incomplete';
  if (fit.question === 'fit' && fit.basis === 'owner_confirmed') return fit.verdict === 'yes' ? 'fit' : 'not_fit';
  return 'needs_owner';
}

export interface TwinPrechatSummaryV0 {
  /** 按 `TWIN_PRECHAT_QUESTION_KINDS_V0` 的顺序，不重复。 */
  questionKinds: TwinPrechatQuestionKindV0[];
  outcome: TwinPrechatOutcomeV0;
  closeReason: TwinPrechatCloseReasonV0 | null;
  /** 最后一条 `answer` 里提议的空档数。 */
  slotCount: number;
  messageCount: number;
}

export function twinPrechatSummaryV0(messages: readonly TwinPrechatMessageV0[]): TwinPrechatSummaryV0 {
  let asked: readonly TwinPrechatQuestionV0[] = [];
  let slotCount = 0;
  let closeReason: TwinPrechatCloseReasonV0 | null = null;
  for (const message of messages) {
    if (message.kind === 'ask') asked = message.questions;
    if (message.kind === 'close') closeReason = message.reason;
    if (message.kind !== 'answer') continue;
    slotCount = 0;
    for (const answer of message.answers) if (answer.basis === 'published_slots') slotCount = answer.slots.length;
  }
  return {
    questionKinds: TWIN_PRECHAT_QUESTION_KINDS_V0.filter((kind) => asked.some((question) => question.kind === kind)),
    outcome: twinPrechatOutcomeV0(messages),
    closeReason,
    slotCount,
    messageCount: messages.length,
  };
}

const WINDOW_DAYS: Readonly<Record<IntroductionNeedWindowV1, number>> = { this_week: 7, two_weeks: 14, one_month: 31, not_urgent: 31 };

/** 发送前查空档：1–3 个、都在未来、互不重叠、每段 15 分钟到 4 小时、都在需求卡的时间窗里。 */
export function twinPrechatSlotsValidV0(slots: readonly TwinPrechatSlotV0[], window: IntroductionNeedWindowV1, now: string): boolean {
  const nowMs = Date.parse(now);
  if (!Number.isFinite(nowMs) || slots.length === 0 || slots.length > L.slotsMax) return false;
  const horizon = nowMs + WINDOW_DAYS[window] * 24 * 60 * 60 * 1000;
  const spans = slots.map((slot) => [Date.parse(slot.startAt), Date.parse(slot.endAt)] as const).sort((a, b) => a[0] - b[0]);
  for (let i = 0; i < spans.length; i += 1) {
    const [start, end] = spans[i];
    if (!Number.isFinite(start) || !Number.isFinite(end) || start <= nowMs || end > horizon) return false;
    if (end - start < L.slotMinMs || end - start > L.slotMaxMs) return false;
    if (i > 0 && start < spans[i - 1][1]) return false;
  }
  return true;
}

// ── 能不能开始 ──────────────────────────────────────────────────────────────────────────────

export interface TwinPrechatPartyStateV0 {
  /** 在 L9 名单里（`isInL9Cohort`）。 */
  inCohort: boolean;
  /** 发起方：开了「让我的分身先去对一轮」；应答方：开了「让同行的分身先来对一轮」。都默认关。 */
  optedIn: boolean;
  /** 持牌账户（`isL9RegulatedOwner`）。 */
  regulated: boolean;
}

export interface TwinPrechatStartInputV0 {
  flow: IntroductionFlowV1;
  status: IntroductionAnyStatusV1;
  /** 客户同意时看到的同意页文案版本（转介上记的）；没记就是 null。 */
  consentVersion: string | null;
  needCard: IntroductionNeedCardV1;
  initiator: TwinPrechatPartyStateV0;
  responder: TwinPrechatPartyStateV0 & {
    /** 有 Agentrix 账号和分身；免登录接收的同行（`guest`）为 false。 */
    hasTwin: boolean;
    inPeerList: boolean;
    /** 同意过出现在发起方的同行名单里。 */
    agreedToPeerList: boolean;
    /** 本人设的每天上限；null 用默认值。 */
    dailyCap: number | null;
  };
  /** 任一方屏蔽了对方。 */
  blocked: boolean;
  /** 这件转介对这位同行已经对过一轮。 */
  alreadyRan: boolean;
  counts: { initiatorToday: number; responderToday: number; pairThisWeek: number };
}

export type TwinPrechatStartResultV0 = { ok: true } | { ok: false; code: TwinPrechatRefusalCodeV0 };

/** 应答方实际的每天上限：本人只能调低，不合法的值按默认。 */
export function twinPrechatResponderDailyCapV0(dailyCap: number | null): number {
  if (dailyCap === null || !Number.isInteger(dailyCap) || dailyCap < 0) return L.perResponderPerDayMax;
  return Math.min(dailyCap, L.perResponderPerDayMax);
}

/**
 * 这一轮能不能开始。输入全由调用方查好给进来。持牌和不持牌不能互相对（规则第 1 条：房产圈只在两位 CEA 注册经纪之间）；
 * 应答方必须同意过进发起方的同行名单，不论持不持牌。应答方自己的设置放在最后查，发起方先碰到的是自己能处理的原因。
 */
export function twinPrechatCanStartV0(input: TwinPrechatStartInputV0): TwinPrechatStartResultV0 {
  const refuse = (code: TwinPrechatRefusalCodeV0): TwinPrechatStartResultV0 => ({ ok: false, code });
  const { initiator, responder, counts } = input;
  if (input.flow !== 'customer_first') return refuse('flow_not_customer_first');
  if (input.status !== 'c_consented') return refuse('status_not_consented');
  // 客户同意时页面上还没有「分身可能先对一下」那句，就不能拿他的需求去先聊。
  if (input.consentVersion !== INTRODUCTION_CONSENT_VERSION_TWIN_PRECHAT_V1) return refuse('consent_predates_prechat');
  if (!initiator.inCohort) return refuse('initiator_not_in_cohort');
  if (!initiator.optedIn) return refuse('initiator_not_opted_in');
  if (twinPrechatTextViolationsV0(input.needCard.note).length > 0) return refuse('need_card_filtered');
  if (counts.initiatorToday >= L.perInitiatorPerDay) return refuse('initiator_daily_limit');
  if (!responder.inPeerList) return refuse('responder_not_in_peer_list');
  if (!responder.agreedToPeerList) return refuse('responder_not_agreed');
  if (initiator.regulated !== responder.regulated) return refuse('regulated_mismatch');
  if (input.alreadyRan) return refuse('already_ran');
  if (counts.pairThisWeek >= L.perPairPerWeek) return refuse('pair_weekly_limit');
  if (!responder.inCohort) return refuse('responder_not_in_cohort');
  if (!responder.hasTwin) return refuse('responder_has_no_twin');
  if (!responder.optedIn) return refuse('responder_not_opted_in');
  if (input.blocked) return refuse('blocked');
  if (counts.responderToday >= twinPrechatResponderDailyCapV0(responder.dailyCap)) return refuse('responder_daily_limit');
  return { ok: true };
}

/** 给发起方看的拒绝原因：应答方自己的设置一律合成 `responder_unavailable`，具体原因只进服务端日志。 */
export function twinPrechatInitiatorRefusalV0(code: TwinPrechatRefusalCodeV0): TwinPrechatInitiatorRefusalV0 {
  return isOneOf(TWIN_PRECHAT_RESPONDER_PRIVATE_REFUSALS_V0, code) ? 'responder_unavailable' : code;
}

/**
 * 一条消息发出前要查的代表权限请求。发起方说话也按 `answer` 查（受众 agent、渠道 a2a 都得开着）；提议空档按
 * `appointment` 查。话题由服务端分类得出，不取对方分身自报的。
 */
export function twinPrechatMandateRequestV0(input: { agentAccountId: string; kind: 'answer' | 'slots'; topic?: string; at: string }): RepresentationMandateCheckRequestV1 {
  return {
    agentAccountId: input.agentAccountId,
    action: input.kind === 'slots' ? 'appointment' : 'answer',
    mode: 'text',
    audience: 'agent',
    channel: 'a2a',
    dataClass: 'public_facet',
    ...(input.topic !== undefined ? { topic: input.topic } : {}),
    at: input.at,
  };
}

// ── 全文和回执 ──────────────────────────────────────────────────────────────────────────────

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (isRecord(value)) {
    const keys = Object.keys(value).filter((key) => value[key] !== undefined).sort();
    return `{${keys.map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

/** 键排序、没有空白的 JSON；哈希（SHA-256）在后端算。 */
export function twinPrechatTranscriptCanonicalV0(messages: readonly TwinPrechatMessageV0[]): string {
  return canonical(messages);
}

export const TWIN_PRECHAT_RECEIPT_TYP_V0 = 'agentrix.twin-prechat-receipt.v0' as const;

export interface TwinPrechatReceiptPartyV0 {
  passportRef: string;
  /** 这一轮用到的代表权限；被权限拦下的一方为 null（两个字段同时为 null）。 */
  grantRef: string | null;
  grantVersion: number | null;
}

export interface TwinPrechatReceiptClaimsV0 {
  v: typeof TWIN_PRECHAT_SCHEMA_VERSION_V0;
  /** 转介 id 的 SHA-256，小写十六进制。 */
  introductionRefHash: string;
  initiator: TwinPrechatReceiptPartyV0;
  responder: TwinPrechatReceiptPartyV0;
  questionKinds: TwinPrechatQuestionKindV0[];
  outcome: TwinPrechatOutcomeV0;
  closeReason: TwinPrechatCloseReasonV0;
  slotCount: number;
  messageCount: number;
  startedAt: string;
  endedAt: string;
  /** `twinPrechatTranscriptCanonicalV0` 的 SHA-256，小写十六进制。 */
  transcriptSha256: string;
}

const RECEIPT_KEYS = [
  'v',
  'introductionRefHash',
  'initiator',
  'responder',
  'questionKinds',
  'outcome',
  'closeReason',
  'slotCount',
  'messageCount',
  'startedAt',
  'endedAt',
  'transcriptSha256',
] as const;

function decodeReceiptParty(value: unknown, field: string): TwinPrechatDecodeResultV0<TwinPrechatReceiptPartyV0> {
  const keys = ['passportRef', 'grantRef', 'grantVersion'];
  const rec = strict(value, field, keys, keys);
  if (rec.ok === false) return rec;
  const passportRef = decodeRef(rec.value.passportRef, `${field}.passportRef`);
  if (passportRef.ok === false) return passportRef;
  const { grantRef, grantVersion } = rec.value;
  if (grantRef === null && grantVersion === null) return { ok: true, value: { passportRef: passportRef.value, grantRef: null, grantVersion: null } };
  const ref = decodeRef(grantRef, `${field}.grantRef`);
  if (ref.ok === false) return ref;
  if (typeof grantVersion !== 'number' || !Number.isInteger(grantVersion) || grantVersion < 1) return fail('invalid_value', `${field}.grantVersion`);
  return { ok: true, value: { passportRef: passportRef.value, grantRef: ref.value, grantVersion } };
}

function decodeCount(value: unknown, field: string, min: number, max: number): TwinPrechatDecodeResultV0<number> {
  if (typeof value !== 'number') return fail('invalid_type', field);
  return Number.isInteger(value) && value >= min && value <= max ? { ok: true, value } : fail('invalid_value', field);
}

/** 回执里只有这些字段：多一个就拒，免得有人把需求卡或联系方式塞进来。 */
export function decodeTwinPrechatReceiptClaimsV0(value: unknown, field = 'receipt'): TwinPrechatDecodeResultV0<TwinPrechatReceiptClaimsV0> {
  const rec = strict(value, field, RECEIPT_KEYS, RECEIPT_KEYS);
  if (rec.ok === false) return rec;
  const v = rec.value;
  if (v.v !== TWIN_PRECHAT_SCHEMA_VERSION_V0) return fail('invalid_value', `${field}.v`);
  for (const key of ['introductionRefHash', 'transcriptSha256']) {
    const hash = v[key];
    if (typeof hash !== 'string') return fail('invalid_type', `${field}.${key}`);
    if (!HEX64.test(hash)) return fail('invalid_value', `${field}.${key}`);
  }
  const initiator = decodeReceiptParty(v.initiator, `${field}.initiator`);
  if (initiator.ok === false) return initiator;
  const responder = decodeReceiptParty(v.responder, `${field}.responder`);
  if (responder.ok === false) return responder;
  const kinds = v.questionKinds;
  if (!Array.isArray(kinds)) return fail('invalid_type', `${field}.questionKinds`);
  const questionKinds: TwinPrechatQuestionKindV0[] = [];
  for (const kind of kinds) {
    if (!isOneOf(TWIN_PRECHAT_QUESTION_KINDS_V0, kind) || questionKinds.includes(kind)) return fail('invalid_value', `${field}.questionKinds`);
    questionKinds.push(kind);
  }
  const outcome = v.outcome;
  if (!isOneOf(TWIN_PRECHAT_OUTCOMES_V0, outcome)) return fail('invalid_value', `${field}.outcome`);
  const closeReason = v.closeReason;
  if (!isOneOf(TWIN_PRECHAT_CLOSE_REASONS_V0, closeReason)) return fail('invalid_value', `${field}.closeReason`);
  const slotCount = decodeCount(v.slotCount, `${field}.slotCount`, 0, L.slotsMax);
  if (slotCount.ok === false) return slotCount;
  const messageCount = decodeCount(v.messageCount, `${field}.messageCount`, 1, L.messagesMax);
  if (messageCount.ok === false) return messageCount;
  const startedAt = decodeIso(v.startedAt, `${field}.startedAt`);
  if (startedAt.ok === false) return startedAt;
  const endedAt = decodeIso(v.endedAt, `${field}.endedAt`);
  if (endedAt.ok === false) return endedAt;
  if (Date.parse(endedAt.value) < Date.parse(startedAt.value)) return fail('invalid_value', `${field}.endedAt`);
  return {
    ok: true,
    value: {
      v: TWIN_PRECHAT_SCHEMA_VERSION_V0,
      introductionRefHash: v.introductionRefHash as string,
      initiator: initiator.value,
      responder: responder.value,
      questionKinds,
      outcome,
      closeReason,
      slotCount: slotCount.value,
      messageCount: messageCount.value,
      startedAt: startedAt.value,
      endedAt: endedAt.value,
      transcriptSha256: v.transcriptSha256 as string,
    },
  };
}

// ── 接单卡和一轮的内容（第 2 批） ─────────────────────────────────────────────────────

export const TWIN_PRECHAT_CARD_SCHEMA_VERSION_V0 = 'agentrix.twin-prechat-card.v0' as const;

/** 「其他」太宽，替本人说不了做不做：接单卡里不能填，需求卡选了「其他」时 fit 一律 `needs_owner`。 */
export type TwinPrechatCardCategoryV0 = Exclude<IntroductionNeedCategoryV1, 'other'>;
export const TWIN_PRECHAT_CARD_CATEGORIES_V0: readonly TwinPrechatCardCategoryV0[] = INTRODUCTION_NEED_CATEGORIES_V1.filter(
  (category): category is TwinPrechatCardCategoryV0 => category !== 'other',
);

/** 本人对一个类别的回答。`regions` 为空表示哪里都做；`text` 是本人原话，原样转给对方分身。 */
export interface TwinPrechatCardEntryV0 {
  category: TwinPrechatCardCategoryV0;
  takes: boolean;
  regions: IntroductionNeedRegionV1[];
  text: string;
}

/** 名片上的一条条件，发起方的分身可以点名问。 */
export interface TwinPrechatCardConditionV0 {
  ref: string;
  text: string;
}

export interface TwinPrechatCardV0 {
  v: typeof TWIN_PRECHAT_CARD_SCHEMA_VERSION_V0;
  entries: TwinPrechatCardEntryV0[];
  conditions: TwinPrechatCardConditionV0[];
}

const CARD_CONDITION_REF = /^[a-z0-9][a-z0-9_]{0,31}$/;

/** 接单卡整张校验；每句原话都要过 `twinPrechatTextViolationsV0`，没过就不让保存。 */
export function decodeTwinPrechatCardV0(value: unknown, field = 'card'): TwinPrechatDecodeResultV0<TwinPrechatCardV0> {
  const rec = strict(value, field, ['v', 'entries', 'conditions'], ['v', 'entries', 'conditions']);
  if (rec.ok === false) return rec;
  const v = rec.value;
  if (v.v !== TWIN_PRECHAT_CARD_SCHEMA_VERSION_V0) return fail('invalid_value', `${field}.v`);
  if (!Array.isArray(v.entries)) return fail('invalid_type', `${field}.entries`);
  if (v.entries.length > TWIN_PRECHAT_CARD_CATEGORIES_V0.length) return fail('invalid_value', `${field}.entries`);
  const entries: TwinPrechatCardEntryV0[] = [];
  for (let i = 0; i < v.entries.length; i += 1) {
    const at = `${field}.entries[${i}]`;
    const entry = strict(v.entries[i], at, ['category', 'takes', 'regions', 'text'], ['category', 'takes', 'regions', 'text']);
    if (entry.ok === false) return entry;
    const { category, takes, regions } = entry.value;
    if (!isOneOf(TWIN_PRECHAT_CARD_CATEGORIES_V0, category) || entries.some((e) => e.category === category)) return fail('invalid_value', `${at}.category`);
    if (typeof takes !== 'boolean') return fail('invalid_type', `${at}.takes`);
    if (!Array.isArray(regions)) return fail('invalid_type', `${at}.regions`);
    const served: IntroductionNeedRegionV1[] = [];
    for (const region of regions) {
      if (!isOneOf(INTRODUCTION_NEED_REGIONS_V1, region) || served.includes(region)) return fail('invalid_value', `${at}.regions`);
      served.push(region);
    }
    const text = decodeText(entry.value.text, `${at}.text`);
    if (text.ok === false) return text;
    entries.push({ category, takes, regions: served, text: text.value });
  }
  if (!Array.isArray(v.conditions)) return fail('invalid_type', `${field}.conditions`);
  if (v.conditions.length > L.conditionsMax) return fail('invalid_value', `${field}.conditions`);
  const conditions: TwinPrechatCardConditionV0[] = [];
  for (let i = 0; i < v.conditions.length; i += 1) {
    const at = `${field}.conditions[${i}]`;
    const condition = strict(v.conditions[i], at, ['ref', 'text'], ['ref', 'text']);
    if (condition.ok === false) return condition;
    const ref = condition.value.ref;
    if (typeof ref !== 'string') return fail('invalid_type', `${at}.ref`);
    if (!CARD_CONDITION_REF.test(ref) || conditions.some((c) => c.ref === ref)) return fail('invalid_value', `${at}.ref`);
    const text = decodeText(condition.value.text, `${at}.text`);
    if (text.ok === false) return text;
    conditions.push({ ref, text: text.value });
  }
  return { ok: true, value: { v: TWIN_PRECHAT_CARD_SCHEMA_VERSION_V0, entries, conditions } };
}

/** 客户写的那句话不进这一轮：介绍服务在客户撤回或删除时会抹掉它，这一轮存一份就抹不到；做不做和空档也用不到它。 */
export const TWIN_PRECHAT_NOTE_LEFT_OUT_V0 = '—';

/** 发起方的第一条：需求卡（不带客户那句话）、fit、slots，再加要问的应答方条件（去重，最多 3 条）。 */
export function twinPrechatAskV0(needCard: IntroductionNeedCardV1, conditionRefs: readonly string[]): TwinPrechatAskMessageV0 {
  const refs = Array.from(new Set(conditionRefs)).slice(0, L.conditionsMax);
  return {
    seq: 1,
    side: 'initiator',
    kind: 'ask',
    needCard: { ...needCard, note: TWIN_PRECHAT_NOTE_LEFT_OUT_V0 },
    questions: [{ kind: 'fit' }, { kind: 'slots' }, ...refs.map((conditionRef): TwinPrechatQuestionV0 => ({ kind: 'condition', conditionRef }))],
  };
}

export interface TwinPrechatCardAnswerInputV0 {
  card: TwinPrechatCardV0 | null;
  /** 接单卡第几版，写进 `facetRef`，事后能对上当时说的是哪一版。 */
  cardRev: number;
  /** 应答方公开的空档；不合时间窗就整项换成 `needs_owner`。 */
  slots: readonly TwinPrechatSlotV0[];
  now: string;
}

/**
 * 应答方的回答只从接单卡和公开空档里查：查不到、地区对不上、原话过不了过滤，都是 `needs_owner`。不推断，也不回问（接单卡是
 * 固定答案，用不到回问）。
 */
export function twinPrechatAnswerFromCardV0(ask: TwinPrechatAskMessageV0, input: TwinPrechatCardAnswerInputV0): TwinPrechatAnswerMessageV0 {
  const { card, cardRev } = input;
  const clean = (text: string): boolean => twinPrechatTextViolationsV0(text).length === 0;
  const answers = ask.questions.map((question): TwinPrechatAnswerV0 => {
    if (question.kind === 'fit') {
      const entry = card ? card.entries.find((e) => e.category === ask.needCard.category) : undefined;
      if (!entry || !clean(entry.text)) return { question: 'fit', basis: 'needs_owner' };
      if (entry.takes && entry.regions.length > 0 && !entry.regions.includes(ask.needCard.region)) return { question: 'fit', basis: 'needs_owner' };
      return { question: 'fit', basis: 'owner_confirmed', facetRef: `card.r${cardRev}:${entry.category}`, text: entry.text, verdict: entry.takes ? 'yes' : 'no' };
    }
    if (question.kind === 'slots') {
      const slots = input.slots.slice(0, L.slotsMax).map((slot) => ({ startAt: slot.startAt, endAt: slot.endAt }));
      return slots.length > 0 && twinPrechatSlotsValidV0(slots, ask.needCard.window, input.now)
        ? { question: 'slots', basis: 'published_slots', slots }
        : { question: 'slots', basis: 'needs_owner' };
    }
    const condition = card ? card.conditions.find((c) => c.ref === question.conditionRef) : undefined;
    return condition && clean(condition.text)
      ? { question: 'condition', conditionRef: condition.ref, basis: 'owner_confirmed', facetRef: `card.r${cardRev}:cond.${condition.ref}`, text: condition.text }
      : { question: 'condition', conditionRef: question.conditionRef ?? '', basis: 'needs_owner' };
  });
  return { seq: 2, side: 'responder', kind: 'answer', answers };
}

/** 把一条回答里的每一项都换成 `needs_owner`：应答方的代表权限不过时用，发起方看不出是权限的原因。 */
export function twinPrechatAnswerNeedsOwnerV0(answer: TwinPrechatAnswerMessageV0): TwinPrechatAnswerMessageV0 {
  return {
    ...answer,
    answers: answer.answers.map((a): TwinPrechatAnswerV0 => (a.question === 'condition' ? { question: 'condition', conditionRef: a.conditionRef ?? '', basis: 'needs_owner' } : { question: a.question, basis: 'needs_owner' })),
  };
}

export function twinPrechatCloseV0(seq: number, reason: TwinPrechatCloseReasonV0): TwinPrechatCloseMessageV0 {
  return { seq, side: 'server', kind: 'close', reason };
}

// ── 接口（第 2 批） ─────────────────────────────────────────────────────────────

export interface TwinPrechatProfileV0 {
  /** 「让我的分身先去对一轮」。 */
  initiatorOptIn: boolean;
  /** 「让同行的分身先来对一轮」。 */
  responderOptIn: boolean;
  /** 每天最多被对几轮；null 用默认值，只能调低。 */
  dailyCap: number | null;
  card: TwinPrechatCardV0 | null;
  /** 接单卡每改一次加一，由服务端算；回答里的 `facetRef` 带着它，对得上是哪一版的原话。 */
  cardRev: number;
}

export const TWIN_PRECHAT_EMPTY_PROFILE_V0: Readonly<TwinPrechatProfileV0> = Object.freeze({
  initiatorOptIn: false,
  responderOptIn: false,
  dailyCap: null,
  card: null,
  cardRev: 0,
});

export type TwinPrechatProfilePatchV0 = Partial<Pick<TwinPrechatProfileV0, 'initiatorOptIn' | 'responderOptIn' | 'dailyCap' | 'card'>>;

const PROFILE_PATCH_KEYS = ['initiatorOptIn', 'responderOptIn', 'dailyCap', 'card'] as const;

/** 只改带上的字段；`card: null` 是清掉接单卡。 */
export function decodeTwinPrechatProfilePatchV0(value: unknown, field = 'profile'): TwinPrechatDecodeResultV0<TwinPrechatProfilePatchV0> {
  const rec = strict(value, field, PROFILE_PATCH_KEYS, []);
  if (rec.ok === false) return rec;
  const patch: TwinPrechatProfilePatchV0 = {};
  for (const key of ['initiatorOptIn', 'responderOptIn'] as const) {
    const flag = rec.value[key];
    if (flag === undefined) continue;
    if (typeof flag !== 'boolean') return fail('invalid_type', `${field}.${key}`);
    patch[key] = flag;
  }
  const { dailyCap, card } = rec.value;
  if (dailyCap === null) patch.dailyCap = null;
  else if (dailyCap !== undefined) {
    if (typeof dailyCap !== 'number') return fail('invalid_type', `${field}.dailyCap`);
    if (!Number.isInteger(dailyCap) || dailyCap < 0 || dailyCap > L.perResponderPerDayMax) return fail('invalid_value', `${field}.dailyCap`);
    patch.dailyCap = dailyCap;
  }
  if (card === null) patch.card = null;
  else if (card !== undefined) {
    const decoded = decodeTwinPrechatCardV0(card, `${field}.card`);
    if (decoded.ok === false) return decoded;
    patch.card = decoded.value;
  }
  return { ok: true, value: patch };
}

export interface TwinPrechatRoundViewV0 {
  introductionId: string;
  /** 看的人是这件转介的哪一方。 */
  side: 'initiator' | 'responder';
  messages: TwinPrechatMessageV0[];
  summary: TwinPrechatSummaryV0;
  startedAt: string;
  /** 只说平台签没签过回执。回执本身不给两边：里面有对方代表权限的编号，也看得出对方的权限有没有放行。 */
  receiptSigned: boolean;
}

/** A 自己的代表权限没让分身去。只告诉 A 本人，不建这一轮，改好了还能再发起。 */
export const TWIN_PRECHAT_INITIATOR_MANDATE_DENIED_V0 = 'initiator_mandate_denied' as const;

export type TwinPrechatStartOutcomeV0 =
  | { started: true; round: TwinPrechatRoundViewV0 }
  | { started: false; code: TwinPrechatInitiatorRefusalV0 }
  | { started: false; code: typeof TWIN_PRECHAT_INITIATOR_MANDATE_DENIED_V0; mandateReason: RepresentationDenialReasonV1 };
