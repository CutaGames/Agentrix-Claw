/**
 * Cursor ACP local development spike adapter.
 * DEVELOPMENT_SPIKE_ONLY. Injectable transport only; no vendor process.
 */

import {
  DEVELOPER_REMOTE_WORKSPACE_SCHEMA_VERSION,
  evaluateDeveloperApprovalDecisionReplayV1,
  validateDeveloperAdapterCapabilityV1,
  validateDeveloperApprovalDecisionAgainstRequestV1,
  validateDeveloperApprovalDecisionV1,
  validateDeveloperApprovalRequestV1,
  validateDeveloperInstructionAgainstShellCommandV1,
  validateDeveloperInstructionV1,
  validateDeveloperSessionEventTransitionV1,
  validateDeveloperSessionEventV1,
  validateDeveloperSessionSummaryV1,
  validateDeveloperTerminalResultAgainstEventV1,
  validateDeveloperTerminalResultV1,
  type DeveloperApprovalDecisionV1,
  type DeveloperApprovalRequestV1,
  type DeveloperInstructionV1,
  type DeveloperSessionEventV1,
  type DeveloperSessionSummaryV1,
  type DeveloperTerminalResultV1,
} from "../../../../shared/types/developer-remote-workspace.ts";
import {
  CURSOR_ACP_AUTH_METHOD_ID,
  CURSOR_ACP_CLIENT_CAPABILITIES,
  CURSOR_ACP_CLIENT_INFO,
  CURSOR_ACP_PROTOCOL_VERSION,
  CURSOR_ACP_SPIKE_DEFAULT_ENABLED,
  CURSOR_ACP_SPIKE_ENVIRONMENT,
  CURSOR_ACP_WORKSPACE_STAND_IN,
} from "./constants";
import {
  digestRefOf,
  lookLikeAbsolutePath,
  spikeEnvelope,
} from "./control-plane";
import { CursorAcpJsonRpcError } from "./json-rpc";
import {
  CURSOR_ACP_SPIKE_CAPABILITY_SHEET,
  CURSOR_ACP_SPIKE_MANIFEST,
} from "./manifest";
import { CURSOR_ACP_OFFICIAL_CAPABILITY_RECORD } from "./official-capability";
import { createEncryptedDataRef, SPIKE_JOURNAL_RECORD_REF } from "./fixtures";
import {
  assertAgentNotificationMethod,
  assertAgentRequestMethod,
  assertClientNotificationMethod,
  assertClientRequestMethod,
  cancelledPermissionOutcome,
  parseAuthenticateResult,
  parseInitializeResult,
  parseListSessionsResult,
  parseLoadSessionResult,
  parseNewSessionResult,
  parsePermissionRequest,
  parsePromptResult,
  parseSessionUpdate,
  selectedPermissionOutcome,
} from "./protocol";
import type {
  CursorAcpAuthenticateResult,
  CursorAcpInitializeResult,
  CursorAcpQueryPayload,
  CursorAcpSessionPayload,
  CursorAcpSpikeCapabilitySheet,
  CursorAcpSpikeConfig,
  CursorAcpSpikeEnvelope,
  CursorAcpSpikeEventPayload,
  CursorAcpOfficialCapabilityRecord,
} from "./types";
import type { DeveloperAdapterCapabilityV1 } from "../../../../shared/types/developer-remote-workspace.ts";

const OPAQUE_REF = /^[A-Za-z0-9][A-Za-z0-9._~-]{0,127}$/;

type Phase = "idle" | "initialized" | "authenticated" | "session_ready";

interface InstructionRuntime {
  instruction: DeveloperInstructionV1;
  streamRef: string;
  events: DeveloperSessionEventV1[];
  terminal?: DeveloperTerminalResultV1;
  pendingApproval?: {
    request: DeveloperApprovalRequestV1;
    resolve: (value: unknown) => void;
    reject: (error: Error) => void;
  };
  decidedApproval?: DeveloperApprovalDecisionV1;
  incoming: Array<CursorAcpSpikeEnvelope<CursorAcpSpikeEventPayload>>;
  waiters: Array<() => void>;
  promptFinished: boolean;
  promptResult?: unknown;
  promptError?: Error;
}

