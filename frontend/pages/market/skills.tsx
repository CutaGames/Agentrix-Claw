/**
 * /market/skills — 技能市场页面 (Skill Marketplace)
 *
 * 展示可安装到宠物的技能列表，支持分类过滤、详情面板展开、
 * JSON-LD 结构化数据、skeleton loading、错误处理和空状态。
 *
 * Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 9.3, 10.2
 */

import { useState, useMemo, useCallback } from 'react';
import { GetServerSideProps, InferGetServerSidePropsType } from 'next';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { X, RefreshCw, AlertCircle } from 'lucide-react';
import { MarketplaceLayout } from '../../components/marketplace/MarketplaceLayout';
import { SkillCard } from '../../components/marketplace/SkillCard';
import { MobileDeepLink } from '../../components/marketplace/MobileDeepLink';
import { buildSeo } from '../../lib/seo';
import { useLocalization } from '../../contexts/LocalizationContext';
import {
  fetchSkillListings,
  SkillListingsResponse,
  SkillListItem,
} from '../../services/marketplaceApi';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SkillsPageProps {
  initialData: SkillListingsResponse;
  error: boolean;
}

// ---------------------------------------------------------------------------
// SSR
// ---------------------------------------------------------------------------

export const getServerSideProps: GetServerSideProps<SkillsPageProps> = async () => {
  let initialData: SkillListingsResponse = { items: [], total: 0 };
  let error = false;

  try {
    initialData = await fetchSkillListings({ status: 'approved' });
  } catch {
    error = true;
  }

  return {
    props: {
      initialData,
      error,
    },
  };
};

// ---------------------------------------------------------------------------
// JSON-LD Generator
// ---------------------------------------------------------------------------

export function generateSkillJsonLd(skill: SkillListItem) {
  return {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: skill.title,
    description: skill.description,
    offers: {
      '@type': 'Offer',
      price: skill.price,
      priceCurrency: skill.currency || 'USD',
    },
  };
}

// ---------------------------------------------------------------------------
// Skeleton
// ---------------------------------------------------------------------------

