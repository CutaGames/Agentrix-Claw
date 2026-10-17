import {
  DEVELOPER_REMOTE_WORKSPACE_CANONICALIZATION,
  DEVELOPER_REMOTE_WORKSPACE_SCHEMA_VERSION,
  validateDeveloperAdapterCapabilityV1,
  validateDeveloperApprovalRequestV1,
  validateDeveloperMachineProjectionV1,
  validateDeveloperRemoteWorkspaceContractV1,
  validateDeveloperSessionSummaryV1,
  validateDeveloperTerminalResultV1,
  validateDeveloperWorkspaceRefV1,
} from "../../shared/types/developer-remote-workspace";

export const DEVELOPER_WORKSPACE_API_BASE = "/v1/developer";
export const DEVELOPER_WORKSPACE_FIXTURE_AGENT_ID = "agent-1";
export const DEVELOPER_WORKSPACE_FIXTURE_CAPTURED_AT =
  "2026-08-22T10:01:00.000Z";

const T0 = "2026-08-22T10:00:00.000Z";
const T1 = DEVELOPER_WORKSPACE_FIXTURE_CAPTURED_AT;
const T5 = "2026-08-22T10:05:00.000Z";
const T9 = "2026-08-22T10:09:00.000Z";

function digest(character: string) {
  return {
    algorithm: "sha-256" as const,
    canonicalization: DEVELOPER_REMOTE_WORKSPACE_CANONICALIZATION,
    value: character.repeat(64),
  };
}

const DIGEST_A = digest("a");
const DIGEST_B = digest("b");
const DIGEST_C = digest("c");
const DIGEST_D = digest("d");
const DIGEST_E = digest("e");
const DIGEST_F = digest("f");

const RUNTIME_REF = {
  type: "runtime" as const,
  id: "runtime-1",
  version: 1,
};

const SHELL_BINDING_REF = {
  type: "shell_session_binding" as const,
  id: "binding-1",
  version: 1,
};

export const DEVELOPER_WORKSPACE_FIXTURE_META = Object.freeze({
  source: "fixture" as const,
  fixture: true as const,
  defaultOff: true as const,
  capturedAt: DEVELOPER_WORKSPACE_FIXTURE_CAPTURED_AT,
  mutationCapabilityPublished: false as const,
  apiBase: DEVELOPER_WORKSPACE_API_BASE,
  agentId: DEVELOPER_WORKSPACE_FIXTURE_AGENT_ID,
});

const FALSE_SESSION_CAPABILITIES = {
  list: false,
  create: false,
  resume: false,
  prompt: false,
  streamEvents: false,
  cancel: false,
  terminalQuery: false,
};

const FALSE_APPROVAL_CAPABILITIES = {
  permissionRequests: false,
  exactDigestDecision: false,
  canonicalAuthorityBridge: false,
};

const FALSE_WORKSPACE_CAPABILITIES = {
  explicitSelection: false,
  trustGate: false,
  redactedMetadataOnly: false,
};

export const DEVELOPER_WORKSPACE_UNSUPPORTED_CAPABILITY = Object.freeze({
  schemaVersion: DEVELOPER_REMOTE_WORKSPACE_SCHEMA_VERSION,
  contractType: "developer_adapter_capability" as const,
  manifestRef: "manifest-unsupported-1",
  manifestVersion: 1,
  adapterRef: "adapter-unsupported-1",
  providerRef: "provider-unsupported-1",
  providerDisplayName: "Unsupported Provider",
  productRef: "product-unsupported-1",
  productDisplayName: "Legacy Desktop Control",
  protocol: {
    kind: "unsupported" as const,
    protocolName: "none" as const,
  },
  certification: {
    status: "unsupported" as const,
    reasonCode: "no_official_protocol",
    reviewedAt: T0,
  },
  sessionCapabilities: FALSE_SESSION_CAPABILITIES,
  approvalCapabilities: FALSE_APPROVAL_CAPABILITIES,
  workspaceCapabilities: FALSE_WORKSPACE_CAPABILITIES,
  platforms: ["windows"],
  authPlacement: "not_applicable" as const,
  freshness: {
    observedAt: T1,
    validUntil: T9,
    sequence: 1,
  },
  limitations: ["not_a_developer_adapter", "owner_only_v1"],
});

