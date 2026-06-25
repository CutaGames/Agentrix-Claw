import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';

import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { TeamProductizationService } from './team-productization.service';
import { TeamSettlementReadModel } from './team-settlement-read-model.service';
import type { AgentRoleDefinition } from '../../entities/agent-team-template.entity';
import type {
  AgentServiceListing,
  MemberFaultCompensation,
  OverQuotaPolicy,
  SubTaskDeliverable,
  SubTaskSpec,
  TaskSplitPlan,
  TeamBillingMode,
  TeamBudgetEvaluation,
  TeamLeaseWindow,
  TeamMember,
  TeamReplacementAuditInput,
} from './team-productization.types';

// ─────────────────────────────── DTOs ───────────────────────────────

/** 定制团队组建入参(需求 17.1–17.5)。ownerId 由 JWT 注入。 */
export class ProvisionTeamRequestDto {
  templateId?: string;
  templateSlug?: string;
  teamNamePrefix?: string;
  roleOverrides?: Record<string, Partial<AgentRoleDefinition>>;
}

/** 团队按结果结算入参(需求 17.13–17.17)。hirerUserId 由 JWT 强制注入。 */
export class SettleTeamRequestDto {
  taskId: string;
  listing: AgentServiceListing;
  quantity?: number;
}

/** 创建租约窗口入参(需求 17.10)。 */
export class CreateLeaseDto {
  durationDays: number;
  /** 起始时间(ISO 8601,缺省取当前)。 */
  startsAt?: string;
}

/** 续租入参(需求 17.12)。 */
export class RenewLeaseDto {
  lease: TeamLeaseWindow;
  extraDays: number;
}

/** 到期回收入参(需求 17.11)。 */
export class ExpireLeaseDto {
  lease: TeamLeaseWindow;
  /** 判定时间(ISO 8601,缺省取当前)。 */
  now?: string;
}

/** 成员故障补偿入参(需求 17.12)。 */
export class CompensateLeaseDto {
  lease: TeamLeaseWindow;
  mode: MemberFaultCompensation;
  compensationDays?: number;
  pricePerDayUsd?: number;
}

/** 团队级预算评估入参(需求 17.27)。 */
export class EvaluateBudgetDto implements TeamBudgetEvaluation {
  teamBudgetCap: number;
  teamUsed: number;
  memberLimit: number;
  memberUsed: number;
  cost: number;
}

/** 任务拆分入参(需求 17.18)。 */
export class PlanTaskSplitDto {
  parentTaskId: string;
  subTasks: SubTaskSpec[];
  members: TeamMember[];
}

/** 团队级交付物汇总入参(需求 17.19/17.21/17.22)。 */
export class AggregateDeliverablesDto {
  parentTaskId: string;
  parts: SubTaskDeliverable[];
}

/** 成员替换入参(需求 17.20)。 */
export class ReplaceMemberDto {
  plan: TaskSplitPlan;
  replacement: TeamReplacementAuditInput;
}

/** 计量看板可选注入数据(进行中/已交付任务计数 + 额外租约)。 */
export class DashboardQueryDto {
  leases?: TeamLeaseWindow[];
  inProgress?: number;
  delivered?: number;
}

/**
 * AgentOpsTeamController — 可订阅 / 可租赁的定制 Agent 团队产品化 REST 入口
 * (crypto-native-agent-ops 任务 24 / 需求 17)。
 *
 * 暴露 {@link TeamProductizationService} 的可操作 / 可查询面给移动 / 桌面 UI:
 *   - A 组 组建:`POST teams/provision`。
 *   - B 组 订阅:`GET teams/subscription/quota`。
 *   - C 组 租赁:`POST teams/leases` / `teams/leases/renew` / `teams/leases/expire-if-due` /
 *     `teams/leases/compensate`(纯函数计算,租约对象随请求往返,不落库)。
 *   - D 组 按结果:`POST teams/settle`(经 HireSettlementOrchestrator escrow 轨道),
 *     结算成功后写入结算读模型供看板展示。
 *   - E 组 编排:`POST teams/tasks/split` / `teams/deliverables/aggregate` / `teams/members/replace`。
 *   - G 组 计量看板(UI 重点):`GET teams/dashboard`(实时拼装订阅配额 + 结算记录)。
 *   - H 组 分佣记录:`GET teams/settlements`(读模型)。
 *   - I 组 团队级预算:`POST teams/budget/evaluate`。
 *
 * 所有端点经 JWT 鉴权;归属以 `req.user.id` 为准(provision 的 ownerId、settle 的 hirerUserId
 * 一律强制取自 JWT,不信任客户端传值)。
 */
