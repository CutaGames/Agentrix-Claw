import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';
import { CommissionController } from './commission.controller';
import { CommissionService } from './commission.service';
import { CommissionCalculatorService } from './commission-calculator.service';
import { CommissionSchedulerService } from './commission-scheduler.service';
import { Commission } from '../../entities/commission.entity';
import { CommissionSettlement } from '../../entities/commission-settlement.entity';
import { Payment } from '../../entities/payment.entity';
import { Product } from '../../entities/product.entity';
import { User } from '../../entities/user.entity';
import { Order } from '../../entities/order.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Commission,
      CommissionSettlement,
      Payment,
      Product,
      User,
      Order,
    ]),
    ScheduleModule.forRoot(),
  ],
  controllers: [CommissionController],
  providers: [
    CommissionService,
    CommissionCalculatorService,
    CommissionSchedulerService,
  ],
  exports: [CommissionService, CommissionCalculatorService],
})
export class CommissionModule {}

