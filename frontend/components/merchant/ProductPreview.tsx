import { ProductInfo } from '../../lib/api/product.api'

type PriceType = number | { amount: number; currency: string } | undefined

interface ProductPreviewProps {
  product: Omit<Partial<ProductInfo>, 'price'> & {
    name: string
    description?: string
    price?: PriceType
    productType?: string
    category?: string
    metadata?: any
  }
}

export function ProductPreview({ product }: ProductPreviewProps) {
  // 类型守卫：处理 price 可能是 number 或对象的情况
  let price: number = 0
  let currency: string = product.metadata?.currency || 'CNY'
  
  if (product.price === undefined || product.price === null) {
    price = 0
  } else if (typeof product.price === 'number') {
    price = product.price
  } else {
    // 此时 product.price 一定是 { amount: number; currency: string }
    const priceObj = product.price as { amount: number; currency: string }
    price = priceObj.amount
    currency = priceObj.currency || currency
  }
  
  const images = product.metadata?.core?.media?.images || []
  const mainImage = images.find((img: any) => img.type === 'thumbnail') || images[0]
  
  const getProductTypeLabel = (type?: string) => {
    const labels: Record<string, string> = {
      physical: '实物商品',
      service: '服务',
      nft: 'NFT',
      ft: '代币',
      game_asset: '游戏资产',
      rwa: '实物资产代币化',
      plugin: '插件',
      subscription: '订阅服务',
    }
    return labels[type || 'physical'] || '商品'
  }

  return (
    <div className="bg-white rounded-lg shadow-lg border border-gray-200 overflow-hidden">
      {/* 商品图片 */}
      <div className="relative w-full h-64 bg-gray-100">
        {mainImage ? (
          <img
            src={mainImage.url}
            alt={mainImage.alt || product.name}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-gray-400">
            <svg className="w-16 h-16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          </div>
        )}
        {product.productType && (
          <div className="absolute top-2 right-2 px-2 py-1 bg-blue-600 text-white text-xs rounded">
            {getProductTypeLabel(product.productType)}
          </div>
        )}
      </div>

      {/* 商品信息 */}
      <div className="p-6">
        <div className="mb-4">
          <h3 className="text-xl font-bold text-gray-900 mb-2">{product.name}</h3>
          {product.category && (
            <span className="inline-block px-2 py-1 bg-gray-100 text-gray-600 text-sm rounded">
              {product.category}
            </span>
          )}
        </div>

        {product.description && (
          <p className="text-gray-600 mb-4 line-clamp-3">{product.description}</p>
        )}

        {/* 价格 */}
        <div className="mb-4">
          <div className="flex items-baseline space-x-2">
            <span className="text-3xl font-bold text-blue-600">
              {currency === 'CNY' ? '¥' : currency === 'USD' ? '$' : currency}
              {price.toLocaleString()}
            </span>
            {currency !== 'CNY' && currency !== 'USD' && (
              <span className="text-sm text-gray-500">{currency}</span>
            )}
          </div>
        </div>

        {/* 商品类型特定信息 */}
        {product.productType === 'nft' && product.metadata?.typeSpecific && (
          <div className="mb-4 p-3 bg-purple-50 rounded-lg">
            <h4 className="text-sm font-semibold text-purple-900 mb-2">NFT 信息</h4>
            <div className="space-y-1 text-sm text-purple-700">
              {product.metadata.typeSpecific.contractAddress && (
                <div>合约地址: {product.metadata.typeSpecific.contractAddress}</div>
              )}
              {product.metadata.typeSpecific.tokenId && (
                <div>Token ID: {product.metadata.typeSpecific.tokenId}</div>
              )}
              {product.metadata.typeSpecific.chain && (
                <div>链: {product.metadata.typeSpecific.chain}</div>
              )}
            </div>
          </div>
        )}

        {product.productType === 'ft' && product.metadata?.typeSpecific && (
          <div className="mb-4 p-3 bg-green-50 rounded-lg">
            <h4 className="text-sm font-semibold text-green-900 mb-2">代币信息</h4>
            <div className="space-y-1 text-sm text-green-700">
              {product.metadata.typeSpecific.symbol && (
                <div>符号: {product.metadata.typeSpecific.symbol}</div>
              )}
              {product.metadata.typeSpecific.decimals && (
                <div>精度: {product.metadata.typeSpecific.decimals}</div>
              )}
              {product.metadata.typeSpecific.totalSupply && (
                <div>总供应量: {product.metadata.typeSpecific.totalSupply}</div>
              )}
            </div>
          </div>
        )}

        {product.productType === 'game_asset' && product.metadata?.typeSpecific && (
          <div className="mb-4 p-3 bg-yellow-50 rounded-lg">
            <h4 className="text-sm font-semibold text-yellow-900 mb-2">游戏资产信息</h4>
            <div className="space-y-1 text-sm text-yellow-700">
              {product.metadata.typeSpecific.gameName && (
                <div>游戏: {product.metadata.typeSpecific.gameName}</div>
              )}
              {product.metadata.typeSpecific.rarity && (
                <div>稀有度: {product.metadata.typeSpecific.rarity}</div>
              )}
              {product.metadata.typeSpecific.level && (
                <div>等级: {product.metadata.typeSpecific.level}</div>
              )}
            </div>
          </div>
        )}

        {product.productType === 'rwa' && product.metadata?.typeSpecific && (
          <div className="mb-4 p-3 bg-indigo-50 rounded-lg">
            <h4 className="text-sm font-semibold text-indigo-900 mb-2">实物资产信息</h4>
            <div className="space-y-1 text-sm text-indigo-700">
              {product.metadata.typeSpecific.assetType && (
                <div>资产类型: {product.metadata.typeSpecific.assetType}</div>
              )}
              {product.metadata.typeSpecific.location && (
                <div>位置: {product.metadata.typeSpecific.location}</div>
              )}
              {product.metadata.typeSpecific.certification && (
                <div>认证: {product.metadata.typeSpecific.certification}</div>
              )}
            </div>
          </div>
        )}

        {/* 标签 */}
        {product.metadata?.tags && product.metadata.tags.length > 0 && (
          <div className="mb-4">
            <div className="flex flex-wrap gap-2">
              {product.metadata.tags.map((tag: string, index: number) => (
                <span
                  key={index}
                  className="px-2 py-1 bg-gray-100 text-gray-600 text-xs rounded"
                >
                  {tag}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* 操作按钮 */}
        <div className="flex space-x-3">
          <button className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors">
            立即购买
          </button>
          <button className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors">
            加入购物车
          </button>
        </div>
      </div>
    </div>
  )
}

