/**
 * UCP (Universal Commerce Protocol) API Client
 * 前端与后端 UCP 端点的交互封装
 */

import { apiClient } from './client';

// UCP 业务配置文件
export interface UCPBusinessProfile {
  name: string;
  description?: string;
  logo?: string;
  supportedCurrencies: string[];
  paymentMethods: string[];
  ucpVersion: string;
  endpoints: {
    checkout: string;
    capabilities: string;
  };
}

// UCP Checkout Session
export interface UCPCheckoutSession {
  id: string;
  status: 'open' | 'processing' | 'completed' | 'cancelled';
  customer?: {
    name?: string;
    email?: string;
  };
  lineItems: Array<{
    name: string;
    quantity: number;
    amount: string;
    currency: string;
  }>;
  payment?: {
    method?: string;
    status?: string;
    transactionId?: string;
  };
  metadata?: Record<string, any>;
  createdAt: string;
  updatedAt: string;
}

// UCP 能力发现响应
export interface UCPCapabilities {
  commerce: {
    payment: string[];
    split: string[];
    budget: string[];
    publish: string[];
  };
  protocols: {
    ucp: string;
    x402: boolean;
  };
}

// 创建 Checkout 请求
export interface CreateCheckoutRequest {
  lineItems: Array<{
    name: string;
    quantity: number;
    amount: string;
    currency: string;
  }>;
  customer?: {
    name?: string;
    email?: string;
  };
  successUrl?: string;
  cancelUrl?: string;
  metadata?: Record<string, any>;
}

// 更新 Checkout 请求
export interface UpdateCheckoutRequest {
  customer?: {
    name?: string;
    email?: string;
  };
  paymentMethod?: string;
  metadata?: Record<string, any>;
}

export const ucpApi = {
  /**
   * 获取 UCP 业务配置文件
   */
  async getBusinessProfile(): Promise<UCPBusinessProfile> {
    return apiClient.get<UCPBusinessProfile>('/.well-known/ucp');
  },

  /**
   * 获取 UCP 能力发现
   */
  async getCapabilities(): Promise<UCPCapabilities> {
    try {
      return await apiClient.get<UCPCapabilities>('/ucp/capabilities');
    } catch {
      // 如果端点不存在，返回默认能力
      return {
        commerce: {
          payment: ['create', 'query', 'refund'],
          split: ['create', 'update', 'delete'],
          budget: ['create', 'milestone', 'release'],
          publish: ['task', 'product', 'skill'],
        },
        protocols: {
          ucp: '1.0',
          x402: true,
        },
      };
    }
  },

  /**
   * 创建 UCP Checkout Session
   */
  async createCheckout(data: CreateCheckoutRequest): Promise<UCPCheckoutSession> {
    return apiClient.post<UCPCheckoutSession>('/ucp/v1/checkout-sessions', data);
  },

  /**
   * 获取 Checkout Session
   */
  async getCheckout(sessionId: string): Promise<UCPCheckoutSession> {
    return apiClient.get<UCPCheckoutSession>(`/ucp/v1/checkout-sessions/${sessionId}`);
  },

  /**
   * 更新 Checkout Session
   */
  async updateCheckout(sessionId: string, data: UpdateCheckoutRequest): Promise<UCPCheckoutSession> {
    return apiClient.put<UCPCheckoutSession>(`/ucp/v1/checkout-sessions/${sessionId}`, data);
  },

  /**
   * 完成 Checkout Session
   */
  async completeCheckout(sessionId: string, paymentDetails?: any): Promise<UCPCheckoutSession> {
    return apiClient.post<UCPCheckoutSession>(`/ucp/v1/checkout-sessions/${sessionId}/complete`, { paymentDetails });
  },

  /**
   * 取消 Checkout Session
   */
  async cancelCheckout(sessionId: string, reason?: string): Promise<UCPCheckoutSession> {
    return apiClient.post<UCPCheckoutSession>(`/ucp/v1/checkout-sessions/${sessionId}/cancel`, { reason });
  },
};

export default ucpApi;
