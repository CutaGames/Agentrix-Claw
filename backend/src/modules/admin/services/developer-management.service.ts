import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Like, Between } from 'typeorm';
import { User, UserRole } from '../../../entities/user.entity';
import { UserAgent } from '../../../entities/user-agent.entity';
import { Commission, PayeeType } from '../../../entities/commission.entity';

@Injectable()
export class DeveloperManagementService {
  constructor(
    @InjectRepository(User)
    private userRepository: Repository<User>,
    @InjectRepository(UserAgent)
    private agentRepository: Repository<UserAgent>,
    @InjectRepository(Commission)
    private commissionRepository: Repository<Commission>,
  ) {}

  async getDevelopers(query: any) {
    const page = parseInt(query.page || '1');
    const limit = parseInt(query.limit || '20');
    const skip = (page - 1) * limit;

    const queryBuilder = this.userRepository
      .createQueryBuilder('user')
      .where("user.roles @> '[\"agent\"]'::jsonb");

    if (query.search) {
      queryBuilder.andWhere(
        '(user.email LIKE :search OR user.agentrixId LIKE :search OR user.nickname LIKE :search)',
        { search: `%${query.search}%` },
      );
    }

    queryBuilder.skip(skip).take(limit).orderBy('user.createdAt', 'DESC');

    const [developers, total] = await queryBuilder.getManyAndCount();

    // 获取每个开发者的统计信息
    const developersWithStats = await Promise.all(
      developers.map(async (developer) => {
        const [agentCount, totalRevenue] = await Promise.all([
          this.agentRepository.count({ where: { userId: developer.id } }),
          this.commissionRepository
            .createQueryBuilder('commission')
            .select('SUM(commission.amount)', 'total')
            .where('commission.payeeId = :developerId', { developerId: developer.id })
            .andWhere('commission.payeeType = :type', { type: 'agent' })
            .andWhere('commission.status = :status', { status: 'settled' })
            .getRawOne(),
        ]);

        return {
          ...developer,
          stats: {
            agentCount,
            totalRevenue: totalRevenue?.total || 0,
          },
        };
      }),
    );

    return {
      data: developersWithStats,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async getDeveloperById(id: string) {
    const developer = await this.userRepository
      .createQueryBuilder('user')
      .where('user.id = :id', { id })
      .andWhere("user.roles @> '[\"agent\"]'::jsonb")
      .getOne();

    if (!developer) {
      throw new NotFoundException('开发者不存在');
    }

    // 获取Agent列表
    const agents = await this.agentRepository.find({
      where: { userId: id },
      order: { createdAt: 'DESC' },
    });

    // 获取收益统计
    const [totalRevenue, todayRevenue, pendingRevenue] = await Promise.all([
      this.commissionRepository
        .createQueryBuilder('commission')
        .select('SUM(commission.amount)', 'total')
        .where('commission.payeeId = :developerId', { developerId: id })
        .andWhere('commission.payeeType = :type', { type: 'agent' })
        .andWhere('commission.status = :status', { status: 'settled' })
        .getRawOne(),
      this.commissionRepository
        .createQueryBuilder('commission')
        .select('SUM(commission.amount)', 'total')
        .where('commission.payeeId = :developerId', { developerId: id })
        .andWhere('commission.payeeType = :type', { type: 'agent' })
        .andWhere('commission.status = :status', { status: 'settled' })
        .andWhere('DATE(commission.createdAt) = DATE(:today)', {
          today: new Date(),
        })
        .getRawOne(),
      this.commissionRepository
        .createQueryBuilder('commission')
        .select('SUM(commission.amount)', 'total')
        .where('commission.payeeId = :developerId', { developerId: id })
        .andWhere('commission.payeeType = :type', { type: 'agent' })
        .andWhere('commission.status = :status', { status: 'pending' })
        .getRawOne(),
    ]);

    // 获取最近30天收益趋势
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const recentCommissions = await this.commissionRepository.find({
      where: {
        payeeId: id,
        payeeType: PayeeType.AGENT,
        createdAt: Between(thirtyDaysAgo, new Date()),
      },
      order: { createdAt: 'DESC' },
      take: 30,
    });

    return {
      ...developer,
      agents,
      stats: {
        totalRevenue: totalRevenue?.total || 0,
        todayRevenue: todayRevenue?.total || 0,
        pendingRevenue: pendingRevenue?.total || 0,
        agentCount: agents.length,
      },
      recentCommissions,
    };
  }

  async getDeveloperAgents(developerId: string, query: any) {
    const page = parseInt(query.page || '1');
    const limit = parseInt(query.limit || '20');
    const skip = (page - 1) * limit;

    const where: any = { userId: developerId };

    if (query.search) {
      where.name = Like(`%${query.search}%`);
    }

    if (query.status) {
      where.status = query.status;
    }

    const [agents, total] = await this.agentRepository.findAndCount({
      where,
      skip,
      take: limit,
      order: { createdAt: 'DESC' },
    });

    return {
      data: agents,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }
}

