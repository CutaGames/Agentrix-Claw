/**
 * /partners — Ecosystem partners page (Sprint W-4 Day 3).
 *
 * Four partnership tracks: Brand · KOL · Integration · Education.
 * Each track explains the value-prop, how to apply, and what we
 * commit to deliver back.
 */
import Link from 'next/link';
import { motion } from 'framer-motion';
import { MarketingLayout } from '../components/marketing/MarketingLayout';
import { buildSeo } from '../lib/seo';
import { useLocalization } from '../contexts/LocalizationContext';
import {
  Sparkles, Megaphone, PlugZap, GraduationCap,
  Mail, ArrowRight, Briefcase, ShoppingBag, Globe, Building,
} from 'lucide-react';

interface Track {
  id: string;
  icon: typeof Sparkles;
  accent: string;
  title: { zh: string; en: string };
  pitch: { zh: string; en: string };
  benefits: { zh: string; en: string }[];
  weDeliver: { zh: string; en: string }[];
  contact: string;
  cta: { zh: string; en: string };
}

const TRACKS: Track[] = [
  {
    id: 'brand',
    icon: ShoppingBag,
    accent: 'from-violet-500 to-fuchsia-500',
    title: { zh: '品牌合作 · IP / 联名', en: 'Brand · IP & Co-branding' },
    pitch: {
      zh: '把你的 IP 灵狐、玩偶、动漫角色变成 Agentrix 的官方限定皮肤。一次合作上架五端 (Mobile / Desktop / Web / Watch / Toy)，玩家"养"得到、戴得上、能交易。',
      en: 'Turn your IP foxes, dolls, anime characters into official limited skins on Agentrix. One deal, five surfaces (Mobile / Desktop / Web / Watch / Toy) — players raise, wear and trade them.',
    },
    benefits: [
      { zh: '上架 5 端同时分发', en: 'Distributed across all 5 surfaces simultaneously' },
      { zh: '内部 KOL 内测推广', en: 'Internal KOL promotion during launch' },
      { zh: '50/30/20 分成（IP 方/Agentrix/创作者）', en: '50/30/20 revenue split (IP / Agentrix / Creator)' },
      { zh: '限定 NFT 铸造资格', en: 'Limited NFT minting privilege' },
    ],
    weDeliver: [
      { zh: 'PetCreator 工具助力快速生成 IP 形象', en: 'PetCreator pipeline to convert IP fast' },
      { zh: '专属 Marketplace 分类（含 IP Logo 头部展示）', en: 'Dedicated Marketplace section (IP-branded hero)' },
      { zh: '联合营销内容（视频 / 帖子 / 邮件）', en: 'Co-marketing assets (video / posts / email)' },
    ],
    contact: 'bd@agentrix.top',
    cta: { zh: '提交合作意向', en: 'Submit partnership inquiry' },
  },
  {
    id: 'kol',
    icon: Megaphone,
    accent: 'from-amber-500 to-rose-500',
    title: { zh: 'KOL / 创作者大使', en: 'KOL / Creator Ambassadors' },
    pitch: {
      zh: '万粉级 Twitter / TikTok / 小红书 / B 站 / Instagram / YouTube 创作者。专属邀请码、创作者工具、收益分成，伴随 Agentrix 一起成长。',
      en: '10k+ creator on Twitter / TikTok / Xiaohongshu / Bilibili / Instagram / YouTube. Dedicated invite codes, creator tools, revenue share — grow with Agentrix.',
    },
    benefits: [
      { zh: '专属邀请码（带追溯，邀请人 +500 AXP / 用户）', en: 'Dedicated invite code (traceable, +500 AXP per user)' },
      { zh: '邀请用户购买分成 10%（30 天内归属）', en: '10% revenue share on invited users (30-day attribution)' },
      { zh: '创作者徽章 + 排行榜公开背书', en: 'Creator badge + public leaderboard endorsement' },
      { zh: '提前 30 天体验未发布功能', en: '30 days early access to unreleased features' },
    ],
    weDeliver: [
      { zh: '创作者媒体工具包（Logo / 模板 / 截图）', en: 'Creator media kit (logos / templates / screenshots)' },
      { zh: '半月一次的内部产品 AMA', en: 'Bi-weekly internal product AMA' },
      { zh: 'API 提前 access（自动化你的创作流程）', en: 'Early API access for creator workflow automation' },
    ],
    contact: 'growth@agentrix.top',
    cta: { zh: '申请创作者大使', en: 'Apply as ambassador' },
  },
  {
    id: 'integration',
    icon: PlugZap,
    accent: 'from-cyan-500 to-blue-500',
    title: { zh: '技术集成 · API / SDK / Skill', en: 'Integration · API / SDK / Skill' },
    pitch: {
      zh: '把你的 SaaS / 工具 / 模型集成到 Agentrix Skill 市场。Agent 直接调用你的 API，按使用次数自动结算 USDC（X402 微支付）。',
      en: 'Integrate your SaaS / tool / model into Agentrix Skill marketplace. Agents call your API directly, settle USDC per call via X402.',
    },
    benefits: [
      { zh: 'X402 微支付自动结算（无需自建账单）', en: 'X402 micro-payment auto-settlement (no billing infra needed)' },
      { zh: '集市曝光 + 内置 KOL 推广', en: 'Marketplace exposure + built-in KOL promotion' },
      { zh: '90/10 分成（开发者/平台）', en: '90/10 split (developer / platform)' },
      { zh: '与 OpenAI / Anthropic / Google 同列', en: 'Listed alongside OpenAI / Anthropic / Google' },
    ],
    weDeliver: [
      { zh: '完整 SDK + 示例代码（TS / Python / Go）', en: 'Full SDK + sample code (TS / Python / Go)' },
      { zh: 'Skill JSON Schema + 测试沙盒', en: 'Skill JSON Schema + test sandbox' },
      { zh: 'A2A 协议自动发现 + ERC-8004 身份接入', en: 'A2A protocol auto-discovery + ERC-8004 identity' },
    ],
    contact: 'developers@agentrix.top',
    cta: { zh: '查看开发者文档', en: 'See developer docs' },
  },
  {
    id: 'education',
    icon: GraduationCap,
    accent: 'from-emerald-500 to-teal-500',
    title: { zh: '教育 / 公益', en: 'Education / Non-profit' },
    pitch: {
      zh: '高校 AI / 设计专业、AI 课程、公益项目。免费 Pro 订阅、定制学习皮肤、教师培训，把 Agentrix 变成你的 AI 教学搭档。',
      en: 'Universities AI / design programs, AI courses, NGO projects. Free Pro subscription, custom learning skins, instructor training — Agentrix as your AI teaching co-pilot.',
    },
    benefits: [
      { zh: '免费 Pro 订阅（学生 + 教师全员）', en: 'Free Pro subscription (students + instructors)' },
      { zh: '定制教学皮肤（按学科 / 课程主题）', en: 'Custom teaching skins (per-subject / course)' },
      { zh: '教师培训 + 课程教学包', en: 'Instructor training + course teaching kit' },
      { zh: '学生作品 Marketplace 优先曝光', en: 'Student works highlighted in Marketplace' },
    ],
    weDeliver: [
      { zh: '一对一接入支持 + Slack 专属频道', en: 'Dedicated onboarding + Slack channel' },
      { zh: '定期工作坊 / 沙龙', en: 'Regular workshops / salons' },
      { zh: '与 Agentrix 联合发布课程证书', en: 'Co-issued course completion certificates' },
    ],
    contact: 'edu@agentrix.top',
    cta: { zh: '联系教育合作', en: 'Contact education team' },
  },
];

