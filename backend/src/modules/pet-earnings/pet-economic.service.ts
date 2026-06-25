import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { LivingPet } from '../../entities/living-pet.entity';
import { AgentAccount } from '../../entities/agent-account.entity';
import { UnifiedAgentService } from '../unified-agent/unified-agent.service';
import { PetEarningsService } from './pet-earnings.service';

export interface EnableEarningResult {
  ok: boolean;
  boundAgentAccountId: string;
  alreadyBound: boolean;
}

export interface PetEconomicProfile {
  pet: { id: string; name: string; species: string; intimacyLevel: number };
  earning: {
    enabled: boolean;
    agentAccountId?: string;
    creditScore?: number;
    spendingLimits?: any;
    usedTodayAmount?: number;
    totalTransactions?: number;
  };
  earnings: Awaited<ReturnType<PetEarningsService['getSummary']>> | null;
}

/**
 * PetEconomicService — 萌宠 = 会赚钱的经济主体（Pet Earning Flywheel 需求 3）。
 *
 * LivingPet（人格/陪伴，不持钱）通过 boundAgentAccountId 绑定到 AgentAccount
 * （持钱包/信用分/限额）。本服务把两者在服务层合并成一只"会赚钱的萌宠"，并提供
 * 幂等的"开通赚钱能力"流程（复用 UnifiedAgentService.createUnifiedAgent）。
 */
@Injectable()
export class PetEconomicService {
  private readonly logger = new Logger(PetEconomicService.name);

  constructor(
    @InjectRepository(LivingPet)
    private readonly pets: Repository<LivingPet>,
    @InjectRepository(AgentAccount)
    private readonly accounts: Repository<AgentAccount>,
    private readonly unifiedAgent: UnifiedAgentService,
    private readonly earnings: PetEarningsService,
  ) {}

  /** 幂等开通：未绑定则创建/绑定一个 AgentAccount 并回写 boundAgentAccountId。 */
  async ensureEarningCapability(userId: string): Promise<EnableEarningResult> {
    const pet = await this.pets.findOne({ where: { userId } });
    if (!pet) throw new NotFoundException('LivingPet not found for user');

    if (pet.boundAgentAccountId) {
      return { ok: true, boundAgentAccountId: pet.boundAgentAccountId, alreadyBound: true };
    }

    // 复用统一 Agent 创建（同时建 AgentAccount + OpenClawInstance）。失败不破坏萌宠陪伴功能。
    const unified = await this.unifiedAgent.createUnifiedAgent(userId, {
      name: pet.name || 'Aira',
      description: '萌宠赚钱主体',
    });
    const agentAccountId = unified.agentAccountId;
    if (!agentAccountId) {
      throw new NotFoundException('failed to create agent account for pet');
    }
    pet.boundAgentAccountId = agentAccountId;
    await this.pets.save(pet);
    return { ok: true, boundAgentAccountId: agentAccountId, alreadyBound: false };
  }

  /** 合并视图：萌宠人格 + 绑定 agent 的经济能力 + 收益汇总。 */
  async getPetEconomicProfile(userId: string): Promise<PetEconomicProfile> {
    const pet = await this.pets.findOne({ where: { userId } });
    if (!pet) throw new NotFoundException('LivingPet not found for user');

    let account: AgentAccount | null = null;
    if (pet.boundAgentAccountId) {
      account = await this.accounts.findOne({ where: { id: pet.boundAgentAccountId } });
    }

    let earnings: PetEconomicProfile['earnings'] = null;
    try {
      earnings = await this.earnings.getSummary(userId);
    } catch (e) {
      this.logger.warn(`getSummary failed for ${userId}: ${(e as Error).message}`);
    }

    return {
      pet: {
        id: pet.id,
        name: pet.name,
        species: pet.species,
        intimacyLevel: pet.intimacyLevel,
      },
      earning: account
        ? {
            enabled: true,
            agentAccountId: account.id,
            creditScore: Number(account.creditScore),
            spendingLimits: account.spendingLimits,
            usedTodayAmount: Number(account.usedTodayAmount),
            totalTransactions: account.totalTransactions,
          }
        : { enabled: false },
      earnings,
    };
  }
}