export class CursorAcpLocalDevelopmentSpike {
  private phase: Phase = "idle";
  private adapterSessionRef: string | undefined;
  private sessionRef: string | undefined;
  private sessionVersion = 1;
  private projectionSequence = 1;
  private clockMs = Date.parse("2026-08-22T12:02:00.000Z");
  private failClosedReason: string | undefined;
  private readonly runtimes = new Map<string, InstructionRuntime>();
  private readonly idempotency = new Map<string, string>();
  private activeInstructionRef: string | undefined;

  constructor(private readonly config: CursorAcpSpikeConfig) {
    this.config.transport.setIncomingRequestHandler(async (method, params) => {
      return this.onAgentRequest(method, params);
    });
    this.config.transport.setIncomingNotificationHandler((method, params) => {
      this.onAgentNotification(method, params);
    });
  }

  manifest(): CursorAcpSpikeEnvelope<DeveloperAdapterCapabilityV1> {
    const validation = validateDeveloperAdapterCapabilityV1(
      CURSOR_ACP_SPIKE_MANIFEST,
    );
    if (!validation.valid) {
      return this.closed("unknown_schema");
    }
    return this.ok(CURSOR_ACP_SPIKE_MANIFEST);
  }

  officialCapabilityRecord(): CursorAcpSpikeEnvelope<CursorAcpOfficialCapabilityRecord> {
    return this.ok(CURSOR_ACP_OFFICIAL_CAPABILITY_RECORD);
  }

  spikeCapabilitySheet(): CursorAcpSpikeEnvelope<CursorAcpSpikeCapabilitySheet> {
    return this.ok(CURSOR_ACP_SPIKE_CAPABILITY_SHEET);
  }

  async initialize(): Promise<
    CursorAcpSpikeEnvelope<CursorAcpInitializeResult>
  > {
    try {
      const blocked = this.preflight("initialize", "idle");
      if (blocked) return blocked;
      const result = parseInitializeResult(
        await this.clientRequest("initialize", {
          protocolVersion: CURSOR_ACP_PROTOCOL_VERSION,
          clientCapabilities: CURSOR_ACP_CLIENT_CAPABILITIES,
          clientInfo: CURSOR_ACP_CLIENT_INFO,
        }),
      );
      if (this.failClosedReason) return this.closed(this.failClosedReason);
      this.phase = "initialized";
      return this.ok(result);
    } catch (error) {
      return this.closed(codeOf(error));
    }
  }

  async authenticate(): Promise<
    CursorAcpSpikeEnvelope<CursorAcpAuthenticateResult>
  > {
    try {
      const blocked = this.preflight("authenticate", "initialized");
      if (blocked) return blocked;
      parseAuthenticateResult(
        await this.clientRequest("authenticate", {
          methodId: CURSOR_ACP_AUTH_METHOD_ID,
        }),
      );
      if (this.failClosedReason) return this.closed(this.failClosedReason);
      this.phase = "authenticated";
      return this.ok({ authMethodId: CURSOR_ACP_AUTH_METHOD_ID });
    } catch (error) {
      return this.closed(codeOf(error));
    }
  }

  async listSessions(): Promise<
    CursorAcpSpikeEnvelope<CursorAcpSessionPayload[]>
  > {
    try {
      const blocked = this.preflight("session/list", "authenticated");
      if (blocked) return blocked;
      const listed = parseListSessionsResult(
        await this.clientRequest("session/list", {}),
      );
      if (this.failClosedReason) return this.closed(this.failClosedReason);
      const sessions = listed.sessionIds.map((sessionId, index) => {
        this.assertOpaque(sessionId);
        return this.sessionSummary({
          sessionRef: `listed-${sessionId}`,
          adapterSessionRef: sessionId,
          state: "available",
          resumeDisposition: "resumable",
          projectionSequence: index + 1,
        });
      });
      for (const session of sessions) {
        this.assertValid(validateDeveloperSessionSummaryV1(session));
      }
      return this.ok(sessions);
    } catch (error) {
      return this.closed(codeOf(error));
    }
  }

