'use client';

/**
 * L2 Persona Sidebar - 画像专属左侧导航
 * 对应重构方案 2.2 节的各画像专属导航配置
 * 
 * 每个画像有独立的L2导航项配置
 */

import { useMemo } from 'react';
import { useLocalization } from '../../contexts/LocalizationContext';
import { UserPersona, personaThemes } from '../onboarding/PersonaSelector';
import {
  LayoutDashboard,
  Activity,
  Sparkles,
  Wallet,
  Bot,
  UserCheck,
  Zap,
  TrendingUp,
  ShoppingBag,
  Shield,
  Plug,
  FileCode,
  DollarSign,
  Key,
  Settings,
  Store,
  Package,
  ShoppingCart,
  BarChart3,
  Truck,
  Users,
  GraduationCap,
  FileText,
  Calendar,
  Star,
  Database,
  Search,
  Lock,
  Code2,
  Rocket,
  BookOpen,
  GitBranch,
  Globe,
  Briefcase,
} from 'lucide-react';

export type L2NavItem = {
  id: string;
  label: { zh: string; en: string };
  icon: React.ComponentType<{ className?: string }>;
  badge?: string | number;
  isNew?: boolean;
};

export type L2NavGroup = {
  id: string;
  label: { zh: string; en: string };
  items: L2NavItem[];
};

/**
 * 各画像的L2导航配置 - 对应重构方案2.2节
 */
