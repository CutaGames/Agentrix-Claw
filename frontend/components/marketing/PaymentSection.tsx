import { useRouter } from 'next/router'

export function PaymentSection() {
  const router = useRouter()

  const paymentMethods = [
    {
      icon: '⚡',
      title: 'QuickPay',
      description: '小额自动支付，无需确认'
    },
    {
      icon: '💳',
      title: '法币支付',
      description: '支持 Stripe、Apple Pay、Google Pay'
    },
    {
      icon: '₿',
      title: '数字货币',
      description: '支持 USDC、USDT 多链支付'
    },
    {
      icon: '🔐',
      title: '智能路由',
      description: '自动选择最优支付方式'
    }
  ]

  return (
    <section className="bg-gray-50 py-20">
      <div className="container mx-auto px-6">
        <div className="text-center mb-16">
          <h2 className="text-4xl md:text-5xl font-bold text-gray-900 mb-4">
            统一支付流程
          </h2>
          <p className="text-xl text-gray-600 max-w-2xl mx-auto">
            支持法币、数字货币、混合支付<br/>
            智能路由自动选择最优支付方式
          </p>
        </div>

        {/* 支付方式卡片 */}
        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6 mb-12">
          {paymentMethods.map((method, index) => (
            <div
              key={index}
              className="bg-white p-6 rounded-xl shadow-md border border-gray-200 hover:shadow-lg transition-all transform hover:-translate-y-1 text-center"
            >
              <div className="text-5xl mb-4">{method.icon}</div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">
                {method.title}
              </h3>
              <p className="text-sm text-gray-600">
                {method.description}
              </p>
            </div>
          ))}
        </div>

        {/* 智能路由说明 */}
        <div className="bg-white rounded-2xl p-8 border border-gray-200 max-w-3xl mx-auto mb-8">
          <h3 className="text-xl font-semibold text-gray-900 mb-4 text-center">
            智能路由
          </h3>
          <p className="text-gray-600 text-center mb-4">
            自动选择最优支付方式<br/>
            基于成本、成功率、手续费
          </p>
          <div className="flex justify-center items-center space-x-4 text-sm text-gray-500">
            <div className="flex items-center">
              <span className="w-2 h-2 bg-blue-500 rounded-full mr-2"></span>
              成本最低
            </div>
            <div className="flex items-center">
              <span className="w-2 h-2 bg-green-500 rounded-full mr-2"></span>
              成功率最高
            </div>
            <div className="flex items-center">
              <span className="w-2 h-2 bg-purple-500 rounded-full mr-2"></span>
              手续费最优
            </div>
          </div>
        </div>

      </div>
    </section>
  )
}

