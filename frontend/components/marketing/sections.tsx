import Link from 'next/link';
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
              zh: 'Agentrix v3 · Living Agent / Doer / Economy 三层愿景上线',
              en: 'Agentrix v3 — Living Agent / Doer / Economy now live',
            })}
          </div>
          <h1 className="text-4xl font-extrabold leading-tight md:text-6xl md:leading-[1.05]">
            {t({
              zh: '一只 Agent，',
              en: 'One agent.',
            })}
            <br />
            <span className="bg-gradient-to-r from-agentrix-purpleSoft via-agentrix-electric to-agentrix-solar bg-clip-text text-transparent">
              {t({
                zh: '陪你 · 帮你 · 替你赚钱',
                en: 'With you. For you. Earning for you.',
              })}
            </span>
          </h1>
          <p className="mt-6 text-base leading-relaxed text-agentrix-fog md:text-lg">
            {t({
              zh: '从 Mobile 主宠到 Desktop 工作台，再到 Web 账户中心、Watch 提醒、Server Auto-Earn —— 同一个 Agent，跨 5 端无缝陪伴、执行任务、自动结算收益。',
              en: 'From Mobile companion to Desktop workspace, Web console, Watch glance, Server Auto-Earn — the same Agent across 5 surfaces. Companions you, executes for you, settles earnings automatically.',
            })}
          </p>
          <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link
              href="/auth/login?next=/console/dashboard"
              className="inline-flex items-center gap-2 rounded-full bg-agentrix-solar px-7 py-3 text-sm font-bold text-agentrix-ink shadow-lg shadow-agentrix-solar/30 transition-transform hover:-translate-y-0.5"
            >
              {t({ zh: '免费开始', en: 'Start free' })}
              <ArrowRight size={16} />
            </Link>
            <Link
              href="/manifesto"
              className="inline-flex items-center gap-2 rounded-full border border-agentrix-inkLine px-7 py-3 text-sm font-semibold text-white transition-colors hover:border-agentrix-electric hover:text-agentrix-electric"
            >
              {t({ zh: '阅读三层愿景', en: 'Read the manifesto' })}
            </Link>
          </div>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-xs text-agentrix-mist">
            <span className="inline-flex items-center gap-1">
              <ShieldCheck size={14} className="text-agentrix-electric" />
              {t({ zh: 'MPC 三方分片，签名永远在 Mobile', en: 'MPC 3-share, signing on Mobile only' })}
            </span>
            <span className="inline-flex items-center gap-1">
              <Wallet size={14} className="text-agentrix-solar" />
              {t({ zh: 'X402 链上结算', en: 'X402 on-chain settlement' })}
            </span>
            <span className="inline-flex items-center gap-1">
              <Sparkles size={14} className="text-agentrix-purpleSoft" />
              {t({ zh: '6 大模型供应商', en: '6 LLM providers' })}
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

// ---------- Section: Pricing ----------

export interface PricingTier {
  name: { zh: string; en: string };
  price: { zh: string; en: string };
  unit: { zh: string; en: string };
  description: { zh: string; en: string };
  features: Array<{ zh: string; en: string }>;
  cta: { zh: string; en: string };
  ctaHref: string;
  highlight?: boolean;
}

