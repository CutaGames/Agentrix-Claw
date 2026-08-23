/**
 * Developer Remote Workspace V1 wire contracts.
 *
 * This module is deliberately control-plane only. Instruction, plan, diff, log,
 * and terminal bodies are represented by encrypted, expiring data references.
 * Provider credentials, cookies, local paths, and raw bodies have no wire field.
 *
 * ShellSessionBindingV1 and ShellCommandEnvelopeV1 remain canonical. This
 * module only carries canonical RecordRefs/digests and validates an instruction
 * against Shell-owned objects; it never creates a binding, command, or journal
 * record.
 */

import { isRecordRefV1 } from "./agent-attribution";
import {
  validateShellCommandAgainstBindingV1,
  validateShellCommandEnvelopeV1,
  validateShellSessionBindingV1,
  type ShellCommandEnvelopeV1,
  type ShellSessionBindingV1,
} from "./shell-session-binding";
import type { DigestRef, RecordRef } from "./trust-loop-primitives";

export const DEVELOPER_REMOTE_WORKSPACE_SCHEMA_VERSION = 1 as const;
export const DEVELOPER_REMOTE_WORKSPACE_CANONICALIZATION = "jcs/1" as const;

export const DEVELOPER_ADAPTER_KINDS_V1 = [
  "acp",
  "vendor_app_server",
  "structured_cli",
  "ide_extension",
  "deep_link_only",
  "unsupported",
] as const;
export type DeveloperAdapterKindV1 =
  (typeof DEVELOPER_ADAPTER_KINDS_V1)[number];

export const DEVELOPER_ADAPTER_SUPPORT_STATUSES_V1 = [
  "supported",
  "planned",
  "unsupported",
] as const;
export type DeveloperAdapterSupportStatusV1 =
  (typeof DEVELOPER_ADAPTER_SUPPORT_STATUSES_V1)[number];

export const DEVELOPER_PLATFORMS_V1 = ["linux", "macos", "windows"] as const;
export type DeveloperPlatformV1 = (typeof DEVELOPER_PLATFORMS_V1)[number];

export const DEVELOPER_AUTH_PLACEMENTS_V1 = [
  "desktop_secure_storage",
  "vendor_runtime",
  "vendor_owned_remote",
  "not_applicable",
] as const;
export type DeveloperAuthPlacementV1 =
  (typeof DEVELOPER_AUTH_PLACEMENTS_V1)[number];

export const DEVELOPER_SESSION_STATES_V1 = [
  "discovered",
  "available",
  "loading",
  "creating",
  "ready",
  "busy",
  "unavailable",
  "stale",
  "revoked",
  "closed",
  "unknown",
] as const;
export type DeveloperSessionStateV1 =
  (typeof DEVELOPER_SESSION_STATES_V1)[number];

export const DEVELOPER_SESSION_EVENT_TYPES_V1 = [
  "accepted",
  "claimed",
  "planning",
  "awaiting_approval",
  "running",
  "completed",
  "failed",
  "cancelled",
  "unknown_outcome",
  "unavailable",
] as const;
export type DeveloperSessionEventTypeV1 =
  (typeof DEVELOPER_SESSION_EVENT_TYPES_V1)[number];

export const DEVELOPER_TERMINAL_STATUSES_V1 = [
  "completed",
  "failed",
  "cancelled",
  "unknown_outcome",
  "unavailable",
] as const;
export type DeveloperTerminalStatusV1 =
  (typeof DEVELOPER_TERMINAL_STATUSES_V1)[number];

export const DEVELOPER_APPROVAL_RISKS_V1 = ["L0", "L1", "L2", "L3"] as const;
export type DeveloperApprovalRiskV1 =
  (typeof DEVELOPER_APPROVAL_RISKS_V1)[number];

export const DEVELOPER_APPROVAL_OPERATION_KINDS_V1 = [
  "read_status",
  "read_selected_file",
  "run_test",
  "network_read",
  "write_file",
  "execute_command",
  "install_dependency",
  "external_write",
  "delete",
  "deploy",
  "credential_access",
  "permission_change",
  "payment",
] as const;
export type DeveloperApprovalOperationKindV1 =
  (typeof DEVELOPER_APPROVAL_OPERATION_KINDS_V1)[number];

export const DEVELOPER_APPROVAL_SIDE_EFFECT_CLASSES_V1 = [
  "none",
  "local_read",
  "network_read",
  "local_write",
  "command_execution",
  "external_write",
  "irreversible",
] as const;
export type DeveloperApprovalSideEffectClassV1 =
  (typeof DEVELOPER_APPROVAL_SIDE_EFFECT_CLASSES_V1)[number];

export const DEVELOPER_APPROVAL_TERMINAL_DECISIONS_V1 = [
  "approved",
  "rejected",
  "expired",
  "cancelled",
  "superseded",
] as const;
export type DeveloperApprovalTerminalDecisionV1 =
  (typeof DEVELOPER_APPROVAL_TERMINAL_DECISIONS_V1)[number];

export const DEVELOPER_DATA_KINDS_V1 = [
  "instruction",
  "plan",
  "diff",
  "log",
  "terminal_result",
] as const;
export type DeveloperDataKindV1 = (typeof DEVELOPER_DATA_KINDS_V1)[number];

export const DEVELOPER_SURFACES_V1 = [
  "web",
  "mobile",
  "desktop_runtime",
  "ide_extension",
] as const;
export type DeveloperSurfaceV1 = (typeof DEVELOPER_SURFACES_V1)[number];

export type DeveloperShellBindingRefV1 = RecordRef & {
  type: "shell_session_binding";
  version: number;
};

export type DeveloperShellCommandJournalRefV1 = RecordRef & {
  type: "shell_command_journal_entry";
  version: number;
};

export interface DeveloperEncryptedDataRefV1 {
  kind: "encrypted_data_ref";
  dataKind: DeveloperDataKindV1;
  dataRef: string;
  digest: DigestRef;
  sizeBytes: number;
  dataClass: "owner_private" | "restricted";
  encryption: "runtime_managed";
  ownerScope: "authenticated_owner";
  runtimeRef: RecordRef & { type: "runtime"; version: number };
  expiresAt: string;
}

export interface DeveloperAdapterSessionCapabilitiesV1 {
  list: boolean;
  create: boolean;
  resume: boolean;
  prompt: boolean;
  streamEvents: boolean;
  cancel: boolean;
  terminalQuery: boolean;
}

export interface DeveloperAdapterApprovalCapabilitiesV1 {
  permissionRequests: boolean;
  exactDigestDecision: boolean;
  canonicalAuthorityBridge: boolean;
}

export interface DeveloperAdapterWorkspaceCapabilitiesV1 {
  explicitSelection: boolean;
  trustGate: boolean;
  redactedMetadataOnly: boolean;
}

export type DeveloperAdapterProtocolV1 =
  | {
      kind: "acp";
      protocolName: "agent_client_protocol";
      protocolVersion: string;
      transport: "stdio" | "local_socket";
    }
  | {
      kind: "vendor_app_server";
      protocolName: string;
      protocolVersion: string;
      transport: "stdio" | "local_socket";
    }
  | {
      kind: "structured_cli";
      protocolName: string;
      protocolVersion: string;
      transport: "stdio";
    }
  | {
      kind: "ide_extension";
      protocolName: string;
      protocolVersion: string;
      transport: "local_extension_host";
    }
  | {
      kind: "deep_link_only";
      protocolName: "vendor_deep_link";
    }
  | {
      kind: "unsupported";
      protocolName: "none";
    };

export type DeveloperAdapterCertificationV1 =
  | {
      status: "supported";
      officialCapabilityReviewRef: RecordRef & {
        type: "evidence";
        version: number;
      };
      termsReviewRef: RecordRef & { type: "terms"; version: number };
      reviewedAt: string;
    }
  | {
      status: "planned";
      reasonCode: string;
    }
  | {
      status: "unsupported";
      reasonCode: string;
      reviewedAt?: string;
    };

export interface DeveloperAdapterCapabilityV1 {
  schemaVersion: typeof DEVELOPER_REMOTE_WORKSPACE_SCHEMA_VERSION;
  contractType: "developer_adapter_capability";
  manifestRef: string;
  manifestVersion: number;
  adapterRef: string;
  providerRef: string;
  providerDisplayName: string;
  productRef: string;
  productDisplayName: string;
  protocol: DeveloperAdapterProtocolV1;
  certification: DeveloperAdapterCertificationV1;
  sessionCapabilities: DeveloperAdapterSessionCapabilitiesV1;
  approvalCapabilities: DeveloperAdapterApprovalCapabilitiesV1;
  workspaceCapabilities: DeveloperAdapterWorkspaceCapabilitiesV1;
  platforms: DeveloperPlatformV1[];
  authPlacement: DeveloperAuthPlacementV1;
  freshness: {
    observedAt: string;
    validUntil: string;
    sequence: number;
  };
  limitations: string[];
}

export type DeveloperMachineConnectionV1 =
  | {
      status: "online";
      observedAt: string;
      validUntil: string;
    }
  | {
      status: "offline";
      observedAt: string;
      reasonCode: string;
    }
  | {
      status: "stale";
      observedAt: string;
      staleSince: string;
      reasonCode: string;
    };

export interface DeveloperMachineAxesV1 {
  presence: "present" | "absent" | "unknown";
  process: "running" | "stopped" | "unknown";
  cli: "installed" | "not_installed" | "unknown";
  ide: "open" | "closed" | "unknown";
  workspaceTrust: "trusted" | "untrusted" | "unknown";
  sessionResumability: "supported" | "unsupported" | "unknown";
  permissionBridge: "available" | "unavailable" | "unknown";
}

interface DeveloperMachineProjectionBaseV1 {
  schemaVersion: typeof DEVELOPER_REMOTE_WORKSPACE_SCHEMA_VERSION;
  contractType: "developer_machine_projection";
  machineRef: string;
  ownerPrincipalRef: string;
  agentId: string;
  deviceRef: string;
  runtimeRef: RecordRef & { type: "runtime"; version: number };
  adapterManifestRef: string;
  adapterManifestVersion: number;
  displayLabel: string;
  platform: DeveloperPlatformV1;
  axes: DeveloperMachineAxesV1;
  projectionSequence: number;
  capturedAt: string;
}

export type DeveloperMachineProjectionV1 =
  | (DeveloperMachineProjectionBaseV1 & {
      connection: Extract<DeveloperMachineConnectionV1, { status: "online" }>;
      shellBindingRef: DeveloperShellBindingRefV1;
    })
  | (DeveloperMachineProjectionBaseV1 & {
      connection: Extract<
        DeveloperMachineConnectionV1,
        { status: "offline" | "stale" }
      >;
      shellBindingRef?: never;
    });

export type DeveloperWorkspaceTrustV1 =
  | {
      status: "trusted";
      trustRef: RecordRef & { type: "evidence"; version: number };
      trustedAt: string;
    }
  | {
      status: "untrusted";
      reasonCode: string;
      observedAt: string;
    }
  | {
      status: "unknown";
      reasonCode: string;
      observedAt: string;
    };

export interface DeveloperWorkspaceRefV1 {
  schemaVersion: typeof DEVELOPER_REMOTE_WORKSPACE_SCHEMA_VERSION;
  contractType: "developer_workspace_ref";
  workspaceRef: string;
  workspaceVersion: number;
  machineRef: string;
  deviceRef: string;
  runtimeRef: RecordRef & { type: "runtime"; version: number };
  scope: "repository" | "directory" | "project";
  displayLabel: string;
  repositoryHint?: {
    repositoryLabel: string;
    branchLabel?: string;
  };
  workspaceDigest: DigestRef;
  trust: DeveloperWorkspaceTrustV1;
  observedAt: string;
}

export interface DeveloperSessionCapabilitiesV1 {
  canResume: boolean;
  canPrompt: boolean;
  canCancel: boolean;
  canQueryTerminal: boolean;
}

interface DeveloperSessionSummaryBaseV1 {
  schemaVersion: typeof DEVELOPER_REMOTE_WORKSPACE_SCHEMA_VERSION;
  contractType: "developer_session_summary";
  sessionRef: string;
  adapterSessionRef: string;
  agentId: string;
  machineRef: string;
  deviceRef: string;
  runtimeRef: RecordRef & { type: "runtime"; version: number };
  workspaceRef: string;
  adapterManifestRef: string;
  adapterManifestVersion: number;
  sessionVersion: number;
  capabilities: DeveloperSessionCapabilitiesV1;
  projectionSequence: number;
  lastActivityAt: string;
  observedAt: string;
}

export type DeveloperSessionSummaryV1 =
  | (DeveloperSessionSummaryBaseV1 & { state: "discovered" })
  | (DeveloperSessionSummaryBaseV1 & {
      state: "available";
      resumeDisposition: "resumable" | "create_only";
    })
  | (DeveloperSessionSummaryBaseV1 & {
      state: "loading" | "creating";
      operationRef: string;
      operationStartedAt: string;
    })
  | (DeveloperSessionSummaryBaseV1 & { state: "ready" })
  | (DeveloperSessionSummaryBaseV1 & {
      state: "busy";
      activeInstructionRef: string;
    })
  | (DeveloperSessionSummaryBaseV1 & {
      state: "unavailable";
      reasonCode: string;
    })
  | (DeveloperSessionSummaryBaseV1 & {
      state: "stale";
      staleSince: string;
      reasonCode: string;
    })
  | (DeveloperSessionSummaryBaseV1 & {
      state: "revoked";
      revokedAt: string;
      revocationRef: RecordRef;
    })
  | (DeveloperSessionSummaryBaseV1 & {
      state: "closed";
      closedAt: string;
    })
  | (DeveloperSessionSummaryBaseV1 & {
      state: "unknown";
      reasonCode: string;
    });

