import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MerchantTaskService } from './merchant-task.service';
import { TaskMarketplaceService } from './task-marketplace.service';
import { TaskCommissionService } from './task-commission.service';
import { MerchantTaskController } from './merchant-task.controller';
import { MerchantTask } from '../../entities/merchant-task.entity';
import { TaskBid } from '../../entities/task-bid.entity';
import { OrderModule } from '../order/order.module';
import { NotificationModule } from '../notification/notification.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([MerchantTask, TaskBid]),
    OrderModule,
    forwardRef(() => NotificationModule),
  ],
  controllers: [MerchantTaskController],
  providers: [MerchantTaskService, TaskMarketplaceService, TaskCommissionService],
  exports: [MerchantTaskService, TaskMarketplaceService, TaskCommissionService],
})
export class MerchantTaskModule {}

