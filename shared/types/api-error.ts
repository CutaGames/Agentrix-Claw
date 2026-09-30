/**
 * HTTP 错误响应（合同 v1 草案，CONTRACTS.md；REQ-release-022、E34）。
 *
 * 所有经过全局 `HttpExceptionFilter`（`backend/src/common/filters/http-exception.filter.ts`）的错误都是这个形状：
 *   `{ success: false, code, message, timestamp, path, ...转发字段 }`
 *
 * 转发字段（`API_ERROR_FORWARDED_KEYS`）：异常体里有才出现，其余键一律丢掉，不会把内部细节带出去。
 * - `reasonCode`：比 `code` 更细的原因（例如 `primary_agent_not_selected`、`remote_mutation_disabled`）。
 * - `blockedBy`、`capability`：数字分身等能力开关的阻塞原因，Web 按它显示文案。
 * - `errors`：字段级校验错误，最多 `API_ERROR_ERRORS_MAX` 条；每条是字符串或 `{ field?, code?, message? }` 这类纯数据对象。
 * - `current`：乐观并发冲突（409）时服务端的当前值，例如外观偏好的 `APPEARANCE_REVISION_CONFLICT`。
 * - `retryAfterSeconds`：429 时多少秒以后再试（整数，0–86400），和响应头 `Retry-After` 一致（E84 B 的二次确认）。
 *
 * 客户端解析要宽松：只认自己需要的键，未知键忽略；`message` 只用于显示，不要按文字做分支。
 */

export const API_ERROR_FORWARDED_KEYS = ['reasonCode', 'blockedBy', 'capability', 'errors', 'current', 'retryAfterSeconds'] as const;
export type ApiErrorForwardedKeyV1 = (typeof API_ERROR_FORWARDED_KEYS)[number];
export const API_ERROR_ERRORS_MAX = 50;
export const API_ERROR_RETRY_AFTER_MAX_SECONDS = 86400;

export interface ApiErrorBodyV1 {
  success: false;
  code: string;
  message: string;
  timestamp: string;
  path: string;
  reasonCode?: string;
  blockedBy?: unknown;
  capability?: unknown;
  errors?: unknown[];
  current?: Record<string, unknown>;
  retryAfterSeconds?: number;
}

function isRetryAfterSeconds(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= API_ERROR_RETRY_AFTER_MAX_SECONDS;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

/**
 * 服务端用：从异常体里挑出可以转发的字段。
 * - `reasonCode` 只接受非空字符串；`blockedBy`、`capability` 保持基线行为（有就原样转发）。
 * - `errors` 必须是数组，超过上限截断，非字符串、非纯对象的条目丢掉。
 * - `current` 必须是纯对象。
 * - `retryAfterSeconds` 必须是 0–86400 的整数。
 */
export function pickForwardedApiErrorFieldsV1(body: Record<string, unknown>): Partial<Pick<ApiErrorBodyV1, ApiErrorForwardedKeyV1>> {
  const picked: Partial<Pick<ApiErrorBodyV1, ApiErrorForwardedKeyV1>> = {};
  if (typeof body.reasonCode === 'string' && body.reasonCode.length > 0) picked.reasonCode = body.reasonCode;
  if (body.blockedBy !== undefined) picked.blockedBy = body.blockedBy;
  if (body.capability !== undefined) picked.capability = body.capability;
  if (Array.isArray(body.errors)) {
    picked.errors = body.errors
      .filter((item) => typeof item === 'string' || isPlainObject(item))
      .slice(0, API_ERROR_ERRORS_MAX);
  }
  if (isPlainObject(body.current)) picked.current = body.current;
  if (isRetryAfterSeconds(body.retryAfterSeconds)) picked.retryAfterSeconds = body.retryAfterSeconds;
  return picked;
}

export interface ParsedApiErrorV1 {
  code: string | null;
  message: string | null;
  reasonCode: string | null;
  errors: unknown[];
  current: Record<string, unknown> | null;
  retryAfterSeconds: number | null;
}

/** 客户端用：宽松解析任意错误响应体。拿不到的键给 `null` / 空数组，不抛错。 */
export function parseApiErrorBodyV1(value: unknown): ParsedApiErrorV1 {
  const record = isPlainObject(value) ? value : {};
  return {
    code: typeof record.code === 'string' && record.code ? record.code : null,
    message: typeof record.message === 'string' && record.message ? record.message : null,
    reasonCode: typeof record.reasonCode === 'string' && record.reasonCode ? record.reasonCode : null,
    errors: Array.isArray(record.errors) ? record.errors.slice(0, API_ERROR_ERRORS_MAX) : [],
    current: isPlainObject(record.current) ? record.current : null,
    retryAfterSeconds: isRetryAfterSeconds(record.retryAfterSeconds) ? record.retryAfterSeconds : null,
  };
}
