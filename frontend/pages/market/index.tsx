/**
 * /market — 皮肤交易发现页面 (Skin Trading Discovery)
 *
 * 三个 tab：Trending / New / Leaderboard
 * 支持 Clan 过滤（跨所有 tab）
 * 顶部 banner 说明交易在移动端完成
 * 使用 MarketplaceLayout 包裹
 *
 * Requirements: 6.1, 6.4, 6.6, 8.1
 */

import { useState, useCallback } from 'react';
import { GetServerSideProps, InferGetServerSidePropsType } from 'next';
import { TrendingUp, Clock, Trophy, Smartphone, Loader2 } from 'lucide-react';
import { MarketplaceLayout } from '../../components/marketplace/MarketplaceLayout';
import { FeaturedSkinsCarousel } from '../../components/marketplace/FeaturedSkinsCarousel';
import { SkinCard } from '../../components/marketplace/SkinCard';
import { AxpPurchaseModal } from '../../components/marketplace/AxpPurchaseModal';
import { buildSeo } from '../../lib/seo';
import { useLocalization } from '../../contexts/LocalizationContext';
import { useCart } from '../../contexts/CartContext';
import {
  fetchMarketSkins,
  MarketplaceSkinsParams,
  MarketplaceSkinsResponse,
  SkinListItem,
} from '../../services/marketplaceApi';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

const TABS = ['trending', 'new', 'leaderboard'] as const;
type Tab = (typeof TABS)[number];

type ClanFilter = 'All' | 'A' | 'B' | 'C' | 'D' | 'E' | 'F';
const CLANS: ClanFilter[] = ['All', 'A', 'B', 'C', 'D', 'E', 'F'];

/** Map tab to API sort parameter */
function tabToSort(tab: Tab): MarketplaceSkinsParams['sort'] {
  switch (tab) {
    case 'trending':
      return 'popular';
    case 'new':
      return 'newest';
    case 'leaderboard':
      return 'popular';
  }
}

// ---------------------------------------------------------------------------
// SSR
// ---------------------------------------------------------------------------

interface MarketPageProps {
  initialData: MarketplaceSkinsResponse;
  initialTab: Tab;
  initialClan: ClanFilter;
  featuredSkins: SkinListItem[];
}

export const getServerSideProps: GetServerSideProps<MarketPageProps> = async (ctx) => {
  const tabParam = (ctx.query.tab as string) || 'trending';
  const clanParam = (ctx.query.clan as string) || 'All';

  const tab: Tab = TABS.includes(tabParam as Tab) ? (tabParam as Tab) : 'trending';
  const clan: ClanFilter = CLANS.includes(clanParam as ClanFilter)
    ? (clanParam as ClanFilter)
    : 'All';

  let initialData: MarketplaceSkinsResponse = { items: [], total: 0, nextCursor: null };
  let featuredSkins: SkinListItem[] = [];

  try {
    const [mainRes, featuredRes] = await Promise.all([
      fetchMarketSkins({
        sort: tabToSort(tab),
        ...(clan !== 'All' && { clan }),
        limit: 24,
      }),
      fetchMarketSkins({ sort: 'featured', limit: 8 }),
    ]);
    initialData = mainRes;
    featuredSkins = featuredRes.items;
  } catch {
    // SSR 降级：返回空数据，客户端 hydration 后重新请求
  }

  return {
    props: {
      initialData,
      initialTab: tab,
      initialClan: clan,
      featuredSkins,
    },
  };
};

// ---------------------------------------------------------------------------
// Skeleton Card
// ---------------------------------------------------------------------------

