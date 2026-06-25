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

// ========== Mock 数据 ==========

const MOCK_SKILLS: SkillItem[] = [
  {
    id: 'skill-1',
    name: 'GPT-4 Translation',
    description: 'High-quality multilingual translation supporting 50+ languages, powered by fine-tuned GPT-4',
    author: '@ai_studio',
    authorId: 'user-1',
    category: 'skills',
    subCategory: 'AI',
    price: 0.02,
    priceUnit: 'per call',
    rating: 4.8,
    reviewCount: 326,
    likeCount: 89,
    usageCount: 1200,
    callCount: 12500,
    agentCompatible: true,
    tags: ['AI', 'NLP', 'Translation', 'Multilingual'],
    isLiked: false,
    isFavorited: false,
    createdAt: '2025-12-01T00:00:00Z',
    updatedAt: '2026-02-10T00:00:00Z',
  },
  {
    id: 'skill-2',
    name: 'Market Data API',
    description: 'Real-time financial market data covering stocks, crypto, and forex',
    author: '@data_pro',
    authorId: 'user-2',
    category: 'resources',
    subCategory: 'Data',
    price: 0.01,
    priceUnit: 'per call',
    rating: 4.5,
    reviewCount: 198,
    likeCount: 56,
    usageCount: 800,
    callCount: 8200,
    agentCompatible: true,
    tags: ['Data', 'Finance', 'API'],
    isLiked: false,
    isFavorited: false,
    createdAt: '2025-11-15T00:00:00Z',
    updatedAt: '2026-02-08T00:00:00Z',
  },
  {
    id: 'skill-3',
    name: 'Image Generation Pro',
    description: 'AI image generation with multiple styles and high-resolution output',
    author: '@creative_ai',
    authorId: 'user-3',
    category: 'skills',
    subCategory: 'AI',
    price: 0.05,
    priceUnit: 'per image',
    rating: 4.9,
    reviewCount: 512,
    likeCount: 234,
    usageCount: 3500,
    callCount: 45000,
    agentCompatible: true,
    tags: ['AI', 'Image', 'Generation', 'Creative'],
    isLiked: true,
    isFavorited: false,
    createdAt: '2025-10-20T00:00:00Z',
    updatedAt: '2026-02-11T00:00:00Z',
  },
  {
    id: 'skill-4',
    name: 'Smart Contract Audit',
    description: 'Automated smart contract security audit detecting common vulnerabilities',
    author: '@sec_team',
    authorId: 'user-4',
    category: 'skills',
    subCategory: 'Web3',
    price: 2.00,
    priceUnit: 'per audit',
    rating: 4.7,
    reviewCount: 89,
    likeCount: 45,
    usageCount: 320,
    callCount: 1500,
    agentCompatible: false,
    tags: ['Web3', 'Security', 'Audit', 'Smart Contract'],
    isLiked: false,
    isFavorited: true,
    createdAt: '2025-12-10T00:00:00Z',
    updatedAt: '2026-02-09T00:00:00Z',
  },
  {
    id: 'skill-5',
    name: 'SEO Content Writer',
    description: 'AI-powered SEO-optimized content writing with multilingual support',
    author: '@content_lab',
    authorId: 'user-5',
    category: 'skills',
    subCategory: 'AI',
    price: 0.10,
    priceUnit: 'per article',
    rating: 4.3,
    reviewCount: 156,
    likeCount: 67,
    usageCount: 890,
    callCount: 5600,
    agentCompatible: true,
    tags: ['AI', 'SEO', 'Content', 'Writing'],
    isLiked: false,
    isFavorited: false,
    createdAt: '2025-11-01T00:00:00Z',
    updatedAt: '2026-02-07T00:00:00Z',
  },
  {
    id: 'skill-6',
    name: 'Cloud GPU Compute',
    description: 'On-demand GPU compute resources, A100/H100, pay-per-second billing',
    author: '@cloud_infra',
    authorId: 'user-6',
    category: 'resources',
    subCategory: 'Compute',
    price: 0.50,
    priceUnit: 'per hour',
    rating: 4.6,
    reviewCount: 78,
    likeCount: 34,
    usageCount: 450,
    callCount: 2100,
    agentCompatible: true,
    tags: ['GPU', 'Compute', 'Cloud'],
    isLiked: false,
    isFavorited: false,
    createdAt: '2025-12-20T00:00:00Z',
    updatedAt: '2026-02-10T00:00:00Z',
  },
  {
    id: 'skill-7',
    name: 'Logo Design Task',
    description: 'Looking for a modern tech company logo design',
    author: '@startup_x',
    authorId: 'user-7',
    category: 'tasks',
    subCategory: 'Design',
    price: 500,
    priceUnit: 'per project',
    rating: 0,
    reviewCount: 0,
    likeCount: 12,
    usageCount: 0,
    callCount: 0,
    agentCompatible: false,
    tags: ['Design', 'Logo', 'Branding'],
    isLiked: false,
    isFavorited: false,
    createdAt: '2026-02-10T00:00:00Z',
    updatedAt: '2026-02-10T00:00:00Z',
  },
  {
    id: 'skill-8',
    name: 'Code Review Bot',
    description: 'AI code review supporting 20+ languages, auto-detect bugs and security issues',
    author: '@dev_tools',
    authorId: 'user-8',
    category: 'skills',
    subCategory: 'DevTool',
    price: 0.03,
    priceUnit: 'per review',
    rating: 4.4,
    reviewCount: 203,
    likeCount: 98,
    usageCount: 1560,
    callCount: 18000,
    agentCompatible: true,
    tags: ['AI', 'Code', 'Review', 'DevTool'],
    isLiked: false,
    isFavorited: false,
    createdAt: '2025-11-20T00:00:00Z',
    updatedAt: '2026-02-11T00:00:00Z',
  },
  {
    id: 'res-1',
    name: 'Cloud Storage Adapter',
    description: 'Unified interface for S3, GCS, Azure Blob — store and retrieve files via a single API',
    author: '@infra_io',
    authorId: 'user-r1',
    category: 'resources',
    subCategory: 'Storage',
    price: 0.005,
    priceUnit: 'per call',
    rating: 4.7,
    reviewCount: 112,
    likeCount: 43,
    usageCount: 3400,
    callCount: 28000,
    agentCompatible: true,
    tags: ['Storage', 'Cloud', 'S3', 'Files'],
    isLiked: false,
    isFavorited: false,
    createdAt: '2025-10-01T00:00:00Z',
    updatedAt: '2026-01-15T00:00:00Z',
  },
  {
    id: 'res-2',
    name: 'Web Scraper Pro',
    description: 'Headless browser scraper — extract structured data from any webpage with anti-bot bypass',
    author: '@scrape_dev',
    authorId: 'user-r2',
    category: 'resources',
    subCategory: 'Data',
    price: 0.015,
    priceUnit: 'per call',
    rating: 4.6,
    reviewCount: 88,
    likeCount: 61,
    usageCount: 2100,
    callCount: 17500,
    agentCompatible: true,
    tags: ['Scraping', 'Data', 'Automation', 'Web'],
    isLiked: false,
    isFavorited: false,
    createdAt: '2025-09-15T00:00:00Z',
    updatedAt: '2026-02-01T00:00:00Z',
  },
  {
    id: 'res-3',
    name: 'Email Gateway',
    description: 'Send transactional emails, newsletters, and push notifications via a single endpoint',
    author: '@notify_hq',
    authorId: 'user-r3',
    category: 'resources',
    subCategory: 'Messaging',
    price: 0.002,
    priceUnit: 'per call',
    rating: 4.9,
    reviewCount: 203,
    likeCount: 95,
    usageCount: 7800,
    callCount: 64000,
    agentCompatible: true,
    tags: ['Email', 'Notifications', 'Messaging', 'SMTP'],
    isLiked: false,
    isFavorited: false,
    createdAt: '2025-08-01T00:00:00Z',
    updatedAt: '2026-02-08T00:00:00Z',
  },
  {
    id: 'res-4',
    name: 'Vector DB Connector',
    description: 'Query Pinecone, Weaviate, or Qdrant — semantic search over your embeddings with one call',
    author: '@vector_ai',
    authorId: 'user-r4',
    category: 'resources',
    subCategory: 'Database',
    price: 0.008,
    priceUnit: 'per call',
    rating: 4.8,
    reviewCount: 74,
    likeCount: 52,
    usageCount: 1900,
    callCount: 15200,
    agentCompatible: true,
    tags: ['Vector', 'Embeddings', 'Search', 'AI'],
    isLiked: false,
    isFavorited: false,
    createdAt: '2025-11-01T00:00:00Z',
    updatedAt: '2026-01-28T00:00:00Z',
  },
];

