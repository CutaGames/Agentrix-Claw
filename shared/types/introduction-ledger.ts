/**
 * 介绍账本、跟进、静音（L9 C2 线，P1-6，coord 10-31 E145）。B 接受后直接去建名片在 `introduction-build-card.ts`（P1-7）。
 *
 * 规矩（H41）：账是 A 和 B 两方共用的一本，只含状态、日期和两方各点一次的结果，不含客户的姓名、联系方式、需求原话。
 * 没有排名，没有「你欠 N 个」，没有总数、差额、分数。每一对同行只给两个事实：你转过去几位、对方转来几位，
 * 按最近有动静的先后排，不按多少排。解码函数拒收任何多余的字段，所以后加一个 `balance` 或 `rank` 会在每个端当场被拒。
 *
 * 开关（默认关，只认精确的 `'1'`，且要 `INTRODUCTIONS_V1_ENABLED` 开着）：`INTRODUCTION_LEDGER_V1_ENABLED`（账本、结果、静音）。
 * 网页编译期开关 `NEXT_PUBLIC_INTRODUCTION_LEDGER_ENABLED`。账本入口受 P1-0 名单约束。
 */
import {
  INTRODUCTION_ALL_STATUSES_V1,
  INTRODUCTION_FOLLOW_UP_KINDS_V1,
  INTRODUCTION_SCHEMA_VERSION_V1,
  type IntroductionAnyStatusV1,
  type IntroductionFollowUpKindV1,
} from './introduction';

// 跟进种类的共享常量放在 `introduction.ts`（coord 10-31 决定①）；这里原样转出，已有的引用不用改。
export { INTRODUCTION_FOLLOW_UP_KINDS_V1 };
export type { IntroductionFollowUpKindV1 };

export const INTRODUCTION_LEDGER_FLAG_V1 = 'INTRODUCTION_LEDGER_V1_ENABLED';

/** 两方各点一次的结果：约上了、对方婉拒了（或我婉拒了）、没联系上。 */
export const INTRODUCTION_RESULTS_V1 = ['booked', 'declined', 'no_contact'] as const;
export type IntroductionResultV1 = (typeof INTRODUCTION_RESULTS_V1)[number];

/** 进账的状态：B 已经被告知（等答复）或已经接受。客户还没同意、客户撤回、被拒、过期的不进账。 */
export const INTRODUCTION_LEDGER_STATUSES_V1 = ['a_approved', 'b_accepted', 'c_accepted', 'active', 'closed'] as const;
/** 能点结果的状态：B 已经接受。 */
export const INTRODUCTION_RESULT_STATUSES_V1 = ['b_accepted', 'c_accepted', 'active', 'closed'] as const;

/** 跟进：B 24 小时没答复，提醒 A；客户 48 小时没约，问 A 一句。种类见 `introduction.ts` 的 `INTRODUCTION_FOLLOW_UP_KINDS_V1`。 */
export const INTRODUCTION_FOLLOW_UP_RULES_V1 = { bNoReplyHours: 24, clientNoBookingHours: 48, max: 20 } as const;

export const INTRODUCTION_LEDGER_ROUTES_V1 = {
  ledger: '/introductions/ledger',
  /** 只给 B 的窄读取：我作为 B 已接受的那几条，和我自己记的结果。名单外的 B 靠它记结果（不是账本，不要名单）。 */
  asRecipient: '/introductions/as-recipient',
  result: (id: string): string => `/introductions/${encodeURIComponent(id)}/result`,
  mute: (id: string): string => `/introductions/${encodeURIComponent(id)}/mute`,
  unmute: (id: string): string => `/introductions/${encodeURIComponent(id)}/unmute`,
} as const;

export const INTRODUCTION_LEDGER_LIMITS_V1 = { nameMax: 100, pairsMax: 100, entriesMax: 200, recipientRowsMax: 50 } as const;

// ── 解码的小工具 ─────────────────────────────────────────────────────────────────────

