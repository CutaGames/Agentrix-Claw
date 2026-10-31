import { computeDigest, type DigestRef } from './trust-loop-primitives';

/** Trust-owned seams consumed by Continuity. This is not an AP package DTO. */
export const TRUST_CORE_CONTINUITY_EXIT_SCHEMA_VERSION = 1 as const;
export const TRUST_CORE_CONTINUITY_EXIT_RECEIPT_DOMAIN =
  'AGENTRIX_TRUST_CORE_CONTINUITY_EXIT_V1' as const;

export const TRUST_CORE_EVIDENCE_ENVIRONMENTS_V1 = [
  'local',
  'test',
  'staging',
  'production',
] as const;
export type TrustCoreEvidenceEnvironmentV1 =
  (typeof TRUST_CORE_EVIDENCE_ENVIRONMENTS_V1)[number];

export const TRUST_CORE_CHALLENGE_OPERATION_KINDS_V1 = [
  'owner_authorization',
  'successor_binding',
  'applicable_set_revoke',
  'protected_ingress_denial',
] as const;
export type TrustCoreChallengeOperationKindV1 =
  (typeof TRUST_CORE_CHALLENGE_OPERATION_KINDS_V1)[number];

export const TRUST_CORE_CHALLENGE_JOURNAL_STATES_V1 = [
  'reserved',
  'executing',
  'succeeded',
  'rejected',
  'unknown',
] as const;
export type TrustCoreChallengeJournalStateV1 =
  (typeof TRUST_CORE_CHALLENGE_JOURNAL_STATES_V1)[number];

export const TRUST_CORE_CHALLENGE_TERMINAL_DECISIONS_V1 = [
  'authorized',
  'denied',
  'conflict',
  'unavailable',
] as const;
export type TrustCoreChallengeTerminalDecisionV1 =
  (typeof TRUST_CORE_CHALLENGE_TERMINAL_DECISIONS_V1)[number];

export const TRUST_CORE_CONTINUITY_REASON_CODES_V1 = [
  'authorized',
  'wrong_agent',
  'wrong_owner',
  'wrong_tenant',
  'wrong_environment',
  'stale_ownership_epoch',
  'stale_identity_epoch',
  'stale_mapping_version',
  'agent_unavailable',
  'tenant_authorizer_unavailable',
  // The canonical tenant authority answered, and it holds no tenancy fact for this
  // Agent in this environment. Distinct from `tenant_authorizer_unavailable`, which
  // means the authority itself is disabled or unreadable. Never a denial of a claim.
  'tenant_assignment_absent',
  'tenant_evidence_conflict',
  'identity_mapping_missing',
  'identity_mapping_ambiguous',
  'identity_mapping_inactive',
  'identity_history_missing',
  'identity_history_conflict',
  'predecessor_binding_unavailable',
  'successor_runtime_not_distinct',
  'successor_authority_unavailable',
  'successor_authority_lineage_conflict',
  'successor_binding_conflict',
  'successor_binding_unknown_outcome',
  'applicable_set_revoked',
  'applicable_set_unavailable',
  'applicable_set_conflict',
  'revocation_outcome_unknown',
  'protected_ingress_denied_no_side_effect',
  'protected_ingress_not_denied',
  'protected_ingress_side_effect_detected',
  'protected_ingress_evidence_conflict',
  'protected_ingress_unavailable',
  'challenge_in_progress',
  'challenge_unknown_outcome',
  'idempotency_conflict',
  'journal_unavailable',
] as const;
export type TrustCoreContinuityReasonCodeV1 =
  (typeof TRUST_CORE_CONTINUITY_REASON_CODES_V1)[number];

export interface TrustCoreCanonicalEvidenceRefV1 {
  kind:
    | 'agent_account'
    | 'tenant_authorization'
    | 'identity_mapping'
    | 'identity_mapping_history'
    | 'authority_grant'
    | 'shell_binding'
    | 'runtime_binding'
    | 'applicable_set'
    | 'protected_ingress'
    | 'side_effect_fence'
    | 'challenge_journal'
    | 'trust_receipt';
  id: string;
  version: string;
  digest: DigestRef;
}

