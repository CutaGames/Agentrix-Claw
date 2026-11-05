import {
  TRUST_LOOP_CANONICALIZATION,
  computeDigest,
  verifyDigest,
  type DigestRef,
} from './trust-loop-primitives';

/**
 * Soul Core Continuity / Exit C0 contract.
 *
 * This file owns only snapshot/restore/proof/receipt profiles and opaque refs to
 * external canonical ports. It intentionally does not reproduce Portability
 * package, Trust command/receipt, Binding, Device, Authority or content DTOs.
 */
export const SOUL_CORE_CONTINUITY_SCHEMA_VERSION = 1 as const;
export const SOUL_CORE_CONTINUITY_CONTRACT_VERSION = '1.0' as const;
export const SOUL_CORE_CONTINUITY_FIXTURE_FLAG = 'SOUL_CORE_CONTINUITY_C1_ENABLED' as const;
export const SOUL_CORE_CONTINUITY_FIXTURE_ID =
  'CE-C0-RTJ-01-SOFTWARE-ALTERNATE-RUNTIME-V1' as const;

export const CONTINUITY_DIGEST_DOMAINS_V1 = {
  profile: 'AGENTRIX_CONTINUITY_SNAPSHOT_PROFILE_V1',
  envelope: 'AGENTRIX_CONTINUITY_ENVELOPE_V1',
  ciphertext: 'AGENTRIX_CONTINUITY_CIPHERTEXT_V1',
  aad: 'AGENTRIX_CONTINUITY_AAD_V1',
  proof: 'AGENTRIX_CONTINUITY_PROOF_V1',
  plan: 'AGENTRIX_CONTINUITY_RESTORE_PLAN_V1',
  receipt: 'AGENTRIX_CONTINUITY_RESTORE_RECEIPT_V1',
  request: 'AGENTRIX_CONTINUITY_REQUEST_V1',
} as const;
export type ContinuityDigestDomainV1 =
  (typeof CONTINUITY_DIGEST_DOMAINS_V1)[keyof typeof CONTINUITY_DIGEST_DOMAINS_V1] | string;

export const CONTINUITY_ENVIRONMENTS_V1 = ['local', 'test', 'staging', 'production'] as const;
export type ContinuityEnvironmentV1 = (typeof CONTINUITY_ENVIRONMENTS_V1)[number];

export const CONTINUITY_EVIDENCE_LEVELS_V1 = [
  'self_attested_fixture',
  'platform_verified',
  'externally_verified',
] as const;
export type ContinuityEvidenceLevelV1 = (typeof CONTINUITY_EVIDENCE_LEVELS_V1)[number];

export const CONTINUITY_HISTORY_CLASSIFICATIONS_V1 = [
  'native',
  'imported',
  'legacy',
  'derived',
] as const;
export type ContinuityHistoryClassificationV1 =
  (typeof CONTINUITY_HISTORY_CLASSIFICATIONS_V1)[number];

export const CONTINUITY_FORBIDDEN_SECRET_CLASSES_V1 = [
  'oauth_token',
  'api_key',
  'cookie',
  'wallet_private_key',
  'mpc_share',
  'device_credential',
  'partner_credential',
  'runtime_session',
  'authority_grant_secret',
  'binding_secret',
] as const;
export type ContinuityForbiddenSecretClassV1 =
  (typeof CONTINUITY_FORBIDDEN_SECRET_CLASSES_V1)[number];

export const CONTINUITY_REASON_CODES_V1 = [
  'continuity_ok',
  'feature_disabled',
  'unsupported_schema_version',
  'unsupported_profile_version',
  'unsupported_contract_version',
  'unsupported_algorithm',
  'invalid_digest',
  'snapshot_tampered',
  'snapshot_stale',
  'snapshot_expired',
  'snapshot_key_unavailable',
  'snapshot_sequence_regression',
  'snapshot_base_missing',
  'snapshot_fork_ambiguous',
  'wrong_agent',
  'wrong_owner',
  'owner_epoch_stale',
  'wrong_tenant',
  'wrong_environment',
  'wrong_audience',
  'wrong_runtime',
  'challenge_expired',
  'challenge_replayed',
  'idempotency_conflict',
  'rollback_detected',
  'downgrade_detected',
  'package_substituted',
  'credential_material_detected',
  'cross_agent_attribution',
  'evidence_classification_escalated',
  'unsafe_source_content_detected',
  'inconsistent_scan_finding',
  'false_same_agent_claim',
  'identity_mapping_missing',
  'identity_mapping_duplicate',
  'identity_mapping_stale',
  'identity_mapping_mismatch',
  'target_version_conflict',
  'restore_partial',
  'restore_duplicate',
  'restore_unknown_outcome',
  'reauthorization_required',
  'reauthorization_rejected',
  'successor_binding_required',
  'successor_binding_failed',
  'revoke_partial',
  'revoke_unknown',
  'old_ingress_unexpectedly_allowed',
  'old_runtime_race_unknown',
  'external_port_unavailable',
  'external_evidence_not_found',
  'external_source_outage',
  'manual_resolution_required',
  'unknown_internal',
] as const;
export type ContinuityReasonCodeV1 = (typeof CONTINUITY_REASON_CODES_V1)[number];

export const RESTORE_STEP_OWNERS_V1 = [
  'continuity',
  'agent',
  'memory',
  'conversation',
  'knowledge',
  'skill_workflow',
  'portability',
  'trust_identity',
  'trust_authority',
  'trust_binding',
  'trust_revoke',
  'protected_ingress',
] as const;
export type RestoreStepOwnerV1 = (typeof RESTORE_STEP_OWNERS_V1)[number];

/**
 * A restore plan cannot shrink its own safety scope. Every owner listed here is
 * required and is always treated as mandatory, regardless of the flag the plan
 * declares for that step.
 */
export const CONTINUITY_REQUIRED_RESTORE_STEP_OWNERS_V1 = [
  'trust_identity',
  'portability',
  'agent',
  'trust_authority',
  'trust_binding',
  'trust_revoke',
  'protected_ingress',
] as const;
export type ContinuityRequiredRestoreStepOwnerV1 =
  (typeof CONTINUITY_REQUIRED_RESTORE_STEP_OWNERS_V1)[number];

/**
 * The package digest is produced and owned by Agent Portability
 * (`computeSovereignAgentPackageDigest`). Continuity carries it verbatim as a
 * plain `DigestRef` and never re-domains or recomputes it with its own helper,
 * so there is exactly one package digest algorithm across the two sessions.
 */
export type ContinuityPackageDigestV1 = DigestRef;

export const RESTORE_STEP_STATUSES_V1 = [
  'pending',
  'running',
  'succeeded',
  'rejected',
  'failed',
  'unknown',
  'compensated',
  'unavailable',
] as const;
export type RestoreStepStatusV1 = (typeof RESTORE_STEP_STATUSES_V1)[number];

export const RESTORE_RETRY_CLASSES_V1 = [
  'safe_replay',
  'reauthorize',
  'replan',
  'reconcile',
  'never',
] as const;
export type RestoreRetryClassV1 = (typeof RESTORE_RETRY_CLASSES_V1)[number];

export interface ContinuityDigestV1 extends DigestRef {
  algorithm: 'sha-256';
  canonicalization: typeof TRUST_LOOP_CANONICALIZATION;
  domain: ContinuityDigestDomainV1;
}

/** Opaque reference issued by an external canonical owner. */
export interface ContinuityExternalPortRefV1 {
  port: string;
  contractVersion: string;
  ref: string;
  digest?: ContinuityDigestV1;
}

export interface ContinuityIdentitySnapshotV1 {
  agentId: string;
  soulCoreId: string;
  agentAccountId: string;
  mappingVersion: string;
  mappingHistoryRef: ContinuityExternalPortRefV1;
}

export interface ContinuityAuthorizationSnapshotV1 {
  ownerPrincipalRef: string;
  ownershipEpoch: string;
  authorizationReceiptRef: ContinuityExternalPortRefV1;
  evidenceLevel: ContinuityEvidenceLevelV1;
}

export interface ContinuitySnapshotProfileUnsignedV1 {
  schemaVersion: typeof SOUL_CORE_CONTINUITY_SCHEMA_VERSION;
  profileVersion: typeof SOUL_CORE_CONTINUITY_CONTRACT_VERSION;
  profileId: string;
  snapshotId: string;
  sequence: string;
  baseSnapshotDigest: ContinuityDigestV1 | null;
  identity: ContinuityIdentitySnapshotV1;
  authorization: ContinuityAuthorizationSnapshotV1;
  tenantId: string;
  sourceEnvironment: ContinuityEnvironmentV1;
  intendedAudience: string;
  sourceRuntimeRef: string;
  packageRef: string;
  packageDigest: ContinuityPackageDigestV1;
  contentCheckpointRefs: ContinuityExternalPortRefV1[];
  historyEvidencePolicy: {
    preserveClassifications: ContinuityHistoryClassificationV1[];
    importedEvidenceUpgradeAllowed: false;
  };
  exclusions: {
    credentialMaterialIncluded: false;
    forbiddenClasses: ContinuityForbiddenSecretClassV1[];
  };
  createdAt: string;
  expiresAt: string;
}

export interface ContinuitySnapshotProfileV1 extends ContinuitySnapshotProfileUnsignedV1 {
  profileDigest: ContinuityDigestV1;
}

export interface EncryptedSnapshotWrappedDataKeyV1 {
  recipientKeyId: string;
  wrapSuite: string;
  wrappedKeyBase64: string;
}

export interface EncryptedSnapshotEnvelopeV1 {
  schemaVersion: typeof SOUL_CORE_CONTINUITY_SCHEMA_VERSION;
  envelopeVersion: typeof SOUL_CORE_CONTINUITY_CONTRACT_VERSION;
  envelopeId: string;
  snapshotId: string;
  profileDigest: ContinuityDigestV1;
  packageDigest: ContinuityPackageDigestV1;
  cipherSuite: 'aes-256-gcm';
  keyWrapSuite: 'aes-256-gcm-local-fixture' | 'external-kms-or-recipient-v1';
  nonceBase64: string;
  aadDigest: ContinuityDigestV1;
  ciphertextBase64: string;
  ciphertextDigest: ContinuityDigestV1;
  authTagBase64: string;
  wrappedDataKeys: EncryptedSnapshotWrappedDataKeyV1[];
  plaintextBytes: number;
  createdAt: string;
}

export interface ContinuityProofUnsignedV1 {
  schemaVersion: typeof SOUL_CORE_CONTINUITY_SCHEMA_VERSION;
  proofVersion: typeof SOUL_CORE_CONTINUITY_CONTRACT_VERSION;
  proofId: string;
  proofDomain: typeof CONTINUITY_DIGEST_DOMAINS_V1.proof;
  operationId: string;
  attempt: number;
  challengeId: string;
  challengeNonce: string;
  challengePurpose: 'restore_same_agent';
  challengeExpiresAt: string;
  profileDigest: ContinuityDigestV1;
  envelopeDigest: ContinuityDigestV1;
  packageDigest: ContinuityPackageDigestV1;
  identity: ContinuityIdentitySnapshotV1;
  ownerAuthorizationReceiptRef: ContinuityExternalPortRefV1;
  tenantId: string;
  sourceEnvironment: ContinuityEnvironmentV1;
  targetEnvironment: ContinuityEnvironmentV1;
  intendedAudience: string;
  sourceRuntimeRef: string;
  targetRuntimeRef: string;
  expectedSnapshotHeadDigest: ContinuityDigestV1;
  evidenceLevel: ContinuityEvidenceLevelV1;
  generatedAt: string;
  expiresAt: string;
}

export interface ContinuityProofV1 extends ContinuityProofUnsignedV1 {
  proofDigest: ContinuityDigestV1;
}

export interface RestorePlanStepV1 {
  stepId: string;
  order: number;
  owner: RestoreStepOwnerV1;
  portContractVersion: string;
  mandatory: boolean;
  requestDigest: ContinuityDigestV1;
  expectedTargetVersion: string | null;
  idempotencyKey: string;
  retryClass: RestoreRetryClassV1;
  compensationPortRef: ContinuityExternalPortRefV1 | null;
}

