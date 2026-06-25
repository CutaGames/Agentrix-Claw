import { Injectable, BadRequestException, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PetGenQuota } from '../../entities/pet-gen-quota.entity';

export type PlanTier = 'free' | 'pro' | 'pro_plus' | 'enterprise';

export const PLAN_INCLUDED: Record<PlanTier, number> = {
  free: 3,
  pro: 20,
  pro_plus: -1,
  enterprise: -1,
};

export const OVERAGE_UNIT_PRICE_USD = 0.5;

/**
 * Phase 5 BE-9.3: scan jobs (Hunyuan3D multi-view) cost ~$1 each, vs. text/image
 * at $0.5. We model scan as 2 quota units so the existing accounting (included +
 * overage) continues to work without a parallel ledger.
 */
export const SCAN_UNITS = 2;

/**
 * PetGenQuotaService — Phase 2 W1 配额账本（骨架）
 *
 * 关键方法：
 *  - getOrCreate(userId, plan)        本月账本（自动创建）
 *  - tryReserve(userId, plan)         返回 { mode: 'included' | 'overage' | 'denied', quotaId }
 *  - confirm(quotaId)                 任务成功 → reserved → used
 *  - refund(quotaId)                  任务失败 → reserved 释放（不计入 used）
 *  - resetMonth()                     cron 每月 1 日 UTC 调用（或懒生成；当前选 lazy）
 *
 * Phase 2 W2 接入 Stripe webhook：当 mode='overage' 时同步落 commerce_orders；
 * 本骨架仅做账本；Stripe 集成在另一 PR。
 *
 * BE-T2.1-2.5 测试入口都从这里。
 */
@Injectable()
export class PetGenQuotaService {
  constructor(
    @InjectRepository(PetGenQuota)
    private readonly repo: Repository<PetGenQuota>,
  ) {}

  static currentPeriod(d: Date = new Date()): string {
    const y = d.getUTCFullYear();
    const m = String(d.getUTCMonth() + 1).padStart(2, '0');
    return `${y}-${m}`;
  }

  async getOrCreate(userId: string, plan: PlanTier = 'free'): Promise<PetGenQuota> {
    if (!userId) throw new BadRequestException('userId required');
    const period = PetGenQuotaService.currentPeriod();
    let row = await this.repo.findOne({ where: { userId, period } });
    if (row) return row;
    row = this.repo.create({
      userId,
      period,
      plan,
      included: PLAN_INCLUDED[plan] ?? PLAN_INCLUDED.free,
      used: 0,
      overageUsed: 0,
      reserved: 0,
      overageUnitPriceUsd: OVERAGE_UNIT_PRICE_USD.toFixed(2) as any,
    });
    return this.repo.save(row);
  }

  /** 返回当前账本（不创建） — 给 GET /v1/pet/quota 用 */
  async get(userId: string): Promise<PetGenQuota | null> {
    return this.repo.findOne({ where: { userId, period: PetGenQuotaService.currentPeriod() } });
  }

  /**
   * 预占一次配额。
   * 返回 { mode }：
   *   'included' — 用免费额度
   *   'overage'  — 触发 $0.5 超额（调用方应在确认前向 Stripe 收单）
   *   'denied'   — 被风控/计划禁止
   */
  async tryReserve(
    userId: string,
    plan: PlanTier = 'free',
    units = 1,
  ): Promise<{
    mode: 'included' | 'overage' | 'denied';
    quotaId: string;
    period: string;
    units: number;
    remainingIncluded: number;
    overageUnitPriceUsd: number;
  }> {
    if (!Number.isInteger(units) || units < 1) {
      throw new BadRequestException('units must be a positive integer');
    }
    const row = await this.getOrCreate(userId, plan);
    const limit = row.included < 0 ? Number.POSITIVE_INFINITY : row.included;
    const inFlightUsed = row.used + row.reserved;
    let mode: 'included' | 'overage' | 'denied' = 'included';
    if (inFlightUsed + units > limit) {
      // If the request straddles the boundary, charge the whole batch as overage
      // for simplicity. Callers that want a partial-include split should reserve
      // unit-by-unit.
      mode = 'overage';
    }
    if (plan === 'enterprise') {
      // enterprise 走另一种结算，不应到这里
      throw new ForbiddenException('enterprise tenants must use enterprise quota module');
    }
    row.reserved += units;
    await this.repo.save(row);
    return {
      mode,
      quotaId: row.id,
      period: row.period,
      units,
      remainingIncluded: row.included < 0 ? -1 : Math.max(0, row.included - row.used - row.reserved),
      overageUnitPriceUsd: Number(row.overageUnitPriceUsd),
    };
  }

  /** 任务成功 — reserved → used 或 overageUsed */
  async confirm(quotaId: string, mode: 'included' | 'overage', units = 1): Promise<PetGenQuota> {
    if (!Number.isInteger(units) || units < 1) {
      throw new BadRequestException('units must be a positive integer');
    }
    const row = await this.repo.findOne({ where: { id: quotaId } });
    if (!row) throw new BadRequestException('quota row not found');
    if (row.reserved < units) throw new BadRequestException('not enough reserved capacity to confirm');
    row.reserved -= units;
    if (mode === 'overage') row.overageUsed += units;
    else row.used += units;
    return this.repo.save(row);
  }

  /** 任务失败 — 释放 reserved（不扣余额） */
  async refund(quotaId: string, units = 1): Promise<PetGenQuota> {
    if (!Number.isInteger(units) || units < 1) {
      throw new BadRequestException('units must be a positive integer');
    }
    const row = await this.repo.findOne({ where: { id: quotaId } });
    if (!row) throw new BadRequestException('quota row not found');
    if (row.reserved <= 0) return row;
    row.reserved = Math.max(0, row.reserved - units);
    return this.repo.save(row);
  }

  toDto(q: PetGenQuota) {
    return {
      quota_id: q.id,
      user_id: q.userId,
      period: q.period,
      plan: q.plan,
      included: q.included,
      used: q.used,
      overage_used: q.overageUsed,
      reserved: q.reserved,
      remaining_included: q.included < 0 ? -1 : Math.max(0, q.included - q.used - q.reserved),
      overage_unit_price_usd: Number(q.overageUnitPriceUsd),
      updated_at: q.updatedAt?.getTime?.() ?? Date.now(),
    };
  }
}
