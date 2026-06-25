import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { UserSubscriptionUsage } from '../../entities/user-subscription-usage.entity';
import { AgentCostRecord } from '../../entities/agent-cost-record.entity';
import { User } from '../../entities/user.entity';

/**
 * Multi-Agent v2.1 — Subscription Usage Service.
 *
 * Reads daily/monthly aggregated rows from `user_subscription_usage` so the
 * spawn dispatcher and worker can enforce free-tier daily caps and pro-tier
 * monthly inclusions per `MULTI_AGENT_V2_1_PRODUCT_DECISIONS §3`.
 *
 * Writes happen via `aggregateYesterday()` invoked by the daily cron AND
 * via `recordSubTaskCompletion()` invoked by the worker on each sub-task
 * complete (so live counts approximate within a few seconds — the cron
 * just reconciles).
 */

const FREE_DAILY_CAP = parseInt(process.env.MULTI_AGENT_FREE_DAILY_CAP || '20', 10);
const FREE_MONTHLY_HARD_CAP = parseInt(
  process.env.MULTI_AGENT_FREE_MONTHLY_HARD_CAP || '600',
  10,
);
const PRO_MONTHLY_INCLUDED = parseInt(
  process.env.MULTI_AGENT_PRO_MONTHLY_INCLUDED || '200',
  10,
);
const BUSINESS_MONTHLY_INCLUDED = parseInt(
  process.env.MULTI_AGENT_BUSINESS_MONTHLY_INCLUDED || '1000',
  10,
);

export type SubscriptionTier = 'free' | 'pro' | 'business' | 'enterprise';

export interface UsageQuotaCheck {
  tier: SubscriptionTier;
  /** True when the user is below all caps (allowed to spawn). */
  allowed: boolean;
  /** Why allowed/disallowed — surfaced to leader for inline messaging. */
  reason: string;
  todayCount: number;
  monthCount: number;
  dailyCap: number | null;
  monthlyIncluded: number | null;
  /** Soft warn threshold (80% of monthly inclusion) for pro/business. */
  warningThreshold: number | null;
}

@Injectable()
export class SubscriptionUsageService {
  private readonly logger = new Logger(SubscriptionUsageService.name);

  constructor(
    @InjectRepository(UserSubscriptionUsage)
    private readonly usageRepo: Repository<UserSubscriptionUsage>,
    @InjectRepository(AgentCostRecord)
    private readonly costRepo: Repository<AgentCostRecord>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
  ) {}

  /**
   * Resolve subscription tier from `users.metadata.preferences.subscriptionTier`.
   * Returns 'free' when missing or unknown.
   */
  private resolveTier(user: User | null): SubscriptionTier {
    if (!user) return 'free';
    const raw = (user.metadata as any)?.preferences?.subscriptionTier;
    if (raw === 'pro' || raw === 'business' || raw === 'enterprise') return raw;
    return 'free';
  }

  private todayKey(): { yearMonth: string; day: string } {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    return { yearMonth: `${y}-${m}`, day: `${y}-${m}-${d}` };
  }

