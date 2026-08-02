/**
 * Soul Core Action Trust Loop v1.1 — data classification + write-authority
 * metadata (TL-01.1; R11 & R12; design.md §4).
 *
 * Two orthogonal governance layers, expressed as data so API/service layers can
 * enforce them uniformly and tests can assert them:
 *
 *   1. Field-level data classification (public / owner / private / restricted)
 *      driving minimal-disclosure views (R12.1).
 *   2. Object / field / event write-authority — who may write each canonical
 *      fact, who may only submit, and what is forbidden (R11.1, design §4).
 *
 * This module is metadata only. It does not perform I/O and it never widens a
 * privilege: the helpers can withhold a field, never invent one.
 */

import type { DataClass } from './trust-loop-primitives';
import { DATA_CLASS_RANK } from './trust-loop-primitives';
import type { TrustContractName } from './trust-loop-contracts';
import { TRUST_CONTRACT_NAMES } from './trust-loop-contracts';

// ---------------------------------------------------------------------------
// Field-level data classification (R12)
// ---------------------------------------------------------------------------

export type FieldClassificationMap = Record<string, DataClass>;

export interface ContractGovernance {
  /** Applied to any field not explicitly listed (minimal-disclosure default). */
  defaultClass: DataClass;
  /** Exact top-level field name (or dotted nested path) → classification. */
  fields: FieldClassificationMap;
}

const COMMON_PUBLIC = {
  schemaVersion: 'public',
} as const;

/**
 * Per-contract field classification. Anything not listed inherits
 * `defaultClass`. Digests are `public` (they reveal nothing); raw summaries,
 * economics and evidence locators are `private`/`restricted`.
 */
export const DATA_CLASSIFICATION: Record<TrustContractName, ContractGovernance> = {
  ActionContextV1: {
    defaultClass: 'owner',
    fields: {
      ...COMMON_PUBLIC,
      contextId: 'public',
      contextVersion: 'public',
      actionId: 'owner',
      riskMode: 'owner',
      lifecycleState: 'owner',
      privacyClass: 'public',
      canonicalDigest: 'public',
      'intent.digest': 'public',
      'intent.summary': 'private',
      'economics.maxCost': 'owner',
      'economics.quoteRef': 'owner',
      'target.counterparty': 'private',
      'target.resourceRef': 'private',
      integrity: 'public',
      createdAt: 'owner',
    },
  },
  OutcomeRecordV1: {
    defaultClass: 'owner',
    fields: {
      ...COMMON_PUBLIC,
      outcomeId: 'public',
      actionId: 'owner',
      contextDigest: 'public',
      executionStatus: 'owner',
      assertionClass: 'public',
      'businessOutcome.value': 'owner',
      'actual.actualCost': 'private',
      'actual.effectSummary': 'private',
      'settlement.status': 'owner',
      'settlement.actualDebit': 'private',
      'settlement.net': 'private',
      artifacts: 'restricted',
      integrity: 'public',
    },
  },
  VerificationResultV1: {
    defaultClass: 'owner',
    fields: {
      ...COMMON_PUBLIC,
      verificationId: 'public',
      verifier: 'public',
      independenceClass: 'public',
      method: 'public',
      verdict: 'public',
      reasonCodes: 'public',
      issuedAt: 'public',
      expiresAt: 'public',
      claims: 'owner',
      evidenceRefs: 'restricted',
      signature: 'public',
    },
  },
  CredentialStatusV1: {
    defaultClass: 'owner',
    fields: {
      ...COMMON_PUBLIC,
      statusId: 'public',
      credentialRef: 'owner',
      status: 'public',
      statusVersion: 'public',
      effectiveAt: 'public',
      reasonCode: 'owner',
      authority: 'public',
      nextUpdateAt: 'public',
      integrity: 'public',
    },
  },
  DisputeCaseV1: {
    defaultClass: 'private',
    fields: {
      ...COMMON_PUBLIC,
      disputeId: 'owner',
      state: 'owner',
      privacyClass: 'public',
      claimant: 'private',
      respondents: 'private',
      claims: 'restricted',
      evidenceRefs: 'restricted',
      requestedRemedies: 'private',
      resolution: 'private',
      sla: 'owner',
      integrity: 'public',
    },
  },
  ReputationCardV1: {
    defaultClass: 'owner',
    fields: {
      ...COMMON_PUBLIC,
      cardId: 'public',
      subject: 'public',
      context: 'public',
      window: 'public',
      projector: 'public',
      dimensions: 'owner',
      sample: 'owner',
      evidenceDistribution: 'owner',
      uncertainty: 'public',
      explanation: 'private',
      sourceManifestRef: 'private',
      integrity: 'public',
    },
  },
  AssuranceProfileV1: {
    defaultClass: 'owner',
    fields: {
      ...COMMON_PUBLIC,
      profileId: 'public',
      subject: 'public',
      enforcementLayers: 'owner',
      freshness: 'owner',
      evaluator: 'public',
      hardware: 'private',
      integrity: 'public',
    },
  },
  RiskDecisionV1: {
    defaultClass: 'owner',
    fields: {
      ...COMMON_PUBLIC,
      decisionId: 'owner',
      mode: 'owner',
      engine: 'owner',
      recommendation: 'owner',
      reasonCodes: 'owner',
      proposedEnforcement: 'owner',
      ownerPolicyCeiling: 'owner',
      inputSnapshotRefs: 'restricted',
      uncertainty: 'owner',
      integrity: 'public',
    },
  },
  FeedbackRightV1: {
    defaultClass: 'owner',
    fields: {
      ...COMMON_PUBLIC,
      feedbackRightId: 'owner',
      subject: 'private',
      rights: 'owner',
      channel: 'private',
      state: 'owner',
      deadline: 'owner',
      authority: 'public',
      integrity: 'public',
    },
  },
};

