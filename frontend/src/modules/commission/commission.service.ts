import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThanOrEqual } from 'typeorm';
import { Commission, PayeeType } from '../../entities/commission.entity';
import {
  CommissionSettlement,
  SettlementStatus,
} from '../../entities/commission-settlement.entity';
import { CommissionCalculatorService } from './commission-calculator.service';
import { Order, OrderStatus } from '../../entities/order.entity';

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
   */
  async markCommissionsAsSettled(
    payeeId: string,
    payeeType: PayeeType,
  ): Promise<void> {
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

