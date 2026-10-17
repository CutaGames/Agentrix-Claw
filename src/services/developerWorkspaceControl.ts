import {
  validateDeveloperInstructionV1,
  validateDeveloperSessionSummaryV1,
  type DeveloperEncryptedDataRefV1,
  type DeveloperInstructionV1,
  type DeveloperMachineProjectionV1,
  type DeveloperSessionEventV1,
  type DeveloperSessionSummaryV1,
} from "../../shared/types/developer-remote-workspace";
import { computeDigest } from "../../shared/types/trust-loop-primitives";
import type { DeveloperWorkspaceTransport } from "./developerWorkspaceAuth";
import {
  DEVELOPER_WORKSPACE_API_PATHS,
  developerWorkspaceMutate,
  getDeveloperInstruction,
  getDeveloperReceipt,
  getDeveloperSession,
  instructionRequestDigest,
  listDeveloperInstructionEvents,
  presentDeveloperReceipt,
  utf8ToBase64,
  validateDeveloperEncryptedDataRefV1,
  type DeveloperReceiptProjectionV1,
  type DeveloperWorkspaceLiveFailure,
  type DeveloperWorkspaceLiveResult,
} from "./developerWorkspaceLiveClient";
import {
  queueDeveloperWorkspaceMutation,
  validateDeveloperWorkspaceControlSummary,
} from "./developerWorkspacePersistence";

export type DeveloperWorkspaceIdempotencyStore = {
  begin(operation: string, requestDigest: string): string;
  commit(
    operation: string,
    requestDigest: string,
    key: string,
    response: unknown,
  ): void;
  peek(
    operation: string,
    requestDigest: string,
  ): { key: string; response?: unknown } | null;
};

export function createDeveloperWorkspaceIdempotencyStore(): DeveloperWorkspaceIdempotencyStore {
  const records = new Map<
    string,
    { digest: string; key: string; response?: unknown }
  >();
  return {
    begin(operation, requestDigest) {
      const existing = records.get(operation);
      if (existing && existing.digest === requestDigest) return existing.key;
      const key = `idem_${requestDigest.slice(0, 24)}`;
      records.set(operation, { digest: requestDigest, key });
      return key;
    },
    commit(operation, requestDigest, key, response) {
      records.set(operation, { digest: requestDigest, key, response });
    },
    peek(operation, requestDigest) {
      const existing = records.get(operation);
      if (!existing || existing.digest !== requestDigest) return null;
      return { key: existing.key, response: existing.response };
    },
  };
}

export type DeveloperInstructionSubmitInput = {
  transport: DeveloperWorkspaceTransport;
  machine: DeveloperMachineProjectionV1;
  workspaceRef?: string;
  expectedMachineVersion?: number;
  session?: DeveloperSessionSummaryV1;
  resumeDisposition?: "resumable" | "create_only";
  userVisibleSummary: string;
  plaintext: string;
  now: string;
  online: boolean;
  idempotency: DeveloperWorkspaceIdempotencyStore;
  expiresInMs?: number;
};

export type DeveloperControlSuccess = {
  ok: true;
  session: DeveloperSessionSummaryV1;
  instruction?: DeveloperInstructionV1;
  payloadRef?: DeveloperEncryptedDataRefV1;
  awaitingDesktop?: boolean;
};

export type DeveloperControlResult =
  | DeveloperControlSuccess
  | { ok: false; state: DeveloperWorkspaceLiveFailure };

type PreparedDeveloperInstructionSubmission = {
  kind: "prepared_instruction_submission";
  idempotencyKey: string;
  body: {
    expectedSessionVersion: number;
    requestDigest: ReturnType<typeof instructionRequestDigest>;
    payloadRef: DeveloperEncryptedDataRefV1;
    userVisibleSummary: string;
    issuedAt: string;
    expiresAt: string;
    idempotencyKey: string;
  };
};

function isPreparedDeveloperInstructionSubmission(
  value: unknown,
): value is PreparedDeveloperInstructionSubmission {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const record = value as Partial<PreparedDeveloperInstructionSubmission>;
  return (
    record.kind === "prepared_instruction_submission" &&
    typeof record.idempotencyKey === "string" &&
    !!record.body &&
    typeof record.body === "object"
  );
}

