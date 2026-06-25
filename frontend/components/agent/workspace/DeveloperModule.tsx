import { useState, useCallback, useEffect } from 'react'
import { useLocalization } from '../../../contexts/LocalizationContext'
import { useUser } from '../../../contexts/UserContext'
import { userAgentApi } from '../../../lib/api/user-agent.api'
import { statisticsApi } from '../../../lib/api/statistics.api'
import { apiKeyApi, type ApiKey } from '../../../lib/api/api-key.api'
import { PromotionPanel } from '../PromotionPanel'
import { webhookApi, type WebhookConfig } from '../../../lib/api/webhook.api'
import type { TrendPoint } from '../../../lib/api/statistics.api'
import { 
  Plus, 
  Search, 
  Activity, 
  Zap, 
  Settings, 
  Key, 
  Webhook, 
  Terminal, 
  ShieldCheck,
  Trash2,
  Copy,
  Check,
  Eye,
  EyeOff,
  RefreshCw,
  CreditCard,
  Globe,
  Share2,
  User
} from 'lucide-react'

import { SkillRegistry } from '../../workspace/SkillRegistry'
import { PackCenter } from '../../workspace/PackCenter'
import { TestHarness } from '../../workspace/TestHarness'
import { DeveloperAccountDashboard } from '../../developer/DeveloperAccountDashboard'

// 定义UserAgent类型（与后端实体对应）

type UserAgent = {
  id: string
  userId: string
  name: string
  status: 'active' | 'paused' | 'archived'
  createdAt: string
  updatedAt: string
  isPublished?: boolean
  metadata?: {
    persona?: 'personal' | 'merchant' | 'developer'
    [key: string]: any
  }
  settings?: {
    payoutWallet?: string
    [key: string]: any
  }
}

interface DeveloperModuleProps {
  onCommand?: (command: string, data?: any) => any
  initialTab?: 'checklist' | 'api' | 'revenue' | 'agents' | 'code' | 'webhooks' | 'logs' | 'simulator' | 'settings' | 'skills' | 'packs' | 'marketplace' | 'promotion' | 'account'
}

/**
 * 开发者功能模块
 * 集成API统计、收益查看、Agent管理等功能
 */
