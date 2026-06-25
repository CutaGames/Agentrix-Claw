import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Request,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';

import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AgentOpsService } from './agent-ops.service';
import { DueDiligenceEngine, DueDiligenceFact } from './due-diligence-engine.service';
import { SecurityGuard } from './security-guard.service';
import { DeliveryPackageRunnerService } from './delivery-package-runner.service';
import type { DueDiligenceTarget } from './data-source-plugin.types';
import type { ApprovalGrantScope } from './entities/approval-grant.entity';
import type {
  ProducedDeliverableContent,
} from './delivery-package-runner.service';
import type {
  ScamTargetKind,
  TransactionSimulationRequest,
} from './security-guard.types';

// ─────────────────────────────── DTOs ───────────────────────────────

/** 运行尽调入参(需求 8)。userId 由 JWT 注入;taskId 归属经服务端校验。 */
export class RunDueDiligenceDto {
  taskId: string;
  agentId: string;
  target: DueDiligenceTarget;
  extraFacts?: DueDiligenceFact[];
  deviceId?: string;
  sessionId?: string;
  /** 是否落库为交付物(默认 true)。 */
  persist?: boolean;
}

/** 授权扫描入参(需求 10.1,只读)。userId 由 JWT 注入。 */
export class ScanApprovalsDto {
  agentId: string;
  wallet: string;
  chain: string;
  deviceId?: string;
  sessionId?: string;
}

/** 骗局/风险检查入参(需求 10.3,只读)。 */
export class CheckScamDto {
  kind: ScamTargetKind;
  value: string;
  chain?: string;
  agentId?: string;
}

/** 交易模拟/解读入参(需求 10.2,只读)。 */
export class SimulateTransactionDto implements TransactionSimulationRequest {
  chain: string;
  from: string;
  to: string;
  data?: string;
  value?: string;
}

/** 撤销引导入参(需求 10.1,返回未签名计划,绝不代执行)。 */
export class RevokeGuidanceDto {
  chain: string;
  token: string;
  spender: string;
  tokenSymbol?: string;
  spenderLabel?: string;
}

/** 交付包 · 产出交付物步骤入参(需求 13.1)。 */
export class ProduceDeliverableDto {
  taskId: string;
  agentId: string;
  stepId: string;
  content: ProducedDeliverableContent;
  sourceLinks?: any[];
  collectedAt?: string;
  persist?: boolean;
}

/** 交付包 · 写动作审批步骤入参(需求 13.4)。 */
export class RequestWriteActionDto {
  taskId: string;
  agentId: string;
  stepId: string;
  cost?: number;
  scope?: ApprovalGrantScope;
  scopeId?: string;
  intent?: string;
}

/** 校验交付包输入入参。 */
export class ValidateInputsDto {
  input: Record<string, unknown>;
}

/**
 * AgentOpsDeliveryController — 尽调引擎 / 安全防护 / 交付包运行器 REST 入口
 * (crypto-native-agent-ops 任务 13/17/18,需求 8/10/13)。
 *
 *   - 尽调(需求 8):`POST agent-ops/due-diligence/run`(跨只读源采集 → 结构化报告交付物)。
 *   - 安全防护(需求 10,只读 / 不代执行资金):`POST agent-ops/security/scan-approvals`、
 *     `check-scam`、`simulate-transaction`、`revoke-guidance`(后者返回未签名撤销计划)。
 *   - 交付包(需求 13):`GET agent-ops/delivery-packages`(列模板)、`GET .../:slug`、
 *     `POST .../:slug/validate-inputs`、`POST .../:slug/produce`(产出交付物)、
 *     `POST .../:slug/write-action`(写动作分级审批,不代执行对外发布)。
 *
 * 归属:涉及任务的端点(尽调 / 交付包产出 / 写动作)经 `AgentOpsService.getTask(req.user.id, taskId)`
 * 校验任务归属当前用户;安全防护端点以 `req.user.id` 作 userId(只读,无任务归属)。
 */
