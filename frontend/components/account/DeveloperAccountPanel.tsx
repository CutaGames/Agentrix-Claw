'use client';

import React, { useState, useEffect } from 'react';
import { 
  Code, 
  Key, 
  TrendingUp, 
  Zap,
  Clock,
  CheckCircle2,
  AlertCircle,
  Plus,
  ExternalLink,
  Shield,
  BarChart3,
  Loader2,
  RefreshCw
} from 'lucide-react';
import { useLocalization } from '../../contexts/LocalizationContext';
import { developerAccountApi, DeveloperAccount, DeveloperTier, DeveloperAccountStatus } from '../../lib/api/developer-account.api';

interface DeveloperAccountPanelProps {
  onCreateApiKey?: () => void;
  onUpgradeTier?: () => void;
}

// Tier 配置
const tierConfig: Record<DeveloperTier, { label: string; color: string; limits: { apiKeys: number; rateLimit: number; skills: number } }> = {
  [DeveloperTier.STARTER]: { 
    label: 'Starter', 
    color: 'text-slate-400 bg-slate-500/10', 
    limits: { apiKeys: 3, rateLimit: 100, skills: 10 } 
  },
  [DeveloperTier.PROFESSIONAL]: { 
    label: 'Professional', 
    color: 'text-blue-400 bg-blue-500/10', 
    limits: { apiKeys: 10, rateLimit: 500, skills: 50 } 
  },
  [DeveloperTier.ENTERPRISE]: { 
    label: 'Enterprise', 
    color: 'text-purple-400 bg-purple-500/10', 
    limits: { apiKeys: 50, rateLimit: 2000, skills: 200 } 
  },
  [DeveloperTier.PARTNER]: { 
    label: 'Partner', 
    color: 'text-amber-400 bg-amber-500/10', 
    limits: { apiKeys: -1, rateLimit: -1, skills: -1 } 
  },
};

const statusConfig: Record<DeveloperAccountStatus, { label: string; color: string; icon: any }> = {
  [DeveloperAccountStatus.PENDING]: { label: '待审核', color: 'text-yellow-400', icon: Clock },
  [DeveloperAccountStatus.ACTIVE]: { label: '已激活', color: 'text-emerald-400', icon: CheckCircle2 },
  [DeveloperAccountStatus.SUSPENDED]: { label: '已暂停', color: 'text-orange-400', icon: AlertCircle },
  [DeveloperAccountStatus.REVOKED]: { label: '已撤销', color: 'text-red-400', icon: AlertCircle },
  [DeveloperAccountStatus.BANNED]: { label: '已封禁', color: 'text-red-600', icon: AlertCircle },
};

