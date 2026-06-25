'use client';

import React, { createContext, useContext, useState, useCallback, useEffect, ReactNode } from 'react';
import { accountApi, Account, CreateAccountRequest, PendingEarnings, Transaction } from '../lib/api/account.api';
import { useUser } from './UserContext';

interface AccountContextType {
  accounts: Account[];
  defaultAccount: Account | null;
  pendingEarnings: PendingEarnings | null;
  summary: {
    totalBalance: number;
    totalFrozen: number;
    totalPending: number;
    accountCount: number;
    byChain: Record<string, { balance: number; chain: string }>;
  } | null;
  loading: boolean;
  error: string | null;

  // 操作
  refreshAccounts: () => Promise<void>;
  createAccount: (data: CreateAccountRequest) => Promise<Account | null>;
  setDefaultAccount: (id: string) => Promise<void>;
  getAccountBalance: (id: string) => Promise<{ balances: Record<string, string>; frozenBalances: Record<string, string> } | null>;
  getTransactions: (id: string, params?: { limit?: number; offset?: number }) => Promise<{ transactions: Transaction[]; total: number } | null>;
  refreshPendingEarnings: () => Promise<void>;
}

const AccountContext = createContext<AccountContextType | undefined>(undefined);

export const AccountProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { user, isAuthenticated } = useUser();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [pendingEarnings, setPendingEarnings] = useState<PendingEarnings | null>(null);
  const [summary, setSummary] = useState<AccountContextType['summary']>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refreshAccounts = useCallback(async () => {
    if (!isAuthenticated) return;
    try {
      setLoading(true);
      setError(null);
      const [accountsData, summaryData] = await Promise.all([
        accountApi.list(),
        accountApi.getSummary(),
      ]);
      setAccounts(accountsData || []);
      setSummary(summaryData);
    } catch (err: any) {
      console.error('Failed to refresh accounts:', err);
      setError(err.message || '获取账户信息失败');
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated]);

  const refreshPendingEarnings = useCallback(async () => {
    if (!isAuthenticated) return;
    try {
      const data = await accountApi.getPendingEarnings();
      setPendingEarnings(data);
    } catch (err: any) {
      console.error('Failed to get pending earnings:', err);
    }
  }, [isAuthenticated]);

  useEffect(() => {
    if (isAuthenticated) {
      refreshAccounts();
      refreshPendingEarnings();
    } else {
      setAccounts([]);
      setPendingEarnings(null);
      setSummary(null);
    }
  }, [isAuthenticated, refreshAccounts, refreshPendingEarnings]);

  const defaultAccount = accounts.find(a => a.isDefault) || accounts[0] || null;

  const createAccount = async (data: CreateAccountRequest): Promise<Account | null> => {
    try {
      const account = await accountApi.create(data);
      await refreshAccounts();
      return account;
    } catch (err: any) {
      setError(err.message || '创建账户失败');
      return null;
    }
  };

  const setDefaultAccount = async (id: string) => {
    try {
      await accountApi.setDefault(id);
      await refreshAccounts();
    } catch (err: any) {
      setError(err.message || '设置默认账户失败');
    }
  };

  const getAccountBalance = async (id: string) => {
    try {
      return await accountApi.getBalance(id);
    } catch (err: any) {
      console.error('Failed to get balance:', err);
      return null;
    }
  };

  const getTransactions = async (id: string, params?: { limit?: number; offset?: number }) => {
    try {
      return await accountApi.getTransactions(id, params);
    } catch (err: any) {
      console.error('Failed to get transactions:', err);
      return null;
    }
  };

  return (
    <AccountContext.Provider value={{
      accounts,
      defaultAccount,
      pendingEarnings,
      summary,
      loading,
      error,
      refreshAccounts,
      createAccount,
      setDefaultAccount,
      getAccountBalance,
      getTransactions,
      refreshPendingEarnings,
    }}>
      {children}
    </AccountContext.Provider>
  );
};

export const useAccounts = () => {
  const context = useContext(AccountContext);
  if (!context) {
    throw new Error('useAccounts must be used within AccountProvider');
  }
  return context;
};

export default AccountContext;
