import { useRouter } from 'next/router'
import { MarketingLayout } from '../components/marketing/MarketingLayout'
import { buildSeo } from '../lib/seo'
import { useLocalization } from '../contexts/LocalizationContext'

const viewSteps = [
  { title: '01 · 对话捕捉', desc: 'Agent 监听用户意图，自动拉取商品、支付上下文与历史行为。' },
  { title: '02 · 智能建议', desc: '多通道报价、库存、交付方式一屏展示，可一键生成卡片。' },
  { title: '03 · 统一支付', desc: 'QuickPay、法币、链上、托管等模式自适应，展示价格、税费、通道成本。' },
  { title: '04 · 联盟与收益', desc: '实时分佣、Session Trace、推荐 Agent 分润全部沉浸式呈现。' },
]

const quickStats = [
  { label: '平均响应', value: '420 ms' },
  { label: '支付成功率', value: '99.3 %' },
  { label: '智能路由节省', value: '-32 % 成本' },
  { label: 'Agent 覆盖', value: '180+ 模板' },
]

const panels = [
  {
    title: '多视角工作台',
    bullets: ['左栏：能力与策略入口', '中央：对话 + 交易编排', '右栏：数据、收益、告警'],
  },
  {
    title: '商户后台即 Agent',
    bullets: ['商品 / 定价 / 税费 / 自动化直接配置', '一键生成支付、API、Webhook', '支持多角色协作'],
  },
  {
    title: '混合资产探索',
    bullets: ['Token / NFT / Launchpad / RWA 全部统一展示', '聚合 OpenSea、Magic Eden、DEX、法币渠道'],
  },
]

