import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';

// Entities
import { WorldAsset } from './entities/world-asset.entity';
import { Battle } from './entities/battle.entity';
import { Dungeon } from './entities/dungeon.entity';
import { ScanSession } from './entities/scan-session.entity';
import { WorldAssetModerationDecision } from './entities/world-asset-moderation-decision.entity';
import { WorldEvent } from './entities/world-event.entity';
import { WorldGameRuleSet } from './entities/world-game-ruleset.entity';
import { AdminConfig } from '../../entities/admin-config.entity';
import { AgentCostRecord } from '../../entities/agent-cost-record.entity';
import { AgentAccount } from '../../entities/agent-account.entity';
import { AgentReputation } from '../../entities/agent-reputation.entity';
import { AgentStats } from '../../entities/agent-stats.entity';
import { LivingPet } from '../../entities/living-pet.entity';

// Bedrock for AI Interpreter (Claude Haiku 4.5 / Sonnet 4.6)
import { BedrockIntegrationModule } from '../ai-integration/bedrock/bedrock-integration.module';

// AI Provider (per-user BYO keys for 3D reconstruction — meshy / tencent-3d)
import { AiProviderModule } from '../ai-provider/ai-provider.module';

// Feature flag
import { WorldEngineFeatureFlagService } from './feature-flag.service';
import { WorldEngineFlagGuard } from './guards/world-engine-flag.guard';

// Controllers
import { ScanController } from './controllers/scan.controller';
import { JobController } from './controllers/job.controller';
import { AssetController } from './controllers/asset.controller';
import { BattleController } from './controllers/battle.controller';
import { DungeonController } from './controllers/dungeon.controller';
import { ShareController } from './controllers/share.controller';
import { MarketplaceController } from './controllers/marketplace.controller';
import { QuotaController } from './controllers/quota.controller';
import { AgentExtensionController } from './controllers/agent-extension.controller';
import { WorldFeedController } from './controllers/world-feed.controller';
import { SoulUgcController } from './controllers/soul-ugc.controller';

// Reconstruction (Provider Registry + Service + Processor)
import { ProviderRegistry } from './reconstruction/provider-registry';
import { ReconstructionService } from './reconstruction/reconstruction.service';
import { ReconstructionProcessor } from './reconstruction/reconstruction.processor';

// Gateways
import { JobProgressGateway } from './gateways/job-progress.gateway';

// Existing providers (reused from pet-generation, not duplicated)
import { Hunyuan3DProvider } from '../pet-generation/hunyuan3d.provider';
import { MeshyProvider } from '../pet-generation/meshy.provider';

// Other services
import { AIInterpreterService } from './services/ai-interpreter.service';
import { StyleRendererService } from './services/style-renderer.service';
import { CharacterGeneratorService } from './services/character-generator.service';
import { BattleEngineService } from './services/battle-engine.service';
import { InteractiveBattleEngineService } from './services/interactive-battle-engine.service';
import { GameEngineService } from './services/game-engine.service';
import { AssetCreationService } from './services/asset-creation.service';
import { AbilityMappingService } from './services/ability-mapping.service';
import { WorldSimService } from './services/world-sim.service';
import { SoulLinkageService } from './services/soul-linkage.service';
import { UgcGameService } from './services/ugc-game.service';
import { AgentBindingService } from './services/agent-binding.service';
import { AgentQuotaService } from './services/agent-quota.service';
import { ShareService } from './services/share.service';
import { MarketplaceService } from './services/marketplace.service';
import { DungeonBuilderService } from './services/dungeon-builder.service';
import { ModerationService } from './services/moderation.service';
import { QuotaService } from './services/quota.service';
import { RateLimiterService } from './services/rate-limiter.service';
import { CostDashboardService } from './services/cost-dashboard.service';
import { TelemetryService } from './services/telemetry.service';
import { GoLiveDashboardService } from './services/go-live-dashboard.service';

// Admin controller
import { AdminCostDashboardController } from './controllers/quota.controller';
import { AdminModerationController } from './controllers/admin-moderation.controller';

@Module({
  imports: [
    ConfigModule,
    BedrockIntegrationModule,
    AiProviderModule,
    TypeOrmModule.forFeature([
      WorldAsset,
      Battle,
      Dungeon,
      ScanSession,
      WorldAssetModerationDecision,
      WorldEvent,
      WorldGameRuleSet,
      AdminConfig,
      AgentCostRecord,
      AgentAccount,
      AgentReputation,
      AgentStats,
      LivingPet,
    ]),
  ],
  controllers: [
    ScanController,
    JobController,
    AssetController,
    BattleController,
    DungeonController,
    ShareController,
    MarketplaceController,
    QuotaController,
    AgentExtensionController,
    WorldFeedController,
    SoulUgcController,
    AdminCostDashboardController,
    AdminModerationController,
  ],
  providers: [
    // Feature flag
    WorldEngineFeatureFlagService,
    WorldEngineFlagGuard,
    // Existing providers (imported from pet-generation, not duplicated)
    Hunyuan3DProvider,
    MeshyProvider,
    // Reconstruction pipeline
    ProviderRegistry,
    ReconstructionService,
    ReconstructionProcessor,
    // Gateways
    JobProgressGateway,
    // Other services
    AIInterpreterService,
    StyleRendererService,
    CharacterGeneratorService,
    BattleEngineService,
    InteractiveBattleEngineService,
    GameEngineService,
    AssetCreationService,
    AbilityMappingService,
    WorldSimService,
    SoulLinkageService,
    UgcGameService,
    AgentBindingService,
    AgentQuotaService,
    ShareService,
    MarketplaceService,
    DungeonBuilderService,
    ModerationService,
    QuotaService,
    RateLimiterService,
    CostDashboardService,
    TelemetryService,
    GoLiveDashboardService,
  ],
  exports: [
    WorldEngineFeatureFlagService,
    ProviderRegistry,
    ReconstructionService,
    AIInterpreterService,
    StyleRendererService,
    CharacterGeneratorService,
    BattleEngineService,
    InteractiveBattleEngineService,
    GameEngineService,
    AssetCreationService,
    AbilityMappingService,
    WorldSimService,
    SoulLinkageService,
    UgcGameService,
    AgentBindingService,
    AgentQuotaService,
    ShareService,
    MarketplaceService,
    DungeonBuilderService,
    ModerationService,
    QuotaService,
    RateLimiterService,
    CostDashboardService,
    TelemetryService,
    GoLiveDashboardService,
  ],
})
export class WorldEngineModule {}
