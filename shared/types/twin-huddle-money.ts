/**
 * 「定了就把钱也办了」v0 的合同（设计 `.agents/tasks/twin-social-net/money-design.md`）。这一版只有测试模式。
 *
 * 商量单（`twin-huddle.ts`）定下来（`settled`）以后，发起人可以在上面建一张记账单：
 * - 两种：`deposit` 订位定金、`split` 分摊。规则一样，只是名字不同；同一张商量单每种最多一张开着或已记账的。
 * - 发起人填总额（1.00–10,000.00，币种和订单线一样只有两种），平台按人头平均分（`twinHuddleMoneySharesV0`）：
 *   除不尽的零头从发起人起每人多 1 分，加起来一定等于总额。
 * - 分的人：发起人，加上站内确认要来的朋友（发起人可以只选其中几位）。走链接的人没有账号，这一版不在单里。
 * - 发起人的那份建单时就算确认；其他人各自在自己手机上确认或者说不同意，一次为准。分身不替任何人确认钱。
 * - 所有人都确认 → `held`（已记账）。发起人可以取消还开着的单；到期没确认完 → `expired`。
 * - 只记账：不连支付、不产生订单、不动真钱。`l9-orders.ts` 的真钱开关任何一个开着时，建单和确认都被拒绝。
 * - 被约的人只看得到有自己一份的单：自己的金额、几个人分、几位确认了；看不到别人是谁、各自多少。
 * - 上限（文件末尾，设计 `money-cap-design.md`，另一个开关）：本人事先设了上限时，分身在上限内替他同意自己那份。
 *   那个开关关着时，上面「分身不替任何人确认钱」一字不改。
 *
 * 开关只认精确的 `'1'`，还要商量的开关开着。关着时路由 404，商量和原来一模一样。
 * 本文件只有常量、类型和纯函数：不读环境变量、不碰数据库。
 */
import { TWIN_HUDDLE_ID_PATTERN_V0, TWIN_HUDDLE_LIMITS_V0, type TwinHuddleDecodeResultV0, type TwinHuddleReasonCodeV0, type TwinHuddleStatusV0 } from './twin-huddle';

export const TWIN_HUDDLE_MONEY_SCHEMA_VERSION_V0 = 'agentrix.twin-huddle-money.v0' as const;
export const TWIN_HUDDLE_MONEY_FLAG_V0 = 'TWIN_HUDDLE_MONEY_V0_ENABLED';
export const TWIN_HUDDLE_MONEY_MOBILE_FLAG_V0 = 'EXPO_PUBLIC_TWIN_HUDDLE_MONEY';

export const TWIN_HUDDLE_MONEY_LIMITS_V0 = {
  /** 总额下限：1.00（最小单位，两位小数）。 */
  totalMinMinor: 100,
  /** 总额上限：10,000.00。 */
  totalMaxMinor: 1_000_000,
  /** 建单以后多久没确认完就过期。 */
  confirmWindowMs: 72 * 60 * 60 * 1000,
  /** 一张商量单上总共最多建几张（取消的、过期的也算）。 */
  perHuddleMax: 6,
} as const;

const L = TWIN_HUDDLE_MONEY_LIMITS_V0;

/** 一张单最多几个人分：发起人加上全部被约的人。 */
export const TWIN_HUDDLE_MONEY_HEADCOUNT_MAX_V0 = 1 + TWIN_HUDDLE_LIMITS_V0.friendsMax;

export const TWIN_HUDDLE_MONEY_KINDS_V0 = ['deposit', 'split'] as const;
export type TwinHuddleMoneyKindV0 = (typeof TWIN_HUDDLE_MONEY_KINDS_V0)[number];

/** 和订单线（`order-escrow.ts` 的 `ORDER_OFFER_CURRENCIES`）同一份清单。 */
export const TWIN_HUDDLE_MONEY_CURRENCIES_V0 = ['USD', 'SGD'] as const;
export type TwinHuddleMoneyCurrencyV0 = (typeof TWIN_HUDDLE_MONEY_CURRENCIES_V0)[number];

export const TWIN_HUDDLE_BILL_STATUSES_V0 = ['open', 'held', 'cancelled', 'expired'] as const;
export type TwinHuddleBillStatusV0 = (typeof TWIN_HUDDLE_BILL_STATUSES_V0)[number];

