import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MerchantTaskService } from './merchant-task.service';
import { MerchantTaskController } from './merchant-task.controller';
import { MerchantTask } from '../../entities/merchant-task.entity';
import { OrderModule } from '../order/order.module';
import { NotificationModule } from '../notification/notification.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([MerchantTask]),
    OrderModule,
    forwardRef(() => NotificationModule),
  ],
  controllers: [MerchantTaskController],
  providers: [MerchantTaskService],
  exports: [MerchantTaskService],
})
export class MerchantTaskModule {}

