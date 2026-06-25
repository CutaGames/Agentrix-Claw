'use client'

import { useState, useEffect, useCallback } from 'react'
import { useLocalization } from '../../contexts/LocalizationContext'
import { useUser } from '../../contexts/UserContext'
import { 
  developerAccountApi, 
  DeveloperAccount, 
  DeveloperTier, 
  DeveloperAccountStatus,
  DEVELOPER_TIER_BENEFITS 
} from '../../lib/api/developer-account.api'
import { 
  Shield, 
  Key, 
  TrendingUp, 
  Clock, 
  CheckCircle, 
  AlertCircle,
  Star,
  Zap,
  ArrowUp,
  FileText,
  Settings,
  Plus,
  Loader2
} from 'lucide-react'

interface DeveloperAccountDashboardProps {
  onNavigate?: (tab: string) => void
}

/**
 * 开发者账户仪表盘组件
 * 展示开发者账户状态、等级、限额、收益等信息
 */
export function DeveloperAccountDashboard({ onNavigate }: DeveloperAccountDashboardProps) {
  const { t } = useLocalization()
  const { user } = useUser()
  const [account, setAccount] = useState<DeveloperAccount | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)

  const loadAccount = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await developerAccountApi.getMyAccount()
      setAccount(data)
    } catch (err: any) {
      console.error('加载开发者账户失败:', err)
      // 404 表示没有账户，这不是错误
      if (err.response?.status !== 404) {
        setError(err.message || '加载失败')
      }
    } finally {
      setLoading(false)
    }
  }, [])

  const handleCreateAccount = async () => {
    if (!user) return
    
    setCreating(true)
    try {
      const newAccount = await developerAccountApi.create({
        name: user.nickname || '开发者',
        contactEmail: user.email,
      })
      setAccount(newAccount)
    } catch (err: any) {
      console.error('创建开发者账户失败:', err)
      setError(err.message || '创建失败')
    } finally {
      setCreating(false)
    }
  }

  useEffect(() => {
    loadAccount()
  }, [loadAccount])

  const getStatusBadge = (status: DeveloperAccountStatus) => {
    const configs = {
      [DeveloperAccountStatus.PENDING]: {
        label: { zh: '待审核', en: 'Pending' },
        color: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
        icon: Clock,
      },
      [DeveloperAccountStatus.ACTIVE]: {
        label: { zh: '活跃', en: 'Active' },
        color: 'bg-green-500/20 text-green-400 border-green-500/30',
        icon: CheckCircle,
      },
      [DeveloperAccountStatus.SUSPENDED]: {
        label: { zh: '已暂停', en: 'Suspended' },
        color: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
        icon: AlertCircle,
      },
      [DeveloperAccountStatus.REVOKED]: {
        label: { zh: '已撤销', en: 'Revoked' },
        color: 'bg-red-500/20 text-red-400 border-red-500/30',
        icon: AlertCircle,
      },
      [DeveloperAccountStatus.BANNED]: {
        label: { zh: '已封禁', en: 'Banned' },
        color: 'bg-red-500/20 text-red-400 border-red-500/30',
        icon: AlertCircle,
      },
    }
    const config = configs[status]
    const Icon = config.icon
    return (
      <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs border ${config.color}`}>
        <Icon size={12} />
        {t(config.label)}
      </span>
    )
  }

  const getTierBadge = (tier: DeveloperTier) => {
    const configs = {
      [DeveloperTier.STARTER]: {
        label: { zh: '入门级', en: 'Starter' },
        color: 'bg-slate-500/20 text-slate-400 border-slate-500/30',
      },
      [DeveloperTier.PROFESSIONAL]: {
        label: { zh: '专业级', en: 'Professional' },
        color: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
      },
      [DeveloperTier.ENTERPRISE]: {
        label: { zh: '企业级', en: 'Enterprise' },
        color: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
      },
      [DeveloperTier.PARTNER]: {
        label: { zh: '合作伙伴', en: 'Partner' },
        color: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
      },
    }
    const config = configs[tier]
    return (
      <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs border ${config.color}`}>
        <Star size={12} />
        {t(config.label)}
      </span>
    )
  }

  if (loading) {
    return (
      <div className="animate-pulse space-y-4 p-6">
        <div className="h-8 bg-slate-700/50 rounded w-1/3"></div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="h-24 bg-slate-800/50 rounded-xl"></div>
          ))}
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="p-6 text-center">
        <AlertCircle className="w-12 h-12 text-red-400 mx-auto mb-4" />
        <p className="text-red-400">{error}</p>
        <button 
          onClick={loadAccount}
          className="mt-4 px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg text-white text-sm"
        >
          {t({ zh: '重试', en: 'Retry' })}
        </button>
      </div>
    )
  }

  if (!account) {
    return (
      <div className="p-6 text-center max-w-md mx-auto">
        <div className="w-16 h-16 bg-indigo-600/20 rounded-full flex items-center justify-center mx-auto mb-4">
          <Shield className="w-8 h-8 text-indigo-500" />
        </div>
        <h3 className="text-xl font-bold text-white mb-2">
          {t({ zh: '创建开发者账户', en: 'Create Developer Account' })}
        </h3>
        <p className="text-slate-400 mb-6">
          {t({ zh: '开发者账户让您可以访问 API、SDK 和开发者工具，开始构建和发布 Skill。', en: 'A developer account gives you access to APIs, SDKs, and developer tools to build and publish Skills.' })}
        </p>
        <button 
          onClick={handleCreateAccount}
          disabled={creating}
          className="px-6 py-3 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 rounded-lg text-white text-sm font-medium inline-flex items-center gap-2 transition-colors"
        >
          {creating ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              {t({ zh: '创建中...', en: 'Creating...' })}
            </>
          ) : (
            <>
              <Plus className="w-4 h-4" />
              {t({ zh: '创建开发者账户', en: 'Create Developer Account' })}
            </>
          )}
        </button>
      </div>
    )
  }

  const tierBenefits = DEVELOPER_TIER_BENEFITS[account.tier]
  const dailyUsagePercent = account.dailyRequestLimit > 0 
    ? (account.todayApiCalls / account.dailyRequestLimit) * 100 
    : 0
  const apiKeyUsagePercent = (account.currentApiKeyCount / account.maxApiKeys) * 100

  return (
    <div className="space-y-6">
      {/* 头部信息 */}
      <div className="bg-gradient-to-r from-indigo-600/20 to-purple-600/20 border border-indigo-500/30 rounded-2xl p-6">
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <h2 className="text-xl font-bold text-white">{account.name}</h2>
              {getStatusBadge(account.status)}
              {getTierBadge(account.tier)}
            </div>
            <p className="text-slate-400 text-sm">{account.developerUniqueId}</p>
            {account.description && (
              <p className="text-slate-300 text-sm mt-2">{account.description}</p>
            )}
          </div>
          <button
            onClick={() => onNavigate?.('settings')}
            className="p-2 hover:bg-white/10 rounded-lg transition-colors"
          >
            <Settings size={20} className="text-slate-400" />
          </button>
        </div>

        {/* 合规状态 */}
        <div className="flex items-center gap-4 mt-4 pt-4 border-t border-white/10">
          <div className={`flex items-center gap-2 text-sm ${account.isEmailVerified ? 'text-green-400' : 'text-slate-500'}`}>
            {account.isEmailVerified ? <CheckCircle size={16} /> : <Clock size={16} />}
            {t({ zh: '邮箱验证', en: 'Email Verified' })}
          </div>
          <div className={`flex items-center gap-2 text-sm ${account.hasSignedAgreement ? 'text-green-400' : 'text-slate-500'}`}>
            {account.hasSignedAgreement ? <CheckCircle size={16} /> : <Clock size={16} />}
            {t({ zh: '协议签署', en: 'Agreement Signed' })}
          </div>
          <div className={`flex items-center gap-2 text-sm ${account.isKycVerified ? 'text-green-400' : 'text-slate-500'}`}>
            {account.isKycVerified ? <CheckCircle size={16} /> : <Clock size={16} />}
            {t({ zh: 'KYC 认证', en: 'KYC Verified' })}
          </div>
        </div>
      </div>

      {/* 统计卡片 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-slate-800/50 border border-white/10 rounded-xl p-4">
          <div className="flex items-center gap-2 text-slate-400 text-sm mb-2">
            <Zap size={16} />
            {t({ zh: '今日调用', en: 'Today Calls' })}
          </div>
          <p className="text-2xl font-bold text-white">{account.todayApiCalls.toLocaleString()}</p>
          <div className="mt-2">
            <div className="h-1 bg-slate-700 rounded-full overflow-hidden">
              <div 
                className="h-full bg-blue-500 rounded-full transition-all"
                style={{ width: `${Math.min(dailyUsagePercent, 100)}%` }}
              />
            </div>
            <p className="text-xs text-slate-500 mt-1">
              / {account.dailyRequestLimit === -1 ? '无限' : account.dailyRequestLimit.toLocaleString()}
            </p>
          </div>
        </div>

        <div className="bg-slate-800/50 border border-white/10 rounded-xl p-4">
          <div className="flex items-center gap-2 text-slate-400 text-sm mb-2">
            <TrendingUp size={16} />
            {t({ zh: '累计调用', en: 'Total Calls' })}
          </div>
          <p className="text-2xl font-bold text-white">{Number(account.totalApiCalls).toLocaleString()}</p>
          <p className="text-xs text-slate-500 mt-2">
            {t({ zh: '本月', en: 'This Month' })}: {account.monthApiCalls.toLocaleString()}
          </p>
        </div>

        <div className="bg-slate-800/50 border border-white/10 rounded-xl p-4">
          <div className="flex items-center gap-2 text-slate-400 text-sm mb-2">
            <Key size={16} />
            {t({ zh: 'API Keys', en: 'API Keys' })}
          </div>
          <p className="text-2xl font-bold text-white">{account.currentApiKeyCount}</p>
          <div className="mt-2">
            <div className="h-1 bg-slate-700 rounded-full overflow-hidden">
              <div 
                className="h-full bg-purple-500 rounded-full transition-all"
                style={{ width: `${apiKeyUsagePercent}%` }}
              />
            </div>
            <p className="text-xs text-slate-500 mt-1">/ {account.maxApiKeys}</p>
          </div>
        </div>

        <div className="bg-slate-800/50 border border-white/10 rounded-xl p-4">
          <div className="flex items-center gap-2 text-slate-400 text-sm mb-2">
            <Star size={16} />
            {t({ zh: '评分', en: 'Rating' })}
          </div>
          <p className="text-2xl font-bold text-white">
            {account.ratingCount > 0 ? account.rating.toFixed(1) : '-'}
          </p>
          <p className="text-xs text-slate-500 mt-2">
            {account.ratingCount} {t({ zh: '评价', en: 'reviews' })}
          </p>
        </div>
      </div>

      {/* 收益统计 */}
      <div className="bg-slate-800/50 border border-white/10 rounded-xl p-6">
        <h3 className="text-lg font-bold text-white mb-4">
          {t({ zh: '收益概览', en: 'Revenue Overview' })}
        </h3>
        <div className="grid grid-cols-3 gap-6">
          <div>
            <p className="text-slate-400 text-sm mb-1">{t({ zh: '累计收益', en: 'Total Revenue' })}</p>
            <p className="text-2xl font-bold text-emerald-400">
              ${Number(account.totalRevenue).toLocaleString()}
            </p>
          </div>
          <div>
            <p className="text-slate-400 text-sm mb-1">{t({ zh: '待结算', en: 'Pending' })}</p>
            <p className="text-2xl font-bold text-yellow-400">
              ${Number(account.pendingRevenue).toLocaleString()}
            </p>
          </div>
          <div>
            <p className="text-slate-400 text-sm mb-1">{t({ zh: '已提现', en: 'Withdrawn' })}</p>
            <p className="text-2xl font-bold text-slate-300">
              ${Number(account.withdrawnRevenue).toLocaleString()}
            </p>
          </div>
        </div>
        <div className="mt-4 pt-4 border-t border-white/10 flex items-center justify-between">
          <div className="text-sm">
            <span className="text-slate-400">{t({ zh: '分成比例', en: 'Revenue Share' })}: </span>
            <span className="text-white font-medium">{account.revenueSharePercent}%</span>
          </div>
          <div className="text-sm">
            <span className="text-slate-400">{t({ zh: '结算周期', en: 'Settlement Period' })}: </span>
            <span className="text-white font-medium">{account.settlementPeriodDays} {t({ zh: '天', en: 'days' })}</span>
          </div>
        </div>
      </div>

      {/* 发布统计 */}
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-slate-800/50 border border-white/10 rounded-xl p-4 flex items-center justify-between">
          <div>
            <p className="text-slate-400 text-sm">{t({ zh: '已发布 Skills', en: 'Published Skills' })}</p>
            <p className="text-2xl font-bold text-white mt-1">{account.publishedSkillCount}</p>
          </div>
          <button
            onClick={() => onNavigate?.('skills')}
            className="px-3 py-1.5 bg-indigo-600/20 hover:bg-indigo-600/30 border border-indigo-500/30 rounded-lg text-indigo-400 text-sm"
          >
            {t({ zh: '管理', en: 'Manage' })}
          </button>
        </div>

        <div className="bg-slate-800/50 border border-white/10 rounded-xl p-4 flex items-center justify-between">
          <div>
            <p className="text-slate-400 text-sm">{t({ zh: '已发布 Agents', en: 'Published Agents' })}</p>
            <p className="text-2xl font-bold text-white mt-1">{account.publishedAgentCount}</p>
          </div>
          <button
            onClick={() => onNavigate?.('agents')}
            className="px-3 py-1.5 bg-indigo-600/20 hover:bg-indigo-600/30 border border-indigo-500/30 rounded-lg text-indigo-400 text-sm"
          >
            {t({ zh: '管理', en: 'Manage' })}
          </button>
        </div>
      </div>

      {/* 等级权益 */}
      <div className="bg-slate-800/50 border border-white/10 rounded-xl p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold text-white">
            {t({ zh: '当前等级权益', en: 'Current Tier Benefits' })}
          </h3>
          {account.tier !== DeveloperTier.PARTNER && (
            <button className="flex items-center gap-1 px-3 py-1.5 bg-gradient-to-r from-amber-500/20 to-orange-500/20 border border-amber-500/30 rounded-lg text-amber-400 text-sm hover:from-amber-500/30 hover:to-orange-500/30">
              <ArrowUp size={14} />
              {t({ zh: '升级', en: 'Upgrade' })}
            </button>
          )}
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="text-center p-3 bg-slate-700/30 rounded-lg">
            <p className="text-slate-400 text-xs mb-1">API Keys</p>
            <p className="text-white font-bold">{tierBenefits.maxApiKeys}</p>
          </div>
          <div className="text-center p-3 bg-slate-700/30 rounded-lg">
            <p className="text-slate-400 text-xs mb-1">{t({ zh: '速率限制', en: 'Rate Limit' })}</p>
            <p className="text-white font-bold">{tierBenefits.rateLimit}</p>
          </div>
          <div className="text-center p-3 bg-slate-700/30 rounded-lg">
            <p className="text-slate-400 text-xs mb-1">{t({ zh: '日请求数', en: 'Daily Limit' })}</p>
            <p className="text-white font-bold">{tierBenefits.dailyLimit}</p>
          </div>
          <div className="text-center p-3 bg-slate-700/30 rounded-lg">
            <p className="text-slate-400 text-xs mb-1">{t({ zh: '收益分成', en: 'Revenue Share' })}</p>
            <p className="text-white font-bold">{tierBenefits.revenueShare}</p>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          {tierBenefits.features.map((feature: string, index: number) => (
            <span key={index} className="px-2 py-1 bg-slate-700/50 rounded-full text-xs text-slate-300">
              {feature}
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}
