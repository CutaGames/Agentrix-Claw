/**
 * MarketplaceLayout — 统一导航壳
 *
 * 包裹所有 /market/* 和 /showcase 页面，提供：
 * - 顶部导航栏（Skins / Skills / Tasks / Showcase）
 * - 全局搜索输入框
 * - 已登录用户 AXP 余额展示
 * - 底部持久 "Download App" 横幅
 *
 * Requirements: 8.1, 8.2, 8.3, 8.5, 7.5, 10.5
 */

import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { ReactNode, useCallback, useEffect, useRef, useState } from 'react';
import { Store, Zap, ListTodo, Sparkles, Search, Download, Smartphone, ShoppingCart as ShoppingCartIcon } from 'lucide-react';
import { useUser } from '../../contexts/UserContext';
import { useLocalization } from '../../contexts/LocalizationContext';
import { useCartCount } from '../../contexts/CartContext';
import { fetchAxpBalance, fetchUnifiedSearch } from '../../services/marketplaceApi';
import { ShoppingCart } from '../marketplace/ShoppingCart';
import type { MarketingSeo } from '../../lib/seo';
import type { UnifiedSearchResponse } from '../../services/marketplaceApi';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ActiveSection = 'skins' | 'skills' | 'tasks' | 'showcase';

export interface MarketplaceLayoutProps {
  children: ReactNode;
  seo: MarketingSeo;
  activeSection?: ActiveSection;
  showSearch?: boolean;
}

// ---------------------------------------------------------------------------
// Helper: route → active section (exported for testability)
// ---------------------------------------------------------------------------

/**
 * Determines the active navigation section based on the current pathname.
 *
 * Mapping:
 *  /market          → 'skins'
 *  /market/skills   → 'skills'
 *  /market/tasks    → 'tasks'
 *  /showcase        → 'showcase'
 *  /market/skin/[id]→ 'skins'  (detail page falls under skins)
 *  default          → 'skins'
 */
export function getActiveSection(pathname: string): ActiveSection {
  if (pathname === '/showcase') return 'showcase';
  if (pathname.startsWith('/market/skills')) return 'skills';
  if (pathname.startsWith('/market/tasks')) return 'tasks';
  // /market, /market/skin/[id], or any other /market/* route
  return 'skins';
}

// ---------------------------------------------------------------------------
// Navigation items
// ---------------------------------------------------------------------------

interface NavItem {
  key: ActiveSection;
  href: string;
  labelZh: string;
  labelEn: string;
  icon: typeof Store;
}

