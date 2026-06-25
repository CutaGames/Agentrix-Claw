/**
 * Skill Recommendation Service
 * 
 * Phase 4: 智能 Skill 推荐引擎
 */

import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Skill, SkillStatus, SkillLayer, SkillCategory } from '../../entities/skill.entity';
import { SkillAnalytics, CallerType } from '../../entities/skill-analytics.entity';

export interface RecommendationContext {
  userId?: string;
  agentId?: string;
  currentSkillId?: string;
  userIntent?: string;
  recentSkills?: string[];
  callerType?: CallerType;
  budget?: number;
  preferredCategories?: SkillCategory[];
  preferredLayers?: SkillLayer[];
}

export interface RecommendedSkill {
  skill: Skill;
  score: number;
  reason: string;
  matchType: 'intent' | 'collaborative' | 'similar' | 'trending' | 'complementary';
}

export interface RecommendationResult {
  recommendations: RecommendedSkill[];
  context: RecommendationContext;
  generatedAt: Date;
}

@Injectable()
export class SkillRecommendationService {
  private readonly logger = new Logger(SkillRecommendationService.name);

  constructor(
    @InjectRepository(Skill)
    private skillRepository: Repository<Skill>,
    @InjectRepository(SkillAnalytics)
    private analyticsRepository: Repository<SkillAnalytics>,
  ) {}

  /**
   * 获取个性化推荐
   */
  async getRecommendations(
    context: RecommendationContext,
    limit = 10,
  ): Promise<RecommendationResult> {
    this.logger.log(`Generating recommendations for context: ${JSON.stringify(context)}`);

    const recommendations: RecommendedSkill[] = [];

    // 1. 基于意图的推荐
    if (context.userIntent) {
      const intentBased = await this.getIntentBasedRecommendations(context.userIntent, limit);
      recommendations.push(...intentBased);
    }

    // 2. 协同过滤推荐
    if (context.userId || context.agentId) {
      const collaborative = await this.getCollaborativeRecommendations(context, limit);
      recommendations.push(...collaborative);
    }

    // 3. 相似 Skill 推荐
    if (context.currentSkillId) {
      const similar = await this.getSimilarSkillRecommendations(context.currentSkillId, limit);
      recommendations.push(...similar);
    }

    // 4. 热门推荐
    const trending = await this.getTrendingRecommendations(context, limit);
    recommendations.push(...trending);

    // 5. 互补 Skill 推荐
    if (context.recentSkills?.length) {
      const complementary = await this.getComplementaryRecommendations(context.recentSkills, limit);
      recommendations.push(...complementary);
    }

    // 去重并排序
    const uniqueRecommendations = this.deduplicateAndSort(recommendations, limit);

    return {
      recommendations: uniqueRecommendations,
      context,
      generatedAt: new Date(),
    };
  }

  /**
   * 基于意图的推荐
   */
  private async getIntentBasedRecommendations(
    intent: string,
    limit: number,
  ): Promise<RecommendedSkill[]> {
    // 使用全文搜索匹配意图
    const skills = await this.skillRepository
      .createQueryBuilder('skill')
      .where('skill.status = :status', { status: SkillStatus.PUBLISHED })
      .andWhere(
        '(skill.name ILIKE :intent OR skill.display_name ILIKE :intent OR skill.description ILIKE :intent)',
        { intent: `%${intent}%` }
      )
      .orderBy('skill.call_count', 'DESC')
      .limit(limit)
      .getMany();

    return skills.map((skill, index) => ({
      skill,
      score: 1 - (index * 0.1),
      reason: `Matches your intent: "${intent}"`,
      matchType: 'intent' as const,
    }));
  }

