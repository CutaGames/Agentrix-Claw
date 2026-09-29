import type { ActionAttributionV1 } from './agent-attribution';
import {
  AGENT_ECONOMY_SCHEMA_VERSION,
  type ActionPlanV1,
  type ActionQuoteV1,
  type ActionReceiptV1,
  type AttributionLineageV1,
  type BudgetReservationV1,
  type CanonicalDiscoveryItemV1,
  type ContextualReputationCardV1,
  type DiscoveryCandidateV1,
  type ExecutionMandateV1,
  type GoalIntentV1,
  type OwnershipSnapshotV1,
  type PaymentAttemptV1,
  type ResponsibilityLineageV1,
  type SettlementEventV1,
} from './agent-economy';
import {
  TRUST_LOOP_CANONICALIZATION,
  canonicalizeJson,
  sha256Hex,
  type DigestRef,
  type PartyRef,
  type RecordRef,
  type SignedIntegrity,
} from './trust-loop-primitives';

/** Deterministic, non-production IDs used by cross-end C0 conformance checks. */
export const AGENT_ECONOMY_C0_FIXTURE_IDS = {
  owner: 'owner_c0_fixture',
  agent: 'agent_c0_fixture',
  soulCore: 'soul_c0_fixture',
  goal: 'goal_c0_fixture',
  plan: 'plan_c0_fixture',
  candidate: 'candidate_c0_fixture',
  action: 'action_c0_fixture',
  quote: 'quote_c0_fixture',
  mandate: 'mandate_c0_fixture',
  reservation: 'reservation_c0_fixture',
  paymentAttempt: 'payment_c0_fixture',
  settlement: 'settlement_c0_fixture',
  attributionLineage: 'attribution_lineage_c0_fixture',
  responsibilityLineage: 'responsibility_lineage_c0_fixture',
  receipt: 'receipt_c0_fixture',
} as const;

const FIXTURE_TIME = '2026-07-20T00:00:00.000Z';
const FIXTURE_EXPIRY = '2026-07-21T00:00:00.000Z';

function digest(value: unknown): DigestRef {
  return {
    algorithm: 'sha-256',
    canonicalization: TRUST_LOOP_CANONICALIZATION,
    value: sha256Hex(new TextEncoder().encode(canonicalizeJson(value))),
  };
}

function integrity(value: unknown): SignedIntegrity {
  return { type: 'digest', payloadDigest: digest(value) };
}

function ref(type: RecordRef['type'], id: string, version = 1): RecordRef {
  return { type, id, version };
}

const ownerRef: PartyRef = { kind: 'owner', id: AGENT_ECONOMY_C0_FIXTURE_IDS.owner, affiliation: 'external' };
const agentRef: PartyRef = { kind: 'agent', id: AGENT_ECONOMY_C0_FIXTURE_IDS.agent, affiliation: 'external' };
const platformRef: PartyRef = { kind: 'platform', id: 'agentrix-platform', affiliation: 'internal' };
const providerRef: PartyRef = { kind: 'provider', id: 'provider_c0_fixture', affiliation: 'external' };
const executorRef: PartyRef = { kind: 'executor', id: 'executor_c0_fixture', affiliation: 'external' };
const settlementAuthorityRef: PartyRef = {
  kind: 'settlement_authority',
  id: 'settlement_authority_c0_fixture',
  affiliation: 'internal',
};
const projectorRef: PartyRef = {
  kind: 'projector',
  id: 'responsibility-lineage-projector-v1',
  affiliation: 'internal',
};

const usd100 = { amountMinor: '10000', currency: 'USD', decimals: 2 } as const;

const ownershipPayload = {
  snapshotId: 'ownership_c0_fixture',
  agentId: AGENT_ECONOMY_C0_FIXTURE_IDS.agent,
  soulCoreId: AGENT_ECONOMY_C0_FIXTURE_IDS.soulCore,
};
export const C0_OWNERSHIP_SNAPSHOT_FIXTURE: OwnershipSnapshotV1 = {
  schemaVersion: AGENT_ECONOMY_SCHEMA_VERSION,
  ...ownershipPayload,
  ownerRef,
  ownershipAuthorityRef: platformRef,
  state: 'active',
  policyRefs: [ref('policy', 'ownership_policy_c0_fixture')],
  capturedAt: FIXTURE_TIME,
  integrity: integrity(ownershipPayload),
};

const goalPayload = {
  goalId: AGENT_ECONOMY_C0_FIXTURE_IDS.goal,
  accountableAgentId: AGENT_ECONOMY_C0_FIXTURE_IDS.agent,
};
export const C0_GOAL_FIXTURE: GoalIntentV1 = {
  schemaVersion: AGENT_ECONOMY_SCHEMA_VERSION,
  ...goalPayload,
  createdBy: ownerRef,
  intentDigest: digest({ intent: 'fixture bounded service action' }),
  constraints: { allowedKinds: ['service'], budgetCeiling: usd100, dataClass: 'owner' },
  status: 'active',
  createdAt: FIXTURE_TIME,
  integrity: integrity(goalPayload),
};

const discoveryPayload = {
  discoveryItemId: 'discovery_item_c0_fixture',
  canonicalId: 'service:provider_c0_fixture:offering_c0_fixture',
};
export const C0_DISCOVERY_ITEM_FIXTURE: CanonicalDiscoveryItemV1 = {
  schemaVersion: AGENT_ECONOMY_SCHEMA_VERSION,
  ...discoveryPayload,
  kind: 'service',
  title: 'C0 fixture service',
  source: {
    source: 'creation',
    sourceKind: 'creation',
    sourceId: 'creation_c0_fixture',
    sourceVersion: '1',
    projectionVersion: 'agent-economy-c0/1',
    provenance: 'projected',
    capturedAt: FIXTURE_TIME,
  },
  providerRef,
  creationRef: ref('creation', 'creation_c0_fixture'),
  offeringRef: ref('offering', 'offering_c0_fixture'),
  capabilities: ['fixture.execute'],
  availability: 'available',
  priceTerms: {
    quoteRequired: true,
    displayPrice: usd100,
    billingModel: 'one_time',
    termsRefs: [ref('terms', 'terms_c0_fixture')],
  },
  trustSummaryRefs: [],
  freshness: { capturedAt: FIXTURE_TIME, validUntil: FIXTURE_EXPIRY, state: 'fresh' },
  executionState: 'requires_auth',
  integrity: integrity(discoveryPayload),
};

