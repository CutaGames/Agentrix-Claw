import { useState, useCallback, useEffect } from 'react'
import { useRouter } from 'next/router'
import { useLocalization } from '../../contexts/LocalizationContext'
import { useToast } from '../../contexts/ToastContext'
import { skillApi, type Skill as ApiSkill, type SkillListResponse } from '../../lib/api/skill.api'
import Link from 'next/link'
import {
  Puzzle,
  Plus,
  Settings,
  Trash2,
  Copy,
  ExternalLink,
  Search,
  Filter,
  Star,
  Download,
  Upload,
  Eye,
  Code2,
  Zap,
  Globe,
  Lock,
  RefreshCw,
  ChevronRight,
  Package,
  Play,
  Pause,
  ToggleLeft,
  ToggleRight,
  ShoppingCart,
  DollarSign,
  MessageSquare,
  Wallet,
  TrendingUp,
  Shield,
  Sparkles,
} from 'lucide-react'

interface SkillView {
  id: string
  name: string
  description: string
  category: string
  icon?: string
  version: string
  author: string
  downloads: number
  rating: number
  isEnabled: boolean
  isInstalled: boolean
  isPremium: boolean
  price?: number
  permissions: string[]
  configSchema?: Record<string, any>
  config?: Record<string, any>
}

const SKILL_CATEGORIES = [
  { id: 'all', label: { zh: '全部', en: 'All' }, icon: Package },
  { id: 'payment', label: { zh: '支付', en: 'Payment' }, icon: Wallet },
  { id: 'trading', label: { zh: '交易', en: 'Trading' }, icon: TrendingUp },
  { id: 'automation', label: { zh: '自动化', en: 'Automation' }, icon: Zap },
  { id: 'communication', label: { zh: '沟通', en: 'Communication' }, icon: MessageSquare },
  { id: 'security', label: { zh: '安全', en: 'Security' }, icon: Shield },
]

// 示例技能数据
const SAMPLE_SKILLS: SkillView[] = [
  {
    id: 'skill-payment-auto',
    name: 'Auto Payment',
    description: '自动处理支付请求，支持多种支付方式和货币',
    category: 'payment',
    version: '1.2.0',
    author: 'Agentrix',
    downloads: 12500,
    rating: 4.8,
    isEnabled: true,
    isInstalled: true,
    isPremium: false,
    permissions: ['payment.execute', 'wallet.read'],
    configSchema: {
      maxAmount: { type: 'number', default: 100, label: '单笔最大金额' },
      requireConfirmation: { type: 'boolean', default: true, label: '需要用户确认' },
    },
    config: { maxAmount: 100, requireConfirmation: true },
  },
  {
    id: 'skill-dca',
    name: 'DCA Strategy',
    description: '定投策略，按设定周期自动执行定投操作',
    category: 'trading',
    version: '2.0.1',
    author: 'Agentrix',
    downloads: 8900,
    rating: 4.7,
    isEnabled: false,
    isInstalled: true,
    isPremium: true,
    price: 9.99,
    permissions: ['trading.execute', 'wallet.read', 'wallet.write'],
    configSchema: {
      interval: { type: 'select', options: ['daily', 'weekly', 'monthly'], default: 'weekly', label: '执行周期' },
      amount: { type: 'number', default: 50, label: '每次金额' },
    },
    config: { interval: 'weekly', amount: 50 },
  },
  {
    id: 'skill-notification',
    name: 'Smart Notification',
    description: '智能通知，当特定条件触发时发送通知',
    category: 'communication',
    version: '1.0.5',
    author: 'Community',
    downloads: 5600,
    rating: 4.5,
    isEnabled: true,
    isInstalled: true,
    isPremium: false,
    permissions: ['notification.send'],
  },
  {
    id: 'skill-grid-trading',
    name: 'Grid Trading',
    description: '网格交易策略，在价格区间内自动买卖',
    category: 'trading',
    version: '1.5.0',
    author: 'Agentrix',
    downloads: 7200,
    rating: 4.6,
    isEnabled: false,
    isInstalled: false,
    isPremium: true,
    price: 19.99,
    permissions: ['trading.execute', 'wallet.full'],
  },
  {
    id: 'skill-2fa',
    name: '2FA Guardian',
    description: '双重验证保护，增强交易安全性',
    category: 'security',
    version: '1.1.0',
    author: 'Agentrix',
    downloads: 15000,
    rating: 4.9,
    isEnabled: true,
    isInstalled: true,
    isPremium: false,
    permissions: ['security.verify'],
  },
]

