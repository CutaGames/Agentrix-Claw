import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { IProvider, ProviderQuote } from './provider-abstract.service';
import { MockProviderService } from './mock-provider.service';
import { TransakProviderService } from './transak-provider.service';
// import { OSLProviderService } from './osl-provider.service'; // 已注销 - 不再使用OSL支付

interface ProviderHealth {
  providerId: string;
  isHealthy: boolean;
  lastCheck: Date;
  consecutiveFailures: number;
  lastError?: string;
}

/**
 * Provider 管理器
 * 统一管理所有 Provider，支持比价、健康检查和故障转移
 */
@Injectable()
export class ProviderManagerService implements OnModuleInit {
  private readonly logger = new Logger(ProviderManagerService.name);
  private providers: Map<string, IProvider> = new Map();
  private providerHealth: Map<string, ProviderHealth> = new Map();
  
  // 健康检查配置
  private readonly HEALTH_CHECK_INTERVAL = 60 * 1000; // 1分钟
  private readonly MAX_CONSECUTIVE_FAILURES = 3; // 连续失败次数阈值
  private readonly RECOVERY_CHECK_INTERVAL = 5 * 60 * 1000; // 5分钟后重试不健康的 Provider

  constructor(
    private mockProvider: MockProviderService,
    private transakProvider?: TransakProviderService,
    // private oslProvider?: OSLProviderService, // 已注销
  ) {
    // 注册 Mock Provider（用于测试）
    this.registerProvider(mockProvider);

    // 注册 Transak Provider（如果已配置）
    if (transakProvider) {
      try {
        this.registerProvider(transakProvider);
        this.logger.log('Transak Provider registered successfully');
      } catch (error) {
        this.logger.warn('Transak Provider not available (credentials not configured)');
      }
    }

    // 注册 OSL Pay Provider（如果已配置）- 已注销
    // if (oslProvider) {
    //   try {
    //     this.registerProvider(oslProvider);
    //     this.logger.log('OSL Pay Provider registered successfully');
    //   } catch (error) {
    //     this.logger.warn('OSL Pay Provider not available (credentials not configured)');
    //   }
    // }
  }

  /**
   * 模块初始化时启动健康检查
   */
  onModuleInit() {
    this.startHealthCheck();
  }

  /**
   * 启动定期健康检查
   */
  private startHealthCheck() {
    setInterval(() => {
      this.checkAllProvidersHealth();
    }, this.HEALTH_CHECK_INTERVAL);
    
    // 立即执行一次
    this.checkAllProvidersHealth();
  }

  /**
   * 检查所有 Provider 健康状态
   */
  private async checkAllProvidersHealth() {
    for (const [providerId, provider] of this.providers) {
      // 跳过 Mock Provider
      if (providerId === 'mock') continue;
      
      await this.checkProviderHealth(provider);
    }
  }

  /**
   * 检查单个 Provider 健康状态
   */
  private async checkProviderHealth(provider: IProvider) {
    const health = this.providerHealth.get(provider.id) || {
      providerId: provider.id,
      isHealthy: true,
      lastCheck: new Date(),
      consecutiveFailures: 0,
    };

    try {
      // 尝试获取一个报价来测试连通性
      // 使用 100 USD -> BNB (BSC) 作为测试，因为 10 USD 可能低于 Transak 最小限额
      await provider.getQuote(100, 'USD', 'BNB');
      
      // 成功，重置健康状态
      health.isHealthy = true;
      health.consecutiveFailures = 0;
      health.lastError = undefined;
      this.logger.debug(`Provider ${provider.id} health check passed`);
    } catch (error: any) {
      health.consecutiveFailures++;
      health.lastError = error.message;
      
      if (health.consecutiveFailures >= this.MAX_CONSECUTIVE_FAILURES) {
        health.isHealthy = false;
        this.logger.warn(
          `Provider ${provider.id} marked as unhealthy after ${health.consecutiveFailures} consecutive failures: ${error.message}`
        );
      } else {
        this.logger.debug(
          `Provider ${provider.id} health check failed (${health.consecutiveFailures}/${this.MAX_CONSECUTIVE_FAILURES}): ${error.message}`
        );
      }
    }

    health.lastCheck = new Date();
    this.providerHealth.set(provider.id, health);
  }

  /**
   * 注册 Provider
   */
  registerProvider(provider: IProvider) {
    this.providers.set(provider.id, provider);
    this.logger.log(`Provider registered: ${provider.id} (${provider.name})`);
  }

