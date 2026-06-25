import { Injectable, Logger, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { createHash, randomBytes } from 'crypto';

import { WorldGameRuleSet } from '../entities/world-game-ruleset.entity';

export interface RuleSetInput {
  name: string;
  description?: string;
  isPublic?: boolean;
  rules?: {
    maxRounds?: number;
    energyMax?: number;
    chargeMax?: number;
    damageMultiplier?: number;
    critEnabled?: boolean;
    winCondition?: 'ko' | 'hp_majority' | 'rounds_survival';
  };
}

/**
 * UgcGameService — UGC 游戏规则集 (Phase D, 二期)。
 *
 * design: §7.4 + Phase D。让玩家用自己的角色做可分享的自定义挑战。
 * 规则集作用于交互战斗的可调参数, 经 sanitizeRules clamp 到安全范围(防注入/防破坏平衡)。
 */
@Injectable()
export class UgcGameService {
  private readonly logger = new Logger(UgcGameService.name);

  /** 一个用户最多创建多少规则集(防滥用) */
  static readonly MAX_RULESETS_PER_USER = 50;

  constructor(
    @InjectRepository(WorldGameRuleSet)
    private readonly ruleSetRepo: Repository<WorldGameRuleSet>,
  ) {}

  async createRuleSet(userId: string, input: RuleSetInput): Promise<WorldGameRuleSet> {
    const name = (input.name ?? '').trim();
    if (!name || name.length > 40) {
      throw new BadRequestException('Name is required (1-40 chars)');
    }
    const count = await this.ruleSetRepo.count({ where: { creatorUserId: userId } });
    if (count >= UgcGameService.MAX_RULESETS_PER_USER) {
      throw new ForbiddenException(`You have reached the max of ${UgcGameService.MAX_RULESETS_PER_USER} rule sets`);
    }

    const shareCode = await this.generateShareCode();
    const ruleSet = this.ruleSetRepo.create({
      creatorUserId: userId,
      name,
      description: (input.description ?? '').slice(0, 200),
      shareCode,
      rules: this.sanitizeRules(input.rules ?? {}),
      playCount: 0,
      isPublic: input.isPublic !== false,
    });
    const saved = await this.ruleSetRepo.save(ruleSet);
    this.logger.log(`RuleSet ${saved.id} (${shareCode}) created by ${userId}`);
    return saved;
  }

  async listMine(userId: string): Promise<WorldGameRuleSet[]> {
    return this.ruleSetRepo.find({
      where: { creatorUserId: userId },
      order: { createdAt: 'DESC' },
      take: UgcGameService.MAX_RULESETS_PER_USER,
    });
  }

  async getByShareCode(shareCode: string): Promise<WorldGameRuleSet> {
    const rs = await this.ruleSetRepo.findOne({ where: { shareCode } });
    if (!rs) throw new NotFoundException(`Rule set ${shareCode} not found`);
    if (!rs.isPublic) throw new ForbiddenException('This rule set is private');
    return rs;
  }

  /** 加载并计一次游玩(裂变热度)。返回供交互战斗使用的已 clamp 规则。 */
  async play(shareCode: string): Promise<{ ruleSet: WorldGameRuleSet; effectiveRules: Record<string, unknown> }> {
    const rs = await this.getByShareCode(shareCode);
    await this.ruleSetRepo.increment({ id: rs.id }, 'playCount', 1);
    return { ruleSet: rs, effectiveRules: this.sanitizeRules(rs.rules ?? {}) };
  }

  async deleteRuleSet(userId: string, id: string): Promise<{ success: boolean }> {
    const rs = await this.ruleSetRepo.findOne({ where: { id } });
    if (!rs) throw new NotFoundException(`Rule set ${id} not found`);
    if (rs.creatorUserId !== userId) throw new ForbiddenException('You can only delete your own rule sets');
    await this.ruleSetRepo.delete(id);
    return { success: true };
  }

  // ============================================================
  // Private
  // ============================================================

  /** clamp 规则到安全范围,过滤未知键(防注入 + 防破坏平衡)。 */
  private sanitizeRules(raw: Record<string, unknown>): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    if (typeof raw.maxRounds === 'number') out.maxRounds = this.clampInt(raw.maxRounds, 5, 40);
    if (typeof raw.energyMax === 'number') out.energyMax = this.clampInt(raw.energyMax, 1, 6);
    if (typeof raw.chargeMax === 'number') out.chargeMax = this.clampInt(raw.chargeMax, 1, 6);
    if (typeof raw.damageMultiplier === 'number') {
      out.damageMultiplier = Math.max(0.5, Math.min(2.0, Math.round(raw.damageMultiplier * 100) / 100));
    }
    if (typeof raw.critEnabled === 'boolean') out.critEnabled = raw.critEnabled;
    if (raw.winCondition === 'ko' || raw.winCondition === 'hp_majority' || raw.winCondition === 'rounds_survival') {
      out.winCondition = raw.winCondition;
    }
    return out;
  }

  private clampInt(v: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, Math.round(v)));
  }

  private async generateShareCode(): Promise<string> {
    for (let attempt = 0; attempt < 10; attempt++) {
      const code = randomBytes(6).toString('hex').toUpperCase().slice(0, 8);
      const existing = await this.ruleSetRepo.findOne({ where: { shareCode: code } });
      if (!existing) return code;
    }
    // 兜底: 时间戳哈希
    return createHash('sha256').update(`${Date.now()}:${Math.random()}`).digest('hex').substring(0, 8).toUpperCase();
  }
}
