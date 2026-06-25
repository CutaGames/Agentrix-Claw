import {
  Controller,
  Post,
  Body,
  Request,
  UseGuards,
  BadRequestException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RealityLoopService } from './reality-loop.service';
import { AgentFillService } from '../fill/agent-fill.service';

/**
 * RealityLoopController — 现实闭环 + 填场 opt-out API(Task 4.7 / 4.3 / R20 / R13.7)。
 * `v1/aeon/reality`。
 */
@ApiTags('aeon/reality')
@Controller('v1/aeon/reality')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class RealityLoopController {
  constructor(
    private readonly reality: RealityLoopService,
    private readonly fill: AgentFillService,
  ) {}

  private uid(req: any): string {
    return req.user?.id || req.user?.sub;
  }

  @Post('reward')
  @ApiOperation({ summary: '现实任务完成 → 世界 AXP 奖励(R20.1)' })
  async reward(@Request() req: any, @Body() body: { amount: number; reason: string; refId?: string }) {
    if (!(body?.amount > 0) || !body?.reason) throw new BadRequestException('amount/reason 必填');
    return this.reality.rewardFromReality(this.uid(req), body.amount, body.reason, body.refId);
  }

  @Post('fill-optout')
  @ApiOperation({ summary: '设置是否允许我的 agent 进他人填场池(R13.7)' })
  fillOptOut(@Request() req: any, @Body() body: { optOut: boolean }) {
    this.fill.setOptOut(this.uid(req), body?.optOut === true);
    return { optOut: this.fill.isOptedOut(this.uid(req)) };
  }
}
