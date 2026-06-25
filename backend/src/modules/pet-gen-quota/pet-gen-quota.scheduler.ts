import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Repository } from 'typeorm';
import { PetGenQuota } from '../../entities/pet-gen-quota.entity';
import { PetGenQuotaService } from './pet-gen-quota.service';

/**
 * PetGenQuotaSchedulerService — Phase 2 W2 BE-T2.3
 *
 * Monthly reset cron: 1st of every month, UTC 00:05.
 *
 * Strategy: lazy-creation is the primary mechanism — `getOrCreate(userId)` will
 * insert a new row keyed by `currentPeriod()` (YYYY-MM) on first hit each month.
 *
 * This cron's role:
 *  1. Audit / observability — log how many rows existed last month.
 *  2. Defensive cleanup — release any leaked `reserved > 0` rows older than 30
 *     days (those represent in-flight tasks that crashed without confirm/refund).
 *
 * It does NOT proactively seed new-period rows for every user — that would burn
 * billions of empty rows. Lazy creation is sufficient.
 */
@Injectable()
export class PetGenQuotaSchedulerService {
  private readonly logger = new Logger(PetGenQuotaSchedulerService.name);

  constructor(
    @InjectRepository(PetGenQuota)
    private readonly repo: Repository<PetGenQuota>,
  ) {}

  /** 1st of month at 00:05 UTC. Runs in production only via NestJS Schedule. */
  @Cron('5 0 1 * *', { timeZone: 'UTC' })
  async monthlyResetTick(): Promise<void> {
    const summary = await this.runMonthlyReset();
    this.logger.log(
      `[BE-T2.3] monthly quota tick: prevPeriod=${summary.prevPeriod} ` +
      `previousRows=${summary.previousRows} releasedReserved=${summary.releasedReserved}`,
    );
  }

  /**
   * Pure, testable. Returns counters; does not throw on no-op.
   */
  async runMonthlyReset(now: Date = new Date()): Promise<{
    prevPeriod: string;
    previousRows: number;
    releasedReserved: number;
  }> {
    const prev = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
    const prevPeriod = PetGenQuotaService.currentPeriod(prev);

    const previousRows = await this.repo.count({ where: { period: prevPeriod } });

    // Release stale reservations (> 30 days old, reserved > 0).
    // Defensive: pet-generation-task should normally call confirm() or refund().
    const cutoff = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const stale = await this.repo
      .createQueryBuilder()
      .update(PetGenQuota)
      .set({ reserved: 0 })
      .where('reserved > 0 AND updated_at < :cutoff', { cutoff })
      .execute();

    return {
      prevPeriod,
      previousRows,
      releasedReserved: stale.affected ?? 0,
    };
  }
}
