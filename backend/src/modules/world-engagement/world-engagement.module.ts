import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { GameScoreEntity } from './entities/game-score.entity';
import { PredictionMarketEntity } from './entities/prediction-market.entity';
import { PredictionStakeEntity } from './entities/prediction-stake.entity';
import { ArenaTournamentEntity } from './entities/arena-tournament.entity';
import { ArenaEntryEntity } from './entities/arena-entry.entity';
import { User } from '../../entities/user.entity';
import { AxpModule } from '../axp/axp.module';
import { AiProviderModule } from '../ai-provider/ai-provider.module';

import { GameScoreService } from './game-score.service';
import { PredictionService } from './prediction.service';
import { CoachService } from './coach.service';
import { ArenaTournamentService } from './arena-tournament.service';
import { WorldArenaController, PredictionController } from './world-engagement.controller';

/**
 * WorldEngagementModule — World 参与度/竞技/变现(2026-06)。
 *   - GameScoreService:游戏分数权威 + 周榜(P0 keystone;为竞技奖池/反作弊铺路)。
 *   - PredictionService:事件预测市场(parimutuel 彩池,AXP;如世界杯赛果)。
 * 复用 AxpModule(spend/earn 权威结算)。
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([GameScoreEntity, PredictionMarketEntity, PredictionStakeEntity, ArenaTournamentEntity, ArenaEntryEntity, User]),
    AxpModule,
    AiProviderModule,
  ],
  controllers: [WorldArenaController, PredictionController],
  providers: [GameScoreService, PredictionService, CoachService, ArenaTournamentService],
  exports: [GameScoreService, PredictionService, CoachService, ArenaTournamentService],
})
export class WorldEngagementModule {}
