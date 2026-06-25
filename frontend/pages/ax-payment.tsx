/**
 * AX Payment - Agentrix 统一支付页面
 * 
 * 展示 Agentrix 支付解决方案的能力：
 * - QuickPay 无确认支付
 * - 智能路由优化
 * - 多链支持
 * - KYC 流程集成
 */

import Head from 'next/head';
import Link from 'next/link';
import { useState } from 'react';
import { Navigation } from '../components/ui/Navigation';
import { Footer } from '../components/layout/Footer';
import { useLocalization } from '../contexts/LocalizationContext';
import { useUser } from '../contexts/UserContext';
import { useWeb3 } from '../contexts/Web3Context';
import { SmartCheckout } from '../components/payment/SmartCheckout';
import { 
  Zap, 
  Shield, 
  Globe, 
  Wallet,
  CreditCard,
  QrCode,
  ArrowRight,
  Check,
  Star,
  TrendingUp,
  Lock,
  Clock,
  Sparkles,
} from 'lucide-react';

export default function AXPaymentPage() {
  const { t } = useLocalization();
  const { isAuthenticated, user } = useUser();
  const { isConnected, defaultWallet } = useWeb3();
  const [showCheckout, setShowCheckout] = useState(false);
  const [selectedDemo, setSelectedDemo] = useState<'product' | 'service' | 'subscription' | null>(null);

  // Demo 订单数据
  const demoOrders = {
    product: {
      id: 'demo-product-001',
      amount: 29.99,
      currency: 'USD',
      description: 'AI Agent Premium Features',
      merchantId: 'demo-merchant',
      metadata: { type: 'product' },
    },
    service: {
      id: 'demo-service-001',
      amount: 99.00,
      currency: 'USD',
      description: 'AI Consultation Service (1 Hour)',
      merchantId: 'demo-merchant',
      metadata: { type: 'service' },
    },
    subscription: {
      id: 'demo-sub-001',
      amount: 19.99,
      currency: 'USD',
      description: 'Agentrix Pro Monthly Subscription',
      merchantId: 'demo-merchant',
      metadata: { type: 'subscription' },
    },
  };

  const handleTryPayment = (type: 'product' | 'service' | 'subscription') => {
    setSelectedDemo(type);
    setShowCheckout(true);
  };

  // 功能特性
  const features = [
    {
      icon: Zap,
      title: { zh: 'QuickPay 一键支付', en: 'QuickPay One-Click' },
      description: { zh: '预授权模式，无需每次确认，秒级完成', en: 'Pre-authorized mode, no confirmation needed, instant completion' },
      highlight: true,
    },
    {
      icon: Globe,
      title: { zh: '多链支持', en: 'Multi-Chain Support' },
      description: { zh: '支持 BSC、Ethereum、Solana 等主流公链', en: 'Support BSC, Ethereum, Solana and more' },
    },
    {
      icon: Shield,
      title: { zh: '合规安全', en: 'Compliance & Security' },
      description: { zh: 'KYC 流程集成，符合全球监管要求', en: 'Integrated KYC flow, compliant with global regulations' },
    },
    {
      icon: CreditCard,
      title: { zh: '法币直通', en: 'Fiat Gateway' },
      description: { zh: '支持信用卡、Google Pay、Apple Pay', en: 'Support Credit Card, Google Pay, Apple Pay' },
    },
    {
      icon: TrendingUp,
      title: { zh: '智能路由', en: 'Smart Routing' },
      description: { zh: '自动选择最优支付路径，节省手续费', en: 'Auto-select optimal payment path, save fees' },
    },
    {
      icon: Lock,
      title: { zh: 'Session 授权', en: 'Session Authorization' },
      description: { zh: '灵活的限额管理和有效期设置', en: 'Flexible limit management and expiry settings' },
    },
  ];

  // 支付方式
  const paymentMethods = [
    { name: 'QuickPay', icon: Zap, color: 'text-yellow-400', bg: 'bg-yellow-500/10' },
    { name: 'Wallet', icon: Wallet, color: 'text-blue-400', bg: 'bg-blue-500/10' },
    { name: 'Card', icon: CreditCard, color: 'text-purple-400', bg: 'bg-purple-500/10' },
    { name: 'QR Code', icon: QrCode, color: 'text-green-400', bg: 'bg-green-500/10' },
  ];

  return (
    <>
      <Head>
        <title>{t({ zh: 'AX 支付 - Agentrix', en: 'AX Payment - Agentrix' })}</title>
        <meta name="description" content={t({ zh: 'Agentrix 统一支付解决方案', en: 'Agentrix Unified Payment Solution' })} />
      </Head>

      <Navigation />

      <main className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950">
        {/* Hero Section */}
        <section className="relative overflow-hidden border-b border-slate-800">
          <div className="absolute inset-0 bg-gradient-to-br from-blue-600/10 via-purple-600/5 to-transparent" />
          <div className="container mx-auto px-6 py-16 relative">
            <div className="max-w-4xl mx-auto text-center">
              <div className="flex items-center justify-center gap-2 mb-4">
                <Sparkles className="w-5 h-5 text-amber-400" />
                <span className="text-sm font-medium text-amber-400">AX Payment Protocol</span>
              </div>
              <h1 className="text-4xl md:text-5xl font-bold text-white mb-4">
                {t({ zh: 'AI 时代的支付基础设施', en: 'Payment Infrastructure for AI Era' })}
              </h1>
              <p className="text-xl text-slate-400 mb-8">
                {t({ 
                  zh: '统一支付协议层，让 AI Agent 和人类都能无缝完成支付', 
                  en: 'Unified payment protocol layer for seamless payments by AI Agents and humans' 
                })}
              </p>
              
              {/* Payment Methods Preview */}
              <div className="flex items-center justify-center gap-4 mb-8">
                {paymentMethods.map((method) => (
                  <div key={method.name} className={`flex items-center gap-2 px-4 py-2 ${method.bg} rounded-full`}>
                    <method.icon size={18} className={method.color} />
                    <span className="text-sm text-white">{method.name}</span>
                  </div>
                ))}
              </div>
              
              {/* CTA Buttons */}
              <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
                <button
                  onClick={() => handleTryPayment('product')}
                  className="px-8 py-3 bg-gradient-to-r from-blue-600 to-purple-600 text-white font-semibold rounded-xl hover:opacity-90 transition-opacity flex items-center gap-2"
                >
                  <Zap size={20} />
                  {t({ zh: '体验支付', en: 'Try Payment' })}
                </button>
                <Link
                  href="/developers"
                  className="px-8 py-3 bg-white/10 text-white font-semibold rounded-xl hover:bg-white/20 transition-colors flex items-center gap-2"
                >
                  {t({ zh: '开发者文档', en: 'Developer Docs' })}
                  <ArrowRight size={18} />
                </Link>
              </div>
            </div>
          </div>
        </section>

        {/* Features Grid */}
        <section className="py-16">
          <div className="container mx-auto px-6">
            <h2 className="text-2xl font-bold text-white text-center mb-12">
              {t({ zh: '核心能力', en: 'Core Capabilities' })}
            </h2>
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 max-w-5xl mx-auto">
              {features.map((feature, index) => (
                <div
                  key={index}
                  className={`p-6 rounded-2xl border ${
                    feature.highlight
                      ? 'bg-gradient-to-br from-blue-600/20 to-purple-600/20 border-blue-500/30'
                      : 'bg-slate-800/50 border-slate-700/50'
                  } hover:border-blue-500/50 transition-colors`}
                >
                  <div className={`w-12 h-12 rounded-xl flex items-center justify-center mb-4 ${
                    feature.highlight ? 'bg-blue-500/20' : 'bg-slate-700/50'
                  }`}>
                    <feature.icon size={24} className={feature.highlight ? 'text-blue-400' : 'text-slate-400'} />
                  </div>
                  <h3 className="text-lg font-semibold text-white mb-2">
                    {t(feature.title)}
                  </h3>
                  <p className="text-sm text-slate-400">
                    {t(feature.description)}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Demo Cards */}
        <section className="py-16 border-t border-slate-800">
          <div className="container mx-auto px-6">
            <h2 className="text-2xl font-bold text-white text-center mb-4">
              {t({ zh: '体验 Demo', en: 'Try Demo' })}
            </h2>
            <p className="text-slate-400 text-center mb-12">
              {t({ zh: '选择一个场景体验完整支付流程', en: 'Select a scenario to experience the full payment flow' })}
            </p>
            
            <div className="grid md:grid-cols-3 gap-6 max-w-4xl mx-auto">
              {/* Product Demo */}
              <div className="bg-slate-800/50 border border-slate-700/50 rounded-2xl p-6 hover:border-blue-500/50 transition-all">
                <div className="text-center mb-4">
                  <div className="w-16 h-16 bg-blue-500/10 rounded-2xl flex items-center justify-center mx-auto mb-3">
                    <Star size={32} className="text-blue-400" />
                  </div>
                  <h3 className="text-lg font-semibold text-white">{t({ zh: '商品购买', en: 'Product Purchase' })}</h3>
                  <p className="text-sm text-slate-400 mt-1">AI Agent Premium Features</p>
                </div>
                <div className="text-center mb-4">
                  <span className="text-3xl font-bold text-white">$29.99</span>
                </div>
                <button
                  onClick={() => handleTryPayment('product')}
                  className="w-full py-2.5 bg-blue-600 hover:bg-blue-500 text-white font-medium rounded-xl transition-colors"
                >
                  {t({ zh: '立即购买', en: 'Buy Now' })}
                </button>
              </div>

              {/* Service Demo */}
              <div className="bg-slate-800/50 border border-slate-700/50 rounded-2xl p-6 hover:border-purple-500/50 transition-all">
                <div className="text-center mb-4">
                  <div className="w-16 h-16 bg-purple-500/10 rounded-2xl flex items-center justify-center mx-auto mb-3">
                    <Clock size={32} className="text-purple-400" />
                  </div>
                  <h3 className="text-lg font-semibold text-white">{t({ zh: '服务预约', en: 'Service Booking' })}</h3>
                  <p className="text-sm text-slate-400 mt-1">AI Consultation (1 Hour)</p>
                </div>
                <div className="text-center mb-4">
                  <span className="text-3xl font-bold text-white">$99.00</span>
                </div>
                <button
                  onClick={() => handleTryPayment('service')}
                  className="w-full py-2.5 bg-purple-600 hover:bg-purple-500 text-white font-medium rounded-xl transition-colors"
                >
                  {t({ zh: '预约服务', en: 'Book Service' })}
                </button>
              </div>

              {/* Subscription Demo */}
              <div className="bg-slate-800/50 border border-slate-700/50 rounded-2xl p-6 hover:border-green-500/50 transition-all">
                <div className="text-center mb-4">
                  <div className="w-16 h-16 bg-green-500/10 rounded-2xl flex items-center justify-center mx-auto mb-3">
                    <TrendingUp size={32} className="text-green-400" />
                  </div>
                  <h3 className="text-lg font-semibold text-white">{t({ zh: '订阅服务', en: 'Subscription' })}</h3>
                  <p className="text-sm text-slate-400 mt-1">Agentrix Pro Monthly</p>
                </div>
                <div className="text-center mb-4">
                  <span className="text-3xl font-bold text-white">$19.99</span>
                  <span className="text-slate-400">/mo</span>
                </div>
                <button
                  onClick={() => handleTryPayment('subscription')}
                  className="w-full py-2.5 bg-green-600 hover:bg-green-500 text-white font-medium rounded-xl transition-colors"
                >
                  {t({ zh: '立即订阅', en: 'Subscribe Now' })}
                </button>
              </div>
            </div>
          </div>
        </section>

        {/* Stats Section */}
        <section className="py-16 border-t border-slate-800">
          <div className="container mx-auto px-6">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-8 max-w-4xl mx-auto">
              <div className="text-center">
                <div className="text-4xl font-bold text-white mb-2">{"<"}1s</div>
                <div className="text-sm text-slate-400">{t({ zh: 'QuickPay 响应', en: 'QuickPay Response' })}</div>
              </div>
              <div className="text-center">
                <div className="text-4xl font-bold text-white mb-2">5+</div>
                <div className="text-sm text-slate-400">{t({ zh: '支持公链', en: 'Chains Supported' })}</div>
              </div>
              <div className="text-center">
                <div className="text-4xl font-bold text-white mb-2">0.5%</div>
                <div className="text-sm text-slate-400">{t({ zh: '最低手续费', en: 'Lowest Fee' })}</div>
              </div>
              <div className="text-center">
                <div className="text-4xl font-bold text-white mb-2">100%</div>
                <div className="text-sm text-slate-400">{t({ zh: 'API 可用性', en: 'API Uptime' })}</div>
              </div>
            </div>
          </div>
        </section>
      </main>

      <Footer />

      {/* SmartCheckout Modal */}
      {showCheckout && selectedDemo && (
        <SmartCheckout
          order={demoOrders[selectedDemo]}
          onSuccess={(result) => {
            // Payment success logic
            setShowCheckout(false);
            setSelectedDemo(null);
          }}
          onCancel={() => {
            setShowCheckout(false);
            setSelectedDemo(null);
          }}
        />
      )}
    </>
  );
}
