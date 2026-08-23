import {
  DEVELOPER_DATA_KINDS_V1,
  DEVELOPER_REMOTE_WORKSPACE_CANONICALIZATION,
  DEVELOPER_REMOTE_WORKSPACE_SCHEMA_VERSION,
  validateDeveloperApprovalDecisionV1,
  validateDeveloperApprovalRequestV1,
  validateDeveloperHandoffV1,
  validateDeveloperInstructionV1,
  validateDeveloperMachineProjectionV1,
  validateDeveloperSessionEventTransitionV1,
  validateDeveloperSessionEventV1,
  validateDeveloperSessionSummaryV1,
  type DeveloperApprovalDecisionV1,
  type DeveloperApprovalRequestV1,
  type DeveloperEncryptedDataRefV1,
  type DeveloperHandoffV1,
  type DeveloperInstructionV1,
  type DeveloperMachineProjectionV1,
  type DeveloperSessionEventV1,
  type DeveloperSessionSummaryV1,
} from "../../shared/types/developer-remote-workspace";
import { computeDigest } from "../../shared/types/trust-loop-primitives";
import {
  assertNoCallerIdentity,
  type DeveloperWorkspaceTransport,
} from "./developerWorkspaceAuth";
import { DEVELOPER_WORKSPACE_API_BASE } from "./developerWorkspaceFixtures";
import {
  assertAgentRouteMatch,
  type DeveloperWorkspaceReadState,
} from "./developerWorkspaceReadState";

export const DEVELOPER_WORKSPACE_API_PATHS = Object.freeze({
  machines: `${DEVELOPER_WORKSPACE_API_BASE}/machines`,
  machineSessions: (machineRef: string) =>
    `${DEVELOPER_WORKSPACE_API_BASE}/machines/${machineRef}/sessions`,
  sessions: `${DEVELOPER_WORKSPACE_API_BASE}/sessions`,
  session: (sessionRef: string) =>
    `${DEVELOPER_WORKSPACE_API_BASE}/sessions/${sessionRef}`,
  sessionInstructions: (sessionRef: string) =>
    `${DEVELOPER_WORKSPACE_API_BASE}/sessions/${sessionRef}/instructions`,
  sessionHandoffs: (sessionRef: string) =>
    `${DEVELOPER_WORKSPACE_API_BASE}/sessions/${sessionRef}/handoffs`,
  instruction: (instructionRef: string) =>
    `${DEVELOPER_WORKSPACE_API_BASE}/instructions/${instructionRef}`,
  instructionEvents: (instructionRef: string) =>
    `${DEVELOPER_WORKSPACE_API_BASE}/instructions/${instructionRef}/events`,
  instructionCancel: (instructionRef: string) =>
    `${DEVELOPER_WORKSPACE_API_BASE}/instructions/${instructionRef}/cancel`,
  approvals: `${DEVELOPER_WORKSPACE_API_BASE}/approvals`,
  approvalDecision: (approvalRef: string) =>
    `${DEVELOPER_WORKSPACE_API_BASE}/approvals/${approvalRef}/decisions`,
  receipts: (actionRef: string) =>
    `${DEVELOPER_WORKSPACE_API_BASE}/receipts/${actionRef}`,
  handoff: (handoffRef: string) =>
    `${DEVELOPER_WORKSPACE_API_BASE}/handoffs/${handoffRef}`,
  handoffAccept: (handoffRef: string) =>
    `${DEVELOPER_WORKSPACE_API_BASE}/handoffs/${handoffRef}/accept`,
  dataPlane: `${DEVELOPER_WORKSPACE_API_BASE}/data-plane`,
});

const CURSOR = /^[A-Za-z0-9_-]{1,512}$/;
const PAGE_KEYS = new Set(["items", "nextCursor"]);
const RECEIPT_KEYS = [
  "schemaVersion",
  "contractType",
  "actionRef",
  "instructionRef",
  "sessionRef",
  "instructionState",
  "actionBinding",
  "layers",
  "refs",
  "completed",
] as const;

export type DeveloperWorkspacePage<T> = {
  items: T[];
  nextCursor?: string;
};

