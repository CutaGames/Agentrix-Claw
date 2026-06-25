import { Injectable, Logger, Inject, forwardRef } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Product } from '../../entities/product.entity';
import { UserProfile } from '../../entities/user-profile.entity';
import { AgentSession } from '../../entities/agent-session.entity';
import { SearchService } from '../search/search.service';
import { ProductService } from '../product/product.service';

export interface RecommendationContext {
  userId?: string;
  sessionId?: string;
  currentQuery?: string;
  entities?: Record<string, any>;
  conversationHistory?: any[];
}

export interface RecommendationResult {
  products: Array<{
    id: string;
    name: string;
    description?: string;
    price: number;
    currency: string;
    score: number;
    reason: string; // 推荐理由
    source: 'user_profile' | 'context' | 'popular' | 'similar';
  }>;
  services?: Array<{
    id: string;
    name: string;
    type: string;
    price: number;
    score: number;
    reason: string;
  }>;
  assets?: Array<{
    id: string;
    name: string;
    type: string;
    price: number;
    score: number;
    reason: string;
  }>;
}

@Injectable()
export class RecommendationService {
  private readonly logger = new Logger(RecommendationService.name);

  constructor(
    @InjectRepository(Product)
    private productRepository: Repository<Product>,
    @InjectRepository(UserProfile)
    private userProfileRepository: Repository<UserProfile>,
    @InjectRepository(AgentSession)
    private sessionRepository: Repository<AgentSession>,
    @Inject(forwardRef(() => SearchService))
    private searchService: SearchService,
    @Inject(forwardRef(() => ProductService))
    private productService: ProductService,
  ) {}

  /**
   * 情景感知推荐（V3.0：基于上下文、用户画像、行为特征）
   */
  async getContextualRecommendations(
    context: RecommendationContext,
    limit: number = 10,
  ): Promise<RecommendationResult> {
    try {
      const recommendations: RecommendationResult = {
        products: [],
      };

      // 1. 获取用户画像
      let userProfile = null;
      if (context.userId) {
        userProfile = await this.userProfileRepository.findOne({
          where: { userId: context.userId },
        });
      }

      // 2. 获取会话上下文
      let sessionContext = null;
      if (context.sessionId) {
        const session = await this.sessionRepository.findOne({
          where: { id: context.sessionId },
        });
        sessionContext = (session as any)?.context;
      }

      // 3. 基于用户画像的推荐
      if (userProfile) {
        const profileRecommendations = await this.getProfileBasedRecommendations(
          userProfile,
          limit,
        );
        recommendations.products.push(...profileRecommendations);
      }

      // 4. 基于上下文的推荐
      if (sessionContext && context.currentQuery) {
        const contextRecommendations = await this.getContextBasedRecommendations(
          sessionContext,
          context.currentQuery,
          context.entities,
          limit,
        );
        recommendations.products.push(...contextRecommendations);
      }

      // 5. 基于相似商品的推荐（协同过滤）
      if (context.entities?.productId) {
        const similarRecommendations = await this.getSimilarRecommendations(
          context.entities.productId,
          limit,
        );
        recommendations.products.push(...similarRecommendations);
      }

      // 6. 热门推荐（如果其他推荐不足）
      if (recommendations.products.length < limit) {
        const popularRecommendations = await this.getPopularRecommendations(
          limit - recommendations.products.length,
        );
        recommendations.products.push(...popularRecommendations);
      }

      // 7. 去重和排序
      const uniqueProducts = this.deduplicateAndSort(recommendations.products, limit);

      return {
        products: uniqueProducts,
      };
    } catch (error) {
      this.logger.error('获取推荐失败:', error);
      return { products: [] };
    }
  }

  /**
   * 基于用户画像的推荐
   */
  private async getProfileBasedRecommendations(
    profile: UserProfile,
    limit: number,
  ): Promise<RecommendationResult['products']> {
    const recommendations: RecommendationResult['products'] = [];

    // 基于偏好分类
    if (profile.preferences?.categories && profile.preferences.categories.length > 0) {
      const products = await this.productRepository
        .createQueryBuilder('product')
        .where('product.category IN (:...categories)', {
          categories: profile.preferences.categories,
        })
        .andWhere('product.status = :status', { status: 'active' })
        .orderBy('product.createdAt', 'DESC')
        .limit(limit)
        .getMany();

      for (const product of products) {
        recommendations.push({
          id: product.id,
          name: product.name,
          description: product.description || '',
          price: Number(product.price),
          currency: (product.metadata as any)?.currency || 'CNY',
          score: 0.8, // 基于用户偏好的高分
          reason: `基于您的偏好分类：${product.category}`,
          source: 'user_profile',
        });
      }
    }

    // 基于价格范围
    if (profile.preferences?.priceRange) {
      const { min, max, currency } = profile.preferences.priceRange;
      const priceFiltered = await this.productRepository
        .createQueryBuilder('product')
        .where('product.price >= :min', { min: min || 0 })
        .andWhere('product.price <= :max', { max: max || 999999 })
        .andWhere('product.status = :status', { status: 'active' })
        .orderBy('product.price', 'ASC')
        .limit(limit)
        .getMany();

      for (const product of priceFiltered) {
        if (!recommendations.find(r => r.id === product.id)) {
          recommendations.push({
            id: product.id,
            name: product.name,
            description: product.description || '',
            price: Number(product.price),
            currency: currency || 'CNY',
            score: 0.7,
            reason: '符合您的价格偏好',
            source: 'user_profile',
          });
        }
      }
    }

    return recommendations;
  }

