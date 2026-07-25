import type {
  ActionAttributionV1,
  ActorRefV1,
  AuthorityRootRefV1,
} from './agent-attribution';
import { isRecordRefV1 } from './agent-attribution';
import {
  PARTY_KINDS,
  type DataClass,
  type DigestRef,
  type EvidenceRef,
  type Money,
  type PartyRef,
  type RecordRef,
  type SignedIntegrity,
} from './trust-loop-primitives';

/**
 * Agent Economy C0 — canonical cross-platform contract freeze.
 *
 * These DTOs correlate existing domain facts. They do not create a second
 * marketplace, Authority, ledger, settlement, Remedy, or Reputation writer.
 */
export const AGENT_ECONOMY_SCHEMA_VERSION = 1 as const;
export type AgentEconomySchemaVersion = typeof AGENT_ECONOMY_SCHEMA_VERSION;

export const DISCOVERABLE_KINDS_V1 = [
  'skill',
  'task',
  'resource',
  'product',
  'service',
  'agent',
] as const;
export type DiscoverableKindV1 = (typeof DISCOVERABLE_KINDS_V1)[number];

export const DISCOVERY_EXECUTION_STATES_V1 = [
  'discoverable',
  'requires_auth',
  'unavailable',
  'legacy',
  'regulated',
  'unknown',
] as const;
export type DiscoveryExecutionStateV1 = (typeof DISCOVERY_EXECUTION_STATES_V1)[number];

export interface CanonicalSourceRefV1 {
  source: string;
  sourceKind: 'marketplace' | 'creation' | 'agent' | 'internal';
  sourceId: string;
  sourceVersion?: string;
  projectionVersion: string;
  provenance: 'authoritative' | 'projected' | 'legacy_adapter';
  /** Stable record-level provenance; `source` remains the provider/source label. */
  provenanceRef?: RecordRef;
  capturedAt: string;
}

export interface DiscoveryFreshnessV1 {
  capturedAt: string;
  validUntil?: string;
  state: 'fresh' | 'stale' | 'unknown';
}

export interface PriceTermsV1 {
  quoteRequired: boolean;
  displayPrice?: Money;
  billingModel?: 'free' | 'one_time' | 'subscription' | 'usage' | 'negotiated' | 'unknown';
  termsRefs: RecordRef[];
}

export interface CanonicalDiscoveryItemV1 {
  schemaVersion: AgentEconomySchemaVersion;
  discoveryItemId: string;
  canonicalId: string;
  kind: DiscoverableKindV1;
  title: string;
  description?: string;
  source: CanonicalSourceRefV1;
  providerRef: PartyRef;
  creationRef?: RecordRef;
  offeringRef?: RecordRef;
  capabilities: string[];
  availability: 'available' | 'limited' | 'unavailable' | 'unknown';
  priceTerms: PriceTermsV1;
  trustSummaryRefs: RecordRef[];
  freshness: DiscoveryFreshnessV1;
  executionState: DiscoveryExecutionStateV1;
  integrity: SignedIntegrity;
}

export interface DiscoveryProviderFailureV1 {
  source: string;
  code: string;
  retryable: boolean;
  occurredAt: string;
}

export interface CanonicalDiscoveryQueryV1 {
  schemaVersion: AgentEconomySchemaVersion;
  query?: string;
  kinds?: DiscoverableKindV1[];
  limit?: number;
  cursor?: string;
}

export interface CanonicalDiscoveryResultV1 {
  schemaVersion: AgentEconomySchemaVersion;
  queryId: string;
  items: CanonicalDiscoveryItemV1[];
  failures: DiscoveryProviderFailureV1[];
  partial: boolean;
  generatedAt: string;
  nextCursor?: string;
}

export interface OwnershipSnapshotV1 {
  schemaVersion: AgentEconomySchemaVersion;
  snapshotId: string;
  agentId: string;
  soulCoreId: string;
  ownerRef: PartyRef;
  ownershipAuthorityRef: PartyRef;
  state: 'active' | 'transfer_pending' | 'recovery_pending' | 'revoked' | 'unknown';
  policyRefs: RecordRef[];
  capturedAt: string;
  integrity: SignedIntegrity;
}

export interface GoalConstraintsV1 {
  allowedKinds?: DiscoverableKindV1[];
  budgetCeiling?: Money;
  deadline?: string;
  dataClass?: DataClass;
  providerAllowlist?: string[];
  providerDenylist?: string[];
}

/**
 * Presentation is deliberately ref-only: raw Goal text remains outside this
 * contract and is represented here only by `intentDigest`.
 */
