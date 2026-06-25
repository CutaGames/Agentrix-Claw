import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  OpenClawInstance,
  OpenClawInstanceStatus,
  OpenClawInstanceType,
} from '../../entities/openclaw-instance.entity';
import {
  AgentAccount,
  AgentAccountStatus,
  AgentType,
} from '../../entities/agent-account.entity';
import * as crypto from 'crypto';

export interface UnifiedAgent {
  id: string;              // OpenClawInstance.id (主标识)
  name: string;
  description?: string;
  personality?: string;
  status: string;
  instanceType: string;

  // 运行时信息
  instanceUrl?: string;
  isPrimary: boolean;
  defaultModel?: string;
  capabilities?: Record<string, any>;
  delegationLevel?: string;
  channelBindings?: any[];
  systemPrompt?: string;

  // 经济身份（来自 AgentAccount）
  agentAccountId?: string;
  agentUniqueId?: string;
  creditScore?: number;
  spendingLimits?: any;
  agentType?: string;

  // 团队信息
  teamTemplateSlug?: string;
  codename?: string;
  modelTier?: string;

  createdAt: Date;
  updatedAt: Date;
}

@Injectable()
export class UnifiedAgentService {
  private readonly logger = new Logger(UnifiedAgentService.name);

  constructor(
    @InjectRepository(OpenClawInstance)
    private readonly instanceRepo: Repository<OpenClawInstance>,
    @InjectRepository(AgentAccount)
    private readonly accountRepo: Repository<AgentAccount>,
  ) {}

  /**
   * 获取用户的统一 Agent 列表
   * 以 OpenClawInstance 为主，LEFT JOIN AgentAccount
   */
  async getUnifiedAgents(userId: string): Promise<UnifiedAgent[]> {
    const instances = await this.instanceRepo.find({
      where: { userId },
      relations: ['agentAccount'],
      order: { isPrimary: 'DESC', updatedAt: 'DESC' },
    });

    return instances.map(inst => this.mergeToUnified(inst));
  }

  /**
   * 获取单个统一 Agent
   */
  async getUnifiedAgentById(userId: string, id: string): Promise<UnifiedAgent> {
    const instance = await this.instanceRepo.findOne({
      where: { id, userId },
      relations: ['agentAccount'],
    });
    if (!instance) {
      throw new NotFoundException('Agent 不存在');
    }
    return this.mergeToUnified(instance);
  }

  /**
   * 创建统一 Agent（同时创建 OpenClawInstance + AgentAccount）
   */
  async createUnifiedAgent(userId: string, dto: {
    name: string;
    description?: string;
    personality?: string;
    defaultModel?: string;
    spendingLimits?: { singleTxLimit: number; dailyLimit: number; monthlyLimit: number; currency: string };
  }): Promise<UnifiedAgent> {
    // 1. 创建 AgentAccount
    const timestamp = Date.now().toString(36);
    const random = crypto.randomBytes(4).toString('hex');
    const account = this.accountRepo.create({
      agentUniqueId: `AGT-${timestamp}-${random}`,
      name: dto.name,
      description: dto.description,
      ownerId: userId,
      agentType: AgentType.PERSONAL,
      status: AgentAccountStatus.ACTIVE,
      activatedAt: new Date(),
      spendingLimits: dto.spendingLimits || {
        singleTxLimit: 100,
        dailyLimit: 500,
        monthlyLimit: 2000,
        currency: 'USD',
      },
    } as any);
    const savedAccount = await this.accountRepo.save(account) as unknown as AgentAccount;

    // 2. 创建 OpenClawInstance 并绑定
    const instance = this.instanceRepo.create({
      userId,
      name: dto.name,
      instanceType: OpenClawInstanceType.CLOUD,
      status: OpenClawInstanceStatus.ACTIVE,
      personality: dto.personality,
      agentAccountId: savedAccount.id,
      defaultModel: dto.defaultModel,
      delegationLevel: 'assistant',
    } as any);
    const savedInstance = await this.instanceRepo.save(instance) as unknown as OpenClawInstance;

    this.logger.log(`Unified Agent created: ${dto.name} (instance=${savedInstance.id}, account=${savedAccount.id})`);

    // Reload with relation
    const full = await this.instanceRepo.findOne({
      where: { id: savedInstance.id },
      relations: ['agentAccount'],
    });
    return this.mergeToUnified(full!);
  }

  private mergeToUnified(inst: OpenClawInstance): UnifiedAgent {
    const acct = (inst as any).agentAccount as AgentAccount | undefined;
    return {
      id: inst.id,
      name: inst.name,
      description: acct?.description || inst.personality?.substring(0, 200),
      personality: inst.personality,
      status: inst.status,
      instanceType: inst.instanceType,

      instanceUrl: inst.instanceUrl,
      isPrimary: inst.isPrimary,
      defaultModel: inst.defaultModel || acct?.preferredModel,
      capabilities: inst.capabilities,
      delegationLevel: inst.delegationLevel,
      channelBindings: inst.channelBindings,
      systemPrompt: inst.systemPrompt,

      agentAccountId: acct?.id || inst.agentAccountId,
      agentUniqueId: acct?.agentUniqueId,
      creditScore: acct ? Number(acct.creditScore) : undefined,
      spendingLimits: acct?.spendingLimits,
      agentType: acct?.agentType,

      teamTemplateSlug: acct?.metadata?.teamTemplateSlug || inst.metadata?.teamTemplateSlug,
      codename: acct?.metadata?.codename || inst.metadata?.codename,
      modelTier: acct?.metadata?.modelTier || inst.metadata?.modelTier,

      createdAt: inst.createdAt,
      updatedAt: inst.updatedAt,
    };
  }
}
