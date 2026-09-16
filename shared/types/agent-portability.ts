import {
  TRUST_LOOP_CANONICALIZATION,
  canonicalizeJson,
  computeDigest,
  verifyDigest,
  type DigestRef,
} from './trust-loop-primitives';

/**
 * Agent Portability / Import & Fusion V1 contracts.
 *
 * This module is dependency-free and safe to consume from Web, Mobile,
 * Desktop, Backend, and alternate runtimes. It owns package/import contracts
 * only; it does not grant any canonical Agent, Memory, Trust, or Continuity
 * write authority.
 */

export const AGENT_PORTABILITY_SCHEMA_VERSION = '1.0' as const;
export type AgentPortabilitySchemaVersion = typeof AGENT_PORTABILITY_SCHEMA_VERSION;
export const SUPPORTED_AGENT_PORTABILITY_SCHEMA_VERSIONS = [
  AGENT_PORTABILITY_SCHEMA_VERSION,
] as const;
export const AGENT_PORTABILITY_CANONICALIZATION = TRUST_LOOP_CANONICALIZATION;

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };
export interface PortabilityExtensionDataV1 {
  [namespace: string]: JsonValue;
}

export const PORTABILITY_RECORD_KINDS = [
  'import_job',
  'import_source',
  'raw_archive',
  'scan_result',
  'portable_package',
  'portable_item',
  'merge_plan',
  'merge_decision',
  'commit_checkpoint',
  'import_receipt',
  'export_receipt',
  'restore_materialization_plan',
  'source_evidence',
  'canonical_agent',
  'canonical_content',
  'connector_credential',
  'trust_receipt',
  'continuity_snapshot',
] as const;
export type PortabilityRecordKindV1 = (typeof PORTABILITY_RECORD_KINDS)[number];

export interface PortabilityRecordRefV1 {
  kind: PortabilityRecordKindV1;
  id: string;
  version?: number;
  tenantRef?: string;
  digest?: DigestRef;
}

export const PORTABLE_ITEM_TYPES = [
  'persona',
  'goal',
  'preference',
  'fact_memory',
  'relationship_memory',
  'conversation',
  'conversation_summary',
  'knowledge',
  'attachment',
  'skill',
  'tool',
  'workflow',
  'history',
] as const;
export type PortableItemTypeV1 = (typeof PORTABLE_ITEM_TYPES)[number];

export const PORTABLE_ITEM_CLASSIFICATIONS = [
  'imported',
  'legacy',
  'derived',
  'user_edited',
  'agentrix_native',
] as const;
export type PortableItemClassificationV1 =
  (typeof PORTABLE_ITEM_CLASSIFICATIONS)[number];

export const PORTABLE_ITEM_LOSSINESS = [
  'lossless',
  'partial',
  'summary_only',
  'transformed',
  'unknown',
] as const;
export type PortableItemLossinessV1 = (typeof PORTABLE_ITEM_LOSSINESS)[number];

export const PORTABILITY_DATA_CLASSES = [
  'public',
  'owner',
  'private',
  'restricted',
] as const;
export type PortabilityDataClassV1 = (typeof PORTABILITY_DATA_CLASSES)[number];

export const IMPORT_SOURCE_TYPES = [
  'direct_connector',
  'user_archive',
  'guided_input',
] as const;
export type ImportSourceTypeV1 = (typeof IMPORT_SOURCE_TYPES)[number];

export const SOURCE_CAPABILITY_AVAILABILITY = [
  'available',
  'partial',
  'manual',
  'unavailable',
  'unknown',
] as const;
export type SourceCapabilityAvailabilityV1 =
  (typeof SOURCE_CAPABILITY_AVAILABILITY)[number];

export const SOURCE_LIFECYCLE_STATUSES = [
  'available',
  'partial',
  'unavailable',
  'revoked',
  'expired',
] as const;
export type SourceLifecycleStatusV1 = (typeof SOURCE_LIFECYCLE_STATUSES)[number];

export interface OpaqueExternalRefV1 {
  namespace: string;
  objectType: string;
  id: string;
  version?: string;
}

export interface SourceAdapterRefV1 {
  id: string;
  version: string;
}

export interface SourceCapabilityEntryV1 {
  category: PortableItemTypeV1;
  availability: SourceCapabilityAvailabilityV1;
  reasonCodes: string[];
  maxItems?: number;
  maxBytes?: number;
  extensionData?: PortabilityExtensionDataV1;
}

export interface SourceCapabilityManifestV1 {
  schemaVersion: AgentPortabilitySchemaVersion;
  overall: SourceCapabilityAvailabilityV1;
  verifiedAt: string;
  entries: SourceCapabilityEntryV1[];
  limitations: string[];
  extensionData?: PortabilityExtensionDataV1;
}

export interface ImportedAgentSourceV1 {
  schemaVersion: AgentPortabilitySchemaVersion;
  sourceId: string;
  tenantRef: string;
  provider: string;
  sourceType: ImportSourceTypeV1;
  externalObjectRefs: OpaqueExternalRefV1[];
  adapter: SourceAdapterRefV1;
  capabilityManifest: SourceCapabilityManifestV1;
  ownershipEvidenceRef: PortabilityRecordRefV1;
  consentEvidenceRef: PortabilityRecordRefV1;
  acquiredAt: string;
  status: SourceLifecycleStatusV1;
  extensionData?: PortabilityExtensionDataV1;
}

export interface PortableItemEnvelopeV1<T extends JsonValue = JsonValue> {
  schemaVersion: AgentPortabilitySchemaVersion;
  itemId: string;
  itemType: PortableItemTypeV1;
  payload: T;
  contentDigest: DigestRef;
  sourceRefs: PortabilityRecordRefV1[];
  derivedFromRefs: PortabilityRecordRefV1[];
  capturedAt?: string;
  exportedAt?: string;
  sourceSchemaVersion?: string;
  classification: PortableItemClassificationV1;
  confidence?: number;
  lossiness: PortableItemLossinessV1;
  sensitivity: PortabilityDataClassV1;
  extensionData?: PortabilityExtensionDataV1;
}

export const SOURCE_IDENTITY_CLAIM_TYPES = [
  'external_agent_instance',
  'source_account',
  'display_name',
  'owner_assertion',
] as const;
export type SourceIdentityClaimTypeV1 =
  (typeof SOURCE_IDENTITY_CLAIM_TYPES)[number];

export interface SourceIdentityClaimV1 {
  schemaVersion: AgentPortabilitySchemaVersion;
  claimId: string;
  sourceRef: PortabilityRecordRefV1;
  claimType: SourceIdentityClaimTypeV1;
  value: JsonValue;
  confidence?: number;
  assertedAt: string;
  extensionData?: PortabilityExtensionDataV1;
}

export interface PortableConsentEvidenceV1 {
  schemaVersion: AgentPortabilitySchemaVersion;
  consentId: string;
  principalRef: string;
  sourceRef: PortabilityRecordRefV1;
  categories: PortableItemTypeV1[];
  grantedAt: string;
  expiresAt?: string;
  evidenceRef: PortabilityRecordRefV1;
  extensionData?: PortabilityExtensionDataV1;
}

export const PORTABILITY_PROVENANCE_EVENTS = [
  'acquired',
  'normalized',
  'derived',
  'merged',
  'user_edited',
  'exported',
] as const;
export type PortabilityProvenanceEventV1 =
  (typeof PORTABILITY_PROVENANCE_EVENTS)[number];

export interface PortabilityTransformationRefV1 {
  id: string;
  version: string;
  ruleDigest?: DigestRef;
}

export interface PortabilityProvenanceRecordV1 {
  schemaVersion: AgentPortabilitySchemaVersion;
  provenanceId: string;
  subjectRef: PortabilityRecordRefV1;
  sourceRef: PortabilityRecordRefV1;
  event: PortabilityProvenanceEventV1;
  recordedAt: string;
  transformation?: PortabilityTransformationRefV1;
  evidenceRefs: PortabilityRecordRefV1[];
  classification: PortableItemClassificationV1;
  extensionData?: PortabilityExtensionDataV1;
}

