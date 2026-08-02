/**
 * P1-03 · Action + Authority + TaskProof runtime contract (R6/R7/R8).
 *
 * Orthogonal, independently-versioned lifecycle states; canonical lineage IDs;
 * idempotency envelope; normalized chat-path events; and the additive TaskProof
 * record envelope. Pure transition logic lives in
 * `backend/src/modules/action-runtime/*`.
 */
import type {
  CompatibilityAttributionV1,
  TaskProofV1,
  TaskProofV2,
} from './task-proof';
import type { ActionAttributionV1 } from './agent-attribution';
import type { TrustActionProvenanceV1 } from './trust-loop-contracts';

export const ACTION_RUNTIME_SCHEMA_VERSION = 1 as const;

export type AuthorizationStateV1 =
  | 'pending'
  | 'approved'
  | 'denied'
  | 'expired'
  | 'revoked';
export type ExecutionStateV1 =
  | 'not_started'
  | 'queued'
  | 'running'
  | 'succeeded'
  | 'failed'
  | 'cancelled';
export type SettlementStateV1 =
  | 'not_required'
  | 'pending'
  | 'settled'
  | 'failed'
  | 'refunded'
  | 'reversed';
export type ProofStateV1 = 'pending' | 'issued' | 'revoked' | 'superseded';
export type ReputationStateV1 = 'not_eligible' | 'pending' | 'applied' | 'reversed';

export type ActionDimensionV1 =
  | 'authorization'
  | 'execution'
  | 'settlement'
  | 'proof'
  | 'reputation';

/** Orthogonal lifecycle state (R6.1). One implicit total state is NOT used. */
export interface ActionLifecycleStateV1 {
  schemaVersion: typeof ACTION_RUNTIME_SCHEMA_VERSION;
  soulCoreId: string;
  requestId: string;
  taskId: string;
  /** Monotonic; every accepted transition increments it (R6.8). */
  version: number;
  authorization: AuthorizationStateV1;
  execution: ExecutionStateV1;
  settlement: SettlementStateV1;
  proof: ProofStateV1;
  reputation: ReputationStateV1;
  authorizationId?: string;
  executionId?: string;
  settlementId?: string;
  outcomeId?: string;
  taskProofId?: string;
  updatedAt: string;
}

/**
 * Allowed transitions per dimension (R6.2–R6.6). A `from` state absent from a
 * dimension map, or a `to` not listed, is a terminal/invalid transition.
 */
export const ALLOWED_TRANSITIONS_V1: {
  [D in ActionDimensionV1]: Record<string, readonly string[]>;
} = {
  authorization: {
    pending: ['approved', 'denied', 'expired'],
    approved: ['revoked', 'expired'],
  },
  execution: {
    not_started: ['queued'],
    queued: ['running', 'cancelled'],
    running: ['succeeded', 'failed', 'cancelled'],
  },
  settlement: {
    // not_required is terminal.
    pending: ['settled', 'failed'],
    settled: ['refunded', 'reversed'],
  },
  proof: {
    pending: ['issued'],
    issued: ['revoked', 'superseded'],
  },
  reputation: {
    not_eligible: ['applied'],
    pending: ['applied'],
    applied: ['reversed'],
  },
};

export interface ActionTransitionV1 {
  dimension: ActionDimensionV1;
  to: string;
  actor: string;
  requestId: string;
  occurredAt: string;
  /** Optional lineage id assigned by this transition (e.g. settlementId). */
  refId?: string;
  refField?: keyof Pick<
    ActionLifecycleStateV1,
    'authorizationId' | 'executionId' | 'settlementId' | 'outcomeId' | 'taskProofId'
  >;
}

export interface ActionTransitionLogEntryV1 {
  dimension: ActionDimensionV1;
  from: string;
  to: string;
  actor: string;
  requestId: string;
  occurredAt: string;
  priorVersion: number;
  newVersion: number;
}

/** Idempotency record keyed by (scope, key) (R7.6–R7.8). */
export interface ActionIdempotencyRecordV1 {
  /** caller + soulCoreId + operation scope. */
  scope: string;
  key: string;
  payloadDigest: string;
  taskId: string;
  resultRefs: Record<string, string>;
  status: 'in_progress' | 'complete' | 'failed_retriable' | 'failed_terminal';
  expiresAt: string;
}

/** Normalized chat-path event; both stream endpoints emit the same shape (R8.6–R8.8). */
export type ActionStreamEventV1 =
  | {
      type: 'meta';
      schemaVersion: 1;
      requestId: string;
      taskId: string;
      soulCoreId: string;
      /** Server-derived only; historical tasks may omit it rather than infer identity. */
      attribution?: ActionAttributionV1;
      /** Chat-time task provenance is observable but not yet proof-bound. */
      provenance?: TrustActionProvenanceV1;
    }
  | { type: 'authorization'; authorizationId: string; decision: AuthorizationStateV1 }
  | { type: 'tool'; toolCallId: string; phase: 'started' | 'completed' | 'failed' }
  | { type: 'outcome'; outcomeId: string; result: 'success' | 'partial' | 'failure' | 'cancelled' }
  | { type: 'proof'; taskProofId: string; status: ProofStateV1 }
  | { type: 'error'; code: string; retryable: boolean };

