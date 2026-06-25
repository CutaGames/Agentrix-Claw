import Head from 'next/head'
import { useRouter } from 'next/router'
import { useEffect, useState } from 'react'
import { usePayment } from '../../contexts/PaymentContext'

export default function TippingPayment() {
  const router = useRouter()
  const { startPayment } = usePayment()
  const [creator, setCreator] = useState<any>(null)
  const [selectedAmount, setSelectedAmount] = useState<string>('¥5')
  const [customAmount, setCustomAmount] = useState<string>('')

  useEffect(() => {
    const mockCreator = {
      id: 'creator_001',
      name: 'AI创作大师',
      avatar: '🎨',
      description: '专业AI图片生成创作者',
      totalEarnings: '¥12,580',
      followers: '8.5K',
      rating: 4.9,
    }
    setCreator(mockCreator)
  }, [])

  const presetAmounts = ['¥5', '¥10', '¥20', '¥50', '¥100']

  const handlePayment = () => {
    const amount = customAmount || selectedAmount
    const paymentRequest = {
      id: 'pay_tip_' + Date.now(),
      amount,
      currency: 'CNY',
      description: `打赏给 ${creator?.name}`,
      merchant: '内容创作平台',
      recipient: creator?.name,
      metadata: {
        paymentType: 'tipping',
        creatorId: creator?.id,
        isOnChain: true,
        useX402: parseFloat(amount.replace('¥', '')) <= 50, // 小额使用X402
      },
      createdAt: new Date().toISOString()
    }
    startPayment(paymentRequest)
  }

  if (!creator) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="text-4xl mb-4">💰</div>
          <p>加载中...</p>
        </div>
      </div>
    )
  }

  return (
    <>
      <Head>
        <title>内容打赏 - Agentrix</title>
      </Head>
      <div className="min-h-screen bg-gradient-to-br from-yellow-50 to-orange-50 py-8">
        <div className="max-w-2xl mx-auto px-4">
          <div className="text-center mb-8">
            <div className="text-5xl mb-4">💰</div>
            <h1 className="text-3xl font-bold text-gray-900 mb-2">内容打赏</h1>
            <p className="text-gray-600">支持您喜欢的创作者</p>
          </div>

          <div className="bg-white rounded-2xl shadow-lg border border-gray-200 p-6 mb-6">
            {/* 创作者信息 */}
            <div className="text-center mb-6 pb-6 border-b border-gray-200">
              <div className="text-6xl mb-4">{creator.avatar}</div>
              <h2 className="text-2xl font-bold text-gray-900 mb-2">{creator.name}</h2>
              <p className="text-gray-600 mb-4">{creator.description}</p>
              <div className="flex justify-center space-x-6 text-sm">
                <div>
                  <div className="font-semibold text-gray-900">{creator.totalEarnings}</div>
                  <div className="text-gray-500">总收益</div>
                </div>
                <div>
                  <div className="font-semibold text-gray-900">{creator.followers}</div>
                  <div className="text-gray-500">粉丝</div>
                </div>
                <div>
                  <div className="font-semibold text-gray-900">⭐ {creator.rating}</div>
                  <div className="text-gray-500">评分</div>
                </div>
              </div>
            </div>

            {/* 打赏金额选择 */}
            <div className="mb-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">选择打赏金额</h3>
              <div className="grid grid-cols-5 gap-3 mb-4">
                {presetAmounts.map((amount) => (
                  <button
                    key={amount}
                    onClick={() => {
                      setSelectedAmount(amount)
                      setCustomAmount('')
                    }}
                    className={`py-3 px-4 rounded-lg font-semibold transition-colors ${
                      selectedAmount === amount && !customAmount
                        ? 'bg-yellow-500 text-white'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                  >
                    {amount}
                  </button>
                ))}
              </div>
              <div className="mt-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  或输入自定义金额
                </label>
                <input
                  type="text"
                  value={customAmount}
                  onChange={(e) => {
                    setCustomAmount(e.target.value)
                    setSelectedAmount('')
                  }}
                  placeholder="¥0.00"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-yellow-500"
                />
              </div>
            </div>

            {/* 支付信息 */}
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-6">
              <div className="flex justify-between items-center mb-2">
                <span className="text-gray-700">打赏金额</span>
                <span className="text-2xl font-bold text-yellow-600">
                  {customAmount || selectedAmount}
                </span>
              </div>
              {parseFloat((customAmount || selectedAmount).replace('¥', '')) <= 50 && (
                <p className="text-xs text-yellow-700 mt-2">
                  💡 小额打赏将使用X402协议，无需每次签名
                </p>
              )}
            </div>

            {/* 打赏说明 */}
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
              <h3 className="font-semibold text-blue-900 mb-2">打赏说明</h3>
              <div className="space-y-2 text-sm text-blue-700">
                <div className="flex items-start space-x-2">
                  <span>✓</span>
                  <span>打赏金额将直接到账创作者账户</span>
                </div>
                <div className="flex items-start space-x-2">
                  <span>✓</span>
                  <span>支持法币和加密货币支付</span>
                </div>
                <div className="flex items-start space-x-2">
                  <span>✓</span>
                  <span>小额打赏使用X402协议，快速到账</span>
                </div>
              </div>
            </div>

            <button
              onClick={handlePayment}
              disabled={!customAmount && !selectedAmount}
              className="w-full bg-yellow-500 text-white py-4 rounded-lg font-semibold text-lg hover:bg-yellow-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              💰 确认打赏 {customAmount || selectedAmount}
            </button>
          </div>

          {/* 打赏优势 */}
          <div className="bg-white rounded-2xl shadow-lg border border-gray-200 p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">打赏优势</h3>
            <div className="grid md:grid-cols-3 gap-4">
              <div className="text-center">
                <div className="text-3xl mb-2">⚡</div>
                <div className="font-semibold text-gray-900">快速到账</div>
                <div className="text-sm text-gray-600">实时结算</div>
              </div>
              <div className="text-center">
                <div className="text-3xl mb-2">💳</div>
                <div className="font-semibold text-gray-900">多种支付</div>
                <div className="text-sm text-gray-600">法币+加密</div>
              </div>
              <div className="text-center">
                <div className="text-3xl mb-2">🛡️</div>
                <div className="font-semibold text-gray-900">安全可靠</div>
                <div className="text-sm text-gray-600">透明分润</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}

