import { Injectable, Inject, forwardRef, Logger } from '@nestjs/common';
import { ICapabilityExecutor } from './executor.interface';
import { ExecutionContext, ExecutionResult } from '../interfaces/capability.interface';
import { SearchService } from '../../search/search.service';
import { ProductService } from '../../product/product.service';
import { formatProductsForDisplay } from '../../product/utils/product-formatter';

/**
 * 比价服务执行器
 * 提供详细的商品比价分析
 */
@Injectable()
export class PriceComparisonExecutor implements ICapabilityExecutor {
  name = 'executor_compare';
  private readonly logger = new Logger(PriceComparisonExecutor.name);

  constructor(
    @Inject(forwardRef(() => SearchService))
    private searchService: SearchService,
    @Inject(forwardRef(() => ProductService))
    private productService: ProductService,
  ) {}

  async execute(params: Record<string, any>, context: ExecutionContext): Promise<ExecutionResult> {
    try {
      const { query, category, priceMin, priceMax, currency } = params;

      // 如果没有查询词，尝试从上下文中获取最近的搜索结果
      let searchQuery = query;
      if (!searchQuery && context.metadata?.lastSearchQuery) {
        searchQuery = context.metadata.lastSearchQuery;
      }

      if (!searchQuery || typeof searchQuery !== 'string' || searchQuery.trim().length === 0) {
        return {
          success: false,
          error: 'INVALID_PARAMS',
          message: '请提供要比较的商品查询词，或先搜索商品',
        };
      }

      // 构建搜索过滤器
      const filters: Record<string, any> = { type: 'product' };
      if (category) filters.category = category;
      if (priceMin !== undefined) filters.priceMin = priceMin;
      if (priceMax !== undefined) filters.priceMax = priceMax;
      if (currency) filters.currency = currency;

      this.logger.log(`比价查询: ${searchQuery}`, filters);

      // 执行语义搜索（比价需要更多结果）
      const searchResults = await this.searchService.semanticSearch(searchQuery, 50, filters);

      if (searchResults.length === 0) {
        return {
          success: true,
          data: {
            products: [],
            query: searchQuery,
            total: 0,
            comparison: null,
          },
          message: `抱歉，没有找到与"${searchQuery}"相关的商品进行比价。`,
        };
      }

      // 获取商品详情
      const productIds = searchResults.map((r) => r.id);
      const products = await Promise.all(
        productIds.map((id) => this.productService.getProduct(id).catch(() => null)),
      );

      // 按搜索结果的顺序排序，过滤掉不存在的商品
      const sortedProducts = products.filter(Boolean);

      // 提取搜索分数
      const scores = searchResults.map((r) => r.score);

      // 使用统一格式化函数格式化商品信息
      const formattedProducts = formatProductsForDisplay(sortedProducts, {
        scores,
      });

      // 计算详细比价信息
      const comparison = this.calculateDetailedComparison(formattedProducts);

      return {
        success: true,
        data: {
          products: formattedProducts,
          query: searchQuery,
          total: formattedProducts.length,
          comparison, // 详细比价信息
        },
        message: `已为 ${formattedProducts.length} 个商品进行比价分析`,
      };
    } catch (error: any) {
      this.logger.error(`比价服务失败: ${error.message}`, error.stack);
      return {
        success: false,
        error: 'COMPARISON_ERROR',
        message: `比价分析时出现错误：${error.message}`,
      };
    }
  }

  /**
   * 计算详细比价信息
   */
  private calculateDetailedComparison(products: any[]): any {
    if (products.length === 0) {
      return null;
    }

    const prices = products.map((p) => p.price).filter((p) => p !== undefined && p !== null);
    if (prices.length === 0) {
      return null;
    }

    // 基础统计
    const cheapest = products.reduce((min, p) => (p.price < min.price ? p : min), products[0]);
    const mostExpensive = products.reduce((max, p) => (p.price > max.price ? p : max), products[0]);
    const averagePrice = prices.reduce((sum, p) => sum + p, 0) / prices.length;
    const medianPrice = this.calculateMedian(prices);
    const priceRange = {
      min: Math.min(...prices),
      max: Math.max(...prices),
      range: Math.max(...prices) - Math.min(...prices),
    };

    // 价格分布
    const priceDistribution = this.calculatePriceDistribution(products);

    // 最佳性价比（综合考虑价格和相关性分数）
    const bestValue = this.calculateBestValue(products, averagePrice);

    // 价格区间统计
    const priceSegments = this.calculatePriceSegments(products);

    return {
      cheapest: {
        id: cheapest.id,
        name: cheapest.name,
        price: cheapest.price,
        priceDisplay: cheapest.priceDisplay,
        currency: cheapest.currency,
        score: cheapest.score,
      },
      mostExpensive: {
        id: mostExpensive.id,
        name: mostExpensive.name,
        price: mostExpensive.price,
        priceDisplay: mostExpensive.priceDisplay,
        currency: mostExpensive.currency,
        score: mostExpensive.score,
      },
      averagePrice: parseFloat(averagePrice.toFixed(2)),
      medianPrice: parseFloat(medianPrice.toFixed(2)),
      priceRange,
      priceDistribution,
      bestValue,
      priceSegments,
      totalProducts: products.length,
      recommendations: this.generateRecommendations(products, cheapest, mostExpensive, averagePrice),
    };
  }

