/**
 * Unified Marketplace Service
 * 
 * V2.0: 统一市场服务，整合所有 Skill（原生、导入、转换）的搜索和管理
 */

import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, SelectQueryBuilder } from 'typeorm';
import { 
  Skill, 
  SkillStatus, 
  SkillLayer, 
  SkillCategory, 
  SkillResourceType,
  SkillSource,
} from '../../entities/skill.entity';
import { ExternalSkillMapping, SyncStatus } from '../../entities/external-skill-mapping.entity';
import { SkillAnalytics, CallerType, CallPlatform } from '../../entities/skill-analytics.entity';
import { HumanCommissionService } from '../commission/human-commission.service';

export interface UnifiedSearchParams {
  query?: string;
  // Skill 相关过滤
  layer?: SkillLayer[];
  category?: SkillCategory[];
  resourceType?: SkillResourceType[];
  source?: SkillSource[];
  excludeOriginalPlatform?: string[];  // 排除指定原始平台的 skills（如 'openclaw'）
  priceMin?: number;
  priceMax?: number;
  rating?: number;
  humanAccessible?: boolean;
  callerType?: 'agent' | 'human' | 'task'; // 新增 'task' 类型用于搜索任务
  targetPlatform?: 'claude' | 'openai' | 'gemini' | 'grok';
  tags?: string[];
  authorId?: string;
  // 分页和排序
  page?: number;
  limit?: number;
  sortBy?: 'callCount' | 'rating' | 'createdAt' | 'name' | 'budget';
  sortOrder?: 'ASC' | 'DESC';
  // 新增：指定搜索类型
  searchType?: 'skill' | 'task' | 'all'; // 默认 'all'
}

export interface UnifiedSearchResult {
  items: Skill[];
  total: number;
  page: number;
  limit: number;
  facets: {
    layers: Array<{ value: SkillLayer; count: number }>;
    categories: Array<{ value: SkillCategory; count: number }>;
    resourceTypes: Array<{ value: SkillResourceType; count: number }>;
    sources: Array<{ value: SkillSource; count: number }>;
  };
}

export interface TrendingSkill {
  skill: Skill;
  callCount24h: number;
  callCountGrowth: number;
  revenueGenerated: number;
}

export interface SkillAnalyticsSummary {
  totalCalls: number;
  successRate: number;
  avgExecutionTime: number;
  revenueGenerated: number;
  topCallers: Array<{ callerId: string; count: number }>;
  callsByPlatform: Array<{ platform: CallPlatform; count: number }>;
  callsByDay: Array<{ date: string; count: number }>;
}

@Injectable()
export class UnifiedMarketplaceService {
  private readonly logger = new Logger(UnifiedMarketplaceService.name);

  constructor(
    @InjectRepository(Skill)
    private skillRepository: Repository<Skill>,
    @InjectRepository(ExternalSkillMapping)
    private externalMappingRepository: Repository<ExternalSkillMapping>,
    @InjectRepository(SkillAnalytics)
    private analyticsRepository: Repository<SkillAnalytics>,
    private humanCommissionService: HumanCommissionService,
  ) {}