  /**
   * Pre-spawn quota check. Reads day + month rows; never throws.
   *
   * Free: rejects if today >= FREE_DAILY_CAP OR month >= FREE_MONTHLY_HARD_CAP.
   * Pro/business: emits `warning` when month >= 80% of inclusion; never rejects
   * (overage is metered via cost-tracker).
   * Enterprise: always allowed.
   */
  async checkQuota(userId: string): Promise<UsageQuotaCheck> {
    const user = await this.userRepo
      .findOne({ where: { id: userId } })
      .catch(() => null);
    const tier = this.resolveTier(user);
    const { yearMonth, day } = this.todayKey();

    let todayCount = 0;
    let monthCount = 0;
    try {
      const dayRow = await this.usageRepo.findOne({
        where: { userId, periodYearMonth: yearMonth, periodDay: day },
      });
      todayCount = dayRow?.subTasksCount ?? 0;
      const monthRow = await this.usageRepo.findOne({
        where: { userId, periodYearMonth: yearMonth, periodDay: null as any },
      });
      monthCount = monthRow?.subTasksCount ?? 0;
    } catch (e) {
      this.logger.warn(`checkQuota read failed: ${(e as any)?.message}`);
    }

    if (tier === 'enterprise') {
      return {
        tier,
        allowed: true,
        reason: 'enterprise tier — unlimited',
        todayCount,
        monthCount,
        dailyCap: null,
        monthlyIncluded: null,
        warningThreshold: null,
      };
    }

    if (tier === 'free') {
      if (todayCount >= FREE_DAILY_CAP) {
        return {
          tier,
          allowed: false,
          reason: `free tier daily cap reached (${todayCount}/${FREE_DAILY_CAP})`,
          todayCount,
          monthCount,
          dailyCap: FREE_DAILY_CAP,
          monthlyIncluded: FREE_MONTHLY_HARD_CAP,
          warningThreshold: null,
        };
      }
      if (monthCount >= FREE_MONTHLY_HARD_CAP) {
        return {
          tier,
          allowed: false,
          reason: `free tier monthly hard cap reached (${monthCount}/${FREE_MONTHLY_HARD_CAP})`,
          todayCount,
          monthCount,
          dailyCap: FREE_DAILY_CAP,
          monthlyIncluded: FREE_MONTHLY_HARD_CAP,
          warningThreshold: null,
        };
      }
      return {
        tier,
        allowed: true,
        reason: `free tier ok (${todayCount}/${FREE_DAILY_CAP} today, ${monthCount}/${FREE_MONTHLY_HARD_CAP} month)`,
        todayCount,
        monthCount,
        dailyCap: FREE_DAILY_CAP,
        monthlyIncluded: FREE_MONTHLY_HARD_CAP,
        warningThreshold: null,
      };
    }

    // pro / business — inclusion + soft warning
    const included = tier === 'pro' ? PRO_MONTHLY_INCLUDED : BUSINESS_MONTHLY_INCLUDED;
    const warningThreshold = Math.floor(included * 0.8);
    return {
      tier,
      allowed: true,
      reason:
        monthCount >= warningThreshold
          ? `${tier} tier — at ${monthCount}/${included} (>=80% of inclusion)`
          : `${tier} tier ok (${monthCount}/${included})`,
      todayCount,
      monthCount,
      dailyCap: null,
      monthlyIncluded: included,
      warningThreshold,
    };
  }

  /**
   * Best-effort live counter bump — called by worker on each sub-task complete.
   * The daily cron reconciles the truth from agent_cost_records.
   */
  async recordSubTaskCompletion(
    userId: string,
    estimatedCostUsd: number,
  ): Promise<void> {
    const user = await this.userRepo
      .findOne({ where: { id: userId } })
      .catch(() => null);
    const tier = this.resolveTier(user);
    const { yearMonth, day } = this.todayKey();

    try {
      // Upsert daily row
      await this.usageRepo.query(
        `
        INSERT INTO user_subscription_usage (
          user_id, period_year_month, period_day,
          sub_tasks_count, total_cost_usd, subscription_tier, last_updated_at
        )
        VALUES ($1, $2, $3, 1, $4, $5, now())
        ON CONFLICT (user_id, period_year_month, period_day)
        WHERE period_day IS NOT NULL
        DO UPDATE SET
          sub_tasks_count = user_subscription_usage.sub_tasks_count + 1,
          total_cost_usd = user_subscription_usage.total_cost_usd + EXCLUDED.total_cost_usd,
          subscription_tier = EXCLUDED.subscription_tier,
          last_updated_at = now()
      `,
        [userId, yearMonth, day, estimatedCostUsd, tier],
      );

      // Upsert monthly row (period_day=null)
      await this.usageRepo.query(
        `
        INSERT INTO user_subscription_usage (
          user_id, period_year_month, period_day,
          sub_tasks_count, total_cost_usd, subscription_tier, last_updated_at
        )
        VALUES ($1, $2, NULL, 1, $3, $4, now())
        ON CONFLICT (user_id, period_year_month)
        WHERE period_day IS NULL
        DO UPDATE SET
          sub_tasks_count = user_subscription_usage.sub_tasks_count + 1,
          total_cost_usd = user_subscription_usage.total_cost_usd + EXCLUDED.total_cost_usd,
          subscription_tier = EXCLUDED.subscription_tier,
          last_updated_at = now()
      `,
        [userId, yearMonth, estimatedCostUsd, tier],
      );
    } catch (e) {
      this.logger.warn(
        `recordSubTaskCompletion failed user=${userId}: ${(e as any)?.message}`,
      );
    }
  }

