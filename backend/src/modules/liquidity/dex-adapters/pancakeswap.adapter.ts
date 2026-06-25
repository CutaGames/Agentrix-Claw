import { Injectable } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { BaseDEXAdapter } from './base.adapter';
import {
  PriceQuoteRequest,
  PriceQuote,
  SwapRequest,
  SwapResult,
  LiquidityInfo,
  SwapRoute,
} from '../interfaces/liquidity-provider.interface';

/**
 * PancakeSwap DEX适配器（BSC/Polygon/Ethereum）
 * API文档: https://docs.pancakeswap.finance/
 * GraphQL API: https://api.thegraph.com/subgraphs/name/pancakeswap
 */
@Injectable()
export class PancakeSwapAdapter extends BaseDEXAdapter {
  private readonly graphUrl = 'https://api.thegraph.com/subgraphs/name/pancakeswap';
  private readonly chainSubgraphs: Record<string, string> = {
    bsc: 'pancakeswap/exchange-v3-bsc',
    ethereum: 'pancakeswap/exchange-v3-eth',
    polygon: 'pancakeswap/exchange-v3-polygon',
  };

  constructor(private readonly httpService: HttpService) {
    super('PancakeSwap');
  }

  getSupportedChains(): string[] {
    return ['bsc', 'ethereum', 'polygon'];
  }

  supportsPair(pair: string): boolean {
    // PancakeSwap支持所有ERC20代币对
    return true; // 简化实现
  }

  /**
   * 获取价格报价
   * 使用PancakeSwap GraphQL API或直接调用合约
   */
  async getPriceQuote(request: PriceQuoteRequest): Promise<PriceQuote> {
    if (!this.validateRequest(request)) {
      throw new Error('Invalid request');
    }

    if (!this.getSupportedChains().includes(request.chain)) {
      throw new Error(`PancakeSwap does not support chain: ${request.chain}`);
    }

    try {
      // 使用PancakeSwap GraphQL API查询价格
      const subgraph = this.chainSubgraphs[request.chain];
      const graphqlUrl = `${this.graphUrl}/${subgraph}`;

      // GraphQL查询：获取代币价格
      const query = `
        query GetPrice($token0: String!, $token1: String!) {
          token0: token(id: $token0) {
            derivedUSD
          }
          token1: token(id: $token1) {
            derivedUSD
          }
        }
      `;

      const response = await firstValueFrom(
        this.httpService.post(graphqlUrl, {
          query,
          variables: {
            token0: request.fromToken.toLowerCase(),
            token1: request.toToken.toLowerCase(),
          },
        }),
      );

      const data = (response as any).data?.data;
      const token0Price = parseFloat(data?.token0?.derivedUSD || '0');
      const token1Price = parseFloat(data?.token1?.derivedUSD || '0');

      if (token0Price === 0 || token1Price === 0) {
        throw new Error('Token price not available');
      }

      // 计算交换价格
      const amountIn = parseFloat(request.amount);
      const price = token1Price / token0Price;
      const amountOut = amountIn * price;

      // 计算价格影响（简化）
      const priceImpact = this.calculatePriceImpact(amountIn, 1000000); // 假设流动性

      // 计算手续费（PancakeSwap通常0.25%）
      const fee = amountIn * 0.0025;

      const route: SwapRoute = {
        hops: [
          {
            dex: 'PancakeSwap',
            pool: `${request.fromToken}/${request.toToken}`,
            fromToken: request.fromToken,
            toToken: request.toToken,
            fee: fee,
          },
        ],
        totalFee: fee,
      };

      return {
        provider: this.name,
        fromToken: request.fromToken,
        toToken: request.toToken,
        fromAmount: request.amount,
        toAmount: amountOut.toString(),
        price,
        priceImpact,
        fee,
        feeBreakdown: {
          providerFee: fee,
          gasFee: this.getEstimatedGasFee(request.chain),
        },
        route,
        estimatedTime: this.getEstimatedTime(request.chain),
        liquidity: 1000000, // 简化，实际应该从池子查询
        timestamp: new Date(),
      };
    } catch (error: any) {
      this.logger.error(`PancakeSwap quote failed: ${error.message}`, error.stack);
      throw new Error(`PancakeSwap quote failed: ${error.message}`);
    }
  }

  /**
   * 执行交换
   */
  async executeSwap(request: SwapRequest): Promise<SwapResult> {
    if (!this.validateRequest(request)) {
      throw new Error('Invalid request');
    }

    try {
      // 1. 先获取报价
      const quote = request.quote || await this.getPriceQuote({
        fromToken: request.fromToken,
        toToken: request.toToken,
        amount: request.amount,
        chain: request.chain,
        slippage: request.slippage,
      });

      // 2. 构建PancakeSwap交换交易
      // 注意：实际执行需要使用Web3.js/Ethers.js调用PancakeSwap合约
      // 这里只返回交易数据，需要用户签名并发送
      return {
        success: true,
        transactionHash: undefined,
        executedPrice: quote.price,
        executedAmount: quote.toAmount,
        actualPriceImpact: quote.priceImpact,
        gasCost: this.getEstimatedGasFee(request.chain),
        fee: quote.fee,
        timestamp: new Date(),
      };
    } catch (error: any) {
      this.logger.error(`PancakeSwap swap failed: ${error.message}`, error.stack);
      return {
        success: false,
        error: error.message,
        timestamp: new Date(),
      };
    }
  }

  /**
   * 获取流动性信息
   */
  async getLiquidity(pair: string): Promise<LiquidityInfo> {
    try {
      // TODO: 从PancakeSwap GraphQL API查询流动性
      // 实际应该查询池子的TVL、交易量等信息
      return {
        pair,
        totalLiquidity: 0,
        token0Liquidity: 0,
        token1Liquidity: 0,
        volume24h: 0,
        fee24h: 0,
        timestamp: new Date(),
      };
    } catch (error: any) {
      this.logger.error(`PancakeSwap liquidity query failed: ${error.message}`, error.stack);
      return {
        pair,
        totalLiquidity: 0,
        token0Liquidity: 0,
        token1Liquidity: 0,
        volume24h: 0,
        fee24h: 0,
        timestamp: new Date(),
      };
    }
  }

  /**
   * 获取预估Gas费用
   */
  private getEstimatedGasFee(chain: string): number {
    const gasMap: Record<string, number> = {
      bsc: 0.001, // BSC Gas费较低
      ethereum: 0.05, // Ethereum Gas费较高
      polygon: 0.001, // Polygon Gas费较低
    };
    return gasMap[chain] || 0.01;
  }

  /**
   * 获取预估确认时间
   */
  private getEstimatedTime(chain: string): number {
    const timeMap: Record<string, number> = {
      bsc: 3000, // BSC通常3秒确认
      ethereum: 12000, // Ethereum通常12秒确认
      polygon: 2000, // Polygon通常2秒确认
    };
    return timeMap[chain] || 5000;
  }
}

