import { useState, useCallback, useEffect } from 'react'
import { useRouter } from 'next/router'
import { useLocalization } from '../../contexts/LocalizationContext'
import { useToast } from '../../contexts/ToastContext'
import { userAgentApi } from '../../lib/api/user-agent.api'
import { agentAuthorizationApi, type AgentAuthorization } from '../../lib/api/agent-authorization.api'
import Link from 'next/link'
import {
  Bot,
  Settings,
  Play,
  Pause,
  Trash2,
  Copy,
  ExternalLink,
  Code2,
  Key,
  Shield,
  Share2,
  Zap,
  ChevronRight,
  Plus,
  RefreshCw,
  Globe,
  Terminal,
  Link2,
  Eye,
  BarChart3,
} from 'lucide-react'

interface UserAgent {
  id: string
  userId: string
  name: string
  description?: string
  status: 'draft' | 'active' | 'paused'
  isPublished?: boolean
  templateId?: string
  createdAt: string
  updatedAt: string
  metadata?: Record<string, any>
  settings?: Record<string, any>
}

interface MyAgentsPanelProps {
  compact?: boolean // 紧凑模式，用于嵌入其他页面
  onTabChange?: (mainTab: any, subTab?: string) => void
}

type TabType = 'list' | 'authorizations' | 'deploy'

