import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between } from 'typeorm';
import {
  HumanCommission,
  HumanCommissionStatus,
  HumanCommissionType,
} from '../../entities/human-commission.entity';
import { HumanReferralChain } from '../../entities/human-referral-chain.entity';

/**
 * 佣金费率配置
 */
const COMMISSION_RATES = {
  skill_purchase: { platformFeeRate: 0.05, promoterShareRate: 0.20 },
  product_purchase: { platformFeeRate: 0.04, promoterShareRate: 0.20 },
  user_referral: { platformFeeRate: 0.03, promoterShareRate: 0.20 },
};

@Injectable()
export class HumanCommissionService {
  private readonly logger = new Logger(HumanCommissionService.name);

  constructor(
    @InjectRepository(HumanCommission)
    private commissionRepository: Repository<HumanCommission>,
    @InjectRepository(HumanReferralChain)
    private referralChainRepository: Repository<HumanReferralChain>,
  ) {}

  // ========== 推荐链管理 ==========

  /**
   * 记录推荐关系
   */
  async recordReferral(
    referrerId: string,
    referredId: string,
    referralLinkId?: string,
  ): Promise<HumanReferralChain> {
    // 不能自己推荐自己
    if (referrerId === referredId) return null;

    // 检查是否已存在
    const existing = await this.referralChainRepository.findOne({
      where: { referrerId, referredId },
    });
    if (existing) return existing;

    const chain = this.referralChainRepository.create({
      referrerId,
      referredId,
      level: 1,
      referralLinkId,
      isActive: true,
    });

    const saved = await this.referralChainRepository.save(chain);
    this.logger.log(`Referral recorded: ${referrerId} → ${referredId}`);

    // 检查二级推荐链（referrer 的 referrer）
    const parentChain = await this.referralChainRepository.findOne({
      where: { referredId: referrerId, level: 1, isActive: true },
    });
    if (parentChain) {
      const level2Existing = await this.referralChainRepository.findOne({
        where: { referrerId: parentChain.referrerId, referredId },
      });
      if (!level2Existing && parentChain.referrerId !== referredId) {
        await this.referralChainRepository.save(
          this.referralChainRepository.create({
            referrerId: parentChain.referrerId,
            referredId,
            level: 2,
            referralLinkId,
            isActive: true,
          }),
        );
        this.logger.log(`Level-2 referral: ${parentChain.referrerId} → ${referredId}`);
      }
    }

    return saved;
  }

  /**
   * 获取用户的推荐人列表（谁推荐了这个用户）
   */
  async getReferrers(userId: string): Promise<HumanReferralChain[]> {
    return this.referralChainRepository.find({
      where: { referredId: userId, isActive: true },
      relations: ['referrer'],
      order: { level: 'ASC' },
    });
  }

  /**
   * 获取用户推荐的人列表
   */
  async getReferredUsers(userId: string): Promise<HumanReferralChain[]> {
    return this.referralChainRepository.find({
      where: { referrerId: userId, isActive: true },
      relations: ['referred'],
      order: { createdAt: 'DESC' },
    });
  }

  // ========== 佣金计算与记录 ==========

  /**
   * 订单完成后计算并记录推广佣金
   */
  async calculateCommissionForOrder(params: {
    orderId: string;
    buyerId: string;
    skillId?: string;
    skillName?: string;
    orderAmount: number;
    currency?: string;
    type?: HumanCommissionType;
    referralLinkId?: string;
  }): Promise<HumanCommission[]> {
    const commissions: HumanCommission[] = [];
    const type = params.type || HumanCommissionType.SKILL_PURCHASE;
    const rates = COMMISSION_RATES[type] || COMMISSION_RATES.skill_purchase;
    const platformFee = params.orderAmount * rates.platformFeeRate;
    const promoterCommission = platformFee * rates.promoterShareRate;

    // 查找买家的推荐链
    const referrers = await this.getReferrers(params.buyerId);

    for (const chain of referrers) {
      // 一级推荐: 100% 推广佣金
      // 二级推荐: 30% 推广佣金
      const shareRatio = chain.level === 1 ? 1.0 : 0.3;
      const amount = promoterCommission * shareRatio;

      if (amount <= 0) continue;

      const commission = this.commissionRepository.create({
        promoterId: chain.referrerId,
        buyerId: params.buyerId,
        orderId: params.orderId,
        skillId: params.skillId,
        skillName: params.skillName,
        type,
        orderAmount: params.orderAmount,
        commissionAmount: amount,
        commissionRate: rates.platformFeeRate * rates.promoterShareRate * shareRatio * 100,
        currency: params.currency || 'USD',
        status: HumanCommissionStatus.PENDING,
        referralLinkId: params.referralLinkId || chain.referralLinkId,
        metadata: {
          level: chain.level,
          platformFeeRate: rates.platformFeeRate,
          promoterShareRate: rates.promoterShareRate,
          shareRatio,
        },
      });

      commissions.push(await this.commissionRepository.save(commission));
    }

    // 如果有推广链接但没有推荐链关系（直接通过链接购买）
    if (commissions.length === 0 && params.referralLinkId) {
      // 通过 referralLinkId 查找推广者（需要从 referral 模块获取）
      this.logger.warn(`No referral chain found for buyer ${params.buyerId}, link: ${params.referralLinkId}`);
    }

    if (commissions.length > 0) {
      this.logger.log(`Created ${commissions.length} human commissions for order ${params.orderId}`);
    }

    return commissions;
  }