/** Additive TaskProof envelope over the existing `TaskProofV1` payload (R8). */
export interface TaskProofRecordV1 {
  schemaVersion: typeof ACTION_RUNTIME_SCHEMA_VERSION;
  taskProofId: string;
  outcomeVersion: number;
  status: 'active' | 'revoked' | 'superseded';
  issuer: string;
  verification: { method: string; digestAlgorithm: 'sha256'; signature?: string };
  supersedesTaskProofId?: string;
  proof: TaskProofV1;
  /** V1 remains the compatibility wire; V2 consumers prefer canonicalProof. */
  canonicalProofVersion?: 1 | 2;
  canonicalProof?: TaskProofV2;
  compatibilityAttribution?: CompatibilityAttributionV1;
}

// ---------- Action Runtime HTTP contract (P1-03 production wiring) ----------

/** First production-safe vertical slice: a read-only Control Plane inspection. */
export const ACTION_TYPES_V1 = ['chat.tool_execution.v1'] as const;
export type ActionTypeV1 = (typeof ACTION_TYPES_V1)[number];

/**
 * Read-only, zero-cost tool slices. `authority.inspect` returns an authority
 * snapshot; `economy.discover` returns a non-financial economy-readiness
 * summary. Neither writes orders/ledger nor requires settlement.
 */
export const ACTION_TOOL_NAMES_V1 = ['authority.inspect', 'economy.discover'] as const;
export type ActionToolNameV1 = (typeof ACTION_TOOL_NAMES_V1)[number];

/** Per-tool authorization scope. Both are read-only. */
export const ACTION_TOOL_SCOPES_V1 = {
  'authority.inspect': 'authority:read',
  'economy.discover': 'economy:read',
} as const;
export type ActionAuthScopeV1 = (typeof ACTION_TOOL_SCOPES_V1)[ActionToolNameV1];

export type ActionAuthorizationDecisionV1 = 'pending' | 'approved' | 'denied' | 'expired' | 'revoked';

/** Task-bound authorization preview. It never grants authority by itself. */
export interface ActionAuthorizationPreviewV1 {
  schemaVersion: typeof ACTION_RUNTIME_SCHEMA_VERSION;
  authorizationId: string;
  soulCoreId: string;
  taskId: string;
  scope: ActionAuthScopeV1;
  inputDigest: string;
  policyVersion: number;
  decision: ActionAuthorizationDecisionV1;
  expiresAt: string;
  requiredEnforcementLayers: Array<'software' | 'onchain-4337' | 'SE-tap' | 'SE-resident'>;
  source: 'sovereignty-control-plane';
  requiresHumanApproval: true;
  estimatedCost: { amount: '0'; asset: 'USD' };
  decidedAt?: string;
  decidedBy?: string;
}

/** Sanitized result for `authority.inspect`. No raw policy/prompt payload is persisted. */
export interface AuthorityInspectionOutcomeV1 {
  kind: 'authority_snapshot';
  tier: string;
  enabledCapabilityCount: number;
  spendingLimitsConfigured: boolean;
}

/**
 * Sanitized result for `economy.discover` — a non-financial readiness summary.
 * It reports which economy-relevant capabilities the Soul Core is authorized
 * for; it never creates orders, quotes real money, or touches the ledger.
 */
export interface EconomyDiscoveryOutcomeV1 {
  kind: 'economy_readiness';
  tier: string;
  enabledEconomyCapabilityCount: number;
  spendingLimitsConfigured: boolean;
  autonomousPaymentEnabled: boolean;
}

/** Discriminated union of read-only tool outcomes (keyed by `kind`). */
export type ActionToolOutcomeV1 = AuthorityInspectionOutcomeV1 | EconomyDiscoveryOutcomeV1;

export interface ActionOutcomeV1 {
  outcomeId: string;
  result: 'success' | 'partial' | 'failure' | 'cancelled';
  resultDigest: string;
  summary: ActionToolOutcomeV1;
  recordedAt: string;
}

/** Canonical task detail consumed by Web/Mobile/Desktop. */
export interface ActionTaskV1 {
  schemaVersion: typeof ACTION_RUNTIME_SCHEMA_VERSION;
  actionType: ActionTypeV1;
  toolName: ActionToolNameV1;
  lifecycle: ActionLifecycleStateV1;
  authorization: ActionAuthorizationPreviewV1;
  /** Additive ADR-SOUL-002 attribution. Historical rows intentionally omit it. */
  attribution?: ActionAttributionV1;
  outcome?: ActionOutcomeV1;
  parentTaskId?: string;
  createdAt: string;
}

export interface ActionTaskListV1 {
  schemaVersion: typeof ACTION_RUNTIME_SCHEMA_VERSION;
  items: ActionTaskV1[];
}

export interface CreateActionRequestV1 {
  schemaVersion: typeof ACTION_RUNTIME_SCHEMA_VERSION;
  actionType: ActionTypeV1;
  toolName: ActionToolNameV1;
}

export interface DecideActionRequestV1 {
  schemaVersion: typeof ACTION_RUNTIME_SCHEMA_VERSION;
  decision: 'approved' | 'denied';
  expectedVersion: number;
}

export interface ExecuteActionRequestV1 {
  schemaVersion: typeof ACTION_RUNTIME_SCHEMA_VERSION;
  expectedVersion: number;
}

export interface RetryActionRequestV1 {
  schemaVersion: typeof ACTION_RUNTIME_SCHEMA_VERSION;
}

export interface ActionMutationResultV1 {
  schemaVersion: typeof ACTION_RUNTIME_SCHEMA_VERSION;
  task: ActionTaskV1;
  replayed: boolean;
}
