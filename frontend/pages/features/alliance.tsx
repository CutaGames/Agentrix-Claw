import Head from 'next/head'
import { useState } from 'react'
import { useRouter } from 'next/router'
import { Navigation } from '../../components/ui/Navigation'
import { Footer } from '../../components/layout/Footer'
import { useLocalization } from '../../contexts/LocalizationContext'

const benefits = [
  {
    title: { zh: '三角色分佣', en: 'Three-role commission' },
    detail: { zh: '执行 / 推荐 / 推广，系统自动识别并结算', en: 'Execution / referral / promotion auto settled' },
  },
  {
    title: { zh: '推广奖励', en: 'Promotion Rewards' },
    detail: { zh: '推广商户获得入驻奖励和永久分成', en: 'Promote merchants to get onboarding rewards and permanent share' },
  },
  {
    title: { zh: 'QuickPay 联动', en: 'QuickPay synergy' },
    detail: { zh: '授权后小额支付可直接走联盟白名单', en: 'QuickPay allows whitelisted micro-charges' },
  },
]

const flows = [
  {
    step: '01',
    title: { zh: '接入联盟 API', en: 'Connect API' },
    detail: { zh: '绑定 Agent、收益账户等信息', en: 'Bind agents and payout accounts' },
  },
  {
    step: '02',
    title: { zh: '任务 / 支付流入', en: 'Task inflow' },
    detail: { zh: '来自 Agentrix Agent / Marketplace / 推广 Agent', en: 'Source from agents, marketplace or promotion agents' },
  },
  {
    step: '03',
    title: { zh: '结算 & 奖励', en: 'Settlement & rewards' },
    detail: { zh: 'T+0 分佣 + 推广奖励 + 数据看板', en: 'T+0 payout with promotion rewards and dashboards' },
  },
]

export default function AllianceFeaturePage() {
  const { t } = useLocalization()
  const router = useRouter()

  return (
    <>
      <Head>
        <title>{t({ zh: '联盟机制说明 - Agentrix', en: 'Alliance feature - Agentrix' })}</title>
        <meta
          name="description"
          content=              {t({
                zh: '全面介绍 Agentrix 联盟机制：角色分工、分佣逻辑与接入方式。',
                en: 'Full overview of Agentrix alliance mechanism: roles, commission logic and onboarding.',
              })}
        />
      </Head>
      <Navigation />
      <main className="bg-slate-950 text-white">
        <section className="border-b border-white/10 bg-gradient-to-r from-slate-800/90 to-slate-700/90 py-16 text-white">
          <div className="container mx-auto px-6">
            <p className="text-sm uppercase tracking-wide text-slate-300">
              {t({ zh: 'Alliance · Agent Network', en: 'Alliance · Agent Network' })}
            </p>
            <h1 className="mt-2 text-4xl font-bold md:text-5xl">
              {t({ zh: '联盟机制说明', en: 'Alliance feature overview' })}
            </h1>
            <p className="mt-4 max-w-3xl text-lg text-slate-100">
              {t({
                zh: 'Agentrix 把执行 Agent、推荐 Agent、推广 Agent 放在同一个收益闭环里，提供标准化的 API 与结算模型。',
                en: 'Agentrix unifies execution agents, referral agents and promotion agents in one revenue loop.',
              })}
            </p>
          </div>
        </section>

        <section className="container mx-auto px-6 py-12">
          <div className="grid gap-6 lg:grid-cols-2">
            <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
              <h2 className="text-2xl font-semibold text-white">
                {t({ zh: '角色与分佣', en: 'Roles & commission' })}
              </h2>
              <ul className="mt-6 space-y-4 text-sm text-slate-300">
                <li>
                  <strong className="text-white">{t({ zh: '执行 Agent', en: 'Execution agent' })}</strong>
                  <p className="text-slate-400">
                    {t({ zh: '负责支付执行、KYC、风控，分佣 45%', en: 'Handles payments, KYC and risk · 45%' })}
                  </p>
                </li>
                <li>
                  <strong className="text-slate-900">{t({ zh: '推荐 Agent', en: 'Referral agent' })}</strong>
                  <p className="text-slate-500">
                    {t({ zh: '负责用户召回、商品推荐，分佣 35%', en: 'Handles acquisition & recommendation · 35%' })}
                  </p>
                </li>
                <li>
                  <strong className="text-slate-900">{t({ zh: '推广 Agent', en: 'Promotion Agent' })}</strong>
                  <p className="text-slate-500">
                    {t({ zh: '负责商户推广，获得 0.5% 永久分成 + 入驻奖励', en: 'Promotes merchants, gets 0.5% permanent share + onboarding rewards' })}
                  </p>
                </li>
              </ul>
            </div>

            <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
              <h2 className="text-2xl font-semibold text-white">
                {t({ zh: '核心价值', en: 'Key benefits' })}
              </h2>
              <div className="mt-6 grid gap-4">
                {benefits.map((benefit) => (
                  <div key={benefit.title.zh} className="rounded-xl border border-white/10 bg-white/5 p-4">
                    <p className="text-sm font-semibold text-white">{t(benefit.title)}</p>
                    <p className="text-sm text-slate-300">{t(benefit.detail)}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className="border-b border-white/10 py-12">
          <div className="container mx-auto px-6">
            <h3 className="text-2xl font-semibold text-white">
              {t({ zh: '接入流程', en: 'Integration flow' })}
            </h3>
            <div className="mt-8 grid gap-6 md:grid-cols-3">
              {flows.map((flow) => (
                <div key={flow.step} className="rounded-2xl border border-white/10 bg-white/5 p-5">
                  <span className="text-sm font-mono text-slate-400">{flow.step}</span>
                  <p className="mt-2 text-lg font-semibold text-white">{t(flow.title)}</p>
                  <p className="mt-1 text-sm text-slate-300">{t(flow.detail)}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="container mx-auto px-6 py-12">
          <div className="rounded-2xl bg-slate-900 p-8 text-white">
            <h4 className="text-2xl font-semibold">{t({ zh: '加入联盟', en: 'Join the alliance' })}</h4>
            <p className="mt-3 text-sm text-slate-200">
              {t({
                zh: '获取完整的 API 文档、示例代码和推广策略，仅需 5 分钟即可完成接入和测试。',
                en: 'Get API docs, samples and promotion strategy; go live in under 5 minutes.',
              })}
            </p>
            <button
              onClick={() => router.push('/auth/register')}
              className="mt-6 rounded-xl bg-white px-5 py-3 text-sm font-semibold text-slate-900 hover:bg-slate-100 transition-colors"
            >
              {t({ zh: '预约接入', en: 'Request access' })}
            </button>
          </div>
        </section>
      </main>
      <Footer />
    </>
  )
}


