import { Body, Controller, Get, Inject, Param, Post, Query, Req, UseGuards, forwardRef } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { LivingPetService, PetEmotion } from './living-pet.service';
import { PetSkinService } from '../pet-skin/pet-skin.service';
import { RemixBreedingService } from '../marketplace-pet/remix-breeding.service';
import { PetAchievementService } from '../pet-achievement/pet-achievement.service';
import { PetEnergyService } from '../pet-energy/pet-energy.service';
import { PetCompanionEngineService } from '../pet-companion-engine/pet-companion-engine.service';

/**
 * 顿领 §3.4 主宠 API
 *
 * 路由:
 *   GET  /api/v1/pet/state           当前 user 的主宠状态（自动衰减）
 *   POST /api/v1/pet/emotion         显式设置情绪（内部使用 / Vitals 反应器调用）
 *   POST /api/v1/pet/intimacy        增加亲密度 xp
 *   POST /api/v1/pet/engine/switch   §3.8 切换 primary agent
 */
@UseGuards(JwtAuthGuard)
@Controller('v1/pet')
export class LivingPetController {
  constructor(
    private readonly service: LivingPetService,
    private readonly skinService: PetSkinService,
    private readonly breedingService: RemixBreedingService,
    private readonly achievementService: PetAchievementService,
    private readonly energyService: PetEnergyService,
    @Inject(forwardRef(() => PetCompanionEngineService))
    private readonly companionService: PetCompanionEngineService,
  ) {}

  @Get('state')
  async getState(@Req() req: any) {
    const userId = req.user?.userId || req.user?.sub || req.user?.id;
    const pet = await this.service.getOrCreate(userId);
    return this.service.toDto(pet);
  }

  /**
   * P1-5 统一快照端点。
   *
   * 三端（Web/Mobile/Desktop）在“冷启动 / 重连 / 从后台恢复”时调用以一次拿齐所有
   * pet 核心状态，避免 3-4 个并发 GET 及中间状态闪烁。不包含重型集合（memory/album
   * 另走专端端点）。
   */
  @Get('snapshot')
  async snapshot(@Req() req: any) {
    const userId = req.user?.userId || req.user?.sub || req.user?.id;
    const pet = await this.service.getOrCreate(userId);
    const active = await this.skinService.getActive(userId);
    let activeSkin: unknown = null;
    if (active?.activeSkinId) {
      const skin = await this.skinService.findById(active.activeSkinId);
      if (skin) {
        activeSkin = {
          id: skin.id,
          display_name: skin.displayName,
          url: skin.url,
          thumbnail_url: skin.thumbnailUrl,
          format: skin.format,
          source: skin.source,
        };
      }
    }
    let energy: unknown = null;
    if (active?.activeSkinId) {
      try {
        const state = await this.energyService.getState(userId, active.activeSkinId);
        energy = {
          energy: state.energy,
          paused: (state as any).paused ?? false,
          paused_reason: (state as any).pausedReason ?? null,
          updated_at: state.updatedAt ? state.updatedAt.getTime() : null,
        };
      } catch {
        energy = null;
      }
    }
    let achievements: unknown[] = [];
    try {
      achievements = (await this.achievementService.listForUser(userId)).filter(
        (a: any) => a.unlocked,
      );
    } catch {
      achievements = [];
    }
    return {
      pet: this.service.toDto(pet),
      active_skin: activeSkin,
      energy,
      achievements,
      server_time: Date.now(),
    };
  }