export type DeveloperReceiptProjectionV1 = {
  schemaVersion: typeof DEVELOPER_REMOTE_WORKSPACE_SCHEMA_VERSION;
  contractType: "developer_receipt_projection";
  actionRef: string;
  instructionRef: string;
  sessionRef: string;
  instructionState: string;
  actionBinding: { status: string; reasonCode?: string | null };
  layers: {
    execution: { state: string };
    outcome: { state: string; outcomeRef?: string | null; reasonCode?: string };
    settlement: { state: string };
    verification: { state: string };
    remedy: { state: string };
  };
  refs: {
    actionRef: string;
    instructionRef: string;
    terminalResultRef: string | null;
    actionReceiptRef: string | null;
  };
  completed: boolean;
};

const RECEIPT_LAYER_STATES = new Set([
  "succeeded",
  "failed",
  "cancelled",
  "unknown_outcome",
  "recorded",
  "absent",
  "unavailable",
  "not_applicable",
]);
const RECEIPT_INSTRUCTION_STATES = new Set([
  "created",
  "offered",
  "claimed",
  "planning",
  "awaiting_approval",
  "running",
  "completed",
  "failed",
  "cancelled",
  "rejected",
  "unknown_outcome",
  "unavailable",
]);

export type DeveloperWorkspaceLiveFailure =
  | { kind: "unauthorized"; reason: string }
  | { kind: "unavailable"; capability: string; reason: string }
  | { kind: "unknown"; reason: string }
  | { kind: "error"; reason: string; retryable: boolean };

export type DeveloperWorkspaceLiveResult<T> =
  | { ok: true; data: T; capturedAt: string }
  | { ok: false; state: DeveloperWorkspaceLiveFailure };

export function mapDeveloperWorkspaceHttpFailure(
  status: number,
  json: unknown,
  capability: string,
): DeveloperWorkspaceLiveFailure {
  const envelope = readErrorEnvelope(json);
  if (status === 401)
    return {
      kind: "unauthorized",
      reason: envelope.reason || "authentication_required",
    };
  if (status === 403 || status === 404) {
    return { kind: "unauthorized", reason: "developer_not_found" };
  }
  if (status === 409)
    return {
      kind: "error",
      reason: envelope.reason || "conflict",
      retryable: false,
    };
  if (status === 400)
    return {
      kind: "error",
      reason: envelope.reason || "invalid",
      retryable: false,
    };
  if (status === 503) {
    return {
      kind: "unavailable",
      capability,
      reason: envelope.reason || "service_unavailable",
    };
  }
  return {
    kind: "error",
    reason: envelope.reason || "fail_closed",
    retryable: status >= 500,
  };
}

export function liveFailureToReadState<T = never>(
  failure: DeveloperWorkspaceLiveFailure,
): DeveloperWorkspaceReadState<T> {
  if (failure.kind === "unauthorized")
    return { kind: "unauthorized", reason: failure.reason };
  if (failure.kind === "unavailable") {
    return {
      kind: "unavailable",
      capability: failure.capability,
      reason: failure.reason,
    };
  }
  if (failure.kind === "unknown")
    return { kind: "unknown", reason: failure.reason };
  return {
    kind: "error",
    reason: failure.reason,
    retryable: failure.retryable,
  };
}

export function nonEnumeratingDeveloperCopy(zh: boolean): {
  title: string;
  detail: string;
} {
  return {
    title: zh ? "资源不存在或无权访问" : "Not found",
    detail: zh
      ? "对象不存在，或当前身份无权访问。"
      : "The object does not exist or this identity cannot access it.",
  };
}

export async function developerWorkspaceGet<T>(
  transport: DeveloperWorkspaceTransport,
  path: string,
  query: Record<string, string | undefined> | undefined,
  validate: (input: unknown) => { valid: boolean; errors: string[]; value?: T },
  capability: string,
): Promise<DeveloperWorkspaceLiveResult<T>> {
  try {
    const response = await transport({ method: "GET", path, query });
    return parseSuccess(response.status, response.json, validate, capability);
  } catch (error) {
    return transportFailure(error, capability);
  }
}

