/**
 * 每个 Agent 的收入账本和提现 v0（L5 C3，backlog backend 9 / web 6；10-03）。
 *
 * - 收入来自已放款的订单（卖方所得）、完成的出租任务、引荐分成；提现走收款付款端口（`external-ports.ts`），
 *   卖方四样（收款、KYC、报税、条款和年龄）都过了才能提。
 * - 订单的卖方所得在放款时已经直接转给卖方（Connect；测试模式不动钱），所以只记收入、不进可提余额
 *   （`withdrawable: false`）；出租收入和引荐分成由平台托着，进可提余额。
 * - 账本只加不改：每笔收入一条贷记，提现一条借记；提现没成（端口没配、失败）就再记一条冲回，不删原记录。
 * - 金额一律是币种最小单位的十进制字符串；测试模式和真钱分开算，测试模式的余额永远提不到真实账户。
 * - 引荐分成 v0 只记账（后端），没有对外的分成页；比例有上限。
 * - 开关 `AGENT_INCOME_V0_ENABLED` 默认关（关着时路由一律 404）。
 */

export const AGENT_INCOME_SOURCES_V0 = ['order', 'device_rental', 'referral_share', 'withdrawal', 'withdrawal_reversal'] as const;
export type AgentIncomeSourceV0 = (typeof AGENT_INCOME_SOURCES_V0)[number];

export const AGENT_WITHDRAWAL_STATES_V0 = ['pending', 'paid', 'failed', 'not_configured'] as const;
export type AgentWithdrawalStateV0 = (typeof AGENT_WITHDRAWAL_STATES_V0)[number];

export const AGENT_INCOME_CURRENCIES_V0 = ['USD', 'SGD'] as const;
export type AgentIncomeCurrencyV0 = (typeof AGENT_INCOME_CURRENCIES_V0)[number];

/** 引荐分成的比例上限（基点）：10%。 */
export const REFERRAL_SHARE_MAX_BPS_V0 = 1000;
/** 单次提现的下限（最小单位）：10.00。 */
export const AGENT_WITHDRAWAL_MIN_MINOR_V0 = 1000;

export const AGENT_INCOME_ROUTES_V0 = {
  summary: 'GET /api/agent-income/:agentId',
  withdraw: 'POST /api/agent-income/:agentId/withdrawals',
  withdrawals: 'GET /api/agent-income/:agentId/withdrawals',
} as const;

export interface AgentIncomeEntryViewV0 {
  entryRef: string;
  source: AgentIncomeSourceV0;
  /** 订单号、出租任务号、提现号；不含买方或推荐人的账号。 */
  sourceRef: string;
  direction: 'credit' | 'debit';
  amountMinor: string;
  currency: AgentIncomeCurrencyV0;
  environment: 'test' | 'live';
  /** 这笔钱是不是由平台托着、能提现（订单所得放款时已直接转给卖方，为 false）。 */
  withdrawable: boolean;
  at: string;
}

export interface AgentIncomeBalanceV0 {
  currency: AgentIncomeCurrencyV0;
  environment: 'test' | 'live';
  /** 可提：能提现的贷记减借记（含冲回）。 */
  availableMinor: string;
  /** 累计收入：所有贷记（不含冲回），包括已直接放款的订单所得。 */
  earnedMinor: string;
}

export interface AgentIncomeSummaryV0 {
  schemaVersion: 0;
  agentId: string;
  balances: AgentIncomeBalanceV0[];
  /** 最近的记录，新的在前，最多 50 条。 */
  entries: AgentIncomeEntryViewV0[];
}

export interface AgentWithdrawalViewV0 {
  withdrawalRef: string;
  amountMinor: string;
  currency: AgentIncomeCurrencyV0;
  environment: 'test' | 'live';
  state: AgentWithdrawalStateV0;
  createdAt: string;
  updatedAt: string;
}

export interface AgentWithdrawRequestV0 {
  amountMinor: string;
  currency: AgentIncomeCurrencyV0;
  idempotencyKey: string;
}

const MINOR = /^(0|[1-9][0-9]{0,15})$/;
const IDEMPOTENCY_KEY = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/;
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/;
export const AGENT_INCOME_ENTRY_REF_PATTERN_V0 = /^aie_[0-9a-f]{32}$/;
export const AGENT_WITHDRAWAL_REF_PATTERN_V0 = /^awd_[0-9a-f]{32}$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function isOneOf<T extends string>(value: unknown, set: readonly T[]): value is T {
  return typeof value === 'string' && (set as readonly string[]).includes(value);
}

