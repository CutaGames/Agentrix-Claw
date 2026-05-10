import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
  ForbiddenException,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PhotoMimicService } from './photo-mimic.service';
import { ConfigService } from '@nestjs/config';

/**
 * Photo Mimic Game API — per docs/G1_PHOTO_MIMIC_GAME_2026-05.zh-CN.md §4.
 */
@Controller('v1/games/photo-mimic')
export class PhotoMimicController {
  private readonly adminUserIds: Set<string>;

  constructor(
    private readonly service: PhotoMimicService,
    private readonly config: ConfigService,
  ) {
    const raw = this.config.get<string>('PHOTO_MIMIC_ADMIN_USER_IDS') || '';
    this.adminUserIds = new Set(raw.split(',').map((s) => s.trim()).filter(Boolean));
  }

  // ── Public endpoints ────────────────────────────────────────

  @Get('seasons/current')
  async currentSeason() {
    return this.service.getCurrentSeason();
  }

  @Get('seasons/:id/leaderboard')
  async leaderboard(
    @Param('id') id: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    return this.service.getLeaderboard(id, limit ? Number(limit) : 20, offset ? Number(offset) : 0);
  }

  @Get('entries/:id')
  async getEntry(@Param('id') id: string) {
    return this.service.getEntryById(id);
  }

  // ── Auth endpoints ──────────────────────────────────────────

  @UseGuards(JwtAuthGuard)
  @Post('entries')
  async submit(
    @Req() req: any,
    @Body() body: { season_id: string; source_image_url: string; caption?: string; provider?: string },
  ) {
    const userId = req.user?.userId || req.user?.sub || req.user?.id;
    return this.service.submitEntry(userId, body);
  }

  @UseGuards(JwtAuthGuard)
  @Get('entries/mine')
  async myEntries(@Req() req: any, @Query('limit') limit?: string) {
    const userId = req.user?.userId || req.user?.sub || req.user?.id;
    return this.service.getMyEntries(userId, limit ? Number(limit) : 20);
  }

  @UseGuards(JwtAuthGuard)
  @Post('votes')
  async vote(@Req() req: any, @Body() body: { entry_id: string }) {
    const userId = req.user?.userId || req.user?.sub || req.user?.id;
    return this.service.castVote(userId, body.entry_id);
  }

  @UseGuards(JwtAuthGuard)
  @Get('votes/mine/today')
  async myTodayVotes(@Req() req: any) {
    const userId = req.user?.userId || req.user?.sub || req.user?.id;
    return this.service.getMyTodayVotes(userId);
  }

  // ── Admin ───────────────────────────────────────────────────

  @UseGuards(JwtAuthGuard)
  @Post('admin/settle/:seasonId')
  async settle(@Req() req: any, @Param('seasonId') seasonId: string) {
    const userId = req.user?.userId || req.user?.sub || req.user?.id;
    if (!this.adminUserIds.has(userId)) {
      throw new ForbiddenException('not authorized to settle seasons');
    }
    return this.service.settleSeason(seasonId, userId);
  }
}