  async createSession(): Promise<
    CursorAcpSpikeEnvelope<CursorAcpSessionPayload>
  > {
    try {
      const blocked = this.preflight("session/new", "authenticated");
      if (blocked) return blocked;
      const created = parseNewSessionResult(
        await this.clientRequest("session/new", {
          cwd: CURSOR_ACP_WORKSPACE_STAND_IN,
          mcpServers: [],
        }),
      );
      if (this.failClosedReason) return this.closed(this.failClosedReason);
      this.assertOpaque(created.sessionId);
      this.bindSession(created.sessionId);
      this.phase = "session_ready";
      const session = this.sessionSummary({
        sessionRef: this.requireSessionRef(),
        adapterSessionRef: created.sessionId,
        state: "ready",
      });
      this.assertValid(validateDeveloperSessionSummaryV1(session));
      return this.ok(session);
    } catch (error) {
      return this.closed(codeOf(error));
    }
  }

  async loadSession(input: {
    adapterSessionRef: string;
  }): Promise<CursorAcpSpikeEnvelope<CursorAcpSessionPayload>> {
    try {
      const blocked = this.preflight("session/load", "authenticated");
      if (blocked) return blocked;
      this.assertOpaque(input.adapterSessionRef);
      parseLoadSessionResult(
        await this.clientRequest("session/load", {
          sessionId: input.adapterSessionRef,
          cwd: CURSOR_ACP_WORKSPACE_STAND_IN,
          mcpServers: [],
        }),
      );
      if (this.failClosedReason) return this.closed(this.failClosedReason);
      this.bindSession(input.adapterSessionRef);
      this.phase = "session_ready";
      const session = this.sessionSummary({
        sessionRef: this.requireSessionRef(),
        adapterSessionRef: input.adapterSessionRef,
        state: "ready",
      });
      this.assertValid(validateDeveloperSessionSummaryV1(session));
      return this.ok(session);
    } catch (error) {
      return this.closed(codeOf(error));
    }
  }

  async *prompt(
    instruction: DeveloperInstructionV1,
  ): AsyncGenerator<CursorAcpSpikeEnvelope<CursorAcpSpikeEventPayload>> {
    try {
      const blocked = this.preflightPrompt(instruction);
      if (blocked) {
        yield blocked;
        return;
      }
      const runtime = this.createRuntime(instruction);
      this.activeInstructionRef = instruction.instructionRef;
      yield this.ok({
        kind: "session_event",
        event: this.appendEvent(runtime, "accepted"),
      });
      yield this.ok({
        kind: "session_event",
        event: this.appendEvent(runtime, "claimed", {
          shellCommandJournalRef: SPIKE_JOURNAL_RECORD_REF,
        }),
      });
      const promptPromise = this.clientRequest("session/prompt", {
        sessionId: this.adapterSessionRef,
        prompt: [{ type: "text", text: instruction.payloadRef.dataRef }],
      })
        .then((result) => {
          runtime.promptResult = result;
          runtime.promptFinished = true;
          this.wake(runtime);
        })
        .catch((error: unknown) => {
          runtime.promptError =
            error instanceof Error ? error : new Error("prompt failed");
          runtime.promptFinished = true;
          this.wake(runtime);
        });
      void promptPromise;
      while (!runtime.promptFinished || runtime.incoming.length > 0) {
        if (runtime.incoming.length === 0 && !runtime.promptFinished) {
          await new Promise<void>((resolve) => {
            runtime.waiters.push(resolve);
          });
        }
        while (runtime.incoming.length > 0) {
          const next = runtime.incoming.shift();
          if (!next) break;
          yield next;
          if (next.outcome === "fail_closed") return;
        }
      }
      if (this.failClosedReason) {
        yield this.closed(this.failClosedReason);
        return;
      }
      if (runtime.promptError) {
        yield this.closed(codeOf(runtime.promptError));
        return;
      }
      parsePromptResult(runtime.promptResult);
      if (runtime.terminal) {
        yield this.closed("terminal_rewrite");
        return;
      }
      yield this.ok(this.finishUnknown(runtime));
    } catch (error) {
      yield this.closed(codeOf(error));
    }
  }

