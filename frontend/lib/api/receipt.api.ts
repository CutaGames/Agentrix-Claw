/**
 * Receipt/Audit API - 前端调用收据与审计模块的接口
 */

import { apiClient } from './client';

// ========== 类型定义 ==========

export type ReceiptType = 
  | 'skill_execution'
  | 'payment_created'
  | 'payment_completed'
  | 'order_created'
  | 'order_fulfilled'
  | 'webhook_sent'
  | 'webhook_received'
  | 'agent_action'
  | 'marketplace_publish'
  | 'pack_generated';

export type ReceiptStatus = 'pending' | 'success' | 'failed';

export interface Receipt {
  id: string;
  type: ReceiptType;
  status: ReceiptStatus;
  userId?: string;
  merchantId?: string;
  skillId?: string;
  orderId?: string;
  paymentId?: string;
  agentId?: string;
  description: string;
  requestData?: any;
  responseData?: any;
  metadata?: {
    ipAddress?: string;
    userAgent?: string;
    sessionId?: string;
    errorMessage?: string;
    executionTime?: number;
    proofHash?: string;
    previousProofHash?: string;
  };
  createdAt: string;
}

export interface ReceiptListParams {
  type?: ReceiptType;
  status?: ReceiptStatus;
  userId?: string;
  merchantId?: string;
  skillId?: string;
  orderId?: string;
  startDate?: string;
  endDate?: string;
  page?: number;
  limit?: number;
}

export interface ReceiptListResponse {
  success: boolean;
  items: Receipt[];
  total: number;
  page: number;
  limit: number;
}

export interface AuditPackage {
  id: string;
  name: string;
  description?: string;
  receipts: Receipt[];
  summary: {
    totalReceipts: number;
    byType: Record<ReceiptType, number>;
    byStatus: Record<ReceiptStatus, number>;
    dateRange: { start: string; end: string };
  };
  proofChain: {
    rootHash: string;
    chainValid: boolean;
  };
  generatedAt: string;
  generatedBy?: string;
}

export interface VerificationResult {
  valid: boolean;
  receipt?: Receipt;
  proofChainValid?: boolean;
  errors?: string[];
}

// ========== API 方法 ==========

export const receiptApi = {
  /**
   * 获取收据列表
   */
  list: async (params?: ReceiptListParams): Promise<ReceiptListResponse> => {
    const queryParams = new URLSearchParams();
    if (params?.type) queryParams.append('type', params.type);
    if (params?.status) queryParams.append('status', params.status);
    if (params?.userId) queryParams.append('userId', params.userId);
    if (params?.merchantId) queryParams.append('merchantId', params.merchantId);
    if (params?.skillId) queryParams.append('skillId', params.skillId);
    if (params?.orderId) queryParams.append('orderId', params.orderId);
    if (params?.startDate) queryParams.append('startDate', params.startDate);
    if (params?.endDate) queryParams.append('endDate', params.endDate);
    if (params?.page) queryParams.append('page', params.page.toString());
    if (params?.limit) queryParams.append('limit', params.limit.toString());
    
    const queryString = queryParams.toString();
    return apiClient.get(`/receipts${queryString ? `?${queryString}` : ''}`);
  },

  /**
   * 获取单个收据详情
   */
  get: async (id: string): Promise<{ success: boolean; data: Receipt }> => {
    return apiClient.get(`/receipts/${id}`);
  },

  /**
   * 验证收据
   */
  verify: async (id: string): Promise<VerificationResult> => {
    return apiClient.post(`/receipts/${id}/verify`, {});
  },

  /**
   * 生成审计包
   */
  generateAuditPackage: async (params: {
    name: string;
    description?: string;
    receiptIds?: string[];
    filters?: ReceiptListParams;
  }): Promise<{ success: boolean; data: AuditPackage }> => {
    return apiClient.post('/receipts/audit-package', params);
  },

  /**
   * 获取审计包列表
   */
  listAuditPackages: async (params?: {
    page?: number;
    limit?: number;
  }): Promise<{ success: boolean; items: AuditPackage[]; total: number }> => {
    const queryParams = new URLSearchParams();
    if (params?.page) queryParams.append('page', params.page.toString());
    if (params?.limit) queryParams.append('limit', params.limit.toString());
    
    const queryString = queryParams.toString();
    return apiClient.get(`/receipts/audit-packages${queryString ? `?${queryString}` : ''}`);
  },

  /**
   * 下载审计包
   */
  downloadAuditPackage: async (id: string): Promise<Blob> => {
    return apiClient.get(`/receipts/audit-packages/${id}/download`, {
      responseType: 'blob',
    } as any);
  },

  /**
   * 获取收据统计
   */
  getStats: async (params?: {
    userId?: string;
    merchantId?: string;
    startDate?: string;
    endDate?: string;
  }): Promise<{
    success: boolean;
    stats: {
      total: number;
      byType: Record<ReceiptType, number>;
      byStatus: Record<ReceiptStatus, number>;
      recentTrend: { date: string; count: number }[];
    };
  }> => {
    const queryParams = new URLSearchParams();
    if (params?.userId) queryParams.append('userId', params.userId);
    if (params?.merchantId) queryParams.append('merchantId', params.merchantId);
    if (params?.startDate) queryParams.append('startDate', params.startDate);
    if (params?.endDate) queryParams.append('endDate', params.endDate);
    
    const queryString = queryParams.toString();
    return apiClient.get(`/receipts/stats${queryString ? `?${queryString}` : ''}`);
  },

  /**
   * 根据订单ID获取相关收据
   */
  getByOrder: async (orderId: string): Promise<ReceiptListResponse> => {
    return apiClient.get(`/receipts/by-order/${orderId}`);
  },

  /**
   * 根据 Skill ID 获取执行收据
   */
  getBySkill: async (skillId: string, params?: { page?: number; limit?: number }): Promise<ReceiptListResponse> => {
    const queryParams = new URLSearchParams();
    if (params?.page) queryParams.append('page', params.page.toString());
    if (params?.limit) queryParams.append('limit', params.limit.toString());
    
    const queryString = queryParams.toString();
    return apiClient.get(`/receipts/by-skill/${skillId}${queryString ? `?${queryString}` : ''}`);
  },
};