export interface TrustCoreTenantAuthorizationEvidenceV1 {
  tenantId: string;
  ownerUserId: string;
  agentAccountId: string;
  environment: TrustCoreEvidenceEnvironmentV1;
  evidenceRef: TrustCoreCanonicalEvidenceRefV1;
  observedAt: string;
}

export type TrustCoreTenantAuthorizationResultV1 =
  | {
      status: 'authorized';
      evidence: TrustCoreTenantAuthorizationEvidenceV1;
    }
  | {
      status: 'denied' | 'conflict' | 'unavailable';
      reasonCode:
        | 'wrong_tenant'
        | 'wrong_environment'
        | 'tenant_evidence_conflict'
        | 'tenant_authorizer_unavailable'
        // Carried with status `unavailable`: no tenancy fact exists yet, so no
        // decision is possible. Reporting this as `wrong_tenant` would assert a
        // conclusion the authority never reached.
        | 'tenant_assignment_absent';
    };

export interface TrustCoreChallengeJournalRequestV1 {
  schemaVersion: typeof TRUST_CORE_CONTINUITY_EXIT_SCHEMA_VERSION;
  operationKind: TrustCoreChallengeOperationKindV1;
  agentId: string;
  agentAccountId: string;
  ownerUserId: string;
  tenantId: string;
  environment: TrustCoreEvidenceEnvironmentV1;
  idempotencyKey: string;
  requestSnapshot: Record<string, unknown>;
}

export interface TrustCoreChallengeTerminalReceiptV1 {
  schemaVersion: typeof TRUST_CORE_CONTINUITY_EXIT_SCHEMA_VERSION;
  receiptDomain: typeof TRUST_CORE_CONTINUITY_EXIT_RECEIPT_DOMAIN;
  receiptId: string;
  journalRef: string;
  operationKind: TrustCoreChallengeOperationKindV1;
  agentId: string;
  agentAccountId: string;
  ownerUserId: string;
  tenantId: string;
  environment: TrustCoreEvidenceEnvironmentV1;
  requestDigest: string;
  decision: TrustCoreChallengeTerminalDecisionV1;
  reasonCode: TrustCoreContinuityReasonCodeV1;
  ownershipEpoch?: string;
  evidenceRefs: TrustCoreCanonicalEvidenceRefV1[];
  resultSnapshot: Record<string, unknown>;
  recordedAt: string;
  receiptDigest: DigestRef;
}

export interface TrustCoreChallengeJournalViewV1 {
  schemaVersion: typeof TRUST_CORE_CONTINUITY_EXIT_SCHEMA_VERSION;
  journalRef: string;
  operationKind: TrustCoreChallengeOperationKindV1;
  agentId: string;
  agentAccountId: string;
  ownerUserId: string;
  tenantId: string;
  environment: TrustCoreEvidenceEnvironmentV1;
  idempotencyKey: string;
  requestDigest: string;
  state: TrustCoreChallengeJournalStateV1;
  attempts: number;
  terminalReceipt?: TrustCoreChallengeTerminalReceiptV1;
  terminalReason?: TrustCoreContinuityReasonCodeV1;
  createdAt: string;
  updatedAt: string;
}

export type TrustCoreChallengeBeginDispositionV1 =
  | 'execute'
  | 'return_existing'
  | 'query_only_reconciliation_required';

export interface TrustCoreChallengeBeginResultV1 {
  disposition: TrustCoreChallengeBeginDispositionV1;
  journal: TrustCoreChallengeJournalViewV1;
}

export interface TrustCoreOwnerAuthorizationCommandV1 {
  schemaVersion: typeof TRUST_CORE_CONTINUITY_EXIT_SCHEMA_VERSION;
  agentId: string;
  agentAccountId: string;
  ownerUserId: string;
  tenantId: string;
  environment: TrustCoreEvidenceEnvironmentV1;
  expectedOwnershipEpoch: string;
  idempotencyKey: string;
}