export async function developerWorkspaceMutate<T>(
  transport: DeveloperWorkspaceTransport,
  path: string,
  body: unknown,
  idempotencyKey: string,
  validate: (input: unknown) => { valid: boolean; errors: string[]; value?: T },
  capability: string,
  digestHeaders = false,
): Promise<DeveloperWorkspaceLiveResult<T>> {
  try {
    assertNoCallerIdentity(body);
    const response = await transport({
      method: "POST",
      path,
      body,
      idempotencyKey,
      digestHeaders,
    });
    return parseSuccess(response.status, response.json, validate, capability);
  } catch (error) {
    return transportFailure(error, capability);
  }
}

export async function listDeveloperMachines(
  transport: DeveloperWorkspaceTransport,
  input: { agentId?: string; cursor?: string } = {},
): Promise<
  DeveloperWorkspaceLiveResult<
    DeveloperWorkspacePage<DeveloperMachineProjectionV1>
  >
> {
  const cursor = requireCursor(input.cursor);
  if (cursor.ok === false) return { ok: false, state: cursor.state };
  const result = await developerWorkspaceGet(
    transport,
    DEVELOPER_WORKSPACE_API_PATHS.machines,
    { cursor: cursor.value },
    (raw) =>
      parsePage(raw, validateMachine, input.agentId, { filterAgent: true }),
    "developer.machines_v1",
  );
  return result;
}

export async function listDeveloperMachineSessions(
  transport: DeveloperWorkspaceTransport,
  machineRef: string,
  input: { agentId?: string; cursor?: string } = {},
): Promise<
  DeveloperWorkspaceLiveResult<
    DeveloperWorkspacePage<DeveloperSessionSummaryV1>
  >
> {
  const cursor = requireCursor(input.cursor);
  if (cursor.ok === false) return { ok: false, state: cursor.state };
  return developerWorkspaceGet<
    DeveloperWorkspacePage<DeveloperSessionSummaryV1>
  >(
    transport,
    DEVELOPER_WORKSPACE_API_PATHS.machineSessions(machineRef),
    { cursor: cursor.value },
    (raw) =>
      parsePage(raw, validateSession, input.agentId, { filterAgent: true }),
    "developer.sessions_v1",
  );
}

export async function getDeveloperSession(
  transport: DeveloperWorkspaceTransport,
  sessionRef: string,
  agentId?: string,
): Promise<DeveloperWorkspaceLiveResult<DeveloperSessionSummaryV1>> {
  return developerWorkspaceGet<DeveloperSessionSummaryV1>(
    transport,
    DEVELOPER_WORKSPACE_API_PATHS.session(sessionRef),
    undefined,
    (raw) => scoped(validateSession(raw), agentId),
    "developer.sessions_v1",
  );
}

export async function listDeveloperApprovals(
  transport: DeveloperWorkspaceTransport,
  input: { agentId?: string; cursor?: string; approvalRef?: string } = {},
): Promise<
  DeveloperWorkspaceLiveResult<
    DeveloperWorkspacePage<
      DeveloperApprovalRequestV1 | DeveloperApprovalDecisionV1
    >
  >
> {
  const cursor = requireCursor(input.cursor);
  if (cursor.ok === false) return { ok: false, state: cursor.state };
  return developerWorkspaceGet<
    DeveloperWorkspacePage<
      DeveloperApprovalRequestV1 | DeveloperApprovalDecisionV1
    >
  >(
    transport,
    DEVELOPER_WORKSPACE_API_PATHS.approvals,
    { cursor: cursor.value, approvalRef: input.approvalRef },
    (raw) =>
      parsePage<DeveloperApprovalRequestV1 | DeveloperApprovalDecisionV1>(
        raw,
        validateApproval,
        input.agentId,
        { filterAgent: true },
      ),
    "developer.approvals_v1",
  );
}

export async function getDeveloperApprovalExact(
  transport: DeveloperWorkspaceTransport,
  approvalRef: string,
  agentId?: string,
): Promise<
  DeveloperWorkspaceLiveResult<
    DeveloperApprovalRequestV1 | DeveloperApprovalDecisionV1
  >
> {
  const listed = await listDeveloperApprovals(transport, {
    agentId,
    approvalRef,
  });
  if (listed.ok === false) return listed;
  if (listed.data.items.length !== 1) {
    return {
      ok: false,
      state: { kind: "unauthorized", reason: "developer_not_found" },
    };
  }
  return {
    ok: true,
    data: listed.data.items[0],
    capturedAt: listed.capturedAt,
  };
}

