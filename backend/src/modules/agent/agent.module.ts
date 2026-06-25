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
import { AgentRegistry } from '../../entities/agent-registry.entity';
import { Authorization } from '../../entities/authorization.entity';
import { AuditProof } from '../../entities/audit-proof.entity';
import { AgentTemplateService } from './agent-template.service';
import { AgentP0IntegrationService } from './agent-p0-integration.service';
import { AgentRegistryService } from './agent-registry.service';
import { AuthorizationService } from './authorization.service';
import { AgentCheckoutService } from './agent-checkout.service';
import { AgentExecutePaymentService } from './agent-execute-payment.service';
import { PolicyEvaluatorService } from './policy-evaluator.service';
import { TemplateSubscriptionService } from './template-subscription.service';
import { EasService } from './eas.service';
import { Policy } from '../../entities/policy.entity';
import { AuditAnchoringService } from './audit-anchoring.service';
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
import { ApiKeyModule } from '../api-key/api-key.module';
import { GeminiIntegrationModule } from '../ai-integration/gemini/gemini-integration.module';
import { AgentTemplateSeederService } from '../../database/seeds/agent-template-seeder.service';
import { MPCWalletModule } from '../mpc-wallet/mpc-wallet.module';
import { AuthModule } from '../auth/auth.module';
import { WebhookModule } from '../webhook/webhook.module';
import { UnifiedMarketplaceModule } from '../unified-marketplace/unified-marketplace.module';
import { AutoPayModule } from '../auto-pay/auto-pay.module';

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
      AgentRegistry,
      Authorization,
      AuditProof,
      Policy,
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
    MPCWalletModule,
    ApiKeyModule,
    AuthModule,
    WebhookModule,
    DeploymentModule,
    RuntimeModule,
    forwardRef(() => GeminiIntegrationModule),
    forwardRef(() => UnifiedMarketplaceModule),
    forwardRef(() => AutoPayModule),
  ],
  controllers: [AgentController],
  providers: [
    AgentService,
    AgentTemplateService,
    AgentTemplateSeederService, // Auto-seed default templates on startup
    AgentP0IntegrationService,
    AgentRegistryService,
    AuthorizationService,
    AgentCheckoutService,
    AgentExecutePaymentService,
    PolicyEvaluatorService,
    TemplateSubscriptionService,
    TemplateReviewService,
    EasService,
    AuditAnchoringService,
    AgentRuntimeIntegrationService,
  ],
  exports: [
    AgentService,
    AgentTemplateService,
    AgentP0IntegrationService,
    AgentRegistryService,
    AuthorizationService,
    AgentCheckoutService,
    AgentExecutePaymentService,
    PolicyEvaluatorService,
    TemplateSubscriptionService,
    TemplateReviewService,
    EasService,
  ],
})
export class AgentModule {}

