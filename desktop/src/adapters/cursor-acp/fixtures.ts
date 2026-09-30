/**
 * Fixture owner, device, workspace, and session bindings.
 * DEVELOPMENT_SPIKE_ONLY. No credentials, paths, or raw bodies.
 */

import {
  DEVELOPER_REMOTE_WORKSPACE_SCHEMA_VERSION,
  type DeveloperApprovalDecisionV1,
  type DeveloperApprovalRequestV1,
  type DeveloperEncryptedDataRefV1,
  type DeveloperInstructionV1,
  type DeveloperMachineProjectionV1,
  type DeveloperSessionSummaryV1,
  type DeveloperWorkspaceRefV1,
} from "../../../../shared/types/developer-remote-workspace.ts";
import type {
  ShellCommandEnvelopeV1,
  ShellSessionBindingV1,
} from "../../../../shared/types/shell-session-binding.ts";
import type { RecordRef } from "../../../../shared/types/trust-loop-primitives.ts";
import {
  CURSOR_ACP_AUTH_METHOD_ID,
  CURSOR_ACP_PROTOCOL_VERSION,
  CURSOR_ACP_WORKSPACE_STAND_IN,
} from "./constants";
import { digestRefOf } from "./control-plane";
import type {
  AcpStdioJsonRpcTransport,
  CursorAcpSpikeBindingFixtures,
} from "./types";

export const SPIKE_T0 = "2026-08-22T12:00:00.000Z";
export const SPIKE_T1 = "2026-08-22T12:01:00.000Z";
export const SPIKE_T5 = "2026-08-22T12:05:00.000Z";
export const SPIKE_T9 = "2026-08-22T12:09:00.000Z";

export const SPIKE_OWNER_PRINCIPAL_REF = "principal-1";
export const SPIKE_AGENT_ID = "agent-1";
export const SPIKE_DEVICE_REF = "device-1";
export const SPIKE_WORKSPACE_REF = "workspace-1";
export const SPIKE_SESSION_REF = "session-1";
export const SPIKE_ADAPTER_SESSION_REF = "adapter-session-1";
export const SPIKE_INSTRUCTION_REF = "instruction-1";
export const SPIKE_JOURNAL_REF = "journal-1";

export const SPIKE_RUNTIME_REF = {
  type: "runtime",
  id: "runtime-1",
  version: 1,
} as const;

export const SPIKE_SHELL_BINDING_REF = {
  type: "shell_session_binding",
  id: "binding-1",
  version: 1,
} as const;

export const SPIKE_JOURNAL_RECORD_REF = {
  type: "shell_command_journal_entry",
  id: SPIKE_JOURNAL_REF,
  version: 1,
} as const;

export function createEncryptedDataRef(
  dataKind: DeveloperEncryptedDataRefV1["dataKind"],
  dataRef: string,
): DeveloperEncryptedDataRefV1 {
  return {
    kind: "encrypted_data_ref",
    dataKind,
    dataRef,
    digest: digestRefOf({ dataKind, dataRef }),
    sizeBytes: 256,
    dataClass: "owner_private",
    encryption: "runtime_managed",
    ownerScope: "authenticated_owner",
    runtimeRef: SPIKE_RUNTIME_REF,
    expiresAt: SPIKE_T9,
  };
}

