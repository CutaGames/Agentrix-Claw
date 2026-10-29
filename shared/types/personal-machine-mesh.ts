/**
 * Personal Machine Mesh V1 contracts (Layer A) and future Machine Economy
 * additive contracts (Layer B).
 *
 * Layer A is same-owner personal machine orchestration only.
 * Layer B is a future independent cross-owner profile. This file freezes
 * Layer B shapes so later work cannot quietly reuse PMM or paid-skill
 * canaries. Layer B adapters are Unavailable in this round.
 *
 * Do not re-export this module from `shared/types/index.ts`.
 */

import type {
  DeviceEpochFenceV1,
  DeviceRegistryRefV1,
} from "./device-lifecycle";
import {
  canonicalizeJson,
  sha256Hex,
  utf8Encode,
} from "./trust-loop-primitives";

export const PERSONAL_MACHINE_MESH_SCHEMA_VERSION = "1" as const;
export const PERSONAL_MACHINE_MESH_PROFILE =
  "personal-machine-mesh-v1" as const;
export const MACHINE_ECONOMY_PROFILE = "machine-economy-v1" as const;

export const PMM_JOB_TYPE_V1 = "llm.generate.v1" as const;
export const PMM_ROUTE_POLICY_V1 = "byo_only" as const;
export const PMM_JOB_REQUEST_DIGEST_DOMAIN =
  "agentrix:pmm-job-request:v1" as const;
export const PMM_EXECUTION_COMMAND_DIGEST_DOMAIN =
  "agentrix:pmm-execution-command:v1" as const;
export const PMM_CANONICALIZATION_PROFILE = "rfc8785-json-v1" as const;
export const PMM_DIGEST_PROFILE = "sha256-rfc8785-v1" as const;

export const PERSONAL_MACHINE_REASON_CODES_V1 = [
  "PMM_NO_CAPABLE_DESKTOP",
  "PMM_DESKTOP_OFFLINE",
  "PMM_CAPABILITY_STALE",
  "PMM_RUNTIME_UNAVAILABLE",
  "PMM_MODEL_UNAVAILABLE",
  "PMM_DESKTOP_CLAIM_LOST",
  "PMM_CANCELLED_BEFORE_EXECUTION",
  "PMM_OWNER_DEVICE_BINDING_MISMATCH",
  "PMM_BINDING_REVOKED_OR_EXPIRED",
  "PMM_CREDENTIAL_REVOKED_OR_SUPERSEDED",
  "PMM_ROUTE_FALLBACK_DISALLOWED",
  "PMM_REQUEST_DIGEST_CONFLICT",
  "PMM_ADMISSION_UNAVAILABLE",
  "PMM_EXECUTION_RESULT_UNKNOWN",
  "PMM_EXECUTION_EVIDENCE_UNVERIFIABLE",
  "PMM_UNSUPPORTED_SCHEMA_OR_PROFILE",
  "PMM_PHYSICAL_GATEWAY_REQUIRED",
  "PMM_PHYSICAL_FINAL_FENCE_UNAVAILABLE",
  "PMM_PHYSICAL_DOWNSTREAM_COMMIT_REJECTED",
  "PMM_PHYSICAL_SAFETY_INTERLOCK_DENIED",
  "PMM_PHYSICAL_TARGET_UNAVAILABLE",
  "PMM_PHYSICAL_REVOKE_PENDING_DRAIN",
] as const;
export type PersonalMachineReasonCodeV1 =
  (typeof PERSONAL_MACHINE_REASON_CODES_V1)[number];

export const PERSONAL_MACHINE_PROJECTION_AXES_V1 = [
  "registration",
  "binding",
  "presence",
  "health",
  "capability",
  "credential",
  "firmware",
  "risk",
  "assurance",
  "release",
] as const;
export type PersonalMachineProjectionAxisV1 =
  (typeof PERSONAL_MACHINE_PROJECTION_AXES_V1)[number];

export const OBSERVATION_STATES_V1 = [
  "fresh",
  "stale",
  "partial",
  "unknown",
  "unsupported",
] as const;
export type ObservationStateV1 = (typeof OBSERVATION_STATES_V1)[number];

export const OBSERVATION_SOURCE_KINDS_V1 = [
  "runtime-signed",
  "registry",
  "shell-binding",
  "credential-owner",
  "firmware-inventory",
  "risk-owner",
  "assurance-owner",
  "release-owner",
  "transport",
  "legacy-display",
] as const;
export type ObservationSourceKindV1 =
  (typeof OBSERVATION_SOURCE_KINDS_V1)[number];

export const PERSONAL_MACHINE_ROUTE_KINDS_V1 = [
  "software-runtime",
  "direct-device",
  "edge-gateway",
  "vendor-cloud-adapter",
] as const;
export type PersonalMachineRouteKindV1 =
  (typeof PERSONAL_MACHINE_ROUTE_KINDS_V1)[number];

export const PERSONAL_MACHINE_ARTIFACT_TYPES_V1 = [
  "machine-execution-capability",
  "desktop-terminal-source-result",
] as const;
export type PersonalMachineArtifactTypeV1 =
  (typeof PERSONAL_MACHINE_ARTIFACT_TYPES_V1)[number];

export const PERSONAL_MACHINE_ARTIFACT_DOMAINS_V1 = [
  "agentrix:personal-machine-capability:v1",
  "agentrix:personal-machine-terminal-result:v1",
] as const;
export type PersonalMachineArtifactDomainV1 =
  (typeof PERSONAL_MACHINE_ARTIFACT_DOMAINS_V1)[number];

export const PERSONAL_MACHINE_ARTIFACT_PURPOSES_V1 = [
  "personal-machine-capability",
  "personal-machine-terminal-result",
] as const;
export type PersonalMachineArtifactPurposeV1 =
  (typeof PERSONAL_MACHINE_ARTIFACT_PURPOSES_V1)[number];

export const PMM_SIGNING_ALGORITHMS_V1 = [
  "ecdsa-secp256k1-sha256",
  "ecdsa-p256-sha256",
] as const;
export type PersonalMachineSigningAlgorithmV1 =
  (typeof PMM_SIGNING_ALGORITHMS_V1)[number];

export interface ObservationSummaryV1 {
  schemaVersion: "1";
  state: ObservationStateV1;
  sourceRef: string;
  sourceKind: ObservationSourceKindV1;
  declaredOrObserved: "declared" | "observed";
  observedAt?: string;
  capturedAt: string;
  expiresAt?: string;
  maxStaleMs: number;
  reasonCode?: PersonalMachineReasonCodeV1;
}

export interface PersonalMachineRouteCandidateV1 {
  schemaVersion: "1";
  routeCandidateId: string;
  routeKind: PersonalMachineRouteKindV1;
  deviceRef: DeviceRegistryRefV1;
  runtimeId?: string;
  targetDeviceRef?: string;
  gatewayDeviceRef?: string;
  executorShellBindingRef?: string;
  capabilityRefs: string[];
  binding: ObservationSummaryV1;
  presence: ObservationSummaryV1;
  health: ObservationSummaryV1;
  capability: ObservationSummaryV1;
  eligibility: "eligible" | "ineligible" | "unknown";
  reasonCode?: PersonalMachineReasonCodeV1;
  capturedAt: string;
  expiresAt: string;
}

