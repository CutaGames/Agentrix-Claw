/**
 * FeaturedSkinsCarousel — 精选皮肤横向滚动展示
 *
 * 在 /market 页面顶部展示精选皮肤，替代原 /showcase 页面功能。
 * 支持横向滚动、自动轮播、响应式布局。
 *
 * Requirements: 6.1, 8.1
 */

import { useRef, useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { ChevronLeft, ChevronRight, Sparkles } from 'lucide-react';
import { useLocalization } from '../../contexts/LocalizationContext';
import type { SkinListItem } from '../../services/marketplaceApi';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface FeaturedSkinsCarouselProps {
  skins: SkinListItem[];
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function FeaturedSkinsCarousel({ skins }: FeaturedSkinsCarouselProps) {
  const { t } = useLocalization();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(true);

  // -------------------------------------------------------------------------
  // Scroll state tracking
  // -------------------------------------------------------------------------

  const updateScrollState = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 0);
    setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 1);
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    updateScrollState();
    el.addEventListener('scroll', updateScrollState, { passive: true });
    window.addEventListener('resize', updateScrollState);
    return () => {
      el.removeEventListener('scroll', updateScrollState);
      window.removeEventListener('resize', updateScrollState);
    };
  }, [updateScrollState]);

  // -------------------------------------------------------------------------
  // Scroll handlers
  // -------------------------------------------------------------------------

  const scroll = (direction: 'left' | 'right') => {
    const el = scrollRef.current;
    if (!el) return;
    const scrollAmount = el.clientWidth * 0.8;
    el.scrollBy({
      left: direction === 'left' ? -scrollAmount : scrollAmount,
      behavior: 'smooth',
    });
  };

  // -------------------------------------------------------------------------
  // Empty state
  // -------------------------------------------------------------------------

  if (!skins || skins.length === 0) return null;

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  return (
    <section id="featured" className="mb-8" aria-label="Featured skins">
      {/* Header */}
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Sparkles size={18} className="text-yellow-400" />
          <h2 className="text-lg font-semibold text-white">
            {t({ zh: '精选皮肤', en: 'Featured Skins' })}
          </h2>
        </div>

        {/* Scroll controls */}
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => scroll('left')}
            disabled={!canScrollLeft}
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-gray-700 bg-gray-800 text-gray-400 transition-colors hover:border-gray-600 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed"
            aria-label={t({ zh: '向左滚动', en: 'Scroll left' })}
          >
            <ChevronLeft size={16} />
          </button>
          <button
            type="button"
            onClick={() => scroll('right')}
            disabled={!canScrollRight}
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-gray-700 bg-gray-800 text-gray-400 transition-colors hover:border-gray-600 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed"
            aria-label={t({ zh: '向右滚动', en: 'Scroll right' })}
          >
            <ChevronRight size={16} />
          </button>
        </div>
      </div>

      {/* Scrollable row */}
      <div
        ref={scrollRef}
        className="flex gap-4 overflow-x-auto scroll-smooth pb-2 scrollbar-hide"
        style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
      >
        {skins.map((skin) => (
          <Link
            key={skin.id}
            href={`/market/skin/${skin.id}`}
            className="group flex-shrink-0 w-48 sm:w-56 overflow-hidden rounded-xl border border-gray-700 bg-gray-800 transition-all hover:border-purple-500/50 hover:shadow-lg hover:shadow-purple-500/10"
          >
            {/* Thumbnail */}
            <div className="relative aspect-square w-full overflow-hidden bg-gray-700">
              {skin.thumbnailUrl ? (
                <img
                  src={skin.thumbnailUrl}
                  alt={skin.displayName}
                  className="h-full w-full object-cover transition-transform group-hover:scale-105"
                  loading="lazy"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-gray-500">
                  <Sparkles size={32} />
                </div>
              )}
              {/* Featured badge */}
              <div className="absolute left-2 top-2 rounded-md bg-yellow-500/90 px-1.5 py-0.5 text-[10px] font-bold text-black">
                FEATURED
              </div>
            </div>

            {/* Info */}
            <div className="p-3">
              <p className="truncate text-sm font-medium text-white group-hover:text-purple-300">
                {skin.displayName}
              </p>
              <p className="mt-0.5 text-xs text-gray-400">
                {skin.creatorUsername}
              </p>
              {skin.priceUsd !== null && (
                <p className="mt-1 text-sm font-semibold text-green-400">
                  ${skin.priceUsd.toFixed(2)}
                </p>
              )}
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}

export default FeaturedSkinsCarousel;
