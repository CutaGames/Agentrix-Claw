import { apiClient } from './client';

export interface AgentChatRequest {
  message: string;
  context?: any;
  sessionId?: string;
}

export interface AgentChatResponse {
  response: string;
  type?: 'product' | 'product_search' | 'price_comparison' | 'service' | 'onchain_asset' | 'order' | 'code' | 'guide' | 'faq' | 'refund' | 'logistics' | 'workflow' | 'view_cart' | 'add_to_cart' | 'checkout' | 'payment' | 'pay_order' | 'error' | 'unknown';
  data?: any;
  sessionId?: string;
}

export interface ClaudeChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface ClaudeChatRequest {
  messages: ClaudeChatMessage[];
  sessionId?: string;
  agentId?: string;
  mode?: 'ask' | 'agent' | 'plan';
  platform?: 'desktop' | 'mobile' | 'web';
  deviceId?: string;
  context?: {
    userId?: string;
    sessionId?: string;
  };
  options?: {
    model?: string;
    temperature?: number;
    maxTokens?: number;
    enableModelRouting?: boolean;
  };
}

export interface ClaudeChatResponse {
  text: string;
  toolCalls?: any[] | null;
}

export interface CodeGenerateRequest {
  prompt: string;
  language: 'typescript' | 'javascript' | 'python';
}

export interface CodeExample {
  title: string;
  description: string;
  code: string;
  language: string;
  examples?: string[];
}

export interface ProductSearchResult {
  id: string;
  name: string;
  description?: string;
  price: number;
  currency: string;
  category: string;
  stock: number;
  merchantId: string;
  commissionRate: number;
  metadata?: any;
  score?: number;
}

export interface ProductSearchResponse {
  products: ProductSearchResult[];
  comparison?: {
    cheapest: ProductSearchResult;
    bestValue: ProductSearchResult;
    averagePrice: number;
  };
}

export interface ServiceProduct {
  id: string;
  name: string;
  description: string;
  price: number;
  currency: string;
  type: 'virtual_service' | 'consultation' | 'technical_service' | 'subscription';
  merchantId: string;
  metadata?: any;
}

export interface OnChainAsset {
  id: string;
  type: 'nft' | 'token' | 'game_item';
  contract: string;
  tokenId?: string;
  chain: 'solana' | 'ethereum' | 'bsc' | 'polygon';
  name: string;
  description?: string;
  price: number;
  currency: string;
  owner: string;
  metadata?: any;
}

export interface CreateOrderRequest {
  productId: string;
  quantity?: number;
  metadata?: any;
}

export interface CreateOrderResponse {
  order: any;
  paymentIntent?: any;
}

export interface QueryOrdersResponse {
  orders: any[];
  logistics?: any[];
}

export interface ProcessRefundRequest {
  orderId: string;
  reason?: string;
}

export interface ProcessRefundResponse {
  refund: any;
  order: any;
}

export const agentApi = {
  /**
   * Agent服务健康检查
   */
  health: async (): Promise<{ status: string; timestamp: string; service: string; version: string } | null> => {
    return apiClient.get('/agent/health');
  },

  /**
   * Agent对话（V3.0增强版）
   */
  chat: async (request: AgentChatRequest): Promise<AgentChatResponse | null> => {
    return apiClient.post<AgentChatResponse>('/agent/chat', {
      message: request.message,
      context: request.context,
      sessionId: request.sessionId,
    });
  },

  /**
   * Claude / Bedrock 长任务对话
   */
  claudeChat: async (request: ClaudeChatRequest): Promise<ClaudeChatResponse | null> => {
    return apiClient.post<ClaudeChatResponse>('/claude/chat', request);
  },

  /**
   * 商品搜索/比价（V3.0：多平台聚合、自动比价）
   */
  searchProducts: async (query: string, filters?: {
    priceMin?: number;
    priceMax?: number;
    category?: string;
    currency?: string;
    inStock?: boolean;
  }): Promise<ProductSearchResponse | null> => {
    return apiClient.post<ProductSearchResponse>('/agent/search-products', { query, filters });
  },

  /**
   * 服务推荐（V3.0：虚拟服务、咨询服务、技术服务）
   */
  searchServices: async (query: string, filters?: {
    type?: 'virtual_service' | 'consultation' | 'technical_service' | 'subscription';
    priceMax?: number;
  }): Promise<ServiceProduct[] | null> => {
    return apiClient.post<ServiceProduct[]>('/agent/search-services', { query, filters });
  },

  /**
   * 链上资产识别（V3.0：NFT、Token、链游资产）
   */
  searchOnChainAssets: async (query: string, filters?: {
    type?: 'nft' | 'token' | 'game_item';
    chain?: 'solana' | 'ethereum' | 'bsc' | 'polygon';
  }): Promise<OnChainAsset[] | null> => {
    return apiClient.post<OnChainAsset[]>('/agent/search-onchain-assets', { query, filters });
  },

  /**
   * 自动下单（V3.0：全流程自动化）
   */
  createOrder: async (request: CreateOrderRequest): Promise<CreateOrderResponse | null> => {
    return apiClient.post<CreateOrderResponse>('/agent/create-order', request);
  },

  /**
   * 订单查询/物流跟踪（V3.0）
   */
  queryOrders: async (orderId?: string): Promise<QueryOrdersResponse | null> => {
    const url = orderId ? `/agent/orders?orderId=${orderId}` : '/agent/orders';
    return apiClient.get<QueryOrdersResponse>(url);
  },

  /**
   * 处理退款/售后（V3.0）
   */
  processRefund: async (request: ProcessRefundRequest): Promise<ProcessRefundResponse | null> => {
    return apiClient.post<ProcessRefundResponse>('/agent/refund', request);
  },

  /**
   * 生成代码示例（基础版）
   */
  generateCode: async (request: CodeGenerateRequest): Promise<CodeExample[] | null> => {
    return apiClient.post<CodeExample[]>('/agent/generate-code', request);
  },

  /**
   * 增强代码生成（V3.0：支持更多场景）
   */
  generateEnhancedCode: async (request: CodeGenerateRequest): Promise<CodeExample[] | null> => {
    return apiClient.post<CodeExample[]>('/agent/generate-enhanced-code', request);
  },

  /**
   * 获取FAQ答案
   */
  getFaq: async (question: string): Promise<{ answer: string; related?: string[] } | null> => {
    return apiClient.get(`/agent/faq?question=${encodeURIComponent(question)}`);
  },

  /**
   * 获取操作引导
   */
  getGuide: async (type: 'register' | 'login' | 'api' | 'payment'): Promise<{
    title: string;
    steps: string[];
  } | null> => {
    return apiClient.get(`/agent/guide?type=${type}`);
  },

  /**
   * 获取用户会话列表
   */
  getSessions: async (): Promise<{ sessions: any[] } | null> => {
    return apiClient.get('/agent/sessions');
  },

  /**
   * 获取会话详情和历史消息
   */
  getSession: async (sessionId: string): Promise<{
    session: any;
    messages: any[];
  } | null> => {
    return apiClient.get(`/agent/sessions/${sessionId}`);
  },

  /**
   * 获取情景感知推荐（V3.0）
   */
  getRecommendations: async (sessionId?: string, query?: string, entities?: any): Promise<{
    products: Array<{
      id: string;
      name: string;
      description?: string;
      price: number;
      currency: string;
      score: number;
      reason: string;
      source: string;
    }>;
  } | null> => {
    return apiClient.post('/agent/recommendations', {
      sessionId,
      query,
      entities,
    });
  },
};

