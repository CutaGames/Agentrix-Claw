import {
  DEVELOPER_REMOTE_WORKSPACE_CANONICALIZATION,
  DEVELOPER_REMOTE_WORKSPACE_SCHEMA_VERSION,
  DeveloperRemoteWorkspaceContractValidationError,
  assertDeveloperRemoteWorkspaceContractV1,
  evaluateDeveloperApprovalDecisionReplayV1,
  validateDeveloperAdapterCapabilityV1,
  validateDeveloperApprovalDecisionAgainstRequestV1,
  validateDeveloperApprovalDecisionV1,
  validateDeveloperApprovalRequestV1,
  validateDeveloperHandoffV1,
  validateDeveloperInstructionAgainstShellCommandV1,
  validateDeveloperInstructionV1,
  validateDeveloperMachineProjectionV1,
  validateDeveloperRemoteWorkspaceContractV1,
  validateDeveloperSessionEventTransitionV1,
  validateDeveloperSessionEventV1,
  validateDeveloperSessionSummaryV1,
  validateDeveloperTerminalResultAgainstEventV1,
  validateDeveloperTerminalResultV1,
  validateDeveloperWorkspaceRefV1,
  type DeveloperAdapterCapabilityV1,
  type DeveloperApprovalDecisionV1,
  type DeveloperApprovalRequestV1,
  type DeveloperEncryptedDataRefV1,
  type DeveloperHandoffV1,
  type DeveloperInstructionV1,
  type DeveloperMachineProjectionV1,
  type DeveloperRemoteWorkspaceContractV1,
  type DeveloperSessionEventV1,
  type DeveloperSessionSummaryV1,
  type DeveloperTerminalResultV1,
  type DeveloperWorkspaceRefV1,
} from "../developer-remote-workspace";
import type {
  ShellCommandEnvelopeV1,
  ShellSessionBindingV1,
} from "../shell-session-binding";
import type { DigestRef, RecordRef } from "../trust-loop-primitives";

const T0 = "2026-08-22T10:00:00.000Z";
const T1 = "2026-08-22T10:01:00.000Z";
const T2 = "2026-08-22T10:02:00.000Z";
const T3 = "2026-08-22T10:03:00.000Z";
const T4 = "2026-08-22T10:04:00.000Z";
const T5 = "2026-08-22T10:05:00.000Z";
const T6 = "2026-08-22T10:06:00.000Z";
const T9 = "2026-08-22T10:09:00.000Z";

