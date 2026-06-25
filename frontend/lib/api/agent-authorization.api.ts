import { apiClient } from './client';

/**
 * Agent授权API客户端
 */

export interface StrategyPermissionConfig {
  strategyType: 'dca' | 'grid' | 'arbitrage' | 'market_making' | 'rebalancing';
  allowed: boolean;
  maxAmount?: number;
  maxFrequency?: number;
  frequencyPeriod?: 'hour' | 'day';
  allowedTokens?: string[];
  allowedDEXs?: string[];
  allowedCEXs?: string[];
  riskLimits?: {
    maxDrawdown?: number;
    maxLeverage?: number;
    stopLoss?: number;
    takeProfit?: number;
    maxPositionSize?: number;
  };
}

export interface AgentAuthorization {
  id: string;
  // Friendly name of the agent (optional, provided by backend when available)
  agentName?: string;
  agentId: string;
  // compatibility alias used in some UI code
  type?: string;
  userId: string;
  walletAddress: string;
  authorizationType: 'erc8004' | 'mpc' | 'api_key';
  sessionId?: string;
  mpcWalletId?: string;
  singleLimit?: number;
  dailyLimit?: number;
  totalLimit?: number;
  usedToday: number;
  usedTotal: number;
  expiry?: string;
  lastResetDate?: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  strategyPermissions?: AgentStrategyPermission[];
  executionHistory?: AgentExecutionHistory[];
}

export interface AgentStrategyPermission {
  id: string;
  agentAuthorizationId: string;
  strategyType: 'dca' | 'grid' | 'arbitrage' | 'market_making' | 'rebalancing';
  allowed: boolean;
  maxAmount?: number;
  maxFrequency?: number;
  frequencyPeriod: 'hour' | 'day';
  allowedTokens?: string[];
  allowedDEXs?: string[];
  allowedCEXs?: string[];
  riskLimits?: {
    maxDrawdown?: number;
    maxLeverage?: number;
    stopLoss?: number;
    takeProfit?: number;
    maxPositionSize?: number;
  };
  createdAt: string;
  updatedAt: string;
}

export interface AgentExecutionHistory {
  id: string;
  agentId: string;
  authorizationId: string;
  strategyType?: string;
  executionType: 'payment' | 'trading' | 'market_making' | 'arbitrage';
  amount?: number;
  tokenAddress?: string;
  dexName?: string;
  cexName?: string;
  status: 'success' | 'failed' | 'rejected' | 'pending';
  errorMessage?: string;
  transactionHash?: string;
  executedAt: string;
  metadata?: Record<string, any>;
}

export interface CreateAgentAuthorizationDto {
  agentId: string;
  authorizationType: 'erc8004' | 'mpc' | 'api_key';
  walletAddress: string;
  singleLimit?: number;
  dailyLimit?: number;
  totalLimit?: number;
  expiry?: string;
  allowedStrategies: StrategyPermissionConfig[];
  sessionId?: string;
  mpcWalletId?: string;
}

export const agentAuthorizationApi = {
  /**
   * 创建Agent授权
   */
  createAuthorization: async (dto: CreateAgentAuthorizationDto): Promise<AgentAuthorization> => {
    return apiClient.post<AgentAuthorization>('/agent-authorization', dto);
  },

  /**
   * 获取用户的所有Agent授权
   */
  getAuthorizations: async (): Promise<AgentAuthorization[]> => {
    return apiClient.get<AgentAuthorization[]>('/agent-authorization/user');
  },

  /**
   * 获取Agent的所有授权
   */
  getAuthorizationsByAgentId: async (agentId: string): Promise<AgentAuthorization[]> => {
    return apiClient.get<AgentAuthorization[]>(`/agent-authorization/agent/${agentId}`);
  },

  /**
   * 获取Agent的激活授权
   */
  getActiveAuthorization: async (agentId: string): Promise<AgentAuthorization | null> => {
    return apiClient.get<AgentAuthorization | null>(`/agent-authorization/agent/${agentId}/active`);
  },

  /**
   * 获取授权详情
   */
  getAuthorization: async (id: string): Promise<AgentAuthorization> => {
    return apiClient.get<AgentAuthorization>(`/agent-authorization/${id}`);
  },

  /**
   * 撤销授权
   */
  revokeAuthorization: async (id: string): Promise<void> => {
    return apiClient.delete(`/agent-authorization/${id}`);
  },

  /**
   * 获取执行历史
   */
  getExecutionHistory: async (authorizationId: string): Promise<AgentExecutionHistory[]> => {
    return apiClient.get<AgentExecutionHistory[]>(`/agent-authorization/${authorizationId}/execution-history`);
  },

  /**
   * 检查策略权限（用于测试）
   */
  checkPermission: async (params: {
    agentId: string;
    strategyType: string;
    amount: number;
    tokenAddress: string;
    dexName?: string;
    cexName?: string;
  }): Promise<{ allowed: boolean; reason?: string }> => {
    return apiClient.post<{ allowed: boolean; reason?: string }>('/agent-authorization/check-permission', params);
  },
};