export interface RestorePlanUnsignedV1 {
  schemaVersion: typeof SOUL_CORE_CONTINUITY_SCHEMA_VERSION;
  planVersion: typeof SOUL_CORE_CONTINUITY_CONTRACT_VERSION;
  planId: string;
  operationId: string;
  attempt: number;
  profileDigest: ContinuityDigestV1;
  packageRef: string;
  packageDigest: ContinuityPackageDigestV1;
  proofDigest: ContinuityDigestV1;
  targetRuntimeRef: string;
  targetEnvironment: ContinuityEnvironmentV1;
  targetAgentDecision: 'restore_existing_same_agent';
  steps: RestorePlanStepV1[];
  createdAt: string;
  expiresAt: string;
}

export interface RestorePlanV1 extends RestorePlanUnsignedV1 {
  planDigest: ContinuityDigestV1;
}

export interface RuntimeReplacementHandoffV1 {
  schemaVersion: typeof SOUL_CORE_CONTINUITY_SCHEMA_VERSION;
  sourceRuntimeRef: string;
  targetRuntimeRef: string;
  reauthorization: {
    status: 'pending' | 'accepted' | 'rejected' | 'unknown' | 'unavailable';
    requestRef: ContinuityExternalPortRefV1;
    receiptRef: ContinuityExternalPortRefV1 | null;
  };
  successorBinding: {
    status: 'pending' | 'active' | 'rejected' | 'unknown' | 'unavailable';
    predecessorBindingRef: ContinuityExternalPortRefV1;
    requestRef: ContinuityExternalPortRefV1;
    receiptRef: ContinuityExternalPortRefV1 | null;
  };
  predecessorRevoke: {
    status: 'pending' | 'durable_revoked' | 'partial' | 'unknown' | 'unavailable';
    applicableSetRef: ContinuityExternalPortRefV1;
    operationRef: ContinuityExternalPortRefV1;
    combinedReceiptRef: ContinuityExternalPortRefV1 | null;
  };
  oldIngressDenial: {
    status: 'pending' | 'denied' | 'unexpectedly_allowed' | 'unknown' | 'unavailable';
    protectedRequestRef: string;
    evidenceRef: ContinuityExternalPortRefV1 | null;
    reasonCode: string | null;
    observedEpochDigest: ContinuityDigestV1 | null;
  };
}

export interface RestoreStepReceiptV1 {
  stepId: string;
  owner: RestoreStepOwnerV1;
  status: RestoreStepStatusV1;
  externalReceiptRef: ContinuityExternalPortRefV1 | null;
  reasonCode: ContinuityReasonCodeV1;
}

export interface RestoreReceiptUnsignedV1 {
  schemaVersion: typeof SOUL_CORE_CONTINUITY_SCHEMA_VERSION;
  receiptVersion: typeof SOUL_CORE_CONTINUITY_CONTRACT_VERSION;
  receiptId: string;
  operationId: string;
  attempt: number;
  idempotencyKey: string;
  requestDigest: ContinuityDigestV1;
  profileDigest: ContinuityDigestV1;
  envelopeDigest: ContinuityDigestV1;
  packageDigest: ContinuityPackageDigestV1;
  proofDigest: ContinuityDigestV1;
  planDigest: ContinuityDigestV1;
  sourceRuntimeRef: string;
  targetRuntimeRef: string;
  identityVerdict: 'verified_same_agent' | 'rejected' | 'unknown';
  identityReasonCode: ContinuityReasonCodeV1;
  stepReceipts: RestoreStepReceiptV1[];
  restoredSections: string[];
  omittedSections: Array<{ section: string; reasonCode: ContinuityReasonCodeV1 }>;
  evidenceClassificationPreserved: true;
  importedEvidenceUpgradeAllowed: false;
  runtimeReplacement: RuntimeReplacementHandoffV1;
  restoreStatus: 'partial' | 'restored' | 'failed' | 'unknown' | 'manual_resolution_required';
  exitStatus:
    | 'not_requested'
    | 'pending'
    | 'durable_revoked'
    | 'denial_verified'
    | 'complete'
    | 'partial'
    | 'unknown';
  recordedAt: string;
  completedAt: string | null;
}

export interface RestoreReceiptV1 extends RestoreReceiptUnsignedV1 {
  receiptDigest: ContinuityDigestV1;
}

export interface ContinuityContractValidationResultV1 {
  valid: boolean;
  errors: string[];
}

export class ContinuityContractValidationError extends Error {
  readonly code = 'soul_core_continuity_contract_invalid';

  constructor(readonly errors: string[]) {
    super(`Soul Core Continuity contract validation failed: ${errors.join('; ')}`);
    this.name = 'ContinuityContractValidationError';
  }
}

export interface ContinuitySecretFindingV1 {
  path: string;
  secretClass: ContinuityForbiddenSecretClassV1;
  source: 'key' | 'value_pattern';
}

export interface ContinuityLocalFixtureGateInputV1 {
  flagValue: string | undefined;
  environment: ContinuityEnvironmentV1;
  evidenceLevel: ContinuityEvidenceLevelV1;
}

export type ContinuityLocalFixtureGateResultV1 =
  | { enabled: true; capability: 'local_fixture'; reasonCode: 'continuity_ok' }
  | { enabled: false; capability: 'disabled'; reasonCode: ContinuityReasonCodeV1 };

export interface ContinuitySameAgentExpectedContextV1 {
  identity: ContinuityIdentitySnapshotV1;
  ownerPrincipalRef: string;
  ownershipEpoch: string;
  authorizationReceiptRef: ContinuityExternalPortRefV1;
  tenantId: string;
  sourceEnvironment: ContinuityEnvironmentV1;
  targetEnvironment: ContinuityEnvironmentV1;
  intendedAudience: string;
  sourceRuntimeRef: string;
  targetRuntimeRef: string;
  acceptedSnapshotHeadDigest: ContinuityDigestV1;
  now: string;
}

export type ContinuitySameAgentVerdictV1 =
  | { verified: true; reasonCode: 'continuity_ok' }
  | { verified: false; reasonCode: ContinuityReasonCodeV1 };

const PROFILE_KEYS = [
  'schemaVersion',
  'profileVersion',
  'profileId',
  'snapshotId',
  'sequence',
  'baseSnapshotDigest',
  'identity',
  'authorization',
  'tenantId',
  'sourceEnvironment',
  'intendedAudience',
  'sourceRuntimeRef',
  'packageRef',
  'packageDigest',
  'contentCheckpointRefs',
  'historyEvidencePolicy',
  'exclusions',
  'createdAt',
  'expiresAt',
  'profileDigest',
] as const;

const ENVELOPE_KEYS = [
  'schemaVersion',
  'envelopeVersion',
  'envelopeId',
  'snapshotId',
  'profileDigest',
  'packageDigest',
  'cipherSuite',
  'keyWrapSuite',
  'nonceBase64',
  'aadDigest',
  'ciphertextBase64',
  'ciphertextDigest',
  'authTagBase64',
  'wrappedDataKeys',
  'plaintextBytes',
  'createdAt',
] as const;

const PROOF_KEYS = [
  'schemaVersion',
  'proofVersion',
  'proofId',
  'proofDomain',
  'operationId',
  'attempt',
  'challengeId',
  'challengeNonce',
  'challengePurpose',
  'challengeExpiresAt',
  'profileDigest',
  'envelopeDigest',
  'packageDigest',
  'identity',
  'ownerAuthorizationReceiptRef',
  'tenantId',
  'sourceEnvironment',
  'targetEnvironment',
  'intendedAudience',
  'sourceRuntimeRef',
  'targetRuntimeRef',
  'expectedSnapshotHeadDigest',
  'evidenceLevel',
  'generatedAt',
  'expiresAt',
  'proofDigest',
] as const;

const PLAN_KEYS = [
  'schemaVersion',
  'planVersion',
  'planId',
  'operationId',
  'attempt',
  'profileDigest',
  'packageRef',
  'packageDigest',
  'proofDigest',
  'targetRuntimeRef',
  'targetEnvironment',
  'targetAgentDecision',
  'steps',
  'createdAt',
  'expiresAt',
  'planDigest',
] as const;

const RECEIPT_KEYS = [
  'schemaVersion',
  'receiptVersion',
  'receiptId',
  'operationId',
  'attempt',
  'idempotencyKey',
  'requestDigest',
  'profileDigest',
  'envelopeDigest',
  'packageDigest',
  'proofDigest',
  'planDigest',
  'sourceRuntimeRef',
  'targetRuntimeRef',
  'identityVerdict',
  'identityReasonCode',
  'stepReceipts',
  'restoredSections',
  'omittedSections',
  'evidenceClassificationPreserved',
  'importedEvidenceUpgradeAllowed',
  'runtimeReplacement',
  'restoreStatus',
  'exitStatus',
  'recordedAt',
  'completedAt',
  'receiptDigest',
] as const;

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function nonEmpty(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

function timestamp(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value) &&
    Number.isFinite(Date.parse(value))
  );
}

function decimal(value: unknown): value is string {
  return typeof value === 'string' && /^(0|[1-9]\d*)$/.test(value);
}

function base64(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.length % 4 === 0 &&
    /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)
  );
}

function exactKeys(
  value: Record<string, unknown>,
  required: readonly string[],
  optional: readonly string[] = [],
): boolean {
  const allowed = new Set([...required, ...optional]);
  const keys = Object.keys(value);
  return required.every((key) => Object.prototype.hasOwnProperty.call(value, key)) &&
    keys.every((key) => allowed.has(key));
}

function pushExactKeys(
  errors: string[],
  path: string,
  value: Record<string, unknown>,
  required: readonly string[],
  optional: readonly string[] = [],
): void {
  if (!exactKeys(value, required, optional)) {
    errors.push(`${path}: missing required or contains unknown fields`);
  }
}

function hasEnum<T extends string>(values: readonly T[], value: unknown): value is T {
  return typeof value === 'string' && (values as readonly string[]).includes(value);
}

function sameDigest(left: ContinuityDigestV1, right: ContinuityDigestV1): boolean {
  return (
    left.algorithm === right.algorithm &&
    left.canonicalization === right.canonicalization &&
    left.domain === right.domain &&
    left.value === right.value
  );
}

function validateDigest(
  value: unknown,
  path: string,
  errors: string[],
): value is ContinuityDigestV1 {
  if (!isObject(value)) {
    errors.push(`${path}: expected ContinuityDigestV1`);
    return false;
  }
  const startErrorCount = errors.length;
  pushExactKeys(errors, path, value, ['algorithm', 'canonicalization', 'domain', 'value']);
  if (value.algorithm !== 'sha-256') errors.push(`${path}.algorithm: unsupported`);
  if (value.canonicalization !== TRUST_LOOP_CANONICALIZATION) {
    errors.push(`${path}.canonicalization: unsupported`);
  }
  if (!nonEmpty(value.domain)) errors.push(`${path}.domain: expected non-empty string`);
  if (typeof value.value !== 'string' || !/^[0-9a-f]{64}$/.test(value.value)) {
    errors.push(`${path}.value: expected 64 lowercase hex chars`);
  }
  return errors.length === startErrorCount;
}

function validateDigestForDomain(
  value: unknown,
  path: string,
  errors: string[],
  expectedDomain: ContinuityDigestDomainV1,
): value is ContinuityDigestV1 {
  const startErrorCount = errors.length;
  validateDigest(value, path, errors);
  if (isObject(value) && value.domain !== expectedDomain) {
    errors.push(`${path}.domain: expected ${expectedDomain}`);
  }
  return errors.length === startErrorCount;
}

