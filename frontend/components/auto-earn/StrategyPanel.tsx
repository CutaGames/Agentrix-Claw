import { useState, useEffect } from 'react';
import { autoEarnAdvancedApi, StrategyConfig } from '../../lib/api/auto-earn-advanced.api';
import { useToast } from '../../contexts/ToastContext';

interface StrategyPanelProps {
  agentId?: string;
}

export function StrategyPanel({ agentId }: StrategyPanelProps) {
  const { success, error } = useToast();
  const [strategies, setStrategies] = useState<StrategyConfig[]>([]);
  const [loading, setLoading] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newStrategy, setNewStrategy] = useState({
    type: 'dca' as StrategyConfig['type'],
    config: {} as Record<string, any>,
  });

  useEffect(() => {
    loadStrategies();
  }, [agentId]);

  const loadStrategies = async () => {
    try {
      setLoading(true);
      const data = await autoEarnAdvancedApi.getUserStrategies(agentId);
      setStrategies(data);
    } catch (err: any) {
      error(err.message || '加载策略失败');
    } finally {
      setLoading(false);
    }
  };

  const createStrategy = async () => {
    try {
      setLoading(true);
      await autoEarnAdvancedApi.createStrategy(newStrategy.type, newStrategy.config, agentId);
      success('策略创建成功');
      setShowCreateModal(false);
      await loadStrategies();
    } catch (err: any) {
      error(err.message || '创建策略失败');
    } finally {
      setLoading(false);
    }
  };

  const toggleStrategy = async (strategy: StrategyConfig) => {
    try {
      setLoading(true);
      if (strategy.enabled) {
        await autoEarnAdvancedApi.stopStrategy(strategy.id);
        success('策略已停止');
      } else {
        await autoEarnAdvancedApi.startStrategy(strategy.id);
        success('策略已启动');
      }
      await loadStrategies();
    } catch (err: any) {
      error(err.message || '操作失败');
    } finally {
      setLoading(false);
    }
  };

  const getTypeText = (type: string) => {
    const texts: Record<string, string> = {
      arbitrage: '套利',
      launchpad: 'Launchpad',
      dca: '定投',
      grid: '网格交易',
      copy_trading: '跟单',
    };
    return texts[type] || type;
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">策略管理</h3>
        <button
          onClick={() => setShowCreateModal(true)}
          className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600"
        >
          创建策略
        </button>
      </div>

      {strategies.length === 0 ? (
        <div className="text-center py-8 text-gray-500">
          暂无策略，点击 &quot;创建策略&quot; 开始
        </div>
      ) : (
        <div className="space-y-3">
          {strategies.map((strategy) => (
            <div
              key={strategy.id}
              className="border rounded-lg p-4 hover:shadow-md transition-shadow"
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center space-x-2 mb-2">
                    <span className="font-semibold">{getTypeText(strategy.type)}</span>
                    <span
                      className={`px-2 py-1 rounded text-xs ${
                        strategy.enabled
                          ? 'bg-green-100 text-green-800'
                          : 'bg-gray-100 text-gray-800'
                      }`}
                    >
                      {strategy.enabled ? '运行中' : '已停止'}
                    </span>
                  </div>
                  <div className="text-sm text-gray-600 mb-2">
                    创建时间: {new Date(strategy.createdAt).toLocaleString()}
                  </div>
                  <div className="text-xs text-gray-500">
                    配置: {JSON.stringify(strategy.config, null, 2)}
                  </div>
                </div>
                <div className="ml-4">
                  <button
                    onClick={() => toggleStrategy(strategy)}
                    disabled={loading}
                    className={`px-4 py-2 rounded-lg ${
                      strategy.enabled
                        ? 'bg-red-500 hover:bg-red-600'
                        : 'bg-green-500 hover:bg-green-600'
                    } text-white disabled:opacity-50`}
                  >
                    {strategy.enabled ? '停止' : '启动'}
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {showCreateModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md">
            <h4 className="text-lg font-semibold mb-4">创建策略</h4>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-2">策略类型</label>
                <select
                  value={newStrategy.type}
                  onChange={(e) =>
                    setNewStrategy({ ...newStrategy, type: e.target.value as StrategyConfig['type'] })
                  }
                  className="w-full border rounded-lg px-3 py-2"
                >
                  <option value="dca">定投 (DCA)</option>
                  <option value="grid">网格交易</option>
                  <option value="copy_trading">跟单</option>
                  <option value="arbitrage">套利</option>
                  <option value="launchpad">Launchpad</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">配置 (JSON)</label>
                <textarea
                  value={JSON.stringify(newStrategy.config, null, 2)}
                  onChange={(e) => {
                    try {
                      setNewStrategy({
                        ...newStrategy,
                        config: JSON.parse(e.target.value),
                      });
                    } catch {
                      // 忽略JSON解析错误
                    }
                  }}
                  className="w-full border rounded-lg px-3 py-2 font-mono text-sm"
                  rows={6}
                />
              </div>
              <div className="flex space-x-2">
                <button
                  onClick={createStrategy}
                  disabled={loading}
                  className="flex-1 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50"
                >
                  创建
                </button>
                <button
                  onClick={() => setShowCreateModal(false)}
                  className="flex-1 px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300"
                >
                  取消
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

