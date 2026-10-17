/**
 * Agent Ops API client — Crypto-Native Agent Ops (滩头专项).
 *
 * Wraps the backend `agent-ops` module endpoints (all under JwtAuthGuard,
 * base path `/agent-ops` unless noted). The backend returns a
 * `{ success, data }` envelope — `unwrap()` peels `data` so callers get the
 * typed payload directly. Re-uses the shared `apiFetch` helper (token +
 * base URL handled there) — do NOT introduce a new HTTP client.
 *
 * Data shapes mirror the design doc Data Models section:
 *   agent_ops_task / agent_ops_deliverable / monitor_subscription /
 *   economic identity status enums / metrics / airdrops / due-diligence /
 *   team metering.
 */
import { apiFetch } from './api';

// ── Envelope ─────────────────────────────────────────────────────────────

export interface ApiEnvelope<T> {
  success: boolean;
  data: T;
  message?: string;
}

/**
 * Unwrap the `{ success, data }` envelope. Tolerant of endpoints that already
 * return the bare payload (some legacy routes do) so screens never crash on a
 * shape mismatch.
 */
function unwrap<T>(res: ApiEnvelope<T> | T): T {
  if (res && typeof res === 'object' && 'success' in (res as any) && 'data' in (res as any)) {
    return (res as ApiEnvelope<T>).data;
  }
  return res as T;
}

// ── Shared enums / value types ─────────────────────────────────────────────

export type RiskTier = 'read' | 'medium' | 'high' | 'redline';
export type TaskStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
export type ApprovalState = 'auto' | 'awaiting' | 'approved' | 'rejected';

export type AgentOpsTaskType =
  | 'due_diligence'
  | 'monitor'
  | 'security'
  | 'growth_content'
  | 'growth_community'
  | 'growth_listing'
  | 'report'
  | string;

// ── Tasks ──────────────────────────────────────────────────────────────────

export interface AgentOpsTask {
  id: string;
  agentId: string | null;
  ownerId: string;
  type: AgentOpsTaskType;
  input: Record<string, unknown>;
  status: TaskStatus;
  riskTier?: RiskTier;
  approvalState?: ApprovalState;
  title?: string;
  summary?: string;
  createdAt: string;
  updatedAt?: string;
}

export interface CreateTaskInput {
  type: AgentOpsTaskType;
  agentId?: string;
  input: Record<string, unknown>;
  title?: string;
}

export async function listTasks(params?: { status?: TaskStatus; type?: AgentOpsTaskType }): Promise<AgentOpsTask[]> {
  const qs = new URLSearchParams();
  if (params?.status) qs.set('status', params.status);
  if (params?.type) qs.set('type', params.type);
  const suffix = qs.toString() ? `?${qs.toString()}` : '';
  return unwrap<AgentOpsTask[]>(await apiFetch(`/agent-ops/tasks${suffix}`));
}

export async function createTask(input: CreateTaskInput): Promise<AgentOpsTask> {
  return unwrap<AgentOpsTask>(
    await apiFetch('/agent-ops/tasks', { method: 'POST', body: JSON.stringify(input) }),
  );
}

export async function getTask(id: string): Promise<AgentOpsTask> {
  return unwrap<AgentOpsTask>(await apiFetch(`/agent-ops/tasks/${id}`));
}

export async function getTaskDeliverables(id: string): Promise<Deliverable[]> {
  return unwrap<Deliverable[]>(await apiFetch(`/agent-ops/tasks/${id}/deliverables`));
}

// ── Deliverables ─────────────────────────────────────────────────────────────

export interface DeliverableSourceLink {
  label?: string;
  url: string;
  fetchedAt?: string;
}

export interface DeliverableSection {
  title: string;
  /** Either rendered text/markdown, or a list of key/value rows. */
  body?: string;
  rows?: Array<{ label: string; value: string | null; source?: string }>;
  /** When true the section/data could not be fetched — render 「未获取」. */
  notFetched?: boolean;
}

