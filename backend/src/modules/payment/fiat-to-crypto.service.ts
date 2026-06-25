import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ExchangeRateService } from './exchange-rate.service';
import { ProviderIntegrationService } from './provider-integration.service';
import { ProviderManagerService } from './provider-manager.service';

export interface CryptoProvider {
  id: string;
  name: string;
  supportedCurrencies: string[];
  supportedCryptoCurrencies: string[];
  feeRate: number; // 手续费率
  minAmount: number;
  maxAmount: number;
  speed: number; // 1-10, 10最快
  kycRequired: boolean;
  available: boolean;
}

export interface ExchangeQuote {
  provider: CryptoProvider;
  fromAmount: number;
  fromCurrency: string;
  toAmount: number;
  toCurrency: string;
  exchangeRate: number;
  fee: number;
  totalCost: number; // 总成本（含手续费）
  lockExpiresAt: Date; // 汇率锁定过期时间
  estimatedTime: number; // 预计完成时间（秒）
}

@Injectable()
export class FiatToCryptoService {
  private readonly logger = new Logger(FiatToCryptoService.name);
  private providers: Map<string, CryptoProvider> = new Map();
  private quoteLocks: Map<string, { quote: ExchangeQuote; expiresAt: Date }> = new Map();

  constructor(
    private configService: ConfigService,
    private exchangeRateService?: ExchangeRateService,
    private providerIntegration?: ProviderIntegrationService,
    private providerManagerService?: ProviderManagerService,
  ) {
    this.initializeProviders();
  }

  private initializeProviders() {
    // OKPay
    this.providers.set('okpay', {
      id: 'okpay',
      name: 'OKPay',
      supportedCurrencies: ['USD', 'EUR', 'GBP', 'CNY'],
      supportedCryptoCurrencies: ['USDC', 'USDT', 'BTC', 'ETH'],
      feeRate: 0.015, // 1.5%
      minAmount: 10,
      maxAmount: 100000,
      speed: 8,
      kycRequired: true,
      available: true,
    });

    // MoonPay
    this.providers.set('moonpay', {
      id: 'moonpay',
      name: 'MoonPay',
      supportedCurrencies: ['USD', 'EUR', 'GBP', 'JPY', 'CNY'],
      supportedCryptoCurrencies: ['USDC', 'USDT', 'BTC', 'ETH'],
      feeRate: 0.025, // 2.5%
      minAmount: 20,
      maxAmount: 50000,
      speed: 9,
      kycRequired: true,
      available: true,
    });

    // Binance Pay
    this.providers.set('binance', {
      id: 'binance',
      name: 'Binance Pay',
      supportedCurrencies: ['USD', 'EUR', 'GBP', 'CNY'],
      supportedCryptoCurrencies: ['USDC', 'USDT', 'BUSD', 'BTC', 'ETH'],
      feeRate: 0.01, // 1%
      minAmount: 5,
      maxAmount: 200000,
      speed: 9,
      kycRequired: true,
      available: true,
    });

    // Alchemy Pay
    this.providers.set('alchemy', {
      id: 'alchemy',
      name: 'Alchemy Pay',
      supportedCurrencies: ['USD', 'EUR', 'GBP', 'JPY', 'CNY', 'KRW'],
      supportedCryptoCurrencies: ['USDC', 'USDT', 'BTC', 'ETH'],
      feeRate: 0.02, // 2%
      minAmount: 10,
      maxAmount: 100000,
      speed: 7,
      kycRequired: true,
      available: true,
    });
  }

