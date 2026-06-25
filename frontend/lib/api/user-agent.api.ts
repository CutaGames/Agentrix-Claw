import { apiClient } from './client';

export interface KYCStatus {
  level: 'none' | 'basic' | 'verified';
  status: 'pending' | 'approved' | 'rejected' | 'none';
  provider?: string;
  submittedAt?: string;
  approvedAt?: string;
  rejectionReason?: string;
  canReuse: boolean;
}

export interface KYCReuseStatus {
  canReuse: boolean;
  kycLevel: string;
  kycStatus: string;
  reason?: string;
}

export interface MerchantTrustScore {
  merchantId: string;
  trustScore: number;
  trustLevel: 'low' | 'medium' | 'high' | 'excellent';
  totalTransactions: number;
  totalAmount: number;
  successRate: number;
  averageRating?: number;
  lastTransactionAt?: string;
  statistics: {
    completed: number;
    failed: number;
    refunded: number;
    disputed: number;
  };
}

export interface PaymentMemory {
  userId: string;
  preferredPaymentMethod?: string;
  preferredCurrency?: string;
  savedPaymentMethods: Array<{
    type: string;
    methodId: string;
    lastUsed: string;
    usageCount: number;
  }>;
  merchantPreferences: Record<string, {
    preferredMethod?: string;
    lastAmount?: number;
    lastUsed?: string;
  }>;
}

export interface Subscription {
  id: string;
  userId: string;
  merchantId: string;
  amount: number;
  currency: string;
  interval: 'daily' | 'weekly' | 'monthly' | 'yearly';
  nextBillingDate: string;
  status: 'active' | 'paused' | 'cancelled';
  metadata?: any;
}

export interface Budget {
  id: string;
  userId: string;
  category?: string;
  amount: number;
  currency: string;
  period: 'daily' | 'weekly' | 'monthly' | 'yearly';
  startDate: string;
  endDate: string;
  spent: number;
  remaining: number;
  status: 'active' | 'exceeded' | 'completed';
}

export interface TransactionClassification {
  paymentId: string;
  category: string;
  subcategory?: string;
  confidence: number;
  method: 'rule' | 'ml' | 'manual';
}

export const userAgentApi = {
  /**
   * 获取KYC状态
   */
  getKYCStatus: async (): Promise<KYCStatus> => {
    return apiClient.get<KYCStatus>('/user-agent/kyc/status');
  },

  /**
   * 检查KYC复用
   */
  checkKYCReuse: async (merchantId?: string): Promise<KYCReuseStatus> => {
    const params = merchantId ? `?merchantId=${merchantId}` : '';
    return apiClient.get<KYCReuseStatus>(`/user-agent/kyc/check-reuse${params}`);
  },

  /**
   * 获取商家可信度评分
   */
  getMerchantTrust: async (merchantId: string): Promise<MerchantTrustScore> => {
    return apiClient.get<MerchantTrustScore>(`/user-agent/merchant/${merchantId}/trust`);
  },

  /**
   * 获取商家交易统计
   */
  getMerchantStatistics: async (merchantId: string): Promise<any> => {
    return apiClient.get(`/user-agent/merchant/${merchantId}/statistics`);
  },

  /**
   * 获取支付记忆
   */
  getPaymentMemory: async (): Promise<PaymentMemory> => {
    return apiClient.get<PaymentMemory>('/user-agent/payment-memory');
  },

  /**
   * 获取商户推荐支付方式
   */
  getMerchantPreferredMethod: async (merchantId: string): Promise<string | null> => {
    return apiClient.get<string | null>(`/user-agent/merchant/${merchantId}/preferred-method`);
  },

  /**
   * 获取订阅列表
   */
  getSubscriptions: async (): Promise<Subscription[]> => {
    return apiClient.get<Subscription[]>('/user-agent/subscriptions');
  },

  /**
   * 创建预算
   */
  createBudget: async (budget: {
    amount: number;
    currency: string;
    period: 'daily' | 'weekly' | 'monthly' | 'yearly';
    category?: string;
  }): Promise<Budget> => {
    return apiClient.post<Budget>('/user-agent/budget', budget);
  },

  /**
   * 获取预算列表
   */
  getBudgets: async (): Promise<Budget[]> => {
    return apiClient.get<Budget[]>('/user-agent/budgets');
  },

  /**
   * 分类交易
   */
  classifyTransaction: async (paymentId: string): Promise<TransactionClassification> => {
    return apiClient.get<TransactionClassification>(`/user-agent/transactions/${paymentId}/classify`);
  },

  /**
   * 获取交易分类统计
   */
  getCategoryStatistics: async (): Promise<Record<string, number>> => {
    return apiClient.get<Record<string, number>>('/user-agent/transactions/category-statistics');
  },

  /**
   * 获取我的Agent列表
   */
  getMyAgents: async (): Promise<any[]> => {
    return apiClient.get<any[]>('/user-agent/my-agents');
  },

  /**
   * 切换Agent状态
   */
  toggleStatus: async (agentId: string, status: 'active' | 'paused' | 'archived'): Promise<any> => {
    return apiClient.put(`/user-agent/${agentId}/status`, { status });
  },

  /**
   * 获取Agent统计信息
   */
  getStats: async (agentId: string): Promise<any> => {
    return apiClient.get(`/user-agent/${agentId}/stats`);
  },

  /**
   * 订阅/购买 Agent
   */
  subscribe: async (agentId: string): Promise<any> => {
    return apiClient.post(`/user-agent/subscribe/${agentId}`, {});
  },

  /**
   * 删除 Agent
   */
  deleteAgent: async (agentId: string): Promise<any> => {
    return apiClient.delete(`/user-agent/${agentId}`);
  },

  /**
   * 取消订阅
   */
  cancelSubscription: async (subscriptionId: string): Promise<any> => {
    return apiClient.delete(`/user-agent/subscriptions/${subscriptionId}`);
  },
};
