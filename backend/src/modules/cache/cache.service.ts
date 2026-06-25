import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
// import Redis from 'ioredis';

/**
 * 缓存服务（V3.0：性能优化 / V7.0: Redis 幂等性增强）
 * 支持内存缓存 and Redis 缓存
 */
@Injectable()
export class CacheService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(CacheService.name);
  private memoryCache: Map<string, { value: any; expiresAt: number }> = new Map();
  private redisClient: any | null = null;
  private useRedis: boolean = false;

  constructor(private configService: ConfigService) {
    this.logger.log('CacheService initialized (Memory-only mode for stability)');
    this.useRedis = false;
  }

  onModuleInit() {
    this.logger.log('CacheModule initialized');
  }

  onModuleDestroy() {
  }

  /**
   * 获取缓存
   */
  async get<T>(key: string): Promise<T | null> {
    try {
      // 内存缓存
      const cached = this.memoryCache.get(key);
      if (!cached) {
        return null;
      }

      // 检查是否过期
      if (cached.expiresAt < Date.now()) {
        this.memoryCache.delete(key);
        return null;
      }

      return cached.value as T;
    } catch (error) {
      this.logger.error(`获取缓存失败: ${key}`, error);
      return null;
    }
  }

  /**
   * 设置缓存
   */
  async set(key: string, value: any, ttlSeconds: number = 3600): Promise<void> {
    try {
      const expiresAt = Date.now() + ttlSeconds * 1000;
      // 内存缓存
      this.memoryCache.set(key, { value, expiresAt });

      // 限制内存缓存大小
      if (this.memoryCache.size > 1000) {
        const firstKey = this.memoryCache.keys().next().value;
        this.memoryCache.delete(firstKey);
      }
    } catch (error) {
      this.logger.error(`设置缓存失败: ${key}`, error);
    }
  }

  /**
   * 删除缓存
   */
  async delete(key: string): Promise<void> {
    try {
      if (this.useRedis && this.redisClient) {
        await this.redisClient.del(key);
        return;
      }

      this.memoryCache.delete(key);
    } catch (error) {
      this.logger.error(`删除缓存失败: ${key}`, error);
    }
  }

  /**
   * 清空缓存
   */
  async clear(): Promise<void> {
    try {
      if (this.useRedis && this.redisClient) {
        await this.redisClient.flushdb();
        return;
      }

      this.memoryCache.clear();
    } catch (error) {
      this.logger.error('清空缓存失败', error);
    }
  }

  /**
   * 获取或设置缓存
   */
  async getOrSet<T>(
    key: string,
    factory: () => Promise<T>,
    ttlSeconds: number = 3600,
  ): Promise<T> {
    const cached = await this.get<T>(key);
    if (cached !== null) {
      return cached;
    }

    const value = await factory();
    await this.set(key, value, ttlSeconds);
    return value;
  }
}