export function evaluateDeveloperLiveMutationCta(input: {
  kind: "send" | "approve" | "cancel" | "create_session" | "handoff_accept";
  flagEnabled: boolean;
  online?: boolean;
  machine?: DeveloperMachineProjectionV1 | null;
  session?: DeveloperSessionSummaryV1 | null;
  workspaceRef?: string;
  expectedMachineVersion?: number;
  expectedInstructionVersion?: number;
  hasPendingApproval?: boolean;
}): { visible: boolean; enabled: boolean; reason: string } {
  if (input.flagEnabled !== true) {
    return { visible: false, enabled: false, reason: "feature_disabled" };
  }
  if (input.online === false) {
    return { visible: true, enabled: false, reason: "offline_mutation_denied" };
  }
  if (input.machine && input.machine.connection.status === "offline") {
    return { visible: true, enabled: false, reason: "offline_mutation_denied" };
  }
  if (input.machine && input.machine.connection.status === "stale") {
    return { visible: true, enabled: false, reason: "stale_mutation_denied" };
  }
  if (input.kind === "create_session") {
    if (!input.machine || input.machine.connection.status !== "online") {
      return {
        visible: false,
        enabled: false,
        reason: "machine_not_executable",
      };
    }
    if (!input.workspaceRef) {
      return {
        visible: false,
        enabled: false,
        reason: "workspace_unpublished",
      };
    }
    if (typeof input.expectedMachineVersion !== "number") {
      return {
        visible: false,
        enabled: false,
        reason: "machine_version_unpublished",
      };
    }
    return { visible: true, enabled: true, reason: "live_capability" };
  }
  if (input.kind === "send") {
    if (!input.session || !input.machine) {
      return {
        visible: false,
        enabled: false,
        reason: "session_not_executable",
      };
    }
    if (input.session.capabilities.canPrompt !== true) {
      return {
        visible: false,
        enabled: false,
        reason: "send_capability_unpublished",
      };
    }
    if (input.session.state !== "ready") {
      return {
        visible: true,
        enabled: false,
        reason: "session_not_executable",
      };
    }
    return { visible: true, enabled: true, reason: "live_capability" };
  }
  if (input.kind === "approve") {
    if (input.hasPendingApproval !== true) {
      return {
        visible: false,
        enabled: false,
        reason: "approve_capability_unpublished",
      };
    }
    return { visible: true, enabled: true, reason: "live_capability" };
  }
  if (input.kind === "cancel") {
    if (!input.session || input.session.capabilities.canCancel !== true) {
      return {
        visible: false,
        enabled: false,
        reason: "cancel_capability_unpublished",
      };
    }
    if (typeof input.expectedInstructionVersion !== "number") {
      return {
        visible: true,
        enabled: false,
        reason: "instruction_version_unpublished",
      };
    }
    return { visible: true, enabled: true, reason: "live_capability" };
  }
  if (
    !input.machine ||
    input.machine.connection.status !== "online" ||
    !input.machine.shellBindingRef
  ) {
    return {
      visible: false,
      enabled: false,
      reason: "handoff_target_unpublished",
    };
  }
  return { visible: true, enabled: true, reason: "live_capability" };
}

