import { useMemo } from 'react'

interface AssetFiltersProps {
  selectedType: string
  selectedChain: string
  search: string
  onTypeChange: (value: string) => void
  onChainChange: (value: string) => void
  onSearchChange: (value: string) => void
}

const typeOptions = [
  { value: '', label: '全部类别' },
  { value: 'token', label: 'Token' },
  { value: 'pair', label: '交易对' },
  { value: 'nft', label: 'NFT' },
  { value: 'rwa', label: 'RWA' },
  { value: 'launchpad', label: 'Launchpad/Presale' },
]

const chainOptions = [
  { value: '', label: '全部链' },
  { value: 'solana', label: 'Solana' },
  { value: 'ethereum', label: 'Ethereum' },
  { value: 'bsc', label: 'BSC' },
  { value: 'polygon', label: 'Polygon' },
  { value: 'base', label: 'Base' },
]

export function AssetFilters({
  selectedType,
  selectedChain,
  search,
  onTypeChange,
  onChainChange,
  onSearchChange,
}: AssetFiltersProps) {
  const chainList = useMemo(() => chainOptions, [])

  return (
    <div className="bg-white border border-gray-200 rounded-2xl p-4 shadow-sm">
      <div className="grid md:grid-cols-4 gap-4">
        <div className="md:col-span-2">
          <label className="text-xs text-gray-500 mb-1 block">搜索资产</label>
          <input
            type="text"
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
            placeholder="输入名称 / 符号 / 合约地址"
          />
        </div>
        <div>
          <label className="text-xs text-gray-500 mb-1 block">资产类别</label>
          <select
            value={selectedType}
            onChange={(e) => onTypeChange(e.target.value)}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
          >
            {typeOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-xs text-gray-500 mb-1 block">链/来源</label>
          <select
            value={selectedChain}
            onChange={(e) => onChainChange(e.target.value)}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
          >
            {chainList.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
      </div>
    </div>
  )
}

