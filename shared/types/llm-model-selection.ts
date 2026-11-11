export const LLM_MODEL_SELECTION_SCHEMA_VERSION = 1 as const;
export const AGENTRIX_POOL_PROVIDER_ID = "agentrix-pool" as const;

export const CREDENTIAL_SOURCES = [
  "byo",
  "pool",
  "platform-env",
  "platform-claude",
] as const;
export type CredentialSource = (typeof CREDENTIAL_SOURCES)[number];

export const MODEL_AVAILABILITIES = [
  "available",
  "degraded",
  "unavailable",
  "disabled",
] as const;
export type ModelAvailability = (typeof MODEL_AVAILABILITIES)[number];

export const LLM_MODEL_BILLING_TYPES = [
  "platform",
  "subscription",
  "api-key",
] as const;
export type LlmModelBillingType = (typeof LLM_MODEL_BILLING_TYPES)[number];

export const LLM_BILLING_DOMAINS = ["byo", "platform"] as const;
export type LlmBillingDomain = (typeof LLM_BILLING_DOMAINS)[number];

export const LLM_GATEWAY_ERROR_CODES = [
  "INVALID_MODEL_SELECTION",
  "MODEL_SELECTION_CONFLICT",
  "CLIENT_SELECTION_FIELDS_FORBIDDEN",
  "MODEL_SELECTION_NOT_FOUND",
  "POOL_DISABLED",
  "POOL_CATALOG_UNAVAILABLE",
  "POOL_AUTH_FAILED",
  "POOL_NO_DISPATCHABLE_ACCOUNT",
  "POOL_MODEL_UNSUPPORTED",
  "POOL_ACCOUNT_EXPIRED",
  "POOL_RATE_LIMITED",
  "POOL_UPSTREAM_TIMEOUT",
  "POOL_UPSTREAM_ERROR",
  "UPSTREAM_PROVIDER_ERROR",
  "SUBSCRIPTION_QUOTA_EXHAUSTED",
  "BILLING_PENDING_RECONCILIATION",
  "BYO_NEEDS_REAUTH",
  "BYO_EXPIRED",
  "BYO_ADAPTER_UNAVAILABLE",
  "BYO_RATE_LIMITED",
  "BYO_HEALTH_STALE",
  "SUPPLY_UNAVAILABLE",
  "ROUTING_PLAN_EMPTY",
  "PRIVATE_NO_CANDIDATE",
  "INTERNAL_KEY_REVOKED",
  "PUBLIC_API_DISABLED",
] as const;
export type LlmGatewayErrorCode = (typeof LLM_GATEWAY_ERROR_CODES)[number];
export type PoolErrorCode = Extract<LlmGatewayErrorCode, `POOL_${string}`>;

export interface ModelSelection {
  selectionId: string;
  providerId: string;
  modelId: string;
  upstreamModelId: string;
  label: string;
  billingType: LlmModelBillingType;
  credentialSource: CredentialSource;
  availability: ModelAvailability;
  availabilityReason?: LlmGatewayErrorCode;
  capabilities: string[];
  contextWindow?: number;
  isDefault?: boolean;
  requiresAuth: boolean;
  catalogVersion: string;
}

export interface CredentialResolution {
  selectionId: string;
  requestedSource: CredentialSource;
  resolvedSource: CredentialSource;
  finalSource: CredentialSource;
  providerId: string;
  upstreamModelId: string;
  /** Opaque, redacted credential version/reference. Never a key or token. */
  credentialRef: string;
  billing: LlmBillingDomain;
}

export interface LlmExecutionContext {
  /** Server-issued logical request id; reused by retries and continuations. */
  requestId: string;
  userId?: string;
  resolution: CredentialResolution;
  reservationId?: string;
  startedStreaming: boolean;
  finalized: boolean;
}

export interface LlmGatewayError {
  error: "LlmGatewayError";
  code: LlmGatewayErrorCode;
  message: string;
  requestId: string;
  retryable: boolean;
  status: number;
  /** Present only when the upstream advertised a concrete backoff hint. */
  retryAfterMs?: number;
}

export interface ClientModelSelectionRequestV1 {
  selectionId?: string;
}

export interface ParsedSelectionIdV1 {
  selectionId: string;
  providerId: string;
  modelId: string;
  isPool: boolean;
}

export interface LlmContractValidationResult {
  valid: boolean;
  errors: string[];
}