interface SkillManagementPanelProps {
  agentId?: string
  compact?: boolean
  autoInstallSkillId?: string
}

type ViewMode = 'installed' | 'marketplace'

export function SkillManagementPanel({ agentId, compact = false, autoInstallSkillId }: SkillManagementPanelProps) {
  const { t } = useLocalization()
  const { success, error } = useToast()
  const router = useRouter()
  
  const [viewMode, setViewMode] = useState<ViewMode>('installed')
  const [skills, setSkills] = useState<SkillView[]>(SAMPLE_SKILLS)
  const [loading, setLoading] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedCategory, setSelectedCategory] = useState('all')
  const [selectedSkill, setSelectedSkill] = useState<SkillView | null>(null)
  const [showConfigModal, setShowConfigModal] = useState(false)

  const filteredSkills = skills.filter(skill => {
    const matchesSearch = skill.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      skill.description.toLowerCase().includes(searchQuery.toLowerCase())
    const matchesCategory = selectedCategory === 'all' || skill.category === selectedCategory
    const matchesView = viewMode === 'installed' ? skill.isInstalled : true
    return matchesSearch && matchesCategory && matchesView
  })

  const handleToggleSkill = (skillId: string) => {
    setSkills(skills.map(s => 
      s.id === skillId ? { ...s, isEnabled: !s.isEnabled } : s
    ))
    const skill = skills.find(s => s.id === skillId)
    if (skill) {
      success(t({ 
        zh: `${skill.name} 已${skill.isEnabled ? '禁用' : '启用'}`, 
        en: `${skill.name} ${skill.isEnabled ? 'disabled' : 'enabled'}` 
      }))
    }
  }

  const handleInstallSkill = async (skill: SkillView) => {
    if (skill.isPremium && skill.price) {
      // 付费技能需要购买
      if (!confirm(t({ 
        zh: `确定要购买 ${skill.name}（$${skill.price}）吗？`, 
        en: `Purchase ${skill.name} for $${skill.price}?` 
      }))) return
    }
    
    try {
      await skillApi.installSkill(skill.id)
      setSkills(skills.map(s => 
        s.id === skill.id ? { ...s, isInstalled: true, isEnabled: true } : s
      ))
      success(t({ zh: `${skill.name} 安装成功`, en: `${skill.name} installed` }))
    } catch (err: any) {
      error(err?.message || t({ zh: '安装失败', en: 'Installation failed' }))
    }
  }

  const handleUninstallSkill = async (skillId: string) => {
    const skill = skills.find(s => s.id === skillId)
    if (!confirm(t({ zh: `确定要卸载 ${skill?.name} 吗？`, en: `Uninstall ${skill?.name}?` }))) return
    
    try {
      await skillApi.uninstallSkill(skillId)
      setSkills(skills.map(s => 
        s.id === skillId ? { ...s, isInstalled: false, isEnabled: false } : s
      ))
      success(t({ zh: `${skill?.name} 已卸载`, en: `${skill?.name} uninstalled` }))
    } catch (err: any) {
      error(err?.message || t({ zh: '卸载失败', en: 'Uninstallation failed' }))
    }
  }

  const handleConfigureSkill = (skill: SkillView) => {
    setSelectedSkill(skill)
    setShowConfigModal(true)
  }

  const handleSaveConfig = (config: Record<string, any>) => {
    if (!selectedSkill) return
    setSkills(skills.map(s => 
      s.id === selectedSkill.id ? { ...s, config } : s
    ))
    success(t({ zh: '配置已保存', en: 'Configuration saved' }))
    setShowConfigModal(false)
    setSelectedSkill(null)
  }

  const installedCount = skills.filter(s => s.isInstalled).length
  const enabledCount = skills.filter(s => s.isInstalled && s.isEnabled).length

  const mapApiSkill = (item: ApiSkill, installed: boolean): SkillView => ({
    id: item.id,
    name: item.name,
    description: item.description,
    category: item.category || 'utility',
    icon: undefined,
    version: item.version,
    author: item.authorId || 'Unknown',
    downloads: item.callCount || 0,
    rating: item.rating || 0,
    isEnabled: installed,
    isInstalled: installed,
    isPremium: item.pricing?.type === 'subscription' || item.pricing?.type === 'per_call',
    price: item.pricing?.pricePerCall,
    permissions: item.tags || [],
    configSchema: item.inputSchema as any,
    config: {},
  })

  const loadSkills = useCallback(async () => {
    setLoading(true)
    try {
      const [installedRes, marketplaceRes]: (SkillListResponse | null)[] = await Promise.all([
        skillApi.getInstalledSkills({ page: 1, limit: 50 }).catch((): SkillListResponse | null => null),
        skillApi.getMarketplaceSkills({ page: 1, limit: 50 }).catch((): SkillListResponse | null => null),
      ])

      const installedSkills = (installedRes?.items || []).map((s) => mapApiSkill(s, true))
      const marketSkills = (marketplaceRes?.items || []).map((s) => mapApiSkill(s, false))

      const merged = [...installedSkills]
      marketSkills.forEach((m) => {
        if (!merged.find((x) => x.id === m.id)) {
          merged.push(m)
        }
      })
      setSkills(merged.length > 0 ? merged : SAMPLE_SKILLS)
    } catch (err: any) {
      setSkills(SAMPLE_SKILLS)
      error(err?.message || t({ zh: '技能加载失败，已回退示例数据', en: 'Failed to load skills, showing samples' }))
    } finally {
      setLoading(false)
    }
  }, [error, t])

  useEffect(() => {
    loadSkills()
  }, [loadSkills])

  // 处理自动安装：从 URL 参数传入的 skillId
  useEffect(() => {
    const skillIdFromUrl = router.query.skillId as string
    const actionFromUrl = router.query.action as string
    const targetSkillId = autoInstallSkillId || skillIdFromUrl

    if (targetSkillId && actionFromUrl === 'install' && !loading && skills.length > 0) {
      const skillToInstall = skills.find(s => s.id === targetSkillId)
      if (skillToInstall && !skillToInstall.isInstalled) {
        handleInstallSkill(skillToInstall)
        // 清除 URL 参数
        const { skillId, action, ...restQuery } = router.query
        router.replace({ pathname: router.pathname, query: restQuery }, undefined, { shallow: true })
      }
    }
  }, [autoInstallSkillId, router.query.skillId, router.query.action, skills, loading])

  return (
    <div className={`${compact ? '' : 'space-y-6'}`}>
      {/* Skill Lifecycle */}
      {!compact && (
        <div className="bg-gradient-to-r from-blue-600/10 to-purple-600/10 border border-white/5 rounded-2xl p-6 mb-8">
          <div className="flex items-center gap-3 mb-6">
            <Sparkles className="text-yellow-500" size={20} />
            <h3 className="font-bold text-white uppercase tracking-wider text-sm">{t({ zh: '技能生命周期', en: 'Skill Lifecycle' })}</h3>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 relative">
            <div className="hidden md:block absolute top-4 left-[20%] right-[20%] h-0.5 border-t-2 border-dashed border-white/10 z-0" />
            
            <div className="relative z-10 space-y-3">
              <div className="w-8 h-8 rounded-full bg-blue-600 text-white flex items-center justify-center font-bold text-sm shadow-lg shadow-blue-500/20">1</div>
              <h4 className="font-bold text-slate-200">{t({ zh: '定义与部署', en: 'Define & Deploy' })}</h4>
              <p className="text-xs text-slate-500 leading-relaxed">{t({ zh: '商户定义商品对应的 API 技能描述，并部署到 Agentrix 基础设施。', en: 'Merchant defines API skill descriptions and deploys to Agentrix infrastructure.' })}</p>
            </div>

            <div className="relative z-10 space-y-3">
              <div className="w-8 h-8 rounded-full bg-indigo-600 text-white flex items-center justify-center font-bold text-sm shadow-lg shadow-indigo-500/20">2</div>
              <h4 className="font-bold text-slate-200">{t({ zh: '审核与发布', en: 'Verify & Publish' })}</h4>
              <p className="text-xs text-slate-500 leading-relaxed">{t({ zh: '技能通过安全性审核后发布至市场，获取全球 Agent 可见性。', en: 'Skills verified for security and published to marketplace for global agent visibility.' })}</p>
            </div>

            <div className="relative z-10 space-y-3">
              <div className="w-8 h-8 rounded-full bg-purple-600 text-white flex items-center justify-center font-bold text-sm shadow-lg shadow-purple-500/20">3</div>
              <h4 className="font-bold text-slate-200">{t({ zh: '订阅与获利', en: 'Subscribe & Earn' })}</h4>
              <p className="text-xs text-slate-500 leading-relaxed">{t({ zh: '用户订阅技能授权给自己的 Agent，商户通过调用产生实际收益。', en: 'User subscribes and authorizes their agent; merchants earn from skill execution.' })}</p>
            </div>
          </div>
        </div>
      )}

      {/* 头部概览 */}
      {!compact && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <div className="bg-white/5 border border-white/10 rounded-xl p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-500/20 rounded-lg">
                <Package className="w-5 h-5 text-blue-400" />
              </div>
              <div>
                <p className="text-2xl font-bold">{installedCount}</p>
                <p className="text-sm text-slate-400">{t({ zh: '已安装技能', en: 'Installed Skills' })}</p>
              </div>
            </div>
          </div>
          <div className="bg-white/5 border border-white/10 rounded-xl p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-green-500/20 rounded-lg">
                <Zap className="w-5 h-5 text-green-400" />
              </div>
              <div>
                <p className="text-2xl font-bold">{enabledCount}</p>
                <p className="text-sm text-slate-400">{t({ zh: '已启用', en: 'Enabled' })}</p>
              </div>
            </div>
          </div>
          <div className="bg-white/5 border border-white/10 rounded-xl p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-purple-500/20 rounded-lg">
                <ShoppingCart className="w-5 h-5 text-purple-400" />
              </div>
              <div>
                <p className="text-2xl font-bold">{skills.length}</p>
                <p className="text-sm text-slate-400">{t({ zh: '市场技能', en: 'Marketplace Skills' })}</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 视图切换和搜索 */}
      <div className="flex flex-col md:flex-row gap-4 mb-6">
        <div className="flex gap-2">
          <button
            onClick={() => setViewMode('installed')}
            className={`px-4 py-2 rounded-lg text-sm transition-colors ${
              viewMode === 'installed' 
                ? 'bg-blue-600 text-white' 
                : 'bg-white/5 text-slate-400 hover:text-white'
            }`}
          >
            <Package className="w-4 h-4 inline mr-2" />
            {t({ zh: '已安装', en: 'Installed' })} ({installedCount})
          </button>
          <button
            onClick={() => setViewMode('marketplace')}
            className={`px-4 py-2 rounded-lg text-sm transition-colors ${
              viewMode === 'marketplace' 
                ? 'bg-blue-600 text-white' 
                : 'bg-white/5 text-slate-400 hover:text-white'
            }`}
          >
            <ShoppingCart className="w-4 h-4 inline mr-2" />
            {t({ zh: '技能市场', en: 'Marketplace' })}
          </button>
        </div>
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={t({ zh: '搜索技能...', en: 'Search skills...' })}
            className="w-full pl-10 pr-4 py-2 bg-white/5 border border-white/10 rounded-lg text-sm"
          />
        </div>
      </div>

      {/* 分类筛选 */}
      <div className="flex gap-2 overflow-x-auto pb-2 mb-4">
        {SKILL_CATEGORIES.map((cat) => {
          const Icon = cat.icon
          return (
            <button
              key={cat.id}
              onClick={() => setSelectedCategory(cat.id)}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-sm whitespace-nowrap transition-colors ${
                selectedCategory === cat.id
                  ? 'bg-blue-600 text-white'
                  : 'bg-white/5 text-slate-400 hover:text-white hover:bg-white/10'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              {t(cat.label)}
            </button>
          )
        })}
      </div>

      {/* 技能列表 */}
      {loading ? (
        <div className="text-center py-12">
          <RefreshCw className="w-8 h-8 animate-spin mx-auto text-blue-500" />
        </div>
      ) : filteredSkills.length === 0 ? (
        <div className="text-center py-12 bg-white/5 rounded-xl">
          <Puzzle className="w-12 h-12 mx-auto text-slate-500 mb-4" />
          <p className="text-slate-400">{t({ zh: '暂无技能', en: 'No skills found' })}</p>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {filteredSkills.map((skill) => (
            <div
              key={skill.id}
              className={`bg-white/5 border rounded-xl p-4 transition-colors ${
                skill.isEnabled ? 'border-blue-500/50' : 'border-white/10'
              }`}
            >
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-start gap-3">
                  <div className={`p-2 rounded-lg ${
                    skill.category === 'payment' ? 'bg-green-500/20' :
                    skill.category === 'trading' ? 'bg-purple-500/20' :
                    skill.category === 'security' ? 'bg-red-500/20' :
                    'bg-blue-500/20'
                  }`}>
                    {skill.category === 'payment' ? <Wallet className="w-5 h-5 text-green-400" /> :
                     skill.category === 'trading' ? <TrendingUp className="w-5 h-5 text-purple-400" /> :
                     skill.category === 'security' ? <Shield className="w-5 h-5 text-red-400" /> :
                     <Puzzle className="w-5 h-5 text-blue-400" />}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h4 className="font-semibold">{skill.name}</h4>
                      {skill.isPremium && (
                        <span className="px-1.5 py-0.5 text-[10px] bg-amber-500/20 text-amber-400 rounded">PRO</span>
                      )}
                    </div>
                    <p className="text-xs text-slate-400 mt-0.5">v{skill.version} · {skill.author}</p>
                  </div>
                </div>
                {skill.isInstalled && (
                  <button
                    onClick={() => handleToggleSkill(skill.id)}
                    className={`p-1.5 rounded-lg transition-colors ${
                      skill.isEnabled ? 'bg-green-500/20 text-green-400' : 'bg-slate-500/20 text-slate-400'
                    }`}
                  >
                    {skill.isEnabled ? <ToggleRight className="w-5 h-5" /> : <ToggleLeft className="w-5 h-5" />}
                  </button>
                )}
              </div>
              
              <p className="text-sm text-slate-400 mb-3 line-clamp-2">{skill.description}</p>
              
              <div className="flex items-center gap-3 text-xs text-slate-500 mb-3">
                <span className="flex items-center gap-1">
                  <Star className="w-3 h-3 text-amber-400" />
                  {skill.rating}
                </span>
                <span className="flex items-center gap-1">
                  <Download className="w-3 h-3" />
                  {skill.downloads.toLocaleString()}
                </span>
                {skill.isPremium && skill.price && !skill.isInstalled && (
                  <span className="flex items-center gap-1 text-amber-400">
                    <DollarSign className="w-3 h-3" />
                    {skill.price}
                  </span>
                )}
              </div>
              
              <div className="flex items-center gap-2">
                {skill.isInstalled ? (
                  <>
                    {skill.configSchema && (
                      <button
                        onClick={() => handleConfigureSkill(skill)}
                        className="flex-1 px-3 py-1.5 text-sm bg-white/5 hover:bg-white/10 rounded-lg transition-colors flex items-center justify-center gap-1"
                      >
                        <Settings className="w-3.5 h-3.5" />
                        {t({ zh: '配置', en: 'Configure' })}
                      </button>
                    )}
                    <button
                      onClick={() => handleUninstallSkill(skill.id)}
                      className="px-3 py-1.5 text-sm text-red-400 hover:bg-red-500/20 rounded-lg transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </>
                ) : (
                  <button
                    onClick={() => handleInstallSkill(skill)}
                    className="flex-1 px-3 py-1.5 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors flex items-center justify-center gap-1"
                  >
                    <Download className="w-3.5 h-3.5" />
                    {skill.isPremium ? t({ zh: '购买安装', en: 'Purchase' }) : t({ zh: '安装', en: 'Install' })}
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 技能配置弹窗 */}
      {showConfigModal && selectedSkill?.configSchema && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-slate-900 border border-white/10 rounded-2xl p-6 max-w-md w-full">
            <h3 className="text-lg font-bold mb-4">
              {t({ zh: '配置', en: 'Configure' })} {selectedSkill.name}
            </h3>
            <div className="space-y-4">
              {Object.entries(selectedSkill.configSchema).map(([key, schema]: [string, any]) => (
                <div key={key}>
                  <label className="block text-sm font-medium mb-1">{schema.label || key}</label>
                  {schema.type === 'number' && (
                    <input
                      type="number"
                      defaultValue={selectedSkill.config?.[key] || schema.default}
                      className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm"
                    />
                  )}
                  {schema.type === 'boolean' && (
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        defaultChecked={selectedSkill.config?.[key] ?? schema.default}
                        className="w-4 h-4 rounded"
                      />
                      <span className="text-sm text-slate-400">{t({ zh: '启用', en: 'Enable' })}</span>
                    </label>
                  )}
                  {schema.type === 'select' && (
                    <select
                      defaultValue={selectedSkill.config?.[key] || schema.default}
                      className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm"
                    >
                      {schema.options?.map((opt: string) => (
                        <option key={opt} value={opt}>{opt}</option>
                      ))}
                    </select>
                  )}
                </div>
              ))}
            </div>
            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setShowConfigModal(false)}
                className="flex-1 px-4 py-2 bg-white/5 hover:bg-white/10 rounded-lg transition-colors"
              >
                {t({ zh: '取消', en: 'Cancel' })}
              </button>
              <button
                onClick={() => handleSaveConfig(selectedSkill.config || {})}
                className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
              >
                {t({ zh: '保存', en: 'Save' })}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
