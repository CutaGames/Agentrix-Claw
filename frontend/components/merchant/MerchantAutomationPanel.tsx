import { useState, useEffect } from 'react';
import { merchantApi, AutoOrderConfig, AICustomerServiceConfig, AutoMarketingConfig } from '../../lib/api/merchant.api';
import { useToast } from '../../contexts/ToastContext';

export function MerchantAutomationPanel() {
  const { success, error } = useToast();
  const [activeTab, setActiveTab] = useState<'order' | 'customer' | 'marketing'>('order');
  const [loading, setLoading] = useState(false);

  // 自动接单配置
  const [autoOrderConfig, setAutoOrderConfig] = useState<Partial<AutoOrderConfig>>({
    enabled: false,
    autoAcceptThreshold: 1000,
    aiDecisionEnabled: true,
    workingHours: { start: '09:00', end: '18:00' },
  });

  // AI客服配置
  const [aiCustomerConfig, setAiCustomerConfig] = useState<Partial<AICustomerServiceConfig>>({
    enabled: false,
    language: 'zh-CN',
    tone: 'friendly',
    autoReplyEnabled: true,
    workingHours: { start: '09:00', end: '18:00' },
  });

  // 自动营销配置
  const [autoMarketingConfig, setAutoMarketingConfig] = useState<Partial<AutoMarketingConfig>>({
    enabled: false,
    strategies: {
      abandonedCart: { enabled: false, delayHours: 24, discountPercent: 10 },
      newCustomer: { enabled: false, welcomeDiscount: 15 },
      repeatCustomer: { enabled: false, loyaltyReward: 0 },
      lowStock: { enabled: false, threshold: 10 },
      priceDrop: { enabled: false, dropPercent: 10 },
    },
  });

  useEffect(() => {
    loadConfigs();
  }, []);

  const loadConfigs = async () => {
    try {
      setLoading(true);
      const [orderConfig, customerConfig, marketingConfig] = await Promise.all([
        merchantApi.getAutoOrderConfig(),
        merchantApi.getAICustomerConfig(),
        merchantApi.getAutoMarketingConfig(),
      ]);
      if (orderConfig) setAutoOrderConfig(orderConfig);
      if (customerConfig) setAiCustomerConfig(customerConfig);
      if (marketingConfig) setAutoMarketingConfig(marketingConfig);
    } catch (err: any) {
      error(err.message || '加载配置失败');
    } finally {
      setLoading(false);
    }
  };

  const saveAutoOrderConfig = async () => {
    try {
      setLoading(true);
      await merchantApi.configureAutoOrder(autoOrderConfig);
      success('自动接单配置已保存');
    } catch (err: any) {
      error(err.message || '保存配置失败');
    } finally {
      setLoading(false);
    }
  };

  const saveAICustomerConfig = async () => {
    try {
      setLoading(true);
      await merchantApi.configureAICustomer(aiCustomerConfig);
      success('AI客服配置已保存');
    } catch (err: any) {
      error(err.message || '保存配置失败');
    } finally {
      setLoading(false);
    }
  };

  const saveAutoMarketingConfig = async () => {
    try {
      setLoading(true);
      await merchantApi.configureAutoMarketing(autoMarketingConfig);
      success('自动营销配置已保存');
    } catch (err: any) {
      error(err.message || '保存配置失败');
    } finally {
      setLoading(false);
    }
  };

  const triggerMarketingCampaigns = async () => {
    try {
      setLoading(true);
      const result = await merchantApi.triggerMarketingCampaigns();
      success(`已触发 ${result.campaigns.length} 个营销活动`);
    } catch (err: any) {
      error(err.message || '触发营销活动失败');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">商户自动化</h3>
      </div>

      {/* 标签页 */}
      <div className="flex space-x-2 border-b">
        <button
          onClick={() => setActiveTab('order')}
          className={`px-4 py-2 ${
            activeTab === 'order'
              ? 'border-b-2 border-blue-500 text-blue-600'
              : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          自动接单
        </button>
        <button
          onClick={() => setActiveTab('customer')}
          className={`px-4 py-2 ${
            activeTab === 'customer'
              ? 'border-b-2 border-blue-500 text-blue-600'
              : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          AI客服
        </button>
        <button
          onClick={() => setActiveTab('marketing')}
          className={`px-4 py-2 ${
            activeTab === 'marketing'
              ? 'border-b-2 border-blue-500 text-blue-600'
              : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          自动营销
        </button>
      </div>

      {/* 自动接单配置 */}
      {activeTab === 'order' && (
        <div className="space-y-4 p-4 border rounded-lg">
          <div className="flex items-center justify-between">
            <label className="flex items-center space-x-2">
              <input
                type="checkbox"
                checked={autoOrderConfig.enabled}
                onChange={(e) => setAutoOrderConfig({ ...autoOrderConfig, enabled: e.target.checked })}
                className="w-4 h-4"
              />
              <span className="font-medium">启用自动接单</span>
            </label>
          </div>

          {autoOrderConfig.enabled && (
            <div className="space-y-4 pl-6 border-l-2 border-gray-200">
              <div>
                <label className="block text-sm font-medium mb-2">自动接受金额阈值 (USDC)</label>
                <input
                  type="number"
                  value={autoOrderConfig.autoAcceptThreshold || 1000}
                  onChange={(e) =>
                    setAutoOrderConfig({
                      ...autoOrderConfig,
                      autoAcceptThreshold: parseFloat(e.target.value),
                    })
                  }
                  className="w-full border rounded-lg px-3 py-2"
                />
              </div>

              <div className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  checked={autoOrderConfig.aiDecisionEnabled}
                  onChange={(e) =>
                    setAutoOrderConfig({ ...autoOrderConfig, aiDecisionEnabled: e.target.checked })
                  }
                  className="w-4 h-4"
                />
                <span className="text-sm">启用AI决策</span>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-2">工作时间开始</label>
                  <input
                    type="time"
                    value={autoOrderConfig.workingHours?.start || '09:00'}
                    onChange={(e) =>
                      setAutoOrderConfig({
                        ...autoOrderConfig,
                        workingHours: {
                          ...autoOrderConfig.workingHours,
                          start: e.target.value,
                          end: autoOrderConfig.workingHours?.end || '18:00',
                        },
                      })
                    }
                    className="w-full border rounded-lg px-3 py-2"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">工作时间结束</label>
                  <input
                    type="time"
                    value={autoOrderConfig.workingHours?.end || '18:00'}
                    onChange={(e) =>
                      setAutoOrderConfig({
                        ...autoOrderConfig,
                        workingHours: {
                          ...autoOrderConfig.workingHours,
                          start: autoOrderConfig.workingHours?.start || '09:00',
                          end: e.target.value,
                        },
                      })
                    }
                    className="w-full border rounded-lg px-3 py-2"
                  />
                </div>
              </div>

              <button
                onClick={saveAutoOrderConfig}
                disabled={loading}
                className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50"
              >
                保存配置
              </button>
            </div>
          )}
        </div>
      )}

      {/* AI客服配置 */}
      {activeTab === 'customer' && (
        <div className="space-y-4 p-4 border rounded-lg">
          <div className="flex items-center justify-between">
            <label className="flex items-center space-x-2">
              <input
                type="checkbox"
                checked={aiCustomerConfig.enabled}
                onChange={(e) => setAiCustomerConfig({ ...aiCustomerConfig, enabled: e.target.checked })}
                className="w-4 h-4"
              />
              <span className="font-medium">启用AI客服</span>
            </label>
          </div>

          {aiCustomerConfig.enabled && (
            <div className="space-y-4 pl-6 border-l-2 border-gray-200">
              <div>
                <label className="block text-sm font-medium mb-2">语言</label>
                <select
                  value={aiCustomerConfig.language}
                  onChange={(e) => setAiCustomerConfig({ ...aiCustomerConfig, language: e.target.value })}
                  className="w-full border rounded-lg px-3 py-2"
                >
                  <option value="zh-CN">中文</option>
                  <option value="en-US">English</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">语调</label>
                <select
                  value={aiCustomerConfig.tone}
                  onChange={(e) =>
                    setAiCustomerConfig({
                      ...aiCustomerConfig,
                      tone: e.target.value as 'professional' | 'friendly' | 'casual',
                    })
                  }
                  className="w-full border rounded-lg px-3 py-2"
                >
                  <option value="professional">专业</option>
                  <option value="friendly">友好</option>
                  <option value="casual">随意</option>
                </select>
              </div>

              <div className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  checked={aiCustomerConfig.autoReplyEnabled}
                  onChange={(e) =>
                    setAiCustomerConfig({ ...aiCustomerConfig, autoReplyEnabled: e.target.checked })
                  }
                  className="w-4 h-4"
                />
                <span className="text-sm">自动回复</span>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-2">工作时间开始</label>
                  <input
                    type="time"
                    value={aiCustomerConfig.workingHours?.start || '09:00'}
                    onChange={(e) =>
                      setAiCustomerConfig({
                        ...aiCustomerConfig,
                        workingHours: {
                          ...aiCustomerConfig.workingHours,
                          start: e.target.value,
                          end: aiCustomerConfig.workingHours?.end || '18:00',
                        },
                      })
                    }
                    className="w-full border rounded-lg px-3 py-2"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">工作时间结束</label>
                  <input
                    type="time"
                    value={aiCustomerConfig.workingHours?.end || '18:00'}
                    onChange={(e) =>
                      setAiCustomerConfig({
                        ...aiCustomerConfig,
                        workingHours: {
                          ...aiCustomerConfig.workingHours,
                          start: aiCustomerConfig.workingHours?.start || '09:00',
                          end: e.target.value,
                        },
                      })
                    }
                    className="w-full border rounded-lg px-3 py-2"
                  />
                </div>
              </div>

              <button
                onClick={saveAICustomerConfig}
                disabled={loading}
                className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50"
              >
                保存配置
              </button>
            </div>
          )}
        </div>
      )}

      {/* 自动营销配置 */}
      {activeTab === 'marketing' && (
        <div className="space-y-4 p-4 border rounded-lg">
          <div className="flex items-center justify-between">
            <label className="flex items-center space-x-2">
              <input
                type="checkbox"
                checked={autoMarketingConfig.enabled}
                onChange={(e) =>
                  setAutoMarketingConfig({ ...autoMarketingConfig, enabled: e.target.checked })
                }
                className="w-4 h-4"
              />
              <span className="font-medium">启用自动营销</span>
            </label>
            <button
              onClick={triggerMarketingCampaigns}
              disabled={loading}
              className="px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 disabled:opacity-50"
            >
              触发营销活动
            </button>
          </div>

          {autoMarketingConfig.enabled && (
            <div className="space-y-4 pl-6 border-l-2 border-gray-200">
              {/* 废弃购物车 */}
              <div className="border rounded-lg p-4">
                <label className="flex items-center space-x-2 mb-3">
                  <input
                    type="checkbox"
                    checked={autoMarketingConfig.strategies?.abandonedCart?.enabled}
                    onChange={(e) =>
                      setAutoMarketingConfig({
                        ...autoMarketingConfig,
                        strategies: {
                          ...autoMarketingConfig.strategies,
                          abandonedCart: {
                            enabled: e.target.checked,
                            delayHours: autoMarketingConfig.strategies?.abandonedCart?.delayHours || 24,
                            discountPercent: autoMarketingConfig.strategies?.abandonedCart?.discountPercent || 10,
                          },
                        },
                      })
                    }
                    className="w-4 h-4"
                  />
                  <span className="font-medium">废弃购物车提醒</span>
                </label>
                {autoMarketingConfig.strategies?.abandonedCart?.enabled && (
                  <div className="grid grid-cols-2 gap-4 pl-6">
                    <div>
                      <label className="block text-sm font-medium mb-2">延迟时间 (小时)</label>
                      <input
                        type="number"
                        value={autoMarketingConfig.strategies?.abandonedCart?.delayHours || 24}
                        onChange={(e) =>
                          setAutoMarketingConfig({
                            ...autoMarketingConfig,
                            strategies: {
                              ...autoMarketingConfig.strategies,
                              abandonedCart: {
                                enabled: autoMarketingConfig.strategies?.abandonedCart?.enabled ?? false,
                                delayHours: parseInt(e.target.value),
                                discountPercent: autoMarketingConfig.strategies?.abandonedCart?.discountPercent,
                              },
                            },
                          })
                        }
                        className="w-full border rounded-lg px-3 py-2"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-2">折扣百分比</label>
                      <input
                        type="number"
                        value={autoMarketingConfig.strategies?.abandonedCart?.discountPercent || 10}
                        onChange={(e) =>
                          setAutoMarketingConfig({
                            ...autoMarketingConfig,
                            strategies: {
                              ...autoMarketingConfig.strategies,
                              abandonedCart: {
                                enabled: autoMarketingConfig.strategies?.abandonedCart?.enabled ?? false,
                                delayHours: autoMarketingConfig.strategies?.abandonedCart?.delayHours || 24,
                                discountPercent: parseInt(e.target.value),
                              },
                            },
                          })
                        }
                        className="w-full border rounded-lg px-3 py-2"
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* 新客户 */}
              <div className="border rounded-lg p-4">
                <label className="flex items-center space-x-2 mb-3">
                  <input
                    type="checkbox"
                    checked={autoMarketingConfig.strategies?.newCustomer?.enabled}
                    onChange={(e) =>
                      setAutoMarketingConfig({
                        ...autoMarketingConfig,
                        strategies: {
                          ...autoMarketingConfig.strategies,
                          newCustomer: {
                            enabled: e.target.checked,
                            welcomeDiscount: autoMarketingConfig.strategies?.newCustomer?.welcomeDiscount || 15,
                          },
                        },
                      })
                    }
                    className="w-4 h-4"
                  />
                  <span className="font-medium">新客户欢迎</span>
                </label>
                {autoMarketingConfig.strategies?.newCustomer?.enabled && (
                  <div className="pl-6">
                    <label className="block text-sm font-medium mb-2">欢迎折扣 (%)</label>
                    <input
                      type="number"
                      value={autoMarketingConfig.strategies?.newCustomer?.welcomeDiscount || 15}
                      onChange={(e) =>
                        setAutoMarketingConfig({
                          ...autoMarketingConfig,
                          strategies: {
                            ...autoMarketingConfig.strategies,
                            newCustomer: {
                              enabled: autoMarketingConfig.strategies?.newCustomer?.enabled ?? false,
                              welcomeDiscount: parseInt(e.target.value),
                            },
                          },
                        })
                      }
                      className="w-full border rounded-lg px-3 py-2"
                    />
                  </div>
                )}
              </div>

              {/* 其他策略... */}
              <button
                onClick={saveAutoMarketingConfig}
                disabled={loading}
                className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50"
              >
                保存配置
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

