import { apiClient } from './client';
import type { PaymentRoutingInfo, ExchangeQuote, X402Authorization, AgentPaymentInfo, EscrowInfo } from '../../types/payment-types';

export interface PaymentInfo {
  id: string;
  userId: string;
  amount: number;
  currency: string;
  paymentMethod: string;
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled' | 'refunded';
  description?: string;
  merchantId?: string;
  agentId?: string;
  transactionHash?: string;
  metadata?: any;
  createdAt: string;
  updatedAt: string;
}

export interface PaymentRouting extends PaymentRoutingInfo {
  recommendedMethod: string;
  channels: Array<{
    method: string;
    priority: number;
    minAmount: number;
    maxAmount: number;
    cost: number;
    speed: number;
    available: boolean;
    kycRequired?: boolean;
    crossBorder?: boolean;
    supportedCurrencies?: string[];
  }>;
  scenarioMeta?: {
    type: string;
    title: string;
    description: string;
  };
  recommendedRoute?: {
    id: string;
    label: string;
    method: string;
    scenario: string;
    provider?: string;
    cost: number;
    speed: number;
  };
  flowType?: 'fiat' | 'fiat_to_crypto' | 'crypto';
}

export interface ProviderSessionInfo {
  sessionId: string;
  provider: string;
  checkoutUrl: string;
  expiresAt: string;
  status?: string;
  transactionHash?: string;
}

export interface CreatePaymentIntentDto {
  amount: number;
  currency: string;
  paymentMethod: string;
  description?: string;
  merchantId?: string;
  agentId?: string;
  metadata?: any;
}

export interface ProcessPaymentDto {
  amount: number;
  currency: string;
  paymentMethod: string;
  paymentIntentId?: string;
  description?: string;
  merchantId?: string;
  agentId?: string;
  metadata?: any;
}

export interface ExchangeRateInfo {
  from: string;
  to: string;
  rate: number;
  timestamp: number;
  source: string;
}

export interface ExchangeRateLock {
  lockId: string;
  rate: number;
  cryptoAmount: number;
  expiresAt: number;
  from: string;
  to: string;
  amount: number;
}

export interface ExchangeRateLockInfo {
  valid: boolean;
  lockId: string;
  rate: number;
  expiresAt: number;
}

