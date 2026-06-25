import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { QuickPayGrant, QuickPayGrantStatus } from '../../entities/quick-pay-grant.entity';

export interface CreateQuickPayGrantDto {
  paymentMethod: {
    type: string;
    methodId?: string;
    details?: any;
  };
  permissions: {
    maxAmount?: number;
    maxDailyAmount?: number;
    maxTransactions?: number;
    allowedMerchants?: string[];
    allowedCategories?: string[];
  };
  description?: string;
  expiresIn?: number; // 过期时间（秒）
}

@Injectable()
export class QuickPayGrantService {
  private readonly logger = new Logger(QuickPayGrantService.name);

  constructor(
    @InjectRepository(QuickPayGrant)
    private grantRepository: Repository<QuickPayGrant>,
  ) {}

  /**
   * 创建QuickPay授权（V3.0：快速支付授权）
   */
  async createGrant(userId: string, dto: CreateQuickPayGrantDto): Promise<QuickPayGrant> {
    const expiresAt = dto.expiresIn
      ? new Date(Date.now() + dto.expiresIn * 1000)
      : null;

    const grant = this.grantRepository.create({
      userId,
      paymentMethod: dto.paymentMethod,
      permissions: dto.permissions,
      description: dto.description,
      expiresAt,
      status: QuickPayGrantStatus.ACTIVE,
      usage: {
        totalAmount: 0,
        dailyAmount: 0,
        transactionCount: 0,
        lastResetDate: new Date(),
      },
    });

    const savedGrant = await this.grantRepository.save(grant);

    this.logger.log(`创建QuickPay授权: id=${savedGrant.id}, userId=${userId}`);

    return savedGrant;
  }

  /**
   * 获取授权
   */
  async getGrant(grantId: string, userId: string): Promise<QuickPayGrant | null> {
    const grant = await this.grantRepository.findOne({
      where: { id: grantId, userId },
    });

    if (!grant) {
      return null;
    }

    // 检查是否过期
    if (grant.expiresAt && grant.expiresAt < new Date()) {
      grant.status = QuickPayGrantStatus.EXPIRED;
      await this.grantRepository.save(grant);
      return null;
    }

    // 重置每日使用量（如果跨天）
    await this.resetDailyUsageIfNeeded(grant);

    return grant;
  }

  /**
   * 验证授权（检查限额等）
   */
  async validateGrant(
    grant: QuickPayGrant,
    amount: number,
    merchantId?: string,
  ): Promise<{ valid: boolean; reason?: string }> {
    if (grant.status !== QuickPayGrantStatus.ACTIVE) {
      return { valid: false, reason: '授权已失效' };
    }

    if (grant.expiresAt && grant.expiresAt < new Date()) {
      return { valid: false, reason: '授权已过期' };
    }

    // 检查单笔限额
    if (grant.permissions.maxAmount && amount > grant.permissions.maxAmount) {
      return {
        valid: false,
        reason: `单笔金额超过限额（${grant.permissions.maxAmount}）`,
      };
    }

    // 检查每日限额
    if (grant.permissions.maxDailyAmount) {
      await this.resetDailyUsageIfNeeded(grant);
      if (grant.usage.dailyAmount + amount > grant.permissions.maxDailyAmount) {
        return {
          valid: false,
          reason: `每日金额超过限额（${grant.permissions.maxDailyAmount}）`,
        };
      }
    }

    // 检查每日交易次数
    if (grant.permissions.maxTransactions) {
      await this.resetDailyUsageIfNeeded(grant);
      if (grant.usage.transactionCount >= grant.permissions.maxTransactions) {
        return {
          valid: false,
          reason: `每日交易次数超过限额（${grant.permissions.maxTransactions}）`,
        };
      }
    }

    // 检查允许的商户
    if (grant.permissions.allowedMerchants && grant.permissions.allowedMerchants.length > 0) {
      if (merchantId && !grant.permissions.allowedMerchants.includes(merchantId)) {
        return { valid: false, reason: '商户不在授权范围内' };
      }
    }

    return { valid: true };
  }

  /**
   * 记录使用量
   */
  async recordUsage(grantId: string, amount: number): Promise<void> {
    const grant = await this.grantRepository.findOne({
      where: { id: grantId },
    });

    if (!grant) {
      return;
    }

    await this.resetDailyUsageIfNeeded(grant);

    grant.usage.totalAmount += amount;
    grant.usage.dailyAmount += amount;
    grant.usage.transactionCount += 1;

    await this.grantRepository.save(grant);
  }

  /**
   * 撤销授权
   */
  async revokeGrant(grantId: string, userId: string): Promise<QuickPayGrant> {
    const grant = await this.grantRepository.findOne({
      where: { id: grantId, userId },
    });

    if (!grant) {
      throw new NotFoundException('授权不存在');
    }

    grant.status = QuickPayGrantStatus.REVOKED;
    grant.revokedAt = new Date();

    return this.grantRepository.save(grant);
  }

  /**
   * 获取用户的授权列表
   */
  async getUserGrants(userId: string): Promise<QuickPayGrant[]> {
    return this.grantRepository.find({
      where: { userId, status: QuickPayGrantStatus.ACTIVE },
      order: { createdAt: 'DESC' },
    });
  }

  /**
   * 重置每日使用量（如果需要）
   */
  private async resetDailyUsageIfNeeded(grant: QuickPayGrant): Promise<void> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const lastReset = new Date(grant.usage.lastResetDate);
    lastReset.setHours(0, 0, 0, 0);

    if (today > lastReset) {
      grant.usage.dailyAmount = 0;
      grant.usage.transactionCount = 0;
      grant.usage.lastResetDate = new Date();
      await this.grantRepository.save(grant);
    }
  }
}

