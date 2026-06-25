import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { AgentAccount } from '../../../entities/agent-account.entity';
import { AgentReputation } from '../../../entities/agent-reputation.entity';
import { AgentStats } from '../../../entities/agent-stats.entity';
import { LivingPet } from '../../../entities/living-pet.entity';
import {
  CharacterStats,
  AbilitySnapshot,
  AbilityBreakdown,
  ABILITY_MULTIPLIER_MIN,
  ABILITY_MULTIPLIER_MAX,
  ABILITY_BONUS_CAPS,
  ABILITY_TIER_BONUS,
  STAT_MAX,
} from '../../../../shared/types/world-engine';

/**
 * AbilityMappingService — 能力映射飞轮 (Phase A)。
 *
 * design: docs/WORLD_ENGINE_X_AGENTRIX_ABILITY_BINDING_DESIGN_2026-05-29 §3 支柱2。
 *
 * 把用户 agent 的**真实战绩**映射为扫描角色的战力加成:
 *   finalStats = baseStats(物体形状)  ×  abilityMultiplier(真实能力)
 *
 * 真实数据来源 (全部已存在的表, 不造数据):
 *   - agent_reputations: tasksCompleted / avgQualityScore / tier
 *   - agent_stats:       totalCalls (熟练度, 暂作辅助权重)
 *   - living_pets:       intimacyLevel (主宠陪伴共鸣)
 *
 * 关键约束 (确定性红线, design §5):
 *   - canonical baseStats 不被污染 (保 R3.1 sum 150-350 不变式 + 现有 property 测试)。
 *   - 倍率在创建/进化时刻**快照化**写入 WorldAsset.abilitySnapshot;
 *     战斗与展示读 snapshot.effectiveStats, **绝不在战斗中实时读 reputation**,
 *     否则异步对战/回放结果会因数据变动漂移。
 *   - 总倍率 clamp [1.0, 2.2] 防重度用户碾压新人。
 */
@Injectable()
export class AbilityMappingService {
  private readonly logger = new Logger(AbilityMappingService.name);

  constructor(
    @InjectRepository(AgentAccount)
    private readonly agentAccountRepo: Repository<AgentAccount>,
    @InjectRepository(AgentReputation)
    private readonly reputationRepo: Repository<AgentReputation>,
    @InjectRepository(AgentStats)
    private readonly agentStatsRepo: Repository<AgentStats>,
    @InjectRepository(LivingPet)
    private readonly livingPetRepo: Repository<LivingPet>,
  ) {}

  /**
   * 计算并组装能力加成快照。
   *
   * @param userId      资产 owner
   * @param baseStats   canonical 基础属性 (Character Generator 产出, 不被修改)
   * @param agentAccountId 可选: 指定能力来源 agent; 不传则自动选 owner 名下"最强" agent
   * @returns AbilitySnapshot (即便用户无 agent 也返回 multiplier=1.0 的有效快照)
   */
  async computeSnapshot(
    userId: string,
    baseStats: CharacterStats,
    agentAccountId?: string | null,
  ): Promise<AbilitySnapshot> {
    const breakdown = await this.computeBreakdown(userId, agentAccountId);
    const multiplier = this.assembleMultiplier(breakdown);
    const effectiveStats = this.applyMultiplier(baseStats, multiplier);

    return {
      version: 1,
      multiplier,
      breakdown,
      baseStats,
      effectiveStats,
      sourceAgentAccountId: breakdown.sources.agentAccountId,
      computedAt: new Date().toISOString(),
    };
  }