export const TWIN_HUDDLE_SHARE_STATUSES_V0 = ['pending', 'confirmed', 'declined'] as const;
export type TwinHuddleShareStatusV0 = (typeof TWIN_HUDDLE_SHARE_STATUSES_V0)[number];

/** 本人对自己那份的回答。 */
export const TWIN_HUDDLE_MONEY_DECISIONS_V0 = ['confirmed', 'declined'] as const;
export type TwinHuddleMoneyDecisionV0 = (typeof TWIN_HUDDLE_MONEY_DECISIONS_V0)[number];

export const TWIN_HUDDLE_MONEY_ROLES_V0 = ['initiator', 'invited'] as const;
export type TwinHuddleMoneyRoleV0 = (typeof TWIN_HUDDLE_MONEY_ROLES_V0)[number];

/** 请求本身没问题、但现在做不了的原因（409 的 `code`）。 */
export const TWIN_HUDDLE_MONEY_CONFLICT_CODES_V0 = ['not_settled', 'nobody_to_split', 'unknown_ref', 'bill_exists', 'bill_limit', 'bill_closed', 'already_decided'] as const;
export type TwinHuddleMoneyConflictCodeV0 = (typeof TWIN_HUDDLE_MONEY_CONFLICT_CODES_V0)[number];

/** 真钱开关开着时，建单和确认回 503，`code` 是这个。 */
export const TWIN_HUDDLE_MONEY_TEST_ONLY_CODE_V0 = 'test_mode_only' as const;

/**
 * 站内通知的固定句式。不带金额、不带任何人的名字：金额只在本人打开商量单时看得到。
 * `ask` 发给单上每一位等确认的人；`held`、`declined` 发给发起人；`capped` 发给分身在上限内替他同意了的人（这时不发 `ask`）。
 */
export const TWIN_HUDDLE_MONEY_FIXED_PHRASES_V0 = {
  ask: { zh: '有一张记账单等你确认自己那份（测试模式，不会扣钱）。', en: 'A bookkeeping sheet is waiting for you to confirm your part (test mode, no money moves).' },
  held: { zh: '记账单上每个人都确认了（测试模式，没有扣钱）。', en: 'Everyone confirmed their part of the sheet (test mode, no money moved).' },
  declined: { zh: '记账单上有人不同意自己那份。', en: 'Someone did not agree to their part of the sheet.' },
  capped: {
    zh: '分身在你设的上限内替你同意了一份记账单（测试模式，没有扣钱）。',
    en: 'Your twin agreed to your part of a bookkeeping sheet within the limit you set (test mode, no money moved).',
  },
} as const;

/** 金额：最小单位的十进制字符串、币种、两位小数（和 `trust-loop-primitives.ts` 的 `Money` 同形）。 */
export interface TwinHuddleMoneyAmountV0 {
  amountMinor: string;
  currency: TwinHuddleMoneyCurrencyV0;
  decimals: 2;
}

/** 钱的入口开不开：只看商量单的阶段。定下来以后才有。 */
export function twinHuddleMoneyOpenV0(status: TwinHuddleStatusV0): boolean {
  return status === 'settled';
}

/**
 * 把总额平均分给 `headcount` 个人，返回每个人的最小单位数，顺序就是名单的顺序（发起人排第一）。
 * 除不尽的零头从第一个人起每人多 1：加起来一定等于总额，任何两个人最多差 1。参数不合规矩时返回空数组。
 */
export function twinHuddleMoneySharesV0(totalMinor: number, headcount: number): number[] {
  if (!Number.isInteger(totalMinor) || !Number.isInteger(headcount)) return [];
  if (headcount < 1 || headcount > TWIN_HUDDLE_MONEY_HEADCOUNT_MAX_V0) return [];
  if (totalMinor < L.totalMinMinor || totalMinor > L.totalMaxMinor) return [];
  const base = Math.floor(totalMinor / headcount);
  const extra = totalMinor - base * headcount;
  return Array.from({ length: headcount }, (_, index) => base + (index < extra ? 1 : 0));
}

/**
 * 把人打的金额（「300」「300.5」「300.50」，全角数字和全角小数点也认）变成最小单位的字符串。
 * 不是这种写法、或者不在上下限之内，返回 null。
 */
