import { useRouter } from 'next/router';
import { useEffect, useState } from 'react';
import { CheckCircle, ArrowRight } from 'lucide-react';
import { Navigation } from '../../components/ui/Navigation';
import { paymentApi, type PaymentInfo } from '../../lib/api/payment.api';

export default function PaymentSuccessPage() {
  const router = useRouter();
  const { paymentId, orderId } = router.query;
  const paymentIdParam = Array.isArray(paymentId) ? paymentId[0] : paymentId;
  const orderIdParam = Array.isArray(orderId) ? orderId[0] : orderId;
  const [payment, setPayment] = useState<PaymentInfo | null>(null);
  const [loadingPayment, setLoadingPayment] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchPayment = async () => {
      if (!paymentIdParam) {
        return;
      }
      try {
        setLoadingPayment(true);
        const info = await paymentApi.getPayment(paymentIdParam);
        setPayment(info);
        setError(null);
      } catch (err: any) {
        console.error('加载支付信息失败:', err);
        setError(err.message || '无法加载支付详情');
      } finally {
        setLoadingPayment(false);
      }
    };

    fetchPayment();
  }, [paymentIdParam]);

  const renderConversionInfo = () => {
    const originalAmount = payment?.metadata?.originalAmount;
    const originalCurrency = payment?.metadata?.originalCurrency;
    const cryptoAmount = payment?.metadata?.cryptoAmount || payment?.amount;
    const convertedCurrency = payment?.metadata?.convertedCurrency || payment?.currency;
    const rawRate =
      payment?.metadata?.conversionRate ||
      payment?.metadata?.exchangeRate ||
      payment?.metadata?.exchangeRateLock?.rate;
    const rate =
      typeof rawRate === 'number'
        ? rawRate
        : rawRate
        ? Number(rawRate)
        : undefined;

    if (!originalAmount || !originalCurrency || !cryptoAmount || !convertedCurrency) {
      return null;
    }

    return (
      <div className="p-4 bg-emerald-50 rounded-lg text-left space-y-1">
        <div className="text-xs text-emerald-700">汇率信息</div>
        <div className="text-sm text-emerald-900">
          {originalAmount} {originalCurrency} ≈ {cryptoAmount} {convertedCurrency}
        </div>
        {rate && !Number.isNaN(rate) && (
          <div className="text-xs text-emerald-700">
            锁定汇率：1 {originalCurrency} = {rate.toFixed(6)} {convertedCurrency}
          </div>
        )}
      </div>
    );
  };

  return (
    <>
      <Navigation />
      <div className="min-h-screen bg-gradient-to-br from-green-50 via-white to-blue-50 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-2xl shadow-xl p-8 text-center">
          <div className="mb-6">
            <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <CheckCircle className="w-12 h-12 text-green-600" />
            </div>
            <h1 className="text-3xl font-bold text-slate-900 mb-2">
              支付成功！
            </h1>
            <p className="text-slate-600">
              您的订单已成功处理
            </p>
          </div>

          {paymentIdParam && (
            <div className="mb-4 p-4 bg-slate-50 rounded-lg text-left">
              <div className="text-xs text-slate-500 mb-1">支付编号</div>
              <div className="text-sm font-mono text-slate-900 break-all">{paymentIdParam}</div>
            </div>
          )}

          {orderIdParam && (
            <div className="mb-4 p-4 bg-slate-50 rounded-lg text-left">
              <div className="text-xs text-slate-500 mb-1">订单号</div>
              <div className="text-sm font-mono text-slate-900 break-all">{orderIdParam}</div>
            </div>
          )}

          {loadingPayment && (
            <div className="mb-4 text-sm text-slate-500">正在加载支付详情...</div>
          )}

          {error && (
            <div className="mb-4 text-sm text-red-500">{error}</div>
          )}

          {payment && (
            <div className="mb-6 space-y-3 text-left">
              <div className="p-4 bg-indigo-50 rounded-lg">
                <div className="text-xs text-indigo-700">支付金额</div>
                <div className="text-lg font-semibold text-indigo-900">
                  {payment.amount} {payment.currency}
                </div>
                <div className="text-xs text-indigo-600">方式：{payment.paymentMethod}</div>
              </div>

              {renderConversionInfo()}

              {payment.metadata?.exchangeRateLock?.expiresAt && (
                <div className="text-xs text-slate-500">
                  汇率锁到期时间：{new Date(payment.metadata.exchangeRateLock.expiresAt).toLocaleString()}
                </div>
              )}
            </div>
          )}

          <div className="space-y-3">
            <button
              onClick={() => router.push('/marketplace')}
              className="w-full bg-indigo-600 text-white py-3 rounded-lg font-medium hover:bg-indigo-700 transition-colors flex items-center justify-center gap-2"
            >
              返回市场
              <ArrowRight size={18} />
            </button>
            <button
              onClick={() => router.push('/app/user/transactions')}
              className="w-full bg-slate-100 text-slate-700 py-3 rounded-lg font-medium hover:bg-slate-200 transition-colors"
            >
              查看订单
            </button>
          </div>

        </div>
      </div>
    </>
  );
}

