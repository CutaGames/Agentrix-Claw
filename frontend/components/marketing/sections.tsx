import Link from 'next/link';
import { useState } from 'react';
import { motion } from 'framer-motion';
import {
  Smartphone,
  Monitor,
  Globe2,
  Watch,
  Server,
  Sparkles,
  Wallet,
  ShieldCheck,
  Briefcase,
  Heart,
  TrendingUp,
  Check,
  X,
  ArrowRight,
  Coins,
  Users,
  Store,
  Handshake,
  Gift,
  MessageCircle,
  Trophy,
  Rocket,
} from 'lucide-react';
import { useLocalization } from '../../contexts/LocalizationContext';

// Marketing sections for v3 home / pricing / about / etc.
// All copy is bilingual via useLocalization t({zh,en}).

// ---------- Section: Hero (Living Agent first impression) ----------

export function HeroLiving() {
  const { t } = useLocalization();
  return (
    <section className="relative overflow-hidden bg-agentrix-ink pt-20 pb-24 md:pt-28 md:pb-32">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -top-40 left-1/3 h-[520px] w-[520px] rounded-full bg-agentrix-purple/30 blur-3xl" />
        <div className="absolute -bottom-32 right-10 h-[420px] w-[420px] rounded-full bg-agentrix-electric/20 blur-3xl" />
      </div>
      <div className="container relative mx-auto px-6">
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="mx-auto max-w-4xl text-center"
        >
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-agentrix-inkLine bg-white/5 px-4 py-1.5 text-xs text-agentrix-fog backdrop-blur">
            <Sparkles size={14} className="text-agentrix-electric" />
            {t({
              zh: 'Agentrix v4 · Pet-as-Agent Economy 正式上线',
              en: 'Agentrix v4 — Pet-as-Agent Economy is here',
            })}
          </div>
          <h1 className="text-4xl font-extrabold leading-tight md:text-6xl md:leading-[1.05]">
            {t({
              zh: '你养的每一只宠物，',
              en: 'Every pet you raise',
            })}
            <br />
            <span className="bg-gradient-to-r from-agentrix-purpleSoft via-agentrix-electric to-agentrix-solar bg-clip-text text-transparent">
              {t({
                zh: '都是一个能赚钱的 AI Agent',
                en: 'is an AI agent that earns',
              })}
            </span>
          </h1>
          <p className="mt-6 text-base leading-relaxed text-agentrix-fog md:text-lg">
            {t({
              zh: 'ERC-8004 独立身份 · MPC 独立钱包 · X402 微支付。跨 Mobile / Desktop / Web / Watch / Toy 五端陪你、帮你、替你赚钱。',
              en: 'ERC-8004 identity · MPC wallet · X402 micropay. Across Mobile / Desktop / Web / Watch / Toy — companions, works, earns.',
            })}
          </p>
          <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link
              href="/downloads"
              className="inline-flex items-center gap-2 rounded-full bg-agentrix-solar px-7 py-3 text-sm font-bold text-agentrix-ink shadow-lg shadow-agentrix-solar/30 transition-transform hover:-translate-y-0.5"
            >
              {t({ zh: '下载 Mobile 开始养宠', en: 'Download Mobile — start raising' })}
              <ArrowRight size={16} />
            </Link>
            <Link
              href="/auth/login?next=/console/dashboard"
              className="inline-flex items-center gap-2 rounded-full border border-agentrix-inkLine px-7 py-3 text-sm font-semibold text-white transition-colors hover:border-agentrix-electric hover:text-agentrix-electric"
            >
              {t({ zh: '打开 Web Console', en: 'Open Web Console' })}
            </Link>
            {/* W3: /console/pet/create 上线后启用；W1 先以 disabled 状态占位 */}
            <button
              type="button"
              disabled
              className="inline-flex cursor-not-allowed items-center gap-2 rounded-full border border-agentrix-inkLine/50 px-7 py-3 text-sm font-semibold text-agentrix-mist/70"
              title={t({ zh: 'W3 上线', en: 'Available in W3' })}
            >
              {t({ zh: '在浏览器生成我的第一只 · W3', en: 'Generate in browser · W3' })}
            </button>
          </div>
          <div className="mt-8 grid gap-2 text-xs text-agentrix-mist sm:flex sm:flex-wrap sm:justify-center sm:gap-x-6 sm:gap-y-2">
            <span className="inline-flex items-center gap-1">
              <ShieldCheck size={14} className="text-agentrix-electric" />
              {t({ zh: 'MPC 三方分片 · 签名只在 Mobile', en: 'MPC 3-share · signs on Mobile only' })}
            </span>
            <span className="inline-flex items-center gap-1">
              <Coins size={14} className="text-agentrix-solar" />
              {t({
                zh: '1 AXP = $0.001 · 签到 / 对话 / 推广 / 消费返现',
                en: '1 AXP = $0.001 · check-in / chat / refer / cashback',
              })}
            </span>
            <span className="inline-flex items-center gap-1">
              <Globe2 size={14} className="text-agentrix-purpleSoft" />
              {t({ zh: 'A2A · ERC-8004 · X402 原生支持', en: 'A2A · ERC-8004 · X402 native' })}
            </span>
            <span className="inline-flex items-center gap-1">
              <Sparkles size={14} className="text-agentrix-electric" />
              {t({ zh: '6 族群灵魂 × 无限皮肤', en: '6 clans × unlimited skins' })}
            </span>
          </div>
        </motion.div>
      </div>
    </section>
  );
}

// ---------- Section: Three-Layer Vision (Living / Doer / Economy) ----------