  /**
   * Daily reconciliation — replay yesterday's `agent_cost_records` rows
   * (event_type='sub_task_complete') per user and write the day + month
   * aggregate rows. Idempotent — safe to run multiple times.
   *
   * Called by `SubscriptionUsageScheduler` at 02:30 UTC+8.
   */
  async aggregateYesterday(): Promise<{ usersProcessed: number; rowsUpserted: number }> {
    const since = new Date();
    since.setDate(since.getDate() - 1);
    since.setHours(0, 0, 0, 0);
    const until = new Date(since);
    until.setHours(23, 59, 59, 999);

    const y = since.getFullYear();
    const m = String(since.getMonth() + 1).padStart(2, '0');
    const d = String(since.getDate()).padStart(2, '0');
    const yearMonth = `${y}-${m}`;
    const day = `${y}-${m}-${d}`;

    let aggregates: Array<{ user_id: string; cnt: string; cost: string }> = [];
    try {
      aggregates = await this.costRepo.query(
        `
        SELECT user_id, COUNT(*) AS cnt, COALESCE(SUM(estimated_cost_usd), 0) AS cost
        FROM agent_cost_records
        WHERE event_type = 'sub_task_complete'
          AND created_at >= $1
          AND created_at <= $2
          AND user_id IS NOT NULL
        GROUP BY user_id
      `,
        [since, until],
      );
    } catch (e) {
      this.logger.warn(`aggregateYesterday query failed: ${(e as any)?.message}`);
      return { usersProcessed: 0, rowsUpserted: 0 };
    }

    let upserts = 0;
    for (const row of aggregates) {
      const cnt = parseInt(row.cnt, 10) || 0;
      const cost = parseFloat(row.cost) || 0;
      const user = await this.userRepo
        .findOne({ where: { id: row.user_id } })
        .catch(() => null);
      const tier = this.resolveTier(user);

      try {
        await this.usageRepo.query(
          `
          INSERT INTO user_subscription_usage (
            user_id, period_year_month, period_day,
            sub_tasks_count, total_cost_usd, subscription_tier, last_updated_at
          )
          VALUES ($1, $2, $3, $4, $5, $6, now())
          ON CONFLICT (user_id, period_year_month, period_day)
          WHERE period_day IS NOT NULL
          DO UPDATE SET
            sub_tasks_count = EXCLUDED.sub_tasks_count,
            total_cost_usd = EXCLUDED.total_cost_usd,
            subscription_tier = EXCLUDED.subscription_tier,
            last_updated_at = now()
        `,
          [row.user_id, yearMonth, day, cnt, cost, tier],
        );
        upserts++;
      } catch (e) {
        this.logger.warn(
          `aggregateYesterday upsert daily failed user=${row.user_id}: ${(e as any)?.message}`,
        );
      }
    }

    // Recompute monthly totals = sum of all dailies in the month
    try {
      await this.usageRepo.query(
        `
        INSERT INTO user_subscription_usage (
          user_id, period_year_month, period_day,
          sub_tasks_count, total_cost_usd, subscription_tier, last_updated_at
        )
        SELECT
          user_id, period_year_month, NULL,
          SUM(sub_tasks_count), SUM(total_cost_usd),
          MIN(subscription_tier), now()
        FROM user_subscription_usage
        WHERE period_year_month = $1 AND period_day IS NOT NULL
        GROUP BY user_id, period_year_month
        ON CONFLICT (user_id, period_year_month)
        WHERE period_day IS NULL
        DO UPDATE SET
          sub_tasks_count = EXCLUDED.sub_tasks_count,
          total_cost_usd = EXCLUDED.total_cost_usd,
          subscription_tier = EXCLUDED.subscription_tier,
          last_updated_at = now()
      `,
        [yearMonth],
      );
    } catch (e) {
      this.logger.warn(`aggregateYesterday monthly rollup failed: ${(e as any)?.message}`);
    }

    this.logger.log(
      `aggregateYesterday done: users=${aggregates.length}, upserts=${upserts}`,
    );
    return { usersProcessed: aggregates.length, rowsUpserted: upserts };
  }
}