const planPayload = { planId: AGENT_ECONOMY_C0_FIXTURE_IDS.plan };
export const C0_PLAN_FIXTURE: ActionPlanV1 = {
  schemaVersion: AGENT_ECONOMY_SCHEMA_VERSION,
  ...planPayload,
  goalRef: ref('goal_intent', AGENT_ECONOMY_C0_FIXTURE_IDS.goal),
  candidateRefs: [ref('discovery_candidate', AGENT_ECONOMY_C0_FIXTURE_IDS.candidate)],
  status: 'candidate_selected',
  selectedCandidateRef: ref('discovery_candidate', AGENT_ECONOMY_C0_FIXTURE_IDS.candidate),
  createdAt: FIXTURE_TIME,
  updatedAt: FIXTURE_TIME,
  integrity: integrity(planPayload),
};

const candidatePayload = { candidateId: AGENT_ECONOMY_C0_FIXTURE_IDS.candidate };
export const C0_CANDIDATE_FIXTURE: DiscoveryCandidateV1 = {
  schemaVersion: AGENT_ECONOMY_SCHEMA_VERSION,
  ...candidatePayload,
  goalRef: ref('goal_intent', AGENT_ECONOMY_C0_FIXTURE_IDS.goal),
  planRef: ref('action_plan', AGENT_ECONOMY_C0_FIXTURE_IDS.plan),
  discoveryItemRef: ref('offering', C0_DISCOVERY_ITEM_FIXTURE.discoveryItemId),
  kind: 'service',
  providerRef,
  capabilities: C0_DISCOVERY_ITEM_FIXTURE.capabilities,
  creationRef: C0_DISCOVERY_ITEM_FIXTURE.creationRef,
  offeringRef: C0_DISCOVERY_ITEM_FIXTURE.offeringRef,
  source: C0_DISCOVERY_ITEM_FIXTURE.source,
  availability: 'available',
  executionState: 'requires_auth',
  priceTerms: C0_DISCOVERY_ITEM_FIXTURE.priceTerms,
  status: 'selected',
  selectedAt: FIXTURE_TIME,
  integrity: integrity(candidatePayload),
};

const quotePayload = { quoteId: AGENT_ECONOMY_C0_FIXTURE_IDS.quote, actionId: AGENT_ECONOMY_C0_FIXTURE_IDS.action };
export const C0_QUOTE_FIXTURE: ActionQuoteV1 = {
  schemaVersion: AGENT_ECONOMY_SCHEMA_VERSION,
  ...quotePayload,
  goalRef: ref('goal_intent', AGENT_ECONOMY_C0_FIXTURE_IDS.goal),
  candidateRef: ref('discovery_candidate', AGENT_ECONOMY_C0_FIXTURE_IDS.candidate),
  providerRef,
  amount: usd100,
  maximumAmount: usd100,
  termsRefs: [ref('terms', 'terms_c0_fixture')],
  status: 'accepted',
  idempotencyKey: 'idem_quote_c0_fixture',
  issuedAt: FIXTURE_TIME,
  expiresAt: FIXTURE_EXPIRY,
  integrity: integrity(quotePayload),
};

const mandatePayload = {
  mandateId: AGENT_ECONOMY_C0_FIXTURE_IDS.mandate,
  actionId: AGENT_ECONOMY_C0_FIXTURE_IDS.action,
};
export const C0_MANDATE_FIXTURE: ExecutionMandateV1 = {
  schemaVersion: AGENT_ECONOMY_SCHEMA_VERSION,
  ...mandatePayload,
  accountableAgentId: AGENT_ECONOMY_C0_FIXTURE_IDS.agent,
  principalRef: ownerRef,
  authorizerRef: platformRef,
  authorityRootRef: { kind: 'soul_core', soulCoreId: AGENT_ECONOMY_C0_FIXTURE_IDS.soulCore },
  quoteRef: ref('action_quote', AGENT_ECONOMY_C0_FIXTURE_IDS.quote),
  scope: ['fixture.execute'],
  budgetCeiling: usd100,
  allowedCandidateRefs: [ref('discovery_candidate', AGENT_ECONOMY_C0_FIXTURE_IDS.candidate)],
  policyRefs: [ref('policy', 'authority_policy_c0_fixture')],
  termsRefs: [ref('terms', 'terms_c0_fixture')],
  requiredMechanisms: ['software-policy'],
  status: 'active',
  issuedAt: FIXTURE_TIME,
  expiresAt: FIXTURE_EXPIRY,
  integrity: integrity(mandatePayload),
};

const reservationPayload = { reservationId: AGENT_ECONOMY_C0_FIXTURE_IDS.reservation };
export const C0_RESERVATION_FIXTURE: BudgetReservationV1 = {
  schemaVersion: AGENT_ECONOMY_SCHEMA_VERSION,
  ...reservationPayload,
  actionId: AGENT_ECONOMY_C0_FIXTURE_IDS.action,
  mandateRef: ref('execution_mandate', AGENT_ECONOMY_C0_FIXTURE_IDS.mandate),
  quoteRef: ref('action_quote', AGENT_ECONOMY_C0_FIXTURE_IDS.quote),
  amount: usd100,
  authorityRef: settlementAuthorityRef,
  status: 'committed',
  idempotencyKey: 'idem_reservation_c0_fixture',
  sourceReceiptRefs: [ref('settlement', 'reservation_receipt_c0_fixture')],
  createdAt: FIXTURE_TIME,
  expiresAt: FIXTURE_EXPIRY,
  updatedAt: FIXTURE_TIME,
  integrity: integrity(reservationPayload),
};

const paymentPayload = { paymentAttemptId: AGENT_ECONOMY_C0_FIXTURE_IDS.paymentAttempt };
export const C0_PAYMENT_FIXTURE: PaymentAttemptV1 = {
  schemaVersion: AGENT_ECONOMY_SCHEMA_VERSION,
  ...paymentPayload,
  actionId: AGENT_ECONOMY_C0_FIXTURE_IDS.action,
  reservationRef: ref('budget_reservation', AGENT_ECONOMY_C0_FIXTURE_IDS.reservation),
  settlementAuthorityRef,
  amount: usd100,
  rail: 'fixture',
  status: 'succeeded',
  idempotencyKey: 'idem_payment_c0_fixture',
  authorityReceiptRefs: [ref('settlement', 'payment_authority_receipt_c0_fixture')],
  createdAt: FIXTURE_TIME,
  updatedAt: FIXTURE_TIME,
  integrity: integrity(paymentPayload),
};

const settlementPayload = { settlementEventId: AGENT_ECONOMY_C0_FIXTURE_IDS.settlement };
export const C0_SETTLEMENT_FIXTURE: SettlementEventV1 = {
  schemaVersion: AGENT_ECONOMY_SCHEMA_VERSION,
  ...settlementPayload,
  actionId: AGENT_ECONOMY_C0_FIXTURE_IDS.action,
  paymentAttemptRef: ref('payment_attempt', AGENT_ECONOMY_C0_FIXTURE_IDS.paymentAttempt),
  settlementAuthorityRef,
  eventType: 'debit_confirmed',
  status: 'confirmed',
  amount: usd100,
  sourceReceiptRef: ref('settlement', 'settlement_authority_receipt_c0_fixture'),
  occurredAt: FIXTURE_TIME,
  integrity: integrity(settlementPayload),
};

