/**
 * Phase 1.6 — Provider failover wrapper.
 *
 * Runs a primary LLM call. If it throws a transient/provider-specific error
 * (rate limit, 5xx, upstream timeout), falls back to the next provider in the
 * chain. Never retries the same provider more than once.
 *
 * Callers are responsible for:
 *   - Mapping each provider to a `() => Promise<T>` closure that performs the
 *     actual LLM call.
 *   - Supplying a label for each provider so logs can identify which step was
 *     triggered.
 */

export type ProviderAttempt<T> = {
  label: string;
  run: () => Promise<T>;
};

export type FailoverResult<T> = {
  value: T;
  usedLabel: string;
  attemptedLabels: string[];
  failoverOccurred: boolean;
};

/**
 * Returns true if the error looks transient enough to justify falling through
 * to the next provider. We deliberately stay conservative: auth errors and
 * explicit 4xx (except 429) are NOT retried because the downstream provider
 * will reject them too.
 */
export function isFailoverWorthy(err: any): boolean {
  if (!err) return false;
  const status =
    err?.status ??
    err?.statusCode ??
    err?.response?.status ??
    err?.cause?.status ??
    null;
  if (typeof status === 'number') {
    if (status === 429) return true;
    if (status >= 500 && status < 600) return true;
    if (status === 408) return true; // Request timeout
    return false;
  }
  const msg = String(err?.message || err || '').toLowerCase();
  if (msg.includes('etimedout') || msg.includes('econnreset') || msg.includes('econnrefused')) return true;
  if (msg.includes('socket hang up') || msg.includes('network') || msg.includes('fetch failed')) return true;
  if (msg.includes('rate limit') || msg.includes('rate_limit')) return true;
  if (msg.includes('overloaded') || msg.includes('service unavailable')) return true;
  return false;
}

export async function withFailover<T>(
  attempts: Array<ProviderAttempt<T>>,
  opts: { logger?: { warn: (msg: string) => void } } = {},
): Promise<FailoverResult<T>> {
  if (!attempts.length) {
    throw new Error('withFailover: no providers supplied');
  }
  const attemptedLabels: string[] = [];
  let lastErr: any = null;
  for (let i = 0; i < attempts.length; i++) {
    const { label, run } = attempts[i];
    attemptedLabels.push(label);
    try {
      const value = await run();
      return {
        value,
        usedLabel: label,
        attemptedLabels,
        failoverOccurred: i > 0,
      };
    } catch (err: any) {
      lastErr = err;
      const canFail = isFailoverWorthy(err) && i < attempts.length - 1;
      opts.logger?.warn(
        `[withFailover] provider=${label} failed (${err?.message || err})` +
        (canFail ? ` — falling over to ${attempts[i + 1].label}` : ' — no more providers'),
      );
      if (!canFail) throw err;
    }
  }
  throw lastErr || new Error('withFailover: exhausted providers');
}
