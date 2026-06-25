import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { PayIntentService } from '../payment/pay-intent.service';
import { AuthorizationService } from './authorization.service';
import { AgentRegistryService } from './agent-registry.service';
import { PayIntentStatus, PayIntentType } from '../../entities/pay-intent.entity';
import { ethers } from 'ethers';

export interface AgentExecutePaymentDto {
  userId: string;
  agentId: string;
  amount: number;
  currency: string;
  merchantId: string;
  description?: string;
  orderId?: string;
  attribution?: {
    channel?: string;
    campaignId?: string;
    referrer?: string;
    sessionId?: string;
  };
  idempotencyKey?: string;
  // 审计增强字段
  agentSignature?: string; // Agent 对 decisionLog 的签名
  decisionLog?: {
    reason: string;
    timestamp: number;
    context?: any;
  };
}

@Injectable()
export class AgentCheckoutService {
  private readonly logger = new Logger(AgentCheckoutService.name);

  constructor(
    private payIntentService: PayIntentService,
    private authorizationService: AuthorizationService,
    private agentRegistryService: AgentRegistryService,
  ) {}

  /**
   * Agent 执行支付 (Agent Checkout)
   */
  async executePayment(dto: AgentExecutePaymentDto): Promise<{
    status: 'succeeded' | 'processing' | 'requires_user_confirmation' | 'failed';
    payIntentId: string;
    receipt?: any;
    confirmUrl?: string;
    reason?: string;
  }> {
    // 0. 验证 Agent 签名（不可抵赖性核心）
    if (dto.agentSignature && dto.decisionLog) {
      const isValid = await this.verifyAgentSignature(
        dto.agentId,
        dto.agentSignature,
        dto.decisionLog,
      );
      if (!isValid) {
        throw new BadRequestException('Agent signature verification failed');
      }
    } else {
      this.logger.warn(`Agent ${dto.agentId} executed payment without signature`);
    }

    // 1. 创建 PayIntent
    const payIntent = await this.payIntentService.createPayIntent(dto.userId, {
      type: PayIntentType.ORDER_PAYMENT,
      amount: dto.amount,
      currency: dto.currency,
      description: dto.description,
      orderId: dto.orderId,
      merchantId: dto.merchantId,
      agentId: dto.agentId,
      metadata: {
        ...dto.attribution,
        idempotencyKey: dto.idempotencyKey,
        decisionLog: dto.decisionLog,
      },
    });

    // 2. 评估授权
    const evaluation = await this.authorizationService.evaluateAuthorization(
      dto.userId,
      dto.agentId,
      dto.amount,
      dto.merchantId,
    );

    if (evaluation.authorized) {
      try {
        // 3. 授权通过，直接执行
        await this.payIntentService.authorizePayIntent(
          payIntent.id,
          dto.userId,
          'agent',
        );

        const executedIntent = await this.payIntentService.executePayIntent(
          payIntent.id,
          dto.userId,
        );

        // 4. 记录审计证据（包含签名与决策日志）
        await this.authorizationService.recordAuditProof({
          payIntentId: payIntent.id,
          authorizationId: evaluation.authId,
          agentId: dto.agentId,
          action: 'agent_execute_payment',
          reason: dto.decisionLog?.reason || 'Authorized by user policy',
          policyResults: { evaluation, decisionLog: dto.decisionLog },
          agentSignature: dto.agentSignature,
        });

        return {
          status: 'succeeded',
          payIntentId: payIntent.id,
          receipt: {
            transactionHash: executedIntent.metadata?.transactionHash,
            completedAt: executedIntent.completedAt,
          },
        };
      } catch (error: any) {
        this.logger.error(`Agent支付执行失败: ${error.message}`);
        
        // 记录失败的审计证据
        await this.authorizationService.recordAuditProof({
          payIntentId: payIntent.id,
          authorizationId: evaluation.authId,
          agentId: dto.agentId,
          action: 'agent_execute_payment_failed',
          reason: error.message,
          agentSignature: dto.agentSignature,
        });

        return {
          status: 'failed',
          payIntentId: payIntent.id,
          reason: error.message,
        };
      }
    } else {
      // 5. 授权不通过，降级为用户确认
      await this.authorizationService.recordAuditProof({
        payIntentId: payIntent.id,
        agentId: dto.agentId,
        action: 'downgrade_to_user_confirmation',
        reason: evaluation.reason,
        agentSignature: dto.agentSignature,
      });

      return {
        status: 'requires_user_confirmation',
        payIntentId: payIntent.id,
        confirmUrl: payIntent.metadata?.payUrl || `/checkout/${payIntent.id}`,
        reason: evaluation.reason,
      };
    }
  }

  /**
   * 验证 Agent 签名
   */
  private async verifyAgentSignature(
    agentId: string,
    signature: string,
    decisionLog: any,
  ): Promise<boolean> {
    try {
      const agent = await this.agentRegistryService.getAgent(agentId);
      if (!agent || !agent.publicKey) {
        this.logger.warn(`Agent ${agentId} has no public key registered`);
        return false;
      }

      // 验证逻辑：使用 ethers 验证 EIP-191 签名
      // 待签名的消息是 decisionLog 的 JSON 字符串
      const message = JSON.stringify(decisionLog);
      const recoveredAddress = ethers.verifyMessage(message, signature);
      
      return recoveredAddress.toLowerCase() === agent.publicKey.toLowerCase();
    } catch (error: any) {
      this.logger.error(`签名验证失败: ${error.message}`);
      return false;
    }
  }
}
