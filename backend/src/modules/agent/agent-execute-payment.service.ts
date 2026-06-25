import { Injectable, Logger, BadRequestException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ethers } from 'ethers';
import { PayIntentService } from '../payment/pay-intent.service';
import { PaymentService } from '../payment/payment.service';
import { PolicyEvaluatorService, PolicyEvaluationResult } from './policy-evaluator.service';
import { AgentRegistryService } from './agent-registry.service';
import { AuthorizationService } from './authorization.service';
import { WebhookService } from '../webhook/webhook.service';
import { AuditProof } from '../../entities/audit-proof.entity';
import { PayIntent, PayIntentStatus, PayIntentType } from '../../entities/pay-intent.entity';
import { Payment, PaymentStatus, PaymentMethod } from '../../entities/payment.entity';
import { ConfigService } from '@nestjs/config';

/**
 * Agent Execute Payment 请求 DTO
 */
export interface AgentExecutePaymentRequest {
  // 必填字段
  userId: string;
  agentId: string;
  amount: number;
  currency: string;
  merchantId: string;
  
  // 可选字段
  description?: string;
  orderId?: string;
  productId?: string;
  category?: string;
  
  // 归因字段
  attribution?: {
    channel?: string;
    campaignId?: string;
    referrer?: string;
    sessionId?: string;
  };
  
  // 幂等性
  idempotencyKey?: string;
  
  // 审计增强字段（不可抵赖性）
  agentSignature?: string;
  decisionLog?: {
    reason: string;
    timestamp: number;
    context?: any;
    intentDescription?: string;
  };
  
  // 支付方式偏好
  preferredPaymentMethod?: 'wallet' | 'stripe' | 'crypto' | 'auto';
}

/**
 * Agent Execute Payment 响应
 */
export interface AgentExecutePaymentResponse {
  status: 'succeeded' | 'processing' | 'requires_user_confirmation' | 'failed';
  payIntentId: string;
  
  // 成功时返回
  receipt?: {
    transactionHash?: string;
    completedAt?: Date;
    amount: number;
    currency: string;
    merchantId: string;
    auditProofHash?: string;
  };
  
  // 需要用户确认时返回
  confirmUrl?: string;
  confirmationDetails?: {
    reason: string;
    evaluationResult: PolicyEvaluationResult;
    expiresAt: Date;
  };
  
  // 失败时返回
  reason?: string;
  errorCode?: string;
}

/**
 * Agent Execute Payment 服务
 * 实现 PRD 中定义的 Agent 直接支付功能
 */
@Injectable()
export class AgentExecutePaymentService {
  private readonly logger = new Logger(AgentExecutePaymentService.name);

  constructor(
    @InjectRepository(AuditProof)
    private auditProofRepository: Repository<AuditProof>,
    @InjectRepository(Payment)
    private paymentRepository: Repository<Payment>,
    private payIntentService: PayIntentService,
    private paymentService: PaymentService,
    private policyEvaluator: PolicyEvaluatorService,
    private agentRegistryService: AgentRegistryService,
    private authorizationService: AuthorizationService,
    private webhookService: WebhookService,
    private configService: ConfigService,
  ) {}

