interface AssetPerformanceProps {
  priceUsd?: string
  volume24hUsd?: string
  change24hPercent?: string
}

const formatUsd = (value?: string) => {
  if (!value) return '-'
  const num = parseFloat(value)
  if (Number.isNaN(num)) return '-'
  if (num >= 1e9) return `$${(num / 1e9).toFixed(2)}B`
  if (num >= 1e6) return `$${(num / 1e6).toFixed(2)}M`
  if (num >= 1e3) return `$${(num / 1e3).toFixed(2)}K`
  return `$${num.toFixed(2)}`
}

const formatChange = (value?: string) => {
  if (!value) return '-'
  const num = parseFloat(value)
  if (Number.isNaN(num)) return '-'
  const sign = num > 0 ? '+' : ''
  return `${sign}${num.toFixed(2)}%`
}

export function AssetPerformance({ priceUsd, volume24hUsd, change24hPercent }: AssetPerformanceProps) {
  const changeValue = change24hPercent ? parseFloat(change24hPercent) : undefined
  const changeColor =
    changeValue !== undefined
      ? changeValue > 0
        ? 'text-green-600'
        : changeValue < 0
          ? 'text-red-600'
          : 'text-gray-600'
      : 'text-gray-600'

  return (
    <div className="grid grid-cols-3 gap-3 text-sm">
      <div>
        <p className="text-xs text-gray-500">价格</p>
        <p className="font-semibold text-gray-900">{formatUsd(priceUsd)}</p>
      </div>
      <div>
        <p className="text-xs text-gray-500">24h 成交</p>
        <p className="font-semibold text-gray-900">{formatUsd(volume24hUsd)}</p>
      </div>
      <div>
        <p className="text-xs text-gray-500">24h 涨跌</p>
        <p className={`font-semibold ${changeColor}`}>{formatChange(change24hPercent)}</p>
      </div>
    </div>
  )
}

