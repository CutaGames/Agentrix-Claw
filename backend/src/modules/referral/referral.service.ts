import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { MerchantReferral, ReferralStatus } from '../../entities/merchant-referral.entity';
import { ReferralCommission, CommissionStatus } from '../../entities/referral-commission.entity';
import { Payment, PaymentStatus } from '../../entities/payment.entity';

export interface CreateReferralDto {
  agentId: string;
  merchantId: string;
  merchantName?: string;
  merchantEmail?: string;
  metadata?: Record<string, any>;
}

export interface UpdateReferralStatusDto {
  status: ReferralStatus;
  oneTimeReward?: number;
}

@Injectable()
export class ReferralService {
  private readonly logger = new Logger(ReferralService.name);

  constructor(
    @InjectRepository(MerchantReferral)
    private referralRepository: Repository<MerchantReferral>,
    @InjectRepository(ReferralCommission)
    private commissionRepository: Repository<ReferralCommission>,
    @InjectRepository(Payment)
    private paymentRepository: Repository<Payment>,
  ) {}

  /**
   * 创建推广关系
   */
  async createReferral(dto: CreateReferralDto): Promise<MerchantReferral> {
    // 检查是否已存在推广关系
    const existing = await this.referralRepository.findOne({
      where: {
        agentId: dto.agentId,
        merchantId: dto.merchantId,
      },
    });

    if (existing) {
      throw new BadRequestException('推广关系已存在');
    }

    const referral = this.referralRepository.create({
      agentId: dto.agentId,
      merchantId: dto.merchantId,
      merchantName: dto.merchantName,
      merchantEmail: dto.merchantEmail,
      status: ReferralStatus.PENDING,
      commissionRate: 0.005, // 默认0.5%
      metadata: dto.metadata,
    });

    return this.referralRepository.save(referral);
  }

  /**
   * 获取Agent的所有推广关系
   */
  async getAgentReferrals(agentId: string): Promise<MerchantReferral[]> {
    return this.referralRepository.find({
      where: { agentId },
      order: { createdAt: 'DESC' },
    });
  }

  /**
   * 获取推广关系详情
   */
  async getReferral(referralId: string): Promise<MerchantReferral> {
    const referral = await this.referralRepository.findOne({
      where: { id: referralId },
    });

    if (!referral) {
      throw new NotFoundException('推广关系不存在');
    }

    return referral;
  }

  /**
   * 更新推广关系状态（审核）
   */
  async updateReferralStatus(
    referralId: string,
    dto: UpdateReferralStatusDto,
  ): Promise<MerchantReferral> {
    const referral = await this.getReferral(referralId);

    referral.status = dto.status;

    // 如果审核通过且设置了一次性奖励，记录奖励金额
    if (dto.status === ReferralStatus.APPROVED && dto.oneTimeReward) {
      referral.oneTimeReward = dto.oneTimeReward;
    }

    // 如果状态变为ACTIVE，标记一次性奖励已支付
    if (dto.status === ReferralStatus.ACTIVE && referral.oneTimeReward && !referral.oneTimeRewardPaidAt) {
      referral.oneTimeRewardPaidAt = new Date();
    }

    return this.referralRepository.save(referral);
  }

  /**
   * 记录支付并计算分成（在支付成功后调用）
   */
  async recordPaymentCommission(
    paymentId: string,
    payment: Payment,
  ): Promise<ReferralCommission | null> {
    // 查找该商户的活跃推广关系
    const referral = await this.referralRepository.findOne({
      where: {
        merchantId: payment.merchantId,
        status: ReferralStatus.ACTIVE,
      },
    });

    if (!referral) {
      // 没有推广关系，不计算分成
      return null;
    }

    // 检查是否已记录过该支付的分成
    const existing = await this.commissionRepository.findOne({
      where: {
        referralId: referral.id,
        paymentId,
      },
    });

    if (existing) {
      return existing;
    }

    // 计算分成金额
    const commissionAmount = Number(payment.amount) * referral.commissionRate;

    // 创建分成记录
    const commission = this.commissionRepository.create({
      referralId: referral.id,
      agentId: referral.agentId,
      merchantId: referral.merchantId,
      paymentId,
      paymentAmount: Number(payment.amount),
      currency: payment.currency,
      commissionRate: referral.commissionRate,
      commissionAmount,
      status: CommissionStatus.PENDING,
    });

    const savedCommission = await this.commissionRepository.save(commission);

    // 更新推广关系的累计数据
    referral.totalCommissionEarned = Number(referral.totalCommissionEarned) + commissionAmount;
    referral.totalMerchantGMV = Number(referral.totalMerchantGMV) + Number(payment.amount);
    await this.referralRepository.save(referral);

    this.logger.log(
      `记录推广分成: Agent ${referral.agentId}, 商户 ${referral.merchantId}, 金额 ${commissionAmount} ${payment.currency}`,
    );

    return savedCommission;
  }

  /**
   * 获取Agent的推广统计
   */
  async getAgentReferralStats(agentId: string): Promise<{
    totalReferrals: number;
    activeReferrals: number;
    totalCommissionEarned: number;
    totalMerchantGMV: number;
    pendingCommissions: number;
  }> {
    const referrals = await this.getAgentReferrals(agentId);

    const activeReferrals = referrals.filter(r => r.status === ReferralStatus.ACTIVE);

    const totalCommissionEarned = referrals.reduce(
      (sum, r) => sum + Number(r.totalCommissionEarned),
      0,
    );

    const totalMerchantGMV = referrals.reduce(
      (sum, r) => sum + Number(r.totalMerchantGMV),
      0,
    );

    // 获取待结算的分成
    const pendingCommissions = await this.commissionRepository
      .createQueryBuilder('commission')
      .where('commission.agentId = :agentId', { agentId })
      .andWhere('commission.status = :status', { status: CommissionStatus.PENDING })
      .select('SUM(commission.commissionAmount)', 'total')
      .getRawOne();

    return {
      totalReferrals: referrals.length,
      activeReferrals: activeReferrals.length,
      totalCommissionEarned,
      totalMerchantGMV,
      pendingCommissions: Number(pendingCommissions?.total || 0),
    };
  }

  /**
   * 获取推广关系的分成记录
   */
  async getReferralCommissions(
    referralId: string,
    status?: CommissionStatus,
  ): Promise<ReferralCommission[]> {
    const query = this.commissionRepository
      .createQueryBuilder('commission')
      .where('commission.referralId = :referralId', { referralId })
      .orderBy('commission.createdAt', 'DESC');

    if (status) {
      query.andWhere('commission.status = :status', { status });
    }

    return query.getMany();
  }
}

