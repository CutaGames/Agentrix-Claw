/**
 * Soul Core Action Trust Loop v1.1 — golden vectors / deterministic fixtures
 * (TL-01.1; R1.1). One canonical, fully-populated example per contract, used by
 * cross-end contract tests and by external Verifier / RP SDK conformance suites.
 *
 * Every fixture is deterministic (fixed ids and RFC 3339 timestamps) and passes
 * its runtime validator. Digest fields carry real SHA-256 values produced by
 * {@link computeDigest} over labeled payloads, so the vectors are reproducible
 * on any runtime.
 */

import {
  computeDigest,
  type DigestRef,
  type EnforcementLayerEvidence,
  type PartyRef,
  type SignedIntegrity,
} from './trust-loop-primitives';
import { TRUST_LOOP_SCHEMA_VERSION } from './trust-loop-primitives';
import type {
  ActionContextV1,
  AssuranceProfileV1,
  CredentialStatusV1,
  DisputeCaseV1,
  FeedbackRightV1,
  OutcomeRecordV1,
  ReputationCardV1,
  RiskDecisionV1,
  TrustContractName,
  VerificationResultV1,
} from './trust-loop-contracts';

const T0 = '2026-07-15T00:00:00.000Z';
const T1 = '2026-07-15T00:05:00.000Z';

/** A deterministic example {@link DigestRef} over a stable label. */
function exampleDigest(label: string): DigestRef {
  return computeDigest({ goldenLabel: label });
}

function signer(kind: PartyRef['kind'], id: string, affiliation: PartyRef['affiliation']): PartyRef {
  return { kind, id, affiliation };
}

function signature(by: PartyRef, label: string): SignedIntegrity {
  return {
    type: 'signature',
    payloadDigest: exampleDigest(`payload:${label}`),
    scheme: 'ed25519',
    signer: by,
    keyId: `key:${label}`,
    signature: 'c2lnbmF0dXJlLXBsYWNlaG9sZGVy',
    signedAt: T1,
  };
}

const OWNER: PartyRef = signer('owner', 'party_owner_0000000000000000', 'internal');
const AGENT: PartyRef = signer('agent', 'party_agent_00000000000000000', 'internal');
const ACTOR: PartyRef = signer('actor', 'party_actor_00000000000000000', 'internal');
const RUNTIME: PartyRef = signer('operator', 'party_runtime_0000000000000000', 'internal');
const EXTERNAL_VERIFIER: PartyRef = signer('verifier', 'party_verifier_extern_00000000', 'external');
const STATUS_AUTHORITY: PartyRef = signer('status_authority', 'party_status_authority_0000000', 'external');
const ARBITER: PartyRef = signer('arbiter', 'party_arbiter_0000000000000000', 'internal');
const PROJECTOR: PartyRef = signer('projector', 'party_projector_000000000000', 'internal');
const ASSURANCE_EVAL: PartyRef = signer('platform', 'party_assurance_eval_00000000', 'internal');
const RISK_ENGINE: PartyRef = signer('risk_engine', 'party_risk_engine_00000000000', 'internal');
const FEEDBACK_SVC: PartyRef = signer('platform', 'party_feedback_svc_0000000000', 'internal');
const PAYMENT_AUTHORITY: PartyRef = signer('payment_authority', 'party_payment_authority_00000', 'external');

const ENFORCEMENT_SOFTWARE: EnforcementLayerEvidence = { layer: 'software', state: 'observed' };
const ENFORCEMENT_4337: EnforcementLayerEvidence = {
  layer: 'onchain-4337',
  state: 'verified',
  evidenceRef: { type: 'anchor', id: 'anchor_0000000000000000000000' },
};

