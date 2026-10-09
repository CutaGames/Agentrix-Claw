import {
  decideDeveloperApproval,
  parseDeveloperWorkspacePushPayload,
  resolveDeveloperApprovalPushDestination,
} from "../developerWorkspaceApprovals";
import type {
  DeveloperWorkspaceTransport,
  DeveloperWorkspaceTransportRequest,
} from "../developerWorkspaceAuth";
import { createDeveloperWorkspaceAuthTransport } from "../developerWorkspaceAuth";
import {
  cancelDeveloperInstruction,
  createDeveloperWorkspaceIdempotencyStore,
  evaluateDeveloperLiveMutationCta,
  reconcileDeveloperInstruction,
  submitDeveloperInstruction,
} from "../developerWorkspaceControl";
import { acceptDeveloperHandoff } from "../developerWorkspaceHandoff";
import {
  DEVELOPER_WORKSPACE_ONLINE_MACHINE,
  DEVELOPER_WORKSPACE_PENDING_APPROVAL,
  DEVELOPER_WORKSPACE_READY_SESSION,
} from "../developerWorkspaceFixtures";
import { loadDeveloperWorkspaceSnapshot } from "../developerWorkspaceClient";
import {
  DEVELOPER_WORKSPACE_API_PATHS,
  listDeveloperMachines,
  presentDeveloperReceipt,
  validateReceiptProjection,
} from "../developerWorkspaceLiveClient";
import {
  assertDeveloperWorkspaceSafeToPersist,
  developerWorkspaceAnalyticsProps,
  developerWorkspaceCacheKey,
  queueDeveloperWorkspaceMutation,
  validateDeveloperWorkspaceControlSummary,
} from "../developerWorkspacePersistence";
import type {
  DeveloperApprovalDecisionV1,
  DeveloperApprovalRequestV1,
  DeveloperEncryptedDataRefV1,
  DeveloperHandoffV1,
  DeveloperInstructionV1,
  DeveloperSessionEventV1,
} from "../../../shared/types/developer-remote-workspace";
import {
  DEVELOPER_REMOTE_WORKSPACE_CANONICALIZATION,
  DEVELOPER_REMOTE_WORKSPACE_SCHEMA_VERSION,
  validateDeveloperApprovalDecisionAgainstRequestV1,
} from "../../../shared/types/developer-remote-workspace";

const T1 = "2026-08-22T10:01:00.000Z";
const T4 = "2026-08-22T10:04:00.000Z";
const T5 = "2026-08-22T10:05:00.000Z";

function digest(char: string) {
  return {
    algorithm: "sha-256" as const,
    canonicalization: DEVELOPER_REMOTE_WORKSPACE_CANONICALIZATION,
    value: char.repeat(64),
  };
}

const PAYLOAD_REF: DeveloperEncryptedDataRefV1 & { dataKind: "instruction" } = {
  kind: "encrypted_data_ref",
  dataKind: "instruction",
  dataRef: "dref_instruction_1",
  digest: digest("b"),
  sizeBytes: 32,
  dataClass: "owner_private",
  encryption: "runtime_managed",
  ownerScope: "authenticated_owner",
  runtimeRef: DEVELOPER_WORKSPACE_ONLINE_MACHINE.runtimeRef,
  expiresAt: T5,
};

const INSTRUCTION: DeveloperInstructionV1 = {
  schemaVersion: DEVELOPER_REMOTE_WORKSPACE_SCHEMA_VERSION,
  contractType: "developer_instruction",
  instructionRef: "ins_1",
  actionRef: "action-1",
  agentId: "agent-1",
  machineRef: DEVELOPER_WORKSPACE_ONLINE_MACHINE.machineRef,
  deviceRef: DEVELOPER_WORKSPACE_ONLINE_MACHINE.deviceRef,
  runtimeRef: DEVELOPER_WORKSPACE_ONLINE_MACHINE.runtimeRef,
  workspaceRef: DEVELOPER_WORKSPACE_READY_SESSION.workspaceRef,
  sessionRef: DEVELOPER_WORKSPACE_READY_SESSION.sessionRef,
  adapterSessionRef: DEVELOPER_WORKSPACE_READY_SESSION.adapterSessionRef,
  adapterManifestRef: DEVELOPER_WORKSPACE_READY_SESSION.adapterManifestRef,
  expectedSessionVersion: DEVELOPER_WORKSPACE_READY_SESSION.sessionVersion,
  shellBindingRef: DEVELOPER_WORKSPACE_ONLINE_MACHINE.shellBindingRef,
  instructionSequence: 1,
  idempotencyKey: "idem_instruction_1",
  requestDigest: digest("3"),
  payloadRef: PAYLOAD_REF,
  userVisibleSummary: "Run tests",
  issuedAt: T1,
  expiresAt: T5,
};