function SkillCardSkeleton() {
  return (
    <div className="flex flex-col rounded-xl border border-gray-700 bg-gray-800/50 p-4 animate-pulse">
      {/* Header */}
      <div className="mb-3 flex items-center justify-between">
        <div className="h-5 w-16 rounded-full bg-gray-700" />
        <div className="h-4 w-12 rounded bg-gray-700" />
      </div>
      {/* Title */}
      <div className="mb-1.5 h-4 w-3/4 rounded bg-gray-700" />
      {/* Description */}
      <div className="mb-1 h-3 w-full rounded bg-gray-700" />
      <div className="mb-3 h-3 w-2/3 rounded bg-gray-700" />
      {/* Stats */}
      <div className="border-t border-gray-700/50 pt-3">
        <div className="flex gap-3">
          <div className="h-3 w-16 rounded bg-gray-700" />
          <div className="h-3 w-12 rounded bg-gray-700" />
          <div className="h-3 w-14 rounded bg-gray-700" />
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function SkillsMarketplacePage({
  initialData,
  error: initialError,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  const { t } = useLocalization();
  const router = useRouter();

  const [items, setItems] = useState<SkillListItem[]>(initialData.items);
  const [isLoading, setIsLoading] = useState(false);
  const [hasError, setHasError] = useState(initialError);
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [selectedSkill, setSelectedSkill] = useState<SkillListItem | null>(null);

  // -------------------------------------------------------------------------
  // Derived: unique categories from data
  // -------------------------------------------------------------------------

  const categories = useMemo(() => {
    const cats = new Set<string>();
    items.forEach((item) => {
      if (item.category) cats.add(item.category);
    });
    return ['All', ...Array.from(cats).sort()];
  }, [items]);

  // -------------------------------------------------------------------------
  // Filtered items
  // -------------------------------------------------------------------------

  const filteredItems = useMemo(() => {
    if (selectedCategory === 'All') return items;
    return items.filter((item) => item.category === selectedCategory);
  }, [items, selectedCategory]);

  // -------------------------------------------------------------------------
  // Retry handler
  // -------------------------------------------------------------------------

  const handleRetry = useCallback(async () => {
    setIsLoading(true);
    setHasError(false);
    try {
      const res = await fetchSkillListings({ status: 'approved' });
      setItems(res.items);
    } catch {
      setHasError(true);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // -------------------------------------------------------------------------
  // Skill selection
  // -------------------------------------------------------------------------

  const handleSelectSkill = useCallback((skill: SkillListItem) => {
    setSelectedSkill((prev) => (prev?.id === skill.id ? null : skill));
  }, []);

  const handleCloseDetail = useCallback(() => {
    setSelectedSkill(null);
  }, []);

  // -------------------------------------------------------------------------
  // SEO
  // -------------------------------------------------------------------------

  const seo = buildSeo({
    title: 'Agentrix Skills Marketplace',
    description: t({
      zh: '浏览和发现可安装到宠物的技能。在 Agentrix 移动端完成安装。',
      en: 'Browse and discover skills to install on your pet. Complete installation on the Agentrix mobile app.',
    }),
    path: '/market/skills',
  });

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  return (
    <MarketplaceLayout seo={seo} activeSection="skills">
      {/* JSON-LD structured data for each skill */}
      <Head>
        {filteredItems.map((skill) => (
          <script
            key={skill.id}
            type="application/ld+json"
            dangerouslySetInnerHTML={{
              __html: JSON.stringify(generateSkillJsonLd(skill)),
            }}
          />
        ))}
      </Head>

      <div className="container mx-auto px-4 py-6 md:px-6">
        {/* ─── Page Header ─── */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-white">
            {t({ zh: '技能市场', en: 'Skills Marketplace' })}
          </h1>
          <p className="mt-1 text-sm text-gray-400">
            {t({
              zh: '发现并安装技能，让你的宠物更强大',
              en: 'Discover and install skills to make your pet more powerful',
            })}
          </p>
        </div>

        {/* ─── Category Filter (horizontal pill buttons) ─── */}
        <div className="mb-6 flex flex-wrap items-center gap-2">
          {categories.map((cat) => {
            const isActive = selectedCategory === cat;
            return (
              <button
                key={cat}
                type="button"
                onClick={() => setSelectedCategory(cat)}
                className={`rounded-full px-3.5 py-1.5 text-xs font-medium transition-colors ${
                  isActive
                    ? 'bg-purple-600 text-white'
                    : 'bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-white'
                }`}
                aria-pressed={isActive}
              >
                {cat === 'All' ? t({ zh: '全部', en: 'All' }) : cat}
              </button>
            );
          })}
        </div>

        {/* ─── Content ─── */}
        {isLoading ? (
          // Skeleton loading
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <SkillCardSkeleton key={i} />
            ))}
          </div>
        ) : hasError ? (
          // Error state
          <div className="flex flex-col items-center justify-center py-20">
            <AlertCircle size={40} className="mb-3 text-red-400" />
            <p className="mb-4 text-gray-400">
              {t({
                zh: '加载技能列表失败，请重试',
                en: 'Failed to load skills. Please try again.',
              })}
            </p>
            <button
              type="button"
              onClick={handleRetry}
              className="inline-flex items-center gap-2 rounded-lg border border-gray-700 bg-gray-800 px-4 py-2 text-sm font-medium text-white transition-colors hover:border-gray-600 hover:bg-gray-700"
            >
              <RefreshCw size={14} />
              {t({ zh: '重试', en: 'Retry' })}
            </button>
          </div>
        ) : filteredItems.length === 0 ? (
          // Empty state
          <div className="flex flex-col items-center justify-center py-20">
            <p className="text-gray-400">
              {t({
                zh: '暂无可用技能',
                en: 'No skills available',
              })}
            </p>
          </div>
        ) : (
          // Skills grid + detail panel
          <div className="flex flex-col gap-6 lg:flex-row">
            {/* Grid */}
            <div className={`flex-1 ${selectedSkill ? 'lg:max-w-[60%]' : ''}`}>
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {filteredItems.map((skill) => (
                  <SkillCard
                    key={skill.id}
                    skill={skill}
                    onSelect={handleSelectSkill}
                    isSelected={selectedSkill?.id === skill.id}
                  />
                ))}
              </div>
            </div>

            {/* Detail Panel */}
            {selectedSkill && (
              <aside className="w-full shrink-0 lg:w-[380px]">
                <div className="sticky top-20 rounded-xl border border-gray-700 bg-gray-800/80 p-5">
                  {/* Close button */}
                  <button
                    type="button"
                    onClick={handleCloseDetail}
                    className="absolute right-3 top-3 rounded-lg p-1 text-gray-400 transition-colors hover:bg-gray-700 hover:text-white"
                    aria-label={t({ zh: '关闭详情', en: 'Close details' })}
                  >
                    <X size={16} />
                  </button>

                  {/* Skill name */}
                  <h2 className="mb-2 pr-8 text-lg font-bold text-white">
                    {selectedSkill.title}
                  </h2>

                  {/* Category */}
                  <span className="mb-3 inline-block rounded-full bg-gray-700/60 px-2.5 py-1 text-[11px] font-medium text-gray-300">
                    {selectedSkill.category}
                  </span>

                  {/* Full description */}
                  <p className="mb-4 text-sm leading-relaxed text-gray-300">
                    {selectedSkill.description}
                  </p>

                  {/* Pricing */}
                  <div className="mb-4 rounded-lg border border-gray-700 bg-gray-900/50 p-3">
                    <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-500">
                      {t({ zh: '定价', en: 'Pricing' })}
                    </h3>
                    <div className="flex items-baseline gap-2">
                      <span className="text-xl font-bold text-green-400">
                        {selectedSkill.price > 0
                          ? `$${selectedSkill.price.toFixed(2)}`
                          : 'Free'}
                      </span>
                      {selectedSkill.price > 0 && (
                        <span className="text-xs text-gray-500">
                          {selectedSkill.currency || 'USD'}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Revenue Split */}
                  <div className="mb-4 rounded-lg border border-gray-700 bg-gray-900/50 p-3">
                    <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-500">
                      {t({ zh: '收益分成', en: 'Revenue Split' })}
                    </h3>
                    <div className="flex items-center gap-4">
                      <div className="flex-1">
                        <div className="mb-1 text-xs text-gray-400">
                          {t({ zh: '开发者', en: 'Developer' })}
                        </div>
                        <div className="text-sm font-semibold text-white">
                          {selectedSkill.revenueSplit.developer}%
                        </div>
                      </div>
                      <div className="h-8 w-px bg-gray-700" />
                      <div className="flex-1">
                        <div className="mb-1 text-xs text-gray-400">
                          {t({ zh: '平台', en: 'Platform' })}
                        </div>
                        <div className="text-sm font-semibold text-white">
                          {selectedSkill.revenueSplit.platform}%
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* AXP Earning Estimate */}
                  {selectedSkill.axpEarningEstimate > 0 && (
                    <div className="mb-4 rounded-lg border border-yellow-500/20 bg-yellow-500/5 p-3">
                      <h3 className="mb-1 text-xs font-semibold uppercase tracking-wider text-yellow-500">
                        {t({ zh: 'AXP 收益预估', en: 'AXP Earning Estimate' })}
                      </h3>
                      <p className="text-sm text-yellow-400">
                        ~{selectedSkill.axpEarningEstimate} AXP{' '}
                        <span className="text-xs text-gray-500">
                          {t({ zh: '/ 每次调用', en: '/ per invocation' })}
                        </span>
                      </p>
                    </div>
                  )}

                  {/* Primary CTA: Install / Purchase */}
                  <button
                    type="button"
                    onClick={() => router.push(`/pay/checkout?skillId=${selectedSkill.id}`)}
                    className="mb-3 flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-3 text-sm font-bold text-white transition-colors hover:bg-blue-500"
                  >
                    {selectedSkill.price > 0
                      ? t({ zh: '购买并安装', en: 'Purchase & Install' })
                      : t({ zh: '安装', en: 'Install' })}
                  </button>

                  {/* Secondary: Mobile Deep Link */}
                  <div className="rounded-lg border border-gray-700 bg-gray-900/50 p-3">
                    <p className="mb-2 text-xs text-gray-500">
                      {t({ zh: '也可在 App 中安装', en: 'Also available on mobile' })}
                    </p>
                    <MobileDeepLink
                      action="install_skill"
                      resourceId={selectedSkill.id}
                      showQR={false}
                    />
                  </div>
                </div>
              </aside>
            )}
          </div>
        )}

        {/* ─── Total count ─── */}
        {!isLoading && !hasError && filteredItems.length > 0 && (
          <p className="mt-6 text-center text-xs text-gray-500">
            {t({
              zh: `共 ${filteredItems.length} 个技能`,
              en: `${filteredItems.length} skills total`,
            })}
          </p>
        )}
      </div>
    </MarketplaceLayout>
  );
}
