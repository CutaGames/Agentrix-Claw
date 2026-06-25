import { useState, useEffect } from 'react';
import { autoEarnAdvancedApi, ArbitrageOpportunity } from '../../lib/api/auto-earn-advanced.api';
import { useToast } from '../../contexts/ToastContext';

interface ArbitragePanelProps {
  agentId?: string;
}

export function ArbitragePanel({ agentId }: ArbitragePanelProps) {
  const { success, error } = useToast();
  const [opportunities, setOpportunities] = useState<ArbitrageOpportunity[]>([]);
  const [loading, setLoading] = useState(false);
  const [autoScan, setAutoScan] = useState(false);

  useEffect(() => {
    if (autoScan) {
      const interval = setInterval(() => {
        scanOpportunities();
      }, 30000); // 每30秒扫描一次
      return () => clearInterval(interval);
    }
  }, [autoScan]);

  const scanOpportunities = async () => {
    try {
      setLoading(true);
      const data = await autoEarnAdvancedApi.scanArbitrageOpportunities(
        ['solana', 'ethereum', 'bsc'],
        ['SOL/USDC', 'ETH/USDT', 'BNB/USDT'],
      );
      setOpportunities(data);
    } catch (err: any) {
      error(err.message || '扫描套利机会失败');
    } finally {
      setLoading(false);
    }
  };

  const executeArbitrage = async (opportunity: ArbitrageOpportunity, amount: number) => {
    try {
      setLoading(true);
      await autoEarnAdvancedApi.executeArbitrage(opportunity.id, amount, agentId);
      success('套利交易执行成功');
      await scanOpportunities();
    } catch (err: any) {
      error(err.message || '执行套利失败');
    } finally {
      setLoading(false);
    }
  };

  const startAutoStrategy = async () => {
    try {
      setLoading(true);
      await autoEarnAdvancedApi.startAutoArbitrageStrategy(
        {
          enabled: true,
          minProfitRate: 1,
          maxAmount: 1000,
          chains: ['solana', 'ethereum'],
          pairs: ['SOL/USDC', 'ETH/USDT'],
        },
        agentId,
      );
      success('自动套利策略已启动');
      setAutoScan(true);
    } catch (err: any) {
      error(err.message || '启动自动套利策略失败');
    } finally {
      setLoading(false);
    }
  };

  const getRiskColor = (risk: string) => {
    const colors: Record<string, string> = {
      low: 'text-green-600',
      medium: 'text-yellow-600',
      high: 'text-red-600',
    };
    return colors[risk] || 'text-gray-600';
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">套利交易</h3>
        <div className="flex space-x-2">
          <button
            onClick={scanOpportunities}
            disabled={loading}
            className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50"
          >
            {loading ? '扫描中...' : '扫描机会'}
          </button>
          <button
            onClick={startAutoStrategy}
            disabled={loading || autoScan}
            className="px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 disabled:opacity-50"
          >
            {autoScan ? '自动扫描中' : '启动自动策略'}
          </button>
        </div>
      </div>

      {opportunities.length === 0 ? (
        <div className="text-center py-8 text-gray-500">
          暂无套利机会，点击 &quot;扫描机会&quot; 开始扫描
        </div>
      ) : (
        <div className="space-y-3">
          {opportunities.map((opp) => (
            <div
              key={opp.id}
              className="border rounded-lg p-4 hover:shadow-md transition-shadow"
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center space-x-2 mb-2">
                    <span className="font-semibold">{opp.pair}</span>
                    <span className="text-sm text-gray-500">{opp.chain}</span>
                    <span className={`text-sm font-medium ${getRiskColor(opp.riskLevel)}`}>
                      {opp.riskLevel === 'low' ? '低风险' : opp.riskLevel === 'medium' ? '中风险' : '高风险'}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="text-gray-500">DEX1 ({opp.dex1}):</span>
                      <span className="ml-2 font-medium">${opp.price1.toFixed(4)}</span>
                    </div>
                    <div>
                      <span className="text-gray-500">DEX2 ({opp.dex2}):</span>
                      <span className="ml-2 font-medium">${opp.price2.toFixed(4)}</span>
                    </div>
                    <div>
                      <span className="text-gray-500">价格差:</span>
                      <span className="ml-2 font-medium text-green-600">
                        ${opp.priceDiff.toFixed(4)}
                      </span>
                    </div>
                    <div>
                      <span className="text-gray-500">利润率:</span>
                      <span className="ml-2 font-medium text-green-600">
                        {opp.profitRate.toFixed(2)}%
                      </span>
                    </div>
                    <div>
                      <span className="text-gray-500">预估利润:</span>
                      <span className="ml-2 font-medium text-green-600">
                        ${opp.estimatedProfit.toFixed(2)}
                      </span>
                    </div>
                    <div className="text-xs text-gray-400">
                      过期时间: {new Date(opp.expiresAt).toLocaleString()}
                    </div>
                  </div>
                </div>
                <div className="ml-4">
                  <button
                    onClick={() => executeArbitrage(opp, opp.minAmount)}
                    disabled={loading}
                    className="px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 disabled:opacity-50"
                  >
                    执行套利
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