const DeveloperAccountPanel: React.FC<DeveloperAccountPanelProps> = ({
  onCreateApiKey,
  onUpgradeTier,
}) => {
  const { t } = useLocalization();
  const [account, setAccount] = useState<DeveloperAccount | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadAccount();
  }, []);

  const loadAccount = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await developerAccountApi.getMyAccount();
      setAccount(data);
    } catch (err: any) {
      setError(err.message || '加载开发者账户失败');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6 text-center">
        <AlertCircle className="w-12 h-12 text-red-400 mx-auto mb-4" />
        <p className="text-red-400 mb-4">{error}</p>
        <button 
          onClick={loadAccount}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
        >
          {t({ zh: '重试', en: 'Retry' })}
        </button>
      </div>
    );
  }

  if (!account) {
    return (
      <div className="p-6 text-center">
        <Code className="w-16 h-16 text-slate-600 mx-auto mb-4" />
        <h3 className="text-xl font-bold text-white mb-2">{t({ zh: '开通开发者账户', en: 'Create Developer Account' })}</h3>
        <p className="text-slate-400 mb-6 max-w-md mx-auto">
          {t({ zh: '创建开发者账户以获取 API 访问权限，发布技能并赚取收益', en: 'Create a developer account to get API access, publish skills and earn revenue' })}
        </p>
        <button 
          onClick={() => {/* TODO: Open create account modal */}}
          className="px-6 py-3 bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 text-white font-bold rounded-xl transition-all shadow-lg"
        >
          <Plus className="inline w-5 h-5 mr-2" />
          {t({ zh: '立即开通', en: 'Get Started' })}
        </button>
      </div>
    );
  }

  const tier = tierConfig[account.tier];
  const status = statusConfig[account.status];
  const StatusIcon = status.icon;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-white">{t({ zh: '开发者账户', en: 'Developer Account' })}</h2>
          <p className="text-slate-400 text-sm mt-1">{t({ zh: '管理 API 密钥、查看用量和收益', en: 'Manage API keys, view usage and revenue' })}</p>
        </div>
        <button 
          onClick={loadAccount}
          className="p-2 hover:bg-white/5 rounded-lg transition-colors"
        >
          <RefreshCw className="w-5 h-5 text-slate-400" />
        </button>
      </div>

      {/* Account Overview Card */}
      <div className="bg-gradient-to-br from-purple-900/30 to-blue-900/30 border border-purple-500/20 rounded-2xl p-6">
        <div className="flex items-start justify-between mb-6">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-2xl bg-purple-500/20 flex items-center justify-center">
              <Code className="w-8 h-8 text-purple-400" />
            </div>
            <div>
              <h3 className="text-xl font-bold text-white">{account.name || account.id}</h3>
              <div className="flex items-center gap-3 mt-1">
                <span className={`px-2 py-0.5 rounded text-xs font-bold ${tier.color}`}>
                  {tier.label}
                </span>
                <span className={`flex items-center gap-1 text-sm ${status.color}`}>
                  <StatusIcon className="w-4 h-4" />
                  {status.label}
                </span>
              </div>
            </div>
          </div>
          {account.tier !== DeveloperTier.PARTNER && (
            <button 
              onClick={onUpgradeTier}
              className="px-4 py-2 bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 text-white text-sm font-bold rounded-lg transition-all"
            >
              {t({ zh: '升级套餐', en: 'Upgrade' })}
            </button>
          )}
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-black/20 rounded-xl p-4">
            <div className="flex items-center gap-2 text-slate-400 text-sm mb-2">
              <Key className="w-4 h-4" />
              {t({ zh: 'API 密钥', en: 'API Keys' })}
            </div>
            <p className="text-2xl font-bold text-white">
              {account.currentApiKeyCount || 0}
              <span className="text-sm text-slate-500 font-normal">
                /{tier.limits.apiKeys === -1 ? '∞' : account.maxApiKeys || tier.limits.apiKeys}
              </span>
            </p>
          </div>
          <div className="bg-black/20 rounded-xl p-4">
            <div className="flex items-center gap-2 text-slate-400 text-sm mb-2">
              <Zap className="w-4 h-4" />
              {t({ zh: '已发布技能', en: 'Published Skills' })}
            </div>
            <p className="text-2xl font-bold text-white">
              {account.publishedSkillCount || 0}
              <span className="text-sm text-slate-500 font-normal">
                /{tier.limits.skills === -1 ? '∞' : tier.limits.skills}
              </span>
            </p>
          </div>
          <div className="bg-black/20 rounded-xl p-4">
            <div className="flex items-center gap-2 text-slate-400 text-sm mb-2">
              <BarChart3 className="w-4 h-4" />
              {t({ zh: '本月调用', en: 'Monthly Calls' })}
            </div>
            <p className="text-2xl font-bold text-white">
              {(account.monthApiCalls || 0).toLocaleString()}
            </p>
          </div>
          <div className="bg-black/20 rounded-xl p-4">
            <div className="flex items-center gap-2 text-slate-400 text-sm mb-2">
              <TrendingUp className="w-4 h-4" />
              {t({ zh: '累计收益', en: 'Total Revenue' })}
            </div>
            <p className="text-2xl font-bold text-emerald-400">
              ${(account.totalRevenue || 0).toFixed(2)}
            </p>
          </div>
        </div>
      </div>

      {/* API Keys Section */}
      <div className="bg-slate-900/50 border border-white/5 rounded-2xl overflow-hidden">
        <div className="flex items-center justify-between p-4 border-b border-white/5">
          <h3 className="font-bold text-white flex items-center gap-2">
            <Key className="w-5 h-5 text-blue-400" />
            {t({ zh: 'API 密钥', en: 'API Keys' })}
          </h3>
          <button 
            onClick={onCreateApiKey}
            className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded-lg transition-colors flex items-center gap-1"
          >
            <Plus className="w-4 h-4" />
            {t({ zh: '创建密钥', en: 'Create Key' })}
          </button>
        </div>

        {account.currentApiKeyCount > 0 ? (
          <div className="divide-y divide-white/5">
            {/* API Keys would be fetched separately */}
            <div className="p-4">
              <p className="text-slate-400">{t({ zh: '您有', en: 'You have' })} {account.currentApiKeyCount} {t({ zh: '个 API 密钥', en: 'API keys' })}</p>
              <button 
                onClick={onCreateApiKey}
                className="mt-2 text-blue-400 hover:text-blue-300 text-sm"
              >
                {t({ zh: '管理密钥 →', en: 'Manage keys →' })}
              </button>
            </div>
          </div>
        ) : (
          <div className="p-8 text-center">
            <Key className="w-12 h-12 text-slate-600 mx-auto mb-3" />
            <p className="text-slate-400">{t({ zh: '暂无 API 密钥', en: 'No API keys yet' })}</p>
            <p className="text-slate-500 text-sm mt-1">{t({ zh: '创建密钥以开始集成', en: 'Create a key to start integrating' })}</p>
          </div>
        )}
      </div>

      {/* Rate Limits & Usage */}
      <div className="bg-slate-900/50 border border-white/5 rounded-2xl p-6">
        <h3 className="font-bold text-white flex items-center gap-2 mb-4">
          <Shield className="w-5 h-5 text-purple-400" />
          {t({ zh: '速率限制与用量', en: 'Rate Limits & Usage' })}
        </h3>
        <div className="space-y-4">
          <div>
            <div className="flex items-center justify-between text-sm mb-2">
              <span className="text-slate-400">{t({ zh: '请求速率', en: 'Request Rate' })}</span>
              <span className="text-white">
                {account.globalRateLimit || 0} req/min
              </span>
            </div>
            <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
              <div 
                className="h-full bg-gradient-to-r from-purple-500 to-blue-500 transition-all"
                style={{ width: '30%' }}
              />
            </div>
          </div>
          <div>
            <div className="flex items-center justify-between text-sm mb-2">
              <span className="text-slate-400">{t({ zh: '本月 API 调用量', en: 'Monthly API Calls' })}</span>
              <span className="text-white">
                {(account.monthApiCalls || 0).toLocaleString()} / {account.monthlyRequestLimit ? account.monthlyRequestLimit.toLocaleString() : '∞'}
              </span>
            </div>
            <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
              <div 
                className="h-full bg-gradient-to-r from-emerald-500 to-cyan-500 transition-all"
                style={{ width: `${account.monthlyRequestLimit ? Math.min(100, ((account.monthApiCalls || 0) / account.monthlyRequestLimit) * 100) : 0}%` }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Quick Links */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { icon: Code, label: { zh: 'API 文档', en: 'API Docs' }, href: '/docs/api' },
          { icon: Zap, label: { zh: '技能开发', en: 'Skill Dev' }, href: '/docs/skills' },
          { icon: BarChart3, label: { zh: '分析面板', en: 'Analytics' }, href: '/developer/analytics' },
          { icon: ExternalLink, label: { zh: '开发者社区', en: 'Community' }, href: 'https://community.agentrix.com' },
        ].map((link, i) => (
          <a 
            key={i}
            href={link.href}
            className="flex items-center gap-3 p-4 bg-slate-900/50 border border-white/5 rounded-xl hover:bg-slate-800/50 transition-colors group"
          >
            <link.icon className="w-5 h-5 text-slate-400 group-hover:text-blue-400 transition-colors" />
            <span className="text-sm text-slate-300 group-hover:text-white transition-colors">
              {t(link.label)}
            </span>
          </a>
        ))}
      </div>
    </div>
  );
};

export default DeveloperAccountPanel;
