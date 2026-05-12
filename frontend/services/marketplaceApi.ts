/**
 * Marketplace Ecosystem API Service Layer
 *
 * 统一的市场生态系统 API 客户端，支持 SSR (getServerSideProps) 和客户端调用。
 * 涵盖皮肤市场、技能市场、任务市场、统一搜索、AXP 余额等接口。
 *
 * Requirements: 3.1, 4.1, 5.1, 8.3, 10.5
 */

import axios, { AxiosInstance } from 'axios';

// ---------------------------------------------------------------------------
// Base URL 配置 — 兼容 SSR 和客户端
// ---------------------------------------------------------------------------

const getApiBaseUrl = (): string => {
  // 优先使用环境变量
  if (process.env.NEXT_PUBLIC_API_URL) {
    const envUrl = process.env.NEXT_PUBLIC_API_URL;
    if (!envUrl.endsWith('/api')) {
      return envUrl.endsWith('/') ? `${envUrl}api` : `${envUrl}/api`;
    }
    return envUrl;
  }

  // 浏览器环境
  if (typeof window !== 'undefined') {
    const hostname = window.location.hostname;
    const isLocal =
      hostname === 'localhost' ||
      hostname === '127.0.0.1' ||
      hostname.startsWith('192.168.') ||
      hostname.startsWith('10.') ||
      hostname.startsWith('172.');

    if (isLocal) {
      return 'http://localhost:3001/api';
    }

    // 生产环境走同源代理
    return `${window.location.origin}/api`;
  }

  // SSR / Node 环境
  if (process.env.BACKEND_URL) {
    const backendUrl = process.env.BACKEND_URL;
    return backendUrl.endsWith('/api') ? backendUrl : `${backendUrl.replace(/\/$/, '')}/api`;
  }

  if (process.env.NODE_ENV === 'production') {
    return 'https://api.agentrix.top/api';
  }

  return 'http://localhost:3001/api';
};

// ---------------------------------------------------------------------------
// Axios 实例
// ---------------------------------------------------------------------------

const createHttpClient = (): AxiosInstance => {
  const instance = axios.create({
    baseURL: getApiBaseUrl(),
    headers: { 'Content-Type': 'application/json' },
    timeout: 10000,
  });

  // 客户端环境自动注入 token
  instance.interceptors.request.use((config) => {
    if (typeof window !== 'undefined') {
      const token =
        localStorage.getItem('access_token') ||
        localStorage.getItem('authToken') ||
        sessionStorage.getItem('authToken');
      if (token) {
        config.headers.Authorization = `Bearer ${token}`;
      }
    }
    return config;
  });

  return instance;
};

const http = createHttpClient();

// ---------------------------------------------------------------------------
// 接口类型定义
// ---------------------------------------------------------------------------

/** 皮肤列表项 DTO */
export interface SkinListItem {
  id: string;
  displayName: string;
  thumbnailUrl: string | null;
  url: string;
  format: 'svg' | 'rive' | 'vrm' | 'live2d';
  clan: 'A' | 'B' | 'C' | 'D' | 'E' | 'F';
  source: 'platform' | 'generated' | 'purchased' | 'remixed' | 'gifted';
  creatorUsername: string;
  creatorUserId: string | null;

  // 统计
  likeCount: number;
  viewCount: number;
  remixCount: number;

  // 市场信息
  listingId: string | null;
  listingMode: 'fixed_price' | 'auction' | 'rental' | null;
  priceUsd: number | null;
  startingBidUsd: number | null;
  currentBidUsd: number | null;
  auctionEndsAt: string | null;

  // AXP
  axpAccepted: boolean;
  axpDiscountPercent: number;
  /** AXP price (null = not AXP-purchasable) */
  priceAxp: number | null;

  // 元数据
  featured: boolean;
  createdAt: string;
  parentSkinId: string | null;
}

/** 技能列表项 DTO */
export interface SkillListItem {
  id: string;
  title: string;
  description: string;
  category: string;
  price: number;
  currency: string;
  installCount: number;
  developerName: string;
  developerUserId: string;
  rating: number | null;
  tags: string[];
  axpEarningEstimate: number;
  revenueSplit: {
    developer: number;
    platform: number;
  };
  createdAt: string;
}

/** 任务列表项 DTO */
export interface TaskListItem {
  id: string;
  title: string;
  description: string;
  rewardAmount: number;
  currency: string;
  taskType: string;
  requiredSkills: string[];
  deadline: string | null;
  status: 'OPEN' | 'ACCEPTED' | 'IN_PROGRESS' | 'COMPLETED';
  axpBonus: number;
  publisherName: string;
  createdAt: string;
}

/** 皮肤市场请求参数 */
export interface MarketplaceSkinsParams {
  sort?: 'featured' | 'newest' | 'popular';
  clan?: 'A' | 'B' | 'C' | 'D' | 'E' | 'F';
  limit?: number;
  cursor?: string;
}

/** 皮肤市场响应 */
export interface MarketplaceSkinsResponse {
  items: SkinListItem[];
  total: number;
  nextCursor: string | null;
}

/** 技能列表请求参数 */
export interface SkillListingsParams {
  status?: 'approved' | 'published';
  category?: string;
  limit?: number;
  offset?: number;
}

/** 技能列表响应 */
export interface SkillListingsResponse {
  items: SkillListItem[];
  total: number;
}

/** 任务市场请求参数 */
export interface MarketTasksParams {
  type?: string;
  sortBy?: 'createdAt' | 'budget' | 'deadline';
  sortOrder?: 'ASC' | 'DESC';
  limit?: number;
  page?: number;
}

/** 任务市场响应 */
export interface MarketTasksResponse {
  items: TaskListItem[];
  total: number;
  page: number;
  totalPages: number;
}