  /**
   * 获取所有可用的Provider报价（用于前端实时对比）
   */
  async getProviderQuotes(
    fromAmount: number,
    fromCurrency: string,
    toCurrency: string,
    userCountry?: string,
  ): Promise<ExchangeQuote[]> {
    const quotes: ExchangeQuote[] = [];

    for (const provider of this.providers.values()) {
      if (!provider.available) continue;
      if (!provider.supportedCurrencies.includes(fromCurrency)) continue;
      if (!provider.supportedCryptoCurrencies.includes(toCurrency)) continue;
      if (fromAmount < provider.minAmount || fromAmount > provider.maxAmount) continue;

      try {
        const quote = await this.getQuote(provider, fromAmount, fromCurrency, toCurrency);
        quotes.push(quote);
      } catch (error) {
        this.logger.warn(`获取${provider.name}报价失败: ${error.message}`);
      }
    }

    // 按总成本排序（最优在前）
    quotes.sort((a, b) => a.totalCost - b.totalCost);

    return quotes;
  }

  /**
   * 获取单个Provider的报价
   */
  private async getQuote(
    provider: CryptoProvider,
    fromAmount: number,
    fromCurrency: string,
    toCurrency: string,
  ): Promise<ExchangeQuote> {
    // 模拟获取实时汇率（实际应该调用Provider API）
    const exchangeRate = await this.getExchangeRate(fromCurrency, toCurrency);
    const fee = fromAmount * provider.feeRate;
    const toAmount = (fromAmount - fee) * exchangeRate;
    const totalCost = fromAmount; // 用户需要支付的总金额

    // 汇率锁定5分钟
    const lockExpiresAt = new Date(Date.now() + 5 * 60 * 1000);

    return {
      provider,
      fromAmount,
      fromCurrency,
      toAmount,
      toCurrency,
      exchangeRate,
      fee,
      totalCost,
      lockExpiresAt,
      estimatedTime: 60 / provider.speed * 10, // 基于速度计算
    };
  }

