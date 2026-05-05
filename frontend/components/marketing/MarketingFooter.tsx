import Link from 'next/link';
import { AgentrixLogo } from '../common/AgentrixLogo';
import { useLocalization } from '../../contexts/LocalizationContext';

// v3 marketing footer; aligned with new IA. Replaces legacy `components/layout/Footer.tsx`
// for marketing-layout pages. Console pages keep their own shell.

const COLUMNS = [
  {
    title: { zh: '产品', en: 'Product' },
    links: [
      { href: '/', label: { zh: '产品概览', en: 'Overview' } },
      { href: '/features', label: { zh: '5 端能力', en: '5 Surfaces' } },
      { href: '/manifesto', label: { zh: '三层愿景', en: 'Vision' } },
      { href: '/use-cases', label: { zh: '应用场景', en: 'Use Cases' } },
      { href: '/security', label: { zh: '安全与 MPC', en: 'Security' } },
    ],
  },
  {
    title: { zh: '生态', en: 'Ecosystem' },
    links: [
      { href: '/skills', label: { zh: 'Skill 市场', en: 'Skill Market' } },
      { href: '/agents', label: { zh: 'Agent 模板', en: 'Agent Templates' } },
      { href: '/developers', label: { zh: '开发者', en: 'Developers' } },
      { href: '/enterprise', label: { zh: '企业方案', en: 'Enterprise' } },
      { href: '/family', label: { zh: '家庭账号', en: 'Family' } },
    ],
  },
  {
    title: { zh: '资源', en: 'Resources' },
    links: [
      { href: '/downloads', label: { zh: '下载客户端', en: 'Downloads' } },
      { href: '/pricing', label: { zh: '定价', en: 'Pricing' } },
      { href: '/invite', label: { zh: '邀请码', en: 'Invite' } },
      { href: '/legacy', label: { zh: '旧版入口', en: 'Legacy' } },
    ],
  },
  {
    title: { zh: '公司', en: 'Company' },
    links: [
      { href: '/about', label: { zh: '关于我们', en: 'About' } },
      { href: '/careers', label: { zh: '加入我们', en: 'Careers' } },
      { href: '/press', label: { zh: '媒体', en: 'Press' } },
      { href: '/privacy', label: { zh: '隐私政策', en: 'Privacy' } },
      { href: '/terms', label: { zh: '服务条款', en: 'Terms' } },
    ],
  },
];

const SOCIAL = [
  { href: 'https://x.com/agentrixnetwork', label: 'X' },
  { href: 'https://t.me/AgentrixNetwork', label: 'Telegram' },
  { href: 'https://discord.com/invite/vtuwyRGxaa', label: 'Discord' },
  { href: 'https://github.com/CutaGames/Agentrix-Claw', label: 'GitHub' },
];

export function MarketingFooter() {
  const { t } = useLocalization();
  return (
    <footer className="border-t border-agentrix-inkLine bg-agentrix-inkSoft text-agentrix-fog">
      <div className="container mx-auto px-6 py-14">
        <div className="grid gap-10 md:grid-cols-5">
          <div className="md:col-span-1">
            <AgentrixLogo size="lg" showText={true} className="text-white" />
            <p className="mt-4 text-sm leading-relaxed text-agentrix-mist">
              {t({
                zh: '一只 Agent 横穿 5 屏：陪你 · 帮你 · 替你赚钱。',
                en: 'One agent across 5 surfaces: with you, for you, earning for you.',
              })}
            </p>
            <div className="mt-5 flex gap-3">
              {SOCIAL.map((s) => (
                <a
                  key={s.href}
                  href={s.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded-full border border-agentrix-inkLine px-3 py-1 text-xs hover:text-white hover:border-agentrix-electric"
                >
                  {s.label}
                </a>
              ))}
            </div>
          </div>
          {COLUMNS.map((col) => (
            <div key={col.title.en}>
              <h4 className="mb-4 text-xs font-semibold uppercase tracking-wider text-white/80">
                {t(col.title)}
              </h4>
              <ul className="space-y-2 text-sm">
                {col.links.map((link) => (
                  <li key={link.href}>
                    <Link
                      href={link.href}
                      className="transition-colors hover:text-white"
                    >
                      {t(link.label)}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="mt-12 flex flex-col items-start justify-between gap-2 border-t border-agentrix-inkLine pt-6 text-xs text-agentrix-mist md:flex-row md:items-center">
          <span>© {new Date().getFullYear()} Agentrix Network. All rights reserved.</span>
          <span>
            {t({
              zh: 'L2/L3 签名永远在 Mobile，Web 不持有 MPC share。',
              en: 'L2/L3 signing always on Mobile. Web never holds an MPC share.',
            })}
          </span>
        </div>
      </div>
    </footer>
  );
}
