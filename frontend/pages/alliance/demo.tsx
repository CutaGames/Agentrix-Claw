import Head from 'next/head'
import { useState } from 'react'
import { useRouter } from 'next/router'
import { Navigation } from '../../components/ui/Navigation'
import { Footer } from '../../components/layout/Footer'
import { useLocalization } from '../../contexts/LocalizationContext'

type PromotionType = 'basic' | 'pro' | 'master'

const promotionConfigs: Record<
  PromotionType,
  {
    label: { zh: string; en: string }
    requirement: { zh: string; en: string }
    reward: string
  }
> = {
  basic: {
    label: { zh: '基础推广', en: 'Basic Promotion' },
    requirement: { zh: '推广 1 个商户', en: 'Promote 1 merchant' },
    reward: '0.5%',
  },
  pro: {
    label: { zh: '专业推广', en: 'Pro Promotion' },
    requirement: { zh: '推广 5 个商户', en: 'Promote 5 merchants' },
    reward: '0.5% + 奖励',
  },
  master: {
    label: { zh: '高级推广', en: 'Master Promotion' },
    requirement: { zh: '推广 10 个商户', en: 'Promote 10 merchants' },
    reward: '0.5% + 高级奖励',
  },
}

export default function AllianceDemoPage() {
  const [promotionType, setPromotionType] = useState<PromotionType>('basic')
  const [merchantCount, setMerchantCount] = useState(5)
  const [monthlyGMV, setMonthlyGMV] = useState(50000)
  const router = useRouter()

  const { t } = useLocalization()

  // 计算推广收益：每个商户 0.5% 永久分成
  const estimatedReward = (monthlyGMV * merchantCount * 0.005).toFixed(2)

  return (
    <>
      <Head>
        <title>{t({ zh: '联盟机制演示 - Agentrix', en: 'Alliance demo - Agentrix' })}</title>
        <meta
          name="description"
          content={t({
            zh: '演示推广 Agent 如何通过推广商户获得永久分成，支持收益计算与推广策略。',
            en: 'Demonstrate how promotion agents earn permanent share by promoting merchants.',
          })}
        />
      </Head>
      <Navigation />
      <main className="bg-slate-950 text-white">
        <section className="border-b border-white/10 bg-gradient-to-r from-orange-600/90 to-pink-600/90 py-16 text-white">
          <div className="container mx-auto px-6">
            <p className="text-sm uppercase tracking-wide text-orange-100">
              {t({ zh: '推广 Agent · 永久分成', en: 'Promotion Agent · Permanent Share' })}
            </p>
            <h1 className="mt-2 text-4xl font-bold md:text-5xl">
              {t({ zh: '推广机制演示', en: 'Promotion mechanism demo' })}
            </h1>
            <p className="mt-4 max-w-3xl text-lg text-orange-50">
              {t({
                zh: '三种角色（执行 / 推荐 / 推广），推广商户获得 0.5% 永久分成，即时查看收益。',
                en: 'Three roles (execution / referral / promotion), promote merchants to get 0.5% permanent share.',
              })}
            </p>
          </div>
        </section>

        <section className="container mx-auto px-6 py-12">
          <div className="grid gap-6 lg:grid-cols-3">
            <div className="space-y-6 lg:col-span-2">
              <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
                <h2 className="text-lg font-semibold text-white">
                  {t({ zh: '推广类型与收益', en: 'Promotion types & rewards' })}
                </h2>
                <div className="mt-4 grid gap-4 md:grid-cols-3">
                  {(Object.keys(promotionConfigs) as PromotionType[]).map((typeKey) => (
                    <button
                      key={typeKey}
                      onClick={() => setPromotionType(typeKey)}
                      className={`rounded-2xl border p-4 text-left ${
                        promotionType === typeKey
                          ? 'border-orange-500 bg-orange-500/20 text-orange-300'
                          : 'border-white/10 bg-white/5 text-slate-300'
                      }`}
                    >
                      <p className="text-sm font-semibold">{t(promotionConfigs[typeKey].label)}</p>
                      <p className="mt-2 text-xs">{t(promotionConfigs[typeKey].requirement)}</p>
                      <p className="mt-3 text-lg font-bold text-white">{promotionConfigs[typeKey].reward}</p>
                    </button>
                  ))}
                </div>
                <div className="mt-6 grid gap-4 md:grid-cols-2">
                  <label className="flex flex-col text-sm font-medium text-slate-300">
                    {t({ zh: '推广商户数', en: 'Promoted Merchants' })}
                    <input
                      type="range"
                      min={1}
                      max={20}
                      value={merchantCount}
                      onChange={(event) => setMerchantCount(Number(event.target.value))}
                      className="mt-2"
                    />
                    <span className="mt-2 text-lg font-semibold text-white">{merchantCount}</span>
                  </label>
                  <label className="flex flex-col text-sm font-medium text-slate-300">
                    {t({ zh: '商户月GMV（USD）', en: 'Monthly GMV per Merchant (USD)' })}
                    <input
                      type="range"
                      min={10000}
                      max={100000}
                      step={10000}
                      value={monthlyGMV}
                      onChange={(event) => setMonthlyGMV(Number(event.target.value))}
                      className="mt-2"
                    />
                    <span className="mt-2 text-lg font-semibold text-white">${monthlyGMV.toLocaleString()}</span>
                  </label>
                </div>
              </div>

              <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
                <h3 className="text-lg font-semibold text-slate-900">
                  {t({ zh: '收益模拟', en: 'Reward simulator' })}
                </h3>
                <p className="mt-2 text-sm text-slate-300">
                  {t({
                    zh: '根据推广商户数和商户GMV计算永久分成收益，示例结果如下：',
                    en: 'Rewards are calculated by merchant count and GMV. Example result:',
                  })}
                </p>
                <div className="mt-4 rounded-2xl bg-slate-900 p-6 text-white">
                  <p className="text-sm text-orange-200">{t({ zh: '预计月度推广收益', en: 'Estimated monthly promotion revenue' })}</p>
                  <p className="mt-3 text-4xl font-bold">${estimatedReward}</p>
                  <p className="mt-2 text-sm text-slate-200">
                    {t({ zh: '0.5% 永久分成，只要商户在平台，收益持续产生', en: '0.5% permanent share, revenue continues as long as merchants are on platform' })}
                  </p>
                </div>
                <ul className="mt-4 list-disc space-y-2 pl-5 text-sm text-slate-300">
                  <li>
                    {t({ zh: '执行 Agent：负责支付 & 风控，享受交易分成', en: 'Execution agents handle payments and get transaction commission' })}
                  </li>
                  <li>
                    {t({ zh: '推荐 Agent：负责拉新，享受推荐分成', en: 'Referral agents focus on acquisition and get referral commission' })}
                  </li>
                  <li>
                    {t({ zh: '推广 Agent：负责商户推广，享受 0.5% 永久分成', en: 'Promotion agents promote merchants and get 0.5% permanent share' })}
                  </li>
                </ul>
              </div>
            </div>

            <div className="space-y-6">
              <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
                <h4 className="text-lg font-semibold text-white">
                  {t({ zh: '加入联盟步骤', en: 'Join steps' })}
                </h4>
                <ol className="mt-4 list-decimal space-y-3 pl-5 text-sm text-slate-300">
                  <li>{t({ zh: '注册成为推广 Agent', en: 'Register as promotion agent' })}</li>
                  <li>{t({ zh: '获取推广链接，分享给商户', en: 'Get promotion link and share with merchants' })}</li>
                  <li>{t({ zh: '商户入驻后，自动获得 0.5% 永久分成', en: 'Get 0.5% permanent share automatically after merchant onboarding' })}</li>
                </ol>
                <button
                  onClick={() => router.push('/auth/register')}
                  className="mt-6 w-full rounded-xl bg-orange-500 py-3 text-white hover:bg-orange-600"
                >
                  {t({ zh: '成为推广 Agent', en: 'Become Promotion Agent' })}
                </button>
              </div>
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </>
  )
}


