import {
  Controller,
  Post,
  Param,
  Request,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { ArenaService } from '../arena/arena.service';
import type { PublishPlotResponse } from '../../../../shared/types/world-creation-api';

/**
 * ArenaController — Battle Arena 发布与分享 (Task 12.4, R16.6 / R11.5).
 *
 * 路由前缀 `api/v1/world-creation/arena` (全局 `api` 前缀)。发布后 Plot 经
 * MapService.discover 在 World_Map 可被发现，并产出与 v5 dungeon 一致格式的
 * `share_code`（可套用 `agentrix://world-engine/dungeon/{share_code}` 同款分享）。
 */
@ApiTags('world-creation/arena')
@Controller('v1/world-creation/arena')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class ArenaController {
  constructor(private readonly arenaService: ArenaService) {}

  /** POST /api/v1/world-creation/arena/:plotId/publish — 发布并产出 share_code。 */
  @Post(':plotId/publish')
  @ApiOperation({
    summary:
      'Publish a Battle Arena Plot: becomes discoverable on World_Map + emits share_code',
  })
  async publish(
    @Request() req: any,
    @Param('plotId') plotId: string,
  ): Promise<PublishPlotResponse> {
    const userId = req.user?.id ?? req.user?.sub;
    return this.arenaService.publishArena(plotId, userId);
  }
}
