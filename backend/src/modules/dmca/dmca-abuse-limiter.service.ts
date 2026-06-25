import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { MoreThan, Repository } from 'typeorm';
import { DmcaReport } from '../../entities/dmca-report.entity';

/**
 * DmcaAbuseLimiter — Phase 3 W3 SC-T3.4.
 *
 * Throttles DMCA submissions from claimants that have a track record of
 * `rejected` reports (i.e. false / abusive complaints). Default policy:
 *
 *   - Window: rolling 30 days
 *   - Threshold: ≥ 3 'rejected' reports → claimant is rate-limited
 *   - Limit: max 1 new report per 24h while rate-limited
 *
 * Pure-read service — DmcaService calls `assertCanSubmit(userId)` before
 * persisting a new report; the limiter throws when the budget is exceeded.
 */

const REJECTED_WINDOW_DAYS = 30;
const REJECTED_THRESHOLD = 3;
const LIMITED_MIN_GAP_MS = 24 * 60 * 60 * 1000;

export class DmcaAbuseRateLimitError extends Error {
  constructor(public readonly retryAfterMs: number) {
    super(
      `DMCA submissions rate-limited due to prior rejected reports; retry after ${Math.ceil(
        retryAfterMs / 60000,
      )} minutes`,
    );
    this.name = 'DmcaAbuseRateLimitError';
  }
}

@Injectable()
export class DmcaAbuseLimiterService {
  private readonly logger = new Logger(DmcaAbuseLimiterService.name);

  constructor(
    @InjectRepository(DmcaReport)
    private readonly repo: Repository<DmcaReport>,
  ) {}

  async getStatus(claimantUserId: string): Promise<{
    rejectedCount: number;
    limited: boolean;
    nextAllowedAt: Date | null;
  }> {
    const cutoff = new Date(Date.now() - REJECTED_WINDOW_DAYS * 24 * 60 * 60 * 1000);
    const rejected = await this.repo
      .createQueryBuilder('r')
      .where('r.claimant_user_id = :uid', { uid: claimantUserId })
      .andWhere('r.status = :st', { st: 'rejected' })
      .andWhere('r.created_at > :cutoff', { cutoff })
      .getCount();

    if (rejected < REJECTED_THRESHOLD) {
      return { rejectedCount: rejected, limited: false, nextAllowedAt: null };
    }

    // Already rate-limited — find most recent submission to compute gap.
    const recent = await this.repo
      .createQueryBuilder('r')
      .where('r.claimant_user_id = :uid', { uid: claimantUserId })
      .orderBy('r.created_at', 'DESC')
      .limit(1)
      .getOne();

    const lastAt = recent?.createdAt ? recent.createdAt.getTime() : 0;
    const nextAllowedAt = new Date(lastAt + LIMITED_MIN_GAP_MS);
    return {
      rejectedCount: rejected,
      limited: true,
      nextAllowedAt,
    };
  }

  async assertCanSubmit(claimantUserId: string): Promise<void> {
    const status = await this.getStatus(claimantUserId);
    if (!status.limited || !status.nextAllowedAt) return;
    const remaining = status.nextAllowedAt.getTime() - Date.now();
    if (remaining > 0) {
      this.logger.warn(
        `DMCA abuse limit triggered: user=${claimantUserId} rejected=${status.rejectedCount} retryInMs=${remaining}`,
      );
      throw new DmcaAbuseRateLimitError(remaining);
    }
  }
}
