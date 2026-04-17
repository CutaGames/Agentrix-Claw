import {
  Injectable,
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';

/**
 * Lightweight per-user sliding-window rate limiter.
 *
 * Configuration via env:
 *   CHAT_RATE_LIMIT_MAX     (default 30)   — max requests per window
 *   CHAT_RATE_LIMIT_WINDOW  (default 60)   — window length in seconds
 *
 * Process-local only (no Redis). Sufficient for single-node deploys to
 * stop runaway clients; replace with a distributed limiter when multi-node.
 */
@Injectable()
export class ChatRateLimitGuard implements CanActivate {
  private readonly logger = new Logger('ChatRateLimit');
  private readonly buckets = new Map<string, number[]>();
  private readonly maxRequests: number;
  private readonly windowMs: number;
  private lastSweep = Date.now();

  constructor() {
    this.maxRequests = Number(process.env.CHAT_RATE_LIMIT_MAX ?? 30);
    this.windowMs = Number(process.env.CHAT_RATE_LIMIT_WINDOW ?? 60) * 1000;
  }

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest();
    const userId: string | undefined = req?.user?.id;
    // No authenticated user (e.g. public endpoint) — let upstream guards handle it.
    if (!userId) return true;

    const now = Date.now();
    this.maybeSweep(now);

    const arr = this.buckets.get(userId) ?? [];
    const cutoff = now - this.windowMs;
    const recent = arr.filter((t) => t >= cutoff);

    if (recent.length >= this.maxRequests) {
      const retryAfter = Math.max(1, Math.ceil((recent[0] + this.windowMs - now) / 1000));
      this.logger.warn(
        `Rate limit hit user=${userId} count=${recent.length} max=${this.maxRequests} retryAfter=${retryAfter}s`,
      );
      throw new HttpException(
        {
          error: 'rate_limited',
          message: `Too many chat requests. Retry in ${retryAfter}s.`,
          retryAfter,
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    recent.push(now);
    this.buckets.set(userId, recent);
    return true;
  }

  /** Periodically purge expired buckets to bound memory. */
  private maybeSweep(now: number) {
    if (now - this.lastSweep < 60_000) return;
    this.lastSweep = now;
    const cutoff = now - this.windowMs;
    for (const [key, arr] of this.buckets.entries()) {
      const recent = arr.filter((t) => t >= cutoff);
      if (recent.length === 0) {
        this.buckets.delete(key);
      } else {
        this.buckets.set(key, recent);
      }
    }
  }
}