export const ACTION_CONTEXT_FIXTURE_V1: ActionContextV1 = {
  schemaVersion: TRUST_LOOP_SCHEMA_VERSION,
  contextId: 'ctx_0000000000000000000000000000',
  contextVersion: 1,
  actionId: 'act_0000000000000000000000000000',
  taskId: 'task_000000000000000000000000000',
  actor: ACTOR,
  agent: AGENT,
  owner: OWNER,
  intent: { type: 'paid_task.execute', digest: exampleDigest('intent'), summary: 'Execute a bounded paid task' },
  capability: { tool: 'economy.paid_task', operation: 'execute', scope: ['economy:spend'] },
  target: { resourceRef: 'res_0000', environment: 'sandbox' },
  economics: {
    quoteRef: 'quote_00000000',
    maxCost: { amountMinor: '500', currency: 'USD', decimals: 2 },
    paymentAuthority: PAYMENT_AUTHORITY,
  },
  policy: {
    policyRef: 'policy_00000000',
    version: '1',
    ownerCeiling: { maxCost: { amountMinor: '1000', currency: 'USD', decimals: 2 }, maxSessionSeconds: 3600 },
  },
  enforcementLayers: [ENFORCEMENT_SOFTWARE, ENFORCEMENT_4337],
  riskMode: 'shadow',
  privacyClass: 'owner',
  lifecycleState: 'authorized',
  validFrom: T0,
  expiresAt: '2026-07-15T01:00:00.000Z',
  authorizedAt: T0,
  authorizingAuthority: OWNER,
  canonicalDigest: exampleDigest('context-canonical'),
  createdAt: T0,
  integrity: signature(OWNER, 'action-context'),
};

export const OUTCOME_RECORD_FIXTURE_V1: OutcomeRecordV1 = {
  schemaVersion: TRUST_LOOP_SCHEMA_VERSION,
  outcomeId: 'out_0000000000000000000000000000',
  actionId: 'act_0000000000000000000000000000',
  taskId: 'task_000000000000000000000000000',
  contextId: 'ctx_0000000000000000000000000000',
  contextDigest: exampleDigest('context-canonical'),
  executionStatus: 'succeeded',
  businessOutcome: { value: 'delivered', assertionClass: 'runtime_observed', source: RUNTIME },
  expected: {
    maxCost: { amountMinor: '500', currency: 'USD', decimals: 2 },
    deliverableSummary: 'One report',
    sourceRef: { type: 'action_context', id: 'ctx_0000000000000000000000000000', version: 1 },
  },
  actual: {
    actualCost: { amountMinor: '480', currency: 'USD', decimals: 2 },
    deliverableSummary: 'One report delivered',
    source: RUNTIME,
  },
  settlement: {
    status: 'settled',
    quote: { amountMinor: '500', currency: 'USD', decimals: 2 },
    authorized: { amountMinor: '500', currency: 'USD', decimals: 2 },
    actualDebit: { amountMinor: '480', currency: 'USD', decimals: 2 },
    net: { amountMinor: '480', currency: 'USD', decimals: 2 },
    paymentAuthority: PAYMENT_AUTHORITY,
    settlementRefs: [{ type: 'settlement', id: 'settle_00000000' }],
    confirmedAt: T1,
  },
  artifacts: [
    {
      evidenceId: 'ev_report_0001',
      kind: 'artifact',
      digest: exampleDigest('artifact'),
      locator: 'store://evidence/ev_report_0001',
      issuer: RUNTIME,
      dataClass: 'restricted',
      createdAt: T1,
    },
  ],
  producer: RUNTIME,
  assertionClass: 'runtime_observed',
  occurredAt: T0,
  recordedAt: T1,
  integrity: signature(RUNTIME, 'outcome'),
};

export const VERIFICATION_RESULT_FIXTURE_V1: VerificationResultV1 = {
  schemaVersion: TRUST_LOOP_SCHEMA_VERSION,
  verificationId: 'ver_0000000000000000000000000000',
  subjectRefs: [{ type: 'outcome_record', id: 'out_0000000000000000000000000000' }],
  verifier: EXTERNAL_VERIFIER,
  independenceClass: 'independent_external',
  method: { id: 'method.report_review', version: '1' },
  claims: [
    {
      claimId: 'claim_0001',
      statement: 'The delivered report matches the requested scope',
      scope: 'deliverable',
      result: 'verified',
      canProve: 'artifact digest matches',
      cannotProve: 'downstream business impact',
    },
  ],
  evidenceRefs: [
    {
      evidenceId: 'ev_check_0001',
      kind: 'manual_check',
      digest: exampleDigest('verification-evidence'),
      dataClass: 'private',
      createdAt: T1,
    },
  ],
  verdict: 'verified',
  reasonCodes: ['scope_match'],
  issuedAt: T1,
  expiresAt: '2026-08-15T00:00:00.000Z',
  signature: signature(EXTERNAL_VERIFIER, 'verification'),
};