export interface PortableAttachmentV1 {
  schemaVersion: AgentPortabilitySchemaVersion;
  attachmentId: string;
  fileName?: string;
  mediaType: string;
  byteLength: number;
  contentDigest: DigestRef;
  objectRef: PortabilityRecordRefV1;
  sourceRefs: PortabilityRecordRefV1[];
  classification: PortableItemClassificationV1;
  sensitivity: PortabilityDataClassV1;
  extensionData?: PortabilityExtensionDataV1;
}

export interface PortabilityIntegrityProofV1 {
  schemaVersion: AgentPortabilitySchemaVersion;
  kind: 'digest' | 'signature';
  payloadDigest: DigestRef;
  issuerRef?: string;
  scheme?: string;
  keyId?: string;
  signature?: string;
  signedAt?: string;
  extensionData?: PortabilityExtensionDataV1;
}

export const PORTABILITY_PACKAGE_PRODUCER_KINDS = [
  'agentrix',
  'source_adapter',
  'external_runtime',
  'user_archive',
] as const;
export type PortabilityPackageProducerKindV1 =
  (typeof PORTABILITY_PACKAGE_PRODUCER_KINDS)[number];

export interface PortabilityPackageProducerV1 {
  kind: PortabilityPackageProducerKindV1;
  id: string;
  version: string;
}

export interface SovereignAgentPackageManifestV1 {
  schemaVersion: AgentPortabilitySchemaVersion;
  packageId: string;
  createdAt: string;
  producer: PortabilityPackageProducerV1;
  tenantRef: string;
  ownerPrincipalRef: string;
  contentDigest: DigestRef;
  extensionData?: PortabilityExtensionDataV1;
}

export interface SovereignAgentPackageV1 {
  manifest: SovereignAgentPackageManifestV1;
  sources: ImportedAgentSourceV1[];
  identityClaims: SourceIdentityClaimV1[];
  items: PortableItemEnvelopeV1[];
  attachments: PortableAttachmentV1[];
  provenance: PortabilityProvenanceRecordV1[];
  consentEvidence: PortableConsentEvidenceV1[];
  integrityProofs: PortabilityIntegrityProofV1[];
  extensionData?: PortabilityExtensionDataV1;
}

export type UnsealedSovereignAgentPackageV1 = Omit<
  SovereignAgentPackageV1,
  'manifest' | 'integrityProofs'
> & {
  manifest: Omit<SovereignAgentPackageManifestV1, 'contentDigest'>;
  integrityProofs?: PortabilityIntegrityProofV1[];
};

export const IMPORT_JOB_MODES = [
  'new_agent',
  'merge_into_existing',
  'archive_only',
  'keep_separate',
] as const;
export type ImportJobModeV1 = (typeof IMPORT_JOB_MODES)[number];

export const IMPORT_JOB_STATES = [
  'created',
  'consent_pending',
  'acquiring',
  'staged',
  'scanning',
  'normalized',
  'planning',
  'awaiting_decision',
  'committing',
  'committed',
  'rollback_pending',
  'rolled_back',
  'manual_resolution',
  'rejected',
  'failed',
  'expired',
] as const;
export type ImportJobStateV1 = (typeof IMPORT_JOB_STATES)[number];

export interface ImportJobV1 {
  schemaVersion: AgentPortabilitySchemaVersion;
  jobId: string;
  ownerPrincipalRef: string;
  tenantRef: string;
  mode: ImportJobModeV1;
  targetAgentRef?: PortabilityRecordRefV1;
  state: ImportJobStateV1;
  stateVersion: number;
  sourceRefs: PortabilityRecordRefV1[];
  packageRef?: PortabilityRecordRefV1;
  scanRef?: PortabilityRecordRefV1;
  mergePlanRef?: PortabilityRecordRefV1;
  decisionRef?: PortabilityRecordRefV1;
  commitCheckpointRef?: PortabilityRecordRefV1;
  receiptRef?: PortabilityRecordRefV1;
  createdAt: string;
  updatedAt: string;
  expiresAt?: string;
  reasonCode?: string;
  extensionData?: PortabilityExtensionDataV1;
}

export const SCAN_FINDING_SEVERITIES = ['info', 'warning', 'high', 'critical'] as const;
export type ScanFindingSeverityV1 = (typeof SCAN_FINDING_SEVERITIES)[number];
export const SCAN_FINDING_ACTIONS = [
  'allow',
  'review',
  'redact',
  'quarantine',
  'reject',
] as const;
export type ScanFindingActionV1 = (typeof SCAN_FINDING_ACTIONS)[number];

export interface ScanFindingV1 {
  schemaVersion: AgentPortabilitySchemaVersion;
  findingId: string;
  kind: string;
  severity: ScanFindingSeverityV1;
  action: ScanFindingActionV1;
  location: string;
  reasonCode: string;
  valueDigest?: DigestRef;
  createdAt: string;
  extensionData?: PortabilityExtensionDataV1;
}

export const MERGE_DECISION_ACTIONS = [
  'accept',
  'reject',
  'edit',
  'keep_both',
  'choose_primary',
  'defer',
] as const;
export type MergeDecisionActionV1 = (typeof MERGE_DECISION_ACTIONS)[number];

export const MERGE_CONFLICT_KINDS = [
  'none',
  'exact_duplicate',
  'semantic_candidate',
  'persona',
  'goal',
  'preference_fact',
  'relationship',
  'skill',
  'tool_config',
  'history',
] as const;
export type MergeConflictKindV1 = (typeof MERGE_CONFLICT_KINDS)[number];

export interface MergePlanItemV1 {
  planItemId: string;
  inputItemRefs: PortabilityRecordRefV1[];
  targetDomain: string;
  operationKind: string;
  conflictKind: MergeConflictKindV1;
  reasonCodes: string[];
  risk: 'low' | 'medium' | 'high';
  proposedAction: MergeDecisionActionV1;
  requiresDecision: boolean;
  previewDigest: DigestRef;
}

export interface MergePlanV1 {
  schemaVersion: AgentPortabilitySchemaVersion;
  planId: string;
  jobRef: PortabilityRecordRefV1;
  targetAgentRef?: PortabilityRecordRefV1;
  inputDigest: DigestRef;
  targetVersion?: number;
  engineVersion: string;
  items: MergePlanItemV1[];
  warnings: string[];
  requiredDecisionItemIds: string[];
  createdAt: string;
  extensionData?: PortabilityExtensionDataV1;
}

export interface MergeDecisionItemV1 {
  planItemId: string;
  action: MergeDecisionActionV1;
  editedPayloadRef?: PortabilityRecordRefV1;
}

export interface MergeDecisionV1 {
  schemaVersion: AgentPortabilitySchemaVersion;
  decisionId: string;
  planRef: PortabilityRecordRefV1;
  planInputDigest: DigestRef;
  decisionVersion: number;
  decidedBy: string;
  decisions: MergeDecisionItemV1[];
  acceptedAt: string;
  extensionData?: PortabilityExtensionDataV1;
}

export const COMMIT_CHECKPOINT_OUTCOMES = [
  'pending',
  'accepted',
  'rejected',
  'unknown',
  'compensated',
  'compensation_failed',
] as const;
export type CommitCheckpointOutcomeV1 =
  (typeof COMMIT_CHECKPOINT_OUTCOMES)[number];

export interface ImportCommitOperationV1 {
  sequence: number;
  planItemId: string;
  targetDomain: string;
  operationKind: string;
  idempotencyKey: string;
  requestDigest: DigestRef;
  writerRequestRef?: PortabilityRecordRefV1;
  writerReceiptRef?: PortabilityRecordRefV1;
  outcome: CommitCheckpointOutcomeV1;
  attempt: number;
  reasonCode?: string;
}

export interface ImportCommitCheckpointV1 {
  schemaVersion: AgentPortabilitySchemaVersion;
  checkpointId: string;
  jobRef: PortabilityRecordRefV1;
  decisionRef: PortabilityRecordRefV1;
  operations: ImportCommitOperationV1[];
  checkpointVersion: number;
  updatedAt: string;
  extensionData?: PortabilityExtensionDataV1;
}

