import { Module, Global, forwardRef } from '@nestjs/common';
import { QueryEngineService } from './query-engine.service';
import { RuntimeSeamService } from './runtime-seam.service';
import { CostTrackerModule } from '../cost-tracker/cost-tracker.module';
import { ToolRegistryModule } from '../tool-registry/tool-registry.module';
import { PermissionsModule } from '../permissions/permissions.module';
import { HookModule } from '../hooks/hook.module';
import { McpRegistryModule } from '../mcp-registry/mcp-registry.module';
import { AgentContextModule } from '../agent-context/agent-context.module';
import { PluginModule } from '../plugin/plugin.module';

@Global()
@Module({
  imports: [
    CostTrackerModule,
    ToolRegistryModule,
    PermissionsModule,
    forwardRef(() => HookModule),
    forwardRef(() => McpRegistryModule),
    forwardRef(() => AgentContextModule),
    forwardRef(() => PluginModule),
  ],
  providers: [QueryEngineService, RuntimeSeamService],
  exports: [QueryEngineService, RuntimeSeamService],
})
export class QueryEngineModule {}
