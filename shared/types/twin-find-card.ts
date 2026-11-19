/**
 * 帮我找人 ·「找对象」的条件卡（合同 v0；设计稿 `.agents/tasks/twin-social-net/find-card-design.md`）。
 *
 * 开了「我也在找」的人自己填一张卡：6 项，每项「我是」和「我能接受」，都可以不填。朋友在找对象的问题上选中一个人、
 * 平台本来要在站内问他的时候，先拿提问的人和他的两张卡对一遍（`twinFindCardsMatchV0`）：对上了照常问；对不上那一行变成
 * `mismatched`，不打扰他，谁都不知道是哪一项。有一方没填卡就照常问；卡上没填的那一项也不算没对上。同一对人
 * 30 天只对一次（`TWIN_FIND_CARD_LIMITS_V0.recheckMs`），这期间直接用那次的结果。
 *
 * 卡只有本人看得到：不进任何别人的视图、通知、回执和日志。对卡的结果只有朋友那一行的状态这一个出口。
 *
 * 开关（后端接线时才读）：服务端 `TWIN_FIND_CARD_V0_ENABLED`，只认精确的 `'1'`，而且 `TWIN_FIND_V0_ENABLED` 和
 * `TWIN_FIND_DATING_V0_ENABLED` 也要开着；手机 `EXPO_PUBLIC_TWIN_FIND_CARD`（也要先开着找对象那一个）。
 *
 * 本文件只有常量、类型和纯函数：不读环境变量、不碰数据库、不调模型。
 */
import { TWIN_FIND_SCHEMA_VERSION_V0, twinFindTextBlockedV0, type TwinFindDecodeResultV0, type TwinFindReasonCodeV0 } from './twin-find';

export const TWIN_FIND_CARD_FLAG_V0 = 'TWIN_FIND_CARD_V0_ENABLED';
export const TWIN_FIND_CARD_MOBILE_FLAG_V0 = 'EXPO_PUBLIC_TWIN_FIND_CARD';

const DAY_MS = 24 * 60 * 60 * 1000;

export const TWIN_FIND_CARD_LIMITS_V0 = {
  /** 「我是」写的城市。 */
  cityMax: 20,
  /** 同一个提问的人和同一个被选中的人，这么久里只对一次卡；那条记录过了这么久由每天的任务删掉。 */
  recheckMs: 30 * DAY_MS,
} as const;

// ── 6 项 ───────────────────────────────────────────────────────────────────

export const TWIN_FIND_CARD_AGES_V0 = ['18_24', '25_29', '30_34', '35_39', '40_44', '45_49', '50_plus'] as const;
export const TWIN_FIND_CARD_KIDS_V0 = ['want', 'no', 'have', 'unsure'] as const;
export const TWIN_FIND_CARD_SMOKING_V0 = ['no', 'sometimes', 'yes'] as const;
export const TWIN_FIND_CARD_DIETS_V0 = ['none', 'vegetarian', 'halal', 'other'] as const;
export const TWIN_FIND_CARD_SCHEDULES_V0 = ['early', 'late', 'irregular'] as const;
/** 城市的「我能接受」：只要同城，或不限。 */
export const TWIN_FIND_CARD_CITY_ACCEPTS_V0 = ['same', 'any'] as const;

export type TwinFindCardAgeV0 = (typeof TWIN_FIND_CARD_AGES_V0)[number];
export type TwinFindCardKidsV0 = (typeof TWIN_FIND_CARD_KIDS_V0)[number];
export type TwinFindCardSmokingV0 = (typeof TWIN_FIND_CARD_SMOKING_V0)[number];
export type TwinFindCardDietV0 = (typeof TWIN_FIND_CARD_DIETS_V0)[number];
export type TwinFindCardScheduleV0 = (typeof TWIN_FIND_CARD_SCHEDULES_V0)[number];
export type TwinFindCardCityAcceptV0 = (typeof TWIN_FIND_CARD_CITY_ACCEPTS_V0)[number];

/** 选项固定的那 5 项，按卡上的顺序。 */
export const TWIN_FIND_CARD_CHOICE_ITEMS_V0 = ['age', 'kids', 'smoking', 'diet', 'schedule'] as const;
export type TwinFindCardChoiceItemV0 = (typeof TWIN_FIND_CARD_CHOICE_ITEMS_V0)[number];
export const TWIN_FIND_CARD_ITEMS_V0 = ['city', ...TWIN_FIND_CARD_CHOICE_ITEMS_V0] as const;
export type TwinFindCardItemV0 = (typeof TWIN_FIND_CARD_ITEMS_V0)[number];

