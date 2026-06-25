import { MarketingLayout } from '../components/marketing/MarketingLayout';
import { FiveSurfaceStrip } from '../components/marketing/sections';
import { buildSeo } from '../lib/seo';
import { useLocalization } from '../contexts/LocalizationContext';
import { Check, Minus } from 'lucide-react';

interface CapRow {
  cap: { zh: string; en: string };
  mobile: boolean;
  desktop: boolean;
  web: boolean;
  watch: boolean;
  server: boolean;
}

const ROWS: CapRow[] = [
  { cap: { zh: '人格 / 记忆同步', en: 'Persona / memory sync' }, mobile: true, desktop: true, web: true, watch: true, server: true },
  { cap: { zh: 'Live2D 主宠', en: 'Live2D companion' }, mobile: true, desktop: false, web: false, watch: false, server: false },
  { cap: { zh: 'Live3D 桌面伙伴', en: 'Live3D desktop pal' }, mobile: false, desktop: true, web: false, watch: false, server: false },
  { cap: { zh: '聊天与多模态', en: 'Chat & multi-modal' }, mobile: true, desktop: true, web: true, watch: false, server: true },
  { cap: { zh: 'Worktree 并行执行', en: 'Worktree parallel exec' }, mobile: false, desktop: true, web: false, watch: false, server: true },
  { cap: { zh: 'Skill Canvas', en: 'Skill Canvas' }, mobile: false, desktop: true, web: true, watch: false, server: false },
  { cap: { zh: 'MPC L1 钱包签名', en: 'MPC L1 signing' }, mobile: true, desktop: false, web: false, watch: false, server: false },
  { cap: { zh: 'L2/L3 阈值审批', en: 'L2/L3 threshold approval' }, mobile: true, desktop: false, web: false, watch: false, server: false },
  { cap: { zh: 'X402 微支付', en: 'X402 micropay' }, mobile: true, desktop: true, web: true, watch: false, server: true },
  { cap: { zh: 'Auto-Earn 7×24 接单', en: 'Auto-Earn 7×24' }, mobile: false, desktop: false, web: false, watch: false, server: true },
  { cap: { zh: '一瞥提醒 / 心情', en: 'Glance reminder / mood' }, mobile: false, desktop: false, web: false, watch: true, server: false },
  { cap: { zh: '账户 / 计费 / 报表', en: 'Account / billing / reports' }, mobile: false, desktop: false, web: true, watch: false, server: false },
];

const COLS = [
  { key: 'mobile', label: 'Mobile' },
  { key: 'desktop', label: 'Desktop' },
  { key: 'web', label: 'Web' },
  { key: 'watch', label: 'Watch' },
  { key: 'server', label: 'Server' },
] as const;

export default function FeaturesPage() {
  const { t } = useLocalization();
  const seo = buildSeo({
    title: t({ zh: '5 端能力矩阵 · Agentrix', en: '5-Surface Matrix · Agentrix' }),
    description: t({
      zh: 'Mobile / Desktop / Web / Watch / Server，每端的能力分布与协同逻辑。',
      en: 'Capability matrix across Mobile / Desktop / Web / Watch / Server.',
    }),
    path: '/features',
  });
  return (
    <MarketingLayout seo={seo}>
      <section className="bg-agentrix-ink py-20">
        <div className="container mx-auto max-w-5xl px-6">
          <div className="text-center">
            <h1 className="text-4xl font-extrabold md:text-5xl">{t({ zh: '5 端能力矩阵', en: 'Five-surface capability matrix' })}</h1>
            <p className="mt-4 text-agentrix-fog">{t({ zh: '每块屏幕只做最适合它的事，但共享同一身份与钱包。', en: 'Each screen does what it does best — yet they share the same identity and wallet.' })}</p>
          </div>
        </div>
      </section>

      <FiveSurfaceStrip />

      <section className="bg-agentrix-ink py-20">
        <div className="container mx-auto max-w-5xl px-6">
          <div className="overflow-x-auto rounded-2xl border border-agentrix-inkLine bg-agentrix-inkSoft">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-agentrix-inkLine">
                  <th className="p-4 text-left text-xs font-semibold uppercase text-agentrix-mist">
                    {t({ zh: '能力', en: 'Capability' })}
                  </th>
                  {COLS.map((c) => (
                    <th key={c.key} className="p-4 text-center text-xs font-semibold uppercase text-agentrix-mist">
                      {c.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {ROWS.map((r) => (
                  <tr key={r.cap.en} className="border-b border-agentrix-inkLine/40 last:border-b-0">
                    <td className="p-4 text-white">{t(r.cap)}</td>
                    {COLS.map((c) => {
                      const v = (r as any)[c.key] as boolean;
                      return (
                        <td key={c.key} className="p-4 text-center">
                          {v ? <Check size={16} className="mx-auto text-agentrix-electric" /> : <Minus size={16} className="mx-auto text-agentrix-inkLine" />}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </MarketingLayout>
  );
}
