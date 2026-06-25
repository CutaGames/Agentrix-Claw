import { apiClient } from './client';

export interface SearchResult {
  id: string;
  type: 'page' | 'product' | 'user' | 'transaction';
  title: string;
  description?: string;
  url: string;
}

export interface SearchResponse {
  results: SearchResult[];
}

export const searchApi = {
  /**
   * 全局搜索
   */
  search: async (
    query: string,
    params?: {
      type?: string;
      limit?: number;
    },
  ): Promise<SearchResponse> => {
    const queryParams = new URLSearchParams({ q: query });
    if (params?.type) {
      queryParams.append('type', params.type);
    }
    if (params?.limit) {
      queryParams.append('limit', params.limit.toString());
    }

    return apiClient.get<SearchResponse>(`/search?${queryParams.toString()}`);
  },
};

