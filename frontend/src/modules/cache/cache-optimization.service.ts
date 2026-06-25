import { Injectable, Logger } from '@nestjs/common';
import { CacheService } from './cache.service';

@Injectable()
export class CacheOptimizationService {
  private readonly logger = new Logger(CacheOptimizationService.name);

  constructor(private cacheService: CacheService) {}

  /**
   * 缓存商户可信度评分（5分钟）
   */
  async getCachedMerchantTrust(merchantId: string, fetchFn: () => Promise<any>): Promise<any> {
    const cacheKey = `merchant_trust:${merchantId}`;
    const cached = await this.cacheService.get(cacheKey);
    
    if (cached) {
      return cached;
    }

    const data = await fetchFn();
    await this.cacheService.set(cacheKey, data, 300); // 5分钟
    return data;
  }

  /**
   * 缓存用户支付记忆（10分钟）
   */
  async getCachedPaymentMemory(userId: string, fetchFn: () => Promise<any>): Promise<any> {
    const cacheKey = `payment_memory:${userId}`;
    const cached = await this.cacheService.get(cacheKey);
    
    if (cached) {
      return cached;
    }

    const data = await fetchFn();
    await this.cacheService.set(cacheKey, data, 600); // 10分钟
    return data;
  }

  /**
   * 缓存手续费估算（1分钟）
   */
  async getCachedFeeEstimate(
    params: string,
    fetchFn: () => Promise<any>,
  ): Promise<any> {
    const cacheKey = `fee_estimate:${params}`;
    const cached = await this.cacheService.get(cacheKey);
    
    if (cached) {
      return cached;
    }

    const data = await fetchFn();
    await this.cacheService.set(cacheKey, data, 60); // 1分钟
    return data;
  }

  /**
   * 缓存订阅列表（5分钟）
   */
  async getCachedSubscriptions(userId: string, fetchFn: () => Promise<any>): Promise<any> {
    const cacheKey = `subscriptions:${userId}`;
    const cached = await this.cacheService.get(cacheKey);
    
    if (cached) {
      return cached;
    }

    const data = await fetchFn();
    await this.cacheService.set(cacheKey, data, 300); // 5分钟
    return data;
  }

  /**
   * 清除相关缓存
   */
  async invalidateUserCache(userId: string): Promise<void> {
    await Promise.all([
      this.cacheService.delete(`payment_memory:${userId}`),
      this.cacheService.delete(`subscriptions:${userId}`),
      this.cacheService.delete(`budgets:${userId}`),
    ]);
  }

  /**
   * 清除商户缓存
   */
  async invalidateMerchantCache(merchantId: string): Promise<void> {
    await this.cacheService.delete(`merchant_trust:${merchantId}`);
    await this.cacheService.delete(`merchant_stats:${merchantId}`);
  }
}

