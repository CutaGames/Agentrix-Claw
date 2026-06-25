import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OpenClawInstance } from '../../entities/openclaw-instance.entity';
import { AgentAccount } from '../../entities/agent-account.entity';
import { UnifiedAgentService } from './unified-agent.service';
import { UnifiedAgentController } from './unified-agent.controller';

@Module({
  imports: [TypeOrmModule.forFeature([OpenClawInstance, AgentAccount])],
  controllers: [UnifiedAgentController],
  providers: [UnifiedAgentService],
  exports: [UnifiedAgentService],
})
export class UnifiedAgentModule {}
