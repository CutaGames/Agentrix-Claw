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
  async tryReserve(userId: string, plan: PlanTier = 'free'): Promise<{
    mode: 'included' | 'overage' | 'denied';
    quotaId: string;
    period: string;
    remainingIncluded: number;
    overageUnitPriceUsd: number;
  }> {
    const row = await this.getOrCreate(userId, plan);
    const limit = row.included < 0 ? Number.POSITIVE_INFINITY : row.included;
    const inFlightUsed = row.used + row.reserved;
    let mode: 'included' | 'overage' | 'denied' = 'included';
    if (inFlightUsed >= limit) {
      // Free 不允许 overage（需要订阅升级或显式 buyOverage）→ 这里默认允许 overage
      mode = 'overage';
    }
    if (plan === 'enterprise') {
      // enterprise 走另一种结算，不应到这里
      throw new ForbiddenException('enterprise tenants must use enterprise quota module');
    }
    row.reserved += 1;
    await this.repo.save(row);
    return {
      mode,
      quotaId: row.id,
      period: row.period,
      remainingIncluded: row.included < 0 ? -1 : Math.max(0, row.included - row.used - row.reserved),
      overageUnitPriceUsd: Number(row.overageUnitPriceUsd),
    };
  }

  /** 任务成功 — reserved → used 或 overageUsed */
  async confirm(quotaId: string, mode: 'included' | 'overage'): Promise<PetGenQuota> {
    const row = await this.repo.findOne({ where: { id: quotaId } });
    if (!row) throw new BadRequestException('quota row not found');
    if (row.reserved <= 0) throw new BadRequestException('no reserved capacity to confirm');
    row.reserved -= 1;
    if (mode === 'overage') row.overageUsed += 1;
    else row.used += 1;
    return this.repo.save(row);
  }

  /** 任务失败 — 释放 reserved（不扣余额） */
  async refund(quotaId: string): Promise<PetGenQuota> {
    const row = await this.repo.findOne({ where: { id: quotaId } });
    if (!row) throw new BadRequestException('quota row not found');
    if (row.reserved <= 0) return row;
    row.reserved -= 1;
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
