/**
 * Skill API - 前端调用后端 Skill 模块的接口
 */

import { apiClient } from './client';

// ========== 类型定义 ==========

export type SkillCategory = 'payment' | 'commerce' | 'data' | 'utility' | 'integration' | 'custom';
export type SkillStatus = 'draft' | 'published' | 'deprecated';
export type SkillPricingType = 'free' | 'per_call' | 'subscription' | 'revenue_share' | 'percentage';
export type AIPlatform = 'openai' | 'claude' | 'gemini' | 'grok' | 'qwen';

export interface SkillInputSchema {
  type: 'object';
  properties: Record<string, {
    type: string;
    description: string;
    required?: boolean;
    enum?: string[];
    default?: any;
    minimum?: number;
    maximum?: number;
  }>;
  required: string[];
}

export interface SkillOutputSchema {
  type: 'object';
  properties: Record<string, any>;
}

export interface SkillExecutor {
  type: 'http' | 'internal' | 'mcp' | 'contract';
  endpoint?: string;
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  headers?: Record<string, string>;
  internalHandler?: string;
  mcpServer?: string;
  contractAddress?: string;
}

export interface SkillPricing {
  type: SkillPricingType;
  pricePerCall?: number;
  currency?: string;
  freeQuota?: number;
  commissionRate?: number; // V2.0: 分佣比例 (0-100)
  platformFeeRate?: number;
  minFee?: number;
}

export interface SkillPlatformSchemas {
  openai?: any;
  claude?: any;
  gemini?: any;
  grok?: any;
  qwen?: any;
}

// V2.0: 价值类型分类
export type SkillValueType = 'action' | 'deliverable' | 'decision' | 'data';

export interface Skill {
  id: string;
  name: string;
  displayName?: string;
  description: string;
  version: string;
  category: SkillCategory;
  status: SkillStatus;
  inputSchema: SkillInputSchema;
  outputSchema?: SkillOutputSchema;
  executor: SkillExecutor;
  platformSchemas?: SkillPlatformSchemas;
  pricing?: SkillPricing;
  tags?: string[];
  authorId?: string;
  callCount: number;
  rating: number;
  metadata?: Record<string, any>;
  // V2.0: 协议支持
  ucpEnabled?: boolean;
  x402Enabled?: boolean;
  // V2.0: 价值类型
  valueType?: SkillValueType;
  // V2.0: 层级
  layer?: 'infra' | 'resource' | 'logic' | 'composite';
  createdAt: string;
  updatedAt: string;
}

export interface CreateSkillDto {
  name: string;
  displayName?: string;
  description: string;
  version?: string;
  category?: SkillCategory;
  inputSchema: SkillInputSchema;
  outputSchema?: SkillOutputSchema;
  executor: SkillExecutor;
  pricing?: SkillPricing;
  tags?: string[];
  metadata?: Record<string, any>;
  // V2.0: 协议支持
  ucpEnabled?: boolean;
  x402Enabled?: boolean;
  // V2.0: 价值类型
  valueType?: SkillValueType;
}

export interface UpdateSkillDto {
  name?: string;
  displayName?: string;
  description?: string;
  version?: string;
  category?: SkillCategory;
  status?: SkillStatus;
  inputSchema?: SkillInputSchema;
  outputSchema?: SkillOutputSchema;
  executor?: SkillExecutor;
  pricing?: SkillPricing;
  tags?: string[];
  metadata?: Record<string, any>;
}

export interface SkillListParams {
  category?: SkillCategory;
  status?: SkillStatus;
  search?: string;
  tags?: string[];
  authorId?: string;
  page?: number;
  limit?: number;
}

export interface SkillListResponse {
  success: boolean;
  items: Skill[];
  total: number;
  page: number;
  limit: number;
}

export interface SkillExecutionResult {
  success: boolean;
  data?: any;
  error?: string;
  executionTime?: number;
  receiptId?: string;
}

export interface SkillValidationResult {
  valid: boolean;
  errors?: string[];
  warnings?: string[];
}

// ========== API 方法 ==========

