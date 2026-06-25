import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AgentOpsService, CreateAgentOpsTaskDto } from './agent-ops.service';
import { ReliabilityMetricsService } from './reliability-metrics.service';
import {
  MonitorService,
  CreateMonitorDto,
  UpdateMonitorDto,
} from './monitor.service';
import { AirdropAssistService } from './airdrop-assist.service';
import type {
  AirdropClaimAssistRequest,
  AirdropDiscoveryRequest,
} from './airdrop-assist.types';
import type { AgentOpsTaskType } from './entities/agent-ops-task.entity';

/** 人工抽检入参(需求 18.2 质量合格率)。 */
export class SpotCheckDto {
  /** 人工判定是否合格。 */
  qualified: boolean;
  /** 备注(可选)。 */
  notes?: string;
}

/** 空投资格发现入参(需求 11.1)。userId 由 JWT 注入,body 仅声明其余字段。 */
export class DiscoverAirdropsDto {
  agentId: string;
  wallet: string;
  wallets?: string[];
  chain: string;
  checkerUrl?: string;
  extract?: string;
  intent?: string;
  deviceId?: string;
  sessionId?: string;
}

/** 空投协助领取入参(需求 11.2)。userId 由 JWT 注入。 */
export class AssistClaimDto {
  agentId: string;
  wallet: string;
  wallets?: string[];
  projectName: string;
  chain: string;
  claimUrl?: string;
  contract?: string;
  method?: string;
  args?: Record<string, any>;
  intent?: string;
}

/** 领取窗口提醒登记入参(需求 11.1)。 */
export class ClaimWindowReminderDto {
  agentId: string;
  wallet: string;
  wallets?: string[];
  projectName: string;
  claimUrl?: string;
  claimWindowStart?: string;
  claimWindowEnd?: string;
  intervalSeconds?: number;
}

/**
 * AgentOpsController — crypto-native agent-ops 模块入口(阶段 0 骨架)。
 *
 * spec: .kiro/specs/crypto-native-agent-ops/{requirements,design}.md(任务 1)。
 * 仅提供任务创建/读取/列出与交付物、监控列表的占位端点;具体业务端点在后续任务补充。
 */
