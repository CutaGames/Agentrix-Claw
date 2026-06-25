import { Injectable, Logger, NotFoundException, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AgentRegistry, AgentRiskTier } from '../../entities/agent-registry.entity';
import * as crypto from 'crypto';
import { EasService } from './eas.service';

@Injectable()
export class AgentRegistryService {
  private readonly logger = new Logger(AgentRegistryService.name);

  constructor(
    @InjectRepository(AgentRegistry)
    private agentRegistryRepository: Repository<AgentRegistry>,
    private easService: EasService,
  ) {}

  /**
   * 注册新Agent
   */
  async registerAgent(ownerId: string, data: {
    name: string;
    description?: string;
    agentId?: string;
    capabilities?: string[];
    callbacks?: {
      authSuccessUrl?: string;
      paymentSuccessUrl?: string;
      webhookUrl?: string;
    };
  }): Promise<AgentRegistry> {
    const agentId = data.agentId || `agent_${crypto.randomBytes(8).toString('hex')}`;
    
    // 检查agentId是否已存在
    const existing = await this.agentRegistryRepository.findOne({ where: { agentId } });
    if (existing) {
      throw new ConflictException('Agent ID已存在');
    }

    const clientSecret = crypto.randomBytes(32).toString('hex');
    
    const agent = this.agentRegistryRepository.create({
      agentId,
      name: data.name,
      description: data.description,
      ownerId,
      clientSecret, // 注意：实际应用中应加密存储
      riskTier: AgentRiskTier.MEDIUM,
      capabilities: data.capabilities || [],
      callbacks: data.callbacks,
    });

    const savedAgent = await this.agentRegistryRepository.save(agent);
    this.logger.log(`注册Agent成功: ${savedAgent.agentId} (owner: ${ownerId})`);

    // 异步发布 EAS 存证（不阻塞主流程）
    this.easService.attestAgentRegistration({
      agentId: savedAgent.agentId,
      name: savedAgent.name,
      riskTier: savedAgent.riskTier,
      ownerId: savedAgent.ownerId,
    }).then(uid => {
      if (uid) {
        this.agentRegistryRepository.update(savedAgent.id, { easAttestationUid: uid });
      }
    }).catch(err => {
      this.logger.error(`异步发布 EAS 存证失败: ${err.message}`);
    });
    
    return savedAgent;
  }

  /**
   * 获取Agent详情
   */
  async getAgent(agentId: string): Promise<AgentRegistry> {
    const agent = await this.agentRegistryRepository.findOne({ where: { agentId } });
    if (!agent) {
      throw new NotFoundException('Agent不存在');
    }
    return agent;
  }

  /**
   * 验证Agent凭证
   */
  async validateAgentCredentials(agentId: string, clientSecret: string): Promise<boolean> {
    const agent = await this.agentRegistryRepository.findOne({ 
      where: { agentId },
      select: ['id', 'agentId', 'clientSecret'] 
    });
    
    if (!agent) return false;
    
    // 简单比对（生产环境应使用哈希比对）
    return agent.clientSecret === clientSecret;
  }

  /**
   * 更新Agent风险等级
   */
  async updateRiskTier(agentId: string, tier: AgentRiskTier): Promise<AgentRegistry> {
    const agent = await this.getAgent(agentId);
    agent.riskTier = tier;
    return this.agentRegistryRepository.save(agent);
  }
}
