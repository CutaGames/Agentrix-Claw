import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AutoPayGrant } from '../../entities/auto-pay-grant.entity';

export interface X402Authorization {
  id: string;
  userId: string;
  isActive: boolean;
  singleLimit: number;
  dailyLimit: number;
  usedToday: number;
  expiresAt: Date;
  createdAt: Date;
}

@Injectable()
export class X402AuthorizationService {
  private readonly logger = new Logger(X402AuthorizationService.name);

  constructor(
    @InjectRepository(AutoPayGrant)
    private grantRepository: Repository<AutoPayGrant>,
  ) {}

  /**
   * 检查用户是否有X402授权
   */
  async checkAuthorization(userId: string): Promise<X402Authorization | null> {
    const grant = await this.grantRepository.findOne({
      where: {
        userId,
        isActive: true,
        agentId: 'x402_system', // X402系统授权使用特殊agentId
      },
      order: { createdAt: 'DESC' },
    });

    if (!grant) {
      return null;
    }

    // 检查是否过期
    if (new Date() > grant.expiresAt) {
      grant.isActive = false;
      await this.grantRepository.save(grant);
      return null;
    }

    return {
      id: grant.id,
      userId: grant.userId,
      isActive: grant.isActive,
      singleLimit: Number(grant.singleLimit),
      dailyLimit: Number(grant.dailyLimit),
      usedToday: Number(grant.usedToday),
      expiresAt: grant.expiresAt,
      createdAt: grant.createdAt,
    };
  }

  /**
   * 创建X402授权
   */
  async createAuthorization(
    userId: string,
    singleLimit: number,
    dailyLimit: number,
    durationDays: number = 30,
  ): Promise<X402Authorization> {
    const grant = this.grantRepository.create({
      userId,
      agentId: 'x402_system', // X402系统授权
      singleLimit,
      dailyLimit,
      expiresAt: new Date(Date.now() + durationDays * 24 * 60 * 60 * 1000),
      isActive: true,
    });

    const saved = await this.grantRepository.save(grant);

    return {
      id: saved.id,
      userId: saved.userId,
      isActive: saved.isActive,
      singleLimit: Number(saved.singleLimit),
      dailyLimit: Number(saved.dailyLimit),
      usedToday: Number(saved.usedToday),
      expiresAt: saved.expiresAt,
      createdAt: saved.createdAt,
    };
  }

  /**
   * 记录X402授权使用量
   */
  async recordUsage(authId: string, amount: number): Promise<void> {
    const grant = await this.grantRepository.findOne({
      where: { id: authId },
    });

    if (!grant) {
      this.logger.warn(`X402授权不存在: ${authId}`);
      return;
    }

    // 重置每日使用量（如果需要）
    await this.resetDailyUsageIfNeeded(grant);

    grant.usedToday = (Number(grant.usedToday) || 0) + amount;
    grant.totalUsed = (Number(grant.totalUsed) || 0) + amount;

    await this.grantRepository.save(grant);
  }

  /**
   * 重置每日使用量（如果需要）
   */
  private async resetDailyUsageIfNeeded(grant: AutoPayGrant): Promise<void> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const lastReset = new Date(grant.createdAt);
    lastReset.setHours(0, 0, 0, 0);

    // 如果今天不是创建日期，重置使用量
    if (today > lastReset) {
      grant.usedToday = 0;
      await this.grantRepository.save(grant);
    }
  }
}

