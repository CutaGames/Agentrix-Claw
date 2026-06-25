import { ReactNode } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/router'
import { useUser } from '../../contexts/UserContext'
import { UserMenu } from '../auth/UserMenu'
import { NotificationCenter } from '../notification/NotificationCenter'
import { useLocalization } from '../../contexts/LocalizationContext'

interface DashboardLayoutProps {
  children: ReactNode
  userType: 'user' | 'agent' | 'merchant'
}

export function DashboardLayout({ children, userType }: DashboardLayoutProps) {
  const router = useRouter()
  const { user, isAuthenticated } = useUser()
  const { t } = useLocalization()

  const userMenu = [
    { name: t('navigation.user.overview'), href: '/app/user', icon: '📊' },
    { name: t({ zh: 'Agent 工作台', en: 'Agent Workbench' }), href: '/agent-enhanced', icon: '🤖' },
    { name: t('navigation.user.transactions'), href: '/app/user/transactions', icon: '💳' },
    { name: t('navigation.user.subscriptions'), href: '/app/user/subscriptions', icon: '🔄' },
    { name: t('navigation.user.security'), href: '/app/user/security', icon: '🛡️' },
    { name: t('navigation.user.profile'), href: '/app/user/profile', icon: '👤' },
  ]

  const agentMenu = [
    { name: t('navigation.agent.overview'), href: '/app/agent', icon: '📊' },
    { name: t({ zh: 'Agent 工作台', en: 'Agent Workbench' }), href: '/agent-enhanced', icon: '🤖' },
    { name: t('navigation.agent.earnings'), href: '/app/agent/earnings', icon: '💰' },
    { name: t('navigation.agent.analytics'), href: '/app/agent/analytics', icon: '📈' },
  ]

  const merchantMenu = [
    { name: t('navigation.merchant.overview'), href: '/app/merchant', icon: '📊' },
    { name: t({ zh: 'Agent 工作台', en: 'Agent Workbench' }), href: '/agent-enhanced', icon: '🤖' },
    { name: t('navigation.merchant.products'), href: '/app/merchant/products', icon: '🛒' },
    { name: t('navigation.merchant.orders'), href: '/app/merchant/orders', icon: '📦' },
    { name: t('navigation.merchant.finance'), href: '/app/merchant/finance', icon: '💰' },
  ]

  const menu = userType === 'user' ? userMenu : 
               userType === 'agent' ? agentMenu : 
               merchantMenu

  const getRoleName = () => {
    switch (userType) {
      case 'user': return t('navigation.userCenter')
      case 'agent': return t('navigation.agentConsole')
      case 'merchant': return t('navigation.merchantDashboard')
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm border-b border-gray-200">
        <div className="px-6 py-4">
          <div className="flex justify-between items-center">
            <div className="flex items-center space-x-4">
              <Link href="/" className="text-xl font-bold text-gray-900">
                Agentrix
              </Link>
              <span className="text-gray-400">/</span>
              <span className="text-gray-700">{getRoleName()}</span>
            </div>
            
            <div className="flex items-center space-x-4">
              <NotificationCenter />
              {isAuthenticated && user ? (
                <UserMenu />
              ) : (
                <div className="flex items-center space-x-3">
                  <div className="w-8 h-8 bg-gray-300 rounded-full"></div>
                  <span className="text-gray-500">未登录</span>
                </div>
              )}
            </div>
          </div>
        </div>
      </header>
      <div className="flex">
        {/* Sidebar */}
        <aside className="w-64 bg-white shadow-sm min-h-screen py-6">
          <nav className="space-y-2 px-4">
            {menu.map((item) => {
              const isActive = router.pathname === item.href
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex items-center space-x-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                    isActive
                      ? 'bg-blue-50 text-blue-600'
                      : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                  }`}
                >
                  <span>{item.icon}</span>
                  <span>{item.name}</span>
                </Link>
              )
            })}
            
            {/* Role Switch */}
            <div className="pt-8 border-t border-gray-200">
              <div className="px-3 py-2 text-xs font-semibold text-gray-400 uppercase tracking-wider">
                切换角色
              </div>
              <Link
                href="/app/dashboard"
                className="flex items-center space-x-3 px-3 py-2 rounded-lg text-sm font-medium text-gray-600 hover:text-gray-900 hover:bg-gray-50 transition-colors"
              >
                <span>🔄</span>
                <span>角色选择</span>
              </Link>
            </div>
          </nav>
        </aside>
        {/* Main Content */}
        <main className="flex-1 p-6">
          {children}
        </main>
      </div>
    </div>
  )
}
