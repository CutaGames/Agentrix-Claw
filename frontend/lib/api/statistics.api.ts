import { apiClient } from './client';

export interface ApiStatistics {
  todayCalls: number;
  totalCalls: number;
  successRate: number;
  avgResponseTime: number;
  period?: {
    startDate: string;
    endDate: string;
  };
}

export interface DeveloperRevenue {
  totalRevenue: number;
  todayRevenue: number;
  commission: number;
  pending: number;
  period?: {
    startDate: string;
    endDate: string;
  };
}

export interface TrendPoint {
  date: string;
  value: number;
}

export const statisticsApi = {
  /**
   * 获取API统计
   */
  getApiStatistics: async (params?: {
    startDate?: string;
    endDate?: string;
  }): Promise<ApiStatistics> => {
    const queryParams = new URLSearchParams();
    if (params?.startDate) queryParams.set('startDate', params.startDate);
    if (params?.endDate) queryParams.set('endDate', params.endDate);
    
    const qs = queryParams.toString();
    const result = await apiClient.get<ApiStatistics>(`/statistics/api${qs ? `?${qs}` : ''}`);
    if (result === null) {
      throw new Error('无法获取API统计，请稍后重试');
    }
    return result;
  },

  /**
   * 获取开发者收益
   */
  getDeveloperRevenue: async (params?: {
    startDate?: string;
    endDate?: string;
  }): Promise<DeveloperRevenue> => {
    const queryParams = new URLSearchParams();
    if (params?.startDate) queryParams.set('startDate', params.startDate);
    if (params?.endDate) queryParams.set('endDate', params.endDate);
    
    const qs = queryParams.toString();
    const result = await apiClient.get<DeveloperRevenue>(`/statistics/revenue${qs ? `?${qs}` : ''}`);
    if (result === null) {
      throw new Error('无法获取开发者收益，请稍后重试');
    }
    return result;
  },

  /**
   * API调用趋势
   */
  getApiTrend: async (params?: {
    granularity?: 'day' | 'hour';
    startDate?: string;
    endDate?: string;
  }): Promise<TrendPoint[]> => {
    const queryParams = new URLSearchParams();
    if (params?.granularity) queryParams.set('granularity', params.granularity);
    if (params?.startDate) queryParams.set('startDate', params.startDate);
    if (params?.endDate) queryParams.set('endDate', params.endDate);

    const qs = queryParams.toString();
    const result = await apiClient.get<TrendPoint[]>(`/statistics/api/trend${qs ? `?${qs}` : ''}`);
    return result ?? [];
  },

  /**
   * 开发者收益趋势
   */
  getRevenueTrend: async (params?: {
    granularity?: 'day' | 'week';
    startDate?: string;
    endDate?: string;
  }): Promise<TrendPoint[]> => {
    const queryParams = new URLSearchParams();
    if (params?.granularity) queryParams.set('granularity', params.granularity);
    if (params?.startDate) queryParams.set('startDate', params.startDate);
    if (params?.endDate) queryParams.set('endDate', params.endDate);

    const qs = queryParams.toString();
    const result = await apiClient.get<TrendPoint[]>(`/statistics/revenue/trend${qs ? `?${qs}` : ''}`);
    return result ?? [];
  },
};