  async decide(
    decision: DeveloperApprovalDecisionV1,
  ): Promise<CursorAcpSpikeEnvelope<DeveloperApprovalDecisionV1>> {
    try {
      if (!this.enabled()) return this.unavailable("adapter_default_off");
      if (this.failClosedReason) return this.closed(this.failClosedReason);
      const runtime = this.activeRuntime();
      if (!runtime) {
        return this.closed("approval_not_pending");
      }
      if (runtime.decidedApproval) {
        if (
          evaluateDeveloperApprovalDecisionReplayV1(
            runtime.decidedApproval,
            decision,
          ) === "conflict"
        ) {
          return this.closed("terminal_rewrite");
        }
        return this.ok(runtime.decidedApproval);
      }
      const pending = runtime.pendingApproval;
      if (!pending) {
        return this.closed("approval_not_pending");
      }
      this.assertValid(validateDeveloperApprovalDecisionV1(decision));
      this.assertValid(
        validateDeveloperApprovalDecisionAgainstRequestV1(
          decision,
          pending.request,
        ),
      );
      const outcome = this.permissionOutcome(decision, pending.request);
      runtime.decidedApproval = decision;
      runtime.pendingApproval = undefined;
      pending.resolve(outcome);
      if (decision.decision === "approved") {
        this.push(
          runtime,
          this.ok({
            kind: "session_event",
            event: this.appendEvent(runtime, "running", {
              executionRef: `execution-${runtime.instruction.instructionRef}`,
            }),
          }),
        );
      }
      return this.ok(decision);
    } catch (error) {
      return spikeEnvelope<DeveloperApprovalDecisionV1>(
        "fail_closed",
        this.enabled(),
        undefined,
        codeOf(error),
      );
    }
  }

  async cancel(input: {
    instructionRef: string;
  }): Promise<CursorAcpSpikeEnvelope<{ cancelled: true; queryOnly: true }>> {
    if (!this.enabled()) return this.unavailable("adapter_default_off");
    if (this.failClosedReason) return this.closed(this.failClosedReason);
    const runtime = this.runtimes.get(input.instructionRef);
    if (!runtime) return this.unavailable("instruction_not_found");
    if (runtime.terminal) {
      return this.closed("replay_forbidden");
    }
    if (runtime.pendingApproval) {
      runtime.pendingApproval.resolve(cancelledPermissionOutcome());
      runtime.pendingApproval = undefined;
    }
    await this.clientNotify("session/cancel", {
      sessionId: this.adapterSessionRef,
    });
    return this.ok({ cancelled: true, queryOnly: true });
  }

  async query(input: {
    instructionRef: string;
  }): Promise<CursorAcpSpikeEnvelope<CursorAcpQueryPayload>> {
    if (!this.enabled()) return this.unavailable("adapter_default_off");
    const runtime = this.runtimes.get(input.instructionRef);
    if (!runtime) return this.unavailable("instruction_not_found");
    return this.ok({
      instructionRef: input.instructionRef,
      events: runtime.events,
      ...(runtime.terminal ? { terminal: runtime.terminal } : {}),
    });
  }

  private requireSessionRef(): string {
    if (!this.sessionRef) {
      throw new CursorAcpJsonRpcError("unknown_schema", "session ref missing");
    }
    return this.sessionRef;
  }

  private bindSession(adapterSessionRef: string): void {
    this.adapterSessionRef = adapterSessionRef;
    if (adapterSessionRef === this.config.binding.session.adapterSessionRef) {
      this.sessionRef = this.config.binding.session.sessionRef;
      this.sessionVersion = this.config.binding.session.sessionVersion;
      return;
    }
    this.sessionRef = `local-${adapterSessionRef}`;
    this.sessionVersion = 1;
  }

