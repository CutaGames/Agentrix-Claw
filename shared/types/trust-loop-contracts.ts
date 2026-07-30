/**
 * Soul Core Action Trust Loop v1.1 — the nine versioned canonical contracts
 * (TL-01.1), following the semantic skeletons in design.md §3.
 *
 * Append-only, authority-scoped, contextual, explainable, privacy-minimizing.
 * All timestamps are RFC 3339 UTC strings; all money is {@link Money} (never a
 * JS number); every digest carries its algorithm + canonicalization version;
 * every id is an opaque, unguessable, globally stable value.
 *
 * Enum values are declared once as `readonly` arrays and the string-union types
 * are derived from them, so runtime validation, OpenAPI generation and golden
 * vectors all share a single source of truth.
 */

import type { EnforcementLayer } from './authority';
import type { ActionAttributionV1 } from './agent-attribution';
import type {
  DataClass,
  DigestRef,
  EnforcementEvidenceState,
  EnforcementLayerEvidence,
  EvidenceRef,
  Money,
  PartyRef,
  PolicyCeiling,
  RecordRef,
  SignedIntegrity,
  TrustLoopSchemaVersion,
} from './trust-loop-primitives';

// ---------------------------------------------------------------------------
// Shared enums (single source of truth)
// ---------------------------------------------------------------------------

export const RISK_MODES = ['off', 'shadow', 'advisory', 'policy_enforced'] as const;
export type RiskMode = (typeof RISK_MODES)[number];

export const ACTION_CONTEXT_LIFECYCLE_STATES = [
  'draft',
  'authorized',
  'executing',
  'completed',
  'failed',
  'cancelled',
] as const;
export type ActionContextLifecycleState = (typeof ACTION_CONTEXT_LIFECYCLE_STATES)[number];

export const EXECUTION_STATUSES = [
  'succeeded',
  'partially_succeeded',
  'failed',
  'cancelled',
  'unknown',
] as const;
export type ExecutionStatus = (typeof EXECUTION_STATUSES)[number];

/** How strongly an asserted value is backed (R3.2, R3.5, Property 4). */
export const ASSERTION_CLASSES = [
  'self_asserted',
  'runtime_observed',
  'authority_confirmed',
] as const;
export type AssertionClass = (typeof ASSERTION_CLASSES)[number];

export const SETTLEMENT_STATUSES = [
  'not_required',
  'pending',
  'settled',
  'refund_pending',
  'reversed',
  'failed',
  'unknown',
] as const;
export type SettlementStatus = (typeof SETTLEMENT_STATUSES)[number];

export const INDEPENDENCE_CLASSES = [
  'self_asserted',
  'platform_verified',
  'counterparty_verified',
  'independent_external',
] as const;
export type IndependenceClass = (typeof INDEPENDENCE_CLASSES)[number];

/** Verification verdicts. Note: there is deliberately no `unknown`/`active`; an
 * unrecognized verdict fails closed and is never treated as `verified`. */
export const VERDICTS = ['verified', 'partially_verified', 'rejected', 'inconclusive'] as const;
export type Verdict = (typeof VERDICTS)[number];

export const CREDENTIAL_STATUSES = [
  'active',
  'suspended',
  'revoked',
  'expired',
  'unknown',
] as const;
export type CredentialStatus = (typeof CREDENTIAL_STATUSES)[number];

export const DISPUTE_STATES = [
  'opened',
  'evidence_collection',
  'under_review',
  'resolved',
  'rejected',
  'withdrawn',
  'escalated',
] as const;
export type DisputeState = (typeof DISPUTE_STATES)[number];

export const REMEDY_TYPES = [
  'refund',
  'partial_refund',
  'payment_reversal',
  'redo',
  'credential_correction',
  'credential_revocation',
  'reputation_reprojection',
  'non_monetary',
  'unknown',
] as const;
export type RemedyType = (typeof REMEDY_TYPES)[number];

export const REMEDY_STATUSES = [
  'requested',
  'in_progress',
  'confirmed',
  'failed',
  'not_required',
  'unknown',
] as const;
export type RemedyStatus = (typeof REMEDY_STATUSES)[number];

