import {
  Controller,
  Get,
  Post,
  Body,
  Query,
  Request,
  UseGuards,
  BadRequestException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { WorldEngineFlagGuard } from '../guards/world-engine-flag.guard';
import { WorldEngineFeatureFlagService } from '../feature-flag.service';
import { QuotaService } from '../services/quota.service';
import { RateLimiterService } from '../services/rate-limiter.service';
import { CostDashboardService } from '../services/cost-dashboard.service';
import { GoLiveDashboardService } from '../services/go-live-dashboard.service';

@ApiTags('world-engine/quota')
@Controller('v1/world-engine')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class QuotaController {
  constructor(
    private readonly flagService: WorldEngineFeatureFlagService,
    private readonly quotaService: QuotaService,
    private readonly rateLimiterService: RateLimiterService,
    private readonly costDashboardService: CostDashboardService,
  ) {}

  @Get('enabled')
  @ApiOperation({ summary: 'Check if World Engine feature is enabled for the current user' })
  async checkEnabled(@Request() req: any) {
    const userId = req.user?.id ?? req.user?.sub;
    const enabled = userId ? await this.flagService.isEnabledForUser(userId) : false;
    return { enabled };
  }

  /**
   * GET /quota/status — Check current daily quota and monthly cost ceiling.
   *
   * Returns quota status for all event types + monthly cost info.
   *
   * Requirements: 13.2, 13.3, 13.4
   */
  @Get('quota/status')
  @UseGuards(WorldEngineFlagGuard)
  @ApiOperation({ summary: 'Check current quota status for all event types' })
  async getQuotaStatus(@Request() req: any) {
    const userId = req.user?.id || req.user?.sub;

    const [quickScan, detailScan, roomScan, characterRegens, monthlyCost] =
      await Promise.all([
        this.quotaService.checkDailyQuota(userId, 'quickScan'),
        this.quotaService.checkDailyQuota(userId, 'detailScan'),
        this.quotaService.checkDailyQuota(userId, 'roomScan'),
        this.quotaService.checkDailyQuota(userId, 'characterRegens'),
        this.quotaService.checkMonthlyCostCeiling(userId),
      ]);

    return {
      daily: { quickScan, detailScan, roomScan, characterRegens },
      monthly: monthlyCost,
    };
  }

  /**
   * POST /quota/purchase — Purchase additional generation quota with AXP.
   *
   * Accepts { quotaType, quantity }
   * Returns { success, axpCost, expiresAt }
   *
   * Requirements: 13.5
   */
  @Post('quota/purchase')
  @UseGuards(WorldEngineFlagGuard)
  @ApiOperation({ summary: 'Purchase additional generation quota with AXP' })
  async purchaseQuota(
    @Request() req: any,
    @Body() body: { quotaType: string; quantity: number },
  ) {
    const userId = req.user?.id || req.user?.sub;

    if (!body.quotaType) {
      throw new BadRequestException('quotaType is required');
    }
    if (!body.quantity || body.quantity <= 0) {
      throw new BadRequestException('quantity must be a positive integer');
    }

    return this.quotaService.purchaseQuota(userId, body.quotaType, body.quantity);
  }
}

/**
 * Admin-only cost dashboard controller.
 * Separated from user-facing quota controller.
 *
 * Requirements: 13.7
 */
@ApiTags('admin/world-engine')
@Controller('admin/world-engine')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class AdminCostDashboardController {
  constructor(
    private readonly costDashboardService: CostDashboardService,
    private readonly goLiveDashboardService: GoLiveDashboardService,
  ) {}

  /**
   * GET /cost-summary — Admin cost dashboard.
   *
   * Returns aggregated cost data by Provider × userId × day.
   * Supports date range, provider, and userId filters.
   *
   * Requirements: 13.7
   */
  @Get('cost-summary')
  @ApiOperation({ summary: 'Admin cost dashboard — aggregated by Provider × userId × day' })
  async getCostSummary(
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('provider') provider?: string,
    @Query('userId') userId?: string,
    @Query('limit') limit?: string,
  ) {
    return this.costDashboardService.getCostSummary({
      startDate,
      endDate,
      provider,
      userId,
      limit: limit ? parseInt(limit, 10) : 100,
    });
  }

  /**
   * GET /go-live-dashboard — Go-live metrics dashboard.
   *
   * Returns conversion funnel + quality gate rejection breakdown.
   *
   * Requirements: (cross-cutting, Task 21.2)
   */
  @Get('go-live-dashboard')
  @ApiOperation({ summary: 'Go-live dashboard — conversion funnel + quality gate breakdown' })
  async getGoLiveDashboard() {
    return this.goLiveDashboardService.getDashboard();
  }
}
