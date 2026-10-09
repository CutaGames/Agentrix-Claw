import {
  isAuthorityRootRefV1,
  isRecordRefV1,
  type AgentSoulContractValidationResultV1,
  type AuthorityRootRefV1,
} from './agent-attribution';
import {
  getShellCommandClaimKeysV1,
  validateShellCommandEnvelopeV1,
  type ShellCommandClaimKeysV1,
  type ShellCommandEnvelopeV1,
} from './shell-session-binding';
import {
  ASSURANCE_ENVIRONMENTS_V1,
  ASSURANCE_EVIDENCE_LEVELS_V1,
  ASSURANCE_MECHANISMS_V1,
  ASSURANCE_MECHANISM_STATES_V1,
  validateAssuranceMechanismEvidenceV1,
  type AssuranceEnvironmentV1,
  type AssuranceEvidenceLevelV1,
  type AssuranceMechanismEvidenceV1,
} from './soul-core-assurance';
import {
  TRUST_RECORD_TYPES,
  canonicalizeJson,
  sha256Hex,
  utf8Encode,
  type RecordRef,
} from './trust-loop-primitives';

/** Soul Core Embedded canonical protocol contracts. Runtime ownership remains in each owning domain. */
export const SOUL_CORE_EMBEDDED_SCHEMA_VERSION = 1 as const;

export const EMBEDDED_TRUST_RECORD_TYPES_V1 = [
  'device_identity',
  'embedded_batch',
  'embedded_element',
  'embedded_key',
  'embedded_certificate',
  'embedded_claim_attempt',
  'embedded_association_reservation',
  'embedded_security_observation',
  'embedded_revocation_event',
  'shell_command_journal_entry',
  'host_enrollment_reservation',
  'downstream_idempotency',
  'embedded_certification_record',
  'embedded_evidence_manifest',
  'embedded_release_decision',
  'embedded_release_allowlist_snapshot',
  'embedded_release_receipt',
  'feature_flag_snapshot',
] as const;
export type EmbeddedTrustRecordTypeV1 = (typeof EMBEDDED_TRUST_RECORD_TYPES_V1)[number];

export const SHELL_COMMAND_CANONICALIZATION_PROFILES_V1 = [
  'rfc8785-utf8-sha256-v1',
] as const;
export type ShellCommandCanonicalizationProfileV1 =
  (typeof SHELL_COMMAND_CANONICALIZATION_PROFILES_V1)[number];

export const SHELL_COMMAND_DIGEST_PROFILES_V1 = ['sha256-rfc8785-v1'] as const;
export type ShellCommandDigestProfileV1 = (typeof SHELL_COMMAND_DIGEST_PROFILES_V1)[number];

export const SIGNED_ARTIFACT_DIGEST_PROFILES_V1 = [
  'sha256-der-chain-lp-v1',
  'sha256-rfc8785-assurance-evidence-v1',
] as const;
export type SignedArtifactDigestProfileV1 =
  (typeof SIGNED_ARTIFACT_DIGEST_PROFILES_V1)[number];

export const SHELL_COMMAND_SIGNATURE_ENCODINGS_V1 = [
  'base64url-p1363',
  'base64url-der',
] as const;
export type ShellCommandSignatureEncodingV1 =
  (typeof SHELL_COMMAND_SIGNATURE_ENCODINGS_V1)[number];

export const SHELL_COMMAND_SIGNATURE_ALGORITHMS_V1 = [
  'ecdsa-secp256k1-sha256',
  'ecdsa-p256-sha256',
] as const;
export type ShellCommandSignatureAlgorithmV1 =
  (typeof SHELL_COMMAND_SIGNATURE_ALGORITHMS_V1)[number];

export const EMBEDDED_FORM_FACTORS_V1 = ['tag', 'chip', 'module', 'sim'] as const;
export type EmbeddedFormFactorV1 = (typeof EMBEDDED_FORM_FACTORS_V1)[number];

export const EMBEDDED_IMPLEMENTATION_MECHANISMS_V1 = [
  'nfc-tag-aes-sun',
  'nfc-tag-ecdsa',
  'ese-i2c',
  'module-ese-nfc',
  'esim-javacard',
] as const;
export type EmbeddedImplementationMechanismV1 =
  (typeof EMBEDDED_IMPLEMENTATION_MECHANISMS_V1)[number];

export const EMBEDDED_INTEGRATION_MATURITIES_V1 = [
  'protocol-only',
  'reference-integration',
  'design-partner-device',
  'pilot-hardware',
  'certified-production',
] as const;
export type EmbeddedIntegrationMaturityV1 =
  (typeof EMBEDDED_INTEGRATION_MATURITIES_V1)[number];

export const EMBEDDED_KEY_ENVIRONMENTS_V1 = [
  'development',
  'test',
  'staging',
  'production',
] as const;
export type EmbeddedKeyEnvironmentV1 = (typeof EMBEDDED_KEY_ENVIRONMENTS_V1)[number];

export const EMBEDDED_MANUFACTURING_LIFECYCLES_V1 = [
  'manufactured',
  'activated',
  'retired',
] as const;
export type EmbeddedManufacturingLifecycleV1 =
  (typeof EMBEDDED_MANUFACTURING_LIFECYCLES_V1)[number];

export const EMBEDDED_ASSOCIATION_STATES_V1 = ['unbound', 'reserved', 'bound'] as const;
export type EmbeddedAssociationStateV1 = (typeof EMBEDDED_ASSOCIATION_STATES_V1)[number];

export const EMBEDDED_ELEMENT_AVAILABILITIES_V1 = [
  'not-applicable',
  'unknown',
  'present',
  'absent',
  'stale',
] as const;
export type EmbeddedElementAvailabilityV1 =
  (typeof EMBEDDED_ELEMENT_AVAILABILITIES_V1)[number];

export const EMBEDDED_RISK_STATES_V1 = [
  'clear',
  'suspected-clone',
  'stolen',
  'revoked',
] as const;
export type EmbeddedRiskStateV1 = (typeof EMBEDDED_RISK_STATES_V1)[number];

export const EMBEDDED_CLAIM_CHANNELS_V1 = ['mobile-nfc', 'mobile-qr', 'web-qr'] as const;
export type EmbeddedClaimChannelV1 = (typeof EMBEDDED_CLAIM_CHANNELS_V1)[number];

export const EMBEDDED_CLAIM_PROOF_PROTOCOLS_V1 = ['aes-sun', 'ecdsa-challenge'] as const;
export type EmbeddedClaimProofProtocolV1 =
  (typeof EMBEDDED_CLAIM_PROOF_PROTOCOLS_V1)[number];

export const EMBEDDED_EVIDENCE_PHASES_V1 = ['pre-decision', 'post-decision'] as const;
export type EmbeddedEvidencePhaseV1 = (typeof EMBEDDED_EVIDENCE_PHASES_V1)[number];

export const EMBEDDED_TEST_RESULT_STATUSES_V1 = ['pass', 'fail', 'partial', 'blocked'] as const;
export type EmbeddedTestResultStatusV1 =
  (typeof EMBEDDED_TEST_RESULT_STATUSES_V1)[number];

export const EMBEDDED_ASSOCIATION_RESERVATION_STATES_V1 = [
  'reserved',
  'binding-created',
  'committed',
  'compensating',
  'released',
] as const;
export type EmbeddedAssociationReservationStateV1 =
  (typeof EMBEDDED_ASSOCIATION_RESERVATION_STATES_V1)[number];

export const REVOCABLE_AGGREGATE_KINDS_V1 = [
  'device',
  'element',
  'batch',
  'key',
  'certificate',
  'shell-binding',
  'host-binding',
] as const;
export type RevocableAggregateKindV1 = (typeof REVOCABLE_AGGREGATE_KINDS_V1)[number];

export const HOST_ENROLLMENT_RESERVATION_STATES_V1 = [
  'pending',
  'active',
  'rejected',
  'compensating',
] as const;
export type HostEnrollmentReservationStateV1 =
  (typeof HOST_ENROLLMENT_RESERVATION_STATES_V1)[number];

export const EMBEDDED_SKU_RELEASE_DISPOSITIONS_V1 = [
  'approved',
  'denied',
  'revoked',
  'expired',
] as const;
export type EmbeddedSkuReleaseDispositionV1 =
  (typeof EMBEDDED_SKU_RELEASE_DISPOSITIONS_V1)[number];

export const EMBEDDED_RELEASE_SNAPSHOT_SCOPES_V1 = ['environment-full'] as const;
export type EmbeddedReleaseSnapshotScopeV1 =
  (typeof EMBEDDED_RELEASE_SNAPSHOT_SCOPES_V1)[number];

/** Canonical lexical order; every full snapshot contains each flag exactly once. */
export const EMBEDDED_FEATURE_FLAG_NAMES_V1 = [
  'SOUL_CHIP_ATTESTATION_ENABLED',
  'SOUL_CORE_EMBEDDED_ASSURANCE_PROJECTOR_ENABLED',
  'SOUL_CORE_EMBEDDED_CANONICAL_READER_ENABLED',
  'SOUL_CORE_EMBEDDED_CLAIM_VERIFIER_ENABLED',
  'SOUL_CORE_EMBEDDED_CLIENT_ENABLED',
  'SOUL_CORE_EMBEDDED_COMMAND_VERIFIER_ENABLED',
  'SOUL_CORE_EMBEDDED_HOST_WRITER_ENABLED',
  'SOUL_CORE_EMBEDDED_LEGACY_READER_ENABLED',
  'SOUL_CORE_EMBEDDED_REGISTRY_WRITER_ENABLED',
] as const;
export type EmbeddedFeatureFlagNameV1 = (typeof EMBEDDED_FEATURE_FLAG_NAMES_V1)[number];

export type EmbeddedFirmwareVersionV1 = string;
export type EmbeddedFirmwareRangeV1 = string;

export interface EmbeddedElementRefV1 {
  schemaVersion: 1;
  elementId: string;
  batchRef: RecordRef;
  formFactor: EmbeddedFormFactorV1;
  implementationMechanism: EmbeddedImplementationMechanismV1;
  manufacturingLifecycle: EmbeddedManufacturingLifecycleV1;
  associationState: EmbeddedAssociationStateV1;
  associationReservationRef?: RecordRef;
  activeShellBindingRef?: RecordRef;
  elementAvailability: EmbeddedElementAvailabilityV1;
  riskState: EmbeddedRiskStateV1;
  stateVersion: number;
  revocationEpoch: number;
}

export interface EmbeddedElementEventBaseV1 {
  schemaVersion: 1;
  eventId: string;
  elementRef: RecordRef;
  expectedStateVersion: number;
  resultingStateVersion: number;
  actorRef: RecordRef;
  reasonCode: string;
  sourceRef: RecordRef;
  occurredAt: string;
}

export type EmbeddedAssociationProjectionEventV1 = EmbeddedElementEventBaseV1 &
  (
    | {
        dimension: 'association-projection';
        transition: 'reserve';
        previous: 'unbound';
        next: 'reserved';
        nextReservationRef: RecordRef;
      }
    | {
        dimension: 'association-projection';
        transition: 'commit';
        previous: 'reserved';
        next: 'bound';
        previousReservationRef: RecordRef;
        nextBindingRef: RecordRef;
      }
    | {
        dimension: 'association-projection';
        transition: 'release-reservation';
        previous: 'reserved';
        next: 'unbound';
        previousReservationRef: RecordRef;
      }
    | {
        dimension: 'association-projection';
        transition: 'deactivate-binding';
        previous: 'bound';
        next: 'unbound';
        previousBindingRef: RecordRef;
      }
    | {
        dimension: 'association-projection';
        transition: 'replace-binding';
        previous: 'bound';
        next: 'bound';
        previousBindingRef: RecordRef;
        nextBindingRef: RecordRef;
      }
  );

export type EmbeddedRiskStateEventV1 = EmbeddedElementEventBaseV1 &
  (
    | {
        dimension: 'risk';
        transition: 'mark-risk';
        previous: EmbeddedRiskStateV1;
        next: 'suspected-clone' | 'stolen' | 'revoked';
        previousRevocationEpoch: number;
        resultingRevocationEpoch: number;
      }
    | {
        dimension: 'risk';
        transition: 'audited-recovery';
        previous: 'suspected-clone' | 'stolen';
        next: 'clear';
        previousRevocationEpoch: number;
        resultingRevocationEpoch: number;
        investigationRef: RecordRef;
        recoveryDecisionRef: RecordRef;
        recoveryEvidenceRefs: RecordRef[];
        policyVersion: string;
      }
  );

export type EmbeddedElementStateEventV1 =
  | (EmbeddedElementEventBaseV1 & {
      dimension: 'registration';
      initial: EmbeddedElementRefV1;
    })
  | (EmbeddedElementEventBaseV1 & {
      dimension: 'manufacturing-lifecycle';
      previous: EmbeddedManufacturingLifecycleV1;
      next: EmbeddedManufacturingLifecycleV1;
    })
  | EmbeddedAssociationProjectionEventV1
  | (EmbeddedElementEventBaseV1 & {
      dimension: 'element-availability';
      previous: EmbeddedElementAvailabilityV1;
      next: EmbeddedElementAvailabilityV1;
      observedAt: string;
    })
  | EmbeddedRiskStateEventV1;

export interface EmbeddedClaimChallengeV1 {
  schemaVersion: 1;
  challengeId: string;
  elementRef: RecordRef;
  batchRef: RecordRef;
  targetAgentId: string;
  accountableAgentId: string;
  authorityRootRef: AuthorityRootRefV1;
  principalRef: RecordRef;
  tenantRef?: RecordRef;
  audience: string[];
  channel: EmbeddedClaimChannelV1;
  proofProtocol: EmbeddedClaimProofProtocolV1;
  nonce: string;
  idempotencyKey: string;
  issuedAt: string;
  expiresAt: string;
}

export interface EmbeddedLocatorV1 {
  schemaVersion: 1;
  opaqueLocator: string;
  channel: 'mobile-qr' | 'web-qr';
  expiresAt?: string;
}

export interface SignedArtifactBindingV1 {
  ref: RecordRef;
  canonicalDigest: string;
  digestProfile: SignedArtifactDigestProfileV1;
}

export interface AesSunClaimProofV1 {
  schemaVersion: 1;
  protocol: 'aes-sun';
  challengeId: string;
  elementRef: RecordRef;
  batchRef: RecordRef;
  keyVersion: number;
  counter: string;
  sunMessage: string;
  mac: string;
  collectedAt: string;
}

export interface EcdsaChallengeClaimProofV1 {
  schemaVersion: 1;
  protocol: 'ecdsa-challenge';
  challengeId: string;
  challengeDigest: string;
  digestProfile: ShellCommandDigestProfileV1;
  signerKeyRef: RecordRef;
  keyVersion: number;
  algorithm: ShellCommandSignatureAlgorithmV1;
  signatureEncoding: ShellCommandSignatureEncodingV1;
  signature: string;
  certificateBinding?: SignedArtifactBindingV1;
  signedAt: string;
}

export type EmbeddedClaimProofV1 = AesSunClaimProofV1 | EcdsaChallengeClaimProofV1;

export interface EmbeddedClaimRequestDigestPayloadV1 {
  schemaVersion: 1;
  domain: 'agentrix:embedded-claim-request:v1';
  challenge: EmbeddedClaimChallengeV1;
  proof: EmbeddedClaimProofV1;
  requestedCapabilities: string[];
  runtimeRef: RecordRef;
}

