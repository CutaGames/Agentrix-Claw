import {
  Controller,
  Get,
  Post,
  Query,
  Request,
  UseGuards,
  Logger,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { WorldEngineFlagGuard } from '../guards/world-engine-flag.guard';
import { WorldSimService } from '../services/world-sim.service';
import { WorldAsset } from '../entities/world-asset.entity';
import { LivingPet } from '../../../entities/living-pet.entity';
import type {
  WorldFeedResponse,
  WorldResidentState,
} from '../../../../shared/types/world-engine';
/**
 * WorldFeedController — 活世界 feed (Phase A2)。
 *
 * GET  /v1/world-engine/world/feed  — 先推进世界(离线快进), 再返回事件流 + 居民状态。
 * POST /v1/world-engine/world/tick  — 手动推进一次(调试/前台主动刷新)。
 *
 * 移动端 World tab 从"功能宫格"改为"世界 feed"时调用 GET feed。
 */
@ApiTags('world-engine/world')
@Controller('v1/world-engine/world')
@UseGuards(JwtAuthGuard, WorldEngineFlagGuard)
@ApiBearerAuth()
export class WorldFeedController {
  private readonly logger = new Logger(WorldFeedController.name);

  constructor(
    private readonly worldSim: WorldSimService,
    @InjectRepository(WorldAsset)
    private readonly worldAssetRepo: Repository<WorldAsset>,
    @InjectRepository(LivingPet)
    private readonly livingPetRepo: Repository<LivingPet>,
  ) {}

  @Get('feed')
  @ApiOperation({ summary: '获取活世界 feed(先离线快进推进, 再返回事件流 + 居民状态)' })
  async getFeed(
    @Request() req: any,
    @Query('limit') limit?: string,
  ): Promise<WorldFeedResponse> {
    const userId = req.user?.id || req.user?.sub;

    // 游客不落库活世界(与"保存时才登录"决策一致):返回空 feed + NPC(让游客也看到热闹小镇)。
    const isGuest = req.user?.isGuest === true || req.user?.type === 'guest';
    if (isGuest) {
      const npcs = this.worldSim.getTownNpcs();
      return {
        newEventCount: 0,
        events: [],
        residents: [],
        npcs,
        town: { name: '星语小镇', population: npcs.length, mainPet: null },
      };
    }

    // 1) 推进世界(离线快进, 内部按 lastTickAt 补算)
    let newEventCount = 0;
    try {
      const r = await this.worldSim.tick(userId);
      newEventCount = r.newEventCount;
    } catch (e) {
      this.logger.warn(`world tick failed for ${userId}: ${(e as Error).message}`);
    }

    // 2) 读事件流
    const limitNum = limit ? parseInt(limit, 10) : 50;
    const events = await this.worldSim.getRecentEvents(userId, limitNum);

    // 3) 读居民状态摘要
    const residentAssets = await this.worldAssetRepo.find({
      where: { ownerId: userId, category: 'character' },
      order: { createdAt: 'DESC' },
    });

    // 4) 主宠(灵魂载体)摘要
    let mainPet: { name: string; intimacyLevel: number; emotion: string } | null = null;
    try {
      const pet = await this.livingPetRepo.findOne({ where: { userId } });
      if (pet) {
        mainPet = { name: pet.name, intimacyLevel: pet.intimacyLevel, emotion: pet.emotion };
      }
    } catch {
      /* best-effort */
    }

    const npcs = this.worldSim.getTownNpcs();
    const residents = residentAssets.map((a) => ({
      assetId: a.id,
      name: a.name,
      level: a.level,
      portraitUrl: (a as any).portraitUrl ?? null,
      state: (a.worldState as unknown as WorldResidentState) ?? {
        job: 'drifter',
        mood: 'calm',
        activity: '刚来到这个世界',
        location: '中央广场',
        axp: 0,
      },
    }));

    return {
      newEventCount,
      events: events.map((e) => ({
        id: e.id,
        actorAssetId: e.actorAssetId,
        actorName: e.actorName,
        type: e.type as any,
        summary: e.summary,
        outcome: e.outcome as any,
        deltaXp: e.deltaXp,
        deltaAxp: e.deltaAxp,
        relatedAssetId: null,
        createdAt: e.createdAt.toISOString(),
      })),
      residents,
      npcs,
      town: {
        name: '星语小镇',
        population: residents.length + npcs.length,
        mainPet,
      },
    };
  }

  @Post('tick')
  @ApiOperation({ summary: '手动推进一次活世界(调试/前台主动刷新)' })
  async tick(@Request() req: any): Promise<{ newEventCount: number }> {
    const userId = req.user?.id || req.user?.sub;
    const isGuest = req.user?.isGuest === true || req.user?.type === 'guest';
    if (isGuest) return { newEventCount: 0 };
    return this.worldSim.tick(userId);
  }
}
