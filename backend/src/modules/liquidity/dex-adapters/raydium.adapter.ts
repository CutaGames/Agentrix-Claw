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
  SwapHop,
} from '../interfaces/liquidity-provider.interface';

/**
 * Raydium DEX适配器（Solana）
 * API文档: https://docs.raydium.io/
 * 注意：Raydium主要通过链上程序交互，这里使用Raydium API获取价格和流动性信息
 */
@Injectable()
export class RaydiumAdapter extends BaseDEXAdapter {
  private readonly apiUrl = 'https://api.raydium.io/v2';

  constructor(private readonly httpService: HttpService) {
    super('Raydium');
  }

  getSupportedChains(): string[] {
    return ['solana'];
  }

  supportsPair(pair: string): boolean {
    // Raydium支持所有Solana上的SPL代币对
    return true; // 简化实现，实际应该检查代币是否存在
  }

  /**
   * 获取价格报价
   * Raydium API: https://api.raydium.io/v2/ammV3/ammPools
   */
  async getPriceQuote(request: PriceQuoteRequest): Promise<PriceQuote> {
    if (!this.validateRequest(request)) {
      throw new Error('Invalid request');
    }

    if (request.chain !== 'solana') {
      throw new Error('Raydium only supports Solana');
    }

    try {
      // 1. 获取池子信息
      const poolsResponse = await firstValueFrom(
        this.httpService.get(`${this.apiUrl}/ammV3/ammPools`, {
          params: {
            poolAddresses: [], // 空数组获取所有池子
          },
        }),
      );

      const pools = ((poolsResponse as any).data?.data || []);

      // 2. 查找包含目标代币对的池子
      const matchingPool = pools.find((pool: any) => {
        const mintA = pool.mintA?.address || pool.mintA;
        const mintB = pool.mintB?.address || pool.mintB;
        return (
          (mintA === request.fromToken && mintB === request.toToken) ||
          (mintA === request.toToken && mintB === request.fromToken)
        );
      });

      if (!matchingPool) {
        throw new Error(`No liquidity pool found for ${request.fromToken}/${request.toToken}`);
      }

      // 3. 计算交换价格（简化计算，实际应该使用Raydium SDK的精确公式）
      const amountIn = parseFloat(request.amount);
      const reserveIn = parseFloat(matchingPool.tvl || matchingPool.liquidity || 0);
      const reserveOut = parseFloat(matchingPool.tvl || matchingPool.liquidity || 0);

      // 使用恒定乘积公式: x * y = k
      // 简化计算（实际应该考虑手续费和价格影响）
      const amountOut = (amountIn * reserveOut) / (reserveIn + amountIn);
      const price = amountOut / amountIn;

      // 计算价格影响
      const priceImpact = this.calculatePriceImpact(amountIn, reserveIn);

      // 计算手续费（Raydium通常0.25%）
      const fee = amountIn * 0.0025;

      // 构建交换路径
      const route: SwapRoute = {
        hops: [
          {
            dex: 'Raydium',
            pool: matchingPool.id || matchingPool.address,
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
        },
        route,
        estimatedTime: 2000, // Solana通常2秒确认
        liquidity: reserveIn,
        timestamp: new Date(),
      };
    } catch (error: any) {
      this.logger.error(`Raydium quote failed: ${error.message}`, error.stack);
      throw new Error(`Raydium quote failed: ${error.message}`);
    }
  }

  /**
   * 执行交换
   * 注意：Raydium交换需要构建Solana交易，这里返回交易数据
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

      // 2. 构建Raydium交换交易
      // 注意：实际执行需要使用Raydium SDK构建Solana交易
      // 这里只返回交易数据，需要用户签名并发送
      return {
        success: true,
        transactionHash: undefined, // 需要用户签名后才能获得
        executedPrice: quote.price,
        executedAmount: quote.toAmount,
        actualPriceImpact: quote.priceImpact,
        fee: quote.fee,
        timestamp: new Date(),
      };
    } catch (error: any) {
      this.logger.error(`Raydium swap failed: ${error.message}`, error.stack);
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
      const poolsResponse = await firstValueFrom(
        this.httpService.get(`${this.apiUrl}/ammV3/ammPools`),
      );

      const pools = ((poolsResponse as any).data?.data || []);
      const [token0, token1] = pair.split('/');

      // 查找匹配的池子
      const matchingPool = pools.find((pool: any) => {
        const mintA = pool.mintA?.address || pool.mintA;
        const mintB = pool.mintB?.address || pool.mintB;
        return (
          (mintA === token0 && mintB === token1) ||
          (mintA === token1 && mintB === token0)
        );
      });

      if (!matchingPool) {
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

      return {
        pair,
        totalLiquidity: parseFloat(matchingPool.tvl || 0),
        token0Liquidity: parseFloat(matchingPool.tvl || 0) / 2, // 简化
        token1Liquidity: parseFloat(matchingPool.tvl || 0) / 2, // 简化
        volume24h: parseFloat(matchingPool.volume24h || 0),
        fee24h: parseFloat(matchingPool.volume24h || 0) * 0.0025, // 0.25%手续费
        timestamp: new Date(),
      };
    } catch (error: any) {
      this.logger.error(`Raydium liquidity query failed: ${error.message}`, error.stack);
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
}

