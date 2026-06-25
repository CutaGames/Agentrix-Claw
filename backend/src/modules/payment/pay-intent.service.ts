import { Injectable, Logger, NotFoundException, BadRequestException, Inject, forwardRef } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, MoreThan } from 'typeorm';
import * as QRCode from 'qrcode';
import { PayIntent, PayIntentStatus, PayIntentType } from '../../entities/pay-intent.entity';
import { PaymentService } from './payment.service';
import { QuickPayGrantService } from './quick-pay-grant.service';
import { WebhookService } from '../webhook/webhook.service';

export interface CreatePayIntentDto {
  type: PayIntentType;
  amount: number;
  currency: string;
  description?: string;
  orderId?: string;
  merchantId?: string;
  agentId?: string;
  paymentMethod?: {
    type: string;
    details?: any;
  };
  metadata?: {
    returnUrl?: string;
    cancelUrl?: string;
    successUrl?: string;
    paymentMethod?: string;
    [key: string]: any;
  };
  expiresIn?: number; // 过期时间（秒），默认1小时
  mode?: 'sandbox' | 'production';
}

@Injectable()
export class PayIntentService {
  private readonly logger = new Logger(PayIntentService.name);

  constructor(
    @InjectRepository(PayIntent)
    private payIntentRepository: Repository<PayIntent>,
    @Inject(forwardRef(() => PaymentService))
    private paymentService: PaymentService,
    private quickPayGrantService: QuickPayGrantService,
    private webhookService: WebhookService,
    private configService: ConfigService,
  ) {}

  /**
   * 触发Webhook事件
   */
  private async triggerWebhook(payIntent: PayIntent, eventType: string) {
    try {
      // 如果有商户ID，通知商户
      if (payIntent.merchantId) {
        await this.webhookService.sendWebhookEvent(
          payIntent.merchantId,
          eventType,
          {
            id: payIntent.id,
            status: payIntent.status,
            amount: payIntent.amount,
            currency: payIntent.currency,
            orderId: payIntent.orderId,
            metadata: payIntent.metadata,
            attribution: payIntent.attribution,
          },
        );
      }
    } catch (error) {
      this.logger.error(`触发Webhook失败: ${error.message}`);
    }
  }

  /**
   * 创建PayIntent（V3.0：统一支付意图规范）
   */
  async createPayIntent(creatorId: string, dto: CreatePayIntentDto): Promise<PayIntent> {
    // 计算过期时间
    const expiresAt = new Date();
    expiresAt.setSeconds(expiresAt.getSeconds() + (dto.expiresIn || 3600)); // 默认1小时

    // userId 始终设为 creatorId（数据库列有 NOT NULL 约束）
    // 如果创建者是商户/代理，后续支付时可通过 authorize 更新实际付款人
    const payIntent = this.payIntentRepository.create({
      userId: creatorId,
      type: dto.type,
      amount: dto.amount,
      currency: dto.currency,
      description: dto.description,
      orderId: dto.orderId,
      merchantId: dto.merchantId,
      agentId: dto.agentId,
      paymentMethod: dto.paymentMethod,
      status: PayIntentStatus.CREATED, // Use CREATED as it exists in DB enum
      mode: dto.mode || 'production',
      authorization: {
        authorized: false,
      },
      metadata: dto.metadata,
      expiresAt,
    });

    const savedPayIntent = await this.payIntentRepository.save(payIntent);

    // 生成支付链接和二维码
    // 优先使用 ConfigService 获取 FRONTEND_URL，确保在生产环境下正确
    const frontendUrl = this.configService.get<string>('FRONTEND_URL') || process.env.FRONTEND_URL || 'http://localhost:3000';
    const payUrl = `${frontendUrl}/pay/intent/${savedPayIntent.id}`;
    
    if (frontendUrl.includes('localhost') && process.env.NODE_ENV === 'production') {
      this.logger.warn(`⚠️ 生产环境下 FRONTEND_URL 仍为 localhost: ${frontendUrl}`);
    }

    savedPayIntent.metadata = {
      ...(savedPayIntent.metadata || {}),
      returnUrl: dto.metadata?.returnUrl,
      cancelUrl: dto.metadata?.cancelUrl,
      successUrl: dto.metadata?.successUrl,
      payUrl,
      qrCode: await this.generateQRCode(payUrl),
    };

    await this.payIntentRepository.save(savedPayIntent);

    this.logger.log(`创建PayIntent: id=${savedPayIntent.id}, creatorId=${creatorId}, amount=${dto.amount}`);

    // 触发Webhook
    await this.triggerWebhook(savedPayIntent, 'payment_intent.created');

    return savedPayIntent;
  }

