import { apiClient } from './client';

export interface CreatePayIntentRequest {
  type: 'order_payment' | 'service_payment' | 'asset_payment' | 'task_payment' | 'subscription';
  userId?: string;
  amount: number;
  currency: string;
  description?: string;
  orderId?: string;
  merchantId?: string;
  agentId?: string;
  paymentMethod?: {
    type: string;
    details?: any;
  };
  metadata?: {
    returnUrl?: string;
    cancelUrl?: string;
    successUrl?: string;
    [key: string]: any;
  };
  expiresIn?: number;
}

export interface PayIntent {
  id: string;
  type: string;
  status: 'created' | 'requires_payment_method' | 'requires_confirmation' | 'requires_action' | 'processing' | 'requires_capture' | 'canceled' | 'succeeded' | 'completed' | 'failed' | 'expired';
  amount: number;
  currency: string;
  description?: string;
  orderId?: string;
  paymentId?: string;
  merchantId?: string;
  agentId?: string;
  paymentMethod?: any;
  authorization?: {
    authorized: boolean;
    authorizedAt?: string;
    authorizedBy?: string;
    quickPayGrantId?: string;
    expiresAt?: string;
  };
  metadata?: {
    payUrl?: string;
    qrCode?: string;
    deepLink?: string;
    transactionHash?: string;
    returnUrl?: string;
    cancelUrl?: string;
    successUrl?: string;
    [key: string]: any;
  };
  expiresAt?: string;
  createdAt: string;
  updatedAt: string;
}

export const payIntentApi = {
  /**
   * 创建PayIntent
   */
  create: async (request: CreatePayIntentRequest): Promise<PayIntent> => {
    return apiClient.post<PayIntent>('/pay-intents', request);
  },

  /**
   * 获取PayIntent详情
   */
  get: async (payIntentId: string): Promise<PayIntent> => {
    return apiClient.get<PayIntent>(`/pay-intents/${payIntentId}`);
  },

  /**
   * 授权PayIntent
   */
  authorize: async (
    payIntentId: string,
    authorizationType: 'user' | 'agent' | 'quickpay' = 'user',
    quickPayGrantId?: string,
  ): Promise<PayIntent> => {
    return apiClient.post<PayIntent>(`/pay-intents/${payIntentId}/authorize`, {
      authorizationType,
      quickPayGrantId,
    });
  },

  /**
   * 执行PayIntent
   */
  execute: async (payIntentId: string, metadata?: any): Promise<PayIntent> => {
    return apiClient.post<PayIntent>(`/pay-intents/${payIntentId}/execute`, metadata);
  },

  /**
   * 取消PayIntent
   */
  cancel: async (payIntentId: string): Promise<PayIntent> => {
    return apiClient.put<PayIntent>(`/pay-intents/${payIntentId}/cancel`);
  },
};