export function twinHuddleMoneyParseAmountV0(text: string): string | null {
  if (typeof text !== 'string' || text.length > 40) return null;
  const match = /^([0-9]{1,7})(?:\.([0-9]{1,2}))?$/.exec(text.normalize('NFKC').trim());
  if (!match) return null;
  const minor = Number(match[1]) * 100 + Number((match[2] ?? '').padEnd(2, '0'));
  if (minor < L.totalMinMinor || minor > L.totalMaxMinor) return null;
  return String(minor);
}

/** 给人看的金额：`300.00 USD`。读不出来的数按 0 显示。 */
export function twinHuddleMoneyFormatV0(amountMinor: string | number, currency: string): string {
  const value = typeof amountMinor === 'number' ? amountMinor : /^[0-9]{1,10}$/.test(amountMinor) ? Number(amountMinor) : 0;
  const minor = Number.isInteger(value) && value >= 0 ? value : 0;
  return `${Math.floor(minor / 100)}.${String(minor % 100).padStart(2, '0')} ${currency}`;
}

type Failure = { ok: false; reasonCode: TwinHuddleReasonCodeV0; field: string };

/** 和 `twin-huddle.ts` 里朋友 ref 的写法一样。 */
const REF = /^[A-Za-z0-9][A-Za-z0-9:_.-]{0,127}$/;
const GUEST_REF_PREFIX = 'guest:';
const AMOUNT_MINOR = /^[1-9][0-9]{0,9}$/;

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

function decodeAmount(value: unknown, field: string): TwinHuddleDecodeResultV0<TwinHuddleMoneyAmountV0> {
  const keys = ['amountMinor', 'currency', 'decimals'];
  const rec = strict(value, field, keys, keys);
  if (rec.ok === false) return rec;
  const { amountMinor, currency, decimals } = rec.value;
  if (typeof amountMinor !== 'string') return fail('invalid_type', `${field}.amountMinor`);
  if (typeof currency !== 'string') return fail('invalid_type', `${field}.currency`);
  if (!isOneOf(TWIN_HUDDLE_MONEY_CURRENCIES_V0, currency)) return fail('invalid_value', `${field}.currency`);
  if (decimals !== 2) return fail(typeof decimals === 'number' ? 'invalid_value' : 'invalid_type', `${field}.decimals`);
  if (!AMOUNT_MINOR.test(amountMinor)) return fail('invalid_value', `${field}.amountMinor`);
  const minor = Number(amountMinor);
  if (minor < L.totalMinMinor || minor > L.totalMaxMinor) return fail('invalid_value', `${field}.amountMinor`);
  return { ok: true, value: { amountMinor, currency, decimals: 2 } };
}

function decodeRefs(value: unknown, field: string): TwinHuddleDecodeResultV0<string[]> {
  if (!Array.isArray(value)) return fail('invalid_type', field);
  if (value.length === 0) return fail('invalid_value', field);
  if (value.length > TWIN_HUDDLE_LIMITS_V0.friendsMax) return fail('too_long', field);
  const refs: string[] = [];
  for (const [index, item] of value.entries()) {
    const at = `${field}[${index}]`;
    if (typeof item !== 'string') return fail('invalid_type', at);
    // 走链接的名额没有账号，不能分。
    if (!REF.test(item) || item.startsWith(GUEST_REF_PREFIX) || refs.includes(item)) return fail('invalid_value', at);
    refs.push(item);
  }
  return { ok: true, value: refs };
}

export interface TwinHuddleBillCreateV0 {
  kind: TwinHuddleMoneyKindV0;
  /** 总额。 */
  amount: TwinHuddleMoneyAmountV0;
  /** 和发起人一起分的朋友（发起人自己名单里的 ref）。不填就是站内确认要来的每一位。 */
  refs?: string[];
}

/** `POST …/money` 的请求：`{ kind, amount, refs? }`。 */
export function decodeTwinHuddleBillCreateV0(value: unknown, field = 'body'): TwinHuddleDecodeResultV0<TwinHuddleBillCreateV0> {
  const rec = strict(value, field, ['kind', 'amount', 'refs'], ['kind', 'amount']);
  if (rec.ok === false) return rec;
  if (typeof rec.value.kind !== 'string') return fail('invalid_type', `${field}.kind`);
  if (!isOneOf(TWIN_HUDDLE_MONEY_KINDS_V0, rec.value.kind)) return fail('invalid_value', `${field}.kind`);
  const amount = decodeAmount(rec.value.amount, `${field}.amount`);
  if (amount.ok === false) return amount;
  if (rec.value.refs === undefined) return { ok: true, value: { kind: rec.value.kind, amount: amount.value } };
  const refs = decodeRefs(rec.value.refs, `${field}.refs`);
  if (refs.ok === false) return refs;
  return { ok: true, value: { kind: rec.value.kind, amount: amount.value, refs: refs.value } };
}

