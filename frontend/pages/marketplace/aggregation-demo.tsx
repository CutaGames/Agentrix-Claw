import Head from 'next/head'
import { useMemo, useState } from 'react'
import { useRouter } from 'next/router'
import { Navigation } from '../../components/ui/Navigation'
import { Footer } from '../../components/layout/Footer'
import { useLocalization } from '../../contexts/LocalizationContext'
import { useCurrency } from '../../contexts/CurrencyContext'

type AssetType = 'nft' | 'rwa' | 'game' | 'token'
type SourceType = 'platform' | 'community'

interface AssetItem {
  id: string
  name: string
  type: AssetType
  source: SourceType
  chain: string
  commission: number
  priceUSD: number
  status: { zh: string; en: string }
}

const assets: AssetItem[] = [
  {
    id: 'asset-001',
    name: 'AI Commerce Node',
    type: 'rwa',
    source: 'platform',
    chain: 'Base',
    commission: 0.03,
    priceUSD: 9800,
    status: { zh: '平台聚合 · 稳定供给', en: 'Curated by platform' },
  },
  {
    id: 'asset-002',
    name: 'Gaming Skin Pack',
    type: 'game',
    source: 'community',
    chain: 'Solana',
    commission: 0.05,
    priceUSD: 120,
    status: { zh: '玩家自发上传', en: 'User generated' },
  },
  {
    id: 'asset-003',
    name: 'Real-World Inventory',
    type: 'rwa',
    source: 'platform',
    chain: 'Polygon',
    commission: 0.025,
    priceUSD: 6400,
    status: { zh: '仓储锁定', en: 'Warehouse locked' },
  },
  {
    id: 'asset-004',
    name: 'Creator Token Bundle',
    type: 'token',
    source: 'community',
    chain: 'Arbitrum',
    commission: 0.04,
    priceUSD: 450,
    status: { zh: '联盟推荐', en: 'Alliance curated' },
  },
]

const typeLabels: Record<AssetType, { zh: string; en: string }> = {
  nft: { zh: 'NFT', en: 'NFT' },
  rwa: { zh: 'RWA 资产', en: 'RWA' },
  game: { zh: '游戏资产', en: 'Gaming' },
  token: { zh: '代币包', en: 'Token' },
}