  private enabled(): boolean {
    return this.config.enabled === true;
  }

  private now(): string {
    if (this.config.now) return this.config.now();
    const value = new Date(this.clockMs).toISOString();
    this.clockMs += 1000;
    return value;
  }

  private preflight(
    method: string,
    required: Phase | "authenticated",
  ): CursorAcpSpikeEnvelope<never> | undefined {
    if (this.config.environment !== CURSOR_ACP_SPIKE_ENVIRONMENT) {
      return this.closed("environment_not_local_test");
    }
    if (!this.enabled()) return this.unavailable("adapter_default_off");
    if (this.failClosedReason) return this.closed(this.failClosedReason);
    if (required === "idle") {
      if (this.phase !== "idle") return this.closed("out_of_order");
      return undefined;
    }
    const order: Phase[] = [
      "idle",
      "initialized",
      "authenticated",
      "session_ready",
    ];
    const needed = required === "authenticated" ? "authenticated" : required;
    if (order.indexOf(this.phase) < order.indexOf(needed)) {
      return this.closed("out_of_order");
    }
    void method;
    return undefined;
  }

  private preflightPrompt(
    instruction: DeveloperInstructionV1,
  ): CursorAcpSpikeEnvelope<CursorAcpSpikeEventPayload> | undefined {
    const blocked = this.preflight("session/prompt", "session_ready");
    if (blocked) return blocked;
    if (instruction.workspaceRef !== this.config.workspaceRef) {
      return this.closed("workspace_mismatch");
    }
    if (
      this.config.binding.machine.ownerPrincipalRef !==
      this.config.ownerPrincipalRef
    ) {
      return this.closed("owner_mismatch");
    }
    if (
      instruction.sessionRef !== this.sessionRef ||
      instruction.adapterSessionRef !== this.adapterSessionRef
    ) {
      return this.closed("session_mismatch");
    }
    this.assertValid(validateDeveloperInstructionV1(instruction));
    this.assertValid(
      validateDeveloperInstructionAgainstShellCommandV1(
        instruction,
        this.config.binding.shellBinding,
        {
          ...this.config.binding.shellCommand,
          idempotencyKey: instruction.idempotencyKey,
          requestDigest: instruction.requestDigest.value,
          issuedAt: instruction.issuedAt,
          expiresAt: instruction.expiresAt,
        },
        this.now(),
      ),
    );
    const existing = this.idempotency.get(instruction.idempotencyKey);
    if (existing) {
      const prior = this.runtimes.get(existing);
      if (prior?.terminal || prior) {
        return this.closed("replay_forbidden");
      }
    }
    return undefined;
  }

  private createRuntime(
    instruction: DeveloperInstructionV1,
  ): InstructionRuntime {
    const runtime: InstructionRuntime = {
      instruction,
      streamRef: `stream-${instruction.instructionRef}`,
      events: [],
      incoming: [],
      waiters: [],
      promptFinished: false,
    };
    this.runtimes.set(instruction.instructionRef, runtime);
    this.idempotency.set(
      instruction.idempotencyKey,
      instruction.instructionRef,
    );
    return runtime;
  }

  private activeRuntime(): InstructionRuntime | undefined {
    if (!this.activeInstructionRef) return undefined;
    return this.runtimes.get(this.activeInstructionRef);
  }

