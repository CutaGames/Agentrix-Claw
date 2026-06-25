'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  loadStripe,
  Stripe,
  StripeElements,
  StripeCardElement,
  PaymentRequest,
  PaymentRequestPaymentMethodEvent,
} from '@stripe/stripe-js';
import {
  Elements,
  CardElement,
  useStripe,
  useElements,
  PaymentElement,
} from '@stripe/react-stripe-js';
import {
  CreditCard,
  CheckCircle2,
  AlertCircle,
  Loader2,
  ShieldCheck,
  Lock,
  Apple,
  Chrome,
} from 'lucide-react';

// Stripe 公钥
const stripePromise = loadStripe(
  process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || ''
);

// 支付状态类型
type PaymentStatus = 'idle' | 'processing' | 'succeeded' | 'error';

// Stripe 支付组件属性
interface StripePaymentProps {
  amount: number;
  currency: string;
  orderId?: string;
  merchantId?: string;
  agentId?: string;
  description?: string;
  skillLayerType?: 'INFRA' | 'RESOURCE' | 'LOGIC' | 'COMPOSITE';
  onSuccess?: (result: {
    paymentIntentId: string;
    amount: number;
    currency: string;
  }) => void;
  onError?: (error: string) => void;
  onCancel?: () => void;
  // 自定义样式
  className?: string;
  showApplePay?: boolean;
  showGooglePay?: boolean;
}

// 卡片样式配置
const CARD_ELEMENT_OPTIONS = {
  style: {
    base: {
      color: '#32325d',
      fontFamily: '"Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      fontSmoothing: 'antialiased',
      fontSize: '16px',
      '::placeholder': {
        color: '#aab7c4',
      },
      padding: '12px',
    },
    invalid: {
      color: '#fa755a',
      iconColor: '#fa755a',
    },
  },
  hidePostalCode: true, // 国际支付通常不需要邮编
};

// 内部支付表单组件
const StripePaymentForm: React.FC<
  StripePaymentProps & { clientSecret: string }
