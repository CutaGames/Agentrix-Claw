import { apiClient } from './client';

export interface Airdrop {
  id: string;
  userId: string;
  agentId?: string;
  projectName: string;
  description?: string;
  chain: string;
  tokenAddress?: string;
  tokenSymbol?: string;
  estimatedAmount?: number;
  currency: string;
  status: 'monitoring' | 'eligible' | 'claimed' | 'expired' | 'failed';
  requirements?: string[];
  metadata?: Record<string, any>;
  claimUrl?: string;
  claimTransactionHash?: string;
  claimedAt?: string;
  expiresAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface EligibilityCheck {
  eligible: boolean;
  missingRequirements?: string[];
}

export interface ClaimResult {
  success: boolean;
  transactionHash?: string;
  error?: string;
}

export const airdropApi = {
  /**
   * 获取用户的空投列表
   */
  getAirdrops: async (params?: {
    status?: string;
    agentId?: string;
  }): Promise<Airdrop[]> => {
    const query = new URLSearchParams();
    if (params?.status) query.set('status', params.status);
    if (params?.agentId) query.set('agentId', params.agentId);
    const result = await apiClient.get<Airdrop[]>(`/auto-earn/airdrops${query.toString() ? `?${query.toString()}` : ''}`);
    return result ?? [];
  },

  /**
   * 发现新的空投机会
   */
  discoverAirdrops: async (agentId?: string): Promise<Airdrop[]> => {
    const result = await apiClient.post<Airdrop[]>('/auto-earn/airdrops/discover', { agentId });
    return result ?? [];
  },

  /**
   * 检查空投是否符合领取条件
   */
  checkEligibility: async (airdropId: string): Promise<EligibilityCheck> => {
    const result = await apiClient.post<EligibilityCheck>(`/auto-earn/airdrops/${airdropId}/check-eligibility`);
    if (result === null) {
      throw new Error('无法检查空投资格，请稍后重试');
    }
    return result;
  },

  /**
   * 领取空投
   */
  claimAirdrop: async (airdropId: string): Promise<ClaimResult> => {
    const result = await apiClient.post<ClaimResult>(`/auto-earn/airdrops/${airdropId}/claim`);
    if (result === null) {
      throw new Error('无法领取空投，请稍后重试');
    }
    return result;
  },
};

