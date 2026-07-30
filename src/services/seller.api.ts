// 卖家 API 服务
import { apiFetch } from './api';

// ========== 类型定义 ==========

export interface SellerDashboard {
  totalSkills: number;
  totalRevenue: number;
  monthlyRevenue: number;
  monthlyCallCount: number;
  revenueChange: number; // 环比变化百分比
}

export interface SellerSkill {
  id: string;
  name: string;
  rating: number;
  monthlyCallCount: number;
  monthlyRevenue: number;
  revenueChange: number; // 环比变化百分比
  totalReviews: number;
  newReviews: number;
  status: 'active' | 'paused' | 'draft';
}

// ========== Mock 数据 ==========

const MOCK_DASHBOARD: SellerDashboard = {
  totalSkills: 3,
  totalRevenue: 4560,
  monthlyRevenue: 856,
  monthlyCallCount: 2400,
  revenueChange: 23,
};

const MOCK_SELLER_SKILLS: SellerSkill[] = [
  {
    id: 'skill-1',
    name: 'GPT-4 Translation',
    rating: 4.8,
    monthlyCallCount: 1200,
    monthlyRevenue: 456,
    revenueChange: 23,
    totalReviews: 326,
    newReviews: 5,
    status: 'active',
  },
  {
    id: 'skill-3',
    name: 'Image Generation Pro',
    rating: 4.9,
    monthlyCallCount: 800,
    monthlyRevenue: 280,
    revenueChange: 15,
    totalReviews: 512,
    newReviews: 12,
    status: 'active',
  },
  {
    id: 'skill-8',
    name: 'Code Review Bot',
    rating: 4.4,
    monthlyCallCount: 400,
    monthlyRevenue: 120,
    revenueChange: -5,
    totalReviews: 203,
    newReviews: 3,
    status: 'active',
  },
];

// ========== API 方法 ==========

export const sellerApi = {
  // 获取卖家总览
  async getDashboard(): Promise<SellerDashboard> {
    try {
      return await apiFetch('/seller/dashboard');
    } catch (e) {
      return MOCK_DASHBOARD;
    }
  },

  // 获取我发布的技能列表
  async getMySkills(): Promise<SellerSkill[]> {
    try {
      return await apiFetch('/seller/skills');
    } catch (e) {
      return MOCK_SELLER_SKILLS;
    }
  },

  // 获取单个技能统计
  async getSkillStats(skillId: string): Promise<SellerSkill> {
    try {
      return await apiFetch(`/seller/skills/${skillId}/stats`);
    } catch (e) {
      return MOCK_SELLER_SKILLS.find(s => s.id === skillId) || MOCK_SELLER_SKILLS[0];
    }
  },
};
