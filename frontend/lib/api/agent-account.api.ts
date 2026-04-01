/**
 * Agent 账户 API
 * Agent Account API
 */

import { apiClient } from './client';

export type AgentAccountType = 'personal' | 'merchant' | 'platform' | 'third_party';
export type AgentAccountStatus = 'draft' | 'active' | 'suspended' | 'revoked';
export type RiskLevel = 'low' | 'medium' | 'high' | 'critical';

export interface SpendingLimits {
  perTransaction: number;
  daily: number;
  monthly: number;
}

export interface AgentAccount {
  id: string;
  userId: string;
  agentUniqueId: string;
  name: string;
  description?: string;
  agentType: AgentAccountType;
  status: AgentAccountStatus;

  // 信用评分
  creditScore: number;
  riskLevel: RiskLevel;

  // 支出限额
  spendingLimits: SpendingLimits;

  // 使用统计
  spentToday: number;
  spentThisMonth: number;
  totalSpent: number;

  // 关联账户
  linkedAccountId?: string;
  linkedWalletAddress?: string;

  // 链上状态
  isOnChain: boolean;
  onChainAttestationId?: string;

  // 授权配置
  autoPayEnabled: boolean;
  autoPayLimit?: number;

  createdAt: string;
  updatedAt: string;
}

export interface CreateAgentAccountRequest {
  name: string;
  description?: string;
  agentType?: AgentAccountType;
  spendingLimits?: Partial<SpendingLimits>;
  linkedAccountId?: string;
}

export interface UpdateAgentAccountRequest {
  name?: string;
  description?: string;
  spendingLimits?: Partial<SpendingLimits>;
  autoPayEnabled?: boolean;
  autoPayLimit?: number;
}

export interface SpendingCheckResult {
  allowed: boolean;
  reason?: string;
  currentSpent: number;
  limit: number;
  remainingToday: number;
  remainingThisMonth: number;
}

export interface CreditScoreHistory {
  date: string;
  score: number;
  change: number;
  reason?: string;
}

interface AgentPresenceMetadata {
  accountCompatibility?: {
    agentType?: AgentAccountType;
    creditScore?: number;
    riskLevel?: RiskLevel;
    spendingLimits?: Partial<SpendingLimits>;
    spentToday?: number;
    spentThisMonth?: number;
    totalSpent?: number;
    linkedAccountId?: string;
    linkedWalletAddress?: string;
    isOnChain?: boolean;
    onChainAttestationId?: string;
    autoPayEnabled?: boolean;
    autoPayLimit?: number;
    creditHistory?: CreditScoreHistory[];
    statusReason?: string;
  };
}

interface AgentPresenceAgent {
  id: string;
  userId: string;
  name: string;
  description?: string;
  status: 'draft' | 'active' | 'paused' | 'archived';
  slug?: string;
  metadata?: AgentPresenceMetadata;
  createdAt: string;
  updatedAt: string;
}

const DEFAULT_LIMITS: SpendingLimits = {
  perTransaction: 100,
  daily: 500,
  monthly: 2000,
};

const mapStatusToAccount = (status: AgentPresenceAgent['status']): AgentAccountStatus => {
  switch (status) {
    case 'paused':
      return 'suspended';
    case 'archived':
      return 'revoked';
    default:
      return status;
  }
};

const mapStatusToPresence = (status: AgentAccountStatus): AgentPresenceAgent['status'] => {
  switch (status) {
    case 'suspended':
      return 'paused';
    case 'revoked':
      return 'archived';
    default:
      return status;
  }
};

const normalizeSpendingLimits = (limits?: Partial<SpendingLimits>): SpendingLimits => ({
  perTransaction: limits?.perTransaction ?? DEFAULT_LIMITS.perTransaction,
  daily: limits?.daily ?? DEFAULT_LIMITS.daily,
  monthly: limits?.monthly ?? DEFAULT_LIMITS.monthly,
});