export interface GoalPresentationV1 {
  presentationRef: RecordRef;
  disclosure: 'reference_only' | 'safe_summary' | 'fully_redacted';
  audience: 'owner_only' | 'authorized_parties';
}

export interface GoalIntentV1 {
  schemaVersion: AgentEconomySchemaVersion;
  goalId: string;
  accountableAgentId: string;
  createdBy: PartyRef;
  intentDigest: DigestRef;
  constraints: GoalConstraintsV1;
  presentation?: GoalPresentationV1;
  status: 'active' | 'satisfied' | 'cancelled' | 'superseded';
  createdAt: string;
  supersedesGoalRef?: RecordRef;
  integrity: SignedIntegrity;
}

export interface ActionPlanV1 {
  schemaVersion: AgentEconomySchemaVersion;
  planId: string;
  goalRef: RecordRef;
  candidateRefs: RecordRef[];
  status: 'draft' | 'candidates_discovered' | 'candidate_selected' | 'cancelled' | 'superseded';
  selectedCandidateRef?: RecordRef;
  createdAt: string;
  updatedAt: string;
  integrity: SignedIntegrity;
}

export interface DiscoveryCandidateV1 {
  schemaVersion: AgentEconomySchemaVersion;
  candidateId: string;
  goalRef: RecordRef;
  planRef: RecordRef;
  discoveryItemRef: RecordRef;
  kind: DiscoverableKindV1;
  /** Owner-safe presentation copied from the canonical discovery projection. */
  title?: string;
  description?: string;
  providerRef: PartyRef;
  capabilities: string[];
  creationRef?: RecordRef;
  offeringRef?: RecordRef;
  source: CanonicalSourceRefV1;
  availability: CanonicalDiscoveryItemV1['availability'];
  /** Optional for records created before the Mobile Phase 2 projection. */
  freshness?: DiscoveryFreshnessV1;
  trustSummaryRefs?: RecordRef[];
  executionState: DiscoveryExecutionStateV1;
  priceTerms: PriceTermsV1;
  status: 'eligible' | 'selected' | 'rejected' | 'stale' | 'unavailable';
  selectedAt?: string;
  integrity: SignedIntegrity;
}

export interface ActionQuoteV1 {
  schemaVersion: AgentEconomySchemaVersion;
  quoteId: string;
  actionId: string;
  goalRef: RecordRef;
  candidateRef: RecordRef;
  providerRef: PartyRef;
  amount: Money;
  maximumAmount?: Money;
  termsRefs: RecordRef[];
  status: 'offered' | 'accepted' | 'expired' | 'revoked' | 'superseded';
  idempotencyKey: string;
  issuedAt: string;
  expiresAt: string;
  supersedesQuoteRef?: RecordRef;
  integrity: SignedIntegrity;
}

export interface ExecutionMandateV1 {
  schemaVersion: AgentEconomySchemaVersion;
  mandateId: string;
  actionId: string;
  accountableAgentId: string;
  principalRef: PartyRef;
  authorizerRef: PartyRef;
  authorityRootRef: AuthorityRootRefV1;
  delegationChainRef?: RecordRef;
  quoteRef: RecordRef;
  scope: string[];
  budgetCeiling: Money;
  allowedCandidateRefs: RecordRef[];
  policyRefs: RecordRef[];
  termsRefs: RecordRef[];
  requiredMechanisms: string[];
  /** Evidence that the mandate's required mechanisms were policy-bound. */
  requiredMechanismEvidenceRefs?: RecordRef[];
  /** Evidence of mechanisms actually present at the execution boundary. */
  actualMechanismEvidenceRefs?: RecordRef[];
  status: 'active' | 'revoked' | 'expired' | 'superseded';
  issuedAt: string;
  expiresAt: string;
  revokedAt?: string;
  supersedesMandateRef?: RecordRef;
  integrity: SignedIntegrity;
}

export interface BudgetReservationV1 {
  schemaVersion: AgentEconomySchemaVersion;
  reservationId: string;
  actionId: string;
  mandateRef: RecordRef;
  quoteRef: RecordRef;
  amount: Money;
  authorityRef: PartyRef;
  status: 'pending' | 'reserved' | 'released' | 'committed' | 'expired' | 'reconciliation_required';
  idempotencyKey: string;
  sourceReceiptRefs: RecordRef[];
  createdAt: string;
  expiresAt: string;
  updatedAt: string;
  integrity: SignedIntegrity;
}

