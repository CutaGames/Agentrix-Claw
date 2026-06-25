import { apiClient } from './client';

export interface CreateQuickPayGrantRequest {
  paymentMethod: {
    type: string;
    methodId?: string;
    details?: any;
  };
  permissions: {
    maxAmount?: number;
    maxDailyAmount?: number;
    maxTransactions?: number;
    allowedMerchants?: string[];
    allowedCategories?: string[];
  };
  description?: string;
  expiresIn?: number;
}

export interface QuickPayGrant {
  id: string;
  userId: string;
  status: 'active' | 'revoked' | 'expired';
  paymentMethod: {
    type: string;
    methodId?: string;
    details?: any;
  };
  permissions: {
    maxAmount?: number;
    maxDailyAmount?: number;
    maxTransactions?: number;
    allowedMerchants?: string[];
    allowedCategories?: string[];
  };
  description?: string;
  expiresAt?: string;
  usage: {
    totalAmount: number;
    dailyAmount: number;
    transactionCount: number;
    lastResetDate: string;
  };
  createdAt: string;
  updatedAt: string;
}

export const quickPayGrantApi = {
  /**
   * 创建QuickPay授权
   */
  create: async (request: CreateQuickPayGrantRequest): Promise<QuickPayGrant> => {
    return apiClient.post<QuickPayGrant>('/quick-pay-grants', request);
  },

  /**
   * 获取我的授权列表
   */
  getMyGrants: async (): Promise<QuickPayGrant[]> => {
    return apiClient.get<QuickPayGrant[]>('/quick-pay-grants');
  },

  /**
   * 获取授权详情
   */
  get: async (grantId: string): Promise<QuickPayGrant> => {
    return apiClient.get<QuickPayGrant>(`/quick-pay-grants/${grantId}`);
  },

  /**
   * 撤销授权
   */
  revoke: async (grantId: string): Promise<QuickPayGrant> => {
    return apiClient.put<QuickPayGrant>(`/quick-pay-grants/${grantId}/revoke`);
  },
};