  /**
   * 协同过滤推荐
   */
  private async getCollaborativeRecommendations(
    context: RecommendationContext,
    limit: number,
  ): Promise<RecommendedSkill[]> {
    const callerId = context.userId || context.agentId;
    if (!callerId) return [];

    // 找到与当前用户/Agent 行为相似的其他用户/Agent 使用的 Skill
    const similarCallers = await this.analyticsRepository
      .createQueryBuilder('a1')
      .select('a2.callerId', 'similarCallerId')
      .addSelect('COUNT(*)', 'commonSkills')
      .innerJoin(
        SkillAnalytics,
        'a2',
        'a1.skillId = a2.skillId AND a1.callerId != a2.callerId'
      )
      .where('a1.callerId = :callerId', { callerId })
      .groupBy('a2.callerId')
      .orderBy('COUNT(*)', 'DESC')
      .limit(10)
      .getRawMany();

    if (similarCallers.length === 0) return [];

    const similarCallerIds = similarCallers.map(c => c.similarCallerId);

    // 获取相似用户使用但当前用户未使用的 Skill
    const recommendedSkillIds = await this.analyticsRepository
      .createQueryBuilder('analytics')
      .select('analytics.skillId', 'skillId')
      .addSelect('COUNT(*)', 'useCount')
      .where('analytics.callerId IN (:...callerIds)', { callerIds: similarCallerIds })
      .andWhere(
        `analytics.skillId NOT IN (
          SELECT DISTINCT skillId FROM skill_analytics WHERE callerId = :callerId
        )`,
        { callerId }
      )
      .groupBy('analytics.skillId')
      .orderBy('COUNT(*)', 'DESC')
      .limit(limit)
      .getRawMany();

    const skillIds = recommendedSkillIds.map(r => r.skillId);
    if (skillIds.length === 0) return [];

    const skills = await this.skillRepository.findByIds(skillIds);
    const skillMap = new Map(skills.map(s => [s.id, s]));

    return recommendedSkillIds.map((r, index) => ({
      skill: skillMap.get(r.skillId)!,
      score: 0.8 - (index * 0.05),
      reason: 'Popular among similar users',
      matchType: 'collaborative' as const,
    })).filter(r => r.skill);
  }

  /**
   * 相似 Skill 推荐
   */
  private async getSimilarSkillRecommendations(
    skillId: string,
    limit: number,
  ): Promise<RecommendedSkill[]> {
    const currentSkill = await this.skillRepository.findOne({ where: { id: skillId } });
    if (!currentSkill) return [];

    // 基于分类、层级、标签的相似性
    const skills = await this.skillRepository
      .createQueryBuilder('skill')
      .where('skill.status = :status', { status: SkillStatus.PUBLISHED })
      .andWhere('skill.id != :skillId', { skillId })
      .andWhere(
        '(skill.category = :category OR skill.layer = :layer OR skill.tags && :tags)',
        {
          category: currentSkill.category,
          layer: currentSkill.layer,
          tags: currentSkill.tags || [],
        }
      )
      .orderBy('skill.callCount', 'DESC')
      .limit(limit)
      .getMany();

    return skills.map((skill, index) => {
      const categoryMatch = skill.category === currentSkill.category;
      const layerMatch = skill.layer === currentSkill.layer;
      const tagOverlap = (skill.tags || []).filter(t => (currentSkill.tags || []).includes(t)).length;
      
      const score = (categoryMatch ? 0.3 : 0) + (layerMatch ? 0.3 : 0) + (tagOverlap * 0.1);

      return {
        skill,
        score: Math.min(score, 1),
        reason: `Similar to ${currentSkill.displayName || currentSkill.name}`,
        matchType: 'similar' as const,
      };
    });
  }

  /**
   * 热门推荐
   */
  private async getTrendingRecommendations(
    context: RecommendationContext,
    limit: number,
  ): Promise<RecommendedSkill[]> {
    const query = this.skillRepository
      .createQueryBuilder('skill')
      .where('skill.status = :status', { status: SkillStatus.PUBLISHED });

    // 应用偏好过滤
    if (context.preferredCategories?.length) {
      query.andWhere('skill.category IN (:...categories)', {
        categories: context.preferredCategories,
      });
    }

    if (context.preferredLayers?.length) {
      query.andWhere('skill.layer IN (:...layers)', {
        layers: context.preferredLayers,
      });
    }

    if (context.budget !== undefined) {
      query.andWhere(
        "(skill.pricing->>'pricePerCall')::numeric <= :budget OR skill.pricing->>'type' = 'free'",
        { budget: context.budget }
      );
    }

    // 根据调用者类型调整排序
    if (context.callerType === CallerType.AGENT) {
      query.addOrderBy(
        "CASE WHEN skill.layer = 'logic' THEN 0 WHEN skill.layer = 'infra' THEN 1 ELSE 2 END",
        'ASC'
      );
    } else if (context.callerType === CallerType.HUMAN) {
      query.addOrderBy(
        "CASE WHEN skill.layer = 'resource' THEN 0 WHEN skill.layer = 'composite' THEN 1 ELSE 2 END",
        'ASC'
      );
    }

    query.addOrderBy('skill.callCount', 'DESC').limit(limit);

    const skills = await query.getMany();

    return skills.map((skill, index) => ({
      skill,
      score: 0.6 - (index * 0.03),
      reason: 'Trending in the marketplace',
      matchType: 'trending' as const,
    }));
  }

