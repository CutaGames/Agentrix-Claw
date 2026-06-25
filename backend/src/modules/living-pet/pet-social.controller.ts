import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PetSocialService, PetSocialAction } from './pet-social.service';

/**
 * P2-6 远程社交端点
 *
 *   POST /api/v1/pet/social/:petId/visit          (auth) — 远程拜访
 *   POST /api/v1/pet/social/:petId/touch          (auth) — 抚摸
 *   POST /api/v1/pet/social/:petId/feed           (auth) — 投喂（+5 能量）
 *   POST /api/v1/pet/social/:petId/co-play        (auth) — 共玩（+3 能量）
 *   GET  /api/v1/pet/social/:petId/recent         (公开) — 最近社交记录
 */
@Controller('v1/pet/social')
export class PetSocialController {
  constructor(private readonly social: PetSocialService) {}

  @UseGuards(JwtAuthGuard)
  @Post(':petId/visit')
  async visit(
    @Req() req: any,
    @Param('petId') petId: string,
    @Body() body: { message?: string; visitor_display_name?: string },
  ) {
    return this.run(req, petId, 'visit', body);
  }

  @UseGuards(JwtAuthGuard)
  @Post(':petId/touch')
  async touch(
    @Req() req: any,
    @Param('petId') petId: string,
    @Body() body: { message?: string; visitor_display_name?: string },
  ) {
    return this.run(req, petId, 'touch', body);
  }

  @UseGuards(JwtAuthGuard)
  @Post(':petId/feed')
  async feed(
    @Req() req: any,
    @Param('petId') petId: string,
    @Body() body: { message?: string; visitor_display_name?: string },
  ) {
    return this.run(req, petId, 'feed', body);
  }

  @UseGuards(JwtAuthGuard)
  @Post(':petId/co-play')
  async coPlay(
    @Req() req: any,
    @Param('petId') petId: string,
    @Body() body: { message?: string; visitor_display_name?: string },
  ) {
    return this.run(req, petId, 'co_play', body);
  }

  @Get(':petId/recent')
  async recent(@Param('petId') petId: string, @Query('limit') limit?: string) {
    const n = Math.max(1, Math.min(50, Number(limit) || 20));
    return { items: this.social.listForPet(petId, n) };
  }

  private async run(
    req: any,
    petId: string,
    action: PetSocialAction,
    body: { message?: string; visitor_display_name?: string },
  ) {
    const visitorUserId = req.user?.userId || req.user?.sub || req.user?.id;
    const entry = await this.social.perform({
      petId,
      visitorUserId,
      visitorDisplayName: body?.visitor_display_name ?? null,
      action,
      message: body?.message ?? null,
    });
    return entry;
  }
}
