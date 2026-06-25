import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';
import { IntentEngineService } from './intent-engine.service';
import { StrategyGraphService } from './strategy-graph.service';
import { MarketMonitorService } from './market-monitor.service';
import { AtomicSettlementService } from './atomic-settlement.service';
import { StrategyGraph } from './entities/strategy-graph.entity';
import { StrategyNode } from './entities/strategy-node.entity';
import { MarketMonitor } from './entities/market-monitor.entity';
import { IntentRecord } from './entities/intent-record.entity';
import { AtomicSettlement } from './entities/atomic-settlement.entity';
import { LiquidityModule } from '../liquidity/liquidity.module';
import { AgentAuthorizationModule } from '../agent-authorization/agent-authorization.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      StrategyGraph,
      StrategyNode,
      MarketMonitor,
      IntentRecord,
      AtomicSettlement,
    ]),
    ScheduleModule.forRoot(),
    LiquidityModule,
    AgentAuthorizationModule,
  ],
  providers: [
    IntentEngineService,
    StrategyGraphService,
    MarketMonitorService,
    AtomicSettlementService,
  ],
  exports: [
    IntentEngineService,
    StrategyGraphService,
    MarketMonitorService,
    AtomicSettlementService,
  ],
})
export class TradingModule {}

