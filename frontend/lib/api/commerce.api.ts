import { apiClient } from './client';

// ===== Types =====

export type ProductType = 'physical' | 'service' | 'virtual' | 'nft' | 'skill' | 'agent_task';
export type SplitPlanStatus = 'draft' | 'active' | 'archived';
export type BudgetPoolStatus = 'draft' | 'funded' | 'active' | 'depleted' | 'expired' | 'cancelled';
export type MilestoneStatus = 'pending' | 'in_progress' | 'pending_review' | 'approved' | 'rejected' | 'released';
export type FundingSource = 'payment' | 'wallet' | 'credit';
export type ApprovalType = 'auto' | 'manual' | 'quality_gate';

export interface SplitRule {
  recipient: string;
  shareBps: number;
  role: 'executor' | 'referrer' | 'promoter' | 'l1' | 'l2' | 'l3' | 'custom';
  source: 'pool' | 'platform' | 'merchant';
  customRoleName?: string;
  active: boolean;
}

export interface FeeConfig {
  onrampFeeBps: number;
  offrampFeeBps: number;
  splitFeeBps: number;
  minSplitFee: number;
}

export interface SplitPlan {
  id: string;
  name: string;
  description?: string;
  version: number;
  productType: ProductType;
  rules: SplitRule[];
  feeConfig: FeeConfig;
  tiers?: any[];
  caps?: any[];
  status: SplitPlanStatus;
  isSystemTemplate: boolean;
  ownerId?: string;
  usageCount: number;
  metadata?: Record<string, any>;
  createdAt: string;
  updatedAt: string;
}

export interface BudgetPool {
  id: string;
  name: string;
  description?: string;
  projectId?: string;
  totalBudget: string;
  fundedAmount: string;
  reservedAmount: string;
  releasedAmount: string;
  currency: string;
  fundingSource: FundingSource;
  splitPlanId?: string;
  splitPlan?: SplitPlan;
  status: BudgetPoolStatus;
  expiresAt?: string;
  ownerId: string;
  metadata?: Record<string, any>;
  createdAt: string;
  updatedAt: string;
}

export interface MilestoneParticipant {
  agentId: string;
  address: string;
  role: string;
  shareOverride?: number;
}

export interface QualityGate {
  metric: 'test_pass_rate' | 'score' | 'custom';
  threshold: number;
  operator: '>=' | '>' | '=' | '<' | '<=';
  customMetricName?: string;
}

export interface Artifact {
  type: 'document' | 'code' | 'design' | 'report' | 'other';
  url?: string;
  hash?: string;
  description?: string;
  metadata?: Record<string, any>;
}

export interface Milestone {
  id: string;
  name: string;
  description?: string;
  budgetPoolId: string;
  orderId?: string;
  reservedAmount: string;
  releasedAmount: string;
  participants: MilestoneParticipant[];
  status: MilestoneStatus;
  approvalType: ApprovalType;
  qualityGate?: QualityGate;
  artifacts: Artifact[];
  reviewedById?: string;
  reviewedAt?: string;
  reviewNote?: string;
  releasedAt?: string;
  dueDate?: string;
  sortOrder: number;
  metadata?: Record<string, any>;
  createdAt: string;
  updatedAt: string;
}

export interface AllocationPreview {
  grossAmount: number;
  currency: string;
  fees: {
    onrampFee: number;
    offrampFee: number;
    splitFee: number;
    totalFees: number;
  };
  allocations: Array<{
    recipient: string;
    role: string;
    amount: number;
    percentage: number;
    source: string;
  }>;
  merchantNet: number;
  rateBreakdown: {
    onrampRate: string;
    offrampRate: string;
    splitRate: string;
  };
}

export interface PoolStats {
  totalBudget: string;
  funded: string;
  reserved: string;
  released: string;
  available: string;
  milestoneCount: number;
  completedMilestones: number;
}

export interface UsageHint {
  key: string;
  type: 'upgrade' | 'marketplace' | 'pattern' | 'welcome';
  priority: 'low' | 'medium' | 'high';
  message: string;
  messageZh: string;
  action: string;
  actionZh: string;
  link: string;
  suggestedConfig?: {
    productType?: string;
    fee?: string;
    splitRules?: Array<{ role: string; share: string }>;
  };
  dismissible: boolean;
  expiresAt?: string;
}

// ===== API Functions =====

