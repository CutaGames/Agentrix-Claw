/**
 * 商品定价管理组件
 * 支持多国家定价、区域定价、税费设置
 */

import { useState } from 'react'
import { pricingApi } from '../../lib/api/pricing.api'
import { taxApi } from '../../lib/api/tax.api'

interface CountryPrice {
  countryCode: string
  price: number
  currency: string
  taxIncluded: boolean
  taxRate?: number
  reason?: string
}

interface RegionPrice {
  regionCode: string
  price: number
  currency: string
  taxIncluded: boolean
  taxRate?: number
  reason?: string
}

interface ProductPricingManagerProps {
  productId?: string
  basePrice: number
  baseCurrency: string
  onSave?: (pricing: {
    basePrice: number
    baseCurrency: string
    countryPrices: CountryPrice[]
    regionPrices: RegionPrice[]
  }) => void
}

export function ProductPricingManager({
  productId,
  basePrice,
  baseCurrency,
  onSave,
}: ProductPricingManagerProps) {
  const [activeTab, setActiveTab] = useState<'base' | 'country' | 'region'>('base')
  const [countryPrices, setCountryPrices] = useState<CountryPrice[]>([])
  const [regionPrices, setRegionPrices] = useState<RegionPrice[]>([])
  const [editingCountry, setEditingCountry] = useState<CountryPrice | null>(null)
  const [editingRegion, setEditingRegion] = useState<RegionPrice | null>(null)

  const commonCountries = [
    { code: 'US', name: '美国', currency: 'USD' },
    { code: 'CN', name: '中国', currency: 'CNY' },
    { code: 'GB', name: '英国', currency: 'GBP' },
    { code: 'JP', name: '日本', currency: 'JPY' },
    { code: 'DE', name: '德国', currency: 'EUR' },
    { code: 'FR', name: '法国', currency: 'EUR' },
    { code: 'CA', name: '加拿大', currency: 'CAD' },
    { code: 'AU', name: '澳大利亚', currency: 'AUD' },
  ]

  const commonRegions = [
    { code: 'US-CA', name: '美国-加州' },
    { code: 'US-NY', name: '美国-纽约' },
    { code: 'US-TX', name: '美国-德州' },
    { code: 'CA-ON', name: '加拿大-安大略' },
    { code: 'CA-BC', name: '加拿大-不列颠哥伦比亚' },
  ]

  const handleAddCountryPrice = () => {
    setEditingCountry({
      countryCode: '',
      price: basePrice,
      currency: baseCurrency,
      taxIncluded: true,
    })
  }

  const handleSaveCountryPrice = () => {
    if (!editingCountry) return

    if (editingCountry.countryCode) {
      // 计算税费
      taxApi.calculateTax(editingCountry.price, editingCountry.countryCode)
        .then((tax) => {
          editingCountry.taxRate = tax.rate
        })
        .catch(() => {
          // 如果计算失败，使用默认值
        })
    }

    const existing = countryPrices.findIndex(
      (p) => p.countryCode === editingCountry.countryCode
    )
    if (existing >= 0) {
      setCountryPrices(
        countryPrices.map((p, i) => (i === existing ? editingCountry : p))
      )
    } else {
      setCountryPrices([...countryPrices, editingCountry])
    }
    setEditingCountry(null)
  }

  const handleAddRegionPrice = () => {
    setEditingRegion({
      regionCode: '',
      price: basePrice,
      currency: baseCurrency,
      taxIncluded: true,
    })
  }

  const handleSaveRegionPrice = () => {
    if (!editingRegion) return

    const existing = regionPrices.findIndex(
      (p) => p.regionCode === editingRegion.regionCode
    )
    if (existing >= 0) {
      setRegionPrices(
        regionPrices.map((p, i) => (i === existing ? editingRegion : p))
      )
    } else {
      setRegionPrices([...regionPrices, editingRegion])
    }
    setEditingRegion(null)
  }

  const handleSaveAll = () => {
    if (onSave) {
      onSave({
        basePrice,
        baseCurrency,
        countryPrices,
        regionPrices,
      })
    }
  }

  return (
    <div className="space-y-6">
      {/* 标签页 */}
      <div className="border-b border-gray-200">
        <nav className="-mb-px flex space-x-8">
          {[
            { id: 'base', name: '基础价格' },
            { id: 'country', name: '国家价格' },
            { id: 'region', name: '区域价格' },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`whitespace-nowrap py-2 px-1 border-b-2 font-medium text-sm ${
                activeTab === tab.id
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              {tab.name}
            </button>
          ))}
        </nav>
      </div>

      {/* 基础价格 */}
      {activeTab === 'base' && (
        <div className="bg-gray-50 rounded-lg p-4">
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                基础价格
              </label>
              <div className="text-lg font-semibold text-gray-900">
                {basePrice.toFixed(2)} {baseCurrency}
              </div>
              <p className="text-xs text-gray-500 mt-1">
                这是商品的默认价格，如果没有设置国家或区域价格，将使用此价格
              </p>
            </div>
          </div>
        </div>
      )}

      {/* 国家价格 */}
      {activeTab === 'country' && (
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <h3 className="text-sm font-semibold text-gray-700">国家价格设置</h3>
            <button
              onClick={handleAddCountryPrice}
              className="px-3 py-1 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700"
            >
              + 添加国家价格
            </button>
          </div>

          {countryPrices.length > 0 && (
            <div className="space-y-2">
              {countryPrices.map((price, index) => (
                <div
                  key={index}
                  className="flex items-center justify-between p-3 bg-white border border-gray-200 rounded-lg"
                >
                  <div>
                    <div className="font-medium text-gray-900">
                      {commonCountries.find((c) => c.code === price.countryCode)?.name ||
                        price.countryCode}
                    </div>
                    <div className="text-sm text-gray-600">
                      {price.price.toFixed(2)} {price.currency}
                      {price.taxRate && ` (税费: ${(price.taxRate * 100).toFixed(2)}%)`}
                    </div>
                  </div>
                  <button
                    onClick={() => setEditingCountry(price)}
                    className="text-blue-600 hover:text-blue-700 text-sm"
                  >
                    编辑
                  </button>
                </div>
              ))}
            </div>
          )}

          {editingCountry && (
            <div className="bg-white border border-gray-200 rounded-lg p-4 space-y-4">
              <h4 className="font-semibold text-gray-900">设置国家价格</h4>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  选择国家
                </label>
                <select
                  value={editingCountry.countryCode}
                  onChange={(e) =>
                    setEditingCountry({
                      ...editingCountry,
                      countryCode: e.target.value,
                      currency:
                        commonCountries.find((c) => c.code === e.target.value)?.currency ||
                        baseCurrency,
                    })
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                >
                  <option value="">选择国家</option>
                  {commonCountries.map((country) => (
                    <option key={country.code} value={country.code}>
                      {country.name} ({country.code})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  价格
                </label>
                <input
                  type="number"
                  value={editingCountry.price}
                  onChange={(e) =>
                    setEditingCountry({
                      ...editingCountry,
                      price: parseFloat(e.target.value) || 0,
                    })
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                  min="0"
                  step="0.01"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  货币
                </label>
                <input
                  type="text"
                  value={editingCountry.currency}
                  onChange={(e) =>
                    setEditingCountry({ ...editingCountry, currency: e.target.value })
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                  maxLength={3}
                />
              </div>
              <div>
                <label className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    checked={editingCountry.taxIncluded}
                    onChange={(e) =>
                      setEditingCountry({
                        ...editingCountry,
                        taxIncluded: e.target.checked,
                      })
                    }
                  />
                  <span className="text-sm text-gray-700">价格包含税费</span>
                </label>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  说明（可选）
                </label>
                <input
                  type="text"
                  value={editingCountry.reason || ''}
                  onChange={(e) =>
                    setEditingCountry({ ...editingCountry, reason: e.target.value })
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                  placeholder="例如：市场定价策略"
                />
              </div>
              <div className="flex space-x-3">
                <button
                  onClick={() => setEditingCountry(null)}
                  className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50"
                >
                  取消
                </button>
                <button
                  onClick={handleSaveCountryPrice}
                  className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                >
                  保存
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* 区域价格 */}
      {activeTab === 'region' && (
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <h3 className="text-sm font-semibold text-gray-700">区域价格设置</h3>
            <button
              onClick={handleAddRegionPrice}
              className="px-3 py-1 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700"
            >
              + 添加区域价格
            </button>
          </div>

          {regionPrices.length > 0 && (
            <div className="space-y-2">
              {regionPrices.map((price, index) => (
                <div
                  key={index}
                  className="flex items-center justify-between p-3 bg-white border border-gray-200 rounded-lg"
                >
                  <div>
                    <div className="font-medium text-gray-900">
                      {commonRegions.find((r) => r.code === price.regionCode)?.name ||
                        price.regionCode}
                    </div>
                    <div className="text-sm text-gray-600">
                      {price.price.toFixed(2)} {price.currency}
                      {price.taxRate && ` (税费: ${(price.taxRate * 100).toFixed(2)}%)`}
                    </div>
                  </div>
                  <button
                    onClick={() => setEditingRegion(price)}
                    className="text-blue-600 hover:text-blue-700 text-sm"
                  >
                    编辑
                  </button>
                </div>
              ))}
            </div>
          )}

          {editingRegion && (
            <div className="bg-white border border-gray-200 rounded-lg p-4 space-y-4">
              <h4 className="font-semibold text-gray-900">设置区域价格</h4>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  选择区域
                </label>
                <select
                  value={editingRegion.regionCode}
                  onChange={(e) =>
                    setEditingRegion({ ...editingRegion, regionCode: e.target.value })
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                >
                  <option value="">选择区域</option>
                  {commonRegions.map((region) => (
                    <option key={region.code} value={region.code}>
                      {region.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  价格
                </label>
                <input
                  type="number"
                  value={editingRegion.price}
                  onChange={(e) =>
                    setEditingRegion({
                      ...editingRegion,
                      price: parseFloat(e.target.value) || 0,
                    })
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                  min="0"
                  step="0.01"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  货币
                </label>
                <input
                  type="text"
                  value={editingRegion.currency}
                  onChange={(e) =>
                    setEditingRegion({ ...editingRegion, currency: e.target.value })
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                  maxLength={3}
                />
              </div>
              <div>
                <label className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    checked={editingRegion.taxIncluded}
                    onChange={(e) =>
                      setEditingRegion({
                        ...editingRegion,
                        taxIncluded: e.target.checked,
                      })
                    }
                  />
                  <span className="text-sm text-gray-700">价格包含税费</span>
                </label>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  说明（可选）
                </label>
                <input
                  type="text"
                  value={editingRegion.reason || ''}
                  onChange={(e) =>
                    setEditingRegion({ ...editingRegion, reason: e.target.value })
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                  placeholder="例如：区域市场定价"
                />
              </div>
              <div className="flex space-x-3">
                <button
                  onClick={() => setEditingRegion(null)}
                  className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50"
                >
                  取消
                </button>
                <button
                  onClick={handleSaveRegionPrice}
                  className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                >
                  保存
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* 保存按钮 */}
      <div className="flex justify-end">
        <button
          onClick={handleSaveAll}
          className="px-6 py-2 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700"
        >
          保存所有价格设置
        </button>
      </div>
    </div>
  )
}