const TRUST_LOGOS: Array<{ name: string; href?: string }> = [
  { name: 'Anthropic' },
  { name: 'OpenAI' },
  { name: 'Google AI' },
  { name: 'Stripe' },
  { name: 'RevenueCat' },
  { name: 'Cloudflare' },
];

export default function PartnersPage() {
  const { t } = useLocalization();
  const seo = buildSeo({
    title: t({ zh: '合作伙伴 · Agentrix', en: 'Partners · Agentrix' }),
    description: t({
      zh: '4 类合作：品牌 IP / KOL 创作者 / 技术集成 / 教育公益。把你的资源接入 Agent Economy。',
      en: '4 partnership tracks: Brand IP / KOL Creator / Tech Integration / Education. Plug into the Agent Economy.',
    }),
    path: '/partners',
  });

  return (
    <MarketingLayout seo={seo}>
      {/* Hero */}
      <section className="relative overflow-hidden border-b border-agentrix-inkLine bg-agentrix-ink py-20 md:py-28">
        <div className="pointer-events-none absolute -top-32 left-1/4 h-[480px] w-[480px] rounded-full bg-violet-500/15 blur-3xl" />
        <div className="container mx-auto max-w-4xl px-6 text-center relative">
          <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-agentrix-electric/40 bg-agentrix-electric/10 px-4 py-1 text-xs font-semibold text-agentrix-electric">
            <Briefcase size={12} /> {t({ zh: '生态合作', en: 'Ecosystem' })}
          </div>
          <h1 className="text-4xl font-extrabold md:text-5xl leading-tight">
            {t({ zh: '让 Agent 经济 · 与你共建', en: 'Build the Agent Economy together' })}
          </h1>
          <p className="mt-4 text-lg text-agentrix-fog">
            {t({
              zh: '每天有数百万次 Agent 调用流过 Agentrix。我们把这些流量、收入、用户开放给真心想一起做事的合作方。',
              en: 'Millions of agent calls flow through Agentrix daily. We open these flows, revenues and users to partners who genuinely want to build with us.',
            })}
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <a
              href="mailto:bd@agentrix.top?subject=Partnership Inquiry"
              className="inline-flex items-center gap-2 rounded-full bg-agentrix-electric px-6 py-3 text-sm font-bold text-agentrix-ink hover:opacity-90"
            >
              <Mail size={14} /> {t({ zh: '联系商务团队', en: 'Contact BD team' })}
            </a>
            <Link
              href="/contact"
              className="inline-flex items-center gap-2 rounded-full border border-agentrix-inkLine bg-white/5 px-6 py-3 text-sm font-semibold text-white hover:bg-white/10"
            >
              {t({ zh: '通用联系方式', en: 'General contact' })}
              <ArrowRight size={14} />
            </Link>
          </div>
        </div>
      </section>

      {/* Trust strip */}
      <section className="border-b border-agentrix-inkLine bg-agentrix-inkSoft/40 py-10">
        <div className="container mx-auto max-w-5xl px-6 text-center">
          <p className="mb-4 text-[10px] font-bold uppercase tracking-[0.2em] text-agentrix-mist">
            {t({ zh: '正在使用 Agentrix 的生态伙伴', en: 'Ecosystem partners using Agentrix' })}
          </p>
          <div className="flex flex-wrap items-center justify-center gap-x-10 gap-y-4 text-sm font-semibold text-agentrix-mist/80">
            {TRUST_LOGOS.map((l) => (
              <span key={l.name} className="opacity-70 hover:opacity-100 transition-opacity">
                {l.name}
              </span>
            ))}
          </div>
          <p className="mt-3 text-xs text-agentrix-mist/60">
            {t({ zh: '同时也欢迎你的 Logo 出现在这里', en: 'Your logo could be here too' })}
          </p>
        </div>
      </section>

      {/* Tracks */}
      <section className="bg-agentrix-ink py-20">
        <div className="container mx-auto max-w-5xl px-6">
          <div className="mb-12 text-center">
            <h2 className="text-3xl font-bold md:text-4xl">
              {t({ zh: '4 种合作方式', en: '4 partnership tracks' })}
            </h2>
            <p className="mx-auto mt-3 max-w-2xl text-base text-agentrix-fog">
              {t({
                zh: '看你处于生态里的哪一环 — 我们用对应的工具、流量和分成机制对接。',
                en: 'Pick the slot you fit best — we plug you in with matching tooling, traffic and revenue share.',
              })}
            </p>
          </div>

          <div className="space-y-8">
            {TRACKS.map((tr, i) => {
              const Icon = tr.icon;
              return (
                <motion.article
                  key={tr.id}
                  initial={{ opacity: 0, y: 24 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, margin: '-50px' }}
                  transition={{ duration: 0.4, delay: i * 0.05 }}
                  className="rounded-2xl border border-agentrix-inkLine bg-agentrix-inkSoft p-6 md:p-8"
                  id={tr.id}
                >
                  <div className="grid gap-6 md:grid-cols-[auto_1fr] md:items-start">
                    <div className={`inline-flex h-16 w-16 items-center justify-center rounded-xl bg-gradient-to-br ${tr.accent} text-white`}>
                      <Icon size={28} />
                    </div>
                    <div>
                      <h3 className="text-xl font-bold text-white md:text-2xl">{t(tr.title)}</h3>
                      <p className="mt-2 text-sm text-agentrix-fog md:text-base">{t(tr.pitch)}</p>

                      <div className="mt-6 grid gap-6 md:grid-cols-2">
                        <div>
                          <p className="mb-3 text-xs font-bold uppercase tracking-wider text-agentrix-electric">
                            {t({ zh: '你能得到', en: 'What you get' })}
                          </p>
                          <ul className="space-y-2 text-sm text-agentrix-fog">
                            {tr.benefits.map((b, idx) => (
                              <li key={idx} className="flex items-start gap-2">
                                <span className="mt-1 inline-block h-1.5 w-1.5 rounded-full bg-agentrix-electric" />
                                <span>{t(b)}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                        <div>
                          <p className="mb-3 text-xs font-bold uppercase tracking-wider text-agentrix-solar">
                            {t({ zh: '我们提供', en: 'What we deliver' })}
                          </p>
                          <ul className="space-y-2 text-sm text-agentrix-fog">
                            {tr.weDeliver.map((b, idx) => (
                              <li key={idx} className="flex items-start gap-2">
                                <span className="mt-1 inline-block h-1.5 w-1.5 rounded-full bg-agentrix-solar" />
                                <span>{t(b)}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      </div>

                      <div className="mt-6 flex flex-wrap items-center gap-3">
                        <a
                          href={`mailto:${tr.contact}?subject=${encodeURIComponent(t(tr.cta))}`}
                          className="inline-flex items-center gap-2 rounded-full bg-white/10 px-5 py-2 text-sm font-semibold text-white hover:bg-white/15"
                        >
                          <Mail size={14} /> {t(tr.cta)}
                        </a>
                        <span className="text-xs text-agentrix-mist">→ {tr.contact}</span>
                      </div>
                    </div>
                  </div>
                </motion.article>
              );
            })}
          </div>
        </div>
      </section>

      {/* Footer CTA */}
      <section className="border-t border-agentrix-inkLine bg-agentrix-inkSoft py-16">
        <div className="container mx-auto max-w-3xl px-6 text-center">
          <Building size={32} className="mx-auto mb-4 text-agentrix-electric" />
          <h2 className="text-2xl font-bold md:text-3xl">
            {t({ zh: '不在以上 4 类？', en: 'Not in any of the 4 tracks?' })}
          </h2>
          <p className="mt-3 text-agentrix-fog">
            {t({
              zh: '我们经常打破自己定的框。把你的想法直接告诉我们：',
              en: 'We routinely break our own frameworks. Just tell us your idea directly:',
            })}
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <a
              href="mailto:hi@agentrix.top?subject=Custom Partnership Idea"
              className="inline-flex items-center gap-2 rounded-full bg-agentrix-electric px-6 py-3 text-sm font-bold text-agentrix-ink hover:opacity-90"
            >
              <Mail size={14} /> hi@agentrix.top
            </a>
            <Link
              href="/investors"
              className="inline-flex items-center gap-2 rounded-full border border-agentrix-inkLine bg-white/5 px-6 py-3 text-sm font-semibold text-white hover:bg-white/10"
            >
              <Globe size={14} /> {t({ zh: '投资人入口', en: 'Investors' })}
            </Link>
          </div>
        </div>
      </section>
    </MarketingLayout>
  );
}
