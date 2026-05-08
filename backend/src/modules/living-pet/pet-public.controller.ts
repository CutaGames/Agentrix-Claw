import { Controller, Get, NotFoundException, Param } from '@nestjs/common';
import { LivingPetService } from './living-pet.service';
import { PetSoulTemplateService } from '../pet-soul-template/pet-soul-template.service';
import { PetSkinService } from '../pet-skin/pet-skin.service';
import { PetAchievementService } from '../pet-achievement/pet-achievement.service';

/**
 * Phase 1 公共名片 API（无需鉴权）
 *
 *   GET /api/v1/pet/public/:petId           →  { pet, soul, active_skin, lineage, achievements?, share }
 *   GET /api/v1/pet/public/skin/:skinId/lineage  →  { lineage }
 *
 * 用于 Web `/p/[petId]` 页面 SSR + Twitter / Facebook OG 抓取。
 * 仅返回安全字段：name / 灵魂模板 / 亲密度等级 / xp / 皮肤血统 / 公开成就。
 * 不暴露 wallet / 记忆 / 任务历史。
 */
@Controller('v1/pet/public')
export class PetPublicController {
  constructor(
    private readonly petService: LivingPetService,
    private readonly soulService: PetSoulTemplateService,
    private readonly skinService: PetSkinService,
    private readonly achievementService: PetAchievementService,
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

    // P2-8 公开成就 + 分享素材
    let achievements: Array<{ key: string; label: string; icon: string; unlocked_at: number }> = [];
    try {
      const all = await this.achievementService.listForUser(card.user_id);
      achievements = all
        .filter((a) => a.unlocked && a.unlocked_at)
        .sort((a, b) => (b.unlocked_at ?? 0) - (a.unlocked_at ?? 0))
        .slice(0, 12)
        .map((a) => ({
          key: a.key,
          label: a.label_zh || a.label_en,
          icon: a.icon,
          unlocked_at: a.unlocked_at as number,
        }));
    } catch {
      achievements = [];
    }

    const ageDays = Math.max(0, Math.floor((Date.now() - card.created_at) / (24 * 60 * 60 * 1000)));
    const share = {
      title: `${card.name} · lv ${card.intimacy_level}`,
      description: `已陪伴 ${ageDays} 天·${achievements.length} 个成就`,
      og_image: active_skin
        ? `/api/v1/pet/public/${petId}/og.png`
        : null,
    };

    // strip user_id before returning (internal only)
    const { user_id: _u, ...publicPet } = card;
    return { pet: publicPet, soul, active_skin, lineage, achievements, share };
  }

  @Get('skin/:skinId/lineage')
  async lineage(@Param('skinId') skinId: string) {
    const lineage = await this.skinService.getLineage(skinId);
    if (!lineage.length) throw new NotFoundException('skin not found');
    return { lineage };
  }
}
