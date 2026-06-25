import { apiClient } from './client';

export interface CreateTaskRequest {
  merchantId: string;
  type: 'custom_service' | 'consultation' | 'design' | 'development' | 'content' | 'other';
  title: string;
  description: string;
  budget: number;
  currency?: string;
  requirements?: {
    deadline?: string;
    deliverables?: string[];
    specifications?: Record<string, any>;
  };
  agentId?: string;
}

export interface UpdateTaskProgressRequest {
  currentStep?: string;
  message?: string;
  attachments?: string[];
  percentage?: number;
}

export interface MerchantTask {
  id: string;
  userId: string;
  merchantId: string;
  type: string;
  status: 'pending' | 'accepted' | 'in_progress' | 'delivered' | 'completed' | 'cancelled' | 'disputed';
  title: string;
  description: string;
  budget: number;
  currency: string;
  requirements?: any;
  progress?: {
    currentStep?: string;
    completedSteps?: string[];
    percentage?: number;
    updates?: Array<{
      message: string;
      timestamp: string;
      attachments?: string[];
    }>;
  };
  orderId?: string;
  agentId?: string;
  metadata?: any;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
}

export const merchantTaskApi = {
  /**
   * 创建任务
   */
  create: async (request: CreateTaskRequest): Promise<MerchantTask> => {
    return apiClient.post<MerchantTask>('/merchant-tasks', request);
  },

  /**
   * 商户接受任务
   */
  accept: async (taskId: string): Promise<MerchantTask> => {
    return apiClient.put<MerchantTask>(`/merchant-tasks/${taskId}/accept`);
  },

  /**
   * 更新任务进度
   */
  updateProgress: async (taskId: string, request: UpdateTaskProgressRequest): Promise<MerchantTask> => {
    return apiClient.put<MerchantTask>(`/merchant-tasks/${taskId}/progress`, request);
  },

  /**
   * 完成任务
   */
  complete: async (taskId: string): Promise<MerchantTask> => {
    return apiClient.put<MerchantTask>(`/merchant-tasks/${taskId}/complete`);
  },

  /**
   * 获取我的任务列表（用户）
   */
  getMyTasks: async (): Promise<MerchantTask[]> => {
    return apiClient.get<MerchantTask[]>('/merchant-tasks/my-tasks');
  },

  /**
   * 获取商户任务列表
   */
  getMerchantTasks: async (): Promise<MerchantTask[]> => {
    return apiClient.get<MerchantTask[]>('/merchant-tasks/merchant-tasks');
  },

  /**
   * 获取任务详情
   */
  get: async (taskId: string): Promise<MerchantTask> => {
    return apiClient.get<MerchantTask>(`/merchant-tasks/${taskId}`);
  },
};

