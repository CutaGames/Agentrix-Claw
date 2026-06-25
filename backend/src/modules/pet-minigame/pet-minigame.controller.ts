import { Body, Controller, Get, Post, Query, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PetMinigameService } from './pet-minigame.service';

/**
 * Pet Phase 6 S5 — 迷你游戏 API
 *   GET  /api/v1/pet/minigames/leaderboard?game_key=
 *   GET  /api/v1/pet/minigames/history
 *   POST /api/v1/pet/minigames/submit { game_key, score, metadata }
 */
@UseGuards(JwtAuthGuard)
@Controller('v1/pet/minigames')
export class PetMinigameController {
  constructor(private readonly service: PetMinigameService) {}

  @Get('leaderboard')
  async leaderboard(@Req() req: any, @Query('game_key') gameKey?: string) {
    const userId = req.user?.userId || req.user?.sub || req.user?.id;
    return this.service.leaderboard(userId, gameKey);
  }

  @Get('history')
  async history(@Req() req: any, @Query('limit') limit?: string) {
    const userId = req.user?.userId || req.user?.sub || req.user?.id;
    return { items: await this.service.listRecent(userId, limit ? parseInt(limit, 10) : 20) };
  }

  @Post('submit')
  async submit(
    @Req() req: any,
    @Body() body: { game_key: string; score: number; metadata?: Record<string, unknown> },
  ) {
    const userId = req.user?.userId || req.user?.sub || req.user?.id;
    return this.service.submit(userId, body.game_key, body.score, body.metadata ?? {});
  }
}
