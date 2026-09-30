/**
 * agentOpsApi — Desktop API client for the crypto-native-agent-ops backend.
 *
 * Mirrors the apiFetch convention used by CrossDevicePanel.tsx:
 *   - base URL from `API_BASE` (services/store)
 *   - bearer token passed in from `useAuthStore`
 *   - every backend response is a `{ success, data }` envelope (JwtAuthGuard)
 *
 * Endpoints map 1:1 to:
 *   - backend/src/modules/agent-ops/agent-ops.controller.ts          (tasks / monitors / metrics / deliverables / airdrops)
 *   - backend/src/modules/agent-ops/agent-ops-delivery.controller.ts (due-diligence / security / delivery-packages)
 *   - backend/src/modules/agent-ops/agent-ops-team.controller.ts     (team productization)
 *
 * This module does NOT introduce a new fetch client — it reuses the same
 * `fetch` + bearer-header shape as CrossDevicePanel.
 */
import { API_BASE } from "./store";

// ─── Envelope + low-level fetch (mirrors CrossDevicePanel.apiFetch) ───

/** Standard backend response envelope. */
export interface ApiEnvelope<T> {
  success: boolean;
  data?: T;
  message?: string;
  error?: string;
}

async function apiFetch<T = unknown>(
  url: string,
  token: string,
  opts?: RequestInit,
): Promise<ApiEnvelope<T>> {
  const res = await fetch(url, {
    ...opts,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...opts?.headers,
    },
  });
  return res.json();
}

/** Unwrap `{success,data}` → `data`, throwing on a falsy envelope. */
function unwrap<T>(env: ApiEnvelope<T>): T {
  if (!env || env.success === false) {
    throw new Error(env?.message || env?.error || "请求失败 / Request failed");
  }
  return env.data as T;
}

function qs(params: Record<string, string | number | undefined | null>): string {
  const usp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && String(v).length > 0) usp.set(k, String(v));
  }
  const s = usp.toString();
  return s ? `?${s}` : "";
}

// ─── Shared domain types (subset mirrored from backend) ───

export type AgentOpsTaskType =
  | "due_diligence"
  | "monitor"
  | "security"
  | "growth_social"
  | "growth_content"
  | "growth_kol"
  | "growth_quest"
  | "growth_moderation"
  | "growth_whitelist"
  | "sybil_detection"
  | "other";

export type AgentOpsTaskStatus =
  | "pending"
  | "running"
  | "awaiting_approval"
  | "completed"
  | "failed"
  | "cancelled";

export type AgentOpsRiskTier = "read" | "medium" | "high" | "redline";
export type AgentOpsApprovalState = "auto" | "pending" | "approved" | "rejected";

export interface AgentOpsTask {
  id: string;
  agentId: string;
  ownerId: string;
  type: AgentOpsTaskType;
  input: Record<string, unknown>;
  status: AgentOpsTaskStatus;
  riskTier: AgentOpsRiskTier;
  approvalState: AgentOpsApprovalState;
  createdAt: string;
  updatedAt?: string;
}

export interface AgentOpsDeliverable {
  id: string;
  taskId: string;
  agentId: string;
  type: string;
  content: Record<string, unknown>;
  sourceLinks: Array<{ source?: string; url?: string; status?: string; collectedAt?: string }>;
  collectedAt: string | null;
  qualified: boolean | null;
  qualityCheckedBy?: string | null;
  humanReviewState?: string | null;
  sharedAt?: string | null;
  createdAt?: string;
}

export type MonitorType =
  | "price"
  | "liquidation"
  | "depeg"
  | "governance"
  | "token_unlock"
  | "airdrop_window"
  | "approval_security"
  | "protocol_metric"
  | "treasury"
  | "other";

export type MonitorStatus = "active" | "paused" | "deleted";

export interface MonitorSubscription {
  id: string;
  ownerId: string;
  agentId: string;
  monitorType: MonitorType;
  condition: Record<string, unknown>;
  interval: number;
  lastCheckedAt: string | null;
  lastResult: Record<string, unknown> | null;
  status: MonitorStatus;
  createdAt?: string;
  updatedAt?: string;
}