export function MyAgentsPanel({ compact = false, onTabChange }: MyAgentsPanelProps) {
  const { t } = useLocalization()
  const { success, error } = useToast()
  const router = useRouter()
  
  const [activeTab, setActiveTab] = useState<TabType>('list')
  const [agents, setAgents] = useState<UserAgent[]>([])
  const [authorizations, setAuthorizations] = useState<AgentAuthorization[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedAgent, setSelectedAgent] = useState<UserAgent | null>(null)
  const [showDeployModal, setShowDeployModal] = useState(false)

  // 加载我的 Agents
  const loadAgents = useCallback(async () => {
    try {
      setLoading(true)
      const data = await userAgentApi.getMyAgents()
      setAgents(data || [])
    } catch (err: any) {
      console.error('加载Agent列表失败:', err)
      // 静默失败，不显示错误提示
      setAgents([])
    } finally {
      setLoading(false)
    }
  }, [])

  // 加载授权列表
  const loadAuthorizations = useCallback(async () => {
    try {
      const data = await agentAuthorizationApi.getAuthorizations()
      setAuthorizations(data || [])
    } catch (err: any) {
      console.error('加载授权列表失败:', err)
      setAuthorizations([])
    }
  }, [])

  useEffect(() => {
    loadAgents()
    loadAuthorizations()
  }, [loadAgents, loadAuthorizations])

  // 切换 Agent 状态
  const handleToggleStatus = async (agent: UserAgent) => {
    try {
      const newStatus = agent.status === 'active' ? 'paused' : 'active'
      await userAgentApi.toggleStatus(agent.id, newStatus)
      success(t({ zh: `Agent 已${newStatus === 'active' ? '启动' : '暂停'}`, en: `Agent ${newStatus === 'active' ? 'activated' : 'paused'}` }))
      loadAgents()
    } catch (err: any) {
      error(err.message || t({ zh: '操作失败', en: 'Operation failed' }))
    }
  }

  // 删除 Agent
  const handleDeleteAgent = async (agentId: string) => {
    if (!confirm(t({ zh: '确定要删除此 Agent 吗？此操作不可撤销。', en: 'Are you sure you want to delete this agent? This action cannot be undone.' }))) return
    try {
      await userAgentApi.deleteAgent(agentId)
      success(t({ zh: 'Agent 已删除', en: 'Agent deleted' }))
      loadAgents()
    } catch (err: any) {
      error(err.message || t({ zh: '删除失败', en: 'Delete failed' }))
    }
  }

  // 撤销授权
  const handleRevokeAuth = async (authId: string) => {
    if (!confirm(t({ zh: '确定要撤销此授权吗？', en: 'Are you sure to revoke this authorization?' }))) return
    try {
      await agentAuthorizationApi.revokeAuthorization(authId)
      success(t({ zh: '授权已撤销', en: 'Authorization revoked' }))
      loadAuthorizations()
    } catch (err: any) {
      error(err.message || t({ zh: '撤销失败', en: 'Revoke failed' }))
    }
  }

  // 复制到剪贴板
  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text)
    success(t({ zh: `${label}已复制`, en: `${label} copied` }))
  }

  const goCreateAuthorization = (agentId?: string) => {
    if (onTabChange) {
      onTabChange('security', 'sessions')
      return
    }
    const target = agentId ? `/app/user/agent-authorizations/create?agentId=${agentId}` : '/app/user/agent-authorizations/create'
    router.push(target)
  }

  const goManageAuthorizations = () => {
    if (onTabChange) {
      onTabChange('security', 'sessions')
      return
    }
    router.push('/app/user/agent-authorizations')
  }

  // 获取部署信息
  const getDeployInfo = (agent: UserAgent) => {
    const baseUrl = typeof window !== 'undefined' ? window.location.origin : 'https://agentrix.ai'
    return {
      shareLink: `${baseUrl}/agent/${agent.id}`,
      embedCode: `<iframe src="${baseUrl}/agent/${agent.id}/embed" width="100%" height="600" frameborder="0"></iframe>`,
      apiEndpoint: `${baseUrl.replace('agentrix.ai', 'api.agentrix.top')}/api/agent/${agent.id}`,
    }
  }

  const tabs: { key: TabType; label: { zh: string; en: string }; icon: React.ReactNode }[] = [
    { key: 'list', label: { zh: '我的Agent', en: 'My Agents' }, icon: <Bot size={16} /> },
    { key: 'authorizations', label: { zh: '授权管理', en: 'Authorizations' }, icon: <Shield size={16} /> },
    { key: 'deploy', label: { zh: '部署分享', en: 'Deploy & Share' }, icon: <Share2 size={16} /> },
  ]

  return (
    <div className={`${compact ? '' : 'bg-white/5 border border-white/10 rounded-2xl p-6'}`}>
      {/* 头部 */}
      {!compact && (
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-xl font-bold">{t({ zh: 'Agent 管理中心', en: 'Agent Management' })}</h2>
            <p className="text-sm text-slate-400 mt-1">
              {t({ zh: '管理你的 Agent、授权和部署', en: 'Manage your agents, authorizations and deployments' })}
            </p>
          </div>
          <Link
            href="/agent-builder"
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm transition-colors"
          >
            <Plus size={16} />
            {t({ zh: '创建 Agent', en: 'Create Agent' })}
          </Link>
        </div>
      )}

      {/* Tab 导航 */}
      <div className="flex gap-2 mb-6 border-b border-white/10 pb-3">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm transition-colors ${
              activeTab === tab.key
                ? 'bg-blue-600 text-white'
                : 'text-slate-400 hover:text-white hover:bg-white/5'
            }`}
          >
            {tab.icon}
            {t(tab.label)}
          </button>
        ))}
      </div>

      {/* Tab 内容 */}
      {activeTab === 'list' && (
        <div className="space-y-4">
          {loading ? (
            <div className="text-center py-12">
              <RefreshCw className="w-8 h-8 animate-spin mx-auto text-blue-500" />
              <p className="text-sm text-slate-400 mt-2">{t({ zh: '加载中...', en: 'Loading...' })}</p>
            </div>
          ) : agents.length === 0 ? (
            <div className="text-center py-12 bg-white/5 rounded-xl">
              <Bot className="w-12 h-12 mx-auto text-slate-500 mb-4" />
              <p className="text-slate-400 mb-4">{t({ zh: '还没有创建 Agent', en: 'No agents yet' })}</p>
              <Link
                href="/agent-builder"
                className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm"
              >
                <Plus size={16} />
                {t({ zh: '创建第一个 Agent', en: 'Create First Agent' })}
              </Link>
            </div>
          ) : (
            <div className="grid gap-4">
              {agents.map((agent) => (
                <div
                  key={agent.id}
                  className="bg-white/5 border border-white/10 rounded-xl p-4 hover:border-blue-500/50 transition-colors"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-start gap-3">
                      <div className={`w-3 h-3 rounded-full mt-1.5 ${
                        agent.status === 'active' ? 'bg-green-500 animate-pulse' : 'bg-slate-500'
                      }`} />
                      <div>
                        <h3 className="font-semibold">{agent.name}</h3>
                        <p className="text-sm text-slate-400 mt-1">{agent.description || t({ zh: '暂无描述', en: 'No description' })}</p>
                        <div className="flex items-center gap-3 mt-2 text-xs text-slate-500">
                          <span>{t({ zh: '创建于', en: 'Created' })}: {new Date(agent.createdAt).toLocaleDateString()}</span>
                          <span className={`px-2 py-0.5 rounded ${
                            agent.status === 'active' ? 'bg-green-500/20 text-green-400' : 
                            agent.status === 'paused' ? 'bg-yellow-500/20 text-yellow-400' : 'bg-slate-500/20 text-slate-400'
                          }`}>
                            {agent.status === 'active' ? t({ zh: '运行中', en: 'Running' }) : 
                             agent.status === 'paused' ? t({ zh: '已暂停', en: 'Paused' }) : t({ zh: '草稿', en: 'Draft' })}
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleToggleStatus(agent)}
                        className={`p-2 rounded-lg transition-colors ${
                          agent.status === 'active' 
                            ? 'bg-yellow-500/20 text-yellow-400 hover:bg-yellow-500/30' 
                            : 'bg-green-500/20 text-green-400 hover:bg-green-500/30'
                        }`}
                        title={agent.status === 'active' ? t({ zh: '暂停', en: 'Pause' }) : t({ zh: '启动', en: 'Start' })}
                      >
                        {agent.status === 'active' ? <Pause size={16} /> : <Play size={16} />}
                      </button>
                      <button
                        onClick={() => goCreateAuthorization(agent.id)}
                        className="p-2 rounded-lg bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30 transition-colors"
                        title={t({ zh: '创建授权', en: 'Authorize' })}
                      >
                        <Key size={16} />
                      </button>
                      <button
                        onClick={() => {
                          setSelectedAgent(agent)
                          setActiveTab('deploy')
                        }}
                        className="p-2 rounded-lg bg-blue-500/20 text-blue-400 hover:bg-blue-500/30 transition-colors"
                        title={t({ zh: '部署分享', en: 'Deploy & Share' })}
                      >
                        <Share2 size={16} />
                      </button>
                      <button
                        onClick={() => {
                          // TODO: 实际发布逻辑
                          success(t({ zh: '正在提交发布申请...', en: 'Submitting marketplace application...' }));
                        }}
                        className="p-2 rounded-lg bg-purple-500/20 text-purple-400 hover:bg-purple-500/30 transition-colors"
                        title={t({ zh: '发布到市场', en: 'Publish to Market' })}
                      >
                        <Globe size={16} />
                      </button>
                      <button
                        className="p-2 rounded-lg bg-white/5 text-slate-400 hover:bg-white/10 transition-colors"
                        title={t({ zh: '设置', en: 'Settings' })}
                      >
                        <Settings size={16} />
                      </button>
                      <button
                        onClick={() => handleDeleteAgent(agent.id)}
                        className="p-2 rounded-lg bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-colors"
                        title={t({ zh: '删除', en: 'Delete' })}
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {activeTab === 'authorizations' && (
        <div className="space-y-4">
          <div className="flex flex-col lg:flex-row gap-4">
            <div className="bg-blue-500/10 border border-blue-500/30 rounded-xl p-4 flex-1">
              <h4 className="font-semibold text-blue-300 mb-2">{t({ zh: '什么是 Agent 授权？', en: 'What is Agent Authorization?' })}</h4>
              <p className="text-sm text-slate-400">
                {t({ 
                  zh: 'Agent 授权允许 AI Agent 在您设定的限额内自动执行支付。您可以随时调整限额或撤销授权。',
                  en: 'Agent authorization allows AI agents to execute payments within your set limits. You can adjust limits or revoke at any time.'
                })}
              </p>
            </div>
            <div className="flex flex-col gap-2 min-w-[200px]">
              <button
                onClick={() => goCreateAuthorization()}
                className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-sm"
              >
                {t({ zh: '创建授权', en: 'Create Authorization' })}
              </button>
              <button
                onClick={goManageAuthorizations}
                className="px-4 py-2 rounded-lg bg-slate-800 text-slate-200 hover:bg-slate-700 text-sm"
              >
                {t({ zh: '前往授权列表', en: 'Open Authorization List' })}
              </button>
            </div>
          </div>

          {authorizations.length === 0 ? (
            <div className="text-center py-12 bg-white/5 rounded-xl">
              <Shield className="w-12 h-12 mx-auto text-slate-500 mb-4" />
              <p className="text-slate-400">{t({ zh: '暂无授权记录', en: 'No authorizations yet' })}</p>
            </div>
          ) : (
            <div className="space-y-3">
              {authorizations.map((auth) => (
                <div key={auth.id} className="bg-white/5 border border-white/10 rounded-xl p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <Bot size={16} className="text-blue-400" />
                        <span className="font-medium">{auth.agentName || auth.agentId}</span>
                        <span className={`px-2 py-0.5 text-xs rounded ${
                          auth.isActive ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'
                        }`}>
                          {auth.isActive ? t({ zh: '生效中', en: 'Active' }) : t({ zh: '已撤销', en: 'Revoked' })}
                        </span>
                      </div>
                      <div className="flex items-center gap-4 mt-2 text-sm text-slate-400">
                        <span>{t({ zh: '单次限额', en: 'Per-tx Limit' })}: ${auth.singleLimit || 0}</span>
                        <span>{t({ zh: '日限额', en: 'Daily Limit' })}: ${auth.dailyLimit || 0}</span>
                        <span>{t({ zh: '已用', en: 'Used' })}: ${auth.usedToday || 0}</span>
                      </div>
                    </div>
                    {auth.isActive && (
                      <button
                        onClick={() => handleRevokeAuth(auth.id)}
                        className="px-3 py-1 text-sm bg-red-500/20 text-red-400 hover:bg-red-500/30 rounded-lg transition-colors"
                      >
                        {t({ zh: '撤销', en: 'Revoke' })}
                      </button>
                    )}
                    {!auth.isActive && (
                      <button
                        onClick={() => handleRevokeAuth(auth.id)}
                        className="px-3 py-1 text-sm bg-slate-500/10 text-slate-400 hover:bg-slate-500/20 rounded-lg transition-colors flex items-center gap-1"
                      >
                        <Trash2 size={14} />
                        {t({ zh: '删除', en: 'Delete' })}
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {activeTab === 'deploy' && (
        <div className="space-y-6">
          {/* Agent 选择器 */}
              <div>
                <label className="block text-sm font-medium mb-2 text-white">{t({ zh: '选择 Agent', en: 'Select Agent' })}</label>
                <select
                  value={selectedAgent?.id || ''}
                  onChange={(e) => {
                    const agent = agents.find(a => a.id === e.target.value)
                    setSelectedAgent(agent || null)
                  }}
                  className="w-full bg-slate-800 border border-white/10 rounded-lg px-4 py-2 text-white outline-none focus:border-blue-500"
                >
                  <option value="" className="bg-slate-900">{t({ zh: '请选择 Agent', en: 'Select an Agent' })}</option>
                  {agents.map((agent) => (
                    <option key={agent.id} value={agent.id} className="bg-slate-900">{agent.name}</option>
                  ))}
                </select>
              </div>

            {selectedAgent ? (
              <>
                {/* 分享链接 */}
                <div className="bg-white/5 border border-white/10 rounded-xl p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <Link2 size={18} className="text-blue-400" />
                    <h4 className="font-semibold text-white">{t({ zh: '分享链接', en: 'Share Link' })}</h4>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={getDeployInfo(selectedAgent).shareLink}
                      readOnly
                      className="flex-1 bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-sm text-slate-200"
                    />
                    <button
                      onClick={() => copyToClipboard(getDeployInfo(selectedAgent).shareLink, t({ zh: '链接', en: 'Link' }))}
                      className="p-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
                    >
                      <Copy size={16} />
                    </button>
                    <a
                      href={getDeployInfo(selectedAgent).shareLink}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-2 bg-white/10 hover:bg-white/20 text-white rounded-lg transition-colors"
                    >
                      <ExternalLink size={16} />
                    </a>
                  </div>
                  <p className="text-xs text-slate-500 mt-2">
                    {t({ zh: '分享此链接，其他人可以直接访问你的 Agent', en: 'Share this link for others to access your Agent' })}
                  </p>
                </div>

                {/* 嵌入代码 */}
                <div className="bg-white/5 border border-white/10 rounded-xl p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <Code2 size={18} className="text-green-400" />
                    <h4 className="font-semibold text-white">{t({ zh: '嵌入代码', en: 'Embed Code' })}</h4>
                  </div>
                  <div className="relative">
                    <pre className="bg-black/30 border border-white/10 rounded-lg p-3 text-xs text-slate-300 overflow-x-auto">
                      {getDeployInfo(selectedAgent).embedCode}
                    </pre>
                    <button
                      onClick={() => copyToClipboard(getDeployInfo(selectedAgent).embedCode, t({ zh: '嵌入代码', en: 'Embed code' }))}
                      className="absolute top-2 right-2 p-1.5 bg-white/10 hover:bg-white/20 text-white rounded transition-colors"
                    >
                      <Copy size={14} />
                    </button>
                  </div>
                  <p className="text-xs text-slate-500 mt-2">
                    {t({ zh: '将此代码粘贴到你的网站 HTML 中即可嵌入 Agent', en: 'Paste this code into your website HTML to embed the Agent' })}
                  </p>
                </div>

                {/* API 调用 */}
                <div className="bg-white/5 border border-white/10 rounded-xl p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <Terminal size={18} className="text-purple-400" />
                    <h4 className="font-semibold text-white">{t({ zh: 'API 调用', en: 'API Integration' })}</h4>
                  </div>
                  <div className="space-y-3">
                    <div>
                      <label className="text-xs text-slate-400 block mb-1">API Endpoint</label>
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          value={getDeployInfo(selectedAgent).apiEndpoint}
                          readOnly
                          className="flex-1 bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-sm text-slate-200"
                        />
                        <button
                          onClick={() => copyToClipboard(getDeployInfo(selectedAgent).apiEndpoint, 'API Endpoint')}
                          className="p-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg transition-colors"
                        >
                          <Copy size={16} />
                        </button>
                      </div>
                    </div>
                  </div>
                <p className="text-xs text-slate-500 mt-3">
                  {t({ zh: '通过 API Key 和 Webhook 将 Agent 集成到你的应用', en: 'Integrate Agent into your app via API Key and Webhook' })}
                </p>
                <Link
                  href="/agent-enhanced?view=developer_module&tab=api"
                  className="inline-flex items-center gap-1 text-sm text-blue-400 hover:text-blue-300 mt-2"
                >
                  {t({ zh: '获取 API Key', en: 'Get API Key' })}
                  <ChevronRight size={14} />
                </Link>
              </div>
            </>
          ) : (
            <div className="text-center py-12 bg-white/5 rounded-xl">
              <Share2 className="w-12 h-12 mx-auto text-slate-500 mb-4" />
              <p className="text-slate-400">
                {agents.length > 0 
                  ? t({ zh: '请先选择一个 Agent', en: 'Please select an Agent first' })
                  : t({ zh: '请先创建一个 Agent', en: 'Please create an Agent first' })
                }
              </p>
              {agents.length === 0 && (
                <Link
                  href="/agent-builder"
                  className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm mt-4"
                >
                  <Plus size={16} />
                  {t({ zh: '创建 Agent', en: 'Create Agent' })}
                </Link>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
