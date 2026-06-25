import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AgentController } from './agent.controller';
import { AgentService } from './agent.service';
import { Product } from '../../entities/product.entity';
import { Order } from '../../entities/order.entity';
import { Payment } from '../../entities/payment.entity';
import { AgentSession } from '../../entities/agent-session.entity';
import { AgentMessage } from '../../entities/agent-message.entity';
import { AuditLog } from '../../entities/audit-log.entity';
import { ProductModule } from '../product/product.module';
import { OrderModule } from '../order/order.module';
import { PaymentModule } from '../payment/payment.module';
import { SearchModule } from '../search/search.module';
import { RecommendationModule } from '../recommendation/recommendation.module';
import { LogisticsModule } from '../logistics/logistics.module';
import { AgentTemplate } from '../../entities/agent-template.entity';
import { UserAgent } from '../../entities/user-agent.entity';
import { AgentTemplateService } from './agent-template.service';
import { AgentP0IntegrationService } from './agent-p0-integration.service';
import { TemplateSubscriptionService } from './template-subscription.service';
import { TemplateReviewService } from './template-review.service';
import { TemplateReview } from '../../entities/template-review.entity';
import { DeploymentModule } from './deployment/deployment.module';
import { UserAgentModule } from '../user-agent/user-agent.module';
import { MerchantModule } from '../merchant/merchant.module';
import { WalletModule } from '../wallet/wallet.module';
import { AnalyticsModule } from '../analytics/analytics.module';
import { CartModule } from '../cart/cart.module';
import { UserModule } from '../user/user.module';
import { User } from '../../entities/user.entity';
import { RuntimeModule } from './runtime/runtime.module';
import { AgentRuntimeIntegrationService } from './agent-runtime-integration.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Product,
      Order,
      Payment,
      AgentSession,
      AgentMessage,
      AuditLog,
      AgentTemplate,
      UserAgent,
      TemplateReview,
      User,
    ]),
    forwardRef(() => ProductModule),
    forwardRef(() => OrderModule),
    forwardRef(() => PaymentModule),
    forwardRef(() => SearchModule),
    forwardRef(() => RecommendationModule),
    forwardRef(() => LogisticsModule),
    forwardRef(() => UserAgentModule),
    forwardRef(() => MerchantModule),
    forwardRef(() => WalletModule),
    forwardRef(() => AnalyticsModule),
    forwardRef(() => CartModule),
    forwardRef(() => UserModule),
    DeploymentModule,
    RuntimeModule,
  ],
  controllers: [AgentController],
  providers: [
    AgentService,
    AgentTemplateService,
    AgentP0IntegrationService,
    TemplateSubscriptionService,
    TemplateReviewService,
    AgentRuntimeIntegrationService,
  ],
  exports: [
    AgentService,
    AgentTemplateService,
    AgentP0IntegrationService,
    TemplateSubscriptionService,
    TemplateReviewService,
  ],
})
export class AgentModule {}