export interface PersonalMachineProjectionV1 {
  schemaVersion: "1";
  machineProjectionId: string;
  ownerPrincipalRef: string;
  agentId: string;
  accountableAgentId: string;
  deviceRef: DeviceRegistryRefV1;
  executorShellBindingRefs: string[];
  runtimeRefs: string[];
  routeCandidates: PersonalMachineRouteCandidateV1[];
  capabilityRefs: string[];
  credentialStatusRef?: string;
  assuranceRefs: string[];
  registration: ObservationSummaryV1;
  binding: ObservationSummaryV1;
  presence: ObservationSummaryV1;
  health: ObservationSummaryV1;
  capability: ObservationSummaryV1;
  credential: ObservationSummaryV1;
  firmware: ObservationSummaryV1;
  risk: ObservationSummaryV1;
  assurance: ObservationSummaryV1;
  release: ObservationSummaryV1;
  capturedAt: string;
}

export interface MachineExecutionCapabilityV1 {
  schemaVersion: "1";
  capabilityObservationId: string;
  deviceRef: DeviceRegistryRefV1;
  runtimeId: string;
  executorShellBindingRef: string;
  jobType: typeof PMM_JOB_TYPE_V1;
  contractVersion: "1";
  inferencePlacement: "on-device";
  providerKind: "local-runtime";
  endpointClass: "localhost" | "on-device-ipc";
  runtimeArtifact: {
    artifactRef: string;
    artifactDigest: string;
    version: string;
  };
  modelArtifact: {
    artifactRef: string;
    artifactDigest: string;
    modelId: string;
  };
  limits: {
    maxPromptBytes: number;
    maxOutputTokens: number;
    maxExecutionMs: number;
    maxConcurrentJobs: number;
  };
  modelState: "available" | "unavailable" | "unknown";
  networkEgressPolicy: "control-plane-only";
  observedAt: string;
  expiresAt: string;
}

export interface PersonalMachineArtifactSigningPayloadV1<T> {
  wrapperSchemaVersion: "1";
  domain: PersonalMachineArtifactDomainV1;
  artifactType: PersonalMachineArtifactTypeV1;
  canonicalizationProfile: typeof PMM_CANONICALIZATION_PROFILE;
  digestProfile: typeof PMM_DIGEST_PROFILE;
  artifact: T;
  artifactDigest: string;
  deviceRef: DeviceRegistryRefV1;
  runtimeId: string;
  ownerPrincipalRef: string;
  tenantRef?: string;
  audience: string;
  executorShellBindingRef?: string;
  credentialRef: string;
  keyVersion: number;
  credentialPurpose: PersonalMachineArtifactPurposeV1;
  credentialRevocationEpoch: string;
  capturedDeviceFence: DeviceEpochFenceV1;
  antiReplayRef: string;
  issuedAt: string;
  expiresAt: string;
  algorithm: PersonalMachineSigningAlgorithmV1;
}

export interface SignedPersonalMachineArtifactV1<T> {
  signingPayload: PersonalMachineArtifactSigningPayloadV1<T>;
  signature: string;
}

export interface PersonalMachineUnavailableAdmissionV1 {
  schemaVersion: "1";
  disposition: "unavailable";
  clientRequestId: string;
  jobRequestDigest: string;
  admissionDecisionRef: string;
  candidateSetDigest: string;
  reasonCode: PersonalMachineReasonCodeV1;
  observationRefs: string[];
  observedAt: string;
  expiresAt: string;
}

export interface PersonalMachineAdmissionObservationTombstoneV1 {
  schemaVersion: "1";
  observationRef: string;
  originalObservationDigest: string;
  state: ObservationStateV1;
  sourceRef: string;
  sourceKind: ObservationSourceKindV1;
  declaredOrObserved: "declared" | "observed";
  observedAt?: string;
  capturedAt: string;
  expiresAt?: string;
  maxStaleMs: number;
  reasonCode?: PersonalMachineReasonCodeV1;
  retentionDisposition: "compacted";
  compactedAt: string;
}

export interface PersonalMachineJobRequestV1 {
  schemaVersion: "1";
  jobType: typeof PMM_JOB_TYPE_V1;
  agentId: string;
  initiatorShellSessionRef: string;
  prompt: string;
  options: {
    localModelSelectionRef?: string;
    maxOutputTokens: number;
    temperature?: number;
  };
  routePolicy: typeof PMM_ROUTE_POLICY_V1;
  pinnedRuntimeId?: string;
  clientRequestId: string;
}

export interface PersonalMachineJobResultDescriptorV1 {
  schemaVersion: "1";
  jobId: string;
  terminalSourceResultRef: string;
  outputRef: string;
  outputDigest: string;
  outputByteLength: number;
  outputExpiresAt: string;
  contentType: "text/plain; charset=utf-8";
  bodyDisposition: "available" | "expired" | "deleted";
}

export interface CostProjectionV1 {
  currency: "USD";
  actual: {
    amount?: string;
    method: "measured-local" | "unknown";
    measuredComponents: string[];
    unknownComponents: string[];
    evidenceRef?: string;
  };
  cloudBaseline: {
    amount?: string;
    provider?: string;
    model?: string;
    priceVersion?: string;
    capturedAt?: string;
    method?: string;
  };
  savings: {
    amount?: string;
    disposition: "verified" | "not_available";
  };
}

export interface PersonalMachineJobViewV1 {
  schemaVersion: "1";
  jobId: string;
  ownerPrincipalRef: string;
  agentId: string;
  accountableAgentId: string;
  clientRequestId: string;
  jobRequestDigest: string;
  executionCommandDigest: string;
  actionId: string;
  authorityRef: string;
  mandateRef: string;
  initiatorShellSessionRef: string;
  executorShellBindingRef: string;
  journalRef: string;
  downstreamIdempotencyRef: string;
  routeDecisionRef: string;
  selectedDeviceRef: string;
  selectedRuntimeId: string;
  journalState:
    | "reserved"
    | "executing"
    | "succeeded"
    | "rejected"
    | "unknown-outcome";
  reasonCode?: PersonalMachineReasonCodeV1;
  reconciliationDisposition:
    | "not_required"
    | "pending"
    | "reconciled"
    | "unknown";
  verificationDisposition: "pending" | "verified" | "unverifiable";
  terminalSourceResultRef?: string;
  resultBody?: PersonalMachineJobResultDescriptorV1;
  outcomeRef?: string;
  taskProofRefs: string[];
  actionReceiptRef?: string;
  responsibilityLineageRef?: string;
  costProjection?: CostProjectionV1;
  updatedAt: string;
}

export interface PersonalMachineAcceptedJobResultV1 {
  schemaVersion: "1";
  disposition: "accepted";
  clientRequestId: string;
  jobRequestDigest: string;
  job: PersonalMachineJobViewV1;
}

export type PersonalMachineJobCreateResultV1 =
  | PersonalMachineUnavailableAdmissionV1
  | PersonalMachineAcceptedJobResultV1;

export interface PersonalMachineRouteDecisionV1 {
  schemaVersion: "1";
  routeDecisionId: string;
  ownerPrincipalRef: string;
  agentId: string;
  accountableAgentId: string;
  actionId: string;
  jobRequestDigest: string;
  policy: typeof PMM_ROUTE_POLICY_V1;
  candidateSetDigest: string;
  selectedDeviceRef: string;
  selectedRuntimeId: string;
  selectedExecutorShellBindingRef: string;
  selectedRouteKind: "software-runtime";
  inferencePlacement: "on-device";
  providerKind: "local-runtime";
  selectedRuntimeArtifactRef: string;
  selectedModelArtifactRef: string;
  reasonCode?: PersonalMachineReasonCodeV1;
  decidedAt: string;
  expiresAt: string;
}

