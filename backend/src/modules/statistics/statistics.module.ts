import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { AgentStats } from '../../entities/agent-stats.entity'
import { Commission } from '../../entities/commission.entity'
import { StatisticsController } from './statistics.controller'
import { StatisticsService } from './statistics.service'

@Module({
  imports: [TypeOrmModule.forFeature([AgentStats, Commission])],
  controllers: [StatisticsController],
  providers: [StatisticsService],
  exports: [StatisticsService],
})
export class StatisticsModule {}


