'use client';

import React from 'react';
import { Zap, Loader2 } from 'lucide-react';
import { useQuickPay } from '@/hooks/useQuickPay';
import { formatAmount } from '@/utils/payment-helpers';

interface QuickPayButtonProps {
  paymentId: string;
  to: string;
  amount: number;
  currency?: string;
  onSuccess?: (result: any) => void;
  onError?: (error: Error) => void;
  className?: string;
}

export function QuickPayButton({
  paymentId,
  to,
  amount,
  currency = 'USDC',
  onSuccess,
  onError,
  className = '',
}: QuickPayButtonProps) {
  const { executeQuickPay, processing, error, canUseQuickPay } = useQuickPay();

  const handleClick = async () => {
    try {
      const result = await executeQuickPay({
        paymentId,
        to,
        amount,
        currency,
      });
      if (onSuccess) {
        onSuccess(result);
      }
    } catch (err: any) {
      if (onError) {
        onError(err);
      }
    }
  };

  if (!canUseQuickPay) {
    return null; // 如果没有活跃 Session，不显示按钮
  }

  return (
    <button
      onClick={handleClick}
      disabled={processing}
      className={`
        group relative w-full bg-gradient-to-r from-indigo-600 to-purple-600 
        hover:from-indigo-500 hover:to-purple-500 text-white py-4 rounded-2xl 
        font-bold text-lg shadow-lg shadow-indigo-500/30 transition-all 
        active:scale-[0.98] flex items-center justify-center gap-2 
        overflow-hidden disabled:opacity-50 disabled:cursor-not-allowed
        ${className}
      `}
    >
      <div className="absolute inset-0 bg-white/20 group-hover:translate-x-full transition-transform duration-700 skew-x-12 -translate-x-full"></div>
      {processing ? (
        <>
          <Loader2 className="animate-spin" size={20} />
          <span>Processing...</span>
        </>
      ) : (
        <>
          <Zap className="fill-current" size={20} />
          <span>Quick Pay {formatAmount(amount, currency)}</span>
        </>
      )}
      {error && (
        <div className="absolute bottom-0 left-0 right-0 bg-red-500 text-white text-xs py-1 px-2">
          {error}
        </div>
      )}
    </button>
  );
}