export interface TrustCoreOwnerAuthorizationReceiptV1
  extends TrustCoreChallengeTerminalReceiptV1 {
  operationKind: 'owner_authorization';
  ownershipEpoch?: string;
  resultSnapshot: {
    agentId: string;
    agentAccountId: string;
    ownerUserId: string;
    tenantId: string;
    environment: TrustCoreEvidenceEnvironmentV1;
    ownershipEpoch?: string;
  };
}

export type TrustCoreOwnerAuthorizationResultV1 =
  | {
      status: 'authorized';
      ownershipEpoch: string;
      receipt: TrustCoreOwnerAuthorizationReceiptV1;
    }
  | {
      status: 'denied' | 'conflict' | 'unavailable';
      reasonCode: TrustCoreContinuityReasonCodeV1;
      ownershipEpoch?: string;
      receipt: TrustCoreOwnerAuthorizationReceiptV1;
    }
  | {
      status: 'unknown';
      reasonCode: 'challenge_in_progress' | 'challenge_unknown_outcome';
      journalRef: string;
      requestDigest: string;
    };

export interface TrustCoreStableIdentityReadRequestV1 {
  schemaVersion: typeof TRUST_CORE_CONTINUITY_EXIT_SCHEMA_VERSION;
  agentId: string;
  agentAccountId: string;
  ownerUserId: string;
  tenantId: string;
  environment: TrustCoreEvidenceEnvironmentV1;
  expectedOwnershipEpoch: string;
  expectedIdentityEpoch: string;
  expectedMappingVersion: number;
}

export interface TrustCoreStableIdentityHistoryEvidenceV1 {
  historyRef: string;
  historyVersion: string;
  eventType: 'baseline_observed' | 'mapping_created' | 'status_changed';
  identityEpoch: string;
  mappingVersion: number;
  status: string;
  occurredAt: string;
  evidenceDigest: DigestRef;
}

export interface TrustCoreStableIdentityContinuityV1 {
  schemaVersion: typeof TRUST_CORE_CONTINUITY_EXIT_SCHEMA_VERSION;
  agentId: string;
  agentAccountId: string;
  ownerUserId: string;
  tenantId: string;
  environment: TrustCoreEvidenceEnvironmentV1;
  ownershipEpoch: string;
  soulCoreId: string;
  mappingRef: string;
  mappingSchemaVersion: number;
  mappingStatus: string;
  identityEpoch: string;
  mappingVersion: number;
  history: TrustCoreStableIdentityHistoryEvidenceV1[];
  canonicalEvidenceRefs: TrustCoreCanonicalEvidenceRefV1[];
  observedAt: string;
  evidenceDigest: DigestRef;
}

export type TrustCoreStableIdentityReadResultV1 =
  | {
      status: 'available';
      continuity: TrustCoreStableIdentityContinuityV1;
    }
  | {
      status: 'unavailable' | 'conflict';
      reasonCode:
        | 'wrong_agent'
        | 'wrong_owner'
        | 'wrong_tenant'
        | 'wrong_environment'
        | 'stale_ownership_epoch'
        | 'stale_identity_epoch'
        | 'stale_mapping_version'
        | 'agent_unavailable'
        | 'tenant_authorizer_unavailable'
        // Propagated from the tenant port: no tenancy fact exists yet, so the
        // identity read is unavailable rather than conflicting.
        | 'tenant_assignment_absent'
        | 'tenant_evidence_conflict'
        | 'identity_mapping_missing'
        | 'identity_mapping_ambiguous'
        | 'identity_mapping_inactive'
        | 'identity_history_missing'
        | 'identity_history_conflict';
    };

export interface TrustCoreContinuityContractValidationResultV1 {
  valid: boolean;
  errors: string[];
}

const DECIMAL = /^(0|[1-9][0-9]*)$/;
const DIGEST = /^[0-9a-f]{64}$/;
const IDEMPOTENCY = /^[A-Za-z0-9][A-Za-z0-9:._/-]{7,159}$/;