export interface Deliverable {
  id: string;
  taskId: string;
  agentId: string | null;
  type: string;
  /** Structured report content. `sections` is the rendering contract. */
  content: {
    title?: string;
    summary?: string;
    sections?: DeliverableSection[];
    [key: string]: unknown;
  };
  sourceLinks: DeliverableSourceLink[];
  collectedAt: string;
  /** Human / validator spot-check result. null = not yet checked. */
  qualified: boolean | null;
  qualityCheckedBy?: string | null;
  /** Degraded collection — some sources unavailable. */
  degraded?: boolean;
}

export async function spotCheckDeliverable(
  id: string,
  input: { qualified: boolean; note?: string },
): Promise<Deliverable> {
  return unwrap<Deliverable>(
    await apiFetch(`/agent-ops/deliverables/${id}/spot-check`, {
      method: 'POST',
      body: JSON.stringify(input),
    }),
  );
}

export async function shareDeliverable(
  id: string,
): Promise<{ shareUrl: string; expiresAt?: string }> {
  return unwrap<{ shareUrl: string; expiresAt?: string }>(
    await apiFetch(`/agent-ops/deliverables/${id}/share`, { method: 'POST' }),
  );
}

// ── Monitors ─────────────────────────────────────────────────────────────────

export type MonitorType =
  | 'price'
  | 'liquidation'
  | 'unlock'
  | 'governance'
  | 'airdrop_window'
  | 'approval_anomaly'
  | string;

export type MonitorStatus = 'active' | 'paused' | 'triggered' | 'error';

export interface Monitor {
  id: string;
  ownerId: string;
  agentId: string | null;
  monitorType: MonitorType;
  /** Free-form condition (threshold, target, chain, etc.). */
  condition: Record<string, unknown>;
  /** Human-readable summary of the condition, when the backend provides it. */
  conditionSummary?: string;
  interval: number;
  status: MonitorStatus;
  lastCheckedAt: string | null;
  lastResult: string | null;
  createdAt: string;
}

export interface CreateMonitorInput {
  monitorType: MonitorType;
  condition: Record<string, unknown>;
  interval?: number;
  agentId?: string;
}

export async function listMonitors(): Promise<Monitor[]> {
  return unwrap<Monitor[]>(await apiFetch('/agent-ops/monitors'));
}

export async function createMonitor(input: CreateMonitorInput): Promise<Monitor> {
  return unwrap<Monitor>(
    await apiFetch('/agent-ops/monitors', { method: 'POST', body: JSON.stringify(input) }),
  );
}

export async function getMonitor(id: string): Promise<Monitor> {
  return unwrap<Monitor>(await apiFetch(`/agent-ops/monitors/${id}`));
}

export async function updateMonitor(id: string, input: Partial<CreateMonitorInput>): Promise<Monitor> {
  return unwrap<Monitor>(
    await apiFetch(`/agent-ops/monitors/${id}`, { method: 'PATCH', body: JSON.stringify(input) }),
  );
}

export async function pauseMonitor(id: string): Promise<Monitor> {
  return unwrap<Monitor>(await apiFetch(`/agent-ops/monitors/${id}/pause`, { method: 'POST' }));
}

export async function resumeMonitor(id: string): Promise<Monitor> {
  return unwrap<Monitor>(await apiFetch(`/agent-ops/monitors/${id}/resume`, { method: 'POST' }));
}

export async function deleteMonitor(id: string): Promise<void> {
  await apiFetch(`/agent-ops/monitors/${id}`, { method: 'DELETE' });
}

// ── Metrics / reliability ──────────────────────────────────────────────────

export interface ReliabilityMetrics {
  /** 自主完成率 — target ≥ 0.8 (0..1). */
  autonomousCompletionRate: number;
  /** 质量合格率(抽检)— target ≥ 0.9 (0..1). */
  qualityPassRate: number;
  /** 平均时延(ms) — informational. */
  avgLatencyMs: number;
  p95LatencyMs?: number;
  /** 冷启动漏斗 — funnel stages from first-touch → activated. */
  coldStartFunnel?: Array<{ stage: string; count: number }>;
  sampleSize?: number;
  windowDays?: number;
  generatedAt?: string;
}

