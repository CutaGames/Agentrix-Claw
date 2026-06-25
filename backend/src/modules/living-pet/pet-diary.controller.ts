/**
 * Pet Diary endpoints (Phase C / C-7).
 *
 * GET /v1/pet/diary               — today's diary entry
 * GET /v1/pet/diary?date=YYYY-MM-DD — diary for an explicit date
 * GET /v1/pet/diary/recent?limit=N — last N entries (default 7, max 30)
 */
import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PetDiaryService } from './pet-diary.service';

interface AuthedRequest {
  user?: { id?: string; userId?: string; sub?: string };
}

function uidOf(req: AuthedRequest): string {
  return req.user?.id ?? req.user?.userId ?? req.user?.sub ?? '';
}

@Controller('v1/pet/diary')
@UseGuards(JwtAuthGuard)
export class PetDiaryController {
  constructor(private readonly diary: PetDiaryService) {}

  @Get()
  async today(
    @Req() req: AuthedRequest,
    @Query('date') date?: string,
  ): Promise<{ entry: unknown | null }> {
    const entry = await this.diary.getEntry(uidOf(req), date);
    return { entry };
  }

  @Get('recent')
  async recent(
    @Req() req: AuthedRequest,
    @Query('limit') limit?: string,
  ): Promise<{ items: unknown[] }> {
    const lim = limit ? Number(limit) : 7;
    const items = await this.diary.getRecent(uidOf(req), Number.isFinite(lim) ? lim : 7);
    return { items };
  }
}
