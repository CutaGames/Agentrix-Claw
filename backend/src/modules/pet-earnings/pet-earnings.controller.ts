import { Controller, Get, Post, Query, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import {
  PetEarningsService,
  EarningRange,
} from './pet-earnings.service';
import { PetEconomicService } from './pet-economic.service';

/**
 * 收益中心 API（Pet Earning Flywheel 需求 1 + 需求 3）。
 *   GET  /api/v1/pet-earnings/summary
 *   GET  /api/v1/pet-earnings/breakdown?range=7d|30d|all
 *   GET  /api/v1/pet-earnings/timeline?range=7d|30d|all
 *   POST /api/v1/pet-earnings/enable-earning      （萌宠开通赚钱能力，幂等）
 *   GET  /api/v1/pet-earnings/economic-profile    （会赚钱的萌宠合并视图）
 */
@UseGuards(JwtAuthGuard)
@Controller('v1/pet-earnings')
export class PetEarningsController {
  constructor(
    private readonly earnings: PetEarningsService,
    private readonly economic: PetEconomicService,
  ) {}

  private uid(req: any): string {
    return req.user?.userId || req.user?.sub || req.user?.id;
  }

  private normRange(range?: string): EarningRange {
    return range === '7d' || range === 'all' ? range : '30d';
  }

  @Get('summary')
  async summary(@Req() req: any) {
    return this.earnings.getSummary(this.uid(req));
  }

  @Get('breakdown')
  async breakdown(@Req() req: any, @Query('range') range?: string) {
    return this.earnings.getBreakdown(this.uid(req), this.normRange(range));
  }

  @Get('timeline')
  async timeline(@Req() req: any, @Query('range') range?: string) {
    return this.earnings.getTimeline(this.uid(req), this.normRange(range));
  }

  @Post('enable-earning')
  async enableEarning(@Req() req: any) {
    return this.economic.ensureEarningCapability(this.uid(req));
  }

  @Get('economic-profile')
  async economicProfile(@Req() req: any) {
    return this.economic.getPetEconomicProfile(this.uid(req));
  }
}
