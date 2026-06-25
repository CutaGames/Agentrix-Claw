import { Injectable, Logger, BadRequestException, Optional } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { GameScoreEntity } from './entities/game-score.entity';
import { AxpService } from '../axp/axp.service';
import { AXP_AMOUNTS } from '../axp/axp.constants';
import { User } from '../../entities/user.entity';

/** 分数上限(反作弊:拒绝离谱值)。 */
const MAX_SCORE = 50_000_000;
/** 同一创作每用户每分钟最多提交次数(反刷)。 */
const SUBMIT_RATE_PER_MIN = 12;

export interface LeaderboardRow {
  rank: number;
  userId: string;
  name: string;
  score: number;
  isMe?: boolean;
}

/**
 * GameScoreService — 游戏分数提交 + 周榜(P0 keystone:分数权威 + 竞技/榜单地基)。
 *
 * 客户端用 render_game_to_text/postMessage 上报本局分数 → 服务端轻量反作弊(上限/频次)→
 * 落库(每提交一行)。榜单取"每用户每周最高分"。每日前 5 局额外给 AXP(game_participate,
 * 由 AxpService 日上限兜底)。分数以本表为准,供竞技奖池/反作弊复用。
 */
@Injectable()
export class GameScoreService {
  private readonly logger = new Logger(GameScoreService.name);

  constructor(
    @InjectRepository(GameScoreEntity)
    private readonly repo: Repository<GameScoreEntity>,
    @Optional() private readonly axp?: AxpService,
    @Optional()
    @InjectRepository(User)
    private readonly userRepo?: Repository<User>,
  ) {}

  /** ISO 周键,如 2026-W24(UTC)。 */
  static weekKey(d = new Date()): string {
    const dt = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
    const day = dt.getUTCDay() || 7;
    dt.setUTCDate(dt.getUTCDate() + 4 - day);
    const yearStart = new Date(Date.UTC(dt.getUTCFullYear(), 0, 1));
    const week = Math.ceil(((dt.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
    return `${dt.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
  }

  async submitScore(
    creationId: string,
    userId: string,
    rawScore: number,
    stateSnapshot?: Record<string, unknown>,
  ): Promise<{ ok: boolean; score: number; best: number; rank: number; awardedAxp: number }> {
    if (!userId) throw new BadRequestException('未认证');
    const score = Math.max(0, Math.min(MAX_SCORE, Math.floor(Number(rawScore) || 0)));

    // 反刷:同创作同用户近 60s 提交次数限频。
    const since = new Date(Date.now() - 60_000);
    const recent = await this.repo
      .createQueryBuilder('s')
      .where('s.creation_id = :c', { c: creationId })
      .andWhere('s.user_id = :u', { u: userId })
      .andWhere('s.created_at >= :since', { since })
      .getCount();
    if (recent >= SUBMIT_RATE_PER_MIN) {
      throw new BadRequestException('提交过于频繁,请稍后再试');
    }

    const weekKey = GameScoreService.weekKey();
    await this.repo.save(
      this.repo.create({ creationId, userId, score, weekKey, stateSnapshot: stateSnapshot ?? null }),
    );

    // 本周个人最佳 + 名次。
    const best = await this.bestScore(creationId, userId, weekKey);
    const rank = await this.rankOf(creationId, weekKey, best);

    // 参与奖励(日上限由 AxpService 'game_participate' cap=5 兜底;超额静默)。
    let awardedAxp = 0;
    if (this.axp) {
      try {
        await this.axp.earn({
          userId,
          source: 'game_participate',
          amount: AXP_AMOUNTS.game_participate_base,
          refId: `play-${creationId}-${Date.now()}`,
          note: '游玩创作奖励',
          metadata: { creationId },
        } as any);
        awardedAxp = AXP_AMOUNTS.game_participate_base;
      } catch {
        awardedAxp = 0; // 日上限到顶等 → 不报错
      }
    }

    return { ok: true, score, best, rank, awardedAxp };
  }

  /** 本周(默认)或全期榜单:每用户最高分,降序。 */
  async leaderboard(
    creationId: string,
    period: 'week' | 'all',
    meUserId?: string,
    limit = 20,
  ): Promise<{ items: LeaderboardRow[]; me?: LeaderboardRow }> {
    const qb = this.repo
      .createQueryBuilder('s')
      .select('s.user_id', 'userId')
      .addSelect('MAX(s.score)', 'score')
      .where('s.creation_id = :c', { c: creationId })
      .groupBy('s.user_id')
      .orderBy('score', 'DESC')
      .limit(Math.min(limit, 100));
    if (period === 'week') qb.andWhere('s.week_key = :wk', { wk: GameScoreService.weekKey() });
    const rows = await qb.getRawMany<{ userId: string; score: string }>();

    const names = await this.resolveNames(rows.map((r) => r.userId));
    const items: LeaderboardRow[] = rows.map((r, i) => ({
      rank: i + 1,
      userId: r.userId,
      name: names[r.userId] ?? '玩家',
      score: Number(r.score),
      isMe: meUserId ? r.userId === meUserId : undefined,
    }));

    let me: LeaderboardRow | undefined;
    if (meUserId && !items.some((it) => it.isMe)) {
      const wk = period === 'week' ? GameScoreService.weekKey() : undefined;
      const best = await this.bestScore(creationId, meUserId, wk);
      if (best > 0) {
        me = { rank: await this.rankOf(creationId, wk, best), userId: meUserId, name: names[meUserId] ?? '我', score: best, isMe: true };
      }
    }
    return { items, me };
  }

  private async bestScore(creationId: string, userId: string, weekKey?: string): Promise<number> {
    const qb = this.repo
      .createQueryBuilder('s')
      .select('MAX(s.score)', 'best')
      .where('s.creation_id = :c', { c: creationId })
      .andWhere('s.user_id = :u', { u: userId });
    if (weekKey) qb.andWhere('s.week_key = :wk', { wk: weekKey });
    const r = await qb.getRawOne<{ best: string | null }>();
    return Number(r?.best ?? 0);
  }

  /** 名次 = 在该窗口内"个人最高分"严格大于我的用户数 + 1。 */
  private async rankOf(creationId: string, weekKey: string | undefined, score: number): Promise<number> {
    const sub = this.repo
      .createQueryBuilder('s')
      .select('s.user_id', 'uid')
      .addSelect('MAX(s.score)', 'best')
      .where('s.creation_id = :c', { c: creationId })
      .groupBy('s.user_id');
    if (weekKey) sub.andWhere('s.week_key = :wk', { wk: weekKey });
    const rows = await sub.getRawMany<{ uid: string; best: string }>();
    const higher = rows.filter((r) => Number(r.best) > score).length;
    return higher + 1;
  }

  private async resolveNames(userIds: string[]): Promise<Record<string, string>> {
    const out: Record<string, string> = {};
    if (!this.userRepo || userIds.length === 0) return out;
    try {
      const users = await this.userRepo.findByIds(userIds);
      for (const u of users) {
        out[u.id] = (u as any).nickname || (u as any).agentrixId || (u as any).email?.split('@')[0] || '玩家';
      }
    } catch {
      /* names best-effort */
    }
    return out;
  }
}
