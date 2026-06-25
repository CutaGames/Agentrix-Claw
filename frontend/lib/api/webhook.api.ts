import { apiClient } from './client';

export interface WebhookConfig {
  id: string;
  userId: string;
  url: string;
  events: string[];
  secret: string;
  active: boolean;
  retryCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface WebhookEvent {
  id: string;
  configId: string;
  eventType: string;
  payload: any;
  status: 'pending' | 'delivered' | 'failed';
  attempts: number;
  lastAttemptAt?: string;
  deliveredAt?: string;
  error?: string;
  createdAt: string;
}

export const webhookApi = {
  /**
   * 创建Webhook配置
   */
  create: async (config: {
    url: string;
    events: string[];
  }): Promise<WebhookConfig> => {
    return apiClient.post<WebhookConfig>('/webhooks', config);
  },

  /**
   * 获取Webhook配置列表
   */
  getWebhooks: async (): Promise<WebhookConfig[]> => {
    return apiClient.get<WebhookConfig[]>('/webhooks');
  },

  /**
   * 更新Webhook配置
   */
  update: async (
    id: string,
    updates: {
      url?: string;
      events?: string[];
      active?: boolean;
    },
  ): Promise<WebhookConfig> => {
    return apiClient.put<WebhookConfig>(`/webhooks/${id}`, updates);
  },

  /**
   * 删除Webhook配置
   */
  delete: async (id: string): Promise<void> => {
    return apiClient.delete(`/webhooks/${id}`);
  },

  /**
   * 获取Webhook事件历史
   */
  getEvents: async (
    webhookId: string,
    limit?: number,
  ): Promise<WebhookEvent[]> => {
    const params = new URLSearchParams({ limit: (limit || 50).toString() });
    return apiClient.get<WebhookEvent[]>(`/webhooks/${webhookId}/events?${params}`);
  },
};

