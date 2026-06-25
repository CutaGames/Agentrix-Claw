import { Injectable, Inject, forwardRef, Logger } from '@nestjs/common';
import { ICapabilityExecutor } from './executor.interface';
import { ExecutionContext, ExecutionResult } from '../interfaces/capability.interface';
import { SearchService } from '../../search/search.service';
import { ProductService } from '../../product/product.service';
import { formatProductsForDisplay } from '../../product/utils/product-formatter';

/**
 * 商品搜索执行器
 * 统一处理所有平台的商品搜索请求
 */
@Injectable()
export class SearchProductsExecutor implements ICapabilityExecutor {
  name = 'executor_search';
  private readonly logger = new Logger(SearchProductsExecutor.name);

  constructor(
    @Inject(forwardRef(() => SearchService))
    private searchService: SearchService,
    @Inject(forwardRef(() => ProductService))
    private productService: ProductService,
  ) {}

  async execute(params: Record<string, any>, context: ExecutionContext): Promise<ExecutionResult> {
    try {
      const { query, category, priceMin, priceMax, currency, inStock } = params;

      // 参数验证
      if (!query || typeof query !== 'string' || query.trim().length === 0) {
        return {
          success: false,
          error: 'INVALID_PARAMS',
          message: '搜索查询不能为空',
        };
      }

      // 构建搜索过滤器
      const filters: Record<string, any> = { type: 'product' };
      if (category) filters.category = category;
      if (priceMin !== undefined) filters.priceMin = priceMin;
      if (priceMax !== undefined) filters.priceMax = priceMax;
      if (currency) filters.currency = currency;
      if (inStock !== undefined) filters.inStock = inStock;

      this.logger.log(`搜索商品: ${query}`, filters);

      // 执行语义搜索
      const searchResults = await this.searchService.semanticSearch(query, 20, filters);

      if (searchResults.length === 0) {
        return {
          success: true,
          data: {
            products: [],
            query,
            total: 0,
            priceComparison: null,
          },
          message: `抱歉，没有找到与"${query}"相关的商品。请尝试其他关键词。`,
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

      // 使用统一格式化函数格式化商品信息（包含图片）
      const formattedProducts = formatProductsForDisplay(sortedProducts, {
        scores,
      });

      // 计算基础比价信息（自动包含）
      const priceComparison = this.calculatePriceComparison(formattedProducts);

      return {
        success: true,
        data: {
          products: formattedProducts,
          query,
          total: formattedProducts.length,
          priceComparison, // 自动包含基础比价信息
        },
        message: `找到 ${formattedProducts.length} 个相关商品`,
      };
    } catch (error: any) {
      this.logger.error(`商品搜索失败: ${error.message}`, error.stack);
      return {
        success: false,
        error: 'SEARCH_ERROR',
        message: `搜索商品时出现错误：${error.message}`,
      };
    }
  }

  /**
   * 计算基础比价信息
   */
  private calculatePriceComparison(products: any[]): any {
    if (products.length === 0) {
      return null;
    }

    const prices = products.map((p) => p.price).filter((p) => p !== undefined && p !== null);
    if (prices.length === 0) {
      return null;
    }

    const cheapest = products.reduce((min, p) => (p.price < min.price ? p : min), products[0]);
    const mostExpensive = products.reduce((max, p) => (p.price > max.price ? p : max), products[0]);
    const averagePrice = prices.reduce((sum, p) => sum + p, 0) / prices.length;
    const priceRange = {
      min: Math.min(...prices),
      max: Math.max(...prices),
    };

    return {
      cheapest: {
        id: cheapest.id,
        name: cheapest.name,
        price: cheapest.price,
        priceDisplay: cheapest.priceDisplay,
      },
      mostExpensive: {
        id: mostExpensive.id,
        name: mostExpensive.name,
        price: mostExpensive.price,
        priceDisplay: mostExpensive.priceDisplay,
      },
      averagePrice: parseFloat(averagePrice.toFixed(2)),
      priceRange,
      totalProducts: products.length,
    };
  }
}

