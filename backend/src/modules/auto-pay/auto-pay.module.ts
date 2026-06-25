import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AutoPayController } from './auto-pay.controller';
import { AutoPayService } from './auto-pay.service';
import { AutoPayExecutorService } from './auto-pay-executor.service';
import { AutoPayGrant } from '../../entities/auto-pay-grant.entity';
import { Authorization } from '../../entities/authorization.entity';
import { Payment } from '../../entities/payment.entity';
import { User } from '../../entities/user.entity';
import { AgentModule } from '../agent/agent.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([AutoPayGrant, Authorization, Payment, User]),
    forwardRef(() => AgentModule),
  ],
  controllers: [AutoPayController],
  providers: [AutoPayService, AutoPayExecutorService],
  exports: [AutoPayService, AutoPayExecutorService],
})
export class AutoPayModule {}

