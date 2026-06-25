import React, { useState, useEffect } from 'react';
import { 
  CreditCard, 
  Wallet, 
  DollarSign, 
  AlertCircle,
  CheckCircle2,
  Info,
  ExternalLink,
  ArrowRight,
  RefreshCw,
  TrendingUp,
  Clock,
  Users,
  Zap,
  Link2,
  Shield
} from 'lucide-react';
import { useLocalization } from '../../../../contexts/LocalizationContext';

interface ConnectAccount {
  id: string;
  status: 'pending' | 'active' | 'restricted';
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
  email: string;
  country: string;
  created: number;
}

interface ConnectStats {
  totalEarnings: number;
  pendingSettlement: number;
  lastSettlement: number;
  settlementCount: number;
}

const API_BASE = process.env.NEXT_PUBLIC_API_URL || '';

// Helper to get auth token from localStorage
const getAuthToken = () => {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('access_token') || localStorage.getItem('token');
};

export const StripeConnectPanel: React.FC = () => {
  const { t } = useLocalization();
  const [loading, setLoading] = useState(true);
  const [account, setAccount] = useState<ConnectAccount | null>(null);
  const [stats, setStats] = useState<ConnectStats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    loadConnectAccount();
  }, []);

  const loadConnectAccount = async () => {
    try {
      setLoading(true);
      setError(null);
      const token = getAuthToken();
      const response = await fetch(`${API_BASE}/api/payments/connect/account`, {
        credentials: 'include',
        headers: {
          ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
        },
      });
      
      if (response.ok) {
        const data = await response.json();
        setAccount(data.account);
        setStats(data.stats);
      } else if (response.status === 404) {
        setAccount(null);
      } else {
        // 可能是测试环境没有配置 Stripe
        setAccount(null);
        console.log('Stripe Connect not configured or not available');
      }
    } catch (err: any) {
      console.error('加载 Stripe Connect 账户失败:', err);
      setAccount(null);
    } finally {
      setLoading(false);
    }
  };

  const handleConnectStripe = async () => {
    try {
      setConnecting(true);
      setError(null);

      const token = getAuthToken();
      const response = await fetch(`${API_BASE}/api/payments/connect/onboarding`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
        },
        credentials: 'include',
        body: JSON.stringify({
          returnUrl: `${window.location.origin}/workbench?mode=merchant&l1=finance&l2=stripe-connect&success=true`,
          refreshUrl: `${window.location.origin}/workbench?mode=merchant&l1=finance&l2=stripe-connect`,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || '创建 Stripe 入驻链接失败');
      }

      const data = await response.json();
      window.location.href = data.url;
    } catch (err: any) {
      console.error('Stripe Connect 入驻失败:', err);
      setError(err.message || '入驻失败，请重试');
      setConnecting(false);
    }
  };

  const handleDashboard = async () => {
    try {
      const token = getAuthToken();
      const response = await fetch(`${API_BASE}/api/payments/connect/dashboard-link`, {
        method: 'POST',
        credentials: 'include',
        headers: {
          ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
        },
      });

      if (!response.ok) {
        throw new Error('创建仪表板链接失败');
      }

      const data = await response.json();
      window.open(data.url, '_blank');
    } catch (err: any) {
      console.error('打开 Stripe 仪表板失败:', err);
      setError(err.message || '操作失败，请重试');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <RefreshCw className="animate-spin text-blue-400" size={32} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <CreditCard className="text-blue-400" size={24} />
            Stripe Connect
          </h2>
          <p className="text-sm text-slate-400 mt-1">
            {t({ zh: '通过 Stripe Connect 接收法币支付和自动分账', en: 'Accept fiat payments and automatic settlements via Stripe Connect' })}
          </p>
        </div>
        {account && (
          <button
            onClick={handleDashboard}
            className="flex items-center gap-2 px-4 py-2 bg-slate-700/50 hover:bg-slate-700 text-white rounded-lg transition-colors text-sm"
          >
            <ExternalLink size={16} />
            {t({ zh: '打开 Stripe 仪表板', en: 'Open Stripe Dashboard' })}
          </button>
        )}
      </div>

      {/* Error Message */}
      {error && (
        <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-xl flex items-center gap-3">
          <AlertCircle className="text-red-400 flex-shrink-0" size={20} />
          <span className="text-red-300">{error}</span>
        </div>
      )}

      {/* Success Message */}
      {success && (
        <div className="p-4 bg-emerald-500/10 border border-emerald-500/30 rounded-xl flex items-center gap-3">
          <CheckCircle2 className="text-emerald-400 flex-shrink-0" size={20} />
          <span className="text-emerald-300">{success}</span>
        </div>
      )}

      {!account ? (
        /* 未连接状态 */
        <div className="bg-slate-800/50 border border-slate-700/50 rounded-2xl p-8">
          <div className="text-center max-w-2xl mx-auto">
            <div className="mb-6">
              <div className="inline-flex items-center justify-center w-16 h-16 bg-blue-500/10 rounded-2xl mb-4">
                <CreditCard className="text-blue-400" size={32} />
              </div>
              <h3 className="text-2xl font-bold text-white mb-2">
                {t({ zh: '连接 Stripe 开始收款', en: 'Connect Stripe to Start Receiving Payments' })}
              </h3>
              <p className="text-slate-400">
                {t({ zh: 'Stripe Connect 支持全球超过 135 种货币和多种支付方式，包括信用卡、Apple Pay、Google Pay 等', en: 'Stripe Connect supports over 135 currencies and multiple payment methods including credit cards, Apple Pay, Google Pay, etc.' })}
              </p>
            </div>

            <div className="grid md:grid-cols-3 gap-4 mb-8">
              <div className="p-4 bg-slate-900/50 rounded-xl border border-slate-700/30">
                <TrendingUp className="text-blue-400 mb-2 mx-auto" size={24} />
                <div className="font-semibold text-white mb-1">{t({ zh: '自动分账', en: 'Auto Split' })}</div>
                <div className="text-xs text-slate-500">
                  {t({ zh: 'V5.0 五方分账模型，自动分配', en: 'V5.0 5-party split model' })}
                </div>
              </div>
              <div className="p-4 bg-slate-900/50 rounded-xl border border-slate-700/30">
                <Clock className="text-blue-400 mb-2 mx-auto" size={24} />
                <div className="font-semibold text-white mb-1">{t({ zh: 'T+3 结算', en: 'T+3 Settlement' })}</div>
                <div className="text-xs text-slate-500">
                  {t({ zh: '3个工作日自动转账', en: 'Auto transfer in 3 business days' })}
                </div>
              </div>
              <div className="p-4 bg-slate-900/50 rounded-xl border border-slate-700/30">
                <Zap className="text-blue-400 mb-2 mx-auto" size={24} />
                <div className="font-semibold text-white mb-1">{t({ zh: '低费率', en: 'Low Fees' })}</div>
                <div className="text-xs text-slate-500">
                  {t({ zh: 'Stripe 2.9% + $0.30', en: 'Stripe 2.9% + $0.30' })}
                </div>
              </div>
            </div>

            <div className="mb-6 p-4 bg-blue-500/5 border border-blue-500/20 rounded-xl flex items-start gap-3">
              <Info className="text-blue-400 flex-shrink-0 mt-0.5" size={20} />
              <div className="text-left text-sm text-blue-200">
                <div className="font-semibold mb-1">{t({ zh: '入驻需要准备：', en: 'Required for onboarding:' })}</div>
                <ul className="list-disc list-inside space-y-1 text-blue-300/80">
                  <li>{t({ zh: '企业或个人身份信息', en: 'Business or personal ID' })}</li>
                  <li>{t({ zh: '银行账户信息（用于收款）', en: 'Bank account information' })}</li>
                  <li>{t({ zh: '业务描述和网站（可选）', en: 'Business description and website (optional)' })}</li>
                </ul>
              </div>
            </div>

            <button
              onClick={handleConnectStripe}
              disabled={connecting}
              className="inline-flex items-center gap-2 bg-blue-600 text-white px-8 py-3 rounded-xl hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-bold"
            >
              {connecting ? (
                <>
                  <RefreshCw className="animate-spin" size={20} />
                  <span>{t({ zh: '连接中...', en: 'Connecting...' })}</span>
                </>
              ) : (
                <>
                  <Link2 size={20} />
                  <span>{t({ zh: '连接 Stripe Connect', en: 'Connect Stripe' })}</span>
                  <ArrowRight size={16} />
                </>
              )}
            </button>
          </div>
        </div>
      ) : (
        /* 已连接状态 */
        <>
          {/* 账户状态 */}
          <div className="bg-slate-800/50 border border-slate-700/50 rounded-2xl p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <CheckCircle2 className="text-emerald-400" size={24} />
                <h3 className="text-lg font-bold text-white">{t({ zh: '账户已连接', en: 'Account Connected' })}</h3>
              </div>
            </div>

            <div className="grid md:grid-cols-3 gap-4 mb-4">
              <div>
                <div className="text-xs text-slate-500 mb-1">{t({ zh: '账户 ID', en: 'Account ID' })}</div>
                <div className="font-mono text-sm text-white">{account.id}</div>
              </div>
              <div>
                <div className="text-xs text-slate-500 mb-1">{t({ zh: '邮箱', en: 'Email' })}</div>
                <div className="text-sm text-white">{account.email}</div>
              </div>
              <div>
                <div className="text-xs text-slate-500 mb-1">{t({ zh: '国家', en: 'Country' })}</div>
                <div className="text-sm text-white">{account.country}</div>
              </div>
            </div>

            <div className="flex gap-4">
              <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-bold ${
                account.chargesEnabled 
                  ? 'bg-emerald-500/10 text-emerald-400' 
                  : 'bg-amber-500/10 text-amber-400'
              }`}>
                {account.chargesEnabled ? <CheckCircle2 size={14} /> : <Clock size={14} />}
                <span>{account.chargesEnabled ? t({ zh: '可接收支付', en: 'Can Accept Payments' }) : t({ zh: '等待审核', en: 'Pending Review' })}</span>
              </div>
              <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-bold ${
                account.payoutsEnabled 
                  ? 'bg-emerald-500/10 text-emerald-400' 
                  : 'bg-amber-500/10 text-amber-400'
              }`}>
                {account.payoutsEnabled ? <CheckCircle2 size={14} /> : <Clock size={14} />}
                <span>{account.payoutsEnabled ? t({ zh: '可接收转账', en: 'Can Receive Transfers' }) : t({ zh: '等待审核', en: 'Pending Review' })}</span>
              </div>
            </div>
          </div>

          {/* 收款统计 */}
          {stats && (
            <div className="grid md:grid-cols-4 gap-4">
              <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-4">
                <div className="flex items-center gap-2 mb-2 text-slate-400">
                  <DollarSign size={16} />
                  <span className="text-xs">{t({ zh: '总收益', en: 'Total Earnings' })}</span>
                </div>
                <div className="text-2xl font-bold text-emerald-400">
                  ${stats.totalEarnings.toFixed(2)}
                </div>
              </div>

              <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-4">
                <div className="flex items-center gap-2 mb-2 text-slate-400">
                  <Clock size={16} />
                  <span className="text-xs">{t({ zh: '待结算', en: 'Pending' })}</span>
                </div>
                <div className="text-2xl font-bold text-amber-400">
                  ${stats.pendingSettlement.toFixed(2)}
                </div>
              </div>

              <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-4">
                <div className="flex items-center gap-2 mb-2 text-slate-400">
                  <Wallet size={16} />
                  <span className="text-xs">{t({ zh: '上次结算', en: 'Last Settlement' })}</span>
                </div>
                <div className="text-2xl font-bold text-white">
                  ${stats.lastSettlement.toFixed(2)}
                </div>
              </div>

              <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-4">
                <div className="flex items-center gap-2 mb-2 text-slate-400">
                  <Users size={16} />
                  <span className="text-xs">{t({ zh: '结算次数', en: 'Settlements' })}</span>
                </div>
                <div className="text-2xl font-bold text-white">
                  {stats.settlementCount}
                </div>
              </div>
            </div>
          )}

          {/* V5.0 分账说明 */}
          <div className="bg-gradient-to-br from-blue-900/20 to-purple-900/20 rounded-2xl border border-blue-500/20 p-6">
            <h4 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
              <Shield className="text-blue-400" size={20} />
              {t({ zh: 'V5.0 五方分账模型', en: 'V5.0 5-Party Settlement Model' })}
            </h4>
            <div className="grid md:grid-cols-2 gap-6">
              <div>
                <div className="font-medium text-white mb-3">{t({ zh: '收益分配', en: 'Revenue Distribution' })}</div>
                <ul className="space-y-2 text-sm text-slate-300">
                  <li className="flex justify-between">
                    <span>{t({ zh: '商户（您）', en: 'Merchant (You)' })}</span>
                    <span className="font-semibold text-emerald-400">{t({ zh: '净额 - 管理费 - 激励池', en: 'Net - Fee - Pool' })}</span>
                  </li>
                  <li className="flex justify-between">
                    <span>{t({ zh: '执行 Agent', en: 'Execution Agent' })}</span>
                    <span className="font-semibold text-blue-400">{t({ zh: '激励池 × 70%', en: 'Pool × 70%' })}</span>
                  </li>
                  <li className="flex justify-between">
                    <span>{t({ zh: '推荐 Agent', en: 'Recommendation Agent' })}</span>
                    <span className="font-semibold text-purple-400">{t({ zh: '激励池 × 30%', en: 'Pool × 30%' })}</span>
                  </li>
                  <li className="flex justify-between">
                    <span>{t({ zh: '推广 Agent', en: 'Referral Agent' })}</span>
                    <span className="font-semibold text-amber-400">{t({ zh: '管理费 × 20%', en: 'Fee × 20%' })}</span>
                  </li>
                </ul>
              </div>
              <div>
                <div className="font-medium text-white mb-3">{t({ zh: '$100 实物商品示例', en: '$100 Physical Product Example' })}</div>
                <ul className="space-y-2 text-sm text-slate-300">
                  <li className="flex justify-between">
                    <span>{t({ zh: 'Stripe 通道费', en: 'Stripe Fee' })}</span>
                    <span className="text-slate-500">$3.20</span>
                  </li>
                  <li className="flex justify-between">
                    <span>{t({ zh: '平台管理费 (0.5%)', en: 'Platform Fee (0.5%)' })}</span>
                    <span className="text-slate-500">$0.50</span>
                  </li>
                  <li className="flex justify-between">
                    <span>{t({ zh: '激励池 (2.5%)', en: 'Incentive Pool (2.5%)' })}</span>
                    <span className="text-slate-500">$2.50</span>
                  </li>
                  <li className="flex justify-between border-t border-slate-700 pt-2">
                    <span className="font-semibold">{t({ zh: '您最终所得', en: 'Your Net' })}</span>
                    <span className="font-bold text-emerald-400">$93.80</span>
                  </li>
                </ul>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
};
