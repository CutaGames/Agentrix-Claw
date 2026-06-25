'use client';

import React, { useState, useEffect } from 'react';
import { useLocalization } from '@/contexts/LocalizationContext';
import { apiClient } from '@/lib/api/client';
import {
  X,
  Package,
  DollarSign,
  Globe,
  Shield,
  BarChart3,
  Settings,
  TrendingUp,
  TrendingDown,
  Activity,
  Users,
  CheckCircle2,
  XCircle,
  Clock,
  Copy,
  Check,
  ExternalLink,
  Download,
  Trash2,
  Eye,
  EyeOff
} from 'lucide-react';
import type { SkillAsset } from './SkillAssetCard';

interface SkillDetailDrawerProps {
  skillId: string | null;
  isOpen: boolean;
  onClose: () => void;
  onUpdate?: () => void;
}

type TabType = 'overview' | 'pricing' | 'distribution' | 'ownership' | 'analytics' | 'settings';

export function SkillDetailDrawer({ skillId, isOpen, onClose, onUpdate }: SkillDetailDrawerProps) {
  const { t } = useLocalization();
  const [activeTab, setActiveTab] = useState<TabType>('overview');
  const [skill, setSkill] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [stats, setStats] = useState<any>(null);
  const [copiedText, setCopiedText] = useState<string | null>(null);

  useEffect(() => {
    if (skillId && isOpen) {
      fetchSkillDetail();
      fetchSkillStats();
    }
  }, [skillId, isOpen]);

  const fetchSkillDetail = async () => {
    if (!skillId) return;
    setLoading(true);
    try {
      const response = await apiClient.get<any>(`/skills/${skillId}`);
      setSkill(response.data);
    } catch (err) {
      console.error('Failed to fetch skill detail:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchSkillStats = async () => {
    if (!skillId) return;
    try {
      const response = await apiClient.get<any>(`/skills/${skillId}/stats`);
      setStats(response.data);
    } catch (err) {
      console.error('Failed to fetch skill stats:', err);
    }
  };

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedText(text);
    setTimeout(() => setCopiedText(null), 2000);
  };

  const handleUpdatePricing = async (pricingData: any) => {
    try {
      await apiClient.patch(`/skills/${skillId}/pricing`, pricingData);
      fetchSkillDetail();
      onUpdate?.();
    } catch (err) {
      console.error('Failed to update pricing:', err);
    }
  };

  const handleToggleStatus = async () => {
    try {
      const newStatus = skill.status === 'active' ? 'suspended' : 'active';
      await apiClient.patch(`/skills/${skillId}/status`, { status: newStatus });
      fetchSkillDetail();
      onUpdate?.();
    } catch (err) {
      console.error('Failed to toggle status:', err);
    }
  };

  const handleDelete = async () => {
    if (!confirm(t({ zh: '确定要删除此技能吗？此操作不可逆。', en: 'Delete this skill? This action cannot be undone.' }))) return;
    try {
      await apiClient.delete(`/skills/${skillId}`);
      onClose();
      onUpdate?.();
    } catch (err) {
      console.error('Failed to delete skill:', err);
    }
  };

  if (!isOpen || !skillId) return null;

  const tabs = [
    { id: 'overview', label: t({ zh: '概览', en: 'Overview' }), icon: Package },
    { id: 'pricing', label: t({ zh: '商业与定价', en: 'Pricing' }), icon: DollarSign },
    { id: 'distribution', label: t({ zh: '分发渠道', en: 'Distribution' }), icon: Globe },
    { id: 'ownership', label: t({ zh: '确权与授权', en: 'Ownership' }), icon: Shield },
    { id: 'analytics', label: t({ zh: '数据与分析', en: 'Analytics' }), icon: BarChart3 },
    { id: 'settings', label: t({ zh: '设置', en: 'Settings' }), icon: Settings },
  ];

  return (
    <div className="fixed inset-0 z-50 overflow-hidden">
      {/* Overlay */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      {/* Drawer */}
      <div className="absolute right-0 top-0 h-full w-full max-w-4xl bg-slate-900 shadow-2xl flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-lg bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center">
              <Package className="w-6 h-6 text-white" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-white">{skill?.name || t({ zh: '技能详情', en: 'Skill Details' })}</h2>
              <p className="text-sm text-slate-400">{skill?.id}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-1 px-6 py-3 border-b border-slate-800 overflow-x-auto">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as TabType)}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${
                  activeTab === tab.id
                    ? 'bg-blue-600 text-white'
                    : 'text-slate-400 hover:text-white hover:bg-slate-800'
                }`}
              >
                <Icon className="w-4 h-4" />
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {loading ? (
            <div className="flex items-center justify-center h-64">
              <Activity className="w-8 h-8 animate-spin text-blue-500" />
            </div>
          ) : (
            <>
              {activeTab === 'overview' && <OverviewTab skill={skill} stats={stats} onCopy={handleCopy} copiedText={copiedText} />}
              {activeTab === 'pricing' && <PricingTab skill={skill} onUpdate={handleUpdatePricing} />}
              {activeTab === 'distribution' && <DistributionTab skill={skill} onCopy={handleCopy} copiedText={copiedText} />}
              {activeTab === 'ownership' && <OwnershipTab skill={skill} />}
              {activeTab === 'analytics' && <AnalyticsTab skillId={skillId} stats={stats} />}
              {activeTab === 'settings' && <SettingsTab skill={skill} onToggleStatus={handleToggleStatus} onDelete={handleDelete} />}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// Overview Tab
function OverviewTab({ skill, stats, onCopy, copiedText }: any) {
  const { t } = useLocalization();

  return (
    <div className="space-y-6">
      {/* Status */}
      <div>
        <h3 className="text-lg font-semibold text-white mb-3">{t({ zh: '状态', en: 'Status' })}</h3>
        <div className="p-4 bg-slate-800/50 rounded-xl border border-slate-700">
          <div className="flex items-center justify-between">
            <span className="text-slate-400">{t({ zh: '当前状态', en: 'Current Status' })}</span>
            <span className={`px-3 py-1 rounded-full text-sm font-medium ${
              skill?.status === 'active' ? 'bg-green-500/10 text-green-400' : 'bg-slate-700 text-slate-400'
            }`}>
              {skill?.status}
            </span>
          </div>
        </div>
      </div>

      {/* Current Pricing */}
      <div>
        <h3 className="text-lg font-semibold text-white mb-3">{t({ zh: '当前定价', en: 'Current Pricing' })}</h3>
        <div className="p-4 bg-slate-800/50 rounded-xl border border-slate-700">
          <div className="flex items-center justify-between">
            <span className="text-slate-400">{t({ zh: '价格', en: 'Price' })}</span>
            <span className="text-2xl font-bold text-white">
              ${skill?.price?.toFixed(2) || '0.00'} / {skill?.pricingType === 'per_call' ? 'call' : 'mo'}
            </span>
          </div>
          <div className="mt-3 pt-3 border-t border-slate-700 text-xs text-slate-500">
            {t({ zh: '平台收取 10% 服务费', en: 'Platform takes 10% service fee' })}
          </div>
        </div>
      </div>

      {/* 30-Day Trends */}
      <div>
        <h3 className="text-lg font-semibold text-white mb-3">{t({ zh: '30天趋势', en: '30-Day Trends' })}</h3>
        <div className="grid grid-cols-2 gap-4">
          <div className="p-4 bg-slate-800/50 rounded-xl border border-slate-700">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-slate-400">{t({ zh: '调用次数', en: 'Calls' })}</span>
              <TrendingUp className="w-4 h-4 text-green-400" />
            </div>
            <div className="text-2xl font-bold text-white">{stats?.calls30d || 0}</div>
          </div>
          <div className="p-4 bg-slate-800/50 rounded-xl border border-slate-700">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-slate-400">{t({ zh: '收入', en: 'Revenue' })}</span>
              <TrendingUp className="w-4 h-4 text-green-400" />
            </div>
            <div className="text-2xl font-bold text-green-400">${stats?.revenue30d?.toFixed(2) || '0.00'}</div>
          </div>
        </div>
      </div>

      {/* Skill ID */}
      <div>
        <h3 className="text-lg font-semibold text-white mb-3">{t({ zh: '技能ID', en: 'Skill ID' })}</h3>
        <div className="flex items-center gap-2">
          <code className="flex-1 px-3 py-2 bg-slate-800 rounded-lg text-sm text-slate-300 font-mono">
            {skill?.id}
          </code>
          <button
            onClick={() => onCopy(skill?.id)}
            className="p-2 text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg transition-colors"
          >
            {copiedText === skill?.id ? <Check className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4" />}
          </button>
        </div>
      </div>
    </div>
  );
}

// Pricing Tab
function PricingTab({ skill, onUpdate }: any) {
  const { t } = useLocalization();
  const [price, setPrice] = useState(skill?.price || 0);
  const [pricingType, setPricingType] = useState(skill?.pricingType || 'per_call');

  return (
    <div className="space-y-6">
      <h3 className="text-lg font-semibold text-white">{t({ zh: '修改定价模式', en: 'Modify Pricing' })}</h3>
      
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-slate-400 mb-2">
            {t({ zh: '定价类型', en: 'Pricing Type' })}
          </label>
          <select
            value={pricingType}
            onChange={(e) => setPricingType(e.target.value)}
            className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-blue-500"
          >
            <option value="free">{t({ zh: '免费', en: 'Free' })}</option>
            <option value="per_call">{t({ zh: '按次付费', en: 'Per Call' })}</option>
            <option value="subscription">{t({ zh: '订阅制', en: 'Subscription' })}</option>
          </select>
        </div>

        {pricingType !== 'free' && (
          <div>
            <label className="block text-sm font-medium text-slate-400 mb-2">
              {t({ zh: '价格 (USD)', en: 'Price (USD)' })}
            </label>
            <input
              type="number"
              step="0.01"
              value={price}
              onChange={(e) => setPrice(parseFloat(e.target.value))}
              className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-blue-500"
            />
          </div>
        )}

        <div className="p-4 bg-blue-500/10 border border-blue-500/20 rounded-lg">
          <div className="flex items-start gap-2">
            <Shield className="w-5 h-5 text-blue-400 mt-0.5" />
            <div className="text-sm text-slate-300">
              <p className="font-medium mb-1">{t({ zh: '分佣说明', en: 'Commission' })}</p>
              <p className="text-slate-400">{t({ zh: '平台统一收取 10% 服务费，用于结算与分发', en: 'Platform takes 10% service fee for settlement and distribution' })}</p>
            </div>
          </div>
        </div>

        <button
          onClick={() => onUpdate({ price, pricingType })}
          className="w-full px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors"
        >
          {t({ zh: '保存修改', en: 'Save Changes' })}
        </button>
      </div>
    </div>
  );
}

// Distribution Tab
function DistributionTab({ skill, onCopy, copiedText }: any) {
  const { t } = useLocalization();

  const protocols = [
    { name: 'Claude Skills Registry', key: 'mcp', endpoint: `/api/mcp/skills/${skill?.id}`, enabled: true },
    { name: 'ChatGPT / GPTs', key: 'acp', endpoint: `/api/acp/skills/${skill?.id}`, enabled: true },
    { name: 'Google UCP', key: 'ucp', endpoint: `/api/ucp/skills/${skill?.id}`, enabled: true },
    { name: 'Agentrix Marketplace', key: 'marketplace', endpoint: `/marketplace/skills/${skill?.id}`, enabled: true },
  ];

  return (
    <div className="space-y-6">
      <h3 className="text-lg font-semibold text-white">{t({ zh: '分发渠道', en: 'Distribution Channels' })}</h3>
      
      <div className="space-y-3">
        {protocols.map((protocol) => (
          <div key={protocol.key} className="p-4 bg-slate-800/50 rounded-xl border border-slate-700">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-3">
                <Globe className="w-5 h-5 text-blue-400" />
                <span className="font-medium text-white">{protocol.name}</span>
              </div>
              <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                protocol.enabled ? 'bg-green-500/10 text-green-400' : 'bg-slate-700 text-slate-400'
              }`}>
                {protocol.enabled ? t({ zh: '已接入', en: 'Connected' }) : t({ zh: '待接入', en: 'Pending' })}
              </span>
            </div>
            {protocol.enabled && (
              <div className="flex items-center gap-2">
                <code className="flex-1 px-3 py-2 bg-slate-900 rounded text-xs text-slate-400 font-mono truncate">
                  {`${window.location.origin}${protocol.endpoint}`}
                </code>
                <button
                  onClick={() => onCopy(`${window.location.origin}${protocol.endpoint}`)}
                  className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-700 rounded transition-colors"
                >
                  {copiedText === `${window.location.origin}${protocol.endpoint}` ? 
                    <Check className="w-4 h-4 text-green-400" /> : 
                    <Copy className="w-4 h-4" />
                  }
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// Ownership Tab
function OwnershipTab({ skill }: any) {
  const { t } = useLocalization();

  return (
    <div className="space-y-6">
      <h3 className="text-lg font-semibold text-white">{t({ zh: '确权与授权', en: 'Ownership & Authorization' })}</h3>
      
      <div className="p-4 bg-slate-800/50 rounded-xl border border-slate-700">
        <div className="flex items-start gap-3 mb-4">
          <Shield className="w-6 h-6 text-purple-400 mt-1" />
          <div>
            <h4 className="font-medium text-white mb-1">{t({ zh: 'Capability NFT 状态', en: 'Capability NFT Status' })}</h4>
            <p className="text-sm text-slate-400">{t({ zh: '暂未铸造', en: 'Not minted yet' })}</p>
          </div>
        </div>
        <button className="w-full px-4 py-2 bg-purple-600/20 hover:bg-purple-600/30 text-purple-400 rounded-lg font-medium transition-colors">
          {t({ zh: '铸造 NFT', en: 'Mint NFT' })}
        </button>
      </div>

      <div>
        <h4 className="text-sm font-medium text-slate-400 mb-3">{t({ zh: '授权方式', en: 'Authorization' })}</h4>
        <div className="space-y-2">
          <label className="flex items-center gap-3 p-3 bg-slate-800/50 rounded-lg cursor-pointer hover:bg-slate-800">
            <input type="radio" name="auth" defaultChecked className="text-blue-600" />
            <span className="text-white">{t({ zh: '仅本人使用', en: 'Personal use only' })}</span>
          </label>
          <label className="flex items-center gap-3 p-3 bg-slate-800/50 rounded-lg cursor-pointer hover:bg-slate-800">
            <input type="radio" name="auth" className="text-blue-600" />
            <span className="text-white">{t({ zh: '授权 Agent 使用', en: 'Authorize agents' })}</span>
          </label>
          <label className="flex items-center gap-3 p-3 bg-slate-800/50 rounded-lg cursor-pointer hover:bg-slate-800 opacity-50">
            <input type="radio" name="auth" disabled className="text-blue-600" />
            <span className="text-white">{t({ zh: '授权第三方转售（即将推出）', en: 'License for resale (Coming soon)' })}</span>
          </label>
        </div>
      </div>
    </div>
  );
}

// Analytics Tab
function AnalyticsTab({ skillId, stats }: any) {
  const { t } = useLocalization();

  const topCallers = [
    { name: 'Shopping Assistant', calls: 1240, revenue: 62.0 },
    { name: 'Travel Planner', calls: 890, revenue: 44.5 },
    { name: 'Personal Finance', calls: 560, revenue: 28.0 },
  ];

  return (
    <div className="space-y-6">
      <h3 className="text-lg font-semibold text-white">{t({ zh: '数据与分析', en: 'Analytics' })}</h3>
      
      {/* Top Calling Agents */}
      <div>
        <h4 className="text-sm font-medium text-slate-400 mb-3">{t({ zh: '调用来源 Agent 排名', en: 'Top Calling Agents' })}</h4>
        <div className="space-y-2">
          {topCallers.map((agent, i) => (
            <div key={i} className="flex items-center justify-between p-3 bg-slate-800/50 rounded-lg">
              <div className="flex items-center gap-3">
                <span className="w-6 h-6 flex items-center justify-center bg-slate-700 rounded-full text-xs font-bold text-slate-300">
                  {i + 1}
                </span>
                <span className="text-white">{agent.name}</span>
              </div>
              <div className="flex items-center gap-4 text-sm">
                <span className="text-slate-400">{agent.calls} calls</span>
                <span className="text-green-400">${agent.revenue.toFixed(2)}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Revenue Sources */}
      <div>
        <h4 className="text-sm font-medium text-slate-400 mb-3">{t({ zh: '收入来源占比', en: 'Revenue Sources' })}</h4>
        <div className="space-y-2">
          <div className="flex items-center gap-3">
            <div className="flex-1 h-2 bg-slate-800 rounded-full overflow-hidden">
              <div className="h-full bg-blue-500" style={{ width: '65%' }} />
            </div>
            <span className="text-sm text-slate-400 w-16 text-right">65%</span>
          </div>
          <p className="text-xs text-slate-500">{t({ zh: '付费调用', en: 'Paid calls' })}</p>
        </div>
      </div>
    </div>
  );
}

// Settings Tab
function SettingsTab({ skill, onToggleStatus, onDelete }: any) {
  const { t } = useLocalization();

  return (
    <div className="space-y-6">
      <h3 className="text-lg font-semibold text-white">{t({ zh: '设置', en: 'Settings' })}</h3>
      
      {/* Status Control */}
      <div className="p-4 bg-slate-800/50 rounded-xl border border-slate-700">
        <div className="flex items-center justify-between mb-2">
          <div>
            <h4 className="font-medium text-white">{t({ zh: '技能状态', en: 'Skill Status' })}</h4>
            <p className="text-sm text-slate-400 mt-1">
              {skill?.status === 'active' 
                ? t({ zh: '技能当前可被调用', en: 'Skill is currently callable' })
                : t({ zh: '技能已暂停', en: 'Skill is suspended' })
              }
            </p>
          </div>
          <button
            onClick={onToggleStatus}
            className={`px-4 py-2 rounded-lg font-medium transition-colors ${
              skill?.status === 'active'
                ? 'bg-orange-600/20 text-orange-400 hover:bg-orange-600/30'
                : 'bg-green-600/20 text-green-400 hover:bg-green-600/30'
            }`}
          >
            {skill?.status === 'active' ? t({ zh: '下线', en: 'Suspend' }) : t({ zh: '重新发布', en: 'Republish' })}
          </button>
        </div>
      </div>

      {/* Danger Zone */}
      <div className="p-4 bg-red-500/10 rounded-xl border border-red-500/20">
        <h4 className="font-medium text-red-400 mb-3">{t({ zh: '危险操作', en: 'Danger Zone' })}</h4>
        <button
          onClick={onDelete}
          className="w-full px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg font-medium transition-colors flex items-center justify-center gap-2"
        >
          <Trash2 className="w-4 h-4" />
          {t({ zh: '删除技能', en: 'Delete Skill' })}
        </button>
        <p className="text-xs text-slate-500 mt-2">
          {t({ zh: '注意：只有未产生交易的技能才能被删除', en: 'Note: Only skills without transactions can be deleted' })}
        </p>
      </div>
    </div>
  );
}

export default SkillDetailDrawer;
