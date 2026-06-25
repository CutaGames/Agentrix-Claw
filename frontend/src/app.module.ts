import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { DatabaseConfig } from './config/database.config';
import { WalletModule } from './modules/wallet/wallet.module';
import { PaymentModule } from './modules/payment/payment.module';
import { AutoPayModule } from './modules/auto-pay/auto-pay.module';
import { ProductModule } from './modules/product/product.module';
import { CommissionModule } from './modules/commission/commission.module';
import { OrderModule } from './modules/order/order.module';
import { AuthModule } from './modules/auth/auth.module';
import { ContractModule } from './modules/contract/contract.module';
import { UserModule } from './modules/user/user.module';
import { NotificationModule } from './modules/notification/notification.module';
import { SearchModule } from './modules/search/search.module';
import { RiskModule } from './modules/risk/risk.module';
import { ComplianceModule } from './modules/compliance/compliance.module';
import { LedgerModule } from './modules/ledger/ledger.module';
import { WebhookModule } from './modules/webhook/webhook.module';
import { AgentModule } from './modules/agent/agent.module';
import { RecommendationModule } from './modules/recommendation/recommendation.module';
import { MerchantTaskModule } from './modules/merchant-task/merchant-task.module';
import { OnChainIndexerModule } from './modules/onchain-indexer/onchain-indexer.module';
import { SandboxModule } from './modules/sandbox/sandbox.module';
import { CacheModule } from './modules/cache/cache.module';
import { LogisticsModule } from './modules/logistics/logistics.module';
import { TokenModule } from './modules/token/token.module';
import { NFTModule } from './modules/nft/nft.module';
import { MetadataModule } from './modules/metadata/metadata.module';
import { MarketplaceModule } from './modules/marketplace/marketplace.module';
import { AutoEarnModule } from './modules/auto-earn/auto-earn.module';
import { UserAgentModule } from './modules/user-agent/user-agent.module';
import { MockWebsiteModule } from './modules/mock/mock-website.module';
import { ReferralModule } from './modules/referral/referral.module';
import { CouponModule } from './modules/coupon/coupon.module';
import { MerchantModule } from './modules/merchant/merchant.module';
import { IntegrationsModule } from './integrations/integrations.module';
import { PricingModule } from './modules/pricing/pricing.module';
import { TaxModule } from './modules/tax/tax.module';
import { AnalyticsModule } from './modules/analytics/analytics.module';
import { StatisticsModule } from './modules/statistics/statistics.module';
import { PluginModule } from './modules/plugin/plugin.module';
import { RelayerModule } from './modules/relayer/relayer.module';
import { SessionModule } from './modules/session/session.module';
import { MPCWalletModule } from './modules/mpc-wallet/mpc-wallet.module';
import { AdminModule } from './modules/admin/admin.module';
import { AiCapabilityModule } from './modules/ai-capability/ai-capability.module';
import { AIRAGModule } from './modules/ai-rag/ai-rag.module';
import { OpenAIIntegrationModule } from './modules/ai-integration/openai/openai-integration.module';
import { GroqIntegrationModule } from './modules/ai-integration/groq/groq-integration.module';
import { GeminiIntegrationModule } from './modules/ai-integration/gemini/gemini-integration.module';
// import { WebSocketModule } from './modules/websocket/websocket.module';
import { ScheduleModule } from '@nestjs/schedule';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    TypeOrmModule.forRootAsync({
      useClass: DatabaseConfig,
      // 在 TypeORM 初始化后立即修复枚举类型
      inject: [DatabaseConfig],
    }),
    ScheduleModule.forRoot(),
    AuthModule,
    WalletModule,
    PaymentModule,
    AutoPayModule,
    ProductModule,
    CommissionModule,
    OrderModule,
    ContractModule,
    UserModule,
    NotificationModule,
    SearchModule,
    RiskModule,
    ComplianceModule,
    LedgerModule,
    WebhookModule,
    AgentModule,
    RecommendationModule,
    MerchantTaskModule,
    OnChainIndexerModule,
    SandboxModule,
    CacheModule,
    LogisticsModule,
    TokenModule,
    NFTModule,
    MetadataModule,
    MarketplaceModule,
    AutoEarnModule,
    UserAgentModule,
    MockWebsiteModule,
    ReferralModule,
    CouponModule,
    MerchantModule,
    IntegrationsModule,
    PricingModule,
    TaxModule,
    AnalyticsModule,
    StatisticsModule,
    PluginModule,
    RelayerModule,
    SessionModule,
    MPCWalletModule,
    AdminModule,
    AiCapabilityModule,
    AIRAGModule,
    OpenAIIntegrationModule,
    GroqIntegrationModule,
    GeminiIntegrationModule,
    // WebSocketModule, // 暂时禁用，需要安装 @nestjs/websockets 和 socket.io
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}