export default function AggregationDemoPage() {
  const [typeFilter, setTypeFilter] = useState<AssetType | 'all'>('all')
  const [sourceFilter, setSourceFilter] = useState<SourceType | 'all'>('all')
  const router = useRouter()

  const { t } = useLocalization()
  const { format } = useCurrency()

  const filtered = useMemo(() => {
    return assets.filter((asset) => {
      const typeMatch = typeFilter === 'all' || asset.type === typeFilter
      const sourceMatch = sourceFilter === 'all' || asset.source === sourceFilter
      return typeMatch && sourceMatch
    })
  }, [typeFilter, sourceFilter])

  return (
    <>
      <Head>
        <title>{t({ zh: '资产聚合演示 - Agentrix', en: 'Aggregation demo - Agentrix' })}</title>
        <meta
          name="description"
          content={t({
            zh: '展示平台聚合与用户自发资产的混合列表，实时显示佣金、链、供给方式与收益模型。',
            en: 'Showcase platform aggregated vs community assets with commission & chain meta.',
          })}
        />
      </Head>
      <Navigation />
      <main className="bg-slate-50">
        <section className="bg-gradient-to-r from-fuchsia-600 to-blue-600 py-16 text-white">
          <div className="container mx-auto px-6">
            <p className="text-sm uppercase tracking-wide text-fuchsia-100">
              {t({ zh: '平台聚合 + 用户自发', en: 'Platform curated + user generated' })}
            </p>
            <h1 className="mt-2 text-4xl font-bold md:text-5xl">
              {t({ zh: 'Marketplace 资产聚合演示', en: 'Marketplace aggregation demo' })}
            </h1>
            <p className="mt-4 max-w-3xl text-lg text-fuchsia-100">
              {t({
                zh: '查看 Agentrix 如何统一展示不同来源、不同链的资产，并即时计算佣金、结算方式与供给策略。',
                en: 'See how Agentrix unifies assets from multiple chains, sources and pricing strategies.',
              })}
            </p>
          </div>
        </section>

        <section className="container mx-auto px-6 py-12">
          <div className="grid gap-6 lg:grid-cols-3">
            <div className="space-y-6 lg:col-span-2">
              <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                <h2 className="text-lg font-semibold text-slate-900">
                  {t({ zh: '筛选条件', en: 'Filters' })}
                </h2>
                <div className="mt-4 grid gap-4 md:grid-cols-2">
                  <label className="flex flex-col text-sm font-medium text-slate-600">
                    {t({ zh: '资产类型', en: 'Asset type' })}
                    <div className="mt-2 flex flex-wrap gap-2 text-xs">
                      <button
                        onClick={() => setTypeFilter('all')}
                        className={`rounded-full px-3 py-1 ${
                          typeFilter === 'all'
                            ? 'bg-blue-600 text-white'
                            : 'bg-slate-100 text-slate-600'
                        }`}
                      >
                        {t({ zh: '全部', en: 'All' })}
                      </button>
                      {(Object.keys(typeLabels) as AssetType[]).map((type) => (
                        <button
                          key={type}
                          onClick={() => setTypeFilter(type)}
                          className={`rounded-full px-3 py-1 ${
                            typeFilter === type
                              ? 'bg-blue-600 text-white'
                              : 'bg-slate-100 text-slate-600'
                          }`}
                        >
                          {t(typeLabels[type])}
                        </button>
                      ))}
                    </div>
                  </label>
                  <label className="flex flex-col text-sm font-medium text-slate-600">
                    {t({ zh: '来源类型', en: 'Source' })}
                    <div className="mt-2 flex gap-2 text-xs">
                      <button
                        onClick={() => setSourceFilter('all')}
                        className={`flex-1 rounded-lg border px-3 py-2 ${
                          sourceFilter === 'all'
                            ? 'border-fuchsia-500 bg-fuchsia-50 text-fuchsia-600'
                            : 'border-slate-200 text-slate-600'
                        }`}
                      >
                        {t({ zh: '全部来源', en: 'All sources' })}
                      </button>
                      <button
                        onClick={() => setSourceFilter('platform')}
                        className={`flex-1 rounded-lg border px-3 py-2 ${
                          sourceFilter === 'platform'
                            ? 'border-green-500 bg-green-50 text-green-700'
                            : 'border-slate-200 text-slate-600'
                        }`}
                      >
                        {t({ zh: '平台聚合', en: 'Platform' })}
                      </button>
                      <button
                        onClick={() => setSourceFilter('community')}
                        className={`flex-1 rounded-lg border px-3 py-2 ${
                          sourceFilter === 'community'
                            ? 'border-amber-500 bg-amber-50 text-amber-700'
                            : 'border-slate-200 text-slate-600'
                        }`}
                      >
                        {t({ zh: '用户自发', en: 'Community' })}
                      </button>
                    </div>
                  </label>
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                {filtered.map((asset) => (
                  <div key={asset.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm uppercase tracking-wide text-slate-500">{t(typeLabels[asset.type])}</p>
                        <p className="text-lg font-semibold text-slate-900">{asset.name}</p>
                      </div>
                      <span
                        className={`rounded-full px-3 py-1 text-xs font-semibold ${
                          asset.source === 'platform'
                            ? 'bg-green-100 text-green-700'
                            : 'bg-amber-100 text-amber-700'
                        }`}
                      >
                        {asset.source === 'platform'
                          ? t({ zh: '平台聚合', en: 'Platform' })
                          : t({ zh: '用户自发', en: 'Community' })}
                      </span>
                    </div>
                    <p className="mt-2 text-sm text-slate-600">{t(asset.status)}</p>
                    <div className="mt-4 flex items-center justify-between text-sm text-slate-600">
                      <div>
                        <p>{t({ zh: '所属链', en: 'Chain' })}</p>
                        <p className="font-semibold text-slate-900">{asset.chain}</p>
                      </div>
                      <div>
                        <p>{t({ zh: '佣金', en: 'Commission' })}</p>
                        <p className="font-semibold text-slate-900">{(asset.commission * 100).toFixed(1)}%</p>
                      </div>
                      <div className="text-right">
                        <p>{t({ zh: '挂牌价格', en: 'Price' })}</p>
                        <p className="text-lg font-bold text-slate-900">{format(asset.priceUSD)}</p>
                      </div>
                    </div>
                    <button className="mt-4 w-full rounded-xl border border-slate-200 py-3 text-sm font-semibold text-blue-600 hover:border-blue-300">
                      {t({ zh: '查看交易流程', en: 'View flow' })}
                    </button>
                  </div>
                ))}
              </div>
            </div>

            <div className="space-y-6">
              <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                <h3 className="text-lg font-semibold text-slate-900">
                  {t({ zh: '收益模型', en: 'Revenue models' })}
                </h3>
                <ul className="mt-4 space-y-3 text-sm text-slate-600">
                  <li>
                    • {t({ zh: '平台聚合资产：标准 2-3% + 供给方 1% 服务费', en: 'Platform assets: 2-3% + supplier 1% service' })}
                  </li>
                  <li>
                    • {t({ zh: '用户自发资产：3-5% ，按数据质量动态浮动', en: 'Community assets: 3-5% dynamic based on quality' })}
                  </li>
                  <li>
                    • {t({ zh: '推广 Agent 可获得 0.5% 永久分成', en: 'Promotion agents get 0.5% permanent share' })}
                  </li>
                </ul>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                <h3 className="text-lg font-semibold text-slate-900">
                  {t({ zh: '接入真实 Marketplace API', en: 'Connect real marketplace API' })}
                </h3>
                <p className="mt-2 text-sm text-slate-600">
                  {t({
                    zh: '支持一键同步库存、收益模型、链上凭证，直接输出给 Agentrix Agent 与联盟网络。',
                    en: 'Sync inventory, revenue and on-chain proofs in one click for agents and alliances.',
                  })}
                </p>
                <button
                  onClick={() => router.push('/auth/login')}
                  className="mt-6 w-full rounded-xl bg-fuchsia-600 py-3 text-white hover:bg-fuchsia-700"
                >
                  {t({ zh: '提交资产', en: 'Submit assets' })}
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


