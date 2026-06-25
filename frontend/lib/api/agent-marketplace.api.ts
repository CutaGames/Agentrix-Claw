import { apiClient } from './client';

export interface AgentStats {
  agentId: string;
  totalCalls: number;
  totalRevenue: number;
  totalUsers: number;
  avgRating: number;
  lastActiveAt: string;
}

export interface AgentRanking {
  agentId: string;
  agentName: string;
  rank: number;
  score: number;
  stats: AgentStats;
}

export interface AgentSearchOptions {
  keyword?: string;
  category?: string;
  minRating?: number;
  sortBy?: 'popularity' | 'rating' | 'revenue' | 'recent';
  page?: number;
  pageSize?: number;
}

export interface AgentSearchResult {
  agents: AgentRanking[];
  total: number;
  page: number;
  pageSize: number;
  rankings?: AgentRanking[]; // 可选的排名信息
}

export interface AgentRecommendation {
  agents: AgentRanking[];
}

export const agentMarketplaceApi = {
  async searchAgents(options: AgentSearchOptions): Promise<AgentSearchResult | null> {
    const params = new URLSearchParams();
    if (options.keyword) params.append('keyword', options.keyword);
    if (options.category) params.append('category', options.category);
    if (options.minRating) params.append('minRating', options.minRating.toString());
    if (options.sortBy) params.append('sortBy', options.sortBy);
    params.append('page', (options.page || 1).toString());
    params.append('pageSize', (options.pageSize || 20).toString());

    const response = await apiClient.get<AgentSearchResult>(`/marketplace/agents/search?${params.toString()}`);
    return response;
  },

  async recommendAgents(limit: number = 10): Promise<AgentRecommendation | null> {
    const response = await apiClient.get<AgentRecommendation>(`/marketplace/agents/recommend?limit=${limit}`);
    return response;
  },

  async getAgentStats(agentId: string): Promise<AgentStats | null> {
    const response = await apiClient.get<AgentStats>(`/marketplace/agents/${agentId}/stats`);
    return response;
  },

  async recordAgentCall(agentId: string): Promise<{ success: boolean } | null> {
    const response = await apiClient.post<{ success: boolean }>(`/marketplace/agents/${agentId}/call`);
    return response;
  },

  async getAgentRankings(agentIds: string[]): Promise<AgentRanking[] | null> {
    const params = new URLSearchParams();
    if (agentIds.length > 0) {
      params.append('agentIds', agentIds.join(','));
    }
    const response = await apiClient.get<AgentRanking[]>(`/marketplace/agents/rankings?${params.toString()}`);
    return response;
  },
};