export const TWIN_FIND_CARD_OPTIONS_V0 = {
  age: TWIN_FIND_CARD_AGES_V0,
  kids: TWIN_FIND_CARD_KIDS_V0,
  smoking: TWIN_FIND_CARD_SMOKING_V0,
  diet: TWIN_FIND_CARD_DIETS_V0,
  schedule: TWIN_FIND_CARD_SCHEDULES_V0,
} as const;
export type TwinFindCardOptionV0<K extends TwinFindCardChoiceItemV0> = (typeof TWIN_FIND_CARD_OPTIONS_V0)[K][number];

/** 一项：「我是」（`null` 不说）和「我能接受」（`null` 都可以；否则至少一个、不重复，按选项的顺序）。 */
export interface TwinFindCardChoiceV0<T extends string> {
  self: T | null;
  accept: T[] | null;
}

/** 城市：「我是」写一个城市（`null` 不说）；选了「只要同城」就必须写。 */
export interface TwinFindCardCityV0 {
  self: string | null;
  accept: TwinFindCardCityAcceptV0;
}

export interface TwinFindCardV0 {
  city: TwinFindCardCityV0;
  age: TwinFindCardChoiceV0<TwinFindCardAgeV0>;
  kids: TwinFindCardChoiceV0<TwinFindCardKidsV0>;
  smoking: TwinFindCardChoiceV0<TwinFindCardSmokingV0>;
  diet: TwinFindCardChoiceV0<TwinFindCardDietV0>;
  schedule: TwinFindCardChoiceV0<TwinFindCardScheduleV0>;
}

/** `GET` / `PUT /twin-find/card` 的回答：本人自己的卡，没填是 `null`。 */
export interface TwinFindCardViewV0 {
  schemaVersion: typeof TWIN_FIND_SCHEMA_VERSION_V0;
  card: TwinFindCardV0 | null;
}

/** 什么都没说、什么都接受的一张卡：和没填卡一样，和谁都对得上。手机的编辑页从它开始。 */
export const TWIN_FIND_CARD_BLANK_V0: Readonly<TwinFindCardV0> = Object.freeze<TwinFindCardV0>({
  city: { self: null, accept: 'any' },
  age: { self: null, accept: null },
  kids: { self: null, accept: null },
  smoking: { self: null, accept: null },
  diet: { self: null, accept: null },
  schedule: { self: null, accept: null },
});

// ── 字 ──────────────────────────────────────────────────────────────────────

type Words = { zh: string; en: string };

export const TWIN_FIND_CARD_ITEM_LABELS_V0: Readonly<Record<TwinFindCardItemV0, Words>> = {
  city: { zh: '城市', en: 'City' },
  age: { zh: '年龄段', en: 'Age' },
  kids: { zh: '孩子', en: 'Children' },
  smoking: { zh: '抽烟', en: 'Smoking' },
  diet: { zh: '饮食或宗教', en: 'Diet or religion' },
  schedule: { zh: '作息', en: 'Daily rhythm' },
};

export const TWIN_FIND_CARD_OPTION_LABELS_V0: { readonly [K in TwinFindCardChoiceItemV0]: Readonly<Record<TwinFindCardOptionV0<K>, Words>> } = {
  age: {
    '18_24': { zh: '18–24 岁', en: '18–24' },
    '25_29': { zh: '25–29 岁', en: '25–29' },
    '30_34': { zh: '30–34 岁', en: '30–34' },
    '35_39': { zh: '35–39 岁', en: '35–39' },
    '40_44': { zh: '40–44 岁', en: '40–44' },
    '45_49': { zh: '45–49 岁', en: '45–49' },
    '50_plus': { zh: '50 岁以上', en: '50+' },
  },
  kids: {
    want: { zh: '想要孩子', en: 'Want children' },
    no: { zh: '不要孩子', en: "Don't want children" },
    have: { zh: '已经有孩子', en: 'Have children' },
    unsure: { zh: '还没想好', en: 'Not sure yet' },
  },
  smoking: {
    no: { zh: '不抽', en: "Don't smoke" },
    sometimes: { zh: '偶尔抽', en: 'Sometimes' },
    yes: { zh: '常抽', en: 'Smoke' },
  },
  diet: {
    none: { zh: '没有特别讲究', en: 'Nothing particular' },
    vegetarian: { zh: '素食', en: 'Vegetarian' },
    halal: { zh: '清真', en: 'Halal' },
    other: { zh: '有别的讲究', en: 'Something else' },
  },
  schedule: {
    early: { zh: '早睡早起', en: 'Early bird' },
    late: { zh: '晚睡晚起', en: 'Night owl' },
    irregular: { zh: '不固定', en: 'Irregular' },
  },
};

