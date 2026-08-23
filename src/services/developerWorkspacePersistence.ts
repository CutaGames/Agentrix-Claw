const FORBIDDEN_KEY =
  /^(?:token|secret|password|cookie|authorization|path|absolutepath|localpath|filepath|command|prompt|diff|body|payload|plaintext|plaintextbase64)$/i;
const ABSOLUTE_PATH =
  /(?:^[A-Za-z]:[\\/])|(?:^\\\\)|(?:^\/)|(?:^~[\\/])|(?:^file:)/i;
const ABSOLUTE_PATH_ANYWHERE =
  /(?:^|\s)(?:[A-Za-z]:[\\/]|\\\\|\/(?:home|Users|etc|var|tmp|opt|srv|root)(?:\/|$)|~[\\/]|file:)/i;
const OPAQUE_REF = /^[A-Za-z0-9][A-Za-z0-9._~-]{0,127}$/;
const SECRET_VALUE =
  /(?:\bbearer\s+[A-Za-z0-9._~-]+)|(?:\b(?:token|secret|password|cookie|authorization)\s*[:=])|(?:\bsk-[A-Za-z0-9_-]{8,})/i;

export const DEVELOPER_WORKSPACE_FORBIDDEN_PERSISTENCE_KEYS = [
  "prompt",
  "path",
  "token",
  "secret",
  "password",
  "authorization",
  "payload",
  "plaintext",
  "plaintextBase64",
] as const;

export type DeveloperWorkspacePersistenceResult =
  | { ok: true }
  | {
      ok: false;
      reason:
        | "sensitive_field"
        | "absolute_path"
        | "unsafe_cache_key"
        | "offline_queue_forbidden";
    };

export function assertDeveloperWorkspaceSafeToPersist(
  value: unknown,
  path = "record",
): DeveloperWorkspacePersistenceResult {
  return walkPersist(value, path, 0);
}

function walkPersist(
  value: unknown,
  path: string,
  depth: number,
): DeveloperWorkspacePersistenceResult {
  if (depth > 8) return { ok: false, reason: "sensitive_field" };
  if (typeof value === "string") {
    if (ABSOLUTE_PATH.test(value))
      return { ok: false, reason: "absolute_path" };
    return { ok: true };
  }
  if (value == null || typeof value !== "object") return { ok: true };
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i += 1) {
      const nested = walkPersist(value[i], `${path}[${i}]`, depth + 1);
      if (!nested.ok) return nested;
    }
    return { ok: true };
  }
  for (const [key, nested] of Object.entries(
    value as Record<string, unknown>,
  )) {
    if (FORBIDDEN_KEY.test(key.replace(/[_-]/g, ""))) {
      return { ok: false, reason: "sensitive_field" };
    }
    const child = walkPersist(nested, `${path}.${key}`, depth + 1);
    if (!child.ok) return child;
  }
  return { ok: true };
}

export function developerWorkspaceCacheKey(
  parts: readonly string[],
): DeveloperWorkspacePersistenceResult & { key?: string } {
  for (const part of parts) {
    if (
      typeof part !== "string" ||
      !OPAQUE_REF.test(part) ||
      ABSOLUTE_PATH.test(part) ||
      FORBIDDEN_KEY.test(part)
    ) {
      return { ok: false, reason: "unsafe_cache_key" };
    }
  }
  return { ok: true, key: parts.join(":") };
}

export function queueDeveloperWorkspaceMutation(): DeveloperWorkspacePersistenceResult {
  return { ok: false, reason: "offline_queue_forbidden" };
}

export function validateDeveloperWorkspaceControlSummary(
  summary: string,
): DeveloperWorkspacePersistenceResult {
  if (
    typeof summary !== "string" ||
    summary.trim().length === 0 ||
    summary.length > 160 ||
    ABSOLUTE_PATH_ANYWHERE.test(summary) ||
    SECRET_VALUE.test(summary)
  ) {
    return { ok: false, reason: "sensitive_field" };
  }
  return { ok: true };
}

export function developerWorkspaceAnalyticsProps(
  input: Record<string, unknown>,
): DeveloperWorkspacePersistenceResult & { props?: Record<string, string> } {
  const persist = assertDeveloperWorkspaceSafeToPersist(input, "analytics");
  if (!persist.ok) return persist;
  const props: Record<string, string> = {};
  for (const [key, value] of Object.entries(input)) {
    if (typeof value !== "string" || !OPAQUE_REF.test(value)) {
      return { ok: false, reason: "sensitive_field" };
    }
    props[key] = value;
  }
  return { ok: true, props };
}
