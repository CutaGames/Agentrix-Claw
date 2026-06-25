import {
  Controller,
  Get,
  Query,
  UseGuards,
  BadRequestException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AdminGuard } from '../../common/guards/admin.guard';
import { CostTrackerService } from './cost-tracker.service';

/**
 * Admin-facing billing audit endpoint.
 * Backed by AgentCostRecord persisted by CostTrackerService.recordCost().
 */
@ApiTags('Admin / Cost Records')
@Controller('admin/cost-records')
@UseGuards(JwtAuthGuard, AdminGuard)
@ApiBearerAuth()
export class CostTrackerController {
  constructor(private readonly costTracker: CostTrackerService) {}

  @Get('summary')
  @ApiOperation({ summary: 'Aggregate cost summary for a user within a date range' })
  @ApiQuery({ name: 'userId', required: true })
  @ApiQuery({ name: 'since', required: false, description: 'ISO date — defaults to 30 days ago' })
  @ApiQuery({ name: 'until', required: false, description: 'ISO date — defaults to now' })
  async summary(
    @Query('userId') userId: string,
    @Query('since') since?: string,
    @Query('until') until?: string,
  ) {
    if (!userId) {
      throw new BadRequestException('userId is required');
    }
    const sinceDate = since ? new Date(since) : new Date(Date.now() - 30 * 86400_000);
    const untilDate = until ? new Date(until) : new Date();
    if (Number.isNaN(sinceDate.getTime()) || Number.isNaN(untilDate.getTime())) {
      throw new BadRequestException('Invalid since/until date');
    }
    if (sinceDate >= untilDate) {
      throw new BadRequestException('since must be earlier than until');
    }
    const data = await this.costTracker.getUserCostInRange(userId, sinceDate, untilDate);
    return {
      userId,
      since: sinceDate.toISOString(),
      until: untilDate.toISOString(),
      ...data,
    };
  }
}
