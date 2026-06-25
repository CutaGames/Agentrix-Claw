import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between } from 'typeorm';
import { Payment, PaymentStatus } from '../../entities/payment.entity';
import { Budget, BudgetPeriod, BudgetStatus } from '../../entities/budget.entity';

export type BudgetDto = Omit<Budget, 'id' | 'createdAt' | 'updatedAt'>;

@Injectable()
export class BudgetService {
  private readonly logger = new Logger(BudgetService.name);

  constructor(
    @InjectRepository(Payment)
    private paymentRepository: Repository<Payment>,
    @InjectRepository(Budget)
    private budgetRepository: Repository<Budget>,
  ) {}

  /**
   * 创建预算
   */
  async createBudget(
    userId: string,
    amount: number,
    currency: string,
    period: 'daily' | 'weekly' | 'monthly' | 'yearly',
    category?: string,
  ): Promise<Budget> {
    const now = new Date();
    const startDate = new Date(now);
    startDate.setHours(0, 0, 0, 0);

    let endDate = new Date(startDate);
    if (period === 'daily') {
      endDate.setDate(endDate.getDate() + 1);
    } else if (period === 'weekly') {
      endDate.setDate(endDate.getDate() + 7);
    } else if (period === 'monthly') {
      endDate.setMonth(endDate.getMonth() + 1);
    } else {
      endDate.setFullYear(endDate.getFullYear() + 1);
    }

    // 计算已花费金额
    const spent = await this.calculateSpent(userId, currency, startDate, endDate, category);

    const budget = this.budgetRepository.create({
      userId,
      category,
      amount,
      currency,
      period: period as BudgetPeriod,
      startDate,
      endDate,
      spent,
      remaining: amount - spent,
      status: spent >= amount ? BudgetStatus.EXCEEDED : BudgetStatus.ACTIVE,
    });

    return await this.budgetRepository.save(budget);
  }

  /**
   * 计算已花费金额
   */
  private async calculateSpent(
    userId: string,
    currency: string,
    startDate: Date,
    endDate: Date,
    category?: string,
  ): Promise<number> {
    const payments = await this.paymentRepository.find({
      where: {
        userId,
        currency,
        status: PaymentStatus.COMPLETED,
        createdAt: Between(startDate, endDate),
      },
    });

    // 如果有分类，需要从metadata中过滤
    let filteredPayments = payments;
    if (category) {
      filteredPayments = payments.filter(p => 
        p.metadata?.category === category || p.metadata?.orderType === category
      );
    }

    return filteredPayments.reduce((sum, p) => sum + Number(p.amount), 0);
  }

  /**
   * 获取用户预算列表
   */
  async getUserBudgets(userId: string): Promise<Budget[]> {
    return await this.budgetRepository.find({
      where: { userId },
      order: { createdAt: 'DESC' },
    });
  }

  /**
   * 检查预算是否超支
   */
  async checkBudgetExceeded(userId: string, amount: number, currency: string): Promise<{
    exceeded: boolean;
    budgets: Budget[];
  }> {
    const budgets = await this.getUserBudgets(userId);
    const relevantBudgets = budgets.filter(
      b => b.currency === currency && b.status === 'active',
    );

    const exceededBudgets = relevantBudgets.filter(
      b => b.remaining < amount,
    );

    return {
      exceeded: exceededBudgets.length > 0,
      budgets: exceededBudgets,
    };
  }
}