> = ({
  amount,
  currency,
  orderId,
  merchantId,
  agentId,
  description,
  skillLayerType,
  clientSecret,
  onSuccess,
  onError,
  onCancel,
  showApplePay = true,
  showGooglePay = true,
}) => {
  const stripe = useStripe();
  const elements = useElements();
  const [status, setStatus] = useState<PaymentStatus>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [cardComplete, setCardComplete] = useState(false);

  // Apple Pay / Google Pay 支持
  const [canMakePayment, setCanMakePayment] = useState(false);
  const [paymentRequest, setPaymentRequest] = useState<PaymentRequest | null>(null);

  // 初始化 Payment Request（Apple Pay / Google Pay）
  useEffect(() => {
    if (!stripe) return;

    const pr = stripe.paymentRequest({
      country: 'US',
      currency: currency.toLowerCase(),
      total: {
        label: description || 'Agentrix Payment',
        amount: Math.round(amount * 100),
      },
      requestPayerName: true,
      requestPayerEmail: true,
    });

    // 检查设备是否支持
    pr.canMakePayment().then((result: any) => {
      if (result) {
        setPaymentRequest(pr);
        setCanMakePayment(true);
      }
    });

    // 监听支付方法选择
    pr.on('paymentmethod', async (event: PaymentRequestPaymentMethodEvent) => {
      if (!clientSecret) {
        event.complete('fail');
        return;
      }

      setStatus('processing');

      const { error, paymentIntent } = await stripe.confirmCardPayment(
        clientSecret,
        { payment_method: event.paymentMethod.id },
        { handleActions: false }
      );

      if (error) {
        event.complete('fail');
        setStatus('error');
        setErrorMessage(error.message || 'Payment failed');
        onError?.(error.message || 'Payment failed');
      } else if (paymentIntent?.status === 'succeeded') {
        event.complete('success');
        setStatus('succeeded');
        onSuccess?.({
          paymentIntentId: paymentIntent.id,
          amount,
          currency,
        });
      } else if (paymentIntent?.status === 'requires_action') {
        event.complete('success');
        // Handle 3D Secure
        const { error: confirmError, paymentIntent: confirmedIntent } =
          await stripe.confirmCardPayment(clientSecret);
        
        if (confirmError) {
          setStatus('error');
          setErrorMessage(confirmError.message || 'Authentication failed');
        } else if (confirmedIntent?.status === 'succeeded') {
          setStatus('succeeded');
          onSuccess?.({
            paymentIntentId: confirmedIntent.id,
            amount,
            currency,
          });
        }
      }
    });
  }, [stripe, amount, currency, description, clientSecret, onSuccess, onError]);

  // 处理卡片输入变化
  const handleCardChange = (event: any) => {
    setCardComplete(event.complete);
    if (event.error) {
      setErrorMessage(event.error.message);
    } else {
      setErrorMessage(null);
    }
  };

  // 提交支付
  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();

    if (!stripe || !elements) {
      return;
    }

    const cardElement = elements.getElement(CardElement);
    if (!cardElement) {
      return;
    }

    setStatus('processing');
    setErrorMessage(null);

    try {
      const { error, paymentIntent } = await stripe.confirmCardPayment(
        clientSecret,
        {
          payment_method: {
            card: cardElement,
            billing_details: {
              // 可以添加账单信息
            },
          },
        }
      );

      if (error) {
        setStatus('error');
        setErrorMessage(error.message || 'Payment failed');
        onError?.(error.message || 'Payment failed');
      } else if (paymentIntent?.status === 'succeeded') {
        setStatus('succeeded');
        onSuccess?.({
          paymentIntentId: paymentIntent.id,
          amount,
          currency,
        });
      } else if (paymentIntent?.status === 'requires_action') {
        // 3D Secure 验证
        const { error: confirmError, paymentIntent: confirmedIntent } =
          await stripe.confirmCardPayment(clientSecret);

        if (confirmError) {
          setStatus('error');
          setErrorMessage(confirmError.message || 'Authentication failed');
          onError?.(confirmError.message || 'Authentication failed');
        } else if (confirmedIntent?.status === 'succeeded') {
          setStatus('succeeded');
          onSuccess?.({
            paymentIntentId: confirmedIntent.id,
            amount,
            currency,
          });
        }
      }
    } catch (err: any) {
      setStatus('error');
      setErrorMessage(err.message || 'An unexpected error occurred');
      onError?.(err.message || 'An unexpected error occurred');
    }
  };

  // 格式化金额显示
  const formatAmount = (amount: number, currency: string) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency.toUpperCase(),
    }).format(amount);
  };

  // 成功状态
  if (status === 'succeeded') {
    return (
      <div className="p-6 text-center">
        <div className="w-16 h-16 mx-auto mb-4 bg-green-100 rounded-full flex items-center justify-center">
          <CheckCircle2 className="w-10 h-10 text-green-600" />
        </div>
        <h3 className="text-xl font-semibold text-gray-900 mb-2">
          Payment Successful!
        </h3>
        <p className="text-gray-600">
          Your payment of {formatAmount(amount, currency)} has been processed.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* 支付金额显示 */}
      <div className="bg-gray-50 rounded-lg p-4">
        <div className="flex justify-between items-center">
          <span className="text-gray-600">Amount</span>
          <span className="text-2xl font-bold text-gray-900">
            {formatAmount(amount, currency)}
          </span>
        </div>
        {description && (
          <p className="text-sm text-gray-500 mt-2">{description}</p>
        )}
      </div>

      {/* Apple Pay / Google Pay 按钮 */}
      {canMakePayment && (showApplePay || showGooglePay) && (
        <div className="space-y-3">
          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-gray-200" />
            </div>
            <div className="relative flex justify-center text-sm">
              <span className="px-4 bg-white text-gray-500">Express Checkout</span>
            </div>
          </div>

          <button
            type="button"
            onClick={() => paymentRequest?.show()}
            className="w-full py-3 bg-black text-white rounded-lg font-medium flex items-center justify-center gap-2 hover:bg-gray-900 transition-colors"
          >
            <Apple className="w-5 h-5" />
            Pay
          </button>
        </div>
      )}

      {/* 分隔线 */}
      {canMakePayment && (
        <div className="relative">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-gray-200" />
          </div>
          <div className="relative flex justify-center text-sm">
            <span className="px-4 bg-white text-gray-500">Or pay with card</span>
          </div>
        </div>
      )}

      {/* 卡片输入 */}
      <div className="space-y-2">
        <label className="block text-sm font-medium text-gray-700">
          Card Details
        </label>
        <div className="border border-gray-300 rounded-lg p-3 bg-white focus-within:border-blue-500 focus-within:ring-1 focus-within:ring-blue-500 transition-all">
          <CardElement
            options={CARD_ELEMENT_OPTIONS}
            onChange={handleCardChange}
          />
        </div>
        {errorMessage && (
          <div className="flex items-center gap-2 text-red-600 text-sm">
            <AlertCircle className="w-4 h-4" />
            {errorMessage}
          </div>
        )}
      </div>

      {/* 安全提示 */}
      <div className="flex items-center gap-2 text-sm text-gray-500">
        <ShieldCheck className="w-4 h-4 text-green-600" />
        <span>Your payment is secured with 256-bit encryption</span>
      </div>

      {/* 提交按钮 */}
      <div className="flex gap-3">
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 py-3 border border-gray-300 rounded-lg font-medium text-gray-700 hover:bg-gray-50 transition-colors"
            disabled={status === 'processing'}
          >
            Cancel
          </button>
        )}
        <button
          type="submit"
          disabled={!stripe || !cardComplete || status === 'processing'}
          className={`flex-1 py-3 rounded-lg font-medium flex items-center justify-center gap-2 transition-colors ${
            !stripe || !cardComplete || status === 'processing'
              ? 'bg-gray-300 cursor-not-allowed text-gray-500'
              : 'bg-blue-600 hover:bg-blue-700 text-white'
          }`}
        >
          {status === 'processing' ? (
            <>
              <Loader2 className="w-5 h-5 animate-spin" />
              Processing...
            </>
          ) : (
            <>
              <Lock className="w-4 h-4" />
              Pay {formatAmount(amount, currency)}
            </>
          )}
        </button>
      </div>

      {/* Stripe 品牌 */}
      <div className="flex items-center justify-center gap-2 text-xs text-gray-400">
        <CreditCard className="w-4 h-4" />
        <span>Powered by Stripe</span>
      </div>
    </form>
  );
};