export interface EmbeddedClaimCommandV1 {
  schemaVersion: 1;
  challenge: EmbeddedClaimChallengeV1;
  ownerAuthorizationRef: RecordRef;
  proof: EmbeddedClaimProofV1;
  requestedCapabilities: string[];
  runtimeRef: RecordRef;
}

export interface EmbeddedClaimDecisionBaseV1 {
  schemaVersion: 1;
  decisionId: string;
  challengeId: string;
  requestDigest: string;
  reasonCode: string;
  decidedAt: string;
}

export type EmbeddedClaimDecisionV1 =
  | (EmbeddedClaimDecisionBaseV1 & {
      status: 'accepted';
      reservationRef: RecordRef;
      bindingRef: RecordRef;
    })
  | (EmbeddedClaimDecisionBaseV1 & {
      status: 'pending-reconciliation';
      reservationRef: RecordRef;
      bindingRef?: RecordRef;
    })
  | (EmbeddedClaimDecisionBaseV1 & {
      status: 'rejected' | 'conflict';
      reservationRef?: never;
      bindingRef?: never;
    });

export interface RevocationFenceEntryV1 {
  aggregateKind: RevocableAggregateKindV1;
  aggregateRef: RecordRef;
  observedEpoch: number;
}

export interface RevocationFenceSetV1 {
  schemaVersion: 1;
  policyVersion: string;
  entries: RevocationFenceEntryV1[];
}

export interface RevocationFenceBindingV1 {
  schemaVersion: 1;
  fenceSet: RevocationFenceSetV1;
  fenceSetDigest: string;
  digestProfile: ShellCommandDigestProfileV1;
  downstreamFenceToken: string;
}

export interface EmbeddedAssociationReservationV1 {
  schemaVersion: 1;
  reservationId: string;
  claimAttemptRef: RecordRef;
  elementRef: RecordRef;
  targetAgentId: string;
  accountableAgentId: string;
  requestDigest: string;
  associationFenceToken: string;
  revocationFence: RevocationFenceBindingV1;
  state: EmbeddedAssociationReservationStateV1;
  bindingRef?: RecordRef;
  createdAt: string;
  updatedAt: string;
  expiresAt: string;
}

export interface SignedAssuranceEvidenceDigestPayloadV1 {
  schemaVersion: 1;
  domain: 'agentrix:assurance-evidence-binding:v1';
  evidence: AssuranceMechanismEvidenceV1;
}

export interface SignedShellCommandSigningPayloadV1 {
  wrapperSchemaVersion: 1;
  domain: 'agentrix:shell-command:v1';
  canonicalizationProfile: ShellCommandCanonicalizationProfileV1;
  digestProfile: ShellCommandDigestProfileV1;
  signatureEncoding: ShellCommandSignatureEncodingV1;
  envelope: ShellCommandEnvelopeV1;
  signerRef: string;
  keyVersion: number;
  algorithm: ShellCommandSignatureAlgorithmV1;
  certificateChain?: SignedArtifactBindingV1;
  attestationEvidence?: SignedArtifactBindingV1;
}

export interface SignedShellCommandV1 {
  signingPayload: SignedShellCommandSigningPayloadV1;
  signature: string;
}

export interface ShellCommandReservationCommandV1 {
  schemaVersion: 1;
  signedCommand: SignedShellCommandV1;
  claimKeys: ShellCommandClaimKeysV1;
  revocationFence: RevocationFenceBindingV1;
  downstreamIdempotencyRef: RecordRef;
}

export interface ShellCommandRevocationFenceCompanionV1 {
  schemaVersion: 1;
  journalEntryRef: RecordRef;
  revocationFence: RevocationFenceBindingV1;
}

export interface HostEnrollmentReservationV1 {
  schemaVersion: 1;
  reservationId: string;
  requestedHostRef: RecordRef;
  revocationFence: RevocationFenceBindingV1;
  state: HostEnrollmentReservationStateV1;
  createdAt: string;
  updatedAt: string;
}

export interface EmbeddedSkuKeyV1 {
  environment: AssuranceEnvironmentV1;
  manufacturerRef: RecordRef;
  model: string;
  hardwareRevision: string;
  firmwareRange: EmbeddedFirmwareRangeV1;
  formFactor: EmbeddedFormFactorV1;
  implementationMechanism: EmbeddedImplementationMechanismV1;
}

export interface EmbeddedFeatureFlagStateV1 {
  flag: EmbeddedFeatureFlagNameV1;
  enabled: boolean;
}

export interface FeatureFlagSnapshotV1 {
  schemaVersion: 1;
  snapshotId: string;
  snapshotVersion: number;
  environment: AssuranceEnvironmentV1;
  scope: EmbeddedReleaseSnapshotScopeV1;
  sourceConfigVersion: string;
  flags: EmbeddedFeatureFlagStateV1[];
  capturedAt: string;
  issuedByRef: RecordRef;
}

export interface EmbeddedSkuReleaseDecisionV1 {
  schemaVersion: 1;
  decisionId: string;
  skuKey: EmbeddedSkuKeyV1;
  decisionVersion: number;
  disposition: EmbeddedSkuReleaseDispositionV1;
  approvedMaturityCeiling: EmbeddedIntegrationMaturityV1;
  evidenceManifestRefs: RecordRef[];
  reasonCode: string;
  decidedByRef: RecordRef;
  decidedAt: string;
  expiresAt?: string;
}

export interface EmbeddedSkuReleaseAllowlistEntryV1 {
  skuKey: EmbeddedSkuKeyV1;
  decisionRef: RecordRef;
  decisionVersion: number;
}

export interface EmbeddedSkuReleaseAllowlistSnapshotV1 {
  schemaVersion: 1;
  snapshotId: string;
  snapshotVersion: number;
  environment: AssuranceEnvironmentV1;
  scope: EmbeddedReleaseSnapshotScopeV1;
  entries: EmbeddedSkuReleaseAllowlistEntryV1[];
  capturedAt: string;
  issuedByRef: RecordRef;
}

export interface EmbeddedSkuReleaseReceiptV1 {
  schemaVersion: 1;
  receiptId: string;
  skuKey: EmbeddedSkuKeyV1;
  decisionRef: RecordRef;
  decisionVersion: number;
  flagSnapshotRef: RecordRef;
  releaseAllowlistSnapshotRef: RecordRef;
  effectiveAt: string;
  issuedByRef: RecordRef;
}

export interface EmbeddedEvidenceSourceV1 {
  component: string;
  sourceSha: string;
  worktreeState: 'clean' | 'dirty' | 'unknown';
}

export interface EmbeddedEvidenceArtifactV1 {
  artifactRef: RecordRef;
  repositoryPath?: string;
  sha256: string;
  role: string;
}

export interface EmbeddedEvidenceResultV1 {
  resultId: string;
  requirementIds: string[];
  taskIds: string[];
  status: EmbeddedTestResultStatusV1;
  artifactRefs: RecordRef[];
  limitations: string[];
}

export interface EmbeddedEvidenceVersionsV1 {
  hardware: string[];
  firmwareVersions: string[];
  appVersions: string[];
  backendVersions: string[];
  apiSchemaVersions: string[];
}

export interface EmbeddedEvidenceManifestBaseV1 {
  schemaVersion: 1;
  manifestId: string;
  environment: AssuranceEnvironmentV1;
  integrationMaturity: EmbeddedIntegrationMaturityV1;
  keyEnvironment?: EmbeddedKeyEnvironmentV1;
  assuranceEvidenceLevel?: AssuranceEvidenceLevelV1;
  candidateSkuKey?: EmbeddedSkuKeyV1;
  sources: EmbeddedEvidenceSourceV1[];
  artifacts: EmbeddedEvidenceArtifactV1[];
  results: EmbeddedEvidenceResultV1[];
  versions: EmbeddedEvidenceVersionsV1;
  flagSnapshotRef: RecordRef;
  releaseAllowlistSnapshotRef: RecordRef;
  limitations: string[];
  ownerRef: RecordRef;
  reviewerRefs: RecordRef[];
  capturedAt: string;
}

export interface EmbeddedPreDecisionEvidenceManifestV1 extends EmbeddedEvidenceManifestBaseV1 {
  evidencePhase: 'pre-decision';
  releaseReceiptRef?: never;
}

export interface EmbeddedPostDecisionEvidenceManifestV1 extends EmbeddedEvidenceManifestBaseV1 {
  evidencePhase: 'post-decision';
  releaseReceiptRef: RecordRef;
}

export type EmbeddedEvidenceManifestV1 =
  | EmbeddedPreDecisionEvidenceManifestV1
  | EmbeddedPostDecisionEvidenceManifestV1;

export interface RevocationFenceValidationContextV1 {
  expectedEntries?: ReadonlyArray<{
    aggregateKind: RevocableAggregateKindV1;
    aggregateRef: RecordRef;
    currentEpoch?: number;
  }>;
}

export interface EmbeddedEvidenceValidationContextV1 {
  allowCandidateSkuAbsent?: boolean;
}

export interface EmbeddedReceiptValidationContextV1 {
  decision?: EmbeddedSkuReleaseDecisionV1;
  flagSnapshot?: FeatureFlagSnapshotV1;
  allowlistSnapshot?: EmbeddedSkuReleaseAllowlistSnapshotV1;
}

const EXACT_TIMESTAMP_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const SHA256_HEX_PATTERN = /^[0-9a-f]{64}$/;
const SOURCE_SHA_PATTERN = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/;
const BASE64URL_PATTERN = /^[A-Za-z0-9_-]+$/;
const UINT64_PATTERN = /^(?:0|[1-9][0-9]{0,19})$/;
const FIRMWARE_VERSION_PATTERN = /^(0|[1-9][0-9]{0,9})\.(0|[1-9][0-9]{0,9})\.(0|[1-9][0-9]{0,9})$/;
const FIRMWARE_RANGE_PATTERN = /^\[((?:0|[1-9][0-9]{0,9})\.(?:0|[1-9][0-9]{0,9})\.(?:0|[1-9][0-9]{0,9})),((?:0|[1-9][0-9]{0,9})\.(?:0|[1-9][0-9]{0,9})\.(?:0|[1-9][0-9]{0,9}))\]$/;

function result(errors: string[]): AgentSoulContractValidationResultV1 {
  return { valid: errors.length === 0, errors };
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function exactKeys(
  input: Record<string, unknown>,
  required: readonly string[],
  optional: readonly string[],
  path: string,
  errors: string[],
): void {
  const allowed = new Set([...required, ...optional]);
  for (const key of Object.keys(input)) {
    if (!allowed.has(key)) errors.push(`${path}.${key}: unknown field`);
  }
  for (const key of required) {
    if (!Object.prototype.hasOwnProperty.call(input, key)) errors.push(`${path}.${key}: required`);
  }
  for (const key of optional) {
    if (Object.prototype.hasOwnProperty.call(input, key) && input[key] === null) {
      errors.push(`${path}.${key}: null does not represent absence`);
    }
  }
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && hasValidUnicode(value);
}

function hasValidUnicode(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code >= 0xd800 && code <= 0xdbff) {
      if (index + 1 >= value.length) return false;
      const next = value.charCodeAt(index + 1);
      if (!(next >= 0xdc00 && next <= 0xdfff)) return false;
      index += 1;
    } else if (code >= 0xdc00 && code <= 0xdfff) {
      return false;
    }
  }
  return true;
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0 && !Object.is(value, -0);
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 && !Object.is(value, -0);
}

function isCanonicalTimestamp(value: unknown): value is string {
  if (typeof value !== 'string' || !EXACT_TIMESTAMP_PATTERN.test(value)) return false;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) && new Date(parsed).toISOString() === value;
}

function isAuditTimestamp(value: unknown): value is string {
  return typeof value === 'string' && value.endsWith('Z') && Number.isFinite(Date.parse(value));
}

function isEnumValue<T extends string>(value: unknown, values: readonly T[]): value is T {
  return typeof value === 'string' && (values as readonly string[]).includes(value);
}

function compareUtf8(left: string, right: string): number {
  const a = utf8Encode(left);
  const b = utf8Encode(right);
  const length = Math.min(a.length, b.length);
  for (let index = 0; index < length; index += 1) {
    if (a[index] !== b[index]) return a[index] - b[index];
  }
  return a.length - b.length;
}

function isSortedUniqueStrings(value: unknown, allowEmpty = false): value is string[] {
  if (!Array.isArray(value) || (!allowEmpty && value.length === 0) || !value.every(isNonEmptyString)) {
    return false;
  }
  for (let index = 1; index < value.length; index += 1) {
    if (compareUtf8(value[index - 1], value[index]) >= 0) return false;
  }
  return true;
}

function refIdentity(ref: RecordRef): string {
  return `${ref.type}\u0000${ref.id}\u0000${ref.version ?? 0}`;
}

function compareRefs(left: RecordRef, right: RecordRef): number {
  return compareUtf8(refIdentity(left), refIdentity(right));
}

function isSortedUniqueRefs(value: unknown, allowedTypes?: readonly string[]): value is RecordRef[] {
  if (!Array.isArray(value) || value.length === 0) return false;
  const refs: RecordRef[] = [];
  for (const candidate of value) {
    if (!isStrictRecordRef(candidate, undefined, false, true)) return false;
    if (allowedTypes !== undefined && !allowedTypes.includes(candidate.type)) return false;
    refs.push(candidate);
  }
  for (let index = 1; index < refs.length; index += 1) {
    if (compareRefs(refs[index - 1], refs[index]) >= 0) return false;
  }
  return true;
}

function isStrictRecordRef(
  value: unknown,
  expectedType?: string,
  requireVersion = false,
  forbidDigest = false,
): value is RecordRef {
  if (!isPlainObject(value) || !isRecordRefV1(value)) return false;
  const allowed = new Set(['type', 'id', 'version', 'digest']);
  if (Object.keys(value).some((key) => !allowed.has(key))) return false;
  if (expectedType !== undefined && value.type !== expectedType) return false;
  if (requireVersion && !isPositiveInteger(value.version)) return false;
  if (forbidDigest && value.digest !== undefined) return false;
  if (value.digest !== undefined) {
    if (!isPlainObject(value.digest)) return false;
    if (Object.keys(value.digest).sort().join(',') !== 'algorithm,canonicalization,value') return false;
  }
  return true;
}

function isExactAuthorityRootRef(value: unknown): value is AuthorityRootRefV1 {
  if (!isPlainObject(value) || !isAuthorityRootRefV1(value)) return false;
  const expected = value.kind === 'soul_core'
    ? ['kind', 'soulCoreId']
    : ['kind', 'teamId', 'authorityId'];
  return Object.keys(value).sort().join(',') === [...expected].sort().join(',');
}

function validateWireValue(value: unknown, path: string, errors: string[]): void {
  if (value === null || typeof value === 'boolean') return;
  if (typeof value === 'string') {
    if (!hasValidUnicode(value)) errors.push(`${path}: invalid Unicode surrogate`);
    return;
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value) || Object.is(value, -0)) errors.push(`${path}: invalid JSON number`);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((entry, index) => validateWireValue(entry, `${path}[${index}]`, errors));
    return;
  }
  if (isPlainObject(value)) {
    for (const [key, nested] of Object.entries(value)) {
      if (!hasValidUnicode(key)) errors.push(`${path}: invalid Unicode key`);
      if (nested === undefined) errors.push(`${path}.${key}: undefined is not a wire value`);
      else validateWireValue(nested, `${path}.${key}`, errors);
    }
    return;
  }
  errors.push(`${path}: unsupported wire value`);
}

