import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UserAxpLedger } from '../../entities/user-axp-ledger.entity';
import { Payment } from '../../entities/payment.entity';
import { AgentAccount } from '../../entities/agent-account.entity';
import { AxpService } from '../axp/axp.service';
import { categoryForSource, EARNING_CATEGORIES } from './earning-source-map';

export type EarningRange = '7d' | '30d' | 'all';

export interface EarningSummary {
  axp: {
    balance: number;
    lifetimeEarned: number;
    lifetimeSpent: number;
    lifetimeExpired: number;
    usdValueCents: number;
  };
  usdt: {
    lifetimeEarned: number;
    chain: string;
  };
  updatedAt: number;
}

export interface EarningBreakdownItem {
  category: string;
  unit: 'AXP' | 'USDT';
  amount: number;
  count: number;
  pctOfUnit: number;
}

export interface EarningTimelinePoint {
  date: string; // YYYY-MM-DD
  axpEarned: number;
  usdtEarned: number;
}

/**
 * PetEarningsService — 收益中心跨来源聚合（Pet Earning Flywheel 需求 1）。
 * 不造第二套账本：AXP 直接读 AxpService/`user_axp_ledger`；USDT 读集市 crypto 成交
 * （归属用户名下 AgentAccount 收款的 USDT/USDC 完成支付）。两单位分开返回，不相加。
 */
@Injectable()
export class PetEarningsService {
  private readonly logger = new Logger(PetEarningsService.name);
  private static readonly USDT_CHAIN = 'bnb-testnet';
  private static readonly STABLE_CURRENCIES = ['USDT', 'USDC'];

  constructor(
    private readonly axp: AxpService,
    @InjectRepository(UserAxpLedger)
    private readonly ledger: Repository<UserAxpLedger>,
    @InjectRepository(Payment)
    private readonly payments: Repository<Payment>,
    @InjectRepository(AgentAccount)
    private readonly agentAccounts: Repository<AgentAccount>,
  ) {}

  private rangeStart(range: EarningRange): Date | null {
    if (range === 'all') return null;
    const days = range === '7d' ? 7 : 30;
    const d = new Date();
    d.setUTCDate(d.getUTCDate() - days);
    d.setUTCHours(0, 0, 0, 0);
    return d;
  }

  /** 用户名下 AgentAccount id 列表（萌宠绑定的赚钱主体收款归属）。 */
  private async userAgentIds(userId: string): Promise<string[]> {
    try {
      const rows = await this.agentAccounts.find({
        where: { ownerId: userId },
        select: ['id'],
      });
      return rows.map((r) => r.id);
    } catch (e) {
      this.logger.warn(`userAgentIds failed for ${userId}: ${(e as Error).message}`);
      return [];
    }
  }

  /** USDT/USDC 集市收入（归属用户 agent 收款的完成支付）。 */
  private async usdtIncome(userId: string, start: Date | null): Promise<number> {
    try {
      const agentIds = await this.userAgentIds(userId);
      if (agentIds.length === 0) return 0;
      const qb = this.payments
        .createQueryBuilder('p')
        .select('COALESCE(SUM(p.amount), 0)', 'total')
        .where('p.status = :st', { st: 'completed' })
        .andWhere('UPPER(p.currency) IN (:...cur)', {
          cur: PetEarningsService.STABLE_CURRENCIES,
        })
        .andWhere('p.agentId IN (:...ids)', { ids: agentIds });
      if (start) qb.andWhere('p.createdAt >= :start', { start });
      const row = await qb.getRawOne<{ total: string }>();
      return Number(row?.total ?? 0);
    } catch (e) {
      this.logger.warn(`usdtIncome failed for ${userId}: ${(e as Error).message}`);
      return 0; // 降级：USDT 分组返回 0，不阻断 AXP 分组
    }
  }

  async getSummary(userId: string): Promise<EarningSummary> {
    const bal = await this.axp.getBalance(userId);
    const usdt = await this.usdtIncome(userId, null);
    return {
      axp: {
        balance: bal.balance,
        lifetimeEarned: bal.lifetime_earned,
        lifetimeSpent: bal.lifetime_spent,
        lifetimeExpired: bal.lifetime_expired,
        usdValueCents: bal.usd_value_cents,
      },
      usdt: { lifetimeEarned: usdt, chain: PetEarningsService.USDT_CHAIN },
      updatedAt: bal.updated_at,
    };
  }