/** Validates a Portability-owned package digest: no Continuity domain field. */
function validatePackageDigest(
  value: unknown,
  path: string,
  errors: string[],
): value is ContinuityPackageDigestV1 {
  if (!isObject(value)) {
    errors.push(`${path}: expected package DigestRef`);
    return false;
  }
  const startErrorCount = errors.length;
  pushExactKeys(errors, path, value, ['algorithm', 'canonicalization', 'value']);
  if (value.algorithm !== 'sha-256') errors.push(`${path}.algorithm: unsupported`);
  if (value.canonicalization !== TRUST_LOOP_CANONICALIZATION) {
    errors.push(`${path}.canonicalization: unsupported`);
  }
  if (typeof value.value !== 'string' || !/^[0-9a-f]{64}$/.test(value.value)) {
    errors.push(`${path}.value: expected 64 lowercase hex chars`);
  }
  return errors.length === startErrorCount;
}

function samePackageDigest(
  left: ContinuityPackageDigestV1,
  right: ContinuityPackageDigestV1,
): boolean {
  return (
    left.algorithm === right.algorithm &&
    left.canonicalization === right.canonicalization &&
    left.value === right.value
  );
}

function isMockPortRef(value: unknown): boolean {
  return isObject(value) && typeof value.port === 'string' && value.port.startsWith('mock.');
}

function validateExternalRef(
  value: unknown,
  path: string,
  errors: string[],
): value is ContinuityExternalPortRefV1 {
  if (!isObject(value)) {
    errors.push(`${path}: expected external port ref`);
    return false;
  }
  pushExactKeys(errors, path, value, ['port', 'contractVersion', 'ref'], ['digest']);
  for (const key of ['port', 'contractVersion', 'ref'] as const) {
    if (!nonEmpty(value[key])) errors.push(`${path}.${key}: expected non-empty string`);
  }
  if (value.digest !== undefined) validateDigest(value.digest, `${path}.digest`, errors);
  return errors.length === 0;
}

function validateIdentity(
  value: unknown,
  path: string,
  errors: string[],
): value is ContinuityIdentitySnapshotV1 {
  if (!isObject(value)) {
    errors.push(`${path}: expected identity snapshot`);
    return false;
  }
  pushExactKeys(errors, path, value, [
    'agentId',
    'soulCoreId',
    'agentAccountId',
    'mappingVersion',
    'mappingHistoryRef',
  ]);
  for (const key of ['agentId', 'soulCoreId', 'agentAccountId'] as const) {
    if (!nonEmpty(value[key])) errors.push(`${path}.${key}: expected non-empty string`);
  }
  if (!decimal(value.mappingVersion)) errors.push(`${path}.mappingVersion: expected decimal string`);
  validateExternalRef(value.mappingHistoryRef, `${path}.mappingHistoryRef`, errors);
  return errors.length === 0;
}

function validateAuthorization(
  value: unknown,
  path: string,
  errors: string[],
): value is ContinuityAuthorizationSnapshotV1 {
  if (!isObject(value)) {
    errors.push(`${path}: expected authorization snapshot`);
    return false;
  }
  pushExactKeys(errors, path, value, [
    'ownerPrincipalRef',
    'ownershipEpoch',
    'authorizationReceiptRef',
    'evidenceLevel',
  ]);
  if (!nonEmpty(value.ownerPrincipalRef)) {
    errors.push(`${path}.ownerPrincipalRef: expected non-empty string`);
  }
  if (!decimal(value.ownershipEpoch)) errors.push(`${path}.ownershipEpoch: expected decimal string`);
  validateExternalRef(value.authorizationReceiptRef, `${path}.authorizationReceiptRef`, errors);
  if (!hasEnum(CONTINUITY_EVIDENCE_LEVELS_V1, value.evidenceLevel)) {
    errors.push(`${path}.evidenceLevel: unsupported`);
  }
  return errors.length === 0;
}

function validateOrderedUniqueExternalRefs(
  value: unknown,
  path: string,
  errors: string[],
): value is ContinuityExternalPortRefV1[] {
  if (!Array.isArray(value)) {
    errors.push(`${path}: expected array`);
    return false;
  }
  const keys: string[] = [];
  value.forEach((entry, index) => {
    const before = errors.length;
    if (validateExternalRef(entry, `${path}[${index}]`, errors) && errors.length === before) {
      keys.push(`${entry.port}\u0000${entry.ref}`);
    }
  });
  if (new Set(keys).size !== keys.length) errors.push(`${path}: duplicate refs`);
  const sorted = [...keys].sort();
  if (keys.some((entry, index) => entry !== sorted[index])) errors.push(`${path}: refs must be sorted`);
  return errors.length === 0;
}

function exactOrderedValues(value: unknown, expected: readonly string[]): boolean {
  return (
    Array.isArray(value) &&
    value.length === expected.length &&
    value.every((entry, index) => entry === expected[index])
  );
}

function unsigned<T extends Record<string, unknown>>(value: T, digestKey: string): Record<string, unknown> {
  const copy: Record<string, unknown> = { ...value };
  delete copy[digestKey];
  return copy;
}

export function computeContinuityDigestV1(
  domain: ContinuityDigestDomainV1,
  value: unknown,
): ContinuityDigestV1 {
  const digest = computeDigest({ domain, payload: value });
  return {
    algorithm: 'sha-256',
    canonicalization: TRUST_LOOP_CANONICALIZATION,
    domain,
    value: digest.value,
  };
}

export function verifyContinuityDigestV1(
  value: unknown,
  digest: ContinuityDigestV1,
): boolean {
  if (
    digest.algorithm !== 'sha-256' ||
    digest.canonicalization !== TRUST_LOOP_CANONICALIZATION ||
    !nonEmpty(digest.domain)
  ) {
    return false;
  }
  return verifyDigest({ domain: digest.domain, payload: value }, digest);
}

export function computeContinuityProfileDigestV1(
  profile: ContinuitySnapshotProfileUnsignedV1,
): ContinuityDigestV1 {
  return computeContinuityDigestV1(CONTINUITY_DIGEST_DOMAINS_V1.profile, profile);
}

export function computeContinuityEnvelopeDigestV1(
  envelope: EncryptedSnapshotEnvelopeV1,
): ContinuityDigestV1 {
  return computeContinuityDigestV1(CONTINUITY_DIGEST_DOMAINS_V1.envelope, envelope);
}

export function computeContinuityProofDigestV1(
  proof: ContinuityProofUnsignedV1,
): ContinuityDigestV1 {
  return computeContinuityDigestV1(CONTINUITY_DIGEST_DOMAINS_V1.proof, proof);
}

export function computeRestorePlanDigestV1(plan: RestorePlanUnsignedV1): ContinuityDigestV1 {
  return computeContinuityDigestV1(CONTINUITY_DIGEST_DOMAINS_V1.plan, plan);
}

export function computeRestoreReceiptDigestV1(
  receipt: RestoreReceiptUnsignedV1,
): ContinuityDigestV1 {
  return computeContinuityDigestV1(CONTINUITY_DIGEST_DOMAINS_V1.receipt, receipt);
}

export function validateContinuitySnapshotProfileV1(
  input: unknown,
): ContinuityContractValidationResultV1 {
  const errors: string[] = [];
  if (!isObject(input)) return { valid: false, errors: ['profile: expected object'] };
  pushExactKeys(errors, 'profile', input, PROFILE_KEYS);
  if (input.schemaVersion !== SOUL_CORE_CONTINUITY_SCHEMA_VERSION) {
    errors.push('profile.schemaVersion: unsupported');
  }
  if (input.profileVersion !== SOUL_CORE_CONTINUITY_CONTRACT_VERSION) {
    errors.push('profile.profileVersion: unsupported');
  }
  for (const key of [
    'profileId',
    'snapshotId',
    'tenantId',
    'intendedAudience',
    'sourceRuntimeRef',
    'packageRef',
  ] as const) {
    if (!nonEmpty(input[key])) errors.push(`profile.${key}: expected non-empty string`);
  }
  if (!decimal(input.sequence)) errors.push('profile.sequence: expected decimal string');
  if (input.baseSnapshotDigest !== null) {
    validateDigestForDomain(
      input.baseSnapshotDigest,
      'profile.baseSnapshotDigest',
      errors,
      CONTINUITY_DIGEST_DOMAINS_V1.profile,
    );
  }
  validateIdentity(input.identity, 'profile.identity', errors);
  validateAuthorization(input.authorization, 'profile.authorization', errors);
  if (!hasEnum(CONTINUITY_ENVIRONMENTS_V1, input.sourceEnvironment)) {
    errors.push('profile.sourceEnvironment: unsupported');
  }
  validatePackageDigest(input.packageDigest, 'profile.packageDigest', errors);
  validateOrderedUniqueExternalRefs(
    input.contentCheckpointRefs,
    'profile.contentCheckpointRefs',
    errors,
  );
  const profileMockRefs = [
    isObject(input.identity) ? input.identity.mappingHistoryRef : undefined,
    isObject(input.authorization) ? input.authorization.authorizationReceiptRef : undefined,
    ...(Array.isArray(input.contentCheckpointRefs) ? input.contentCheckpointRefs : []),
  ];
  if (
    profileMockRefs.some(isMockPortRef) &&
    (!isObject(input.authorization) ||
      input.authorization.evidenceLevel !== 'self_attested_fixture')
  ) {
    errors.push('profile.authorization.evidenceLevel: mock refs require self_attested_fixture');
  }
  if (
    profileMockRefs.some(isMockPortRef) &&
    input.sourceEnvironment !== 'local' &&
    input.sourceEnvironment !== 'test'
  ) {
    errors.push('profile.sourceEnvironment: mock refs forbidden outside local/test');
  }
  if (!isObject(input.historyEvidencePolicy)) {
    errors.push('profile.historyEvidencePolicy: expected object');
  } else {
    pushExactKeys(errors, 'profile.historyEvidencePolicy', input.historyEvidencePolicy, [
      'preserveClassifications',
      'importedEvidenceUpgradeAllowed',
    ]);
    if (
      !exactOrderedValues(
        input.historyEvidencePolicy.preserveClassifications,
        CONTINUITY_HISTORY_CLASSIFICATIONS_V1,
      )
    ) {
      errors.push('profile.historyEvidencePolicy.preserveClassifications: exact ordered set required');
    }
    if (input.historyEvidencePolicy.importedEvidenceUpgradeAllowed !== false) {
      errors.push('profile.historyEvidencePolicy.importedEvidenceUpgradeAllowed: must be false');
    }
  }
  if (!isObject(input.exclusions)) {
    errors.push('profile.exclusions: expected object');
  } else {
    pushExactKeys(errors, 'profile.exclusions', input.exclusions, [
      'credentialMaterialIncluded',
      'forbiddenClasses',
    ]);
    if (input.exclusions.credentialMaterialIncluded !== false) {
      errors.push('profile.exclusions.credentialMaterialIncluded: must be false');
    }
    if (
      !exactOrderedValues(
        input.exclusions.forbiddenClasses,
        CONTINUITY_FORBIDDEN_SECRET_CLASSES_V1,
      )
    ) {
      errors.push('profile.exclusions.forbiddenClasses: exact ordered set required');
    }
  }
  if (!timestamp(input.createdAt)) errors.push('profile.createdAt: invalid timestamp');
  if (!timestamp(input.expiresAt)) errors.push('profile.expiresAt: invalid timestamp');
  if (timestamp(input.createdAt) && timestamp(input.expiresAt) && input.expiresAt <= input.createdAt) {
    errors.push('profile.expiresAt: must be after createdAt');
  }
  const digestValid = validateDigestForDomain(
    input.profileDigest,
    'profile.profileDigest',
    errors,
    CONTINUITY_DIGEST_DOMAINS_V1.profile,
  );
  if (
    digestValid &&
    !verifyContinuityDigestV1(
      unsigned(input, 'profileDigest'),
      input.profileDigest as unknown as ContinuityDigestV1,
    )
  ) {
    errors.push('profile.profileDigest: mismatch');
  }
  return { valid: errors.length === 0, errors };
}

function decodedBase64Bytes(value: string): number {
  const padding = value.endsWith('==') ? 2 : value.endsWith('=') ? 1 : 0;
  return (value.length / 4) * 3 - padding;
}

