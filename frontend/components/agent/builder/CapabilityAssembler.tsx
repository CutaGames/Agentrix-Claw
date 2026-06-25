import { useState, useMemo } from 'react';
import { useLocalization } from '../../../contexts/LocalizationContext';

export type AgentRole = 'user' | 'merchant' | 'developer';

interface Capability {
  id: string;
  name: string;
  description: string;
  category: 'core' | 'advanced' | 'custom';
  required?: boolean;
  icon?: string;
  config?: Record<string, any>;
}

interface CapabilityAssemblerProps {
  role: AgentRole;
  selectedCapabilities: string[];
  onCapabilitiesChange: (capabilities: string[]) => void;
  onConfigChange?: (capabilityId: string, config: Record<string, any>) => void;
}

/**
 * 表单式能力装配组件
 * 替代拖拽式工作流编辑器，采用"积木装配模式"
 */
export function CapabilityAssembler({
  role,
  selectedCapabilities,
  onCapabilitiesChange,
  onConfigChange,
}: CapabilityAssemblerProps) {
  const { t } = useLocalization();
  const [showAdvanced, setShowAdvanced] = useState(true);
  const [showCustom, setShowCustom] = useState(false);
  const [customApiSchema, setCustomApiSchema] = useState('');

  // 根据角色定义能力列表
  const capabilities = useMemo(() => getCapabilitiesByRole(role, t), [role, t]);

  // 分离 Core、Advanced、Custom 能力
  const coreCapabilities = capabilities.filter((c) => c.category === 'core');
  const advancedCapabilities = capabilities.filter((c) => c.category === 'advanced');
  const customCapabilities = capabilities.filter((c) => c.category === 'custom');

  const handleToggleCapability = (capabilityId: string) => {
    const isSelected = selectedCapabilities.includes(capabilityId);
    if (isSelected) {
      onCapabilitiesChange(selectedCapabilities.filter((id) => id !== capabilityId));
    } else {
      onCapabilitiesChange([...selectedCapabilities, capabilityId]);
    }
  };

  const handleAddCustomAction = () => {
    if (customApiSchema.trim()) {
      try {
        const schema = JSON.parse(customApiSchema);
        // 这里可以调用 onConfigChange 保存自定义配置
        setShowCustom(false);
        setCustomApiSchema('');
      } catch (error) {
        alert(t({ zh: 'API Schema 格式错误', en: 'Invalid API Schema format' }));
      }
    }
  };

  return (
    <div className="space-y-6">
      {/* 说明文字 */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <p className="text-sm text-blue-800">
          {t({
            zh: '通过勾选能力模块来装配您的 Agent。Core 能力是必选的，Advanced 能力是可选的增强功能。',
            en: 'Assemble your Agent by selecting capability modules. Core capabilities are required, Advanced capabilities are optional enhancements.',
          })}
        </p>
      </div>

      {/* Core 能力（必选） */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-900">
            {t({ zh: '核心能力', en: 'Core Capabilities' })}
            <span className="ml-2 text-xs text-gray-500">({t({ zh: '必选', en: 'Required' })})</span>
          </h3>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {coreCapabilities.map((capability) => (
            <CapabilityCard
              key={capability.id}
              capability={capability}
              isSelected={selectedCapabilities.includes(capability.id)}
              isRequired={capability.required}
              onToggle={() => {
                if (!capability.required) {
                  handleToggleCapability(capability.id);
                }
              }}
            />
          ))}
        </div>
      </div>

      {/* Advanced 能力（可选） */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-900">
            {t({ zh: '高级能力', en: 'Advanced Capabilities' })}
            <span className="ml-2 text-xs text-gray-500">({t({ zh: '可选', en: 'Optional' })})</span>
          </h3>
          <button
            onClick={() => setShowAdvanced(!showAdvanced)}
            className="text-sm text-blue-600 hover:text-blue-700"
          >
            {showAdvanced ? '▼' : '▶'} {t({ zh: '展开/收起', en: 'Expand/Collapse' })}
          </button>
        </div>
        {showAdvanced && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {advancedCapabilities.map((capability) => (
              <CapabilityCard
                key={capability.id}
                capability={capability}
                isSelected={selectedCapabilities.includes(capability.id)}
                onToggle={() => handleToggleCapability(capability.id)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Custom Action（自定义） */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-900">
            {t({ zh: '自定义操作', en: 'Custom Actions' })}
          </h3>
          <button
            onClick={() => setShowCustom(!showCustom)}
            className="text-sm text-blue-600 hover:text-blue-700"
          >
            {showCustom ? '▼' : '▶'} {t({ zh: '添加自定义', en: 'Add Custom' })}
          </button>
        </div>
        {showCustom && (
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                {t({ zh: 'OpenAPI Schema (JSON)', en: 'OpenAPI Schema (JSON)' })}
              </label>
              <textarea
                value={customApiSchema}
                onChange={(e) => setCustomApiSchema(e.target.value)}
                placeholder={t({
                  zh: '粘贴您的 OpenAPI Schema JSON，Agent 将自动连接您的系统',
                  en: 'Paste your OpenAPI Schema JSON, Agent will automatically connect to your system',
                })}
                className="w-full h-32 p-3 border border-gray-300 rounded-lg font-mono text-sm"
              />
            </div>
            <button
              onClick={handleAddCustomAction}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              {t({ zh: '添加自定义操作', en: 'Add Custom Action' })}
            </button>
          </div>
        )}
      </div>

      {/* 已选能力摘要 */}
      {selectedCapabilities.length > 0 && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-4">
          <p className="text-sm font-semibold text-green-800 mb-2">
            {t({ zh: '已选择', en: 'Selected' })}: {selectedCapabilities.length} {t({ zh: '个能力', en: 'capabilities' })}
          </p>
          <div className="flex flex-wrap gap-2">
            {selectedCapabilities.map((id) => {
              const cap = capabilities.find((c) => c.id === id);
              return cap ? (
                <span
                  key={id}
                  className="px-2 py-1 bg-green-100 text-green-800 rounded text-xs font-medium"
                >
                  {cap.name}
                </span>
              ) : null;
            })}
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * 能力卡片组件
 */
interface CapabilityCardProps {
  capability: Capability;
  isSelected: boolean;
  isRequired?: boolean;
  onToggle: () => void;
}

function CapabilityCard({ capability, isSelected, isRequired = false, onToggle }: CapabilityCardProps) {
  return (
    <div
      className={`border-2 rounded-xl p-4 cursor-pointer transition-all ${
        isSelected
          ? 'border-blue-500 bg-blue-50'
          : isRequired
          ? 'border-gray-300 bg-gray-50 opacity-75'
          : 'border-gray-200 bg-white hover:border-gray-300'
      }`}
      onClick={isRequired ? undefined : onToggle}
    >
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-2">
            {capability.icon && <span className="text-xl">{capability.icon}</span>}
            <h4 className="font-semibold text-gray-900">{capability.name}</h4>
            {isRequired && (
              <span className="text-xs text-gray-500 bg-gray-200 px-2 py-0.5 rounded">
                必选
              </span>
            )}
          </div>
          <p className="text-sm text-gray-600">{capability.description}</p>
        </div>
        <div className="ml-4">
          <input
            type="checkbox"
            checked={isSelected}
            onChange={onToggle}
            disabled={isRequired}
            className="w-5 h-5 text-blue-600 rounded focus:ring-blue-500"
          />
        </div>
      </div>
    </div>
  );
}

/**
 * 根据角色获取能力列表
 */
function getCapabilitiesByRole(role: AgentRole, t: (msg: any) => string): Capability[] {
  const commonCapabilities: Capability[] = [];

  if (role === 'user') {
    return [
      {
        id: 'search',
        name: t({ zh: 'AI 聚合搜索 / 比价', en: 'AI Aggregated Search / Price Comparison' }),
        description: t({
          zh: '语义搜索商品、跨平台比价、智能推荐',
          en: 'Semantic product search, cross-platform price comparison, smart recommendations',
        }),
        category: 'core',
        required: true,
        icon: '🔍',
      },
      {
        id: 'auto_pay',
        name: t({ zh: 'SmartPay / QuickPay', en: 'SmartPay / QuickPay' }),
        description: t({
          zh: '快速支付、自动选择最优支付方式',
          en: 'Quick payment, automatically select optimal payment method',
        }),
        category: 'core',
        required: true,
        icon: '💳',
      },
      {
        id: 'auto_task',
        name: t({ zh: '自动任务 / Auto-Earn', en: 'Auto Tasks / Auto-Earn' }),
        description: t({
          zh: '自动执行任务、捕获空投、收益优化',
          en: 'Automatically execute tasks, capture airdrops, optimize earnings',
        }),
        category: 'advanced',
        icon: '💰',
      },
      {
        id: 'workflow',
        name: t({ zh: '多步骤 Workflow', en: 'Multi-step Workflow' }),
        description: t({
          zh: '复杂业务流程编排、条件判断、循环执行',
          en: 'Complex business process orchestration, conditional logic, loop execution',
        }),
        category: 'advanced',
        icon: '🔄',
      },
      {
        id: 'bill_assistant',
        name: t({ zh: '账单助手', en: 'Bill Assistant' }),
        description: t({
          zh: '自动整理账单、费用分析、支出预测',
          en: 'Automatically organize bills, fee analysis, expense forecasting',
        }),
        category: 'advanced',
        icon: '📊',
      },
      {
        id: 'wallet_management',
        name: t({ zh: '钱包管理', en: 'Wallet Management' }),
        description: t({
          zh: '多链钱包统一管理、余额查询、转账',
          en: 'Unified multi-chain wallet management, balance query, transfers',
        }),
        category: 'advanced',
        icon: '👛',
      },
      {
        id: 'promotion',
        name: t({ zh: '推广能力', en: 'Promotion Capability' }),
        description: t({
          zh: '推广商户获得0.5%永久分佣、推荐Agent获得持续收益、推广Marketplace和插件获得分成',
          en: 'Promote merchants get 0.5% permanent commission, recommend Agents get continuous revenue, promote Marketplace and plugins get shares',
        }),
        category: 'advanced',
        icon: '🚀',
      },
    ];
  } else if (role === 'merchant') {
    return [
      {
        id: 'payment_collection',
        name: t({ zh: '收款管理', en: 'Payment Collection' }),
        description: t({
          zh: '自动生成支付链接、二维码、API Keys',
          en: 'Automatically generate payment links, QR codes, API keys',
        }),
        category: 'core',
        required: true,
        icon: '💰',
      },
      {
        id: 'order_management',
        name: t({ zh: '订单管理', en: 'Order Management' }),
        description: t({
          zh: '订单查询、状态更新、自动发货',
          en: 'Order query, status update, automatic fulfillment',
        }),
        category: 'core',
        required: true,
        icon: '📦',
      },
      {
        id: 'order_analysis',
        name: t({ zh: '订单分析', en: 'Order Analysis' }),
        description: t({
          zh: '销售可视化、渠道分析、用户洞察',
          en: 'Sales visualization, channel analysis, user insights',
        }),
        category: 'advanced',
        icon: '📊',
      },
      {
        id: 'risk_center',
        name: t({ zh: '风控中心', en: 'Risk Center' }),
        description: t({
          zh: '自动识别高风险付款、退款优化',
          en: 'Automatically identify high-risk payments, optimize refunds',
        }),
        category: 'advanced',
        icon: '🛡️',
      },
      {
        id: 'settlement',
        name: t({ zh: '清结算', en: 'Settlement' }),
        description: t({
          zh: '自动对账、结算规则配置、多币种结算',
          en: 'Automatic reconciliation, settlement rules, multi-currency settlement',
        }),
        category: 'advanced',
        icon: '💵',
      },
      {
        id: 'marketing',
        name: t({ zh: '营销助手', en: 'Marketing Assistant' }),
        description: t({
          zh: '营销活动管理、优惠券生成、用户画像',
          en: 'Marketing campaign management, coupon generation, user profiling',
        }),
        category: 'advanced',
        icon: '📢',
      },
    ];
  } else {
    // developer
    return [
      {
        id: 'sdk_generator',
        name: t({ zh: 'SDK生成器', en: 'SDK Generator' }),
        description: t({
          zh: '自动生成多语言 SDK：JS、Python、Swift、Flutter',
          en: 'Automatically generate multi-language SDKs: JS, Python, Swift, Flutter',
        }),
        category: 'core',
        required: true,
        icon: '🔧',
      },
      {
        id: 'api_assistant',
        name: t({ zh: 'API助手', en: 'API Assistant' }),
        description: t({
          zh: '自动阅读文档、生成调用代码、Mock Server',
          en: 'Automatically read docs, generate code, Mock Server',
        }),
        category: 'core',
        required: true,
        icon: '🔗',
      },
      {
        id: 'sandbox',
        name: t({ zh: '沙盒调试', en: 'Sandbox Debugging' }),
        description: t({
          zh: '自动构建、测试、模拟订单',
          en: 'Automatically build, test, simulate orders',
        }),
        category: 'advanced',
        icon: '🧪',
      },
      {
        id: 'devops',
        name: t({ zh: 'DevOps自动化', en: 'DevOps Automation' }),
        description: t({
          zh: 'CI/CD 集成、自动部署、监控告警',
          en: 'CI/CD integration, automatic deployment, monitoring alerts',
        }),
        category: 'advanced',
        icon: '⚙️',
      },
      {
        id: 'code_gen',
        name: t({ zh: '代码生成', en: 'Code Generation' }),
        description: t({
          zh: '根据需求自动生成代码、测试用例',
          en: 'Automatically generate code and test cases based on requirements',
        }),
        category: 'advanced',
        icon: '💻',
      },
    ];
  }
}

