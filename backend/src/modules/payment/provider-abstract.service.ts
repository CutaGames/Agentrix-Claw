/**
 * Provider 抽象接口
 * 用于统一管理不同的 Provider，方便后续接入和测试
 */

export interface ProviderQuote {
  providerId: string;
  rate: number; // 汇率
  fee: number; // 手续费
  estimatedAmount: number; // 预估金额
  expiresAt: Date; // 过期时间
}

export interface OnRampParams {
  amount: number;
  fromCurrency: string;
  toCurrency: string;
  userId: string;
  orderId?: string;
  metadata?: Record<string, any>;
}

export interface OnRampResult {
  transactionId: string;
  status: 'pending' | 'completed' | 'failed';
  cryptoAmount: number;
  cryptoCurrency: string;
  transactionHash?: string;
}

export interface OffRampParams {
  amount: number;
  fromCurrency: string;
  toCurrency: string;
  merchantId: string;
  bankAccount: string;
  metadata?: Record<string, any>;
}

export interface OffRampResult {
  transactionId: string;
  status: 'pending' | 'completed' | 'failed';
  fiatAmount: number;
  fiatCurrency: string;
  transactionHash?: string;
}

/**
 * Provider 抽象接口
 */
export interface IProvider {
  // Provider 标识
  id: string;
  name: string;

  // 是否支持 On-ramp（法币转数字货币）
  supportsOnRamp: boolean;

  // 是否支持 Off-ramp（数字货币转法币）
  supportsOffRamp: boolean;

  // 获取报价
  getQuote(
    amount: number,
    fromCurrency: string,
    toCurrency: string,
    isSourceAmount?: boolean,
  ): Promise<ProviderQuote>;

  // 执行 On-ramp（法币转数字货币）
  executeOnRamp?(params: OnRampParams): Promise<OnRampResult>;

  // 执行 Off-ramp（数字货币转法币）
  executeOffRamp?(params: OffRampParams): Promise<OffRampResult>;
}