  /**
   * Agent 执行支付
   * 
   * 流程：
   * 1. 验证 Agent 签名（不可抵赖性）
   * 2. 创建 PayIntent
   * 3. 策略评估
   * 4. 根据评估结果执行或降级
   * 5. 记录审计证据
   */
  async executePayment(request: AgentExecutePaymentRequest): Promise<AgentExecutePaymentResponse> {
    const startTime = Date.now();
    this.logger.log(`Agent支付请求: agentId=${request.agentId}, userId=${request.userId}, amount=${request.amount}`);

    // 0. 幂等性检查
    if (request.idempotencyKey) {
      const existingPayment = await this.paymentRepository.findOne({
        where: { 
          userId: request.userId,
          metadata: { idempotencyKey: request.idempotencyKey } as any,
        },
      });
      if (existingPayment) {
        this.logger.log(`幂等性命中: idempotencyKey=${request.idempotencyKey}`);
        return {
          status: existingPayment.status === PaymentStatus.COMPLETED ? 'succeeded' : 'processing',
          payIntentId: existingPayment.id,
          receipt: existingPayment.status === PaymentStatus.COMPLETED ? {
            transactionHash: existingPayment.transactionHash,
            completedAt: existingPayment.updatedAt,
            amount: Number(existingPayment.amount),
            currency: existingPayment.currency,
            merchantId: existingPayment.merchantId,
          } : undefined,
        };
      }
    }

    // 1. 验证 Agent 身份和签名
    const agent = await this.agentRegistryService.getAgent(request.agentId);
    if (!agent) {
      return {
        status: 'failed',
        payIntentId: '',
        reason: 'Agent 不存在或未注册',
        errorCode: 'AGENT_NOT_FOUND',
      };
    }

    // 验证签名（如果提供）
    if (request.agentSignature && request.decisionLog) {
      const signatureValid = await this.verifyAgentSignature(
        request.agentId,
        request.agentSignature,
        request.decisionLog,
        agent.publicKey
      );
      if (!signatureValid) {
        this.logger.warn(`Agent签名验证失败: agentId=${request.agentId}`);
        return {
          status: 'failed',
          payIntentId: '',
          reason: 'Agent 签名验证失败',
          errorCode: 'INVALID_SIGNATURE',
        };
      }
    } else {
      this.logger.warn(`Agent ${request.agentId} 未提供签名，安全性降低`);
    }

    // 2. 创建 PayIntent
    const payIntent = await this.payIntentService.createPayIntent(request.userId, {
      type: PayIntentType.ORDER_PAYMENT,
      amount: request.amount,
      currency: request.currency,
      description: request.description || `Agent 代付 - ${agent.name || request.agentId}`,
      orderId: request.orderId,
      merchantId: request.merchantId,
      agentId: request.agentId,
      metadata: {
        ...request.attribution,
        idempotencyKey: request.idempotencyKey,
        decisionLog: request.decisionLog,
        productId: request.productId,
        category: request.category,
        agentExecutePayment: true,
      },
    });

    // 3. 策略评估
    const evaluation = await this.policyEvaluator.evaluatePolicy(
      request.userId,
      request.agentId,
      request.amount,
      request.merchantId,
      {
        category: request.category,
        productId: request.productId,
        orderId: request.orderId,
        channel: request.attribution?.channel,
      }
    );

    // 4. 根据评估结果处理
    if (evaluation.authorized && evaluation.suggestedAction === 'auto_execute') {
      // 授权通过，直接执行支付
      return this.executeAuthorizedPayment(
        payIntent,
        request,
        evaluation,
        agent
      );
    } else {
      // 授权不通过或需要确认，降级为用户确认
      return this.handleDowngradeToUserConfirmation(
        payIntent,
        request,
        evaluation,
        agent
      );
    }
  }

  /**
   * 执行已授权的支付
   */
  private async executeAuthorizedPayment(
    payIntent: PayIntent,
    request: AgentExecutePaymentRequest,
    evaluation: PolicyEvaluationResult,
    agent: any
  ): Promise<AgentExecutePaymentResponse> {
    try {
      // 授权 PayIntent
      await this.payIntentService.authorizePayIntent(
        payIntent.id,
        request.userId,
        'agent'
      );

      // 执行支付
      const executedIntent = await this.payIntentService.executePayIntent(
        payIntent.id,
        request.userId
      );

      // 记录审计证据
      const auditProof = await this.recordAuditProof({
        payIntentId: payIntent.id,
        authorizationId: evaluation.authorizationId,
        agentId: request.agentId,
        action: 'AGENT_EXECUTE_PAYMENT_SUCCESS',
        reason: request.decisionLog?.reason || 'Authorized by user policy',
        evaluationResult: evaluation,
        agentSignature: request.agentSignature,
        metadata: {
          amount: request.amount,
          currency: request.currency,
          merchantId: request.merchantId,
          executionTime: Date.now(),
        },
      });

      // 发送 Webhook
      await this.sendPaymentWebhook(payIntent, 'payment.agent_executed', {
        agentId: request.agentId,
        agentName: agent.name,
        evaluationResult: evaluation,
      });

      this.logger.log(`Agent支付成功: payIntentId=${payIntent.id}, amount=${request.amount}`);

      return {
        status: 'succeeded',
        payIntentId: payIntent.id,
        receipt: {
          transactionHash: executedIntent.metadata?.transactionHash,
          completedAt: executedIntent.completedAt,
          amount: request.amount,
          currency: request.currency,
          merchantId: request.merchantId,
          auditProofHash: auditProof.proofHash,
        },
      };

    } catch (error: any) {
      this.logger.error(`Agent支付执行失败: ${error.message}`);

      // 记录失败审计证据
      await this.recordAuditProof({
        payIntentId: payIntent.id,
        authorizationId: evaluation.authorizationId,
        agentId: request.agentId,
        action: 'AGENT_EXECUTE_PAYMENT_FAILED',
        reason: error.message,
        agentSignature: request.agentSignature,
      });

      return {
        status: 'failed',
        payIntentId: payIntent.id,
        reason: error.message,
        errorCode: 'EXECUTION_FAILED',
      };
    }
  }