export interface DeveloperInstructionV1 {
  schemaVersion: typeof DEVELOPER_REMOTE_WORKSPACE_SCHEMA_VERSION;
  contractType: "developer_instruction";
  instructionRef: string;
  actionRef: string;
  agentId: string;
  machineRef: string;
  deviceRef: string;
  runtimeRef: RecordRef & { type: "runtime"; version: number };
  workspaceRef: string;
  sessionRef: string;
  adapterSessionRef: string;
  adapterManifestRef: string;
  expectedSessionVersion: number;
  shellBindingRef: DeveloperShellBindingRefV1;
  instructionSequence: number;
  idempotencyKey: string;
  requestDigest: DigestRef;
  payloadRef: DeveloperEncryptedDataRefV1 & { dataKind: "instruction" };
  userVisibleSummary: string;
  issuedAt: string;
  expiresAt: string;
}

export interface DeveloperEventCursorV1 {
  streamRef: string;
  sequence: number;
}

interface DeveloperSessionEventBaseV1 {
  schemaVersion: typeof DEVELOPER_REMOTE_WORKSPACE_SCHEMA_VERSION;
  contractType: "developer_session_event";
  eventRef: string;
  streamRef: string;
  instructionRef: string;
  actionRef: string;
  sessionRef: string;
  sessionVersion: number;
  adapterSessionRef: string;
  sequence: number;
  previousSequence: number;
  cursor: DeveloperEventCursorV1;
  occurredAt: string;
  eventDigest: DigestRef;
}

type DeveloperTerminalEventTypeV1 = Extract<
  DeveloperSessionEventTypeV1,
  "completed" | "failed" | "cancelled" | "unknown_outcome" | "unavailable"
>;

export type DeveloperSessionEventV1 =
  | (DeveloperSessionEventBaseV1 & { eventType: "accepted" })
  | (DeveloperSessionEventBaseV1 & {
      eventType: "claimed";
      shellCommandJournalRef: DeveloperShellCommandJournalRefV1;
    })
  | (DeveloperSessionEventBaseV1 & {
      eventType: "planning";
      planDataRef: DeveloperEncryptedDataRefV1 & { dataKind: "plan" };
    })
  | (DeveloperSessionEventBaseV1 & {
      eventType: "awaiting_approval";
      approvalRef: string;
      approvalRequestDigest: DigestRef;
    })
  | (DeveloperSessionEventBaseV1 & {
      eventType: "running";
      executionRef: string;
    })
  | (DeveloperSessionEventBaseV1 & {
      eventType: DeveloperTerminalEventTypeV1;
      terminalResultRef: string;
      terminalResultDigest: DigestRef;
    });

export type DeveloperEstimatedCostV1 =
  | { status: "not_applicable" }
  | {
      status: "estimated";
      amountMinor: string;
      currency: string;
      decimals: number;
    }
  | {
      status: "unknown";
      reasonCode: string;
    };

export interface DeveloperApprovalRequestV1 {
  schemaVersion: typeof DEVELOPER_REMOTE_WORKSPACE_SCHEMA_VERSION;
  contractType: "developer_approval_request";
  approvalRef: string;
  approvalVersion: number;
  status: "pending";
  decisionSequence: 0;
  instructionRef: string;
  actionRef: string;
  sessionRef: string;
  sessionVersion: number;
  adapterSessionRef: string;
  adapterRequestRef: string;
  workspaceRef: string;
  operationKind: DeveloperApprovalOperationKindV1;
  toolName: string;
  toolArgumentsDigest: DigestRef;
  workspaceScopeDigest: DigestRef;
  instructionRequestDigest: DigestRef;
  requestDigest: DigestRef;
  risk: DeveloperApprovalRiskV1;
  sideEffectClass: DeveloperApprovalSideEffectClassV1;
  estimatedCost: DeveloperEstimatedCostV1;
  requestedGrantScopes: Array<"once" | "session">;
  requiresLocalConfirmation: boolean;
  userVisibleSummary: string;
  redactedArgumentsSummary: string;
  issuedAt: string;
  expiresAt: string;
}

interface DeveloperApprovalDecisionBaseV1 {
  schemaVersion: typeof DEVELOPER_REMOTE_WORKSPACE_SCHEMA_VERSION;
  contractType: "developer_approval_decision";
  decisionRef: string;
  approvalRef: string;
  approvalVersion: number;
  previousStatus: "pending";
  decisionSequence: 1;
  instructionRef: string;
  actionRef: string;
  sessionRef: string;
  sessionVersion: number;
  adapterSessionRef: string;
  adapterRequestRef: string;
  requestDigest: DigestRef;
  instructionRequestDigest: DigestRef;
  toolArgumentsDigest: DigestRef;
  workspaceScopeDigest: DigestRef;
  decidedAt: string;
  decisionDigest: DigestRef;
  authorityDecisionRef: RecordRef & {
    type: "authority_decision";
    version: number;
    digest: DigestRef;
  };
}

export type DeveloperApprovalDecisionV1 =
  | (DeveloperApprovalDecisionBaseV1 & {
      decision: "approved";
      resultingStatus: "approved";
      decidedByRef: string;
      grantScope: "once" | "session";
      grantExpiresAt: string;
      authorityGrantRef: RecordRef & {
        type: "authority_grant";
        version: number;
        digest: DigestRef;
      };
      localConfirmationRef?: string;
    })
  | (DeveloperApprovalDecisionBaseV1 & {
      decision: "rejected";
      resultingStatus: "rejected";
      decidedByRef: string;
      reasonCode: string;
    })
  | (DeveloperApprovalDecisionBaseV1 & {
      decision: "expired";
      resultingStatus: "expired";
      reasonCode: "request_expired";
    })
  | (DeveloperApprovalDecisionBaseV1 & {
      decision: "cancelled";
      resultingStatus: "cancelled";
      cancelledByRef: string;
      reasonCode: string;
    })
  | (DeveloperApprovalDecisionBaseV1 & {
      decision: "superseded";
      resultingStatus: "superseded";
      supersedingApprovalRef: string;
      reasonCode: string;
    });

interface DeveloperTerminalResultBaseV1 {
  schemaVersion: typeof DEVELOPER_REMOTE_WORKSPACE_SCHEMA_VERSION;
  contractType: "developer_terminal_result";
  terminalResultRef: string;
  instructionRef: string;
  actionRef: string;
  sessionRef: string;
  sessionVersion: number;
  adapterSessionRef: string;
  requestDigest: DigestRef;
  eventSequence: number;
  recordedAt: string;
  terminalDigest: DigestRef;
}

interface DeveloperExecutedTerminalResultBaseV1 extends DeveloperTerminalResultBaseV1 {
  shellBindingRef: DeveloperShellBindingRefV1;
  shellCommandJournalRef: DeveloperShellCommandJournalRefV1;
}

export type DeveloperTerminalResultV1 =
  | (DeveloperExecutedTerminalResultBaseV1 & {
      status: "completed";
      startedAt: string;
      completedAt: string;
      adapterTerminalEvidenceRef: RecordRef & {
        type: "evidence";
        version: number;
        digest: DigestRef;
      };
      outcomeRef: RecordRef & {
        type: "outcome_record";
        version: number;
        digest: DigestRef;
      };
      actionReceiptRef: RecordRef & {
        type: "action_receipt";
        version: number;
        digest: DigestRef;
      };
      resultDataRef?: DeveloperEncryptedDataRefV1 & {
        dataKind: "terminal_result";
      };
      canonicalReadBack: true;
    })
  | (DeveloperExecutedTerminalResultBaseV1 & {
      status: "failed";
      startedAt: string;
      completedAt: string;
      failureCode: string;
      adapterTerminalEvidenceRef: RecordRef & {
        type: "evidence";
        version: number;
        digest: DigestRef;
      };
      outcomeRef: RecordRef & {
        type: "outcome_record";
        version: number;
        digest: DigestRef;
      };
      resultDataRef?: DeveloperEncryptedDataRefV1 & {
        dataKind: "terminal_result";
      };
      canonicalReadBack: true;
    })
  | (DeveloperExecutedTerminalResultBaseV1 & {
      status: "cancelled";
      startedAt: string;
      completedAt: string;
      cancellationRef: string;
      adapterTerminalEvidenceRef: RecordRef & {
        type: "evidence";
        version: number;
        digest: DigestRef;
      };
      outcomeRef: RecordRef & {
        type: "outcome_record";
        version: number;
        digest: DigestRef;
      };
      canonicalReadBack: true;
    })
  | (DeveloperExecutedTerminalResultBaseV1 & {
      status: "unknown_outcome";
      unknownSince: string;
      reconciliationRef: RecordRef & {
        type: "downstream_idempotency";
        version: number;
        digest: DigestRef;
      };
      queryOnly: true;
      replayAllowed: false;
    })
  | (DeveloperTerminalResultBaseV1 & {
      status: "unavailable";
      reasonCode: string;
      executionStarted: false;
    });

export type DeveloperHandoffTargetV1 =
  | { kind: "session" }
  | {
      kind: "approval";
      approvalRef: string;
      approvalRequestDigest: DigestRef;
    }
  | {
      kind: "terminal_result";
      terminalResultRef: string;
      terminalResultDigest: DigestRef;
    };

interface DeveloperHandoffBaseV1 {
  schemaVersion: typeof DEVELOPER_REMOTE_WORKSPACE_SCHEMA_VERSION;
  contractType: "developer_handoff";
  handoffRef: string;
  handoffVersion: number;
  ownerPrincipalRef: string;
  agentId: string;
  machineRef: string;
  deviceRef: string;
  runtimeRef: RecordRef & { type: "runtime"; version: number };
  sessionRef: string;
  sessionVersion: number;
  adapterSessionRef: string;
  fromSurface: DeveloperSurfaceV1;
  toSurface: DeveloperSurfaceV1;
  target: DeveloperHandoffTargetV1;
  oneTime: true;
  issuedAt: string;
  expiresAt: string;
  handoffDigest: DigestRef;
}

export type DeveloperHandoffV1 =
  | (DeveloperHandoffBaseV1 & { status: "issued" })
  | (DeveloperHandoffBaseV1 & {
      status: "consumed";
      consumedAt: string;
      consumerSessionRef: string;
      consumptionReceiptRef: RecordRef & {
        type: "evidence";
        version: number;
        digest: DigestRef;
      };
    })
  | (DeveloperHandoffBaseV1 & {
      status: "expired";
      expiredAt: string;
    })
  | (DeveloperHandoffBaseV1 & {
      status: "revoked";
      revokedAt: string;
      revocationRef: RecordRef & {
        type: "evidence";
        version: number;
        digest: DigestRef;
      };
    });

export type DeveloperRemoteWorkspaceContractV1 =
  | DeveloperAdapterCapabilityV1
  | DeveloperMachineProjectionV1
  | DeveloperWorkspaceRefV1
  | DeveloperSessionSummaryV1
  | DeveloperInstructionV1
  | DeveloperSessionEventV1
  | DeveloperApprovalRequestV1
  | DeveloperApprovalDecisionV1
  | DeveloperTerminalResultV1
  | DeveloperHandoffV1;

export interface DeveloperRemoteWorkspaceValidationResultV1 {
  valid: boolean;
  errors: string[];
}

export class DeveloperRemoteWorkspaceContractValidationError extends Error {
  readonly code = "developer_remote_workspace_contract_invalid";

  constructor(readonly errors: string[]) {
    super(
      `Developer Remote Workspace contract validation failed: ${errors.join("; ")}`,
    );
    this.name = "DeveloperRemoteWorkspaceContractValidationError";
  }
}

const CANONICAL_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const SHA256_HEX = /^[0-9a-f]{64}$/;
const OPAQUE_REF = /^[A-Za-z0-9][A-Za-z0-9._~-]{0,127}$/;
const REASON_CODE = /^[a-z][a-z0-9_]{1,79}$/;
const CURRENCY = /^[A-Z]{3}$/;
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/;
const WINDOWS_ABSOLUTE_PATH = /^[A-Za-z]:[\\/]/;

function validation(
  errors: string[],
): DeveloperRemoteWorkspaceValidationResultV1 {
  return { valid: errors.length === 0, errors };
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function objectValue(
  value: unknown,
  path: string,
  errors: string[],
): Record<string, unknown> | undefined {
  if (!isPlainObject(value)) {
    errors.push(`${path}: expected plain object`);
    return undefined;
  }
  return value;
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
  for (const key of optional) {
    if (
      Object.prototype.hasOwnProperty.call(value, key) &&
      value[key] === null
    ) {
      errors.push(`${path}.${key}: null does not represent absence`);
    }
  }
}

function schema(
  value: Record<string, unknown>,
  contractType: string,
  path: string,
  errors: string[],
): void {
  if (value.schemaVersion !== DEVELOPER_REMOTE_WORKSPACE_SCHEMA_VERSION) {
    errors.push(
      `${path}.schemaVersion: unsupported version ${JSON.stringify(value.schemaVersion)}`,
    );
  }
  if (value.contractType !== contractType) {
    errors.push(`${path}.contractType: expected ${contractType}`);
  }
}

function isValidUnicode(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code >= 0xd800 && code <= 0xdbff) {
      if (index + 1 >= value.length) return false;
      const next = value.charCodeAt(index + 1);
      if (next < 0xdc00 || next > 0xdfff) return false;
      index += 1;
    } else if (code >= 0xdc00 && code <= 0xdfff) {
      return false;
    }
  }
  return true;
}