@ApiTags('Agent Ops · Delivery & Security')
@Controller('agent-ops')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class AgentOpsDeliveryController {
  constructor(
    private readonly agentOpsService: AgentOpsService,
    private readonly dueDiligence: DueDiligenceEngine,
    private readonly securityGuard: SecurityGuard,
    private readonly deliveryRunner: DeliveryPackageRunnerService,
  ) {}

  // ─────────────────── 尽调引擎(需求 8) ───────────────────

  @Post('due-diligence/run')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: '对标的(token/钱包/合约/项目)运行尽调,产出结构化报告交付物(需求 8;严禁编造)',
  })
  @ApiResponse({ status: 200, description: '返回报告 + 合格判定 + 落库交付物' })
  async runDueDiligence(@Request() req, @Body() dto: RunDueDiligenceDto) {
    // 归属校验:任务必须属于当前用户。
    await this.agentOpsService.getTask(req.user.id, dto.taskId);
    const result = await this.dueDiligence.run({
      taskId: dto.taskId,
      agentId: dto.agentId,
      userId: req.user.id,
      target: dto.target,
      extraFacts: dto.extraFacts,
      deviceId: dto.deviceId,
      sessionId: dto.sessionId,
      persist: dto.persist,
    });
    return { success: true, data: result };
  }

  // ─────────────────── 安全防护(需求 10,只读) ───────────────────

  @Post('security/scan-approvals')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '只读扫描钱包授权并标注高风险(需求 10.1;取数失败显式降级,不编造)' })
  @ApiResponse({ status: 200, description: '返回标注后的授权列表(按风险降序)' })
  async scanApprovals(@Request() req, @Body() dto: ScanApprovalsDto) {
    const result = await this.securityGuard.scanApprovals({
      userId: req.user.id,
      agentId: dto.agentId,
      wallet: dto.wallet,
      chain: dto.chain,
      deviceId: dto.deviceId,
      sessionId: dto.sessionId,
    });
    return { success: true, data: result };
  }

  @Post('security/check-scam')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '对地址/合约/域名做骗局与风险检查(需求 10.3;情报不可得显式标 unknown)' })
  @ApiResponse({ status: 200, description: '返回风险等级 + 信号 + 建议' })
  async checkScam(@Request() req, @Body() dto: CheckScamDto) {
    const result = await this.securityGuard.checkScam({
      kind: dto.kind,
      value: dto.value,
      chain: dto.chain,
      userId: req.user.id,
      agentId: dto.agentId,
    });
    return { success: true, data: result };
  }

  @Post('security/simulate-transaction')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '签名前只读交易模拟/解读(需求 10.2;适配器不可用显式降级,不伪造)' })
  @ApiResponse({ status: 200, description: '返回模拟结果(资产变动/目标合约风险或显式降级)' })
  async simulateTransaction(@Body() dto: SimulateTransactionDto) {
    const result = await this.securityGuard.simulateTransaction(dto);
    return { success: true, data: result };
  }

  @Post('security/revoke-guidance')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: '为一条授权生成未签名撤销计划(需求 10.1/Property 4;恒需人确认,绝不代执行)',
  })
  @ApiResponse({ status: 200, description: '返回未签名撤销交易计划 + 人确认决策' })
  revokeGuidance(@Body() dto: RevokeGuidanceDto) {
    const guidance = this.securityGuard.buildRevokeGuidance({
      chain: dto.chain,
      token: dto.token,
      spender: dto.spender,
      tokenSymbol: dto.tokenSymbol,
      spenderLabel: dto.spenderLabel,
    });
    return { success: true, data: guidance };
  }

  // ─────────────────── 交付包运行器(需求 13) ───────────────────

  @Get('delivery-packages')
  @ApiOperation({ summary: '列出所有交付包模板(输入→动作→交付物→量化验收→计费)' })
  @ApiResponse({ status: 200, description: '返回交付包模板列表' })
  listDeliveryPackages() {
    const templates = this.deliveryRunner.listTemplates();
    return { success: true, data: templates };
  }

  @Get('delivery-packages/:slug')
  @ApiOperation({ summary: '按 slug 获取交付包模板详情' })
  @ApiParam({ name: 'slug', description: '交付包 slug' })
  @ApiResponse({ status: 200, description: '返回交付包模板' })
  getDeliveryPackage(@Param('slug') slug: string) {
    const template = this.deliveryRunner.getTemplate(slug);
    return { success: true, data: template };
  }

  @Post('delivery-packages/:slug/validate-inputs')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '校验交付包输入是否覆盖必填字段' })
  @ApiParam({ name: 'slug', description: '交付包 slug' })
  @ApiResponse({ status: 200, description: '返回输入校验结果' })
  validateInputs(@Param('slug') slug: string, @Body() dto: ValidateInputsDto) {
    const result = this.deliveryRunner.validateInputs(slug, dto.input ?? {});
    return { success: true, data: result };
  }

  @Post('delivery-packages/:slug/produce')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '产出交付物步骤(必备章节覆盖校验 → 合格落库,需求 13.1)' })
  @ApiParam({ name: 'slug', description: '交付包 slug' })
  @ApiResponse({ status: 200, description: '返回章节覆盖判定 + 交付物 id' })
  async produceDeliverable(
    @Request() req,
    @Param('slug') slug: string,
    @Body() dto: ProduceDeliverableDto,
  ) {
    // 归属校验:任务必须属于当前用户。
    await this.agentOpsService.getTask(req.user.id, dto.taskId);
    const result = await this.deliveryRunner.produceDeliverable(
      { taskId: dto.taskId, agentId: dto.agentId, userId: req.user.id },
      {
        packageSlug: slug,
        stepId: dto.stepId,
        content: dto.content,
        sourceLinks: dto.sourceLinks,
        collectedAt: dto.collectedAt ? new Date(dto.collectedAt) : null,
        persist: dto.persist,
      },
    );
    return { success: true, data: result };
  }

  @Post('delivery-packages/:slug/write-action')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: '请求写动作分级审批(需求 13.4/任务 9/10;不代执行对外发布,仅返回决策)',
  })
  @ApiParam({ name: 'slug', description: '交付包 slug' })
  @ApiResponse({ status: 200, description: '返回审批决策(auto_execute/user_confirmation/deny)' })
  async requestWriteAction(
    @Request() req,
    @Param('slug') slug: string,
    @Body() dto: RequestWriteActionDto,
  ) {
    // 归属校验:任务必须属于当前用户。
    await this.agentOpsService.getTask(req.user.id, dto.taskId);
    const result = await this.deliveryRunner.requestWriteAction(
      { taskId: dto.taskId, agentId: dto.agentId, userId: req.user.id },
      {
        packageSlug: slug,
        stepId: dto.stepId,
        cost: dto.cost,
        scope: dto.scope,
        scopeId: dto.scopeId,
        intent: dto.intent,
      },
    );
    return { success: true, data: result };
  }
}
