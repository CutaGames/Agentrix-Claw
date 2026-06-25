/**
 * Guest Checkout Pay Page
 * 
 * 游客支付页面 - 支持从 Agent 对话跳转过来的无账户用户完成支付
 * URL: /checkout/pay?productId=xxx&quantity=1&email=xxx&guestSessionId=xxx
 */

import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import { loadStripe } from '@stripe/stripe-js';
import { 
  Elements, 
  PaymentElement, 
  useStripe, 
  useElements 
} from '@stripe/react-stripe-js';

// Stripe public key
const stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || '');

interface ProductInfo {
  id: string;
  name: string;
  description?: string;
  price: number;
  currency: string;
  image?: string;
}

interface CheckoutState {
  loading: boolean;
  error: string | null;
  product: ProductInfo | null;
  quantity: number;
  email: string;
  guestSessionId: string;
  clientSecret: string | null;
  paymentStatus: 'idle' | 'processing' | 'success' | 'error';
}

function CheckoutForm({ 
  product, 
  quantity, 
  email,
  onSuccess 
}: { 
  product: ProductInfo; 
  quantity: number; 
  email: string;
  onSuccess: () => void;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!stripe || !elements) return;

    setProcessing(true);
    setError(null);

    const { error: submitError } = await elements.submit();
    if (submitError) {
      setError(submitError.message || '支付信息验证失败');
      setProcessing(false);
      return;
    }

    const { error: confirmError } = await stripe.confirmPayment({
      elements,
      confirmParams: {
        return_url: `${window.location.origin}/checkout/success`,
        receipt_email: email,
      },
    });

    if (confirmError) {
      setError(confirmError.message || '支付失败，请重试');
      setProcessing(false);
    } else {
      onSuccess();
    }
  };

  const totalPrice = product.price * quantity;

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Order Summary */}
      <div className="bg-slate-800/50 rounded-xl p-4 border border-slate-700">
        <h3 className="text-sm font-medium text-slate-400 mb-3">订单详情</h3>
        <div className="flex justify-between items-start">
          <div>
            <p className="font-medium text-white">{product.name}</p>
            <p className="text-sm text-slate-400">数量: {quantity}</p>
          </div>
          <p className="text-lg font-bold text-white">
            {product.currency} {totalPrice.toFixed(2)}
          </p>
        </div>
      </div>

      {/* Email */}
      <div>
        <label className="block text-sm font-medium text-slate-300 mb-2">
          邮箱地址
        </label>
        <input
          type="email"
          value={email}
          disabled
          className="w-full px-4 py-3 bg-slate-800/50 border border-slate-700 rounded-lg text-white disabled:opacity-60"
        />
        <p className="text-xs text-slate-500 mt-1">订单确认将发送到此邮箱</p>
      </div>

      {/* Payment Element */}
      <div>
        <label className="block text-sm font-medium text-slate-300 mb-2">
          支付方式
        </label>
        <div className="bg-white rounded-lg p-4">
          <PaymentElement />
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3">
          <p className="text-red-400 text-sm">{error}</p>
        </div>
      )}

      {/* Submit */}
      <button
        type="submit"
        disabled={!stripe || processing}
        className="w-full py-4 bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-semibold rounded-xl hover:opacity-90 transition disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {processing ? (
          <span className="flex items-center justify-center gap-2">
            <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
            处理中...
          </span>
        ) : (
          `支付 ${product.currency} ${totalPrice.toFixed(2)}`
        )}
      </button>

      {/* Security Note */}
      <p className="text-xs text-slate-500 text-center">
        🔒 支付由 Stripe 安全处理 · 无需注册 Agentrix 账户
      </p>
    </form>
  );
}

