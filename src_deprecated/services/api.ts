// API 服务层
import { 
  AssetSummary, 
  Airdrop, 
  AutoEarnSummary, 
  AutoEarnStrategy,
  MerchantSummary,
  SplitPlan,
  Settlement,
  DeveloperSummary,
  BudgetPool,
  Milestone,
  DeveloperOrder,
} from '../types/identity';
import * as SecureStore from 'expo-secure-store';

import { API_BASE } from '../config/env';

export interface ApiConfig {
  baseUrl?: string;
  token?: string;
}

let config: ApiConfig = {
  baseUrl: API_BASE,
};

export const setApiConfig = (next: ApiConfig) => {
  config = { ...config, ...next };
};

export const getApiConfig = () => config;

// 从 SecureStore 获取 token
// KEY: 'clawlink_token' — must match authStore.setAuth SecureStore key
export const loadTokenFromStorage = async () => {
  try {
    const token = await SecureStore.getItemAsync('clawlink_token');
    if (token) {
      config.token = token;
    }
    return token;
  } catch (e) {
    console.warn('Failed to load token:', e);
    return null;
  }
};

// 保存 token 到 SecureStore
export const saveTokenToStorage = async (token: string) => {
  try {
    await SecureStore.setItemAsync('clawlink_token', token);
    config.token = token;
  } catch (e) {
    console.warn('Failed to save token:', e);
  }
};

// 清除 token
export const clearToken = async () => {
  try {
    await SecureStore.deleteItemAsync('clawlink_token');
    config.token = undefined;
  } catch (e) {
    console.warn('Failed to clear token:', e);
  }
};

export async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const url = `${config.baseUrl}${path}`;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };

  if (config.token) {
    headers.Authorization = `Bearer ${config.token}`;
  }

  const res = await fetch(url, { ...options, headers });
  if (!res.ok) {
    const text = await res.text();
    let errorMessage = `Request failed: ${res.status}`;
    try {
      const json = JSON.parse(text);
      errorMessage = json.message || json.error || errorMessage;
    } catch {
      // If it's HTML (like 502 Bad Gateway), provide a friendly message
      if (text.includes('<html') || res.status >= 500) {
        errorMessage = `Server error (${res.status}). Please try again later.`;
      } else {
        errorMessage = text || errorMessage;
      }
    }
    throw new Error(errorMessage);
  }

  return res.json();
}

// ========== 认证 API ==========

export const authApi = {
  // 登录 (钱包签名)
  async loginWithWallet(params: {
    address: string;
    signature: string;
    message: string;
    chainType: 'evm' | 'solana';
  }): Promise<{ token: string; user: any }> {
    const result = await apiFetch<{ token: string; user: any }>('/auth/wallet/login', {
      method: 'POST',
      body: JSON.stringify(params),
    });
    await saveTokenToStorage(result.token);
    return result;
  },

  // 获取登录 nonce
  async getLoginNonce(address: string): Promise<{ nonce: string; message: string }> {
    return apiFetch(`/auth/wallet/nonce?address=${address}`);
  },

  // 登出
  async logout(): Promise<void> {
    await clearToken();
  },

  // 获取当前用户
  async getCurrentUser(): Promise<any> {
    return apiFetch('/auth/me');
  },
};

// ========== 个人身份 API ==========

export const personalApi = {
  // 获取资产摘要
  async getAssetSummary(): Promise<any> {
    // 对接后端 /user/assets/summary 或自定义聚合
    try {
      return await apiFetch('/user/assets/summary');
    } catch (e) {
      // 后端可能没有此端点，返回默认值
      return {
        totalBalance: '0',
        change24h: '0%',
        assets: [],
      };
    }
  },

  // 获取空投列表 - 对接 /auto-earn/airdrops
  async getAirdrops(status?: string): Promise<Airdrop[]> {
    const query = status ? `?status=${status}` : '';
    try {
      const result = await apiFetch<any>(`/auto-earn/airdrops${query}`);
      // 转换后端格式为前端格式
      return (result.airdrops || result || []).map((item: any) => ({
        id: item.id,
        projectName: item.projectName || item.name,
        tokenSymbol: item.tokenSymbol || item.symbol,
        estimatedValue: item.estimatedValue || item.amount || '0',
        status: item.status || 'available',
        expiresAt: item.expiresAt || item.deadline,
      }));
    } catch (e) {
      return [];
    }
  },

  // 发现新空投 - 对接 /auto-earn/airdrops/discover
  async discoverAirdrops(): Promise<Airdrop[]> {
    try {
      const result = await apiFetch<any>('/auto-earn/airdrops/discover', { method: 'POST' });
      return result.airdrops || result || [];
    } catch (e) {
      return [];
    }
  },

  // 领取空投 - 对接 /auto-earn/airdrops/:id/claim
  async claimAirdrop(airdropId: string): Promise<{ success: boolean; txHash?: string }> {
    return apiFetch(`/auto-earn/airdrops/${airdropId}/claim`, { method: 'POST' });
  },

  // 获取 AutoEarn 统计 - 对接 /auto-earn/stats
  async getAutoEarnStats(): Promise<any> {
    try {
      const result = await apiFetch<any>('/auto-earn/stats');
      return {
        totalEarnings: result.totalEarnings || '0',
        activeStrategies: result.activeStrategies || 0,
        pendingRewards: result.pendingRewards || '0',
      };
    } catch (e) {
      return { totalEarnings: '0', activeStrategies: 0, pendingRewards: '0' };
    }
  },

  // 获取 AutoEarn 任务列表 - 对接 /auto-earn/tasks
  async getAutoEarnTasks(): Promise<any[]> {
    try {
      return await apiFetch('/auto-earn/tasks');
    } catch (e) {
      return [];
    }
  },

  // 切换策略开关 - 对接 /auto-earn/strategies/:id/toggle
  async toggleStrategy(strategyId: string, enabled: boolean): Promise<any> {
    return apiFetch(`/auto-earn/strategies/${strategyId}/toggle`, {
      method: 'POST',
      body: JSON.stringify({ enabled }),
    });
  },
};

