import React from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useRole } from '../auth/RoleGuard';
import { useLocalization, type TranslationDescriptor } from '../../contexts/LocalizationContext';
import { L } from '../../lib/console.i18n';
import { T } from '../../lib/console.theme';

interface NavLink {
  href: string;
  label: TranslationDescriptor;
  external?: boolean;
}

interface NavSection {
  id: string;
  title: TranslationDescriptor;
  icon: string;
  defaultOpen?: boolean;
  requireRole?: 'admin' | 'merchant' | 'developer' | 'family_owner';
  links: NavLink[];
}

const SECTIONS: NavSection[] = [
  {
    id: 'overview',
    title: L.nav.overview,
    icon: '🏠',
    defaultOpen: true,
    links: [
      { href: '/console/dashboard', label: L.nav.dashboard },
      { href: '/console/agents', label: L.nav.agents },
      { href: '/console/presence', label: L.nav.presence },
    ],
  },
  {
    id: 'marketplace',
    title: L.nav.marketplace,
    icon: '🛒',
    defaultOpen: true,
    links: [
      { href: '/console/marketplace/skills', label: L.nav.skillMarket },
      { href: '/console/marketplace/tasks', label: L.nav.taskMarket },
      { href: '/console/marketplace/resources', label: L.nav.resources },
      { href: '/console/marketplace/plugins', label: L.nav.plugins },
    ],
  },
  {
    id: 'wallet',
    title: L.nav.wallet,
    icon: '💰',
    defaultOpen: true,
    links: [
      { href: '/console/wallet', label: L.nav.walletOverview },
      { href: '/console/wallet/checkout', label: L.nav.checkout },
      { href: '/console/wallet/commission', label: L.nav.commission },
      { href: '/console/wallet/split-plans', label: L.nav.splitPlans },
      { href: '/console/wallet/budgets', label: L.nav.budgets },
      { href: '/console/wallet/auto-earn', label: L.nav.autoEarn },
      { href: '/console/wallet/referral', label: L.nav.referral },
      { href: '/console/wallet/audit', label: L.nav.audit },
      { href: '/console/billing', label: L.nav.billing },
    ],
  },
  {
    id: 'developer',
    title: L.nav.developer,
    icon: '🛠️',
    requireRole: 'developer',
    links: [
      { href: '/console/developer', label: L.nav.devOverview },
      { href: '/console/developer/skills', label: L.nav.mySkills },
      { href: '/console/developer/workflows', label: L.nav.workflows },
      { href: '/console/developer/earnings', label: L.nav.earnings },
      { href: '/developers/console', label: L.nav.apiKeys, external: true },
    ],
  },
  {
    id: 'merchant',
    title: L.nav.merchant,
    icon: '🏪',
    requireRole: 'merchant',
    links: [
      { href: '/console/merchant', label: L.nav.devOverview },
      { href: '/console/merchant/products', label: L.nav.products },
      { href: '/console/merchant/orders', label: L.nav.orders },
      { href: '/console/merchant/settlements', label: L.nav.settlements },
    ],
  },
  {
    id: 'family',
    title: L.nav.family,
    icon: '👪',
    links: [
      { href: '/console/family', label: L.nav.overview },
      { href: '/console/family/members', label: L.nav.members },
      { href: '/console/family/pet', label: L.nav.pet },
      { href: '/console/family/agents', label: L.nav.householdAgents },
      { href: '/console/family/allowance', label: L.nav.allowance },
    ],
  },
  {
    id: 'admin',
    title: L.nav.admin,
    icon: '🛡️',
    requireRole: 'admin',
    links: [
      { href: '/admin', label: { zh: '管理控制台', en: 'Admin Console' }, external: true },
      { href: '/admin/skill-ecosystem', label: { zh: 'Skill 审核', en: 'Skill Approval' }, external: true },
      { href: '/admin/merchants', label: { zh: '商家管理', en: 'Merchants' }, external: true },
      { href: '/admin/users', label: { zh: '用户管理', en: 'Users' }, external: true },
      { href: '/admin/system', label: { zh: '系统健康', en: 'System Health' }, external: true },
    ],
  },
  {
    id: 'settings',
    title: L.nav.settings,
    icon: '⚙️',
    links: [
      { href: '/console/settings/profile', label: L.nav.profile },
      { href: '/console/settings/security', label: L.nav.security },
      { href: '/console/settings/privacy', label: L.nav.privacy },
      { href: '/console/settings/memory', label: L.nav.memory },
    ],
  },
];

interface ConsoleLayoutProps {
  /** Page title — pass `t({zh, en})` result string. */
  title: string;
  children: React.ReactNode;
}

