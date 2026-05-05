import Link from 'next/link';
import { Smartphone, Monitor, Globe2, Watch, Server, ExternalLink } from 'lucide-react';
import { MarketingLayout } from '../components/marketing/MarketingLayout';
import { buildSeo } from '../lib/seo';
import { useLocalization } from '../contexts/LocalizationContext';

interface Surface {
  icon: typeof Smartphone;
  title: { zh: string; en: string };
  desc: { zh: string; en: string };
  links: Array<{
    label: { zh: string; en: string };
    href: string;
    status?: 'beta' | 'soon' | 'live';
    external?: boolean;
  }>;
}

const SURFACES: Surface[] = [
  {
    icon: Smartphone,
    title: { zh: 'Mobile · 主宠 + 钱包', en: 'Mobile · Companion + Wallet' },
    desc: { zh: 'Live2D 主宠、X402 签名、push 审批。', en: 'Live2D companion, X402 signing, push approval.' },
    links: [
      { label: { zh: 'Android APK', en: 'Android APK' }, href: 'https://api.agentrix.top/downloads/clawlink-agent.apk', status: 'beta', external: true },
      { label: { zh: 'iOS TestFlight', en: 'iOS TestFlight' }, href: 'https://testflight.apple.com', status: 'beta', external: true },
    ],
  },
  {
    icon: Monitor,
    title: { zh: 'Desktop · 工作台', en: 'Desktop · Workspace' },
    desc: { zh: '多 Worktree、Skill Canvas、Live3D。', en: 'Multi-worktree, Skill Canvas, Live3D.' },
    links: [
      { label: { zh: 'Windows (.exe)', en: 'Windows (.exe)' }, href: '/legacy/desktop-windows', status: 'soon' },
      { label: { zh: 'macOS (.dmg)', en: 'macOS (.dmg)' }, href: '/legacy/desktop-macos', status: 'soon' },
      { label: { zh: 'Linux (.AppImage)', en: 'Linux (.AppImage)' }, href: '/legacy/desktop-linux', status: 'soon' },
    ],
  },
  {
    icon: Globe2,
    title: { zh: 'Web · Console', en: 'Web · Console' },
    desc: { zh: '账户、计费、生态市场、Auto-Earn 看板。', en: 'Account, billing, marketplace, Auto-Earn board.' },
    links: [
      { label: { zh: '打开 Web Console', en: 'Open Web Console' }, href: '/auth/login?next=/console/dashboard', status: 'live' },
    ],
  },
  {
    icon: Watch,
    title: { zh: 'Watch · 一瞥', en: 'Watch · Glance' },
    desc: { zh: '提醒、审批、心情，Apple Watch / Wear OS 即将上线。', en: 'Reminders, approval, mood. Apple Watch / Wear OS coming soon.' },
    links: [
      { label: { zh: '加入 Watch 候补', en: 'Join Watch waitlist' }, href: '/invite?surface=watch', status: 'soon' },
    ],
  },
  {
    icon: Server,
    title: { zh: 'Server · Auto-Earn', en: 'Server · Auto-Earn' },
    desc: { zh: '7×24 接单 / 结算 / 复投，本地或云端皆可。', en: '7×24 accept · settle · reinvest. Self-host or cloud.' },
    links: [
      { label: { zh: 'CLI 安装文档', en: 'CLI install docs' }, href: '/developers#cli', status: 'beta' },
    ],
  },
];

const BADGE: Record<NonNullable<Surface['links'][number]['status']>, { zh: string; en: string; cls: string }> = {
  live: { zh: '可用', en: 'Live', cls: 'bg-agentrix-electric/20 text-agentrix-electric' },
  beta: { zh: '内测', en: 'Beta', cls: 'bg-agentrix-solar/20 text-agentrix-solar' },
  soon: { zh: '即将', en: 'Soon', cls: 'bg-white/10 text-agentrix-mist' },
};

export default function DownloadsPage() {
  const { t } = useLocalization();
  const seo = buildSeo({
    title: t({ zh: '下载 · Agentrix', en: 'Downloads · Agentrix' }),
    description: t({
      zh: 'Mobile / Desktop / Web / Watch / Server 五端客户端下载。',
      en: 'Download Agentrix across Mobile / Desktop / Web / Watch / Server.',
    }),
    path: '/downloads',
  });
  return (
    <MarketingLayout seo={seo}>
      <section className="bg-agentrix-ink py-20">
        <div className="container mx-auto max-w-5xl px-6">
          <div className="text-center">
            <h1 className="text-4xl font-extrabold md:text-5xl">{t({ zh: '把 Agent 装进每块屏幕', en: 'Install your Agent on every screen' })}</h1>
            <p className="mt-4 text-agentrix-fog">{t({ zh: '同一个身份，同一份记忆，同一只钱包。', en: 'One identity. One memory. One wallet.' })}</p>
          </div>
          <div className="mt-12 grid gap-6 md:grid-cols-2">
            {SURFACES.map((s) => {
              const Icon = s.icon;
              return (
                <div key={s.title.en} className="rounded-2xl border border-agentrix-inkLine bg-agentrix-inkSoft p-6">
                  <div className="flex items-start gap-4">
                    <Icon size={28} className="mt-1 text-agentrix-electric" />
                    <div className="flex-1">
                      <h3 className="text-lg font-bold text-white">{t(s.title)}</h3>
                      <p className="mt-1 text-sm text-agentrix-fog">{t(s.desc)}</p>
                    </div>
                  </div>
                  <div className="mt-5 flex flex-wrap gap-2">
                    {s.links.map((l) => {
                      const badge = l.status ? BADGE[l.status] : null;
                      const inner = (
                        <>
                          <span>{t(l.label)}</span>
                          {l.external && <ExternalLink size={12} />}
                          {badge && (
                            <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${badge.cls}`}>
                              {t({ zh: badge.zh, en: badge.en })}
                            </span>
                          )}
                        </>
                      );
                      const cls = 'inline-flex items-center gap-1.5 rounded-full bg-white/10 px-4 py-2 text-xs font-semibold text-white hover:bg-white/15';
                      return l.external ? (
                        <a key={l.href} href={l.href} target="_blank" rel="noopener noreferrer" className={cls}>
                          {inner}
                        </a>
                      ) : (
                        <Link key={l.href} href={l.href} className={cls}>
                          {inner}
                        </Link>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
          <p className="mt-10 text-center text-xs text-agentrix-mist">
            {t({
              zh: '所有客户端遵循 MPC 三方分片架构，签名永远在 Mobile 端发起。',
              en: 'All clients follow the MPC 3-share architecture. Signing is initiated on Mobile only.',
            })}
          </p>
        </div>
      </section>
    </MarketingLayout>
  );
}