export type SelectionIdParseResultV1 =
  | { valid: true; value: ParsedSelectionIdV1; errors: [] }
  | { valid: false; errors: string[] };

const SAFE_PROVIDER_ID = /^[a-z0-9][a-z0-9._-]{0,63}$/;
const SAFE_MODEL_ID = /^[A-Za-z0-9][A-Za-z0-9._:/@+~-]{0,190}$/;
const SAFE_REFERENCE = /^[A-Za-z0-9][A-Za-z0-9._:/@-]{0,191}$/;
const SAFE_CATALOG_VERSION = /^[A-Za-z0-9][A-Za-z0-9._:@+-]{0,127}$/;
const LLM_REQUEST_ID = /^llm_[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const CLIENT_FORBIDDEN_MODEL_SELECTION_FIELDS_V1 = [
  "credentialSource",
  "requestedSource",
  "resolvedSource",
  "finalSource",
  "credentialRef",
  "credentialReference",
  "billing",
  "billingType",
  "upstreamModelId",
  "reservationId",
  "apiKeyRef",
  "poolAccountId",
  "poolKeyId",
  "modelSelection",
  "credentialResolution",
  "resolution",
] as const;

const FORBIDDEN_CLIENT_FIELD_KEYS = new Set(
  CLIENT_FORBIDDEN_MODEL_SELECTION_FIELDS_V1.map((field) => field.toLowerCase()),
);
const SECURITY_CONTAINER_KEYS = new Set([
  "options",
  "context",
  "modelSelection",
  "selection",
  "resolution",
  "credentialResolution",
]);

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasOnlyKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  return Object.keys(value).every((key) => keys.includes(key));
}

function isSafeProviderId(value: unknown): value is string {
  return typeof value === "string" && SAFE_PROVIDER_ID.test(value);
}

function isSafeModelId(value: unknown): value is string {
  return typeof value === "string" && SAFE_MODEL_ID.test(value);
}

function isSafeReference(value: unknown): value is string {
  return typeof value === "string" && SAFE_REFERENCE.test(value);
}

export function isLlmRequestId(value: unknown): value is string {
  return typeof value === "string" && LLM_REQUEST_ID.test(value);
}

export function parseSelectionIdV1(input: unknown): SelectionIdParseResultV1 {
  const errors: string[] = [];
  if (typeof input !== "string") {
    return { valid: false, errors: ["selectionId: expected string"] };
  }
  if (input.length === 0 || input.length > 256 || input.trim() !== input) {
    return { valid: false, errors: ["selectionId: invalid length or whitespace"] };
  }

  const separator = input.indexOf(":");
  if (separator <= 0 || separator === input.length - 1) {
    return { valid: false, errors: ["selectionId: expected <providerId>:<modelId>"] };
  }

  const providerId = input.slice(0, separator);
  const modelId = input.slice(separator + 1);
  if (!isSafeProviderId(providerId)) errors.push("selectionId.providerId: invalid identifier");
  if (!isSafeModelId(modelId)) errors.push("selectionId.modelId: invalid identifier");

  const duplicatedPoolNamespace = modelId.toLowerCase().startsWith(`${AGENTRIX_POOL_PROVIDER_ID}:`);
  if (providerId === AGENTRIX_POOL_PROVIDER_ID && duplicatedPoolNamespace) {
    errors.push("selectionId.modelId: duplicated agentrix-pool namespace");
  }
  if (providerId !== AGENTRIX_POOL_PROVIDER_ID && duplicatedPoolNamespace) {
    errors.push("selectionId.modelId: pool namespace requires agentrix-pool provider");
  }

  if (errors.length > 0) return { valid: false, errors };
  return {
    valid: true,
    errors: [],
    value: {
      selectionId: input,
      providerId,
      modelId,
      isPool: providerId === AGENTRIX_POOL_PROVIDER_ID,
    },
  };
}

export function createSelectionIdV1(providerId: string, modelId: string): string {
  const candidate = `${providerId}:${modelId}`;
  const parsed = parseSelectionIdV1(candidate);
  if (!parsed.valid) {
    throw new Error(`invalid_model_selection:${parsed.errors.join(";")}`);
  }
  return parsed.value.selectionId;
}

