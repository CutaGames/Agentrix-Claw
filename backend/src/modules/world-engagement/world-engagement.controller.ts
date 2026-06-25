import { Controller, Post, Get, Body, Param, Query, Request, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';

import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { GameScoreService } from './game-score.service';
import { PredictionService } from './prediction.service';
import { CoachService } from './coach.service';
import { ArenaTournamentService } from './arena-tournament.service';
import type { PredictionOption, PredictionStatus } from './entities/prediction-market.entity';

/** 创作游戏分数提交 + 周榜(P0 keystone)+ AI 教练/解说 + 对赛奖池。 */
@ApiTags('world-arena')
@Controller('v1/arena')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class WorldArenaController {
  constructor(
    private readonly scores: GameScoreService,
    private readonly coachSvc: CoachService,
    private readonly tournaments: ArenaTournamentService,
  ) {}

  @Post('creations/:id/score')
  @ApiOperation({ summary: 'Submit a game score (server clamps + anti-cheat)' })
  async submit(
    @Request() req: any,
    @Param('id') id: string,
    @Body() body: { score?: number; state?: Record<string, unknown> },
  ) {
    const userId = req.user?.id ?? req.user?.sub;
    return this.scores.submitScore(id, userId, Number(body?.score), body?.state);
  }

  @Get('creations/:id/leaderboard')
  @ApiOperation({ summary: 'Per-creation leaderboard (weekly or all-time)' })
  async leaderboard(
    @Request() req: any,
    @Param('id') id: string,
    @Query('period') period?: string,
    @Query('limit') limit?: string,
  ) {
    const userId = req.user?.id ?? req.user?.sub;
    return this.scores.leaderboard(id, period === 'all' ? 'all' : 'week', userId, limit ? Number(limit) : 20);
  }

  @Post('coach')
  @ApiOperation({ summary: 'AI coach/commentary for the current game state' })
  async coach(
    @Request() req: any,
    @Body() body: { creationId?: string; title?: string; state?: string | null; history?: string[] },
  ) {
    const userId = req.user?.id ?? req.user?.sub;
    return this.coachSvc.coach({ userId, title: body?.title, state: body?.state, history: body?.history });
  }

  // ── 对赛奖池(P0-②) ──
  @Get('tournaments')
  @ApiOperation({ summary: 'List arena tournaments' })
  async listTournaments(@Query('creationId') creationId?: string) {
    return { items: await this.tournaments.list(creationId) };
  }

  @Get('tournaments/:tid')
  @ApiOperation({ summary: 'Get a tournament (+ my entry)' })
  async getTournament(@Request() req: any, @Param('tid') tid: string) {
    const userId = req.user?.id ?? req.user?.sub;
    return this.tournaments.get(tid, userId);
  }

  @Post('tournaments/:tid/join')
  @ApiOperation({ summary: 'Join a tournament (pay AXP entry fee)' })
  async joinTournament(@Request() req: any, @Param('tid') tid: string) {
    const userId = req.user?.id ?? req.user?.sub;
    return this.tournaments.join(userId, tid);
  }

  @Post('tournaments')
  @ApiOperation({ summary: 'Create a tournament (admin)' })
  async createTournament(
    @Request() req: any,
    @Body() body: { creationId: string; title: string; entryFeeAxp: number; rakeBps?: number; payoutSplits?: number[]; endsAt?: string | null },
  ) {
    const userId = req.user?.id ?? req.user?.sub;
    return this.tournaments.create(userId, body);
  }

  @Post('tournaments/:tid/settle')
  @ApiOperation({ summary: 'Settle a tournament — top scorers split the pool (admin)' })
  async settleTournament(@Request() req: any, @Param('tid') tid: string) {
    const userId = req.user?.id ?? req.user?.sub;
    return this.tournaments.settle(userId, tid);
  }

  @Post('tournaments/:tid/cancel')
  @ApiOperation({ summary: 'Cancel a tournament and refund entries (admin)' })
  async cancelTournament(@Request() req: any, @Param('tid') tid: string) {
    const userId = req.user?.id ?? req.user?.sub;
    return this.tournaments.cancel(userId, tid);
  }
}

/** 事件预测市场(parimutuel,AXP)。 */
@ApiTags('prediction')
@Controller('v1/predictions')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class PredictionController {
  constructor(private readonly prediction: PredictionService) {}

  @Get()
  @ApiOperation({ summary: 'List prediction markets' })
  async list(@Query('category') category?: string, @Query('status') status?: string) {
    return { items: await this.prediction.list(category, status as PredictionStatus | undefined) };
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a market (+ my stakes)' })
  async get(@Request() req: any, @Param('id') id: string) {
    const userId = req.user?.id ?? req.user?.sub;
    return this.prediction.get(id, userId);
  }

  @Post(':id/stake')
  @ApiOperation({ summary: 'Stake AXP on an option' })
  async stake(
    @Request() req: any,
    @Param('id') id: string,
    @Body() body: { optionId?: string; amount?: number },
  ) {
    const userId = req.user?.id ?? req.user?.sub;
    return this.prediction.stake(userId, id, String(body?.optionId ?? ''), Number(body?.amount));
  }

  // ── Admin (运营/裁决) ──
  @Post()
  @ApiOperation({ summary: 'Create a market (admin)' })
  async create(
    @Request() req: any,
    @Body() body: { title: string; category?: string; subtitle?: string; options: PredictionOption[]; rakeBps?: number; locksAt?: string | null },
  ) {
    const userId = req.user?.id ?? req.user?.sub;
    return this.prediction.create(userId, body);
  }

  @Post(':id/lock')
  @ApiOperation({ summary: 'Lock a market (admin)' })
  async lock(@Request() req: any, @Param('id') id: string) {
    const userId = req.user?.id ?? req.user?.sub;
    return this.prediction.lock(userId, id);
  }

  @Post(':id/settle')
  @ApiOperation({ summary: 'Settle a market with the winning option (admin)' })
  async settle(@Request() req: any, @Param('id') id: string, @Body() body: { winningOptionId?: string }) {
    const userId = req.user?.id ?? req.user?.sub;
    return this.prediction.settle(userId, id, String(body?.winningOptionId ?? ''));
  }

  @Post(':id/cancel')
  @ApiOperation({ summary: 'Cancel a market and refund all stakes (admin)' })
  async cancel(@Request() req: any, @Param('id') id: string) {
    const userId = req.user?.id ?? req.user?.sub;
    return this.prediction.cancel(userId, id);
  }

  @Get('admin/is-admin')
  @ApiOperation({ summary: 'Whether the caller can run/settle markets' })
  async isAdmin(@Request() req: any) {
    const userId = req.user?.id ?? req.user?.sub;
    return { isAdmin: this.prediction.isAdmin(userId) };
  }
}
