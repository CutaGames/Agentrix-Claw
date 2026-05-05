import React from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useRole } from '../auth/RoleGuard';

/**
 * ConsoleLayout (R1-2 of WEB_REMEDIATION_PLAN_20260505)
 *
 * Restored multi-section navigation that surfaces every legacy commercial
 * surface (Marketplace / Wallet / Developer / Merchant / Family / Admin)
 * inside the new /console/** authenticated workspace shell.
 *
 * Old Marketing pages (/, /pricing, /about) keep their own top-nav.
 */

interface NavLink {
  href: string;
  label: string;
  external?: boolean; // true → renders as <a> (legacy /admin paths)
}

interface NavSection {
  id: string;
  title: string;
  icon: string;
  defaultOpen?: boolean;
  requireRole?: 'admin' | 'merchant' | 'developer' | 'family_owner';
  links: NavLink[];
}

const SECTIONS: NavSection[] = [
  {
    id: 'overview',
    title: 'Overview',
    icon: '🏠',
    defaultOpen: true,
    links: [
      { href: '/console/dashboard', label: 'Dashboard' },
      { href: '/console/agents', label: 'Agents' },
      { href: '/console/presence', label: 'Presence' },
    ],
  },
  {
    id: 'marketplace',
    title: 'Marketplace',
    icon: '🛒',
    defaultOpen: true,
    links: [
      { href: '/console/marketplace/skills', label: 'Skill Market' },
      { href: '/console/marketplace/tasks', label: 'Task Market (A2A)' },
      { href: '/console/marketplace/resources', label: 'Resources' },
      { href: '/console/marketplace/plugins', label: 'Plugins / MCP' },
    ],
  },
  {
    id: 'wallet',
    title: 'Wallet & Earnings',
    icon: '💰',
    defaultOpen: true,
    links: [
      { href: '/console/wallet', label: 'Overview' },
      { href: '/console/wallet/checkout', label: 'Checkout (Fiat + Crypto)' },
      { href: '/console/wallet/commission', label: 'Commission V4' },
      { href: '/console/wallet/split-plans', label: 'Split Plans' },
      { href: '/console/wallet/budgets', label: 'Budget Pools' },
      { href: '/console/wallet/auto-earn', label: 'Auto-Earn Timeline' },
      { href: '/console/wallet/referral', label: 'Referral & Affiliate' },
      { href: '/console/wallet/audit', label: 'Audit Log' },
      { href: '/console/billing', label: 'Subscription / Billing' },
    ],
  },
  {
    id: 'developer',
    title: 'Developer',
    icon: '🛠️',
    requireRole: 'developer',
    links: [
      { href: '/console/developer', label: 'Overview' },
      { href: '/console/developer/skills', label: 'My Skill Listings' },
      { href: '/console/developer/workflows', label: 'Workflow Templates' },
      { href: '/console/developer/earnings', label: 'Earnings' },
      { href: '/developers/console', label: 'API Keys & Webhooks', external: true },
    ],
  },
  {
    id: 'merchant',
    title: 'Merchant',
    icon: '🏪',
    requireRole: 'merchant',
    links: [
      { href: '/console/merchant', label: 'Overview' },
      { href: '/console/merchant/products', label: 'Products' },
      { href: '/console/merchant/orders', label: 'Orders' },
      { href: '/console/merchant/settlements', label: 'Settlements' },
    ],
  },
  {
    id: 'family',
    title: 'Family Account',
    icon: '👪',
    links: [
      { href: '/console/family', label: 'Overview' },
      { href: '/console/family/members', label: 'Members' },
      { href: '/console/family/pet', label: 'Family Pet' },
      { href: '/console/family/agents', label: 'Household Agents' },
      { href: '/console/family/allowance', label: 'Allowance & Budgets' },
    ],
  },
  {
    id: 'admin',
    title: 'Admin',
    icon: '🛡️',
    requireRole: 'admin',
    links: [
      { href: '/admin', label: 'Admin Console', external: true },
      { href: '/admin/skill-ecosystem', label: 'Skill Approval', external: true },
      { href: '/admin/merchants', label: 'Merchants', external: true },
      { href: '/admin/users', label: 'Users', external: true },
      { href: '/admin/system', label: 'System Health', external: true },
    ],
  },
  {
    id: 'settings',
    title: 'Settings',
    icon: '⚙️',
    links: [
      { href: '/console/settings/profile', label: 'Profile' },
      { href: '/console/settings/security', label: 'Security & Co-sign' },
      { href: '/console/settings/privacy', label: 'Privacy Fence' },
      { href: '/console/settings/memory', label: 'Memory Tiers' },
    ],
  },
];