export interface PaymentAttemptV1 {
  schemaVersion: AgentEconomySchemaVersion;
  paymentAttemptId: string;
  actionId: string;
  reservationRef: RecordRef;
  settlementAuthorityRef: PartyRef;
  amount: Money;
  rail: string;
  status: 'not_started' | 'pending' | 'succeeded' | 'failed' | 'unknown_outcome';
  idempotencyKey: string;
  authorityReceiptRefs: RecordRef[];
  createdAt: string;
  updatedAt: string;
  integrity: SignedIntegrity;
}

export interface SettlementEventV1 {
  schemaVersion: AgentEconomySchemaVersion;
  settlementEventId: string;
  actionId: string;
  paymentAttemptRef: RecordRef;
  settlementAuthorityRef: PartyRef;
  eventType:
    | 'debit_pending'
    | 'debit_confirmed'
    | 'refund_pending'
    | 'refund_confirmed'
    | 'reversal_confirmed'
    | 'reconciliation_required';
  status: 'pending' | 'confirmed' | 'failed' | 'unknown';
  amount: Money;
  sourceReceiptRef?: RecordRef;
  occurredAt: string;
  integrity: SignedIntegrity;
}

export interface AttributionLineageV1 {
  schemaVersion: AgentEconomySchemaVersion;
  attributionLineageId: string;
  actionId: string;
  attribution: ActionAttributionV1;
  providerParties: PartyRef[];
  executorParties: PartyRef[];
  creationRef?: RecordRef;
  offeringRef?: RecordRef;
  sourceRefs: RecordRef[];
  recordedAt: string;
  integrity: SignedIntegrity;
}

export interface ResponsibilityLineageV1 {
  schemaVersion: AgentEconomySchemaVersion;
  responsibilityLineageId: string;
  actionId: string;
  attributionLineageRef: RecordRef;
  accountableAgentId: string;
  principalRef: PartyRef;
  authorizerRef: PartyRef;
  authorityRootRef: AuthorityRootRefV1;
  mandateRef: RecordRef;
  delegationChainRef?: RecordRef;
  responsibilityAgreementRef?: RecordRef;
  providerParties: PartyRef[];
  executorParties: PartyRef[];
  settlementAuthorityRef?: PartyRef;
  settlementParties: PartyRef[];
  remedyAuthorityRef?: PartyRef;
  remedyParties: PartyRef[];
  governingPolicyRefs: RecordRef[];
  termsRefs: RecordRef[];
  sourceRefs: RecordRef[];
  status: 'complete' | 'incomplete' | 'unverifiable';
  missingOrAmbiguousRefs: string[];
  projectedBy: PartyRef;
  projectedAt: string;
  integrity: SignedIntegrity;
}

export interface CommissionAllocationV1 {
  beneficiaryRef: PartyRef;
  amount: Money;
  role: 'provider' | 'referrer' | 'platform' | 'other';
  status: 'calculated' | 'payable' | 'paid' | 'reversed';
  sourceSettlementRef: RecordRef;
  reversalRef?: RecordRef;
}

export interface CommissionAllocationViewV1 {
  schemaVersion: AgentEconomySchemaVersion;
  allocationViewId: string;
  actionId: string;
  policyRef: RecordRef;
  allocations: CommissionAllocationV1[];
  status: 'projected' | 'partially_paid' | 'paid' | 'reversed' | 'unverifiable';
  projectorRef: PartyRef;
  generatedAt: string;
  integrity: SignedIntegrity;
}

export interface RemedyCaseV1 {
  schemaVersion: AgentEconomySchemaVersion;
  remedyCaseId: string;
  actionId: string;
  actionReceiptRef: RecordRef;
  disputeRef?: RecordRef;
  claimantRef: PartyRef;
  respondentRefs: PartyRef[];
  remedyAuthorityRef: PartyRef;
  requestedRemedies: Array<'refund' | 'reversal' | 'rework' | 'correction' | 'other'>;
  state: 'open' | 'under_review' | 'authorized' | 'rejected' | 'completed' | 'appealed';
  settlementEventRefs: RecordRef[];
  evidenceRefs: EvidenceRef[];
  createdAt: string;
  resolvedAt?: string;
  integrity: SignedIntegrity;
}

export interface ContextualReputationCardV1 {
  schemaVersion: AgentEconomySchemaVersion;
  contextualCardId: string;
  accountableAgentId: string;
  reputationCardRef: RecordRef;
  context: Record<string, string>;
  window: { from: string; to: string };
  eligibleEvidenceRefs: RecordRef[];
  excludedEvidenceRefs: Array<{ ref: RecordRef; reason: string }>;
  status: 'sufficient_evidence' | 'insufficient_evidence' | 'stale' | 'unverifiable';
  projectorRef: PartyRef;
  generatedAt: string;
  integrity: SignedIntegrity;
}