export function createSpikeBindingFixtures(): CursorAcpSpikeBindingFixtures {
  const workspaceDigest = digestRefOf({ workspace: SPIKE_WORKSPACE_REF });
  const trustDigest = digestRefOf({ trust: "workspace-trust-1" });
  const instructionDigest = digestRefOf({
    instruction: SPIKE_INSTRUCTION_REF,
  });

  const machine: DeveloperMachineProjectionV1 = {
    schemaVersion: DEVELOPER_REMOTE_WORKSPACE_SCHEMA_VERSION,
    contractType: "developer_machine_projection",
    machineRef: "machine-1",
    ownerPrincipalRef: SPIKE_OWNER_PRINCIPAL_REF,
    agentId: SPIKE_AGENT_ID,
    deviceRef: SPIKE_DEVICE_REF,
    runtimeRef: SPIKE_RUNTIME_REF,
    adapterManifestRef: "cursor-acp-spike-manifest-1",
    adapterManifestVersion: 1,
    displayLabel: "Spike workstation",
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
    projectionSequence: 1,
    capturedAt: SPIKE_T1,
    connection: {
      status: "online",
      observedAt: SPIKE_T1,
      validUntil: SPIKE_T5,
    },
    shellBindingRef: SPIKE_SHELL_BINDING_REF,
  };

  const workspace: DeveloperWorkspaceRefV1 = {
    schemaVersion: DEVELOPER_REMOTE_WORKSPACE_SCHEMA_VERSION,
    contractType: "developer_workspace_ref",
    workspaceRef: SPIKE_WORKSPACE_REF,
    workspaceVersion: 1,
    machineRef: machine.machineRef,
    deviceRef: SPIKE_DEVICE_REF,
    runtimeRef: SPIKE_RUNTIME_REF,
    scope: "repository",
    displayLabel: "Fixed spike workspace",
    repositoryHint: {
      repositoryLabel: "Spike workspace",
      branchLabel: "spike-local",
    },
    workspaceDigest,
    trust: {
      status: "trusted",
      trustRef: {
        type: "evidence",
        id: "workspace-trust-1",
        version: 1,
        digest: trustDigest,
      },
      trustedAt: SPIKE_T0,
    },
    observedAt: SPIKE_T1,
  };

  const session: DeveloperSessionSummaryV1 = {
    schemaVersion: DEVELOPER_REMOTE_WORKSPACE_SCHEMA_VERSION,
    contractType: "developer_session_summary",
    sessionRef: SPIKE_SESSION_REF,
    adapterSessionRef: SPIKE_ADAPTER_SESSION_REF,
    agentId: SPIKE_AGENT_ID,
    machineRef: machine.machineRef,
    deviceRef: SPIKE_DEVICE_REF,
    runtimeRef: SPIKE_RUNTIME_REF,
    workspaceRef: SPIKE_WORKSPACE_REF,
    adapterManifestRef: "cursor-acp-spike-manifest-1",
    adapterManifestVersion: 1,
    sessionVersion: 1,
    capabilities: {
      canResume: true,
      canPrompt: true,
      canCancel: true,
      canQueryTerminal: true,
    },
    projectionSequence: 1,
    lastActivityAt: SPIKE_T0,
    observedAt: SPIKE_T1,
    state: "ready",
  };

  const instruction: DeveloperInstructionV1 = {
    schemaVersion: DEVELOPER_REMOTE_WORKSPACE_SCHEMA_VERSION,
    contractType: "developer_instruction",
    instructionRef: SPIKE_INSTRUCTION_REF,
    actionRef: "action-1",
    agentId: SPIKE_AGENT_ID,
    machineRef: machine.machineRef,
    deviceRef: SPIKE_DEVICE_REF,
    runtimeRef: SPIKE_RUNTIME_REF,
    workspaceRef: SPIKE_WORKSPACE_REF,
    sessionRef: SPIKE_SESSION_REF,
    adapterSessionRef: SPIKE_ADAPTER_SESSION_REF,
    adapterManifestRef: "cursor-acp-spike-manifest-1",
    expectedSessionVersion: 1,
    shellBindingRef: SPIKE_SHELL_BINDING_REF,
    instructionSequence: 1,
    idempotencyKey: "idempotency-1",
    requestDigest: instructionDigest,
    payloadRef: createEncryptedDataRef(
      "instruction",
      "instruction-data-1",
    ) as DeveloperInstructionV1["payloadRef"],
    userVisibleSummary: "Run the selected test suite",
    issuedAt: SPIKE_T1,
    expiresAt: SPIKE_T5,
  };

  const shellBinding: ShellSessionBindingV1 = {
    schemaVersion: 1,
    bindingId: SPIKE_SHELL_BINDING_REF.id,
    bindingVersion: SPIKE_SHELL_BINDING_REF.version,
    agentId: SPIKE_AGENT_ID,
    accountableAgentId: SPIKE_AGENT_ID,
    authorityRootRef: { kind: "soul_core", soulCoreId: "soul-1" },
    principalRef: {
      type: "actor_identity",
      id: SPIKE_OWNER_PRINCIPAL_REF,
      version: 1,
    },
    shellId: "shell-1",
    deviceId: SPIKE_DEVICE_REF,
    runtimeRef: SPIKE_RUNTIME_REF as RecordRef,
    audience: ["developer-runtime"],
    capabilities: ["developer-instruction"],
    nonceDomain: "developer-remote-workspace",
    issuedAt: SPIKE_T0,
    expiresAt: SPIKE_T9,
    status: "active",
  };

  const shellCommand: ShellCommandEnvelopeV1 = {
    schemaVersion: 1,
    bindingId: shellBinding.bindingId,
    bindingVersion: shellBinding.bindingVersion,
    nonceDomain: shellBinding.nonceDomain,
    nonce: "0123456789abcdef0123456789abcdef",
    idempotencyKey: instruction.idempotencyKey,
    requestDigest: instruction.requestDigest.value,
    issuedAt: instruction.issuedAt,
    expiresAt: instruction.expiresAt,
  };

  return {
    ownerPrincipalRef: SPIKE_OWNER_PRINCIPAL_REF,
    agentId: SPIKE_AGENT_ID,
    deviceRef: SPIKE_DEVICE_REF,
    machine,
    workspace,
    session,
    instruction,
    shellBinding,
    shellCommand,
  };
}

export type ScriptedCursorAcpBehavior =
  | "happy_path"
  | "with_permission"
  | "unknown_method"
  | "unknown_update"
  | "unknown_permission_option"
  | "wait_for_cancel";

