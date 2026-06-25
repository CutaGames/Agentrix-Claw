import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { CreationEntity } from './entities/creation.entity';
import { CreationOfferingEntity } from './entities/creation-offering.entity';
import { CreationPreviewEntity } from './entities/creation-preview.entity';
import { CreationCapabilityManifestEntity } from './entities/creation-capability-manifest.entity';
import { CreationModerationDecisionEntity } from './entities/creation-moderation-decision.entity';
import { AgentInvocationEntity } from './entities/agent-invocation.entity';
import { AgentBudgetEntity } from './entities/agent-budget.entity';
import { CreationLegacyMapEntity } from './entities/creation-legacy-map.entity';
import { CreationCommentEntity } from './entities/creation-comment.entity';
import { CreationLikeEntity } from './entities/creation-like.entity';
import { CreationFollowEntity } from './entities/creation-follow.entity';
import { CreationGameBundleEntity } from './entities/creation-game-bundle.entity';
import { CreationUnlockEntity } from './entities/creation-unlock.entity';
import { CreationRepository } from './creation.repository';
import { CreationStateMachine } from './creation-state-machine';
import { CreationLegacyMapService } from './creation-legacy-map.service';
import { CreationService } from './creation.service';
import { OfferingDeriverService } from './offering-deriver.service';
import { CapabilityManifestDeriverService } from './capability-manifest-deriver.service';
import { CreationPublishService } from './creation-publish.service';
import { CreationModerationService } from './creation-moderation.service';
import { CreationDiscoveryService } from './discovery/creation-discovery.service';
import {
  CREATION_SEED_SOURCE,
  DefaultCreationSeedSource,
} from './discovery/feed-personalization';
import { CreationController } from './creation.controller';
import { CreationPublicController } from './creation-public.controller';
import { CreationPublishController } from './creation-publish.controller';
import { CreationModerationController } from './creation-moderation.controller';
import { CreationDiscoveryController } from './discovery/creation-discovery.controller';
import { AgentGatewayService } from './agent-gateway/agent-gateway.service';
import { AgentBudgetService } from './agent-gateway/agent-budget.service';
import { AgentGatewayController } from './agent-gateway/agent-gateway.controller';
import { CreationSocialService } from './social/creation-social.service';
import { CreationSocialController } from './social/creation-social.controller';
import { CreationFollowResolverService } from './social/creation-follow-resolver.service';
import { CreationExperienceService } from './experience/creation-experience.service';
import { CreationExperienceController } from './experience/creation-experience.controller';
import { CreationPresenceService } from './presence/creation-presence.service';
import { CreationBackfillService } from './migration/creation-backfill.service';
import { CreationDualWriteService } from './migration/creation-dualwrite.service';
import { CreationReadSwitchService } from './migration/creation-read-switch.service';
import { CreationRealityService } from './reality/creation-reality.service';
import { CreationRealityController } from './reality/creation-reality.controller';
import { CreationGameService } from './game/creation-game.service';
import { CloneMutateService } from './game/clone-mutate.service';
import { GamePlaytestService } from './game/game-playtest.service';
import { CreationGameController } from './game/creation-game.controller';
import { CreationDramaService } from './drama/creation-drama.service';
import { CreationDramaController } from './drama/creation-drama.controller';
import { CreationImageService } from './media/creation-image.service';
import { CreationMediaController } from './media/creation-media.controller';
import { CREATION_FOLLOW_RESOLVER } from './discovery/feed-personalization';
import { CreationAuthoringService } from './creation-authoring.service';
import {
  ScanQualityGateService,
  PlaceholderScanQualityCriterion,
  SCAN_QUALITY_CRITERION,
} from './scan-quality-gate.service';

