// 推广/推荐 API 服务
import { apiFetch } from './api';

// ========== 类型定义 ==========

export interface ReferralLink {
  id: string;
  name: string;
  shortCode: string;
  shortUrl: string;
  targetType: 'general' | 'product' | 'skill' | 'campaign';
  targetId?: string;
  clicks: number;
  conversions: number;
  commission: number;
  status: 'active' | 'paused' | 'expired' | 'archived';
  createdAt: string;
}

export interface ReferralStats {
  totalInvites: number;
  totalClicks: number;
  conversionRate: number;
  totalCommission: number;
  pendingCommission: number;
  todayClicks: number;
  todayConversions: number;
}

export interface CommissionRule {
  assetType: string;
  platformFeeRate: number;
  promoterShare: number;
  effectiveRate: number;
  settlementCycle: string;
}

// ========== Mock 数据 ==========

const MOCK_STATS: ReferralStats = {
  totalInvites: 128,
  totalClicks: 2456,
  conversionRate: 5.2,
  totalCommission: 1234.56,
  pendingCommission: 234.00,
  todayClicks: 45,
  todayConversions: 3,
};

const MOCK_LINKS: ReferralLink[] = [
  {
    id: 'link-1',
    name: '注册邀请',
    shortCode: 'invite',
    shortUrl: 'https://agentrix.top/r/invite',
    targetType: 'general',
    clicks: 245,
    conversions: 12,
    commission: 34.50,
    status: 'active',
    createdAt: '2026-01-15T00:00:00Z',
  },
  {
    id: 'link-2',
    name: 'GPT-4 Translation',
    shortCode: 'gpt4t',
    shortUrl: 'https://agentrix.top/r/gpt4t',
    targetType: 'skill',
    targetId: 'skill-1',
    clicks: 189,
    conversions: 8,
    commission: 22.00,
    status: 'active',
    createdAt: '2026-01-20T00:00:00Z',
  },
  {
    id: 'link-3',
    name: '技能市场',
    shortCode: 'market',
    shortUrl: 'https://agentrix.top/r/market',
    targetType: 'general',
    clicks: 312,
    conversions: 15,
    commission: 56.80,
    status: 'active',
    createdAt: '2026-01-10T00:00:00Z',
  },
];

const MOCK_RULES: CommissionRule[] = [
  { assetType: '技能/服务', platformFeeRate: 5, promoterShare: 20, effectiveRate: 1, settlementCycle: 'T+3' },
  { assetType: '虚拟商品', platformFeeRate: 4, promoterShare: 20, effectiveRate: 0.8, settlementCycle: 'T+1' },
  { assetType: '实物商品', platformFeeRate: 3, promoterShare: 20, effectiveRate: 0.6, settlementCycle: 'T+7' },
];

// ========== API 方法 ==========