export const IMPORT_RECEIPT_STATES = [
  'committed',
  'committed_trust_pending',
  'partial',
  'rolled_back',
  'manual_resolution',
] as const;
export type ImportReceiptStateV1 = (typeof IMPORT_RECEIPT_STATES)[number];

export interface ImportReceiptV1 {
  schemaVersion: AgentPortabilitySchemaVersion;
  receiptId: string;
  jobRef: PortabilityRecordRefV1;
  packageDigest: DigestRef;
  sourceRefs: PortabilityRecordRefV1[];
  scanRef: PortabilityRecordRefV1;
  planRef: PortabilityRecordRefV1;
  decisionRef: PortabilityRecordRefV1;
  targetAgentRef?: PortabilityRecordRefV1;
  writerReceiptRefs: PortabilityRecordRefV1[];
  trustReceiptRefs: PortabilityRecordRefV1[];
  reauthorizationItemRefs: PortabilityRecordRefV1[];
  state: ImportReceiptStateV1;
  reasonCodes: string[];
  issuedAt: string;
  extensionData?: PortabilityExtensionDataV1;
}

export const SOURCE_LOCATOR_KINDS = [
  'url',
  'connector_ref',
  'archive_ref',
  'manual',
] as const;
export type SourceLocatorKindV1 = (typeof SOURCE_LOCATOR_KINDS)[number];

export interface SourceLocatorV1 {
  kind: SourceLocatorKindV1;
  locatorRef: string;
  connectorCredentialRef?: PortabilityRecordRefV1;
  extensionData?: PortabilityExtensionDataV1;
}

export interface AdapterDescriptorV1 {
  schemaVersion: AgentPortabilitySchemaVersion;
  adapterId: string;
  adapterVersion: string;
  provider: string;
  sourceTypes: ImportSourceTypeV1[];
}

export interface SourceProbeContextV1 {
  tenantRef: string;
  ownerPrincipalRef: string;
  aborted?: boolean;
}

export interface SourceProbeResultV1 {
  descriptor: AdapterDescriptorV1;
  capabilityManifest: SourceCapabilityManifestV1;
  sourceFingerprint?: DigestRef;
  reasonCodes: string[];
}

export interface AcquireRequestV1 {
  jobRef: PortabilityRecordRefV1;
  sourceRef: PortabilityRecordRefV1;
  locator: SourceLocatorV1;
  consentEvidenceRef: PortabilityRecordRefV1;
  maxBytes: number;
}

export interface StagingSinkV1 {
  write(chunk: Uint8Array): Promise<void>;
  close(): Promise<PortabilityRecordRefV1>;
  abort(reasonCode: string): Promise<void>;
}

export interface AcquireReceiptV1 {
  archiveRef: PortabilityRecordRefV1;
  contentDigest: DigestRef;
  byteLength: number;
  acquiredAt: string;
}

export interface ParseContextV1 {
  jobRef: PortabilityRecordRefV1;
  sourceRef: PortabilityRecordRefV1;
  tenantRef: string;
  maxItems: number;
  aborted?: boolean;
}

export interface RawSourceItemV1 {
  sourceObjectRef: OpaqueExternalRefV1;
  itemType: PortableItemTypeV1;
  payload: JsonValue;
  capturedAt?: string;
  sourceSchemaVersion?: string;
}

/** Source adapters only acquire and parse into staging; they never call canonical writers. */
export interface AgentImportSourceAdapterV1 {
  describe(): AdapterDescriptorV1;
  probe(
    locator: SourceLocatorV1,
    context: SourceProbeContextV1,
  ): Promise<SourceProbeResultV1>;
  acquire(request: AcquireRequestV1, sink: StagingSinkV1): Promise<AcquireReceiptV1>;
  parse(
    archiveRef: PortabilityRecordRefV1,
    context: ParseContextV1,
  ): AsyncIterable<RawSourceItemV1>;
}

export interface PortabilityValidationIssueV1 {
  code: string;
  path: string;
  message: string;
}

export interface PortabilityValidationResultV1<T> {
  valid: boolean;
  value?: T;
  issues: PortabilityValidationIssueV1[];
}

export interface PortabilityDecodeOptionsV1 {
  expectedTenantRef?: string;
  maxItems?: number;
  rejectSecrets?: boolean;
}

export class PortabilityValidationError extends Error {
  readonly code = 'agent_portability_validation_error';
  readonly issues: PortabilityValidationIssueV1[];

  constructor(issues: PortabilityValidationIssueV1[]) {
    super(`agent portability contract validation failed (${issues.length} issue(s))`);
    this.name = 'PortabilityValidationError';
    this.issues = issues;
  }
}

export interface PortableSecretViolationV1 {
  path: string;
  kind: 'forbidden_key' | 'private_key' | 'bearer_token' | 'jwt' | 'api_token';
}

const RFC3339_UTC =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?Z$/;
const HEX_64 = /^[0-9a-f]{64}$/;
const REASON_CODE = /^[a-z][a-z0-9_]{1,79}$/;
const EXTENSION_NAMESPACE = /^[a-z][a-z0-9-]*(?:\.[a-z0-9-]+)+$/;
const FORBIDDEN_SECRET_KEYS = new Set([
  'accesstoken',
  'refreshtoken',
  'apikey',
  'authorization',
  'cookie',
  'sessioncookie',
  'sessionsecret',
  'clientsecret',
  'privatekey',
  'mnemonic',
  'seedphrase',
  'walletsigner',
  'mpcshare',
  'devicecredential',
  'partnercredential',
  'credentials',
]);

const PACKAGE_ALLOWED_KEYS = [
  'manifest',
  'sources',
  'identityClaims',
  'items',
  'attachments',
  'provenance',
  'consentEvidence',
  'integrityProofs',
  'extensionData',
] as const;

function issue(
  issues: PortabilityValidationIssueV1[],
  code: string,
  path: string,
  message: string,
): void {
  issues.push({ code, path, message });
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function objectAt(
  value: unknown,
  path: string,
  issues: PortabilityValidationIssueV1[],
): Record<string, unknown> | null {
  if (!isPlainObject(value)) {
    issue(issues, 'invalid_type', path, 'expected a plain object');
    return null;
  }
  return value;
}

function strictKeys(
  object: Record<string, unknown>,
  allowed: readonly string[],
  required: readonly string[],
  path: string,
  issues: PortabilityValidationIssueV1[],
): void {
  for (const key of Object.keys(object)) {
    if (!allowed.includes(key)) {
      issue(issues, 'unknown_field', `${path}.${key}`, 'field is not defined by this schema');
    }
  }
  for (const key of required) {
    if (!Object.prototype.hasOwnProperty.call(object, key)) {
      issue(issues, 'missing_field', `${path}.${key}`, 'required field is missing');
    }
  }
}

function nonEmptyString(
  value: unknown,
  path: string,
  issues: PortabilityValidationIssueV1[],
  maxLength = 512,
): void {
  if (
    typeof value !== 'string' ||
    value.trim().length === 0 ||
    value.length > maxLength ||
    /[\u0000-\u001f\u007f]/.test(value)
  ) {
    issue(issues, 'invalid_string', path, 'expected a bounded non-empty string without control characters');
  }
}

function optionalString(
  value: unknown,
  path: string,
  issues: PortabilityValidationIssueV1[],
  maxLength = 512,
): void {
  if (value !== undefined) nonEmptyString(value, path, issues, maxLength);
}

function timestamp(
  value: unknown,
  path: string,
  issues: PortabilityValidationIssueV1[],
): void {
  if (
    typeof value !== 'string' ||
    !RFC3339_UTC.test(value) ||
    !Number.isFinite(Date.parse(value))
  ) {
    issue(issues, 'invalid_timestamp', path, 'expected an RFC 3339 UTC timestamp');
  }
}

function optionalTimestamp(
  value: unknown,
  path: string,
  issues: PortabilityValidationIssueV1[],
): void {
  if (value !== undefined) timestamp(value, path, issues);
}

function nonNegativeInteger(
  value: unknown,
  path: string,
  issues: PortabilityValidationIssueV1[],
): void {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
    issue(issues, 'invalid_integer', path, 'expected a non-negative safe integer');
  }
}