/** `PUT …/money/:billId/mine` 的请求：`{ decision }`，确认我那份，或者说不同意。 */
export function decodeTwinHuddleBillDecisionV0(value: unknown, field = 'body'): TwinHuddleDecodeResultV0<{ decision: TwinHuddleMoneyDecisionV0 }> {
  const rec = strict(value, field, ['decision'], ['decision']);
  if (rec.ok === false) return rec;
  if (typeof rec.value.decision !== 'string') return fail('invalid_type', `${field}.decision`);
  if (!isOneOf(TWIN_HUDDLE_MONEY_DECISIONS_V0, rec.value.decision)) return fail('invalid_value', `${field}.decision`);
  return { ok: true, value: { decision: rec.value.decision } };
}

// ── 视图 ─────────────────────────────────────────────────────────────────────────

/** 单上的一份，只给发起人看。 */
export interface TwinHuddleBillShareV0 {
  /** 发起人自己名单里的 ref；发起人自己那份是 null。 */
  ref: string | null;
  amountMinor: string;
  status: TwinHuddleShareStatusV0;
}

export interface TwinHuddleBillV0 {
  id: string;
  kind: TwinHuddleMoneyKindV0;
  status: TwinHuddleBillStatusV0;
  total: TwinHuddleMoneyAmountV0;
  /** 几个人分。 */
  headcount: number;
  confirmedCount: number;
  declinedCount: number;
  /** 我的那份；这张单里没有我是 null。`byCap`：这一份是分身在我设的上限内替我同意的，只有是的时候才带。 */
  mine: { amountMinor: string; status: TwinHuddleShareStatusV0; byCap?: true } | null;
  /** 每个人的那份，只给发起人；被约的人拿到的是 null。 */
  shares: TwinHuddleBillShareV0[] | null;
  /** 到这个时间还没确认完就过期。 */
  expiresAt: string;
  createdAt: string;
  /** 我那份还等着我回答，而且现在答得了。 */
  canDecide: boolean;
  /** 发起人可以取消：单还开着。 */
  canCancel: boolean;
  /** 分身替我同意的那份，现在还能改成不同意：单还开着。只有能改的时候才带。 */
  canRevoke?: true;
}

export interface TwinHuddleMoneyViewV0 {
  schemaVersion: typeof TWIN_HUDDLE_MONEY_SCHEMA_VERSION_V0;
  huddleId: string;
  role: TwinHuddleMoneyRoleV0;
  /** 这一版只有测试模式：只记账，不扣钱。永远是 true。 */
  testMode: true;
  /** 现在能不能建单和确认。真钱开关开着时是 false。 */
  available: boolean;
  /** 只给发起人：现在能建哪几种。被约的人拿到的是空数组。 */
  canCreate: TwinHuddleMoneyKindV0[];
  /** 只给发起人：可以一起分的站内朋友（确认要来的），他自己名单里的 ref。 */
  eligibleRefs: string[];
  /** 只给发起人：确认要来、但走链接没有账号、所以不在单里的有几位。 */
  guestsLeftOut: number;
  /** 从新到旧。被约的人只看到有自己一份的。 */
  bills: TwinHuddleBillV0[];
}

/*
 * 下面的 decode…V0 只用来读服务器的回答：认识的字段逐个检查，多出来的字段不管，外面包一层 `{ data: … }` 也认。
 * 对不上就返回 null，调用方按「读不出来」处理。
 */

const MINOR = /^[0-9]{1,10}$/;

function isCount(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0;
}

function isTime(value: unknown): value is string {
  return typeof value === 'string' && value.length <= 40 && Number.isFinite(Date.parse(value));
}

