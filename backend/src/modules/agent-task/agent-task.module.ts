import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  AgentTaskEntity,
  AgentTaskLogEntity,
} from '../../entities/agent-task.entity';
import { AgentTaskService } from './agent-task.service';
import { AgentTaskController } from './agent-task.controller';
import { AgentTaskWorker } from './agent-task.worker';
import { BedrockIntegrationModule } from '../ai-integration/bedrock/bedrock-integration.module';

/**
 * AgentTaskModule — long-running, asynchronous agent work items.
 *
 * Surfaces in the desktop "Work Log" panel and lets agents accept jobs
 * that span minutes-to-days. Distinct from PlanRunner (which is a
 * step-by-step approval-gated executor) — an AgentTask may *contain*
 * multiple plans/tool-calls and is the user-visible outer unit.
 *
 * Worker is auto-started on bootstrap; set AGENT_TASK_WORKER_DISABLED=1
 * to keep the API surface but skip the autonomy loop (e.g. in CI).
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([AgentTaskEntity, AgentTaskLogEntity]),
    BedrockIntegrationModule,
  ],
  controllers: [AgentTaskController],
  providers: [AgentTaskService, AgentTaskWorker],
  exports: [AgentTaskService],
})
export class AgentTaskModule {}
