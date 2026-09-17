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
import type { DeveloperEncryptedDataRefV1 } from './developer-remote-workspace';
import {
  TRUST_LOOP_CANONICALIZATION,
  type DigestRef,
  type PartyRef,
  type RecordRef,
} from './trust-loop-primitives';

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
export const ACTION_TYPE_CHAT_TOOL_EXECUTION_V1 = 'chat.tool_execution.v1' as const;
/** Additive developer-remote instruction profile (DRW). Not a chat-tool execution. */
export const ACTION_TYPE_DEVELOPER_REMOTE_INSTRUCTION_V1 = 'developer.remote_instruction.v1' as const;
export const ACTION_TYPES_V1 = [
  ACTION_TYPE_CHAT_TOOL_EXECUTION_V1,
  ACTION_TYPE_DEVELOPER_REMOTE_INSTRUCTION_V1,
] as const;
export type ActionTypeV1 = (typeof ACTION_TYPES_V1)[number];

/**
 * Read-only, zero-cost tool slices. `authority.inspect` returns an authority
 * snapshot; `economy.discover` returns a non-financial economy-readiness
 * summary. Neither writes orders/ledger nor requires settlement.
 */
export const ACTION_TOOL_DEVELOPER_REMOTE_EXECUTE_V1 = 'developer.remote_execute' as const;
export const ACTION_TOOL_NAMES_V1 = [
  'authority.inspect',
  'economy.discover',
  ACTION_TOOL_DEVELOPER_REMOTE_EXECUTE_V1,
] as const;
export type ActionToolNameV1 = (typeof ACTION_TOOL_NAMES_V1)[number];

/** Chat generic create/execute allowlist. Developer remote execute is excluded. */
export const ACTION_CHAT_READ_ONLY_TOOLS_V1 = ['authority.inspect', 'economy.discover'] as const;
export type ActionChatReadOnlyToolV1 = (typeof ACTION_CHAT_READ_ONLY_TOOLS_V1)[number];

export function isChatReadOnlyActionToolV1(toolName: string): toolName is ActionChatReadOnlyToolV1 {
  return (ACTION_CHAT_READ_ONLY_TOOLS_V1 as readonly string[]).includes(toolName);
}

export const ACTION_RUNTIME_DIGEST_CANONICALIZATION = TRUST_LOOP_CANONICALIZATION;

const SHARED_JCS_DIGEST_HEX = /^[0-9a-f]{64}$/;

/** Shared JCS digest only. Local sha256/canonicalize helpers are not accepted. */
export function isSharedJcsDigestRef(value: unknown): value is DigestRef {
  if (!value || typeof value !== 'object') return false;
  const digest = value as DigestRef;
  return (
    digest.algorithm === 'sha-256' &&
    digest.canonicalization === TRUST_LOOP_CANONICALIZATION &&
    typeof digest.value === 'string' &&
    SHARED_JCS_DIGEST_HEX.test(digest.value)
  );
}

export function sharedJcsDigestRefsEqual(left: unknown, right: unknown): boolean {
  return (
    isSharedJcsDigestRef(left) &&
    isSharedJcsDigestRef(right) &&
    left.algorithm === right.algorithm &&
    left.canonicalization === right.canonicalization &&
    left.value === right.value
  );
}

export function isDeveloperRemoteInstructionPayloadRef(
  value: unknown,
): value is DeveloperEncryptedDataRefV1 & { dataKind: 'instruction' } {
  if (!value || typeof value !== 'object') return false;
  const ref = value as DeveloperEncryptedDataRefV1;
  return (
    ref.kind === 'encrypted_data_ref' &&
    ref.dataKind === 'instruction' &&
    typeof ref.dataRef === 'string' &&
    ref.dataRef.length > 0 &&
    isSharedJcsDigestRef(ref.digest) &&
    Number.isInteger(ref.sizeBytes) &&
    Number(ref.sizeBytes) > 0 &&
    (ref.dataClass === 'owner_private' || ref.dataClass === 'restricted') &&
    ref.encryption === 'runtime_managed' &&
    ref.ownerScope === 'authenticated_owner' &&
    !!ref.runtimeRef &&
    ref.runtimeRef.type === 'runtime' &&
    typeof ref.runtimeRef.id === 'string' &&
    ref.runtimeRef.id.length > 0 &&
    Number.isInteger(ref.runtimeRef.version) &&
    Number(ref.runtimeRef.version) >= 1 &&
    typeof ref.expiresAt === 'string' &&
    Number.isFinite(Date.parse(ref.expiresAt))
  );
}

