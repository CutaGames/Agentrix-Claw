/**
 * ConsoleLayout v4 — Tailwind + Lucide icons + mobile drawer (Sprint 1 rewrite).
 *
 * Previous version used inline styles and emoji icons; replaced with the
 * unified `ax-*` design tokens and Lucide icons for a consistent visual
 * language across Marketing and Console.
 */
import React from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import {
  Home, ShoppingCart, Wallet, Wrench, Store, Users, Shield, Settings,
  ChevronDown, ChevronRight, Menu, X, ArrowLeft, type LucideIcon,
} from 'lucide-react';
import { useRole } from '../auth/RoleGuard';
import { useLocalization, type TranslationDescriptor } from '../../contexts/LocalizationContext';
import { L } from '../../lib/console.i18n';
import { cn } from '../../lib/utils';

interface NavLink {
  href: string;
  label: TranslationDescriptor;
  external?: boolean;
}

interface NavSection {
  id: string;
  title: TranslationDescriptor;
  icon: LucideIcon;
  defaultOpen?: boolean;
  requireRole?: 'admin' | 'merchant' | 'developer' | 'family_owner';
  links: NavLink[];
}

const SECTIONS: NavSection[] = [
  {
    id: 'overview',
    title: L.nav.overview,
    icon: Home,
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
    icon: ShoppingCart,
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
    icon: Wallet,
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
    icon: Wrench,
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
    icon: Store,
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
    icon: Users,
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
    icon: Shield,
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
    icon: Settings,
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
  /** Optional subtitle / description shown under the page title. */
  subtitle?: React.ReactNode;
  /** Optional right-side header action (button cluster, badge, etc). */
  action?: React.ReactNode;
  children: React.ReactNode;
}

export function ConsoleLayout({ title, subtitle, action, children }: ConsoleLayoutProps): React.ReactElement {
  const router = useRouter();
  const { has } = useRole();
  const { t, language, setLanguage } = useLocalization();
  const [mobileOpen, setMobileOpen] = React.useState(false);

  const visibleSections = SECTIONS.filter((s) => !s.requireRole || has(s.requireRole));

  // Close drawer on route change
  React.useEffect(() => {
    setMobileOpen(false);
  }, [router.asPath]);

  // Lock body scroll when drawer open
  React.useEffect(() => {
    if (mobileOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [mobileOpen]);

  return (
    <>
      <Head>
        <title>{`${title} · Agentrix Console`}</title>
        <meta name="robots" content="noindex" />
      </Head>
      <div className="flex min-h-screen bg-ax-base text-ax-ink">
        {/* Mobile drawer overlay */}
        {mobileOpen && (
          <div
            className="fixed inset-0 z-40 bg-black/70 backdrop-blur-sm md:hidden animate-ax-fade-in"
            onClick={() => setMobileOpen(false)}
            aria-hidden="true"
          />
        )}

        {/* Sidebar — sticky on desktop, slide-over on mobile */}
        <aside
          className={cn(
            'fixed inset-y-0 left-0 z-50 flex w-[280px] flex-col border-r border-ax-line bg-gradient-to-b from-[#0F1320] to-[#0a0e16] transition-transform duration-300 md:sticky md:top-0 md:z-30 md:h-screen md:max-h-screen md:translate-x-0',
            mobileOpen ? 'translate-x-0 shadow-2xl' : '-translate-x-full',
          )}
        >
          {/* Sidebar header */}
          <div className="flex h-16 shrink-0 items-center justify-between border-b border-ax-line px-4">
            <Link
              href="/console/dashboard"
              className="ax-text-gradient text-lg font-extrabold tracking-wide"
              onClick={() => setMobileOpen(false)}
            >
              Agentrix Console
            </Link>
            <button
              type="button"
              onClick={() => setMobileOpen(false)}
              className="md:hidden rounded-ax-sm p-1.5 text-ax-mist hover:bg-white/5 hover:text-ax-ink ax-focus-ring"
              aria-label="Close menu"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Nav body — scrollable */}
          <nav className="flex-1 overflow-y-auto px-3 py-3 [scrollbar-width:thin] [scrollbar-color:#1C2230_transparent]">
            {visibleSections.map((section) => (
              <NavSectionView key={section.id} section={section} routerPath={router.pathname} t={t} />
            ))}
          </nav>

          {/* Sidebar footer */}
          <div className="shrink-0 space-y-3 border-t border-ax-line px-3 py-3">
            <div className="flex gap-1.5">
              {(['zh', 'en'] as const).map((code) => (
                <button
                  key={code}
                  type="button"
                  onClick={() => setLanguage(code)}
                  className={cn(
                    'flex-1 rounded-ax-sm border px-2 py-1.5 text-[11px] font-semibold transition-colors ax-focus-ring',
                    language === code
                      ? 'border-ax-accent bg-ax-accent text-ax-base'
                      : 'border-ax-line text-ax-fog hover:border-ax-lineStrong hover:text-ax-ink',
                  )}
                >
                  {code === 'zh' ? '中文' : 'EN'}
                </button>
              ))}
            </div>
            <Link
              href="/"
              className="flex items-center gap-1.5 px-1 text-[12px] text-ax-mist transition-colors hover:text-ax-ink"
            >
              <ArrowLeft className="h-3 w-3" />
              {t({ zh: '返回主页', en: 'Back to home' })}
            </Link>
            <div className="px-1 text-[10px] text-ax-mist">v4.0 · {new Date().getFullYear()}</div>
          </div>
        </aside>

        {/* Main column */}
        <main className="flex min-w-0 flex-1 flex-col">
          {/* Mobile top bar */}
          <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-ax-line bg-ax-base/80 px-4 backdrop-blur-md md:hidden">
            <button
              type="button"
              onClick={() => setMobileOpen(true)}
              className="rounded-ax-sm p-1.5 text-ax-fog hover:bg-white/5 hover:text-ax-ink ax-focus-ring"
              aria-label="Open menu"
            >
              <Menu className="h-5 w-5" />
            </button>
            <span className="ax-text-gradient text-base font-bold">Agentrix Console</span>
          </header>

          {/* Page content */}
          <div className="flex-1 overflow-x-hidden px-4 py-6 md:px-10 md:py-10">
            <div className="mb-6 flex items-start justify-between gap-4 md:mb-8">
              <div className="min-w-0 flex-1">
                <h1 className="text-2xl font-bold tracking-tight text-ax-ink md:text-[26px]">{title}</h1>
                {subtitle && <p className="mt-2 text-sm text-ax-fog md:text-base">{subtitle}</p>}
              </div>
              {action && <div className="shrink-0">{action}</div>}
            </div>
            {children}
          </div>
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
  const Icon = section.icon;

  React.useEffect(() => {
    if (sectionActive) setOpen(true);
  }, [sectionActive]);

  return (
    <div className="mb-1">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          'flex w-full items-center gap-2.5 rounded-ax-sm px-2.5 py-2 text-[11px] font-bold uppercase tracking-[0.08em] transition-colors',
          'hover:bg-white/[0.03]',
          sectionActive ? 'text-ax-ink' : 'text-ax-fog',
        )}
        aria-expanded={open}
      >
        <Icon className={cn('h-4 w-4 shrink-0', sectionActive ? 'text-ax-accent' : 'text-ax-mist')} />
        <span className="flex-1 text-left">{t(section.title)}</span>
        {open ? <ChevronDown className="h-3 w-3 text-ax-mist" /> : <ChevronRight className="h-3 w-3 text-ax-mist" />}
      </button>
      {open && (
        <div className="mt-0.5 ml-3 space-y-0.5 border-l border-ax-line pl-1.5">
          {section.links.map((link) => {
            const active = routerPath === link.href;
            const className = cn(
              'block rounded-ax-sm px-2.5 py-1.5 text-[13px] transition-colors',
              active
                ? 'bg-ax-accent/12 text-ax-accent font-semibold'
                : 'text-ax-fog hover:bg-white/[0.04] hover:text-ax-ink',
            );
            const content = t(link.label);
            return link.external ? (
              <a key={link.href} href={link.href} className={className}>
                {content}
                <span className="ml-1 text-ax-mist">↗</span>
              </a>
            ) : (
              <Link key={link.href} href={link.href} className={className}>
                {content}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default ConsoleLayout;