export interface CreateMonitorInput {
  agentId: string;
  monitorType: MonitorType;
  condition: Record<string, unknown>;
  interval?: number;
}

export interface UpdateMonitorInput {
  monitorType?: MonitorType;
  condition?: Record<string, unknown>;
  interval?: number;
}

// ─── Due diligence ───

export type DueDiligenceTargetKind = "token" | "wallet" | "contract" | "project";

export interface DueDiligenceTarget {
  kind: DueDiligenceTargetKind;
  chain?: string;
  address?: string;
  name?: string;
  project?: string;
}

export interface ChecklistCheck {
  id: string;
  label: string;
  passed: boolean;
  reason?: string;
}

export interface DueDiligenceReport {
  target: DueDiligenceTarget;
  identity: Record<string, unknown>;
  basics: Record<string, unknown>;
  onchainActivity: Record<string, unknown>;
  riskSignals: Record<string, unknown>;
  keyLinks: Record<string, unknown>;
  conclusion: { riskRating: string | null; summary: string | null };
  provenance: Record<string, { source: string; sourceUrl: string; collectedAt: string }>;
  notFetched: string[];
  sourceLinks: Array<{ source: string; url: string; status: "fetched" | "not_fetched"; collectedAt: string }>;
  collectedAt: string | null;
  latencyMs: number | null;
  generatedAt: string;
}

export interface DeliverableValidationResult {
  qualified: boolean;
  checks: ChecklistCheck[];
  missingItems: string[];
  violations: string[];
}

export interface DueDiligenceRunResult {
  report: DueDiligenceReport;
  validation: DeliverableValidationResult;
  deliverableId?: string | null;
}

export interface RunDueDiligenceInput {
  taskId: string;
  agentId: string;
  target: DueDiligenceTarget;
  persist?: boolean;
  deviceId?: string;
  sessionId?: string;
}

// ─── Security (read-only) ───

export type ApprovalRiskTier = "low" | "medium" | "high";

export interface AnnotatedApproval {
  chain: string;
  token: string;
  tokenSymbol?: string;
  spender: string;
  spenderLabel?: string;
  allowance?: string;
  isUnlimited?: boolean;
  riskTier: ApprovalRiskTier;
  riskSignals: string[];
  recommendation: string;
}

export interface ApprovalScanResult {
  wallet: string;
  chain: string;
  sourceUrl: string;
  fetched: boolean;
  approvals: AnnotatedApproval[];
  highRiskCount: number;
  scannedAt: string;
  note?: string;
}

export type ScamTargetKind = "address" | "contract" | "domain";
export type ScamRisk = "safe" | "caution" | "danger" | "unknown";

export interface ScamCheckResult {
  kind: ScamTargetKind;
  value: string;
  risk: ScamRisk;
  signals: string[];
  advice: string;
  sources: string[];
  checkedAt: string;
}

export interface SimulatedAssetChange {
  asset: string;
  symbol?: string;
  direction: "in" | "out";
  amount?: string;
}

export interface TransactionSimulationResult {
  available: boolean;
  provider: string;
  assetChanges?: SimulatedAssetChange[];
  targetContractRisk?: { verified?: boolean; flagged?: boolean; signals?: string[] };
  summary: string;
  note?: string;
}

export interface RevokeTransactionPlan {
  chain: string;
  to: string;
  method: "approve";
  args: { spender: string; amount: "0" };
  description: string;
}

export interface RevokeGuidance {
  plan: RevokeTransactionPlan;
  riskTier: string;
  requiresUserConfirmation: boolean;
  autoExecuted: boolean;
  decision: "user_confirmation";
  reason: string;
}

// ─── Reliability metrics ───

export interface AutonomousCompletionMetric {
  attempts: number;
  autonomousQualified: number;
  autonomous: number;
  rate: number | null;
  threshold: number;
  meetsThreshold: boolean;
}

export interface QualityPassMetric {
  delivered: number;
  spotChecked: number;
  spotCheckQualified: number;
  rate: number | null;
  spotCheckCoverage: number | null;
  threshold: number;
  meetsThreshold: boolean;
}

export interface LatencyMetric {
  count: number;
  avgMs: number | null;
  minMs: number | null;
  maxMs: number | null;
  p50Ms: number | null;
  p95Ms: number | null;
}

