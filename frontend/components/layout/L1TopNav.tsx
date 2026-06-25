import { useRouter } from 'next/router';
import Link from 'next/link';
import { 
  Home, 
  TrendingUp, 
  ShoppingBag, 
  CreditCard, 
  Briefcase,
  Package,
  ShoppingCart,
  DollarSign,
  BarChart3,
  Zap,
  Rocket,
  BookOpen,
  Settings,
  ShieldCheck,
  Menu,
  X,
  Wallet,
  Bot,
  UserCheck,
  Users,
  Share2
} from 'lucide-react';
import { useAgentMode } from '../../contexts/AgentModeContext';
import { useLocalization } from '../../contexts/LocalizationContext';
import { UserMenu } from '../auth/UserMenu';
import { useUser } from '../../contexts/UserContext';
import { useState } from 'react';

export type L1Tab = 'dashboard' | 'agents' | 'earn' | 'shop' | 'pay' | 'assets' | 'skills' | 'security' |
                    'unified-account' | 'agent-accounts' | 'kyc' | 'workspaces' | 'promotion' |
                    'products' | 'orders' | 'finance' | 'analytics' |
                    'build' | 'publish' | 'revenue' | 'docs' | 'settings';

interface L1TopNavProps {
  activeTab: L1Tab;
  onTabChange: (tab: L1Tab) => void;
  onConfigOpen: () => void;
}