export const DEVELOPER_WORKSPACE_SUPPORTED_CAPABILITY = Object.freeze({
  schemaVersion: DEVELOPER_REMOTE_WORKSPACE_SCHEMA_VERSION,
  contractType: "developer_adapter_capability" as const,
  manifestRef: "manifest-1",
  manifestVersion: 1,
  adapterRef: "adapter-1",
  providerRef: "provider-1",
  providerDisplayName: "Example Provider",
  productRef: "product-1",
  productDisplayName: "Structured Agent",
  protocol: {
    kind: "acp" as const,
    protocolName: "agent_client_protocol" as const,
    protocolVersion: "1.0",
    transport: "stdio" as const,
  },
  certification: {
    status: "supported" as const,
    officialCapabilityReviewRef: {
      type: "evidence" as const,
      id: "capability-review-1",
      version: 1,
      digest: DIGEST_F,
    },
    termsReviewRef: {
      type: "terms" as const,
      id: "terms-review-1",
      version: 1,
      digest: DIGEST_F,
    },
    reviewedAt: T0,
  },
  sessionCapabilities: {
    list: true,
    create: true,
    resume: true,
    prompt: true,
    streamEvents: true,
    cancel: true,
    terminalQuery: true,
  },
  approvalCapabilities: {
    permissionRequests: true,
    exactDigestDecision: true,
    canonicalAuthorityBridge: true,
  },
  workspaceCapabilities: {
    explicitSelection: true,
    trustGate: true,
    redactedMetadataOnly: true,
  },
  platforms: ["linux", "macos", "windows"],
  authPlacement: "desktop_secure_storage" as const,
  freshness: {
    observedAt: T1,
    validUntil: T9,
    sequence: 1,
  },
  limitations: ["owner_only_v1"],
});

function machineBase(machineRef: string) {
  return {
    schemaVersion: DEVELOPER_REMOTE_WORKSPACE_SCHEMA_VERSION,
    contractType: "developer_machine_projection" as const,
    machineRef,
    ownerPrincipalRef: "principal-1",
    agentId: DEVELOPER_WORKSPACE_FIXTURE_AGENT_ID,
    deviceRef: "device-1",
    runtimeRef: RUNTIME_REF,
    adapterManifestRef: DEVELOPER_WORKSPACE_SUPPORTED_CAPABILITY.manifestRef,
    adapterManifestVersion:
      DEVELOPER_WORKSPACE_SUPPORTED_CAPABILITY.manifestVersion,
    displayLabel: "Home workstation",
    platform: "windows" as const,
    axes: {
      presence: "present" as const,
      process: "running" as const,
      cli: "installed" as const,
      ide: "open" as const,
      workspaceTrust: "trusted" as const,
      sessionResumability: "supported" as const,
      permissionBridge: "available" as const,
    },
    projectionSequence: 4,
    capturedAt: T1,
  };
}

export const DEVELOPER_WORKSPACE_ONLINE_MACHINE = Object.freeze({
  ...machineBase("machine-1"),
  displayLabel: "Home workstation",
  connection: {
    status: "online" as const,
    observedAt: T1,
    validUntil: T5,
  },
  shellBindingRef: SHELL_BINDING_REF,
});

export const DEVELOPER_WORKSPACE_OFFLINE_MACHINE = Object.freeze({
  ...machineBase("machine-offline-1"),
  displayLabel: "Offline laptop",
  axes: {
    ...machineBase("machine-offline-1").axes,
    presence: "absent" as const,
    process: "stopped" as const,
  },
  connection: {
    status: "offline" as const,
    observedAt: T1,
    reasonCode: "runtime_disconnected",
  },
});

