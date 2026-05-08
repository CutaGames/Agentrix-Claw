import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, Repository } from 'typeorm';
import { PetMinigameScore } from '../../entities/pet-minigame-score.entity';
import { LivingPetService } from '../living-pet/living-pet.service';
import { PetAchievementService } from '../pet-achievement/pet-achievement.service';

export const MINIGAME_KEYS = ['scratch', 'feed', 'code_buddy'] as const;
export type MinigameKey = (typeof MINIGAME_KEYS)[number];

/** 反作弊：每用户每天每游戏的得分上限 */
const DAILY_PLAY_CAP_PER_GAME = 20;
/** 单次得分上限（防注入大数）*/
const SCORE_CAP_PER_PLAY: Record<MinigameKey, number> = {
  scratch: 200,
  feed: 150,
  code_buddy: 300,
};
/** 每分得多少 intimacy_xp（rate）*/
const XP_RATE_PER_GAME: Record<MinigameKey, number> = {
  scratch: 0.5,
  feed: 0.6,
  code_buddy: 0.4,
};

export interface PlayResult {
  score: PetMinigameScore;
  intimacyXpAwarded: number;
  totalToday: number;
}

@Injectable()
export class PetMinigameService {
  private readonly logger = new Logger(PetMinigameService.name);

  constructor(
    @InjectRepository(PetMinigameScore)
    private readonly repo: Repository<PetMinigameScore>,
    private readonly livingPetService: LivingPetService,
    private readonly achievementService: PetAchievementService,
  ) {}

  /** 提交一次游戏得分（防作弊后写库 + 派奖）。 */
  async submit(
    userId: string,
    gameKey: string,
    rawScore: number,
    metadata: Record<string, unknown> = {},
  ): Promise<PlayResult> {
    if (!MINIGAME_KEYS.includes(gameKey as MinigameKey)) {
      throw new BadRequestException(`unknown game_key: ${gameKey}`);
    }
    const key = gameKey as MinigameKey;
    const score = Math.max(0, Math.min(Math.floor(rawScore || 0), SCORE_CAP_PER_PLAY[key]));

    // 反作弊：日上限
    const now = new Date();
    const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);
    const todayCount = await this.repo.count({
      where: { userId, gameKey: key, createdAt: Between(dayStart, dayEnd) },
    });
    if (todayCount >= DAILY_PLAY_CAP_PER_GAME) {
      throw new BadRequestException({
        code: 'minigame_daily_cap',
        message: `每天每个游戏最多玩 ${DAILY_PLAY_CAP_PER_GAME} 次`,
        cap: DAILY_PLAY_CAP_PER_GAME,
      });
    }

    const xp = Math.max(1, Math.round(score * XP_RATE_PER_GAME[key]));
    const row = await this.repo.save(
      this.repo.create({
        userId,
        gameKey: key,
        score,
        intimacyXpAwarded: xp,
        energyAwarded: 0,
        metadata,
      }),
    );

    // 奖励：亲密度 xp（自动级联触发成就）
    try {
      await this.livingPetService.addIntimacyXp(userId, xp);
    } catch (e) {
      this.logger.warn(`addIntimacyXp failed: ${(e as Error).message}`);
    }

    // S4 成就：第一次玩 / 高分玩家
    try {
      await this.achievementService.tryUnlock(userId, 'minigame_score', { score });
    } catch (e) {
      this.logger.warn(`achievement minigame failed: ${(e as Error).message}`);
    }

    return { score: row, intimacyXpAwarded: xp, totalToday: todayCount + 1 };
  }

  async leaderboard(userId: string, gameKey?: string, limit = 20) {
    const where: any = { userId };
    if (gameKey && MINIGAME_KEYS.includes(gameKey as MinigameKey)) where.gameKey = gameKey;
    const items = await this.repo.find({
      where,
      order: { score: 'DESC' },
      take: Math.min(Math.max(limit, 1), 100),
    });
    const best: Record<string, number> = {};
    for (const k of MINIGAME_KEYS) {
      best[k] = 0;
    }
    for (const r of items) {
      if (r.score > (best[r.gameKey] ?? 0)) best[r.gameKey] = r.score;
    }
    return { items, best };
  }

  async listRecent(userId: string, limit = 20) {
    return this.repo.find({
      where: { userId },
      order: { createdAt: 'DESC' },
      take: Math.min(Math.max(limit, 1), 100),
    });
  }
}