export async function fetchReliabilityMetrics(): Promise<ReliabilityMetrics> {
  return unwrap<ReliabilityMetrics>(await apiFetch('/agent-ops/metrics/reliability'));
}

// ── Airdrops ─────────────────────────────────────────────────────────────────

export interface AirdropOpportunity {
  id: string;
  projectName: string;
  tokenSymbol?: string;
  chain?: string;
  /** Eligibility verdict from the discover pass. */
  eligible: boolean;
  eligibilityReason?: string;
  estimatedValueUsd?: number | null;
  /** Claim window — agent reminds, never auto-claims. */
  claimWindowStart?: string | null;
  claimWindowEnd?: string | null;
  sourceLinks?: DeliverableSourceLink[];
  /** Some checks may be unavailable — render honestly. */
  notFetched?: boolean;
}

export interface DiscoverAirdropsResult {
  opportunities: AirdropOpportunity[];
  degraded?: boolean;
  generatedAt?: string;
}

export async function discoverAirdrops(input?: {
  address?: string;
  chains?: string[];
}): Promise<DiscoverAirdropsResult> {
  return unwrap<DiscoverAirdropsResult>(
    await apiFetch('/agent-ops/airdrops/discover', {
      method: 'POST',
      body: JSON.stringify(input ?? {}),
    }),
  );
}

/**
 * Build an UNSIGNED claim plan. The claim transaction must be signed by the
 * user — the agent NEVER auto-claims. The returned `unsignedTx` / `steps`
 * require explicit user signature confirmation in the wallet.
 */
export interface ClaimAssistPlan {
  airdropId: string;
  requiresUserSignature: true;
  steps: Array<{ order: number; description: string; chain?: string; to?: string; estimatedGasUsd?: number }>;
  unsignedTx?: Record<string, unknown> | null;
  warnings?: string[];
}

export async function claimAssist(input: { airdropId: string; address?: string }): Promise<ClaimAssistPlan> {
  return unwrap<ClaimAssistPlan>(
    await apiFetch('/agent-ops/airdrops/claim-assist', {
      method: 'POST',
      body: JSON.stringify(input),
    }),
  );
}

export async function setClaimWindowReminder(input: {
  airdropId: string;
  remindAt?: string;
}): Promise<{ reminderId: string; remindAt: string }> {
  return unwrap<{ reminderId: string; remindAt: string }>(
    await apiFetch('/agent-ops/airdrops/claim-window-reminder', {
      method: 'POST',
      body: JSON.stringify(input),
    }),
  );
}

// ── Due diligence ────────────────────────────────────────────────────────────

export type DueDiligenceTargetType = 'token' | 'wallet' | 'contract' | 'project';

export interface DueDiligenceInput {
  targetType: DueDiligenceTargetType;
  chain?: string;
  /** address for token/wallet/contract; name for project. */
  address?: string;
  name?: string;
}

export interface DueDiligenceReport {
  taskId?: string;
  deliverableId?: string;
  target: DueDiligenceInput;
  title?: string;
  summary?: string;
  sections: DeliverableSection[];
  sourceLinks: DeliverableSourceLink[];
  /** Overall qualified verdict from DeliverableValidator. */
  qualified: boolean;
  /** Collection was degraded — some sources unavailable. */
  degraded?: boolean;
  generatedAt?: string;
}

export async function runDueDiligence(input: DueDiligenceInput): Promise<DueDiligenceReport> {
  return unwrap<DueDiligenceReport>(
    await apiFetch('/agent-ops/due-diligence/run', {
      method: 'POST',
      body: JSON.stringify(input),
    }),
  );
}

// ── Agent economic status (打通真实状态) ───────────────────────────────────────

/** Real capability status — never an empty placeholder. */
export type CapabilityStatus = 'enabled' | 'not_enabled' | 'failed';

export interface CapabilityState {
  key: string;
  status: CapabilityStatus;
  detail?: string;
}