  /**
   * 基于上下文的推荐
   */
  private async getContextBasedRecommendations(
    sessionContext: any,
    query: string,
    entities?: Record<string, any>,
    limit: number = 10,
  ): Promise<RecommendationResult['products']> {
    const recommendations: RecommendationResult['products'] = [];

    // 使用语义搜索
    const searchResults = await this.searchService.semanticSearch(query, limit, {
      type: 'product',
      ...entities,
    });

    for (const result of searchResults) {
      const product = await this.productRepository.findOne({
        where: { id: result.id },
      });

      if (product) {
        recommendations.push({
          id: product.id,
          name: product.name,
          description: product.description || '',
          price: Number(product.price),
          currency: (product.metadata as any)?.currency || 'CNY',
          score: result.score || 0.6,
          reason: `与您的查询"${query}"相关`,
          source: 'context',
        });
      }
    }

    // 基于会话中提到的实体推荐
    if (sessionContext?.entities) {
      const contextEntities = sessionContext.entities;
      if (contextEntities.category) {
        const categoryProducts = await this.productRepository
          .createQueryBuilder('product')
          .where('product.category = :category', { category: contextEntities.category })
          .andWhere('product.status = :status', { status: 'active' })
          .orderBy('product.createdAt', 'DESC')
          .limit(5)
          .getMany();

        for (const product of categoryProducts) {
          if (!recommendations.find(r => r.id === product.id)) {
            recommendations.push({
              id: product.id,
              name: product.name,
              description: product.description || '',
              price: Number(product.price),
              currency: (product.metadata as any)?.currency || 'CNY',
              score: 0.75,
              reason: `基于对话中提到的分类：${contextEntities.category}`,
              source: 'context',
            });
          }
        }
      }
    }

    return recommendations;
  }

  /**
   * 基于相似商品的推荐（协同过滤）
   */
  private async getSimilarRecommendations(
    productId: string,
    limit: number,
  ): Promise<RecommendationResult['products']> {
    const recommendations: RecommendationResult['products'] = [];

    // 获取当前商品
    const currentProduct = await this.productRepository.findOne({
      where: { id: productId },
    });

    if (!currentProduct) {
      return recommendations;
    }

    // 查找同分类的商品
    const similarProducts = await this.productRepository
      .createQueryBuilder('product')
      .where('product.category = :category', { category: currentProduct.category })
      .andWhere('product.id != :id', { id: productId })
      .andWhere('product.status = :status', { status: 'active' })
      .orderBy('product.createdAt', 'DESC')
      .limit(limit)
      .getMany();

    for (const product of similarProducts) {
      recommendations.push({
        id: product.id,
        name: product.name,
        description: product.description || '',
        price: Number(product.price),
        currency: (product.metadata as any)?.currency || 'CNY',
        score: 0.7,
        reason: `与"${currentProduct.name}"相似的商品`,
        source: 'similar',
      });
    }

    return recommendations;
  }

  /**
   * 热门推荐
   */
  private async getPopularRecommendations(
    limit: number,
  ): Promise<RecommendationResult['products']> {
    const recommendations: RecommendationResult['products'] = [];

    // 获取最近创建的热门商品（可以根据订单量等指标优化）
    const popularProducts = await this.productRepository
      .createQueryBuilder('product')
      .where('product.status = :status', { status: 'active' })
      .orderBy('product.createdAt', 'DESC')
      .limit(limit)
      .getMany();

    for (const product of popularProducts) {
      recommendations.push({
        id: product.id,
        name: product.name,
        description: product.description || '',
        price: Number(product.price),
        currency: (product.metadata as any)?.currency || 'CNY',
        score: 0.5,
        reason: '热门商品',
        source: 'popular',
      });
    }

    return recommendations;
  }

  /**
   * 去重和排序
   */
  private deduplicateAndSort(
    products: RecommendationResult['products'],
    limit: number,
  ): RecommendationResult['products'] {
    // 去重
    const uniqueMap = new Map<string, RecommendationResult['products'][0]>();
    for (const product of products) {
      const existing = uniqueMap.get(product.id);
      if (!existing || product.score > existing.score) {
        uniqueMap.set(product.id, product);
      }
    }

    // 排序（按分数降序）
    const sorted = Array.from(uniqueMap.values()).sort((a, b) => b.score - a.score);

    return sorted.slice(0, limit);
  }

  /**
   * 更新用户画像（基于行为）
   */
  async updateUserProfile(
    userId: string,
    behavior: {
      viewedProductId?: string;
      purchasedProductId?: string;
      orderId?: string;
    },
  ): Promise<void> {
    try {
      let profile = await this.userProfileRepository.findOne({
        where: { userId },
      });

      if (!profile) {
        profile = this.userProfileRepository.create({
          userId,
          preferences: {},
          behavior: {
            totalOrders: 0,
            totalSpent: 0,
            browsingHistory: [],
            purchaseHistory: [],
          },
        });
      }

      // 更新浏览历史
      if (behavior.viewedProductId) {
        if (!profile.behavior.browsingHistory) {
          profile.behavior.browsingHistory = [];
        }
        profile.behavior.browsingHistory.push({
          productId: behavior.viewedProductId,
          timestamp: new Date(),
        });
        // 只保留最近100条
        profile.behavior.browsingHistory = profile.behavior.browsingHistory.slice(-100);
      }

      // 更新购买历史
      if (behavior.purchasedProductId && behavior.orderId) {
        if (!profile.behavior.purchaseHistory) {
          profile.behavior.purchaseHistory = [];
        }
        profile.behavior.purchaseHistory.push({
          productId: behavior.purchasedProductId,
          orderId: behavior.orderId,
          timestamp: new Date(),
        });

        // 更新统计
        profile.behavior.totalOrders = (profile.behavior.totalOrders || 0) + 1;
      }

      await this.userProfileRepository.save(profile);
    } catch (error) {
      this.logger.error('更新用户画像失败:', error);
    }
  }
}