export const PAYMENT_SETTLEMENT_DISPOSITIONS_V1 = [
  'not_required',
  'pending',
  'completed',
  'unavailable',
  'not_loaded',
  'unknown',
] as const;
export type PaymentDispositionV1 = (typeof PAYMENT_SETTLEMENT_DISPOSITIONS_V1)[number];
export type SettlementDispositionV1 = PaymentDispositionV1;

export const REMEDY_DISPOSITIONS_V1 = [
  'not_required',
  'not_opened',
  'pending',
  'completed',
  'unavailable',
  'not_loaded',
  'unknown',
] as const;
export type RemedyDispositionV1 = (typeof REMEDY_DISPOSITIONS_V1)[number];

export interface ActionReceiptV1 {
  schemaVersion: AgentEconomySchemaVersion;
  actionReceiptId: string;
  actionId: string;
  accountableAgentId: string;
  goalRef: RecordRef;
  planRef?: RecordRef;
  candidateRef: RecordRef;
  quoteRef?: RecordRef;
  mandateRef: RecordRef;
  budgetReservationRef?: RecordRef;
  executionRefs: RecordRef[];
  /** Optional for legacy v1 records; absence normalizes to `unknown`. */
  paymentDisposition?: PaymentDispositionV1;
  paymentAttemptRefs: RecordRef[];
  /** Optional for legacy v1 records; absence normalizes to `unknown`. */
  settlementDisposition?: SettlementDispositionV1;
  settlementRefs: RecordRef[];
  outcomeRef: RecordRef;
  proofRefs: RecordRef[];
  verificationRefs: RecordRef[];
  evidenceRefs: EvidenceRef[];
  responsibilityLineageRef: RecordRef;
  /** Optional for legacy v1 records; absence normalizes to `unknown`. */
  remedyDisposition?: RemedyDispositionV1;
  remedyRefs: RecordRef[];
  status: 'draft' | 'complete' | 'unverifiable' | 'superseded';
  missingOrInvalidRefs: string[];
  sourceManifestRef: string;
  generatedAt: string;
  integrity: SignedIntegrity;
}

export const AGENT_ECONOMY_CONTRACT_FAMILY_V1 = [
  'OwnershipSnapshotV1',
  'GoalIntentV1',
  'ActionPlanV1',
  'DiscoveryCandidateV1',
  'ActionQuoteV1',
  'ExecutionMandateV1',
  'BudgetReservationV1',
  'PaymentAttemptV1',
  'SettlementEventV1',
  'ActionReceiptV1',
  'ActionAttributionV1',
  'AttributionLineageV1',
  'ResponsibilityLineageV1',
  'CommissionAllocationViewV1',
  'RemedyCaseV1',
  'ContextualReputationCardV1',
] as const;

export type AgentEconomyContractNameV1 = (typeof AGENT_ECONOMY_CONTRACT_FAMILY_V1)[number];

/**
 * C0 source-of-truth map. `derived` authorities may only project source refs;
 * they cannot promote another domain's terminal state.
 */
export const AGENT_ECONOMY_WRITE_AUTHORITIES_V1 = {
  ownership: { authority: 'agent-soul-core-platform', derived: false },
  creation: { authority: 'creation-domain', derived: false },
  discoveryIndex: { authority: 'marketplace-discovery-projector', derived: true },
  goalPlanActionLifecycle: { authority: 'action-runtime', derived: false },
  mandate: { authority: 'sovereignty-control-plane', derived: false },
  paymentSettlementRefund: { authority: 'payment-settlement-domain', derived: false },
  commissionPolicyAllocation: { authority: 'commission-domain', derived: false },
  outcomeTaskProof: { authority: 'action-trust-producers', derived: false },
  disputeRemedy: { authority: 'dispute-remedy-domain', derived: false },
  responsibilityLineage: { authority: 'responsibility-lineage-projector', derived: true },
  contextualReputation: { authority: 'trust-reputation-projector', derived: true },
} as const;

export const AGENT_ECONOMY_LEGACY_ADAPTERS_V1 = {
  task: { targetKinds: ['task'], mode: 'preserve' },
  skill: { targetKinds: ['skill'], mode: 'preserve' },
  resource: { targetKinds: ['resource'], mode: 'preserve' },
  agent_rental: { targetKinds: ['agent'], mode: 'legacy_adapter' },
  prediction: { targetKinds: [], mode: 'regulated_legacy_lane' },
  creation: { targetKinds: ['product', 'service', 'resource', 'agent'], mode: 'explicit_metadata_only' },
} as const;