// 主 Stripe 支付组件
export const StripePayment: React.FC<StripePaymentProps> = (props) => {
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // 初始化：创建 PaymentIntent
  useEffect(() => {
    const createPaymentIntent = async () => {
      try {
        setLoading(true);
        setError(null);

        const response = await fetch('/api/payments/stripe/create-intent', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            amount: props.amount,
            currency: props.currency,
            orderId: props.orderId,
            merchantId: props.merchantId,
            agentId: props.agentId,
            description: props.description,
            skillLayerType: props.skillLayerType,
          }),
        });

        if (!response.ok) {
          throw new Error('Failed to create payment intent');
        }

        const data = await response.json();
        setClientSecret(data.clientSecret);
      } catch (err: any) {
        setError(err.message || 'Failed to initialize payment');
        props.onError?.(err.message || 'Failed to initialize payment');
      } finally {
        setLoading(false);
      }
    };

    createPaymentIntent();
  }, [props.amount, props.currency]);

  // 加载状态
  if (loading) {
    return (
      <div className={`p-6 ${props.className || ''}`}>
        <div className="flex flex-col items-center justify-center py-8">
          <Loader2 className="w-8 h-8 animate-spin text-blue-600 mb-4" />
          <p className="text-gray-600">Initializing payment...</p>
        </div>
      </div>
    );
  }

  // 错误状态
  if (error || !clientSecret) {
    return (
      <div className={`p-6 ${props.className || ''}`}>
        <div className="flex flex-col items-center justify-center py-8">
          <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mb-4">
            <AlertCircle className="w-8 h-8 text-red-600" />
          </div>
          <h3 className="text-lg font-semibold text-gray-900 mb-2">
            Payment Initialization Failed
          </h3>
          <p className="text-gray-600 text-center mb-4">
            {error || 'Unable to initialize payment. Please try again.'}
          </p>
          <button
            onClick={() => window.location.reload()}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            Try Again
          </button>
        </div>
      </div>
    );
  }

  // Stripe Elements Provider
  return (
    <div className={`bg-white rounded-xl shadow-lg ${props.className || ''}`}>
      <Elements
        stripe={stripePromise}
        options={{
          clientSecret,
          appearance: {
            theme: 'stripe',
            variables: {
              colorPrimary: '#2563eb',
              fontFamily: '"Inter", -apple-system, BlinkMacSystemFont, sans-serif',
            },
          },
        }}
      >
        <StripePaymentForm {...props} clientSecret={clientSecret} />
      </Elements>
    </div>
  );
};

// 简化版 Stripe 支付按钮（用于快速集成）
export const StripePayButton: React.FC<{
  amount: number;
  currency: string;
  label?: string;
  onSuccess?: (result: any) => void;
  onError?: (error: string) => void;
  className?: string;
}> = ({ amount, currency, label, onSuccess, onError, className }) => {
  const [showModal, setShowModal] = useState(false);

  const formatAmount = (amount: number, currency: string) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency.toUpperCase(),
    }).format(amount);
  };

  return (
    <>
      <button
        onClick={() => setShowModal(true)}
        className={`flex items-center justify-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors ${className || ''}`}
      >
        <CreditCard className="w-5 h-5" />
        {label || `Pay ${formatAmount(amount, currency)}`}
      </button>

      {/* 支付模态框 */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
          <div className="max-w-md w-full mx-4">
            <StripePayment
              amount={amount}
              currency={currency}
              onSuccess={(result) => {
                onSuccess?.(result);
                setShowModal(false);
              }}
              onError={onError}
              onCancel={() => setShowModal(false)}
            />
          </div>
        </div>
      )}
    </>
  );
};

export default StripePayment;
