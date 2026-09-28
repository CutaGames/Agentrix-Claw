import { getApiConfig } from "./api";
import {
  canonicalizeJson,
  computeDigest,
} from "../../shared/types/trust-loop-primitives";

export const DEVELOPER_WORKSPACE_BODY_DIGEST_HEADER = "x-agentrix-body-digest";
export const DEVELOPER_WORKSPACE_CANONICALIZATION_HEADER =
  "x-agentrix-canonicalization";
export const DEVELOPER_WORKSPACE_CANONICALIZATION = "jcs/1";

export type DeveloperWorkspaceTransportRequest = {
  method: "GET" | "POST" | "DELETE";
  path: string;
  query?: Record<string, string | undefined>;
  body?: unknown;
  idempotencyKey?: string;
  digestHeaders?: boolean;
};

export type DeveloperWorkspaceTransportResponse = {
  status: number;
  json: unknown;
};

export type DeveloperWorkspaceTransport = (
  request: DeveloperWorkspaceTransportRequest,
) => Promise<DeveloperWorkspaceTransportResponse>;

export type DeveloperWorkspaceAuthOptions = {
  token?: string | null;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
  online?: boolean;
};

const IDENTITY_HEADERS = [
  "x-agent-id",
  "x-device-id",
  "x-device-ref",
  "x-runtime-id",
  "x-runtime-ref",
  "x-tenant-id",
  "x-tenant-ref",
  "x-owner-id",
];

export function resolveDeveloperWorkspaceAuthToken(
  options: DeveloperWorkspaceAuthOptions = {},
): string | null {
  if (typeof options.token === "string" && options.token.trim())
    return options.token.trim();
  if (options.token === null) return null;
  const configured = getApiConfig().token;
  return typeof configured === "string" && configured.trim()
    ? configured.trim()
    : null;
}

export function createDeveloperWorkspaceAuthTransport(
  options: DeveloperWorkspaceAuthOptions = {},
): {
  authenticated: boolean;
  online: boolean;
  request: DeveloperWorkspaceTransport;
} {
  const token = resolveDeveloperWorkspaceAuthToken(options);
  const online = options.online !== false;
  const fetchImpl = options.fetchImpl ?? fetch;
  const baseUrl = (options.baseUrl ?? getApiConfig().baseUrl ?? "").replace(
    /\/+$/,
    "",
  );

  return {
    authenticated: typeof token === "string" && token.length > 0,
    online,
    request: async (input) => {
      if (!online) {
        throw Object.assign(new Error("developer_workspace_offline"), {
          code: "offline",
        });
      }
      if (!token) {
        return {
          status: 401,
          json: {
            success: false,
            error: {
              code: "unauthorized",
              reason: "unauthorized",
              retriable: false,
            },
          },
        };
      }
      const url = new URL(`${baseUrl}${input.path}`);
      for (const [key, value] of Object.entries(input.query ?? {})) {
        if (typeof value === "string" && value.length > 0)
          url.searchParams.set(key, value);
      }
      const headers: Record<string, string> = {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
      };
      for (const forbidden of IDENTITY_HEADERS) {
        delete headers[forbidden];
      }
      if (input.idempotencyKey)
        headers["Idempotency-Key"] = input.idempotencyKey;
      let body: string | undefined;
      if (input.body !== undefined) {
        assertNoCallerIdentity(input.body);
        body = canonicalizeJson(input.body);
        headers["Content-Type"] = "application/json";
        if (input.digestHeaders) {
          headers[DEVELOPER_WORKSPACE_CANONICALIZATION_HEADER] =
            DEVELOPER_WORKSPACE_CANONICALIZATION;
          headers[DEVELOPER_WORKSPACE_BODY_DIGEST_HEADER] =
            `sha-256=${computeDigest(input.body).value}`;
        }
      }
      const response = await fetchImpl(url.toString(), {
        method: input.method,
        headers,
        body,
      });
      let json: unknown = null;
      const text = await response.text();
      if (text) {
        try {
          json = JSON.parse(text);
        } catch {
          json = {
            success: false,
            error: {
              code: "fail_closed",
              reason: "invalid_json",
              retriable: false,
            },
          };
        }
      }
      return { status: response.status, json };
    },
  };
}

export function assertNoCallerIdentity(body: unknown): void {
  if (body == null || typeof body !== "object" || Array.isArray(body)) return;
  const record = body as Record<string, unknown>;
  for (const key of [
    "ownerUserId",
    "ownerId",
    "ownerPrincipalRef",
    "tenantRef",
    "tenantId",
    "fromRuntimeId",
    "fromDeviceId",
    "toRuntimeId",
    "toDeviceId",
    "decidedByRef",
  ]) {
    if (record[key] !== undefined) {
      throw Object.assign(new Error("developer_workspace_identity_in_body"), {
        code: "identity_in_body",
        field: key,
      });
    }
  }
}
