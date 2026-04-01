'use client';

import React, { useState } from 'react';
import { AgentAccount, agentAccountApi } from '../../lib/api/agent-account.api';

interface Props {
  agent: AgentAccount;
  onRefresh: () => void;
}

const statusColors: Record<string, string> = {
  active: 'bg-green-100 text-green-700',
  draft: 'bg-gray-100 text-gray-600',
  suspended: 'bg-yellow-100 text-yellow-700',
  revoked: 'bg-red-100 text-red-700',
};

const riskColors: Record<string, string> = {
  low: 'text-green-600',
  medium: 'text-yellow-600',
  high: 'text-orange-600',
  critical: 'text-red-600',
};

export const AgentAccountCard: React.FC<Props> = ({ agent, onRefresh }) => {
  const [registering, setRegistering] = useState(false);
  const [showOnchainInfo, setShowOnchainInfo] = useState(false);
  const [onchainStatus, setOnchainStatus] = useState<any>(null);

  const handleOnchainRegister = async () => {
    if (!confirm('确认进行链上注册？\n\n• Gas 费由平台承担，您无需支付\n• 注册后将获得 EAS 链上身份证书\n• 此操作不可逆')) return;
    setRegistering(true);
    try {
      await agentAccountApi.onchainRegister(agent.id);
      onRefresh();
    } catch (err: any) {
      alert(err.message || '注册失败');
    } finally {
      setRegistering(false);
    }
  };

  const handleViewOnchain = async () => {
    try {
      const status = await agentAccountApi.getOnchainStatus(agent.id);
      setOnchainStatus(status);
      setShowOnchainInfo(true);
    } catch (err) {
      console.error(err);
    }
  };

  const creditLevel = agent.creditScore >= 950 ? 'Platinum' :
    agent.creditScore >= 800 ? 'Gold' :
    agent.creditScore >= 500 ? 'Silver' : 'Bronze';

  const creditBarWidth = Math.min(100, (agent.creditScore / 1000) * 100);

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm hover:shadow-md transition-shadow duration-200 overflow-hidden">
      {/* Header */}
      <div className="p-5 border-b border-gray-100">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white font-semibold text-sm">
              {agent.name.charAt(0).toUpperCase()}
            </div>
            <div>
              <h3 className="font-semibold text-gray-900">{agent.name}</h3>
              <p className="text-xs text-gray-500 font-mono">{agent.agentUniqueId}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {agent.isOnChain && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-blue-50 text-blue-600 text-xs font-medium">
                <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" /></svg>
                链上认证
              </span>
            )}
            <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusColors[agent.status] || 'bg-gray-100 text-gray-600'}`}>
              {agent.status === 'active' ? '活跃' : agent.status === 'suspended' ? '暂停' : agent.status === 'revoked' ? '已撤销' : '草稿'}
            </span>
          </div>
        </div>
        {agent.description && (
          <p className="text-sm text-gray-600 mt-2 line-clamp-2">{agent.description}</p>
        )}
      </div>

      {/* Stats */}
      <div className="px-5 py-3 grid grid-cols-3 gap-4 border-b border-gray-100 bg-gray-50/50">
        <div>
          <p className="text-xs text-gray-500">信用评分</p>
          <div className="flex items-center gap-2 mt-1">
            <span className="text-sm font-semibold text-gray-900">{agent.creditScore}</span>
            <span className={`text-xs font-medium ${riskColors[agent.riskLevel] || ''}`}>{creditLevel}</span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-1 mt-1">
            <div className="bg-gradient-to-r from-blue-500 to-green-500 h-1 rounded-full transition-all" style={{ width: `${creditBarWidth}%` }} />
          </div>
        </div>
        <div>
          <p className="text-xs text-gray-500">今日支出</p>
          <p className="text-sm font-semibold text-gray-900 mt-1">${agent.spentToday}</p>
          <p className="text-xs text-gray-400">/ ${agent.spendingLimits.daily} 限额</p>
        </div>
        <div>
          <p className="text-xs text-gray-500">类型</p>
          <p className="text-sm font-semibold text-gray-900 mt-1 capitalize">{agent.agentType}</p>
        </div>
      </div>

      {/* Actions */}
      <div className="px-5 py-3 flex items-center gap-2 flex-wrap">
        {agent.status === 'active' && !agent.isOnChain && (
          <button
            onClick={handleOnchainRegister}
            disabled={registering}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 text-white text-xs font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {registering ? (
              <><svg className="animate-spin h-3 w-3" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg> 注册中...</>
            ) : (
              <>🔗 链上注册 (免费)</>
            )}
          </button>
        )}
        {agent.isOnChain && (
          <button
            onClick={handleViewOnchain}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gray-100 text-gray-700 text-xs font-medium hover:bg-gray-200 transition-colors"
          >
            📋 查看链上身份
          </button>
        )}
        <button className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gray-100 text-gray-700 text-xs font-medium hover:bg-gray-200 transition-colors">
          ⚙️ 设置
        </button>
      </div>

      {/* Onchain Info Modal */}
      {showOnchainInfo && onchainStatus && (
        <div className="px-5 py-3 bg-blue-50 border-t border-blue-100">
          <div className="flex items-center justify-between mb-2">
            <h4 className="text-xs font-semibold text-blue-800">链上身份详情</h4>
            <button onClick={() => setShowOnchainInfo(false)} className="text-xs text-blue-600 hover:text-blue-800">关闭</button>
          </div>
          <div className="space-y-1 text-xs">
            {onchainStatus.easAttestationUid && (
              <p className="text-blue-700">EAS UID: <span className="font-mono">{onchainStatus.easAttestationUid.slice(0, 16)}...</span></p>
            )}
            {onchainStatus.erc8004SessionId && (
              <p className="text-blue-700">Session ID: <span className="font-mono">{onchainStatus.erc8004SessionId.slice(0, 16)}...</span></p>
            )}
            <p className="text-blue-700">链: {onchainStatus.chain || 'BSC Testnet'}</p>
            <p className="text-blue-600">✅ Gas 费由平台承担</p>
          </div>
        </div>
      )}
    </div>
  );
};
