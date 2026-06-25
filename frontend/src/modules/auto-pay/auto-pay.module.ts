import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AutoPayController } from './auto-pay.controller';
import { AutoPayService } from './auto-pay.service';
import { AutoPayExecutorService } from './auto-pay-executor.service';
import { AutoPayGrant } from '../../entities/auto-pay-grant.entity';
import { Payment } from '../../entities/payment.entity';
import { User } from '../../entities/user.entity';

@Module({
  imports: [TypeOrmModule.forFeature([AutoPayGrant, Payment, User])],
  controllers: [AutoPayController],
  providers: [AutoPayService, AutoPayExecutorService],
  exports: [AutoPayService, AutoPayExecutorService],
})
export class AutoPayModule {}

