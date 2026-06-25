import Head from 'next/head'
import { useMemo, useState } from 'react'
import { useRouter } from 'next/router'
import { Navigation } from '../../components/ui/Navigation'
import { Footer } from '../../components/layout/Footer'
import { useLocalization } from '../../contexts/LocalizationContext'
import { useCurrency, type SupportedCurrency } from '../../contexts/CurrencyContext'
import { ArrowLeft } from 'lucide-react'
import Link from 'next/link'

type ChannelType = 'fiat' | 'wallet' | 'cross-border'
type KycLevel = 'none' | 'basic' | 'advanced'

interface RoutingChannel {
  id: string
  name: string
  type: ChannelType
  baseCost: number
  successRate: number
  description: { zh: string; en: string }
  requiresKyc: KycLevel
  supportsQuickPay: boolean
  minAmount: number
  fxCoverage: SupportedCurrency[]
}

const routingChannels: RoutingChannel[] = [
  {
    id: 'stripe',
    name: 'Stripe 智能路由',
    type: 'fiat',
    baseCost: 12,
    successRate: 0.985,
    description: { zh: '适合实体 / 服务类支付，支持 Apple Pay / Google Pay', en: 'Great for physical/service payments with Apple Pay' },
    requiresKyc: 'basic',
    supportsQuickPay: true,
    minAmount: 10,
    fxCoverage: ['USD', 'EUR'],
  },
  {
    id: 'quickpay',
    name: 'QuickPay 闪付',
    type: 'fiat',
    baseCost: 6,
    successRate: 0.995,
    description: { zh: '授权后免 3DS，小额代扣，30s 内完成', en: 'Authorised micro charges without 3DS' },
    requiresKyc: 'basic',
    supportsQuickPay: true,
    minAmount: 5,
    fxCoverage: ['USD', 'CNY'],
  },
  {
    id: 'x402',
    name: 'X402 稳定币',
    type: 'cross-border',
    baseCost: 4,
    successRate: 0.972,
    description: { zh: '多链聚合 + 自动 Gas 优化，适合跨境 & 数字资产', en: 'Multi-chain aggregation with gas optimisation' },
    requiresKyc: 'advanced',
    supportsQuickPay: false,
    minAmount: 50,
    fxCoverage: ['USD', 'CNY', 'EUR'],
  },
  {
    id: 'wallet',
    name: 'WalletConnect 多签',
    type: 'wallet',
    baseCost: 3,
    successRate: 0.965,
    description: { zh: '适合链上资产与托管，支持多签、限额', en: 'Great for on-chain payments with multisig controls' },
    requiresKyc: 'advanced',
    supportsQuickPay: false,
    minAmount: 20,
    fxCoverage: ['USD', 'CNY'],
  },
]

