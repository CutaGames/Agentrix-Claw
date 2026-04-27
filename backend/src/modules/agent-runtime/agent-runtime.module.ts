import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MemoryService } from './memory.service';
import { SkillsService } from './skills.service';
import { AgentMemoryEdge } from '../../entities/agent-memory-edge.entity';
import { User } from '../../entities/user.entity';

@Module({
  imports: [TypeOrmModule.forFeature([User, AgentMemoryEdge])],
  providers: [MemoryService, SkillsService],
  exports: [MemoryService, SkillsService],
})
export class AgentRuntimeModule {}