function optionalPositiveInteger(
  value: unknown,
  path: string,
  issues: PortabilityValidationIssueV1[],
): void {
  if (
    value !== undefined &&
    (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 1)
  ) {
    issue(issues, 'invalid_integer', path, 'expected a positive safe integer');
  }
}

function confidence(
  value: unknown,
  path: string,
  issues: PortabilityValidationIssueV1[],
): void {
  if (
    value !== undefined &&
    (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 1)
  ) {
    issue(issues, 'invalid_confidence', path, 'expected a finite number between 0 and 1');
  }
}

function oneOf<T extends string>(
  value: unknown,
  allowed: readonly T[],
  path: string,
  issues: PortabilityValidationIssueV1[],
): value is T {
  if (typeof value !== 'string' || !(allowed as readonly string[]).includes(value)) {
    issue(issues, 'invalid_enum', path, 'value is not a recognized enum member');
    return false;
  }
  return true;
}

function stringArray(
  value: unknown,
  path: string,
  issues: PortabilityValidationIssueV1[],
  options: { maxItems?: number; reasonCodes?: boolean } = {},
): void {
  if (!Array.isArray(value)) {
    issue(issues, 'invalid_type', path, 'expected an array');
    return;
  }
  if (value.length > (options.maxItems ?? 1000)) {
    issue(issues, 'resource_limit', path, 'array exceeds the contract item limit');
  }
  value.forEach((entry: unknown, index: number) => {
    nonEmptyString(entry, `${path}[${index}]`, issues, 256);
    if (
      options.reasonCodes &&
      typeof entry === 'string' &&
      !REASON_CODE.test(entry)
    ) {
      issue(issues, 'invalid_reason_code', `${path}[${index}]`, 'reason code grammar is invalid');
    }
  });
}

function schemaVersion(
  value: unknown,
  path: string,
  issues: PortabilityValidationIssueV1[],
): void {
  if (value !== AGENT_PORTABILITY_SCHEMA_VERSION) {
    issue(issues, 'unsupported_schema', path, 'unsupported Agent Portability schema version');
  }
}

function digestRef(
  value: unknown,
  path: string,
  issues: PortabilityValidationIssueV1[],
): void {
  const object = objectAt(value, path, issues);
  if (!object) return;
  strictKeys(
    object,
    ['algorithm', 'canonicalization', 'value'],
    ['algorithm', 'canonicalization', 'value'],
    path,
    issues,
  );
  if (object.algorithm !== 'sha-256') {
    issue(issues, 'invalid_digest', `${path}.algorithm`, 'only sha-256 is supported');
  }
  if (object.canonicalization !== AGENT_PORTABILITY_CANONICALIZATION) {
    issue(issues, 'invalid_digest', `${path}.canonicalization`, 'canonicalization must be jcs/1');
  }
  if (typeof object.value !== 'string' || !HEX_64.test(object.value)) {
    issue(issues, 'invalid_digest', `${path}.value`, 'digest must be 64 lower-case hex characters');
  }
}

function extensionData(
  value: unknown,
  path: string,
  issues: PortabilityValidationIssueV1[],
): void {
  if (value === undefined) return;
  const object = objectAt(value, path, issues);
  if (!object) return;
  for (const [namespace, extensionValue] of Object.entries(object)) {
    if (!EXTENSION_NAMESPACE.test(namespace)) {
      issue(issues, 'extension_invalid', `${path}.${namespace}`, 'extension key must be namespaced');
    }
    validateJsonValue(extensionValue, `${path}.${namespace}`, issues);
  }
}

function validateJsonValue(
  value: unknown,
  path: string,
  issues: PortabilityValidationIssueV1[],
  depth = 0,
  budget: { nodes: number } = { nodes: 0 },
): void {
  budget.nodes += 1;
  if (budget.nodes > 100_000) {
    issue(issues, 'resource_limit', path, 'JSON node budget exceeded');
    return;
  }
  if (depth > 64) {
    issue(issues, 'resource_limit', path, 'JSON nesting depth exceeded');
    return;
  }
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      issue(issues, 'invalid_json', path, 'non-finite numbers are not valid portable JSON');
    }
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((entry: unknown, index: number) => {
      validateJsonValue(entry, `${path}[${index}]`, issues, depth + 1, budget);
    });
    return;
  }
  if (isPlainObject(value)) {
    for (const [key, entry] of Object.entries(value)) {
      if (key.length === 0 || key.length > 256 || /[\u0000-\u001f\u007f]/.test(key)) {
        issue(issues, 'invalid_json', `${path}.${key}`, 'JSON object key is invalid');
      }
      validateJsonValue(entry, `${path}.${key}`, issues, depth + 1, budget);
    }
    return;
  }
  issue(issues, 'invalid_json', path, 'value is not JSON-compatible');
}

function recordRef(
  value: unknown,
  path: string,
  issues: PortabilityValidationIssueV1[],
  expectedTenantRef?: string,
): void {
  const object = objectAt(value, path, issues);
  if (!object) return;
  strictKeys(
    object,
    ['kind', 'id', 'version', 'tenantRef', 'digest'],
    ['kind', 'id'],
    path,
    issues,
  );
  oneOf(object.kind, PORTABILITY_RECORD_KINDS, `${path}.kind`, issues);
  nonEmptyString(object.id, `${path}.id`, issues, 512);
  if (object.version !== undefined) nonNegativeInteger(object.version, `${path}.version`, issues);
  optionalString(object.tenantRef, `${path}.tenantRef`, issues, 256);
  if (
    expectedTenantRef &&
    object.tenantRef !== undefined &&
    object.tenantRef !== expectedTenantRef
  ) {
    issue(issues, 'tenant_mismatch', `${path}.tenantRef`, 'reference belongs to another tenant');
  }
  if (object.digest !== undefined) digestRef(object.digest, `${path}.digest`, issues);
}

function recordRefArray(
  value: unknown,
  path: string,
  issues: PortabilityValidationIssueV1[],
  expectedTenantRef?: string,
  maxItems = 10_000,
): void {
  if (!Array.isArray(value)) {
    issue(issues, 'invalid_type', path, 'expected an array');
    return;
  }
  if (value.length > maxItems) {
    issue(issues, 'resource_limit', path, 'reference array exceeds item limit');
  }
  value.forEach((entry: unknown, index: number) => {
    recordRef(entry, `${path}[${index}]`, issues, expectedTenantRef);
  });
}

function externalRef(
  value: unknown,
  path: string,
  issues: PortabilityValidationIssueV1[],
): void {
  const object = objectAt(value, path, issues);
  if (!object) return;
  strictKeys(
    object,
    ['namespace', 'objectType', 'id', 'version'],
    ['namespace', 'objectType', 'id'],
    path,
    issues,
  );
  nonEmptyString(object.namespace, `${path}.namespace`, issues, 128);
  nonEmptyString(object.objectType, `${path}.objectType`, issues, 128);
  nonEmptyString(object.id, `${path}.id`, issues, 512);
  optionalString(object.version, `${path}.version`, issues, 128);
}

function capabilityEntry(
  value: unknown,
  path: string,
  issues: PortabilityValidationIssueV1[],
): void {
  const object = objectAt(value, path, issues);
  if (!object) return;
  strictKeys(
    object,
    ['category', 'availability', 'reasonCodes', 'maxItems', 'maxBytes', 'extensionData'],
    ['category', 'availability', 'reasonCodes'],
    path,
    issues,
  );
  oneOf(object.category, PORTABLE_ITEM_TYPES, `${path}.category`, issues);
  oneOf(
    object.availability,
    SOURCE_CAPABILITY_AVAILABILITY,
    `${path}.availability`,
    issues,
  );
  stringArray(object.reasonCodes, `${path}.reasonCodes`, issues, {
    maxItems: 100,
    reasonCodes: true,
  });
  optionalPositiveInteger(object.maxItems, `${path}.maxItems`, issues);
  optionalPositiveInteger(object.maxBytes, `${path}.maxBytes`, issues);
  extensionData(object.extensionData, `${path}.extensionData`, issues);
}