/** Resolve the classification of a field (exact path, else contract default). */
export function getFieldDataClass(contract: TrustContractName, fieldPath: string): DataClass {
  const gov = DATA_CLASSIFICATION[contract];
  return gov.fields[fieldPath] ?? gov.defaultClass;
}

/**
 * Produce a minimal-disclosure view of a contract object for a given clearance:
 * top-level fields classified above `clearance` are withheld (omitted), never
 * blanked in place. Deeper selective disclosure is layered on in TL-02.3; this
 * establishes the fail-safe default of least exposure (R12.1, R12.3).
 */
export function minimalDisclosureView<T extends Record<string, unknown>>(
  contract: TrustContractName,
  obj: T,
  clearance: DataClass,
): Partial<T> {
  const maxRank = DATA_CLASS_RANK[clearance];
  const out: Partial<T> = {};
  for (const key of Object.keys(obj) as Array<keyof T & string>) {
    const cls = getFieldDataClass(contract, key);
    if (DATA_CLASS_RANK[cls] <= maxRank) {
      out[key] = obj[key];
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Write-authority matrix (R11; design §4)
// ---------------------------------------------------------------------------

export const WRITE_AUTHORITY_ROLES = [
  'context_builder',
  'action_runtime',
  'tool_adapter',
  'payment_authority',
  'verifier',
  'issuer_status_authority',
  'arbiter',
  'projector',
  'assurance_evaluator',
  'risk_engine',
  'authority',
  'feedback_policy_service',
  'client',
  'platform',
  'subject',
] as const;
export type WriteAuthorityRole = (typeof WRITE_AUTHORITY_ROLES)[number];

/** Canonical facts / objects governed by the matrix (nine contracts + two facts). */
export const TRUST_WRITE_OBJECTS = [
  ...TRUST_CONTRACT_NAMES,
  'ExecutionFacts',
  'PaymentSettlement',
] as const;
export type TrustWriteObject = (typeof TRUST_WRITE_OBJECTS)[number];

export interface WriteAuthorityEntry {
  /** The only role allowed to write the canonical fact. */
  canonicalWriter: WriteAuthorityRole;
  /** Roles that may submit inputs/requests but do not own the canonical fact. */
  submitters: WriteAuthorityRole[];
  /** Human-readable forbidden behaviors (design §4 "禁止行为"). */
  forbidden: string[];
}

export const WRITE_AUTHORITY_MATRIX: Record<TrustWriteObject, WriteAuthorityEntry> = {
  ActionContextV1: {
    canonicalWriter: 'context_builder',
    submitters: ['client', 'authority'],
    forbidden: ['client marks context authorized/enforced without Authority'],
  },
  ExecutionFacts: {
    canonicalWriter: 'action_runtime',
    submitters: ['tool_adapter', 'client'],
    forbidden: ['projector rewrites runtime execution facts'],
  },
  OutcomeRecordV1: {
    canonicalWriter: 'action_runtime',
    submitters: ['tool_adapter', 'payment_authority'],
    forbidden: ['producer proof auto-marks verified', 'projector rewrites outcome'],
  },
  PaymentSettlement: {
    canonicalWriter: 'payment_authority',
    submitters: ['arbiter'],
    forbidden: ['dispute service or UI self-reports refund/reversal completed'],
  },
  VerificationResultV1: {
    canonicalWriter: 'verifier',
    submitters: ['platform'],
    forbidden: [
      'platform signs on behalf of an external verifier',
      'client overrides independenceClass',
    ],
  },
  CredentialStatusV1: {
    canonicalWriter: 'issuer_status_authority',
    submitters: [],
    forbidden: ['RP or projector rewrites credential status'],
  },
  DisputeCaseV1: {
    canonicalWriter: 'arbiter',
    submitters: ['client', 'subject'],
    forbidden: ['unilateral over-authority ruling', 'deleting submitted evidence'],
  },
  ReputationCardV1: {
    canonicalWriter: 'projector',
    submitters: ['subject'],
    forbidden: ['UI directly edits a dimension score'],
  },
  AssuranceProfileV1: {
    canonicalWriter: 'assurance_evaluator',
    submitters: ['client'],
    forbidden: ['claimed evidence masquerades as verified/enforced'],
  },
  RiskDecisionV1: {
    canonicalWriter: 'risk_engine',
    submitters: ['authority'],
    forbidden: ['risk raises owner ceiling', 'risk widens allowlist or extends session'],
  },
  FeedbackRightV1: {
    canonicalWriter: 'feedback_policy_service',
    submitters: ['subject'],
    forbidden: ['silently closing or deleting feedback history'],
  },
};

/**
 * Field-level write-authority overrides — fields whose writer differs from the
 * object's canonical writer. Enforces "settlement is written by the payment
 * authority" and "independence class comes from the registry, not the client".
 */
export const FIELD_WRITE_AUTHORITY: Partial<
  Record<TrustContractName, Partial<Record<string, WriteAuthorityRole>>>
> = {
  OutcomeRecordV1: {
    settlement: 'payment_authority',
    'settlement.status': 'payment_authority',
    'settlement.actualDebit': 'payment_authority',
    'settlement.refunded': 'payment_authority',
    'settlement.net': 'payment_authority',
  },
  VerificationResultV1: {
    independenceClass: 'verifier',
    signature: 'verifier',
  },
  RiskDecisionV1: {
    actualAuthorityDecision: 'authority',
  },
};

export function getWriteAuthority(object: TrustWriteObject): WriteAuthorityEntry {
  return WRITE_AUTHORITY_MATRIX[object];
}

/** Resolve who may write a specific field (field override, else object canonical writer). */
export function getFieldWriteAuthority(
  contract: TrustContractName,
  fieldPath: string,
): WriteAuthorityRole {
  const override = FIELD_WRITE_AUTHORITY[contract]?.[fieldPath];
  if (override) return override;
  return WRITE_AUTHORITY_MATRIX[contract].canonicalWriter;
}

// ---------------------------------------------------------------------------
// Event-level write-authority (design §5.2 domain events)
// ---------------------------------------------------------------------------

export const TRUST_DOMAIN_EVENTS = [
  'action.context.created.v1',
  'action.context.authorized.v1',
  'action.outcome.recorded.v1',
  'settlement.status.confirmed.v1',
  'verification.result.recorded.v1',
  'credential.status.changed.v1',
  'dispute.opened.v1',
  'dispute.evidence_added.v1',
  'dispute.transitioned.v1',
  'remedy.requested.v1',
  'remedy.confirmed.v1',
  'reputation.card.projected.v1',
  'assurance.profile.evaluated.v1',
  'risk.decision.emitted.v1',
  'authority.decision.recorded.v1',
  'feedback.right.offered.v1',
  'feedback.right.exercised.v1',
  'trust.disclosure.receipted.v1',
] as const;
export type TrustDomainEvent = (typeof TRUST_DOMAIN_EVENTS)[number];

export const EVENT_WRITE_AUTHORITY: Record<TrustDomainEvent, WriteAuthorityRole> = {
  'action.context.created.v1': 'context_builder',
  'action.context.authorized.v1': 'authority',
  'action.outcome.recorded.v1': 'action_runtime',
  'settlement.status.confirmed.v1': 'payment_authority',
  'verification.result.recorded.v1': 'verifier',
  'credential.status.changed.v1': 'issuer_status_authority',
  'dispute.opened.v1': 'arbiter',
  'dispute.evidence_added.v1': 'arbiter',
  'dispute.transitioned.v1': 'arbiter',
  'remedy.requested.v1': 'arbiter',
  'remedy.confirmed.v1': 'payment_authority',
  'reputation.card.projected.v1': 'projector',
  'assurance.profile.evaluated.v1': 'assurance_evaluator',
  'risk.decision.emitted.v1': 'risk_engine',
  'authority.decision.recorded.v1': 'authority',
  'feedback.right.offered.v1': 'feedback_policy_service',
  'feedback.right.exercised.v1': 'subject',
  'trust.disclosure.receipted.v1': 'platform',
};
