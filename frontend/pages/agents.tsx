import Link from 'next/link';
import { MarketingLayout } from '../components/marketing/MarketingLayout';
import { buildSeo } from '../lib/seo';
import { useLocalization } from '../contexts/LocalizationContext';

const TEMPLATES = [
  { name: { zh: '陪伴型 · Sora', en: 'Companion · Sora' }, desc: { zh: '温柔人设 + Live2D 主宠 + 日常聊伴', en: 'Soft persona + Live2D + everyday companion' } },
  { name: { zh: '执行型 · Forge', en: 'Executor · Forge' }, desc: { zh: '工程师人设 + Worktree 并行 + Skill Canvas', en: 'Engineer persona + worktree parallel + Skill Canvas' } },
  { name: { zh: '经济型 · Trader', en: 'Earner · Trader' }, desc: { zh: '理财人设 + Auto-Earn + X402 微支付', en: 'Investor persona + Auto-Earn + X402 micropay' } },
];

export default function AgentsPage() {
  const { t } = useLocalization();
  const seo = buildSeo({
    title: t({ zh: 'Agent 模板 · Agentrix', en: 'Agent Templates · Agentrix' }),
    description: t({
      zh: '从陪伴、执行到经济，三类预制 Agent 模板让你 30 秒拥有第一只 Agent。',
      en: 'Companion, executor, earner — three preset templates so you have your first Agent in 30 seconds.',
    }),
    path: '/agents',
  });
  return (
    <MarketingLayout seo={seo}>
      <section className="bg-agentrix-ink py-20">
        <div className="container mx-auto max-w-5xl px-6">
          <h1 className="text-4xl font-extrabold md:text-5xl">{t({ zh: '挑一个起点', en: 'Pick a starting point' })}</h1>
          <p className="mt-4 max-w-2xl text-agentrix-fog">
            {t({
              zh: '所有模板都可在 Console 中自由编辑人格、记忆、技能与钱包阈值。',
              en: 'Every template is fully editable in Console — persona, memory, skills, wallet thresholds.',
            })}
          </p>
          <div className="mt-12 grid gap-6 md:grid-cols-3">
            {TEMPLATES.map((tpl) => (
              <div key={tpl.name.en} className="rounded-2xl border border-agentrix-inkLine bg-agentrix-inkSoft p-6">
                <h3 className="text-lg font-bold text-white">{t(tpl.name)}</h3>
                <p className="mt-3 text-sm text-agentrix-fog">{t(tpl.desc)}</p>
                <Link
                  href="/auth/login?next=/console/agents"
                  className="mt-5 inline-block rounded-full bg-agentrix-electric px-4 py-2 text-xs font-bold text-agentrix-ink"
                >
                  {t({ zh: '使用此模板', en: 'Use template' })}
                </Link>
              </div>
            ))}
          </div>
        </div>
      </section>
    </MarketingLayout>
  );
}
