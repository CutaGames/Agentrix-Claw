import Head from 'next/head'
import { useRouter } from 'next/router'
import { useEffect, useState } from 'react'
import { usePayment } from '../../contexts/PaymentContext'

export default function CrossBorderPayment() {
  const router = useRouter()
  const { startPayment } = usePayment()
  const [paymentStep, setPaymentStep] = useState<'kyc' | 'convert' | 'route' | 'payment' | 'success'>('kyc')
  const [kycStatus, setKycStatus] = useState<'none' | 'pending' | 'verified'>('none')
  const [fromCurrency, setFromCurrency] = useState('CNY')
  const [toCurrency, setToCurrency] = useState('USDC')
  const [exchangeRate, setExchangeRate] = useState<any>(null)
  const [routingInfo, setRoutingInfo] = useState<any>(null)
  const [paymentRequest, setPaymentRequest] = useState<any>(null)

  useEffect(() => {
    // 初始化支付请求
    const mockRequest = {
      id: 'pay_cross_' + Date.now(),
      amount: '¥1,000',
      currency: 'CNY',
      description: '跨境支付演示 - 购买海外商品',
      merchant: 'Global Store',
      metadata: {
        paymentType: 'cross-border',
        fromCountry: 'CN',
        toCountry: 'US',
        requiresKYC: true,
        requiresFX: true,
      },
      createdAt: new Date().toISOString()
    }
    setPaymentRequest(mockRequest)
  }, [])

  const handleKYC = async () => {
    setPaymentStep('kyc')
    setKycStatus('pending')
    
    // 模拟KYC流程
    await new Promise(resolve => setTimeout(resolve, 2000))
    setKycStatus('verified')
    
    // 自动进入下一步
    setTimeout(() => {
      setPaymentStep('convert')
    }, 1000)
  }

  const handleFXConversion = async () => {
    setPaymentStep('convert')
    
    // 模拟获取汇率
    await new Promise(resolve => setTimeout(resolve, 1500))
    setExchangeRate({
      from: 'CNY',
      to: 'USDC',
      rate: 0.141,
      amount: 1000,
      converted: 141,
      fee: 2.5,
      expiresIn: 300, // 5分钟
    })
    
    // 自动进入路由选择
    setTimeout(() => {
      setPaymentStep('route')
    }, 1000)
  }

  const handleRouteSelection = async () => {
    setPaymentStep('route')
    
    // 模拟智能路由
    await new Promise(resolve => setTimeout(resolve, 1500))
    setRoutingInfo({
      recommended: 'stripe_to_usdc',
      options: [
        {
          id: 'stripe_to_usdc',
          name: 'Stripe → USDC',
          cost: 2.5,
          speed: 9,
          description: '法币支付后自动兑换为USDC',
        },
        {
          id: 'direct_crypto',
          name: '直接加密货币',
          cost: 1.0,
          speed: 7,
          description: '使用钱包直接支付USDC',
        },
        {
          id: 'x402_batch',
          name: 'X402批量',
          cost: 0.5,
          speed: 8,
          description: '批量处理，Gas费用更低',
        },
      ],
      reason: '推荐使用Stripe → USDC，手续费最低且速度最快',
    })
    
    // 自动进入支付
    setTimeout(() => {
      setPaymentStep('payment')
    }, 1000)
  }

  const handlePayment = () => {
    if (paymentRequest) {
      startPayment({
        ...paymentRequest,
        amount: `$${exchangeRate?.converted || 141}`,
        currency: 'USDC',
        metadata: {
          ...paymentRequest.metadata,
          exchangeRate: exchangeRate,
          routing: routingInfo,
          kycVerified: kycStatus === 'verified',
        }
      })
    }
  }

  return (
    <>
      <Head>
        <title>跨境支付演示 - Agentrix</title>
      </Head>
      <div className="min-h-screen bg-gradient-to-br from-indigo-50 to-blue-50 py-8">
        <div className="max-w-3xl mx-auto px-4">
          <div className="text-center mb-8">
            <div className="text-5xl mb-4">🌍</div>
            <h1 className="text-3xl font-bold text-gray-900 mb-2">跨境支付</h1>
            <p className="text-gray-600">法币兑换数字货币 · 智能路由 · KYC认证</p>
          </div>

          {/* 流程步骤指示器 */}
          <div className="bg-white rounded-2xl shadow-lg border border-gray-200 p-6 mb-6">
            <div className="flex items-center justify-between mb-6">
              {[
                { id: 'kyc', label: 'KYC认证', icon: '✅' },
                { id: 'convert', label: '汇率兑换', icon: '💱' },
                { id: 'route', label: '智能路由', icon: '🧭' },
                { id: 'payment', label: '完成支付', icon: '💳' },
              ].map((step, idx) => {
                const stepIndex = ['kyc', 'convert', 'route', 'payment'].indexOf(paymentStep)
                const isActive = idx <= stepIndex
                const isCurrent = paymentStep === step.id
                
                return (
                  <div key={step.id} className="flex items-center flex-1">
                    <div className="flex flex-col items-center flex-1">
                      <div className={`w-12 h-12 rounded-full flex items-center justify-center text-xl ${
                        isActive ? 'bg-blue-500 text-white' : 'bg-gray-200 text-gray-400'
                      } ${isCurrent ? 'ring-4 ring-blue-200' : ''}`}>
                        {step.icon}
                      </div>
                      <span className={`text-xs mt-2 ${isActive ? 'text-blue-600 font-semibold' : 'text-gray-400'}`}>
                        {step.label}
                      </span>
                    </div>
                    {idx < 3 && (
                      <div className={`flex-1 h-1 mx-2 ${isActive ? 'bg-blue-500' : 'bg-gray-200'}`}></div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>

          {/* KYC步骤 */}
          {paymentStep === 'kyc' && (
            <div className="bg-white rounded-2xl shadow-lg border border-gray-200 p-6 mb-6">
              <h2 className="text-xl font-bold text-gray-900 mb-4">KYC认证</h2>
              <div className="space-y-4">
                {kycStatus === 'none' && (
                  <>
                    <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                      <p className="text-sm text-yellow-700 mb-4">
                        ⚠️ 跨境支付需要完成KYC认证以确保合规
                      </p>
                      <div className="space-y-2 text-sm text-yellow-800">
                        <div className="flex items-center space-x-2">
                          <span>✓</span>
                          <span>身份验证（身份证/护照）</span>
                        </div>
                        <div className="flex items-center space-x-2">
                          <span>✓</span>
                          <span>地址验证</span>
                        </div>
                        <div className="flex items-center space-x-2">
                          <span>✓</span>
                          <span>一次认证，所有Provider可用</span>
                        </div>
                      </div>
                    </div>
                    <button
                      onClick={handleKYC}
                      className="w-full bg-yellow-600 text-white py-3 rounded-lg font-semibold hover:bg-yellow-700 transition-colors"
                    >
                      开始KYC认证
                    </button>
                  </>
                )}
                {kycStatus === 'pending' && (
                  <div className="text-center py-8">
                    <div className="w-16 h-16 border-4 border-yellow-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
                    <p className="text-gray-700">正在验证身份信息...</p>
                  </div>
                )}
                {kycStatus === 'verified' && (
                  <div className="bg-green-50 border border-green-200 rounded-lg p-4 text-center">
                    <div className="text-4xl mb-2">✅</div>
                    <h3 className="font-semibold text-green-900 mb-2">KYC认证成功</h3>
                    <p className="text-sm text-green-700">您的身份已验证，可以继续支付流程</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* 汇率兑换步骤 */}
          {paymentStep === 'convert' && (
            <div className="bg-white rounded-2xl shadow-lg border border-gray-200 p-6 mb-6">
              <h2 className="text-xl font-bold text-gray-900 mb-4">汇率兑换</h2>
              {!exchangeRate ? (
                <div className="text-center py-8">
                  <div className="w-16 h-16 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
                  <p className="text-gray-700">正在获取实时汇率...</p>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-gray-600">支付金额</span>
                      <span className="text-2xl font-bold text-gray-900">{paymentRequest?.amount}</span>
                    </div>
                    <div className="flex items-center justify-center space-x-4 my-4">
                      <div className="text-center">
                        <div className="text-sm text-gray-600">从</div>
                        <div className="text-xl font-semibold text-gray-900">{exchangeRate.from}</div>
                      </div>
                      <div className="text-2xl">→</div>
                      <div className="text-center">
                        <div className="text-sm text-gray-600">到</div>
                        <div className="text-xl font-semibold text-gray-900">{exchangeRate.to}</div>
                      </div>
                    </div>
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span className="text-gray-600">汇率</span>
                        <span className="font-semibold text-gray-900">1 {exchangeRate.from} = {exchangeRate.rate} {exchangeRate.to}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600">兑换金额</span>
                        <span className="font-semibold text-gray-900">{exchangeRate.converted} {exchangeRate.to}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600">手续费</span>
                        <span className="text-gray-900">¥{exchangeRate.fee}</span>
                      </div>
                      <div className="flex justify-between pt-2 border-t border-blue-200">
                        <span className="font-semibold text-gray-900">总计</span>
                        <span className="text-xl font-bold text-gray-900">{exchangeRate.converted} {exchangeRate.to}</span>
                      </div>
                    </div>
                    <div className="mt-3 bg-green-50 border border-green-200 rounded p-2">
                      <p className="text-xs text-green-700">
                        🔒 汇率已锁定，有效期 {exchangeRate.expiresIn} 秒
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={handleRouteSelection}
                    className="w-full bg-blue-600 text-white py-3 rounded-lg font-semibold hover:bg-blue-700 transition-colors"
                  >
                    确认汇率，继续支付
                  </button>
                </div>
              )}
            </div>
          )}

          {/* 智能路由步骤 */}
          {paymentStep === 'route' && (
            <div className="bg-white rounded-2xl shadow-lg border border-gray-200 p-6 mb-6">
              <h2 className="text-xl font-bold text-gray-900 mb-4">智能路由选择</h2>
              {!routingInfo ? (
                <div className="text-center py-8">
                  <div className="w-16 h-16 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
                  <p className="text-gray-700">正在分析最优支付路径...</p>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                    <div className="flex items-start space-x-3">
                      <span className="text-green-600">💡</span>
                      <div className="flex-1">
                        <h3 className="font-semibold text-green-900 mb-1">智能推荐</h3>
                        <p className="text-sm text-green-700">{routingInfo.reason}</p>
                      </div>
                    </div>
                  </div>
                  
                  <div className="space-y-3">
                    {routingInfo.options.map((option: any) => (
                      <div
                        key={option.id}
                        className={`p-4 border-2 rounded-lg ${
                          option.id === routingInfo.recommended
                            ? 'border-blue-500 bg-blue-50'
                            : 'border-gray-200 hover:border-gray-300'
                        }`}
                      >
                        <div className="flex items-center justify-between mb-2">
                          <span className="font-semibold text-gray-900">{option.name}</span>
                          {option.id === routingInfo.recommended && (
                            <span className="bg-green-100 text-green-800 text-xs px-2 py-1 rounded">推荐</span>
                          )}
                        </div>
                        <p className="text-sm text-gray-600 mb-2">{option.description}</p>
                        <div className="flex items-center space-x-4 text-xs text-gray-500">
                          <span>手续费: ¥{option.cost}</span>
                          <span>速度: {option.speed}/10</span>
                        </div>
                      </div>
                    ))}
                  </div>
                  
                  <button
                    onClick={() => setPaymentStep('payment')}
                    className="w-full bg-blue-600 text-white py-3 rounded-lg font-semibold hover:bg-blue-700 transition-colors"
                  >
                    使用推荐路由支付
                  </button>
                </div>
              )}
            </div>
          )}

          {/* 支付步骤 */}
          {paymentStep === 'payment' && (
            <div className="bg-white rounded-2xl shadow-lg border border-gray-200 p-6 mb-6">
              <h2 className="text-xl font-bold text-gray-900 mb-4">完成支付</h2>
              <div className="space-y-4">
                <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                  <h3 className="font-semibold text-gray-900 mb-3">支付摘要</h3>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-gray-600">原始金额</span>
                      <span className="text-gray-900">{paymentRequest?.amount}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">兑换金额</span>
                      <span className="text-gray-900">{exchangeRate?.converted} {exchangeRate?.to}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">手续费</span>
                      <span className="text-gray-900">¥{exchangeRate?.fee}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">支付路由</span>
                      <span className="text-gray-900">{routingInfo?.recommended}</span>
                    </div>
                    <div className="flex justify-between pt-2 border-t border-gray-200">
                      <span className="font-semibold text-gray-900">总计</span>
                      <span className="text-xl font-bold text-gray-900">{exchangeRate?.converted} {exchangeRate?.to}</span>
                    </div>
                  </div>
                </div>
                
                <button
                  onClick={handlePayment}
                  className="w-full bg-indigo-600 text-white py-4 rounded-lg font-semibold text-lg hover:bg-indigo-700 transition-colors"
                >
                  💳 确认支付
                </button>
              </div>
            </div>
          )}

          {/* 支付成功 */}
          {paymentStep === 'success' && (
            <div className="bg-white rounded-2xl shadow-lg border border-gray-200 p-6 mb-6 text-center">
              <div className="text-6xl mb-4">✅</div>
              <h2 className="text-2xl font-bold text-gray-900 mb-2">支付成功！</h2>
              <p className="text-gray-600 mb-6">
                跨境支付已完成，资金已到达收款方
              </p>
              <div className="bg-green-50 border border-green-200 rounded-lg p-4 text-left">
                <h3 className="font-semibold text-green-900 mb-2">支付详情</h3>
                <div className="space-y-1 text-sm text-green-700">
                  <div className="flex justify-between">
                    <span>支付金额:</span>
                    <span className="font-semibold">{exchangeRate?.converted} {exchangeRate?.to}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>支付路由:</span>
                    <span>{routingInfo?.recommended}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>KYC状态:</span>
                    <span>✅ 已认证</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* 跨境支付优势 */}
          <div className="bg-white rounded-2xl shadow-lg border border-gray-200 p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">跨境支付优势</h3>
            <div className="grid md:grid-cols-3 gap-4">
              <div className="text-center">
                <div className="text-3xl mb-2">💱</div>
                <div className="font-semibold text-gray-900">汇率锁定</div>
                <div className="text-sm text-gray-600">5分钟有效期保护</div>
              </div>
              <div className="text-center">
                <div className="text-3xl mb-2">🧭</div>
                <div className="font-semibold text-gray-900">智能路由</div>
                <div className="text-sm text-gray-600">自动选择最优路径</div>
              </div>
              <div className="text-center">
                <div className="text-3xl mb-2">✅</div>
                <div className="font-semibold text-gray-900">统一KYC</div>
                <div className="text-sm text-gray-600">一次认证，全平台可用</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
