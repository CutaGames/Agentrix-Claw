import { Module, Global } from '@nestjs/common';
import { CostTrackerService } from './cost-tracker.service';

@Global()
@Module({
  providers: [CostTrackerService],
  exports: [CostTrackerService],
})
export class CostTrackerModule {}
