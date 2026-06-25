import { Injectable, Logger } from '@nestjs/common';

/**
 * RateLimiterService — Per-user rate limiting and concurrent in-flight cap.
 *
 * Implements:
 * - 19.4: NestJS Throttler-style rate limiting (in-memory Phase 1)
 * - Concurrent in-flight cap of 10 jobs per user
 * - HTTP 429 + Retry-After header on excess
 *
 * Phase 1: In-memory sliding window. Production should use Redis SET.
 * Key format: `inflight:{userId}` for concurrent cap, sliding window for rate.
 *
 * Requirements: 13.6
 */
@Injectable()
export class RateLimiterService {
  private readonly logger = new Logger(RateLimiterService.name);

  /** Sliding window rate limit records: userId → timestamps[] */
  private readonly rateLimitWindows = new Map<string, number[]>();

  /** Concurrent in-flight jobs: userId → Set<jobId> */
  private readonly inflightJobs = new Map<string, Set<string>>();

  /** Max concurrent in-flight jobs per user */
  private readonly MAX_INFLIGHT = 10;

  /** Rate limit configs */
  private readonly RATE_LIMITS = {
    scanStart: { windowMs: 10_000, maxRequests: 1 },
    longWindow: { windowMs: 3_600_000, maxRequests: 50 },
  };

  /**
   * Check if a request is rate-limited.
   *
   * @param userId - The user making the request
   * @param action - The action being rate-limited (e.g., 'scanStart', 'longWindow')
   * @returns { allowed, retryAfterMs } — if not allowed, retryAfterMs indicates when to retry
   *
   * Requirements: 13.6
   */
  checkRateLimit(
    userId: string,
    action: string,
  ): { allowed: boolean; retryAfterMs?: number } {
    const config = (this.RATE_LIMITS as any)[action];
    if (!config) {
      return { allowed: true };
    }

    const key = `${action}:${userId}`;
    const now = Date.now();
    const windowStart = now - config.windowMs;

    // Get existing timestamps and filter to current window
    let timestamps = this.rateLimitWindows.get(key) || [];
    timestamps = timestamps.filter((t) => t > windowStart);

    if (timestamps.length >= config.maxRequests) {
      // Rate limited — calculate retry-after
      const oldestInWindow = timestamps[0];
      const retryAfterMs = oldestInWindow + config.windowMs - now;

      this.logger.warn(
        `Rate limited: user=${userId}, action=${action}, ` +
        `requests=${timestamps.length}/${config.maxRequests}, retryAfter=${retryAfterMs}ms`,
      );

      return { allowed: false, retryAfterMs: Math.max(0, retryAfterMs) };
    }

    // Record this request
    timestamps.push(now);
    this.rateLimitWindows.set(key, timestamps);

    return { allowed: true };
  }

  /**
   * Check if a user has exceeded the concurrent in-flight job cap.
   *
   * @param userId - The user to check
   * @returns { allowed, currentInflight, maxInflight }
   *
   * Requirements: 13.6
   */
  checkInflightCap(
    userId: string,
  ): { allowed: boolean; currentInflight: number; maxInflight: number } {
    const jobs = this.inflightJobs.get(userId);
    const currentInflight = jobs ? jobs.size : 0;

    return {
      allowed: currentInflight < this.MAX_INFLIGHT,
      currentInflight,
      maxInflight: this.MAX_INFLIGHT,
    };
  }

  /**
   * Register a new in-flight job for a user.
   *
   * @param userId - The user starting the job
   * @param jobId - The job identifier
   * @returns true if registered, false if cap exceeded
   */
  registerInflightJob(userId: string, jobId: string): boolean {
    const check = this.checkInflightCap(userId);
    if (!check.allowed) {
      return false;
    }

    let jobs = this.inflightJobs.get(userId);
    if (!jobs) {
      jobs = new Set();
      this.inflightJobs.set(userId, jobs);
    }

    jobs.add(jobId);
    return true;
  }

  /**
   * Release an in-flight job for a user (job completed or failed).
   *
   * @param userId - The user whose job completed
   * @param jobId - The job identifier to release
   */
  releaseInflightJob(userId: string, jobId: string): void {
    const jobs = this.inflightJobs.get(userId);
    if (jobs) {
      jobs.delete(jobId);
      if (jobs.size === 0) {
        this.inflightJobs.delete(userId);
      }
    }
  }

  /**
   * Get the Retry-After header value in seconds.
   */
  getRetryAfterSeconds(retryAfterMs: number): number {
    return Math.ceil(retryAfterMs / 1000);
  }
}