function boundedString(
  value: unknown,
  path: string,
  errors: string[],
  maxLength = 256,
): value is string {
  if (
    typeof value !== "string" ||
    value.trim().length === 0 ||
    value.length > maxLength ||
    CONTROL_CHARACTERS.test(value) ||
    !isValidUnicode(value)
  ) {
    errors.push(
      `${path}: expected bounded non-empty text without control characters`,
    );
    return false;
  }
  return true;
}

function safeDisplayString(
  value: unknown,
  path: string,
  errors: string[],
  maxLength = 256,
): value is string {
  if (!boundedString(value, path, errors, maxLength)) return false;
  const pathCandidate = value.trimStart();
  if (
    WINDOWS_ABSOLUTE_PATH.test(pathCandidate) ||
    pathCandidate.startsWith("/") ||
    pathCandidate.startsWith("\\\\") ||
    pathCandidate.toLowerCase().startsWith("file:") ||
    pathCandidate.startsWith("~/") ||
    pathCandidate.startsWith("~\\")
  ) {
    errors.push(`${path}: absolute local paths are forbidden`);
    return false;
  }
  return true;
}

function opaqueRef(
  value: unknown,
  path: string,
  errors: string[],
): value is string {
  if (typeof value !== "string" || !OPAQUE_REF.test(value)) {
    errors.push(`${path}: expected bounded opaque reference`);
    return false;
  }
  return true;
}

function reasonCode(
  value: unknown,
  path: string,
  errors: string[],
): value is string {
  if (typeof value !== "string" || !REASON_CODE.test(value)) {
    errors.push(`${path}: expected stable snake_case reason code`);
    return false;
  }
  return true;
}

function canonicalTimestamp(
  value: unknown,
  path: string,
  errors: string[],
): value is string {
  if (typeof value !== "string" || !CANONICAL_TIMESTAMP.test(value)) {
    errors.push(
      `${path}: expected canonical RFC 3339 UTC millisecond timestamp`,
    );
    return false;
  }
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed) || new Date(parsed).toISOString() !== value) {
    errors.push(`${path}: invalid timestamp`);
    return false;
  }
  return true;
}

function positiveInteger(
  value: unknown,
  path: string,
  errors: string[],
): value is number {
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    value <= 0 ||
    Object.is(value, -0)
  ) {
    errors.push(`${path}: expected positive safe integer`);
    return false;
  }
  return true;
}

function nonNegativeInteger(
  value: unknown,
  path: string,
  errors: string[],
): value is number {
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    value < 0 ||
    Object.is(value, -0)
  ) {
    errors.push(`${path}: expected non-negative safe integer`);
    return false;
  }
  return true;
}

function booleanValue(
  value: unknown,
  path: string,
  errors: string[],
): value is boolean {
  if (typeof value !== "boolean") {
    errors.push(`${path}: expected boolean`);
    return false;
  }
  return true;
}

function enumValue<T extends string>(
  value: unknown,
  values: readonly T[],
  path: string,
  errors: string[],
): value is T {
  if (
    typeof value !== "string" ||
    !(values as readonly string[]).includes(value)
  ) {
    errors.push(`${path}: unknown enum value`);
    return false;
  }
  return true;
}

function digestRef(
  value: unknown,
  path: string,
  errors: string[],
): value is DigestRef {
  const digest = objectValue(value, path, errors);
  if (!digest) return false;
  exactKeys(
    digest,
    ["algorithm", "canonicalization", "value"],
    [],
    path,
    errors,
  );
  if (digest.algorithm !== "sha-256")
    errors.push(`${path}.algorithm: expected sha-256`);
  if (digest.canonicalization !== DEVELOPER_REMOTE_WORKSPACE_CANONICALIZATION) {
    errors.push(`${path}.canonicalization: expected jcs/1`);
  }
  if (typeof digest.value !== "string" || !SHA256_HEX.test(digest.value)) {
    errors.push(`${path}.value: expected lower-case SHA-256 hex`);
  }
  return (
    digest.algorithm === "sha-256" &&
    digest.canonicalization === DEVELOPER_REMOTE_WORKSPACE_CANONICALIZATION &&
    typeof digest.value === "string" &&
    SHA256_HEX.test(digest.value)
  );
}

function strictRecordRef(
  value: unknown,
  path: string,
  errors: string[],
  expectedType?: RecordRef["type"],
  requireVersion = true,
  requireDigest = false,
): value is RecordRef {
  const ref = objectValue(value, path, errors);
  if (!ref) return false;
  exactKeys(ref, ["type", "id"], ["version", "digest"], path, errors);
  let valid = isRecordRefV1(ref);
  if (!valid) errors.push(`${path}: expected known canonical RecordRef`);
  if (expectedType !== undefined && ref.type !== expectedType) {
    errors.push(`${path}.type: expected ${expectedType}`);
    valid = false;
  }
  if (
    requireVersion &&
    !positiveInteger(ref.version, `${path}.version`, errors)
  )
    valid = false;
  if (ref.digest !== undefined) {
    if (!digestRef(ref.digest, `${path}.digest`, errors)) valid = false;
  } else if (requireDigest) {
    errors.push(`${path}.digest: required`);
    valid = false;
  }
  return valid;
}

function stringArray(
  value: unknown,
  path: string,
  errors: string[],
  validateEntry: (entry: unknown, path: string, errors: string[]) => boolean,
  allowEmpty: boolean,
  requireSorted = true,
): value is string[] {
  if (!Array.isArray(value) || (!allowEmpty && value.length === 0)) {
    errors.push(`${path}: expected ${allowEmpty ? "" : "non-empty "}array`);
    return false;
  }
  let valid = true;
  value.forEach((entry, index) => {
    if (!validateEntry(entry, `${path}[${index}]`, errors)) valid = false;
  });
  if (value.every((entry) => typeof entry === "string")) {
    if (new Set(value).size !== value.length) {
      errors.push(`${path}: duplicate entries are forbidden`);
      valid = false;
    }
    if (requireSorted) {
      const sorted = [...value].sort();
      if (sorted.some((entry, index) => entry !== value[index])) {
        errors.push(`${path}: entries must be sorted`);
        valid = false;
      }
    }
  }
  return valid;
}

function validateBooleanObject(
  value: unknown,
  keys: readonly string[],
  path: string,
  errors: string[],
): Record<string, unknown> | undefined {
  const object = objectValue(value, path, errors);
  if (!object) return undefined;
  exactKeys(object, keys, [], path, errors);
  for (const key of keys) booleanValue(object[key], `${path}.${key}`, errors);
  return object;
}

function timestampsOrdered(
  earlier: unknown,
  later: unknown,
  earlierPath: string,
  laterPath: string,
  errors: string[],
  allowEqual = false,
): void {
  if (
    canonicalTimestamp(earlier, earlierPath, errors) &&
    canonicalTimestamp(later, laterPath, errors)
  ) {
    const left = Date.parse(earlier);
    const right = Date.parse(later);
    if (allowEqual ? left > right : left >= right) {
      errors.push(
        `${laterPath}: must be ${allowEqual ? "at or " : ""}after ${earlierPath}`,
      );
    }
  }
}

function digestRefsEqual(left: unknown, right: unknown): boolean {
  if (!isPlainObject(left) || !isPlainObject(right)) return false;
  return (
    left.algorithm === right.algorithm &&
    left.canonicalization === right.canonicalization &&
    left.value === right.value
  );
}

function validateDataRef(
  value: unknown,
  path: string,
  errors: string[],
  expectedKind?: DeveloperDataKindV1,
): value is DeveloperEncryptedDataRefV1 {
  const ref = objectValue(value, path, errors);
  if (!ref) return false;
  exactKeys(
    ref,
    [
      "kind",
      "dataKind",
      "dataRef",
      "digest",
      "sizeBytes",
      "dataClass",
      "encryption",
      "ownerScope",
      "runtimeRef",
      "expiresAt",
    ],
    [],
    path,
    errors,
  );
  if (ref.kind !== "encrypted_data_ref")
    errors.push(`${path}.kind: unsupported`);
  enumValue(ref.dataKind, DEVELOPER_DATA_KINDS_V1, `${path}.dataKind`, errors);
  if (expectedKind !== undefined && ref.dataKind !== expectedKind) {
    errors.push(`${path}.dataKind: expected ${expectedKind}`);
  }
  opaqueRef(ref.dataRef, `${path}.dataRef`, errors);
  digestRef(ref.digest, `${path}.digest`, errors);
  positiveInteger(ref.sizeBytes, `${path}.sizeBytes`, errors);
  enumValue(
    ref.dataClass,
    ["owner_private", "restricted"] as const,
    `${path}.dataClass`,
    errors,
  );
  if (ref.encryption !== "runtime_managed") {
    errors.push(`${path}.encryption: runtime_managed required`);
  }
  if (ref.ownerScope !== "authenticated_owner") {
    errors.push(`${path}.ownerScope: authenticated_owner required`);
  }
  strictRecordRef(ref.runtimeRef, `${path}.runtimeRef`, errors, "runtime");
  canonicalTimestamp(ref.expiresAt, `${path}.expiresAt`, errors);
  return errors.length === 0;
}

function validateAdapterProtocol(
  value: unknown,
  path: string,
  errors: string[],
): DeveloperAdapterKindV1 | undefined {
  const protocol = objectValue(value, path, errors);
  if (!protocol) return undefined;
  if (
    !enumValue(
      protocol.kind,
      DEVELOPER_ADAPTER_KINDS_V1,
      `${path}.kind`,
      errors,
    )
  ) {
    for (const key of Object.keys(protocol)) {
      if (
        !["kind", "protocolName", "protocolVersion", "transport"].includes(key)
      ) {
        errors.push(`${path}.${key}: unknown field`);
      }
    }
    return undefined;
  }

  switch (protocol.kind) {
    case "acp":
      exactKeys(
        protocol,
        ["kind", "protocolName", "protocolVersion", "transport"],
        [],
        path,
        errors,
      );
      if (protocol.protocolName !== "agent_client_protocol") {
        errors.push(`${path}.protocolName: expected agent_client_protocol`);
      }
      boundedString(
        protocol.protocolVersion,
        `${path}.protocolVersion`,
        errors,
        64,
      );
      enumValue(
        protocol.transport,
        ["stdio", "local_socket"] as const,
        `${path}.transport`,
        errors,
      );
      break;
    case "vendor_app_server":
      exactKeys(
        protocol,
        ["kind", "protocolName", "protocolVersion", "transport"],
        [],
        path,
        errors,
      );
      boundedString(protocol.protocolName, `${path}.protocolName`, errors, 64);
      boundedString(
        protocol.protocolVersion,
        `${path}.protocolVersion`,
        errors,
        64,
      );
      enumValue(
        protocol.transport,
        ["stdio", "local_socket"] as const,
        `${path}.transport`,
        errors,
      );
      break;
    case "structured_cli":
      exactKeys(
        protocol,
        ["kind", "protocolName", "protocolVersion", "transport"],
        [],
        path,
        errors,
      );
      boundedString(protocol.protocolName, `${path}.protocolName`, errors, 64);
      boundedString(
        protocol.protocolVersion,
        `${path}.protocolVersion`,
        errors,
        64,
      );
      if (protocol.transport !== "stdio")
        errors.push(`${path}.transport: expected stdio`);
      break;
    case "ide_extension":
      exactKeys(
        protocol,
        ["kind", "protocolName", "protocolVersion", "transport"],
        [],
        path,
        errors,
      );
      boundedString(protocol.protocolName, `${path}.protocolName`, errors, 64);
      boundedString(
        protocol.protocolVersion,
        `${path}.protocolVersion`,
        errors,
        64,
      );
      if (protocol.transport !== "local_extension_host") {
        errors.push(`${path}.transport: expected local_extension_host`);
      }
      break;
    case "deep_link_only":
      exactKeys(protocol, ["kind", "protocolName"], [], path, errors);
      if (protocol.protocolName !== "vendor_deep_link") {
        errors.push(`${path}.protocolName: expected vendor_deep_link`);
      }
      break;
    case "unsupported":
      exactKeys(protocol, ["kind", "protocolName"], [], path, errors);
      if (protocol.protocolName !== "none")
        errors.push(`${path}.protocolName: expected none`);
      break;
  }
  return protocol.kind;
}

