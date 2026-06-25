interface AssetActionPanelProps {
  type: 'token' | 'pair' | 'nft' | 'rwa' | 'launchpad'
  onSwap?: () => void
  onLimitOrder?: () => void
  onDca?: () => void
  onSweep?: () => void
  onLaunchpad?: () => void
}

export function AssetActionPanel({
  type,
  onSwap,
  onLimitOrder,
  onDca,
  onSweep,
  onLaunchpad,
}: AssetActionPanelProps) {
  const isTokenLike = type === 'token' || type === 'pair'
  const isNFT = type === 'nft'
  const isRwa = type === 'rwa'
  const isLaunchpad = type === 'launchpad'

  return (
    <div className="flex flex-wrap gap-2">
      {isTokenLike && (
        <>
          <button
            onClick={onSwap}
            className="px-3 py-1.5 text-xs font-medium rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 transition"
          >
            一键 Swap
          </button>
          <button
            onClick={onLimitOrder}
            className="px-3 py-1.5 text-xs font-medium rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-50"
          >
            限价单
          </button>
          <button
            onClick={onDca}
            className="px-3 py-1.5 text-xs font-medium rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-50"
          >
            定投计划
          </button>
        </>
      )}

      {isNFT && (
        <>
          <button
            onClick={onSwap}
            className="px-3 py-1.5 text-xs font-medium rounded-lg bg-purple-600 text-white hover:bg-purple-700"
          >
            立即买入
          </button>
          <button
            onClick={onSweep}
            className="px-3 py-1.5 text-xs font-medium rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-50"
          >
            扫地（多件）
          </button>
        </>
      )}

      {isRwa && (
        <button
          onClick={onSwap}
          className="px-3 py-1.5 text-xs font-medium rounded-lg bg-emerald-600 text-white hover:bg-emerald-700"
        >
          认购 / 分红监控
        </button>
      )}

      {isLaunchpad && (
        <>
          <button
            onClick={onLaunchpad}
            className="px-3 py-1.5 text-xs font-medium rounded-lg bg-orange-500 text-white hover:bg-orange-600"
          >
            立即参与
          </button>
          <button
            onClick={onDca}
            className="px-3 py-1.5 text-xs font-medium rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-50"
          >
            止盈/跟单
          </button>
        </>
      )}
    </div>
  )
}

