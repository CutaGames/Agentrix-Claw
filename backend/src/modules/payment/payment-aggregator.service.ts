import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * 支付聚合服务商接口
 * 用于在前期不申请Stripe账户时，通过第三方聚合服务商提供法币支付能力
 */
export interface PaymentAggregator {
  id: string;
  name: string;
  supportedCurrencies: string[];
  feeRate: number; // 手续费率
  minAmount: number;
  maxAmount: number;
  speed: number; // 1-10, 10最快
  kycRequired: boolean;
  available: boolean;
  supportsApplePay: boolean;
  supportsGooglePay: boolean;
  supportsCards: boolean;
}

export interface AggregatorPaymentRequest {
  amount: number;
  currency: string;
  paymentMethod: 'card' | 'apple_pay' | 'google_pay';
  paymentData: any;
  metadata?: any;
}

export interface AggregatorPaymentResult {
  transactionId: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  amount: number;
  currency: string;
  fee: number;
  estimatedCompletionTime?: number;
}

@Injectable()
export class PaymentAggregatorService {
  private readonly logger = new Logger(PaymentAggregatorService.name);
  private aggregators: Map<string, PaymentAggregator> = new Map();

  constructor(private configService: ConfigService) {
    this.initializeAggregators();
  }

  private initializeAggregators() {
    // Paddle（推荐，易于集成，支持白标）
    this.aggregators.set('paddle', {
      id: 'paddle',
      name: 'Paddle',
      supportedCurrencies: ['USD', 'EUR', 'GBP', 'CNY', 'JPY'],
      feeRate: 0.035, // 3.5%（包含Stripe通道费用）
      minAmount: 1,
      maxAmount: 100000,
      speed: 9,
      kycRequired: false,
      available: true,
      supportsApplePay: true,
      supportsGooglePay: true,
      supportsCards: true,
    });

    // Adyen（全球支付平台）
    this.aggregators.set('adyen', {
      id: 'adyen',
      name: 'Adyen',
      supportedCurrencies: ['USD', 'EUR', 'GBP', 'CNY', 'JPY', 'KRW', 'SGD'],
      feeRate: 0.032, // 3.2%
      minAmount: 1,
      maxAmount: 200000,
      speed: 9,
      kycRequired: false,
      available: true,
      supportsApplePay: true,
      supportsGooglePay: true,
      supportsCards: true,
    });

    // Checkout.com
    this.aggregators.set('checkout', {
      id: 'checkout',
      name: 'Checkout.com',
      supportedCurrencies: ['USD', 'EUR', 'GBP', 'CNY'],
      feeRate: 0.034, // 3.4%
      minAmount: 1,
      maxAmount: 100000,
      speed: 8,
      kycRequired: false,
      available: true,
      supportsApplePay: true,
      supportsGooglePay: true,
      supportsCards: true,
    });
  }

  /**
   * 获取所有可用的支付聚合服务商
   */
  getAvailableAggregators(): PaymentAggregator[] {
    return Array.from(this.aggregators.values()).filter((a) => a.available);
  }

  /**
   * 选择最优的支付聚合服务商
   */
  selectBestAggregator(
    amount: number,
    currency: string,
    paymentMethod: 'card' | 'apple_pay' | 'google_pay',
  ): PaymentAggregator | null {
    const available = this.getAvailableAggregators().filter((agg) => {
      if (!agg.supportedCurrencies.includes(currency)) return false;
      if (amount < agg.minAmount || amount > agg.maxAmount) return false;
      if (paymentMethod === 'apple_pay' && !agg.supportsApplePay) return false;
      if (paymentMethod === 'google_pay' && !agg.supportsGooglePay) return false;
      if (paymentMethod === 'card' && !agg.supportsCards) return false;
      return true;
    });

    if (available.length === 0) {
      return null;
    }

    // 选择费率最低的
    return available.reduce((best, current) =>
      current.feeRate < best.feeRate ? current : best,
    );
  }

  /**
   * 处理支付（通过聚合服务商）
   */
  async processPayment(
    aggregatorId: string,
    request: AggregatorPaymentRequest,
  ): Promise<AggregatorPaymentResult> {
    const aggregator = this.aggregators.get(aggregatorId);
    if (!aggregator || !aggregator.available) {
      throw new BadRequestException(`支付聚合服务商不可用: ${aggregatorId}`);
    }

    // 验证金额范围
    if (request.amount < aggregator.minAmount || request.amount > aggregator.maxAmount) {
      throw new BadRequestException(
        `金额超出范围: ${aggregator.minAmount} - ${aggregator.maxAmount}`,
      );
    }

    // 验证货币支持
    if (!aggregator.supportedCurrencies.includes(request.currency)) {
      throw new BadRequestException(
        `不支持的货币: ${request.currency}`,
      );
    }

    try {
      // 根据聚合服务商类型处理
      switch (aggregatorId) {
        case 'paddle':
          return await this.processWithPaddle(request);
        case 'adyen':
          return await this.processWithAdyen(request);
        case 'checkout':
          return await this.processWithCheckout(request);
        default:
          throw new BadRequestException(`不支持的聚合服务商: ${aggregatorId}`);
      }
    } catch (error) {
      this.logger.error(`支付聚合服务商处理失败: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * 通过Paddle处理支付
   */
  private async processWithPaddle(
    request: AggregatorPaymentRequest,
  ): Promise<AggregatorPaymentResult> {
    // TODO: 实际应该调用Paddle API
    // const paddleApiKey = this.configService.get<string>('PADDLE_API_KEY');
    // const response = await paddleClient.transactions.create({...});
    
    this.logger.log(
      `通过Paddle处理支付: ${request.amount} ${request.currency}, method=${request.paymentMethod}`,
    );

    // 模拟处理
    const fee = request.amount * 0.035;
    const transactionId = `paddle_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    return {
      transactionId,
      status: 'processing',
      amount: request.amount,
      currency: request.currency,
      fee,
      estimatedCompletionTime: 5, // 5秒
    };
  }

  /**
   * 通过Adyen处理支付
   */
  private async processWithAdyen(
    request: AggregatorPaymentRequest,
  ): Promise<AggregatorPaymentResult> {
    // TODO: 实际应该调用Adyen API
    this.logger.log(
      `通过Adyen处理支付: ${request.amount} ${request.currency}, method=${request.paymentMethod}`,
    );

    const fee = request.amount * 0.032;
    const transactionId = `adyen_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    return {
      transactionId,
      status: 'processing',
      amount: request.amount,
      currency: request.currency,
      fee,
      estimatedCompletionTime: 5,
    };
  }

  /**
   * 通过Checkout.com处理支付
   */
  private async processWithCheckout(
    request: AggregatorPaymentRequest,
  ): Promise<AggregatorPaymentResult> {
    // TODO: 实际应该调用Checkout.com API
    this.logger.log(
      `通过Checkout.com处理支付: ${request.amount} ${request.currency}, method=${request.paymentMethod}`,
    );

    const fee = request.amount * 0.034;
    const transactionId = `checkout_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    return {
      transactionId,
      status: 'processing',
      amount: request.amount,
      currency: request.currency,
      fee,
      estimatedCompletionTime: 5,
    };
  }

  /**
   * 计算聚合服务商的价格（用于价格对比）
   */
  calculatePrice(amount: number, aggregator: PaymentAggregator): number {
    return amount * (1 + aggregator.feeRate);
  }
}

