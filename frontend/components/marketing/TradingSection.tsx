export function TradingSection() {
  const capabilities = [
    {
      icon: '🔍',
      title: '智能推荐',
      description: '自动比价',
      detail: 'Agent 智能搜索和推荐商品，自动比价，推荐最优选择',
    },
    {
      icon: '💳',
      title: '自动支付',
      description: '智能路由',
      detail: 'Agent 自动选择最优支付方式，自动执行支付',
    },
    {
      icon: '📦',
      title: '订单跟踪',
      description: '自动跟踪',
      detail: '自动完成支付和订单跟踪，实时更新状态',
    },
    {
      icon: '🌐',
      title: 'AI 聚合资产',
      description: '无需商户也能交易',
      detail: '自动聚合 Token / 交易对 / NFT / RWA / Launchpad，让 Agent 即刻执行策略',
    },
  ]

  const steps = [
    'Agent 智能搜索和推荐商品或聚合资产',
    '用户确认或设置策略（市价、限价、定投）',
    'Agent 自动选择最优支付/交易路径',
    '自动完成支付、下单、结算与跟踪',
  ]

  const scenarios = [
    '实物商品交易',
    '服务类交易',
    '数字资产交易',
    '聚合资产交易（Token / NFT / RWA）',
  ]

  const stageHighlights = [
    {
      stage: '阶段 1 · 极速聚合',
      detail: '实时聚合 Token List、DEX 交易对、NFT Trending、RWA、Launchpad，一天内上万资产可交易',
      tag: '进行中',
    },
    {
      stage: '阶段 2 · 半自动入驻',
      detail: '项目方/Agent/开发者可一键提交资产，配置返佣，开放 Referral SDK，社区共建资产池',
      tag: '计划中',
    },
    {
      stage: '阶段 3 · AI 自动扩张',
      detail: 'AI 自动扫描热门资产、生成介绍与风险评级、自动决定上/下架，资产池持续领先',
      tag: '规划',
    },
  ]

  return (
    <section className="bg-white py-20">
      <div className="container mx-auto px-6">
        <div className="text-center mb-16">
          <h2 className="text-4xl md:text-5xl font-bold text-gray-900 mb-4">
            智能交易执行
          </h2>
          <p className="text-xl text-gray-600 max-w-3xl mx-auto">
            Agent 自动完成从推荐到交易的全流程，并通过 AI 聚合资产随时获得最新的交易机会
          </p>
        </div>

        {/* 核心能力卡片 */}
        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6 mb-16">
          {capabilities.map((capability, index) => (
            <div
              key={index}
              className="bg-gradient-to-br from-white to-gray-50 p-8 rounded-xl shadow-md border border-gray-200 hover:shadow-lg transition-all transform hover:-translate-y-1 text-center"
            >
              <div className="text-5xl mb-4">{capability.icon}</div>
              <h3 className="text-xl font-semibold text-gray-900 mb-2">
                {capability.title}
              </h3>
              <p className="text-sm text-blue-600 font-medium mb-3">
                {capability.description}
              </p>
              <p className="text-sm text-gray-600">
                {capability.detail}
              </p>
            </div>
          ))}
        </div>

        {/* 交易流程 */}
        <div className="bg-gray-50 rounded-2xl p-8 mb-12 max-w-5xl mx-auto">
          <h3 className="text-2xl font-semibold text-gray-900 mb-6 text-center">
            交易流程
          </h3>
          <div className="grid md:grid-cols-4 gap-4">
            {steps.map((step, index) => (
              <div key={index} className="text-center">
                <div className="w-12 h-12 bg-blue-600 text-white rounded-full flex items-center justify-center font-bold text-lg mx-auto mb-3">
                  {index + 1}
                </div>
                <p className="text-sm text-gray-700">{step}</p>
              </div>
            ))}
          </div>
        </div>

        {/* 支持场景 */}
        <div className="max-w-4xl mx-auto mb-12">
          <h3 className="text-xl font-semibold text-gray-900 mb-4 text-center">
            支持场景
          </h3>
          <div className="flex flex-wrap justify-center gap-4">
            {scenarios.map((scenario, index) => (
              <div
                key={index}
                className="px-6 py-3 bg-gray-100 rounded-lg text-gray-700 font-medium"
              >
                {scenario}
              </div>
            ))}
          </div>
        </div>

        {/* 阶段化能力 */}
        <div className="grid md:grid-cols-3 gap-6">
          {stageHighlights.map((stage, index) => (
            <div
              key={stage.stage}
              className="border border-gray-200 rounded-2xl p-6 bg-white shadow-sm hover:shadow-md transition-all"
            >
              <div className="flex items-center justify-between mb-4">
                <h4 className="text-lg font-semibold text-gray-900">{stage.stage}</h4>
                <span className="text-xs px-3 py-1 rounded-full bg-blue-100 text-blue-700">
                  {stage.tag}
                </span>
              </div>
              <p className="text-sm text-gray-600 leading-relaxed">{stage.detail}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
