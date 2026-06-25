/**
 * 流动性提供者统一接口
 * 所有DEX/CEX适配器都需要实现此接口
 */
export interface ILiquidityProvider {
  /**
   * 获取价格报价
   */
  getPriceQuote(request: PriceQuoteRequest): Promise<PriceQuote>;

  /**
   * 执行交换
   */
  executeSwap(request: SwapRequest): Promise<SwapResult>;

  /**
   * 获取流动性信息
   */
  getLiquidity(pair: string): Promise<LiquidityInfo>;

  /**
   * 获取提供者名称
   */
  getName(): string;

  /**
   * 获取支持的链
   */
  getSupportedChains(): string[];

  /**
   * 检查是否支持某个交易对
   */
  supportsPair(pair: string): boolean;
}

export interface PriceQuoteRequest {
  fromToken: string; // 源代币地址或符号
  toToken: string; // 目标代币地址或符号
  amount: string; // 数量（最小单位）
  chain: string; // 链名称
  slippage?: number; // 滑点容忍度（百分比，默认0.5%）
}

export interface PriceQuote {
  provider: string; // 提供者名称
  fromToken: string;
  toToken: string;
  fromAmount: string;
  toAmount: string; // 预期得到的数量
  price: number; // 价格
  priceImpact: number; // 价格影响（百分比）
  fee: number; // 手续费
  feeBreakdown: {
    providerFee: number;
    gasFee?: number;
    bridgeFee?: number;
  };
  route?: SwapRoute; // 交换路径
  estimatedTime: number; // 预计执行时间（毫秒）
  liquidity: number; // 流动性深度
  timestamp: Date;
}

export interface SwapRequest {
  fromToken: string;
  toToken: string;
  amount: string;
  chain: string;
  walletAddress: string;
  slippage?: number;
  quote?: PriceQuote; // 可选的预获取报价
}

export interface SwapResult {
  success: boolean;
  transactionHash?: string;
  executedPrice?: number;
  executedAmount?: string;
  actualPriceImpact?: number;
  gasCost?: number;
  fee?: number;
  error?: string;
  timestamp: Date;
}

export interface LiquidityInfo {
  pair: string;
  totalLiquidity: number; // 总流动性（USD）
  token0Liquidity: number; // Token0流动性
  token1Liquidity: number; // Token1流动性
  volume24h: number; // 24小时交易量
  fee24h: number; // 24小时手续费
  timestamp: Date;
}

export interface SwapRoute {
  hops: SwapHop[]; // 交换路径（可能经过多个池子）
  totalFee: number;
}

export interface SwapHop {
  dex: string; // DEX名称
  pool: string; // 池子地址
  fromToken: string;
  toToken: string;
  fee: number;
}

