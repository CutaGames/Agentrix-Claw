import { Injectable, Logger, BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { PredictionMarketEntity, PredictionOption, PredictionStatus } from './entities/prediction-market.entity';
import { PredictionStakeEntity } from './entities/prediction-stake.entity';
import { AxpService } from '../axp/axp.service';

const MIN_STAKE = 1;
const MAX_STAKE = 50_000;
/** 兜底管理员(运营):种子 owner。可用 env PREDICTION_ADMIN_USER_IDS 扩展。 */
const FALLBACK_ADMIN = '90060951-6838-4722-a39b-7e32ccd428b1';

export interface MarketView extends Omit<PredictionMarketEntity, 'updatedAt' | 'settledAt'> {
  /** 各选项隐含赔率(总池/选项池;仅展示,parimutuel 结算时按实际池重算)。 */
  impliedOdds: Record<string, number>;
  myStakes?: { optionId: string; amount: number; payout: number | null }[];
}

/**
 * PredictionService — 事件预测市场(parimutuel 彩池,AXP)。
 *
 * 下注汇入按选项分桶的彩池;结算时命中选项下注者按比例瓜分 `总池×(1-rake)`,平台收 rake。
 * 平台不担庄家风险。创建/锁定/结算/取消限管理员(运营/裁决)。下注/退款经 AxpService 权威结算。
 * 合规:竞猜类受地区监管,上线前法务确认 + 地区门控 + 广告/年龄合规;AXP 为实用积分非法币。
 */
@Injectable()
export class PredictionService {
  private readonly logger = new Logger(PredictionService.name);
  private readonly admins: Set<string>;

  constructor(
    @InjectRepository(PredictionMarketEntity)
    private readonly markets: Repository<PredictionMarketEntity>,
    @InjectRepository(PredictionStakeEntity)
    private readonly stakes: Repository<PredictionStakeEntity>,
    private readonly axp: AxpService,
  ) {
    const env = (process.env.PREDICTION_ADMIN_USER_IDS || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    this.admins = new Set([FALLBACK_ADMIN, ...env]);
  }

  isAdmin(userId?: string): boolean {
    return !!userId && this.admins.has(userId);
  }
  private assertAdmin(userId?: string) {
    if (!this.isAdmin(userId)) throw new ForbiddenException('需要运营权限');
  }

  // ── Read ────────────────────────────────────────────────

  async list(category?: string, status?: PredictionStatus): Promise<MarketView[]> {
    const qb = this.markets.createQueryBuilder('m').orderBy('m.created_at', 'DESC').limit(100);
    if (category) qb.andWhere('m.category = :c', { c: category });
    if (status) qb.andWhere('m.status = :s', { s: status });
    const rows = await qb.getMany();
    return rows.map((m) => this.toView(m));
  }

  async get(id: string, meUserId?: string): Promise<MarketView> {
    const m = await this.markets.findOne({ where: { id } });
    if (!m) throw new NotFoundException('市场不存在');
    const view = this.toView(m);
    if (meUserId) {
      const mine = await this.stakes.find({ where: { marketId: id, userId: meUserId } });
      view.myStakes = mine.map((s) => ({ optionId: s.optionId, amount: s.amount, payout: s.payout }));
    }
    return view;
  }

  // ── Stake (下注) ────────────────────────────────────────

  async stake(
    userId: string,
    marketId: string,
    optionId: string,
    amount: number,
  ): Promise<{ ok: boolean; amount: number; totalPool: number; myTotalOnOption: number }> {
    if (!userId) throw new BadRequestException('未认证');
    const amt = Math.floor(Number(amount));
    if (!Number.isInteger(amt) || amt < MIN_STAKE || amt > MAX_STAKE) {
      throw new BadRequestException(`下注额需为 ${MIN_STAKE}~${MAX_STAKE} 的整数 AXP`);
    }
    const m = await this.markets.findOne({ where: { id: marketId } });
    if (!m) throw new NotFoundException('市场不存在');
    if (m.status !== 'open') throw new BadRequestException('该预测已封盘');
    if (m.locksAt && m.locksAt.getTime() <= Date.now()) throw new BadRequestException('已过截止时间');
    if (!m.options.some((o) => o.id === optionId)) throw new BadRequestException('选项不存在');

    const refId = `pstake-${marketId}-${userId}-${Date.now()}`;
    await this.axp.spend({
      userId, source: 'prediction_stake', amount: amt, refId,
      note: `预测下注:${m.title}`, metadata: { marketId, optionId },
    } as any);

    await this.stakes.save(
      this.stakes.create({ marketId, userId, optionId, amount: amt, payout: null, refunded: false }),
    );
    // 更新彩池(读改写;并发下注的精确总额以 stakes 表为真相,这里维护快照)。
    m.poolByOption = { ...(m.poolByOption || {}) };
    m.poolByOption[optionId] = (m.poolByOption[optionId] || 0) + amt;
    m.totalPool = (m.totalPool || 0) + amt;
    await this.markets.save(m);

    const myTotalOnOption = await this.stakes
      .createQueryBuilder('s')
      .select('COALESCE(SUM(s.amount),0)', 'sum')
      .where('s.market_id = :m', { m: marketId })
      .andWhere('s.user_id = :u', { u: userId })
      .andWhere('s.option_id = :o', { o: optionId })
      .getRawOne<{ sum: string }>();

    return { ok: true, amount: amt, totalPool: m.totalPool, myTotalOnOption: Number(myTotalOnOption?.sum ?? amt) };
  }

  // ── Admin: create / lock / settle / cancel ──────────────

  async create(
    userId: string,
    input: { title: string; category?: string; subtitle?: string; options: PredictionOption[]; rakeBps?: number; locksAt?: string | null },
  ): Promise<MarketView> {
    this.assertAdmin(userId);
    if (!input.title || !Array.isArray(input.options) || input.options.length < 2) {
      throw new BadRequestException('需要标题和至少 2 个选项');
    }
    const m = this.markets.create({
      title: input.title.slice(0, 200),
      category: (input.category || 'custom').slice(0, 40),
      subtitle: input.subtitle?.slice(0, 400) ?? null,
      options: input.options.map((o, i) => ({ id: o.id || `o${i + 1}`, label: String(o.label).slice(0, 80) })),
      status: 'open',
      poolByOption: {},
      totalPool: 0,
      rakeBps: Math.max(0, Math.min(2000, input.rakeBps ?? 500)),
      locksAt: input.locksAt ? new Date(input.locksAt) : null,
      createdBy: userId,
      winningOptionId: null,
      settledAt: null,
    });
    return this.toView(await this.markets.save(m));
  }

  async lock(userId: string, marketId: string): Promise<MarketView> {
    this.assertAdmin(userId);
    const m = await this.getOrThrow(marketId);
    if (m.status === 'open') { m.status = 'locked'; await this.markets.save(m); }
    return this.toView(m);
  }

  /** 结算:parimutuel 派彩。命中选项无人下注 → 全额退款(push)。 */
  async settle(userId: string, marketId: string, winningOptionId: string): Promise<{ ok: boolean; distributable: number; winners: number }> {
    this.assertAdmin(userId);
    const m = await this.getOrThrow(marketId);
    if (m.status === 'settled' || m.status === 'cancelled') throw new BadRequestException('已结算/已取消');
    if (!m.options.some((o) => o.id === winningOptionId)) throw new BadRequestException('命中选项不存在');

    const all = await this.stakes.find({ where: { marketId } });
    const winners = all.filter((s) => s.optionId === winningOptionId);
    const winningPool = winners.reduce((a, s) => a + s.amount, 0);

    // 命中无人下注 → push:全额退款。
    if (winningPool === 0) {
      await this.refundAll(all, '预测无人命中,全额退款');
      m.status = 'settled'; m.winningOptionId = winningOptionId; m.settledAt = new Date();
      await this.markets.save(m);
      return { ok: true, distributable: 0, winners: 0 };
    }

    const distributable = Math.floor((m.totalPool || 0) * (1 - m.rakeBps / 10000));
    for (const s of winners) {
      const payout = Math.floor((s.amount / winningPool) * distributable);
      s.payout = payout;
      if (payout > 0) {
        try {
          await this.axp.earn({
            userId: s.userId, source: 'prediction_payout', amount: payout,
            refId: `ppay-${s.id}`, note: `预测命中派彩:${m.title}`, metadata: { marketId, optionId: winningOptionId },
          } as any);
        } catch (e: any) {
          this.logger.error(`payout failed stake=${s.id}: ${e?.message}`);
        }
      }
    }
    // 未命中标记 payout=0。
    for (const s of all) if (s.optionId !== winningOptionId && s.payout == null) s.payout = 0;
    await this.stakes.save(all);

    m.status = 'settled'; m.winningOptionId = winningOptionId; m.settledAt = new Date();
    await this.markets.save(m);
    this.logger.log(`settled market=${marketId} win=${winningOptionId} distributable=${distributable} winners=${winners.length}`);
    return { ok: true, distributable, winners: winners.length };
  }

  async cancel(userId: string, marketId: string): Promise<{ ok: boolean; refunded: number }> {
    this.assertAdmin(userId);
    const m = await this.getOrThrow(marketId);
    if (m.status === 'settled') throw new BadRequestException('已结算不可取消');
    const all = await this.stakes.find({ where: { marketId } });
    const n = await this.refundAll(all, `预测取消退款:${m.title}`);
    m.status = 'cancelled'; m.settledAt = new Date();
    await this.markets.save(m);
    return { ok: true, refunded: n };
  }

  // ── Internal ────────────────────────────────────────────

  private async refundAll(all: PredictionStakeEntity[], note: string): Promise<number> {
    let n = 0;
    for (const s of all) {
      if (s.refunded || s.amount <= 0) continue;
      try {
        await this.axp.earn({
          userId: s.userId, source: 'prediction_refund', amount: s.amount,
          refId: `pref-${s.id}`, note, metadata: { marketId: s.marketId },
        } as any);
        s.refunded = true; s.payout = 0; n++;
      } catch (e: any) {
        this.logger.error(`refund failed stake=${s.id}: ${e?.message}`);
      }
    }
    if (all.length) await this.stakes.save(all);
    return n;
  }

  private async getOrThrow(id: string): Promise<PredictionMarketEntity> {
    const m = await this.markets.findOne({ where: { id } });
    if (!m) throw new NotFoundException('市场不存在');
    return m;
  }

  private toView(m: PredictionMarketEntity): MarketView {
    const impliedOdds: Record<string, number> = {};
    const total = m.totalPool || 0;
    for (const o of m.options) {
      const pool = (m.poolByOption || {})[o.id] || 0;
      impliedOdds[o.id] = pool > 0 ? Math.round((total / pool) * 100) / 100 : 0;
    }
    const { updatedAt, settledAt, ...rest } = m as any;
    return { ...(rest as any), impliedOdds };
  }
}
