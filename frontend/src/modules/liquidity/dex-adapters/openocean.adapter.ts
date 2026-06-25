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
 * OpenOcean DEX聚合器适配器（跨链）
 * API文档: https://docs.openocean.finance/
 * 支持多链：Ethereum, BSC, Polygon, Arbitrum, Optimism, Avalanche, Solana等
 */
@Injectable()
export class OpenOceanAdapter extends BaseDEXAdapter {
  private readonly apiUrl = 'https://open-api.openocean.finance/v3';

  private readonly chainIdMap: Record<string, number> = {
    ethereum: 1,
    bsc: 56,
    polygon: 137,
    arbitrum: 42161,
    optimism: 10,
    avalanche: 43114,
    solana: 999, // OpenOcean的特殊链ID
  };

  constructor(private readonly httpService: HttpService) {
    super('OpenOcean');
  }

  getSupportedChains(): string[] {
    return ['ethereum', 'bsc', 'polygon', 'arbitrum', 'optimism', 'avalanche', 'solana'];
  }

  supportsPair(pair: string): boolean {
    // OpenOcean作为聚合器，支持所有链上的代币对
    return true;
  }

  /**
   * 获取价格报价
   * OpenOcean API: https://open-api.openocean.finance/v3/{chainId}/quote
   */
  async getPriceQuote(request: PriceQuoteRequest): Promise<PriceQuote> {
    if (!this.validateRequest(request)) {
      throw new Error('Invalid request');
    }

    const chainId = this.chainIdMap[request.chain];
    if (!chainId) {
      throw new Error(`OpenOcean does not support chain: ${request.chain}`);
    }

    try {
      // 调用OpenOcean Quote API
      const response = await firstValueFrom(
        this.httpService.get(`${this.apiUrl}/${chainId}/quote`, {
          params: {
            inTokenAddress: request.fromToken,
            outTokenAddress: request.toToken,
            amount: request.amount,
            slippage: (request.slippage || 0.5) * 100, // 转换为百分比
            gasPrice: '5', // 默认Gas价格
          },
        }),
      );

      const quote = (response as any).data?.data || (response as any).data;

      if (!quote || !quote.outAmount) {
        throw new Error('No quote available from OpenOcean');
      }

      // 计算价格影响
      const amountIn = parseFloat(request.amount);
      const amountOut = parseFloat(quote.outAmount);
      const price = amountOut / amountIn;
      const priceImpact = quote.priceImpact || this.calculatePriceImpact(amountIn, quote.liquidity || 1000000);

      // 计算手续费
      const fee = quote.fee || 0;
      const gasFee = quote.estimatedGas || 0;

      // 构建交换路径（OpenOcean可能经过多个DEX）
      const route: SwapRoute = {
        hops: quote.path?.map((hop: any, index: number) => ({
          dex: hop.dex || 'OpenOcean',
          pool: hop.pool || '',
          fromToken: hop.fromToken || (index === 0 ? request.fromToken : quote.path[index - 1].toToken),
          toToken: hop.toToken || (index === quote.path.length - 1 ? request.toToken : quote.path[index + 1].fromToken),
          fee: hop.fee || 0,
        })) || [],
        totalFee: fee,
      };

      return {
        provider: this.name,
        fromToken: request.fromToken,
        toToken: request.toToken,
        fromAmount: request.amount,
        toAmount: quote.outAmount,
        price,
        priceImpact,
        fee,
        feeBreakdown: {
          providerFee: fee,
          gasFee: gasFee,
        },
        route,
        estimatedTime: quote.estimatedTime || this.getEstimatedTime(request.chain),
        liquidity: quote.liquidity || 0,
        timestamp: new Date(),
      };
    } catch (error: any) {
      this.logger.error(`OpenOcean quote failed: ${error.message}`, error.stack);
      throw new Error(`OpenOcean quote failed: ${error.message}`);
    }
  }

  /**
   * 执行交换
   * OpenOcean API: https://open-api.openocean.finance/v3/{chainId}/swap
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

      // 2. 获取交换交易数据
      const chainId = this.chainIdMap[request.chain];
      const swapResponse = await firstValueFrom(
        this.httpService.get(`${this.apiUrl}/${chainId}/swap`, {
          params: {
            inTokenAddress: request.fromToken,
            outTokenAddress: request.toToken,
            amount: request.amount,
            slippage: (request.slippage || 0.5) * 100,
            to: request.walletAddress,
            referrer: '0x0000000000000000000000000000000000000000', // 可选推荐人地址
          },
        }),
      );

      const swapData = (swapResponse as any).data?.data || (swapResponse as any).data;

      // 返回交易数据（需要用户签名并发送）
      return {
        success: true,
        transactionHash: undefined, // 需要用户签名后才能获得
        executedPrice: quote.price,
        executedAmount: quote.toAmount,
        actualPriceImpact: quote.priceImpact,
        gasCost: swapData.gas || quote.feeBreakdown?.gasFee || 0,
        fee: quote.fee,
        timestamp: new Date(),
      };
    } catch (error: any) {
      this.logger.error(`OpenOcean swap failed: ${error.message}`, error.stack);
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
    // OpenOcean作为聚合器，不直接提供流动性信息
    // 需要从各个DEX聚合
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

  /**
   * 获取预估确认时间
   */
  private getEstimatedTime(chain: string): number {
    const timeMap: Record<string, number> = {
      ethereum: 12000,
      bsc: 3000,
      polygon: 2000,
      arbitrum: 1000,
      optimism: 2000,
      avalanche: 2000,
      solana: 2000,
    };
    return timeMap[chain] || 5000;
  }
}

