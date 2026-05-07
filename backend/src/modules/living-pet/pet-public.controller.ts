import { Controller, Get, NotFoundException, Param } from '@nestjs/common';
import { LivingPetService } from './living-pet.service';
import { PetSoulTemplateService } from '../pet-soul-template/pet-soul-template.service';
import { PetSkinService } from '../pet-skin/pet-skin.service';

/**
 * Phase 1 公共名片 API（无需鉴权）
 *
 *   GET /api/v1/pet/public/:petId           →  { pet, soul, active_skin, lineage }
 *   GET /api/v1/pet/public/skin/:skinId/lineage  →  { lineage }
 *
 * 用于 Web `/p/[petId]` 页面 SSR + Twitter / Facebook OG 抓取。
 * 仅返回安全字段：name / 灵魂模板 / 亲密度等级 / xp / 皮肤血统。
 * 不暴露 wallet / 记忆 / 任务历史。
 */
@Controller('v1/pet/public')
export class PetPublicController {
  constructor(
    private readonly petService: LivingPetService,
    private readonly soulService: PetSoulTemplateService,
    private readonly skinService: PetSkinService,
  ) {}

  @Get(':petId')
  async card(@Param('petId') petId: string) {
    const card = await this.petService.findPublicCard(petId);
    if (!card) throw new NotFoundException('pet not found');
    let soul: any = null;
    if (card.soul_template_id) {
      const tpl = await this.soulService.findById(card.soul_template_id);
      if (tpl) soul = this.soulService.toDto(tpl);
    }
    let active_skin: { id: string; display_name: string } | null = null;
    let lineage: Awaited<ReturnType<PetSkinService['getLineage']>> = [];
    try {
      const active = await this.skinService.getActive(card.user_id);
      if (active?.activeSkinId) {
        const skin = await this.skinService.findById(active.activeSkinId);
        if (skin) {
          active_skin = { id: skin.id, display_name: skin.displayName };
          lineage = await this.skinService.getLineage(skin.id);
        }
      }
    } catch {
      // best-effort; skin/lineage is non-critical for public card
    }
    // strip user_id before returning (internal only)
    const { user_id: _u, ...publicPet } = card;
    return { pet: publicPet, soul, active_skin, lineage };
  }

  @Get('skin/:skinId/lineage')
  async lineage(@Param('skinId') skinId: string) {
    const lineage = await this.skinService.getLineage(skinId);
    if (!lineage.length) throw new NotFoundException('skin not found');
    return { lineage };
  }
}
