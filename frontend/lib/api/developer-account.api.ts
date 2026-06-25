import { apiClient } from './client';

/**
 * 开发者账户状态
 */
export enum DeveloperAccountStatus {
  PENDING = 'pending',
  ACTIVE = 'active',
  SUSPENDED = 'suspended',
  REVOKED = 'revoked',
  BANNED = 'banned',
}

/**
 * 开发者等级
 */
export enum DeveloperTier {
  STARTER = 'starter',
  PROFESSIONAL = 'professional',
  ENTERPRISE = 'enterprise',
  PARTNER = 'partner',
}

/**
 * 开发者类型
 */
export enum DeveloperType {
  INDIVIDUAL = 'individual',
  TEAM = 'team',
  COMPANY = 'company',
  AGENCY = 'agency',
}

/**
 * 开发者账户
 */
export interface DeveloperAccount {
  id: string;
  developerUniqueId: string;
  userId: string;
  name: string;
  description?: string;
  website?: string;
  contactEmail?: string;
  type: DeveloperType;
  tier: DeveloperTier;
  status: DeveloperAccountStatus;
  statusReason?: string;

  // API 访问配置
  maxApiKeys: number;
  currentApiKeyCount: number;
  globalRateLimit: number;
  dailyRequestLimit: number;
  monthlyRequestLimit: number;
  allowedScopes?: string[];

  // SDK & 集成
  allowedSdks?: string[];
  webhookUrl?: string;
  webhookSecret?: string;
  oauthCallbackUrls?: string[];

  // 收益分成配置
  defaultAccountId?: string;
  revenueSharePercent: number;
  minWithdrawalAmount: number;
  settlementPeriodDays: number;

  // 统计数据
  publishedSkillCount: number;
  publishedAgentCount: number;
  totalApiCalls: number;
  todayApiCalls: number;
  monthApiCalls: number;
  totalRevenue: number;
  pendingRevenue: number;
  withdrawnRevenue: number;
  rating: number;
  ratingCount: number;

  // 认证与合规
  isEmailVerified: boolean;
  hasSignedAgreement: boolean;
  agreementSignedAt?: string;
  isKycVerified: boolean;
  kycRecordId?: string;

  // 元数据
  metadata?: {
    githubUrl?: string;
    socialLinks?: {
      twitter?: string;
      discord?: string;
      telegram?: string;
    };
    techStack?: string[];
    useCases?: string[];
    companyInfo?: {
      legalName?: string;
      registrationNumber?: string;
      address?: string;
      country?: string;
    };
    [key: string]: any;
  };

