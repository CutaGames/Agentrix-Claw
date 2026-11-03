/**
 * P1-05 · Shared Client Platform — normalized error model.
 *
 * One consistent error vocabulary across Web / Mobile / Desktop (roadmap P1-05:
 * "错误定义一致"). Clients never invent per-platform error semantics; they map
 * transport + Backend error codes into these kinds.
 */

/** Unified client error kinds (web-soul-core-console-v6 §6.2 + transport-level). */
export type ClientErrorKindV1 =
  | 'unauthorized'
  | 'forbidden'
  | 'redacted'
  | 'not_found'
  | 'unavailable'
  | 'stale'
  | 'version_mismatch'
  | 'revoked'
  | 'network'
  | 'unknown';

export interface ClientErrorV1 {
  kind: ClientErrorKindV1;
  message: string;
  retryable: boolean;
  httpStatus?: number;
  /** Backend machine code, e.g. SOUL_CORE_SCHEMA_UNSUPPORTED. */
  code?: string;
  requestId?: string;
}

export class SoulCoreClientError extends Error implements ClientErrorV1 {
  readonly kind: ClientErrorKindV1;
  readonly retryable: boolean;
  readonly httpStatus?: number;
  readonly code?: string;
  readonly requestId?: string;

  constructor(e: ClientErrorV1) {
    super(e.message);
    this.name = 'SoulCoreClientError';
    this.kind = e.kind;
    this.retryable = e.retryable;
    this.httpStatus = e.httpStatus;
    this.code = e.code;
    this.requestId = e.requestId;
  }
}

const RETRYABLE_KINDS: ReadonlySet<ClientErrorKindV1> = new Set<ClientErrorKindV1>([
  'unavailable',
  'network',
  'stale',
]);

interface ErrorBodyShape {
  code?: unknown;
  message?: unknown;
  requestId?: unknown;
  error?: { code?: unknown; message?: unknown; requestId?: unknown } | string;
}

function readBody(body: unknown): { code?: string; message?: string; requestId?: string } {
  if (!body || typeof body !== 'object') return {};
  const b = body as ErrorBodyShape;
  const inner = typeof b.error === 'object' && b.error !== null ? b.error : undefined;
  const code = (b.code ?? inner?.code) as string | undefined;
  const message = (b.message ?? inner?.message) as string | undefined;
  const requestId = (b.requestId ?? inner?.requestId) as string | undefined;
  return {
    code: typeof code === 'string' ? code : undefined,
    message: typeof message === 'string' ? message : undefined,
    requestId: typeof requestId === 'string' ? requestId : undefined,
  };
}

/**
 * Map an HTTP status + parsed body into a normalized {@link ClientErrorV1}.
 * A schema-unsupported backend code always resolves to `version_mismatch`
 * (never a silent downgrade). `status <= 0` denotes a transport/network fault.
 */
export function mapResponseToClientError(status: number, body?: unknown): ClientErrorV1 {
  const { code, message, requestId } = readBody(body);
  const base = { httpStatus: status, code, requestId };

  const finish = (kind: ClientErrorKindV1, fallbackMsg: string): ClientErrorV1 => ({
    kind,
    message: message || fallbackMsg,
    retryable: RETRYABLE_KINDS.has(kind),
    ...base,
  });

  // Backend schema-version rejection wins regardless of status shape.
  if (code === 'SOUL_CORE_SCHEMA_UNSUPPORTED' || code === 'SCHEMA_VERSION_UNSUPPORTED') {
    return finish('version_mismatch', 'Unsupported schema version');
  }
  if (status <= 0) return finish('network', 'Network request failed');
  if (status === 401) return finish('unauthorized', 'Unauthorized');
  if (status === 403) {
    return finish(code === 'REDACTED' ? 'redacted' : 'forbidden', 'Forbidden');
  }
  if (status === 404) return finish('not_found', 'Not found');
  if (status === 409) {
    return finish(code === 'VERSION_CONFLICT' ? 'version_mismatch' : 'revoked', 'Conflict');
  }
  if (status === 410) return finish('revoked', 'Gone / revoked');
  if (status === 412 || status === 428) return finish('version_mismatch', 'Precondition failed');
  if (status === 429 || status === 502 || status === 503 || status === 504) {
    return finish('unavailable', 'Service temporarily unavailable');
  }
  if (status >= 500) return finish('unavailable', 'Server error');
  if (status >= 400) return finish('unknown', 'Request failed');
  return finish('unknown', 'Unexpected response');
}

export function toClientError(status: number, body?: unknown): SoulCoreClientError {
  return new SoulCoreClientError(mapResponseToClientError(status, body));
}
