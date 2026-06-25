import { useLocalization } from '../../../contexts/LocalizationContext';
import { UniversalAgentLayout, AgentFeature } from './UniversalAgentLayout';

interface DeveloperAgentAppProps {
  agentId?: string;
  apiKey?: string;
  config?: {
    title?: string;
    theme?: 'light' | 'dark';
    showSidebar?: boolean;
  };
}

/**
 * 开发者Agent独立应用（包装器）
 * 使用 UniversalAgentLayout 统一布局
 */
export function DeveloperAgentApp({
  agentId,
  apiKey,
  config = {},
}: DeveloperAgentAppProps) {
  const { t } = useLocalization();

  const features: AgentFeature[] = [
    { id: 'sdk_generator', icon: '🔧', label: t({ zh: 'SDK生成器', en: 'SDK Generator' }) },
    { id: 'api_assistant', icon: '🔗', label: t({ zh: 'API助手', en: 'API Assistant' }) },
    { id: 'sandbox', icon: '🧪', label: t({ zh: '沙盒调试', en: 'Sandbox Debugging' }) },
    { id: 'devops', icon: '⚙️', label: t({ zh: 'DevOps自动化', en: 'DevOps Automation' }) },
    { id: 'contract', icon: '📜', label: t({ zh: '合约助手', en: 'Contract Assistant' }) },
    { id: 'tickets', icon: '🎫', label: t({ zh: '工单与日志', en: 'Tickets & Logs' }) },
    { id: 'code_gen', icon: '💻', label: t({ zh: '代码生成', en: 'Code Generation' }) },
  ];

  const rightPanel = (
    <div>
      <h3 className="text-xs font-semibold text-neutral-400 uppercase tracking-wider mb-3">
        {t({ zh: 'API统计', en: 'API Stats' })}
      </h3>
      <div className="space-y-2">
        <div className="bg-neutral-800 rounded-lg p-3">
          <div className="text-xs text-neutral-400 mb-1">{t({ zh: '今日调用', en: 'Today Calls' })}</div>
          <div className="text-lg font-bold text-orange-400">0</div>
        </div>
        <div className="bg-neutral-800 rounded-lg p-3">
          <div className="text-xs text-neutral-400 mb-1">{t({ zh: '收益', en: 'Revenue' })}</div>
          <div className="text-lg font-bold text-green-400">¥0.00</div>
        </div>
      </div>
    </div>
  );

  return (
    <UniversalAgentLayout
      role="developer"
      agentId={agentId}
      apiKey={apiKey}
      config={config}
      features={features}
      rightPanel={rightPanel}
    />
  );
}