export function validateEncryptedSnapshotEnvelopeV1(
  input: unknown,
  profile?: ContinuitySnapshotProfileV1,
): ContinuityContractValidationResultV1 {
  const errors: string[] = [];
  if (!isObject(input)) return { valid: false, errors: ['envelope: expected object'] };
  pushExactKeys(errors, 'envelope', input, ENVELOPE_KEYS);
  if (input.schemaVersion !== SOUL_CORE_CONTINUITY_SCHEMA_VERSION) {
    errors.push('envelope.schemaVersion: unsupported');
  }
  if (input.envelopeVersion !== SOUL_CORE_CONTINUITY_CONTRACT_VERSION) {
    errors.push('envelope.envelopeVersion: unsupported');
  }
  for (const key of ['envelopeId', 'snapshotId'] as const) {
    if (!nonEmpty(input[key])) errors.push(`envelope.${key}: expected non-empty string`);
  }
  validateDigestForDomain(
    input.profileDigest,
    'envelope.profileDigest',
    errors,
    CONTINUITY_DIGEST_DOMAINS_V1.profile,
  );
  validatePackageDigest(input.packageDigest, 'envelope.packageDigest', errors);
  if (input.cipherSuite !== 'aes-256-gcm') errors.push('envelope.cipherSuite: unsupported');
  if (
    input.keyWrapSuite !== 'aes-256-gcm-local-fixture' &&
    input.keyWrapSuite !== 'external-kms-or-recipient-v1'
  ) {
    errors.push('envelope.keyWrapSuite: unsupported');
  }
  if (!base64(input.nonceBase64) || decodedBase64Bytes(input.nonceBase64) !== 12) {
    errors.push('envelope.nonceBase64: expected 12-byte base64 nonce');
  }
  validateDigestForDomain(
    input.aadDigest,
    'envelope.aadDigest',
    errors,
    CONTINUITY_DIGEST_DOMAINS_V1.aad,
  );
  if (!base64(input.ciphertextBase64)) errors.push('envelope.ciphertextBase64: invalid base64');
  const ciphertextDigestValid = validateDigestForDomain(
    input.ciphertextDigest,
    'envelope.ciphertextDigest',
    errors,
    CONTINUITY_DIGEST_DOMAINS_V1.ciphertext,
  );
  if (ciphertextDigestValid && base64(input.ciphertextBase64)) {
    const expectedCiphertextDigest = computeContinuityDigestV1(
      CONTINUITY_DIGEST_DOMAINS_V1.ciphertext,
      input.ciphertextBase64,
    );
    if (
      !sameDigest(
        input.ciphertextDigest as unknown as ContinuityDigestV1,
        expectedCiphertextDigest,
      )
    ) {
      errors.push('envelope.ciphertextDigest: ciphertext mismatch');
    }
  }
  if (!base64(input.authTagBase64) || decodedBase64Bytes(input.authTagBase64) !== 16) {
    errors.push('envelope.authTagBase64: expected 16-byte base64 tag');
  }
  if (!Array.isArray(input.wrappedDataKeys) || input.wrappedDataKeys.length === 0) {
    errors.push('envelope.wrappedDataKeys: expected non-empty array');
  } else {
    const recipients: string[] = [];
    input.wrappedDataKeys.forEach((entry, index) => {
      const path = `envelope.wrappedDataKeys[${index}]`;
      if (!isObject(entry)) {
        errors.push(`${path}: expected object`);
        return;
      }
      pushExactKeys(errors, path, entry, [
        'recipientKeyId',
        'wrapSuite',
        'wrappedKeyBase64',
      ]);
      if (!nonEmpty(entry.recipientKeyId)) errors.push(`${path}.recipientKeyId: required`);
      if (!nonEmpty(entry.wrapSuite)) {
        errors.push(`${path}.wrapSuite: required`);
      } else if (entry.wrapSuite !== input.keyWrapSuite) {
        errors.push(`${path}.wrapSuite: must match envelope keyWrapSuite`);
      }
      if (!base64(entry.wrappedKeyBase64)) errors.push(`${path}.wrappedKeyBase64: invalid`);
      if (nonEmpty(entry.recipientKeyId)) recipients.push(entry.recipientKeyId);
    });
    if (new Set(recipients).size !== recipients.length) {
      errors.push('envelope.wrappedDataKeys: duplicate recipients');
    }
    const sorted = [...recipients].sort();
    if (recipients.some((recipient, index) => recipient !== sorted[index])) {
      errors.push('envelope.wrappedDataKeys: recipients must be sorted');
    }
  }
  if (!Number.isSafeInteger(input.plaintextBytes) || (input.plaintextBytes as number) < 1) {
    errors.push('envelope.plaintextBytes: expected positive safe integer');
  }
  if (!timestamp(input.createdAt)) errors.push('envelope.createdAt: invalid timestamp');
  if (profile) {
    if (input.snapshotId !== profile.snapshotId) errors.push('envelope.snapshotId: profile mismatch');
    if (isObject(input.profileDigest) && !sameDigest(input.profileDigest as unknown as ContinuityDigestV1, profile.profileDigest)) {
      errors.push('envelope.profileDigest: profile mismatch');
    }
    if (
      isObject(input.packageDigest) &&
      !samePackageDigest(
        input.packageDigest as unknown as ContinuityPackageDigestV1,
        profile.packageDigest,
      )
    ) {
      errors.push('envelope.packageDigest: profile mismatch');
    }
    if (
      input.keyWrapSuite === 'aes-256-gcm-local-fixture' &&
      profile.sourceEnvironment !== 'local' &&
      profile.sourceEnvironment !== 'test'
    ) {
      errors.push('envelope.keyWrapSuite: fixture suite forbidden outside local/test');
    }
  }
  return { valid: errors.length === 0, errors };
}

export function validateContinuityProofV1(
  input: unknown,
  profile?: ContinuitySnapshotProfileV1,
  envelope?: EncryptedSnapshotEnvelopeV1,
): ContinuityContractValidationResultV1 {
  const errors: string[] = [];
  if (!isObject(input)) return { valid: false, errors: ['proof: expected object'] };
  pushExactKeys(errors, 'proof', input, PROOF_KEYS);
  if (input.schemaVersion !== SOUL_CORE_CONTINUITY_SCHEMA_VERSION) {
    errors.push('proof.schemaVersion: unsupported');
  }
  if (input.proofVersion !== SOUL_CORE_CONTINUITY_CONTRACT_VERSION) {
    errors.push('proof.proofVersion: unsupported');
  }
  for (const key of [
    'proofId',
    'operationId',
    'challengeId',
    'challengeNonce',
    'tenantId',
    'intendedAudience',
    'sourceRuntimeRef',
    'targetRuntimeRef',
  ] as const) {
    if (!nonEmpty(input[key])) errors.push(`proof.${key}: expected non-empty string`);
  }
  if (input.proofDomain !== CONTINUITY_DIGEST_DOMAINS_V1.proof) {
    errors.push('proof.proofDomain: unsupported');
  }
  if (!Number.isSafeInteger(input.attempt) || (input.attempt as number) < 1) {
    errors.push('proof.attempt: expected positive safe integer');
  }
  if (input.challengePurpose !== 'restore_same_agent') {
    errors.push('proof.challengePurpose: unsupported');
  }
  if (!timestamp(input.challengeExpiresAt)) errors.push('proof.challengeExpiresAt: invalid');
  validateDigestForDomain(
    input.profileDigest,
    'proof.profileDigest',
    errors,
    CONTINUITY_DIGEST_DOMAINS_V1.profile,
  );
  validateDigestForDomain(
    input.envelopeDigest,
    'proof.envelopeDigest',
    errors,
    CONTINUITY_DIGEST_DOMAINS_V1.envelope,
  );
  validatePackageDigest(input.packageDigest, 'proof.packageDigest', errors);
  validateDigestForDomain(
    input.expectedSnapshotHeadDigest,
    'proof.expectedSnapshotHeadDigest',
    errors,
    CONTINUITY_DIGEST_DOMAINS_V1.profile,
  );
  validateIdentity(input.identity, 'proof.identity', errors);
  validateExternalRef(
    input.ownerAuthorizationReceiptRef,
    'proof.ownerAuthorizationReceiptRef',
    errors,
  );
  if (!hasEnum(CONTINUITY_ENVIRONMENTS_V1, input.sourceEnvironment)) {
    errors.push('proof.sourceEnvironment: unsupported');
  }
  if (!hasEnum(CONTINUITY_ENVIRONMENTS_V1, input.targetEnvironment)) {
    errors.push('proof.targetEnvironment: unsupported');
  }
  if (!hasEnum(CONTINUITY_EVIDENCE_LEVELS_V1, input.evidenceLevel)) {
    errors.push('proof.evidenceLevel: unsupported');
  }
  if (input.sourceRuntimeRef === input.targetRuntimeRef) {
    errors.push('proof.targetRuntimeRef: must differ from sourceRuntimeRef');
  }
  if (!timestamp(input.generatedAt)) errors.push('proof.generatedAt: invalid');
  if (!timestamp(input.expiresAt)) errors.push('proof.expiresAt: invalid');
  if (
    timestamp(input.generatedAt) &&
    timestamp(input.expiresAt) &&
    input.expiresAt <= input.generatedAt
  ) {
    errors.push('proof.expiresAt: must be after generatedAt');
  }
  const digestValid = validateDigestForDomain(
    input.proofDigest,
    'proof.proofDigest',
    errors,
    CONTINUITY_DIGEST_DOMAINS_V1.proof,
  );
  if (
    digestValid &&
    !verifyContinuityDigestV1(unsigned(input, 'proofDigest'), input.proofDigest as unknown as ContinuityDigestV1)
  ) {
    errors.push('proof.proofDigest: mismatch');
  }
  if (profile) {
    if (input.evidenceLevel !== profile.authorization.evidenceLevel) {
      errors.push('proof.evidenceLevel: profile mismatch');
    }
    if (
      isMockPortRef(input.ownerAuthorizationReceiptRef) &&
      input.evidenceLevel !== 'self_attested_fixture'
    ) {
      errors.push('proof.evidenceLevel: mock refs require self_attested_fixture');
    }
    if (isObject(input.profileDigest) && !sameDigest(input.profileDigest as unknown as ContinuityDigestV1, profile.profileDigest)) {
      errors.push('proof.profileDigest: profile mismatch');
    }
    if (
      isObject(input.packageDigest) &&
      !samePackageDigest(
        input.packageDigest as unknown as ContinuityPackageDigestV1,
        profile.packageDigest,
      )
    ) {
      errors.push('proof.packageDigest: profile mismatch');
    }
    if (input.tenantId !== profile.tenantId) errors.push('proof.tenantId: profile mismatch');
    if (input.sourceEnvironment !== profile.sourceEnvironment) {
      errors.push('proof.sourceEnvironment: profile mismatch');
    }
    if (input.intendedAudience !== profile.intendedAudience) {
      errors.push('proof.intendedAudience: profile mismatch');
    }
    if (input.sourceRuntimeRef !== profile.sourceRuntimeRef) {
      errors.push('proof.sourceRuntimeRef: profile mismatch');
    }
  }
  if (envelope && isObject(input.envelopeDigest)) {
    const expected = computeContinuityEnvelopeDigestV1(envelope);
    if (!sameDigest(input.envelopeDigest as unknown as ContinuityDigestV1, expected)) {
      errors.push('proof.envelopeDigest: envelope mismatch');
    }
  }
  return { valid: errors.length === 0, errors };
}