export interface DesktopTerminalSourceResultBaseV1 {
  schemaVersion: "1";
  journalRef: string;
  downstreamIdempotencyRef: string;
  jobRequestDigest: string;
  executionCommandDigest: string;
  deviceRef: DeviceRegistryRefV1;
  runtimeId: string;
  executorShellBindingRef: string;
  routeDecisionRef: string;
  inferencePlacement: "on-device";
  providerKind: "local-runtime";
  endpointClass: "localhost" | "on-device-ipc";
  runtimeArtifactRef: string;
  runtimeArtifactDigest: string;
  modelArtifactRef: string;
  modelArtifactDigest: string;
  terminalAt: string;
}

export type DesktopTerminalSourceResultV1 =
  | (DesktopTerminalSourceResultBaseV1 & {
      disposition: "succeeded";
      outputRef: string;
      outputDigest: string;
      outputByteLength: number;
      outputExpiresAt: string;
      usage: {
        inputTokens?: number;
        outputTokens?: number;
        durationMs: number;
      };
      localRequestRef: string;
      startedAt: string;
      reasonCode?: never;
    })
  | (DesktopTerminalSourceResultBaseV1 & {
      disposition: "rejected";
      outputRef?: never;
      outputDigest?: never;
      outputByteLength?: never;
      outputExpiresAt?: never;
      usage?: {
        inputTokens?: number;
        outputTokens?: number;
        durationMs: number;
      };
      localRequestRef?: string;
      startedAt?: string;
      reasonCode: PersonalMachineReasonCodeV1;
    })
  | (DesktopTerminalSourceResultBaseV1 & {
      disposition: "unknown-outcome";
      outputRef?: never;
      outputDigest?: never;
      outputByteLength?: never;
      outputExpiresAt?: never;
      usage?: never;
      localRequestRef?: string;
      startedAt?: string;
      reasonCode: PersonalMachineReasonCodeV1;
    });

export type SignedDesktopTerminalSourceResultV1 =
  SignedPersonalMachineArtifactV1<DesktopTerminalSourceResultV1>;

export type PersonalMachineJobResultReadV1 =
  | {
      schemaVersion: "1";
      disposition: "available";
      descriptor: PersonalMachineJobResultDescriptorV1 & {
        bodyDisposition: "available";
      };
      text: string;
    }
  | {
      schemaVersion: "1";
      disposition: "expired" | "deleted";
      descriptor: PersonalMachineJobResultDescriptorV1;
    };

export interface PersonalMachineSelectedCandidateSnapshotV1 {
  candidateSetDigest: string;
  selectedCandidateDigest: string;
  selectedDeviceRef: string;
  selectedRuntimeId: string;
  selectedExecutorShellBindingRef: string;
  selectedExecutorShellBindingVersion: string;
  selectedCapabilityRef: string;
  selectedCapabilityDigest: string;
  selectedRouteKind: "software-runtime";
  inferencePlacement: "on-device";
  providerKind: "local-runtime";
  endpointClass: "localhost" | "on-device-ipc";
  selectedRuntimeArtifactRef: string;
  selectedRuntimeArtifactDigest: string;
  selectedModelArtifactRef: string;
  selectedModelArtifactDigest: string;
  capturedCredentialRef: string;
  capturedCredentialEpoch: string;
  capturedDeviceFence: DeviceEpochFenceV1;
  observedAt: string;
  expiresAt: string;
}

export const PERSONAL_MACHINE_ORCHESTRATION_STAGES_V1 = [
  "idempotency-reserved",
  "payload-reserved",
  "preflight-complete",
  "action-created",
  "route-persisted",
  "mandate-issued",
  "journal-reserved",
  "offer-dispatched",
  "executing-confirmed",
  "terminal-projection-pending",
  "completed",
  "reconciliation-required",
  "expired",
] as const;
export type PersonalMachineOrchestrationStageV1 =
  (typeof PERSONAL_MACHINE_ORCHESTRATION_STAGES_V1)[number];

export interface PersonalMachineOrchestrationRecordV1 {
  schemaVersion: "1";
  orchestrationId: string;
  ownerPrincipalRef: string;
  agentId: string;
  accountableAgentId: string;
  clientRequestId: string;
  jobRequestDigest: string;
  commandPayloadRef?: string;
  commandPayloadDigest?: string;
  commandPayloadExpiresAt?: string;
  stage: PersonalMachineOrchestrationStageV1;
  selectedCandidate?: PersonalMachineSelectedCandidateSnapshotV1;
  actionId?: string;
  routeDecisionRef?: string;
  mandateRef?: string;
  executionCommandDigest?: string;
  journalRef?: string;
  terminalSourceResultRef?: string;
  executionFenceDeadlineAt: string;
  executingAt?: string;
  executionDeadlineAt?: string;
  version: number;
  leaseOwnerRef?: string;
  leaseExpiresAt?: string;
  attemptCount: number;
  nextAttemptAt?: string;
  lastTypedError?: string;
  receivedAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface PersonalMachineListCursorV1 {
  schemaVersion: "1";
  ownerPrincipalRef: string;
  resource: "admissions" | "jobs" | "machines";
  filterDigest: string;
  sort: "updatedAt_desc_id_asc";
  afterKey: string;
}

export interface PersonalMachineAdmissionMetaEventV1 {
  type: "personal_machine.admission.v1";
  schemaVersion: "1";
  chatRequestRef: string;
  result: PersonalMachineJobCreateResultV1;
}

export interface PersonalMachineResultMetaEventV1 {
  type: "personal_machine.result.v1";
  schemaVersion: "1";
  chatRequestRef: string;
  jobId: string;
  result: PersonalMachineJobResultReadV1;
}

export interface PersonalMachineExecutionSourceV1 {
  schemaVersion: "1";
  executionSourceId: string;
  actionId: string;
  mandateRef: string;
  journalRef: string;
  routeDecisionRef: string;
  terminalSourceResultRef: string;
  commandExecutorPartyRef: { kind: "executor"; id: string };
  modelProviderPartyRef: { kind: "provider"; id: string };
  inferencePlacement: "on-device";
  providerKind: "local-runtime";
  runtimeArtifactRef: string;
  modelArtifactRef: string;
  routePolicy: typeof PMM_ROUTE_POLICY_V1;
  fallbackDisposition: "not_allowed";
  verificationRef: string;
  reasonCode?: PersonalMachineReasonCodeV1;
  recordedAt: string;
}

export interface PersonalMachineValidationResultV1 {
  valid: boolean;
  errors: string[];
}

export class PersonalMachineContractValidationError extends Error {
  readonly code = "personal_machine_contract_invalid";
  constructor(readonly errors: string[]) {
    super(`Personal Machine contract validation failed: ${errors.join("; ")}`);
    this.name = "PersonalMachineContractValidationError";
  }
}

const OPAQUE = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,254}$/;
const SHA256 = /^[0-9a-f]{64}$/;
const ISO_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/;
const FORBIDDEN_AGGREGATE_KEYS = [
  "projectionStatus",
  "online",
  "trusted",
  "aggregateStatus",
] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function exactKeys(
  value: Record<string, unknown>,
  required: readonly string[],
  optional: readonly string[],
  path: string,
  errors: string[],
): void {
  const allowed = new Set([...required, ...optional]);
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) errors.push(`${path}.${key}: unknown field`);
  }
  for (const key of required) {
    if (!Object.prototype.hasOwnProperty.call(value, key)) {
      errors.push(`${path}.${key}: required`);
    }
  }
}

