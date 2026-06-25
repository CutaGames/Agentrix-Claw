import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UserAgentController } from './user-agent.controller';
import { UserAgentService } from './user-agent.service';
import { UserAgent } from '../../entities/user-agent.entity';
import { User } from '../../entities/user.entity';
import { Payment } from '../../entities/payment.entity';
import { Order } from '../../entities/order.entity';
import { Budget } from '../../entities/budget.entity';
import { KYCReuseService } from './kyc-reuse.service';
import { MerchantTrustService } from './merchant-trust.service';
import { PaymentMemoryService } from './payment-memory.service';
import { SubscriptionService } from './subscription.service';
import { BudgetService } from './budget.service';
import { TransactionClassificationService } from './transaction-classification.service';
import { ComplianceModule } from '../compliance/compliance.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([UserAgent, User, Payment, Order, Budget]),
    ComplianceModule,
  ],
  controllers: [UserAgentController],
  providers: [
    UserAgentService,
    KYCReuseService,
    MerchantTrustService,
    PaymentMemoryService,
    SubscriptionService,
    BudgetService,
    TransactionClassificationService,
  ],
  exports: [
    UserAgentService,
    KYCReuseService,
    MerchantTrustService,
    PaymentMemoryService,
    SubscriptionService,
    BudgetService,
    TransactionClassificationService,
  ],
})
export class UserAgentModule {}