  /**
   * 统一搜索 - 搜索所有类型的 Skill
   */
  async search(params: UnifiedSearchParams): Promise<UnifiedSearchResult> {
    const {
      query,
      layer,
      category,
      resourceType,
      source,
      excludeOriginalPlatform,
      priceMin,
      priceMax,
      rating,
      humanAccessible,
      callerType,
      tags,
      authorId,
      page = 1,
      limit = 20,
      sortBy = 'callCount',
      sortOrder = 'DESC',
    } = params;

    const queryBuilder = this.skillRepository.createQueryBuilder('skill')
      .where('skill.status = :status', { status: SkillStatus.PUBLISHED });

    // 文本搜索
    if (query) {
      queryBuilder.andWhere(
        '(skill.name ILIKE :query OR skill.display_name ILIKE :query OR skill.description ILIKE :query)',
        { query: `%${query}%` }
      );
    }

    // 层级过滤
    if (layer?.length) {
      queryBuilder.andWhere('skill.layer IN (:...layers)', { layers: layer });
    }

    // 分类过滤
    if (category?.length) {
      queryBuilder.andWhere('skill.category IN (:...categories)', { categories: category });
    }

    // 资源类型过滤
    if (resourceType?.length) {
      queryBuilder.andWhere('skill.resource_type IN (:...resourceTypes)', { resourceTypes: resourceType });
    }

    // 来源过滤
    if (source?.length) {
      queryBuilder.andWhere('skill.source IN (:...sources)', { sources: source });
    }

    // 排除指定原始平台（如排除 OpenClaw Hub 同步的 skills）
    if (excludeOriginalPlatform?.length) {
      queryBuilder.andWhere(
        '(skill.original_platform IS NULL OR skill.original_platform NOT IN (:...excludePlatforms))',
        { excludePlatforms: excludeOriginalPlatform },
      );
    }

    // 价格过滤
    if (priceMin !== undefined) {
      queryBuilder.andWhere("(skill.pricing->>'pricePerCall')::numeric >= :priceMin", { priceMin });
    }
    if (priceMax !== undefined) {
      queryBuilder.andWhere("(skill.pricing->>'pricePerCall')::numeric <= :priceMax", { priceMax });
    }

    // 评分过滤
    if (rating !== undefined) {
      queryBuilder.andWhere('skill.rating >= :rating', { rating });
    }

    // Human 可访问性过滤
    if (humanAccessible !== undefined) {
      queryBuilder.andWhere('skill.human_accessible = :humanAccessible', { humanAccessible });
    }

    // 调用者类型影响排序 (Agent 优先看 Logic 层，Human 优先看 Resource 层)
    if (callerType === 'agent') {
      queryBuilder.addOrderBy(
        "CASE WHEN skill.layer = 'logic' THEN 0 WHEN skill.layer = 'infra' THEN 1 ELSE 2 END",
        'ASC'
      );
    } else if (callerType === 'human') {
      queryBuilder.addOrderBy(
        "CASE WHEN skill.layer = 'resource' THEN 0 WHEN skill.layer = 'composite' THEN 1 ELSE 2 END",
        'ASC'
      );
    }

    // 标签过滤
    if (tags?.length) {
      queryBuilder.andWhere('skill.tags && :tags', { tags });
    }

    // 作者过滤
    if (authorId) {
      queryBuilder.andWhere('skill.author_id = :authorId', { authorId });
    }

    // 排序
    const sortColumn = sortBy === 'callCount' ? 'call_count' : 
                      sortBy === 'createdAt' ? 'created_at' : 
                      sortBy;
    queryBuilder.addOrderBy(`skill.${sortColumn}`, sortOrder);

    // 分页
    queryBuilder.skip((page - 1) * limit).take(limit);

    const [items, total] = await queryBuilder.getManyAndCount();

    // 获取 facets
    const facets = await this.getFacets(params);

    return {
      items,
      total,
      page,
      limit,
      facets,
    };
  }

  /**
   * 获取搜索 facets
   */
  private async getFacets(params: UnifiedSearchParams) {
    const baseQuery = this.skillRepository.createQueryBuilder('skill')
      .where('skill.status = :status', { status: SkillStatus.PUBLISHED });

    if (params.query) {
      baseQuery.andWhere(
        '(skill.name ILIKE :query OR skill.display_name ILIKE :query OR skill.description ILIKE :query)',
        { query: `%${params.query}%` }
      );
    }

    // Layer facets
    const layerFacets = await this.skillRepository
      .createQueryBuilder('skill')
      .select('skill.layer', 'value')
      .addSelect('COUNT(*)', 'count')
      .where('skill.status = :status', { status: SkillStatus.PUBLISHED })
      .groupBy('skill.layer')
      .getRawMany();

    // Category facets
    const categoryFacets = await this.skillRepository
      .createQueryBuilder('skill')
      .select('skill.category', 'value')
      .addSelect('COUNT(*)', 'count')
      .where('skill.status = :status', { status: SkillStatus.PUBLISHED })
      .groupBy('skill.category')
      .getRawMany();

    // ResourceType facets
    const resourceTypeFacets = await this.skillRepository
      .createQueryBuilder('skill')
      .select('skill.resource_type', 'value')
      .addSelect('COUNT(*)', 'count')
      .where('skill.status = :status', { status: SkillStatus.PUBLISHED })
      .andWhere('skill.resource_type IS NOT NULL')
      .groupBy('skill.resource_type')
      .getRawMany();

    // Source facets
    const sourceFacets = await this.skillRepository
      .createQueryBuilder('skill')
      .select('skill.source', 'value')
      .addSelect('COUNT(*)', 'count')
      .where('skill.status = :status', { status: SkillStatus.PUBLISHED })
      .groupBy('skill.source')
      .getRawMany();

    return {
      layers: layerFacets,
      categories: categoryFacets,
      resourceTypes: resourceTypeFacets,
      sources: sourceFacets,
    };
  }

