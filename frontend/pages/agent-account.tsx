import Head from 'next/head';
import React, { useState, useCallback, useEffect } from 'react';
import { Navigation } from '../components/ui/Navigation';
import { Footer } from '../components/layout/Footer';
import { AgentAccountCard } from '../components/agent-account/AgentAccountCard';
import { AgentOnboardingGuide } from '../components/agent-account/AgentOnboardingGuide';
import { agentAccountApi, AgentAccount, CreateAgentAccountRequest } from '../lib/api/agent-account.api';
import { useUser } from '../contexts/UserContext';

export default function AgentAccountPage() {
  const { isAuthenticated } = useUser();
  const [agents, setAgents] = useState<AgentAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState<CreateAgentAccountRequest>({
    name: '',
    description: '',
    agentType: 'personal',
    spendingLimits: { perTransaction: 100, daily: 500, monthly: 2000 },
  });
  const [creating, setCreating] = useState(false);

  const fetchAgents = useCallback(async () => {
    if (!isAuthenticated) return;
    setLoading(true);
    try {
      const data = await agentAccountApi.list();
      setAgents(data || []);
    } catch (err) {
      console.error('Failed to fetch agents:', err);
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated]);

  useEffect(() => {
    fetchAgents();
  }, [fetchAgents]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!createForm.name.trim()) return;
    setCreating(true);
    try {
      await agentAccountApi.create(createForm);
      setShowCreate(false);
      setCreateForm({ name: '', description: '', agentType: 'personal', spendingLimits: { perTransaction: 100, daily: 500, monthly: 2000 } });
      await fetchAgents();
    } catch (err: any) {
      alert(err.message || '创建失败');
    } finally {
      setCreating(false);
    }
  };

  const activeAgents = agents.filter(a => a.status === 'active');
  const hasAgent = agents.length > 0;
  const hasWallet = agents.some(a => a.linkedWalletAddress);
  const isOnChain = agents.some(a => a.isOnChain);

  const handleOnchainRegister = async () => {
    const agent = activeAgents[0];
    if (!agent) {
      alert('请先创建一个 Agent');
      return;
    }
    if (!confirm('确认进行链上注册？\n\n• Gas 费由平台承担，您无需支付\n• 注册后将获得 EAS 链上身份证书\n• 此操作不可逆')) return;
    try {
      await agentAccountApi.onchainRegister(agent.id);
      await fetchAgents();
    } catch (err: any) {
      alert(err.message || '注册失败');
    }
  };

  return (
    <>
      <Head>
        <title>Agent 账户管理 - Agentrix</title>
        <meta name="description" content="管理你的 AI Agent 账户：创建、配置、链上注册" />
      </Head>
      <Navigation />
      <main className="min-h-screen bg-gray-50">
        <div className="container mx-auto px-6 py-8 max-w-5xl">
          {/* Page Header */}
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Agent 账户</h1>
              <p className="text-sm text-gray-500 mt-1">
                管理你的 AI Agent，让它们成为真正的经济主体
              </p>
            </div>
            <button
              onClick={() => setShowCreate(true)}
              className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 transition-colors flex items-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
              创建 Agent
            </button>
          </div>

          {/* Onboarding Guide */}
          {isAuthenticated && (
            <AgentOnboardingGuide
              hasAgent={hasAgent}
              hasWallet={hasWallet}
              isOnChain={isOnChain}
              onCreateAgent={() => setShowCreate(true)}
              onRegisterOnchain={handleOnchainRegister}
            />
          )}

          {/* Not authenticated */}
          {!isAuthenticated && (
            <div className="text-center py-16 bg-white rounded-2xl border border-gray-200">
              <div className="w-16 h-16 rounded-full bg-blue-100 flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
              </div>
              <h2 className="text-xl font-bold text-gray-900 mb-2">请先登录</h2>
              <p className="text-gray-500 text-sm">登录后即可创建和管理 AI Agent 账户</p>
            </div>
          )}

          {/* Loading */}
          {isAuthenticated && loading && (
            <div className="text-center py-16">
              <div className="w-8 h-8 border-2 border-blue-200 border-t-blue-600 rounded-full animate-spin mx-auto mb-3" />
              <p className="text-gray-500 text-sm">加载中...</p>
            </div>
          )}

          {/* Agent list */}
          {isAuthenticated && !loading && agents.length > 0 && (
            <div className="grid gap-4 md:grid-cols-2">
              {agents.map((agent) => (
                <AgentAccountCard key={agent.id} agent={agent} onRefresh={fetchAgents} />
              ))}
            </div>
          )}

          {/* Empty state */}
          {isAuthenticated && !loading && agents.length === 0 && (
            <div className="text-center py-16 bg-white rounded-2xl border border-gray-200">
              <div className="w-16 h-16 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center mx-auto mb-4 text-2xl">
                🤖
              </div>
              <h2 className="text-xl font-bold text-gray-900 mb-2">还没有 Agent</h2>
              <p className="text-gray-500 text-sm mb-6 max-w-md mx-auto">
                创建第一个 AI Agent，让它代你管理资金、执行任务、参与 Agent 经济体
              </p>
              <button
                onClick={() => setShowCreate(true)}
                className="px-6 py-2.5 rounded-lg bg-blue-600 text-white font-medium hover:bg-blue-700 transition-colors"
              >
                创建第一个 Agent
              </button>
            </div>
          )}

          {/* Onchain Info Banner */}
          {isAuthenticated && !loading && agents.length > 0 && (
            <div className="mt-8 p-5 bg-white rounded-xl border border-gray-200">
              <h3 className="text-sm font-bold text-gray-900 mb-3">💡 关于链上身份</h3>
              <div className="grid md:grid-cols-3 gap-4 text-xs text-gray-600">
                <div className="flex gap-2">
                  <span className="text-blue-500 font-bold">ERC-8004</span>
                  <p>经济身份协议 — 定义 Agent 的支付能力和支出边界，部署在 BNB Testnet</p>
                </div>
                <div className="flex gap-2">
                  <span className="text-purple-500 font-bold">EAS</span>
                  <p>能力证书协议 — 为 Agent 的技能和信用生成可验证的链上证明</p>
                </div>
                <div className="flex gap-2">
                  <span className="text-green-500 font-bold">Gas 免费</span>
                  <p>所有链上操作的 Gas 费由平台 Relayer 代付，用户无需持有任何代币</p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Create Agent Modal */}
        {showCreate && (
          <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-bold text-gray-900">创建 Agent</h2>
                <button onClick={() => setShowCreate(false)} className="text-gray-400 hover:text-gray-600">
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              </div>
              <form onSubmit={handleCreate} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Agent 名称</label>
                  <input
                    type="text"
                    value={createForm.name}
                    onChange={(e) => setCreateForm(prev => ({ ...prev, name: e.target.value }))}
                    placeholder="例如: 我的增长助手"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    required
                    maxLength={150}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">描述（可选）</label>
                  <textarea
                    value={createForm.description || ''}
                    onChange={(e) => setCreateForm(prev => ({ ...prev, description: e.target.value }))}
                    placeholder="描述 Agent 的用途和能力"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    rows={2}
                    maxLength={500}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Agent 类型</label>
                  <select
                    value={createForm.agentType || 'personal'}
                    onChange={(e) => setCreateForm(prev => ({ ...prev, agentType: e.target.value as any }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  >
                    <option value="personal">个人助手</option>
                    <option value="merchant">商户 Agent</option>
                    <option value="third_party">第三方 Agent</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">日支出限额 (USDC)</label>
                  <input
                    type="number"
                    value={createForm.spendingLimits?.daily || 500}
                    onChange={(e) => setCreateForm(prev => ({
                      ...prev,
                      spendingLimits: { ...prev.spendingLimits!, daily: Number(e.target.value) },
                    }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    min={0}
                    max={100000}
                  />
                </div>

                {/* Auto provisions info */}
                <div className="p-3 bg-blue-50 rounded-lg text-xs text-blue-700 space-y-1">
                  <p className="font-medium">创建后将自动：</p>
                  <p>✅ 生成 MPC 托管钱包（无需手动操作）</p>
                  <p>✅ 分配虚拟资金账户</p>
                  <p>✅ 设置初始信用评分 500</p>
                  <p className="text-blue-500 mt-1">链上注册为可选步骤，可稍后在设置中操作</p>
                </div>

                <div className="flex gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowCreate(false)}
                    className="flex-1 px-4 py-2 rounded-lg border border-gray-300 text-gray-700 text-sm font-medium hover:bg-gray-50 transition-colors"
                  >
                    取消
                  </button>
                  <button
                    type="submit"
                    disabled={creating || !createForm.name.trim()}
                    className="flex-1 px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
                  >
                    {creating ? '创建中...' : '创建 Agent'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </main>
      <Footer />
    </>
  );
}
