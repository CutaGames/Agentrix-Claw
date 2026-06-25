import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import Stripe from 'stripe';
import { CreatePaymentIntentDto } from './dto/payment.dto';
import { Payment, PaymentStatus, PaymentMethod } from '../../entities/payment.entity';

/**
 * Stripe 支付服务 - 增强版
 * 
 * 支持功能：
 * 1. PaymentIntent 创建与确认
 * 2. 订单关联与状态同步
 * 3. 分佣信息记录（供批量结算使用）
 * 4. 商户配置支持（法币/数字货币/两者皆可）
 * 5. 退款处理
 * 6. 客户管理
 */
@Injectable()
export class StripeService {
  private stripe: Stripe | null = null;
  private readonly logger = new Logger(StripeService.name);
  private readonly isConfigured: boolean = false;
  private readonly environment: 'test' | 'live';

  constructor(
    private configService: ConfigService,
    @InjectRepository(Payment)
    private paymentRepository: Repository<Payment>,
  ) {
    const secretKey = this.configService.get<string>('STRIPE_SECRET_KEY');
    if (!secretKey) {
      this.logger.warn('STRIPE_SECRET_KEY is not configured. Stripe features will be disabled.');
      this.logger.warn('To enable Stripe, add STRIPE_SECRET_KEY to your .env file');
      this.isConfigured = false;
    } else {
      this.stripe = new Stripe(secretKey, {
        apiVersion: '2023-08-16',
      });
      this.isConfigured = true;
      // 检测环境：测试密钥以 sk_test_ 开头
      this.environment = secretKey.startsWith('sk_test_') ? 'test' : 'live';
      this.logger.log(`✅ Stripe configured in ${this.environment} mode`);
    }
  }

  /**
   * 检查 Stripe 是否已配置
   */
  isStripeConfigured(): boolean {
    return this.isConfigured;
  }

  /**
   * 获取 Stripe 环境
   */
  getEnvironment(): 'test' | 'live' {
    return this.environment;
  }

  /**
   * 创建 PaymentIntent（增强版）
   * 支持订单关联、分佣信息存储
   */
  async createPaymentIntent(dto: CreatePaymentIntentDto & {
    orderId?: string;
    merchantId?: string;
    agentId?: string;
    skillLayerType?: string; // INFRA | RESOURCE | LOGIC | COMPOSITE
    commissionRate?: number;
    customerId?: string; // Stripe Customer ID
  }) {
    if (!this.stripe) {
      throw new Error('Stripe is not configured. Please set STRIPE_SECRET_KEY in your .env file');
    }

    const amount = Math.round(dto.amount * 100); // 转换为分
    const currency = dto.currency?.toLowerCase() || 'usd';

    // 构建 metadata，存储分佣和订单信息
    const metadata: Record<string, string> = {
      userId: dto.userId || '',
      description: dto.description || '',
      paymentId: dto.paymentId || '',
      ...(dto.orderId && { orderId: dto.orderId }),
      ...(dto.merchantId && { merchantId: dto.merchantId }),
      ...(dto.agentId && { agentId: dto.agentId }),
      ...(dto.skillLayerType && { skillLayerType: dto.skillLayerType }),
      ...(dto.commissionRate !== undefined && { commissionRate: dto.commissionRate.toString() }),
      platform: 'agentrix',
      environment: this.environment,
    };

    const paymentIntentParams: Stripe.PaymentIntentCreateParams = {
      amount,
      currency,
      automatic_payment_methods: {
        enabled: true,
      },
      // 启用3D Secure
      payment_method_options: {
        card: {
          request_three_d_secure: 'automatic',
        },
      },
      metadata,
      description: dto.description || `Agentrix Payment - ${dto.orderId || dto.paymentId || 'N/A'}`,
    };

    // 如果提供了 Stripe Customer ID，关联到 PaymentIntent
    if (dto.customerId) {
      paymentIntentParams.customer = dto.customerId;
    }

    const paymentIntent = await this.stripe.paymentIntents.create(paymentIntentParams);

    this.logger.log(`PaymentIntent created: ${paymentIntent.id}, amount: ${amount}, currency: ${currency}`);

    return {
      clientSecret: paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id,
      amount: dto.amount,
      currency: currency.toUpperCase(),
      status: paymentIntent.status,
    };
  }

