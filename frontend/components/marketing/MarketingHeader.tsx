import Link from 'next/link';
import { useRouter } from 'next/router';
import { useState, useEffect, useRef } from 'react';
import { ChevronDown, Menu, X } from 'lucide-react';
import { useUser } from '../../contexts/UserContext';
import { useLocalization } from '../../contexts/LocalizationContext';
import { AgentrixLogo } from '../common/AgentrixLogo';
import { LanguageSwitcher } from '../ui/LanguageSwitcher';

// Agentrix v4 marketing IA: Product ▾ / Market ▾ / Pricing / Showcase / Developers / Enterprise / Family / Downloads
// PRD: docs/web-prd-v4.md §2, docs/WEB_REFACTOR_PLAN_2026-05.zh-CN.md §2.2

interface NavItem {
  href: string;
  label: { zh: string; en: string };
  external?: boolean;
  disabled?: boolean;
}

const PRODUCT_GROUP: NavItem[] = [
  { href: '/', label: { zh: '产品概览', en: 'Overview' } },
  { href: '/manifesto', label: { zh: 'Pet-as-Agent 宣言', en: 'Pet-as-Agent Manifesto' } },
  { href: '/features', label: { zh: '5 端能力矩阵', en: '5-Surface Matrix' } },
  { href: '/clans', label: { zh: '6 族群灵魂', en: '6 Clans' } },
  { href: '/use-cases', label: { zh: '应用场景', en: 'Use Cases' } },
  { href: '/security', label: { zh: '安全与 MPC', en: 'Security & MPC' } },
];

const MARKET_GROUP: NavItem[] = [
  { href: '/market', label: { zh: '皮肤市场', en: 'Skin Marketplace' } },
  { href: '/market/skills', label: { zh: 'Skills 市场', en: 'Skills Market' } },
  { href: '/market/tasks', label: { zh: '任务市场', en: 'Task Market' } },
  { href: '/market/become-creator', label: { zh: '成为创作者', en: 'Become a Creator' } },
  { href: '/market/leaderboard', label: { zh: '创作者排行', en: 'Creator Leaderboard' } },
];

const COMMUNITY_GROUP: NavItem[] = [
  { href: '/blog', label: { zh: '博客', en: 'Blog' } },
  { href: '/partners', label: { zh: '合作伙伴', en: 'Partners' } },
  { href: '/investors', label: { zh: '投资人', en: 'Investors' } },
  { href: '/contact', label: { zh: '联系我们', en: 'Contact' } },
  { href: '/help', label: { zh: '帮助中心', en: 'Help Center' } },
];

const PRIMARY_NAV: NavItem[] = [
  { href: '/pricing', label: { zh: '定价', en: 'Pricing' } },
  { href: '/developers', label: { zh: '开发者', en: 'Developers' } },
  { href: '/enterprise', label: { zh: '企业', en: 'Enterprise' } },
  { href: '/family', label: { zh: '家庭', en: 'Family' } },
  { href: '/download', label: { zh: '下载', en: 'Download' } },
];

