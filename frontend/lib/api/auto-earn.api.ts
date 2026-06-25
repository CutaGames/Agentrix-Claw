import { apiClient } from './client';

export interface AutoEarnTask {
  id: string;
  type: 'airdrop' | 'task' | 'strategy' | 'referral';
  title: string;
  description: string;
  status: 'available' | 'running' | 'completed' | 'failed';
  reward: {
    amount: number;
    currency: string;
    type: 'token' | 'fiat' | 'nft';
  };
  metadata?: any;
  createdAt: string;
  completedAt?: string;
}

export interface AutoEarnStats {
  totalEarnings: number;
  currency: string;
  tasksCompleted: number;
  tasksRunning: number;
  tasksAvailable: number;
  earningsByType: {
    airdrop: number;
    task: number;
    strategy: number;
    referral: number;
  };
  recentEarnings: Array<{
    date: string;
    amount: number;
    type: string;
  }>;
}

export const autoEarnApi = {
  getTasks: async (agentId?: string): Promise<AutoEarnTask[]> => {
    const params = agentId ? { agentId } : {};
    return apiClient.get<AutoEarnTask[]>('/auto-earn/tasks', { params });
  },

  executeTask: async (taskId: string, agentId?: string): Promise<{
    success: boolean;
    task: AutoEarnTask;
    reward?: any;
  }> => {
    return apiClient.post(`/auto-earn/tasks/${taskId}/execute`, { agentId });
  },

  getStats: async (agentId?: string): Promise<AutoEarnStats> => {
    const params = agentId ? { agentId } : {};
    return apiClient.get<AutoEarnStats>('/auto-earn/stats', { params });
  },

  toggleStrategy: async (
    strategyId: string,
    enabled: boolean,
    agentId?: string,
  ): Promise<{ success: boolean; strategy: any }> => {
    return apiClient.post(`/auto-earn/strategies/${strategyId}/toggle`, {
      enabled,
      agentId,
    });
  },
};

