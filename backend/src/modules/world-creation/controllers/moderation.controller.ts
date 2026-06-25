import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Request,
  UseGuards,
  BadRequestException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { PlotModerationService } from '../moderation/plot-moderation.service';
import type {
  ReportPlotRequest,
  ReportPlotResponse,
  PlotModerationDecisionsResponse,
} from '../../../../shared/types/world-creation-api';

/**
 * ModerationController — UGC 体验发布后举报与审核审计 (design §10, R10).
 *
 * 路由前缀 `api/v1/world-creation/moderation`。复用 v5 5 阶段审核管线
 * (经 {@link PlotModerationService} 注入 world-engine ModerationService，不重建)。
 *
 * 暴露发布后举报 (R10.4) 与审核决策审计读取 (R10.6)；发布前审核门控由
 * 发布流程 (ArenaService.publishArena 钩子) 调用 PlotModerationService.runPrePublish。
 */
@ApiTags('world-creation/moderation')
@Controller('v1/world-creation/moderation')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class ModerationController {
  constructor(
    /** Plot 审核编排服务 (复用 v5 5 阶段审核管线，不重建)。 */
    private readonly plotModerationService: PlotModerationService,
  ) {}

  /** POST /api/v1/world-creation/moderation/plots/:plotId/report — 发布后举报 (R10.4)。 */
  @Post('plots/:plotId/report')
  @ApiOperation({
    summary: 'Report a published Plot experience (post-publish moderation)',
  })
  async report(
    @Request() req: any,
    @Param('plotId') plotId: string,
    @Body() body: ReportPlotRequest,
  ): Promise<ReportPlotResponse> {
    const reason = body?.detail
      ? `${body?.reason ?? ''} — ${body.detail}`.trim()
      : body?.reason;
    if (!reason || !reason.trim()) {
      throw new BadRequestException('A report reason is required');
    }
    const reporterId = req?.user?.id ?? req?.user?.userId ?? 'anonymous';
    return this.plotModerationService.reportPlot(plotId, reporterId, reason);
  }

  /** GET /api/v1/world-creation/moderation/plots/:plotId/decisions — 审核决策审计 (R10.6)。 */
  @Get('plots/:plotId/decisions')
  @ApiOperation({ summary: 'Get moderation decision audit log for a Plot' })
  async getDecisions(
    @Param('plotId') plotId: string,
  ): Promise<PlotModerationDecisionsResponse> {
    const decisions = await this.plotModerationService.getDecisions(plotId);
    return { plotId, decisions };
  }
}