/** Strict JSON materializer used before structural validators; duplicate keys never reach an object. */
export function parseEmbeddedJsonV1(source: string, maximumBytes = 1_000_000, maximumDepth = 64): unknown {
  if (typeof source !== 'string' || utf8Encode(source).length > maximumBytes) {
    throw new Error('Embedded JSON exceeds the configured byte limit');
  }
  let offset = 0;
  const skipWhitespace = (): void => {
    while (offset < source.length && /[\u0020\u000a\u000d\u0009]/.test(source[offset])) offset += 1;
  };
  const parseString = (): string => {
    if (source[offset] !== '"') throw new Error(`Expected JSON string at ${offset}`);
    const start = offset;
    offset += 1;
    while (offset < source.length) {
      const code = source.charCodeAt(offset);
      if (code < 0x20) throw new Error(`Unescaped control character at ${offset}`);
      if (source[offset] === '\\') {
        offset += 1;
        if (offset >= source.length) throw new Error('Truncated JSON escape');
        if (source[offset] === 'u') {
          const hex = source.slice(offset + 1, offset + 5);
          if (!/^[0-9a-fA-F]{4}$/.test(hex)) throw new Error(`Invalid Unicode escape at ${offset}`);
          offset += 5;
        } else {
          if (!'"\\/bfnrt'.includes(source[offset])) throw new Error(`Invalid JSON escape at ${offset}`);
          offset += 1;
        }
        continue;
      }
      if (source[offset] === '"') {
        offset += 1;
        return JSON.parse(source.slice(start, offset)) as string;
      }
      offset += 1;
    }
    throw new Error('Unterminated JSON string');
  };
  const parseValue = (depth: number): unknown => {
    if (depth > maximumDepth) throw new Error('Embedded JSON exceeds the configured nesting limit');
    skipWhitespace();
    const token = source[offset];
    if (token === '"') return parseString();
    if (token === '{') {
      offset += 1;
      skipWhitespace();
      const object: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
      const keys = new Set<string>();
      if (source[offset] === '}') { offset += 1; return object; }
      while (offset < source.length) {
        skipWhitespace();
        const key = parseString();
        if (keys.has(key)) throw new Error(`Duplicate JSON key ${JSON.stringify(key)}`);
        keys.add(key);
        skipWhitespace();
        if (source[offset] !== ':') throw new Error(`Expected ':' at ${offset}`);
        offset += 1;
        object[key] = parseValue(depth + 1);
        skipWhitespace();
        if (source[offset] === '}') { offset += 1; return object; }
        if (source[offset] !== ',') throw new Error(`Expected ',' at ${offset}`);
        offset += 1;
      }
      throw new Error('Unterminated JSON object');
    }
    if (token === '[') {
      offset += 1;
      skipWhitespace();
      const array: unknown[] = [];
      if (source[offset] === ']') { offset += 1; return array; }
      while (offset < source.length) {
        array.push(parseValue(depth + 1));
        skipWhitespace();
        if (source[offset] === ']') { offset += 1; return array; }
        if (source[offset] !== ',') throw new Error(`Expected ',' at ${offset}`);
        offset += 1;
      }
      throw new Error('Unterminated JSON array');
    }
    for (const [literal, value] of [['true', true], ['false', false], ['null', null]] as const) {
      if (source.startsWith(literal, offset)) { offset += literal.length; return value; }
    }
    const number = /^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?/.exec(source.slice(offset));
    if (number !== null) {
      offset += number[0].length;
      const value = Number(number[0]);
      if (!Number.isFinite(value) || Object.is(value, -0)) throw new Error('Invalid Embedded JSON number');
      return value;
    }
    throw new Error(`Unexpected JSON token at ${offset}`);
  };
  const value = parseValue(0);
  skipWhitespace();
  if (offset !== source.length) throw new Error(`Trailing JSON input at ${offset}`);
  const errors: string[] = [];
  validateWireValue(value, 'value', errors);
  if (errors.length > 0) throw new Error(`Embedded JSON validation failed: ${errors.join('; ')}`);
  return value;
}

export function canonicalizeEmbeddedJsonV1(value: unknown): string {
  const errors: string[] = [];
  validateWireValue(value, 'value', errors);
  if (errors.length > 0) throw new Error(`Embedded canonicalization failed: ${errors.join('; ')}`);
  return canonicalizeJson(value);
}

export function computeEmbeddedCanonicalSha256V1(value: unknown): string {
  return sha256Hex(utf8Encode(canonicalizeEmbeddedJsonV1(value)));
}

function constantTimeEqual(left: string, right: string): boolean {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return difference === 0;
}

function formMatchesMechanism(form: unknown, mechanism: unknown): boolean {
  return (
    (form === 'tag' && (mechanism === 'nfc-tag-aes-sun' || mechanism === 'nfc-tag-ecdsa')) ||
    (form === 'chip' && mechanism === 'ese-i2c') ||
    (form === 'module' && mechanism === 'module-ese-nfc') ||
    (form === 'sim' && mechanism === 'esim-javacard')
  );
}

export function validateEmbeddedElementRefV1(input: unknown): AgentSoulContractValidationResultV1 {
  const errors: string[] = [];
  if (!isPlainObject(input)) return result(['element: expected plain object']);
  exactKeys(
    input,
    ['schemaVersion', 'elementId', 'batchRef', 'formFactor', 'implementationMechanism',
      'manufacturingLifecycle', 'associationState', 'elementAvailability', 'riskState',
      'stateVersion', 'revocationEpoch'],
    ['associationReservationRef', 'activeShellBindingRef'],
    'element',
    errors,
  );
  if (input.schemaVersion !== 1) errors.push('element.schemaVersion: unsupported version');
  if (!isNonEmptyString(input.elementId)) errors.push('element.elementId: expected non-empty string');
  if (!isStrictRecordRef(input.batchRef, 'embedded_batch', false, true)) {
    errors.push('element.batchRef: expected embedded_batch ref without digest');
  }
  if (!isEnumValue(input.formFactor, EMBEDDED_FORM_FACTORS_V1)) {
    errors.push('element.formFactor: unknown value');
  }
  if (!isEnumValue(input.implementationMechanism, EMBEDDED_IMPLEMENTATION_MECHANISMS_V1)) {
    errors.push('element.implementationMechanism: unknown value');
  } else if (!formMatchesMechanism(input.formFactor, input.implementationMechanism)) {
    errors.push('element.implementationMechanism: incompatible form factor');
  }
  if (!isEnumValue(input.manufacturingLifecycle, EMBEDDED_MANUFACTURING_LIFECYCLES_V1)) {
    errors.push('element.manufacturingLifecycle: unknown value');
  }
  if (!isEnumValue(input.associationState, EMBEDDED_ASSOCIATION_STATES_V1)) {
    errors.push('element.associationState: unknown value');
  }
  if (!isEnumValue(input.elementAvailability, EMBEDDED_ELEMENT_AVAILABILITIES_V1)) {
    errors.push('element.elementAvailability: unknown value');
  }
  if (!isEnumValue(input.riskState, EMBEDDED_RISK_STATES_V1)) {
    errors.push('element.riskState: unknown value');
  }
  if (!isPositiveInteger(input.stateVersion)) errors.push('element.stateVersion: expected positive integer');
  if (!isNonNegativeInteger(input.revocationEpoch)) {
    errors.push('element.revocationEpoch: expected non-negative integer');
  }
  const reservationValid = isStrictRecordRef(
    input.associationReservationRef,
    'embedded_association_reservation',
    false,
    true,
  );
  const bindingValid = isStrictRecordRef(input.activeShellBindingRef, 'shell_session_binding', true, true);
  if (input.associationState === 'unbound' &&
      (input.associationReservationRef !== undefined || input.activeShellBindingRef !== undefined)) {
    errors.push('element.associationState: unbound forbids reservation and binding refs');
  }
  if (input.associationState === 'reserved' && (!reservationValid || input.activeShellBindingRef !== undefined)) {
    errors.push('element.associationState: reserved requires only association reservation ref');
  }
  if (input.associationState === 'bound' && (!bindingValid || input.associationReservationRef !== undefined)) {
    errors.push('element.associationState: bound requires only versioned active Shell binding ref');
  }
  if (input.formFactor === 'tag' && input.elementAvailability !== 'not-applicable') {
    errors.push('element.elementAvailability: passive Tag must be not-applicable');
  }
  if (input.formFactor !== 'tag' && input.elementAvailability === 'not-applicable') {
    errors.push('element.elementAvailability: non-Tag cannot be not-applicable');
  }
  return result(errors);
}

export function validateEmbeddedElementStateEventV1(
  input: unknown,
): AgentSoulContractValidationResultV1 {
  const errors: string[] = [];
  if (!isPlainObject(input)) return result(['event: expected plain object']);
  const base = ['schemaVersion', 'eventId', 'elementRef', 'expectedStateVersion',
    'resultingStateVersion', 'actorRef', 'reasonCode', 'sourceRef', 'occurredAt', 'dimension'];
  const dimension = input.dimension;
  let required = [...base];
  if (dimension === 'registration') required.push('initial');
  else if (dimension === 'manufacturing-lifecycle') required.push('previous', 'next');
  else if (dimension === 'element-availability') required.push('previous', 'next', 'observedAt');
  else if (dimension === 'association-projection') {
    required.push('transition', 'previous', 'next');
    if (input.transition === 'reserve') required.push('nextReservationRef');
    else if (input.transition === 'commit') required.push('previousReservationRef', 'nextBindingRef');
    else if (input.transition === 'release-reservation') required.push('previousReservationRef');
    else if (input.transition === 'deactivate-binding') required.push('previousBindingRef');
    else if (input.transition === 'replace-binding') required.push('previousBindingRef', 'nextBindingRef');
  } else if (dimension === 'risk') {
    required.push('transition', 'previous', 'next', 'previousRevocationEpoch', 'resultingRevocationEpoch');
    if (input.transition === 'audited-recovery') {
      required.push('investigationRef', 'recoveryDecisionRef', 'recoveryEvidenceRefs', 'policyVersion');
    }
  } else {
    errors.push('event.dimension: unknown value');
  }
  exactKeys(input, required, [], 'event', errors);
  if (input.schemaVersion !== 1) errors.push('event.schemaVersion: unsupported version');
  if (!isNonEmptyString(input.eventId)) errors.push('event.eventId: expected non-empty string');
  if (!isStrictRecordRef(input.elementRef, 'embedded_element', false, true)) {
    errors.push('event.elementRef: expected embedded_element ref');
  }
  if (!isStrictRecordRef(input.actorRef, 'actor_identity', false, true)) {
    errors.push('event.actorRef: expected actor_identity ref');
  }
  if (!isStrictRecordRef(input.sourceRef, undefined, false, true)) {
    errors.push('event.sourceRef: expected known ref without digest');
  }
  if (!isNonEmptyString(input.reasonCode)) errors.push('event.reasonCode: expected non-empty string');
  if (!isAuditTimestamp(input.occurredAt)) errors.push('event.occurredAt: expected UTC timestamp');
  if (!isNonNegativeInteger(input.expectedStateVersion) ||
      !isPositiveInteger(input.resultingStateVersion) ||
      input.resultingStateVersion !== Number(input.expectedStateVersion) + 1) {
    errors.push('event.resultingStateVersion: must equal expectedStateVersion + 1');
  }
  if (dimension === 'registration') {
    const validation = validateEmbeddedElementRefV1(input.initial);
    errors.push(...validation.errors.map((error) => `event.initial: ${error}`));
    if (input.expectedStateVersion !== 0 || input.resultingStateVersion !== 1 ||
        !isPlainObject(input.initial) || input.initial.stateVersion !== 1 ||
        input.initial.revocationEpoch !== 0 || input.initial.manufacturingLifecycle !== 'manufactured' ||
        input.initial.associationState !== 'unbound' || input.initial.riskState !== 'clear') {
      errors.push('event.initial: invalid registration initial state');
    }
  }
  if (dimension === 'manufacturing-lifecycle') {
    const allowed = (input.previous === 'manufactured' &&
      (input.next === 'activated' || input.next === 'retired')) ||
      (input.previous === 'activated' && input.next === 'retired');
    if (!allowed) errors.push('event: illegal manufacturing lifecycle transition');
  }
  if (dimension === 'element-availability') {
    if (!isEnumValue(input.previous, EMBEDDED_ELEMENT_AVAILABILITIES_V1) ||
        !isEnumValue(input.next, EMBEDDED_ELEMENT_AVAILABILITIES_V1) ||
        input.previous === 'not-applicable' || input.next === 'not-applicable' ||
        !isCanonicalTimestamp(input.observedAt)) {
      errors.push('event: illegal element availability transition');
    }
  }
  if (dimension === 'association-projection') {
    const matrix: Record<string, readonly [string, string]> = {
      reserve: ['unbound', 'reserved'],
      commit: ['reserved', 'bound'],
      'release-reservation': ['reserved', 'unbound'],
      'deactivate-binding': ['bound', 'unbound'],
      'replace-binding': ['bound', 'bound'],
    };
    const expected = typeof input.transition === 'string' ? matrix[input.transition] : undefined;
    if (expected === undefined || input.previous !== expected[0] || input.next !== expected[1]) {
      errors.push('event: illegal association projection transition');
    }
    for (const key of ['nextReservationRef', 'previousReservationRef'] as const) {
      if (input[key] !== undefined &&
          !isStrictRecordRef(input[key], 'embedded_association_reservation', false, true)) {
        errors.push(`event.${key}: expected association reservation ref`);
      }
    }
    for (const key of ['nextBindingRef', 'previousBindingRef'] as const) {
      if (input[key] !== undefined &&
          !isStrictRecordRef(input[key], 'shell_session_binding', true, true)) {
        errors.push(`event.${key}: expected versioned Shell binding ref`);
      }
    }
  }
  if (dimension === 'risk') {
    const epochValid = isNonNegativeInteger(input.previousRevocationEpoch) &&
      isPositiveInteger(input.resultingRevocationEpoch) &&
      input.resultingRevocationEpoch === Number(input.previousRevocationEpoch) + 1;
    if (!epochValid) errors.push('event.resultingRevocationEpoch: must increment by one');
    if (input.transition === 'mark-risk') {
      const allowed = (input.previous === 'clear' &&
        ['suspected-clone', 'stolen', 'revoked'].includes(String(input.next))) ||
        (['suspected-clone', 'stolen'].includes(String(input.previous)) && input.next === 'revoked');
      if (!allowed) errors.push('event: illegal risk transition');
    } else if (input.transition === 'audited-recovery') {
      if (!['suspected-clone', 'stolen'].includes(String(input.previous)) || input.next !== 'clear' ||
          !isStrictRecordRef(input.investigationRef, 'dispute_case', false, true) ||
          !isStrictRecordRef(input.recoveryDecisionRef, 'risk_decision', false, true) ||
          !isSortedUniqueRefs(input.recoveryEvidenceRefs, ['evidence', 'task_proof']) ||
          !isNonEmptyString(input.policyVersion)) {
        errors.push('event: audited recovery requires exact decision/evidence/policy');
      }
    } else errors.push('event.transition: unknown risk transition');
  }
  return result(errors);
}

