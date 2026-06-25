import Head from 'next/head'
import Image from 'next/image'
import { useRouter } from 'next/router'
import { useEffect, useState } from 'react'
import { productApi, ProductInfo } from '../../../lib/api/product.api'
import { Navigation } from '../../../components/ui/Navigation'
import { Footer } from '../../../components/layout/Footer'
import { useCart } from '../../../contexts/CartContext'

export default function ProductDetailPage() {
  const router = useRouter()
  const { productId } = router.query
  const { addItem: addToCart } = useCart()
  const [product, setProduct] = useState<ProductInfo | null>(null)
  const [loading, setLoading] = useState(true)
  const [addingToCart, setAddingToCart] = useState(false)

  useEffect(() => {
    if (productId && typeof productId === 'string') {
      loadProduct(productId)
    } else {
      setLoading(false)
    }
  }, [productId])

  const loadProduct = async (id: string) => {
    try {
      setLoading(true)
      const data = await productApi.getProduct(id)
      setProduct(data)
      setLoading(false)
    } catch (error) {
      console.error('加载商品失败:', error)
      setLoading(false)
    }
  }

  const handleBuyNow = () => {
    if (!product) return
    router.push(`/pay/checkout?productId=${product.id}`)
  }

  const handleAddToCart = async () => {
    if (!product) return
    try {
      setAddingToCart(true)
      await addToCart(product.id, 1)
      alert('已添加到购物车')
    } catch (error) {
      console.error('添加购物车失败:', error)
      alert('添加失败，请重试')
    } finally {
      setAddingToCart(false)
    }
  }

  if (loading) {
    return (
      <>
        <Navigation />
        <div className="min-h-screen flex items-center justify-center bg-slate-950 text-white">
          <div className="text-center">
            <div className="text-4xl mb-4 animate-spin">⏳</div>
            <p>加载中...</p>
          </div>
        </div>
        <Footer />
      </>
    )
  }

  if (!product) {
    return (
      <>
        <Navigation />
        <div className="min-h-screen flex items-center justify-center bg-slate-950 text-white">
          <div className="text-center">
            <div className="text-4xl mb-4">❌</div>
            <p className="text-xl mb-2">商品不存在</p>
            <button
              onClick={() => router.push('/marketplace')}
              className="mt-4 px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              返回 Marketplace
            </button>
          </div>
        </div>
        <Footer />
      </>
    )
  }

  return (
    <>
      <Head>
        <title>{product.name} | Agentrix Marketplace</title>
        <meta name="description" content={product.description} />
      </Head>

      <Navigation />

      <main className="min-h-screen bg-slate-950 text-white">
        <div className="container mx-auto px-6 py-12">
          {/* 面包屑导航 */}
          <div className="flex items-center gap-2 text-sm text-slate-400 mb-8">
            <span 
              className="cursor-pointer hover:text-white transition"
              onClick={() => router.push('/marketplace')}
            >
              Marketplace
            </span>
            <span>/</span>
            <span className="text-white">{product.name}</span>
          </div>

          <div className="grid md:grid-cols-2 gap-12">
            {/* 左侧：商品图片 */}
            <div className="space-y-4">
              <div className="bg-white/5 border border-white/10 rounded-2xl overflow-hidden aspect-square flex items-center justify-center relative">
                {product.metadata?.image ? (
                  <Image
                    src={product.metadata.image}
                    alt={product.name}
                    fill
                    className="object-cover"
                    unoptimized
                  />
                ) : (
                  <div className="text-6xl">🛍️</div>
                )}
              </div>
            </div>

            {/* 右侧：商品信息 */}
            <div className="space-y-8">
              <div>
                <h1 className="text-3xl font-bold mb-4">{product.name}</h1>
                <div className="flex items-center gap-4 mb-4">
                  <span className="px-3 py-1 bg-blue-500/20 text-blue-400 rounded-full text-sm font-medium">
                    {product.category}
                  </span>
                  {product.metadata?.paymentMethod && (
                    <span className="px-3 py-1 bg-green-500/20 text-green-400 rounded-full text-sm font-medium">
                      {product.metadata.paymentMethod}
                    </span>
                  )}
                </div>
                <div className="text-3xl font-bold text-green-400 mb-2">
                  {product.metadata?.currency === 'USDT' ? '$' : '¥'}
                  {product.price}
                  {product.metadata?.currency && (
                    <span className="text-base text-slate-400 ml-1 font-normal">
                      {product.metadata.currency}
                    </span>
                  )}
                </div>
                <p className="text-slate-300 text-lg leading-relaxed">
                  {product.description}
                </p>
              </div>

              {/* 购买操作 */}
              <div className="bg-white/5 border border-white/10 rounded-2xl p-6 space-y-4">
                <div className="flex items-center justify-between text-sm text-slate-400">
                  <span>库存状态</span>
                  <span className={product.stock > 0 ? 'text-green-400' : 'text-red-400'}>
                    {product.stock > 0 ? `有货 (${product.stock})` : '缺货'}
                  </span>
                </div>
                
                <div className="grid grid-cols-2 gap-4 pt-4">
                  <button
                    onClick={handleAddToCart}
                    disabled={product.stock <= 0 || addingToCart}
                    className="px-6 py-3 bg-white/10 hover:bg-white/20 text-white rounded-xl font-semibold transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {addingToCart ? '添加中...' : '加入购物车'}
                  </button>
                  <button
                    onClick={handleBuyNow}
                    disabled={product.stock <= 0}
                    className="px-6 py-3 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white rounded-xl font-semibold transition-all shadow-lg shadow-blue-500/20 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    立即购买
                  </button>
                </div>
              </div>

              {/* 商品详情 */}
              <div className="space-y-4">
                <h3 className="text-xl font-bold border-b border-white/10 pb-2">
                  商品详情
                </h3>
                <div className="space-y-2 text-slate-300">
                  <p>
                    <span className="text-slate-500 mr-2">商家ID:</span>
                    {product.merchantId}
                  </p>
                  <p>
                    <span className="text-slate-500 mr-2">商品ID:</span>
                    {product.id}
                  </p>
                  {product.metadata?.productType && (
                    <p>
                      <span className="text-slate-500 mr-2">商品类型:</span>
                      {product.metadata.productType}
                    </p>
                  )}
                  {product.metadata?.assetType && (
                    <p>
                      <span className="text-slate-500 mr-2">资产类型:</span>
                      {product.metadata.assetType}
                    </p>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>

      <Footer />
    </>
  )
}