export const DEVELOPER_WORKSPACE_STALE_MACHINE = Object.freeze({
  ...machineBase("machine-stale-1"),
  displayLabel: "Stale desktop",
  connection: {
    status: "stale" as const,
    observedAt: T1,
    staleSince: T0,
    reasonCode: "capability_heartbeat_expired",
  },
});

export const DEVELOPER_WORKSPACE_WORKSPACE = Object.freeze({
  schemaVersion: DEVELOPER_REMOTE_WORKSPACE_SCHEMA_VERSION,
  contractType: "developer_workspace_ref" as const,
  workspaceRef: "workspace-1",
  workspaceVersion: 3,
  machineRef: DEVELOPER_WORKSPACE_ONLINE_MACHINE.machineRef,
  deviceRef: DEVELOPER_WORKSPACE_ONLINE_MACHINE.deviceRef,
  runtimeRef: RUNTIME_REF,
  scope: "repository" as const,
  displayLabel: "Agentrix website",
  repositoryHint: {
    repositoryLabel: "Agentrix website",
    branchLabel: "feature-remote-workspace",
  },
  workspaceDigest: DIGEST_A,
  trust: {
    status: "trusted" as const,
    trustRef: {
      type: "evidence" as const,
      id: "workspace-trust-1",
      version: 1,
      digest: DIGEST_F,
    },
    trustedAt: T0,
  },
  observedAt: T1,
});

function sessionBase(sessionRef: string, adapterSessionRef: string) {
  return {
    schemaVersion: DEVELOPER_REMOTE_WORKSPACE_SCHEMA_VERSION,
    contractType: "developer_session_summary" as const,
    sessionRef,
    adapterSessionRef,
    agentId: DEVELOPER_WORKSPACE_FIXTURE_AGENT_ID,
    machineRef: DEVELOPER_WORKSPACE_ONLINE_MACHINE.machineRef,
    deviceRef: DEVELOPER_WORKSPACE_ONLINE_MACHINE.deviceRef,
    runtimeRef: RUNTIME_REF,
    workspaceRef: DEVELOPER_WORKSPACE_WORKSPACE.workspaceRef,
    adapterManifestRef: DEVELOPER_WORKSPACE_SUPPORTED_CAPABILITY.manifestRef,
    adapterManifestVersion:
      DEVELOPER_WORKSPACE_SUPPORTED_CAPABILITY.manifestVersion,
    sessionVersion: 7,
    capabilities: {
      canResume: true,
      canPrompt: true,
      canCancel: true,
      canQueryTerminal: true,
    },
    projectionSequence: 11,
    lastActivityAt: T0,
    observedAt: T1,
  };
}

export const DEVELOPER_WORKSPACE_READY_SESSION = Object.freeze({
  ...sessionBase("session-1", "adapter-session-1"),
  state: "ready" as const,
});

export const DEVELOPER_WORKSPACE_UNAVAILABLE_SESSION = Object.freeze({
  ...sessionBase("session-unavailable-1", "adapter-session-unavailable-1"),
  capabilities: {
    canResume: false,
    canPrompt: false,
    canCancel: false,
    canQueryTerminal: false,
  },
  state: "unavailable" as const,
  reasonCode: "adapter_session_not_resumable",
});

