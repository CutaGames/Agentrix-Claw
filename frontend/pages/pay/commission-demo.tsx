import Head from 'next/head'
import { useMemo, useState } from 'react'
import { useRouter } from 'next/router'
import { Navigation } from '../../components/ui/Navigation'
import { Footer } from '../../components/layout/Footer'
import { useLocalization } from '../../contexts/LocalizationContext'
import { useCurrency, type SupportedCurrency } from '../../contexts/CurrencyContext'

type FinancialAsset =
  | 'physical'
  | 'service'
  | 'virtual'
  | 'nft_rwa'
  | 'dev_tool'
  | 'aggregated_web2'
  | 'aggregated_web3'

type Scenario = 'dual' | 'execution' | 'none'

const PROMOTER_SHARE = 0.2

const assetConfigs: Record<
  FinancialAsset,
  {
    label: { zh: string; en: string }
    baseRate: number
    poolRate: number
    description: { zh: string; en: string }
    settlement: { trigger: string; lock: string; payout: string; auto?: string }
    notes?: string
    dynamic?: 'virtual-band' | 'web2' | 'web3' | 'dev'
  }
> = {
  physical: {
    label: { zh: '实物商品', en: 'Physical goods' },
    baseRate: 0.005,
    poolRate: 0.025,
    description: { zh: '商户固定成本 3%，0.5% 给平台，2.5% 进入佣金池', en: 'Merchant cost 3% total, 0.5% base and 2.5% commission pool' },
    settlement: {
      trigger: '物流签收 / 用户确认收货',
      lock: '7 天锁定期',
      payout: 'T + 7 天 00:00',
      auto: '发货 30 天无更新 → 强制 T，最长 37 天结算',
    },
  },
  service: {
    label: { zh: '服务类', en: 'Services' },
    baseRate: 0.01,
    poolRate: 0.04,
    description: { zh: '商户固定成本 5%，1.0% 给平台，4.0% 进入佣金池', en: 'Merchant cost 5% total, 1.0% base and 4.0% incentive pool' },
    settlement: {
      trigger: '服务单 Completed',
      lock: '3 天锁定期',
      payout: 'T + 3 天 00:00',
      auto: '开工 7 天未完结需人工介入',
    },
  },
  virtual: {
    label: { zh: '虚拟资产', en: 'Virtual symbols' },
    baseRate: 0.005,
    poolRate: 0.025,
    description: { zh: '商户固定成本 3%，0.5% 给平台，2.5% 进入佣金池', en: 'Merchant cost 3% total, 0.5% base and 2.5% pool' },
    settlement: {
      trigger: '链上确认 > 12 / 卡密发放成功',
      lock: 'T + 1',
      payout: 'T + 1 天 00:00',
    },
    dynamic: 'virtual-band',
  },
  nft_rwa: {
    label: { zh: 'NFT / RWA', en: 'NFT / RWA' },
    baseRate: 0.005,
    poolRate: 0.02,
    description: { zh: '2.5% 总成本，0.5% 给平台，2.0% 进入佣金池', en: '2.5% cost total, 0.5% base and 2.0% pool' },
    settlement: {
      trigger: 'Tx Success',
      lock: 'T + 1',
      payout: 'T + 1 天 00:00',
    },
  },
  dev_tool: {
    label: { zh: '专业用户工具/插件', en: 'Professional User tools/Plugins' },
    baseRate: 0.05,
    poolRate: 0.15,
    description: {
      zh: '固定成本 20.0%，5.0% 给平台，15.0% 进入佣金池',
      en: 'Fixed cost 20.0%, 5.0% base and 15.0% incentive pool',
    },
    settlement: {
      trigger: '支付成功即履约完成',
      lock: '即时',
      payout: 'T + 0',
    },
    dynamic: 'dev',
  },
  aggregated_web2: {
    label: { zh: '聚合 Web2', en: 'Aggregated Web2' },
    baseRate: 0.2,
    poolRate: 0.8,
    description: { zh: '按上游佣金拆分：20% Agentrix / 80% 佣金池', en: 'Split upstream commission: 20% base / 80% pool' },
    settlement: {
      trigger: '上游联盟“已结算”',
      lock: '跟随 Net30 / Net60',
      payout: '上游到账后 T + 1',
      auto: '按月校对，必要时人工介入',
    },
    dynamic: 'web2',
  },
  aggregated_web3: {
    label: { zh: '聚合 Web3 DEX', en: 'Aggregated Web3 DEX' },
    baseRate: 0.3,
    poolRate: 0.7,
    description: { zh: '按 Swap Fee 拆分：Fee × 30% / 70%', en: 'Split swap fee: fee × 30% / 70%' },
    settlement: {
      trigger: 'Swap Fee Realised',
      lock: '即时 / T + 1',
      payout: 'Fee 结算后触发',
    },
    dynamic: 'web3',
  },
}