export function ConsoleLayout({ title, children }: ConsoleLayoutProps): React.ReactElement {
  const router = useRouter();
  const { has } = useRole();
  const { t, language, setLanguage } = useLocalization();

  const visibleSections = SECTIONS.filter((s) => !s.requireRole || has(s.requireRole));

  return (
    <>
      <Head>
        <title>{`${title} · Agentrix Console`}</title>
        <meta name="robots" content="noindex" />
      </Head>
      <div
        style={{
          display: 'flex',
          minHeight: '100vh',
          background: T.bg.page,
          color: T.text.primary,
          fontFamily: T.font.family,
          fontSize: T.font.sizeBody,
        }}
      >
        <aside
          style={{
            width: 260,
            background: T.bg.sidebar,
            borderRight: `1px solid ${T.border.subtle}`,
            padding: '20px 12px',
            display: 'flex',
            flexDirection: 'column',
            gap: 4,
            overflowY: 'auto',
            position: 'sticky',
            top: 0,
            maxHeight: '100vh',
          }}
        >
          <Link
            href="/console/dashboard"
            style={{
              fontSize: 20,
              fontWeight: 800,
              marginBottom: 20,
              padding: '0 8px',
              background: 'linear-gradient(90deg,#7C3AED,#22D3FF)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              textDecoration: 'none',
              letterSpacing: 0.3,
            }}
          >
            Agentrix Console
          </Link>

          {visibleSections.map((section) => (
            <NavSectionView key={section.id} section={section} routerPath={router.pathname} t={t} />
          ))}

          <div style={{ marginTop: 'auto', padding: '14px 8px 4px', borderTop: `1px solid ${T.border.subtle}` }}>
            <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
              {(['zh', 'en'] as const).map((code) => (
                <button
                  key={code}
                  onClick={() => setLanguage(code)}
                  style={{
                    flex: 1,
                    padding: '6px 8px',
                    fontSize: 11,
                    background: language === code ? T.text.accent : 'transparent',
                    color: language === code ? T.text.inverted : T.text.secondary,
                    border: `1px solid ${language === code ? T.text.accent : T.border.subtle}`,
                    borderRadius: 6,
                    cursor: 'pointer',
                    fontWeight: 600,
                  }}
                >
                  {code === 'zh' ? '中文' : 'EN'}
                </button>
              ))}
            </div>
            <Link href="/" style={{ display: 'block', color: T.text.muted, textDecoration: 'none', fontSize: 12, padding: '4px 0' }}>
              {t(L.nav.backToHome)}
            </Link>
            <div style={{ fontSize: 10, color: T.text.muted, marginTop: 4 }}>
              v3.0 · {new Date().getFullYear()}
            </div>
          </div>
        </aside>
        <main style={{ flex: 1, padding: '32px 40px', overflow: 'auto' }}>
          <h1
            style={{
              fontSize: T.font.sizeH1 + 4,
              fontWeight: T.font.weightBold,
              marginBottom: 24,
              color: T.text.primary,
              letterSpacing: 0.2,
            }}
          >
            {title}
          </h1>
          {children}
        </main>
      </div>
    </>
  );
}

function NavSectionView({
  section,
  routerPath,
  t,
}: {
  section: NavSection;
  routerPath: string;
  t: (msg: TranslationDescriptor) => string;
}): React.ReactElement {
  const sectionActive = section.links.some((l) => routerPath.startsWith(l.href));
  const [open, setOpen] = React.useState<boolean>(section.defaultOpen ?? sectionActive);

  React.useEffect(() => {
    if (sectionActive) setOpen(true);
  }, [sectionActive]);

  return (
    <div style={{ marginBottom: 4 }}>
      <button
        onClick={() => setOpen((v) => !v)}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '9px 10px',
          background: 'transparent',
          color: sectionActive ? T.text.primary : T.text.secondary,
          border: 0,
          fontSize: 12,
          fontWeight: 700,
          textTransform: 'uppercase',
          letterSpacing: 0.8,
          cursor: 'pointer',
          textAlign: 'left',
          fontFamily: T.font.family,
        }}
        aria-expanded={open}
      >
        <span style={{ fontSize: 14 }}>{section.icon}</span>
        <span style={{ flex: 1 }}>{t(section.title)}</span>
        <span style={{ fontSize: 10, color: T.text.muted }}>{open ? '▾' : '▸'}</span>
      </button>
      {open &&
        section.links.map((link) => {
          const active = routerPath === link.href;
          const style: React.CSSProperties = {
            display: 'block',
            padding: '8px 10px 8px 32px',
            borderRadius: 6,
            background: active ? 'rgba(34,211,255,0.12)' : 'transparent',
            color: active ? T.text.accent : T.text.secondary,
            textDecoration: 'none',
            fontSize: 13,
            fontWeight: active ? 600 : 500,
            fontFamily: T.font.family,
            transition: 'background .12s, color .12s',
          };
          const content = t(link.label);
          return link.external ? (
            <a key={link.href} href={link.href} style={style}>
              {content} ↗
            </a>
          ) : (
            <Link key={link.href} href={link.href} style={style}>
              {content}
            </Link>
          );
        })}
    </div>
  );
}

export default ConsoleLayout;