  /**
   * 互补 Skill 推荐
   */
  private async getComplementaryRecommendations(
    recentSkillIds: string[],
    limit: number,
  ): Promise<RecommendedSkill[]> {
    if (recentSkillIds.length === 0) return [];

    // 找到经常与最近使用的 Skill 一起使用的其他 Skill
    const complementarySkillIds = await this.analyticsRepository
      .createQueryBuilder('a1')
      .select('a2.skillId', 'skillId')
      .addSelect('COUNT(*)', 'coOccurrence')
      .innerJoin(
        SkillAnalytics,
        'a2',
        'a1.sessionId = a2.sessionId AND a1.skillId != a2.skillId'
      )
      .where('a1.skillId IN (:...skillIds)', { skillIds: recentSkillIds })
      .andWhere('a2.skillId NOT IN (:...skillIds)', { skillIds: recentSkillIds })
      .groupBy('a2.skillId')
      .orderBy('COUNT(*)', 'DESC')
      .limit(limit)
      .getRawMany();

    const skillIds = complementarySkillIds.map(r => r.skillId);
    if (skillIds.length === 0) return [];

    const skills = await this.skillRepository.findByIds(skillIds);
    const skillMap = new Map(skills.map(s => [s.id, s]));

    return complementarySkillIds.map((r, index) => ({
      skill: skillMap.get(r.skillId)!,
      score: 0.7 - (index * 0.05),
      reason: 'Often used together with your recent skills',
      matchType: 'complementary' as const,
    })).filter(r => r.skill);
  }

  /**
   * 去重并排序
   */
  private deduplicateAndSort(
    recommendations: RecommendedSkill[],
    limit: number,
  ): RecommendedSkill[] {
    const seen = new Set<string>();
    const unique: RecommendedSkill[] = [];

    // 按分数排序
    recommendations.sort((a, b) => b.score - a.score);

    for (const rec of recommendations) {
      if (!seen.has(rec.skill.id)) {
        seen.add(rec.skill.id);
        unique.push(rec);
        if (unique.length >= limit) break;
      }
    }

    return unique;
  }

  /**
   * 获取 "你可能还需要" 推荐
   */
  async getYouMayAlsoNeed(skillId: string, limit = 5): Promise<RecommendedSkill[]> {
    return this.getSimilarSkillRecommendations(skillId, limit);
  }

  /**
   * 获取 "购买此商品的人还买了" 推荐
   */
  async getAlsoBought(skillId: string, limit = 5): Promise<RecommendedSkill[]> {
    // 找到购买了当前 Skill 的用户还购买了哪些 Skill
    const alsoBoughtIds = await this.analyticsRepository
      .createQueryBuilder('a1')
      .select('a2.skillId', 'skillId')
      .addSelect('COUNT(DISTINCT a1.callerId)', 'buyerCount')
      .innerJoin(
        SkillAnalytics,
        'a2',
        'a1.callerId = a2.callerId AND a1.skillId != a2.skillId'
      )
      .where('a1.skillId = :skillId', { skillId })
      .andWhere('a1.orderId IS NOT NULL')
      .andWhere('a2.orderId IS NOT NULL')
      .groupBy('a2.skillId')
      .orderBy('COUNT(DISTINCT a1.callerId)', 'DESC')
      .limit(limit)
      .getRawMany();

    const skillIds = alsoBoughtIds.map(r => r.skillId);
    if (skillIds.length === 0) return [];

    const skills = await this.skillRepository.findByIds(skillIds);
    const skillMap = new Map(skills.map(s => [s.id, s]));

    return alsoBoughtIds.map((r, index) => ({
      skill: skillMap.get(r.skillId)!,
      score: 0.9 - (index * 0.1),
      reason: 'Customers who bought this also bought',
      matchType: 'collaborative' as const,
    })).filter(r => r.skill);
  }
}