export const personaL2Config: Record<UserPersona, L2NavGroup[]> = {
  // 2.2.1 个人版 (Personal) - 消费者视角
  personal: [
    {
      id: 'dashboard',
      label: { zh: '控制台', en: 'Dashboard' },
      items: [
        { id: 'overview', label: { zh: '总览', en: 'Overview' }, icon: LayoutDashboard },
        { id: 'activity', label: { zh: '最近活动', en: 'Recent Activity' }, icon: Activity },
        { id: 'recommendations', label: { zh: '推荐', en: 'Recommendations' }, icon: Sparkles },
      ],
    },
    {
      id: 'account',
      label: { zh: '账户管理', en: 'Account' },
      items: [
        { id: 'unified-account', label: { zh: '统一资金账户', en: 'Unified Account' }, icon: Wallet, isNew: true },
        { id: 'agent-accounts', label: { zh: 'Agent账户管理', en: 'Agent Accounts' }, icon: Bot, isNew: true },
        { id: 'kyc', label: { zh: 'KYC认证中心', en: 'KYC Center' }, icon: UserCheck, isNew: true },
      ],
    },
    {
      id: 'services',
      label: { zh: '服务', en: 'Services' },
      items: [
        { id: 'my-agents', label: { zh: '我的Agent', en: 'My Agents' }, icon: Bot },
        { id: 'skills', label: { zh: '技能市场', en: 'Skill Market' }, icon: Zap },
        { id: 'auto-earn', label: { zh: '自动赚钱', en: 'Auto Earn' }, icon: TrendingUp },
        { id: 'shopping', label: { zh: '购物', en: 'Shopping' }, icon: ShoppingBag },
      ],
    },
    {
      id: 'security',
      label: { zh: '安全', en: 'Security' },
      items: [
        { id: 'authorization', label: { zh: '授权管理', en: 'Authorization' }, icon: Shield },
        { id: 'sessions', label: { zh: '会话管理', en: 'Sessions' }, icon: Key },
        { id: 'settings', label: { zh: '设置', en: 'Settings' }, icon: Settings },
      ],
    },
  ],

  // 2.2.2 API 厂商版 (API Provider)
  api_provider: [
    {
      id: 'dashboard',
      label: { zh: '控制台', en: 'Dashboard' },
      items: [
        { id: 'overview', label: { zh: '总览', en: 'Overview' }, icon: LayoutDashboard },
        { id: 'api-calls', label: { zh: 'API调用统计', en: 'API Call Stats' }, icon: Activity },
        { id: 'revenue', label: { zh: '收益概览', en: 'Revenue' }, icon: DollarSign },
      ],
    },
    {
      id: 'api-management',
      label: { zh: 'API管理', en: 'API Management' },
      items: [
        { id: 'api-import', label: { zh: 'API导入', en: 'Import API' }, icon: Plug, isNew: true },
        { id: 'api-list', label: { zh: 'API列表', en: 'API List' }, icon: FileCode },
        { id: 'skill-mapping', label: { zh: '技能映射', en: 'Skill Mapping' }, icon: Zap },
        { id: 'rate-limits', label: { zh: '限额管理', en: 'Rate Limits' }, icon: BarChart3 },
      ],
    },
    {
      id: 'account',
      label: { zh: '账户', en: 'Account' },
      items: [
        { id: 'unified-account', label: { zh: '统一资金账户', en: 'Unified Account' }, icon: Wallet },
        { id: 'developer-account', label: { zh: '开发者账户', en: 'Developer Account' }, icon: Code2 },
        { id: 'kyc', label: { zh: 'KYC认证', en: 'KYC' }, icon: UserCheck },
      ],
    },
    {
      id: 'settings',
      label: { zh: '设置', en: 'Settings' },
      items: [
        { id: 'webhooks', label: { zh: 'Webhooks', en: 'Webhooks' }, icon: GitBranch },
        { id: 'oauth-apps', label: { zh: 'OAuth应用', en: 'OAuth Apps' }, icon: Key },
        { id: 'team', label: { zh: '团队管理', en: 'Team' }, icon: Users },
      ],
    },
  ],

  // 2.2.3 实物/服务商版 (Merchant)
  merchant: [
    {
      id: 'dashboard',
      label: { zh: '仪表板', en: 'Dashboard' },
      items: [
        { id: 'overview', label: { zh: '总览', en: 'Overview' }, icon: LayoutDashboard },
        { id: 'gmv', label: { zh: 'GMV统计', en: 'GMV Stats' }, icon: DollarSign },
        { id: 'ai-traffic', label: { zh: 'AI流量', en: 'AI Traffic' }, icon: Activity },
      ],
    },
    {
      id: 'products',
      label: { zh: '商品管理', en: 'Products' },
      items: [
        { id: 'product-list', label: { zh: '商品列表', en: 'Product List' }, icon: Package },
        { id: 'product-sync', label: { zh: '商品同步', en: 'Product Sync' }, icon: Store, isNew: true },
        { id: 'skill-preview', label: { zh: '技能化预览', en: 'Skill Preview' }, icon: Zap },
        { id: 'ucp-config', label: { zh: 'UCP配置', en: 'UCP Config' }, icon: FileCode, isNew: true },
      ],
    },
    {
      id: 'orders',
      label: { zh: '订单', en: 'Orders' },
      items: [
        { id: 'all-orders', label: { zh: '全部订单', en: 'All Orders' }, icon: ShoppingCart },
        { id: 'fulfillment', label: { zh: '履约管理', en: 'Fulfillment' }, icon: Truck },
        { id: 'refunds', label: { zh: '退款处理', en: 'Refunds' }, icon: Activity },
      ],
    },
    {
      id: 'account',
      label: { zh: '账户', en: 'Account' },
      items: [
        { id: 'unified-account', label: { zh: '统一资金账户', en: 'Unified Account' }, icon: Wallet },
        { id: 'kyc', label: { zh: 'KYC认证', en: 'KYC' }, icon: UserCheck },
        { id: 'store-settings', label: { zh: '店铺设置', en: 'Store Settings' }, icon: Settings },
      ],
    },
  ],

  // 2.2.4 行业专家版 (Expert)
  expert: [
    {
      id: 'dashboard',
      label: { zh: '控制台', en: 'Dashboard' },
      items: [
        { id: 'overview', label: { zh: '总览', en: 'Overview' }, icon: LayoutDashboard },
        { id: 'consultations', label: { zh: '咨询统计', en: 'Consultations' }, icon: Activity },
        { id: 'earnings', label: { zh: '收益概览', en: 'Earnings' }, icon: DollarSign },
      ],
    },
    {
      id: 'expertise',
      label: { zh: '专业能力', en: 'Expertise' },
      items: [
        { id: 'capability-cards', label: { zh: '能力卡片', en: 'Capability Cards' }, icon: GraduationCap, isNew: true },
        { id: 'credentials', label: { zh: '资质认证', en: 'Credentials' }, icon: FileText },
        { id: 'sla-config', label: { zh: 'SLA配置', en: 'SLA Config' }, icon: Calendar, isNew: true },
        { id: 'pricing', label: { zh: '定价策略', en: 'Pricing' }, icon: DollarSign },
      ],
    },
    {
      id: 'consultations',
      label: { zh: '咨询服务', en: 'Consultations' },
      items: [
        { id: 'active-sessions', label: { zh: '进行中', en: 'Active Sessions' }, icon: Activity },
        { id: 'history', label: { zh: '历史记录', en: 'History' }, icon: FileText },
        { id: 'reviews', label: { zh: '评价管理', en: 'Reviews' }, icon: Star },
      ],
    },
    {
      id: 'account',
      label: { zh: '账户', en: 'Account' },
      items: [
        { id: 'unified-account', label: { zh: '统一资金账户', en: 'Unified Account' }, icon: Wallet },
        { id: 'kyc', label: { zh: 'KYC认证', en: 'KYC' }, icon: UserCheck },
        { id: 'availability', label: { zh: '时间设置', en: 'Availability' }, icon: Calendar },
      ],
    },
  ],

  // 2.2.5 数据提供方版 (Data Provider)
  data_provider: [
    {
      id: 'dashboard',
      label: { zh: '控制台', en: 'Dashboard' },
      items: [
        { id: 'overview', label: { zh: '总览', en: 'Overview' }, icon: LayoutDashboard },
        { id: 'queries', label: { zh: '查询统计', en: 'Query Stats' }, icon: Activity },
        { id: 'revenue', label: { zh: '收益概览', en: 'Revenue' }, icon: DollarSign },
      ],
    },
    {
      id: 'datasets',
      label: { zh: '数据管理', en: 'Data Management' },
      items: [
        { id: 'my-datasets', label: { zh: '我的数据集', en: 'My Datasets' }, icon: Database, isNew: true },
        { id: 'data-import', label: { zh: '数据导入', en: 'Data Import' }, icon: Plug },
        { id: 'vectorization', label: { zh: '向量化', en: 'Vectorization' }, icon: Activity, isNew: true },
        { id: 'rag-index', label: { zh: 'RAG索引', en: 'RAG Index' }, icon: Search },
      ],
    },
    {
      id: 'access',
      label: { zh: '访问控制', en: 'Access Control' },
      items: [
        { id: 'privacy-settings', label: { zh: '隐私设置', en: 'Privacy Settings' }, icon: Lock, isNew: true },
        { id: 'x402-pricing', label: { zh: 'X402计费', en: 'X402 Pricing' }, icon: DollarSign, isNew: true },
        { id: 'access-logs', label: { zh: '访问日志', en: 'Access Logs' }, icon: FileText },
      ],
    },
    {
      id: 'account',
      label: { zh: '账户', en: 'Account' },
      items: [
        { id: 'unified-account', label: { zh: '统一资金账户', en: 'Unified Account' }, icon: Wallet },
        { id: 'kyc', label: { zh: 'KYC认证', en: 'KYC' }, icon: UserCheck },
        { id: 'api-keys', label: { zh: 'API密钥', en: 'API Keys' }, icon: Key },
      ],
    },
  ],

  // 2.2.6 全能开发者版 (Developer)
  developer: [
    {
      id: 'dashboard',
      label: { zh: '控制台', en: 'Dashboard' },
      items: [
        { id: 'overview', label: { zh: '总览', en: 'Overview' }, icon: LayoutDashboard },
        { id: 'api-calls', label: { zh: 'API调用', en: 'API Calls' }, icon: Activity },
        { id: 'revenue', label: { zh: '收益', en: 'Revenue' }, icon: DollarSign },
        { id: 'agents', label: { zh: 'Agent统计', en: 'Agent Stats' }, icon: Bot },
      ],
    },
    {
      id: 'build',
      label: { zh: '构建', en: 'Build' },
      items: [
        { id: 'skill-factory', label: { zh: 'Skill工厂', en: 'Skill Factory' }, icon: Zap },
        { id: 'workflow', label: { zh: '工作流编排', en: 'Workflow Editor' }, icon: GitBranch },
        { id: 'test-bench', label: { zh: '测试工作台', en: 'Test Bench' }, icon: Code2 },
      ],
    },
    {
      id: 'publish',
      label: { zh: '发布', en: 'Publish' },
      items: [
        { id: 'marketplace', label: { zh: '市场管理', en: 'Marketplace' }, icon: Store },
        { id: 'multi-platform', label: { zh: '多平台分发', en: 'Multi-Platform' }, icon: Globe },
        { id: 'mcp-integration', label: { zh: 'MCP集成', en: 'MCP Integration' }, icon: Plug, isNew: true },
      ],
    },
    {
      id: 'account',
      label: { zh: '账户', en: 'Account' },
      items: [
        { id: 'unified-account', label: { zh: '统一资金账户', en: 'Unified Account' }, icon: Wallet },
        { id: 'developer-account', label: { zh: '开发者账户', en: 'Developer Account' }, icon: Code2 },
        { id: 'kyc', label: { zh: 'KYC认证', en: 'KYC' }, icon: UserCheck },
        { id: 'workspace', label: { zh: '工作空间', en: 'Workspace' }, icon: Briefcase, isNew: true },
      ],
    },
    {
      id: 'settings',
      label: { zh: '设置', en: 'Settings' },
      items: [
        { id: 'webhooks', label: { zh: 'Webhooks', en: 'Webhooks' }, icon: GitBranch },
        { id: 'oauth', label: { zh: 'OAuth配置', en: 'OAuth' }, icon: Key },
        { id: 'mcp-config', label: { zh: 'MCP配置', en: 'MCP Config' }, icon: Settings },
      ],
    },
  ],
};

