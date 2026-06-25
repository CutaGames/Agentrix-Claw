import { apiClient } from './client';

export interface LogisticsTracking {
  orderId: string;
  status: 'pending' | 'packed' | 'shipped' | 'in_transit' | 'delivered' | 'failed';
  trackingNumber?: string;
  carrier?: string;
  events: Array<{
    timestamp: string;
    location?: string;
    description: string;
    status: string;
  }>;
  estimatedDelivery?: string;
  currentLocation?: string;
}

export const logisticsApi = {
  /**
   * 获取物流跟踪信息
   */
  getTracking: async (orderId: string): Promise<LogisticsTracking | null> => {
    return apiClient.get<LogisticsTracking | null>(`/logistics/tracking/${orderId}`);
  },

  /**
   * 更新物流状态
   */
  updateStatus: async (
    orderId: string,
    status: LogisticsTracking['status'],
    trackingNumber?: string,
    carrier?: string,
  ): Promise<LogisticsTracking> => {
    return apiClient.put<LogisticsTracking>(`/logistics/tracking/${orderId}`, {
      status,
      trackingNumber,
      carrier,
    });
  },

  /**
   * 自动更新物流状态
   */
  autoUpdate: async (orderId: string): Promise<LogisticsTracking | null> => {
    return apiClient.post<LogisticsTracking | null>(`/logistics/tracking/${orderId}/auto-update`);
  },
};

