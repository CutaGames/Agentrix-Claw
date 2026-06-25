import Head from 'next/head'
import { useMemo, useState } from 'react'
import { useRouter } from 'next/router'
import { Navigation } from '../../components/ui/Navigation'
import { Footer } from '../../components/layout/Footer'
import { useLocalization } from '../../contexts/LocalizationContext'
import { useCurrency } from '../../contexts/CurrencyContext'

type ProductVertical = 'physical' | 'service' | 'digital'

const countries = [
  {
    code: 'US',
    name: { zh: '美国', en: 'United States' },
    currency: 'USD',
    taxRate: 0.07,
    channelFee: 0.029,
    logistics: 18,
  },
  {
    code: 'CN',
    name: { zh: '中国', en: 'China' },
    currency: 'CNY',
    taxRate: 0.13,
    channelFee: 0.012,
    logistics: 8,
  },
  {
    code: 'SG',
    name: { zh: '新加坡', en: 'Singapore' },
    currency: 'SGD',
    taxRate: 0.08,
    channelFee: 0.018,
    logistics: 15,
  },
  {
    code: 'DE',
    name: { zh: '德国', en: 'Germany' },
    currency: 'EUR',
    taxRate: 0.19,
    channelFee: 0.031,
    logistics: 22,
  },
]

const verticalAdjustments: Record<ProductVertical, number> = {
  physical: 1,
  service: 0.8,
  digital: 0.6,
}