export function validateClientModelSelectionRequestV1(
  input: unknown,
): LlmContractValidationResult {
  if (!isObject(input)) {
    return { valid: false, errors: ["selection: expected object"] };
  }
  const errors: string[] = [];
  if (!hasOnlyKeys(input, ["selectionId"])) {
    for (const key of Object.keys(input)) {
      if (key !== "selectionId") errors.push(`selection.${key}: unknown field`);
    }
  }
  if (input.selectionId !== undefined) {
    const parsed = parseSelectionIdV1(input.selectionId);
    if (!parsed.valid) errors.push(...parsed.errors);
  }
  return { valid: errors.length === 0, errors };
}

/**
 * Finds source/billing/credential fields submitted in chat control containers.
 * Message content is intentionally not traversed, so user-authored JSON remains data.
 */
export function findForbiddenClientModelSelectionFieldsV1(input: unknown): string[] {
  if (!isObject(input)) return [];
  const findings: string[] = [];

  const inspect = (value: Record<string, unknown>, path: string, depth: number): void => {
    for (const [key, child] of Object.entries(value)) {
      const currentPath = path ? `${path}.${key}` : key;
      if (FORBIDDEN_CLIENT_FIELD_KEYS.has(key.toLowerCase())) {
        findings.push(`${currentPath}: server-authoritative field`);
        continue;
      }
      if (depth > 0 && key === "selectionId") {
        findings.push(`${currentPath}: selectionId is only allowed at request root`);
        continue;
      }
      if (depth < 3 && SECURITY_CONTAINER_KEYS.has(key) && isObject(child)) {
        inspect(child, currentPath, depth + 1);
      }
    }
  };

  inspect(input, "", 0);
  return findings;
}

export function validateModelSelectionV1(input: unknown): LlmContractValidationResult {
  if (!isObject(input)) return { valid: false, errors: ["modelSelection: expected object"] };
  const allowedKeys = [
    "selectionId",
    "providerId",
    "modelId",
    "upstreamModelId",
    "label",
    "billingType",
    "credentialSource",
    "availability",
    "availabilityReason",
    "capabilities",
    "contextWindow",
    "isDefault",
    "requiresAuth",
    "catalogVersion",
  ] as const;
  const errors: string[] = [];
  for (const key of Object.keys(input)) {
    if (!(allowedKeys as readonly string[]).includes(key)) errors.push(`modelSelection.${key}: unknown field`);
  }

  const parsed = parseSelectionIdV1(input.selectionId);
  if (!parsed.valid) errors.push(...parsed.errors);
  if (!isSafeProviderId(input.providerId)) errors.push("modelSelection.providerId: invalid identifier");
  if (!isSafeModelId(input.modelId)) errors.push("modelSelection.modelId: invalid identifier");
  if (!isSafeModelId(input.upstreamModelId)) errors.push("modelSelection.upstreamModelId: invalid identifier");
  if (typeof input.label !== "string" || input.label.length === 0 || input.label.length > 200) {
    errors.push("modelSelection.label: invalid string");
  }
  if (!LLM_MODEL_BILLING_TYPES.includes(input.billingType as LlmModelBillingType)) {
    errors.push("modelSelection.billingType: unsupported value");
  }
  if (!CREDENTIAL_SOURCES.includes(input.credentialSource as CredentialSource)) {
    errors.push("modelSelection.credentialSource: unsupported value");
  }
  if (!MODEL_AVAILABILITIES.includes(input.availability as ModelAvailability)) {
    errors.push("modelSelection.availability: unsupported value");
  }
  if (
    input.availabilityReason !== undefined
    && !LLM_GATEWAY_ERROR_CODES.includes(input.availabilityReason as LlmGatewayErrorCode)
  ) {
    errors.push("modelSelection.availabilityReason: unsupported value");
  }
  if (
    !Array.isArray(input.capabilities)
    || !input.capabilities.every((item) => isSafeReference(item))
  ) {
    errors.push("modelSelection.capabilities: invalid capability list");
  }
  if (
    input.contextWindow !== undefined
    && (!Number.isSafeInteger(input.contextWindow) || (input.contextWindow as number) <= 0)
  ) {
    errors.push("modelSelection.contextWindow: expected positive safe integer");
  }
  if (input.isDefault !== undefined && typeof input.isDefault !== "boolean") {
    errors.push("modelSelection.isDefault: expected boolean");
  }
  if (typeof input.requiresAuth !== "boolean") {
    errors.push("modelSelection.requiresAuth: expected boolean");
  }
  if (typeof input.catalogVersion !== "string" || !SAFE_CATALOG_VERSION.test(input.catalogVersion)) {
    errors.push("modelSelection.catalogVersion: invalid identifier");
  }

  if (parsed.valid) {
    if (parsed.value.providerId !== input.providerId || parsed.value.modelId !== input.modelId) {
      errors.push("modelSelection.selectionId: provider/model mismatch");
    }
    if (parsed.value.isPool) {
      if (input.upstreamModelId !== input.modelId) {
        errors.push("modelSelection.upstreamModelId: pool selection must preserve upstream model id");
      }
      if (input.billingType !== "platform" || input.credentialSource !== "pool" || input.requiresAuth !== true) {
        errors.push("modelSelection: pool selection must be platform billed, pool sourced, and authenticated");
      }
    }
  }

  return { valid: errors.length === 0, errors };
}

