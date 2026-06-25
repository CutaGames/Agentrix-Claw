import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Like, Between } from 'typeorm';
import { MarketingCampaign, CampaignType, CampaignStatus } from '../../../entities/marketing-campaign.entity';
import { Coupon, CouponStatus, CouponType } from '../../../entities/coupon.entity';
import { CouponUsage } from '../../../entities/coupon-usage.entity';

@Injectable()
export class MarketingManagementService {
  constructor(
    @InjectRepository(MarketingCampaign)
    private campaignRepository: Repository<MarketingCampaign>,
    @InjectRepository(Coupon)
    private couponRepository: Repository<Coupon>,
    @InjectRepository(CouponUsage)
    private couponUsageRepository: Repository<CouponUsage>,
  ) {}

  // ========== 营销活动管理 ==========

  async getCampaigns(query: any) {
    const page = parseInt(query.page || '1');
    const limit = parseInt(query.limit || '20');
    const skip = (page - 1) * limit;

    const queryBuilder = this.campaignRepository.createQueryBuilder('campaign');

    if (query.merchantId) {
      queryBuilder.andWhere('campaign.merchantId = :merchantId', { merchantId: query.merchantId });
    }

    if (query.type) {
      queryBuilder.andWhere('campaign.type = :type', { type: query.type });
    }

    if (query.status) {
      queryBuilder.andWhere('campaign.status = :status', { status: query.status });
    }

    if (query.startDate && query.endDate) {
      queryBuilder.andWhere('campaign.createdAt BETWEEN :startDate AND :endDate', {
        startDate: query.startDate,
        endDate: query.endDate,
      });
    }

    queryBuilder.skip(skip).take(limit).orderBy('campaign.createdAt', 'DESC');

    const [campaigns, total] = await queryBuilder.getManyAndCount();

    return {
      data: campaigns,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async getCampaignById(id: string) {
    const campaign = await this.campaignRepository.findOne({
      where: { id },
    });

    if (!campaign) {
      throw new NotFoundException('营销活动不存在');
    }

    return campaign;
  }

  async createCampaign(dto: any) {
    const campaign = this.campaignRepository.create({
      merchantId: dto.merchantId,
      type: dto.type,
      targetUsers: dto.targetUsers || [],
      message: dto.message,
      couponId: dto.couponId,
      scheduledAt: dto.scheduledAt ? new Date(dto.scheduledAt) : undefined,
      status: CampaignStatus.PENDING,
      metadata: dto.metadata,
    });

    return await this.campaignRepository.save(campaign);
  }

  async updateCampaign(id: string, dto: any) {
    const campaign = await this.campaignRepository.findOne({ where: { id } });
    if (!campaign) {
      throw new NotFoundException('营销活动不存在');
    }

    if (dto.status) {
      campaign.status = dto.status;
      if (dto.status === CampaignStatus.SENT) {
        campaign.sentAt = new Date();
      }
    }

    if (dto.message) {
      campaign.message = dto.message;
    }

    if (dto.scheduledAt) {
      campaign.scheduledAt = new Date(dto.scheduledAt);
    }

    return await this.campaignRepository.save(campaign);
  }

  async getCampaignStatistics() {
    const [total, byType, byStatus] = await Promise.all([
      this.campaignRepository.count(),
      this.campaignRepository
        .createQueryBuilder('campaign')
        .select('campaign.type', 'type')
        .addSelect('COUNT(*)', 'count')
        .groupBy('campaign.type')
        .getRawMany(),
      this.campaignRepository
        .createQueryBuilder('campaign')
        .select('campaign.status', 'status')
        .addSelect('COUNT(*)', 'count')
        .groupBy('campaign.status')
        .getRawMany(),
    ]);

    return {
      total,
      byType: byType.reduce((acc, item) => {
        acc[item.type] = parseInt(item.count);
        return acc;
      }, {} as Record<string, number>),
      byStatus: byStatus.reduce((acc, item) => {
        acc[item.status] = parseInt(item.count);
        return acc;
      }, {} as Record<string, number>),
    };
  }

  // ========== 优惠券管理 ==========

  async getCoupons(query: any) {
    const page = parseInt(query.page || '1');
    const limit = parseInt(query.limit || '20');
    const skip = (page - 1) * limit;

    const queryBuilder = this.couponRepository.createQueryBuilder('coupon');

    if (query.merchantId) {
      queryBuilder.andWhere('coupon.merchantId = :merchantId', { merchantId: query.merchantId });
    }

    if (query.status) {
      queryBuilder.andWhere('coupon.status = :status', { status: query.status });
    }

    if (query.type) {
      queryBuilder.andWhere('coupon.type = :type', { type: query.type });
    }

    if (query.search) {
      queryBuilder.andWhere(
        '(coupon.name LIKE :search OR coupon.code LIKE :search)',
        { search: `%${query.search}%` },
      );
    }

    queryBuilder.skip(skip).take(limit).orderBy('coupon.createdAt', 'DESC');

    const [coupons, total] = await queryBuilder.getManyAndCount();

    return {
      data: coupons,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async getCouponById(id: string) {
    const coupon = await this.couponRepository.findOne({
      where: { id },
    });

    if (!coupon) {
      throw new NotFoundException('优惠券不存在');
    }

    // 获取使用统计
    const usageCount = await this.couponUsageRepository.count({
      where: { couponId: id },
    });

    return {
      ...coupon,
      usageCount,
    };
  }

  async createCoupon(dto: any) {
    const coupon = this.couponRepository.create({
      merchantId: dto.merchantId,
      code: dto.code,
      name: dto.name,
      description: dto.description,
      type: dto.type,
      value: dto.value,
      minPurchaseAmount: dto.minPurchaseAmount,
      maxDiscountAmount: dto.maxDiscountAmount,
      validFrom: dto.validFrom ? new Date(dto.validFrom) : undefined,
      validUntil: dto.validUntil ? new Date(dto.validUntil) : undefined,
      usageLimit: dto.usageLimit || 0,
      applicableProducts: dto.applicableProducts,
      applicableCategories: dto.applicableCategories,
      status: CouponStatus.ACTIVE,
      metadata: dto.metadata,
    });

    return await this.couponRepository.save(coupon);
  }

  async updateCoupon(id: string, dto: any) {
    const coupon = await this.couponRepository.findOne({ where: { id } });
    if (!coupon) {
      throw new NotFoundException('优惠券不存在');
    }

    if (dto.status) {
      coupon.status = dto.status;
    }

    if (dto.name) {
      coupon.name = dto.name;
    }

    if (dto.description !== undefined) {
      coupon.description = dto.description;
    }

    return await this.couponRepository.save(coupon);
  }

  async getCouponStatistics() {
    const [total, active, expired, byType] = await Promise.all([
      this.couponRepository.count(),
      this.couponRepository.count({ where: { status: CouponStatus.ACTIVE } }),
      this.couponRepository.count({ where: { status: CouponStatus.EXPIRED } }),
      this.couponRepository
        .createQueryBuilder('coupon')
        .select('coupon.type', 'type')
        .addSelect('COUNT(*)', 'count')
        .groupBy('coupon.type')
        .getRawMany(),
    ]);

    // 获取总使用次数
    const totalUsage = await this.couponUsageRepository
      .createQueryBuilder('usage')
      .select('COUNT(*)', 'count')
      .getRawOne();

    return {
      total,
      active,
      expired,
      totalUsage: parseInt(totalUsage?.count || '0'),
      byType: byType.reduce((acc, item) => {
        acc[item.type] = parseInt(item.count);
        return acc;
      }, {} as Record<string, number>),
    };
  }
}

