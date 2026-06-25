import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AgentOpsTaskEntity } from './entities/agent-ops-task.entity';
import { AgentOpsDeliverableEntity } from './entities/agent-ops-deliverable.entity';
import { AgentOpsActionLogEntity } from './entities/agent-ops-action-log.entity';
import { ApprovalGrantEntity } from './entities/approval-grant.entity';
import { MonitorSubscriptionEntity } from './entities/monitor-subscription.entity';
import { AgentOpsService } from './agent-ops.service';
import { ApprovalGrantService } from './approval-grant.service';
import { AgentOpsController } from './agent-ops.controller';
import { AgentOpsTeamController } from './agent-ops-team.controller';
import { AgentOpsDeliveryController } from './agent-ops-delivery.controller';
import { TeamSettlementReadModel } from './team-settlement-read-model.service';
import { TaskOrchestrator } from './task-orchestrator.service';
import { DesktopBrowserActionExecutor } from './desktop-browser-action-executor';
import { PlaceholderLlmDecisionProvider } from './placeholder-llm-decision-provider';
import {
  BROWSER_ACTION_EXECUTOR,
  LLM_DECISION_PROVIDER,
} from './task-orchestrator.types';
import { BrowserReadOnlyFetcher } from './browser-read-only-fetcher';
import { DataSourceRegistry } from './data-source-registry.service';
import {
  DATA_SOURCE_PLUGINS,
  READ_ONLY_FETCHER,
} from './data-source-plugin.types';
import { BlockExplorerPlugin } from './plugins/block-explorer.plugin';
import { DexPlugin } from './plugins/dex.plugin';
import { AuditSourcePlugin } from './plugins/audit-source.plugin';
import { DeliverableValidator } from './deliverable-validator.service';
import { DueDiligenceEngine } from './due-diligence-engine.service';
import { SplitTreeGeneratorService } from '../commission/split-tree-generator.service';
import { HireSettlementOrchestrator } from './hire-settlement-orchestrator.service';
import { ReliabilityMetricsService } from './reliability-metrics.service';
import { AgentModule } from '../agent/agent.module';
import { AgentAccountModule } from '../agent-account/agent-account.module';
import { MultiAgentModule } from '../multi-agent/multi-agent.module';
import { AgentTeamModule } from '../agent-team/agent-team.module';
import { MultiAgentSummaryModule } from '../multi-agent-summary/multi-agent-summary.module';
import { DesktopSyncModule } from '../desktop-sync/desktop-sync.module';
import { VoiceModule } from '../voice/voice.module';
// ── 任务 16:监控告警(@Cron + BullMQ 周期只读检查 + 多端推送 + 任务增删改) ──
import { MonitorService } from './monitor.service';
import { MonitorScheduler } from './monitor-scheduler.service';
import { MonitorAlertDispatcher } from './monitor-alert-dispatcher.service';
import { ReadOnlyMonitorChecker } from './read-only-monitor-checker';
import { MONITOR_CHECKERS } from './monitor.types';
// ── 任务 17:SecurityGuard(授权扫描+标注+引导撤销+交易模拟适配器+骗局检查;只读为主) ──
import { SecurityGuard } from './security-guard.service';
import { PlaceholderTransactionSimulator } from './placeholder-transaction-simulator';
import { PlaceholderScamIntelProvider } from './placeholder-scam-intel-provider';
import {
  SCAM_INTEL_PROVIDER,
  TRANSACTION_SIMULATOR,
} from './security-guard.types';
// ── 任务 18:交付包任务模板框架 + S0 建设期包 ──
import { DeliveryPackageRunnerService } from './delivery-package-runner.service';
import { DELIVERY_PACKAGES } from './delivery-package.types';
import { S0_BUILD_PACKAGE } from './packages/s0-build-package';
// ── 任务 19.1:S1 交付包 A · 社媒增长运营(需求 14.1–14.6)──
import { S1_SOCIAL_GROWTH_PACKAGE } from './packages/s1-social-growth-package';
// ── 任务 19.2:S1 交付包 B · 内容 / meme 生产(需求 14.7–14.10)──
import { S1_CONTENT_MEME_PACKAGE } from './packages/s1-content-meme-package';
// ── 任务 19.3:S1 交付包 C · KOL 发现 / 外联 / CRM(需求 14.11–14.15)──
import { S1_KOL_CRM_PACKAGE } from './packages/s1-kol-crm-package';
// ── 任务 19.4:S1 交付包 D · Quest / 活动(Galxe/Zealy)(需求 14.16–14.19)──
import { S1_QUEST_EVENT_PACKAGE } from './packages/s1-quest-event-package';
// ── 任务 19.5:S1 交付包 E · 社区审核 + 情绪日报(需求 14.20–14.22)──
import { S1_COMMUNITY_MODERATION_PACKAGE } from './packages/s1-community-moderation-package';
// ── 任务 19.5:S1 交付包 F · 白名单 / 候补名单收集(需求 14.23–14.25)──
import { S1_WHITELIST_LEADS_PACKAGE } from './packages/s1-whitelist-leads-package';
// ── 任务 20:贯穿层 · 监控 / sybil 只读检测 / FUD 情绪 / 报告 KPI 看板(需求 15)──
import { CROSS_CUTTING_MONITORING_PACKAGE } from './packages/cross-cutting-monitoring-package';
// ── 任务 23:S2/S3 辅助 · 上所 / 做市监控 / BD / 融资(IR) / 治理(需求 16;agent 辅助非交付)──
import { S2S3_ASSIST_PACKAGE } from './packages/s2s3-assist-package';
// ── 任务 22:空投发现与合法协助领取(需求 11;只读发现 + 窗口提醒 + 领取人确认 + 排除 sybil)──
import { AirdropAssistService } from './airdrop-assist.service';
// ── 任务 24:Agent 团队产品化(需求 17;provisionTeam 定制 + 三模式计费 + 协作编排 + 计量看板 + 多跳分佣 + 团队级预算)──
import { TeamProductizationService } from './team-productization.service';

