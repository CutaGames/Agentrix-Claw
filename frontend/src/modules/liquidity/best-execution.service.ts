import { Injectable, Logger } from '@nestjs/common';
import { ILiquidityProvider, PriceQuoteRequest, PriceQuote, SwapRequest } from './interfaces/liquidity-provider.interface';

export interface BestExecutionResult {
  bestQuote: PriceQuote;
  allQuotes: PriceQuote[];
  executionStrategy: {
    splitOrders?: Array<{
      provider: string;
      amount: string;
      percentage: number;
    }>;
    reason: string;
  };
}

/**
 * 最优执行流算法
 * 跨DEX价格聚合，选择最优执行路径
 */
@Injectable()
export class BestExecutionService {
  private readonly logger = new Logger(BestExecutionService.name);
  private liquidityProviders: ILiquidityProvider[] = [];

  /**
   * 设置流动性提供者列表（由LiquidityMeshService调用）
   */
  setProviders(providers: ILiquidityProvider[]): void {
    this.liquidityProviders = providers;
  }

  /**
   * 获取最优执行报价
   * 聚合所有流动性提供者的报价，选择最优路径
   */
  async getBestExecution(
    request: PriceQuoteRequest,
  ): Promise<BestExecutionResult> {
    this.logger.log(`获取最优执行: ${JSON.stringify(request)}`);

    // 1. 获取所有提供者的报价
    const quotes = await this.getAllQuotes(request);

    if (quotes.length === 0) {
      throw new Error('No liquidity providers available');
    }

    // 2. 筛选有效报价
    const validQuotes = quotes.filter(q => q.toAmount && parseFloat(q.toAmount) > 0);

    if (validQuotes.length === 0) {
      throw new Error('No valid quotes available');
    }

    // 3. 计算最优报价（综合考虑价格、手续费、价格影响、流动性）
    const bestQuote = this.selectBestQuote(validQuotes, request);

    // 4. 判断是否需要拆单
    const executionStrategy = this.determineExecutionStrategy(
      validQuotes,
      bestQuote,
      request,
    );

    return {
      bestQuote,
      allQuotes: validQuotes,
      executionStrategy,
    };
  }

  /**
   * 获取所有提供者的报价
   */
  private async getAllQuotes(
    request: PriceQuoteRequest,
  ): Promise<PriceQuote[]> {
    const quotes: PriceQuote[] = [];

    // 并行获取所有提供者的报价
    const quotePromises = this.liquidityProviders
      .filter(provider => {
        // 过滤：只查询支持该链的提供者
        return provider.getSupportedChains().includes(request.chain) &&
               provider.supportsPair(`${request.fromToken}/${request.toToken}`);
      })
      .map(async (provider) => {
        try {
          const quote = await provider.getPriceQuote(request);
          return quote;
        } catch (error: any) {
          this.logger.warn(
            `Failed to get quote from ${provider.getName()}: ${error.message}`,
          );
          return null;
        }
      });

    const results = await Promise.all(quotePromises);
    return results.filter((q): q is PriceQuote => q !== null);
  }

  /**
   * 选择最优报价
   * 评分算法：综合考虑价格、手续费、价格影响、流动性
   */
  private selectBestQuote(
    quotes: PriceQuote[],
    request: PriceQuoteRequest,
  ): PriceQuote {
    // 计算每个报价的综合分数
    const scoredQuotes = quotes.map(quote => {
      const score = this.calculateQuoteScore(quote, quotes);
      return { quote, score };
    });

    // 选择分数最高的报价
    const best = scoredQuotes.sort((a, b) => b.score - a.score)[0];
    return best.quote;
  }

  /**
   * 计算报价分数
   * 分数越高越好
   */
  private calculateQuoteScore(
    quote: PriceQuote,
    allQuotes: PriceQuote[],
  ): number {
    // 1. 价格分数（40%权重）：得到更多代币越好
    const toAmount = parseFloat(quote.toAmount);
    const maxToAmount = Math.max(...allQuotes.map(q => parseFloat(q.toAmount)));
    const priceScore = maxToAmount > 0 ? (toAmount / maxToAmount) * 40 : 0;

    // 2. 手续费分数（30%权重）：手续费越低越好
    const minFee = Math.min(...allQuotes.map(q => q.fee));
    const maxFee = Math.max(...allQuotes.map(q => q.fee));
    const feeScore = maxFee > minFee
      ? (1 - (quote.fee - minFee) / (maxFee - minFee)) * 30
      : 30;

    // 3. 价格影响分数（20%权重）：价格影响越小越好
    const minImpact = Math.min(...allQuotes.map(q => q.priceImpact));
    const maxImpact = Math.max(...allQuotes.map(q => q.priceImpact));
    const impactScore = maxImpact > minImpact
      ? (1 - (quote.priceImpact - minImpact) / (maxImpact - minImpact)) * 20
      : 20;

    // 4. 流动性分数（10%权重）：流动性越高越好
    const maxLiquidity = Math.max(...allQuotes.map(q => q.liquidity));
    const liquidityScore = maxLiquidity > 0
      ? (quote.liquidity / maxLiquidity) * 10
      : 5;

    return priceScore + feeScore + impactScore + liquidityScore;
  }

  /**
   * 确定执行策略
   * 判断是否需要拆单执行
   */
  private determineExecutionStrategy(
    quotes: PriceQuote[],
    bestQuote: PriceQuote,
    request: PriceQuoteRequest,
  ): BestExecutionResult['executionStrategy'] {
    const amount = parseFloat(request.amount);

    // 如果金额很大，考虑拆单执行
    if (amount > 100000) {
      // 检查是否有其他提供者可以提供更好的价格
      const alternativeQuotes = quotes.filter(q => q.provider !== bestQuote.provider);

      if (alternativeQuotes.length > 0) {
        // 计算拆单策略：将大单拆分成多个小单
        const splitStrategy = this.calculateSplitStrategy(
          quotes,
          request,
        );

        if (splitStrategy.totalBenefit > 0.01) {
          // 如果拆单能节省超过1%，则拆单
          return {
            splitOrders: splitStrategy.orders,
            reason: `Large order detected. Split execution can save ${(splitStrategy.totalBenefit * 100).toFixed(2)}%`,
          };
        }
      }
    }

    return {
      reason: 'Single provider execution is optimal',
    };
  }

  /**
   * 计算拆单策略
   */
  private calculateSplitStrategy(
    quotes: PriceQuote[],
    request: PriceQuoteRequest,
  ): {
    orders: Array<{ provider: string; amount: string; percentage: number }>;
    totalBenefit: number;
  } {
    // 简化实现：按流动性比例分配
    const totalLiquidity = quotes.reduce((sum, q) => sum + q.liquidity, 0);
    const orders = quotes.map(quote => {
      const percentage = quote.liquidity / totalLiquidity;
      const amount = (parseFloat(request.amount) * percentage).toString();
      return {
        provider: quote.provider,
        amount,
        percentage: percentage * 100,
      };
    });

    // 计算总收益（简化：假设拆单能减少价格影响）
    const avgPriceImpact = quotes.reduce((sum, q) => sum + q.priceImpact, 0) / quotes.length;
    const bestPriceImpact = Math.min(...quotes.map(q => q.priceImpact));
    const totalBenefit = (avgPriceImpact - bestPriceImpact) / 100;

    return { orders, totalBenefit };
  }
}