@ApiTags('Agent Ops')
@Controller('agent-ops')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class AgentOpsController {
  constructor(
    private readonly agentOpsService: AgentOpsService,
    private readonly reliabilityMetrics: ReliabilityMetricsService,
    private readonly monitorService: MonitorService,
    private readonly airdropAssist: AirdropAssistService,
  ) {}

  @Post('tasks')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: '创建一个 agent-ops 任务' })
  @ApiResponse({ status: 201, description: '任务创建成功' })
  async createTask(@Request() req, @Body() dto: CreateAgentOpsTaskDto) {
    const task = await this.agentOpsService.createTask(req.user.id, dto);
    return { success: true, data: task };
  }

  @Get('tasks')
  @ApiOperation({ summary: '列出我的 agent-ops 任务' })
  @ApiResponse({ status: 200, description: '返回任务列表' })
  async listTasks(@Request() req) {
    const tasks = await this.agentOpsService.listTasks(req.user.id);
    return { success: true, data: tasks };
  }

  @Get('tasks/:id')
  @ApiOperation({ summary: '获取任务详情' })
  @ApiResponse({ status: 200, description: '返回任务详情' })
  async getTask(@Request() req, @Param('id') id: string) {
    const task = await this.agentOpsService.getTask(req.user.id, id);
    return { success: true, data: task };
  }

  @Get('tasks/:id/deliverables')
  @ApiOperation({ summary: '列出任务的交付物' })
  @ApiResponse({ status: 200, description: '返回交付物列表' })
  async listDeliverables(@Request() req, @Param('id') id: string) {
    // 校验任务归属
    await this.agentOpsService.getTask(req.user.id, id);
    const deliverables = await this.agentOpsService.listDeliverables(id);
    return { success: true, data: deliverables };
  }

  // ─────────────────── 监控订阅 CRUD(任务 16 / 需求 9.4) ───────────────────

  @Post('monitors')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: '创建监控订阅(周期只读检查 + 命中多端告警)' })
  @ApiResponse({ status: 201, description: '监控订阅创建成功' })
  async createMonitor(@Request() req, @Body() dto: CreateMonitorDto) {
    const monitor = await this.monitorService.createMonitor(req.user.id, dto);
    return { success: true, data: monitor };
  }

  @Get('monitors')
  @ApiOperation({ summary: '列出我的监控订阅(含 lastCheckedAt / lastResult)' })
  @ApiResponse({ status: 200, description: '返回监控订阅列表' })
  async listMonitors(@Request() req) {
    const monitors = await this.monitorService.listMonitors(req.user.id);
    return { success: true, data: monitors };
  }

  @Get('monitors/:id')
  @ApiOperation({ summary: '获取监控订阅详情' })
  @ApiResponse({ status: 200, description: '返回监控订阅详情' })
  async getMonitor(@Request() req, @Param('id') id: string) {
    const monitor = await this.monitorService.getMonitor(req.user.id, id);
    return { success: true, data: monitor };
  }

  @Patch('monitors/:id')
  @ApiOperation({ summary: '修改监控订阅(类型 / 条件 / 周期,需求 9.4)' })
  @ApiResponse({ status: 200, description: '修改成功' })
  async updateMonitor(
    @Request() req,
    @Param('id') id: string,
    @Body() dto: UpdateMonitorDto,
  ) {
    const monitor = await this.monitorService.updateMonitor(req.user.id, id, dto);
    return { success: true, data: monitor };
  }

  @Post('monitors/:id/pause')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '暂停监控订阅(需求 9.4)' })
  @ApiResponse({ status: 200, description: '已暂停' })
  async pauseMonitor(@Request() req, @Param('id') id: string) {
    const monitor = await this.monitorService.pauseMonitor(req.user.id, id);
    return { success: true, data: monitor };
  }

  @Post('monitors/:id/resume')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '恢复监控订阅' })
  @ApiResponse({ status: 200, description: '已恢复' })
  async resumeMonitor(@Request() req, @Param('id') id: string) {
    const monitor = await this.monitorService.resumeMonitor(req.user.id, id);
    return { success: true, data: monitor };
  }

  @Delete('monitors/:id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '删除监控订阅(需求 9.4)' })
  @ApiResponse({ status: 200, description: '已删除' })
  async deleteMonitor(@Request() req, @Param('id') id: string) {
    await this.monitorService.deleteMonitor(req.user.id, id);
    return { success: true };
  }

  // ─────────────────── 可靠性度量(任务 15 / 需求 18) ───────────────────

  @Post('deliverables/:id/spot-check')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '人工抽检交付物(质量合格率埋点,需求 18.2)' })
  @ApiResponse({ status: 200, description: '抽检结果已记录' })
  async spotCheckDeliverable(
    @Request() req,
    @Param('id') id: string,
    @Body() dto: SpotCheckDto,
  ) {
    // 归属校验:经交付物所属任务的 ownerId(getTask 限定归属用户)。
    const deliverable = await this.agentOpsService.getDeliverable(id);
    await this.agentOpsService.getTask(req.user.id, deliverable.taskId);
    const updated = await this.reliabilityMetrics.recordHumanSpotCheck({
      deliverableId: id,
      reviewerId: req.user.id,
      qualified: dto.qualified,
      notes: dto.notes,
    });
    return { success: true, data: updated };
  }

  @Post('deliverables/:id/share')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '标记交付物已分享(冷启动漏斗信号,需求 18.4)' })
  @ApiResponse({ status: 200, description: '分享信号已记录' })
  async shareDeliverable(@Request() req, @Param('id') id: string) {
    const deliverable = await this.agentOpsService.getDeliverable(id);
    await this.agentOpsService.getTask(req.user.id, deliverable.taskId);
    const updated = await this.reliabilityMetrics.markDeliverableShared(id);
    return { success: true, data: updated };
  }

  @Get('metrics/reliability')
  @ApiOperation({ summary: '可靠性度量快照(自主完成率/质量合格率/时延/冷启动漏斗)' })
  @ApiResponse({ status: 200, description: '返回度量快照' })
  async getReliabilityMetrics(
    @Request() req,
    @Query('since') since?: string,
    @Query('until') until?: string,
    @Query('agentId') agentId?: string,
    @Query('taskType') taskType?: AgentOpsTaskType,
  ) {
    const snapshot = await this.reliabilityMetrics.getReliabilitySnapshot({
      since: since ? new Date(since) : undefined,
      until: until ? new Date(until) : undefined,
      agentId,
      taskType,
    });
    return { success: true, data: snapshot };
  }

  // ─────────────────── 空投发现与合法协助领取(任务 22 / 需求 11) ───────────────────

  @Post('airdrops/discover')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: '基于钱包只读发现潜在空投资格 + 领取窗口/截止提醒(需求 11.1;排除 sybil)',
  })
  @ApiResponse({ status: 200, description: '返回资格候选与窗口提醒' })
  async discoverAirdrops(@Request() req, @Body() dto: DiscoverAirdropsDto) {
    const reqBody: AirdropDiscoveryRequest = { ...dto, userId: req.user.id };
    const result = await this.airdropAssist.discoverAirdrops(reqBody);
    return { success: true, data: result };
  }

  @Post('airdrops/claim-assist')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      '为合法资格空投准备未签名领取计划(需求 11.2/11.3;领取交易需用户签名确认,排除 sybil)',
  })
  @ApiResponse({ status: 200, description: '返回未签名领取计划(人确认签名)' })
  async assistClaim(@Request() req, @Body() dto: AssistClaimDto) {
    const reqBody: AirdropClaimAssistRequest = { ...dto, userId: req.user.id };
    const plan = this.airdropAssist.assistClaim(reqBody);
    return { success: true, data: plan };
  }

  @Post('airdrops/claim-window-reminder')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: '登记空投领取窗口/截止提醒(需求 11.1;复用监控调度,排除 sybil)',
  })
  @ApiResponse({ status: 201, description: '提醒订阅已创建' })
  async scheduleClaimWindowReminder(
    @Request() req,
    @Body() dto: ClaimWindowReminderDto,
  ) {
    const monitor = await this.airdropAssist.scheduleClaimWindowReminder(
      req.user.id,
      dto,
    );
    return { success: true, data: monitor };
  }
}