export const skillApi = {
  /**
   * 创建 Skill
   */
  create: async (dto: CreateSkillDto): Promise<{ success: boolean; data: Skill; platformSchemas: SkillPlatformSchemas }> => {
    return apiClient.post('/skills', dto);
  },

  /**
   * 获取 Skill 详情
   */
  get: async (id: string): Promise<{ success: boolean; data: Skill }> => {
    return apiClient.get(`/skills/${id}`);
  },

  /**
   * 列表查询
   */
  list: async (params?: SkillListParams): Promise<SkillListResponse> => {
    const queryParams = new URLSearchParams();
    if (params?.category) queryParams.append('category', params.category);
    if (params?.status) queryParams.append('status', params.status);
    if (params?.search) queryParams.append('search', params.search);
    if (params?.page) queryParams.append('page', params.page.toString());
    if (params?.limit) queryParams.append('limit', params.limit.toString());
    
    const queryString = queryParams.toString();
    return apiClient.get(`/skills${queryString ? `?${queryString}` : ''}`);
  },

  /**
   * 更新 Skill
   */
  update: async (id: string, dto: UpdateSkillDto): Promise<{ success: boolean; data: Skill }> => {
    return apiClient.put(`/skills/${id}`, dto);
  },

  /**
   * 删除 Skill
   */
  delete: async (id: string): Promise<void> => {
    return apiClient.delete(`/skills/${id}`);
  },

  /**
   * 发布 Skill
   */
  publish: async (id: string): Promise<{ success: boolean; data: Skill; message: string }> => {
    return apiClient.post(`/skills/${id}/publish`, {});
  },

  /**
   * 执行 Skill
   */
  execute: async (id: string, params: any, context?: any): Promise<SkillExecutionResult> => {
    return apiClient.post(`/skills/${id}/execute`, { params, context });
  },

  /**
   * 获取指定平台的 Schema
   */
  getPlatformSchema: async (id: string, platform: AIPlatform): Promise<{ success: boolean; platform: string; schema: any }> => {
    return apiClient.get(`/skills/${id}/schema/${platform}`);
  },

  /**
   * 导出 OpenAPI Schema（用于 GPTs Actions）
   */
  exportOpenAPI: async (skillIds: string[], baseUrl?: string): Promise<{ success: boolean; openapi: any }> => {
    return apiClient.post('/skills/export/openapi', { skillIds, baseUrl });
  },

  /**
   * 导出 MCP 工具定义（用于 Claude）
   */
  exportMCP: async (skillIds: string[]): Promise<{ success: boolean; tools: any[] }> => {
    return apiClient.post('/skills/export/mcp', { skillIds });
  },

  /**
   * 校验 Skill 定义
   */
  validate: async (dto: CreateSkillDto): Promise<SkillValidationResult> => {
    return apiClient.post('/skills/validate', dto);
  },

  /**
   * 批量导入 Skills
   */
  batchImport: async (skills: CreateSkillDto[]): Promise<{ success: boolean; imported: number; failed: number; errors?: string[] }> => {
    return apiClient.post('/skills/batch-import', { skills });
  },

  /**
   * 获取我的 Skills
   */
  getMySkills: async (params?: Omit<SkillListParams, 'authorId'>): Promise<SkillListResponse> => {
    const queryParams = new URLSearchParams();
    if (params?.category) queryParams.append('category', params.category);
    if (params?.status) queryParams.append('status', params.status);
    if (params?.search) queryParams.append('search', params.search);
    if (params?.page) queryParams.append('page', params.page.toString());
    if (params?.limit) queryParams.append('limit', params.limit.toString());
    
    const queryString = queryParams.toString();
    return apiClient.get(`/skills/my${queryString ? `?${queryString}` : ''}`);
  },

  /**
   * 获取 Marketplace 上架的 Skills
   */
  getMarketplaceSkills: async (params?: Omit<SkillListParams, 'status'>): Promise<SkillListResponse> => {
    const queryParams = new URLSearchParams();
    queryParams.append('status', 'published');
    if (params?.category) queryParams.append('category', params.category);
    if (params?.search) queryParams.append('search', params.search);
    if (params?.page) queryParams.append('page', params.page.toString());
    if (params?.limit) queryParams.append('limit', params.limit.toString());
    
    const queryString = queryParams.toString();
    return apiClient.get(`/skills/marketplace?${queryString}`);
  },

  /**
   * 从 OpenAPI 导入
   */
  importOpenApi: async (url: string, config?: any): Promise<any> => {
    return apiClient.post('/skills/import-openapi', { url, config });
  },

  // ========== 用户技能安装管理 ==========

  /**
   * 获取用户已安装的技能
   */
  getInstalledSkills: async (params?: { page?: number; limit?: number }): Promise<SkillListResponse & { items: (Skill & { isEnabled: boolean; config?: Record<string, any>; installedAt: string })[] }> => {
    const queryParams = new URLSearchParams();
    if (params?.page) queryParams.append('page', params.page.toString());
    if (params?.limit) queryParams.append('limit', params.limit.toString());
    
    const queryString = queryParams.toString();
    return apiClient.get(`/skills/installed${queryString ? `?${queryString}` : ''}`);
  },

  /**
   * 安装技能
   */
  installSkill: async (skillId: string, config?: Record<string, any>): Promise<{ success: boolean; data: any }> => {
    return apiClient.post(`/skills/${skillId}/install`, { config });
  },

  /**
   * 卸载技能
   */
  uninstallSkill: async (skillId: string): Promise<void> => {
    return apiClient.delete(`/skills/${skillId}/install`);
  },

  /**
   * 更新已安装技能的配置或启用状态
   */
  updateInstalledSkill: async (skillId: string, update: { isEnabled?: boolean; config?: Record<string, any> }): Promise<{ success: boolean; data: any }> => {
    return apiClient.patch(`/skills/${skillId}/install`, update);
  },

  /**
   * 检查技能是否已安装
   */
  isSkillInstalled: async (skillId: string): Promise<{ installed: boolean }> => {
    return apiClient.get(`/skills/${skillId}/installed`);
  },

  /**
   * Commerce Skill 一键发布到 Marketplace
   * 整合: skill creation + pricing + split plan + budget pool + marketplace listing
   */
  commercePublish: async (dto: CommercePublishDto): Promise<CommercePublishResult> => {
    return apiClient.post('/commerce/publish', dto);
  },

  /**
   * Commerce Skill 发布预览
   */
  commercePublishPreview: async (dto: CommercePublishDto): Promise<any> => {
    return apiClient.post('/commerce/publish/preview', dto);
  },
};

