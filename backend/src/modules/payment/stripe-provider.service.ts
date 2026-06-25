import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { IProvider, ProviderQuote, OnRampParams, OnRampResult, OffRampParams, OffRampResult } from './provider-abstract.service';
import { StripeService } from './stripe.service';
import { ExchangeRateService } from './exchange-rate.service';
import { PaymentMethod } from '../../entities/payment.entity';

/**
 * Stripe Provider Service
 * 实现 IProvider 接口，用于统一的支付路由
 * 
 * Stripe 主要用于:
 * 1. 法币直接支付（USD/EUR/GBP 等）
 * 2. 商户选择"只收法币"时的默认通道
 * 3. 不需要 KYC 的小额支付
 * 
 * 特点:
 * - 即时确认
 * - 支持 3D Secure
 * - 低手续费（2.9% + $0.30）
 * - 不支持加密货币
 */
@Injectable()
export class StripeProviderService implements IProvider {
  private readonly logger = new Logger(StripeProviderService.name);
  
  // IProvider 标识
  id = 'stripe';
  name = 'Stripe';
  supportsOnRamp = false; // Stripe 不支持法币转加密货币
  supportsOffRamp = false; // Stripe 不支持加密货币转法币
  
  // Stripe 特有属性
  supportsFiatPayment = true; // 支持法币直接支付
  
  // 支持的法币
  private readonly supportedFiatCurrencies = [
    'USD', 'EUR', 'GBP', 'CAD', 'AUD', 'JPY', 'SGD', 'HKD', 'NZD', 'CHF',
    'SEK', 'NOK', 'DKK', 'PLN', 'CZK', 'HUF', 'RON', 'BGN', 'MXN', 'BRL',
  ];

  // 费率配置
  private readonly feeConfig = {
    baseRate: 0.029, // 2.9%
    fixedFee: 0.30,  // $0.30
    internationalRate: 0.01, // 国际卡额外 1%
    currencyConversionRate: 0.01, // 货币转换额外 1%
  };

  constructor(
    private configService: ConfigService,
    private stripeService: StripeService,
    private exchangeRateService: ExchangeRateService,
  ) {
    if (!this.stripeService.isStripeConfigured()) {
      this.logger.warn('⚠️ Stripe is not configured. StripeProviderService will have limited functionality.');
    } else {
      this.logger.log(`✅ StripeProviderService initialized in ${this.stripeService.getEnvironment()} mode`);
    }
  }

  /**
   * 检查是否支持某种法币
   */
  isCurrencySupported(currency: string): boolean {
    return this.supportedFiatCurrencies.includes(currency.toUpperCase());
  }

  /**
   * 获取报价（法币支付）
   * 对于 Stripe，这主要用于计算手续费
   */
  async getQuote(
    amount: number,
    fromCurrency: string,
    toCurrency: string,
    isSourceAmount: boolean = true,
  ): Promise<ProviderQuote> {
    // Stripe 只处理法币到法币（同币种）的支付
    // 如果 toCurrency 是加密货币，返回不可用报价
    const cryptoCurrencies = ['USDC', 'USDT', 'ETH', 'BTC', 'BNB', 'SOL'];
    if (cryptoCurrencies.includes(toCurrency.toUpperCase())) {
      this.logger.warn(`Stripe does not support crypto: ${toCurrency}`);
      return {
        providerId: this.id,
        rate: 0,
        fee: 0,
        estimatedAmount: 0,
        expiresAt: new Date(),
      };
    }

    // 计算 Stripe 手续费
    const fee = this.calculateFee(amount, fromCurrency, toCurrency);
    const netAmount = amount - fee.totalFee;

    // 如果需要货币转换，获取汇率
    let rate = 1;
    let estimatedAmount = netAmount;
    
    if (fromCurrency.toUpperCase() !== toCurrency.toUpperCase()) {
      try {
        rate = await this.exchangeRateService.getExchangeRate(fromCurrency, toCurrency);
        estimatedAmount = netAmount * rate;
      } catch (error) {
        this.logger.warn(`Failed to get exchange rate: ${fromCurrency} -> ${toCurrency}`);
        rate = 1;
      }
    }

    return {
      providerId: this.id,
      rate,
      fee: fee.totalFee,
      estimatedAmount: Math.round(estimatedAmount * 100) / 100,
      expiresAt: new Date(Date.now() + 30 * 60 * 1000), // 30 分钟有效
    };
  }

