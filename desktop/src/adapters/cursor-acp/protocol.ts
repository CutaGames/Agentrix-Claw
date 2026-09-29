/**
 * Cursor ACP method allowlist and fail-closed parsers.
 * DEVELOPMENT_SPIKE_ONLY. Unknown methods, schemas, and extra fields do not proceed.
 */

import {
  CURSOR_ACP_AGENT_NOTIFICATION_METHODS,
  CURSOR_ACP_AGENT_REQUEST_METHODS,
  CURSOR_ACP_AUTH_METHOD_ID,
  CURSOR_ACP_CLIENT_NOTIFICATION_METHODS,
  CURSOR_ACP_CLIENT_REQUEST_METHODS,
  CURSOR_ACP_PERMISSION_OPTION_IDS,
  CURSOR_ACP_PROTOCOL_VERSION,
  CURSOR_ACP_SESSION_UPDATE_TYPES,
  CURSOR_ACP_STOP_REASONS,
} from "./constants";
import { assertExactKeys, CursorAcpJsonRpcError } from "./json-rpc";

const CLIENT_REQUESTS = new Set<string>(CURSOR_ACP_CLIENT_REQUEST_METHODS);
const CLIENT_NOTIFICATIONS = new Set<string>(
  CURSOR_ACP_CLIENT_NOTIFICATION_METHODS,
);
const AGENT_REQUESTS = new Set<string>(CURSOR_ACP_AGENT_REQUEST_METHODS);
const AGENT_NOTIFICATIONS = new Set<string>(
  CURSOR_ACP_AGENT_NOTIFICATION_METHODS,
);
const PERMISSION_OPTIONS = new Set<string>(CURSOR_ACP_PERMISSION_OPTION_IDS);
const STOP_REASONS = new Set<string>(CURSOR_ACP_STOP_REASONS);
const SESSION_UPDATES = new Set<string>(CURSOR_ACP_SESSION_UPDATE_TYPES);

export function assertClientRequestMethod(method: string): void {
  if (!CLIENT_REQUESTS.has(method)) {
    throw new CursorAcpJsonRpcError(
      "unknown_method",
      `client request ${method} is not in the spike subset`,
    );
  }
}

export function assertClientNotificationMethod(method: string): void {
  if (!CLIENT_NOTIFICATIONS.has(method)) {
    throw new CursorAcpJsonRpcError(
      "unknown_method",
      `client notification ${method} is not in the spike subset`,
    );
  }
}

export function assertAgentRequestMethod(method: string): void {
  if (!AGENT_REQUESTS.has(method)) {
    throw new CursorAcpJsonRpcError(
      "unknown_method",
      `agent request ${method} is not in the spike subset`,
    );
  }
}

export function assertAgentNotificationMethod(method: string): void {
  if (!AGENT_NOTIFICATIONS.has(method)) {
    throw new CursorAcpJsonRpcError(
      "unknown_method",
      `agent notification ${method} is not in the spike subset`,
    );
  }
}

export function parseInitializeResult(value: unknown): {
  protocolVersion: number;
  authMethodId: typeof CURSOR_ACP_AUTH_METHOD_ID;
} {
  const record = asObject(value, "initialize");
  assertExactKeys(
    record,
    ["protocolVersion"],
    ["_meta", "agentCapabilities", "agentInfo", "authMethods"],
    "initialize",
  );
  assertReservedMeta(record._meta, "initialize._meta");
  const protocolVersion = record.protocolVersion;
  if (protocolVersion !== CURSOR_ACP_PROTOCOL_VERSION) {
    throw new CursorAcpJsonRpcError(
      "unknown_schema",
      "initialize protocolVersion is not the negotiated spike version",
    );
  }
  if (record.agentCapabilities !== undefined) {
    parseAgentCapabilities(
      record.agentCapabilities,
      "initialize.agentCapabilities",
    );
  }
  if (record.agentInfo !== undefined) {
    parseImplementation(record.agentInfo, "initialize.agentInfo");
  }
  const methods = Array.isArray(record.authMethods) ? record.authMethods : [];
  if (record.authMethods !== undefined && !Array.isArray(record.authMethods)) {
    throw new CursorAcpJsonRpcError(
      "unknown_schema",
      "initialize.authMethods must be array",
    );
  }
  const hasCursorLogin = methods.some((entry, index) => {
    const method = parseAuthMethod(entry, `initialize.authMethods[${index}]`);
    return method.id === CURSOR_ACP_AUTH_METHOD_ID;
  });
  if (!hasCursorLogin) {
    throw new CursorAcpJsonRpcError(
      "unknown_schema",
      "initialize did not advertise cursor_login",
    );
  }
  return {
    protocolVersion,
    authMethodId: CURSOR_ACP_AUTH_METHOD_ID,
  };
}

