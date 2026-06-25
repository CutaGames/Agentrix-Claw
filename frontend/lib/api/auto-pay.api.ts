import { apiClient } from './client';

export interface CreateGrantDto {
  agentId: string;
  singleLimit: number;
  dailyLimit: number;
  duration: number;
  description?: string;
  monthlyLimit?: number;
  merchantScope?: string[];
  categoryScope?: string[];
}

export interface UpdateGrantDto {
  singleLimit?: number;
  dailyLimit?: number;
  monthlyLimit?: number;
  merchantScope?: string[];
  categoryScope?: string[];
  description?: string;
}

export interface GrantInfo {
  id: string;
  agentId: string;
  singleLimit: number;
  dailyLimit: number;
  monthlyLimit?: number;
  usedToday: number;
  usedThisMonth?: number;
  totalUsed: number;
  expiresAt: string;
  isActive: boolean;
  isAutoPay: boolean;
  authorizationType: 'manual' | 'auto_pay';
  merchantScope?: string[];
  categoryScope?: string[];
  description?: string;
  status: 'active' | 'revoked' | 'expired' | 'suspended';
  createdAt: string;
  updatedAt: string;
}

export const autoPayApi = {
  /**
   * 创建授权
   */
  createGrant: async (dto: CreateGrantDto): Promise<GrantInfo> => {
    return apiClient.post<GrantInfo>('/auto-pay/grants', dto);
  },

  /**
   * 获取授权列表
   */
  getGrants: async (): Promise<GrantInfo[]> => {
    return apiClient.get<GrantInfo[]>('/auto-pay/grants');
  },

  /**
   * 更新授权
   */
  updateGrant: async (id: string, dto: UpdateGrantDto): Promise<GrantInfo> => {
    return apiClient.put<GrantInfo>(`/auto-pay/grants/${id}`, dto);
  },

  /**
   * 撤销授权
   */
  revokeGrant: async (id: string): Promise<void> => {
    return apiClient.delete(`/auto-pay/grants/${id}`);
  },

  /**
   * 执行自动支付
   */
  execute: async (dto: {
    grantId: string;
    amount: number;
    recipient: string;
    description?: string;
  }): Promise<any> => {
    return apiClient.post('/auto-pay/execute', dto);
  },
};

