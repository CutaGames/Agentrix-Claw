import { Module, Global } from '@nestjs/common';
import { QueryEngineService } from './query-engine.service';
import { CostTrackerModule } from '../cost-tracker/cost-tracker.module';
import { ToolRegistryModule } from '../tool-registry/tool-registry.module';
import { PermissionsModule } from '../permissions/permissions.module';

@Global()
@Module({
  imports: [CostTrackerModule, ToolRegistryModule, PermissionsModule],
  providers: [QueryEngineService],
  exports: [QueryEngineService],
})
export class QueryEngineModule {}
