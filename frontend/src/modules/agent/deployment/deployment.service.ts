import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AgentDeployment, DeploymentStatus, DeploymentType } from '../../../entities/agent-deployment.entity';
import { UserAgent } from '../../../entities/user-agent.entity';

export interface CreateDeploymentDto {
  agentId: string;
  deploymentType: DeploymentType;
  config?: {
    region?: string;
    autoScale?: boolean;
    resources?: {
      memory?: number;
      cpu?: number;
    };
  };
}

@Injectable()
export class DeploymentService {
  private readonly logger = new Logger(DeploymentService.name);

  constructor(
    @InjectRepository(AgentDeployment)
    private readonly deploymentRepository: Repository<AgentDeployment>,
    @InjectRepository(UserAgent)
    private readonly userAgentRepository: Repository<UserAgent>,
  ) {}

  /**
   * 创建部署
   */
  async createDeployment(userId: string, dto: CreateDeploymentDto): Promise<AgentDeployment> {
    // 验证 Agent 是否存在且属于用户
    const agent = await this.userAgentRepository.findOne({
      where: { id: dto.agentId, userId },
    });

    if (!agent) {
      throw new NotFoundException('Agent not found');
    }

    // 检查是否已有活跃部署
    const existingDeployment = await this.deploymentRepository.findOne({
      where: {
        agentId: dto.agentId,
        status: DeploymentStatus.ACTIVE,
      },
    });

    if (existingDeployment) {
      throw new BadRequestException('Agent already has an active deployment');
    }

    // 创建部署记录
    const deployment = this.deploymentRepository.create({
      agentId: dto.agentId,
      deploymentType: dto.deploymentType,
      status: DeploymentStatus.PENDING,
      config: dto.config,
      region: dto.config?.region || 'us-east-1',
    });

    const savedDeployment = await this.deploymentRepository.save(deployment);

    // 异步执行部署
    this.deployAgent(savedDeployment.id).catch((error) => {
      this.logger.error(`部署失败: ${error.message}`, error.stack);
    });

    return savedDeployment;
  }

  /**
   * 执行部署（异步）
   */
  private async deployAgent(deploymentId: string): Promise<void> {
    const deployment = await this.deploymentRepository.findOne({
      where: { id: deploymentId },
    });

    if (!deployment) {
      throw new NotFoundException('Deployment not found');
    }

    try {
      // 更新状态为部署中
      deployment.status = DeploymentStatus.DEPLOYING;
      await this.deploymentRepository.save(deployment);

      // 模拟部署过程（实际应该调用云平台 API）
      await new Promise((resolve) => setTimeout(resolve, 2000));

      // 生成访问链接
      const slug = await this.generateSlug(deployment.agentId);
      deployment.url = `https://agentrix.ai/agent/${slug}`;
      deployment.status = DeploymentStatus.ACTIVE;
      deployment.metadata = {
        deploymentId: `deploy_${deploymentId}`,
        instanceId: `instance_${deploymentId}`,
      };

      await this.deploymentRepository.save(deployment);
      this.logger.log(`部署成功: ${deployment.url}`);
    } catch (error: any) {
      deployment.status = DeploymentStatus.FAILED;
      deployment.metadata = {
        ...deployment.metadata,
        errors: [error.message],
      };
      await this.deploymentRepository.save(deployment);
      throw error;
    }
  }

  /**
   * 获取部署状态
   */
  async getDeploymentStatus(deploymentId: string, userId: string): Promise<AgentDeployment> {
    const deployment = await this.deploymentRepository.findOne({
      where: { id: deploymentId },
      relations: ['agent'],
    });

    if (!deployment) {
      throw new NotFoundException('Deployment not found');
    }

    if (deployment.agent.userId !== userId) {
      throw new BadRequestException('Unauthorized');
    }

    return deployment;
  }

  /**
   * 获取 Agent 的所有部署
   */
  async getAgentDeployments(agentId: string, userId: string): Promise<AgentDeployment[]> {
    const agent = await this.userAgentRepository.findOne({
      where: { id: agentId, userId },
    });

    if (!agent) {
      throw new NotFoundException('Agent not found');
    }

    return this.deploymentRepository.find({
      where: { agentId },
      order: { createdAt: 'DESC' },
    });
  }

  /**
   * 暂停部署
   */
  async pauseDeployment(deploymentId: string, userId: string): Promise<AgentDeployment> {
    const deployment = await this.getDeploymentStatus(deploymentId, userId);

    if (deployment.status !== DeploymentStatus.ACTIVE) {
      throw new BadRequestException('Only active deployments can be paused');
    }

    deployment.status = DeploymentStatus.PAUSED;
    return this.deploymentRepository.save(deployment);
  }

  /**
   * 恢复部署
   */
  async resumeDeployment(deploymentId: string, userId: string): Promise<AgentDeployment> {
    const deployment = await this.getDeploymentStatus(deploymentId, userId);

    if (deployment.status !== DeploymentStatus.PAUSED) {
      throw new BadRequestException('Only paused deployments can be resumed');
    }

    deployment.status = DeploymentStatus.ACTIVE;
    return this.deploymentRepository.save(deployment);
  }

  /**
   * 删除部署
   */
  async deleteDeployment(deploymentId: string, userId: string): Promise<void> {
    const deployment = await this.getDeploymentStatus(deploymentId, userId);

    // 实际应该调用云平台 API 删除资源
    await this.deploymentRepository.remove(deployment);
  }

  /**
   * 生成访问 slug
   */
  private async generateSlug(agentId: string): Promise<string> {
    // 简化实现，实际应该生成唯一且友好的 slug
    return `agent_${agentId.substring(0, 8)}`;
  }
}