function capabilityManifest(
  value: unknown,
  path: string,
  issues: PortabilityValidationIssueV1[],
): void {
  const object = objectAt(value, path, issues);
  if (!object) return;
  strictKeys(
    object,
    ['schemaVersion', 'overall', 'verifiedAt', 'entries', 'limitations', 'extensionData'],
    ['schemaVersion', 'overall', 'verifiedAt', 'entries', 'limitations'],
    path,
    issues,
  );
  schemaVersion(object.schemaVersion, `${path}.schemaVersion`, issues);
  oneOf(object.overall, SOURCE_CAPABILITY_AVAILABILITY, `${path}.overall`, issues);
  timestamp(object.verifiedAt, `${path}.verifiedAt`, issues);
  if (!Array.isArray(object.entries)) {
    issue(issues, 'invalid_type', `${path}.entries`, 'expected an array');
  } else {
    if (object.entries.length > PORTABLE_ITEM_TYPES.length) {
      issue(issues, 'resource_limit', `${path}.entries`, 'too many capability entries');
    }
    object.entries.forEach((entry: unknown, index: number) => {
      capabilityEntry(entry, `${path}.entries[${index}]`, issues);
    });
  }
  stringArray(object.limitations, `${path}.limitations`, issues, { maxItems: 100 });
  extensionData(object.extensionData, `${path}.extensionData`, issues);
}

function importedSource(
  value: unknown,
  path: string,
  issues: PortabilityValidationIssueV1[],
  expectedTenantRef?: string,
): void {
  const object = objectAt(value, path, issues);
  if (!object) return;
  strictKeys(
    object,
    [
      'schemaVersion',
      'sourceId',
      'tenantRef',
      'provider',
      'sourceType',
      'externalObjectRefs',
      'adapter',
      'capabilityManifest',
      'ownershipEvidenceRef',
      'consentEvidenceRef',
      'acquiredAt',
      'status',
      'extensionData',
    ],
    [
      'schemaVersion',
      'sourceId',
      'tenantRef',
      'provider',
      'sourceType',
      'externalObjectRefs',
      'adapter',
      'capabilityManifest',
      'ownershipEvidenceRef',
      'consentEvidenceRef',
      'acquiredAt',
      'status',
    ],
    path,
    issues,
  );
  schemaVersion(object.schemaVersion, `${path}.schemaVersion`, issues);
  nonEmptyString(object.sourceId, `${path}.sourceId`, issues, 256);
  nonEmptyString(object.tenantRef, `${path}.tenantRef`, issues, 256);
  if (expectedTenantRef && object.tenantRef !== expectedTenantRef) {
    issue(issues, 'tenant_mismatch', `${path}.tenantRef`, 'source belongs to another tenant');
  }
  nonEmptyString(object.provider, `${path}.provider`, issues, 128);
  oneOf(object.sourceType, IMPORT_SOURCE_TYPES, `${path}.sourceType`, issues);
  if (!Array.isArray(object.externalObjectRefs)) {
    issue(issues, 'invalid_type', `${path}.externalObjectRefs`, 'expected an array');
  } else {
    if (object.externalObjectRefs.length > 1000) {
      issue(issues, 'resource_limit', `${path}.externalObjectRefs`, 'too many external refs');
    }
    object.externalObjectRefs.forEach((entry: unknown, index: number) => {
      externalRef(entry, `${path}.externalObjectRefs[${index}]`, issues);
    });
  }
  const adapter = objectAt(object.adapter, `${path}.adapter`, issues);
  if (adapter) {
    strictKeys(adapter, ['id', 'version'], ['id', 'version'], `${path}.adapter`, issues);
    nonEmptyString(adapter.id, `${path}.adapter.id`, issues, 128);
    nonEmptyString(adapter.version, `${path}.adapter.version`, issues, 64);
  }
  capabilityManifest(object.capabilityManifest, `${path}.capabilityManifest`, issues);
  recordRef(object.ownershipEvidenceRef, `${path}.ownershipEvidenceRef`, issues, expectedTenantRef);
  recordRef(object.consentEvidenceRef, `${path}.consentEvidenceRef`, issues, expectedTenantRef);
  timestamp(object.acquiredAt, `${path}.acquiredAt`, issues);
  oneOf(object.status, SOURCE_LIFECYCLE_STATUSES, `${path}.status`, issues);
  extensionData(object.extensionData, `${path}.extensionData`, issues);
}

function portableItem(
  value: unknown,
  path: string,
  issues: PortabilityValidationIssueV1[],
  expectedTenantRef?: string,
): void {
  const object = objectAt(value, path, issues);
  if (!object) return;
  strictKeys(
    object,
    [
      'schemaVersion',
      'itemId',
      'itemType',
      'payload',
      'contentDigest',
      'sourceRefs',
      'derivedFromRefs',
      'capturedAt',
      'exportedAt',
      'sourceSchemaVersion',
      'classification',
      'confidence',
      'lossiness',
      'sensitivity',
      'extensionData',
    ],
    [
      'schemaVersion',
      'itemId',
      'itemType',
      'payload',
      'contentDigest',
      'sourceRefs',
      'derivedFromRefs',
      'classification',
      'lossiness',
      'sensitivity',
    ],
    path,
    issues,
  );
  schemaVersion(object.schemaVersion, `${path}.schemaVersion`, issues);
  nonEmptyString(object.itemId, `${path}.itemId`, issues, 256);
  oneOf(object.itemType, PORTABLE_ITEM_TYPES, `${path}.itemType`, issues);
  validateJsonValue(object.payload, `${path}.payload`, issues);
  digestRef(object.contentDigest, `${path}.contentDigest`, issues);
  recordRefArray(object.sourceRefs, `${path}.sourceRefs`, issues, expectedTenantRef);
  if (Array.isArray(object.sourceRefs) && object.sourceRefs.length === 0) {
    issue(issues, 'missing_source_ref', `${path}.sourceRefs`, 'portable items require at least one source');
  }
  recordRefArray(object.derivedFromRefs, `${path}.derivedFromRefs`, issues, expectedTenantRef);
  optionalTimestamp(object.capturedAt, `${path}.capturedAt`, issues);
  optionalTimestamp(object.exportedAt, `${path}.exportedAt`, issues);
  optionalString(object.sourceSchemaVersion, `${path}.sourceSchemaVersion`, issues, 128);
  oneOf(
    object.classification,
    PORTABLE_ITEM_CLASSIFICATIONS,
    `${path}.classification`,
    issues,
  );
  confidence(object.confidence, `${path}.confidence`, issues);
  oneOf(object.lossiness, PORTABLE_ITEM_LOSSINESS, `${path}.lossiness`, issues);
  oneOf(object.sensitivity, PORTABILITY_DATA_CLASSES, `${path}.sensitivity`, issues);
  extensionData(object.extensionData, `${path}.extensionData`, issues);
  if (isPlainObject(object.contentDigest)) {
    try {
      if (!verifyDigest(object.payload, object.contentDigest as unknown as DigestRef)) {
        issue(issues, 'item_digest_mismatch', `${path}.contentDigest`, 'item payload digest does not match');
      }
    } catch {
      issue(issues, 'item_digest_mismatch', `${path}.contentDigest`, 'item payload cannot be canonicalized');
    }
  }
}

function identityClaim(
  value: unknown,
  path: string,
  issues: PortabilityValidationIssueV1[],
  expectedTenantRef?: string,
): void {
  const object = objectAt(value, path, issues);
  if (!object) return;
  strictKeys(
    object,
    ['schemaVersion', 'claimId', 'sourceRef', 'claimType', 'value', 'confidence', 'assertedAt', 'extensionData'],
    ['schemaVersion', 'claimId', 'sourceRef', 'claimType', 'value', 'assertedAt'],
    path,
    issues,
  );
  schemaVersion(object.schemaVersion, `${path}.schemaVersion`, issues);
  nonEmptyString(object.claimId, `${path}.claimId`, issues, 256);
  recordRef(object.sourceRef, `${path}.sourceRef`, issues, expectedTenantRef);
  oneOf(object.claimType, SOURCE_IDENTITY_CLAIM_TYPES, `${path}.claimType`, issues);
  validateJsonValue(object.value, `${path}.value`, issues);
  confidence(object.confidence, `${path}.confidence`, issues);
  timestamp(object.assertedAt, `${path}.assertedAt`, issues);
  extensionData(object.extensionData, `${path}.extensionData`, issues);
}