export const DISPUTE_RESOLUTION_OUTCOMES = [
  'upheld',
  'partially_upheld',
  'rejected',
  'withdrawn',
  'escalated',
] as const;
export type DisputeResolutionOutcome = (typeof DISPUTE_RESOLUTION_OUTCOMES)[number];

/** Minimum contextual reputation dimensions (R7.1). */
export const REPUTATION_DIMENSION_KEYS = [
  'reliability',
  'completion_quality',
  'cost_deviation',
  'dispute_remedy',
  'verification_coverage',
] as const;
export type ReputationDimensionKey = (typeof REPUTATION_DIMENSION_KEYS)[number];

export const REPUTATION_UNCERTAINTY_STATUSES = [
  'sufficient',
  'limited',
  'insufficient_evidence',
] as const;
export type ReputationUncertaintyStatus = (typeof REPUTATION_UNCERTAINTY_STATUSES)[number];

export const CONTRIBUTION_DIRECTIONS = ['positive', 'negative', 'neutral'] as const;
export type ContributionDirection = (typeof CONTRIBUTION_DIRECTIONS)[number];

export const RISK_RECOMMENDATIONS = [
  'allow',
  'allow_with_step_up',
  'pause',
  'deny',
  'insufficient_evidence',
] as const;
export type RiskRecommendation = (typeof RISK_RECOMMENDATIONS)[number];

/** Only tightening actions exist here — risk can never raise a ceiling (R9.4, Property 8). */
export const RISK_ENFORCEMENT_ACTIONS = [
  'deny',
  'pause',
  'step_up',
  'reduce_limit',
  'shorten_session',
  'require_additional_verifier',
  'require_quorum',
] as const;
export type RiskEnforcementAction = (typeof RISK_ENFORCEMENT_ACTIONS)[number];

export const AUTHORITY_DECISIONS = [
  'allow',
  'allow_with_step_up',
  'pause',
  'deny',
  'unknown',
] as const;
export type AuthorityDecision = (typeof AUTHORITY_DECISIONS)[number];

export const FEEDBACK_RIGHT_KINDS = [
  'notice',
  'explanation',
  'access_sources',
  'correct',
  'contest',
  'appeal',
  'human_review',
] as const;
export type FeedbackRightKind = (typeof FEEDBACK_RIGHT_KINDS)[number];

export const FEEDBACK_RIGHT_STATES = [
  'offered',
  'exercised',
  'under_review',
  'resolved',
  'expired',
] as const;
export type FeedbackRightState = (typeof FEEDBACK_RIGHT_STATES)[number];

// ---------------------------------------------------------------------------
// 3.1 ActionContextV1
// ---------------------------------------------------------------------------

export interface ActionIntent {
  type: string;
  digest: DigestRef;
  summary?: string;
}

export interface ActionCapability {
  tool: string;
  operation: string;
  scope: string[];
}

export interface ActionTarget {
  resourceRef?: string;
  counterparty?: PartyRef;
  environment: string;
}

export interface ActionEconomics {
  quoteRef?: string;
  maxCost?: Money;
  paymentAuthority?: PartyRef;
}

export interface ActionPolicy {
  policyRef: string;
  version: string;
  ownerCeiling?: PolicyCeiling;
}

/**
 * Additive ADR-SOUL-002 attribution/provenance sidecar. Historical V1 rows may
 * omit it and MUST then be presented as unknown rather than inferred from the
 * current owner/Soul Core mapping.
 */
export interface TrustActionProvenanceV1 {
  attribution: ActionAttributionV1;
  source: 'action_runtime_task' | 'task_proof_v2' | 'compatibility_v1';
  sourceId: string;
  taskProofRef?: RecordRef;
  canonicalProofDigest?: DigestRef;
  cryptographicallyBound: boolean;
}

