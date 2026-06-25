/**
 * /showcase — 每日精选宠物皮肤画廊
 *
 * SSR 首屏加载 + 客户端无限滚动分页。
 * 支持 Clan 过滤（A-F）和排序选择器（featured/newest/popular）。
 *
 * Requirements: 1.1, 1.2, 1.3, 1.5, 2.1, 2.2, 2.3, 2.5, 3.1, 3.2, 3.3, 3.4, 3.5, 10.4
 */

import { GetServerSideProps, InferGetServerSidePropsType } from 'next';
import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Filter, ArrowUpDown, Plus, RefreshCw, Sparkles, Trophy } from 'lucide-react';

import { MarketplaceLayout } from '../components/marketplace/MarketplaceLayout';
import { SkinCard } from '../components/marketplace/SkinCard';
import { SkinCardSkeleton } from '../components/marketplace/SkinCardSkeleton';
import { useLocalization } from '../contexts/LocalizationContext';
import { buildSeo } from '../lib/seo';
import {
  fetchMarketSkins,
  type MarketplaceSkinsParams,
  type MarketplaceSkinsResponse,
  type SkinListItem,
} from '../services/marketplaceApi';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ClanFilter = 'All' | 'A' | 'B' | 'C' | 'D' | 'E' | 'F';
type SortOption = 'featured' | 'newest' | 'popular';

interface ShowcasePageProps {
  initialData: MarketplaceSkinsResponse | null;
  initialError: boolean;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CLANS: ClanFilter[] = ['All', 'A', 'B', 'C', 'D', 'E', 'F'];
const SORT_OPTIONS: { value: SortOption; labelZh: string; labelEn: string }[] = [
  { value: 'featured', labelZh: '精选', labelEn: 'Featured' },
  { value: 'newest', labelZh: '最新', labelEn: 'Newest' },
  { value: 'popular', labelZh: '热门', labelEn: 'Popular' },
];
const PAGE_SIZE = 24;

// ---------------------------------------------------------------------------
// SSR: getServerSideProps
// ---------------------------------------------------------------------------

export const getServerSideProps: GetServerSideProps<ShowcasePageProps> = async () => {
  try {
    const data = await fetchMarketSkins({ sort: 'featured', limit: PAGE_SIZE });
    return { props: { initialData: data, initialError: false } };
  } catch {
    return { props: { initialData: null, initialError: true } };
  }
};

// ---------------------------------------------------------------------------
// Page Component
// ---------------------------------------------------------------------------

export default function ShowcasePage({
  initialData,
  initialError,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  const { t } = useLocalization();

  // ─── State ───
  const [skins, setSkins] = useState<SkinListItem[]>(initialData?.items ?? []);
  const [nextCursor, setNextCursor] = useState<string | null>(initialData?.nextCursor ?? null);
  const [selectedClan, setSelectedClan] = useState<ClanFilter>('All');
  const [sortBy, setSortBy] = useState<SortOption>('featured');
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [error, setError] = useState(initialError);

  // ─── Refs ───
  const sentinelRef = useRef<HTMLDivElement>(null);
  const isLoadingMoreRef = useRef(false);

  // ─── SEO ───
  const seo = buildSeo({
    title: 'Agentrix Showcase - Pet Skins Gallery',
    description: t({
      zh: '浏览 Agentrix 社区创作的精选宠物皮肤，发现灵感，Remix 创作。',
      en: 'Browse featured pet skins created by the Agentrix community. Find inspiration, remix and create.',
    }),
    path: '/showcase',
  });

  // ─── Fetch helper ───
  const fetchSkins = useCallback(
    async (params: MarketplaceSkinsParams, append = false) => {
      if (!append) setIsLoading(true);
      else setIsLoadingMore(true);

      try {
        const data = await fetchMarketSkins(params);
        if (append) {
          setSkins((prev) => [...prev, ...data.items]);
        } else {
          setSkins(data.items);
        }
        setNextCursor(data.nextCursor);
        setError(false);
      } catch {
        if (!append) {
          setError(true);
          setSkins([]);
          setNextCursor(null);
        }
      } finally {
        setIsLoading(false);
        setIsLoadingMore(false);
        isLoadingMoreRef.current = false;
      }
    },
    [],
  );

  // ─── Filter/Sort change → refetch ───
  useEffect(() => {
    const params: MarketplaceSkinsParams = {
      sort: sortBy,
      limit: PAGE_SIZE,
    };
    if (selectedClan !== 'All') {
      params.clan = selectedClan as MarketplaceSkinsParams['clan'];
    }
    fetchSkins(params);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedClan, sortBy]);

  // ─── Infinite scroll via IntersectionObserver ───
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (entry.isIntersecting && nextCursor && !isLoadingMoreRef.current) {
          isLoadingMoreRef.current = true;
          const params: MarketplaceSkinsParams = {
            sort: sortBy,
            limit: PAGE_SIZE,
            cursor: nextCursor,
          };
          if (selectedClan !== 'All') {
            params.clan = selectedClan as MarketplaceSkinsParams['clan'];
          }
          fetchSkins(params, true);
        }
      },
      { rootMargin: '200px' },
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [nextCursor, sortBy, selectedClan, fetchSkins]);