  /**
   * 获取 Provider
   */
  getProvider(providerId: string): IProvider | null {
    return this.providers.get(providerId) || null;
  }

  /**
   * 检查 Provider 是否健康
   */
  isProviderHealthy(providerId: string): boolean {
    const health = this.providerHealth.get(providerId);
    if (!health) return true; // 新 Provider 默认健康
    return health.isHealthy;
  }

  /**
   * 获取 Provider 健康状态
   */
  getProviderHealth(providerId: string): ProviderHealth | null {
    return this.providerHealth.get(providerId) || null;
  }

  /**
   * 获取所有 Provider 健康状态（用于监控/管理界面）
   */
  getAllProviderHealth(): ProviderHealth[] {
    return Array.from(this.providerHealth.values());
  }

  /**
   * 手动标记 Provider 为不健康（供外部调用，如 Webhook 失败时）
   */
  markProviderUnhealthy(providerId: string, reason: string) {
    const health = this.providerHealth.get(providerId) || {
      providerId,
      isHealthy: true,
      lastCheck: new Date(),
      consecutiveFailures: 0,
    };
    
    health.isHealthy = false;
    health.lastError = reason;
    health.consecutiveFailures = this.MAX_CONSECUTIVE_FAILURES;
    this.providerHealth.set(providerId, health);
    
    this.logger.warn(`Provider ${providerId} manually marked as unhealthy: ${reason}`);
  }

  /**
   * 手动恢复 Provider 健康状态
   */
  markProviderHealthy(providerId: string) {
    const health = this.providerHealth.get(providerId);
    if (health) {
      health.isHealthy = true;
      health.consecutiveFailures = 0;
      health.lastError = undefined;
      this.logger.log(`Provider ${providerId} manually marked as healthy`);
    }
  }

  /**
   * 获取所有支持 On-ramp 的 Provider
   */
  getOnRampProviders(onlyHealthy = false): IProvider[] {
    return Array.from(this.providers.values()).filter((p) => {
      if (!p.supportsOnRamp) return false;
      if (onlyHealthy && !this.isProviderHealthy(p.id)) return false;
      return true;
    });
  }

  /**
   * 获取所有支持 Off-ramp 的 Provider
   */
  getOffRampProviders(onlyHealthy = false): IProvider[] {
    return Array.from(this.providers.values()).filter((p) => {
      if (!p.supportsOffRamp) return false;
      if (onlyHealthy && !this.isProviderHealthy(p.id)) return false;
      return true;
    });
  }

  /**
   * 选择最优 Provider（比价）
   * 支持健康检查过滤和故障转移
   */
  async selectBestProvider(
    amount: number,
    fromCurrency: string,
    toCurrency: string,
    type: 'onramp' | 'offramp',
    options: { onlyHealthy?: boolean; excludeProviders?: string[] } = {},
  ): Promise<IProvider | null> {
    const { onlyHealthy = true, excludeProviders = [] } = options;
    
    let candidates = type === 'onramp' 
      ? this.getOnRampProviders(onlyHealthy) 
      : this.getOffRampProviders(onlyHealthy);

    // 排除指定的 Provider（用于故障转移）
    if (excludeProviders.length > 0) {
      candidates = candidates.filter(p => !excludeProviders.includes(p.id));
    }

    if (candidates.length === 0) {
      this.logger.warn(`No ${type} providers available (healthy=${onlyHealthy})`);
      return null;
    }

    // 获取所有 Provider 的报价
    const quotes = await Promise.all(
      candidates.map(async (provider) => {
        try {
          const quote = await provider.getQuote(amount, fromCurrency, toCurrency);
          return { provider, quote };
        } catch (error: any) {
          this.logger.warn(`Failed to get quote from ${provider.id}: ${error.message}`);
          // 记录失败，更新健康状态
          this.recordProviderFailure(provider.id, error.message);
          return null;
        }
      }),
    );

    // 过滤失败的报价
    const validQuotes = quotes.filter((q) => q !== null) as Array<{
      provider: IProvider;
      quote: ProviderQuote;
    }>;

    if (validQuotes.length === 0) {
      this.logger.warn(`No valid quotes from ${type} providers`);
      return null;
    }

    // 选择最优报价（费率最低，即 estimatedAmount 最高）
    const best = validQuotes.reduce((best, current) => {
      return current.quote.estimatedAmount > best.quote.estimatedAmount
        ? current
        : best;
    });

    this.logger.log(
      `Selected best provider: ${best.provider.id} (rate: ${best.quote.rate}, estimated: ${best.quote.estimatedAmount})`,
    );

    return best.provider;
  }