export function parseAuthenticateResult(value: unknown): Record<string, never> {
  const record = asObject(value, "authenticate");
  assertExactKeys(record, [], ["_meta"], "authenticate");
  assertReservedMeta(record._meta, "authenticate._meta");
  return {};
}

export function parseNewSessionResult(value: unknown): { sessionId: string } {
  const record = asObject(value, "session/new");
  assertExactKeys(
    record,
    ["sessionId"],
    ["_meta", "configOptions", "modes"],
    "session/new",
  );
  assertReservedMeta(record._meta, "session/new._meta");
  assertOfficialNullable(record.configOptions, "session/new.configOptions");
  assertOfficialNullable(record.modes, "session/new.modes");
  const sessionId = record.sessionId;
  if (typeof sessionId !== "string" || sessionId.trim().length === 0) {
    throw new CursorAcpJsonRpcError(
      "unknown_schema",
      "session/new requires sessionId",
    );
  }
  return { sessionId };
}

export function parseLoadSessionResult(value: unknown): Record<string, never> {
  const record = asObject(value, "session/load");
  assertExactKeys(
    record,
    [],
    ["_meta", "configOptions", "modes"],
    "session/load",
  );
  assertReservedMeta(record._meta, "session/load._meta");
  assertOfficialNullable(record.configOptions, "session/load.configOptions");
  assertOfficialNullable(record.modes, "session/load.modes");
  return {};
}

export function parseListSessionsResult(value: unknown): {
  sessionIds: string[];
} {
  const record = asObject(value, "session/list");
  assertExactKeys(
    record,
    ["sessions"],
    ["_meta", "nextCursor"],
    "session/list",
  );
  assertReservedMeta(record._meta, "session/list._meta");
  if (
    record.nextCursor !== undefined &&
    typeof record.nextCursor !== "string"
  ) {
    throw new CursorAcpJsonRpcError(
      "unknown_schema",
      "session/list.nextCursor must be string",
    );
  }
  if (!Array.isArray(record.sessions)) {
    throw new CursorAcpJsonRpcError(
      "unknown_schema",
      "session/list requires sessions",
    );
  }
  const sessionIds: string[] = [];
  for (const [index, entry] of record.sessions.entries()) {
    sessionIds.push(parseSessionInfo(entry, `session/list.sessions[${index}]`));
  }
  return { sessionIds };
}

export function parsePromptResult(value: unknown): { stopReason: string } {
  const record = asObject(value, "session/prompt");
  assertExactKeys(record, ["stopReason"], ["_meta"], "session/prompt");
  assertReservedMeta(record._meta, "session/prompt._meta");
  if (
    typeof record.stopReason !== "string" ||
    !STOP_REASONS.has(record.stopReason)
  ) {
    throw new CursorAcpJsonRpcError(
      "unknown_schema",
      "session/prompt stopReason is unknown",
    );
  }
  return { stopReason: record.stopReason };
}