function validatePlanStep(value: unknown, path: string, errors: string[]): value is RestorePlanStepV1 {
  if (!isObject(value)) {
    errors.push(`${path}: expected object`);
    return false;
  }
  pushExactKeys(errors, path, value, [
    'stepId',
    'order',
    'owner',
    'portContractVersion',
    'mandatory',
    'requestDigest',
    'expectedTargetVersion',
    'idempotencyKey',
    'retryClass',
    'compensationPortRef',
  ]);
  for (const key of ['stepId', 'portContractVersion', 'idempotencyKey'] as const) {
    if (!nonEmpty(value[key])) errors.push(`${path}.${key}: expected non-empty string`);
  }
  if (!Number.isSafeInteger(value.order) || (value.order as number) < 1) {
    errors.push(`${path}.order: expected positive safe integer`);
  }
  if (!hasEnum(RESTORE_STEP_OWNERS_V1, value.owner)) errors.push(`${path}.owner: unsupported`);
  if (typeof value.mandatory !== 'boolean') errors.push(`${path}.mandatory: expected boolean`);
  validateDigestForDomain(
    value.requestDigest,
    `${path}.requestDigest`,
    errors,
    CONTINUITY_DIGEST_DOMAINS_V1.request,
  );
  if (value.expectedTargetVersion !== null && !nonEmpty(value.expectedTargetVersion)) {
    errors.push(`${path}.expectedTargetVersion: expected null or non-empty string`);
  }
  if (!hasEnum(RESTORE_RETRY_CLASSES_V1, value.retryClass)) {
    errors.push(`${path}.retryClass: unsupported`);
  }
  if (value.compensationPortRef !== null) {
    validateExternalRef(value.compensationPortRef, `${path}.compensationPortRef`, errors);
  }
  return errors.length === 0;
}

export function validateRestorePlanV1(input: unknown): ContinuityContractValidationResultV1 {
  const errors: string[] = [];
  if (!isObject(input)) return { valid: false, errors: ['plan: expected object'] };
  pushExactKeys(errors, 'plan', input, PLAN_KEYS);
  if (input.schemaVersion !== SOUL_CORE_CONTINUITY_SCHEMA_VERSION) {
    errors.push('plan.schemaVersion: unsupported');
  }
  if (input.planVersion !== SOUL_CORE_CONTINUITY_CONTRACT_VERSION) {
    errors.push('plan.planVersion: unsupported');
  }
  for (const key of ['planId', 'operationId', 'packageRef', 'targetRuntimeRef'] as const) {
    if (!nonEmpty(input[key])) errors.push(`plan.${key}: expected non-empty string`);
  }
  if (!Number.isSafeInteger(input.attempt) || (input.attempt as number) < 1) {
    errors.push('plan.attempt: expected positive safe integer');
  }
  validateDigestForDomain(
    input.profileDigest,
    'plan.profileDigest',
    errors,
    CONTINUITY_DIGEST_DOMAINS_V1.profile,
  );
  validatePackageDigest(input.packageDigest, 'plan.packageDigest', errors);
  validateDigestForDomain(
    input.proofDigest,
    'plan.proofDigest',
    errors,
    CONTINUITY_DIGEST_DOMAINS_V1.proof,
  );
  if (!hasEnum(CONTINUITY_ENVIRONMENTS_V1, input.targetEnvironment)) {
    errors.push('plan.targetEnvironment: unsupported');
  }
  if (input.targetAgentDecision !== 'restore_existing_same_agent') {
    errors.push('plan.targetAgentDecision: unsupported');
  }
  if (!Array.isArray(input.steps) || input.steps.length === 0) {
    errors.push('plan.steps: expected non-empty array');
  } else {
    const ids = new Set<string>();
    const idempotency = new Set<string>();
    input.steps.forEach((step, index) => {
      validatePlanStep(step, `plan.steps[${index}]`, errors);
      if (isObject(step)) {
        if (nonEmpty(step.stepId)) {
          if (ids.has(step.stepId)) errors.push('plan.steps: duplicate stepId');
          ids.add(step.stepId);
        }
        if (nonEmpty(step.idempotencyKey)) {
          if (idempotency.has(step.idempotencyKey)) {
            errors.push('plan.steps: duplicate idempotencyKey');
          }
          idempotency.add(step.idempotencyKey);
        }
        if (step.order !== index + 1) errors.push('plan.steps: order must be contiguous');
      }
    });
  }
  if (!timestamp(input.createdAt)) errors.push('plan.createdAt: invalid');
  if (!timestamp(input.expiresAt)) errors.push('plan.expiresAt: invalid');
  if (timestamp(input.createdAt) && timestamp(input.expiresAt) && input.expiresAt <= input.createdAt) {
    errors.push('plan.expiresAt: must be after createdAt');
  }
  const digestValid = validateDigestForDomain(
    input.planDigest,
    'plan.planDigest',
    errors,
    CONTINUITY_DIGEST_DOMAINS_V1.plan,
  );
  if (
    digestValid &&
    !verifyContinuityDigestV1(unsigned(input, 'planDigest'), input.planDigest as unknown as ContinuityDigestV1)
  ) {
    errors.push('plan.planDigest: mismatch');
  }
  return { valid: errors.length === 0, errors };
}

function validateRuntimeReplacement(
  value: unknown,
  path: string,
  errors: string[],
): value is RuntimeReplacementHandoffV1 {
  if (!isObject(value)) {
    errors.push(`${path}: expected object`);
    return false;
  }
  pushExactKeys(errors, path, value, [
    'schemaVersion',
    'sourceRuntimeRef',
    'targetRuntimeRef',
    'reauthorization',
    'successorBinding',
    'predecessorRevoke',
    'oldIngressDenial',
  ]);
  if (value.schemaVersion !== SOUL_CORE_CONTINUITY_SCHEMA_VERSION) {
    errors.push(`${path}.schemaVersion: unsupported`);
  }
  if (!nonEmpty(value.sourceRuntimeRef)) errors.push(`${path}.sourceRuntimeRef: required`);
  if (!nonEmpty(value.targetRuntimeRef)) errors.push(`${path}.targetRuntimeRef: required`);
  if (value.sourceRuntimeRef === value.targetRuntimeRef) {
    errors.push(`${path}.targetRuntimeRef: must differ from source`);
  }
  if (!isObject(value.reauthorization)) {
    errors.push(`${path}.reauthorization: expected object`);
  } else {
    pushExactKeys(errors, `${path}.reauthorization`, value.reauthorization, [
      'status',
      'requestRef',
      'receiptRef',
    ]);
    if (!hasEnum(['pending', 'accepted', 'rejected', 'unknown', 'unavailable'] as const, value.reauthorization.status)) {
      errors.push(`${path}.reauthorization.status: unsupported`);
    }
    validateExternalRef(value.reauthorization.requestRef, `${path}.reauthorization.requestRef`, errors);
    if (value.reauthorization.receiptRef !== null) {
      validateExternalRef(value.reauthorization.receiptRef, `${path}.reauthorization.receiptRef`, errors);
    }
  }
  if (!isObject(value.successorBinding)) {
    errors.push(`${path}.successorBinding: expected object`);
  } else {
    pushExactKeys(errors, `${path}.successorBinding`, value.successorBinding, [
      'status',
      'predecessorBindingRef',
      'requestRef',
      'receiptRef',
    ]);
    if (!hasEnum(['pending', 'active', 'rejected', 'unknown', 'unavailable'] as const, value.successorBinding.status)) {
      errors.push(`${path}.successorBinding.status: unsupported`);
    }
    validateExternalRef(
      value.successorBinding.predecessorBindingRef,
      `${path}.successorBinding.predecessorBindingRef`,
      errors,
    );
    validateExternalRef(value.successorBinding.requestRef, `${path}.successorBinding.requestRef`, errors);
    if (value.successorBinding.receiptRef !== null) {
      validateExternalRef(value.successorBinding.receiptRef, `${path}.successorBinding.receiptRef`, errors);
    }
  }
  if (!isObject(value.predecessorRevoke)) {
    errors.push(`${path}.predecessorRevoke: expected object`);
  } else {
    pushExactKeys(errors, `${path}.predecessorRevoke`, value.predecessorRevoke, [
      'status',
      'applicableSetRef',
      'operationRef',
      'combinedReceiptRef',
    ]);
    if (!hasEnum(['pending', 'durable_revoked', 'partial', 'unknown', 'unavailable'] as const, value.predecessorRevoke.status)) {
      errors.push(`${path}.predecessorRevoke.status: unsupported`);
    }
    validateExternalRef(
      value.predecessorRevoke.applicableSetRef,
      `${path}.predecessorRevoke.applicableSetRef`,
      errors,
    );
    validateExternalRef(
      value.predecessorRevoke.operationRef,
      `${path}.predecessorRevoke.operationRef`,
      errors,
    );
    if (value.predecessorRevoke.combinedReceiptRef !== null) {
      validateExternalRef(
        value.predecessorRevoke.combinedReceiptRef,
        `${path}.predecessorRevoke.combinedReceiptRef`,
        errors,
      );
    }
  }
  if (!isObject(value.oldIngressDenial)) {
    errors.push(`${path}.oldIngressDenial: expected object`);
  } else {
    pushExactKeys(errors, `${path}.oldIngressDenial`, value.oldIngressDenial, [
      'status',
      'protectedRequestRef',
      'evidenceRef',
      'reasonCode',
      'observedEpochDigest',
    ]);
    if (!hasEnum(['pending', 'denied', 'unexpectedly_allowed', 'unknown', 'unavailable'] as const, value.oldIngressDenial.status)) {
      errors.push(`${path}.oldIngressDenial.status: unsupported`);
    }
    if (!nonEmpty(value.oldIngressDenial.protectedRequestRef)) {
      errors.push(`${path}.oldIngressDenial.protectedRequestRef: required`);
    }
    if (value.oldIngressDenial.evidenceRef !== null) {
      validateExternalRef(
        value.oldIngressDenial.evidenceRef,
        `${path}.oldIngressDenial.evidenceRef`,
        errors,
      );
    }
    if (value.oldIngressDenial.reasonCode !== null && !nonEmpty(value.oldIngressDenial.reasonCode)) {
      errors.push(`${path}.oldIngressDenial.reasonCode: expected null or non-empty string`);
    }
    if (value.oldIngressDenial.observedEpochDigest !== null) {
      validateDigest(
        value.oldIngressDenial.observedEpochDigest,
        `${path}.oldIngressDenial.observedEpochDigest`,
        errors,
      );
    }
  }
  return errors.length === 0;
}

function validateStringSet(value: unknown, path: string, errors: string[]): value is string[] {
  if (!Array.isArray(value) || !value.every(nonEmpty)) {
    errors.push(`${path}: expected non-empty string array`);
    return false;
  }
  if (new Set(value).size !== value.length) errors.push(`${path}: duplicate values`);
  const sorted = [...value].sort();
  if (value.some((entry, index) => entry !== sorted[index])) errors.push(`${path}: must be sorted`);
  return errors.length === 0;
}

