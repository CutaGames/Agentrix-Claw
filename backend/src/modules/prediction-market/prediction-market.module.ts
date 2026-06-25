import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PredictionRound } from '../../entities/prediction-round.entity';
import { PredictionBet } from '../../entities/prediction-bet.entity';
import { PredictionUserBalance } from '../../entities/prediction-user-balance.entity';
import { PredictionMarketService } from './prediction-market.service';
import { PriceOracleService } from './price-oracle.service';
import { PolymarketFeedService } from './polymarket-feed.service';
import { PredictionMarketController } from './prediction-market.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([PredictionRound, PredictionBet, PredictionUserBalance]),
  ],
  controllers: [PredictionMarketController],
  providers: [PredictionMarketService, PriceOracleService, PolymarketFeedService],
  exports: [PredictionMarketService, PolymarketFeedService],
})
export class PredictionMarketModule {}
