import { apiClient } from './client';

export interface ArbitrageOpportunity {
  id: string;
  pair: string;
  chain: string;
  dex1: string;
  dex2: string;
  price1: number;
  price2: number;
  priceDiff: number;
  profitRate: number;
  estimatedProfit: number;
  minAmount: number;
  maxAmount: number;
  riskLevel: 'low' | 'medium' | 'high';
  expiresAt: string;
}

export interface LaunchpadProject {
  id: string;
  name: string;
  chain: string;
  tokenSymbol: string;
  salePrice: number;
  listingPrice?: number;
  totalSupply: number;
  saleSupply: number;
  soldSupply: number;
  startTime: string;
  endTime: string;
  minPurchase: number;
  maxPurchase: number;
  whitelistRequired: boolean;
  status: 'upcoming' | 'active' | 'ended' | 'listed';
  platform: string;
}

export interface StrategyConfig {
  id: string;
  userId: string;
  agentId?: string;
  type: 'arbitrage' | 'launchpad' | 'dca' | 'grid' | 'copy_trading';
  enabled: boolean;
  config: Record<string, any>;
  createdAt: string;
  updatedAt: string;
}

export const autoEarnAdvancedApi = {
  // ========== 套利功能 ==========
  async scanArbitrageOpportunities(chains?: string[], pairs?: string[]): Promise<ArbitrageOpportunity[]> {
    const params = new URLSearchParams();
    if (chains) params.append('chains', chains.join(','));
    if (pairs) params.append('pairs', pairs.join(','));
    
    const response = await apiClient.get<ArbitrageOpportunity[]>(`/auto-earn/arbitrage/opportunities?${params.toString()}`);
    return response;
  },

  async executeArbitrage(opportunityId: string, amount: number, agentId?: string): Promise<{ success: boolean; transactionHash?: string }> {
    const response = await apiClient.post<{ success: boolean; transactionHash?: string }>('/auto-earn/arbitrage/execute', {
      opportunityId,
      amount,
      agentId,
    });
    return response;
  },

  async startAutoArbitrageStrategy(config: any, agentId?: string): Promise<{ strategyId: string }> {
    const response = await apiClient.post<{ strategyId: string }>('/auto-earn/arbitrage/auto-strategy', {
      config,
      agentId,
    });
    return response;
  },

  // ========== Launchpad功能 ==========
  async discoverLaunchpadProjects(platforms?: string[]): Promise<LaunchpadProject[]> {
    const params = new URLSearchParams();
    if (platforms) params.append('platforms', platforms.join(','));
    
    const response = await apiClient.get<LaunchpadProject[]>(`/auto-earn/launchpad/projects?${params.toString()}`);
    return response;
  },

  async participateInLaunchpad(projectId: string, amount: number, agentId?: string): Promise<{ success: boolean; transactionHash?: string }> {
    const response = await apiClient.post<{ success: boolean; transactionHash?: string }>('/auto-earn/launchpad/participate', {
      projectId,
      amount,
      agentId,
    });
    return response;
  },

  async startAutoLaunchpadStrategy(config: any, agentId?: string): Promise<{ strategyId: string }> {
    const response = await apiClient.post<{ strategyId: string }>('/auto-earn/launchpad/auto-strategy', {
      config,
      agentId,
    });
    return response;
  },

  // ========== 策略管理 ==========
  async createStrategy(type: string, config: any, agentId?: string): Promise<StrategyConfig> {
    const response = await apiClient.post<StrategyConfig>('/auto-earn/strategies/create', {
      type,
      config,
      agentId,
    });
    return response;
  },

  async getUserStrategies(agentId?: string): Promise<StrategyConfig[]> {
    const params = new URLSearchParams();
    if (agentId) params.append('agentId', agentId);
    
    const response = await apiClient.get<StrategyConfig[]>(`/auto-earn/strategies?${params.toString()}`);
    return response;
  },

  async getStrategy(strategyId: string): Promise<StrategyConfig> {
    const response = await apiClient.get<StrategyConfig>(`/auto-earn/strategies/${strategyId}`);
    return response;
  },

  async startStrategy(strategyId: string): Promise<{ success: boolean }> {
    const response = await apiClient.post<{ success: boolean }>(`/auto-earn/strategies/${strategyId}/start`);
    return response;
  },

  async stopStrategy(strategyId: string): Promise<{ success: boolean }> {
    const response = await apiClient.post<{ success: boolean }>(`/auto-earn/strategies/${strategyId}/stop`);
    return response;
  },
};

