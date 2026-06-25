'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  CreditCard,
  Wallet,
  Building2,
  CheckCircle2,
  AlertCircle,
  Loader2,
  ChevronRight,
  ExternalLink,
  DollarSign,
  Globe,
  ShieldCheck,
  ArrowRight,
  Info,
  Settings,
  Lock,
} from 'lucide-react';
import { useUser } from '../../contexts/UserContext';
import { useToast } from '../../contexts/ToastContext';

// 结算方式类型
type PayoutMethod = 'stripe_connect' | 'crypto_wallet' | 'none';

interface PayoutSettings {
  preferredMethod: PayoutMethod;
  stripeConnectAccountId?: string;
  stripeConnectStatus?: 'pending' | 'active' | 'restricted' | 'disabled';
  cryptoWalletAddress?: string;
  cryptoWalletChain?: 'evm' | 'solana' | 'base';
  minPayoutThreshold?: number;
  autoPayoutEnabled?: boolean;
}

interface PayoutSettingsResponse {
  success: boolean;
  data?: PayoutSettings;
  message?: string;
}

export const PayoutSettingsPanel: React.FC = () => {
  const { user } = useUser();
  const { showToast } = useToast();
  
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [settings, setSettings] = useState<PayoutSettings>({
    preferredMethod: 'none',
    minPayoutThreshold: 10,
    autoPayoutEnabled: true,
  });
  const [stripeConnecting, setStripeConnecting] = useState(false);

  // 获取当前设置
  const fetchSettings = useCallback(async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/user/payout-settings', {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('access_token') || localStorage.getItem('token')}`,
        },
      });
      
      if (response.ok) {
        const data: PayoutSettingsResponse = await response.json();
        if (data.success && data.data) {
          setSettings(data.data);
        }
      }
    } catch (error) {
      console.error('Failed to fetch payout settings:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  // 保存设置
  const saveSettings = async (newSettings: Partial<PayoutSettings>) => {
    try {
      setSaving(true);
      const response = await fetch('/api/user/payout-settings', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('access_token') || localStorage.getItem('token')}`,
        },
        body: JSON.stringify(newSettings),
      });

      if (response.ok) {
        const data = await response.json();
        if (data.success) {
          setSettings(prev => ({ ...prev, ...newSettings }));
          showToast('success', '设置已保存');
        }
      } else {
        showToast('error', '保存失败，请重试');
      }
    } catch (error) {
      console.error('Failed to save payout settings:', error);
      showToast('error', '保存失败，请重试');
    } finally {
      setSaving(false);
    }
  };

  // 开始 Stripe Connect 入驻
  const startStripeConnect = async () => {
    try {
      setStripeConnecting(true);
      const response = await fetch('/api/payments/connect/onboard', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
        },
        body: JSON.stringify({
          type: 'individual',
          refreshUrl: window.location.href,
          returnUrl: window.location.href + '?stripe_return=true',
        }),
      });

      if (response.ok) {
        const data = await response.json();
        if (data.success && data.onboardingUrl) {
          window.location.href = data.onboardingUrl;
        }
      } else {
        showToast('error', '启动 Stripe Connect 失败');
      }
    } catch (error) {
      console.error('Failed to start Stripe Connect:', error);
      showToast('error', '启动 Stripe Connect 失败');
    } finally {
      setStripeConnecting(false);
    }
  };

  // 处理 Stripe 返回
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('stripe_return') === 'true') {
      fetchSettings();
      // 清理 URL
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }, [fetchSettings]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* 标题 */}
      <div>
        <h2 className="text-xl font-bold text-white mb-2">佣金结算设置</h2>
        <p className="text-sm text-slate-400">
          选择您希望接收佣金收入的方式。您可以通过 Stripe Connect 直接入账银行卡，或选择加密货币钱包接收。
        </p>
      </div>

      {/* 当前余额预览 */}
      <div className="bg-gradient-to-br from-blue-600/20 to-purple-600/20 border border-blue-500/30 rounded-2xl p-6">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm text-slate-400 mb-1">待结算佣金</div>
            <div className="text-3xl font-bold text-white">
              ${(user as any)?.pendingCommission?.toFixed(2) || '0.00'}
            </div>
          </div>
          <div className="w-14 h-14 rounded-2xl bg-blue-500/20 flex items-center justify-center">
            <DollarSign className="w-7 h-7 text-blue-400" />
          </div>
        </div>
        <div className="mt-4 flex items-center gap-2 text-xs text-slate-400">
          <Info size={14} />
          <span>佣金达到 ${settings.minPayoutThreshold || 10} 后可自动结算</span>
        </div>
      </div>

      {/* 结算方式选择 */}
      <div className="space-y-4">
        <h3 className="text-sm font-bold text-white uppercase tracking-wide">选择结算方式</h3>

        {/* Stripe Connect 选项 */}
        <div
          onClick={() => saveSettings({ preferredMethod: 'stripe_connect' })}
          className={`relative cursor-pointer border rounded-2xl p-5 transition-all ${
            settings.preferredMethod === 'stripe_connect'
              ? 'border-blue-500 bg-blue-500/10'
              : 'border-white/10 bg-white/5 hover:border-white/20'
          }`}
        >
          <div className="flex items-start gap-4">
            <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${
              settings.preferredMethod === 'stripe_connect' ? 'bg-blue-500' : 'bg-white/10'
            }`}>
              <CreditCard className={`w-6 h-6 ${
                settings.preferredMethod === 'stripe_connect' ? 'text-white' : 'text-slate-400'
              }`} />
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <span className="font-bold text-white">Stripe Connect</span>
                <span className="text-[10px] px-2 py-0.5 bg-emerald-500/20 text-emerald-400 rounded-full font-bold">
                  推荐
                </span>
              </div>
              <p className="text-sm text-slate-400 mb-3">
                直接转入您的银行账户，支持全球 40+ 国家
              </p>
              
              {/* Stripe Connect 状态 */}
              {settings.stripeConnectAccountId ? (
                <div className="flex items-center gap-2">
                  {settings.stripeConnectStatus === 'active' ? (
                    <>
                      <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                      <span className="text-sm text-emerald-400">已连接</span>
                    </>
                  ) : settings.stripeConnectStatus === 'pending' ? (
                    <>
                      <AlertCircle className="w-4 h-4 text-yellow-400" />
                      <span className="text-sm text-yellow-400">待完成入驻</span>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          startStripeConnect();
                        }}
                        className="ml-2 text-xs text-blue-400 hover:text-blue-300"
                      >
                        继续 →
                      </button>
                    </>
                  ) : (
                    <>
                      <AlertCircle className="w-4 h-4 text-red-400" />
                      <span className="text-sm text-red-400">账户受限</span>
                    </>
                  )}
                </div>
              ) : (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    startStripeConnect();
                  }}
                  disabled={stripeConnecting}
                  className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
                >
                  {stripeConnecting ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Building2 className="w-4 h-4" />
                  )}
                  开始入驻
                </button>
              )}

              {/* 优点列表 */}
              <div className="mt-4 grid grid-cols-2 gap-2 text-xs text-slate-500">
                <div className="flex items-center gap-1.5">
                  <CheckCircle2 size={12} className="text-emerald-400" />
                  <span>直接入银行卡</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <CheckCircle2 size={12} className="text-emerald-400" />
                  <span>法币直接结算</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <CheckCircle2 size={12} className="text-emerald-400" />
                  <span>合规税务报表</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <CheckCircle2 size={12} className="text-emerald-400" />
                  <span>7天自动到账</span>
                </div>
              </div>
            </div>
            
            {settings.preferredMethod === 'stripe_connect' && (
              <div className="absolute top-4 right-4">
                <CheckCircle2 className="w-6 h-6 text-blue-500" />
              </div>
            )}
          </div>
        </div>

        {/* Crypto 钱包选项 */}
        <div
          onClick={() => saveSettings({ preferredMethod: 'crypto_wallet' })}
          className={`relative cursor-pointer border rounded-2xl p-5 transition-all ${
            settings.preferredMethod === 'crypto_wallet'
              ? 'border-purple-500 bg-purple-500/10'
              : 'border-white/10 bg-white/5 hover:border-white/20'
          }`}
        >
          <div className="flex items-start gap-4">
            <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${
              settings.preferredMethod === 'crypto_wallet' ? 'bg-purple-500' : 'bg-white/10'
            }`}>
              <Wallet className={`w-6 h-6 ${
                settings.preferredMethod === 'crypto_wallet' ? 'text-white' : 'text-slate-400'
              }`} />
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <span className="font-bold text-white">加密货币钱包</span>
                <span className="text-[10px] px-2 py-0.5 bg-purple-500/20 text-purple-400 rounded-full font-bold">
                  全球可用
                </span>
              </div>
              <p className="text-sm text-slate-400 mb-3">
                使用 USDT/USDC 稳定币结算，即时到账
              </p>
              
              {/* 钱包地址输入 */}
              {settings.preferredMethod === 'crypto_wallet' && (
                <div className="space-y-3">
                  {/* 链选择 */}
                  <div className="flex gap-2">
                    {(['evm', 'solana', 'base'] as const).map(chain => (
                      <button
                        key={chain}
                        onClick={(e) => {
                          e.stopPropagation();
                          saveSettings({ cryptoWalletChain: chain });
                        }}
                        className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                          settings.cryptoWalletChain === chain
                            ? 'bg-purple-500 text-white'
                            : 'bg-white/10 text-slate-400 hover:bg-white/20'
                        }`}
                      >
                        {chain === 'evm' ? 'EVM (ETH/BSC)' : chain === 'solana' ? 'Solana' : 'Base'}
                      </button>
                    ))}
                  </div>
                  
                  {/* 钱包地址 */}
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={settings.cryptoWalletAddress || ''}
                      onChange={(e) => setSettings(prev => ({ ...prev, cryptoWalletAddress: e.target.value }))}
                      placeholder="输入您的钱包地址"
                      className="flex-1 px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:border-purple-500"
                      onClick={(e) => e.stopPropagation()}
                    />
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        saveSettings({ cryptoWalletAddress: settings.cryptoWalletAddress });
                      }}
                      disabled={saving}
                      className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
                    >
                      {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : '保存'}
                    </button>
                  </div>
                </div>
              )}

              {/* 优点列表 */}
              <div className="mt-4 grid grid-cols-2 gap-2 text-xs text-slate-500">
                <div className="flex items-center gap-1.5">
                  <CheckCircle2 size={12} className="text-purple-400" />
                  <span>无需 KYC</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <CheckCircle2 size={12} className="text-purple-400" />
                  <span>即时到账</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <CheckCircle2 size={12} className="text-purple-400" />
                  <span>全球无限制</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <CheckCircle2 size={12} className="text-purple-400" />
                  <span>低手续费</span>
                </div>
              </div>
            </div>
            
            {settings.preferredMethod === 'crypto_wallet' && (
              <div className="absolute top-4 right-4">
                <CheckCircle2 className="w-6 h-6 text-purple-500" />
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 高级设置 */}
      <div className="border border-white/10 rounded-2xl p-5">
        <h3 className="text-sm font-bold text-white mb-4 flex items-center gap-2">
          <Settings size={16} />
          高级设置
        </h3>
        
        <div className="space-y-4">
          {/* 最低结算金额 */}
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm font-medium text-white">最低结算金额</div>
              <div className="text-xs text-slate-400">余额达到此金额后自动结算</div>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-slate-400">$</span>
              <input
                type="number"
                value={settings.minPayoutThreshold || 10}
                onChange={(e) => saveSettings({ minPayoutThreshold: parseInt(e.target.value) || 10 })}
                min={1}
                max={1000}
                className="w-20 px-3 py-1.5 bg-white/5 border border-white/10 rounded-lg text-sm text-white text-right focus:outline-none focus:border-blue-500"
              />
            </div>
          </div>

          {/* 自动结算开关 */}
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm font-medium text-white">自动结算</div>
              <div className="text-xs text-slate-400">达到最低金额后自动发起结算</div>
            </div>
            <button
              onClick={() => saveSettings({ autoPayoutEnabled: !settings.autoPayoutEnabled })}
              className={`w-12 h-6 rounded-full transition-colors relative ${
                settings.autoPayoutEnabled ? 'bg-blue-500' : 'bg-white/20'
              }`}
            >
              <div
                className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-transform ${
                  settings.autoPayoutEnabled ? 'left-6' : 'left-0.5'
                }`}
              />
            </button>
          </div>
        </div>
      </div>

      {/* 帮助提示 */}
      <div className="bg-slate-800/50 border border-white/10 rounded-xl p-4">
        <div className="flex items-start gap-3">
          <Info className="w-5 h-5 text-blue-400 flex-shrink-0 mt-0.5" />
          <div className="text-sm text-slate-400">
            <p className="mb-2">
              <strong className="text-white">选择建议：</strong>
            </p>
            <ul className="list-disc list-inside space-y-1">
              <li>如果您需要法币直接入账银行卡，选择 <strong className="text-blue-400">Stripe Connect</strong></li>
              <li>如果您不想/无法完成 KYC，或在 Stripe 不支持的地区，选择 <strong className="text-purple-400">加密货币钱包</strong></li>
              <li>两种方式可以随时切换，不影响已累计的佣金</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PayoutSettingsPanel;