/** Per-tool authorization scope. Chat tools stay read-only; remote execute is external. */
export const ACTION_TOOL_SCOPES_V1 = {
  'authority.inspect': 'authority:read',
  'economy.discover': 'economy:read',
  [ACTION_TOOL_DEVELOPER_REMOTE_EXECUTE_V1]: 'developer:remote_execute',
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

/** Sanitized remote-terminal summary (DRW). Never carries prompt/path/log bodies. */
export interface DeveloperRemoteTerminalOutcomeV1 {
  kind: 'developer_remote_terminal';
  status: 'completed' | 'failed' | 'cancelled' | 'unknown_outcome';
  instructionRef: string;
  sessionRef: string;
}

/** Discriminated union of tool outcomes (keyed by `kind`). */
export type ActionToolOutcomeV1 =
  | AuthorityInspectionOutcomeV1
  | EconomyDiscoveryOutcomeV1
  | DeveloperRemoteTerminalOutcomeV1;

/**
 * Write-path assertion class. Receipt/Proof may treat this as runtime-observed
 * evidence (`kind: "log"`), never as a third-party attestation.
 */
export const DEVELOPER_REMOTE_TERMINAL_WRITE_ASSERTION_CLASS_V1 = 'runtime_observed' as const;

/**
 * Read-only legacy assertion class kept for shared/workspace type compat.
 * Strict write validators reject it. UI/Receipt must label it unverified and
 * must never display it as verified.
 */
export const DEVELOPER_REMOTE_TERMINAL_LEGACY_ASSERTION_CLASS_V1 = 'third_party_attested' as const;

export type DeveloperRemoteTerminalAssertionClassV1 =
  | typeof DEVELOPER_REMOTE_TERMINAL_WRITE_ASSERTION_CLASS_V1
  | typeof DEVELOPER_REMOTE_TERMINAL_LEGACY_ASSERTION_CLASS_V1;

export function isDeveloperRemoteTerminalWriteAssertionClass(
  value: unknown,
): value is typeof DEVELOPER_REMOTE_TERMINAL_WRITE_ASSERTION_CLASS_V1 {
  return value === DEVELOPER_REMOTE_TERMINAL_WRITE_ASSERTION_CLASS_V1;
}

/** Receipt/UI trust label. Legacy attested evidence is never "verified". */
export function developerRemoteTerminalEvidenceTrustLabel(
  assertionClass: DeveloperRemoteTerminalAssertionClassV1,
): 'runtime_observed' | 'unverified_legacy' {
  return isDeveloperRemoteTerminalWriteAssertionClass(assertionClass)
    ? 'runtime_observed'
    : 'unverified_legacy';
}

/** Typed adapter terminal evidence. Digest-only claims are not evidence. */
export interface DeveloperRemoteTerminalEvidenceRefV1 {
  type: 'developer_adapter_terminal_evidence';
  id: string;
  version: number;
  digest: DigestRef;
  assertionClass: DeveloperRemoteTerminalAssertionClassV1;
  provenance: {
    runtimeRef: RecordRef & { type: 'runtime'; version: number };
    deviceRef: string;
    observedAt: string;
    issuer?: string;
  };
  startedAt: string;
  completedAt: string;
}

export function isRuntimeObservedTerminalEvidenceRef(
  value: unknown,
): value is DeveloperRemoteTerminalEvidenceRefV1 {
  if (!value || typeof value !== 'object') return false;
  const ref = value as DeveloperRemoteTerminalEvidenceRefV1;
  return (
    ref.type === 'developer_adapter_terminal_evidence' &&
    typeof ref.id === 'string' &&
    ref.id.length > 0 &&
    Number.isInteger(ref.version) &&
    Number(ref.version) >= 1 &&
    isSharedJcsDigestRef(ref.digest) &&
    ref.assertionClass === DEVELOPER_REMOTE_TERMINAL_WRITE_ASSERTION_CLASS_V1 &&
    typeof ref.startedAt === 'string' &&
    Number.isFinite(Date.parse(ref.startedAt)) &&
    typeof ref.completedAt === 'string' &&
    Number.isFinite(Date.parse(ref.completedAt)) &&
    typeof ref.provenance?.deviceRef === 'string' &&
    ref.provenance.deviceRef.length > 0 &&
    typeof ref.provenance.observedAt === 'string' &&
    Number.isFinite(Date.parse(ref.provenance.observedAt)) &&
    ref.provenance.runtimeRef?.type === 'runtime' &&
    typeof ref.provenance.runtimeRef.id === 'string' &&
    ref.provenance.runtimeRef.id.length > 0 &&
    Number.isInteger(ref.provenance.runtimeRef.version) &&
    Number(ref.provenance.runtimeRef.version) >= 1
  );
}

/** Binding stored on a developer-remote Action. Verified refs and digests only. */
export interface DeveloperRemoteInstructionBindingV1 {
  sessionRef: string;
  instructionRef: string;
  agentId: string;
  tenantRef: string | null;
  requestDigest: DigestRef;
  payloadRef: DeveloperEncryptedDataRefV1 & { dataKind: 'instruction' };
  bindingVersion: number;
  runtimeRef: RecordRef & { type: 'runtime'; version: number };
  shellSessionRef: {
    type: 'shell_session_binding';
    id: string;
    version: number;
  };
  deviceRef: string;
  adapterManifestRef: string;
  providerRef: PartyRef & { kind: 'provider' };
  onceGrantRef?: string;
  authorityDecisionRef?: RecordRef & {
    type: 'authority_decision';
    version: number;
    digest: DigestRef;
  };
  lastTerminalAt?: string;
  runtimeObservation?: {
    status: 'failed' | 'cancelled' | 'unknown_outcome';
    evidenceRef: DeveloperRemoteTerminalEvidenceRefV1;
    recordedAt: string;
  };
  authorityBinding?: {
    toolArgumentsDigest: DigestRef;
    workspaceScopeDigest: DigestRef;
    risk: string;
    scope: string;
    expiresAt: string;
    bindingVersion: number;
    localConfirmationRef?: string;
    decisionDigest: DigestRef;
    grantRef: string;
    grantStatus: 'active' | 'revoked' | 'expired';
  };
}

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
  /** Additive developer-remote binding (DRW). Chat-tool tasks omit it. */
  remoteBinding?: DeveloperRemoteInstructionBindingV1;
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
  /** Additive (DRW); rejected by the chat-tool create path. */
  remoteInstruction?: DeveloperRemoteInstructionBindingV1;
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
