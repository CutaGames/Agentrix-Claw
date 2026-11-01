import type { DigestRef } from './trust-loop-primitives';
import type {
  PortabilityPackageProducerV1,
  PortabilityRecordRefV1,
  PortableItemClassificationV1,
  PortableItemLossinessV1,
  PortableItemTypeV1,
  SovereignAgentPackageV1,
} from './agent-portability';

/** Portability-owned contracts consumed by Continuity; no Trust or canonical-writer DTOs. */
export const AGENT_PORTABILITY_CONTINUITY_SCHEMA_VERSION = '1.0' as const;

export const AP_CE_PACKAGE_REFERENCE_PORT_ID =
  'ap-ce-01.package-reference.v1' as const;
export const AP_CE_EXPORT_PACKAGE_PORT_ID =
  'ap-ce-02.export-package.v1' as const;
export const AP_CE_PACKAGE_VALIDATION_PORT_ID =
  'ap-ce-03.package-validation.v1' as const;
export const AP_CE_RESTORE_MATERIALIZATION_PORT_ID =
  'ap-ce-04.restore-materialization-plan.v1' as const;

export type AgentPortabilityContinuityPortIdV1 =
  | typeof AP_CE_PACKAGE_REFERENCE_PORT_ID
  | typeof AP_CE_EXPORT_PACKAGE_PORT_ID
  | typeof AP_CE_PACKAGE_VALIDATION_PORT_ID
  | typeof AP_CE_RESTORE_MATERIALIZATION_PORT_ID;

export const AGENT_PORTABILITY_CONTINUITY_ENVIRONMENTS = [
  'development',
  'test',
  'local',
  'staging',
  'production',
] as const;
export type AgentPortabilityContinuityEnvironmentV1 =
  (typeof AGENT_PORTABILITY_CONTINUITY_ENVIRONMENTS)[number];

export const AGENT_PORTABILITY_CONTINUITY_EVIDENCE_LEVELS = [
  'contract',
  'local_fixture',
  'runtime',
] as const;
export type AgentPortabilityContinuityEvidenceLevelV1 =
  (typeof AGENT_PORTABILITY_CONTINUITY_EVIDENCE_LEVELS)[number];

export const AGENT_PORTABILITY_CONTINUITY_UNAVAILABLE_REASONS = [
  'bridge_disabled',
  'runtime_environment_forbidden',
  'environment_mismatch',
  'request_invalid',
  'canonical_readers_unavailable',
  'canonical_writers_unavailable',
  'package_not_found',
  'package_invalid',
  'package_substituted',
  'export_receipt_invalid',
  'tenant_mismatch',
  'owner_mismatch',
  'secret_detected',
] as const;
export type AgentPortabilityContinuityUnavailableReasonV1 =
  (typeof AGENT_PORTABILITY_CONTINUITY_UNAVAILABLE_REASONS)[number];

export interface AgentPortabilityContinuityContextV1 {
  tenantRef: string;
  ownerPrincipalRef: string;
  environment: AgentPortabilityContinuityEnvironmentV1;
  intendedAudience: string;
}

export interface AgentPortabilityContinuityUnavailableV1 {
  schemaVersion: typeof AGENT_PORTABILITY_CONTINUITY_SCHEMA_VERSION;
  portId: AgentPortabilityContinuityPortIdV1;
  status: 'unavailable';
  reasonCode: AgentPortabilityContinuityUnavailableReasonV1;
}

export interface PortabilityPackageItemEvidenceV1 {
  itemRef: PortabilityRecordRefV1;
  itemType: PortableItemTypeV1;
  classification: PortableItemClassificationV1;
  lossiness: PortableItemLossinessV1;
  contentDigest: DigestRef;
}

export interface PackageReferenceRequestV1 {
  schemaVersion: typeof AGENT_PORTABILITY_CONTINUITY_SCHEMA_VERSION;
  requestId: string;
  context: AgentPortabilityContinuityContextV1;
  packageRef: PortabilityRecordRefV1;
}

export interface PackageReferenceResolutionV1 {
  schemaVersion: typeof AGENT_PORTABILITY_CONTINUITY_SCHEMA_VERSION;
  portId: typeof AP_CE_PACKAGE_REFERENCE_PORT_ID;
  status: 'resolved';
  packageRef: PortabilityRecordRefV1;
  packageDigest: DigestRef;
  packageSchemaMajor: 1;
  producer: PortabilityPackageProducerV1;
  exportReceiptRef: PortabilityRecordRefV1;
  evidenceLevel: AgentPortabilityContinuityEvidenceLevelV1;
}

export type PackageReferenceResultV1 =
  | PackageReferenceResolutionV1
  | AgentPortabilityContinuityUnavailableV1;

export interface ExportPackageRequestV1 {
  schemaVersion: typeof AGENT_PORTABILITY_CONTINUITY_SCHEMA_VERSION;
  requestId: string;
  context: AgentPortabilityContinuityContextV1;
  agentRef: PortabilityRecordRefV1;
  contentCheckpointRefs: PortabilityRecordRefV1[];
}

