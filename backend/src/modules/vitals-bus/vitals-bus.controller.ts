import { Body, Controller, Get, Post, Query, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { VitalsBusService, VitalsEventInput } from './vitals-bus.service';

/**
 * 顿领 §3.4.2 + §6.1 Vitals Bus 控制器
 *
 *   POST /api/v1/vitals/ingest      生理/状态指标上报，由反应器映射为主宠情绪
 *   GET  /api/v1/vitals/recent      最近事件（含命中规则）
 */
@UseGuards(JwtAuthGuard)
@Controller('v1/vitals')
export class VitalsBusController {
  constructor(private readonly service: VitalsBusService) {}

  @Post('ingest')
  async ingest(@Req() req: any, @Body() body: VitalsEventInput) {
    const userId = req.user?.userId || req.user?.sub || req.user?.id;
    return this.service.ingest(userId, body);
  }

  @Get('recent')
  async recent(@Req() req: any, @Query('limit') limit?: string) {
    const userId = req.user?.userId || req.user?.sub || req.user?.id;
    return this.service.list(userId, limit ? parseInt(limit, 10) : 50);
  }
}