export function parseSessionUpdate(value: unknown): {
  sessionId: string;
  sessionUpdate: string;
} {
  const record = asObject(value, "session/update");
  assertExactKeys(record, ["sessionId", "update"], ["_meta"], "session/update");
  assertReservedMeta(record._meta, "session/update._meta");
  const update = asObject(record.update, "session/update.update");
  if (
    typeof update.sessionUpdate !== "string" ||
    !SESSION_UPDATES.has(update.sessionUpdate)
  ) {
    throw new CursorAcpJsonRpcError(
      "unknown_schema",
      "session/update sessionUpdate is unknown",
    );
  }
  assertExactKeys(
    update,
    ["sessionUpdate"],
    sessionUpdateOptionalKeys(update.sessionUpdate),
    "session/update.update",
  );
  assertReservedMeta(update._meta, "session/update.update._meta");
  if (typeof record.sessionId !== "string" || record.sessionId.length === 0) {
    throw new CursorAcpJsonRpcError(
      "unknown_schema",
      "session/update requires sessionId",
    );
  }
  if (update.content !== undefined) {
    parseContentBlock(update.content, "session/update.update.content");
  }
  if (update.entries !== undefined) {
    parsePlanEntries(update.entries, "session/update.update.entries");
  }
  if (update.locations !== undefined) {
    parseToolCallLocations(update.locations, "session/update.update.locations");
  }
  assertOpaqueOfficialBag(update.rawInput, "session/update.update.rawInput");
  assertOpaqueOfficialBag(update.rawOutput, "session/update.update.rawOutput");
  return {
    sessionId: record.sessionId,
    sessionUpdate: update.sessionUpdate,
  };
}

export function parsePermissionRequest(value: unknown): {
  sessionId: string;
  toolCallId: string;
  toolName: string;
  optionIds: string[];
  argumentDigestSource: unknown;
} {
  const record = asObject(value, "session/request_permission");
  assertExactKeys(
    record,
    ["sessionId", "options", "toolCall"],
    ["_meta"],
    "session/request_permission",
  );
  assertReservedMeta(record._meta, "session/request_permission._meta");
  if (typeof record.sessionId !== "string" || record.sessionId.length === 0) {
    throw new CursorAcpJsonRpcError(
      "unknown_schema",
      "session/request_permission requires sessionId",
    );
  }
  if (!Array.isArray(record.options) || record.options.length === 0) {
    throw new CursorAcpJsonRpcError(
      "unknown_schema",
      "session/request_permission requires options",
    );
  }
  const optionIds = record.options.map((entry, index) => {
    const option = asObject(
      entry,
      `session/request_permission.options[${index}]`,
    );
    assertExactKeys(
      option,
      ["optionId"],
      ["_meta", "kind", "name"],
      `session/request_permission.options[${index}]`,
    );
    assertReservedMeta(
      option._meta,
      `session/request_permission.options[${index}]._meta`,
    );
    if (
      typeof option.optionId !== "string" ||
      !PERMISSION_OPTIONS.has(option.optionId)
    ) {
      throw new CursorAcpJsonRpcError(
        "unknown_schema",
        "permission optionId is unknown",
      );
    }
    return option.optionId;
  });
  const toolCall = asObject(
    record.toolCall,
    "session/request_permission.toolCall",
  );
  assertExactKeys(
    toolCall,
    ["toolCallId"],
    [
      "_meta",
      "content",
      "kind",
      "locations",
      "rawInput",
      "rawOutput",
      "status",
      "title",
    ],
    "session/request_permission.toolCall",
  );
  assertReservedMeta(
    toolCall._meta,
    "session/request_permission.toolCall._meta",
  );
  if (toolCall.content !== undefined) {
    parseToolCallContent(
      toolCall.content,
      "session/request_permission.toolCall.content",
    );
  }
  if (toolCall.locations !== undefined) {
    parseToolCallLocations(
      toolCall.locations,
      "session/request_permission.toolCall.locations",
    );
  }
  assertOpaqueOfficialBag(
    toolCall.rawInput,
    "session/request_permission.toolCall.rawInput",
  );
  assertOpaqueOfficialBag(
    toolCall.rawOutput,
    "session/request_permission.toolCall.rawOutput",
  );
  if (
    typeof toolCall.toolCallId !== "string" ||
    toolCall.toolCallId.length === 0
  ) {
    throw new CursorAcpJsonRpcError(
      "unknown_schema",
      "toolCall.toolCallId is required",
    );
  }
  const toolName =
    typeof toolCall.title === "string" && toolCall.title.trim().length > 0
      ? toolCall.title
      : "tool_call";
  return {
    sessionId: record.sessionId,
    toolCallId: toolCall.toolCallId,
    toolName,
    optionIds,
    argumentDigestSource: {
      toolCallId: toolCall.toolCallId,
      kind: toolCall.kind ?? null,
      rawInput: toolCall.rawInput ?? null,
    },
  };
}