function nonEmptyString(
  value: unknown,
  path: string,
  errors: string[],
): value is string {
  if (typeof value !== "string" || value.trim().length === 0) {
    errors.push(`${path}: expected non-empty string`);
    return false;
  }
  return true;
}

function opaqueId(value: unknown, path: string, errors: string[]): boolean {
  if (!nonEmptyString(value, path, errors)) return false;
  if (!OPAQUE.test(value)) {
    errors.push(`${path}: malformed opaque id`);
    return false;
  }
  return true;
}

function sha256Digest(value: unknown, path: string, errors: string[]): boolean {
  if (!nonEmptyString(value, path, errors)) return false;
  if (!SHA256.test(value)) {
    errors.push(`${path}: expected lowercase sha256 hex`);
    return false;
  }
  return true;
}

function timestamp(value: unknown, path: string, errors: string[]): boolean {
  if (!nonEmptyString(value, path, errors)) return false;
  if (!ISO_UTC.test(value) || Number.isNaN(Date.parse(value))) {
    errors.push(`${path}: expected RFC3339 UTC timestamp`);
    return false;
  }
  return true;
}

function oneOf<T extends string>(
  value: unknown,
  allowed: readonly T[],
  path: string,
  errors: string[],
): value is T {
  if (
    typeof value !== "string" ||
    !(allowed as readonly string[]).includes(value)
  ) {
    errors.push(`${path}: unsupported enum`);
    return false;
  }
  return true;
}

function nonNegativeInt(
  value: unknown,
  path: string,
  errors: string[],
): boolean {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    errors.push(`${path}: expected non-negative integer`);
    return false;
  }
  return true;
}

function deviceRef(
  value: unknown,
  path: string,
  errors: string[],
): value is DeviceRegistryRefV1 {
  if (!isRecord(value)) {
    errors.push(`${path}: expected object`);
    return false;
  }
  exactKeys(value, ["kind", "deviceId"], [], path, errors);
  if (value.kind !== "device_registry") {
    errors.push(`${path}.kind: expected device_registry`);
  }
  opaqueId(value.deviceId, `${path}.deviceId`, errors);
  return errors.every((error) => !error.startsWith(`${path}`));
}

function deviceFence(
  value: unknown,
  path: string,
  errors: string[],
): value is DeviceEpochFenceV1 {
  if (!isRecord(value)) {
    errors.push(`${path}: expected object`);
    return false;
  }
  exactKeys(
    value,
    [
      "schemaVersion",
      "target",
      "deviceRevocationEpoch",
      "credentialRevocationEpoch",
      "optimisticVersion",
      "credentialVersion",
      "capturedAt",
    ],
    [],
    path,
    errors,
  );
  if (value.schemaVersion !== 1) {
    errors.push(`${path}.schemaVersion: expected 1`);
  }
  deviceRef(value.target, `${path}.target`, errors);
  for (const key of [
    "deviceRevocationEpoch",
    "credentialRevocationEpoch",
    "optimisticVersion",
    "credentialVersion",
  ] as const) {
    if (
      typeof value[key] !== "string" ||
      !/^(0|[1-9][0-9]*)$/.test(String(value[key]))
    ) {
      errors.push(`${path}.${key}: expected decimal epoch`);
    }
  }
  timestamp(value.capturedAt, `${path}.capturedAt`, errors);
  return true;
}

export function validateObservationSummaryV1(
  input: unknown,
  path = "observation",
): PersonalMachineValidationResultV1 {
  const errors: string[] = [];
  if (!isRecord(input))
    return { valid: false, errors: [`${path}: expected object`] };
  exactKeys(
    input,
    [
      "schemaVersion",
      "state",
      "sourceRef",
      "sourceKind",
      "declaredOrObserved",
      "capturedAt",
      "maxStaleMs",
    ],
    ["observedAt", "expiresAt", "reasonCode"],
    path,
    errors,
  );
  if (input.schemaVersion !== "1")
    errors.push(`${path}.schemaVersion: expected 1`);
  oneOf(input.state, OBSERVATION_STATES_V1, `${path}.state`, errors);
  opaqueId(input.sourceRef, `${path}.sourceRef`, errors);
  oneOf(
    input.sourceKind,
    OBSERVATION_SOURCE_KINDS_V1,
    `${path}.sourceKind`,
    errors,
  );
  oneOf(
    input.declaredOrObserved,
    ["declared", "observed"] as const,
    `${path}.declaredOrObserved`,
    errors,
  );
  timestamp(input.capturedAt, `${path}.capturedAt`, errors);
  nonNegativeInt(input.maxStaleMs, `${path}.maxStaleMs`, errors);
  if (input.observedAt !== undefined) {
    timestamp(input.observedAt, `${path}.observedAt`, errors);
  }
  if (input.expiresAt !== undefined) {
    timestamp(input.expiresAt, `${path}.expiresAt`, errors);
  }
  if (input.reasonCode !== undefined) {
    oneOf(
      input.reasonCode,
      PERSONAL_MACHINE_REASON_CODES_V1,
      `${path}.reasonCode`,
      errors,
    );
  }
  return { valid: errors.length === 0, errors };
}

export function validatePersonalMachineProjectionV1(
  input: unknown,
): PersonalMachineValidationResultV1 {
  const errors: string[] = [];
  if (!isRecord(input))
    return { valid: false, errors: ["projection: expected object"] };
  for (const key of FORBIDDEN_AGGREGATE_KEYS) {
    if (Object.prototype.hasOwnProperty.call(input, key)) {
      errors.push(`projection.${key}: aggregate authorization field forbidden`);
    }
  }
  exactKeys(
    input,
    [
      "schemaVersion",
      "machineProjectionId",
      "ownerPrincipalRef",
      "agentId",
      "accountableAgentId",
      "deviceRef",
      "executorShellBindingRefs",
      "runtimeRefs",
      "routeCandidates",
      "capabilityRefs",
      "registration",
      "binding",
      "presence",
      "health",
      "capability",
      "credential",
      "firmware",
      "risk",
      "assurance",
      "release",
      "capturedAt",
    ],
    ["credentialStatusRef", "assuranceRefs"],
    "projection",
    errors,
  );
  if (input.schemaVersion !== "1")
    errors.push("projection.schemaVersion: expected 1");
  opaqueId(input.machineProjectionId, "projection.machineProjectionId", errors);
  opaqueId(input.ownerPrincipalRef, "projection.ownerPrincipalRef", errors);
  opaqueId(input.agentId, "projection.agentId", errors);
  opaqueId(input.accountableAgentId, "projection.accountableAgentId", errors);
  if (input.agentId !== input.accountableAgentId) {
    errors.push(
      "projection.accountableAgentId: V1 requires equality with agentId",
    );
  }
  deviceRef(input.deviceRef, "projection.deviceRef", errors);
  timestamp(input.capturedAt, "projection.capturedAt", errors);
  for (const axis of PERSONAL_MACHINE_PROJECTION_AXES_V1) {
    const result = validateObservationSummaryV1(
      input[axis],
      `projection.${axis}`,
    );
    errors.push(...result.errors);
  }
  if (!Array.isArray(input.executorShellBindingRefs)) {
    errors.push("projection.executorShellBindingRefs: expected array");
  }
  if (!Array.isArray(input.runtimeRefs)) {
    errors.push("projection.runtimeRefs: expected array");
  }
  if (!Array.isArray(input.capabilityRefs)) {
    errors.push("projection.capabilityRefs: expected array");
  }
  if (!Array.isArray(input.routeCandidates)) {
    errors.push("projection.routeCandidates: expected array");
  }
  return { valid: errors.length === 0, errors };
}

