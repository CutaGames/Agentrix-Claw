import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PaymentService } from '../payment/payment.service';
import { QuickPayGrantService } from '../payment/quick-pay-grant.service';
import { AgentWalletService } from './agent-wallet.service';
import { NaturalLanguageIntentService, ParsedPaymentIntent } from './natural-language-intent.service';
import { User } from '../../entities/user.entity';
import { Payment } from '../../entities/payment.entity';

/**
 * Agent Payment Skill - MCP 支付技能
 * 
 * 目标：让任何 AI Agent 一秒具备收付款能力
 * 
 * 三种使用模式：
 * 1. 直接支付：指定金额和收款方，立即执行
 * 2. 意图支付：自然语言描述，自动解析并执行
 * 3. 分账支付：支持多方分账的协作支付
 */
export interface AgentPaymentRequest {
  // 模式1：直接支付
  amount?: number;
  recipientAgentId?: string;
  recipientAddress?: string;
  
  // 模式2：意图支付
  intent?: string;  // 自然语言描述，如"支付100U给翻译Agent，从上周的预存款扣"
  
  // 模式3：分账支付
  splitConfig?: {
    recipients: Array<{
      address: string;
      share: number;  // basis points (10000 = 100%)
      role: 'merchant' | 'agent' | 'referrer' | 'platform';
    }>;
    totalAmount: number;
  };
  
  // 通用参数
  taskId?: string;          // 关联任务ID（用于 Audit Proof）
  sessionId?: string;       // ERC8004 Session ID（用于预存款扣款）
  currency?: string;        // 默认 USDC
  description?: string;     // 支付说明
  metadata?: Record<string, any>;
}

export interface AgentPaymentResult {
  success: boolean;
  paymentId?: string;
  transactionHash?: string;
  splitDetails?: Array<{
    recipient: string;
    amount: number;
    role: string;
  }>;
  preview?: PaymentPreview;
  requiresConfirmation?: boolean;
  confirmationId?: string;
  error?: string;
}

export interface PaymentPreview {
  totalAmount: number;
  currency: string;
  recipients: Array<{
    address: string;
    amount: number;
    role: string;
    percentage: number;
  }>;
  fees: {
    platformFee: number;
    gasFee: number;
  };
  source: {
    type: 'wallet' | 'session' | 'quickpay';
    balance?: number;
    sessionId?: string;
  };
  estimatedCompletion: string;
}

@Injectable()
export class AgentPaymentSkillService {
  private readonly logger = new Logger(AgentPaymentSkillService.name);

  // 待确认的支付缓存
  private pendingPayments: Map<string, {
    request: AgentPaymentRequest;
    preview: PaymentPreview;
    userId: string;
    createdAt: Date;
    expiresAt: Date;
  }> = new Map();

  constructor(
    private readonly configService: ConfigService,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(Payment)
    private readonly paymentRepository: Repository<Payment>,
    private readonly paymentService: PaymentService,
    private readonly quickPayGrantService: QuickPayGrantService,
    private readonly agentWalletService: AgentWalletService,
    private readonly naturalLanguageIntentService: NaturalLanguageIntentService,
  ) {}

