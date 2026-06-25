import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AgentCostRecord } from '../../entities/agent-cost-record.entity';
import { AgentTaskEntity } from '../../entities/agent-task.entity';
import { PetTeamMember } from '../../entities/pet-team-member.entity';
import { LivingPet } from '../../entities/living-pet.entity';
import { PetProductivitySnapshot } from '../../entities/pet-productivity-snapshot.entity';
import { UserSubscriptionUsage } from '../../entities/user-subscription-usage.entity';
import { User } from '../../entities/user.entity';
import { MultiAgentSummaryService } from './multi-agent-summary.service';
import { MultiAgentSummaryController } from './multi-agent-summary.controller';
import { MultiAgentDailySnapshotScheduler } from './daily-snapshot.scheduler';
import { SubscriptionUsageService } from './subscription-usage.service';
import { SubscriptionUsageScheduler } from './subscription-usage.scheduler';

/**
 * Multi-Agent v1 W5.5 — weekly aggregation + per-pet snapshots.
 *
 * Endpoints:
 *   GET /api/multi-agent/weekly-summary
 *   GET /api/multi-agent/team-activity-report?format=csv&days=30
 *
 * Cron: 02:00 UTC+8 daily — upsert pet_productivity_snapshot
 *
 * v2.1 — adds SubscriptionUsageService + 02:30 UTC+8 cron to reconcile
 * user_subscription_usage daily/monthly aggregates from agent_cost_records.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      AgentCostRecord,
      AgentTaskEntity,
      PetTeamMember,
      LivingPet,
      PetProductivitySnapshot,
      UserSubscriptionUsage,
      User,
    ]),
  ],
  controllers: [MultiAgentSummaryController],
  providers: [
    MultiAgentSummaryService,
    MultiAgentDailySnapshotScheduler,
    SubscriptionUsageService,
    SubscriptionUsageScheduler,
  ],
  exports: [MultiAgentSummaryService, SubscriptionUsageService],
})
export class MultiAgentSummaryModule {}
