/**
 * 统一资金账户 API
 * Unified Fund Account API
 */

import { apiClient } from './client';

export type AccountWalletType = 'custodial' | 'non_custodial' | 'virtual';
export type AccountChainType = 'evm' | 'solana' | 'bitcoin' | 'multi';
export type AccountOwnerType = 'user' | 'agent' | 'merchant' | 'platform';
export type AccountStatus = 'active' | 'frozen' | 'suspended' | 'closed';

export interface Account {
  id: string;
  ownerId: string;
  ownerType: AccountOwnerType;
  walletType: AccountWalletType;
  chainType: AccountChainType;
  walletAddress?: string;
  balances: Record<string, string>;
  frozenBalances: Record<string, string>;
  isDefault: boolean;
  status: AccountStatus;
  limits: {
    dailyLimit?: number;
    monthlyLimit?: number;
    perTransactionLimit?: number;
  };
  metadata?: Record<string, any>;
  createdAt: string;
  updatedAt: string;
}

export interface CreateAccountRequest {
  walletType: AccountWalletType;
  chainType?: AccountChainType;
  walletAddress?: string;
  isDefault?: boolean;
  metadata?: Record<string, any>;
}

export interface DepositRequest {
  amount: number;
  currency: string;
  txHash?: string;
  source?: string;
}

export interface WithdrawRequest {
  amount: number;
  currency: string;
  toAddress: string;
  memo?: string;
}

export interface TransferRequest {
  fromAccountId: string;
  toAccountId: string;
  amount: number;
  currency: string;
  memo?: string;
}

export interface FreezeBalanceRequest {
  amount: number;
  currency: string;
  reason: string;
  referenceId?: string;
}

export interface Transaction {
  id: string;
  accountId: string;
  type: 'deposit' | 'withdraw' | 'transfer_in' | 'transfer_out' | 'freeze' | 'unfreeze' | 'payment' | 'earning';
  amount: string;
  currency: string;
  status: 'pending' | 'completed' | 'failed' | 'cancelled';
  txHash?: string;
  memo?: string;
  metadata?: Record<string, any>;
  createdAt: string;
}

export interface PendingEarnings {
  totalAmount: number;
  currency: string;
  nextSettlementDate: string;
  settlementCycle: 'daily' | 'weekly' | 'monthly';
  breakdown: Array<{
    source: string;
    amount: number;
    count: number;
  }>;
}

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

export const accountApi = {
  // 获取我的所有账户
  list: async (): Promise<Account[]> => {
    const response = await apiClient.get<{ success: boolean; data: Account[] }>('/accounts/my');
    return extractData<Account[]>(response) || [];
  },

  // 创建新账户
  create: async (data: CreateAccountRequest): Promise<Account | null> => {
    const response = await apiClient.post<{ success: boolean; data: Account }>('/accounts', data);
    return extractData<Account>(response);
  },

  // 获取账户详情
  getById: async (id: string): Promise<Account | null> => {
    const response = await apiClient.get<{ success: boolean; data: Account }>(`/accounts/${id}`);
    return extractData<Account>(response);
  },

  // 获取账户余额
  getBalance: async (id: string): Promise<{ balances: Record<string, string>; frozenBalances: Record<string, string> } | null> => {
    const response = await apiClient.get<{ success: boolean; data: { balances: Record<string, string>; frozenBalances: Record<string, string> } }>(`/accounts/${id}/balance`);
    return extractData(response);
  },

  // 获取账户交易记录
  getTransactions: async (id: string, params?: { limit?: number; offset?: number; type?: string }): Promise<{ transactions: Transaction[]; total: number } | null> => {
    const response = await apiClient.get<{ success: boolean; data: { transactions: Transaction[]; total: number } }>(`/accounts/${id}/transactions`, { params });
    return extractData(response);
  },

  // 充值
  deposit: async (id: string, data: DepositRequest): Promise<Transaction | null> => {
    const response = await apiClient.post<{ success: boolean; data: Transaction }>(`/accounts/${id}/deposit`, data);
    return extractData<Transaction>(response);
  },

  // 提现
  withdraw: async (id: string, data: WithdrawRequest): Promise<Transaction | null> => {
    const response = await apiClient.post<{ success: boolean; data: Transaction }>(`/accounts/${id}/withdraw`, data);
    return extractData<Transaction>(response);
  },

  // 转账
  transfer: async (data: TransferRequest): Promise<Transaction | null> => {
    const response = await apiClient.post<{ success: boolean; data: Transaction }>('/accounts/transfer', data);
    return extractData<Transaction>(response);
  },

  // 冻结余额
  freezeBalance: async (id: string, data: FreezeBalanceRequest): Promise<{ success: boolean } | null> => {
    const response = await apiClient.post<{ success: boolean; data: { success: boolean } }>(`/accounts/${id}/freeze-balance`, data);
    return extractData(response);
  },

  // 解冻余额
  unfreezeBalance: async (id: string, data: { amount: number; currency: string; referenceId?: string }): Promise<{ success: boolean } | null> => {
    const response = await apiClient.post<{ success: boolean; data: { success: boolean } }>(`/accounts/${id}/unfreeze-balance`, data);
    return extractData(response);
  },

  // 冻结账户
  freeze: async (id: string, reason: string): Promise<Account | null> => {
    const response = await apiClient.post<{ success: boolean; data: Account }>(`/accounts/${id}/freeze`, { reason });
    return extractData<Account>(response);
  },

  // 解冻账户
  unfreeze: async (id: string): Promise<Account | null> => {
    const response = await apiClient.post<{ success: boolean; data: Account }>(`/accounts/${id}/unfreeze`);
    return extractData<Account>(response);
  },

  // 设为默认账户
  setDefault: async (id: string): Promise<Account | null> => {
    const response = await apiClient.post<{ success: boolean; data: Account }>(`/accounts/${id}/set-default`);
    return extractData<Account>(response);
  },

  // 获取待结算收益 (B端用户)
  getPendingEarnings: async (): Promise<PendingEarnings | null> => {
    const response = await apiClient.get<{ success: boolean; data: PendingEarnings }>('/accounts/pending-earnings');
    return extractData<PendingEarnings>(response);
  },

  // 获取账户汇总
  getSummary: async (): Promise<{
    totalBalance: number;
    totalFrozen: number;
    totalPending: number;
    accountCount: number;
    byChain: Record<string, { balance: number; chain: string }>;
  } | null> => {
    const response = await apiClient.get<{ success: boolean; data: {
      totalBalance: number;
      totalFrozen: number;
      totalPending: number;
      accountCount: number;
      byChain: Record<string, { balance: number; chain: string }>;
    } }>('/accounts/summary');
    return extractData(response);
  },
};