export const C0_ACTION_ATTRIBUTION_FIXTURE: ActionAttributionV1 = {
  schemaVersion: 1,
  actorRef: { kind: 'agent', agentId: AGENT_ECONOMY_C0_FIXTURE_IDS.agent },
  accountableAgentId: AGENT_ECONOMY_C0_FIXTURE_IDS.agent,
  authorityRootRef: { kind: 'soul_core', soulCoreId: AGENT_ECONOMY_C0_FIXTURE_IDS.soulCore },
  initiatorRef: ref('actor_identity', AGENT_ECONOMY_C0_FIXTURE_IDS.owner),
  runtimeRef: ref('runtime', 'action-runtime-v1'),
};

const attributionPayload = { attributionLineageId: AGENT_ECONOMY_C0_FIXTURE_IDS.attributionLineage };
export const C0_ATTRIBUTION_LINEAGE_FIXTURE: AttributionLineageV1 = {
  schemaVersion: AGENT_ECONOMY_SCHEMA_VERSION,
  ...attributionPayload,
  actionId: AGENT_ECONOMY_C0_FIXTURE_IDS.action,
  attribution: C0_ACTION_ATTRIBUTION_FIXTURE,
  providerParties: [providerRef],
  executorParties: [executorRef],
  creationRef: ref('creation', 'creation_c0_fixture'),
  offeringRef: ref('offering', 'offering_c0_fixture'),
  sourceRefs: [ref('action_context', AGENT_ECONOMY_C0_FIXTURE_IDS.action)],
  recordedAt: FIXTURE_TIME,
  integrity: integrity(attributionPayload),
};

const responsibilityPayload = {
  responsibilityLineageId: AGENT_ECONOMY_C0_FIXTURE_IDS.responsibilityLineage,
  actionId: AGENT_ECONOMY_C0_FIXTURE_IDS.action,
};
export const C0_RESPONSIBILITY_LINEAGE_FIXTURE: ResponsibilityLineageV1 = {
  schemaVersion: AGENT_ECONOMY_SCHEMA_VERSION,
  ...responsibilityPayload,
  attributionLineageRef: ref('attribution_lineage', AGENT_ECONOMY_C0_FIXTURE_IDS.attributionLineage),
  accountableAgentId: AGENT_ECONOMY_C0_FIXTURE_IDS.agent,
  principalRef: ownerRef,
  authorizerRef: platformRef,
  authorityRootRef: C0_ACTION_ATTRIBUTION_FIXTURE.authorityRootRef,
  mandateRef: ref('execution_mandate', AGENT_ECONOMY_C0_FIXTURE_IDS.mandate),
  responsibilityAgreementRef: ref('terms', 'responsibility_terms_c0_fixture'),
  providerParties: [providerRef],
  executorParties: [executorRef],
  settlementAuthorityRef,
  settlementParties: [providerRef, settlementAuthorityRef],
  remedyAuthorityRef: { kind: 'remedy_authority', id: 'remedy_authority_c0_fixture', affiliation: 'internal' },
  remedyParties: [ownerRef, providerRef],
  governingPolicyRefs: [ref('policy', 'authority_policy_c0_fixture')],
  termsRefs: [ref('terms', 'terms_c0_fixture')],
  sourceRefs: [
    ref('ownership_snapshot', C0_OWNERSHIP_SNAPSHOT_FIXTURE.snapshotId),
    ref('execution_mandate', AGENT_ECONOMY_C0_FIXTURE_IDS.mandate),
    ref('settlement_event', AGENT_ECONOMY_C0_FIXTURE_IDS.settlement),
  ],
  status: 'complete',
  missingOrAmbiguousRefs: [],
  projectedBy: projectorRef,
  projectedAt: FIXTURE_TIME,
  integrity: integrity(responsibilityPayload),
};

const receiptPayload = {
  actionReceiptId: AGENT_ECONOMY_C0_FIXTURE_IDS.receipt,
  actionId: AGENT_ECONOMY_C0_FIXTURE_IDS.action,
};
export const C0_ACTION_RECEIPT_FIXTURE: ActionReceiptV1 = {
  schemaVersion: AGENT_ECONOMY_SCHEMA_VERSION,
  ...receiptPayload,
  accountableAgentId: AGENT_ECONOMY_C0_FIXTURE_IDS.agent,
  goalRef: ref('goal_intent', AGENT_ECONOMY_C0_FIXTURE_IDS.goal),
  planRef: ref('action_plan', AGENT_ECONOMY_C0_FIXTURE_IDS.plan),
  candidateRef: ref('discovery_candidate', AGENT_ECONOMY_C0_FIXTURE_IDS.candidate),
  quoteRef: ref('action_quote', AGENT_ECONOMY_C0_FIXTURE_IDS.quote),
  mandateRef: ref('execution_mandate', AGENT_ECONOMY_C0_FIXTURE_IDS.mandate),
  budgetReservationRef: ref('budget_reservation', AGENT_ECONOMY_C0_FIXTURE_IDS.reservation),
  executionRefs: [ref('execution_record', 'execution_c0_fixture')],
  paymentAttemptRefs: [ref('payment_attempt', AGENT_ECONOMY_C0_FIXTURE_IDS.paymentAttempt)],
  settlementRefs: [ref('settlement_event', AGENT_ECONOMY_C0_FIXTURE_IDS.settlement)],
  outcomeRef: ref('outcome_record', 'outcome_c0_fixture'),
  proofRefs: [ref('task_proof', 'proof_c0_fixture')],
  verificationRefs: [],
  evidenceRefs: [],
  responsibilityLineageRef: ref(
    'responsibility_lineage',
    AGENT_ECONOMY_C0_FIXTURE_IDS.responsibilityLineage,
  ),
  remedyRefs: [],
  status: 'complete',
  missingOrInvalidRefs: [],
  sourceManifestRef: 'agent-economy-c0-fixture/1',
  generatedAt: FIXTURE_TIME,
  integrity: integrity(receiptPayload),
};

const contextualCardPayload = { contextualCardId: 'contextual_card_c0_fixture' };
export const C0_CONTEXTUAL_REPUTATION_FIXTURE: ContextualReputationCardV1 = {
  schemaVersion: AGENT_ECONOMY_SCHEMA_VERSION,
  ...contextualCardPayload,
  accountableAgentId: AGENT_ECONOMY_C0_FIXTURE_IDS.agent,
  reputationCardRef: ref('reputation_card', 'reputation_card_c0_fixture'),
  context: { domain: 'fixture', actionClass: 'service' },
  window: { from: FIXTURE_TIME, to: FIXTURE_EXPIRY },
  eligibleEvidenceRefs: [ref('task_proof', 'proof_c0_fixture')],
  excludedEvidenceRefs: [],
  status: 'sufficient_evidence',
  projectorRef: { kind: 'projector', id: 'reputation-projector-v1', affiliation: 'internal' },
  generatedAt: FIXTURE_TIME,
  integrity: integrity(contextualCardPayload),
};