  /**
   * 计算中位数
   */
  private calculateMedian(numbers: number[]): number {
    const sorted = [...numbers].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 === 0
      ? (sorted[mid - 1] + sorted[mid]) / 2
      : sorted[mid];
  }

  /**
   * 计算价格分布
   */
  private calculatePriceDistribution(products: any[]): any {
    const prices = products.map((p) => p.price);
    const min = Math.min(...prices);
    const max = Math.max(...prices);
    const range = max - min;
    const segmentSize = range / 5; // 分为5个区间

    const segments = Array.from({ length: 5 }, (_, i) => ({
      range: `${(min + i * segmentSize).toFixed(2)} - ${(min + (i + 1) * segmentSize).toFixed(2)}`,
      count: products.filter((p) => {
        const price = p.price;
        return price >= min + i * segmentSize && price < min + (i + 1) * segmentSize;
      }).length,
    }));

    return {
      segments,
      min,
      max,
      range,
    };
  }

  /**
   * 计算最佳性价比
   */
  private calculateBestValue(products: any[], averagePrice: number): any {
    // 综合考虑价格和相关性分数
    const scored = products.map((p) => {
      const priceScore = 1 - Math.abs(p.price - averagePrice) / averagePrice; // 价格越接近平均价越好
      const relevanceScore = p.score || 0.5; // 相关性分数
      const totalScore = priceScore * 0.4 + relevanceScore * 0.6; // 相关性权重更高
      return { product: p, score: totalScore };
    });

    const best = scored.reduce((max, item) => (item.score > max.score ? item : max), scored[0]);

    return {
      id: best.product.id,
      name: best.product.name,
      price: best.product.price,
      priceDisplay: best.product.priceDisplay,
      currency: best.product.currency,
      score: best.score,
      reason: '综合考虑价格和相关性，性价比最优',
    };
  }

  /**
   * 计算价格区间统计
   */
  private calculatePriceSegments(products: any[]): any[] {
    const prices = products.map((p) => p.price);
    const min = Math.min(...prices);
    const max = Math.max(...prices);
    const range = max - min;
    const segmentSize = range / 3; // 分为3个区间：低价、中价、高价

    return [
      {
        label: '低价',
        range: `${min.toFixed(2)} - ${(min + segmentSize).toFixed(2)}`,
        count: products.filter((p) => p.price < min + segmentSize).length,
        products: products
          .filter((p) => p.price < min + segmentSize)
          .slice(0, 3)
          .map((p) => ({ id: p.id, name: p.name, price: p.price, priceDisplay: p.priceDisplay })),
      },
      {
        label: '中价',
        range: `${(min + segmentSize).toFixed(2)} - ${(min + segmentSize * 2).toFixed(2)}`,
        count: products.filter(
          (p) => p.price >= min + segmentSize && p.price < min + segmentSize * 2,
        ).length,
        products: products
          .filter((p) => p.price >= min + segmentSize && p.price < min + segmentSize * 2)
          .slice(0, 3)
          .map((p) => ({ id: p.id, name: p.name, price: p.price, priceDisplay: p.priceDisplay })),
      },
      {
        label: '高价',
        range: `${(min + segmentSize * 2).toFixed(2)} - ${max.toFixed(2)}`,
        count: products.filter((p) => p.price >= min + segmentSize * 2).length,
        products: products
          .filter((p) => p.price >= min + segmentSize * 2)
          .slice(0, 3)
          .map((p) => ({ id: p.id, name: p.name, price: p.price, priceDisplay: p.priceDisplay })),
      },
    ];
  }

  /**
   * 生成推荐建议
   */
  private generateRecommendations(
    products: any[],
    cheapest: any,
    mostExpensive: any,
    averagePrice: number,
  ): string[] {
    const recommendations: string[] = [];

    if (cheapest.price < averagePrice * 0.8) {
      recommendations.push(`💰 发现超值商品：${cheapest.name}，价格低于市场平均价20%以上`);
    }

    if (mostExpensive.price > averagePrice * 1.5) {
      recommendations.push(`⚠️ 注意：${mostExpensive.name} 价格较高，建议对比其他选项`);
    }

    const inStockCount = products.filter((p) => p.inStock).length;
    if (inStockCount < products.length * 0.5) {
      recommendations.push(`📦 部分商品缺货，建议尽快下单`);
    }

    return recommendations;
  }
}

