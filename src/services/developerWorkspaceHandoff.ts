import {
  validateDeveloperHandoffV1,
  type DeveloperHandoffV1,
  type DeveloperMachineProjectionV1,
  type DeveloperSessionSummaryV1,
} from "../../shared/types/developer-remote-workspace";
import { computeDigest } from "../../shared/types/trust-loop-primitives";
import type { DeveloperWorkspaceTransport } from "./developerWorkspaceAuth";
import type { DeveloperWorkspaceIdempotencyStore } from "./developerWorkspaceControl";
import {
  DEVELOPER_WORKSPACE_API_PATHS,
  developerWorkspaceMutate,
  type DeveloperWorkspaceLiveFailure,
} from "./developerWorkspaceLiveClient";
import { queueDeveloperWorkspaceMutation } from "./developerWorkspacePersistence";

export type DeveloperHandoffResult =
  | { ok: true; handoff: DeveloperHandoffV1 }
  | { ok: false; state: DeveloperWorkspaceLiveFailure };

export async function createDeveloperHandoff(input: {
  transport: DeveloperWorkspaceTransport;
  session: DeveloperSessionSummaryV1;
  targetMachine: DeveloperMachineProjectionV1;
  expiresAt: string;
  online: boolean;
  idempotency: DeveloperWorkspaceIdempotencyStore;
}): Promise<DeveloperHandoffResult> {
  if (input.online !== true) {
    queueDeveloperWorkspaceMutation();
    return { ok: false, state: { kind: "unknown", reason: "client_offline" } };
  }
  if (input.targetMachine.connection.status !== "online") {
    return {
      ok: false,
      state: {
        kind: "unavailable",
        capability: "developer.handoffs_v1",
        reason: "handoff_target_unpublished",
      },
    };
  }
  const body = {
    fromSurface: "mobile",
    toSurface: "desktop",
    expiresAt: input.expiresAt,
    target: {
      kind: "session",
      runtimeId: input.targetMachine.runtimeRef.id,
      deviceId: input.targetMachine.deviceRef,
    },
  };
  const digest = computeDigest(body).value;
  const key = input.idempotency.begin(
    `handoff_create:${input.session.sessionRef}`,
    digest,
  );
  return developerWorkspaceMutate(
    input.transport,
    DEVELOPER_WORKSPACE_API_PATHS.sessionHandoffs(input.session.sessionRef),
    body,
    key,
    validateHandoffValue,
    "developer.handoffs_v1",
  ).then(asHandoffResult);
}

export async function acceptDeveloperHandoff(input: {
  transport: DeveloperWorkspaceTransport;
  handoff: DeveloperHandoffV1;
  targetMachine: DeveloperMachineProjectionV1;
  consumerSession: DeveloperSessionSummaryV1;
  online: boolean;
  idempotency: DeveloperWorkspaceIdempotencyStore;
}): Promise<DeveloperHandoffResult> {
  if (input.online !== true) {
    queueDeveloperWorkspaceMutation();
    return { ok: false, state: { kind: "unknown", reason: "client_offline" } };
  }
  if (input.handoff.status !== "issued") {
    return {
      ok: false,
      state: {
        kind: "unavailable",
        capability: "developer.handoffs_v1",
        reason: "handoff_not_issued",
      },
    };
  }
  if (
    input.targetMachine.connection.status !== "online" ||
    !input.targetMachine.shellBindingRef
  ) {
    return {
      ok: false,
      state: {
        kind: "unavailable",
        capability: "developer.handoffs_v1",
        reason: "handoff_target_unpublished",
      },
    };
  }
  const body = {
    expectedVersion: input.handoff.handoffVersion,
    handoffDigest: input.handoff.handoffDigest,
    targetRuntimeId: input.targetMachine.runtimeRef.id,
    targetDeviceId: input.targetMachine.deviceRef,
    bindingVersion: input.targetMachine.shellBindingRef.version,
    consumerSessionRef: input.consumerSession.sessionRef,
  };
  const digest = computeDigest(body).value;
  const key = input.idempotency.begin(
    `handoff_accept:${input.handoff.handoffRef}`,
    digest,
  );
  return developerWorkspaceMutate(
    input.transport,
    DEVELOPER_WORKSPACE_API_PATHS.handoffAccept(input.handoff.handoffRef),
    body,
    key,
    validateHandoffValue,
    "developer.handoffs_v1",
    true,
  ).then(asHandoffResult);
}

function validateHandoffValue(raw: unknown) {
  const result = validateDeveloperHandoffV1(raw);
  return {
    ...result,
    value: result.valid ? (raw as DeveloperHandoffV1) : undefined,
  };
}

function asHandoffResult(
  result:
    | { ok: true; data: DeveloperHandoffV1 }
    | { ok: false; state: DeveloperWorkspaceLiveFailure },
): DeveloperHandoffResult {
  if (result.ok === false) return result;
  return { ok: true, handoff: result.data };
}
