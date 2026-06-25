import { useState, useEffect, useCallback } from 'react'
import { useLocalization } from '../../contexts/LocalizationContext'
import { useToast } from '../../contexts/ToastContext'
import { referralApi } from '../../lib/api/referral.api'
import { QRCodeSVG } from 'qrcode.react'
import Link from 'next/link'
import {
  Share2,
  Copy,
  Users,
  TrendingUp,
  DollarSign,
  ExternalLink,
  Award,
  Gift,
  ChevronRight,
  RefreshCw,
  CheckCircle2,
  Clock,
  Zap,
  FileText,
  Calculator,
  Info,
  ArrowRight,
  Percent,
  Wallet,
  Shield,
  Package,
  Server,
  Globe,
  Building,
  QrCode,
  Link2,
  Twitter,
  MessageCircle,
  Send,
  Search,
  Star,
  Eye,
  MousePointerClick,
  ShoppingCart,
  Sparkles,
  ChevronDown,
  ChevronUp,
  X,
} from 'lucide-react'

// 佣金规则配置 - 与智能合约保持一致
const COMMISSION_RULES = {
  // 资产类型对应的佣金规则
  assetTypes: [
    {
      type: 'physical',
      label: { zh: '实物商品', en: 'Physical Goods' },
      baseRate: 0.5,
      poolRate: 2.5,
      totalRate: 3.0,
      settlement: { zh: '签收后 T+7 天', en: 'T+7 after delivery' },
      icon: Package,
    },
    {
      type: 'service',
      label: { zh: '服务类', en: 'Services' },
      baseRate: 1.0,
      poolRate: 4.0,
      totalRate: 5.0,
      settlement: { zh: '完成后 T+3 天', en: 'T+3 after completion' },
      icon: Server,
    },
    {
      type: 'virtual',
      label: { zh: '虚拟资产', en: 'Virtual Goods' },
      baseRate: 1.0,
      poolRate: '2-4',
      totalRate: '3-5',
      settlement: { zh: '链上确认 T+1', en: 'T+1 after on-chain confirm' },
      icon: Globe,
    },
    {
      type: 'dev_tool',
      label: { zh: '开发者工具', en: 'Developer Tools' },
      baseRate: 5.0,
      poolRate: 15.0,
      totalRate: 20.0,
      settlement: { zh: '即时结算', en: 'Instant' },
      icon: Building,
      special: true,
    },
  ],
  // 场景分成规则
  scenarios: [
    {
      id: 'dual',
      title: { zh: '推荐+执行', en: 'Referral + Execution' },
      referralShare: 30,
      executionShare: 70,
      description: { zh: '推荐Agent获得30%，执行Agent获得70%', en: '30% to referral, 70% to execution agent' },
    },
    {
      id: 'execution',
      title: { zh: '仅执行', en: 'Execution Only' },
      referralShare: 0,
      executionShare: 100,
      description: { zh: '执行Agent获得佣金池100%', en: 'Execution agent gets 100% of pool' },
    },
    {
      id: 'none',
      title: { zh: '无Agent', en: 'No Agent' },
      referralShare: 0,
      executionShare: 0,
      description: { zh: '佣金池回归平台/商户', en: 'Pool reverts to platform/merchant' },
    },
  ],
  // 推广者分成
  promoterShare: 20, // 从平台基础收入中抽取20%
}

// 社交分享渠道
const SHARE_CHANNELS = [
  { id: 'twitter', icon: Twitter, label: 'X / Twitter', color: 'hover:bg-sky-500/20 hover:text-sky-400' },
  { id: 'telegram', icon: Send, label: 'Telegram', color: 'hover:bg-blue-500/20 hover:text-blue-400' },
  { id: 'wechat', icon: MessageCircle, label: 'WeChat', color: 'hover:bg-green-500/20 hover:text-green-400' },
  { id: 'link', icon: Link2, label: 'Copy Link', color: 'hover:bg-purple-500/20 hover:text-purple-400' },
]