  /**
   * 创建带订单关联的支付
   * 同时创建 Payment 记录和 PaymentIntent
   */
  async createPaymentWithOrder(params: {
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
    payment: Payment;
    clientSecret: string;
    paymentIntentId: string;
  }> {
    // 1. 创建 Payment 记录
    const payment = this.paymentRepository.create({
      amount: params.amount,
      currency: params.currency.toUpperCase(),
      userId: params.userId,
      merchantId: params.merchantId,
      agentId: params.agentId,
      description: params.description,
      paymentMethod: PaymentMethod.STRIPE,
      status: PaymentStatus.PENDING,
      metadata: {
        ...params.metadata,
        orderId: params.orderId,
        skillLayerType: params.skillLayerType,
        commissionRate: params.commissionRate,
      },
    });

    const savedPayment = await this.paymentRepository.save(payment);

    // 2. 创建 PaymentIntent
    const intentResult = await this.createPaymentIntent({
      amount: params.amount,
      currency: params.currency,
      paymentMethod: PaymentMethod.STRIPE,
      userId: params.userId,
      paymentId: savedPayment.id,
      description: params.description,
      orderId: params.orderId,
      merchantId: params.merchantId,
      agentId: params.agentId,
      skillLayerType: params.skillLayerType,
      commissionRate: params.commissionRate,
    });

    // 3. 更新 Payment 记录，添加 PaymentIntent ID
    savedPayment.metadata = {
      ...savedPayment.metadata,
      stripePaymentIntentId: intentResult.paymentIntentId,
    };
    savedPayment.status = PaymentStatus.PROCESSING;
    await this.paymentRepository.save(savedPayment);

    return {
      payment: savedPayment,
      clientSecret: intentResult.clientSecret,
      paymentIntentId: intentResult.paymentIntentId,
    };
  }

  /**
   * 确认/获取 PaymentIntent 状态
   */
  async confirmPayment(paymentIntentId: string): Promise<Stripe.PaymentIntent> {
    if (!this.stripe) {
      throw new Error('Stripe is not configured. Please set STRIPE_SECRET_KEY in your .env file');
    }
    return await this.stripe.paymentIntents.retrieve(paymentIntentId);
  }

  /**
   * 取消 PaymentIntent
   */
  async cancelPaymentIntent(paymentIntentId: string, reason?: string): Promise<Stripe.PaymentIntent> {
    if (!this.stripe) {
      throw new Error('Stripe is not configured');
    }
    return await this.stripe.paymentIntents.cancel(paymentIntentId, {
      cancellation_reason: 'requested_by_customer',
    });
  }

  /**
   * 创建退款
   */
  async createRefund(params: {
    paymentIntentId: string;
    amount?: number; // 部分退款金额（分），不提供则全额退款
    reason?: 'duplicate' | 'fraudulent' | 'requested_by_customer';
    metadata?: Record<string, string>;
  }): Promise<Stripe.Refund> {
    if (!this.stripe) {
      throw new Error('Stripe is not configured');
    }

    const refundParams: Stripe.RefundCreateParams = {
      payment_intent: params.paymentIntentId,
      ...(params.amount && { amount: params.amount }),
      ...(params.reason && { reason: params.reason }),
      ...(params.metadata && { metadata: params.metadata }),
    };

    const refund = await this.stripe.refunds.create(refundParams);
    this.logger.log(`Refund created: ${refund.id} for PaymentIntent: ${params.paymentIntentId}`);
    return refund;
  }

  /**
   * 创建或获取 Stripe Customer
   */
  async getOrCreateCustomer(params: {
    userId: string;
    email?: string;
    name?: string;
    metadata?: Record<string, string>;
  }): Promise<Stripe.Customer> {
    if (!this.stripe) {
      throw new Error('Stripe is not configured');
    }

    // 先查找是否已有 Customer
    const existingCustomers = await this.stripe.customers.list({
      email: params.email,
      limit: 1,
    });

    if (existingCustomers.data.length > 0) {
      const customer = existingCustomers.data[0];
      // 更新 metadata
      if (params.metadata || params.name) {
        return await this.stripe.customers.update(customer.id, {
          ...(params.name && { name: params.name }),
          metadata: {
            ...customer.metadata,
            ...params.metadata,
            agentrixUserId: params.userId,
          },
        });
      }
      return customer;
    }

    // 创建新 Customer
    return await this.stripe.customers.create({
      email: params.email,
      name: params.name,
      metadata: {
        ...params.metadata,
        agentrixUserId: params.userId,
        platform: 'agentrix',
      },
    });
  }

  /**
   * 获取支付方式列表
   */
  async listPaymentMethods(customerId: string, type: Stripe.PaymentMethodListParams.Type = 'card'): Promise<Stripe.PaymentMethod[]> {
    if (!this.stripe) {
      throw new Error('Stripe is not configured');
    }
    const methods = await this.stripe.paymentMethods.list({
      customer: customerId,
      type,
    });
    return methods.data;
  }

  /**
   * 计算 Stripe 手续费
   * 标准费率: 2.9% + $0.30 (美国)
   * 国际卡: +1%
   */
  calculateStripeFee(amount: number, isInternational: boolean = false): {
    fee: number;
    feeRate: number;
    netAmount: number;
  } {
    const baseRate = 0.029; // 2.9%
    const fixedFee = 0.30; // $0.30
    const internationalRate = isInternational ? 0.01 : 0; // 国际卡额外 1%
    
    const feeRate = baseRate + internationalRate;
    const fee = amount * feeRate + fixedFee;
    const netAmount = amount - fee;

    return {
      fee: Math.round(fee * 100) / 100,
      feeRate: feeRate,
      netAmount: Math.round(netAmount * 100) / 100,
    };
  }

  /**
   * 获取 PaymentIntent 的分佣信息（从 metadata 中提取）
   */
  async getCommissionInfo(paymentIntentId: string): Promise<{
    merchantId?: string;
    agentId?: string;
    skillLayerType?: string;
    commissionRate?: number;
    orderId?: string;
  } | null> {
    if (!this.stripe) {
      throw new Error('Stripe is not configured');
    }

    const paymentIntent = await this.stripe.paymentIntents.retrieve(paymentIntentId);
    const metadata = paymentIntent.metadata;

    if (!metadata) return null;

    return {
      merchantId: metadata.merchantId,
      agentId: metadata.agentId,
      skillLayerType: metadata.skillLayerType,
      commissionRate: metadata.commissionRate ? parseFloat(metadata.commissionRate) : undefined,
      orderId: metadata.orderId,
    };
  }

  /**
   * 获取原始 Stripe 实例（高级用途）
   */
  getStripeInstance(): Stripe | null {
    return this.stripe;
  }
}