export function validateRestoreReceiptV1(input: unknown): ContinuityContractValidationResultV1 {
  const errors: string[] = [];
  if (!isObject(input)) return { valid: false, errors: ['receipt: expected object'] };
  pushExactKeys(errors, 'receipt', input, RECEIPT_KEYS);
  if (input.schemaVersion !== SOUL_CORE_CONTINUITY_SCHEMA_VERSION) {
    errors.push('receipt.schemaVersion: unsupported');
  }
  if (input.receiptVersion !== SOUL_CORE_CONTINUITY_CONTRACT_VERSION) {
    errors.push('receipt.receiptVersion: unsupported');
  }
  for (const key of [
    'receiptId',
    'operationId',
    'idempotencyKey',
    'sourceRuntimeRef',
    'targetRuntimeRef',
  ] as const) {
    if (!nonEmpty(input[key])) errors.push(`receipt.${key}: expected non-empty string`);
  }
  if (!Number.isSafeInteger(input.attempt) || (input.attempt as number) < 1) {
    errors.push('receipt.attempt: expected positive safe integer');
  }
  validateDigestForDomain(
    input.requestDigest,
    'receipt.requestDigest',
    errors,
    CONTINUITY_DIGEST_DOMAINS_V1.request,
  );
  validateDigestForDomain(
    input.profileDigest,
    'receipt.profileDigest',
    errors,
    CONTINUITY_DIGEST_DOMAINS_V1.profile,
  );
  validateDigestForDomain(
    input.envelopeDigest,
    'receipt.envelopeDigest',
    errors,
    CONTINUITY_DIGEST_DOMAINS_V1.envelope,
  );
  validatePackageDigest(input.packageDigest, 'receipt.packageDigest', errors);
  validateDigestForDomain(
    input.proofDigest,
    'receipt.proofDigest',
    errors,
    CONTINUITY_DIGEST_DOMAINS_V1.proof,
  );
  validateDigestForDomain(
    input.planDigest,
    'receipt.planDigest',
    errors,
    CONTINUITY_DIGEST_DOMAINS_V1.plan,
  );
  if (!hasEnum(['verified_same_agent', 'rejected', 'unknown'] as const, input.identityVerdict)) {
    errors.push('receipt.identityVerdict: unsupported');
  }
  if (!hasEnum(CONTINUITY_REASON_CODES_V1, input.identityReasonCode)) {
    errors.push('receipt.identityReasonCode: unsupported');
  }
  if (!Array.isArray(input.stepReceipts) || input.stepReceipts.length === 0) {
    errors.push('receipt.stepReceipts: expected non-empty array');
  } else {
    const ids = new Set<string>();
    input.stepReceipts.forEach((entry, index) => {
      const path = `receipt.stepReceipts[${index}]`;
      if (!isObject(entry)) {
        errors.push(`${path}: expected object`);
        return;
      }
      pushExactKeys(errors, path, entry, [
        'stepId',
        'owner',
        'status',
        'externalReceiptRef',
        'reasonCode',
      ]);
      if (!nonEmpty(entry.stepId)) errors.push(`${path}.stepId: required`);
      if (nonEmpty(entry.stepId)) {
        if (ids.has(entry.stepId)) errors.push('receipt.stepReceipts: duplicate stepId');
        ids.add(entry.stepId);
      }
      if (!hasEnum(RESTORE_STEP_OWNERS_V1, entry.owner)) errors.push(`${path}.owner: unsupported`);
      if (!hasEnum(RESTORE_STEP_STATUSES_V1, entry.status)) errors.push(`${path}.status: unsupported`);
      if (entry.externalReceiptRef !== null) {
        validateExternalRef(entry.externalReceiptRef, `${path}.externalReceiptRef`, errors);
      } else if (entry.status === 'succeeded' && entry.owner !== 'continuity') {
        errors.push(`${path}.externalReceiptRef: succeeded external step requires receipt`);
      }
      if (!hasEnum(CONTINUITY_REASON_CODES_V1, entry.reasonCode)) {
        errors.push(`${path}.reasonCode: unsupported`);
      }
    });
  }
  validateStringSet(input.restoredSections, 'receipt.restoredSections', errors);
  if (Array.isArray(input.restoredSections) && Array.isArray(input.omittedSections)) {
    const restored = new Set(input.restoredSections.filter(nonEmpty));
    const conflicting = input.omittedSections.filter(
      (entry) => isObject(entry) && nonEmpty(entry.section) && restored.has(entry.section),
    );
    if (conflicting.length > 0) {
      errors.push('receipt.omittedSections: must be disjoint from restoredSections');
    }
  }
  if (!Array.isArray(input.omittedSections)) {
    errors.push('receipt.omittedSections: expected array');
  } else {
    const sections: string[] = [];
    input.omittedSections.forEach((entry, index) => {
      const path = `receipt.omittedSections[${index}]`;
      if (!isObject(entry)) {
        errors.push(`${path}: expected object`);
        return;
      }
      pushExactKeys(errors, path, entry, ['section', 'reasonCode']);
      if (!nonEmpty(entry.section)) errors.push(`${path}.section: required`);
      if (nonEmpty(entry.section)) sections.push(entry.section);
      if (!hasEnum(CONTINUITY_REASON_CODES_V1, entry.reasonCode)) {
        errors.push(`${path}.reasonCode: unsupported`);
      }
    });
    if (new Set(sections).size !== sections.length) errors.push('receipt.omittedSections: duplicates');
    const sorted = [...sections].sort();
    if (sections.some((entry, index) => entry !== sorted[index])) {
      errors.push('receipt.omittedSections: must be sorted');
    }
  }
  if (input.evidenceClassificationPreserved !== true) {
    errors.push('receipt.evidenceClassificationPreserved: must be true');
  }
  if (input.importedEvidenceUpgradeAllowed !== false) {
    errors.push('receipt.importedEvidenceUpgradeAllowed: must be false');
  }
  validateRuntimeReplacement(input.runtimeReplacement, 'receipt.runtimeReplacement', errors);
  if (!hasEnum(['partial', 'restored', 'failed', 'unknown', 'manual_resolution_required'] as const, input.restoreStatus)) {
    errors.push('receipt.restoreStatus: unsupported');
  }
  if (!hasEnum(['not_requested', 'pending', 'durable_revoked', 'denial_verified', 'complete', 'partial', 'unknown'] as const, input.exitStatus)) {
    errors.push('receipt.exitStatus: unsupported');
  }
  if (!timestamp(input.recordedAt)) errors.push('receipt.recordedAt: invalid');
  if (input.completedAt !== null && !timestamp(input.completedAt)) {
    errors.push('receipt.completedAt: expected null or timestamp');
  }
  if (input.sourceRuntimeRef === input.targetRuntimeRef) {
    errors.push('receipt.targetRuntimeRef: must differ from source');
  }
  if (input.exitStatus === 'complete') {
    const replacement = input.runtimeReplacement;
    if (!isObject(replacement)) {
      errors.push('receipt.exitStatus: complete requires runtimeReplacement');
    } else {
      const reauthorization = replacement.reauthorization;
      const binding = replacement.successorBinding;
      const revoke = replacement.predecessorRevoke;
      const denial = replacement.oldIngressDenial;
      if (
        !isObject(reauthorization) ||
        reauthorization.status !== 'accepted' ||
        reauthorization.receiptRef === null
      ) {
        errors.push('receipt.exitStatus: complete requires accepted reauthorization receipt');
      }
      if (!isObject(binding) || binding.status !== 'active' || binding.receiptRef === null) {
        errors.push('receipt.exitStatus: complete requires active successor binding receipt');
      }
      if (!isObject(revoke) || revoke.status !== 'durable_revoked' || revoke.combinedReceiptRef === null) {
        errors.push('receipt.exitStatus: complete requires durable combined revoke receipt');
      }
      if (
        !isObject(denial) ||
        denial.status !== 'denied' ||
        denial.evidenceRef === null ||
        denial.observedEpochDigest === null
      ) {
        errors.push('receipt.exitStatus: complete requires old-ingress denial evidence');
      }
      if (input.identityVerdict !== 'verified_same_agent' || input.restoreStatus !== 'restored') {
        errors.push('receipt.exitStatus: complete requires verified identity and restored status');
      }
    }
  }
  const digestValid = validateDigestForDomain(
    input.receiptDigest,
    'receipt.receiptDigest',
    errors,
    CONTINUITY_DIGEST_DOMAINS_V1.receipt,
  );
  if (
    digestValid &&
    !verifyContinuityDigestV1(
      unsigned(input, 'receiptDigest'),
      input.receiptDigest as unknown as ContinuityDigestV1,
    )
  ) {
    errors.push('receipt.receiptDigest: mismatch');
  }
  return { valid: errors.length === 0, errors };
}

export function decodeContinuitySnapshotProfileV1(input: unknown): ContinuitySnapshotProfileV1 {
  const validation = validateContinuitySnapshotProfileV1(input);
  if (!validation.valid) throw new ContinuityContractValidationError(validation.errors);
  return input as ContinuitySnapshotProfileV1;
}

export function decodeEncryptedSnapshotEnvelopeV1(
  input: unknown,
  profile?: ContinuitySnapshotProfileV1,
): EncryptedSnapshotEnvelopeV1 {
  const validation = validateEncryptedSnapshotEnvelopeV1(input, profile);
  if (!validation.valid) throw new ContinuityContractValidationError(validation.errors);
  return input as EncryptedSnapshotEnvelopeV1;
}

export function decodeContinuityProofV1(
  input: unknown,
  profile?: ContinuitySnapshotProfileV1,
  envelope?: EncryptedSnapshotEnvelopeV1,
): ContinuityProofV1 {
  const validation = validateContinuityProofV1(input, profile, envelope);
  if (!validation.valid) throw new ContinuityContractValidationError(validation.errors);
  return input as ContinuityProofV1;
}

export function decodeRestorePlanV1(input: unknown): RestorePlanV1 {
  const validation = validateRestorePlanV1(input);
  if (!validation.valid) throw new ContinuityContractValidationError(validation.errors);
  return input as RestorePlanV1;
}

export function decodeRestoreReceiptV1(input: unknown): RestoreReceiptV1 {
  const validation = validateRestoreReceiptV1(input);
  if (!validation.valid) throw new ContinuityContractValidationError(validation.errors);
  return input as RestoreReceiptV1;
}

/**
 * Portability owns archive scanning. Continuity only consumes the resulting
 * findings and must never soften them: a finding that Portability marked as
 * reject, or an internally inconsistent finding, fails the snapshot closed.
 */
export interface ContinuityScanFindingInputV1 {
  findingId: string;
  kind: string;
  severity: 'info' | 'warning' | 'high' | 'critical';
  action: 'allow' | 'review' | 'redact' | 'quarantine' | 'reject';
  location: string;
}

export interface ContinuityScanDispositionV1 {
  disposition: 'proceed' | 'omit' | 'manual_resolution' | 'fail_closed';
  reasonCode: ContinuityReasonCodeV1;
  omittedSections: Array<{ section: string; reasonCode: ContinuityReasonCodeV1 }>;
  blockingFindingIds: string[];
}

/**
 * Precedence is `reject` > inconsistent > `review` > `quarantine` > `redact` >
 * `allow`. A `critical` severity paired with `allow` is treated as an
 * inconsistent finding rather than permission to proceed.
 */
export function evaluateContinuityScanFindingsV1(
  findings: readonly ContinuityScanFindingInputV1[],
): ContinuityScanDispositionV1 {
  const sortedFindings = [...findings].sort((left, right) =>
    left.findingId < right.findingId ? -1 : left.findingId > right.findingId ? 1 : 0,
  );

  const rejected = sortedFindings.filter((finding) => finding.action === 'reject');
  if (rejected.length > 0) {
    return {
      disposition: 'fail_closed',
      reasonCode: 'unsafe_source_content_detected',
      omittedSections: [],
      blockingFindingIds: rejected.map((finding) => finding.findingId),
    };
  }

  const inconsistent = sortedFindings.filter(
    (finding) => finding.severity === 'critical' && finding.action === 'allow',
  );
  if (inconsistent.length > 0) {
    return {
      disposition: 'fail_closed',
      reasonCode: 'inconsistent_scan_finding',
      omittedSections: [],
      blockingFindingIds: inconsistent.map((finding) => finding.findingId),
    };
  }

  const review = sortedFindings.filter((finding) => finding.action === 'review');
  if (review.length > 0) {
    return {
      disposition: 'manual_resolution',
      reasonCode: 'manual_resolution_required',
      omittedSections: [],
      blockingFindingIds: review.map((finding) => finding.findingId),
    };
  }

  const omitted = new Map<string, ContinuityReasonCodeV1>();
  for (const finding of sortedFindings) {
    if (finding.action === 'quarantine') {
      omitted.set(finding.location, 'unsafe_source_content_detected');
    } else if (finding.action === 'redact' && !omitted.has(finding.location)) {
      omitted.set(finding.location, 'credential_material_detected');
    }
  }

  if (omitted.size === 0) {
    return {
      disposition: 'proceed',
      reasonCode: 'continuity_ok',
      omittedSections: [],
      blockingFindingIds: [],
    };
  }

  return {
    disposition: 'omit',
    reasonCode: 'continuity_ok',
    omittedSections: [...omitted.entries()]
      .map(([section, reasonCode]) => ({ section, reasonCode }))
      .sort((left, right) => (left.section < right.section ? -1 : 1)),
    blockingFindingIds: [],
  };
}

export interface ContinuityRestoreChainV1 {
  profile: ContinuitySnapshotProfileV1;
  envelope: EncryptedSnapshotEnvelopeV1;
  proof: ContinuityProofV1;
  plan: RestorePlanV1;
  receipt: RestoreReceiptV1;
}

