import { useState, useCallback, useEffect, useMemo } from 'react'
import { useUser } from '../../../contexts/UserContext'
import { useAgentMode } from '../../../contexts/AgentModeContext'
import { UserModuleV2 } from './UserModuleV2'
import { MerchantModuleV2 } from './MerchantModuleV2'
import { DeveloperModuleV2 } from './DeveloperModuleV2'
import { CommandHandler } from './CommandHandler'
import { RoleSwitcher } from './RoleSwitcher'
import { PersonaSwitcher, type UserPersona } from './PersonaSwitcher'
import { AgentChatEnhanced } from '../AgentChatEnhanced'
import { useLocalization } from '../../../contexts/LocalizationContext'
import { MessageSquare, User, Store, Code, ShoppingBag, Zap, Layout, FileText, Link2 } from 'lucide-react'
import { ReceiptsCenter } from '../../workspace/ReceiptsCenter'
import { ConnectorsHub } from '../../workspace/ConnectorsHub'
import { TaskPanel } from '../../workspace/TaskPanel'
import { MarketplaceView } from '../MarketplaceView'
import { AutoEarnPanel } from '../AutoEarnPanel'
import { ShoppingCart } from '../ShoppingCart'
import { CodeGenerator } from '../CodeGenerator'
import { Sandbox } from '../Sandbox'
import { ReferralDashboard } from '../../referral/ReferralDashboard'
import { useToast } from '../../../contexts/ToastContext'
import { useCart } from '../../../contexts/CartContext'
import { ProductInfo } from '../../../lib/api/product.api'








export type WorkspaceView = 'chat' | 'user' | 'merchant' | 'developer' | 'marketplace' | 'autoEarn' | 'cart' | 'code' | 'sandbox' | 'orders' | 'referral' | 'receipts' | 'connectors'

interface UnifiedWorkspaceProps {
  onAction?: (action: string, data?: any) => void
}

/**
 * 统一工作台组件
 * 集成用户、商户、专业用户所有后台功能
 * 支持对话式操作和角色切换
 */