function validateAdapterCertification(
  value: unknown,
  path: string,
  errors: string[],
): DeveloperAdapterSupportStatusV1 | undefined {
  const certification = objectValue(value, path, errors);
  if (!certification) return undefined;
  if (
    !enumValue(
      certification.status,
      DEVELOPER_ADAPTER_SUPPORT_STATUSES_V1,
      `${path}.status`,
      errors,
    )
  ) {
    for (const key of Object.keys(certification)) {
      if (
        ![
          "status",
          "officialCapabilityReviewRef",
          "termsReviewRef",
          "reviewedAt",
          "reasonCode",
        ].includes(key)
      ) {
        errors.push(`${path}.${key}: unknown field`);
      }
    }
    return undefined;
  }
  switch (certification.status) {
    case "supported":
      exactKeys(
        certification,
        [
          "status",
          "officialCapabilityReviewRef",
          "termsReviewRef",
          "reviewedAt",
        ],
        [],
        path,
        errors,
      );
      strictRecordRef(
        certification.officialCapabilityReviewRef,
        `${path}.officialCapabilityReviewRef`,
        errors,
        "evidence",
        true,
        true,
      );
      strictRecordRef(
        certification.termsReviewRef,
        `${path}.termsReviewRef`,
        errors,
        "terms",
        true,
        true,
      );
      canonicalTimestamp(
        certification.reviewedAt,
        `${path}.reviewedAt`,
        errors,
      );
      break;
    case "planned":
      exactKeys(certification, ["status", "reasonCode"], [], path, errors);
      reasonCode(certification.reasonCode, `${path}.reasonCode`, errors);
      break;
    case "unsupported":
      exactKeys(
        certification,
        ["status", "reasonCode"],
        ["reviewedAt"],
        path,
        errors,
      );
      reasonCode(certification.reasonCode, `${path}.reasonCode`, errors);
      if (certification.reviewedAt !== undefined) {
        canonicalTimestamp(
          certification.reviewedAt,
          `${path}.reviewedAt`,
          errors,
        );
      }
      break;
  }
  return certification.status;
}

function allCapabilitiesFalse(
  value: Record<string, unknown> | undefined,
): boolean {
  return (
    value !== undefined &&
    Object.values(value).every((entry) => entry === false)
  );
}

export function validateDeveloperAdapterCapabilityV1(
  input: unknown,
): DeveloperRemoteWorkspaceValidationResultV1 {
  const errors: string[] = [];
  const manifest = objectValue(input, "manifest", errors);
  if (!manifest) return validation(errors);
  exactKeys(
    manifest,
    [
      "schemaVersion",
      "contractType",
      "manifestRef",
      "manifestVersion",
      "adapterRef",
      "providerRef",
      "providerDisplayName",
      "productRef",
      "productDisplayName",
      "protocol",
      "certification",
      "sessionCapabilities",
      "approvalCapabilities",
      "workspaceCapabilities",
      "platforms",
      "authPlacement",
      "freshness",
      "limitations",
    ],
    [],
    "manifest",
    errors,
  );
  schema(manifest, "developer_adapter_capability", "manifest", errors);
  for (const key of [
    "manifestRef",
    "adapterRef",
    "providerRef",
    "productRef",
  ] as const) {
    opaqueRef(manifest[key], `manifest.${key}`, errors);
  }
  positiveInteger(manifest.manifestVersion, "manifest.manifestVersion", errors);
  safeDisplayString(
    manifest.providerDisplayName,
    "manifest.providerDisplayName",
    errors,
    128,
  );
  safeDisplayString(
    manifest.productDisplayName,
    "manifest.productDisplayName",
    errors,
    128,
  );

  const protocolKind = validateAdapterProtocol(
    manifest.protocol,
    "manifest.protocol",
    errors,
  );
  const supportStatus = validateAdapterCertification(
    manifest.certification,
    "manifest.certification",
    errors,
  );
  const session = validateBooleanObject(
    manifest.sessionCapabilities,
    [
      "list",
      "create",
      "resume",
      "prompt",
      "streamEvents",
      "cancel",
      "terminalQuery",
    ],
    "manifest.sessionCapabilities",
    errors,
  );
  const approval = validateBooleanObject(
    manifest.approvalCapabilities,
    ["permissionRequests", "exactDigestDecision", "canonicalAuthorityBridge"],
    "manifest.approvalCapabilities",
    errors,
  );
  const workspace = validateBooleanObject(
    manifest.workspaceCapabilities,
    ["explicitSelection", "trustGate", "redactedMetadataOnly"],
    "manifest.workspaceCapabilities",
    errors,
  );

  stringArray(
    manifest.platforms,
    "manifest.platforms",
    errors,
    (entry, path, target) =>
      enumValue(entry, DEVELOPER_PLATFORMS_V1, path, target),
    false,
  );
  enumValue(
    manifest.authPlacement,
    DEVELOPER_AUTH_PLACEMENTS_V1,
    "manifest.authPlacement",
    errors,
  );

  const freshness = objectValue(
    manifest.freshness,
    "manifest.freshness",
    errors,
  );
  if (freshness) {
    exactKeys(
      freshness,
      ["observedAt", "validUntil", "sequence"],
      [],
      "manifest.freshness",
      errors,
    );
    timestampsOrdered(
      freshness.observedAt,
      freshness.validUntil,
      "manifest.freshness.observedAt",
      "manifest.freshness.validUntil",
      errors,
    );
    positiveInteger(freshness.sequence, "manifest.freshness.sequence", errors);
    if (
      supportStatus === "supported" &&
      isPlainObject(manifest.certification) &&
      canonicalTimestamp(
        manifest.certification.reviewedAt,
        "manifest.certification.reviewedAt",
        [],
      ) &&
      canonicalTimestamp(
        freshness.observedAt,
        "manifest.freshness.observedAt",
        [],
      ) &&
      Date.parse(manifest.certification.reviewedAt as string) >
        Date.parse(freshness.observedAt as string)
    ) {
      errors.push(
        "manifest.certification.reviewedAt: cannot be after freshness.observedAt",
      );
    }
  }

  stringArray(
    manifest.limitations,
    "manifest.limitations",
    errors,
    reasonCode,
    true,
  );

  if (supportStatus !== "supported") {
    if (!allCapabilitiesFalse(session)) {
      errors.push(
        "manifest.sessionCapabilities: planned/unsupported adapters cannot claim capability",
      );
    }
    if (!allCapabilitiesFalse(approval)) {
      errors.push(
        "manifest.approvalCapabilities: planned/unsupported adapters cannot claim capability",
      );
    }
  }
  if (protocolKind === "unsupported") {
    if (supportStatus !== "unsupported") {
      errors.push(
        "manifest.certification.status: unsupported protocol requires unsupported status",
      );
    }
    if (!allCapabilitiesFalse(workspace)) {
      errors.push(
        "manifest.workspaceCapabilities: unsupported adapter cannot claim capability",
      );
    }
    if (manifest.authPlacement !== "not_applicable") {
      errors.push(
        "manifest.authPlacement: unsupported adapter requires not_applicable",
      );
    }
  }
  if (protocolKind === "deep_link_only") {
    if (!allCapabilitiesFalse(session) || !allCapabilitiesFalse(approval)) {
      errors.push(
        "manifest.protocol: deep_link_only cannot claim session or approval capability",
      );
    }
  }
  if (supportStatus === "supported" && protocolKind !== "deep_link_only") {
    if (!session || session.prompt !== true || session.streamEvents !== true) {
      errors.push(
        "manifest.sessionCapabilities: structured supported adapter requires prompt and streamEvents",
      );
    }
  }
  return validation(errors);
}

function validateMachineConnection(
  value: unknown,
  path: string,
  errors: string[],
): DeveloperMachineConnectionV1["status"] | undefined {
  const connection = objectValue(value, path, errors);
  if (!connection) return undefined;
  if (
    !enumValue(
      connection.status,
      ["online", "offline", "stale"] as const,
      `${path}.status`,
      errors,
    )
  ) {
    for (const key of Object.keys(connection)) {
      if (
        ![
          "status",
          "observedAt",
          "validUntil",
          "reasonCode",
          "staleSince",
        ].includes(key)
      ) {
        errors.push(`${path}.${key}: unknown field`);
      }
    }
    return undefined;
  }
  switch (connection.status) {
    case "online":
      exactKeys(
        connection,
        ["status", "observedAt", "validUntil"],
        [],
        path,
        errors,
      );
      timestampsOrdered(
        connection.observedAt,
        connection.validUntil,
        `${path}.observedAt`,
        `${path}.validUntil`,
        errors,
      );
      break;
    case "offline":
      exactKeys(
        connection,
        ["status", "observedAt", "reasonCode"],
        [],
        path,
        errors,
      );
      canonicalTimestamp(connection.observedAt, `${path}.observedAt`, errors);
      reasonCode(connection.reasonCode, `${path}.reasonCode`, errors);
      break;
    case "stale":
      exactKeys(
        connection,
        ["status", "observedAt", "staleSince", "reasonCode"],
        [],
        path,
        errors,
      );
      timestampsOrdered(
        connection.staleSince,
        connection.observedAt,
        `${path}.staleSince`,
        `${path}.observedAt`,
        errors,
        true,
      );
      reasonCode(connection.reasonCode, `${path}.reasonCode`, errors);
      break;
  }
  return connection.status;
}

function validateMachineAxes(
  value: unknown,
  path: string,
  errors: string[],
): void {
  const axes = objectValue(value, path, errors);
  if (!axes) return;
  exactKeys(
    axes,
    [
      "presence",
      "process",
      "cli",
      "ide",
      "workspaceTrust",
      "sessionResumability",
      "permissionBridge",
    ],
    [],
    path,
    errors,
  );
  enumValue(
    axes.presence,
    ["present", "absent", "unknown"] as const,
    `${path}.presence`,
    errors,
  );
  enumValue(
    axes.process,
    ["running", "stopped", "unknown"] as const,
    `${path}.process`,
    errors,
  );
  enumValue(
    axes.cli,
    ["installed", "not_installed", "unknown"] as const,
    `${path}.cli`,
    errors,
  );
  enumValue(
    axes.ide,
    ["open", "closed", "unknown"] as const,
    `${path}.ide`,
    errors,
  );
  enumValue(
    axes.workspaceTrust,
    ["trusted", "untrusted", "unknown"] as const,
    `${path}.workspaceTrust`,
    errors,
  );
  enumValue(
    axes.sessionResumability,
    ["supported", "unsupported", "unknown"] as const,
    `${path}.sessionResumability`,
    errors,
  );
  enumValue(
    axes.permissionBridge,
    ["available", "unavailable", "unknown"] as const,
    `${path}.permissionBridge`,
    errors,
  );
}

export function validateDeveloperMachineProjectionV1(
  input: unknown,
): DeveloperRemoteWorkspaceValidationResultV1 {
  const errors: string[] = [];
  const machine = objectValue(input, "machine", errors);
  if (!machine) return validation(errors);
  const connectionStatus = isPlainObject(machine.connection)
    ? machine.connection.status
    : undefined;
  const online = connectionStatus === "online";
  exactKeys(
    machine,
    [
      "schemaVersion",
      "contractType",
      "machineRef",
      "ownerPrincipalRef",
      "agentId",
      "deviceRef",
      "runtimeRef",
      "adapterManifestRef",
      "adapterManifestVersion",
      "displayLabel",
      "platform",
      "axes",
      "projectionSequence",
      "capturedAt",
      "connection",
      ...(online ? ["shellBindingRef"] : []),
    ],
    [],
    "machine",
    errors,
  );
  schema(machine, "developer_machine_projection", "machine", errors);
  for (const key of [
    "machineRef",
    "ownerPrincipalRef",
    "agentId",
    "deviceRef",
    "adapterManifestRef",
  ] as const) {
    opaqueRef(machine[key], `machine.${key}`, errors);
  }
  strictRecordRef(machine.runtimeRef, "machine.runtimeRef", errors, "runtime");
  positiveInteger(
    machine.adapterManifestVersion,
    "machine.adapterManifestVersion",
    errors,
  );
  safeDisplayString(machine.displayLabel, "machine.displayLabel", errors, 128);
  enumValue(
    machine.platform,
    DEVELOPER_PLATFORMS_V1,
    "machine.platform",
    errors,
  );
  validateMachineAxes(machine.axes, "machine.axes", errors);
  positiveInteger(
    machine.projectionSequence,
    "machine.projectionSequence",
    errors,
  );
  canonicalTimestamp(machine.capturedAt, "machine.capturedAt", errors);
  const status = validateMachineConnection(
    machine.connection,
    "machine.connection",
    errors,
  );
  if (
    isPlainObject(machine.connection) &&
    canonicalTimestamp(
      machine.connection.observedAt,
      "machine.connection.observedAt",
      [],
    ) &&
    canonicalTimestamp(machine.capturedAt, "machine.capturedAt", []) &&
    machine.connection.observedAt !== machine.capturedAt
  ) {
    errors.push("machine.capturedAt: must equal connection.observedAt");
  }
  if (status === "online") {
    strictRecordRef(
      machine.shellBindingRef,
      "machine.shellBindingRef",
      errors,
      "shell_session_binding",
    );
  } else if (machine.shellBindingRef !== undefined) {
    errors.push(
      "machine.shellBindingRef: forbidden unless connection is online",
    );
  }
  return validation(errors);
}

