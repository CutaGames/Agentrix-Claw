import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Request,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { EcsWorldService } from '../services/ecs-world.service';
import { AgentBuilderService } from '../services/agent-builder.service';
import { CreationContinuumService } from '../services/creation-continuum.service';
import type {
  GenerateEcsWorldRequest,
  NlEditRequest,
  DirectEditRequest,
  RevertEcsWorldRequest,
  ContinuumEditRequest,
} from '../../../../shared/types/world-creation-api';

/**
 * EcsWorldController — ECS_World 生成 / 编辑 / diff / revert (design §2, R3/R4).
 *
 * 路由前缀 `api/v1/world-creation/plots/:plotId/...`。
 * 生成委派 AgentBuilderService；编辑 / revert / 历史委派 EcsWorldService。
 * NOTE: Task 1.3 骨架桩 (当前抛 NotImplemented)。
 */
@ApiTags('world-creation/ecs-world')
@Controller('v1/world-creation/plots')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class EcsWorldController {
  constructor(
    private readonly ecsWorldService: EcsWorldService,
    private readonly agentBuilderService: AgentBuilderService,
    private readonly creationContinuumService: CreationContinuumService,
  ) {}

  /** POST /:plotId/generate — prompt 驱动生成 ECS_World 草稿 (R3.1/R3.6)。 */
  @Post(':plotId/generate')
  @ApiOperation({ summary: 'Generate an ECS_World draft from a natural-language prompt' })
  async generate(
    @Request() req: any,
    @Param('plotId') plotId: string,
    @Body() body: GenerateEcsWorldRequest,
  ) {
    const userId = req.user?.id ?? req.user?.sub;
    return this.agentBuilderService.generateDraft(userId, plotId, body);
  }

  /** POST /:plotId/edit/nl — 自然语言编辑 (R3.2)。 */
  @Post(':plotId/edit/nl')
  @ApiOperation({ summary: 'Apply a natural-language edit as a diffable ECS change' })
  async editNl(@Param('plotId') plotId: string, @Body() body: NlEditRequest) {
    return this.ecsWorldService.applyNlEdit(plotId, body);
  }

  /** POST /:plotId/edit/ops — 直接操作编辑 (R3.3)。 */
  @Post(':plotId/edit/ops')
  @ApiOperation({ summary: 'Apply direct-manipulation JSON Patch ops to the ECS_World' })
  async editOps(@Param('plotId') plotId: string, @Body() body: DirectEditRequest) {
    return this.ecsWorldService.applyDirectEdit(plotId, body);
  }

  /**
   * POST /:plotId/continue — 三模式无损切换的统一入口 (R3.4 / R3.7)。
   * 按 mode 在同一 ECS_World 最新版本之上继续编辑 (promptDrive / coEdit / handBuild)；
   * Mobile 发起的 Tier_C 创作返回派发决策 (desktop/agent)，不在本地执行。
   */
  @Post(':plotId/continue')
  @ApiOperation({
    summary: 'Continue editing the same ECS_World in any creation mode (lossless switch)',
  })
  async continueEditing(
    @Request() req: any,
    @Param('plotId') plotId: string,
    @Body() body: ContinuumEditRequest,
  ) {
    const userId = req.user?.id ?? req.user?.sub;
    return this.creationContinuumService.continueEditing(userId, plotId, body);
  }

  /** POST /:plotId/revert — 回滚到目标版本 (R3.5)。 */
  @Post(':plotId/revert')
  @ApiOperation({ summary: 'Revert the ECS_World to a prior version from diff history' })
  async revert(@Param('plotId') plotId: string, @Body() body: RevertEcsWorldRequest) {
    return this.creationContinuumService.revert(plotId, body);
  }

  /** GET /:plotId/history — diff 链历史。 */
  @Get(':plotId/history')
  @ApiOperation({ summary: 'Get the ECS_World diff chain history' })
  async history(@Param('plotId') plotId: string) {
    return this.ecsWorldService.getHistory(plotId);
  }
}