export interface FunnelStage {
  stage: "created_agent" | "ran_first_task" | "got_qualified_delivery" | "paid_or_shared";
  count: number;
  conversionFromPrev: number | null;
}

export interface ReliabilitySnapshot {
  window: { since: string | null; until: string | null; agentId: string | null; taskType: AgentOpsTaskType };
  autonomousCompletion: AutonomousCompletionMetric;
  qualityPass: QualityPassMetric;
  latency: LatencyMetric;
  funnel: { stages: FunnelStage[] };
  generatedAt: string;
}

// ─── Delivery packages ───

export type DeliveryPackageStage = "S0" | "S1" | "cross_cutting";
export type DeliveryStepKind = "deliverable_production" | "write_action";

export interface InputFieldSpec {
  key: string;
  label: string;
  required: boolean;
  type: string;
  enumValues?: string[];
}

export interface DeliveryPackageStep {
  id: string;
  label: string;
  kind: DeliveryStepKind;
  deliverable?: { deliverableType: string; requiredSections: string[]; minItems?: Record<string, number> };
  action?: { actionType: string; target: string; isBatch?: boolean; toExternalDomain?: boolean };
  requirementRefs?: string[];
}

export interface AcceptanceCriterion {
  id: string;
  description: string;
}

export interface BillingSpec {
  model: "one_time" | "subscription" | "per_result" | "subscription_or_per_result";
  unit?: string;
  meteringRef?: string;
  note?: string;
}

export interface DeliveryPackageTemplate {
  slug: string;
  stage: DeliveryPackageStage;
  title: string;
  summary: string;
  requirementRefs: string[];
  inputs: InputFieldSpec[];
  steps: DeliveryPackageStep[];
  acceptance: AcceptanceCriterion[];
  billing: BillingSpec;
}

export interface InputValidationResult {
  ok: boolean;
  missing: string[];
  [k: string]: unknown;
}

export interface SectionCoverageResult {
  qualified: boolean;
  coveredSections: string[];
  missingSections: string[];
  underfilledSections: Array<{ section: string; required: number; actual: number }>;
}

export interface DeliverableStepResult {
  stepId: string;
  deliverableType: string;
  coverage: SectionCoverageResult;
  qualified: boolean;
  deliverableId: string | null;
}

export interface WriteActionStepResult {
  stepId: string;
  actionType: string;
  decision: "auto_execute" | "user_confirmation" | "deny";
  tier: "read" | "medium" | "high" | "redline";
  redline: boolean;
  mayProceed: boolean;
  reason?: string;
  actionLogId: string;
}

export interface ProduceDeliverableInput {
  taskId: string;
  agentId: string;
  stepId: string;
  content: Record<string, unknown>;
  sourceLinks?: unknown[];
  collectedAt?: string;
  persist?: boolean;
}

export interface RequestWriteActionInput {
  taskId: string;
  agentId: string;
  stepId: string;
  cost?: number;
  scope?: string;
  scopeId?: string;
  intent?: string;
}

// ─── Team productization ───

export type TeamBillingMode = "subscription" | "rental" | "per_result";
export type OverQuotaPolicy = "pause" | "overage_billing";

export interface ProvisionTeamInput {
  templateId?: string;
  templateSlug?: string;
  teamNamePrefix?: string;
  roleOverrides?: Record<string, Record<string, unknown>>;
}

export interface SubscriptionQuotaDecision {
  allowed: boolean;
  warn: boolean;
  overQuotaAction?: OverQuotaPolicy | null;
  used: number;
  remaining: number | null;
  quota: number | null;
  reason: string;
}

export interface SettlementRecord {
  taskId: string;
  mode: TeamBillingMode;
  totalUsd: number;
  merchantNetUsd: number;
  parties: Array<{ role: string; agentId?: string | null; amountUsd: number }>;
  submissionRef?: string;
  at: string;
}

export interface TeamMeteringDashboard {
  subscription: { used: number; remaining: number | null; quota: number | null; warn: boolean };
  rental: { activeLeases: number; expiredLeases: number; nextExpiryAt: string | null };
  perResult: { settledTasks: number; totalSettledUsd: number };
  tasks: { inProgress: number; delivered: number };
  settlements: SettlementRecord[];
}