// ========== 商户身份 API ==========

export const merchantApi = {
  // 获取商户统计 - 对接 /merchant/stats
  async getStats(days: number = 7): Promise<any> {
    try {
      const result = await apiFetch<any>(`/merchant/stats?days=${days}`);
      return {
        totalRevenue: String(result.summary?.totalVolume || 0),
        todayRevenue: String(result.chartData?.[result.chartData.length - 1]?.volume || 0),
        pendingSettlement: '0',
        activePlans: 0,
      };
    } catch (e) {
      return { totalRevenue: '0', todayRevenue: '0', pendingSettlement: '0', activePlans: 0 };
    }
  },

  // 获取分佣计划列表 - 对接 /commerce/split-plans
  async getSplitPlans(): Promise<SplitPlan[]> {
    try {
      const result = await apiFetch<any>('/commerce/split-plans');
      return (result.plans || result || []).map((plan: any) => ({
        id: plan.id,
        name: plan.name,
        description: plan.description || '',
        feeRate: plan.feeRate || plan.feeBps / 100,
        isActive: plan.isActive ?? plan.active ?? true,
      }));
    } catch (e) {
      return [];
    }
  },

  // 获取结算列表 - 对接 /commerce/settlements 或 /merchant/settlements
  async getSettlements(status?: string): Promise<Settlement[]> {
    const query = status ? `?status=${status}` : '';
    try {
      const result = await apiFetch<any>(`/commerce/settlements${query}`);
      return (result.settlements || result || []).map((s: any) => ({
        id: s.id,
        amount: s.amount,
        currency: s.currency || 'USDC',
        status: s.status,
        createdAt: s.createdAt,
        settledAt: s.settledAt,
      }));
    } catch (e) {
      return [];
    }
  },

  // 创建收款链接 - 对接 /pay-intents/create
  async createPaymentLink(params: { 
    amount: number; 
    planId?: string; 
    currency?: string;
    description?: string;
  }): Promise<{ url: string; intentId: string }> {
    const result = await apiFetch<any>('/pay-intents/create', {
      method: 'POST',
      body: JSON.stringify({
        amount: params.amount,
        currency: params.currency || 'USDC',
        description: params.description || 'Payment',
        splitPlanId: params.planId,
      }),
    });
    return {
      url: result.paymentUrl || `https://pay.agentrix.io/${result.id}`,
      intentId: result.id,
    };
  },

  // 分佣预览 - 对接 /commerce/split-plans/:id/preview
  async previewCommission(params: { amount: number; planId: string }): Promise<any> {
    return apiFetch(`/commerce/split-plans/${params.planId}/preview`, {
      method: 'POST',
      body: JSON.stringify({ amount: params.amount }),
    });
  },

  // 获取商户 Profile - 对接 /merchant/profile
  async getProfile(): Promise<any> {
    return apiFetch('/merchant/profile');
  },
};

// ========== 开发者身份 API ==========