function instructionFromRequest(body: unknown): DeveloperInstructionV1 {
  const request = body as {
    expectedSessionVersion: number;
    requestDigest: DeveloperInstructionV1["requestDigest"];
    payloadRef: DeveloperInstructionV1["payloadRef"];
    userVisibleSummary: string;
    issuedAt: string;
    expiresAt: string;
    idempotencyKey: string;
  };
  return {
    ...INSTRUCTION,
    expectedSessionVersion: request.expectedSessionVersion,
    requestDigest: request.requestDigest,
    payloadRef: request.payloadRef,
    userVisibleSummary: request.userVisibleSummary,
    issuedAt: request.issuedAt,
    expiresAt: request.expiresAt,
    idempotencyKey: request.idempotencyKey,
  };
}

const ACCEPTED_EVENT: DeveloperSessionEventV1 = {
  schemaVersion: DEVELOPER_REMOTE_WORKSPACE_SCHEMA_VERSION,
  contractType: "developer_session_event",
  eventRef: "evt_1",
  streamRef: "stream-1",
  instructionRef: INSTRUCTION.instructionRef,
  actionRef: INSTRUCTION.actionRef,
  sessionRef: INSTRUCTION.sessionRef,
  sessionVersion: INSTRUCTION.expectedSessionVersion,
  adapterSessionRef: INSTRUCTION.adapterSessionRef,
  sequence: 1,
  previousSequence: 0,
  cursor: { streamRef: "stream-1", sequence: 1 },
  occurredAt: T1,
  eventDigest: digest("e"),
  eventType: "accepted",
};

function approvalDecision(
  request: DeveloperApprovalRequestV1,
  decision: "approved" | "rejected" = "approved",
): DeveloperApprovalDecisionV1 {
  const base = {
    schemaVersion: DEVELOPER_REMOTE_WORKSPACE_SCHEMA_VERSION,
    contractType: "developer_approval_decision" as const,
    decisionRef: `decision-${request.approvalRef}`,
    approvalRef: request.approvalRef,
    approvalVersion: request.approvalVersion,
    previousStatus: "pending" as const,
    decisionSequence: 1 as const,
    instructionRef: request.instructionRef,
    actionRef: request.actionRef,
    sessionRef: request.sessionRef,
    sessionVersion: request.sessionVersion,
    adapterSessionRef: request.adapterSessionRef,
    adapterRequestRef: request.adapterRequestRef,
    requestDigest: request.requestDigest,
    instructionRequestDigest: request.instructionRequestDigest,
    toolArgumentsDigest: request.toolArgumentsDigest,
    workspaceScopeDigest: request.workspaceScopeDigest,
    decidedAt: T4,
    decisionDigest: digest("6"),
    authorityDecisionRef: {
      type: "authority_decision" as const,
      id: "authority-decision-1",
      version: 1,
      digest: digest("7"),
    },
  };
  if (decision === "rejected") {
    return {
      ...base,
      decision,
      resultingStatus: "rejected",
      decidedByRef: "principal-1",
      reasonCode: "owner_rejected",
    };
  }
  return {
    ...base,
    decision,
    resultingStatus: "approved",
    decidedByRef: "principal-1",
    grantScope: "once",
    grantExpiresAt: T5,
    authorityGrantRef: {
      type: "authority_grant",
      id: "authority-grant-1",
      version: 1,
      digest: digest("8"),
    },
    ...(request.requiresLocalConfirmation
      ? { localConfirmationRef: "local-confirmation-1" }
      : {}),
  };
}