export function validateEmbeddedClaimChallengeV1(
  input: unknown,
): AgentSoulContractValidationResultV1 {
  const errors: string[] = [];
  if (!isPlainObject(input)) return result(['challenge: expected plain object']);
  exactKeys(input,
    ['schemaVersion', 'challengeId', 'elementRef', 'batchRef', 'targetAgentId',
      'accountableAgentId', 'authorityRootRef', 'principalRef', 'audience', 'channel',
      'proofProtocol', 'nonce', 'idempotencyKey', 'issuedAt', 'expiresAt'],
    ['tenantRef'], 'challenge', errors);
  if (input.schemaVersion !== 1) errors.push('challenge.schemaVersion: unsupported version');
  for (const key of ['challengeId', 'targetAgentId', 'accountableAgentId', 'nonce', 'idempotencyKey'] as const) {
    if (!isNonEmptyString(input[key])) errors.push(`challenge.${key}: expected non-empty string`);
  }
  if (input.targetAgentId !== input.accountableAgentId) {
    errors.push('challenge.accountableAgentId: must equal targetAgentId');
  }
  if (!isStrictRecordRef(input.elementRef, 'embedded_element', false, true)) {
    errors.push('challenge.elementRef: expected embedded_element ref');
  }
  if (!isStrictRecordRef(input.batchRef, 'embedded_batch', false, true)) {
    errors.push('challenge.batchRef: expected embedded_batch ref');
  }
  if (!isExactAuthorityRootRef(input.authorityRootRef)) {
    errors.push('challenge.authorityRootRef: malformed or extra fields');
  }
  if (!isStrictRecordRef(input.principalRef, undefined, false, true)) {
    errors.push('challenge.principalRef: expected known ref');
  }
  if (input.tenantRef !== undefined && !isStrictRecordRef(input.tenantRef, undefined, false, true)) {
    errors.push('challenge.tenantRef: expected known ref');
  }
  if (!isSortedUniqueStrings(input.audience)) errors.push('challenge.audience: expected canonical non-empty set');
  if (!isEnumValue(input.channel, EMBEDDED_CLAIM_CHANNELS_V1)) errors.push('challenge.channel: unknown value');
  if (!isEnumValue(input.proofProtocol, EMBEDDED_CLAIM_PROOF_PROTOCOLS_V1)) {
    errors.push('challenge.proofProtocol: unknown value');
  }
  if (!isCanonicalTimestamp(input.issuedAt) || !isCanonicalTimestamp(input.expiresAt)) {
    errors.push('challenge.issuedAt/expiresAt: expected canonical timestamps');
  } else {
    const ttl = Date.parse(input.expiresAt) - Date.parse(input.issuedAt);
    if (ttl <= 0 || ttl > 60_000) errors.push('challenge.expiresAt: TTL must be in (0, 60s]');
  }
  return result(errors);
}

export function validateEmbeddedLocatorV1(input: unknown): AgentSoulContractValidationResultV1 {
  const errors: string[] = [];
  if (!isPlainObject(input)) return result(['locator: expected plain object']);
  exactKeys(input, ['schemaVersion', 'opaqueLocator', 'channel'], ['expiresAt'], 'locator', errors);
  if (input.schemaVersion !== 1) errors.push('locator.schemaVersion: unsupported version');
  if (!isNonEmptyString(input.opaqueLocator)) errors.push('locator.opaqueLocator: expected opaque string');
  if (!['mobile-qr', 'web-qr'].includes(String(input.channel))) errors.push('locator.channel: QR only');
  if (input.expiresAt !== undefined && !isCanonicalTimestamp(input.expiresAt)) {
    errors.push('locator.expiresAt: expected canonical timestamp');
  }
  return result(errors);
}

function validateBase64Url(value: unknown, path: string, errors: string[], minimumLength = 1): void {
  if (typeof value !== 'string' || value.length < minimumLength || !BASE64URL_PATTERN.test(value) || value.includes('=')) {
    errors.push(`${path}: expected unpadded base64url`);
  }
}

export function validateAesSunClaimProofV1(input: unknown): AgentSoulContractValidationResultV1 {
  const errors: string[] = [];
  if (!isPlainObject(input)) return result(['proof: expected plain object']);
  exactKeys(input,
    ['schemaVersion', 'protocol', 'challengeId', 'elementRef', 'batchRef', 'keyVersion',
      'counter', 'sunMessage', 'mac', 'collectedAt'], [], 'proof', errors);
  if (input.schemaVersion !== 1 || input.protocol !== 'aes-sun') errors.push('proof: wrong version or protocol');
  if (!isNonEmptyString(input.challengeId)) errors.push('proof.challengeId: expected non-empty string');
  if (!isStrictRecordRef(input.elementRef, 'embedded_element', false, true)) errors.push('proof.elementRef: wrong ref');
  if (!isStrictRecordRef(input.batchRef, 'embedded_batch', false, true)) errors.push('proof.batchRef: wrong ref');
  if (!isPositiveInteger(input.keyVersion)) errors.push('proof.keyVersion: expected positive integer');
  if (typeof input.counter !== 'string' || !UINT64_PATTERN.test(input.counter) ||
      BigInt(input.counter) > 18_446_744_073_709_551_615n) {
    errors.push('proof.counter: expected canonical uint64 decimal string');
  }
  validateBase64Url(input.sunMessage, 'proof.sunMessage', errors);
  validateBase64Url(input.mac, 'proof.mac', errors);
  if (!isCanonicalTimestamp(input.collectedAt)) errors.push('proof.collectedAt: expected canonical timestamp');
  return result(errors);
}

export function validateSignedArtifactBindingV1(
  input: unknown,
  expected: 'certificate' | 'assurance' | 'either' = 'either',
): AgentSoulContractValidationResultV1 {
  const errors: string[] = [];
  if (!isPlainObject(input)) return result(['artifactBinding: expected plain object']);
  exactKeys(input, ['ref', 'canonicalDigest', 'digestProfile'], [], 'artifactBinding', errors);
  const certificate = input.digestProfile === 'sha256-der-chain-lp-v1';
  const assurance = input.digestProfile === 'sha256-rfc8785-assurance-evidence-v1';
  if (!certificate && !assurance) errors.push('artifactBinding.digestProfile: unknown profile');
  if (expected === 'certificate' && !certificate) errors.push('artifactBinding.digestProfile: certificate profile required');
  if (expected === 'assurance' && !assurance) errors.push('artifactBinding.digestProfile: assurance profile required');
  const expectedType = certificate ? 'embedded_certificate' : assurance ? 'assurance_evidence' : undefined;
  if (!isStrictRecordRef(input.ref, expectedType, true, true)) {
    errors.push('artifactBinding.ref: expected exact-version immutable ref without embedded digest');
  }
  if (typeof input.canonicalDigest !== 'string' || !SHA256_HEX_PATTERN.test(input.canonicalDigest)) {
    errors.push('artifactBinding.canonicalDigest: expected lower-case SHA-256');
  }
  return result(errors);
}

export function validateEcdsaChallengeClaimProofV1(
  input: unknown,
): AgentSoulContractValidationResultV1 {
  const errors: string[] = [];
  if (!isPlainObject(input)) return result(['proof: expected plain object']);
  exactKeys(input,
    ['schemaVersion', 'protocol', 'challengeId', 'challengeDigest', 'digestProfile',
      'signerKeyRef', 'keyVersion', 'algorithm', 'signatureEncoding', 'signature', 'signedAt'],
    ['certificateBinding'], 'proof', errors);
  if (input.schemaVersion !== 1 || input.protocol !== 'ecdsa-challenge') errors.push('proof: wrong version or protocol');
  if (!isNonEmptyString(input.challengeId)) errors.push('proof.challengeId: expected non-empty string');
  if (typeof input.challengeDigest !== 'string' || !SHA256_HEX_PATTERN.test(input.challengeDigest)) {
    errors.push('proof.challengeDigest: expected lower-case SHA-256');
  }
  if (input.digestProfile !== 'sha256-rfc8785-v1') errors.push('proof.digestProfile: unsupported profile');
  if (!isStrictRecordRef(input.signerKeyRef, 'embedded_key', true, true)) errors.push('proof.signerKeyRef: wrong ref');
  if (!isPositiveInteger(input.keyVersion) ||
      (isPlainObject(input.signerKeyRef) && input.signerKeyRef.version !== input.keyVersion)) {
    errors.push('proof.keyVersion: must match signer ref version');
  }
  if (!isEnumValue(input.algorithm, SHELL_COMMAND_SIGNATURE_ALGORITHMS_V1)) errors.push('proof.algorithm: unknown');
  if (!isEnumValue(input.signatureEncoding, SHELL_COMMAND_SIGNATURE_ENCODINGS_V1)) errors.push('proof.signatureEncoding: unknown');
  validateSignatureEncoding(input.signature, input.algorithm, input.signatureEncoding, 'proof.signature', errors);
  if (input.certificateBinding !== undefined) {
    const validation = validateSignedArtifactBindingV1(input.certificateBinding, 'certificate');
    errors.push(...validation.errors.map((error) => `proof.certificateBinding: ${error}`));
  }
  if (!isCanonicalTimestamp(input.signedAt)) errors.push('proof.signedAt: expected canonical timestamp');
  return result(errors);
}

export function validateEmbeddedClaimProofV1(input: unknown): AgentSoulContractValidationResultV1 {
  if (!isPlainObject(input)) return result(['proof: expected plain object']);
  if (input.protocol === 'aes-sun') return validateAesSunClaimProofV1(input);
  if (input.protocol === 'ecdsa-challenge') return validateEcdsaChallengeClaimProofV1(input);
  return result(['proof.protocol: unknown protocol']);
}

export function computeEmbeddedClaimChallengeDigestV1(challenge: EmbeddedClaimChallengeV1): string {
  const validation = validateEmbeddedClaimChallengeV1(challenge);
  if (!validation.valid) throw new Error(validation.errors.join('; '));
  return computeEmbeddedCanonicalSha256V1(challenge);
}

export function validateEmbeddedClaimRequestDigestPayloadV1(
  input: unknown,
): AgentSoulContractValidationResultV1 {
  const errors: string[] = [];
  if (!isPlainObject(input)) return result(['claimDigestPayload: expected plain object']);
  exactKeys(input, ['schemaVersion', 'domain', 'challenge', 'proof', 'requestedCapabilities', 'runtimeRef'], [], 'claimDigestPayload', errors);
  if (input.schemaVersion !== 1 || input.domain !== 'agentrix:embedded-claim-request:v1') {
    errors.push('claimDigestPayload: wrong version or domain');
  }
  const challenge = validateEmbeddedClaimChallengeV1(input.challenge);
  errors.push(...challenge.errors.map((error) => `claimDigestPayload.challenge: ${error}`));
  const proof = validateEmbeddedClaimProofV1(input.proof);
  errors.push(...proof.errors.map((error) => `claimDigestPayload.proof: ${error}`));
  if (!isSortedUniqueStrings(input.requestedCapabilities)) {
    errors.push('claimDigestPayload.requestedCapabilities: expected canonical non-empty set');
  }
  if (!isStrictRecordRef(input.runtimeRef, 'runtime', false, true)) {
    errors.push('claimDigestPayload.runtimeRef: expected runtime ref');
  }
  validateClaimProofBinding(input.challenge, input.proof, errors, 'claimDigestPayload');
  return result(errors);
}

function validateClaimProofBinding(
  challenge: unknown,
  proof: unknown,
  errors: string[],
  path: string,
): void {
  if (!isPlainObject(challenge) || !isPlainObject(proof)) return;
  if (proof.protocol !== challenge.proofProtocol || proof.challengeId !== challenge.challengeId) {
    errors.push(`${path}.proof: protocol/challenge mismatch`);
  }
  if (proof.protocol === 'aes-sun') {
    if (!sameRef(proof.elementRef, challenge.elementRef) || !sameRef(proof.batchRef, challenge.batchRef)) {
      errors.push(`${path}.proof: AES element/batch mismatch`);
    }
    if (isCanonicalTimestamp(proof.collectedAt) && isCanonicalTimestamp(challenge.issuedAt) &&
        isCanonicalTimestamp(challenge.expiresAt) &&
        (Date.parse(proof.collectedAt) < Date.parse(challenge.issuedAt) ||
         Date.parse(proof.collectedAt) > Date.parse(challenge.expiresAt))) {
      errors.push(`${path}.proof.collectedAt: outside challenge window`);
    }
  }
  if (proof.protocol === 'ecdsa-challenge' &&
      validateEmbeddedClaimChallengeV1(challenge).valid) {
    const expected = computeEmbeddedCanonicalSha256V1(challenge);
    if (typeof proof.challengeDigest !== 'string' || !constantTimeEqual(proof.challengeDigest, expected)) {
      errors.push(`${path}.proof.challengeDigest: challenge digest mismatch`);
    }
  }
}

function sameRef(left: unknown, right: unknown): boolean {
  return isStrictRecordRef(left, undefined, false, false) &&
    isStrictRecordRef(right, undefined, false, false) &&
    left.type === right.type && left.id === right.id && left.version === right.version &&
    canonicalizeJson(left.digest ?? null) === canonicalizeJson(right.digest ?? null);
}

export function projectEmbeddedClaimRequestDigestPayloadV1(
  command: EmbeddedClaimCommandV1,
): EmbeddedClaimRequestDigestPayloadV1 {
  const validation = validateEmbeddedClaimCommandV1(command);
  if (!validation.valid) throw new Error(validation.errors.join('; '));
  return {
    schemaVersion: 1,
    domain: 'agentrix:embedded-claim-request:v1',
    challenge: command.challenge,
    proof: command.proof,
    requestedCapabilities: command.requestedCapabilities,
    runtimeRef: command.runtimeRef,
  };
}

export function computeEmbeddedClaimRequestDigestV1(command: EmbeddedClaimCommandV1): string {
  return computeEmbeddedCanonicalSha256V1(projectEmbeddedClaimRequestDigestPayloadV1(command));
}

export function validateEmbeddedClaimCommandV1(input: unknown): AgentSoulContractValidationResultV1 {
  const errors: string[] = [];
  if (!isPlainObject(input)) return result(['claimCommand: expected plain object']);
  exactKeys(input, ['schemaVersion', 'challenge', 'ownerAuthorizationRef', 'proof', 'requestedCapabilities', 'runtimeRef'], [], 'claimCommand', errors);
  if (input.schemaVersion !== 1) errors.push('claimCommand.schemaVersion: unsupported version');
  const challenge = validateEmbeddedClaimChallengeV1(input.challenge);
  errors.push(...challenge.errors.map((error) => `claimCommand.challenge: ${error}`));
  const proof = validateEmbeddedClaimProofV1(input.proof);
  errors.push(...proof.errors.map((error) => `claimCommand.proof: ${error}`));
  if (!isStrictRecordRef(input.ownerAuthorizationRef, 'authority_decision', true, true)) {
    errors.push('claimCommand.ownerAuthorizationRef: expected exact-version authority decision');
  }
  if (!isSortedUniqueStrings(input.requestedCapabilities)) {
    errors.push('claimCommand.requestedCapabilities: expected canonical non-empty set');
  }
  if (!isStrictRecordRef(input.runtimeRef, 'runtime', false, true)) {
    errors.push('claimCommand.runtimeRef: expected runtime ref');
  }
  validateClaimProofBinding(input.challenge, input.proof, errors, 'claimCommand');
  return result(errors);
}

