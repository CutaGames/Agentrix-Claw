/**
 * /investors — Investor relations page (Sprint W-4 Day 3).
 *
 * Concise, no-bullshit: what we are, why now, traction snapshot,
 * use-of-funds, contact. Not a fundraising deck, but a curated
 * landing for VCs who Google "Agentrix" before reaching out.
 */
import Link from 'next/link';
import { MarketingLayout } from '../components/marketing/MarketingLayout';
import { buildSeo } from '../lib/seo';
import { useLocalization } from '../contexts/LocalizationContext';
import {
  TrendingUp, Globe2, Sparkles, Lock, Users, Wallet,
  Mail, FileText, ArrowRight, BarChart3, Briefcase, Smartphone,
} from 'lucide-react';

interface KPI {
  label: { zh: string; en: string };
  value: string;
  hint: { zh: string; en: string };
  icon: typeof TrendingUp;
}

const KPIS: KPI[] = [
  { icon: Users, label: { zh: '内测用户', en: 'Beta users' }, value: '100+', hint: { zh: '初始邀请码', en: 'invite-only' } },
  { icon: Globe2, label: { zh: '已上线端', en: 'Surfaces live' }, value: '5', hint: { zh: 'Mobile / Desktop / Web / Watch / Toy', en: 'Mobile / Desktop / Web / Watch / Toy' } },
  { icon: Sparkles, label: { zh: '数字主宠生成数', en: 'Pets generated' }, value: '500+', hint: { zh: '截至 2026-05', en: 'as of 2026-05' } },
  { icon: BarChart3, label: { zh: '后端模块', en: 'Backend modules' }, value: '80+', hint: { zh: 'NestJS + PostgreSQL', en: 'NestJS + PostgreSQL' } },
];

const THESIS_PILLARS = [
  {
    icon: Smartphone,
    title: { zh: 'Mobile-first 信任锚', en: 'Mobile-first trust anchor' },
    desc: {
      zh: '所有签名 / 高额支付都通过 Mobile 完成。MPC 3-share 钱包硬件级安全 + 多端审批。',
      en: 'All signatures / high-value flows go through Mobile. MPC 3-share wallet for hardware-grade security + multi-surface approval.',
    },
  },
  {
    icon: Wallet,
    title: { zh: 'Pet-as-Agent 经济', en: 'Pet-as-Agent Economy' },
    desc: {
      zh: '把"养宠物"和"AI Agent 经济"耦合：用户为主宠付费 → 主宠产生收入 → 双向飞轮。',
      en: 'Couples pet-raising loops with AI agent economy: pay for the pet → pet earns → bidirectional flywheel.',
    },
  },
  {
    icon: Globe2,
    title: { zh: '开放协议 · A2A / X402 / ERC-8004', en: 'Open protocols · A2A / X402 / ERC-8004' },
    desc: {
      zh: '我们不锁生态。Agent 用开放协议互通，用户钱包是 EIP-7702 兼容，集成方按调用付费。',
      en: 'We do not lock the ecosystem. Agents interop via open protocols, wallets are EIP-7702 compatible, integrators pay per call.',
    },
  },
  {
    icon: Lock,
    title: { zh: '隐私围栏 · 4 类敏感分区', en: 'Privacy fence · 4 categories' },
    desc: {
      zh: '财务 / 健康 / 关系 / 位置 4 类敏感记忆，TTL 授权 + 一键撤回 + 完整审计日志。',
      en: 'Financial / Health / Relationship / Location — TTL grants, one-click revoke, full audit log.',
    },
  },
];

const TRACTION = [
  {
    quarter: 'Q4 2025',
    milestones: [
      { zh: 'V3 三形态架构上线（Living / Doer / Economy）', en: 'V3 three-form architecture (Living / Doer / Economy)' },
      { zh: 'MPC 钱包 + ERC-8004 身份接入', en: 'MPC wallet + ERC-8004 identity' },
    ],
  },
  {
    quarter: 'Q1 2026',
    milestones: [
      { zh: '5 端骨架完成（Mobile / Desktop / Web / Watch / Toy）', en: '5 surfaces live (Mobile / Desktop / Web / Watch / Toy)' },
      { zh: 'AXP 经济系统 + 5 档订阅', en: 'AXP economy + 5-tier subscription' },
      { zh: 'Marketplace V1（Skin / Skill / Tasks）', en: 'Marketplace V1 (Skin / Skill / Tasks)' },
    ],
  },
  {
    quarter: 'Q2 2026',
    milestones: [
      { zh: 'V4 上线：PetCreator 4 模式 / Cinderella Boost / NFC 盲盒 / Toy 配对', en: 'V4 ship: PetCreator 4 modes / Cinderella Boost / NFC / Toy pairing' },
      { zh: '100 人内测 + 商店上架准备', en: '100 user beta + store submission prep' },
    ],
  },
  {
    quarter: 'Q3 2026 (planned)',
    milestones: [
      { zh: '公开 GA · iOS App Store / Google Play', en: 'Public GA · iOS App Store / Google Play' },
      { zh: 'KOL Ambassador 计划 + 教育合作', en: 'KOL Ambassador program + Education partnerships' },
      { zh: 'NFT 主宠 mint + 跨链支持', en: 'NFT pet mint + multi-chain support' },
    ],
  },
];