function consentEvidence(
  value: unknown,
  path: string,
  issues: PortabilityValidationIssueV1[],
  expectedTenantRef?: string,
): void {
  const object = objectAt(value, path, issues);
  if (!object) return;
  strictKeys(
    object,
    ['schemaVersion', 'consentId', 'principalRef', 'sourceRef', 'categories', 'grantedAt', 'expiresAt', 'evidenceRef', 'extensionData'],
    ['schemaVersion', 'consentId', 'principalRef', 'sourceRef', 'categories', 'grantedAt', 'evidenceRef'],
    path,
    issues,
  );
  schemaVersion(object.schemaVersion, `${path}.schemaVersion`, issues);
  nonEmptyString(object.consentId, `${path}.consentId`, issues, 256);
  nonEmptyString(object.principalRef, `${path}.principalRef`, issues, 256);
  recordRef(object.sourceRef, `${path}.sourceRef`, issues, expectedTenantRef);
  if (!Array.isArray(object.categories)) {
    issue(issues, 'invalid_type', `${path}.categories`, 'expected an array');
  } else {
    object.categories.forEach((entry: unknown, index: number) => {
      oneOf(entry, PORTABLE_ITEM_TYPES, `${path}.categories[${index}]`, issues);
    });
  }
  timestamp(object.grantedAt, `${path}.grantedAt`, issues);
  optionalTimestamp(object.expiresAt, `${path}.expiresAt`, issues);
  recordRef(object.evidenceRef, `${path}.evidenceRef`, issues, expectedTenantRef);
  extensionData(object.extensionData, `${path}.extensionData`, issues);
}

function provenanceRecord(
  value: unknown,
  path: string,
  issues: PortabilityValidationIssueV1[],
  expectedTenantRef?: string,
): void {
  const object = objectAt(value, path, issues);
  if (!object) return;
  strictKeys(
    object,
    ['schemaVersion', 'provenanceId', 'subjectRef', 'sourceRef', 'event', 'recordedAt', 'transformation', 'evidenceRefs', 'classification', 'extensionData'],
    ['schemaVersion', 'provenanceId', 'subjectRef', 'sourceRef', 'event', 'recordedAt', 'evidenceRefs', 'classification'],
    path,
    issues,
  );
  schemaVersion(object.schemaVersion, `${path}.schemaVersion`, issues);
  nonEmptyString(object.provenanceId, `${path}.provenanceId`, issues, 256);
  recordRef(object.subjectRef, `${path}.subjectRef`, issues, expectedTenantRef);
  recordRef(object.sourceRef, `${path}.sourceRef`, issues, expectedTenantRef);
  oneOf(object.event, PORTABILITY_PROVENANCE_EVENTS, `${path}.event`, issues);
  timestamp(object.recordedAt, `${path}.recordedAt`, issues);
  if (object.transformation !== undefined) {
    const transformation = objectAt(object.transformation, `${path}.transformation`, issues);
    if (transformation) {
      strictKeys(
        transformation,
        ['id', 'version', 'ruleDigest'],
        ['id', 'version'],
        `${path}.transformation`,
        issues,
      );
      nonEmptyString(transformation.id, `${path}.transformation.id`, issues, 128);
      nonEmptyString(transformation.version, `${path}.transformation.version`, issues, 64);
      if (transformation.ruleDigest !== undefined) {
        digestRef(transformation.ruleDigest, `${path}.transformation.ruleDigest`, issues);
      }
    }
  }
  recordRefArray(object.evidenceRefs, `${path}.evidenceRefs`, issues, expectedTenantRef);
  oneOf(
    object.classification,
    PORTABLE_ITEM_CLASSIFICATIONS,
    `${path}.classification`,
    issues,
  );
  extensionData(object.extensionData, `${path}.extensionData`, issues);
}

function attachment(
  value: unknown,
  path: string,
  issues: PortabilityValidationIssueV1[],
  expectedTenantRef?: string,
): void {
  const object = objectAt(value, path, issues);
  if (!object) return;
  strictKeys(
    object,
    ['schemaVersion', 'attachmentId', 'fileName', 'mediaType', 'byteLength', 'contentDigest', 'objectRef', 'sourceRefs', 'classification', 'sensitivity', 'extensionData'],
    ['schemaVersion', 'attachmentId', 'mediaType', 'byteLength', 'contentDigest', 'objectRef', 'sourceRefs', 'classification', 'sensitivity'],
    path,
    issues,
  );
  schemaVersion(object.schemaVersion, `${path}.schemaVersion`, issues);
  nonEmptyString(object.attachmentId, `${path}.attachmentId`, issues, 256);
  optionalString(object.fileName, `${path}.fileName`, issues, 512);
  nonEmptyString(object.mediaType, `${path}.mediaType`, issues, 128);
  nonNegativeInteger(object.byteLength, `${path}.byteLength`, issues);
  digestRef(object.contentDigest, `${path}.contentDigest`, issues);
  recordRef(object.objectRef, `${path}.objectRef`, issues, expectedTenantRef);
  recordRefArray(object.sourceRefs, `${path}.sourceRefs`, issues, expectedTenantRef);
  oneOf(
    object.classification,
    PORTABLE_ITEM_CLASSIFICATIONS,
    `${path}.classification`,
    issues,
  );
  oneOf(object.sensitivity, PORTABILITY_DATA_CLASSES, `${path}.sensitivity`, issues);
  extensionData(object.extensionData, `${path}.extensionData`, issues);
}

function integrityProof(
  value: unknown,
  path: string,
  issues: PortabilityValidationIssueV1[],
): void {
  const object = objectAt(value, path, issues);
  if (!object) return;
  strictKeys(
    object,
    ['schemaVersion', 'kind', 'payloadDigest', 'issuerRef', 'scheme', 'keyId', 'signature', 'signedAt', 'extensionData'],
    ['schemaVersion', 'kind', 'payloadDigest'],
    path,
    issues,
  );
  schemaVersion(object.schemaVersion, `${path}.schemaVersion`, issues);
  oneOf(object.kind, ['digest', 'signature'] as const, `${path}.kind`, issues);
  digestRef(object.payloadDigest, `${path}.payloadDigest`, issues);
  optionalString(object.issuerRef, `${path}.issuerRef`, issues, 256);
  optionalString(object.scheme, `${path}.scheme`, issues, 64);
  optionalString(object.keyId, `${path}.keyId`, issues, 256);
  optionalString(object.signature, `${path}.signature`, issues, 8192);
  optionalTimestamp(object.signedAt, `${path}.signedAt`, issues);
  if (object.kind === 'signature') {
    for (const field of ['issuerRef', 'scheme', 'keyId', 'signature', 'signedAt'] as const) {
      if (object[field] === undefined) {
        issue(issues, 'missing_field', `${path}.${field}`, 'signature proof field is required');
      }
    }
  }
  extensionData(object.extensionData, `${path}.extensionData`, issues);
}

