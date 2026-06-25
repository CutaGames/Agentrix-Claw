import { Body, Controller, Get, Post, Query, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AutoEarnTimelineService, EarnSource } from './auto-earn-timeline.service';

/**
 * 顿领 §9.4 Auto-Earn 仪表盘 + A2A 时间线 (P2-2)
 *   POST /api/v1/auto-earn/events                  record event (skill/A2A/etc)
 *   GET  /api/v1/auto-earn/timeline?source=&limit=
 *   GET  /api/v1/auto-earn/summary
 */
@UseGuards(JwtAuthGuard)
@Controller('v1/auto-earn')
export class AutoEarnTimelineController {
  constructor(private readonly service: AutoEarnTimelineService) {}

  private uid(req: any) {
    return req.user?.userId || req.user?.sub || req.user?.id;
  }

  @Post('events')
  record(@Req() req: any, @Body() body: any) {
    return this.service.record(this.uid(req), body);
  }

  @Get('timeline')
  timeline(@Req() req: any, @Query('source') source?: EarnSource, @Query('limit') limit?: string) {
    return this.service.timeline(this.uid(req), { source, limit: Number(limit) || undefined });
  }

  @Get('summary')
  summary(@Req() req: any) {
    return this.service.summary(this.uid(req));
  }
}
