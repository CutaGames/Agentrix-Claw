import { apiClient } from './client';

export interface MerchantReferral {
  id: string;
  agentId: string;
  merchantId: string;
  merchantName?: string;
  merchantEmail?: string;
  status: 'pending' | 'approved' | 'rejected' | 'active';
  oneTimeReward?: number;
  oneTimeRewardPaidAt?: string;
  commissionRate: number;
  totalCommissionEarned: number;
  totalMerchantGMV: number;
  metadata?: Record<string, any>;
  createdAt: string;
  updatedAt: string;
}

export interface ReferralCommission {
  id: string;
  referralId: string;
  agentId: string;
  merchantId: string;
  paymentId: string;
  paymentAmount: number;
  currency: string;
  commissionRate: number;
  commissionAmount: number;
  status: 'pending' | 'settled' | 'cancelled';
  settledAt?: string;
  settlementPeriod?: string;
  metadata?: Record<string, any>;
  createdAt: string;
  updatedAt: string;
}

export interface ReferralStats {
  totalReferrals: number;
  activeReferrals: number;
  totalCommissionEarned: number;
  totalMerchantGMV: number;
  pendingCommissions: number;
}

export interface CreateReferralDto {
  agentId?: string;
  merchantId: string;
  merchantName?: string;
  merchantEmail?: string;
  metadata?: Record<string, any>;
}

export interface UpdateReferralStatusDto {
  status: 'pending' | 'approved' | 'rejected' | 'active';
  oneTimeReward?: number;
}

// ===== Social Referral Link Types =====

export type ReferralLinkType = 'general' | 'product' | 'skill' | 'campaign';
export type ReferralLinkStatus = 'active' | 'paused' | 'expired' | 'archived';

export interface CreateReferralLinkDto {
  title?: string;
  type?: ReferralLinkType;
  targetId?: string;
  targetType?: string;
  targetName?: string;
  channel?: string;
  splitPlanId?: string;
  expiresAt?: string;
  metadata?: Record<string, any>;
}

export interface ReferralLinkResponse {
  id: string;
  shortCode: string;
  shortUrl: string;
  fullUrl: string;
  title?: string;
  type: ReferralLinkType;
  status: ReferralLinkStatus;
  targetId?: string;
  targetName?: string;
  channel?: string;
  clicks: number;
  uniqueClicks: number;
  conversions: number;
  totalCommission: number;
  totalGMV: number;
  conversionRate: number;
  createdAt: string;
}

export interface ReferralLinkStats {
  totalLinks: number;
  totalClicks: number;
  totalUniqueClicks: number;
  totalConversions: number;
  totalCommission: number;
  totalGMV: number;
  conversionRate: number;
}

export const referralApi = {
  /**
   * 创建推广关系
   */
  createReferral: async (dto: CreateReferralDto): Promise<MerchantReferral> => {
    return apiClient.post<MerchantReferral>('/referral', dto);
  },

  /**
   * 获取我的推广关系
   */
  getMyReferrals: async (): Promise<MerchantReferral[]> => {
    return apiClient.get<MerchantReferral[]>('/referral/my-referrals');
  },

  /**
   * 获取推广统计
   */
  getReferralStats: async (): Promise<ReferralStats> => {
    return apiClient.get<ReferralStats>('/referral/stats');
  },

  /**
   * 获取我的推广链接
   */
  getReferralLink: async (): Promise<{ link: string; agentId: string }> => {
    return apiClient.get<{ link: string; agentId: string }>('/referral/link');
  },

  /**
   * 获取推广关系详情
   */
  getReferral: async (referralId: string): Promise<MerchantReferral> => {
    return apiClient.get<MerchantReferral>(`/referral/${referralId}`);
  },

  /**
   * 更新推广关系状态
   */
  updateReferralStatus: async (
    referralId: string,
    dto: UpdateReferralStatusDto,
  ): Promise<MerchantReferral> => {
    return apiClient.put<MerchantReferral>(`/referral/${referralId}/status`, dto);
  },

  /**
   * 获取推广关系的分成记录
   */
  getReferralCommissions: async (
    referralId: string,
    status?: string,
  ): Promise<ReferralCommission[]> => {
    const query = status ? `?status=${status}` : '';
    return apiClient.get<ReferralCommission[]>(`/referral/${referralId}/commissions${query}`);
  },

  /**
   * 获取待结算的分成
   */
  getPendingCommissions: async (): Promise<ReferralCommission[]> => {
    return apiClient.get<ReferralCommission[]>('/referral/commissions/pending');
  },

  /**
   * 获取已结算的分成
   */
  getSettledCommissions: async (period?: string): Promise<ReferralCommission[]> => {
    const query = period ? `?period=${period}` : '';
    return apiClient.get<ReferralCommission[]>(`/referral/commissions/settled${query}`);
  },

  /**
   * 手动触发结算
   */
  settleCommissions: async (period?: string): Promise<{
    settledCount: number;
    totalAmount: number;
  }> => {
    return apiClient.post('/referral/commissions/settle', { period });
  },

  // ===== Social Referral Links =====

  /**
   * 创建推广短链（通用/商品级/Skill级）
   */
  createReferralLink: async (dto: CreateReferralLinkDto): Promise<ReferralLinkResponse> => {
    return apiClient.post<ReferralLinkResponse>('/referral/links', dto);
  },

  /**
   * 获取我的推广短链列表
   */
  getMyReferralLinks: async (type?: ReferralLinkType): Promise<ReferralLinkResponse[]> => {
    const query = type ? `?type=${type}` : '';
    return apiClient.get<ReferralLinkResponse[]>(`/referral/links${query}`);
  },

  /**
   * 获取推广短链统计汇总
   */
  getReferralLinkStats: async (): Promise<ReferralLinkStats> => {
    return apiClient.get<ReferralLinkStats>('/referral/links/stats');
  },

  /**
   * 更新推广短链状态（暂停/恢复）
   */
  updateReferralLinkStatus: async (
    linkId: string,
    status: ReferralLinkStatus,
  ): Promise<ReferralLinkResponse> => {
    return apiClient.put<ReferralLinkResponse>(`/referral/links/${linkId}/status`, { status });
  },

  /**
   * 归档推广短链
   */
  archiveReferralLink: async (linkId: string): Promise<{ success: boolean }> => {
    return apiClient.delete<{ success: boolean }>(`/referral/links/${linkId}`);
  },
};