export function DeveloperModule({ onCommand, initialTab }: DeveloperModuleProps) {
  const { t } = useLocalization()
  const { user, registerRole } = useUser()

  // 增加日志以诊断注册跳转问题
  useEffect(() => {
    console.log('[DeveloperModule] User state changed:', {
      hasUser: !!user,
      roles: user?.roles,
      isDeveloper: user?.roles?.includes('developer' as any)
    })
  }, [user])

  const isDeveloper = user?.roles?.includes('developer' as any)

  const [activeTab, setActiveTab] = useState<'checklist' | 'api' | 'revenue' | 'agents' | 'skills' | 'packs' | 'code' | 'webhooks' | 'logs' | 'simulator' | 'marketplace' | 'settings' | 'promotion' | 'account'>(initialTab || 'checklist')



  // 注册状态
  const [registering, setRegistering] = useState(false)
  const handleRegister = async () => {
    setRegistering(true)
    try {
      console.log('[DeveloperModule] Registering as developer...')
      await registerRole('developer' as any)
      
      // 提醒用户并强制刷新以确保所有状态同步
      if (confirm(t({ 
        zh: '开发者权限已开通！点击“确定”刷新页面进入开发者工具。', 
        en: 'Developer access enabled! Click OK to refresh and enter tools.' 
      }))) {
        window.location.reload()
      } else {
        // 如果不刷新，也尝试分发事件
        window.dispatchEvent(new Event('role-updated'))
      }
    } catch (error) {
      console.error('注册失败:', error)
    } finally {
      setRegistering(false)
    }
  }



  // 当 initialTab 改变时更新 activeTab
  useEffect(() => {
    if (initialTab) {
      setActiveTab(initialTab)
    }
  }, [initialTab])

  // 处理命令
  useEffect(() => {
    if (onCommand) {
      const handleCommand = (command: string) => {
        const result = onCommand(command)
        if (result?.view === 'developer') {
          if (result.action === 'view_lifecycle') {
            setActiveTab('checklist')
          } else if (result.action === 'view_api_stats') {
            setActiveTab('api')
          } else if (result.action === 'view_revenue') {
            setActiveTab('revenue')
          }
        }
      }
    }
  }, [onCommand])


  const [apiStats, setApiStats] = useState<any>(null)
  const [revenue, setRevenue] = useState<any>(null)
  const [agents, setAgents] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [apiTrend, setApiTrend] = useState<TrendPoint[]>([])
  const [apiTrendRange, setApiTrendRange] = useState<{ startDate: string; endDate: string }>({
    startDate: '',
    endDate: '',
  })
  const [apiGranularity, setApiGranularity] = useState<'day' | 'hour'>('day')
  const [revenueTrend, setRevenueTrend] = useState<TrendPoint[]>([])
  const [revenueRange, setRevenueRange] = useState<{ startDate: string; endDate: string }>({
    startDate: '',
    endDate: '',
  })
  const [selectedAgent, setSelectedAgent] = useState<UserAgent | null>(null)
  const [selectedAgentStats, setSelectedAgentStats] = useState<any>(null)
  const [agentStatsLoading, setAgentStatsLoading] = useState(false)
  const [copiedId, setCopiedId] = useState<string | null>(null)

  const [apiKeys, setApiKeys] = useState<ApiKey[]>([])
  const [webhooks, setWebhooks] = useState<WebhookConfig[]>([])

  const loadApiKeys = useCallback(async () => {
    try {
      const data = await apiKeyApi.list()
      setApiKeys(data || [])
    } catch (error) {
      console.error('加载 API 密钥失败:', error)
    }
  }, [])

  const loadWebhooks = useCallback(async () => {
    try {
      const data = await webhookApi.getWebhooks()
      setWebhooks(data || [])
    } catch (error) {
      console.error('加载 Webhook 失败:', error)
    }
  }, [])

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text)
    setCopiedId(id)
    setTimeout(() => setCopiedId(null), 2000)
  }

  const loadApiStats = useCallback(async () => {
    setLoading(true)
    try {
      // 调用API统计API
      const data = await statisticsApi.getApiStatistics()
      setApiStats({
        todayCalls: data.todayCalls,
        totalCalls: data.totalCalls,
        successRate: typeof data.successRate === 'number' 
          ? `${(data.successRate * 100).toFixed(1)}%` 
          : data.successRate,
        avgResponseTime: typeof data.avgResponseTime === 'number'
          ? `${data.avgResponseTime}ms`
          : data.avgResponseTime,
      })
    } catch (error: any) {
      console.error('加载API统计失败:', error)
      // 如果API失败，使用mock数据作为fallback
      setApiStats({
        todayCalls: 1842,
        totalCalls: 45678,
        successRate: '99.5%',
        avgResponseTime: '320ms',
      })
    } finally {
      setLoading(false)
    }
  }, [])

  const loadApiTrend = useCallback(
    async (range?: { startDate?: string; endDate?: string }, granularity?: 'day' | 'hour') => {
      try {
        const trend = await statisticsApi.getApiTrend({
          startDate: range?.startDate,
          endDate: range?.endDate,
          granularity: granularity || apiGranularity,
        })
        setApiTrend(trend || [])
      } catch (error) {
        console.error('加载API趋势失败:', error)
        setApiTrend([])
      }
    },
    [apiGranularity],
  )

  const loadRevenue = useCallback(async () => {
    setLoading(true)
    try {
      // 调用收益API
      const data = await statisticsApi.getDeveloperRevenue()
      setRevenue({
        totalRevenue: typeof data.totalRevenue === 'number' 
          ? `¥${data.totalRevenue.toLocaleString()}` 
          : data.totalRevenue,
        todayRevenue: typeof data.todayRevenue === 'number'
          ? `¥${data.todayRevenue.toLocaleString()}`
          : data.todayRevenue,
        commission: typeof data.commission === 'number'
          ? `¥${data.commission.toLocaleString()}`
          : data.commission,
        pending: typeof data.pending === 'number'
          ? `¥${data.pending.toLocaleString()}`
          : data.pending,
      })
    } catch (error: any) {
      console.error('加载收益失败:', error)
      // 如果API失败，使用mock数据作为fallback
      setRevenue({
        totalRevenue: '¥12,500',
        todayRevenue: '¥450',
        commission: '¥3,750',
        pending: '¥1,200',
      })
    } finally {
      setLoading(false)
    }
  }, [])

  const loadRevenueTrend = useCallback(async (range?: { startDate?: string; endDate?: string }) => {
    try {
      const trend = await statisticsApi.getRevenueTrend({
        startDate: range?.startDate,
        endDate: range?.endDate,
        granularity: 'day',
      })
      setRevenueTrend(trend || [])
    } catch (error) {
      console.error('加载收益趋势失败:', error)
      setRevenueTrend([])
    }
  }, [])

  const loadAgents = useCallback(async () => {
    setLoading(true)
    try {
      const data = await userAgentApi.getMyAgents()
      setAgents(data || [])
    } catch (error: any) {
      console.error('加载Agent列表失败:', error)
      // 如果API失败，使用mock数据作为fallback
      if (error.message?.includes('401') || error.message?.includes('Unauthorized')) {
        setAgents([])
      } else {
        setAgents([
          {
            id: 'agent_demo_1',
            name: '示例Agent',
            description: '这是一个示例Agent',
            status: 'active',
            isPublished: true,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
        ])
      }
    } finally {
      setLoading(false)
    }
  }, [])

  const handleToggleAgentStatus = async (agent: UserAgent) => {
    try {
      const next = agent.status === 'active' ? 'paused' : 'active'
      await userAgentApi.toggleStatus(agent.id, next)
      loadAgents()
    } catch (error) {
      console.error('切换Agent状态失败:', error)
      alert(t({ zh: '切换失败，请稍后再试', en: 'Failed to toggle status, please try again later' }))
    }
  }

  const handleViewAgentStats = async (agent: UserAgent) => {
    setAgentStatsLoading(true)
    setSelectedAgent(agent)
    try {
      const stats = await userAgentApi.getStats(agent.id)
      setSelectedAgentStats(stats)
    } catch (error) {
      console.error('加载Agent统计失败:', error)
      setSelectedAgentStats(null)
    } finally {
      setAgentStatsLoading(false)
    }
  }

  const renderTrendChart = (trend: TrendPoint[], accent: 'blue' | 'green' = 'blue') => {
    if (!trend.length) {
      return (
        <div className="h-24 flex items-center justify-center text-xs text-slate-500">
          {t({ zh: '暂无趋势数据', en: 'No trend data' })}
        </div>
      )
    }
    const max = Math.max(...trend.map((point) => point.value))
    const colorClass =
      accent === 'green'
        ? 'bg-emerald-500/70'
        : 'bg-blue-500/70'
    return (
      <div className="h-24 flex items-end space-x-1">
        {trend.map((point) => (
          <div key={point.date} className="flex-1 flex flex-col items-center space-y-1">
            <div
              className={`w-full rounded-t-md ${colorClass}`}
              style={{ height: max ? `${(point.value / max) * 100}%` : '10%' }}
            ></div>
            <span className="text-[10px] text-slate-400 truncate w-full text-center">{point.date.slice(-5)}</span>
          </div>
        ))}
      </div>
    )
  }

  useEffect(() => {
    if (activeTab === 'api') {
      loadApiStats()
      loadApiTrend(apiTrendRange, apiGranularity)
    } else if (activeTab === 'revenue') {
      loadRevenue()
      loadRevenueTrend(revenueRange)
    } else if (activeTab === 'agents') {
      loadAgents()
    } else if (activeTab === 'settings') {
      loadApiKeys()
    } else if (activeTab === 'webhooks') {
      loadWebhooks()
    }
  }, [
    activeTab,
    apiGranularity,
    apiTrendRange,
    revenueRange,
    loadApiStats,
    loadRevenue,
    loadAgents,
    loadApiTrend,
    loadRevenueTrend,
    loadApiKeys,
    loadWebhooks,
  ])

  if (!isDeveloper) {
    return (
      <div className="h-full flex flex-col items-center justify-center bg-slate-950 p-6">
        <div className="max-w-md w-full bg-slate-900 border border-white/10 rounded-2xl p-8 space-y-6 text-center">
          <div className="w-16 h-16 bg-indigo-600/20 rounded-full flex items-center justify-center mx-auto mb-4">
            <Terminal className="w-8 h-8 text-indigo-500" />
          </div>
          <h2 className="text-2xl font-bold text-white">{t({ zh: '开通开发者权限', en: 'Enable Developer Access' })}</h2>
          <p className="text-slate-400">
            {t({ zh: '开通后即可访问 API、SDK、Webhooks 以及 Agent 编排工具。', en: 'Access API, SDK, Webhooks and Agent orchestration tools after enabling.' })}
          </p>
          <button
            onClick={handleRegister}
            disabled={registering}
            className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 rounded-xl transition-colors disabled:opacity-50"
          >
            {registering ? t({ zh: '开通中...', en: 'Enabling...' }) : t({ zh: '立即开通', en: 'Enable Now' })}
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col bg-slate-950">
      {/* 标签页 */}
      <div className="border-b border-white/10 bg-slate-900/50 px-6 overflow-x-auto">
        <div className="flex space-x-1 min-w-max">
          {[
            { key: 'account' as const, label: { zh: '开发者账户', en: 'Account' } },
            { key: 'checklist' as const, label: { zh: '开发进度', en: 'Skill Lifecycle' } },
            { key: 'api' as const, label: { zh: 'API统计', en: 'API Stats' } },

            { key: 'revenue' as const, label: { zh: '收益查看', en: 'Revenue' } },
            { key: 'agents' as const, label: { zh: 'Agent管理', en: 'Agents' } },
            { key: 'skills' as const, label: { zh: '技能库', en: 'Skill Registry' } },
            { key: 'packs' as const, label: { zh: '打包中心', en: 'Pack Center' } },
            { key: 'code' as const, label: { zh: '代码生成', en: 'Code' } },
            { key: 'webhooks' as const, label: { zh: 'Webhooks', en: 'Webhooks' } },
            { key: 'logs' as const, label: { zh: '调用日志', en: 'Logs' } },
            { key: 'simulator' as const, label: { zh: '测试台', en: 'Test Harness' } },
            { key: 'marketplace' as const, label: { zh: '市场发布', en: 'Marketplace' } },
            { key: 'promotion' as const, label: { zh: '推广中心', en: 'Promotion' } },
            { key: 'settings' as const, label: { zh: '开发者设置', en: 'Settings' } },

          ].map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`px-4 py-3 text-sm font-medium transition-colors whitespace-nowrap ${
                activeTab === tab.key
                  ? 'border-b-2 border-blue-500 text-blue-400'
                  : 'text-slate-400 hover:text-slate-300'
              }`}
            >
              {t(tab.label)}
            </button>
          ))}
        </div>
      </div>

      {/* 内容区域 */}
      <div className="flex-1 overflow-y-auto p-6">
        {/* 开发者账户 */}
        {activeTab === 'account' && (
          <DeveloperAccountDashboard 
            onNavigate={(tab) => {
              // 支持从账户仪表盘跳转到其他标签
              if (['api', 'revenue', 'settings'].includes(tab)) {
                setActiveTab(tab as any)
              }
            }} 
          />
        )}

        {activeTab === 'checklist' && (
          <div className="space-y-6 max-w-4xl">
            <div className="bg-purple-600/10 border border-purple-500/20 rounded-2xl p-6 mb-8">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-xl font-bold text-purple-400 mb-2">Skill Build → Test → Publish</h3>
                  <p className="text-sm text-slate-400">开发一次，自动适配多 AI 生态产物</p>
                </div>
                <div className="text-right">
                  <span className="text-3xl font-bold text-purple-400">25%</span>
                  <p className="text-[10px] text-slate-500 uppercase font-bold tracking-widest">Build Status</p>
                </div>
              </div>
              <div className="w-full bg-slate-800 h-2 rounded-full mt-4 overflow-hidden">
                <div className="bg-purple-500 h-full w-[25%] transition-all"></div>
              </div>
            </div>

            <div className="grid gap-4">
              {[
                { title: '创建 Skill (commerce-min)', desc: '使用标准模板定义技能 Spec (Schema + Policy)', status: 'completed', tab: 'skills' },
                { title: '校验 Spec & Policy', desc: '运行静态校验确保符合 AX Spec V2 标准', status: 'in_progress', tab: 'skills' },
                { title: '一键 Build Packs', desc: '自动打包生成 OpenAI Actions 与 Claude MCP 产物', status: 'pending', tab: 'packs' },
                { title: '一键 Test (E2E)', desc: '模拟 AI 调用、验证 Webhook 与沙盒交易流', status: 'pending', tab: 'simulator' },
                { title: '发布到 Marketplace', desc: '配置 Skill 定价、使用权限与开发者分润', status: 'pending', tab: 'marketplace' },
                { title: '分发连接器', desc: '选择目标生态并生成一键安装包/说明文件', status: 'pending', tab: 'packs' }
              ].map((step, i) => (
                <div key={i} className="bg-white/5 border border-white/10 rounded-xl p-5 flex items-center justify-between hover:bg-white/10 transition-all">
                  <div className="flex items-center gap-4">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm ${
                      step.status === 'completed' ? 'bg-emerald-500/20 text-emerald-400' : 
                      step.status === 'in_progress' ? 'bg-purple-500/20 text-purple-400 animate-pulse' : 
                      'bg-slate-800 text-slate-500'
                    }`}>
                      {step.status === 'completed' ? <Check size={16} /> : i + 1}
                    </div>
                    <div>
                      <h4 className={`font-bold ${step.status === 'completed' ? 'text-slate-300' : 'text-white'}`}>{step.title}</h4>
                      <p className="text-xs text-slate-500">{step.desc}</p>
                    </div>
                  </div>
                  <button 
                    onClick={() => setActiveTab(step.tab as any)}
                    className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${
                      step.status === 'completed' ? 'bg-slate-800 text-slate-500' : 'bg-purple-600 text-white hover:bg-purple-700'
                    }`}
                  >
                    {step.status === 'completed' ? '查看' : step.status === 'in_progress' ? '继续' : '启动'}
                  </button>
                </div>
              ))}
            </div>
            
            <div className="mt-8 p-6 bg-slate-900 border border-white/5 rounded-2xl">
              <h4 className="font-bold mb-4 flex items-center gap-2">
                <Zap size={18} className="text-yellow-400" />
                验收交付产物
              </h4>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="p-4 bg-white/5 rounded-xl border border-white/5 text-center">
                  <p className="text-[10px] text-slate-500 uppercase font-bold mb-1">可安装包</p>
                  <p className="text-xs font-medium">Connector-v1.zip</p>
                </div>
                <div className="p-4 bg-white/5 rounded-xl border border-white/5 text-center">
                  <p className="text-[10px] text-slate-500 uppercase font-bold mb-1">测试报告</p>
                  <p className="text-xs font-medium text-emerald-400">Pass (12/12)</p>
                </div>
                <div className="p-4 bg-white/5 rounded-xl border border-white/5 text-center">
                  <p className="text-[10px] text-slate-500 uppercase font-bold mb-1">Receipt 列表</p>
                  <p className="text-xs font-medium text-blue-400">8 已生成</p>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'api' && (

          <div className="space-y-6">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
              <div>
                <h3 className="text-lg font-semibold">{t({ zh: 'API统计', en: 'API Statistics' })}</h3>
                <p className="text-xs text-slate-400">
                  {t({ zh: '查看调用量、成功率与响应时间', en: 'Track calls, success rate and latency' })}
                </p>
              </div>
              <div className="flex flex-wrap gap-2 items-center">
                <input
                  type="date"
                  value={apiTrendRange.startDate}
                  onChange={(e) => setApiTrendRange((prev) => ({ ...prev, startDate: e.target.value }))}
                  className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white focus:border-blue-500 focus:ring-2 focus:ring-blue-400/30"
                />
                <input
                  type="date"
                  value={apiTrendRange.endDate}
                  onChange={(e) => setApiTrendRange((prev) => ({ ...prev, endDate: e.target.value }))}
                  className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white focus:border-blue-500 focus:ring-2 focus:ring-blue-400/30"
                />
                <select
                  value={apiGranularity}
                  onChange={(e) => setApiGranularity(e.target.value as 'day' | 'hour')}
                  className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white focus:border-blue-500 focus:ring-2 focus:ring-blue-400/30"
                >
                  <option value="day">{t({ zh: '按天', en: 'Daily' })}</option>
                  <option value="hour">{t({ zh: '按小时', en: 'Hourly' })}</option>
                </select>
                <button
                  onClick={() => loadApiTrend(apiTrendRange, apiGranularity)}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 transition-colors"
                >
                  {t({ zh: '刷新', en: 'Refresh' })}
                </button>
              </div>
            </div>
            {loading ? (
              <div className="text-center py-12">
                <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto"></div>
              </div>
            ) : apiStats ? (
              <>
                <div className="grid md:grid-cols-2 gap-4">
                  <div className="bg-white/5 border border-white/10 rounded-lg p-4">
                    <p className="text-sm text-slate-400 mb-1">{t({ zh: '今日调用', en: 'Today Calls' })}</p>
                    <p className="text-2xl font-bold">{apiStats.todayCalls.toLocaleString()}</p>
                  </div>
                  <div className="bg-white/5 border border-white/10 rounded-lg p-4">
                    <p className="text-sm text-slate-400 mb-1">{t({ zh: '总调用量', en: 'Total Calls' })}</p>
                    <p className="text-2xl font-bold">{apiStats.totalCalls.toLocaleString()}</p>
                  </div>
                  <div className="bg-white/5 border border-white/10 rounded-lg p-4">
                    <p className="text-sm text-slate-400 mb-1">{t({ zh: '成功率', en: 'Success Rate' })}</p>
                    <p className="text-2xl font-bold">{apiStats.successRate}</p>
                  </div>
                  <div className="bg-white/5 border border-white/10 rounded-lg p-4">
                    <p className="text-sm text-slate-400 mb-1">{t({ zh: '平均响应时间', en: 'Avg Response Time' })}</p>
                    <p className="text-2xl font-bold">{apiStats.avgResponseTime}</p>
                  </div>
                </div>
                <div className="bg-white/5 border border-white/10 rounded-2xl p-4">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-sm font-semibold text-slate-200">
                      {t({ zh: 'API 调用趋势', en: 'API Trend' })}
                    </p>
                    <p className="text-xs text-slate-500">
                      {t({ zh: '最近', en: 'Latest' })} {apiTrend.length} {t({ zh: '个点', en: 'points' })}
                    </p>
                  </div>
                  {renderTrendChart(apiTrend, 'blue')}
                </div>
              </>
            ) : (
              <div className="text-center py-12 text-slate-400">
                {t({ zh: '暂无API数据', en: 'No API data' })}
              </div>
            )}
          </div>
        )}

        {activeTab === 'revenue' && (
          <div className="space-y-6">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
              <div>
                <h3 className="text-lg font-semibold">{t({ zh: '收益查看', en: 'Revenue View' })}</h3>
                <p className="text-xs text-slate-400">
                  {t({ zh: '追踪收益、佣金与待结算', en: 'Track earnings, commission and pending payouts' })}
                </p>
              </div>
              <div className="flex flex-wrap gap-2 items-center">
                <input
                  type="date"
                  value={revenueRange.startDate}
                  onChange={(e) => setRevenueRange((prev) => ({ ...prev, startDate: e.target.value }))}
                  className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white focus:border-blue-500 focus:ring-2 focus:ring-blue-400/30"
                />
                <input
                  type="date"
                  value={revenueRange.endDate}
                  onChange={(e) => setRevenueRange((prev) => ({ ...prev, endDate: e.target.value }))}
                  className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white focus:border-blue-500 focus:ring-2 focus:ring-blue-400/30"

                />
                <button
                  onClick={() => {
                    loadRevenue()
                    loadRevenueTrend(revenueRange)
                  }}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 transition-colors"
                >
                  {t({ zh: '刷新', en: 'Refresh' })}
                </button>
              </div>
            </div>
            {loading ? (
              <div className="text-center py-12">
                <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto"></div>
              </div>
            ) : revenue ? (
              <>
                <div className="grid md:grid-cols-2 gap-4">
                  <div className="bg-white/5 border border-white/10 rounded-lg p-4">
                    <p className="text-sm text-slate-400 mb-1">{t({ zh: '总收益', en: 'Total Revenue' })}</p>
                    <p className="text-2xl font-bold">{revenue.totalRevenue}</p>
                  </div>
                  <div className="bg-white/5 border border-white/10 rounded-lg p-4">
                    <p className="text-sm text-slate-400 mb-1">{t({ zh: '今日收益', en: 'Today Revenue' })}</p>
                    <p className="text-2xl font-bold">{revenue.todayRevenue}</p>
                  </div>
                  <div className="bg-white/5 border border-white/10 rounded-lg p-4">
                    <p className="text-sm text-slate-400 mb-1">{t({ zh: '佣金收入', en: 'Commission' })}</p>
                    <p className="text-2xl font-bold">{revenue.commission}</p>
                  </div>
                  <div className="bg-white/5 border border-white/10 rounded-lg p-4">
                    <p className="text-sm text-slate-400 mb-1">{t({ zh: '待结算', en: 'Pending' })}</p>
                    <p className="text-2xl font-bold">{revenue.pending}</p>
                  </div>
                </div>
                <div className="bg-white/5 border border-white/10 rounded-2xl p-4">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-sm font-semibold text-slate-200">
                      {t({ zh: '收益趋势', en: 'Revenue Trend' })}
                    </p>
                    <p className="text-xs text-slate-500">
                      {t({ zh: '最近', en: 'Latest' })} {revenueTrend.length} {t({ zh: '个点', en: 'points' })}
                    </p>
                  </div>
                  {renderTrendChart(revenueTrend, 'green')}
                </div>
              </>
            ) : (
              <div className="text-center py-12 text-slate-400">
                {t({ zh: '暂无收益数据', en: 'No revenue data' })}
              </div>
            )}
          </div>
        )}

        {activeTab === 'agents' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-lg font-semibold">{t({ zh: 'Agent管理', en: 'Agent Management' })}</h3>
                <p className="text-xs text-slate-400">
                  {t({ zh: '查看Agent运行状态与收益', en: 'Monitor agent status and revenue' })}
                </p>
              </div>
              <button className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 transition-colors">
                {t({ zh: '创建Agent', en: 'Create Agent' })}
              </button>
            </div>
            {loading ? (
              <div className="text-center py-12">
                <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto"></div>
              </div>
            ) : agents.length === 0 ? (
              <div className="text-center py-12 text-slate-400">
                {t({ zh: '暂无Agent', en: 'No agents' })}
                <button className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 transition-colors">
                  {t({ zh: '创建第一个Agent', en: 'Create First Agent' })}
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                {agents.map((agent) => (
                  <div key={agent.id} className="bg-white/5 border border-white/10 rounded-lg p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-semibold">{agent.name}</p>
                        <p className="text-sm text-slate-400">{agent.id}</p>
                      </div>
                      <span
                        className={`px-2 py-1 text-xs rounded ${
                          agent.status === 'active' ? 'bg-green-500/20 text-green-400' : 'bg-gray-500/20 text-gray-400'
                        }`}
                      >
                        {agent.status === 'active' ? t({ zh: '运行中', en: 'Running' }) : t({ zh: '已停止', en: 'Stopped' })}
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-2 text-xs text-slate-400">
                      <span>{t({ zh: '模板', en: 'Template' })}: {agent.templateId || '-'}</span>
                      <span>•</span>
                      <span>{t({ zh: '创建于', en: 'Created' })}: {new Date(agent.createdAt).toLocaleDateString()}</span>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button
                        onClick={() => handleViewAgentStats(agent)}
                        className="px-3 py-1 rounded-lg border border-white/10 text-sm text-white hover:border-blue-400"
                      >
                        {t({ zh: '查看数据', en: 'View Stats' })}
                      </button>
                      <button
                        onClick={() => handleToggleAgentStatus(agent)}
                        className="px-3 py-1 rounded-lg bg-blue-600 text-white text-sm hover:bg-blue-700"
                      >
                        {agent.status === 'active'
                          ? t({ zh: '暂停', en: 'Pause' })
                          : t({ zh: '启动', en: 'Activate' })}
                      </button>
                      <button className="px-3 py-1 rounded-lg border border-white/10 text-sm text-white hover:border-blue-400">
                        {t({ zh: '管理', en: 'Manage' })}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === 'skills' && (
          <div className="space-y-4">
            <SkillRegistry />
          </div>
        )}

        {activeTab === 'packs' && (
          <div className="space-y-4">
            <PackCenter />
          </div>
        )}

        {activeTab === 'marketplace' && (
          <div className="space-y-4">
            <div className="bg-white/5 border border-white/10 rounded-lg p-6">
              <h3 className="text-lg font-semibold mb-4">市场发布管理</h3>
              <p className="text-slate-400 mb-6">管理您的 Skills 和 Agents 在 Marketplace 的上架状态、定价与分润。</p>
              
              <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl p-4 mb-6">
                <p className="text-sm text-blue-300 flex items-center gap-2">
                  <Zap size={16} />
                  您的 3 个 Skill 正在热卖中，昨日产生分润 $120.50
                </p>
              </div>

              <div className="divide-y divide-white/5">
                {[
                  { name: 'Crypto Payment Skill', status: 'Published', price: '$0.1/call', share: '70%' },
                  { name: 'E-commerce Sync Tool', status: 'Pending Review', price: '$5/mo', share: '80%' }
                ].map((item, i) => (
                  <div key={i} className="py-4 flex items-center justify-between">
                    <div>
                      <p className="font-medium">{item.name}</p>
                      <p className="text-xs text-slate-500">Status: {item.status} | Price: {item.price}</p>
                    </div>
                    <div className="flex gap-2">
                      <button className="px-3 py-1 text-xs bg-white/5 hover:bg-white/10 rounded border border-white/10">管理</button>
                      <button className="px-3 py-1 text-xs bg-blue-600/20 text-blue-400 border border-blue-500/30 rounded">更新</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'code' && (

          <div className="space-y-4">
            <h3 className="text-lg font-semibold mb-4">{t({ zh: '代码生成', en: 'Code Generation' })}</h3>
            <div className="bg-white/5 border border-white/10 rounded-lg p-6">
              <p className="text-slate-300 mb-4">
                {t({
                  zh: '在对话中输入代码生成需求，Agent会自动生成相应的代码片段',
                  en: 'Enter code generation requirements in the conversation, Agent will automatically generate corresponding code snippets',
                })}
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                <button
                  onClick={() => onCommand?.('generate_code', { type: 'payment' })}
                  className="flex items-center justify-between p-4 bg-white/5 border border-white/10 rounded-xl hover:border-blue-500/50 transition-colors group"
                >
                  <div className="text-left">
                    <p className="font-medium text-white group-hover:text-blue-400 transition-colors">{t({ zh: '支付集成代码', en: 'Payment Integration' })}</p>
                    <p className="text-xs text-slate-400">{t({ zh: '生成 React/Vue 支付组件', en: 'Generate React/Vue components' })}</p>
                  </div>
                  <div className="w-8 h-8 bg-blue-500/10 rounded-lg flex items-center justify-center text-blue-400">
                    <CreditCard className="w-4 h-4" />
                  </div>
                </button>
                <button
                  onClick={() => onCommand?.('generate_code', { type: 'webhook' })}
                  className="flex items-center justify-between p-4 bg-white/5 border border-white/10 rounded-xl hover:border-blue-500/50 transition-colors group"
                >
                  <div className="text-left">
                    <p className="font-medium text-white group-hover:text-blue-400 transition-colors">{t({ zh: 'Webhook 处理程序', en: 'Webhook Handler' })}</p>
                    <p className="text-xs text-slate-400">{t({ zh: '生成 Node.js/Python 回调处理', en: 'Generate Node.js/Python handlers' })}</p>
                  </div>
                  <div className="w-8 h-8 bg-purple-500/10 rounded-lg flex items-center justify-center text-purple-400">
                    <Globe className="w-4 h-4" />
                  </div>
                </button>
              </div>
              <div className="bg-black/40 rounded-xl p-4 border border-white/5 font-mono text-xs text-blue-300 overflow-x-auto">
                <pre>{`// Example: Initialize Agentrix SDK
import { Agentrix } from '@agentrix/sdk';

const agentrix = new Agentrix({
  apiKey: 'your_api_key_here'
});

// Create a payment session
const session = await agentrix.payments.create({
  amount: 100,
  currency: 'USDT',
  orderId: 'order_123'
});`}</pre>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'webhooks' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-lg font-semibold">{t({ zh: 'Webhook 配置', en: 'Webhook Config' })}</h3>
                <p className="text-xs text-slate-400">
                  {t({ zh: '配置事件通知回调地址', en: 'Configure event notification callback URLs' })}
                </p>
              </div>
              <button 
                onClick={async () => {
                  const url = prompt(t({ zh: '请输入 Webhook URL', en: 'Enter Webhook URL' }))
                  if (url) {
                    try {
                      await webhookApi.create({ url, events: ['payment.success', 'payment.failed'] })
                      loadWebhooks()
                    } catch (error) {
                      console.error('创建 Webhook 失败:', error)
                    }
                  }
                }}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 transition-colors"
              >
                {t({ zh: '添加 Webhook', en: 'Add Webhook' })}
              </button>
            </div>
            {webhooks.length === 0 ? (
              <div className="bg-white/5 border border-white/10 rounded-lg p-6 text-center text-slate-400">
                {t({ zh: '暂无 Webhook 配置', en: 'No Webhook configurations' })}
              </div>
            ) : (
              <div className="space-y-3">
                {webhooks.map((hook) => (
                  <div key={hook.id} className="bg-white/5 border border-white/10 rounded-lg p-4 flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-white">{hook.url}</p>
                      <p className="text-xs text-slate-400">{hook.events.join(', ')}</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className={`px-2 py-0.5 rounded text-[10px] ${hook.active ? 'bg-green-500/20 text-green-400' : 'bg-slate-500/20 text-slate-400'}`}>
                        {hook.active ? 'Active' : 'Inactive'}
                      </span>
                      <button 
                        onClick={async () => {
                          if (confirm(t({ zh: '确定删除吗？', en: 'Are you sure?' }))) {
                            try {
                              await webhookApi.delete(hook.id)
                              loadWebhooks()
                            } catch (error) {
                              console.error('删除 Webhook 失败:', error)
                            }
                          }
                        }}
                        className="text-slate-400 hover:text-red-400"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === 'logs' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-lg font-semibold">{t({ zh: '运行日志', en: 'Runtime Logs' })}</h3>
                <p className="text-xs text-slate-400">
                  {t({ zh: '查看 API 调用与 Agent 运行日志', en: 'View API calls and Agent runtime logs' })}
                </p>
              </div>
              <button className="px-4 py-2 border border-white/10 text-white rounded-lg text-sm hover:bg-white/10 transition-colors">
                {t({ zh: '导出日志', en: 'Export Logs' })}
              </button>
            </div>
            <div className="bg-white/5 border border-white/10 rounded-lg overflow-hidden">
              <table className="w-full text-sm text-left">
                <thead className="bg-white/5 text-slate-400">
                  <tr>
                    <th className="px-4 py-3 font-medium">{t({ zh: '时间', en: 'Time' })}</th>
                    <th className="px-4 py-3 font-medium">{t({ zh: '类型', en: 'Type' })}</th>
                    <th className="px-4 py-3 font-medium">{t({ zh: '内容', en: 'Content' })}</th>
                    <th className="px-4 py-3 font-medium">{t({ zh: '状态', en: 'Status' })}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  <tr className="text-slate-300">
                    <td className="px-4 py-3">2024-05-20 14:30:05</td>
                    <td className="px-4 py-3">API_CALL</td>
                    <td className="px-4 py-3">GET /api/v1/agents</td>
                    <td className="px-4 py-3 text-green-400">200 OK</td>
                  </tr>
                  <tr className="text-slate-300">
                    <td className="px-4 py-3">2024-05-20 14:28:12</td>
                    <td className="px-4 py-3">AGENT_EVENT</td>
                    <td className="px-4 py-3">Agent [Agent-001] started</td>
                    <td className="px-4 py-3 text-blue-400">INFO</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeTab === 'simulator' && (
          <div className="space-y-4">
            <TestHarness />
          </div>
        )}


        {/* 推广中心 */}
        {activeTab === 'promotion' && (
          <PromotionPanel />
        )}

        {activeTab === 'settings' && (
          <div className="space-y-6">
            <h3 className="text-lg font-semibold mb-4">{t({ zh: '开发者设置', en: 'Developer Settings' })}</h3>
            
            <div className="space-y-4">
              <div className="bg-white/5 border border-white/10 rounded-lg p-4">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <p className="font-medium">{t({ zh: '开发者模式', en: 'Developer Mode' })}</p>
                    <p className="text-xs text-slate-400">{t({ zh: '启用高级调试与沙盒环境', en: 'Enable advanced debugging and sandbox' })}</p>
                  </div>
                  <div className="w-12 h-6 bg-blue-600 rounded-full relative">
                    <div className="absolute right-1 top-1 w-4 h-4 bg-white rounded-full"></div>
                  </div>
                </div>
              </div>

              <div className="bg-white/5 border border-white/10 rounded-lg p-4">
                <div className="flex items-center justify-between mb-4">
                  <p className="font-medium">{t({ zh: 'API 密钥管理', en: 'API Key Management' })}</p>
                  <button 
                    onClick={async () => {
                      const name = prompt(t({ zh: '请输入密钥名称', en: 'Enter key name' }))
                      if (name) {
                        try {
                          await apiKeyApi.create({ name })
                          loadApiKeys()
                        } catch (error) {
                          console.error('创建密钥失败:', error)
                        }
                      }
                    }}
                    className="text-xs px-3 py-1 bg-blue-600 text-white rounded hover:bg-blue-700"
                  >
                    {t({ zh: '创建新密钥', en: 'Create New Key' })}
                  </button>
                </div>
                
                {apiKeys.length === 0 ? (
                  <p className="text-xs text-slate-500 text-center py-4">{t({ zh: '暂无 API 密钥', en: 'No API keys' })}</p>
                ) : (
                  <div className="space-y-3">
                    {apiKeys.map((key) => (
                      <div key={key.id} className="space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-slate-400">{key.name}</span>
                          <button 
                            onClick={async () => {
                              if (confirm(t({ zh: '确定删除吗？', en: 'Are you sure?' }))) {
                                try {
                                  await apiKeyApi.delete(key.id)
                                  loadApiKeys()
                                } catch (error) {
                                  console.error('删除密钥失败:', error)
                                }
                              }
                            }}
                            className="text-slate-500 hover:text-red-400"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                        <div className="flex items-center gap-2 bg-black/20 p-2 rounded border border-white/5">
                          <code className="text-xs text-blue-400 flex-1 truncate">
                            {key.keyPrefix}****************************
                          </code>
                          <button 
                            onClick={() => handleCopy(key.keyPrefix || '', key.id)}
                            className="text-slate-400 hover:text-white"
                          >
                            {copiedId === key.id ? <Check className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4" />}
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="bg-white/5 border border-white/10 rounded-lg p-4">
                <p className="font-medium mb-2 text-red-400">{t({ zh: '危险区域', en: 'Danger Zone' })}</p>
                <button className="px-4 py-2 border border-red-500/50 text-red-400 rounded-lg text-sm hover:bg-red-500/10 transition-colors">
                  {t({ zh: '重置开发者账户', en: 'Reset Developer Account' })}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
      {selectedAgent && (
        <AgentStatsDrawer
          agent={selectedAgent}
          stats={selectedAgentStats}
          loading={agentStatsLoading}
          onClose={() => {
            setSelectedAgent(null)
            setSelectedAgentStats(null)
          }}
        />
      )}
    </div>
  )
}

function AgentStatsDrawer({
  agent,
  stats,
  loading,
  onClose,
}: {
  agent: UserAgent
  stats: any
  loading: boolean
  onClose: () => void
}) {
  const { t } = useLocalization()
  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-end md:items-center justify-center z-50 p-4">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg border border-gray-100">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div>
            <p className="text-xs text-gray-400">{t({ zh: 'Agent 数据', en: 'Agent Stats' })}</p>
            <h3 className="text-lg font-semibold">{agent.name}</h3>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">
            ×
          </button>
        </div>
        <div className="p-6 space-y-4">
          {loading ? (
            <div className="text-center py-8 text-gray-500 text-sm">
              {t({ zh: '加载中...', en: 'Loading...' })}
            </div>
          ) : stats ? (
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-gray-50 rounded-lg p-4">
                <p className="text-xs text-gray-500">{t({ zh: '总调用', en: 'Total Calls' })}</p>
                <p className="text-2xl font-bold text-gray-900">{stats.totalCalls?.toLocaleString?.() || stats.totalCalls}</p>
              </div>
              <div className="bg-gray-50 rounded-lg p-4">
                <p className="text-xs text-gray-500">{t({ zh: '总收益', en: 'Total Earnings' })}</p>
                <p className="text-2xl font-bold text-gray-900">
                  {stats.totalEarnings} {stats.currency || 'USDC'}
                </p>
              </div>
              <div className="bg-gray-50 rounded-lg p-4">
                <p className="text-xs text-gray-500">{t({ zh: '状态', en: 'Status' })}</p>
                <p className="text-lg font-semibold text-gray-900">{stats.status}</p>
              </div>
              <div className="bg-gray-50 rounded-lg p-4">
                <p className="text-xs text-gray-500">{t({ zh: '最近活跃', en: 'Last Active' })}</p>
                <p className="text-sm text-gray-900">
                  {stats.lastActiveAt ? new Date(stats.lastActiveAt).toLocaleString() : '-'}
                </p>
              </div>
            </div>
          ) : (
            <div className="text-center py-8 text-gray-500 text-sm">
              {t({ zh: '暂无统计数据', en: 'No stats data' })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}


