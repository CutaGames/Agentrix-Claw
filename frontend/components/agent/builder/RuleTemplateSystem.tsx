import { useState, useMemo } from 'react';
import { useLocalization } from '../../../contexts/LocalizationContext';
import { useToast } from '../../../contexts/ToastContext';

export interface RuleTemplate {
  id: string;
  name: string;
  description: string;
  category: 'payment' | 'order' | 'risk' | 'notification' | 'custom';
  rule: {
    condition: string; // 自然语言描述
    action: string; // 执行的操作
    params?: Record<string, any>;
  };
  example?: string;
}

interface RuleTemplateSystemProps {
  role: 'user' | 'merchant' | 'developer';
  selectedRules: RuleTemplate[];
  onRulesChange: (rules: RuleTemplate[]) => void;
  onRuleTest?: (rule: RuleTemplate) => Promise<boolean>;
}

/**
 * 规则模板系统组件
 * 提供预设规则模板、自然语言编辑、规则验证和测试
 */
export function RuleTemplateSystem({
  role,
  selectedRules,
  onRulesChange,
  onRuleTest,
}: RuleTemplateSystemProps) {
  const { t } = useLocalization();
  const { success, error } = useToast();
  const [activeTab, setActiveTab] = useState<'templates' | 'custom' | 'test'>('templates');
  const [editingRule, setEditingRule] = useState<RuleTemplate | null>(null);
  const [naturalLanguage, setNaturalLanguage] = useState('');
  const [testingRule, setTestingRule] = useState<RuleTemplate | null>(null);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);

  // 根据角色获取预设规则模板
  const ruleTemplates = useMemo(() => getRuleTemplatesByRole(role, t), [role, t]);

  const handleSelectTemplate = (template: RuleTemplate) => {
    if (selectedRules.find((r) => r.id === template.id)) {
      error(t({ zh: '该规则已添加', en: 'Rule already added' }));
      return;
    }
    onRulesChange([...selectedRules, template]);
    success(t({ zh: '规则已添加', en: 'Rule added' }));
  };

  const handleRemoveRule = (ruleId: string) => {
    onRulesChange(selectedRules.filter((r) => r.id !== ruleId));
    success(t({ zh: '规则已移除', en: 'Rule removed' }));
  };

  const handleGenerateFromNaturalLanguage = async () => {
    if (!naturalLanguage.trim()) {
      error(t({ zh: '请输入规则描述', en: 'Please enter rule description' }));
      return;
    }

    try {
      // 调用后端 API 将自然语言转换为规则
      // 这里先使用模拟逻辑
      const generatedRule: RuleTemplate = {
        id: `custom_${Date.now()}`,
        name: t({ zh: '自定义规则', en: 'Custom Rule' }),
        description: naturalLanguage,
        category: 'custom',
        rule: {
          condition: naturalLanguage,
          action: 'execute',
          params: {},
        },
      };

      onRulesChange([...selectedRules, generatedRule]);
      setNaturalLanguage('');
      success(t({ zh: '规则已生成', en: 'Rule generated' }));
    } catch (err: any) {
      error(err.message || t({ zh: '规则生成失败', en: 'Failed to generate rule' }));
    }
  };

  const handleTestRule = async (rule: RuleTemplate) => {
    setTestingRule(rule);
    setTestResult(null);

    try {
      if (onRuleTest) {
        const result = await onRuleTest(rule);
        setTestResult({
          success: result,
          message: result
            ? t({ zh: '规则验证通过', en: 'Rule validation passed' })
            : t({ zh: '规则验证失败', en: 'Rule validation failed' }),
        });
      } else {
        // 模拟测试
        await new Promise((resolve) => setTimeout(resolve, 1000));
        setTestResult({
          success: true,
          message: t({ zh: '规则验证通过（模拟）', en: 'Rule validation passed (simulated)' }),
        });
      }
    } catch (err: any) {
      setTestResult({
        success: false,
        message: err.message || t({ zh: '测试失败', en: 'Test failed' }),
      });
    }
  };

  return (
    <div className="space-y-6">
      {/* 标签页 */}
      <div className="border-b border-gray-200">
        <nav className="flex space-x-4">
          <button
            onClick={() => setActiveTab('templates')}
            className={`py-2 px-4 border-b-2 font-medium text-sm ${
              activeTab === 'templates'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {t({ zh: '规则模板', en: 'Rule Templates' })}
          </button>
          <button
            onClick={() => setActiveTab('custom')}
            className={`py-2 px-4 border-b-2 font-medium text-sm ${
              activeTab === 'custom'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {t({ zh: '自定义规则', en: 'Custom Rules' })}
          </button>
          <button
            onClick={() => setActiveTab('test')}
            className={`py-2 px-4 border-b-2 font-medium text-sm ${
              activeTab === 'test'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {t({ zh: '规则测试', en: 'Rule Testing' })}
          </button>
        </nav>
      </div>

      {/* 规则模板列表 */}
      {activeTab === 'templates' && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {ruleTemplates.map((template) => (
              <div
                key={template.id}
                className="border border-gray-200 rounded-lg p-4 hover:border-blue-300 transition-colors"
              >
                <div className="flex items-start justify-between mb-2">
                  <div className="flex-1">
                    <h4 className="font-semibold text-gray-900 mb-1">{template.name}</h4>
                    <p className="text-sm text-gray-600 mb-2">{template.description}</p>
                    {template.example && (
                      <div className="bg-gray-50 rounded p-2 text-xs text-gray-700 font-mono mb-2">
                        {template.example}
                      </div>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleSelectTemplate(template)}
                    disabled={selectedRules.find((r) => r.id === template.id) !== undefined}
                    className="px-3 py-1 bg-blue-600 text-white rounded text-sm hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {selectedRules.find((r) => r.id === template.id)
                      ? t({ zh: '已添加', en: 'Added' })
                      : t({ zh: '添加规则', en: 'Add Rule' })}
                  </button>
                  <button
                    onClick={() => handleTestRule(template)}
                    className="px-3 py-1 border border-gray-300 rounded text-sm hover:bg-gray-50"
                  >
                    {t({ zh: '测试', en: 'Test' })}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 自定义规则 */}
      {activeTab === 'custom' && (
        <div className="space-y-4">
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <p className="text-sm text-blue-800 mb-2">
              {t({
                zh: '💡 使用自然语言描述您的业务规则，系统将自动转换为可执行的规则。',
                en: '💡 Describe your business rules in natural language, and the system will automatically convert them into executable rules.',
              })}
            </p>
            <div className="space-y-3">
              <textarea
                value={naturalLanguage}
                onChange={(e) => setNaturalLanguage(e.target.value)}
                placeholder={t({
                  zh: '例如：当收到大于 $1000 的订单时，调用"风控检查"插件',
                  en: 'e.g., When an order greater than $1000 is received, call the "Risk Check" plugin',
                })}
                className="w-full h-24 p-3 border border-gray-300 rounded-lg text-sm"
              />
              <button
                onClick={handleGenerateFromNaturalLanguage}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                {t({ zh: '生成规则', en: 'Generate Rule' })}
              </button>
            </div>
          </div>

          {/* 已选规则列表 */}
          {selectedRules.length > 0 && (
            <div>
              <h4 className="font-semibold text-gray-900 mb-3">
                {t({ zh: '已选规则', en: 'Selected Rules' })} ({selectedRules.length})
              </h4>
              <div className="space-y-2">
                {selectedRules.map((rule) => (
                  <div
                    key={rule.id}
                    className="border border-gray-200 rounded-lg p-3 flex items-center justify-between"
                  >
                    <div className="flex-1">
                      <div className="font-medium text-gray-900">{rule.name}</div>
                      <div className="text-sm text-gray-600">{rule.description}</div>
                      <div className="text-xs text-gray-500 mt-1">
                        {t({ zh: '条件', en: 'Condition' })}: {rule.rule.condition}
                      </div>
                    </div>
                    <button
                      onClick={() => handleRemoveRule(rule.id)}
                      className="ml-4 text-red-600 hover:text-red-700 text-sm"
                    >
                      {t({ zh: '移除', en: 'Remove' })}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* 规则测试 */}
      {activeTab === 'test' && (
        <div className="space-y-4">
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
            <h4 className="font-semibold text-gray-900 mb-3">
              {t({ zh: '规则验证和测试', en: 'Rule Validation & Testing' })}
            </h4>
            <div className="space-y-3">
              {selectedRules.length === 0 ? (
                <p className="text-sm text-gray-600">
                  {t({ zh: '请先添加规则', en: 'Please add rules first' })}
                </p>
              ) : (
                selectedRules.map((rule) => (
                  <div
                    key={rule.id}
                    className="border border-gray-200 rounded-lg p-3 bg-white"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div>
                        <div className="font-medium text-gray-900">{rule.name}</div>
                        <div className="text-sm text-gray-600">{rule.rule.condition}</div>
                      </div>
                      <button
                        onClick={() => handleTestRule(rule)}
                        disabled={testingRule?.id === rule.id}
                        className="px-3 py-1 bg-green-600 text-white rounded text-sm hover:bg-green-700 disabled:opacity-50"
                      >
                        {testingRule?.id === rule.id
                          ? t({ zh: '测试中...', en: 'Testing...' })
                          : t({ zh: '测试规则', en: 'Test Rule' })}
                      </button>
                    </div>
                    {testingRule?.id === rule.id && testResult && (
                      <div
                        className={`mt-2 p-2 rounded text-sm ${
                          testResult.success
                            ? 'bg-green-50 text-green-800'
                            : 'bg-red-50 text-red-800'
                        }`}
                      >
                        {testResult.message}
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * 根据角色获取预设规则模板
 */
function getRuleTemplatesByRole(
  role: 'user' | 'merchant' | 'developer',
  t: (msg: any) => string
): RuleTemplate[] {
  if (role === 'user') {
    return [
      {
        id: 'user_payment_limit',
        name: t({ zh: '支付限额规则', en: 'Payment Limit Rule' }),
        description: t({
          zh: '当支付金额超过设定阈值时，需要额外确认',
          en: 'When payment amount exceeds the set threshold, additional confirmation is required',
        }),
        category: 'payment',
        rule: {
          condition: 'amount > threshold',
          action: 'require_confirmation',
          params: { threshold: 1000 },
        },
        example: t({
          zh: '当订单金额 > $1000 时，发送确认通知',
          en: 'When order amount > $1000, send confirmation notification',
        }),
      },
      {
        id: 'user_auto_refund',
        name: t({ zh: '自动退款规则', en: 'Auto Refund Rule' }),
        description: t({
          zh: '当订单取消或失败时，自动发起退款',
          en: 'Automatically initiate refund when order is cancelled or failed',
        }),
        category: 'order',
        rule: {
          condition: 'order.status === "cancelled" || order.status === "failed"',
          action: 'auto_refund',
        },
        example: t({
          zh: '订单状态为"已取消"或"失败"时，自动退款',
          en: 'When order status is "cancelled" or "failed", auto refund',
        }),
      },
    ];
  } else if (role === 'merchant') {
    return [
      {
        id: 'merchant_risk_check',
        name: t({ zh: '风控检查规则', en: 'Risk Check Rule' }),
        description: t({
          zh: '当收到大于 $1000 的订单时，调用风控检查',
          en: 'When an order greater than $1000 is received, call risk check',
        }),
        category: 'risk',
        rule: {
          condition: 'order.amount > 1000',
          action: 'risk_check',
          params: { threshold: 1000 },
        },
        example: t({
          zh: '订单金额 > $1000 时，触发风控检查',
          en: 'When order amount > $1000, trigger risk check',
        }),
      },
      {
        id: 'merchant_auto_fulfill',
        name: t({ zh: '自动发货规则', en: 'Auto Fulfillment Rule' }),
        description: t({
          zh: '当订单支付成功且为虚拟商品时，自动发货',
          en: 'When order payment succeeds and product is virtual, auto fulfill',
        }),
        category: 'order',
        rule: {
          condition: 'payment.status === "completed" && product.type === "virtual"',
          action: 'auto_fulfill',
        },
        example: t({
          zh: '支付成功 + 虚拟商品 → 自动发货',
          en: 'Payment success + Virtual product → Auto fulfill',
        }),
      },
      {
        id: 'merchant_settlement_alert',
        name: t({ zh: '结算提醒规则', en: 'Settlement Alert Rule' }),
        description: t({
          zh: '当待结算金额超过阈值时，发送提醒通知',
          en: 'When pending settlement amount exceeds threshold, send alert notification',
        }),
        category: 'notification',
        rule: {
          condition: 'pending_settlement > threshold',
          action: 'send_notification',
          params: { threshold: 10000 },
        },
        example: t({
          zh: '待结算金额 > $10000 时，发送提醒',
          en: 'When pending settlement > $10000, send alert',
        }),
      },
    ];
  } else {
    // developer
    return [
      {
        id: 'dev_api_rate_limit',
        name: t({ zh: 'API 限流规则', en: 'API Rate Limit Rule' }),
        description: t({
          zh: '当 API 调用频率超过限制时，返回限流错误',
          en: 'When API call frequency exceeds limit, return rate limit error',
        }),
        category: 'custom',
        rule: {
          condition: 'api_calls_per_minute > limit',
          action: 'rate_limit',
          params: { limit: 100 },
        },
        example: t({
          zh: 'API 调用频率 > 100次/分钟时，触发限流',
          en: 'When API calls > 100/min, trigger rate limit',
        }),
      },
    ];
  }
}