  // ========== 佣金查询 ==========

  /**
   * 获取推广者的佣金列表
   */
  async getMyCommissions(
    promoterId: string,
    params?: { status?: HumanCommissionStatus; page?: number; limit?: number },
  ) {
    const page = params?.page || 1;
    const limit = params?.limit || 20;
    const where: any = { promoterId };
    if (params?.status) where.status = params.status;

    const [items, total] = await this.commissionRepository.findAndCount({
      where,
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });

    return { items, total, page, totalPages: Math.ceil(total / limit) };
  }

  /**
   * 获取推广者的佣金统计
   */
  async getCommissionStats(promoterId: string) {
    // 总佣金
    const totalResult = await this.commissionRepository
      .createQueryBuilder('c')
      .select('SUM(c.commissionAmount)', 'total')
      .addSelect('COUNT(*)', 'count')
      .where('c.promoterId = :promoterId', { promoterId })
      .andWhere('c.status != :cancelled', { cancelled: HumanCommissionStatus.CANCELLED })
      .getRawOne();

    // 已结算佣金
    const settledResult = await this.commissionRepository
      .createQueryBuilder('c')
      .select('SUM(c.commissionAmount)', 'total')
      .where('c.promoterId = :promoterId', { promoterId })
      .andWhere('c.status = :status', { status: HumanCommissionStatus.SETTLED })
      .getRawOne();

    // 待结算佣金
    const pendingResult = await this.commissionRepository
      .createQueryBuilder('c')
      .select('SUM(c.commissionAmount)', 'total')
      .where('c.promoterId = :promoterId', { promoterId })
      .andWhere('c.status IN (:...statuses)', {
        statuses: [HumanCommissionStatus.PENDING, HumanCommissionStatus.CONFIRMED],
      })
      .getRawOne();

    // 今日佣金
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayResult = await this.commissionRepository
      .createQueryBuilder('c')
      .select('SUM(c.commissionAmount)', 'total')
      .addSelect('COUNT(*)', 'count')
      .where('c.promoterId = :promoterId', { promoterId })
      .andWhere('c.createdAt >= :today', { today })
      .andWhere('c.status != :cancelled', { cancelled: HumanCommissionStatus.CANCELLED })
      .getRawOne();

    // 推荐人数
    const referralCount = await this.referralChainRepository.count({
      where: { referrerId: promoterId, level: 1, isActive: true },
    });

    return {
      totalCommission: parseFloat(totalResult?.total || '0'),
      totalOrders: parseInt(totalResult?.count || '0'),
      settledCommission: parseFloat(settledResult?.total || '0'),
      pendingCommission: parseFloat(pendingResult?.total || '0'),
      todayCommission: parseFloat(todayResult?.total || '0'),
      todayOrders: parseInt(todayResult?.count || '0'),
      referralCount,
    };
  }

  /**
   * 确认佣金（订单确认收货后）
   */
  async confirmCommissions(orderId: string) {
    await this.commissionRepository.update(
      { orderId, status: HumanCommissionStatus.PENDING },
      { status: HumanCommissionStatus.CONFIRMED },
    );
  }

  /**
   * 结算佣金
   */
  async settleCommissions(promoterId: string): Promise<{ settledCount: number; totalAmount: number }> {
    const pendingCommissions = await this.commissionRepository.find({
      where: { promoterId, status: HumanCommissionStatus.CONFIRMED },
    });

    if (pendingCommissions.length === 0) {
      return { settledCount: 0, totalAmount: 0 };
    }

    let totalAmount = 0;
    for (const c of pendingCommissions) {
      c.status = HumanCommissionStatus.SETTLED;
      c.settledAt = new Date();
      totalAmount += Number(c.commissionAmount);
    }

    await this.commissionRepository.save(pendingCommissions);

    return { settledCount: pendingCommissions.length, totalAmount };
  }
}