function NavDropdown({ label, items }: { label: { zh: string; en: string }; items: NavItem[] }) {
  const router = useRouter();
  const { t } = useLocalization();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  const isAnyActive = items.some((i) => router.pathname === i.href);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`flex items-center gap-1 text-sm font-medium transition-colors ${
          isAnyActive ? 'text-agentrix-electric' : 'text-agentrix-fog hover:text-white'
        }`}
      >
        {t(label)}
        <ChevronDown size={14} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="absolute top-full left-0 mt-3 w-72 rounded-xl border border-agentrix-inkLine bg-agentrix-inkSoft py-2 shadow-2xl shadow-black/40">
          {items.map((item) => {
            const active = router.pathname === item.href;
            if (item.disabled) {
              return (
                <span
                  key={item.href}
                  className="block px-4 py-2.5 text-sm text-agentrix-mist/50 cursor-not-allowed"
                >
                  {t(item.label)} <span className="text-xs">(W2)</span>
                </span>
              );
            }
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setOpen(false)}
                className={`block px-4 py-2.5 text-sm transition-colors ${
                  active
                    ? 'text-agentrix-electric bg-white/5'
                    : 'text-agentrix-fog hover:text-white hover:bg-white/5'
                }`}
              >
                {t(item.label)}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function MarketingHeader() {
  const router = useRouter();
  const { isAuthenticated } = useUser();
  const { t } = useLocalization();
  const [mobileOpen, setMobileOpen] = useState(false);

  const isActive = (path: string) => router.pathname === path;

  return (
    <header className="sticky top-0 z-40 border-b border-agentrix-inkLine bg-agentrix-ink/85 backdrop-blur-xl">
      <div className="container mx-auto flex h-16 items-center justify-between px-4 md:px-6">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setMobileOpen((v) => !v)}
            className="md:hidden text-agentrix-fog hover:text-white"
            aria-label="menu"
          >
            {mobileOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
          <Link href="/" className="hover:opacity-90">
            <AgentrixLogo size="md" showText={true} className="text-white" />
          </Link>
        </div>

        <nav className="hidden md:flex items-center gap-6">
          <NavDropdown label={{ zh: '产品', en: 'Product' }} items={PRODUCT_GROUP} />
          <NavDropdown label={{ zh: '集市', en: 'Market' }} items={MARKET_GROUP} />
          <NavDropdown label={{ zh: '社区', en: 'Community' }} items={COMMUNITY_GROUP} />
          {PRIMARY_NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`text-sm font-medium transition-colors ${
                isActive(item.href)
                  ? 'text-agentrix-electric'
                  : 'text-agentrix-fog hover:text-white'
              }`}
            >
              {t(item.label)}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-2 md:gap-3">
          <div className="hidden lg:flex">
            <LanguageSwitcher />
          </div>
          {isAuthenticated ? (
            <Link
              href="/console/dashboard"
              className="rounded-full bg-agentrix-electric px-4 py-1.5 text-xs font-bold text-agentrix-ink transition-opacity hover:opacity-90"
            >
              {t({ zh: '进入 Console', en: 'Open Console' })}
            </Link>
          ) : (
            <>
              <Link
                href="/auth/login"
                className="hidden md:inline-block text-sm font-medium text-agentrix-fog transition-colors hover:text-white"
              >
                {t({ zh: '登录', en: 'Sign in' })}
              </Link>
              <Link
                href="/auth/login?next=/console/dashboard"
                className="rounded-full bg-agentrix-solar px-4 py-1.5 text-xs font-bold text-agentrix-ink transition-opacity hover:opacity-90"
              >
                {t({ zh: '开始使用', en: 'Get started' })}
              </Link>
            </>
          )}
        </div>
      </div>

      {mobileOpen && (
        <div className="md:hidden border-t border-agentrix-inkLine bg-agentrix-inkSoft">
          <nav className="flex flex-col px-4 py-3">
            <p className="py-1 text-xs font-bold text-agentrix-mist uppercase tracking-wider">{t({ zh: '产品', en: 'Product' })}</p>
            {PRODUCT_GROUP.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setMobileOpen(false)}
                className={`py-2 text-sm font-medium ${
                  isActive(item.href)
                    ? 'text-agentrix-electric'
                    : 'text-agentrix-fog hover:text-white'
                }`}
              >
                {t(item.label)}
              </Link>
            ))}
            <p className="mt-2 py-1 text-xs font-bold text-agentrix-mist uppercase tracking-wider">{t({ zh: '集市', en: 'Market' })}</p>
            {MARKET_GROUP.filter((i) => !i.disabled).map((item) => (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setMobileOpen(false)}
                className={`py-2 text-sm font-medium ${
                  isActive(item.href)
                    ? 'text-agentrix-electric'
                    : 'text-agentrix-fog hover:text-white'
                }`}
              >
                {t(item.label)}
              </Link>
            ))}
            <p className="mt-2 py-1 text-xs font-bold text-agentrix-mist uppercase tracking-wider">{t({ zh: '社区', en: 'Community' })}</p>
            {COMMUNITY_GROUP.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setMobileOpen(false)}
                className={`py-2 text-sm font-medium ${
                  isActive(item.href)
                    ? 'text-agentrix-electric'
                    : 'text-agentrix-fog hover:text-white'
                }`}
              >
                {t(item.label)}
              </Link>
            ))}
            <hr className="my-2 border-agentrix-inkLine" />
            {PRIMARY_NAV.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setMobileOpen(false)}
                className={`py-2 text-sm font-medium ${
                  isActive(item.href)
                    ? 'text-agentrix-electric'
                    : 'text-agentrix-fog hover:text-white'
                }`}
              >
                {t(item.label)}
              </Link>
            ))}
          </nav>
        </div>
      )}
    </header>
  );
}