  /**
   * 授权PayIntent
   */
  async authorizePayIntent(
    payIntentId: string,
    userId?: string,
    authorizationType: 'user' | 'agent' | 'quickpay' = 'user',
    quickPayGrantId?: string,
  ): Promise<PayIntent> {
    // V3.0: 授权时不强制校验创建者，允许支付者授权
    const payIntent = await this.payIntentRepository.findOne({
      where: { id: payIntentId },
    });

    if (!payIntent) {
      throw new NotFoundException('PayIntent不存在');
    }

    // 如果 intent 已绑定了 userId，且不是当前用户，则不允许授权
    if (payIntent.userId && userId && payIntent.userId !== userId) {
      throw new BadRequestException('该支付意图已被其他用户绑定');
    }

    // 绑定当前用户为支付者
    if (!payIntent.userId && userId) {
      payIntent.userId = userId;
    }

    if (payIntent.status !== PayIntentStatus.CREATED) {
      throw new BadRequestException('PayIntent状态不允许授权');
    }

    if (payIntent.expiresAt && payIntent.expiresAt < new Date()) {
      payIntent.status = PayIntentStatus.EXPIRED;
      await this.payIntentRepository.save(payIntent);
      throw new BadRequestException('PayIntent已过期');
    }

    // 如果是QuickPay授权，验证授权
    if (authorizationType === 'quickpay' && quickPayGrantId && userId) {
      const grant = await this.quickPayGrantService.getGrant(quickPayGrantId, userId);
      if (!grant) {
        throw new BadRequestException('QuickPay授权无效');
      }

      // 验证授权限制
      const validation = await this.quickPayGrantService.validateGrant(
        grant,
        payIntent.amount,
        payIntent.merchantId,
      );

      if (!validation.valid) {
        throw new BadRequestException(validation.reason || '授权验证失败');
      }

      payIntent.authorization.quickPayGrantId = quickPayGrantId;
    }

    payIntent.status = PayIntentStatus.AUTHORIZED;
    payIntent.authorization = {
      authorized: true,
      authorizedAt: new Date(),
      authorizedBy: userId || 'guest',
      authorizationType,
      quickPayGrantId: payIntent.authorization.quickPayGrantId,
    };

    return this.payIntentRepository.save(payIntent);
  }

  /**
   * 执行PayIntent（创建实际支付）
   */
  async executePayIntent(payIntentId: string, userId?: string, metadata?: any): Promise<PayIntent> {
    // V3.0: 执行时校验当前用户是否为绑定的支付者
    const payIntent = await this.payIntentRepository.findOne({
      where: { id: payIntentId },
    });

    if (!payIntent) {
      throw new NotFoundException('PayIntent不存在');
    }

    if (payIntent.userId && userId && payIntent.userId !== userId) {
      throw new BadRequestException('无权执行此支付意图');
    }

    if (payIntent.status !== PayIntentStatus.AUTHORIZED) {
      throw new BadRequestException('PayIntent必须先授权才能执行');
    }

    payIntent.status = PayIntentStatus.EXECUTING;

    try {
      let paymentId = '';
      let transactionHash = metadata?.txHash || '';

      if (payIntent.mode === 'sandbox') {
        // 沙盒模式：模拟支付
        this.logger.log(`沙盒模式支付模拟: id=${payIntentId}, amount=${payIntent.amount}`);
        
        // 模拟网络延迟
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        paymentId = `sim_${Math.random().toString(36).substring(2, 15)}`;
        transactionHash = transactionHash || `0x${Math.random().toString(16).substring(2, 66)}`;
        
        // 如果金额是 66.66，模拟失败（用于测试）
        if (payIntent.amount === 66.66) {
          throw new Error('Sandbox simulated failure (Amount 66.66)');
        }

        // V3.0: 即使是沙盒模式也创建一个 Payment 记录，以便出现在交易历史中
        const payment = await this.paymentService.processPayment(userId, {
          amount: payIntent.amount,
          currency: payIntent.currency,
          paymentMethod: (payIntent.paymentMethod?.type || 'wallet') as any,
          description: `[Sandbox] ${payIntent.description || `PayIntent: ${payIntentId}`}`,
          merchantId: payIntent.merchantId,
          agentId: payIntent.agentId,
          metadata: {
            payIntentId: payIntent.id,
            orderId: payIntent.orderId,
            txHash: transactionHash,
            isSandbox: true,
            ...payIntent.metadata,
            ...metadata,
          },
        });
        
        // 更新支付状态为完成（模拟完成）
        await this.paymentService.updatePaymentStatus(payment.id, 'completed' as any);
        paymentId = payment.id;
      } else {
        // 生产模式：创建实际支付
        const payment = await this.paymentService.processPayment(userId, {
          amount: payIntent.amount,
          currency: payIntent.currency,
          paymentMethod: payIntent.paymentMethod?.type as any,
          description: payIntent.description || `PayIntent: ${payIntentId}`,
          merchantId: payIntent.merchantId,
          agentId: payIntent.agentId,
          metadata: {
            payIntentId: payIntent.id,
            orderId: payIntent.orderId,
            txHash: transactionHash,
            ...payIntent.metadata,
            ...metadata,
          },
        });
        paymentId = payment.id;
        transactionHash = transactionHash || payment.transactionHash;
      }

      payIntent.paymentId = paymentId;
      payIntent.status = PayIntentStatus.SUCCEEDED;
      payIntent.completedAt = new Date();

      if (transactionHash) {
        payIntent.metadata.transactionHash = transactionHash;
      }

      await this.payIntentRepository.save(payIntent);

      // 触发Webhook
      await this.triggerWebhook(payIntent, 'payment_intent.succeeded');

      // 更新QuickPay授权使用量
      if (payIntent.authorization.quickPayGrantId) {
        await this.quickPayGrantService.recordUsage(
          payIntent.authorization.quickPayGrantId,
          payIntent.amount,
        );
      }

      this.logger.log(`执行PayIntent成功: id=${payIntentId}, paymentId=${paymentId}, mode=${payIntent.mode}`);

      return payIntent;
    } catch (error) {
      this.logger.error(`执行PayIntent失败: ${error.message}`, error.stack);
      payIntent.status = PayIntentStatus.FAILED;
      payIntent.metadata.errorMessage = error.message;
      await this.payIntentRepository.save(payIntent);

      // 触发Webhook
      await this.triggerWebhook(payIntent, 'payment_intent.failed');

      throw error;
    }
  }

