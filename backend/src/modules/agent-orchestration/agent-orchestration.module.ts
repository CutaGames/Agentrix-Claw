import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AgentAccount } from '../../entities/agent-account.entity';
import { AgentLaneArtifact } from '../../entities/agent-lane-artifact.entity';
import { AgentLaneEvent } from '../../entities/agent-lane-event.entity';
import { AgentLaneJob } from '../../entities/agent-lane-job.entity';
import { OpenClawInstance } from '../../entities/openclaw-instance.entity';
import { AgentOrchestrationService } from './agent-orchestration.service';
import { AgentContextModule } from '../agent-context/agent-context.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([AgentAccount, OpenClawInstance, AgentLaneJob, AgentLaneEvent, AgentLaneArtifact]),
    AgentContextModule,
  ],
  providers: [AgentOrchestrationService],
  exports: [AgentOrchestrationService],
})
export class AgentOrchestrationModule {}