  /**
   * 锁定汇率（创建订单）
   */
  async lockQuote(quoteId: string, quote: ExchangeQuote): Promise<string> {
    const lockId = `lock_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    this.quoteLocks.set(lockId, {
      quote,
      expiresAt: quote.lockExpiresAt,
    });

    // 清理过期锁定
    this.cleanupExpiredLocks();

    return lockId;
  }

  /**
   * 验证锁定是否有效
   */
  async validateLock(lockId: string): Promise<ExchangeQuote | null> {
    const lock = this.quoteLocks.get(lockId);
    if (!lock) return null;

    if (new Date() > lock.expiresAt) {
      this.quoteLocks.delete(lockId);
      return null;
    }

    return lock.quote;
  }

  /**
   * 执行法币转数字货币
   */
  async executeExchange(
    lockId: string,
    paymentMethod: string, // 'stripe', 'google_pay', 'apple_pay', 'visa', 'mastercard', etc.
    paymentData: any,
  ): Promise<{ transactionId: string; cryptoAmount: number; cryptoCurrency: string }> {
    const quote = await this.validateLock(lockId);
    if (!quote) {
      throw new BadRequestException('汇率锁定已过期，请重新获取报价');
    }

    const provider = quote.provider;

    // 根据支付方式处理
    try {
      let transactionId: string;

      switch (paymentMethod) {
        case 'stripe':
          // Stripe支付处理
          transactionId = await this.executeWithStripe(provider, quote, paymentData);
          break;
        case 'google_pay':
          // Google Pay处理
          transactionId = await this.executeWithGooglePay(provider, quote, paymentData);
          break;
        case 'apple_pay':
          // Apple Pay处理
          transactionId = await this.executeWithApplePay(provider, quote, paymentData);
          break;
        case 'visa':
        case 'mastercard':
          // 信用卡处理（通过Stripe或Provider）
          transactionId = await this.executeWithCard(provider, quote, paymentMethod, paymentData);
          break;
        default:
          throw new BadRequestException(`不支持的支付方式: ${paymentMethod}`);
      }

      this.logger.log(
        `执行法币转数字货币成功: ${quote.fromAmount} ${quote.fromCurrency} -> ${quote.toAmount} ${quote.toCurrency}, transactionId: ${transactionId}`,
      );

      // 删除已使用的锁定
      this.quoteLocks.delete(lockId);

      return {
        transactionId,
        cryptoAmount: quote.toAmount,
        cryptoCurrency: quote.toCurrency,
      };
    } catch (error) {
      this.logger.error(`执行法币转数字货币失败: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * 通过Stripe执行
   */
  private async executeWithStripe(
    provider: CryptoProvider,
    quote: ExchangeQuote,
    paymentData: any,
  ): Promise<string> {
    // 实际应该调用Stripe API
    // 这里模拟
    this.logger.log(`通过Stripe执行: provider=${provider.name}, amount=${quote.fromAmount}`);
    return `stripe_tx_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * 通过Google Pay执行
   */
  private async executeWithGooglePay(
    provider: CryptoProvider,
    quote: ExchangeQuote,
    paymentData: any,
  ): Promise<string> {
    // 实际应该调用Google Pay API
    this.logger.log(`通过Google Pay执行: provider=${provider.name}, amount=${quote.fromAmount}`);
    return `gpay_tx_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * 通过Apple Pay执行
   */
  private async executeWithApplePay(
    provider: CryptoProvider,
    quote: ExchangeQuote,
    paymentData: any,
  ): Promise<string> {
    // 实际应该调用Apple Pay API
    this.logger.log(`通过Apple Pay执行: provider=${provider.name}, amount=${quote.fromAmount}`);
    return `apay_tx_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * 通过信用卡执行
   */
  private async executeWithCard(
    provider: CryptoProvider,
    quote: ExchangeQuote,
    cardType: string,
    paymentData: any,
  ): Promise<string> {
    // 实际应该调用Provider的信用卡API
    this.logger.log(`通过${cardType}执行: provider=${provider.name}, amount=${quote.fromAmount}`);
    return `${cardType}_tx_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * 获取实时汇率（公开方法）
   */
  async getExchangeRate(fromCurrency: string, toCurrency: string): Promise<number> {
    // 如果ExchangeRateService可用，使用实时汇率
    if (this.exchangeRateService) {
      try {
        return await this.exchangeRateService.getExchangeRate(fromCurrency, toCurrency);
      } catch (error) {
        this.logger.warn(`获取实时汇率失败，使用模拟汇率: ${error.message}`);
      }
    }

    // 否则使用模拟汇率
    const rates: Record<string, number> = {
      'USD_USDC': 1.0,
      'USD_USDT': 1.0,
      'EUR_USDC': 1.08,
      'GBP_USDC': 1.27,
      'CNY_USDC': 0.142,
      'USDC_USD': 1.0,
      'USDT_USD': 1.0,
      'USDC_EUR': 0.926,
      'USDC_GBP': 0.787,
      'USDC_CNY': 7.04,
    };

    const key = `${fromCurrency}_${toCurrency}`;
    return rates[key] || 1.0;
  }

  /**
   * 数字货币转法币（用于商家提现）
   * 
   * 优先使用 ProviderManagerService 获取真实的 Provider（如 Transak）
   * 如果不可用，则回退到旧的 ProviderIntegrationService 或模拟响应
   */
  async convertCryptoToFiat(
    amount: number,
    fromCurrency: string, // 数字货币（如 USDC）
    toCurrency: string, // 法币（如 CNY）
    bankAccount: string,
    fromWalletAddress?: string, // 可选的 MPC 钱包地址
    metadata?: any, // 可选的元数据（如 email, countryCode）
  ): Promise<{
    providerId: string;
    transactionId: string;
    transactionHash: string;
  }> {
    // 优先使用 ProviderManagerService 获取真实的 Provider（如 Transak）
    if (this.providerManagerService) {
      try {
        const offRampProviders = this.providerManagerService.getOffRampProviders();
        
        if (offRampProviders.length > 0) {
          // 选择最优 Provider（优先选择 Transak）
          let bestProvider = offRampProviders.find(p => p.id === 'transak');
          if (!bestProvider) {
            bestProvider = offRampProviders[0];
          }

          this.logger.log(
            `使用 ${bestProvider.name} 执行 Off-ramp: ${amount} ${fromCurrency} -> ${toCurrency}`,
          );

          // 调用 Provider 的 executeOffRamp 方法
          if (bestProvider.executeOffRamp) {
            const result = await bestProvider.executeOffRamp({
              amount,
              fromCurrency,
              toCurrency,
              merchantId: metadata?.merchantId || 'unknown', // 从 metadata 获取或使用默认值
              bankAccount,
              metadata: {
                fromWalletAddress,
                ...metadata,
              },
            });

            return {
              providerId: bestProvider.id,
              transactionId: result.transactionId,
              transactionHash: result.transactionHash || result.transactionId,
            };
          }
        }
      } catch (error) {
        this.logger.error(
          `ProviderManagerService Off-ramp 调用失败: ${error.message}`,
          error.stack,
        );
        // 继续尝试其他方式
      }
    }

    // 回退到旧的 ProviderIntegrationService
    const bestProvider = this.selectBestProviderForCryptoToFiat(
      fromCurrency,
      toCurrency,
      amount,
    );

    if (!bestProvider) {
      throw new BadRequestException('没有可用的Provider');
    }

    // 如果ProviderIntegrationService可用，调用真实API
    if (this.providerIntegration) {
      try {
        switch (bestProvider.id) {
          case 'moonpay':
            return {
              providerId: bestProvider.id,
              ...(await this.providerIntegration.moonPayConvert(
                amount,
                fromCurrency,
                toCurrency,
                bankAccount,
              )),
            };
          case 'alchemy':
            return {
              providerId: bestProvider.id,
              ...(await this.providerIntegration.alchemyPayConvert(
                amount,
                fromCurrency,
                toCurrency,
                bankAccount,
              )),
            };
          case 'binance':
            return {
              providerId: bestProvider.id,
              ...(await this.providerIntegration.binanceConvert(
                amount,
                fromCurrency,
                toCurrency,
                bankAccount,
              )),
            };
        }
      } catch (error) {
        this.logger.error(`Provider API调用失败: ${error.message}`, error);
        // 如果真实API失败，继续使用模拟响应
      }
    }

    // 否则使用模拟响应
    this.logger.log(
      `通过${bestProvider.name}转换（模拟）: ${amount} ${fromCurrency} -> ${toCurrency}, 银行账户: ${bankAccount}`,
    );

    return {
      providerId: bestProvider.id,
      transactionId: `${bestProvider.id}_tx_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      transactionHash: `0x${Math.random().toString(16).substr(2, 64)}`,
    };
  }

  /**
   * 选择最优Provider（数字货币转法币）
   */
  private selectBestProviderForCryptoToFiat(
    fromCurrency: string,
    toCurrency: string,
    amount: number,
  ): CryptoProvider | null {
    let bestProvider: CryptoProvider | null = null;
    let bestScore = 0;

    for (const provider of this.providers.values()) {
      if (!provider.available) continue;
      if (!provider.supportedCryptoCurrencies.includes(fromCurrency)) continue;
      if (!provider.supportedCurrencies.includes(toCurrency)) continue;
      if (amount < provider.minAmount || amount > provider.maxAmount) continue;

      // 评分：速度 * 10 - 手续费率 * 100
      const score = provider.speed * 10 - provider.feeRate * 100;
      if (score > bestScore) {
        bestScore = score;
        bestProvider = provider;
      }
    }

    return bestProvider;
  }

  /**
   * 清理过期锁定
   */
  private cleanupExpiredLocks() {
    const now = new Date();
    for (const [lockId, lock] of this.quoteLocks.entries()) {
      if (now > lock.expiresAt) {
        this.quoteLocks.delete(lockId);
      }
    }
  }

  /**
   * 获取所有Provider
   */
  getProviders(): CryptoProvider[] {
    return Array.from(this.providers.values()).filter((p) => p.available);
  }
}