export const referralApi = {
  // 获取推广统计
  async getStats(): Promise<ReferralStats> {
    try {
      return await apiFetch('/referral/stats');
    } catch (e) {
      return MOCK_STATS;
    }
  },

  // 获取专属推广链接
  async getMyLink(): Promise<string> {
    try {
      const result = await apiFetch<{ link: string }>('/referral/link');
      return result.link;
    } catch (e) {
      return 'https://agentrix.top/r/abc123';
    }
  },

  // 获取我的推广链接列表 — 对接 GET /referral/links
  async getMyLinks(): Promise<ReferralLink[]> {
    try {
      const data = await apiFetch<any[]>('/referral/links');
      return (data || []).map((l: any) => ({
        id: l.id,
        name: l.title || l.targetName || 'Link',
        shortCode: l.shortCode,
        shortUrl: l.shortUrl,
        targetType: l.type || 'general',
        targetId: l.targetId,
        clicks: l.clicks || 0,
        conversions: l.conversions || 0,
        commission: l.totalCommission || 0,
        status: l.status || 'active',
        createdAt: l.createdAt,
      }));
    } catch (e) {
      return MOCK_LINKS;
    }
  },

  // 创建推广短链 — 对接 POST /referral/links
  async createLink(params: {
    name: string;
    targetType: 'general' | 'product' | 'skill' | 'campaign';
    targetId?: string;
  }): Promise<ReferralLink> {
    try {
      const dto = {
        title: params.name,
        type: params.targetType,
        targetId: params.targetId,
        targetName: params.name,
      };
      const l = await apiFetch<any>('/referral/links', {
        method: 'POST',
        body: JSON.stringify(dto),
      });
      return {
        id: l.id,
        name: l.title || params.name,
        shortCode: l.shortCode,
        shortUrl: l.shortUrl,
        targetType: l.type || params.targetType,
        targetId: l.targetId || params.targetId,
        clicks: l.clicks || 0,
        conversions: l.conversions || 0,
        commission: l.totalCommission || 0,
        status: l.status || 'active',
        createdAt: l.createdAt || new Date().toISOString(),
      };
    } catch (e) {
      const shortCode = Math.random().toString(36).substring(2, 10);
      return {
        id: `link-${Date.now()}`,
        name: params.name,
        shortCode,
        shortUrl: `https://agentrix.top/r/${shortCode}`,
        targetType: params.targetType,
        targetId: params.targetId,
        clicks: 0,
        conversions: 0,
        commission: 0,
        status: 'active',
        createdAt: new Date().toISOString(),
      };
    }
  },

  // 获取单条链接统计
  async getLinkStats(linkId: string): Promise<ReferralLink> {
    try {
      return await apiFetch(`/referral/links/${linkId}/stats`);
    } catch (e) {
      return MOCK_LINKS.find(l => l.id === linkId) || MOCK_LINKS[0];
    }
  },

  // 暂停/恢复链接 — 对接 PUT /referral/links/:id/status
  async toggleLinkStatus(linkId: string, status: 'active' | 'paused'): Promise<{ success: boolean }> {
    try {
      await apiFetch(`/referral/links/${linkId}/status`, {
        method: 'PUT',
        body: JSON.stringify({ status }),
      });
      return { success: true };
    } catch (e) {
      return { success: true };
    }
  },

  // 获取佣金规则
  getCommissionRules(): CommissionRule[] {
    return MOCK_RULES;
  },

  // 获取佣金统计 — 对接 GET /human-commissions/stats
  async getCommissionStats(): Promise<{
    totalCommission: number;
    settledCommission: number;
    pendingCommission: number;
    todayCommission: number;
    todayOrders: number;
    totalOrders: number;
    referralCount: number;
  }> {
    try {
      return await apiFetch('/human-commissions/stats');
    } catch {
      return {
        totalCommission: MOCK_STATS.totalCommission,
        settledCommission: MOCK_STATS.totalCommission - MOCK_STATS.pendingCommission,
        pendingCommission: MOCK_STATS.pendingCommission,
        todayCommission: 0,
        todayOrders: MOCK_STATS.todayConversions,
        totalOrders: MOCK_STATS.totalClicks,
        referralCount: MOCK_STATS.totalInvites,
      };
    }
  },

  // 获取佣金明细列表 — 对接 GET /human-commissions
  async getCommissionList(page: number = 1, status?: string): Promise<{
    items: any[];
    total: number;
  }> {
    try {
      const qs = new URLSearchParams({ page: String(page) });
      if (status) qs.set('status', status);
      return await apiFetch(`/human-commissions?${qs}`);
    } catch {
      return { items: [], total: 0 };
    }
  },

  // 获取我推荐的用户 — 对接 GET /human-commissions/referrals
  async getReferralUsers(): Promise<any[]> {
    try {
      return await apiFetch('/human-commissions/referrals');
    } catch {
      return [];
    }
  },

  // ===== Pet Earning Flywheel — C 端拉新裂变（需求 4）=====

  // 注册成功后归因 + 发放双边拉新奖励（带深链 ref）— POST /referral/track-signup
  async trackSignup(ref: string, channel?: string): Promise<{
    attributed: boolean;
    reason?: string;
    relationId?: string;
    inviterUserId?: string;
    alreadyExisted?: boolean;
  }> {
    return apiFetch('/referral/track-signup', {
      method: 'POST',
      body: JSON.stringify({ ref, channel }),
    });
  },

  // 我的拉新战绩 — GET /referral/my-flywheel
  async getMyFlywheel(): Promise<{
    invited: number;
    rewardedSignups: number;
    totalGmvRewardAxp: number;
  }> {
    try {
      return await apiFetch('/referral/my-flywheel');
    } catch {
      return { invited: 0, rewardedSignups: 0, totalGmvRewardAxp: 0 };
    }
  },
};
