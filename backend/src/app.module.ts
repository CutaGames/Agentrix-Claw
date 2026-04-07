import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { DatabaseConfig } from './config/database.config';
import { AuthModule } from './modules/auth/auth.module';
import { WalletModule } from './modules/wallet/wallet.module';
import { PaymentModule } from './modules/payment/payment.module';
import { AutoPayModule } from './modules/auto-pay/auto-pay.module';
import { ProductModule } from './modules/product/product.module';
import { CommissionModule } from './modules/commission/commission.module';
import { OrderModule } from './modules/order/order.module';
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
import { UploadModule } from './modules/upload/upload.module';
import { VoiceModule } from './modules/voice/voice.module';
import { AIRAGModule } from './modules/ai-rag/ai-rag.module';
import { OpenAIIntegrationModule } from './modules/ai-integration/openai/openai-integration.module';
import { GroqIntegrationModule } from './modules/ai-integration/groq/groq-integration.module';
import { GeminiIntegrationModule } from './modules/ai-integration/gemini/gemini-integration.module';
import { ClaudeIntegrationModule } from './modules/ai-integration/claude/claude-integration.module';
import { CartModule } from './modules/cart/cart.module';
import { SkillModule } from './modules/skill/skill.module';
import { ProtocolModule } from './modules/protocol/protocol.module';
import { McpModule } from './modules/mcp/mcp.module';
import { UCPModule } from './modules/ucp/ucp.module';
import { X402DiscoveryModule } from './modules/x402/x402-discovery.module';
// V2.0: 统一 Marketplace 模块
import { UnifiedMarketplaceModule } from './modules/unified-marketplace/unified-marketplace.module';
// 账户体系优化模块
import { AgentAccountModule } from './modules/agent-account/agent-account.module';
import { AgentTeamModule } from './modules/agent-team/agent-team.module';
import { UnifiedAgentModule } from './modules/unified-agent/unified-agent.module';
import { AccountModule } from './modules/account/account.module';
import { KYCModule } from './modules/kyc/kyc.module';
import { DeveloperAccountModule } from './modules/developer-account/developer-account.module';
// 工作空间模块
import { WorkspaceModule } from './modules/workspace/workspace.module';
// 总部控制台模块
import { HqModule } from './modules/hq/hq.module';
// 专家档案模块
import { ExpertProfileModule } from './modules/expert-profile/expert-profile.module';
// 数据集模块
import { DatasetModule } from './modules/dataset/dataset.module';
// 通用模块（守卫、装饰器等）
import { CommonModule } from './modules/common/common.module';
import { RateLimitGuard } from './common/guards/throttle.guard';
// Commerce Skill 模块
import { CommerceModule } from './modules/commerce/commerce.module';
// A2A (Agent-to-Agent) 模块
import { A2AModule } from './modules/a2a/a2a.module';
// ClawLink: OpenClaw 连接 & 代理模块
import { OpenClawConnectionModule } from './modules/openclaw-connection/openclaw-connection.module';
import { OpenClawProxyModule } from './modules/openclaw-proxy/openclaw-proxy.module';
import { OpenClawBridgeModule } from './modules/openclaw-bridge/openclaw-bridge.module';
import { TokenQuotaModule } from './modules/token-quota/token-quota.module';
// 邀请码模块
import { InvitationModule } from './modules/invitation/invitation.module';
// ClawLink: 社区动态模块
import { SocialModule } from './modules/social/social.module';
import { MessagingModule } from './modules/messaging/messaging.module';
// WebSocket 实时推送
import { WebSocketModule } from './modules/websocket/websocket.module';
// Workflow automation (Layer 1)
import { WorkflowModule } from './modules/workflow/workflow.module';
// ERC-4337 Account Abstraction (gasless txns)
import { AccountAbstractionModule } from './modules/account-abstraction/account-abstraction.module';
// AI Provider custom API key management
import { AiProviderModule } from './modules/ai-provider/ai-provider.module';
import { DesktopSyncModule } from './modules/desktop-sync/desktop-sync.module';
// Agent Presence: unified agent identity, timeline, memory, channel binding
import { AgentPresenceModule } from './modules/agent-presence/agent-presence.module';
// Wearable Phase 2-3: continuous telemetry + automation triggers
import { WearableTelemetryModule } from './modules/wearable-telemetry/wearable-telemetry.module';
// Agent Intelligence: Plan Mode, Auto-Memory, Compaction, Cross-device Sync
import { AgentIntelligenceModule } from './modules/agent-intelligence/agent-intelligence.module';
// P6: Hook system, Custom slash commands, MCP server registry
import { HookModule } from './modules/hooks/hook.module';
import { SlashCommandModule } from './modules/slash-commands/slash-command.module';
import { McpRegistryModule } from './modules/mcp-registry/mcp-registry.module';
// Phase 1-2: Tool Registry, Query Engine, Cost Tracker (Claude Code architecture reference)
import { ToolRegistryModule } from './modules/tool-registry/tool-registry.module';
import { QueryEngineModule } from './modules/query-engine/query-engine.module';
import { CostTrackerModule } from './modules/cost-tracker/cost-tracker.module';
// LLM Router: tri-tier model routing
import { LlmRouterModule } from './modules/llm-router/llm-router.module';
// OpenClaw 4.5: Dreaming Engine, Memory-Wiki
import { DreamingModule } from './modules/dreaming/dreaming.module';
import { MemoryWikiModule } from './modules/memory-wiki/memory-wiki.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    TypeOrmModule.forRootAsync({
      useClass: DatabaseConfig,
      inject: [DatabaseConfig],
    }),
    ScheduleModule.forRoot(),
    AuthModule,
    WalletModule,
    CommissionModule,
    PaymentModule,
    AutoPayModule,
    ProductModule,
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
    ClaudeIntegrationModule,
    UploadModule,
    VoiceModule,
    CartModule,
    SkillModule,
    ProtocolModule,
    McpModule,
    UCPModule,
    X402DiscoveryModule,
    // V2.0: 统一 Marketplace
    UnifiedMarketplaceModule,
    // 账户体系优化
    AgentAccountModule,
    AgentTeamModule,
    UnifiedAgentModule,
    AccountModule,
    KYCModule,
    DeveloperAccountModule,
    // 工作空间
    WorkspaceModule,
    // 总部控制台 (已分离到 main-hq.ts 单独启动)
    // HqModule,
    // 专家档案
    ExpertProfileModule,
    // 数据集
    DatasetModule,
    // 通用模块
    CommonModule,
    // Commerce Skill
    CommerceModule,
    // A2A (Agent-to-Agent)
    A2AModule,
    // ClawLink: OpenClaw 连接 & 代理
    OpenClawConnectionModule,
    OpenClawProxyModule,
    OpenClawBridgeModule,
    // Token quota tracking
    TokenQuotaModule,
    // Invitation code system
    InvitationModule,
    // ClawLink: 社区动态
    SocialModule,
    // Direct Messaging
    MessagingModule,
    // WebSocket 实时推送
    WebSocketModule,
    DesktopSyncModule,
    // Workflow automation & cron (Layer 1)
    WorkflowModule,
    // ERC-4337: Account Abstraction (gasless txns, smart accounts)
    AccountAbstractionModule,
    // AI Provider custom API key management
    AiProviderModule,
    // Agent Presence: unified agent identity, timeline, memory, channel binding
    AgentPresenceModule,
    // Wearable Phase 2-3: continuous telemetry + automation triggers
    WearableTelemetryModule,
    // Agent Intelligence: Plan Mode, Auto-Memory, Compaction, Cross-device Sync
    AgentIntelligenceModule,
    // P6: Developer Extension Capabilities
    HookModule,
    SlashCommandModule,
    McpRegistryModule,
    // Phase 1-2: Claude Code reference architecture
    ToolRegistryModule,
    QueryEngineModule,
    CostTrackerModule,
    // LLM Router: tri-tier model routing
    LlmRouterModule,
    // OpenClaw 4.5: Dreaming Engine, Memory-Wiki
    DreamingModule,
    MemoryWikiModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    // Global rate limiter: 100 req / 60s per IP (configurable via RATE_LIMIT_TTL / RATE_LIMIT_MAX)
    { provide: APP_GUARD, useClass: RateLimitGuard },
  ],
})
export class AppModule {}
