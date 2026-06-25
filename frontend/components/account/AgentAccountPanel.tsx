'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useRouter } from 'next/router';
import { 
  Bot, 
  Plus, 
  Play, 
  Pause, 
  Settings, 
  Shield,
  Wallet,
  TrendingUp,
  AlertTriangle,
  CheckCircle,
  Loader2,
  ChevronRight,
  Zap,
  Activity,
  Lock,
  ArrowUpRight,
  Trash2,
  MoreVertical,
  Terminal,
  Clock,
  Layout,
  Bell,
  BarChart3,
  CheckSquare,
  Square,
  RefreshCw,
  FileCheck,
  History,
  PieChart,
  XCircle,
  Filter,
  Search,
  Download,
  ArrowDown,
  ArrowUp
} from 'lucide-react';
import { useAgentAccounts } from '../../contexts/AgentAccountContext';
import { useLocalization } from '../../contexts/LocalizationContext';
import { useToast } from '../../contexts/ToastContext';
import { AgentAccount, RiskLevel, agentAccountApi } from '../../lib/api/agent-account.api';
import { agentAuthorizationApi, AgentAuthorization, AgentExecutionHistory } from '../../lib/api/agent-authorization.api';
import { useSessionManager } from '../../hooks/useSessionManager';
import { useWeb3 } from '../../contexts/Web3Context';
import { Key, ExternalLink } from 'lucide-react';

// 风险等级配置
const riskLevelConfig: Record<RiskLevel, { color: string; bgColor: string; label: string }> = {
  low: { color: 'text-emerald-400', bgColor: 'bg-emerald-500/10', label: 'Low Risk' },
  medium: { color: 'text-amber-400', bgColor: 'bg-amber-500/10', label: 'Medium' },
  high: { color: 'text-orange-400', bgColor: 'bg-orange-500/10', label: 'High' },
  critical: { color: 'text-red-400', bgColor: 'bg-red-500/10', label: 'CRITICAL' },
};

// 状态配置
const statusConfig: Record<string, { color: string; bgColor: string; label: string }> = {
  draft: { color: 'text-slate-400', bgColor: 'bg-slate-800', label: 'Draft' },
  active: { color: 'text-emerald-400', bgColor: 'bg-emerald-500/20', label: 'LIVE' },
  suspended: { color: 'text-amber-400', bgColor: 'bg-amber-500/20', label: 'PAUSED' },
  revoked: { color: 'text-red-400', bgColor: 'bg-red-500/20', label: 'REVOKED' },
};

interface AgentStatCardProps {
  label: string;
  value: string | number;
  icon: any;
  subValue?: string;
  color?: string;
}

const AgentStatCard: React.FC<AgentStatCardProps> = ({ label, value, icon: Icon, subValue, color = "text-blue-400" }) => (
  <div className="bg-slate-900/50 border border-white/5 rounded-2xl p-4">
    <div className="flex items-center gap-3 mb-2">
      <div className={`p-2 rounded-lg bg-white/5 ${color}`}>
        <Icon size={18} />
      </div>
      <span className="text-[10px] uppercase font-bold text-slate-500 tracking-widest">{label}</span>
    </div>
    <div className="text-2xl font-mono font-bold text-white">{value}</div>
    {subValue && <div className="text-[10px] text-slate-500 mt-1">{subValue}</div>}
  </div>
);

const SpendingProgress = ({ spent, limit }: { spent: number, limit: number }) => {
  const percent = Math.min(100, (spent / limit) * 100);
  const color = percent > 90 ? 'bg-red-500' : percent > 70 ? 'bg-amber-500' : 'bg-blue-500';
  
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-[10px] font-bold text-slate-500">
        <span>BUDGET BURN</span>
        <span>${spent.toLocaleString()} / ${limit.toLocaleString()}</span>
      </div>
      <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
        <div 
          className={`h-full transition-all duration-500 ${color}`}
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
};

interface AgentAccountCardProps {
  agent: AgentAccount;
  onActivate: () => void;
  onSuspend: () => void;
  onResume: () => void;
  onSettings: () => void;
  onAuthorizations: () => void;
}

