import Head from 'next/head'
import { useState } from 'react'
import { Navigation } from '../../components/ui/Navigation'
import { Footer } from '../../components/layout/Footer'
import { useLocalization } from '../../contexts/LocalizationContext'
import { useRouter } from 'next/router'

type AgentType = 'personal' | 'merchant' | 'developer'
type Step = 'template' | 'configure' | 'deploy' | 'run'

export default function AgentBuilderDemoPage() {
  const [selectedType, setSelectedType] = useState<AgentType>('personal')
  const [currentStep, setCurrentStep] = useState<Step>('template')
  const { t } = useLocalization()
  const router = useRouter()

  const agentTypes = [
    {
      key: 'personal' as AgentType,
      title: { zh: '个人Agent', en: 'Personal Agent' },
      description: { zh: '用于个人消费、Auto-Earn、资产管理', en: 'For personal consumption, Auto-Earn, asset management' },
      icon: '👤',
      features: [
        { zh: '一键生成专属Agent', en: 'One-click generate personal Agent' },
        { zh: '绑定钱包/法币账户', en: 'Bind wallet/fiat account' },
        { zh: '分享获取终身0.5%分成', en: 'Share to get 0.5% lifetime commission' },
        { zh: 'Auto-Earn自动执行', en: 'Auto-Earn automatic execution' },
      ],
    },
    {
      key: 'merchant' as AgentType,
      title: { zh: '商户Agent', en: 'Merchant Agent' },
      description: { zh: '用于商品管理、订单处理、数据分析', en: 'For product management, order processing, data analysis' },
      icon: '🏪',
      features: [
        { zh: '商品自动上架到Marketplace', en: 'Products auto-listed to Marketplace' },
        { zh: '统一收款和结算', en: 'Unified payment and settlement' },
        { zh: 'AI Agent自动推荐商品', en: 'AI Agent auto-recommends products' },
        { zh: '实时数据分析和报表', en: 'Real-time data analysis and reports' },
      ],
    },
    {
      key: 'developer' as AgentType,
      title: { zh: '开发者Agent', en: 'Developer Agent' },
      description: { zh: '用于API集成、代码生成、测试部署', en: 'For API integration, code generation, test deployment' },
      icon: '💻',
      features: [
        { zh: 'SDK和API快速接入', en: 'SDK and API quick integration' },
        { zh: '代码自动生成', en: 'Automatic code generation' },
        { zh: '沙箱环境测试', en: 'Sandbox environment testing' },
        { zh: 'API调用统计和监控', en: 'API call statistics and monitoring' },
      ],
    },
  ]

  const steps = [
    {
      key: 'template' as Step,
      title: { zh: '1. 选择模板', en: '1. Choose Template' },
      description: { zh: '从模板库中选择适合的Agent模板', en: 'Select suitable Agent template from library' },
    },
    {
      key: 'configure' as Step,
      title: { zh: '2. 配置能力', en: '2. Configure Capabilities' },
      description: { zh: '配置支付、Auto-Earn、联盟等功能', en: 'Configure payment, Auto-Earn, alliance features' },
    },
    {
      key: 'deploy' as Step,
      title: { zh: '3. 部署上线', en: '3. Deploy' },
      description: { zh: '一键部署到生产环境或本地运行', en: 'One-click deploy to production or run locally' },
    },
    {
      key: 'run' as Step,
      title: { zh: '4. 独立运行', en: '4. Run Independently' },
      description: { zh: 'Agent可在终端独立运行，无需登录官网', en: 'Agent can run independently in terminal, no need to login to website' },
    },
  ]

  const codeExamples = {
    personal: `# 个人Agent运行示例
import { AgentrixAgent } from '@agentrix/agent-sdk'

const agent = new AgentrixAgent({
  agentId: 'your-agent-id',
  apiKey: 'your-api-key'
})

# 启动Agent
agent.start()

# Agent会自动处理：
# - 商品推荐和购买
# - Auto-Earn任务执行
# - 支付和结算
# - 收益统计`,
    merchant: `# 商户Agent运行示例
import { AgentrixMerchantAgent } from '@agentrix/merchant-sdk'

const merchantAgent = new AgentrixMerchantAgent({
  merchantId: 'your-merchant-id',
  apiKey: 'your-api-key'
})

# 启动商户Agent
merchantAgent.start()

# Agent会自动处理：
# - 商品管理和上架
# - 订单处理和通知
# - 支付和结算
# - 数据分析和报表`,
    developer: `# 开发者Agent运行示例
import { AgentrixDeveloperAgent } from '@agentrix/developer-sdk'

const devAgent = new AgentrixDeveloperAgent({
  developerId: 'your-developer-id',
  apiKey: 'your-api-key'
})

# 启动开发者Agent
devAgent.start()

# Agent会自动处理：
# - API调用和统计
# - 代码生成和测试
# - 部署和监控
# - 收益和结算`,
  }

  return (
    <>
      <Head>
        <title>{t({ zh: 'Agent Builder 演示 - Agentrix', en: 'Agent Builder Demo - Agentrix' })}</title>
        <meta
          name="description"
          content={t({
            zh: '演示如何使用Agent Builder快速生成个人、商户、开发者Agent，支持独立运行',
            en: 'Demonstrate how to use Agent Builder to quickly generate personal, merchant, developer Agents with independent running support',
          })}
        />
      </Head>
      <Navigation />
      <main className="bg-slate-950 text-white min-h-screen">
        {/* Hero */}
        <section className="border-b border-white/10 bg-gradient-to-br from-purple-600/90 to-blue-600/90 py-20">
          <div className="container mx-auto px-6">
            <div className="max-w-4xl mx-auto text-center space-y-6">
              <p className="text-sm uppercase tracking-wide text-purple-100">
                {t({ zh: 'Agent Builder 演示', en: 'Agent Builder Demo' })}
              </p>
              <h1 className="text-4xl md:text-5xl font-bold">
                {t({ zh: '5分钟生成，独立运行', en: '5-minute generation, independent running' })}
              </h1>
              <p className="text-lg text-purple-100 max-w-2xl mx-auto">
                {t({
                  zh: '通过Agent Builder快速生成个人、商户、开发者Agent，生成的Agent可以在终端独立运行，无需登录Agentrix官网',
                  en: 'Quickly generate personal, merchant, developer Agents through Agent Builder. Generated Agents can run independently in terminal without logging into Agentrix website',
                })}
              </p>
            </div>
          </div>
        </section>

        {/* Agent类型选择 */}
        <section className="py-16 border-b border-white/10">
          <div className="container mx-auto px-6">
            <div className="max-w-6xl mx-auto">
              <h2 className="text-3xl font-bold text-center mb-12">
                {t({ zh: '选择Agent类型', en: 'Choose Agent Type' })}
              </h2>
              <div className="grid md:grid-cols-3 gap-6">
                {agentTypes.map((type) => (
                  <button
                    key={type.key}
                    onClick={() => setSelectedType(type.key)}
                    className={`p-6 rounded-2xl border text-left transition-all ${
                      selectedType === type.key
                        ? 'border-purple-500 bg-purple-500/20'
                        : 'border-white/10 bg-white/5 hover:bg-white/10'
                    }`}
                  >
                    <div className="text-4xl mb-4">{type.icon}</div>
                    <h3 className="text-xl font-semibold mb-2">{t(type.title)}</h3>
                    <p className="text-sm text-slate-300 mb-4">{t(type.description)}</p>
                    <ul className="space-y-2 text-sm text-slate-300">
                      {type.features.map((feature, idx) => (
                        <li key={idx} className="flex items-start">
                          <span className="text-purple-400 mr-2">✓</span>
                          <span>{t(feature)}</span>
                        </li>
                      ))}
                    </ul>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* 生成步骤 */}
        <section className="py-16 border-b border-white/10">
          <div className="container mx-auto px-6">
            <div className="max-w-6xl mx-auto">
              <h2 className="text-3xl font-bold text-center mb-12">
                {t({ zh: '4步完成生成', en: '4 Steps to Generate' })}
              </h2>
              <div className="grid md:grid-cols-4 gap-6 mb-12">
                {steps.map((step, index) => (
                  <button
                    key={step.key}
                    onClick={() => setCurrentStep(step.key)}
                    className={`text-left p-6 rounded-2xl border transition-all ${
                      currentStep === step.key
                        ? 'border-blue-500 bg-blue-500/20'
                        : 'border-white/10 bg-white/5 hover:bg-white/10'
                    }`}
                  >
                    <div className="w-10 h-10 rounded-full bg-blue-600 text-white font-bold flex items-center justify-center mb-4">
                      {index + 1}
                    </div>
                    <h3 className="text-lg font-semibold mb-2">{t(step.title)}</h3>
                    <p className="text-sm text-slate-300">{t(step.description)}</p>
                  </button>
                ))}
              </div>

              {/* 步骤内容 */}
              <div className="bg-white/5 border border-white/10 rounded-2xl p-8">
                {currentStep === 'template' && (
                  <div className="space-y-6">
                    <h3 className="text-2xl font-semibold mb-4">{t({ zh: '选择模板', en: 'Choose Template' })}</h3>
                    <div className="bg-slate-900 rounded-lg p-6">
                      <p className="text-slate-300 mb-4">
                        {t({
                          zh: '从模板库中选择适合的Agent模板，包括：',
                          en: 'Select suitable Agent template from library, including:',
                        })}
                      </p>
                      <ul className="space-y-2 text-slate-300">
                        <li>• {t({ zh: '购物助手模板', en: 'Shopping Assistant Template' })}</li>
                        <li>• {t({ zh: 'Auto-Earn模板', en: 'Auto-Earn Template' })}</li>
                        <li>• {t({ zh: '商户管理模板', en: 'Merchant Management Template' })}</li>
                        <li>• {t({ zh: '开发者工具模板', en: 'Developer Tools Template' })}</li>
                      </ul>
                    </div>
                  </div>
                )}

                {currentStep === 'configure' && (
                  <div className="space-y-6">
                    <h3 className="text-2xl font-semibold mb-4">{t({ zh: '配置能力', en: 'Configure Capabilities' })}</h3>
                    <div className="grid md:grid-cols-2 gap-4">
                      <div className="bg-slate-900 rounded-lg p-4">
                        <p className="font-semibold mb-2">{t({ zh: '支付配置', en: 'Payment Config' })}</p>
                        <p className="text-sm text-slate-300">
                          {t({ zh: '选择支付方式：Stripe、Apple Pay、X402等', en: 'Select payment methods: Stripe, Apple Pay, X402, etc.' })}
                        </p>
                      </div>
                      <div className="bg-slate-900 rounded-lg p-4">
                        <p className="font-semibold mb-2">{t({ zh: 'Auto-Earn配置', en: 'Auto-Earn Config' })}</p>
                        <p className="text-sm text-slate-300">
                          {t({ zh: '配置套利、Launchpad等策略', en: 'Configure arbitrage, Launchpad strategies' })}
                        </p>
                      </div>
                      <div className="bg-slate-900 rounded-lg p-4">
                        <p className="font-semibold mb-2">{t({ zh: '联盟配置', en: 'Alliance Config' })}</p>
                        <p className="text-sm text-slate-300">
                          {t({ zh: '设置佣金比例和分享链接', en: 'Set commission rate and share link' })}
                        </p>
                      </div>
                      <div className="bg-slate-900 rounded-lg p-4">
                        <p className="font-semibold mb-2">{t({ zh: '通知配置', en: 'Notification Config' })}</p>
                        <p className="text-sm text-slate-300">
                          {t({ zh: '配置支付、订单等通知方式', en: 'Configure payment, order notification methods' })}
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                {currentStep === 'deploy' && (
                  <div className="space-y-6">
                    <h3 className="text-2xl font-semibold mb-4">{t({ zh: '部署上线', en: 'Deploy' })}</h3>
                    <div className="bg-slate-900 rounded-lg p-6">
                      <p className="text-slate-300 mb-4">
                        {t({
                          zh: '一键部署到生产环境，或下载代码在本地运行',
                          en: 'One-click deploy to production, or download code to run locally',
                        })}
                      </p>
                      <div className="bg-slate-800 rounded-lg p-4 mb-4">
                        <code className="text-green-400 text-sm">
                          {t({ zh: '# 部署到生产环境', en: '# Deploy to production' })}
                          <br />
                          npm run deploy
                        </code>
                      </div>
                      <div className="bg-slate-800 rounded-lg p-4">
                        <code className="text-green-400 text-sm">
                          {t({ zh: '# 下载代码', en: '# Download code' })}
                          <br />
                          agentrix agent download --id your-agent-id
                        </code>
                      </div>
                    </div>
                  </div>
                )}

                {currentStep === 'run' && (
                  <div className="space-y-6">
                    <h3 className="text-2xl font-semibold mb-4">{t({ zh: '独立运行', en: 'Run Independently' })}</h3>
                    <div className="bg-slate-900 rounded-lg p-6">
                      <p className="text-slate-300 mb-4">
                        {t({
                          zh: '生成的Agent可以在终端独立运行，无需登录Agentrix官网。Agent会自动连接到Agentrix服务，处理所有业务逻辑。',
                          en: 'Generated Agent can run independently in terminal without logging into Agentrix website. Agent automatically connects to Agentrix services and handles all business logic.',
                        })}
                      </p>
                      <div className="bg-slate-800 rounded-lg p-4">
                        <pre className="text-green-400 text-sm whitespace-pre-wrap">{codeExamples[selectedType]}</pre>
                      </div>
                      <div className="mt-4 bg-blue-500/20 border border-blue-500/30 rounded-lg p-4">
                        <p className="text-blue-200 text-sm">
                          {t({
                            zh: '💡 提示：Agent运行时会自动连接到Agentrix服务，所有数据实时同步，无需手动操作',
                            en: '💡 Tip: Agent automatically connects to Agentrix services when running, all data syncs in real-time, no manual operation needed',
                          })}
                        </p>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="py-20 border-b border-white/10">
          <div className="container mx-auto px-6 text-center">
            <h2 className="text-3xl font-bold mb-4">{t({ zh: '准备生成你的Agent？', en: 'Ready to generate your Agent?' })}</h2>
            <p className="text-lg text-slate-300 mb-8 max-w-2xl mx-auto">
              {t({
                zh: '立即使用Agent Builder，5分钟生成你的专属Agent',
                en: 'Use Agent Builder now, generate your personal Agent in 5 minutes',
              })}
            </p>
            <div className="flex flex-wrap justify-center gap-4">
              <button
                onClick={() => router.push('/agent-builder')}
                className="bg-white text-slate-900 font-semibold px-8 py-3 rounded-xl hover:bg-slate-100 transition-colors"
              >
                {t({ zh: '开始生成', en: 'Start Building' })}
              </button>
              <button
                onClick={() => router.push('/auth/login')}
                className="border border-white/30 text-white font-semibold px-8 py-3 rounded-xl hover:bg-white/10 transition-colors"
              >
                {t({ zh: '登录/注册', en: 'Login/Register' })}
              </button>
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </>
  )
}