export default function AgentExperience() {
  const router = useRouter()
  const { t } = useLocalization()
  const seo = buildSeo({
    title: t({ zh: 'Agent 体验', en: 'Agent Experience' }),
    description: t({
      zh: 'Agentrix Agent 页面展示：对话、支付、资产、联盟在一个操作台完成。',
      en: 'Agentrix Agent showcase: chat, payment, assets, affiliate — all in one workspace.',
    }),
    path: '/agent-experience',
  })

  return (
    <MarketingLayout seo={seo}>
      <div className="min-h-screen bg-slate-950 text-white">
        <section className="border-b border-white/10 relative overflow-hidden">
          <div className="container mx-auto px-6 py-16 md:py-24 grid lg:grid-cols-2 gap-10 items-center">
            <div className="space-y-6">
              <p className="text-xs tracking-[0.4em] uppercase text-cyan-300">Agent Experience</p>
              <h1 className="text-4xl md:text-5xl font-bold">把商户后台、支付中枢、自动化面板全部塞进 Agent。</h1>
              <p className="text-slate-200">
                用户看到的是对话体验，商户与开发者看到的是可视化工作台。Agentrix Agent 同时具备 AI 能力、支付编排、智能路由、
                联盟分佣、Auto-Earn 策略、SDK 生成等模块。
              </p>
              <div className="flex flex-wrap gap-4">
                <button
                  onClick={() => router.push('/agent-enhanced')}
                  className="bg-white text-slate-900 font-semibold px-6 py-3 rounded-xl shadow-lg hover:-translate-y-0.5 transition"
                >
                  打开在线 Demo
                </button>
                <button
                  onClick={() => router.push('/agent-builder')}
                  className="border border-white/30 px-6 py-3 rounded-xl font-semibold hover:bg-white/10 transition"
                >
                  生成我的 Agent
                </button>
              </div>
            </div>
            <div className="bg-white/5 border border-white/15 rounded-3xl p-6 space-y-6">
              <div className="flex items-center justify-between text-sm text-slate-300">
                <span>当前 Session</span>
                <span>SESSION-7FA2-QL</span>
              </div>
              <div className="grid md:grid-cols-2 gap-4">
                {quickStats.map((stat) => (
                  <div key={stat.label} className="bg-slate-900/60 border border-white/5 rounded-2xl p-4">
                    <p className="text-xs uppercase tracking-[0.3em] text-slate-500">{stat.label}</p>
                    <p className="text-2xl font-semibold text-white">{stat.value}</p>
                  </div>
                ))}
              </div>
              <div className="space-y-3 text-sm text-slate-300">
                <div className="flex justify-between">
                  <span>默认支付模式</span>
                  <span className="text-cyan-300">Smart Routing · QuickPay 优先</span>
                </div>
                <div className="flex justify-between">
                  <span>Agent 角色</span>
                  <span>商户控制台 + Auto-Earn + 联盟推广</span>
                </div>
                <div className="flex justify-between">
                  <span>最后操作</span>
                  <span>已为用户生成多链支付链接 · 12 秒前</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="border-b border-white/5 bg-slate-900">
          <div className="container mx-auto px-6 py-16 space-y-8">
            <div className="text-center space-y-4">
              <p className="text-xs uppercase tracking-[0.4em] text-indigo-300">Workspace Layout</p>
              <h2 className="text-3xl md:text-4xl font-bold">三栏式工作台，一屏看清 Agent 在做什么。</h2>
              <p className="text-slate-300 max-w-3xl mx-auto">
                左侧能力面板、中间对话与操作区、右侧洞察面板。支持扩展 Auto-Earn、Marketplace、联盟、开发者模式以及多账号协同。
              </p>
            </div>
            <div className="grid lg:grid-cols-3 gap-6">
              <div className="bg-white/5 rounded-3xl border border-white/10 p-5 space-y-3">
                <p className="text-xs uppercase tracking-[0.3em] text-slate-400">左栏 · 能力面板</p>
                <ul className="space-y-2 text-sm text-slate-200">
                  <li>🔍 商品搜索 / 资产聚合 / Auto-Earn 策略入口</li>
                  <li>⚙️ 商户自动化、Agent Builder、Mock 流程</li>
                  <li>🧭 QuickPay、KYC、托管、Webhook、脚本</li>
                </ul>
              </div>
              <div className="bg-white/5 rounded-3xl border border-white/10 p-5 space-y-3">
                <p className="text-xs uppercase tracking-[0.3em] text-slate-400">中心 · 对话 & 编排</p>
                <ul className="space-y-2 text-sm text-slate-200">
                  <li>🧠 Conversation + 结构化卡片 + 可拖拽意图</li>
                  <li>💳 支付编辑区：路由、价格、税费、通道费用</li>
                  <li>📦 订单、库存、物流、联盟、Auto-Earn 同步反馈</li>
                </ul>
              </div>
              <div className="bg-white/5 rounded-3xl border border-white/10 p-5 space-y-3">
                <p className="text-xs uppercase tracking-[0.3em] text-slate-400">右栏 · 洞察面板</p>
                <ul className="space-y-2 text-sm text-slate-200">
                  <li>📈 实时 KPI、SLA、Session Trace、警报</li>
                  <li>🤝 推广 Agent、收益拆分</li>
                  <li>🧾 税务、合规、风控、托管解锁倒计时</li>
                </ul>
              </div>
            </div>
          </div>
        </section>

        <section className="border-b border-white/5 bg-slate-950">
          <div className="container mx-auto px-6 py-16 grid lg:grid-cols-2 gap-10">
            <div className="space-y-5">
              <p className="text-xs uppercase tracking-[0.4em] text-cyan-300">Workflow</p>
              <h2 className="text-3xl font-bold">一条对话，完成从推荐到收款的闭环。</h2>
              <div className="space-y-5">
                {viewSteps.map((step) => (
                  <div key={step.title} className="bg-white/5 border border-white/10 rounded-2xl p-4">
                    <p className="text-sm text-slate-400 uppercase tracking-[0.3em]">{step.title}</p>
                    <p className="text-slate-100">{step.desc}</p>
                  </div>
                ))}
              </div>
            </div>
            <div className="bg-white/5 border border-white/10 rounded-3xl p-6 space-y-4">
              <p className="text-sm uppercase tracking-[0.3em] text-slate-400">实时画面</p>
              <div className="bg-slate-950/70 rounded-2xl p-4 space-y-3 text-sm text-slate-200">
                <div>
                  <p className="text-xs uppercase text-slate-500 mb-1">用户 · 对话</p>
                  <div className="bg-white/5 rounded-xl p-3">
                    你好，帮我比较下 3 款带 NFC 的 AI 手环，并且直接给我最省手续费的支付方案。
                  </div>
                </div>
                <div>
                  <p className="text-xs uppercase text-slate-500 mb-1">Agent · 回答</p>
                  <div className="bg-cyan-500/10 border border-cyan-500/30 rounded-xl p-3 space-y-2">
                    <p>推荐列表已生成，已触发智能路由：Stripe Express vs QuickPay vs TON Wallet。</p>
                    <p className="text-xs text-cyan-200">
                      Session: SR-98422 ｜ 推荐 Agent: arthur.pm ｜ 快捷授权：未开启（提示 KYC）
                    </p>
                  </div>
                </div>
                <div>
                  <p className="text-xs uppercase text-slate-500 mb-1">支付面板</p>
                  <div className="grid grid-cols-2 gap-3 text-xs">
                    <div className="bg-white/5 rounded-xl p-3">
                      <p className="text-slate-400">商品价格</p>
                      <p className="text-lg font-semibold text-white">$148.00 · USD</p>
                    </div>
                    <div className="bg-white/5 rounded-xl p-3">
                      <p className="text-slate-400">税费 (CA)</p>
                      <p className="text-lg font-semibold text-white">$13.32</p>
                    </div>
                    <div className="bg-white/5 rounded-xl p-3">
                      <p className="text-slate-400">通道成本</p>
                        <p className="text-lg font-semibold text-emerald-300">-$2.14 (商户承担)</p>
                    </div>
                    <div className="bg-white/5 rounded-xl p-3">
                      <p className="text-slate-400">佣金拆分</p>
                      <p className="text-lg font-semibold text-white">执行 2.1 · 推荐 0.9 · Agentrix 0.5</p>
                    </div>
                  </div>
                </div>
              </div>
              <button
                onClick={() => router.push('/agent-enhanced')}
                className="w-full bg-white text-slate-900 font-semibold py-3 rounded-xl shadow hover:-translate-y-0.5 transition"
              >
                体验整个支付流程
              </button>
            </div>
          </div>
        </section>

        <section className="border-b border-white/5 bg-slate-900">
          <div className="container mx-auto px-6 py-16 grid lg:grid-cols-3 gap-6">
            {panels.map((panel) => (
              <div key={panel.title} className="bg-white/5 border border-white/10 rounded-3xl p-5 space-y-3">
                <h3 className="text-xl font-semibold">{panel.title}</h3>
                <ul className="text-sm text-slate-200 space-y-2">
                  {panel.bullets.map((bullet) => (
                    <li key={bullet} className="flex gap-2">
                      <span className="text-cyan-300">▹</span>
                      {bullet}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>

        <section className="border-b border-white/10 bg-gradient-to-r from-cyan-500 to-blue-600">
          <div className="container mx-auto px-6 py-20 text-center space-y-6">
            <p className="text-xs uppercase tracking-[0.4em] text-white/70">Ready</p>
            <h2 className="text-4xl font-bold">从对话到交易，从智能体到商业体。</h2>
            <p className="text-white/90 max-w-2xl mx-auto">
              注册 Agent，导入商品与资产，配置智能路由与分佣，即可开始在真实场景中闭环支付和收益。
            </p>
            <div className="flex flex-wrap gap-4 justify-center">
              <button
                onClick={() => router.push('/agent-builder')}
                className="bg-white text-cyan-600 font-semibold px-8 py-4 rounded-xl"
              >
                生成我的 Agent
              </button>
              <button
                onClick={() => router.push('/developers')}
                className="bg-white/10 border border-white/30 text-white font-semibold px-8 py-4 rounded-xl hover:bg-white/20 transition"
              >
                查看 SDK / API
              </button>
            </div>
          </div>
        </section>
      </div>
    </MarketingLayout>
  )
}

