import { Module, Global } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CostTrackerService } from './cost-tracker.service';
import { AgentCostRecord } from '../../entities/agent-cost-record.entity';

@Global()
@Module({
  imports: [TypeOrmModule.forFeature([AgentCostRecord])],
  providers: [CostTrackerService],
  exports: [CostTrackerService],
})
export class CostTrackerModule {}