export default function MultiCountryPricingPage() {
  const [basePriceUSD, setBasePriceUSD] = useState(1200)
  const [vertical, setVertical] = useState<ProductVertical>('physical')
  const [targetMargin, setTargetMargin] = useState(18)
  const router = useRouter()

  const { t } = useLocalization()
  const { convert, format } = useCurrency()

  const priceTable = useMemo(() => {
    return countries.map((country) => {
      const localBase = convert(basePriceUSD * verticalAdjustments[vertical], 'USD', country.currency as any)
      const tax = localBase * country.taxRate
      const channelCost = localBase * country.channelFee
      const logistics = country.logistics * (vertical === 'service' ? 0.3 : 1)
      const margin = (targetMargin / 100) * localBase
      const total = localBase + tax + channelCost + logistics + margin
      return {
        ...country,
        localBase,
        tax,
        channelCost,
        logistics,
        margin,
        total,
      }
    })
  }, [basePriceUSD, targetMargin, vertical, convert])

  return (
    <>
      <Head>
        <title>{t({ zh: '多国家定价演示 - Agentrix', en: 'Multi-country pricing demo - Agentrix' })}</title>
        <meta
          name="description"
          content={t({
            zh: '可视化查看不同国家的税费、渠道费、物流、利润率，实时切换商品类型与目标利润。',
            en: 'Visualise tax, channel fees, logistics and margin across countries with live controls.',
          })}
        />
      </Head>
      <Navigation />
      <main className="bg-slate-950 text-white">
        <section className="border-b border-white/10 bg-gradient-to-r from-emerald-600/90 to-blue-600/90 py-16 text-white">
          <div className="container mx-auto px-6">
            <p className="text-sm uppercase tracking-wide text-emerald-100">
              {t({ zh: 'FX · 税费 · 渠道 · 利润', en: 'FX · tax · channel · margin' })}
            </p>
            <h1 className="mt-2 text-4xl font-bold md:text-5xl">
              {t({ zh: '多国家定价演示', en: 'Multi-country pricing demo' })}
            </h1>
            <p className="mt-4 max-w-3xl text-lg text-emerald-100">
              {t({
                zh: '输入基础价格，即可看到不同国家/货币的即时售价、税率差异、利润空间，支持多语言与多货币展示。',
                en: 'Enter a base price to see per-country prices, tax, fees and margin in multiple currencies.',
              })}
            </p>
          </div>
        </section>

        <section className="container mx-auto px-6 py-12">
          <div className="grid gap-6 lg:grid-cols-3">
            <div className="space-y-6 lg:col-span-2">
              <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
                <h2 className="text-lg font-semibold text-white">
                  {t({ zh: '基础参数', en: 'Base parameters' })}
                </h2>
                <div className="mt-4 grid gap-4 md:grid-cols-3">
                  <label className="flex flex-col text-sm font-medium text-slate-300">
                    {t({ zh: '基础价格 (USD)', en: 'Base price (USD)' })}
                    <input
                      type="number"
                      min={10}
                      value={basePriceUSD}
                      onChange={(event) => setBasePriceUSD(Number(event.target.value))}
                      className="mt-2 rounded-lg border border-white/20 bg-white/5 px-3 py-2 text-white placeholder:text-slate-400"
                    />
                  </label>
                  <label className="flex flex-col text-sm font-medium text-slate-300">
                    {t({ zh: '商品类型', en: 'Product vertical' })}
                    <div className="mt-2 grid grid-cols-3 gap-2 text-xs">
                      {(Object.keys(verticalAdjustments) as ProductVertical[]).map((type) => (
                        <button
                          key={type}
                          onClick={() => setVertical(type)}
                          className={`rounded-lg border px-2 py-2 ${
                            vertical === type
                              ? 'border-emerald-400 bg-emerald-500/20 text-emerald-300'
                              : 'border-white/20 text-slate-300 hover:border-white/30'
                          }`}
                        >
                          {t(
                            type === 'physical'
                              ? { zh: '实体', en: 'Physical' }
                              : type === 'service'
                              ? { zh: '服务', en: 'Service' }
                              : { zh: '数字', en: 'Digital' },
                          )}
                        </button>
                      ))}
                    </div>
                  </label>
                  <label className="flex flex-col text-sm font-medium text-slate-300">
                    {t({ zh: '目标利润率 %', en: 'Target margin %' })}
                    <input
                      type="number"
                      min={5}
                      max={40}
                      value={targetMargin}
                      onChange={(event) => setTargetMargin(Number(event.target.value))}
                      className="mt-2 rounded-lg border border-white/20 bg-white/5 px-3 py-2 text-white placeholder:text-slate-400"
                    />
                  </label>
                </div>
              </div>

              <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
                <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                  <h3 className="text-lg font-semibold text-white">
                    {t({ zh: '国家 / 货币定价表', en: 'Country pricing table' })}
                  </h3>
                  <p className="text-xs text-slate-400">
                    {t({ zh: '金额自动同步右上角货币选择器', en: 'Amounts synced with global currency toggle' })}
                  </p>
                </div>
                <div className="mt-6 overflow-x-auto">
                  <table className="min-w-full divide-y divide-white/10 text-sm">
                    <thead className="bg-white/5">
                      <tr>
                        <th className="px-4 py-3 text-left font-medium text-slate-300">
                          {t({ zh: '国家 / 货币', en: 'Country / currency' })}
                        </th>
                        <th className="px-4 py-3 text-left font-medium text-slate-300">
                          {t({ zh: '本地基础价', en: 'Local base' })}
                        </th>
                        <th className="px-4 py-3 text-left font-medium text-slate-300">Tax</th>
                        <th className="px-4 py-3 text-left font-medium text-slate-300">
                          {t({ zh: '渠道费用', en: 'Channel fee' })}
                        </th>
                        <th className="px-4 py-3 text-left font-medium text-slate-300">
                          {t({ zh: '物流 / 运维', en: 'Logistics / ops' })}
                        </th>
                        <th className="px-4 py-3 text-left font-medium text-slate-300">
                          {t({ zh: '最终售价', en: 'Final price' })}
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                      {priceTable.map((row) => (
                        <tr key={row.code}>
                          <td className="px-4 py-3">
                            <div className="font-medium text-white">{t(row.name)}</div>
                            <div className="text-xs text-slate-400">{row.currency}</div>
                          </td>
                          <td className="px-4 py-3 text-white">{format(row.localBase, { fromCurrency: row.currency as any })}</td>
                          <td className="px-4 py-3 text-white">{format(row.tax, { fromCurrency: row.currency as any })}</td>
                          <td className="px-4 py-3 text-white">
                            {format(row.channelCost, { fromCurrency: row.currency as any })}
                          </td>
                          <td className="px-4 py-3 text-white">
                            {format(row.logistics, { fromCurrency: 'USD' })}
                          </td>
                          <td className="px-4 py-3 font-semibold text-emerald-400">
                            {format(row.total, { fromCurrency: row.currency as any })}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            <div className="space-y-6">
              <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
                <h3 className="text-lg font-semibold text-white">
                  {t({ zh: '税费对比', en: 'Tax comparison' })}
                </h3>
                <div className="mt-4 space-y-4">
                  {priceTable.map((row) => (
                    <div key={row.code}>
                      <div className="flex items-center justify-between text-sm text-slate-300">
                        <span>{t(row.name)}</span>
                        <span>{(row.taxRate * 100).toFixed(1)}%</span>
                      </div>
                      <div className="mt-2 h-2 rounded-full bg-white/10">
                        <div
                          className="h-2 rounded-full bg-emerald-400"
                          style={{ width: `${row.taxRate * 100}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
                <h3 className="text-lg font-semibold text-white">
                  {t({ zh: '建议策略', en: 'Suggested actions' })}
                </h3>
                <ul className="mt-4 space-y-3 text-sm text-slate-300">
                  <li>
                    • {t({ zh: '德国 VAT 最高，可提前收集增值税信息', en: 'Germany has highest VAT, collect VAT IDs early' })}
                  </li>
                  <li>
                    • {t({ zh: '中国渠道费最低，适合 QuickPay 闪付', en: 'China has lowest channel cost, ideal for QuickPay' })}
                  </li>
                  <li>
                    • {t({ zh: '服务类可降低物流成本，margin 自动更新', en: 'Service vertical reduces logistics weight' })}
                  </li>
                </ul>
                <button
                  onClick={() => router.push('/app/user')}
                  className="mt-6 w-full rounded-xl bg-emerald-500 py-3 text-white hover:bg-emerald-600"
                >
                  {t({ zh: '导出定价 JSON', en: 'Export pricing JSON' })}
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


