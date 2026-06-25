import React, { useState, useMemo } from 'react';
import { Calculator, PieChart, TrendingUp, DollarSign, RefreshCw } from 'lucide-react';
import { useLocalization } from '../../../../contexts/LocalizationContext';
import { useToast } from '../../../../contexts/ToastContext';
import { commerceApi, SplitPlan, AllocationPreview } from '../../../../lib/api/commerce.api';

interface CommissionPreviewProps {
  splitPlan?: SplitPlan;
  onClose?: () => void;
}

interface PaymentType {
  id: string;
  name: { zh: string; en: string };
  description: { zh: string; en: string };
}

const PAYMENT_TYPES: PaymentType[] = [
  { 
    id: 'crypto_direct', 
    name: { zh: '纯加密货币', en: 'Crypto Direct' },
    description: { zh: '用户和商家都使用加密货币，0% 平台费', en: 'Both user and merchant use crypto, 0% fee' },
  },
  { 
    id: 'onramp', 
    name: { zh: '法币入金', en: 'Onramp' },
    description: { zh: '用户用法币支付，商家收加密货币', en: 'User pays fiat, merchant receives crypto' },
  },
  { 
    id: 'offramp', 
    name: { zh: '加密出金', en: 'Offramp' },
    description: { zh: '用户用加密货币支付，商家收法币', en: 'User pays crypto, merchant receives fiat' },
  },
  { 
    id: 'mixed', 
    name: { zh: '混合模式', en: 'Mixed' },
    description: { zh: '法币入金 + 法币出金', en: 'Fiat onramp + fiat offramp' },
  },
];

