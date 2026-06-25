/**
 * Checkout Success Page
 * 
 * 支付成功后的确认页面
 */

import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import Link from 'next/link';

export default function CheckoutSuccess() {
  const router = useRouter();
  const { session_id, payment_intent } = router.query;
  
  const [orderDetails, setOrderDetails] = useState<{
    productName?: string;
    amount?: number;
    currency?: string;
    email?: string;
  } | null>(null);

  useEffect(() => {
    if (!router.isReady) return;

    // 可以根据 session_id 或 payment_intent 获取订单详情
    // 这里简化处理
    if (session_id || payment_intent) {
      // TODO: Fetch order details from backend
      setOrderDetails({});
    }
  }, [router.isReady, session_id, payment_intent]);

  return (
    <>
      <Head>
        <title>支付成功 | Agentrix</title>
        <meta name="robots" content="noindex" />
      </Head>

      <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
        <div className="max-w-md w-full">
          {/* Success Card */}
          <div className="bg-slate-900 rounded-2xl p-8 border border-slate-800 text-center">
            {/* Success Icon */}
            <div className="w-20 h-20 bg-emerald-500/20 rounded-full flex items-center justify-center mx-auto mb-6">
              <svg className="w-10 h-10 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>

            {/* Title */}
            <h1 className="text-2xl font-bold text-white mb-2">支付成功！</h1>
            <p className="text-slate-400 mb-6">
              感谢您的购买，订单确认已发送到您的邮箱
            </p>

            {/* Order Info */}
            {orderDetails?.productName && (
              <div className="bg-slate-800/50 rounded-xl p-4 mb-6 text-left">
                <p className="text-sm text-slate-400 mb-1">订单商品</p>
                <p className="text-white font-medium">{orderDetails.productName}</p>
                {orderDetails.amount && (
                  <p className="text-emerald-400 mt-2">
                    {orderDetails.currency} {orderDetails.amount.toFixed(2)}
                  </p>
                )}
              </div>
            )}

            {/* Next Steps */}
            <div className="bg-blue-500/10 border border-blue-500/30 rounded-xl p-4 mb-6 text-left">
              <p className="text-blue-400 font-medium mb-2">📧 下一步</p>
              <ul className="text-sm text-slate-300 space-y-1">
                <li>• 订单确认邮件已发送</li>
                <li>• 商家将尽快处理您的订单</li>
                <li>• 如有问题，请联系客服</li>
              </ul>
            </div>

            {/* CTA */}
            <div className="space-y-3">
              <Link
                href="/"
                className="block w-full py-3 bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-semibold rounded-xl hover:opacity-90 transition"
              >
                返回首页
              </Link>
              
              <Link
                href="/register"
                className="block w-full py-3 bg-slate-800 text-white rounded-xl hover:bg-slate-700 transition"
              >
                注册账户，追踪订单
              </Link>
            </div>

            {/* Tip */}
            <p className="text-xs text-slate-500 mt-6">
              💡 注册 Agentrix 账户可享受：订单追踪、快速支付、专属优惠
            </p>
          </div>

          {/* Back to Chat hint */}
          <div className="mt-6 text-center">
            <p className="text-sm text-slate-500">
              您可以关闭此页面，返回 AI 对话继续购物
            </p>
          </div>
        </div>
      </div>
    </>
  );
}