export default function GuestCheckoutPay() {
  const router = useRouter();
  const { productId, quantity, email, guestSessionId, successUrl, cancelUrl } = router.query;

  const [state, setState] = useState<CheckoutState>({
    loading: true,
    error: null,
    product: null,
    quantity: 1,
    email: '',
    guestSessionId: '',
    clientSecret: null,
    paymentStatus: 'idle',
  });

  useEffect(() => {
    if (!router.isReady) return;

    const fetchProductAndCreateIntent = async () => {
      try {
        // Validate required params
        if (!productId || !email) {
          setState(prev => ({
            ...prev,
            loading: false,
            error: '缺少必要参数。请从 Agent 对话中重新发起购买。',
          }));
          return;
        }

        // Fetch product info
        const productRes = await fetch(`/api/products/${productId}`);
        if (!productRes.ok) throw new Error('商品不存在或已下架');
        const productData = await productRes.json();

        const qty = parseInt(quantity as string) || 1;
        const totalAmount = productData.price * qty;

        // Create Stripe PaymentIntent
        const intentRes = await fetch('/api/checkout/create-intent', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            productId,
            quantity: qty,
            email,
            guestSessionId,
          }),
        });

        if (!intentRes.ok) throw new Error('创建支付失败');
        const { clientSecret } = await intentRes.json();

        setState({
          loading: false,
          error: null,
          product: {
            id: productData.id,
            name: productData.name,
            description: productData.description,
            price: productData.price,
            currency: productData.metadata?.currency || 'CNY',
            image: productData.metadata?.image,
          },
          quantity: qty,
          email: email as string,
          guestSessionId: guestSessionId as string || '',
          clientSecret,
          paymentStatus: 'idle',
        });
      } catch (err: any) {
        setState(prev => ({
          ...prev,
          loading: false,
          error: err.message || '加载失败',
        }));
      }
    };

    fetchProductAndCreateIntent();
  }, [router.isReady, productId, quantity, email, guestSessionId]);

  const handlePaymentSuccess = () => {
    setState(prev => ({ ...prev, paymentStatus: 'success' }));
    // Redirect to success page
    const redirectUrl = (successUrl as string) || '/checkout/success';
    router.push(redirectUrl);
  };

  const handleCancel = () => {
    const redirectUrl = (cancelUrl as string) || '/';
    router.push(redirectUrl);
  };

  // Loading state
  if (state.loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin h-12 w-12 border-4 border-blue-500 border-t-transparent rounded-full mx-auto mb-4" />
          <p className="text-slate-400">加载中...</p>
        </div>
      </div>
    );
  }

  // Error state
  if (state.error) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-slate-900 rounded-2xl p-8 text-center">
          <div className="text-red-400 text-5xl mb-4">⚠️</div>
          <h1 className="text-xl font-bold text-white mb-2">出错了</h1>
          <p className="text-slate-400 mb-6">{state.error}</p>
          <button
            onClick={handleCancel}
            className="px-6 py-3 bg-slate-800 text-white rounded-lg hover:bg-slate-700 transition"
          >
            返回
          </button>
        </div>
      </div>
    );
  }

  return (
    <>
      <Head>
        <title>支付 - {state.product?.name} | Agentrix</title>
        <meta name="robots" content="noindex" />
      </Head>

      <div className="min-h-screen bg-slate-950 py-12 px-4">
        <div className="max-w-lg mx-auto">
          {/* Header */}
          <div className="text-center mb-8">
            <div className="inline-flex items-center gap-2 text-sm text-slate-400 mb-4">
              <span className="text-cyan-400">🛒</span>
              <span>Agentrix 安全结账</span>
            </div>
            <h1 className="text-2xl font-bold text-white">完成支付</h1>
            <p className="text-slate-400 mt-2">
              来自 AI Agent 的推荐商品
            </p>
          </div>

          {/* Checkout Card */}
          <div className="bg-slate-900 rounded-2xl p-6 border border-slate-800">
            {state.clientSecret && state.product ? (
              <Elements
                stripe={stripePromise}
                options={{
                  clientSecret: state.clientSecret,
                  appearance: {
                    theme: 'night',
                    variables: {
                      colorPrimary: '#3b82f6',
                      colorBackground: '#1e293b',
                      colorText: '#f8fafc',
                      colorDanger: '#ef4444',
                    },
                  },
                }}
              >
                <CheckoutForm
                  product={state.product}
                  quantity={state.quantity}
                  email={state.email}
                  onSuccess={handlePaymentSuccess}
                />
              </Elements>
            ) : (
              <div className="text-center py-8">
                <p className="text-slate-400">无法加载支付信息</p>
              </div>
            )}
          </div>

          {/* Cancel Link */}
          <div className="text-center mt-6">
            <button
              onClick={handleCancel}
              className="text-slate-500 hover:text-slate-300 text-sm transition"
            >
              取消支付，返回对话
            </button>
          </div>

          {/* Footer */}
          <div className="mt-8 text-center text-xs text-slate-600">
            <p>Powered by Agentrix · Product as Skill</p>
          </div>
        </div>
      </div>
    </>
  );
}