export const DEVELOPER_WORKSPACE_PENDING_APPROVAL = Object.freeze({
  schemaVersion: DEVELOPER_REMOTE_WORKSPACE_SCHEMA_VERSION,
  contractType: "developer_approval_request" as const,
  approvalRef: "approval-1",
  approvalVersion: 1,
  status: "pending" as const,
  decisionSequence: 0,
  instructionRef: "instruction-1",
  actionRef: "action-1",
  sessionRef: DEVELOPER_WORKSPACE_READY_SESSION.sessionRef,
  sessionVersion: DEVELOPER_WORKSPACE_READY_SESSION.sessionVersion,
  adapterSessionRef: DEVELOPER_WORKSPACE_READY_SESSION.adapterSessionRef,
  adapterRequestRef: "adapter-request-1",
  workspaceRef: DEVELOPER_WORKSPACE_WORKSPACE.workspaceRef,
  operationKind: "run_test" as const,
  toolName: "test_runner",
  toolArgumentsDigest: DIGEST_B,
  workspaceScopeDigest: DIGEST_C,
  instructionRequestDigest: DIGEST_A,
  requestDigest: DIGEST_D,
  risk: "L1" as const,
  sideEffectClass: "command_execution" as const,
  estimatedCost: { status: "not_applicable" as const },
  requestedGrantScopes: ["once", "session"] as Array<"once" | "session">,
  requiresLocalConfirmation: false,
  userVisibleSummary: "Run the selected test command",
  redactedArgumentsSummary: "Selected test target; arguments redacted",
  issuedAt: T1,
  expiresAt: T5,
});

export const DEVELOPER_WORKSPACE_UNAVAILABLE_TERMINAL = Object.freeze({
  schemaVersion: DEVELOPER_REMOTE_WORKSPACE_SCHEMA_VERSION,
  contractType: "developer_terminal_result" as const,
  terminalResultRef: "terminal-unavailable-1",
  instructionRef: "instruction-1",
  actionRef: "action-1",
  sessionRef: DEVELOPER_WORKSPACE_READY_SESSION.sessionRef,
  sessionVersion: DEVELOPER_WORKSPACE_READY_SESSION.sessionVersion,
  adapterSessionRef: DEVELOPER_WORKSPACE_READY_SESSION.adapterSessionRef,
  requestDigest: DIGEST_A,
  eventSequence: 1,
  recordedAt: T1,
  terminalDigest: DIGEST_E,
  status: "unavailable" as const,
  reasonCode: "canonical_receipt_not_published",
  executionStarted: false,
});

export const DEVELOPER_WORKSPACE_CONTRACT_FIXTURES = Object.freeze({
  unsupportedCapability: DEVELOPER_WORKSPACE_UNSUPPORTED_CAPABILITY,
  supportedCapability: DEVELOPER_WORKSPACE_SUPPORTED_CAPABILITY,
  onlineMachine: DEVELOPER_WORKSPACE_ONLINE_MACHINE,
  offlineMachine: DEVELOPER_WORKSPACE_OFFLINE_MACHINE,
  staleMachine: DEVELOPER_WORKSPACE_STALE_MACHINE,
  workspace: DEVELOPER_WORKSPACE_WORKSPACE,
  readySession: DEVELOPER_WORKSPACE_READY_SESSION,
  unavailableSession: DEVELOPER_WORKSPACE_UNAVAILABLE_SESSION,
  pendingApproval: DEVELOPER_WORKSPACE_PENDING_APPROVAL,
  unavailableTerminal: DEVELOPER_WORKSPACE_UNAVAILABLE_TERMINAL,
});

export const DEVELOPER_WORKSPACE_FIXTURE_WIRE = JSON.stringify({
  meta: DEVELOPER_WORKSPACE_FIXTURE_META,
  contracts: DEVELOPER_WORKSPACE_CONTRACT_FIXTURES,
});

export const DEVELOPER_WORKSPACE_FIXTURE_WIRE_FINGERPRINT = [
  DEVELOPER_WORKSPACE_FIXTURE_WIRE.length,
  DEVELOPER_WORKSPACE_FIXTURE_CAPTURED_AT,
  DEVELOPER_WORKSPACE_FIXTURE_AGENT_ID,
  DEVELOPER_WORKSPACE_API_BASE,
].join(":");

