import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  AgentTaskEntity,
  AgentTaskLogEntity,
} from '../../entities/agent-task.entity';
import { LivingPet } from '../../entities/living-pet.entity';
import { AgentAccount } from '../../entities/agent-account.entity';
import { User } from '../../entities/user.entity';
import { AgentTaskService } from './agent-task.service';
import { AgentTaskController } from './agent-task.controller';
import { AgentTaskWorker } from './agent-task.worker';
import { WorkerLlmRouterService } from './worker-llm-router.service';
import { BedrockIntegrationModule } from '../ai-integration/bedrock/bedrock-integration.module';
import { NotificationModule } from '../notification/notification.module';
import { MultiAgentModule } from '../multi-agent/multi-agent.module';
import { AiProviderModule } from '../ai-provider/ai-provider.module';
import { MultiAgentSummaryModule } from '../multi-agent-summary/multi-agent-summary.module';

/**
 * AgentTaskModule — long-running, asynchronous agent work items.
 *
 * Multi-Agent v1 (W3): worker hooks LivingPet for XP bumps on sub-task
 * success, and dispatches mobile push via NotificationService.
 *
 * Multi-Agent v2 (W7): worker optionally injects
 * MultiAgentMarketplaceService for marketplace-hire seller earnings
 * recording. Wired via forwardRef to break the circular import with
 * MultiAgentModule.
 *
 * Multi-Agent v2.1 (this branch): adds WorkerLlmRouterService which reads
 * users.metadata.preferences.subscriptionTier + agent_accounts.preferred_*
 * + ai-provider BYO configs to resolve the (model, provider, credentials)
 * tuple per sub-task. Replaces the v1 hardcoded `bedrock.invokeModel(prompt)`.
 *
 * Worker is auto-started on bootstrap; set AGENT_TASK_WORKER_DISABLED=1
 * to keep the API surface but skip the autonomy loop (e.g. in CI).
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([AgentTaskEntity, AgentTaskLogEntity, LivingPet, AgentAccount, User]),
    BedrockIntegrationModule,
    NotificationModule,
    forwardRef(() => MultiAgentModule),
    forwardRef(() => AiProviderModule),
    forwardRef(() => MultiAgentSummaryModule),
  ],
  controllers: [AgentTaskController],
  providers: [AgentTaskService, AgentTaskWorker, WorkerLlmRouterService],
  exports: [AgentTaskService],
})
export class AgentTaskModule {}
