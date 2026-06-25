import { apiClient } from './client';

export interface AnalyticsData {
  todayGMV: number;
  todayOrders: number;
  successRate: number;
  avgOrderValue: number;
  totalGMV?: number;
  totalOrders?: number;
  period?: {
    startDate: string;
    endDate: string;
  };
}

export interface MerchantAnalytics extends AnalyticsData {
  totalRevenue: number;
  pendingSettlement: number;
  settledAmount: number;
  aiCommission: number;
  netRevenue: number;
}

export const analyticsApi = {
  /**
   * 获取商户数据分析
   */
  getMerchantAnalytics: async (params?: {
    startDate?: string;
    endDate?: string;
  }): Promise<MerchantAnalytics> => {
    const queryParams = new URLSearchParams();
    if (params?.startDate) queryParams.set('startDate', params.startDate);
    if (params?.endDate) queryParams.set('endDate', params.endDate);
    
    const qs = queryParams.toString();
    const result = await apiClient.get<MerchantAnalytics>(`/analytics/merchant${qs ? `?${qs}` : ''}`);
    if (result === null) {
      throw new Error('无法获取商户数据分析，请稍后重试');
    }
    return result;
  },

  /**
   * 获取通用数据分析
   */
  getAnalytics: async (params?: {
    startDate?: string;
    endDate?: string;
  }): Promise<AnalyticsData> => {
    const queryParams = new URLSearchParams();
    if (params?.startDate) queryParams.set('startDate', params.startDate);
    if (params?.endDate) queryParams.set('endDate', params.endDate);
    
    const qs = queryParams.toString();
    const result = await apiClient.get<AnalyticsData>(`/analytics${qs ? `?${qs}` : ''}`);
    if (result === null) {
      throw new Error('无法获取数据分析，请稍后重试');
    }
    return result;
  },
};

