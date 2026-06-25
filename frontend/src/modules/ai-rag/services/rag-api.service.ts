import { Injectable, Logger, Inject, forwardRef } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Product } from '../../../entities/product.entity';
import { SearchService } from '../../search/search.service';
import { RecommendationService } from '../../recommendation/recommendation.service';
import {
  RAGSearchRequest,
  RAGSearchResponse,
  ProductRecommendation,
  UserContext,
} from '../interfaces/rag.interface';

@Injectable()
export class RAGAPIService {
  private readonly logger = new Logger(RAGAPIService.name);

  constructor(
    @InjectRepository(Product)
    private productRepository: Repository<Product>,
    @Inject(forwardRef(() => SearchService))
    private searchService: SearchService,
    @Inject(forwardRef(() => RecommendationService))
    private recommendationService: RecommendationService,
  ) {}

  /**
   * RAG 检索接口
   * 整合语义搜索、业务规则过滤、个性化重排序和推荐理由生成
   */
  async search(request: RAGSearchRequest): Promise<RAGSearchResponse> {
    const startTime = Date.now();
    const { query, context, filters, limit = 10, offset = 0 } = request;

    try {
      // 1. 语义搜索（向量检索）
      const vectorSearchStart = Date.now();
      const vectorResults = await this.searchService.semanticSearch(
        query,
        Math.min(limit * 3, 50), // 召回更多候选，后续会重排序
        { type: 'product', ...filters },
      );
      const vectorSearchTime = Date.now() - vectorSearchStart;

      this.logger.debug(`向量搜索找到 ${vectorResults.length} 个候选商品`);

      // 2. 获取商品详细信息
      const productIds = vectorResults.map((r) => r.id);
      const products = await this.productRepository.find({
        where: productIds.map((id) => ({ id, status: 'active' as any })),
      });

      // 3. 业务规则过滤（库存、价格、地区等）
      const filtered = await this.applyBusinessRules(products, filters, context);

      // 4. 个性化重排序
      const rerankStart = Date.now();
      const ranked = await this.personalize(filtered, query, context);
      const rerankTime = Date.now() - rerankStart;

      // 5. 生成推荐理由
      const recommendations = await this.generateReasons(
        ranked.slice(offset, offset + limit),
        query,
        context,
      );

      const totalTime = Date.now() - startTime;

      return {
        query,
        recommendations,
        total: ranked.length,
        context,
        searchMetadata: {
          searchTime: totalTime,
          vectorSearchCount: vectorResults.length,
          rerankTime,
        },
      };
    } catch (error) {
      this.logger.error(`RAG 搜索失败: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * 应用业务规则过滤
   */
  private async applyBusinessRules(
    products: Product[],
    filters?: RAGSearchRequest['filters'],
    context?: UserContext,
  ): Promise<Array<{ product: Product; score: number; metadata: any }>> {
    const results: Array<{ product: Product; score: number; metadata: any }> = [];

    for (const product of products) {
      // 检查库存
      if (filters?.inStock && product.stock <= 0) {
        continue;
      }

      // 检查价格范围
      const price = Number(product.price);
      if (filters?.priceMin && price < filters.priceMin) {
        continue;
      }
      if (filters?.priceMax && price > filters.priceMax) {
        continue;
      }

      // 检查货币
      const currency = (product.metadata as any)?.currency || 'CNY';
      if (filters?.currency && currency !== filters.currency) {
        continue;
      }

      // 检查分类
      if (filters?.category && product.category !== filters.category) {
        continue;
      }

      // 检查商户
      if (filters?.merchantId && product.merchantId !== filters.merchantId) {
        continue;
      }

      // 计算基础分数
      let score = 0.5; // 基础分数

      // 库存充足加分
      if (product.stock > 10) {
        score += 0.1;
      }

      // 价格合理加分（如果用户有价格偏好）
      if (context?.preferences?.priceRange) {
        const { min, max } = context.preferences.priceRange;
        if (min && price >= min && (!max || price <= max)) {
          score += 0.2;
        }
      }

      results.push({
        product,
        score,
        metadata: {
          currency,
          stock: product.stock,
        },
      });
    }

    return results;
  }

  /**
   * 个性化重排序
   */
  private async personalize(
    candidates: Array<{ product: Product; score: number; metadata: any }>,
    query: string,
    context?: UserContext,
  ): Promise<Array<{ product: Product; score: number; metadata: any }>> {
    // 如果没有用户上下文，直接返回按分数排序
    if (!context) {
      return candidates.sort((a, b) => b.score - a.score);
    }

    // 个性化排序
    const personalized = candidates.map((item) => {
      let personalizedScore = item.score;

      // 用户偏好分类匹配
      if (context.preferences?.categories?.includes(item.product.category)) {
        personalizedScore += 0.3;
      }

      // 用户历史购买匹配
      if (context.history?.preferredCategories?.includes(item.product.category)) {
        personalizedScore += 0.2;
      }

      // 用户偏好商户匹配
      if (context.preferences?.preferredMerchants?.includes(item.product.merchantId)) {
        personalizedScore += 0.15;
      }

      // 用户历史购买商户匹配
      if (context.history?.previousPurchases) {
        // 检查是否有相同商户的购买记录
        // 这里简化处理，实际应该查询订单历史
        personalizedScore += 0.1;
      }

      return {
        ...item,
        score: personalizedScore,
      };
    });

    // 按个性化分数排序
    return personalized.sort((a, b) => b.score - a.score);
  }

  /**
   * 生成推荐理由
   * 使用简单的规则生成推荐理由，未来可以集成 LLM
   */
  private async generateReasons(
    products: Array<{ product: Product; score: number; metadata: any }>,
    query: string,
    context?: UserContext,
  ): Promise<ProductRecommendation[]> {
    const recommendations: ProductRecommendation[] = [];

    for (const item of products) {
      const { product, score, metadata } = item;

      // 生成推荐理由
      const reasons: string[] = [];

      // 语义匹配
      if (score > 0.7) {
        reasons.push(`高度匹配您的搜索"${query}"`);
      } else if (score > 0.5) {
        reasons.push(`符合您的搜索需求`);
      }

      // 价格优势
      const price = Number(product.price);
      if (context?.preferences?.priceRange) {
        const { min, max } = context.preferences.priceRange;
        if (min && price >= min && (!max || price <= max)) {
          reasons.push(`价格在您的预算范围内`);
        }
      }

      // 库存充足
      if (product.stock > 10) {
        reasons.push(`库存充足，可立即发货`);
      }

      // 分类匹配
      if (context?.preferences?.categories?.includes(product.category)) {
        reasons.push(`属于您偏好的分类`);
      }

      // 商户偏好
      if (context?.preferences?.preferredMerchants?.includes(product.merchantId)) {
        reasons.push(`来自您信任的商户`);
      }

      // 默认理由
      if (reasons.length === 0) {
        reasons.push(`相关商品推荐`);
      }

      const reason = reasons.join('；');

      // 计算相关性因子
      const relevanceFactors = {
        semanticMatch: score,
        priceMatch: context?.preferences?.priceRange
          ? this.calculatePriceMatch(price, context.preferences.priceRange)
          : 0.5,
        categoryMatch: context?.preferences?.categories?.includes(product.category) ? 0.8 : 0.5,
        userPreference: this.calculateUserPreference(product, context),
      };

      recommendations.push({
        productId: product.id,
        product: {
          id: product.id,
          name: product.name,
          description: product.description || undefined,
          price,
          currency: metadata.currency || 'CNY',
          category: product.category,
          stock: product.stock,
          merchantId: product.merchantId,
          metadata: product.metadata,
        },
        score,
        reason,
        relevanceFactors,
      });
    }

    return recommendations;
  }

  /**
   * 计算价格匹配度
   */
  private calculatePriceMatch(price: number, priceRange: { min?: number; max?: number }): number {
    if (!priceRange.min && !priceRange.max) {
      return 0.5;
    }

    if (priceRange.min && price < priceRange.min) {
      return 0.2; // 低于最低价
    }

    if (priceRange.max && price > priceRange.max) {
      return 0.3; // 高于最高价
    }

    // 在范围内，计算接近度
    if (priceRange.min && priceRange.max) {
      const range = priceRange.max - priceRange.min;
      const center = priceRange.min + range / 2;
      const distance = Math.abs(price - center);
      return Math.max(0.5, 1 - distance / range);
    }

    return 0.8; // 在范围内
  }

  /**
   * 计算用户偏好匹配度
   */
  private calculateUserPreference(product: Product, context?: UserContext): number {
    if (!context) {
      return 0.5;
    }

    let score = 0.5;

    // 分类偏好
    if (context.preferences?.categories?.includes(product.category)) {
      score += 0.2;
    }

    // 商户偏好
    if (context.preferences?.preferredMerchants?.includes(product.merchantId)) {
      score += 0.2;
    }

    // 历史偏好
    if (context.history?.preferredCategories?.includes(product.category)) {
      score += 0.1;
    }

    return Math.min(1, score);
  }
}