export function validateMachineExecutionCapabilityV1(
  input: unknown,
): PersonalMachineValidationResultV1 {
  const errors: string[] = [];
  if (!isRecord(input))
    return { valid: false, errors: ["capability: expected object"] };
  exactKeys(
    input,
    [
      "schemaVersion",
      "capabilityObservationId",
      "deviceRef",
      "runtimeId",
      "executorShellBindingRef",
      "jobType",
      "contractVersion",
      "inferencePlacement",
      "providerKind",
      "endpointClass",
      "runtimeArtifact",
      "modelArtifact",
      "limits",
      "modelState",
      "networkEgressPolicy",
      "observedAt",
      "expiresAt",
    ],
    [],
    "capability",
    errors,
  );
  if (input.schemaVersion !== "1")
    errors.push("capability.schemaVersion: expected 1");
  if (input.jobType !== PMM_JOB_TYPE_V1) {
    errors.push("capability.jobType: only llm.generate.v1");
  }
  if (input.inferencePlacement !== "on-device") {
    errors.push("capability.inferencePlacement: only on-device");
  }
  if (input.providerKind !== "local-runtime") {
    errors.push("capability.providerKind: only local-runtime");
  }
  oneOf(
    input.endpointClass,
    ["localhost", "on-device-ipc"] as const,
    "capability.endpointClass",
    errors,
  );
  if (input.networkEgressPolicy !== "control-plane-only") {
    errors.push("capability.networkEgressPolicy: only control-plane-only");
  }
  oneOf(
    input.modelState,
    ["available", "unavailable", "unknown"] as const,
    "capability.modelState",
    errors,
  );
  deviceRef(input.deviceRef, "capability.deviceRef", errors);
  opaqueId(input.runtimeId, "capability.runtimeId", errors);
  opaqueId(
    input.executorShellBindingRef,
    "capability.executorShellBindingRef",
    errors,
  );
  timestamp(input.observedAt, "capability.observedAt", errors);
  timestamp(input.expiresAt, "capability.expiresAt", errors);
  return { valid: errors.length === 0, errors };
}

export function validatePersonalMachineJobRequestV1(
  input: unknown,
): PersonalMachineValidationResultV1 {
  const errors: string[] = [];
  if (!isRecord(input))
    return { valid: false, errors: ["request: expected object"] };
  exactKeys(
    input,
    [
      "schemaVersion",
      "jobType",
      "agentId",
      "initiatorShellSessionRef",
      "prompt",
      "options",
      "routePolicy",
      "clientRequestId",
    ],
    ["pinnedRuntimeId"],
    "request",
    errors,
  );
  if (input.schemaVersion !== "1")
    errors.push("request.schemaVersion: expected 1");
  if (input.jobType !== PMM_JOB_TYPE_V1) {
    errors.push("request.jobType: only llm.generate.v1");
  }
  if (input.routePolicy !== PMM_ROUTE_POLICY_V1) {
    errors.push("request.routePolicy: only byo_only");
  }
  opaqueId(input.agentId, "request.agentId", errors);
  opaqueId(
    input.initiatorShellSessionRef,
    "request.initiatorShellSessionRef",
    errors,
  );
  opaqueId(input.clientRequestId, "request.clientRequestId", errors);
  if (typeof input.prompt !== "string" || input.prompt.length === 0) {
    errors.push("request.prompt: required");
  }
  if (!isRecord(input.options)) {
    errors.push("request.options: expected object");
  } else {
    exactKeys(
      input.options,
      ["maxOutputTokens"],
      ["localModelSelectionRef", "temperature"],
      "request.options",
      errors,
    );
    nonNegativeInt(
      input.options.maxOutputTokens,
      "request.options.maxOutputTokens",
      errors,
    );
    if (
      input.options.temperature !== undefined &&
      (typeof input.options.temperature !== "number" ||
        input.options.temperature < 0 ||
        input.options.temperature > 2)
    ) {
      errors.push("request.options.temperature: out of range");
    }
    for (const forbidden of [
      "url",
      "host",
      "port",
      "path",
      "executable",
      "tools",
      "shell",
      "browser",
    ]) {
      if (Object.prototype.hasOwnProperty.call(input.options, forbidden)) {
        errors.push(`request.options.${forbidden}: forbidden`);
      }
    }
  }
  return { valid: errors.length === 0, errors };
}

export function validatePersonalMachineUnavailableAdmissionV1(
  input: unknown,
): PersonalMachineValidationResultV1 {
  const errors: string[] = [];
  if (!isRecord(input))
    return { valid: false, errors: ["admission: expected object"] };
  for (const forbidden of [
    "jobId",
    "actionId",
    "mandateRef",
    "journalRef",
    "outcomeRef",
    "actionReceiptRef",
    "responsibilityLineageRef",
  ]) {
    if (Object.prototype.hasOwnProperty.call(input, forbidden)) {
      errors.push(`admission.${forbidden}: forbidden on unavailable admission`);
    }
  }
  exactKeys(
    input,
    [
      "schemaVersion",
      "disposition",
      "clientRequestId",
      "jobRequestDigest",
      "admissionDecisionRef",
      "candidateSetDigest",
      "reasonCode",
      "observationRefs",
      "observedAt",
      "expiresAt",
    ],
    [],
    "admission",
    errors,
  );
  if (input.schemaVersion !== "1")
    errors.push("admission.schemaVersion: expected 1");
  if (input.disposition !== "unavailable") {
    errors.push("admission.disposition: expected unavailable");
  }
  opaqueId(input.clientRequestId, "admission.clientRequestId", errors);
  sha256Digest(input.jobRequestDigest, "admission.jobRequestDigest", errors);
  opaqueId(
    input.admissionDecisionRef,
    "admission.admissionDecisionRef",
    errors,
  );
  sha256Digest(
    input.candidateSetDigest,
    "admission.candidateSetDigest",
    errors,
  );
  oneOf(
    input.reasonCode,
    PERSONAL_MACHINE_REASON_CODES_V1,
    "admission.reasonCode",
    errors,
  );
  if (
    !Array.isArray(input.observationRefs) ||
    !input.observationRefs.every((item) => typeof item === "string")
  ) {
    errors.push("admission.observationRefs: expected string array");
  }
  timestamp(input.observedAt, "admission.observedAt", errors);
  timestamp(input.expiresAt, "admission.expiresAt", errors);
  return { valid: errors.length === 0, errors };
}

export function validatePersonalMachineJobViewV1(
  input: unknown,
): PersonalMachineValidationResultV1 {
  const errors: string[] = [];
  if (!isRecord(input))
    return { valid: false, errors: ["job: expected object"] };
  exactKeys(
    input,
    [
      "schemaVersion",
      "jobId",
      "ownerPrincipalRef",
      "agentId",
      "accountableAgentId",
      "clientRequestId",
      "jobRequestDigest",
      "executionCommandDigest",
      "actionId",
      "authorityRef",
      "mandateRef",
      "initiatorShellSessionRef",
      "executorShellBindingRef",
      "journalRef",
      "downstreamIdempotencyRef",
      "routeDecisionRef",
      "selectedDeviceRef",
      "selectedRuntimeId",
      "journalState",
      "reconciliationDisposition",
      "verificationDisposition",
      "taskProofRefs",
      "updatedAt",
    ],
    [
      "reasonCode",
      "terminalSourceResultRef",
      "resultBody",
      "outcomeRef",
      "actionReceiptRef",
      "responsibilityLineageRef",
      "costProjection",
    ],
    "job",
    errors,
  );
  if (input.schemaVersion !== "1") errors.push("job.schemaVersion: expected 1");
  if (input.agentId !== input.accountableAgentId) {
    errors.push("job.accountableAgentId: V1 requires equality with agentId");
  }
  oneOf(
    input.journalState,
    [
      "reserved",
      "executing",
      "succeeded",
      "rejected",
      "unknown-outcome",
    ] as const,
    "job.journalState",
    errors,
  );
  if (
    input.journalState === "succeeded" &&
    (input.terminalSourceResultRef === undefined ||
      input.resultBody === undefined)
  ) {
    errors.push(
      "job: succeeded requires terminal source and result descriptor",
    );
  }
  return { valid: errors.length === 0, errors };
}