export interface ExportPackageSuccessV1 {
  schemaVersion: typeof AGENT_PORTABILITY_CONTINUITY_SCHEMA_VERSION;
  portId: typeof AP_CE_EXPORT_PACKAGE_PORT_ID;
  status: 'exported';
  package: SovereignAgentPackageV1;
  packageRef: PortabilityRecordRefV1;
  packageDigest: DigestRef;
  exportReceiptRef: PortabilityRecordRefV1;
  sourceRefs: PortabilityRecordRefV1[];
  itemEvidence: PortabilityPackageItemEvidenceV1[];
  omissionReasonCodes: string[];
  secretFindingCount: 0;
  evidenceLevel: AgentPortabilityContinuityEvidenceLevelV1;
}

export type ExportPackageResultV1 =
  | ExportPackageSuccessV1
  | AgentPortabilityContinuityUnavailableV1;

export interface ValidatePackageRequestV1 {
  schemaVersion: typeof AGENT_PORTABILITY_CONTINUITY_SCHEMA_VERSION;
  requestId: string;
  context: AgentPortabilityContinuityContextV1;
  package: SovereignAgentPackageV1;
  expectedPackageRef: PortabilityRecordRefV1;
  expectedPackageDigest: DigestRef;
}

export interface ValidatePackageSuccessV1 {
  schemaVersion: typeof AGENT_PORTABILITY_CONTINUITY_SCHEMA_VERSION;
  portId: typeof AP_CE_PACKAGE_VALIDATION_PORT_ID;
  status: 'valid';
  packageRef: PortabilityRecordRefV1;
  packageDigest: DigestRef;
  validationEvidenceRef: PortabilityRecordRefV1;
  itemEvidence: PortabilityPackageItemEvidenceV1[];
  secretFindingCount: 0;
  evidenceLevel: 'contract';
}

export type ValidatePackageResultV1 =
  | ValidatePackageSuccessV1
  | AgentPortabilityContinuityUnavailableV1;

export const PORTABILITY_MATERIALIZATION_TARGET_DOMAINS = [
  'agent',
  'memory',
  'conversation',
  'knowledge',
  'skill_registry',
] as const;
export type PortabilityMaterializationTargetDomainV1 =
  (typeof PORTABILITY_MATERIALIZATION_TARGET_DOMAINS)[number];

export interface PortabilityMaterializationCommandPlanV1 {
  sequence: number;
  commandId: string;
  itemRef: PortabilityRecordRefV1;
  targetDomain: PortabilityMaterializationTargetDomainV1;
  operationKind: string;
  classification: PortableItemClassificationV1;
  lossiness: PortableItemLossinessV1;
  requestDigest: DigestRef;
  requiresCanonicalWriter: true;
  requiresReauthorization: boolean;
  executableState: 'not_applicable' | 'quarantined';
}

export interface RestoreMaterializationRequestV1 {
  schemaVersion: typeof AGENT_PORTABILITY_CONTINUITY_SCHEMA_VERSION;
  requestId: string;
  context: AgentPortabilityContinuityContextV1;
  package: SovereignAgentPackageV1;
  expectedPackageDigest: DigestRef;
  targetAgentRef: PortabilityRecordRefV1;
}

/**
 * `planned` is deliberately not `materialized`: no canonical writer receipt exists yet.
 */
export interface RestoreMaterializationPlanV1 {
  schemaVersion: typeof AGENT_PORTABILITY_CONTINUITY_SCHEMA_VERSION;
  portId: typeof AP_CE_RESTORE_MATERIALIZATION_PORT_ID;
  status: 'planned';
  planRef: PortabilityRecordRefV1;
  packageRef: PortabilityRecordRefV1;
  packageDigest: DigestRef;
  targetAgentRef: PortabilityRecordRefV1;
  commands: PortabilityMaterializationCommandPlanV1[];
  canonicalWritesPerformed: false;
  evidenceLevel: 'contract';
}

export type RestoreMaterializationResultV1 =
  | RestoreMaterializationPlanV1
  | AgentPortabilityContinuityUnavailableV1;

export interface PackageReferencePortV1 {
  resolvePackageReference(
    request: PackageReferenceRequestV1,
  ): Promise<PackageReferenceResultV1>;
}

export interface ExportPackagePortV1 {
  exportPackage(request: ExportPackageRequestV1): Promise<ExportPackageResultV1>;
}

export interface PackageValidationPortV1 {
  validatePackage(
    request: ValidatePackageRequestV1,
  ): Promise<ValidatePackageResultV1>;
}

export interface RestoreMaterializationPortV1 {
  planRestoreMaterialization(
    request: RestoreMaterializationRequestV1,
  ): Promise<RestoreMaterializationResultV1>;
}
