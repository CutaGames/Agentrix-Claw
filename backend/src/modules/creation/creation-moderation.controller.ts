import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  Request,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';

import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AdminGuard } from '../../common/guards/admin.guard';
import { CreationModerationService } from './creation-moderation.service';
import type {
  ReportCreationRequest,
  ReportCreationResponse,
  TakedownCreationRequest,
  TakedownCreationResponse,
  UnpublishCreationRequest,
  UnpublishCreationResponse,
  GetCreationModerationDecisionsResponse,
} from '../../../shared/types/creation-api';

/**
 * CreationModerationController — 举报 / 下架 / 主动下架 / 审计 REST 入口
 * (world-creation-feed task 2.4 接线)。
 *
 * spec: .kiro/specs/world-creation-feed/{requirements,design}.md
 *   - design §Components and Interfaces — `POST /:id/report|takedown|unpublish`、`GET /:id/moderation`
 *   - 需求 3.3(结构化原因/内容保留)/ 3.4(举报+违规移出)/ 3.5(审计)
 *
 * 鉴权分层(安全):
 *   - report:任意登录用户(对已发布 Creation 举报)—— JwtAuthGuard;reporterId 取认证用户。
 *   - unpublish:创作者主动下架(可逆)—— JwtAuthGuard;actorId 取认证用户。
 *   - takedown:违规强制下架(移出发现面)—— **JwtAuthGuard + AdminGuard**(仅审核员/管理员)。
 *   - GET moderation:审计读取 —— JwtAuthGuard。
 */
@ApiTags('creation')
@Controller('v1/creations')
@ApiBearerAuth()
export class CreationModerationController {
  constructor(private readonly moderation: CreationModerationService) {}

  /** POST /v1/creations/:id/report — 任意用户举报已发布 Creation(需求 3.4)。 */
  @Post(':id/report')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Report a published Creation (any authenticated user)' })
  async report(
    @Request() req: any,
    @Param('id') id: string,
    @Body() body: ReportCreationRequest,
  ): Promise<ReportCreationResponse> {
    // reporterId 以认证用户为准(防伪冒);reason 取请求体。
    const reporterId = req.user?.id ?? req.user?.sub ?? body.reporterId;
    const result = await this.moderation.report(id, reporterId, body.reason);
    if (result.received) {
      return { reportId: result.reportId, stage: 'report' };
    }
    return { reportId: '', stage: 'report', error: result.error };
  }

  /** POST /v1/creations/:id/unpublish — 创作者主动下架(可逆,内容保留,需求 3.4)。 */
  @Post(':id/unpublish')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Creator unpublishes own Creation (reversible)' })
  async unpublish(
    @Request() req: any,
    @Param('id') id: string,
    @Body() body: UnpublishCreationRequest = {},
  ): Promise<UnpublishCreationResponse> {
    const actorId = req.user?.id ?? req.user?.sub ?? body.actorId;
    return this.moderation.unpublish(id, body.reason, actorId);
  }

  /** POST /v1/creations/:id/takedown — 违规强制下架(仅审核员/管理员,需求 3.4)。 */
  @Post(':id/takedown')
  @UseGuards(JwtAuthGuard, AdminGuard)
  @ApiOperation({ summary: 'Force takedown a violating Creation (admin/moderator only)' })
  async takedown(
    @Request() req: any,
    @Param('id') id: string,
    @Body() body: TakedownCreationRequest,
  ): Promise<TakedownCreationResponse> {
    const reviewerId = body.reviewerId ?? req.user?.id ?? req.user?.sub;
    return this.moderation.takedown(id, body.reason, reviewerId);
  }

  /** GET /v1/creations/:id/moderation — 读取审核决策审计日志(需求 3.5)。 */
  @Get(':id/moderation')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Read a Creation moderation decision audit trail' })
  async getDecisions(
    @Param('id') id: string,
  ): Promise<GetCreationModerationDecisionsResponse> {
    const decisions = await this.moderation.getDecisions(id);
    return { decisions };
  }
}