  approvedAt?: string;
  approvedBy?: string;
  lastActiveAt?: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * 创建开发者账户请求
 */
export interface CreateDeveloperAccountRequest {
  name: string;
  description?: string;
  website?: string;
  contactEmail?: string;
  type?: DeveloperType;
  metadata?: Record<string, any>;
}

/**
 * 更新开发者账户请求
 */
export interface UpdateDeveloperAccountRequest {
  name?: string;
  description?: string;
  website?: string;
  contactEmail?: string;
  webhookUrl?: string;
  oauthCallbackUrls?: string[];
  metadata?: Record<string, any>;
}

/**
 * 开发者仪表盘数据
 */
export interface DeveloperDashboard {
  account: DeveloperAccount;
  apiKeys: {
    total: number;
    active: number;
  };
  recentActivity: any[];
}

/**
 * API Key 限额检查结果
 */
export interface ApiKeyLimitCheck {
  canCreate: boolean;
  remaining: number;
}

/**
 * 请求限额检查结果
 */
export interface RateLimitCheck {
  allowed: boolean;
  dailyRemaining: number;
  monthlyRemaining: number;
}

/**
 * 开发者等级权益配置
 */
export const DEVELOPER_TIER_BENEFITS = {
  [DeveloperTier.STARTER]: {
    name: { zh: '入门级', en: 'Starter' },
    maxApiKeys: 3,
    rateLimit: '100/min',
    dailyLimit: '10,000',
    revenueShare: '70%',
    features: ['基础 API 访问', 'JS/Python SDK'],
  },
  [DeveloperTier.PROFESSIONAL]: {
    name: { zh: '专业级', en: 'Professional' },
    maxApiKeys: 10,
    rateLimit: '500/min',
    dailyLimit: '100,000',
    revenueShare: '75%',
    features: ['全部 API 访问', 'Webhook 支持', '优先支持'],
  },
  [DeveloperTier.ENTERPRISE]: {
    name: { zh: '企业级', en: 'Enterprise' },
    maxApiKeys: 50,
    rateLimit: '2,000/min',
    dailyLimit: '1,000,000',
    revenueShare: '80%',
    features: ['自定义限额', 'SLA 保障', '专属客户经理'],
  },
  [DeveloperTier.PARTNER]: {
    name: { zh: '合作伙伴', en: 'Partner' },
    maxApiKeys: 100,
    rateLimit: '5,000/min',
    dailyLimit: '无限',
    revenueShare: '85%',
    features: ['无限制 API', '白标支持', '共同营销'],
  },
};

/**
 * 开发者账户 API
 */
export const developerAccountApi = {
  /**
   * 创建开发者账户
   */
  async create(data: CreateDeveloperAccountRequest): Promise<DeveloperAccount> {
    return apiClient.post('/api/developer-accounts', data);
  },

  /**
   * 获取我的开发者账户
   */
  async getMyAccount(): Promise<DeveloperAccount | null> {
    try {
      return await apiClient.get('/api/developer-accounts/my');
    } catch (error: any) {
      if (error.status === 404) {
        return null;
      }
      throw error;
    }
  },

  /**
   * 获取开发者仪表盘
   */
  async getDashboard(): Promise<DeveloperDashboard> {
    return apiClient.get('/api/developer-accounts/dashboard');
  },

  /**
   * 获取开发者账户详情
   */
  async getById(id: string): Promise<DeveloperAccount> {
    return apiClient.get(`/api/developer-accounts/${id}`);
  },

  /**
   * 更新开发者账户
   */
  async update(id: string, data: UpdateDeveloperAccountRequest): Promise<DeveloperAccount> {
    return apiClient.put(`/api/developer-accounts/${id}`, data);
  },

  /**
   * 签署开发者协议
   */
  async signAgreement(id: string): Promise<DeveloperAccount> {
    return apiClient.post(`/api/developer-accounts/${id}/sign-agreement`);
  },

  /**
   * 检查 API Key 限额
   */
  async checkApiKeyLimit(id: string): Promise<ApiKeyLimitCheck> {
    return apiClient.get(`/api/developer-accounts/${id}/api-key-limit`);
  },

  /**
   * 检查请求限额
   */
  async checkRateLimit(id: string): Promise<RateLimitCheck> {
    return apiClient.get(`/api/developer-accounts/${id}/rate-limit`);
  },

  // ========== 管理员接口 ==========

  /**
   * 获取开发者列表（管理员）
   */
  async list(query?: {
    status?: DeveloperAccountStatus;
    tier?: DeveloperTier;
    type?: DeveloperType;
    search?: string;
    page?: number;
    limit?: number;
  }): Promise<{ data: DeveloperAccount[]; total: number; page: number; limit: number }> {
    const params = new URLSearchParams();
    if (query?.status) params.append('status', query.status);
    if (query?.tier) params.append('tier', query.tier);
    if (query?.type) params.append('type', query.type);
    if (query?.search) params.append('search', query.search);
    if (query?.page) params.append('page', query.page.toString());
    if (query?.limit) params.append('limit', query.limit.toString());
    
    return apiClient.get(`/api/developer-accounts?${params.toString()}`);
  },

  /**
   * 审核通过（管理员）
   */
  async approve(id: string): Promise<DeveloperAccount> {
    return apiClient.post(`/api/developer-accounts/${id}/approve`);
  },

  /**
   * 审核拒绝（管理员）
   */
  async reject(id: string, reason: string): Promise<DeveloperAccount> {
    return apiClient.post(`/api/developer-accounts/${id}/reject`, { reason });
  },

  /**
   * 暂停账户（管理员）
   */
  async suspend(id: string, reason: string): Promise<DeveloperAccount> {
    return apiClient.post(`/api/developer-accounts/${id}/suspend`, { reason });
  },

  /**
   * 恢复账户（管理员）
   */
  async resume(id: string): Promise<DeveloperAccount> {
    return apiClient.post(`/api/developer-accounts/${id}/resume`);
  },

  /**
   * 升级等级（管理员）
   */
  async upgradeTier(id: string, tier: DeveloperTier): Promise<DeveloperAccount> {
    return apiClient.post(`/api/developer-accounts/${id}/upgrade-tier`, { tier });
  },
};