export function validateEmbeddedClaimDecisionV1(input: unknown): AgentSoulContractValidationResultV1 {
  const errors: string[] = [];
  if (!isPlainObject(input)) return result(['claimDecision: expected plain object']);
  const required = ['schemaVersion', 'decisionId', 'challengeId', 'requestDigest', 'reasonCode', 'decidedAt', 'status'];
  const optional: string[] = [];
  if (input.status === 'accepted') required.push('reservationRef', 'bindingRef');
  else if (input.status === 'pending-reconciliation') {
    required.push('reservationRef'); optional.push('bindingRef');
  } else if (input.status !== 'rejected' && input.status !== 'conflict') {
    errors.push('claimDecision.status: unknown value');
  }
  exactKeys(input, required, optional, 'claimDecision', errors);
  if (input.schemaVersion !== 1) errors.push('claimDecision.schemaVersion: unsupported version');
  for (const key of ['decisionId', 'challengeId', 'reasonCode'] as const) {
    if (!isNonEmptyString(input[key])) errors.push(`claimDecision.${key}: expected non-empty string`);
  }
  if (typeof input.requestDigest !== 'string' || !SHA256_HEX_PATTERN.test(input.requestDigest)) {
    errors.push('claimDecision.requestDigest: expected lower-case SHA-256');
  }
  if (!isCanonicalTimestamp(input.decidedAt)) errors.push('claimDecision.decidedAt: expected canonical timestamp');
  if (input.reservationRef !== undefined &&
      !isStrictRecordRef(input.reservationRef, 'embedded_association_reservation', true, true)) {
    errors.push('claimDecision.reservationRef: wrong ref');
  }
  if (input.bindingRef !== undefined &&
      !isStrictRecordRef(input.bindingRef, 'shell_session_binding', true, true)) {
    errors.push('claimDecision.bindingRef: wrong ref');
  }
  return result(errors);
}

const FENCE_KIND_REF_TYPES: Record<RevocableAggregateKindV1, string> = {
  device: 'device_identity',
  element: 'embedded_element',
  batch: 'embedded_batch',
  key: 'embedded_key',
  certificate: 'embedded_certificate',
  'shell-binding': 'shell_session_binding',
  'host-binding': 'host_assurance_binding',
};

function compareFenceEntries(left: RevocationFenceEntryV1, right: RevocationFenceEntryV1): number {
  const kindDifference = REVOCABLE_AGGREGATE_KINDS_V1.indexOf(left.aggregateKind) -
    REVOCABLE_AGGREGATE_KINDS_V1.indexOf(right.aggregateKind);
  if (kindDifference !== 0) return kindDifference;
  const typeDifference = compareUtf8(left.aggregateRef.type, right.aggregateRef.type);
  if (typeDifference !== 0) return typeDifference;
  const idDifference = compareUtf8(left.aggregateRef.id, right.aggregateRef.id);
  if (idDifference !== 0) return idDifference;
  return (left.aggregateRef.version ?? 0) - (right.aggregateRef.version ?? 0);
}

export function validateRevocationFenceSetV1(
  input: unknown,
  context: RevocationFenceValidationContextV1 = {},
): AgentSoulContractValidationResultV1 {
  const errors: string[] = [];
  if (!isPlainObject(input)) return result(['fenceSet: expected plain object']);
  exactKeys(input, ['schemaVersion', 'policyVersion', 'entries'], [], 'fenceSet', errors);
  if (input.schemaVersion !== 1) errors.push('fenceSet.schemaVersion: unsupported version');
  if (!isNonEmptyString(input.policyVersion)) errors.push('fenceSet.policyVersion: expected non-empty string');
  if (!Array.isArray(input.entries) || input.entries.length === 0) {
    errors.push('fenceSet.entries: expected non-empty canonical set');
  } else {
    const entries: RevocationFenceEntryV1[] = [];
    for (let index = 0; index < input.entries.length; index += 1) {
      const entry = input.entries[index];
      if (!isPlainObject(entry)) {
        errors.push(`fenceSet.entries[${index}]: expected plain object`); continue;
      }
      exactKeys(entry, ['aggregateKind', 'aggregateRef', 'observedEpoch'], [], `fenceSet.entries[${index}]`, errors);
      if (!isEnumValue(entry.aggregateKind, REVOCABLE_AGGREGATE_KINDS_V1)) {
        errors.push(`fenceSet.entries[${index}].aggregateKind: unknown`); continue;
      }
      const requireVersion = entry.aggregateKind === 'shell-binding';
      if (!isStrictRecordRef(entry.aggregateRef, FENCE_KIND_REF_TYPES[entry.aggregateKind], requireVersion, true)) {
        errors.push(`fenceSet.entries[${index}].aggregateRef: kind/type/version mismatch`);
      }
      if (!isNonNegativeInteger(entry.observedEpoch)) {
        errors.push(`fenceSet.entries[${index}].observedEpoch: expected non-negative integer`);
      }
      entries.push(entry as unknown as RevocationFenceEntryV1);
    }
    for (let index = 1; index < entries.length; index += 1) {
      if (compareFenceEntries(entries[index - 1], entries[index]) >= 0) {
        errors.push('fenceSet.entries: duplicate or non-canonical order'); break;
      }
    }
    if (context.expectedEntries !== undefined) {
      if (context.expectedEntries.length !== entries.length) errors.push('fenceSet.entries: applicable set size mismatch');
      for (let index = 0; index < context.expectedEntries.length; index += 1) {
        const expected = context.expectedEntries[index];
        const actual = entries[index];
        if (actual === undefined || actual.aggregateKind !== expected.aggregateKind ||
            !sameRef(actual.aggregateRef, expected.aggregateRef)) {
          errors.push(`fenceSet.entries[${index}]: applicable aggregate mismatch`);
        } else if (expected.currentEpoch !== undefined && actual.observedEpoch !== expected.currentEpoch) {
          errors.push(`fenceSet.entries[${index}]: stale epoch`);
        }
      }
    }
  }
  return result(errors);
}

export function computeRevocationFenceSetDigestV1(fenceSet: RevocationFenceSetV1): string {
  const validation = validateRevocationFenceSetV1(fenceSet);
  if (!validation.valid) throw new Error(validation.errors.join('; '));
  return computeEmbeddedCanonicalSha256V1(fenceSet);
}

export function validateRevocationFenceBindingV1(
  input: unknown,
  context: RevocationFenceValidationContextV1 = {},
): AgentSoulContractValidationResultV1 {
  const errors: string[] = [];
  if (!isPlainObject(input)) return result(['fence: expected plain object']);
  exactKeys(input, ['schemaVersion', 'fenceSet', 'fenceSetDigest', 'digestProfile', 'downstreamFenceToken'], [], 'fence', errors);
  if (input.schemaVersion !== 1) errors.push('fence.schemaVersion: unsupported version');
  const setValidation = validateRevocationFenceSetV1(input.fenceSet, context);
  errors.push(...setValidation.errors.map((error) => `fence.fenceSet: ${error}`));
  if (input.digestProfile !== 'sha256-rfc8785-v1') errors.push('fence.digestProfile: unsupported profile');
  if (typeof input.fenceSetDigest !== 'string' || !SHA256_HEX_PATTERN.test(input.fenceSetDigest)) {
    errors.push('fence.fenceSetDigest: expected lower-case SHA-256');
  } else if (setValidation.valid && isPlainObject(input.fenceSet)) {
    const expected = computeEmbeddedCanonicalSha256V1(input.fenceSet);
    if (!constantTimeEqual(input.fenceSetDigest, expected)) errors.push('fence.fenceSetDigest: digest mismatch');
  }
  validateBase64Url(input.downstreamFenceToken, 'fence.downstreamFenceToken', errors, 43);
  return result(errors);
}

export function validateEmbeddedAssociationReservationV1(
  input: unknown,
  context: RevocationFenceValidationContextV1 = {},
): AgentSoulContractValidationResultV1 {
  const errors: string[] = [];
  if (!isPlainObject(input)) return result(['reservation: expected plain object']);
  exactKeys(input,
    ['schemaVersion', 'reservationId', 'claimAttemptRef', 'elementRef', 'targetAgentId',
      'accountableAgentId', 'requestDigest', 'associationFenceToken', 'revocationFence',
      'state', 'createdAt', 'updatedAt', 'expiresAt'], ['bindingRef'], 'reservation', errors);
  if (input.schemaVersion !== 1) errors.push('reservation.schemaVersion: unsupported version');
  for (const key of ['reservationId', 'targetAgentId', 'accountableAgentId'] as const) {
    if (!isNonEmptyString(input[key])) errors.push(`reservation.${key}: expected non-empty string`);
  }
  if (input.targetAgentId !== input.accountableAgentId) errors.push('reservation.accountableAgentId: must equal targetAgentId');
  if (!isStrictRecordRef(input.claimAttemptRef, 'embedded_claim_attempt', true, true)) errors.push('reservation.claimAttemptRef: wrong ref');
  if (!isStrictRecordRef(input.elementRef, 'embedded_element', false, true)) errors.push('reservation.elementRef: wrong ref');
  if (typeof input.requestDigest !== 'string' || !SHA256_HEX_PATTERN.test(input.requestDigest)) errors.push('reservation.requestDigest: invalid');
  validateBase64Url(input.associationFenceToken, 'reservation.associationFenceToken', errors, 43);
  const fence = validateRevocationFenceBindingV1(input.revocationFence, context);
  errors.push(...fence.errors.map((error) => `reservation.revocationFence: ${error}`));
  if (isPlainObject(input.revocationFence) && input.associationFenceToken === input.revocationFence.downstreamFenceToken) {
    errors.push('reservation.associationFenceToken: must be independent from downstream token');
  }
  if (!isEnumValue(input.state, EMBEDDED_ASSOCIATION_RESERVATION_STATES_V1)) errors.push('reservation.state: unknown');
  const bindingStates = ['binding-created', 'committed', 'compensating'];
  if (bindingStates.includes(String(input.state))) {
    if (!isStrictRecordRef(input.bindingRef, 'shell_session_binding', true, true)) errors.push('reservation.bindingRef: required versioned Shell ref');
  } else if (input.bindingRef !== undefined) errors.push('reservation.bindingRef: forbidden in reserved/released');
  for (const key of ['createdAt', 'updatedAt', 'expiresAt'] as const) {
    if (!isCanonicalTimestamp(input[key])) errors.push(`reservation.${key}: expected canonical timestamp`);
  }
  if (isCanonicalTimestamp(input.createdAt) && isCanonicalTimestamp(input.updatedAt) &&
      isCanonicalTimestamp(input.expiresAt) &&
      (Date.parse(input.updatedAt) < Date.parse(input.createdAt) || Date.parse(input.expiresAt) <= Date.parse(input.createdAt))) {
    errors.push('reservation: invalid timestamp ordering');
  }
  return result(errors);
}

function decodeBase64Url(value: string): Uint8Array | undefined {
  if (!BASE64URL_PATTERN.test(value) || value.includes('=')) return undefined;
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
  let bits = 0;
  let bitCount = 0;
  const output: number[] = [];
  for (const character of value) {
    const decoded = alphabet.indexOf(character);
    if (decoded < 0) return undefined;
    bits = (bits << 6) | decoded;
    bitCount += 6;
    if (bitCount >= 8) {
      bitCount -= 8;
      output.push((bits >> bitCount) & 0xff);
      bits &= (1 << bitCount) - 1;
    }
  }
  if (bitCount > 0 && bits !== 0) return undefined;
  return new Uint8Array(output);
}

const HALF_CURVE_ORDER: Record<ShellCommandSignatureAlgorithmV1, bigint> = {
  'ecdsa-secp256k1-sha256': 0x7fffffffffffffffffffffffffffffff5d576e7357a4501ddfe92f46681b20a0n,
  'ecdsa-p256-sha256': 0x7fffffff800000007fffffffffffffffde737d56d38bcf4279dce5617e3192a8n,
};

function bytesToBigInt(bytes: Uint8Array): bigint {
  let value = 0n;
  for (const byte of bytes) value = (value << 8n) | BigInt(byte);
  return value;
}

function parseDerEcdsa(bytes: Uint8Array): { r: Uint8Array; s: Uint8Array } | undefined {
  if (bytes.length < 8 || bytes[0] !== 0x30 || bytes[1] >= 0x80 || bytes[1] !== bytes.length - 2) return undefined;
  let offset = 2;
  const readInteger = (): Uint8Array | undefined => {
    if (bytes[offset++] !== 0x02) return undefined;
    const length = bytes[offset++];
    if (length === 0 || length >= 0x80 || offset + length > bytes.length) return undefined;
    const value = bytes.slice(offset, offset + length);
    offset += length;
    if ((value[0] & 0x80) !== 0) return undefined;
    if (value.length > 1 && value[0] === 0 && (value[1] & 0x80) === 0) return undefined;
    return value[0] === 0 ? value.slice(1) : value;
  };
  const r = readInteger();
  const s = readInteger();
  if (r === undefined || s === undefined || offset !== bytes.length || r.length > 32 || s.length > 32) return undefined;
  return { r, s };
}

function validateSignatureEncoding(
  signature: unknown,
  algorithm: unknown,
  encoding: unknown,
  path: string,
  errors: string[],
): void {
  if (typeof signature !== 'string') { errors.push(`${path}: expected string`); return; }
  const bytes = decodeBase64Url(signature);
  if (bytes === undefined || !isEnumValue(algorithm, SHELL_COMMAND_SIGNATURE_ALGORITHMS_V1) ||
      !isEnumValue(encoding, SHELL_COMMAND_SIGNATURE_ENCODINGS_V1)) {
    errors.push(`${path}: invalid base64url/algorithm/encoding`); return;
  }
  let r: Uint8Array;
  let s: Uint8Array;
  if (encoding === 'base64url-p1363') {
    if (bytes.length !== 64) { errors.push(`${path}: P1363 signature must be 64 bytes`); return; }
    r = bytes.slice(0, 32);
    s = bytes.slice(32);
  } else {
    const parsed = parseDerEcdsa(bytes);
    if (parsed === undefined) { errors.push(`${path}: non-minimal DER signature`); return; }
    r = parsed.r;
    s = parsed.s;
  }
  // Both scalars must be in [1, n); a zero r or s is never a valid ECDSA signature.
  const rScalar = bytesToBigInt(r);
  const sScalar = bytesToBigInt(s);
  if (rScalar === 0n) errors.push(`${path}: zero-R signature`);
  if (sScalar === 0n) errors.push(`${path}: zero-S signature`);
  if (sScalar > HALF_CURVE_ORDER[algorithm]) errors.push(`${path}: high-S signature`);
}

function validateStrictShellEnvelope(input: unknown, errors: string[], path: string): void {
  if (!isPlainObject(input)) { errors.push(`${path}: expected plain object`); return; }
  exactKeys(input, ['schemaVersion', 'bindingId', 'bindingVersion', 'nonceDomain', 'nonce',
    'idempotencyKey', 'requestDigest', 'issuedAt', 'expiresAt'], [], path, errors);
  const validation = validateShellCommandEnvelopeV1(input);
  errors.push(...validation.errors.map((error) => `${path}: ${error}`));
  if (!isCanonicalTimestamp(input.issuedAt) || !isCanonicalTimestamp(input.expiresAt)) {
    errors.push(`${path}: signed envelope timestamps must be canonical`);
  }
}

