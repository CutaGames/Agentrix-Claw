import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';

import { SubscriptionUsageService } from './subscription-usage.service';

/**
 * Multi-Agent v2.1 — daily reconciliation of user_subscription_usage rows.
 *
 * Runs at 02:30 UTC+8 (= 18:30 UTC) — 30 min after MultiAgentDailySnapshotScheduler
 * to avoid concurrent DB load.
 *
 * Disabled via env `MULTI_AGENT_SUBSCRIPTION_USAGE_SCHEDULER_DISABLED=1` (CI).
 */
@Injectable()
export class SubscriptionUsageScheduler {
  private readonly logger = new Logger(SubscriptionUsageScheduler.name);

  constructor(private readonly usage: SubscriptionUsageService) {}

  @Cron('30 18 * * *', { name: 'multi-agent-subscription-usage' })
  async run(): Promise<void> {
    if (process.env.MULTI_AGENT_SUBSCRIPTION_USAGE_SCHEDULER_DISABLED === '1') return;
    try {
      const result = await this.usage.aggregateYesterday();
      this.logger.log(
        `subscription-usage cron complete: users=${result.usersProcessed}, upserts=${result.rowsUpserted}`,
      );
    } catch (e) {
      this.logger.error(`subscription-usage cron failed: ${(e as any)?.message}`);
    }
  }
}
