import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { AbilityMappingService } from './ability-mapping.service';
import { AgentAccount } from '../../../entities/agent-account.entity';
import { AgentReputation } from '../../../entities/agent-reputation.entity';
import { AgentStats } from '../../../entities/agent-stats.entity';
import { LivingPet } from '../../../entities/living-pet.entity';
import {
  CharacterStats,
  ABILITY_MULTIPLIER_MIN,
  ABILITY_MULTIPLIER_MAX,
} from '../../../../shared/types/world-engine';

/**
 * AbilityMappingService 单测 (Phase A 能力飞轮)。
 *
 * 验证:
 * - 无 agent 用户 → multiplier = 1.0 (无加成)
 * - diamond + 高任务量 + 满亲密度 → multiplier 命中上限 2.2
 * - 总倍率始终 clamp [1.0, 2.2] (PvP 平衡红线)
 * - canonical baseStats 不被修改 (确定性红线)
 * - effectiveStats = round(baseStats × multiplier)
 * - 同输入同输出 (快照确定性)
 */
describe('AbilityMappingService', () => {
  let service: AbilityMappingService;

  // 可变 mock 仓库返回值
  let agentAccounts: AgentAccount[] = [];
  let reputation: Partial<AgentReputation> | null = null;
  let pet: Partial<LivingPet> | null = null;

  const baseStats: CharacterStats = { hp: 60, atk: 50, def: 40, spd: 30, int: 20 };

  beforeEach(async () => {
    agentAccounts = [];
    reputation = null;
    pet = null;

    const agentAccountRepo = {
      findOne: jest.fn(async ({ where }: any) => {
        return (
          agentAccounts.find(
            (a) => a.id === where.id && (!where.ownerId || a.ownerId === where.ownerId),
          ) ?? null
        );
      }),
      find: jest.fn(async ({ where }: any) => {
        const owned = agentAccounts.filter((a) => a.ownerId === where.ownerId);
        // order creditScore DESC, take 1
        owned.sort((a, b) => Number(b.creditScore) - Number(a.creditScore));
        return owned.slice(0, 1);
      }),
    };

    const reputationRepo = {
      findOne: jest.fn(async () => reputation),
    };

    const agentStatsRepo = {
      findOne: jest.fn(async () => null),
    };

    const livingPetRepo = {
      findOne: jest.fn(async () => pet),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AbilityMappingService,
        { provide: getRepositoryToken(AgentAccount), useValue: agentAccountRepo },
        { provide: getRepositoryToken(AgentReputation), useValue: reputationRepo },
        { provide: getRepositoryToken(AgentStats), useValue: agentStatsRepo },
        { provide: getRepositoryToken(LivingPet), useValue: livingPetRepo },
      ],
    }).compile();

    service = module.get<AbilityMappingService>(AbilityMappingService);
  });

  it('无 agent、无主宠的用户 → multiplier = 1.0, effectiveStats == baseStats', async () => {
    const snap = await service.computeSnapshot('user-empty', baseStats);
    expect(snap.multiplier).toBe(ABILITY_MULTIPLIER_MIN);
    expect(snap.effectiveStats).toEqual(baseStats);
    expect(snap.sourceAgentAccountId).toBeNull();
  });

  it('不修改传入的 canonical baseStats (确定性红线)', async () => {
    const input: CharacterStats = { hp: 60, atk: 50, def: 40, spd: 30, int: 20 };
    const snapshotOfInput = { ...input };
    await service.computeSnapshot('user-empty', input);
    expect(input).toEqual(snapshotOfInput);
  });

  it('diamond + 高任务量 + 满亲密度 → 命中总上限 2.2', async () => {
    agentAccounts = [
      { id: 'agent-1', ownerId: 'user-pro', creditScore: 900 } as AgentAccount,
    ];
    reputation = {
      agentId: 'agent-1',
      tasksCompleted: 500, // /100 = 5 → cap 0.5
      avgQualityScore: 100, // (100-50)/100*0.3 = 0.15 → cap 0.15
      tier: 'diamond', // 0.4
    };
    pet = { userId: 'user-pro', intimacyLevel: 10 }; // 10/10*0.2 = 0.2

    const snap = await service.computeSnapshot('user-pro', baseStats);
    // 1 + 0.5 + 0.15 + 0.4 + 0.2 = 2.25 → clamp 2.2
    expect(snap.multiplier).toBe(ABILITY_MULTIPLIER_MAX);
    expect(snap.sourceAgentAccountId).toBe('agent-1');
    // effectiveStats = round(base × 2.2)
    expect(snap.effectiveStats.hp).toBe(Math.round(60 * 2.2));
    expect(snap.effectiveStats.atk).toBe(Math.round(50 * 2.2));
  });

  it('低质量分产生负向 qualityBonus, 但总倍率不低于 1.0', async () => {
    agentAccounts = [
      { id: 'agent-low', ownerId: 'user-low', creditScore: 500 } as AgentAccount,
    ];
    reputation = {
      agentId: 'agent-low',
      tasksCompleted: 0,
      avgQualityScore: 0, // (0-50)/100*0.3 = -0.15
      tier: 'bronze', // 0
    };
    pet = null;

    const snap = await service.computeSnapshot('user-low', baseStats);
    // 1 + 0 - 0.15 + 0 + 0 = 0.85 → clamp 1.0
    expect(snap.multiplier).toBe(ABILITY_MULTIPLIER_MIN);
    expect(snap.breakdown.qualityBonus).toBeCloseTo(-0.15, 3);
  });

  it('中等用户 → 倍率落在 (1.0, 2.2) 区间且单调合理', async () => {
    agentAccounts = [
      { id: 'agent-mid', ownerId: 'user-mid', creditScore: 600 } as AgentAccount,
    ];
    reputation = {
      agentId: 'agent-mid',
      tasksCompleted: 50, // 0.5*... → 50/100 = 0.5? no: 50/100=0.5 capped at 0.5
      avgQualityScore: 70, // (70-50)/100*0.3 = 0.06
      tier: 'gold', // 0.2
    };
    pet = { userId: 'user-mid', intimacyLevel: 5 }; // 5/10*0.2 = 0.1

    const snap = await service.computeSnapshot('user-mid', baseStats);
    expect(snap.multiplier).toBeGreaterThan(ABILITY_MULTIPLIER_MIN);
    expect(snap.multiplier).toBeLessThanOrEqual(ABILITY_MULTIPLIER_MAX);
  });

  it('同输入同输出 (快照确定性, 除 computedAt 外)', async () => {
    agentAccounts = [
      { id: 'agent-d', ownerId: 'user-d', creditScore: 700 } as AgentAccount,
    ];
    reputation = { agentId: 'agent-d', tasksCompleted: 120, avgQualityScore: 80, tier: 'platinum' };
    pet = { userId: 'user-d', intimacyLevel: 3 };

    const a = await service.computeSnapshot('user-d', baseStats);
    const b = await service.computeSnapshot('user-d', baseStats);
    expect(a.multiplier).toBe(b.multiplier);
    expect(a.effectiveStats).toEqual(b.effectiveStats);
    expect(a.breakdown).toEqual(b.breakdown);
  });

  it('指定 sourceAgentAccountId 不属于该 user → 回退到最强 agent', async () => {
    agentAccounts = [
      { id: 'agent-mine', ownerId: 'user-x', creditScore: 800 } as AgentAccount,
    ];
    reputation = { agentId: 'agent-mine', tasksCompleted: 10, avgQualityScore: 60, tier: 'silver' };

    const snap = await service.computeSnapshot('user-x', baseStats, 'someone-elses-agent');
    expect(snap.sourceAgentAccountId).toBe('agent-mine');
  });
});
