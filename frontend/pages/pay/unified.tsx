import Head from 'next/head'
import Link from 'next/link'
import { useRouter } from 'next/router'
import { useEffect, useMemo, useState } from 'react'
import { Navigation } from '../../components/ui/Navigation'
import { Footer } from '../../components/layout/Footer'
import { useLocalization } from '../../contexts/LocalizationContext'
import { useCurrency, type SupportedCurrency } from '../../contexts/CurrencyContext'
import { ArrowLeft } from 'lucide-react'

type ProductType = 'physical' | 'service' | 'onchain'
type KycLevel = 'none' | 'basic' | 'advanced'

const productTypeMeta: Record<
  ProductType,
  { label: { zh: string; en: string }; description: { zh: string; en: string }; commission: number }
> = {
  physical: {
    label: { zh: '实体商品', en: 'Physical goods' },
    description: { zh: '3% 佣金 · 线下履约 · Stripe 优先', en: '3% commission · offline fulfilment' },
    commission: 0.03,
  },
  service: {
    label: { zh: '服务类', en: 'Services' },
    description: { zh: '5% 佣金 · 托管释放 · Escrow 优先', en: '5% commission · escrow release' },
    commission: 0.05,
  },
  onchain: {
    label: { zh: '链上资产', en: 'On-chain' },
    description: { zh: '2.5% 佣金 · 钱包签名 · X402 / Wallet 优先', en: '2.5% commission · wallet signing' },
    commission: 0.025,
  },
}

const countryOptions = [
  { code: 'US', label: { zh: '美国 · VAT 0%', en: 'United States · VAT 0%' }, vat: 0 },
  { code: 'CN', label: { zh: '中国 · VAT 13%', en: 'China · VAT 13%' }, vat: 0.13 },
  { code: 'GB', label: { zh: '英国 · VAT 20%', en: 'United Kingdom · VAT 20%' }, vat: 0.2 },
  { code: 'SG', label: { zh: '新加坡 · GST 8%', en: 'Singapore · GST 8%' }, vat: 0.08 },
  { code: 'DE', label: { zh: '德国 · VAT 19%', en: 'Germany · VAT 19%' }, vat: 0.19 },
]

const routingBase = [
  {
    id: 'stripe',
    name: 'Stripe + 芯片卡',
    features: ['双币种结算', '智能税费', 'Apple Pay'],
    latency: 'T+0',
    type: 'fiat',
  },
  {
    id: 'quickpay',
    name: 'QuickPay 闪付',
    features: ['QuickPay 授权', '风控白名单', '免 3DS'],
    latency: 'T+0',
    type: 'fiat',
  },
  {
    id: 'x402',
    name: 'X402 链上支付',
    features: ['多链聚合', '稳定币入金', '手续费省 40%'],
    latency: '即刻确认',
    type: 'onchain',
  },
  {
    id: 'wallet',
    name: 'WalletConnect',
    features: ['多钱包', '多签保护', '原子支付'],
    latency: '1 - 3 分钟',
    type: 'onchain',
  },
]

const stepConfig = [
  {
    key: 0,
    label: { zh: '配置场景', en: 'Scenario' },
    detail: { zh: '商品类型 · 国家 · 价格 · 货币', en: 'Product, regions, price, currency' },
  },
  {
    key: 1,
    label: { zh: '费用拆解', en: 'Pricing' },
    detail: { zh: '税费 · 渠道费 · 佣金 · FX', en: 'Tax, channel cost, commission, FX' },
  },
  {
    key: 2,
    label: { zh: '智能路由', en: 'Routing' },
    detail: { zh: '对比成功率与成本，自动推荐', en: 'Compare success vs. cost, auto select' },
  },
  {
    key: 3,
    label: { zh: '执行与输出', en: 'Execution' },
    detail: { zh: 'QuickPay · KYC · 托管 / Webhook', en: 'QuickPay, KYC, escrow & webhook' },
  },
]