  // ─── Retry handler ───
  const handleRetry = () => {
    const params: MarketplaceSkinsParams = {
      sort: sortBy,
      limit: PAGE_SIZE,
    };
    if (selectedClan !== 'All') {
      params.clan = selectedClan as MarketplaceSkinsParams['clan'];
    }
    fetchSkins(params);
  };

  // ─── Featured by Community section ───
  const featuredSkins = skins.filter((s) => s.featured);

  return (
    <MarketplaceLayout seo={seo} activeSection="showcase">
      {/* ─── Hero Section ─── */}
      <section className="border-b border-gray-800 bg-gray-950 pb-8 pt-12">
        <div className="container mx-auto px-4 md:px-6">
          <div className="text-center">
            <h1 className="text-3xl font-extrabold text-white md:text-4xl lg:text-5xl">
              {t({ zh: '🎨 今日精选', en: '🎨 Today\'s Picks' })}
            </h1>
            <p className="mx-auto mt-3 max-w-xl text-sm text-gray-400 md:text-base">
              {t({
                zh: '社区创作者每日上新的宠物皮肤精选。点击任意作品查看详情、Remix 或购买。',
                en: 'Daily curated pet skins from community creators. Click any piece to view details, remix or purchase.',
              })}
            </p>
          </div>

          {/* ─── Filters Row ─── */}
          <div className="mt-8 flex flex-col items-center gap-4 sm:flex-row sm:justify-between">
            {/* Clan filter pills */}
            <div className="flex flex-wrap items-center justify-center gap-2">
              <Filter size={14} className="text-gray-500" />
              {CLANS.map((clan) => (
                <button
                  key={clan}
                  type="button"
                  onClick={() => setSelectedClan(clan)}
                  className={`rounded-full px-3.5 py-1.5 text-xs font-semibold transition-colors ${
                    selectedClan === clan
                      ? 'bg-white text-gray-900'
                      : 'bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-white'
                  }`}
                  aria-pressed={selectedClan === clan}
                >
                  {clan === 'All' ? t({ zh: '全部', en: 'All' }) : `Clan ${clan}`}
                </button>
              ))}
            </div>

            {/* Sort selector */}
            <div className="flex items-center gap-2">
              <ArrowUpDown size={14} className="text-gray-500" />
              {SORT_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setSortBy(opt.value)}
                  className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
                    sortBy === opt.value
                      ? 'bg-white text-gray-900'
                      : 'bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-white'
                  }`}
                  aria-pressed={sortBy === opt.value}
                >
                  {t({ zh: opt.labelZh, en: opt.labelEn })}
                </button>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ─── Featured by Community Section ─── */}
      {featuredSkins.length > 0 && !isLoading && !error && (
        <section className="border-b border-gray-800 bg-gray-900/50 py-8">
          <div className="container mx-auto px-4 md:px-6">
            <div className="mb-5 flex items-center gap-2">
              <Trophy size={18} className="text-yellow-400" />
              <h2 className="text-lg font-bold text-white">
                {t({ zh: '社区精选', en: 'Featured by Community' })}
              </h2>
              <span className="ml-2 rounded-full bg-yellow-500/20 px-2 py-0.5 text-[10px] font-bold text-yellow-400">
                AXP
              </span>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
              {featuredSkins.slice(0, 4).map((skin) => (
                <SkinCard key={`featured-${skin.id}`} skin={skin} />
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ─── Main Gallery ─── */}
      <section className="py-8">
        <div className="container mx-auto px-4 md:px-6">
          {/* Create Your Own CTA */}
          <div className="mb-6 flex items-center justify-between">
            <h2 className="text-lg font-bold text-white">
              {t({ zh: '全部作品', en: 'All Works' })}
            </h2>
            <Link
              href="/console/pet/create"
              className="inline-flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-purple-600 to-blue-500 px-4 py-2 text-xs font-semibold text-white transition-opacity hover:opacity-90"
            >
              <Plus size={14} />
              {t({ zh: '创作你的宠物', en: 'Create Your Own' })}
            </Link>
          </div>

          {/* Error state */}
          {error && !isLoading && (
            <div className="flex flex-col items-center justify-center py-20">
              <p className="mb-4 text-sm text-gray-400">
                {t({
                  zh: '加载失败，请稍后重试',
                  en: 'Failed to load. Please try again later.',
                })}
              </p>
              <button
                type="button"
                onClick={handleRetry}
                className="inline-flex items-center gap-2 rounded-lg bg-gray-800 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-gray-700"
              >
                <RefreshCw size={14} />
                {t({ zh: '重试', en: 'Retry' })}
              </button>
            </div>
          )}

          {/* Loading skeleton (initial load) */}
          {isLoading && (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
              {Array.from({ length: PAGE_SIZE }, (_, i) => (
                <SkinCardSkeleton key={`skeleton-${i}`} />
              ))}
            </div>
          )}

          {/* Skin grid */}
          {!isLoading && !error && skins.length > 0 && (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
              {skins.map((skin) => (
                <SkinCard key={skin.id} skin={skin} />
              ))}
            </div>
          )}

          {/* Empty state */}
          {!isLoading && !error && skins.length === 0 && (
            <div className="flex flex-col items-center justify-center py-20">
              <Sparkles size={40} className="mb-4 text-gray-600" />
              <p className="mb-2 text-sm font-medium text-gray-300">
                {t({
                  zh: '该族群暂无精选作品',
                  en: 'No featured works for this clan yet',
                })}
              </p>
              <p className="mb-6 text-xs text-gray-500">
                {t({
                  zh: '成为第一个创作者吧！',
                  en: 'Be the first creator!',
                })}
              </p>
              <Link
                href="/console/pet/create"
                className="inline-flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-purple-600 to-blue-500 px-4 py-2 text-xs font-semibold text-white transition-opacity hover:opacity-90"
              >
                <Plus size={14} />
                {t({ zh: '开始创作', en: 'Start Creating' })}
              </Link>
            </div>
          )}

          {/* Loading more skeleton (infinite scroll) */}
          {isLoadingMore && (
            <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
              {Array.from({ length: 8 }, (_, i) => (
                <SkinCardSkeleton key={`more-skeleton-${i}`} />
              ))}
            </div>
          )}

          {/* Infinite scroll sentinel */}
          <div ref={sentinelRef} className="h-4" aria-hidden="true" />

          {/* End of results indicator */}
          {!isLoading && !error && skins.length > 0 && !nextCursor && (
            <p className="mt-8 text-center text-xs text-gray-500">
              {t({ zh: '已展示全部作品', en: 'All works displayed' })}
            </p>
          )}
        </div>
      </section>
    </MarketplaceLayout>
  );
}
