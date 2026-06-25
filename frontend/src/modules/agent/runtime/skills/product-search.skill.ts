import { Injectable, Inject, forwardRef } from '@nestjs/common';
import { ISkill, SkillResult, SkillContext } from '../interfaces/skill.interface';
import { MemoryType } from '../../../../entities/agent-memory.entity';
import { CapabilityExecutorService } from '../../../ai-capability/services/capability-executor.service';

@Injectable()
export class ProductSearchSkill implements ISkill {
  id = 'product_search';
  name = '商品搜索';
  description = '搜索和比价商品';
  supportedIntents = ['product_search', 'search', 'buy', 'purchase', 'find'];

  constructor(
    @Inject(forwardRef(() => CapabilityExecutorService))
    private capabilityExecutor: CapabilityExecutorService,
  ) {}

  async execute(params: Record<string, any>, context: SkillContext): Promise<SkillResult> {
    try {
      const { query } = params;

      if (!query || query.trim().length === 0) {
        return {
          success: false,
          message: '请告诉我您想搜索什么商品？例如："帮我找跑步鞋"',
        };
      }

      // 使用统一执行器执行搜索
      const result = await this.capabilityExecutor.execute(
        'executor_search',
        params,
        {
          userId: context.userId,
          sessionId: context.sessionId,
        },
      );

      if (!result.success) {
        return {
          success: false,
          message: result.message || '搜索失败',
          error: result.error,
        };
      }

      const { products, query: searchQuery, total, priceComparison } = result.data || {};

      // 保存搜索结果到 Memory（Skill 特有的逻辑）
      if (context.memory && products && Array.isArray(products)) {
        await context.memory.saveMemory(
          context.sessionId,
          MemoryType.ENTITY,
          'last_search_products',
          {
            query: searchQuery || query,
            products,
            timestamp: new Date(),
          },
          {
            importance: 0.9,
            tags: ['product_search', 'products'],
          },
        );
      }

      // 构建商品列表摘要（包含价格和比价信息）
      const productSummary = products
        ?.slice(0, 5)
        .map((p: any, idx: number) => {
          const priceStr = p.priceDisplay || `${p.currency === 'CNY' ? '¥' : p.currency === 'USD' ? '$' : ''}${p.price?.toFixed(2) || '0.00'}`;
          return `${idx + 1}. ${p.name} - ${priceStr}`;
        })
        .join('\n') || '';

      // 添加比价信息到消息
      let priceComparisonText = '';
      if (priceComparison) {
        priceComparisonText = `\n\n💰 比价信息：\n• 最低价：${priceComparison.cheapest?.priceDisplay || priceComparison.cheapest?.price} (${priceComparison.cheapest?.name})\n• 最高价：${priceComparison.mostExpensive?.priceDisplay || priceComparison.mostExpensive?.price} (${priceComparison.mostExpensive?.name})\n• 平均价：${priceComparison.averagePrice || 'N/A'}`;
      }

      const message = products && products.length > 0
        ? `找到 ${total || products.length} 个相关商品：\n\n${productSummary}${products.length > 5 ? `\n\n还有 ${products.length - 5} 个商品...` : ''}${priceComparisonText}\n\n💡 下一步操作：\n• 说"第一个"、"第二个"等来加入购物车\n• 说"查看详情 1"查看第一个商品的详细信息\n• 说"继续搜索 [关键词]"搜索其他商品`
        : `抱歉，没有找到与"${query}"相关的商品。请尝试其他关键词。\n\n💡 提示：\n• 尝试使用更通用的关键词，如"手机"、"耳机"、"鞋子"等\n• 说"搜索 [商品名称]"来重新搜索`;

      return {
        success: true,
        message,
        data: {
          products: products || [],
          query: searchQuery || query,
          count: total || products?.length || 0,
          total: total || products?.length || 0,
          priceComparison, // 包含比价信息
        },
      };
    } catch (error: any) {
      const errorMessage = error?.message || error?.toString() || 'Unknown error';
      return {
        success: false,
        error: errorMessage,
        message: `搜索商品时出现错误：${errorMessage}`,
      };
    }
  }
}

