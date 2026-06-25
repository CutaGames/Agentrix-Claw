import { useState, useEffect } from 'react'
import { useRouter } from 'next/router'
import { productApi, ProductInfo } from '../../lib/api/product.api'

interface Product {
  id: string
  name: string
  description: string
  price: number
  currency: string
  category: 'electronics' | 'clothing' | 'books' | 'home' | 'food' | 'other'
  merchant: string
  image?: string
  rating?: number
  stock?: number
}

interface Service {
  id: string
  name: string
  description: string
  price: number
  currency: string
  category: 'consultation' | 'subscription' | 'technical' | 'design' | 'marketing' | 'other'
  merchant: string
  duration?: string
  rating?: number
}

const mockProducts: Product[] = [
  {
    id: 'prod-1',
    name: '联想 Yoga 14s 笔记本电脑',
    description: '14英寸 2.8K高分辨率屏幕，AMD Ryzen 7处理器，16GB内存，512GB SSD',
    price: 5999,
    currency: 'CNY',
    category: 'electronics',
    merchant: '联想官方旗舰店',
    rating: 4.8,
    stock: 15,
  },
  {
    id: 'prod-2',
    name: 'Apple AirPods Pro 2',
    description: '主动降噪，空间音频，MagSafe充电盒',
    price: 1899,
    currency: 'CNY',
    category: 'electronics',
    merchant: 'Apple官方',
    rating: 4.9,
    stock: 50,
  },
  {
    id: 'prod-3',
    name: 'Kindle Paperwhite 电子书阅读器',
    description: '6.8英寸屏幕，32GB存储，防水设计',
    price: 899,
    currency: 'CNY',
    category: 'electronics',
    merchant: '亚马逊官方',
    rating: 4.7,
    stock: 30,
  },
  {
    id: 'prod-4',
    name: 'Nike Air Max 270 运动鞋',
    description: '经典气垫设计，舒适透气',
    price: 799,
    currency: 'CNY',
    category: 'clothing',
    merchant: 'Nike官方',
    rating: 4.6,
    stock: 25,
  },
  {
    id: 'prod-5',
    name: '《AI商业应用指南》',
    description: '全面介绍AI在商业领域的应用案例和实践方法',
    price: 89,
    currency: 'CNY',
    category: 'books',
    merchant: '科技出版社',
    rating: 4.5,
    stock: 100,
  },
]

const mockServices: Service[] = [
  {
    id: 'svc-1',
    name: 'AI Agent 开发咨询服务',
    description: '提供AI Agent架构设计、开发指导、最佳实践咨询',
    price: 500,
    currency: 'CNY',
    category: 'consultation',
    merchant: 'Agentrix技术团队',
    duration: '1小时',
    rating: 4.9,
  },
  {
    id: 'svc-2',
    name: 'Agentrix SDK 企业版订阅',
    description: '包含高级API、优先支持、定制化功能',
    price: 999,
    currency: 'CNY',
    category: 'subscription',
    merchant: 'Agentrix',
    duration: '月度',
    rating: 4.8,
  },
  {
    id: 'svc-3',
    name: '智能支付系统集成服务',
    description: '帮助商户快速集成Agentrix支付系统，包含技术支持和培训',
    price: 5000,
    currency: 'CNY',
    category: 'technical',
    merchant: 'Agentrix专业服务',
    duration: '一次性',
    rating: 4.7,
  },
  {
    id: 'svc-4',
    name: 'UI/UX设计服务',
    description: '专业的界面设计和用户体验优化服务',
    price: 3000,
    currency: 'CNY',
    category: 'design',
    merchant: '设计工作室',
    duration: '项目制',
    rating: 4.6,
  },
  {
    id: 'svc-5',
    name: '数字营销策略咨询',
    description: '提供数字营销策略、SEO优化、社交媒体营销方案',
    price: 2000,
    currency: 'CNY',
    category: 'marketing',
    merchant: '营销咨询公司',
    duration: '月度',
    rating: 4.5,
  },
]

interface ProductServiceSectionProps {
  type?: 'physical' | 'service' | 'digital';
}

