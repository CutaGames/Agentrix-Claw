/**
 * Three-Layer Vision — Living / Doer / Economy.
 */
import { Heart, Briefcase, TrendingUp, Check } from 'lucide-react';
import { useLocalization } from '../../../contexts/LocalizationContext';

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