const TERMINAL_BASE_KEYS = [
  "schemaVersion",
  "journalRef",
  "downstreamIdempotencyRef",
  "jobRequestDigest",
  "executionCommandDigest",
  "deviceRef",
  "runtimeId",
  "executorShellBindingRef",
  "routeDecisionRef",
  "inferencePlacement",
  "providerKind",
  "endpointClass",
  "runtimeArtifactRef",
  "runtimeArtifactDigest",
  "modelArtifactRef",
  "modelArtifactDigest",
  "terminalAt",
  "disposition",
] as const;

export function validateDesktopTerminalSourceResultV1(
  input: unknown,
): PersonalMachineValidationResultV1 {
  const errors: string[] = [];
  if (!isRecord(input))
    return { valid: false, errors: ["terminal: expected object"] };
  if (input.schemaVersion !== "1")
    errors.push("terminal.schemaVersion: expected 1");
  oneOf(
    input.disposition,
    ["succeeded", "rejected", "unknown-outcome"] as const,
    "terminal.disposition",
    errors,
  );
  if (input.inferencePlacement !== "on-device") {
    errors.push("terminal.inferencePlacement: only on-device");
  }
  if (input.providerKind !== "local-runtime") {
    errors.push("terminal.providerKind: only local-runtime");
  }
  sha256Digest(input.jobRequestDigest, "terminal.jobRequestDigest", errors);
  sha256Digest(
    input.executionCommandDigest,
    "terminal.executionCommandDigest",
    errors,
  );
  timestamp(input.terminalAt, "terminal.terminalAt", errors);
  if (input.disposition === "succeeded") {
    exactKeys(
      input,
      [
        ...TERMINAL_BASE_KEYS,
        "outputRef",
        "outputDigest",
        "outputByteLength",
        "outputExpiresAt",
        "usage",
        "localRequestRef",
        "startedAt",
      ],
      [],
      "terminal",
      errors,
    );
    opaqueId(input.outputRef, "terminal.outputRef", errors);
    sha256Digest(input.outputDigest, "terminal.outputDigest", errors);
    nonNegativeInt(input.outputByteLength, "terminal.outputByteLength", errors);
    timestamp(input.outputExpiresAt, "terminal.outputExpiresAt", errors);
    timestamp(input.startedAt, "terminal.startedAt", errors);
    if (
      !isRecord(input.usage) ||
      !nonNegativeInt(
        input.usage.durationMs,
        "terminal.usage.durationMs",
        errors,
      )
    ) {
      errors.push("terminal.usage.durationMs: required non-negative");
    }
    if (input.reasonCode !== undefined) {
      errors.push("terminal.reasonCode: forbidden on succeeded");
    }
  } else {
    exactKeys(
      input,
      [...TERMINAL_BASE_KEYS, "reasonCode"],
      ["usage", "localRequestRef", "startedAt"],
      "terminal",
      errors,
    );
    oneOf(
      input.reasonCode,
      PERSONAL_MACHINE_REASON_CODES_V1,
      "terminal.reasonCode",
      errors,
    );
    for (const key of [
      "outputRef",
      "outputDigest",
      "outputByteLength",
      "outputExpiresAt",
    ]) {
      if (Object.prototype.hasOwnProperty.call(input, key)) {
        errors.push(
          `terminal.${key}: forbidden on ${String(input.disposition)}`,
        );
      }
    }
    if (input.disposition === "unknown-outcome" && input.usage !== undefined) {
      errors.push("terminal.usage: forbidden on unknown-outcome");
    }
  }
  return { valid: errors.length === 0, errors };
}

export function validatePersonalMachineJobResultDescriptorV1(
  input: unknown,
): PersonalMachineValidationResultV1 {
  const errors: string[] = [];
  if (!isRecord(input))
    return { valid: false, errors: ["descriptor: expected object"] };
  exactKeys(
    input,
    [
      "schemaVersion",
      "jobId",
      "terminalSourceResultRef",
      "outputRef",
      "outputDigest",
      "outputByteLength",
      "outputExpiresAt",
      "contentType",
      "bodyDisposition",
    ],
    [],
    "descriptor",
    errors,
  );
  if (input.contentType !== "text/plain; charset=utf-8") {
    errors.push("descriptor.contentType: unsupported");
  }
  oneOf(
    input.bodyDisposition,
    ["available", "expired", "deleted"] as const,
    "descriptor.bodyDisposition",
    errors,
  );
  sha256Digest(input.outputDigest, "descriptor.outputDigest", errors);
  nonNegativeInt(input.outputByteLength, "descriptor.outputByteLength", errors);
  return { valid: errors.length === 0, errors };
}

export function validatePersonalMachineListCursorV1(
  input: unknown,
  expectedOwner?: string,
): PersonalMachineValidationResultV1 {
  const errors: string[] = [];
  if (!isRecord(input))
    return { valid: false, errors: ["cursor: expected object"] };
  exactKeys(
    input,
    [
      "schemaVersion",
      "ownerPrincipalRef",
      "resource",
      "filterDigest",
      "sort",
      "afterKey",
    ],
    [],
    "cursor",
    errors,
  );
  if (input.schemaVersion !== "1")
    errors.push("cursor.schemaVersion: expected 1");
  opaqueId(input.ownerPrincipalRef, "cursor.ownerPrincipalRef", errors);
  oneOf(
    input.resource,
    ["admissions", "jobs", "machines"] as const,
    "cursor.resource",
    errors,
  );
  if (input.sort !== "updatedAt_desc_id_asc") {
    errors.push("cursor.sort: unsupported");
  }
  sha256Digest(input.filterDigest, "cursor.filterDigest", errors);
  if (expectedOwner && input.ownerPrincipalRef !== expectedOwner) {
    errors.push("cursor.ownerPrincipalRef: cross-owner replay forbidden");
  }
  return { valid: errors.length === 0, errors };
}