const ASKS = [
  { zh: '产品打磨：iOS / macOS 上架 + 国际化（日 / 韩 / 越）', en: 'Product polish: iOS / macOS launch + i18n (ja / ko / vi)' },
  { zh: '团队扩张：5 名工程 + 2 名设计 + 1 名 DevRel', en: 'Team expansion: 5 engineers + 2 designers + 1 DevRel' },
  { zh: '生态拓展：50+ KOL 合作 + 10+ 品牌 IP 联名', en: 'Ecosystem expansion: 50+ KOL partnerships + 10+ brand IP collabs' },
  { zh: '基础设施：CDN / 推理 / Trust Signing 商业账号', en: 'Infrastructure: CDN / inference / Trust Signing accounts' },
];

export default function InvestorsPage() {
  const { t } = useLocalization();
  const seo = buildSeo({
    title: t({ zh: '投资人 · Agentrix', en: 'Investors · Agentrix' }),
    description: t({
      zh: 'Agentrix 投资人页面。Pet-as-Agent Economy 投资 Thesis、Traction、团队、Roadmap、联系方式。',
      en: 'Agentrix investor relations. Pet-as-Agent Economy thesis, traction, team, roadmap, and contact.',
    }),
    path: '/investors',
  });

  return (
    <MarketingLayout seo={seo}>
      {/* Hero */}
      <section className="relative overflow-hidden border-b border-agentrix-inkLine bg-agentrix-ink py-20 md:py-28">
        <div className="pointer-events-none absolute -top-32 right-1/4 h-[480px] w-[480px] rounded-full bg-amber-500/12 blur-3xl" />
        <div className="container mx-auto max-w-4xl px-6 relative">
          <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-amber-400/30 bg-amber-400/10 px-4 py-1 text-xs font-semibold text-amber-300">
            <TrendingUp size={12} /> {t({ zh: '投资人入口', en: 'Investor relations' })}
          </div>
          <h1 className="text-4xl font-extrabold md:text-5xl leading-tight">
            {t({
              zh: '把 AI Agent 装进 5 块屏幕，让数字人格替亿万用户陪伴 + 工作 + 赚钱',
              en: 'Putting AI agents on 5 screens — digital personas that companion, work and earn for billions',
            })}
          </h1>
          <p className="mt-6 text-lg text-agentrix-fog leading-relaxed max-w-2xl">
            {t({
              zh: 'Agentrix 是一家 Agent OS 公司，正在构建跨 Mobile / Desktop / Web / Watch / Toy 的 Pet-as-Agent 经济。我们相信 Agent 必须是"持久的、可拥有的、能自主赚钱的"，而不仅仅是聊天机器人。',
              en: 'Agentrix is an Agent OS company building the Pet-as-Agent Economy across Mobile / Desktop / Web / Watch / Toy. We believe agents should be persistent, ownable and self-earning — not just chatbots.',
            })}
          </p>

          <div className="mt-8 flex flex-wrap gap-3">
            <a
              href="mailto:investors@agentrix.top?subject=Investment Inquiry"
              className="inline-flex items-center gap-2 rounded-full bg-amber-400 px-6 py-3 text-sm font-bold text-agentrix-ink hover:opacity-90"
            >
              <Mail size={14} /> investors@agentrix.top
            </a>
            <a
              href="/docs/business/PITCH_DECK_2026.zh-CN.md"
              className="inline-flex items-center gap-2 rounded-full border border-agentrix-inkLine bg-white/5 px-6 py-3 text-sm font-semibold text-white hover:bg-white/10"
            >
              <FileText size={14} /> {t({ zh: '完整 Pitch Deck', en: 'Full pitch deck' })}
            </a>
          </div>
        </div>
      </section>

      {/* KPI snapshot */}
      <section className="border-b border-agentrix-inkLine bg-agentrix-inkSoft/40 py-12">
        <div className="container mx-auto max-w-5xl px-6">
          <p className="mb-6 text-center text-[10px] font-bold uppercase tracking-[0.2em] text-agentrix-mist">
            {t({ zh: '内测期间数据快照（截至 2026-05-16）', en: 'Beta snapshot · as of 2026-05-16' })}
          </p>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            {KPIS.map((k) => {
              const Icon = k.icon;
              return (
                <div key={k.value} className="rounded-2xl border border-agentrix-inkLine bg-agentrix-inkSoft p-5 text-center">
                  <Icon size={20} className="mx-auto mb-3 text-amber-400" />
                  <div className="text-3xl font-extrabold text-white">{k.value}</div>
                  <div className="mt-1 text-xs font-semibold text-agentrix-mist uppercase tracking-wider">{t(k.label)}</div>
                  <div className="mt-1 text-[10px] text-agentrix-mist/70">{t(k.hint)}</div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Thesis */}
      <section className="bg-agentrix-ink py-20">
        <div className="container mx-auto max-w-5xl px-6">
          <div className="mb-12 max-w-3xl">
            <h2 className="text-3xl font-bold md:text-4xl">
              {t({ zh: '为什么是 Agentrix · 为什么是现在', en: 'Why Agentrix · Why now' })}
            </h2>
            <p className="mt-3 text-agentrix-fog">
              {t({
                zh: '我们押在四个方向 — 这四个交集就是 Agentrix 的护城河。',
                en: 'Four bets compose our moat.',
              })}
            </p>
          </div>

          <div className="grid gap-5 md:grid-cols-2">
            {THESIS_PILLARS.map((p) => {
              const Icon = p.icon;
              return (
                <div key={p.title.en} className="rounded-2xl border border-agentrix-inkLine bg-agentrix-inkSoft p-6">
                  <Icon size={26} className="text-agentrix-electric" />
                  <h3 className="mt-4 text-lg font-bold text-white">{t(p.title)}</h3>
                  <p className="mt-2 text-sm text-agentrix-fog leading-relaxed">{t(p.desc)}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Traction timeline */}
      <section className="border-y border-agentrix-inkLine bg-agentrix-inkSoft/30 py-20">
        <div className="container mx-auto max-w-5xl px-6">
          <div className="mb-10 max-w-3xl">
            <h2 className="text-3xl font-bold md:text-4xl">{t({ zh: '阶段与里程碑', en: 'Phases & milestones' })}</h2>
            <p className="mt-3 text-agentrix-fog">
              {t({ zh: '从 V3 架构到 V4 商店上架，已经验证一个端到端的循环。', en: 'V3 architecture to V4 store submission — a closed end-to-end loop.' })}
            </p>
          </div>
          <div className="space-y-6">
            {TRACTION.map((row) => (
              <div key={row.quarter} className="grid gap-4 md:grid-cols-[180px_1fr] md:items-start">
                <div className="text-sm font-bold uppercase tracking-wider text-amber-400">
                  {row.quarter}
                </div>
                <ul className="space-y-2">
                  {row.milestones.map((m, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-agentrix-fog">
                      <span className="mt-1.5 inline-block h-1.5 w-1.5 rounded-full bg-amber-400" />
                      <span>{t(m)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Use of funds */}
      <section className="bg-agentrix-ink py-20">
        <div className="container mx-auto max-w-3xl px-6">
          <h2 className="text-3xl font-bold md:text-4xl text-center">
            {t({ zh: '资金用途', en: 'Use of funds' })}
          </h2>
          <p className="mt-3 text-center text-agentrix-fog">
            {t({
              zh: '我们正在融资以加速 GA 后扩张：',
              en: 'We are raising to accelerate post-GA expansion:',
            })}
          </p>
          <ul className="mt-8 space-y-3">
            {ASKS.map((a, i) => (
              <li key={i} className="flex items-start gap-3 rounded-xl border border-agentrix-inkLine bg-agentrix-inkSoft p-4">
                <span className="mt-0.5 inline-flex h-6 w-6 items-center justify-center rounded-full bg-amber-400/15 text-xs font-bold text-amber-300">{i + 1}</span>
                <span className="text-sm text-agentrix-fog">{t(a)}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* Contact */}
      <section className="border-t border-agentrix-inkLine bg-agentrix-inkSoft py-16">
        <div className="container mx-auto max-w-2xl px-6 text-center">
          <Briefcase size={32} className="mx-auto mb-4 text-agentrix-electric" />
          <h2 className="text-2xl font-bold md:text-3xl">
            {t({ zh: '想聊聊？', en: "Let's talk" })}
          </h2>
          <p className="mt-3 text-agentrix-fog">
            {t({
              zh: '深度沟通走邮件或 Telegram。我们会在 48 小时内回复。',
              en: 'Reach us via email or Telegram. We reply within 48h.',
            })}
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <a
              href="mailto:investors@agentrix.top?subject=Investment Inquiry"
              className="inline-flex items-center gap-2 rounded-full bg-amber-400 px-6 py-3 text-sm font-bold text-agentrix-ink hover:opacity-90"
            >
              <Mail size={14} /> investors@agentrix.top
            </a>
            <a
              href="https://t.me/agentrix"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-full border border-agentrix-inkLine bg-white/5 px-6 py-3 text-sm font-semibold text-white hover:bg-white/10"
            >
              📨 Telegram
            </a>
            <Link
              href="/blog"
              className="inline-flex items-center gap-2 rounded-full border border-agentrix-inkLine bg-white/5 px-6 py-3 text-sm font-semibold text-white hover:bg-white/10"
            >
              <FileText size={14} /> {t({ zh: '博客', en: 'Blog' })}
              <ArrowRight size={14} />
            </Link>
          </div>
        </div>
      </section>
    </MarketingLayout>
  );
}