/** 服务端用：提现请求。金额要是正整数的十进制字符串，不低于下限。 */
export function validateAgentWithdrawRequestV0(value: unknown): { valid: boolean; errors: string[] } {
  if (!isRecord(value)) return { valid: false, errors: ['body: expected object'] };
  const errors: string[] = [];
  for (const key of Object.keys(value)) if (!['amountMinor', 'currency', 'idempotencyKey'].includes(key)) errors.push(`${key}: unexpected field`);
  if (typeof value.amountMinor !== 'string' || !MINOR.test(value.amountMinor) || BigInt(value.amountMinor) < BigInt(AGENT_WITHDRAWAL_MIN_MINOR_V0)) {
    errors.push(`amountMinor: decimal string, at least ${AGENT_WITHDRAWAL_MIN_MINOR_V0}`);
  }
  if (!isOneOf(value.currency, AGENT_INCOME_CURRENCIES_V0)) errors.push(`currency: one of ${AGENT_INCOME_CURRENCIES_V0.join(', ')}`);
  if (typeof value.idempotencyKey !== 'string' || !IDEMPOTENCY_KEY.test(value.idempotencyKey)) errors.push('idempotencyKey: invalid');
  return { valid: errors.length === 0, errors };
}

function decodeEntry(value: unknown): AgentIncomeEntryViewV0 | null {
  if (!isRecord(value)) return null;
  if (typeof value.entryRef !== 'string' || !AGENT_INCOME_ENTRY_REF_PATTERN_V0.test(value.entryRef)) return null;
  if (!isOneOf(value.source, AGENT_INCOME_SOURCES_V0) || typeof value.sourceRef !== 'string' || value.sourceRef.length === 0 || value.sourceRef.length > 64) return null;
  if (value.direction !== 'credit' && value.direction !== 'debit') return null;
  if (typeof value.amountMinor !== 'string' || !MINOR.test(value.amountMinor)) return null;
  if (!isOneOf(value.currency, AGENT_INCOME_CURRENCIES_V0) || (value.environment !== 'test' && value.environment !== 'live')) return null;
  if (typeof value.withdrawable !== 'boolean' || typeof value.at !== 'string' || !ISO.test(value.at)) return null;
  return { entryRef: value.entryRef, source: value.source, sourceRef: value.sourceRef, direction: value.direction, amountMinor: value.amountMinor, currency: value.currency, environment: value.environment, withdrawable: value.withdrawable, at: value.at };
}

/** 三端用：解码收入汇总。任何一项不对整份不收。 */
export function decodeAgentIncomeSummaryV0(value: unknown): AgentIncomeSummaryV0 | null {
  if (!isRecord(value) || value.schemaVersion !== 0 || typeof value.agentId !== 'string' || !Array.isArray(value.balances) || !Array.isArray(value.entries)) return null;
  const balances: AgentIncomeBalanceV0[] = [];
  for (const item of value.balances) {
    if (!isRecord(item) || !isOneOf(item.currency, AGENT_INCOME_CURRENCIES_V0) || (item.environment !== 'test' && item.environment !== 'live')) return null;
    if (typeof item.availableMinor !== 'string' || !/^-?(0|[1-9][0-9]{0,15})$/.test(item.availableMinor)) return null;
    if (typeof item.earnedMinor !== 'string' || !MINOR.test(item.earnedMinor)) return null;
    balances.push({ currency: item.currency, environment: item.environment, availableMinor: item.availableMinor, earnedMinor: item.earnedMinor });
  }
  const entries: AgentIncomeEntryViewV0[] = [];
  for (const item of value.entries) {
    const entry = decodeEntry(item);
    if (!entry) return null;
    entries.push(entry);
  }
  return { schemaVersion: 0, agentId: value.agentId, balances, entries };
}

/** 三端用：解码一笔提现。 */
export function decodeAgentWithdrawalViewV0(value: unknown): AgentWithdrawalViewV0 | null {
  if (!isRecord(value)) return null;
  if (typeof value.withdrawalRef !== 'string' || !AGENT_WITHDRAWAL_REF_PATTERN_V0.test(value.withdrawalRef)) return null;
  if (typeof value.amountMinor !== 'string' || !MINOR.test(value.amountMinor)) return null;
  if (!isOneOf(value.currency, AGENT_INCOME_CURRENCIES_V0) || (value.environment !== 'test' && value.environment !== 'live')) return null;
  if (!isOneOf(value.state, AGENT_WITHDRAWAL_STATES_V0)) return null;
  if (typeof value.createdAt !== 'string' || !ISO.test(value.createdAt) || typeof value.updatedAt !== 'string' || !ISO.test(value.updatedAt)) return null;
  return { withdrawalRef: value.withdrawalRef, amountMinor: value.amountMinor, currency: value.currency, environment: value.environment, state: value.state, createdAt: value.createdAt, updatedAt: value.updatedAt };
}

/** 引荐分成：按基点算、向下取整到最小单位；比例超上限或不是整数一律拒绝（返回 null）。 */
export function referralShareMinorV0(baseMinor: string, bps: number): string | null {
  if (!MINOR.test(baseMinor) || !Number.isInteger(bps) || bps < 1 || bps > REFERRAL_SHARE_MAX_BPS_V0) return null;
  return ((BigInt(baseMinor) * BigInt(bps)) / BigInt(10_000)).toString();
}