function readAmount(value: unknown): TwinHuddleMoneyAmountV0 | null {
  if (!isRecord(value)) return null;
  const { amountMinor, currency, decimals } = value;
  if (typeof amountMinor !== 'string' || !MINOR.test(amountMinor) || !isOneOf(TWIN_HUDDLE_MONEY_CURRENCIES_V0, currency) || decimals !== 2) return null;
  return { amountMinor, currency, decimals: 2 };
}

function readShare(value: unknown): TwinHuddleBillShareV0 | null {
  if (!isRecord(value)) return null;
  const { ref, amountMinor, status } = value;
  if (ref !== null && typeof ref !== 'string') return null;
  if (typeof amountMinor !== 'string' || !MINOR.test(amountMinor) || !isOneOf(TWIN_HUDDLE_SHARE_STATUSES_V0, status)) return null;
  return { ref: typeof ref === 'string' ? ref : null, amountMinor, status };
}

function readBill(value: unknown): TwinHuddleBillV0 | null {
  if (!isRecord(value)) return null;
  const { id, kind, status, headcount, confirmedCount, declinedCount, expiresAt, createdAt, canDecide, canCancel } = value;
  if (typeof id !== 'string' || !TWIN_HUDDLE_ID_PATTERN_V0.test(id)) return null;
  if (!isOneOf(TWIN_HUDDLE_MONEY_KINDS_V0, kind) || !isOneOf(TWIN_HUDDLE_BILL_STATUSES_V0, status)) return null;
  const total = readAmount(value.total);
  if (total === null) return null;
  if (!isCount(headcount) || headcount < 1 || headcount > TWIN_HUDDLE_MONEY_HEADCOUNT_MAX_V0) return null;
  if (!isCount(confirmedCount) || !isCount(declinedCount) || confirmedCount + declinedCount > headcount) return null;
  if (!isTime(expiresAt) || !isTime(createdAt) || typeof canDecide !== 'boolean' || typeof canCancel !== 'boolean') return null;
  let mine: TwinHuddleBillV0['mine'] = null;
  if (value.mine !== null) {
    if (!isRecord(value.mine)) return null;
    const { amountMinor, status: mineStatus, byCap } = value.mine;
    if (typeof amountMinor !== 'string' || !MINOR.test(amountMinor) || !isOneOf(TWIN_HUDDLE_SHARE_STATUSES_V0, mineStatus)) return null;
    if (byCap !== undefined && typeof byCap !== 'boolean') return null;
    // 分身只会替人同意：别的状态上带着这个标记，当读不出来。
    if (byCap === true && mineStatus !== 'confirmed') return null;
    mine = byCap === true ? { amountMinor, status: mineStatus, byCap: true } : { amountMinor, status: mineStatus };
  }
  let shares: TwinHuddleBillShareV0[] | null = null;
  if (value.shares !== null) {
    if (!Array.isArray(value.shares) || value.shares.length !== headcount) return null;
    shares = [];
    for (const item of value.shares) {
      const share = readShare(item);
      if (share === null) return null;
      shares.push(share);
    }
  }
  // 没有自己一份、或者自己那份已经答过的人，不会被叫去答。
  if (canDecide && mine?.status !== 'pending') return null;
  const { canRevoke } = value;
  if (canRevoke !== undefined && typeof canRevoke !== 'boolean') return null;
  // 能改的只有分身替我同意的那份，而且单还开着。
  if (canRevoke === true && (mine?.byCap !== true || status !== 'open')) return null;
  const bill: TwinHuddleBillV0 = { id, kind, status, total, headcount, confirmedCount, declinedCount, mine, shares, expiresAt, createdAt, canDecide, canCancel };
  return canRevoke === true ? { ...bill, canRevoke: true } : bill;
}