export const AGENT_ECONOMY_C0_FIXTURES = {
  ownership: C0_OWNERSHIP_SNAPSHOT_FIXTURE,
  goal: C0_GOAL_FIXTURE,
  discoveryItem: C0_DISCOVERY_ITEM_FIXTURE,
  plan: C0_PLAN_FIXTURE,
  candidate: C0_CANDIDATE_FIXTURE,
  quote: C0_QUOTE_FIXTURE,
  mandate: C0_MANDATE_FIXTURE,
  reservation: C0_RESERVATION_FIXTURE,
  paymentAttempt: C0_PAYMENT_FIXTURE,
  settlement: C0_SETTLEMENT_FIXTURE,
  attribution: C0_ACTION_ATTRIBUTION_FIXTURE,
  attributionLineage: C0_ATTRIBUTION_LINEAGE_FIXTURE,
  responsibilityLineage: C0_RESPONSIBILITY_LINEAGE_FIXTURE,
  actionReceipt: C0_ACTION_RECEIPT_FIXTURE,
  contextualReputation: C0_CONTEXTUAL_REPUTATION_FIXTURE,
} as const;


// ---------------------------------------------------------------------------
// Cross-client non-paid C0 conformance family.
//
// This is additive to the paid fixtures above because backend projector tests
// consume those records. Web and Desktop use this family as their sole source
// of canonical C0 facts and state transitions.
// ---------------------------------------------------------------------------

export const AGENT_ECONOMY_C0_CONFORMANCE_REFS = {
  agentId: 'agent:c0:owned:001',
  soulCoreId: 'soul-core:c0:owned:001',
  ownershipRef: 'ownership:c0:owned:001',
  goalId: 'goal:c0:translation:001',
  goalPresentationRef: 'goal-presentation:c0:translation:001',
  planId: 'plan:c0:translation:001',
  quoteRef: 'quote:c0:non-paid:001',
  mandateRef: 'mandate:c0:non-paid:001',
  actionId: 'action:c0:translation:001',
  actionReceiptRef: 'receipt:c0:translation:001',
  attributionLineageRef: 'attribution:c0:translation:001',
  responsibilityLineageRef: 'responsibility:c0:translation:001',
  proofRef: 'proof:c0:translation:001',
  providerCandidate: {
    candidateRef: 'candidate:c0:provider:translation',
    offeringRef: 'offering:provider:lingua:v1',
    sourceRef: 'provider:lingua',
    provenanceRef: 'provenance:provider:lingua:v1',
  },
  creationCandidate: {
    candidateRef: 'candidate:c0:creation:translation',
    offeringRef: 'offering:creation:translation-pack:v3',
    sourceRef: 'creation:translation-pack',
    provenanceRef: 'provenance:creation:translation-pack:v3',
  },
} as const;

export const AGENT_ECONOMY_C0_CONFORMANCE_CONTRACT_NAMES = [
  'OwnershipSnapshotV1',
  'GoalIntentV1',
  'ActionPlanV1',
  'DiscoveryCandidateV1',
  'ActionQuoteV1',
  'ExecutionMandateV1',
  'ActionReceiptV1',
  'ActionAttributionV1',
  'AttributionLineageV1',
  'ResponsibilityLineageV1',
  'RemedyCaseV1',
  'ContextualReputationCardV1',
] as const;

export type AgentEconomyC0ConformancePayloadByContract = {
  OwnershipSnapshotV1: OwnershipSnapshotV1;
  GoalIntentV1: GoalIntentV1;
  ActionPlanV1: ActionPlanV1;
  DiscoveryCandidateV1: DiscoveryCandidateV1;
  ActionQuoteV1: ActionQuoteV1;
  ExecutionMandateV1: ExecutionMandateV1;
  ActionReceiptV1: ActionReceiptV1;
  AttributionLineageV1: AttributionLineageV1;
  ResponsibilityLineageV1: ResponsibilityLineageV1;
  ContextualReputationCardV1: ContextualReputationCardV1;
};

export type AgentEconomyC0ConformanceContractName =
  keyof AgentEconomyC0ConformancePayloadByContract;

export interface AgentEconomyC0ConformanceTransport<
  K extends AgentEconomyC0ConformanceContractName = AgentEconomyC0ConformanceContractName,
> {
  contractName: K;
  payload: AgentEconomyC0ConformancePayloadByContract[K];
}

export type AgentEconomyC0JourneyPhase =
  | 'goal'
  | 'discovery'
  | 'compared'
  | 'approved'
  | 'completed'
  | 'blocked'
  | 'unknown-outcome';

export type AgentEconomyC0JourneyEvent =
  | { type: 'submit-goal'; summary: string }
  | { type: 'compare' }
  | { type: 'approve' }
  | { type: 'execute' }
  | { type: 'revoke' }
  | { type: 'expire' }
  | { type: 'duplicate-submit' }
  | { type: 'timeout' }
  | { type: 'reconcile' }
  | { type: 'reset' };

export interface AgentEconomyC0JourneyState {
  phase: AgentEconomyC0JourneyPhase;
  /** Ephemeral UI input; canonical Goal records contain only its digest. */
  goalSummary: string;
  authorityStatus: 'not-requested' | 'preview' | 'active' | 'revoked' | 'expired';
  executionStatus: 'not-started' | 'ready' | 'succeeded' | 'blocked' | 'unknown-outcome';
  reconciliationStatus: 'not-needed' | 'required' | 'reconciled';
  duplicateStatus: 'not-observed' | 'suppressed';
  transports: AgentEconomyC0ConformanceTransport[];
  notice: string;
  timeline: string[];
}

const C0_CONFORMANCE_TIME = '2026-07-20T00:00:00.000Z';
const C0_CONFORMANCE_EXPIRY = '2026-07-21T00:00:00.000Z';
const C0_CONFORMANCE_ZERO_USD = { amountMinor: '0', currency: 'USD', decimals: 2 } as const;

const conformanceRef = (type: RecordRef['type'], id: string): RecordRef => ({ type, id, version: 1 });

function withConformanceIntegrity<T extends { integrity: SignedIntegrity }>(
  unsigned: Omit<T, 'integrity'>,
): T {
  return { ...unsigned, integrity: integrity(unsigned) } as T;
}

