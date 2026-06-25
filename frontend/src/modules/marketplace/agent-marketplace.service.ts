import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UserAgent, UserAgentStatus } from '../../entities/user-agent.entity';
import { AgentStats } from '../../entities/agent-stats.entity';

export interface AgentRanking {
  agentId: string;
  agentName: string;
  rank: number;
  score: number; // 综合评分
  stats: AgentStats;
}

@Injectable()
export class AgentMarketplaceService {
  private readonly logger = new Logger(AgentMarketplaceService.name);

  constructor(
    @InjectRepository(UserAgent)
    private userAgentRepository: Repository<UserAgent>,
    @InjectRepository(AgentStats)
    private agentStatsRepository: Repository<AgentStats>,
  ) {}

  /**
   * 搜索Agent
   */
  async searchAgents(options: {
    keyword?: string;
    category?: string;
    minRating?: number;
    sortBy?: 'popularity' | 'rating' | 'revenue' | 'recent';
    page?: number;
    pageSize?: number;
  }): Promise<{ agents: UserAgent[]; rankings: AgentRanking[]; total: number }> {
    const page = Math.max(options.page || 1, 1);
    const pageSize = Math.min(Math.max(options.pageSize || 20, 1), 100);

    const qb = this.userAgentRepository
      .createQueryBuilder('agent')
      .where('agent.status = :status', { status: UserAgentStatus.ACTIVE })
      .andWhere('agent.isPublished = :isPublished', { isPublished: true });

    if (options.keyword) {
      qb.andWhere(
        '(agent.name ILIKE :keyword OR agent.description ILIKE :keyword)',
        { keyword: `%${options.keyword}%` },
      );
    }

    // 排序
    switch (options.sortBy) {
      case 'popularity':
        qb.orderBy('agent.createdAt', 'DESC');
        break;
      case 'rating':
        // TODO: 按评分排序（需要关联评分表）
        qb.orderBy('agent.createdAt', 'DESC');
        break;
      case 'revenue':
        // TODO: 按收益排序（需要关联收益表）
        qb.orderBy('agent.createdAt', 'DESC');
        break;
      case 'recent':
      default:
        qb.orderBy('agent.updatedAt', 'DESC');
        break;
    }

    qb.skip((page - 1) * pageSize).take(pageSize);

    const [agents, total] = await qb.getManyAndCount();

    // 获取Agent排行榜
    const rankings = await this.getAgentRankings(agents.map(a => a.id));

    return {
      agents,
      rankings,
      total,
    };
  }

  /**
   * 推荐Agent
   */
  async recommendAgents(
    userId: string,
    limit: number = 10,
  ): Promise<{ agents: UserAgent[]; reasons: Record<string, string> }> {
    this.logger.log(`推荐Agent: userId=${userId}, limit=${limit}`);

    // TODO: 实现推荐算法
    // 1. 基于用户历史行为
    // 2. 基于相似用户
    // 3. 基于热门Agent
    // 4. 基于新上架Agent

    // MOCK: 简单推荐逻辑
    const allAgents = await this.userAgentRepository.find({
      where: {
        status: UserAgentStatus.ACTIVE,
        isPublished: true,
      },
      take: limit * 3, // 获取更多候选
      order: {
        createdAt: 'DESC',
      },
    });

    // 随机选择（实际应该用推荐算法）
    const recommended = allAgents
      .sort(() => Math.random() - 0.5)
      .slice(0, limit);

    const reasons: Record<string, string> = {};
    for (const agent of recommended) {
      reasons[agent.id] = '为您推荐的热门Agent';
    }

    return {
      agents: recommended,
      reasons,
    };
  }

  /**
   * 获取Agent统计信息
   */
  async getAgentStats(agentId: string): Promise<AgentStats | null> {
    let stats = await this.agentStatsRepository.findOne({
      where: { agentId },
    });

    if (!stats) {
      // 如果不存在，创建默认记录
      stats = this.agentStatsRepository.create({
        agentId,
        totalCalls: 0,
        totalRevenue: 0,
        totalUsers: 0,
        avgRating: 0,
        lastActiveAt: new Date(),
      });
      stats = await this.agentStatsRepository.save(stats);
    }

    return stats;
  }

  /**
   * 记录Agent调用
   */
  async recordAgentCall(agentId: string, userId: string): Promise<void> {
    let stats = await this.agentStatsRepository.findOne({
      where: { agentId },
    });

    if (!stats) {
      stats = this.agentStatsRepository.create({
        agentId,
        totalCalls: 0,
        totalRevenue: 0,
        totalUsers: 0,
        avgRating: 0,
      });
    }

    stats.totalCalls += 1;
    stats.lastActiveAt = new Date();

    // TODO: 记录唯一用户数（需要去重，可能需要单独的用户记录表）
    stats.totalUsers += 1;

    await this.agentStatsRepository.save(stats);
  }

  /**
   * 记录Agent收益
   */
  async recordAgentRevenue(agentId: string, amount: number): Promise<void> {
    let stats = await this.agentStatsRepository.findOne({
      where: { agentId },
    });

    if (!stats) {
      stats = this.agentStatsRepository.create({
        agentId,
        totalCalls: 0,
        totalRevenue: 0,
        totalUsers: 0,
        avgRating: 0,
      });
    }

    stats.totalRevenue = (parseFloat(stats.totalRevenue.toString()) || 0) + amount;
    await this.agentStatsRepository.save(stats);
  }

  /**
   * 获取Agent排行榜
   */
  async getAgentRankings(agentIds: string[]): Promise<AgentRanking[]> {
    const rankings: AgentRanking[] = [];

    for (const agentId of agentIds) {
      const stats = await this.getAgentStats(agentId);
      const agent = await this.userAgentRepository.findOne({ where: { id: agentId } });

      if (agent && stats) {
        // 计算综合评分
        const score = this.calculateScore(stats);

        rankings.push({
          agentId,
          agentName: agent.name,
          rank: 0, // 稍后排序
          score,
          stats,
        });
      }
    }

    // 按评分排序
    rankings.sort((a, b) => b.score - a.score);

    // 设置排名
    rankings.forEach((ranking, index) => {
      ranking.rank = index + 1;
    });

    return rankings;
  }

  /**
   * 计算Agent综合评分
   */
  private calculateScore(stats: AgentStats): number {
    // 综合评分 = 调用次数权重 + 收益权重 + 用户数权重 + 评分权重
    const callScore = Math.log10(stats.totalCalls + 1) * 10;
    const revenueScore = Math.log10(stats.totalRevenue + 1) * 5;
    const userScore = Math.log10(stats.totalUsers + 1) * 10;
    const ratingScore = stats.avgRating * 20;

    return callScore + revenueScore + userScore + ratingScore;
  }

}