export const developerApi = {
  // 获取开发者账户 - 对接 /developer-accounts/my
  async getMyAccount(): Promise<any> {
    try {
      return await apiFetch('/developer-accounts/my');
    } catch (e) {
      return null;
    }
  },

  // 获取开发者仪表盘 - 对接 /developer-accounts/dashboard
  async getDashboard(): Promise<any> {
    try {
      const result = await apiFetch<any>('/developer-accounts/dashboard');
      return {
        totalEarnings: String(result.totalEarnings || 0),
        activeProjects: result.activeProjects || 0,
        pendingPayment: String(result.pendingPayment || 0),
        completedTasks: result.completedTasks || 0,
      };
    } catch (e) {
      return { totalEarnings: '0', activeProjects: 0, pendingPayment: '0', completedTasks: 0 };
    }
  },

  // 创建开发者账户 - 对接 /developer-accounts
  async createAccount(data: {
    name: string;
    description?: string;
    website?: string;
    contactEmail?: string;
  }): Promise<any> {
    return apiFetch('/developer-accounts', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  // 获取预算池列表 - 对接 /commerce/budget-pools
  async getBudgetPools(): Promise<BudgetPool[]> {
    try {
      const result = await apiFetch<any>('/commerce/budget-pools');
      return (result.pools || result || []).map((pool: any) => ({
        id: pool.id,
        name: pool.name,
        totalBudget: pool.totalBudget || pool.amount,
        usedBudget: pool.usedBudget || pool.spent || 0,
        status: pool.status || 'active',
      }));
    } catch (e) {
      return [];
    }
  },

  // 获取里程碑列表 - 对接 /commerce/milestones
  async getMilestones(poolId?: string): Promise<Milestone[]> {
    const query = poolId ? `?poolId=${poolId}` : '';
    try {
      const result = await apiFetch<any>(`/commerce/milestones${query}`);
      return (result.milestones || result || []).map((m: any) => ({
        id: m.id,
        title: m.title || m.name,
        amount: m.amount,
        status: m.status,
        dueDate: m.dueDate,
      }));
    } catch (e) {
      return [];
    }
  },

  // 获取可接订单 - 对接 /merchant-tasks 或自定义
  async getAvailableOrders(): Promise<DeveloperOrder[]> {
    try {
      const result = await apiFetch<any>('/merchant-tasks?status=open');
      return (result.tasks || result || []).map((task: any) => ({
        id: task.id,
        title: task.title,
        description: task.description || '',
        budget: task.budget || task.reward,
        deadline: task.deadline,
        skills: task.skills || [],
      }));
    } catch (e) {
      return [];
    }
  },

  // 接单 - 对接 /merchant-tasks/:id/accept
  async acceptOrder(orderId: string): Promise<{ success: boolean }> {
    return apiFetch(`/merchant-tasks/${orderId}/accept`, { method: 'POST' });
  },
};

// ========== 身份管理 API ==========

export const identityApi = {
  // 申请激活商户身份 - 对接 /merchant/profile
  async applyForMerchant(application: {
    businessName: string;
    businessType: string;
    contactEmail: string;
  }): Promise<{ success: boolean }> {
    await apiFetch('/merchant/profile', {
      method: 'POST',
      body: JSON.stringify(application),
    });
    return { success: true };
  },

  // 申请激活开发者身份 - 对接 /developer-accounts
  async applyForDeveloper(application: {
    name: string;
    description?: string;
    website?: string;
    contactEmail?: string;
  }): Promise<{ success: boolean }> {
    await apiFetch('/developer-accounts', {
      method: 'POST',
      body: JSON.stringify(application),
    });
    return { success: true };
  },

  // 检查身份状态
  async checkIdentityStatus(): Promise<{
    personal: { activated: boolean };
    merchant: { activated: boolean; pending: boolean };
    developer: { activated: boolean; pending: boolean };
  }> {
    // 聚合多个 API 获取身份状态
    let merchantStatus = { activated: false, pending: false };
    let developerStatus = { activated: false, pending: false };

    try {
      const merchantProfile = await apiFetch<any>('/merchant/profile');
      merchantStatus.activated = !!merchantProfile?.id;
    } catch (e) {
      // 未激活
    }

    try {
      const devAccount = await apiFetch<any>('/developer-accounts/my');
      developerStatus.activated = !!devAccount?.id;
      developerStatus.pending = devAccount?.status === 'pending';
    } catch (e) {
      // 未激活
    }

    return {
      personal: { activated: true }, // 个人身份默认激活
      merchant: merchantStatus,
      developer: developerStatus,
    };
  },
};

// ========== 用户 Agent API ==========

export const agentApi = {
  // 获取用户的 Agent 列表
  async getMyAgents(): Promise<any[]> {
    try {
      return await apiFetch('/user-agents');
    } catch (e) {
      return [];
    }
  },

  // 获取 Agent 详情
  async getAgent(agentId: string): Promise<any> {
    return apiFetch(`/user-agents/${agentId}`);
  },

  // 与 Agent 对话
  async chat(agentId: string, message: string): Promise<{ reply: string }> {
    return apiFetch(`/user-agents/${agentId}/chat`, {
      method: 'POST',
      body: JSON.stringify({ message }),
    });
  },
};