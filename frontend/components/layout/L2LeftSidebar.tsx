import {
  ChevronRight,
  Activity,
  Clock,
  Lightbulb,
  ListTodo,
  Gift,
  LineChart,
  History,
  Search,
  Package,
  ShoppingCart,
  Heart,
  Receipt,
  Repeat,
  FileText,
  Wallet,
  Coins,
  UserCheck,
  Plus,
  Zap,
  Upload,
  Link2,
  AlertCircle,
  Truck,
  RefreshCw,
  TrendingUp,
  Users,
  Box,
  BarChart2,
  Factory,
  TestTube,
  Store,
  Globe,
  Share2,
  DollarSign,
  ArrowDownToLine,
  PiggyBank,
  BookOpen,
  Code,
  FileCode,
  ScrollText,
  X,
  Lock,
  ShieldCheck,
  Settings,
  Key,
  Rocket,
  CreditCard,
} from 'lucide-react';
import { useAgentMode } from '../../contexts/AgentModeContext';
import { useLocalization } from '../../contexts/LocalizationContext';
import { L1Tab } from './L1TopNav';

export type L2SubItem = string;

interface L2LeftSidebarProps {
  activeL1: L1Tab;
  activeL2: L2SubItem;
  onL2Change: (item: L2SubItem) => void;
  isOpen: boolean; // Mobile open state
  onClose: () => void;
  isCollapsed?: boolean; // Desktop collapsed state
}

interface SubNavItem {
  id: string;
  label: { zh: string; en: string };
  icon: any;
}

const userL2Config: Record<string, SubNavItem[]> = {
  dashboard: [
    { id: 'overview', label: { zh: '总览', en: 'Overview' }, icon: Activity },
    { id: 'recent', label: { zh: '最近活动', en: 'Recent Activity' }, icon: Clock },
    { id: 'recommendations', label: { zh: '推荐操作', en: 'Recommendations' }, icon: Lightbulb },
    { id: 'kyc', label: { zh: '实名认证', en: 'KYC' }, icon: UserCheck },
  ],
  'unified-account': [
    { id: 'balances', label: { zh: '资产余额', en: 'Balances' }, icon: Wallet },
    { id: 'transactions', label: { zh: '交易记录', en: 'Transactions' }, icon: Receipt },
    { id: 'deposit', label: { zh: '充值', en: 'Deposit' }, icon: ArrowDownToLine },
    { id: 'withdraw', label: { zh: '提现', en: 'Withdraw' }, icon: DollarSign },
    { id: 'payout-settings', label: { zh: '结算设置', en: 'Payout Settings' }, icon: Settings },
  ],
  'agent-accounts': [
    { id: 'my-agents', label: { zh: '我的 Agent', en: 'My Agents' }, icon: Rocket },
    { id: 'authorizations', label: { zh: '授权管理', en: 'Authorizations' }, icon: ShieldCheck },
    { id: 'auto-pay', label: { zh: '自动支付', en: 'Auto-Pay' }, icon: Zap },
  ],
  kyc: [
    { id: 'status', label: { zh: '认证状态', en: 'Status' }, icon: UserCheck },
    { id: 'upgrade', label: { zh: '升级认证', en: 'Upgrade' }, icon: TrendingUp },
    { id: 'documents', label: { zh: '文档管理', en: 'Documents' }, icon: FileText },
  ],
  agents: [
    { id: 'my-agents', label: { zh: '我的 Agent', en: 'My Agents' }, icon: Rocket },
    { id: 'presence', label: { zh: 'Presence', en: 'Presence' }, icon: Globe },
    { id: 'devices', label: { zh: '设备管理', en: 'Devices' }, icon: RefreshCw },
    { id: 'authorizations', label: { zh: '授权管理', en: 'Authorizations' }, icon: ShieldCheck },
  ],
  earn: [
    { id: 'auto-tasks', label: { zh: '自动任务', en: 'Auto Tasks' }, icon: ListTodo },
    { id: 'airdrops', label: { zh: '空投发现', en: 'Airdrops' }, icon: Gift },
    { id: 'strategies', label: { zh: '策略管理', en: 'Strategies' }, icon: LineChart },
    { id: 'history', label: { zh: '收益历史', en: 'History' }, icon: History },
  ],
  shop: [
    { id: 'orders', label: { zh: '我的订单', en: 'Orders' }, icon: Package },
    { id: 'cart', label: { zh: '购物车', en: 'Cart' }, icon: ShoppingCart },
    { id: 'wishlist', label: { zh: '心愿单', en: 'Wishlist' }, icon: Heart },
  ],
  promotion: [
    { id: 'overview', label: { zh: '推广总览', en: 'Overview' }, icon: Activity },
    { id: 'my-links', label: { zh: '我的链接', en: 'My Links' }, icon: Link2 },
    { id: 'materials', label: { zh: '营销素材', en: 'Materials' }, icon: FileText },
  ],
  pay: [
    { id: 'transactions', label: { zh: '支付历史', en: 'Transactions' }, icon: Receipt },
    { id: 'subscriptions', label: { zh: '订阅管理', en: 'Subscriptions' }, icon: Repeat },
    { id: 'invoices', label: { zh: '账单', en: 'Invoices' }, icon: FileText },
    { id: 'referrals', label: { zh: '推广分润', en: 'Referrals' }, icon: Share2 },
  ],
  assets: [
    { id: 'wallets', label: { zh: '钱包', en: 'Wallets' }, icon: Wallet },
    { id: 'balances', label: { zh: '资产余额', en: 'Balances' }, icon: Coins },
    { id: 'kyc', label: { zh: '身份认证', en: 'KYC' }, icon: UserCheck },
  ],
  // 普通用户不再需要 skills 管理入口，技能管理仅限开发者工作台
  security: [
    { id: 'sessions', label: { zh: '授权会话', en: 'Sessions' }, icon: ShieldCheck },
    { id: 'details', label: { zh: '权限详情', en: 'Permissions' }, icon: Lock },
    { id: 'policies', label: { zh: '策略管理', en: 'Policies' }, icon: Lock },
  ],
};

