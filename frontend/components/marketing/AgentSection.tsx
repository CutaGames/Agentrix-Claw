import { useRouter } from 'next/router'

export function AgentSection() {
  const router = useRouter()

  const capabilities = [
    {
      icon: '🔍',
      title: '智能搜索与比价',
      description: '语义搜索商品，自动比价，智能推荐最优商品'
    },
    {
      icon: '🛍️',
      title: '自动购物助手',
      description: '自动创建订单，自动选择支付方式，自动完成支付'
    },
    {
      icon: '💳',
      title: '智能支付与路由',
      description: '自动分析支付方式，自动选择最优路由，自动执行支付'
    },
    {
      icon: '📦',
      title: '订单跟踪与管理',
      description: '自动跟踪订单状态，自动更新物流信息，自动提醒用户'
    }
  ]

  return (
    <section className="bg-white py-20">
      <div className="container mx-auto px-6">
        <div className="text-center mb-16">
          <h2 className="text-4xl md:text-5xl font-bold text-gray-900 mb-4">
            Agentrix Agent
          </h2>
          <p className="text-2xl text-gray-600 mb-2">
            AI 商业执行系统
          </p>
          <p className="text-lg text-gray-500 max-w-3xl mx-auto">
            所有功能通过 Agentrix Agent 实现<br/>
            通过对话完成搜索、推荐、支付、订单管理
          </p>
        </div>

        {/* 核心能力卡片 */}
        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6 mb-16">
          {capabilities.map((capability, index) => (
            <div
              key={index}
              className="bg-gradient-to-br from-white to-gray-50 p-6 rounded-xl shadow-md border border-gray-200 hover:shadow-lg transition-all transform hover:-translate-y-1"
            >
              <div className="text-4xl mb-4">{capability.icon}</div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">
                {capability.title}
              </h3>
              <p className="text-sm text-gray-600 leading-relaxed">
                {capability.description}
              </p>
            </div>
          ))}
        </div>

        {/* Agent 对话界面预览 */}
        <div className="bg-gradient-to-br from-gray-50 to-gray-100 rounded-2xl p-8 mb-8 border border-gray-200">
          <div className="max-w-2xl mx-auto">
            <div className="space-y-4">
              {/* 用户消息 */}
              <div className="flex justify-end">
                <div className="bg-blue-600 text-white px-6 py-3 rounded-2xl rounded-br-none max-w-md">
                  <p className="text-sm">帮我找一款1000元以内的电纸书</p>
                </div>
              </div>
              {/* Agent 消息 */}
              <div className="flex justify-start">
                <div className="bg-white text-gray-900 px-6 py-3 rounded-2xl rounded-bl-none max-w-md shadow-sm border border-gray-200">
                  <p className="text-sm">好的，我来为您搜索和比价...</p>
                </div>
              </div>
              {/* Agent 消息 - 推荐商品 */}
              <div className="flex justify-start">
                <div className="bg-white text-gray-900 px-6 py-3 rounded-2xl rounded-bl-none max-w-md shadow-sm border border-gray-200">
                  <p className="text-sm mb-2">为您找到3款符合条件的电纸书：</p>
                  <div className="space-y-2">
                    <div className="bg-gray-50 p-3 rounded-lg">
                      <p className="font-medium text-sm">Kindle Paperwhite</p>
                      <p className="text-xs text-gray-600">¥899 • 4.8分</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* CTA 按钮 */}
        <div className="text-center">
          <button
            onClick={() => router.push('/agent-enhanced')}
            className="bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white px-8 py-4 rounded-lg font-semibold text-lg transition-all transform hover:scale-105 shadow-lg hover:shadow-xl"
          >
            立即体验 Agentrix Agent
          </button>
        </div>
      </div>
    </section>
  )
}

