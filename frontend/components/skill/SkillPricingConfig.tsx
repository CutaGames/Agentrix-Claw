/**
 * Skill Pricing Configuration Component
 * 
 * 用于配置 Skill 的使用费用和佣金分配
 */

import React, { useState, useEffect } from 'react';
import { useLocalization } from '../../contexts/LocalizationContext';
import { 
  DollarSign, 
  Percent, 
  Info, 
  Save,
  RefreshCw,
  AlertCircle,
  Check,
} from 'lucide-react';

export interface SkillPricing {
  type: 'free' | 'per_call' | 'subscription' | 'revenue_share';
  pricePerCall?: number;
  subscriptionPrice?: number;
  subscriptionPeriod?: 'monthly' | 'yearly';
  commissionRate?: number;
  currency?: string;
  freeQuota?: number;
}

interface SkillPricingConfigProps {
  skillId: string;
  initialPricing?: SkillPricing;
  resourceType?: string;
  onSave?: (pricing: SkillPricing) => Promise<void>;
  readOnly?: boolean;
}

// ARN V4.0 佣金率参考
const COMMISSION_RATES = {
  physical: { rate: 2.2, label: { zh: '实物商品', en: 'Physical Goods' } },
  service: { rate: 3.7, label: { zh: '服务', en: 'Services' } },
  digital: { rate: 2.2, label: { zh: '数字商品', en: 'Digital Goods' } },
  data: { rate: 2.2, label: { zh: '数据服务', en: 'Data Services' } },
  logic: { rate: 20, label: { zh: '工具/逻辑', en: 'Tools/Logic' } },
};

const PRICING_TYPES = [
  { value: 'free', label: { zh: '免费', en: 'Free' }, description: { zh: '完全免费使用', en: 'Completely free to use' } },
  { value: 'per_call', label: { zh: '按次计费', en: 'Per Call' }, description: { zh: '每次调用收费', en: 'Charge per API call' } },
  { value: 'subscription', label: { zh: '订阅制', en: 'Subscription' }, description: { zh: '按月/年订阅', en: 'Monthly/yearly subscription' } },
  { value: 'revenue_share', label: { zh: '收益分成', en: 'Revenue Share' }, description: { zh: '按交易金额分成', en: 'Share of transaction amount' } },
];