export interface TeamBudgetEvaluationInput {
  teamBudgetCap: number;
  teamUsed: number;
  memberLimit: number;
  memberUsed: number;
  cost: number;
}

export interface TeamBudgetDecision {
  decision: "allow" | "stop_team_budget" | "block_member_limit";
  teamCapped: boolean;
  alert: boolean;
  reason: string;
}

export interface TeamLeaseWindow {
  durationDays: number;
  startsAt: string;
  endsAt: string;
  status: "active" | "expired" | "cancelled";
  compensatedDays?: number;
}

export interface ProvisionTeamResult {
  [k: string]: unknown;
}

// ─── Airdrops ───

export interface AirdropDiscoverInput {
  agentId: string;
  wallet: string;
  wallets?: string[];
  chain: string;
  checkerUrl?: string;
  extract?: string;
  intent?: string;
}

export interface AirdropClaimAssistInput {
  agentId: string;
  wallet: string;
  wallets?: string[];
  projectName: string;
  chain: string;
  claimUrl?: string;
  contract?: string;
  method?: string;
  args?: Record<string, unknown>;
  intent?: string;
}

export interface ClaimWindowReminderInput {
  agentId: string;
  wallet: string;
  wallets?: string[];
  projectName: string;
  claimUrl?: string;
  claimWindowStart?: string;
  claimWindowEnd?: string;
  intervalSeconds?: number;
}

// ═══════════════════════════════════════════════════════════════════
//  API surface — grouped, all returning the unwrapped `data` payload.
// ═══════════════════════════════════════════════════════════════════