export const paymentApi = {
  /**
   * 创建支付意图（Stripe）
   */
  createIntent: async (
    dto: CreatePaymentIntentDto,
  ): Promise<{ clientSecret: string; paymentIntentId: string }> => {
    const result = await apiClient.post<{ clientSecret: string; paymentIntentId: string }>('/payments/create-intent', dto);
    if (result === null) {
      throw new Error('无法创建支付意图，请稍后重试');
    }
    return result;
  },

  /**
   * 处理支付
   */
  process: async (dto: ProcessPaymentDto): Promise<PaymentInfo> => {
    const result = await apiClient.post<PaymentInfo>('/payments/process', dto);
    if (result === null) {
      throw new Error('无法处理支付，请稍后重试');
    }
    return result;
  },

  /**
   * 获取用户的支付记录列表
   */
  getUserPayments: async (options?: {
    status?: string;
    paymentMethod?: string;
    limit?: number;
    offset?: number;
  }): Promise<{ data: PaymentInfo[]; total: number; limit: number; offset: number }> => {
    const params = new URLSearchParams();
    if (options?.status) params.append('status', options.status);
    if (options?.paymentMethod) params.append('paymentMethod', options.paymentMethod);
    if (options?.limit) params.append('limit', options.limit.toString());
    if (options?.offset) params.append('offset', options.offset.toString());

    const queryString = params.toString();
    const url = `/payments${queryString ? `?${queryString}` : ''}`;
    const result = await apiClient.get<{ data: PaymentInfo[]; total: number; limit: number; offset: number }>(url);
    if (result === null) {
      throw new Error('无法获取支付记录，请稍后重试');
    }
    return result;
  },

  /**
   * 获取支付路由建议
   * V3.0新增：支持订单类型和Agent ID参数
   */
  getRouting: async (
    amount: number,
    currency: string = 'CNY',
    isOnChain?: boolean,
    userCountry?: string,
    merchantCountry?: string,
    merchantPaymentConfig?: 'fiat_only' | 'crypto_only' | 'both',
    orderType?: 'nft' | 'virtual' | 'service' | 'product' | 'physical',
    agentId?: string,
    walletConnected?: boolean,
    scenario?: 'qr_pay' | 'micro_sub' | 'wallet_direct' | 'standard',
  ): Promise<PaymentRouting> => {
    const params = new URLSearchParams({
      amount: amount.toString(),
      currency,
      ...(isOnChain !== undefined && { isOnChain: isOnChain.toString() }),
      ...(userCountry && { userCountry }),
      ...(merchantCountry && { merchantCountry }),
      ...(merchantPaymentConfig && { merchantPaymentConfig }),
      ...(orderType && { orderType }),
      ...(agentId && { agentId }),
      ...(walletConnected !== undefined && { walletConnected: walletConnected.toString() }),
      ...(scenario && { scenario }),
    });
    const result = await apiClient.get<PaymentRouting>(`/payments/routing?${params}`);
    if (result === null) {
      throw new Error('无法获取支付路由建议，请稍后重试');
    }
    return result;
  },

  /**
   * 查询支付状态
   */
  getPayment: async (paymentId: string): Promise<PaymentInfo> => {
    const result = await apiClient.get<PaymentInfo>(`/payments/${paymentId}`);
    if (result === null) {
      throw new Error('无法获取支付信息，请稍后重试');
    }
    return result;
  },

  /**
   * 更新支付状态
   */
  updatePaymentStatus: async (
    paymentId: string,
    status: string,
    transactionHash?: string,
  ): Promise<PaymentInfo> => {
    const result = await apiClient.put<PaymentInfo>(`/payments/${paymentId}/status`, {
      status,
      transactionHash,
    });
    if (result === null) {
      throw new Error('无法更新支付状态，请稍后重试');
    }
    return result;
  },

  /**
   * 创建Provider支付会话
   */
  createProviderSession: async (request: {
    amount: number;
    currency: string;
    toCurrency?: string;
    providerId: string;
    paymentRail: string;
    routeId?: string;
    quote?: any;
    metadata?: any;
    merchantId?: string;
    description?: string;
  }): Promise<ProviderSessionInfo> => {
    const result = await apiClient.post<ProviderSessionInfo>('/payments/provider/session', request);
    if (result === null) {
      throw new Error('无法创建Provider支付会话，请稍后重试');
    }
    return result;
  },

  /**
   * 创建 Transak Session（使用 Create Session API）
   * 方案1：使用 Transak 推荐的 Create Session API 来锁定金额
   */
  createTransakSession: async (request: {
    amount: number;
    fiatCurrency: string;
    cryptoCurrency?: string;
    network?: string;
    walletAddress?: string;
    orderId?: string;
    email?: string;
    redirectURL?: string;
    hideMenu?: boolean;
    disableWalletAddressForm?: boolean;
    disableFiatAmountEditing?: boolean;
    isKYCRequired?: boolean;
    referrerDomain?: string;
    productType?: 'BUY' | 'SELL';
  }): Promise<{ sessionId: string; widgetUrl: string }> => {
    const result = await apiClient.post<{ sessionId: string; widgetUrl: string }>(
      '/payments/provider/transak/session',
      request,
    );
    if (result === null) {
      throw new Error('无法创建 Transak Session，请稍后重试');
    }
    return result;
  },

  /**
   * 估算手续费
   */
  estimateFee: async (params: {
    amount: number;
    currency: string;
    paymentMethod: string;
    chain?: string;
    isCrossBorder?: boolean;
    userCountry?: string;
    merchantCountry?: string;
  }): Promise<any> => {
    const queryParams = new URLSearchParams({
      amount: params.amount.toString(),
      currency: params.currency,
      paymentMethod: params.paymentMethod,
      ...(params.chain && { chain: params.chain }),
      ...(params.isCrossBorder !== undefined && { isCrossBorder: params.isCrossBorder.toString() }),
      ...(params.userCountry && { userCountry: params.userCountry }),
      ...(params.merchantCountry && { merchantCountry: params.merchantCountry }),
    });
    const result = await apiClient.get<any>(`/payments/estimate-fees?${queryParams}`);
    if (result === null) {
      throw new Error('无法估算手续费，请稍后重试');
    }
    return result;
  },

  /**
   * 对比所有支付方式成本
   */
  compareCosts: async (params: {
    amount: number;
    currency?: string;
    chain?: string;
    targetCurrency?: string;
  }): Promise<any[]> => {
    const queryParams = new URLSearchParams({
      amount: params.amount.toString(),
      currency: params.currency || 'USD',
      ...(params.chain && { chain: params.chain }),
      ...(params.targetCurrency && { targetCurrency: params.targetCurrency }),
    });
    const result = await apiClient.get<any[]>(`/payments/compare-costs?${queryParams}`);
    return result ?? [];
  },

  /**
   * 评估交易风险
   */
  assessRisk: async (params: {
    amount: number;
    paymentMethod: string;
    metadata?: any;
  }): Promise<any> => {
    const result = await apiClient.post<any>('/payments/assess-risk', params);
    if (result === null) {
      throw new Error('无法评估交易风险，请稍后重试');
    }
    return result;
  },

  /**
   * 获取用户的Agent代付记录
   */
  getUserAgentPayments: async (): Promise<any[]> => {
    const result = await apiClient.get<any[]>('/payments/agent/user-list');
    return result ?? [];
  },

  /**
   * 处理QuickPay支付
   */
  processQuickPay: async (request: {
    amount: number;
    currency: string;
    description?: string;
    merchantId?: string;
  }): Promise<PaymentInfo> => {
    const result = await apiClient.post<PaymentInfo>('/payments/quickpay', request);
    if (result === null) {
      throw new Error('无法处理QuickPay支付，请稍后重试');
    }
    return result;
  },

  /**
   * 处理数字货币支付
   */
  processCryptoPayment: async (request: {
    amount: number;
    currency: string;
    method: string;
    description?: string;
  }): Promise<PaymentInfo> => {
    const result = await apiClient.post<PaymentInfo>('/payments/crypto', request);
    if (result === null) {
      throw new Error('无法处理数字货币支付，请稍后重试');
    }
    return result;
  },

  /**
   * 处理Provider支付
   */
  processProviderPayment: async (request: {
    amount: number;
    currency: string;
    provider: string;
    description?: string;
  }): Promise<PaymentInfo> => {
    const result = await apiClient.post<PaymentInfo>('/payments/provider', request);
    if (result === null) {
      throw new Error('无法处理Provider支付，请稍后重试');
    }
    return result;
  },

  /**
   * 处理法币支付
   */
  processFiatPayment: async (request: {
    amount: number;
    currency: string;
    method: string;
    description?: string;
  }): Promise<PaymentInfo> => {
    const result = await apiClient.post<PaymentInfo>('/payments/fiat', request);
    if (result === null) {
      throw new Error('无法处理法币支付，请稍后重试');
    }
    return result;
  },

  /**
   * Pre-Flight Check（200ms 路由决策）
   */
  preflightCheck: async (params: {
    amount: string;
    currency?: string;
  }): Promise<{
    recommendedRoute: 'quickpay' | 'wallet' | 'crypto-rail' | 'local-rail';
    quickPayAvailable: boolean;
    sessionLimit?: {
      singleLimit: string;
      dailyLimit: string;
      dailyRemaining: string;
    };
    walletBalance?: string;
    walletBalanceIsMock?: boolean;
    requiresKYC?: boolean;
    estimatedTime?: string;
    fees?: {
      gasFee?: string;
      providerFee?: string;
      total?: string;
    };
    providerOptions?: Array<{
      id: string;
      name: string;
      price: number;
      currency: string;
      requiresKYC: boolean;
      provider: string;
      estimatedTime?: string;
      fee?: number; // 总费用（Provider 费用 + Agentrix 平台费用，如果为 0 表示未获取到报价）
      providerFee?: number; // Provider 费用（仅 Provider 收取的费用）
      agentrixFee?: number; // Agentrix 平台费用（额外收取的平台费用）
      commissionContractAddress?: string; // 分润佣金合约地址（Provider 兑换后自动打入此地址）
      minAmount?: number; // 最低兑换金额（如果订单金额低于此值，应显示此最低金额）
      available?: boolean; // 是否可用（如果订单金额低于最低金额，则为 false）
    }>;
  }> => {
    const queryParams = new URLSearchParams({
      amount: params.amount,
      currency: params.currency || 'USDC',
    });
    const result = await apiClient.get<{
      recommendedRoute: 'quickpay' | 'wallet' | 'crypto-rail' | 'local-rail';
      quickPayAvailable: boolean;
      sessionLimit?: {
        singleLimit: string;
        dailyLimit: string;
        dailyRemaining: string;
      };
      walletBalance?: string;
      walletBalanceIsMock?: boolean;
      requiresKYC?: boolean;
      estimatedTime?: string;
      fees?: {
        gasFee?: string;
        providerFee?: string;
        total?: string;
      };
      providerOptions?: Array<{
        id: string;
        name: string;
        price: number;
        currency: string;
        requiresKYC: boolean;
        provider: string;
        estimatedTime?: string;
        fee?: number;
      }>;
    }>(`/payment/preflight?${queryParams}`);
    if (result === null) {
      throw new Error('无法执行Pre-Flight检查，请稍后重试');
    }
    return result;
  },

  /**
   * Relayer QuickPay（Agent 调用）
   */
  relayerQuickPay: async (request: {
    sessionId: string;
    paymentId: string;
    to: string;
    amount: string;
    signature: string;
    nonce: number;
  }): Promise<{
    success: boolean;
    paymentId: string;
    confirmedAt: Date;
    txHash?: string;
  }> => {
    const result = await apiClient.post<{
      success: boolean;
      paymentId: string;
      confirmedAt: Date;
      txHash?: string;
    }>('/relayer/quickpay', request);
    if (result === null) {
      throw new Error('无法执行Relayer QuickPay，请稍后重试');
    }
    return result;
  },

  /**
   * 创建 Session（ERC-8004）
   */
  createSession: async (request: {
    signer: string;
    sessionId?: string;
    singleLimit: number;
    dailyLimit: number;
    expiryDays: number;
    signature: string;
    agentId?: string;
  }): Promise<{
    sessionId: string;
    signer: string;
    singleLimit: string;
    dailyLimit: string;
    expiry: Date;
  }> => {
    const result = await apiClient.post<{
      sessionId: string;
      signer: string;
      singleLimit: string;
      dailyLimit: string;
      expiry: Date;
    }>('/sessions', request);
    if (result === null) {
      throw new Error('无法创建Session，请稍后重试');
    }
    return result;
  },

  /**
   * 撤销 Session
   */
  revokeSession: async (sessionId: string): Promise<void> => {
    return apiClient.delete(`/sessions/${sessionId}`);
  },

  /**
   * 获取用户的 Session 列表
   */
  getSessions: async (): Promise<any[]> => {
    const result = await apiClient.get<any[]>('/sessions');
    return result ?? [];
  },

  /**
   * 获取活跃 Session
   */
  getActiveSession: async (): Promise<any> => {
    const result = await apiClient.get<any>('/sessions/active');
    if (result === null) {
      throw new Error('无法获取活跃Session，请稍后重试');
    }
    return result;
  },

  /**
   * 获取实时汇率
   */
  getExchangeRate: async (from: string, to: string): Promise<ExchangeRateInfo> => {
    const result = await apiClient.get<ExchangeRateInfo>(
      `/payments/exchange-rate/quotes?from=${from}&to=${to}`
    );
    if (result === null) {
      throw new Error('无法获取汇率，请稍后重试');
    }
    return result;
  },

  /**
   * 锁定汇率
   */
  lockExchangeRate: async (params: {
    from: string;
    to: string;
    amount: number;
    expiresIn?: number;
  }): Promise<ExchangeRateLock> => {
    const result = await apiClient.post<ExchangeRateLock>(
      '/payments/exchange-rate/lock',
      params
    );
    if (result === null) {
      throw new Error('无法锁定汇率，请稍后重试');
    }
    return result;
  },

  /**
   * 验证锁定汇率
   */
  getExchangeRateLock: async (lockId: string): Promise<ExchangeRateLockInfo> => {
    const result = await apiClient.get<ExchangeRateLockInfo>(
      `/payments/exchange-rate/lock/${lockId}`
    );
    if (result === null) {
      throw new Error('无法获取锁定汇率，请稍后重试');
    }
    return result;
  },

  /**
   * 获取合约地址
   */
  getContractAddress: async (): Promise<{
    commissionContractAddress: string;
    erc8004ContractAddress?: string;
    usdcAddress?: string;
  }> => {
    const result = await apiClient.get<{
      commissionContractAddress: string;
      erc8004ContractAddress?: string;
      usdcAddress?: string;
    }>('/payments/contract-address');
    if (result === null) {
      throw new Error('无法获取合约地址，请稍后重试');
    }
    return result;
  },

  /**
   * 检查X402授权状态
   */
  checkX402Authorization: async (): Promise<X402Authorization | null> => {
    try {
      const result = await apiClient.get<X402Authorization>('/payments/x402/authorization');
      return result;
    } catch (error: any) {
      // 如果是404或未授权，返回null
      if (error?.status === 404 || error?.status === 401) {
        return null;
      }
      // 其他错误也返回null，不阻塞用户体验
      console.warn('检查X402授权失败:', error);
      return null;
    }
  },

  /**
   * 创建X402授权
   */
  createX402Authorization: async (request: {
    singleLimit: number;
    dailyLimit: number;
    durationDays?: number;
  }): Promise<X402Authorization> => {
    const result = await apiClient.post<X402Authorization>('/payments/x402/authorization', request);
    if (result === null) {
      throw new Error('无法创建X402授权，请稍后重试');
    }
    return result;
  },

  // ========================================
  // Stripe 支付相关 API
  // ========================================

  /**
   * 创建 Stripe PaymentIntent
   */
  createStripePaymentIntent: async (params: {
    amount: number;
    currency: string;
    orderId?: string;
    merchantId?: string;
    agentId?: string;
    description?: string;
    skillLayerType?: 'INFRA' | 'RESOURCE' | 'LOGIC' | 'COMPOSITE';
    metadata?: Record<string, any>;
  }): Promise<{
    clientSecret: string;
    paymentIntentId: string;
    amount: number;
    currency: string;
    status: string;
  }> => {
    const result = await apiClient.post<{
      clientSecret: string;
      paymentIntentId: string;
      amount: number;
      currency: string;
      status: string;
    }>('/payments/stripe/create-intent', params);
    if (result === null) {
      throw new Error('无法创建 Stripe 支付意图，请稍后重试');
    }
    return result;
  },

  /**
   * 获取 Stripe 支付状态
   */
  getStripePaymentStatus: async (paymentIntentId: string): Promise<{
    status: 'pending' | 'processing' | 'succeeded' | 'failed' | 'canceled';
    amount?: number;
    currency?: string;
    metadata?: Record<string, any>;
  }> => {
    const result = await apiClient.get<{
      status: 'pending' | 'processing' | 'succeeded' | 'failed' | 'canceled';
      amount?: number;
      currency?: string;
      metadata?: Record<string, any>;
    }>(`/payments/stripe/status/${paymentIntentId}`);
    if (result === null) {
      throw new Error('无法获取 Stripe 支付状态，请稍后重试');
    }
    return result;
  },

  /**
   * 取消 Stripe 支付
   */
  cancelStripePayment: async (paymentIntentId: string): Promise<boolean> => {
    const result = await apiClient.post<{ success: boolean }>(
      `/payments/stripe/cancel/${paymentIntentId}`,
      {}
    );
    return result?.success ?? false;
  },

  /**
   * 创建 Stripe 退款
   */
  createStripeRefund: async (params: {
    paymentIntentId: string;
    amount?: number;
    reason?: 'duplicate' | 'fraudulent' | 'requested_by_customer';
  }): Promise<{
    refundId: string;
    amount: number;
    status: string;
  }> => {
    const result = await apiClient.post<{
      refundId: string;
      amount: number;
      status: string;
    }>('/payments/stripe/refund', params);
    if (result === null) {
      throw new Error('无法创建退款，请稍后重试');
    }
    return result;
  },

  /**
   * 计算 Stripe 手续费
   */
  calculateStripeFee: async (amount: number, isInternational?: boolean): Promise<{
    fee: number;
    feeRate: number;
    netAmount: number;
  }> => {
    const params = new URLSearchParams({
      amount: amount.toString(),
      ...(isInternational !== undefined && { isInternational: isInternational.toString() }),
    });
    const result = await apiClient.get<{
      fee: number;
      feeRate: number;
      netAmount: number;
    }>(`/payments/stripe/calculate-fee?${params}`);
    if (result === null) {
      throw new Error('无法计算手续费，请稍后重试');
    }
    return result;
  },

  /**
   * 获取 Stripe vs Transak 路由建议
   */
  getStripeOrTransakRecommendation: async (params: {
    amount: number;
    fromCurrency: string;
    toCurrency: string;
    merchantPaymentConfig: 'fiat_only' | 'crypto_only' | 'both';
    isCrossBorder?: boolean;
    preferCrypto?: boolean;
  }): Promise<{
    provider: 'stripe' | 'transak';
    reason: string;
    estimatedFee: number;
    feeBreakdown: {
      providerFee: number;
      networkFee?: number;
      platformFee: number;
    };
  }> => {
    const result = await apiClient.post<{
      provider: 'stripe' | 'transak';
      reason: string;
      estimatedFee: number;
      feeBreakdown: {
        providerFee: number;
        networkFee?: number;
        platformFee: number;
      };
    }>('/payments/routing/stripe-or-transak', params);
    if (result === null) {
      throw new Error('无法获取支付路由建议，请稍后重试');
    }
    return result;
  },

  /**
   * 获取多通道报价比较
   */
  getMultiChannelQuotes: async (params: {
    amount: number;
    fromCurrency: string;
    toCurrency?: string;
    merchantPaymentConfig: 'fiat_only' | 'crypto_only' | 'both';
  }): Promise<{
    stripe?: {
      available: boolean;
      fee: number;
      netAmount: number;
      estimatedTime: string;
    };
    transak?: {
      available: boolean;
      fee: number;
      cryptoAmount?: number;
      estimatedTime: string;
    };
    wallet?: {
      available: boolean;
      fee: number;
      estimatedTime: string;
    };
    recommendation: 'stripe' | 'transak' | 'wallet';
    reason: string;
  }> => {
    const result = await apiClient.post<{
      stripe?: {
        available: boolean;
        fee: number;
        netAmount: number;
        estimatedTime: string;
      };
      transak?: {
        available: boolean;
        fee: number;
        cryptoAmount?: number;
        estimatedTime: string;
      };
      wallet?: {
        available: boolean;
        fee: number;
        estimatedTime: string;
      };
      recommendation: 'stripe' | 'transak' | 'wallet';
      reason: string;
    }>('/payments/routing/multi-channel-quotes', params);
    if (result === null) {
      throw new Error('无法获取多通道报价，请稍后重试');
    }
    return result;
  },

  // ========================================
  // Stablecoin (USDC via Stripe MPP) API
  // ========================================

  /**
   * 获取 Stablecoin 支付可用状态
   */
  getStablecoinStatus: async (): Promise<{
    available: boolean;
    supportedNetworks: string[];
    supportedCurrencies: string[];
    maxAmount: number;
    currency: string;
  }> => {
    const result = await apiClient.get<{
      available: boolean;
      supportedNetworks: string[];
      supportedCurrencies: string[];
      maxAmount: number;
      currency: string;
    }>('/stablecoin-payments/status');
    if (result === null) {
      throw new Error('无法获取 Stablecoin 状态，请稍后重试');
    }
    return result;
  },

  /**
   * 计算 Stablecoin 手续费
   */
  getStablecoinFees: async (amount: number, network: string): Promise<{
    fee: number;
    feeRate: number;
    networkFee: number;
    netAmount: number;
  }> => {
    const params = new URLSearchParams({
      amount: amount.toString(),
      network,
    });
    const result = await apiClient.get<{
      fee: number;
      feeRate: number;
      networkFee: number;
      netAmount: number;
    }>(`/stablecoin-payments/fees?${params}`);
    if (result === null) {
      throw new Error('无法计算 Stablecoin 手续费，请稍后重试');
    }
    return result;
  },

  /**
   * 获取可用的 Stablecoin 支付方式（按网络）
   */
  getStablecoinMethods: async (amount: number): Promise<{
    methods: Array<{
      network: string;
      stablecoin: string;
      fee: number;
      available: boolean;
    }>;
  }> => {
    const result = await apiClient.get<{
      methods: Array<{
        network: string;
        stablecoin: string;
        fee: number;
        available: boolean;
      }>;
    }>(`/stablecoin-payments/methods?amount=${amount}`);
    if (result === null) {
      throw new Error('无法获取 Stablecoin 支付方式，请稍后重试');
    }
    return result;
  },

  /**
   * 创建 Stablecoin PaymentIntent
   */
  createStablecoinPaymentIntent: async (params: {
    amount: number;
    network: string;
    orderId?: string;
    merchantId?: string;
    agentId?: string;
    description?: string;
  }): Promise<{
    paymentIntentId: string;
    clientSecret: string;
    amount: number;
    currency: string;
    stablecoin: string;
    network: string;
    status: string;
  }> => {
    const result = await apiClient.post<{
      paymentIntentId: string;
      clientSecret: string;
      amount: number;
      currency: string;
      stablecoin: string;
      network: string;
      status: string;
    }>('/stablecoin-payments/create-intent', params);
    if (result === null) {
      throw new Error('无法创建 Stablecoin 支付意图，请稍后重试');
    }
    return result;
  },

  /**
   * 创建 Stablecoin 支付（含数据库记录）
   */
  createStablecoinPayment: async (params: {
    amount: number;
    network: string;
    orderId?: string;
    merchantId?: string;
    agentId?: string;
    description?: string;
  }): Promise<{
    paymentId: string;
    clientSecret: string;
    paymentIntentId: string;
  }> => {
    const result = await apiClient.post<{
      paymentId: string;
      clientSecret: string;
      paymentIntentId: string;
    }>('/stablecoin-payments/create-payment', params);
    if (result === null) {
      throw new Error('无法创建 Stablecoin 支付，请稍后重试');
    }
    return result;
  },

  /**
   * 查询 Stablecoin 支付状态
   */
  getStablecoinPaymentStatus: async (paymentIntentId: string): Promise<{
    status: string;
    amount: number;
    network: string;
    confirmedAt?: string;
  }> => {
    const result = await apiClient.get<{
      status: string;
      amount: number;
      network: string;
      confirmedAt?: string;
    }>(`/stablecoin-payments/${paymentIntentId}/status`);
    if (result === null) {
      throw new Error('无法获取 Stablecoin 支付状态，请稍后重试');
    }
    return result;
  },
};
