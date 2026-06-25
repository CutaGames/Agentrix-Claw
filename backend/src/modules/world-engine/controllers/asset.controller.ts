import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  Query,
  Request,
  UseGuards,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { WorldEngineFlagGuard } from '../guards/world-engine-flag.guard';
import { GameEngineService } from '../services/game-engine.service';
import { AgentBindingService } from '../services/agent-binding.service';
import { MarketplaceService } from '../services/marketplace.service';
import { WorldAsset } from '../entities/world-asset.entity';
import { Battle } from '../entities/battle.entity';
import { SemanticDescription } from '../../../../shared/types/world-engine';
import { emitWorldEngineAssetReady } from '../../desktop-sync/companion-presence.helpers';

@ApiTags('world-engine/assets')
@Controller('v1/world-engine/assets')
@UseGuards(JwtAuthGuard, WorldEngineFlagGuard)
@ApiBearerAuth()
export class AssetController {
  private readonly logger = new Logger(AssetController.name);

  constructor(
    private readonly gameEngineService: GameEngineService,
    private readonly agentBindingService: AgentBindingService,
    private readonly marketplaceService: MarketplaceService,
    @InjectRepository(WorldAsset)
    private readonly worldAssetRepository: Repository<WorldAsset>,
    @InjectRepository(Battle)
    private readonly battleRepository: Repository<Battle>,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List user world assets with filtering and sorting' })
  async listAssets(
    @Request() req: any,
    @Query('category') category?: string,
    @Query('source') source?: string,
    @Query('sort') sort?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const userId = req.user?.id || req.user?.sub;
    const pageNum = page ? parseInt(page, 10) : 1;
    const limitNum = limit ? parseInt(limit, 10) : 20;
    const offset = (pageNum - 1) * limitNum;

    // Build query
    const qb = this.worldAssetRepository
      .createQueryBuilder('asset')
      .where('asset.ownerId = :userId', { userId });

    // Apply filters
    if (category) {
      qb.andWhere('asset.category = :category', { category });
    }
    if (source) {
      qb.andWhere('asset.source = :source', { source });
    }

    // Apply sorting
    switch (sort) {
      case 'newest':
        qb.orderBy('asset.createdAt', 'DESC');
        break;
      case 'level':
        qb.orderBy('asset.level', 'DESC');
        break;
      case 'battles':
        qb.orderBy('asset.battleWins + asset.battleLosses', 'DESC');
        break;
      default:
        qb.orderBy('asset.createdAt', 'DESC');
    }

    // Pagination
    qb.skip(offset).take(limitNum);

    const [items, total] = await qb.getManyAndCount();

    return { items, total };
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get world asset detail' })
  async getAsset(@Request() req: any, @Param('id') id: string) {
    const userId = req.user?.id || req.user?.sub;

    // Load asset with all fields
    const asset = await this.worldAssetRepository.findOne({ where: { id } });
    if (!asset) {
      throw new NotFoundException(`World asset ${id} not found`);
    }

    // Include last 20 battle history entries
    const battleHistory = await this.battleRepository
      .createQueryBuilder('battle')
      .where(
        '(battle.challengerAssetId = :assetId OR battle.defenderAssetId = :assetId)',
        { assetId: id },
      )
      .andWhere('battle.status = :status', { status: 'completed' })
      .orderBy('battle.createdAt', 'DESC')
      .take(20)
      .getMany();

    // Include last 20 Agent activity log entries (Phase 1: empty array)
    const agentActivityLog: any[] = [];

    // Collection value estimation for this asset
    const suggestedPrice = await this.estimateAssetValue(asset);

    return {
      ...asset,
      battleHistory,
      agentActivityLog,
      estimatedValue: suggestedPrice,
    };
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update world asset (rename, change style)' })
  async updateAsset(
    @Request() req: any,
    @Param('id') id: string,
    @Body() body: { name?: string; style?: string },
  ) {
    const userId = req.user?.id || req.user?.sub;

    // Load asset and validate ownership
    const asset = await this.worldAssetRepository.findOne({ where: { id } });
    if (!asset) {
      throw new NotFoundException(`World asset ${id} not found`);
    }
    if (asset.ownerId !== userId) {
      throw new ForbiddenException('You do not own this asset');
    }

    // Validate name (max 30 chars)
    if (body.name !== undefined) {
      if (body.name.length === 0) {
        throw new BadRequestException('Name cannot be empty');
      }
      if (body.name.length > 30) {
        throw new BadRequestException('Name must be at most 30 characters');
      }
    }

    // Validate style
    const validStyles = ['cartoon', 'pixel-art', 'fantasy', 'sci-fi', 'realistic'];
    if (body.style !== undefined && !validStyles.includes(body.style)) {
      throw new BadRequestException(
        `Style must be one of: ${validStyles.join(', ')}`,
      );
    }

    // Apply updates
    const updates: Partial<WorldAsset> = {};
    if (body.name !== undefined) {
      updates.name = body.name;
    }
    if (body.style !== undefined) {
      updates.styleType = body.style;
    }

    await this.worldAssetRepository.update(id, updates);

    // Return updated asset
    const updated = await this.worldAssetRepository.findOne({ where: { id } });
    return updated;
  }

  @Post(':id/regenerate')
  @ApiOperation({ summary: 'Regenerate a specific attribute of the world asset' })
  async regenerateAttribute(
    @Request() req: any,
    @Param('id') id: string,
    @Body() body: { target: 'stats' | 'skills' | 'personality' | 'backstory' | 'name' },
  ) {
    const userId = req.user?.id;

    // Load existing asset
    const asset = await this.worldAssetRepository.findOne({
      where: { id, ownerId: userId },
    });
    if (!asset) {
      throw new NotFoundException(`World asset ${id} not found or not owned by user`);
    }

    // Build existing profile from current asset data
    const existingProfile = {
      name: asset.name,
      stats: asset.stats as any,
      skills: asset.skills as any,
      personalityTraits: asset.personalityTraits,
      backstory: asset.backstory || '',
      behaviorTree: asset.behaviorTree as any,
    };

    // Regenerate with target
    const profile = await this.gameEngineService.generateCharacter(
      asset.semanticDescription as unknown as SemanticDescription,
      { regenerateTarget: body.target, existingProfile },
    );

    // Update the asset with regenerated fields
    await this.worldAssetRepository.update(id, {
      name: profile.name,
      stats: profile.stats as any,
      skills: profile.skills as any,
      personalityTraits: profile.personalityTraits,
      backstory: profile.backstory,
      behaviorTree: profile.behaviorTree as any,
    });

    const jobId = uuidv4();
    this.logger.log(`Regenerated ${body.target} for asset ${id}, jobId=${jobId}`);

    return { jobId };
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a world asset' })
  async deleteAsset(@Request() req: any, @Param('id') id: string) {
    const userId = req.user?.id || req.user?.sub;

    // Load asset and validate ownership
    const asset = await this.worldAssetRepository.findOne({ where: { id } });
    if (!asset) {
      throw new NotFoundException(`World asset ${id} not found`);
    }
    if (asset.ownerId !== userId) {
      throw new ForbiddenException('You do not own this asset');
    }

    // Check for active marketplace listing → block with reason
    const activeListing = await this.checkActiveListingExists(id);
    if (activeListing) {
      throw new ConflictException(
        'Cannot delete: this asset has an active marketplace listing. Cancel the listing first.',
      );
    }

    // Check for pending battle challenge → block with reason
    const pendingBattle = await this.battleRepository.findOne({
      where: [
        { challengerAssetId: id, status: 'pending' as any },
        { defenderAssetId: id, status: 'pending' as any },
        { challengerAssetId: id, status: 'active' as any },
        { defenderAssetId: id, status: 'active' as any },
      ],
    });
    if (pendingBattle) {
      throw new ConflictException(
        'Cannot delete: this asset has a pending or active battle challenge. Complete or cancel the battle first.',
      );
    }

    // Phase 1: Just delete (no explicit confirmation dialog — handled by client)
    // Unbind agent if bound
    if (asset.boundAgentId) {
      try {
        await this.agentBindingService.unbindAgent(id, userId);
      } catch (error) {
        this.logger.warn(`Failed to unbind agent during deletion: ${error.message}`);
      }
    }

    await this.worldAssetRepository.delete(id);

    this.logger.log(`Asset ${id} deleted by user ${userId}`);
    return { success: true };
  }

  @Post(':id/generate-character')
  @ApiOperation({ summary: 'Generate character profile from semantic description' })
  async generateCharacter(
    @Request() req: any,
    @Param('id') id: string,
    @Body() body: { semanticDescription: SemanticDescription },
  ) {
    const userId = req.user?.id;

    // Generate character profile from semantic description
    const profile = await this.gameEngineService.generateCharacter(body.semanticDescription);

    // Create or update the WorldAsset record with the generated profile
    const existingAsset = await this.worldAssetRepository.findOne({ where: { id } });

    if (existingAsset) {
      // Update existing asset with generated character data
      await this.worldAssetRepository.update(id, {
        name: profile.name,
        stats: profile.stats as any,
        skills: profile.skills as any,
        personalityTraits: profile.personalityTraits,
        backstory: profile.backstory,
        behaviorTree: profile.behaviorTree as any,
        category: 'character',
        semanticDescription: body.semanticDescription as any,
      });
    } else {
      // Create a new WorldAsset record with the generated profile
      const newAsset = this.worldAssetRepository.create({
        ownerId: userId,
        originalCreatorId: userId,
        name: profile.name,
        category: 'character',
        scanMode: 'quick',
        meshUrl: '',
        styledMeshUrl: '',
        styleType: 'cartoon',
        semanticDescription: body.semanticDescription as any,
        stats: profile.stats,
        skills: profile.skills,
        personalityTraits: profile.personalityTraits,
        backstory: profile.backstory,
        behaviorTree: profile.behaviorTree,
        source: 'scanned',
      } as any);
      (newAsset as any).id = id;
      await this.worldAssetRepository.save(newAsset);
    }

    const jobId = uuidv4();
    this.logger.log(`Generated character for asset ${id}, jobId=${jobId}`);

    // Task 20.6: Attempt agent binding with graceful degradation.
    // If the Agent system is unavailable (service error, NOT quota exceeded),
    // complete the WorldAsset creation in unbound state and inform the client.
    let bindingResult: { agentId?: string; bindingError?: string; retryAvailable?: boolean } = {};

    try {
      const binding = await this.agentBindingService.bindAgent(id, userId);
      bindingResult = { agentId: binding.agentId };
    } catch (error) {
      // Distinguish between quota exceeded (user action needed) vs service errors (retry-able)
      if (error instanceof ForbiddenException) {
        // Quota exceeded — this is a user-facing issue, not a system failure.
        // Don't treat as graceful degradation; let the user know they need to upgrade/unbind.
        bindingResult = {
          bindingError: error.message,
          retryAvailable: false,
        };
      } else {
        // Service error (timeout, internal error, agent system unavailable)
        // Complete the asset creation in unbound state with retry option.
        this.logger.warn(
          `Agent binding failed for asset ${id} (graceful degradation): ${error.message}`,
        );
        bindingResult = {
          bindingError: 'Agent system temporarily unavailable',
          retryAvailable: true,
        };
      }
    }

    // P-9 Companion Redesign — emit world-engine.asset.ready so the user's
    // mobile Companion_Ball Lock_Screen_Pet briefly shows "🐾 你扫的物品已生成"
    // and Conversation_Bubble could pop a follow-up tip. Wrapped to never block
    // asset creation on presence failure.
    try {
      const finalAsset = existingAsset
        ? await this.worldAssetRepository.findOne({ where: { id } })
        : await this.worldAssetRepository.findOne({ where: { id } });
      emitWorldEngineAssetReady({
        assetId: id,
        userId,
        scanSessionId: (finalAsset as any)?.scanSessionId ?? id,
        suggestedPetId: bindingResult.agentId ?? null,
        assetKind: 'character',
        thumbnailUrl: (finalAsset as any)?.thumbnailUrl ?? null,
        readyAt: Date.now(),
      });
    } catch {
      // never block asset generation for presence failure
    }

    return { jobId, estimatedSeconds: 15, ...bindingResult };
  }

  @Post(':id/bind-agent')
  @ApiOperation({ summary: 'Bind an Agentrix Agent to this world asset' })
  async bindAgent(@Request() req: any, @Param('id') id: string) {
    const userId = req.user?.id;
    return this.agentBindingService.bindAgent(id, userId);
  }

  @Delete(':id/unbind-agent')
  @ApiOperation({ summary: 'Unbind the Agent from this world asset' })
  async unbindAgent(@Request() req: any, @Param('id') id: string) {
    const userId = req.user?.id;
    return this.agentBindingService.unbindAgent(id, userId);
  }

  @Get('collection/summary')
  @ApiOperation({ summary: 'Get collection value estimation and badges' })
  async getCollectionSummary(@Request() req: any) {
    const userId = req.user?.id || req.user?.sub;

    // Get all user's assets
    const assets = await this.worldAssetRepository.find({
      where: { ownerId: userId },
    });

    // Sum of suggested prices for all owned assets (simplified estimation)
    let totalEstimatedValue = 0;
    for (const asset of assets) {
      totalEstimatedValue += this.estimateAssetValueSimple(asset);
    }

    // Collection badges: check if user owns at least one in each category
    const categories = new Set(assets.map((a) => a.category));
    const allCategories = ['character', 'dungeon', 'weapon'];
    const badges = allCategories.map((cat) => ({
      category: cat,
      earned: categories.has(cat),
    }));
    const collectionComplete = allCategories.every((cat) => categories.has(cat));

    return {
      totalAssets: assets.length,
      totalEstimatedValue: Math.round(totalEstimatedValue * 100) / 100,
      currency: 'USD',
      badges,
      collectionComplete,
    };
  }

  // ============================================================
  // Private Helpers
  // ============================================================

  /**
   * Check if an asset has an active marketplace listing.
   */
  private async checkActiveListingExists(assetId: string): Promise<boolean> {
    try {
      const listings = await this.marketplaceService.browseListings({});
      return listings.items.some(
        (item) => item.assetId === assetId,
      );
    } catch {
      return false;
    }
  }

  /**
   * Estimate asset value based on stats, battle record, and level.
   */
  private async estimateAssetValue(asset: WorldAsset): Promise<number> {
    return this.estimateAssetValueSimple(asset);
  }

  /**
   * Simple synchronous asset value estimation.
   * Base: 10 USD + level bonus + battle bonus + stat bonus.
   */
  private estimateAssetValueSimple(asset: WorldAsset): number {
    const basePrice = 10;
    const levelBonus = (asset.level - 1) * 2;
    const totalBattles = asset.battleWins + asset.battleLosses;
    const winRate = totalBattles > 0 ? asset.battleWins / totalBattles : 0;
    const battleBonus = Math.min(winRate * totalBattles * 0.5, 100);

    // Stat bonus based on total stats
    const stats = asset.stats as any;
    const totalStats = stats
      ? (stats.hp || 0) + (stats.atk || 0) + (stats.def || 0) + (stats.spd || 0) + (stats.int || 0)
      : 0;
    const statBonus = totalStats > 250 ? (totalStats - 250) * 0.2 : 0;

    return Math.max(0.01, basePrice + levelBonus + battleBonus + statBonus);
  }
}
