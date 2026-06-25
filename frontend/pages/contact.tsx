/**
 * /contact — Contact / general inquiries (Sprint W-4 Day 3).
 *
 * Single page that consolidates all contact channels by topic.
 * Aimed at users / partners / press who want to reach a real person.
 */
import Link from 'next/link';
import { MarketingLayout } from '../components/marketing/MarketingLayout';
import { buildSeo } from '../lib/seo';
import { useLocalization } from '../contexts/LocalizationContext';
import {
  Mail, Briefcase, Megaphone, FileText, ShieldCheck, GraduationCap,
  TrendingUp, Headphones, Github, MessageCircle,
} from 'lucide-react';

interface Channel {
  icon: typeof Mail;
  topic: { zh: string; en: string };
  email: string;
  desc: { zh: string; en: string };
  sla: { zh: string; en: string };
}

const CHANNELS: Channel[] = [
  {
    icon: Headphones,
    topic: { zh: '产品支持', en: 'Product support' },
    email: 'support@agentrix.top',
    desc: { zh: 'Bug 报告、使用问题、账户问题', en: 'Bug reports, usage questions, account issues' },
    sla: { zh: '24 小时内回复（工作日）', en: '< 24h response (business days)' },
  },
  {
    icon: Briefcase,
    topic: { zh: '商务 / 品牌合作', en: 'Business / Brand partnerships' },
    email: 'bd@agentrix.top',
    desc: { zh: 'IP 联名、教育合作、技术集成、企业方案', en: 'IP licensing, education, integration, enterprise' },
    sla: { zh: '48 小时内回复', en: '< 48h response' },
  },
  {
    icon: Megaphone,
    topic: { zh: 'KOL / 创作者大使', en: 'KOL / Creator ambassadors' },
    email: 'growth@agentrix.top',
    desc: { zh: '万粉级创作者，专属邀请码 + 收益分成', en: '10k+ creators, dedicated invite code + revenue share' },
    sla: { zh: '48 小时内回复', en: '< 48h response' },
  },
  {
    icon: TrendingUp,
    topic: { zh: '投资人 / 财务', en: 'Investors / Finance' },
    email: 'investors@agentrix.top',
    desc: { zh: '投资意向、财务尽调、董事会问题', en: 'Investment, financial DD, board matters' },
    sla: { zh: '48 小时内回复', en: '< 48h response' },
  },
  {
    icon: ShieldCheck,
    topic: { zh: '隐私 / 数据', en: 'Privacy / Data' },
    email: 'privacy@agentrix.top',
    desc: { zh: 'GDPR 数据导出、删除账号、隐私问题', en: 'GDPR export, account deletion, privacy concerns' },
    sla: { zh: '7 天内处理 / 30 天内交付', en: '< 7d processing / < 30d delivery' },
  },
  {
    icon: FileText,
    topic: { zh: '法律', en: 'Legal' },
    email: 'legal@agentrix.top',
    desc: { zh: '合同、版权、合规事务', en: 'Contracts, copyright, compliance' },
    sla: { zh: '5 个工作日内回复', en: '< 5 business days' },
  },
  {
    icon: GraduationCap,
    topic: { zh: '教育合作', en: 'Education' },
    email: 'edu@agentrix.top',
    desc: { zh: '高校 / AI 课程 / 公益项目', en: 'Universities / AI courses / NGO programs' },
    sla: { zh: '5 个工作日内回复', en: '< 5 business days' },
  },
  {
    icon: MessageCircle,
    topic: { zh: '媒体 / PR', en: 'Press / PR' },
    email: 'press@agentrix.top',
    desc: { zh: '采访、新闻稿、产品评测', en: 'Interviews, press releases, product reviews' },
    sla: { zh: '24 小时内回复', en: '< 24h response' },
  },
];

const COMMUNITY = [
  {
    icon: '📨',
    name: 'Telegram',
    href: 'https://t.me/agentrix',
    desc: { zh: '中英双语，运营 + 工程师在线', en: 'Bilingual, ops + engineers online' },
  },
  {
    icon: '🎮',
    name: 'Discord',
    href: 'https://discord.gg/agentrix',
    desc: { zh: '海外社区主战场', en: 'Main hub for overseas community' },
  },
  {
    icon: '🐦',
    name: 'X / Twitter',
    href: 'https://twitter.com/agentrix',
    desc: { zh: '产品发布 + 业内动态', en: 'Product announcements + industry updates' },
  },
  {
    icon: '🐙',
    name: 'GitHub',
    href: 'https://github.com/CutaGames',
    desc: { zh: '开源仓库 + Issue 追踪', en: 'Open-source repos + issue tracking' },
  },
];

