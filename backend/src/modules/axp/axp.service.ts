import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, LessThan } from 'typeorm';
import { UserAxpLedger } from '../../entities/user-axp-ledger.entity';
import { UserAxpBalance } from '../../entities/user-axp-balance.entity';
import { emitDesktopSyncEvent } from '../desktop-sync/desktop-sync.events';
import {
  AXP_AMOUNTS,
  AXP_DAILY_CAPS,
  AXP_DEFAULT_EXPIRY_DAYS,
  AXP_EARN_SOURCES,
  AXP_SPEND_SOURCES,
} from './axp.constants';

/**
 * Earn sources whose grants must be **exactly-once per (userId, source, refId)**.
 *
 * For these sources a provided `refId` is treated as an idempotency key:
 * repeated calls with the same key are no-ops (no second ledger row, no
 * balance increment). This is enforced two ways:
 *   1. an in-transaction "existing row by (userId, source, refId)" pre-check, and
 *   2. a partial UNIQUE INDEX `uq_user_axp_ledger_reality_reward_idem`
 *      (`user_id, source, ref_id` WHERE `ref_id IS NOT NULL AND source = 'aeon_reality_reward'`)
 *      as a concurrency safety net (Postgres 23505 → no-op).
 *
 * Scope is intentionally narrow: most earn sources legitimately reuse the
 * same `refId` across multiple distinct grants (e.g. `coraising_owner` /
 * `coraising_feed` use `refId=invite.id` per feed, `aeon_wage` uses
 * `refId=org.id` per pay period, photo-mimic re-grants `game_participate`
 * with `refId=entry.id` at settle). Deduping those would drop real rewards,
 * so idempotency applies only to sources where the same key means the same
 * one-time grant.
 *
 * `aeon_reality_reward` covers both Correctness-Property-8 paths
 * (soul-companion-onboarding design §4/§2): `first_task`
 * (`rewardFromReality`, fixed key `soul-birth-first-task-{userId}`) and
 * `settle_aeon` (`checkIn` → `creditWallet`, key `checkin-{plotId}-{day}`).
 */
const IDEMPOTENT_EARN_SOURCES = new Set<string>([
  'aeon_reality_reward',
  // Pet Earning Flywheel (需求 4): 拉新双边奖励 + GMV 返佣须精确一次。
  // refId = user_referrals 关系 id（signup）/ 成交单 id（gmv）。
  // 并发安全网见迁移 uq_user_axp_ledger_referral_idem。
  'referral_signup',
  'referral_gmv_pct',
]);

/**
 * Spend sources whose deductions must be **exactly-once per (userId, source, refId)**.
 *
 * Pet Earning Flywheel (需求 5): 收益兑付（AXP 抵扣消费）以业务订单 id 作 refId，
 * 重复提交不得双扣。机制对齐 earn：事务内 (userId, source, refId) 预检 no-op +
 * 并发用 partial UNIQUE INDEX `uq_user_axp_ledger_spend_idem`（Postgres 23505 → no-op）。
 * 作用域限定到下列兑付类 spend source；其余 spend（如 lsm_stake 每注独立）不受影响。
 */
const IDEMPOTENT_SPEND_SOURCES = new Set<string>([
  'sub_discount',
  'skill_discount',
  'skin_discount',
  'redeem_skin',
]);

export interface EarnInput {
  userId: string;
  source: string;
  amount: number;
  refId?: string | null;
  note?: string | null;
  metadata?: Record<string, unknown>;
  expiryDays?: number;
}

export interface SpendInput {
  userId: string;
  source: string;
  amount: number;
  refId?: string | null;
  note?: string | null;
  metadata?: Record<string, unknown>;
}

export interface AxpBalanceView {
  balance: number;
  lifetime_earned: number;
  lifetime_spent: number;
  lifetime_expired: number;
  usd_value_cents: number;
  updated_at: number;
}

/**
 * AXP core service — earn / spend / expire / balance lookup.
 *
 * All writes go through a single atomic transaction: append ledger row
 * + update snapshot balance. Reads hit `user_axp_balances` (O(1)). The
 * expiry job (daily cron) is in `AxpExpiryService` — see module bootstrap.
 */
@Injectable()
export class AxpService {
  private readonly logger = new Logger(AxpService.name);

