import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AgentRepairAttempt } from '../../entities/agent-repair-attempt.entity';
import { AgentRepairJob } from '../../entities/agent-repair-job.entity';
import { AgentRepairPatch } from '../../entities/agent-repair-patch.entity';
import { AutoRepairController } from './auto-repair.controller';
import { AutoRepairService } from './auto-repair.service';

@Module({
  imports: [TypeOrmModule.forFeature([AgentRepairJob, AgentRepairAttempt, AgentRepairPatch])],
  controllers: [AutoRepairController],
  providers: [AutoRepairService],
  exports: [AutoRepairService],
})
export class AutoRepairModule {}