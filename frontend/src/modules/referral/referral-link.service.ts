import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { MerchantReferral } from '../../entities/merchant-referral.entity';
import { ReferralCommission } from '../../entities/referral-commission.entity';

export interface ReferralLink {
  id: string;
  agentId: string;
  merchantId?: string;
  link: string;
  shortLink?: string;
  clicks: number;
  conversions: number;
  createdAt: Date;
}

@Injectable()
export class ReferralLinkService {
  private readonly logger = new Logger(ReferralLinkService.name);

  constructor(
    @InjectRepository(MerchantReferral)
    private referralRepository: Repository<MerchantReferral>,
    @InjectRepository(ReferralCommission)
    private commissionRepository: Repository<ReferralCommission>,
  ) {}

  /**
   * 生成推广链接
   */
  async generateReferralLink(
    agentId: string,
    merchantId?: string,
  ): Promise<ReferralLink> {
    const linkId = `ref_${agentId}_${Date.now()}`;
    const baseUrl = process.env.FRONTEND_URL || 'https://agentrix.ai';
    const link = `${baseUrl}/ref/${linkId}${merchantId ? `?merchant=${merchantId}` : ''}`;

    const referralLink: ReferralLink = {
      id: linkId,
      agentId,
      merchantId,
      link,
      clicks: 0,
      conversions: 0,
      createdAt: new Date(),
    };

    this.logger.log(`生成推广链接: agentId=${agentId}, link=${link}`);
    return referralLink;
  }

  /**
   * 记录链接点击
   */
  async recordClick(linkId: string): Promise<void> {
    // 实际应该保存到数据库
    this.logger.log(`记录链接点击: linkId=${linkId}`);
  }

  /**
   * 获取链接统计
   */
  async getLinkStatistics(agentId: string): Promise<{
    totalLinks: number;
    totalClicks: number;
    totalConversions: number;
    conversionRate: number;
  }> {
    const referrals = await this.referralRepository.find({
      where: { agentId },
    });

    const commissions = await this.commissionRepository.find({
      where: { agentId },
    });

    const totalLinks = referrals.length;
    const totalClicks = 0; // 实际应该从数据库查询
    const totalConversions = commissions.length;
    const conversionRate = totalClicks > 0 ? (totalConversions / totalClicks) * 100 : 0;

    return {
      totalLinks,
      totalClicks,
      totalConversions,
      conversionRate: Math.round(conversionRate * 100) / 100,
    };
  }
}

