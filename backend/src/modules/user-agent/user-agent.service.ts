import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
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

  /**
   * 订阅/购买 Agent (Marketplace 订阅逻辑转为 UserAgent)
   */
  async subscribeAgent(userId: string, agentId: string): Promise<UserAgent> {
    // 1. 检查是否已经是该用户的 UserAgent ID
    let existing = await this.userAgentRepository.findOne({
      where: { id: agentId, userId },
    });

    if (existing) {
      return existing;
    }

    // 2. 尝试检查是否作为 templateId 已经订阅过
    existing = await this.userAgentRepository.findOne({
      where: { userId, templateId: agentId },
    });

    if (existing) {
      return existing;
    }

    // 这是一个简化逻辑：订阅时，我们会为用户创建一个基于该模板的个性化 Agent 副本
    // 在实际生产中，agentId 应该是 Template ID
    this.logger.log(`Creating subscription/copy for user ${userId} from template/agent ${agentId}`);
    
    // 我们创建一个新的 UserAgent 记录
    const newAgent = this.userAgentRepository.create({
      userId,
      name: `Agent Instance (${agentId.slice(0, 6)})`,
      status: UserAgentStatus.ACTIVE,
      templateId: agentId,
      metadata: {
        subscribedAt: new Date(),
        originalTemplateId: agentId,
        source: 'subscription',
      },
    });

    return this.userAgentRepository.save(newAgent);
  }

  async publishToMarketplace(userId: string, agentId: string): Promise<UserAgent> {
    const agent = await this.userAgentRepository.findOne({
      where: { id: agentId, userId },
    });

    if (!agent) {
      throw new NotFoundException('Agent not found or access denied');
    }

    if (agent.status !== UserAgentStatus.ACTIVE) {
      throw new BadRequestException('Agent must be active before publishing to marketplace');
    }

    agent.isPublished = true;
    return this.userAgentRepository.save(agent);
  }

  async unpublishFromMarketplace(userId: string, agentId: string): Promise<UserAgent> {
    const agent = await this.userAgentRepository.findOne({
      where: { id: agentId, userId },
    });

    if (!agent) {
      throw new NotFoundException('Agent not found or access denied');
    }

    agent.isPublished = false;
    return this.userAgentRepository.save(agent);
  }

  async getMyPublishedAgents(userId: string): Promise<UserAgent[]> {
    return this.userAgentRepository.find({
      where: { userId, isPublished: true },
      order: { createdAt: 'DESC' },
    });
  }
}

