/**
 * RAG API 接口定义
 * 
 * 为 AI 模型提供智能推荐和语义检索能力
 */

/**
 * 用户上下文
 */
export interface UserContext {
  userId?: string;
  sessionId?: string;
  location?: {
    country?: string;
    city?: string;
  };
  preferences?: {
    preferredPaymentMethods?: string[];
    preferredMerchants?: string[];
    priceRange?: { min?: number; max?: number };
    categories?: string[];
  };
  history?: {
    previousPurchases?: string[];
    preferredCategories?: string[];
    searchHistory?: string[];
  };
}

/**
 * RAG 搜索请求
 */
export interface RAGSearchRequest {
  query: string;
  context?: UserContext;
  filters?: {
    priceMin?: number;
    priceMax?: number;
    currency?: string;
    category?: string;
    inStock?: boolean;
    merchantId?: string;
  };
  limit?: number;
  offset?: number;
}

/**
 * 商品推荐（带推荐理由）
 */
export interface ProductRecommendation {
  productId: string;
  product: {
    id: string;
    name: string;
    description?: string;
    price: number;
    currency: string;
    category: string;
    stock: number;
    merchantId: string;
    metadata?: any;
  };
  score: number; // 相关性分数 (0-1)
  reason: string; // 推荐理由（AI 生成）
  relevanceFactors?: {
    semanticMatch?: number;
    priceMatch?: number;
    categoryMatch?: number;
    userPreference?: number;
  };
}

/**
 * RAG 搜索响应
 */
export interface RAGSearchResponse {
  query: string;
  recommendations: ProductRecommendation[];
  total: number;
  context?: UserContext;
  searchMetadata?: {
    searchTime: number;
    vectorSearchCount: number;
    rerankTime: number;
  };
}

