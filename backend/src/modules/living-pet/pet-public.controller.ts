import { Controller, Get, NotFoundException, Param } from '@nestjs/common';
import { LivingPetService } from './living-pet.service';
import { PetSoulTemplateService } from '../pet-soul-template/pet-soul-template.service';

/**
 * Phase 1 公共名片 API（无需鉴权）
 *
 *   GET /api/v1/pet/public/:petId  →  { pet, soul }
 *
 * 用于 Web `/p/[petId]` 页面 SSR + Twitter / Facebook OG 抓取。
 * 仅返回安全字段：name / 灵魂模板 / 亲密度等级 / xp / updated_at。
 * 不暴露 wallet / 记忆 / 任务历史。
 */
@Controller('v1/pet/public')
export class PetPublicController {
  constructor(
    private readonly petService: LivingPetService,
    private readonly soulService: PetSoulTemplateService,
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
    return { pet: card, soul };
  }
}
