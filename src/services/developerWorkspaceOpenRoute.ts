const OPAQUE_REF = /^[A-Za-z0-9][A-Za-z0-9._~-]{0,127}$/;
const FORBIDDEN_KEYS =
  /^(?:token|secret|password|cookie|authorization|path|absolutepath|localpath|filepath|command|prompt|diff|body|payload)$/i;
const ABSOLUTE_PATH =
  /(?:^[A-Za-z]:[\\/])|(?:^\\\\)|(?:^\/)|(?:^~[\\/])|(?:^file:)/i;

export const DEVELOPER_WORKSPACE_OPEN_ROUTE_KEYS = [
  "agentId",
  "machineRef",
  "sessionRef",
  "approvalRef",
  "actionRef",
  "handoffRef",
  "instructionRef",
] as const;

export type DeveloperWorkspaceOpenRouteV1 = {
  agentId: string;
  machineRef?: string;
  sessionRef?: string;
  approvalRef?: string;
  actionRef?: string;
  handoffRef?: string;
  instructionRef?: string;
};

export type DeveloperWorkspaceOpenRouteResult =
  | { ok: true; route: DeveloperWorkspaceOpenRouteV1 }
  | {
      ok: false;
      reason:
        | "unsafe_parameter"
        | "invalid_identifier"
        | "unknown_field"
        | "empty_input";
    };

export function parseDeveloperWorkspaceOpenRoute(
  input: unknown,
): DeveloperWorkspaceOpenRouteResult {
  if (input == null || typeof input !== "object" || Array.isArray(input)) {
    return { ok: false, reason: "empty_input" };
  }
  const record = input as Record<string, unknown>;
  for (const key of Object.keys(record)) {
    if (FORBIDDEN_KEYS.test(key.replace(/[_-]/g, ""))) {
      return { ok: false, reason: "unsafe_parameter" };
    }
    if (
      !(DEVELOPER_WORKSPACE_OPEN_ROUTE_KEYS as readonly string[]).includes(key)
    ) {
      return { ok: false, reason: "unknown_field" };
    }
    const value = record[key];
    if (value === undefined) continue;
    if (
      typeof value !== "string" ||
      !OPAQUE_REF.test(value) ||
      ABSOLUTE_PATH.test(value)
    ) {
      return { ok: false, reason: "invalid_identifier" };
    }
  }
  const agentId = record.agentId;
  if (typeof agentId !== "string" || !OPAQUE_REF.test(agentId)) {
    return { ok: false, reason: "invalid_identifier" };
  }
  const route: DeveloperWorkspaceOpenRouteV1 = { agentId };
  for (const key of DEVELOPER_WORKSPACE_OPEN_ROUTE_KEYS) {
    if (key === "agentId") continue;
    const value = record[key];
    if (typeof value === "string") route[key] = value;
  }
  return { ok: true, route };
}

export function serializeDeveloperWorkspaceOpenRoute(
  route: DeveloperWorkspaceOpenRouteV1,
): DeveloperWorkspaceOpenRouteResult {
  return parseDeveloperWorkspaceOpenRoute(route);
}
