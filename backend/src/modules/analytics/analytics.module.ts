import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { Order } from '../../entities/order.entity'
import { Commission } from '../../entities/commission.entity'
import { CommissionSettlement } from '../../entities/commission-settlement.entity'
import { User } from '../../entities/user.entity'
import { AnalyticsController } from './analytics.controller'
import { GrowthDashboardController } from './growth-dashboard.controller'
import { AnalyticsService } from './analytics.service'

@Module({
  imports: [TypeOrmModule.forFeature([Order, Commission, CommissionSettlement, User])],
  controllers: [AnalyticsController, GrowthDashboardController],
  providers: [AnalyticsService],
  exports: [AnalyticsService],
})
export class AnalyticsModule {}


