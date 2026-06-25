import Head from 'next/head';
import { useState } from 'react';
import { useRouter } from 'next/router';
import { Navigation } from '../components/ui/Navigation';
import { Footer } from '../components/layout/Footer';
import { AgentTemplateLibrary } from '../components/agent/builder/AgentTemplateLibrary';
import { AgentGenerator } from '../components/agent/builder/AgentGenerator';
import { AgentTemplate } from '../lib/api/agent-template.api';
import { useUser } from '../contexts/UserContext';
import { useLocalization } from '../contexts/LocalizationContext';
import { ModelPicker } from '../components/ModelPicker';

export default function AgentBuilderPage() {
  const { isAuthenticated } = useUser();
  const { t } = useLocalization();
  const router = useRouter();
  const [selectedTemplate, setSelectedTemplate] = useState<AgentTemplate | null>(null);
  const [defaultModel, setDefaultModel] = useState<string>('auto');

  return (
    <>
      <Head>
        <title>{t({ zh: 'Agentrix Agent Builder - 5分钟生成你的 AI Agent', en: 'Agentrix Agent Builder - Generate Your AI Agent in 5 Minutes' })}</title>
        <meta
          name="description"
          content={t({
            zh: '使用 AI Builder，选择模板、配置能力、自动接入支付和收益分润，快速生成个人或商户 Agent。',
            en: 'Use AI Builder to select templates, configure capabilities, automatically integrate payment and revenue sharing, quickly generate personal or merchant Agents.',
          })}
        />
      </Head>
      <Navigation />
      <main className="bg-gradient-to-b from-gray-50 to-white">
        <section className="container mx-auto px-6 py-12 lg:py-16">
          <div className="bg-white rounded-3xl shadow-2xl border border-gray-100 p-8 lg:p-12 mb-10">
            <div className="grid lg:grid-cols-2 gap-8 items-center">
              <div>
                <p className="text-xs font-semibold text-blue-600 uppercase tracking-[0.3em] mb-3">
                  Agent Builder
                </p>
                <h1 className="text-4xl font-bold text-gray-900 leading-tight mb-4">
                  {t({ zh: '5 分钟生成你的专属 Agent', en: 'Generate Your Personal Agent in 5 Minutes' })}
                </h1>
                <p className="text-lg text-gray-600 mb-6">
                  {t({
                    zh: '从模板开始，自动配置支付、Auto-Earn、联盟分润与监控能力。即刻上线，加入 Agentrix 联盟生态，获取 GMV 分成。',
                    en: 'Start from templates, automatically configure payment, Auto-Earn, alliance revenue sharing and monitoring capabilities. Go live immediately, join Agentrix alliance ecosystem, get GMV share.',
                  })}
                </p>
                <div className="flex flex-wrap gap-3 text-sm text-gray-600">
                  <span className="px-3 py-1 rounded-full bg-blue-50 text-blue-700 font-medium">
                    🧠 {t({ zh: '模板库持续更新', en: 'Template Library Continuously Updated' })}
                  </span>
                  <span className="px-3 py-1 rounded-full bg-purple-50 text-purple-700 font-medium">
                    💳 {t({ zh: '支付 / QuickPay 自动接入', en: 'Payment / QuickPay Auto Integration' })}
                  </span>
                  <span className="px-3 py-1 rounded-full bg-emerald-50 text-emerald-700 font-medium">
                    💰 {t({ zh: 'Auto-Earn & 联盟收益', en: 'Auto-Earn & Alliance Revenue' })}
                  </span>
                </div>
              </div>
              <div className="bg-gray-900 text-white rounded-3xl p-6 shadow-2xl">
                <p className="text-sm text-gray-400 uppercase tracking-widest mb-4">
                  {t({ zh: '生成流程示意', en: 'Generation Process' })}
                </p>
                <div className="space-y-3 text-sm">
                  <div className="flex items-center justify-between border-b border-white/10 pb-3">
                    <span className="text-gray-300">① {t({ zh: '选择模板', en: 'Choose Template' })}</span>
                    <span className="font-semibold">{t({ zh: '购物 / Auto-Earn / Launchpad', en: 'Shopping / Auto-Earn / Launchpad' })}</span>
                  </div>
                  <div className="flex items-center justify-between border-b border-white/10 pb-3">
                    <span className="text-gray-300">② {t({ zh: '配置能力', en: 'Configure Capabilities' })}</span>
                    <span className="font-semibold">SmartPay · Auto Workflow</span>
                  </div>
                  <div className="flex items-center justify-between border-b border-white/10 pb-3">
                    <span className="text-gray-300">③ {t({ zh: '接入授权', en: 'Authorization' })}</span>
                    <span className="font-semibold">KYC · QuickPay · {t({ zh: '收益账户', en: 'Revenue Account' })}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-gray-300">④ {t({ zh: '上线推广', en: 'Launch & Promote' })}</span>
                    <span className="font-semibold">{t({ zh: '联盟分润 · API/SDK 联动', en: 'Alliance Revenue · API/SDK Integration' })}</span>
                  </div>
                </div>
                <div className="mt-5 pt-4 border-t border-white/10">
                  <p className="text-xs text-gray-400 uppercase tracking-widest mb-2">
                    {t({ zh: '默认模型 (Agent 创建后可改)', en: 'Default Model (changeable after creation)' })}
                  </p>
                  <div className="agent-builder-model-picker">
                    <ModelPicker
                      value={defaultModel}
                      onChange={(id) => {
                        setDefaultModel(id);
                        if (typeof window !== 'undefined') {
                          window.localStorage.setItem('agentrix:agent-builder:defaultModel', id);
                        }
                      }}
                      selectClassName="w-full rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-sm text-white focus:border-blue-400 focus:outline-none"
                    />
                  </div>
                  <p className="text-[11px] text-gray-500 mt-2">
                    {t({
                      zh: 'Auto = Agentrix 按任务复杂度自动分配；你也可以指定具体模型。',
                      en: 'Auto = Agentrix routes by task complexity. You can also pin a specific model.',
                    })}
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div className="grid lg:grid-cols-2 gap-8 mb-16">
            <div className="bg-white rounded-3xl shadow-xl border border-gray-100 p-6 lg:p-8">
              <h3 className="text-xl font-bold text-gray-900 mb-6">
                {t({ zh: 'Step 1 · 选择模板 / 场景', en: 'Step 1 · Choose Template / Scenario' })}
              </h3>
              <AgentTemplateLibrary
                selectedTemplateId={selectedTemplate?.id}
                onSelect={setSelectedTemplate}
              />
            </div>
            <div>
              {!isAuthenticated && (
                <div className="mb-4 p-4 rounded-2xl border border-yellow-200 bg-yellow-50 text-sm text-yellow-800 flex items-center justify-between">
                  <span>{t({ zh: '请先登录，即可保存模板并生成 Agent。', en: 'Please login to save template and generate Agent.' })}</span>
                  <button
                    onClick={() => router.push('/auth/login')}
                    className="px-3 py-1 rounded-full bg-yellow-600 text-white text-xs font-semibold"
                  >
                    {t({ zh: '登录/注册', en: 'Login/Register' })}
                  </button>
                </div>
              )}
              <AgentGenerator
                selectedTemplate={selectedTemplate}
                onTemplateReset={() => setSelectedTemplate(null)}
                isAuthenticated={isAuthenticated}
              />
            </div>
          </div>

          {/* Agent Builder 核心功能展示 */}
          <section className="mb-16">
            <div className="text-center mb-8">
              <p className="text-xs font-semibold text-blue-600 uppercase tracking-[0.3em] mb-3">
                {t({ zh: '核心功能', en: 'Core Features' })}
              </p>
              <h2 className="text-3xl font-bold text-gray-900 mb-4">
                {t({ zh: 'Agent Builder 强大功能', en: 'Agent Builder Powerful Features' })}
              </h2>
              <p className="text-lg text-gray-600 max-w-2xl mx-auto">
                {t({
                  zh: '表单式配置、规则模板、插件市场、SaaS托管，让 Agent 创建更简单、更强大。',
                  en: 'Form-based configuration, rule templates, plugin marketplace, SaaS hosting - making Agent creation simpler and more powerful.',
                })}
              </p>
            </div>
            <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
              {/* 表单式能力装配 */}
              <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-6 hover:shadow-xl transition-shadow">
                <div className="text-4xl mb-4">📋</div>
                <h3 className="text-lg font-semibold text-gray-900 mb-2">
                  {t({ zh: '表单式能力装配', en: 'Form-based Capability Assembly' })}
                </h3>
                <p className="text-sm text-gray-600 mb-4">
                  {t({
                    zh: '快速配置Agent能力，无需编写代码，降低学习成本。',
                    en: 'Quickly configure Agent capabilities without coding, reducing learning curve.',
                  })}
                </p>
                <p className="text-xs text-blue-600 font-semibold">
                  {t({ zh: '在生成流程中使用', en: 'Used in generation flow' })}
                </p>
              </div>

              {/* 规则模板系统 */}
              <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-6 hover:shadow-xl transition-shadow">
                <div className="text-4xl mb-4">⚙️</div>
                <h3 className="text-lg font-semibold text-gray-900 mb-2">
                  {t({ zh: '规则模板系统', en: 'Rule Template System' })}
                </h3>
                <p className="text-sm text-gray-600 mb-4">
                  {t({
                    zh: '自然语言定义业务规则，预设模板快速应用，规则验证和测试。',
                    en: 'Define business rules in natural language, apply preset templates quickly, validate and test rules.',
                  })}
                </p>
                <p className="text-xs text-blue-600 font-semibold">
                  {t({ zh: '在生成流程中使用', en: 'Used in generation flow' })}
                </p>
              </div>

              {/* Skill 市场 */}
              <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-6 hover:shadow-xl transition-shadow">
                <div className="text-4xl mb-4">⚡</div>
                <h3 className="text-lg font-semibold text-gray-900 mb-2">
                  {t({ zh: 'Skill 市场', en: 'Skill Market' })}
                </h3>
                <p className="text-sm text-gray-600 mb-4">
                  {t({
                    zh: '浏览和集成 Skill，扩展 Agent 能力，支持支付、数据、工具等多种类型。',
                    en: 'Browse and integrate Skills to extend Agent capabilities, supporting payment, data, tools and more.',
                  })}
                </p>
                <button
                  onClick={() => router.push('/unified-marketplace')}
                  className="text-xs text-blue-600 font-semibold hover:text-blue-700 transition-colors"
                >
                  {t({ zh: '访问 Skill 市场 →', en: 'Visit Skill Market →' })}
                </button>
              </div>

              {/* SaaS托管 */}
              <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-6 hover:shadow-xl transition-shadow">
                <div className="text-4xl mb-4">☁️</div>
                <h3 className="text-lg font-semibold text-gray-900 mb-2">
                  {t({ zh: 'SaaS托管', en: 'SaaS Hosting' })}
                </h3>
                <p className="text-sm text-gray-600 mb-4">
                  {t({
                    zh: '一键部署到云端，无需配置服务器，自动生成访问链接。',
                    en: 'One-click deploy to cloud, no server configuration needed, auto-generate access links.',
                  })}
                </p>
                <p className="text-xs text-blue-600 font-semibold">
                  {t({ zh: '在导出时使用', en: 'Used in export' })}
                </p>
              </div>
            </div>
          </section>

          {/* Skill 市场入口 */}
          <section className="mb-16">
            <div className="bg-gradient-to-r from-blue-500/10 to-purple-500/10 rounded-3xl border border-blue-500/20 p-8 lg:p-12">
              <div className="grid lg:grid-cols-2 gap-8 items-center">
                <div>
                  <div className="text-5xl mb-4">⚡</div>
                  <h3 className="text-2xl font-bold text-gray-900 mb-4">
                    {t({ zh: 'Skill 市场', en: 'Skill Market' })}
                  </h3>
                  <p className="text-lg text-gray-600 mb-6">
                    {t({
                      zh: '浏览和集成 Skill，赋能你的 Agent。支持支付、商品、数据、工具等多种类型，覆盖 L0-L4 全层级能力。',
                      en: 'Browse and integrate Skills to empower your Agent. Supporting payment, commerce, data, tools and more, covering L0-L4 full-layer capabilities.',
                    })}
                  </p>
                  <div className="flex flex-wrap gap-3 mb-6">
                    <span className="px-3 py-1 rounded-full bg-blue-500/20 text-blue-700 text-sm font-medium">
                      {t({ zh: 'L0-L4 全层级', en: 'L0-L4 Full Layer' })}
                    </span>
                    <span className="px-3 py-1 rounded-full bg-purple-500/20 text-purple-700 text-sm font-medium">
                      {t({ zh: '多平台支持', en: 'Multi-platform' })}
                    </span>
                    <span className="px-3 py-1 rounded-full bg-emerald-500/20 text-emerald-700 text-sm font-medium">
                      {t({ zh: '即插即用', en: 'Plug & Play' })}
                    </span>
                  </div>
                  <button
                    onClick={() => router.push('/unified-marketplace')}
                    className="bg-gradient-to-r from-blue-500 to-purple-500 text-white font-semibold px-8 py-4 rounded-xl hover:opacity-90 transition-all shadow-lg"
                  >
                    {t({ zh: '访问 Skill 市场', en: 'Visit Skill Market' })}
                  </button>
                </div>
                <div className="bg-white/60 rounded-2xl p-6 border border-white/20">
                  <p className="text-sm font-semibold text-gray-700 mb-4">
                    {t({ zh: 'Skill 层级介绍', en: 'Skill Layers' })}
                  </p>
                  <div className="space-y-3">
                    {[
                      { zh: 'L0 基础层 - 支付、身份、存储', en: 'L0 Foundation - Payment, Identity, Storage' },
                      { zh: 'L1 能力层 - 商品、服务、数据', en: 'L1 Capability - Commerce, Service, Data' },
                      { zh: 'L2 编排层 - 工作流、自动化', en: 'L2 Orchestration - Workflow, Automation' },
                      { zh: 'L3 智能层 - AI 推理、决策', en: 'L3 Intelligence - AI Reasoning, Decision' },
                    ].map((layer, idx) => (
                      <div key={idx} className="flex items-center gap-3 text-sm text-gray-600">
                        <span className="text-blue-500">▹</span>
                        <span>{t(layer)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </section>
        </section>
      </main>
      <Footer />
    </>
  );
}

