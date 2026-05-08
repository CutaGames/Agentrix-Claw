import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  AgentTaskEntity,
  AgentTaskLogEntity,
} from '../../entities/agent-task.entity';
import { AgentTaskService } from './agent-task.service';
import { AgentTaskController } from './agent-task.controller';

/**
 * AgentTaskModule — long-running, asynchronous agent work items.
 *
 * Surfaces in the desktop "Work Log" panel and lets agents accept jobs
 * that span minutes-to-days. Distinct from PlanRunner (which is a
 * step-by-step approval-gated executor) — an AgentTask may *contain*
 * multiple plans/tool-calls and is the user-visible outer unit.
 */
@Module({
  imports: [TypeOrmModule.forFeature([AgentTaskEntity, AgentTaskLogEntity])],
  controllers: [AgentTaskController],
  providers: [AgentTaskService],
  exports: [AgentTaskService],
})
export class AgentTaskModule {}
