import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';
import { Skill } from '../../entities/skill.entity';
import { Product } from '../../entities/product.entity';
// V2.0: 新增 Entity
import { ExternalSkillMapping } from '../../entities/external-skill-mapping.entity';
import { ProductSkillConversion } from '../../entities/product-skill-conversion.entity';
import { SkillAnalytics } from '../../entities/skill-analytics.entity';
import { ClawInstalledSkill } from '../../entities/claw-installed-skill.entity';
import { UserInstalledSkill } from '../../entities/user-installed-skill.entity';
import { SkillReview } from '../../entities/skill-review.entity';
import { SkillService } from './skill.service';
import { SkillReviewService } from './skill-review.service';
import { SkillController } from './skill.controller';
import { SkillAdminController } from './skill-admin.controller';
import { SkillConverterService } from './skill-converter.service';
import { SkillExecutorService } from './skill-executor.service';
import { DynamicToolAdapter } from './dynamic-tool-adapter.service';
import { SkillSdkService } from './skill-sdk.service';
// V2.0: 新增 Service
import { ProductSkillConverterService } from './product-skill-converter.service';
import { SkillApprovalService } from './skill-approval.service';
// Phase 3: 生态聚合
import { MCPServerProxyService } from './mcp-server-proxy.service';
import { OpenAPIImporterService } from './openapi-importer.service';
import { EcosystemImporterService } from './ecosystem-importer.service';
// Phase 4: 智能化
import { SkillRecommendationService } from './skill-recommendation.service';
import { AgentNegotiationService } from './agent-negotiation.service';
import { WorkflowComposerService } from './workflow-composer.service';
// P1: 开发者收益
import { DeveloperRevenueService } from './developer-revenue.service';
import { DeveloperRevenueController } from './developer-revenue.controller';
// V2.1: 用户画像入驻
import { OnboardingService } from './onboarding.service';
import { OnboardingController } from './onboarding.controller';
import { ProductModule } from '../product/product.module';
import { PaymentModule } from '../payment/payment.module';
import { WalletModule } from '../wallet/wallet.module';
import { AutoEarnModule } from '../auto-earn/auto-earn.module';
import { AgentAuthorizationModule } from '../agent-authorization/agent-authorization.module';
import { MarketplaceModule } from '../marketplace/marketplace.module';
import { UnifiedMarketplaceModule } from '../unified-marketplace/unified-marketplace.module';
import { DeveloperAccountModule } from '../developer-account/developer-account.module';
import { A2AModule } from '../a2a/a2a.module';
import { MerchantTaskModule } from '../merchant-task/merchant-task.module';
import { ClaudeIntegrationModule } from '../ai-integration/claude/claude-integration.module';
import { OpenClawBridgeModule } from '../openclaw-bridge/openclaw-bridge.module';
import { VideoGenerationModule } from '../video-generation/video-generation.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Skill, 
      Product,
      // V2.0: 新增 Entity
      ExternalSkillMapping,
      ProductSkillConversion,
      SkillAnalytics,
      ClawInstalledSkill,
      UserInstalledSkill,
      SkillReview,
    ]),
    forwardRef(() => ProductModule),
    forwardRef(() => PaymentModule),
    forwardRef(() => MarketplaceModule),
    forwardRef(() => UnifiedMarketplaceModule),
    forwardRef(() => WalletModule),
    forwardRef(() => AutoEarnModule),
    forwardRef(() => AgentAuthorizationModule),
    forwardRef(() => DeveloperAccountModule),
    forwardRef(() => A2AModule),
    forwardRef(() => MerchantTaskModule),
    forwardRef(() => ClaudeIntegrationModule),
    forwardRef(() => OpenClawBridgeModule),
    VideoGenerationModule,
  ],
  controllers: [SkillController, SkillAdminController, DeveloperRevenueController, OnboardingController],
  providers: [
    SkillService,
    SkillReviewService,
    SkillConverterService,
    SkillExecutorService,
    DynamicToolAdapter,
    SkillSdkService,
    // V2.0: 新增 Service
    ProductSkillConverterService,
    SkillApprovalService,
    // V2.1: 用户画像入驻
    OnboardingService,
    // Phase 3: 生态聚合
    MCPServerProxyService,
    OpenAPIImporterService,
    EcosystemImporterService,
    // Phase 4: 智能化
    SkillRecommendationService,
    AgentNegotiationService,
    WorkflowComposerService,
    // P1: 开发者收益
    DeveloperRevenueService,
  ],
  exports: [
    SkillService,
    SkillReviewService,
    SkillConverterService,
    SkillExecutorService, 
    DynamicToolAdapter, 
    SkillSdkService,
    // V2.0: 导出新 Service
    ProductSkillConverterService,
    SkillApprovalService,
    // V2.1: 用户画像入驻
    OnboardingService,
    // Phase 3
    MCPServerProxyService,
    OpenAPIImporterService,
    EcosystemImporterService,
    // Phase 4
    SkillRecommendationService,
    AgentNegotiationService,
    WorkflowComposerService,
    // P1: 开发者收益
    DeveloperRevenueService,
  ],
})

export class SkillModule {}