  /**
   * 带故障转移的 Provider 执行
   * 如果首选 Provider 失败，自动尝试下一个最优 Provider
   */
  async executeWithFailover<T>(
    operation: (provider: IProvider) => Promise<T>,
    type: 'onramp' | 'offramp',
    amount: number,
    fromCurrency: string,
    toCurrency: string,
    maxRetries = 2,
  ): Promise<{ result: T; provider: IProvider }> {
    const excludeProviders: string[] = [];
    let lastError: Error | null = null;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      const provider = await this.selectBestProvider(
        amount,
        fromCurrency,
        toCurrency,
        type,
        { onlyHealthy: true, excludeProviders },
      );

      if (!provider) {
        throw lastError || new Error(`No available ${type} providers`);
      }

      try {
        this.logger.log(`Attempting ${type} with provider ${provider.id} (attempt ${attempt + 1}/${maxRetries})`);
        const result = await operation(provider);
        return { result, provider };
      } catch (error: any) {
        this.logger.warn(`Provider ${provider.id} failed: ${error.message}`);
        this.recordProviderFailure(provider.id, error.message);
        excludeProviders.push(provider.id);
        lastError = error;
      }
    }

    throw lastError || new Error(`All ${type} providers failed after ${maxRetries} attempts`);
  }

  /**
   * 记录 Provider 失败
   */
  private recordProviderFailure(providerId: string, errorMessage: string) {
    const health = this.providerHealth.get(providerId) || {
      providerId,
      isHealthy: true,
      lastCheck: new Date(),
      consecutiveFailures: 0,
    };

    health.consecutiveFailures++;
    health.lastError = errorMessage;
    health.lastCheck = new Date();

    if (health.consecutiveFailures >= this.MAX_CONSECUTIVE_FAILURES) {
      health.isHealthy = false;
      this.logger.warn(
        `Provider ${providerId} marked as unhealthy after ${health.consecutiveFailures} consecutive failures`
      );
    }

    this.providerHealth.set(providerId, health);
  }

  /**
   * 获取所有 Provider 的报价（用于前端显示）
   * 支持健康检查过滤
   */
  async getAllQuotes(
    amount: number,
    fromCurrency: string,
    toCurrency: string,
    type: 'onramp' | 'offramp',
    options: { includeUnhealthy?: boolean } = {},
  ): Promise<Array<{ provider: IProvider; quote: ProviderQuote; isHealthy: boolean }>> {
    const { includeUnhealthy = false } = options;
    
    const candidates = type === 'onramp' 
      ? this.getOnRampProviders(!includeUnhealthy) 
      : this.getOffRampProviders(!includeUnhealthy);

    const quotes = await Promise.all(
      candidates.map(async (provider) => {
        try {
          const quote = await provider.getQuote(amount, fromCurrency, toCurrency);
          return { 
            provider, 
            quote, 
            isHealthy: this.isProviderHealthy(provider.id),
          };
        } catch (error: any) {
          this.logger.warn(`Failed to get quote from ${provider.id}: ${error.message}`);
          this.recordProviderFailure(provider.id, error.message);
          return null;
        }
      }),
    );

    return quotes.filter((q) => q !== null) as Array<{
      provider: IProvider;
      quote: ProviderQuote;
      isHealthy: boolean;
    }>;
  }

  /**
   * 获取 Provider 状态摘要（用于监控）
   */
  getProviderStatusSummary(): {
    total: number;
    healthy: number;
    unhealthy: number;
    providers: Array<{
      id: string;
      name: string;
      isHealthy: boolean;
      lastCheck: Date | null;
      consecutiveFailures: number;
      lastError?: string;
    }>;
  } {
    const providers = Array.from(this.providers.values()).map(p => {
      const health = this.providerHealth.get(p.id);
      return {
        id: p.id,
        name: p.name,
        isHealthy: health?.isHealthy ?? true,
        lastCheck: health?.lastCheck ?? null,
        consecutiveFailures: health?.consecutiveFailures ?? 0,
        lastError: health?.lastError,
      };
    });

    const healthy = providers.filter(p => p.isHealthy).length;
    
    return {
      total: providers.length,
      healthy,
      unhealthy: providers.length - healthy,
      providers,
    };
  }
}

