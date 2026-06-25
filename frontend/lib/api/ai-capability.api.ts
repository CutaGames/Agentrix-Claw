import { apiClient } from './client';

export type AIPlatform = 'openai' | 'claude' | 'gemini';

export interface FunctionSchema {
  name: string;
  description: string;
  parameters?: {
    type: string;
    properties?: Record<string, any>;
    required?: string[];
  };
  input_schema?: {
    type: string;
    properties?: Record<string, any>;
    required?: string[];
  };
}

export interface CapabilityInfo {
  platform: AIPlatform;
  count: number;
  functions: FunctionSchema[];
}

export interface ProductCapabilityInfo {
  productId: string;
  platform: AIPlatform | 'all';
  count: number;
  functions: FunctionSchema[];
}

export interface ExecutionResult {
  success: boolean;
  data?: any;
  error?: string;
  message?: string;
  transactionId?: string;
  orderId?: string;
  paymentId?: string;
}

export const aiCapabilityApi = {
  /**
   * 获取指定平台的所有能力
   */
  getPlatformCapabilities: async (platform: AIPlatform): Promise<CapabilityInfo> => {
    const result = await apiClient.get<CapabilityInfo>(`/ai-capability/platform/${platform}`);
    if (result === null) {
      throw new Error('无法获取平台能力，请稍后重试');
    }
    return result;
  },

  /**
   * 获取指定产品的所有能力
   */
  getProductCapabilities: async (
    productId: string,
    platform?: AIPlatform,
  ): Promise<ProductCapabilityInfo> => {
    const params = platform ? `?platform=${platform}` : '';
    const result = await apiClient.get<ProductCapabilityInfo>(
      `/ai-capability/product/${productId}${params}`,
    );
    if (result === null) {
      throw new Error('无法获取产品能力，请稍后重试');
    }
    return result;
  },

  /**
   * 注册产品能力（手动触发）
   */
  registerCapabilities: async (options: {
    productId?: string;
    productIds?: string[];
    platforms?: AIPlatform[];
  }): Promise<any> => {
    const result = await apiClient.post('/ai-capability/register', options);
    if (result === null) {
      throw new Error('注册能力失败，请稍后重试');
    }
    return result;
  },

  /**
   * 执行能力
   */
  executeCapability: async (options: {
    executor: string;
    params: Record<string, any>;
    context?: {
      userId?: string;
      sessionId?: string;
      apiKey?: string;
      metadata?: Record<string, any>;
    };
  }): Promise<ExecutionResult> => {
    const result = await apiClient.post<ExecutionResult>('/ai-capability/execute', options);
    if (result === null) {
      throw new Error('执行能力失败，请稍后重试');
    }
    return result;
  },
};

