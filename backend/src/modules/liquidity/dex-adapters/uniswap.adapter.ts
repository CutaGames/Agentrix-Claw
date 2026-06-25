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
 * Uniswap DEX适配器（Ethereum/Polygon/Arbitrum/Optimism）
 * API文档: https://docs.uniswap.org/
 */
@Injectable()
export class UniswapAdapter extends BaseDEXAdapter {
  private readonly graphUrl = 'https://api.thegraph.com/subgraphs/name/uniswap';
  private readonly chainSubgraphs: Record<string, string> = {
    ethereum: 'uniswap/uniswap-v3',
    polygon: 'ianlapham/uniswap-v3-polygon',
    arbitrum: 'ianlapham/arbitrum-minimal',
    optimism: 'ianlapham/optimism-post-regenesis',
  };

  constructor(private readonly httpService: HttpService) {
    super('Uniswap');
  }

  getSupportedChains(): string[] {
    return ['ethereum', 'polygon', 'arbitrum', 'optimism'];
  }

  supportsPair(pair: string): boolean {
    // Uniswap支持所有ERC20代币对
    return true; // 简化实现
  }

  /**
   * 获取价格报价
   */
  async getPriceQuote(request: PriceQuoteRequest): Promise<PriceQuote> {
    if (!this.validateRequest(request)) {
      throw new Error('Invalid request');
    }

    if (!this.getSupportedChains().includes(request.chain)) {
      throw new Error(`Uniswap does not support chain: ${request.chain}`);
    }

    try {
      // 使用1inch API作为替代（Uniswap GraphQL API较复杂）
      // 或者使用Uniswap SDK
      const oneInchUrl = `https://api.1inch.dev/swap/v6.0/${this.getChainId(request.chain)}/quote`;
      
      const response = await firstValueFrom(
        this.httpService.get(oneInchUrl, {
          params: {
            src: request.fromToken,
            dst: request.toToken,
            amount: request.amount,
          },
          headers: {
            Authorization: `Bearer ${process.env.ONEINCH_API_KEY || ''}`,
          },
        }),
      );

      const quote = (response as any).data;

      const priceImpact = this.calculatePriceImpact(
        parseFloat(request.amount),
        quote.liquidity || 1000000,
      );

      return {
        provider: this.name,
        fromToken: request.fromToken,
        toToken: request.toToken,
        fromAmount: request.amount,
        toAmount: quote.toTokenAmount || '0',
        price: parseFloat(quote.toTokenAmount || '0') / parseFloat(request.amount),
        priceImpact,
        fee: quote.fee || 0,
        feeBreakdown: {
          providerFee: quote.fee || 0,
          gasFee: quote.estimatedGas || 0,
        },
        estimatedTime: 12000, // Ethereum通常12秒确认
        liquidity: quote.liquidity || 0,
        timestamp: new Date(),
      };
    } catch (error: any) {
      this.logger.error(`Uniswap quote failed: ${error.message}`, error.stack);
      throw new Error(`Uniswap quote failed: ${error.message}`);
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
      // 使用1inch API执行交换
      const chainId = this.getChainId(request.chain);
      const swapUrl = `https://api.1inch.dev/swap/v6.0/${chainId}/swap`;

      const quote = request.quote || await this.getPriceQuote({
        fromToken: request.fromToken,
        toToken: request.toToken,
        amount: request.amount,
        chain: request.chain,
        slippage: request.slippage,
      });

      const swapResponse = await firstValueFrom(
        this.httpService.get(swapUrl, {
          params: {
            src: request.fromToken,
            dst: request.toToken,
            amount: request.amount,
            from: request.walletAddress,
            slippage: (request.slippage || 0.5) * 100,
          },
          headers: {
            Authorization: `Bearer ${process.env.ONEINCH_API_KEY || ''}`,
          },
        }),
      );

      const swapData = (swapResponse as any).data;

      // 返回交易数据（需要用户签名并发送）
      return {
        success: true,
        transactionHash: undefined,
        executedPrice: quote.price,
        executedAmount: quote.toAmount,
        actualPriceImpact: quote.priceImpact,
        gasCost: swapData.tx?.gas || 0,
        fee: quote.fee,
        timestamp: new Date(),
      };
    } catch (error: any) {
      this.logger.error(`Uniswap swap failed: ${error.message}`, error.stack);
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
    // TODO: 从Uniswap GraphQL API查询流动性
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
   * 获取链ID
   */
  private getChainId(chain: string): number {
    const chainMap: Record<string, number> = {
      ethereum: 1,
      polygon: 137,
      arbitrum: 42161,
      optimism: 10,
    };
    return chainMap[chain] || 1;
  }
}