export async function submitDeveloperInstruction(
  input: DeveloperInstructionSubmitInput,
): Promise<DeveloperControlResult> {
  if (input.online !== true) {
    queueDeveloperWorkspaceMutation();
    return {
      ok: false,
      state: {
        kind: "unavailable",
        capability: "developer.instruction_v1",
        reason: "offline_mutation_denied",
      },
    };
  }
  if (
    input.machine.connection.status !== "online" ||
    !input.machine.shellBindingRef
  ) {
    return {
      ok: false,
      state: {
        kind: "unavailable",
        capability: "developer.instruction_v1",
        reason: "machine_not_executable",
      },
    };
  }
  if (!validateDeveloperWorkspaceControlSummary(input.userVisibleSummary).ok) {
    return {
      ok: false,
      state: {
        kind: "unavailable",
        capability: "developer.instruction_v1",
        reason: "control_summary_sensitive",
      },
    };
  }
  let session = input.session;
  if (!session) {
    const created = await createOrResumeDeveloperSession(input);
    if (created.ok === false) return created;
    session = created.session;
    if (session.state !== "ready") {
      return { ok: true, session, awaitingDesktop: true };
    }
  }
  if (session.state !== "ready" || session.capabilities.canPrompt !== true) {
    return {
      ok: false,
      state: {
        kind: "unavailable",
        capability: "developer.instruction_v1",
        reason: "session_not_executable",
      },
    };
  }
  const plaintextDigest = computeDigest({ plaintext: input.plaintext }).value;
  const uploaded = await uploadInstructionPlaintext(
    input,
    session,
    plaintextDigest,
  );
  if (uploaded.ok === false) return uploaded;
  const operation = `instruction_create:${session.sessionRef}`;
  const submissionDigest = computeDigest({
    sessionRef: session.sessionRef,
    expectedSessionVersion: session.sessionVersion,
    payloadRef: uploaded.payloadRef,
    userVisibleSummary: input.userVisibleSummary,
    plaintextDigest,
  }).value;
  const replayed = input.idempotency.peek(operation, submissionDigest);
  if (
    replayed?.response &&
    !isPreparedDeveloperInstructionSubmission(replayed.response)
  ) {
    const validated = validateDeveloperInstructionV1(replayed.response);
    if (!validated.valid) {
      return {
        ok: false,
        state: {
          kind: "error",
          reason: "instruction_replay_failed_closed",
          retryable: false,
        },
      };
    }
    return {
      ok: true,
      session,
      instruction: replayed.response as DeveloperInstructionV1,
      payloadRef: uploaded.payloadRef,
    };
  }
  const idempotencyKey =
    replayed?.key ?? input.idempotency.begin(operation, submissionDigest);
  const prepared = isPreparedDeveloperInstructionSubmission(replayed?.response)
    ? replayed.response
    : prepareInstructionSubmission({
        session,
        payloadRef: uploaded.payloadRef,
        userVisibleSummary: input.userVisibleSummary,
        now: input.now,
        expiresInMs: input.expiresInMs,
        idempotencyKey,
      });
  input.idempotency.commit(
    operation,
    submissionDigest,
    idempotencyKey,
    prepared,
  );
  const created = await developerWorkspaceMutate(
    input.transport,
    DEVELOPER_WORKSPACE_API_PATHS.sessionInstructions(session.sessionRef),
    prepared.body,
    prepared.idempotencyKey,
    (raw) => {
      const result = validateDeveloperInstructionV1(raw);
      if (!result.valid) return result;
      const instruction = raw as DeveloperInstructionV1;
      const exact =
        instruction.agentId === input.machine.agentId &&
        instruction.machineRef === input.machine.machineRef &&
        instruction.deviceRef === input.machine.deviceRef &&
        instruction.runtimeRef.id === input.machine.runtimeRef.id &&
        instruction.runtimeRef.version === input.machine.runtimeRef.version &&
        instruction.workspaceRef === session.workspaceRef &&
        instruction.sessionRef === session.sessionRef &&
        instruction.adapterSessionRef === session.adapterSessionRef &&
        instruction.adapterManifestRef === session.adapterManifestRef &&
        instruction.expectedSessionVersion ===
          prepared.body.expectedSessionVersion &&
        instruction.idempotencyKey === prepared.idempotencyKey &&
        instruction.payloadRef.dataRef === prepared.body.payloadRef.dataRef &&
        instruction.userVisibleSummary === prepared.body.userVisibleSummary &&
        computeDigest(instruction.requestDigest).value ===
          computeDigest(prepared.body.requestDigest).value;
      return {
        valid: exact,
        errors: exact ? [] : ["instruction: authoritative read-back mismatch"],
        value: exact ? instruction : undefined,
      };
    },
    "developer.instruction_v1",
  );
  if (created.ok === false) return created;
  input.idempotency.commit(
    operation,
    submissionDigest,
    prepared.idempotencyKey,
    created.data,
  );
  return {
    ok: true,
    session,
    instruction: created.data,
    payloadRef: uploaded.payloadRef,
  };
}

function prepareInstructionSubmission(input: {
  session: DeveloperSessionSummaryV1;
  payloadRef: DeveloperEncryptedDataRefV1;
  userVisibleSummary: string;
  now: string;
  expiresInMs?: number;
  idempotencyKey: string;
}): PreparedDeveloperInstructionSubmission {
  const issuedAt = input.now;
  const requestedExpiry =
    Date.parse(input.now) + (input.expiresInMs ?? 15 * 60 * 1000);
  const expiresAt = new Date(
    Math.min(requestedExpiry, Date.parse(input.payloadRef.expiresAt)),
  ).toISOString();
  const requestDigest = instructionRequestDigest({
    sessionRef: input.session.sessionRef,
    expectedSessionVersion: input.session.sessionVersion,
    payloadRef: input.payloadRef,
    userVisibleSummary: input.userVisibleSummary,
    issuedAt,
    expiresAt,
    idempotencyKey: input.idempotencyKey,
  });
  return {
    kind: "prepared_instruction_submission",
    idempotencyKey: input.idempotencyKey,
    body: {
      expectedSessionVersion: input.session.sessionVersion,
      requestDigest,
      payloadRef: input.payloadRef,
      userVisibleSummary: input.userVisibleSummary,
      issuedAt,
      expiresAt,
      idempotencyKey: input.idempotencyKey,
    },
  };
}