/** Action-front context frozen before any irreversible side effect (R2). */
export interface ActionContextV1 {
  schemaVersion: TrustLoopSchemaVersion;
  contextId: string;
  contextVersion: number;
  actionId: string;
  taskId?: string;
  actor: PartyRef;
  agent: PartyRef;
  owner: PartyRef;
  intent: ActionIntent;
  capability: ActionCapability;
  target?: ActionTarget;
  economics?: ActionEconomics;
  policy: ActionPolicy;
  enforcementLayers: EnforcementLayerEvidence[];
  riskMode: RiskMode;
  privacyClass: DataClass;
  lifecycleState: ActionContextLifecycleState;
  validFrom: string;
  expiresAt?: string;
  authorizedAt?: string;
  authorizingAuthority?: PartyRef;
  /** Additive sidecar; deliberately excluded from the frozen V1 material projection. */
  provenance?: TrustActionProvenanceV1;
  canonicalDigest: DigestRef;
  createdAt: string;
  integrity: SignedIntegrity;
}

// ---------------------------------------------------------------------------
// 3.2 OutcomeRecordV1
// ---------------------------------------------------------------------------

/** A business result value plus how strongly it is backed and by whom. */
export interface AssertionValue {
  value: string;
  assertionClass: AssertionClass;
  source?: PartyRef;
  detail?: string;
}

/** Expected values — sourced from the ActionContext (R3.2). */
export interface OutcomeExpectation {
  maxCost?: Money;
  deliverableSummary?: string;
  sourceRef?: RecordRef;
}

/** Actual values — sourced from runtime / tool / payment authority, with attribution (R3.2). */
export interface OutcomeActual {
  actualCost?: Money;
  deliverableSummary?: string;
  effectSummary?: string;
  source: PartyRef;
}

/** Settlement is orthogonal to execution — "tool ok but debit unknown" cannot collapse to done (design §6.1). */
export interface SettlementSnapshot {
  status: SettlementStatus;
  quote?: Money;
  authorized?: Money;
  actualDebit?: Money;
  refunded?: Money;
  net?: Money;
  paymentAuthority?: PartyRef;
  settlementRefs: RecordRef[];
  confirmedAt?: string;
}

export interface OutcomeRecordV1 {
  schemaVersion: TrustLoopSchemaVersion;
  outcomeId: string;
  actionId: string;
  taskId?: string;
  contextId: string;
  contextDigest: DigestRef;
  executionStatus: ExecutionStatus;
  businessOutcome: AssertionValue;
  expected?: OutcomeExpectation;
  actual?: OutcomeActual;
  settlement: SettlementSnapshot;
  artifacts: EvidenceRef[];
  producer: PartyRef;
  assertionClass: AssertionClass;
  /** New records bind Agent accountability and, when available, TaskProof V2. */
  provenance?: TrustActionProvenanceV1;
  supersedesOutcomeId?: string;
  occurredAt: string;
  recordedAt: string;
  integrity: SignedIntegrity;
}

/**
 * Read-only composed view for one action's trust-loop timeline (TL-01.4 read
 * surface). `legacy` is true when the action has NO trust-loop records, so the
 * UI shows `self_asserted/unknown` instead of fabricating verifier/status.
 */
export interface TrustActionTimelineV1 {
  schemaVersion: TrustLoopSchemaVersion;
  actionId: string;
  context: ActionContextV1 | null;
  outcomes: OutcomeRecordV1[];
  legacy: boolean;
}

// ---------------------------------------------------------------------------
// 3.3 VerificationResultV1
// ---------------------------------------------------------------------------

/** A single claim within a verification plus its evidentiary boundary (R4.5). */
export interface VerificationClaim {
  claimId: string;
  statement: string;
  scope: string;
  result: Verdict;
  canProve?: string;
  cannotProve?: string;
}

export interface VerificationMethod {
  id: string;
  version: string;
}

export interface VerificationResultV1 {
  schemaVersion: TrustLoopSchemaVersion;
  verificationId: string;
  subjectRefs: RecordRef[];
  verifier: PartyRef;
  independenceClass: IndependenceClass;
  method: VerificationMethod;
  /** Challenge binding retained in the signed result when challenge-based. */
  challengeId?: string;
  purpose?: string;
  claims: VerificationClaim[];
  evidenceRefs: EvidenceRef[];
  verdict: Verdict;
  reasonCodes: string[];
  issuedAt: string;
  expiresAt?: string;
  supersedesVerificationId?: string;
  signature: SignedIntegrity;
}

