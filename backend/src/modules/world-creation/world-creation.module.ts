import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';

// Entities (Task 1.2)
import { WorldPlot } from './entities/world-plot.entity';
import { EcsWorldVersion } from './entities/ecs-world-version.entity';
import { EcsWorldDiff } from './entities/ecs-world-diff.entity';
import { CreationTask } from './entities/creation-task.entity';
import { PlotListing } from './entities/plot-listing.entity';
import { PlotModerationDecision } from './entities/plot-moderation-decision.entity';
import { PlotLeaderboard } from './entities/plot-leaderboard.entity';

// Reuse v5 world-engine infra: 配额 / 成本 / 审核 / Battle_Engine
// (复用而非重建 — design §13, AGENTS.md hard rule).
import { WorldEngineModule } from '../world-engine/world-engine.module';

// Reuse AXP wallet (server-authoritative Economy_Bridge 入账/扣款 — design §6).
import { AxpModule } from '../axp/axp.module';

// Reuse v5 economy primitives for the Economy_Bridge (Plot owner 收款主体 +
// 经济动作成本审计)。复用而非重建 — AGENTS.md hard rule.
import { AgentAccount } from '../../entities/agent-account.entity';
import { AgentCostRecord } from '../../entities/agent-cost-record.entity';

// Reuse v5 AgentAccount for Plot ownership (Land_Economy, R2.7).
import { AgentAccountModule } from '../agent-account/agent-account.module';

// Reuse platform NotificationService to notify Plot owner on takedown (R10.5).
import { NotificationModule } from '../notification/notification.module';
// Reuse desktop long-connection channel to dispatch Tier_C Creation_Tasks (R8.2).
import { DesktopSyncModule } from '../desktop-sync/desktop-sync.module';

// Reuse v5 asset repositories for Cross_Experience_Identity 解析 (R9.1/R9.3, task 11.1)：
// WorldAsset (主资产体系) + LivingPet (主宠/灵魂)。复用而非重建 — AGENTS.md hard rule.
import { WorldAsset } from '../world-engine/entities/world-asset.entity';
import { LivingPet } from '../../entities/living-pet.entity';

// Controllers
import { MapController } from './controllers/map.controller';
import { PlotController } from './controllers/plot.controller';
import { EcsWorldController } from './controllers/ecs-world.controller';
import { CreationTaskController } from './controllers/creation-task.controller';
import { EconomyBridgeController } from './controllers/economy-bridge.controller';
import { PlotMarketplaceController } from './controllers/plot-marketplace.controller';
import { ModerationController } from './controllers/moderation.controller';
import { ArenaController } from './controllers/arena.controller';

// Services
import { MapService } from './services/map.service';
import { LandEconomyService } from './services/land-economy.service';
import { EcsWorldService } from './services/ecs-world.service';
import { AgentBuilderService } from './services/agent-builder.service';
import { CreationContinuumService } from './services/creation-continuum.service';
import { SandboxService } from './services/sandbox.service';
import { EconomyBridgeService } from './services/economy-bridge.service';
import { CreationTaskService } from './services/creation-task.service';
// Creation_Task 派发通道 (Task 20.1, R8.2/R8.3)：可注入接口 + 默认占位实现，
// 真实投递委派 DesktopSyncService 长连接 / Agent 通道；占位实现便于状态机单测。
import {
  CREATION_TASK_DISPATCHER,
  PlaceholderCreationTaskDispatcher,
} from './services/creation-task.dispatcher';
import { DesktopSyncCreationTaskDispatcher } from './services/desktop-sync-creation-task.dispatcher';
import { IdentityResolverService } from './services/identity-resolver.service';
import { PlotMarketplaceService } from './services/plot-marketplace.service';
import { TrustGateService } from './economy/trust-gate.service';

// Prompt → ECS_World 草稿生成后端 (Task 14.1, R3.1)：可插拔 provider，默认占位实现，
// 后续可接入复用 v5 LLM 接入的真实模型。
import {
  ECS_GENERATOR_PROVIDER,
  PlaceholderEcsGeneratorProvider,
} from './generation/ecs-generator.provider';

// NL → ECS_World 编辑后端 (Task 14.2, R3.2)：可插拔 provider，默认占位实现
// (仅声明式修改、保留未受影响实体)，后续可接入复用 v5 LLM 接入的真实模型。
import {
  ECS_EDITOR_PROVIDER,
  PlaceholderEcsEditorProvider,
} from './generation/ecs-editor.provider';

// 生成计量与配额校验 (Task 15.1, R12.1/R12.4/R12.5)：复用 world-engine
// QuotaService (配额) + ProviderRegistry (Hunyuan3D/Meshy + failover) +
// agent_cost_records (成本记录)，不自建生成。
import { GenerationMeteringService } from './generation/generation-metering.service';

