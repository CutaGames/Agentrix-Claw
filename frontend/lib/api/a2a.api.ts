/**
 * A2A (Agent-to-Agent) API Client
 * 
 * Frontend API client for agent-to-agent task management,
 * reputation queries, and task lifecycle operations.
 */

import { apiClient } from './client'

// ============ Types ============

export type A2ATaskStatus = 
  | 'pending' | 'accepted' | 'in_progress' | 'delivered' 
  | 'completed' | 'rejected' | 'cancelled' | 'expired' | 'failed'

export type A2ATaskPriority = 'low' | 'normal' | 'high' | 'urgent'

export type ReputationTier = 'bronze' | 'silver' | 'gold' | 'platinum' | 'diamond'

export interface A2ADeliverable {
  type: 'text' | 'json' | 'file' | 'url' | 'code'
  content: string
  metadata?: Record<string, any>
}

export interface A2AQualityAssessment {
  score: number
  criteria: Array<{
    name: string
    score: number
    weight: number
    comment?: string
  }>
  assessedAt: string
  assessedBy: string
  comment?: string
}

export interface A2ACallback {
  url: string
  events: string[]
  secret?: string
  headers?: Record<string, string>
  retryCount?: number
}

export interface A2ATask {
  id: string
  requesterAgentId: string
  targetAgentId: string
  requesterUserId?: string
  title: string
  description: string
  taskType?: string
  status: A2ATaskStatus
  priority: A2ATaskPriority
  params?: Record<string, any>
  deliverables?: A2ADeliverable[]
  qualityAssessment?: A2AQualityAssessment
  callback?: A2ACallback
  maxPrice?: string
  agreedPrice?: string
  currency: string
  paymentMethod?: string
  mandateId?: string
  budgetPoolId?: string
  skillId?: string
  parentTaskId?: string
  deadline?: string
  acceptedAt?: string
  startedAt?: string
  deliveredAt?: string
  completedAt?: string
  cancelledAt?: string
  cancelReason?: string
  metadata?: Record<string, any>
  createdAt: string
  updatedAt: string
}

export interface AgentReputation {
  id: string
  agentId: string
  overallScore: number
  tier: ReputationTier
  tasksCompleted: number
  tasksFailed: number
  tasksCancelled: number
  tasksTotal: number
  avgQualityScore: number
  avgResponseTime: number
  avgCompletionTime: number
  onTimeRate: number
  specializations: string[]
  createdAt: string
  updatedAt: string
}

// ============ Request DTOs ============

export interface CreateA2ATaskRequest {
  requesterAgentId: string
  targetAgentId: string
  title: string
  description?: string
  taskType?: string
  params?: Record<string, any>
  priority?: A2ATaskPriority
  maxPrice?: string
  currency?: string
  mandateId?: string
  budgetPoolId?: string
  skillId?: string
  deadline?: string
  callback?: A2ACallback
  parentTaskId?: string
  metadata?: Record<string, any>
}

export interface AcceptTaskRequest {
  agreedPrice?: string
  message?: string
}

export interface DeliverTaskRequest {
  deliverables: A2ADeliverable[]
  message?: string
}

export interface ReviewTaskRequest {
  approved: boolean
  qualityScore?: number
  comment?: string
  criteria?: Array<{
    name: string
    score: number
    weight: number
    comment?: string
  }>
}

export interface ListTasksParams {
  agentId?: string
  role?: 'requester' | 'target'
  status?: string
  taskType?: string
  page?: number
  limit?: number
}

// ============ Response Types ============

interface ApiResponse<T> {
  success: boolean
  data: T
  message?: string
}

interface TaskListResponse {
  tasks: A2ATask[]
  total: number
}

// ============ API Client ============

export const a2aApi = {
  // Task CRUD
  createTask: async (dto: CreateA2ATaskRequest): Promise<A2ATask> => {
    const result = await apiClient.post<ApiResponse<A2ATask>>('/a2a/tasks', dto)
    if (!result?.data) throw new Error('创建 A2A 任务失败')
    return result.data
  },

  getTask: async (taskId: string): Promise<A2ATask> => {
    const result = await apiClient.get<ApiResponse<A2ATask>>(`/a2a/tasks/${taskId}`)
    if (!result?.data) throw new Error('获取任务失败')
    return result.data
  },

  listTasks: async (params: ListTasksParams = {}): Promise<TaskListResponse> => {
    const result = await apiClient.get<ApiResponse<TaskListResponse>>('/a2a/tasks', { params })
    return result?.data ?? { tasks: [], total: 0 }
  },

  // Task Lifecycle
  acceptTask: async (taskId: string, agentId: string, dto: AcceptTaskRequest = {}): Promise<A2ATask> => {
    const result = await apiClient.post<ApiResponse<A2ATask>>(`/a2a/tasks/${taskId}/accept`, { agentId, ...dto })
    if (!result?.data) throw new Error('接受任务失败')
    return result.data
  },

  startTask: async (taskId: string, agentId: string): Promise<A2ATask> => {
    const result = await apiClient.post<ApiResponse<A2ATask>>(`/a2a/tasks/${taskId}/start`, { agentId })
    if (!result?.data) throw new Error('启动任务失败')
    return result.data
  },

  deliverTask: async (taskId: string, agentId: string, dto: DeliverTaskRequest): Promise<A2ATask> => {
    const result = await apiClient.post<ApiResponse<A2ATask>>(`/a2a/tasks/${taskId}/deliver`, { agentId, ...dto })
    if (!result?.data) throw new Error('提交交付物失败')
    return result.data
  },

  reviewTask: async (taskId: string, agentId: string, dto: ReviewTaskRequest): Promise<A2ATask> => {
    const result = await apiClient.post<ApiResponse<A2ATask>>(`/a2a/tasks/${taskId}/review`, { agentId, ...dto })
    if (!result?.data) throw new Error('审核任务失败')
    return result.data
  },

  cancelTask: async (taskId: string, agentId: string, reason?: string): Promise<A2ATask> => {
    const result = await apiClient.post<ApiResponse<A2ATask>>(`/a2a/tasks/${taskId}/cancel`, { agentId, reason })
    if (!result?.data) throw new Error('取消任务失败')
    return result.data
  },

  // Reputation
  getReputation: async (agentId: string): Promise<AgentReputation> => {
    const result = await apiClient.get<ApiResponse<AgentReputation>>(`/a2a/reputation/${agentId}`)
    if (!result?.data) throw new Error('获取信誉失败')
    return result.data
  },
}
