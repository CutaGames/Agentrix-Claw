import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MemoryService } from './memory.service';
import { SkillsService } from './skills.service';
import { User } from '../../entities/user.entity';

@Module({
  imports: [TypeOrmModule.forFeature([User])],
  providers: [MemoryService, SkillsService],
  exports: [MemoryService, SkillsService],
})
export class AgentRuntimeModule {}