export const commerceApi = {
  // ===== Split Plans =====
  
  async getSplitPlans(options?: { status?: SplitPlanStatus; productType?: string }): Promise<SplitPlan[]> {
    const params = new URLSearchParams();
    if (options?.status) params.append('status', options.status);
    if (options?.productType) params.append('productType', options.productType);
    const query = params.toString();
    return apiClient.get(`/commerce/split-plans${query ? `?${query}` : ''}`);
  },

  async getSplitPlan(id: string): Promise<SplitPlan> {
    return apiClient.get(`/commerce/split-plans/${id}`);
  },

  async createSplitPlan(data: {
    name: string;
    description?: string;
    productType: ProductType;
    rules?: SplitRule[];
    feeConfig?: Partial<FeeConfig>;
    metadata?: Record<string, any>;
  }): Promise<SplitPlan> {
    return apiClient.post('/commerce/split-plans', data);
  },

  async updateSplitPlan(id: string, data: Partial<{
    name: string;
    description: string;
    rules: SplitRule[];
    feeConfig: Partial<FeeConfig>;
    status: SplitPlanStatus;
    metadata: Record<string, any>;
  }>): Promise<SplitPlan> {
    return apiClient.put(`/commerce/split-plans/${id}`, data);
  },

  async activateSplitPlan(id: string): Promise<SplitPlan> {
    return apiClient.post(`/commerce/split-plans/${id}/activate`);
  },

  async archiveSplitPlan(id: string): Promise<SplitPlan> {
    return apiClient.post(`/commerce/split-plans/${id}/archive`);
  },

  async deleteSplitPlan(id: string): Promise<void> {
    return apiClient.delete(`/commerce/split-plans/${id}`);
  },

  async previewAllocation(data: {
    amount: number;
    currency: string;
    productType?: ProductType;
    usesOnramp?: boolean;
    usesOfframp?: boolean;
    usesSplit?: boolean;
    splitPlanId?: string;
    participantOverrides?: Record<string, string>;
  }): Promise<AllocationPreview> {
    return apiClient.post('/commerce/split-plans/preview', data);
  },

  async getDefaultTemplate(productType: string): Promise<SplitPlan | null> {
    return apiClient.get(`/commerce/split-plans/templates/${productType}`);
  },

  // ===== Budget Pools =====

  async getBudgetPools(options?: { status?: BudgetPoolStatus }): Promise<BudgetPool[]> {
    const params = new URLSearchParams();
    if (options?.status) params.append('status', options.status);
    const query = params.toString();
    return apiClient.get(`/commerce/budget-pools${query ? `?${query}` : ''}`);
  },

  async getBudgetPool(id: string): Promise<BudgetPool> {
    return apiClient.get(`/commerce/budget-pools/${id}`);
  },

  async createBudgetPool(data: {
    name: string;
    description?: string;
    projectId?: string;
    totalBudget: number;
    currency: string;
    splitPlanId?: string;
    expiresAt?: string;
    metadata?: Record<string, any>;
  }): Promise<BudgetPool> {
    return apiClient.post('/commerce/budget-pools', data);
  },

  async updateBudgetPool(id: string, data: Partial<{
    name: string;
    description: string;
    splitPlanId: string;
    expiresAt: string;
    metadata: Record<string, any>;
  }>): Promise<BudgetPool> {
    return apiClient.put(`/commerce/budget-pools/${id}`, data);
  },

  async fundBudgetPool(id: string, data: {
    amount: number;
    fundingSource: FundingSource;
    paymentIntentId?: string;
    walletAddress?: string;
    txHash?: string;
  }): Promise<BudgetPool> {
    return apiClient.post(`/commerce/budget-pools/${id}/fund`, data);
  },

  async cancelBudgetPool(id: string): Promise<BudgetPool> {
    return apiClient.post(`/commerce/budget-pools/${id}/cancel`);
  },

  async getPoolStats(id: string): Promise<PoolStats> {
    return apiClient.get(`/commerce/budget-pools/${id}/stats`);
  },

  // ===== Milestones =====

  async getMilestones(budgetPoolId: string): Promise<Milestone[]> {
    return apiClient.get(`/commerce/budget-pools/${budgetPoolId}/milestones`);
  },

  async getMilestone(id: string): Promise<Milestone> {
    return apiClient.get(`/commerce/milestones/${id}`);
  },

  async createMilestone(data: {
    name: string;
    description?: string;
    budgetPoolId: string;
    reservedAmount: number;
    participants?: MilestoneParticipant[];
    approvalType?: ApprovalType;
    qualityGate?: QualityGate;
    dueDate?: string;
    sortOrder?: number;
    metadata?: Record<string, any>;
  }): Promise<Milestone> {
    return apiClient.post('/commerce/milestones', data);
  },

  async startMilestone(id: string): Promise<Milestone> {
    return apiClient.post(`/commerce/milestones/${id}/start`);
  },

  async submitMilestone(id: string, data: {
    artifacts: Artifact[];
    note?: string;
  }): Promise<Milestone> {
    return apiClient.post(`/commerce/milestones/${id}/submit`, data);
  },

  async approveMilestone(id: string, data?: {
    reviewNote?: string;
    qualityScore?: number;
  }): Promise<Milestone> {
    return apiClient.post(`/commerce/milestones/${id}/approve`, data || {});
  },

  async rejectMilestone(id: string, data: {
    reason: string;
    reviewNote?: string;
  }): Promise<Milestone> {
    return apiClient.post(`/commerce/milestones/${id}/reject`, data);
  },

  async releaseMilestone(id: string): Promise<Milestone> {
    return apiClient.post(`/commerce/milestones/${id}/release`);
  },

  // ===== MCP Tool Execute =====

  async execute(action: string, params?: Record<string, any>, mode: 'PAY_ONLY' | 'SPLIT_ONLY' | 'PAY_AND_SPLIT' = 'PAY_AND_SPLIT'): Promise<any> {
    return apiClient.post('/commerce/execute', { action, params, mode });
  },

  // ===== Conversion Hints =====

  async getConversionHints(): Promise<UsageHint | null> {
    return apiClient.get('/commerce/conversion-hints');
  },

  async dismissHint(hintKey: string): Promise<{ success: boolean } | null> {
    return apiClient.post('/commerce/dismiss-hint', { hintType: hintKey });
  },

  async getUsageStats(): Promise<{ totalCalls: number; callsLast7Days: number; uniqueActions: string[]; patterns: string[] } | null> {
    return apiClient.get('/commerce/usage-stats');
  },

  async getSuggestedMarketplaceConfig(): Promise<{
    productType: string;
    suggestedFee: string;
    splitRules: Array<{ role: string; share: string }>;
    template: string;
  } | null> {
    return apiClient.get('/commerce/suggested-marketplace-config');
  },
};
