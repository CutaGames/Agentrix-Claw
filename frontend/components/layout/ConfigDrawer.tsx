import { useState } from 'react';
import { 
  X,
  Bot,
  Wrench,
  Shield,
  Key,
  Clock,
  FileCheck,
  ScrollText,
  User,
  Settings,
  HelpCircle,
  ChevronRight,
  ChevronDown,
  Zap,
  Link2,
  Code,
  Webhook,
  Wallet,
  CreditCard,
  AlertTriangle,
  Lock,
  Users,
  Bell,
  Store
} from 'lucide-react';
import { useAgentMode } from '../../contexts/AgentModeContext';
import { useLocalization } from '../../contexts/LocalizationContext';

interface ConfigDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  onItemClick?: (section: string, item: string) => void;
}

interface ConfigSection {
  id: string;
  label: { zh: string; en: string };
  icon: any;
  items: Array<{
    id: string;
    label: { zh: string; en: string };
    icon: any;
    badge?: string;
  }>;
}

export function ConfigDrawer({ isOpen, onClose, onItemClick }: ConfigDrawerProps) {
  const { mode } = useAgentMode();
  const { t } = useLocalization();
  const [expandedSections, setExpandedSections] = useState<string[]>(['agent-skills']);

  // User mode config sections
  const userConfigSections: ConfigSection[] = [
    {
      id: 'agent-skills',
      label: { zh: 'Agent & 技能', en: 'Agent & Skills' },
      icon: Bot,
      items: [
        { id: 'my-agents', label: { zh: '我的 Agent', en: 'My Agents' }, icon: Bot },
        { id: 'skill-library', label: { zh: '技能库', en: 'Skill Library' }, icon: Wrench },
        { id: 'mandates', label: { zh: '授权管理', en: 'Mandates' }, icon: Key },
      ],
    },
    {
      id: 'security',
      label: { zh: '安全与治理', en: 'Security & Governance' },
      icon: Shield,
      items: [
        { id: 'permissions', label: { zh: '权限设置', en: 'Permissions' }, icon: Lock },
        { id: 'sessions', label: { zh: '授权会话', en: 'Sessions' }, icon: Clock, badge: '3' },
        { id: 'policies', label: { zh: '支付策略', en: 'Policies' }, icon: FileCheck },
        { id: 'audit-trail', label: { zh: '审计日志', en: 'Audit Trail' }, icon: ScrollText },
      ],
    },
    {
      id: 'account',
      label: { zh: '账户', en: 'Account' },
      icon: User,
      items: [
        { id: 'profile', label: { zh: '个人资料', en: 'Profile' }, icon: User },
        { id: 'preferences', label: { zh: '偏好设置', en: 'Preferences' }, icon: Settings },
        { id: 'help', label: { zh: '帮助与支持', en: 'Help & Support' }, icon: HelpCircle },
      ],
    },
  ];

  // Merchant mode config sections
  const merchantConfigSections: ConfigSection[] = [
    {
      id: 'ai-integration',
      label: { zh: 'AI 集成', en: 'AI Integration' },
      icon: Bot,
      items: [
        { id: 'skill-converter', label: { zh: '商品→技能转换', en: 'Product → Skill' }, icon: Zap },
        { id: 'multi-platform', label: { zh: '多平台配置', en: 'Multi-platform Config' }, icon: Link2 },
        { id: 'agent-whitelist', label: { zh: 'Agent 白名单', en: 'Agent Whitelist' }, icon: Shield },
      ],
    },
    {
      id: 'integrations',
      label: { zh: '集成', en: 'Integrations' },
      icon: Link2,
      items: [
        { id: 'api-keys', label: { zh: 'API 密钥', en: 'API Keys' }, icon: Key },
        { id: 'webhooks', label: { zh: 'Webhooks', en: 'Webhooks' }, icon: Webhook },
        { id: 'mpc-wallet', label: { zh: 'MPC 钱包', en: 'MPC Wallet' }, icon: Wallet },
        { id: 'payment-gateway', label: { zh: '支付网关', en: 'Payment Gateway' }, icon: CreditCard },
      ],
    },
    {
      id: 'compliance',
      label: { zh: '合规', en: 'Compliance' },
      icon: Shield,
      items: [
        { id: 'audit-logs', label: { zh: '审计日志', en: 'Audit Logs' }, icon: ScrollText },
        { id: 'tax-settings', label: { zh: '税务设置', en: 'Tax Settings' }, icon: FileCheck },
        { id: 'legal-docs', label: { zh: '法律文档', en: 'Legal Docs' }, icon: FileCheck },
      ],
    },
    {
      id: 'settings',
      label: { zh: '设置', en: 'Settings' },
      icon: Settings,
      items: [
        { id: 'store-info', label: { zh: '店铺信息', en: 'Store Info' }, icon: Store },
        { id: 'notification', label: { zh: '通知设置', en: 'Notification' }, icon: Bell },
        { id: 'team', label: { zh: '团队管理', en: 'Team Management' }, icon: Users },
      ],
    },
  ];

  // Professional User mode config sections
  const developerConfigSections: ConfigSection[] = [
    {
      id: 'integration',
      label: { zh: '集成', en: 'Integration' },
      icon: Link2,
      items: [
        { id: 'api-keys', label: { zh: 'API 密钥', en: 'API Keys' }, icon: Key },
        { id: 'mcp-config', label: { zh: 'MCP 配置', en: 'MCP Config' }, icon: Code },
        { id: 'oauth-apps', label: { zh: 'OAuth 应用', en: 'OAuth Apps' }, icon: Lock },
        { id: 'webhooks', label: { zh: 'Webhooks', en: 'Webhooks' }, icon: Webhook },
      ],
    },
    {
      id: 'agent-testing',
      label: { zh: 'Agent 测试', en: 'Agent Testing' },
      icon: Bot,
      items: [
        { id: 'test-agents', label: { zh: '测试 Agent', en: 'Test Agents' }, icon: Bot },
        { id: 'debug-console', label: { zh: '调试控制台', en: 'Debug Console' }, icon: Code },
        { id: 'mock-scenarios', label: { zh: '模拟场景', en: 'Mock Scenarios' }, icon: Wrench },
      ],
    },
    {
      id: 'monitoring',
      label: { zh: '监控', en: 'Monitoring' },
      icon: AlertTriangle,
      items: [
        { id: 'logs', label: { zh: '调用日志', en: 'Logs' }, icon: ScrollText },
        { id: 'errors', label: { zh: '错误追踪', en: 'Errors' }, icon: AlertTriangle },
        { id: 'performance', label: { zh: '性能监控', en: 'Performance' }, icon: Zap },
        { id: 'alerts', label: { zh: '告警', en: 'Alerts' }, icon: Bell },
      ],
    },
    {
      id: 'security',
      label: { zh: '安全', en: 'Security' },
      icon: Shield,
      items: [
        { id: 'audit-trail', label: { zh: '审计日志', en: 'Audit Trail' }, icon: ScrollText },
        { id: 'rate-limits', label: { zh: '速率限制', en: 'Rate Limits' }, icon: Clock },
        { id: 'ip-whitelist', label: { zh: 'IP 白名单', en: 'IP Whitelist' }, icon: Shield },
      ],
    },
    {
      id: 'settings',
      label: { zh: '设置', en: 'Settings' },
      icon: Settings,
      items: [
        { id: 'professional-profile', label: { zh: '专业用户资料', en: 'Professional Profile' }, icon: User },
        { id: 'team-members', label: { zh: '团队成员', en: 'Team Members' }, icon: Users },
        { id: 'billing', label: { zh: '账单', en: 'Billing' }, icon: CreditCard },
      ],
    },
  ];

  // Get the right config based on mode
  const configSections = mode === 'personal' ? userConfigSections : 
                         mode === 'merchant' ? merchantConfigSections : 
                         developerConfigSections;

  const toggleSection = (sectionId: string) => {
    setExpandedSections((prev) =>
      prev.includes(sectionId)
        ? prev.filter((id) => id !== sectionId)
        : [...prev, sectionId]
    );
  };

  const handleItemClick = (sectionId: string, itemId: string) => {
    if (onItemClick) {
      onItemClick(sectionId, itemId);
    }
    // On mobile, close the drawer after selection
    if (typeof window !== 'undefined' && window.innerWidth < 768) {
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50">
      {/* Overlay - only covers content area, not assistant panel on desktop */}
      <div 
        className="absolute inset-0 md:right-[400px] bg-black/50" 
        onClick={onClose}
      />
      
      {/* Drawer */}
      <aside className="absolute left-0 top-0 bottom-0 w-80 bg-slate-950 shadow-xl animate-slide-in-left flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <Settings size={18} className="text-slate-400" />
            <h2 className="text-sm font-bold text-white">
              {t({ zh: '配置', en: 'Configuration' })}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {configSections.map((section) => {
            const SectionIcon = section.icon;
            const isExpanded = expandedSections.includes(section.id);
            
            return (
              <div key={section.id} className="rounded-lg overflow-hidden">
                {/* Section Header */}
                <button
                  onClick={() => toggleSection(section.id)}
                  className="w-full flex items-center gap-2 px-3 py-2.5 bg-slate-900/50 hover:bg-slate-800/50 text-slate-300 transition-colors"
                >
                  <SectionIcon size={16} className="text-slate-500" />
                  <span className="text-sm font-medium flex-1 text-left">
                    {t(section.label)}
                  </span>
                  {isExpanded ? (
                    <ChevronDown size={16} className="text-slate-500" />
                  ) : (
                    <ChevronRight size={16} className="text-slate-500" />
                  )}
                </button>

                {/* Section Items */}
                {isExpanded && (
                  <div className="bg-slate-900/30 py-1">
                    {section.items.map((item) => {
                      const ItemIcon = item.icon;
                      return (
                        <button
                          key={item.id}
                          onClick={() => handleItemClick(section.id, item.id)}
                          className="w-full flex items-center gap-2 px-4 py-2 text-slate-400 hover:text-white hover:bg-slate-800/50 transition-colors"
                        >
                          <ItemIcon size={14} />
                          <span className="text-sm flex-1 text-left">{t(item.label)}</span>
                          {item.badge && (
                            <span className="text-xs bg-blue-500/20 text-blue-400 px-1.5 py-0.5 rounded">
                              {item.badge}
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div className="p-3 border-t border-slate-800">
          <div className="text-xs text-slate-500 text-center">
            {t({ zh: '系统构件与治理配置', en: 'System Components & Governance' })}
          </div>
        </div>
      </aside>
    </div>
  );
}