export default function ContactPage() {
  const { t } = useLocalization();
  const seo = buildSeo({
    title: t({ zh: '联系我们 · Agentrix', en: 'Contact · Agentrix' }),
    description: t({
      zh: '产品支持 / 商务合作 / KOL / 投资人 / 隐私 / 法律 / 教育 / 媒体 — 找到对应入口直接联系。',
      en: 'Support / Business / KOL / Investors / Privacy / Legal / Education / Press — direct entry per topic.',
    }),
    path: '/contact',
  });

  return (
    <MarketingLayout seo={seo}>
      <section className="border-b border-agentrix-inkLine bg-agentrix-ink py-16 md:py-20">
        <div className="container mx-auto max-w-3xl px-6 text-center">
          <h1 className="text-4xl font-extrabold md:text-5xl">{t({ zh: '联系我们', en: 'Contact us' })}</h1>
          <p className="mt-4 text-agentrix-fog">
            {t({
              zh: '看你想聊什么 — 我们对应到不同的同事，每个邮箱都有人值守。',
              en: 'Pick a topic — we route to the right teammate. Every inbox has an owner.',
            })}
          </p>
        </div>
      </section>

      <section className="bg-agentrix-ink py-16">
        <div className="container mx-auto max-w-5xl px-6">
          <div className="grid gap-4 md:grid-cols-2">
            {CHANNELS.map((c) => {
              const Icon = c.icon;
              return (
                <a
                  key={c.email}
                  href={`mailto:${c.email}`}
                  className="block rounded-2xl border border-agentrix-inkLine bg-agentrix-inkSoft p-5 transition-all hover:border-agentrix-electric/60 hover:bg-agentrix-inkSoft/80"
                >
                  <div className="flex items-start gap-4">
                    <Icon size={22} className="mt-1 text-agentrix-electric" />
                    <div className="flex-1 min-w-0">
                      <h3 className="text-base font-bold text-white">{t(c.topic)}</h3>
                      <p className="mt-1 text-sm text-agentrix-fog">{t(c.desc)}</p>
                      <div className="mt-3 flex items-center justify-between gap-2">
                        <code className="text-xs text-agentrix-electric font-mono break-all">{c.email}</code>
                        <span className="ml-auto whitespace-nowrap text-[10px] text-agentrix-mist">{t(c.sla)}</span>
                      </div>
                    </div>
                  </div>
                </a>
              );
            })}
          </div>
        </div>
      </section>

      <section className="border-t border-agentrix-inkLine bg-agentrix-inkSoft py-16">
        <div className="container mx-auto max-w-4xl px-6">
          <div className="mb-8 text-center">
            <h2 className="text-2xl font-bold md:text-3xl">{t({ zh: '社区与公开渠道', en: 'Community & public channels' })}</h2>
            <p className="mt-3 text-agentrix-fog">
              {t({ zh: '不想发邮件？这些频道实时性更高。', en: 'Prefer real-time? These channels are faster.' })}
            </p>
          </div>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            {COMMUNITY.map((cm) => (
              <a
                key={cm.name}
                href={cm.href}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-2xl border border-agentrix-inkLine bg-agentrix-ink p-5 text-center transition-all hover:border-agentrix-electric/60"
              >
                <div className="text-3xl mb-2">{cm.icon}</div>
                <div className="text-sm font-bold text-white">{cm.name}</div>
                <div className="mt-1 text-[11px] text-agentrix-mist leading-snug">{t(cm.desc)}</div>
              </a>
            ))}
          </div>
          <div className="mt-10 text-center text-xs text-agentrix-mist">
            <Link href="/help" className="text-agentrix-electric hover:underline">
              {t({ zh: '帮助中心 / 用户手册 →', en: 'Help center / user manuals →' })}
            </Link>
          </div>
        </div>
      </section>
    </MarketingLayout>
  );
}