export async function getDeveloperInstruction(
  transport: DeveloperWorkspaceTransport,
  instructionRef: string,
  agentId?: string,
): Promise<DeveloperWorkspaceLiveResult<DeveloperInstructionV1>> {
  return developerWorkspaceGet(
    transport,
    DEVELOPER_WORKSPACE_API_PATHS.instruction(instructionRef),
    undefined,
    (raw) => scoped(validateInstruction(raw), agentId),
    "developer.instructions_v1",
  );
}

export async function listDeveloperInstructionEvents(
  transport: DeveloperWorkspaceTransport,
  instructionRef: string,
  cursor?: string,
): Promise<
  DeveloperWorkspaceLiveResult<DeveloperWorkspacePage<DeveloperSessionEventV1>>
> {
  const parsedCursor = requireCursor(cursor);
  if (parsedCursor.ok === false)
    return { ok: false, state: parsedCursor.state };
  const result = await developerWorkspaceGet(
    transport,
    DEVELOPER_WORKSPACE_API_PATHS.instructionEvents(instructionRef),
    { cursor: parsedCursor.value },
    (raw) => parsePage(raw, validateEvent),
    "developer.events_v1",
  );
  if (result.ok === false) return result;
  const ordered = assertEventOrder(result.data.items);
  if (ordered.ok === false) return { ok: false, state: ordered.state };
  return result;
}

export async function getDeveloperReceipt(
  transport: DeveloperWorkspaceTransport,
  actionRef: string,
): Promise<DeveloperWorkspaceLiveResult<DeveloperReceiptProjectionV1>> {
  return developerWorkspaceGet(
    transport,
    DEVELOPER_WORKSPACE_API_PATHS.receipts(actionRef),
    undefined,
    validateReceiptProjection,
    "developer.receipts_v1",
  );
}

export async function getDeveloperHandoff(
  transport: DeveloperWorkspaceTransport,
  handoffRef: string,
  agentId?: string,
): Promise<DeveloperWorkspaceLiveResult<DeveloperHandoffV1>> {
  return developerWorkspaceGet(
    transport,
    DEVELOPER_WORKSPACE_API_PATHS.handoff(handoffRef),
    undefined,
    (raw) => scoped(validateHandoff(raw), agentId),
    "developer.handoffs_v1",
  );
}

export function validateDeveloperEncryptedDataRefV1(input: unknown): {
  valid: boolean;
  errors: string[];
  value?: DeveloperEncryptedDataRefV1;
} {
  if (input == null) return { valid: false, errors: ["dataRef: null"] };
  if (typeof input !== "object" || Array.isArray(input))
    return { valid: false, errors: ["dataRef: expected object"] };
  const record = input as Record<string, unknown>;
  const extra = Object.keys(record).filter(
    (key) =>
      ![
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
      ].includes(key),
  );
  if (extra.length)
    return { valid: false, errors: [`dataRef: unknown field ${extra[0]}`] };
  if (record.kind !== "encrypted_data_ref")
    return { valid: false, errors: ["dataRef.kind"] };
  if (
    typeof record.dataKind !== "string" ||
    !(DEVELOPER_DATA_KINDS_V1 as readonly string[]).includes(record.dataKind)
  )
    return { valid: false, errors: ["dataRef.dataKind"] };
  if (
    typeof record.dataRef !== "string" ||
    !/^[A-Za-z0-9][A-Za-z0-9._~-]{0,127}$/.test(record.dataRef)
  ) {
    return { valid: false, errors: ["dataRef.dataRef"] };
  }
  if (
    record.encryption !== "runtime_managed" ||
    record.ownerScope !== "authenticated_owner"
  ) {
    return { valid: false, errors: ["dataRef.encryption"] };
  }
  if (
    record.dataClass !== "owner_private" &&
    record.dataClass !== "restricted"
  ) {
    return { valid: false, errors: ["dataRef.dataClass"] };
  }
  if (
    typeof record.sizeBytes !== "number" ||
    !Number.isSafeInteger(record.sizeBytes) ||
    record.sizeBytes <= 0
  )
    return { valid: false, errors: ["dataRef.sizeBytes"] };
  if (!isExactDigest(record.digest))
    return { valid: false, errors: ["dataRef.digest"] };
  if (
    !record.runtimeRef ||
    typeof record.runtimeRef !== "object" ||
    Array.isArray(record.runtimeRef)
  )
    return { valid: false, errors: ["dataRef.runtimeRef"] };
  const runtimeRef = record.runtimeRef as Record<string, unknown>;
  if (
    Object.keys(runtimeRef).some(
      (key) => !["type", "id", "version", "digest"].includes(key),
    ) ||
    runtimeRef.type !== "runtime" ||
    typeof runtimeRef.id !== "string" ||
    !/^[A-Za-z0-9][A-Za-z0-9._~-]{0,127}$/.test(runtimeRef.id) ||
    typeof runtimeRef.version !== "number" ||
    !Number.isSafeInteger(runtimeRef.version) ||
    runtimeRef.version <= 0 ||
    (runtimeRef.digest !== undefined && !isExactDigest(runtimeRef.digest))
  )
    return { valid: false, errors: ["dataRef.runtimeRef"] };
  if (
    typeof record.expiresAt !== "string" ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(record.expiresAt) ||
    Number.isNaN(Date.parse(record.expiresAt)) ||
    new Date(record.expiresAt).toISOString() !== record.expiresAt
  )
    return { valid: false, errors: ["dataRef.expiresAt"] };
  return {
    valid: true,
    errors: [],
    value: record as unknown as DeveloperEncryptedDataRefV1,
  };
}