export function decodeTwinHuddleMoneyViewV0(body: unknown): TwinHuddleMoneyViewV0 | null {
  const value = isRecord(body) && isRecord(body.data) && body.bills === undefined ? body.data : body;
  if (!isRecord(value)) return null;
  const { huddleId, role, available, guestsLeftOut } = value;
  if (value.schemaVersion !== TWIN_HUDDLE_MONEY_SCHEMA_VERSION_V0 || typeof huddleId !== 'string' || !isOneOf(TWIN_HUDDLE_MONEY_ROLES_V0, role)) return null;
  // 不是测试模式的回答一律当读不出来：这一版的页面只会说「不会扣钱」。
  if (value.testMode !== true || typeof available !== 'boolean' || !isCount(guestsLeftOut)) return null;
  if (!Array.isArray(value.canCreate) || !Array.isArray(value.eligibleRefs) || !Array.isArray(value.bills)) return null;
  const canCreate: TwinHuddleMoneyKindV0[] = [];
  for (const item of value.canCreate) {
    if (!isOneOf(TWIN_HUDDLE_MONEY_KINDS_V0, item) || canCreate.includes(item)) return null;
    canCreate.push(item);
  }
  const eligibleRefs: string[] = [];
  for (const item of value.eligibleRefs) {
    if (typeof item !== 'string') return null;
    eligibleRefs.push(item);
  }
  const bills: TwinHuddleBillV0[] = [];
  for (const item of value.bills) {
    const bill = readBill(item);
    if (bill === null) return null;
    // 每个人的那份只给发起人。
    if (role === 'invited' && bill.shares !== null) return null;
    bills.push(bill);
  }
  return { schemaVersion: TWIN_HUDDLE_MONEY_SCHEMA_VERSION_V0, huddleId, role, testMode: true, available, canCreate, eligibleRefs, guestsLeftOut, bills };
}

// ── 上限：分身在本人给的上限内替本人同意自己那份（设计 `money-cap-design.md`） ────────────────────────

/*
 * 每个人可以给自己设一个上限：以后朋友开的记账单里，自己那份不超过上限，分身直接替他同意。和记账单一样只有测试模式：
 * 只记账，不扣钱。这不是代付：没有钱的来源，没有扣款。
 * - 只在建单的那一刻用（`twinHuddleMoneyCapCoversV0`）：币种一样、这一份不超过每笔上限、加上最近 7 天分身已经替他同意的
 *   （只算还开着和已记账的单）不超过每周上限。有一条不满足，这一份照旧等本人。
 * - 分身只替人同意，不替人说不；设上限之前已经在等的单不补答。
 * - 分身替的那份，在单记账之前本人可以改成不同意（`canRevoke`），改了就不能再改。
 * - 上限只有本人看得到。发起人看到的还是「同意」，分不出是本人还是分身。
 * 开关只认精确的 `'1'`，还要记账单和商量的开关开着。关着时三个路由 404，建单不看任何人的上限。
 */
export const TWIN_HUDDLE_MONEY_CAP_SCHEMA_VERSION_V0 = 'agentrix.twin-huddle-money-cap.v0' as const;
export const TWIN_HUDDLE_MONEY_CAP_FLAG_V0 = 'TWIN_HUDDLE_MONEY_CAP_V0_ENABLED';
export const TWIN_HUDDLE_MONEY_CAP_MOBILE_FLAG_V0 = 'EXPO_PUBLIC_TWIN_HUDDLE_MONEY_CAP';

export const TWIN_HUDDLE_MONEY_CAP_LIMITS_V0 = {
  /** 每笔上限最少 1.00。 */
  perBillMinMinor: 100,
  /** 每笔上限最多 500.00。 */
  perBillMaxMinor: 50_000,
  /** 每周累计上限最多 2,000.00；不能低于每笔上限。 */
  weeklyMaxMinor: 200_000,
  /** 「每周」是往回数 7 天。 */
  windowMs: 7 * 24 * 60 * 60 * 1000,
} as const;

const C = TWIN_HUDDLE_MONEY_CAP_LIMITS_V0;

/** 一个人的上限。金额是最小单位的十进制字符串。 */
export interface TwinHuddleMoneyCapV0 {
  currency: TwinHuddleMoneyCurrencyV0;
  /** 每笔上限：一张单上我那份最多这么多。 */
  perBillMinor: string;
  /** 每周累计上限：7 天里分身替我同意的加起来最多这么多。 */
  weeklyMinor: string;
}