export function validateSignedAssuranceEvidenceDigestPayloadV1(
  input: unknown,
): AgentSoulContractValidationResultV1 {
  const errors: string[] = [];
  if (!isPlainObject(input)) return result(['assuranceDigestPayload: expected plain object']);
  exactKeys(input, ['schemaVersion', 'domain', 'evidence'], [], 'assuranceDigestPayload', errors);
  if (input.schemaVersion !== 1 || input.domain !== 'agentrix:assurance-evidence-binding:v1') {
    errors.push('assuranceDigestPayload: wrong version or domain');
  }
  if (!isPlainObject(input.evidence)) errors.push('assuranceDigestPayload.evidence: expected plain object');
  else {
    exactKeys(input.evidence,
      ['mechanism', 'state', 'scope', 'evidenceLevel', 'environment', 'sourceRefs', 'fresh', 'canProve', 'cannotProve'],
      ['verifierRef', 'verifiedAt', 'nextUpdateAt'], 'assuranceDigestPayload.evidence', errors);
    const validation = validateAssuranceMechanismEvidenceV1(input.evidence);
    errors.push(...validation.errors.map((error) => `assuranceDigestPayload.evidence: ${error}`));
    for (const key of ['scope', 'canProve', 'cannotProve'] as const) {
      if (!isSortedUniqueStrings(input.evidence[key], true)) errors.push(`assuranceDigestPayload.evidence.${key}: non-canonical set`);
    }
    if (!Array.isArray(input.evidence.sourceRefs) ||
        (input.evidence.sourceRefs.length > 0 && !isSortedUniqueRefs(input.evidence.sourceRefs))) {
      errors.push('assuranceDigestPayload.evidence.sourceRefs: non-canonical ref set');
    }
    for (const key of ['verifiedAt', 'nextUpdateAt'] as const) {
      if (input.evidence[key] !== undefined && !isCanonicalTimestamp(input.evidence[key])) {
        errors.push(`assuranceDigestPayload.evidence.${key}: expected canonical timestamp`);
      }
    }
  }
  return result(errors);
}

export function computeSignedAssuranceEvidenceDigestV1(
  evidence: AssuranceMechanismEvidenceV1,
): string {
  const normalized: AssuranceMechanismEvidenceV1 = {
    ...evidence,
    scope: [...evidence.scope].sort(compareUtf8),
    sourceRefs: [...evidence.sourceRefs].sort(compareRefs),
    canProve: [...evidence.canProve].sort(compareUtf8),
    cannotProve: [...evidence.cannotProve].sort(compareUtf8),
  };
  const payload: SignedAssuranceEvidenceDigestPayloadV1 = {
    schemaVersion: 1,
    domain: 'agentrix:assurance-evidence-binding:v1',
    evidence: normalized,
  };
  const validation = validateSignedAssuranceEvidenceDigestPayloadV1(payload);
  if (!validation.valid) throw new Error(validation.errors.join('; '));
  return computeEmbeddedCanonicalSha256V1(payload);
}

function uint32be(value: number): Uint8Array {
  if (!Number.isSafeInteger(value) || value < 0 || value > 0xffffffff) throw new Error('uint32 overflow');
  return new Uint8Array([(value >>> 24) & 0xff, (value >>> 16) & 0xff, (value >>> 8) & 0xff, value & 0xff]);
}

function concatBytes(parts: readonly Uint8Array[]): Uint8Array {
  const length = parts.reduce((total, part) => total + part.length, 0);
  const output = new Uint8Array(length);
  let offset = 0;
  for (const part of parts) { output.set(part, offset); offset += part.length; }
  return output;
}

export function computeCertificateChainDigestV1(chainLeafToRoot: readonly Uint8Array[]): string {
  if (chainLeafToRoot.length === 0) throw new Error('certificate chain must be non-empty');
  const parts: Uint8Array[] = [
    utf8Encode('agentrix:certificate-chain:v1'),
    new Uint8Array([0]),
    uint32be(chainLeafToRoot.length),
  ];
  for (const der of chainLeafToRoot) {
    if (!(der instanceof Uint8Array) || der.length === 0) throw new Error('certificate DER must be non-empty');
    parts.push(uint32be(der.length), der);
  }
  return sha256Hex(concatBytes(parts));
}

export function validateSignedShellCommandSigningPayloadV1(
  input: unknown,
): AgentSoulContractValidationResultV1 {
  const errors: string[] = [];
  if (!isPlainObject(input)) return result(['signingPayload: expected plain object']);
  exactKeys(input,
    ['wrapperSchemaVersion', 'domain', 'canonicalizationProfile', 'digestProfile',
      'signatureEncoding', 'envelope', 'signerRef', 'keyVersion', 'algorithm'],
    ['certificateChain', 'attestationEvidence'], 'signingPayload', errors);
  if (input.wrapperSchemaVersion !== 1 || input.domain !== 'agentrix:shell-command:v1') {
    errors.push('signingPayload: wrong version or domain');
  }
  if (input.canonicalizationProfile !== 'rfc8785-utf8-sha256-v1') errors.push('signingPayload.canonicalizationProfile: unsupported');
  if (input.digestProfile !== 'sha256-rfc8785-v1') errors.push('signingPayload.digestProfile: unsupported');
  if (!isEnumValue(input.signatureEncoding, SHELL_COMMAND_SIGNATURE_ENCODINGS_V1)) errors.push('signingPayload.signatureEncoding: unknown');
  if (!isEnumValue(input.algorithm, SHELL_COMMAND_SIGNATURE_ALGORITHMS_V1)) errors.push('signingPayload.algorithm: unknown');
  validateStrictShellEnvelope(input.envelope, errors, 'signingPayload.envelope');
  if (!isNonEmptyString(input.signerRef)) errors.push('signingPayload.signerRef: expected non-empty string');
  if (!isPositiveInteger(input.keyVersion)) errors.push('signingPayload.keyVersion: expected positive integer');
  if (input.certificateChain !== undefined) {
    const validation = validateSignedArtifactBindingV1(input.certificateChain, 'certificate');
    errors.push(...validation.errors.map((error) => `signingPayload.certificateChain: ${error}`));
  }
  if (input.attestationEvidence !== undefined) {
    const validation = validateSignedArtifactBindingV1(input.attestationEvidence, 'assurance');
    errors.push(...validation.errors.map((error) => `signingPayload.attestationEvidence: ${error}`));
  }
  return result(errors);
}

export function computeSignedShellCommandPayloadDigestV1(
  payload: SignedShellCommandSigningPayloadV1,
): string {
  const validation = validateSignedShellCommandSigningPayloadV1(payload);
  if (!validation.valid) throw new Error(validation.errors.join('; '));
  return computeEmbeddedCanonicalSha256V1(payload);
}

export function validateSignedShellCommandV1(input: unknown): AgentSoulContractValidationResultV1 {
  const errors: string[] = [];
  if (!isPlainObject(input)) return result(['signedCommand: expected plain object']);
  exactKeys(input, ['signingPayload', 'signature'], [], 'signedCommand', errors);
  const payload = validateSignedShellCommandSigningPayloadV1(input.signingPayload);
  errors.push(...payload.errors.map((error) => `signedCommand.signingPayload: ${error}`));
  if (isPlainObject(input.signingPayload)) {
    validateSignatureEncoding(input.signature, input.signingPayload.algorithm,
      input.signingPayload.signatureEncoding, 'signedCommand.signature', errors);
  } else errors.push('signedCommand.signature: payload unavailable');
  return result(errors);
}

function claimKeysEqual(left: unknown, right: ShellCommandClaimKeysV1): boolean {
  if (!isPlainObject(left)) return false;
  if (Object.keys(left).sort().join(',') !== 'idempotencyKey,nonceKey') return false;
  const nonceKey = left.nonceKey;
  const idempotencyKey = left.idempotencyKey;
  return Array.isArray(nonceKey) && Array.isArray(idempotencyKey) &&
    canonicalizeJson(nonceKey) === canonicalizeJson(right.nonceKey) &&
    canonicalizeJson(idempotencyKey) === canonicalizeJson(right.idempotencyKey);
}

export function validateShellCommandReservationCommandV1(
  input: unknown,
  context: RevocationFenceValidationContextV1 = {},
): AgentSoulContractValidationResultV1 {
  const errors: string[] = [];
  if (!isPlainObject(input)) return result(['shellReservation: expected plain object']);
  exactKeys(input, ['schemaVersion', 'signedCommand', 'claimKeys', 'revocationFence', 'downstreamIdempotencyRef'], [], 'shellReservation', errors);
  if (input.schemaVersion !== 1) errors.push('shellReservation.schemaVersion: unsupported version');
  const command = validateSignedShellCommandV1(input.signedCommand);
  errors.push(...command.errors.map((error) => `shellReservation.signedCommand: ${error}`));
  if (isPlainObject(input.signedCommand) && isPlainObject(input.signedCommand.signingPayload) &&
      isPlainObject(input.signedCommand.signingPayload.envelope)) {
    const expected = getShellCommandClaimKeysV1(
      input.signedCommand.signingPayload.envelope as unknown as ShellCommandEnvelopeV1,
    );
    if (!claimKeysEqual(input.claimKeys, expected)) errors.push('shellReservation.claimKeys: envelope tuple mismatch');
  }
  const fence = validateRevocationFenceBindingV1(input.revocationFence, context);
  errors.push(...fence.errors.map((error) => `shellReservation.revocationFence: ${error}`));
  if (!isStrictRecordRef(input.downstreamIdempotencyRef, 'downstream_idempotency', true, true)) {
    errors.push('shellReservation.downstreamIdempotencyRef: wrong ref');
  }
  return result(errors);
}

export function validateShellCommandRevocationFenceCompanionV1(
  input: unknown,
  context: RevocationFenceValidationContextV1 = {},
): AgentSoulContractValidationResultV1 {
  const errors: string[] = [];
  if (!isPlainObject(input)) return result(['shellFenceCompanion: expected plain object']);
  exactKeys(input, ['schemaVersion', 'journalEntryRef', 'revocationFence'], [], 'shellFenceCompanion', errors);
  if (input.schemaVersion !== 1) errors.push('shellFenceCompanion.schemaVersion: unsupported version');
  if (!isStrictRecordRef(input.journalEntryRef, 'shell_command_journal_entry', true, true)) errors.push('shellFenceCompanion.journalEntryRef: wrong ref');
  const fence = validateRevocationFenceBindingV1(input.revocationFence, context);
  errors.push(...fence.errors.map((error) => `shellFenceCompanion.revocationFence: ${error}`));
  return result(errors);
}

export function validateHostEnrollmentReservationV1(
  input: unknown,
  context: RevocationFenceValidationContextV1 = {},
): AgentSoulContractValidationResultV1 {
  const errors: string[] = [];
  if (!isPlainObject(input)) return result(['hostReservation: expected plain object']);
  exactKeys(input, ['schemaVersion', 'reservationId', 'requestedHostRef', 'revocationFence', 'state', 'createdAt', 'updatedAt'], [], 'hostReservation', errors);
  if (input.schemaVersion !== 1) errors.push('hostReservation.schemaVersion: unsupported version');
  if (!isNonEmptyString(input.reservationId)) errors.push('hostReservation.reservationId: expected non-empty string');
  if (!isStrictRecordRef(input.requestedHostRef, 'host_assurance_binding', false, true)) errors.push('hostReservation.requestedHostRef: wrong ref');
  const fence = validateRevocationFenceBindingV1(input.revocationFence, context);
  errors.push(...fence.errors.map((error) => `hostReservation.revocationFence: ${error}`));
  if (!isEnumValue(input.state, HOST_ENROLLMENT_RESERVATION_STATES_V1)) errors.push('hostReservation.state: unknown');
  if (!isCanonicalTimestamp(input.createdAt) || !isCanonicalTimestamp(input.updatedAt) ||
      (isCanonicalTimestamp(input.createdAt) && isCanonicalTimestamp(input.updatedAt) && Date.parse(input.updatedAt) < Date.parse(input.createdAt))) {
    errors.push('hostReservation: invalid timestamps');
  }
  return result(errors);
}

function parseFirmwareVersion(value: unknown): readonly [number, number, number] | undefined {
  if (typeof value !== 'string') return undefined;
  const match = FIRMWARE_VERSION_PATTERN.exec(value);
  if (match === null) return undefined;
  const parts = [Number(match[1]), Number(match[2]), Number(match[3])] as const;
  return parts.every((part) => part <= 2_147_483_647) ? parts : undefined;
}

function compareFirmwareVersions(
  left: readonly [number, number, number],
  right: readonly [number, number, number],
): number {
  for (let index = 0; index < 3; index += 1) {
    if (left[index] !== right[index]) return left[index] - right[index];
  }
  return 0;
}

export function validateEmbeddedFirmwareVersionV1(value: unknown): AgentSoulContractValidationResultV1 {
  return result(parseFirmwareVersion(value) === undefined
    ? ['firmwareVersion: expected canonical major.minor.patch within int32'] : []);
}

export function parseEmbeddedFirmwareRangeV1(
  value: unknown,
): { lower: readonly [number, number, number]; upper: readonly [number, number, number] } | undefined {
  if (typeof value !== 'string') return undefined;
  const match = FIRMWARE_RANGE_PATTERN.exec(value);
  if (match === null) return undefined;
  const lower = parseFirmwareVersion(match[1]);
  const upper = parseFirmwareVersion(match[2]);
  if (lower === undefined || upper === undefined || compareFirmwareVersions(lower, upper) > 0) return undefined;
  return { lower, upper };
}

export function validateEmbeddedFirmwareRangeV1(value: unknown): AgentSoulContractValidationResultV1 {
  return result(parseEmbeddedFirmwareRangeV1(value) === undefined
    ? ['firmwareRange: expected canonical inclusive [L,U] with L <= U'] : []);
}

export function embeddedFirmwareRangeContainsV1(range: EmbeddedFirmwareRangeV1, version: EmbeddedFirmwareVersionV1): boolean {
  const parsedRange = parseEmbeddedFirmwareRangeV1(range);
  const parsedVersion = parseFirmwareVersion(version);
  return parsedRange !== undefined && parsedVersion !== undefined &&
    compareFirmwareVersions(parsedRange.lower, parsedVersion) <= 0 &&
    compareFirmwareVersions(parsedVersion, parsedRange.upper) <= 0;
}