// Battle Arena 编排 (Task 12.2, R16.3/16.4/16.5/16.7)：确定性战斗演出 + 排行/XP/下注。
import { BattleArenaService } from './arena/battle-arena.service';
import {
  ARENA_LEADERBOARD_STORE,
  InMemoryArenaLeaderboardStore,
} from './arena/arena-leaderboard.store';
import { ArenaService } from './arena/arena.service';

// Plot 审核管线 (Task 16.1, R10)：发布前 + 发布后审核，复用 v5 ModerationService。
import { PlotModerationService } from './moderation/plot-moderation.service';

// Map_Presence 轻状态在场同步 (Task 10.1, R1.2)：可注入的 presence store
// (默认内存 TTL map，生产可替换为 ioredis 实现)。
import {
  MAP_PRESENCE_STORE,
  InMemoryMapPresenceStore,
} from './presence/map-presence.store';

// B 级能结账的超市示范 (Task 18.1, R15)：旗舰 server-authoritative 经济闭环。
// state.kv:sales 销售聚合 store（getSalesReport 读取 + 超市结账写入），默认内存实现。
import {
  PLOT_SALES_STORE,
  InMemoryPlotSalesStore,
} from './economy/plot-sales.store';
// state.kv:cart 访客购物车 store（结账聚合 line items），默认内存实现。
import {
  SUPERMARKET_CART_STORE,
  InMemorySupermarketCartStore,
} from './demos/supermarket-cart.store';
// 超市 server-authoritative 经济桥（override resolveProposedLineItems 聚合购物车）。
import { SupermarketEconomyBridgeService } from './demos/supermarket-economy-bridge.service';
// 超市结账经济闭环编排（加购 → 服务端权威扣款 → 销售聚合 / 失败不改余额）。
import { SupermarketService } from './demos/supermarket.service';
// C 级塔防示范 (Task 22.1, R17.1/R17.2/R17.3)：Tier_C 创作派发 (复用 CreationTaskService
// + resolveCreationRouting) + WASM 意图受控应用 (复用 SandboxService deny-by-default)。
import { TowerDefenseService } from './demos/tower-defense.service';

/**
 * WorldCreationModule — AI World Creation Platform (v6) 模块骨架 (Task 1.3)。
 *
 * 在 v5 reality-ai-world-engine 之上构建"共享世界地图 + Plot 内层 +
 * 分层基底 A/B/C + 沙箱 + 跨端创作任务队列"。
 *
 * 复用策略 (design §概述 / §13)：通过 import WorldEngineModule 复用其导出的
 * 配额 (QuotaService)、成本 (agent_cost_records 写入)、审核 (ModerationService)
 * 与确定性 Battle_Engine，**不重建** quota / cost / moderation 逻辑。
 *
 * 所有实体遵循全局 SnakeNamingStrategy；本模块当前为骨架，controller / service
 * 方法为桩 (抛 NotImplementedException)，逐任务填充实现。
 */