  async getBreakdown(userId: string, range: EarningRange): Promise<EarningBreakdownItem[]> {
    const start = this.rangeStart(range);
    const items: EarningBreakdownItem[] = [];

    // ── AXP：按 source 分组 → 归并到展示分类 ──
    try {
      const qb = this.ledger
        .createQueryBuilder('l')
        .select('l.source', 'source')
        .addSelect('COALESCE(SUM(l.amount::numeric), 0)', 'total')
        .addSelect('COUNT(*)', 'cnt')
        .where('l.user_id = :userId', { userId })
        .andWhere("l.direction = 'earn'")
        .groupBy('l.source');
      if (start) qb.andWhere('l.created_at >= :start', { start });
      const rows = await qb.getRawMany<{ source: string; total: string; cnt: string }>();

      const byCategory = new Map<string, { amount: number; count: number }>();
      for (const r of rows) {
        const cat = categoryForSource(r.source);
        const cur = byCategory.get(cat) ?? { amount: 0, count: 0 };
        cur.amount += Number(r.total);
        cur.count += Number(r.cnt);
        byCategory.set(cat, cur);
      }
      const axpTotal = Array.from(byCategory.values()).reduce((s, v) => s + v.amount, 0);
      for (const [category, v] of byCategory) {
        items.push({
          category,
          unit: 'AXP',
          amount: v.amount,
          count: v.count,
          pctOfUnit: axpTotal > 0 ? Math.round((v.amount / axpTotal) * 10000) / 100 : 0,
        });
      }
    } catch (e) {
      this.logger.warn(`AXP breakdown failed for ${userId}: ${(e as Error).message}`);
    }

    // ── USDT：独立币种分组（不与 AXP 相加）──
    const usdt = await this.usdtIncome(userId, start);
    if (usdt > 0) {
      items.push({
        category: EARNING_CATEGORIES.OTHER, // 币种分组标签由前端按 unit 呈现
        unit: 'USDT',
        amount: usdt,
        count: 0,
        pctOfUnit: 100,
      });
    }
    return items;
  }

  async getTimeline(userId: string, range: EarningRange): Promise<EarningTimelinePoint[]> {
    const start = this.rangeStart(range);
    const points = new Map<string, EarningTimelinePoint>();

    const ensure = (date: string) => {
      if (!points.has(date)) points.set(date, { date, axpEarned: 0, usdtEarned: 0 });
      return points.get(date)!;
    };

    try {
      const qb = this.ledger
        .createQueryBuilder('l')
        .select("to_char(date_trunc('day', l.created_at), 'YYYY-MM-DD')", 'd')
        .addSelect('COALESCE(SUM(l.amount::numeric), 0)', 'total')
        .where('l.user_id = :userId', { userId })
        .andWhere("l.direction = 'earn'")
        .groupBy('d')
        .orderBy('d', 'ASC');
      if (start) qb.andWhere('l.created_at >= :start', { start });
      const rows = await qb.getRawMany<{ d: string; total: string }>();
      for (const r of rows) ensure(r.d).axpEarned = Number(r.total);
    } catch (e) {
      this.logger.warn(`AXP timeline failed for ${userId}: ${(e as Error).message}`);
    }

    try {
      const agentIds = await this.userAgentIds(userId);
      if (agentIds.length > 0) {
        const qb = this.payments
          .createQueryBuilder('p')
          .select("to_char(date_trunc('day', p.createdAt), 'YYYY-MM-DD')", 'd')
          .addSelect('COALESCE(SUM(p.amount), 0)', 'total')
          .where('p.status = :st', { st: 'completed' })
          .andWhere('UPPER(p.currency) IN (:...cur)', {
            cur: PetEarningsService.STABLE_CURRENCIES,
          })
          .andWhere('p.agentId IN (:...ids)', { ids: agentIds })
          .groupBy('d')
          .orderBy('d', 'ASC');
        if (start) qb.andWhere('p.createdAt >= :start', { start });
        const rows = await qb.getRawMany<{ d: string; total: string }>();
        for (const r of rows) ensure(r.d).usdtEarned = Number(r.total);
      }
    } catch (e) {
      this.logger.warn(`USDT timeline failed for ${userId}: ${(e as Error).message}`);
    }

    return Array.from(points.values()).sort((a, b) => a.date.localeCompare(b.date));
  }
}