export function validateEmbeddedSkuKeyV1(input: unknown): AgentSoulContractValidationResultV1 {
  const errors: string[] = [];
  if (!isPlainObject(input)) return result(['skuKey: expected plain object']);
  exactKeys(input, ['environment', 'manufacturerRef', 'model', 'hardwareRevision', 'firmwareRange', 'formFactor', 'implementationMechanism'], [], 'skuKey', errors);
  if (!isEnumValue(input.environment, ASSURANCE_ENVIRONMENTS_V1)) errors.push('skuKey.environment: unknown');
  if (!isStrictRecordRef(input.manufacturerRef, 'provider', false, true)) errors.push('skuKey.manufacturerRef: expected provider ref');
  if (!isNonEmptyString(input.model)) errors.push('skuKey.model: expected non-empty string');
  if (!isNonEmptyString(input.hardwareRevision)) errors.push('skuKey.hardwareRevision: expected non-empty string');
  errors.push(...validateEmbeddedFirmwareRangeV1(input.firmwareRange).errors.map((error) => `skuKey.${error}`));
  if (!isEnumValue(input.formFactor, EMBEDDED_FORM_FACTORS_V1)) errors.push('skuKey.formFactor: unknown');
  if (!isEnumValue(input.implementationMechanism, EMBEDDED_IMPLEMENTATION_MECHANISMS_V1) ||
      !formMatchesMechanism(input.formFactor, input.implementationMechanism)) {
    errors.push('skuKey.implementationMechanism: unknown or incompatible');
  }
  return result(errors);
}

export function validateEmbeddedSkuReleaseDecisionV1(
  input: unknown,
): AgentSoulContractValidationResultV1 {
  const errors: string[] = [];
  if (!isPlainObject(input)) return result(['releaseDecision: expected plain object']);
  exactKeys(input, ['schemaVersion', 'decisionId', 'skuKey', 'decisionVersion', 'disposition',
    'approvedMaturityCeiling', 'evidenceManifestRefs', 'reasonCode', 'decidedByRef', 'decidedAt'],
  ['expiresAt'], 'releaseDecision', errors);
  if (input.schemaVersion !== 1) errors.push('releaseDecision.schemaVersion: unsupported version');
  if (!isNonEmptyString(input.decisionId)) errors.push('releaseDecision.decisionId: expected non-empty string');
  const sku = validateEmbeddedSkuKeyV1(input.skuKey);
  errors.push(...sku.errors.map((error) => `releaseDecision.skuKey: ${error}`));
  if (!isPositiveInteger(input.decisionVersion)) errors.push('releaseDecision.decisionVersion: expected positive integer');
  if (!isEnumValue(input.disposition, EMBEDDED_SKU_RELEASE_DISPOSITIONS_V1)) errors.push('releaseDecision.disposition: unknown');
  if (!isEnumValue(input.approvedMaturityCeiling, EMBEDDED_INTEGRATION_MATURITIES_V1)) errors.push('releaseDecision.approvedMaturityCeiling: unknown');
  if (!isSortedUniqueRefs(input.evidenceManifestRefs, ['embedded_evidence_manifest'])) errors.push('releaseDecision.evidenceManifestRefs: expected canonical non-empty pre-decision refs');
  if (!isNonEmptyString(input.reasonCode)) errors.push('releaseDecision.reasonCode: expected non-empty string');
  if (!isStrictRecordRef(input.decidedByRef, 'actor_identity', false, true)) errors.push('releaseDecision.decidedByRef: wrong ref');
  if (!isCanonicalTimestamp(input.decidedAt)) errors.push('releaseDecision.decidedAt: expected canonical timestamp');
  if (input.expiresAt !== undefined && (!isCanonicalTimestamp(input.expiresAt) ||
      (isCanonicalTimestamp(input.decidedAt) && Date.parse(input.expiresAt) <= Date.parse(input.decidedAt)))) {
    errors.push('releaseDecision.expiresAt: invalid expiry');
  }
  return result(errors);
}

export function createDefaultOffEmbeddedFeatureFlagStatesV1(): EmbeddedFeatureFlagStateV1[] {
  return EMBEDDED_FEATURE_FLAG_NAMES_V1.map((flag) => ({ flag, enabled: false }));
}

export function validateFeatureFlagSnapshotV1(input: unknown): AgentSoulContractValidationResultV1 {
  const errors: string[] = [];
  if (!isPlainObject(input)) return result(['flagSnapshot: expected plain object']);
  exactKeys(input, ['schemaVersion', 'snapshotId', 'snapshotVersion', 'environment', 'scope',
    'sourceConfigVersion', 'flags', 'capturedAt', 'issuedByRef'], [], 'flagSnapshot', errors);
  if (input.schemaVersion !== 1) errors.push('flagSnapshot.schemaVersion: unsupported version');
  if (!isNonEmptyString(input.snapshotId)) errors.push('flagSnapshot.snapshotId: expected non-empty string');
  if (!isPositiveInteger(input.snapshotVersion)) errors.push('flagSnapshot.snapshotVersion: expected positive integer');
  if (!isEnumValue(input.environment, ASSURANCE_ENVIRONMENTS_V1)) errors.push('flagSnapshot.environment: unknown');
  if (input.scope !== 'environment-full') errors.push('flagSnapshot.scope: environment-full required');
  if (!isNonEmptyString(input.sourceConfigVersion)) errors.push('flagSnapshot.sourceConfigVersion: expected non-empty string');
  if (!Array.isArray(input.flags) || input.flags.length !== EMBEDDED_FEATURE_FLAG_NAMES_V1.length) {
    errors.push('flagSnapshot.flags: all nine flags required exactly once');
  } else {
    input.flags.forEach((entry, index) => {
      if (!isPlainObject(entry)) { errors.push(`flagSnapshot.flags[${index}]: expected object`); return; }
      exactKeys(entry, ['flag', 'enabled'], [], `flagSnapshot.flags[${index}]`, errors);
      if (entry.flag !== EMBEDDED_FEATURE_FLAG_NAMES_V1[index]) errors.push(`flagSnapshot.flags[${index}]: wrong canonical flag/order`);
      if (typeof entry.enabled !== 'boolean') errors.push(`flagSnapshot.flags[${index}].enabled: expected boolean`);
    });
  }
  if (!isCanonicalTimestamp(input.capturedAt)) errors.push('flagSnapshot.capturedAt: expected canonical timestamp');
  if (!isStrictRecordRef(input.issuedByRef, 'actor_identity', false, true)) errors.push('flagSnapshot.issuedByRef: wrong ref');
  return result(errors);
}

function skuCanonicalKey(sku: EmbeddedSkuKeyV1): string {
  return canonicalizeEmbeddedJsonV1(sku);
}

function skuDimensionsWithoutRange(sku: EmbeddedSkuKeyV1): string {
  const { firmwareRange: _firmwareRange, ...dimensions } = sku;
  return canonicalizeEmbeddedJsonV1(dimensions);
}

function rangesOverlap(left: string, right: string): boolean {
  const a = parseEmbeddedFirmwareRangeV1(left);
  const b = parseEmbeddedFirmwareRangeV1(right);
  if (a === undefined || b === undefined) return true;
  return compareFirmwareVersions(a.lower, b.upper) <= 0 && compareFirmwareVersions(b.lower, a.upper) <= 0;
}

export function validateEmbeddedSkuReleaseAllowlistSnapshotV1(
  input: unknown,
): AgentSoulContractValidationResultV1 {
  const errors: string[] = [];
  if (!isPlainObject(input)) return result(['allowlistSnapshot: expected plain object']);
  exactKeys(input, ['schemaVersion', 'snapshotId', 'snapshotVersion', 'environment', 'scope',
    'entries', 'capturedAt', 'issuedByRef'], [], 'allowlistSnapshot', errors);
  if (input.schemaVersion !== 1) errors.push('allowlistSnapshot.schemaVersion: unsupported version');
  if (!isNonEmptyString(input.snapshotId)) errors.push('allowlistSnapshot.snapshotId: expected non-empty string');
  if (!isPositiveInteger(input.snapshotVersion)) errors.push('allowlistSnapshot.snapshotVersion: expected positive integer');
  if (!isEnumValue(input.environment, ASSURANCE_ENVIRONMENTS_V1)) errors.push('allowlistSnapshot.environment: unknown');
  if (input.scope !== 'environment-full') errors.push('allowlistSnapshot.scope: environment-full required');
  if (!Array.isArray(input.entries)) errors.push('allowlistSnapshot.entries: expected array');
  else {
    const validEntries: EmbeddedSkuReleaseAllowlistEntryV1[] = [];
    input.entries.forEach((entry, index) => {
      if (!isPlainObject(entry)) { errors.push(`allowlistSnapshot.entries[${index}]: expected object`); return; }
      exactKeys(entry, ['skuKey', 'decisionRef', 'decisionVersion'], [], `allowlistSnapshot.entries[${index}]`, errors);
      const sku = validateEmbeddedSkuKeyV1(entry.skuKey);
      errors.push(...sku.errors.map((error) => `allowlistSnapshot.entries[${index}].skuKey: ${error}`));
      if (isPlainObject(entry.skuKey) && entry.skuKey.environment !== input.environment) errors.push(`allowlistSnapshot.entries[${index}]: environment mismatch`);
      if (!isPositiveInteger(entry.decisionVersion) ||
          !isStrictRecordRef(entry.decisionRef, 'embedded_release_decision', true, true) ||
          (isPlainObject(entry.decisionRef) && entry.decisionRef.version !== entry.decisionVersion)) {
        errors.push(`allowlistSnapshot.entries[${index}]: decision ref/version mismatch`);
      }
      if (sku.valid) validEntries.push(entry as unknown as EmbeddedSkuReleaseAllowlistEntryV1);
    });
    for (let index = 1; index < validEntries.length; index += 1) {
      if (compareUtf8(skuCanonicalKey(validEntries[index - 1].skuKey), skuCanonicalKey(validEntries[index].skuKey)) >= 0) {
        errors.push('allowlistSnapshot.entries: duplicate or non-canonical order'); break;
      }
    }
    for (let left = 0; left < validEntries.length; left += 1) {
      for (let right = left + 1; right < validEntries.length; right += 1) {
        if (skuDimensionsWithoutRange(validEntries[left].skuKey) === skuDimensionsWithoutRange(validEntries[right].skuKey) &&
            rangesOverlap(validEntries[left].skuKey.firmwareRange, validEntries[right].skuKey.firmwareRange)) {
          errors.push('allowlistSnapshot.entries: overlapping firmware ranges');
        }
      }
    }
  }
  if (!isCanonicalTimestamp(input.capturedAt)) errors.push('allowlistSnapshot.capturedAt: expected canonical timestamp');
  if (!isStrictRecordRef(input.issuedByRef, 'actor_identity', false, true)) errors.push('allowlistSnapshot.issuedByRef: wrong ref');
  return result(errors);
}

export function validateEmbeddedSkuReleaseReceiptV1(
  input: unknown,
  context: EmbeddedReceiptValidationContextV1 = {},
): AgentSoulContractValidationResultV1 {
  const errors: string[] = [];
  if (!isPlainObject(input)) return result(['releaseReceipt: expected plain object']);
  exactKeys(input, ['schemaVersion', 'receiptId', 'skuKey', 'decisionRef', 'decisionVersion',
    'flagSnapshotRef', 'releaseAllowlistSnapshotRef', 'effectiveAt', 'issuedByRef'], [], 'releaseReceipt', errors);
  if (input.schemaVersion !== 1) errors.push('releaseReceipt.schemaVersion: unsupported version');
  if (!isNonEmptyString(input.receiptId)) errors.push('releaseReceipt.receiptId: expected non-empty string');
  const sku = validateEmbeddedSkuKeyV1(input.skuKey);
  errors.push(...sku.errors.map((error) => `releaseReceipt.skuKey: ${error}`));
  if (!isPositiveInteger(input.decisionVersion) ||
      !isStrictRecordRef(input.decisionRef, 'embedded_release_decision', true, true) ||
      (isPlainObject(input.decisionRef) && input.decisionRef.version !== input.decisionVersion)) {
    errors.push('releaseReceipt.decisionRef: version mismatch');
  }
  if (!isStrictRecordRef(input.flagSnapshotRef, 'feature_flag_snapshot', true, true)) errors.push('releaseReceipt.flagSnapshotRef: wrong ref');
  if (!isStrictRecordRef(input.releaseAllowlistSnapshotRef, 'embedded_release_allowlist_snapshot', true, true)) errors.push('releaseReceipt.releaseAllowlistSnapshotRef: wrong ref');
  if (!isCanonicalTimestamp(input.effectiveAt)) errors.push('releaseReceipt.effectiveAt: expected canonical timestamp');
  if (!isStrictRecordRef(input.issuedByRef, 'actor_identity', false, true)) errors.push('releaseReceipt.issuedByRef: wrong ref');
  if (context.decision !== undefined) {
    const decisionValidation = validateEmbeddedSkuReleaseDecisionV1(context.decision);
    if (!decisionValidation.valid || context.decision.disposition !== 'approved' ||
        context.decision.decisionId !== (isPlainObject(input.decisionRef) ? input.decisionRef.id : undefined) ||
        context.decision.decisionVersion !== input.decisionVersion ||
        (isPlainObject(input.skuKey) && skuCanonicalKey(context.decision.skuKey) !== skuCanonicalKey(input.skuKey as unknown as EmbeddedSkuKeyV1)) ||
        (isCanonicalTimestamp(input.effectiveAt) && Date.parse(input.effectiveAt) < Date.parse(context.decision.decidedAt)) ||
        (context.decision.expiresAt !== undefined && isCanonicalTimestamp(input.effectiveAt) && Date.parse(input.effectiveAt) >= Date.parse(context.decision.expiresAt))) {
      errors.push('releaseReceipt: inactive, expired, mismatched or future decision');
    }
  }
  for (const [name, snapshot, refValue] of [
    ['flag', context.flagSnapshot, input.flagSnapshotRef],
    ['allowlist', context.allowlistSnapshot, input.releaseAllowlistSnapshotRef],
  ] as const) {
    if (snapshot !== undefined && isPlainObject(refValue)) {
      const validation = name === 'flag'
        ? validateFeatureFlagSnapshotV1(snapshot)
        : validateEmbeddedSkuReleaseAllowlistSnapshotV1(snapshot);
      const environment = isPlainObject(input.skuKey) ? input.skuKey.environment : undefined;
      if (!validation.valid || snapshot.snapshotId !== refValue.id || snapshot.snapshotVersion !== refValue.version ||
          snapshot.environment !== environment ||
          (isCanonicalTimestamp(input.effectiveAt) && Date.parse(snapshot.capturedAt) > Date.parse(input.effectiveAt))) {
        errors.push(`releaseReceipt.${name}SnapshotRef: snapshot mismatch/future/environment error`);
      }
    }
  }
  if (context.allowlistSnapshot !== undefined && sku.valid && isPlainObject(input.skuKey)) {
    const receiptSku = input.skuKey as unknown as EmbeddedSkuKeyV1;
    const matches = context.allowlistSnapshot.entries.filter((entry) =>
      skuCanonicalKey(entry.skuKey) === skuCanonicalKey(receiptSku) &&
      entry.decisionVersion === input.decisionVersion &&
      isPlainObject(input.decisionRef) && entry.decisionRef.id === input.decisionRef.id,
    );
    if (matches.length !== 1) {
      errors.push('releaseReceipt.releaseAllowlistSnapshotRef: exact SKU/decision must appear exactly once');
    }
  }
  return result(errors);
}

function isRepositoryPath(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.includes('\\') === false &&
    !value.startsWith('/') && !/^[A-Za-z]:/.test(value) &&
    value.split('/').every((segment) => segment.length > 0 && segment !== '.' && segment !== '..');
}