  /**
   * 读真实数据, 算出各项加成明细。
   * 任何一项数据缺失都安全降级为 0 加成 (不抛错, 不阻塞资产创建)。
   */
  async computeBreakdown(
    userId: string,
    agentAccountId?: string | null,
  ): Promise<AbilityBreakdown> {
    // 1) 选定能力来源 agent (指定优先, 否则 owner 名下最强)
    const agent = await this.resolveSourceAgent(userId, agentAccountId);
    const resolvedAgentId = agent?.id ?? null;

    // 2) 读声望 (tasksCompleted / avgQualityScore / tier)
    let tasksCompleted = 0;
    let avgQualityScore = 50; // 中位默认 → quality 加成 0
    let tier = 'bronze';
    if (resolvedAgentId) {
      const rep = await this.reputationRepo.findOne({
        where: { agentId: resolvedAgentId },
      });
      if (rep) {
        tasksCompleted = rep.tasksCompleted ?? 0;
        avgQualityScore = Number(rep.avgQualityScore ?? 50);
        tier = rep.tier ?? 'bronze';
      }
    }

    // 3) 读主宠亲密度 (跨 agent, 按 user)
    let intimacyLevel = 0;
    const pet = await this.livingPetRepo.findOne({ where: { userId } });
    if (pet) {
      intimacyLevel = pet.intimacyLevel ?? 0;
    }

    // 4) 各项加成 (独立 clamp)
    const tasksBonus = this.clamp(tasksCompleted / 100, 0, ABILITY_BONUS_CAPS.tasks);
    const qualityBonus = this.clamp(
      ((avgQualityScore - 50) / 100) * 0.3,
      -ABILITY_BONUS_CAPS.quality,
      ABILITY_BONUS_CAPS.quality,
    );
    const tierBonus = this.clamp(
      ABILITY_TIER_BONUS[tier] ?? 0,
      0,
      ABILITY_BONUS_CAPS.tier,
    );
    const intimacyBonus = this.clamp(
      (intimacyLevel / 10) * ABILITY_BONUS_CAPS.intimacy,
      0,
      ABILITY_BONUS_CAPS.intimacy,
    );

    return {
      tasksBonus: this.round3(tasksBonus),
      qualityBonus: this.round3(qualityBonus),
      tierBonus: this.round3(tierBonus),
      intimacyBonus: this.round3(intimacyBonus),
      sources: {
        tasksCompleted,
        avgQualityScore: this.round3(avgQualityScore),
        tier,
        intimacyLevel,
        agentAccountId: resolvedAgentId,
      },
    };
  }

  /**
   * 把各项加成相加后得到总倍率, clamp 到 [MIN, MAX]。
   * multiplier = 1.0 + Σ bonuses (quality 可为负, 体现低质量惩罚)。
   */
  assembleMultiplier(breakdown: AbilityBreakdown): number {
    const raw =
      1.0 +
      breakdown.tasksBonus +
      breakdown.qualityBonus +
      breakdown.tierBonus +
      breakdown.intimacyBonus;
    return this.round3(
      this.clamp(raw, ABILITY_MULTIPLIER_MIN, ABILITY_MULTIPLIER_MAX),
    );
  }

  /**
   * 把倍率应用到基础属性。
   * 每项上限放宽到 STAT_MAX × MAX_MULTIPLIER 取整, 允许加成后超过 100
   * (canonical baseStats 仍受 1-100 约束, 这里是派生的 effectiveStats)。
   */
  applyMultiplier(baseStats: CharacterStats, multiplier: number): CharacterStats {
    const cap = Math.ceil(STAT_MAX * ABILITY_MULTIPLIER_MAX);
    return {
      hp: this.clamp(Math.round(baseStats.hp * multiplier), 1, cap),
      atk: this.clamp(Math.round(baseStats.atk * multiplier), 1, cap),
      def: this.clamp(Math.round(baseStats.def * multiplier), 1, cap),
      spd: this.clamp(Math.round(baseStats.spd * multiplier), 1, cap),
      int: this.clamp(Math.round(baseStats.int * multiplier), 1, cap),
    };
  }

  // ============================================================
  // Private helpers
  // ============================================================

  /**
   * 选定能力来源 agent。
   * - 指定 agentAccountId 且属于该 user → 用它。
   * - 否则取 owner 名下 active agent 里 creditScore 最高的 (粗略的"最强"代理)。
   * - 无 agent → null (加成全 0, multiplier=1.0)。
   */
  private async resolveSourceAgent(
    userId: string,
    agentAccountId?: string | null,
  ): Promise<AgentAccount | null> {
    if (agentAccountId) {
      const specified = await this.agentAccountRepo.findOne({
        where: { id: agentAccountId, ownerId: userId },
      });
      if (specified) return specified;
      this.logger.warn(
        `sourceAgentAccountId ${agentAccountId} not owned by user ${userId}; falling back to strongest.`,
      );
    }

    const owned = await this.agentAccountRepo.find({
      where: { ownerId: userId },
      order: { creditScore: 'DESC' },
      take: 1,
    });
    return owned[0] ?? null;
  }

  private clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value));
  }

  private round3(value: number): number {
    return Math.round(value * 1000) / 1000;
  }
}