  /**
   * 获取热门 Skill
   */
  async getTrending(limit = 10): Promise<TrendingSkill[]> {
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const twoDaysAgo = new Date(Date.now() - 48 * 60 * 60 * 1000);

    // 获取过去 24 小时调用量最高的 Skill
    const trending = await this.analyticsRepository
      .createQueryBuilder('analytics')
      .select('analytics.skill_id', 'skillId')
      .addSelect('COUNT(*)', 'callCount24h')
      .addSelect('SUM(analytics.revenue_generated)', 'revenueGenerated')
      .where('analytics.created_at >= :oneDayAgo', { oneDayAgo })
      .groupBy('analytics.skill_id')
      .orderBy('COUNT(*)', 'DESC')
      .limit(limit)
      .getRawMany();

    // 获取前一天的调用量用于计算增长率
    const previousDayCounts = await this.analyticsRepository
      .createQueryBuilder('analytics')
      .select('analytics.skill_id', 'skillId')
      .addSelect('COUNT(*)', 'count')
      .where('analytics.created_at >= :twoDaysAgo', { twoDaysAgo })
      .andWhere('analytics.created_at < :oneDayAgo', { oneDayAgo })
      .groupBy('analytics.skill_id')
      .getRawMany();

    const previousCountMap = new Map(
      previousDayCounts.map(item => [item.skillId, parseInt(item.count)])
    );

    // 获取 Skill 详情
    const skillIds = trending.map(t => t.skillId);
    const skills = skillIds.length > 0
      ? await this.skillRepository.findByIds(skillIds)
      : [];
    const skillMap = new Map(skills.map(s => [s.id, s]));

    return trending.map(t => {
      const previousCount = previousCountMap.get(t.skillId) || 0;
      const currentCount = parseInt(t.callCount24h);
      const growth = previousCount > 0 
        ? ((currentCount - previousCount) / previousCount) * 100 
        : 100;

      return {
        skill: skillMap.get(t.skillId),
        callCount24h: currentCount,
        callCountGrowth: Math.round(growth * 100) / 100,
        revenueGenerated: parseFloat(t.revenueGenerated) || 0,
      };
    }).filter(t => t.skill);
  }

  /**
   * 获取分类列表
   */
  async getCategories(): Promise<Array<{ category: SkillCategory; count: number; layer: SkillLayer }>> {
    const result = await this.skillRepository
      .createQueryBuilder('skill')
      .select('skill.category', 'category')
      .addSelect('skill.layer', 'layer')
      .addSelect('COUNT(*)', 'count')
      .where('skill.status = :status', { status: SkillStatus.PUBLISHED })
      .groupBy('skill.category')
      .addGroupBy('skill.layer')
      .orderBy('COUNT(*)', 'DESC')
      .getRawMany();

    return result.map(r => ({
      category: r.category,
      layer: r.layer,
      count: parseInt(r.count),
    }));
  }

  /**
   * 获取 Skill 详情
   */
  async getSkillDetail(id: string): Promise<(Skill & { analytics?: SkillAnalyticsSummary }) | null> {
    const skill = await this.skillRepository.findOne({ where: { id } });
    if (!skill) {
      return null;
    }

    // 获取分析数据
    const analytics = await this.getSkillAnalytics(id);

    return {
      ...skill,
      analytics,
    };
  }