export interface AgentEconomicStatus {
  agentId: string;
  agentName?: string;
  wallet: {
    status: CapabilityStatus;
    address?: string | null;
    custody?: 'mpc' | 'external' | null;
    detail?: string;
  };
  limit: {
    status: CapabilityStatus;
    dailyLimitUsd?: number | null;
    monthlyLimitUsd?: number | null;
    usedTodayUsd?: number | null;
    usedMonthUsd?: number | null;
    detail?: string;
  };
  credit: {
    status: CapabilityStatus;
    creditScore?: number | null;
    riskLevel?: 'low' | 'medium' | 'high' | 'critical' | null;
    detail?: string;
  };
  onchain: {
    status: CapabilityStatus;
    chain?: string | null;
    txHash?: string | null;
    registry?: string | null;
    detail?: string;
  };
  capabilities: CapabilityState[];
}

export async function fetchAgentEconomicStatus(agentId: string): Promise<AgentEconomicStatus> {
  return unwrap<AgentEconomicStatus>(await apiFetch(`/agent-accounts/${agentId}/economic-status`));
}

// ── Economic Identity Card (agent-wallet-identity-tangibility 需求 6/7/8) ──

export type CardStatus = 'enabled' | 'pending' | 'not_enabled' | 'failed';

export interface EconomicIdentityCard {
  agentUniqueId: string;
  ownerId?: string;
  wallet: {
    status: CardStatus;
    type: 'mpc' | 'external' | 'none';
    address?: string;
    explorerUrl?: string;
    balances: { platform: string; onchain?: string; currency: string };
  };
  backup: { status: 'enabled' | 'not_enabled'; confirmedAt?: string };
  onchain: { status: CardStatus; txHash?: string; explorerUrl?: string; chain?: string };
  credit: {
    status: CardStatus;
    creditScore: number;
    riskLevel: string;
    level: 'None' | 'Bronze' | 'Silver' | 'Gold' | 'Platinum';
  };
  earnings: {
    status: CardStatus;
    totalTx: number;
    totalAmount: string;
    currency: string;
    success: number;
    failed: number;
  };
  tradable: { status: 'roadmap'; note: string };
  compliance: { disclosures: string[] };
}

export interface AgentLedgerItem {
  id: string;
  time: string;
  type: string;
  amount: string;
  currency: string;
  status: string;
}

export interface AgentLedger {
  items: AgentLedgerItem[];
  empty: boolean;
  emptyHint?: string;
  currency: string;
}

export async function fetchEconomicIdentityCard(agentId: string): Promise<EconomicIdentityCard> {
  return unwrap<EconomicIdentityCard>(await apiFetch(`/agent-accounts/${agentId}/economic-identity`));
}

export async function fetchAgentLedger(agentId: string): Promise<AgentLedger> {
  return unwrap<AgentLedger>(await apiFetch(`/agent-accounts/${agentId}/ledger`));
}

// ── Team dashboard / metering ──────────────────────────────────────────────

export type BillingMode = 'subscription' | 'rental' | 'per_result';

export interface TeamMeteringDashboard {
  teamId?: string;
  teamName?: string;
  /** Spend split across the three billing modes. */
  split: Array<{ mode: BillingMode; amountUsd: number; label?: string }>;
  totalSpendUsd: number;
  periodStart?: string;
  periodEnd?: string;
  agentCount?: number;
  resultCount?: number;
}

export interface SettlementRecord {
  id: string;
  mode: BillingMode;
  amountUsd: number;
  /** 分佣 breakdown when applicable. */
  commissionUsd?: number;
  counterparty?: string;
  status: 'pending' | 'settled' | 'failed' | 'refunded' | string;
  createdAt: string;
  settledAt?: string | null;
}

export async function fetchTeamDashboard(input?: {
  teamId?: string;
  periodDays?: number;
}): Promise<TeamMeteringDashboard> {
  return unwrap<TeamMeteringDashboard>(
    await apiFetch('/agent-ops/teams/dashboard', {
      method: 'POST',
      body: JSON.stringify(input ?? {}),
    }),
  );
}

export async function fetchTeamSettlements(): Promise<SettlementRecord[]> {
  return unwrap<SettlementRecord[]>(await apiFetch('/agent-ops/teams/settlements'));
}
