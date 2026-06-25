import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AgentAuthorization } from './entities/agent-authorization.entity';
import { AgentStrategyPermission } from './entities/agent-strategy-permission.entity';
import { AgentExecutionHistory } from './entities/agent-execution-history.entity';
import { AgentAuthorizationService } from './agent-authorization.service';
import { StrategyPermissionEngine } from './strategy-permission-engine.service';
import { AgentAuthorizationController } from './agent-authorization.controller';
import { StrategyGraph } from '../trading/entities/strategy-graph.entity';
import { StrategyNode } from '../trading/entities/strategy-node.entity';

/**
 * Agent授权模块
 * 注意：这是独立模块，不影响现有支付功能
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      AgentAuthorization,
      AgentStrategyPermission,
      AgentExecutionHistory,
      StrategyGraph,
      StrategyNode,
    ]),
  ],
  controllers: [AgentAuthorizationController],
  providers: [AgentAuthorizationService, StrategyPermissionEngine],
  exports: [AgentAuthorizationService, StrategyPermissionEngine],
})
export class AgentAuthorizationModule {}

