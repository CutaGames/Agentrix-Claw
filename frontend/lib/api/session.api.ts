import { apiClient } from './client';

export interface Session {
  id: string;
  sessionId: string;
  signer: string;
  singleLimit: number;
  dailyLimit: number;
  usedToday: number;
  expiry: string;
  isActive: boolean;
  agentId?: string;
  createdAt: string;
  status: 'active' | 'revoked' | 'expired' | 'archived';
}

export interface CreateSessionDto {
  signer: string;
  singleLimit: number;
  dailyLimit: number;
  expiryDays: number;
  agentId?: string;
  signature: string;
  sessionId?: string;
}

export const sessionApi = {
  /**
   * 获取用户的所有 Session
   */
  getSessions: async (): Promise<Session[]> => {
    const result = await apiClient.get<Session[]>('/sessions');
    return result || [];
  },

  /**
   * 获取活跃的 Session
   */
  getActiveSession: async (): Promise<Session | null> => {
    const result = await apiClient.get<{ data: Session | null }>('/sessions/active');
    return result?.data || null;
  },

  /**
   * 创建 Session
   */
  createSession: async (dto: CreateSessionDto): Promise<Session> => {
    const result = await apiClient.post<Session>('/sessions', dto);
    if (!result) {
      throw new Error('Failed to create session');
    }
    return result;
  },

  /**
   * 撤销 Session
   */
  revokeSession: async (sessionId: string): Promise<{ success: boolean }> => {
    const result = await apiClient.delete<{ success: boolean }>(`/sessions/${sessionId}`);
    if (!result) {
      throw new Error('Failed to revoke session');
    }
    return result;
  },
};
