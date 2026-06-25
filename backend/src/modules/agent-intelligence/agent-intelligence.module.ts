import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AgentSession } from '../../entities/agent-session.entity';
import { AgentMessage } from '../../entities/agent-message.entity';
import { AgentMemory } from '../../entities/agent-memory.entity';
import { AgentIntelligenceService } from './agent-intelligence.service';
import { AgentIntelligenceController } from './agent-intelligence.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([AgentSession, AgentMessage, AgentMemory]),
  ],
  providers: [AgentIntelligenceService],
  controllers: [AgentIntelligenceController],
  exports: [AgentIntelligenceService],
})
export class AgentIntelligenceModule {}
