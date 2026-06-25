import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UserAgentController } from './user-agent.controller';
import { UserAgentService } from './user-agent.service';
import { UserAgent } from '../../entities/user-agent.entity';
import { User } from '../../entities/user.entity';
import { Payment } from '../../entities/payment.entity';
import { Order } from '../../entities/order.entity';
import { Budget } from '../../entities/budget.entity';
import { Policy } from '../../entities/policy.entity';
import { KYCReuseService } from './kyc-reuse.service';
import { MerchantTrustService } from './merchant-trust.service';
import { PaymentMemoryService } from './payment-memory.service';
import { SubscriptionService } from './subscription.service';
import { BudgetService } from './budget.service';
import { TransactionClassificationService } from './transaction-classification.service';
import { PolicyEngineService } from './policy-engine.service';
import { ComplianceModule } from '../compliance/compliance.module';
import { NotificationModule } from '../notification/notification.module';
import { GeminiIntegrationModule } from '../ai-integration/gemini/gemini-integration.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([UserAgent, User, Payment, Order, Budget, Policy]),
    ComplianceModule,
    NotificationModule,
    forwardRef(() => GeminiIntegrationModule),
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
    PolicyEngineService,
  ],
  exports: [
    UserAgentService,
    KYCReuseService,
    MerchantTrustService,
    PaymentMemoryService,
    SubscriptionService,
    BudgetService,
    TransactionClassificationService,
    PolicyEngineService,
  ],
})
export class UserAgentModule {}