// ---------------------------------------------------------------------------
// 3.4 CredentialStatusV1
// ---------------------------------------------------------------------------

export interface CredentialStatusV1 {
  schemaVersion: TrustLoopSchemaVersion;
  statusId: string;
  credentialRef: RecordRef;
  status: CredentialStatus;
  statusVersion: number;
  effectiveAt: string;
  reasonCode?: string;
  authority: PartyRef;
  nextUpdateAt?: string;
  integrity: SignedIntegrity;
}

// ---------------------------------------------------------------------------
// 3.5 DisputeCaseV1
// ---------------------------------------------------------------------------

export interface DisputeClaim {
  claimId: string;
  statement: string;
  contestedRef: RecordRef;
}

export interface RemedyRequest {
  remedyId: string;
  type: RemedyType;
  amount?: Money;
  description?: string;
}

/** A confirmed remedy. Only the settlement authority may mark a monetary remedy
 * `confirmed` (R6.5, Property 9). */
export interface RemedyOutcome {
  remedyId: string;
  type: RemedyType;
  status: RemedyStatus;
  confirmedBy?: PartyRef;
  settlementRef?: RecordRef;
  confirmedAt?: string;
}

export interface DisputeResolution {
  outcome: DisputeResolutionOutcome;
  decidedBy: PartyRef;
  decidedAt: string;
  reasonCodes: string[];
  remedies: RemedyOutcome[];
}

export interface DisputeSla {
  openedAt: string;
  responseDueAt?: string;
  resolutionDueAt?: string;
}

export interface DisputeCaseV1 {
  schemaVersion: TrustLoopSchemaVersion;
  disputeId: string;
  contestedRefs: RecordRef[];
  claimant: PartyRef;
  respondents: PartyRef[];
  claims: DisputeClaim[];
  evidenceRefs: EvidenceRef[];
  requestedRemedies: RemedyRequest[];
  state: DisputeState;
  authority?: PartyRef;
  sla: DisputeSla;
  resolution?: DisputeResolution;
  privacyClass: DataClass;
  version: number;
  integrity: SignedIntegrity;
}

// ---------------------------------------------------------------------------
// 3.6 ReputationCardV1
// ---------------------------------------------------------------------------

/** Context dimensions along which a card is projected (design §7.1). */
export interface ReputationContext {
  actionClass?: string;
  toolClass?: string;
  domain?: string;
  role?: string;
  counterpartyClass?: string;
  economicBand?: string;
  enforcementProfile?: string;
  environment?: string;
}

export interface ReputationDimension {
  dimension: ReputationDimensionKey | string;
  /** null when there is not enough evidence for this dimension. */
  value: number | null;
  unit?: string;
  confidence?: number;
  sampleSize: number;
}

export interface ContributionRef {
  label: string;
  direction: ContributionDirection;
  sourceRef: RecordRef;
  weight?: number;
}

export interface ReputationWindow {
  from: string;
  to: string;
}

export interface ReputationProjectorRef {
  id: string;
  version: string;
  inputSetDigest: DigestRef;
}

export interface ReputationSample {
  total: number;
  verified: number;
  disputed: number;
  remedied: number;
}

export interface ReputationUncertainty {
  status: ReputationUncertaintyStatus;
  reasons: string[];
}

export interface ReputationCardV1 {
  schemaVersion: TrustLoopSchemaVersion;
  cardId: string;
  subject: PartyRef;
  context: ReputationContext;
  window: ReputationWindow;
  projector: ReputationProjectorRef;
  dimensions: ReputationDimension[];
  sample: ReputationSample;
  evidenceDistribution: Record<string, number>;
  uncertainty: ReputationUncertainty;
  explanation: ContributionRef[];
  sourceManifestRef: string;
  generatedAt: string;
  integrity: SignedIntegrity;
}

// ---------------------------------------------------------------------------
// 3.7 AssuranceProfileV1
// ---------------------------------------------------------------------------

