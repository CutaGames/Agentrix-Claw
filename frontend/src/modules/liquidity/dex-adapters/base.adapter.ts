import { Injectable, Logger } from '@nestjs/common';
import {
  ILiquidityProvider,
  PriceQuoteRequest,
  PriceQuote,
  SwapRequest,
  SwapResult,
  LiquidityInfo,
} from '../interfaces/liquidity-provider.interface';

/**
 * DEX适配器基类
 * 所有DEX适配器都应该继承此类
 */
@Injectable()
export abstract class BaseDEXAdapter implements ILiquidityProvider {
  protected readonly logger: Logger;

  constructor(protected readonly name: string) {
    this.logger = new Logger(`${name}Adapter`);
  }

  /**
   * 获取提供者名称
   */
  getName(): string {
    return this.name;
  }

  /**
   * 获取价格报价（抽象方法，子类必须实现）
   */
  abstract getPriceQuote(request: PriceQuoteRequest): Promise<PriceQuote>;

  /**
   * 执行交换（抽象方法，子类必须实现）
   */
  abstract executeSwap(request: SwapRequest): Promise<SwapResult>;

  /**
   * 获取流动性信息（抽象方法，子类必须实现）
   */
  abstract getLiquidity(pair: string): Promise<LiquidityInfo>;

  /**
   * 获取支持的链（抽象方法，子类必须实现）
   */
  abstract getSupportedChains(): string[];

  /**
   * 检查是否支持某个交易对（抽象方法，子类必须实现）
   */
  abstract supportsPair(pair: string): boolean;

  /**
   * 验证请求参数（通用方法）
   */
  protected validateRequest(request: PriceQuoteRequest | SwapRequest): boolean {
    if (!request.fromToken || !request.toToken || !request.amount) {
      this.logger.error('Invalid request: missing required fields');
      return false;
    }

    if (parseFloat(request.amount) <= 0) {
      this.logger.error('Invalid request: amount must be positive');
      return false;
    }

    return true;
  }

  /**
   * 计算价格影响（通用方法）
   */
  protected calculatePriceImpact(
    amount: number,
    liquidity: number,
  ): number {
    // 简化计算：价格影响 = 交易量 / 流动性
    // 实际应该使用更复杂的公式
    return (amount / liquidity) * 100;
  }
}

