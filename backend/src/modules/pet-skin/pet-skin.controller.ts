import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PetSkinService } from './pet-skin.service';

/**
 * 用户皮肤资产 API
 *
 *   GET  /api/v1/pet/skins                我拥有的皮肤（含平台共享）
 *   GET  /api/v1/pet/skins/active         当前激活皮肤
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
}