  /**
   * 计算 Stripe 手续费
   */
  calculateFee(
    amount: number,
    fromCurrency: string = 'USD',
    toCurrency: string = 'USD',
    isInternational: boolean = false,
  ): {
    baseRate: number;
    baseFee: number;
    fixedFee: number;
    internationalFee: number;
    currencyConversionFee: number;
    totalFee: number;
    totalRate: number;
  } {
    const baseRate = this.feeConfig.baseRate;
    const fixedFee = this.feeConfig.fixedFee;
    
    // 国际卡费用
    const internationalRate = isInternational ? this.feeConfig.internationalRate : 0;
    
    // 货币转换费用
    const currencyConversionRate = fromCurrency.toUpperCase() !== toCurrency.toUpperCase() 
      ? this.feeConfig.currencyConversionRate 
      : 0;

    const totalRate = baseRate + internationalRate + currencyConversionRate;
    const baseFee = amount * baseRate;
    const internationalFee = amount * internationalRate;
    const currencyConversionFee = amount * currencyConversionRate;
    const totalFee = amount * totalRate + fixedFee;

    return {
      baseRate,
      baseFee: Math.round(baseFee * 100) / 100,
      fixedFee,
      internationalFee: Math.round(internationalFee * 100) / 100,
      currencyConversionFee: Math.round(currencyConversionFee * 100) / 100,
      totalFee: Math.round(totalFee * 100) / 100,
      totalRate,
    };
  }

  /**
   * 创建 Stripe 支付会话
   * 返回 clientSecret 供前端 Stripe Elements 使用
   */
  async createPaymentSession(params: {
    amount: number;
    currency: string;
    userId: string;
    orderId?: string;
    merchantId?: string;
    agentId?: string;
    description?: string;
    skillLayerType?: string;
    commissionRate?: number;
    metadata?: Record<string, any>;
  }): Promise<{
    sessionId: string;
    clientSecret: string;
    paymentIntentId: string;
    amount: number;
    currency: string;
    fee: ReturnType<typeof this.calculateFee>;
  }> {
    if (!this.stripeService.isStripeConfigured()) {
      throw new Error('Stripe is not configured');
    }

    // 计算费用
    const fee = this.calculateFee(params.amount, params.currency, params.currency);

    // 创建 PaymentIntent
    const result = await this.stripeService.createPaymentWithOrder({
      amount: params.amount,
      currency: params.currency,
      userId: params.userId,
      orderId: params.orderId,
      merchantId: params.merchantId,
      agentId: params.agentId,
      description: params.description,
      skillLayerType: params.skillLayerType,
      commissionRate: params.commissionRate,
      metadata: {
        ...params.metadata,
        provider: 'stripe',
        feeCalculated: fee.totalFee,
      },
    });

    return {
      sessionId: result.payment.id, // 使用 Payment ID 作为 session ID
      clientSecret: result.clientSecret,
      paymentIntentId: result.paymentIntentId,
      amount: params.amount,
      currency: params.currency.toUpperCase(),
      fee,
    };
  }

  /**
   * 获取 Stripe 支付状态
   */
  async getPaymentStatus(paymentIntentId: string): Promise<{
    status: 'pending' | 'processing' | 'succeeded' | 'failed' | 'canceled';
    amount?: number;
    currency?: string;
    metadata?: Record<string, any>;
  }> {
    if (!this.stripeService.isStripeConfigured()) {
      throw new Error('Stripe is not configured');
    }

    const paymentIntent = await this.stripeService.confirmPayment(paymentIntentId);
    
    // 映射 Stripe 状态到统一状态
    const statusMap: Record<string, 'pending' | 'processing' | 'succeeded' | 'failed' | 'canceled'> = {
      'requires_payment_method': 'pending',
      'requires_confirmation': 'pending',
      'requires_action': 'processing',
      'processing': 'processing',
      'requires_capture': 'processing',
      'succeeded': 'succeeded',
      'canceled': 'canceled',
    };

    return {
      status: statusMap[paymentIntent.status] || 'failed',
      amount: paymentIntent.amount / 100,
      currency: paymentIntent.currency.toUpperCase(),
      metadata: paymentIntent.metadata as Record<string, any>,
    };
  }