export function L1TopNav({ activeTab, onTabChange, onConfigOpen }: L1TopNavProps) {
  const { mode, setMode, trySetMode } = useAgentMode();
  const { t } = useLocalization();
  const { user, isAuthenticated } = useUser();
  const router = useRouter();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // L1 tabs for each role (7 fixed tabs for user)
  // 注意：普通用户不再需要 skills 管理，技能管理仅限开发者工作台
  const userTabs = [
    { id: 'dashboard' as const, label: { zh: '控制台', en: 'Dashboard' }, icon: Home },
    { id: 'unified-account' as const, label: { zh: '资金', en: 'Funds' }, icon: Wallet },
    { id: 'agent-accounts' as const, label: { zh: 'Agent', en: 'Agents' }, icon: Bot },
    { id: 'earn' as const, label: { zh: '赚钱', en: 'Earn' }, icon: TrendingUp },
    { id: 'shop' as const, label: { zh: '购物', en: 'Shopping' }, icon: ShoppingBag },
    { id: 'promotion' as const, label: { zh: '推广中心', en: 'Promote' }, icon: Share2 },
  ];

  const merchantTabs = [
    { id: 'dashboard' as const, label: { zh: '仪表板', en: 'Dashboard' }, icon: Home },
    { id: 'products' as const, label: { zh: '商品', en: 'Products' }, icon: Package },
    { id: 'orders' as const, label: { zh: '订单', en: 'Orders' }, icon: ShoppingCart },
    { id: 'finance' as const, label: { zh: '财务', en: 'Finance' }, icon: DollarSign },
    { id: 'analytics' as const, label: { zh: '分析', en: 'Analytics' }, icon: BarChart3 },
  ];

  const developerTabs = [
    { id: 'dashboard' as const, label: { zh: '仪表板', en: 'Dashboard' }, icon: Home },
    { id: 'publish' as const, label: { zh: '资产发布', en: 'Publish' }, icon: Rocket },
    { id: 'revenue' as const, label: { zh: '我的收益', en: 'Revenue' }, icon: DollarSign },
    { id: 'docs' as const, label: { zh: '技术文档', en: 'Docs' }, icon: BookOpen },
    { id: 'settings' as const, label: { zh: '配置', en: 'Config' }, icon: Settings },
  ];

  const tabs = mode === 'personal' ? userTabs : 
               mode === 'merchant' ? merchantTabs : 
               developerTabs;

  const roleOptions = [
    { id: 'personal', label: { zh: '个人', en: 'Personal' }, color: 'bg-cyan-500/20 text-cyan-300' },
    { id: 'merchant', label: { zh: '商户', en: 'Merchant' }, color: 'bg-blue-500/20 text-blue-300' },
    { id: 'developer', label: { zh: '专业用户', en: 'Professional' }, color: 'bg-purple-500/20 text-purple-300' },
  ] as const;

  const getRoleBadge = () => {
    switch (mode) {
      case 'personal': return { text: t({ zh: '个人', en: 'Personal' }), color: 'bg-cyan-500/20 text-cyan-400' };
      case 'merchant': return { text: t({ zh: '商户', en: 'Merchant' }), color: 'bg-blue-500/20 text-blue-400' };
      case 'developer': return { text: t({ zh: '专业用户', en: 'Professional' }), color: 'bg-purple-500/20 text-purple-400' };
    }
  };

  const badge = getRoleBadge();

  return (
    <>
      {/* Desktop Navigation */}
      <nav className="hidden md:flex bg-slate-900 border-b border-slate-800 h-12 items-center px-4">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-2 mr-6">
          <img src="/brand/logo-icon.png" alt="Agentrix" className="w-7 h-7 rounded-lg" />
          <span className="text-white font-bold text-sm">Agentrix</span>
        </Link>

        {/* Role Badge */}
        <span className={`text-xs font-medium px-2 py-0.5 rounded ${badge.color} mr-4`}>
          {badge.text}
        </span>

        {/* Role Switcher */}
        <div className="flex items-center gap-1 mr-6 px-1 py-0.5 rounded-lg bg-slate-800/60 border border-slate-700">
          {roleOptions.map((role) => {
            const isActive = mode === role.id;
            return (
              <button
                key={role.id}
                onClick={() => {
                  const result = trySetMode(role.id as 'personal' | 'merchant' | 'developer', user?.roles);
                  if (!result.success) {
                    console.log('Access denied for mode:', role.id, result.reason);
                  }
                }}
                className={`px-2 py-1 text-[11px] font-medium rounded-md transition-colors ${
                  isActive
                    ? `${role.color} border border-slate-600`
                    : 'text-slate-400 hover:text-white'
                }`}
                aria-label={`Switch to ${role.id}`}
              >
                {t(role.label)}
              </button>
            );
          })}
        </div>

        {/* L1 Tabs */}
        <div className="flex items-center gap-1 flex-1">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => onTabChange(tab.id)}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                  isActive
                    ? 'bg-slate-800 text-white border-b-2 border-blue-500'
                    : 'text-slate-400 hover:text-white hover:bg-slate-800/50'
                }`}
              >
                <Icon size={16} />
                <span>{t(tab.label)}</span>
              </button>
            );
          })}
        </div>

        {/* Right Side */}
        <div className="flex items-center gap-3">
          {/* Config Button */}
          <button
            onClick={onConfigOpen}
            className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
            title={t({ zh: '配置', en: 'Configuration' })}
          >
            <Settings size={18} />
          </button>

          {/* User Menu */}
          {isAuthenticated && user ? (
            <UserMenu />
          ) : (
            <Link
              href="/auth/login"
              className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium rounded-lg transition-colors"
            >
              {t({ zh: '登录', en: 'Login' })}
            </Link>
          )}
        </div>
      </nav>

      {/* Mobile Top Bar */}
      <nav className="md:hidden bg-slate-900 border-b border-slate-800 h-14 flex items-center justify-between px-4">
        {/* Menu Button */}
        <button
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          className="p-2 text-slate-400 hover:text-white"
        >
          {mobileMenuOpen ? <X size={20} /> : <Menu size={20} />}
        </button>

        {/* Logo */}
        <Link href="/" className="flex items-center gap-2">
          <img src="/brand/logo-icon.png" alt="Agentrix" className="w-7 h-7 rounded-lg" />
          <span className="text-white font-bold text-sm">Agentrix</span>
        </Link>

        {/* Config & User */}
        <div className="flex items-center gap-2">
          <button
            onClick={onConfigOpen}
            className="p-2 text-slate-400 hover:text-white"
          >
            <Settings size={18} />
          </button>
        </div>
      </nav>

      {/* Mobile Menu Overlay */}
      {mobileMenuOpen && (
        <div className="md:hidden fixed inset-0 z-50 bg-black/50" onClick={() => setMobileMenuOpen(false)}>
          <div 
            className="absolute top-14 left-0 right-0 bg-slate-900 border-b border-slate-800 p-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-2 mb-3">
              {roleOptions.map((role) => {
                const isActive = mode === role.id;
                return (
                  <button
                    key={role.id}
                    onClick={() => {
                      setMode(role.id as 'personal' | 'merchant' | 'developer');
                    }}
                    className={`flex-1 px-3 py-2 rounded-md text-sm font-medium ${
                      isActive ? `${role.color} border border-slate-600` : 'text-slate-400 bg-slate-800'
                    }`}
                  >
                    {t(role.label)}
                  </button>
                );
              })}
            </div>
            <div className="flex flex-col gap-2">
              {tabs.map((tab) => {
                const Icon = tab.icon;
                const isActive = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    onClick={() => {
                      onTabChange(tab.id);
                      setMobileMenuOpen(false);
                    }}
                    className={`flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-all ${
                      isActive
                        ? 'bg-slate-800 text-white'
                        : 'text-slate-400 hover:text-white hover:bg-slate-800/50'
                    }`}
                  >
                    <Icon size={18} />
                    <span>{t(tab.label)}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// Mobile Bottom Tab Bar
export function MobileBottomNav({ activeTab, onTabChange }: Omit<L1TopNavProps, 'onConfigOpen'>) {
  const { mode } = useAgentMode();
  const { t } = useLocalization();

  const userTabs = [
    { id: 'dashboard' as const, label: { zh: '首页', en: 'Home' }, icon: Home },
    { id: 'earn' as const, label: { zh: '赚钱', en: 'Earn' }, icon: TrendingUp },
    { id: 'shop' as const, label: { zh: '购物', en: 'Shop' }, icon: ShoppingBag },
    { id: 'pay' as const, label: { zh: '支付', en: 'Pay' }, icon: CreditCard },
    { id: 'assets' as const, label: { zh: '资产', en: 'Assets' }, icon: Briefcase },
  ];

  const merchantTabs = [
    { id: 'dashboard' as const, label: { zh: '首页', en: 'Home' }, icon: Home },
    { id: 'products' as const, label: { zh: '商品', en: 'Products' }, icon: Package },
    { id: 'orders' as const, label: { zh: '订单', en: 'Orders' }, icon: ShoppingCart },
    { id: 'finance' as const, label: { zh: '财务', en: 'Finance' }, icon: DollarSign },
    { id: 'analytics' as const, label: { zh: '分析', en: 'Analytics' }, icon: BarChart3 },
  ];

  const developerTabs = [
    { id: 'dashboard' as const, label: { zh: '首页', en: 'Home' }, icon: Home },
    { id: 'build' as const, label: { zh: '构建', en: 'Build' }, icon: Zap },
    { id: 'publish' as const, label: { zh: '发布', en: 'Publish' }, icon: Rocket },
    { id: 'revenue' as const, label: { zh: '收益', en: 'Revenue' }, icon: DollarSign },
    { id: 'docs' as const, label: { zh: '文档', en: 'Docs' }, icon: BookOpen },
  ];

  const tabs = mode === 'personal' ? userTabs : 
               mode === 'merchant' ? merchantTabs : 
               developerTabs;

  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-slate-900 border-t border-slate-800 z-40 safe-area-pb">
      <div className="flex items-center justify-around h-16">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => onTabChange(tab.id)}
              className={`flex flex-col items-center justify-center gap-1 flex-1 py-2 transition-colors ${
                isActive ? 'text-blue-500' : 'text-slate-500'
              }`}
            >
              <Icon size={20} />
              <span className="text-xs font-medium">{t(tab.label)}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