const c0ConformancePrincipalRef: PartyRef = {
  kind: 'owner',
  id: 'principal:c0:user:001',
  affiliation: 'external',
};
const c0ConformanceAuthorizerRef: PartyRef = {
  kind: 'platform',
  id: 'authorizer:c0:user:001',
  affiliation: 'internal',
};
const c0ConformanceProviderRef: PartyRef = {
  kind: 'provider',
  id: AGENT_ECONOMY_C0_CONFORMANCE_REFS.providerCandidate.sourceRef,
  affiliation: 'external',
};
const c0ConformanceExecutorRef: PartyRef = {
  kind: 'executor',
  id: 'executor:c0:software-policy',
  affiliation: 'external',
};
const c0ConformanceProjectorRef: PartyRef = {
  kind: 'projector',
  id: 'projector:c0:fixture-only',
  affiliation: 'internal',
};
const c0ConformanceAuthorityRootRef = {
  kind: 'soul_core' as const,
  soulCoreId: AGENT_ECONOMY_C0_CONFORMANCE_REFS.soulCoreId,
};
const c0ConformanceTermsRef = conformanceRef('terms', 'terms:c0:non-paid');
const c0ConformancePolicyRef = conformanceRef('policy', 'policy:c0:software-only');
const c0ConformanceActualMechanismRef = conformanceRef(
  'execution_record',
  'mechanism-evidence:c0:software-policy',
);

export const C0_CONFORMANCE_OWNERSHIP_FIXTURE: OwnershipSnapshotV1 =
  withConformanceIntegrity<OwnershipSnapshotV1>({
    schemaVersion: AGENT_ECONOMY_SCHEMA_VERSION,
    snapshotId: AGENT_ECONOMY_C0_CONFORMANCE_REFS.ownershipRef,
    agentId: AGENT_ECONOMY_C0_CONFORMANCE_REFS.agentId,
    soulCoreId: AGENT_ECONOMY_C0_CONFORMANCE_REFS.soulCoreId,
    ownerRef: c0ConformancePrincipalRef,
    ownershipAuthorityRef: c0ConformanceAuthorizerRef,
    state: 'active',
    policyRefs: [conformanceRef('policy', 'policy:c0:ownership')],
    capturedAt: C0_CONFORMANCE_TIME,
  });

export function createC0ConformanceGoalFixture(summary: string): GoalIntentV1 {
  const normalizedSummary = summary.trim();
  return withConformanceIntegrity<GoalIntentV1>({
    schemaVersion: AGENT_ECONOMY_SCHEMA_VERSION,
    goalId: AGENT_ECONOMY_C0_CONFORMANCE_REFS.goalId,
    accountableAgentId: AGENT_ECONOMY_C0_CONFORMANCE_REFS.agentId,
    createdBy: c0ConformancePrincipalRef,
    intentDigest: digest({ summary: normalizedSummary }),
    constraints: {
      allowedKinds: ['service'],
      budgetCeiling: C0_CONFORMANCE_ZERO_USD,
      dataClass: 'owner',
      providerAllowlist: [c0ConformanceProviderRef.id],
    },
    presentation: {
      presentationRef: conformanceRef('evidence', AGENT_ECONOMY_C0_CONFORMANCE_REFS.goalPresentationRef),
      disclosure: 'safe_summary',
      audience: 'owner_only',
    },
    status: 'active',
    createdAt: C0_CONFORMANCE_TIME,
  });
}

export const C0_CONFORMANCE_PROVIDER_CANDIDATE_FIXTURE: DiscoveryCandidateV1 =
  withConformanceIntegrity<DiscoveryCandidateV1>({
    schemaVersion: AGENT_ECONOMY_SCHEMA_VERSION,
    candidateId: AGENT_ECONOMY_C0_CONFORMANCE_REFS.providerCandidate.candidateRef,
    goalRef: conformanceRef('goal_intent', AGENT_ECONOMY_C0_CONFORMANCE_REFS.goalId),
    planRef: conformanceRef('action_plan', AGENT_ECONOMY_C0_CONFORMANCE_REFS.planId),
    discoveryItemRef: conformanceRef('offering', AGENT_ECONOMY_C0_CONFORMANCE_REFS.providerCandidate.offeringRef),
    kind: 'service',
    providerRef: c0ConformanceProviderRef,
    capabilities: ['translation'],
    offeringRef: conformanceRef('offering', AGENT_ECONOMY_C0_CONFORMANCE_REFS.providerCandidate.offeringRef),
    source: {
      source: 'marketplace-provider-catalog',
      sourceKind: 'marketplace',
      sourceId: AGENT_ECONOMY_C0_CONFORMANCE_REFS.providerCandidate.sourceRef,
      sourceVersion: '1',
      projectionVersion: 'agent-economy-c0/1',
      provenance: 'authoritative',
      provenanceRef: conformanceRef('evidence', AGENT_ECONOMY_C0_CONFORMANCE_REFS.providerCandidate.provenanceRef),
      capturedAt: C0_CONFORMANCE_TIME,
    },
    availability: 'available',
    executionState: 'requires_auth',
    priceTerms: {
      quoteRequired: false,
      displayPrice: C0_CONFORMANCE_ZERO_USD,
      billingModel: 'free',
      termsRefs: [c0ConformanceTermsRef],
    },
    status: 'selected',
    selectedAt: C0_CONFORMANCE_TIME,
  });

export const C0_CONFORMANCE_CREATION_CANDIDATE_FIXTURE: DiscoveryCandidateV1 =
  withConformanceIntegrity<DiscoveryCandidateV1>({
    schemaVersion: AGENT_ECONOMY_SCHEMA_VERSION,
    candidateId: AGENT_ECONOMY_C0_CONFORMANCE_REFS.creationCandidate.candidateRef,
    goalRef: conformanceRef('goal_intent', AGENT_ECONOMY_C0_CONFORMANCE_REFS.goalId),
    planRef: conformanceRef('action_plan', AGENT_ECONOMY_C0_CONFORMANCE_REFS.planId),
    discoveryItemRef: conformanceRef('offering', AGENT_ECONOMY_C0_CONFORMANCE_REFS.creationCandidate.offeringRef),
    kind: 'service',
    providerRef: c0ConformanceProviderRef,
    capabilities: ['translation'],
    creationRef: conformanceRef('creation', AGENT_ECONOMY_C0_CONFORMANCE_REFS.creationCandidate.sourceRef),
    offeringRef: conformanceRef('offering', AGENT_ECONOMY_C0_CONFORMANCE_REFS.creationCandidate.offeringRef),
    source: {
      source: 'creation-catalog-projector',
      sourceKind: 'creation',
      sourceId: AGENT_ECONOMY_C0_CONFORMANCE_REFS.creationCandidate.sourceRef,
      sourceVersion: '3',
      projectionVersion: 'agent-economy-c0/1',
      provenance: 'projected',
      provenanceRef: conformanceRef('evidence', AGENT_ECONOMY_C0_CONFORMANCE_REFS.creationCandidate.provenanceRef),
      capturedAt: C0_CONFORMANCE_TIME,
    },
    availability: 'available',
    executionState: 'requires_auth',
    priceTerms: {
      quoteRequired: false,
      displayPrice: C0_CONFORMANCE_ZERO_USD,
      billingModel: 'free',
      termsRefs: [c0ConformanceTermsRef],
    },
    status: 'eligible',
  });