/** `PUT /twin-huddle/money-cap` 的请求：`{ currency, perBillMinor, weeklyMinor }`。 */
export function decodeTwinHuddleMoneyCapV0(value: unknown, field = 'body'): TwinHuddleDecodeResultV0<TwinHuddleMoneyCapV0> {
  const keys = ['currency', 'perBillMinor', 'weeklyMinor'];
  const rec = strict(value, field, keys, keys);
  if (rec.ok === false) return rec;
  const { currency, perBillMinor, weeklyMinor } = rec.value;
  if (typeof currency !== 'string') return fail('invalid_type', `${field}.currency`);
  if (!isOneOf(TWIN_HUDDLE_MONEY_CURRENCIES_V0, currency)) return fail('invalid_value', `${field}.currency`);
  if (typeof perBillMinor !== 'string') return fail('invalid_type', `${field}.perBillMinor`);
  if (typeof weeklyMinor !== 'string') return fail('invalid_type', `${field}.weeklyMinor`);
  if (!AMOUNT_MINOR.test(perBillMinor)) return fail('invalid_value', `${field}.perBillMinor`);
  if (!AMOUNT_MINOR.test(weeklyMinor)) return fail('invalid_value', `${field}.weeklyMinor`);
  const perBill = Number(perBillMinor);
  const weekly = Number(weeklyMinor);
  if (perBill < C.perBillMinMinor || perBill > C.perBillMaxMinor) return fail('invalid_value', `${field}.perBillMinor`);
  if (weekly < perBill || weekly > C.weeklyMaxMinor) return fail('invalid_value', `${field}.weeklyMinor`);
  return { ok: true, value: { currency, perBillMinor, weeklyMinor } };
}

/**
 * 建单时这一份分身能不能替本人同意。`usedMinor` 是最近 7 天分身已经替这个人同意的总数（同一币种，只算还开着和
 * 已记账的单）。没设上限、币种不一样、任何一个数不合规矩，都是不能。
 */
export function twinHuddleMoneyCapCoversV0(input: {
  cap: { currency: string; perBillMinor: number; weeklyMinor: number } | null;
  currency: string;
  amountMinor: number;
  usedMinor: number;
}): boolean {
  const { cap, currency, amountMinor, usedMinor } = input;
  if (cap === null || cap.currency !== currency) return false;
  if (![cap.perBillMinor, cap.weeklyMinor, amountMinor, usedMinor].every((n) => Number.isInteger(n) && n >= 0)) return false;
  if (amountMinor < 1 || cap.perBillMinor < C.perBillMinMinor || cap.perBillMinor > C.perBillMaxMinor || cap.weeklyMinor > C.weeklyMaxMinor) return false;
  return amountMinor <= cap.perBillMinor && usedMinor + amountMinor <= cap.weeklyMinor;
}

export interface TwinHuddleMoneyCapViewV0 {
  schemaVersion: typeof TWIN_HUDDLE_MONEY_CAP_SCHEMA_VERSION_V0;
  /** 这一版只有测试模式：只记账，不扣钱。永远是 true。 */
  testMode: true;
  /** 现在能不能设上限。真钱开关开着时是 false；关掉上限不受影响。 */
  available: boolean;
  /** 我设的上限；没设是 null。 */
  cap: TwinHuddleMoneyCapV0 | null;
  /** 最近 7 天分身已经替我同意了多少（我设的那个币种）。没设上限时是 "0"。 */
  usedMinor: string;
}

/** 读服务器的回答：多出来的字段不管，外面包一层 `{ data: … }` 也认；对不上返回 null。 */
export function decodeTwinHuddleMoneyCapViewV0(body: unknown): TwinHuddleMoneyCapViewV0 | null {
  const value = isRecord(body) && isRecord(body.data) && body.usedMinor === undefined ? body.data : body;
  if (!isRecord(value)) return null;
  const { available, usedMinor } = value;
  // 不是测试模式的回答一律当读不出来：这一版的页面只会说「不会扣钱」。
  if (value.schemaVersion !== TWIN_HUDDLE_MONEY_CAP_SCHEMA_VERSION_V0 || value.testMode !== true || typeof available !== 'boolean') return null;
  if (typeof usedMinor !== 'string' || !MINOR.test(usedMinor)) return null;
  const base = { schemaVersion: TWIN_HUDDLE_MONEY_CAP_SCHEMA_VERSION_V0, testMode: true as const, available, usedMinor };
  if (value.cap === null) return { ...base, cap: null };
  if (!isRecord(value.cap)) return null;
  const cap = decodeTwinHuddleMoneyCapV0({ currency: value.cap.currency, perBillMinor: value.cap.perBillMinor, weeklyMinor: value.cap.weeklyMinor }, 'cap');
  if (cap.ok === false) return null;
  return { ...base, cap: cap.value };
}
