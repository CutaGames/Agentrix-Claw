import {
  Body,
  Controller,
  Get,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AxpService } from './axp.service';

/**
 * AXP API — per docs/MOBILE_REFACTOR_AND_ECOSYSTEM_PLAN_2026-05.zh-CN.md §4.
 *
 *   GET  /api/v1/axp/balance           → current balance + lifetime stats
 *   GET  /api/v1/axp/history?cursor=…  → paginated earn/spend/expire trail
 *   POST /api/v1/axp/earn              → (internal usage only — other services call)
 *   POST /api/v1/axp/spend             → user-initiated spend (e.g. checkout discount)
 *
 * The `earn` endpoint is JWT-guarded and rate-capped server-side so clients
 * can't self-farm AXP. In practice most earns happen via server-side
 * service calls (AxpService.earn()), not via this HTTP endpoint.
 */
@UseGuards(JwtAuthGuard)
@Controller('v1/axp')
export class AxpController {
  constructor(private readonly axp: AxpService) {}

  @Get('balance')
  async balance(@Req() req: any) {
    const userId = req.user?.userId || req.user?.sub || req.user?.id;
    return this.axp.getBalance(userId);
  }

  @Get('history')
  async history(
    @Req() req: any,
    @Query('limit') limit?: string,
    @Query('cursor') cursor?: string,
  ) {
    const userId = req.user?.userId || req.user?.sub || req.user?.id;
    return this.axp.listHistory(userId, limit ? Number(limit) : 50, cursor);
  }

  @Post('earn')
  async earn(
    @Req() req: any,
    @Body()
    body: {
      source: string;
      amount: number;
      ref_id?: string;
      note?: string;
      metadata?: Record<string, unknown>;
    },
  ) {
    const userId = req.user?.userId || req.user?.sub || req.user?.id;
    return this.axp.earn({
      userId,
      source: body.source,
      amount: body.amount,
      refId: body.ref_id ?? null,
      note: body.note ?? null,
      metadata: body.metadata,
    });
  }

  @Post('spend')
  async spend(
    @Req() req: any,
    @Body()
    body: {
      source: string;
      amount: number;
      ref_id?: string;
      note?: string;
      metadata?: Record<string, unknown>;
    },
  ) {
    const userId = req.user?.userId || req.user?.sub || req.user?.id;
    return this.axp.spend({
      userId,
      source: body.source,
      amount: body.amount,
      refId: body.ref_id ?? null,
      note: body.note ?? null,
      metadata: body.metadata,
    });
  }
}