const scenarioConfigs: Record<
  Scenario,
  {
    title: { zh: string; en: string }
    description: { zh: string; en: string }
    split: { recommendation: number; execution: number }
  }
> = {
  dual: {
    title: { zh: '场景 A · 推荐 + 执行', en: 'Scenario A · Referral + Execution' },
    description: { zh: '30% → 推荐 Agent，70% → 执行 Agent', en: '30% to referral, 70% to execution' },
    split: { recommendation: 0.3, execution: 0.7 },
  },
  execution: {
    title: { zh: '场景 B · 仅执行', en: 'Scenario B · Execution only' },
    description: { zh: '佣金池 100% 归执行 Agent', en: 'Execution agent receives 100% of the pool' },
    split: { recommendation: 0, execution: 1 },
  },
  none: {
    title: { zh: '场景 C · 无 Agent', en: 'Scenario C · No agents' },
    description: { zh: '佣金池回收至平台/商户', en: 'Pool reverts to platform / merchant' },
    split: { recommendation: 0, execution: 0 },
  },
}

const settlementTimelineRows = [
  {
    asset: { zh: '实物商品', en: 'Physical goods' },
    trigger: '签收 or 用户确认收货',
    lock: '7 天',
    payout: 'T + 7 00:00',
    auto: '发货 30 天无更新 → 强制视为 T',
  },
  {
    asset: { zh: '服务类', en: 'Services' },
    trigger: '服务单 Completed',
    lock: '3 天',
    payout: 'T + 3 00:00',
    auto: '开工 7 天未完结 → 人工介入',
  },
  {
    asset: { zh: '虚拟资产 / NFT / RWA', en: 'Virtual / NFT / RWA' },
    trigger: '链上确认 / Tx Success',
    lock: '1 天',
    payout: 'T + 1 00:00',
    auto: '无需自动兜底',
  },
  {
    asset: { zh: '专业用户工具', en: 'Professional User tools' },
    trigger: 'Payment Success',
    lock: '0 天',
    payout: '即时',
    auto: '—',
  },
  {
    asset: { zh: '聚合 Web2', en: 'Aggregated Web2' },
    trigger: '上游联盟已结算',
    lock: '跟随上游 (Net30/60)',
    payout: '上游到账后 T + 1',
    auto: '月结校对',
  },
  {
    asset: { zh: '聚合 Web3 DEX', en: 'Aggregated Web3' },
    trigger: 'Swap Fee Realised',
    lock: '即时 / T + 1',
    payout: 'Fee 结算即触发',
    auto: '—',
  },
]

interface RateContext {
  poolRateOverride?: number
  upstreamRate?: number
  swapFeeRate?: number
}

function resolveRatesForAsset(asset: FinancialAsset, ctx: RateContext) {
  const config = assetConfigs[asset]
  if (!config) {
    return { baseRate: 0, poolRate: 0 }
  }

  if (config.dynamic === 'virtual-band' && ctx.poolRateOverride) {
    const poolRate = Math.min(0.04, Math.max(0.02, ctx.poolRateOverride))
    return { baseRate: config.baseRate, poolRate }
  }

  if (config.dynamic === 'web2') {
    const upstream = ctx.upstreamRate ?? 0.04
    return {
      baseRate: upstream * config.baseRate,
      poolRate: upstream * config.poolRate,
    }
  }

  if (config.dynamic === 'web3') {
    const fee = ctx.swapFeeRate ?? 0.003
    return {
      baseRate: fee * config.baseRate,
      poolRate: fee * config.poolRate,
    }
  }

  return {
    baseRate: config.baseRate,
    poolRate: config.poolRate,
  }
}

