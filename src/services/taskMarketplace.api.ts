// 任务集市 API — 对接后端 /merchant-tasks/marketplace/*
import { apiFetch } from './api';

// ========== 类型定义 ==========

export type TaskType = 'custom_service' | 'consultation' | 'design' | 'development' | 'content' | 'other';
export type TaskStatus = 'pending' | 'accepted' | 'in_progress' | 'delivered' | 'completed' | 'cancelled' | 'disputed';
export type TaskVisibility = 'public' | 'private' | 'invite_only';
export type BidStatus = 'pending' | 'accepted' | 'rejected' | 'withdrawn';

export interface TaskItem {
  id: string;
  userId: string;
  merchantId?: string;
  type: TaskType;
  status: TaskStatus;
  visibility: TaskVisibility;
  title: string;
  description: string;
  budget: number;
  currency: string;
  tags: string[];
  requirements?: {
    deadline?: string;
    deliverables?: string[];
    specifications?: Record<string, any>;
  };
  progress?: {
    currentStep: string;
    completedSteps: string[];
    percentage: number;
    updates: any[];
  };
  user?: { id: string; nickname?: string; avatarUrl?: string; agentrixId?: string };
  createdAt: string;
  updatedAt: string;
}

export interface BidItem {
  id: string;
  taskId: string;
  bidderId: string;
  proposedBudget: number;
  currency: string;
  estimatedDays: number;
  proposal: string;
  portfolio?: {
    samples?: string[];
    certifications?: string[];
    previousWork?: Array<{ title: string; description: string; link?: string }>;
  };
  status: BidStatus;
  metadata?: { skills?: string[]; rating?: number; completionRate?: number };
  bidder?: { id: string; nickname?: string; avatarUrl?: string; agentrixId?: string };
  task?: TaskItem;
  createdAt: string;
  updatedAt: string;
  respondedAt?: string;
}

export interface SearchTasksParams {
  query?: string;
  type?: TaskType[];
  budgetMin?: number;
  budgetMax?: number;
  tags?: string[];
  status?: TaskStatus;
  page?: number;
  limit?: number;
  sortBy?: 'createdAt' | 'budget' | 'deadline';
  sortOrder?: 'ASC' | 'DESC';
}

export interface PublishTaskDto {
  type: TaskType;
  title: string;
  description: string;
  budget: number;
  currency?: string;
  tags?: string[];
  requirements?: {
    deadline?: string;
    deliverables?: string[];
    specifications?: Record<string, any>;
  };
  visibility?: TaskVisibility;
}

export interface CreateBidDto {
  proposedBudget: number;
  currency?: string;
  estimatedDays: number;
  proposal: string;
  portfolio?: {
    samples?: string[];
    previousWork?: Array<{ title: string; description: string; link?: string }>;
  };
  metadata?: { skills?: string[] };
}

// ========== 任务类型配置 ==========

export const TASK_TYPE_CONFIG: Record<TaskType, { label: string; icon: string; color: string }> = {
  development: { label: 'Dev', icon: '💻', color: '#3B82F6' },
  design: { label: 'Design', icon: '🎨', color: '#8B5CF6' },
  content: { label: 'Content', icon: '✍️', color: '#F59E0B' },
  consultation: { label: 'Consult', icon: '💡', color: '#10B981' },
  custom_service: { label: 'Custom', icon: '⚙️', color: '#EC4899' },
  other: { label: 'Other', icon: '📦', color: '#6B7280' },
};

export const TASK_STATUS_CONFIG: Record<TaskStatus, { label: string; color: string }> = {
  pending: { label: 'Open', color: '#3B82F6' },
  accepted: { label: 'Accepted', color: '#8B5CF6' },
  in_progress: { label: 'In Progress', color: '#F59E0B' },
  delivered: { label: 'Delivered', color: '#06B6D4' },
  completed: { label: 'Completed', color: '#10B981' },
  cancelled: { label: 'Cancelled', color: '#6B7280' },
  disputed: { label: 'Disputed', color: '#EF4444' },
};

// ========== API 方法 ==========

export const taskMarketplaceApi = {
  // 搜索公开任务
  async searchTasks(params: SearchTasksParams = {}): Promise<{
    items: TaskItem[];
    total: number;
    page: number;
    limit: number;
  }> {
    const query = new URLSearchParams();
    if (params.query) query.set('query', params.query);
    if (params.type?.length) params.type.forEach(t => query.append('type', t));
    if (params.budgetMin !== undefined) query.set('budgetMin', String(params.budgetMin));
    if (params.budgetMax !== undefined) query.set('budgetMax', String(params.budgetMax));
    if (params.tags?.length) params.tags.forEach(t => query.append('tags', t));
    if (params.status) query.set('status', params.status);
    if (params.page) query.set('page', String(params.page));
    if (params.limit) query.set('limit', String(params.limit));
    if (params.sortBy) query.set('sortBy', params.sortBy);
    if (params.sortOrder) query.set('sortOrder', params.sortOrder);

    return apiFetch<any>(`/merchant-tasks/marketplace/search?${query.toString()}`);
  },

  // 获取任务详情
  async getTaskDetail(taskId: string): Promise<TaskItem> {
    return apiFetch<TaskItem>(`/merchant-tasks/marketplace/tasks/${taskId}`);
  },

  // 发布任务
  async publishTask(dto: PublishTaskDto): Promise<TaskItem> {
    return apiFetch<TaskItem>('/merchant-tasks/marketplace/publish', {
      method: 'POST',
      body: JSON.stringify(dto),
    });
  },

  // 提交竞标
  async submitBid(taskId: string, dto: CreateBidDto): Promise<BidItem> {
    return apiFetch<BidItem>(`/merchant-tasks/marketplace/tasks/${taskId}/bid`, {
      method: 'POST',
      body: JSON.stringify(dto),
    });
  },

  // 获取任务的所有竞标（任务发布者）
  async getTaskBids(taskId: string): Promise<BidItem[]> {
    return apiFetch<BidItem[]>(`/merchant-tasks/marketplace/tasks/${taskId}/bids`);
  },

  // 接受竞标
  async acceptBid(taskId: string, bidId: string): Promise<any> {
    return apiFetch(`/merchant-tasks/marketplace/tasks/${taskId}/bids/${bidId}/accept`, {
      method: 'PUT',
    });
  },

  // 拒绝竞标
  async rejectBid(taskId: string, bidId: string): Promise<any> {
    return apiFetch(`/merchant-tasks/marketplace/tasks/${taskId}/bids/${bidId}/reject`, {
      method: 'PUT',
    });
  },

  // 获取我的竞标列表
  async getMyBids(status?: BidStatus): Promise<BidItem[]> {
    const query = status ? `?status=${status}` : '';
    return apiFetch<BidItem[]>(`/merchant-tasks/marketplace/my-bids${query}`);
  },

  // 获取我发布的任务
  async getMyTasks(status?: TaskStatus): Promise<TaskItem[]> {
    return apiFetch<TaskItem[]>(`/merchant-tasks/my-tasks${status ? `?status=${status}` : ''}`);
  },
};