  private appendEvent(
    runtime: InstructionRuntime,
    eventType: DeveloperSessionEventV1["eventType"],
    extra: Record<string, unknown> = {},
  ): DeveloperSessionEventV1 {
    const sequence = runtime.events.length + 1;
    const occurredAt = this.now();
    const event = {
      schemaVersion: DEVELOPER_REMOTE_WORKSPACE_SCHEMA_VERSION,
      contractType: "developer_session_event" as const,
      eventRef: `event-${runtime.instruction.instructionRef}-${sequence}`,
      streamRef: runtime.streamRef,
      instructionRef: runtime.instruction.instructionRef,
      actionRef: runtime.instruction.actionRef,
      sessionRef: runtime.instruction.sessionRef,
      sessionVersion: runtime.instruction.expectedSessionVersion,
      adapterSessionRef: runtime.instruction.adapterSessionRef,
      sequence,
      previousSequence: sequence - 1,
      cursor: { streamRef: runtime.streamRef, sequence },
      occurredAt,
      eventDigest: digestRefOf({
        instructionRef: runtime.instruction.instructionRef,
        sequence,
        eventType,
      }),
      eventType,
      ...extra,
    } as DeveloperSessionEventV1;
    this.assertValid(validateDeveloperSessionEventV1(event));
    const previous = runtime.events[runtime.events.length - 1];
    if (previous) {
      this.assertValid(
        validateDeveloperSessionEventTransitionV1(previous, event),
      );
    }
    runtime.events.push(event);
    return event;
  }

  private finishUnknown(
    runtime: InstructionRuntime,
  ): CursorAcpSpikeEventPayload {
    const unknownSince = this.now();
    const recordedAt = this.now();
    const terminalDigest = digestRefOf({
      instructionRef: runtime.instruction.instructionRef,
      status: "unknown_outcome",
      unknownSince,
    });
    const result: DeveloperTerminalResultV1 = {
      schemaVersion: DEVELOPER_REMOTE_WORKSPACE_SCHEMA_VERSION,
      contractType: "developer_terminal_result",
      terminalResultRef: `terminal-${runtime.instruction.instructionRef}`,
      instructionRef: runtime.instruction.instructionRef,
      actionRef: runtime.instruction.actionRef,
      sessionRef: runtime.instruction.sessionRef,
      sessionVersion: runtime.instruction.expectedSessionVersion,
      adapterSessionRef: runtime.instruction.adapterSessionRef,
      requestDigest: runtime.instruction.requestDigest,
      eventSequence: runtime.events.length + 1,
      recordedAt,
      terminalDigest,
      status: "unknown_outcome",
      shellBindingRef: runtime.instruction.shellBindingRef,
      shellCommandJournalRef: SPIKE_JOURNAL_RECORD_REF,
      unknownSince,
      reconciliationRef: {
        type: "downstream_idempotency",
        id: `reconcile-${runtime.instruction.instructionRef}`,
        version: 1,
        digest: digestRefOf({
          reconcile: runtime.instruction.instructionRef,
        }),
      },
      queryOnly: true,
      replayAllowed: false,
    };
    const event = this.appendEvent(runtime, "unknown_outcome", {
      terminalResultRef: result.terminalResultRef,
      terminalResultDigest: result.terminalDigest,
    });
    this.assertValid(validateDeveloperTerminalResultV1(result));
    this.assertValid(
      validateDeveloperTerminalResultAgainstEventV1(result, event),
    );
    runtime.terminal = result;
    return { kind: "terminal", event, result };
  }