// 复用内容维度的 ECS_World 快照(发布审核聚合可审核文本);只读引用。
import { EcsWorldVersion } from '../world-creation/entities/ecs-world-version.entity';
// 后备 WorldPlot —— 统一创作引擎(task 4.1)的 ECS 版本链锚点(惰性派生)+ 迁移回填源。
import { WorldPlot } from '../world-creation/entities/world-plot.entity';
// Aeon 地块 —— 深合并迁移 geo 维度回填源(task 12.2)。
import { AeonPlot } from '../aeon/entities/aeon-plot.entity';
// 复用 v5 AgentAccount 解析 owner → 通知用户(下架通知,task 2.4)。
import { AgentAccount } from '../../entities/agent-account.entity';
// 复用 v5 5 阶段审核引擎(ModerationService),不重建审核 —— AGENTS.md hard rule。
import { WorldEngineModule } from '../world-engine/world-engine.module';
// 复用 v6 创作引擎(AgentBuilderService / CreationContinuumService)—— 统一创作入口
// 的 prompt 生成 + 三档连续谱编辑 + 版本/回滚(task 4.1),不重建 —— AGENTS.md hard rule。
import { WorldCreationModule } from '../world-creation/world-creation.module';
// 复用平台通知设施(Creation 下架时通知 owner,需求 3.4)。
import { NotificationModule } from '../notification/notification.module';
// 复用 Bedrock LLM 生成 game 创作的可玩 HTML5 产物(方案 A,可选注入)。
import { BedrockIntegrationModule } from '../ai-integration/bedrock/bedrock-integration.module';
// 复用 BYO 解析:游戏生成按用户默认 provider 配置选模型 + 自带 Bedrock 凭据(需求:游戏质量随模型)。
import { AiProviderModule } from '../ai-provider/ai-provider.module';
// 解析用户订阅档位(游戏生成模型阶梯:free→haiku / pro+→sonnet 或 BYO)。
import { User } from '../../entities/user.entity';
// 打赏作者(创作经济闭环):复用 AXP spend/earn。
import { AxpModule } from '../axp/axp.module';

