import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Like, Between } from 'typeorm';
import { User } from '../../../entities/user.entity';
import { MerchantReferral } from '../../../entities/merchant-referral.entity';
import { ReferralCommission } from '../../../entities/referral-commission.entity';

@Injectable()
export class PromoterManagementService {
  constructor(
    @InjectRepository(User)
    private userRepository: Repository<User>,
    @InjectRepository(MerchantReferral)
    private referralRepository: Repository<MerchantReferral>,
    @InjectRepository(ReferralCommission)
    private commissionRepository: Repository<ReferralCommission>,
  ) {}

  async getPromoters(query: any) {
    const page = parseInt(query.page || '1');
    const limit = parseInt(query.limit || '20');
    const skip = (page - 1) * limit;

    // 获取所有有推广关系的用户
    const referrals = await this.referralRepository
      .createQueryBuilder('referral')
      .select('DISTINCT referral.agentId', 'agentId')
      .getRawMany();

    const agentIds = referrals.map((r) => r.agentId);

    const queryBuilder = this.userRepository
      .createQueryBuilder('user')
      .where('user.id IN (:...agentIds)', { agentIds: agentIds.length > 0 ? agentIds : [''] });

    if (query.search) {
      queryBuilder.andWhere(
        '(user.email LIKE :search OR user.agentrixId LIKE :search OR user.nickname LIKE :search)',
        { search: `%${query.search}%` },
      );
    }

    queryBuilder.skip(skip).take(limit).orderBy('user.createdAt', 'DESC');

    const [promoters, total] = await queryBuilder.getManyAndCount();

    // 获取每个推广者的统计信息
    const promotersWithStats = await Promise.all(
      promoters.map(async (promoter) => {
        const [referralCount, totalCommission] = await Promise.all([
          this.referralRepository.count({ where: { agentId: promoter.id } }),
          this.commissionRepository
            .createQueryBuilder('commission')
            .select('SUM(commission.commissionAmount)', 'total')
            .where('commission.agentId = :agentId', { agentId: promoter.id })
            .andWhere('commission.status = :status', { status: 'settled' })
            .getRawOne(),
        ]);

        return {
          ...promoter,
          stats: {
            referralCount,
            totalCommission: totalCommission?.total || 0,
          },
        };
      }),
    );

    return {
      data: promotersWithStats,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async getPromoterById(id: string) {
    const promoter = await this.userRepository.findOne({
      where: { id },
    });

    if (!promoter) {
      throw new NotFoundException('推广者不存在');
    }

    // 获取推广关系
    const referrals = await this.referralRepository.find({
      where: { agentId: id },
      order: { createdAt: 'DESC' },
    });

    // 获取收益统计
    const [totalCommission, todayCommission, pendingCommission] = await Promise.all([
      this.commissionRepository
        .createQueryBuilder('commission')
        .select('SUM(commission.commissionAmount)', 'total')
        .where('commission.agentId = :agentId', { agentId: id })
        .andWhere('commission.status = :status', { status: 'settled' })
        .getRawOne(),
      this.commissionRepository
        .createQueryBuilder('commission')
        .select('SUM(commission.commissionAmount)', 'total')
        .where('commission.agentId = :agentId', { agentId: id })
        .andWhere('commission.status = :status', { status: 'settled' })
        .andWhere('DATE(commission.createdAt) = DATE(:today)', {
          today: new Date(),
        })
        .getRawOne(),
      this.commissionRepository
        .createQueryBuilder('commission')
        .select('SUM(commission.commissionAmount)', 'total')
        .where('commission.agentId = :agentId', { agentId: id })
        .andWhere('commission.status = :status', { status: 'pending' })
        .getRawOne(),
    ]);

    // 获取最近30天分成记录
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const recentCommissions = await this.commissionRepository.find({
      where: {
        agentId: id,
        createdAt: Between(thirtyDaysAgo, new Date()),
      },
      order: { createdAt: 'DESC' },
      take: 30,
    });

    return {
      ...promoter,
      referrals,
      stats: {
        totalCommission: totalCommission?.total || 0,
        todayCommission: todayCommission?.total || 0,
        pendingCommission: pendingCommission?.total || 0,
        referralCount: referrals.length,
      },
      recentCommissions,
    };
  }

  async getPromoterReferrals(promoterId: string, query: any) {
    const page = parseInt(query.page || '1');
    const limit = parseInt(query.limit || '20');
    const skip = (page - 1) * limit;

    const where: any = { agentId: promoterId };

    if (query.status) {
      where.status = query.status;
    }

    const [referrals, total] = await this.referralRepository.findAndCount({
      where,
      skip,
      take: limit,
      order: { createdAt: 'DESC' },
    });

    return {
      data: referrals,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async getPromoterCommissions(promoterId: string, query: any) {
    const page = parseInt(query.page || '1');
    const limit = parseInt(query.limit || '20');
    const skip = (page - 1) * limit;

    const where: any = { agentId: promoterId };

    if (query.status) {
      where.status = query.status;
    }

    if (query.startDate && query.endDate) {
      where.createdAt = Between(new Date(query.startDate), new Date(query.endDate));
    }

    const [commissions, total] = await this.commissionRepository.findAndCount({
      where,
      skip,
      take: limit,
      order: { createdAt: 'DESC' },
    });

    return {
      data: commissions,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }
}