  private async onAgentRequest(
    method: string,
    params: unknown,
  ): Promise<unknown> {
    try {
      assertAgentRequestMethod(method);
    } catch (error) {
      this.markClosed(codeOf(error));
      throw error;
    }
    if (method !== "session/request_permission") {
      this.markClosed("unknown_method");
      throw new CursorAcpJsonRpcError("unknown_method", method);
    }
    const runtime = this.activeRuntime();
    if (!runtime) {
      this.markClosed("approval_not_pending");
      throw new CursorAcpJsonRpcError("approval_not_pending", method);
    }
    const parsed = parsePermissionRequest(params);
    if (parsed.sessionId !== this.adapterSessionRef) {
      this.markClosed("session_mismatch");
      throw new CursorAcpJsonRpcError("session_mismatch", "permission session");
    }
    this.assertOpaque(parsed.toolCallId);
    const toolName = lookLikeAbsolutePath(parsed.toolName)
      ? "tool_call"
      : parsed.toolName;
    const issuedAt = this.now();
    const expiresAt = new Date(Date.parse(issuedAt) + 4 * 60_000).toISOString();
    const toolArgumentsDigest = digestRefOf(parsed.argumentDigestSource);
    const request: DeveloperApprovalRequestV1 = {
      schemaVersion: DEVELOPER_REMOTE_WORKSPACE_SCHEMA_VERSION,
      contractType: "developer_approval_request",
      approvalRef: `approval-${parsed.toolCallId}`,
      approvalVersion: 1,
      status: "pending",
      decisionSequence: 0,
      instructionRef: runtime.instruction.instructionRef,
      actionRef: runtime.instruction.actionRef,
      sessionRef: runtime.instruction.sessionRef,
      sessionVersion: runtime.instruction.expectedSessionVersion,
      adapterSessionRef: runtime.instruction.adapterSessionRef,
      adapterRequestRef: parsed.toolCallId,
      workspaceRef: runtime.instruction.workspaceRef,
      operationKind: "permission_change",
      toolName,
      toolArgumentsDigest,
      workspaceScopeDigest: this.config.binding.workspace.workspaceDigest,
      instructionRequestDigest: runtime.instruction.requestDigest,
      requestDigest: digestRefOf({
        adapterRequestRef: parsed.toolCallId,
        toolArgumentsDigest,
        workspaceScopeDigest: this.config.binding.workspace.workspaceDigest,
        instructionRequestDigest: runtime.instruction.requestDigest,
        sessionRef: runtime.instruction.sessionRef,
        sessionVersion: runtime.instruction.expectedSessionVersion,
      }),
      risk: "L3",
      sideEffectClass: "irreversible",
      estimatedCost: { status: "not_applicable" },
      requestedGrantScopes: ["once"],
      requiresLocalConfirmation: true,
      userVisibleSummary: `Permission request for ${toolName}`,
      redactedArgumentsSummary: "Arguments redacted to digest",
      issuedAt,
      expiresAt,
    };
    this.assertValid(validateDeveloperApprovalRequestV1(request));
    const event = this.appendEvent(runtime, "awaiting_approval", {
      approvalRef: request.approvalRef,
      approvalRequestDigest: request.requestDigest,
    });
    const response = new Promise<unknown>((resolve, reject) => {
      runtime.pendingApproval = { request, resolve, reject };
    });
    this.push(runtime, this.ok({ kind: "approval_request", event, request }));
    return response;
  }

  private onAgentNotification(method: string, params: unknown): void {
    try {
      assertAgentNotificationMethod(method);
      const update = parseSessionUpdate(params);
      if (update.sessionId !== this.adapterSessionRef) {
        this.markClosed("session_mismatch");
        return;
      }
      const runtime = this.activeRuntime();
      if (!runtime || runtime.terminal) return;
      const last = runtime.events[runtime.events.length - 1]?.eventType;
      if (update.sessionUpdate === "plan" && last === "claimed") {
        this.push(
          runtime,
          this.ok({
            kind: "session_event",
            event: this.appendEvent(runtime, "planning", {
              planDataRef: createEncryptedDataRef(
                "plan",
                `plan-${runtime.instruction.instructionRef}`,
              ),
            }),
          }),
        );
      }
      if (
        (update.sessionUpdate === "tool_call" ||
          update.sessionUpdate === "tool_call_update") &&
        last === "claimed"
      ) {
        this.push(
          runtime,
          this.ok({
            kind: "session_event",
            event: this.appendEvent(runtime, "running", {
              executionRef: `execution-${runtime.instruction.instructionRef}`,
            }),
          }),
        );
      }
    } catch (error) {
      this.markClosed(codeOf(error));
      const runtime = this.activeRuntime();
      if (runtime) this.push(runtime, this.closed(codeOf(error)));
    }
  }

  private permissionOutcome(
    decision: DeveloperApprovalDecisionV1,
    request: DeveloperApprovalRequestV1,
  ): unknown {
    if (decision.decision === "approved") {
      if (decision.grantScope !== "once") {
        throw new CursorAcpJsonRpcError("unknown_schema", "grant scope");
      }
      if (decision.localConfirmationRef === undefined) {
        throw new CursorAcpJsonRpcError("unknown_schema", "local confirmation");
      }
      if (!request.requestedGrantScopes.includes("once")) {
        throw new CursorAcpJsonRpcError("unknown_schema", "grant scope");
      }
      return selectedPermissionOutcome("allow-once");
    }
    if (decision.decision === "rejected") {
      return selectedPermissionOutcome("reject-once");
    }
    return cancelledPermissionOutcome();
  }

