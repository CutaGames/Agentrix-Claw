import { useState, useEffect } from 'react';
import { paymentApi } from '@/lib/api/payment.api';

export interface PreflightResult {
  recommendedRoute: 'quickpay' | 'wallet' | 'crypto-rail' | 'local-rail';
  quickPayAvailable: boolean;
  sessionLimit?: {
    singleLimit: string;
    dailyLimit: string;
    dailyRemaining: string;
  };
  walletBalance?: string;
  walletBalanceIsMock?: boolean; // 标记余额是否为 mock 值
  requiresKYC?: boolean;
  estimatedTime?: string;
  fees?: {
    gasFee?: string;
    providerFee?: string;
    total?: string;
  };
}

export function usePreflightCheck(amount: number, currency: string = 'USDC') {
  const [result, setResult] = useState<PreflightResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const check = async () => {
    if (!amount || amount <= 0) {
      return;
    }

    try {
      setLoading(true);
      setError(null);
      const data = await paymentApi.preflightCheck({
        amount: amount.toString(),
        currency,
      });
      setResult(data);
    } catch (err: any) {
      console.error('Pre-flight check failed:', err);
      setError(err.message || 'Failed to check payment options');
      // 设置默认结果
      setResult({
        recommendedRoute: 'crypto-rail',
        quickPayAvailable: false,
        requiresKYC: true,
        estimatedTime: '2-5 minutes',
      });
    } finally {
      setLoading(false);
    }
  };

  // 自动检查（当 amount 或 currency 变化时）
  useEffect(() => {
    check();
  }, [amount, currency]);

  return {
    result,
    loading,
    error,
    check, // 手动触发检查
  };
}

