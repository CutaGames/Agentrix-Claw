import Link from 'next/link';
import { useRouter } from 'next/router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocalization } from '../../../contexts/LocalizationContext';
import { useToast } from '../../../contexts/ToastContext';
import { useUser } from '../../../contexts/UserContext';
import { orderApi, type Order } from '../../../lib/api/order.api';
import { paymentHistoryApi, type PaymentHistoryItem } from '../../../lib/api/payment-history.api';
import { walletApi, type WalletConnection } from '../../../lib/api/wallet.api';
import { userApi, type UserProfile } from '../../../lib/api/user.api';
import { userAgentApi, type Subscription } from '../../../lib/api/user-agent.api';
import { agentAuthorizationApi, type AgentAuthorization } from '../../../lib/api/agent-authorization.api';
import { productApi, type ProductInfo } from '../../../lib/api/product.api';
import { unifiedMarketplaceApi, type UnifiedSkillInfo } from '../../../lib/api/unified-marketplace.api';
import { agentMarketplaceApi, type AgentRanking } from '../../../lib/api/agent-marketplace.api';
import { paymentApi } from '../../../lib/api/payment.api';
import { useSessionManager } from '../../../hooks/useSessionManager';
import { executeDirectQuickPay } from '../../../lib/direct-pay-service';
import { WalletConnectModal } from '../../payment/WalletConnectModal';
import { MPCWalletCard } from '../../wallet/MPCWalletCard';
import { SkillCard } from '../../a2h/SkillCard';
import { MyAgentsPanel } from '../MyAgentsPanel';
import { AgentPresenceDashboard } from '../AgentPresenceDashboard';
import { CrossDevicePanel } from '../CrossDevicePanel';
// SkillManagementPanel 已移至开发者工作台，普通用户不再需要
import { AutoEarnPanel } from '../AutoEarnPanel';
import { AirdropDiscovery } from '../AirdropDiscovery';
import { PromotionPanel } from '../PromotionPanel';
import { PolicyEngine } from '../PolicyEngine';
import { SessionManager } from '../../payment/SessionManager';
import { AgentInsightsPanel } from '../AgentInsightsPanel';
import { WorkspaceManager } from '../../workspace/WorkspaceManager';
import { UnifiedAccountPanel, AgentAccountPanel, KYCCenterPanel, PayoutSettingsPanel } from '../../account';
import { AccountProvider } from '../../../contexts/AccountContext';
import { AgentAccountProvider } from '../../../contexts/AgentAccountContext';
import { KYCProvider } from '../../../contexts/KYCContext';
import { useAgentMode } from '../../../contexts/AgentModeContext';
import OnboardingWizard from '../../onboarding/OnboardingWizard';
import {
  LayoutDashboard,
  Bot,
  Wrench,
  TrendingUp,
  ShoppingBag,
  Briefcase,
  Receipt,
  ShieldCheck,
  User,
  Home,
  Zap,
  Package,
  Wallet,
  FileText,
  Lock,
  UserCircle,
  Plus,
  RefreshCw,
  Unlock,
  Smartphone,
  Globe,
  Activity,
  PieChart,
  Sparkles,
  Calendar,
  DollarSign,
  ArrowRight,
  Key,
  Info,
  Layout,
  Palette,
  Users,
  LogOut,
  Trash2,
  Copy,
  Check,
  ChevronRight,
  ArrowUpRight,
  ArrowDownLeft,
  Clock,
  CheckCircle2,
  AlertCircle,
  ExternalLink,
  Search,
  Filter,
  X,
  Bell,
  Shield,
  BadgeCheck,
  CreditCard,
  Building2,
} from 'lucide-react';

interface UserModuleV2Props {
  onCommand?: (command: string, data?: any) => void;
  forcedMainTab?: MainTab; // 允许外部（如工作台 L1）强制切换主标签
  forcedSubTab?: string; // 允许外部强制切换子标签
  hideNavigation?: boolean; // 嵌入模式下隐藏组件自带导航，使用外部 L1/L2
}

type MainTab = 'dashboard' | 'agents' | 'skills' | 'autoEarn' | 'shopping' | 'assets' | 'payments' | 'security' | 'profile' | 'unified-account' | 'agent-accounts' | 'kyc' | 'earn' | 'shop' | 'promotion';

// --- 子组件: 授权额度消耗进度波形图 ---
const UsageWaveform = ({ progress = 65 }: { progress?: number }) => {
  // 生成随机波形路径
  const points = useMemo(() => {
    return Array.from({ length: 20 }, (_, i) => {
      const x = (i / 19) * 100;
      const y = 30 + Math.random() * 40;
      return `${x},${y}`;
    }).join(' ');
  }, []);

  return (
    <div className="relative h-16 w-full overflow-hidden mt-4">
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="h-full w-full">
        {/* 背景阴影 */}
        <path
          d={`M0,100 L${points} L100,100 Z`}
          fill="url(#wave-gradient)"
          className="opacity-20"
        />
        {/* 波形主线 */}
        <polyline
          points={points}
          fill="none"
          stroke="#3b82f6"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <defs>
          <linearGradient id="wave-gradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#3b82f6" />
            <stop offset="100%" stopColor="transparent" />
          </linearGradient>
        </defs>
      </svg>
      {/* 进度提示线 */}
      <div 
        className="absolute bottom-0 h-full w-0.5 bg-blue-500/50 flex flex-col items-center" 
        style={{ left: `${progress}%` }}
      >
        <div className="bg-blue-600 text-white text-[8px] px-1 rounded absolute -top-1 font-mono">
          {progress}%
        </div>
      </div>
    </div>
  );
};