const mapAgentToAccount = (agent: AgentPresenceAgent): AgentAccount => {
  const compatibility = agent.metadata?.accountCompatibility ?? {};
  return {
    id: agent.id,
    userId: agent.userId,
    agentUniqueId: agent.slug || `presence-${agent.id.slice(0, 8)}`,
    name: agent.name,
    description: agent.description,
    agentType: compatibility.agentType ?? 'personal',
    status: mapStatusToAccount(agent.status),
    creditScore: compatibility.creditScore ?? 720,
    riskLevel: compatibility.riskLevel ?? 'low',
    spendingLimits: normalizeSpendingLimits(compatibility.spendingLimits),
    spentToday: compatibility.spentToday ?? 0,
    spentThisMonth: compatibility.spentThisMonth ?? 0,
    totalSpent: compatibility.totalSpent ?? 0,
    linkedAccountId: compatibility.linkedAccountId,
    linkedWalletAddress: compatibility.linkedWalletAddress,
    isOnChain: compatibility.isOnChain ?? false,
    onChainAttestationId: compatibility.onChainAttestationId,
    autoPayEnabled: compatibility.autoPayEnabled ?? false,
    autoPayLimit: compatibility.autoPayLimit,
    createdAt: agent.createdAt,
    updatedAt: agent.updatedAt,
  };
};

const buildCompatibilityMetadata = (overrides: Partial<AgentPresenceMetadata['accountCompatibility']>) => ({
  metadata: {
    accountCompatibility: overrides,
  },
});

// 提取响应数据的辅助函数
const extractData = <T>(response: any): T | null => {
  if (!response) return null;
  // 后端返回 { success: true, data: ... } 结构
  if (response.data !== undefined) {
    return response.data as T;
  }
  // 直接返回数据
  return response as T;
};

