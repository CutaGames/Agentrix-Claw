import Head from 'next/head'
import Image from 'next/image'
import { useRouter } from 'next/router'
import { useState, useEffect } from 'react'
import { Navigation } from '../components/ui/Navigation'
import { Footer } from '../components/layout/Footer'
import { productApi, ProductInfo } from '../lib/api/product.api'
import { useUser } from '../contexts/UserContext'

export default function TestScenarios() {
  const router = useRouter()
  const { user } = useUser()
  const [products, setProducts] = useState<ProductInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedScenario, setSelectedScenario] = useState<string | null>(null)

  useEffect(() => {
    loadProducts()
  }, [])

  const loadProducts = async () => {
    try {
      setLoading(true)
      const data = await productApi.getProducts()
      setProducts(data || [])
    } catch (error) {
      console.error('加载商品失败:', error)
      setProducts([])
    } finally {
      setLoading(false)
    }
  }

  const scenarios = [
    {
      id: 'quickpay',
      title: 'QuickPay 小额支付测试',
      description: '测试 X402 协议的 QuickPay 小额支付功能',
      products: products.filter(
        (p) => p.metadata?.paymentMethod === 'quickpay'
      ),
      steps: [
        '选择 QuickPay 商品（0.1 USDT）',
        '使用 X402 协议快速支付',
        '验证支付成功和佣金分配',
      ],
      icon: '⚡',
      color: 'from-green-500 to-emerald-500',
    },
    {
      id: 'wallet-nft',
      title: '钱包支付 NFT 商品测试',
      description: '测试数字货币钱包支付 NFT 游戏道具',
      products: products.filter(
        (p) => p.metadata?.paymentMethod === 'wallet' && p.metadata?.productType === 'nft'
      ),
      steps: [
        '选择 NFT 商品（10 USDT）',
        '连接数字货币钱包',
        '完成支付并验证 NFT 交付',
        '检查佣金分配机制',
      ],
      icon: '🎮',
      color: 'from-purple-500 to-pink-500',
    },
    {
      id: 'stripe',
      title: 'Stripe 支付测试',
      description: '测试 Stripe 支付和佣金分配（模拟）',
      products: products.filter(
        (p) => p.metadata?.paymentMethod === 'stripe'
      ),
      steps: [
        '选择 Stripe 商品（500 RMB）',
        '模拟 Stripe 支付流程',
        '验证佣金分配机制',
        '检查结算周期',
      ],
      icon: '💳',
      color: 'from-blue-500 to-cyan-500',
    },
    {
      id: 'physical',
      title: '实物商品完整流程',
      description: '测试实物商品的支付、物流和结算流程',
      products: products.filter(
        (p) => p.metadata?.productType === 'physical'
      ),
      steps: [
        '选择实物商品',
        '完成支付',
        '模拟物流配送',
        '验证结算和佣金分配',
      ],
      icon: '📦',
      color: 'from-orange-500 to-red-500',
    },
  ]

  const handleProductClick = (product: ProductInfo) => {
    // 跳转到统一支付页面
    router.push(`/pay/checkout?productId=${product.id}`)
  }

  return (
    <>
      <Head>
        <title>Agentrix 测试场景 | 支付流程验证</title>
        <meta
          name="description"
          content="Agentrix 统一支付流程测试场景，验证不同支付方式和资产类型的佣金分配机制"
        />
      </Head>

      <Navigation />

      <main className="min-h-screen bg-slate-950 text-white">
        {/* Hero Section */}
        <section className="border-b border-white/10 bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-900">
          <div className="container mx-auto px-6 py-16 lg:py-24">
            <div className="text-center space-y-6">
              <h1 className="text-4xl md:text-5xl font-bold">
                Agentrix 测试场景
              </h1>
              <p className="text-slate-300 max-w-3xl mx-auto text-lg">
                验证统一支付流程和佣金分配机制的有效性
              </p>
              <div className="flex gap-4 justify-center">
                <button
                  onClick={() => router.push('/marketplace')}
                  className="bg-white text-slate-900 font-semibold px-6 py-3 rounded-xl shadow hover:-translate-y-0.5 transition"
                >
                  查看 Marketplace
                </button>
                <button
                  onClick={() => router.push('/agent-enhanced')}
                  className="border border-white/30 px-6 py-3 rounded-xl font-semibold hover:bg-white/10 transition"
                >
                  打开 Agent
                </button>
              </div>
            </div>
          </div>
        </section>

        {/* Test Scenarios */}
        <section className="border-b border-white/5 bg-slate-900">
          <div className="container mx-auto px-6 py-16 space-y-8">
            <div className="text-center">
              <h2 className="text-3xl font-bold mb-4">测试场景</h2>
              <p className="text-slate-300">
                选择不同的测试场景，验证支付流程和佣金分配
              </p>
            </div>

            <div className="grid md:grid-cols-2 gap-6">
              {scenarios.map((scenario) => (
                <div
                  key={scenario.id}
                  className={`bg-gradient-to-br ${scenario.color} rounded-2xl p-6 cursor-pointer hover:scale-105 transition-all ${
                    selectedScenario === scenario.id ? 'ring-4 ring-white/50' : ''
                  }`}
                  onClick={() => setSelectedScenario(
                    selectedScenario === scenario.id ? null : scenario.id
                  )}
                >
                  <div className="flex items-start gap-4">
                    <div className="text-4xl">{scenario.icon}</div>
                    <div className="flex-1">
                      <h3 className="text-xl font-bold mb-2">{scenario.title}</h3>
                      <p className="text-white/90 text-sm mb-4">
                        {scenario.description}
                      </p>
                      <div className="space-y-2">
                        <p className="text-xs font-semibold text-white/80">
                          测试步骤：
                        </p>
                        <ol className="space-y-1 text-xs text-white/90">
                          {scenario.steps.map((step, index) => (
                            <li key={index} className="flex items-start gap-2">
                              <span className="w-5 h-5 rounded-full bg-white/20 text-xs flex items-center justify-center flex-shrink-0">
                                {index + 1}
                              </span>
                              <span>{step}</span>
                            </li>
                          ))}
                        </ol>
                      </div>
                      {scenario.products.length > 0 && (
                        <div className="mt-4 pt-4 border-t border-white/20">
                          <p className="text-xs font-semibold text-white/80 mb-2">
                            可用商品 ({scenario.products.length}):
                          </p>
                          <div className="space-y-2">
                            {scenario.products.slice(0, 2).map((product) => (
                              <div
                                key={product.id}
                                className="bg-white/10 rounded-lg p-2 text-xs"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  handleProductClick(product)
                                }}
                              >
                                <div className="font-semibold">{product.name}</div>
                                <div className="text-white/70">
                                  {product.metadata?.currency === 'USDT' ? '$' : '¥'}
                                  {product.price} {product.metadata?.currency || 'CNY'}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* All Products */}
        <section className="border-b border-white/5 bg-slate-950">
          <div className="container mx-auto px-6 py-16 space-y-8">
            <div className="text-center">
              <h2 className="text-3xl font-bold mb-4">所有测试商品</h2>
              <p className="text-slate-300">
                查看所有可用于测试的商品
              </p>
            </div>

            {loading ? (
              <div className="text-center py-12 text-slate-400">
                加载中...
              </div>
            ) : products.length === 0 ? (
              <div className="text-center py-12 space-y-4">
                <p className="text-slate-400">暂无测试商品</p>
                <p className="text-sm text-slate-500">
                  请先运行脚本创建测试商品：
                </p>
                <code className="block bg-slate-900 p-4 rounded-lg text-xs text-left max-w-2xl mx-auto">
                  cd backend<br />
                  npx ts-node scripts/create-test-products.ts
                </code>
              </div>
            ) : (
              <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
                {products.map((product) => (
                  <div
                    key={product.id}
                    className="bg-white/5 border border-white/10 rounded-xl p-6 hover:border-white/30 transition-all cursor-pointer"
                    onClick={() => handleProductClick(product)}
                  >
                    {product.metadata?.image && (
                      <div className="mb-4 rounded-lg overflow-hidden relative h-48">
                        <Image
                          src={product.metadata.image}
                          alt={product.name}
                          fill
                          className="object-cover"
                          unoptimized
                        />
                      </div>
                    )}
                    <h3 className="text-lg font-semibold mb-2">{product.name}</h3>
                    <p className="text-sm text-slate-400 mb-4 line-clamp-2">
                      {product.description}
                    </p>
                    <div className="flex items-center justify-between mb-4">
                      <div>
                        <span className="text-2xl font-bold text-green-400">
                          {product.metadata?.currency === 'USDT' ? '$' : '¥'}
                          {product.price}
                        </span>
                        {product.metadata?.currency && (
                          <span className="text-sm text-slate-400 ml-1">
                            {product.metadata.currency}
                          </span>
                        )}
                      </div>
                      {product.metadata?.paymentMethod && (
                        <span className="text-xs px-2 py-1 bg-green-500/20 text-green-400 rounded">
                          {product.metadata.paymentMethod}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center justify-between text-xs text-slate-500">
                      <span className="px-2 py-1 bg-blue-500/20 text-blue-400 rounded">
                        {product.category}
                      </span>
                      <span>库存: {product.stock}</span>
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        handleProductClick(product)
                      }}
                      className="w-full mt-4 bg-gradient-to-r from-blue-600 to-indigo-600 text-white py-2 rounded-lg font-semibold hover:opacity-90 transition"
                    >
                      立即测试购买
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>

        {/* Instructions */}
        <section className="border-b border-white/5 bg-slate-900">
          <div className="container mx-auto px-6 py-16">
            <div className="bg-white/5 border border-white/10 rounded-2xl p-8 space-y-6">
              <h2 className="text-2xl font-bold">测试说明</h2>
              <div className="space-y-4 text-slate-300">
                <div>
                  <h3 className="font-semibold text-white mb-2">第一步：创建测试商品</h3>
                  <p className="text-sm mb-2">
                    运行脚本为测试账户创建测试商品：
                  </p>
                  <code className="block bg-slate-950 p-4 rounded-lg text-xs">
                    cd backend<br />
                    npx ts-node scripts/create-test-products.ts
                  </code>
                </div>
                <div>
                  <h3 className="font-semibold text-white mb-2">第二步：测试购买流程</h3>
                  <p className="text-sm">
                    选择不同的测试场景，通过 Agent 或直接购买商品，验证支付流程和佣金分配机制。
                  </p>
                </div>
                <div>
                  <h3 className="font-semibold text-white mb-2">第三步：验证佣金分配</h3>
                  <p className="text-sm">
                    检查不同资产类型、不同 Agent 类型的分佣机制是否正确工作。
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </>
  )
}
