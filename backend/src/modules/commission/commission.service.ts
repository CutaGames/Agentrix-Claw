import { Injectable, Logger, Inject, Optional, forwardRef } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThanOrEqual } from 'typeorm';
import { Commission, PayeeType } from '../../entities/commission.entity';
import {
  CommissionSettlement,
  SettlementStatus,
} from '../../entities/commission-settlement.entity';
import { CommissionCalculatorService } from './commission-calculator.service';
import { Order, OrderStatus } from '../../entities/order.entity';
import { AgentAccountService } from '../agent-account/agent-account.service';

@Injectable()
export class CommissionService {
  private readonly logger = new Logger(CommissionService.name);

  constructor(
    @InjectRepository(Commission)
    private commissionRepository: Repository<Commission>,
    @InjectRepository(CommissionSettlement)
    private settlementRepository: Repository<CommissionSettlement>,
    @InjectRepository(Order)
    private orderRepository: Repository<Order>,
    private calculatorService: CommissionCalculatorService,
    // crypto-native-agent-ops 任务 2.2:分账完成处自动记账(需求 7.1/7.2 · design §C1)。
    @Optional()
    @Inject(forwardRef(() => AgentAccountService))
    private readonly agentAccount?: AgentAccountService,
  ) {}

  async getCommissions(payeeId: string) {
    return this.commissionRepository.find({
      where: { payeeId },
      order: { createdAt: 'DESC' },
    });
  }

  async getSettlements(payeeId: string) {
    return this.settlementRepository.find({
      where: { payeeId },
      order: { settlementDate: 'DESC' },
    });
  }

  /**
   * 执行T+1自动结算
   */
  async executeSettlement(
    payeeId: string,
    payeeType: PayeeType,
    currency: string = 'CNY',
  ): Promise<CommissionSettlement> {
    // 计算结算周期（T+1，即昨天的交易）
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    // 计算待结算金额
    const totalAmount = await this.calculatorService.calculateSettlementCommissions(
      payeeId,
      payeeType,
      yesterday,
      today,
    );

    if (totalAmount <= 0) {
      throw new Error('没有待结算的分润');
    }

    // 创建结算记录
    const settlement = this.settlementRepository.create({
      payeeId,
      payeeType,
      amount: totalAmount,
      currency,
      settlementDate: today,
      status: SettlementStatus.PENDING,
    });

    const savedSettlement = await this.settlementRepository.save(settlement);

    // TODO: 调用智能合约执行结算
    // await this.executeSettlementOnChain(savedSettlement);

    return savedSettlement;
  }

  /**
   * 标记分润为已结算
   *
   * crypto-native-agent-ops 任务 2.2:分账完成处(commission settled)对 AGENT 收款方
   * 自动调用 recordSpending(需求 7.1/7.2 · design §C1)。以 commission.id 为幂等键防重复
   * 计数(Property 1 账实一致);记账失败不中断结算(吞错告警,幂等键允许后续补偿)。
   */
  async markCommissionsAsSettled(
    payeeId: string,
    payeeType: PayeeType,
  ): Promise<void> {
    // 先载入待结算行(用于 AGENT 记账),再统一标记 settled。
    const ready = await this.commissionRepository.find({
      where: { payeeId, payeeType, status: 'ready' },
    });

    await this.commissionRepository.update(
      {
        payeeId,
        payeeType,
        status: 'ready',
      },
      {
        status: 'settled',
      },
    );

    // 仅对 AGENT 收款方在分账完成处记账(真实成交)。
    if (payeeType === PayeeType.AGENT && this.agentAccount) {
      for (const c of ready) {
        const amount = Number(c.amount);
        if (!(amount > 0)) continue;
        try {
          await this.agentAccount.recordSpending(
            c.payeeId,
            amount,
            true,
            `commission:${c.id}`,
          );
        } catch (err: any) {
          this.logger.warn(
            `recordSpending failed for commission=${c.id} agent=${c.payeeId}: ${err?.message}`,
          );
        }
      }
    }
  }

  /**
   * 将已到期的佣金从 locked 转为 ready
   */
  async releaseDueCommissions(): Promise<number> {
    const now = new Date();
    const dueCommissions = await this.commissionRepository.find({
      where: {
        status: 'locked',
        settlementAvailableAt: LessThanOrEqual(now),
      },
    });

    let unlocked = 0;
    for (const commission of dueCommissions) {
      if (commission.orderId) {
        const order = await this.orderRepository.findOne({
          where: { id: commission.orderId },
        });
        if (
          order &&
          (order.status === OrderStatus.FROZEN ||
            order.status === OrderStatus.DISPUTED)
        ) {
          continue;
        }
      }
      commission.status = 'ready';
      await this.commissionRepository.save(commission);
      unlocked++;
    }

    return unlocked;
  }

  /**
   * 将满足结算条件的订单标记为 SETTLED
   */
  async finalizeOrdersDue(): Promise<number> {
    const now = new Date();
    const dueOrders = await this.orderRepository.find({
      where: {
        status: OrderStatus.DELIVERED,
        settlementDueTime: LessThanOrEqual(now),
        isDisputed: false,
      },
    });

    let settled = 0;
    for (const order of dueOrders) {
      order.status = OrderStatus.SETTLED;
      await this.orderRepository.save(order);
      settled++;
    }

    return settled;
  }
}