// ========== Commerce Publish Types ==========

export interface SplitRuleDto {
  recipient: string;
  shareBps: number;
  role: 'platform' | 'merchant' | 'agent' | 'referrer' | 'custom';
}

export interface CommercePublishDto {
  skillId?: string;
  name?: string;
  displayName?: string;
  description?: string;
  category?: string;
  version?: string;
  tags?: string[];
  executor?: SkillExecutor;
  inputSchema?: SkillInputSchema;
  outputSchema?: SkillOutputSchema;
  pricing: {
    type: string;
    pricePerCall?: number;
    currency?: string;
    freeQuota?: number;
    commissionRate?: number;
  };
  splitPlan?: {
    splitPlanId?: string;
    name?: string;
    productType?: string;
    rules?: SplitRuleDto[];
    feeConfig?: {
      onrampFeeBps?: number;
      offrampFeeBps?: number;
      splitFeeBps?: number;
      minSplitFee?: number;
    };
  };
  budgetPool?: {
    totalBudget: number;
    currency?: string;
    deadline?: string;
    milestones?: Array<{
      name: string;
      description?: string;
      reservedAmount: number;
    }>;
  };
  marketplace?: {
    humanAccessible?: boolean;
    featured?: boolean;
    targetPlatforms?: string[];
    legacyListing?: boolean;
  };
  ucpEnabled?: boolean;
  x402Enabled?: boolean;
}

export interface CommercePublishResult {
  success: boolean;
  skill: Skill;
  splitPlan?: any;
  budgetPoolId?: string;
  marketplaceListingId?: string;
  publishedAt: string;
  endpoints: {
    marketplace: string;
    execute: string;
    analytics: string;
    splitPlanPreview?: string;
  };
}
