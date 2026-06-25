import { useState, useCallback, useEffect } from 'react'
import { useRouter } from 'next/router'
import { useUser } from '../../../contexts/UserContext'
import { useLocalization } from '../../../contexts/LocalizationContext'
import { useWeb3 } from '../../../contexts/Web3Context'
import { paymentApi } from '../../../lib/api/payment.api'
import { walletApi } from '../../../lib/api/wallet.api'
import { userApi } from '../../../lib/api/user.api'
import { sessionApi, type Session } from '../../../lib/api/session.api'
import { agentAuthorizationApi, type AgentAuthorization } from '../../../lib/api/agent-authorization.api'
import { SessionKeyManager } from '../../../lib/session-key-manager'
import { orderApi, type Order } from '../../../lib/api/order.api'
import { PolicyEngine } from '../PolicyEngine'
import { SessionManager } from '../../payment/SessionManager'
import { AirdropDiscovery } from '../AirdropDiscovery'
import { AutoEarnPanel } from '../AutoEarnPanel'
import { AgentInsightsPanel } from '../AgentInsightsPanel'
import { MyAgentsPanel } from '../MyAgentsPanel'
import { PromotionPanel } from '../PromotionPanel'
import { SkillManagementPanel } from '../SkillManagementPanel'
import { useToast } from '../../../contexts/ToastContext'
import { 
  User as UserIcon, 
  Mail, 
  Shield, 
  CreditCard, 
  Wallet as WalletIcon, 
  Package, 
  Lock, 
  Globe, 
  CheckCircle2,
  Activity,
  AlertCircle,
  RefreshCw,
  ExternalLink,
  Settings,
  Zap,
  Trash2,
  Star,
  ShieldCheck,
  ChevronRight,
  Clock,
  Cpu,
  Check,
  Share2,
  Plus,
} from 'lucide-react'


interface UserModuleProps {
  onCommand?: (command: string, data?: any) => any
  initialTab?: 'checklist' | 'agents' | 'skills' | 'payments' | 'wallets' | 'kyc' | 'orders' | 'airdrops' | 'autoEarn' | 'profile' | 'subscriptions' | 'promotion' | 'policies' | 'security'
}

/**
 * 用户功能模块
 * 集成支付历史、钱包管理、KYC、订单跟踪等功能
 */
