export const CHAT_ROUTING_SCHEMA_VERSION = 1 as const;

export const CHAT_REQUESTED_EXECUTION_SOURCES_V1 = [
  "auto",
  "local_model",
  "agentrix_platform",
  "byo_api",
  "vendor_subscription",
  "remote_openclaw",
] as const;

export type ChatRequestedExecutionSourceV1 =
  (typeof CHAT_REQUESTED_EXECUTION_SOURCES_V1)[number];

export const CHAT_ACTUAL_EXECUTION_SOURCES_V1 = [
  "desktop_local",
  "agentrix_platform",
  "byo_api",
  "vendor_subscription",
  "remote_openclaw",
] as const;

export type ChatActualExecutionSourceV1 =
  (typeof CHAT_ACTUAL_EXECUTION_SOURCES_V1)[number];

export interface ChatRouteIntentV1 {
  schemaVersion: typeof CHAT_ROUTING_SCHEMA_VERSION;
  providerId?: string;
  modelId?: string;
  executionSource: ChatRequestedExecutionSourceV1;
  requireLocal: boolean;
  allowFallback: boolean;
}

export interface ActualChatRouteV1 {
  schemaVersion: typeof CHAT_ROUTING_SCHEMA_VERSION;
  contractType: "actual_chat_route";
  routeId: string;
  requested: ChatRouteIntentV1 & {
    tier?: "local" | "smart" | "cloud";
  };
  actual: {
    providerId: string;
    modelId: string;
    executionSource: ChatActualExecutionSourceV1;
    credentialSource:
      | "platform"
      | "user_provider"
      | "vendor_subscription"
      | "remote_instance"
      | "local_artifact";
  };
  fallback: {
    occurred: boolean;
    allowed: boolean;
    fromProviderId?: string;
    fromModelId?: string;
    reason?: string;
  };
  phase: "selected" | "executing" | "completed" | "failed";
  sequence: number;
}

export interface ChatRouteValidationResultV1 {
  valid: boolean;
  errors: string[];
}

const SAFE_IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._:/~-]{0,191}$/;
const SAFE_ROUTE_REASON = /^[A-Za-z0-9][A-Za-z0-9._:|=-]{0,255}$/;

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isSafeIdentifier(value: unknown): value is string {
  return typeof value === "string" && SAFE_IDENTIFIER.test(value);
}

export function validateChatRouteIntentV1(
  input: unknown,
): ChatRouteValidationResultV1 {
  const errors: string[] = [];
  if (!isObject(input)) {
    return { valid: false, errors: ["routeIntent: expected object"] };
  }

  const allowedKeys = new Set([
    "schemaVersion",
    "providerId",
    "modelId",
    "executionSource",
    "requireLocal",
    "allowFallback",
  ]);
  for (const key of Object.keys(input)) {
    if (!allowedKeys.has(key)) errors.push(`routeIntent.${key}: unknown field`);
  }

  if (input.schemaVersion !== CHAT_ROUTING_SCHEMA_VERSION) {
    errors.push("routeIntent.schemaVersion: expected 1");
  }
  if (
    !CHAT_REQUESTED_EXECUTION_SOURCES_V1.includes(
      input.executionSource as ChatRequestedExecutionSourceV1,
    )
  ) {
    errors.push("routeIntent.executionSource: unsupported value");
  }
  if (typeof input.requireLocal !== "boolean") {
    errors.push("routeIntent.requireLocal: expected boolean");
  }
  if (typeof input.allowFallback !== "boolean") {
    errors.push("routeIntent.allowFallback: expected boolean");
  }
  if (input.providerId !== undefined && !isSafeIdentifier(input.providerId)) {
    errors.push("routeIntent.providerId: invalid identifier");
  }
  if (input.modelId !== undefined && !isSafeIdentifier(input.modelId)) {
    errors.push("routeIntent.modelId: invalid identifier");
  }

  if (input.executionSource === "local_model") {
    if (input.requireLocal !== true) {
      errors.push("routeIntent.requireLocal: local_model requires true");
    }
    if (input.allowFallback !== false) {
      errors.push("routeIntent.allowFallback: local_model forbids fallback");
    }
  }
  if (input.requireLocal === true && input.allowFallback !== false) {
    errors.push("routeIntent.allowFallback: strict-local forbids fallback");
  }
  if (
    (input.executionSource === "byo_api" ||
      input.executionSource === "vendor_subscription") &&
    (!isSafeIdentifier(input.providerId) || input.providerId === "platform")
  ) {
    errors.push(
      "routeIntent.providerId: explicit BYO/subscription source requires a non-platform provider",
    );
  }
  if (
    input.executionSource === "agentrix_platform" &&
    input.providerId !== undefined &&
    input.providerId !== "platform"
  ) {
    errors.push(
      "routeIntent.providerId: Agentrix platform source only accepts platform",
    );
  }

  return { valid: errors.length === 0, errors };
}

