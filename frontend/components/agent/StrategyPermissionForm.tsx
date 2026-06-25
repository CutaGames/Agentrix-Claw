import { useState } from 'react';
import { StrategyPermissionConfig } from '../../lib/api/agent-authorization.api';

interface StrategyPermissionFormProps {
  value: StrategyPermissionConfig[];
  onChange: (permissions: StrategyPermissionConfig[]) => void;
}

const STRATEGY_TYPES: Array<{
  value: StrategyPermissionConfig['strategyType'];
  label: string;
  description: string;
}> = [
  { value: 'dca', label: 'DCA (定投)', description: '定期定额投资策略' },
  { value: 'grid', label: '网格交易', description: '网格交易策略' },
  { value: 'arbitrage', label: '套利', description: '跨平台套利策略' },
  { value: 'market_making', label: '做市', description: '做市策略' },
  { value: 'rebalancing', label: '调仓', description: '资产调仓策略' },
];

const DEX_OPTIONS = [
  { value: 'jupiter', label: 'Jupiter' },
  { value: 'uniswap', label: 'Uniswap' },
  { value: 'raydium', label: 'Raydium' },
  { value: 'pancakeswap', label: 'PancakeSwap' },
  { value: 'openocean', label: 'OpenOcean' },
];

const CEX_OPTIONS = [
  { value: 'binance', label: 'Binance' },
  { value: 'coinbase', label: 'Coinbase' },
  { value: 'kraken', label: 'Kraken' },
];

