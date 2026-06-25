import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Policy, PolicyType } from '../../entities/policy.entity';
import { Payment } from '../../entities/payment.entity';
import { BudgetService } from './budget.service';

@Injectable()
export class PolicyEngineService {
  private readonly logger = new Logger(PolicyEngineService.name);

  constructor(
    @InjectRepository(Policy)
    private policyRepository: Repository<Policy>,
    private budgetService: BudgetService,
  ) {}

  /**
   * 获取用户的所有策略
   */
  async getUserPolicies(userId: string): Promise<Policy[]> {
    return this.policyRepository.find({
      where: { userId },
      order: { createdAt: 'ASC' },
    });
  }

  /**
   * 创建或更新策略
   */
  async upsertPolicy(userId: string, type: PolicyType, value: any, enabled: boolean = true): Promise<Policy> {
    let policy = await this.policyRepository.findOne({
      where: { userId, type },
    });

    if (policy) {
      policy.value = value;
      policy.enabled = enabled;
    } else {
      const name = this.getDefaultName(type);
      policy = this.policyRepository.create({
        userId,
        type,
        name,
        value,
        enabled,
      });
    }

    return this.policyRepository.save(policy);
  }

  /**
   * 验证交易是否符合策略
   */
  async validateTransaction(userId: string, payment: Partial<Payment>): Promise<{ allowed: boolean; reason?: string }> {
    const policies = await this.getUserPolicies(userId);
    const activePolicies = policies.filter(p => p.enabled);

    for (const policy of activePolicies) {
      switch (policy.type) {
        case PolicyType.SINGLE_LIMIT:
          if (payment.amount > policy.value) {
            return { allowed: false, reason: `Exceeds single transaction limit of ${policy.value} ${payment.currency}` };
          }
          break;

        case PolicyType.DAILY_LIMIT:
          // 这里需要结合 BudgetService 检查今日已用额度
          // 简化实现：假设 BudgetService 已经有相关逻辑
          const dailySpent = await this.budgetService.getDailySpent(userId, payment.currency || 'USDC');
          if (dailySpent + (payment.amount || 0) > policy.value) {
            return { allowed: false, reason: `Exceeds daily limit of ${policy.value} ${payment.currency}` };
          }
          break;

        case PolicyType.PROTOCOL_WHITELIST:
          const protocol = payment.metadata?.protocol;
          if (protocol && !policy.value.includes(protocol)) {
            return { allowed: false, reason: `Protocol ${protocol} is not in whitelist` };
          }
          break;
      }
    }

    return { allowed: true };
  }

  private getDefaultName(type: PolicyType): string {
    const names = {
      [PolicyType.DAILY_LIMIT]: 'Daily Transaction Limit',
      [PolicyType.SINGLE_LIMIT]: 'Single Transaction Limit',
      [PolicyType.PROTOCOL_WHITELIST]: 'Protocol Whitelist',
      [PolicyType.ACTION_WHITELIST]: 'Action Whitelist',
      [PolicyType.AUTO_CLAIM_AIRDROP]: 'Auto-claim Airdrops',
    };
    return names[type] || 'Custom Policy';
  }
}
