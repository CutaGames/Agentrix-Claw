// 技能市场 API 服务
import { apiFetch } from './api';

// ========== 类型定义 ==========

export interface SkillItem {
  id: string;
  name: string;
  description: string;
  author: string;
  authorId: string;
  category: 'resources' | 'skills' | 'tasks';
  subCategory?: string;
  price: number;
  priceUnit: string; // e.g. "次调用", "月", "次"
  rating: number;
  reviewCount: number;
  likeCount: number;
  usageCount: number; // "XX人在用"
  callCount: number; // 总调用次数
  agentCompatible: boolean; // 🤖 Agent 兼容
  tags: string[];
  isLiked?: boolean;
  isFavorited?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface SkillDetail extends SkillItem {
  longDescription: string;
  weeklyCallCount: number;
  successRate: number;
  avgLatency: number; // ms
  commissionPerCall: number; // 推广佣金预估
  reviews: ReviewItem[];
}

export interface ReviewItem {
  id: string;
  userId: string;
  userName: string;
  rating: number;
  comment: string;
  createdAt: string;
}

export interface MarketplaceSearchParams {
  q?: string;
  category?: 'resources' | 'skills' | 'tasks';
  subCategory?: string;
  agentCompatible?: boolean;
  sortBy?: 'popular' | 'newest' | 'rating' | 'price';
  page?: number;
  limit?: number;
}

export interface MarketplaceSearchResponse {
  items: SkillItem[];
  total: number;
  page: number;
  totalPages: number;
}

// ========== API 方法 ==========

export const marketplaceApi = {
  // 搜索技能 — 对接后端 GET /unified-marketplace/search
  async search(params: MarketplaceSearchParams): Promise<MarketplaceSearchResponse> {
    try {
      const qs = new URLSearchParams();
      if (params.q) qs.set('q', params.q);
      if (params.category === 'resources') qs.append('layer', 'resource');
      else if (params.category === 'skills') {
        qs.append('layer', 'logic');
        qs.append('layer', 'infra');
        qs.append('layer', 'composite');
      }
      // tasks handled by separate TaskMarketplace
      qs.set('humanAccessible', 'true');
      qs.set('limit', String(params.limit || 20));
      qs.set('page', String(params.page || 1));
      if (params.sortBy === 'rating') qs.set('sortBy', 'rating');
      else if (params.sortBy === 'newest') qs.set('sortBy', 'createdAt');
      else qs.set('sortBy', 'callCount');
      qs.set('sortOrder', 'DESC');

      const data = await apiFetch<any>(`/unified-marketplace/search?${qs}`);
      // Map backend Skill format → mobile SkillItem format
      const items: SkillItem[] = (data.items || []).map((s: any) => ({
        id: s.id,
        name: s.displayName || s.name,
        description: s.description || '',
        author: s.authorInfo?.name || 'Unknown',
        authorId: s.authorInfo?.id || '',
        category: s.layer === 'resource' ? 'resources' as const : 'skills' as const,
        subCategory: s.category || s.resourceType,
        price: s.pricing?.pricePerCall || 0,
        priceUnit: s.pricing?.currency || 'USD',
        rating: s.rating || 0,
        reviewCount: 0,
        likeCount: 0,
        usageCount: s.callCount || 0,
        callCount: s.callCount || 0,
        agentCompatible: !s.humanAccessible || true,
        tags: s.tags || [],
        isLiked: false,
        isFavorited: false,
        createdAt: s.createdAt || new Date().toISOString(),
        updatedAt: s.updatedAt || new Date().toISOString(),
      }));
      // If API returns empty results, return empty (no more mock fallback)
      return {
        items,
        total: data.total || items.length,
        page: params.page || 1,
        totalPages: Math.ceil((data.total || items.length) / (params.limit || 20)),
      };
    } catch (e) {
      console.warn('Marketplace search failed:', e);
      return {
        items: [],
        total: 0,
        page: params.page || 1,
        totalPages: 0,
      };
    }
  },

  // 获取热门技能
  async getTrending(limit: number = 6): Promise<SkillItem[]> {
    try {
      const data = await apiFetch<any[]>(`/unified-marketplace/trending?limit=${limit}`);
      return (data || []).map((item: any) => {
        const s = item.skill || item;
        return {
          id: s.id,
          name: s.displayName || s.name,
          description: s.description || '',
          author: s.authorInfo?.name || 'Unknown',
          authorId: s.authorInfo?.id || '',
          category: s.layer === 'resource' ? 'resources' as const : 'skills' as const,
          subCategory: s.category || s.resourceType,
          price: s.pricing?.pricePerCall || 0,
          priceUnit: s.pricing?.currency || 'USD',
          rating: s.rating || 0,
          reviewCount: 0,
          likeCount: 0,
          usageCount: s.callCount || 0,
          callCount: s.callCount || 0,
          agentCompatible: true,
          tags: s.tags || [],
          isLiked: false,
          isFavorited: false,
          createdAt: s.createdAt || new Date().toISOString(),
          updatedAt: s.updatedAt || new Date().toISOString(),
        };
      });
    } catch (e) {
      return [];
    }
  },

  // 获取技能详情
  async getDetail(id: string): Promise<SkillDetail> {
    try {
      const s = await apiFetch<any>(`/unified-marketplace/skills/${id}`);
      return {
        id: s.id,
        name: s.displayName || s.name,
        description: s.description || '',
        author: s.authorInfo?.name || 'Unknown',
        authorId: s.authorInfo?.id || '',
        category: s.layer === 'resource' ? 'resources' : 'skills',
        subCategory: s.category || s.resourceType,
        price: s.pricing?.pricePerCall || 0,
        priceUnit: s.pricing?.currency || 'USD',
        rating: s.rating || 0,
        reviewCount: 0,
        likeCount: 0,
        usageCount: s.callCount || 0,
        callCount: s.callCount || 0,
        agentCompatible: true,
        tags: s.tags || [],
        isLiked: false,
        isFavorited: false,
        createdAt: s.createdAt || new Date().toISOString(),
        updatedAt: s.updatedAt || new Date().toISOString(),
        longDescription: s.description || '',
        weeklyCallCount: Math.floor((s.callCount || 0) * 0.1),
        successRate: 99.2,
        avgLatency: 1200,
        commissionPerCall: (s.pricing?.pricePerCall || 0) * (s.pricing?.commissionRate || 20) / 100,
        reviews: [],
      };
    } catch (e) {
      // No mock fallback — return a minimal error detail
      return {
        id: id,
        name: 'Unknown Skill',
        description: 'Could not load details for this skill.',
        author: 'Unknown',
        authorId: '',
        category: 'skills',
        price: 0,
        priceUnit: 'USD',
        rating: 0,
        reviewCount: 0,
        likeCount: 0,
        usageCount: 0,
        callCount: 0,
        agentCompatible: false,
        tags: [],
        isLiked: false,
        isFavorited: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        longDescription: 'Failed to load skill details. Please try again later.',
        weeklyCallCount: 0,
        successRate: 0,
        avgLatency: 0,
        commissionPerCall: 0,
        reviews: [],
      };
    }
  },

  // 点赞/取消点赞
  async toggleLike(skillId: string): Promise<{ liked: boolean; likeCount: number }> {
    try {
      return await apiFetch(`/skills/${skillId}/like`, { method: 'POST' });
    } catch (e) {
      return { liked: false, likeCount: 0 };
    }
  },

  // 收藏/取消收藏
  async toggleFavorite(skillId: string): Promise<{ favorited: boolean }> {
    try {
      return await apiFetch(`/skills/${skillId}/favorite`, { method: 'POST' });
    } catch (e) {
      return { favorited: false };
    }
  },

  // 获取评价列表
  async getReviews(skillId: string, page: number = 1): Promise<{ reviews: ReviewItem[]; total: number }> {
    try {
      const result = await apiFetch<any>(`/skills/${skillId}/reviews?page=${page}`);
      return {
        reviews: result.reviews || result.items || [],
        total: result.total || 0,
      };
    } catch (e: any) {
      return { reviews: [], total: 0 };
    }
  },

  // 提交评价 — 不再静默返回 mock，让错误冒泡给 UI
  async submitReview(skillId: string, data: { rating: number; comment: string }): Promise<ReviewItem> {
    return await apiFetch<ReviewItem>(`/skills/${skillId}/reviews`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  // 购买技能 — 对接后端 POST /unified-marketplace/purchase
  async purchaseSkill(skillId: string, quantity: number = 1): Promise<{
    success: boolean;
    orderId: string;
    skillName: string;
    totalAmount: number;
    currency: string;
  }> {
    const result = await apiFetch<any>('/unified-marketplace/purchase', {
      method: 'POST',
      body: JSON.stringify({ skillId, quantity }),
    });
    return {
      success: result.success !== false,
      orderId: result.result?.orderId || result.orderId || `ORD-${Date.now()}`,
      skillName: result.result?.skillName || '',
      totalAmount: result.result?.totalAmount || 0,
      currency: result.result?.currency || 'USD',
    };
  },

  // 获取子分类列表
  getSubCategories(category: 'resources' | 'skills' | 'tasks'): string[] {
    const map: Record<string, string[]> = {
      resources: ['All', 'API', 'Data', 'Compute', 'Storage'],
      skills: ['All', 'AI', 'Web3', 'DevTool', 'Design', 'Writing'],
      tasks: ['All', 'Dev', 'Design', 'Translation', 'Labeling'],
    };
    return map[category] || ['All'];
  },
};
