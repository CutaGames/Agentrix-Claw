import {
  SoulCoreClientError,
  mapResponseToClientError,
  type ClientErrorKindV1,
  type ClientErrorV1,
} from '../../shared/client';

export type MobileReadState<T> =
  | { kind: 'ready'; data: T; capturedAt: string }
  | { kind: 'partial'; data: Partial<T>; missing: readonly string[]; capturedAt: string }
  | { kind: 'legacy'; data?: Partial<T>; reason: string; capturedAt?: string }
  | { kind: 'unknown'; reason: string }
  | { kind: 'unavailable'; capability: string; reason: string }
  | { kind: 'offline_stale'; data?: Partial<T>; capturedAt?: string; reason: string }
  | { kind: 'unauthorized'; reason: string }
  | { kind: 'forbidden'; reason: string }
  | { kind: 'redacted'; reason: string }
  | { kind: 'revoked'; reason: string }
  | { kind: 'unsupported_schema'; schemaVersion: string; reason: string }
  | { kind: 'error'; retryable: boolean; reason: string; correlationId?: string };

export interface MobileResourceReadOptions<T> {
  capability: string;
  enabled?: boolean;
  staleData?: Partial<T>;
  staleCapturedAt?: string;
  schemaVersion?: string;
  /** A missing optional/flagged endpoint is a capability absence, not empty success. */
  notFoundAsUnavailable?: boolean;
  now?: () => string;
}

const CLIENT_ERROR_KINDS: ReadonlySet<string> = new Set<ClientErrorKindV1>([
  'unauthorized',
  'forbidden',
  'redacted',
  'not_found',
  'unavailable',
  'stale',
  'version_mismatch',
  'revoked',
  'network',
  'unknown',
]);

function readString(record: Record<string, unknown>, key: string): string | undefined {
  const value = record[key];
  return typeof value === 'string' ? value : undefined;
}

function readStatus(error: unknown): number | undefined {
  if (!error || typeof error !== 'object') return undefined;
  const record = error as Record<string, unknown>;
  if (typeof record.httpStatus === 'number') return record.httpStatus;
  if (typeof record.status === 'number') return record.status;
  const response = record.response;
  if (response && typeof response === 'object' && typeof (response as Record<string, unknown>).status === 'number') {
    return (response as Record<string, unknown>).status as number;
  }
  return undefined;
}

function statusFromMessage(message: string): number | undefined {
  const match = message.match(/(?:request failed:|server error \()?\s*(\d{3})\)?/i);
  return match ? Number(match[1]) : undefined;
}

function coerceClientError(error: unknown): ClientErrorV1 {
  if (error instanceof SoulCoreClientError) return error;

  if (error && typeof error === 'object') {
    const record = error as Record<string, unknown>;
    const kind = readString(record, 'kind');
    if (kind && CLIENT_ERROR_KINDS.has(kind)) {
      return {
        kind: kind as ClientErrorKindV1,
        message: readString(record, 'message') || kind,
        retryable: record.retryable === true,
        httpStatus: readStatus(error),
        code: readString(record, 'code'),
        requestId: readString(record, 'requestId'),
      };
    }
  }

  const message = error instanceof Error ? error.message : String(error || 'Unknown client error');
  const status = readStatus(error) ?? statusFromMessage(message);
  if (status !== undefined) {
    const record = error && typeof error === 'object' ? error as Record<string, unknown> : {};
    return mapResponseToClientError(status, {
      message,
      code: readString(record, 'code'),
      requestId: readString(record, 'requestId'),
    });
  }

  if (/network|offline|failed to fetch|timeout|timed out|connection/i.test(message)) {
    return {
      kind: 'network',
      message,
      retryable: true,
    };
  }

  return {
    kind: 'unknown',
    message,
    retryable: false,
  };
}

function errorReason(error: ClientErrorV1): string {
  return error.code || error.kind;
}

export function readyMobileReadState<T>(
  data: T,
  capturedAt = new Date().toISOString(),
): MobileReadState<T> {
  return { kind: 'ready', data, capturedAt };
}

export function partialMobileReadState<T>(
  data: Partial<T>,
  missing: readonly string[],
  capturedAt = new Date().toISOString(),
): MobileReadState<T> {
  return { kind: 'partial', data, missing: [...missing], capturedAt };
}

export function unknownMobileReadState<T>(reason: string): MobileReadState<T> {
  return { kind: 'unknown', reason };
}

export function legacyMobileReadState<T>(
  reason: string,
  data?: Partial<T>,
  capturedAt?: string,
): MobileReadState<T> {
  return { kind: 'legacy', reason, data, capturedAt };
}

export function normalizeMobileReadError<T>(
  error: unknown,
  options: MobileResourceReadOptions<T>,
): MobileReadState<T> {
  const clientError = coerceClientError(error);
  const reason = errorReason(clientError);

  switch (clientError.kind) {
    case 'unauthorized':
      return { kind: 'unauthorized', reason };
    case 'forbidden':
      return { kind: 'forbidden', reason };
    case 'redacted':
      return { kind: 'redacted', reason };
    case 'revoked':
      return { kind: 'revoked', reason };
    case 'version_mismatch':
      return {
        kind: 'unsupported_schema',
        schemaVersion: options.schemaVersion || 'unknown',
        reason,
      };
    case 'not_found':
      if (options.notFoundAsUnavailable !== false) {
        return { kind: 'unavailable', capability: options.capability, reason };
      }
      return {
        kind: 'error',
        retryable: false,
        reason,
        correlationId: clientError.requestId,
      };
    case 'network':
    case 'stale':
    case 'unavailable':
      if (options.staleData !== undefined) {
        return {
          kind: 'offline_stale',
          data: options.staleData,
          capturedAt: options.staleCapturedAt,
          reason,
        };
      }
      return {
        kind: 'error',
        retryable: true,
        reason,
        correlationId: clientError.requestId,
      };
    case 'unknown':
    default:
      return {
        kind: 'error',
        retryable: clientError.retryable,
        reason,
        correlationId: clientError.requestId,
      };
  }
}

/**
 * Execute a typed mobile read without inventing domain truth. Disabled or
 * absent capabilities return explicit `unavailable`; stale data stays marked
 * stale and never becomes a fresh `ready` state.
 */
export async function readMobileResource<T>(
  query: () => Promise<T>,
  options: MobileResourceReadOptions<T>,
): Promise<MobileReadState<T>> {
  if (options.enabled === false) {
    return {
      kind: 'unavailable',
      capability: options.capability,
      reason: 'feature_disabled',
    };
  }

  try {
    const data = await query();
    const capturedAt = (options.now ?? (() => new Date().toISOString()))();
    return readyMobileReadState(data, capturedAt);
  } catch (error) {
    return normalizeMobileReadError(error, options);
  }
}
