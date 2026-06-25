'use client';

import React, { createContext, useContext, useState, useCallback, useEffect, ReactNode } from 'react';
import { 
  agentAccountApi, 
  AgentAccount, 
  CreateAgentAccountRequest, 
  UpdateAgentAccountRequest,
  SpendingLimits,
  SpendingCheckResult 
} from '../lib/api/agent-account.api';
import { useUser } from './UserContext';

interface AgentAccountContextType {
  agentAccounts: AgentAccount[];
  activeAgents: AgentAccount[];
  loading: boolean;
  error: string | null;

  // 操作
  refreshAgentAccounts: () => Promise<void>;
  createAgentAccount: (data: CreateAgentAccountRequest) => Promise<AgentAccount | null>;
  updateAgentAccount: (id: string, data: UpdateAgentAccountRequest) => Promise<AgentAccount | null>;
  activateAgent: (id: string) => Promise<boolean>;
  suspendAgent: (id: string, reason?: string) => Promise<boolean>;
  resumeAgent: (id: string) => Promise<boolean>;
  checkSpendingLimit: (id: string, amount: number) => Promise<SpendingCheckResult | null>;
  updateSpendingLimits: (id: string, limits: Partial<SpendingLimits>) => Promise<boolean>;
  configureAutoPay: (id: string, enabled: boolean, limit?: number) => Promise<boolean>;
}

const AgentAccountContext = createContext<AgentAccountContextType | undefined>(undefined);

export const AgentAccountProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { isAuthenticated } = useUser();
  const [agentAccounts, setAgentAccounts] = useState<AgentAccount[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refreshAgentAccounts = useCallback(async () => {
    if (!isAuthenticated) return;
    try {
      setLoading(true);
      setError(null);
      const data = await agentAccountApi.list();
      setAgentAccounts(data || []);
    } catch (err: any) {
      console.error('Failed to refresh agent accounts:', err);
      setError(err.message || '获取Agent账户失败');
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated]);

  useEffect(() => {
    if (isAuthenticated) {
      refreshAgentAccounts();
    } else {
      setAgentAccounts([]);
    }
  }, [isAuthenticated, refreshAgentAccounts]);

  const activeAgents = agentAccounts.filter(a => a.status === 'active');

  const createAgentAccount = async (data: CreateAgentAccountRequest): Promise<AgentAccount | null> => {
    try {
      const agent = await agentAccountApi.create(data);
      await refreshAgentAccounts();
      return agent;
    } catch (err: any) {
      setError(err.message || '创建Agent失败');
      return null;
    }
  };

  const updateAgentAccount = async (id: string, data: UpdateAgentAccountRequest): Promise<AgentAccount | null> => {
    try {
      const agent = await agentAccountApi.update(id, data);
      await refreshAgentAccounts();
      return agent;
    } catch (err: any) {
      setError(err.message || '更新Agent失败');
      return null;
    }
  };

  const activateAgent = async (id: string): Promise<boolean> => {
    try {
      await agentAccountApi.activate(id);
      await refreshAgentAccounts();
      return true;
    } catch (err: any) {
      setError(err.message || '激活Agent失败');
      return false;
    }
  };

  const suspendAgent = async (id: string, reason?: string): Promise<boolean> => {
    try {
      await agentAccountApi.suspend(id, reason);
      await refreshAgentAccounts();
      return true;
    } catch (err: any) {
      setError(err.message || '暂停Agent失败');
      return false;
    }
  };

  const resumeAgent = async (id: string): Promise<boolean> => {
    try {
      await agentAccountApi.resume(id);
      await refreshAgentAccounts();
      return true;
    } catch (err: any) {
      setError(err.message || '恢复Agent失败');
      return false;
    }
  };

  const checkSpendingLimit = async (id: string, amount: number): Promise<SpendingCheckResult | null> => {
    try {
      return await agentAccountApi.checkSpendingLimit(id, amount);
    } catch (err: any) {
      console.error('Failed to check spending limit:', err);
      return null;
    }
  };

  const updateSpendingLimits = async (id: string, limits: Partial<SpendingLimits>): Promise<boolean> => {
    try {
      await agentAccountApi.updateSpendingLimits(id, limits);
      await refreshAgentAccounts();
      return true;
    } catch (err: any) {
      setError(err.message || '更新限额失败');
      return false;
    }
  };

  const configureAutoPay = async (id: string, enabled: boolean, limit?: number): Promise<boolean> => {
    try {
      await agentAccountApi.configureAutoPay(id, { enabled, limit });
      await refreshAgentAccounts();
      return true;
    } catch (err: any) {
      setError(err.message || '配置AutoPay失败');
      return false;
    }
  };

  return (
    <AgentAccountContext.Provider value={{
      agentAccounts,
      activeAgents,
      loading,
      error,
      refreshAgentAccounts,
      createAgentAccount,
      updateAgentAccount,
      activateAgent,
      suspendAgent,
      resumeAgent,
      checkSpendingLimit,
      updateSpendingLimits,
      configureAutoPay,
    }}>
      {children}
    </AgentAccountContext.Provider>
  );
};

export const useAgentAccounts = () => {
  const context = useContext(AgentAccountContext);
  if (!context) {
    throw new Error('useAgentAccounts must be used within AgentAccountProvider');
  }
  return context;
};

export default AgentAccountContext;
