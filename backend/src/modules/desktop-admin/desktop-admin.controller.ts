import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AdminGuard } from '../../common/guards/admin.guard';
import { DesktopAdminService, DesktopDashboard } from './desktop-admin.service';

/**
 * Sprint G-3 / US-G3-2: aggregated desktop ops dashboard.
 *
 * @see .kiro/specs/desktop-ga-internal-beta/design.md §3
 */
@ApiTags('Desktop Admin')
@Controller('admin/desktop')
@UseGuards(JwtAuthGuard, AdminGuard)
@ApiBearerAuth()
export class DesktopAdminController {
  constructor(private readonly service: DesktopAdminService) {}

  @Get('dashboard')
  @ApiOperation({ summary: 'Aggregated desktop dashboard for admin operations' })
  @ApiQuery({ name: 'days', required: false, type: Number, description: '1-90, defaults to 7' })
  async dashboard(@Query('days') days = 7): Promise<DesktopDashboard> {
    const n = Number(days);
    return this.service.getDashboard(Number.isFinite(n) ? Math.floor(n) : 7);
  }
}