  /**
   * 处理降级为用户确认
   */
  private async handleDowngradeToUserConfirmation(
    payIntent: PayIntent,
    request: AgentExecutePaymentRequest,
    evaluation: PolicyEvaluationResult,
    agent: any
  ): Promise<AgentExecutePaymentResponse> {
    // 记录降级审计证据
    await this.recordAuditProof({
      payIntentId: payIntent.id,
      authorizationId: evaluation.authorizationId,
      agentId: request.agentId,
      action: 'DOWNGRADE_TO_USER_CONFIRMATION',
      reason: evaluation.reason || 'Policy evaluation failed',
      evaluationResult: evaluation,
      agentSignature: request.agentSignature,
    });

    // 生成确认 URL
    const frontendUrl = this.configService.get<string>('FRONTEND_URL') || 'https://agentrix.top';
    const confirmUrl = `${frontendUrl}/pay/confirm/${payIntent.id}`;

    // 发送需要确认的 Webhook
    await this.sendPaymentWebhook(payIntent, 'payment.requires_confirmation', {
      agentId: request.agentId,
      agentName: agent.name,
      reason: evaluation.reason,
      confirmUrl,
    });

    this.logger.log(`Agent支付降级为用户确认: payIntentId=${payIntent.id}, reason=${evaluation.reason}`);

    return {
      status: 'requires_user_confirmation',
      payIntentId: payIntent.id,
      confirmUrl,
      confirmationDetails: {
        reason: evaluation.reason || 'Policy evaluation required user confirmation',
        evaluationResult: evaluation,
        expiresAt: new Date(Date.now() + 30 * 60 * 1000), // 30分钟过期
      },
    };
  }

  /**
   * 验证 Agent 签名
   */
  private async verifyAgentSignature(
    agentId: string,
    signature: string,
    decisionLog: any,
    publicKey?: string
  ): Promise<boolean> {
    if (!publicKey) {
      this.logger.warn(`Agent ${agentId} 没有注册公钥`);
      return false;
    }

    try {
      const message = JSON.stringify(decisionLog);
      const recoveredAddress = ethers.verifyMessage(message, signature);
      return recoveredAddress.toLowerCase() === publicKey.toLowerCase();
    } catch (error: any) {
      this.logger.error(`签名验证错误: ${error.message}`);
      return false;
    }
  }

  /**
   * 记录审计证据（链式哈希）
   */
  private async recordAuditProof(data: {
    payIntentId: string;
    authorizationId?: string;
    agentId?: string;
    action: string;
    reason?: string;
    evaluationResult?: PolicyEvaluationResult;
    agentSignature?: string;
    metadata?: any;
  }): Promise<AuditProof> {
    // 获取上一个证据的哈希
    const lastProof = await this.auditProofRepository.findOne({
      where: data.agentId ? { agentId: data.agentId } : { payIntentId: data.payIntentId },
      order: { createdAt: 'DESC' },
    });

    const crypto = require('crypto');
    
    const proof = this.auditProofRepository.create({
      payIntentId: data.payIntentId,
      authorizationId: data.authorizationId,
      agentId: data.agentId,
      decisionLog: {
        timestamp: new Date(),
        action: data.action,
        reason: data.reason,
        policyResults: {
          evaluation: data.evaluationResult,
          metadata: data.metadata,
        },
      },
      previousProofHash: lastProof?.proofHash || '0'.repeat(64),
      signature: data.agentSignature || null,
    });

    // 计算当前证据的哈希
    const hashContent = JSON.stringify({
      p: proof.payIntentId,
      d: proof.decisionLog,
      prev: proof.previousProofHash,
      sig: proof.signature,
    });

    proof.proofHash = crypto
      .createHash('sha256')
      .update(hashContent)
      .digest('hex');

    return this.auditProofRepository.save(proof);
  }

  /**
   * 发送支付 Webhook
   */
  private async sendPaymentWebhook(
    payIntent: PayIntent,
    eventType: string,
    additionalData?: any
  ): Promise<void> {
    try {
      if (payIntent.merchantId) {
        await this.webhookService.sendWebhookEvent(
          payIntent.merchantId,
          eventType,
          {
            payIntentId: payIntent.id,
            amount: payIntent.amount,
            currency: payIntent.currency,
            status: payIntent.status,
            agentId: payIntent.agentId,
            ...additionalData,
          }
        );
      }
    } catch (error: any) {
      this.logger.error(`Webhook发送失败: ${error.message}`);
    }
  }

  /**
   * 批量执行支付（用于订阅、定投等场景）
   */
  async executeBatchPayments(
    requests: AgentExecutePaymentRequest[]
  ): Promise<AgentExecutePaymentResponse[]> {
    const results: AgentExecutePaymentResponse[] = [];
    
    for (const request of requests) {
      const result = await this.executePayment(request);
      results.push(result);
      
      // 如果有一个失败，后续可以选择继续或停止
      // 这里选择继续执行
    }
    
    return results;
  }
}