interface L2PersonaSidebarProps {
  persona: UserPersona;
  activeItem: string;
  onItemChange: (itemId: string) => void;
  collapsed?: boolean;
}

/**
 * L2 画像专属左侧导航
 */
export function L2PersonaSidebar({
  persona,
  activeItem,
  onItemChange,
  collapsed = false,
}: L2PersonaSidebarProps) {
  const { t } = useLocalization();
  const theme = personaThemes[persona];
  const navConfig = personaL2Config[persona];

  if (collapsed) {
    return (
      <aside className="w-16 bg-slate-900 border-r border-slate-800 flex flex-col py-4">
        {navConfig.map((group) => (
          <div key={group.id} className="mb-4">
            {group.items.map((item) => {
              const Icon = item.icon;
              const isActive = activeItem === item.id;

              return (
                <button
                  key={item.id}
                  onClick={() => onItemChange(item.id)}
                  title={t(item.label)}
                  className={`w-full p-3 flex items-center justify-center transition-colors relative
                    ${isActive 
                      ? `${theme.accentColor} bg-slate-800` 
                      : 'text-slate-400 hover:text-white hover:bg-slate-800/50'
                    }
                  `}
                >
                  <Icon className="w-5 h-5" />
                  {item.isNew && (
                    <span className="absolute top-1 right-1 w-2 h-2 bg-blue-500 rounded-full" />
                  )}
                </button>
              );
            })}
          </div>
        ))}
      </aside>
    );
  }

  return (
    <aside className="w-60 bg-slate-900 border-r border-slate-800 flex flex-col overflow-y-auto">
      {navConfig.map((group, groupIndex) => (
        <div key={group.id} className={groupIndex > 0 ? 'mt-2' : ''}>
          <div className="px-4 py-2">
            <h3 className="text-xs font-medium text-slate-500 uppercase tracking-wider">
              {t(group.label)}
            </h3>
          </div>
          <nav className="px-2">
            {group.items.map((item) => {
              const Icon = item.icon;
              const isActive = activeItem === item.id;

              return (
                <button
                  key={item.id}
                  onClick={() => onItemChange(item.id)}
                  className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-all
                    ${isActive 
                      ? `${theme.badgeColor} ${theme.borderColor} border` 
                      : 'text-slate-400 hover:text-white hover:bg-slate-800/50'
                    }
                  `}
                >
                  <Icon className={`w-4 h-4 ${isActive ? theme.accentColor : ''}`} />
                  <span className={isActive ? theme.textColor : ''}>{t(item.label)}</span>
                  {item.isNew && (
                    <span className="ml-auto px-1.5 py-0.5 text-[10px] bg-blue-500/20 text-blue-400 rounded">
                      NEW
                    </span>
                  )}
                  {item.badge && (
                    <span className="ml-auto px-1.5 py-0.5 text-[10px] bg-slate-700 text-slate-300 rounded">
                      {item.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>
        </div>
      ))}
    </aside>
  );
}

export default L2PersonaSidebar;