/**
 * AgentOpsModule — crypto-native 滩头专项后端模块(阶段 0 骨架)。
 *
 * spec: .kiro/specs/crypto-native-agent-ops/{requirements,design}.md(任务 1)。
 * 承载任务编排、尽调、监控、安全、交付物、项目方交付包等能力的落点;
 * 本阶段注册实体仓库 + service/controller 占位,后续任务在此模块内扩展。
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      AgentOpsTaskEntity,
      AgentOpsDeliverableEntity,
      AgentOpsActionLogEntity,
      ApprovalGrantEntity,
      MonitorSubscriptionEntity,
    ]),
    forwardRef(() => AgentModule),
    forwardRef(() => AgentAccountModule),
    forwardRef(() => MultiAgentModule),
    // 任务 24:团队产品化复用 AgentTeamService(建团)+ SubscriptionUsageService(订阅计量)。
    forwardRef(() => AgentTeamModule),
    forwardRef(() => MultiAgentSummaryModule),
    DesktopSyncModule,
    // 任务 16:复用 voice output-dispatcher / session-fabric 做监控告警多端分发。
    VoiceModule,
  ],
  controllers: [
    AgentOpsController,
    // 任务 24:团队产品化 REST 面(组建/订阅/租赁/按结果结算/编排/计量看板/团队级预算)。
    AgentOpsTeamController,
    // 任务 13/17/18:尽调 / 安全防护(只读)/ 交付包运行器 REST 面。
    AgentOpsDeliveryController,
  ],
  providers: [
    AgentOpsService,
    ApprovalGrantService,
    TaskOrchestrator,
    // CDP 浏览器动作执行器:默认经 desktop-sync 通道下发(可在测试/其它端覆盖)。
    { provide: BROWSER_ACTION_EXECUTOR, useClass: DesktopBrowserActionExecutor },
    // LLM 决策提供方:任务 11 用占位实现,后续任务(12/13)注入具体垂直实现。
    { provide: LLM_DECISION_PROVIDER, useClass: PlaceholderLlmDecisionProvider },
    // ── 任务 12:尽调数据源插件框架 ──
    // 只读采集器:默认经只读浏览器操作(navigate + browser_eval)采集(可在测试覆盖)。
    { provide: READ_ONLY_FETCHER, useClass: BrowserReadOnlyFetcher },
    // 首批只读数据源插件:区块浏览器 + DEX + 1 官方/审计源。
    BlockExplorerPlugin,
    DexPlugin,
    AuditSourcePlugin,
    {
      provide: DATA_SOURCE_PLUGINS,
      useFactory: (
        explorer: BlockExplorerPlugin,
        dex: DexPlugin,
        audit: AuditSourcePlugin,
      ) => [explorer, dex, audit],
      inject: [BlockExplorerPlugin, DexPlugin, AuditSourcePlugin],
    },
    DataSourceRegistry,
    // ── 任务 13:尽调引擎 + 合格交付物验收 ──
    DeliverableValidator,
    DueDiligenceEngine,
    // ── 任务 14:被雇佣结算 + 多跳分佣闭环 ──
    // SplitTreeGeneratorService 仅依赖 ConfigService(全局),在此注册供编排器复用。
    SplitTreeGeneratorService,
    HireSettlementOrchestrator,
    // ── 任务 15:可靠性度量埋点(自主完成率/质量合格率/时延 + 冷启动漏斗) ──
    ReliabilityMetricsService,
    // ── 任务 16:监控告警(@Cron + BullMQ 周期只读检查 + 多端推送 + 增删改) ──
    MonitorService,
    MonitorAlertDispatcher,
    ReadOnlyMonitorChecker,
    {
      // 监控检查器集合(目前为兜底全类型只读检查器;后续可追加专精检查器)。
      provide: MONITOR_CHECKERS,
      useFactory: (readOnly: ReadOnlyMonitorChecker) => [readOnly],
      inject: [ReadOnlyMonitorChecker],
    },
    MonitorScheduler,
    // ── 任务 17:SecurityGuard(只读为主;撤销走人确认签名,不代执行资金) ──
    // 交易模拟适配器(待选 Tenderly/anvil fork)与骗局情报源默认占位实现(explicit degraded)。
    { provide: TRANSACTION_SIMULATOR, useClass: PlaceholderTransactionSimulator },
    { provide: SCAM_INTEL_PROVIDER, useClass: PlaceholderScamIntelProvider },
    SecurityGuard,
    // ── 任务 18:交付包任务模板框架 + S0 建设期包(需求 13)──
    // 交付包集合(S1/贯穿层在任务 19/20 追加进同一集合,Runner 据 slug 路由)。
    {
      provide: DELIVERY_PACKAGES,
      useValue: [
        S0_BUILD_PACKAGE,
        S1_SOCIAL_GROWTH_PACKAGE,
        S1_CONTENT_MEME_PACKAGE,
        S1_KOL_CRM_PACKAGE,
        S1_QUEST_EVENT_PACKAGE,
        S1_COMMUNITY_MODERATION_PACKAGE,
        S1_WHITELIST_LEADS_PACKAGE,
        CROSS_CUTTING_MONITORING_PACKAGE,
        S2S3_ASSIST_PACKAGE,
      ],
    },
    DeliveryPackageRunnerService,
    // ── 任务 22:空投发现与合法协助领取(需求 11)——
    // 复用 READ_ONLY_FETCHER(只读发现)+ MonitorService(窗口提醒)+ PolicyEvaluator(领取人确认)。
    AirdropAssistService,
    // ── 任务 24:Agent 团队产品化(需求 17)——
    // 复用 AgentTeamService(建团 + 回滚)/ SubscriptionUsageService(订阅计量)/
    // HireSettlementOrchestrator(按结果 escrow + 多跳分佣);纯决策函数承担预算/拆分/汇总/看板。
    TeamProductizationService,
    // 团队结算 / 分佣记录的轻量读模型(供 team controller 在结算成功后写入、看板/列表读取)。
    TeamSettlementReadModel,
  ],
  exports: [
    AgentOpsService,
    ApprovalGrantService,
    TaskOrchestrator,
    DataSourceRegistry,
    DATA_SOURCE_PLUGINS,
    READ_ONLY_FETCHER,
    DeliverableValidator,
    DueDiligenceEngine,
    HireSettlementOrchestrator,
    ReliabilityMetricsService,
    MonitorService,
    MonitorAlertDispatcher,
    SecurityGuard,
    DeliveryPackageRunnerService,
    AirdropAssistService,
    TeamProductizationService,
    TeamSettlementReadModel,
  ],
})
export class AgentOpsModule {}