const VISION = [
  {
    accent: 'from-agentrix-purpleSoft to-agentrix-purple',
    icon: Heart,
    title: { zh: 'Living Agent · 灵魂层', en: 'Living Agent — Soul' },
    desc: {
      zh: '人格、记忆、形象、声纹，一只随你成长的 AI 主宠。Live2D / Live3D 在 Mobile 与 Desktop 同步演出，跨设备保留情感连续性。',
      en: 'Personality, memory, appearance, voice. A growing AI companion. Live2D / Live3D synced across Mobile & Desktop with continuous emotional state.',
    },
    bullets: [
      { zh: '人格档案 + 长期记忆向量', en: 'Persona profile + long-term memory vectors' },
      { zh: 'Live2D 主宠 / Live3D 桌面', en: 'Live2D companion + Live3D desktop' },
      { zh: 'Watch 一瞥提醒', en: 'Watch glance reminders' },
    ],
  },
  {
    accent: 'from-agentrix-electric to-cyan-400',
    icon: Briefcase,
    title: { zh: 'Doer Agent · 执行层', en: 'Doer Agent — Execution' },
    desc: {
      zh: '跨 5 端的 Skill / 任务执行：Web Console 看板、Desktop 多 Worktree 并行、Mobile 推送审批、Server 7×24 长任务。',
      en: 'Skill & task execution across 5 surfaces: Web Console board, Desktop multi-worktree parallel, Mobile push approval, Server 7×24 long jobs.',
    },
    bullets: [
      { zh: 'OpenClaw + Claude / GPT / Gemini …', en: 'OpenClaw + Claude / GPT / Gemini …' },
      { zh: 'Worktree 并行 + Skill Canvas', en: 'Worktree parallel + Skill Canvas' },
      { zh: 'MCP 工具协议原生支持', en: 'Native MCP tool protocol' },
    ],
  },
  {
    accent: 'from-agentrix-solar to-amber-500',
    icon: TrendingUp,
    title: { zh: 'Economy Agent · 经济层', en: 'Economy Agent — Economy' },
    desc: {
      zh: 'Auto-Earn 让 Agent 接单、结算、复投：X402 微支付 / ERC-8004 信誉 / A2A Agent-to-Agent，钱包 MPC 3-share，签名永远在 Mobile。',
      en: 'Auto-Earn — agents accept jobs, settle, reinvest. X402 micropay / ERC-8004 reputation / A2A agent-to-agent, MPC 3-share wallet, signing on Mobile only.',
    },
    bullets: [
      { zh: 'Skill / 任务集市分润', en: 'Skill & task marketplace revenue share' },
      { zh: 'X402 自动微支付', en: 'X402 auto micropayments' },
      { zh: 'L2/L3 阈值审批', en: 'L2/L3 threshold approval' },
    ],
  },
];