  constructor(
    @InjectRepository(UserAxpLedger)
    private readonly ledger: Repository<UserAxpLedger>,
    @InjectRepository(UserAxpBalance)
    private readonly balances: Repository<UserAxpBalance>,
    private readonly dataSource: DataSource,
  ) {}

  // ── Read ────────────────────────────────────────────────────

  async getBalance(userId: string): Promise<AxpBalanceView> {
    const row = await this.balances.findOne({ where: { userId } });
    const balance = row ? Number(row.balance) : 0;
    const lifetime_earned = row ? Number(row.lifetimeEarned) : 0;
    const lifetime_spent = row ? Number(row.lifetimeSpent) : 0;
    const lifetime_expired = row ? Number(row.lifetimeExpired) : 0;
    return {
      balance,
      lifetime_earned,
      lifetime_spent,
      lifetime_expired,
      // 1 AXP = 0.1 cent — so balance * 0.1 → cents
      usd_value_cents: Math.round(balance * 0.1),
      updated_at: row?.updatedAt?.getTime() ?? Date.now(),
    };
  }

  async listHistory(userId: string, limit = 50, cursor?: string) {
    const qb = this.ledger
      .createQueryBuilder('l')
      .where('l.user_id = :userId', { userId })
      .orderBy('l.created_at', 'DESC')
      .limit(Math.min(limit, 200));
    if (cursor) {
      qb.andWhere('l.created_at < :cursor', { cursor: new Date(cursor) });
    }
    const rows = await qb.getMany();
    return {
      items: rows.map((r) => ({
        id: r.id,
        direction: r.direction,
        amount: Number(r.amount),
        source: r.source,
        ref_id: r.refId,
        note: r.note,
        expires_at: r.expiresAt?.getTime() ?? null,
        created_at: r.createdAt.getTime(),
      })),
      next_cursor: rows.length === limit ? rows[rows.length - 1].createdAt.toISOString() : null,
    };
  }

  // ── Write ───────────────────────────────────────────────────

  async earn(input: EarnInput): Promise<{ ledger_id: string; balance: number }> {
    if (!AXP_EARN_SOURCES.has(input.source)) {
      throw new BadRequestException(`invalid earn source: ${input.source}`);
    }
    if (input.amount <= 0 || !Number.isFinite(input.amount)) {
      throw new BadRequestException(`amount must be > 0`);
    }
    const cap = AXP_DAILY_CAPS[input.source];
    if (cap && cap > 0) {
      const dayStart = new Date();
      dayStart.setUTCHours(0, 0, 0, 0);
      const used = await this.ledger.count({
        where: {
          userId: input.userId,
          source: input.source,
          direction: 'earn',
        },
      });
      // Quick cap — a proper fix would filter by created_at >= dayStart
      // which we do in a second guard for DB-heavy use:
      const usedToday = await this.ledger
        .createQueryBuilder('l')
        .where('l.user_id = :u', { u: input.userId })
        .andWhere('l.source = :s', { s: input.source })
        .andWhere('l.direction = :d', { d: 'earn' })
        .andWhere('l.created_at >= :dayStart', { dayStart })
        .getCount();
      if (usedToday >= cap) {
        throw new BadRequestException(`daily cap reached for ${input.source} (${cap}/day)`);
      }
    }

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + (input.expiryDays ?? AXP_DEFAULT_EXPIRY_DAYS));

    // Idempotency: for exactly-once sources a provided refId is the dedup key.
    const idempotent =
      input.refId != null && IDEMPOTENT_EARN_SOURCES.has(input.source);

    const runEarn = () =>
      this.dataSource.transaction(async (manager) => {
        // Exactly-once guard: if a grant for (userId, source, refId) already
        // exists, treat this call as a no-op and return the current balance —
        // no second ledger row, no balance increment, no "+N AXP" broadcast.
        if (idempotent) {
          const existing = await manager.findOne(UserAxpLedger, {
            where: {
              userId: input.userId,
              source: input.source,
              refId: input.refId as string,
            },
          });
          if (existing) {
            const cur = await manager.findOne(UserAxpBalance, {
              where: { userId: input.userId },
            });
            return { ledger_id: existing.id, balance: Number(cur?.balance ?? 0) };
          }
        }

        const row = manager.create(UserAxpLedger, {
          userId: input.userId,
          direction: 'earn',
          amount: String(input.amount),
          source: input.source,
          refId: input.refId ?? null,
          note: input.note ?? null,
          expiresAt,
          metadata: input.metadata ?? {},
        });
        await manager.save(row);
        await this.upsertBalance(manager, input.userId, {
          delta: input.amount,
          earned: input.amount,
          spent: 0,
          expired: 0,
        });
        const bal = await manager.findOne(UserAxpBalance, { where: { userId: input.userId } });
        const result = { ledger_id: row.id, balance: Number(bal?.balance ?? 0) };

        // DE1: broadcast to all connected devices so the desktop/web can
        // render a head-bubble "+N AXP" toast even if the earn was
        // triggered from another device.
        try {
          emitDesktopSyncEvent(input.userId, 'axp:earned', {
            amount: input.amount,
            source: input.source,
            note: input.note ?? null,
            ref_id: input.refId ?? null,
            balance: result.balance,
          });
        } catch {}

        return result;
      });

