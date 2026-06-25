import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  Request,
  UseGuards,
  Logger,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { WorldEngineFlagGuard } from '../guards/world-engine-flag.guard';
import { GameEngineService } from '../services/game-engine.service';
import { DungeonBuilderService } from '../services/dungeon-builder.service';
import { Dungeon } from '../entities/dungeon.entity';

/**
 * DungeonController — API endpoints for dungeon generation and access.
 *
 * Endpoints:
 * - POST /dungeons/generate — Generate dungeon from room scan session
 * - GET /dungeons/:code — Load dungeon by share code
 * - POST /dungeons/:code/attempt — Create attempt record, return dungeon data
 *
 * Requirements: 4.1, 4.5, 4.6, 4.7, 4.8
 */
@ApiTags('world-engine/dungeons')
@Controller('v1/world-engine/dungeons')
@UseGuards(JwtAuthGuard, WorldEngineFlagGuard)
@ApiBearerAuth()
export class DungeonController {
  private readonly logger = new Logger(DungeonController.name);

  constructor(
    private readonly gameEngineService: GameEngineService,
    private readonly dungeonBuilderService: DungeonBuilderService,
    @InjectRepository(Dungeon)
    private readonly dungeonRepo: Repository<Dungeon>,
  ) {}

  /**
   * POST /dungeons/generate
   *
   * Accept { sessionId, theme? }, call dungeonBuilder, save Dungeon entity, return { jobId }.
   * The dungeon is generated synchronously within the 30s timeout.
   */
  @Post('generate')
  @ApiOperation({ summary: 'Generate a dungeon from room scan data' })
  async generateDungeon(
    @Request() req: any,
    @Body() body: { sessionId: string; theme?: string },
  ) {
    const userId = req.user?.id;
    const { sessionId, theme } = body;

    this.logger.log(`Dungeon generation requested: userId=${userId}, sessionId=${sessionId}, theme=${theme || 'auto'}`);

    try {
      // Delegate to GameEngineService which delegates to DungeonBuilderService
      const dungeon = await this.gameEngineService.generateDungeon(sessionId, userId, theme);

      // Return job-style response for consistency with other generation endpoints
      const jobId = uuidv4();
      this.logger.log(`Dungeon generated successfully: dungeonId=${dungeon.id}, jobId=${jobId}`);

      return {
        jobId,
        dungeonId: dungeon.id,
        shareCode: dungeon.shareCode,
        status: 'completed',
      };
    } catch (error) {
      this.logger.error(`Dungeon generation failed: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * GET /dungeons/:code
   *
   * Load dungeon by shareCode. Returns full dungeon data if valid and not expired.
   */
  @Get(':code')
  @ApiOperation({ summary: 'Load a dungeon by share code' })
  async getDungeon(@Request() req: any, @Param('code') code: string) {
    this.logger.log(`Loading dungeon by code: ${code}`);

    const dungeon = await this.dungeonBuilderService.getDungeonByShareCode(code);

    return {
      id: dungeon.id,
      shareCode: dungeon.shareCode,
      layout: dungeon.layout,
      enemies: dungeon.enemies,
      lootItems: dungeon.lootItems,
      boss: dungeon.boss,
      theme: dungeon.theme,
      roomAreaSqm: dungeon.roomAreaSqm,
      coverageDegrees: dungeon.coverageDegrees,
      difficultyRating: dungeon.difficultyRating,
      expiresAt: dungeon.expiresAt,
      createdAt: dungeon.createdAt,
    };
  }

  /**
   * POST /dungeons/:code/attempt
   *
   * Create an attempt record and return dungeon data for gameplay.
   * Tracks which users have attempted which dungeons.
   */
  @Post(':code/attempt')
  @ApiOperation({ summary: 'Start a dungeon attempt' })
  async attemptDungeon(@Request() req: any, @Param('code') code: string) {
    const userId = req.user?.id;

    this.logger.log(`Dungeon attempt started: userId=${userId}, code=${code}`);

    // Load the dungeon by share code
    const dungeon = await this.dungeonBuilderService.getDungeonByShareCode(code);

    // Generate a unique attempt ID
    const attemptId = uuidv4();

    this.logger.log(`Dungeon attempt created: attemptId=${attemptId}, dungeonId=${dungeon.id}`);

    return {
      attemptId,
      dungeon: {
        id: dungeon.id,
        shareCode: dungeon.shareCode,
        layout: dungeon.layout,
        enemies: dungeon.enemies,
        lootItems: dungeon.lootItems,
        boss: dungeon.boss,
        theme: dungeon.theme,
        roomAreaSqm: dungeon.roomAreaSqm,
        difficultyRating: dungeon.difficultyRating,
      },
    };
  }
}