export default function UnifiedPaymentDemo() {
  const [productType, setProductType] = useState<ProductType>('physical')
  const [productName, setProductName] = useState('AI 智能音箱套装')
  const [productPrice, setProductPrice] = useState(1299)
  const [productCurrency, setProductCurrency] = useState<SupportedCurrency>('USD')
  const [merchantCountry, setMerchantCountry] = useState('US')
  const [buyerCountry, setBuyerCountry] = useState('CN')
  const [quickPayEnabled, setQuickPayEnabled] = useState(true)
  const [kycLevel, setKycLevel] = useState<KycLevel>('basic')
  const [selectedChannel, setSelectedChannel] = useState('stripe')
  const [activeStep, setActiveStep] = useState(0)
  const router = useRouter()

  const { t } = useLocalization()
  const { format, convert, availableCurrencies } = useCurrency()

  const basePriceUSD = useMemo(
    () => convert(productPrice, productCurrency, 'USD'),
    [productPrice, productCurrency, convert],
  )

  const breakdown = useMemo(() => {
    const commissionRate = productTypeMeta[productType].commission
    const merchantVat = countryOptions.find((c) => c.code === merchantCountry)?.vat ?? 0.1
    const buyerVat = countryOptions.find((c) => c.code === buyerCountry)?.vat ?? 0.1
    const crossBorder = merchantCountry !== buyerCountry

    const taxRate = crossBorder ? Math.max(merchantVat, buyerVat) : merchantVat
    const tax = basePriceUSD * taxRate
    const channelFeeRate = productType === 'onchain' ? 0.008 : 0.029
    const channelFee = basePriceUSD * channelFeeRate + (productType === 'onchain' ? 0 : 0.3)
    const commission = basePriceUSD * commissionRate
    const escrowHold = productType === 'service' ? basePriceUSD * 0.1 : basePriceUSD * 0.05
    const fxBuffer = crossBorder ? basePriceUSD * 0.012 : 0

    return {
      base: basePriceUSD,
      tax,
      channelFee,
      commission,
      escrowHold,
      fxBuffer,
      total: basePriceUSD + tax + channelFee + commission + fxBuffer,
    }
  }, [basePriceUSD, buyerCountry, merchantCountry, productType])

  const routingOptions = useMemo(() => {
    return routingBase.map((route) => {
      const baseCost =
        route.type === 'onchain'
          ? breakdown.channelFee * 0.6
          : breakdown.channelFee + (quickPayEnabled && route.id === 'quickpay' ? -8 : 0)
      const successRate =
        route.id === 'quickpay'
          ? quickPayEnabled
            ? 0.995
            : 0.96
          : route.id === 'stripe'
          ? 0.985
          : 0.97
      const requiresKyc = route.type === 'onchain' ? 'advanced' : 'basic'

      return {
        ...route,
        cost: baseCost,
        successRate,
        requiresKyc,
      }
    })
  }, [breakdown.channelFee, quickPayEnabled])

  const recommendedRoute = useMemo(() => {
    const scored = routingOptions.map((route) => {
      const kycPenalty = kycLevel === 'none' ? 0.8 : kycLevel === 'basic' ? 0.9 : 1
      const score = route.successRate * kycPenalty - route.cost * 0.0001
      return { ...route, score }
    })
    return scored.sort((a, b) => b.score - a.score)[0]
  }, [routingOptions, kycLevel])

  useEffect(() => {
    if (recommendedRoute) {
      setSelectedChannel(recommendedRoute.id)
    }
  }, [recommendedRoute])

  const goNext = () => setActiveStep((prev) => Math.min(prev + 1, stepConfig.length - 1))
  const goPrev = () => setActiveStep((prev) => Math.max(prev - 1, 0))

  const scenarioPanel = (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-3">
        {(Object.keys(productTypeMeta) as ProductType[]).map((type) => (
          <button
            key={type}
            onClick={() => setProductType(type)}
            className={`rounded-2xl border p-4 text-left transition ${
              productType === type ? 'border-cyan-400 bg-cyan-400/10' : 'border-white/10 hover:border-white/30'
            }`}
          >
            <p className="text-sm font-semibold text-white">{t(productTypeMeta[type].label)}</p>
            <p className="mt-2 text-xs text-slate-300">{t(productTypeMeta[type].description)}</p>
          </button>
        ))}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <label className="flex flex-col text-sm font-medium text-slate-200">
          {t({ zh: '商品名称', en: 'Product name' })}
          <input
            value={productName}
            onChange={(event) => setProductName(event.target.value)}
            className="mt-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-white placeholder-slate-500 focus:border-cyan-400 focus:outline-none"
          />
        </label>
        <label className="flex flex-col text-sm font-medium text-slate-200">
          {t({ zh: '商品价格', en: 'Product price' })}
          <div className="mt-2 flex space-x-2">
            <input
              type="number"
              min={1}
              value={productPrice}
              onChange={(event) => setProductPrice(Number(event.target.value))}
              className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-white focus:border-cyan-400 focus:outline-none"
            />
            <select
              value={productCurrency}
              onChange={(event) => setProductCurrency(event.target.value as SupportedCurrency)}
              className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-white focus:border-cyan-400 focus:outline-none"
            >
              {availableCurrencies.map((currencyOption) => (
                <option key={currencyOption.code} value={currencyOption.code} className="bg-slate-900">
                  {currencyOption.code}
                </option>
              ))}
            </select>
          </div>
        </label>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <label className="flex flex-col text-sm font-medium text-slate-200">
          {t({ zh: '商户国家', en: 'Merchant country' })}
          <select
            value={merchantCountry}
            onChange={(event) => setMerchantCountry(event.target.value)}
            className="mt-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-white focus:border-cyan-400 focus:outline-none"
          >
            {countryOptions.map((option) => (
              <option key={option.code} value={option.code} className="bg-slate-900">
                {t(option.label)}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col text-sm font-medium text-slate-200">
          {t({ zh: '买家国家', en: 'Buyer country' })}
          <select
            value={buyerCountry}
            onChange={(event) => setBuyerCountry(event.target.value)}
            className="mt-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-white focus:border-cyan-400 focus:outline-none"
          >
            {countryOptions.map((option) => (
              <option key={option.code} value={option.code} className="bg-slate-900">
                {t(option.label)}
              </option>
            ))}
          </select>
        </label>
      </div>
    </div>
  )

  const pricingPanel = (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2">
        {[
          {
            label: { zh: '商品价格', en: 'Item price' },
            value: format(breakdown.base),
            helper: t({ zh: '以 USD 为基准即时换算', en: 'USD baseline for FX' }),
          },
          {
            label: { zh: '税费', en: 'Tax' },
            value: format(breakdown.tax),
            helper: t({ zh: '跨境自动取较高 VAT', en: 'Cross-border picks higher VAT' }),
          },
          {
            label: { zh: '渠道费用', en: 'Channel fee' },
            value: format(breakdown.channelFee),
            helper: t({ zh: '含 Stripe / Gas / 结算', en: 'Stripe, gas & settlement' }),
          },
          {
            label: { zh: 'Agentrix 佣金', en: 'Agentrix commission' },
            value: format(breakdown.commission),
            helper: t({ zh: '随场景动态调整', en: 'Auto adjust by scenario' }),
          },
        ].map((item) => (
          <div key={t(item.label)} className="rounded-2xl border border-white/10 bg-white/5 p-4">
            <p className="text-sm text-slate-300">{t(item.label)}</p>
            <p className="mt-2 text-2xl font-semibold text-white">{item.value}</p>
            <p className="text-xs text-slate-400">{item.helper}</p>
          </div>
        ))}
      </div>

      <div className="rounded-2xl border border-white/10 bg-slate-900/60 p-4 text-sm text-slate-300">
        <div className="flex items-center justify-between">
          <span>{t({ zh: '汇率缓冲', en: 'FX buffer' })}</span>
          <span className="text-white">{format(breakdown.fxBuffer)}</span>
        </div>
        <div className="mt-2 flex items-center justify-between">
          <span>{t({ zh: '托管保留', en: 'Escrow hold' })}</span>
          <span className="text-white">{format(breakdown.escrowHold)}</span>
        </div>
        <div className="mt-4 border-t border-white/10 pt-4">
          <div className="flex items-center justify-between">
            <span className="text-base font-semibold text-white">{t({ zh: '总计', en: 'Grand total' })}</span>
            <span className="text-3xl font-bold text-cyan-300">{format(breakdown.total)}</span>
          </div>
        </div>
      </div>
    </div>
  )

  const routingPanel = (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-2">
        {routingOptions.map((option) => (
          <button
            key={option.id}
            onClick={() => setSelectedChannel(option.id)}
            className={`rounded-2xl border p-4 text-left transition ${
              selectedChannel === option.id ? 'border-cyan-400 bg-cyan-400/10 shadow-inner' : 'border-white/10 hover:border-white/30'
            }`}
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-base font-semibold text-white">{option.name}</p>
                <p className="text-xs text-slate-400">{option.latency}</p>
              </div>
              <div className="text-right">
                <p className="text-sm font-semibold text-white">{format(option.cost)}</p>
                <p className="text-xs text-slate-400">{(option.successRate * 100).toFixed(1)}% success</p>
              </div>
            </div>
            <div className="mt-3 flex flex-wrap gap-2 text-xs text-slate-200">
              {option.features.map((feature) => (
                <span key={feature} className="rounded-full bg-white/10 px-2 py-1">
                  {feature}
                </span>
              ))}
            </div>
            <p className="mt-2 text-xs text-slate-400">
              {t({ zh: '需要 KYC', en: 'KYC required' })} ·{' '}
              {option.requiresKyc === 'advanced' ? t({ zh: '高级', en: 'Advanced' }) : t({ zh: '基础', en: 'Basic' })}
            </p>
          </button>
        ))}
      </div>
      {recommendedRoute && (
        <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm text-emerald-100">
          <p className="font-semibold">
            {t({ zh: '推荐路线：', en: 'Recommended route:' })} {recommendedRoute.name}
          </p>
          <p className="mt-1">
            {t({
              zh: '根据成功率、成本、KYC 等因素实时评分，可手动覆盖。',
              en: 'Scored by success, cost and KYC constraints. Manual override available.',
            })}
          </p>
        </div>
      )}
    </div>
  )

  const executionPanel = (
    <div className="grid gap-6 lg:grid-cols-2">
      <div className="space-y-4 rounded-2xl border border-white/10 bg-white/5 p-5">
        <p className="text-xs uppercase tracking-[0.4em] text-cyan-300">{t({ zh: '执行与风控', en: 'Execution' })}</p>
        <div className="space-y-3 text-sm text-slate-200">
          {[
            { label: { zh: 'QuickPay', en: 'QuickPay' }, value: quickPayEnabled ? t({ zh: '已开启', en: 'Enabled' }) : t({ zh: '待授权', en: 'Pending' }) },
            { label: { zh: 'Session ID', en: 'Session ID' }, value: 'SR-UNIFIED-84321' },
            { label: { zh: 'Webhook', en: 'Webhook' }, value: 'payment.succeeded ✔︎' },
          ].map((item) => (
            <div key={t(item.label)} className="flex items-center justify-between">
              <span className="text-slate-400">{t(item.label)}</span>
              <span className="font-semibold text-white">{item.value}</span>
            </div>
          ))}
        </div>
        <button
          onClick={() => setQuickPayEnabled((prev) => !prev)}
          className={`w-full rounded-xl px-4 py-2 text-sm font-semibold ${
            quickPayEnabled ? 'bg-emerald-500/80 text-white hover:bg-emerald-400/80' : 'bg-white/10 text-white hover:bg-white/20'
          }`}
        >
          {quickPayEnabled ? t({ zh: '关闭 QuickPay', en: 'Disable QuickPay' }) : t({ zh: '授权 QuickPay', en: 'Enable QuickPay' })}
        </button>
        <div className="rounded-xl border border-white/10 bg-slate-900/60 p-4 text-xs text-slate-400">
          {t({
            zh: 'QuickPay 白名单可瞬时完成小额支付，并自动同步到 Agent 会话，手续费立减 8 USD。',
            en: 'QuickPay whitelist closes micro-payments instantly and saves ≈ 8 USD fees.',
          })}
        </div>
      </div>

      <div className="space-y-4 rounded-2xl border border-white/10 bg-white/5 p-5">
        <p className="text-xs uppercase tracking-[0.4em] text-cyan-300">{t({ zh: 'KYC / 托管 / 输出', en: 'KYC / Escrow / Output' })}</p>
        <div>
          <p className="text-sm font-semibold text-white">{t({ zh: 'KYC 等级', en: 'KYC level' })}</p>
          <div className="mt-2 flex space-x-2">
            {(['none', 'basic', 'advanced'] as KycLevel[]).map((level) => (
              <button
                key={level}
                onClick={() => setKycLevel(level)}
                className={`flex-1 rounded-xl border px-3 py-2 text-sm ${
                  kycLevel === level ? 'border-cyan-400 bg-cyan-400/10 text-white' : 'border-white/10 text-slate-300'
                }`}
              >
                {t(
                  level === 'none'
                    ? { zh: '未认证', en: 'None' }
                    : level === 'basic'
                    ? { zh: '基础', en: 'Basic' }
                    : { zh: '高级', en: 'Advanced' },
                )}
              </button>
            ))}
          </div>
          <p className="mt-2 text-xs text-slate-400">
            {t({ zh: '高级 KYC 自动解锁链上 / Escrow 支付通道。', en: 'Advanced unlocks on-chain & escrow channels.' })}
          </p>
        </div>
        <div className="rounded-xl border border-white/10 bg-slate-900/60 p-4 text-sm text-slate-200">
          <p className="font-semibold text-white">{t({ zh: '输出动作', en: 'Next actions' })}</p>
          <ul className="mt-3 space-y-2 text-xs">
            <li>• {t({ zh: '导出支付路线 JSON', en: 'Export routing JSON' })}</li>
            <li>• {t({ zh: '发送 Webhook Mock', en: 'Trigger webhook mock' })}</li>
            <li>• {t({ zh: '切换真实 API 模式', en: 'Switch to live API' })}</li>
          </ul>
          <div className="mt-4 grid gap-2">
            <Link
              href="/pay/commission-demo"
              className="rounded-lg border border-white/10 px-3 py-2 text-center text-sm font-semibold text-cyan-300 hover:border-cyan-300"
            >
              {t({ zh: '查看佣金演示', en: 'Commission demo' })}
            </Link>
            <Link
              href="/pay/smart-routing"
              className="rounded-lg border border-white/10 px-3 py-2 text-center text-sm font-semibold text-cyan-300 hover:border-cyan-300"
            >
              {t({ zh: '智能路由详情', en: 'Smart routing detail' })}
            </Link>
          </div>
        </div>
      </div>
    </div>
  )

  const stepPanels = [scenarioPanel, pricingPanel, routingPanel, executionPanel]

  return (
    <>
      <Head>
        <title>{t({ zh: '统一支付演示 - Agentrix', en: 'Unified Payment Demo - Agentrix' })}</title>
        <meta
          name="description"
          content={t({
            zh: '展示 Agentrix 统一支付的多阶段流程，涵盖智能路由、QuickPay、托管与多货币展示。',
            en: 'Interactive walkthrough of Agentrix unified payment with routing, QuickPay, escrow and FX.',
          })}
        />
      </Head>
      <Navigation />
      <main className="bg-slate-950 text-white min-h-screen">
        <section className="border-b border-white/10 bg-gradient-to-r from-cyan-600/30 to-blue-700/40 py-8">
          <div className="container mx-auto px-6">
            <Link href="/marketplace" className="inline-flex items-center text-cyan-200 hover:text-white mb-6 text-sm transition-colors">
              <ArrowLeft className="w-4 h-4 mr-2" />
              {t({ zh: '返回市场', en: 'Back to Marketplace' })}
            </Link>
            <div className="max-w-4xl space-y-5">
              <p className="text-xs uppercase tracking-[0.4em] text-cyan-200">{t({ zh: 'Agentrix Unified Pay', en: 'Agentrix Unified Pay' })}</p>
              <h1 className="text-4xl font-bold md:text-5xl">{t({ zh: '统一支付演示，分步体验真实链路。', en: 'Unified payment demo, step-by-step.' })}</h1>
              <p className="text-lg text-cyan-50/80">
                {t({
                  zh: '从配置场景、费用拆解，到智能路由与 QuickPay 执行，模拟真实 Agent 与 API 联动。',
                  en: 'From scenario setup and pricing to smart routing and QuickPay execution, mirroring real API behaviour.',
                })}
              </p>
              <div className="flex flex-wrap gap-3 text-sm text-cyan-100">
                {['QuickPay', 'Smart Routing', 'Escrow', 'Commission', 'Webhook'].map((tag) => (
                  <span key={tag} className="rounded-full border border-white/20 px-3 py-1">
                    {tag}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className="border-b border-white/10 bg-slate-950 py-10">
          <div className="container mx-auto px-6">
            <div className="flex flex-col gap-6 lg:flex-row">
              <aside className="lg:w-64">
                <div className="rounded-3xl border border-white/10 bg-white/5 p-4">
                  <p className="text-xs uppercase tracking-[0.4em] text-slate-400">{t({ zh: '交互步骤', en: 'Steps' })}</p>
                  <div className="mt-4 space-y-2">
                    {stepConfig.map((step, index) => (
                      <button
                        key={step.key}
                        onClick={() => setActiveStep(index)}
                        className={`w-full rounded-2xl px-4 py-3 text-left text-sm ${
                          activeStep === index
                            ? 'bg-cyan-500/20 text-white shadow-inner'
                            : 'text-slate-300 hover:bg-white/5'
                        }`}
                      >
                        <span className="text-xs text-slate-400">0{index + 1}</span>
                        <p className="font-semibold">{t(step.label)}</p>
                        <p className="text-xs text-slate-400">{t(step.detail)}</p>
                      </button>
                    ))}
                  </div>
                </div>
              </aside>

              <div className="flex-1 rounded-3xl border border-white/10 bg-white/5 p-6">
                <div className="flex items-center justify-between border-b border-white/10 pb-4">
                  <div>
                    <p className="text-xs uppercase tracking-[0.4em] text-slate-400">
                      {t(stepConfig[activeStep].label)}
                    </p>
                    <h2 className="text-2xl font-semibold text-white">
                      {t({
                        zh: ['配置场景', '费用拆解', '选择智能路由', '执行与输出'][activeStep],
                        en: ['Configure scenario', 'Review pricing', 'Select routing', 'Execute & output'][activeStep],
                      })}
                    </h2>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={goPrev}
                      disabled={activeStep === 0}
                      className="rounded-xl border border-white/10 px-3 py-2 text-sm text-slate-300 disabled:opacity-40"
                    >
                      {t({ zh: '上一步', en: 'Previous' })}
                    </button>
                    <button
                      onClick={goNext}
                      disabled={activeStep === stepConfig.length - 1}
                      className="rounded-xl bg-cyan-500/80 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
                    >
                      {t({ zh: '下一步', en: 'Next' })}
                    </button>
                  </div>
                </div>
                <div className="mt-6">{stepPanels[activeStep]}</div>
              </div>

              <div className="lg:w-80 space-y-6">
                <div className="rounded-3xl border border-white/10 bg-white/5 p-5">
                  <p className="text-xs uppercase tracking-[0.4em] text-slate-400">{t({ zh: '实时总额', en: 'Live total' })}</p>
                  <h3 className="mt-2 text-3xl font-bold text-white">{format(breakdown.total)}</h3>
                  <p className="text-xs text-slate-400">{t({ zh: '与顶部货币选择器同步', en: 'Synced with global currency selector' })}</p>
                  <div className="mt-4 space-y-2 text-sm text-slate-200">
                    {(['USD', 'CNY', 'EUR'] as SupportedCurrency[]).map((code) => (
                      <div key={code} className="flex items-center justify-between">
                        <span>{code}</span>
                        <span>{format(breakdown.total, { toCurrency: code })}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="rounded-3xl border border-white/10 bg-white/5 p-5 space-y-4 text-sm text-slate-200">
                  <div className="flex justify-between text-xs text-slate-400">
                    <span>Session</span>
                    <span>UNIFIED-AX-4082</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>{t({ zh: '推荐路线', en: 'Recommended route' })}</span>
                    <span className="font-semibold text-cyan-300">{recommendedRoute?.name ?? '-'}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>{t({ zh: '成功率', en: 'Success rate' })}</span>
                    <span>{((recommendedRoute?.successRate ?? 0) * 100).toFixed(1)}%</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>{t({ zh: 'KYC 状态', en: 'KYC status' })}</span>
                    <span>{t(kycLevel === 'advanced' ? { zh: '高级', en: 'Advanced' } : kycLevel === 'basic' ? { zh: '基础', en: 'Basic' } : { zh: '未认证', en: 'None' })}</span>
                  </div>
                  <button
                    onClick={() => {
                      // 跳转到商户支付页面体验 V7.0 支付流程
                      window.location.href = '/pay/merchant'
                    }}
                    className="w-full rounded-2xl bg-gradient-to-r from-emerald-500 to-indigo-500 py-3 text-center text-sm font-semibold text-white hover:opacity-90 transition-all"
                  >
                    {t({ zh: '体验 V7.0 支付流程', en: 'Try V7.0 Payment Flow' })}
                  </button>
                  <button
                    onClick={() => router.push('/developers')}
                    className="w-full rounded-2xl bg-white/90 py-3 text-center text-sm font-semibold text-cyan-700 hover:bg-white mt-2"
                  >
                    {t({ zh: '接入真实 API', en: 'Connect real API' })}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </>
  )
}