export type IntroductionLedgerReasonCodeV1 = 'invalid_type' | 'invalid_value' | 'missing_field' | 'unknown_field' | 'unsupported_schema_version';
export type IntroductionLedgerDecodeResultV1<T> = { ok: true; value: T } | { ok: false; reasonCode: IntroductionLedgerReasonCodeV1; field: string };

function fail(reasonCode: IntroductionLedgerReasonCodeV1, field: string): { ok: false; reasonCode: IntroductionLedgerReasonCodeV1; field: string } {
  return { ok: false, reasonCode, field };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function oneOf<T extends string>(list: readonly T[], value: unknown): value is T {
  return typeof value === 'string' && (list as readonly string[]).includes(value);
}

/** 只许这些键，缺一不可（`schemaVersion` 可省，写了就必须是 1）。 */
function strict(value: unknown, keys: readonly string[], field = '$'): IntroductionLedgerDecodeResultV1<Record<string, unknown>> {
  if (!isRecord(value)) return fail('invalid_type', field);
  for (const key of Object.keys(value)) {
    if (key !== 'schemaVersion' && !keys.includes(key)) return fail('unknown_field', field === '$' ? key : `${field}.${key}`);
  }
  if (value.schemaVersion !== undefined && value.schemaVersion !== INTRODUCTION_SCHEMA_VERSION_V1) return fail('unsupported_schema_version', 'schemaVersion');
  for (const key of keys) if (value[key] === undefined) return fail('missing_field', field === '$' ? key : `${field}.${key}`);
  return { ok: true, value };
}

function isoOrNull(value: unknown, field: string): IntroductionLedgerDecodeResultV1<string | null> {
  if (value === null) return { ok: true, value: null };
  if (typeof value !== 'string') return fail('invalid_type', field);
  if (value.length > 40 || Number.isNaN(Date.parse(value))) return fail('invalid_value', field);
  return { ok: true, value };
}

function nameOrNull(value: unknown, field: string): IntroductionLedgerDecodeResultV1<string | null> {
  if (value === null) return { ok: true, value: null };
  if (typeof value !== 'string') return fail('invalid_type', field);
  if (value.length === 0 || value.length > INTRODUCTION_LEDGER_LIMITS_V1.nameMax) return fail('invalid_value', field);
  return { ok: true, value };
}

function resultOrNull(value: unknown, field: string): IntroductionLedgerDecodeResultV1<IntroductionResultV1 | null> {
  if (value === null) return { ok: true, value: null };
  if (typeof value !== 'string') return fail('invalid_type', field);
  if (!oneOf(INTRODUCTION_RESULTS_V1, value)) return fail('invalid_value', field);
  return { ok: true, value };
}

// ── 账本 ────────────────────────────────────────────────────────────────────────────

export interface IntroductionLedgerEntryV1 {
  id: string;
  /** `sent`：我转出去的；`received`：别人转给我的。 */
  direction: 'sent' | 'received';
  status: IntroductionAnyStatusV1;
  createdAt: string;
  updatedAt: string;
  /** 我自己点的结果；没点是 null。 */
  myResult: IntroductionResultV1 | null;
  myResultAt: string | null;
  /** 对方点的结果：同一本账，两边都看得到。 */
  theirResult: IntroductionResultV1 | null;
  theirResultAt: string | null;
  canRecordResult: boolean;
  /** 我是否已静音这位转介人。只有 `received` 才可能是 true；`sent` 恒为 false，转出方看不到对方静音。 */
  muted: boolean;
}

export interface IntroductionLedgerPairV1 {
  /** 对方的显示名（同行的名字或分身名）；没有就是 null，页面写「一位同行」。 */
  counterpartName: string | null;
  /** 我转过去几位。 */
  sent: number;
  /** 对方转来几位。 */
  received: number;
  lastActivityAt: string;
  entries: IntroductionLedgerEntryV1[];
}

export interface IntroductionFollowUpV1 {
  kind: IntroductionFollowUpKindV1;
  introductionId: string;
  dueAt: string;
  counterpartName: string | null;
}

export interface IntroductionLedgerV1 {
  schemaVersion: typeof INTRODUCTION_SCHEMA_VERSION_V1;
  pairs: IntroductionLedgerPairV1[];
  followUps: IntroductionFollowUpV1[];
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ENTRY_KEYS = ['id', 'direction', 'status', 'createdAt', 'updatedAt', 'myResult', 'myResultAt', 'theirResult', 'theirResultAt', 'canRecordResult', 'muted'] as const;

export function decodeIntroductionLedgerEntryV1(value: unknown, field = 'entry'): IntroductionLedgerDecodeResultV1<IntroductionLedgerEntryV1> {
  const rec = strict(value, ENTRY_KEYS, field);
  if (rec.ok === false) return rec;
  const v = rec.value;
  if (typeof v.id !== 'string' || !UUID.test(v.id)) return fail('invalid_value', `${field}.id`);
  if (v.direction !== 'sent' && v.direction !== 'received') return fail('invalid_value', `${field}.direction`);
  if (typeof v.status !== 'string' || !oneOf(INTRODUCTION_ALL_STATUSES_V1, v.status)) return fail('invalid_value', `${field}.status`);
  const createdAt = isoOrNull(v.createdAt, `${field}.createdAt`);
  if (createdAt.ok === false) return createdAt;
  if (createdAt.value === null) return fail('invalid_value', `${field}.createdAt`);
  const updatedAt = isoOrNull(v.updatedAt, `${field}.updatedAt`);
  if (updatedAt.ok === false) return updatedAt;
  if (updatedAt.value === null) return fail('invalid_value', `${field}.updatedAt`);
  const myResult = resultOrNull(v.myResult, `${field}.myResult`);
  if (myResult.ok === false) return myResult;
  const myResultAt = isoOrNull(v.myResultAt, `${field}.myResultAt`);
  if (myResultAt.ok === false) return myResultAt;
  const theirResult = resultOrNull(v.theirResult, `${field}.theirResult`);
  if (theirResult.ok === false) return theirResult;
  const theirResultAt = isoOrNull(v.theirResultAt, `${field}.theirResultAt`);
  if (theirResultAt.ok === false) return theirResultAt;
  if (typeof v.canRecordResult !== 'boolean') return fail('invalid_type', `${field}.canRecordResult`);
  if (typeof v.muted !== 'boolean') return fail('invalid_type', `${field}.muted`);
  if (v.direction === 'sent' && v.muted === true) return fail('invalid_value', `${field}.muted`);
  return {
    ok: true,
    value: {
      id: v.id,
      direction: v.direction,
      status: v.status,
      createdAt: createdAt.value,
      updatedAt: updatedAt.value,
      myResult: myResult.value,
      myResultAt: myResultAt.value,
      theirResult: theirResult.value,
      theirResultAt: theirResultAt.value,
      canRecordResult: v.canRecordResult,
      muted: v.muted,
    },
  };
}

export function decodeIntroductionLedgerV1(value: unknown): IntroductionLedgerDecodeResultV1<IntroductionLedgerV1> {
  const rec = strict(value, ['pairs', 'followUps']);
  if (rec.ok === false) return rec;
  const { pairs: rawPairs, followUps: rawFollowUps } = rec.value;
  if (!Array.isArray(rawPairs)) return fail('invalid_type', 'pairs');
  if (!Array.isArray(rawFollowUps)) return fail('invalid_type', 'followUps');
  if (rawPairs.length > INTRODUCTION_LEDGER_LIMITS_V1.pairsMax) return fail('invalid_value', 'pairs');
  const pairs: IntroductionLedgerPairV1[] = [];
  for (let i = 0; i < rawPairs.length; i += 1) {
    const field = `pairs.${i}`;
    const pair = strict(rawPairs[i], ['counterpartName', 'sent', 'received', 'lastActivityAt', 'entries'], field);
    if (pair.ok === false) return pair;
    const p = pair.value;
    const counterpartName = nameOrNull(p.counterpartName, `${field}.counterpartName`);
    if (counterpartName.ok === false) return counterpartName;
    if (!Number.isInteger(p.sent) || (p.sent as number) < 0) return fail('invalid_value', `${field}.sent`);
    if (!Number.isInteger(p.received) || (p.received as number) < 0) return fail('invalid_value', `${field}.received`);
    const lastActivityAt = isoOrNull(p.lastActivityAt, `${field}.lastActivityAt`);
    if (lastActivityAt.ok === false) return lastActivityAt;
    if (lastActivityAt.value === null) return fail('invalid_value', `${field}.lastActivityAt`);
    if (!Array.isArray(p.entries)) return fail('invalid_type', `${field}.entries`);
    const entries: IntroductionLedgerEntryV1[] = [];
    for (let j = 0; j < p.entries.length; j += 1) {
      const entry = decodeIntroductionLedgerEntryV1(p.entries[j], `${field}.entries.${j}`);
      if (entry.ok === false) return entry;
      entries.push(entry.value);
    }
    pairs.push({ counterpartName: counterpartName.value, sent: p.sent as number, received: p.received as number, lastActivityAt: lastActivityAt.value, entries });
  }
  const followUps: IntroductionFollowUpV1[] = [];
  for (let i = 0; i < rawFollowUps.length; i += 1) {
    const field = `followUps.${i}`;
    // A kind this reader does not know (a later release added one) is dropped; it must not make the whole book unreadable.
    // Any other fault in a card, and any fault in a card of a known kind, still rejects the answer.
    const rawKind = isRecord(rawFollowUps[i]) ? (rawFollowUps[i] as Record<string, unknown>).kind : undefined;
    if (typeof rawKind === 'string' && !oneOf(INTRODUCTION_FOLLOW_UP_KINDS_V1, rawKind)) continue;
    const card = strict(rawFollowUps[i], ['kind', 'introductionId', 'dueAt', 'counterpartName'], field);
    if (card.ok === false) return card;
    const c = card.value;
    if (typeof c.kind !== 'string' || !oneOf(INTRODUCTION_FOLLOW_UP_KINDS_V1, c.kind)) return fail('invalid_value', `${field}.kind`);
    if (typeof c.introductionId !== 'string' || !UUID.test(c.introductionId)) return fail('invalid_value', `${field}.introductionId`);
    const dueAt = isoOrNull(c.dueAt, `${field}.dueAt`);
    if (dueAt.ok === false) return dueAt;
    if (dueAt.value === null) return fail('invalid_value', `${field}.dueAt`);
    const counterpartName = nameOrNull(c.counterpartName, `${field}.counterpartName`);
    if (counterpartName.ok === false) return counterpartName;
    followUps.push({ kind: c.kind, introductionId: c.introductionId, dueAt: dueAt.value, counterpartName: counterpartName.value });
  }
  return { ok: true, value: { schemaVersion: INTRODUCTION_SCHEMA_VERSION_V1, pairs, followUps } };
}

// ── 只给 B 的窄读取（C2-01，coord 10-31 决定②）───────────────────────────────────────

/**
 * B 接受之后，在自己的界面里记结果所需要的最少东西：这一条的 id、状态、B 自己点过的结果、能不能再点、B 接受的日子。
 * 没有对方点的结果，没有转介人的名字或 id，没有账本里的其他条，没有需求原话和联系方式。名单外的 B 靠它记结果；
 * 判断依据是「调用者是这条引荐的 B」，不是名单。
 */
export interface IntroductionRecipientRowV1 {
  id: string;
  status: IntroductionAnyStatusV1;
  /** B 接受的日子（ISO）；老数据没有就用创建时间。 */
  acceptedAt: string;
  myResult: IntroductionResultV1 | null;
  myResultAt: string | null;
  canRecordResult: boolean;
}

export interface IntroductionRecipientRowsV1 {
  schemaVersion: typeof INTRODUCTION_SCHEMA_VERSION_V1;
  items: IntroductionRecipientRowV1[];
}

const RECIPIENT_ROW_KEYS = ['id', 'status', 'acceptedAt', 'myResult', 'myResultAt', 'canRecordResult'] as const;

export function decodeIntroductionRecipientRowsV1(value: unknown): IntroductionLedgerDecodeResultV1<IntroductionRecipientRowsV1> {
  const rec = strict(value, ['items']);
  if (rec.ok === false) return rec;
  const rawItems = rec.value.items;
  if (!Array.isArray(rawItems)) return fail('invalid_type', 'items');
  if (rawItems.length > INTRODUCTION_LEDGER_LIMITS_V1.recipientRowsMax) return fail('invalid_value', 'items');
  const items: IntroductionRecipientRowV1[] = [];
  for (let i = 0; i < rawItems.length; i += 1) {
    const field = `items.${i}`;
    const row = strict(rawItems[i], RECIPIENT_ROW_KEYS, field);
    if (row.ok === false) return row;
    const v = row.value;
    if (typeof v.id !== 'string' || !UUID.test(v.id)) return fail('invalid_value', `${field}.id`);
    if (typeof v.status !== 'string' || !oneOf(INTRODUCTION_ALL_STATUSES_V1, v.status)) return fail('invalid_value', `${field}.status`);
    const acceptedAt = isoOrNull(v.acceptedAt, `${field}.acceptedAt`);
    if (acceptedAt.ok === false) return acceptedAt;
    if (acceptedAt.value === null) return fail('invalid_value', `${field}.acceptedAt`);
    const myResult = resultOrNull(v.myResult, `${field}.myResult`);
    if (myResult.ok === false) return myResult;
    const myResultAt = isoOrNull(v.myResultAt, `${field}.myResultAt`);
    if (myResultAt.ok === false) return myResultAt;
    if (typeof v.canRecordResult !== 'boolean') return fail('invalid_type', `${field}.canRecordResult`);
    items.push({ id: v.id, status: v.status, acceptedAt: acceptedAt.value, myResult: myResult.value, myResultAt: myResultAt.value, canRecordResult: v.canRecordResult });
  }
  return { ok: true, value: { schemaVersion: INTRODUCTION_SCHEMA_VERSION_V1, items } };
}

// ── 命令与回答 ───────────────────────────────────────────────────────────────────────

export interface IntroductionResultCommandV1 {
  schemaVersion: typeof INTRODUCTION_SCHEMA_VERSION_V1;
  result: IntroductionResultV1;
}

export function decodeIntroductionResultCommandV1(value: unknown): IntroductionLedgerDecodeResultV1<IntroductionResultCommandV1> {
  const rec = strict(value, ['result']);
  if (rec.ok === false) return rec;
  if (typeof rec.value.result !== 'string') return fail('invalid_type', 'result');
  if (!oneOf(INTRODUCTION_RESULTS_V1, rec.value.result)) return fail('invalid_value', 'result');
  return { ok: true, value: { schemaVersion: INTRODUCTION_SCHEMA_VERSION_V1, result: rec.value.result } };
}

export interface IntroductionMuteReplyV1 {
  schemaVersion: typeof INTRODUCTION_SCHEMA_VERSION_V1;
  muted: boolean;
}

export function decodeIntroductionMuteReplyV1(value: unknown): IntroductionLedgerDecodeResultV1<IntroductionMuteReplyV1> {
  const rec = strict(value, ['muted']);
  if (rec.ok === false) return rec;
  if (typeof rec.value.muted !== 'boolean') return fail('invalid_type', 'muted');
  return { ok: true, value: { schemaVersion: INTRODUCTION_SCHEMA_VERSION_V1, muted: rec.value.muted } };
}