export const TWIN_FIND_CARD_CITY_ACCEPT_LABELS_V0: Readonly<Record<TwinFindCardCityAcceptV0, Words>> = {
  same: { zh: '只要同城', en: 'Same city only' },
  any: { zh: '不限', en: 'Anywhere' },
};

/** 卡下面那段话：卡用来做什么、谁看得到、对不上时谁知道什么。 */
export const TWIN_FIND_CARD_NOTICE_V0 = {
  zh: '朋友替别人找对象、选中你的时候，平台先拿你的卡和提问的人的卡对一遍：对上了才来问你，对不上就不打扰你。一项不填，这一项就不拦人。卡的内容谁都看不到，接上以后也不给对方看；对不上时，选你的那位朋友只知道“没对上”，不知道是哪一项。同一个人 30 天里只和你对一次。卡上写的是你自己说的，平台不核实。',
  en: "When a friend picks you for someone who is looking for a partner, Agentrix first compares your card with theirs: you are asked only if they match, otherwise you are not disturbed. A part you leave empty never rules anyone out. Nobody can see what your card says, not even after an introduction; if the cards do not match, the friend who picked you only learns that, not which part. The same person is compared with you at most once in 30 days. Your card is what you say about yourself; Agentrix does not check it.",
} as const;

// ── 对卡 ────────────────────────────────────────────────────────────────────

/** 两个城市算不算同一个：全角半角统一、不分大小写、去掉所有空白和末尾的「市」以后相同。 */
export function twinFindCardCityKeyV0(city: string): string {
  return city.normalize('NFKC').toLowerCase().replace(/\s+/g, '').replace(/市$/, '');
}

/** 没填的不拦人：只有对方说了、而且不在我能接受的里面，才算不接受。 */
function accepts<T extends string>(accept: readonly T[] | null, value: T | null): boolean {
  return accept === null || value === null || accept.includes(value);
}

function oneWay(from: TwinFindCardV0, to: TwinFindCardV0): boolean {
  if (from.city.accept === 'same' && from.city.self !== null && to.city.self !== null) {
    if (twinFindCardCityKeyV0(from.city.self) !== twinFindCardCityKeyV0(to.city.self)) return false;
  }
  return (
    accepts(from.age.accept, to.age.self) &&
    accepts(from.kids.accept, to.kids.self) &&
    accepts(from.smoking.accept, to.smoking.self) &&
    accepts(from.diet.accept, to.diet.self) &&
    accepts(from.schedule.accept, to.schedule.self)
  );
}

/**
 * 两个方向都要过：一方在某一项上有要求、另一方在这一项上又说了自己，说的就必须在要求里面。不打分，只有对上和没对上；
 * 不说是哪一项。
 */
export function twinFindCardsMatchV0(a: TwinFindCardV0, b: TwinFindCardV0): boolean {
  return oneWay(a, b) && oneWay(b, a);
}

// ── 解码 ────────────────────────────────────────────────────────────────────

type Failure = { ok: false; reasonCode: TwinFindReasonCodeV0; field: string };

const L = TWIN_FIND_CARD_LIMITS_V0;
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

/** 后端用非严格模式编译这份文件，那里 `x !== null && …` 收窄不了 `unknown`：可以为空的用这个守卫。 */
function isOneOfOrNull<T extends string>(list: readonly T[], value: unknown): value is T | null {
  return value === null || isOneOf(list, value);
}

/** 只认这几个字段，而且一个都不能少（可以是 `null`）。 */
function exactly(value: unknown, field: string, keys: readonly string[]): TwinFindDecodeResultV0<Record<string, unknown>> {
  if (!isRecord(value)) return fail('invalid_type', field);
  for (const key of Object.keys(value)) if (!keys.includes(key)) return fail('unknown_field', `${field}.${key}`);
  for (const key of keys) if (value[key] === undefined) return fail('missing_field', `${field}.${key}`);
  return { ok: true, value };
}

function decodeChoice<T extends string>(list: readonly T[], value: unknown, field: string): TwinFindDecodeResultV0<TwinFindCardChoiceV0<T>> {
  const rec = exactly(value, field, ['self', 'accept']);
  if (rec.ok === false) return rec;
  const self = rec.value.self;
  if (self !== null && typeof self !== 'string') return fail('invalid_type', `${field}.self`);
  if (!isOneOfOrNull(list, self)) return fail('invalid_value', `${field}.self`);
  const accept = rec.value.accept;
  if (accept === null) return { ok: true, value: { self, accept: null } };
  if (!Array.isArray(accept)) return fail('invalid_type', `${field}.accept`);
  if (accept.length === 0) return fail('invalid_value', `${field}.accept`);
  const picked: T[] = [];
  for (const item of accept) {
    if (typeof item !== 'string') return fail('invalid_type', `${field}.accept`);
    if (!isOneOf(list, item) || picked.includes(item)) return fail('invalid_value', `${field}.accept`);
    picked.push(item);
  }
  // 按选项的顺序存：同样的选择只有一种写法。
  return { ok: true, value: { self, accept: list.filter((option) => picked.includes(option)) } };
}

