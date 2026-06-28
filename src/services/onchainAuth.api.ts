/**
 * onchainAuth.api — 萌宠链上授权 client（Agent Protocol Stack 需求 6.1 / 6.2）。
 *
 * 用户给萌宠（其绑定的 AgentAccount）授权链上代付额度（AP2 mandate：
 * maxAmount / allowedMerchants / allowedCategories）、查看/撤销已授权额度，
 * 并查看受 OnchainFenceGuard 守卫的链上动作记录（OnchainActionRecord）。
 *
 * 后端落点（已审计）：
 *   - AP2 mandate 业务逻辑在 `ucp.service`（createMandate / listMandates /
 *     verifyMandate / useMandate / revokeMandate）+ MCP 工具（ucp_create_mandate
 *     等），但**尚无面向用户的 REST HTTP 端点**。
 *   - 链上动作权威记录在 `OnchainActionRecord`（onchain_action_records 表），
 *     由 `OnchainFenceGuard` 写入，**亦无 REST 列表端点**。
 *
 * 本 client 按 pet-earnings 既有约定（user 维度，服务端从 JWT 解析用户的萌宠
 * AgentAccount）调用约定端点 `/v1/pet-earnings/onchain/*`；端点上线前以 graceful
 * fallback 返回空集 / 抛出可读错误，避免界面崩溃。后端补端点见任务 22.1（见
 * BACKEND_GAP 注释）。
 */
import { apiFetch } from './api';

// ── 类型 ─────────────────────────────────────────────────────

/** 萌宠链上代付授权（AP2 mandate）面向移动端的归一化视图。 */
export interface OnchainMandate {
  id: string;
  /** 授权额度上限（单笔上限 / mandate 总额，结算币种计价）。 */
  maxAmount: number;
  currency: string;
  /** 已用额度。 */
  usedAmount: number;
  /** 已发生的交易笔数。 */
  transactionCount: number;
  /** 允许的商户（空数组 = 不限商户）。 */
  allowedMerchants: string[];
  /** 允许的品类（空数组 = 不限品类）。 */
  allowedCategories: string[];
  status: 'active' | 'expired' | 'revoked' | 'exhausted';
  validUntil?: string;
  createdAt?: string;
}

/** spendingLimits 围栏视图（与 AP2 mandate 构成双围栏，需求 6.2）。 */
export interface SpendingLimitsView {
  singleTxLimit?: number;
  dailyLimit?: number;
  usedTodayAmount?: number;
  currency?: string;
}

/** 链上授权总览（mandate 列表 + spendingLimits 围栏）。 */
export interface OnchainAuthOverview {
  agentAccountId?: string;
  enabled: boolean;
  mandates: OnchainMandate[];
  spendingLimits?: SpendingLimitsView;
}

/** 链上动作记录（OnchainActionRecord）面向移动端的归一化视图。 */
export interface OnchainActionRecordView {
  id: string;
  toolName: string; // wallet/transfer | wallet/sign | chain/solana-call
  chain: string; // evm | solana | bitcoin
  amount: number;
  currency: string;
  status: 'pending' | 'settled' | 'failed';
  txHash?: string;
  mandateId?: string;
  createdAt?: number | string;
}

export interface CreateMandateInput {
  maxAmount: number;
  currency?: string;
  allowedMerchants?: string[];
  allowedCategories?: string[];
  /** ISO 日期；不传则后端默认 30 天。 */
  validUntil?: string;
}

// ── 归一化（兼容后端 snake_case / camelCase 两种序列化）─────────

function num(v: any, fallback = 0): number {
  const n = typeof v === 'string' ? Number(v) : v;
  return Number.isFinite(n) ? n : fallback;
}

function arr(v: any): string[] {
  return Array.isArray(v) ? v.map((x) => String(x)) : [];
}

function normalizeMandate(m: any): OnchainMandate {
  return {
    id: String(m?.id ?? ''),
    maxAmount: num(m?.maxAmount ?? m?.max_amount),
    currency: String(m?.currency ?? 'USDT'),
    usedAmount: num(m?.usedAmount ?? m?.used_amount),
    transactionCount: num(m?.transactionCount ?? m?.transaction_count),
    allowedMerchants: arr(m?.allowedMerchants ?? m?.allowed_merchants),
    allowedCategories: arr(m?.allowedCategories ?? m?.allowed_categories),
    status: (m?.status ?? 'active') as OnchainMandate['status'],
    validUntil: m?.validUntil ?? m?.valid_until ?? undefined,
    createdAt: m?.createdAt ?? m?.created_at ?? undefined,
  };
}

