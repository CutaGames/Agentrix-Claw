/**
 * Rate Limiting Guard
 * 
 * 生产环境 API 速率限制 (简化版，不依赖 @nestjs/throttler)
 */

import { Injectable, CanActivate, ExecutionContext, HttpException, HttpStatus } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

interface RateLimitRecord {
  count: number;
  resetTime: number;
}

@Injectable()
export class RateLimitGuard implements CanActivate {
  private readonly store = new Map<string, RateLimitRecord>();
  private readonly ttl: number;
  private readonly limit: number;

  constructor(private configService: ConfigService) {
    this.ttl = this.configService.get<number>('RATE_LIMIT_TTL', 60) * 1000;
    this.limit = this.configService.get<number>('RATE_LIMIT_MAX', 200);
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const key = this.getKey(request);
    const now = Date.now();

    // Authenticated users get a higher limit
    const isAuthenticated = !!request.headers?.authorization;
    const effectiveLimit = isAuthenticated ? this.limit * 3 : this.limit;

    // 清理过期记录
    this.cleanup(now);

    const record = this.store.get(key);

    if (!record) {
      this.store.set(key, { count: 1, resetTime: now + this.ttl });
      return true;
    }

    if (now > record.resetTime) {
      this.store.set(key, { count: 1, resetTime: now + this.ttl });
      return true;
    }

    if (record.count >= effectiveLimit) {
      throw new HttpException(
        {
          statusCode: HttpStatus.TOO_MANY_REQUESTS,
          message: 'Too many requests. Please try again later.',
          error: 'Too Many Requests',
          retryAfter: Math.ceil((record.resetTime - now) / 1000),
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    record.count++;
    return true;
  }

  private getKey(request: any): string {
    // Use user ID for authenticated requests, IP for anonymous
    const userId = request.user?.id || request.user?.sub;
    if (userId) return `rate_limit:user:${userId}`;
    const ip = request.ip || request.connection?.remoteAddress || 'unknown';
    return `rate_limit:${ip}`;
  }

  private cleanup(now: number): void {
    if (this.store.size > 10000) {
      for (const [key, record] of this.store.entries()) {
        if (now > record.resetTime) {
          this.store.delete(key);
        }
      }
    }
  }
}