const NAV_ITEMS: NavItem[] = [
  { key: 'skins', href: '/market', labelZh: 'Skins', labelEn: 'Skins', icon: Store },
  { key: 'skills', href: '/market/skills', labelZh: 'Skills', labelEn: 'Skills', icon: Zap },
  { key: 'tasks', href: '/market/tasks', labelZh: 'Tasks', labelEn: 'Tasks', icon: ListTodo },
  { key: 'showcase', href: '/showcase', labelZh: 'Showcase', labelEn: 'Showcase', icon: Sparkles },
];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function MarketplaceLayout({
  children,
  seo,
  activeSection: activeSectionProp,
  showSearch = true,
}: MarketplaceLayoutProps) {
  const router = useRouter();
  const { isAuthenticated } = useUser();
  const { t } = useLocalization();
  const cartCount = useCartCount();

  // Cart panel toggle
  const [showCartPanel, setShowCartPanel] = useState(false);

  // Determine active section from prop or route
  const activeSection = activeSectionProp ?? getActiveSection(router.pathname);

  // -------------------------------------------------------------------------
  // AXP Balance (authenticated users only, silent failure)
  // -------------------------------------------------------------------------
  const [axpBalance, setAxpBalance] = useState<number | null>(null);

  useEffect(() => {
    if (!isAuthenticated) {
      setAxpBalance(null);
      return;
    }

    let cancelled = false;
    fetchAxpBalance()
      .then((res) => {
        if (!cancelled) setAxpBalance(res.balance);
      })
      .catch(() => {
        // Requirement 10.5: 获取失败时静默隐藏
        if (!cancelled) setAxpBalance(null);
      });

    return () => { cancelled = true; };
  }, [isAuthenticated]);

  // -------------------------------------------------------------------------
  // Search
  // -------------------------------------------------------------------------
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<UnifiedSearchResponse | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [showSearchResults, setShowSearchResults] = useState(false);
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchContainerRef = useRef<HTMLDivElement>(null);

  const performSearch = useCallback(async (query: string) => {
    if (!query.trim()) {
      setSearchResults(null);
      setShowSearchResults(false);
      return;
    }

    setIsSearching(true);
    try {
      const results = await fetchUnifiedSearch({ query: query.trim(), limit: 5 });
      setSearchResults(results);
      setShowSearchResults(true);
    } catch {
      setSearchResults(null);
    } finally {
      setIsSearching(false);
    }
  }, []);

  const handleSearchChange = (value: string) => {
    setSearchQuery(value);
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    searchTimeoutRef.current = setTimeout(() => performSearch(value), 300);
  };

  // Close search results on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (searchContainerRef.current && !searchContainerRef.current.contains(e.target as Node)) {
        setShowSearchResults(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------
  const totalSearchCount =
    searchResults
      ? searchResults.skins.count + searchResults.skills.count + searchResults.tasks.count
      : 0;

  return (
    <>
      <Head>
        <title>{seo.title}</title>
        <meta name="description" content={seo.description} />
        <link rel="canonical" href={seo.canonical} />
        <meta property="og:title" content={seo.ogTitle} />
        <meta property="og:description" content={seo.ogDescription} />
        <meta property="og:image" content={seo.ogImage} />
        <meta property="og:type" content={seo.ogType} />
        <meta property="og:url" content={seo.canonical} />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content={seo.ogTitle} />
        <meta name="twitter:description" content={seo.ogDescription} />
        <meta name="twitter:image" content={seo.ogImage} />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="icon" href="/favicon.ico" />
      </Head>

      <div className="flex min-h-screen flex-col bg-gray-950 text-white">
        {/* ─── Top Navigation Bar ─── */}
        <header className="sticky top-0 z-50 border-b border-gray-800 bg-gray-950/95 backdrop-blur-sm">
          <div className="container mx-auto flex items-center justify-between px-4 py-3 md:px-6">
            {/* Left: Logo + Nav Tabs */}
            <div className="flex items-center gap-6">
              <Link href="/" className="text-lg font-bold text-white">
                Agentrix
              </Link>

              <nav className="hidden items-center gap-1 md:flex" aria-label="Marketplace navigation">
                {NAV_ITEMS.map((item) => {
                  const Icon = item.icon;
                  const isActive = activeSection === item.key;
                  return (
                    <Link
                      key={item.key}
                      href={item.href}
                      className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                        isActive
                          ? 'bg-gray-800 text-white'
                          : 'text-gray-400 hover:bg-gray-800/50 hover:text-white'
                      }`}
                      aria-current={isActive ? 'page' : undefined}
                    >
                      <Icon size={15} />
                      <span>{t({ zh: item.labelZh, en: item.labelEn })}</span>
                    </Link>
                  );
                })}
              </nav>
            </div>

            {/* Right: Search + AXP Balance */}
            <div className="flex items-center gap-4">
              {/* Search */}
              {showSearch && (
                <div ref={searchContainerRef} className="relative">
                  <div className="flex items-center rounded-lg border border-gray-700 bg-gray-900 px-3 py-1.5 focus-within:border-gray-500 transition-colors">
                    <Search size={14} className="text-gray-500" />
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => handleSearchChange(e.target.value)}
                      onFocus={() => { if (searchResults) setShowSearchResults(true); }}
                      placeholder={t({ zh: '搜索皮肤、技能、任务…', en: 'Search skins, skills, tasks…' })}
                      className="ml-2 w-32 bg-transparent text-sm text-white placeholder-gray-500 outline-none sm:w-48 lg:w-64"
                      aria-label={t({ zh: '全局搜索', en: 'Global search' })}
                    />
                  </div>

                  {/* Search Results Dropdown */}
                  {showSearchResults && searchResults && (
                    <div className="absolute right-0 top-full mt-2 w-80 rounded-xl border border-gray-700 bg-gray-900 p-3 shadow-xl">
                      {totalSearchCount === 0 ? (
                        <p className="py-4 text-center text-sm text-gray-500">
                          {t({ zh: '未找到结果', en: 'No results found' })}
                        </p>
                      ) : (
                        <div className="space-y-3">
                          {searchResults.skins.count > 0 && (
                            <SearchGroup
                              label={t({ zh: '皮肤', en: 'Skins' })}
                              count={searchResults.skins.count}
                              items={searchResults.skins.items.map((s) => ({
                                id: s.id,
                                name: s.displayName,
                                href: `/market/skin/${s.id}`,
                              }))}
                            />
                          )}
                          {searchResults.skills.count > 0 && (
                            <SearchGroup
                              label={t({ zh: '技能', en: 'Skills' })}
                              count={searchResults.skills.count}
                              items={searchResults.skills.items.map((s) => ({
                                id: s.id,
                                name: s.title,
                                href: `/market/skills?highlight=${s.id}`,
                              }))}
                            />
                          )}
                          {searchResults.tasks.count > 0 && (
                            <SearchGroup
                              label={t({ zh: '任务', en: 'Tasks' })}
                              count={searchResults.tasks.count}
                              items={searchResults.tasks.items.map((s) => ({
                                id: s.id,
                                name: s.title,
                                href: `/market/tasks?highlight=${s.id}`,
                              }))}
                            />
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Cart Icon */}
              <button
                type="button"
                onClick={() => setShowCartPanel((prev) => !prev)}
                className="relative flex items-center justify-center rounded-lg p-2 text-gray-400 transition-colors hover:bg-gray-800 hover:text-white"
                aria-label={t({ zh: '购物车', en: 'Shopping Cart' })}
              >
                <ShoppingCartIcon size={18} />
                {cartCount > 0 && (
                  <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-blue-600 px-1 text-[10px] font-bold text-white">
                    {cartCount > 99 ? '99+' : cartCount}
                  </span>
                )}
              </button>

              {/* AXP Balance (authenticated + fetch success only) */}
              {isAuthenticated && axpBalance !== null && (
                <div className="hidden items-center gap-1.5 rounded-lg bg-gray-800 px-3 py-1.5 text-sm font-medium text-yellow-400 sm:flex">
                  <Zap size={14} />
                  <span>{axpBalance.toLocaleString()} AXP</span>
                </div>
              )}
            </div>
          </div>

          {/* Mobile Nav (visible on small screens) */}
          <nav className="flex items-center gap-1 overflow-x-auto border-t border-gray-800 px-4 py-2 md:hidden" aria-label="Marketplace navigation mobile">
            {NAV_ITEMS.map((item) => {
              const Icon = item.icon;
              const isActive = activeSection === item.key;
              return (
                <Link
                  key={item.key}
                  href={item.href}
                  className={`inline-flex shrink-0 items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                    isActive
                      ? 'bg-gray-800 text-white'
                      : 'text-gray-400 hover:text-white'
                  }`}
                  aria-current={isActive ? 'page' : undefined}
                >
                  <Icon size={13} />
                  <span>{t({ zh: item.labelZh, en: item.labelEn })}</span>
                </Link>
              );
            })}
          </nav>
        </header>

        {/* ─── Main Content ─── */}
        <main className="flex-1">{children}</main>

        {/* ─── Shopping Cart Panel ─── */}
        {showCartPanel && <ShoppingCart />}

        {/* ─── Download App Banner (persistent) ─── */}
        <footer className="border-t border-gray-800 bg-gray-900">
          <div className="container mx-auto flex flex-col items-center justify-between gap-4 px-4 py-4 sm:flex-row sm:px-6">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-purple-600 to-blue-500">
                <Smartphone size={20} className="text-white" />
              </div>
              <div>
                <p className="text-sm font-semibold text-white">
                  {t({ zh: '下载 Agentrix App', en: 'Download Agentrix App' })}
                </p>
                <p className="text-xs text-gray-400">
                  {t({ zh: '在移动端完成交易、管理宠物', en: 'Complete transactions & manage pets on mobile' })}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <a
                href="https://apps.apple.com/app/agentrix/id6744941703"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 rounded-lg border border-gray-700 bg-gray-800 px-4 py-2 text-xs font-medium text-white transition-colors hover:border-gray-600 hover:bg-gray-700"
              >
                <Download size={14} />
                App Store
              </a>
              <a
                href="https://play.google.com/store/apps/details?id=com.agentrix.app"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 rounded-lg border border-gray-700 bg-gray-800 px-4 py-2 text-xs font-medium text-white transition-colors hover:border-gray-600 hover:bg-gray-700"
              >
                <Download size={14} />
                Google Play
              </a>
            </div>
          </div>
        </footer>
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Internal: Search result group
// ---------------------------------------------------------------------------

interface SearchGroupProps {
  label: string;
  count: number;
  items: { id: string; name: string; href: string }[];
}

function SearchGroup({ label, count, items }: SearchGroupProps) {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <span className="text-xs font-semibold text-gray-400">{label}</span>
        <span className="text-xs text-gray-500">{count}</span>
      </div>
      <ul className="space-y-1">
        {items.slice(0, 3).map((item) => (
          <li key={item.id}>
            <Link
              href={item.href}
              className="block rounded-md px-2 py-1.5 text-sm text-gray-300 transition-colors hover:bg-gray-800 hover:text-white"
            >
              {item.name}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default MarketplaceLayout;
