import { apiClient } from './client';

export type SocialAccountType = 'google' | 'apple' | 'x' | 'telegram' | 'discord';

export interface SocialAccount {
  id: string;
  type: SocialAccountType;
  socialId: string;
  email?: string;
  username?: string;
  displayName?: string;
  avatarUrl?: string;
  connectedAt: string;
  lastUsedAt: string;
}

export interface BindSocialAccountDto {
  type: SocialAccountType;
  socialId: string;
  email?: string;
  username?: string;
  displayName?: string;
  avatarUrl?: string;
  metadata?: Record<string, any>;
}

export const socialAccountApi = {
  /**
   * 获取用户的社交账号绑定列表
   */
  getAccounts: async (): Promise<SocialAccount[]> => {
    const response = await apiClient.get<SocialAccount[]>('/auth/social/accounts');
    return response;
  },

  /**
   * 绑定社交账号
   */
  bind: async (dto: BindSocialAccountDto): Promise<SocialAccount> => {
    const response = await apiClient.post<SocialAccount>('/auth/social/bind', dto);
    return response;
  },

  /**
   * 解绑社交账号
   */
  unbind: async (type: SocialAccountType): Promise<{ message: string }> => {
    const response = await apiClient.delete<{ message: string }>(`/auth/social/unbind/${type}`);
    return response;
  },
};

