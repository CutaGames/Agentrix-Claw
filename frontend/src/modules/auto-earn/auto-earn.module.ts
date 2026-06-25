import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AutoEarnController } from './auto-earn.controller';
import { AutoEarnService } from './auto-earn.service';
import { AirdropService } from './airdrop.service';
import { TaskExecutorService } from './task-executor.service';
import { ArbitrageService } from './arbitrage.service';
import { LaunchpadService } from './launchpad.service';
import { StrategyService } from './strategy.service';
import { UserAgent } from '../../entities/user-agent.entity';
import { AutoEarnTask } from '../../entities/auto-earn-task.entity';
import { Airdrop } from '../../entities/airdrop.entity';
import { StrategyConfig } from '../../entities/strategy-config.entity';

@Module({
  imports: [TypeOrmModule.forFeature([UserAgent, AutoEarnTask, Airdrop, StrategyConfig])],
  controllers: [AutoEarnController],
  providers: [
    AutoEarnService,
    AirdropService,
    TaskExecutorService,
    ArbitrageService,
    LaunchpadService,
    StrategyService,
  ],
  exports: [
    AutoEarnService,
    AirdropService,
    TaskExecutorService,
    ArbitrageService,
    LaunchpadService,
    StrategyService,
  ],
})
export class AutoEarnModule {}

