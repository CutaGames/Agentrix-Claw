import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { EconomyBridgeService } from '../services/economy-bridge.service';
import type {
  RequestChargeRequest,
  RequestPayoutRequest,
} from '../../../../shared/types/world-creation-api';

/**
 * EconomyBridgeController — server-authoritative 经济桥 (design §6, R7/R15).
 *
 * 路由前缀 `api/v1/world-creation`。沙箱仅能 request，金额由服务端权威重算。
 * NOTE: Task 1.3 骨架桩，委派给 EconomyBridgeService (当前抛 NotImplemented)。
 */
@ApiTags('world-creation/economy-bridge')
@Controller('v1/world-creation')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class EconomyBridgeController {
  constructor(private readonly economyBridgeService: EconomyBridgeService) {}

  /** POST /api/v1/world-creation/economy/charge — 服务端权威扣款 (R7.2/R7.3)。 */
  @Post('economy/charge')
  @ApiOperation({ summary: 'Request a server-authoritative charge (amount recomputed server-side)' })
  async charge(@Request() req: any, @Body() body: RequestChargeRequest) {
    const userId = req.user?.id ?? req.user?.sub;
    return this.economyBridgeService.requestCharge(userId, body);
  }

  /** POST /api/v1/world-creation/economy/payout — 服务端权威打款 (R16.5)。 */
  @Post('economy/payout')
  @ApiOperation({ summary: 'Request a server-authoritative payout (settled server-side)' })
  async payout(@Request() req: any, @Body() body: RequestPayoutRequest) {
    const userId = req.user?.id ?? req.user?.sub;
    return this.economyBridgeService.requestPayout(userId, body);
  }

  /** GET /api/v1/world-creation/plots/:plotId/sales-report — 每日销售报表 (R15.5)。 */
  @Get('plots/:plotId/sales-report')
  @ApiOperation({ summary: 'Owner daily sales report aggregated from state.kv' })
  async salesReport(
    @Request() req: any,
    @Param('plotId') plotId: string,
    @Query('day') day?: string,
  ) {
    const userId = req.user?.id ?? req.user?.sub;
    return this.economyBridgeService.getSalesReport(userId, plotId, day);
  }
}
