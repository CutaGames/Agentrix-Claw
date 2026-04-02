import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AgentMemory } from '../../entities/agent-memory.entity';
import { AgentContextService } from './agent-context.service';

@Module({
  imports: [TypeOrmModule.forFeature([AgentMemory])],
  providers: [AgentContextService],
  exports: [AgentContextService],
})
export class AgentContextModule {}
