import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  Request,
  Res,
  UseGuards,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { Response } from 'express';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { WorldEngineFlagGuard } from '../guards/world-engine-flag.guard';
import { ShareService } from '../services/share.service';
import { WorldAsset } from '../entities/world-asset.entity';
import { Battle } from '../entities/battle.entity';
import { Dungeon } from '../entities/dungeon.entity';
import {
  renderCharacterCardSvg,
  renderBattleCardSvg,
  renderDungeonCardSvg,
} from '../share/card-renderer';

@ApiTags('world-engine/share')
@Controller('v1/world-engine/share')
@UseGuards(JwtAuthGuard, WorldEngineFlagGuard)
@ApiBearerAuth()
export class ShareController {
  constructor(
    private readonly shareService: ShareService,
    @InjectRepository(WorldAsset)
    private readonly worldAssetRepo: Repository<WorldAsset>,
    @InjectRepository(Battle)
    private readonly battleRepo: Repository<Battle>,
    @InjectRepository(Dungeon)
    private readonly dungeonRepo: Repository<Dungeon>,
  ) {}

  /**
   * POST /share/card — Generate a shareable card for a world asset.
   *
   * Accepts { assetId, type: 'character'|'dungeon'|'battle' }
   * Returns { cardUrl, deepLink }
   *
   * Requirements: 7.1, 7.3
   */
  @Post('card')
  @ApiOperation({ summary: 'Generate a shareable card for a world asset' })
  async generateCard(
    @Request() req: any,
    @Body() body: { assetId: string; type: 'character' | 'dungeon' | 'battle' },
  ) {
    if (!body.assetId) {
      throw new BadRequestException('assetId is required');
    }
    if (!body.type || !['character', 'dungeon', 'battle'].includes(body.type)) {
      throw new BadRequestException('type must be one of: character, dungeon, battle');
    }

    const { cardUrl, deepLink } = await this.shareService.generateCard(
      body.assetId,
      body.type,
    );

    return { cardUrl, deepLink };
  }

  /**
   * POST /share/video — Generate a battle replay video for sharing.
   *
   * Accepts { battleId }
   * Returns { videoUrl }
   *
   * Requirements: 7.3
   */
  @Post('video')
  @ApiOperation({ summary: 'Generate a battle replay video for sharing' })
  async generateVideo(
    @Request() req: any,
    @Body() body: { battleId: string },
  ) {
    if (!body.battleId) {
      throw new BadRequestException('battleId is required');
    }

    const { videoUrl } = await this.shareService.generateReplayVideo(body.battleId);

    return { videoUrl };
  }

  /**
   * GET /share/preview/:token — Web preview page for shared assets.
   *
   * Returns HTML response (Content-Type: text/html) for non-app users.
   * Handles deleted asset deep links by displaying "no longer available" notice.
   *
   * Requirements: 7.5, 7.7, 7.8
   */
  @Get('preview/:token')
  @ApiOperation({ summary: 'Web preview page for shared assets (non-app users)' })
  async getPreview(
    @Param('token') token: string,
    @Res() res: Response,
  ) {
    const { html } = await this.shareService.getPreview(token);

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(html);
  }

  // ============================================================
  // Real SVG card rendering (P1 — replaces Phase 1 placeholders)
  // ============================================================

  /**
   * GET /share/card/asset/:assetId.svg — Render a character card as SVG.
   *
   * Returns an actual visual SVG card with character stats, branding, and
   * a placeholder for the 3D mesh. This is the P1 replacement for the
   * Phase 1 S3-path-only response.
   *
   * Requirements: 7.1, 7.2
   */
  @Get('card/asset/:assetId.svg')
  @ApiOperation({ summary: 'Render character card as SVG' })
  async renderAssetCard(
    @Param('assetId') assetId: string,
    @Res() res: Response,
  ) {
    const asset = await this.worldAssetRepo.findOne({ where: { id: assetId } });
    if (!asset) {
      throw new NotFoundException(`World asset ${assetId} not found`);
    }

    const stats = (asset.stats || {}) as any;
    const svg = renderCharacterCardSvg({
      name: asset.name,
      category: asset.category,
      level: asset.level,
      battleWins: asset.battleWins,
      battleLosses: asset.battleLosses,
      stats: {
        hp: Number(stats.hp) || 0,
        atk: Number(stats.atk) || 0,
        def: Number(stats.def) || 0,
        spd: Number(stats.spd) || 0,
        int: Number(stats.int) || 0,
      },
      styledMeshUrl: asset.styledMeshUrl,
    });

    res.setHeader('Content-Type', 'image/svg+xml; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=300'); // 5 min cache
    res.send(svg);
  }

  /**
   * GET /share/card/battle/:battleId.svg — Render a battle replay card as SVG.
   *
   * Requirements: 7.3
   */
  @Get('card/battle/:battleId.svg')
  @ApiOperation({ summary: 'Render battle replay card as SVG' })
  async renderBattleCard(
    @Param('battleId') battleId: string,
    @Res() res: Response,
  ) {
    const battle = await this.battleRepo.findOne({ where: { id: battleId } });
    if (!battle) {
      throw new NotFoundException(`Battle ${battleId} not found`);
    }

    // Resolve names
    const challenger = await this.worldAssetRepo.findOne({
      where: { id: battle.challengerAssetId },
    });
    const defender = await this.worldAssetRepo.findOne({
      where: { id: battle.defenderAssetId },
    });
    const winnerName = battle.winnerAssetId === battle.challengerAssetId
      ? challenger?.name || 'Challenger'
      : defender?.name || 'Defender';

    const svg = renderBattleCardSvg({
      battleId: battle.id,
      challengerName: challenger?.name || 'Challenger',
      defenderName: defender?.name || 'Defender',
      winnerName,
      rounds: battle.totalRounds || 0,
      date: battle.createdAt.toISOString().split('T')[0],
    });

    res.setHeader('Content-Type', 'image/svg+xml; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=300');
    res.send(svg);
  }

  /**
   * GET /share/card/dungeon/:shareCode.svg — Render a dungeon invite card as SVG.
   *
   * Requirements: 7.5
   */
  @Get('card/dungeon/:shareCode.svg')
  @ApiOperation({ summary: 'Render dungeon invite card as SVG' })
  async renderDungeonCard(
    @Param('shareCode') shareCode: string,
    @Res() res: Response,
  ) {
    const dungeon = await this.dungeonRepo.findOne({ where: { shareCode } });
    if (!dungeon) {
      throw new NotFoundException(`Dungeon ${shareCode} not found`);
    }

    const creator = await this.worldAssetRepo.findOne({
      where: { id: dungeon.worldAssetId },
    });

    const svg = renderDungeonCardSvg({
      shareCode: dungeon.shareCode,
      theme: dungeon.theme,
      difficulty: dungeon.difficultyRating || 1,
      creatorName: creator?.name || 'Mystery',
    });

    res.setHeader('Content-Type', 'image/svg+xml; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=300');
    res.send(svg);
  }
}