function validateEvidenceVersions(value: unknown, errors: string[]): void {
  if (!isPlainObject(value)) { errors.push('evidenceManifest.versions: expected object'); return; }
  const keys = ['hardware', 'firmwareVersions', 'appVersions', 'backendVersions', 'apiSchemaVersions'];
  exactKeys(value, keys, [], 'evidenceManifest.versions', errors);
  for (const key of keys) {
    if (!isSortedUniqueStrings(value[key], true)) errors.push(`evidenceManifest.versions.${key}: expected canonical set`);
  }
}

export function validateEmbeddedEvidenceManifestV1(
  input: unknown,
  context: EmbeddedEvidenceValidationContextV1 = {},
): AgentSoulContractValidationResultV1 {
  const errors: string[] = [];
  if (!isPlainObject(input)) return result(['evidenceManifest: expected plain object']);
  const required = ['schemaVersion', 'manifestId', 'environment', 'integrationMaturity', 'sources',
    'artifacts', 'results', 'versions', 'flagSnapshotRef', 'releaseAllowlistSnapshotRef',
    'limitations', 'ownerRef', 'reviewerRefs', 'capturedAt', 'evidencePhase'];
  const optional = ['keyEnvironment', 'assuranceEvidenceLevel', 'candidateSkuKey'];
  if (input.evidencePhase === 'post-decision') required.push('releaseReceiptRef');
  exactKeys(input, required, optional, 'evidenceManifest', errors);
  if (input.schemaVersion !== 1) errors.push('evidenceManifest.schemaVersion: unsupported version');
  if (!isNonEmptyString(input.manifestId)) errors.push('evidenceManifest.manifestId: expected non-empty string');
  if (!isEnumValue(input.environment, ASSURANCE_ENVIRONMENTS_V1)) errors.push('evidenceManifest.environment: unknown');
  if (!isEnumValue(input.integrationMaturity, EMBEDDED_INTEGRATION_MATURITIES_V1)) errors.push('evidenceManifest.integrationMaturity: unknown');
  if (input.keyEnvironment !== undefined && !isEnumValue(input.keyEnvironment, EMBEDDED_KEY_ENVIRONMENTS_V1)) errors.push('evidenceManifest.keyEnvironment: unknown');
  if (input.assuranceEvidenceLevel !== undefined && !isEnumValue(input.assuranceEvidenceLevel, ASSURANCE_EVIDENCE_LEVELS_V1)) errors.push('evidenceManifest.assuranceEvidenceLevel: unknown');
  if (input.candidateSkuKey === undefined && context.allowCandidateSkuAbsent !== true) errors.push('evidenceManifest.candidateSkuKey: required by validation context');
  if (input.candidateSkuKey !== undefined) {
    const validation = validateEmbeddedSkuKeyV1(input.candidateSkuKey);
    errors.push(...validation.errors.map((error) => `evidenceManifest.candidateSkuKey: ${error}`));
    if (isPlainObject(input.candidateSkuKey) && input.candidateSkuKey.environment !== input.environment) errors.push('evidenceManifest.candidateSkuKey: environment mismatch');
  }
  const artifactIdentities = new Set<string>();
  if (!Array.isArray(input.sources) || input.sources.length === 0) errors.push('evidenceManifest.sources: expected non-empty canonical set');
  else {
    let previous = '';
    input.sources.forEach((source, index) => {
      if (!isPlainObject(source)) { errors.push(`evidenceManifest.sources[${index}]: expected object`); return; }
      exactKeys(source, ['component', 'sourceSha', 'worktreeState'], [], `evidenceManifest.sources[${index}]`, errors);
      if (!isNonEmptyString(source.component) || (index > 0 && compareUtf8(previous, source.component) >= 0)) errors.push('evidenceManifest.sources: duplicate/non-canonical component');
      previous = typeof source.component === 'string' ? source.component : previous;
      if (typeof source.sourceSha !== 'string' || !SOURCE_SHA_PATTERN.test(source.sourceSha)) errors.push(`evidenceManifest.sources[${index}].sourceSha: invalid`);
      if (!['clean', 'dirty', 'unknown'].includes(String(source.worktreeState))) errors.push(`evidenceManifest.sources[${index}].worktreeState: unknown`);
    });
  }
  if (!Array.isArray(input.artifacts) || input.artifacts.length === 0) errors.push('evidenceManifest.artifacts: expected non-empty canonical set');
  else {
    let previous: RecordRef | undefined;
    input.artifacts.forEach((artifact, index) => {
      if (!isPlainObject(artifact)) { errors.push(`evidenceManifest.artifacts[${index}]: expected object`); return; }
      exactKeys(artifact, ['artifactRef', 'sha256', 'role'], ['repositoryPath'], `evidenceManifest.artifacts[${index}]`, errors);
      const refCandidate = artifact.artifactRef;
      if (!isStrictRecordRef(refCandidate, undefined, false, true) ||
          !['evidence', 'task_proof', 'embedded_certification_record'].includes(
            isStrictRecordRef(refCandidate, undefined, false, true) ? refCandidate.type : '',
          )) {
        errors.push(`evidenceManifest.artifacts[${index}].artifactRef: wrong ref`);
      } else {
        const ref: RecordRef = refCandidate;
        if (previous !== undefined && compareRefs(previous, ref) >= 0) errors.push('evidenceManifest.artifacts: duplicate/non-canonical order');
        previous = ref; artifactIdentities.add(refIdentity(ref));
      }
      if (artifact.repositoryPath !== undefined && !isRepositoryPath(artifact.repositoryPath)) errors.push(`evidenceManifest.artifacts[${index}].repositoryPath: invalid`);
      if (typeof artifact.sha256 !== 'string' || !SHA256_HEX_PATTERN.test(artifact.sha256)) errors.push(`evidenceManifest.artifacts[${index}].sha256: invalid`);
      if (!isNonEmptyString(artifact.role)) errors.push(`evidenceManifest.artifacts[${index}].role: expected non-empty string`);
    });
  }
  if (!Array.isArray(input.results) || input.results.length === 0) errors.push('evidenceManifest.results: expected non-empty canonical set');
  else {
    let previous = '';
    input.results.forEach((entry, index) => {
      if (!isPlainObject(entry)) { errors.push(`evidenceManifest.results[${index}]: expected object`); return; }
      exactKeys(entry, ['resultId', 'requirementIds', 'taskIds', 'status', 'artifactRefs', 'limitations'], [], `evidenceManifest.results[${index}]`, errors);
      if (!isNonEmptyString(entry.resultId) || (index > 0 && compareUtf8(previous, entry.resultId) >= 0)) errors.push('evidenceManifest.results: duplicate/non-canonical resultId');
      previous = typeof entry.resultId === 'string' ? entry.resultId : previous;
      if (!isSortedUniqueStrings(entry.requirementIds)) errors.push(`evidenceManifest.results[${index}].requirementIds: non-canonical`);
      if (!isSortedUniqueStrings(entry.taskIds)) errors.push(`evidenceManifest.results[${index}].taskIds: non-canonical`);
      if (!isEnumValue(entry.status, EMBEDDED_TEST_RESULT_STATUSES_V1)) errors.push(`evidenceManifest.results[${index}].status: unknown`);
      if (!isSortedUniqueRefs(entry.artifactRefs) || !(entry.artifactRefs as RecordRef[]).every((ref) => artifactIdentities.has(refIdentity(ref)))) errors.push(`evidenceManifest.results[${index}].artifactRefs: not a canonical artifact subset`);
      if (!isSortedUniqueStrings(entry.limitations, true)) errors.push(`evidenceManifest.results[${index}].limitations: non-canonical`);
    });
  }
  validateEvidenceVersions(input.versions, errors);
  if (!isStrictRecordRef(input.flagSnapshotRef, 'feature_flag_snapshot', true, true)) errors.push('evidenceManifest.flagSnapshotRef: wrong ref');
  if (!isStrictRecordRef(input.releaseAllowlistSnapshotRef, 'embedded_release_allowlist_snapshot', true, true)) errors.push('evidenceManifest.releaseAllowlistSnapshotRef: wrong ref');
  if (!isSortedUniqueStrings(input.limitations, true)) errors.push('evidenceManifest.limitations: expected canonical set');
  if (isPlainObject(input.versions)) {
    const versionKeys = ['hardware', 'firmwareVersions', 'appVersions', 'backendVersions', 'apiSchemaVersions'];
    const hasNotApplicableVersion = versionKeys.some((key) => Array.isArray(input.versions) ? false :
      Array.isArray((input.versions as Record<string, unknown>)[key]) &&
      ((input.versions as Record<string, unknown>)[key] as unknown[]).length === 0);
    if (hasNotApplicableVersion && (!Array.isArray(input.limitations) || input.limitations.length === 0)) {
      errors.push('evidenceManifest.limitations: empty version dimensions require an explanation');
    }
  }
  if (!isStrictRecordRef(input.ownerRef, 'actor_identity', false, true)) errors.push('evidenceManifest.ownerRef: wrong ref');
  if (!isSortedUniqueRefs(input.reviewerRefs, ['actor_identity'])) errors.push('evidenceManifest.reviewerRefs: expected canonical non-empty actor set');
  if (!isCanonicalTimestamp(input.capturedAt)) errors.push('evidenceManifest.capturedAt: expected canonical timestamp');
  if (input.evidencePhase === 'pre-decision') {
    if (input.releaseReceiptRef !== undefined) errors.push('evidenceManifest.releaseReceiptRef: forbidden before decision');
  } else if (input.evidencePhase === 'post-decision') {
    if (!isStrictRecordRef(input.releaseReceiptRef, 'embedded_release_receipt', true, true)) errors.push('evidenceManifest.releaseReceiptRef: required existing versioned receipt');
  } else errors.push('evidenceManifest.evidencePhase: unknown');
  return result(errors);
}

// ---------------------------------------------------------------------------
// Consumer capability and contract-version negotiation (EMB-01.1 publication
// manifest item 8). Old clients that predate the Embedded record kinds MUST be
// refused the new payloads instead of silently receiving unknown refs.
// ---------------------------------------------------------------------------

/** Wire contract version of this module; unknown versions fail closed. */
export const EMBEDDED_CONTRACT_VERSION_V1 = 1 as const;
export const SUPPORTED_EMBEDDED_CONTRACT_VERSIONS_V1 = [EMBEDDED_CONTRACT_VERSION_V1] as const;
export type EmbeddedContractVersionV1 = (typeof SUPPORTED_EMBEDDED_CONTRACT_VERSIONS_V1)[number];

/**
 * What a consumer (Backend reader, client build or firmware) declares it understands.
 * A declaration is a claim about decoding capability only; it grants no release, no flag
 * and no maturity.
 */
export interface EmbeddedConsumerCapabilityV1 {
  consumerId: string;
  contractVersion: number;
  supportedRecordKinds: string[];
}

export interface EmbeddedNegotiationRequirementV1 {
  /** Record kinds the producer intends to place in the payload. */
  requiredRecordKinds: string[];
  minimumContractVersion?: number;
}

export interface EmbeddedNegotiationResultV1 {
  accepted: boolean;
  negotiatedContractVersion: number | null;
  missingRecordKinds: string[];
  denyReasons: string[];
}

function uniqueSorted(values: readonly string[]): string[] {
  return Array.from(new Set(values)).sort(compareUtf8);
}

export function validateEmbeddedConsumerCapabilityV1(
  input: unknown,
): AgentSoulContractValidationResultV1 {
  const errors: string[] = [];
  if (!isPlainObject(input)) return result(['capability: expected plain object']);
  exactKeys(input, ['consumerId', 'contractVersion', 'supportedRecordKinds'], [], 'capability', errors);
  if (!isNonEmptyString(input.consumerId)) errors.push('capability.consumerId: expected non-empty string');
  if (!isPositiveInteger(input.contractVersion)) {
    errors.push('capability.contractVersion: expected positive integer');
  }
  if (!Array.isArray(input.supportedRecordKinds) || !input.supportedRecordKinds.every(isNonEmptyString) ||
      new Set(input.supportedRecordKinds).size !== input.supportedRecordKinds.length) {
    errors.push('capability.supportedRecordKinds: expected unique non-empty string array');
  }
  return result(errors);
}

/**
 * Fail-closed negotiation. A consumer receives Embedded payloads only when its declared
 * contract version is one this build knows AND it covers every required record kind.
 * An unreadable declaration, an unknown version or one missing kind denies delivery.
 */
export function negotiateEmbeddedContractV1(
  consumer: unknown,
  requirement: EmbeddedNegotiationRequirementV1,
): EmbeddedNegotiationResultV1 {
  const denyReasons: string[] = [];
  const capability = validateEmbeddedConsumerCapabilityV1(consumer);
  if (!capability.valid) {
    return {
      accepted: false,
      negotiatedContractVersion: null,
      missingRecordKinds: uniqueSorted(requirement.requiredRecordKinds),
      denyReasons: ['capability-declaration-invalid'],
    };
  }
  const declared = consumer as EmbeddedConsumerCapabilityV1;

  if (!(SUPPORTED_EMBEDDED_CONTRACT_VERSIONS_V1 as readonly number[]).includes(declared.contractVersion)) {
    denyReasons.push('unknown-contract-version');
  }
  if (requirement.minimumContractVersion !== undefined &&
      declared.contractVersion < requirement.minimumContractVersion) {
    denyReasons.push('below-minimum-contract-version');
  }

  const required = uniqueSorted(requirement.requiredRecordKinds);
  if (required.length === 0) denyReasons.push('no-required-record-kinds-declared');
  const unknownRequired = required.filter(
    (kind) => !(TRUST_RECORD_TYPES as readonly string[]).includes(kind),
  );
  if (unknownRequired.length > 0) denyReasons.push('required-kind-not-in-canonical-registry');

  const supported = new Set(declared.supportedRecordKinds);
  const missingRecordKinds = required.filter((kind) => !supported.has(kind));
  if (missingRecordKinds.length > 0) denyReasons.push('consumer-missing-record-kinds');

  const accepted = denyReasons.length === 0;
  return {
    accepted,
    negotiatedContractVersion: accepted ? declared.contractVersion : null,
    missingRecordKinds,
    denyReasons,
  };
}

/** Collects every RecordRef kind reachable in a payload, so delivery can be gated on it. */
export function collectEmbeddedRecordKindsV1(payload: unknown): string[] {
  const found = new Set<string>();
  const visit = (value: unknown, depth: number): void => {
    if (depth > 64) return;
    if (Array.isArray(value)) {
      for (const entry of value) visit(entry, depth + 1);
      return;
    }
    if (!isPlainObject(value)) return;
    if (isStrictRecordRef(value, undefined, false, false)) found.add(value.type);
    for (const nested of Object.values(value)) visit(nested, depth + 1);
  };
  visit(payload, 0);
  return uniqueSorted(Array.from(found));
}

/**
 * Delivery gate: refuses to hand an Embedded payload to a consumer that cannot decode every
 * record kind the payload actually contains. Legacy consumers that predate
 * {@link EMBEDDED_TRUST_RECORD_TYPES_V1} are therefore denied rather than silently served.
 */
export function canDeliverEmbeddedPayloadV1(
  consumer: unknown,
  payload: unknown,
  minimumContractVersion: number = EMBEDDED_CONTRACT_VERSION_V1,
): EmbeddedNegotiationResultV1 {
  return negotiateEmbeddedContractV1(consumer, {
    requiredRecordKinds: collectEmbeddedRecordKindsV1(payload),
    minimumContractVersion,
  });
}