export const PRICING_TIERS: PricingTier[] = [
  {
    name: { zh: 'Free', en: 'Free' },
    price: { zh: '$0', en: '$0' },
    unit: { zh: '永久免费', en: 'Forever free' },
    description: { zh: '体验 Living Agent 与基础 Skill。', en: 'Experience Living Agent and basic Skills.' },
    features: [
      { zh: '1 个 Living Agent · 基础人格', en: '1 Living Agent · base persona' },
      { zh: '免费模型每日额度', en: 'Free model daily quota' },
      { zh: '5 端登录（无 Auto-Earn）', en: 'Login on all 5 surfaces (no Auto-Earn)' },
      { zh: '社区 Skill 试用', en: 'Try community Skills' },
    ],
    cta: { zh: '免费开始', en: 'Start free' },
    ctaHref: '/invite',
  },
  {
    name: { zh: 'Pro', en: 'Pro' },
    price: { zh: '$20', en: '$20' },
    unit: { zh: '/ 月', en: '/ month' },
    description: { zh: '解锁 Live2D-3D、Worktree 并行、Auto-Earn。', en: 'Unlock Live2D-3D, parallel worktrees, Auto-Earn.' },
    features: [
      { zh: '3 个 Living Agent', en: '3 Living Agents' },
      { zh: 'Claude / GPT / Gemini Pro 模型', en: 'Claude / GPT / Gemini Pro models' },
      { zh: 'Auto-Earn + X402 微支付', en: 'Auto-Earn + X402 micropay' },
      { zh: 'Skill 市场分润', en: 'Skill marketplace revenue share' },
      { zh: '优先支持', en: 'Priority support' },
    ],
    cta: { zh: '升级 Pro', en: 'Upgrade to Pro' },
    ctaHref: '/invite?plan=pro',
    highlight: true,
  },
  {
    name: { zh: 'Team', en: 'Team' },
    price: { zh: '$50', en: '$50' },
    unit: { zh: '/ 席位 / 月', en: '/ seat / month' },
    description: { zh: '团队共享 Skill 与任务集市分润。', en: 'Team-shared Skills & task marketplace revenue.' },
    features: [
      { zh: '不限 Agent 数', en: 'Unlimited Agents' },
      { zh: '团队 Skill 仓库', en: 'Team Skill repo' },
      { zh: '统一计费 + 财务报表', en: 'Unified billing + finance reports' },
      { zh: 'SSO / 角色权限', en: 'SSO / role permissions' },
    ],
    cta: { zh: '试用 Team', en: 'Try Team' },
    ctaHref: '/invite?plan=team',
  },
  {
    name: { zh: 'Enterprise', en: 'Enterprise' },
    price: { zh: '联系我们', en: 'Contact us' },
    unit: { zh: '定制', en: 'Custom' },
    description: { zh: '私有部署、合规审计、专属模型。', en: 'Private deploy, compliance audit, dedicated models.' },
    features: [
      { zh: '私有云 / VPC 部署', en: 'Private cloud / VPC deploy' },
      { zh: 'MPC HSM 托管', en: 'MPC HSM custody' },
      { zh: 'SLA 99.95% + 7×24', en: 'SLA 99.95% + 7×24 support' },
      { zh: '专属 SA + 培训', en: 'Dedicated SA + training' },
    ],
    cta: { zh: '联系销售', en: 'Contact sales' },
    ctaHref: 'mailto:enterprise@agentrix.top',
  },
];

export function PricingTable() {
  const { t } = useLocalization();
  return (
    <section className="bg-agentrix-ink py-20">
      <div className="container mx-auto px-6">
        <div className="mx-auto mb-12 max-w-2xl text-center">
          <h2 className="text-3xl font-bold md:text-4xl">
            {t({ zh: '简单透明的定价', en: 'Simple, transparent pricing' })}
          </h2>
          <p className="mt-3 text-agentrix-fog">
            {t({
              zh: '免费体验全部三层愿景；Pro 解锁 Auto-Earn；Team 分享技能；Enterprise 满足合规。',
              en: 'Free for the full three-layer vision. Pro unlocks Auto-Earn. Team shares skills. Enterprise covers compliance.',
            })}
          </p>
        </div>
        <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-4">
          {PRICING_TIERS.map((tier) => (
            <div
              key={tier.name.en}
              className={`relative flex flex-col rounded-2xl border p-6 transition-transform ${
                tier.highlight
                  ? 'border-agentrix-electric bg-gradient-to-b from-agentrix-electric/10 to-agentrix-purple/10 shadow-2xl shadow-agentrix-electric/20 md:-translate-y-2'
                  : 'border-agentrix-inkLine bg-agentrix-inkSoft'
              }`}
            >
              {tier.highlight && (
                <span className="absolute -top-3 left-6 rounded-full bg-agentrix-solar px-3 py-1 text-xs font-bold text-agentrix-ink">
                  {t({ zh: '推荐', en: 'Most popular' })}
                </span>
              )}
              <h3 className="text-lg font-bold text-white">{t(tier.name)}</h3>
              <div className="mt-4 flex items-end gap-1">
                <span className="text-4xl font-extrabold text-white">{t(tier.price)}</span>
                <span className="pb-1 text-xs text-agentrix-mist">{t(tier.unit)}</span>
              </div>
              <p className="mt-3 text-sm text-agentrix-fog">{t(tier.description)}</p>
              <ul className="mt-5 flex-1 space-y-2 text-sm text-agentrix-fog">
                {tier.features.map((f) => (
                  <li key={f.en} className="flex items-start gap-2">
                    <Check size={14} className="mt-0.5 shrink-0 text-agentrix-electric" />
                    <span>{t(f)}</span>
                  </li>
                ))}
              </ul>
              <Link
                href={tier.ctaHref}
                className={`mt-6 inline-flex items-center justify-center rounded-full px-5 py-2.5 text-sm font-bold transition-opacity hover:opacity-90 ${
                  tier.highlight
                    ? 'bg-agentrix-solar text-agentrix-ink'
                    : 'bg-white/10 text-white hover:bg-white/15'
                }`}
              >
                {t(tier.cta)}
              </Link>
            </div>
          ))}
        </div>
        <p className="mt-8 text-center text-xs text-agentrix-mist">
          {t({
            zh: '所有付费计划支持 7 天无理由退款。Stripe 上线前请使用邀请码体验。',
            en: 'All paid plans include a 7-day refund. Use an invite code until Stripe goes live.',
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


