import Link from 'next/link';
import { MarketingLayout } from '../components/marketing/MarketingLayout';
import { buildSeo } from '../lib/seo';
import { useLocalization } from '../contexts/LocalizationContext';

export default function AboutPage() {
  const { t } = useLocalization();
  const seo = buildSeo({
    title: t({ zh: '关于 Agentrix', en: 'About Agentrix' }),
    description: t({
      zh: '我们正在打造数字生命体的操作系统：让每个人都拥有属于自己的、能跨设备陪伴并自主赚钱的 Agent。',
      en: 'Building the OS for digital beings — so everyone owns an Agent that companions across devices and earns autonomously.',
    }),
    path: '/about',
  });
  return (
    <MarketingLayout seo={seo}>
      <section className="bg-agentrix-ink py-20">
        <div className="container mx-auto max-w-3xl px-6">
          <h1 className="text-4xl font-extrabold md:text-5xl">
            {t({ zh: '让每个人拥有自己的 Agent', en: 'An agent for everyone' })}
          </h1>
          <p className="mt-6 text-lg leading-relaxed text-agentrix-fog">
            {t({
              zh: 'Agentrix 由一支远程团队组成，分布在亚洲与北美。我们相信 Agent 是继 PC、智能手机之后第三种个人计算载体 —— 它有人格、有钱包、能跨屏陪伴并自主赚钱。',
              en: 'Agentrix is a remote team across Asia and North America. We believe the Agent is the third personal-computing medium after PC and smartphone — with persona, wallet, cross-screen companionship and autonomous earning.',
            })}
          </p>
          <p className="mt-4 text-lg leading-relaxed text-agentrix-fog">
            {t({
              zh: '我们的使命：为每个家庭、每个团队、每家企业，构建可拥有、可审计、可继承的数字生命体。',
              en: 'Our mission: for every family, team and enterprise — build digital beings that are ownable, auditable and inheritable.',
            })}
          </p>

          <h2 className="mt-12 text-2xl font-bold text-white">{t({ zh: '里程碑', en: 'Milestones' })}</h2>
          <ul className="mt-4 space-y-2 text-agentrix-fog">
            <li>2024 Q4 — Agentrix v1：钱包 + 支付 SDK 上线</li>
            <li>2025 Q2 — Agentrix v2：Skill / 任务集市 + Mobile Live2D 主宠</li>
            <li>2025 Q4 — <strong className="text-white">Agentrix v3：Living / Doer / Economy 三层愿景</strong></li>
            <li>2026 — 5 端 GA + Enterprise 私有部署</li>
          </ul>

          <div className="mt-12 flex flex-wrap gap-3">
            <Link href="/manifesto" className="rounded-full bg-agentrix-electric px-6 py-3 text-sm font-bold text-agentrix-ink">
              {t({ zh: '阅读宣言', en: 'Read manifesto' })}
            </Link>
            <a href="mailto:hello@agentrix.top" className="rounded-full border border-white/20 bg-white/5 px-6 py-3 text-sm font-bold text-white">
              {t({ zh: '联系我们', en: 'Contact us' })}
            </a>
          </div>
        </div>
      </section>
    </MarketingLayout>
  );
}