const MOCK_REVIEWS: ReviewItem[] = [
  { id: 'r1', userId: 'u1', userName: '@mike_t', rating: 5, comment: 'Excellent translation quality, very fast response!', createdAt: '2026-02-10T00:00:00Z' },
  { id: 'r2', userId: 'u2', userName: '@alice', rating: 4, comment: 'Great tool, Japanese translation could be better though', createdAt: '2026-02-07T00:00:00Z' },
  { id: 'r3', userId: 'u3', userName: '@bob_dev', rating: 5, comment: 'Very easy to integrate, well-designed API', createdAt: '2026-02-05T00:00:00Z' },
  { id: 'r4', userId: 'u4', userName: '@sam_w', rating: 4, comment: 'Great value, much cheaper than calling GPT-4 directly', createdAt: '2026-02-03T00:00:00Z' },
  { id: 'r5', userId: 'u5', userName: '@tech_fan', rating: 5, comment: 'Agent calls are very stable too, highly recommend!', createdAt: '2026-02-01T00:00:00Z' },
];

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
      // If API returns empty results for this category, supplement with mock data
      if (items.length === 0) {
        const mockFallback = MOCK_SKILLS.filter(s => !params.category || s.category === params.category);
        return {
          items: mockFallback,
          total: mockFallback.length,
          page: params.page || 1,
          totalPages: Math.ceil(mockFallback.length / (params.limit || 20)),
        };
      }
      return {
        items,
        total: data.total || items.length,
        page: params.page || 1,
        totalPages: Math.ceil((data.total || items.length) / (params.limit || 20)),
      };
    } catch (e) {
      console.warn('Marketplace search fallback to mock:', e);
      // Fallback to mock data
      let items = [...MOCK_SKILLS];
      if (params.category) {
        items = items.filter(s => s.category === params.category);
      }
      if (params.q) {
        const q = params.q.toLowerCase();
        items = items.filter(s =>
          s.name.toLowerCase().includes(q) ||
          s.description.toLowerCase().includes(q) ||
          s.tags.some(t => t.toLowerCase().includes(q))
        );
      }
      if (params.agentCompatible) {
        items = items.filter(s => s.agentCompatible);
      }
      if (params.subCategory && params.subCategory !== 'all') {
        items = items.filter(s => s.subCategory === params.subCategory);
      }
      if (params.sortBy === 'rating') {
        items.sort((a, b) => b.rating - a.rating);
      } else if (params.sortBy === 'newest') {
        items.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      } else if (params.sortBy === 'price') {
        items.sort((a, b) => a.price - b.price);
      } else {
        items.sort((a, b) => b.usageCount - a.usageCount);
      }
      const page = params.page || 1;
      const limit = params.limit || 20;
      const start = (page - 1) * limit;
      return {
        items: items.slice(start, start + limit),
        total: items.length,
        page,
        totalPages: Math.ceil(items.length / limit),
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
      return MOCK_SKILLS.sort((a, b) => b.usageCount - a.usageCount).slice(0, limit);
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
      const skill = MOCK_SKILLS.find(s => s.id === id) || MOCK_SKILLS[0];
      return {
        ...skill,
        longDescription: skill.description + '\n\nSupports RESTful API and SDK integration. Well-documented with fast response times. Free trial quota available.',
        weeklyCallCount: Math.floor(skill.callCount * 0.1),
        successRate: 99.2,
        avgLatency: 1200,
        commissionPerCall: skill.price * 0.01,
        reviews: MOCK_REVIEWS,
      };
    }
  },

  // 点赞/取消点赞
  async toggleLike(skillId: string): Promise<{ liked: boolean; likeCount: number }> {
    try {
      return await apiFetch(`/skills/${skillId}/like`, { method: 'POST' });
    } catch (e) {
      const skill = MOCK_SKILLS.find(s => s.id === skillId);
      if (skill) {
        skill.isLiked = !skill.isLiked;
        skill.likeCount += skill.isLiked ? 1 : -1;
        return { liked: skill.isLiked, likeCount: skill.likeCount };
      }
      return { liked: false, likeCount: 0 };
    }
  },

  // 收藏/取消收藏
  async toggleFavorite(skillId: string): Promise<{ favorited: boolean }> {
    try {
      return await apiFetch(`/skills/${skillId}/favorite`, { method: 'POST' });
    } catch (e) {
      const skill = MOCK_SKILLS.find(s => s.id === skillId);
      if (skill) {
        skill.isFavorited = !skill.isFavorited;
        return { favorited: skill.isFavorited };
      }
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
      // 如果是 mock skill ID，返回空列表
      if (skillId.startsWith('skill-')) {
        return { reviews: MOCK_REVIEWS, total: MOCK_REVIEWS.length };
      }
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
