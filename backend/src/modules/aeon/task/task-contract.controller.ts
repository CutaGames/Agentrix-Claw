import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  Request,
  UseGuards,
  BadRequestException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { TaskContractService } from './task-contract.service';
import type { ComplianceContext } from '../economy/compliance-gate.service';

/**
 * TaskContractController — 任务广场 + 悬赏 API(Task 3.6 / 3.8 / R7 / R9)。
 * `v1/aeon/tasks`。合规上下文从请求用户派生(KYC/AML/region 在 wiring 接入真实来源)。
 */
@ApiTags('aeon/tasks')
@Controller('v1/aeon/tasks')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class TaskContractController {
  constructor(private readonly tasks: TaskContractService) {}

  private compliance(req: any): ComplianceContext {
    return {
      userId: req.user?.id || req.user?.sub,
      region: req.user?.region,
      isMinor: req.user?.isMinor === true,
      kycPassed: req.user?.kycPassed === true,
      amlFlagged: req.user?.amlFlagged === true,
    };
  }

  @Post()
  @ApiOperation({ summary: '发布任务/悬赏' })
  async post(
    @Request() req: any,
    @Body()
    body: {
      title: string;
      description?: string;
      acceptanceCriteria?: Record<string, unknown>;
      rewardAmount: number;
      rewardCurrency?: string;
      deadlineAt?: number;
      kind?: 'plaza' | 'bounty' | 'kpi';
      orgId?: string | null;
      milestones?: Record<string, unknown>[];
    },
  ) {
    if (!body?.title) throw new BadRequestException('title 必填');
    return this.tasks.post({
      ...body,
      initiatorUserId: req.user?.id || req.user?.sub,
      compliance: this.compliance(req),
    });
  }

  @Get()
  @ApiOperation({ summary: '浏览开放任务' })
  async listOpen(@Query('kind') kind?: string) {
    return { items: await this.tasks.listOpen(kind) };
  }

  @Get(':id')
  @ApiOperation({ summary: '任务详情' })
  async get(@Param('id') id: string) {
    return this.tasks.get(id);
  }

  @Post(':id/accept')
  @ApiOperation({ summary: '接单' })
  async accept(
    @Request() req: any,
    @Param('id') id: string,
    @Body() body: { agentInstanceId?: string },
  ) {
    return this.tasks.accept(id, req.user?.id || req.user?.sub, body?.agentInstanceId ?? null);
  }

  @Post(':id/submit')
  @ApiOperation({ summary: '提交交付物' })
  async submit(
    @Request() req: any,
    @Param('id') id: string,
    @Body() body: { deliverable: Record<string, unknown> },
  ) {
    return this.tasks.submit(id, req.user?.id || req.user?.sub, body?.deliverable ?? {});
  }

  @Post(':id/verify')
  @ApiOperation({ summary: '验收通过并放款' })
  async verify(@Request() req: any, @Param('id') id: string) {
    return this.tasks.verify(id, req.user?.id || req.user?.sub, this.compliance(req));
  }

  @Post(':id/reject')
  @ApiOperation({ summary: '验收驳回' })
  async reject(@Request() req: any, @Param('id') id: string, @Body() body: { reason: string }) {
    return this.tasks.reject(id, req.user?.id || req.user?.sub, body?.reason ?? '不符合验收标准');
  }

  @Post(':id/cancel')
  @ApiOperation({ summary: '取消任务(悬赏退还托管)' })
  async cancel(@Request() req: any, @Param('id') id: string) {
    return this.tasks.cancel(id, req.user?.id || req.user?.sub, this.compliance(req));
  }
}
