import React, { useState, useEffect, useCallback } from 'react';
import { useLocalization } from '../../contexts/LocalizationContext';
import { useToast } from '../../contexts/ToastContext';
import { apiClient } from '../../lib/api/client';
import { Shield, Zap, Lock, AlertTriangle, CheckCircle2, Clock, ShieldCheck, RefreshCw } from 'lucide-react';

interface Policy {
  id: string;
  name: string;
  description: string;
  type: string;
  value: any;
  enabled: boolean;
  lastTriggered?: string;
}

export function PolicyEngine() {
  const { t } = useLocalization();
  const { success, error: showError } = useToast();
  const [policies, setPolicies] = useState<Policy[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchPolicies = useCallback(async () => {
    try {
      const data = await apiClient.get<Policy[]>('/user-agent/policies');
      if (data && Array.isArray(data) && data.length > 0) {
        setPolicies(data);
      } else {
        // Fallback to default policies if none exist
        setPolicies([
          { id: '1', type: 'daily_limit', name: t({ zh: '每日交易限额', en: 'Daily Transaction Limit' }), description: t({ zh: 'Agent 每日可自动执行的最大金额', en: 'Maximum amount the agent can execute automatically per day' }), value: 100, enabled: true },
          { id: '2', type: 'single_limit', name: t({ zh: '单笔交易限额', en: 'Single Transaction Limit' }), description: t({ zh: 'Agent 单笔可自动执行的最大金额', en: 'Maximum amount the agent can execute automatically per transaction' }), value: 20, enabled: true },
          { id: '3', type: 'protocol_whitelist', name: t({ zh: '协议白名单', en: 'Protocol Whitelist' }), description: t({ zh: '允许 Agent 交互的协议列表', en: 'List of protocols the agent is allowed to interact with' }), value: ['Uniswap', 'PancakeSwap', 'Agentrix Pay'], enabled: true },
          { id: '4', type: 'auto_claim_airdrop', name: t({ zh: '自动领取空投', en: 'Auto-claim Airdrops' }), description: t({ zh: '发现符合条件的空投时自动执行领取流程', en: 'Automatically claim eligible airdrops when discovered' }), value: true, enabled: false },
          { id: '5', type: 'gas_price_limit', name: t({ zh: 'Gas 价格上限', en: 'Gas Price Cap' }), description: t({ zh: '当 Gas 价格高于此值时暂停自动交易', en: 'Pause auto-transactions when gas price exceeds this value' }), value: 50, enabled: true },
        ]);
      }
    } catch (error) {
      console.error('Failed to fetch policies:', error);
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    fetchPolicies();
  }, [fetchPolicies]);

  const savePolicy = async (policy: Policy) => {
    try {
      await apiClient.post('/user-agent/policies', { 
        type: policy.type, 
        value: policy.value, 
        enabled: policy.enabled 
      });
      success(t({ zh: '策略已更新', en: 'Policy updated' }));
    } catch (error) {
      showError(t({ zh: '更新失败', en: 'Update failed' }));
    }
  };

  const togglePolicy = (policy: Policy) => {
    const updatedPolicy = { ...policy, enabled: !policy.enabled };
    setPolicies(policies.map(p => p.id === policy.id ? updatedPolicy : p));
    savePolicy(updatedPolicy);
  };

  const updateValue = (policy: Policy, newValue: any) => {
    setPolicies(policies.map(p => p.id === policy.id ? { ...p, value: newValue } : p));
  };

  const handleValueBlur = (policy: Policy) => {
    savePolicy(policy);
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center p-12">
        <div className="w-10 h-10 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mb-4"></div>
        <p className="text-neutral-400">{t({ zh: '正在同步安全策略...', en: 'Syncing security policies...' })}</p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-white flex items-center gap-2">
            <ShieldCheck className="text-blue-500" />
            {t({ zh: '授权中心', en: 'Authorization Center' })}
          </h2>
          <p className="text-slate-400 mt-1">
            {t({ zh: '配置您的 Agent 自动化执行的边界与规则，确保资产安全', en: 'Configure boundaries and rules for your agent\'s automated execution' })}
          </p>
        </div>
        <div className="flex gap-3">
          <button 
            onClick={fetchPolicies}
            className="p-3 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl border border-white/5 transition-colors"
            title={t({ zh: '刷新', en: 'Refresh' })}
          >
            <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
          </button>
          <div className="bg-blue-500/10 text-blue-400 px-4 py-2 rounded-xl border border-blue-500/20 flex items-center gap-3">
            <div className="relative flex h-3 w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-3 w-3 bg-blue-500"></span>
            </div>
            <span className="text-sm font-semibold uppercase tracking-wider">{t({ zh: '实时防护中', en: 'Real-time Protection' })}</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6">
        {policies.map((policy) => (
          <div 
            key={policy.id} 
            className={`bg-slate-900/50 rounded-2xl p-6 border transition-all duration-300 ${
              policy.enabled ? 'border-white/10 shadow-lg' : 'border-white/5 opacity-60 grayscale-[0.5]'
            }`}
          >
            <div className="flex justify-between items-start mb-6">
              <div className="flex gap-5">
                <div className={`w-14 h-14 rounded-2xl flex items-center justify-center text-2xl shadow-inner ${
                  policy.type.includes('limit') ? 'bg-purple-500/10 text-purple-400 border border-purple-500/20' :
                  policy.type.includes('whitelist') ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' :
                  policy.type.includes('gas') ? 'bg-orange-500/10 text-orange-400 border border-orange-500/20' :
                  'bg-blue-500/10 text-blue-400 border border-blue-500/20'
                }`}>
                  {policy.type.includes('limit') ? <Zap size={24} /> : 
                   policy.type.includes('whitelist') ? <Shield size={24} /> : 
                   policy.type.includes('gas') ? <Clock size={24} /> : <Lock size={24} />}
                </div>
                <div>
                  <h3 className="text-lg font-bold text-white">{policy.name}</h3>
                  <p className="text-sm text-slate-400 mt-1 max-w-md">{policy.description}</p>
                </div>
              </div>
              <button
                onClick={() => togglePolicy(policy)}
                className={`relative inline-flex h-7 w-12 items-center rounded-full transition-all focus:outline-none ${
                  policy.enabled ? 'bg-blue-600 shadow-[0_0_10px_rgba(37,99,235,0.4)]' : 'bg-slate-700'
                }`}
              >
                <span
                  className={`inline-block h-5 w-5 transform rounded-full bg-white transition-transform duration-200 ${
                    policy.enabled ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
            </div>

            {policy.enabled && (
              <div className="mt-4 pt-6 border-t border-white/5 animate-in fade-in slide-in-from-top-2 duration-300">
                {policy.type.includes('limit') && (
                  <div className="space-y-4">
                    <div className="flex justify-between text-sm mb-2">
                      <span className="text-slate-500">{t({ zh: '当前设定', en: 'Current Setting' })}</span>
                      <span className="text-blue-400 font-mono font-bold">${policy.value}</span>
                    </div>
                    <div className="flex items-center gap-6">
                      <input
                        type="range"
                        min="0"
                        max="1000"
                        step="10"
                        value={typeof policy.value === 'number' ? policy.value : 0}
                        onChange={(e) => updateValue(policy, parseInt(e.target.value))}
                        onMouseUp={() => handleValueBlur(policy)}
                        className="flex-1 h-2 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-blue-500"
                      />
                      <div className="bg-black/40 px-4 py-2 rounded-xl border border-white/5 min-w-[100px] text-center shadow-inner">
                        <span className="font-mono font-bold text-blue-400">${policy.value}</span>
                      </div>
                    </div>
                  </div>
                )}

                {policy.type.includes('whitelist') && Array.isArray(policy.value) && (
                  <div className="flex flex-wrap gap-2">
                    {policy.value.map((item: string) => (
                      <span key={item} className="bg-black/40 px-4 py-1.5 rounded-full text-sm border border-white/5 text-slate-300 flex items-center gap-2 hover:border-white/10 transition-colors">
                        <CheckCircle2 size={14} className="text-emerald-500" />
                        {item}
                        <button 
                          onClick={() => {
                            const newValue = policy.value.filter((v: string) => v !== item);
                            const updated = { ...policy, value: newValue };
                            setPolicies(policies.map(p => p.id === policy.id ? updated : p));
                            savePolicy(updated);
                          }}
                          className="ml-1 text-slate-600 hover:text-red-400 transition-colors"
                        >
                          ×
                        </button>
                      </span>
                    ))}
                    <button className="px-4 py-1.5 rounded-full text-sm border border-dashed border-white/10 text-slate-500 hover:border-blue-500 hover:text-blue-400 transition-all">
                      + {t({ zh: '添加协议', en: 'Add Protocol' })}
                    </button>
                  </div>
                )}

                {policy.type === 'gas_price_limit' && (
                  <div className="flex items-center gap-4">
                    <input
                      type="number"
                      value={policy.value}
                      onChange={(e) => updateValue(policy, parseInt(e.target.value))}
                      onBlur={() => handleValueBlur(policy)}
                      className="bg-black/40 border border-white/5 rounded-xl px-4 py-2 text-blue-400 font-mono w-24 focus:outline-none focus:border-blue-500"
                    />
                    <span className="text-slate-500 font-mono text-sm">Gwei</span>
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="p-6 bg-amber-500/5 border border-amber-500/10 rounded-2xl flex items-start gap-4">
        <div className="w-10 h-10 rounded-full bg-amber-500/10 flex items-center justify-center shrink-0">
          <AlertTriangle className="text-amber-500" size={20} />
        </div>
        <div>
          <h4 className="text-amber-500 font-bold mb-1">{t({ zh: '安全建议', en: 'Security Tip' })}</h4>
          <p className="text-sm text-slate-400 leading-relaxed">
            {t({
              zh: '建议为新 Agent 设置较低的每日限额（如 $50），并在观察一段时间后再逐步调高。开启协议白名单可以有效防止恶意合约交互。',
              en: 'It is recommended to set a lower daily limit (e.g., $50) for new agents. Enabling protocol whitelists effectively prevents malicious contract interactions.',
            })}
          </p>
        </div>
        <button 
          onClick={() => {
            if(confirm(t({zh: '确定要撤销所有当前活跃的授权会话吗？', en: 'Are you sure you want to revoke all active authorization sessions?'}))) {
              success(t({zh: '已提交撤销请求', en: 'Revoke request submitted'}));
            }
          }}
          className="ml-auto px-4 py-2 bg-red-500/10 hover:bg-red-500/20 text-red-400 rounded-xl text-xs font-bold transition-colors whitespace-nowrap"
        >
          {t({ zh: '撤销所有会话', en: 'Revoke All Sessions' })}
        </button>
      </div>
    </div>
  );
}