export function attachScriptedCursorAcpAgent(
  agent: AcpStdioJsonRpcTransport,
  options: {
    behavior?: ScriptedCursorAcpBehavior;
    sessionId?: string;
    listedSessionId?: string;
    listedCwdLeak?: string;
  } = {},
): {
  cancelObserved: () => boolean;
  waitForPermissionOutcome: () => Promise<unknown>;
} {
  const behavior = options.behavior ?? "happy_path";
  const sessionId = options.sessionId ?? SPIKE_ADAPTER_SESSION_REF;
  const listedSessionId = options.listedSessionId ?? sessionId;
  let cancelled = false;
  let permissionOutcome: Promise<unknown> | undefined;
  const cancelWaiters: Array<() => void> = [];

  agent.setIncomingNotificationHandler((method) => {
    if (method === "session/cancel") {
      cancelled = true;
      for (const waiter of cancelWaiters.splice(0)) waiter();
    }
  });

  agent.setIncomingRequestHandler(async (method) => {
    if (behavior === "unknown_method" && method === "initialize") {
      void agent
        .request("cursor/ask_question", { toolCallId: "call-x" })
        .catch(() => undefined);
    }
    switch (method) {
      case "initialize":
        return {
          protocolVersion: CURSOR_ACP_PROTOCOL_VERSION,
          agentCapabilities: {
            loadSession: true,
            sessionCapabilities: { list: {} },
          },
          authMethods: [{ id: CURSOR_ACP_AUTH_METHOD_ID }],
          agentInfo: {
            name: "cursor-cli-acp-fixture",
            version: "development-spike",
          },
        };
      case "authenticate":
        return {};
      case "session/list":
        return {
          sessions: [
            {
              sessionId: listedSessionId,
              ...(options.listedCwdLeak
                ? { cwd: options.listedCwdLeak }
                : { cwd: CURSOR_ACP_WORKSPACE_STAND_IN }),
            },
          ],
        };
      case "session/new":
        return { sessionId };
      case "session/load":
        return {};
      case "session/prompt": {
        if (behavior === "unknown_update") {
          await agent.notify("session/update", {
            sessionId,
            update: { sessionUpdate: "not_a_real_kind" },
          });
          return { stopReason: "end_turn" };
        }
        await agent.notify("session/update", {
          sessionId,
          update: { sessionUpdate: "plan" },
        });
        if (behavior === "wait_for_cancel") {
          if (!cancelled) {
            await new Promise<void>((resolve) => {
              cancelWaiters.push(resolve);
            });
          }
          return { stopReason: "cancelled" };
        }
        if (
          behavior === "with_permission" ||
          behavior === "unknown_permission_option"
        ) {
          const optionId =
            behavior === "unknown_permission_option"
              ? "allow-forever"
              : "allow-once";
          permissionOutcome = agent.request("session/request_permission", {
            sessionId,
            options: [
              {
                optionId: "allow-always",
                kind: "allow_always",
                name: "Allow always",
              },
              { optionId, kind: "allow_once", name: "Allow once" },
              {
                optionId: "reject-once",
                kind: "reject_once",
                name: "Reject",
              },
            ],
            toolCall: {
              toolCallId: "adapter-request-1",
              title: "test_runner",
              kind: "execute",
              rawInput: { target: "selected-suite" },
            },
          });
          await permissionOutcome;
        }
        await agent.notify("session/update", {
          sessionId,
          update: { sessionUpdate: "tool_call" },
        });
        return { stopReason: cancelled ? "cancelled" : "end_turn" };
      }
      default:
        throw new Error(`scripted agent unknown method ${method}`);
    }
  });

  return {
    cancelObserved: () => cancelled,
    waitForPermissionOutcome: () => {
      if (!permissionOutcome) {
        return Promise.reject(new Error("permission request was not sent"));
      }
      return permissionOutcome;
    },
  };
}

export function createSpikeApprovalDecision(
  request: DeveloperApprovalRequestV1,
  decision: "approved" | "rejected",
  decidedAt: string,
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
    decidedAt,
    decisionDigest: digestRefOf({
      approvalRef: request.approvalRef,
      decision,
      decidedAt,
    }),
    authorityDecisionRef: {
      type: "authority_decision" as const,
      id: `authority-decision-${request.approvalRef}`,
      version: 1,
      digest: digestRefOf({
        authority: "decision",
        approvalRef: request.approvalRef,
      }),
    },
  };
  if (decision === "approved") {
    const grantExpiresAt = new Date(
      Math.min(Date.parse(request.expiresAt), Date.parse(decidedAt) + 60_000),
    ).toISOString();
    return {
      ...base,
      decision: "approved",
      resultingStatus: "approved",
      decidedByRef: SPIKE_OWNER_PRINCIPAL_REF,
      grantScope: "once",
      grantExpiresAt,
      localConfirmationRef: "local-confirmation-1",
      authorityGrantRef: {
        type: "authority_grant",
        id: `authority-grant-${request.approvalRef}`,
        version: 1,
        digest: digestRefOf({
          authority: "grant",
          approvalRef: request.approvalRef,
        }),
      },
    };
  }
  return {
    ...base,
    decision: "rejected",
    resultingStatus: "rejected",
    decidedByRef: SPIKE_OWNER_PRINCIPAL_REF,
    reasonCode: "owner_rejected",
  };
}