  /**
   * 执行 Agent 支付
   * 统一入口，根据请求类型自动路由
   */
  async executePayment(
    userId: string,
    request: AgentPaymentRequest,
  ): Promise<AgentPaymentResult> {
    this.logger.log(`执行Agent支付: userId=${userId}, request=${JSON.stringify(request)}`);

    try {
      // 1. 如果是自然语言意图，先解析
      if (request.intent) {
        return this.handleIntentPayment(userId, request.intent, request);
      }

      // 2. 如果是分账支付
      if (request.splitConfig) {
        return this.handleSplitPayment(userId, request);
      }

      // 3. 直接支付
      if (request.amount && (request.recipientAgentId || request.recipientAddress)) {
        return this.handleDirectPayment(userId, request);
      }

      throw new BadRequestException('无效的支付请求：需要提供 amount+recipient、intent 或 splitConfig');
    } catch (error: any) {
      this.logger.error(`Agent支付失败: ${error.message}`, error.stack);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * 处理自然语言意图支付
   */
  private async handleIntentPayment(
    userId: string,
    intentText: string,
    request: AgentPaymentRequest,
  ): Promise<AgentPaymentResult> {
    this.logger.log(`解析支付意图: ${intentText}`);

    // 1. 使用 LLM 解析意图
    const parsedIntent = await this.naturalLanguageIntentService.parsePaymentIntent(
      intentText,
      userId,
      {
        sessionId: request.sessionId,
        taskId: request.taskId,
      }
    );

    // 2. 如果需要补充信息
    if (parsedIntent.missingFields && parsedIntent.missingFields.length > 0) {
      return {
        success: false,
        error: `需要补充以下信息: ${parsedIntent.missingFields.join(', ')}`,
        preview: await this.generatePreview(userId, parsedIntent),
        requiresConfirmation: true,
      };
    }

    // 3. 生成预览并等待确认
    const preview = await this.generatePreview(userId, parsedIntent);
    
    // 如果金额超过免确认阈值，需要用户确认
    const confirmationThreshold = this.configService.get('PAYMENT_AUTO_CONFIRM_THRESHOLD', 10);
    if (parsedIntent.amount > confirmationThreshold) {
      const confirmationId = this.createPendingPayment(userId, {
        ...request,
        amount: parsedIntent.amount,
        recipientAddress: parsedIntent.recipientAddress,
        sessionId: parsedIntent.sessionId,
      }, preview);

      return {
        success: true,
        preview,
        requiresConfirmation: true,
        confirmationId,
      };
    }

    // 4. 执行支付
    return this.executeConfirmedPayment(userId, {
      ...request,
      amount: parsedIntent.amount,
      recipientAddress: parsedIntent.recipientAddress,
      sessionId: parsedIntent.sessionId,
      description: parsedIntent.description,
    });
  }

  /**
   * 处理分账支付
   */
  private async handleSplitPayment(
    userId: string,
    request: AgentPaymentRequest,
  ): Promise<AgentPaymentResult> {
    const { splitConfig } = request;
    if (!splitConfig) {
      throw new BadRequestException('分账配置缺失');
    }

    // 验证分账比例
    const totalShares = splitConfig.recipients.reduce((sum, r) => sum + r.share, 0);
    if (totalShares !== 10000) {
      throw new BadRequestException(`分账比例必须等于100%, 当前: ${totalShares / 100}%`);
    }

    // 计算每方金额
    const splitDetails = splitConfig.recipients.map(r => ({
      recipient: r.address,
      amount: (splitConfig.totalAmount * r.share) / 10000,
      role: r.role,
    }));

    // 生成预览
    const preview: PaymentPreview = {
      totalAmount: splitConfig.totalAmount,
      currency: request.currency || 'USDC',
      recipients: splitConfig.recipients.map(r => ({
        address: r.address,
        amount: (splitConfig.totalAmount * r.share) / 10000,
        role: r.role,
        percentage: r.share / 100,
      })),
      fees: {
        platformFee: splitConfig.totalAmount * 0.01, // 1% 平台费
        gasFee: 0.1, // 预估 Gas
      },
      source: {
        type: 'wallet',
      },
      estimatedCompletion: '30秒内',
    };

    // 创建待确认支付
    const confirmationId = this.createPendingPayment(userId, request, preview);

    return {
      success: true,
      preview,
      splitDetails,
      requiresConfirmation: true,
      confirmationId,
    };
  }

  /**
   * 处理直接支付
   */
  private async handleDirectPayment(
    userId: string,
    request: AgentPaymentRequest,
  ): Promise<AgentPaymentResult> {
    const { amount, recipientAgentId, recipientAddress, currency = 'USDC' } = request;

    // 解析收款地址
    let finalRecipient = recipientAddress;
    if (recipientAgentId && !recipientAddress) {
      // TODO: 从 AgentRegistry 查询 Agent 的钱包地址
      finalRecipient = await this.resolveAgentAddress(recipientAgentId);
    }

    if (!finalRecipient) {
      throw new BadRequestException('无法确定收款地址');
    }

    const preview = await this.generatePreview(userId, {
      amount: amount!,
      recipientAddress: finalRecipient,
      currency,
      type: 'pay',
      confidence: 1,
    });

    // 小额支付直接执行
    const confirmationThreshold = this.configService.get('PAYMENT_AUTO_CONFIRM_THRESHOLD', 10);
    if (amount! <= confirmationThreshold) {
      return this.executeConfirmedPayment(userId, request);
    }

    // 大额支付需要确认
    const confirmationId = this.createPendingPayment(userId, request, preview);
    return {
      success: true,
      preview,
      requiresConfirmation: true,
      confirmationId,
    };
  }

  /**
   * 确认并执行支付
   */
  async confirmPayment(
    userId: string,
    confirmationId: string,
  ): Promise<AgentPaymentResult> {
    const pending = this.pendingPayments.get(confirmationId);
    if (!pending) {
      throw new BadRequestException('支付确认ID无效或已过期');
    }

    if (pending.userId !== userId) {
      throw new BadRequestException('无权确认此支付');
    }

    if (new Date() > pending.expiresAt) {
      this.pendingPayments.delete(confirmationId);
      throw new BadRequestException('支付已过期，请重新发起');
    }

    // 执行支付
    const result = await this.executeConfirmedPayment(userId, pending.request);
    
    // 清理缓存
    this.pendingPayments.delete(confirmationId);

    return result;
  }

  /**
   * 执行已确认的支付
   */
  private async executeConfirmedPayment(
    userId: string,
    request: AgentPaymentRequest,
  ): Promise<AgentPaymentResult> {
    const { amount, recipientAddress, sessionId, taskId, description } = request;

    // 1. 确定支付来源
    let paymentSource: 'wallet' | 'session' | 'quickpay' = 'wallet';
    if (sessionId) {
      paymentSource = 'session';
    }

    // 2. 检查余额/授权
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) {
      throw new BadRequestException('用户不存在');
    }

    // 3. 创建支付记录（直接使用 repository）
    const payment = this.paymentRepository.create({
      userId,
      amount: amount!,
      currency: request.currency || 'USDC',
      paymentMethod: 'wallet' as any,
      status: 'pending' as any,
      description: description || `Agent Payment to ${recipientAddress}`,
      metadata: {
        taskId,
        sessionId,
        recipientAddress,
        source: paymentSource,
        ...request.metadata,
      },
    });
    const savedPayment = await this.paymentRepository.save(payment);

    // 4. 执行链上转账
    try {
      // TODO: 实际调用合约执行转账
      // 这里先模拟成功
      const txHash = `0x${Date.now().toString(16)}...mock`;

      // 更新支付状态
      savedPayment.status = 'completed' as any;
      savedPayment.transactionHash = txHash;
      await this.paymentRepository.save(savedPayment);

      return {
        success: true,
        paymentId: savedPayment.id,
        transactionHash: txHash,
      };
    } catch (error: any) {
      savedPayment.status = 'failed' as any;
      savedPayment.metadata = {
        ...savedPayment.metadata,
        failureReason: error.message,
      };
      await this.paymentRepository.save(savedPayment);

      throw error;
    }
  }

  /**
   * 生成支付预览
   */
  private async generatePreview(
    userId: string,
    intent: ParsedPaymentIntent,
  ): Promise<PaymentPreview> {
    // 查询用户钱包余额
    const walletBalance = await this.agentWalletService.getBalance(userId);

    return {
      totalAmount: intent.amount,
      currency: intent.currency || 'USDC',
      recipients: [
        {
          address: intent.recipientAddress || '待确定',
          amount: intent.amount * 0.99, // 扣除平台费
          role: 'recipient',
          percentage: 99,
        },
      ],
      fees: {
        platformFee: intent.amount * 0.01,
        gasFee: 0.1,
      },
      source: {
        type: intent.sessionId ? 'session' : 'wallet',
        balance: walletBalance?.balance?.usdc || 0,
        sessionId: intent.sessionId,
      },
      estimatedCompletion: '30秒内',
    };
  }

  /**
   * 创建待确认支付
   */
  private createPendingPayment(
    userId: string,
    request: AgentPaymentRequest,
    preview: PaymentPreview,
  ): string {
    const confirmationId = `confirm_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    this.pendingPayments.set(confirmationId, {
      request,
      preview,
      userId,
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + 5 * 60 * 1000), // 5分钟过期
    });

    return confirmationId;
  }

  /**
   * 解析 Agent ID 到钱包地址
   */
  private async resolveAgentAddress(agentId: string): Promise<string | null> {
    // TODO: 从 AgentRegistry 合约查询
    // 临时实现：直接返回 agentId（假设它就是地址）
    if (agentId.startsWith('0x') && agentId.length === 42) {
      return agentId;
    }
    return null;
  }

  /**
   * 获取支付状态
   */
  async getPaymentStatus(paymentId: string): Promise<Payment | null> {
    return this.paymentRepository.findOne({ where: { id: paymentId } });
  }

  /**
   * 取消待确认支付
   */
  cancelPendingPayment(confirmationId: string): boolean {
    return this.pendingPayments.delete(confirmationId);
  }
}