export function validateSignedPersonalMachineArtifactV1<T>(
  input: unknown,
  artifactValidator: (artifact: unknown) => PersonalMachineValidationResultV1,
  expected?: {
    domain: PersonalMachineArtifactDomainV1;
    artifactType: PersonalMachineArtifactTypeV1;
    purpose: PersonalMachineArtifactPurposeV1;
    ownerPrincipalRef?: string;
    audience?: string;
    runtimeId?: string;
  },
): PersonalMachineValidationResultV1 {
  const errors: string[] = [];
  if (!isRecord(input))
    return { valid: false, errors: ["signed: expected object"] };
  exactKeys(input, ["signingPayload", "signature"], [], "signed", errors);
  if (!nonEmptyString(input.signature, "signed.signature", errors)) {
    return { valid: false, errors };
  }
  if (!isRecord(input.signingPayload)) {
    return { valid: false, errors: ["signed.signingPayload: expected object"] };
  }
  const payload = input.signingPayload;
  exactKeys(
    payload,
    [
      "wrapperSchemaVersion",
      "domain",
      "artifactType",
      "canonicalizationProfile",
      "digestProfile",
      "artifact",
      "artifactDigest",
      "deviceRef",
      "runtimeId",
      "ownerPrincipalRef",
      "audience",
      "credentialRef",
      "keyVersion",
      "credentialPurpose",
      "credentialRevocationEpoch",
      "capturedDeviceFence",
      "antiReplayRef",
      "issuedAt",
      "expiresAt",
      "algorithm",
    ],
    ["tenantRef", "executorShellBindingRef"],
    "signed.signingPayload",
    errors,
  );
  if (payload.wrapperSchemaVersion !== "1") {
    errors.push("signed.signingPayload.wrapperSchemaVersion: expected 1");
  }
  oneOf(
    payload.domain,
    PERSONAL_MACHINE_ARTIFACT_DOMAINS_V1,
    "signed.signingPayload.domain",
    errors,
  );
  oneOf(
    payload.artifactType,
    PERSONAL_MACHINE_ARTIFACT_TYPES_V1,
    "signed.signingPayload.artifactType",
    errors,
  );
  oneOf(
    payload.credentialPurpose,
    PERSONAL_MACHINE_ARTIFACT_PURPOSES_V1,
    "signed.signingPayload.credentialPurpose",
    errors,
  );
  if (payload.canonicalizationProfile !== PMM_CANONICALIZATION_PROFILE) {
    errors.push("signed.signingPayload.canonicalizationProfile: unsupported");
  }
  if (payload.digestProfile !== PMM_DIGEST_PROFILE) {
    errors.push("signed.signingPayload.digestProfile: unsupported");
  }
  oneOf(
    payload.algorithm,
    PMM_SIGNING_ALGORITHMS_V1,
    "signed.signingPayload.algorithm",
    errors,
  );
  const expectedDomainByType: Record<
    PersonalMachineArtifactTypeV1,
    PersonalMachineArtifactDomainV1
  > = {
    "machine-execution-capability": "agentrix:personal-machine-capability:v1",
    "desktop-terminal-source-result":
      "agentrix:personal-machine-terminal-result:v1",
  };
  const expectedPurposeByType: Record<
    PersonalMachineArtifactTypeV1,
    PersonalMachineArtifactPurposeV1
  > = {
    "machine-execution-capability": "personal-machine-capability",
    "desktop-terminal-source-result": "personal-machine-terminal-result",
  };
  if (
    typeof payload.artifactType === "string" &&
    expectedDomainByType[
      payload.artifactType as PersonalMachineArtifactTypeV1
    ] &&
    payload.domain !==
      expectedDomainByType[
        payload.artifactType as PersonalMachineArtifactTypeV1
      ]
  ) {
    errors.push("signed.signingPayload.domain: domain/type mismatch");
  }
  if (
    typeof payload.artifactType === "string" &&
    expectedPurposeByType[
      payload.artifactType as PersonalMachineArtifactTypeV1
    ] &&
    payload.credentialPurpose !==
      expectedPurposeByType[
        payload.artifactType as PersonalMachineArtifactTypeV1
      ]
  ) {
    errors.push(
      "signed.signingPayload.credentialPurpose: purpose/type mismatch",
    );
  }
  if (expected) {
    if (payload.domain !== expected.domain) {
      errors.push("signed.signingPayload.domain: unexpected domain");
    }
    if (payload.artifactType !== expected.artifactType) {
      errors.push("signed.signingPayload.artifactType: unexpected type");
    }
    if (payload.credentialPurpose !== expected.purpose) {
      errors.push(
        "signed.signingPayload.credentialPurpose: unexpected purpose",
      );
    }
    if (
      expected.ownerPrincipalRef &&
      payload.ownerPrincipalRef !== expected.ownerPrincipalRef
    ) {
      errors.push("signed.signingPayload.ownerPrincipalRef: context mismatch");
    }
    if (expected.audience && payload.audience !== expected.audience) {
      errors.push("signed.signingPayload.audience: context mismatch");
    }
    if (expected.runtimeId && payload.runtimeId !== expected.runtimeId) {
      errors.push("signed.signingPayload.runtimeId: context mismatch");
    }
  }
  const artifactResult = artifactValidator(payload.artifact);
  errors.push(...artifactResult.errors);
  if (artifactResult.valid) {
    const digest = sha256Hex(utf8Encode(canonicalizeJson(payload.artifact)));
    if (payload.artifactDigest !== digest) {
      errors.push("signed.signingPayload.artifactDigest: mismatch");
    }
  }
  deviceRef(payload.deviceRef, "signed.signingPayload.deviceRef", errors);
  deviceFence(
    payload.capturedDeviceFence,
    "signed.signingPayload.capturedDeviceFence",
    errors,
  );
  timestamp(payload.issuedAt, "signed.signingPayload.issuedAt", errors);
  timestamp(payload.expiresAt, "signed.signingPayload.expiresAt", errors);
  return { valid: errors.length === 0, errors };
}

export function computePersonalMachineJobRequestDigestV1(input: {
  ownerPrincipalRef: string;
  agentId: string;
  accountableAgentId: string;
  request: PersonalMachineJobRequestV1;
}): string {
  return sha256Hex(
    utf8Encode(
      canonicalizeJson({
        domain: PMM_JOB_REQUEST_DIGEST_DOMAIN,
        ownerPrincipalRef: input.ownerPrincipalRef,
        agentId: input.agentId,
        accountableAgentId: input.accountableAgentId,
        jobType: input.request.jobType,
        initiatorShellSessionRef: input.request.initiatorShellSessionRef,
        prompt: input.request.prompt,
        options: input.request.options,
        routePolicy: input.request.routePolicy,
        pinnedRuntimeId: input.request.pinnedRuntimeId ?? null,
        clientRequestId: input.request.clientRequestId,
      }),
    ),
  );
}

export function computePersonalMachineExecutionCommandDigestV1(input: {
  jobRequestDigest: string;
  actionId: string;
  mandateRef: string;
  routeDecisionRef: string;
  selectedDeviceRef: string;
  selectedRuntimeId: string;
  executorShellBindingRef: string;
  executorShellBindingVersion: string;
}): string {
  return sha256Hex(
    utf8Encode(
      canonicalizeJson({
        domain: PMM_EXECUTION_COMMAND_DIGEST_DOMAIN,
        jobRequestDigest: input.jobRequestDigest,
        actionId: input.actionId,
        mandateRef: input.mandateRef,
        routeDecisionRef: input.routeDecisionRef,
        selectedDeviceRef: input.selectedDeviceRef,
        selectedRuntimeId: input.selectedRuntimeId,
        executorShellBindingRef: input.executorShellBindingRef,
        executorShellBindingVersion: input.executorShellBindingVersion,
      }),
    ),
  );
}

export function encodePersonalMachineListCursorV1(
  cursor: PersonalMachineListCursorV1,
): string {
  const validation = validatePersonalMachineListCursorV1(cursor);
  if (!validation.valid) {
    throw new PersonalMachineContractValidationError(validation.errors);
  }
  return Buffer.from(canonicalizeJson(cursor), "utf8").toString("base64url");
}

