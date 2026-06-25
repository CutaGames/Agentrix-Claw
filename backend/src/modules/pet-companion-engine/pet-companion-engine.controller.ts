import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import {
  PetCompanionEngineService,
  PROACTIVE_KINDS,
} from './pet-companion-engine.service';
import { LivingPetService } from '../living-pet/living-pet.service';

/**
 * Pet Phase 6 — S2 主动陪伴 API
 *
 * Routes:
 *   GET    /api/v1/pet/proactive/pref         当前偏好
 *   PUT    /api/v1/pet/proactive/pref         更新（频次/静默/白名单）
 *   POST   /api/v1/pet/proactive/mute         全局静音 N 小时（hours=0 取消）
 *   POST   /api/v1/pet/proactive/:id/ack      用户已读 / 接受 cta
 *   POST   /api/v1/pet/proactive/:id/dismiss  用户关掉气泡（带轻惩罚信号）
 *   GET    /api/v1/pet/proactive/history      最近 N 条
 *   POST   /api/v1/pet/proactive/_test/evaluate   debug：立即评估当前 user
 */
@UseGuards(JwtAuthGuard)
@Controller('v1/pet/proactive')
export class PetCompanionEngineController {
  constructor(
    private readonly service: PetCompanionEngineService,
    private readonly petService: LivingPetService,
  ) {}

  private uid(req: any): string {
    return req.user?.userId || req.user?.sub || req.user?.id;
  }

  @Get('pref')
  async getPref(@Req() req: any) {
    const pref = await this.service.getOrCreatePref(this.uid(req));
    return this.toDto(pref);
  }

  @Put('pref')
  async updatePref(
    @Req() req: any,
    @Body()
    body: {
      maxPer4h?: number;
      quietHoursStart?: number;
      quietHoursEnd?: number;
      enabledKinds?: string[];
    },
  ) {
    const pref = await this.service.updatePref(this.uid(req), body);
    return this.toDto(pref);
  }

  @Post('mute')
  async mute(@Req() req: any, @Body() body: { hours?: number }) {
    const pref = await this.service.mute(this.uid(req), body?.hours ?? 4);
    return this.toDto(pref);
  }

  @Post(':id/ack')
  async ack(@Req() req: any, @Param('id') id: string) {
    const ev = await this.service.ack(this.uid(req), id);
    if (!ev) return { ok: false, reason: 'not_found' };
    // 简单激励：ack 一次给 +2 亲密 xp
    await this.petService.addIntimacyXp(this.uid(req), 2);
    return { ok: true, event_id: ev.id, status: ev.status };
  }

  @Post(':id/dismiss')
  async dismiss(@Req() req: any, @Param('id') id: string) {
    const ev = await this.service.dismiss(this.uid(req), id);
    if (!ev) return { ok: false, reason: 'not_found' };
    return { ok: true, event_id: ev.id, status: ev.status };
  }

  @Get('history')
  async history(@Req() req: any, @Query('limit') limit?: string) {
    const events = await this.service.listRecent(
      this.uid(req),
      Number(limit) || 30,
    );
    return {
      items: events.map((e) => ({
        id: e.id,
        kind: e.kind,
        status: e.status,
        suppressed_reason: e.suppressedReason,
        intimacy_required: e.intimacyRequired,
        payload: e.payload,
        created_at: e.createdAt.getTime(),
        ack_at: e.ackAt ? e.ackAt.getTime() : null,
      })),
      kinds: PROACTIVE_KINDS,
    };
  }

  /** P1-4 观测：近 N 小时推送/抑制/点击统计。 */
  @Get('stats')
  async stats(@Req() req: any, @Query('hours') hours?: string) {
    return this.service.getStats(this.uid(req), Number(hours) || 24);
  }

  /** Debug-only：开发环境直接触发一次评估，便于 E2E 验证 */
  @Post('_test/evaluate')
  async testEvaluate(@Req() req: any) {
    const userId = this.uid(req);
    const pet = await this.petService.getOrCreate(userId);
    const ev = await this.service.evaluateUser(pet);
    return {
      triggered: ev !== null,
      event: ev
        ? { id: ev.id, kind: ev.kind, status: ev.status }
        : null,
    };
  }

  private toDto(pref: import('../../entities/pet-proactive-pref.entity').PetProactivePref) {
    return {
      user_id: pref.userId,
      max_per_4h: pref.maxPer4h,
      quiet_hours_start: pref.quietHoursStart,
      quiet_hours_end: pref.quietHoursEnd,
      enabled_kinds: pref.enabledKinds,
      mute_until: Number(pref.muteUntil),
      updated_at: pref.updatedAt ? pref.updatedAt.getTime() : null,
    };
  }
}
