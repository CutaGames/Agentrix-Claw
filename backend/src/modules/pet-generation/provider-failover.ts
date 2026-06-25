/**
 * Provider failover helper — Phase 2 W2 (BE-T2.8).
 *
 * Wraps a primary provider call with an automatic fallback when the primary
 * fails with a retryable error. Pure function; injectable callers (PetGenerationService,
 * future VideoGenerationService) can reuse without dragging in NestJS DI.
 *
 * Usage:
 *   const { result, providerUsed, attempts } = await runWithFailover({
 *     primary: { name: 'meshy', exec: () => meshy.submit(...) },
 *     fallback: { name: 'hunyuan3d', exec: () => hunyuan.submit(...) },
 *     isRetryable: defaultIsRetryable, // 5xx + transient
 *   });
 */

export interface ProviderAttempt<T> {
  name: string;
  exec: () => Promise<T>;
}

export interface FailoverOptions<T> {
  primary: ProviderAttempt<T>;
  fallback?: ProviderAttempt<T>;
  isRetryable?: (err: unknown) => boolean;
  /** Optional callback for telemetry / audit logging. */
  onAttempt?: (info: {
    providerName: string;
    attempt: number;
    success: boolean;
    error?: unknown;
    elapsedMs: number;
  }) => void;
}

export interface FailoverResult<T> {
  result: T;
  providerUsed: string;
  attempts: number;
  /** First-attempt error if fallback was used; null if primary succeeded. */
  primaryError: unknown | null;
}

const RETRYABLE_HTTP_STATUSES = new Set([408, 429, 500, 502, 503, 504]);

/**
 * Default retry predicate.
 * Treats 5xx + 408 + 429 + network errors (no .status) as retryable.
 * Explicit 4xx (except 408/429) are NOT retryable — they indicate caller error.
 */
export function defaultIsRetryable(err: unknown): boolean {
  if (!err) return false;
  const e = err as { status?: number; statusCode?: number; code?: string; message?: string };
  const status = e.status ?? e.statusCode;
  if (typeof status === 'number') {
    return RETRYABLE_HTTP_STATUSES.has(status);
  }
  // Network-level errors (ECONNRESET, ETIMEDOUT, ENOTFOUND, fetch failed)
  if (typeof e.code === 'string' && /ECONN|ETIMEDOUT|ENOTFOUND|EAI_AGAIN/.test(e.code)) {
    return true;
  }
  if (typeof e.message === 'string' && /fetch failed|network|timeout/i.test(e.message)) {
    return true;
  }
  return false;
}

export async function runWithFailover<T>(opts: FailoverOptions<T>): Promise<FailoverResult<T>> {
  const isRetryable = opts.isRetryable ?? defaultIsRetryable;
  const primaryStart = Date.now();
  try {
    const result = await opts.primary.exec();
    opts.onAttempt?.({
      providerName: opts.primary.name,
      attempt: 1,
      success: true,
      elapsedMs: Date.now() - primaryStart,
    });
    return { result, providerUsed: opts.primary.name, attempts: 1, primaryError: null };
  } catch (primaryErr) {
    opts.onAttempt?.({
      providerName: opts.primary.name,
      attempt: 1,
      success: false,
      error: primaryErr,
      elapsedMs: Date.now() - primaryStart,
    });
    if (!opts.fallback || !isRetryable(primaryErr)) {
      throw primaryErr;
    }
    const fallbackStart = Date.now();
    try {
      const result = await opts.fallback.exec();
      opts.onAttempt?.({
        providerName: opts.fallback.name,
        attempt: 2,
        success: true,
        elapsedMs: Date.now() - fallbackStart,
      });
      return {
        result,
        providerUsed: opts.fallback.name,
        attempts: 2,
        primaryError: primaryErr,
      };
    } catch (fallbackErr) {
      opts.onAttempt?.({
        providerName: opts.fallback.name,
        attempt: 2,
        success: false,
        error: fallbackErr,
        elapsedMs: Date.now() - fallbackStart,
      });
      // Throw fallback error; primary error attached as cause for diagnostics.
      const composed = fallbackErr as Error & { cause?: unknown };
      if (composed && typeof composed === 'object') {
        composed.cause = primaryErr;
      }
      throw fallbackErr;
    }
  }
}
