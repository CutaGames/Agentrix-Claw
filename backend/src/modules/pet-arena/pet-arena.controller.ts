import { Body, Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PetArenaService, type CreateMatchDto } from './pet-arena.service';

interface AuthedRequest {
  user?: { sub?: string; userId?: string; id?: string };
}

function userIdOf(req: AuthedRequest): string {
  const id = req.user?.id || req.user?.sub || req.user?.userId;
  if (!id) throw new Error('unauthenticated');
  return String(id);
}

/**
 * Multi-Agent v2 W8 — Pet Arena endpoints.
 *
 *   POST /api/pet-arena/match           — create a match (caller chooses opponent)
 *   POST /api/pet-arena/match/:id/resolve — declare winner + finalize ELO
 *   GET  /api/pet-arena/ladder/me       — my ladder (today)
 *   GET  /api/pet-arena/productivity/:livingPetId — productivity score for a pet
 *
 * Spec: tasks.md W8.2-W8.4
 */
@Controller('pet-arena')
@UseGuards(JwtAuthGuard)
export class PetArenaController {
  constructor(private readonly arena: PetArenaService) {}

  @Post('match')
  async createMatch(
    @Req() req: AuthedRequest,
    @Body() body: Omit<CreateMatchDto, 'aUserId'>,
  ) {
    const userId = userIdOf(req);
    const match = await this.arena.createMatch({ ...body, aUserId: userId });
    return { success: true, data: match };
  }

  @Post('match/:id/resolve')
  async resolveMatch(
    @Param('id') id: string,
    @Body() body: { winnerSide: 'A' | 'B' | null; scoreA?: number; scoreB?: number; costUsd?: number },
  ) {
    const match = await this.arena.resolveMatch(id, body.winnerSide, {
      scoreA: body.scoreA,
      scoreB: body.scoreB,
      costUsd: body.costUsd,
    });
    return { success: true, data: match };
  }

  @Get('ladder/me')
  async myLadder(@Req() req: AuthedRequest) {
    const userId = userIdOf(req);
    const data = await this.arena.getMyLadder(userId);
    return { success: true, data };
  }

  @Get('productivity/:livingPetId')
  async productivity(@Param('livingPetId') livingPetId: string) {
    const score = await this.arena.getPetProductivityScore(livingPetId);
    return { success: true, data: { livingPetId, score } };
  }

  /**
   * v2.1 P2 #14 — Tournament endpoints (scaffold only).
   *
   * These are intentionally stubs that return 501 Not Implemented unless
   * `MULTI_AGENT_PET_ARENA_TOURNAMENT_ENABLED=1` is flipped on by ops.
   * Full tournament logic (bracket generation, entry fee escrow, prize
   * payout) is scoped for v2.3 Pet Arena commercialization sprint per
   * MULTI_AGENT_V2_1_PRODUCT_DECISIONS §7.3.
   */
  @Post('tournament/create')
  async createTournament(@Req() req: AuthedRequest, @Body() _body: any) {
    void userIdOf(req);
    if (process.env.MULTI_AGENT_PET_ARENA_TOURNAMENT_ENABLED !== '1') {
      return {
        success: false,
        error: 'tournament_not_enabled',
        message:
          'Pet Arena tournaments ship in v2.3. Set MULTI_AGENT_PET_ARENA_TOURNAMENT_ENABLED=1 to enable the v2.1 scaffold.',
      };
    }
    return {
      success: false,
      error: 'tournament_not_implemented',
      message: 'tournament create not yet implemented',
    };
  }

  @Get('tournament/active')
  async listActiveTournaments() {
    if (process.env.MULTI_AGENT_PET_ARENA_TOURNAMENT_ENABLED !== '1') {
      return { success: true, data: [] };
    }
    return { success: true, data: [] };
  }
}
