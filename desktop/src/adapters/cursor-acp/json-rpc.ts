/**
 * Newline-delimited JSON-RPC 2.0 codec.
 * DEVELOPMENT_SPIKE_ONLY. Unknown envelopes fail closed.
 */

import type { CursorAcpJsonRpcId, CursorAcpJsonRpcMessage } from "./types";

export class CursorAcpJsonRpcError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "CursorAcpJsonRpcError";
    this.code = code;
  }
}

export function assertExactKeys(
  record: Record<string, unknown>,
  required: readonly string[],
  optional: readonly string[],
  path: string,
): void {
  const allowed = new Set<string>([...required, ...optional]);
  for (const key of Object.keys(record)) {
    if (!allowed.has(key)) {
      throw new CursorAcpJsonRpcError(
        "unknown_schema",
        `${path}.${key}: unknown field`,
      );
    }
  }
  for (const key of required) {
    if (!Object.prototype.hasOwnProperty.call(record, key)) {
      throw new CursorAcpJsonRpcError(
        "unknown_schema",
        `${path}.${key}: required`,
      );
    }
  }
}

export function encodeJsonRpcLine(message: CursorAcpJsonRpcMessage): string {
  return `${JSON.stringify(message)}\n`;
}

export function parseJsonRpcLine(line: string): CursorAcpJsonRpcMessage {
  const trimmed = line.trim();
  if (trimmed.length === 0) {
    throw new CursorAcpJsonRpcError("empty_line", "empty JSON-RPC line");
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    throw new CursorAcpJsonRpcError(
      "invalid_json",
      "JSON-RPC line is not JSON",
    );
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new CursorAcpJsonRpcError(
      "unknown_schema",
      "JSON-RPC message must be an object",
    );
  }
  const record = parsed as Record<string, unknown>;
  if (record.jsonrpc !== "2.0") {
    throw new CursorAcpJsonRpcError(
      "unknown_schema",
      "JSON-RPC version must be 2.0",
    );
  }
  if ("method" in record) {
    if ("result" in record || "error" in record) {
      throw new CursorAcpJsonRpcError(
        "unknown_schema",
        "method messages cannot carry result or error",
      );
    }
    if ("id" in record) {
      assertExactKeys(
        record,
        ["jsonrpc", "id", "method"],
        ["params"],
        "jsonrpc.request",
      );
      if (
        typeof record.method !== "string" ||
        record.method.trim().length === 0
      ) {
        throw new CursorAcpJsonRpcError("unknown_schema", "method is required");
      }
      assertJsonRpcParams(record.params, "jsonrpc.request.params");
      return {
        jsonrpc: "2.0",
        id: asJsonRpcId(record.id),
        method: record.method,
        ...(record.params !== undefined ? { params: record.params } : {}),
      };
    }
    assertExactKeys(
      record,
      ["jsonrpc", "method"],
      ["params"],
      "jsonrpc.notification",
    );
    if (
      typeof record.method !== "string" ||
      record.method.trim().length === 0
    ) {
      throw new CursorAcpJsonRpcError("unknown_schema", "method is required");
    }
    assertJsonRpcParams(record.params, "jsonrpc.notification.params");
    return {
      jsonrpc: "2.0",
      method: record.method,
      ...(record.params !== undefined ? { params: record.params } : {}),
    };
  }
  if ("error" in record && "result" in record) {
    throw new CursorAcpJsonRpcError(
      "unknown_schema",
      "JSON-RPC response cannot carry both result and error",
    );
  }
  if (!("id" in record)) {
    throw new CursorAcpJsonRpcError(
      "unknown_schema",
      "JSON-RPC response requires id",
    );
  }
  if ("error" in record) {
    assertExactKeys(
      record,
      ["jsonrpc", "id", "error"],
      [],
      "jsonrpc.error_response",
    );
    if (
      typeof record.error !== "object" ||
      record.error === null ||
      Array.isArray(record.error)
    ) {
      throw new CursorAcpJsonRpcError("unknown_schema", "error must be object");
    }
    const error = record.error as Record<string, unknown>;
    assertExactKeys(error, ["code", "message"], ["data"], "jsonrpc.error");
    if (typeof error.code !== "number" || typeof error.message !== "string") {
      throw new CursorAcpJsonRpcError(
        "unknown_schema",
        "error.code and error.message are required",
      );
    }
    return {
      jsonrpc: "2.0",
      id: record.id === null ? null : asJsonRpcId(record.id),
      error: {
        code: error.code,
        message: error.message,
        ...(error.data !== undefined ? { data: error.data } : {}),
      },
    };
  }
  if (!("result" in record)) {
    throw new CursorAcpJsonRpcError(
      "unknown_schema",
      "JSON-RPC response requires result or error",
    );
  }
  assertExactKeys(record, ["jsonrpc", "id", "result"], [], "jsonrpc.success");
  return {
    jsonrpc: "2.0",
    id: asJsonRpcId(record.id),
    result: record.result,
  };
}

function assertJsonRpcParams(value: unknown, path: string): void {
  if (value === undefined) return;
  if (value === null || (typeof value !== "object" && !Array.isArray(value))) {
    throw new CursorAcpJsonRpcError(
      "unknown_schema",
      `${path} must be object or array`,
    );
  }
}

function asJsonRpcId(value: unknown): CursorAcpJsonRpcId {
  if (typeof value === "string" || typeof value === "number") {
    return value;
  }
  throw new CursorAcpJsonRpcError(
    "unknown_schema",
    "id must be string or number",
  );
}

export function isJsonRpcResponse(
  message: CursorAcpJsonRpcMessage,
): message is
  | import("./types").CursorAcpJsonRpcSuccess
  | import("./types").CursorAcpJsonRpcFailure {
  return "result" in message || "error" in message;
}

export function isJsonRpcRequest(
  message: CursorAcpJsonRpcMessage,
): message is import("./types").CursorAcpJsonRpcRequest {
  return "method" in message && "id" in message && !("result" in message);
}

export function isJsonRpcNotification(
  message: CursorAcpJsonRpcMessage,
): message is import("./types").CursorAcpJsonRpcNotification {
  return "method" in message && !("id" in message);
}
