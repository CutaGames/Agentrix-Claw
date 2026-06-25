import {
  Controller,
  Post,
  Body,
  Param,
  Request,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { LandEconomyService } from '../services/land-economy.service';
import type {
  AcquirePlotRequest,
  ListPlotForSaleRequest,
  TransferPlotRequest,
} from '../../../../shared/types/world-creation-api';

/**
 * PlotController — 地块获取 / 上架 / 转让 (design §7 Land_Economy, R2).
 *
 * 路由前缀 `api/v1/world-creation/plots`。
 * NOTE: Task 1.3 骨架桩，委派给 LandEconomyService (当前抛 NotImplemented)。
 */
@ApiTags('world-creation/plot')
@Controller('v1/world-creation/plots')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class PlotController {
  constructor(private readonly landEconomyService: LandEconomyService) {}

  /** POST /api/v1/world-creation/plots/acquire — 乐观锁获取地块 (R2.2/R2.3)。 */
  @Post('acquire')
  @ApiOperation({ summary: 'Acquire a scarce Plot via optimistic-lock two-phase commit' })
  async acquire(@Request() req: any, @Body() body: AcquirePlotRequest) {
    const userId = req.user?.id ?? req.user?.sub;
    return this.landEconomyService.acquirePlot(userId, body);
  }

  /** POST /api/v1/world-creation/plots/:plotId/list — 上架转让 (R2.4)。 */
  @Post(':plotId/list')
  @ApiOperation({ summary: 'List a Plot for transfer on the Marketplace' })
  async listForSale(
    @Request() req: any,
    @Param('plotId') plotId: string,
    @Body() body: ListPlotForSaleRequest,
  ) {
    const userId = req.user?.id ?? req.user?.sub;
    return this.landEconomyService.listForSale(userId, plotId, body);
  }

  /** POST /api/v1/world-creation/plots/transfer — 两阶段所有权转移 (R2.5/R2.6)。 */
  @Post('transfer')
  @ApiOperation({ summary: 'Commit Plot ownership transfer (two-phase + revenue share)' })
  async transfer(@Request() req: any, @Body() body: TransferPlotRequest) {
    const userId = req.user?.id ?? req.user?.sub;
    return this.landEconomyService.transferPlot(userId, body);
  }
}