export function selectedPermissionOutcome(optionId: string): unknown {
  if (!PERMISSION_OPTIONS.has(optionId)) {
    throw new CursorAcpJsonRpcError(
      "unknown_schema",
      "permission decision optionId is unknown",
    );
  }
  return { outcome: { outcome: "selected", optionId } };
}

export function cancelledPermissionOutcome(): unknown {
  return { outcome: { outcome: "cancelled" } };
}

function sessionUpdateOptionalKeys(sessionUpdate: string): readonly string[] {
  if (
    sessionUpdate === "agent_message_chunk" ||
    sessionUpdate === "agent_thought_chunk"
  ) {
    return ["_meta", "content", "messageId"];
  }
  if (sessionUpdate === "plan") {
    return ["_meta", "entries"];
  }
  return [
    "_meta",
    "content",
    "kind",
    "locations",
    "rawInput",
    "rawOutput",
    "status",
    "title",
    "toolCallId",
  ];
}

function parseAgentCapabilities(value: unknown, path: string): void {
  const record = asObject(value, path);
  assertExactKeys(
    record,
    [],
    [
      "_meta",
      "auth",
      "loadSession",
      "mcpCapabilities",
      "promptCapabilities",
      "sessionCapabilities",
    ],
    path,
  );
  assertReservedMeta(record._meta, `${path}._meta`);
  if (record.auth !== undefined) {
    const auth = asObject(record.auth, `${path}.auth`);
    assertExactKeys(auth, [], ["_meta", "logout"], `${path}.auth`);
    assertReservedMeta(auth._meta, `${path}.auth._meta`);
  }
  if (record.mcpCapabilities !== undefined) {
    const mcp = asObject(record.mcpCapabilities, `${path}.mcpCapabilities`);
    assertExactKeys(
      mcp,
      [],
      ["_meta", "http", "sse"],
      `${path}.mcpCapabilities`,
    );
    assertReservedMeta(mcp._meta, `${path}.mcpCapabilities._meta`);
  }
  if (record.promptCapabilities !== undefined) {
    const prompt = asObject(
      record.promptCapabilities,
      `${path}.promptCapabilities`,
    );
    assertExactKeys(
      prompt,
      [],
      ["_meta", "audio", "embeddedContext", "image"],
      `${path}.promptCapabilities`,
    );
    assertReservedMeta(prompt._meta, `${path}.promptCapabilities._meta`);
  }
  if (record.sessionCapabilities !== undefined) {
    const session = asObject(
      record.sessionCapabilities,
      `${path}.sessionCapabilities`,
    );
    assertExactKeys(
      session,
      [],
      ["_meta", "additionalDirectories", "close", "delete", "list", "resume"],
      `${path}.sessionCapabilities`,
    );
    assertReservedMeta(session._meta, `${path}.sessionCapabilities._meta`);
    for (const key of [
      "additionalDirectories",
      "close",
      "delete",
      "list",
      "resume",
    ] as const) {
      if (session[key] === undefined || session[key] === null) continue;
      const capability = asObject(
        session[key],
        `${path}.sessionCapabilities.${key}`,
      );
      assertExactKeys(
        capability,
        [],
        ["_meta"],
        `${path}.sessionCapabilities.${key}`,
      );
      assertReservedMeta(
        capability._meta,
        `${path}.sessionCapabilities.${key}._meta`,
      );
    }
  }
}