export const CREDENTIAL_STATUS_FIXTURE_V1: CredentialStatusV1 = {
  schemaVersion: TRUST_LOOP_SCHEMA_VERSION,
  statusId: 'cst_0000000000000000000000000000',
  credentialRef: { type: 'verification_result', id: 'ver_0000000000000000000000000000' },
  status: 'active',
  statusVersion: 1,
  effectiveAt: T1,
  reasonCode: 'issued',
  authority: STATUS_AUTHORITY,
  nextUpdateAt: '2026-07-16T00:00:00.000Z',
  integrity: signature(STATUS_AUTHORITY, 'credential-status'),
};

export const DISPUTE_CASE_FIXTURE_V1: DisputeCaseV1 = {
  schemaVersion: TRUST_LOOP_SCHEMA_VERSION,
  disputeId: 'dsp_0000000000000000000000000000',
  contestedRefs: [{ type: 'outcome_record', id: 'out_0000000000000000000000000000' }],
  claimant: OWNER,
  respondents: [AGENT],
  claims: [
    {
      claimId: 'dclaim_0001',
      statement: 'The deliverable was incomplete',
      contestedRef: { type: 'outcome_record', id: 'out_0000000000000000000000000000' },
    },
  ],
  evidenceRefs: [
    {
      evidenceId: 'ev_dispute_0001',
      kind: 'log',
      digest: exampleDigest('dispute-evidence'),
      dataClass: 'restricted',
      createdAt: T1,
    },
  ],
  requestedRemedies: [
    { remedyId: 'rem_0001', type: 'partial_refund', amount: { amountMinor: '200', currency: 'USD', decimals: 2 } },
  ],
  state: 'opened',
  authority: ARBITER,
  sla: { openedAt: T1, responseDueAt: '2026-07-17T00:00:00.000Z' },
  privacyClass: 'private',
  version: 1,
  integrity: signature(ARBITER, 'dispute'),
};

export const REPUTATION_CARD_FIXTURE_V1: ReputationCardV1 = {
  schemaVersion: TRUST_LOOP_SCHEMA_VERSION,
  cardId: 'rep_0000000000000000000000000000',
  subject: AGENT,
  context: { actionClass: 'paid_task', toolClass: 'economy', domain: 'reporting', role: 'executor', environment: 'sandbox' },
  window: { from: '2026-06-15T00:00:00.000Z', to: T1 },
  projector: { id: 'projector.contextual', version: '1', inputSetDigest: exampleDigest('input-set') },
  dimensions: [
    { dimension: 'reliability', value: 0.98, sampleSize: 40 },
    { dimension: 'completion_quality', value: 0.95, sampleSize: 40 },
    { dimension: 'cost_deviation', value: -0.04, unit: 'ratio', sampleSize: 40 },
    { dimension: 'dispute_remedy', value: null, sampleSize: 0 },
    { dimension: 'verification_coverage', value: 0.6, sampleSize: 40 },
  ],
  sample: { total: 40, verified: 24, disputed: 1, remedied: 1 },
  evidenceDistribution: { runtime_observed: 30, authority_confirmed: 10 },
  uncertainty: { status: 'limited', reasons: ['dispute_remedy: insufficient sample'] },
  explanation: [
    { label: 'high completion quality', direction: 'positive', sourceRef: { type: 'outcome_record', id: 'out_0000000000000000000000000000' }, weight: 0.4 },
  ],
  sourceManifestRef: 'manifest_00000000',
  generatedAt: T1,
  integrity: signature(PROJECTOR, 'reputation'),
};