function validateWorkspaceTrust(
  value: unknown,
  path: string,
  errors: string[],
): DeveloperWorkspaceTrustV1["status"] | undefined {
  const trust = objectValue(value, path, errors);
  if (!trust) return undefined;
  if (
    !enumValue(
      trust.status,
      ["trusted", "untrusted", "unknown"] as const,
      `${path}.status`,
      errors,
    )
  ) {
    for (const key of Object.keys(trust)) {
      if (
        ![
          "status",
          "trustRef",
          "trustedAt",
          "reasonCode",
          "observedAt",
        ].includes(key)
      ) {
        errors.push(`${path}.${key}: unknown field`);
      }
    }
    return undefined;
  }
  if (trust.status === "trusted") {
    exactKeys(trust, ["status", "trustRef", "trustedAt"], [], path, errors);
    strictRecordRef(
      trust.trustRef,
      `${path}.trustRef`,
      errors,
      "evidence",
      true,
      true,
    );
    canonicalTimestamp(trust.trustedAt, `${path}.trustedAt`, errors);
  } else {
    exactKeys(trust, ["status", "reasonCode", "observedAt"], [], path, errors);
    reasonCode(trust.reasonCode, `${path}.reasonCode`, errors);
    canonicalTimestamp(trust.observedAt, `${path}.observedAt`, errors);
  }
  return trust.status;
}

export function validateDeveloperWorkspaceRefV1(
  input: unknown,
): DeveloperRemoteWorkspaceValidationResultV1 {
  const errors: string[] = [];
  const workspace = objectValue(input, "workspace", errors);
  if (!workspace) return validation(errors);
  exactKeys(
    workspace,
    [
      "schemaVersion",
      "contractType",
      "workspaceRef",
      "workspaceVersion",
      "machineRef",
      "deviceRef",
      "runtimeRef",
      "scope",
      "displayLabel",
      "workspaceDigest",
      "trust",
      "observedAt",
    ],
    ["repositoryHint"],
    "workspace",
    errors,
  );
  schema(workspace, "developer_workspace_ref", "workspace", errors);
  for (const key of ["workspaceRef", "machineRef", "deviceRef"] as const) {
    opaqueRef(workspace[key], `workspace.${key}`, errors);
  }
  positiveInteger(
    workspace.workspaceVersion,
    "workspace.workspaceVersion",
    errors,
  );
  strictRecordRef(
    workspace.runtimeRef,
    "workspace.runtimeRef",
    errors,
    "runtime",
  );
  enumValue(
    workspace.scope,
    ["repository", "directory", "project"] as const,
    "workspace.scope",
    errors,
  );
  safeDisplayString(
    workspace.displayLabel,
    "workspace.displayLabel",
    errors,
    128,
  );
  if (workspace.repositoryHint !== undefined) {
    const hint = objectValue(
      workspace.repositoryHint,
      "workspace.repositoryHint",
      errors,
    );
    if (hint) {
      exactKeys(
        hint,
        ["repositoryLabel"],
        ["branchLabel"],
        "workspace.repositoryHint",
        errors,
      );
      safeDisplayString(
        hint.repositoryLabel,
        "workspace.repositoryHint.repositoryLabel",
        errors,
        128,
      );
      if (hint.branchLabel !== undefined) {
        safeDisplayString(
          hint.branchLabel,
          "workspace.repositoryHint.branchLabel",
          errors,
          128,
        );
      }
    }
  }
  digestRef(workspace.workspaceDigest, "workspace.workspaceDigest", errors);
  validateWorkspaceTrust(workspace.trust, "workspace.trust", errors);
  canonicalTimestamp(workspace.observedAt, "workspace.observedAt", errors);
  if (isPlainObject(workspace.trust)) {
    const trustTime =
      workspace.trust.status === "trusted"
        ? workspace.trust.trustedAt
        : workspace.trust.observedAt;
    if (
      canonicalTimestamp(trustTime, "workspace.trust.time", []) &&
      canonicalTimestamp(workspace.observedAt, "workspace.observedAt", []) &&
      Date.parse(trustTime as string) >
        Date.parse(workspace.observedAt as string)
    ) {
      errors.push(
        "workspace.trust: observation cannot be after workspace.observedAt",
      );
    }
  }
  return validation(errors);
}

function validateSessionCapabilities(
  value: unknown,
  path: string,
  errors: string[],
): void {
  validateBooleanObject(
    value,
    ["canResume", "canPrompt", "canCancel", "canQueryTerminal"],
    path,
    errors,
  );
}

const SESSION_BASE_FIELDS = [
  "schemaVersion",
  "contractType",
  "sessionRef",
  "adapterSessionRef",
  "agentId",
  "machineRef",
  "deviceRef",
  "runtimeRef",
  "workspaceRef",
  "adapterManifestRef",
  "adapterManifestVersion",
  "sessionVersion",
  "capabilities",
  "projectionSequence",
  "lastActivityAt",
  "observedAt",
  "state",
] as const;

export function validateDeveloperSessionSummaryV1(
  input: unknown,
): DeveloperRemoteWorkspaceValidationResultV1 {
  const errors: string[] = [];
  const session = objectValue(input, "session", errors);
  if (!session) return validation(errors);
  const state = session.state;
  let variantFields: readonly string[] = [];
  if (state === "available") variantFields = ["resumeDisposition"];
  else if (state === "loading" || state === "creating") {
    variantFields = ["operationRef", "operationStartedAt"];
  } else if (state === "busy") variantFields = ["activeInstructionRef"];
  else if (state === "unavailable" || state === "unknown")
    variantFields = ["reasonCode"];
  else if (state === "stale") variantFields = ["staleSince", "reasonCode"];
  else if (state === "revoked") variantFields = ["revokedAt", "revocationRef"];
  else if (state === "closed") variantFields = ["closedAt"];
  exactKeys(
    session,
    [...SESSION_BASE_FIELDS, ...variantFields],
    [],
    "session",
    errors,
  );
  schema(session, "developer_session_summary", "session", errors);
  enumValue(
    session.state,
    DEVELOPER_SESSION_STATES_V1,
    "session.state",
    errors,
  );
  for (const key of [
    "sessionRef",
    "adapterSessionRef",
    "agentId",
    "machineRef",
    "deviceRef",
    "workspaceRef",
    "adapterManifestRef",
  ] as const) {
    opaqueRef(session[key], `session.${key}`, errors);
  }
  strictRecordRef(session.runtimeRef, "session.runtimeRef", errors, "runtime");
  positiveInteger(
    session.adapterManifestVersion,
    "session.adapterManifestVersion",
    errors,
  );
  positiveInteger(session.sessionVersion, "session.sessionVersion", errors);
  validateSessionCapabilities(
    session.capabilities,
    "session.capabilities",
    errors,
  );
  positiveInteger(
    session.projectionSequence,
    "session.projectionSequence",
    errors,
  );
  timestampsOrdered(
    session.lastActivityAt,
    session.observedAt,
    "session.lastActivityAt",
    "session.observedAt",
    errors,
    true,
  );

  switch (state) {
    case "available":
      enumValue(
        session.resumeDisposition,
        ["resumable", "create_only"] as const,
        "session.resumeDisposition",
        errors,
      );
      if (
        session.resumeDisposition === "resumable" &&
        isPlainObject(session.capabilities) &&
        session.capabilities.canResume !== true
      ) {
        errors.push(
          "session.capabilities.canResume: resumable session must be true",
        );
      }
      break;
    case "loading":
    case "creating":
      opaqueRef(session.operationRef, "session.operationRef", errors);
      timestampsOrdered(
        session.operationStartedAt,
        session.observedAt,
        "session.operationStartedAt",
        "session.observedAt",
        errors,
        true,
      );
      break;
    case "busy":
      opaqueRef(
        session.activeInstructionRef,
        "session.activeInstructionRef",
        errors,
      );
      break;
    case "unavailable":
    case "unknown":
      reasonCode(session.reasonCode, "session.reasonCode", errors);
      break;
    case "stale":
      reasonCode(session.reasonCode, "session.reasonCode", errors);
      timestampsOrdered(
        session.staleSince,
        session.observedAt,
        "session.staleSince",
        "session.observedAt",
        errors,
        true,
      );
      break;
    case "revoked":
      timestampsOrdered(
        session.revokedAt,
        session.observedAt,
        "session.revokedAt",
        "session.observedAt",
        errors,
        true,
      );
      strictRecordRef(
        session.revocationRef,
        "session.revocationRef",
        errors,
        undefined,
        true,
        true,
      );
      break;
    case "closed":
      timestampsOrdered(
        session.closedAt,
        session.observedAt,
        "session.closedAt",
        "session.observedAt",
        errors,
        true,
      );
      break;
  }
  return validation(errors);
}

export function validateDeveloperInstructionV1(
  input: unknown,
): DeveloperRemoteWorkspaceValidationResultV1 {
  const errors: string[] = [];
  const instruction = objectValue(input, "instruction", errors);
  if (!instruction) return validation(errors);
  exactKeys(
    instruction,
    [
      "schemaVersion",
      "contractType",
      "instructionRef",
      "actionRef",
      "agentId",
      "machineRef",
      "deviceRef",
      "runtimeRef",
      "workspaceRef",
      "sessionRef",
      "adapterSessionRef",
      "adapterManifestRef",
      "expectedSessionVersion",
      "shellBindingRef",
      "instructionSequence",
      "idempotencyKey",
      "requestDigest",
      "payloadRef",
      "userVisibleSummary",
      "issuedAt",
      "expiresAt",
    ],
    [],
    "instruction",
    errors,
  );
  schema(instruction, "developer_instruction", "instruction", errors);
  for (const key of [
    "instructionRef",
    "actionRef",
    "agentId",
    "machineRef",
    "deviceRef",
    "workspaceRef",
    "sessionRef",
    "adapterSessionRef",
    "adapterManifestRef",
    "idempotencyKey",
  ] as const) {
    opaqueRef(instruction[key], `instruction.${key}`, errors);
  }
  strictRecordRef(
    instruction.runtimeRef,
    "instruction.runtimeRef",
    errors,
    "runtime",
  );
  positiveInteger(
    instruction.expectedSessionVersion,
    "instruction.expectedSessionVersion",
    errors,
  );
  strictRecordRef(
    instruction.shellBindingRef,
    "instruction.shellBindingRef",
    errors,
    "shell_session_binding",
  );
  positiveInteger(
    instruction.instructionSequence,
    "instruction.instructionSequence",
    errors,
  );
  digestRef(instruction.requestDigest, "instruction.requestDigest", errors);
  validateDataRef(
    instruction.payloadRef,
    "instruction.payloadRef",
    errors,
    "instruction",
  );
  safeDisplayString(
    instruction.userVisibleSummary,
    "instruction.userVisibleSummary",
    errors,
    280,
  );
  timestampsOrdered(
    instruction.issuedAt,
    instruction.expiresAt,
    "instruction.issuedAt",
    "instruction.expiresAt",
    errors,
  );
  if (
    isPlainObject(instruction.payloadRef) &&
    canonicalTimestamp(
      instruction.payloadRef.expiresAt,
      "instruction.payloadRef.expiresAt",
      [],
    ) &&
    canonicalTimestamp(instruction.expiresAt, "instruction.expiresAt", []) &&
    Date.parse(instruction.payloadRef.expiresAt as string) <
      Date.parse(instruction.expiresAt as string)
  ) {
    errors.push(
      "instruction.payloadRef.expiresAt: must cover instruction expiry",
    );
  }
  if (
    isPlainObject(instruction.payloadRef) &&
    isPlainObject(instruction.runtimeRef) &&
    isPlainObject(instruction.payloadRef.runtimeRef) &&
    (instruction.payloadRef.runtimeRef.id !== instruction.runtimeRef.id ||
      instruction.payloadRef.runtimeRef.version !==
        instruction.runtimeRef.version)
  ) {
    errors.push(
      "instruction.payloadRef.runtimeRef: instruction runtime mismatch",
    );
  }
  return validation(errors);
}

/**
 * Read-only cross-contract fence. Canonical Shell validators own the binding
 * and command rules; this function only proves that a DRW instruction points
 * at those exact canonical values.
 */
export function validateDeveloperInstructionAgainstShellCommandV1(
  instructionInput: unknown,
  bindingInput: unknown,
  commandInput: unknown,
  now: string,
): DeveloperRemoteWorkspaceValidationResultV1 {
  const errors = validateDeveloperInstructionV1(instructionInput).errors.map(
    (error) => `drw.${error}`,
  );
  canonicalTimestamp(now, "now", errors);
  const bindingValidation = validateShellSessionBindingV1(bindingInput);
  errors.push(...bindingValidation.errors.map((error) => `shell.${error}`));
  const commandValidation = validateShellCommandEnvelopeV1(commandInput);
  errors.push(...commandValidation.errors.map((error) => `shell.${error}`));
  if (
    errors.length > 0 ||
    !isPlainObject(instructionInput) ||
    !isPlainObject(bindingInput) ||
    !isPlainObject(commandInput)
  ) {
    return validation(errors);
  }

  const shellFence = validateShellCommandAgainstBindingV1(
    commandInput,
    bindingInput,
    now,
  );
  errors.push(...shellFence.errors.map((error) => `shell.${error}`));
  const instruction = instructionInput as unknown as DeveloperInstructionV1;
  const binding = bindingInput as unknown as ShellSessionBindingV1;
  const command = commandInput as unknown as ShellCommandEnvelopeV1;
  if (
    instruction.shellBindingRef.id !== binding.bindingId ||
    instruction.shellBindingRef.version !== binding.bindingVersion
  ) {
    errors.push("drw.instruction.shellBindingRef: canonical binding mismatch");
  }
  if (
    command.bindingId !== binding.bindingId ||
    command.bindingVersion !== binding.bindingVersion
  ) {
    errors.push("shell.command: canonical binding mismatch");
  }
  if (instruction.idempotencyKey !== command.idempotencyKey) {
    errors.push("drw.instruction.idempotencyKey: Shell command mismatch");
  }
  if (instruction.requestDigest.value !== command.requestDigest) {
    errors.push("drw.instruction.requestDigest: Shell command mismatch");
  }
  if (
    instruction.issuedAt !== command.issuedAt ||
    instruction.expiresAt !== command.expiresAt
  ) {
    errors.push(
      "drw.instruction.issuedAt/expiresAt: Shell command window mismatch",
    );
  }
  return validation(errors);
}

