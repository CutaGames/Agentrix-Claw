import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';

// Cross-module reuse
import { AxpModule } from '../axp/axp.module';
import { BedrockIntegrationModule } from '../ai-integration/bedrock/bedrock-integration.module';
import { SignRequestModule } from '../sign-request/sign-request.module';

// Entities
import { AeonPlot } from './entities/aeon-plot.entity';
import { AeonRoom } from './entities/aeon-room.entity';
import { AeonOrg } from './entities/aeon-org.entity';
import { AeonOrgMember } from './entities/aeon-org-member.entity';
import { AeonTaskContract } from './entities/aeon-task-contract.entity';
import { AeonLedgerEntry } from './entities/aeon-ledger-entry.entity';
import { AeonBuildItem } from './entities/aeon-build-item.entity';
import { AeonPlotMessage } from './entities/aeon-plot-message.entity';
import { AeonPlotCheckin } from './entities/aeon-plot-checkin.entity';
import { AeonEvent } from './entities/aeon-event.entity';
import { AeonEventRsvp } from './entities/aeon-event-rsvp.entity';
import { WorldAsset } from '../world-engine/entities/world-asset.entity';
// 创作主播 agent:读 Creation(标题/简介/owner)+ AgentAccount(owner→userId)。
import { CreationEntity } from '../creation/entities/creation.entity';
import { AgentAccount } from '../../entities/agent-account.entity';
// 尊重 owner BYO 生成主播台词(跨 provider 统一补全)。
import { AiProviderModule } from '../ai-provider/ai-provider.module';

// Realtime (Phase 0 + Phase 2)
import { AeonRealtimeGateway } from './realtime/aeon-realtime.gateway';
import { RoomPresenceService } from './realtime/room-presence.service';
import { StageService } from './realtime/stage.service';
import { AgentDriverService } from './realtime/agent-driver.service';
import { AeonAgentWorkerService } from './realtime/aeon-agent-worker.service';
import { CreationHostAgentService } from './realtime/creation-host-agent.service';
import { AsyncInboxService } from './inbox/async-inbox.service';
import { AsyncInboxController } from './inbox/async-inbox.controller';

// World skeleton (Phase 1)
import { EpochService } from './epoch/epoch.service';
import { PlotService } from './plot/plot.service';
import { PlotMessageService } from './plot/plot-message.service';
import { GeoPresenceService } from './plot/geo-presence.service';
import { PlotController } from './plot/plot.controller';
import { RoomService } from './room/room.service';
import { RoomController } from './room/room.controller';

// Value loop (Phase 3)
import { ComplianceGateService } from './economy/compliance-gate.service';
import { AeonHighRiskGateService } from './economy/aeon-high-risk-gate.service';
import { AeonEconomyService } from './economy/aeon-economy.service';
import { OrgService } from './org/org.service';
import { ClockInService } from './org/clock-in.service';
import { OrgController } from './org/org.controller';
import { TaskContractService } from './task/task-contract.service';
import { TaskContractController } from './task/task-contract.controller';
import { AeonMarketplaceController } from './marketplace/aeon-marketplace.controller';

// Retention & co-creation (Phase 4)
import { BuildService } from './build/build.service';
import { BuildController } from './build/build.controller';
import { AgentFillService } from './fill/agent-fill.service';
import { WorldNewsService } from './news/world-news.service';
import { WorldNewsController } from './news/world-news.controller';
import { RealityLoopService } from './reality/reality-loop.service';
import { RealityLoopController } from './reality/reality-loop.controller';

// Social venues (Step 3) — 现场活动/演出排期
import { EventService } from './event/event.service';
import { EventController } from './event/event.controller';

/**
 * AeonModule — Aeon(永曜城)平行世界模块。
 *
 * Phase 0:实时同步层(/aeon 网关 + 房间在场态)。
 * Phase 1:世界骨架(Epoch + Plot + Room + 持久化)。
 * Phase 2:双控位执行编排(AgentDriver)+ 异步收件箱。
 * Phase 3:价值闭环(经济门面 + 合规闸门 + 虚拟公司/招聘发薪 + 任务/悬赏 + 世界市场)。
 * Phase 4:留存与共建(建造系统 + agent 填场 + 异步 digest + 世界新闻 + 现实闭环)。
 *
 * 持久化(R19):全部实体经 PostgreSQL + TypeORM,后端为权威态。
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      AeonPlot,
      AeonRoom,
      AeonOrg,
      AeonOrgMember,
      AeonTaskContract,
      AeonLedgerEntry,
      AeonBuildItem,
      AeonPlotMessage,
      AeonPlotCheckin,
      AeonEvent,
      AeonEventRsvp,
      WorldAsset,
      // 创作主播 agent 只读引用。
      CreationEntity,
      AgentAccount,
    ]),
    AxpModule,
    BedrockIntegrationModule,
    SignRequestModule,
    // 主播台词生成(尊重 owner BYO)。
    AiProviderModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => ({
        secret: configService.get<string>('JWT_SECRET'),
        signOptions: {
          expiresIn: configService.get<string>('JWT_EXPIRES_IN', '7d'),
        },
      }),
      inject: [ConfigService],
    }),
  ],
  controllers: [
    PlotController,
    RoomController,
    OrgController,
    TaskContractController,
    AeonMarketplaceController,
    BuildController,
    WorldNewsController,
    AsyncInboxController,
    RealityLoopController,
    EventController,
  ],
  providers: [
    // Phase 0
    AeonRealtimeGateway,
    RoomPresenceService,
    StageService,
    // 创作主播 agent(livestream/stage 真实主播)。
    CreationHostAgentService,
    // Phase 2
    AgentDriverService,
    AeonAgentWorkerService,
    AsyncInboxService,
    // Phase 1
    EpochService,
    PlotService,
    PlotMessageService,
    GeoPresenceService,
    RoomService,
    // Phase 3
    ComplianceGateService,
    AeonHighRiskGateService,
    AeonEconomyService,
    OrgService,
    ClockInService,
    TaskContractService,
    // Phase 4
    BuildService,
    AgentFillService,
    WorldNewsService,
    RealityLoopService,
    // Social venues (Step 3)
    EventService,
  ],
  exports: [
    RoomPresenceService,
    EpochService,
    PlotService,
    RoomService,
    AgentDriverService,
    AsyncInboxService,
    AeonEconomyService,
    ComplianceGateService,
    OrgService,
    TaskContractService,
    BuildService,
    AgentFillService,
    WorldNewsService,
    RealityLoopService,
  ],
})
export class AeonModule {}