function normalizeSpendingLimits(s: any): SpendingLimitsView | undefined {
  if (!s || typeof s !== 'object') return undefined;
  return {
    singleTxLimit: s.singleTxLimit ?? s.single_tx_limit,
    dailyLimit: s.dailyLimit ?? s.daily_limit,
    usedTodayAmount: s.usedTodayAmount ?? s.used_today_amount,
    currency: s.currency,
  };
}

function normalizeAction(a: any): OnchainActionRecordView {
  return {
    id: String(a?.id ?? ''),
    toolName: String(a?.toolName ?? a?.tool_name ?? ''),
    chain: String(a?.chain ?? ''),
    amount: num(a?.amount),
    currency: String(a?.currency ?? ''),
    status: (a?.status ?? 'pending') as OnchainActionRecordView['status'],
    txHash: a?.txHash ?? a?.tx_hash ?? undefined,
    mandateId: a?.mandateId ?? a?.mandate_id ?? undefined,
    createdAt: a?.createdAt ?? a?.created_at ?? undefined,
  };
}

// ── API ──────────────────────────────────────────────────────

const BASE = '/v1/pet-earnings/onchain';

/**
 * 拉取链上授权总览（mandate 列表 + spendingLimits 围栏）。
 * BACKEND_GAP(任务 22.1)：GET /v1/pet-earnings/onchain/mandates 尚未实现 →
 * 端点缺失时静默降级为「未授权 / 空列表」，界面据此展示引导态。
 */
export async function fetchOnchainAuthOverview(): Promise<OnchainAuthOverview> {
  try {
    const raw = await apiFetch<any>(`${BASE}/mandates`);
    // 兼容两种返回形：数组 或 { mandates, spendingLimits, agentAccountId, enabled }
    const list = Array.isArray(raw) ? raw : raw?.mandates ?? [];
    return {
      agentAccountId: Array.isArray(raw) ? undefined : raw?.agentAccountId ?? raw?.agent_account_id,
      enabled: Array.isArray(raw) ? list.length > 0 : raw?.enabled ?? true,
      mandates: (list as any[]).map(normalizeMandate),
      spendingLimits: Array.isArray(raw)
        ? undefined
        : normalizeSpendingLimits(raw?.spendingLimits ?? raw?.spending_limits),
    };
  } catch {
    return { enabled: false, mandates: [] };
  }
}

/**
 * 创建链上代付授权（AP2 mandate）。
 * BACKEND_GAP(任务 22.1)：POST /v1/pet-earnings/onchain/mandates 尚未实现。
 */
export async function createOnchainMandate(input: CreateMandateInput): Promise<OnchainMandate> {
  const raw = await apiFetch<any>(`${BASE}/mandates`, {
    method: 'POST',
    body: JSON.stringify({
      maxAmount: input.maxAmount,
      currency: input.currency ?? 'USDT',
      allowedMerchants: input.allowedMerchants ?? [],
      allowedCategories: input.allowedCategories ?? [],
      validUntil: input.validUntil,
    }),
  });
  return normalizeMandate(raw);
}

/**
 * 撤销链上代付授权。
 * BACKEND_GAP(任务 22.1)：POST /v1/pet-earnings/onchain/mandates/:id/revoke 尚未实现。
 */
export async function revokeOnchainMandate(mandateId: string): Promise<OnchainMandate> {
  const raw = await apiFetch<any>(`${BASE}/mandates/${mandateId}/revoke`, { method: 'POST' });
  return normalizeMandate(raw);
}

/**
 * 拉取链上动作记录（OnchainActionRecord）。
 * BACKEND_GAP(任务 22.1)：GET /v1/pet-earnings/onchain/actions 尚未实现 →
 * 端点缺失时静默降级为空列表。
 */
export async function fetchOnchainActions(limit = 20): Promise<OnchainActionRecordView[]> {
  try {
    const raw = await apiFetch<any>(`${BASE}/actions?limit=${limit}`);
    const list = Array.isArray(raw) ? raw : raw?.items ?? raw?.actions ?? [];
    return (list as any[]).map(normalizeAction);
  } catch {
    return [];
  }
}
