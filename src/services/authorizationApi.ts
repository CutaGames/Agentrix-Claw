/**
 * Sovereignty Control Plane — 授权中枢移动端 API（S1 task 6.1）。
 *
 * 对接后端：
 *   GET  /agent-accounts/:id/authorizations
 *   PUT  /agent-accounts/:id/authorizations   { tier? | delta? }
 *   GET  /agent-accounts/:id/authorizations/audit?limit=
 *
 * 后端整体受 env 门控 `SOVEREIGNTY_CONTROL_PLANE_ENABLED`；关闭时返回 404，
 * 调用方应据此优雅降级（视为"未启用"）。
 */
import { apiFetch } from './api';

export type TierName = 'readonly' | 'semi_auto' | 'full_auto' | 'custom';

export type CapabilityState =
  | 'enabled'
  | 'disabled'
  | 'not_enabled'
  | 'revoked'
  | 'client_managed';

export interface AuthorizationSpendingLimits {
  singleTxLimit: number;
  dailyLimit: number;
  monthlyLimit: number;
  currency: string;
}

export interface AuthorizationView {
  agentAccountId: string;
  tier: TierName;
  model: { preferredModel?: string; preferredProvider?: string };
  voiceId?: string;
  spendingLimits: AuthorizationSpendingLimits | null;
  usage: { usedTodayAmount: number; remainingDaily: number | null };
  capabilities: Record<string, CapabilityState>;
  clientManaged: string[];
}

export interface AuthorizationAuditEntry {
  id: string;
  agentAccountId: string;
  actorUserId: string | null;
  dimension: string;
  capKey: string | null;
  action: 'grant' | 'modify' | 'revoke' | 'decision';
  oldValue: Record<string, unknown> | null;
  newValue: Record<string, unknown> | null;
  decisionResult: 'allow' | 'deny' | null;
  reason: string | null;
  createdAt: string;
}

interface Envelope<T> {
  success: boolean;
  data: T;
}

// ── 资源与路由（只读 · S1 task 8.2）─────────────────────────────
export type RoutingTierKey = 'local' | 'smart' | 'cloud' | 'unknown';

export interface RoutingTierUsage {
  tier: RoutingTierKey;
  calls: number;
  costUsd: number;
}

export interface RoutingResourceView {
  agentAccountId: string;
  window: { days: number; since: string };
  brain: {
    preferredModel?: string;
    preferredProvider?: string;
    byok: boolean;
    byokProvider?: string;
    byokModel?: string;
  };
  tierUsage: RoutingTierUsage[];
  totalCalls: number;
  totalCostUsd: number;
  savings: { savedUsd: number | null; estimatedAllCloudUsd: number | null; note: string };
  privacy: { onDeviceCalls: number; networkCalls: number; note: string };
}

/** 授权中枢是否可用（后端 env 门控）。404/失败 → 视为未启用。 */
export async function isControlPlaneEnabled(agentAccountId: string): Promise<boolean> {
  try {
    await getAuthorizations(agentAccountId);
    return true;
  } catch {
    return false;
  }
}

export async function getAuthorizations(agentAccountId: string): Promise<AuthorizationView> {
  const res = await apiFetch<Envelope<AuthorizationView>>(
    `/agent-accounts/${agentAccountId}/authorizations`,
  );
  return res.data;
}

/** 套用权限档。 */
export async function applyTier(
  agentAccountId: string,
  tier: Exclude<TierName, 'custom'>,
): Promise<AuthorizationView> {
  const res = await apiFetch<Envelope<AuthorizationView>>(
    `/agent-accounts/${agentAccountId}/authorizations`,
    { method: 'PUT', body: JSON.stringify({ tier }) },
  );
  return res.data;
}

/** 逐项覆盖能力位/限额。 */
export async function patchAuthorizations(
  agentAccountId: string,
  delta: {
    permissions?: Record<string, boolean>;
    spendingLimits?: Partial<AuthorizationSpendingLimits>;
  },
): Promise<AuthorizationView> {
  const res = await apiFetch<Envelope<AuthorizationView>>(
    `/agent-accounts/${agentAccountId}/authorizations`,
    { method: 'PUT', body: JSON.stringify({ delta }) },
  );
  return res.data;
}

/** 收回单个能力（逐项覆盖为 false）。 */
export async function revokeCapability(
  agentAccountId: string,
  capKey: string,
): Promise<AuthorizationView> {
  return patchAuthorizations(agentAccountId, { permissions: { [capKey]: false } });
}

export async function getAuthorizationAudit(
  agentAccountId: string,
  limit = 50,
): Promise<AuthorizationAuditEntry[]> {
  const res = await apiFetch<Envelope<AuthorizationAuditEntry[]>>(
    `/agent-accounts/${agentAccountId}/authorizations/audit?limit=${limit}`,
  );
  return res.data;
}

/** 资源与路由（只读）：模型档 / BYOK / 按档花费 / 省钱估算 / 隐私分布。 */
export async function getRoutingResources(
  agentAccountId: string,
  days = 30,
): Promise<RoutingResourceView> {
  const res = await apiFetch<Envelope<RoutingResourceView>>(
    `/agent-accounts/${agentAccountId}/routing-resources?days=${days}`,
  );
  return res.data;
}