const merchantL2Config: Record<string, SubNavItem[]> = {
  dashboard: [
    { id: 'overview', label: { zh: '今日概览', en: 'Overview' }, icon: Activity },
    { id: 'revenue', label: { zh: '收入统计', en: 'Revenue' }, icon: TrendingUp },
    { id: 'ai-traffic', label: { zh: 'AI流量', en: 'AI Traffic' }, icon: Zap },
  ],
  products: [
    { id: 'list', label: { zh: '商品列表', en: 'List' }, icon: Package },
    { id: 'add-new', label: { zh: '添加商品', en: 'Add New' }, icon: Plus },
    { id: 'as-skills', label: { zh: '技能化预览', en: 'As Skills' }, icon: Zap },
    { id: 'batch-import', label: { zh: '批量导入', en: 'Batch Import' }, icon: Upload },
    { id: 'ecommerce-sync', label: { zh: '电商同步', en: 'E-commerce Sync' }, icon: Link2 },
  ],
  orders: [
    { id: 'all-orders', label: { zh: '全部订单', en: 'All Orders' }, icon: Package },
    { id: 'pending', label: { zh: '待处理', en: 'Pending' }, icon: AlertCircle },
    { id: 'shipping', label: { zh: '配送中', en: 'Shipping' }, icon: Truck },
    { id: 'refunds', label: { zh: '退款管理', en: 'Refunds' }, icon: RefreshCw },
  ],
  finance: [
    { id: 'overview', label: { zh: '财务概览', en: 'Overview' }, icon: TrendingUp },
    { id: 'stripe-connect', label: { zh: 'Stripe Connect', en: 'Stripe Connect' }, icon: CreditCard },
    { id: 'transactions', label: { zh: '交易记录', en: 'Transactions' }, icon: Receipt },
    { id: 'commission-plans', label: { zh: '分佣规则', en: 'Commission Plans' }, icon: Share2 },
    { id: 'budget-pools', label: { zh: '预算池', en: 'Budget Pools' }, icon: PiggyBank },
    { id: 'settlements', label: { zh: '分账结算', en: 'Settlements' }, icon: Receipt },
    { id: 'withdrawals', label: { zh: '提现', en: 'Withdrawals' }, icon: ArrowDownToLine },
    { id: 'invoices', label: { zh: '发票管理', en: 'Invoices' }, icon: FileText },
  ],
  analytics: [
    { id: 'sales', label: { zh: '销售分析', en: 'Sales' }, icon: BarChart2 },
    { id: 'customers', label: { zh: '客户分析', en: 'Customers' }, icon: Users },
    { id: 'products', label: { zh: '商品分析', en: 'Products' }, icon: Box },
  ],
  settings: [
    { id: 'general', label: { zh: '通用设置', en: 'General' }, icon: Settings },
    { id: 'api-keys', label: { zh: 'API 密钥', en: 'API Keys' }, icon: Key },
    { id: 'webhooks', label: { zh: 'Webhooks', en: 'Webhooks' }, icon: Link2 },
  ],
};