function packageManifest(
  value: unknown,
  path: string,
  issues: PortabilityValidationIssueV1[],
  expectedTenantRef?: string,
): void {
  const object = objectAt(value, path, issues);
  if (!object) return;
  strictKeys(
    object,
    ['schemaVersion', 'packageId', 'createdAt', 'producer', 'tenantRef', 'ownerPrincipalRef', 'contentDigest', 'extensionData'],
    ['schemaVersion', 'packageId', 'createdAt', 'producer', 'tenantRef', 'ownerPrincipalRef', 'contentDigest'],
    path,
    issues,
  );
  schemaVersion(object.schemaVersion, `${path}.schemaVersion`, issues);
  nonEmptyString(object.packageId, `${path}.packageId`, issues, 256);
  timestamp(object.createdAt, `${path}.createdAt`, issues);
  const producer = objectAt(object.producer, `${path}.producer`, issues);
  if (producer) {
    strictKeys(producer, ['kind', 'id', 'version'], ['kind', 'id', 'version'], `${path}.producer`, issues);
    oneOf(producer.kind, PORTABILITY_PACKAGE_PRODUCER_KINDS, `${path}.producer.kind`, issues);
    nonEmptyString(producer.id, `${path}.producer.id`, issues, 128);
    nonEmptyString(producer.version, `${path}.producer.version`, issues, 64);
  }
  nonEmptyString(object.tenantRef, `${path}.tenantRef`, issues, 256);
  if (expectedTenantRef && object.tenantRef !== expectedTenantRef) {
    issue(issues, 'tenant_mismatch', `${path}.tenantRef`, 'package belongs to another tenant');
  }
  nonEmptyString(object.ownerPrincipalRef, `${path}.ownerPrincipalRef`, issues, 256);
  digestRef(object.contentDigest, `${path}.contentDigest`, issues);
  extensionData(object.extensionData, `${path}.extensionData`, issues);
}

function validateUniqueIds(
  entries: unknown[],
  key: string,
  path: string,
  issues: PortabilityValidationIssueV1[],
): Set<string> {
  const seen = new Set<string>();
  entries.forEach((entry: unknown, index: number) => {
    if (!isPlainObject(entry) || typeof entry[key] !== 'string') return;
    const id = entry[key] as string;
    if (seen.has(id)) {
      issue(issues, 'duplicate_id', `${path}[${index}].${key}`, 'identifier is duplicated');
    }
    seen.add(id);
  });
  return seen;
}

function validateReferenceResolution(
  object: Record<string, unknown>,
  sourceIds: Set<string>,
  itemIds: Set<string>,
  issues: PortabilityValidationIssueV1[],
): void {
  const checkSourceRef = (value: unknown, path: string): void => {
    if (!isPlainObject(value)) return;
    if (value.kind === 'import_source' && typeof value.id === 'string' && !sourceIds.has(value.id)) {
      issue(issues, 'unresolved_ref', path, 'source reference does not resolve inside this package');
    }
  };
  const checkItemRef = (value: unknown, path: string): void => {
    if (!isPlainObject(value)) return;
    if (value.kind === 'portable_item' && typeof value.id === 'string' && !itemIds.has(value.id)) {
      issue(issues, 'unresolved_ref', path, 'item reference does not resolve inside this package');
    }
  };

  if (Array.isArray(object.items)) {
    object.items.forEach((entry: unknown, itemIndex: number) => {
      if (!isPlainObject(entry)) return;
      if (Array.isArray(entry.sourceRefs)) {
        entry.sourceRefs.forEach((ref: unknown, refIndex: number) => {
          checkSourceRef(ref, `$.items[${itemIndex}].sourceRefs[${refIndex}]`);
        });
      }
      if (Array.isArray(entry.derivedFromRefs)) {
        entry.derivedFromRefs.forEach((ref: unknown, refIndex: number) => {
          checkItemRef(ref, `$.items[${itemIndex}].derivedFromRefs[${refIndex}]`);
        });
      }
    });
  }

  const sourceLinkedCollections: Array<[string, unknown]> = [
    ['identityClaims', object.identityClaims],
    ['consentEvidence', object.consentEvidence],
    ['provenance', object.provenance],
  ];
  sourceLinkedCollections.forEach(([collectionName, collection]) => {
    if (!Array.isArray(collection)) return;
    collection.forEach((entry: unknown, index: number) => {
      if (!isPlainObject(entry)) return;
      checkSourceRef(entry.sourceRef, `$.${collectionName}[${index}].sourceRef`);
      if (collectionName === 'provenance') {
        checkItemRef(entry.subjectRef, `$.${collectionName}[${index}].subjectRef`);
      }
    });
  });
}

function packageDigestPayload(
  packageValue: SovereignAgentPackageV1 | UnsealedSovereignAgentPackageV1,
): JsonValue {
  const manifest = packageValue.manifest as SovereignAgentPackageManifestV1 | Omit<
    SovereignAgentPackageManifestV1,
    'contentDigest'
  >;
  const manifestWithoutDigest: Record<string, JsonValue> = {};
  Object.entries(manifest).forEach(([key, value]: [string, unknown]) => {
    if (key !== 'contentDigest' && value !== undefined) {
      manifestWithoutDigest[key] = value as JsonValue;
    }
  });
  return {
    manifest: manifestWithoutDigest,
    sources: packageValue.sources as unknown as JsonValue,
    identityClaims: packageValue.identityClaims as unknown as JsonValue,
    items: packageValue.items as unknown as JsonValue,
    attachments: packageValue.attachments as unknown as JsonValue,
    provenance: packageValue.provenance as unknown as JsonValue,
    consentEvidence: packageValue.consentEvidence as unknown as JsonValue,
    extensionData: (packageValue.extensionData ?? {}) as unknown as JsonValue,
  };
}

export function computeSovereignAgentPackageDigest(
  packageValue: SovereignAgentPackageV1 | UnsealedSovereignAgentPackageV1,
): DigestRef {
  return computeDigest(packageDigestPayload(packageValue));
}

export function sealSovereignAgentPackageV1(
  packageValue: UnsealedSovereignAgentPackageV1,
): SovereignAgentPackageV1 {
  const contentDigest = computeSovereignAgentPackageDigest(packageValue);
  return {
    ...packageValue,
    manifest: {
      ...packageValue.manifest,
      contentDigest,
    },
    integrityProofs: packageValue.integrityProofs ?? [],
  };
}

export function createPortableItemEnvelopeV1<T extends JsonValue>(
  input: Omit<PortableItemEnvelopeV1<T>, 'contentDigest'>,
): PortableItemEnvelopeV1<T> {
  return {
    ...input,
    contentDigest: computeDigest(input.payload),
  };
}

export function verifySovereignAgentPackageIntegrity(
  packageValue: SovereignAgentPackageV1,
): boolean {
  try {
    return verifyDigest(packageDigestPayload(packageValue), packageValue.manifest.contentDigest);
  } catch {
    return false;
  }
}

function normalizeSecretKey(key: string): string {
  return key.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
}

export function findPortableSecretViolations(input: unknown): PortableSecretViolationV1[] {
  const violations: PortableSecretViolationV1[] = [];
  const seen = new Set<object>();

  const visit = (value: unknown, path: string, depth: number): void => {
    if (depth > 64 || value === null || value === undefined) return;
    if (typeof value === 'string') {
      if (/-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----/.test(value)) {
        violations.push({ path, kind: 'private_key' });
      } else if (/^Bearer\s+[A-Za-z0-9._~+\/-]+=*$/i.test(value)) {
        violations.push({ path, kind: 'bearer_token' });
      } else if (/^eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(value)) {
        violations.push({ path, kind: 'jwt' });
      } else if (
        /\bsk-[A-Za-z0-9_-]{20,}\b/.test(value) ||
        /\bAKIA[A-Z0-9]{16,20}\b/.test(value)
      ) {
        violations.push({ path, kind: 'api_token' });
      }
      return;
    }
    if (typeof value !== 'object') return;
    if (seen.has(value)) return;
    seen.add(value);
    if (Array.isArray(value)) {
      value.forEach((entry: unknown, index: number) => visit(entry, `${path}[${index}]`, depth + 1));
      return;
    }
    for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
      const childPath = `${path}.${key}`;
      if (FORBIDDEN_SECRET_KEYS.has(normalizeSecretKey(key))) {
        violations.push({ path: childPath, kind: 'forbidden_key' });
      }
      visit(entry, childPath, depth + 1);
    }
  };

  visit(input, '$', 0);
  return violations;
}

export function validateImportedAgentSourceV1(
  input: unknown,
  options: PortabilityDecodeOptionsV1 = {},
): PortabilityValidationResultV1<ImportedAgentSourceV1> {
  const issues: PortabilityValidationIssueV1[] = [];
  importedSource(input, '$', issues, options.expectedTenantRef);
  if (options.rejectSecrets !== false) {
    findPortableSecretViolations(input).forEach((violation: PortableSecretViolationV1) => {
      issue(issues, 'secret_prohibited', violation.path, `portable source contains ${violation.kind}`);
    });
  }
  return issues.length === 0
    ? { valid: true, value: input as ImportedAgentSourceV1, issues }
    : { valid: false, issues };
}