const CONTRACT_VALIDATORS = {
  unsupportedCapability: validateDeveloperAdapterCapabilityV1,
  supportedCapability: validateDeveloperAdapterCapabilityV1,
  onlineMachine: validateDeveloperMachineProjectionV1,
  offlineMachine: validateDeveloperMachineProjectionV1,
  staleMachine: validateDeveloperMachineProjectionV1,
  workspace: validateDeveloperWorkspaceRefV1,
  readySession: validateDeveloperSessionSummaryV1,
  unavailableSession: validateDeveloperSessionSummaryV1,
  pendingApproval: validateDeveloperApprovalRequestV1,
  unavailableTerminal: validateDeveloperTerminalResultV1,
} as const;

export type DeveloperWorkspaceContractFixtureKey =
  keyof typeof CONTRACT_VALIDATORS;

export function listDeveloperWorkspaceContractFixtures(): Array<{
  key: DeveloperWorkspaceContractFixtureKey;
  contract: unknown;
}> {
  return (
    Object.keys(CONTRACT_VALIDATORS) as DeveloperWorkspaceContractFixtureKey[]
  ).map((key) => ({
    key,
    contract: DEVELOPER_WORKSPACE_CONTRACT_FIXTURES[key],
  }));
}

export function parseDeveloperWorkspaceFixtureWire(
  wire: string = DEVELOPER_WORKSPACE_FIXTURE_WIRE,
): {
  meta: typeof DEVELOPER_WORKSPACE_FIXTURE_META;
  contracts: typeof DEVELOPER_WORKSPACE_CONTRACT_FIXTURES;
} {
  const parsed = JSON.parse(wire) as {
    meta: typeof DEVELOPER_WORKSPACE_FIXTURE_META;
    contracts: typeof DEVELOPER_WORKSPACE_CONTRACT_FIXTURES;
  };
  if (
    parsed.meta?.source !== "fixture" ||
    parsed.meta.fixture !== true ||
    parsed.meta.defaultOff !== true ||
    parsed.meta.mutationCapabilityPublished !== false
  ) {
    throw new Error("developer_workspace_fixture_meta_invalid");
  }
  return parsed;
}

export function scopeDeveloperWorkspaceFixtureWire(
  routeAgentId: string,
): string {
  const parsed = JSON.parse(DEVELOPER_WORKSPACE_FIXTURE_WIRE) as {
    meta: typeof DEVELOPER_WORKSPACE_FIXTURE_META;
    contracts: typeof DEVELOPER_WORKSPACE_CONTRACT_FIXTURES;
  };
  const rewrite = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(rewrite);
    if (value && typeof value === "object") {
      const next: Record<string, unknown> = {};
      for (const [key, nested] of Object.entries(
        value as Record<string, unknown>,
      )) {
        next[key] =
          key === "agentId" && typeof nested === "string"
            ? routeAgentId
            : rewrite(nested);
      }
      return next;
    }
    return value;
  };
  const scoped = rewrite(parsed) as typeof parsed;
  if (
    scoped.meta.source !== "fixture" ||
    scoped.meta.fixture !== true ||
    scoped.meta.defaultOff !== true ||
    scoped.meta.capturedAt !== DEVELOPER_WORKSPACE_FIXTURE_CAPTURED_AT
  ) {
    throw new Error("developer_workspace_scoped_fixture_meta_invalid");
  }
  return JSON.stringify(scoped);
}

export function validateDeveloperWorkspaceFixturePack(
  wire: string = DEVELOPER_WORKSPACE_FIXTURE_WIRE,
) {
  const pack = parseDeveloperWorkspaceFixtureWire(wire);
  const errors: string[] = [];
  for (const key of Object.keys(
    CONTRACT_VALIDATORS,
  ) as DeveloperWorkspaceContractFixtureKey[]) {
    const contract = pack.contracts[key];
    const dedicated = CONTRACT_VALIDATORS[key](contract);
    const family = validateDeveloperRemoteWorkspaceContractV1(contract);
    if (!dedicated.valid) errors.push(`${key}: ${dedicated.errors.join("; ")}`);
    if (!family.valid)
      errors.push(`${key}.family: ${family.errors.join("; ")}`);
  }
  return { valid: errors.length === 0, errors, pack };
}