export async function createOrResumeDeveloperSession(
  input: Pick<
    DeveloperInstructionSubmitInput,
    | "transport"
    | "machine"
    | "workspaceRef"
    | "expectedMachineVersion"
    | "resumeDisposition"
    | "online"
    | "idempotency"
  >,
): Promise<DeveloperControlResult> {
  if (input.online !== true) {
    return {
      ok: false,
      state: {
        kind: "unavailable",
        capability: "developer.sessions_v1",
        reason: "offline_mutation_denied",
      },
    };
  }
  if (!input.workspaceRef) {
    return {
      ok: false,
      state: {
        kind: "unavailable",
        capability: "developer.sessions_v1",
        reason: "workspace_unpublished",
      },
    };
  }
  if (typeof input.expectedMachineVersion !== "number") {
    return {
      ok: false,
      state: {
        kind: "unavailable",
        capability: "developer.sessions_v1",
        reason: "machine_version_unpublished",
      },
    };
  }
  const body = {
    machineRef: input.machine.machineRef,
    workspaceRef: input.workspaceRef,
    expectedMachineVersion: input.expectedMachineVersion,
    ...(input.resumeDisposition
      ? { resumeDisposition: input.resumeDisposition }
      : {}),
  };
  const digest = computeDigest(body).value;
  const key = input.idempotency.begin(
    `session_create:${input.machine.machineRef}`,
    digest,
  );
  const replayed = input.idempotency.peek(
    `session_create:${input.machine.machineRef}`,
    digest,
  );
  if (replayed?.response) {
    return {
      ok: true,
      session: replayed.response as DeveloperSessionSummaryV1,
    };
  }
  const created = await developerWorkspaceMutate(
    input.transport,
    DEVELOPER_WORKSPACE_API_PATHS.sessions,
    body,
    key,
    (raw) => {
      const result = validateDeveloperSessionSummaryV1(raw);
      return {
        ...result,
        value: result.valid ? (raw as DeveloperSessionSummaryV1) : undefined,
      };
    },
    "developer.sessions_v1",
  );
  if (created.ok === false) return created;
  input.idempotency.commit(
    `session_create:${input.machine.machineRef}`,
    digest,
    key,
    created.data,
  );
  return { ok: true, session: created.data };
}

export async function cancelDeveloperInstruction(input: {
  transport: DeveloperWorkspaceTransport;
  instructionRef: string;
  expectedVersion: number;
  online: boolean;
  idempotency: DeveloperWorkspaceIdempotencyStore;
}): Promise<DeveloperWorkspaceLiveResult<DeveloperInstructionV1>> {
  if (input.online !== true) {
    queueDeveloperWorkspaceMutation();
    return { ok: false, state: { kind: "unknown", reason: "client_offline" } };
  }
  const body = { expectedVersion: input.expectedVersion };
  const digest = computeDigest(body).value;
  const key = input.idempotency.begin(
    `instruction_cancel:${input.instructionRef}`,
    digest,
  );
  return developerWorkspaceMutate(
    input.transport,
    DEVELOPER_WORKSPACE_API_PATHS.instructionCancel(input.instructionRef),
    body,
    key,
    (raw) => {
      const result = validateDeveloperInstructionV1(raw);
      return {
        ...result,
        value: result.valid ? (raw as DeveloperInstructionV1) : undefined,
      };
    },
    "developer.instruction_v1",
  );
}