/** 统一搜索请求参数 */
export interface UnifiedSearchParams {
  query: string;
  limit?: number;
}

/** 统一搜索响应 */
export interface UnifiedSearchResponse {
  skins: { items: SkinListItem[]; count: number };
  skills: { items: SkillListItem[]; count: number };
  tasks: { items: TaskListItem[]; count: number };
}

/** AXP 余额响应 */
export interface AxpBalanceResponse {
  balance: number;
  lifetime_earned: number;
  lifetime_spent: number;
}

/** 任务竞标提交 payload */
export interface SubmitTaskBidPayload {
  proposedBudget: number;
  estimatedDays: number;
  proposal: string;
  currency?: string;
}

/** 任务竞标响应（后端返回 TaskBid 实体） */
export interface SubmitTaskBidResponse {
  id: string;
  taskId: string;
  bidderId: string;
  proposedBudget: number;
  currency: string;
  estimatedDays: number;
  proposal: string;
  status: string;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// API 函数
// ---------------------------------------------------------------------------

/**
 * 获取皮肤市场列表
 * GET /api/v1/market/skins
 * 支持排序、Clan 过滤、游标分页
 */
export async function fetchMarketSkins(
  params: MarketplaceSkinsParams = {},
): Promise<MarketplaceSkinsResponse> {
  const { data } = await http.get<MarketplaceSkinsResponse>('/v1/market/skins', {
    params: {
      ...(params.sort && { sort: params.sort }),
      ...(params.clan && { clan: params.clan }),
      ...(params.limit && { limit: params.limit }),
      ...(params.cursor && { cursor: params.cursor }),
    },
  });
  return data;
}

/**
 * 获取技能列表
 * GET /api/v1/skill-listings
 * 支持状态过滤、分类过滤、分页
 */
export async function fetchSkillListings(
  params: SkillListingsParams = {},
): Promise<SkillListingsResponse> {
  const { data } = await http.get<SkillListingsResponse>('/v1/skill-listings', {
    params: {
      ...(params.status && { status: params.status }),
      ...(params.category && { category: params.category }),
      ...(params.limit && { limit: params.limit }),
      ...(params.offset !== undefined && { offset: params.offset }),
    },
  });
  return data;
}

/**
 * 获取任务市场列表
 * GET /merchant-tasks/marketplace/search
 * 支持类型过滤、排序、分页
 */
export async function fetchMarketTasks(
  params: MarketTasksParams = {},
): Promise<MarketTasksResponse> {
  const { data } = await http.get('/merchant-tasks/marketplace/search', {
    params: {
      ...(params.type && { type: params.type }),
      ...(params.sortBy && { sortBy: params.sortBy }),
      ...(params.sortOrder && { sortOrder: params.sortOrder }),
      ...(params.limit && { limit: params.limit }),
      ...(params.page && { page: params.page }),
    },
  });

  // 后端可能返回 { items, total, page, limit } 或 { tasks, total, page, limit }
  const rawItems: any[] = data.items || data.tasks || [];
  const total: number = data.total || 0;
  const page: number = data.page || 1;
  const limit: number = data.limit || params.limit || 20;

  // 映射后端字段到前端 TaskListItem 接口
  const items: TaskListItem[] = rawItems.map((item: any) => ({
    id: item.id,
    title: item.title || '',
    description: item.description || '',
    rewardAmount: parseFloat(item.budget) || item.rewardAmount || 0,
    currency: item.currency || 'USD',
    taskType: item.type || item.taskType || 'other',
    requiredSkills: item.tags || item.requiredSkills || [],
    deadline: item.requirements?.deadline || item.deadline || null,
    status: item.status?.toUpperCase() || 'OPEN',
    axpBonus: item.axpBonus || 0,
    publisherName: item.publisherName || 'Anonymous',
    createdAt: item.createdAt || new Date().toISOString(),
  }));

  return {
    items,
    total,
    page,
    totalPages: Math.ceil(total / limit),
  };
}

/**
 * 统一搜索（跨皮肤、技能、任务）
 * GET /api/v1/market/search
 * 返回按类别分组的搜索结果
 */
export async function fetchUnifiedSearch(
  params: UnifiedSearchParams,
): Promise<UnifiedSearchResponse> {
  const { data } = await http.get<UnifiedSearchResponse>('/v1/market/search', {
    params: {
      query: params.query,
      ...(params.limit && { limit: params.limit }),
    },
  });
  return data;
}

/**
 * 获取当前用户 AXP 余额
 * GET /api/v1/axp/balance
 * 需要认证；获取失败时调用方应静默处理
 */
export async function fetchAxpBalance(): Promise<AxpBalanceResponse> {
  const { data } = await http.get<AxpBalanceResponse>('/v1/axp/balance');
  return data;
}

/**
 * 提交任务竞标
 * POST /api/merchant-tasks/marketplace/tasks/:taskId/bid
 * 需要 JWT 认证。未登录或 token 失效时后端返回 401。
 *
 * payload 字段与移动端 TaskDetailScreen 的 submitBid 保持一致：
 *   - proposedBudget (number, > 0)
 *   - estimatedDays (integer, >= 1)
 *   - proposal (string, 最少 50 字符)
 */
export async function submitTaskBid(
  taskId: string,
  payload: SubmitTaskBidPayload,
): Promise<SubmitTaskBidResponse> {
  const { data } = await http.post<SubmitTaskBidResponse>(
    `/merchant-tasks/marketplace/tasks/${encodeURIComponent(taskId)}/bid`,
    {
      proposedBudget: payload.proposedBudget,
      estimatedDays: payload.estimatedDays,
      proposal: payload.proposal,
      ...(payload.currency ? { currency: payload.currency } : {}),
    },
  );
  return data;
}
