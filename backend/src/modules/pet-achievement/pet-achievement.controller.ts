import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PetAchievementService } from './pet-achievement.service';

/**
 * Pet Phase 6 S4 — 成就 API
 *   GET  /api/v1/pet/achievements                列表（含未解锁项）
 *   POST /api/v1/pet/achievements/_unlock        手动解锁（admin / 进化触发）
 */
@UseGuards(JwtAuthGuard)
@Controller('v1/pet/achievements')
export class PetAchievementController {
  constructor(private readonly service: PetAchievementService) {}

  @Get()
  async list(@Req() req: any) {
    const userId = req.user?.userId || req.user?.sub || req.user?.id;
    return { items: await this.service.listForUser(userId) };
  }

  @Post('_unlock')
  async unlock(@Req() req: any, @Body() body: { key: string }) {
    const userId = req.user?.userId || req.user?.sub || req.user?.id;
    return this.service.unlockManual(userId, body.key);
  }
}