const EVENT_BASE_FIELDS = [
  "schemaVersion",
  "contractType",
  "eventRef",
  "streamRef",
  "instructionRef",
  "actionRef",
  "sessionRef",
  "sessionVersion",
  "adapterSessionRef",
  "sequence",
  "previousSequence",
  "cursor",
  "occurredAt",
  "eventDigest",
  "eventType",
] as const;

function eventVariantFields(eventType: unknown): readonly string[] {
  switch (eventType) {
    case "claimed":
      return ["shellCommandJournalRef"];
    case "planning":
      return ["planDataRef"];
    case "awaiting_approval":
      return ["approvalRef", "approvalRequestDigest"];
    case "running":
      return ["executionRef"];
    case "completed":
    case "failed":
    case "cancelled":
    case "unknown_outcome":
    case "unavailable":
      return ["terminalResultRef", "terminalResultDigest"];
    default:
      return [];
  }
}

export function validateDeveloperSessionEventV1(
  input: unknown,
): DeveloperRemoteWorkspaceValidationResultV1 {
  const errors: string[] = [];
  const event = objectValue(input, "event", errors);
  if (!event) return validation(errors);
  exactKeys(
    event,
    [...EVENT_BASE_FIELDS, ...eventVariantFields(event.eventType)],
    [],
    "event",
    errors,
  );
  schema(event, "developer_session_event", "event", errors);
  enumValue(
    event.eventType,
    DEVELOPER_SESSION_EVENT_TYPES_V1,
    "event.eventType",
    errors,
  );
  for (const key of [
    "eventRef",
    "streamRef",
    "instructionRef",
    "actionRef",
    "sessionRef",
    "adapterSessionRef",
  ] as const) {
    opaqueRef(event[key], `event.${key}`, errors);
  }
  positiveInteger(event.sessionVersion, "event.sessionVersion", errors);
  const sequenceValid = positiveInteger(
    event.sequence,
    "event.sequence",
    errors,
  );
  const previousValid = nonNegativeInteger(
    event.previousSequence,
    "event.previousSequence",
    errors,
  );
  if (
    sequenceValid &&
    previousValid &&
    event.previousSequence !== (event.sequence as number) - 1
  ) {
    errors.push("event.previousSequence: must equal sequence - 1");
  }
  const cursor = objectValue(event.cursor, "event.cursor", errors);
  if (cursor) {
    exactKeys(cursor, ["streamRef", "sequence"], [], "event.cursor", errors);
    opaqueRef(cursor.streamRef, "event.cursor.streamRef", errors);
    positiveInteger(cursor.sequence, "event.cursor.sequence", errors);
    if (
      cursor.streamRef !== event.streamRef ||
      cursor.sequence !== event.sequence
    ) {
      errors.push("event.cursor: must bind exact streamRef and sequence");
    }
  }
  canonicalTimestamp(event.occurredAt, "event.occurredAt", errors);
  digestRef(event.eventDigest, "event.eventDigest", errors);

  switch (event.eventType) {
    case "accepted":
      if (event.sequence !== 1 || event.previousSequence !== 0) {
        errors.push("event.accepted: must be the first ordered event");
      }
      break;
    case "claimed":
      strictRecordRef(
        event.shellCommandJournalRef,
        "event.shellCommandJournalRef",
        errors,
        "shell_command_journal_entry",
      );
      break;
    case "planning":
      validateDataRef(event.planDataRef, "event.planDataRef", errors, "plan");
      break;
    case "awaiting_approval":
      opaqueRef(event.approvalRef, "event.approvalRef", errors);
      digestRef(
        event.approvalRequestDigest,
        "event.approvalRequestDigest",
        errors,
      );
      break;
    case "running":
      opaqueRef(event.executionRef, "event.executionRef", errors);
      break;
    case "completed":
    case "failed":
    case "cancelled":
    case "unknown_outcome":
    case "unavailable":
      opaqueRef(event.terminalResultRef, "event.terminalResultRef", errors);
      digestRef(
        event.terminalResultDigest,
        "event.terminalResultDigest",
        errors,
      );
      break;
  }
  return validation(errors);
}

const EVENT_TRANSITIONS: Record<
  DeveloperSessionEventTypeV1,
  readonly DeveloperSessionEventTypeV1[]
> = {
  accepted: ["claimed", "cancelled", "unavailable"],
  claimed: [
    "planning",
    "awaiting_approval",
    "running",
    "failed",
    "cancelled",
    "unknown_outcome",
  ],
  planning: [
    "planning",
    "awaiting_approval",
    "running",
    "failed",
    "cancelled",
    "unknown_outcome",
  ],
  awaiting_approval: [
    "awaiting_approval",
    "running",
    "failed",
    "cancelled",
    "unknown_outcome",
  ],
  running: [
    "planning",
    "awaiting_approval",
    "running",
    "completed",
    "failed",
    "cancelled",
    "unknown_outcome",
  ],
  completed: [],
  failed: [],
  cancelled: [],
  unknown_outcome: [],
  unavailable: [],
};

export function validateDeveloperSessionEventTransitionV1(
  previousInput: unknown,
  nextInput: unknown,
): DeveloperRemoteWorkspaceValidationResultV1 {
  const errors = [
    ...validateDeveloperSessionEventV1(previousInput).errors.map(
      (error) => `previous.${error}`,
    ),
    ...validateDeveloperSessionEventV1(nextInput).errors.map(
      (error) => `next.${error}`,
    ),
  ];
  if (
    errors.length > 0 ||
    !isPlainObject(previousInput) ||
    !isPlainObject(nextInput)
  ) {
    return validation(errors);
  }
  const previous = previousInput as unknown as DeveloperSessionEventV1;
  const next = nextInput as unknown as DeveloperSessionEventV1;
  for (const key of [
    "streamRef",
    "instructionRef",
    "actionRef",
    "sessionRef",
    "sessionVersion",
    "adapterSessionRef",
  ] as const) {
    if (previous[key] !== next[key])
      errors.push(`next.event.${key}: lineage mismatch`);
  }
  if (
    next.sequence !== previous.sequence + 1 ||
    next.previousSequence !== previous.sequence
  ) {
    errors.push("next.event.sequence: must immediately follow previous event");
  }
  if (Date.parse(next.occurredAt) < Date.parse(previous.occurredAt)) {
    errors.push("next.event.occurredAt: cannot move backwards");
  }
  if (!EVENT_TRANSITIONS[previous.eventType].includes(next.eventType)) {
    errors.push(
      `next.event.eventType: invalid transition from ${previous.eventType}`,
    );
  }
  return validation(errors);
}

function validateEstimatedCost(
  value: unknown,
  path: string,
  errors: string[],
): void {
  const cost = objectValue(value, path, errors);
  if (!cost) return;
  if (
    !enumValue(
      cost.status,
      ["not_applicable", "estimated", "unknown"] as const,
      `${path}.status`,
      errors,
    )
  ) {
    for (const key of Object.keys(cost)) {
      if (
        ![
          "status",
          "amountMinor",
          "currency",
          "decimals",
          "reasonCode",
        ].includes(key)
      ) {
        errors.push(`${path}.${key}: unknown field`);
      }
    }
    return;
  }
  if (cost.status === "not_applicable") {
    exactKeys(cost, ["status"], [], path, errors);
  } else if (cost.status === "unknown") {
    exactKeys(cost, ["status", "reasonCode"], [], path, errors);
    reasonCode(cost.reasonCode, `${path}.reasonCode`, errors);
  } else {
    exactKeys(
      cost,
      ["status", "amountMinor", "currency", "decimals"],
      [],
      path,
      errors,
    );
    if (
      typeof cost.amountMinor !== "string" ||
      !/^(0|[1-9][0-9]*)$/.test(cost.amountMinor)
    ) {
      errors.push(`${path}.amountMinor: expected non-negative integer string`);
    }
    if (typeof cost.currency !== "string" || !CURRENCY.test(cost.currency)) {
      errors.push(`${path}.currency: expected upper-case ISO currency code`);
    }
    nonNegativeInteger(cost.decimals, `${path}.decimals`, errors);
  }
}

const APPROVAL_OPERATION_POLICY: Record<
  DeveloperApprovalOperationKindV1,
  {
    risk: readonly DeveloperApprovalRiskV1[];
    sideEffects: readonly DeveloperApprovalSideEffectClassV1[];
  }
> = {
  read_status: { risk: ["L0"], sideEffects: ["none"] },
  read_selected_file: { risk: ["L1"], sideEffects: ["local_read"] },
  run_test: { risk: ["L1"], sideEffects: ["command_execution"] },
  network_read: { risk: ["L1"], sideEffects: ["network_read"] },
  write_file: { risk: ["L2"], sideEffects: ["local_write"] },
  execute_command: { risk: ["L2"], sideEffects: ["command_execution"] },
  install_dependency: { risk: ["L2"], sideEffects: ["command_execution"] },
  external_write: { risk: ["L2", "L3"], sideEffects: ["external_write"] },
  delete: { risk: ["L3"], sideEffects: ["irreversible"] },
  deploy: { risk: ["L3"], sideEffects: ["external_write", "irreversible"] },
  credential_access: { risk: ["L3"], sideEffects: ["irreversible"] },
  permission_change: { risk: ["L3"], sideEffects: ["irreversible"] },
  payment: { risk: ["L3"], sideEffects: ["external_write", "irreversible"] },
};

export function validateDeveloperApprovalRequestV1(
  input: unknown,
): DeveloperRemoteWorkspaceValidationResultV1 {
  const errors: string[] = [];
  const request = objectValue(input, "approvalRequest", errors);
  if (!request) return validation(errors);
  exactKeys(
    request,
    [
      "schemaVersion",
      "contractType",
      "approvalRef",
      "approvalVersion",
      "status",
      "decisionSequence",
      "instructionRef",
      "actionRef",
      "sessionRef",
      "sessionVersion",
      "adapterSessionRef",
      "adapterRequestRef",
      "workspaceRef",
      "operationKind",
      "toolName",
      "toolArgumentsDigest",
      "workspaceScopeDigest",
      "instructionRequestDigest",
      "requestDigest",
      "risk",
      "sideEffectClass",
      "estimatedCost",
      "requestedGrantScopes",
      "requiresLocalConfirmation",
      "userVisibleSummary",
      "redactedArgumentsSummary",
      "issuedAt",
      "expiresAt",
    ],
    [],
    "approvalRequest",
    errors,
  );
  schema(request, "developer_approval_request", "approvalRequest", errors);
  for (const key of [
    "approvalRef",
    "instructionRef",
    "actionRef",
    "sessionRef",
    "adapterSessionRef",
    "adapterRequestRef",
    "workspaceRef",
  ] as const) {
    opaqueRef(request[key], `approvalRequest.${key}`, errors);
  }
  positiveInteger(
    request.approvalVersion,
    "approvalRequest.approvalVersion",
    errors,
  );
  if (request.status !== "pending")
    errors.push("approvalRequest.status: expected pending");
  if (request.decisionSequence !== 0) {
    errors.push("approvalRequest.decisionSequence: pending request must be 0");
  }
  positiveInteger(
    request.sessionVersion,
    "approvalRequest.sessionVersion",
    errors,
  );
  const operationValid = enumValue(
    request.operationKind,
    DEVELOPER_APPROVAL_OPERATION_KINDS_V1,
    "approvalRequest.operationKind",
    errors,
  );
  safeDisplayString(request.toolName, "approvalRequest.toolName", errors, 128);
  for (const key of [
    "toolArgumentsDigest",
    "workspaceScopeDigest",
    "instructionRequestDigest",
    "requestDigest",
  ] as const) {
    digestRef(request[key], `approvalRequest.${key}`, errors);
  }
  const riskValid = enumValue(
    request.risk,
    DEVELOPER_APPROVAL_RISKS_V1,
    "approvalRequest.risk",
    errors,
  );
  const sideEffectValid = enumValue(
    request.sideEffectClass,
    DEVELOPER_APPROVAL_SIDE_EFFECT_CLASSES_V1,
    "approvalRequest.sideEffectClass",
    errors,
  );
  validateEstimatedCost(
    request.estimatedCost,
    "approvalRequest.estimatedCost",
    errors,
  );
  stringArray(
    request.requestedGrantScopes,
    "approvalRequest.requestedGrantScopes",
    errors,
    (entry, path, target) =>
      enumValue(entry, ["once", "session"] as const, path, target),
    false,
  );
  booleanValue(
    request.requiresLocalConfirmation,
    "approvalRequest.requiresLocalConfirmation",
    errors,
  );
  safeDisplayString(
    request.userVisibleSummary,
    "approvalRequest.userVisibleSummary",
    errors,
    280,
  );
  safeDisplayString(
    request.redactedArgumentsSummary,
    "approvalRequest.redactedArgumentsSummary",
    errors,
    280,
  );
  timestampsOrdered(
    request.issuedAt,
    request.expiresAt,
    "approvalRequest.issuedAt",
    "approvalRequest.expiresAt",
    errors,
  );
  if (operationValid && riskValid && sideEffectValid) {
    const policy =
      APPROVAL_OPERATION_POLICY[
        request.operationKind as DeveloperApprovalOperationKindV1
      ];
    if (!policy.risk.includes(request.risk as DeveloperApprovalRiskV1)) {
      errors.push("approvalRequest.risk: does not match operation policy");
    }
    if (
      !policy.sideEffects.includes(
        request.sideEffectClass as DeveloperApprovalSideEffectClassV1,
      )
    ) {
      errors.push(
        "approvalRequest.sideEffectClass: does not match operation policy",
      );
    }
  }
  if (
    request.risk === "L3" &&
    (!Array.isArray(request.requestedGrantScopes) ||
      request.requestedGrantScopes.length !== 1 ||
      request.requestedGrantScopes[0] !== "once")
  ) {
    errors.push("approvalRequest.requestedGrantScopes: L3 only permits once");
  }
  return validation(errors);
}

