import { Body, Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { LivingPetService, PetEmotion } from './living-pet.service';
import { PetSkinService } from '../pet-skin/pet-skin.service';
import { RemixBreedingService } from '../marketplace-pet/remix-breeding.service';

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
  ) {}

  @Get('state')
  async getState(@Req() req: any) {
    const userId = req.user?.userId || req.user?.sub || req.user?.id;
    const pet = await this.service.getOrCreate(userId);
    return this.service.toDto(pet);
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