    if (!idempotent) return runEarn();

    // Concurrency safety net: if two requests race past the pre-check, the
    // partial unique index rejects the second insert (Postgres 23505). The
    // aborted transaction is rolled back; re-read the committed balance and
    // return the same no-op result so the grant stays exactly-once.
    try {
      return await runEarn();
    } catch (e: any) {
      if (e?.code === '23505') {
        const existing = await this.ledger.findOne({
          where: {
            userId: input.userId,
            source: input.source,
            refId: input.refId as string,
          },
        });
        const bal = await this.balances.findOne({ where: { userId: input.userId } });
        return { ledger_id: existing?.id ?? '', balance: Number(bal?.balance ?? 0) };
      }
      throw e;
    }
  }

  async spend(input: SpendInput): Promise<{ ledger_id: string; balance: number }> {
    if (!AXP_SPEND_SOURCES.has(input.source)) {
      throw new BadRequestException(`invalid spend source: ${input.source}`);
    }
    if (input.amount <= 0 || !Number.isFinite(input.amount)) {
      throw new BadRequestException(`amount must be > 0`);
    }

    // Idempotency: for exactly-once spend sources a provided refId is the dedup key.
    const idempotent =
      input.refId != null && IDEMPOTENT_SPEND_SOURCES.has(input.source);

    const runSpend = () =>
      this.dataSource.transaction(async (manager) => {
        // Exactly-once guard: if a spend for (userId, source, refId) already
        // exists, treat this call as a no-op and return the current balance —
        // no second ledger row, no balance decrement.
        if (idempotent) {
          const existing = await manager.findOne(UserAxpLedger, {
            where: {
              userId: input.userId,
              direction: 'spend',
              source: input.source,
              refId: input.refId as string,
            },
          });
          if (existing) {
            const cur = await manager.findOne(UserAxpBalance, {
              where: { userId: input.userId },
            });
            return { ledger_id: existing.id, balance: Number(cur?.balance ?? 0) };
          }
        }

        const bal = await manager.findOne(UserAxpBalance, { where: { userId: input.userId } });
        const current = bal ? Number(bal.balance) : 0;
        if (current < input.amount) {
          throw new BadRequestException(
            `insufficient AXP balance (have ${current}, need ${input.amount})`,
          );
        }
        const row = manager.create(UserAxpLedger, {
          userId: input.userId,
          direction: 'spend',
          amount: String(input.amount),
          source: input.source,
          refId: input.refId ?? null,
          note: input.note ?? null,
          metadata: input.metadata ?? {},
        });
        await manager.save(row);
        await this.upsertBalance(manager, input.userId, {
          delta: -input.amount,
          earned: 0,
          spent: input.amount,
          expired: 0,
        });
        const refreshed = await manager.findOne(UserAxpBalance, {
          where: { userId: input.userId },
        });
        return { ledger_id: row.id, balance: Number(refreshed?.balance ?? 0) };
      });

    if (!idempotent) return runSpend();

    // Concurrency safety net: if two requests race past the pre-check, the
    // partial unique index rejects the second insert (Postgres 23505). The
    // aborted transaction is rolled back; re-read the committed balance and
    // return the same no-op result so the deduction stays exactly-once.
    try {
      return await runSpend();
    } catch (e: any) {
      if (e?.code === '23505') {
        const existing = await this.ledger.findOne({
          where: {
            userId: input.userId,
            direction: 'spend',
            source: input.source,
            refId: input.refId as string,
          },
        });
        const bal = await this.balances.findOne({ where: { userId: input.userId } });
        return { ledger_id: existing?.id ?? '', balance: Number(bal?.balance ?? 0) };
      }
      throw e;
    }
  }

  /**
   * Adjust — admin grant / correction. Records with direction='adjust'.
   */
  async adjust(
    userId: string,
    amount: number,
    note: string,
    actorId?: string,
  ): Promise<{ ledger_id: string; balance: number }> {
    if (amount === 0) throw new BadRequestException('amount must be non-zero');
    return this.dataSource.transaction(async (manager) => {
      const row = manager.create(UserAxpLedger, {
        userId,
        direction: 'adjust',
        amount: String(Math.abs(amount)),
        source: 'admin_grant',
        note,
        metadata: { actorId: actorId ?? null, sign: amount > 0 ? 'pos' : 'neg' },
      });
      await manager.save(row);
      await this.upsertBalance(manager, userId, {
        delta: amount,
        earned: amount > 0 ? amount : 0,
        spent: amount < 0 ? -amount : 0,
        expired: 0,
      });
      const bal = await manager.findOne(UserAxpBalance, { where: { userId } });
      return { ledger_id: row.id, balance: Number(bal?.balance ?? 0) };
    });
  }

  /**
   * Cron-targeted expiry — drain expired earn rows' AXP from balance.
   * Invoked daily. Returns number of users affected.
   */
  async expireOldEarnRows(batchLimit = 500): Promise<number> {
    const now = new Date();
    // Find distinct users with expired earn rows that still contribute
    // positively (not yet reconciled). A simpler model: for each earn row
    // past expiry, write an `expire` row and decrement balance. FIFO is
    // implicit by the earn's `expires_at`.
    const expired = await this.ledger.find({
      where: {
        direction: 'earn',
        expiresAt: LessThan(now),
        // The metadata flag below keeps expired-but-already-drained rows
        // out of this scan on re-runs.
      },
      take: batchLimit,
      order: { expiresAt: 'ASC' },
    });
    const unprocessed = expired.filter((r) => !(r.metadata as any)?.expiredAccounted);
    let affectedUsers = 0;
    const seen = new Set<string>();
    for (const r of unprocessed) {
      try {
        await this.dataSource.transaction(async (manager) => {
          // Write expire row (mirror of earn amount, direction='expire')
          const expireRow = manager.create(UserAxpLedger, {
            userId: r.userId,
            direction: 'expire',
            amount: r.amount,
            source: 'expire_12mo',
            refId: r.id,
            note: `expired from ledger ${r.id}`,
            metadata: { expiredFrom: r.id },
          });
          await manager.save(expireRow);
          await manager.update(
            UserAxpLedger,
            { id: r.id },
            { metadata: { ...(r.metadata as any), expiredAccounted: true } },
          );
          await this.upsertBalance(manager, r.userId, {
            delta: -Number(r.amount),
            earned: 0,
            spent: 0,
            expired: Number(r.amount),
          });
          if (!seen.has(r.userId)) {
            seen.add(r.userId);
            affectedUsers++;
          }
        });
      } catch (e) {
        this.logger.warn(
          `expire transaction failed for ledger ${r.id}: ${(e as Error).message}`,
        );
      }
    }
    if (affectedUsers > 0) {
      this.logger.log(`AXP expiry: ${affectedUsers} users, ${unprocessed.length} rows`);
    }
    return affectedUsers;
  }

  // ── Internal ────────────────────────────────────────────────

  private async upsertBalance(
    manager: any,
    userId: string,
    diff: { delta: number; earned: number; spent: number; expired: number },
  ) {
    const existing = await manager.findOne(UserAxpBalance, { where: { userId } });
    if (!existing) {
      await manager.save(
        manager.create(UserAxpBalance, {
          userId,
          balance: String(Math.max(0, diff.delta)),
          lifetimeEarned: String(Math.max(0, diff.earned)),
          lifetimeSpent: String(Math.max(0, diff.spent)),
          lifetimeExpired: String(Math.max(0, diff.expired)),
        }),
      );
      return;
    }
    const newBal = Math.max(0, Number(existing.balance) + diff.delta);
    await manager.update(
      UserAxpBalance,
      { userId },
      {
        balance: String(newBal),
        lifetimeEarned: String(Number(existing.lifetimeEarned) + diff.earned),
        lifetimeSpent: String(Number(existing.lifetimeSpent) + diff.spent),
        lifetimeExpired: String(Number(existing.lifetimeExpired) + diff.expired),
      },
    );
  }
}