const DECISION_BASE_FIELDS = [
  "schemaVersion",
  "contractType",
  "decisionRef",
  "approvalRef",
  "approvalVersion",
  "previousStatus",
  "decisionSequence",
  "instructionRef",
  "actionRef",
  "sessionRef",
  "sessionVersion",
  "adapterSessionRef",
  "adapterRequestRef",
  "requestDigest",
  "instructionRequestDigest",
  "toolArgumentsDigest",
  "workspaceScopeDigest",
  "decidedAt",
  "decisionDigest",
  "authorityDecisionRef",
  "decision",
  "resultingStatus",
] as const;

function decisionVariantFields(decision: unknown): {
  required: readonly string[];
  optional: readonly string[];
} {
  switch (decision) {
    case "approved":
      return {
        required: [
          "decidedByRef",
          "grantScope",
          "grantExpiresAt",
          "authorityGrantRef",
        ],
        optional: ["localConfirmationRef"],
      };
    case "rejected":
      return { required: ["decidedByRef", "reasonCode"], optional: [] };
    case "expired":
      return { required: ["reasonCode"], optional: [] };
    case "cancelled":
      return { required: ["cancelledByRef", "reasonCode"], optional: [] };
    case "superseded":
      return {
        required: ["supersedingApprovalRef", "reasonCode"],
        optional: [],
      };
    default:
      return { required: [], optional: [] };
  }
}

export function validateDeveloperApprovalDecisionV1(
  input: unknown,
): DeveloperRemoteWorkspaceValidationResultV1 {
  const errors: string[] = [];
  const decision = objectValue(input, "approvalDecision", errors);
  if (!decision) return validation(errors);
  const fields = decisionVariantFields(decision.decision);
  exactKeys(
    decision,
    [...DECISION_BASE_FIELDS, ...fields.required],
    fields.optional,
    "approvalDecision",
    errors,
  );
  schema(decision, "developer_approval_decision", "approvalDecision", errors);
  for (const key of [
    "decisionRef",
    "approvalRef",
    "instructionRef",
    "actionRef",
    "sessionRef",
    "adapterSessionRef",
    "adapterRequestRef",
  ] as const) {
    opaqueRef(decision[key], `approvalDecision.${key}`, errors);
  }
  positiveInteger(
    decision.approvalVersion,
    "approvalDecision.approvalVersion",
    errors,
  );
  if (decision.previousStatus !== "pending") {
    errors.push(
      "approvalDecision.previousStatus: terminal decisions only transition from pending",
    );
  }
  if (decision.decisionSequence !== 1) {
    errors.push(
      "approvalDecision.decisionSequence: first and only decision must be 1",
    );
  }
  positiveInteger(
    decision.sessionVersion,
    "approvalDecision.sessionVersion",
    errors,
  );
  for (const key of [
    "requestDigest",
    "instructionRequestDigest",
    "toolArgumentsDigest",
    "workspaceScopeDigest",
    "decisionDigest",
  ] as const) {
    digestRef(decision[key], `approvalDecision.${key}`, errors);
  }
  canonicalTimestamp(decision.decidedAt, "approvalDecision.decidedAt", errors);
  strictRecordRef(
    decision.authorityDecisionRef,
    "approvalDecision.authorityDecisionRef",
    errors,
    "authority_decision",
    true,
    true,
  );
  const decisionValid = enumValue(
    decision.decision,
    DEVELOPER_APPROVAL_TERMINAL_DECISIONS_V1,
    "approvalDecision.decision",
    errors,
  );
  if (decisionValid && decision.resultingStatus !== decision.decision) {
    errors.push(
      "approvalDecision.resultingStatus: must equal terminal decision",
    );
  }

  switch (decision.decision) {
    case "approved":
      opaqueRef(decision.decidedByRef, "approvalDecision.decidedByRef", errors);
      enumValue(
        decision.grantScope,
        ["once", "session"] as const,
        "approvalDecision.grantScope",
        errors,
      );
      canonicalTimestamp(
        decision.grantExpiresAt,
        "approvalDecision.grantExpiresAt",
        errors,
      );
      strictRecordRef(
        decision.authorityGrantRef,
        "approvalDecision.authorityGrantRef",
        errors,
        "authority_grant",
        true,
        true,
      );
      if (decision.localConfirmationRef !== undefined) {
        opaqueRef(
          decision.localConfirmationRef,
          "approvalDecision.localConfirmationRef",
          errors,
        );
      }
      break;
    case "rejected":
      opaqueRef(decision.decidedByRef, "approvalDecision.decidedByRef", errors);
      reasonCode(decision.reasonCode, "approvalDecision.reasonCode", errors);
      break;
    case "expired":
      if (decision.reasonCode !== "request_expired") {
        errors.push(
          "approvalDecision.reasonCode: expired decision requires request_expired",
        );
      }
      break;
    case "cancelled":
      opaqueRef(
        decision.cancelledByRef,
        "approvalDecision.cancelledByRef",
        errors,
      );
      reasonCode(decision.reasonCode, "approvalDecision.reasonCode", errors);
      break;
    case "superseded":
      opaqueRef(
        decision.supersedingApprovalRef,
        "approvalDecision.supersedingApprovalRef",
        errors,
      );
      reasonCode(decision.reasonCode, "approvalDecision.reasonCode", errors);
      if (decision.supersedingApprovalRef === decision.approvalRef) {
        errors.push(
          "approvalDecision.supersedingApprovalRef: must identify a different approval",
        );
      }
      break;
  }
  return validation(errors);
}

export function validateDeveloperApprovalDecisionAgainstRequestV1(
  decisionInput: unknown,
  requestInput: unknown,
): DeveloperRemoteWorkspaceValidationResultV1 {
  const errors = [
    ...validateDeveloperApprovalDecisionV1(decisionInput).errors.map(
      (error) => `decision.${error}`,
    ),
    ...validateDeveloperApprovalRequestV1(requestInput).errors.map(
      (error) => `request.${error}`,
    ),
  ];
  if (
    errors.length > 0 ||
    !isPlainObject(decisionInput) ||
    !isPlainObject(requestInput)
  ) {
    return validation(errors);
  }
  const decision = decisionInput as unknown as DeveloperApprovalDecisionV1;
  const request = requestInput as unknown as DeveloperApprovalRequestV1;
  for (const key of [
    "approvalRef",
    "approvalVersion",
    "instructionRef",
    "actionRef",
    "sessionRef",
    "sessionVersion",
    "adapterSessionRef",
    "adapterRequestRef",
  ] as const) {
    if (decision[key] !== request[key]) {
      errors.push(`decision.approvalDecision.${key}: request binding mismatch`);
    }
  }
  for (const key of [
    "requestDigest",
    "instructionRequestDigest",
    "toolArgumentsDigest",
    "workspaceScopeDigest",
  ] as const) {
    if (!digestRefsEqual(decision[key], request[key])) {
      errors.push(`decision.approvalDecision.${key}: exact digest mismatch`);
    }
  }
  const decidedAt = Date.parse(decision.decidedAt);
  const issuedAt = Date.parse(request.issuedAt);
  const expiresAt = Date.parse(request.expiresAt);
  if (decidedAt < issuedAt) {
    errors.push("decision.approvalDecision.decidedAt: predates request");
  }
  if (decision.decision === "expired") {
    if (decidedAt < expiresAt) {
      errors.push(
        "decision.approvalDecision.decidedAt: expiry cannot be early",
      );
    }
  } else if (decidedAt >= expiresAt) {
    errors.push(
      "decision.approvalDecision.decidedAt: stale request is terminally expired",
    );
  }
  if (decision.decision === "approved") {
    const grantExpiry = Date.parse(decision.grantExpiresAt);
    if (grantExpiry <= decidedAt || grantExpiry > expiresAt) {
      errors.push(
        "decision.approvalDecision.grantExpiresAt: must be after decision and within request",
      );
    }
    if (!request.requestedGrantScopes.includes(decision.grantScope)) {
      errors.push(
        "decision.approvalDecision.grantScope: scope was not requested",
      );
    }
    if (request.risk === "L3" && decision.grantScope !== "once") {
      errors.push("decision.approvalDecision.grantScope: L3 only permits once");
    }
    if (
      request.requiresLocalConfirmation &&
      decision.localConfirmationRef === undefined
    ) {
      errors.push(
        "decision.approvalDecision.localConfirmationRef: required by request",
      );
    }
  }
  return validation(errors);
}

function wireEqual(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true;
  if (Array.isArray(left) && Array.isArray(right)) {
    return (
      left.length === right.length &&
      left.every((entry, index) => wireEqual(entry, right[index]))
    );
  }
  if (isPlainObject(left) && isPlainObject(right)) {
    const leftKeys = Object.keys(left).sort();
    const rightKeys = Object.keys(right).sort();
    return (
      leftKeys.length === rightKeys.length &&
      leftKeys.every(
        (key, index) =>
          key === rightKeys[index] && wireEqual(left[key], right[key]),
      )
    );
  }
  return false;
}

/**
 * A terminal approval may be observed repeatedly, but never rewritten. Exact
 * replay is idempotent; any different terminal shape is a conflict.
 */
export function evaluateDeveloperApprovalDecisionReplayV1(
  existing: DeveloperApprovalDecisionV1,
  incoming: DeveloperApprovalDecisionV1,
): "idempotent" | "conflict" {
  return wireEqual(existing, incoming) ? "idempotent" : "conflict";
}

const TERMINAL_BASE_FIELDS = [
  "schemaVersion",
  "contractType",
  "terminalResultRef",
  "instructionRef",
  "actionRef",
  "sessionRef",
  "sessionVersion",
  "adapterSessionRef",
  "requestDigest",
  "eventSequence",
  "recordedAt",
  "terminalDigest",
  "status",
] as const;

function terminalVariantFields(status: unknown): {
  required: readonly string[];
  optional: readonly string[];
} {
  switch (status) {
    case "completed":
      return {
        required: [
          "shellBindingRef",
          "shellCommandJournalRef",
          "startedAt",
          "completedAt",
          "adapterTerminalEvidenceRef",
          "outcomeRef",
          "actionReceiptRef",
          "canonicalReadBack",
        ],
        optional: ["resultDataRef"],
      };
    case "failed":
      return {
        required: [
          "shellBindingRef",
          "shellCommandJournalRef",
          "startedAt",
          "completedAt",
          "failureCode",
          "adapterTerminalEvidenceRef",
          "outcomeRef",
          "canonicalReadBack",
        ],
        optional: ["resultDataRef"],
      };
    case "cancelled":
      return {
        required: [
          "shellBindingRef",
          "shellCommandJournalRef",
          "startedAt",
          "completedAt",
          "cancellationRef",
          "adapterTerminalEvidenceRef",
          "outcomeRef",
          "canonicalReadBack",
        ],
        optional: [],
      };
    case "unknown_outcome":
      return {
        required: [
          "shellBindingRef",
          "shellCommandJournalRef",
          "unknownSince",
          "reconciliationRef",
          "queryOnly",
          "replayAllowed",
        ],
        optional: [],
      };
    case "unavailable":
      return { required: ["reasonCode", "executionStarted"], optional: [] };
    default:
      return { required: [], optional: [] };
  }
}