  private sessionSummary(input: {
    sessionRef: string;
    adapterSessionRef: string;
    state: "ready" | "available";
    resumeDisposition?: "resumable";
    projectionSequence?: number;
  }): DeveloperSessionSummaryV1 {
    const observedAt = this.now();
    const base = {
      schemaVersion: DEVELOPER_REMOTE_WORKSPACE_SCHEMA_VERSION,
      contractType: "developer_session_summary" as const,
      sessionRef: input.sessionRef,
      adapterSessionRef: input.adapterSessionRef,
      agentId: this.config.binding.agentId,
      machineRef: this.config.binding.machine.machineRef,
      deviceRef: this.config.binding.deviceRef,
      runtimeRef: this.config.binding.machine.runtimeRef,
      workspaceRef: this.config.workspaceRef,
      adapterManifestRef: CURSOR_ACP_SPIKE_MANIFEST.manifestRef,
      adapterManifestVersion: CURSOR_ACP_SPIKE_MANIFEST.manifestVersion,
      sessionVersion: this.sessionVersion,
      capabilities: {
        canResume: true,
        canPrompt: true,
        canCancel: true,
        canQueryTerminal: true,
      },
      projectionSequence: input.projectionSequence ?? this.projectionSequence,
      lastActivityAt: observedAt,
      observedAt,
    };
    if (input.state === "available") {
      return {
        ...base,
        state: "available",
        resumeDisposition: input.resumeDisposition ?? "resumable",
      };
    }
    return { ...base, state: "ready" };
  }

  private async clientRequest(
    method: string,
    params?: unknown,
  ): Promise<unknown> {
    assertClientRequestMethod(method);
    return this.config.transport.request(method, params);
  }

  private async clientNotify(method: string, params?: unknown): Promise<void> {
    assertClientNotificationMethod(method);
    return this.config.transport.notify(method, params);
  }

  private push(
    runtime: InstructionRuntime,
    envelope: CursorAcpSpikeEnvelope<CursorAcpSpikeEventPayload>,
  ): void {
    runtime.incoming.push(envelope);
    this.wake(runtime);
  }

  private wake(runtime: InstructionRuntime): void {
    for (const waiter of runtime.waiters.splice(0)) waiter();
  }

  private assertOpaque(value: string): void {
    if (!OPAQUE_REF.test(value)) {
      throw new CursorAcpJsonRpcError("unknown_schema", "opaque ref required");
    }
  }

  private assertValid(result: { valid: boolean; errors: string[] }): void {
    if (!result.valid) {
      throw new CursorAcpJsonRpcError(
        "unknown_schema",
        result.errors.join("; ") || "contract invalid",
      );
    }
  }

  private markClosed(reason: string): void {
    this.failClosedReason = this.failClosedReason ?? reason;
  }

  private ok<T>(payload: T): CursorAcpSpikeEnvelope<T> {
    return spikeEnvelope("ok", this.enabled(), payload);
  }

  private unavailable<T = never>(
    reasonCode: string,
  ): CursorAcpSpikeEnvelope<T> {
    return spikeEnvelope<T>(
      "unavailable",
      this.enabled(),
      undefined,
      reasonCode,
    );
  }

  private closed<T = never>(reasonCode: string): CursorAcpSpikeEnvelope<T> {
    this.markClosed(reasonCode);
    return spikeEnvelope<T>(
      "fail_closed",
      this.enabled(),
      undefined,
      reasonCode,
    );
  }
}

function codeOf(error: unknown): string {
  if (error instanceof CursorAcpJsonRpcError) return error.code;
  if (error instanceof Error && /unknown/.test(error.message)) {
    return "unknown_method";
  }
  return "unknown_schema";
}