/**
 * CreationModule — 统一「创作(Creation)」注册表模块(world-creation-feed task 1.1)。
 *
 * spec: .kiro/specs/world-creation-feed/{requirements,design}.md
 *
 * 深合并 A(Aeon 真实地理)+ B(v6 ECS 内容)为单一 Creation 真相源,作为地图 /
 * 创作流 / Agent 检索三发现面的唯一数据来源(design §Architecture)。
 *
 * 当前阶段(task 1.1)为模块骨架:仅注册 Creation 主实体与仓储。后续任务在此模块
 * 内填充:
 *   - 状态机与转换守卫(task 1.2);
 *   - 派生表/实体 creation_offerings / creation_previews /
 *     creation_capability_manifests / agent_invocations(task 1.3);
 *   - legacy 映射表 creation_legacy_map(task 1.4);
 *   - Creation CRUD + 状态流转服务 CreationService(task 1.5,已落地);
 *   - discovery / agent-gateway 子模块(阶段 3 / 9)。
 *
 * 实体遵循全局 SnakeNamingStrategy(AGENTS.md 硬规则)。
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      CreationEntity,
      CreationOfferingEntity,
      CreationPreviewEntity,
      CreationCapabilityManifestEntity,
      CreationModerationDecisionEntity,
      AgentInvocationEntity,
      AgentBudgetEntity,
      CreationLegacyMapEntity,
      CreationCommentEntity,
      CreationLikeEntity,
      CreationFollowEntity,
      CreationGameBundleEntity,
      CreationUnlockEntity,
      // 只读引用 ECS_World 快照(发布审核聚合可审核文本,task 2.3)。
      EcsWorldVersion,
      // 后备 WorldPlot 仓储 —— 统一创作引擎惰性派生 ECS 版本链锚点(task 4.1)+ 迁移回填源(task 12.2)。
      WorldPlot,
      // Aeon 地块仓储 —— 深合并迁移 geo 维度回填源(task 12.2)。
      AeonPlot,
      // 复用 v5 AgentAccount 解析 owner → 通知用户(下架通知,task 2.4)
      // + 统一创作入口解析「认证用户 → owner 账户」(task 4.1)。
      AgentAccount,
      // 解析用户订阅档位(game 生成模型阶梯)。
      User,
    ]),
    // 复用 world-engine 审核引擎(导出 ModerationService),供发布管线审核门控。
    WorldEngineModule,
    // 复用 v6 创作引擎(AgentBuilderService / CreationContinuumService),供统一创作
    // 入口委托 prompt 生成 + 连续谱编辑 + 版本/回滚(task 4.1)。
    WorldCreationModule,
    // 复用平台通知设施(Creation 下架时通知 owner,task 2.4)。
    NotificationModule,
    // 复用 Bedrock LLM 生成 game 可玩 HTML5 产物(方案 A);BedrockIntegrationService 可选注入。
    BedrockIntegrationModule,
    // 复用 BYO provider 配置解析(游戏生成模型阶梯 + 自带 Bedrock 凭据);AiProviderService 可选注入。
    AiProviderModule,
    // 打赏作者:复用 AXP spend/earn(AxpService 可选注入)。
    AxpModule,
  ],
  providers: [
    CreationRepository,
    CreationStateMachine,
    CreationLegacyMapService,
    CreationService,
    OfferingDeriverService,
    CapabilityManifestDeriverService,
    CreationPublishService,
    CreationModerationService,
    CreationDiscoveryService,
    // 统一创作入口编排(task 4.1):写 Creation 实体 + 复用 v6 创作引擎。
    CreationAuthoringService,
    // 扫描创作输入接入 + 质量门槛(task 4.3):
    //   - 占位判据默认实现 PlaceholderScanQualityCriterion 绑定 SCAN_QUALITY_CRITERION;
    //   - 后续可改绑更严格判据,接入层 ScanQualityGateService 无需改动(需求 2.12/11.4)。
    PlaceholderScanQualityCriterion,
    { provide: SCAN_QUALITY_CRITERION, useExisting: PlaceholderScanQualityCriterion },
    ScanQualityGateService,
    // 冷启动种子内容源默认实现(需求 5.9,task 3.2);
    // 关注图谱解析器(CREATION_FOLLOW_RESOLVER)在 social 阶段 8 绑定,此处暂不注册。
    DefaultCreationSeedSource,
    { provide: CREATION_SEED_SOURCE, useExisting: DefaultCreationSeedSource },
    // Agent 调用网关(阶段 9):MCP 清单暴露 + 标准动词调用 + 预设额度核销 + 审计。
    AgentBudgetService,
    AgentGatewayService,
    // 社交(阶段 8):留言/点赞/关注/分享 + 关注图谱解析(绑定 feed following 接缝)。
    CreationSocialService,
    CreationFollowResolverService,
    { provide: CREATION_FOLLOW_RESOLVER, useExisting: CreationFollowResolverService },
    // 统一进入体验(阶段 5):解析 ECS_World/隔离级/只读资产。
    CreationExperienceService,
    // 实时同框接入(阶段 8.2):复用 aeon realtime,派生加入描述符。
    CreationPresenceService,
    // 深合并迁移回填 + 对账(阶段 12)。
    CreationBackfillService,
    // 深合并迁移:双写过渡(12.1)+ 读切换灰度/回滚(12.4)。
    CreationDualWriteService,
    CreationReadSwitchService,
    // 现实关联(阶段 10.2):绑定真实商家 POI + 到访签到。
    CreationRealityService,
    // 可玩游戏生成(方案 A):LLM 生成自包含 HTML5 + 模板兜底。
    CreationGameService,
    // 克隆-变异可靠引擎:在已验证游戏语料上参数变异(可靠 + 多样)。
    CloneMutateService,
    // 自由 codegen 长尾兜底:Node vm + DOM 桩真跑若干帧的 play-test(失败→自修复→退场)。
    GamePlaytestService,
    // 互动剧闭环(短剧 MVP):生成→播放→选择→AXP解锁→打赏。
    CreationDramaService,
    // AI 出图管线(封面 + 互动剧场景图):BYO Bedrock(Titan/Stability)。
    CreationImageService,
  ],
  controllers: [
    // 统一创作 REST 入口 `/v1/creations`(task 4.1)。
    CreationController,
    // 公开分享落地解析 `GET /v1/creations/by-share/:code`(无鉴权,web /c/:code 用)。
    CreationPublicController,
    // 发布管线 `POST /v1/creations/:id/publish`(task 2.3 接线)。
    CreationPublishController,
    // 举报 / 下架 / 主动下架 / 审计 `/v1/creations/:id/{report,takedown,unpublish,moderation}`(task 2.4 接线)。
    CreationModerationController,
    // 统一发现 `GET /v1/creations/discover`(map/feed/agentSearch,task 3.1 接线)。
    CreationDiscoveryController,
    // Agent 机器面 `/:id/{manifest,invoke}` + `agent/budget`(阶段 9)。
    AgentGatewayController,
    // 社交 `/:id/{comment,comments,like,follow,share}`(阶段 8)。
    CreationSocialController,
    // 统一进入体验 `POST /:id/enter`(阶段 5)。
    CreationExperienceController,
    // 现实关联 `POST /:id/{poi,checkin}`(阶段 10.2)。
    CreationRealityController,
    // 可玩游戏 `GET /:id/game` + `POST /:id/generate-game`(方案 A)。
    CreationGameController,
    // 互动剧 `GET /:id/drama(/state)` + `POST /:id/drama/unlock` + `POST /:id/generate-drama`。
    CreationDramaController,
    // AI 出图 `POST /:id/generate-cover` + `POST /:id/drama/illustrate`(owner)。
    CreationMediaController,
  ],
  exports: [
    CreationRepository,
    CreationStateMachine,
    CreationLegacyMapService,
    CreationService,
    OfferingDeriverService,
    CapabilityManifestDeriverService,
    CreationPublishService,
    CreationModerationService,
    CreationDiscoveryService,
    CreationAuthoringService,
    ScanQualityGateService,
    AgentGatewayService,
    AgentBudgetService,
    CreationSocialService,
    CreationExperienceService,
    CreationBackfillService,
    CreationDualWriteService,
    CreationReadSwitchService,
    TypeOrmModule,
  ],
})
export class CreationModule {}
