import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PetSkinService } from './pet-skin.service';

/**
 * 用户皮肤资产 API
 *
 *   GET  /api/v1/pet/skins                          我拥有的皮肤（含平台共享）
 *   GET  /api/v1/pet/skins/active                   当前激活皮肤
 *   POST /api/v1/pet/skins/upload                   V4 §3.2 用户上传自定义皮肤
 *   GET  /api/v1/pet/skins/marketplace              V4 §3.2 皮肤市场列表
 *   POST /api/v1/pet/skins/marketplace/:id/install  V4 §3.2 从市场安装到用户库
 *
 * 注：激活操作走 /api/v1/pet/skin/activate（在 LivingPetController），
 *     以保证情绪 / 灵魂 / 皮肤的状态机统一。
 */
@UseGuards(JwtAuthGuard)
@Controller('v1/pet/skins')
export class PetSkinController {
  constructor(private readonly service: PetSkinService) {}

  @Get()
  async listOwned(@Req() req: any) {
    const userId = req.user?.userId || req.user?.sub || req.user?.id;
    const items = await this.service.listOwned(userId);
    return { items: items.map((s) => this.service.toDto(s)) };
  }

  @Get('active')
  async active(@Req() req: any) {
    const userId = req.user?.userId || req.user?.sub || req.user?.id;
    const active = await this.service.getActive(userId);
    return { active_skin_id: active?.activeSkinId ?? null };
  }

  @Get('marketplace')
  async marketplace(
    @Req() req: any,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
    @Query('source') source?: 'platform' | 'generated' | 'remixed',
  ) {
    const userId = req.user?.userId || req.user?.sub || req.user?.id;
    const { items, total } = await this.service.listMarketplace({
      limit: limit ? parseInt(limit, 10) : undefined,
      offset: offset ? parseInt(offset, 10) : undefined,
      source,
      excludeUserId: userId,
    });
    return { items: items.map((s) => this.service.toDto(s)), total };
  }

  /** Pet Phase 6 S4 — 商店试穿预览（不扣费、5min token） */
  @Get('preview/:skinId')
  async preview(@Req() req: any, @Param('skinId') skinId: string) {
    const userId = req.user?.userId || req.user?.sub || req.user?.id;
    const skin = await this.service.findById(skinId);
    if (!skin) return { ok: false, error: 'skin_not_found' };
    if (skin.visibility === 'private' && skin.ownerUserId !== userId) {
      return { ok: false, error: 'forbidden' };
    }
    const issuedAt = Date.now();
    const expiresAt = issuedAt + 5 * 60 * 1000;
    return {
      ok: true,
      skin: this.service.toDto(skin),
      preview_token: `pv_${skinId}_${userId}_${issuedAt}`,
      expires_at: expiresAt,
    };
  }

  @Post('marketplace/:skinId/install')
  async install(
    @Req() req: any,
    @Param('skinId') skinId: string,
    @Body() body: { acknowledgedPriceCents?: number } = {},
  ) {
    const userId = req.user?.userId || req.user?.sub || req.user?.id;
    const installed = await this.service.installFromMarketplace(userId, skinId, {
      acknowledgedPriceCents: body?.acknowledgedPriceCents,
    });
    return { skin: this.service.toDto(installed) };
  }

  @Get('marketplace/:skinId/royalty-preview')
  async royaltyPreview(@Req() req: any, @Param('skinId') skinId: string) {
    const userId = req.user?.userId || req.user?.sub || req.user?.id;
    const preview = await this.service.previewRoyaltySplit(skinId, userId);
    if (!preview) return { ok: false, error: 'skin_not_found' };
    return { ok: true, ...preview };
  }

  @Post(':skinId/visibility')
  async setVisibility(
    @Req() req: any,
    @Param('skinId') skinId: string,
    @Body() body: { visibility: 'public' | 'private' | 'unlisted' },
  ) {
    const userId = req.user?.userId || req.user?.sub || req.user?.id;
    const skin = await this.service.setVisibility(userId, skinId, body.visibility);
    return { skin: this.service.toDto(skin) };
  }

  @Post(':skinId/price')
  async setPrice(
    @Req() req: any,
    @Param('skinId') skinId: string,
    @Body() body: { priceCents: number },
  ) {
    const userId = req.user?.userId || req.user?.sub || req.user?.id;
    const skin = await this.service.setPrice(userId, skinId, body.priceCents);
    return { skin: this.service.toDto(skin) };
  }

  @Post(':skinId/moderate')
  async moderate(
    @Req() req: any,
    @Param('skinId') skinId: string,
    @Body() body: { status: 'approved' | 'rejected'; reason?: string },
  ) {
    // V4 §3.2 — admin only. Reuses platform admin role check via JwtAuthGuard +
    // user.role inspection (kept simple here; full RBAC handled by AdminGuard
    // elsewhere in the codebase — wire it in once that lands for skins).
    const role = req.user?.role || req.user?.roles?.[0];
    if (role !== 'admin' && role !== 'platform_admin') {
      return { ok: false, error: 'admin_required' };
    }
    const skin = await this.service.moderate(skinId, body.status, body.reason);
    if (!skin) return { ok: false, error: 'skin_not_found' };
    return { ok: true, skin: this.service.toDto(skin) };
  }

  @Post('upload')
  async upload(
    @Req() req: any,
    @Body()
    body: {
      displayName: string;
      url: string;
      format?: 'svg' | 'rive' | 'vrm' | 'live2d';
      thumbnailUrl?: string;
      manifest?: Record<string, unknown>;
    },
  ) {
    const userId = req.user?.userId || req.user?.sub || req.user?.id;
    const skin = await this.service.registerUpload(userId, body);
    return { skin: this.service.toDto(skin) };
  }
}