export const CommissionPreviewPanel: React.FC<CommissionPreviewProps> = ({ splitPlan, onClose }) => {
  const { t } = useLocalization();
  const { error: showError } = useToast();

  const [amount, setAmount] = useState<number>(100);
  const [currency, setCurrency] = useState<string>('USD');
  const [paymentType, setPaymentType] = useState<string>('crypto_direct');
  const [loading, setLoading] = useState(false);
  const [preview, setPreview] = useState<AllocationPreview | null>(null);

  // 默认费率配置
  const feeConfig = splitPlan?.feeConfig || {
    onrampFeeBps: 10,
    offrampFeeBps: 10,
    splitFeeBps: 30,
    minSplitFee: 100000,
  };

  // 根据 paymentType 转换为 API 需要的 usesOnramp/usesOfframp
  const getPaymentFlags = (type: string) => {
    switch (type) {
      case 'crypto_direct':
        return { usesOnramp: false, usesOfframp: false, usesSplit: !!splitPlan };
      case 'onramp':
        return { usesOnramp: true, usesOfframp: false, usesSplit: !!splitPlan };
      case 'offramp':
        return { usesOnramp: false, usesOfframp: true, usesSplit: !!splitPlan };
      case 'mixed':
        return { usesOnramp: true, usesOfframp: true, usesSplit: !!splitPlan };
      default:
        return { usesOnramp: false, usesOfframp: false, usesSplit: false };
    }
  };

  // 计算预览
  const calculatePreview = async () => {
    if (splitPlan) {
      try {
        setLoading(true);
        const paymentFlags = getPaymentFlags(paymentType);
        const result = await commerceApi.previewAllocation({
          splitPlanId: splitPlan.id,
          amount,
          currency,
          ...paymentFlags,
        });
        setPreview(result);
      } catch (err: any) {
        showError(err.message);
      } finally {
        setLoading(false);
      }
    } else {
      // 本地计算
      setPreview(calculateLocalPreview());
    }
  };

  // 本地模拟计算
  const calculateLocalPreview = (): AllocationPreview => {
    let platformFee = 0;
    
    // 分佣费
    const splitFee = Math.max(
      (amount * feeConfig.splitFeeBps) / 10000,
      feeConfig.minSplitFee / 1000000
    );

    // 根据支付类型计算费用
    if (paymentType === 'crypto_direct') {
      platformFee = 0; // 纯加密 0%
    } else if (paymentType === 'onramp') {
      platformFee = splitFee + (amount * feeConfig.onrampFeeBps) / 10000;
    } else if (paymentType === 'offramp') {
      platformFee = splitFee + (amount * feeConfig.offrampFeeBps) / 10000;
    } else if (paymentType === 'mixed') {
      platformFee = splitFee + (amount * feeConfig.onrampFeeBps) / 10000 + (amount * feeConfig.offrampFeeBps) / 10000;
    }

    const netAmount = amount - platformFee;

    // 模拟分配 - 匹配 AllocationPreview 接口
    const allocations = splitPlan?.rules.filter(r => r.active).map(rule => ({
      recipient: rule.recipient || 'pending',
      role: rule.customRoleName || rule.role,
      amount: (netAmount * rule.shareBps) / 10000,
      percentage: rule.shareBps / 100,
      source: rule.source || 'merchant',
    })) || [
      { recipient: 'merchant', role: '商家', amount: netAmount * 0.7, percentage: 70, source: 'merchant' },
      { recipient: 'platform', role: '平台', amount: netAmount * 0.3, percentage: 30, source: 'platform' },
    ];

    return {
      grossAmount: amount,
      currency,
      fees: {
        onrampFee: paymentType === 'onramp' || paymentType === 'mixed' ? (amount * feeConfig.onrampFeeBps) / 10000 : 0,
        offrampFee: paymentType === 'offramp' || paymentType === 'mixed' ? (amount * feeConfig.offrampFeeBps) / 10000 : 0,
        splitFee: paymentType === 'crypto_direct' ? 0 : splitFee,
        totalFees: platformFee,
      },
      allocations,
      merchantNet: netAmount,
      rateBreakdown: {
        onrampRate: `${feeConfig.onrampFeeBps / 100}%`,
        offrampRate: `${feeConfig.offrampFeeBps / 100}%`,
        splitRate: `${feeConfig.splitFeeBps / 100}%`,
      },
    };
  };

  // 预设金额
  const presetAmounts = [10, 50, 100, 500, 1000, 5000];

  // 饼图数据
  const pieData = useMemo(() => {
    if (!preview) return [];
    
    const colors = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];
    const result = preview.allocations.map((alloc, index) => ({
      name: alloc.role,
      value: alloc.amount,
      percentage: alloc.percentage.toFixed(1),
      color: colors[index % colors.length],
    }));

    if (preview.fees.totalFees > 0) {
      result.push({
        name: t({ zh: '平台费用', en: 'Platform Fee' }),
        value: preview.fees.totalFees,
        percentage: ((preview.fees.totalFees / preview.grossAmount) * 100).toFixed(2),
        color: '#64748b',
      });
    }

    return result;
  }, [preview, t]);

  return (
    <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-6">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center">
            <Calculator size={20} className="text-white" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-white">{t({ zh: '分佣预览', en: 'Commission Preview' })}</h3>
            <p className="text-sm text-slate-400">{t({ zh: '模拟计算分佣分配', en: 'Simulate commission allocation' })}</p>
          </div>
        </div>
        {splitPlan && (
          <span className="px-3 py-1 bg-blue-500/20 text-blue-400 rounded-full text-sm">
            {splitPlan.name}
          </span>
        )}
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        {/* Input Panel */}
        <div className="space-y-4">
          {/* Amount Input */}
          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase mb-2">
              {t({ zh: '交易金额', en: 'Transaction Amount' })}
            </label>
            <div className="flex gap-2">
              <input
                type="number"
                min="0"
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(parseFloat(e.target.value) || 0)}
                className="flex-1 bg-slate-700 border border-white/10 rounded-lg px-4 py-3 text-white text-lg font-mono outline-none focus:border-blue-500"
              />
              <select
                value={currency}
                onChange={(e) => setCurrency(e.target.value)}
                className="bg-slate-700 border border-white/10 rounded-lg px-4 py-3 text-white outline-none"
              >
                <option value="USD">USD</option>
                <option value="CNY">CNY</option>
                <option value="EUR">EUR</option>
                <option value="USDC">USDC</option>
              </select>
            </div>
            <div className="flex gap-2 mt-2 flex-wrap">
              {presetAmounts.map((preset) => (
                <button
                  key={preset}
                  onClick={() => setAmount(preset)}
                  className={`px-3 py-1 rounded text-sm transition-colors ${
                    amount === preset
                      ? 'bg-blue-600 text-white'
                      : 'bg-slate-700 text-slate-400 hover:bg-slate-600'
                  }`}
                >
                  {preset}
                </button>
              ))}
            </div>
          </div>

          {/* Payment Type */}
          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase mb-2">
              {t({ zh: '支付类型', en: 'Payment Type' })}
            </label>
            <div className="space-y-2">
              {PAYMENT_TYPES.map((type) => (
                <button
                  key={type.id}
                  onClick={() => setPaymentType(type.id)}
                  className={`w-full flex items-start gap-3 p-3 rounded-lg transition-colors text-left ${
                    paymentType === type.id
                      ? 'bg-blue-600/20 border border-blue-500/50'
                      : 'bg-slate-700/50 border border-transparent hover:bg-slate-700'
                  }`}
                >
                  <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center mt-0.5 ${
                    paymentType === type.id ? 'border-blue-500 bg-blue-500' : 'border-slate-500'
                  }`}>
                    {paymentType === type.id && <div className="w-2 h-2 bg-white rounded-full" />}
                  </div>
                  <div>
                    <p className="text-white font-medium">{t(type.name)}</p>
                    <p className="text-xs text-slate-400">{t(type.description)}</p>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Calculate Button */}
          <button
            onClick={calculatePreview}
            disabled={loading}
            className="w-full py-3 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-500 hover:to-purple-500 text-white rounded-lg font-bold transition-all flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {loading ? (
              <RefreshCw size={18} className="animate-spin" />
            ) : (
              <TrendingUp size={18} />
            )}
            {t({ zh: '计算分佣', en: 'Calculate Commission' })}
          </button>
        </div>

        {/* Result Panel */}
        <div className="space-y-4">
          {preview ? (
            <>
              {/* Summary Cards */}
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-slate-700/50 rounded-lg p-3 text-center">
                  <p className="text-xs text-slate-500 mb-1">{t({ zh: '总金额', en: 'Gross' })}</p>
                  <p className="text-lg font-bold text-white">{preview.grossAmount.toFixed(2)}</p>
                </div>
                <div className="bg-slate-700/50 rounded-lg p-3 text-center">
                  <p className="text-xs text-slate-500 mb-1">{t({ zh: '平台费', en: 'Fee' })}</p>
                  <p className="text-lg font-bold text-amber-400">-{preview.fees.totalFees.toFixed(2)}</p>
                </div>
                <div className="bg-slate-700/50 rounded-lg p-3 text-center">
                  <p className="text-xs text-slate-500 mb-1">{t({ zh: '净金额', en: 'Net' })}</p>
                  <p className="text-lg font-bold text-emerald-400">{preview.merchantNet.toFixed(2)}</p>
                </div>
              </div>

              {/* Fee Breakdown */}
              {preview.fees && preview.fees.totalFees > 0 && (
                <div className="bg-slate-700/30 rounded-lg p-3">
                  <p className="text-xs font-bold text-slate-500 uppercase mb-2">{t({ zh: '费用明细', en: 'Fee Breakdown' })}</p>
                  <div className="space-y-1 text-sm">
                    {preview.fees.splitFee > 0 && (
                      <div className="flex justify-between">
                        <span className="text-slate-400">{t({ zh: '分佣费', en: 'Split Fee' })}</span>
                        <span className="text-white">{preview.fees.splitFee.toFixed(4)} {currency}</span>
                      </div>
                    )}
                    {preview.fees.onrampFee > 0 && (
                      <div className="flex justify-between">
                        <span className="text-slate-400">Onramp</span>
                        <span className="text-white">{preview.fees.onrampFee.toFixed(4)} {currency}</span>
                      </div>
                    )}
                    {preview.fees.offrampFee > 0 && (
                      <div className="flex justify-between">
                        <span className="text-slate-400">Offramp</span>
                        <span className="text-white">{preview.fees.offrampFee.toFixed(4)} {currency}</span>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Visual Pie Chart */}
              <div className="bg-slate-700/30 rounded-lg p-4">
                <p className="text-xs font-bold text-slate-500 uppercase mb-3">{t({ zh: '分配比例', en: 'Allocation' })}</p>
                <div className="flex items-center gap-4">
                  {/* Simple CSS Pie */}
                  <div 
                    className="w-24 h-24 rounded-full relative"
                    style={{
                      background: pieData.length > 0 
                        ? `conic-gradient(${pieData.map((d, i) => {
                            const start = pieData.slice(0, i).reduce((sum, x) => sum + x.value, 0);
                            const end = start + d.value;
                            return `${d.color} ${(start / preview.grossAmount) * 100}% ${(end / preview.grossAmount) * 100}%`;
                          }).join(', ')})`
                        : '#475569'
                    }}
                  >
                    <div className="absolute inset-4 bg-slate-800 rounded-full flex items-center justify-center">
                      <DollarSign size={24} className="text-slate-400" />
                    </div>
                  </div>

                  {/* Legend */}
                  <div className="flex-1 space-y-2">
                    {pieData.map((item, index) => (
                      <div key={index} className="flex items-center justify-between text-sm">
                        <div className="flex items-center gap-2">
                          <div className="w-3 h-3 rounded-full" style={{ backgroundColor: item.color }} />
                          <span className="text-slate-300">{item.name}</span>
                        </div>
                        <div className="text-right">
                          <span className="text-white font-medium">{item.value.toFixed(2)}</span>
                          <span className="text-slate-500 ml-1">({item.percentage}%)</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Allocation Details */}
              <div className="space-y-2">
                {preview.allocations.map((alloc, index) => (
                  <div key={index} className="flex items-center justify-between bg-slate-700/30 rounded-lg p-3">
                    <div>
                      <p className="text-white font-medium">{alloc.role}</p>
                      <p className="text-xs text-slate-500">{alloc.recipient}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-white font-bold">{alloc.amount.toFixed(2)} {currency}</p>
                      <p className="text-xs text-blue-400">{alloc.percentage.toFixed(1)}%</p>
                    </div>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <PieChart size={48} className="text-slate-600 mb-4" />
              <p className="text-slate-400">{t({ zh: '输入金额并点击计算查看分佣预览', en: 'Enter amount and click calculate to see preview' })}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default CommissionPreviewPanel;