const HANDOFF: DeveloperHandoffV1 = {
  schemaVersion: DEVELOPER_REMOTE_WORKSPACE_SCHEMA_VERSION,
  contractType: "developer_handoff",
  handoffRef: "hnd_1",
  handoffVersion: 1,
  ownerPrincipalRef: "principal-1",
  agentId: "agent-1",
  machineRef: DEVELOPER_WORKSPACE_ONLINE_MACHINE.machineRef,
  deviceRef: DEVELOPER_WORKSPACE_ONLINE_MACHINE.deviceRef,
  runtimeRef: DEVELOPER_WORKSPACE_ONLINE_MACHINE.runtimeRef,
  sessionRef: DEVELOPER_WORKSPACE_READY_SESSION.sessionRef,
  sessionVersion: DEVELOPER_WORKSPACE_READY_SESSION.sessionVersion,
  adapterSessionRef: DEVELOPER_WORKSPACE_READY_SESSION.adapterSessionRef,
  fromSurface: "web",
  toSurface: "mobile",
  target: { kind: "session" },
  oneTime: true,
  issuedAt: T1,
  expiresAt: T5,
  handoffDigest: digest("d"),
  status: "issued",
};

function ok(data: unknown) {
  return { success: true, data };
}

function mockTransport(
  handler: (
    req: DeveloperWorkspaceTransportRequest,
  ) =>
    | { status: number; json: unknown }
    | Promise<{ status: number; json: unknown }>,
): DeveloperWorkspaceTransport {
  return async (req) => handler(req);
}