export interface ContinuityRestoreStateDerivationV1 {
  restoreStatus: RestoreReceiptV1['restoreStatus'];
  exitStatus: RestoreReceiptV1['exitStatus'];
  reasonCode: ContinuityReasonCodeV1;
}

/**
 * Single source of truth for restore/exit status. Callers must never assemble
 * these states from ad-hoc checks, otherwise a missing mandatory step or a
 * pending handoff can be reported as a completed exit.
 */
export function deriveContinuityRestoreStateV1(
  plan: RestorePlanV1,
  receipt: RestoreReceiptV1,
): ContinuityRestoreStateDerivationV1 {
  const receiptsByStepId = new Map(receipt.stepReceipts.map((entry) => [entry.stepId, entry]));
  const ownersInPlan = new Set(plan.steps.map((step) => step.owner));
  const missingRequiredOwner = CONTINUITY_REQUIRED_RESTORE_STEP_OWNERS_V1.some(
    (owner) => !ownersInPlan.has(owner),
  );
  if (missingRequiredOwner) {
    return { restoreStatus: 'partial', exitStatus: 'partial', reasonCode: 'restore_partial' };
  }
  const mandatorySteps = plan.steps.filter(
    (step) =>
      step.mandatory ||
      (CONTINUITY_REQUIRED_RESTORE_STEP_OWNERS_V1 as readonly RestoreStepOwnerV1[]).includes(
        step.owner,
      ),
  );

  let restoreStatus: RestoreReceiptV1['restoreStatus'] = 'restored';
  let restoreReason: ContinuityReasonCodeV1 = 'continuity_ok';

  for (const step of mandatorySteps) {
    const stepReceipt = receiptsByStepId.get(step.stepId);
    if (!stepReceipt || stepReceipt.owner !== step.owner) {
      return {
        restoreStatus: 'partial',
        exitStatus: 'partial',
        reasonCode: 'restore_partial',
      };
    }
    if (stepReceipt.status === 'unknown') {
      restoreStatus = 'unknown';
      restoreReason = 'restore_unknown_outcome';
      break;
    }
    if (stepReceipt.status !== 'succeeded') {
      restoreStatus = 'partial';
      restoreReason = 'restore_partial';
    }
  }

  const replacement = receipt.runtimeReplacement;
  const reauthorizationComplete =
    replacement.reauthorization.status === 'accepted' &&
    replacement.reauthorization.receiptRef !== null;
  const bindingComplete =
    replacement.successorBinding.status === 'active' &&
    replacement.successorBinding.receiptRef !== null;
  const revokeComplete =
    replacement.predecessorRevoke.status === 'durable_revoked' &&
    replacement.predecessorRevoke.combinedReceiptRef !== null;
  const denialComplete =
    replacement.oldIngressDenial.status === 'denied' &&
    replacement.oldIngressDenial.evidenceRef !== null &&
    replacement.oldIngressDenial.observedEpochDigest !== null;

  if (replacement.oldIngressDenial.status === 'unexpectedly_allowed') {
    return {
      restoreStatus,
      exitStatus: 'partial',
      reasonCode: 'old_ingress_unexpectedly_allowed',
    };
  }
  if (replacement.oldIngressDenial.status === 'unknown') {
    return { restoreStatus, exitStatus: 'unknown', reasonCode: 'old_runtime_race_unknown' };
  }
  if (replacement.predecessorRevoke.status === 'unknown') {
    return { restoreStatus, exitStatus: 'unknown', reasonCode: 'revoke_unknown' };
  }
  if (
    replacement.reauthorization.status === 'unknown' ||
    replacement.successorBinding.status === 'unknown'
  ) {
    return { restoreStatus, exitStatus: 'unknown', reasonCode: 'restore_unknown_outcome' };
  }
  if (replacement.reauthorization.status === 'rejected') {
    return { restoreStatus, exitStatus: 'pending', reasonCode: 'reauthorization_rejected' };
  }
  if (!reauthorizationComplete) {
    return { restoreStatus, exitStatus: 'pending', reasonCode: 'reauthorization_required' };
  }
  if (replacement.successorBinding.status === 'rejected') {
    return { restoreStatus, exitStatus: 'pending', reasonCode: 'successor_binding_failed' };
  }
  if (!bindingComplete) {
    return { restoreStatus, exitStatus: 'pending', reasonCode: 'successor_binding_required' };
  }
  if (replacement.predecessorRevoke.status === 'partial') {
    return { restoreStatus, exitStatus: 'partial', reasonCode: 'revoke_partial' };
  }
  if (!revokeComplete) {
    return { restoreStatus, exitStatus: 'pending', reasonCode: 'revoke_partial' };
  }
  if (!denialComplete) {
    return { restoreStatus, exitStatus: 'durable_revoked', reasonCode: 'continuity_ok' };
  }
  if (restoreStatus !== 'restored') {
    return { restoreStatus, exitStatus: 'denial_verified', reasonCode: restoreReason };
  }
  if (receipt.identityVerdict !== 'verified_same_agent') {
    return {
      restoreStatus,
      exitStatus: 'denial_verified',
      reasonCode: 'false_same_agent_claim',
    };
  }
  return { restoreStatus: 'restored', exitStatus: 'complete', reasonCode: 'continuity_ok' };
}

/**
 * Binds profile → envelope → proof → plan → receipt. Each artifact validating
 * its own self-digest is not sufficient evidence: a re-digested plan or receipt
 * must not be accepted against a different snapshot, proof or runtime.
 */
export function validateContinuityRestoreChainV1(
  chain: ContinuityRestoreChainV1,
): ContinuityContractValidationResultV1 {
  const errors: string[] = [];
  const { profile, envelope, proof, plan, receipt } = chain;

  const profileResult = validateContinuitySnapshotProfileV1(profile);
  errors.push(...profileResult.errors);
  const envelopeResult = validateEncryptedSnapshotEnvelopeV1(envelope, profile);
  errors.push(...envelopeResult.errors);
  const proofResult = validateContinuityProofV1(proof, profile, envelope);
  errors.push(...proofResult.errors);
  const planResult = validateRestorePlanV1(plan);
  errors.push(...planResult.errors);
  const receiptResult = validateRestoreReceiptV1(receipt);
  errors.push(...receiptResult.errors);
  if (errors.length > 0) return { valid: false, errors };

  const envelopeDigest = computeContinuityEnvelopeDigestV1(envelope);

  if (!sameDigest(plan.profileDigest, profile.profileDigest)) {
    errors.push('chain.plan.profileDigest: profile mismatch');
  }
  if (!samePackageDigest(plan.packageDigest, profile.packageDigest)) {
    errors.push('chain.plan.packageDigest: profile mismatch');
  }
  if (plan.packageRef !== profile.packageRef) {
    errors.push('chain.plan.packageRef: profile mismatch');
  }
  if (!sameDigest(plan.proofDigest, proof.proofDigest)) {
    errors.push('chain.plan.proofDigest: proof mismatch');
  }
  if (plan.operationId !== proof.operationId) {
    errors.push('chain.plan.operationId: proof mismatch');
  }
  if (plan.attempt !== proof.attempt) {
    errors.push('chain.plan.attempt: proof mismatch');
  }
  if (plan.targetRuntimeRef !== proof.targetRuntimeRef) {
    errors.push('chain.plan.targetRuntimeRef: proof mismatch');
  }
  if (plan.targetEnvironment !== proof.targetEnvironment) {
    errors.push('chain.plan.targetEnvironment: proof mismatch');
  }

  if (!sameDigest(receipt.profileDigest, profile.profileDigest)) {
    errors.push('chain.receipt.profileDigest: profile mismatch');
  }
  if (!sameDigest(receipt.envelopeDigest, envelopeDigest)) {
    errors.push('chain.receipt.envelopeDigest: envelope mismatch');
  }
  if (!samePackageDigest(receipt.packageDigest, profile.packageDigest)) {
    errors.push('chain.receipt.packageDigest: profile mismatch');
  }
  if (!sameDigest(receipt.proofDigest, proof.proofDigest)) {
    errors.push('chain.receipt.proofDigest: proof mismatch');
  }
  if (!sameDigest(receipt.planDigest, plan.planDigest)) {
    errors.push('chain.receipt.planDigest: plan mismatch');
  }
  if (receipt.operationId !== proof.operationId) {
    errors.push('chain.receipt.operationId: proof mismatch');
  }
  if (receipt.attempt !== proof.attempt) {
    errors.push('chain.receipt.attempt: proof mismatch');
  }
  if (receipt.sourceRuntimeRef !== profile.sourceRuntimeRef) {
    errors.push('chain.receipt.sourceRuntimeRef: profile mismatch');
  }
  if (receipt.targetRuntimeRef !== proof.targetRuntimeRef) {
    errors.push('chain.receipt.targetRuntimeRef: proof mismatch');
  }
  if (receipt.runtimeReplacement.sourceRuntimeRef !== profile.sourceRuntimeRef) {
    errors.push('chain.receipt.runtimeReplacement.sourceRuntimeRef: profile mismatch');
  }
  if (receipt.runtimeReplacement.targetRuntimeRef !== proof.targetRuntimeRef) {
    errors.push('chain.receipt.runtimeReplacement.targetRuntimeRef: proof mismatch');
  }

  const ownersInPlan = new Set(plan.steps.map((step) => step.owner));
  CONTINUITY_REQUIRED_RESTORE_STEP_OWNERS_V1.forEach((owner) => {
    if (!ownersInPlan.has(owner)) {
      errors.push(`chain.plan.steps: missing required owner ${owner}`);
    }
  });
  plan.steps.forEach((step) => {
    if (
      !step.mandatory &&
      (CONTINUITY_REQUIRED_RESTORE_STEP_OWNERS_V1 as readonly RestoreStepOwnerV1[]).includes(
        step.owner,
      )
    ) {
      errors.push(`chain.plan.steps.${step.stepId}: required owner must be mandatory`);
    }
  });

  const planStepIds = plan.steps.map((step) => step.stepId).sort();
  const receiptStepIds = receipt.stepReceipts.map((entry) => entry.stepId).sort();
  if (
    planStepIds.length !== receiptStepIds.length ||
    planStepIds.some((stepId, index) => stepId !== receiptStepIds[index])
  ) {
    errors.push('chain.receipt.stepReceipts: must cover exactly every plan step');
  } else {
    const plansByStepId = new Map(plan.steps.map((step) => [step.stepId, step]));
    receipt.stepReceipts.forEach((entry) => {
      const step = plansByStepId.get(entry.stepId);
      if (step && step.owner !== entry.owner) {
        errors.push(`chain.receipt.stepReceipts.${entry.stepId}: owner mismatch`);
      }
    });
  }

  const derived = deriveContinuityRestoreStateV1(plan, receipt);
  if (receipt.restoreStatus !== derived.restoreStatus) {
    errors.push(
      `chain.receipt.restoreStatus: declared ${receipt.restoreStatus} but derived ${derived.restoreStatus}`,
    );
  }
  if (receipt.exitStatus !== derived.exitStatus) {
    errors.push(
      `chain.receipt.exitStatus: declared ${receipt.exitStatus} but derived ${derived.exitStatus}`,
    );
  }

  return { valid: errors.length === 0, errors };
}

/** Maps validation errors to the frozen reason set without leaking raw input. */
export function mapContinuityValidationErrorsToReasonV1(
  errors: readonly string[],
): ContinuityReasonCodeV1 {
  const has = (marker: string): boolean => errors.some((error) => error.includes(marker));
  if (has('schemaVersion: unsupported')) return 'unsupported_schema_version';
  if (has('profileVersion: unsupported')) return 'unsupported_profile_version';
  if (
    has('envelopeVersion: unsupported') ||
    has('proofVersion: unsupported') ||
    has('planVersion: unsupported') ||
    has('receiptVersion: unsupported')
  ) {
    return 'unsupported_contract_version';
  }
  if (
    has('cipherSuite: unsupported') ||
    has('keyWrapSuite: unsupported') ||
    has('wrapSuite: must match') ||
    has('algorithm: unsupported') ||
    has('canonicalization: unsupported')
  ) {
    return 'unsupported_algorithm';
  }
  if (
    has('ciphertextDigest: ciphertext mismatch') ||
    has('envelopeDigest: envelope mismatch') ||
    has('aadDigest') ||
    has('authTagBase64') ||
    has('nonceBase64')
  ) {
    return 'snapshot_tampered';
  }
  if (has('evidenceLevel')) return 'downgrade_detected';
  if (has('targetRuntimeRef') || has('sourceRuntimeRef')) return 'wrong_runtime';
  if (has('packageRef') || has('packageDigest')) return 'package_substituted';
  if (
    has('stepReceipts') ||
    has('restoreStatus') ||
    has('exitStatus') ||
    has('restoredSections') ||
    has('omittedSections') ||
    has('plan.steps')
  ) {
    return 'restore_partial';
  }
  return 'invalid_digest';
}