export default function CommissionDemoPage() {
  const [assetType, setAssetType] = useState<FinancialAsset>('physical')
  const [scenario, setScenario] = useState<Scenario>('dual')
  const [amount, setAmount] = useState(2000)
  const router = useRouter()
  const [currencyCode, setCurrencyCode] = useState<SupportedCurrency>('USD')
  const [platformTaxRate, setPlatformTaxRate] = useState(0)
  const [virtualPoolRate, setVirtualPoolRate] = useState(0.03)
  const [upstreamRate, setUpstreamRate] = useState(0.04)
  const [swapFeeRate, setSwapFeeRate] = useState(0.003)
  const [hasPromoter, setHasPromoter] = useState(true)
  const [executorHasWallet, setExecutorHasWallet] = useState(true)

  const { t } = useLocalization()
  const { format, convert, availableCurrencies } = useCurrency()

  const amountUSD = useMemo(() => convert(amount, currencyCode, 'USD'), [amount, currencyCode, convert])

  const breakdown = useMemo(() => {
    const netRevenue = amountUSD * (1 - platformTaxRate)
    const rates = resolveRatesForAsset(assetType, {
      poolRateOverride: assetType === 'virtual' ? virtualPoolRate : undefined,
      upstreamRate: assetType === 'aggregated_web2' ? upstreamRate : undefined,
      swapFeeRate: assetType === 'aggregated_web3' ? swapFeeRate : undefined,
    })

    let agentrixBase = netRevenue * rates.baseRate
    let commissionPool = netRevenue * rates.poolRate
    let promoterPayout = hasPromoter ? agentrixBase * PROMOTER_SHARE : 0
    let agentrixFinal = agentrixBase - promoterPayout
    let referrerPayout = 0
    let executorPayout = 0
    let rebatePayout = 0
    let developerAmount = 0
    let merchantNet = netRevenue - agentrixBase - commissionPool

    if (assetType === 'dev_tool') {
      developerAmount = netRevenue * 0.8
      const hasReferral = scenario === 'dual'
      const hasExecution = scenario === 'dual' || scenario === 'execution'

      const referralShare = netRevenue * 0.1
      const executionShare = netRevenue * 0.05

      referrerPayout = hasReferral ? referralShare : 0
      executorPayout = hasExecution ? executionShare : 0

      if (!hasReferral) {
        developerAmount += referralShare
      }
      if (!hasExecution) {
        developerAmount += executionShare
      }

      if (!executorHasWallet && executorPayout > 0) {
        rebatePayout = executorPayout
        executorPayout = 0
      }

      merchantNet = developerAmount
      commissionPool = referrerPayout + executorPayout + rebatePayout
      agentrixBase = netRevenue * 0.05
      agentrixFinal = agentrixBase - promoterPayout
    } else {
      const split = scenarioConfigs[scenario].split
      referrerPayout = commissionPool * split.recommendation
      executorPayout = commissionPool * split.execution

      if (scenario === 'none') {
        agentrixFinal += commissionPool
        referrerPayout = 0
        executorPayout = 0
        commissionPool = 0
      }

      if (!executorHasWallet && executorPayout > 0) {
        rebatePayout = executorPayout
        executorPayout = 0
      }
    }

    if (merchantNet < 0) merchantNet = 0

    return {
      netRevenue,
      agentrixBase,
      agentrixFinal,
      promoterPayout,
      commissionPoolRequested: netRevenue * rates.poolRate,
      commissionPoolDistributed: referrerPayout + executorPayout + rebatePayout,
      referrerPayout,
      executorPayout,
      rebatePayout,
      merchantNet,
    }
  }, [
    amountUSD,
    assetType,
    platformTaxRate,
    virtualPoolRate,
    upstreamRate,
    swapFeeRate,
    scenario,
    hasPromoter,
    executorHasWallet,
  ])

  return (
    <>
      <Head>
        <title>{t({ zh: '佣金分配演示 - Agentrix', en: 'Commission demo - Agentrix' })}</title>
        <meta
          name="description"
          content={t({
            zh: '可视化 Agentrix V7.0 两级分润 + Settlement Cycle，覆盖 Web2/Web3 / 原生 / 聚合资产。',
            en: 'Visualise Agentrix V7.0 two-level profit share + settlement cycle across Web2/Web3, native and aggregated assets.',
          })}
        />
      </Head>
      <Navigation />
      <main className="bg-slate-950 text-white">
        <section className="border-b border-white/10 bg-gradient-to-br from-purple-600/90 to-blue-600/90 py-16 text-white">
          <div className="container mx-auto px-6">
            <p className="text-sm uppercase tracking-wide text-purple-100">
              {t({ zh: '佣金机制 · 三层分润', en: 'Commission engine · Triple split' })}
            </p>
            <h1 className="mt-2 text-4xl font-bold md:text-5xl">
              {t({ zh: '佣金分配演示', en: 'Commission allocation demo' })}
            </h1>
            <p className="mt-4 max-w-3xl text-lg text-purple-100">
              {t({
                zh: '演示“两级分润 + 推广隔离 + Settlement Cycle”的完整分配方式，涵盖实物 / 服务 / 虚拟 / 开发者 / 聚合资产。',
                en: 'Explore the full “two-level profit + promoter isolation + settlement cycle” model across physical, service, digital, developer and aggregated assets.',
              })}
            </p>
          </div>
        </section>

        <section className="container mx-auto px-6 py-12">
          <div className="grid gap-6 lg:grid-cols-3">
            {/* Left column */}
            <div className="space-y-6 lg:col-span-2">
              <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
                <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                  <h2 className="text-lg font-semibold text-white">
                    {t({ zh: '参数配置', en: 'Configuration' })}
                  </h2>
                  <div className="flex items-center space-x-2 text-xs text-slate-400">
                    <span>API Ready</span>
                    <span>•</span>
                    <span>Webhook</span>
                    <span>•</span>
                    <span>SDK</span>
                  </div>
                </div>
                <div className="mt-4 grid gap-4 md:grid-cols-2">
                  <label className="flex flex-col text-sm font-medium text-slate-300">
                    {t({ zh: '成交金额', en: 'Transaction amount' })}
                    <div className="mt-2 flex space-x-2">
                      <input
                        type="number"
                        min={100}
                        step={100}
                        value={amount}
                        onChange={(event) => setAmount(Number(event.target.value))}
                        className="w-full rounded-lg border border-white/20 bg-white/5 px-3 py-2 text-white placeholder:text-slate-400"
                      />
                      <select
                        value={currencyCode}
                        onChange={(event) => setCurrencyCode(event.target.value as SupportedCurrency)}
                        className="rounded-lg border border-white/20 bg-white/5 px-3 py-2 text-white"
                      >
                        {availableCurrencies.map((currency) => (
                          <option key={currency.code} value={currency.code}>
                            {currency.code}
                          </option>
                        ))}
                      </select>
                    </div>
                  </label>

                  <div className="rounded-xl border border-white/10 bg-white/5 p-4 text-sm text-slate-300">
                    <div className="flex flex-col gap-1">
                      <p className="font-semibold text-white">{t(assetConfigs[assetType].label)}</p>
                      <p>{t(assetConfigs[assetType].description)}</p>
                      <div className="text-xs text-slate-400">
                        {t({ zh: '基础', en: 'Base' })}:{' '}
                        <span className="text-white">
                          {(assetConfigs[assetType].baseRate * 100).toFixed(1)}%
                        </span>{' '}
                        · {t({ zh: '佣金池', en: 'Pool' })}:{' '}
                        <span className="text-white">
                          {(assetConfigs[assetType].poolRate * 100).toFixed(1)}%
                        </span>
                      </div>
                      <div className="text-xs text-slate-400">
                        {t({ zh: '结算', en: 'Settlement' })}: {assetConfigs[assetType].settlement.trigger} ·{' '}
                        {assetConfigs[assetType].settlement.lock} · {assetConfigs[assetType].settlement.payout}
                      </div>
                    </div>
                  </div>
                  <label className="flex flex-col text-sm font-medium text-slate-300">
                    {t({ zh: '资产类型', en: 'Asset type' })}
                    <div className="mt-2 grid grid-cols-2 gap-2 lg:grid-cols-3">
                      {(Object.entries(assetConfigs) as [FinancialAsset, (typeof assetConfigs)[FinancialAsset]][]).map(
                        ([key, config]) => (
                          <button
                            key={key}
                            onClick={() => setAssetType(key)}
                            className={`rounded-lg border px-3 py-2 text-left text-sm ${
                              assetType === key
                                ? 'border-purple-400 bg-purple-500/20 text-purple-300'
                                : 'border-white/20 text-slate-300 hover:border-white/30'
                            }`}
                          >
                            <p className="font-semibold">{t(config.label)}</p>
                            <p className="text-xs text-slate-400">
                              {config.dynamic === 'web2'
                                ? t({ zh: '上游 × 20% / 80%', en: 'Upstream × 20% / 80%' })
                                : config.dynamic === 'web3'
                                ? 'Fee × 30% / 70%'
                                : `${(config.baseRate * 100).toFixed(1)}% · ${(config.poolRate * 100).toFixed(1)}%`}
                            </p>
                          </button>
                        ),
                      )}
                    </div>
                  </label>
                </div>

                <div className="mt-4 grid gap-4 md:grid-cols-2">
                  <label className="flex flex-col text-sm font-medium text-slate-300">
                    {t({ zh: '巨头过路费 / 平台税率', en: 'Platform tax / platform fee' })}
                    <div className="mt-2 flex items-center space-x-2">
                      <input
                        type="number"
                        min={0}
                        max={50}
                        step={0.5}
                        value={(platformTaxRate * 100).toFixed(1)}
                        onChange={(event) => setPlatformTaxRate(Number(event.target.value) / 100)}
                        className="w-full rounded-lg border border-white/20 bg-white/5 px-3 py-2 text-white placeholder:text-slate-400"
                      />
                      <span className="text-xs text-slate-400">%</span>
                    </div>
                    <p className="mt-1 text-xs text-slate-500">
                      {t({ zh: 'Apple 30% / Telegram Stars 30% 等巨头过路费', en: 'Apple 30%, Telegram Stars 30%, etc.' })}
                    </p>
                  </label>

                  {assetType === 'virtual' && (
                    <label className="flex flex-col text-sm font-medium text-slate-300">
                      {t({ zh: '虚拟资产佣金池 (2%-4%)', en: 'Virtual pool rate (2%-4%)' })}
                      <div className="mt-2 flex items-center space-x-2">
                        <input
                          type="number"
                          min={2}
                          max={4}
                          step={0.1}
                          value={(virtualPoolRate * 100).toFixed(1)}
                          onChange={(event) => setVirtualPoolRate(Number(event.target.value) / 100)}
                          className="w-full rounded-lg border border-white/20 bg-white/5 px-3 py-2 text-white placeholder:text-slate-400"
                        />
                        <span className="text-xs text-slate-400">%</span>
                      </div>
                    </label>
                  )}

                  {assetType === 'aggregated_web2' && (
                    <label className="flex flex-col text-sm font-medium text-slate-300">
                      {t({ zh: '上游佣金 (示例 4%)', en: 'Upstream commission (e.g. 4%)' })}
                      <div className="mt-2 flex items-center space-x-2">
                        <input
                          type="number"
                          min={1}
                          max={15}
                          step={0.1}
                          value={(upstreamRate * 100).toFixed(1)}
                          onChange={(event) => setUpstreamRate(Number(event.target.value) / 100)}
                          className="w-full rounded-lg border border-white/20 bg-white/5 px-3 py-2 text-white placeholder:text-slate-400"
                        />
                        <span className="text-xs text-slate-400">%</span>
                      </div>
                      <p className="mt-1 text-xs text-slate-500">
                        {t({ zh: 'Agentrix 固定 20% / 佣金池 80%', en: '20% Agentrix / 80% pool of upstream commission' })}
                      </p>
                    </label>
                  )}

                  {assetType === 'aggregated_web3' && (
                    <label className="flex flex-col text-sm font-medium text-slate-300">
                      {t({ zh: 'Swap Fee (示例 0.3%)', en: 'Swap fee (e.g. 0.3%)' })}
                      <div className="mt-2 flex items-center space-x-2">
                        <input
                          type="number"
                          min={0.1}
                          max={1}
                          step={0.05}
                          value={(swapFeeRate * 100).toFixed(2)}
                          onChange={(event) => setSwapFeeRate(Number(event.target.value) / 100)}
                          className="w-full rounded-lg border border-white/20 bg-white/5 px-3 py-2 text-white placeholder:text-slate-400"
                        />
                        <span className="text-xs text-slate-400">%</span>
                      </div>
                      <p className="mt-1 text-xs text-slate-500">
                        {t({ zh: '30% → Agentrix / 70% → Agent', en: '30% → Agentrix / 70% → Agents' })}
                      </p>
                    </label>
                  )}
                </div>

                <div className="mt-4 grid gap-4 md:grid-cols-2">
                  <label className="flex items-center space-x-3 text-sm font-medium text-slate-300">
                    <input
                      type="checkbox"
                      checked={hasPromoter}
                      onChange={(event) => setHasPromoter(event.target.checked)}
                      className="h-5 w-5 rounded border-white/20 bg-white/5 text-blue-400 focus:ring-blue-500"
                    />
                    <div>
                      <p>{t({ zh: '推广 Agent (BD)', en: 'Promoter / BD' })}</p>
                      <p className="text-xs text-slate-400">
                        {t({ zh: '从 Agentrix 基础收入抽 20%', en: 'Receives 20% of Agentrix base revenue' })}
                      </p>
                    </div>
                  </label>
                  <label className="flex items-center space-x-3 text-sm font-medium text-slate-300">
                    <input
                      type="checkbox"
                      checked={executorHasWallet}
                      onChange={(event) => setExecutorHasWallet(event.target.checked)}
                      className="h-5 w-5 rounded border-white/20 bg-white/5 text-blue-400 focus:ring-blue-500"
                    />
                    <div>
                      <p>{t({ zh: '执行 Agent 有钱包', en: 'Execution agent has wallet' })}</p>
                      <p className="text-xs text-slate-400">
                        {t({ zh: '无钱包则转入 System Rebate Pool', en: 'Otherwise pay into System Rebate Pool' })}
                      </p>
                    </div>
                  </label>
                </div>
              </div>

              {/* Breakdown */}
              <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
                <h3 className="text-lg font-semibold text-white">
                  {t({ zh: '两级分润结果', en: 'Two-level distribution' })}
                </h3>
                <div className="mt-4 grid gap-4 md:grid-cols-2">
                  <div className="rounded-xl border border-white/10 bg-white/5 p-4">
                    <p className="text-sm text-slate-400">{t({ zh: '净收入 (GMV - 平台税)', en: 'Net revenue (GMV - tax)' })}</p>
                    <p className="mt-2 text-2xl font-bold text-white">{format(breakdown.netRevenue)}</p>
                    <p className="text-xs text-slate-400">{t({ zh: '用作 Agentrix 固收 + 佣金池基数', en: 'Base for Agentrix + pool' })}</p>
                  </div>
                  <div className="rounded-xl border border-white/10 bg-white/5 p-4">
                    <p className="text-sm text-slate-400">{t({ zh: '商户最终收入', en: 'Merchant net revenue' })}</p>
                    <p className="mt-2 text-2xl font-bold text-white">{format(breakdown.merchantNet)}</p>
                    <p className="text-xs text-slate-400">{t({ zh: '扣除平台与佣金后的结果', en: 'After base + pool deduction' })}</p>
                  </div>
                </div>

                <div className="mt-6 grid gap-4 md:grid-cols-2">
                  <div className="rounded-xl border border-white/10 bg-white/5 p-4">
                    <p className="text-sm text-slate-400">{t({ zh: 'Agentrix 固定收入', en: 'Agentrix base revenue' })}</p>
                    <dl className="mt-3 space-y-2 text-sm text-slate-300">
                      <div className="flex items-center justify-between">
                        <dt>{t({ zh: '基础收入', en: 'Base income' })}</dt>
                        <dd className="font-semibold">{format(breakdown.agentrixBase)}</dd>
                      </div>
                      <div className="flex items-center justify-between">
                        <dt>{t({ zh: '推广 Agent 20%', en: 'Promoter 20%' })}</dt>
                        <dd className="font-semibold">{format(breakdown.promoterPayout)}</dd>
                      </div>
                      <div className="flex items-center justify-between">
                        <dt>{t({ zh: 'Agentrix 最终收入', en: 'Agentrix final revenue' })}</dt>
                        <dd className="font-semibold text-primary-neon">{format(breakdown.agentrixFinal)}</dd>
                      </div>
                    </dl>
                  </div>
                  <div className="rounded-xl border border-white/10 bg-white/5 p-4">
                    <p className="text-sm text-slate-400">{t({ zh: '佣金池分布', en: 'Commission pool distribution' })}</p>
                    <dl className="mt-3 space-y-2 text-sm text-slate-300">
                      <div className="flex items-center justify-between">
                        <dt>{t({ zh: '推荐 Agent', en: 'Referral agent' })}</dt>
                        <dd className="font-semibold">{format(breakdown.referrerPayout)}</dd>
                      </div>
                      <div className="flex items-center justify-between">
                        <dt>{t({ zh: '执行 Agent', en: 'Execution agent' })}</dt>
                        <dd className="font-semibold">{format(breakdown.executorPayout)}</dd>
                      </div>
                      <div className="flex items-center justify-between">
                        <dt>{t({ zh: 'System Rebate Pool', en: 'System rebate pool' })}</dt>
                        <dd className="font-semibold">{format(breakdown.rebatePayout)}</dd>
                      </div>
                      <div className="flex items-center justify-between">
                        <dt>{t({ zh: '已分配合计', en: 'Distributed total' })}</dt>
                        <dd className="font-semibold text-white">{format(breakdown.commissionPoolDistributed)}</dd>
                      </div>
                    </dl>
                  </div>
                </div>
              </div>

              {/* Timeline */}
              <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
                <h3 className="text-lg font-semibold text-white">
                  {t({ zh: 'Settlement Cycle Protocol', en: 'Settlement Cycle Protocol' })}
                </h3>
                <div className="mt-4 overflow-x-auto">
                  <table className="min-w-full text-left text-xs text-slate-300">
                    <thead>
                      <tr className="text-slate-400">
                        <th className="p-2">{t({ zh: '资产类型', en: 'Asset' })}</th>
                        <th className="p-2">{t({ zh: '触发事件 (T)', en: 'Trigger (T)' })}</th>
                        <th className="p-2">{t({ zh: '锁定期', en: 'Lock-up' })}</th>
                        <th className="p-2">{t({ zh: '资金释放', en: 'Payout' })}</th>
                        <th className="p-2">{t({ zh: '自动兜底', en: 'Auto confirm' })}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {settlementTimelineRows.map((row) => (
                        <tr key={row.asset.zh} className="border-t border-white/5">
                          <td className="p-2 font-semibold text-white">{t(row.asset)}</td>
                          <td className="p-2">{row.trigger}</td>
                          <td className="p-2">{row.lock}</td>
                          <td className="p-2">{row.payout}</td>
                          <td className="p-2 text-slate-500">{row.auto}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            {/* Right column */}
            <div className="space-y-6">
              {(Object.keys(scenarioConfigs) as Scenario[]).map((mode) => (
                <div
                  key={mode}
                  className={`rounded-2xl border p-5 ${
                    scenario === mode ? 'border-blue-400/50 bg-blue-500/10' : 'border-white/10 bg-white/5'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-slate-400">{t({ zh: '场景', en: 'Scenario' })}</p>
                      <p className="text-lg font-semibold text-white">{t(scenarioConfigs[mode].title)}</p>
                    </div>
                    <button
                      onClick={() => setScenario(mode)}
                      className={`rounded-full px-3 py-1 text-xs font-semibold ${
                        scenario === mode ? 'bg-blue-500 text-white' : 'bg-white/10 text-slate-300'
                      }`}
                    >
                      {scenario === mode ? t({ zh: '当前', en: 'Active' }) : t({ zh: '切换', en: 'Switch' })}
                    </button>
                  </div>
                  <p className="mt-2 text-sm text-slate-300">{t(scenarioConfigs[mode].description)}</p>
                  <div className="mt-4 space-y-2 text-xs text-slate-400">
                    <p>
                      {t({ zh: '推荐', en: 'Recommend' })}: {(scenarioConfigs[mode].split.recommendation * 100).toFixed(0)}%
                      · {t({ zh: '执行', en: 'Execute' })}:{' '}
                      {(scenarioConfigs[mode].split.execution * 100).toFixed(0)}%
                    </p>
                  </div>
                </div>
              ))}

              <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
                <h3 className="text-lg font-semibold text-white">
                  {t({ zh: '推广激励', en: 'Promotion Incentives' })}
                </h3>
                <ul className="mt-4 space-y-3 text-sm text-slate-300">
                  <li>• {t({ zh: '推广 Agent 直接从 Agentrix 固定收入抽 20%', en: 'Promoters receive 20% of Agentrix base income' })}</li>
                  <li>• {t({ zh: '推广者可绑定 BD → Merchant.invited_by，自动计提', en: 'Bind BD → Merchant.invited_by to automate payouts' })}</li>
                  <li>• {t({ zh: '支持 Web3 钱包地址或 Web2 月结', en: 'Supports Web3 wallet payouts or Web2 monthly settlements' })}</li>
                </ul>
                <button
                  onClick={() => router.push('/developers')}
                  className="mt-6 w-full rounded-xl bg-purple-500 py-3 text-white transition hover:bg-purple-600"
                >
                  {t({ zh: '接入联盟 API', en: 'Join alliance API' })}
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