export function validateDeveloperTerminalResultV1(
  input: unknown,
): DeveloperRemoteWorkspaceValidationResultV1 {
  const errors: string[] = [];
  const result = objectValue(input, "terminalResult", errors);
  if (!result) return validation(errors);
  const fields = terminalVariantFields(result.status);
  exactKeys(
    result,
    [...TERMINAL_BASE_FIELDS, ...fields.required],
    fields.optional,
    "terminalResult",
    errors,
  );
  schema(result, "developer_terminal_result", "terminalResult", errors);
  for (const key of [
    "terminalResultRef",
    "instructionRef",
    "actionRef",
    "sessionRef",
    "adapterSessionRef",
  ] as const) {
    opaqueRef(result[key], `terminalResult.${key}`, errors);
  }
  positiveInteger(
    result.sessionVersion,
    "terminalResult.sessionVersion",
    errors,
  );
  digestRef(result.requestDigest, "terminalResult.requestDigest", errors);
  positiveInteger(result.eventSequence, "terminalResult.eventSequence", errors);
  canonicalTimestamp(result.recordedAt, "terminalResult.recordedAt", errors);
  digestRef(result.terminalDigest, "terminalResult.terminalDigest", errors);
  enumValue(
    result.status,
    DEVELOPER_TERMINAL_STATUSES_V1,
    "terminalResult.status",
    errors,
  );

  if (result.status === "unavailable") {
    reasonCode(result.reasonCode, "terminalResult.reasonCode", errors);
    if (result.executionStarted !== false) {
      errors.push(
        "terminalResult.executionStarted: unavailable requires false",
      );
    }
    return validation(errors);
  }

  if (
    result.status === "completed" ||
    result.status === "failed" ||
    result.status === "cancelled" ||
    result.status === "unknown_outcome"
  ) {
    strictRecordRef(
      result.shellBindingRef,
      "terminalResult.shellBindingRef",
      errors,
      "shell_session_binding",
    );
    strictRecordRef(
      result.shellCommandJournalRef,
      "terminalResult.shellCommandJournalRef",
      errors,
      "shell_command_journal_entry",
    );
  }

  if (result.status === "unknown_outcome") {
    timestampsOrdered(
      result.unknownSince,
      result.recordedAt,
      "terminalResult.unknownSince",
      "terminalResult.recordedAt",
      errors,
      true,
    );
    strictRecordRef(
      result.reconciliationRef,
      "terminalResult.reconciliationRef",
      errors,
      "downstream_idempotency",
      true,
      true,
    );
    if (result.queryOnly !== true) {
      errors.push(
        "terminalResult.queryOnly: unknown outcome must be query-only",
      );
    }
    if (result.replayAllowed !== false) {
      errors.push("terminalResult.replayAllowed: blind replay is forbidden");
    }
    return validation(errors);
  }

  if (
    result.status === "completed" ||
    result.status === "failed" ||
    result.status === "cancelled"
  ) {
    timestampsOrdered(
      result.startedAt,
      result.completedAt,
      "terminalResult.startedAt",
      "terminalResult.completedAt",
      errors,
      true,
    );
    timestampsOrdered(
      result.completedAt,
      result.recordedAt,
      "terminalResult.completedAt",
      "terminalResult.recordedAt",
      errors,
      true,
    );
    strictRecordRef(
      result.adapterTerminalEvidenceRef,
      "terminalResult.adapterTerminalEvidenceRef",
      errors,
      "evidence",
      true,
      true,
    );
    strictRecordRef(
      result.outcomeRef,
      "terminalResult.outcomeRef",
      errors,
      "outcome_record",
      true,
      true,
    );
    if (result.canonicalReadBack !== true) {
      errors.push(
        "terminalResult.canonicalReadBack: terminal claim requires authoritative read-back",
      );
    }
  }
  if (result.status === "completed") {
    strictRecordRef(
      result.actionReceiptRef,
      "terminalResult.actionReceiptRef",
      errors,
      "action_receipt",
      true,
      true,
    );
  }
  if (result.status === "failed") {
    reasonCode(result.failureCode, "terminalResult.failureCode", errors);
  }
  if (result.status === "cancelled") {
    opaqueRef(result.cancellationRef, "terminalResult.cancellationRef", errors);
  }
  if (
    (result.status === "completed" || result.status === "failed") &&
    result.resultDataRef !== undefined
  ) {
    validateDataRef(
      result.resultDataRef,
      "terminalResult.resultDataRef",
      errors,
      "terminal_result",
    );
    if (
      isPlainObject(result.resultDataRef) &&
      canonicalTimestamp(
        result.resultDataRef.expiresAt,
        "terminalResult.resultDataRef.expiresAt",
        [],
      ) &&
      canonicalTimestamp(result.recordedAt, "terminalResult.recordedAt", []) &&
      Date.parse(result.resultDataRef.expiresAt as string) <=
        Date.parse(result.recordedAt as string)
    ) {
      errors.push(
        "terminalResult.resultDataRef.expiresAt: must be after recordedAt",
      );
    }
  }
  return validation(errors);
}

export function validateDeveloperTerminalResultAgainstEventV1(
  resultInput: unknown,
  eventInput: unknown,
): DeveloperRemoteWorkspaceValidationResultV1 {
  const errors = [
    ...validateDeveloperTerminalResultV1(resultInput).errors.map(
      (error) => `result.${error}`,
    ),
    ...validateDeveloperSessionEventV1(eventInput).errors.map(
      (error) => `event.${error}`,
    ),
  ];
  if (
    errors.length > 0 ||
    !isPlainObject(resultInput) ||
    !isPlainObject(eventInput)
  ) {
    return validation(errors);
  }
  const result = resultInput as unknown as DeveloperTerminalResultV1;
  const event = eventInput as unknown as DeveloperSessionEventV1;
  if (
    !DEVELOPER_TERMINAL_STATUSES_V1.includes(
      event.eventType as DeveloperTerminalStatusV1,
    )
  ) {
    errors.push("event.event.eventType: terminal event required");
    return validation(errors);
  }
  for (const key of [
    "instructionRef",
    "actionRef",
    "sessionRef",
    "sessionVersion",
    "adapterSessionRef",
  ] as const) {
    if (result[key] !== event[key])
      errors.push(`event.event.${key}: terminal result mismatch`);
  }
  if (result.status !== event.eventType) {
    errors.push("event.event.eventType: terminal status mismatch");
  }
  if (result.eventSequence !== event.sequence) {
    errors.push("event.event.sequence: terminal sequence mismatch");
  }
  if (
    !("terminalResultRef" in event) ||
    event.terminalResultRef !== result.terminalResultRef ||
    !digestRefsEqual(event.terminalResultDigest, result.terminalDigest)
  ) {
    errors.push(
      "event.event.terminalResultRef: exact terminal binding mismatch",
    );
  }
  return validation(errors);
}

function validateHandoffTarget(
  value: unknown,
  path: string,
  errors: string[],
): void {
  const target = objectValue(value, path, errors);
  if (!target) return;
  if (
    !enumValue(
      target.kind,
      ["session", "approval", "terminal_result"] as const,
      `${path}.kind`,
      errors,
    )
  ) {
    for (const key of Object.keys(target)) {
      if (
        ![
          "kind",
          "approvalRef",
          "approvalRequestDigest",
          "terminalResultRef",
          "terminalResultDigest",
        ].includes(key)
      ) {
        errors.push(`${path}.${key}: unknown field`);
      }
    }
    return;
  }
  if (target.kind === "session") {
    exactKeys(target, ["kind"], [], path, errors);
  } else if (target.kind === "approval") {
    exactKeys(
      target,
      ["kind", "approvalRef", "approvalRequestDigest"],
      [],
      path,
      errors,
    );
    opaqueRef(target.approvalRef, `${path}.approvalRef`, errors);
    digestRef(
      target.approvalRequestDigest,
      `${path}.approvalRequestDigest`,
      errors,
    );
  } else {
    exactKeys(
      target,
      ["kind", "terminalResultRef", "terminalResultDigest"],
      [],
      path,
      errors,
    );
    opaqueRef(target.terminalResultRef, `${path}.terminalResultRef`, errors);
    digestRef(
      target.terminalResultDigest,
      `${path}.terminalResultDigest`,
      errors,
    );
  }
}

const HANDOFF_BASE_FIELDS = [
  "schemaVersion",
  "contractType",
  "handoffRef",
  "handoffVersion",
  "ownerPrincipalRef",
  "agentId",
  "machineRef",
  "deviceRef",
  "runtimeRef",
  "sessionRef",
  "sessionVersion",
  "adapterSessionRef",
  "fromSurface",
  "toSurface",
  "target",
  "oneTime",
  "issuedAt",
  "expiresAt",
  "handoffDigest",
  "status",
] as const;

function handoffVariantFields(status: unknown): readonly string[] {
  switch (status) {
    case "consumed":
      return ["consumedAt", "consumerSessionRef", "consumptionReceiptRef"];
    case "expired":
      return ["expiredAt"];
    case "revoked":
      return ["revokedAt", "revocationRef"];
    default:
      return [];
  }
}

export function validateDeveloperHandoffV1(
  input: unknown,
): DeveloperRemoteWorkspaceValidationResultV1 {
  const errors: string[] = [];
  const handoff = objectValue(input, "handoff", errors);
  if (!handoff) return validation(errors);
  exactKeys(
    handoff,
    [...HANDOFF_BASE_FIELDS, ...handoffVariantFields(handoff.status)],
    [],
    "handoff",
    errors,
  );
  schema(handoff, "developer_handoff", "handoff", errors);
  for (const key of [
    "handoffRef",
    "ownerPrincipalRef",
    "agentId",
    "machineRef",
    "deviceRef",
    "sessionRef",
    "adapterSessionRef",
  ] as const) {
    opaqueRef(handoff[key], `handoff.${key}`, errors);
  }
  positiveInteger(handoff.handoffVersion, "handoff.handoffVersion", errors);
  strictRecordRef(handoff.runtimeRef, "handoff.runtimeRef", errors, "runtime");
  positiveInteger(handoff.sessionVersion, "handoff.sessionVersion", errors);
  enumValue(
    handoff.fromSurface,
    DEVELOPER_SURFACES_V1,
    "handoff.fromSurface",
    errors,
  );
  enumValue(
    handoff.toSurface,
    DEVELOPER_SURFACES_V1,
    "handoff.toSurface",
    errors,
  );
  if (handoff.fromSurface === handoff.toSurface) {
    errors.push("handoff.toSurface: must differ from fromSurface");
  }
  validateHandoffTarget(handoff.target, "handoff.target", errors);
  if (handoff.oneTime !== true) errors.push("handoff.oneTime: must be true");
  timestampsOrdered(
    handoff.issuedAt,
    handoff.expiresAt,
    "handoff.issuedAt",
    "handoff.expiresAt",
    errors,
  );
  digestRef(handoff.handoffDigest, "handoff.handoffDigest", errors);
  enumValue(
    handoff.status,
    ["issued", "consumed", "expired", "revoked"] as const,
    "handoff.status",
    errors,
  );

  if (handoff.status === "consumed") {
    timestampsOrdered(
      handoff.issuedAt,
      handoff.consumedAt,
      "handoff.issuedAt",
      "handoff.consumedAt",
      errors,
      true,
    );
    if (
      canonicalTimestamp(handoff.consumedAt, "handoff.consumedAt", []) &&
      canonicalTimestamp(handoff.expiresAt, "handoff.expiresAt", []) &&
      Date.parse(handoff.consumedAt as string) >=
        Date.parse(handoff.expiresAt as string)
    ) {
      errors.push("handoff.consumedAt: expired handoff cannot be consumed");
    }
    opaqueRef(handoff.consumerSessionRef, "handoff.consumerSessionRef", errors);
    strictRecordRef(
      handoff.consumptionReceiptRef,
      "handoff.consumptionReceiptRef",
      errors,
      "evidence",
      true,
      true,
    );
  } else if (handoff.status === "expired") {
    canonicalTimestamp(handoff.expiredAt, "handoff.expiredAt", errors);
    if (
      canonicalTimestamp(handoff.expiredAt, "handoff.expiredAt", []) &&
      canonicalTimestamp(handoff.expiresAt, "handoff.expiresAt", []) &&
      Date.parse(handoff.expiredAt as string) <
        Date.parse(handoff.expiresAt as string)
    ) {
      errors.push("handoff.expiredAt: cannot precede expiresAt");
    }
  } else if (handoff.status === "revoked") {
    timestampsOrdered(
      handoff.issuedAt,
      handoff.revokedAt,
      "handoff.issuedAt",
      "handoff.revokedAt",
      errors,
      true,
    );
    strictRecordRef(
      handoff.revocationRef,
      "handoff.revocationRef",
      errors,
      "evidence",
      true,
      true,
    );
  }
  return validation(errors);
}

export function validateDeveloperRemoteWorkspaceContractV1(
  input: unknown,
): DeveloperRemoteWorkspaceValidationResultV1 {
  if (!isPlainObject(input))
    return validation(["contract: expected plain object"]);
  switch (input.contractType) {
    case "developer_adapter_capability":
      return validateDeveloperAdapterCapabilityV1(input);
    case "developer_machine_projection":
      return validateDeveloperMachineProjectionV1(input);
    case "developer_workspace_ref":
      return validateDeveloperWorkspaceRefV1(input);
    case "developer_session_summary":
      return validateDeveloperSessionSummaryV1(input);
    case "developer_instruction":
      return validateDeveloperInstructionV1(input);
    case "developer_session_event":
      return validateDeveloperSessionEventV1(input);
    case "developer_approval_request":
      return validateDeveloperApprovalRequestV1(input);
    case "developer_approval_decision":
      return validateDeveloperApprovalDecisionV1(input);
    case "developer_terminal_result":
      return validateDeveloperTerminalResultV1(input);
    case "developer_handoff":
      return validateDeveloperHandoffV1(input);
    default:
      return validation([
        `contract.contractType: unsupported contract ${JSON.stringify(input.contractType)}`,
      ]);
  }
}

export function assertDeveloperRemoteWorkspaceContractV1(
  input: unknown,
): asserts input is DeveloperRemoteWorkspaceContractV1 {
  const result = validateDeveloperRemoteWorkspaceContractV1(input);
  if (!result.valid)
    throw new DeveloperRemoteWorkspaceContractValidationError(result.errors);
}