export function UnifiedWorkspace({ onAction }: UnifiedWorkspaceProps) {
  const { user, isAuthenticated } = useUser()
  const { mode, setMode } = useAgentMode()
  const { t } = useLocalization()
  const cart = useCart()
  const [currentView, setCurrentView] = useState<WorkspaceView>('chat')
  const [commandHistory, setCommandHistory] = useState<Array<{ command: string; result: any }>>([])
  const [currentPersona, setCurrentPersona] = useState<UserPersona>('personal')


  // 检测用户角色
  useEffect(() => {
    console.log('[UnifiedWorkspace] User or Auth state changed:', {
      isAuthenticated,
      hasUser: !!user,
      roles: user?.roles
    })
  }, [user, isAuthenticated])

  const userRoles = useMemo(() => ({
    isUser: !!user,
    isMerchant: !!user?.roles?.includes('merchant' as any),
    isDeveloper: !!user?.roles?.includes('developer' as any),
  }), [user])

  // 处理画像切换
  const handlePersonaChange = useCallback((persona: UserPersona) => {
    setCurrentPersona(persona)
    // 同步模式和视图
    switch (persona) {
      case 'merchant':
      case 'expert':
        setMode('merchant')
        setCurrentView('merchant')
        break
      case 'developer':
      case 'api_provider':
      case 'data_provider':
        setMode('developer')
        setCurrentView('developer')
        break
      default:
        setMode('personal')
        setCurrentView('user')
    }
  }, [setMode])


  // 处理对话命令
  const handleCommand = useCallback((command: string, data?: any) => {
    const handler = new CommandHandler(userRoles, mode)
    const result = handler.processCommand(command, data)
    
    setCommandHistory(prev => [...prev, { command, result }])
    
    // 根据命令结果切换视图
    if (result.view) {
      setCurrentView(result.view as WorkspaceView)
    }
    
    // 执行操作
    if (result.action && onAction) {
      onAction(result.action, result.data)
    }
    
    return result
  }, [userRoles, mode, onAction])

  // 处理角色切换
  const handleRoleSwitch = useCallback((newMode: 'personal' | 'merchant' | 'developer') => {
    setMode(newMode)
    // 根据角色切换到相应视图
    if (newMode === 'merchant' && userRoles.isMerchant) {
      setCurrentView('merchant')
    } else if (newMode === 'developer' && userRoles.isDeveloper) {
      setCurrentView('developer')
    } else {
      setCurrentView('chat')
    }
  }, [setMode, userRoles])

  // 强化视图切换逻辑
  const handleViewChange = useCallback((view: WorkspaceView) => {
    setCurrentView(view)
    
    // 自动同步模式
    if (['merchant'].includes(view)) {
      setMode('merchant')
    } else if (['developer', 'connectors', 'code'].includes(view)) {
      setMode('developer')
    } else if (['user', 'orders', 'receipts', 'cart'].includes(view)) {
      setMode('personal')
    }
  }, [setMode])

  return (
    <div className="flex flex-col h-full bg-slate-950 text-white">
      {/* L1: 画像切换栏 - 新增 */}
      <PersonaSwitcher
        currentPersona={currentPersona}
        onPersonaChange={handlePersonaChange}
      />

      <div className="flex flex-1 overflow-hidden">
        {/* 左侧：角色切换和快捷功能 */}
        <div className="w-72 border-r border-white/5">
          <RoleSwitcher
            currentMode={mode}
            userRoles={userRoles}
            onRoleSwitch={handleRoleSwitch}
            onViewChange={handleViewChange}
          />
        </div>

        {/* 中间：主工作区 */}
        <div className="flex-1 flex flex-col overflow-hidden bg-slate-950">
        {/* 顶部导航 */}
        <div className="border-b border-white/5 bg-slate-900/30 backdrop-blur-md px-8 py-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 rounded-xl bg-cyan-500/10 flex items-center justify-center text-cyan-400 border border-cyan-500/20">
                {currentView === 'chat' && <MessageSquare size={20} />}
                {currentView === 'user' && <User size={20} />}
                {currentView === 'merchant' && <Store size={20} />}
                {currentView === 'developer' && <Code size={20} />}
                {currentView === 'marketplace' && <ShoppingBag size={20} />}
                {currentView === 'autoEarn' && <Zap size={20} />}
                {currentView === 'orders' && <Layout size={20} />}
                {currentView === 'receipts' && <FileText size={20} />}
                {currentView === 'connectors' && <Link2 size={20} />}
              </div>
              <div>
                <h2 className="text-lg font-bold tracking-tight">
                  {currentView === 'chat' && t({ zh: '对话工作台', en: 'Conversation Workspace' })}
                  {currentView === 'user' && t({ zh: '个人中心', en: 'Personal Center' })}
                  {currentView === 'merchant' && t({ zh: '商户控制台', en: 'Merchant Console' })}
                  {currentView === 'developer' && t({ zh: '资产发布与管理', en: 'Asset Publishing & Management' })}
                  {currentView === 'marketplace' && t({ zh: '商品市场', en: 'Marketplace' })}
                  {currentView === 'autoEarn' && t({ zh: 'Auto-Earn', en: 'Auto-Earn' })}
                  {currentView === 'orders' && t({ zh: '订单中心', en: 'Order Center' })}
                  {currentView === 'receipts' && t({ zh: '审计与收据', en: 'Receipts & Audit' })}
                  {currentView === 'connectors' && t({ zh: '连接器中心', en: 'Connectors Hub' })}
                </h2>

                <p className="text-[10px] text-slate-500 uppercase font-bold tracking-widest">
                  {mode === 'personal' ? 'Personal Mode' : mode === 'merchant' ? 'Merchant Mode' : 'Professional Mode'} • Active
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={() => setCurrentView('chat')}
                className={`px-4 py-2 rounded-full text-sm font-bold transition-all ${
                  currentView === 'chat' 
                    ? 'bg-cyan-500 text-slate-950 shadow-lg shadow-cyan-500/20' 
                    : 'bg-white/5 text-slate-400 hover:bg-white/10 hover:text-white'
                }`}
              >
                {t({ zh: '返回对话', en: 'Back to Chat' })}
              </button>
              <div className="w-px h-6 bg-white/10 mx-2" />
              <div className="flex items-center gap-3 px-4 py-2 rounded-full bg-white/5 border border-white/5">
                <div className="w-2 h-2 rounded-full bg-emerald-500" />
                <span className="text-xs font-mono text-slate-300">{user?.walletAddress ? `${user.walletAddress.slice(0, 6)}...${user.walletAddress.slice(-4)}` : 'Not Connected'}</span>
              </div>
            </div>
          </div>
        </div>

        {/* 内容区域 */}
        <div className="flex-1 overflow-y-auto">
          {currentView === 'chat' && (
            <AgentChatEnhanced
              onProductSelect={() => setCurrentView('marketplace')}
              onOrderQuery={() => setCurrentView('orders')}
              onCodeGenerate={() => setCurrentView('code')}
              onAction={(action, data) => {
                handleCommand(action, data)
                if (onAction) onAction(action, data)
              }}
            />
          )}

          {(currentView === 'user' || currentView === 'orders') && userRoles.isUser && (
            <UserModuleV2 
              forcedMainTab={currentView === 'orders' ? 'shopping' : 'dashboard'}
              forcedSubTab={currentView === 'orders' ? 'orders' : 'overview'}
            />
          )}

          {currentView === 'merchant' && (
            <MerchantModuleV2 />
          )}

          {currentView === 'developer' && (
            <DeveloperModuleV2 />
          )}

          {currentView === 'marketplace' && (
            <div className="p-6">
              <MarketplaceView onProductClick={(p) => console.log('Product clicked:', p)} />
            </div>
          )}

          {currentView === 'autoEarn' && (
            <div className="p-6 h-full">
              <AutoEarnPanel />
            </div>
          )}

          {currentView === 'cart' && (
            <div className="p-6">
              <ShoppingCart 
                items={cart.items
                  .filter(item => item.product)
                  .map(item => ({
                    product: {
                      ...item.product,
                      commissionRate: 0,
                      status: 'active'
                    } as any,
                    quantity: item.quantity
                  }))}
                onUpdateQuantity={cart.updateQuantity}
                onRemoveItem={cart.removeItem}
                onCheckout={() => console.log('Checking out from workbench...')}
              />
            </div>
          )}

          {currentView === 'code' && (
            <div className="p-6 h-full">
              <CodeGenerator />
            </div>
          )}

          {currentView === 'sandbox' && (
            <div className="p-6 h-full">
              <Sandbox />
            </div>
          )}

          {currentView === 'referral' && (
            <div className="p-6 h-full">
              <ReferralDashboard />
            </div>
          )}

          {currentView === 'receipts' && (



            <div className="p-6">
              <ReceiptsCenter />
            </div>
          )}

          {currentView === 'connectors' && (
            <div className="p-6">
              <ConnectorsHub />
            </div>
          )}

          {/* 其他视图保持原有逻辑 */}
          {!['chat', 'user', 'merchant', 'developer', 'receipts', 'connectors'].includes(currentView) && (
            <div className="p-6">
              <p className="text-slate-400">{t({ zh: '视图切换中...', en: 'Switching view...' })}</p>
            </div>
          )}

        </div>
      </div>

      {/* 右侧：数据面板 */}
      <div className="w-80 border-l border-white/10 bg-slate-900/50">
        <div className="p-6 space-y-6">
          <div>
            <h3 className="text-sm font-semibold text-slate-400 mb-3">
              {t({ zh: '实时数据', en: 'Real-time Data' })}
            </h3>
            <div className="space-y-3">
              {mode === 'personal' && (
                <>
                  <div className="bg-white/5 rounded-lg p-3">
                    <p className="text-xs text-slate-400 mb-1">{t({ zh: '今日支付', en: 'Today Payments' })}</p>
                    <p className="text-lg font-semibold">¥0</p>
                  </div>
                  <div className="bg-white/5 rounded-lg p-3">
                    <p className="text-xs text-slate-400 mb-1">{t({ zh: '钱包余额', en: 'Wallet Balance' })}</p>
                    <p className="text-lg font-semibold">¥0</p>
                  </div>
                </>
              )}
              {mode === 'merchant' && (
                <>
                  <div className="bg-white/5 rounded-lg p-3">
                    <p className="text-xs text-slate-400 mb-1">{t({ zh: '今日GMV', en: 'Today GMV' })}</p>
                    <p className="text-lg font-semibold">¥0</p>
                  </div>
                  <div className="bg-white/5 rounded-lg p-3">
                    <p className="text-xs text-slate-400 mb-1">{t({ zh: '待结算', en: 'Pending Settlement' })}</p>
                    <p className="text-lg font-semibold">¥0</p>
                  </div>
                </>
              )}
              {mode === 'developer' && (
                <>
                  <div className="bg-white/5 rounded-lg p-3">
                    <p className="text-xs text-slate-400 mb-1">{t({ zh: 'API调用/24h', en: 'API Calls/24h' })}</p>
                    <p className="text-lg font-semibold">0</p>
                  </div>
                  <div className="bg-white/5 rounded-lg p-3">
                    <p className="text-xs text-slate-400 mb-1">{t({ zh: '今日收益', en: 'Today Revenue' })}</p>
                    <p className="text-lg font-semibold">¥0</p>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* 命令历史 */}
          {commandHistory.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-slate-400 mb-3">
                {t({ zh: '最近操作', en: 'Recent Actions' })}
              </h3>
              <div className="space-y-2">
                {commandHistory.slice(-5).map((item, idx) => (
                  <div key={idx} className="bg-white/5 rounded-lg p-2 text-xs">
                    <p className="text-slate-300">{item.command}</p>
                    {item.result.message && (
                      <p className="text-slate-400 mt-1">{item.result.message}</p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
      {/* Floating Task Guidance Panel */}
      {mode === 'merchant' && currentView === 'merchant' && <TaskPanel type="merchant" />}
      {mode === 'developer' && currentView === 'developer' && <TaskPanel type="developer" />}
      {mode === 'personal' && currentView === 'user' && <TaskPanel type="personal" />}
      </div>
    </div>

  )
}


