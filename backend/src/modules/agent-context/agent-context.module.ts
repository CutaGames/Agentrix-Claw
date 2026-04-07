import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AgentMemory } from '../../entities/agent-memory.entity';
import { AgentContextService } from './agent-context.service';
import { MemorySlotService } from './memory-slot.service';
import { MemorySlotController } from './memory-slot.controller';
import { HookModule } from '../hooks/hook.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([AgentMemory]),
    forwardRef(() => HookModule),
  ],
  controllers: [MemorySlotController],
  providers: [AgentContextService, MemorySlotService],
  exports: [AgentContextService, MemorySlotService],
})
export class AgentContextModule {}