function digest(character: string): DigestRef {
  return {
    algorithm: "sha-256",
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

function recordRef(
  type: RecordRef["type"],
  id: string,
  withDigest = false,
): RecordRef {
  return {
    type,
    id,
    version: 1,
    ...(withDigest ? { digest: DIGEST_F } : {}),
  };
}

const RUNTIME_REF = recordRef(
  "runtime",
  "runtime-1",
) as DeveloperInstructionV1["runtimeRef"];
const SHELL_BINDING_REF = recordRef(
  "shell_session_binding",
  "binding-1",
) as DeveloperInstructionV1["shellBindingRef"];
const JOURNAL_REF = recordRef(
  "shell_command_journal_entry",
  "journal-1",
) as Extract<
  DeveloperSessionEventV1,
  { eventType: "claimed" }
>["shellCommandJournalRef"];

function dataRef(
  dataKind: DeveloperEncryptedDataRefV1["dataKind"],
  dataRefValue: string,
): DeveloperEncryptedDataRefV1 {
  return {
    kind: "encrypted_data_ref",
    dataKind,
    dataRef: dataRefValue,
    digest: DIGEST_B,
    sizeBytes: 256,
    dataClass: "owner_private",
    encryption: "runtime_managed",
    ownerScope: "authenticated_owner",
    runtimeRef: RUNTIME_REF,
    expiresAt: T9,
  };
}

const MANIFEST: DeveloperAdapterCapabilityV1 = {
  schemaVersion: DEVELOPER_REMOTE_WORKSPACE_SCHEMA_VERSION,
  contractType: "developer_adapter_capability",
  manifestRef: "manifest-1",
  manifestVersion: 1,
  adapterRef: "adapter-1",
  providerRef: "provider-1",
  providerDisplayName: "Example Provider",
  productRef: "product-1",
  productDisplayName: "Structured Agent",
  protocol: {
    kind: "acp",
    protocolName: "agent_client_protocol",
    protocolVersion: "1.0",
    transport: "stdio",
  },
  certification: {
    status: "supported",
    officialCapabilityReviewRef: recordRef(
      "evidence",
      "capability-review-1",
      true,
    ) as Extract<
      DeveloperAdapterCapabilityV1["certification"],
      { status: "supported" }
    >["officialCapabilityReviewRef"],
    termsReviewRef: recordRef("terms", "terms-review-1", true) as Extract<
      DeveloperAdapterCapabilityV1["certification"],
      { status: "supported" }
    >["termsReviewRef"],
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
  authPlacement: "desktop_secure_storage",
  freshness: {
    observedAt: T1,
    validUntil: T9,
    sequence: 1,
  },
  limitations: ["owner_only_v1"],
};

const MACHINE: DeveloperMachineProjectionV1 = {
  schemaVersion: DEVELOPER_REMOTE_WORKSPACE_SCHEMA_VERSION,
  contractType: "developer_machine_projection",
  machineRef: "machine-1",
  ownerPrincipalRef: "principal-1",
  agentId: "agent-1",
  deviceRef: "device-1",
  runtimeRef: RUNTIME_REF,
  adapterManifestRef: MANIFEST.manifestRef,
  adapterManifestVersion: MANIFEST.manifestVersion,
  displayLabel: "Home workstation",
  platform: "windows",
  axes: {
    presence: "present",
    process: "running",
    cli: "installed",
    ide: "open",
    workspaceTrust: "trusted",
    sessionResumability: "supported",
    permissionBridge: "available",
  },
  projectionSequence: 4,
  capturedAt: T1,
  connection: {
    status: "online",
    observedAt: T1,
    validUntil: T5,
  },
  shellBindingRef: SHELL_BINDING_REF,
};

const WORKSPACE: DeveloperWorkspaceRefV1 = {
  schemaVersion: DEVELOPER_REMOTE_WORKSPACE_SCHEMA_VERSION,
  contractType: "developer_workspace_ref",
  workspaceRef: "workspace-1",
  workspaceVersion: 3,
  machineRef: MACHINE.machineRef,
  deviceRef: MACHINE.deviceRef,
  runtimeRef: RUNTIME_REF,
  scope: "repository",
  displayLabel: "Agentrix website",
  repositoryHint: {
    repositoryLabel: "Agentrix website",
    branchLabel: "feature/remote-workspace",
  },
  workspaceDigest: DIGEST_A,
  trust: {
    status: "trusted",
    trustRef: recordRef("evidence", "workspace-trust-1", true) as Extract<
      DeveloperWorkspaceRefV1["trust"],
      { status: "trusted" }
    >["trustRef"],
    trustedAt: T0,
  },
  observedAt: T1,
};

const SESSION: DeveloperSessionSummaryV1 = {
  schemaVersion: DEVELOPER_REMOTE_WORKSPACE_SCHEMA_VERSION,
  contractType: "developer_session_summary",
  sessionRef: "session-1",
  adapterSessionRef: "adapter-session-1",
  agentId: MACHINE.agentId,
  machineRef: MACHINE.machineRef,
  deviceRef: MACHINE.deviceRef,
  runtimeRef: RUNTIME_REF,
  workspaceRef: WORKSPACE.workspaceRef,
  adapterManifestRef: MANIFEST.manifestRef,
  adapterManifestVersion: MANIFEST.manifestVersion,
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
  state: "ready",
};

const INSTRUCTION: DeveloperInstructionV1 = {
  schemaVersion: DEVELOPER_REMOTE_WORKSPACE_SCHEMA_VERSION,
  contractType: "developer_instruction",
  instructionRef: "instruction-1",
  actionRef: "action-1",
  agentId: SESSION.agentId,
  machineRef: SESSION.machineRef,
  deviceRef: SESSION.deviceRef,
  runtimeRef: RUNTIME_REF,
  workspaceRef: SESSION.workspaceRef,
  sessionRef: SESSION.sessionRef,
  adapterSessionRef: SESSION.adapterSessionRef,
  adapterManifestRef: SESSION.adapterManifestRef,
  expectedSessionVersion: SESSION.sessionVersion,
  shellBindingRef: SHELL_BINDING_REF,
  instructionSequence: 1,
  idempotencyKey: "idempotency-1",
  requestDigest: DIGEST_A,
  payloadRef: dataRef(
    "instruction",
    "instruction-data-1",
  ) as DeveloperInstructionV1["payloadRef"],
  userVisibleSummary: "Run the selected test suite",
  issuedAt: T1,
  expiresAt: T5,
};

const SHELL_BINDING: ShellSessionBindingV1 = {
  schemaVersion: 1,
  bindingId: SHELL_BINDING_REF.id,
  bindingVersion: SHELL_BINDING_REF.version,
  agentId: "agent-1",
  accountableAgentId: "agent-1",
  authorityRootRef: { kind: "soul_core", soulCoreId: "soul-1" },
  principalRef: recordRef("actor_identity", "principal-1"),
  shellId: "shell-1",
  deviceId: "device-1",
  runtimeRef: RUNTIME_REF,
  audience: ["developer-runtime"],
  capabilities: ["developer-instruction"],
  nonceDomain: "developer-remote-workspace",
  issuedAt: T0,
  expiresAt: T9,
  status: "active",
};

const SHELL_COMMAND: ShellCommandEnvelopeV1 = {
  schemaVersion: 1,
  bindingId: SHELL_BINDING.bindingId,
  bindingVersion: SHELL_BINDING.bindingVersion,
  nonceDomain: SHELL_BINDING.nonceDomain,
  nonce: "0123456789abcdef0123456789abcdef",
  idempotencyKey: INSTRUCTION.idempotencyKey,
  requestDigest: INSTRUCTION.requestDigest.value,
  issuedAt: INSTRUCTION.issuedAt,
  expiresAt: INSTRUCTION.expiresAt,
};

function eventBase(
  sequence: number,
  eventType: DeveloperSessionEventV1["eventType"],
  occurredAt = T2,
) {
  return {
    schemaVersion: DEVELOPER_REMOTE_WORKSPACE_SCHEMA_VERSION,
    contractType: "developer_session_event" as const,
    eventRef: `event-${sequence}`,
    streamRef: "stream-1",
    instructionRef: INSTRUCTION.instructionRef,
    actionRef: INSTRUCTION.actionRef,
    sessionRef: INSTRUCTION.sessionRef,
    sessionVersion: INSTRUCTION.expectedSessionVersion,
    adapterSessionRef: INSTRUCTION.adapterSessionRef,
    sequence,
    previousSequence: sequence - 1,
    cursor: {
      streamRef: "stream-1",
      sequence,
    },
    occurredAt,
    eventDigest: DIGEST_C,
    eventType,
  };
}

const ACCEPTED_EVENT: DeveloperSessionEventV1 = {
  ...eventBase(1, "accepted", T1),
  eventType: "accepted",
};

const CLAIMED_EVENT: DeveloperSessionEventV1 = {
  ...eventBase(2, "claimed", T1),
  eventType: "claimed",
  shellCommandJournalRef: JOURNAL_REF,
};

const PLANNING_EVENT: DeveloperSessionEventV1 = {
  ...eventBase(3, "planning"),
  eventType: "planning",
  planDataRef: dataRef("plan", "plan-data-1") as Extract<
    DeveloperSessionEventV1,
    { eventType: "planning" }
  >["planDataRef"],
};

const APPROVAL_REQUEST: DeveloperApprovalRequestV1 = {
  schemaVersion: DEVELOPER_REMOTE_WORKSPACE_SCHEMA_VERSION,
  contractType: "developer_approval_request",
  approvalRef: "approval-1",
  approvalVersion: 1,
  status: "pending",
  decisionSequence: 0,
  instructionRef: INSTRUCTION.instructionRef,
  actionRef: INSTRUCTION.actionRef,
  sessionRef: INSTRUCTION.sessionRef,
  sessionVersion: INSTRUCTION.expectedSessionVersion,
  adapterSessionRef: INSTRUCTION.adapterSessionRef,
  adapterRequestRef: "adapter-request-1",
  workspaceRef: INSTRUCTION.workspaceRef,
  operationKind: "execute_command",
  toolName: "test_runner",
  toolArgumentsDigest: DIGEST_B,
  workspaceScopeDigest: DIGEST_C,
  instructionRequestDigest: INSTRUCTION.requestDigest,
  requestDigest: DIGEST_D,
  risk: "L2",
  sideEffectClass: "command_execution",
  estimatedCost: {
    status: "estimated",
    amountMinor: "25",
    currency: "USD",
    decimals: 2,
  },
  requestedGrantScopes: ["once", "session"],
  requiresLocalConfirmation: false,
  userVisibleSummary: "Run the selected test command",
  redactedArgumentsSummary: "Selected test target; arguments redacted",
  issuedAt: T1,
  expiresAt: T5,
};

const AWAITING_EVENT: DeveloperSessionEventV1 = {
  ...eventBase(4, "awaiting_approval"),
  eventType: "awaiting_approval",
  approvalRef: APPROVAL_REQUEST.approvalRef,
  approvalRequestDigest: APPROVAL_REQUEST.requestDigest,
};

const RUNNING_EVENT: DeveloperSessionEventV1 = {
  ...eventBase(5, "running"),
  eventType: "running",
  executionRef: "execution-1",
};

const APPROVED_DECISION: DeveloperApprovalDecisionV1 = {
  schemaVersion: DEVELOPER_REMOTE_WORKSPACE_SCHEMA_VERSION,
  contractType: "developer_approval_decision",
  decisionRef: "decision-1",
  approvalRef: APPROVAL_REQUEST.approvalRef,
  approvalVersion: APPROVAL_REQUEST.approvalVersion,
  previousStatus: "pending",
  decisionSequence: 1,
  instructionRef: APPROVAL_REQUEST.instructionRef,
  actionRef: APPROVAL_REQUEST.actionRef,
  sessionRef: APPROVAL_REQUEST.sessionRef,
  sessionVersion: APPROVAL_REQUEST.sessionVersion,
  adapterSessionRef: APPROVAL_REQUEST.adapterSessionRef,
  adapterRequestRef: APPROVAL_REQUEST.adapterRequestRef,
  requestDigest: APPROVAL_REQUEST.requestDigest,
  instructionRequestDigest: APPROVAL_REQUEST.instructionRequestDigest,
  toolArgumentsDigest: APPROVAL_REQUEST.toolArgumentsDigest,
  workspaceScopeDigest: APPROVAL_REQUEST.workspaceScopeDigest,
  decidedAt: T2,
  decisionDigest: DIGEST_E,
  authorityDecisionRef: recordRef(
    "authority_decision",
    "authority-decision-1",
    true,
  ) as DeveloperApprovalDecisionV1["authorityDecisionRef"],
  decision: "approved",
  resultingStatus: "approved",
  decidedByRef: "principal-1",
  grantScope: "once",
  grantExpiresAt: T4,
  authorityGrantRef: recordRef(
    "authority_grant",
    "authority-grant-1",
    true,
  ) as Extract<
    DeveloperApprovalDecisionV1,
    { decision: "approved" }
  >["authorityGrantRef"],
};

const COMPLETED_RESULT: DeveloperTerminalResultV1 = {
  schemaVersion: DEVELOPER_REMOTE_WORKSPACE_SCHEMA_VERSION,
  contractType: "developer_terminal_result",
  terminalResultRef: "terminal-1",
  instructionRef: INSTRUCTION.instructionRef,
  actionRef: INSTRUCTION.actionRef,
  sessionRef: INSTRUCTION.sessionRef,
  sessionVersion: INSTRUCTION.expectedSessionVersion,
  adapterSessionRef: INSTRUCTION.adapterSessionRef,
  requestDigest: INSTRUCTION.requestDigest,
  eventSequence: 6,
  recordedAt: T4,
  terminalDigest: DIGEST_E,
  status: "completed",
  shellBindingRef: SHELL_BINDING_REF,
  shellCommandJournalRef: JOURNAL_REF,
  startedAt: T2,
  completedAt: T3,
  adapterTerminalEvidenceRef: recordRef(
    "evidence",
    "terminal-evidence-1",
    true,
  ) as Extract<
    DeveloperTerminalResultV1,
    { status: "completed" }
  >["adapterTerminalEvidenceRef"],
  outcomeRef: recordRef("outcome_record", "outcome-1", true) as Extract<
    DeveloperTerminalResultV1,
    { status: "completed" }
  >["outcomeRef"],
  actionReceiptRef: recordRef(
    "action_receipt",
    "action-receipt-1",
    true,
  ) as Extract<
    DeveloperTerminalResultV1,
    { status: "completed" }
  >["actionReceiptRef"],
  resultDataRef: dataRef("terminal_result", "terminal-data-1") as Extract<
    DeveloperTerminalResultV1,
    { status: "completed" }
  >["resultDataRef"],
  canonicalReadBack: true,
};

const COMPLETED_EVENT: DeveloperSessionEventV1 = {
  ...eventBase(6, "completed", T4),
  eventType: "completed",
  terminalResultRef: COMPLETED_RESULT.terminalResultRef,
  terminalResultDigest: COMPLETED_RESULT.terminalDigest,
};

const HANDOFF: DeveloperHandoffV1 = {
  schemaVersion: DEVELOPER_REMOTE_WORKSPACE_SCHEMA_VERSION,
  contractType: "developer_handoff",
  handoffRef: "handoff-1",
  handoffVersion: 1,
  ownerPrincipalRef: MACHINE.ownerPrincipalRef,
  agentId: SESSION.agentId,
  machineRef: SESSION.machineRef,
  deviceRef: SESSION.deviceRef,
  runtimeRef: RUNTIME_REF,
  sessionRef: SESSION.sessionRef,
  sessionVersion: SESSION.sessionVersion,
  adapterSessionRef: SESSION.adapterSessionRef,
  fromSurface: "web",
  toSurface: "mobile",
  target: {
    kind: "approval",
    approvalRef: APPROVAL_REQUEST.approvalRef,
    approvalRequestDigest: APPROVAL_REQUEST.requestDigest,
  },
  oneTime: true,
  issuedAt: T1,
  expiresAt: T5,
  handoffDigest: DIGEST_F,
  status: "issued",
};

const GOLDEN_FIXTURES: DeveloperRemoteWorkspaceContractV1[] = [
  MANIFEST,
  MACHINE,
  WORKSPACE,
  SESSION,
  INSTRUCTION,
  ACCEPTED_EVENT,
  CLAIMED_EVENT,
  PLANNING_EVENT,
  AWAITING_EVENT,
  RUNNING_EVENT,
  COMPLETED_EVENT,
  APPROVAL_REQUEST,
  APPROVED_DECISION,
  COMPLETED_RESULT,
  HANDOFF,
];

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function withField<T>(value: T, key: string, fieldValue: unknown): unknown {
  return { ...(clone(value) as object), [key]: fieldValue };
}

describe("Developer Remote Workspace V1 positive golden fixtures", () => {
  test("accepts every contract family through dedicated validators", () => {
    expect(validateDeveloperAdapterCapabilityV1(MANIFEST)).toEqual({
      valid: true,
      errors: [],
    });
    expect(validateDeveloperMachineProjectionV1(MACHINE)).toEqual({
      valid: true,
      errors: [],
    });
    expect(validateDeveloperWorkspaceRefV1(WORKSPACE)).toEqual({
      valid: true,
      errors: [],
    });
    expect(validateDeveloperSessionSummaryV1(SESSION)).toEqual({
      valid: true,
      errors: [],
    });
    expect(validateDeveloperInstructionV1(INSTRUCTION)).toEqual({
      valid: true,
      errors: [],
    });
    expect(validateDeveloperApprovalRequestV1(APPROVAL_REQUEST)).toEqual({
      valid: true,
      errors: [],
    });
    expect(validateDeveloperApprovalDecisionV1(APPROVED_DECISION)).toEqual({
      valid: true,
      errors: [],
    });
    expect(validateDeveloperTerminalResultV1(COMPLETED_RESULT)).toEqual({
      valid: true,
      errors: [],
    });
    expect(validateDeveloperHandoffV1(HANDOFF)).toEqual({
      valid: true,
      errors: [],
    });
  });

  test("round-trips the same JSON fixtures for every consuming surface", () => {
    const wire = JSON.stringify(GOLDEN_FIXTURES);
    const webDecoded = JSON.parse(wire) as unknown[];
    const mobileDecoded = JSON.parse(wire) as unknown[];
    const desktopDecoded = JSON.parse(wire) as unknown[];
    const backendDecoded = JSON.parse(wire) as unknown[];

    for (const decoded of [
      webDecoded,
      mobileDecoded,
      desktopDecoded,
      backendDecoded,
    ]) {
      expect(decoded).toEqual(GOLDEN_FIXTURES);
      decoded.forEach((contract) => {
        expect(validateDeveloperRemoteWorkspaceContractV1(contract)).toEqual({
          valid: true,
          errors: [],
        });
        expect(() =>
          assertDeveloperRemoteWorkspaceContractV1(contract),
        ).not.toThrow();
      });
    }
  });

  test("keeps raw bodies, credentials, cookies, tokens, and local paths out of control fixtures", () => {
    const forbiddenKeys = new Set([
      "providertoken",
      "cookie",
      "rawcredential",
      "absolutelocalpath",
      "localpath",
      "filepath",
      "rawprompt",
      "promptbody",
      "rawdiff",
      "diffbody",
      "rawlog",
      "logbody",
      "body",
    ]);
    const visit = (value: unknown): void => {
      if (Array.isArray(value)) {
        value.forEach(visit);
        return;
      }
      if (value && typeof value === "object") {
        for (const [key, child] of Object.entries(value)) {
          expect(forbiddenKeys).not.toContain(
            key.replace(/[_-]/g, "").toLowerCase(),
          );
          visit(child);
        }
      }
    };

    visit(GOLDEN_FIXTURES);
    const wire = JSON.stringify(GOLDEN_FIXTURES);
    expect(wire).not.toContain("super-secret-provider-token");
    expect(wire).not.toContain("private source prompt body");
    expect(wire).not.toContain("C:\\Users\\owner\\source");
  });
});

describe("Developer Remote Workspace V1 strict schema boundaries", () => {
  test.each(
    GOLDEN_FIXTURES.map((fixture) => [fixture.contractType, fixture] as const),
  )("%s rejects an unknown top-level field", (_contractType, fixture) => {
    expect(
      validateDeveloperRemoteWorkspaceContractV1(
        withField(fixture, "providerToken", "super-secret-provider-token"),
      ).valid,
    ).toBe(false);
  });

  test.each(
    GOLDEN_FIXTURES.map((fixture) => [fixture.contractType, fixture] as const),
  )("%s rejects an unknown schema version", (_contractType, fixture) => {
    expect(
      validateDeveloperRemoteWorkspaceContractV1(
        withField(fixture, "schemaVersion", 2),
      ).valid,
    ).toBe(false);
  });

  test("rejects unknown contract and enum values without positive fallback", () => {
    expect(
      validateDeveloperRemoteWorkspaceContractV1({
        schemaVersion: 1,
        contractType: "developer_future_contract",
      }),
    ).toEqual({
      valid: false,
      errors: [expect.stringContaining("unsupported contract")],
    });
    expect(
      validateDeveloperAdapterCapabilityV1({
        ...clone(MANIFEST),
        protocol: { ...MANIFEST.protocol, kind: "screen_scraping" },
      }).valid,
    ).toBe(false);
    expect(
      validateDeveloperSessionSummaryV1({
        ...clone(SESSION),
        state: "succeeded",
      }).valid,
    ).toBe(false);
  });

  test("rejects ambiguous union shapes and nested unknown fields", () => {
    expect(
      validateDeveloperSessionEventV1({
        ...clone(ACCEPTED_EVENT),
        terminalResultRef: "terminal-1",
        terminalResultDigest: DIGEST_A,
      }).valid,
    ).toBe(false);
    expect(
      validateDeveloperApprovalDecisionV1({
        ...clone(APPROVED_DECISION),
        reasonCode: "also_rejected",
      }).valid,
    ).toBe(false);
    expect(
      validateDeveloperInstructionV1({
        ...clone(INSTRUCTION),
        payloadRef: {
          ...clone(INSTRUCTION.payloadRef),
          rawPrompt: "private source prompt body",
        },
      }).valid,
    ).toBe(false);
    expect(
      validateDeveloperTerminalResultV1({
        ...clone(COMPLETED_RESULT),
        terminalDigest: { ...DIGEST_E, format: "hex" },
      }).valid,
    ).toBe(false);
  });

  test("rejects absolute local paths even in presentation-only labels", () => {
    expect(
      validateDeveloperWorkspaceRefV1({
        ...clone(WORKSPACE),
        displayLabel: "C:\\Users\\owner\\source",
      }).errors,
    ).toEqual(
      expect.arrayContaining([expect.stringContaining("absolute local paths")]),
    );
    expect(
      validateDeveloperWorkspaceRefV1({
        ...clone(WORKSPACE),
        repositoryHint: {
          repositoryLabel: "/home/owner/source",
        },
      }).valid,
    ).toBe(false);
    for (const displayLabel of [
      "   C:\\Users\\owner\\source",
      "  \\\\server\\share",
      "   /home/owner/source",
      "  FiLe:///C:/Users/owner/source",
      "  ~/source",
      "  ~\\source",
    ]) {
      expect(
        validateDeveloperWorkspaceRefV1({
          ...clone(WORKSPACE),
          displayLabel,
        }).valid,
      ).toBe(false);
    }
  });

  test("assert helper throws the shared validation error style", () => {
    expect(() =>
      assertDeveloperRemoteWorkspaceContractV1({
        ...clone(INSTRUCTION),
        schemaVersion: 99,
      }),
    ).toThrow(DeveloperRemoteWorkspaceContractValidationError);
  });
});

describe("Adapter, machine, workspace, and session invariants", () => {
  test("does not let planned, unsupported, or deep-link adapters claim structured execution", () => {
    expect(
      validateDeveloperAdapterCapabilityV1({
        ...clone(MANIFEST),
        certification: { status: "planned", reasonCode: "review_pending" },
      }).errors,
    ).toEqual(
      expect.arrayContaining([
        expect.stringContaining("cannot claim capability"),
      ]),
    );

    expect(
      validateDeveloperAdapterCapabilityV1({
        ...clone(MANIFEST),
        protocol: { kind: "deep_link_only", protocolName: "vendor_deep_link" },
      }).errors,
    ).toEqual(
      expect.arrayContaining([
        expect.stringContaining("cannot claim session or approval capability"),
      ]),
    );

    expect(
      validateDeveloperAdapterCapabilityV1({
        ...clone(MANIFEST),
        protocol: { kind: "unsupported", protocolName: "none" },
        certification: {
          status: "unsupported",
          reasonCode: "no_official_protocol",
        },
        sessionCapabilities: Object.fromEntries(
          Object.keys(MANIFEST.sessionCapabilities).map((key) => [key, false]),
        ),
        approvalCapabilities: Object.fromEntries(
          Object.keys(MANIFEST.approvalCapabilities).map((key) => [key, false]),
        ),
        workspaceCapabilities: Object.fromEntries(
          Object.keys(MANIFEST.workspaceCapabilities).map((key) => [
            key,
            false,
          ]),
        ),
        authPlacement: "not_applicable",
      }),
    ).toEqual({ valid: true, errors: [] });
  });

  test("keeps machine health axes independent and rejects stale bindings on non-online projections", () => {
    const { shellBindingRef: _omitted, ...base } = clone(MACHINE) as Extract<
      DeveloperMachineProjectionV1,
      { connection: { status: "online" } }
    >;
    const offline: DeveloperMachineProjectionV1 = {
      ...base,
      axes: {
        ...base.axes,
        presence: "present",
        process: "running",
        permissionBridge: "unavailable",
      },
      connection: {
        status: "offline",
        observedAt: T1,
        reasonCode: "route_disconnected",
      },
    };
    expect(validateDeveloperMachineProjectionV1(offline)).toEqual({
      valid: true,
      errors: [],
    });
    expect(
      validateDeveloperMachineProjectionV1({
        ...offline,
        shellBindingRef: SHELL_BINDING_REF,
      }).valid,
    ).toBe(false);
    expect(
      validateDeveloperMachineProjectionV1({
        ...clone(MACHINE),
        connection: { ...MACHINE.connection, validUntil: T0 },
      }).valid,
    ).toBe(false);
  });

  test("enforces workspace trust time and session-state variant rules", () => {
    expect(
      validateDeveloperWorkspaceRefV1({
        ...clone(WORKSPACE),
        trust: { ...WORKSPACE.trust, trustedAt: T2 },
      }).valid,
    ).toBe(false);

    const available: DeveloperSessionSummaryV1 = {
      ...clone(SESSION),
      state: "available",
      resumeDisposition: "resumable",
    };
    expect(validateDeveloperSessionSummaryV1(available)).toEqual({
      valid: true,
      errors: [],
    });
    expect(
      validateDeveloperSessionSummaryV1({
        ...available,
        capabilities: { ...available.capabilities, canResume: false },
      }).valid,
    ).toBe(false);
    expect(
      validateDeveloperSessionSummaryV1({
        ...clone(SESSION),
        state: "ready",
        reasonCode: "not_ready",
      }).valid,
    ).toBe(false);
  });
});

describe("Instruction and ordered event fences", () => {
  test("binds the instruction to the canonical Shell binding and command without writing either", () => {
    expect(
      validateDeveloperInstructionAgainstShellCommandV1(
        INSTRUCTION,
        SHELL_BINDING,
        SHELL_COMMAND,
        T2,
      ),
    ).toEqual({ valid: true, errors: [] });

    expect(
      validateDeveloperInstructionAgainstShellCommandV1(
        INSTRUCTION,
        SHELL_BINDING,
        { ...SHELL_COMMAND, requestDigest: DIGEST_B.value },
        T2,
      ).errors,
    ).toEqual(
      expect.arrayContaining([expect.stringContaining("requestDigest")]),
    );

    expect(
      validateDeveloperInstructionAgainstShellCommandV1(
        {
          ...clone(INSTRUCTION),
          shellBindingRef: { ...SHELL_BINDING_REF, id: "binding-2" },
        },
        SHELL_BINDING,
        SHELL_COMMAND,
        T2,
      ).valid,
    ).toBe(false);
  });

  test("requires a fresh canonical now and rejects the command after expiry", () => {
    expect(
      validateDeveloperInstructionAgainstShellCommandV1(
        INSTRUCTION,
        SHELL_BINDING,
        SHELL_COMMAND,
        T2,
      ),
    ).toEqual({ valid: true, errors: [] });
    expect(
      validateDeveloperInstructionAgainstShellCommandV1(
        INSTRUCTION,
        SHELL_BINDING,
        SHELL_COMMAND,
        T6,
      ).errors,
    ).toEqual(
      expect.arrayContaining([expect.stringContaining("command expired")]),
    );
    expect(
      validateDeveloperInstructionAgainstShellCommandV1(
        INSTRUCTION,
        SHELL_BINDING,
        SHELL_COMMAND,
        "2026-08-22T10:02:00Z",
      ).valid,
    ).toBe(false);
  });

  test("rejects invalid digest, time window, payload lifetime, and runtime binding", () => {
    expect(
      validateDeveloperInstructionV1({
        ...clone(INSTRUCTION),
        requestDigest: { ...DIGEST_A, value: "A".repeat(64) },
      }).valid,
    ).toBe(false);
    expect(
      validateDeveloperInstructionV1({
        ...clone(INSTRUCTION),
        issuedAt: "2026-08-22T10:01:00Z",
      }).valid,
    ).toBe(false);
    expect(
      validateDeveloperInstructionV1({
        ...clone(INSTRUCTION),
        payloadRef: { ...clone(INSTRUCTION.payloadRef), expiresAt: T3 },
      }).valid,
    ).toBe(false);
    expect(
      validateDeveloperInstructionV1({
        ...clone(INSTRUCTION),
        payloadRef: {
          ...clone(INSTRUCTION.payloadRef),
          runtimeRef: recordRef("runtime", "runtime-2"),
        },
      }).valid,
    ).toBe(false);
  });

  test("accepts the ordered event stream and exact terminal binding", () => {
    for (const event of [
      ACCEPTED_EVENT,
      CLAIMED_EVENT,
      PLANNING_EVENT,
      AWAITING_EVENT,
      RUNNING_EVENT,
      COMPLETED_EVENT,
    ]) {
      expect(validateDeveloperSessionEventV1(event)).toEqual({
        valid: true,
        errors: [],
      });
    }
    const transitions = [
      [ACCEPTED_EVENT, CLAIMED_EVENT],
      [CLAIMED_EVENT, PLANNING_EVENT],
      [PLANNING_EVENT, AWAITING_EVENT],
      [AWAITING_EVENT, RUNNING_EVENT],
      [RUNNING_EVENT, COMPLETED_EVENT],
    ] as const;
    transitions.forEach(([previous, next]) => {
      expect(validateDeveloperSessionEventTransitionV1(previous, next)).toEqual(
        {
          valid: true,
          errors: [],
        },
      );
    });
    expect(
      validateDeveloperTerminalResultAgainstEventV1(
        COMPLETED_RESULT,
        COMPLETED_EVENT,
      ),
    ).toEqual({ valid: true, errors: [] });
  });

  test("fails closed on gaps, cursor mismatch, lineage changes, and events after terminal", () => {
    expect(
      validateDeveloperSessionEventV1({
        ...clone(PLANNING_EVENT),
        previousSequence: 1,
      }).valid,
    ).toBe(false);
    expect(
      validateDeveloperSessionEventV1({
        ...clone(PLANNING_EVENT),
        cursor: { streamRef: "stream-2", sequence: 3 },
      }).valid,
    ).toBe(false);
    expect(
      validateDeveloperSessionEventTransitionV1(PLANNING_EVENT, {
        ...clone(AWAITING_EVENT),
        sessionRef: "session-2",
      }).valid,
    ).toBe(false);
    expect(
      validateDeveloperSessionEventTransitionV1(COMPLETED_EVENT, {
        ...clone(COMPLETED_EVENT),
        eventRef: "event-7",
        sequence: 7,
        previousSequence: 6,
        cursor: { streamRef: "stream-1", sequence: 7 },
      }).valid,
    ).toBe(false);
    expect(
      validateDeveloperTerminalResultAgainstEventV1(COMPLETED_RESULT, {
        ...clone(COMPLETED_EVENT),
        terminalResultDigest: DIGEST_A,
      }).valid,
    ).toBe(false);
  });

  test("allows unavailable only before claim and forbids it after journaled execution begins", () => {
    const unavailableAfter = (
      previous: DeveloperSessionEventV1,
    ): DeveloperSessionEventV1 => ({
      ...eventBase(previous.sequence + 1, "unavailable", T3),
      eventType: "unavailable",
      terminalResultRef: `terminal-unavailable-${previous.sequence}`,
      terminalResultDigest: DIGEST_E,
    });

    expect(
      validateDeveloperSessionEventTransitionV1(
        ACCEPTED_EVENT,
        unavailableAfter(ACCEPTED_EVENT),
      ),
    ).toEqual({ valid: true, errors: [] });

    for (const previous of [
      CLAIMED_EVENT,
      PLANNING_EVENT,
      AWAITING_EVENT,
      RUNNING_EVENT,
    ]) {
      expect(
        validateDeveloperSessionEventTransitionV1(
          previous,
          unavailableAfter(previous),
        ).errors,
      ).toEqual(
        expect.arrayContaining([expect.stringContaining("invalid transition")]),
      );
    }
  });
});

describe("Approval exact binding and monotonic terminal decisions", () => {
  test("accepts an exact one-time Authority-bound decision", () => {
    expect(
      validateDeveloperApprovalDecisionAgainstRequestV1(
        APPROVED_DECISION,
        APPROVAL_REQUEST,
      ),
    ).toEqual({ valid: true, errors: [] });
    expect(
      evaluateDeveloperApprovalDecisionReplayV1(
        APPROVED_DECISION,
        clone(APPROVED_DECISION),
      ),
    ).toBe("idempotent");
  });

  test("rejects digest/session/request mismatches, stale approval, and terminal rewrite", () => {
    expect(
      validateDeveloperApprovalDecisionAgainstRequestV1(
        { ...clone(APPROVED_DECISION), toolArgumentsDigest: DIGEST_A },
        APPROVAL_REQUEST,
      ).errors,
    ).toEqual(
      expect.arrayContaining([
        expect.stringContaining("exact digest mismatch"),
      ]),
    );
    expect(
      validateDeveloperApprovalDecisionAgainstRequestV1(
        { ...clone(APPROVED_DECISION), sessionVersion: 8 },
        APPROVAL_REQUEST,
      ).valid,
    ).toBe(false);
    expect(
      validateDeveloperApprovalDecisionAgainstRequestV1(
        { ...clone(APPROVED_DECISION), decidedAt: T6, grantExpiresAt: T9 },
        APPROVAL_REQUEST,
      ).valid,
    ).toBe(false);

    const rejectedWire: Record<string, unknown> = {
      ...clone(APPROVED_DECISION),
      decisionRef: "decision-2",
      decision: "rejected",
      resultingStatus: "rejected",
      decidedByRef: "principal-1",
      reasonCode: "user_rejected",
    };
    delete rejectedWire.grantScope;
    delete rejectedWire.grantExpiresAt;
    delete rejectedWire.authorityGrantRef;
    const rejected = rejectedWire as unknown as DeveloperApprovalDecisionV1;
    expect(validateDeveloperApprovalDecisionV1(rejected)).toEqual({
      valid: true,
      errors: [],
    });
    expect(
      evaluateDeveloperApprovalDecisionReplayV1(APPROVED_DECISION, rejected),
    ).toBe("conflict");
  });

  test("enforces risk policy, one-time L3, local confirmation, and expiry shape", () => {
    const l3Request: DeveloperApprovalRequestV1 = {
      ...clone(APPROVAL_REQUEST),
      operationKind: "deploy",
      risk: "L3",
      sideEffectClass: "irreversible",
      requestedGrantScopes: ["once"],
      requiresLocalConfirmation: true,
    };
    expect(validateDeveloperApprovalRequestV1(l3Request)).toEqual({
      valid: true,
      errors: [],
    });
    expect(
      validateDeveloperApprovalRequestV1({
        ...l3Request,
        requestedGrantScopes: ["once", "session"],
      }).valid,
    ).toBe(false);
    expect(
      validateDeveloperApprovalRequestV1({
        ...clone(APPROVAL_REQUEST),
        operationKind: "delete",
        risk: "L2",
        sideEffectClass: "irreversible",
      }).valid,
    ).toBe(false);
    expect(
      validateDeveloperApprovalDecisionAgainstRequestV1(
        { ...clone(APPROVED_DECISION), grantScope: "session" },
        l3Request,
      ).valid,
    ).toBe(false);
    expect(
      validateDeveloperApprovalDecisionAgainstRequestV1(
        APPROVED_DECISION,
        l3Request,
      ).errors,
    ).toEqual(
      expect.arrayContaining([expect.stringContaining("localConfirmationRef")]),
    );

    const expiredWire: Record<string, unknown> = {
      ...clone(APPROVED_DECISION),
      decisionRef: "decision-expired",
      decision: "expired",
      resultingStatus: "expired",
      reasonCode: "request_expired",
      decidedAt: T6,
    };
    delete expiredWire.decidedByRef;
    delete expiredWire.grantScope;
    delete expiredWire.grantExpiresAt;
    delete expiredWire.authorityGrantRef;
    const expired = expiredWire as unknown as DeveloperApprovalDecisionV1;
    expect(
      validateDeveloperApprovalDecisionAgainstRequestV1(
        expired,
        APPROVAL_REQUEST,
      ),
    ).toEqual({ valid: true, errors: [] });
  });
});

describe("Terminal and handoff fail-closed invariants", () => {
  test("requires terminal evidence, canonical read-back, and ordered terminal time", () => {
    const missingEvidence = clone(COMPLETED_RESULT) as unknown as Record<
      string,
      unknown
    >;
    delete missingEvidence.adapterTerminalEvidenceRef;
    expect(validateDeveloperTerminalResultV1(missingEvidence).valid).toBe(
      false,
    );
    expect(
      validateDeveloperTerminalResultV1({
        ...clone(COMPLETED_RESULT),
        canonicalReadBack: false,
      }).valid,
    ).toBe(false);
    expect(
      validateDeveloperTerminalResultV1({
        ...clone(COMPLETED_RESULT),
        completedAt: T1,
      }).valid,
    ).toBe(false);
  });

  test("makes unknown outcome query-only and forbids blind replay or terminal body fields", () => {
    const unknown: DeveloperTerminalResultV1 = {
      schemaVersion: 1,
      contractType: "developer_terminal_result",
      terminalResultRef: "terminal-unknown-1",
      instructionRef: INSTRUCTION.instructionRef,
      actionRef: INSTRUCTION.actionRef,
      sessionRef: INSTRUCTION.sessionRef,
      sessionVersion: INSTRUCTION.expectedSessionVersion,
      adapterSessionRef: INSTRUCTION.adapterSessionRef,
      requestDigest: INSTRUCTION.requestDigest,
      eventSequence: 6,
      recordedAt: T4,
      terminalDigest: DIGEST_E,
      status: "unknown_outcome",
      shellBindingRef: SHELL_BINDING_REF,
      shellCommandJournalRef: JOURNAL_REF,
      unknownSince: T3,
      reconciliationRef: recordRef(
        "downstream_idempotency",
        "reconciliation-1",
        true,
      ) as Extract<
        DeveloperTerminalResultV1,
        { status: "unknown_outcome" }
      >["reconciliationRef"],
      queryOnly: true,
      replayAllowed: false,
    };
    expect(validateDeveloperTerminalResultV1(unknown)).toEqual({
      valid: true,
      errors: [],
    });
    expect(
      validateDeveloperTerminalResultV1({ ...unknown, replayAllowed: true })
        .valid,
    ).toBe(false);
    expect(
      validateDeveloperTerminalResultV1({
        ...unknown,
        completedAt: T4,
        resultDataRef: dataRef("terminal_result", "forbidden-data-1"),
      }).valid,
    ).toBe(false);
  });

  test("keeps unavailable distinct from an executed terminal result", () => {
    const unavailable: DeveloperTerminalResultV1 = {
      schemaVersion: 1,
      contractType: "developer_terminal_result",
      terminalResultRef: "terminal-unavailable-1",
      instructionRef: INSTRUCTION.instructionRef,
      actionRef: INSTRUCTION.actionRef,
      sessionRef: INSTRUCTION.sessionRef,
      sessionVersion: INSTRUCTION.expectedSessionVersion,
      adapterSessionRef: INSTRUCTION.adapterSessionRef,
      requestDigest: INSTRUCTION.requestDigest,
      eventSequence: 2,
      recordedAt: T2,
      terminalDigest: DIGEST_E,
      status: "unavailable",
      reasonCode: "machine_offline",
      executionStarted: false,
    };
    expect(validateDeveloperTerminalResultV1(unavailable)).toEqual({
      valid: true,
      errors: [],
    });
    expect(
      validateDeveloperTerminalResultV1({
        ...unavailable,
        shellCommandJournalRef: JOURNAL_REF,
      }).valid,
    ).toBe(false);
  });

  test("enforces one-time handoff direction and terminal status time shape", () => {
    expect(validateDeveloperHandoffV1(HANDOFF)).toEqual({
      valid: true,
      errors: [],
    });
    expect(
      validateDeveloperHandoffV1({
        ...clone(HANDOFF),
        toSurface: HANDOFF.fromSurface,
      }).valid,
    ).toBe(false);
    expect(
      validateDeveloperHandoffV1({
        ...clone(HANDOFF),
        oneTime: false,
      }).valid,
    ).toBe(false);
    expect(
      validateDeveloperHandoffV1({
        ...clone(HANDOFF),
        status: "consumed",
        consumedAt: T6,
        consumerSessionRef: "consumer-session-1",
        consumptionReceiptRef: recordRef("evidence", "handoff-receipt-1", true),
      }).valid,
    ).toBe(false);
    expect(
      validateDeveloperHandoffV1({
        ...clone(HANDOFF),
        status: "expired",
        expiredAt: T4,
      }).valid,
    ).toBe(false);
  });
});
