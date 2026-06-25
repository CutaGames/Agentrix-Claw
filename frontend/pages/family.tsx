import Link from 'next/link';
import { MarketingLayout } from '../components/marketing/MarketingLayout';
import { buildSeo } from '../lib/seo';
import { useLocalization } from '../contexts/LocalizationContext';
import { Heart, ShieldCheck, Wallet, Smartphone } from 'lucide-react';

const FEATURES = [
  { icon: Heart, title: { zh: '一家人共享一个 Agent', en: 'One Agent for the family' }, desc: { zh: '父母 / 孩子 / 老人共享同一只 Living Agent，记忆与人设跨账号同步。', en: 'Parents, kids and elders share the same Living Agent — memory & persona across accounts.' } },
  { icon: ShieldCheck, title: { zh: '家长审批通道', en: 'Parental approval' }, desc: { zh: '孩子账户上的所有 L2/L3 支付，自动转到家长 Mobile 审批。', en: 'All L2/L3 payments on a child account route to parent Mobile for approval.' } },
  { icon: Wallet, title: { zh: '零花钱钱包', en: 'Allowance wallet' }, desc: { zh: '为孩子设定每周 / 每月预算与单笔上限，超出自动暂停。', en: 'Weekly / monthly budgets and per-tx caps for kids. Auto-pause on overrun.' } },
  { icon: Smartphone, title: { zh: '老人专用界面', en: 'Senior-friendly UI' }, desc: { zh: '大字体 / 语音优先 / 一键呼叫家人，让老人也能拥有 Agent 陪伴。', en: 'Large fonts, voice-first, one-tap call. Elders can have an Agent too.' } },
];

export default function FamilyPage() {
  const { t } = useLocalization();
  const seo = buildSeo({
    title: t({ zh: '家庭账号 · Agentrix', en: 'Family · Agentrix' }),
    description: t({
      zh: '一只 Agent 陪伴一家人。家长审批、零花钱钱包、老人专用界面，让 AI 安全地融入家庭。',
      en: 'One Agent for the whole family. Parental approval, allowance wallet, senior-friendly UI — AI safely woven into family life.',
    }),
    path: '/family',
  });
  return (
    <MarketingLayout seo={seo}>
      <section className="bg-agentrix-ink py-20">
        <div className="container mx-auto max-w-5xl px-6">
          <h1 className="text-4xl font-extrabold md:text-5xl">{t({ zh: '把 Agent 带回家', en: 'Bring an Agent home' })}</h1>
          <p className="mt-4 max-w-2xl text-agentrix-fog">
            {t({
              zh: '家庭账号让父母、孩子、老人共享同一个 Living Agent，但每个人都有独立的人设、预算与审批流。',
              en: 'A family account lets parents, kids and elders share the same Living Agent — yet each has their own persona, budget and approval flow.',
            })}
          </p>
          <div className="mt-12 grid gap-6 md:grid-cols-2">
            {FEATURES.map((f) => {
              const Icon = f.icon;
              return (
                <div key={f.title.en} className="rounded-2xl border border-agentrix-inkLine bg-agentrix-inkSoft p-6">
                  <Icon size={24} className="text-agentrix-purpleSoft" />
                  <h3 className="mt-4 text-lg font-bold text-white">{t(f.title)}</h3>
                  <p className="mt-2 text-sm text-agentrix-fog">{t(f.desc)}</p>
                </div>
              );
            })}
          </div>
          <div className="mt-12 text-center">
            <Link href="/invite" className="inline-block rounded-full bg-agentrix-solar px-7 py-3 text-sm font-bold text-agentrix-ink">
              {t({ zh: '加入家庭内测', en: 'Join family beta' })}
            </Link>
          </div>
        </div>
      </section>
    </MarketingLayout>
  );
}