  /**
   * 获取 Skill 分析数据
   */
  async getSkillAnalytics(skillId: string, days = 30): Promise<SkillAnalyticsSummary> {
    const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    // 总调用次数和成功率
    const basicStats = await this.analyticsRepository
      .createQueryBuilder('analytics')
      .select('COUNT(*)', 'totalCalls')
      .addSelect('AVG(CASE WHEN analytics.success THEN 1 ELSE 0 END)', 'successRate')
      .addSelect('AVG(analytics.execution_time_ms)', 'avgExecutionTime')
      .addSelect('SUM(analytics.revenue_generated)', 'revenueGenerated')
      .where('analytics.skill_id = :skillId', { skillId })
      .andWhere('analytics.created_at >= :startDate', { startDate })
      .getRawOne();

    // 按平台分组
    const callsByPlatform = await this.analyticsRepository
      .createQueryBuilder('analytics')
      .select('analytics.platform', 'platform')
      .addSelect('COUNT(*)', 'count')
      .where('analytics.skill_id = :skillId', { skillId })
      .andWhere('analytics.created_at >= :startDate', { startDate })
      .groupBy('analytics.platform')
      .orderBy('COUNT(*)', 'DESC')
      .getRawMany();

    // 按天分组
    const callsByDay = await this.analyticsRepository
      .createQueryBuilder('analytics')
      .select("DATE(analytics.created_at)", 'date')
      .addSelect('COUNT(*)', 'count')
      .where('analytics.skill_id = :skillId', { skillId })
      .andWhere('analytics.created_at >= :startDate', { startDate })
      .groupBy("DATE(analytics.created_at)")
      .orderBy('date', 'ASC')
      .getRawMany();

    // Top 调用者
    const topCallers = await this.analyticsRepository
      .createQueryBuilder('analytics')
      .select('analytics.caller_id', 'callerId')
      .addSelect('COUNT(*)', 'count')
      .where('analytics.skill_id = :skillId', { skillId })
      .andWhere('analytics.created_at >= :startDate', { startDate })
      .andWhere('analytics.caller_id IS NOT NULL')
      .groupBy('analytics.caller_id')
      .orderBy('COUNT(*)', 'DESC')
      .limit(10)
      .getRawMany();

    return {
      totalCalls: parseInt(basicStats?.totalCalls) || 0,
      successRate: parseFloat(basicStats?.successRate) || 0,
      avgExecutionTime: parseFloat(basicStats?.avgExecutionTime) || 0,
      revenueGenerated: parseFloat(basicStats?.revenueGenerated) || 0,
      topCallers: topCallers.map(c => ({ callerId: c.callerId, count: parseInt(c.count) })),
      callsByPlatform: callsByPlatform.map(c => ({ platform: c.platform, count: parseInt(c.count) })),
      callsByDay: callsByDay.map(c => ({ date: c.date, count: parseInt(c.count) })),
    };
  }

  /**
   * 记录 Skill 调用
   */
  async recordSkillCall(data: {
    skillId: string;
    callerType: CallerType;
    callerId?: string;
    platform: CallPlatform;
    executionTimeMs?: number;
    success: boolean;
    errorMessage?: string;
    inputParams?: Record<string, any>;
    revenueGenerated?: number;
    commissionAmount?: number;
    orderId?: string;
    sessionId?: string;
    userIpHash?: string;
    userAgent?: string;
    metadata?: Record<string, any>;
  }): Promise<SkillAnalytics> {
    const analytics = this.analyticsRepository.create(data);
    await this.analyticsRepository.save(analytics);

    // 更新 Skill 调用计数
    await this.skillRepository.increment({ id: data.skillId }, 'callCount', 1);

    return analytics;
  }

  /**
   * 获取外部 Skill 映射
   */
  async getExternalMappings(platform?: string): Promise<ExternalSkillMapping[]> {
    const query = this.externalMappingRepository.createQueryBuilder('mapping')
      .leftJoinAndSelect('mapping.agentrixSkill', 'skill')
      .where('mapping.sync_status = :status', { status: SyncStatus.ACTIVE });

    if (platform) {
      query.andWhere('mapping.external_platform = :platform', { platform });
    }

    return query.getMany();
  }

  /**
   * 获取按层级分组的 Skill 统计
   */
  async getStatsByLayer(): Promise<Array<{ layer: SkillLayer; count: number; totalCalls: number }>> {
    const stats = await this.skillRepository
      .createQueryBuilder('skill')
      .select('skill.layer', 'layer')
      .addSelect('COUNT(*)', 'count')
      .addSelect('SUM(skill.call_count)', 'totalCalls')
      .where('skill.status = :status', { status: SkillStatus.PUBLISHED })
      .groupBy('skill.layer')
      .getRawMany();

    return stats.map(s => ({
      layer: s.layer,
      count: parseInt(s.count),
      totalCalls: parseInt(s.totalCalls) || 0,
    }));
  }

  /**
   * 获取平台 Schema (用于 MCP/OpenAPI 等)
   */
  async getPlatformSchema(platform: 'openai' | 'claude' | 'gemini' | 'grok'): Promise<any[]> {
    const skills = await this.skillRepository.find({
      where: { status: SkillStatus.PUBLISHED },
      select: ['id', 'name', 'description', 'platformSchemas'],
    });

    return skills
      .filter(s => s.platformSchemas?.[platform])
      .map(s => s.platformSchemas[platform]);
  }

