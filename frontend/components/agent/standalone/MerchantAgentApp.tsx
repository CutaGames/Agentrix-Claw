import { useLocalization } from '../../../contexts/LocalizationContext';
import { UniversalAgentLayout, AgentFeature } from './UniversalAgentLayout';

interface MerchantAgentAppProps {
  agentId?: string;
  apiKey?: string;
  config?: {
    title?: string;
    theme?: 'light' | 'dark';
    showSidebar?: boolean;
  };
}

/**
 * 商家Agent独立应用（包装器）
 * 使用 UniversalAgentLayout 统一布局
 */
export function MerchantAgentApp({
  agentId,
  apiKey,
  config = {},
}: MerchantAgentAppProps) {
  const { t } = useLocalization();

  const features: AgentFeature[] = [
    { id: 'payment_collection', icon: '💰', label: t({ zh: '收款管理', en: 'Payment Collection' }) },
    { id: 'order_analysis', icon: '📊', label: t({ zh: '订单分析', en: 'Order Analysis' }) },
    { id: 'risk_center', icon: '🛡️', label: t({ zh: '风控中心', en: 'Risk Center' }) },
    { id: 'settlement', icon: '💵', label: t({ zh: '清结算', en: 'Settlement' }) },
    { id: 'marketing', icon: '📢', label: t({ zh: '营销助手', en: 'Marketing Assistant' }) },
    { id: 'compliance', icon: '✅', label: t({ zh: '商户合规', en: 'Compliance' }) },
    { id: 'products', icon: '📦', label: t({ zh: '商品管理', en: 'Product Management' }) },
  ];

  const rightPanel = (
    <div>
      <h3 className="text-xs font-semibold text-neutral-400 uppercase tracking-wider mb-3">
        {t({ zh: '今日数据', en: 'Today Stats' })}
      </h3>
      <div className="space-y-2">
        <div className="bg-neutral-800 rounded-lg p-3">
          <div className="text-xs text-neutral-400 mb-1">{t({ zh: '今日GMV', en: 'Today GMV' })}</div>
          <div className="text-lg font-bold text-green-400">¥0.00</div>
        </div>
        <div className="bg-neutral-800 rounded-lg p-3">
          <div className="text-xs text-neutral-400 mb-1">{t({ zh: '待结算', en: 'Pending' })}</div>
          <div className="text-lg font-bold text-yellow-400">¥0.00</div>
        </div>
      </div>
    </div>
  );

  return (
    <UniversalAgentLayout
      role="merchant"
      agentId={agentId}
      apiKey={apiKey}
      config={config}
      features={features}
      rightPanel={rightPanel}
    />
  );
}