@Module({
  imports: [
    ConfigModule,
    // 复用 v5 配额 / 成本 / 审核 / Battle_Engine 基础设施。
    WorldEngineModule,
    // 复用 v5 AgentAccount（Plot 单一 owner，R2.7）。
    AgentAccountModule,
    // 复用平台通知设施 (Plot 下架时通知 owner，R10.5)。
    NotificationModule,
    // 复用 AXP 钱包 (Economy_Bridge server-authoritative 入账/扣款，design §6)。
    AxpModule,
    // 复用桌面长连接 (Creation_Task 派发到 desktop，R8.2，task 20.2)。
    DesktopSyncModule,
    TypeOrmModule.forFeature([
      WorldPlot,
      EcsWorldVersion,
      EcsWorldDiff,
      CreationTask,
      PlotListing,
      PlotModerationDecision,
      PlotLeaderboard,
      // 复用 v5 经济实体 (Economy_Bridge 收款主体解析 + 经济动作成本审计记录)。
      AgentAccount,
      AgentCostRecord,
      // 复用 v5 资产仓库 (Cross_Experience_Identity 资产解析，task 11.1，R9.1/R9.3)。
      WorldAsset,
      LivingPet,
    ]),
  ],
  controllers: [
    MapController,
    PlotController,
    EcsWorldController,
    CreationTaskController,
    EconomyBridgeController,
    PlotMarketplaceController,
    ModerationController,
    ArenaController,
  ],
  providers: [
    MapService,
    LandEconomyService,
    EcsWorldService,
    AgentBuilderService,
    // 创作连续谱编排 (Task 14.3, R3.4/R3.5/R3.7)：三模式无损切换统一入口 + revert +
    // Mobile Tier_C 派发路由 (复用 EcsWorldService / AgentBuilderService，不重建编辑逻辑)。
    CreationContinuumService,
    SandboxService,
    EconomyBridgeService,
    CreationTaskService,
    // Creation_Task 派发通道 (Task 20.1/20.2)：真实实现委派 DesktopSyncService 下发
    // `world-creation-task` 命令到绑定桌面端 (R8.2)。占位实现仍保留供单测/降级。
    PlaceholderCreationTaskDispatcher,
    DesktopSyncCreationTaskDispatcher,
    { provide: CREATION_TASK_DISPATCHER, useExisting: DesktopSyncCreationTaskDispatcher },
    IdentityResolverService,
    // server-authoritative Trust 门控 + 签名校验 (R7.4/R7.6, task 7.2)。
    TrustGateService,
    // Prompt → ECS_World 草稿生成后端 (Task 14.1)：默认占位实现，绑定到注入令牌。
    PlaceholderEcsGeneratorProvider,
    { provide: ECS_GENERATOR_PROVIDER, useExisting: PlaceholderEcsGeneratorProvider },
    // NL → ECS_World 编辑后端 (Task 14.2)：默认占位实现，绑定到注入令牌。
    PlaceholderEcsEditorProvider,
    { provide: ECS_EDITOR_PROVIDER, useExisting: PlaceholderEcsEditorProvider },
    // 生成计量与配额校验 (Task 15.1)：复用 QuotaService + ProviderRegistry +
    // agent_cost_records，可被 15.3 单测验证 (配额校验、成本记录)。
    GenerationMeteringService,
    // Battle Arena 发布与分享 (Task 12.4, R16.6/R11.5)。
    ArenaService,
    // Plot 审核管线 (Task 16.1, R10)：发布前 + 发布后审核，复用 v5 ModerationService。
    PlotModerationService,
    // Plot Marketplace 发布 / 上架 / 购买 / 分享 (Task 16.2, R11)：复用 LandEconomyService
    // (上架/转让/抽成) + ArenaService (审核门控发布 + share_code)，不重建经济/审核。
    PlotMarketplaceService,
    // Presence store: 默认内存 TTL map 实现，绑定到注入令牌 (Task 10.1)。
    InMemoryMapPresenceStore,
    { provide: MAP_PRESENCE_STORE, useExisting: InMemoryMapPresenceStore },
    // Battle Arena 编排 (Task 12.2)：复用 v5 Battle_Engine / Agent 绑定 XP / Economy_Bridge。
    BattleArenaService,
    // state.kv:ranks 排行榜 store: 默认内存实现，绑定到注入令牌 (Task 12.2, R16.4)。
    InMemoryArenaLeaderboardStore,
    { provide: ARENA_LEADERBOARD_STORE, useExisting: InMemoryArenaLeaderboardStore },
    // B 级超市示范 (Task 18.1, R15)：旗舰 server-authoritative 经济闭环。
    // state.kv:sales 销售聚合 store: 默认内存实现，绑定到注入令牌 (R15.5)。
    // 由 EconomyBridgeService.getSalesReport 读取、SupermarketService 结账写入，形成闭环。
    InMemoryPlotSalesStore,
    { provide: PLOT_SALES_STORE, useExisting: InMemoryPlotSalesStore },
    // state.kv:cart 访客购物车 store: 默认内存实现，绑定到注入令牌 (R15.3)。
    InMemorySupermarketCartStore,
    { provide: SUPERMARKET_CART_STORE, useExisting: InMemorySupermarketCartStore },
    // 超市经济桥（override resolveProposedLineItems 聚合购物车，复用基类权威逻辑）。
    SupermarketEconomyBridgeService,
    // 超市结账经济闭环编排（加购 → 服务端权威扣款 → 销售聚合 / 失败不改余额，R15）。
    SupermarketService,
    // C 级塔防示范 (Task 22.1, R17.1/R17.2/R17.3)：Tier_C 创作派发 + WASM 意图受控应用。
    TowerDefenseService,
  ],
  exports: [
    MapService,
    LandEconomyService,
    EcsWorldService,
    AgentBuilderService,
    CreationContinuumService,
    SandboxService,
    EconomyBridgeService,
    CreationTaskService,
    IdentityResolverService,
    TrustGateService,
    GenerationMeteringService,
    ArenaService,
    BattleArenaService,
    PlotModerationService,
    PlotMarketplaceService,
    // 超市结账经济闭环 (Task 18.1, R15)：供 18.2 集成测试与控制器消费。
    SupermarketEconomyBridgeService,
    SupermarketService,
    // C 级塔防示范 (Task 22.1, R17)：供 22.3 集成测试与控制器消费。
    TowerDefenseService,
  ],
})
export class WorldCreationModule {}