export const C0_CONFORMANCE_PLAN_FIXTURE: ActionPlanV1 =
  withConformanceIntegrity<ActionPlanV1>({
    schemaVersion: AGENT_ECONOMY_SCHEMA_VERSION,
    planId: AGENT_ECONOMY_C0_CONFORMANCE_REFS.planId,
    goalRef: conformanceRef('goal_intent', AGENT_ECONOMY_C0_CONFORMANCE_REFS.goalId),
    candidateRefs: [
      conformanceRef('discovery_candidate', AGENT_ECONOMY_C0_CONFORMANCE_REFS.providerCandidate.candidateRef),
      conformanceRef('discovery_candidate', AGENT_ECONOMY_C0_CONFORMANCE_REFS.creationCandidate.candidateRef),
    ],
    status: 'candidate_selected',
    selectedCandidateRef: conformanceRef(
      'discovery_candidate',
      AGENT_ECONOMY_C0_CONFORMANCE_REFS.providerCandidate.candidateRef,
    ),
    createdAt: C0_CONFORMANCE_TIME,
    updatedAt: C0_CONFORMANCE_TIME,
  });

export const C0_CONFORMANCE_QUOTE_FIXTURE: ActionQuoteV1 =
  withConformanceIntegrity<ActionQuoteV1>({
    schemaVersion: AGENT_ECONOMY_SCHEMA_VERSION,
    quoteId: AGENT_ECONOMY_C0_CONFORMANCE_REFS.quoteRef,
    actionId: AGENT_ECONOMY_C0_CONFORMANCE_REFS.actionId,
    goalRef: conformanceRef('goal_intent', AGENT_ECONOMY_C0_CONFORMANCE_REFS.goalId),
    candidateRef: conformanceRef(
      'discovery_candidate',
      AGENT_ECONOMY_C0_CONFORMANCE_REFS.providerCandidate.candidateRef,
    ),
    providerRef: c0ConformanceProviderRef,
    amount: C0_CONFORMANCE_ZERO_USD,
    maximumAmount: C0_CONFORMANCE_ZERO_USD,
    termsRefs: [c0ConformanceTermsRef],
    status: 'accepted',
    idempotencyKey: 'idem:c0:translation:001',
    issuedAt: C0_CONFORMANCE_TIME,
    expiresAt: C0_CONFORMANCE_EXPIRY,
  });

export const C0_CONFORMANCE_MANDATE_FIXTURE: ExecutionMandateV1 =
  withConformanceIntegrity<ExecutionMandateV1>({
    schemaVersion: AGENT_ECONOMY_SCHEMA_VERSION,
    mandateId: AGENT_ECONOMY_C0_CONFORMANCE_REFS.mandateRef,
    actionId: AGENT_ECONOMY_C0_CONFORMANCE_REFS.actionId,
    accountableAgentId: AGENT_ECONOMY_C0_CONFORMANCE_REFS.agentId,
    principalRef: c0ConformancePrincipalRef,
    authorizerRef: c0ConformanceAuthorizerRef,
    authorityRootRef: c0ConformanceAuthorityRootRef,
    quoteRef: conformanceRef('action_quote', AGENT_ECONOMY_C0_CONFORMANCE_REFS.quoteRef),
    scope: ['translation.execute'],
    budgetCeiling: C0_CONFORMANCE_ZERO_USD,
    allowedCandidateRefs: [
      conformanceRef('discovery_candidate', AGENT_ECONOMY_C0_CONFORMANCE_REFS.providerCandidate.candidateRef),
    ],
    policyRefs: [c0ConformancePolicyRef],
    termsRefs: [c0ConformanceTermsRef],
    requiredMechanisms: ['software-policy'],
    requiredMechanismEvidenceRefs: [c0ConformancePolicyRef],
    actualMechanismEvidenceRefs: [c0ConformanceActualMechanismRef],
    status: 'active',
    issuedAt: C0_CONFORMANCE_TIME,
    expiresAt: C0_CONFORMANCE_EXPIRY,
  });

export const C0_CONFORMANCE_ACTION_ATTRIBUTION_FIXTURE: ActionAttributionV1 = {
  schemaVersion: 1,
  actorRef: { kind: 'agent', agentId: AGENT_ECONOMY_C0_CONFORMANCE_REFS.agentId },
  accountableAgentId: AGENT_ECONOMY_C0_CONFORMANCE_REFS.agentId,
  authorityRootRef: c0ConformanceAuthorityRootRef,
  initiatorRef: conformanceRef('actor_identity', c0ConformancePrincipalRef.id),
  runtimeRef: conformanceRef('runtime', 'runtime:c0:software-policy'),
};

export const C0_CONFORMANCE_ATTRIBUTION_LINEAGE_FIXTURE: AttributionLineageV1 =
  withConformanceIntegrity<AttributionLineageV1>({
    schemaVersion: AGENT_ECONOMY_SCHEMA_VERSION,
    attributionLineageId: AGENT_ECONOMY_C0_CONFORMANCE_REFS.attributionLineageRef,
    actionId: AGENT_ECONOMY_C0_CONFORMANCE_REFS.actionId,
    attribution: C0_CONFORMANCE_ACTION_ATTRIBUTION_FIXTURE,
    providerParties: [c0ConformanceProviderRef],
    executorParties: [c0ConformanceExecutorRef],
    offeringRef: conformanceRef('offering', AGENT_ECONOMY_C0_CONFORMANCE_REFS.providerCandidate.offeringRef),
    sourceRefs: [conformanceRef('action_context', AGENT_ECONOMY_C0_CONFORMANCE_REFS.actionId)],
    recordedAt: C0_CONFORMANCE_TIME,
  });