  /**
   * 获取PayIntent
   */
  async getPayIntent(payIntentId: string, userId?: string): Promise<PayIntent> {
    // V3.0: 获取详情时不强制校验 userId，因为扫码支付时用户可能尚未登录或不是创建者
    // 只要知道 ID 就可以查看详情，授权和执行时会进行权限校验
    const payIntent = await this.payIntentRepository.findOne({ 
      where: { id: payIntentId } 
    });

    if (!payIntent) {
      throw new NotFoundException('PayIntent不存在');
    }

    // 如果提供了 userId，且 intent 已有 userId，且两者不一致
    // 注意：这里不抛出异常，只是记录，因为扫码者和创建者通常不同
    if (userId && payIntent.userId && userId !== payIntent.userId) {
      this.logger.debug(`用户 ${userId} 正在查看由 ${payIntent.userId} 创建的 PayIntent ${payIntentId}`);
    }

    // 检查是否过期
    if (payIntent.expiresAt && payIntent.expiresAt < new Date() && payIntent.status === PayIntentStatus.CREATED) {
      payIntent.status = PayIntentStatus.EXPIRED;
      await this.payIntentRepository.save(payIntent);
    }

    return payIntent;
  }

  /**
   * 取消PayIntent
   */
  async cancelPayIntent(payIntentId: string, userId: string): Promise<PayIntent> {
    const payIntent = await this.payIntentRepository.findOne({
      where: { id: payIntentId },
    });

    if (!payIntent) {
      throw new NotFoundException('PayIntent不存在');
    }

    // 只有创建者或绑定的支付者可以取消
    if (payIntent.userId && payIntent.userId !== userId && payIntent.merchantId !== userId) {
      throw new BadRequestException('无权取消此支付意图');
    }

    if ([PayIntentStatus.COMPLETED, PayIntentStatus.EXECUTING].includes(payIntent.status)) {
      throw new BadRequestException('PayIntent状态不允许取消');
    }

    payIntent.status = PayIntentStatus.CANCELLED;
    return this.payIntentRepository.save(payIntent);
  }

  /**
   * 清理过期的PayIntent（定时任务）
   */
  async cleanupExpiredPayIntents(): Promise<number> {
    const result = await this.payIntentRepository.update(
      {
        status: PayIntentStatus.CREATED,
        expiresAt: MoreThan(new Date()),
      },
      {
        status: PayIntentStatus.EXPIRED,
      },
    );

    return result.affected || 0;
  }

  /**
   * 生成二维码
   */
  private async generateQRCode(data: string): Promise<string> {
    try {
      return await QRCode.toDataURL(data);
    } catch (err) {
      this.logger.error(`生成二维码失败: ${err.message}`);
      return '';
    }
  }
}

