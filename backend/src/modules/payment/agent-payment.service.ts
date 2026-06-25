import { Injectable, Logger, BadRequestException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Payment, PaymentStatus, PaymentMethod } from '../../entities/payment.entity';
import { User } from '../../entities/user.entity';

export interface AgentPaymentRequest {
  agentId: string;
  userId: string;
  amount: number;
  currency: string;
  merchantId: string;
  description?: string;
  repaymentMethod?: 'offline' | 'system' | 'crypto';
}

@Injectable()
export class AgentPaymentService {
  private readonly logger = new Logger(AgentPaymentService.name);

  constructor(
    @InjectRepository(Payment)
    private paymentRepository: Repository<Payment>,
    @InjectRepository(User)
    private userRepository: Repository<User>,
  ) {}

  /**
   * 创建Agent代付
   */
  async createAgentPayment(request: AgentPaymentRequest): Promise<Payment> {
    // 验证Agent是否存在且是Agent角色
    const agent = await this.userRepository.findOne({
      where: { id: request.agentId },
    });

    if (!agent) {
      throw new NotFoundException('Agent不存在');
    }

    // 验证用户是否存在
    const user = await this.userRepository.findOne({
      where: { id: request.userId },
    });

    if (!user) {
      throw new NotFoundException('用户不存在');
    }

    // 创建支付记录（状态为PENDING，等待Agent支付）
    const payment = this.paymentRepository.create({
      userId: request.userId,
      amount: request.amount,
      currency: request.currency,
      paymentMethod: PaymentMethod.WALLET, // Agent代付使用钱包支付
      description: request.description || `Agent代付 - Agent: ${request.agentId}`,
      merchantId: request.merchantId,
      agentId: request.agentId,
      status: PaymentStatus.PENDING,
      metadata: {
        agentPayment: true,
        repaymentMethod: request.repaymentMethod || 'offline',
        agentPaid: false,
      },
    });

    const savedPayment = await this.paymentRepository.save(payment);

    this.logger.log(
      `创建Agent代付: paymentId=${savedPayment.id}, agentId=${request.agentId}, userId=${request.userId}, amount=${request.amount}`,
    );

    return savedPayment;
  }

  /**
   * Agent确认支付（Agent使用自己的资金支付）
   */
  async confirmAgentPayment(
    paymentId: string,
    agentId: string,
    transactionHash: string,
  ): Promise<Payment> {
    const payment = await this.paymentRepository.findOne({
      where: { id: paymentId, agentId },
    });

    if (!payment) {
      throw new NotFoundException('支付记录不存在或无权操作');
    }

    if (payment.status !== PaymentStatus.PENDING) {
      throw new BadRequestException(`支付状态错误: ${payment.status}`);
    }

    // 更新支付状态
    payment.status = PaymentStatus.COMPLETED;
    payment.transactionHash = transactionHash;
    payment.metadata = {
      ...payment.metadata,
      agentPaid: true,
      agentPaidAt: new Date().toISOString(),
    };

    const savedPayment = await this.paymentRepository.save(payment);

    this.logger.log(`Agent确认支付: paymentId=${paymentId}, transactionHash=${transactionHash}`);

    return savedPayment;
  }

  /**
   * 用户还款（系统内转账）
   */
  async repayToAgent(
    paymentId: string,
    userId: string,
    transactionHash?: string,
  ): Promise<Payment> {
    const payment = await this.paymentRepository.findOne({
      where: { id: paymentId, userId },
    });

    if (!payment) {
      throw new NotFoundException('支付记录不存在');
    }

    if (!payment.metadata?.agentPayment) {
      throw new BadRequestException('不是Agent代付记录');
    }

    // 更新还款状态
    payment.metadata = {
      ...payment.metadata,
      repaid: true,
      repaidAt: new Date().toISOString(),
      repaymentTransactionHash: transactionHash,
    };

    const savedPayment = await this.paymentRepository.save(payment);

    this.logger.log(`用户还款: paymentId=${paymentId}, userId=${userId}`);

    return savedPayment;
  }

  /**
   * 获取Agent代付记录
   */
  async getAgentPayments(agentId: string): Promise<Payment[]> {
    return this.paymentRepository.find({
      where: { agentId, metadata: { agentPayment: true } } as any,
      order: { createdAt: 'DESC' },
    });
  }

  /**
   * 获取用户的Agent代付记录
   */
  async getUserAgentPayments(userId: string): Promise<Payment[]> {
    return this.paymentRepository.find({
      where: {
        userId,
        metadata: { agentPayment: true },
      } as any,
      order: { createdAt: 'DESC' },
    });
  }
}

