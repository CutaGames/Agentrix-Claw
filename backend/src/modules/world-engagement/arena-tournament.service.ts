import { Injectable, Logger, BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { ArenaTournamentEntity } from './entities/arena-tournament.entity';
import { ArenaEntryEntity } from './entities/arena-entry.entity';
import { GameScoreEntity } from './entities/game-score.entity';
import { AxpService } from '../axp/axp.service';

const FALLBACK_ADMIN = '90060951-6838-4722-a39b-7e32ccd428b1';

/**
 * ArenaTournamentService — 技能对赛奖池(P0-②)。报名费进池,结算按窗口内最高分排名瓜分。
 */
@Injectable()
export class ArenaTournamentService {
  private readonly logger = new Logger(ArenaTournamentService.name);
  private readonly admins: Set<string>;

  constructor(
    @InjectRepository(ArenaTournamentEntity) private readonly tours: Repository<ArenaTournamentEntity>,
    @InjectRepository(ArenaEntryEntity) private readonly entries: Repository<ArenaEntryEntity>,
    @InjectRepository(GameScoreEntity) private readonly scores: Repository<GameScoreEntity>,
    private readonly axp: AxpService,
  ) {
    const env = (process.env.PREDICTION_ADMIN_USER_IDS || '').split(',').map((s) => s.trim()).filter(Boolean);
    this.admins = new Set([FALLBACK_ADMIN, ...env]);
  }

  isAdmin(userId?: string): boolean {
    return !!userId && this.admins.has(userId);
  }
  private assertAdmin(userId?: string) {
    if (!this.isAdmin(userId)) throw new ForbiddenException('需要运营权限');
  }

  async list(creationId?: string): Promise<any[]> {
    const qb = this.tours.createQueryBuilder('tm').orderBy('tm.created_at', 'DESC').limit(50);
    if (creationId) qb.where('tm.creation_id = :c', { c: creationId });
    return qb.getMany();
  }

  async get(id: string, meUserId?: string): Promise<any> {
    const tm = await this.getOrThrow(id);
    const all = await this.entries.find({ where: { tournamentId: id } });
    const mine = meUserId ? all.find((e) => e.userId === meUserId) : undefined;
    return { ...tm, entrants: all.length, joined: !!mine, myEntry: mine ?? null };
  }

  /** 报名:扣报名费(arena_entry)→ 记一条 entry(每人一次)→ 奖池累加。 */
  async join(userId: string, tournamentId: string): Promise<{ ok: boolean; entrants: number; prizePool: number }> {
    if (!userId) throw new BadRequestException('未认证');
    const tm = await this.getOrThrow(tournamentId);
    if (tm.status !== 'open') throw new BadRequestException('赛事已结束');
    if (tm.endsAt && tm.endsAt.getTime() <= Date.now()) throw new BadRequestException('已过截止时间');
    const existing = await this.entries.findOne({ where: { tournamentId, userId } });
    if (existing) throw new BadRequestException('你已报名');

    const refId = `arena-join-${tournamentId}-${userId}`;
    await this.axp.spend({
      userId, source: 'arena_entry', amount: tm.entryFeeAxp, refId,
      note: `对赛报名:${tm.title}`, metadata: { tournamentId },
    } as any);
    await this.entries.save(this.entries.create({ tournamentId, userId, paid: tm.entryFeeAxp, bestScore: null, payout: null, refunded: false }));
    tm.prizePool = (tm.prizePool || 0) + tm.entryFeeAxp;
    await this.tours.save(tm);
    const entrants = await this.entries.count({ where: { tournamentId } });
    return { ok: true, entrants, prizePool: tm.prizePool };
  }

  async create(userId: string, input: { creationId: string; title: string; entryFeeAxp: number; rakeBps?: number; payoutSplits?: number[]; endsAt?: string | null }): Promise<any> {
    this.assertAdmin(userId);
    if (!input.creationId || !input.title || !(input.entryFeeAxp > 0)) throw new BadRequestException('参数不全');
    const tm = this.tours.create({
      creationId: input.creationId,
      title: input.title.slice(0, 160),
      entryFeeAxp: Math.floor(input.entryFeeAxp),
      rakeBps: Math.max(0, Math.min(3000, input.rakeBps ?? 1000)),
      payoutSplits: Array.isArray(input.payoutSplits) && input.payoutSplits.length ? input.payoutSplits : [0.5, 0.3, 0.2],
      status: 'open',
      prizePool: 0,
      startsAt: new Date(),
      endsAt: input.endsAt ? new Date(input.endsAt) : null,
      createdBy: userId,
      settledAt: null,
    });
    return this.tours.save(tm);
  }

  /** 结算:读窗口内每位报名者在该游戏的最高分 → 排名 → 前 N 名按 splits 瓜分 池×(1-rake)。 */
  async settle(userId: string, tournamentId: string): Promise<{ ok: boolean; distributable: number; ranked: { userId: string; score: number; payout: number }[] }> {
    this.assertAdmin(userId);
    const tm = await this.getOrThrow(tournamentId);
    if (tm.status !== 'open') throw new BadRequestException('已结算/已取消');
    const all = await this.entries.find({ where: { tournamentId } });

    // 每位报名者在 [startsAt, now] 窗口内该游戏的最高分。
    const ranked: { entry: ArenaEntryEntity; score: number }[] = [];
    for (const e of all) {
      const row = await this.scores
        .createQueryBuilder('s')
        .select('MAX(s.score)', 'best')
        .where('s.creation_id = :c', { c: tm.creationId })
        .andWhere('s.user_id = :u', { u: e.userId })
        .andWhere('s.created_at >= :start', { start: tm.startsAt })
        .getRawOne<{ best: string | null }>();
      ranked.push({ entry: e, score: Number(row?.best ?? 0) });
    }
    ranked.sort((a, b) => b.score - a.score);

    const distributable = Math.floor((tm.prizePool || 0) * (1 - tm.rakeBps / 10000));
    const splits = tm.payoutSplits || [0.5, 0.3, 0.2];
    const out: { userId: string; score: number; payout: number }[] = [];
    for (let i = 0; i < ranked.length; i++) {
      const r = ranked[i];
      const share = i < splits.length ? splits[i] : 0;
      const payout = share > 0 && r.score > 0 ? Math.floor(distributable * share) : 0;
      r.entry.bestScore = r.score;
      r.entry.payout = payout;
      if (payout > 0) {
        try {
          await this.axp.earn({
            userId: r.entry.userId, source: 'arena_prize', amount: payout,
            refId: `arena-prize-${r.entry.id}`, note: `对赛奖金 #${i + 1}:${tm.title}`, metadata: { tournamentId, rank: i + 1 },
          } as any);
        } catch (err: any) {
          this.logger.error(`arena payout failed entry=${r.entry.id}: ${err?.message}`);
        }
      }
      out.push({ userId: r.entry.userId, score: r.score, payout });
    }
    await this.entries.save(ranked.map((r) => r.entry));
    tm.status = 'settled'; tm.settledAt = new Date();
    await this.tours.save(tm);
    this.logger.log(`arena settled ${tournamentId} pool=${tm.prizePool} distributable=${distributable} entrants=${all.length}`);
    return { ok: true, distributable, ranked: out };
  }

  async cancel(userId: string, tournamentId: string): Promise<{ ok: boolean; refunded: number }> {
    this.assertAdmin(userId);
    const tm = await this.getOrThrow(tournamentId);
    if (tm.status === 'settled') throw new BadRequestException('已结算不可取消');
    const all = await this.entries.find({ where: { tournamentId } });
    let n = 0;
    for (const e of all) {
      if (e.refunded || e.paid <= 0) continue;
      try {
        await this.axp.earn({
          userId: e.userId, source: 'arena_refund', amount: e.paid,
          refId: `arena-refund-${e.id}`, note: `对赛取消退款:${tm.title}`, metadata: { tournamentId },
        } as any);
        e.refunded = true; e.payout = 0; n++;
      } catch (err: any) {
        this.logger.error(`arena refund failed entry=${e.id}: ${err?.message}`);
      }
    }
    if (all.length) await this.entries.save(all);
    tm.status = 'cancelled'; tm.settledAt = new Date();
    await this.tours.save(tm);
    return { ok: true, refunded: n };
  }

  private async getOrThrow(id: string): Promise<ArenaTournamentEntity> {
    const tm = await this.tours.findOne({ where: { id } });
    if (!tm) throw new NotFoundException('赛事不存在');
    return tm;
  }
}
