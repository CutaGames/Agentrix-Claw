/**
 * SkinCard — 皮肤市场卡片组件
 *
 * 展示单个宠物皮肤的卡片，包含缩略图、标题、创作者、统计数据、
 * 价格/拍卖信息、AXP 标记等。
 * 支持 "Add to Cart" 和 "Bid Now" 按钮回调。
 *
 * Requirements: 1.4, 2.4, 6.2, 6.3, 10.1
 */

import Image from 'next/image';
import Link from 'next/link';
import { Heart, Eye, GitBranch, Zap, Timer, ShoppingCart, Gavel } from 'lucide-react';
import { useLocalization } from '../../contexts/LocalizationContext';
import type { SkinListItem } from '../../services/marketplaceApi';

// ---------------------------------------------------------------------------
// Clan gradient mapping
// ---------------------------------------------------------------------------

const CLAN_GRADIENTS: Record<SkinListItem['clan'], string> = {
  A: 'from-blue-500 to-cyan-500',    // office
  B: 'from-green-500 to-emerald-500', // life
  C: 'from-purple-500 to-violet-500', // learn
  D: 'from-orange-500 to-yellow-500', // play
  E: 'from-pink-500 to-rose-500',     // web3
  F: 'from-teal-500 to-sky-500',      // family
};

const CLAN_LABELS: Record<SkinListItem['clan'], string> = {
  A: 'Office',
  B: 'Life',
  C: 'Learn',
  D: 'Play',
  E: 'Web3',
  F: 'Family',
};

// ---------------------------------------------------------------------------
// Helper: format time remaining for auction countdown
// ---------------------------------------------------------------------------

function formatTimeRemaining(auctionEndsAt: string): string {
  const now = Date.now();
  const end = new Date(auctionEndsAt).getTime();
  const diff = end - now;

  if (diff <= 0) return 'Ended';

  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

  if (days > 0) return `${days}d ${hours}h left`;
  if (hours > 0) return `${hours}h ${minutes}m left`;
  return `${minutes}m left`;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export interface SkinCardProps {
  skin: SkinListItem;
  onAddToCart?: (skin: SkinListItem) => void;
  onBid?: (skin: SkinListItem) => void;
}

export function SkinCard({ skin, onAddToCart, onBid }: SkinCardProps) {
  const { t } = useLocalization();
  const {
    id,
    thumbnailUrl,
    displayName,
    clan,
    source,
    creatorUsername,
    likeCount,
    viewCount,
    remixCount,
    listingMode,
    priceUsd,
    currentBidUsd,
    auctionEndsAt,
    axpAccepted,
    axpDiscountPercent,
    featured,
  } = skin;

  const gradient = CLAN_GRADIENTS[clan];
  const clanLabel = CLAN_LABELS[clan];
  const showCreator = source !== 'platform';
  const showPrice = priceUsd !== null;
  const showAuction = listingMode === 'auction' && auctionEndsAt;
  const showAxp = axpAccepted === true;

  return (
    <Link
      href={`/market/skin/${id}`}
      className={`group relative flex flex-col overflow-hidden rounded-xl border transition-all hover:shadow-lg hover:shadow-black/20 ${
        featured
          ? 'border-yellow-500/50 ring-1 ring-yellow-500/30'
          : 'border-gray-700 hover:border-gray-600'
      } bg-gray-800`}
    >
      {/* Featured badge */}
      {featured && (
        <div className="absolute left-2 top-2 z-10 rounded-md bg-yellow-500/90 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-black">
          Featured
        </div>
      )}

      {/* Thumbnail / Gradient fallback */}
      <div className="relative aspect-square w-full overflow-hidden">
        {thumbnailUrl ? (
          <Image
            src={thumbnailUrl}
            alt={displayName}
            fill
            className="object-cover transition-transform duration-300 group-hover:scale-105"
            sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
          />
        ) : (
          <div
            className={`flex h-full w-full items-center justify-center bg-gradient-to-br ${gradient}`}
          >
            <span className="text-3xl font-bold text-white/60">{clan}</span>
          </div>
        )}

        {/* AXP Accepted badge (overlay on image) */}
        {showAxp && (
          <div className="absolute right-2 top-2 z-10 flex items-center gap-1 rounded-md bg-yellow-500/90 px-1.5 py-0.5 text-[10px] font-bold text-black">
            <Zap size={10} />
            AXP -{axpDiscountPercent}%
          </div>
        )}
      </div>

      {/* Content */}
      <div className="flex flex-1 flex-col gap-2 p-3">
        {/* Clan badge + Name */}
        <div className="flex items-start gap-2">
          <span
            className={`inline-flex shrink-0 items-center rounded bg-gradient-to-r ${gradient} px-1.5 py-0.5 text-[9px] font-bold uppercase text-white`}
          >
            {clanLabel}
          </span>
          <h3 className="line-clamp-1 flex-1 text-sm font-semibold text-white">
            {displayName}
          </h3>
        </div>

        {/* Creator */}
        {showCreator && (
          <p className="text-xs text-gray-400">@{creatorUsername}</p>
        )}

        {/* Stats row */}
        <div className="flex items-center gap-3 text-xs text-gray-400">
          <span className="flex items-center gap-1">
            <Heart size={12} />
            {likeCount}
          </span>
          <span className="flex items-center gap-1">
            <Eye size={12} />
            {viewCount}
          </span>
          <span className="flex items-center gap-1">
            <GitBranch size={12} />
            {remixCount}
          </span>
        </div>

        {/* Price / Auction / Add to Cart */}
        {showAuction ? (
          <div className="mt-auto space-y-1.5">
            <div className="flex items-center justify-between rounded-lg bg-gray-900 px-2.5 py-1.5">
              <div className="flex items-center gap-1.5 text-xs">
                <Timer size={12} className="text-orange-400" />
                <span className="font-medium text-orange-400">
                  {formatTimeRemaining(auctionEndsAt)}
                </span>
              </div>
              <span className="text-xs font-bold text-white">
                ${currentBidUsd?.toFixed(2) ?? '0.00'}
              </span>
            </div>
            {onBid && (
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onBid(skin);
                }}
                className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-orange-600 px-2.5 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-orange-500"
              >
                <Gavel size={12} />
                {t({ zh: '出价', en: 'Bid Now' })}
              </button>
            )}
          </div>
        ) : showPrice ? (
          <div className="mt-auto space-y-1.5">
            <div className="flex items-center justify-between rounded-lg bg-gray-900 px-2.5 py-1.5">
              <span className="text-xs font-bold text-white">
                ${priceUsd.toFixed(2)}
              </span>
            </div>
            {onAddToCart && (
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onAddToCart(skin);
                }}
                className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-blue-600 px-2.5 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-blue-500"
              >
                <ShoppingCart size={12} />
                {t({ zh: '加入购物车', en: 'Add to Cart' })}
              </button>
            )}
          </div>
        ) : null}
      </div>
    </Link>
  );
}

export default SkinCard;