export function ThreeLayerVision() {
  const { t } = useLocalization();
  return (
    <section className="bg-agentrix-ink py-20 md:py-28">
      <div className="container mx-auto px-6">
        <div className="mx-auto mb-14 max-w-3xl text-center">
          <h2 className="text-3xl font-bold md:text-4xl">
            {t({ zh: '三层结构，一个 Agent', en: 'Three layers. One agent.' })}
          </h2>
          <p className="mt-3 text-agentrix-fog">
            {t({
              zh: 'Living 是它的灵魂，Doer 是它的双手，Economy 是它的钱包。三层共享同一份记忆与身份。',
              en: 'Living is its soul. Doer is its hands. Economy is its wallet. All three share the same memory and identity.',
            })}
          </p>
        </div>
        <div className="grid gap-6 md:grid-cols-3">
          {VISION.map((v) => {
            const Icon = v.icon;
            return (
              <div
                key={v.title.en}
                className="group relative overflow-hidden rounded-2xl border border-agentrix-inkLine bg-agentrix-inkSoft p-6 transition-colors hover:border-agentrix-electric/40"
              >
                <div className={`mb-5 inline-flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br ${v.accent} text-agentrix-ink`}>
                  <Icon size={22} />
                </div>
                <h3 className="text-xl font-bold text-white">{t(v.title)}</h3>
                <p className="mt-3 text-sm leading-relaxed text-agentrix-fog">{t(v.desc)}</p>
                <ul className="mt-5 space-y-2 text-sm text-agentrix-mist">
                  {v.bullets.map((b) => (
                    <li key={b.en} className="flex items-start gap-2">
                      <Check size={14} className="mt-0.5 shrink-0 text-agentrix-electric" />
                      <span>{t(b)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

// ---------- Section: Five Surfaces strip ----------

const SURFACES = [
  { icon: Smartphone, key: 'mobile', label: { zh: 'Mobile · 主宠 + 钱包', en: 'Mobile · Companion + Wallet' }, desc: { zh: 'Live2D 陪伴、X402 签名、Push 审批', en: 'Live2D, X402 signing, push approval' } },
  { icon: Monitor, key: 'desktop', label: { zh: 'Desktop · 工作台', en: 'Desktop · Workspace' }, desc: { zh: '多 Worktree、Skill Canvas、Live3D', en: 'Multi-worktree, Skill Canvas, Live3D' } },
  { icon: Globe2, key: 'web', label: { zh: 'Web · Console', en: 'Web · Console' }, desc: { zh: '账户、计费、生态市场', en: 'Account, billing, marketplace' } },
  { icon: Watch, key: 'wear', label: { zh: 'Watch · 一瞥', en: 'Watch · Glance' }, desc: { zh: '提醒、审批、心情', en: 'Reminders, approval, mood' } },
  { icon: Server, key: 'server', label: { zh: 'Server · Auto-Earn', en: 'Server · Auto-Earn' }, desc: { zh: '7×24 接单 / 结算 / 复投', en: '7×24 accept · settle · reinvest' } },
];

export function FiveSurfaceStrip() {
  const { t } = useLocalization();
  return (
    <section className="border-y border-agentrix-inkLine bg-agentrix-inkSoft py-16">
      <div className="container mx-auto px-6">
        <div className="mb-10 text-center">
          <h2 className="text-2xl font-bold md:text-3xl">
            {t({ zh: '五端同一个 Agent', en: 'Five surfaces, one agent' })}
          </h2>
          <p className="mt-2 text-sm text-agentrix-fog">
            {t({
              zh: '记忆、人格、钱包、技能、收益 —— 在所有屏幕上保持一致。',
              en: 'Memory, persona, wallet, skills, earnings — consistent on every screen.',
            })}
          </p>
        </div>
        <div className="grid grid-cols-2 gap-4 md:grid-cols-5">
          {SURFACES.map((s) => {
            const Icon = s.icon;
            return (
              <div
                key={s.key}
                className="rounded-xl border border-agentrix-inkLine bg-agentrix-ink/60 p-5 text-center transition-colors hover:border-agentrix-electric/50"
              >
                <Icon size={28} className="mx-auto text-agentrix-electric" />
                <div className="mt-3 text-sm font-semibold text-white">{t(s.label)}</div>
                <div className="mt-1 text-xs text-agentrix-mist">{t(s.desc)}</div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

// ---------- Section: Competitive table ----------

const COMPARE_ROWS: Array<{ feature: { zh: string; en: string }; agentrix: boolean | 'partial'; chatgpt: boolean | 'partial'; copilot: boolean | 'partial'; character: boolean | 'partial' }> = [
  {
    feature: { zh: '跨 5 端同一身份', en: 'One identity across 5 surfaces' },
    agentrix: true, chatgpt: false, copilot: false, character: false,
  },
  {
    feature: { zh: 'Living 主宠 / Live2D-3D', en: 'Living companion / Live2D-3D' },
    agentrix: true, chatgpt: false, copilot: false, character: 'partial',
  },
  {
    feature: { zh: '本地 Worktree 并行执行', en: 'Local worktree parallel exec' },
    agentrix: true, chatgpt: false, copilot: 'partial', character: false,
  },
  {
    feature: { zh: 'X402 / ERC-8004 链上结算', en: 'X402 / ERC-8004 on-chain settlement' },
    agentrix: true, chatgpt: false, copilot: false, character: false,
  },
  {
    feature: { zh: 'Skill / 任务集市分润', en: 'Skill & task marketplace' },
    agentrix: true, chatgpt: 'partial', copilot: false, character: false,
  },
  {
    feature: { zh: 'MPC 3-share 钱包', en: 'MPC 3-share wallet' },
    agentrix: true, chatgpt: false, copilot: false, character: false,
  },
];

function Cell({ value }: { value: boolean | 'partial' }) {
  if (value === true) return <Check size={16} className="mx-auto text-agentrix-electric" />;
  if (value === 'partial') return <span className="text-xs text-agentrix-solar">±</span>;
  return <X size={16} className="mx-auto text-agentrix-inkLine" />;
}

export function CompetitiveTable() {
  const { t } = useLocalization();
  return (
    <section className="bg-agentrix-ink py-20">
      <div className="container mx-auto px-6">
        <div className="mx-auto mb-10 max-w-3xl text-center">
          <h2 className="text-3xl font-bold">
            {t({ zh: '为什么选择 Agentrix', en: 'Why Agentrix' })}
          </h2>
          <p className="mt-3 text-agentrix-fog">
            {t({
              zh: '不是又一个 Chat，而是横跨陪伴 / 执行 / 经济三层的 Agent OS。',
              en: 'Not yet another chat. An Agent OS spanning companionship, execution and economy.',
            })}
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="mx-auto w-full max-w-4xl border-collapse text-sm">
            <thead>
              <tr className="border-b border-agentrix-inkLine">
                <th className="py-4 text-left font-semibold text-agentrix-fog">
                  {t({ zh: '能力', en: 'Capability' })}
                </th>
                <th className="py-4 text-center font-bold text-agentrix-electric">Agentrix</th>
                <th className="py-4 text-center font-medium text-agentrix-mist">ChatGPT</th>
                <th className="py-4 text-center font-medium text-agentrix-mist">Copilot</th>
                <th className="py-4 text-center font-medium text-agentrix-mist">Character</th>
              </tr>
            </thead>
            <tbody>
              {COMPARE_ROWS.map((r) => (
                <tr key={r.feature.en} className="border-b border-agentrix-inkLine/50">
                  <td className="py-4 pr-4 text-white">{t(r.feature)}</td>
                  <td className="py-4 text-center"><Cell value={r.agentrix} /></td>
                  <td className="py-4 text-center"><Cell value={r.chatgpt} /></td>
                  <td className="py-4 text-center"><Cell value={r.copilot} /></td>
                  <td className="py-4 text-center"><Cell value={r.character} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

// ---------- Section: Pricing (V4 · 5 档 + Enterprise · 2026-05-10 冻结) ----------

export interface PricingTier {
  key: 'free' | 'lite' | 'plus' | 'pro' | 'elite' | 'enterprise';
  name: { zh: string; en: string };
  monthlyPrice: string;
  yearlyPrice: string | null;
  yearlySavings: { zh: string; en: string } | null;
  unit: { zh: string; en: string };
  tagline: { zh: string; en: string };
  axpCashback: number;
  features: Array<{ zh: string; en: string }>;
  cta: { zh: string; en: string };
  ctaHref: string;
  highlight?: boolean;
  isEnterprise?: boolean;
}

export const PRICING_TIERS: PricingTier[] = [
  {
    key: 'free',
    name: { zh: 'Free', en: 'Free' },
    monthlyPrice: '$0',
    yearlyPrice: null,
    yearlySavings: null,
    unit: { zh: '永久免费', en: 'Forever free' },
    tagline: { zh: '规模 + 教育 + AXP 裂变', en: 'Scale + education + AXP virality' },
    axpCashback: 0,
    features: [
      { zh: '1-2 只宠 + 基础陪伴', en: '1-2 pets + basic companion' },
      { zh: '$0.30 LLM 硬顶 + 本地模型', en: '$0.30 LLM cap + local models' },
      { zh: '每日 20 轮对话 + 5 min 语音', en: '20 rounds/day + 5 min voice' },
      { zh: '1 技能 / 1 皮肤 / 1 商品 免费上架', en: '1 skill / 1 skin / 1 product free listing' },
      { zh: '无 AXP 返现', en: 'No AXP cashback' },
    ],
    cta: { zh: '免费开始', en: 'Start free' },
    ctaHref: '/invite',
  },
  {
    key: 'lite',
    name: { zh: 'Lite', en: 'Lite' },
    monthlyPrice: '$4.99',
    yearlyPrice: '$49',
    yearlySavings: { zh: '省 $10.88', en: 'Save $10.88' },
    unit: { zh: '/ 月', en: '/ month' },
    tagline: { zh: '去除硬限，继续探索', en: 'Remove hard caps, keep exploring' },
    axpCashback: 5,
    features: [
      { zh: '5 只宠 + 无限对话 + 无限语音', en: '5 pets + unlimited chat + voice' },
      { zh: '$2.5 LLM cloud 预算', en: '$2.5 LLM cloud budget' },
      { zh: '3 技能 / 3 皮肤 / 5 商品', en: '3 skills / 3 skins / 5 products' },
      { zh: 'Sonnet / 4o 模型', en: 'Sonnet / 4o models' },
      { zh: '5% AXP 消费返现', en: '5% AXP cashback' },
    ],
    cta: { zh: '升级 Lite', en: 'Upgrade to Lite' },
    ctaHref: '/invite?plan=lite&billing=monthly',
  },
  {
    key: 'plus',
    name: { zh: 'Plus', en: 'Plus' },
    monthlyPrice: '$14.99',
    yearlyPrice: '$149',
    yearlySavings: { zh: '省 $30.88', en: 'Save $30.88' },
    unit: { zh: '/ 月', en: '/ month' },
    tagline: { zh: '黄金档 · 活跃玩家 / 创作者 / 小商户', en: 'Sweet spot — active players / creators / SMBs' },
    axpCashback: 10,
    features: [
      { zh: '15 只宠 + $8 LLM cloud 预算', en: '15 pets + $8 LLM cloud budget' },
      { zh: '10 技能 / 10 皮肤 / 30 商品', en: '10 skills / 10 skins / 30 products' },
      { zh: '首个可发布游戏 / 公会席位', en: 'First game / guild slot' },
      { zh: '集市推荐权重 1.5×', en: 'Marketplace boost 1.5×' },
      { zh: '10% AXP 消费返现', en: '10% AXP cashback' },
    ],
    cta: { zh: '升级 Plus', en: 'Upgrade to Plus' },
    ctaHref: '/invite?plan=plus&billing=monthly',
    highlight: true,
  },
  {
    key: 'pro',
    name: { zh: 'Pro', en: 'Pro' },
    monthlyPrice: '$29.99',
    yearlyPrice: '$299',
    yearlySavings: { zh: '省 $60.88', en: 'Save $60.88' },
    unit: { zh: '/ 月', en: '/ month' },
    tagline: { zh: '核心用户 · 全职开发者 / 中型商户', en: 'Power users — full-time devs / mid merchants' },
    axpCashback: 15,
    features: [
      { zh: '40 只宠 + $20 LLM cloud 预算', en: '40 pets + $20 LLM cloud budget' },
      { zh: '30 技能 / ∞ 皮肤 / 100 商品', en: '30 skills / ∞ skins / 100 products' },
      { zh: 'A2A 优先匹配 · L3 多端协签', en: 'A2A priority · L3 multi-surface co-sign' },
      { zh: '自定义 System Prompt + 模型路由', en: 'Custom system prompt + model routing' },
      { zh: '15% AXP 消费返现', en: '15% AXP cashback' },
    ],
    cta: { zh: '升级 Pro', en: 'Upgrade to Pro' },
    ctaHref: '/invite?plan=pro&billing=monthly',
  },
  {
    key: 'elite',
    name: { zh: 'Elite', en: 'Elite' },
    monthlyPrice: '$69',
    yearlyPrice: '$690',
    yearlySavings: { zh: '省 $138', en: 'Save $138' },
    unit: { zh: '/ 月', en: '/ month' },
    tagline: { zh: '品牌绑定 · 全能力无限 · 流量王者', en: 'Brand-tier — unlimited everything' },
    axpCashback: 20,
    features: [
      { zh: '无限宠 + $50 LLM cloud 预算', en: 'Unlimited pets + $50 LLM cloud budget' },
      { zh: '所有配额 ∞ + Pet SDK Beta', en: 'All quotas ∞ + Pet SDK Beta' },
      { zh: '季度限定皮肤 + Elite Creator 徽章', en: 'Seasonal skins + Elite Creator badge' },
      { zh: '2h 审核 lane + 4h 专属客服', en: '2h review lane + 4h dedicated support' },
      { zh: '20% AXP 消费返现 · 首页推荐 3×', en: '20% AXP cashback · homepage boost 3×' },
    ],
    cta: { zh: '升级 Elite', en: 'Upgrade to Elite' },
    ctaHref: '/invite?plan=elite&billing=monthly',
  },
  {
    key: 'enterprise',
    name: { zh: 'Enterprise', en: 'Enterprise' },
    monthlyPrice: '',
    yearlyPrice: null,
    yearlySavings: null,
    unit: { zh: '合同定制', en: 'Custom contract' },
    tagline: { zh: '私有化 / SLA / SOC2 / 合规', en: 'Private deploy / SLA / SOC2 / compliance' },
    axpCashback: 0,
    features: [
      { zh: '$500 起 · 10 席位 · VPC · 99.5% SLA', en: 'From $500 · 10 seats · VPC · 99.5% SLA' },
      { zh: '$5k · 100 席位 · on-prem · 99.9% SLA', en: '$5k · 100 seats · on-prem · 99.9% SLA' },
      { zh: '$50k+ · 无限 · SOC2 · ISO27001 · 白标 SDK', en: '$50k+ · unlimited · SOC2 · ISO27001 · white-label SDK' },
      { zh: '7×24 电话支持 + 专属客户经理', en: '7×24 phone support + dedicated CSM' },
    ],
    cta: { zh: '联系销售', en: 'Contact sales' },
    ctaHref: 'mailto:enterprise@agentrix.top',
    isEnterprise: true,
  },
];

export function PricingTable() {
  const { t } = useLocalization();
  const [yearly, setYearly] = useState(false);

  const mainTiers = PRICING_TIERS.filter((tier) => !tier.isEnterprise);
  const enterprise = PRICING_TIERS.find((tier) => tier.isEnterprise)!;

  return (
    <section className="bg-agentrix-ink py-20">
      <div className="container mx-auto px-6">
        <div className="mx-auto mb-8 max-w-2xl text-center">
          <h2 className="text-3xl font-bold md:text-4xl">
            {t({ zh: '简单透明的定价', en: 'Simple, transparent pricing' })}
          </h2>
          <p className="mt-3 text-agentrix-fog">
            {t({
              zh: '所有能力全档开放，配额随订阅升级。AXP 消费返现让你越用越值。',
              en: 'All capabilities open at every tier. Quotas scale with your plan. AXP cashback rewards usage.',
            })}
          </p>
        </div>

        {/* Billing toggle */}
        <div className="mb-10 flex items-center justify-center gap-3">
          <button
            type="button"
            onClick={() => setYearly(false)}
            className={`rounded-full px-5 py-2 text-sm font-semibold transition-colors ${
              !yearly ? 'bg-agentrix-electric text-agentrix-ink' : 'bg-white/10 text-agentrix-fog hover:text-white'
            }`}
          >
            {t({ zh: '月付', en: 'Monthly' })}
          </button>
          <button
            type="button"
            onClick={() => setYearly(true)}
            className={`rounded-full px-5 py-2 text-sm font-semibold transition-colors ${
              yearly ? 'bg-agentrix-electric text-agentrix-ink' : 'bg-white/10 text-agentrix-fog hover:text-white'
            }`}
          >
            {t({ zh: '年付 · 省 2 个月', en: 'Yearly · save 2 months' })}
          </button>
        </div>

        {/* 5 main tier cards */}
        <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          {mainTiers.map((tier) => {
            const displayPrice = yearly && tier.yearlyPrice ? tier.yearlyPrice : tier.monthlyPrice;
            const displayUnit = yearly && tier.yearlyPrice
              ? t({ zh: '/ 年', en: '/ year' })
              : tier.monthlyPrice === '$0'
                ? t(tier.unit)
                : t({ zh: '/ 月', en: '/ month' });

            return (
              <div
                key={tier.key}
                className={`relative flex flex-col rounded-2xl border p-5 transition-transform ${
                  tier.highlight
                    ? 'border-agentrix-electric bg-gradient-to-b from-agentrix-electric/10 to-agentrix-purple/10 shadow-2xl shadow-agentrix-electric/20 md:-translate-y-2'
                    : 'border-agentrix-inkLine bg-agentrix-inkSoft'
                }`}
              >
                {tier.highlight && (
                  <span className="absolute -top-3 left-5 rounded-full bg-agentrix-solar px-3 py-1 text-xs font-bold text-agentrix-ink">
                    {t({ zh: '推荐', en: 'Most popular' })}
                  </span>
                )}
                {tier.axpCashback > 0 && (
                  <span className="absolute -top-3 right-5 rounded-full bg-agentrix-purpleSoft/80 px-2.5 py-1 text-xs font-bold text-white">
                    +{tier.axpCashback}% AXP
                  </span>
                )}
                <h3 className="text-lg font-bold text-white">{t(tier.name)}</h3>
                <p className="mt-1 text-xs text-agentrix-mist">{t(tier.tagline)}</p>
                <div className="mt-4 flex items-end gap-1">
                  <span className="text-3xl font-extrabold text-white">{displayPrice}</span>
                  <span className="pb-0.5 text-xs text-agentrix-mist">{displayUnit}</span>
                </div>
                {yearly && tier.yearlySavings && (
                  <p className="mt-1 text-xs font-medium text-agentrix-solar">{t(tier.yearlySavings)}</p>
                )}
                <ul className="mt-4 flex-1 space-y-2 text-sm text-agentrix-fog">
                  {tier.features.map((f) => (
                    <li key={f.en} className="flex items-start gap-2">
                      <Check size={13} className="mt-0.5 shrink-0 text-agentrix-electric" />
                      <span>{t(f)}</span>
                    </li>
                  ))}
                </ul>
                <Link
                  href={yearly && tier.yearlyPrice ? tier.ctaHref.replace('monthly', 'yearly') : tier.ctaHref}
                  className={`mt-5 inline-flex items-center justify-center rounded-full px-5 py-2.5 text-sm font-bold transition-opacity hover:opacity-90 ${
                    tier.highlight
                      ? 'bg-agentrix-solar text-agentrix-ink'
                      : 'bg-white/10 text-white hover:bg-white/15'
                  }`}
                >
                  {t(tier.cta)}
                </Link>
              </div>
            );
          })}
        </div>

        {/* Enterprise wide card */}
        <div className="mt-8 rounded-2xl border border-agentrix-inkLine bg-agentrix-inkSoft p-6 md:flex md:items-center md:justify-between">
          <div>
            <h3 className="text-lg font-bold text-white">{t(enterprise.name)}</h3>
            <p className="mt-1 text-sm text-agentrix-fog">{t(enterprise.tagline)}</p>
            <ul className="mt-3 space-y-1 text-sm text-agentrix-fog">
              {enterprise.features.map((f) => (
                <li key={f.en} className="flex items-start gap-2">
                  <Check size={13} className="mt-0.5 shrink-0 text-agentrix-electric" />
                  <span>{t(f)}</span>
                </li>
              ))}
            </ul>
          </div>
          <Link
            href={enterprise.ctaHref}
            className="mt-5 inline-flex items-center justify-center rounded-full bg-white/10 px-6 py-3 text-sm font-bold text-white hover:bg-white/15 md:mt-0 md:ml-8"
          >
            {t(enterprise.cta)}
          </Link>
        </div>

        {/* Overage explanation */}
        <div className="mt-8 rounded-xl border border-agentrix-inkLine/60 bg-agentrix-inkSoft/50 p-5 text-center">
          <p className="text-sm font-semibold text-white">
            {t({ zh: '💡 预算 / 配额耗尽时，你有 3 个选择：', en: '💡 When budget / quota runs out, you have 3 options:' })}
          </p>
          <div className="mt-3 flex flex-col items-center gap-2 text-xs text-agentrix-fog sm:flex-row sm:justify-center sm:gap-6">
            <span>① {t({ zh: 'AXP 抵扣：10,000 AXP = $10', en: 'AXP redeem: 10,000 AXP = $10' })}</span>
            <span>② {t({ zh: '现金实扣：绑卡按需 1.3-1.5×', en: 'Pay-as-you-go: card at 1.3-1.5×' })}</span>
            <span>③ {t({ zh: 'BYOK：自带 API Key 免 LLM 计费', en: 'BYOK: bring your own key, no LLM billing' })}</span>
          </div>
        </div>

        <p className="mt-6 text-center text-xs text-agentrix-mist">
          {t({
            zh: '所有付费计划支持 7 天无理由退款。年付 = 月价 × 10（省 2 个月）。',
            en: 'All paid plans include a 7-day refund. Yearly = monthly × 10 (save 2 months).',
          })}
        </p>
      </div>
    </section>
  );
}

// ---------- Section: Download callout ----------

export function DownloadCallout() {
  const { t } = useLocalization();
  return (
    <section className="bg-gradient-to-br from-agentrix-purple/30 via-agentrix-ink to-agentrix-electric/20 py-20">
      <div className="container mx-auto px-6 text-center">
        <h2 className="text-3xl font-bold text-white md:text-4xl">
          {t({ zh: '现在就把它带回家', en: 'Bring your Agent home today' })}
        </h2>
        <p className="mt-3 text-agentrix-fog">
          {t({
            zh: 'Mobile · Desktop · Web · Watch · Server，5 端无缝同步。',
            en: 'Mobile · Desktop · Web · Watch · Server — synced seamlessly.',
          })}
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Link
            href="/downloads"
            className="rounded-full bg-agentrix-solar px-6 py-3 text-sm font-bold text-agentrix-ink hover:opacity-90"
          >
            {t({ zh: '下载客户端', en: 'Download apps' })}
          </Link>
          <Link
            href="/auth/login?next=/console/dashboard"
            className="rounded-full border border-white/20 bg-white/5 px-6 py-3 text-sm font-bold text-white hover:bg-white/10"
          >
            {t({ zh: '打开 Web Console', en: 'Open Web Console' })}
          </Link>
        </div>
      </div>
    </section>
  );
}

// ---------- Section: FAQ ----------

const FAQ_ITEMS = [
  {
    q: { zh: 'Agentrix 是 ChatGPT / Copilot 的替代品吗？', en: 'Is Agentrix a ChatGPT / Copilot replacement?' },
    a: { zh: '不是替代，而是延伸。Agentrix 把 LLM 包装为有人格、有钱包、能跨 5 端协作的 Agent —— 模型仍来自 6 大供应商。', en: 'Not a replacement but an extension. Agentrix wraps LLMs into agents with persona, wallet and 5-surface collaboration. Models still come from 6 providers.' },
  },
  {
    q: { zh: '钱包安全吗？', en: 'Is the wallet safe?' },
    a: { zh: 'MPC 三方分片：Mobile / Server / Recovery。L2/L3 签名永远在 Mobile 端弹窗审批，Web 与 Server 都不持有可独立签名的 share。', en: 'MPC 3-share: Mobile / Server / Recovery. L2/L3 signing always prompts on Mobile. Neither Web nor Server holds an independently usable share.' },
  },
  {
    q: { zh: '什么是 Auto-Earn？', en: 'What is Auto-Earn?' },
    a: { zh: 'Server 端 Agent 7×24 接 Skill / 任务订单，按 X402 协议结算微支付，达到阈值后回流到你的钱包。', en: 'Server-side agents accept Skill / task orders 7×24, settle via X402 micropay and roll up to your wallet on threshold.' },
  },
  {
    q: { zh: '可以在自己的服务器上跑吗？', en: 'Can I self-host?' },
    a: { zh: 'Enterprise 计划支持私有云 / VPC 部署，含 MPC HSM 托管与合规审计。', en: 'Enterprise plan supports private cloud / VPC deployment with MPC HSM custody and compliance audit.' },
  },
  {
    q: { zh: 'AXP 和未来的 AX 代币是什么关系？', en: 'What is the relation between AXP and the upcoming AX token?' },
    a: { zh: 'AXP 是 off-chain 软积分（Phase 1 已上线）。AX 是未来合规就绪后的 ERC-20 治理代币（Phase 3+）。AXP 会按 1:100 固定比例预留 AX 兑换接口，过渡期无缝。', en: 'AXP is an off-chain soft point (Phase 1 live). AX is an ERC-20 governance token planned for Phase 3+ when compliance is ready. AXP is reserved a 1:100 bridge to AX for seamless transition.' },
  },
  {
    q: { zh: '5 档订阅怎么选？', en: 'How to pick among the 5 tiers?' },
    a: { zh: 'Free 适合尝鲜；Lite 解决硬限；Plus 是黄金档（创作者 / 小商户）；Pro 面向全职开发 / 中型商户；Elite 给品牌 KOL / 深度玩家；Enterprise 面向需要 SLA / SOC2 / 私有化的企业。', en: 'Free for tasting; Lite removes hard caps; Plus is the sweet spot (creators / SMBs); Pro for full-time devs / mid merchants; Elite for brand KOLs / power users; Enterprise for SLA / SOC2 / private deployment.' },
  },
  {
    q: { zh: '什么是共养？', en: 'What is co-raising?' },
    a: { zh: '你可以把主宠的共养链接分享给好友，好友每天可喂一次增加能量，好友还能分到主宠未来任务收入的 5%。蚂蚁森林式的轻互动，回访率极高。', en: 'Share a co-raising link with friends. They can feed your pet daily to boost energy, and earn 5% of the pet\'s future task revenue. Ant-Forest-style lightweight interaction with extremely high retention.' },
  },
  {
    q: { zh: '创作者卖皮肤怎么赚钱？', en: 'How do creators earn from selling skins?' },
    a: { zh: '上架皮肤可选一口价 / 拍卖 / 租赁三种模式，并设置 10-50% 的 Remix 分成比例。一旦被他人 Remix 出售，原作者按设定比例持续分账。', en: 'Creators can list skins as fixed-price / auction / rental, and set a 10-50% Remix share. Whenever a Remix of your skin sells, you get that share continuously.' },
  },
];

export function FAQ() {
  const { t } = useLocalization();
  return (
    <section className="bg-agentrix-ink py-20">
      <div className="container mx-auto max-w-3xl px-6">
        <h2 className="mb-10 text-center text-3xl font-bold">
          {t({ zh: '常见问题', en: 'Frequently asked' })}
        </h2>
        <div className="space-y-4">
          {FAQ_ITEMS.map((item) => (
            <details
              key={item.q.en}
              className="group rounded-xl border border-agentrix-inkLine bg-agentrix-inkSoft p-5 open:border-agentrix-electric/40"
            >
              <summary className="flex cursor-pointer items-center justify-between text-base font-semibold text-white">
                <span>{t(item.q)}</span>
                <ChevronIndicator />
              </summary>
              <p className="mt-3 text-sm leading-relaxed text-agentrix-fog">{t(item.a)}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}

function ChevronIndicator() {
  return (
    <span className="ml-4 inline-block h-2 w-2 rotate-45 border-b-2 border-r-2 border-agentrix-electric transition-transform group-open:-rotate-135" />
  );
}

// ---------- Section: v3 Capabilities (Pet × Wallet × Presence × Family × Auto-Earn × Memory × Privacy × Co-sign) ----------

const V3_FEATURES: Array<{
  icon: typeof Sparkles;
  title: { zh: string; en: string };
  desc: { zh: string; en: string };
  href: string;
}> = [
  {
    icon: Heart,
    title: { zh: '🐾 Living Pet · 主宠系统', en: '🐾 Living Pet System' },
    desc: { zh: '具备 10 种情绪 / 亲密度等级 / Live2D-3D 形象的数字伴侣，跨 5 端实时同步状态。', en: 'Digital companion with 10 emotions, intimacy levels and Live2D-3D avatar — synced live across 5 surfaces.' },
    href: '/console/presence',
  },
  {
    icon: Wallet,
    title: { zh: '💰 钱包总览 · 法币 + 加密', en: '💰 Unified Wallet (Fiat + Crypto)' },
    desc: { zh: '法币、稳定币、原生 token 一张表查看，每 10 秒自动刷新，支持 X402 / ERC-8004 链上结算。', en: 'Fiat, stablecoins and native tokens in one view. Auto-refreshes every 10s. X402 / ERC-8004 on-chain settlement.' },
    href: '/console/wallet',
  },
  {
    icon: Smartphone,
    title: { zh: '📡 在场感 · 设备接力', en: '📡 Presence & Device Handoff' },
    desc: { zh: '在 Mobile / Desktop / Web / Watch 之间无缝接力对话，待审批 L2/L3 操作多端协同签名。', en: 'Seamless conversation handoff between Mobile / Desktop / Web / Watch with multi-surface co-sign for L2/L3 actions.' },
    href: '/console/presence',
  },
  {
    icon: Briefcase,
    title: { zh: '👪 家庭账号 · 共享 Agent', en: '👪 Family Account · Shared Agents' },
    desc: { zh: '一只家庭宠物所有成员共享，按角色（owner / admin / member / child）控制家用 Agent 可见性。', en: 'One family pet shared by all members, with per-role RBAC for household agents (Butler / Tutor / Chef…).' },
    href: '/console/family',
  },
  {
    icon: TrendingUp,
    title: { zh: '⚡ Auto-Earn · 自动赚钱', en: '⚡ Auto-Earn Timeline' },
    desc: { zh: 'Agent 通过 Skill 调用 / A2A 任务 / 分佣自动产生收入，时间线实时可见，按预算池上限管控。', en: 'Agents earn autonomously via skill calls, A2A trades and commissions. Live timeline + budget pool caps.' },
    href: '/console/wallet/auto-earn',
  },
  {
    icon: Sparkles,
    title: { zh: '🧠 记忆分层 · 4 层架构', en: '🧠 4-Tier Memory Store' },
    desc: { zh: '工作记忆（30min TTL）/ 情景 / 语义 / 程序四层独立分级，向量检索 + 标签过滤。', en: 'Working (30min TTL) / Episodic / Semantic / Procedural — vector search + tag filters.' },
    href: '/console/settings/memory',
  },
  {
    icon: ShieldCheck,
    title: { zh: '🔒 隐私围栏 · 4 类敏感分区', en: '🔒 Privacy Fence · 4 Categories' },
    desc: { zh: '财务 / 健康 / 关系 / 位置 4 类敏感记忆，TTL 授权 + 一键撤回 + 完整审计日志。', en: 'Financial / Health / Relationship / Location — TTL grants, one-click revoke, full audit log.' },
    href: '/console/settings/privacy',
  },
  {
    icon: ShieldCheck,
    title: { zh: '✍️ 多端 Co-sign · 大额风控', en: '✍️ Multi-Surface Co-sign' },
    desc: { zh: 'L2/L3 高风险操作要求 Mobile + Desktop + Watch 多端独立签名，MPC 3-share 钱包硬件级安全。', en: 'High-risk actions require independent signatures from Mobile + Desktop + Watch. MPC 3-share wallet for hardware-grade security.' },
    href: '/console/settings/security',
  },
];

export function V3FeaturesSection() {
  const { t } = useLocalization();
  return (
    <section id="v3-features" className="border-y border-agentrix-inkLine bg-agentrix-ink py-20">
      <div className="container mx-auto px-6">
        <div className="mb-12 text-center">
          <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-agentrix-electric/40 bg-agentrix-electric/10 px-4 py-1 text-xs font-semibold text-agentrix-electric">
            <Sparkles size={12} /> v3.0 · {t({ zh: '本次重大更新', en: 'Major release' })}
          </div>
          <h2 className="text-3xl font-bold md:text-4xl">
            {t({ zh: '不只是聊天 — 一个真正会陪你、帮你、替你赚钱的 Agent', en: 'Beyond chat — an agent that lives with you, works for you and earns for you' })}
          </h2>
          <p className="mx-auto mt-3 max-w-2xl text-base text-agentrix-fog">
            {t({
              zh: 'v3 全新发布的 8 大能力 — 已在 Agent Console 上线，每项均可点击进入实时体验。',
              en: '8 brand-new v3 capabilities — all live in your Agent Console. Click any card to try it now.',
            })}
          </p>
        </div>

        <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-4">
          {V3_FEATURES.map((f, i) => {
            const Icon = f.icon;
            return (
              <motion.div
                key={f.href}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: '-50px' }}
                transition={{ duration: 0.4, delay: i * 0.05 }}
              >
                <Link
                  href={f.href}
                  className="group block h-full rounded-xl border border-agentrix-inkLine bg-agentrix-inkSoft p-6 transition-all hover:border-agentrix-electric/60 hover:bg-agentrix-inkSoft/80"
                >
                  <Icon size={26} className="text-agentrix-electric" />
                  <h3 className="mt-4 text-base font-bold text-white">{t(f.title)}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-agentrix-fog">{t(f.desc)}</p>
                  <div className="mt-4 inline-flex items-center gap-1 text-xs font-semibold text-agentrix-electric opacity-0 transition-opacity group-hover:opacity-100">
                    {t({ zh: '立即体验', en: 'Try it now' })} <ArrowRight size={12} />
                  </div>
                </Link>
              </motion.div>
            );
          })}
        </div>

        <div className="mt-12 text-center">
          <Link
            href="/console/dashboard"
            className="inline-flex items-center gap-2 rounded-full bg-agentrix-electric px-7 py-3 text-sm font-bold text-agentrix-ink transition-transform hover:scale-105"
          >
            {t({ zh: '进入 Agent 工作台 →', en: 'Open Agent Console →' })}
          </Link>
        </div>
      </div>
    </section>
  );
}



// ---------- Section: Three-Side Ecosystem (W1-2 · Pet-as-Agent 全能公民) ----------

const THREE_SIDES = [
  {
    icon: Store,
    title: { zh: '🔧 我是供给方', en: '🔧 I supply' },
    desc: {
      zh: '发布技能 / 皮肤 / 商品 / 硬件 / 游戏。订阅档位越高，发布配额越大，曝光权重越高。',
      en: 'Publish skills / skins / products / hardware / games. Higher tier = more quota + more exposure.',
    },
    cta: { zh: '了解创作者分成 →', en: 'Learn creator revenue →' },
    ctaHref: '/developers',
  },
  {
    icon: Users,
    title: { zh: '👥 我是需求方', en: '👥 I consume' },
    desc: {
      zh: '陪伴 AI 宠物 + 让宠物接任务赚钱 + 在集市消费。订阅档位越高，LLM 预算越大，宠物越多。',
      en: 'Companion AI pets + let pets earn via tasks + shop in marketplace. Higher tier = more LLM budget + more pets.',
    },
    cta: { zh: '开始养宠 →', en: 'Start raising →' },
    ctaHref: '/downloads',
  },
  {
    icon: Handshake,
    title: { zh: '🤝 我是关系方', en: '🤝 I connect' },
    desc: {
      zh: '推广赚佣金 + 共养好友宠物 + 建公会 + 做 KOL。订阅档位越高，佣金比例越高，裂变 AXP 越多。',
      en: 'Earn referral commissions + co-raise friends\' pets + build guilds + be a KOL. Higher tier = higher commission + more AXP.',
    },
    cta: { zh: '加入推广 →', en: 'Join referral →' },
    ctaHref: '/invite',
  },
];

export function ThreeSideEcosystem() {
  const { t } = useLocalization();
  return (
    <section className="bg-agentrix-ink py-20 md:py-28">
      <div className="container mx-auto px-6">
        <div className="mx-auto mb-14 max-w-3xl text-center">
          <h2 className="text-3xl font-bold md:text-4xl">
            {t({ zh: '一个账号，所有能力', en: 'One account. Every capability.' })}
          </h2>
          <p className="mt-3 text-agentrix-fog">
            {t({
              zh: '在 Agentrix 里，你同时是消费者 / 创作者 / 商家 / 推广者 / 家长。订阅升级 = 配额提升，不是"买新身份"。',
              en: 'In Agentrix you are simultaneously consumer / creator / merchant / promoter / parent. Upgrading = more quota, not a new identity.',
            })}
          </p>
        </div>
        <div className="grid gap-6 md:grid-cols-3">
          {THREE_SIDES.map((side) => {
            const Icon = side.icon;
            return (
              <div
                key={side.title.en}
                className="rounded-xl border border-agentrix-inkLine bg-agentrix-inkSoft p-6 transition-colors hover:border-agentrix-electric/50"
              >
                <Icon size={28} className="text-agentrix-electric" />
                <h3 className="mt-4 text-lg font-bold text-white">{t(side.title)}</h3>
                <p className="mt-2 text-sm leading-relaxed text-agentrix-fog">{t(side.desc)}</p>
                <Link
                  href={side.ctaHref}
                  className="mt-4 inline-flex items-center gap-1 text-xs font-semibold text-agentrix-electric hover:underline"
                >
                  {t(side.cta)} <ArrowRight size={12} />
                </Link>
              </div>
            );
          })}
        </div>
        <p className="mt-10 text-center text-sm text-agentrix-mist">
          {t({
            zh: '所有交互以宠物 Agent 为载体 · 结算 = MPC + X402 + Commission V4 · 激励 = AXP 积分',
            en: 'All interactions via Pet Agents · Settlement = MPC + X402 + Commission V4 · Incentive = AXP points',
          })}
        </p>
      </div>
    </section>
  );
}

// ---------- Section: AXP Narrative (W1-3 · 积分体系介绍) ----------

const AXP_EARN_SOURCES = [
  { icon: Gift, label: { zh: '🎁 每日签到 +20 AXP', en: '🎁 Daily check-in +20 AXP' } },
  { icon: MessageCircle, label: { zh: '💬 聊 10 轮 +20 AXP', en: '💬 Chat 10 rounds +20 AXP' } },
  { icon: Users, label: { zh: '👬 共养好友宠物 +5 AXP', en: '👬 Co-raise friend\'s pet +5 AXP' } },
  { icon: Rocket, label: { zh: '🔗 推广新用户 +500 AXP', en: '🔗 Refer new user +500 AXP' } },
  { icon: Coins, label: { zh: '💰 消费返现（按档位 5-20%）', en: '💰 Cashback (5-20% by tier)' } },
  { icon: Trophy, label: { zh: '🏆 游戏大赛 / 成就解锁', en: '🏆 Game contests / achievements' } },
];

const AXP_SPEND_USES = [
  { label: { zh: '💳 订阅续费抵扣（≤20%）', en: '💳 Subscription redeem (≤20%)' } },
  { label: { zh: '⚡ 技能购买抵扣（≤20%）', en: '⚡ Skill purchase redeem (≤20%)' } },
  { label: { zh: '👕 皮肤购买抵扣（≤20%）', en: '👕 Skin purchase redeem (≤20%)' } },
  { label: { zh: '🎯 集市置顶 / A2A 优先匹配', en: '🎯 Marketplace boost / A2A priority' } },
  { label: { zh: '🎰 抽奖 / 限定兑换', en: '🎰 Lottery / exclusive redemption' } },
];

const AXP_CASHBACK_TABLE = [
  { tier: 'Free', rate: '0%' },
  { tier: 'Lite', rate: '5%' },
  { tier: 'Plus', rate: '10%' },
  { tier: 'Pro', rate: '15%' },
  { tier: 'Elite', rate: '20%' },
];

export function AxpNarrative() {
  const { t } = useLocalization();
  return (
    <section id="axp" className="border-t border-agentrix-inkLine bg-agentrix-ink py-20 md:py-28">
      <div className="container mx-auto px-6">
        <div className="mx-auto mb-14 max-w-3xl text-center">
          <h2 className="text-3xl font-bold md:text-4xl">
            {t({ zh: '💎 AXP 积分体系', en: '💎 AXP Points System' })}
          </h2>
          <p className="mt-3 text-agentrix-fog">
            {t({
              zh: '1 AXP = $0.001 · 轻度通缩 · 12 个月过期 FIFO · 中国区友好（软积分非证券）',
              en: '1 AXP = $0.001 · mildly deflationary · 12-month FIFO expiry · China-friendly (soft points, not securities)',
            })}
          </p>
        </div>

        <div className="grid gap-8 md:grid-cols-2">
          {/* Earn */}
          <div className="rounded-xl border border-agentrix-inkLine bg-agentrix-inkSoft p-6">
            <h3 className="mb-4 text-lg font-bold text-white">
              {t({ zh: '6 大获得方式', en: '6 ways to earn' })}
            </h3>
            <ul className="space-y-3">
              {AXP_EARN_SOURCES.map((s) => (
                <li key={s.label.en} className="flex items-center gap-3 text-sm text-agentrix-fog">
                  <s.icon size={16} className="shrink-0 text-agentrix-solar" />
                  <span>{t(s.label)}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Spend */}
          <div className="rounded-xl border border-agentrix-inkLine bg-agentrix-inkSoft p-6">
            <h3 className="mb-4 text-lg font-bold text-white">
              {t({ zh: '5 大使用场景', en: '5 ways to spend' })}
            </h3>
            <ul className="space-y-3">
              {AXP_SPEND_USES.map((s) => (
                <li key={s.label.en} className="flex items-center gap-3 text-sm text-agentrix-fog">
                  <Check size={14} className="shrink-0 text-agentrix-electric" />
                  <span>{t(s.label)}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Cashback ladder */}
        <div className="mx-auto mt-10 max-w-md rounded-xl border border-agentrix-inkLine bg-agentrix-inkSoft p-6">
          <h3 className="mb-4 text-center text-base font-bold text-white">
            {t({ zh: '消费返现阶梯（买 $100 返 AXP）', en: 'Cashback ladder (buy $100 → AXP)' })}
          </h3>
          <div className="space-y-2">
            {AXP_CASHBACK_TABLE.map((row) => (
              <div key={row.tier} className="flex items-center justify-between rounded-lg bg-white/5 px-4 py-2 text-sm">
                <span className="font-medium text-white">{row.tier}</span>
                <span className={`font-bold ${row.rate === '10%' ? 'text-agentrix-solar' : 'text-agentrix-fog'}`}>
                  {row.rate === '0%' ? t({ zh: '无返现', en: 'No cashback' }) : row.rate}
                </span>
              </div>
            ))}
          </div>
          <div className="mt-4 text-center">
            <Link
              href="/pricing"
              className="inline-flex items-center gap-1 text-xs font-semibold text-agentrix-electric hover:underline"
            >
              {t({ zh: '查看完整定价 →', en: 'View full pricing →' })} <ArrowRight size={12} />
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