export const ASSURANCE_PROFILE_FIXTURE_V1: AssuranceProfileV1 = {
  schemaVersion: TRUST_LOOP_SCHEMA_VERSION,
  profileId: 'asr_0000000000000000000000000000',
  subject: AGENT,
  identity: [{ claimId: 'a_id_0001', category: 'identity.did', state: 'verified' }],
  execution: [{ claimId: 'a_ex_0001', category: 'execution.control_plane', state: 'enforced' }],
  enforcementLayers: [ENFORCEMENT_SOFTWARE, ENFORCEMENT_4337],
  verificationIndependence: [{ claimId: 'a_vi_0001', category: 'verifier.independence', state: 'verified' }],
  hardware: [{ claimId: 'a_hw_0001', category: 'hardware.attestation', state: 'claimed', note: 'test_ca_card' }],
  freshness: { evaluatedAt: T1, expiresAt: '2026-07-16T00:00:00.000Z', staleRefs: [] },
  evaluator: { id: 'assurance.evaluator', version: '1' },
  generatedAt: T1,
  integrity: signature(ASSURANCE_EVAL, 'assurance'),
};

export const RISK_DECISION_FIXTURE_V1: RiskDecisionV1 = {
  schemaVersion: TRUST_LOOP_SCHEMA_VERSION,
  decisionId: 'rsk_0000000000000000000000000000',
  actionId: 'act_0000000000000000000000000000',
  contextId: 'ctx_0000000000000000000000000000',
  mode: 'shadow',
  engine: { id: 'risk.engine', version: '0.1' },
  inputSnapshotRefs: [{ type: 'action_context', id: 'ctx_0000000000000000000000000000', version: 1 }],
  recommendation: 'allow_with_step_up',
  proposedEnforcement: { actions: ['step_up', 'require_additional_verifier'], note: 'shadow only' },
  ownerPolicyCeiling: { maxCost: { amountMinor: '1000', currency: 'USD', decimals: 2 }, maxSessionSeconds: 3600 },
  reasonCodes: ['new_counterparty'],
  uncertainty: ['limited_history'],
  expiresAt: '2026-07-15T00:30:00.000Z',
  createdAt: T1,
  integrity: signature(RISK_ENGINE, 'risk'),
};

export const FEEDBACK_RIGHT_FIXTURE_V1: FeedbackRightV1 = {
  schemaVersion: TRUST_LOOP_SCHEMA_VERSION,
  feedbackRightId: 'fbr_0000000000000000000000000000',
  subject: OWNER,
  triggerRefs: [{ type: 'risk_decision', id: 'rsk_0000000000000000000000000000' }],
  rights: ['notice', 'explanation', 'access_sources', 'contest', 'appeal', 'human_review'],
  deadline: '2026-07-22T00:00:00.000Z',
  channel: 'console://soul-core/feedback',
  state: 'offered',
  version: 1,
  authority: FEEDBACK_SVC,
  createdAt: T1,
  integrity: signature(FEEDBACK_SVC, 'feedback'),
};

export const TRUST_LOOP_FIXTURES: Record<TrustContractName, unknown> = {
  ActionContextV1: ACTION_CONTEXT_FIXTURE_V1,
  OutcomeRecordV1: OUTCOME_RECORD_FIXTURE_V1,
  VerificationResultV1: VERIFICATION_RESULT_FIXTURE_V1,
  CredentialStatusV1: CREDENTIAL_STATUS_FIXTURE_V1,
  DisputeCaseV1: DISPUTE_CASE_FIXTURE_V1,
  ReputationCardV1: REPUTATION_CARD_FIXTURE_V1,
  AssuranceProfileV1: ASSURANCE_PROFILE_FIXTURE_V1,
  RiskDecisionV1: RISK_DECISION_FIXTURE_V1,
  FeedbackRightV1: FEEDBACK_RIGHT_FIXTURE_V1,
};

/** A small fixed object used to lock the canonical-JSON algorithm against drift. */
export const CANONICAL_GOLDEN_SAMPLE = {
  b: 1,
  a: 'x',
  nested: { z: true, y: null, arr: [3, 1, 2] },
  omit: undefined,
} as const;

/** Expected canonical JSON for {@link CANONICAL_GOLDEN_SAMPLE} (keys sorted, undefined dropped). */
export const CANONICAL_GOLDEN_JSON = '{"a":"x","b":1,"nested":{"arr":[3,1,2],"y":null,"z":true}}';