export function ProductServiceSection({ type }: ProductServiceSectionProps) {
  const router = useRouter()
  const [activeTab, setActiveTab] = useState<'products' | 'services'>('products')
  const [products, setProducts] = useState<ProductInfo[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadProducts()
  }, [type])

  const loadProducts = async () => {
    try {
      setLoading(true)
      const data = await productApi.getProducts({ type })
      setProducts(data || [])
    } catch (error) {
      console.error('加载商品失败:', error)
      setProducts([])
    } finally {
      setLoading(false)
    }
  }

  const handleProductClick = (product: ProductInfo) => {
    // 跳转到统一支付页面
    router.push(`/pay/checkout?productId=${product.id}`)
  }

  const handleServiceClick = (product: ProductInfo) => {
    // 跳转到统一支付页面
    router.push(`/pay/checkout?productId=${product.id}`)
  }

  // 将商品按类型分类
  const physicalProducts = products.filter(
    (p) => p.productType === 'physical' || p.metadata?.productType === 'physical' || (!p.productType && !p.metadata?.productType)
  )
  const serviceProducts = products.filter(
    (p) => p.productType === 'service' || p.metadata?.productType === 'service'
  )
  const digitalProducts = products.filter(
    (p) => p.productType === 'ft' || p.productType === 'nft' || p.productType === 'game_asset' || p.metadata?.productType === 'digital'
  )

  const displayProducts = type === 'digital' ? digitalProducts : activeTab === 'products' ? physicalProducts : serviceProducts;

  return (
    <section className="py-16 bg-white">
      <div className="container mx-auto px-6">
        <div className="text-center mb-12">
          <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">
            {type === 'digital' ? '虚拟资产' : '实体产品与服务'}
          </h2>
          <p className="text-lg text-gray-600 max-w-3xl mx-auto">
            {type === 'digital' 
              ? 'Agentrix Marketplace 聚合了全链资产，为您提供最优质的数字资产交易体验' 
              : 'Agentrix Marketplace 不仅聚合链上资产，还支持实体商品和各类服务的交易'}
          </p>
        </div>

        {/* Tab切换 - 仅在非数字资产模式下显示 */}
        {type !== 'digital' && (
          <div className="flex justify-center mb-8">
            <div className="inline-flex bg-gray-100 rounded-lg p-1">
              <button
                onClick={() => setActiveTab('products')}
                className={`px-6 py-2 rounded-lg font-semibold transition-all ${
                  activeTab === 'products'
                    ? 'bg-white text-blue-600 shadow-sm'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                实体产品
              </button>
              <button
                onClick={() => setActiveTab('services')}
                className={`px-6 py-2 rounded-lg font-semibold transition-all ${
                  activeTab === 'services'
                    ? 'bg-white text-blue-600 shadow-sm'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                服务
              </button>
            </div>
          </div>
        )}

        {/* 产品列表 */}
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {loading ? (
            <div className="col-span-full text-center py-12 text-gray-500">
              加载中...
            </div>
          ) : displayProducts.length === 0 ? (
            <div className="col-span-full text-center py-12 text-gray-500">
              {type === 'digital' ? '暂无虚拟资产，请先创建代币或NFT商品' : '暂无商品，请先创建测试商品'}
            </div>
          ) : (
            displayProducts.map((product) => (
              <div
                key={product.id}
                className="bg-white border border-gray-200 rounded-xl p-6 hover:shadow-lg transition-all cursor-pointer"
                onClick={() => handleProductClick(product)}
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="flex-1">
                    <h3 className="text-lg font-semibold text-gray-900 mb-1">
                      {product.name}
                    </h3>
                    <p className="text-sm text-gray-600 mb-2 line-clamp-2">
                      {product.description}
                    </p>
                  </div>
                </div>
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <span className="text-2xl font-bold text-blue-600">
                      {product.metadata?.currency === 'USDT' ? '$' : '¥'}
                      {product.price.toLocaleString()}
                    </span>
                    {product.metadata?.currency && (
                      <span className="text-sm text-gray-500 ml-1">
                        {product.metadata.currency}
                      </span>
                    )}
                  </div>
                  {product.metadata?.paymentMethod && (
                    <span className="text-xs px-2 py-1 bg-green-100 text-green-700 rounded">
                      {product.metadata.paymentMethod === 'quickpay' ? 'QuickPay' :
                       product.metadata.paymentMethod === 'wallet' ? '钱包支付' :
                       product.metadata.paymentMethod === 'stripe' ? 'Stripe' : '其他'}
                    </span>
                  )}
                </div>
                <div className="flex items-center justify-between text-xs text-gray-500 mb-3">
                  <span className="px-2 py-1 bg-blue-50 text-blue-600 rounded">
                    {product.category}
                  </span>
                  <span>库存: {product.stock}</span>
                </div>
                {product.metadata?.image && (
                  <div className="mb-3 rounded-lg overflow-hidden">
                    <img
                      src={product.metadata.image}
                      alt={product.name}
                      className="w-full h-48 object-cover"
                    />
                  </div>
                )}
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    handleProductClick(product)
                  }}
                  className="w-full bg-blue-600 text-white py-2 rounded-lg font-semibold hover:bg-blue-700 transition-colors"
                >
                  立即购买
                </button>
              </div>
            ))
          )}
        </div>

        {/* CTA */}
        <div className="text-center mt-12">
          <p className="text-gray-600 mb-4">
            想要上架您的产品或服务？
          </p>
          <button
            onClick={() => router.push('/alliance')}
            className="bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white px-8 py-3 rounded-lg font-semibold transition-all transform hover:scale-105 shadow-lg hover:shadow-xl"
          >
            加入 Agentrix 联盟
          </button>
        </div>
      </div>
    </section>
  )
}