export const SkillPricingConfig: React.FC<SkillPricingConfigProps> = ({
  skillId,
  initialPricing,
  resourceType = 'service',
  onSave,
  readOnly = false,
}) => {
  const { t } = useLocalization();
  
  const [pricing, setPricing] = useState<SkillPricing>(initialPricing || {
    type: 'free',
    pricePerCall: 0,
    commissionRate: COMMISSION_RATES[resourceType as keyof typeof COMMISSION_RATES]?.rate || 2.2,
    currency: 'USD',
    freeQuota: 0,
  });
  
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 根据资源类型自动设置推荐佣金率
  useEffect(() => {
    if (resourceType && COMMISSION_RATES[resourceType as keyof typeof COMMISSION_RATES]) {
      setPricing(prev => ({
        ...prev,
        commissionRate: COMMISSION_RATES[resourceType as keyof typeof COMMISSION_RATES].rate,
      }));
    }
  }, [resourceType]);

  const handleSave = async () => {
    if (!onSave) return;
    
    setSaving(true);
    setError(null);
    setSaved(false);
    
    try {
      await onSave(pricing);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err: any) {
      setError(err.message || t({ zh: '保存失败', en: 'Save failed' }));
    } finally {
      setSaving(false);
    }
  };

  const calculateNetAmount = (amount: number) => {
    const commission = amount * (pricing.commissionRate || 0) / 100;
    return amount - commission;
  };

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-6">
      <h3 className="text-lg font-semibold text-slate-900 mb-6 flex items-center gap-2">
        <DollarSign className="w-5 h-5 text-green-600" />
        {t({ zh: '定价与佣金配置', en: 'Pricing & Commission Config' })}
      </h3>

      {/* 定价类型选择 */}
      <div className="mb-6">
        <label className="block text-sm font-medium text-slate-700 mb-3">
          {t({ zh: '定价模式', en: 'Pricing Model' })}
        </label>
        <div className="grid grid-cols-2 gap-3">
          {PRICING_TYPES.map((type) => (
            <button
              key={type.value}
              onClick={() => !readOnly && setPricing({ ...pricing, type: type.value as any })}
              disabled={readOnly}
              className={`p-4 rounded-xl border-2 text-left transition-all ${
                pricing.type === type.value
                  ? 'border-blue-500 bg-blue-50'
                  : 'border-slate-200 hover:border-slate-300'
              } ${readOnly ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer'}`}
            >
              <p className="font-medium text-slate-900">{t(type.label)}</p>
              <p className="text-xs text-slate-500 mt-1">{t(type.description)}</p>
            </button>
          ))}
        </div>
      </div>

      {/* 按次计费配置 */}
      {pricing.type === 'per_call' && (
        <div className="mb-6 p-4 bg-slate-50 rounded-xl">
          <label className="block text-sm font-medium text-slate-700 mb-2">
            {t({ zh: '每次调用价格', en: 'Price Per Call' })}
          </label>
          <div className="flex items-center gap-3">
            <div className="relative flex-1">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">$</span>
              <input
                type="number"
                value={pricing.pricePerCall || 0}
                onChange={(e) => setPricing({ ...pricing, pricePerCall: parseFloat(e.target.value) || 0 })}
                disabled={readOnly}
                min="0"
                step="0.01"
                className="w-full pl-8 pr-4 py-2 rounded-lg border border-slate-200 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none disabled:bg-slate-100"
              />
            </div>
            <select
              value={pricing.currency || 'USD'}
              onChange={(e) => setPricing({ ...pricing, currency: e.target.value })}
              disabled={readOnly}
              className="px-4 py-2 rounded-lg border border-slate-200 bg-white"
            >
              <option value="USD">USD</option>
              <option value="USDC">USDC</option>
              <option value="USDT">USDT</option>
            </select>
          </div>
          
          {/* 免费额度 */}
          <div className="mt-4">
            <label className="block text-sm font-medium text-slate-700 mb-2">
              {t({ zh: '免费调用额度', en: 'Free Quota' })}
            </label>
            <input
              type="number"
              value={pricing.freeQuota || 0}
              onChange={(e) => setPricing({ ...pricing, freeQuota: parseInt(e.target.value) || 0 })}
              disabled={readOnly}
              min="0"
              className="w-full px-4 py-2 rounded-lg border border-slate-200 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none disabled:bg-slate-100"
              placeholder={t({ zh: '每月免费次数', en: 'Free calls per month' })}
            />
          </div>
        </div>
      )}

      {/* 订阅制配置 */}
      {pricing.type === 'subscription' && (
        <div className="mb-6 p-4 bg-slate-50 rounded-xl">
          <label className="block text-sm font-medium text-slate-700 mb-2">
            {t({ zh: '订阅价格', en: 'Subscription Price' })}
          </label>
          <div className="flex items-center gap-3">
            <div className="relative flex-1">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">$</span>
              <input
                type="number"
                value={pricing.subscriptionPrice || 0}
                onChange={(e) => setPricing({ ...pricing, subscriptionPrice: parseFloat(e.target.value) || 0 })}
                disabled={readOnly}
                min="0"
                step="0.01"
                className="w-full pl-8 pr-4 py-2 rounded-lg border border-slate-200 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none disabled:bg-slate-100"
              />
            </div>
            <select
              value={pricing.subscriptionPeriod || 'monthly'}
              onChange={(e) => setPricing({ ...pricing, subscriptionPeriod: e.target.value as any })}
              disabled={readOnly}
              className="px-4 py-2 rounded-lg border border-slate-200 bg-white"
            >
              <option value="monthly">{t({ zh: '每月', en: 'Monthly' })}</option>
              <option value="yearly">{t({ zh: '每年', en: 'Yearly' })}</option>
            </select>
          </div>
        </div>
      )}

      {/* 佣金配置 */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-3">
          <label className="text-sm font-medium text-slate-700 flex items-center gap-2">
            <Percent className="w-4 h-4" />
            {t({ zh: '平台佣金率', en: 'Platform Commission Rate' })}
          </label>
          <span className="text-xs text-slate-500">
            {t({ zh: '参考 ARN V4.0 标准', en: 'Based on ARN V4.0 Standard' })}
          </span>
        </div>
        
        <div className="flex items-center gap-3">
          <input
            type="number"
            value={pricing.commissionRate || 0}
            onChange={(e) => setPricing({ ...pricing, commissionRate: parseFloat(e.target.value) || 0 })}
            disabled={readOnly}
            min="0"
            max="100"
            step="0.1"
            className="w-32 px-4 py-2 rounded-lg border border-slate-200 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none disabled:bg-slate-100"
          />
          <span className="text-slate-600">%</span>
        </div>

        {/* 佣金率参考 */}
        <div className="mt-4 p-4 bg-blue-50 rounded-xl">
          <p className="text-sm font-medium text-blue-900 mb-2 flex items-center gap-2">
            <Info className="w-4 h-4" />
            {t({ zh: '推荐佣金率参考', en: 'Recommended Commission Rates' })}
          </p>
          <div className="grid grid-cols-2 gap-2 text-xs">
            {Object.entries(COMMISSION_RATES).map(([key, value]) => (
              <div 
                key={key} 
                className={`flex items-center justify-between p-2 rounded ${
                  resourceType === key ? 'bg-blue-100' : 'bg-white'
                }`}
              >
                <span className="text-slate-600">{t(value.label)}</span>
                <span className="font-semibold text-blue-700">{value.rate}%</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* 收益预览 */}
      {pricing.type !== 'free' && (
        <div className="mb-6 p-4 bg-green-50 rounded-xl">
          <p className="text-sm font-medium text-green-900 mb-3">
            {t({ zh: '收益预览', en: 'Revenue Preview' })}
          </p>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-slate-600">{t({ zh: '示例交易金额', en: 'Example Amount' })}</span>
              <span className="font-medium">$100.00</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-600">{t({ zh: '平台佣金', en: 'Platform Commission' })}</span>
              <span className="text-red-600">-${(100 * (pricing.commissionRate || 0) / 100).toFixed(2)}</span>
            </div>
            <div className="flex justify-between pt-2 border-t border-green-200">
              <span className="font-medium text-green-900">{t({ zh: '您的收益', en: 'Your Earnings' })}</span>
              <span className="font-bold text-green-700">${calculateNetAmount(100).toFixed(2)}</span>
            </div>
          </div>
        </div>
      )}

      {/* 错误提示 */}
      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2 text-red-700 text-sm">
          <AlertCircle className="w-4 h-4" />
          {error}
        </div>
      )}

      {/* 保存按钮 */}
      {!readOnly && onSave && (
        <button
          onClick={handleSave}
          disabled={saving}
          className="w-full py-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {saving ? (
            <>
              <RefreshCw className="w-5 h-5 animate-spin" />
              {t({ zh: '保存中...', en: 'Saving...' })}
            </>
          ) : saved ? (
            <>
              <Check className="w-5 h-5" />
              {t({ zh: '已保存', en: 'Saved' })}
            </>
          ) : (
            <>
              <Save className="w-5 h-5" />
              {t({ zh: '保存配置', en: 'Save Configuration' })}
            </>
          )}
        </button>
      )}
    </div>
  );
};

export default SkillPricingConfig;