export function decodeImportedAgentSourceV1(
  input: unknown,
  options: PortabilityDecodeOptionsV1 = {},
): ImportedAgentSourceV1 {
  const result = validateImportedAgentSourceV1(input, options);
  if (!result.valid || !result.value) throw new PortabilityValidationError(result.issues);
  return result.value;
}

export function validateSovereignAgentPackageV1(
  input: unknown,
  options: PortabilityDecodeOptionsV1 = {},
): PortabilityValidationResultV1<SovereignAgentPackageV1> {
  const issues: PortabilityValidationIssueV1[] = [];
  const object = objectAt(input, '$', issues);
  if (!object) return { valid: false, issues };
  strictKeys(
    object,
    PACKAGE_ALLOWED_KEYS,
    [
      'manifest',
      'sources',
      'identityClaims',
      'items',
      'attachments',
      'provenance',
      'consentEvidence',
      'integrityProofs',
    ],
    '$',
    issues,
  );

  packageManifest(object.manifest, '$.manifest', issues, options.expectedTenantRef);
  const manifestTenant = isPlainObject(object.manifest) && typeof object.manifest.tenantRef === 'string'
    ? object.manifest.tenantRef
    : options.expectedTenantRef;

  if (!Array.isArray(object.sources)) {
    issue(issues, 'invalid_type', '$.sources', 'expected an array');
  } else {
    if (object.sources.length === 0) {
      issue(issues, 'missing_source', '$.sources', 'package requires at least one source');
    }
    if (object.sources.length > 1000) {
      issue(issues, 'resource_limit', '$.sources', 'source count exceeds limit');
    }
    object.sources.forEach((entry: unknown, index: number) => {
      importedSource(entry, `$.sources[${index}]`, issues, manifestTenant);
    });
  }

  const maxItems = options.maxItems ?? 10_000;
  if (!Array.isArray(object.items)) {
    issue(issues, 'invalid_type', '$.items', 'expected an array');
  } else {
    if (object.items.length > maxItems) {
      issue(issues, 'resource_limit', '$.items', 'portable item count exceeds limit');
    }
    object.items.forEach((entry: unknown, index: number) => {
      portableItem(entry, `$.items[${index}]`, issues, manifestTenant);
    });
  }

  if (!Array.isArray(object.identityClaims)) {
    issue(issues, 'invalid_type', '$.identityClaims', 'expected an array');
  } else {
    object.identityClaims.forEach((entry: unknown, index: number) => {
      identityClaim(entry, `$.identityClaims[${index}]`, issues, manifestTenant);
    });
  }

  if (!Array.isArray(object.attachments)) {
    issue(issues, 'invalid_type', '$.attachments', 'expected an array');
  } else {
    object.attachments.forEach((entry: unknown, index: number) => {
      attachment(entry, `$.attachments[${index}]`, issues, manifestTenant);
    });
  }

  if (!Array.isArray(object.provenance)) {
    issue(issues, 'invalid_type', '$.provenance', 'expected an array');
  } else {
    object.provenance.forEach((entry: unknown, index: number) => {
      provenanceRecord(entry, `$.provenance[${index}]`, issues, manifestTenant);
    });
  }

  if (!Array.isArray(object.consentEvidence)) {
    issue(issues, 'invalid_type', '$.consentEvidence', 'expected an array');
  } else {
    if (object.consentEvidence.length === 0) {
      issue(issues, 'missing_consent', '$.consentEvidence', 'package requires consent evidence');
    }
    object.consentEvidence.forEach((entry: unknown, index: number) => {
      consentEvidence(entry, `$.consentEvidence[${index}]`, issues, manifestTenant);
    });
  }

  if (!Array.isArray(object.integrityProofs)) {
    issue(issues, 'invalid_type', '$.integrityProofs', 'expected an array');
  } else {
    object.integrityProofs.forEach((entry: unknown, index: number) => {
      integrityProof(entry, `$.integrityProofs[${index}]`, issues);
    });
  }

  extensionData(object.extensionData, '$.extensionData', issues);

  const sourceIds = Array.isArray(object.sources)
    ? validateUniqueIds(object.sources, 'sourceId', '$.sources', issues)
    : new Set<string>();
  const itemIds = Array.isArray(object.items)
    ? validateUniqueIds(object.items, 'itemId', '$.items', issues)
    : new Set<string>();
  if (Array.isArray(object.identityClaims)) {
    validateUniqueIds(object.identityClaims, 'claimId', '$.identityClaims', issues);
  }
  if (Array.isArray(object.attachments)) {
    validateUniqueIds(object.attachments, 'attachmentId', '$.attachments', issues);
  }
  if (Array.isArray(object.provenance)) {
    validateUniqueIds(object.provenance, 'provenanceId', '$.provenance', issues);
  }
  if (Array.isArray(object.consentEvidence)) {
    validateUniqueIds(object.consentEvidence, 'consentId', '$.consentEvidence', issues);
  }
  validateReferenceResolution(object, sourceIds, itemIds, issues);

  if (isPlainObject(object.manifest) && isPlainObject(object.manifest.contentDigest)) {
    try {
      if (!verifySovereignAgentPackageIntegrity(input as SovereignAgentPackageV1)) {
        issue(issues, 'package_integrity_failed', '$.manifest.contentDigest', 'package content digest does not match');
      }
    } catch {
      issue(issues, 'package_integrity_failed', '$.manifest.contentDigest', 'package cannot be canonicalized');
    }
  }

  if (
    Array.isArray(object.integrityProofs) &&
    isPlainObject(object.manifest) &&
    isPlainObject(object.manifest.contentDigest)
  ) {
    object.integrityProofs.forEach((proof: unknown, index: number) => {
      if (!isPlainObject(proof) || !isPlainObject(proof.payloadDigest)) return;
      const expected = object.manifest as Record<string, unknown>;
      const expectedDigest = expected.contentDigest as Record<string, unknown>;
      if (
        proof.payloadDigest.algorithm !== expectedDigest.algorithm ||
        proof.payloadDigest.canonicalization !== expectedDigest.canonicalization ||
        proof.payloadDigest.value !== expectedDigest.value
      ) {
        issue(
          issues,
          'integrity_proof_mismatch',
          `$.integrityProofs[${index}].payloadDigest`,
          'integrity proof is not bound to the package content digest',
        );
      }
    });
  }

  if (options.rejectSecrets !== false) {
    findPortableSecretViolations(input).forEach((violation: PortableSecretViolationV1) => {
      issue(issues, 'secret_prohibited', violation.path, `portable package contains ${violation.kind}`);
    });
  }

  return issues.length === 0
    ? { valid: true, value: input as SovereignAgentPackageV1, issues }
    : { valid: false, issues };
}

export function decodeSovereignAgentPackageV1(
  input: unknown,
  options: PortabilityDecodeOptionsV1 = {},
): SovereignAgentPackageV1 {
  const result = validateSovereignAgentPackageV1(input, options);
  if (!result.valid || !result.value) throw new PortabilityValidationError(result.issues);
  return result.value;
}

export function encodeSovereignAgentPackageV1(
  packageValue: SovereignAgentPackageV1,
  options: PortabilityDecodeOptionsV1 = {},
): string {
  const validated = decodeSovereignAgentPackageV1(packageValue, options);
  return canonicalizeJson(validated);
}

export function parseSovereignAgentPackageV1(
  serialized: string,
  options: PortabilityDecodeOptionsV1 = {},
): SovereignAgentPackageV1 {
  let parsed: unknown;
  try {
    parsed = JSON.parse(serialized) as unknown;
  } catch {
    throw new PortabilityValidationError([
      { code: 'invalid_json', path: '$', message: 'package is not valid JSON' },
    ]);
  }
  return decodeSovereignAgentPackageV1(parsed, options);
}