function SkinCardSkeleton() {
  return (
    <div className="flex flex-col overflow-hidden rounded-xl border border-gray-700 bg-gray-800 animate-pulse">
      <div className="aspect-square w-full bg-gray-700" />
      <div className="flex flex-col gap-2 p-3">
        <div className="flex items-center gap-2">
          <div className="h-4 w-12 rounded bg-gray-700" />
          <div className="h-4 flex-1 rounded bg-gray-700" />
        </div>
        <div className="h-3 w-20 rounded bg-gray-700" />
        <div className="flex gap-3">
          <div className="h-3 w-10 rounded bg-gray-700" />
          <div className="h-3 w-10 rounded bg-gray-700" />
          <div className="h-3 w-10 rounded bg-gray-700" />
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function MarketPage({
  initialData,
  initialTab,
  initialClan,
  featuredSkins,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  const { t } = useLocalization();
  const { addItem } = useCart();

  const [tab, setTab] = useState<Tab>(initialTab);
  const [clan, setClan] = useState<ClanFilter>(initialClan);
  const [items, setItems] = useState<SkinListItem[]>(initialData.items);
  const [nextCursor, setNextCursor] = useState<string | null>(initialData.nextCursor);
  const [total, setTotal] = useState<number>(initialData.total);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [axpPurchaseSkin, setAxpPurchaseSkin] = useState<SkinListItem | null>(null);

  // -------------------------------------------------------------------------
  // Fetch helper
  // -------------------------------------------------------------------------

  const fetchSkins = useCallback(
    async (newTab: Tab, newClan: ClanFilter) => {
      setIsLoading(true);
      try {
        const res = await fetchMarketSkins({
          sort: tabToSort(newTab),
          ...(newClan !== 'All' && { clan: newClan }),
          limit: 24,
        });
        setItems(res.items);
        setNextCursor(res.nextCursor);
        setTotal(res.total);
      } catch {
        // 保持当前数据，用户可重试
      } finally {
        setIsLoading(false);
      }
    },
    [],
  );

  const loadMore = useCallback(async () => {
    if (!nextCursor || isLoadingMore) return;
    setIsLoadingMore(true);
    try {
      const res = await fetchMarketSkins({
        sort: tabToSort(tab),
        ...(clan !== 'All' && { clan }),
        limit: 24,
        cursor: nextCursor,
      });
      setItems((prev) => [...prev, ...res.items]);
      setNextCursor(res.nextCursor);
      setTotal(res.total);
    } catch {
      // 静默失败
    } finally {
      setIsLoadingMore(false);
    }
  }, [nextCursor, isLoadingMore, tab, clan]);

  // -------------------------------------------------------------------------
  // Tab / Clan change handlers
  // -------------------------------------------------------------------------

  const handleTabChange = (newTab: Tab) => {
    if (newTab === tab) return;
    setTab(newTab);
    fetchSkins(newTab, clan);
  };

  const handleClanChange = (newClan: ClanFilter) => {
    if (newClan === clan) return;
    setClan(newClan);
    fetchSkins(tab, newClan);
  };

  // -------------------------------------------------------------------------
  // Add to Cart handler
  // -------------------------------------------------------------------------

  const handleAddToCart = useCallback(
    (skin: SkinListItem) => {
      const productId = skin.listingId || skin.id;
      addItem(productId, 1, {
        id: productId,
        name: skin.displayName,
        price: skin.priceUsd || 0,
        currency: 'USD',
        stock: 1,
      });
    },
    [addItem],
  );

  // -------------------------------------------------------------------------
  // SEO
  // -------------------------------------------------------------------------

  const seo = buildSeo({
    title: 'Agentrix Market - Pet Skin Trading',
    description: t({
      zh: '发现热门宠物皮肤，浏览最新上架和排行榜。在 Agentrix 移动端完成购买和拍卖。',
      en: 'Discover trending pet skins, browse new listings and leaderboards. Complete purchases and auctions on the Agentrix mobile app.',
    }),
    path: '/market',
  });

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  return (
    <MarketplaceLayout seo={seo} activeSection="skins">
      <div className="container mx-auto px-4 py-6 md:px-6">
        {/* ─── Featured Skins Carousel ─── */}
        <FeaturedSkinsCarousel skins={featuredSkins} />

        {/* ─── Info Banner: Transactions on Mobile ─── */}
        <div className="mb-6 flex items-center gap-3 rounded-xl border border-blue-500/20 bg-blue-500/5 px-4 py-3">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-500/10">
            <Smartphone size={16} className="text-blue-400" />
          </div>
          <p className="text-sm text-gray-300">
            {t({
              zh: '下载 Agentrix App 获得 AI 宠物陪伴体验、审核管理和分享裂变功能。Web 端支持完整的浏览和购买流程。',
              en: 'Download the Agentrix App for AI pet companion experience, approval management, and social sharing. Full browsing and purchasing available on web.',
            })}
          </p>
        </div>

        {/* ─── Tabs ─── */}
        <div className="flex gap-2">
          {TABS.map((t2) => {
            const isActive = tab === t2;
            return (
              <button
                key={t2}
                type="button"
                onClick={() => handleTabChange(t2)}
                className={`inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-gray-800 text-white'
                    : 'text-gray-400 hover:bg-gray-800/50 hover:text-white'
                }`}
                aria-pressed={isActive}
              >
                {t2 === 'trending' && <TrendingUp size={14} />}
                {t2 === 'new' && <Clock size={14} />}
                {t2 === 'leaderboard' && <Trophy size={14} />}
                {t2 === 'trending'
                  ? t({ zh: '热门', en: 'Trending' })
                  : t2 === 'new'
                    ? t({ zh: '最新', en: 'New' })
                    : t({ zh: '排行榜', en: 'Leaderboard' })}
              </button>
            );
          })}
        </div>

        {/* ─── Clan Filter ─── */}
        <div className="mt-4 flex flex-wrap items-center gap-2">
          {CLANS.map((c) => {
            const isActive = clan === c;
            return (
              <button
                key={c}
                type="button"
                onClick={() => handleClanChange(c)}
                className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                  isActive
                    ? 'bg-purple-600 text-white'
                    : 'bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-white'
                }`}
                aria-pressed={isActive}
              >
                {c === 'All' ? t({ zh: '全部', en: 'All' }) : `Clan ${c}`}
              </button>
            );
          })}
        </div>

        {/* ─── Content Grid ─── */}
        <div className="mt-6">
          {isLoading ? (
            // Skeleton loading
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {Array.from({ length: 12 }).map((_, i) => (
                <SkinCardSkeleton key={i} />
              ))}
            </div>
          ) : items.length === 0 ? (
            // Empty state
            <div className="flex flex-col items-center justify-center py-20">
              <p className="text-gray-400">
                {t({
                  zh: '暂无皮肤数据',
                  en: 'No skins found',
                })}
              </p>
            </div>
          ) : tab === 'leaderboard' ? (
            // Leaderboard: numbered ranking display
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {items.map((skin, index) => (
                <div key={skin.id} className="relative">
                  {/* Rank badge */}
                  <div className="absolute -left-1 -top-1 z-10 flex h-6 w-6 items-center justify-center rounded-full bg-yellow-500 text-xs font-bold text-black shadow-md">
                    {index + 1}
                  </div>
                  <SkinCard skin={skin} onAddToCart={handleAddToCart} onBuyWithAxp={(skin) => setAxpPurchaseSkin(skin)} />
                </div>
              ))}
            </div>
          ) : (
            // Trending / New: standard grid
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {items.map((skin) => (
                <SkinCard key={skin.id} skin={skin} onAddToCart={handleAddToCart} onBuyWithAxp={(skin) => setAxpPurchaseSkin(skin)} />
              ))}
            </div>
          )}
        </div>

        {/* ─── Load More ─── */}
        {nextCursor && !isLoading && (
          <div className="mt-8 flex justify-center">
            <button
              type="button"
              onClick={loadMore}
              disabled={isLoadingMore}
              className="inline-flex items-center gap-2 rounded-lg border border-gray-700 bg-gray-800 px-6 py-2.5 text-sm font-medium text-white transition-colors hover:border-gray-600 hover:bg-gray-700 disabled:opacity-50"
            >
              {isLoadingMore && <Loader2 size={14} className="animate-spin" />}
              {t({ zh: '加载更多', en: 'Load More' })}
            </button>
          </div>
        )}

        {/* ─── Total count ─── */}
        {!isLoading && total > 0 && (
          <p className="mt-4 text-center text-xs text-gray-500">
            {t({
              zh: `共 ${total} 个皮肤`,
              en: `${total} skins total`,
            })}
          </p>
        )}
      </div>

      {/* AXP Purchase Modal */}
      <AxpPurchaseModal
        skin={axpPurchaseSkin}
        open={!!axpPurchaseSkin}
        onClose={() => setAxpPurchaseSkin(null)}
      />
    </MarketplaceLayout>
  );
}
