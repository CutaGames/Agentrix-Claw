import { useEffect, useState } from 'react'
import { marketplaceApi, type MarketplaceAsset } from '../../lib/api/marketplace.api'
import { AssetTag } from './AssetTag'
import { AssetPerformance } from './AssetPerformance'
import { AssetActionPanel } from './AssetActionPanel'
import { AssetFilters } from './AssetFilters'
import { useUser } from '../../contexts/UserContext'

interface PaginationInfo {
  page: number
  pageSize: number
  total: number
  totalPages: number
}

export function AssetDiscovery() {
  const { user } = useUser()
  const [assets, setAssets] = useState<MarketplaceAsset[]>([])
  const [pagination, setPagination] = useState<PaginationInfo>({
    page: 1,
    pageSize: 12,
    total: 0,
    totalPages: 0,
  })
  const [type, setType] = useState('')
  const [chain, setChain] = useState('')
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(false)
  const [refreshing, setRefreshing] = useState(false)

  const loadAssets = async () => {
    try {
      setLoading(true)
      const response = await marketplaceApi.getAssets({
        type: type || undefined,
        chain: chain || undefined,
        search: search || undefined,
        page: pagination.page,
        pageSize: pagination.pageSize,
      })
      setAssets(response?.items || [])
      setPagination(response?.pagination || {
        page: 1,
        pageSize: 12,
        total: 0,
        totalPages: 0,
      })
    } catch (error: any) {
      console.error('Failed to load assets', error)
      // 如果API失败，显示空列表而不是错误
      setAssets([])
      setPagination({
        page: 1,
        pageSize: 12,
        total: 0,
        totalPages: 0,
      })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadAssets()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [type, chain, search, pagination.page, pagination.pageSize])

  const handlePageChange = (page: number) => {
    setPagination((prev) => ({ ...prev, page }))
  }

  const handleRefreshAssets = async () => {
    if (!user) {
      alert('请先登录以刷新资产')
      return
    }
    try {
      setRefreshing(true)
      await marketplaceApi.ingestAssets()
      // 刷新后重新加载资产列表
      setTimeout(() => {
        loadAssets()
      }, 2000) // 等待2秒让后端处理完成
    } catch (error: any) {
      console.error('刷新资产失败:', error)
      alert(error?.message || '刷新资产失败，请稍后重试')
    } finally {
      setRefreshing(false)
    }
  }

  const renderTypeTag = (asset: MarketplaceAsset) => {
    switch (asset.type) {
      case 'token':
        return <AssetTag text="Token" color="blue" />
      case 'pair':
        return <AssetTag text="DEX 交易对" color="indigo" />
      case 'nft':
        return <AssetTag text="NFT" color="purple" />
      case 'rwa':
        return <AssetTag text="RWA" color="green" />
      case 'launchpad':
        return <AssetTag text="Launchpad" color="orange" />
      default:
        return null
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <p className="text-sm text-cyan-300 font-semibold uppercase tracking-wide">AI 聚合资产</p>
          <h2 className="text-2xl font-bold text-white">实时可交易资产列表</h2>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-sm text-slate-400">
            已上架资产：{pagination.total.toLocaleString()} 条
          </div>
          {user && (
            <button
              onClick={handleRefreshAssets}
              disabled={refreshing}
              className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {refreshing ? '刷新中...' : '刷新资产'}
            </button>
          )}
        </div>
      </div>

      <AssetFilters
        selectedType={type}
        selectedChain={chain}
        search={search}
        onTypeChange={setType}
        onChainChange={setChain}
        onSearchChange={setSearch}
      />

      <div className="mt-8">
        {loading ? (
          <div className="text-center py-20 text-slate-400">加载中...</div>
        ) : assets.length === 0 ? (
          <div className="text-center py-20 space-y-4">
            <div className="text-slate-400">
              <p className="text-lg font-semibold mb-2 text-white">暂无聚合资产</p>
              <p className="text-sm">资产聚合服务正在运行，或需要手动触发资产聚合</p>
            </div>
            {user ? (
              <button
                onClick={handleRefreshAssets}
                disabled={refreshing}
                className="px-6 py-3 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {refreshing ? '正在聚合资产...' : '立即聚合资产'}
              </button>
            ) : (
              <p className="text-sm text-slate-400">请登录后刷新资产</p>
            )}
          </div>
        ) : (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {assets.map((asset) => (
              <div
                key={asset.id}
                className="border border-white/10 rounded-2xl p-5 bg-white/5 backdrop-blur-sm shadow-sm hover:shadow-md hover:bg-white/10 transition-all"
              >
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-lg font-semibold text-white">{asset.name}</h3>
                      {renderTypeTag(asset)}
                    </div>
                    <p className="text-sm text-slate-400">{asset.symbol}</p>
                  </div>
                  <div className="text-sm text-slate-400">{asset.chain?.toUpperCase()}</div>
                </div>

                {asset.imageUrl && (
                  <div className="h-36 mb-4 rounded-xl overflow-hidden bg-slate-800/50 flex items-center justify-center">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={asset.imageUrl} alt={asset.name} className="max-h-full" />
                  </div>
                )}

                <AssetPerformance
                  priceUsd={asset.priceUsd}
                  volume24hUsd={asset.volume24hUsd}
                  change24hPercent={asset.change24hPercent}
                />

                <div className="mt-4">
                  <AssetActionPanel
                    type={asset.type}
                    onSwap={() => console.log('swap', asset.id)}
                    onLimitOrder={() => console.log('limit', asset.id)}
                    onDca={() => console.log('dca', asset.id)}
                    onSweep={() => console.log('sweep', asset.id)}
                    onLaunchpad={() => console.log('launchpad', asset.id)}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {pagination.totalPages > 1 && (
        <div className="flex justify-center mt-10 gap-2">
          {Array.from({ length: pagination.totalPages }).map((_, index) => (
            <button
              key={index}
              onClick={() => handlePageChange(index + 1)}
              className={`px-3 py-1 rounded-lg text-sm font-medium ${
                pagination.page === index + 1
                  ? 'bg-indigo-600 text-white'
                  : 'bg-white/10 text-slate-300 hover:bg-white/20'
              }`}
            >
              {index + 1}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