const developerL2Config: Record<string, SubNavItem[]> = {
  dashboard: [
    { id: 'overview', label: { zh: '概览', en: 'Overview' }, icon: Activity },
    { id: 'usage', label: { zh: '使用统计', en: 'Usage' }, icon: BarChart2 },
    { id: 'performance', label: { zh: '性能监控', en: 'Performance' }, icon: LineChart },
  ],
  build: [
    { id: 'skill-factory', label: { zh: '技能工厂', en: 'Skill Factory' }, icon: Factory },
    { id: 'skills-registry', label: { zh: '技能注册表', en: 'Skills Registry' }, icon: Package },
    { id: 'skill-packs', label: { zh: '技能包', en: 'Skill Packs' }, icon: Box },
    { id: 'test-sandbox', label: { zh: '测试沙盒', en: 'Test Sandbox' }, icon: TestTube },
    { id: 'onboarding', label: { zh: '入驻中心', en: 'Onboarding' }, icon: Rocket },
  ],
  publish: [
    { id: 'my-skills', label: { zh: '我的技能', en: 'My Skills' }, icon: Package },
    { id: 'marketplace', label: { zh: '发布技能', en: 'Publish' }, icon: Store },
    { id: 'multi-platform', label: { zh: '多平台分发', en: 'Multi-platform' }, icon: Globe },
    { id: 'distribution', label: { zh: '分发状态', en: 'Distribution' }, icon: Share2 },
  ],
  revenue: [
    { id: 'earnings', label: { zh: '收益统计', en: 'Earnings' }, icon: DollarSign },
    { id: 'transactions', label: { zh: '交易记录', en: 'Transactions' }, icon: Receipt },
    { id: 'commission-plans', label: { zh: '分润配置', en: 'Commission Plans' }, icon: Share2 },
    { id: 'budget-pools', label: { zh: '预算池', en: 'Budget Pools' }, icon: PiggyBank },
    { id: 'withdrawals', label: { zh: '提现', en: 'Withdrawals' }, icon: ArrowDownToLine },
    { id: 'pricing', label: { zh: '定价策略', en: 'Pricing' }, icon: PiggyBank },
  ],
  docs: [
    { id: 'api-reference', label: { zh: 'API文档', en: 'API Reference' }, icon: BookOpen },
    { id: 'sdk-guides', label: { zh: 'SDK指南', en: 'SDK Guides' }, icon: Code },
    { id: 'examples', label: { zh: '示例代码', en: 'Examples' }, icon: FileCode },
    { id: 'changelog', label: { zh: '更新日志', en: 'Changelog' }, icon: ScrollText },
  ],
  settings: [
    { id: 'general', label: { zh: '开发者设置', en: 'General' }, icon: Settings },
    { id: 'api-keys', label: { zh: 'API 密钥', en: 'API Keys' }, icon: Key },
    { id: 'webhooks', label: { zh: 'Webhooks', en: 'Webhooks' }, icon: Link2 },
  ],
};

