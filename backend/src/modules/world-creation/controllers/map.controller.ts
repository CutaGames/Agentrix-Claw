import {
  Controller,
  Get,
  Post,
  Param,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { MapService } from '../services/map.service';
import type {
  GetMapViewportQuery,
  DiscoverPlotsQuery,
} from '../../../../shared/types/world-creation-api';

/**
 * MapController — World_Map 外层导航 / 发现 / 在场感 (design §1/§10, R1).
 *
 * 路由前缀 `api/v1/world-creation` (全局 `api` 前缀)。
 * NOTE: Task 1.3 骨架桩，方法委派给 MapService (当前抛 NotImplemented)。
 */
@ApiTags('world-creation/map')
@Controller('v1/world-creation')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class MapController {
  constructor(private readonly mapService: MapService) {}

  /** GET /api/v1/world-creation/map — 视口内 Plot 集合 + 自身位置 (R1.1)。 */
  @Get('map')
  @ApiOperation({ summary: 'World_Map viewport: plots in view + self position' })
  async getViewport(@Request() req: any, @Query() query: GetMapViewportQuery) {
    const userId = req.user?.id ?? req.user?.sub;
    return this.mapService.getViewport(userId, query);
  }

  /** GET /api/v1/world-creation/map/presence — 在场用户轻状态 (R1.2)。 */
  @Get('map/presence')
  @ApiOperation({ summary: 'Presence: other users avatar positions (≤2s refresh)' })
  async getPresence(@Request() req: any) {
    const userId = req.user?.id ?? req.user?.sub;
    return this.mapService.getPresence(userId);
  }

  /** GET /api/v1/world-creation/map/discover — 发现过滤 (R1.5)。 */
  @Get('map/discover')
  @ApiOperation({ summary: 'Discovery filter by category / tier / popularity' })
  async discover(@Query() query: DiscoverPlotsQuery) {
    return this.mapService.discover(query);
  }

  /** GET /api/v1/world-creation/plots/:plotId/preview — Plot 预览 (R1.3)。 */
  @Get('plots/:plotId/preview')
  @ApiOperation({ summary: 'Plot preview: name / owner / tier / enter action' })
  async previewPlot(@Request() req: any, @Param('plotId') plotId: string) {
    const userId = req.user?.id ?? req.user?.sub;
    return this.mapService.previewPlot(userId, plotId);
  }

  /** POST /api/v1/world-creation/plots/:plotId/enter — 进入 Plot 实例 (R1.4/R1.7)。 */
  @Post('plots/:plotId/enter')
  @ApiOperation({ summary: 'Instantiate Plot in sandbox and enter inner experience' })
  async enterPlot(@Request() req: any, @Param('plotId') plotId: string) {
    const userId = req.user?.id ?? req.user?.sub;
    return this.mapService.enterPlot(userId, plotId);
  }
}
