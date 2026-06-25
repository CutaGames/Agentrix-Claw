/**
 * withRetry — Exponential Backoff Retry Engine
 *
 * Reference: Claude Code's retry logic with consecutive-529 tracking,
 * exponential backoff + jitter, model-level fallback, and abort support.
 */
import { Logger } from '@nestjs/common';

const logger = new Logger('withRetry');

// ============================================================
// Configuration
// ============================================================

export interface RetryConfig {
  /** Max number of retries (default 3) */
  maxRetries?: number;
  /** Base delay in ms (default 1000) */
  baseDelayMs?: number;
  /** Max delay cap in ms (default 30000) */
  maxDelayMs?: number;
  /** Jitter factor 0-1 (default 0.2) */
  jitterFactor?: number;
  /** HTTP status codes to retry on (default: [429, 500, 502, 503, 529]) */
  retryableStatuses?: number[];
  /** Abort signal */
  abortSignal?: AbortSignal;
  /** Callback when a retry happens */
  onRetry?: (attempt: number, error: any, delayMs: number) => void;
  /** Fallback function to call if all retries exhausted */
  fallback?: () => Promise<any>;
}

const DEFAULT_CONFIG: Required<Omit<RetryConfig, 'abortSignal' | 'onRetry' | 'fallback'>> = {
  maxRetries: 3,
  baseDelayMs: 1000,
  maxDelayMs: 30000,
  jitterFactor: 0.2,
  retryableStatuses: [429, 500, 502, 503, 529],
};

// ============================================================
// Overload Detection (consecutive 529s)
// ============================================================

let consecutive529Count = 0;
const OVERLOAD_THRESHOLD = 3;
const OVERLOAD_COOLDOWN_MS = 60_000;
let overloadCooldownUntil = 0;

export function isOverloaded(): boolean {
  return Date.now() < overloadCooldownUntil;
}

export function resetOverloadState(): void {
  consecutive529Count = 0;
  overloadCooldownUntil = 0;
}

// ============================================================
// Core Retry Function
// ============================================================

/**
 * Execute an async function with exponential backoff retry.
 *
 * @param fn - The async function to retry
 * @param config - Retry configuration
 * @returns The result from fn
 * @throws The last error if all retries are exhausted
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  config?: RetryConfig,
): Promise<T> {
  const {
    maxRetries,
    baseDelayMs,
    maxDelayMs,
    jitterFactor,
    retryableStatuses,
  } = { ...DEFAULT_CONFIG, ...config };

  const abortSignal = config?.abortSignal;
  let lastError: any;

  // Overload check: if too many 529s, wait for cooldown
  if (isOverloaded()) {
    const waitMs = overloadCooldownUntil - Date.now();
    logger.warn(`Overload cooldown active, waiting ${waitMs}ms`);
    await sleep(waitMs, abortSignal);
  }

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    if (abortSignal?.aborted) {
      throw new Error('Aborted');
    }

    try {
      const result = await fn();
      // Success: reset 529 counter
      if (consecutive529Count > 0) {
        consecutive529Count = 0;
      }
      return result;
    } catch (error: any) {
      lastError = error;

      // Check if this is a retriable error
      const status = error?.status ?? error?.response?.status ?? error?.statusCode;
      const isRetriable = status
        ? retryableStatuses.includes(status)
        : isTransientError(error);

      // Track consecutive 529s (overload)
      if (status === 529) {
        consecutive529Count++;
        if (consecutive529Count >= OVERLOAD_THRESHOLD) {
          overloadCooldownUntil = Date.now() + OVERLOAD_COOLDOWN_MS;
          logger.error(
            `${OVERLOAD_THRESHOLD} consecutive 529s — entering ${OVERLOAD_COOLDOWN_MS}ms cooldown`,
          );
        }
      } else {
        consecutive529Count = 0;
      }

      if (!isRetriable || attempt >= maxRetries) {
        // If we have a fallback, try it
        if (config?.fallback && attempt >= maxRetries) {
          logger.warn(`All ${maxRetries} retries exhausted, trying fallback`);
          return config.fallback();
        }
        throw lastError;
      }

      // Calculate delay with exponential backoff + jitter
      const exponentialDelay = baseDelayMs * Math.pow(2, attempt);
      const jitter = exponentialDelay * jitterFactor * (Math.random() * 2 - 1);
      const delay = Math.min(exponentialDelay + jitter, maxDelayMs);

      // Use Retry-After header if available
      const retryAfter = error?.response?.headers?.['retry-after'];
      const finalDelay = retryAfter
        ? Math.max(delay, parseRetryAfter(retryAfter))
        : delay;

      logger.warn(
        `Retry ${attempt + 1}/${maxRetries} after ${Math.round(finalDelay)}ms ` +
        `(status=${status || 'N/A'}, error=${error.message?.slice(0, 100)})`,
      );

      config?.onRetry?.(attempt + 1, error, finalDelay);

      await sleep(finalDelay, abortSignal);
    }
  }

  throw lastError;
}

// ============================================================
// Model Fallback Chain
// ============================================================

export interface ModelFallbackConfig {
  /** Ordered list of models to try (first = primary) */
  models: string[];
  /** Function that makes the actual API call with a given model */
  callWithModel: (model: string) => Promise<any>;
  /** Retry config for each model */
  retryConfig?: RetryConfig;
}

/**
 * Try models in order. If a model fails after retries, fall back to the next.
 */
export async function withModelFallback<T>(config: ModelFallbackConfig): Promise<T> {
  const { models, callWithModel, retryConfig } = config;
  let lastError: any;

  for (let i = 0; i < models.length; i++) {
    const model = models[i];
    try {
      return await withRetry(
        () => callWithModel(model),
        {
          ...retryConfig,
          // Don't use fallback for intermediate models
          fallback: undefined,
        },
      );
    } catch (error: any) {
      lastError = error;
      if (i < models.length - 1) {
        logger.warn(`Model ${model} failed, falling back to ${models[i + 1]}`);
      }
    }
  }

  throw lastError;
}

// ============================================================
// Helpers
// ============================================================

function isTransientError(error: any): boolean {
  if (!error) return false;
  const msg = (error.message || '').toLowerCase();
  return (
    msg.includes('econnreset') ||
    msg.includes('econnrefused') ||
    msg.includes('etimedout') ||
    msg.includes('socket hang up') ||
    msg.includes('network') ||
    msg.includes('timeout') ||
    msg.includes('overloaded')
  );
}

function parseRetryAfter(value: string): number {
  const seconds = parseFloat(value);
  if (!isNaN(seconds)) return seconds * 1000;
  const date = new Date(value).getTime();
  if (!isNaN(date)) return Math.max(0, date - Date.now());
  return 0;
}

function sleep(ms: number, abortSignal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (abortSignal?.aborted) {
      reject(new Error('Aborted'));
      return;
    }
    const timer = setTimeout(resolve, ms);
    abortSignal?.addEventListener('abort', () => {
      clearTimeout(timer);
      reject(new Error('Aborted'));
    }, { once: true });
  });
}
