/**
 * 底座大模型统一接口
 * 支持多种实现：Groq（临时）、自建模型（目标）、其他LLM提供商
 */

export interface IntentRecognitionResult {
  intent: 'dca' | 'swap' | 'rebalancing' | 'arbitrage' | 'market_making' | 'product_search' | 'payment' | 'other';
  entities: {
    amount?: number;
    percentage?: number;
    fromToken?: string;
    toToken?: string;
    frequency?: 'daily' | 'weekly' | 'monthly';
    schedule?: string;
    [key: string]: any;
  };
  confidence: number; // 0-100
}

export interface RiskAssessmentResult {
  riskScore: number; // 0-100
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  riskFactors: {
    amount?: number;
    frequency?: number;
    kycStatus?: string;
    historyScore?: number;
    [key: string]: any;
  };
  recommendation: string;
}

export interface TransactionCategory {
  category: string;
  subcategory?: string;
  tags: string[];
  confidence: number; // 0-100
}

export interface RouteSuggestion {
  recommendedRoute: {
    paymentMethod: string;
    sourceChain: string;
    targetChain: string;
    estimatedFee: number;
    successRate: number;
  };
  alternatives?: Array<{
    paymentMethod: string;
    estimatedFee: number;
    successRate: number;
  }>;
  reasoning: string;
}

export interface AssetAnalysis {
  riskScore: number; // 0-100
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  recommendations: string[];
  warnings?: string[];
  distribution?: Array<{
    chain: string;
    percentage: number;
    usdValue: number;
  }>;
}

export interface TransactionContext {
  amount: number;
  currency: string;
  type?: string;
  chain?: string;
  kycStatus?: string;
  userId?: string;
  [key: string]: any;
}

export interface TransactionData {
  transactionId: string;
  userId: string;
  amount: number;
  currency: string;
  description?: string;
  merchantName?: string;
  category?: string;
  [key: string]: any;
}

export interface RoutingContext {
  userId?: string;
  agentId?: string;
  amount: number;
  currency: string;
  sourceChain?: string;
  targetChain?: string;
  paymentMethod?: string;
  kycStatus?: string;
  quickPayAvailable?: boolean;
  [key: string]: any;
}

export interface RouteOptions {
  paymentMethod: string;
  sourceChain: string;
  targetChain: string;
  estimatedFee: number;
  successRate: number;
}

export interface AggregatedAssets {
  userId: string;
  totalUsdValue: number;
  assets: Array<{
    chain: string;
    tokenAddress: string;
    tokenSymbol: string;
    balance: string;
    usdValue: number;
  }>;
  fiatAccounts?: Array<{
    provider: string;
    accountType: string;
    balance: number;
    currency: string;
    lastSyncedAt: Date;
  }>;
}

/**
 * 底座大模型统一接口
 */
export interface IFoundationLLM {
  /**
   * 意图识别
   * 将自然语言转换为结构化意图
   */
  recognizeIntent(
    text: string,
    context?: {
      userId?: string;
      history?: any[];
      sessionId?: string;
    }
  ): Promise<IntentRecognitionResult>;

  /**
   * 风险评估
   * 基于交易上下文进行风险评分
   */
  assessRisk(
    transaction: TransactionContext,
    userHistory?: any[]
  ): Promise<RiskAssessmentResult>;

  /**
   * 交易分类
   * AI Ledger自动分类交易
   */
  classifyTransaction(
    transaction: TransactionData,
    userContext?: any
  ): Promise<TransactionCategory>;

  /**
   * 路由建议
   * 基于上下文建议最优支付路由
   */
  suggestPaymentRoute(
    context: RoutingContext,
    options?: RouteOptions[]
  ): Promise<RouteSuggestion>;

  /**
   * 资产分析
   * 分析资产健康度和风险
   */
  analyzeAssets(
    assets: AggregatedAssets,
    userContext?: any
  ): Promise<AssetAnalysis>;

  /**
   * 获取模型信息
   */
  getModelInfo(): {
    provider: string; // 'groq' | 'paymind' | 'openai' | 'claude'
    modelName: string;
    version: string;
    isTemporary: boolean; // 是否为临时实现
  };
}