export const agentAccountApi = {
  // 获取我的所有 Agent 账户
  list: async (): Promise<AgentAccount[]> => {
    const response = await apiClient.get<{ success: boolean; data: AgentPresenceAgent[] }>('/agent-presence/agents');
    return (extractData<AgentPresenceAgent[]>(response) || []).map(mapAgentToAccount);
  },

  // 创建 Agent 账户
  create: async (data: CreateAgentAccountRequest): Promise<AgentAccount | null> => {
    const response = await apiClient.post<{ success: boolean; data: AgentPresenceAgent }>('/agent-presence/agents', {
      name: data.name,
      description: data.description,
      metadata: {
        accountCompatibility: {
          agentType: data.agentType ?? 'personal',
          linkedAccountId: data.linkedAccountId,
          spendingLimits: normalizeSpendingLimits(data.spendingLimits),
        },
      },
    });
    const agent = extractData<AgentPresenceAgent>(response);
    return agent ? mapAgentToAccount(agent) : null;
  },

  // 获取 Agent 详情
  getById: async (id: string): Promise<AgentAccount | null> => {
    const response = await apiClient.get<{ success: boolean; data: AgentPresenceAgent }>(`/agent-presence/agents/${id}`);
    const agent = extractData<AgentPresenceAgent>(response);
    return agent ? mapAgentToAccount(agent) : null;
  },

  // 通过唯一ID获取
  getByUniqueId: async (uniqueId: string): Promise<AgentAccount | null> => {
    const agents = await agentAccountApi.list();
    return agents.find((agent) => agent.agentUniqueId === uniqueId) ?? null;
  },

  // 更新 Agent
  update: async (id: string, data: UpdateAgentAccountRequest): Promise<AgentAccount | null> => {
    const response = await apiClient.put<{ success: boolean; data: AgentPresenceAgent }>(`/agent-presence/agents/${id}`, {
      name: data.name,
      description: data.description,
      ...buildCompatibilityMetadata({
        spendingLimits: data.spendingLimits ? normalizeSpendingLimits(data.spendingLimits) : undefined,
        autoPayEnabled: data.autoPayEnabled,
        autoPayLimit: data.autoPayLimit,
      }),
    });
    const agent = extractData<AgentPresenceAgent>(response);
    return agent ? mapAgentToAccount(agent) : null;
  },

  // 激活 Agent
  activate: async (id: string): Promise<AgentAccount | null> => {
    const response = await apiClient.put<{ success: boolean; data: AgentPresenceAgent }>(`/agent-presence/agents/${id}`, {
      status: mapStatusToPresence('active'),
    });
    const agent = extractData<AgentPresenceAgent>(response);
    return agent ? mapAgentToAccount(agent) : null;
  },

  // 暂停 Agent
  suspend: async (id: string, reason?: string): Promise<AgentAccount | null> => {
    const response = await apiClient.put<{ success: boolean; data: AgentPresenceAgent }>(`/agent-presence/agents/${id}`, {
      status: mapStatusToPresence('suspended'),
      ...buildCompatibilityMetadata({ statusReason: reason }),
    });
    const agent = extractData<AgentPresenceAgent>(response);
    return agent ? mapAgentToAccount(agent) : null;
  },

  // 恢复 Agent
  resume: async (id: string): Promise<AgentAccount | null> => {
    return agentAccountApi.activate(id);
  },

  // 撤销 Agent
  revoke: async (id: string, reason?: string): Promise<AgentAccount | null> => {
    const response = await apiClient.put<{ success: boolean; data: AgentPresenceAgent }>(`/agent-presence/agents/${id}`, {
      status: mapStatusToPresence('revoked'),
      ...buildCompatibilityMetadata({ statusReason: reason }),
    });
    const agent = extractData<AgentPresenceAgent>(response);
    return agent ? mapAgentToAccount(agent) : null;
  },

  // 更新信用评分
  updateCreditScore: async (id: string, score: number, reason?: string): Promise<AgentAccount | null> => {
    const response = await apiClient.put<{ success: boolean; data: AgentPresenceAgent }>(`/agent-presence/agents/${id}`, {
      ...buildCompatibilityMetadata({
        creditScore: score,
        creditHistory: [{ date: new Date().toISOString(), score, change: 0, reason }],
      }),
    });
    const agent = extractData<AgentPresenceAgent>(response);
    return agent ? mapAgentToAccount(agent) : null;
  },

  // 获取信用评分历史
  getCreditHistory: async (id: string, params?: { limit?: number }): Promise<CreditScoreHistory[]> => {
    const agent = await agentAccountApi.getById(id);
    const history = (agent ? ((await apiClient.get<{ success: boolean; data: AgentPresenceAgent }>(`/agent-presence/agents/${id}`)) as any) : null);
    const rawAgent = extractData<AgentPresenceAgent>(history);
    const items = rawAgent?.metadata?.accountCompatibility?.creditHistory || [];
    return params?.limit ? items.slice(0, params.limit) : items;
  },

  // 检查支出限额
  checkSpendingLimit: async (id: string, amount: number): Promise<SpendingCheckResult | null> => {
    const agent = await agentAccountApi.getById(id);
    if (!agent) {
      return null;
    }
    const allowed = agent.status === 'active' && amount <= agent.spendingLimits.daily - agent.spentToday;
    return {
      allowed,
      reason: allowed ? undefined : 'Daily spending limit exceeded or agent is inactive',
      currentSpent: agent.spentToday,
      limit: agent.spendingLimits.daily,
      remainingToday: Math.max(agent.spendingLimits.daily - agent.spentToday, 0),
      remainingThisMonth: Math.max(agent.spendingLimits.monthly - agent.spentThisMonth, 0),
    };
  },

  // 更新支出限额
  updateSpendingLimits: async (id: string, limits: Partial<SpendingLimits>): Promise<AgentAccount | null> => {
    const response = await apiClient.put<{ success: boolean; data: AgentPresenceAgent }>(`/agent-presence/agents/${id}`, {
      ...buildCompatibilityMetadata({
        spendingLimits: normalizeSpendingLimits(limits),
      }),
    });
    const agent = extractData<AgentPresenceAgent>(response);
    return agent ? mapAgentToAccount(agent) : null;
  },

  // 关联钱包
  linkWallet: async (id: string, walletAddress: string): Promise<AgentAccount | null> => {
    const response = await apiClient.put<{ success: boolean; data: AgentPresenceAgent }>(`/agent-presence/agents/${id}`, {
      ...buildCompatibilityMetadata({
        linkedWalletAddress: walletAddress,
        isOnChain: true,
      }),
    });
    const agent = extractData<AgentPresenceAgent>(response);
    return agent ? mapAgentToAccount(agent) : null;
  },

  // 解除钱包关联
  unlinkWallet: async (id: string): Promise<AgentAccount | null> => {
    const response = await apiClient.put<{ success: boolean; data: AgentPresenceAgent }>(`/agent-presence/agents/${id}`, {
      ...buildCompatibilityMetadata({
        linkedWalletAddress: undefined,
        isOnChain: false,
      }),
    });
    const agent = extractData<AgentPresenceAgent>(response);
    return agent ? mapAgentToAccount(agent) : null;
  },

  // 关联资金账户
  linkAccount: async (id: string, accountId: string): Promise<AgentAccount | null> => {
    const response = await apiClient.put<{ success: boolean; data: AgentPresenceAgent }>(`/agent-presence/agents/${id}`, {
      ...buildCompatibilityMetadata({
        linkedAccountId: accountId,
      }),
    });
    const agent = extractData<AgentPresenceAgent>(response);
    return agent ? mapAgentToAccount(agent) : null;
  },

  // 获取 Agent 统计
  getStats: async (id: string): Promise<{
    totalTransactions: number;
    totalSpent: number;
    avgTransactionAmount: number;
    successRate: number;
    recentActivity: Array<{ date: string; amount: number; type: string }>;
  } | null> => {
    const agent = await agentAccountApi.getById(id);
    if (!agent) {
      return null;
    }
    return {
      totalTransactions: 0,
      totalSpent: agent.totalSpent,
      avgTransactionAmount: 0,
      successRate: agent.status === 'active' ? 100 : 0,
      recentActivity: [],
    };
  },

  // 配置 AutoPay
  configureAutoPay: async (id: string, config: { enabled: boolean; limit?: number }): Promise<AgentAccount | null> => {
    const response = await apiClient.put<{ success: boolean; data: AgentPresenceAgent }>(`/agent-presence/agents/${id}`, {
      ...buildCompatibilityMetadata({
        autoPayEnabled: config.enabled,
        autoPayLimit: config.limit,
      }),
    });
    const agent = extractData<AgentPresenceAgent>(response);
    return agent ? mapAgentToAccount(agent) : null;
  },

  // ========== Phase 4: 链上身份 ==========

  // 链上注册 Agent（Gas 由平台代付）
  onchainRegister: async (id: string, chain: string = 'bsc-testnet'): Promise<{
    erc8004SessionId?: string;
    easAttestationUid?: string;
    txHash?: string;
    chain: string;
    gasSponsored: boolean;
  } | null> => {
    const response = await apiClient.post<{ success: boolean; data: any }>(`/agent-accounts/${id}/onchain-register`, { chain });
    return extractData(response);
  },

  // 查询链上注册状态
  getOnchainStatus: async (id: string): Promise<{
    registered: boolean;
    easAttestationUid?: string;
    erc8004SessionId?: string;
    chain?: string;
    gasSponsored: boolean;
    registrationFee: string;
  } | null> => {
    const response = await apiClient.get<{ success: boolean; data: any }>(`/agent-accounts/${id}/onchain-status`);
    return extractData(response);
  },

  // 查询余额（平台+链上统一视图）
  getBalance: async (id: string): Promise<{
    platformBalance: { amount: string; currency: string };
    mpcWallet: { address: string; chain: string } | null;
    externalWallet: { address: string } | null;
    gasAvailable: boolean;
  } | null> => {
    const response = await apiClient.get<{ success: boolean; data: any }>(`/agent-accounts/${id}/balance`);
    return extractData(response);
  },

  // 查询链上能力档案
  getCapabilities: async (id: string): Promise<{
    identity: { registered: boolean; sessionActive: boolean; chain?: string };
    registration: { easUid?: string; verified: boolean };
    skills: string[];
    creditLevel: string;
    gasSponsored: boolean;
  } | null> => {
    const response = await apiClient.get<{ success: boolean; data: any }>(`/agent-accounts/${id}/capabilities`);
    return extractData(response);
  },
};