  /**
   * 取消支付
   */
  async cancelPayment(paymentIntentId: string): Promise<boolean> {
    if (!this.stripeService.isStripeConfigured()) {
      throw new Error('Stripe is not configured');
    }

    try {
      await this.stripeService.cancelPaymentIntent(paymentIntentId);
      return true;
    } catch (error) {
      this.logger.error(`Failed to cancel payment ${paymentIntentId}:`, error);
      return false;
    }
  }

  /**
   * 创建退款
   */
  async createRefund(params: {
    paymentIntentId: string;
    amount?: number;
    reason?: 'duplicate' | 'fraudulent' | 'requested_by_customer';
  }): Promise<{
    refundId: string;
    amount: number;
    status: string;
  }> {
    if (!this.stripeService.isStripeConfigured()) {
      throw new Error('Stripe is not configured');
    }

    const refund = await this.stripeService.createRefund({
      paymentIntentId: params.paymentIntentId,
      amount: params.amount ? Math.round(params.amount * 100) : undefined,
      reason: params.reason,
    });

    return {
      refundId: refund.id,
      amount: refund.amount / 100,
      status: refund.status || 'pending',
    };
  }

  /**
   * IProvider: On-ramp（不支持）
   */
  async executeOnRamp(params: OnRampParams): Promise<OnRampResult> {
    throw new Error('Stripe does not support On-ramp (fiat to crypto). Use Transak instead.');
  }

  /**
   * IProvider: Off-ramp（不支持）
   */
  async executeOffRamp(params: OffRampParams): Promise<OffRampResult> {
    throw new Error('Stripe does not support Off-ramp (crypto to fiat). Use Transak instead.');
  }

  /**
   * 比较 Stripe 与其他通道的费用
   */
  async compareWithOtherChannels(
    amount: number,
    currency: string,
    targetCrypto?: string,
  ): Promise<{
    stripe: { fee: number; netAmount: number; available: boolean };
    recommendation: 'stripe' | 'transak' | 'wallet';
    reason: string;
  }> {
    const stripeFee = this.calculateFee(amount, currency, currency);
    const stripeAvailable = this.isCurrencySupported(currency);

    // 如果目标是加密货币，Stripe 不适用
    if (targetCrypto && ['USDC', 'USDT', 'ETH', 'BTC'].includes(targetCrypto.toUpperCase())) {
      return {
        stripe: {
          fee: stripeFee.totalFee,
          netAmount: amount - stripeFee.totalFee,
          available: false,
        },
        recommendation: 'transak',
        reason: 'Stripe does not support crypto payments. Use Transak for fiat-to-crypto.',
      };
    }

    // 法币支付场景
    if (stripeAvailable) {
      // 小额支付（<$50），固定费用占比较高，可能考虑其他方案
      if (amount < 50) {
        return {
          stripe: {
            fee: stripeFee.totalFee,
            netAmount: amount - stripeFee.totalFee,
            available: true,
          },
          recommendation: 'wallet',
          reason: 'For small amounts, crypto wallet payment may have lower fees.',
        };
      }

      return {
        stripe: {
          fee: stripeFee.totalFee,
          netAmount: amount - stripeFee.totalFee,
          available: true,
        },
        recommendation: 'stripe',
        reason: 'Stripe offers instant payment with good fraud protection for fiat payments.',
      };
    }

    return {
      stripe: {
        fee: stripeFee.totalFee,
        netAmount: amount - stripeFee.totalFee,
        available: false,
      },
      recommendation: 'transak',
      reason: `Currency ${currency} is not supported by Stripe. Use Transak instead.`,
    };
  }
}
