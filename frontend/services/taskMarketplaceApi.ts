/**
 * Task Marketplace API Client
 * 
 * 任务市场前端API客户端
 */

import axios from 'axios';

// Auto-detect API base URL based on environment
const getApiBaseUrl = () => {
  if (process.env.NEXT_PUBLIC_API_URL) {
    const envUrl = process.env.NEXT_PUBLIC_API_URL;
    if (!envUrl.endsWith('/api')) {
      return envUrl.endsWith('/') ? `${envUrl}api` : `${envUrl}/api`;
    }
    return envUrl;
  }
  if (typeof window !== 'undefined') {
    const hostname = window.location.hostname;
    if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname.startsWith('192.168.') || hostname.startsWith('10.') || hostname.startsWith('172.')) {
      return 'http://localhost:3001/api';
    }
    if (hostname.includes('agentrix.top')) {
      return 'https://api.agentrix.top/api';
    }
    if (hostname.includes('agentrix.io')) {
      return 'https://api.agentrix.io/api';
    }
  }
  if (process.env.NODE_ENV === 'production') {
    return 'https://api.agentrix.top/api';
  }
  return 'http://localhost:3001/api';
};
const API_BASE_URL = getApiBaseUrl();

export interface PublishTaskDto {
  type: 'custom_service' | 'consultation' | 'design' | 'development' | 'content' | 'other';
  title: string;
  description: string;
  budget: number;
  currency?: string;
  tags?: string[];
  requirements?: {
    deadline?: Date;
    deliverables?: string[];
    specifications?: Record<string, any>;
  };
  visibility?: 'public' | 'private' | 'invite_only' | 'PUBLIC' | 'PRIVATE' | 'INVITE_ONLY';
  agentId?: string;
}

export interface SearchTasksParams {
  query?: string;
  type?: string[];
  budgetMin?: number;
  budgetMax?: number;
  tags?: string[];
  status?: string;
  visibility?: string;
  page?: number;
  limit?: number;
  sortBy?: 'createdAt' | 'budget' | 'deadline';
  sortOrder?: 'ASC' | 'DESC';
}

export interface CreateBidDto {
  proposedBudget: number;
  currency?: string;
  estimatedDays: number;
  proposal: string;
  portfolio?: {
    samples?: string[];
    certifications?: string[];
    previousWork?: Array<{
      title: string;
      description: string;
      link?: string;
    }>;
  };
  metadata?: {
    skills?: string[];
    rating?: number;
    completionRate?: number;
  };
}

export interface Task {
  id: string;
  userId: string;
  type: string;
  title: string;
  description: string;
  budget: number;
  currency: string;
  tags: string[];
  requirements?: any;
  visibility: string;
  status: string;
  commissionBps?: number;
  commissionAmount?: number;
  netPayoutAmount?: number;
  commissionStatus?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CommissionPreview {
  grossAmount: number;
  commissionRate: string;
  commissionBps: number;
  commissionAmount: number;
  netPayoutAmount: number;
  currency: string;
}

export interface TaskBid {
  id: string;
  taskId: string;
  bidderId: string;
  proposedBudget: number;
  currency: string;
  estimatedDays: number;
  proposal: string;
  portfolio?: any;
  metadata?: any;
  status: 'PENDING' | 'ACCEPTED' | 'REJECTED' | 'WITHDRAWN' | 'pending' | 'accepted' | 'rejected' | 'withdrawn';
  createdAt: string;
  updatedAt: string;
}

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// 添加token拦截器
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('access_token') || localStorage.getItem('authToken') || sessionStorage.getItem('authToken');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export const taskMarketplaceApi = {
  /**
   * 发布任务到市场
   */
  async publishTask(dto: PublishTaskDto): Promise<Task> {
    const { data } = await api.post('/merchant-tasks/marketplace/publish', dto);
    return data;
  },

  /**
   * 搜索任务市场
   */
  async searchTasks(params: SearchTasksParams): Promise<{ tasks: Task[]; total: number; page: number; totalPages: number }> {
    const { data } = await api.get('/merchant-tasks/marketplace/search', { params });
    // Backend returns { items, total, page, limit } — normalize to { tasks, total, page, totalPages }
    const tasks = data.tasks || data.items || [];
    const total = data.total || 0;
    const page = data.page || 1;
    const limit = data.limit || params.limit || 20;
    return { tasks, total, page, totalPages: Math.ceil(total / limit) };
  },

  /**
   * 提交竞标
   */
  async submitBid(taskId: string, dto: CreateBidDto): Promise<TaskBid> {
    const { data } = await api.post(`/merchant-tasks/marketplace/tasks/${taskId}/bid`, dto);
    return data;
  },

  /**
   * 获取任务的所有竞标
   */
  async getTaskBids(taskId: string): Promise<TaskBid[]> {
    const { data } = await api.get(`/merchant-tasks/marketplace/tasks/${taskId}/bids`);
    return data;
  },

  /**
   * 接受竞标
   */
  async acceptBid(taskId: string, bidId: string): Promise<{ task: Task; bid: TaskBid }> {
    const { data } = await api.put(`/merchant-tasks/marketplace/tasks/${taskId}/bids/${bidId}/accept`);
    return data;
  },

  /**
   * 拒绝竞标
   */
  async rejectBid(taskId: string, bidId: string): Promise<TaskBid> {
    const { data } = await api.put(`/merchant-tasks/marketplace/tasks/${taskId}/bids/${bidId}/reject`);
    return data;
  },

  /**
   * 获取我的竞标列表
   */
  async getMyBids(): Promise<TaskBid[]> {
    const { data } = await api.get('/merchant-tasks/marketplace/my-bids');
    return data;
  },

  /**
   * 获取我发布的任务
   */
  async getMyTasks(): Promise<Task[]> {
    const { data } = await api.get('/merchant-tasks/my-tasks');
    return Array.isArray(data) ? data : [];
  },

  /**
   * 取消任务
   */
  async cancelTask(taskId: string, reason?: string): Promise<Task> {
    const { data } = await api.put(`/merchant-tasks/${taskId}/cancel`, { reason });
    return data;
  },

  /**
   * 获取任务详情
   */
  async getTaskDetails(taskId: string): Promise<Task> {
    const { data } = await api.get(`/merchant-tasks/${taskId}`);
    return data;
  },

  /**
   * 预览佣金 (无需登录)
   */
  async previewCommission(amount: number, currency?: string): Promise<CommissionPreview> {
    const { data } = await api.get('/merchant-tasks/commission/preview', {
      params: { amount, currency: currency || 'USD' },
    });
    return data;
  },

  /**
   * 获取我的佣金汇总
   */
  async getCommissionSummary(): Promise<{
    totalTasks: number;
    totalGross: number;
    totalCommission: number;
    totalNetPayout: number;
    currency: string;
  }> {
    const { data } = await api.get('/merchant-tasks/commission/summary');
    return data;
  },
};
