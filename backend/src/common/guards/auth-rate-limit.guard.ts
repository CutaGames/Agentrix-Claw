/**
 * Auth Rate Limit Guard
 *
 * Stricter rate limiting for authentication endpoints (login, register, OTP)
 * to prevent brute-force and credential-stuffing attacks.
 *
 * Default: 10 attempts per 60 seconds per IP.
 */

import { Injectable, CanActivate, ExecutionContext, HttpException, HttpStatus, Logger } from '@nestjs/common';

interface AuthRateLimitRecord {
  count: number;
  resetTime: number;
}

@Injectable()
export class AuthRateLimitGuard implements CanActivate {
  private readonly logger = new Logger(AuthRateLimitGuard.name);
  private readonly store = new Map<string, AuthRateLimitRecord>();
  private readonly ttl = 60_000; // 60 seconds
  private readonly limit = 10;   // 10 attempts per window
  private lastCleanup = Date.now();

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const ip = request.ip || request.connection?.remoteAddress || 'unknown';
    const route = request.route?.path || request.url || '';
    const key = `auth_rl:${ip}:${route}`;
    const now = Date.now();

    // Periodic cleanup (every 5 minutes)
    if (now - this.lastCleanup > 300_000) {
      this.cleanup(now);
      this.lastCleanup = now;
    }

    const record = this.store.get(key);

    if (!record || now > record.resetTime) {
      this.store.set(key, { count: 1, resetTime: now + this.ttl });
      return true;
    }

    if (record.count >= this.limit) {
      const retryAfter = Math.ceil((record.resetTime - now) / 1000);
      this.logger.warn(`Auth rate limit exceeded: ip=${ip} route=${route} count=${record.count}`);
      throw new HttpException(
        {
          statusCode: HttpStatus.TOO_MANY_REQUESTS,
          message: 'Too many authentication attempts. Please try again later.',
          error: 'Too Many Requests',
          retryAfter,
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    record.count++;
    return true;
  }

  private cleanup(now: number): void {
    for (const [key, record] of this.store.entries()) {
      if (now > record.resetTime) {
        this.store.delete(key);
      }
    }
  }
}
