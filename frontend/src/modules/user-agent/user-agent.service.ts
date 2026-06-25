import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UserAgent, UserAgentStatus } from '../../entities/user-agent.entity';

@Injectable()
export class UserAgentService {
  private readonly logger = new Logger(UserAgentService.name);

  constructor(
    @InjectRepository(UserAgent)
    private userAgentRepository: Repository<UserAgent>,
  ) {}

  /**
   * 获取用户的所有Agent
   */
  async getUserAgents(userId: string): Promise<UserAgent[]> {
    return this.userAgentRepository.find({
      where: { userId },
      order: { createdAt: 'DESC' },
    });
  }

  /**
   * 获取单个Agent详情
   */
  async getUserAgent(userId: string, agentId: string): Promise<UserAgent> {
    const agent = await this.userAgentRepository.findOne({
      where: { id: agentId, userId },
    });

    if (!agent) {
      throw new NotFoundException('Agent不存在');
    }

    return agent;
  }

  /**
   * 更新Agent
   */
  async updateUserAgent(
    userId: string,
    agentId: string,
    updates: Partial<UserAgent>,
  ): Promise<UserAgent> {
    const agent = await this.getUserAgent(userId, agentId);

    Object.assign(agent, updates);
    return this.userAgentRepository.save(agent);
  }

  /**
   * 删除Agent
   */
  async deleteUserAgent(userId: string, agentId: string): Promise<void> {
    const agent = await this.getUserAgent(userId, agentId);
    await this.userAgentRepository.remove(agent);
  }

  /**
   * 切换Agent状态（激活/暂停）
   */
  async toggleAgentStatus(
    userId: string,
    agentId: string,
    status: UserAgentStatus,
  ): Promise<UserAgent> {
    return this.updateUserAgent(userId, agentId, { status });
  }

  /**
   * 获取Agent统计信息
   * MOCK: 当前返回模拟数据，后续需要从数据库聚合
   */
  async getAgentStats(userId: string, agentId: string): Promise<{
    totalCalls: number;
    totalEarnings: number;
    currency: string;
    lastActiveAt?: Date;
    status: UserAgentStatus;
  }> {
    const agent = await this.getUserAgent(userId, agentId);

    // TODO: 从数据库聚合真实数据
    // MOCK数据
    return {
      totalCalls: 1234,
      totalEarnings: 420,
      currency: 'USDC',
      lastActiveAt: new Date(),
      status: agent.status,
    };
  }
}

