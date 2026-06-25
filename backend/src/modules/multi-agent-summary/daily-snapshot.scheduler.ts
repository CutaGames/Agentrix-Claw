import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';

import { MultiAgentSummaryService } from './multi-agent-summary.service';

/**
 * Multi-Agent v1 W5.5 — pet_productivity_snapshot daily upsert cron.
 *
 * Runs at 02:00 UTC+8 (= 18:00 UTC). Aggregates the past 7 days of
 * sub-task completions per pet and upserts one row per pet per day
 * into `pet_productivity_snapshot`.
 *
 * v1 writes only — v2 W8 (Pet Arena) reads to seed initial ELO.
 *
 * Disable env: MULTI_AGENT_DAILY_SNAPSHOT_DISABLED=1
 *
 * Spec: design.md §12.6, R15.3
 */
@Injectable()
export class MultiAgentDailySnapshotScheduler {
  private readonly logger = new Logger(MultiAgentDailySnapshotScheduler.name);

  constructor(private readonly summary: MultiAgentSummaryService) {}

  @Cron('0 18 * * *', { name: 'multi-agent-daily-snapshot' })
  async run(): Promise<void> {
    if (process.env.MULTI_AGENT_DAILY_SNAPSHOT_DISABLED === '1') return;
    const startedAt = Date.now();
    try {
      await this.summary.upsertDailySnapshot(new Date());
      this.logger.log(
        `pet productivity snapshot job done in ${Date.now() - startedAt}ms`,
      );
    } catch (e) {
      this.logger.warn(
        `pet productivity snapshot job failed: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  }
}
