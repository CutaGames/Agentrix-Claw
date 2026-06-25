const assetTypes = [
  { icon: '🪙', title: 'Token Directory', detail: 'Solana / Ethereum / BSC / Polygon / Sui / TON', highlight: 'Token List → 即刻交易' },
  { icon: '⚖️', title: 'DEX 交易对', detail: 'Jupiter · Raydium · Uniswap · 1inch · OpenOcean', highlight: '市价 / 限价 / 定投 / 反向网格' },
  { icon: '🖼️', title: 'NFT Trending', detail: 'Magic Eden · OpenSea · Tensor', highlight: '一键买入 / 出价 / 扫地 / 挂单' },
  { icon: '🏦', title: '链上 RWA', detail: 'USYC · ONDO · MANTRA · Maple · Credix', highlight: '展示收益 / 自动分红监控' },
  { icon: '🚀', title: 'Launchpad / Presale', detail: 'Pump.fun · Raydium AcceleRaytor · TON Presale', highlight: '自动提醒 / 抢购 / 止盈 / 跟单' },
]

const stageTimeline = [
  {
    title: 'Stage 1 · 极速聚合',
    description: '无需等待商户入驻，直接聚合链上资产，一天内让 Marketplace 拥有上万可交易资产。',
    items: ['Tokenlist 自动入库', 'DEX 交易对 → 商品', 'NFT / RWA / Launchpad 即刻可买'],
    status: '进行中',
  },
  {
    title: 'Stage 2 · 半自动入驻',
    description: '开放上架入口 + Referral SDK + Agent 自助上架，让项目方与社区一起扩充资产池。',
    items: ['项目方上传 & 配置返佣', 'Referral SDK 嵌入白皮书/推文', 'Agent “谁上架谁分成”'],
    status: '计划中',
  },
  {
    title: 'Stage 3 · AI 自动扩张',
    description: 'AI 自动扫描 trending 资产、生成介绍与风险评级、自动决定上/下架，资产池持续领先。',
    items: ['AI 监控热度 & 指标', '自动生成描述/风险/策略', '全自动上架/下架/排序'],
    status: '规划',
  },
]

const automationHighlights = [
  '自动聚合数据源（Token / DEX / NFT / RWA / Launchpad）',
  '自动归一化、打标签、展示价格/流动性/波动',
  'Agent 可直接发起 swap / 限价 / 定投 / 扫地 / 抢购',
  '开放上架入口 + 返佣配置，激励项目方与 Agent 共建',
  'AI 生成资产介绍、风险评级、策略建议',
]

import { AssetDiscovery } from '../marketplace/AssetDiscovery'

export function MarketplaceSection() {
  return (
    <section className="bg-gradient-to-b from-gray-900 via-indigo-900 to-black text-white py-20">
      <div className="container mx-auto px-6">
        <div className="text-center mb-16">
          <p className="inline-flex items-center px-4 py-1 rounded-full bg-white/10 border border-white/20 text-sm tracking-wide mb-4">
            🌐 AI 聚合资产 · 无需等待商户
          </p>
          <h2 className="text-4xl md:text-5xl font-bold mb-4">
            Marketplace 即刻拥有可交易资产
          </h2>
          <p className="text-lg text-blue-100 max-w-3xl mx-auto">
            Agentrix 直接聚合链上所有 Token / 交易对 / NFT / RWA / Launchpad，同时开放上架入口与 AI 自动扩张，让你的 Agent 永远有东西可买、可卖、可执行。
          </p>
        </div>

        {/* 资产类型 */}
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 mb-16">
          {assetTypes.map((asset) => (
            <div
              key={asset.title}
              className="bg-white/5 border border-white/10 rounded-2xl p-6 hover:bg-white/10 transition-all"
            >
              <div className="text-4xl mb-4">{asset.icon}</div>
              <h3 className="text-xl font-semibold mb-2">{asset.title}</h3>
              <p className="text-sm text-blue-100 mb-3">{asset.detail}</p>
              <div className="text-sm text-white font-medium bg-white/10 inline-flex px-3 py-1 rounded-full">
                {asset.highlight}
              </div>
            </div>
          ))}
        </div>

        {/* 阶段路线 */}
        <div className="grid md:grid-cols-3 gap-6 mb-16">
          {stageTimeline.map((stage) => (
            <div key={stage.title} className="bg-white/5 border border-white/10 rounded-2xl p-6">
              <div className="flex items-center justify-between mb-3">
                <h4 className="text-lg font-semibold">{stage.title}</h4>
                <span className="text-xs px-3 py-1 rounded-full bg-indigo-500/20 border border-indigo-400/40 text-indigo-100">
                  {stage.status}
                </span>
              </div>
              <p className="text-sm text-blue-100 mb-4">{stage.description}</p>
              <ul className="space-y-2 text-sm text-gray-100">
                {stage.items.map((item) => (
                  <li key={item} className="flex items-start space-x-2">
                    <span className="text-indigo-300 mt-1">•</span>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* 自动化亮点 + 实时列表 */}
        <div className="grid lg:grid-cols-2 gap-6">
          <div className="bg-white/5 border border-white/10 rounded-2xl p-8">
            <h4 className="text-2xl font-semibold mb-4">AI 自动化亮点</h4>
            <div className="grid md:grid-cols-1 gap-4">
              {automationHighlights.map((highlight) => (
                <div key={highlight} className="flex items-start space-x-3 text-sm text-blue-100">
                  <span className="text-indigo-300 mt-1">✓</span>
                  <span>{highlight}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="bg-white rounded-2xl shadow-lg">
            <AssetDiscovery />
          </div>
        </div>
      </div>
    </section>
  )
}