export function UserModuleV2({ onCommand, forcedMainTab, forcedSubTab, hideNavigation = false }: UserModuleV2Props) {
  const router = useRouter();
  const { t } = useLocalization();
  const { user, logout } = useUser();
  const { success, error: showError } = useToast();
  const { activeSession } = useSessionManager();
  const { mode } = useAgentMode();
  
  const [activeMainTab, setActiveMainTab] = useState<MainTab>('dashboard');
  const [activeSubTab, setActiveSubTab] = useState<string>('overview');

  // Sync state with external props (L1/L2 navigation)
  useEffect(() => {
    if (forcedMainTab) setActiveMainTab(forcedMainTab);
  }, [forcedMainTab]);

  useEffect(() => {
    if (forcedSubTab) setActiveSubTab(forcedSubTab);
  }, [forcedSubTab]);

  const [orders, setOrders] = useState<Order[]>([]);
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [payments, setPayments] = useState<PaymentHistoryItem[]>([]);
  const [paymentsLoading, setPaymentsLoading] = useState(false);
  const [wallets, setWallets] = useState<WalletConnection[]>([]);
  const [walletsLoading, setWalletsLoading] = useState(false);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [subscriptionsLoading, setSubscriptionsLoading] = useState(false);
  const [authorizations, setAuthorizations] = useState<AgentAuthorization[]>([]);
  const [authorizationsLoading, setAuthorizationsLoading] = useState(false);
  const [selectedAuth, setSelectedAuth] = useState<AgentAuthorization | null>(null);
  const [marketplaceProducts, setMarketplaceProducts] = useState<ProductInfo[]>([]);
  const [marketplaceSkills, setMarketplaceSkills] = useState<UnifiedSkillInfo[]>([]);
  const [marketplaceLoading, setMarketplaceLoading] = useState(false);
  const [marketplaceAgents, setMarketplaceAgents] = useState<AgentRanking[]>([]);
  const [agentsLoading, setAgentsLoading] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [showWalletModal, setShowWalletModal] = useState(false);
  const [isBuying, setIsBuying] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleRevokeSession = async (sessionId: string) => {
    if (!confirm(t({ zh: '确定要撤销此授权会话吗？', en: 'Are you sure you want to revoke this session?' }))) return;
    try {
      await agentAuthorizationApi.revokeAuthorization(sessionId);
      success(t({ zh: '会话已撤销', en: 'Session revoked' }));
      loadAuthorizations();
    } catch (err: any) {
      showError(err.message || t({ zh: '撤销失败', en: 'Revocation failed' }));
    }
  };

  const handleUnbindWallet = async (walletId: string) => {
    if (!confirm(t({ zh: '确定要解绑此钱包吗？', en: 'Are you sure you want to unbind this wallet?' }))) return;
    try {
      await walletApi.remove(walletId);
      success(t({ zh: '钱包已解绑', en: 'Wallet unbound' }));
      // Reload wallets
      const data = await walletApi.list();
      setWallets(data || []);
    } catch (err: any) {
      showError(err.message || t({ zh: '解绑失败', en: 'Unbinding failed' }));
    }
  };

  const handleUpdateProfile = async (data: Partial<UserProfile>) => {
    try {
      await userApi.updateProfile(data);
      success(t({ zh: '资料已更新', en: 'Profile updated' }));
      const updated = await userApi.getProfile();
      setProfile(updated);
    } catch (err: any) {
      showError(err.message || t({ zh: '更新失败', en: 'Update failed' }));
    }
  };

  const handleSubscribe = async (agentId: string) => {
    try {
      setIsBuying(true);
      await userAgentApi.subscribe(agentId);
      success(t({ zh: '订阅成功！该 Agent 已加入您的列表', en: 'Subscribed successfully! The agent is now in your list.' }));
      setActiveMainTab('agents');
      setActiveSubTab('my-agents');
    } catch (err: any) {
      showError(err.message || t({ zh: '订阅失败', en: 'Subscription failed' }));
    } finally {
      setIsBuying(false);
    }
  };

  const handleCancelSubscription = async (id: string) => {
    if (!confirm(t({ zh: '确定要取消此订阅吗？', en: 'Are you sure you want to cancel this subscription?' }))) return;
    try {
      await userAgentApi.cancelSubscription(id);
      success(t({ zh: '订阅已取消', en: 'Subscription cancelled' }));
      loadSubscriptions();
    } catch (err: any) {
      showError(err.message || t({ zh: '操作失败', en: 'Operation failed' }));
    }
  };

  const handleBuyProduct = async (product: ProductInfo) => {
    try {
      setIsBuying(true);
      const currency = product.metadata?.currency || 'USD';

      // Check for Zap availability - only if session is properly set up
      if (activeSession && activeSession.isActive && activeSession.signer) {
        try {
          success(t({ zh: '正在通过 Zap 一键闪付...', en: 'Zapping with QuickPay...' }));
          
          const result = await executeDirectQuickPay(
            {
              id: `pay_${Date.now()}`,
              amount: Number(product.price),
              currency: currency,
              description: `Buy ${product.name}`,
              merchantId: product.merchantId,
              metadata: {
                productId: product.id,
                type: 'marketplace_purchase'
              },
            },
            activeSession,
            user
          );

          if (result) {
            success(t({ zh: '闪付成功！', en: 'Zap successful!' }));
            setIsBuying(false);
            setActiveMainTab('shopping');
            setActiveSubTab('orders');
            loadOrders();
            return;
          }
        } catch (zapError: any) {
          console.warn('QuickPay failed, falling back to standard checkout:', zapError.message);
          // Fall through to standard checkout
        }
      }

      // Fallback: Redirect to standard checkout page
      const checkoutUrl = `/pay/checkout?productId=${product.id}&amount=${product.price}&currency=${currency}&name=${encodeURIComponent(product.name)}`;
      
      success(t({ zh: '正在跳转到支付页面...', en: 'Redirecting to checkout...' }));
      
      // Use window.open to open checkout in new tab or redirect
      if (typeof window !== 'undefined') {
        window.location.href = checkoutUrl;
      }
      
    } catch (err: any) {
      showError(err.message || t({ zh: '购买失败', en: 'Purchase failed' }));
      setIsBuying(false);
    }
  };

  const handleSocialLink = async (platform: string) => {
    // 模拟社交绑定流程
    success(t({ 
      zh: `正在连接 ${platform}...`, 
      en: `Connecting to ${platform}...` 
    }));
    
    setTimeout(() => {
      success(t({ 
        zh: `${platform} 绑定成功`, 
        en: `${platform} linked successfully` 
      }));
    }, 1500);
  };

  const loadMarketplace = useCallback(async () => {
    try {
      setMarketplaceLoading(true);
      // V2: Use unified search
      const data = await unifiedMarketplaceApi.search({ 
        humanAccessible: true,
        limit: 20
      });
      setMarketplaceSkills(data.results || []);
      
      // Keep legacy support for now if needed, but primary is skills
      const products = await productApi.getProducts({ status: 'active' });
      setMarketplaceProducts(products || []);
    } catch (err: any) {
      console.error('Failed to load marketplace:', err);
    } finally {
      setMarketplaceLoading(false);
    }
  }, []);

  const loadMarketplaceAgents = useCallback(async () => {
    try {
      setAgentsLoading(true);
      const data = await agentMarketplaceApi.searchAgents({ page: 1, pageSize: 20, sortBy: 'popularity' });
      if (data?.agents) {
        setMarketplaceAgents(data.agents);
      }
    } catch (err: any) {
      console.error('Failed to load marketplace agents:', err);
    } finally {
      setAgentsLoading(false);
    }
  }, []);

  // 主标签配置 - 重构后的新导航架构
  const mainTabs = [
    { id: 'dashboard' as const, label: { zh: '控制台', en: 'Dashboard' }, icon: Home },
    { id: 'unified-account' as const, label: { zh: '资金账户', en: 'Funds' }, icon: CreditCard },
    { id: 'agent-accounts' as const, label: { zh: 'Agent账户', en: 'Agent Accounts' }, icon: Bot },
    { id: 'kyc' as const, label: { zh: 'KYC认证', en: 'KYC' }, icon: BadgeCheck },
    { id: 'agents' as const, label: { zh: 'Agent中心', en: 'Agents' }, icon: Building2 },
    { id: 'skills' as const, label: { zh: '技能中心', en: 'Skills' }, icon: Wrench },
    { id: 'autoEarn' as const, label: { zh: '自动赚钱', en: 'Auto-Earn' }, icon: TrendingUp },
    { id: 'shopping' as const, label: { zh: '智能购物', en: 'Shopping' }, icon: ShoppingBag },
    { id: 'assets' as const, label: { zh: '资产管理', en: 'Assets' }, icon: Briefcase },
    { id: 'payments' as const, label: { zh: '支付账单', en: 'Payments' }, icon: Receipt },
    { id: 'security' as const, label: { zh: '策略安全', en: 'Security' }, icon: ShieldCheck },
    { id: 'profile' as const, label: { zh: '个人资料', en: 'Profile' }, icon: UserCircle },
  ];

  // 子标签配置
  const subTabs: Record<MainTab, Array<{ id: string; label: { zh: string; en: string } }>> = useMemo(() => ({
    dashboard: [
      { id: 'overview', label: { zh: '总览', en: 'Overview' } },
    ],
    agents: [
      { id: 'my-agents', label: { zh: '我的Agents', en: 'My Agents' } },
      { id: 'presence', label: { zh: 'Presence', en: 'Presence' } },
      { id: 'devices', label: { zh: '设备管理', en: 'Devices' } },
      { id: 'authorizations', label: { zh: '授权管理', en: 'Authorizations' } },
    ],
    skills: [
      { id: 'my-skills', label: { zh: '已安装技能', en: 'Installed Skills' } },
      { id: 'configure', label: { zh: '配置管理', en: 'Configure' } },
    ],
    autoEarn: [
      { id: 'tasks', label: { zh: '自动任务', en: 'Tasks' } },
      { id: 'airdrops', label: { zh: '空投发现', en: 'Airdrops' } },
    ],
    shopping: [
      { id: 'orders', label: { zh: '订单跟踪', en: 'Orders' } },
      { id: 'cart', label: { zh: '购物车', en: 'Cart' } },
      { id: 'wishlist', label: { zh: '心愿单', en: 'Wishlist' } },
      { id: 'promotions', label: { zh: '推广中心', en: 'Promotions' } },
    ],
    assets: [
      { id: 'wallets', label: { zh: '钱包管理', en: 'Wallets' } },
      { id: 'balances', label: { zh: '资产余额', en: 'Balances' } },
      { id: 'kyc', label: { zh: 'KYC认证', en: 'KYC' } },
    ],
    payments: [
      { id: 'history', label: { zh: '支付历史', en: 'History' } },
      { id: 'subscriptions', label: { zh: '订阅管理', en: 'Subscriptions' } },
      { id: 'invoices', label: { zh: '账单', en: 'Invoices' } },
      { id: 'referrals', label: { zh: '推广分润', en: 'Referrals' } },
    ],
    security: [
      { id: 'sessions', label: { zh: '授权会话', en: 'Sessions' } },
      { id: 'details', label: { zh: '权限详情', en: 'Permissions' } },
      { id: 'policies', label: { zh: '策略管理', en: 'Policies' } },
    ],
    profile: [
      { id: 'info', label: { zh: '基本信息', en: 'Info' } },
      { id: 'social', label: { zh: '社交绑定', en: 'Social' } },
    ],
    // 新增 P0 账户体系入口 - 修复映射匹配 L2LeftSidebar
    'unified-account': [
      { id: 'balances', label: { zh: '资产余额', en: 'Balances' } },
      { id: 'transactions', label: { zh: '交易记录', en: 'Transactions' } },
      { id: 'deposit', label: { zh: '充值', en: 'Deposit' } },
      { id: 'withdraw', label: { zh: '提现', en: 'Withdraw' } },
      { id: 'payout-settings', label: { zh: '结算设置', en: 'Payout Settings' } },
    ],
    'agent-accounts': [
      { id: 'my-agents', label: { zh: '我的 Agent', en: 'My Agents' } },
      { id: 'authorizations', label: { zh: '授权管理', en: 'Authorizations' } },
      { id: 'auto-pay', label: { zh: '自动支付', en: 'Auto-Pay' } },
    ],
    kyc: [
      { id: 'status', label: { zh: '认证状态', en: 'Status' } },
      { id: 'upgrade', label: { zh: '升级认证', en: 'Upgrade' } },
      { id: 'documents', label: { zh: '文档管理', en: 'Documents' } },
    ],
    earn: [
      { id: 'overview', label: { zh: '赚钱总览', en: 'Earn Overview' } },
    ],
    shop: [
      { id: 'marketplace', label: { zh: '智能商城', en: 'Shop' } },
    ],
    promotion: [
      { id: 'overview', label: { zh: '推广总览', en: 'Overview' } },
      { id: 'my-links', label: { zh: '我的链接', en: 'My Links' } },
      { id: 'materials', label: { zh: '营销素材', en: 'Materials' } },
    ],
  }), []);

  // 外部导航同步
  useEffect(() => {
    if (!forcedMainTab) return;
    setActiveMainTab(forcedMainTab);
    const fallback = subTabs[forcedMainTab]?.[0]?.id || 'overview';
    setActiveSubTab(forcedSubTab || fallback);
  }, [forcedMainTab, forcedSubTab, subTabs]);

  useEffect(() => {
    if (!forcedSubTab || forcedMainTab) return; // handled above when main tab also provided
    setActiveSubTab(forcedSubTab);
  }, [forcedSubTab, forcedMainTab]);

  const loadOrders = useCallback(async () => {
    try {
      setOrdersLoading(true);
      const res = await orderApi.getOrders();
      setOrders(res || []);
    } catch (err: any) {
      showError(err?.message || t({ zh: '订单加载失败', en: 'Failed to load orders' }));
      setOrders([]);
    } finally {
      setOrdersLoading(false);
    }
  }, [showError, t]);

  const loadSubscriptions = useCallback(async () => {
    try {
      setSubscriptionsLoading(true);
      const data = await userAgentApi.getSubscriptions();
      setSubscriptions(data || []);
    } catch (err: any) {
      showError(err?.message || t({ zh: '订阅加载失败', en: 'Failed to load subscriptions' }));
      setSubscriptions([]);
    } finally {
      setSubscriptionsLoading(false);
    }
  }, [showError, t]);

  const loadAuthorizations = useCallback(async () => {
    try {
      setAuthorizationsLoading(true);
      const data = await agentAuthorizationApi.getAuthorizations();
      setAuthorizations(data || []);
    } catch (err: any) {
      showError(err?.message || t({ zh: '授权加载失败', en: 'Failed to load authorizations' }));
      setAuthorizations([]);
    } finally {
      setAuthorizationsLoading(false);
    }
  }, [showError, t]);

  const loadWallets = useCallback(async () => {
    try {
      setWalletsLoading(true);
      const data = await walletApi.list();
      setWallets(data || []);
    } catch (err: any) {
      showError(err?.message || t({ zh: '钱包加载失败', en: 'Failed to load wallets' }));
      setWallets([]);
    } finally {
      setWalletsLoading(false);
    }
  }, [showError, t]);

  // 加载订单
  useEffect(() => {
    if (activeMainTab !== 'shopping') return;
    loadOrders();
  }, [activeMainTab, loadOrders]);

  // 加载订阅
  useEffect(() => {
    if (activeMainTab !== 'payments') return;
    loadSubscriptions();
  }, [activeMainTab, loadSubscriptions]);

  // 加载 Agent 市场
  useEffect(() => {
    if (activeMainTab !== 'agents' || activeSubTab !== 'discover') return;
    loadMarketplaceAgents();
  }, [activeMainTab, activeSubTab, loadMarketplaceAgents]);

  // 加载支付历史
  useEffect(() => {
    const load = async () => {
      if (activeMainTab !== 'payments') return;
      try {
        setPaymentsLoading(true);
        const res = await paymentHistoryApi.getHistory({ page: 1, limit: 10 });
        setPayments(res?.items || []);
      } catch (err: any) {
        showError(err?.message || t({ zh: '支付历史加载失败', en: 'Failed to load payments' }));
        setPayments([]);
      } finally {
        setPaymentsLoading(false);
      }
    };
    load();
  }, [activeMainTab, showError, t]);

  // 加载授权会话
  useEffect(() => {
    if (activeMainTab !== 'security') return;
    loadAuthorizations();
  }, [activeMainTab, loadAuthorizations]);

  // 加载钱包
  useEffect(() => {
    const load = async () => {
      if (activeMainTab !== 'assets') return;
      try {
        setWalletsLoading(true);
        const data = await walletApi.list();
        setWallets(data || []);
      } catch (err: any) {
        showError(err?.message || t({ zh: '钱包加载失败', en: 'Failed to load wallets' }));
        setWallets([]);
      } finally {
        setWalletsLoading(false);
      }
    };
    load();
  }, [activeMainTab, showError, t]);

  // 加载用户档案（KYC/资料）
  useEffect(() => {
    const load = async () => {
      const isDashboard = activeMainTab === 'dashboard';
      const isProfile = activeMainTab === 'profile' || activeMainTab === 'kyc';
      const isKycInAssets = activeMainTab === 'assets' && activeSubTab === 'kyc';
      
      if (!isDashboard && !isProfile && !isKycInAssets) return;
      
      try {
        setProfileLoading(true);
        const data = await userApi.getProfile();
        setProfile(data);
      } catch (err: any) {
        showError(err?.message || t({ zh: '用户信息加载失败', en: 'Failed to load profile' }));
        setProfile(null);
      } finally {
        setProfileLoading(false);
      }
    };
    load();
  }, [activeMainTab, activeSubTab, showError, t]);

  // 加载市场数据
  useEffect(() => {
    if (activeMainTab === 'shopping' && activeSubTab === 'browse') {
      loadMarketplace();
    }
  }, [activeMainTab, activeSubTab, loadMarketplace]);

  const handleCreateAgent = () => {
    router.push('/agent-builder');
  };

  const renderContent = () => {
    const key = `${activeMainTab}-${activeSubTab}`;
    // Aliases for earn and shop to maintain compatibility with L1 nav
    let effectiveKey = key;
    if (key.startsWith('earn-')) effectiveKey = key.replace('earn-', 'autoEarn-');
    if (key.startsWith('shop-')) effectiveKey = key.replace('shop-', 'shopping-');

    switch (effectiveKey) {
      case 'dashboard-overview':
        return (
          <div className="p-6 space-y-8">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-2xl font-bold text-white">{t({ zh: '欢迎回来', en: 'Welcome Back' })}, {user?.nickname || 'User'}</h2>
                <p className="text-slate-400 text-sm mt-1">{t({ zh: '管理您的 AI 资产、订单与安全策略', en: 'Manage your AI assets, orders and security policies' })}</p>
              </div>
              <div className="flex items-center gap-3">
                <div className="text-right hidden md:block border-r border-white/10 pr-3">
                  <p className="text-xs text-slate-500 uppercase font-bold tracking-widest">KYC Status</p>
                  <button 
                    onClick={() => setActiveMainTab('kyc')}
                    className={`text-sm font-bold ${profile?.kycLevel === 'verified' ? 'text-emerald-400' : 'text-amber-400'}`}
                  >
                    {profile?.kycLevel === 'verified' ? 'Verified' : 'Unverified'}
                  </button>
                </div>
                <div className="text-right hidden md:block">
                  <p className="text-xs text-slate-500 uppercase font-bold tracking-widest">Wallet Status</p>
                  <p className="text-sm font-mono text-emerald-400">{user?.walletAddress ? `${user.walletAddress.slice(0, 6)}...${user.walletAddress.slice(-4)}` : 'Not Connected'}</p>
                </div>
                <div className="w-12 h-12 rounded-full bg-blue-600/20 border border-blue-500/20 flex items-center justify-center text-blue-400">
                  <User size={24} />
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-slate-800/50 border border-white/5 p-6 rounded-2xl hover:bg-slate-800 transition-colors group">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center text-blue-400 group-hover:scale-110 transition-transform">
                    <Bot size={20} />
                  </div>
                  <h3 className="font-semibold text-slate-200">{t({ zh: '我的Agents', en: 'My Agents' })}</h3>
                </div>
                <p className="text-3xl font-bold text-white">3</p>
                <div className="flex items-center gap-2 mt-2">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                  <p className="text-xs text-slate-400">{t({ zh: '活跃中', en: 'Active' })}</p>
                </div>
              </div>
              <div className="bg-slate-800/50 border border-white/5 p-6 rounded-2xl hover:bg-slate-800 transition-colors group">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 rounded-xl bg-yellow-500/10 flex items-center justify-center text-yellow-400 group-hover:scale-110 transition-transform">
                    <Zap size={20} />
                  </div>
                  <h3 className="font-semibold text-slate-200">{t({ zh: 'Auto-Earn收益', en: 'Earnings' })}</h3>
                </div>
                <p className="text-3xl font-bold text-white">+420 USDC</p>
                <div className="flex items-center gap-1 mt-2 text-emerald-400 text-xs font-bold">
                  <TrendingUp size={12} />
                  +12.5% {t({ zh: '本周', en: 'This Week' })}
                </div>
              </div>
              <div className="bg-slate-800/50 border border-white/5 p-6 rounded-2xl hover:bg-slate-800 transition-colors group">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 rounded-xl bg-purple-500/10 flex items-center justify-center text-purple-400 group-hover:scale-110 transition-transform">
                    <ShieldCheck size={20} />
                  </div>
                  <h3 className="font-semibold text-slate-200">{t({ zh: 'X402授权使用', en: 'X402 Auth Usage' })}</h3>
                </div>
                <div className="flex items-baseline gap-2">
                  <p className="text-3xl font-bold text-white">45.20</p>
                  <p className="text-sm text-slate-500 font-mono">/ 200 USD</p>
                </div>
                <UsageWaveform progress={23} />
                <p className="text-[10px] text-slate-500 mt-2 uppercase tracking-widest">{t({ zh: '今日已消耗额度 (实时数据)', en: 'DALIY QUOTA CONSUMED (REAL-TIME)' })}</p>
              </div>
            </div>

            {/* Onboarding Checklist */}
            <div className="space-y-6">
              <div className="bg-blue-600/10 border border-blue-500/20 rounded-2xl p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-xl font-bold text-blue-400 mb-2">User Onboarding Checklist</h3>
                    <p className="text-sm text-slate-400">完成以下步骤即可开启 AI 自动赚钱与智能支付之旅</p>
                  </div>
                  <div className="text-right">
                    <span className="text-3xl font-bold text-blue-400">60%</span>
                    <p className="text-[10px] text-slate-500 uppercase font-bold tracking-widest">Completion</p>
                  </div>
                </div>
                <div className="w-full bg-slate-800 h-2 rounded-full mt-4 overflow-hidden">
                  <div className="bg-blue-500 h-full w-[60%] transition-all"></div>
                </div>
              </div>

              <div className="grid gap-4">
                {[
                  { title: '管理钱包 & 资金账户', desc: '连接钱包并查看您的独立资金余额', status: 'completed', tab: 'unified-account', sub: 'balances' },
                  { title: '开启 Agent 账户', desc: '授权 Agent 独立预算，保障资金安全', status: 'completed', tab: 'agent-accounts', sub: 'my-agents' },
                  { title: '配置支付策略', desc: '设置 X402 单笔限额与自动支付规则', status: 'completed', tab: 'security', sub: 'policies' },
                  { title: '完成实名 KYC', desc: '提升支付限额，解锁更高额度的智能助手', status: 'pending', tab: 'kyc', sub: 'upgrade' },
                  { title: '开启专业用户之旅', desc: '发布您的 API、数据或技能，开始获得收入', status: 'pending', tab: 'dashboard', sub: 'overview' }
                ].map((step, i) => (
                  <div key={i} className="bg-white/5 border border-white/10 rounded-xl p-5 flex items-center justify-between hover:bg-white/10 transition-all">
                    <div className="flex items-center gap-4">
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm ${
                        step.status === 'completed' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-slate-800 text-slate-500'
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
                        setActiveMainTab(step.tab as any)
                        setActiveSubTab(step.sub)
                      }}
                      className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${
                        step.status === 'completed' ? 'bg-slate-800 text-slate-500' : 'bg-blue-600 text-white hover:bg-blue-700'
                      }`}
                    >
                      {step.status === 'completed' ? '重新查看' : '立即处理'}
                    </button>
                  </div>
                ))}
              </div>
            </div>

            {/* Recent Activity / Insights */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="bg-slate-900/50 border border-white/5 rounded-2xl p-6">
                <h3 className="font-bold text-white mb-4 flex items-center gap-2">
                  <Activity size={18} className="text-blue-400" />
                  {t({ zh: '最近活动', en: 'Recent Activity' })}
                </h3>
                <div className="space-y-4">
                  {[1, 2, 3].map((_, i) => (
                    <div key={i} className="flex items-center justify-between py-2 border-b border-white/5 last:border-0">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center">
                          <ShoppingBag size={14} className="text-slate-400" />
                        </div>
                        <div>
                          <p className="text-sm font-medium text-slate-200">Purchase: AI Assistant</p>
                          <p className="text-[10px] text-slate-500">2 hours ago</p>
                        </div>
                      </div>
                      <p className="text-sm font-bold text-white">-$12.00</p>
                    </div>
                  ))}
                </div>
              </div>
              <div className="bg-slate-900/50 border border-white/5 rounded-2xl p-6">
                <h3 className="font-bold text-white mb-4 flex items-center gap-2">
                  <Sparkles size={18} className="text-purple-400" />
                  {t({ zh: 'Agent 洞察', en: 'Agent Insights' })}
                </h3>
                <AgentInsightsPanel />
              </div>
            </div>
          </div>
        );
      
      case 'agents-my-agents':
        return <MyAgentsPanel 
          compact={false} 
          onTabChange={(main, sub) => {
            setActiveMainTab(main);
            if (sub) setActiveSubTab(sub);
          }} 
        />;
      
      case 'agents-discover':
        return (
          <div className="p-6 space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-xl font-bold text-white">{t({ zh: 'Agent 市场', en: 'Agent Marketplace' })}</h2>
                <p className="text-slate-400 text-sm mt-1">{t({ zh: '探索并订阅全球顶尖的 AI Agents', en: 'Explore and subscribe to top AI Agents worldwide' })}</p>
              </div>
              <div className="flex items-center gap-2">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={16} />
                  <input 
                    type="text" 
                    placeholder={t({ zh: '搜索 Agent...', en: 'Search agents...' })}
                    className="bg-slate-900 border border-white/10 rounded-lg pl-10 pr-4 py-2 text-sm text-white focus:border-blue-500 outline-none w-64"
                  />
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {agentsLoading ? (
                <div className="col-span-3 flex items-center justify-center py-20">
                  <RefreshCw className="w-8 h-8 text-blue-500 animate-spin" />
                </div>
              ) : marketplaceAgents.length > 0 ? (
                marketplaceAgents.map((agent, i) => {
                  const colors = ['bg-blue-500', 'bg-purple-500', 'bg-emerald-500', 'bg-amber-500', 'bg-rose-500', 'bg-indigo-500'];
                  const color = colors[i % colors.length];
                  return (
                    <div key={agent.agentId} className="bg-slate-900/50 border border-white/5 rounded-2xl p-6 hover:bg-slate-800 transition-all group">
                      <div className={`w-12 h-12 rounded-xl ${color}/20 flex items-center justify-center text-white mb-4 group-hover:scale-110 transition-transform`}>
                        <Bot size={24} />
                      </div>
                      <h3 className="font-bold text-white mb-2">{agent.agentName}</h3>
                      <p className="text-sm text-slate-300 mb-6 line-clamp-2">{t({ zh: 'AI 智能助手', en: 'AI Smart Assistant' })}</p>
                      <div className="flex items-center justify-between pt-4 border-t border-white/5">
                        <div className="flex items-center gap-3">
                          <div className="flex items-center gap-1 text-xs text-slate-300">
                            <Users size={12} className="text-blue-400" />
                            {agent.stats?.totalUsers?.toLocaleString() || '0'}
                          </div>
                          <div className="flex items-center gap-1 text-xs text-yellow-400">
                            <Sparkles size={12} />
                            {agent.stats?.avgRating?.toFixed(1) || '0.0'}
                          </div>
                        </div>
                        <p className="text-sm font-bold text-white tracking-wide">
                          {agent.stats?.totalRevenue ? `$${agent.stats.totalRevenue.toFixed(0)}/mo` : 'Free'}
                        </p>
                      </div>
                      <button 
                        onClick={() => handleSubscribe(agent.agentId)}
                        disabled={isBuying}
                        className="w-full mt-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-bold transition-all shadow-lg shadow-blue-600/20 active:scale-95 disabled:opacity-50"
                      >
                        {isBuying ? t({ zh: '正在订阅...', en: 'Subscribing...' }) : t({ zh: '立即订阅', en: 'Subscribe Now' })}
                      </button>
                    </div>
                  );
                })
              ) : (
                <div className="col-span-3 text-center py-20 bg-slate-900/50 rounded-2xl border border-white/5">
                  <Bot className="w-12 h-12 text-slate-700 mx-auto mb-4" />
                  <p className="text-slate-400">{t({ zh: '暂无可用 Agent，请稍后再试', en: 'No agents available, please try again later' })}</p>
                  <button 
                    onClick={loadMarketplaceAgents}
                    className="mt-4 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm"
                  >
                    {t({ zh: '刷新', en: 'Refresh' })}
                  </button>
                </div>
              )}
            </div>
          </div>
        );

      case 'agents-presence':
        return <AgentPresenceDashboard onNavigate={(section, data) => {
          if (data?.l1) setActiveMainTab(data.l1);
          if (data?.l2) setActiveSubTab(data.l2);
        }} />;

      case 'agents-devices':
        return <CrossDevicePanel onNavigate={(section, data) => {
          if (data?.l1) setActiveMainTab(data.l1);
          if (data?.l2) setActiveSubTab(data.l2);
        }} />;

      case 'agents-authorizations':
        return (
          <div className="p-6 space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-xl font-bold text-white">{t({ zh: '授权管理', en: 'Agent Authorizations' })}</h2>
                <p className="text-sm text-slate-400 mt-1">{t({ zh: '管理您对 Agent 的支付与数据授权', en: 'Manage your payment and data authorizations for agents' })}</p>
              </div>
              <button 
                onClick={loadAuthorizations}
                className="p-2 hover:bg-white/5 rounded-lg text-slate-400 transition-colors"
              >
                <RefreshCw size={18} className={authorizationsLoading ? 'animate-spin' : ''} />
              </button>
            </div>

            <div className="grid gap-4">
              {authorizationsLoading ? (
                <div className="flex items-center justify-center py-20">
                  <RefreshCw className="w-8 h-8 text-blue-500 animate-spin" />
                </div>
              ) : authorizations.length === 0 ? (
                <div className="text-center py-20 bg-slate-900/50 rounded-2xl border border-white/5">
                  <Shield className="w-12 h-12 text-slate-700 mx-auto mb-4" />
                  <p className="text-slate-400">{t({ zh: '暂无活跃授权', en: 'No active authorizations' })}</p>
                </div>
              ) : (
                authorizations.map(auth => (
                  <div key={auth.id} className="bg-slate-900/50 border border-white/5 rounded-2xl p-6 flex items-center justify-between group hover:bg-slate-800 transition-colors">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 rounded-xl bg-purple-500/10 flex items-center justify-center text-purple-400">
                        <Shield size={24} />
                      </div>
                      <div>
                        <p className="font-bold text-white">{auth.agentName || 'Unknown Agent'}</p>
                        <div className="flex items-center gap-3 mt-1">
                          <p className="text-xs text-slate-500 flex items-center gap-1">
                            <Clock size={12} />
                            {new Date(auth.createdAt).toLocaleDateString()}
                          </p>
                          <span className="w-1 h-1 rounded-full bg-slate-700" />
                          <p className="text-xs text-slate-500 flex items-center gap-1">
                            <Lock size={12} />
                            {auth.isActive ? t({ zh: '生效中', en: 'Active' }) : t({ zh: '已停用', en: 'Inactive' })}
                          </p>
                        </div>
                      </div>
                    </div>
                    <button 
                      onClick={() => handleRevokeSession(auth.id)}
                      className="px-4 py-2 bg-red-500/10 hover:bg-red-500/20 text-red-400 rounded-xl text-xs font-bold transition-colors"
                    >
                      {t({ zh: '撤销授权', en: 'Revoke' })}
                    </button>
                  </div>
                ))
              )}
            </div>

            <div className="mt-8">
              <SessionManager />
            </div>
          </div>
        );
      
      // skills 管理已移至开发者工作台，普通用户不再需要此入口
      // case 'skills-my-skills':
      // case 'skills-marketplace':
      
      case 'autoEarn-tasks':
        return (
          <div className="p-6">
            <AutoEarnPanel />
          </div>
        );
      
      case 'autoEarn-airdrops':
        return (
          <div className="p-6">
            <AirdropDiscovery />
          </div>
        );
      
      case 'shopping-orders':
        return (
          <div className="p-6 space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-xl font-bold text-white">{t({ zh: '订单跟踪', en: 'Order Tracking' })}</h2>
                <p className="text-slate-400 text-sm mt-1">{t({ zh: '管理您的 AI 购物订单与物流状态', en: 'Manage your AI shopping orders and logistics' })}</p>
              </div>
              <button 
                onClick={loadOrders}
                className="p-2 hover:bg-white/5 rounded-lg text-slate-400 transition-colors"
              >
                <RefreshCw size={18} className={ordersLoading ? 'animate-spin' : ''} />
              </button>
            </div>
            {ordersLoading ? (
              <div className="flex items-center justify-center py-20">
                <RefreshCw className="w-8 h-8 text-blue-500 animate-spin" />
              </div>
            ) : orders.length === 0 ? (
              <div className="text-center py-20 bg-slate-900/50 rounded-2xl border border-white/5">
                <ShoppingBag className="w-12 h-12 text-slate-700 mx-auto mb-4" />
                <p className="text-slate-400">{t({ zh: '暂无订单', en: 'No orders found' })}</p>
              </div>
            ) : (
              <div className="grid gap-4">
                {orders.map(order => (
                  <div key={order.id} className="bg-slate-900/50 border border-white/5 rounded-2xl p-6 flex items-center justify-between group hover:bg-slate-800 transition-colors">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 rounded-xl bg-blue-500/10 flex items-center justify-center text-blue-400">
                        <Package size={24} />
                      </div>
                      <div>
                        <p className="font-bold text-white">{order.metadata?.title || `Order #${order.id.slice(0, 8)}`}</p>
                        <div className="flex items-center gap-3 mt-1">
                          <p className="text-xs text-slate-500">{new Date(order.createdAt).toLocaleString()}</p>
                          <span className="w-1 h-1 rounded-full bg-slate-700" />
                          <p className="text-xs text-slate-500">{order.paymentMethod || 'X402'}</p>
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="font-bold text-white">{order.amount} {order.currency}</p>
                      <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full mt-1 inline-block ${
                        order.status === 'completed' || order.status === 'paid' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-yellow-500/20 text-yellow-400'
                      }`}>
                        {order.status}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        );

      case 'shopping-browse':
        return (
          <div className="p-6 space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-xl font-bold text-white">{t({ zh: '智能购物', en: 'Smart Shopping' })}</h2>
                <p className="text-slate-400 text-sm mt-1">{t({ zh: 'AI 驱动的全球商品发现与无感支付', en: 'AI-driven global product discovery and seamless payments' })}</p>
              </div>
              <div className="flex items-center gap-3">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={16} />
                  <input 
                    type="text" 
                    placeholder={t({ zh: '搜索商品...', en: 'Search products...' })}
                    className="bg-slate-900 border border-white/10 rounded-lg pl-10 pr-4 py-2 text-sm text-white focus:border-blue-500 outline-none w-64"
                  />
                </div>
                <button className="p-2 bg-slate-900 border border-white/10 rounded-lg text-slate-400 hover:text-white transition-colors">
                  <Filter size={18} />
                </button>
              </div>
            </div>

            {marketplaceLoading ? (
              <div className="flex items-center justify-center py-20">
                <RefreshCw className="w-8 h-8 text-blue-500 animate-spin" />
              </div>
            ) : (marketplaceSkills.length === 0 && marketplaceProducts.length === 0) ? (
              <div className="text-center py-20 bg-slate-900/50 rounded-2xl border border-white/5">
                <ShoppingBag className="w-12 h-12 text-slate-700 mx-auto mb-4" />
                <p className="text-slate-400">{t({ zh: '暂无商品', en: 'No products found' })}</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                {/* V2: Unified Skills */}
                {marketplaceSkills.map((skill) => (
                  <SkillCard 
                    key={skill.id} 
                    skill={skill as any} 
                    onAction={() => handleBuyProduct({
                      id: skill.productId || skill.id,
                      name: skill.displayName || skill.name,
                      price: skill.pricing?.pricePerCall || 0,
                      merchantId: skill.authorInfo?.id || 'system',
                      metadata: skill.metadata,
                      category: skill.category,
                      description: skill.description
                    } as any)}
                  />
                ))}

                {/* V1: Legacy Products (Only those not yet SKUed as Skills) */}
                {marketplaceProducts
                  .filter(p => !marketplaceSkills.some(s => s.productId === p.id))
                  .map((product) => (
                  <div key={product.id} className="bg-slate-900/50 border border-white/5 rounded-2xl overflow-hidden hover:bg-slate-800 transition-all group">
                    <div className="aspect-square bg-slate-800 relative overflow-hidden">
                      {product.metadata?.image || (product as any).imageUrl ? (
                        <img src={product.metadata?.image || (product as any).imageUrl} alt={product.name} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-slate-700">
                          <Package size={48} />
                        </div>
                      )}
                      <div className="absolute top-3 right-3">
                        <button className="p-2 bg-black/50 backdrop-blur-md rounded-full text-white hover:bg-blue-600 transition-colors">
                          <Plus size={16} />
                        </button>
                      </div>
                    </div>
                    <div className="p-4">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-[10px] font-bold text-blue-400 uppercase tracking-widest">{product.category}</span>
                        <div className="flex items-center gap-1 text-xs text-yellow-500">
                          <Sparkles size={10} />
                          4.8
                        </div>
                      </div>
                      <h3 className="font-bold text-white mb-2 truncate">{product.name}</h3>
                      <p className="text-xs text-slate-300 line-clamp-2 min-h-[32px]">{product.description || 'No description available'}</p>
                      <div className="flex items-center justify-between mt-4">
                        <p className="text-lg font-bold text-white">
                          {product.metadata?.currency === 'CNY' ? '¥' : product.metadata?.currency === 'EUR' ? '€' : '$'}
                          {typeof product.price === 'number' ? product.price.toFixed(2) : product.price}
                          {product.metadata?.currency && product.metadata?.currency !== 'USD' && product.metadata?.currency !== 'CNY' && product.metadata?.currency !== 'EUR' && (
                            <span className="text-xs text-slate-400 ml-1">{product.metadata?.currency}</span>
                          )}
                        </p>
                        <button 
                          onClick={() => handleBuyProduct(product)}
                          disabled={isBuying}
                          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition-all disabled:opacity-50 shadow-lg shadow-blue-600/20"
                        >
                          {isBuying ? t({ zh: '处理中...', en: 'Processing...' }) : t({ zh: '立即购买', en: 'Buy Now' })}
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        );

      case 'shopping-cart':
        return (
          <div className="p-6 space-y-6">
            <h2 className="text-xl font-bold text-white">{t({ zh: '购物车', en: 'Shopping Cart' })}</h2>
            <div className="bg-slate-900/50 border border-white/5 rounded-2xl p-12 text-center">
              <ShoppingBag className="w-16 h-16 text-slate-700 mx-auto mb-4 opacity-20" />
              <p className="text-slate-400 mb-6">{t({ zh: '您的购物车是空的', en: 'Your cart is empty' })}</p>
              <button 
                onClick={() => setActiveSubTab('browse')}
                className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl transition-colors"
              >
                {t({ zh: '去购物', en: 'Go Shopping' })}
              </button>
            </div>
          </div>
        );

      case 'shopping-wishlist':
        return (
          <div className="p-6 space-y-6">
            <h2 className="text-xl font-bold text-white">{t({ zh: '心愿单', en: 'Wishlist' })}</h2>
            <div className="bg-slate-900/50 border border-white/5 rounded-2xl p-12 text-center">
              <Sparkles className="w-16 h-16 text-slate-700 mx-auto mb-4 opacity-20" />
              <p className="text-slate-400">{t({ zh: '暂无收藏商品', en: 'No items in wishlist' })}</p>
            </div>
          </div>
        );

      case 'shopping-promotions':
      case 'promotion-overview':
      case 'promotion-my-links':
      case 'promotion-materials':
        return (
          <div className="p-6">
            <PromotionPanel />
          </div>
        );
      
      case 'assets-wallets':
        return (
          <div className="p-6 space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-xl font-bold text-white">{t({ zh: '钱包管理', en: 'Wallet Management' })}</h2>
                <p className="text-slate-400 text-sm mt-1">{t({ zh: '多链钱包、MPC 钱包与授权状态', en: 'Multi-chain wallets, MPC wallets and authorizations' })}</p>
              </div>
              <div className="flex items-center gap-2">
                <button 
                  onClick={loadWallets}
                  className="p-2 hover:bg-white/5 rounded-lg text-slate-400 transition-colors"
                >
                  <RefreshCw size={18} className={walletsLoading ? 'animate-spin' : ''} />
                </button>
                <button 
                  onClick={() => setShowWalletModal(true)}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-bold transition-colors flex items-center gap-2"
                >
                  <Plus size={18} />
                  {t({ zh: '连接钱包', en: 'Connect Wallet' })}
                </button>
              </div>
            </div>

            {/* MPC 钱包区域 */}
            <div className="bg-gradient-to-br from-purple-900/30 to-indigo-900/30 border border-purple-500/20 rounded-2xl p-6">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-xl bg-purple-500/20 flex items-center justify-center">
                  <Shield size={20} className="text-purple-400" />
                </div>
                <div>
                  <h3 className="font-bold text-white">{t({ zh: 'MPC 安全钱包', en: 'MPC Secure Wallet' })}</h3>
                  <p className="text-xs text-slate-400">{t({ zh: '无需助记词，支持 AI Agent 自动支付', en: 'No mnemonic required, supports AI Agent auto-payment' })}</p>
                </div>
              </div>
              <MPCWalletCard compact />
            </div>
            
            {/* 已连接钱包列表 */}
            <div>
              <h3 className="text-sm font-bold text-slate-500 uppercase tracking-widest mb-4">{t({ zh: '已连接钱包', en: 'Connected Wallets' })}</h3>
              <div className="grid gap-4">
                {walletsLoading ? (
                  <div className="flex items-center justify-center py-12">
                    <RefreshCw className="w-8 h-8 text-blue-500 animate-spin" />
                  </div>
                ) : wallets.length === 0 ? (
                  <div className="text-center py-12 bg-slate-900/50 rounded-2xl border border-white/5 border-dashed">
                    <Wallet className="w-10 h-10 text-slate-700 mx-auto mb-3" />
                    <p className="text-slate-400 text-sm">{t({ zh: '暂无连接的外部钱包', en: 'No external wallets connected' })}</p>
                  </div>
                ) : (
                  wallets.map(wallet => (
                    <div key={wallet.id} className="bg-slate-900/50 border border-white/5 rounded-2xl p-5 flex items-center justify-between group hover:bg-slate-800 transition-colors">
                      <div className="flex items-center gap-4">
                        <div className="w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center text-blue-400">
                          <Wallet size={20} />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <p className="font-bold text-white text-sm">{wallet.chain || wallet.walletType?.toUpperCase()}</p>
                            {wallet.isDefault && (
                              <span className="px-2 py-0.5 bg-blue-500/20 text-blue-400 text-[10px] font-bold rounded-full uppercase">Default</span>
                            )}
                          </div>
                          <p className="text-xs font-mono text-slate-500 mt-1">{wallet.walletAddress}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button 
                          onClick={() => handleCopy(wallet.walletAddress, wallet.id)}
                          className="p-2 hover:bg-white/5 rounded-lg text-slate-400 transition-colors"
                        >
                          {copiedId === wallet.id ? <Check size={16} className="text-emerald-500" /> : <Copy size={16} />}
                        </button>
                        <button 
                          onClick={() => handleUnbindWallet(wallet.id)}
                          className="p-2 hover:bg-red-500/10 rounded-lg text-slate-400 hover:text-red-400 transition-colors"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        );

      case 'assets-balances':
        return (
          <div className="p-6 space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-xl font-bold text-white">{t({ zh: '资产余额', en: 'Asset Balances' })}</h2>
                <p className="text-slate-400 text-sm mt-1">{t({ zh: '查看您在各链上的资产分布', en: 'View your asset distribution across chains' })}</p>
              </div>
              <button className="p-2 hover:bg-white/5 rounded-lg text-slate-400 transition-colors">
                <RefreshCw size={18} />
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="bg-slate-900/50 border border-white/5 rounded-2xl p-6">
                <h3 className="text-sm font-bold text-slate-500 uppercase tracking-widest mb-6">Portfolio Distribution</h3>
                <div className="space-y-4">
                  {[
                    { name: 'USDC', chain: 'Solana', amount: '1,240.50', value: '$1,240.50', color: 'bg-blue-500' },
                    { name: 'SOL', chain: 'Solana', amount: '12.45', value: '$1,842.10', color: 'bg-purple-500' },
                    { name: 'ETH', chain: 'Ethereum', amount: '0.85', value: '$2,140.20', color: 'bg-indigo-500' },
                    { name: 'USDT', chain: 'BSC', amount: '450.00', value: '$450.00', color: 'bg-emerald-500' },
                  ].map((asset, i) => (
                    <div key={i} className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className={`w-2 h-2 rounded-full ${asset.color}`} />
                        <div>
                          <p className="text-sm font-bold text-white">{asset.name}</p>
                          <p className="text-[10px] text-slate-500">{asset.chain}</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-bold text-white">{asset.amount}</p>
                        <p className="text-[10px] text-slate-500">{asset.value}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="bg-slate-900/50 border border-white/5 rounded-2xl p-6 flex flex-col justify-center items-center text-center">
                <div className="w-32 h-32 rounded-full border-8 border-blue-500/20 border-t-blue-500 flex items-center justify-center mb-4">
                  <div>
                    <p className="text-[10px] text-slate-500 uppercase font-bold">Total Value</p>
                    <p className="text-xl font-bold text-white">$5,672</p>
                  </div>
                </div>
                <p className="text-xs text-slate-400 max-w-[200px]">
                  Your assets are distributed across 4 chains and 6 different tokens.
                </p>
              </div>
            </div>
          </div>
        );
      
      case 'security-sessions':
        return (
          <div className="p-6 space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-xl font-bold text-white">{t({ zh: '授权会话', en: 'Authorized Sessions' })}</h2>
                <p className="text-sm text-slate-400 mt-1">{t({ zh: '管理 Agent 的实时授权会话', en: 'Manage active agent authorization sessions' })}</p>
              </div>
              <button 
                onClick={loadAuthorizations}
                className="p-2 hover:bg-white/5 rounded-lg text-slate-400 transition-colors"
              >
                <RefreshCw size={18} className={authorizationsLoading ? 'animate-spin' : ''} />
              </button>
            </div>

            <div className="grid gap-4">
              {authorizationsLoading ? (
                <div className="flex items-center justify-center py-20">
                  <RefreshCw className="w-8 h-8 text-blue-500 animate-spin" />
                </div>
              ) : authorizations.length === 0 ? (
                <div className="text-center py-20 bg-slate-900/50 rounded-2xl border border-white/5">
                  <Shield className="w-12 h-12 text-slate-700 mx-auto mb-4" />
                  <p className="text-slate-400">{t({ zh: '暂无活跃会话', en: 'No active sessions' })}</p>
                </div>
              ) : (
                authorizations.map(auth => (
                  <div key={auth.id} className="bg-slate-900/50 border border-white/5 rounded-2xl p-6 flex items-center justify-between group hover:bg-slate-800 transition-colors">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 rounded-xl bg-purple-500/10 flex items-center justify-center text-purple-400">
                        <Shield size={24} />
                      </div>
                      <div>
                        <p className="font-bold text-white">{auth.agentName || 'Unknown Agent'}</p>
                        <div className="flex items-center gap-3 mt-1">
                          <p className="text-xs text-slate-500 flex items-center gap-1">
                            <Clock size={12} />
                            {new Date(auth.createdAt).toLocaleDateString()}
                          </p>
                          <span className="w-1 h-1 rounded-full bg-slate-700" />
                          <p className="text-xs text-slate-500 flex items-center gap-1">
                            <Lock size={12} />
                            {auth.isActive ? t({ zh: '生效中', en: 'Active' }) : t({ zh: '已停用', en: 'Inactive' })}
                          </p>
                        </div>
                      </div>
                    </div>
                    <button 
                      onClick={() => handleRevokeSession(auth.id)}
                      className="px-4 py-2 bg-red-500/10 hover:bg-red-500/20 text-red-400 rounded-xl text-xs font-bold transition-colors"
                    >
                      {t({ zh: '撤销授权', en: 'Revoke' })}
                    </button>
                  </div>
                ))
              )}
            </div>

            <div className="mt-8">
              <SessionManager />
            </div>
          </div>
        );

      case 'security-policies':
        return (
          <div className="p-6">
            <PolicyEngine />
          </div>
        );

      // New Account System Panels - 统一资金账户
      case 'unified-account-balances':
      case 'unified-account-transactions':
      case 'unified-account-deposit':
      case 'unified-account-withdraw':
      case 'unified-account-payout-settings':
        return (
          <div className="p-6">
            <AccountProvider>
              <UnifiedAccountPanel 
                showPendingEarnings={true} 
                onCreateAccount={() => setShowOnboarding(true)}
                activeView={
                  activeSubTab === 'transactions' ? 'transactions' :
                  activeSubTab === 'deposit' ? 'deposit' :
                  activeSubTab === 'withdraw' ? 'withdraw' : 
                  activeSubTab === 'payout-settings' ? 'payout-settings' : 'balances'
                }
              />
            </AccountProvider>
          </div>
        );

      // Agent 账户管理
      case 'agent-accounts-my-agents':
      case 'agent-accounts-authorizations':
      case 'agent-accounts-auto-pay':
        return (
          <div className="p-6">
            <AgentAccountProvider>
              <AgentAccountPanel 
                onCreateAgent={handleCreateAgent}
                activeView={
                  activeSubTab === 'agent-accounts-authorizations' ? 'authorizations' :
                  activeSubTab === 'agent-accounts-auto-pay' ? 'autopay' : 'agents'
                }
              />
            </AgentAccountProvider>
          </div>
        );

      // KYC 认证中心
      case 'kyc-status':
      case 'kyc-upgrade':
      case 'kyc-documents':
        return (
          <div className="p-6">
            <KYCProvider>
              <KYCCenterPanel />
            </KYCProvider>
          </div>
        );

      case 'profile-info':
        return (
          <div className="p-6 max-w-2xl">
            <h2 className="text-xl font-bold text-white mb-6">{t({ zh: '基本信息', en: 'Basic Information' })}</h2>
            <div className="space-y-6 bg-slate-900/50 border border-white/5 rounded-2xl p-8">
              <div className="flex items-center gap-6 mb-8">
                <div className="w-20 h-20 rounded-full bg-blue-600/20 border-2 border-blue-500/20 flex items-center justify-center text-blue-400 text-3xl font-bold">
                  {user?.nickname?.[0]?.toUpperCase() || 'U'}
                </div>
                <div>
                  <h3 className="text-lg font-bold text-white">{user?.nickname || 'User'}</h3>
                  <p className="text-sm text-slate-500">{user?.email || 'No email provided'}</p>
                </div>
              </div>

              <div className="grid gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">Nickname</label>
                  <input 
                    type="text" 
                    defaultValue={user?.nickname || ''}
                    className="w-full bg-slate-800 border border-white/10 rounded-xl px-4 py-3 text-white focus:border-blue-500 outline-none transition-colors"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">Email</label>
                  <input 
                    type="email" 
                    defaultValue={user?.email || ''}
                    className="w-full bg-slate-800 border border-white/10 rounded-xl px-4 py-3 text-white focus:border-blue-500 outline-none transition-colors"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">Bio</label>
                  <textarea 
                    defaultValue={user?.bio || ''}
                    rows={3}
                    className="w-full bg-slate-800 border border-white/10 rounded-xl px-4 py-3 text-white focus:border-blue-500 outline-none transition-colors resize-none"
                  />
                </div>
              </div>

              <div className="pt-4">
                <button className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 rounded-xl transition-colors">
                  {t({ zh: '保存更改', en: 'Save Changes' })}
                </button>
              </div>
            </div>
          </div>
        );
      
      case 'assets-kyc':
        return (
          <div className="p-6 space-y-4">
            <h2 className="text-xl font-bold">{t({ zh: 'KYC 认证', en: 'KYC Verification' })}</h2>
            {profileLoading ? (
              <p className="text-slate-400">{t({ zh: '加载中...', en: 'Loading...' })}</p>
            ) : (
              <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 text-center">
                <div className="text-4xl mb-4">
                  {profile?.kycLevel === 'verified' ? '✅' : '⏳'}
                </div>
                <h3 className="text-lg font-semibold text-white mb-2">
                  {profile?.kycLevel === 'verified'
                    ? t({ zh: 'KYC认证已完成', en: 'Verification Completed' })
                    : t({ zh: 'KYC认证未完成', en: 'Verification Not Completed' })}
                </h3>
                
                {profile?.kycLevel !== 'verified' ? (
                  <div className="mt-6 space-y-4">
                    <p className="text-slate-400 text-sm max-w-md mx-auto">
                      {t({ 
                        zh: '为了保障您的账户安全并提高交易限额，请完成身份认证。认证过程通常需要 2-5 分钟。', 
                        en: 'Please complete identity verification to secure your account and increase limits. It usually takes 2-5 minutes.' 
                      })}
                    </p>
                    <button 
                      onClick={() => {
                        // In future: integrate with Sumsub or other KYC provider
                        window.open('https://verify.agentrix.com', '_blank');
                        success(t({ zh: '已开启认证窗口', en: 'Verification window opened' }));
                      }}
                      className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold transition-colors shadow-lg shadow-blue-900/20"
                    >
                      {t({ zh: '立即开始认证', en: 'Start Verification' })}
                    </button>
                    <div className="flex justify-center gap-4 text-xs text-slate-500 mt-4">
                      <span className="flex items-center gap-1"><ShieldCheck size={12} /> Bank-grade Security</span>
                      <span className="flex items-center gap-1"><Clock size={12} /> ~3 Mins</span>
                    </div>
                  </div>
                ) : (
                  <div className="mt-6 p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-xl max-w-md mx-auto">
                     <p className="text-emerald-400 text-sm">
                       {t({ zh: '您已获得完整权限', en: 'You have full access privileges' })}
                     </p>
                     <p className="text-slate-500 text-xs mt-1">Level 2 Verified</p>
                  </div>
                )}
                
                <div className="mt-8 border-t border-white/5 pt-6 grid grid-cols-2 gap-4 max-w-lg mx-auto text-left">
                   <div>
                     <p className="text-xs text-slate-500 uppercase font-bold">{t({ zh: '当前限制', en: 'Current Limit' })}</p>
                     <p className="text-white font-mono">{profile?.kycLevel === 'verified' ? '$50,000 / day' : '$1,000 / day'}</p>
                   </div>
                   <div>
                     <p className="text-xs text-slate-500 uppercase font-bold">{t({ zh: '提现权限', en: 'Withdrawal' })}</p>
                     <p className="text-white">{profile?.kycLevel === 'verified' ? 'Enabled' : 'Disabled'}</p>
                   </div>
                </div>
              </div>
            )}
          </div>
        );
      
      case 'payments-history':
        return (
          <div className="p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-xl font-bold">{t({ zh: '支付历史', en: 'Payment History' })}</h2>
                <p className="text-slate-400 text-sm">{t({ zh: '最近支付与账单记录', en: 'Recent payments and bills' })}</p>
              </div>
              <button className="px-3 py-2 rounded-lg bg-blue-600 text-white text-sm hover:bg-blue-500">{t({ zh: '导出', en: 'Export' })}</button>
            </div>
            <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
              <div className="grid grid-cols-6 px-4 py-2 text-xs uppercase tracking-wide text-slate-400 border-b border-slate-800">
                <span>{t({ zh: '时间', en: 'Time' })}</span>
                <span>{t({ zh: '渠道', en: 'Method' })}</span>
                <span>{t({ zh: '金额', en: 'Amount' })}</span>
                <span>{t({ zh: '状态', en: 'Status' })}</span>
                <span>{t({ zh: '类型', en: 'Type' })}</span>
                <span>{t({ zh: '备注', en: 'Note' })}</span>
              </div>
              {paymentsLoading ? (
                <div className="p-6 text-center text-slate-400">{t({ zh: '加载中...', en: 'Loading...' })}</div>
              ) : payments.length === 0 ? (
                <div className="p-6 text-center text-slate-400">{t({ zh: '暂无支付记录', en: 'No payments yet' })}</div>
              ) : (
                payments.map((p) => (
                  <div key={p.id} className="grid grid-cols-6 px-4 py-3 text-sm text-slate-200 border-b border-slate-800 last:border-b-0">
                    <span className="text-xs text-slate-400">{new Date(p.createdAt).toLocaleString()}</span>
                    <span>{p.method || '-'}</span>
                    <span>{`${p.amount} ${p.currency}`}</span>
                    <span className={`${p.status === 'completed' ? 'text-emerald-400' : p.status === 'pending' ? 'text-amber-300' : 'text-red-300'}`}>
                      {t({ zh: p.status, en: p.status })}
                    </span>
                    <span className="text-xs text-slate-400">{p.type}</span>
                    <span className="text-xs text-slate-500 truncate">{p.metadata?.note || '-'}</span>
                  </div>
                ))
              )}
            </div>
          </div>
        );

      case 'payments-invoices':
        return (
          <div className="p-6 space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-xl font-bold text-white">{t({ zh: '账单管理', en: 'Invoices' })}</h2>
                <p className="text-slate-400 text-sm mt-1">{t({ zh: '下载并管理您的月度账单与收据', en: 'Download and manage your monthly invoices and receipts' })}</p>
              </div>
            </div>

            <div className="grid gap-4">
              {[
                { month: 'December 2025', amount: '$142.50', status: 'Paid', date: '2025-12-31' },
                { month: 'November 2025', amount: '$98.20', status: 'Paid', date: '2025-11-30' },
                { month: 'October 2025', amount: '$115.00', status: 'Paid', date: '2025-10-31' },
              ].map((invoice, i) => (
                <div key={i} className="bg-slate-900/50 border border-white/5 rounded-2xl p-6 flex items-center justify-between group hover:bg-slate-800 transition-colors">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-xl bg-white/5 flex items-center justify-center text-slate-400">
                      <FileText size={24} />
                    </div>
                    <div>
                      <p className="font-bold text-white">{invoice.month}</p>
                      <p className="text-xs text-slate-500">{invoice.date}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-6">
                    <div className="text-right">
                      <p className="font-bold text-white">{invoice.amount}</p>
                      <span className="text-[10px] font-bold text-emerald-400 uppercase">{invoice.status}</span>
                    </div>
                    <button className="p-2 bg-white/5 hover:bg-white/10 rounded-lg text-slate-400 hover:text-white transition-colors">
                      <ExternalLink size={18} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      
      case 'payments-subscriptions':
        return (
          <div className="p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-xl font-bold">{t({ zh: '订阅管理', en: 'Subscriptions' })}</h2>
                <p className="text-slate-400 text-sm">{t({ zh: '查看与更新当前订阅', en: 'View and update active plans' })}</p>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={loadSubscriptions}
                  className="px-3 py-2 rounded-lg bg-slate-800 text-slate-200 text-sm hover:bg-slate-700"
                >
                  {t({ zh: '刷新', en: 'Refresh' })}
                </button>
                <Link
                  href="/app/user/subscriptions"
                  className="px-3 py-2 rounded-lg bg-blue-600 text-white text-sm hover:bg-blue-500"
                >
                  {t({ zh: '打开订阅页', en: 'Open Subscriptions' })}
                </Link>
              </div>
            </div>
            {subscriptionsLoading ? (
              <div className="p-6 text-center text-slate-400">{t({ zh: '加载中...', en: 'Loading...' })}</div>
            ) : subscriptions.length === 0 ? (
              <div className="p-6 text-center text-slate-400 bg-slate-900 border border-slate-800 rounded-xl">
                {t({ zh: '暂无订阅', en: 'No subscriptions found' })}
              </div>
            ) : (
              <div className="grid md:grid-cols-2 gap-4">
                {subscriptions.map((sub) => (
                  <div key={sub.id} className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-2">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-semibold text-white">{sub.metadata?.name || sub.id}</p>
                        <p className="text-slate-400 text-sm">{`${sub.amount} ${sub.currency}`} / {t({ zh: sub.interval, en: sub.interval })}</p>
                      </div>
                      <span className={`px-2 py-1 text-xs rounded ${sub.status === 'active' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-blue-500/20 text-blue-300'}`}>
                        {t({ zh: sub.status, en: sub.status })}
                      </span>
                    </div>
                    <p className="text-xs text-slate-400">{t({ zh: '下次扣款', en: 'Next billing' })}: {new Date(sub.nextBillingDate).toLocaleString()}</p>
                    <div className="flex gap-2 text-xs">
                      <button className="px-3 py-1 rounded bg-slate-800 hover:bg-slate-700 text-white">{t({ zh: '管理', en: 'Manage' })}</button>
                      <button 
                        onClick={() => handleCancelSubscription(sub.id)}
                        className="px-3 py-1 rounded bg-red-500/10 hover:bg-red-500/20 text-red-400"
                      >
                        {t({ zh: '取消', en: 'Cancel' })}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        );

      case 'payments-referrals':
        return <PromotionPanel />;
      
      case 'security-sessions':
        return (
          <div className="p-6 space-y-4">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-xl font-bold">{t({ zh: '授权会话 (X402)', en: 'Authorization Sessions (X402)' })}</h2>
                <p className="text-slate-400 text-sm">{t({ zh: '管理您的 X402 会话密钥与支付授权', en: 'Manage your X402 session keys and payment grants' })}</p>
              </div>
            </div>
            <SessionManager />
          </div>
        );
      
      case 'security-details':
        return (
          <div className="p-6 space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-xl font-bold text-white">{t({ zh: '权限详情', en: 'Agent Permissions' })}</h2>
                <p className="text-sm text-slate-400 mt-1">{t({ zh: '查看并管理您授予 Agent 的具体操作权限', en: 'View and manage specific operation permissions granted to Agents' })}</p>
              </div>
              <button 
                onClick={loadAuthorizations}
                className="p-2 hover:bg-white/5 rounded-lg text-slate-400 transition-colors"
              >
                <RefreshCw size={18} className={authorizationsLoading ? 'animate-spin' : ''} />
              </button>
            </div>

            <div className="grid gap-4">
              {authorizationsLoading ? (
                <div className="flex items-center justify-center py-20">
                  <RefreshCw className="w-8 h-8 text-blue-500 animate-spin" />
                </div>
              ) : authorizations.length === 0 ? (
                <div className="text-center py-20 bg-slate-900 border border-slate-800 rounded-2xl">
                  <Shield className="w-12 h-12 text-slate-700 mx-auto mb-4" />
                  <p className="text-slate-400">{t({ zh: '暂无活跃授权', en: 'No active authorizations' })}</p>
                  <button 
                    onClick={() => setActiveSubTab('sessions')}
                    className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-bold"
                  >
                    {t({ zh: '去创建授权', en: 'Create Authorization' })}
                  </button>
                </div>
              ) : (
                authorizations.map(auth => (
                  <div key={auth.id} className="bg-slate-900 border border-slate-800 rounded-2xl p-6 hover:border-blue-500/30 transition-all">
                    <div className="flex items-start justify-between mb-6">
                      <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-xl bg-blue-500/10 flex items-center justify-center text-blue-400 border border-blue-500/20">
                          <Bot size={24} />
                        </div>
                        <div>
                          <h3 className="font-bold text-white text-lg">{auth.agentName || auth.agentId}</h3>
                          <div className="flex items-center gap-3 mt-1 text-xs text-slate-500">
                            <span className="flex items-center gap-1">
                              <Key size={12} />
                              {auth.authorizationType.toUpperCase()}
                            </span>
                            <span className="w-1 h-1 rounded-full bg-slate-700" />
                            <span className="flex items-center gap-1">
                              <Clock size={12} />
                              Expires: {auth.expiry ? new Date(auth.expiry).toLocaleDateString() : 'Never'}
                            </span>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {auth.isActive ? (
                          <span className="px-2 py-1 bg-emerald-500/10 text-emerald-400 text-[10px] font-bold rounded-full border border-emerald-500/20 uppercase">Active</span>
                        ) : (
                          <span className="px-2 py-1 bg-slate-800 text-slate-500 text-[10px] font-bold rounded-full uppercase">Inactive</span>
                        )}
                        <button 
                          onClick={() => handleRevokeSession(auth.id)}
                          className="p-2 hover:bg-red-500/10 text-slate-400 hover:text-red-400 rounded-lg transition-colors"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      {/* Spending Limits */}
                      <div className="bg-black/20 rounded-xl p-4 border border-white/5">
                        <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-3">{t({ zh: '支出限制', en: 'Spending Limits' })}</p>
                        <div className="space-y-3">
                          <div className="flex justify-between items-center">
                            <span className="text-xs text-slate-400">{t({ zh: '单次限额', en: 'Single Limit' })}</span>
                            <span className="text-sm font-bold text-white">${auth.singleLimit || 0}</span>
                          </div>
                          <div className="flex justify-between items-center">
                            <span className="text-xs text-slate-400">{t({ zh: '单日限额', en: 'Daily Limit' })}</span>
                            <span className="text-sm font-bold text-white">${auth.dailyLimit || 0}</span>
                          </div>
                          <div className="pt-2 border-t border-white/5 flex justify-between items-center">
                            <span className="text-xs text-slate-400">{t({ zh: '今日已用', en: 'Used Today' })}</span>
                            <span className="text-sm font-bold text-blue-400">${auth.usedToday || 0}</span>
                          </div>
                        </div>
                      </div>

                      {/* Strategy Permissions */}
                      <div className="bg-black/20 rounded-xl p-4 border border-white/5 col-span-1 md:col-span-2">
                        <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-3">{t({ zh: '策略权限', en: 'Strategy Scopes' })}</p>
                        <div className="flex flex-wrap gap-2">
                          {auth.strategyPermissions && auth.strategyPermissions.length > 0 ? (
                            auth.strategyPermissions.map(strat => (
                              <div key={strat.id} className="px-3 py-1.5 bg-blue-500/5 border border-blue-500/10 rounded-lg flex items-center gap-2">
                                <span className={`w-1.5 h-1.5 rounded-full ${strat.allowed ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]' : 'bg-red-500'}`} />
                                <span className="text-xs font-bold text-white uppercase tracking-tighter">{strat.strategyType.replace('_', ' ')}</span>
                                {strat.maxAmount && <span className="text-[10px] text-slate-500 font-mono">Max: ${strat.maxAmount}</span>}
                              </div>
                            ))
                          ) : (
                            <p className="text-xs text-slate-600 italic">{t({ zh: '未配置特定策略权限', en: 'No specific strategy scopes configured' })}</p>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="mt-6 flex justify-end gap-3">
                      <button className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-xs font-bold transition-colors">
                        {t({ zh: '查看历史', en: 'View History' })}
                      </button>
                      <button className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition-colors">
                        {t({ zh: '修改权限', en: 'Edit Scopes' })}
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        );
      
      case 'security-policies':
        return (
          <div className="p-6">
            <PolicyEngine />
          </div>
        );
      
      case 'profile-info':
        return (
          <div className="p-6 space-y-4">
            <h2 className="text-xl font-bold">{t({ zh: '基本信息', en: 'Profile Info' })}</h2>
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-3">
              {profileLoading ? (
                <p className="text-slate-400">{t({ zh: '加载中...', en: 'Loading...' })}</p>
              ) : (
                <div className="grid md:grid-cols-2 gap-3">
                  <div>
                    <p className="text-xs text-slate-400">ID</p>
                    <p className="text-white text-sm">{profile?.id || '-'}</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-400">Email</p>
                    <p className="text-white text-sm">{profile?.email || '-'}</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-400">{t({ zh: 'KYC 等级', en: 'KYC Level' })}</p>
                    <p className="text-white text-sm">{profile?.kycLevel || '-'}</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-400">{t({ zh: '角色', en: 'Role' })}</p>
                    <p className="text-white text-sm">{profile?.role || '-'}</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        );
      
      case 'profile-social':
        return (
          <div className="p-6 space-y-4">
            <h2 className="text-xl font-bold">{t({ zh: '社交绑定', en: 'Social Bindings' })}</h2>
            <div className="grid md:grid-cols-2 gap-3">
              {[{ name: 'Google', status: 'linked' }, { name: 'Twitter', status: 'unlinked' }, { name: 'Wallet', status: 'linked' }, { name: 'Github', status: 'unlinked' }].map((s) => (
                <div key={s.name} className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex items-center justify-between">
                  <div>
                    <p className="font-semibold text-white">{s.name}</p>
                    <p className="text-xs text-slate-400">{s.status === 'linked' ? t({ zh: '已绑定', en: 'Linked' }) : t({ zh: '未绑定', en: 'Not linked' })}</p>
                  </div>
                  <button 
                    onClick={() => handleSocialLink(s.name)}
                    className={`px-3 py-1 rounded-lg text-sm ${s.status === 'linked' ? 'bg-slate-800 text-slate-200' : 'bg-blue-600 text-white hover:bg-blue-500'}`}
                  >
                    {s.status === 'linked' ? t({ zh: '解绑', en: 'Unlink' }) : t({ zh: '绑定', en: 'Link' })}
                  </button>
                </div>
              ))}
            </div>
          </div>
        );
      
      case 'profile-workspace':
        return (
          <div className="p-6 space-y-4">
            <h2 className="text-xl font-bold">{t({ zh: '工作空间', en: 'Workspace' })}</h2>
            <p className="text-slate-400 text-sm mb-4">
              {t({ zh: '管理您的工作空间和团队成员，实现多人协作', en: 'Manage your workspaces and team members for collaboration' })}
            </p>
            <WorkspaceManager />
          </div>
        );
      
      default:
        return (
          <div className="p-6">
            <p className="text-slate-400">{t({ zh: '功能开发中', en: 'Coming soon' })}</p>
          </div>
        );
    }
  };

  return (
    <div className="h-full flex flex-col bg-slate-950">
      {/* 顶部主导航（可选） */}
      {!hideNavigation && (
        <div className="border-b border-slate-800 bg-slate-900/50">
          <div className="flex items-center px-4 overflow-x-auto">
            {mainTabs.map((tab) => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  onClick={() => {
                    setActiveMainTab(tab.id);
                    setActiveSubTab(subTabs[tab.id][0].id);
                  }}
                  className={`flex items-center gap-2 px-4 py-3 text-sm font-medium whitespace-nowrap transition-colors border-b-2 ${
                    activeMainTab === tab.id
                      ? 'border-blue-500 text-blue-400'
                      : 'border-transparent text-slate-400 hover:text-slate-300'
                  }`}
                >
                  <Icon size={18} />
                  {t(tab.label)}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* 子导航（可选） */}
      {!hideNavigation && (
        <div className="border-b border-slate-800 bg-slate-900/30">
          <div className="flex items-center px-4 gap-2">
            {subTabs[activeMainTab].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveSubTab(tab.id)}
                className={`px-4 py-2 text-sm font-medium whitespace-nowrap transition-colors ${
                  activeSubTab === tab.id
                    ? 'text-white bg-slate-800/50'
                    : 'text-slate-400 hover:text-slate-300'
                }`}
              >
                {t(tab.label)}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* 内容区域 */}
      <div className="flex-1 overflow-y-auto">
        {renderContent()}
      </div>

      {/* 钱包连接弹窗 */}
      {showWalletModal && (
        <WalletConnectModal 
          onClose={() => setShowWalletModal(false)} 
          onConnected={() => {
            setShowWalletModal(false);
            loadWallets();
            success(t({ zh: '钱包连接成功', en: 'Wallet connected' }));
          }} 
        />
      )}

      {/* Onboarding Wizard Overlay */}
      {showOnboarding && (
        <div className="fixed inset-0 z-[100] bg-slate-950/90 backdrop-blur-xl flex flex-col">
          <div className="p-4 flex justify-end">
            <button 
              onClick={() => setShowOnboarding(false)}
              className="p-2 hover:bg-white/10 rounded-full text-slate-400 hover:text-white transition-colors"
            >
              <X size={24} />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto pb-20 text-white">
            <OnboardingWizard 
              onComplete={() => setShowOnboarding(false)} 
              onCancel={() => setShowOnboarding(false)} 
              allowedPersonas={
                mode === 'developer' 
                  ? ['api_provider', 'data_provider', 'expert', 'developer']
                  : mode === 'merchant'
                    ? ['merchant']
                    : ['api_provider', 'merchant', 'expert', 'data_provider', 'developer']
              }
            />
          </div>
        </div>
      )}
    </div>
  );
}