export function decodePersonalMachineListCursorV1(
  raw: string,
  expectedOwner: string,
  expectedResource: PersonalMachineListCursorV1["resource"],
): PersonalMachineListCursorV1 {
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(raw, "base64url").toString("utf8"));
  } catch {
    throw new PersonalMachineContractValidationError(["cursor: malformed"]);
  }
  const validation = validatePersonalMachineListCursorV1(parsed, expectedOwner);
  if (!validation.valid) {
    throw new PersonalMachineContractValidationError(validation.errors);
  }
  const cursor = parsed as PersonalMachineListCursorV1;
  if (cursor.resource !== expectedResource) {
    throw new PersonalMachineContractValidationError([
      "cursor.resource: filter mismatch",
    ]);
  }
  return cursor;
}

export const PMM_JOB_REQUEST_DIGEST_GOLDEN_V1 = {
  domain: PMM_JOB_REQUEST_DIGEST_DOMAIN,
  request: {
    schemaVersion: "1",
    jobType: PMM_JOB_TYPE_V1,
    agentId: "agent-1",
    initiatorShellSessionRef: "shell-init-1",
    prompt: "hello",
    options: { maxOutputTokens: 16 },
    routePolicy: PMM_ROUTE_POLICY_V1,
    clientRequestId: "client-1",
  } satisfies PersonalMachineJobRequestV1,
  ownerPrincipalRef: "owner-1",
  accountableAgentId: "agent-1",
} as const;

export const PMM_EXECUTION_COMMAND_DIGEST_GOLDEN_V1 = {
  jobRequestDigest: "a".repeat(64),
  actionId: "action-1",
  mandateRef: "mandate-1",
  routeDecisionRef: "route-1",
  selectedDeviceRef: "device-1",
  selectedRuntimeId: "runtime-1",
  executorShellBindingRef: "bind-1",
  executorShellBindingVersion: "3",
} as const;

// ---------------------------------------------------------------------------
// Layer B — future Machine Economy additive contracts.
// These are not PMM V1. Paid skill / platform_credit are not this profile.
// ---------------------------------------------------------------------------

export const MACHINE_ECONOMY_IS_NOT_V1 = [
  "paid_skill",
  "platform_credit",
  "personal_machine_mesh_v1",
  "developer_remote_workspace",
  "agent_rental_legacy",
] as const;

export const MACHINE_ECONOMY_REASON_CODES_V1 = [
  "MACHINE_ECONOMY_UNAVAILABLE",
  "MACHINE_ECONOMY_RENTAL_CLOSED",
  "MACHINE_ECONOMY_AUTO_ACCEPT_CLOSED",
  "MACHINE_ECONOMY_CROSS_OWNER_AUTHORITY_UNAVAILABLE",
  "MACHINE_ECONOMY_KYC_TAX_UNAVAILABLE",
  "MACHINE_ECONOMY_ESCROW_PAYOUT_UNAVAILABLE",
  "MACHINE_ECONOMY_METERING_UNAVAILABLE",
  "MACHINE_ECONOMY_DISPUTE_UNAVAILABLE",
  "MACHINE_ECONOMY_SLA_UNAVAILABLE",
  "MACHINE_ECONOMY_DEVICE_ASSURANCE_UNAVAILABLE",
  "MACHINE_ECONOMY_LEGAL_BLOCKER",
] as const;
export type MachineEconomyReasonCodeV1 =
  (typeof MACHINE_ECONOMY_REASON_CODES_V1)[number];

export type MachineEconomyAdapterDispositionV1 = "unavailable";

export interface MachineEconomyUnavailableV1 {
  schemaVersion: "1";
  profile: typeof MACHINE_ECONOMY_PROFILE;
  available: false;
  disposition: MachineEconomyAdapterDispositionV1;
  reasonCode: MachineEconomyReasonCodeV1;
  note: string;
}

export interface MachineOfferingV1 {
  schemaVersion: "1";
  offeringRef: string;
  ownerPrincipalRef: string;
  machineProjectionRef: string;
  capabilityAttestationRef: string;
  rentalOpen: false;
  autoAccept: false;
}

export interface MachineCapabilityAttestationV1 {
  schemaVersion: "1";
  attestationRef: string;
  offeringRef: string;
  assuranceLevel: "unverified" | "device-bound" | "hardware-attested";
  antiCheatProfile: "unspecified";
  capturedAt: string;
}

export interface MachineQuoteV1 {
  schemaVersion: "1";
  quoteRef: string;
  offeringRef: string;
  currency: "USD";
  unit: "job" | "minute" | "token";
  amount: string;
  mandateRequired: true;
}

export interface MachineMandateV1 {
  schemaVersion: "1";
  mandateRef: string;
  quoteRef: string;
  consumerPrincipalRef: string;
  providerPrincipalRef: string;
  crossOwner: true;
}

export interface MachineMeteringRecordV1 {
  schemaVersion: "1";
  meterRef: string;
  mandateRef: string;
  units: string;
  antiCheatEvidenceRef?: string;
}

export interface MachineAntiCheatEvidenceV1 {
  schemaVersion: "1";
  evidenceRef: string;
  meterRef: string;
  placementProof: "unverified";
}

export interface CrossOwnerAuthorityGrantV1 {
  schemaVersion: "1";
  grantRef: string;
  consumerPrincipalRef: string;
  providerPrincipalRef: string;
  scope: "machine-rental";
}

export interface MachineKycTaxStatusV1 {
  schemaVersion: "1";
  subjectPrincipalRef: string;
  kycStatus: "unknown" | "pending" | "cleared" | "rejected";
  taxStatus: "unknown" | "pending" | "registered" | "blocked";
}

export interface MachineEscrowPayoutRefV1 {
  schemaVersion: "1";
  escrowRef: string;
  payoutRef?: string;
  mandateRef: string;
}

export interface MachineDisputeRemedyV1 {
  schemaVersion: "1";
  disputeRef: string;
  mandateRef: string;
  remedyRef?: string;
}

export interface MachineSlaV1 {
  schemaVersion: "1";
  slaRef: string;
  offeringRef: string;
  availabilityTargetBps?: number;
}

export function unavailableMachineEconomyAdapterV1(
  reasonCode: MachineEconomyReasonCodeV1,
  note: string,
): MachineEconomyUnavailableV1 {
  return {
    schemaVersion: "1",
    profile: MACHINE_ECONOMY_PROFILE,
    available: false,
    disposition: "unavailable",
    reasonCode,
    note,
  };
}

export function validateMachineEconomyUnavailableV1(
  input: unknown,
): PersonalMachineValidationResultV1 {
  const errors: string[] = [];
  if (!isRecord(input)) {
    return { valid: false, errors: ["machineEconomy: expected object"] };
  }
  exactKeys(
    input,
    [
      "schemaVersion",
      "profile",
      "available",
      "disposition",
      "reasonCode",
      "note",
    ],
    [],
    "machineEconomy",
    errors,
  );
  if (input.schemaVersion !== "1") {
    errors.push("machineEconomy.schemaVersion: expected 1");
  }
  if (input.profile !== MACHINE_ECONOMY_PROFILE) {
    errors.push("machineEconomy.profile: expected machine-economy-v1");
  }
  if (input.available !== false) {
    errors.push(
      "machineEconomy.available: rental/financial adapters stay closed",
    );
  }
  if (input.disposition !== "unavailable") {
    errors.push("machineEconomy.disposition: only unavailable this round");
  }
  oneOf(
    input.reasonCode,
    MACHINE_ECONOMY_REASON_CODES_V1,
    "machineEconomy.reasonCode",
    errors,
  );
  return { valid: errors.length === 0, errors };
}