function decodeCity(value: unknown, field: string): TwinFindDecodeResultV0<TwinFindCardCityV0> {
  const rec = exactly(value, field, ['self', 'accept']);
  if (rec.ok === false) return rec;
  const accept = rec.value.accept;
  if (typeof accept !== 'string') return fail('invalid_type', `${field}.accept`);
  if (!isOneOf(TWIN_FIND_CARD_CITY_ACCEPTS_V0, accept)) return fail('invalid_value', `${field}.accept`);
  const self = rec.value.self;
  if (self === null) return accept === 'same' ? fail('missing_field', `${field}.self`) : { ok: true, value: { self: null, accept } };
  if (typeof self !== 'string') return fail('invalid_type', `${field}.self`);
  const text = self.trim();
  if (text.length === 0 || CONTROL.test(text) || twinFindCardCityKeyV0(text) === '') return fail('invalid_value', `${field}.self`);
  if (Array.from(text).length > L.cityMax) return fail('too_long', `${field}.self`);
  if (twinFindTextBlockedV0(text)) return fail('text_violation', `${field}.self`);
  return { ok: true, value: { self: text, accept } };
}

/** 一整张卡：6 项都要写，不认识的字段和值一律不收。后端存之前、读出来以后，手机保存之前，都用它。 */
export function decodeTwinFindCardV0(value: unknown, field = 'card'): TwinFindDecodeResultV0<TwinFindCardV0> {
  const rec = exactly(value, field, TWIN_FIND_CARD_ITEMS_V0);
  if (rec.ok === false) return rec;
  const city = decodeCity(rec.value.city, `${field}.city`);
  if (city.ok === false) return city;
  const age = decodeChoice(TWIN_FIND_CARD_AGES_V0, rec.value.age, `${field}.age`);
  if (age.ok === false) return age;
  const kids = decodeChoice(TWIN_FIND_CARD_KIDS_V0, rec.value.kids, `${field}.kids`);
  if (kids.ok === false) return kids;
  const smoking = decodeChoice(TWIN_FIND_CARD_SMOKING_V0, rec.value.smoking, `${field}.smoking`);
  if (smoking.ok === false) return smoking;
  const diet = decodeChoice(TWIN_FIND_CARD_DIETS_V0, rec.value.diet, `${field}.diet`);
  if (diet.ok === false) return diet;
  const schedule = decodeChoice(TWIN_FIND_CARD_SCHEDULES_V0, rec.value.schedule, `${field}.schedule`);
  if (schedule.ok === false) return schedule;
  return { ok: true, value: { city: city.value, age: age.value, kids: kids.value, smoking: smoking.value, diet: diet.value, schedule: schedule.value } };
}

/** `PUT /twin-find/card` 的 body：`{ card }`，`card` 是 `null` 就是清空。 */
export function decodeTwinFindCardPutV0(value: unknown): TwinFindDecodeResultV0<{ card: TwinFindCardV0 | null }> {
  const rec = exactly(value, 'body', ['card']);
  if (rec.ok === false) return rec;
  if (rec.value.card === null) return { ok: true, value: { card: null } };
  const card = decodeTwinFindCardV0(rec.value.card);
  return card.ok === false ? card : { ok: true, value: { card: card.value } };
}

/**
 * 读服务器的回答（手机用）。外面包一层 `{ data: … }` 也认；卡要能被上面的严格解码读出来，否则整条不认（返回
 * null，调用方按「读不出来」处理）。
 */
export function decodeTwinFindCardViewV0(body: unknown): TwinFindCardViewV0 | null {
  const value = isRecord(body) && isRecord(body.data) && body.card === undefined ? body.data : body;
  if (!isRecord(value) || value.schemaVersion !== TWIN_FIND_SCHEMA_VERSION_V0 || value.card === undefined) return null;
  if (value.card === null) return { schemaVersion: TWIN_FIND_SCHEMA_VERSION_V0, card: null };
  const card = decodeTwinFindCardV0(value.card);
  return card.ok ? { schemaVersion: TWIN_FIND_SCHEMA_VERSION_V0, card: card.value } : null;
}