export function L2LeftSidebar({ activeL1, activeL2, onL2Change, isOpen, onClose, isCollapsed = false }: L2LeftSidebarProps) {
  const { mode } = useAgentMode();
  const { t } = useLocalization();

  const l2Config =
    mode === 'personal'
      ? userL2Config
      : mode === 'merchant'
        ? merchantL2Config
        : developerL2Config;

  const items = l2Config[activeL1] || [];

  const getL1Label = () => {
    const labels: Record<string, { zh: string; en: string }> = {
      dashboard: { zh: '控制台', en: 'Dashboard' },
      earn: { zh: '自动赚钱', en: 'Earn' },
      shop: { zh: '智能购物', en: 'Shop' },
      pay: { zh: '支付管理', en: 'Pay' },
      assets: { zh: '资产管理', en: 'Assets' },
      promotion: { zh: '推广中心', en: 'Promotion' },
      orders: { zh: '订单管理', en: 'Orders' },
      finance: { zh: '财务中心', en: 'Finance' },
      analytics: { zh: '数据分析', en: 'Analytics' },
      build: { zh: '构建技能', en: 'Build' },
      publish: { zh: '发布分发', en: 'Publish' },
      revenue: { zh: '收益中心', en: 'Revenue' },
      docs: { zh: '文档支持', en: 'Docs' },
    };
    return t(labels[activeL1] || { zh: activeL1, en: activeL1 });
  };

  return (
    <>
      <aside 
        className={`hidden md:flex flex-col bg-slate-900/50 border-r border-slate-800 h-full transition-all duration-300 ${isCollapsed ? 'w-16' : 'w-48'}`}
      >
        <div className={`p-3 border-b border-slate-800 ${isCollapsed ? 'flex justify-center' : ''}`}>
          {isCollapsed ? (
            <span className="text-xs font-bold text-slate-500 uppercase">{getL1Label().charAt(0)}</span>
          ) : (
            <h2 className="text-xs font-bold text-slate-500 uppercase tracking-wider truncate">{getL1Label()}</h2>
          )}
        </div>
        <nav className="flex-1 p-2 space-y-1 overflow-y-auto overflow-x-hidden">
          {items.map((item) => {
            const Icon = item.icon;
            const isActive = activeL2 === item.id;
            return (
              <button
                key={item.id}
                onClick={() => onL2Change(item.id)}
                title={isCollapsed ? t(item.label) : undefined}
                className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                  isActive ? 'bg-slate-800 text-white border-l-2 border-blue-500' : 'text-slate-400 hover:text-white hover:bg-slate-800/50'
                } ${isCollapsed ? 'justify-center px-0' : ''}`}
              >
                <Icon size={16} className="shrink-0" />
                {!isCollapsed && <span className="truncate">{t(item.label)}</span>}
                {!isCollapsed && isActive && <ChevronRight size={14} className="ml-auto text-blue-500 shrink-0" />}
              </button>
            );
          })}
        </nav>
      </aside>

      {isOpen && (
        <div className="md:hidden fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/50" onClick={onClose} />
          <aside className="absolute left-0 top-0 bottom-0 w-64 bg-slate-900 shadow-xl animate-slide-in-left">
            <div className="flex items-center justify-between p-4 border-b border-slate-800">
              <h2 className="text-sm font-bold text-white">{getL1Label()}</h2>
              <button onClick={onClose} className="p-1 text-slate-400 hover:text-white">
                <X size={18} />
              </button>
            </div>
            <nav className="p-3 space-y-1">
              {items.map((item) => {
                const Icon = item.icon;
                const isActive = activeL2 === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => {
                      onL2Change(item.id);
                      onClose();
                    }}
                    className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-all ${
                      isActive ? 'bg-slate-800 text-white' : 'text-slate-400 hover:text-white hover:bg-slate-800/50'
                    }`}
                  >
                    <Icon size={18} />
                    <span>{t(item.label)}</span>
                  </button>
                );
              })}
            </nav>
          </aside>
        </div>
      )}
    </>
  );
}