export function validateCredentialResolutionV1(input: unknown): LlmContractValidationResult {
  if (!isObject(input)) return { valid: false, errors: ["resolution: expected object"] };
  const allowedKeys = [
    "selectionId",
    "requestedSource",
    "resolvedSource",
    "finalSource",
    "providerId",
    "upstreamModelId",
    "credentialRef",
    "billing",
  ] as const;
  const errors: string[] = [];
  for (const key of Object.keys(input)) {
    if (!(allowedKeys as readonly string[]).includes(key)) errors.push(`resolution.${key}: unknown field`);
  }

  const parsed = parseSelectionIdV1(input.selectionId);
  if (!parsed.valid) errors.push(...parsed.errors);
  for (const key of ["requestedSource", "resolvedSource", "finalSource"] as const) {
    if (!CREDENTIAL_SOURCES.includes(input[key] as CredentialSource)) {
      errors.push(`resolution.${key}: unsupported value`);
    }
  }
  if (!isSafeProviderId(input.providerId)) errors.push("resolution.providerId: invalid identifier");
  if (!isSafeModelId(input.upstreamModelId)) errors.push("resolution.upstreamModelId: invalid identifier");
  if (!isSafeReference(input.credentialRef)) errors.push("resolution.credentialRef: invalid opaque reference");
  if (!LLM_BILLING_DOMAINS.includes(input.billing as LlmBillingDomain)) {
    errors.push("resolution.billing: unsupported value");
  }
  if (input.billing === "byo" && input.finalSource !== "byo") {
    errors.push("resolution.billing: byo billing requires byo finalSource");
  }
  if (input.billing === "platform" && input.finalSource === "byo") {
    errors.push("resolution.billing: platform billing forbids byo finalSource");
  }

  return { valid: errors.length === 0, errors };
}

export function validateLlmGatewayError(input: unknown): LlmContractValidationResult {
  if (!isObject(input)) return { valid: false, errors: ["gatewayError: expected object"] };
  const allowedKeys = [
    "error",
    "code",
    "message",
    "requestId",
    "retryable",
    "status",
    "retryAfterMs",
  ] as const;
  const errors: string[] = [];
  for (const key of Object.keys(input)) {
    if (!(allowedKeys as readonly string[]).includes(key)) errors.push(`gatewayError.${key}: unknown field`);
  }
  if (input.error !== "LlmGatewayError") errors.push("gatewayError.error: expected LlmGatewayError");
  if (!LLM_GATEWAY_ERROR_CODES.includes(input.code as LlmGatewayErrorCode)) {
    errors.push("gatewayError.code: unsupported value");
  }
  if (typeof input.message !== "string" || input.message.length === 0 || input.message.length > 300) {
    errors.push("gatewayError.message: invalid safe message");
  }
  if (!isLlmRequestId(input.requestId)) errors.push("gatewayError.requestId: invalid server request id");
  if (typeof input.retryable !== "boolean") errors.push("gatewayError.retryable: expected boolean");
  if (!Number.isInteger(input.status) || (input.status as number) < 400 || (input.status as number) > 599) {
    errors.push("gatewayError.status: expected HTTP error status");
  }
  if (
    input.retryAfterMs !== undefined
    && (!Number.isSafeInteger(input.retryAfterMs)
      || (input.retryAfterMs as number) < 0
      || (input.retryAfterMs as number) > 86_400_000)
  ) {
    errors.push("gatewayError.retryAfterMs: expected non-negative millisecond hint");
  }
  return { valid: errors.length === 0, errors };
}

export function isLlmGatewayError(input: unknown): input is LlmGatewayError {
  return validateLlmGatewayError(input).valid;
}
