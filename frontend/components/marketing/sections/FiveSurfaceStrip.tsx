/**
 * Five Surfaces strip — Mobile / Desktop / Web / Watch / Server.
 */
import { Smartphone, Monitor, Globe2, Watch, Server } from 'lucide-react';
import { useLocalization } from '../../../contexts/LocalizationContext';

const SURFACES = [
  { icon: Smartphone, key: 'mobile',  label: { zh: 'Mobile · 主宠 + 钱包', en: 'Mobile · Companion + Wallet' }, desc: { zh: 'Live2D 陪伴、X402 签名、Push 审批', en: 'Live2D, X402 signing, push approval' } },
  { icon: Monitor,    key: 'desktop', label: { zh: 'Desktop · 工作台',      en: 'Desktop · Workspace' },         desc: { zh: '多 Worktree、Skill Canvas、Live3D', en: 'Multi-worktree, Skill Canvas, Live3D' } },
  { icon: Globe2,     key: 'web',     label: { zh: 'Web · Console',          en: 'Web · Console' },               desc: { zh: '账户、计费、生态市场',              en: 'Account, billing, marketplace' } },
  { icon: Watch,      key: 'wear',    label: { zh: 'Watch · 一瞥',            en: 'Watch · Glance' },              desc: { zh: '提醒、审批、心情',                  en: 'Reminders, approval, mood' } },
  { icon: Server,     key: 'server',  label: { zh: 'Server · Auto-Earn',     en: 'Server · Auto-Earn' },          desc: { zh: '7×24 接单 / 结算 / 复投',           en: '7×24 accept · settle · reinvest' } },
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