export function StrategyPermissionForm({ value, onChange }: StrategyPermissionFormProps) {
  const [expandedStrategy, setExpandedStrategy] = useState<string | null>(null);

  const getPermission = (strategyType: StrategyPermissionConfig['strategyType']): StrategyPermissionConfig | undefined => {
    return value.find((p) => p.strategyType === strategyType);
  };

  const updatePermission = (strategyType: StrategyPermissionConfig['strategyType'], updates: Partial<StrategyPermissionConfig>) => {
    const existing = getPermission(strategyType);
    if (existing) {
      onChange(value.map((p) => (p.strategyType === strategyType ? { ...p, ...updates } : p)));
    } else {
      onChange([
        ...value,
        {
          strategyType,
          allowed: true,
          frequencyPeriod: 'day',
          ...updates,
        },
      ]);
    }
  };

  const togglePermission = (strategyType: StrategyPermissionConfig['strategyType']) => {
    const existing = getPermission(strategyType);
    if (existing) {
      updatePermission(strategyType, { allowed: !existing.allowed });
    } else {
      onChange([
        ...value,
        {
          strategyType,
          allowed: true,
          frequencyPeriod: 'day',
        },
      ]);
    }
  };

  const removePermission = (strategyType: StrategyPermissionConfig['strategyType']) => {
    onChange(value.filter((p) => p.strategyType !== strategyType));
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-gray-900">策略权限配置</h3>
        <p className="text-sm text-gray-500">为Agent配置可执行的交易策略和限制</p>
      </div>

      {STRATEGY_TYPES.map((strategy) => {
        const permission = getPermission(strategy.value);
        const isExpanded = expandedStrategy === strategy.value;

        return (
          <div key={strategy.value} className="border border-gray-200 rounded-lg overflow-hidden">
            <div className="bg-gray-50 px-4 py-3 flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <input
                  type="checkbox"
                  checked={permission?.allowed || false}
                  onChange={() => togglePermission(strategy.value)}
                  className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
                />
                <div>
                  <h4 className="font-medium text-gray-900">{strategy.label}</h4>
                  <p className="text-xs text-gray-500">{strategy.description}</p>
                </div>
              </div>
              <div className="flex items-center space-x-2">
                {permission && (
                  <button
                    onClick={() => setExpandedStrategy(isExpanded ? null : strategy.value)}
                    className="text-sm text-blue-600 hover:text-blue-700"
                  >
                    {isExpanded ? '收起' : '配置'}
                  </button>
                )}
                {permission && (
                  <button
                    onClick={() => removePermission(strategy.value)}
                    className="text-sm text-red-600 hover:text-red-700"
                  >
                    删除
                  </button>
                )}
              </div>
            </div>

            {permission && permission.allowed && isExpanded && (
              <div className="p-4 space-y-4 bg-white">
                {/* 金额限制 */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">最大金额</label>
                  <input
                    type="number"
                    value={permission.maxAmount || ''}
                    onChange={(e) =>
                      updatePermission(strategy.value, {
                        maxAmount: e.target.value ? parseFloat(e.target.value) : undefined,
                      })
                    }
                    placeholder="不限制"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                {/* 频率限制 */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">最大频率</label>
                    <input
                      type="number"
                      value={permission.maxFrequency || ''}
                      onChange={(e) =>
                        updatePermission(strategy.value, {
                          maxFrequency: e.target.value ? parseInt(e.target.value) : undefined,
                        })
                      }
                      placeholder="不限制"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">频率周期</label>
                    <select
                      value={permission.frequencyPeriod || 'day'}
                      onChange={(e) =>
                        updatePermission(strategy.value, {
                          frequencyPeriod: e.target.value as 'hour' | 'day',
                        })
                      }
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="hour">每小时</option>
                      <option value="day">每天</option>
                    </select>
                  </div>
                </div>

                {/* 允许的代币 */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">允许的代币（留空表示不限制）</label>
                  <input
                    type="text"
                    value={permission.allowedTokens?.join(', ') || ''}
                    onChange={(e) =>
                      updatePermission(strategy.value, {
                        allowedTokens: e.target.value
                          ? e.target.value.split(',').map((t) => t.trim()).filter(Boolean)
                          : undefined,
                      })
                    }
                    placeholder="例如: USDC, USDT, ETH (用逗号分隔)"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                {/* 允许的DEX */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">允许的DEX</label>
                  <div className="flex flex-wrap gap-2">
                    {DEX_OPTIONS.map((dex) => (
                      <label key={dex.value} className="flex items-center space-x-2">
                        <input
                          type="checkbox"
                          checked={permission.allowedDEXs?.includes(dex.value) || false}
                          onChange={(e) => {
                            const current = permission.allowedDEXs || [];
                            const updated = e.target.checked
                              ? [...current, dex.value]
                              : current.filter((d) => d !== dex.value);
                            updatePermission(strategy.value, {
                              allowedDEXs: updated.length > 0 ? updated : undefined,
                            });
                          }}
                          className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
                        />
                        <span className="text-sm text-gray-700">{dex.label}</span>
                      </label>
                    ))}
                  </div>
                </div>

                {/* 允许的CEX */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">允许的CEX</label>
                  <div className="flex flex-wrap gap-2">
                    {CEX_OPTIONS.map((cex) => (
                      <label key={cex.value} className="flex items-center space-x-2">
                        <input
                          type="checkbox"
                          checked={permission.allowedCEXs?.includes(cex.value) || false}
                          onChange={(e) => {
                            const current = permission.allowedCEXs || [];
                            const updated = e.target.checked
                              ? [...current, cex.value]
                              : current.filter((c) => c !== cex.value);
                            updatePermission(strategy.value, {
                              allowedCEXs: updated.length > 0 ? updated : undefined,
                            });
                          }}
                          className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
                        />
                        <span className="text-sm text-gray-700">{cex.label}</span>
                      </label>
                    ))}
                  </div>
                </div>

                {/* 风险限制 */}
                <div className="border-t pt-4">
                  <h5 className="text-sm font-medium text-gray-900 mb-3">风险限制（可选）</h5>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs text-gray-600 mb-1">最大回撤 (%)</label>
                      <input
                        type="number"
                        value={permission.riskLimits?.maxDrawdown || ''}
                        onChange={(e) =>
                          updatePermission(strategy.value, {
                            riskLimits: {
                              ...permission.riskLimits,
                              maxDrawdown: e.target.value ? parseFloat(e.target.value) : undefined,
                            },
                          })
                        }
                        placeholder="不限制"
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-600 mb-1">最大杠杆</label>
                      <input
                        type="number"
                        value={permission.riskLimits?.maxLeverage || ''}
                        onChange={(e) =>
                          updatePermission(strategy.value, {
                            riskLimits: {
                              ...permission.riskLimits,
                              maxLeverage: e.target.value ? parseFloat(e.target.value) : undefined,
                            },
                          })
                        }
                        placeholder="不限制"
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-600 mb-1">止损 (%)</label>
                      <input
                        type="number"
                        value={permission.riskLimits?.stopLoss || ''}
                        onChange={(e) =>
                          updatePermission(strategy.value, {
                            riskLimits: {
                              ...permission.riskLimits,
                              stopLoss: e.target.value ? parseFloat(e.target.value) : undefined,
                            },
                          })
                        }
                        placeholder="不限制"
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-600 mb-1">止盈 (%)</label>
                      <input
                        type="number"
                        value={permission.riskLimits?.takeProfit || ''}
                        onChange={(e) =>
                          updatePermission(strategy.value, {
                            riskLimits: {
                              ...permission.riskLimits,
                              takeProfit: e.target.value ? parseFloat(e.target.value) : undefined,
                            },
                          })
                        }
                        placeholder="不限制"
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