function parseImplementation(value: unknown, path: string): void {
  const record = asObject(value, path);
  assertExactKeys(record, ["name"], ["_meta", "title", "version"], path);
  assertReservedMeta(record._meta, `${path}._meta`);
}

function parseAuthMethod(value: unknown, path: string): { id: unknown } {
  const record = asObject(value, path);
  assertExactKeys(
    record,
    ["id"],
    ["_meta", "description", "name", "type"],
    path,
  );
  assertReservedMeta(record._meta, `${path}._meta`);
  return { id: record.id };
}

function parseSessionInfo(value: unknown, path: string): string {
  const session = asObject(value, path);
  assertExactKeys(
    session,
    ["sessionId"],
    ["_meta", "additionalDirectories", "cwd", "title", "updatedAt"],
    path,
  );
  assertReservedMeta(session._meta, `${path}._meta`);
  if (typeof session.sessionId !== "string" || session.sessionId.length === 0) {
    throw new CursorAcpJsonRpcError(
      "unknown_schema",
      `${path} requires sessionId`,
    );
  }
  return session.sessionId;
}

function parseContentBlock(value: unknown, path: string): void {
  const record = asObject(value, path);
  assertExactKeys(
    record,
    [],
    [
      "_meta",
      "annotations",
      "data",
      "mimeType",
      "name",
      "resource",
      "text",
      "title",
      "type",
      "uri",
    ],
    path,
  );
  assertReservedMeta(record._meta, `${path}._meta`);
  if (record.annotations !== undefined && record.annotations !== null) {
    const annotations = asObject(record.annotations, `${path}.annotations`);
    assertExactKeys(
      annotations,
      [],
      ["_meta", "audience", "lastModified", "priority"],
      `${path}.annotations`,
    );
    assertReservedMeta(annotations._meta, `${path}.annotations._meta`);
  }
}

function parsePlanEntries(value: unknown, path: string): void {
  if (!Array.isArray(value)) {
    throw new CursorAcpJsonRpcError("unknown_schema", `${path} must be array`);
  }
  value.forEach((entry, index) => {
    const record = asObject(entry, `${path}[${index}]`);
    assertExactKeys(
      record,
      [],
      ["_meta", "content", "priority", "status"],
      `${path}[${index}]`,
    );
    assertReservedMeta(record._meta, `${path}[${index}]._meta`);
  });
}

function parseToolCallContent(value: unknown, path: string): void {
  if (value === null) return;
  if (!Array.isArray(value)) {
    throw new CursorAcpJsonRpcError("unknown_schema", `${path} must be array`);
  }
  value.forEach((entry, index) => {
    parseContentBlock(entry, `${path}[${index}]`);
  });
}

function parseToolCallLocations(value: unknown, path: string): void {
  if (value === null) return;
  if (!Array.isArray(value)) {
    throw new CursorAcpJsonRpcError("unknown_schema", `${path} must be array`);
  }
  value.forEach((entry, index) => {
    const record = asObject(entry, `${path}[${index}]`);
    assertExactKeys(record, [], ["_meta", "line", "path"], `${path}[${index}]`);
    assertReservedMeta(record._meta, `${path}[${index}]._meta`);
  });
}

function assertOfficialNullable(value: unknown, path: string): void {
  if (value === undefined || value === null) return;
  if (typeof value !== "object") {
    throw new CursorAcpJsonRpcError(
      "unknown_schema",
      `${path} must be object, array, or null`,
    );
  }
}

function assertOpaqueOfficialBag(value: unknown, path: string): void {
  if (value === undefined || value === null) return;
  if (typeof value !== "object") {
    throw new CursorAcpJsonRpcError("unknown_schema", `${path} must be object`);
  }
}

function assertReservedMeta(value: unknown, path: string): void {
  if (value === undefined) return;
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new CursorAcpJsonRpcError("unknown_schema", `${path} must be object`);
  }
}

function asObject(value: unknown, path: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new CursorAcpJsonRpcError("unknown_schema", `${path} must be object`);
  }
  return value as Record<string, unknown>;
}
