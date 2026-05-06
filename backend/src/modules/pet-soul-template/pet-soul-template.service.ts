import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PetSoulTemplate } from '../../entities/pet-soul-template.entity';

export interface ListSoulsQuery {
  clan?: string;
  planLevel?: 'free' | 'pro' | 'pro_plus' | 'enterprise';
}

/**
 * PetSoulTemplateService — 灵魂模板 CRUD + 计划过滤
 *
 * 职责：
 *  - 列出可用灵魂（按族群 / 计划过滤）
 *  - 取单只灵魂详情（用于 LLM systemPrompt 渲染）
 *  - 校验模板 enabled
 *
 * 不负责：
 *  - 切换 LivingPet.soulTemplateId（由 LivingPetService.switchSoul）
 *  - SystemPrompt 渲染（由 LivingPetService 合并 personalityOverrides + 用户记忆）
 */
@Injectable()
export class PetSoulTemplateService {
  private readonly logger = new Logger(PetSoulTemplateService.name);

  constructor(
    @InjectRepository(PetSoulTemplate)
    private readonly soulRepo: Repository<PetSoulTemplate>,
  ) {}

  async list(query: ListSoulsQuery = {}): Promise<PetSoulTemplate[]> {
    const qb = this.soulRepo
      .createQueryBuilder('s')
      .where('s.enabled = :enabled', { enabled: true });
    if (query.clan) {
      qb.andWhere('s.clan = :clan', { clan: query.clan });
    }
    qb.orderBy('s.tier', 'ASC').addOrderBy('s.id', 'ASC');
    const items = await qb.getMany();
    if (!query.planLevel || query.planLevel === 'pro_plus' || query.planLevel === 'enterprise') {
      return items;
    }
    // free / pro 过滤逻辑（Phase 1 简化：tier=high_arpu 仅 pro+ 可见？这里先全部返回）
    // 真正的计划锁定在 V4 W3 配额模块接入后细化。
    return items;
  }

  async get(id: string): Promise<PetSoulTemplate> {
    const tpl = await this.soulRepo.findOne({ where: { id } });
    if (!tpl) throw new NotFoundException(`pet soul template not found: ${id}`);
    if (!tpl.enabled) {
      throw new NotFoundException(`pet soul template disabled: ${id}`);
    }
    return tpl;
  }

  async findById(id: string): Promise<PetSoulTemplate | null> {
    return this.soulRepo.findOne({ where: { id } });
  }

  toDto(tpl: PetSoulTemplate) {
    return {
      id: tpl.id,
      clan: tpl.clan,
      display_name: tpl.displayName,
      display_name_en: tpl.displayNameEn,
      tagline: tpl.tagline,
      archetype: tpl.archetype,
      tone_keywords: tpl.toneKeywords,
      forbidden_tone: tpl.forbiddenTone,
      default_skill_tags: tpl.defaultSkillTags,
      tool_whitelist: tpl.toolWhitelist,
      budget_daily_usd: Number(tpl.budgetDailyUSD),
      budget_per_task_usd: Number(tpl.budgetPerTaskUSD),
      default_idle_emotion: tpl.defaultIdleEmotion,
      emotion_tendency: tpl.emotionTendency,
      recommended_skin_tags: tpl.recommendedSkinTags,
      marketing_hook: tpl.marketingHook,
      tier: tpl.tier,
      age_rating: tpl.ageRating,
      compliance_flags: tpl.complianceFlags,
      version: tpl.version,
    };
  }
}
