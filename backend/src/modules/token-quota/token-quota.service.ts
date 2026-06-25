import { Injectable, Logger, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UserTokenQuota, TokenPlanType } from '../../entities/user-token-quota.entity';

/** Free tier tokens granted to new users — configurable via FREE_TRIAL_TOKEN_LIMIT env */
export const FREE_TRIAL_TOKENS = Number(process.env.FREE_TRIAL_TOKEN_LIMIT) || 1_000_000;

/** Token allocation per plan per month */
export const PLAN_QUOTAS: Record<TokenPlanType, number> = {
  [TokenPlanType.FREE_TRIAL]: FREE_TRIAL_TOKENS,
  [TokenPlanType.STARTER]:    5_000_000,
  [TokenPlanType.PRO]:        20_000_000,
  [TokenPlanType.UNLIMITED]:  999_999_999,
};

export interface QuotaStatus {
  planType: TokenPlanType;
  totalQuota: number;
  usedTokens: number;
  remainingTokens: number;
  usagePercent: number;         // 0–100
  callCount: number;
  periodStart: string;          // ISO date
  periodEnd: string;
  quotaExhausted: boolean;
  /** Energy level 0–100 for UI display (inverse of usagePercent, minimum 0) */
  energyLevel: number;
}

@Injectable()
export class TokenQuotaService {
  private readonly logger = new Logger(TokenQuotaService.name);

  constructor(
    @InjectRepository(UserTokenQuota)
    private readonly quotaRepo: Repository<UserTokenQuota>,
  ) {}

  // ─── Public API ────────────────────────────────────────────────────────────

  /**
   * Get or create the current period quota row for a user.
   * Automatically creates a free-trial quota for new users.
   */
  async getOrCreateCurrentQuota(userId: string): Promise<UserTokenQuota> {
    const { start, end } = currentPeriod();
    let quota = await this.quotaRepo.findOne({
      where: { userId, periodStart: start as any },
    });

    if (!quota) {
      quota = this.quotaRepo.create({
        userId,
        periodStart: start as any,
        periodEnd: end as any,
        planType: TokenPlanType.FREE_TRIAL,
        totalQuota: FREE_TRIAL_TOKENS,
      });
      await this.quotaRepo.save(quota);
      this.logger.log(`Created free-trial quota for user ${userId}: ${FREE_TRIAL_TOKENS.toLocaleString()} tokens`);
    } else if (
      quota.planType === TokenPlanType.FREE_TRIAL &&
      Number(quota.totalQuota) !== FREE_TRIAL_TOKENS
    ) {
      // Recalibrate free-trial quota to the current configured limit
      this.logger.log(
        `Recalibrating free-trial quota for user ${userId}: ${Number(quota.totalQuota).toLocaleString()} → ${FREE_TRIAL_TOKENS.toLocaleString()} tokens`,
      );
      quota.totalQuota = FREE_TRIAL_TOKENS;
      await this.quotaRepo.save(quota);
    }

    return quota;
  }

  /**
   * Returns the current quota status formatted for the mobile UI energy bar.
   */
  async getQuotaStatus(userId: string): Promise<QuotaStatus> {
    const quota = await this.getOrCreateCurrentQuota(userId);
    const used = Number(quota.usedTokens);
    const total = Number(quota.totalQuota);
    const remaining = Math.max(0, total - used);
    const usagePercent = total > 0 ? Math.min(100, Math.round((used / total) * 100)) : 0;

    return {
      planType: quota.planType,
      totalQuota: total,
      usedTokens: used,
      remainingTokens: remaining,
      usagePercent,
      callCount: quota.callCount,
      periodStart: String(quota.periodStart),
      periodEnd: String(quota.periodEnd),
      quotaExhausted: quota.quotaExhausted,
      energyLevel: Math.max(0, 100 - usagePercent),
    };
  }

  /**
   * Deduct token usage from a user's quota.
   * Called by the LLM proxy after each successful call.
   *
   * @throws ForbiddenException if quota is exhausted
   */
  async deductTokens(
    userId: string,
    inputTokens: number,
    outputTokens: number,
  ): Promise<QuotaStatus> {
    const quota = await this.getOrCreateCurrentQuota(userId);

    if (quota.quotaExhausted) {
      throw new ForbiddenException(
        'Monthly token quota exhausted. Please upgrade your plan to continue.',
      );
    }

    const total = Number(quota.totalQuota);
    const used = Number(quota.usedTokens);
    const toDeduct = inputTokens + outputTokens;
    const newUsed = used + toDeduct;

    quota.usedTokens = newUsed;
    quota.inputTokens = Number(quota.inputTokens) + inputTokens;
    quota.outputTokens = Number(quota.outputTokens) + outputTokens;
    quota.callCount = quota.callCount + 1;

    if (newUsed >= total) {
      quota.quotaExhausted = true;
    }

    // Send threshold alerts (fire-and-forget via logger, extend later for push notifications)
    const usagePct = total > 0 ? (newUsed / total) * 100 : 0;

    if (usagePct >= 50 && !quota.alertSent50) {
      quota.alertSent50 = true;
      this.logger.log(`[Alert 50%] User ${userId} reached 50% of token quota`);
      // TODO: send push notification via notification service
    }
    if (usagePct >= 80 && !quota.alertSent80) {
      quota.alertSent80 = true;
      this.logger.warn(`[Alert 80%] User ${userId} reached 80% of token quota`);
    }
    if (usagePct >= 95 && !quota.alertSent95) {
      quota.alertSent95 = true;
      this.logger.warn(`[Alert 95%] User ${userId} reached 95% of token quota — near exhaustion`);
    }

    await this.quotaRepo.save(quota);

    return this.getQuotaStatus(userId);
  }

  /**
   * Upgrade a user's plan. Called after payment is confirmed.
   */
  async upgradePlan(userId: string, newPlan: TokenPlanType): Promise<UserTokenQuota> {
    const quota = await this.getOrCreateCurrentQuota(userId);
    quota.planType = newPlan;
    quota.totalQuota = PLAN_QUOTAS[newPlan];
    quota.quotaExhausted = false;
    return this.quotaRepo.save(quota);
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Returns the start and end date strings for the current calendar month.
 */
function currentPeriod(): { start: string; end: string } {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  return {
    start: start.toISOString().split('T')[0],
    end: end.toISOString().split('T')[0],
  };
}

/**
 * Estimate token count from a text string.
 * Rule of thumb: ~4 characters ≈ 1 token (OpenAI / Claude heuristic).
 */
export function estimateTokens(text: string): number {
  return Math.ceil((text?.length ?? 0) / 4);
}