@ApiTags('Agent Ops · Team')
@Controller('agent-ops/teams')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class AgentOpsTeamController {
  constructor(
    private readonly teamService: TeamProductizationService,
    private readonly settlementReadModel: TeamSettlementReadModel,
  ) {}

  // ─────────────────── A 组:组建与定制 ───────────────────

  @Post('provision')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: '定制团队组建(白名单 + 1–20 规模校验 + 失败回滚,需求 17.1–17.5)' })
  @ApiResponse({ status: 201, description: '团队已组建(返回成员清单)' })
  async provisionTeam(@Request() req, @Body() dto: ProvisionTeamRequestDto) {
    const result = await this.teamService.provisionCustomTeam(req.user.id, dto);
    return { success: true, data: result };
  }

  // ─────────────────── B 组:订阅生命周期 ───────────────────

  @Get('subscription/quota')
  @ApiOperation({ summary: '订阅周期配额检查(配额内放行 / 超配额告警 + 处置,需求 17.6/17.7)' })
  @ApiResponse({ status: 200, description: '返回配额决策' })
  async checkQuota(
    @Request() req,
    @Query('overQuotaPolicy') overQuotaPolicy?: OverQuotaPolicy,
  ) {
    const decision = await this.teamService.checkSubscriptionQuota(
      req.user.id,
      overQuotaPolicy ?? 'pause',
    );
    return { success: true, data: decision };
  }

  // ─────────────────── C 组:租赁生命周期(纯函数计算) ───────────────────

  @Post('leases')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: '创建团队租约窗口(durationDays → 起止窗口,需求 17.10)' })
  @ApiResponse({ status: 201, description: '返回租约窗口' })
  createLease(@Body() dto: CreateLeaseDto) {
    const startsAt = dto.startsAt ? new Date(dto.startsAt) : new Date();
    const lease = this.teamService.createLeaseWindow(dto.durationDays, startsAt);
    return { success: true, data: lease };
  }

  @Post('leases/renew')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '续租(延长 endsAt,需求 17.12)' })
  @ApiResponse({ status: 200, description: '返回续租后的租约窗口' })
  renewLease(@Body() dto: RenewLeaseDto) {
    const lease = this.teamService.renewLease(
      normalizeLease(dto.lease),
      dto.extraDays,
    );
    return { success: true, data: lease };
  }

  @Post('leases/expire-if-due')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '租期到期回收(endsAt ≤ now → expired,幂等,需求 17.11)' })
  @ApiResponse({ status: 200, description: '返回回收判定后的租约窗口' })
  expireLease(@Body() dto: ExpireLeaseDto) {
    const now = dto.now ? new Date(dto.now) : new Date();
    const lease = this.teamService.expireLeaseIfDue(normalizeLease(dto.lease), now);
    return { success: true, data: lease };
  }

  @Post('leases/compensate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '成员故障补偿(延租 / 退款,需求 17.12)' })
  @ApiResponse({ status: 200, description: '返回补偿后的租约窗口 + 退款金额' })
  compensateLease(@Body() dto: CompensateLeaseDto) {
    const result = this.teamService.compensateMemberFault(
      normalizeLease(dto.lease),
      dto.mode,
      { compensationDays: dto.compensationDays, pricePerDayUsd: dto.pricePerDayUsd },
    );
    return { success: true, data: result };
  }

  // ─────────────────── D 组 + H 组:按结果结算 + 分佣记录 ───────────────────

  @Post('settle')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: '团队按结果结算(escrow 轨道 + 多跳分佣一次提交,需求 17.13–17.17/17.25)',
  })
  @ApiResponse({ status: 200, description: '返回结算结果(并登记到结算读模型)' })
  async settle(@Request() req, @Body() dto: SettleTeamRequestDto) {
    // hirerUserId 强制取自 JWT(不信任客户端传值)。
    const result = await this.teamService.settleTeamResult({
      taskId: dto.taskId,
      hirerUserId: req.user.id,
      listing: dto.listing,
      quantity: dto.quantity,
    });
    // 写入读模型供看板 / 列表展示(不改动结算 service 逻辑的薄读模型胶水)。
    const record = this.teamService.toSettlementRecord(result);
    this.settlementReadModel.record(req.user.id, record);
    return { success: true, data: result };
  }

  @Get('settlements')
  @ApiOperation({ summary: '列出我的团队结算 / 分佣记录(可按 agentId / mode 过滤,需求 17.24/17.25)' })
  @ApiResponse({ status: 200, description: '返回结算记录列表' })
  listSettlements(
    @Request() req,
    @Query('agentId') agentId?: string,
    @Query('mode') mode?: TeamBillingMode,
    @Query('limit') limit?: string,
  ) {
    const records = this.settlementReadModel.list(req.user.id, {
      agentId,
      mode,
      limit: limit != null ? Number(limit) : undefined,
    });
    return { success: true, data: records };
  }

  // ─────────────────── E 组:协作编排(纯函数) ───────────────────

  @Post('tasks/split')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '任务拆分计划(按角色/能力匹配 + worktree lane 隔离,需求 17.18)' })
  @ApiResponse({ status: 200, description: '返回拆分计划' })
  planTaskSplit(@Body() dto: PlanTaskSplitDto) {
    const plan = this.teamService.planTaskSplit(
      dto.parentTaskId,
      dto.subTasks ?? [],
      dto.members ?? [],
    );
    return { success: true, data: plan };
  }

  @Post('deliverables/aggregate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '团队级交付物汇总(全合格才合格,需求 17.19/17.21/17.22)' })
  @ApiResponse({ status: 200, description: '返回团队级交付物判定' })
  aggregateDeliverables(@Body() dto: AggregateDeliverablesDto) {
    const result = this.teamService.aggregateDeliverables(
      dto.parentTaskId,
      dto.parts ?? [],
    );
    return { success: true, data: result };
  }

  @Post('members/replace')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '成员中途替换(改派子任务 + 保持上下文连续性,需求 17.20)' })
  @ApiResponse({ status: 200, description: '返回替换后的计划 + 审计记录' })
  replaceMember(@Body() dto: ReplaceMemberDto) {
    const result = this.teamService.replaceMember(dto.plan, dto.replacement);
    return { success: true, data: result };
  }

  // ─────────────────── I 组:团队级预算 ───────────────────

  @Post('budget/evaluate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '团队级预算评估(团队上限优先于成员限额,触顶即停,需求 17.27)' })
  @ApiResponse({ status: 200, description: '返回预算决策' })
  evaluateBudget(@Body() dto: EvaluateBudgetDto) {
    const decision = this.teamService.evaluateTeamBudget(dto);
    return { success: true, data: decision };
  }

  // ─────────────────── G 组:计量看板(UI 重点) ───────────────────

  @Post('dashboard')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      '三模式透明计量看板(实时拼装订阅配额 + 结算记录,可注入租约/任务计数,需求 17.23/17.24)',
  })
  @ApiResponse({ status: 200, description: '返回计量看板' })
  async getDashboard(@Request() req, @Body() body?: DashboardQueryDto) {
    // 订阅配额实时读取(服务不可用时降级为 null,看板照常渲染)。
    const subscription = await this.teamService
      .checkSubscriptionQuota(req.user.id)
      .catch(() => null);
    const settlements = this.settlementReadModel.list(req.user.id);
    const leases = (body?.leases ?? []).map(normalizeLease);
    const dashboard = this.teamService.buildDashboard({
      subscription,
      leases,
      settlements,
      tasks: {
        inProgress: body?.inProgress ?? 0,
        delivered: body?.delivered ?? 0,
      },
    });
    return { success: true, data: dashboard };
  }
}

/** 把随 JSON 往返的租约窗口的日期字段从字符串还原为 Date(纯函数计算依赖 Date 运算)。 */
function normalizeLease(lease: TeamLeaseWindow): TeamLeaseWindow {
  return {
    ...lease,
    startsAt: new Date(lease.startsAt),
    endsAt: new Date(lease.endsAt),
  };
}
