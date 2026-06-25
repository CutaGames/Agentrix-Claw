import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MarketplaceAsset } from '../../entities/marketplace-asset.entity';
import { AssetSource } from '../../entities/asset-source.entity';
import { UserAgent } from '../../entities/user-agent.entity';
import { AgentStats } from '../../entities/agent-stats.entity';
import { MarketplaceService } from './marketplace.service';
import { AgentMarketplaceService } from './agent-marketplace.service';
import { MarketplaceController } from './marketplace.controller';
import { AssetIngestorService } from './services/asset-ingestor.service';
import { AssetNormalizerService } from './services/asset-normalizer.service';
import { AssetSchedulerService } from './services/asset-scheduler.service';
import { AssetTradingService } from './services/asset-trading.service';
import { AssetAggregationService } from './asset-aggregation.service';
import { AssetAggregation } from '../../entities/asset-aggregation.entity';

@Module({
  imports: [TypeOrmModule.forFeature([MarketplaceAsset, AssetSource, UserAgent, AgentStats, AssetAggregation])],
  controllers: [MarketplaceController],
  providers: [
    MarketplaceService,
    AgentMarketplaceService,
    AssetIngestorService,
    AssetNormalizerService,
    AssetSchedulerService,
    AssetTradingService,
    AssetAggregationService,
  ],
  exports: [MarketplaceService, AgentMarketplaceService, AssetAggregationService],
})
export class MarketplaceModule {}