export function PromotionPanel() {
  const { t } = useLocalization()
  const { success, error } = useToast()
  const [loading, setLoading] = useState(true)
  const [referralLink, setReferralLink] = useState('')
  const [stats, setStats] = useState<any>(null)
  const [copied, setCopied] = useState(false)
  const [activeRuleTab, setActiveRuleTab] = useState<'overview' | 'assets' | 'scenarios' | 'settlement'>('overview')
  const [activeMainTab, setActiveMainTab] = useState<'overview' | 'product-links' | 'social' | 'rules'>('overview')

  // Social Referral state
  const [productSearch, setProductSearch] = useState('')
  const [productLinks, setProductLinks] = useState<Array<{
    id: string; name: string; shortUrl: string; clicks: number; conversions: number; commission: number; createdAt: string;
  }>>([])
  const [showQrModal, setShowQrModal] = useState(false)
  const [qrTarget, setQrTarget] = useState<{ url: string; name: string } | null>(null)
  const [showShareModal, setShowShareModal] = useState(false)
  const [shareTarget, setShareTarget] = useState<{ url: string; name: string } | null>(null)

  const loadData = useCallback(async () => {
    try {
      setLoading(true)
      const [linkData, statsData] = await Promise.all([
        referralApi.getReferralLink(),
        referralApi.getReferralStats()
      ])
      setReferralLink(linkData.link)
      setStats(statsData)
    } catch (err: any) {
      console.error('加载推广数据失败:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadData()
  }, [loadData])

  // Auto-generate default referral links on first load
  useEffect(() => {
    if (productLinks.length > 0) return
    const baseUrl = typeof window !== 'undefined' ? window.location.origin : 'https://www.agentrix.top'
    const defaultLinks = [
      { id: 'default-reg', name: '注册邀请 / Registration Invite', shortUrl: `${baseUrl}/r/invite`, clicks: 0, conversions: 0, commission: 0, createdAt: new Date().toISOString() },
      { id: 'default-marketplace', name: '技能市场 / Skill Marketplace', shortUrl: `${baseUrl}/r/marketplace`, clicks: 0, conversions: 0, commission: 0, createdAt: new Date().toISOString() },
      { id: 'default-earn', name: '自动赚钱 / Auto-Earn', shortUrl: `${baseUrl}/r/earn`, clicks: 0, conversions: 0, commission: 0, createdAt: new Date().toISOString() },
    ]
    setProductLinks(defaultLinks)
  }, [])

  const handleCopyLink = (link?: string) => {
    const url = link || referralLink
    if (!url) return
    navigator.clipboard.writeText(url)
    setCopied(true)
    success(t({ zh: '推广链接已复制', en: 'Referral link copied' }))
    setTimeout(() => setCopied(false), 2000)
  }

  const handleGenerateProductLink = (productName: string) => {
    const shortCode = Math.random().toString(36).substring(2, 8)
    const shortUrl = `${window.location.origin}/r/${shortCode}`
    const newLink = {
      id: shortCode,
      name: productName || t({ zh: '自定义推广', en: 'Custom Promotion' }),
      shortUrl,
      clicks: 0,
      conversions: 0,
      commission: 0,
      createdAt: new Date().toISOString(),
    }
    setProductLinks(prev => [newLink, ...prev])
    navigator.clipboard.writeText(shortUrl)
    success(t({ zh: `已生成推广短链并复制: ${shortUrl}`, en: `Referral short link generated and copied: ${shortUrl}` }))
  }

  const handleShowQr = (url: string, name: string) => {
    setQrTarget({ url, name })
    setShowQrModal(true)
  }

  const handleShowShare = (url: string, name: string) => {
    setShareTarget({ url, name })
    setShowShareModal(true)
  }

  const handleSocialShare = (channel: string, url: string, name: string) => {
    const text = t({ zh: `推荐给你一个好东西: ${name}`, en: `Check this out: ${name}` })
    switch (channel) {
      case 'twitter':
        window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`, '_blank')
        break
      case 'telegram':
        window.open(`https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`, '_blank')
        break
      case 'wechat':
        handleShowQr(url, name)
        break
      case 'link':
        handleCopyLink(url)
        break
    }
    setShowShareModal(false)
  }

  if (loading && !stats) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="w-8 h-8 text-blue-500 animate-spin" />
      </div>
    )
  }

  // ===== Main Tab Config =====
  const mainTabs = [
    { id: 'overview' as const, label: { zh: '推广概览', en: 'Overview' }, icon: TrendingUp },
    { id: 'product-links' as const, label: { zh: '商品推广', en: 'Product Links' }, icon: Link2 },
    { id: 'social' as const, label: { zh: '社交分享', en: 'Social Share' }, icon: Share2 },
    { id: 'rules' as const, label: { zh: '佣金规则', en: 'Commission Rules' }, icon: Calculator },
  ]

  return (
    <div className="space-y-6">
      {/* Main Tab Navigation */}
      <div className="flex gap-1 bg-slate-800/50 rounded-xl p-1 overflow-x-auto">
        {mainTabs.map((tab) => {
          const Icon = tab.icon
          return (
            <button
              key={tab.id}
              onClick={() => setActiveMainTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold whitespace-nowrap transition-all ${
                activeMainTab === tab.id
                  ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/20'
                  : 'text-slate-400 hover:text-white hover:bg-white/5'
              }`}
            >
              <Icon size={16} />
              {t(tab.label)}
            </button>
          )
        })}
      </div>

      {/* ===== TAB: Overview ===== */}
      {activeMainTab === 'overview' && (
        <>
          {/* 顶部概览 */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <StatCard
              icon={Users}
              iconBg="bg-blue-500/15"
              iconColor="text-blue-400"
              label={t({ zh: '累计邀请', en: 'Total Referrals' })}
              value={`${stats?.totalReferrals || 0}`}
              suffix={t({ zh: '人', en: '' })}
            />
            <StatCard
              icon={MousePointerClick}
              iconBg="bg-purple-500/15"
              iconColor="text-purple-400"
              label={t({ zh: '链接点击', en: 'Link Clicks' })}
              value={`${stats?.totalClicks || 0}`}
              suffix=""
            />
            <StatCard
              icon={TrendingUp}
              iconBg="bg-green-500/15"
              iconColor="text-green-400"
              label={t({ zh: '转化率', en: 'Conversion Rate' })}
              value={stats?.conversionRate ? `${(stats.conversionRate * 100).toFixed(1)}%` : '0%'}
              suffix=""
            />
            <StatCard
              icon={DollarSign}
              iconBg="bg-amber-500/15"
              iconColor="text-amber-400"
              label={t({ zh: '累计佣金', en: 'Total Commission' })}
              value={`$${stats?.totalCommission?.toFixed(2) || '0.00'}`}
              suffix=""
            />
          </div>

          {/* 推广链接卡片 */}
          <div className="bg-gradient-to-br from-blue-600 to-indigo-700 rounded-2xl p-8 text-white shadow-lg relative overflow-hidden">
            <div className="relative z-10">
              <h3 className="text-2xl font-bold mb-2 flex items-center gap-2">
                <Award className="w-7 h-7" />
                {t({ zh: '邀请好友，赚取佣金', en: 'Invite Friends, Earn Commission' })}
              </h3>
              <p className="text-blue-100 mb-6 max-w-md">
                {t({
                  zh: '分享您的专属链接，当好友注册并产生交易时，您将获得丰厚的佣金奖励。',
                  en: 'Share your exclusive link. When friends register and make transactions, you will receive generous commission rewards.'
                })}
              </p>

              <div className="flex flex-col sm:flex-row gap-3">
                <div className="flex-1 bg-white/10 backdrop-blur-md border border-white/20 rounded-xl px-4 py-3 flex items-center justify-between group">
                  <span className="text-sm font-mono truncate mr-4 opacity-90">
                    {referralLink || t({ zh: '正在生成链接...', en: 'Generating link...' })}
                  </span>
                  <button
                    onClick={() => handleCopyLink()}
                    className="p-2 hover:bg-white/20 rounded-lg transition-colors shrink-0"
                    title={t({ zh: '复制链接', en: 'Copy Link' })}
                  >
                    {copied ? <CheckCircle2 className="w-5 h-5 text-green-400" /> : <Copy className="w-5 h-5" />}
                  </button>
                </div>
                <button
                  onClick={() => referralLink && handleShowQr(referralLink, t({ zh: '我的推广链接', en: 'My Referral Link' }))}
                  className="bg-white/15 hover:bg-white/25 backdrop-blur px-4 py-3 rounded-xl font-bold transition-colors flex items-center justify-center gap-2"
                >
                  <QrCode className="w-5 h-5" />
                  {t({ zh: '二维码', en: 'QR Code' })}
                </button>
                <button
                  onClick={() => referralLink && handleShowShare(referralLink, t({ zh: '加入 Agentrix', en: 'Join Agentrix' }))}
                  className="bg-white text-blue-600 px-6 py-3 rounded-xl font-bold hover:bg-blue-50 transition-colors flex items-center justify-center gap-2 shadow-md"
                >
                  <Share2 className="w-5 h-5" />
                  {t({ zh: '一键分享', en: 'Share Now' })}
                </button>
              </div>
            </div>

            {/* 装饰背景 */}
            <div className="absolute top-0 right-0 -mt-12 -mr-12 w-64 h-64 bg-white/10 rounded-full blur-3xl" />
            <div className="absolute bottom-0 left-0 -mb-12 -ml-12 w-48 h-48 bg-indigo-400/20 rounded-full blur-2xl" />
          </div>

          {/* 快速入口 */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <button
              onClick={() => setActiveMainTab('product-links')}
              className="group bg-slate-800/50 border border-white/5 rounded-xl p-5 text-left hover:border-purple-500/30 transition-all"
            >
              <div className="flex items-center justify-between mb-3">
                <div className="w-10 h-10 rounded-xl bg-purple-500/15 flex items-center justify-center">
                  <Link2 className="w-5 h-5 text-purple-400" />
                </div>
                <ChevronRight className="w-4 h-4 text-slate-500 group-hover:text-purple-400 transition-colors" />
              </div>
              <h4 className="font-semibold text-white mb-1">{t({ zh: '商品级推广', en: 'Product Referrals' })}</h4>
              <p className="text-xs text-slate-400">{t({ zh: '为特定商品生成专属推广短链和二维码', en: 'Generate referral links for specific products' })}</p>
            </button>

            <button
              onClick={() => setActiveMainTab('social')}
              className="group bg-slate-800/50 border border-white/5 rounded-xl p-5 text-left hover:border-sky-500/30 transition-all"
            >
              <div className="flex items-center justify-between mb-3">
                <div className="w-10 h-10 rounded-xl bg-sky-500/15 flex items-center justify-center">
                  <Share2 className="w-5 h-5 text-sky-400" />
                </div>
                <ChevronRight className="w-4 h-4 text-slate-500 group-hover:text-sky-400 transition-colors" />
              </div>
              <h4 className="font-semibold text-white mb-1">{t({ zh: '社交分享', en: 'Social Sharing' })}</h4>
              <p className="text-xs text-slate-400">{t({ zh: '一键分享到 Twitter、Telegram、微信等平台', en: 'One-click share to Twitter, Telegram, WeChat' })}</p>
            </button>

            <Link
              href="/pay/commission-demo"
              className="group bg-slate-800/50 border border-white/5 rounded-xl p-5 text-left hover:border-amber-500/30 transition-all"
            >
              <div className="flex items-center justify-between mb-3">
                <div className="w-10 h-10 rounded-xl bg-amber-500/15 flex items-center justify-center">
                  <Calculator className="w-5 h-5 text-amber-400" />
                </div>
                <ChevronRight className="w-4 h-4 text-slate-500 group-hover:text-amber-400 transition-colors" />
              </div>
              <h4 className="font-semibold text-white mb-1">{t({ zh: '佣金计算器', en: 'Commission Calculator' })}</h4>
              <p className="text-xs text-slate-400">{t({ zh: '模拟不同场景下的佣金分配', en: 'Simulate commission in different scenarios' })}</p>
            </Link>
          </div>
        </>
      )}

      {/* ===== TAB: Product Links (商品级推广) ===== */}
      {activeMainTab === 'product-links' && (
        <>
          {/* Generate Link Section */}
          <div className="bg-slate-800/50 border border-white/5 rounded-xl p-6">
            <h4 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
              <Link2 className="w-5 h-5 text-purple-400" />
              {t({ zh: '生成商品推广链接', en: 'Generate Product Referral Link' })}
            </h4>
            <div className="flex gap-3">
              <div className="flex-1 relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                <input
                  type="text"
                  value={productSearch}
                  onChange={(e) => setProductSearch(e.target.value)}
                  placeholder={t({ zh: '输入商品名称或 Skill ID...', en: 'Enter product name or Skill ID...' })}
                  className="w-full bg-slate-900/50 border border-white/10 rounded-xl pl-10 pr-4 py-3 text-white text-sm outline-none focus:border-purple-500 placeholder:text-slate-500"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && productSearch.trim()) {
                      handleGenerateProductLink(productSearch.trim())
                      setProductSearch('')
                    }
                  }}
                />
              </div>
              <button
                onClick={() => {
                  if (productSearch.trim()) {
                    handleGenerateProductLink(productSearch.trim())
                    setProductSearch('')
                  }
                }}
                className="px-5 py-3 bg-purple-600 hover:bg-purple-500 rounded-xl text-white font-semibold transition-colors flex items-center gap-2"
              >
                <Zap className="w-4 h-4" />
                {t({ zh: '生成短链', en: 'Generate' })}
              </button>
            </div>
            <p className="text-xs text-slate-500 mt-2">
              {t({ zh: '输入商品名称后回车或点击生成，系统将创建带追踪的推广短链', en: 'Enter product name and press Enter or click Generate to create a tracked referral short link' })}
            </p>
          </div>

          {/* Product Links List */}
          <div className="bg-slate-800/50 border border-white/5 rounded-xl overflow-hidden">
            <div className="p-4 border-b border-white/5 flex items-center justify-between">
              <h4 className="font-semibold text-white flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-amber-400" />
                {t({ zh: '我的推广链接', en: 'My Referral Links' })}
                <span className="text-xs text-slate-500 bg-slate-700/50 px-2 py-0.5 rounded">{productLinks.length}</span>
              </h4>
            </div>

            {productLinks.length === 0 ? (
              <div className="p-12 text-center">
                <Link2 className="w-10 h-10 mx-auto mb-3 text-slate-600" />
                <p className="text-slate-400 text-sm">{t({ zh: '还没有推广链接，在上方生成第一个吧', en: 'No referral links yet. Generate your first one above.' })}</p>
              </div>
            ) : (
              <div className="divide-y divide-white/5">
                {productLinks.map((link) => (
                  <div key={link.id} className="p-4 flex items-center justify-between hover:bg-white/[0.02] transition-colors">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-white truncate">{link.name}</p>
                      <p className="text-xs text-slate-500 font-mono truncate">{link.shortUrl}</p>
                    </div>
                    <div className="flex items-center gap-4 ml-4">
                      <div className="text-center">
                        <p className="text-sm font-bold text-white">{link.clicks}</p>
                        <p className="text-[10px] text-slate-500">{t({ zh: '点击', en: 'Clicks' })}</p>
                      </div>
                      <div className="text-center">
                        <p className="text-sm font-bold text-emerald-400">{link.conversions}</p>
                        <p className="text-[10px] text-slate-500">{t({ zh: '转化', en: 'Conv.' })}</p>
                      </div>
                      <div className="text-center">
                        <p className="text-sm font-bold text-amber-400">${link.commission.toFixed(2)}</p>
                        <p className="text-[10px] text-slate-500">{t({ zh: '佣金', en: 'Comm.' })}</p>
                      </div>
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => handleCopyLink(link.shortUrl)}
                          className="p-2 rounded-lg hover:bg-white/10 text-slate-400 hover:text-white transition-colors"
                          title={t({ zh: '复制', en: 'Copy' })}
                        >
                          <Copy className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleShowQr(link.shortUrl, link.name)}
                          className="p-2 rounded-lg hover:bg-white/10 text-slate-400 hover:text-white transition-colors"
                          title={t({ zh: '二维码', en: 'QR Code' })}
                        >
                          <QrCode className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleShowShare(link.shortUrl, link.name)}
                          className="p-2 rounded-lg hover:bg-white/10 text-slate-400 hover:text-blue-400 transition-colors"
                          title={t({ zh: '分享', en: 'Share' })}
                        >
                          <Share2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}

      {/* ===== TAB: Social Share ===== */}
      {activeMainTab === 'social' && (
        <>
          {/* Social Channels */}
          <div className="bg-slate-800/50 border border-white/5 rounded-xl p-6">
            <h4 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
              <Share2 className="w-5 h-5 text-sky-400" />
              {t({ zh: '一键社交分享', en: 'One-Click Social Share' })}
            </h4>
            <p className="text-sm text-slate-400 mb-6">
              {t({ zh: '选择平台分享您的推广链接，好友通过链接注册或购买，您即可获得佣金', en: 'Choose a platform to share your referral link. Earn commission when friends register or buy through your link.' })}
            </p>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {SHARE_CHANNELS.map((channel) => {
                const Icon = channel.icon
                return (
                  <button
                    key={channel.id}
                    onClick={() => referralLink && handleSocialShare(channel.id, referralLink, 'Agentrix')}
                    className={`flex flex-col items-center gap-3 p-5 rounded-xl border border-white/5 bg-slate-900/50 text-slate-400 transition-all ${channel.color}`}
                  >
                    <Icon className="w-8 h-8" />
                    <span className="text-sm font-semibold">{channel.label}</span>
                  </button>
                )
              })}
            </div>
          </div>

          {/* Marketing Materials */}
          <div className="bg-slate-800/50 border border-white/5 rounded-xl p-6">
            <h4 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
              <FileText className="w-5 h-5 text-blue-400" />
              {t({ zh: '推广素材库', en: 'Marketing Materials' })}
            </h4>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[
                { icon: FileText, label: { zh: '推广海报', en: 'Poster' }, desc: { zh: '高清海报模板', en: 'HD poster templates' } },
                { icon: Gift, label: { zh: '推广文案', en: 'Copywriting' }, desc: { zh: '社交媒体文案', en: 'Social media copy' } },
                { icon: Star, label: { zh: '用户评价', en: 'Reviews' }, desc: { zh: '真实用户好评', en: 'Real user reviews' } },
                { icon: Eye, label: { zh: '数据报告', en: 'Data Report' }, desc: { zh: '推广效果分析', en: 'Promotion analytics' } },
              ].map((item) => {
                const Icon = item.icon
                return (
                  <div
                    key={item.label.en}
                    className="group bg-slate-900/50 border border-white/5 rounded-xl p-4 cursor-pointer hover:border-blue-500/30 transition-all"
                  >
                    <Icon className="w-8 h-8 text-slate-500 group-hover:text-blue-400 mb-3 transition-colors" />
                    <p className="text-sm font-semibold text-white mb-1">{t(item.label)}</p>
                    <p className="text-xs text-slate-500">{t(item.desc)}</p>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Promoter Benefits */}
          <div className="bg-gradient-to-r from-amber-500/10 to-orange-500/10 border border-amber-500/20 rounded-xl p-5">
            <div className="flex items-start gap-3">
              <Award className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
              <div>
                <h5 className="font-semibold text-amber-300 mb-1">
                  {t({ zh: '推广者专属权益', en: 'Promoter Benefits' })}
                </h5>
                <p className="text-sm text-amber-400/80">
                  {t({
                    zh: '作为推广者，您将从 Agentrix 平台基础收入中获得 20% 的分成。当您邀请的用户产生交易时，佣金将自动结算到您的账户。支持 Web3 钱包直接收款或 Web2 月结模式。',
                    en: 'As a promoter, you receive 20% of Agentrix platform base revenue. When your referred users make transactions, commission is automatically settled to your account. Supports Web3 wallet payouts or Web2 monthly settlements.'
                  })}
                </p>
              </div>
            </div>
          </div>
        </>
      )}

      {/* ===== TAB: Commission Rules ===== */}
      {activeMainTab === 'rules' && (
        <>
          {/* 佣金规则详解 - 带标签切换 */}
          <div className="bg-slate-800/50 border border-white/5 rounded-xl overflow-hidden">
            <div className="p-6 border-b border-white/5">
              <div className="flex items-center justify-between mb-4">
                <h4 className="text-lg font-bold text-white flex items-center gap-2">
                  <Calculator className="w-5 h-5 text-purple-400" />
                  {t({ zh: '佣金规则详解', en: 'Commission Rules' })}
                </h4>
                <Link
                  href="/pay/commission-demo"
                  className="flex items-center gap-1 text-sm text-blue-400 hover:text-blue-300 transition-colors"
                >
                  <Zap className="w-4 h-4" />
                  {t({ zh: '查看演示计算器', en: 'View Demo Calculator' })}
                  <ChevronRight className="w-4 h-4" />
                </Link>
              </div>

              {/* 规则标签切换 */}
              <div className="flex gap-2 overflow-x-auto pb-2">
                {[
                  { key: 'overview', label: { zh: '规则概览', en: 'Overview' }, icon: Info },
                  { key: 'assets', label: { zh: '资产类型', en: 'Asset Types' }, icon: Package },
                  { key: 'scenarios', label: { zh: '场景分成', en: 'Scenarios' }, icon: Users },
                  { key: 'settlement', label: { zh: '结算周期', en: 'Settlement' }, icon: Clock },
                ].map((tab) => {
                  const Icon = tab.icon
                  return (
                    <button
                      key={tab.key}
                      onClick={() => setActiveRuleTab(tab.key as any)}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm whitespace-nowrap transition-colors ${
                        activeRuleTab === tab.key
                          ? 'bg-blue-600 text-white'
                          : 'bg-slate-700/50 text-slate-400 hover:bg-slate-600/50 hover:text-white'
                      }`}
                    >
                      <Icon className="w-3.5 h-3.5" />
                      {t(tab.label)}
                    </button>
                  )
                })}
              </div>
            </div>

            <div className="p-6">
              {/* 规则概览 */}
              {activeRuleTab === 'overview' && (
                <div className="space-y-4">
                  <div className="bg-gradient-to-r from-purple-500/10 to-blue-500/10 border border-purple-500/20 rounded-xl p-4">
                    <h5 className="font-semibold text-purple-400 mb-2">
                      {t({ zh: '三层分润架构', en: 'Three-tier Commission Structure' })}
                    </h5>
                    <p className="text-sm text-slate-400">
                      {t({
                        zh: 'Agentrix 采用"平台基础 + 佣金池"的两级分润模式，支持推荐Agent、执行Agent和推广者的多方分成。',
                        en: 'Agentrix uses a two-level "base + pool" profit-sharing model, supporting multi-party splits between referral agents, execution agents, and promoters.'
                      })}
                    </p>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="bg-slate-700/30 rounded-lg p-4">
                      <div className="flex items-center gap-2 mb-2">
                        <div className="w-8 h-8 bg-blue-500/20 rounded-lg flex items-center justify-center">
                          <Building className="w-4 h-4 text-blue-400" />
                        </div>
                        <span className="font-semibold text-white">{t({ zh: '平台基础', en: 'Platform Base' })}</span>
                      </div>
                      <p className="text-xs text-slate-400">
                        {t({ zh: '0.5%-5% 固定收入，推广者可获得其中 20%', en: '0.5%-5% base revenue, promoters get 20% of it' })}
                      </p>
                    </div>

                    <div className="bg-slate-700/30 rounded-lg p-4">
                      <div className="flex items-center gap-2 mb-2">
                        <div className="w-8 h-8 bg-green-500/20 rounded-lg flex items-center justify-center">
                          <Wallet className="w-4 h-4 text-green-400" />
                        </div>
                        <span className="font-semibold text-white">{t({ zh: '佣金池', en: 'Commission Pool' })}</span>
                      </div>
                      <p className="text-xs text-slate-400">
                        {t({ zh: '1.5%-4% 用于推荐/执行 Agent 分成', en: '1.5%-4% for referral/execution agent splits' })}
                      </p>
                    </div>

                    <div className="bg-slate-700/30 rounded-lg p-4">
                      <div className="flex items-center gap-2 mb-2">
                        <div className="w-8 h-8 bg-amber-500/20 rounded-lg flex items-center justify-center">
                          <Percent className="w-4 h-4 text-amber-400" />
                        </div>
                        <span className="font-semibold text-white">{t({ zh: '推广者奖励', en: 'Promoter Bonus' })}</span>
                      </div>
                      <p className="text-xs text-slate-400">
                        {t({ zh: '从平台基础收入抽取 20% 作为推广奖励', en: '20% of platform base as promotion reward' })}
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* 资产类型费率 */}
              {activeRuleTab === 'assets' && (
                <div className="space-y-3">
                  {COMMISSION_RULES.assetTypes.map((asset) => {
                    const Icon = asset.icon
                    return (
                      <div key={asset.type} className={`flex items-center justify-between p-4 rounded-lg border ${
                        asset.special ? 'border-amber-500/30 bg-amber-500/5' : 'border-white/5 bg-slate-700/30'
                      }`}>
                        <div className="flex items-center gap-3">
                          <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                            asset.special ? 'bg-amber-500/20' : 'bg-blue-500/20'
                          }`}>
                            <Icon className={`w-5 h-5 ${asset.special ? 'text-amber-400' : 'text-blue-400'}`} />
                          </div>
                          <div>
                            <p className="font-medium text-white">{t(asset.label)}</p>
                            <p className="text-xs text-slate-500">{t(asset.settlement)}</p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="text-lg font-bold text-white">
                            {typeof asset.totalRate === 'string' ? asset.totalRate : asset.totalRate.toFixed(1)}%
                          </p>
                          <p className="text-xs text-slate-500">
                            {t({ zh: '基础', en: 'Base' })} {asset.baseRate}% + {t({ zh: '池', en: 'Pool' })} {asset.poolRate}%
                          </p>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}

              {/* 场景分成 */}
              {activeRuleTab === 'scenarios' && (
                <div className="space-y-4">
                  {COMMISSION_RULES.scenarios.map((scenario, idx) => (
                    <div key={scenario.id} className="bg-slate-700/30 rounded-lg p-4">
                      <div className="flex items-center justify-between mb-3">
                        <h5 className="font-semibold text-white">
                          {t({ zh: `场景 ${String.fromCharCode(65 + idx)}`, en: `Scenario ${String.fromCharCode(65 + idx)}` })}: {t(scenario.title)}
                        </h5>
                      </div>
                      <p className="text-sm text-slate-400 mb-3">{t(scenario.description)}</p>
                      <div className="flex gap-4">
                        <div className="flex-1 bg-slate-800/50 rounded-lg p-3 text-center">
                          <p className="text-2xl font-bold text-purple-400">{scenario.referralShare}%</p>
                          <p className="text-xs text-slate-500">{t({ zh: '推荐 Agent', en: 'Referral Agent' })}</p>
                        </div>
                        <div className="flex-1 bg-slate-800/50 rounded-lg p-3 text-center">
                          <p className="text-2xl font-bold text-green-400">{scenario.executionShare}%</p>
                          <p className="text-xs text-slate-500">{t({ zh: '执行 Agent', en: 'Execution Agent' })}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* 结算周期 */}
              {activeRuleTab === 'settlement' && (
                <div className="space-y-4">
                  <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-4 mb-4">
                    <p className="text-sm text-blue-300">
                      <Info className="w-4 h-4 inline mr-1" />
                      {t({
                        zh: '结算时间 (T) 指触发事件发生的时间点，如签收、服务完成、链上确认等。',
                        en: 'Settlement time (T) refers to the trigger event, such as delivery confirmation, service completion, or on-chain confirmation.'
                      })}
                    </p>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-white/10">
                          <th className="text-left py-2 px-3 font-medium text-slate-400">{t({ zh: '资产类型', en: 'Asset Type' })}</th>
                          <th className="text-left py-2 px-3 font-medium text-slate-400">{t({ zh: '触发事件', en: 'Trigger' })}</th>
                          <th className="text-left py-2 px-3 font-medium text-slate-400">{t({ zh: '锁定期', en: 'Lock Period' })}</th>
                          <th className="text-left py-2 px-3 font-medium text-slate-400">{t({ zh: '资金释放', en: 'Payout' })}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {[
                          { asset: { zh: '实物商品', en: 'Physical' }, trigger: { zh: '签收/确认', en: 'Delivery' }, lock: '7天', payout: 'T+7' },
                          { asset: { zh: '服务类', en: 'Services' }, trigger: { zh: '服务完成', en: 'Completed' }, lock: '3天', payout: 'T+3' },
                          { asset: { zh: '虚拟资产', en: 'Virtual' }, trigger: { zh: '链上确认', en: 'On-chain' }, lock: '1天', payout: 'T+1' },
                          { asset: { zh: '开发者工具', en: 'Dev Tools' }, trigger: { zh: '支付成功', en: 'Payment' }, lock: '0天', payout: t({ zh: '即时', en: 'Instant' }) },
                        ].map((row, i) => (
                          <tr key={i} className="border-b border-white/5">
                            <td className="py-2 px-3 font-medium text-white">{t(row.asset)}</td>
                            <td className="py-2 px-3 text-slate-400">{t(row.trigger)}</td>
                            <td className="py-2 px-3 text-slate-400">{row.lock}</td>
                            <td className="py-2 px-3 text-emerald-400 font-medium">{row.payout}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {/* ===== QR Code Modal ===== */}
      {showQrModal && qrTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setShowQrModal(false)}>
          <div className="bg-slate-800 border border-white/10 rounded-2xl p-8 max-w-sm w-full mx-4 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-6">
              <h4 className="text-lg font-bold text-white">{t({ zh: '推广二维码', en: 'Referral QR Code' })}</h4>
              <button onClick={() => setShowQrModal(false)} className="p-1 hover:bg-white/10 rounded-lg transition-colors">
                <X className="w-5 h-5 text-slate-400" />
              </button>
            </div>
            <div className="bg-white rounded-xl p-6 mb-4 flex justify-center">
              <QRCodeSVG
                value={qrTarget.url}
                size={192}
                bgColor="#ffffff"
                fgColor="#1e293b"
                level="M"
                includeMargin={false}
              />
            </div>
            <p className="text-center text-sm text-slate-400 mb-4 truncate">{qrTarget.name}</p>
            <p className="text-center text-xs text-slate-500 font-mono truncate mb-4">{qrTarget.url}</p>
            <button
              onClick={() => handleCopyLink(qrTarget.url)}
              className="w-full py-2.5 bg-blue-600 hover:bg-blue-500 rounded-xl text-white font-semibold transition-colors flex items-center justify-center gap-2"
            >
              <Copy className="w-4 h-4" />
              {t({ zh: '复制链接', en: 'Copy Link' })}
            </button>
          </div>
        </div>
      )}

      {/* ===== Share Modal ===== */}
      {showShareModal && shareTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setShowShareModal(false)}>
          <div className="bg-slate-800 border border-white/10 rounded-2xl p-8 max-w-md w-full mx-4 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-6">
              <h4 className="text-lg font-bold text-white">{t({ zh: '分享到', en: 'Share To' })}</h4>
              <button onClick={() => setShowShareModal(false)} className="p-1 hover:bg-white/10 rounded-lg transition-colors">
                <X className="w-5 h-5 text-slate-400" />
              </button>
            </div>
            <div className="grid grid-cols-4 gap-4 mb-6">
              {SHARE_CHANNELS.map((channel) => {
                const Icon = channel.icon
                return (
                  <button
                    key={channel.id}
                    onClick={() => handleSocialShare(channel.id, shareTarget.url, shareTarget.name)}
                    className={`flex flex-col items-center gap-2 p-4 rounded-xl border border-white/5 bg-slate-900/50 text-slate-400 transition-all ${channel.color}`}
                  >
                    <Icon className="w-6 h-6" />
                    <span className="text-xs font-semibold">{channel.label}</span>
                  </button>
                )
              })}
            </div>
            <div className="bg-slate-900/50 rounded-xl p-3 flex items-center gap-2">
              <input
                type="text"
                readOnly
                value={shareTarget.url}
                className="flex-1 bg-transparent text-sm text-slate-300 font-mono outline-none truncate"
              />
              <button
                onClick={() => handleCopyLink(shareTarget.url)}
                className="p-2 bg-blue-600 hover:bg-blue-500 rounded-lg transition-colors"
              >
                <Copy className="w-4 h-4 text-white" />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ===== Stat Card Sub-component =====

function StatCard({ icon: Icon, iconBg, iconColor, label, value, suffix }: {
  icon: any; iconBg: string; iconColor: string; label: string; value: string; suffix: string;
}) {
  return (
    <div className="bg-slate-800/50 border border-white/5 p-5 rounded-xl">
      <div className="flex items-center justify-between mb-3">
        <div className={`p-2 rounded-lg ${iconBg}`}>
          <Icon className={`w-5 h-5 ${iconColor}`} />
        </div>
        <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">{label}</span>
      </div>
      <div className="flex items-baseline gap-1">
        <span className="text-2xl font-bold text-white">{value}</span>
        {suffix && <span className="text-sm text-slate-500">{suffix}</span>}
      </div>
    </div>
  )
}