export function UserModule({ onCommand, initialTab }: UserModuleProps) {
  const { t } = useLocalization()
  const router = useRouter()
  const { user, updateUser } = useUser()
  const { connectedWallets } = useWeb3()
  const toast = useToast()
  const [activeTab, setActiveTab] = useState<'checklist' | 'agents' | 'skills' | 'payments' | 'wallets' | 'kyc' | 'orders' | 'airdrops' | 'autoEarn' | 'profile' | 'subscriptions' | 'promotion' | 'policies' | 'security'>(initialTab || 'checklist')


  // 个人资料状态
  const [isEditingProfile, setIsEditingProfile] = useState(false)
  const [profileEmail, setProfileEmail] = useState(user?.email || '')
  const [profileNickname, setProfileNickname] = useState(user?.nickname || '')
  const [profileBio, setProfileBio] = useState(user?.bio || '')
  const [isSavingProfile, setIsSavingProfile] = useState(false)

  // 当 initialTab 改变时更新 activeTab
  useEffect(() => {
    if (initialTab) {
      setActiveTab(initialTab)
    }
  }, [initialTab])

  useEffect(() => {
    if (user) {
      setProfileEmail(user.email || '')
      setProfileNickname(user.nickname || '')
      setProfileBio(user.bio || '')
    }
  }, [user])

  const handleSaveProfile = async () => {
    if (!isEditingProfile) {
      setIsEditingProfile(true)
      return
    }

    setIsSavingProfile(true)
    try {
      const updatedUser = await userApi.updateProfile({
        email: profileEmail || undefined,
        nickname: profileNickname || undefined,
        bio: profileBio || undefined,
      })
      
      if (updateUser && updatedUser) {
        // 后端现在直接返回更新后的用户对象
        updateUser(updatedUser as any)
      }
      
      toast.success(t({ zh: '个人资料更新成功', en: 'Profile updated successfully' }))
      setIsEditingProfile(false)
    } catch (err) {
      console.error('Failed to update profile:', err)
      toast.error(t({ zh: '更新失败', en: 'Update failed' }))
    } finally {
      setIsSavingProfile(false)
    }
  }

  const handleUnbindWallet = async (walletId: string) => {
    if (!confirm(t({ zh: '确定要解绑此钱包吗？', en: 'Are you sure you want to unbind this wallet?' }))) {
      return
    }
    try {
      setLoading(true)
      await walletApi.remove(walletId)
      toast.success(t({ zh: '钱包已解绑', en: 'Wallet unbound' }))
      await loadWallets()
    } catch (error: any) {
      console.error('解绑钱包失败:', error)
      toast.error(error.message || t({ zh: '解绑失败', en: 'Unbind failed' }))
    } finally {
      setLoading(false)
    }
  }

  const handleSetDefaultWallet = async (walletId: string) => {
    try {
      setLoading(true)
      await walletApi.setDefault(walletId)
      toast.success(t({ zh: '已设为默认钱包', en: 'Set as default wallet' }))
      await loadWallets()
    } catch (error: any) {
      console.error('设置默认钱包失败:', error)
      toast.error(error.message || t({ zh: '设置失败', en: 'Set failed' }))
    } finally {
      setLoading(false)
    }
  }

  const [payments, setPayments] = useState<any[]>([])
  const [wallets, setWallets] = useState<any[]>([])
  const [sessions, setSessions] = useState<Session[]>([])
  const [agentAuthorizations, setAgentAuthorizations] = useState<AgentAuthorization[]>([])
  const [orders, setOrders] = useState<Order[]>([])
  const [loading, setLoading] = useState(false)
  const [showSessionManager, setShowSessionManager] = useState(false)
  const [showCreateAuthModal, setShowCreateAuthModal] = useState(false)

  const loadSessions = useCallback(async () => {
    setLoading(true)
    try {
      const data = await sessionApi.getSessions()
      setSessions(data || [])
    } catch (error) {
      console.error('加载 Session 失败:', error)
    } finally {
      setLoading(false)
    }
  }, [])

  const loadAgentAuthorizations = useCallback(async () => {
    setLoading(true)
    try {
      const data = await agentAuthorizationApi.getAuthorizations()
      setAgentAuthorizations(data || [])
    } catch (error) {
      console.error('加载 Agent 授权失败:', error)
    } finally {
      setLoading(false)
    }
  }, [])

  const handleRevokeSession = async (sessionId: string) => {
    if (!confirm(t({ zh: '确定要撤销此授权吗？', en: 'Are you sure you want to revoke this authorization?' }))) {
      return
    }
    
    try {
      setLoading(true)
      await sessionApi.revokeSession(sessionId)
      await loadSessions()
    } catch (error) {
      console.error('撤销 Session 失败:', error)
      alert(t({ zh: '撤销失败，请稍后重试', en: 'Revocation failed, please try again later' }))
    } finally {
      setLoading(false)
    }
  }

  const loadPayments = useCallback(async () => {
    setLoading(true)
    try {
      // 尝试调用支付历史API
      const payments = await paymentApi.getUserAgentPayments()
      setPayments(
        payments.map((p: any) => ({
          id: p.id || `pay_${Date.now()}`,
          amount: p.amount || 0,
          currency: p.currency || 'CNY',
          status: p.status || 'completed',
          description: p.description || '支付',
          createdAt: p.createdAt || new Date().toISOString(),
        })),
      )
    } catch (error: any) {
      console.error('加载支付历史失败:', error)
      // 如果API失败，使用mock数据作为fallback
      if (error.message?.includes('401') || error.message?.includes('Unauthorized')) {
        setPayments([])
      } else {
        setPayments([
          {
            id: 'pay_001',
            amount: 99.00,
            currency: 'CNY',
            status: 'completed',
            description: 'X402协议支付演示',
            createdAt: new Date().toISOString(),
          },
        ])
      }
    } finally {
      setLoading(false)
    }
  }, [])

  const loadWallets = useCallback(async () => {
    setLoading(true)
    try {
      const data = await walletApi.list()
      setWallets(data.map(w => ({
        id: w.id,
        type: w.walletType,
        address: w.walletAddress,
        isDefault: w.isDefault,
      })) || [])
    } catch (error) {
      console.error('加载钱包失败:', error)
      // 只有在 API 失败时才回退到本地连接的钱包
      if (connectedWallets && connectedWallets.length > 0) {
        setWallets(connectedWallets.map(w => ({
          id: w.id,
          type: w.type,
          address: w.address,
          balance: w.balance,
          isDefault: false,
        })))
      } else {
        setWallets([])
      }
    } finally {
      setLoading(false)
    }
  }, [connectedWallets])

  const loadOrders = useCallback(async () => {
    setLoading(true)
    try {
      const data = await orderApi.getOrders()
      setOrders(data || [])
    } catch (error) {
      console.error('加载订单失败:', error)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (activeTab === 'payments') {
      loadPayments()
    } else if (activeTab === 'wallets') {
      loadWallets()
    } else if (activeTab === 'orders') {
      loadOrders()
    } else if (activeTab === 'security') {
      loadSessions()
      loadAgentAuthorizations()
    }
  }, [activeTab, loadPayments, loadWallets, loadOrders, loadSessions, loadAgentAuthorizations])

  // 处理命令
  useEffect(() => {
    if (onCommand) {
      const handleCommand = (command: string) => {
        const result = onCommand(command)
        if (result?.view === 'user' || result?.view === 'orders' || result?.view === 'autoEarn') {
          if (result.action === 'view_auth_guide') {
            setActiveTab('checklist')
          } else if (result.action === 'view_payment_history') {
            setActiveTab('payments')
          } else if (result.action === 'view_wallets') {
            setActiveTab('wallets')
          } else if (result.action === 'start_kyc') {
            setActiveTab('kyc')
          } else if (result.action === 'view_orders') {
            setActiveTab('orders')
          } else if (result.action === 'view_auto_earn') {
            setActiveTab('autoEarn')
          }
        }

      }
    }
  }, [onCommand])


  return (
    <div className="h-full flex flex-col bg-slate-950">
      {/* 标签页 */}
      <div className="border-b border-white/10 bg-slate-900/50 px-6 overflow-x-auto">
        <div className="flex space-x-1 min-w-max">
          {[
            { key: 'checklist' as const, label: { zh: '授权向导', en: 'Auth Guide' } },
            { key: 'agents' as const, label: { zh: '我的Agent', en: 'My Agents' } },
            { key: 'skills' as const, label: { zh: '技能管理', en: 'Skills' } },
            { key: 'payments' as const, label: { zh: '支付历史', en: 'Payment History' } },
            { key: 'subscriptions' as const, label: { zh: '我的订阅', en: 'Subscriptions' } },
            { key: 'wallets' as const, label: { zh: '钱包管理', en: 'Wallet Management' } },
            { key: 'orders' as const, label: { zh: '订单跟踪', en: 'Order Tracking' } },
            { key: 'airdrops' as const, label: { zh: '空投发现', en: 'Airdrops' } },
            { key: 'autoEarn' as const, label: { zh: '自动赚钱', en: 'Auto-Earn' } },
            { key: 'promotion' as const, label: { zh: '推广中心', en: 'Promotion' } },
            { key: 'policies' as const, label: { zh: '策略与授权', en: 'Policies' } },
            { key: 'security' as const, label: { zh: '安全中心', en: 'Security' } },
            { key: 'kyc' as const, label: { zh: 'KYC认证', en: 'KYC Verification' } },
            { key: 'profile' as const, label: { zh: '个人资料', en: 'Profile' } },
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
        {activeTab === 'checklist' && (
          <div className="space-y-6 max-w-4xl">
            <div className="bg-cyan-600/10 border border-cyan-500/20 rounded-2xl p-6 mb-8">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-xl font-bold text-cyan-400 mb-2">Authorize Agent for Purchases</h3>
                  <p className="text-sm text-slate-400">安全地为您的 Agent 授权，实现自动化商业闭环</p>
                </div>
                <div className="text-right">
                  <span className="text-3xl font-bold text-cyan-400">10%</span>
                  <p className="text-[10px] text-slate-500 uppercase font-bold tracking-widest">Setup Status</p>
                </div>
              </div>
              <div className="w-full bg-slate-800 h-2 rounded-full mt-4 overflow-hidden">
                <div className="bg-cyan-500 h-full w-[10%] transition-all"></div>
              </div>
            </div>

            <div className="grid gap-4">
              {[
                { title: '选择 Agent/Skill', desc: '在 Marketplace 或个人库中挑选需要授权的 Agent', status: 'in_progress', tab: 'agents' },
                { title: '设置授权 Mandate', desc: '配置单次/每日限额、有效期及授权范围', status: 'pending', tab: 'agents' },
                { title: '模拟一次购买', desc: '在沙盒环境验证 Agent 触发的自动支付流', status: 'pending', tab: 'agents' },
                { title: '审计 Receipt', desc: '在 Receipts 中心验证 AI 行为的审计解释回执', status: 'pending', tab: 'payments' },
                { title: '管理/撤销授权', desc: '随时调整权限或一键终止 Agent 的 Mandate', status: 'pending', tab: 'agents' }
              ].map((step, i) => (
                <div key={i} className="bg-white/5 border border-white/10 rounded-xl p-5 flex items-center justify-between hover:bg-white/10 transition-all">
                  <div className="flex items-center gap-4">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm ${
                      step.status === 'completed' ? 'bg-emerald-500/20 text-emerald-400' : 
                      step.status === 'in_progress' ? 'bg-cyan-500/20 text-cyan-400 animate-pulse' : 
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
                    onClick={() => {
                      if (step.tab === 'marketplace') {
                        onCommand?.('marketplace')
                      } else {
                        setActiveTab(step.tab as any)
                      }
                    }}
                    className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${
                      step.status === 'completed' ? 'bg-slate-800 text-slate-500' : 'bg-cyan-600 text-white hover:bg-cyan-700'
                    }`}
                  >
                    {step.status === 'completed' ? '重新设置' : step.status === 'in_progress' ? '立即开始' : '待处理'}
                  </button>
                </div>
              ))}
            </div>

            
            <div className="mt-8 p-6 bg-slate-900 border border-white/5 rounded-2xl">
              <h4 className="font-bold mb-4 flex items-center gap-2">
                <ShieldCheck size={18} className="text-emerald-400" />
                审计回溯保证
              </h4>
              <p className="text-sm text-slate-400 mb-4">
                任何一次 agent-triggered 操作都能在 30 秒内生成人类可读的回执。
              </p>
              <div className="flex items-center gap-4 p-4 bg-emerald-500/5 border border-emerald-500/20 rounded-xl">
                <div className="w-10 h-10 rounded-full bg-emerald-500/10 flex items-center justify-center text-emerald-400">
                  <Clock size={20} />
                </div>
                <div>
                  <p className="text-xs font-bold text-slate-200 uppercase">实时监测中</p>
                  <p className="text-[10px] text-slate-500">上次 Agent 支付操作：12 分钟前 (已验证)</p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* 我的 Agent 管理 */}
        {activeTab === 'agents' && (
          <MyAgentsPanel />
        )}

        {/* 技能管理 */}
        {activeTab === 'skills' && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-semibold">{t({ zh: '技能管理', en: 'Skill Management' })}</h3>
                <p className="text-sm text-slate-400">{t({ zh: '管理Agent技能，从市场安装或配置已有技能', en: 'Manage agent skills, install from marketplace or configure existing ones' })}</p>
              </div>
            </div>
            <SkillManagementPanel />
          </div>
        )}

        {/* 推广中心 */}
        {activeTab === 'promotion' && (
          <PromotionPanel />
        )}

        {activeTab === 'payments' && (

          <div className="space-y-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">{t({ zh: '支付历史', en: 'Payment History' })}</h3>
              <button className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 transition-colors">
                {t({ zh: '导出', en: 'Export' })}
              </button>
            </div>
            {loading ? (
              <div className="text-center py-12">
                <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto"></div>
              </div>
            ) : payments.length === 0 ? (
              <div className="text-center py-12 text-slate-400">
                {t({ zh: '暂无支付记录', en: 'No payment records' })}
              </div>
            ) : (
              <div className="space-y-3">
                {payments.map((payment) => (
                  <div key={payment.id} className="bg-white/5 border border-white/10 rounded-lg p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-semibold">{payment.description || payment.id}</p>
                        <p className="text-sm text-slate-400">
                          {new Date(payment.createdAt).toLocaleString()}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="font-semibold">
                          {payment.currency} {payment.amount}
                        </p>
                        <p className={`text-sm ${
                          payment.status === 'completed' ? 'text-green-400' : 'text-yellow-400'
                        }`}>
                          {payment.status === 'completed' ? t({ zh: '已完成', en: 'Completed' }) : t({ zh: '处理中', en: 'Processing' })}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === 'subscriptions' && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-semibold">{t({ zh: '我的订阅', en: 'My Subscriptions' })}</h3>
                <p className="text-xs text-slate-400">{t({ zh: '管理您的周期性服务与自动扣款', en: 'Manage your recurring services and auto-payments' })}</p>
              </div>
              <button 
                onClick={() => onCommand?.('marketplace')}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 transition-colors"
              >
                {t({ zh: '发现更多服务', en: 'Discover More' })}
              </button>
            </div>

            <div className="grid md:grid-cols-2 gap-4">
              <div className="bg-white/5 border border-white/10 rounded-2xl p-5 flex items-center gap-4">
                <div className="w-12 h-12 bg-blue-500/20 rounded-xl flex items-center justify-center text-blue-400">
                  <Zap size={24} />
                </div>
                <div>
                  <h4 className="font-bold text-white">Premium AI Agent</h4>
                  <p className="text-xs text-slate-400">Next billing: 2025-01-15</p>
                  <div className="flex items-center gap-2 mt-2">
                    <span className="text-sm font-bold text-white">$49.00/mo</span>
                    <span className="px-2 py-0.5 bg-emerald-500/20 text-emerald-400 rounded-full text-[10px] font-bold uppercase">Active</span>
                  </div>
                </div>
                <button className="ml-auto p-2 hover:bg-white/10 rounded-lg text-slate-400 transition-colors">
                  <Settings size={18} />
                </button>
              </div>

              <div className="bg-white/5 border border-white/10 rounded-2xl p-5 flex items-center gap-4 opacity-60">
                <div className="w-12 h-12 bg-slate-700 rounded-xl flex items-center justify-center text-slate-400">
                  <Package size={24} />
                </div>
                <div>
                  <h4 className="font-bold text-white">Basic Data Plugin</h4>
                  <p className="text-xs text-slate-400">Cancelled on: 2024-12-01</p>
                  <div className="flex items-center gap-2 mt-2">
                    <span className="text-sm font-bold text-white">$9.00/mo</span>
                    <span className="px-2 py-0.5 bg-slate-500/20 text-slate-400 rounded-full text-[10px] font-bold uppercase">Expired</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-blue-600/10 border border-blue-500/20 rounded-xl p-4 flex items-start gap-3">
              <ShieldCheck className="w-5 h-5 text-blue-400 shrink-0 mt-0.5" />
              <div>
                <h4 className="text-sm font-bold text-white">{t({ zh: '关于自动扣款', en: 'About Auto-payments' })}</h4>
                <p className="text-xs text-slate-300 mt-1">
                  {t({ 
                    zh: '订阅服务通过 ERC8004 协议实现。您可以随时在“策略授权”中调整或撤销 Agent 的扣款权限。', 
                    en: 'Subscriptions are powered by ERC8004. You can adjust or revoke payment permissions in the "Policies" tab at any time.' 
                  })}
                </p>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'wallets' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">{t({ zh: '钱包管理', en: 'Wallet Management' })}</h3>
              <button 
                onClick={() => router.push('/auth/login?mode=wallet&bind=true')}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 transition-colors"
              >
                {t({ zh: '添加钱包', en: 'Add Wallet' })}
              </button>
            </div>
            {loading ? (
              <div className="text-center py-12">
                <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto"></div>
              </div>
            ) : wallets.length === 0 ? (
              <div className="text-center py-12 text-slate-400">
                {t({ zh: '暂未绑定钱包', en: 'No wallets connected' })}
              </div>
            ) : (
              <div className="space-y-3">
                {wallets.map((wallet) => (
                  <div key={wallet.id} className="bg-white/5 border border-white/10 rounded-lg p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-blue-600/20 rounded-lg flex items-center justify-center text-blue-400">
                          <WalletIcon className="w-6 h-6" />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <p className="font-semibold text-white">{wallet.type.toUpperCase()}</p>
                            {wallet.isDefault && (
                              <span className="px-2 py-0.5 bg-yellow-500/20 text-yellow-500 text-[10px] rounded-full uppercase font-bold">
                                Default
                              </span>
                            )}
                          </div>
                          <p className="text-sm text-slate-400 font-mono">{wallet.address.substring(0, 6)}...{wallet.address.substring(wallet.address.length - 4)}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {!wallet.isDefault && (
                          <button 
                            onClick={() => handleSetDefaultWallet(wallet.id)}
                            className="p-2 hover:bg-white/10 rounded-lg text-slate-400 hover:text-yellow-400 transition-colors"
                            title={t({ zh: '设为默认', en: 'Set as Default' })}
                          >
                            <Star className="w-4 h-4" />
                          </button>
                        )}
                        <button 
                          onClick={() => handleUnbindWallet(wallet.id)}
                          className="p-2 hover:bg-white/10 rounded-lg text-slate-400 hover:text-red-400 transition-colors"
                          title={t({ zh: '解绑', en: 'Unbind' })}
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === 'kyc' && (
          <div className="space-y-4">
            <h3 className="text-lg font-semibold mb-4">{t({ zh: 'KYC认证', en: 'KYC Verification' })}</h3>
            <div className="bg-white/5 border border-white/10 rounded-lg p-6">
              <div className="text-center space-y-4">
                <div className="text-4xl mb-4">
                  {user?.kycLevel === 'verified' ? '✅' : '⏳'}
                </div>
                <p className="text-lg font-semibold">
                  {user?.kycLevel === 'verified'
                    ? t({ zh: 'KYC认证已完成', en: 'KYC Verification Completed' })
                    : t({ zh: 'KYC认证未完成', en: 'KYC Verification Not Completed' })}
                </p>
                {user?.kycLevel !== 'verified' && (
                  <button className="px-6 py-3 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 transition-colors">
                    {t({ zh: '开始认证', en: 'Start Verification' })}
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'orders' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">{t({ zh: '订单跟踪', en: 'Order Tracking' })}</h3>
              <button 
                onClick={loadOrders}
                className="p-2 hover:bg-white/10 rounded-lg text-slate-400 transition-colors"
              >
                <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              </button>
            </div>
            {loading ? (
              <div className="text-center py-12">
                <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto"></div>
              </div>
            ) : orders.length === 0 ? (
              <div className="text-center py-12 text-slate-400">
                {t({ zh: '暂无订单记录', en: 'No order records' })}
              </div>
            ) : (
              <div className="space-y-3">
                {orders.map((order) => (
                  <div key={order.id} className="bg-white/5 border border-white/10 rounded-lg p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-semibold text-white">{order.id}</p>
                        <p className="text-xs text-slate-400">
                          {new Date(order.createdAt).toLocaleString()}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="font-semibold text-white">
                          {order.amount} {order.currency}
                        </p>
                        <span className={`text-xs px-2 py-0.5 rounded-full ${
                          order.status === 'completed' ? 'bg-green-500/20 text-green-400' : 
                          order.status === 'pending' ? 'bg-yellow-500/20 text-yellow-400' :
                          'bg-slate-500/20 text-slate-400'
                        }`}>
                          {order.status}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === 'profile' && (
          <div className="space-y-6">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold">{t({ zh: '个人资料', en: 'Profile' })}</h3>
              <button 
                onClick={handleSaveProfile}
                disabled={isSavingProfile}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 transition-colors disabled:opacity-50"
              >
                {isSavingProfile ? t({ zh: '保存中...', en: 'Saving...' }) : isEditingProfile ? t({ zh: '保存修改', en: 'Save Changes' }) : t({ zh: '编辑资料', en: 'Edit Profile' })}
              </button>
            </div>
            
            <div className="bg-white/5 border border-white/10 rounded-xl p-6 space-y-6">
              <div className="flex items-center gap-6">
                <div className="w-20 h-20 bg-blue-600/20 rounded-full flex items-center justify-center text-blue-400">
                  <UserIcon className="w-10 h-10" />
                </div>
                <div className="flex-1">
                  {isEditingProfile ? (
                    <div className="space-y-3">
                      <div className="space-y-1">
                        <label className="text-xs text-slate-500 uppercase font-bold">{t({ zh: '昵称', en: 'Nickname' })}</label>
                        <input 
                          type="text"
                          value={profileNickname}
                          onChange={(e) => setProfileNickname(e.target.value)}
                          className="w-full bg-slate-900 border border-white/10 rounded-lg px-3 py-2 text-white focus:ring-2 focus:ring-blue-500 outline-none"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-xs text-slate-500 uppercase font-bold">{t({ zh: '邮箱', en: 'Email' })}</label>
                        <input 
                          type="email"
                          value={profileEmail}
                          onChange={(e) => setProfileEmail(e.target.value)}
                          className="w-full bg-slate-900 border border-white/10 rounded-lg px-3 py-2 text-white focus:ring-2 focus:ring-blue-500 outline-none"
                        />
                      </div>
                    </div>
                  ) : (
                    <>
                      <h4 className="text-xl font-bold text-white">{user?.nickname || user?.agentrixId}</h4>
                      <p className="text-slate-400 text-sm">{user?.email}</p>
                    </>
                  )}
                </div>
              </div>

              {isEditingProfile && (
                <div className="space-y-1">
                  <label className="text-xs text-slate-500 uppercase font-bold">{t({ zh: '个人简介', en: 'Bio' })}</label>
                  <textarea 
                    value={profileBio}
                    onChange={(e) => setProfileBio(e.target.value)}
                    rows={3}
                    className="w-full bg-slate-900 border border-white/10 rounded-lg px-3 py-2 text-white focus:ring-2 focus:ring-blue-500 outline-none"
                    placeholder={t({ zh: '介绍一下你自己...', en: 'Tell us about yourself...' })}
                  />
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-6 border-t border-white/10">
                <div className="space-y-1">
                  <p className="text-xs text-slate-500 uppercase font-bold tracking-wider">{t({ zh: '用户 ID', en: 'User ID' })}</p>
                  <p className="text-white font-mono text-sm">{user?.id}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-xs text-slate-500 uppercase font-bold tracking-wider">{t({ zh: 'AX ID', en: 'AX ID' })}</p>
                  <div className="flex items-center gap-2">
                    <p className="text-white font-mono text-sm">{user?.agentrixId}</p>
                    <button 
                      onClick={() => {
                        navigator.clipboard.writeText(user?.agentrixId || '')
                        toast.success(t({ zh: '已复制', en: 'Copied' }))
                      }}
                      className="text-blue-400 hover:text-blue-300"
                    >
                      <ExternalLink className="w-3 h-3" />
                    </button>
                  </div>
                </div>
                <div className="space-y-1">
                  <p className="text-xs text-slate-500 uppercase font-bold tracking-wider">{t({ zh: '注册时间', en: 'Joined' })}</p>
                  <p className="text-white text-sm">{user?.createdAt ? new Date(user.createdAt).toLocaleDateString() : '-'}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-xs text-slate-500 uppercase font-bold tracking-wider">{t({ zh: '角色', en: 'Roles' })}</p>
                  <div className="flex gap-2">
                    {user?.roles?.map((role: string) => (
                      <span key={role} className="px-2 py-0.5 bg-blue-500/20 text-blue-400 text-[10px] rounded-full uppercase font-bold">
                        {role}
                      </span>
                    ))}
                  </div>
                </div>
              </div>

              {isEditingProfile && (
                <div className="pt-4 flex justify-end gap-3">
                  <button 
                    onClick={() => setIsEditingProfile(false)}
                    className="px-4 py-2 text-slate-400 hover:text-white transition-colors"
                  >
                    {t({ zh: '取消', en: 'Cancel' })}
                  </button>
                  <button 
                    onClick={handleSaveProfile}
                    disabled={isSavingProfile}
                    className="px-6 py-2 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 transition-colors"
                  >
                    {t({ zh: '保存', en: 'Save' })}
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'airdrops' && (
          <div className="h-full">
            <AirdropDiscovery />
          </div>
        )}

        {activeTab === 'autoEarn' && (
          <div className="h-full">
            <AutoEarnPanel />
          </div>
        )}

        {activeTab === 'policies' && (
          <div className="space-y-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-lg font-semibold">{t({ zh: '策略与授权', en: 'Policies & Authorization' })}</h3>
                <p className="text-sm text-slate-400">{t({ zh: '配置 Agent 自动执行的边界与规则', en: 'Configure boundaries and rules for agent automation' })}</p>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => window.open('/app/user/agent-authorizations/create', '_blank')}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 transition-colors flex items-center gap-2"
                >
                  <Shield className="w-4 h-4" />
                  {t({ zh: '新建授权', en: 'New Authorization' })}
                </button>
              </div>
            </div>
            
            {/* 快速概览卡片 */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
              <div className="bg-white/5 border border-white/10 rounded-xl p-4">
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-8 h-8 bg-green-500/20 rounded-lg flex items-center justify-center">
                    <CheckCircle2 className="w-4 h-4 text-green-400" />
                  </div>
                  <span className="text-sm text-slate-400">{t({ zh: '活跃策略', en: 'Active Policies' })}</span>
                </div>
                <p className="text-2xl font-bold">5</p>
              </div>
              <div className="bg-white/5 border border-white/10 rounded-xl p-4">
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-8 h-8 bg-blue-500/20 rounded-lg flex items-center justify-center">
                    <Shield className="w-4 h-4 text-blue-400" />
                  </div>
                  <span className="text-sm text-slate-400">{t({ zh: 'Agent 授权', en: 'Agent Authorizations' })}</span>
                </div>
                <p className="text-2xl font-bold">{agentAuthorizations.length}</p>
              </div>
              <div className="bg-white/5 border border-white/10 rounded-xl p-4">
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-8 h-8 bg-purple-500/20 rounded-lg flex items-center justify-center">
                    <Zap className="w-4 h-4 text-purple-400" />
                  </div>
                  <span className="text-sm text-slate-400">{t({ zh: '今日触发', en: 'Triggered Today' })}</span>
                </div>
                <p className="text-2xl font-bold">12</p>
              </div>
            </div>
            
            <PolicyEngine />
            
            {/* Agent 授权列表 */}
            {agentAuthorizations.length > 0 && (
              <div className="bg-white/5 border border-white/10 rounded-xl p-6 mt-6">
                <h4 className="font-semibold mb-4 flex items-center gap-2">
                  <Shield className="w-5 h-5 text-purple-400" />
                  {t({ zh: 'Agent 授权列表', en: 'Agent Authorizations' })}
                </h4>
                <div className="space-y-3">
                  {agentAuthorizations.map(auth => (
                    <div key={auth.id} className="flex items-center justify-between p-4 bg-white/5 rounded-lg border border-white/5">
                      <div className="flex items-center gap-4">
                        <div className={`w-3 h-3 rounded-full ${auth.isActive ? 'bg-green-500' : 'bg-slate-500'}`} />
                        <div>
                          <p className="font-medium">{auth.agentName || auth.agentId}</p>
                          <div className="flex items-center gap-3 text-xs text-slate-500 mt-1">
                            <span>{t({ zh: '单次', en: 'Per-tx' })}: ${auth.singleLimit || 0}</span>
                            <span>{t({ zh: '日限额', en: 'Daily' })}: ${auth.dailyLimit || 0}</span>
                            <span className="uppercase">{auth.authorizationType}</span>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <button className="px-3 py-1 text-sm bg-white/5 hover:bg-white/10 rounded-lg transition-colors">
                          {t({ zh: '编辑', en: 'Edit' })}
                        </button>
                        {auth.isActive && (
                          <button className="px-3 py-1 text-sm text-red-400 hover:bg-red-500/20 rounded-lg transition-colors">
                            {t({ zh: '撤销', en: 'Revoke' })}
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === 'security' && (
          <div className="space-y-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-lg font-semibold">{t({ zh: '安全中心', en: 'Security Center' })}</h3>
                <p className="text-sm text-slate-400">{t({ zh: '管理会话、设备和安全设置', en: 'Manage sessions, devices and security settings' })}</p>
              </div>
              <div className="flex gap-2">
                <button 
                  onClick={() => setShowSessionManager(true)}
                  className="px-4 py-2 bg-blue-600/20 text-blue-400 rounded-lg text-sm hover:bg-blue-600/30 transition-colors flex items-center gap-2"
                >
                  <ShieldCheck className="w-4 h-4" />
                  {t({ zh: '管理 Session', en: 'Manage Sessions' })}
                </button>
              </div>
            </div>

            {/* 安全状态概览 */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="bg-gradient-to-br from-green-500/20 to-emerald-600/20 border border-green-500/30 rounded-xl p-4">
                <div className="flex items-center gap-2 mb-2">
                  <ShieldCheck className="w-5 h-5 text-green-400" />
                  <span className="text-sm font-medium text-green-300">{t({ zh: '安全状态', en: 'Security Status' })}</span>
                </div>
                <p className="text-xl font-bold text-green-400">{t({ zh: '良好', en: 'Good' })}</p>
              </div>
              <div className="bg-white/5 border border-white/10 rounded-xl p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Clock className="w-5 h-5 text-blue-400" />
                  <span className="text-sm text-slate-400">{t({ zh: '活跃会话', en: 'Active Sessions' })}</span>
                </div>
                <p className="text-xl font-bold">{sessions.length}</p>
              </div>
              <div className="bg-white/5 border border-white/10 rounded-xl p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Shield className="w-5 h-5 text-purple-400" />
                  <span className="text-sm text-slate-400">{t({ zh: 'Agent 授权', en: 'Authorizations' })}</span>
                </div>
                <p className="text-xl font-bold">{agentAuthorizations.length}</p>
              </div>
              <div className="bg-white/5 border border-white/10 rounded-xl p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Activity className="w-5 h-5 text-amber-400" />
                  <span className="text-sm text-slate-400">{t({ zh: '今日操作', en: 'Today\'s Actions' })}</span>
                </div>
                <p className="text-xl font-bold">24</p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Session 概览 */}
              <div className="bg-white/5 border border-white/10 rounded-xl p-6">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-blue-500/20 rounded-lg">
                      <Clock className="w-5 h-5 text-blue-400" />
                    </div>
                    <h4 className="font-semibold">{t({ zh: '活跃会话', en: 'Active Sessions' })}</h4>
                  </div>
                  <button 
                    onClick={() => setShowSessionManager(true)}
                    className="text-sm text-blue-400 hover:text-blue-300"
                  >
                    {t({ zh: '管理', en: 'Manage' })}
                  </button>
                </div>
                <div className="space-y-3">
                  {sessions.length === 0 ? (
                    <p className="text-slate-500 text-sm py-4 text-center">{t({ zh: '暂无活跃会话', en: 'No active sessions' })}</p>
                  ) : (
                    sessions.slice(0, 3).map(session => (
                      <div key={session.id} className="flex items-center justify-between p-3 bg-white/5 rounded-lg border border-white/5">
                        <div className="flex items-center gap-3">
                          <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                          <div>
                            <p className="text-sm font-medium text-white">{session.agentId || 'Unknown Agent'}</p>
                            <p className="text-xs text-slate-500">{new Date(session.createdAt).toLocaleDateString()}</p>
                          </div>
                        </div>
                        <button
                          onClick={() => handleRevokeSession(session.id)}
                          className="text-xs text-red-400 hover:text-red-300"
                        >
                          {t({ zh: '撤销', en: 'Revoke' })}
                        </button>
                      </div>
                    ))
                  )}
                  {sessions.length > 3 && (
                    <button 
                      onClick={() => setShowSessionManager(true)}
                      className="w-full py-2 text-sm text-blue-400 hover:text-blue-300 transition-colors"
                    >
                      {t({ zh: '查看全部', en: 'View All' })} ({sessions.length})
                    </button>
                  )}
                </div>
              </div>

              {/* 授权概览 */}
              <div className="bg-white/5 border border-white/10 rounded-xl p-6">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-purple-500/20 rounded-lg">
                      <Shield className="w-5 h-5 text-purple-400" />
                    </div>
                    <h4 className="font-semibold">{t({ zh: 'Agent 授权', en: 'Agent Authorizations' })}</h4>
                  </div>
                  <button 
                    onClick={() => setActiveTab('policies')}
                    className="text-sm text-blue-400 hover:text-blue-300"
                  >
                    {t({ zh: '管理', en: 'Manage' })}
                  </button>
                </div>
                <div className="space-y-3">
                  {agentAuthorizations.length === 0 ? (
                    <p className="text-slate-500 text-sm py-4 text-center">{t({ zh: '暂无 Agent 授权', en: 'No agent authorizations' })}</p>
                  ) : (
                    agentAuthorizations.slice(0, 3).map(auth => (
                      <div key={auth.id} className="flex items-center justify-between p-3 bg-white/5 rounded-lg border border-white/5">
                        <div className="flex items-center gap-3">
                          <CheckCircle2 className="w-4 h-4 text-green-400" />
                          <div>
                            <p className="text-sm font-medium text-white">{auth.agentName || auth.agentId}</p>
                            <p className="text-xs text-slate-500">{auth.authorizationType.toUpperCase()} • ${auth.dailyLimit || 0}/day</p>
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>

            {/* 设备管理 */}
            <div className="bg-white/5 border border-white/10 rounded-xl p-6">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-cyan-500/20 rounded-lg">
                    <Cpu className="w-5 h-5 text-cyan-400" />
                  </div>
                  <h4 className="font-semibold">{t({ zh: '登录设备', en: 'Logged-in Devices' })}</h4>
                </div>
              </div>
              <div className="space-y-3">
                <div className="flex items-center justify-between p-4 bg-white/5 rounded-lg border border-green-500/30">
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 bg-green-500/20 rounded-lg flex items-center justify-center">
                      <Globe className="w-5 h-5 text-green-400" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="font-medium">{t({ zh: '当前设备', en: 'Current Device' })}</p>
                        <span className="px-2 py-0.5 bg-green-500/20 text-green-400 text-[10px] rounded-full uppercase">{t({ zh: '在线', en: 'Online' })}</span>
                      </div>
                      <p className="text-xs text-slate-500">Windows • Chrome • {new Date().toLocaleString()}</p>
                    </div>
                  </div>
                </div>
                <div className="flex items-center justify-between p-4 bg-white/5 rounded-lg">
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 bg-slate-500/20 rounded-lg flex items-center justify-center">
                      <Cpu className="w-5 h-5 text-slate-400" />
                    </div>
                    <div>
                      <p className="font-medium">iPhone 15 Pro</p>
                      <p className="text-xs text-slate-500">iOS • Safari • 2025-12-30 10:30</p>
                    </div>
                  </div>
                  <button className="text-sm text-red-400 hover:text-red-300">{t({ zh: '移除', en: 'Remove' })}</button>
                </div>
              </div>
            </div>

            {/* 安全审计日志 */}
            <div className="bg-white/5 border border-white/10 rounded-xl p-6">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-yellow-500/20 rounded-lg">
                    <Activity className="w-5 h-5 text-yellow-400" />
                  </div>
                  <h4 className="font-semibold">{t({ zh: '安全审计日志', en: 'Security Audit Logs' })}</h4>
                </div>
                <button className="text-sm text-blue-400 hover:text-blue-300">
                  {t({ zh: '查看全部', en: 'View All' })}
                </button>
              </div>
              <div className="space-y-2">
                {[
                  { type: 'success', event: { zh: '成功登录', en: 'Successful Login' }, time: '2025-12-31 14:20:05', detail: 'IP: 192.168.1.1' },
                  { type: 'info', event: { zh: '更新支付策略', en: 'Updated Payment Policy' }, time: '2025-12-31 10:15:32', detail: { zh: '每日限额修改为 100 USDC', en: 'Daily limit changed to 100 USDC' } },
                  { type: 'warning', event: { zh: '新设备登录', en: 'New Device Login' }, time: '2025-12-30 18:45:00', detail: 'iPhone 15 Pro • Safari' },
                  { type: 'success', event: { zh: 'Session 创建', en: 'Session Created' }, time: '2025-12-30 15:30:22', detail: 'Agent: Shopping Assistant' },
                ].map((log, i) => (
                  <div key={i} className="flex items-center gap-4 p-3 border-b border-white/5 last:border-0">
                    <div className={`w-2 h-2 rounded-full ${
                      log.type === 'success' ? 'bg-green-500' :
                      log.type === 'warning' ? 'bg-yellow-500' :
                      'bg-blue-500'
                    }`} />
                    <div className="flex-1">
                      <p className="text-sm text-white">{t(log.event)}</p>
                      <p className="text-xs text-slate-500">{log.time} • {typeof log.detail === 'string' ? log.detail : t(log.detail)}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {showSessionManager && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[100] p-4">
          <div className="max-w-4xl w-full max-h-[90vh] overflow-y-auto">
            <SessionManager onClose={() => {
              setShowSessionManager(false)
              loadSessions()
            }} />
          </div>
        </div>
      )}
    </div>
  )
}
