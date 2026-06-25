
import { apiClient } from './client';
import { SkillLayer, SkillCategory, SkillResourceType, SkillSource } from '../../types/skill';

export interface UnifiedSearchParams {
  q?: string;
  layer?: SkillLayer[];
  category?: SkillCategory[];
  resourceType?: SkillResourceType[];
  source?: SkillSource[];
  priceMin?: number;
  priceMax?: number;
  rating?: number;
  humanAccessible?: boolean;
  callerType?: 'agent' | 'human';
  page?: number;
  limit?: number;
}

export interface UnifiedSkillInfo {
  id: string;
  name: string;
  displayName: string;
  description: string;
  version: string;
  category: SkillCategory;
  layer: SkillLayer;
  resourceType?: SkillResourceType;
  source: SkillSource;
  productId?: string;
  status: string;
  pricing: {
    type: string;
    pricePerCall?: number;
    currency?: string;
    commissionRate?: number;
  };
  tags: string[];
  callCount: number;
  rating: number;
  authorInfo: {
    id: string;
    name: string;
    type: string;
  };
  metadata: Record<string, any>;
  humanAccessible: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface UnifiedSearchResponse {
  results: UnifiedSkillInfo[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface ExecuteSkillParams {
  skillId: string;
  params: Record<string, any>;
  context?: {
    userId?: string;
    sessionId?: string;
    platform?: string;
  };
}

export interface ExecuteSkillResult {
  success: boolean;
  data?: any;
  error?: string;
  executionTime?: number;
  receiptId?: string;
  orderId?: string;
}

export interface PurchaseSkillParams {
  skillId: string;
  quantity?: number;
  paymentMethod?: string;
  shippingAddress?: any;
}

export interface PurchaseSkillResult {
  success: boolean;
  orderId?: string;
  paymentUrl?: string;
  error?: string;
}

export const unifiedMarketplaceApi = {
  search: async (params: UnifiedSearchParams): Promise<UnifiedSearchResponse> => {
    const response = await apiClient.get<UnifiedSearchResponse>(`/unified-marketplace/search`, { 
      params: params as any
    });
    return response as UnifiedSearchResponse;
  },

  getSkill: async (id: string): Promise<UnifiedSkillInfo> => {
    const response = await apiClient.get<UnifiedSkillInfo>(`/unified-marketplace/skills/${id}`);
    return response as UnifiedSkillInfo;
  },

  getTrending: async (limit = 10): Promise<any[]> => {
    const response = await apiClient.get(`/unified-marketplace/trending`, { params: { limit } });
    return response as any[];
  },

  getLayerStats: async (): Promise<any[]> => {
    const response = await apiClient.get(`/unified-marketplace/stats/layers`);
    return response as any[];
  },

  executeSkill: async (params: ExecuteSkillParams): Promise<ExecuteSkillResult> => {
    const response = await apiClient.post<ExecuteSkillResult>(`/skills/${params.skillId}/execute`, {
      params: params.params,
      context: params.context,
    });
    return response as ExecuteSkillResult;
  },

  purchaseSkill: async (params: PurchaseSkillParams): Promise<PurchaseSkillResult> => {
    const response = await apiClient.post<PurchaseSkillResult>(`/unified-marketplace/skills/${params.skillId}/purchase`, {
      quantity: params.quantity || 1,
      paymentMethod: params.paymentMethod,
      shippingAddress: params.shippingAddress,
    });
    return response as PurchaseSkillResult;
  },

  addToCart: async (skillId: string, quantity = 1): Promise<{ success: boolean }> => {
    const response = await apiClient.post(`/cart/add`, { skillId, quantity });
    return response as { success: boolean };
  },

  recordCall: async (skillId: string, data: any): Promise<any> => {
    const response = await apiClient.post(`/unified-marketplace/skills/${skillId}/record-call`, data);
    return response;
  },
};