const AgentAccountCardV2: React.FC<AgentAccountCardProps> = ({
  agent,
  onActivate,
  onSuspend,
  onResume,
  onSettings,
  onAuthorizations
}) => {
  const status = statusConfig[agent.status];
  const risk = riskLevelConfig[agent.riskLevel];
  
  return (
    <div className="bg-[#0f172a] border border-white/5 rounded-3xl p-6 hover:border-white/10 transition-all group relative overflow-hidden">
      {/* Background Pulse if active */}
      {agent.status === 'active' && (
        <div className="absolute top-0 right-0 p-2">
          <div className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
        </div>
      )}

      <div className="flex items-start justify-between mb-6">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-2xl flex items-center justify-center text-white shadow-lg">
            <Bot size={28} />
          </div>
          <div>
            <h3 className="text-lg font-bold text-white group-hover:text-blue-400 transition-colors">{agent.name}</h3>
            <div className="flex items-center gap-2 mt-1">
               <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-tighter ${status.bgColor} ${status.color}`}>
                 {status.label}
               </span>
               <span className="text-[10px] text-slate-500 font-mono">ID: {agent.agentUniqueId.slice(0, 8)}</span>
            </div>
          </div>
        </div>
        <button className="p-2 hover:bg-white/5 rounded-xl text-slate-500 hover:text-white transition-all">
          <MoreVertical size={20} />
        </button>
      </div>

      <div className="space-y-4 mb-6">
         <SpendingProgress spent={agent.spentToday} limit={agent.spendingLimits.daily} />
         
         <div className="grid grid-cols-2 gap-3 mt-4">
            <div className="p-3 bg-white/5 rounded-xl border border-white/5">
               <div className="text-[10px] text-slate-500 font-bold uppercase mb-1">Risk Score</div>
               <div className={`text-sm font-bold ${risk.color}`}>{agent.creditScore} <span className="text-[10px] opacity-60">({risk.label})</span></div>
            </div>
            <div className="p-3 bg-white/5 rounded-xl border border-white/5">
               <div className="text-[10px] text-slate-500 font-bold uppercase mb-1">AutoPay</div>
               <div className={`text-sm font-bold ${agent.autoPayEnabled ? 'text-blue-400' : 'text-slate-500'}`}>
                 {agent.autoPayEnabled ? 'Enabled' : 'Disabled'}
               </div>
            </div>
         </div>
      </div>

      <div className="flex gap-2">
        <button 
          onClick={onAuthorizations}
          className="flex-[1.5] py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2"
        >
          <Terminal size={14} /> CONTROL HUB
        </button>
        <button 
          onClick={onSettings}
          className="flex-1 py-2.5 bg-white/5 hover:bg-white/10 text-slate-300 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2"
        >
          <Settings size={14} /> POLICY
        </button>
        {agent.status === 'active' ? (
           <button onClick={onSuspend} className="p-2.5 bg-white/5 hover:bg-orange-500/20 text-slate-400 hover:text-orange-400 rounded-xl transition-all">
             <Pause size={18} />
           </button>
        ) : (
           <button onClick={onActivate} className="p-2.5 bg-white/5 hover:bg-emerald-500/20 text-slate-400 hover:text-emerald-400 rounded-xl transition-all">
             <Play size={18} />
           </button>
        )}
      </div>
    </div>
  );
};

interface AgentAccountPanelProps {
  onCreateAgent?: () => void;
  activeView?: 'agents' | 'authorizations' | 'autopay' | 'health' | 'history';
}

const AgentAccountPanel: React.FC<AgentAccountPanelProps> = ({ 
  onCreateAgent,
  activeView: initialActiveView = 'agents' 
}) => {
  const router = useRouter();
  const { t } = useLocalization();
  const toast = useToast();
  const { isConnected } = useWeb3();
  const { 
    agentAccounts, 
    activeAgents, 
    loading, 
    error,
    activateAgent,
    suspendAgent,
    resumeAgent,
    refreshAgentAccounts: refreshAgents
  } = useAgentAccounts();
  
  // QuickPay Session Management
  const {
    activeSession,
    sessions,
    loading: sessionLoading,
    createSession,
    revokeSession,
    loadActiveSession
  } = useSessionManager();

  const [activeView, setActiveView] = useState(initialActiveView);
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [showQuickPayModal, setShowQuickPayModal] = useState(false);
  const [quickPayFormData, setQuickPayFormData] = useState({
    singleLimit: 10,
    dailyLimit: 100,
    expiryDays: 30,
  });
  const [creatingSession, setCreatingSession] = useState(false);
  
  // P0: 实时数据
  const [authorizations, setAuthorizations] = useState<AgentAuthorization[]>([]);
  const [authLoading, setAuthLoading] = useState(false);
  const [executionHistory, setExecutionHistory] = useState<AgentExecutionHistory[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  
  // P1: 批量操作
  const [selectedAgents, setSelectedAgents] = useState<Set<string>>(new Set());
  const [batchOperating, setBatchOperating] = useState(false);
  
  // P2: 预算告警
  const [budgetAlerts, setBudgetAlerts] = useState<Array<{agentId: string; agentName: string; percent: number}>>([]);
  
  // P2: 历史图表数据
  const [spendingHistory, setSpendingHistory] = useState<Array<{date: string; amount: number}>>([]);

  // 加载授权数据 (P0)
  const loadAuthorizations = useCallback(async () => {
    setAuthLoading(true);
    try {
      const data = await agentAuthorizationApi.getAuthorizations();
      setAuthorizations(data || []);
    } catch (err) {
      console.error('Failed to load authorizations:', err);
    } finally {
      setAuthLoading(false);
    }
  }, []);

  // 加载执行历史 (P2)
  const loadExecutionHistory = useCallback(async () => {
    if (authorizations.length === 0) return;
    setHistoryLoading(true);
    try {
      const historyPromises = authorizations.slice(0, 5).map(auth => 
        agentAuthorizationApi.getExecutionHistory(auth.id).catch((): AgentExecutionHistory[] => [])
      );
      const results = await Promise.all(historyPromises);
      setExecutionHistory(results.flat().sort((a, b) => 
        new Date(b.executedAt).getTime() - new Date(a.executedAt).getTime()
      ).slice(0, 20));
    } catch (err) {
      console.error('Failed to load execution history:', err);
    } finally {
      setHistoryLoading(false);
    }
  }, [authorizations]);

  // 检测预算告警 (P2)
  useEffect(() => {
    const alerts: Array<{agentId: string; agentName: string; percent: number}> = [];
    agentAccounts.forEach(agent => {
      const percent = (agent.spentToday / agent.spendingLimits.daily) * 100;
      if (percent >= 80) {
        alerts.push({ agentId: agent.id, agentName: agent.name, percent });
      }
    });
    setBudgetAlerts(alerts);
  }, [agentAccounts]);

  // 生成消费历史数据 (P2)
  useEffect(() => {
    // 模拟最近7天数据 - 实际应从API获取
    const history = [];
    for (let i = 6; i >= 0; i--) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      history.push({
        date: date.toISOString().split('T')[0],
        amount: Math.random() * 100 + 20
      });
    }
    setSpendingHistory(history);
  }, [agentAccounts]);

  useEffect(() => {
    if (activeView === 'authorizations') {
      loadAuthorizations();
    }
  }, [activeView, loadAuthorizations]);

  useEffect(() => {
    if (activeView === 'history') {
      loadExecutionHistory();
    }
  }, [activeView, loadExecutionHistory]);

  // P0: 快速创建 - 跳转到 AgentBuilder
  const handleQuickCreate = () => {
    router.push('/agent-builder');
  };

  // P1: 批量暂停
  const handleBatchSuspend = async () => {
    if (selectedAgents.size === 0) return;
    setBatchOperating(true);
    try {
      await Promise.all(
        Array.from(selectedAgents).map(id => suspendAgent(id))
      );
      toast.success(t({ zh: `已暂停 ${selectedAgents.size} 个 Agent`, en: `Suspended ${selectedAgents.size} agents` }));
      setSelectedAgents(new Set());
    } catch (err) {
      toast.error(t({ zh: '批量暂停失败', en: 'Batch suspend failed' }));
    } finally {
      setBatchOperating(false);
    }
  };

  // P1: 批量激活
  const handleBatchActivate = async () => {
    if (selectedAgents.size === 0) return;
    setBatchOperating(true);
    try {
      await Promise.all(
        Array.from(selectedAgents).map(id => activateAgent(id))
      );
      toast.success(t({ zh: `已激活 ${selectedAgents.size} 个 Agent`, en: `Activated ${selectedAgents.size} agents` }));
      setSelectedAgents(new Set());
    } catch (err) {
      toast.error(t({ zh: '批量激活失败', en: 'Batch activate failed' }));
    } finally {
      setBatchOperating(false);
    }
  };

  // 切换选中
  const toggleAgentSelection = (agentId: string) => {
    const newSet = new Set(selectedAgents);
    if (newSet.has(agentId)) {
      newSet.delete(agentId);
    } else {
      newSet.add(agentId);
    }
    setSelectedAgents(newSet);
  };

  // 全选/取消全选
  const toggleSelectAll = () => {
    if (selectedAgents.size === agentAccounts.length) {
      setSelectedAgents(new Set());
    } else {
      setSelectedAgents(new Set(agentAccounts.map(a => a.id)));
    }
  };

  // 撤销授权
  const handleRevokeAuth = async (authId: string) => {
    try {
      await agentAuthorizationApi.revokeAuthorization(authId);
      toast.success(t({ zh: '授权已撤销', en: 'Authorization revoked' }));
      loadAuthorizations();
    } catch (err) {
      toast.error(t({ zh: '撤销失败', en: 'Failed to revoke' }));
    }
  };

  // 创建 QuickPay Session
  const handleCreateQuickPaySession = async () => {
    if (!isConnected) {
      toast.error(t({ zh: '请先连接钱包', en: 'Please connect wallet first' }));
      return;
    }
    setCreatingSession(true);
    try {
      await createSession({
        singleLimit: quickPayFormData.singleLimit,
        dailyLimit: quickPayFormData.dailyLimit,
        expiryDays: quickPayFormData.expiryDays,
      });
      toast.success(t({ zh: 'QuickPay 授权创建成功', en: 'QuickPay session created successfully' }));
      setShowQuickPayModal(false);
      loadAuthorizations();
    } catch (err: any) {
      toast.error(err.message || t({ zh: '创建失败', en: 'Failed to create session' }));
    } finally {
      setCreatingSession(false);
    }
  };

  // 撤销 QuickPay Session
  const handleRevokeQuickPaySession = async (sessionId: string) => {
    if (!confirm(t({ zh: '确定要撤销此 QuickPay 授权吗？这将同时撤销链上的代币授权。', en: 'Are you sure you want to revoke this QuickPay session? This will also revoke on-chain token approval.' }))) {
      return;
    }
    try {
      await revokeSession(sessionId);
      toast.success(t({ zh: 'QuickPay 授权已撤销', en: 'QuickPay session revoked' }));
      loadActiveSession();
    } catch (err: any) {
      toast.error(err.message || t({ zh: '撤销失败', en: 'Failed to revoke' }));
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-10 h-10 animate-spin text-blue-500" />
      </div>
    );
  }

  // P2: 预算告警通知组件
  const BudgetAlertBanner = () => {
    if (budgetAlerts.length === 0) return null;
    return (
      <div className="mb-6 bg-gradient-to-r from-amber-500/10 to-orange-500/10 border border-amber-500/20 rounded-2xl p-4">
        <div className="flex items-start gap-3">
          <Bell size={20} className="text-amber-400 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <h4 className="font-bold text-amber-400 text-sm mb-2">
              {t({ zh: '预算告警', en: 'Budget Alert' })}
            </h4>
            <div className="space-y-1">
              {budgetAlerts.map(alert => (
                <div key={alert.agentId} className="flex items-center justify-between text-xs">
                  <span className="text-slate-300">{alert.agentName}</span>
                  <span className={`font-mono ${alert.percent >= 100 ? 'text-red-400' : 'text-amber-400'}`}>
                    {alert.percent.toFixed(0)}% {t({ zh: '已使用', en: 'used' })}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  };

  // P2: 消费历史图表组件
  const SpendingChart = () => {
    const maxAmount = Math.max(...spendingHistory.map(h => h.amount));
    return (
      <div className="bg-slate-900/50 border border-white/5 rounded-2xl p-4">
        <div className="flex items-center justify-between mb-4">
          <h4 className="text-sm font-bold text-white flex items-center gap-2">
            <BarChart3 size={16} className="text-blue-400" />
            {t({ zh: '消费趋势 (7日)', en: 'Spending Trend (7D)' })}
          </h4>
          <span className="text-xs text-slate-500">
            ${spendingHistory.reduce((s, h) => s + h.amount, 0).toFixed(2)} total
          </span>
        </div>
        <div className="flex items-end gap-1 h-24">
          {spendingHistory.map((day, i) => (
            <div key={i} className="flex-1 flex flex-col items-center gap-1">
              <div 
                className="w-full bg-blue-500/60 rounded-t hover:bg-blue-500 transition-colors"
                style={{ height: `${(day.amount / maxAmount) * 100}%`, minHeight: '4px' }}
                title={`$${day.amount.toFixed(2)}`}
              />
              <span className="text-[8px] text-slate-500">{day.date.slice(-2)}</span>
            </div>
          ))}
        </div>
      </div>
    );
  };

  // P1: 批量操作工具栏
  const BatchToolbar = () => {
    if (selectedAgents.size === 0) return null;
    return (
      <div className="mb-4 bg-blue-500/10 border border-blue-500/20 rounded-xl p-3 flex items-center justify-between">
        <span className="text-sm text-blue-400 font-bold">
          {t({ zh: `已选择 ${selectedAgents.size} 个 Agent`, en: `${selectedAgents.size} agents selected` })}
        </span>
        <div className="flex items-center gap-2">
          <button
            onClick={handleBatchActivate}
            disabled={batchOperating}
            className="px-3 py-1.5 bg-emerald-500/20 text-emerald-400 text-xs font-bold rounded-lg hover:bg-emerald-500/30 transition-colors flex items-center gap-1"
          >
            <Play size={12} /> {t({ zh: '批量激活', en: 'Activate All' })}
          </button>
          <button
            onClick={handleBatchSuspend}
            disabled={batchOperating}
            className="px-3 py-1.5 bg-amber-500/20 text-amber-400 text-xs font-bold rounded-lg hover:bg-amber-500/30 transition-colors flex items-center gap-1"
          >
            <Pause size={12} /> {t({ zh: '批量暂停', en: 'Pause All' })}
          </button>
          <button
            onClick={() => setSelectedAgents(new Set())}
            className="px-3 py-1.5 bg-white/5 text-slate-400 text-xs font-bold rounded-lg hover:bg-white/10 transition-colors"
          >
            {t({ zh: '取消', en: 'Cancel' })}
          </button>
        </div>
      </div>
    );
  };

  const renderContent = () => {
    switch (activeView) {
      case 'authorizations':
        // P0: 使用真实API数据
        const activeAuths = authorizations.filter(a => a.isActive);
        const revokedAuths = authorizations.filter(a => !a.isActive);
        
        return (
          <div className="space-y-6">
            {/* QuickPay Session Card */}
            <div className="bg-gradient-to-r from-indigo-600/20 to-purple-600/20 border border-indigo-500/30 rounded-3xl p-6">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-4">
                  <div className="w-14 h-14 bg-indigo-500/20 rounded-2xl flex items-center justify-center">
                    <Key size={28} className="text-indigo-400" />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-white flex items-center gap-2">
                      QuickPay {t({ zh: '授权', en: 'Session' })}
                      {activeSession && <span className="px-2 py-0.5 bg-emerald-500/20 text-emerald-400 text-[10px] font-bold rounded-full uppercase">{t({ zh: '已激活', en: 'Active' })}</span>}
                    </h3>
                    <p className="text-sm text-slate-400">{t({ zh: '一键免签支付，无需每次确认', en: 'One-click gasless payments without signature' })}</p>
                  </div>
                </div>
                {!activeSession ? (
                  <button
                    onClick={() => setShowQuickPayModal(true)}
                    disabled={!isConnected || sessionLoading}
                    className="px-4 py-2.5 bg-indigo-600 text-white text-sm font-bold rounded-xl hover:bg-indigo-500 transition-colors flex items-center gap-2 disabled:opacity-50"
                  >
                    <Zap size={16} /> {t({ zh: '创建授权', en: 'Create Session' })}
                  </button>
                ) : (
                  <button
                    onClick={() => handleRevokeQuickPaySession(activeSession.id)}
                    className="px-4 py-2.5 bg-red-500/20 text-red-400 text-sm font-bold rounded-xl hover:bg-red-500/30 transition-colors flex items-center gap-2"
                  >
                    <XCircle size={16} /> {t({ zh: '撤销授权', en: 'Revoke' })}
                  </button>
                )}
              </div>
              
              {activeSession ? (
                <div className="grid grid-cols-4 gap-4 bg-white/5 rounded-2xl p-4">
                  <div className="text-center">
                    <div className="text-[10px] text-slate-500 uppercase mb-1">{t({ zh: '单笔限额', en: 'Single Limit' })}</div>
                    <div className="text-lg font-bold text-white">${activeSession.singleLimit}</div>
                  </div>
                  <div className="text-center">
                    <div className="text-[10px] text-slate-500 uppercase mb-1">{t({ zh: '日限额', en: 'Daily Limit' })}</div>
                    <div className="text-lg font-bold text-white">${activeSession.dailyLimit}</div>
                  </div>
                  <div className="text-center">
                    <div className="text-[10px] text-slate-500 uppercase mb-1">{t({ zh: '今日已用', en: 'Used Today' })}</div>
                    <div className="text-lg font-bold text-blue-400">${activeSession.usedToday || 0}</div>
                  </div>
                  <div className="text-center">
                    <div className="text-[10px] text-slate-500 uppercase mb-1">{t({ zh: '过期时间', en: 'Expires' })}</div>
                    <div className="text-sm font-bold text-slate-300">{activeSession.expiry ? new Date(activeSession.expiry).toLocaleDateString() : 'Never'}</div>
                  </div>
                </div>
              ) : (
                <div className="bg-white/5 rounded-2xl p-4 text-center">
                  <p className="text-sm text-slate-400">{t({ zh: '创建 QuickPay 授权以启用一键支付功能', en: 'Create a QuickPay session to enable one-click payments' })}</p>
                  {!isConnected && (
                    <p className="text-xs text-amber-400 mt-2">{t({ zh: '请先连接钱包', en: 'Please connect wallet first' })}</p>
                  )}
                </div>
              )}
            </div>

            {/* 授权概览 - P0: 真实数据 */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-slate-900/50 border border-white/5 rounded-2xl p-4">
                <div className="flex items-center gap-2 text-emerald-400 mb-2">
                  <CheckCircle size={16} />
                  <span className="text-xs font-bold uppercase">{t({ zh: '活跃', en: 'Active' })}</span>
                </div>
                <div className="text-2xl font-bold text-white">{authLoading ? '...' : activeAuths.length}</div>
                <div className="text-[10px] text-slate-500">{t({ zh: '活跃授权', en: 'Active authorizations' })}</div>
              </div>
              <div className="bg-slate-900/50 border border-white/5 rounded-2xl p-4">
                <div className="flex items-center gap-2 text-blue-400 mb-2">
                  <Clock size={16} />
                  <span className="text-xs font-bold uppercase">{t({ zh: '总使用', en: 'Total Used' })}</span>
                </div>
                <div className="text-2xl font-bold text-white">
                  ${authLoading ? '...' : authorizations.reduce((s, a) => s + (a.usedTotal || 0), 0).toFixed(2)}
                </div>
                <div className="text-[10px] text-slate-500">{t({ zh: '累计消费', en: 'Total spending' })}</div>
              </div>
              <div className="bg-slate-900/50 border border-white/5 rounded-2xl p-4">
                <div className="flex items-center gap-2 text-red-400 mb-2">
                  <AlertTriangle size={16} />
                  <span className="text-xs font-bold uppercase">{t({ zh: '已撤销', en: 'Revoked' })}</span>
                </div>
                <div className="text-2xl font-bold text-white">{authLoading ? '...' : revokedAuths.length}</div>
                <div className="text-[10px] text-slate-500">{t({ zh: '已撤销授权', en: 'Revoked authorizations' })}</div>
              </div>
            </div>

            {/* 授权列表 - P0: 真实数据 */}
            <div className="bg-slate-900/50 border border-white/5 rounded-3xl overflow-hidden">
              <div className="p-4 border-b border-white/5 flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-white">{t({ zh: '服务授权', en: 'Service Authorizations' })}</h3>
                  <p className="text-xs text-slate-500 mt-1">{t({ zh: '管理外部服务和 Agent 的权限', en: 'Manage permissions granted to external services and agents' })}</p>
                </div>
                <button 
                  onClick={loadAuthorizations}
                  className="p-2 hover:bg-white/5 rounded-lg text-slate-400 transition-colors"
                >
                  <RefreshCw size={16} className={authLoading ? 'animate-spin' : ''} />
                </button>
              </div>
              
              {authLoading ? (
                <div className="p-8 flex justify-center">
                  <Loader2 className="w-6 h-6 animate-spin text-blue-500" />
                </div>
              ) : authorizations.length === 0 ? (
                <div className="p-8 text-center">
                  <Shield className="w-12 h-12 text-slate-700 mx-auto mb-3" />
                  <p className="text-slate-400 text-sm">{t({ zh: '暂无授权记录', en: 'No authorizations yet' })}</p>
                </div>
              ) : (
                <div className="divide-y divide-white/5">
                  {authorizations.map(auth => (
                    <div key={auth.id} className={`p-4 hover:bg-white/5 transition-colors ${!auth.isActive ? 'opacity-60' : ''}`}>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-4">
                          <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                            auth.authorizationType === 'mpc' ? 'bg-gradient-to-br from-purple-500 to-pink-500' :
                            auth.authorizationType === 'erc8004' ? 'bg-gradient-to-br from-blue-500 to-cyan-500' :
                            'bg-gradient-to-br from-amber-500 to-orange-500'
                          }`}>
                            <Bot size={20} className="text-white" />
                          </div>
                          <div>
                            <div className="font-medium text-white">{auth.agentName || `Agent ${auth.agentId.slice(0, 8)}`}</div>
                            <div className="text-xs text-slate-500">
                              {auth.authorizationType.toUpperCase()} • 
                              {t({ zh: '已用', en: 'Used' })}: ${auth.usedToday?.toFixed(2) || '0.00'} / ${auth.dailyLimit?.toFixed(2) || '∞'}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-4">
                          <span className={`px-2 py-1 text-[10px] font-bold rounded-full uppercase ${
                            auth.isActive ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'
                          }`}>
                            {auth.isActive ? t({ zh: '活跃', en: 'Active' }) : t({ zh: '已撤销', en: 'Revoked' })}
                          </span>
                          {auth.isActive && (
                            <button 
                              onClick={() => handleRevokeAuth(auth.id)}
                              className="px-3 py-1.5 bg-red-500/10 text-red-400 text-xs font-bold rounded-lg hover:bg-red-500/20 transition-colors"
                            >
                              {t({ zh: '撤销', en: 'Revoke' })}
                            </button>
                          )}
                        </div>
                      </div>
                      <div className="mt-3 flex items-center gap-4 text-[10px] text-slate-500">
                        <span>{t({ zh: '创建', en: 'Created' })}: {new Date(auth.createdAt).toLocaleDateString()}</span>
                        <span>•</span>
                        <span>{t({ zh: '过期', en: 'Expires' })}: {auth.expiry ? new Date(auth.expiry).toLocaleDateString() : t({ zh: '永不', en: 'Never' })}</span>
                        <span>•</span>
                        <span>{t({ zh: '累计', en: 'Total' })}: ${auth.usedTotal?.toFixed(2) || '0.00'}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        );

      case 'history':
        // P2: 执行历史视图
        return (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold text-white">{t({ zh: '执行历史', en: 'Execution History' })}</h3>
              <button 
                onClick={loadExecutionHistory}
                className="p-2 hover:bg-white/5 rounded-lg text-slate-400 transition-colors"
              >
                <RefreshCw size={16} className={historyLoading ? 'animate-spin' : ''} />
              </button>
            </div>
            
            {historyLoading ? (
              <div className="p-8 flex justify-center">
                <Loader2 className="w-6 h-6 animate-spin text-blue-500" />
              </div>
            ) : executionHistory.length === 0 ? (
              <div className="p-12 text-center bg-slate-900/50 rounded-2xl border border-white/5">
                <History className="w-12 h-12 text-slate-700 mx-auto mb-3" />
                <p className="text-slate-400">{t({ zh: '暂无执行记录', en: 'No execution history' })}</p>
              </div>
            ) : (
              <div className="bg-slate-900/50 border border-white/5 rounded-2xl overflow-hidden">
                <div className="divide-y divide-white/5">
                  {executionHistory.map(exec => (
                    <div key={exec.id} className="p-4 flex items-center justify-between hover:bg-white/5 transition-colors">
                      <div className="flex items-center gap-4">
                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                          exec.status === 'success' ? 'bg-emerald-500/20 text-emerald-400' :
                          exec.status === 'failed' ? 'bg-red-500/20 text-red-400' :
                          exec.status === 'pending' ? 'bg-amber-500/20 text-amber-400' :
                          'bg-slate-500/20 text-slate-400'
                        }`}>
                          {exec.status === 'success' ? <CheckCircle size={20} /> :
                           exec.status === 'failed' ? <XCircle size={20} /> :
                           <Clock size={20} />}
                        </div>
                        <div>
                          <div className="font-medium text-white capitalize">{exec.executionType}</div>
                          <div className="text-xs text-slate-500">
                            {new Date(exec.executedAt).toLocaleString()}
                          </div>
                        </div>
                      </div>
                      <div className="text-right">
                        {exec.amount && (
                          <div className="font-mono font-bold text-white">${exec.amount.toFixed(2)}</div>
                        )}
                        <div className={`text-xs font-bold uppercase ${
                          exec.status === 'success' ? 'text-emerald-400' :
                          exec.status === 'failed' ? 'text-red-400' : 'text-amber-400'
                        }`}>
                          {exec.status}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        );

      case 'health':
        // P1: Agent 健康监控仪表盘
        return (
          <div className="space-y-6">
            <h3 className="text-lg font-bold text-white flex items-center gap-2">
              <Activity size={20} className="text-emerald-400" />
              {t({ zh: 'Agent 健康监控', en: 'Agent Health Monitor' })}
            </h3>
            
            {/* 总体健康状态 */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-2xl p-4 text-center">
                <div className="text-3xl font-bold text-emerald-400">{activeAgents.length}</div>
                <div className="text-xs text-slate-400 mt-1">{t({ zh: '运行中', en: 'Running' })}</div>
              </div>
              <div className="bg-amber-500/10 border border-amber-500/20 rounded-2xl p-4 text-center">
                <div className="text-3xl font-bold text-amber-400">
                  {agentAccounts.filter(a => a.status === 'suspended').length}
                </div>
                <div className="text-xs text-slate-400 mt-1">{t({ zh: '已暂停', en: 'Paused' })}</div>
              </div>
              <div className="bg-blue-500/10 border border-blue-500/20 rounded-2xl p-4 text-center">
                <div className="text-3xl font-bold text-blue-400">
                  {(agentAccounts.reduce((s, a) => s + (a.creditScore || 0), 0) / Math.max(1, agentAccounts.length)).toFixed(0)}
                </div>
                <div className="text-xs text-slate-400 mt-1">{t({ zh: '平均信用分', en: 'Avg Credit' })}</div>
              </div>
              <div className="bg-purple-500/10 border border-purple-500/20 rounded-2xl p-4 text-center">
                <div className="text-3xl font-bold text-purple-400">99.2%</div>
                <div className="text-xs text-slate-400 mt-1">{t({ zh: '成功率', en: 'Success Rate' })}</div>
              </div>
            </div>

            {/* P2: 消费趋势图表 */}
            <SpendingChart />

            {/* 各 Agent 健康状态 */}
            <div className="bg-slate-900/50 border border-white/5 rounded-2xl overflow-hidden">
              <div className="p-4 border-b border-white/5">
                <h4 className="font-bold text-white">{t({ zh: 'Agent 状态详情', en: 'Agent Status Details' })}</h4>
              </div>
              <div className="divide-y divide-white/5">
                {agentAccounts.map(agent => {
                  const budgetPercent = (agent.spentToday / agent.spendingLimits.daily) * 100;
                  const risk = riskLevelConfig[agent.riskLevel];
                  return (
                    <div key={agent.id} className="p-4 flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        <div className={`w-3 h-3 rounded-full ${
                          agent.status === 'active' ? 'bg-emerald-500 animate-pulse' :
                          agent.status === 'suspended' ? 'bg-amber-500' : 'bg-slate-500'
                        }`} />
                        <div>
                          <div className="font-medium text-white">{agent.name}</div>
                          <div className="text-xs text-slate-500">{agent.agentUniqueId.slice(0, 12)}...</div>
                        </div>
                      </div>
                      <div className="flex items-center gap-6">
                        <div className="text-right">
                          <div className={`text-sm font-bold ${risk.color}`}>{agent.creditScore}</div>
                          <div className="text-[10px] text-slate-500">{t({ zh: '信用分', en: 'Credit' })}</div>
                        </div>
                        <div className="w-24">
                          <div className="text-[10px] text-slate-500 mb-1">{t({ zh: '预算', en: 'Budget' })}</div>
                          <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
                            <div 
                              className={`h-full ${budgetPercent > 90 ? 'bg-red-500' : budgetPercent > 70 ? 'bg-amber-500' : 'bg-blue-500'}`}
                              style={{ width: `${Math.min(100, budgetPercent)}%` }}
                            />
                          </div>
                        </div>
                        <span className={`px-2 py-1 text-[10px] font-bold rounded-full uppercase ${statusConfig[agent.status]?.bgColor} ${statusConfig[agent.status]?.color}`}>
                          {statusConfig[agent.status]?.label}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        );

      case 'autopay':
        return (
          <div className="space-y-6">
            {/* AutoPay 全局开关 */}
            <div className="bg-gradient-to-r from-blue-600/20 to-purple-600/20 border border-blue-500/20 rounded-3xl p-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="w-14 h-14 bg-blue-500/20 rounded-2xl flex items-center justify-center">
                    <Zap size={28} className="text-blue-400" />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-white">AutoPay Global Setting</h3>
                    <p className="text-sm text-slate-400">Enable trust-less automated payments for your agents</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-sm text-emerald-400 font-bold">ENABLED</span>
                  <button className="w-14 h-8 bg-emerald-500 rounded-full relative transition-colors">
                    <div className="absolute right-1 top-1 w-6 h-6 bg-white rounded-full shadow-lg transition-all" />
                  </button>
                </div>
              </div>
            </div>

            {/* AutoPay 规则列表 */}
            <div className="bg-slate-900/50 border border-white/5 rounded-3xl overflow-hidden">
              <div className="p-4 border-b border-white/5 flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-white">AutoPay Rules</h3>
                  <p className="text-xs text-slate-500 mt-1">Configure automatic payment rules for recurring transactions</p>
                </div>
                <button className="px-4 py-2 bg-blue-600 text-white text-xs font-bold rounded-xl hover:bg-blue-500 transition-colors flex items-center gap-2">
                  <Plus size={14} /> Add Rule
                </button>
              </div>

              <div className="divide-y divide-white/5">
                {/* Rule 1 */}
                <div className="p-4 hover:bg-white/5 transition-colors">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-emerald-500/20 rounded-xl flex items-center justify-center text-emerald-400">
                        <Zap size={20} />
                      </div>
                      <div>
                        <div className="font-medium text-white">API Subscription Fee</div>
                        <div className="text-xs text-slate-500">Auto-renew monthly subscription</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="px-2 py-1 bg-emerald-500/20 text-emerald-400 text-[10px] font-bold rounded-full">ACTIVE</span>
                      <button className="p-2 hover:bg-white/10 rounded-lg transition-colors">
                        <Settings size={16} className="text-slate-400" />
                      </button>
                    </div>
                  </div>
                  <div className="bg-white/5 rounded-xl p-3 grid grid-cols-4 gap-4 text-center">
                    <div>
                      <div className="text-[10px] text-slate-500 uppercase mb-1">Amount</div>
                      <div className="text-sm font-bold text-white">$29.99</div>
                    </div>
                    <div>
                      <div className="text-[10px] text-slate-500 uppercase mb-1">Frequency</div>
                      <div className="text-sm font-bold text-white">Monthly</div>
                    </div>
                    <div>
                      <div className="text-[10px] text-slate-500 uppercase mb-1">Max/Period</div>
                      <div className="text-sm font-bold text-white">$29.99</div>
                    </div>
                    <div>
                      <div className="text-[10px] text-slate-500 uppercase mb-1">Next Payment</div>
                      <div className="text-sm font-bold text-blue-400">Feb 1, 2026</div>
                    </div>
                  </div>
                </div>

                {/* Rule 2 */}
                <div className="p-4 hover:bg-white/5 transition-colors">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-purple-500/20 rounded-xl flex items-center justify-center text-purple-400">
                        <Bot size={20} />
                      </div>
                      <div>
                        <div className="font-medium text-white">Agent-to-Agent Micro Payments</div>
                        <div className="text-xs text-slate-500">Allow small automated transfers between agents</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="px-2 py-1 bg-emerald-500/20 text-emerald-400 text-[10px] font-bold rounded-full">ACTIVE</span>
                      <button className="p-2 hover:bg-white/10 rounded-lg transition-colors">
                        <Settings size={16} className="text-slate-400" />
                      </button>
                    </div>
                  </div>
                  <div className="bg-white/5 rounded-xl p-3 grid grid-cols-4 gap-4 text-center">
                    <div>
                      <div className="text-[10px] text-slate-500 uppercase mb-1">Max Single</div>
                      <div className="text-sm font-bold text-white">$5.00</div>
                    </div>
                    <div>
                      <div className="text-[10px] text-slate-500 uppercase mb-1">Daily Limit</div>
                      <div className="text-sm font-bold text-white">$50.00</div>
                    </div>
                    <div>
                      <div className="text-[10px] text-slate-500 uppercase mb-1">Used Today</div>
                      <div className="text-sm font-bold text-emerald-400">$12.50</div>
                    </div>
                    <div>
                      <div className="text-[10px] text-slate-500 uppercase mb-1">Tx Count</div>
                      <div className="text-sm font-bold text-white">8</div>
                    </div>
                  </div>
                </div>

                {/* Rule 3 - Paused */}
                <div className="p-4 hover:bg-white/5 transition-colors opacity-60">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-slate-500/20 rounded-xl flex items-center justify-center text-slate-400">
                        <TrendingUp size={20} />
                      </div>
                      <div>
                        <div className="font-medium text-white">DeFi Yield Farming</div>
                        <div className="text-xs text-slate-500">Auto-compound rewards daily</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="px-2 py-1 bg-slate-500/20 text-slate-400 text-[10px] font-bold rounded-full">PAUSED</span>
                      <button className="p-2 hover:bg-white/10 rounded-lg transition-colors">
                        <Play size={16} className="text-slate-400" />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* 安全提示 */}
            <div className="bg-amber-500/10 border border-amber-500/20 rounded-2xl p-4 flex items-start gap-3">
              <AlertTriangle size={20} className="text-amber-400 flex-shrink-0 mt-0.5" />
              <div>
                <div className="font-medium text-amber-400 text-sm">Security Notice</div>
                <p className="text-xs text-slate-400 mt-1">
                  AutoPay rules execute automatically without requiring manual approval. Ensure your spending limits are appropriately configured to prevent unexpected charges.
                </p>
              </div>
            </div>
          </div>
        );

      default:
        return (
          <div className="space-y-6">
            {/* P2: 预算告警 */}
            <BudgetAlertBanner />
            
            {/* P1: 批量操作工具栏 */}
            <BatchToolbar />
            
            {/* Agent List */}
            {agentAccounts.length === 0 ? (
              <div className="text-center py-20 bg-slate-900/50 rounded-3xl border border-white/5">
                <Bot className="w-16 h-16 mx-auto text-slate-700 mb-4" />
                <h3 className="text-xl font-bold text-white mb-2">{t({ zh: '暂无 Agent', en: 'No Agents Found' })}</h3>
                <p className="text-slate-400 mb-8 max-w-xs mx-auto">{t({ zh: '创建您的第一个自主 Agent 账户，开始参与 AI 生态。', en: 'Create your first autonomous agent account to start participating in the AI ecosystem.' })}</p>
                {/* P0: 快速创建 - 跳转到 AgentBuilder */}
                <button 
                  onClick={handleQuickCreate}
                  className="px-8 py-3 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-500 hover:to-purple-500 text-white rounded-2xl font-bold transition-all shadow-lg shadow-blue-600/20 flex items-center gap-2 mx-auto"
                >
                  <Zap size={18} />
                  {t({ zh: '快速创建 Agent', en: 'Quick Create Agent' })}
                </button>
              </div>
            ) : (
              <>
                {/* P1: 全选控制 */}
                <div className="flex items-center justify-between mb-4">
                  <button
                    onClick={toggleSelectAll}
                    className="flex items-center gap-2 text-sm text-slate-400 hover:text-white transition-colors"
                  >
                    {selectedAgents.size === agentAccounts.length ? (
                      <CheckSquare size={16} className="text-blue-400" />
                    ) : (
                      <Square size={16} />
                    )}
                    {t({ zh: '全选', en: 'Select All' })} ({agentAccounts.length})
                  </button>
                  <button 
                    onClick={() => refreshAgents?.()}
                    className="p-2 hover:bg-white/5 rounded-lg text-slate-400 transition-colors"
                  >
                    <RefreshCw size={16} />
                  </button>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {agentAccounts.map(agent => (
                    <div key={agent.id} className="relative">
                      {/* P1: 选择复选框 */}
                      <button
                        onClick={() => toggleAgentSelection(agent.id)}
                        className={`absolute top-4 left-4 z-10 p-1 rounded transition-colors ${
                          selectedAgents.has(agent.id) ? 'text-blue-400' : 'text-slate-600 hover:text-slate-400'
                        }`}
                      >
                        {selectedAgents.has(agent.id) ? <CheckSquare size={18} /> : <Square size={18} />}
                      </button>
                      
                      <AgentAccountCardV2
                        agent={agent}
                        onActivate={() => activateAgent(agent.id)}
                        onSuspend={() => suspendAgent(agent.id)}
                        onResume={() => resumeAgent(agent.id)}
                        onSettings={() => {
                          setSelectedAgentId(agent.id);
                          setShowSettingsModal(true);
                        }}
                        onAuthorizations={() => {
                          setSelectedAgentId(agent.id);
                          setShowAuthModal(true);
                        }}
                      />
                    </div>
                  ))}
                </div>
              </>
            )}

            {/* Real-time Logs / Console */}
            {agentAccounts.length > 0 && (
              <div className="space-y-4">
                 <div className="flex items-center justify-between">
                    <h3 className="text-sm font-bold text-slate-500 uppercase tracking-widest flex items-center gap-2">
                       <Activity size={14} className="text-blue-400" /> {t({ zh: '执行日志流', en: 'Execution Stream' })}
                    </h3>
                    <div className="flex items-center gap-2 text-[10px] text-slate-500">
                       <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" /> {t({ zh: '实时同步', en: 'LIVE SYNCING' })}
                    </div>
                 </div>
                 <div className="bg-black border border-white/5 rounded-2xl p-6 font-mono text-xs space-y-3 shadow-inner">
                    <div className="flex gap-3">
                       <span className="text-slate-600">14:10:02</span>
                       <span className="text-blue-400 font-bold">[SYS]</span>
                       <span className="text-slate-300">Initialized &quot;{agentAccounts[0].name}&quot; kernel environment.</span>
                    </div>
                    <div className="flex gap-3">
                       <span className="text-slate-600">14:10:05</span>
                       <span className="text-purple-400 font-bold">[X402]</span>
                       <span className="text-slate-300">Requesting Auth Token for Resource: &quot;Global Market Data&quot;</span>
                    </div>
                    <div className="flex gap-3">
                       <span className="text-slate-600">14:10:08</span>
                       <span className="text-emerald-400 font-bold">[PAY]</span>
                       <span className="text-slate-300">Internal Transfer: 0.10 USDC authorized via AutoPay.</span>
                    </div>
                    <div className="flex gap-3 opacity-50">
                       <span className="text-slate-600">14:10:12</span>
                       <span className="text-slate-400 font-bold">[IDE]</span>
                       <span className="text-slate-500">Awaiting next task sequence...</span>
                    </div>
                 </div>
              </div>
            )}
          </div>
        );
    }
  };

  return (
    <div className="max-w-5xl mx-auto py-4">
      {/* Header with Stats */}
      <div className="mb-10">
        <div className="flex items-center justify-between mb-8">
           <div>
              <h2 className="text-3xl font-bold text-white tracking-tight">{t({ zh: 'Agent 账户', en: 'Agent Accounts' })}</h2>
              <p className="text-slate-400 text-sm mt-1">{t({ zh: '管理预算、风险和跨 Agent 协作', en: 'Manage budget, risk, and cross-agent coordination' })}</p>
           </div>
           {/* P0: 快速创建按钮 - 跳转到 AgentBuilder */}
           <button 
              onClick={handleQuickCreate}
              className="px-6 py-3 bg-gradient-to-r from-blue-600 to-purple-600 text-white font-bold rounded-2xl hover:from-blue-500 hover:to-purple-500 transition-all shadow-xl flex items-center gap-2"
           >
              <Zap size={18} /> {t({ zh: '快速创建 Agent', en: 'Quick Create' })}
           </button>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
           <AgentStatCard label={t({ zh: '运行中', en: 'Live Agents' })} value={activeAgents.length} icon={Activity} color="text-emerald-400" />
           <AgentStatCard label={t({ zh: '今日消费', en: 'Today Spent' })} value={`$${agentAccounts.reduce((s,a) => s + (a.spentToday || 0), 0).toFixed(2)}`} icon={TrendingUp} color="text-blue-400" subValue={t({ zh: '24小时内', en: 'LAST 24H' })} />
           <AgentStatCard label={t({ zh: '总预算', en: 'Total Budget' })} value={`$${agentAccounts.reduce((s,a) => s + (a.spendingLimits?.daily || 0), 0)}`} icon={Shield} color="text-purple-400" subValue={t({ zh: '每日汇总', en: 'DAILY' })} />
           <AgentStatCard label={t({ zh: '安全状态', en: 'Security' })} value={t({ zh: '正常', en: 'Active' })} icon={Lock} color="text-emerald-400" />
        </div>
      </div>

      {/* P1: 扩展标签页 - 添加健康监控和执行历史 */}
      <div className="flex gap-4 mb-8 border-b border-white/5 pb-2 overflow-x-auto">
         {[
           { id: 'agents', label: t({ zh: '我的 AGENT', en: 'MY AGENTS' }), icon: Layout },
           { id: 'health', label: t({ zh: '健康监控', en: 'HEALTH' }), icon: Activity },
           { id: 'authorizations', label: t({ zh: '授权管理', en: 'AUTHORIZATIONS' }), icon: Shield },
           { id: 'history', label: t({ zh: '执行历史', en: 'HISTORY' }), icon: History },
           { id: 'autopay', label: t({ zh: '自动支付', en: 'AUTO-PAY' }), icon: Zap },
         ].map(tab => (
           <button 
            key={tab.id}
            onClick={() => setActiveView(tab.id as any)}
            className={`flex items-center gap-2 px-2 py-3 text-[10px] font-bold uppercase tracking-widest transition-all relative whitespace-nowrap ${activeView === tab.id ? 'text-white' : 'text-slate-500 hover:text-slate-300'}`}
           >
              <tab.icon size={12} /> {tab.label}
              {activeView === tab.id && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-500 rounded-full" />}
           </button>
         ))}
      </div>

      {renderContent()}

      {/* QuickPay Session Creation Modal */}
      {showQuickPayModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-md bg-slate-900 rounded-3xl border border-white/10 shadow-2xl overflow-hidden">
            <div className="bg-gradient-to-r from-indigo-600 to-purple-600 p-6">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-xl font-bold text-white">{t({ zh: '创建 QuickPay 授权', en: 'Create QuickPay Session' })}</h3>
                  <p className="text-indigo-100 text-sm mt-1">{t({ zh: '设置支付限额和有效期', en: 'Set payment limits and expiry' })}</p>
                </div>
                <button onClick={() => setShowQuickPayModal(false)} className="p-2 hover:bg-white/10 rounded-lg transition-colors text-white">
                  <XCircle size={20} />
                </button>
              </div>
            </div>
            
            <div className="p-6 space-y-6">
              <div>
                <label className="text-sm font-medium text-slate-300 mb-2 block">{t({ zh: '单笔限额 (USDT)', en: 'Single Transaction Limit (USDT)' })}</label>
                <input
                  type="number"
                  value={quickPayFormData.singleLimit}
                  onChange={(e) => setQuickPayFormData({ ...quickPayFormData, singleLimit: Number(e.target.value) })}
                  className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white focus:outline-none focus:border-indigo-500"
                  placeholder="10"
                />
              </div>
              
              <div>
                <label className="text-sm font-medium text-slate-300 mb-2 block">{t({ zh: '每日限额 (USDT)', en: 'Daily Limit (USDT)' })}</label>
                <input
                  type="number"
                  value={quickPayFormData.dailyLimit}
                  onChange={(e) => setQuickPayFormData({ ...quickPayFormData, dailyLimit: Number(e.target.value) })}
                  className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white focus:outline-none focus:border-indigo-500"
                  placeholder="100"
                />
              </div>
              
              <div>
                <label className="text-sm font-medium text-slate-300 mb-2 block">{t({ zh: '有效期 (天)', en: 'Expiry (Days)' })}</label>
                <input
                  type="number"
                  value={quickPayFormData.expiryDays}
                  onChange={(e) => setQuickPayFormData({ ...quickPayFormData, expiryDays: Number(e.target.value) })}
                  className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white focus:outline-none focus:border-indigo-500"
                  placeholder="30"
                />
              </div>
              
              <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-4 flex items-start gap-3">
                <AlertTriangle size={18} className="text-amber-400 flex-shrink-0 mt-0.5" />
                <p className="text-xs text-slate-400">{t({ zh: '创建授权需要钱包签名，将在链上注册 Session Key 并授权代币支出。', en: 'Creating a session requires wallet signature. This will register a Session Key on-chain and approve token spending.' })}</p>
              </div>
              
              <button
                onClick={handleCreateQuickPaySession}
                disabled={creatingSession}
                className="w-full py-4 bg-gradient-to-r from-indigo-600 to-purple-600 text-white font-bold rounded-xl hover:from-indigo-500 hover:to-purple-500 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {creatingSession ? (
                  <>
                    <Loader2 size={18} className="animate-spin" /> {t({ zh: '创建中...', en: 'Creating...' })}
                  </>
                ) : (
                  <>
                    <Zap size={18} /> {t({ zh: '创建授权', en: 'Create Session' })}
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AgentAccountPanel;