function isExactDigest(value: unknown): boolean {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const digest = value as Record<string, unknown>;
  return (
    Object.keys(digest).every((key) =>
      ["algorithm", "canonicalization", "value"].includes(key),
    ) &&
    digest.algorithm === "sha-256" &&
    digest.canonicalization === DEVELOPER_REMOTE_WORKSPACE_CANONICALIZATION &&
    typeof digest.value === "string" &&
    /^[0-9a-f]{64}$/.test(digest.value)
  );
}

export function validateReceiptProjection(input: unknown): {
  valid: boolean;
  errors: string[];
  value?: DeveloperReceiptProjectionV1;
} {
  if (input == null) return { valid: false, errors: ["receipt: null"] };
  if (typeof input !== "object" || Array.isArray(input))
    return { valid: false, errors: ["receipt: expected object"] };
  const record = input as Record<string, unknown>;
  const extra = Object.keys(record).filter(
    (key) => !(RECEIPT_KEYS as readonly string[]).includes(key),
  );
  if (extra.length)
    return { valid: false, errors: [`receipt: unknown field ${extra[0]}`] };
  if (record.schemaVersion !== DEVELOPER_REMOTE_WORKSPACE_SCHEMA_VERSION) {
    return { valid: false, errors: ["receipt.schemaVersion"] };
  }
  if (record.contractType !== "developer_receipt_projection") {
    return { valid: false, errors: ["receipt.contractType"] };
  }
  for (const key of ["actionRef", "instructionRef", "sessionRef"] as const) {
    if (
      typeof record[key] !== "string" ||
      !/^[A-Za-z0-9][A-Za-z0-9._~-]{0,127}$/.test(record[key] as string)
    )
      return { valid: false, errors: [`receipt.${key}`] };
  }
  if (
    typeof record.instructionState !== "string" ||
    !RECEIPT_INSTRUCTION_STATES.has(record.instructionState)
  )
    return { valid: false, errors: ["receipt.instructionState"] };
  if (typeof record.completed !== "boolean")
    return { valid: false, errors: ["receipt.completed"] };
  if (!isPlainRecord(record.actionBinding))
    return { valid: false, errors: ["receipt.actionBinding"] };
  if (
    Object.keys(record.actionBinding).some(
      (key) => !["status", "reasonCode"].includes(key),
    ) ||
    !["bound", "unavailable"].includes(String(record.actionBinding.status)) ||
    (record.actionBinding.reasonCode !== undefined &&
      record.actionBinding.reasonCode !== null &&
      typeof record.actionBinding.reasonCode !== "string")
  )
    return { valid: false, errors: ["receipt.actionBinding"] };
  if (
    typeof record.layers !== "object" ||
    record.layers == null ||
    Array.isArray(record.layers)
  ) {
    return { valid: false, errors: ["receipt.layers"] };
  }
  if (
    Object.keys(record.layers).some(
      (key) =>
        ![
          "execution",
          "outcome",
          "settlement",
          "verification",
          "remedy",
        ].includes(key),
    )
  )
    return { valid: false, errors: ["receipt.layers"] };
  const layers = record.layers as DeveloperReceiptProjectionV1["layers"];
  for (const layer of [
    "execution",
    "settlement",
    "verification",
    "remedy",
  ] as const) {
    const value = layers[layer];
    if (
      !isPlainRecord(value) ||
      Object.keys(value).some((key) => key !== "state") ||
      typeof value.state !== "string" ||
      !RECEIPT_LAYER_STATES.has(value.state)
    )
      return { valid: false, errors: [`receipt.layers.${layer}`] };
  }
  if (
    !isPlainRecord(layers.outcome) ||
    Object.keys(layers.outcome).some(
      (key) => !["state", "outcomeRef", "reasonCode"].includes(key),
    ) ||
    typeof layers.outcome.state !== "string" ||
    !RECEIPT_LAYER_STATES.has(layers.outcome.state) ||
    (layers.outcome.outcomeRef !== undefined &&
      layers.outcome.outcomeRef !== null &&
      typeof layers.outcome.outcomeRef !== "string") ||
    (layers.outcome.reasonCode !== undefined &&
      typeof layers.outcome.reasonCode !== "string")
  )
    return { valid: false, errors: ["receipt.layers.outcome"] };
  if (!isPlainRecord(record.refs))
    return { valid: false, errors: ["receipt.refs"] };
  if (
    Object.keys(record.refs).some(
      (key) =>
        ![
          "actionRef",
          "instructionRef",
          "terminalResultRef",
          "actionReceiptRef",
        ].includes(key),
    ) ||
    record.refs.actionRef !== record.actionRef ||
    record.refs.instructionRef !== record.instructionRef ||
    !nullableOpaqueRef(record.refs.terminalResultRef) ||
    !nullableOpaqueRef(record.refs.actionReceiptRef)
  )
    return { valid: false, errors: ["receipt.refs"] };
  if (record.completed === true) {
    if (
      record.instructionState !== "completed" ||
      layers.execution?.state !== "succeeded" ||
      layers.outcome?.state === "absent" ||
      layers.outcome?.state === "unavailable" ||
      record.refs.terminalResultRef === null ||
      record.refs.actionReceiptRef === null
    ) {
      return {
        valid: false,
        errors: ["receipt.completed: canonical layers missing"],
      };
    }
  }
  return {
    valid: true,
    errors: [],
    value: record as unknown as DeveloperReceiptProjectionV1,
  };
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function nullableOpaqueRef(value: unknown): boolean {
  return (
    value === null ||
    (typeof value === "string" &&
      /^[A-Za-z0-9][A-Za-z0-9._~-]{0,127}$/.test(value))
  );
}

export function presentDeveloperReceipt(
  receipt: DeveloperReceiptProjectionV1,
): {
  completed: boolean;
  layers: Array<{ layer: string; state: string; reason: string }>;
} {
  const completed = receipt.completed === true;
  const layerState = (state: string, layerCompleted: boolean) => {
    if (state === "succeeded" && !layerCompleted) return "unknown";
    return state;
  };
  return {
    completed,
    layers: [
      {
        layer: "action",
        state: layerState(receipt.layers.execution.state, completed),
        reason: receipt.instructionState,
      },
      {
        layer: "authority",
        state:
          receipt.actionBinding.status === "bound" ? "recorded" : "unavailable",
        reason:
          receipt.actionBinding.reasonCode ?? receipt.actionBinding.status,
      },
      {
        layer: "outcome",
        state: layerState(receipt.layers.outcome.state, completed),
        reason:
          receipt.layers.outcome.reasonCode ?? receipt.layers.outcome.state,
      },
      {
        layer: "settlement",
        state: receipt.layers.settlement.state,
        reason: receipt.layers.settlement.state,
      },
      {
        layer: "fulfilment",
        state: receipt.layers.verification.state,
        reason: receipt.layers.remedy.state,
      },
    ],
  };
}

export function instructionRequestDigest(input: {
  sessionRef: string;
  expectedSessionVersion: number;
  payloadRef: DeveloperEncryptedDataRefV1;
  userVisibleSummary: string;
  issuedAt: string;
  expiresAt: string;
  idempotencyKey: string;
}) {
  return computeDigest(input);
}

function parseSuccess<T>(
  status: number,
  json: unknown,
  validate: (input: unknown) => { valid: boolean; errors: string[]; value?: T },
  capability: string,
): DeveloperWorkspaceLiveResult<T> {
  if (status < 200 || status >= 300) {
    return {
      ok: false,
      state: mapDeveloperWorkspaceHttpFailure(status, json, capability),
    };
  }
  const data = unwrapData(json);
  if (data.ok === false) return { ok: false, state: data.state };
  const validated = validate(data.value);
  if (!validated.valid || !validated.value) {
    return {
      ok: false,
      state: {
        kind: "error",
        reason: "live_api_failed_closed",
        retryable: false,
      },
    };
  }
  return {
    ok: true,
    data: validated.value,
    capturedAt: new Date().toISOString(),
  };
}

function unwrapData(
  json: unknown,
):
  | { ok: true; value: unknown }
  | { ok: false; state: DeveloperWorkspaceLiveFailure } {
  if (json == null || typeof json !== "object" || Array.isArray(json)) {
    return {
      ok: false,
      state: {
        kind: "error",
        reason: "live_api_failed_closed",
        retryable: false,
      },
    };
  }
  const record = json as Record<string, unknown>;
  if (record.success === false) {
    return {
      ok: false,
      state: {
        kind: "error",
        reason: readErrorEnvelope(json).reason,
        retryable: false,
      },
    };
  }
  if (record.success !== true || !("data" in record)) {
    return {
      ok: false,
      state: {
        kind: "error",
        reason: "live_api_failed_closed",
        retryable: false,
      },
    };
  }
  if (record.data === null) {
    return {
      ok: false,
      state: {
        kind: "error",
        reason: "live_api_failed_closed",
        retryable: false,
      },
    };
  }
  return { ok: true, value: record.data };
}

function parsePage<T>(
  raw: unknown,
  validateItem: (input: unknown) => {
    valid: boolean;
    errors: string[];
    value?: T;
  },
  agentId?: string,
  options: { filterAgent?: boolean } = {},
): { valid: boolean; errors: string[]; value?: DeveloperWorkspacePage<T> } {
  if (raw == null) return { valid: false, errors: ["page: null"] };
  if (typeof raw !== "object" || Array.isArray(raw))
    return { valid: false, errors: ["page: expected object"] };
  const record = raw as Record<string, unknown>;
  const extra = Object.keys(record).filter((key) => !PAGE_KEYS.has(key));
  if (extra.length)
    return { valid: false, errors: [`page: unknown field ${extra[0]}`] };
  if (!Array.isArray(record.items))
    return { valid: false, errors: ["page.items"] };
  if (
    record.nextCursor != null &&
    (typeof record.nextCursor !== "string" || !CURSOR.test(record.nextCursor))
  ) {
    return { valid: false, errors: ["page.nextCursor"] };
  }
  const items: T[] = [];
  for (const item of record.items) {
    const validated = validateItem(item);
    if (!validated.valid || !validated.value)
      return { valid: false, errors: validated.errors };
    if (options.filterAgent && agentId) {
      const recordAgentId = (validated.value as { agentId?: string }).agentId;
      if (typeof recordAgentId === "string" && recordAgentId !== agentId)
        continue;
    } else {
      const scopedItem = scoped(validated, agentId);
      if (!scopedItem.valid || !scopedItem.value)
        return { valid: false, errors: scopedItem.errors };
    }
    items.push(validated.value);
  }
  return {
    valid: true,
    errors: [],
    value: {
      items,
      ...(typeof record.nextCursor === "string"
        ? { nextCursor: record.nextCursor }
        : {}),
    },
  };
}

function scoped<T>(
  result: { valid: boolean; errors: string[]; value?: T },
  agentId?: string,
): { valid: boolean; errors: string[]; value?: T } {
  if (!result.valid || !result.value || !agentId) return result;
  const record = result.value as { agentId?: string };
  if (typeof record.agentId !== "string") return result;
  const mismatch = assertAgentRouteMatch(agentId, record.agentId);
  if (mismatch) return { valid: false, errors: [mismatch.reason] };
  return result;
}

function validateMachine(input: unknown) {
  const result = validateDeveloperMachineProjectionV1(input);
  return {
    ...result,
    value: result.valid ? (input as DeveloperMachineProjectionV1) : undefined,
  };
}

function validateSession(input: unknown) {
  const result = validateDeveloperSessionSummaryV1(input);
  return {
    ...result,
    value: result.valid ? (input as DeveloperSessionSummaryV1) : undefined,
  };
}

function validateInstruction(input: unknown) {
  const result = validateDeveloperInstructionV1(input);
  return {
    ...result,
    value: result.valid ? (input as DeveloperInstructionV1) : undefined,
  };
}

function validateEvent(input: unknown) {
  const result = validateDeveloperSessionEventV1(input);
  return {
    ...result,
    value: result.valid ? (input as DeveloperSessionEventV1) : undefined,
  };
}

function validateApproval(input: unknown) {
  const request = validateDeveloperApprovalRequestV1(input);
  if (request.valid)
    return {
      valid: true,
      errors: [],
      value: input as DeveloperApprovalRequestV1,
    };
  const decision = validateDeveloperApprovalDecisionV1(input);
  return {
    ...decision,
    value: decision.valid ? (input as DeveloperApprovalDecisionV1) : undefined,
  };
}

function validateHandoff(input: unknown) {
  const result = validateDeveloperHandoffV1(input);
  return {
    ...result,
    value: result.valid ? (input as DeveloperHandoffV1) : undefined,
  };
}

function assertEventOrder(
  events: DeveloperSessionEventV1[],
): { ok: true } | { ok: false; state: DeveloperWorkspaceLiveFailure } {
  for (let i = 0; i < events.length; i += 1) {
    const event = events[i];
    if (i === 0 && event.previousSequence !== 0 && event.sequence !== 1) {
      return {
        ok: false,
        state: {
          kind: "error",
          reason: "event_sequence_invalid",
          retryable: false,
        },
      };
    }
    if (i > 0) {
      const previous = events[i - 1];
      const transition = validateDeveloperSessionEventTransitionV1(
        previous,
        event,
      );
      if (!transition.valid) {
        return {
          ok: false,
          state: {
            kind: "error",
            reason: "event_sequence_invalid",
            retryable: false,
          },
        };
      }
    }
  }
  return { ok: true };
}

function requireCursor(
  cursor?: string,
):
  | { ok: true; value?: string }
  | { ok: false; state: DeveloperWorkspaceLiveFailure } {
  if (cursor == null || cursor === "") return { ok: true, value: undefined };
  if (!CURSOR.test(cursor)) {
    return {
      ok: false,
      state: {
        kind: "error",
        reason: "live_api_failed_closed",
        retryable: false,
      },
    };
  }
  return { ok: true, value: cursor };
}

function readErrorEnvelope(json: unknown): { reason: string } {
  if (json && typeof json === "object" && !Array.isArray(json)) {
    const error = (json as { error?: { reason?: unknown; code?: unknown } })
      .error;
    if (typeof error?.reason === "string") return { reason: error.reason };
    if (typeof error?.code === "string") return { reason: error.code };
  }
  return { reason: "fail_closed" };
}

function transportFailure(
  error: unknown,
  capability: string,
): DeveloperWorkspaceLiveResult<never> {
  const code =
    error && typeof error === "object" && "code" in error
      ? String((error as { code?: unknown }).code)
      : "";
  if (code === "offline") {
    return { ok: false, state: { kind: "unknown", reason: "client_offline" } };
  }
  if (code === "identity_in_body") {
    return {
      ok: false,
      state: {
        kind: "error",
        reason: "identity_must_come_from_token",
        retryable: false,
      },
    };
  }
  return {
    ok: false,
    state: {
      kind: "error",
      reason: "developer_api_unreachable",
      retryable: true,
    },
  };
}

export function utf8ToBase64(text: string): string {
  if (typeof Buffer !== "undefined")
    return Buffer.from(text, "utf8").toString("base64");
  const encoded = encodeURIComponent(text).replace(
    /%([0-9A-F]{2})/g,
    (_, hex) => String.fromCharCode(Number.parseInt(hex, 16)),
  );
  return btoa(encoded);
}