describe("Developer workspace live client contract", () => {
  it("lists machines through /api/v1/developer via the /v1/developer client path and stable cursor", async () => {
    expect(DEVELOPER_WORKSPACE_API_PATHS.machines).toBe(
      "/v1/developer/machines",
    );
    const transport = mockTransport((req) => {
      expect(req.path).toBe("/v1/developer/machines");
      expect(req.query?.cursor).toBe("Y3Vyc29y");
      return {
        status: 200,
        json: ok({
          items: [DEVELOPER_WORKSPACE_ONLINE_MACHINE],
          nextCursor: "bmV4dA",
        }),
      };
    });
    const listed = await listDeveloperMachines(transport, {
      agentId: "agent-1",
      cursor: "Y3Vyc29y",
    });
    expect(listed.ok).toBe(true);
    if (listed.ok) {
      expect(listed.data.items).toHaveLength(1);
      expect(listed.data.nextCursor).toBe("bmV4dA");
    }
  });

  it("fails closed on unknown page fields, null items and version drift", async () => {
    const extra = await listDeveloperMachines(
      mockTransport(() => ({
        status: 200,
        json: ok({ items: [DEVELOPER_WORKSPACE_ONLINE_MACHINE], extra: true }),
      })),
    );
    expect(extra.ok).toBe(false);
    const nulled = await listDeveloperMachines(
      mockTransport(() => ({
        status: 200,
        json: ok(null),
      })),
    );
    expect(nulled.ok).toBe(false);
    const versioned = await listDeveloperMachines(
      mockTransport(() => ({
        status: 200,
        json: ok({
          items: [{ ...DEVELOPER_WORKSPACE_ONLINE_MACHINE, schemaVersion: 2 }],
        }),
      })),
    );
    expect(versioned.ok).toBe(false);
  });

  it("maps 404 and denied to the same non-enumerating unauthorized state", async () => {
    const missing = await listDeveloperMachines(
      mockTransport(() => ({
        status: 404,
        json: {
          success: false,
          error: { code: "not_found", reason: "not_found", retriable: false },
        },
      })),
    );
    const denied = await listDeveloperMachines(
      mockTransport(() => ({
        status: 403,
        json: {
          success: false,
          error: { code: "not_found", reason: "not_found", retriable: false },
        },
      })),
    );
    expect(missing).toEqual(denied);
    expect(missing.ok).toBe(false);
    if (missing.ok === false)
      expect(missing.state).toEqual({
        kind: "unauthorized",
        reason: "developer_not_found",
      });
  });

  it("runs instruction → approval → receipt without persisting plaintext", async () => {
    const calls: DeveloperWorkspaceTransportRequest[] = [];
    const transport = mockTransport((req) => {
      calls.push(req);
      if (req.path === DEVELOPER_WORKSPACE_API_PATHS.dataPlane) {
        expect(req.body).toEqual(
          expect.objectContaining({
            dataKind: "instruction",
            deviceRef: "device-1",
          }),
        );
        expect(JSON.stringify(req.body)).not.toContain("cat /etc/passwd");
        return { status: 200, json: ok(PAYLOAD_REF) };
      }
      if (
        req.path ===
        DEVELOPER_WORKSPACE_API_PATHS.sessionInstructions("session-1")
      ) {
        expect(
          (req.body as { payloadRef: { dataRef: string } }).payloadRef.dataRef,
        ).toBe("dref_instruction_1");
        expect((req.body as { prompt?: unknown }).prompt).toBeUndefined();
        return { status: 200, json: ok(instructionFromRequest(req.body)) };
      }
      throw new Error(`unexpected ${req.method} ${req.path}`);
    });
    const result = await submitDeveloperInstruction({
      transport,
      machine: DEVELOPER_WORKSPACE_ONLINE_MACHINE,
      workspaceRef: "workspace-1",
      session: DEVELOPER_WORKSPACE_READY_SESSION,
      userVisibleSummary: "Run tests",
      plaintext: "cat /etc/passwd && echo secret-token",
      now: T1,
      online: true,
      idempotency: createDeveloperWorkspaceIdempotencyStore(),
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.instruction?.instructionRef).toBe("ins_1");
    expect(JSON.stringify(result)).not.toContain("cat /etc/passwd");
    expect(calls).toHaveLength(2);
  });

  it("fails closed when the data-plane read-back is bound to another runtime", async () => {
    let instructionCalls = 0;
    const result = await submitDeveloperInstruction({
      transport: mockTransport((req) => {
        if (req.path === DEVELOPER_WORKSPACE_API_PATHS.dataPlane) {
          return {
            status: 200,
            json: ok({
              ...PAYLOAD_REF,
              runtimeRef: { ...PAYLOAD_REF.runtimeRef, id: "runtime-other" },
            }),
          };
        }
        instructionCalls += 1;
        return { status: 200, json: ok(INSTRUCTION) };
      }),
      machine: DEVELOPER_WORKSPACE_ONLINE_MACHINE,
      session: DEVELOPER_WORKSPACE_READY_SESSION,
      userVisibleSummary: "Run tests",
      plaintext: "private instruction",
      now: T1,
      online: true,
      idempotency: createDeveloperWorkspaceIdempotencyStore(),
    });
    expect(result).toEqual({
      ok: false,
      state: {
        kind: "error",
        reason: "live_api_failed_closed",
        retryable: false,
      },
    });
    expect(instructionCalls).toBe(0);
  });

  it("refuses offline mutation queues and flag-off executable CTAs", () => {
    expect(queueDeveloperWorkspaceMutation()).toEqual({
      ok: false,
      reason: "offline_queue_forbidden",
    });
    expect(
      evaluateDeveloperLiveMutationCta({
        kind: "send",
        flagEnabled: false,
        online: true,
        machine: DEVELOPER_WORKSPACE_ONLINE_MACHINE,
        session: DEVELOPER_WORKSPACE_READY_SESSION,
      }),
    ).toEqual({ visible: false, enabled: false, reason: "feature_disabled" });
    expect(
      evaluateDeveloperLiveMutationCta({
        kind: "send",
        flagEnabled: true,
        online: false,
        machine: DEVELOPER_WORKSPACE_ONLINE_MACHINE,
        session: DEVELOPER_WORKSPACE_READY_SESSION,
      }).enabled,
    ).toBe(false);
  });

  it("fresh-fetches approval from a push ref and rejects prompt/path/token payloads", async () => {
    expect(
      parseDeveloperWorkspacePushPayload({ approvalRef: "approval-1" }),
    ).toEqual({ ok: true, approvalRef: "approval-1" });
    expect(
      resolveDeveloperApprovalPushDestination({ approvalRef: "approval-1" }),
    ).toEqual({
      ok: true,
      root: "Main",
      tab: "Work",
      screen: "WorkApprovals",
      params: { approvalRef: "approval-1", source: "push" },
    });
    expect(
      parseDeveloperWorkspacePushPayload({
        approvalRef: "approval-1",
        type: "approval",
      }).ok,
    ).toBe(false);
    expect(
      parseDeveloperWorkspacePushPayload({
        approvalRef: "approval-1",
        agentId: "agent-1",
      }).ok,
    ).toBe(false);
    expect(
      parseDeveloperWorkspacePushPayload({
        approvalRef: "approval-1",
        prompt: "rm -rf /",
      }).ok,
    ).toBe(false);
    expect(
      parseDeveloperWorkspacePushPayload({
        approvalRef: "approval-1",
        token: "secret",
      }).ok,
    ).toBe(false);
    const snapshot = await loadDeveloperWorkspaceSnapshot({
      agentId: "agent-1",
      flagEnabled: true,
      mode: "api",
      transport: mockTransport((req) => {
        if (req.path === DEVELOPER_WORKSPACE_API_PATHS.machines)
          return {
            status: 200,
            json: ok({ items: [DEVELOPER_WORKSPACE_ONLINE_MACHINE] }),
          };
        if (
          req.path ===
          DEVELOPER_WORKSPACE_API_PATHS.machineSessions("machine-1")
        )
          return {
            status: 200,
            json: ok({ items: [DEVELOPER_WORKSPACE_READY_SESSION] }),
          };
        if (req.path === DEVELOPER_WORKSPACE_API_PATHS.approvals) {
          expect(req.query?.approvalRef).toBeUndefined();
          return {
            status: 200,
            json: ok({ items: [DEVELOPER_WORKSPACE_PENDING_APPROVAL] }),
          };
        }
        throw new Error(req.path);
      }),
    });
    expect(snapshot.approvals.kind).toBe("ready");
  });

  it("fails closed on wrong digest, tenant or runtime in the decision body", async () => {
    const wrongDigest = await decideDeveloperApproval({
      transport: mockTransport(() => ({
        status: 200,
        json: ok(DEVELOPER_WORKSPACE_PENDING_APPROVAL),
      })),
      approval: DEVELOPER_WORKSPACE_PENDING_APPROVAL,
      decision: "approved",
      requestDigest: digest("z"),
      online: true,
      now: T1,
      idempotency: createDeveloperWorkspaceIdempotencyStore(),
    });
    expect(wrongDigest).toEqual({
      ok: false,
      state: {
        kind: "error",
        reason: "request_digest_mismatch",
        retryable: false,
      },
    });

    const identity = createDeveloperWorkspaceAuthTransport({
      token: "jwt",
      fetchImpl: (async () => ({
        status: 200,
        text: async () => "{}",
      })) as unknown as typeof fetch,
    });
    await expect(
      identity.request({
        method: "POST",
        path: "/v1/developer/approvals/approval-1/decisions",
        body: { tenantRef: "other", expectedApprovalVersion: 1 },
        idempotencyKey: "x",
      }),
    ).rejects.toThrow(/identity/);
  });

  it("accepts only an exact non-L3 decision bound to the fresh request", async () => {
    const exact = await decideDeveloperApproval({
      transport: mockTransport(() => ({
        status: 200,
        json: ok(approvalDecision(DEVELOPER_WORKSPACE_PENDING_APPROVAL)),
      })),
      approval: DEVELOPER_WORKSPACE_PENDING_APPROVAL,
      decision: "approved",
      online: true,
      now: T1,
      idempotency: createDeveloperWorkspaceIdempotencyStore(),
    });
    expect(exact.ok).toBe(true);
    if (exact.ok) {
      expect(exact.awaitingDesktopConfirmation).toBe(false);
      expect(exact.approval).toEqual(
        approvalDecision(DEVELOPER_WORKSPACE_PENDING_APPROVAL),
      );
    }

    const wrongSession = await decideDeveloperApproval({
      transport: mockTransport(() => ({
        status: 200,
        json: ok({
          ...approvalDecision(DEVELOPER_WORKSPACE_PENDING_APPROVAL),
          sessionRef: "session-other",
        }),
      })),
      approval: DEVELOPER_WORKSPACE_PENDING_APPROVAL,
      decision: "approved",
      online: true,
      now: T1,
      idempotency: createDeveloperWorkspaceIdempotencyStore(),
    });
    expect(wrongSession).toEqual({
      ok: false,
      state: {
        kind: "error",
        reason: "live_api_failed_closed",
        retryable: false,
      },
    });
  });

  it("runs instruction → approval → authoritative Receipt as one ref lineage", async () => {
    const approval: DeveloperApprovalRequestV1 = {
      ...DEVELOPER_WORKSPACE_PENDING_APPROVAL,
      instructionRef: INSTRUCTION.instructionRef,
    };
    const completeReceipt = {
      schemaVersion: DEVELOPER_REMOTE_WORKSPACE_SCHEMA_VERSION,
      contractType: "developer_receipt_projection",
      actionRef: INSTRUCTION.actionRef,
      instructionRef: INSTRUCTION.instructionRef,
      sessionRef: INSTRUCTION.sessionRef,
      instructionState: "completed",
      actionBinding: { status: "bound" },
      layers: {
        execution: { state: "succeeded" },
        outcome: { state: "recorded" },
        settlement: { state: "absent" },
        verification: { state: "absent" },
        remedy: { state: "absent" },
      },
      refs: {
        actionRef: INSTRUCTION.actionRef,
        instructionRef: INSTRUCTION.instructionRef,
        terminalResultRef: "terminal-1",
        actionReceiptRef: "receipt-1",
      },
      completed: true,
    };
    let createdInstruction: DeveloperInstructionV1 | null = null;
    const transport = mockTransport((req) => {
      if (req.path === DEVELOPER_WORKSPACE_API_PATHS.dataPlane) {
        return { status: 200, json: ok(PAYLOAD_REF) };
      }
      if (
        req.path ===
        DEVELOPER_WORKSPACE_API_PATHS.sessionInstructions("session-1")
      ) {
        createdInstruction = instructionFromRequest(req.body);
        return { status: 200, json: ok(createdInstruction) };
      }
      if (
        req.path ===
        DEVELOPER_WORKSPACE_API_PATHS.approvalDecision(approval.approvalRef)
      ) {
        return { status: 200, json: ok(approvalDecision(approval)) };
      }
      if (req.path === DEVELOPER_WORKSPACE_API_PATHS.session("session-1")) {
        return { status: 200, json: ok(DEVELOPER_WORKSPACE_READY_SESSION) };
      }
      if (
        req.path ===
        DEVELOPER_WORKSPACE_API_PATHS.instruction(INSTRUCTION.instructionRef)
      ) {
        return { status: 200, json: ok(createdInstruction) };
      }
      if (
        req.path ===
        DEVELOPER_WORKSPACE_API_PATHS.instructionEvents(
          INSTRUCTION.instructionRef,
        )
      ) {
        return { status: 200, json: ok({ items: [ACCEPTED_EVENT] }) };
      }
      if (
        req.path ===
        DEVELOPER_WORKSPACE_API_PATHS.receipts(INSTRUCTION.actionRef)
      ) {
        return { status: 200, json: ok(completeReceipt) };
      }
      throw new Error(req.path);
    });
    const idempotency = createDeveloperWorkspaceIdempotencyStore();
    const submitted = await submitDeveloperInstruction({
      transport,
      machine: DEVELOPER_WORKSPACE_ONLINE_MACHINE,
      session: DEVELOPER_WORKSPACE_READY_SESSION,
      userVisibleSummary: "Run tests",
      plaintext: "private instruction body",
      now: T1,
      online: true,
      idempotency,
    });
    expect(submitted.ok).toBe(true);
    const decided = await decideDeveloperApproval({
      transport,
      approval,
      decision: "approved",
      online: true,
      now: T1,
      idempotency,
    });
    expect(decided.ok).toBe(true);
    const reconciled = await reconcileDeveloperInstruction({
      transport,
      sessionRef: INSTRUCTION.sessionRef,
      instructionRef: INSTRUCTION.instructionRef,
      actionRef: INSTRUCTION.actionRef,
      agentId: INSTRUCTION.agentId,
    });
    expect(reconciled.completed).toBe(true);
    expect(reconciled.receipt.ok).toBe(true);
  });

  it("replays a lost instruction response with the same idempotency key", async () => {
    let attempts = 0;
    let uploads = 0;
    const instructionBodies: unknown[] = [];
    const instructionKeys: Array<string | undefined> = [];
    const store = createDeveloperWorkspaceIdempotencyStore();
    const transport = mockTransport((req) => {
      if (req.path === DEVELOPER_WORKSPACE_API_PATHS.dataPlane) {
        uploads += 1;
        return { status: 200, json: ok(PAYLOAD_REF) };
      }
      if (
        req.path ===
        DEVELOPER_WORKSPACE_API_PATHS.sessionInstructions("session-1")
      ) {
        attempts += 1;
        instructionBodies.push(req.body);
        instructionKeys.push(req.idempotencyKey);
        if (attempts === 1)
          throw Object.assign(new Error("lost"), { code: "ECONNRESET" });
        return { status: 200, json: ok(instructionFromRequest(req.body)) };
      }
      throw new Error(req.path);
    });
    const first = await submitDeveloperInstruction({
      transport,
      machine: DEVELOPER_WORKSPACE_ONLINE_MACHINE,
      session: DEVELOPER_WORKSPACE_READY_SESSION,
      userVisibleSummary: "Run tests",
      plaintext: "do the work",
      now: T1,
      online: true,
      idempotency: store,
    });
    expect(first.ok).toBe(false);
    const second = await submitDeveloperInstruction({
      transport,
      machine: DEVELOPER_WORKSPACE_ONLINE_MACHINE,
      session: DEVELOPER_WORKSPACE_READY_SESSION,
      userVisibleSummary: "Run tests",
      plaintext: "do the work",
      now: T1,
      online: true,
      idempotency: store,
    });
    expect(second.ok).toBe(true);
    expect(attempts).toBe(2);
    expect(uploads).toBe(1);
    expect(instructionBodies[1]).toEqual(instructionBodies[0]);
    expect(instructionKeys[1]).toBe(instructionKeys[0]);
  });

  it("keeps L3 as waiting-desktop and never optimistic completed", async () => {
    const l3: DeveloperApprovalRequestV1 = {
      ...DEVELOPER_WORKSPACE_PENDING_APPROVAL,
      operationKind: "deploy",
      risk: "L3",
      sideEffectClass: "external_write",
      requestedGrantScopes: ["once"],
      requiresLocalConfirmation: true,
    };
    expect(
      validateDeveloperApprovalDecisionAgainstRequestV1(
        approvalDecision(l3),
        l3,
      ),
    ).toEqual({ valid: true, errors: [] });
    const decided = await decideDeveloperApproval({
      transport: mockTransport(() => ({
        status: 200,
        json: ok(approvalDecision(l3)),
      })),
      approval: l3,
      decision: "approved",
      online: true,
      now: T1,
      idempotency: createDeveloperWorkspaceIdempotencyStore(),
    });
    expect(decided.ok).toBe(true);
    if (decided.ok) {
      expect(decided.awaitingDesktopConfirmation).toBe(true);
      expect(decided.completed).toBe(false);
      expect(decided.approval).toEqual(l3);
    }
    const timeout = await decideDeveloperApproval({
      transport: mockTransport(() => {
        throw Object.assign(new Error("timeout"), { code: "offline" });
      }),
      approval: l3,
      decision: "approved",
      online: false,
      now: T1,
      idempotency: createDeveloperWorkspaceIdempotencyStore(),
    });
    expect(timeout.ok).toBe(false);
    if (timeout.ok === false) expect(timeout.state.kind).toBe("unknown");
  });

  it("shows completed only after Backend receipt read-back", async () => {
    const incomplete = {
      schemaVersion: DEVELOPER_REMOTE_WORKSPACE_SCHEMA_VERSION,
      contractType: "developer_receipt_projection",
      actionRef: "action-1",
      instructionRef: "ins_1",
      sessionRef: "session-1",
      instructionState: "claimed",
      actionBinding: { status: "bound" },
      layers: {
        execution: { state: "recorded" },
        outcome: { state: "absent" },
        settlement: { state: "absent" },
        verification: { state: "absent" },
        remedy: { state: "absent" },
      },
      refs: {
        actionRef: "action-1",
        instructionRef: "ins_1",
        terminalResultRef: null,
        actionReceiptRef: null,
      },
      completed: false,
    };
    const complete = {
      ...incomplete,
      instructionState: "completed",
      layers: {
        execution: { state: "succeeded" },
        outcome: { state: "recorded" },
        settlement: { state: "absent" },
        verification: { state: "absent" },
        remedy: { state: "absent" },
      },
      refs: {
        actionRef: "action-1",
        instructionRef: "ins_1",
        terminalResultRef: "terminal-1",
        actionReceiptRef: "receipt-1",
      },
      completed: true,
    };
    expect(validateReceiptProjection(incomplete).valid).toBe(true);
    expect(presentDeveloperReceipt(incomplete as never).completed).toBe(false);
    expect(presentDeveloperReceipt(complete as never).completed).toBe(true);
    expect(validateReceiptProjection({ ...complete, extra: true }).valid).toBe(
      false,
    );
    expect(
      validateReceiptProjection({
        ...complete,
        layers: {
          ...complete.layers,
          execution: { state: "succeeded", extra: true },
        },
      }).valid,
    ).toBe(false);

    const reconciled = await reconcileDeveloperInstruction({
      transport: mockTransport((req) => {
        if (req.path.endsWith("/sessions/session-1"))
          return { status: 200, json: ok(DEVELOPER_WORKSPACE_READY_SESSION) };
        if (req.path.endsWith("/instructions/ins_1") && req.method === "GET")
          return { status: 200, json: ok(INSTRUCTION) };
        if (req.path.endsWith("/events"))
          return { status: 200, json: ok({ items: [ACCEPTED_EVENT] }) };
        if (req.path.endsWith("/receipts/action-1"))
          return { status: 200, json: ok(complete) };
        throw new Error(req.path);
      }),
      sessionRef: "session-1",
      instructionRef: "ins_1",
      actionRef: "action-1",
      agentId: "agent-1",
    });
    expect(reconciled.completed).toBe(true);
  });

  it("binds handoff accept to the selected verified machine and JCS digest headers", async () => {
    const accepted = await acceptDeveloperHandoff({
      transport: mockTransport((req) => {
        expect(req.digestHeaders).toBe(true);
        expect((req.body as { targetRuntimeId: string }).targetRuntimeId).toBe(
          "runtime-1",
        );
        expect(
          (req.body as { ownerUserId?: unknown }).ownerUserId,
        ).toBeUndefined();
        return {
          status: 200,
          json: ok({
            ...HANDOFF,
            status: "consumed",
            consumedAt: T4,
            consumerSessionRef: "session-1",
            consumptionReceiptRef: {
              type: "evidence",
              id: "hcr_1",
              version: 1,
              digest: digest("f"),
            },
          }),
        };
      }),
      handoff: HANDOFF,
      targetMachine: DEVELOPER_WORKSPACE_ONLINE_MACHINE,
      consumerSession: DEVELOPER_WORKSPACE_READY_SESSION,
      online: true,
      idempotency: createDeveloperWorkspaceIdempotencyStore(),
    });
    expect(accepted.ok).toBe(true);
  });

  it("keeps cancel/reconcile query-first and forbids sensitive persistence", async () => {
    const cancelled = await cancelDeveloperInstruction({
      transport: mockTransport(() => ({ status: 200, json: ok(INSTRUCTION) })),
      instructionRef: "ins_1",
      expectedVersion: 1,
      online: true,
      idempotency: createDeveloperWorkspaceIdempotencyStore(),
    });
    expect(cancelled.ok).toBe(true);
    expect(assertDeveloperWorkspaceSafeToPersist({ prompt: "hello" }).ok).toBe(
      false,
    );
    expect(
      assertDeveloperWorkspaceSafeToPersist({ approvalRef: "approval-1" }).ok,
    ).toBe(true);
    expect(developerWorkspaceCacheKey(["prompt", "secret"]).ok).toBe(false);
    expect(developerWorkspaceAnalyticsProps({ token: "abc" }).ok).toBe(false);
    expect(developerWorkspaceCacheKey(["session-1", "approval-1"]).ok).toBe(
      true,
    );
    expect(
      validateDeveloperWorkspaceControlSummary("Run selected tests").ok,
    ).toBe(true);
    expect(
      validateDeveloperWorkspaceControlSummary("Run C:\\Users\\owner\\repo").ok,
    ).toBe(false);
    expect(
      validateDeveloperWorkspaceControlSummary("token=super-secret").ok,
    ).toBe(false);
    expect(
      evaluateDeveloperLiveMutationCta({
        kind: "create_session",
        flagEnabled: true,
        online: true,
        machine: DEVELOPER_WORKSPACE_ONLINE_MACHINE,
        workspaceRef: "workspace-1",
        expectedMachineVersion: undefined,
      }),
    ).toEqual({
      visible: false,
      enabled: false,
      reason: "machine_version_unpublished",
    });
    expect(
      evaluateDeveloperLiveMutationCta({
        kind: "cancel",
        flagEnabled: true,
        online: true,
        session: DEVELOPER_WORKSPACE_READY_SESSION,
        expectedInstructionVersion: undefined,
      }),
    ).toEqual({
      visible: true,
      enabled: false,
      reason: "instruction_version_unpublished",
    });
    expect(
      evaluateDeveloperLiveMutationCta({
        kind: "send",
        flagEnabled: true,
        online: true,
        session: {
          ...DEVELOPER_WORKSPACE_READY_SESSION,
          capabilities: {
            ...DEVELOPER_WORKSPACE_READY_SESSION.capabilities,
            canPrompt: false,
          },
        },
        machine: DEVELOPER_WORKSPACE_ONLINE_MACHINE,
      }).visible,
    ).toBe(false);
  });
});