export function createChatRouteIntentV1(input: {
  providerId?: string;
  modelId?: string;
  executionSource?: ChatRequestedExecutionSourceV1;
  requireLocal?: boolean;
  allowFallback?: boolean;
}): ChatRouteIntentV1 {
  const executionSource = input.executionSource ?? "auto";
  const requireLocal =
    input.requireLocal === true || executionSource === "local_model";
  const route: ChatRouteIntentV1 = {
    schemaVersion: CHAT_ROUTING_SCHEMA_VERSION,
    ...(input.providerId ? { providerId: input.providerId } : {}),
    ...(input.modelId ? { modelId: input.modelId } : {}),
    executionSource,
    requireLocal,
    allowFallback: requireLocal ? false : input.allowFallback !== false,
  };
  const validation = validateChatRouteIntentV1(route);
  if (!validation.valid) {
    throw new Error(`invalid_chat_route_intent:${validation.errors.join(";")}`);
  }
  return route;
}

export function isActualChatRouteV1(
  input: unknown,
): input is ActualChatRouteV1 {
  if (!isObject(input) || input.schemaVersion !== CHAT_ROUTING_SCHEMA_VERSION) {
    return false;
  }

  const hasOnlyKeys = (value: Record<string, unknown>, allowed: readonly string[]) =>
    Object.keys(value).every((key) => allowed.includes(key));

  if (
    !hasOnlyKeys(input, [
      "schemaVersion",
      "contractType",
      "routeId",
      "requested",
      "actual",
      "fallback",
      "phase",
      "sequence",
    ]) ||
    input.contractType !== "actual_chat_route" ||
    !isSafeIdentifier(input.routeId) ||
    !isObject(input.requested) ||
    !isObject(input.actual) ||
    !isObject(input.fallback)
  ) {
    return false;
  }

  const { tier, ...routeIntent } = input.requested;
  if (
    (tier !== undefined && tier !== "local" && tier !== "smart" && tier !== "cloud") ||
    !validateChatRouteIntentV1(routeIntent).valid
  ) {
    return false;
  }

  if (
    !hasOnlyKeys(input.actual, [
      "providerId",
      "modelId",
      "executionSource",
      "credentialSource",
    ]) ||
    !isSafeIdentifier(input.actual.providerId) ||
    !isSafeIdentifier(input.actual.modelId) ||
    !CHAT_ACTUAL_EXECUTION_SOURCES_V1.includes(
      input.actual.executionSource as ChatActualExecutionSourceV1,
    ) ||
    ![
      "platform",
      "user_provider",
      "vendor_subscription",
      "remote_instance",
      "local_artifact",
    ].includes(String(input.actual.credentialSource))
  ) {
    return false;
  }

  if (
    !hasOnlyKeys(input.fallback, [
      "occurred",
      "allowed",
      "fromProviderId",
      "fromModelId",
      "reason",
    ]) ||
    typeof input.fallback.occurred !== "boolean" ||
    typeof input.fallback.allowed !== "boolean" ||
    (input.fallback.fromProviderId !== undefined &&
      !isSafeIdentifier(input.fallback.fromProviderId)) ||
    (input.fallback.fromModelId !== undefined &&
      !isSafeIdentifier(input.fallback.fromModelId)) ||
    (input.fallback.reason !== undefined &&
      (typeof input.fallback.reason !== "string" ||
        !SAFE_ROUTE_REASON.test(input.fallback.reason)))
  ) {
    return false;
  }

  if (
    !["selected", "executing", "completed", "failed"].includes(String(input.phase))
  ) {
    return false;
  }

  return Number.isInteger(input.sequence) && Number(input.sequence) > 0;
}