function object(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function text(value: unknown, max = 240): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= max;
}

function exactKeys(value: Record<string, unknown>, allowed: readonly string[]): boolean {
  const keys = new Set(allowed);
  return Object.keys(value).every((key) => keys.has(key));
}

function validation(errors: string[]): TrustCoreContinuityContractValidationResultV1 {
  return { valid: errors.length === 0, errors };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function validateExactObjectIdentity(
  input: Record<string, unknown>,
  errors: string[],
): void {
  for (const key of ['agentId', 'tenantId'] as const) {
    if (!text(input[key])) errors.push(`${key} must be a non-empty bounded string`);
  }
  for (const key of ['agentAccountId', 'ownerUserId'] as const) {
    if (typeof input[key] !== 'string' || !UUID.test(input[key])) {
      errors.push(`${key} must be a UUID`);
    }
  }
  if (!(TRUST_CORE_EVIDENCE_ENVIRONMENTS_V1 as readonly unknown[]).includes(input.environment)) {
    errors.push('environment is unsupported');
  }
}

export function validateTrustCoreChallengeJournalRequestV1(
  input: unknown,
): TrustCoreContinuityContractValidationResultV1 {
  const errors: string[] = [];
  if (!object(input)) return validation(['request must be an object']);
  if (
    !exactKeys(input, [
      'schemaVersion',
      'operationKind',
      'agentId',
      'agentAccountId',
      'ownerUserId',
      'tenantId',
      'environment',
      'idempotencyKey',
      'requestSnapshot',
    ])
  ) {
    errors.push('request contains unknown fields');
  }
  if (input.schemaVersion !== TRUST_CORE_CONTINUITY_EXIT_SCHEMA_VERSION) {
    errors.push('schemaVersion is unsupported');
  }
  if (!(TRUST_CORE_CHALLENGE_OPERATION_KINDS_V1 as readonly unknown[]).includes(input.operationKind)) {
    errors.push('operationKind is unsupported');
  }
  validateExactObjectIdentity(input, errors);
  if (typeof input.idempotencyKey !== 'string' || !IDEMPOTENCY.test(input.idempotencyKey)) {
    errors.push('idempotencyKey is malformed');
  }
  if (!object(input.requestSnapshot)) errors.push('requestSnapshot must be an object');
  return validation(errors);
}

export function validateTrustCoreOwnerAuthorizationCommandV1(
  input: unknown,
): TrustCoreContinuityContractValidationResultV1 {
  const errors: string[] = [];
  if (!object(input)) return validation(['command must be an object']);
  if (
    !exactKeys(input, [
      'schemaVersion',
      'agentId',
      'agentAccountId',
      'ownerUserId',
      'tenantId',
      'environment',
      'expectedOwnershipEpoch',
      'idempotencyKey',
    ])
  ) {
    errors.push('command contains unknown fields');
  }
  if (input.schemaVersion !== TRUST_CORE_CONTINUITY_EXIT_SCHEMA_VERSION) {
    errors.push('schemaVersion is unsupported');
  }
  validateExactObjectIdentity(input, errors);
  if (typeof input.expectedOwnershipEpoch !== 'string' || !DECIMAL.test(input.expectedOwnershipEpoch)) {
    errors.push('expectedOwnershipEpoch must be a decimal string');
  }
  if (typeof input.idempotencyKey !== 'string' || !IDEMPOTENCY.test(input.idempotencyKey)) {
    errors.push('idempotencyKey is malformed');
  }
  return validation(errors);
}

export function validateTrustCoreStableIdentityReadRequestV1(
  input: unknown,
): TrustCoreContinuityContractValidationResultV1 {
  const errors: string[] = [];
  if (!object(input)) return validation(['request must be an object']);
  if (
    !exactKeys(input, [
      'schemaVersion',
      'agentId',
      'agentAccountId',
      'ownerUserId',
      'tenantId',
      'environment',
      'expectedOwnershipEpoch',
      'expectedIdentityEpoch',
      'expectedMappingVersion',
    ])
  ) {
    errors.push('request contains unknown fields');
  }
  if (input.schemaVersion !== TRUST_CORE_CONTINUITY_EXIT_SCHEMA_VERSION) {
    errors.push('schemaVersion is unsupported');
  }
  validateExactObjectIdentity(input, errors);
  if (typeof input.expectedOwnershipEpoch !== 'string' || !DECIMAL.test(input.expectedOwnershipEpoch)) {
    errors.push('expectedOwnershipEpoch must be a decimal string');
  }
  if (typeof input.expectedIdentityEpoch !== 'string' || !DECIMAL.test(input.expectedIdentityEpoch)) {
    errors.push('expectedIdentityEpoch must be a decimal string');
  }
  if (
    typeof input.expectedMappingVersion !== 'number' ||
    !Number.isInteger(input.expectedMappingVersion) ||
    input.expectedMappingVersion < 0
  ) {
    errors.push('expectedMappingVersion must be a non-negative integer');
  }
  return validation(errors);
}

export function validateTrustCoreChallengeTerminalReceiptV1(
  input: unknown,
): TrustCoreContinuityContractValidationResultV1 {
  const errors: string[] = [];
  if (!object(input)) return validation(['receipt must be an object']);
  if (input.schemaVersion !== TRUST_CORE_CONTINUITY_EXIT_SCHEMA_VERSION) {
    errors.push('receipt.schemaVersion is unsupported');
  }
  if (input.receiptDomain !== TRUST_CORE_CONTINUITY_EXIT_RECEIPT_DOMAIN) {
    errors.push('receiptDomain is unsupported');
  }
  validateExactObjectIdentity(input, errors);
  for (const key of ['receiptId', 'journalRef', 'requestDigest', 'reasonCode', 'recordedAt'] as const) {
    if (!text(input[key])) errors.push(`receipt.${key} must be a non-empty string`);
  }
  if (typeof input.requestDigest === 'string' && !DIGEST.test(input.requestDigest)) {
    errors.push('receipt.requestDigest is malformed');
  }
  if (!(TRUST_CORE_CHALLENGE_OPERATION_KINDS_V1 as readonly unknown[]).includes(input.operationKind)) {
    errors.push('receipt.operationKind is unsupported');
  }
  if (!(TRUST_CORE_CHALLENGE_TERMINAL_DECISIONS_V1 as readonly unknown[]).includes(input.decision)) {
    errors.push('receipt.decision is unsupported');
  }
  if (!(TRUST_CORE_CONTINUITY_REASON_CODES_V1 as readonly unknown[]).includes(input.reasonCode)) {
    errors.push('receipt.reasonCode is unsupported');
  }
  if (input.ownershipEpoch !== undefined && (typeof input.ownershipEpoch !== 'string' || !DECIMAL.test(input.ownershipEpoch))) {
    errors.push('receipt.ownershipEpoch must be a decimal string when present');
  }
  if (!Array.isArray(input.evidenceRefs)) errors.push('receipt.evidenceRefs must be an array');
  if (!object(input.resultSnapshot)) errors.push('receipt.resultSnapshot must be an object');
  if (!object(input.receiptDigest)) {
    errors.push('receipt.receiptDigest is required');
  } else {
    const digest = input.receiptDigest as unknown as DigestRef;
    if (digest.algorithm !== 'sha-256' || typeof digest.value !== 'string' || !DIGEST.test(digest.value)) {
      errors.push('receipt.receiptDigest is malformed');
    }
  }
  if (text(input.recordedAt) && !Number.isFinite(Date.parse(input.recordedAt))) {
    errors.push('receipt.recordedAt must be an ISO timestamp');
  }
  if (errors.length === 0) {
    const { receiptDigest, ...unsigned } = input;
    if (computeDigest(unsigned).value !== (receiptDigest as unknown as DigestRef).value) {
      errors.push('receiptDigest does not match canonical receipt content');
    }
  }
  return validation(errors);
}