  /**
   * 执行 Skill
   */
  async executeSkill(
    skillId: string,
    params: Record<string, any>,
    userId?: string,
  ): Promise<any> {
    // Try direct UUID lookup first, then fallback to slug/name search
    let skill = await this.skillRepository.findOne({ where: { id: skillId } });
    if (!skill) {
      // Fallback: search by name, externalSkillId, or slug-like fields
      skill = await this.skillRepository
        .createQueryBuilder('skill')
        .where('skill.status = :status', { status: SkillStatus.PUBLISHED })
        .andWhere(
          '(skill.name ILIKE :q OR skill.display_name ILIKE :q OR skill.external_skill_id = :exact)',
          { q: `%${skillId}%`, exact: skillId },
        )
        .orderBy('skill.call_count', 'DESC')
        .getOne();
    }
    if (!skill) {
      throw new Error(`Skill not found: ${skillId}`);
    }

    // 记录调用 (recordSkillCall 内部已 increment callCount，不要重复)
    await this.recordSkillCall({
      skillId,
      callerType: userId ? CallerType.HUMAN : CallerType.AGENT,
      callerId: userId,
      platform: CallPlatform.AGENTRIX_WEB,
      success: true,
    });

    // 返回模拟执行结果（实际执行逻辑需要根据 skill.executor 类型处理）
    return {
      skillId,
      skillName: skill.displayName || skill.name,
      executedAt: new Date().toISOString(),
      params,
      output: {
        message: `Skill "${skill.displayName || skill.name}" executed successfully`,
        callCount: (skill.callCount || 0) + 1,
      },
    };
  }

  /**
   * 购买 Skill (商品类)
   */
  async purchaseSkill(
    skillId: string,
    userId: string,
    quantity: number = 1,
    paymentMethod?: string,
  ): Promise<any> {
    const skill = await this.skillRepository.findOne({ where: { id: skillId } });
    if (!skill) {
      throw new Error('Skill not found');
    }

    const price = skill.pricing?.pricePerCall || 0;
    const totalAmount = price * quantity;

    // 记录调用（购买也算一次调用, recordSkillCall 内部已 increment callCount）
    await this.recordSkillCall({
      skillId,
      callerType: CallerType.HUMAN,
      callerId: userId,
      platform: CallPlatform.AGENTRIX_WEB,
      success: true,
      revenueGenerated: totalAmount,
    });

    const orderId = `ORD-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const currency = skill.pricing?.currency || 'USD';
    const skillName = skill.displayName || skill.name;
    const frontendBase = process.env.FRONTEND_URL || 'https://www.agentrix.top';

    const requiresPayment = totalAmount > 0;
    const checkoutUrl = requiresPayment
      ? `${frontendBase}/pay/checkout?skillId=${encodeURIComponent(skillId)}&quantity=${quantity}${paymentMethod ? `&method=${encodeURIComponent(paymentMethod)}` : ''}`
      : undefined;

    // 触发人类推广佣金计算
    try {
      await this.humanCommissionService.calculateCommissionForOrder({
        orderId,
        buyerId: userId,
        skillId,
        skillName,
        orderAmount: totalAmount,
        currency,
      });
    } catch (e) {
      this.logger.warn(`Commission calculation failed for order ${orderId}: ${e.message}`);
    }

    return {
      skillId,
      skillName,
      quantity,
      unitPrice: price,
      totalAmount,
      currency,
      status: requiresPayment ? 'pending_payment' : 'completed',
      requiresPayment,
      paymentMethod: paymentMethod || 'web_checkout',
      checkoutUrl,
      purchasedAt: new Date().toISOString(),
      orderId,
    };
  }

  /**
   * 添加到购物车
   */
  async addToCart(
    skillId: string,
    userId: string,
    quantity: number = 1,
  ): Promise<any> {
    const skill = await this.skillRepository.findOne({ where: { id: skillId } });
    if (!skill) {
      throw new Error('Skill not found');
    }

    // 这里应该实际添加到购物车表，暂时返回模拟结果
    return {
      skillId,
      skillName: skill.displayName || skill.name,
      quantity,
      unitPrice: skill.pricing?.pricePerCall || 0,
      currency: skill.pricing?.currency || 'USD',
      addedAt: new Date().toISOString(),
    };
  }
}