export default function SmartRoutingPage() {
  const [amount, setAmount] = useState(500)
  const [currency, setCurrency] = useState<SupportedCurrency>('USD')
  const [userCountry, setUserCountry] = useState('CN')
  const [kycLevel, setKycLevel] = useState<KycLevel>('basic')
  const [quickPayEnabled, setQuickPayEnabled] = useState(true)
  const [walletConnected, setWalletConnected] = useState(false)
  const router = useRouter()

  const { t } = useLocalization()
  const { convert, format, availableCurrencies } = useCurrency()

  const amountUSD = useMemo(() => convert(amount, currency, 'USD'), [amount, currency, convert])

  const evaluatedChannels = useMemo(() => {
    return routingChannels.map((channel) => {
      const kycScore =
        kycLevel === 'advanced'
          ? 1
          : kycLevel === 'basic'
          ? channel.requiresKyc === 'advanced'
            ? 0.6
            : 1
          : channel.requiresKyc === 'none'
          ? 1
          : 0.4
      const walletScore = channel.type === 'wallet' ? (walletConnected ? 1 : 0.6) : 1
      const quickPayScore =
        channel.supportsQuickPay && quickPayEnabled ? 1.05 : channel.supportsQuickPay ? 0.9 : 1
      const amountScore = amountUSD >= channel.minAmount ? 1 : 0.7
      const fxScore = channel.fxCoverage.includes(currency) ? 1 : 0.85
      const success = channel.successRate * kycScore * walletScore * quickPayScore * amountScore * fxScore
      const dynamicCost =
        channel.baseCost +
        (channel.type === 'cross-border' ? amountUSD * 0.003 : 0) -
        (quickPayEnabled && channel.supportsQuickPay ? 2 : 0)

      return {
        ...channel,
        dynamicCost,
        success,
      }
    })
  }, [amountUSD, currency, kycLevel, quickPayEnabled, walletConnected])

  const sorted = useMemo(
    () =>
      [...evaluatedChannels].sort(
        (a, b) => b.success - a.success || a.dynamicCost - b.dynamicCost,
      ),
    [evaluatedChannels],
  )

  const recommended = sorted[0]

  return (
    <>
      <Head>
        <title>{t({ zh: '智能路由演示 - Agentrix', en: 'Smart routing demo - Agentrix' })}</title>
        <meta
          name="description"
          content={t({
            zh: '模拟 Agentrix 智能路由如何根据金额、KYC、QuickPay、钱包状态实时选择支付通道。',
            en: 'Simulate how Agentrix routing picks the best channel with KYC, QuickPay and wallet context.',
          })}
        />
      </Head>
      <Navigation />
      <main className="bg-slate-950 text-white">
        <section className="border-b border-white/10 bg-gradient-to-r from-indigo-600/90 to-blue-600/90 py-8 text-white">
          <div className="container mx-auto px-6">
            <Link href="/marketplace" className="inline-flex items-center text-indigo-100 hover:text-white mb-6 text-sm transition-colors">
              <ArrowLeft className="w-4 h-4 mr-2" />
              {t({ zh: '返回市场', en: 'Back to Marketplace' })}
            </Link>
            <p className="text-sm uppercase tracking-wide text-indigo-100">
              {t({ zh: 'Routing Context · 实时评分', en: 'Routing context · real-time scoring' })}
            </p>
            <h1 className="mt-2 text-4xl font-bold md:text-5xl">
              {t({ zh: '智能路由演示', en: 'Smart routing demo' })}
            </h1>
            <p className="mt-4 max-w-3xl text-lg text-indigo-100">
              {t({
                zh: '输入金额、货币、KYC、钱包连接状态，立即生成最优支付路线并展示评分理由。',
                en: 'Feed amount, currency, KYC and wallet state to instantly get the optimal route and insights.',
              })}
            </p>
          </div>
        </section>

        <section className="container mx-auto px-6 py-12">
          <div className="grid gap-6 lg:grid-cols-3">
            <div className="space-y-6 lg:col-span-2">
              <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
                <h2 className="text-lg font-semibold text-white">
                  {t({ zh: '输入路由上下文', en: 'Routing context inputs' })}
                </h2>
                <div className="mt-4 grid gap-4 md:grid-cols-2">
                  <label className="flex flex-col text-sm font-medium text-slate-300">
                    {t({ zh: '支付金额', en: 'Payment amount' })}
                    <div className="mt-2 flex space-x-2">
                      <input
                        type="number"
                        min={1}
                        value={amount}
                        onChange={(event) => setAmount(Number(event.target.value))}
                        className="w-full rounded-lg border border-white/20 bg-white/5 px-3 py-2 text-white placeholder:text-slate-400"
                      />
                      <select
                        value={currency}
                        onChange={(event) => setCurrency(event.target.value as SupportedCurrency)}
                        className="rounded-lg border border-white/20 bg-white/5 px-3 py-2 text-white"
                      >
                        {availableCurrencies.map((c) => (
                          <option key={c.code} value={c.code}>
                            {c.code}
                          </option>
                        ))}
                      </select>
                    </div>
                  </label>
                  <label className="flex flex-col text-sm font-medium text-slate-300">
                    {t({ zh: '用户国家', en: 'User country' })}
                    <select
                      value={userCountry}
                      onChange={(event) => setUserCountry(event.target.value)}
                      className="mt-2 rounded-lg border border-white/20 bg-white/5 px-3 py-2 text-white"
                    >
                      {['CN', 'US', 'SG', 'GB', 'DE'].map((country) => (
                        <option key={country} value={country}>
                          {country}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>

                <div className="mt-4 grid gap-4 md:grid-cols-3">
                  <div className="rounded-xl border border-white/10 bg-white/5 p-4">
                    <p className="text-sm text-slate-400">{t({ zh: 'KYC 等级', en: 'KYC level' })}</p>
                    <div className="mt-2 grid grid-cols-3 gap-2 text-xs">
                      {(['none', 'basic', 'advanced'] as KycLevel[]).map((level) => (
                        <button
                          key={level}
                          onClick={() => setKycLevel(level)}
                          className={`rounded-lg border px-2 py-1 ${
                            kycLevel === level
                              ? 'border-indigo-400 bg-indigo-500/20 text-indigo-300'
                              : 'border-white/20 text-slate-300 hover:border-white/30'
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
                  </div>
                  <div className="rounded-xl border border-white/10 bg-white/5 p-4">
                    <p className="text-sm text-slate-400">QuickPay</p>
                    <div className="mt-2 flex items-center space-x-3">
                      <button
                        onClick={() => setQuickPayEnabled(true)}
                        className={`flex-1 rounded-lg border px-3 py-2 text-sm ${
                          quickPayEnabled
                            ? 'border-green-400 bg-green-500/20 text-green-300'
                            : 'border-white/20 text-slate-400'
                        }`}
                      >
                        {t({ zh: '开启', en: 'Enabled' })}
                      </button>
                      <button
                        onClick={() => setQuickPayEnabled(false)}
                        className={`flex-1 rounded-lg border px-3 py-2 text-sm ${
                          !quickPayEnabled
                            ? 'border-slate-700 bg-slate-800 text-white'
                            : 'border-white/20 text-slate-400'
                        }`}
                      >
                        {t({ zh: '关闭', en: 'Disabled' })}
                      </button>
                    </div>
                    <p className="mt-2 text-xs text-slate-400">
                      {t({ zh: '小额支付走 QuickPay 白名单，无需 3DS', en: 'Micro payments go via QuickPay whitelist' })}
                    </p>
                  </div>
                  <div className="rounded-xl border border-white/10 bg-white/5 p-4">
                    <p className="text-sm text-slate-400">{t({ zh: '钱包连接', en: 'Wallet connect' })}</p>
                    <button
                      onClick={() => setWalletConnected((prev) => !prev)}
                      className={`mt-2 w-full rounded-lg border px-3 py-2 text-sm ${
                        walletConnected
                          ? 'border-blue-400 bg-blue-500/20 text-blue-300'
                          : 'border-white/20 text-slate-300 hover:border-white/30'
                      }`}
                    >
                      {walletConnected
                        ? t({ zh: '已连接', en: 'Connected' })
                        : t({ zh: '未连接', en: 'Connect wallet' })}
                    </button>
                    <p className="mt-2 text-xs text-slate-400">
                      {t({ zh: '连接后可开启多签/抽象账户', en: 'Connect to unlock multisig / AA flows' })}
                    </p>
                  </div>
                </div>
              </div>

              <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
                <h3 className="text-lg font-semibold text-white">
                  {t({ zh: '路由结果', en: 'Routing result' })}
                </h3>
                {recommended && (
                  <div className="mt-4 rounded-2xl border border-indigo-400/50 bg-indigo-500/10 p-5">
                    <p className="text-sm text-indigo-300">{t({ zh: '推荐路线', en: 'Recommended route' })}</p>
                    <div className="mt-2 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                      <div>
                        <p className="text-xl font-semibold text-white">{recommended.name}</p>
                        <p className="text-sm text-slate-300">{t(recommended.description)}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-2xl font-bold text-white">{format(recommended.dynamicCost)}</p>
                        <p className="text-xs text-slate-400">
                          {(recommended.success * 100).toFixed(2)}% success score
                        </p>
                      </div>
                    </div>
                    <ul className="mt-4 list-disc space-y-1 pl-5 text-sm text-slate-300">
                      <li>
                        {t({ zh: 'KYC 匹配度', en: 'KYC fit' })}:{' '}
                        {recommended.requiresKyc === 'advanced'
                          ? t({ zh: '需要高级 KYC', en: 'Advanced required' })
                          : t({ zh: '基础 KYC 即可', en: 'Basic enough' })}
                      </li>
                      <li>
                        {t({ zh: 'QuickPay 优惠：', en: 'QuickPay saving:' })}{' '}
                        {recommended.supportsQuickPay && quickPayEnabled
                          ? t({ zh: '即时减免 2 USD + 免 3DS', en: 'minus $2 and skip 3DS' })
                          : t({ zh: '未启用', en: 'Not enabled' })}
                      </li>
                      <li>
                        {t({ zh: 'FX 覆盖：', en: 'FX coverage:' })} {recommended.fxCoverage.join(', ')}
                      </li>
                    </ul>
                  </div>
                )}

                <div className="mt-6 grid gap-4 lg:grid-cols-2">
                  {sorted.map((channel) => (
                    <div key={channel.id} className="rounded-xl border border-white/10 bg-white/5 p-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-base font-semibold text-white">{channel.name}</p>
                          <p className="text-xs text-slate-400">{t(channel.description)}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-lg font-semibold text-white">{format(channel.dynamicCost)}</p>
                          <p className="text-xs text-slate-400">
                            {(channel.success * 100).toFixed(1)}%
                          </p>
                        </div>
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2 text-xs text-slate-300">
                        <span className="rounded-full bg-white/10 px-2 py-1">
                          {channel.requiresKyc === 'advanced'
                            ? t({ zh: '高级 KYC', en: 'Advanced KYC' })
                            : t({ zh: '基础 KYC', en: 'Basic KYC' })}
                        </span>
                        {channel.type === 'wallet' && (
                          <span className="rounded-full bg-white/10 px-2 py-1">
                            {walletConnected
                              ? t({ zh: '钱包已连接', en: 'Wallet ready' })
                              : t({ zh: '需连接钱包', en: 'Need wallet' })}
                          </span>
                        )}
                        {channel.supportsQuickPay && (
                          <span className="rounded-full bg-white/10 px-2 py-1">
                            QuickPay {quickPayEnabled ? t({ zh: '已启用', en: 'enabled' }) : t({ zh: '未启用', en: 'disabled' })}
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="space-y-6">
              <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
                <h3 className="text-lg font-semibold text-white">
                  {t({ zh: '诊断提示', en: 'Diagnostics' })}
                </h3>
                <ul className="mt-4 space-y-3 text-sm text-slate-300">
                  <li>
                    • {t({ zh: '基础 KYC 用户无法选链上渠道，建议升级到 Advanced', en: 'Basic KYC can’t use on-chain routes, upgrade to advanced' })}
                  </li>
                  <li>
                    • {t({ zh: 'QuickPay 可将 Stripe 通道费用下降 15%-30%', en: 'QuickPay drops Stripe cost by 15%-30%' })}
                  </li>
                  <li>
                    • {t({ zh: 'WalletConnect 通道建议连接钱包以启用多签', en: 'WalletConnect route recommends connecting wallets' })}
                  </li>
                </ul>
              </div>

              <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
                <h3 className="text-lg font-semibold text-white">
                  {t({ zh: '接入真实智能路由 API', en: 'Connect real routing API' })}
                </h3>
                <p className="mt-2 text-sm text-slate-300">
                  {t({
                    zh: '只需提交 routing context 即可返回推荐通道、成本、KYC 要求、失败备选方案。',
                    en: 'Submit routing context to get recommended channels, cost and fallback plans.',
                  })}
                </p>
                <button
                  onClick={() => router.push('/developers')}
                  className="mt-6 w-full rounded-xl bg-indigo-500 py-3 text-white hover:bg-indigo-600"
                >
                  {t({ zh: '申请 API Key', en: 'Request API key' })}
                </button>
              </div>
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </>
  )
}