interface ConsoleLayoutProps {
  title: string;
  children: React.ReactNode;
}

export function ConsoleLayout({ title, children }: ConsoleLayoutProps): React.ReactElement {
  const router = useRouter();
  const { has } = useRole();

  const visibleSections = SECTIONS.filter((s) => !s.requireRole || has(s.requireRole));

  return (
    <>
      <Head>
        <title>{`${title} · Agentrix Console`}</title>
        <meta name="robots" content="noindex" />
      </Head>
      <div style={{ display: 'flex', minHeight: '100vh', background: '#07080B', color: '#E2E8F0' }}>
        <aside
          style={{
            width: 260,
            background: '#0E1118',
            borderRight: '1px solid #1C2230',
            padding: '20px 12px',
            display: 'flex',
            flexDirection: 'column',
            gap: 4,
            overflowY: 'auto',
          }}
        >
          <Link
            href="/console/dashboard"
            style={{
              fontSize: 18,
              fontWeight: 700,
              marginBottom: 16,
              padding: '0 8px',
              background: 'linear-gradient(90deg,#7C3AED,#22D3FF)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              textDecoration: 'none',
            }}
          >
            Agentrix Console
          </Link>

          {visibleSections.map((section) => (
            <NavSectionView key={section.id} section={section} routerPath={router.pathname} />
          ))}

          <div style={{ marginTop: 'auto', padding: '12px 8px', fontSize: 11, color: '#4b5364' }}>
            v3.0 · {new Date().getFullYear()}
            <div style={{ marginTop: 4 }}>
              <Link href="/" style={{ color: '#9aa3b2', textDecoration: 'none' }}>
                ← Marketing site
              </Link>
            </div>
          </div>
        </aside>
        <main style={{ flex: 1, padding: '32px 40px', overflow: 'auto' }}>
          <h1 style={{ fontSize: 28, fontWeight: 700, marginBottom: 24 }}>{title}</h1>
          {children}
        </main>
      </div>
    </>
  );
}

function NavSectionView({
  section,
  routerPath,
}: {
  section: NavSection;
  routerPath: string;
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
          padding: '8px 10px',
          background: 'transparent',
          color: sectionActive ? '#E2E8F0' : '#9aa3b2',
          border: 0,
          fontSize: 12,
          fontWeight: 700,
          textTransform: 'uppercase',
          letterSpacing: 0.6,
          cursor: 'pointer',
          textAlign: 'left',
        }}
        aria-expanded={open}
      >
        <span>{section.icon}</span>
        <span style={{ flex: 1 }}>{section.title}</span>
        <span style={{ fontSize: 10 }}>{open ? '▾' : '▸'}</span>
      </button>
      {open &&
        section.links.map((link) => {
          const active = routerPath === link.href;
          const style: React.CSSProperties = {
            display: 'block',
            padding: '7px 10px 7px 28px',
            borderRadius: 6,
            background: active ? 'rgba(34,211,255,0.10)' : 'transparent',
            color: active ? '#22D3FF' : '#7e8696',
            textDecoration: 'none',
            fontSize: 13,
            fontWeight: 500,
          };
          return link.external ? (
            <a key={link.href} href={link.href} style={style}>
              {link.label} ↗
            </a>
          ) : (
            <Link key={link.href} href={link.href} style={style}>
              {link.label}
            </Link>
          );
        })}
    </div>
  );
}
