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
 * Jupiter DEX适配器（Solana）
 * API文档: https://docs.jup.ag/
 */
@Injectable()
export class JupiterAdapter extends BaseDEXAdapter {
  private readonly apiUrl = 'https://quote-api.jup.ag/v6';

  constructor(private readonly httpService: HttpService) {
    super('Jupiter');
  }

  getSupportedChains(): string[] {
    return ['solana'];
  }

  supportsPair(pair: string): boolean {
    // Jupiter支持所有Solana上的SPL代币
    return true; // 简化实现，实际应该检查代币是否存在
  }

  /**
   * 获取价格报价
   */
  async getPriceQuote(request: PriceQuoteRequest): Promise<PriceQuote> {
    if (!this.validateRequest(request)) {
      throw new Error('Invalid request');
    }

    if (request.chain !== 'solana') {
      throw new Error('Jupiter only supports Solana');
    }

    try {
      // 调用Jupiter Quote API
      const response = await firstValueFrom(
        this.httpService.get(`${this.apiUrl}/quote`, {
          params: {
            inputMint: request.fromToken,
            outputMint: request.toToken,
            amount: request.amount,
            slippageBps: Math.floor((request.slippage || 0.5) * 100), // 转换为基点
          },
        }),
      );

      const quote = (response as any).data;

      // 计算价格影响
      const priceImpact = this.calculatePriceImpact(
        parseFloat(request.amount),
        quote.liquidity || 1000000,
      );

      // 构建交换路径
      const route: SwapRoute = {
        hops: quote.routePlan?.map((hop: any) => ({
          dex: 'Jupiter',
          pool: hop.swapInfo?.ammKey || '',
          fromToken: hop.swapInfo?.inputMint || request.fromToken,
          toToken: hop.swapInfo?.outputMint || request.toToken,
          fee: hop.swapInfo?.feeAmount || 0,
        })) || [],
        totalFee: quote.fee || 0,
      };

      return {
        provider: this.name,
        fromToken: request.fromToken,
        toToken: request.toToken,
        fromAmount: request.amount,
        toAmount: quote.outAmount || '0',
        price: parseFloat(quote.outAmount || '0') / parseFloat(request.amount),
        priceImpact,
        fee: quote.fee || 0,
        feeBreakdown: {
          providerFee: quote.fee || 0,
        },
        route,
        estimatedTime: 2000, // Solana通常2秒确认
        liquidity: quote.liquidity || 0,
        timestamp: new Date(),
      };
    } catch (error: any) {
      this.logger.error(`Jupiter quote failed: ${error.message}`, error.stack);
      throw new Error(`Jupiter quote failed: ${error.message}`);
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

      // 2. 获取交换交易（Jupiter Swap API）
      const swapResponse = await firstValueFrom(
        this.httpService.post(`${this.apiUrl}/swap`, {
          quoteResponse: quote,
          userPublicKey: request.walletAddress,
          wrapAndUnwrapSol: true,
          dynamicComputeUnitLimit: true,
          prioritizationFeeLamports: 'auto',
        }),
      );

      // 3. 返回交易数据（需要用户签名并发送）
      // 注意：实际执行需要用户钱包签名，这里只返回交易数据
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
      this.logger.error(`Jupiter swap failed: ${error.message}`, error.stack);
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
    // TODO: 实现流动性查询
    // Jupiter API可能不直接提供流动性信息，需要从链上查询
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

