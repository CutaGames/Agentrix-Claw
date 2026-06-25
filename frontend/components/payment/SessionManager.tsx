'use client';

import React, { useState } from 'react';
import {
  ShieldCheck,
  Zap,
  X,
  Calendar,
  DollarSign,
  TrendingUp,
  Loader2,
  Clock,
  Lock,
  Activity,
  ChevronRight,
} from 'lucide-react';
import { useSessionManager } from '@/hooks/useSessionManager';
import { useWeb3 } from '@/contexts/Web3Context';

interface SessionManagerProps {
  onClose?: () => void;
}

export function SessionManager({ onClose }: SessionManagerProps) {
  const { isConnected } = useWeb3();
  const { 
    sessions, 
    loading, 
    createSession, 
    revokeSession, 
  } = useSessionManager();
  
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [formData, setFormData] = useState({
    singleLimit: 10,
    dailyLimit: 100,
    expiryDays: 30,
    agentId: '',
  });

  const handleCreateSession = async () => {
    try {
      await createSession({
        singleLimit: formData.singleLimit,
        dailyLimit: formData.dailyLimit,
        expiryDays: formData.expiryDays,
        agentId: formData.agentId || undefined,
      });
      setShowCreateModal(false);
      // 立即刷新页面以确保session被正确加载
      if (typeof window !== 'undefined') {
        window.location.reload();
      }
    } catch (error: any) {
      console.error('Failed to create session:', error);
      alert(error.message || 'Failed to create session');
    }
  };

  const handleRevokeSession = async (sessionId: string) => {
    if (!confirm('Are you sure you want to revoke this authorization? This will also revoke USDT allowance on-chain.')) {
      return;
    }
    try {
      await revokeSession(sessionId);
    } catch (error: any) {
      console.error('Failed to revoke session:', error);
      alert(error.message || 'Failed to revoke session');
    }
  };

  return (
    <div className="w-full max-w-4xl bg-slate-900 rounded-3xl shadow-2xl overflow-hidden border border-white/5 font-sans">
      {/* 头部 */}
      <div className="bg-gradient-to-r from-blue-600 to-indigo-600 px-6 py-6 text-white text-left">
        <div className="flex justify-between items-center mb-4">
          <div>
            <h2 className="text-2xl font-bold mb-1">Agent Authorization</h2>
            <p className="text-blue-100 text-sm opacity-80">Manage your X402 Session Keys & Payment Flows</p>
          </div>
          {onClose && (
            <button
              onClick={onClose}
              className="p-2 hover:bg-white/10 rounded-lg transition-colors"
            >
              <X size={20} />
            </button>
          )}
        </div>

        <button
          onClick={() => setShowCreateModal(true)}
          disabled={!isConnected || loading}
          className="bg-white text-blue-600 px-5 py-2.5 rounded-xl font-bold hover:bg-blue-50 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 active:scale-95 shadow-lg shadow-white/10"
        >
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap size={16} />}
          Create New Session
        </button>
      </div>

      {/* 内容区 */}
      <div className="p-6 bg-slate-900/50">
        {loading && sessions.length === 0 ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="animate-spin h-10 w-10 text-blue-500" />
          </div>
        ) : sessions.length === 0 ? (
          <div className="text-center py-16 border-2 border-dashed border-white/5 rounded-3xl">
            <ShieldCheck className="mx-auto text-slate-800 mb-4" size={56} />
            <div className="text-slate-300 font-bold text-lg mb-2">No active sessions</div>
            <div className="text-sm text-slate-500">
              Authorize an agent to enable seamless trading and QuickPay
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-5 text-left">
            {sessions.map((session) => (
              <div
                key={session.id}
                className="border border-white/5 rounded-2xl p-5 hover:border-blue-500/30 transition-all bg-slate-800/50 group"
              >
                <div className="flex justify-between items-start mb-5">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 bg-blue-500/10 rounded-xl flex items-center justify-center border border-blue-500/20 group-hover:scale-105 transition-transform">
                      <ShieldCheck size={24} className="text-blue-500" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-white text-lg">
                          {session.agentId || 'Global / General Purpose'}
                        </span>
                        <span className="px-2 py-0.5 bg-slate-700/50 text-slate-400 text-[10px] font-mono rounded-lg border border-white/5 tracking-tight">
                          {session.signer.slice(0, 6)}...{session.signer.slice(-4)}
                        </span>
                      </div>
                      <div className="text-xs text-slate-500 flex items-center gap-1.5 mt-1">
                        <Clock size={12} className="text-slate-600" />
                        Expires {new Date(session.expiry).toLocaleDateString()}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {session.isActive ? (
                      <div className="flex items-center gap-1.5 px-3 py-1 bg-emerald-500/10 text-emerald-400 text-xs rounded-full font-bold border border-emerald-500/20">
                        <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse"></div>
                        ACTIVE
                      </div>
                    ) : (
                      <div className="flex items-center gap-1.5 px-3 py-1 bg-slate-700 text-slate-400 text-xs rounded-full font-bold">
                        REVOKED
                      </div>
                    )}
                    {session.isActive && (
                      <button
                        onClick={() => handleRevokeSession(session.sessionId)}
                        className="flex items-center gap-1.5 px-3 py-1 bg-red-500/10 hover:bg-red-500/20 text-red-400 text-xs rounded-full font-bold transition-all border border-red-500/10 hover:border-red-500/30"
                        title="Revoke Session"
                      >
                        <X size={14} />
                        REVOKE
                      </button>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-6">
                  <div className="bg-black/20 rounded-2xl p-4 border border-white/5">
                    <div className="text-[10px] text-slate-500 mb-1.5 font-bold uppercase tracking-wider flex items-center gap-1.5">
                      <Lock size={12} className="text-blue-400" />
                      Single Limit
                    </div>
                    <div className="font-bold text-white text-lg">
                      ${session.singleLimit.toFixed(2)}
                    </div>
                  </div>
                  <div className="bg-black/20 rounded-2xl p-4 border border-white/5">
                    <div className="text-[10px] text-slate-500 mb-1.5 font-bold uppercase tracking-wider flex items-center gap-1.5">
                      <Activity size={12} className="text-emerald-400" />
                      Daily Limit
                    </div>
                    <div className="font-bold text-white text-lg">
                      ${session.dailyLimit.toFixed(2)}
                    </div>
                  </div>
                  <div className="bg-black/20 rounded-2xl p-4 border border-white/5">
                    <div className="text-[10px] text-slate-500 mb-1.5 font-bold uppercase tracking-wider flex items-center gap-1.5">
                      <TrendingUp size={12} className="text-indigo-400" />
                      Used Today
                    </div>
                    <div className="font-bold text-blue-400 text-lg">
                      ${session.usedToday.toFixed(2)}
                    </div>
                  </div>
                </div>

                {/* Progress Bar for Daily Limit */}
                <div className="space-y-2">
                  <div className="flex justify-between text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                    <span>Daily Usage Progress</span>
                    <span>{Math.min(100, (session.usedToday / session.dailyLimit) * 100).toFixed(1)}%</span>
                  </div>
                  <div className="w-full h-2 bg-slate-700 rounded-full overflow-hidden">
                    <div 
                      className={`h-full transition-all duration-700 ease-out ${
                        (session.usedToday / session.dailyLimit) > 0.8 ? 'bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.5)]' : 'bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.5)]'
                      }`}
                      style={{ width: `${Math.min(100, (session.usedToday / session.dailyLimit) * 100)}%` }}
                    ></div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 创建 Session Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-md flex items-center justify-center z-[100] p-4">
          <div className="bg-slate-900 border border-white/10 rounded-3xl p-8 max-w-md w-full shadow-2xl shadow-blue-500/10">
            <div className="flex justify-between items-center mb-8">
              <div>
                <h3 className="text-2xl font-bold text-white">New Authorization</h3>
                <p className="text-slate-500 text-sm mt-1">Set spending boundaries for your Agent</p>
              </div>
              <button 
                onClick={() => setShowCreateModal(false)} 
                className="w-10 h-10 flex items-center justify-center bg-white/5 hover:bg-white/10 rounded-xl text-slate-400 hover:text-white transition-all"
              >
                <X size={20} />
              </button>
            </div>

            <div className="space-y-6 text-left">
              <div>
                <label className="block text-sm font-bold text-slate-400 mb-2 uppercase tracking-tight">
                  Single Transaction Limit (USDT)
                </label>
                <div className="relative">
                  <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 font-bold">$</div>
                  <input
                    type="number"
                    value={formData.singleLimit}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        singleLimit: Math.max(parseFloat(e.target.value) || 0, 0.0001),
                      })
                    }
                    className="w-full bg-black/30 border border-white/10 rounded-xl pl-8 pr-4 py-3 text-white focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none transition-all font-bold"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-bold text-slate-400 mb-2 uppercase tracking-tight">
                  Daily Total Limit (USDT)
                </label>
                <div className="relative">
                  <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 font-bold">$</div>
                  <input
                    type="number"
                    value={formData.dailyLimit}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        dailyLimit: Math.max(parseFloat(e.target.value) || 0, 0.001),
                      })
                    }
                    className="w-full bg-black/30 border border-white/10 rounded-xl pl-8 pr-4 py-3 text-white focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none transition-all font-bold"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-bold text-slate-400 mb-2 uppercase tracking-tight">
                  Expiry Period (Days)
                </label>
                <input
                  type="number"
                  value={formData.expiryDays}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      expiryDays: Math.max(parseInt(e.target.value) || 1, 1),
                    })
                  }
                  className="w-full bg-black/30 border border-white/10 rounded-xl px-4 py-3 text-white focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none transition-all font-bold"
                />
              </div>

              <div className="pt-6">
                <button
                  onClick={handleCreateSession}
                  disabled={loading}
                  className="w-full bg-blue-600 text-white py-4 rounded-2xl font-bold hover:bg-blue-700 transition-all disabled:opacity-50 flex items-center justify-center gap-3 active:scale-95 shadow-lg shadow-blue-600/20"
                >
                  {loading ? <Loader2 className="w-6 h-6 animate-spin" /> : <Zap size={22} />}
                  Authorize & Create Session
                </button>
                <div className="flex items-start gap-2 mt-4 p-3 bg-blue-500/5 rounded-xl border border-blue-500/10">
                  <ShieldCheck size={14} className="text-blue-400 mt-0.5" />
                  <p className="text-[10px] text-slate-500 leading-relaxed">
                    This will require a wallet signature to register the session and authorize the smart protocol to manage USDT within these bounds.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
