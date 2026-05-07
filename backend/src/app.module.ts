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
import { GenerationProvidersModule } from './modules/generation-providers/generation-providers.module';
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
// Prediction Market: BTC 5min up/down + Polymarket trending feed
import { PredictionMarketModule } from './modules/prediction-market/prediction-market.module';
import { CodeIntelligenceModule } from './modules/code-intelligence/code-intelligence.module';
import { AutoRepairModule } from './modules/auto-repair/auto-repair.module';
import { DesktopUpdateModule } from './modules/desktop-update/desktop-update.module';
import { RuntimeDoctorModule } from './modules/runtime-doctor/runtime-doctor.module';
import { ToolControlPlaneModule } from './modules/tool-control-plane/tool-control-plane.module';
import { OperationsControlPlaneModule } from './modules/operations-control-plane/operations-control-plane.module';
// v3.0 Living Pet (顿领 §3.4): 1 user = 1 主宠状态机 + 亲密度 + 引擎切换契约
import { LivingPetModule } from './modules/living-pet/living-pet.module';
// Phase 1（灵魂 × 皮肤解耦）：6 族群 28 只签名宠物 + 用户皮肤资产
import { PetSoulTemplateModule } from './modules/pet-soul-template/pet-soul-template.module';
import { PetSkinModule } from './modules/pet-skin/pet-skin.module';
// Phase 2 W1 骨架：配额 / 审核 / Rive 资产清单
import { PetGenQuotaModule } from './modules/pet-gen-quota/pet-gen-quota.module';
import { ModerationModule } from './modules/moderation/moderation.module';
import { PetRiveAssetModule } from './modules/pet-rive-asset/pet-rive-asset.module';
// Phase 2 W2: DMCA takedown
import { DmcaModule } from './modules/dmca/dmca.module';
// Phase 3 W1: Marketplace MVP (listing/auction/rental + royalty splitter)
import { MarketplacePetModule } from './modules/marketplace-pet/marketplace-pet.module';
// Phase 4 W7: Pet Energy + Risk Control + Auto-Earn evaluator + Daily report
import { PetEnergyModule } from './modules/pet-energy/pet-energy.module';
import { BillingPlanModule } from './modules/billing-plan/billing-plan.module';
// Phase 4 W7: A2A pet-as-issuer dispatch
import { PetA2AModule } from './modules/pet-a2a/pet-a2a.module';
// Phase 4 W8: WebAuthn / Passkey for L3 web co-sign
import { PasskeyModule } from './modules/passkey/passkey.module';
// Phase 5 BE-10.2 / BE-10.3: ClawCore device registry + chunked OTA
import { DeviceRegistryModule } from './modules/device-registry/device-registry.module';
// Phase 5 WB-12.1: Partner inquiry capture for /hardware
import { PartnerInquiryModule } from './modules/partner-inquiry/partner-inquiry.module';
// Phase 6 M2: multi-pet team (子宠分身)
import { PetTeamModule } from './modules/pet-team/pet-team.module';
// Phase 6 M3: pet NFT mint intent (链上身份)
import { PetNftModule } from './modules/pet-nft/pet-nft.module';
// Phase 6 M5: partner-app SDK (跨 App 宠物)
import { PartnerAppModule } from './modules/partner-app/partner-app.module';
// Phase 6 M6: sovereign pet (MPC 托管 + 链上记忆)
import { PetSovereignModule } from './modules/pet-sovereign/pet-sovereign.module';
import { ApprovalModule } from './modules/approval/approval.module';
import { HandoffV1Module } from './modules/handoff/handoff-v1.module';
import { WalletProjectionModule } from './modules/wallet-projection/wallet-projection.module';
// v3.0 P1 Pro Mode 升级
import { VitalsBusModule } from './modules/vitals-bus/vitals-bus.module';
import { MemoryTiersModule } from './modules/memory-tiers/memory-tiers.module';
import { PlanRunnerModule } from './modules/plan-runner/plan-runner.module';
import { SplitBudgetModule } from './modules/split-budget/split-budget.module';
// v3.0 P2 Doer + Economy + 厂商接入
import { A2AMatchingModule } from './modules/a2a-matching/a2a-matching.module';
import { WorkflowTemplatesModule } from './modules/workflow-templates/workflow-templates.module';
import { SkillListingsModule } from './modules/skill-listings/skill-listings.module';
import { AutoEarnTimelineModule } from './modules/auto-earn-timeline/auto-earn-timeline.module';
// v3.0 P3 壁垒强化 + 家庭账号 + 隐私围栏
import { FamilyAccountModule } from './modules/family-account/family-account.module';
import { PrivacyFenceModule } from './modules/privacy-fence/privacy-fence.module';
// Pet Generation: 3D mesh / avatar generation (Meshy + Hunyuan3D)
import { PetGenerationModule } from './modules/pet-generation/pet-generation.module';

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
    PetGenerationModule,
    GenerationProvidersModule,
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
    // Prediction Market (BTC 5min + Polymarket feed)
    PredictionMarketModule,
    // Workspace code intelligence: AST/LSP symbols + semantic vector index
    CodeIntelligenceModule,
    // Automatic run/diagnose/patch/retry repair loop
    AutoRepairModule,
    // Desktop release updater manifest endpoint
    DesktopUpdateModule,
    // Runtime release doctor: chat parity, provider migration, signing/updater readiness
    RuntimeDoctorModule,
    // P3: tool policy / PTC governance and operations control plane
    ToolControlPlaneModule,
    OperationsControlPlaneModule,
    // v3.0 Living Pet (顿领 §3.4)
    LivingPetModule,
    // Phase 1：灵魂模板 + 皮肤资产
    PetSoulTemplateModule,
    PetSkinModule,
    // Phase 2 W1 骨架：配额 / 审核 / Rive 资产清单
    PetGenQuotaModule,
    ModerationModule,
    PetRiveAssetModule,
    // Phase 2 W2: DMCA takedown
    DmcaModule,
    // Phase 3 W1: Marketplace MVP
    MarketplacePetModule,
    // Phase 4 W7: Pet Energy + Risk Control + Auto-Earn evaluator + Daily report
    PetEnergyModule,
    // V4 §5.2: Pro / Pro+ subscription SKUs + Stripe Checkout wiring
    BillingPlanModule,
    // Phase 4 W7: A2A pet-as-issuer dispatch
    PetA2AModule,
    // Phase 4 W8: WebAuthn / Passkey for L3 web co-sign
    PasskeyModule,
    // Phase 5 BE-10.2 / BE-10.3: ClawCore device registry + OTA
    DeviceRegistryModule,
    // Phase 5 WB-12.1: partner inquiry capture
    PartnerInquiryModule,
    // Phase 6 M2: 子宠 / 多宠队伍
    PetTeamModule,
    // Phase 6 M3: 宠物 NFT mint intent
    PetNftModule,
    // Phase 6 M5: 跨 App 合作伙伴 SDK
    PartnerAppModule,
    // Phase 6 M6: 主权宠物（MPC + 链上记忆）
    PetSovereignModule,
    // v3.0 Approval Routing (顿领 §5.2) — 4 级风险 + Trust 校验
    ApprovalModule,
    // v3.0 Handoff v1 (顿领 §5.1) — /api/v1/handoff/* 包装层
    HandoffV1Module,
    // v3.0 Wallet Projection (顿领 §5.3) — /api/v1/wallet/projection
    WalletProjectionModule,
    // v3.0 P1-9 Vitals Bus + Living Agent reactor (顿领 §3.4.2 §6.1)
    VitalsBusModule,
    // v3.0 P1-10 Memory 4-tier API (顿领 §5.5)
    MemoryTiersModule,
    // v3.0 P1-4 Plan-Approval 闭环 (顿领 §5.4)
    PlanRunnerModule,
    // v3.0 P1-8 SplitPlan + BudgetPool + Audit (顿领 §9.3 §9.5)
    SplitBudgetModule,
    // v3.0 P2-8 A2A 跨用户撮合 (顿领 §10)
    A2AMatchingModule,
    // v3.0 P2-8 联合工作流模板 (顿领 §10.3)
    WorkflowTemplatesModule,
    // v3.0 P2-6 Skill Marketplace + 开发者后台 (顿领 §11)
    SkillListingsModule,
    // v3.0 P2-2 Auto-Earn 仪表盘 + A2A 时间线 (顿领 §9.4)
    AutoEarnTimelineModule,
    // v3.0 P3-5 家庭账号 (顿领 §3.9 §12)
    FamilyAccountModule,
    // v3.0 P3-7 隐私围栏 + L3 多端协签 (顿领 §13)
    PrivacyFenceModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    // Global rate limiter: 100 req / 60s per IP (configurable via RATE_LIMIT_TTL / RATE_LIMIT_MAX)
    { provide: APP_GUARD, useClass: RateLimitGuard },
  ],
})
export class AppModule {}
