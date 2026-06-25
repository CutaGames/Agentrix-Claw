import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PetAchievement } from '../../entities/pet-achievement.entity';
import { emitDesktopSyncEvent } from '../desktop-sync/desktop-sync.events';
import {
  PET_ACHIEVEMENTS,
  PetAchievementDef,
  findAchievementDef,
} from './pet-achievement.constants';

export interface UnlockResult {
  newlyUnlocked: PetAchievementDef[];
}

@Injectable()
export class PetAchievementService {
  private readonly logger = new Logger(PetAchievementService.name);

  constructor(
    @InjectRepository(PetAchievement)
    private readonly repo: Repository<PetAchievement>,
  ) {}

  /** 列出该用户的解锁状态（包含未解锁项的元数据）。 */
  async listForUser(userId: string) {
    const unlocked = await this.repo.find({ where: { userId } });
    const unlockedMap = new Map(unlocked.map((u) => [u.achievementKey, u.unlockedAt]));
    return PET_ACHIEVEMENTS.map((def) => ({
      key: def.key,
      label_zh: def.labelZh,
      label_en: def.labelEn,
      desc_zh: def.descZh,
      icon: def.icon,
      threshold: def.threshold ?? null,
      unlocked: unlockedMap.has(def.key),
      unlocked_at: unlockedMap.get(def.key)?.getTime() ?? null,
    }));
  }

  /**
   * 触发器：根据 trigger + ctx 寻找匹配的成就，未解锁的全部解锁。
   * 例：tryUnlock(uid, 'intimacy_level', { level: 5 }) 会解锁 intimacy_lv_1/3/5。
   */
  async tryUnlock(
    userId: string,
    trigger: PetAchievementDef['trigger'],
    ctx: { level?: number; days?: number; count?: number; score?: number } = {},
  ): Promise<UnlockResult> {
    const matches = PET_ACHIEVEMENTS.filter((a) => a.trigger === trigger).filter((a) => {
      if (a.threshold == null) return true;
      const v =
        trigger === 'intimacy_level'
          ? ctx.level
          : trigger === 'consecutive_days'
            ? ctx.days
            : trigger === 'memory_count' || trigger === 'pomodoro_count'
              ? ctx.count
              : trigger === 'minigame_score'
                ? ctx.score
                : 0;
      return (v ?? 0) >= a.threshold;
    });
    if (matches.length === 0) return { newlyUnlocked: [] };

    const existing = await this.repo.find({
      where: matches.map((m) => ({ userId, achievementKey: m.key })),
    });
    const existingKeys = new Set(existing.map((e) => e.achievementKey));
    const toInsert = matches.filter((m) => !existingKeys.has(m.key));
    if (toInsert.length === 0) return { newlyUnlocked: [] };

    const rows = toInsert.map((def) =>
      this.repo.create({
        userId,
        achievementKey: def.key,
        snapshot: {
          label_zh: def.labelZh,
          label_en: def.labelEn,
          desc_zh: def.descZh,
          icon: def.icon,
        },
      }),
    );
    await this.repo.save(rows);

    for (const def of toInsert) {
      try {
        emitDesktopSyncEvent(userId, 'presence:pet.achievement.unlocked', {
          key: def.key,
          label_zh: def.labelZh,
          label_en: def.labelEn,
          icon: def.icon,
          unlocked_at: Date.now(),
        });
      } catch (e) {
        this.logger.warn(`broadcast achievement failed: ${(e as Error).message}`);
      }
    }
    return { newlyUnlocked: toInsert };
  }

  /** 手动解锁单一成就（管理 / 进化触发用）。 */
  async unlockManual(userId: string, key: string) {
    const def = findAchievementDef(key);
    if (!def) throw new Error(`unknown achievement key: ${key}`);
    const existing = await this.repo.findOne({ where: { userId, achievementKey: key } });
    if (existing) return { unlocked: false, achievement: def };
    await this.repo.save(
      this.repo.create({
        userId,
        achievementKey: key,
        snapshot: {
          label_zh: def.labelZh,
          label_en: def.labelEn,
          desc_zh: def.descZh,
          icon: def.icon,
        },
      }),
    );
    try {
      emitDesktopSyncEvent(userId, 'presence:pet.achievement.unlocked', {
        key: def.key,
        label_zh: def.labelZh,
        label_en: def.labelEn,
        icon: def.icon,
        unlocked_at: Date.now(),
      });
    } catch {}
    return { unlocked: true, achievement: def };
  }
}