const SECRET_KEY_CLASS_BY_NORMALIZED_KEY: Readonly<Record<string, ContinuityForbiddenSecretClassV1>> = {
  oauthtoken: 'oauth_token',
  accesstoken: 'oauth_token',
  refreshtoken: 'oauth_token',
  idtoken: 'oauth_token',
  bearertoken: 'oauth_token',
  authorization: 'oauth_token',
  apikey: 'api_key',
  apitoken: 'api_key',
  apisecret: 'api_key',
  clientsecret: 'api_key',
  signingsecret: 'api_key',
  signingkey: 'api_key',
  cookie: 'cookie',
  cookies: 'cookie',
  setcookie: 'cookie',
  sessionid: 'cookie',
  sessioncookie: 'cookie',
  keyshare: 'mpc_share',
  walletprivatekey: 'wallet_private_key',
  walletkey: 'wallet_private_key',
  privatekey: 'wallet_private_key',
  seedphrase: 'wallet_private_key',
  mnemonic: 'wallet_private_key',
  mpcshare: 'mpc_share',
  mpcfragment: 'mpc_share',
  devicecredential: 'device_credential',
  devicekey: 'device_credential',
  devicesecret: 'device_credential',
  partnercredential: 'partner_credential',
  partnersigningsecret: 'partner_credential',
  partnersecret: 'partner_credential',
  runtimesession: 'runtime_session',
  runtimesessionsecret: 'runtime_session',
  runtimetoken: 'runtime_session',
  authoritygrantsecret: 'authority_grant_secret',
  grantsecret: 'authority_grant_secret',
  bindingsecret: 'binding_secret',
  bindingcredential: 'binding_secret',
};

const DIGEST_LIKE_KEYS = new Set([
  'value',
  'digest',
  'hash',
  'contenthash',
  'contentdigest',
  'profiledigest',
  'packagedigest',
  'proofdigest',
  'plandigest',
  'receiptdigest',
  'requestdigest',
  'aaddigest',
  'ciphertextdigest',
  'envelopedigest',
]);

function normalizeSecretKey(key: string): string {
  return key.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function classifySecretValue(
  value: string,
  normalizedKey?: string,
): ContinuityForbiddenSecretClassV1 | null {
  if (/^ey[A-Za-z0-9_-]{6,}\.[A-Za-z0-9_-]{6,}\.[A-Za-z0-9_-]{6,}$/.test(value)) {
    return 'oauth_token';
  }
  if (/^(?:ghp|gho|ghu|ghs)_[A-Za-z0-9]{20,}$/.test(value)) return 'api_key';
  if (/^github_pat_[A-Za-z0-9_]{20,}$/.test(value)) return 'api_key';
  if (/^xox[abposr]-[A-Za-z0-9-]{10,}$/.test(value)) return 'api_key';
  if (/^AKIA[0-9A-Z]{16}$/.test(value)) return 'api_key';
  if (
    /^[0-9a-f]{64}$/i.test(value) &&
    (normalizedKey === undefined || !DIGEST_LIKE_KEYS.has(normalizedKey))
  ) {
    return 'wallet_private_key';
  }
  if (/-----BEGIN (?:EC |RSA |OPENSSH )?PRIVATE KEY-----/.test(value)) {
    return 'wallet_private_key';
  }
  if (/^0x[0-9a-f]{64}$/i.test(value)) return 'wallet_private_key';
  if (/\bBearer\s+[A-Za-z0-9._~+/=-]{12,}/i.test(value)) return 'oauth_token';
  if (/\bsk-[A-Za-z0-9_-]{16,}\b/.test(value)) return 'api_key';
  if (/\b(?:sessionid|connect\.sid|cookie)=[^;\s]{8,}/i.test(value)) return 'cookie';
  if (/^mpc_(?:share|fragment)_[A-Za-z0-9+/=_-]{12,}$/i.test(value)) return 'mpc_share';
  if (/^device_(?:credential|secret)_[A-Za-z0-9+/=_-]{12,}$/i.test(value)) {
    return 'device_credential';
  }
  if (/^partner_(?:credential|secret)_[A-Za-z0-9+/=_-]{12,}$/i.test(value)) {
    return 'partner_credential';
  }
  if (/^runtime_(?:session|token)_[A-Za-z0-9+/=_-]{12,}$/i.test(value)) {
    return 'runtime_session';
  }
  if (/^(?:authority_)?grant_secret_[A-Za-z0-9+/=_-]{12,}$/i.test(value)) {
    return 'authority_grant_secret';
  }
  if (/^binding_(?:secret|credential)_[A-Za-z0-9+/=_-]{12,}$/i.test(value)) {
    return 'binding_secret';
  }
  return null;
}

/**
 * Recursively finds forbidden credential material without returning or logging
 * the secret value. Cycles fail closed as already-visited references.
 */
export function findContinuityForbiddenSecretsV1(input: unknown): ContinuitySecretFindingV1[] {
  const findings: ContinuitySecretFindingV1[] = [];
  const visited = new WeakSet<object>();

  const visit = (value: unknown, path: string, currentNormalizedKey?: string): void => {
    if (typeof value === 'string') {
      const secretClass = classifySecretValue(value, currentNormalizedKey);
      if (secretClass) findings.push({ path, secretClass, source: 'value_pattern' });
      return;
    }
    if (typeof value !== 'object' || value === null) return;
    if (visited.has(value)) return;
    visited.add(value);
    if (Array.isArray(value)) {
      value.forEach((entry, index) => visit(entry, `${path}[${index}]`, currentNormalizedKey));
      return;
    }
    Object.entries(value as Record<string, unknown>).forEach(([key, entry]) => {
      const entryPath = `${path}.[field]`;
      const normalizedKey = normalizeSecretKey(key);
      const secretClass =
        SECRET_KEY_CLASS_BY_NORMALIZED_KEY[normalizedKey] ?? classifySecretValue(key);
      if (secretClass) findings.push({ path: entryPath, secretClass, source: 'key' });
      visit(entry, entryPath, normalizedKey);
    });
  };

  visit(input, '$');
  return findings;
}

export function evaluateContinuityLocalFixtureGateV1(
  input: ContinuityLocalFixtureGateInputV1,
): ContinuityLocalFixtureGateResultV1 {
  if (input.flagValue !== '1') {
    return { enabled: false, capability: 'disabled', reasonCode: 'feature_disabled' };
  }
  if (input.environment !== 'local' && input.environment !== 'test') {
    return { enabled: false, capability: 'disabled', reasonCode: 'wrong_environment' };
  }
  if (input.evidenceLevel !== 'self_attested_fixture') {
    return { enabled: false, capability: 'disabled', reasonCode: 'downgrade_detected' };
  }
  return { enabled: true, capability: 'local_fixture', reasonCode: 'continuity_ok' };
}

export function verifyContinuitySameAgentV1(
  profile: ContinuitySnapshotProfileV1,
  proof: ContinuityProofV1,
  expected: ContinuitySameAgentExpectedContextV1,
): ContinuitySameAgentVerdictV1 {
  const profileValidation = validateContinuitySnapshotProfileV1(profile);
  if (!profileValidation.valid) return { verified: false, reasonCode: 'invalid_digest' };
  const proofValidation = validateContinuityProofV1(proof, profile);
  if (!proofValidation.valid) return { verified: false, reasonCode: 'invalid_digest' };

  if (profile.identity.agentId !== expected.identity.agentId) {
    return { verified: false, reasonCode: 'cross_agent_attribution' };
  }
  if (
    profile.identity.soulCoreId !== expected.identity.soulCoreId ||
    profile.identity.agentAccountId !== expected.identity.agentAccountId
  ) {
    return { verified: false, reasonCode: 'wrong_agent' };
  }
  if (
    profile.identity.mappingVersion !== expected.identity.mappingVersion ||
    profile.identity.mappingHistoryRef.ref !== expected.identity.mappingHistoryRef.ref ||
    profile.identity.mappingHistoryRef.port !== expected.identity.mappingHistoryRef.port ||
    profile.identity.mappingHistoryRef.contractVersion !==
      expected.identity.mappingHistoryRef.contractVersion ||
    (profile.identity.mappingHistoryRef.digest !== undefined &&
      expected.identity.mappingHistoryRef.digest !== undefined &&
      !sameDigest(
        profile.identity.mappingHistoryRef.digest,
        expected.identity.mappingHistoryRef.digest,
      ))
  ) {
    return { verified: false, reasonCode: 'false_same_agent_claim' };
  }
  if (profile.authorization.ownerPrincipalRef !== expected.ownerPrincipalRef) {
    return { verified: false, reasonCode: 'wrong_owner' };
  }
  if (profile.authorization.ownershipEpoch !== expected.ownershipEpoch) {
    return { verified: false, reasonCode: 'owner_epoch_stale' };
  }
  const expectedAuthorization = expected.authorizationReceiptRef;
  const actualAuthorization = profile.authorization.authorizationReceiptRef;
  if (
    actualAuthorization.port !== expectedAuthorization.port ||
    actualAuthorization.contractVersion !== expectedAuthorization.contractVersion ||
    actualAuthorization.ref !== expectedAuthorization.ref
  ) {
    return { verified: false, reasonCode: 'wrong_owner' };
  }
  if (profile.tenantId !== expected.tenantId) {
    return { verified: false, reasonCode: 'wrong_tenant' };
  }
  if (
    profile.sourceEnvironment !== expected.sourceEnvironment ||
    proof.targetEnvironment !== expected.targetEnvironment
  ) {
    return { verified: false, reasonCode: 'wrong_environment' };
  }
  if (profile.intendedAudience !== expected.intendedAudience) {
    return { verified: false, reasonCode: 'wrong_audience' };
  }
  if (
    profile.sourceRuntimeRef !== expected.sourceRuntimeRef ||
    proof.targetRuntimeRef !== expected.targetRuntimeRef ||
    proof.sourceRuntimeRef === proof.targetRuntimeRef
  ) {
    return { verified: false, reasonCode: 'wrong_runtime' };
  }
  if (!sameDigest(proof.expectedSnapshotHeadDigest, expected.acceptedSnapshotHeadDigest)) {
    return { verified: false, reasonCode: 'rollback_detected' };
  }
  if (proof.challengeExpiresAt <= expected.now || proof.expiresAt <= expected.now) {
    return { verified: false, reasonCode: 'challenge_expired' };
  }
  if (
    proof.identity.agentId !== profile.identity.agentId ||
    proof.identity.soulCoreId !== profile.identity.soulCoreId ||
    proof.identity.agentAccountId !== profile.identity.agentAccountId ||
    proof.identity.mappingVersion !== profile.identity.mappingVersion ||
    proof.identity.mappingHistoryRef.ref !== profile.identity.mappingHistoryRef.ref
  ) {
    return { verified: false, reasonCode: 'false_same_agent_claim' };
  }
  if (
    proof.ownerAuthorizationReceiptRef.ref !==
      profile.authorization.authorizationReceiptRef.ref ||
    proof.ownerAuthorizationReceiptRef.port !==
      profile.authorization.authorizationReceiptRef.port
  ) {
    return { verified: false, reasonCode: 'wrong_owner' };
  }
  return { verified: true, reasonCode: 'continuity_ok' };
}