/** One assurance claim; `state` reuses the enforcement-evidence ladder
 * (claimed / observed / verified / enforced / unknown). */
export interface AssuranceClaim {
  claimId: string;
  category: string;
  state: EnforcementEvidenceState;
  evidenceRef?: RecordRef;
  note?: string;
  expiresAt?: string;
}

export interface AssuranceFreshness {
  evaluatedAt: string;
  expiresAt?: string;
  staleRefs: RecordRef[];
}

export interface AssuranceEvaluatorRef {
  id: string;
  version: string;
}

export interface AssuranceProfileV1 {
  schemaVersion: TrustLoopSchemaVersion;
  profileId: string;
  subject: PartyRef;
  identity: AssuranceClaim[];
  execution: AssuranceClaim[];
  enforcementLayers: EnforcementLayerEvidence[];
  verificationIndependence: AssuranceClaim[];
  hardware?: AssuranceClaim[];
  freshness: AssuranceFreshness;
  evaluator: AssuranceEvaluatorRef;
  generatedAt: string;
  integrity: SignedIntegrity;
}

// ---------------------------------------------------------------------------
// 3.8 RiskDecisionV1
// ---------------------------------------------------------------------------

export interface RiskEngineRef {
  id: string;
  version: string;
}

/** Proposed tightening only. There is no field that can raise a ceiling. */
export interface EnforcementProposal {
  actions: RiskEnforcementAction[];
  note?: string;
}

export interface AuthorityDecisionRef {
  decisionRef: RecordRef;
  decision: AuthorityDecision;
  enforcementLayers: EnforcementLayer[];
  decidedBy: PartyRef;
  decidedAt: string;
}

export interface RiskDecisionV1 {
  schemaVersion: TrustLoopSchemaVersion;
  decisionId: string;
  actionId: string;
  contextId: string;
  mode: RiskMode;
  engine: RiskEngineRef;
  inputSnapshotRefs: RecordRef[];
  recommendation: RiskRecommendation;
  proposedEnforcement?: EnforcementProposal;
  ownerPolicyCeiling: PolicyCeiling;
  reasonCodes: string[];
  uncertainty?: string[];
  actualAuthorityDecision?: AuthorityDecisionRef;
  expiresAt?: string;
  createdAt: string;
  integrity: SignedIntegrity;
}

// ---------------------------------------------------------------------------
// 3.9 FeedbackRightV1
// ---------------------------------------------------------------------------

export interface FeedbackRightV1 {
  schemaVersion: TrustLoopSchemaVersion;
  feedbackRightId: string;
  subject: PartyRef;
  triggerRefs: RecordRef[];
  rights: FeedbackRightKind[];
  deadline?: string;
  channel: string;
  state: FeedbackRightState;
  resultRefs?: RecordRef[];
  version: number;
  authority: PartyRef;
  createdAt: string;
  integrity: SignedIntegrity;
}

// ---------------------------------------------------------------------------
// Contract registry helpers
// ---------------------------------------------------------------------------

/** Stable names for the nine contracts, used by validation / governance / OpenAPI. */
export const TRUST_CONTRACT_NAMES = [
  'ActionContextV1',
  'OutcomeRecordV1',
  'VerificationResultV1',
  'CredentialStatusV1',
  'DisputeCaseV1',
  'ReputationCardV1',
  'AssuranceProfileV1',
  'RiskDecisionV1',
  'FeedbackRightV1',
] as const;
export type TrustContractName = (typeof TRUST_CONTRACT_NAMES)[number];

/** Type-level map from contract name to its interface (compile-time convenience). */
export interface TrustContractMap {
  ActionContextV1: ActionContextV1;
  OutcomeRecordV1: OutcomeRecordV1;
  VerificationResultV1: VerificationResultV1;
  CredentialStatusV1: CredentialStatusV1;
  DisputeCaseV1: DisputeCaseV1;
  ReputationCardV1: ReputationCardV1;
  AssuranceProfileV1: AssuranceProfileV1;
  RiskDecisionV1: RiskDecisionV1;
  FeedbackRightV1: FeedbackRightV1;
}
