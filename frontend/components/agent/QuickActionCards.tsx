import { ChevronRight } from 'lucide-react';
import { useLocalization } from '../../contexts/LocalizationContext';
import { AgentMode } from './UnifiedAgentChat';

interface QuickAction {
  title: string;
  sub: string;
  icon: string;
  action: () => void;
}

interface QuickActionCardsProps {
  mode: AgentMode;
  onAction: (action: string, data?: any) => void;
}

export function QuickActionCards({ mode, onAction }: QuickActionCardsProps) {
  const { t } = useLocalization();

  const personalActions: QuickAction[] = [
    {
      title: t({ zh: '分析本月支出', en: 'Analyze Monthly Expenses' }),
      sub: t({ zh: '基于最近30天账单', en: 'Based on last 30 days' }),
      icon: '📊',
      action: () => {
        onAction('chat', { message: '分析本月支出情况' });
      },
    },
    {
      title: t({ zh: '生成支付链接', en: 'Generate Payment Link' }),
      sub: t({ zh: '创建 $50 收款单', en: 'Create $50 invoice' }),
      icon: '🔗',
      action: () => {
        onAction('chat', { message: '帮我生成一个50美元的支付链接' });
      },
    },
    {
      title: t({ zh: '查询 KYC 状态', en: 'Check KYC Status' }),
      sub: t({ zh: '检查认证等级', en: 'Check verification level' }),
      icon: '🆔',
      action: () => {
        onAction('chat', { message: '查询我的KYC状态' });
      },
    },
    {
      title: t({ zh: '优化订阅服务', en: 'Optimize Subscriptions' }),
      sub: t({ zh: '发现可节省项', en: 'Find savings opportunities' }),
      icon: '💰',
      action: () => {
        onAction('chat', { message: '帮我优化订阅服务，找出可以节省的项目' });
      },
    },
  ];

  const merchantActions: QuickAction[] = [
    {
      title: t({ zh: '查看今日订单', en: 'View Today\'s Orders' }),
      sub: t({ zh: '实时订单统计', en: 'Real-time order stats' }),
      icon: '📦',
      action: () => {
        onAction('chat', { message: '显示今日订单统计' });
      },
    },
    {
      title: t({ zh: '生成收款链接', en: 'Create Payment Link' }),
      sub: t({ zh: '快速创建收款单', en: 'Quick invoice creation' }),
      icon: '💳',
      action: () => {
        onAction('chat', { message: '帮我生成一个收款链接' });
      },
    },
    {
      title: t({ zh: '查看结算状态', en: 'Check Settlement' }),
      sub: t({ zh: '对账和结算', en: 'Reconciliation & settlement' }),
      icon: '💵',
      action: () => {
        onAction('chat', { message: '查看结算状态和对账信息' });
      },
    },
    {
      title: t({ zh: '风控分析', en: 'Risk Analysis' }),
      sub: t({ zh: '异常交易检测', en: 'Anomaly detection' }),
      icon: '🛡️',
      action: () => {
        onAction('chat', { message: '进行风控分析，检查异常交易' });
      },
    },
  ];

  const developerActions: QuickAction[] = [
    {
      title: t({ zh: '生成 SDK 代码', en: 'Generate SDK Code' }),
      sub: t({ zh: '多语言 SDK 示例', en: 'Multi-language SDK examples' }),
      icon: '🔧',
      action: () => {
        onAction('chat', { message: '帮我生成 JavaScript SDK 的集成代码' });
      },
    },
    {
      title: t({ zh: '配置 Webhook', en: 'Configure Webhook' }),
      sub: t({ zh: '设置事件监听', en: 'Set up event listeners' }),
      icon: '🔗',
      action: () => {
        onAction('chat', { message: '帮我配置支付成功的 webhook' });
      },
    },
    {
      title: t({ zh: 'API 文档查询', en: 'API Documentation' }),
      sub: t({ zh: '快速查找 API', en: 'Quick API lookup' }),
      icon: '📚',
      action: () => {
        onAction('chat', { message: '查询支付 API 的文档' });
      },
    },
    {
      title: t({ zh: '沙盒测试', en: 'Sandbox Testing' }),
      sub: t({ zh: '模拟支付流程', en: 'Simulate payment flow' }),
      icon: '🧪',
      action: () => {
        onAction('chat', { message: '打开沙盒环境进行测试' });
      },
    },
  ];

  const actions = mode === 'user' ? personalActions : mode === 'merchant' ? merchantActions : developerActions;

  return (
    <div className="grid grid-cols-2 gap-4 w-full">
      {actions.map((action, idx) => (
        <button
          key={idx}
          onClick={action.action}
          className="flex items-center gap-4 p-4 rounded-xl bg-slate-900/50 border border-slate-800 hover:border-indigo-500/50 hover:bg-slate-800 transition-all group text-left"
        >
          <div className="w-10 h-10 rounded-lg bg-slate-800 group-hover:bg-indigo-500/20 group-hover:text-indigo-400 flex items-center justify-center text-xl transition-colors">
            {action.icon}
          </div>
          <div className="flex-1">
            <div className="text-sm font-medium text-slate-200 group-hover:text-indigo-300 transition-colors">
              {action.title}
            </div>
            <div className="text-xs text-slate-500">{action.sub}</div>
          </div>
          <ChevronRight
            size={16}
            className="ml-auto text-slate-600 group-hover:text-indigo-400 opacity-0 group-hover:opacity-100 transition-all transform group-hover:translate-x-1"
          />
        </button>
      ))}
    </div>
  );
}