export interface AgentEconomyValidationResultV1 {
  valid: boolean;
  errors: string[];
}

export class AgentEconomyContractValidationError extends Error {
  readonly code = 'agent_economy_contract_invalid';
  constructor(readonly errors: string[]) {
    super(`Agent Economy contract validation failed: ${errors.join('; ')}`);
    this.name = 'AgentEconomyContractValidationError';
  }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isStringArray(value: unknown, allowEmpty = true): value is string[] {
  return Array.isArray(value) && (allowEmpty || value.length > 0) && value.every(isNonEmptyString);
}

function isUniqueNonEmptyStringArray(value: unknown): value is string[] {
  return isStringArray(value, false) && new Set(value).size === value.length;
}

function isPartyRef(value: unknown): value is PartyRef {
  if (!isObject(value) || !isNonEmptyString(value.kind) || !isNonEmptyString(value.id)) return false;
  return (PARTY_KINDS as readonly string[]).includes(value.kind);
}

function isPartyRefArray(value: unknown, allowEmpty = true): value is PartyRef[] {
  return Array.isArray(value) && (allowEmpty || value.length > 0) && value.every(isPartyRef);
}

function isMoney(value: unknown): value is Money {
  if (!isObject(value)) return false;
  return (
    typeof value.amountMinor === 'string' &&
    /^(0|[1-9][0-9]*)$/.test(value.amountMinor) &&
    isNonEmptyString(value.currency) &&
    Number.isInteger(value.decimals) &&
    Number(value.decimals) >= 0
  );
}

function isDigestRef(value: unknown): value is DigestRef {
  return (
    isObject(value)
    && value.algorithm === 'sha-256'
    && isNonEmptyString(value.canonicalization)
    && typeof value.value === 'string'
    && /^[0-9a-f]{64}$/.test(value.value)
  );
}

function isIntegrity(value: unknown): value is SignedIntegrity {
  if (!isObject(value) || (value.type !== 'digest' && value.type !== 'signature')) return false;
  return isDigestRef(value.payloadDigest);
}

function isRecordRefArray(value: unknown, allowEmpty = true): value is RecordRef[] {
  return Array.isArray(value) && (allowEmpty || value.length > 0) && value.every(isRecordRefV1);
}

function validateBase(input: unknown, label: string): { value?: Record<string, unknown>; errors: string[] } {
  if (!isObject(input)) return { errors: [`${label}: expected object`] };
  const errors: string[] = [];
  if (input.schemaVersion !== AGENT_ECONOMY_SCHEMA_VERSION) {
    errors.push(`${label}.schemaVersion: unsupported version ${JSON.stringify(input.schemaVersion)}`);
  }
  if (!isIntegrity(input.integrity)) errors.push(`${label}.integrity: invalid or missing integrity binding`);
  return { value: input, errors };
}

function isPaymentSettlementDisposition(value: unknown): value is PaymentDispositionV1 {
  return (PAYMENT_SETTLEMENT_DISPOSITIONS_V1 as readonly unknown[]).includes(value);
}

function isRemedyDisposition(value: unknown): value is RemedyDispositionV1 {
  return (REMEDY_DISPOSITIONS_V1 as readonly unknown[]).includes(value);
}

export interface NormalizedActionReceiptDispositionsV1 {
  paymentDisposition: PaymentDispositionV1;
  settlementDisposition: SettlementDispositionV1;
  remedyDisposition: RemedyDispositionV1;
}

/** Legacy v1 receipts omitted dispositions; consumers must render those as unknown. */
export function normalizeActionReceiptDispositionsV1(input: {
  paymentDisposition?: unknown;
  settlementDisposition?: unknown;
  remedyDisposition?: unknown;
}): NormalizedActionReceiptDispositionsV1 {
  return {
    paymentDisposition: isPaymentSettlementDisposition(input.paymentDisposition)
      ? input.paymentDisposition
      : 'unknown',
    settlementDisposition: isPaymentSettlementDisposition(input.settlementDisposition)
      ? input.settlementDisposition
      : 'unknown',
    remedyDisposition: isRemedyDisposition(input.remedyDisposition)
      ? input.remedyDisposition
      : 'unknown',
  };
}

export function validateCanonicalDiscoveryItemV1(input: unknown): AgentEconomyValidationResultV1 {
  const { value, errors } = validateBase(input, 'discoveryItem');
  if (!value) return { valid: false, errors };
  if (!isNonEmptyString(value.discoveryItemId)) errors.push('discoveryItem.discoveryItemId: required');
  if (!isNonEmptyString(value.canonicalId)) errors.push('discoveryItem.canonicalId: required');
  if (!(DISCOVERABLE_KINDS_V1 as readonly unknown[]).includes(value.kind)) errors.push('discoveryItem.kind: unknown');
  if (!isPartyRef(value.providerRef)) errors.push('discoveryItem.providerRef: invalid');
  if (!isStringArray(value.capabilities)) errors.push('discoveryItem.capabilities: invalid');
  if (!(DISCOVERY_EXECUTION_STATES_V1 as readonly unknown[]).includes(value.executionState)) {
    errors.push('discoveryItem.executionState: unknown');
  }
  if (!isObject(value.source)) {
    errors.push('discoveryItem.source: invalid');
  } else if (value.source.provenanceRef !== undefined && !isRecordRefV1(value.source.provenanceRef)) {
    errors.push('discoveryItem.source.provenanceRef: invalid');
  }
  return { valid: errors.length === 0, errors };
}

export function validateGoalIntentV1(input: unknown): AgentEconomyValidationResultV1 {
  const { value, errors } = validateBase(input, 'goalIntent');
  if (!value) return { valid: false, errors };
  for (const key of ['goalId', 'accountableAgentId', 'createdAt']) {
    if (!isNonEmptyString(value[key])) errors.push(`goalIntent.${key}: required`);
  }
  if (!isPartyRef(value.createdBy)) errors.push('goalIntent.createdBy: invalid');
  if (!isDigestRef(value.intentDigest)) errors.push('goalIntent.intentDigest: invalid');
  if (!isObject(value.constraints)) errors.push('goalIntent.constraints: invalid');
  if (value.supersedesGoalRef !== undefined && !isRecordRefV1(value.supersedesGoalRef)) {
    errors.push('goalIntent.supersedesGoalRef: invalid');
  }
  if (value.presentation !== undefined) {
    if (!isObject(value.presentation)) {
      errors.push('goalIntent.presentation: invalid');
    } else {
      if (!isRecordRefV1(value.presentation.presentationRef)) {
        errors.push('goalIntent.presentation.presentationRef: invalid');
      }
      if (!['reference_only', 'safe_summary', 'fully_redacted'].includes(String(value.presentation.disclosure))) {
        errors.push('goalIntent.presentation.disclosure: unknown');
      }
      if (!['owner_only', 'authorized_parties'].includes(String(value.presentation.audience))) {
        errors.push('goalIntent.presentation.audience: unknown');
      }
    }
  }
  if (!['active', 'satisfied', 'cancelled', 'superseded'].includes(String(value.status))) {
    errors.push('goalIntent.status: unknown');
  }
  return { valid: errors.length === 0, errors };
}

export function validateExecutionMandateV1(input: unknown): AgentEconomyValidationResultV1 {
  const { value, errors } = validateBase(input, 'mandate');
  if (!value) return { valid: false, errors };
  for (const key of ['mandateId', 'actionId', 'accountableAgentId', 'issuedAt', 'expiresAt']) {
    if (!isNonEmptyString(value[key])) errors.push(`mandate.${key}: required`);
  }
  if (!isPartyRef(value.principalRef)) errors.push('mandate.principalRef: invalid');
  if (!isPartyRef(value.authorizerRef)) errors.push('mandate.authorizerRef: invalid');
  if (!isRecordRefV1(value.quoteRef)) errors.push('mandate.quoteRef: invalid');
  if (!isMoney(value.budgetCeiling)) errors.push('mandate.budgetCeiling: non-negative Money required');
  if (!isRecordRefArray(value.allowedCandidateRefs, false)) errors.push('mandate.allowedCandidateRefs: at least one ref required');
  if (!isRecordRefArray(value.policyRefs, false)) errors.push('mandate.policyRefs: at least one ref required');
  if (!isRecordRefArray(value.termsRefs, false)) errors.push('mandate.termsRefs: at least one ref required');
  if (!isStringArray(value.scope, false)) errors.push('mandate.scope: at least one scope required');
  if (!isUniqueNonEmptyStringArray(value.requiredMechanisms)) {
    errors.push('mandate.requiredMechanisms: at least one unique mechanism required');
  }
  if (
    value.requiredMechanismEvidenceRefs !== undefined
    && !isRecordRefArray(value.requiredMechanismEvidenceRefs, false)
  ) {
    errors.push('mandate.requiredMechanismEvidenceRefs: at least one valid ref required when present');
  }
  if (
    value.actualMechanismEvidenceRefs !== undefined
    && !isRecordRefArray(value.actualMechanismEvidenceRefs, false)
  ) {
    errors.push('mandate.actualMechanismEvidenceRefs: at least one valid ref required when present');
  }
  if (!['active', 'revoked', 'expired', 'superseded'].includes(String(value.status))) {
    errors.push('mandate.status: unknown');
  }
  return { valid: errors.length === 0, errors };
}

export function validateResponsibilityLineageV1(input: unknown): AgentEconomyValidationResultV1 {
  const { value, errors } = validateBase(input, 'responsibilityLineage');
  if (!value) return { valid: false, errors };
  for (const key of ['responsibilityLineageId', 'actionId', 'accountableAgentId', 'projectedAt']) {
    if (!isNonEmptyString(value[key])) errors.push(`responsibilityLineage.${key}: required`);
  }
  if (!isRecordRefV1(value.attributionLineageRef)) errors.push('responsibilityLineage.attributionLineageRef: invalid');
  if (!isRecordRefV1(value.mandateRef)) errors.push('responsibilityLineage.mandateRef: invalid');
  if (!isPartyRef(value.principalRef)) errors.push('responsibilityLineage.principalRef: invalid');
  if (!isPartyRef(value.authorizerRef)) errors.push('responsibilityLineage.authorizerRef: invalid');
  if (!isPartyRefArray(value.providerParties, false)) errors.push('responsibilityLineage.providerParties: required');
  if (!isPartyRefArray(value.executorParties, false)) errors.push('responsibilityLineage.executorParties: required');
  if (!isPartyRefArray(value.settlementParties)) errors.push('responsibilityLineage.settlementParties: invalid');
  if (!isPartyRefArray(value.remedyParties)) errors.push('responsibilityLineage.remedyParties: invalid');
  if (!isRecordRefArray(value.governingPolicyRefs, false)) errors.push('responsibilityLineage.governingPolicyRefs: required');
  if (!isRecordRefArray(value.termsRefs, false)) errors.push('responsibilityLineage.termsRefs: required');
  if (!isRecordRefArray(value.sourceRefs, false)) errors.push('responsibilityLineage.sourceRefs: required');
  if (!isPartyRef(value.projectedBy) || value.projectedBy.kind !== 'projector') {
    errors.push('responsibilityLineage.projectedBy: projector PartyRef required');
  }
  if (!Array.isArray(value.missingOrAmbiguousRefs)) errors.push('responsibilityLineage.missingOrAmbiguousRefs: required');
  if (value.status === 'complete' && Array.isArray(value.missingOrAmbiguousRefs) && value.missingOrAmbiguousRefs.length > 0) {
    errors.push('responsibilityLineage.status: complete lineage cannot have missing or ambiguous refs');
  }
  if (!['complete', 'incomplete', 'unverifiable'].includes(String(value.status))) {
    errors.push('responsibilityLineage.status: unknown');
  }
  return { valid: errors.length === 0, errors };
}

export function validateActionReceiptV1(input: unknown): AgentEconomyValidationResultV1 {
  const { value, errors } = validateBase(input, 'actionReceipt');
  if (!value) return { valid: false, errors };
  for (const key of ['actionReceiptId', 'actionId', 'accountableAgentId', 'sourceManifestRef', 'generatedAt']) {
    if (!isNonEmptyString(value[key])) errors.push(`actionReceipt.${key}: required`);
  }
  for (const key of ['goalRef', 'candidateRef', 'mandateRef', 'outcomeRef', 'responsibilityLineageRef']) {
    if (!isRecordRefV1(value[key])) errors.push(`actionReceipt.${key}: invalid`);
  }
  if (!isRecordRefArray(value.executionRefs, false)) errors.push('actionReceipt.executionRefs: required');
  const paymentAttemptRefs = value.paymentAttemptRefs;
  const settlementRefs = value.settlementRefs;
  const remedyRefs = value.remedyRefs;
  const paymentRefsValid = isRecordRefArray(paymentAttemptRefs);
  const settlementRefsValid = isRecordRefArray(settlementRefs);
  const remedyRefsValid = isRecordRefArray(remedyRefs);
  if (!paymentRefsValid) errors.push('actionReceipt.paymentAttemptRefs: invalid');
  if (!settlementRefsValid) errors.push('actionReceipt.settlementRefs: invalid');
  if (!isRecordRefArray(value.proofRefs, false)) errors.push('actionReceipt.proofRefs: required');
  if (!isRecordRefArray(value.verificationRefs)) errors.push('actionReceipt.verificationRefs: invalid');
  if (!remedyRefsValid) errors.push('actionReceipt.remedyRefs: invalid');

  if (value.paymentDisposition !== undefined && !isPaymentSettlementDisposition(value.paymentDisposition)) {
    errors.push('actionReceipt.paymentDisposition: unknown');
  }
  if (value.settlementDisposition !== undefined && !isPaymentSettlementDisposition(value.settlementDisposition)) {
    errors.push('actionReceipt.settlementDisposition: unknown');
  }
  if (value.remedyDisposition !== undefined && !isRemedyDisposition(value.remedyDisposition)) {
    errors.push('actionReceipt.remedyDisposition: unknown');
  }
  const dispositions = normalizeActionReceiptDispositionsV1(value);
  if (paymentRefsValid) {
    if (
      ['not_required', 'unavailable', 'not_loaded'].includes(dispositions.paymentDisposition)
      && paymentAttemptRefs.length > 0
    ) {
      errors.push(`actionReceipt.paymentDisposition: ${dispositions.paymentDisposition} requires empty paymentAttemptRefs`);
    }
    if (dispositions.paymentDisposition === 'completed' && paymentAttemptRefs.length === 0) {
      errors.push('actionReceipt.paymentDisposition: completed requires paymentAttemptRefs');
    }
  }
  if (settlementRefsValid) {
    if (
      ['not_required', 'unavailable', 'not_loaded'].includes(dispositions.settlementDisposition)
      && settlementRefs.length > 0
    ) {
      errors.push(`actionReceipt.settlementDisposition: ${dispositions.settlementDisposition} requires empty settlementRefs`);
    }
    if (dispositions.settlementDisposition === 'completed' && settlementRefs.length === 0) {
      errors.push('actionReceipt.settlementDisposition: completed requires settlementRefs');
    }
  }
  if (remedyRefsValid) {
    if (
      ['not_required', 'not_opened', 'unavailable', 'not_loaded'].includes(dispositions.remedyDisposition)
      && remedyRefs.length > 0
    ) {
      errors.push(`actionReceipt.remedyDisposition: ${dispositions.remedyDisposition} requires empty remedyRefs`);
    }
    if (dispositions.remedyDisposition === 'completed' && remedyRefs.length === 0) {
      errors.push('actionReceipt.remedyDisposition: completed requires remedyRefs');
    }
  }

  if (!Array.isArray(value.missingOrInvalidRefs)) errors.push('actionReceipt.missingOrInvalidRefs: required');
  if (value.status === 'complete' && Array.isArray(value.missingOrInvalidRefs) && value.missingOrInvalidRefs.length > 0) {
    errors.push('actionReceipt.status: complete receipt cannot have missing or invalid refs');
  }
  if (value.status === 'unverifiable' && Array.isArray(value.missingOrInvalidRefs) && value.missingOrInvalidRefs.length === 0) {
    errors.push('actionReceipt.status: unverifiable receipt must identify missing or invalid refs');
  }
  if (!['draft', 'complete', 'unverifiable', 'superseded'].includes(String(value.status))) {
    errors.push('actionReceipt.status: unknown');
  }
  return { valid: errors.length === 0, errors };
}

export function validateAgentEconomyContractV1(
  contract:
    | 'CanonicalDiscoveryItemV1'
    | 'GoalIntentV1'
    | 'ExecutionMandateV1'
    | 'ResponsibilityLineageV1'
    | 'ActionReceiptV1',
  input: unknown,
): AgentEconomyValidationResultV1 {
  switch (contract) {
    case 'CanonicalDiscoveryItemV1':
      return validateCanonicalDiscoveryItemV1(input);
    case 'GoalIntentV1':
      return validateGoalIntentV1(input);
    case 'ExecutionMandateV1':
      return validateExecutionMandateV1(input);
    case 'ResponsibilityLineageV1':
      return validateResponsibilityLineageV1(input);
    case 'ActionReceiptV1':
      return validateActionReceiptV1(input);
    default:
      return { valid: false, errors: [`unsupported contract ${String(contract)}`] };
  }
}

export function assertAgentEconomyContractV1(
  contract: Parameters<typeof validateAgentEconomyContractV1>[0],
  input: unknown,
): void {
  const result = validateAgentEconomyContractV1(contract, input);
  if (!result.valid) throw new AgentEconomyContractValidationError(result.errors);
}

/** Technical attribution only; it never creates or transfers legal liability. */
export type AccountableActorV1 = {
  actorRef: ActorRefV1;
  accountableAgentId: string;
};