export const C0_CONFORMANCE_RESPONSIBILITY_LINEAGE_FIXTURE: ResponsibilityLineageV1 =
  withConformanceIntegrity<ResponsibilityLineageV1>({
    schemaVersion: AGENT_ECONOMY_SCHEMA_VERSION,
    responsibilityLineageId: AGENT_ECONOMY_C0_CONFORMANCE_REFS.responsibilityLineageRef,
    actionId: AGENT_ECONOMY_C0_CONFORMANCE_REFS.actionId,
    attributionLineageRef: conformanceRef(
      'attribution_lineage',
      AGENT_ECONOMY_C0_CONFORMANCE_REFS.attributionLineageRef,
    ),
    accountableAgentId: AGENT_ECONOMY_C0_CONFORMANCE_REFS.agentId,
    principalRef: c0ConformancePrincipalRef,
    authorizerRef: c0ConformanceAuthorizerRef,
    authorityRootRef: c0ConformanceAuthorityRootRef,
    mandateRef: conformanceRef('execution_mandate', AGENT_ECONOMY_C0_CONFORMANCE_REFS.mandateRef),
    providerParties: [c0ConformanceProviderRef],
    executorParties: [c0ConformanceExecutorRef],
    settlementParties: [],
    remedyParties: [],
    governingPolicyRefs: [c0ConformancePolicyRef],
    termsRefs: [c0ConformanceTermsRef],
    sourceRefs: [
      conformanceRef('ownership_snapshot', AGENT_ECONOMY_C0_CONFORMANCE_REFS.ownershipRef),
      conformanceRef('goal_intent', AGENT_ECONOMY_C0_CONFORMANCE_REFS.goalId),
      conformanceRef('action_plan', AGENT_ECONOMY_C0_CONFORMANCE_REFS.planId),
      conformanceRef('execution_mandate', AGENT_ECONOMY_C0_CONFORMANCE_REFS.mandateRef),
      conformanceRef('attribution_lineage', AGENT_ECONOMY_C0_CONFORMANCE_REFS.attributionLineageRef),
    ],
    status: 'complete',
    missingOrAmbiguousRefs: [],
    projectedBy: c0ConformanceProjectorRef,
    projectedAt: C0_CONFORMANCE_TIME,
  });

export const C0_CONFORMANCE_ACTION_RECEIPT_FIXTURE: ActionReceiptV1 =
  withConformanceIntegrity<ActionReceiptV1>({
    schemaVersion: AGENT_ECONOMY_SCHEMA_VERSION,
    actionReceiptId: AGENT_ECONOMY_C0_CONFORMANCE_REFS.actionReceiptRef,
    actionId: AGENT_ECONOMY_C0_CONFORMANCE_REFS.actionId,
    accountableAgentId: AGENT_ECONOMY_C0_CONFORMANCE_REFS.agentId,
    goalRef: conformanceRef('goal_intent', AGENT_ECONOMY_C0_CONFORMANCE_REFS.goalId),
    planRef: conformanceRef('action_plan', AGENT_ECONOMY_C0_CONFORMANCE_REFS.planId),
    candidateRef: conformanceRef(
      'discovery_candidate',
      AGENT_ECONOMY_C0_CONFORMANCE_REFS.providerCandidate.candidateRef,
    ),
    quoteRef: conformanceRef('action_quote', AGENT_ECONOMY_C0_CONFORMANCE_REFS.quoteRef),
    mandateRef: conformanceRef('execution_mandate', AGENT_ECONOMY_C0_CONFORMANCE_REFS.mandateRef),
    executionRefs: [conformanceRef('execution_record', 'execution:c0:software-policy')],
    paymentDisposition: 'not_required',
    paymentAttemptRefs: [],
    settlementDisposition: 'not_required',
    settlementRefs: [],
    outcomeRef: conformanceRef('outcome_record', 'outcome:c0:translation:001'),
    proofRefs: [conformanceRef('task_proof', AGENT_ECONOMY_C0_CONFORMANCE_REFS.proofRef)],
    verificationRefs: [],
    evidenceRefs: [],
    responsibilityLineageRef: conformanceRef(
      'responsibility_lineage',
      AGENT_ECONOMY_C0_CONFORMANCE_REFS.responsibilityLineageRef,
    ),
    remedyDisposition: 'not_opened',
    remedyRefs: [],
    status: 'unverifiable',
    missingOrInvalidRefs: ['externalVerificationRef'],
    sourceManifestRef: 'agent-economy-c0-conformance/1',
    generatedAt: C0_CONFORMANCE_TIME,
  });

export const C0_CONFORMANCE_CONTEXTUAL_REPUTATION_FIXTURE: ContextualReputationCardV1 =
  withConformanceIntegrity<ContextualReputationCardV1>({
    schemaVersion: AGENT_ECONOMY_SCHEMA_VERSION,
    contextualCardId: 'contextual-reputation:c0:translation:001',
    accountableAgentId: AGENT_ECONOMY_C0_CONFORMANCE_REFS.agentId,
    reputationCardRef: conformanceRef('reputation_card', 'reputation:c0:translation:001'),
    context: { domain: 'translation', actionClass: 'non-paid-fixture' },
    window: { from: C0_CONFORMANCE_TIME, to: C0_CONFORMANCE_EXPIRY },
    eligibleEvidenceRefs: [conformanceRef('task_proof', AGENT_ECONOMY_C0_CONFORMANCE_REFS.proofRef)],
    excludedEvidenceRefs: [],
    status: 'unverifiable',
    projectorRef: c0ConformanceProjectorRef,
    generatedAt: C0_CONFORMANCE_TIME,
  });

/** Deliberately has no reservation, payment, settlement, Remedy, or verification object. */
export const AGENT_ECONOMY_C0_CONFORMANCE_FIXTURES = {
  ownership: C0_CONFORMANCE_OWNERSHIP_FIXTURE,
  candidates: [
    C0_CONFORMANCE_PROVIDER_CANDIDATE_FIXTURE,
    C0_CONFORMANCE_CREATION_CANDIDATE_FIXTURE,
  ],
  plan: C0_CONFORMANCE_PLAN_FIXTURE,
  quote: C0_CONFORMANCE_QUOTE_FIXTURE,
  mandate: C0_CONFORMANCE_MANDATE_FIXTURE,
  attribution: C0_CONFORMANCE_ACTION_ATTRIBUTION_FIXTURE,
  attributionLineage: C0_CONFORMANCE_ATTRIBUTION_LINEAGE_FIXTURE,
  responsibilityLineage: C0_CONFORMANCE_RESPONSIBILITY_LINEAGE_FIXTURE,
  actionReceipt: C0_CONFORMANCE_ACTION_RECEIPT_FIXTURE,
  contextualReputation: C0_CONFORMANCE_CONTEXTUAL_REPUTATION_FIXTURE,
} as const;

function conformanceTransport<K extends AgentEconomyC0ConformanceContractName>(
  contractName: K,
  payload: AgentEconomyC0ConformancePayloadByContract[K],
): AgentEconomyC0ConformanceTransport<K> {
  return { contractName, payload };
}

function appendConformanceTransport(
  current: AgentEconomyC0ConformanceTransport[],
  next: AgentEconomyC0ConformanceTransport,
): AgentEconomyC0ConformanceTransport[] {
  if (current.some((entry) => entry.contractName === next.contractName)) return current;
  return [...current, next];
}

function appendConformanceTransports(
  current: AgentEconomyC0ConformanceTransport[],
  next: AgentEconomyC0ConformanceTransport[],
): AgentEconomyC0ConformanceTransport[] {
  return next.reduce(appendConformanceTransport, current);
}

