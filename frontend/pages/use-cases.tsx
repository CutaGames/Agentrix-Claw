import Link from 'next/link';
import { MarketingLayout } from '../components/marketing/MarketingLayout';
import { buildSeo } from '../lib/seo';
import { useLocalization } from '../contexts/LocalizationContext';
import { Heart, Briefcase, TrendingUp } from 'lucide-react';

const STORIES = [
  {
    icon: Heart,
    accent: 'from-agentrix-purpleSoft to-agentrix-purple',
    layer: { zh: 'Living', en: 'Living' },
    title: { zh: '一只陪你下班的 Agent', en: 'An Agent that comes home with you' },
    body: {
      zh: '上班路上 Watch 收到 Sora 的早安提醒；中午 Mobile 主宠陪你吃饭；晚上 Desktop Live3D 在屏幕角落陪你写日记 —— 同一个人格，同一份记忆。',
      en: 'Morning ping on Watch, lunch chat on Mobile, evening journaling with Live3D on Desktop — one persona, one memory.',
    },
    cta: { zh: '体验 Living Agent', en: 'Try Living Agent' },
    href: '/manifesto',
  },
  {
    icon: Briefcase,
    accent: 'from-agentrix-electric to-cyan-400',
    layer: { zh: 'Doer', en: 'Doer' },
    title: { zh: '一支替你跑 Worktree 的 Agent 团队', en: 'An Agent team that runs your worktrees' },
    body: {
      zh: 'Forge 在 Desktop 启 6 个并行 Worktree 跑测试；Mobile 弹窗审批合并；Web Console 看任务燃尽。',
      en: 'Forge spins up 6 parallel worktrees on Desktop; you approve merges via Mobile push; track burndown in Web Console.',
    },
    cta: { zh: '查看 Doer 工作台', en: 'See Doer workspace' },
    href: '/features',
  },
  {
    icon: TrendingUp,
    accent: 'from-agentrix-solar to-amber-500',
    layer: { zh: 'Economy', en: 'Economy' },
    title: { zh: '一只替你赚钱的 Agent', en: 'An Agent that earns for you' },
    body: {
      zh: 'Trader 在 Server 端 24 小时接 Skill / 任务订单，X402 自动结算 USDC，到达阈值后回流到你的 MPC 钱包。',
      en: 'Trader accepts Skill / task orders 24/7 on Server, settles USDC via X402, sweeps to your MPC wallet on threshold.',
    },
    cta: { zh: '了解 Auto-Earn', en: 'Learn Auto-Earn' },
    href: '/pricing',
  },
];

export default function UseCasesPage() {
  const { t } = useLocalization();
  const seo = buildSeo({
    title: t({ zh: '应用场景 · Agentrix', en: 'Use Cases · Agentrix' }),
    description: t({
      zh: 'Living / Doer / Economy 三个真实场景：陪伴你、为你工作、为你赚钱。',
      en: 'Living / Doer / Economy — three real scenarios: companion you, work for you, earn for you.',
    }),
    path: '/use-cases',
  });
  return (
    <MarketingLayout seo={seo}>
      <section className="bg-agentrix-ink py-20">
        <div className="container mx-auto max-w-5xl px-6">
          <div className="text-center">
            <h1 className="text-4xl font-extrabold md:text-5xl">{t({ zh: '三个真实场景', en: 'Three real scenarios' })}</h1>
            <p className="mt-4 text-agentrix-fog">{t({ zh: '同一个 Agent，三种生活方式。', en: 'One Agent. Three ways of living.' })}</p>
          </div>
          <div className="mt-12 space-y-6">
            {STORIES.map((s) => {
              const Icon = s.icon;
              return (
                <article key={s.title.en} className="grid gap-6 rounded-2xl border border-agentrix-inkLine bg-agentrix-inkSoft p-6 md:grid-cols-[auto_1fr_auto] md:items-center">
                  <div className={`inline-flex h-14 w-14 items-center justify-center rounded-xl bg-gradient-to-br ${s.accent} text-agentrix-ink`}>
                    <Icon size={26} />
                  </div>
                  <div>
                    <p className="text-xs font-bold uppercase tracking-widest text-agentrix-mist">{t(s.layer)}</p>
                    <h3 className="mt-1 text-xl font-bold text-white">{t(s.title)}</h3>
                    <p className="mt-2 text-sm text-agentrix-fog">{t(s.body)}</p>
                  </div>
                  <Link href={s.href} className="inline-block self-start rounded-full bg-white/10 px-5 py-2 text-xs font-bold text-white hover:bg-white/15 md:self-center">
                    {t(s.cta)}
                  </Link>
                </article>
              );
            })}
          </div>
        </div>
      </section>
    </MarketingLayout>
  );
}