export const agentOpsApi = {
  // ── Tasks ──
  listTasks: (token: string) =>
    apiFetch<AgentOpsTask[]>(`${API_BASE}/agent-ops/tasks`, token).then(unwrap),

  createTask: (
    token: string,
    body: { agentId: string; type: AgentOpsTaskType; input?: Record<string, unknown>; riskTier?: AgentOpsRiskTier },
  ) =>
    apiFetch<AgentOpsTask>(`${API_BASE}/agent-ops/tasks`, token, {
      method: "POST",
      body: JSON.stringify(body),
    }).then(unwrap),

  getTask: (token: string, id: string) =>
    apiFetch<AgentOpsTask>(`${API_BASE}/agent-ops/tasks/${encodeURIComponent(id)}`, token).then(unwrap),

  listTaskDeliverables: (token: string, id: string) =>
    apiFetch<AgentOpsDeliverable[]>(
      `${API_BASE}/agent-ops/tasks/${encodeURIComponent(id)}/deliverables`,
      token,
    ).then(unwrap),

  // ── Monitors CRUD ──
  listMonitors: (token: string) =>
    apiFetch<MonitorSubscription[]>(`${API_BASE}/agent-ops/monitors`, token).then(unwrap),

  getMonitor: (token: string, id: string) =>
    apiFetch<MonitorSubscription>(`${API_BASE}/agent-ops/monitors/${encodeURIComponent(id)}`, token).then(unwrap),

  createMonitor: (token: string, body: CreateMonitorInput) =>
    apiFetch<MonitorSubscription>(`${API_BASE}/agent-ops/monitors`, token, {
      method: "POST",
      body: JSON.stringify(body),
    }).then(unwrap),

  updateMonitor: (token: string, id: string, body: UpdateMonitorInput) =>
    apiFetch<MonitorSubscription>(`${API_BASE}/agent-ops/monitors/${encodeURIComponent(id)}`, token, {
      method: "PATCH",
      body: JSON.stringify(body),
    }).then(unwrap),

  deleteMonitor: (token: string, id: string) =>
    apiFetch<void>(`${API_BASE}/agent-ops/monitors/${encodeURIComponent(id)}`, token, {
      method: "DELETE",
    }),

  pauseMonitor: (token: string, id: string) =>
    apiFetch<MonitorSubscription>(`${API_BASE}/agent-ops/monitors/${encodeURIComponent(id)}/pause`, token, {
      method: "POST",
    }).then(unwrap),

  resumeMonitor: (token: string, id: string) =>
    apiFetch<MonitorSubscription>(`${API_BASE}/agent-ops/monitors/${encodeURIComponent(id)}/resume`, token, {
      method: "POST",
    }).then(unwrap),

  // ── Deliverables ──
  spotCheckDeliverable: (token: string, id: string, body: { qualified: boolean; notes?: string }) =>
    apiFetch<AgentOpsDeliverable>(
      `${API_BASE}/agent-ops/deliverables/${encodeURIComponent(id)}/spot-check`,
      token,
      { method: "POST", body: JSON.stringify(body) },
    ).then(unwrap),

  shareDeliverable: (token: string, id: string) =>
    apiFetch<AgentOpsDeliverable>(
      `${API_BASE}/agent-ops/deliverables/${encodeURIComponent(id)}/share`,
      token,
      { method: "POST" },
    ).then(unwrap),

  // ── Metrics ──
  getReliabilityMetrics: (
    token: string,
    params: { since?: string; until?: string; agentId?: string; taskType?: AgentOpsTaskType } = {},
  ) =>
    apiFetch<ReliabilitySnapshot>(
      `${API_BASE}/agent-ops/metrics/reliability${qs(params)}`,
      token,
    ).then(unwrap),

  // ── Due diligence ──
  runDueDiligence: (token: string, body: RunDueDiligenceInput) =>
    apiFetch<DueDiligenceRunResult>(`${API_BASE}/agent-ops/due-diligence/run`, token, {
      method: "POST",
      body: JSON.stringify(body),
    }).then(unwrap),

  // ── Security (read-only) ──
  scanApprovals: (
    token: string,
    body: { agentId: string; wallet: string; chain: string; deviceId?: string; sessionId?: string },
  ) =>
    apiFetch<ApprovalScanResult>(`${API_BASE}/agent-ops/security/scan-approvals`, token, {
      method: "POST",
      body: JSON.stringify(body),
    }).then(unwrap),

  checkScam: (
    token: string,
    body: { kind: ScamTargetKind; value: string; chain?: string; agentId?: string },
  ) =>
    apiFetch<ScamCheckResult>(`${API_BASE}/agent-ops/security/check-scam`, token, {
      method: "POST",
      body: JSON.stringify(body),
    }).then(unwrap),

  simulateTransaction: (
    token: string,
    body: { chain: string; from: string; to: string; data?: string; value?: string },
  ) =>
    apiFetch<TransactionSimulationResult>(`${API_BASE}/agent-ops/security/simulate-transaction`, token, {
      method: "POST",
      body: JSON.stringify(body),
    }).then(unwrap),

  revokeGuidance: (
    token: string,
    body: { chain: string; token: string; spender: string; tokenSymbol?: string; spenderLabel?: string },
  ) =>
    apiFetch<RevokeGuidance>(`${API_BASE}/agent-ops/security/revoke-guidance`, token, {
      method: "POST",
      body: JSON.stringify(body),
    }).then(unwrap),

  // ── Delivery packages ──
  listDeliveryPackages: (token: string) =>
    apiFetch<DeliveryPackageTemplate[]>(`${API_BASE}/agent-ops/delivery-packages`, token).then(unwrap),

  getDeliveryPackage: (token: string, slug: string) =>
    apiFetch<DeliveryPackageTemplate>(
      `${API_BASE}/agent-ops/delivery-packages/${encodeURIComponent(slug)}`,
      token,
    ).then(unwrap),

  validateDeliveryInputs: (token: string, slug: string, input: Record<string, unknown>) =>
    apiFetch<InputValidationResult>(
      `${API_BASE}/agent-ops/delivery-packages/${encodeURIComponent(slug)}/validate-inputs`,
      token,
      { method: "POST", body: JSON.stringify({ input }) },
    ).then(unwrap),

  produceDeliverable: (token: string, slug: string, body: ProduceDeliverableInput) =>
    apiFetch<DeliverableStepResult>(
      `${API_BASE}/agent-ops/delivery-packages/${encodeURIComponent(slug)}/produce`,
      token,
      { method: "POST", body: JSON.stringify(body) },
    ).then(unwrap),

  requestWriteAction: (token: string, slug: string, body: RequestWriteActionInput) =>
    apiFetch<WriteActionStepResult>(
      `${API_BASE}/agent-ops/delivery-packages/${encodeURIComponent(slug)}/write-action`,
      token,
      { method: "POST", body: JSON.stringify(body) },
    ).then(unwrap),

  // ── Team productization ──
  provisionTeam: (token: string, body: ProvisionTeamInput) =>
    apiFetch<ProvisionTeamResult>(`${API_BASE}/agent-ops/teams/provision`, token, {
      method: "POST",
      body: JSON.stringify(body),
    }).then(unwrap),

  getSubscriptionQuota: (token: string, overQuotaPolicy?: OverQuotaPolicy) =>
    apiFetch<SubscriptionQuotaDecision>(
      `${API_BASE}/agent-ops/teams/subscription/quota${qs({ overQuotaPolicy })}`,
      token,
    ).then(unwrap),

  getTeamDashboard: (
    token: string,
    body: { leases?: TeamLeaseWindow[]; inProgress?: number; delivered?: number } = {},
  ) =>
    apiFetch<TeamMeteringDashboard>(`${API_BASE}/agent-ops/teams/dashboard`, token, {
      method: "POST",
      body: JSON.stringify(body),
    }).then(unwrap),

  listSettlements: (
    token: string,
    params: { agentId?: string; mode?: TeamBillingMode; limit?: number } = {},
  ) =>
    apiFetch<SettlementRecord[]>(`${API_BASE}/agent-ops/teams/settlements${qs(params)}`, token).then(unwrap),

  createLease: (token: string, body: { durationDays: number; startsAt?: string }) =>
    apiFetch<TeamLeaseWindow>(`${API_BASE}/agent-ops/teams/leases`, token, {
      method: "POST",
      body: JSON.stringify(body),
    }).then(unwrap),

  renewLease: (token: string, body: { lease: TeamLeaseWindow; extraDays: number }) =>
    apiFetch<TeamLeaseWindow>(`${API_BASE}/agent-ops/teams/leases/renew`, token, {
      method: "POST",
      body: JSON.stringify(body),
    }).then(unwrap),

  expireLeaseIfDue: (token: string, body: { lease: TeamLeaseWindow; now?: string }) =>
    apiFetch<TeamLeaseWindow>(`${API_BASE}/agent-ops/teams/leases/expire-if-due`, token, {
      method: "POST",
      body: JSON.stringify(body),
    }).then(unwrap),

  compensateLease: (
    token: string,
    body: { lease: TeamLeaseWindow; mode: "extend" | "refund"; compensationDays?: number; pricePerDayUsd?: number },
  ) =>
    apiFetch<unknown>(`${API_BASE}/agent-ops/teams/leases/compensate`, token, {
      method: "POST",
      body: JSON.stringify(body),
    }).then(unwrap),

  settleTeamResult: (token: string, body: { taskId: string; listing: unknown; quantity?: number }) =>
    apiFetch<unknown>(`${API_BASE}/agent-ops/teams/settle`, token, {
      method: "POST",
      body: JSON.stringify(body),
    }).then(unwrap),

  evaluateTeamBudget: (token: string, body: TeamBudgetEvaluationInput) =>
    apiFetch<TeamBudgetDecision>(`${API_BASE}/agent-ops/teams/budget/evaluate`, token, {
      method: "POST",
      body: JSON.stringify(body),
    }).then(unwrap),

  // ── Airdrops ──
  discoverAirdrops: (token: string, body: AirdropDiscoverInput) =>
    apiFetch<unknown>(`${API_BASE}/agent-ops/airdrops/discover`, token, {
      method: "POST",
      body: JSON.stringify(body),
    }).then(unwrap),

  claimAssist: (token: string, body: AirdropClaimAssistInput) =>
    apiFetch<unknown>(`${API_BASE}/agent-ops/airdrops/claim-assist`, token, {
      method: "POST",
      body: JSON.stringify(body),
    }).then(unwrap),

  claimWindowReminder: (token: string, body: ClaimWindowReminderInput) =>
    apiFetch<unknown>(`${API_BASE}/agent-ops/airdrops/claim-window-reminder`, token, {
      method: "POST",
      body: JSON.stringify(body),
    }).then(unwrap),
};

export default agentOpsApi;