function createTerminalConformanceMandate(status: 'revoked' | 'expired'): ExecutionMandateV1 {
  const { integrity: _integrity, ...active } = C0_CONFORMANCE_MANDATE_FIXTURE;
  return withConformanceIntegrity<ExecutionMandateV1>({
    ...active,
    status,
    expiresAt: status === 'expired' ? C0_CONFORMANCE_TIME : active.expiresAt,
    revokedAt: status === 'revoked' ? C0_CONFORMANCE_TIME : undefined,
  });
}

function completionConformanceTransports(): AgentEconomyC0ConformanceTransport[] {
  return [
    conformanceTransport('ActionReceiptV1', C0_CONFORMANCE_ACTION_RECEIPT_FIXTURE),
    conformanceTransport('AttributionLineageV1', C0_CONFORMANCE_ATTRIBUTION_LINEAGE_FIXTURE),
    conformanceTransport('ResponsibilityLineageV1', C0_CONFORMANCE_RESPONSIBILITY_LINEAGE_FIXTURE),
    conformanceTransport('ContextualReputationCardV1', C0_CONFORMANCE_CONTEXTUAL_REPUTATION_FIXTURE),
  ];
}

export function createAgentEconomyC0Journey(): AgentEconomyC0JourneyState {
  return {
    phase: 'goal',
    goalSummary: '',
    authorityStatus: 'not-requested',
    executionStatus: 'not-started',
    reconciliationStatus: 'not-needed',
    duplicateStatus: 'not-observed',
    transports: [conformanceTransport('OwnershipSnapshotV1', C0_CONFORMANCE_OWNERSHIP_FIXTURE)],
    notice: '请显式提交目标；客户端不会从 Agent、Pet、Runtime 或最近页面推断目标。',
    timeline: ['Shared C0 conformance fixture initialized · no production write'],
  };
}

export function transitionAgentEconomyC0Journey(
  state: AgentEconomyC0JourneyState,
  event: AgentEconomyC0JourneyEvent,
): AgentEconomyC0JourneyState {
  if (event.type === 'reset') return createAgentEconomyC0Journey();

  if (event.type === 'submit-goal' && state.phase === 'goal') {
    const summary = event.summary.trim();
    if (!summary) return { ...state, notice: 'Goal blocked：目标不能为空。' };
    return {
      ...state,
      phase: 'discovery',
      goalSummary: summary,
      transports: [
        ...state.transports,
        conformanceTransport('GoalIntentV1', createC0ConformanceGoalFixture(summary)),
        conformanceTransport('DiscoveryCandidateV1', C0_CONFORMANCE_PROVIDER_CANDIDATE_FIXTURE),
        conformanceTransport('DiscoveryCandidateV1', C0_CONFORMANCE_CREATION_CANDIDATE_FIXTURE),
      ],
      notice: 'G-A fixture：返回 exactly one Provider + one Creation offering。',
      timeline: [...state.timeline, 'Goal submitted · shared canonical discovery fixtures loaded'],
    };
  }

  if (event.type === 'compare' && state.phase === 'discovery') {
    return {
      ...state,
      phase: 'compared',
      authorityStatus: 'preview',
      transports: appendConformanceTransport(
        state.transports,
        conformanceTransport('ActionPlanV1', C0_CONFORMANCE_PLAN_FIXTURE),
      ),
      notice: 'G-A fixture 完成：比较已生成 plan；selection 无资金副作用。',
      timeline: [...state.timeline, 'Compare · shared plan composed without payment side effect'],
    };
  }

  if (event.type === 'approve' && state.phase === 'compared') {
    return {
      ...state,
      phase: 'approved',
      authorityStatus: 'active',
      executionStatus: 'ready',
      transports: appendConformanceTransports(state.transports, [
        conformanceTransport('ActionQuoteV1', C0_CONFORMANCE_QUOTE_FIXTURE),
        conformanceTransport('ExecutionMandateV1', C0_CONFORMANCE_MANDATE_FIXTURE),
      ]),
      notice: 'G-B fixture：non-paid Mandate 已批准；仅 software policy 可执行。',
      timeline: [...state.timeline, 'Authority approved · shared bounded non-paid Mandate'],
    };
  }

  if (event.type === 'execute' && state.phase === 'approved') {
    return {
      ...state,
      phase: 'completed',
      executionStatus: 'succeeded',
      transports: appendConformanceTransports(state.transports, completionConformanceTransports()),
      notice: 'G-C client slice：Outcome/Proof 已关联到统一 Action Receipt（fixture only）。',
      timeline: [...state.timeline, 'Software Action completed · shared fixture Receipt assembled'],
    };
  }

  if (event.type === 'timeout' && state.phase === 'approved') {
    return {
      ...state,
      phase: 'unknown-outcome',
      executionStatus: 'unknown-outcome',
      reconciliationStatus: 'required',
      notice: 'Timeout：结果为 unknown-outcome。禁止盲目重放；必须先 reconcile。',
      timeline: [...state.timeline, 'Timeout · acknowledgement missing; blind replay blocked'],
    };
  }

  if (event.type === 'reconcile' && state.phase === 'unknown-outcome') {
    return {
      ...state,
      phase: 'completed',
      executionStatus: 'succeeded',
      reconciliationStatus: 'reconciled',
      transports: appendConformanceTransports(state.transports, completionConformanceTransports()),
      notice: 'Reconcile 完成：通过固定 refs 找回原 Action；未创建第二次执行。',
      timeline: [...state.timeline, 'Reconcile · original Action located; no replay performed'],
    };
  }

  if (
    (event.type === 'revoke' || event.type === 'expire')
    && (state.phase === 'compared' || state.phase === 'approved')
  ) {
    const terminalStatus = event.type === 'revoke' ? 'revoked' : 'expired';
    return {
      ...state,
      phase: 'blocked',
      authorityStatus: terminalStatus,
      executionStatus: 'blocked',
      transports: state.phase === 'approved'
        ? [
          ...state.transports,
          conformanceTransport('ExecutionMandateV1', createTerminalConformanceMandate(terminalStatus)),
        ]
        : state.transports,
      notice: `${event.type === 'revoke' ? 'Revoke' : 'Expiry'}：下一副作用前已 blocked；不会执行 Action。`,
      timeline: [
        ...state.timeline,
        `${event.type === 'revoke' ? 'Revoke' : 'Expiry'} · blocked before side effect`,
      ],
    };
  }

  if (event.type === 'duplicate-submit' && state.phase === 'completed') {
    return {
      ...state,
      duplicateStatus: 'suppressed',
      notice: `Duplicate submit 已抑制：复用 ${AGENT_ECONOMY_C0_CONFORMANCE_REFS.actionReceiptRef}，未重复执行。`,
      timeline: [...state.timeline, 'Duplicate submit · existing Action ref reused'],
    };
  }

  return state;
}
