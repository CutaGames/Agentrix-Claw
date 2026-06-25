import {
  Injectable,
  Logger,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { AgentCostRecord } from '../../../entities/agent-cost-record.entity';

/**
 * Subscription tier quota limits per R13.2.
 * Format: { quickScan, detailScan, roomScan, characterRegens }
 */
const TIER_LIMITS: Record<string, { quickScan: number; detailScan: number; roomScan: number; characterRegens: number }> = {
  free: { quickScan: 5, detailScan: 1, roomScan: 1, characterRegens: 10 },
  pro: { quickScan: 30, detailScan: 5, roomScan: 3, characterRegens: 50 },
  business: { quickScan: 100, detailScan: 20, roomScan: 10, characterRegens: 200 },
  enterprise: { quickScan: 100, detailScan: 20, roomScan: 10, characterRegens: 200 },
};

/**
 * AXP exchange rates for quota purchases (R13.5).
 * 1 Quick Scan = 10 AXP, 1 Detail Scan = 50 AXP, 1 Dungeon = 30 AXP, 1 Replay Video = 5 AXP
 */
const AXP_EXCHANGE_RATES: Record<string, number> = {
  quickScan: 10,
  detailScan: 50,
  roomScan: 30,
  replayVideo: 5,
};

/** Monthly cost ceiling for free users (USD) — R13.4 */
const FREE_USER_MONTHLY_CEILING_USD = 5;

/** Purchased quota expiry: 30 days */
const PURCHASED_QUOTA_EXPIRY_DAYS = 30;

/**
 * QuotaService — Redis-based daily quota tracker + monthly cost ceiling + AXP purchases.
 *
 * Implements:
 * - 19.1: Daily quota tracking per subscription tier
 * - 19.2: Monthly cost ceiling for free users
 * - 19.3: AXP-purchased quota with 30-day expiry
 *
 * Phase 1: In-memory maps (production should use Redis with TTL keys).
 * Key format: `quota:{eventType}:{userId}:{utcDate}`
 *
 * Requirements: 13.2, 13.3, 13.4, 13.5
 */
@Injectable()
export class QuotaService {
  private readonly logger = new Logger(QuotaService.name);

  /**
   * In-memory daily quota counters.
   * Key: `{eventType}:{userId}:{utcDate}` → count
   * In production: Redis key with TTL = remaining seconds to UTC midnight.
   */
  private readonly dailyCounters = new Map<string, number>();

  /**
   * Purchased quota records.
   * Key: userId → array of { type, remaining, expiresAt }
   * Consumed in FIFO-by-expiry order after free quota is exhausted.
   */
  private readonly purchasedQuota = new Map<string, Array<{
    type: string;
    remaining: number;
    expiresAt: Date;
    purchasedAt: Date;
  }>>();

  constructor(
    @InjectRepository(AgentCostRecord)
    private readonly costRecordRepo: Repository<AgentCostRecord>,
    private readonly configService: ConfigService,
  ) {}

  // ============================================================
  // 19.1: Daily Quota Tracking
  // ============================================================

  /**
   * Check if a user has remaining daily quota for a given event type.
   *
   * @param userId - The user to check
   * @param eventType - One of: quickScan, detailScan, roomScan, characterRegens
   * @returns { allowed, remaining, limit, resetTime }
   *
   * Requirements: 13.2, 13.3
   */
  async checkDailyQuota(
    userId: string,
    eventType: string,
  ): Promise<{
    allowed: boolean;
    remaining: number;
    limit: number;
    resetTime: string;
  }> {
    const tier = await this.getUserTier(userId);
    const limits = TIER_LIMITS[tier] || TIER_LIMITS.free;
    const limit = (limits as any)[eventType] || 0;

    const utcDate = this.getUtcDateString();
    const key = `${eventType}:${userId}:${utcDate}`;
    const current = this.dailyCounters.get(key) || 0;

    // Check purchased quota as well
    const purchasedRemaining = this.getPurchasedQuotaRemaining(userId, eventType);
    const totalLimit = limit + purchasedRemaining;

    const remaining = Math.max(0, totalLimit - current);
    const allowed = remaining > 0;

    return {
      allowed,
      remaining,
      limit: totalLimit,
      resetTime: this.getNextUtcMidnight(),
    };
  }

  /**
   * Consume one unit of daily quota for a given event type.
   *
   * Consumes free quota first, then purchased quota in FIFO-by-expiry order.
   * Returns 429-style error info if quota exhausted.
   *
   * @param userId - The user consuming quota
   * @param eventType - The event type being consumed
   * @returns { consumed, remaining } or throws ForbiddenException
   *
   * Requirements: 13.2, 13.3
   */
  async consumeDailyQuota(
    userId: string,
    eventType: string,
  ): Promise<{ consumed: boolean; remaining: number }> {
    const check = await this.checkDailyQuota(userId, eventType);

    if (!check.allowed) {
      throw new ForbiddenException({
        statusCode: 429,
        message: `Daily limit reached for ${eventType}. Resets at ${check.resetTime} UTC.`,
        resetTime: check.resetTime,
        eventType,
      });
    }

    const utcDate = this.getUtcDateString();
    const key = `${eventType}:${userId}:${utcDate}`;
    const current = this.dailyCounters.get(key) || 0;

    // Determine if we're consuming free or purchased quota
    const tier = await this.getUserTier(userId);
    const limits = TIER_LIMITS[tier] || TIER_LIMITS.free;
    const freeLimit = (limits as any)[eventType] || 0;

    if (current < freeLimit) {
      // Consuming from free quota
      this.dailyCounters.set(key, current + 1);
    } else {
      // Consuming from purchased quota (FIFO by expiry)
      const consumed = this.consumePurchasedQuota(userId, eventType);
      if (!consumed) {
        throw new ForbiddenException({
          statusCode: 429,
          message: `Daily limit reached for ${eventType}. Resets at ${check.resetTime} UTC.`,
          resetTime: check.resetTime,
          eventType,
        });
      }
      this.dailyCounters.set(key, current + 1);
    }

    return {
      consumed: true,
      remaining: check.remaining - 1,
    };
  }

  // ============================================================
  // 19.2: Monthly Cost Ceiling for Free Users
  // ============================================================

  /**
   * Check monthly cost ceiling for free users.
   *
   * Queries SUM(agent_cost_records.estimatedCostUsd) for current UTC month.
   * Soft warning at 80%, hard block at 100%.
   *
   * @param userId - The user to check
   * @returns { allowed, currentCost, ceiling, warningLevel }
   *
   * Requirements: 13.4
   */
  async checkMonthlyCostCeiling(
    userId: string,
  ): Promise<{
    allowed: boolean;
    currentCost: number;
    ceiling: number;
    warningLevel: 'none' | 'soft_warning' | 'hard_block';
  }> {
    const tier = await this.getUserTier(userId);

    // Only free users have a monthly cost ceiling
    if (tier !== 'free') {
      return {
        allowed: true,
        currentCost: 0,
        ceiling: Infinity,
        warningLevel: 'none',
      };
    }

    const ceiling = FREE_USER_MONTHLY_CEILING_USD;

    // Query current month's cost
    const currentCost = await this.getCurrentMonthCost(userId);

    let warningLevel: 'none' | 'soft_warning' | 'hard_block' = 'none';
    let allowed = true;

    if (currentCost >= ceiling) {
      warningLevel = 'hard_block';
      allowed = false;
    } else if (currentCost >= ceiling * 0.8) {
      warningLevel = 'soft_warning';
      allowed = true; // Still allowed, just warning
    }

    return { allowed, currentCost, ceiling, warningLevel };
  }

  // ============================================================
  // 19.3: AXP-Purchased Quota
  // ============================================================

  /**
   * Purchase additional quota using AXP tokens.
   *
   * Creates a purchased quota record with 30-day expiry.
   * Consumed after free quota is exhausted, in FIFO-by-expiry order.
   *
   * @param userId - The user purchasing quota
   * @param quotaType - Type of quota to purchase
   * @param quantity - Number of units to purchase
   * @returns { success, axpCost, expiresAt }
   *
   * Requirements: 13.5
   */
  async purchaseQuota(
    userId: string,
    quotaType: string,
    quantity: number,
  ): Promise<{
    success: boolean;
    axpCost: number;
    expiresAt: string;
    quotaType: string;
    quantity: number;
  }> {
    // Validate quota type
    const rate = AXP_EXCHANGE_RATES[quotaType];
    if (!rate) {
      throw new BadRequestException(
        `Invalid quota type: ${quotaType}. Valid types: ${Object.keys(AXP_EXCHANGE_RATES).join(', ')}`,
      );
    }

    if (quantity <= 0 || !Number.isInteger(quantity)) {
      throw new BadRequestException('Quantity must be a positive integer');
    }

    const axpCost = rate * quantity;

    // TODO: Deduct AXP from user's balance (integrate with AXP service)
    // For Phase 1, just record the purchase without actual AXP deduction

    const expiresAt = new Date(Date.now() + PURCHASED_QUOTA_EXPIRY_DAYS * 24 * 60 * 60 * 1000);

    // Store purchased quota
    const userQuota = this.purchasedQuota.get(userId) || [];
    userQuota.push({
      type: quotaType,
      remaining: quantity,
      expiresAt,
      purchasedAt: new Date(),
    });

    // Sort by expiry (FIFO — earliest expiry consumed first)
    userQuota.sort((a, b) => a.expiresAt.getTime() - b.expiresAt.getTime());
    this.purchasedQuota.set(userId, userQuota);

    this.logger.log(
      `Quota purchased: user=${userId}, type=${quotaType}, qty=${quantity}, axpCost=${axpCost}, expires=${expiresAt.toISOString()}`,
    );

    return {
      success: true,
      axpCost,
      expiresAt: expiresAt.toISOString(),
      quotaType,
      quantity,
    };
  }

  // ============================================================
  // Private Helpers
  // ============================================================

  /**
   * Get the user's subscription tier.
   * Phase 1: query workspace plan from DB.
   */
  private async getUserTier(userId: string): Promise<string> {
    try {
      const result = await this.costRecordRepo.manager.query(
        `SELECT wp."planType" FROM workspaces w
         JOIN workspace_plans wp ON wp.id = w."planId"
         WHERE w."ownerId" = $1 AND w.status = 'active'
         LIMIT 1`,
        [userId],
      );

      if (result && result.length > 0) {
        return (result[0].planType || 'free').toLowerCase();
      }
      return 'free';
    } catch {
      return 'free';
    }
  }

  /**
   * Get current UTC date string (YYYY-MM-DD).
   */
  private getUtcDateString(): string {
    const now = new Date();
    return now.toISOString().split('T')[0];
  }

  /**
   * Get next UTC midnight as ISO string.
   */
  private getNextUtcMidnight(): string {
    const now = new Date();
    const tomorrow = new Date(Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate() + 1,
      0, 0, 0, 0,
    ));
    return tomorrow.toISOString();
  }

  /**
   * Get remaining purchased quota for a user and event type.
   */
  private getPurchasedQuotaRemaining(userId: string, eventType: string): number {
    const userQuota = this.purchasedQuota.get(userId) || [];
    const now = new Date();

    return userQuota
      .filter((q) => q.type === eventType && q.expiresAt > now && q.remaining > 0)
      .reduce((sum, q) => sum + q.remaining, 0);
  }

  /**
   * Consume one unit from purchased quota (FIFO by expiry).
   * Returns true if consumed, false if no purchased quota available.
   */
  private consumePurchasedQuota(userId: string, eventType: string): boolean {
    const userQuota = this.purchasedQuota.get(userId) || [];
    const now = new Date();

    // Find the first non-expired record with remaining quota
    for (const record of userQuota) {
      if (record.type === eventType && record.expiresAt > now && record.remaining > 0) {
        record.remaining--;
        return true;
      }
    }

    return false;
  }

  /**
   * Query current month's total cost for a user from agent_cost_records.
   */
  private async getCurrentMonthCost(userId: string): Promise<number> {
    try {
      const now = new Date();
      const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));

      const result = await this.costRecordRepo
        .createQueryBuilder('cost')
        .select('COALESCE(SUM(cost.costUsd), 0)', 'totalCost')
        .where('cost.userId = :userId', { userId })
        .andWhere('cost.createdAt >= :monthStart', { monthStart })
        .getRawOne();

      return parseFloat(result?.totalCost || '0');
    } catch {
      return 0;
    }
  }
}
