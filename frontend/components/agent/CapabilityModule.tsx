import { AgentMode } from './UnifiedAgentChat';

interface CapabilityModuleProps {
  mode: AgentMode;
  capabilityId: string;
  onBack?: () => void;
}

/**
 * 功能模块详情展示组件
 * 根据角色和能力ID展示相应的功能界面
 */
export function CapabilityModule({ mode, capabilityId, onBack }: CapabilityModuleProps) {
  // 个人Agent功能模块
  const personalModules: Record<string, { title: string; description: string; icon: string; content: JSX.Element }> = {
    bill_assistant: {
      title: '账单助手',
      description: '自动整理账单、解释费用、预测支出',
      icon: '📊',
      content: (
        <div className="space-y-6">
          <div className="bg-blue-50 rounded-lg p-4 border border-blue-200">
            <h3 className="font-semibold text-blue-900 mb-2">功能说明</h3>
            <ul className="text-sm text-blue-800 space-y-1 list-disc list-inside">
              <li>自动整理和分类您的所有账单</li>
              <li>智能解释每笔费用的来源和用途</li>
              <li>基于历史数据预测未来支出</li>
              <li>提供预算建议和优化方案</li>
            </ul>
          </div>
          <div className="bg-white rounded-lg p-4 border border-gray-200">
            <p className="text-sm text-gray-600">
              请在对话中询问：&quot;帮我整理一下这个月的账单&quot; 或 &quot;分析一下我的支出情况&quot;
            </p>
          </div>
        </div>
      ),
    },
    payment_assistant: {
      title: '支付助手',
      description: '快速支付、验证真实商户、比价、自动退单',
      icon: '💳',
      content: (
        <div className="space-y-6">
          <div className="bg-green-50 rounded-lg p-4 border border-green-200">
            <h3 className="font-semibold text-green-900 mb-2">功能说明</h3>
            <ul className="text-sm text-green-800 space-y-1 list-disc list-inside">
              <li>快速完成支付，自动选择最优支付方式</li>
              <li>验证商户真实性，防止诈骗</li>
              <li>自动比价，找到最优惠的价格</li>
              <li>异常交易自动退单保护</li>
            </ul>
          </div>
        </div>
      ),
    },
    wallet_management: {
      title: '钱包管理',
      description: '多链钱包、法币钱包统一管理',
      icon: '👛',
      content: (
        <div className="space-y-6">
          <div className="bg-purple-50 rounded-lg p-4 border border-purple-200">
            <h3 className="font-semibold text-purple-900 mb-2">功能说明</h3>
            <ul className="text-sm text-purple-800 space-y-1 list-disc list-inside">
              <li>统一管理多链钱包（Ethereum、Polygon、BSC等）</li>
              <li>法币钱包和加密钱包一体化</li>
              <li>实时查看资产余额和交易记录</li>
              <li>一键切换支付方式</li>
            </ul>
          </div>
        </div>
      ),
    },
    risk_alert: {
      title: '风控提醒',
      description: '异常交易提醒、诈骗识别',
      icon: '🛡️',
      content: (
        <div className="space-y-6">
          <div className="bg-red-50 rounded-lg p-4 border border-red-200">
            <h3 className="font-semibold text-red-900 mb-2">功能说明</h3>
            <ul className="text-sm text-red-800 space-y-1 list-disc list-inside">
              <li>实时监控异常交易行为</li>
              <li>智能识别潜在诈骗风险</li>
              <li>及时发送安全提醒</li>
              <li>自动冻结可疑账户</li>
            </ul>
          </div>
        </div>
      ),
    },
    auto_purchase: {
      title: '自动购买',
      description: '自动续费、自动订阅优化',
      icon: '🤖',
      content: (
        <div className="space-y-6">
          <div className="bg-yellow-50 rounded-lg p-4 border border-yellow-200">
            <h3 className="font-semibold text-yellow-900 mb-2">功能说明</h3>
            <ul className="text-sm text-yellow-800 space-y-1 list-disc list-inside">
              <li>自动续费订阅服务</li>
              <li>智能优化订阅组合，节省费用</li>
              <li>自动取消不必要的订阅</li>
              <li>订阅到期提醒</li>
            </ul>
          </div>
        </div>
      ),
    },
  };

  // 商家Agent功能模块
  const merchantModules: Record<string, { title: string; description: string; icon: string; content: JSX.Element }> = {
    payment_collection: {
      title: '收款管理',
      description: '自动生成支付链接、二维码、API Keys',
      icon: '💰',
      content: (
        <div className="space-y-6">
          <div className="bg-blue-50 rounded-lg p-4 border border-blue-200">
            <h3 className="font-semibold text-blue-900 mb-2">功能说明</h3>
            <ul className="text-sm text-blue-800 space-y-1 list-disc list-inside">
              <li>一键生成支付链接和二维码</li>
              <li>管理API密钥和Webhook配置</li>
              <li>支持多币种收款（法币 + Crypto）</li>
              <li>收款状态实时跟踪</li>
            </ul>
          </div>
        </div>
      ),
    },
    order_analysis: {
      title: '订单分析',
      description: '销售可视化、渠道分析、用户洞察',
      icon: '📊',
      content: (
        <div className="space-y-6">
          <div className="bg-green-50 rounded-lg p-4 border border-green-200">
            <h3 className="font-semibold text-green-900 mb-2">功能说明</h3>
            <ul className="text-sm text-green-800 space-y-1 list-disc list-inside">
              <li>销售数据可视化分析</li>
              <li>渠道效果对比和优化建议</li>
              <li>用户行为洞察和画像分析</li>
              <li>预测性分析和趋势报告</li>
            </ul>
          </div>
        </div>
      ),
    },
    risk_center: {
      title: '风控中心',
      description: '自动识别高风险付款、退款优化',
      icon: '🛡️',
      content: (
        <div className="space-y-6">
          <div className="bg-red-50 rounded-lg p-4 border border-red-200">
            <h3 className="font-semibold text-red-900 mb-2">功能说明</h3>
            <ul className="text-sm text-red-800 space-y-1 list-disc list-inside">
              <li>自动识别高风险付款订单</li>
              <li>智能退款策略优化</li>
              <li>欺诈检测和预防</li>
              <li>风控规则自定义配置</li>
            </ul>
          </div>
        </div>
      ),
    },
    settlement: {
      title: '清结算',
      description: '自动对账、生成税务报表、发票自动化',
      icon: '💵',
      content: (
        <div className="space-y-6">
          <div className="bg-purple-50 rounded-lg p-4 border border-purple-200">
            <h3 className="font-semibold text-purple-900 mb-2">功能说明</h3>
            <ul className="text-sm text-purple-800 space-y-1 list-disc list-inside">
              <li>自动对账，减少人工错误</li>
              <li>一键生成税务报表</li>
              <li>发票自动生成和发送</li>
              <li>多币种结算和汇率管理</li>
            </ul>
          </div>
        </div>
      ),
    },
    marketing_assistant: {
      title: '营销助手',
      description: 'A/B测试、行为触达、自动发优惠券',
      icon: '📢',
      content: (
        <div className="space-y-6">
          <div className="bg-yellow-50 rounded-lg p-4 border border-yellow-200">
            <h3 className="font-semibold text-yellow-900 mb-2">功能说明</h3>
            <ul className="text-sm text-yellow-800 space-y-1 list-disc list-inside">
              <li>自动A/B测试营销策略</li>
              <li>基于用户行为精准触达</li>
              <li>智能发放优惠券和促销活动</li>
              <li>营销效果分析和优化建议</li>
            </ul>
          </div>
        </div>
      ),
    },
    compliance: {
      title: '商户合规',
      description: 'KYC/KYB、国际支付合规建议',
      icon: '✅',
      content: (
        <div className="space-y-6">
          <div className="bg-indigo-50 rounded-lg p-4 border border-indigo-200">
            <h3 className="font-semibold text-indigo-900 mb-2">功能说明</h3>
            <ul className="text-sm text-indigo-800 space-y-1 list-disc list-inside">
              <li>KYC/KYB身份验证管理</li>
              <li>国际支付合规性检查</li>
              <li>合规报告自动生成</li>
              <li>法规更新提醒和建议</li>
            </ul>
          </div>
        </div>
      ),
    },
  };

  // 开发者Agent功能模块
  const developerModules: Record<string, { title: string; description: string; icon: string; content: JSX.Element }> = {
    sdk_generator: {
      title: 'SDK 生成器',
      description: '自动生成多语言 SDK：JS、Python、Swift、Flutter',
      icon: '🔧',
      content: (
        <div className="space-y-6">
          <div className="bg-blue-50 rounded-lg p-4 border border-blue-200">
            <h3 className="font-semibold text-blue-900 mb-2">功能说明</h3>
            <ul className="text-sm text-blue-800 space-y-1 list-disc list-inside">
              <li>支持多种编程语言（JS、Python、Swift、Flutter等）</li>
              <li>一键生成完整的SDK代码</li>
              <li>自动生成文档和示例代码</li>
              <li>版本管理和更新通知</li>
            </ul>
          </div>
        </div>
      ),
    },
    api_assistant: {
      title: 'API 助手',
      description: '自动阅读文档、生成调用代码、Mock Server',
      icon: '🔗',
      content: (
        <div className="space-y-6">
          <div className="bg-green-50 rounded-lg p-4 border border-green-200">
            <h3 className="font-semibold text-green-900 mb-2">功能说明</h3>
            <ul className="text-sm text-green-800 space-y-1 list-disc list-inside">
              <li>智能阅读和理解API文档</li>
              <li>自动生成调用代码示例</li>
              <li>创建Mock Server用于测试</li>
              <li>API调用调试和错误诊断</li>
            </ul>
          </div>
        </div>
      ),
    },
    devops: {
      title: 'DevOps 自动化',
      description: '部署 Webhook、签名验证、CI/CD 集成',
      icon: '⚙️',
      content: (
        <div className="space-y-6">
          <div className="bg-purple-50 rounded-lg p-4 border border-purple-200">
            <h3 className="font-semibold text-purple-900 mb-2">功能说明</h3>
            <ul className="text-sm text-purple-800 space-y-1 list-disc list-inside">
              <li>自动部署和配置Webhook</li>
              <li>签名验证和安全配置</li>
              <li>CI/CD流程集成</li>
              <li>自动化测试和部署</li>
            </ul>
          </div>
        </div>
      ),
    },
    contract_helper: {
      title: '合约助手（Web3）',
      description: '合约模板生成、交易模拟、费用估算',
      icon: '📜',
      content: (
        <div className="space-y-6">
          <div className="bg-yellow-50 rounded-lg p-4 border border-yellow-200">
            <h3 className="font-semibold text-yellow-900 mb-2">功能说明</h3>
            <ul className="text-sm text-yellow-800 space-y-1 list-disc list-inside">
              <li>智能合约模板生成</li>
              <li>交易模拟和测试</li>
              <li>Gas费用估算和优化</li>
              <li>合约安全审计建议</li>
            </ul>
          </div>
        </div>
      ),
    },
    logs: {
      title: '工单与日志',
      description: '自动分析错误日志、调试支付失败',
      icon: '📋',
      content: (
        <div className="space-y-6">
          <div className="bg-red-50 rounded-lg p-4 border border-red-200">
            <h3 className="font-semibold text-red-900 mb-2">功能说明</h3>
            <ul className="text-sm text-red-800 space-y-1 list-disc list-inside">
              <li>自动分析和分类错误日志</li>
              <li>支付失败原因诊断</li>
              <li>性能监控和优化建议</li>
              <li>工单自动生成和处理</li>
            </ul>
          </div>
        </div>
      ),
    },
  };

  const moduleMap: Record<AgentMode, Record<string, any>> = {
    user: personalModules,
    merchant: merchantModules,
    developer: developerModules,
    shopping: personalModules, // 暂时复用个人及模块
    expert: personalModules,
    data: personalModules,
  };

  const capabilityModule = moduleMap[mode]?.[capabilityId];

  if (!capabilityModule) {
    return (
      <div className="h-full flex items-center justify-center bg-white">
        <div className="text-center">
          <p className="text-gray-500 mb-4">功能模块未找到</p>
          {onBack && (
            <button
              onClick={onBack}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              返回
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto bg-white p-6">
      <div className="max-w-4xl mx-auto">
        {/* 头部 */}
        <div className="mb-6">
          {onBack && (
            <button
              onClick={onBack}
              className="mb-4 text-sm text-gray-600 hover:text-gray-900 flex items-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
              返回
            </button>
          )}
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 bg-gradient-to-br from-blue-500 to-purple-600 rounded-2xl flex items-center justify-center text-3xl shadow-lg">
              {capabilityModule.icon}
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">{capabilityModule.title}</h1>
              <p className="text-gray-600 mt-1">{capabilityModule.description}</p>
            </div>
          </div>
        </div>

        {/* 内容 */}
        <div className="mt-6">{capabilityModule.content}</div>

        {/* 使用提示 */}
        <div className="mt-8 bg-gray-50 rounded-lg p-4 border border-gray-200">
          <h3 className="font-semibold text-gray-900 mb-2">💡 使用提示</h3>
          <p className="text-sm text-gray-600">
            您可以在对话中直接使用这些功能。切换到对话模式，告诉Agent您想要执行的操作即可。
          </p>
        </div>
      </div>
    </div>
  );
}