  /**
   * P2-3 统一事件时间线。
   *
   * 合并主动陪伴事件 + 成就解锁 + 宠物快照创建事件为一个 time-sorted 列表，
   * 供 QA 排障、用户查看近期发生了什么。不依赖新表，避免迁移。
   */
  @Get('timeline')
  async timeline(@Req() req: any, @Query('limit') limit?: string) {
    const userId = req.user?.userId || req.user?.sub || req.user?.id;
    const cap = Math.min(100, Math.max(1, Number(limit) || 30));
    const out: Array<{
      ts: number;
      kind: string;
      summary: string;
      meta?: Record<string, unknown>;
    }> = [];

    // 主动陪伴
    try {
      const events = await this.companionService.listRecent(userId, cap);
      for (const e of events) {
        const payload = (e.payload as any) || {};
        out.push({
          ts: e.createdAt.getTime(),
          kind: `proactive.${e.kind}`,
          summary: payload.title || e.suppressedReason || e.kind,
          meta: { status: e.status, suppressed_reason: e.suppressedReason ?? null },
        });
      }
    } catch {
      /* best-effort */
    }

    // 成就解锁
    try {
      const ach = await this.achievementService.listForUser(userId);
      for (const a of ach) {
        if (a.unlocked && a.unlocked_at) {
          out.push({
            ts: a.unlocked_at,
            kind: 'achievement.unlocked',
            summary: a.label_zh || a.key,
            meta: { key: a.key, icon: a.icon },
          });
        }
      }
    } catch {
      /* best-effort */
    }

    out.sort((a, b) => b.ts - a.ts);
    return { items: out.slice(0, cap), server_time: Date.now() };
  }

  @Post('emotion')
  async setEmotion(
    @Req() req: any,
    @Body() body: { emotion: PetEmotion; intensity?: 0 | 1 | 2 | 3 },
  ) {
    const userId = req.user?.userId || req.user?.sub || req.user?.id;
    const pet = await this.service.setEmotion(userId, {
      emotion: body.emotion,
      intensity: body.intensity,
    });
    return this.service.toDto(pet);
  }

  @Post('intimacy')
  async addIntimacy(@Req() req: any, @Body() body: { xp: number }) {
    const userId = req.user?.userId || req.user?.sub || req.user?.id;
    const pet = await this.service.addIntimacyXp(userId, Number(body.xp || 0));
    return this.service.toDto(pet);
  }

  @Post('engine/switch')
  async switchEngine(@Req() req: any, @Body() body: { agentId: string }) {
    const userId = req.user?.userId || req.user?.sub || req.user?.id;
    const pet = await this.service.switchPrimaryAgent(userId, body.agentId);
    return this.service.toDto(pet);
  }

  /**
   * Phase 1：切换灵魂模板（族群人格）。
   * 不丢 intimacy / xp / 记忆 / 钱包 / 任务历史。
   */
  @Post('soul/switch')
  async switchSoul(@Req() req: any, @Body() body: { templateId: string }) {
    const userId = req.user?.userId || req.user?.sub || req.user?.id;
    const pet = await this.service.switchSoul(userId, body?.templateId);
    return this.service.toDto(pet);
  }

  /**
   * Phase 1：激活某只皮肤（VRM / Rive / SVG）。
   * 必须属于当前用户或 platform 全局皮肤。
   */
  @Post('skin/activate')
  async activateSkin(@Req() req: any, @Body() body: { skinId: string }) {
    const userId = req.user?.userId || req.user?.sub || req.user?.id;
    const pet = await this.service.activateSkin(userId, body?.skinId);
    return this.service.toDto(pet);
  }

  /**
   * GET /v1/pet/skins — 列出当前用户拥有的全部皮肤
   * （generated / purchased / remixed / platform）。
   */
  @Get('skins')
  async listSkins(@Req() req: any) {
    const userId = req.user?.userId || req.user?.sub || req.user?.id;
    const skins = await this.skinService.listOwned(userId);
    return { skins };
  }

  /**
   * POST /v1/pet/skins/breed — 双图融合繁殖，产出一只新皮肤 row
   * （生成任务由调用方后续提交到 pet-generation）。
   */
  @Post('skins/breed')
  async breedSkin(
    @Req() req: any,
    @Body()
    body: {
      parentASkinId: string;
      parentBSkinId: string;
      displayName: string;
      desiredRoyaltyRateBps?: number;
    },
  ) {
    const userId = req.user?.userId || req.user?.sub || req.user?.id;
    const skin = await this.breedingService.breed({
      parentASkinId: body?.parentASkinId,
      parentBSkinId: body?.parentBSkinId,
      requesterUserId: userId,
      displayName: body?.displayName,
      desiredRoyaltyRateBps: body?.desiredRoyaltyRateBps,
    });
    return { skin };
  }
}