export async function reconcileDeveloperInstruction(input: {
  transport: DeveloperWorkspaceTransport;
  sessionRef: string;
  instructionRef: string;
  actionRef: string;
  agentId?: string;
}): Promise<{
  session: DeveloperWorkspaceLiveResult<DeveloperSessionSummaryV1>;
  instruction: DeveloperWorkspaceLiveResult<DeveloperInstructionV1>;
  events: DeveloperWorkspaceLiveResult<{
    items: DeveloperSessionEventV1[];
    nextCursor?: string;
  }>;
  receipt: DeveloperWorkspaceLiveResult<DeveloperReceiptProjectionV1>;
  completed: boolean;
}> {
  const [session, instruction, events, receipt] = await Promise.all([
    getDeveloperSession(input.transport, input.sessionRef, input.agentId),
    getDeveloperInstruction(
      input.transport,
      input.instructionRef,
      input.agentId,
    ),
    listDeveloperInstructionEvents(input.transport, input.instructionRef),
    getDeveloperReceipt(input.transport, input.actionRef),
  ]);
  const completed =
    receipt.ok === true &&
    presentDeveloperReceipt(receipt.data).completed === true;
  return { session, instruction, events, receipt, completed };
}

async function uploadInstructionPlaintext(
  input: DeveloperInstructionSubmitInput,
  session: DeveloperSessionSummaryV1,
  plaintextDigest: string,
): Promise<
  | { ok: false; state: DeveloperWorkspaceLiveFailure }
  | {
      ok: true;
      payloadRef: DeveloperEncryptedDataRefV1 & { dataKind: "instruction" };
    }
> {
  if (
    input.machine.connection.status !== "online" ||
    !input.machine.shellBindingRef
  ) {
    return {
      ok: false,
      state: {
        kind: "unavailable",
        capability: "developer.data_plane_v1",
        reason: "machine_not_executable",
      },
    };
  }
  const body = {
    dataKind: "instruction",
    runtimeRef: input.machine.runtimeRef,
    deviceRef: input.machine.deviceRef,
    shellBindingRef: input.machine.shellBindingRef,
    bindingVersion: input.machine.shellBindingRef.version,
    plaintextBase64: utf8ToBase64(input.plaintext),
    purpose: "instruction_claim",
  };
  const requestDigest = computeDigest({
    sessionRef: session.sessionRef,
    dataKind: body.dataKind,
    runtimeRef: body.runtimeRef,
    deviceRef: body.deviceRef,
    shellBindingRef: body.shellBindingRef,
    bindingVersion: body.bindingVersion,
    purpose: body.purpose,
    plaintextDigest,
  }).value;
  const operation = `data_plane:${session.sessionRef}`;
  const replayed = input.idempotency.peek(operation, requestDigest);
  if (replayed?.response) {
    const validated = validateDeveloperEncryptedDataRefV1(replayed.response);
    if (
      !validated.valid ||
      !validated.value ||
      validated.value.dataKind !== "instruction" ||
      validated.value.runtimeRef.id !== input.machine.runtimeRef.id ||
      validated.value.runtimeRef.version !== input.machine.runtimeRef.version ||
      Date.parse(validated.value.expiresAt) <= Date.parse(input.now)
    ) {
      return {
        ok: false,
        state: {
          kind: "error",
          reason: "data_plane_replay_failed_closed",
          retryable: false,
        },
      };
    }
    return {
      ok: true,
      payloadRef: validated.value as DeveloperEncryptedDataRefV1 & {
        dataKind: "instruction";
      },
    };
  }
  const key =
    replayed?.key ?? input.idempotency.begin(operation, requestDigest);
  const uploaded = await developerWorkspaceMutate(
    input.transport,
    DEVELOPER_WORKSPACE_API_PATHS.dataPlane,
    body,
    key,
    (raw) => {
      const result = validateDeveloperEncryptedDataRefV1(raw);
      if (
        !result.valid ||
        !result.value ||
        result.value.dataKind !== "instruction" ||
        result.value.runtimeRef.id !== input.machine.runtimeRef.id ||
        result.value.runtimeRef.version !== input.machine.runtimeRef.version ||
        Date.parse(result.value.expiresAt) <= Date.parse(input.now)
      ) {
        return {
          valid: false,
          errors: result.errors.concat("dataRef binding"),
        };
      }
      return {
        valid: true,
        errors: [],
        value: result.value as DeveloperEncryptedDataRefV1 & {
          dataKind: "instruction";
        },
      };
    },
    "developer.data_plane_v1",
  );
  if (uploaded.ok === false) return uploaded;
  input.idempotency.commit(operation, requestDigest, key, uploaded.data);
  return { ok: true, payloadRef: uploaded.data };
}
