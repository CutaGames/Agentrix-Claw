/**
 * /market/skin/[id] — 皮肤详情页 (Skin Detail Page)
 *
 * SSR 获取皮肤详情数据，展示：
 * - Hero: 大图预览（图片或 3D viewer 占位）
 * - Info: displayName, clan, creator, stats (likes/views/remixes)
 * - Price/Auction: 当前价格或拍卖信息 + MobileDeepLink
 * - Remix Tree: parentSkinId 链接（如有）
 * - Transaction History: 占位区域
 * - Price History: 占位图表区域
 *
 * 动态 OG image 使用 skin thumbnailUrl，无则 fallback 默认图
 *
 * Requirements: 1.5, 6.5, 7.1, 7.2, 9.2
 */

import { GetServerSideProps, InferGetServerSidePropsType } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { ArrowLeft, Heart, Eye, GitBranch, Clock, DollarSign, Zap, Timer, ShoppingCart } from 'lucide-react';
import { MarketplaceLayout } from '../../../components/marketplace/MarketplaceLayout';
import { MobileDeepLink } from '../../../components/marketplace/MobileDeepLink';
import { buildSeo } from '../../../lib/seo';
import { useLocalization } from '../../../contexts/LocalizationContext';
import { useCart } from '../../../contexts/CartContext';
import type { SkinListItem } from '../../../services/marketplaceApi';
import axios from 'axios';

// ---------------------------------------------------------------------------
// Clan gradient mapping (consistent with SkinCard)
// ---------------------------------------------------------------------------

const CLAN_GRADIENTS: Record<string, string> = {
  A: 'from-blue-500 to-cyan-500',
  B: 'from-green-500 to-emerald-500',
  C: 'from-purple-500 to-violet-500',
  D: 'from-orange-500 to-yellow-500',
  E: 'from-pink-500 to-rose-500',
  F: 'from-teal-500 to-sky-500',
};

const CLAN_LABELS: Record<string, string> = {
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
// SSR: getServerSideProps
// ---------------------------------------------------------------------------

interface SkinDetailPageProps {
  skin: SkinListItem | null;
  error: string | null;
}

export const getServerSideProps: GetServerSideProps<SkinDetailPageProps> = async (ctx) => {
  const { id } = ctx.params as { id: string };

  // Determine backend base URL for SSR
  const baseUrl = (() => {
    if (process.env.NEXT_PUBLIC_API_URL) {
      const envUrl = process.env.NEXT_PUBLIC_API_URL;
      if (!envUrl.endsWith('/api')) {
        return envUrl.endsWith('/') ? `${envUrl}api` : `${envUrl}/api`;
      }
      return envUrl;
    }
    if (process.env.BACKEND_URL) {
      const backendUrl = process.env.BACKEND_URL;
      return backendUrl.endsWith('/api') ? backendUrl : `${backendUrl.replace(/\/$/, '')}/api`;
    }
    if (process.env.NODE_ENV === 'production') {
      return 'https://api.agentrix.top/api';
    }
    return 'http://localhost:3001/api';
  })();

  let skin: SkinListItem | null = null;
  let error: string | null = null;

  try {
    // Try fetching single skin detail from marketplace endpoint
    const { data } = await axios.get(`${baseUrl}/v1/marketplace/pets/${id}`, {
      timeout: 5000,
    });
    skin = data;
  } catch {
    try {
      // Fallback: try pet skins marketplace endpoint
      const { data } = await axios.get(`${baseUrl}/v1/pet/skins/marketplace/${id}`, {
        timeout: 5000,
      });
      skin = data;
    } catch {
      try {
        // Fallback: fetch all skins and filter by id
        const { data } = await axios.get(`${baseUrl}/v1/market/skins`, {
          params: { limit: 100 },
          timeout: 5000,
        });
        const items: SkinListItem[] = data.items || [];
        skin = items.find((s) => s.id === id) || null;
      } catch {
        error = 'Failed to fetch skin data';
      }
    }
  }

  return {
    props: {
      skin,
      error,
    },
  };
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function SkinDetailPage({
  skin,
  error,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  const { t } = useLocalization();
  const router = useRouter();
  const { addItem } = useCart();

  // -------------------------------------------------------------------------
  // SEO: dynamic title + OG image from skin thumbnail
  // -------------------------------------------------------------------------

  const DEFAULT_OG_IMAGE = 'https://agentrix.top/brand/agentrix-logo-full.png';

  const seo = buildSeo({
    title: skin
      ? `${skin.displayName} - Agentrix Market`
      : t({ zh: '皮肤详情 - Agentrix Market', en: 'Skin Detail - Agentrix Market' }),
    description: skin
      ? t({
          zh: `查看 ${skin.displayName} 的 3D 预览、价格历史和 Remix 树`,
          en: `View ${skin.displayName} 3D preview, price history and Remix tree`,
        })
      : t({ zh: '查看皮肤详情', en: 'View skin details' }),
    path: `/market/skin/${skin?.id || ''}`,
    image: skin?.thumbnailUrl || DEFAULT_OG_IMAGE,
  });

  // -------------------------------------------------------------------------
  // Error / Not Found state
  // -------------------------------------------------------------------------

  if (error || !skin) {
    return (
      <MarketplaceLayout seo={seo} activeSection="skins">
        <div className="container mx-auto px-4 py-12 md:px-6">
          <Link
            href="/market"
            className="mb-6 inline-flex items-center gap-2 text-sm text-gray-400 transition-colors hover:text-white"
          >
            <ArrowLeft size={16} />
            {t({ zh: '返回市场', en: 'Back to Market' })}
          </Link>
          <div className="flex flex-col items-center justify-center py-20">
            <p className="text-lg text-gray-400">
              {t({ zh: '皮肤不存在或加载失败', en: 'Skin not found or failed to load' })}
            </p>
            <Link
              href="/market"
              className="mt-4 rounded-lg bg-gray-800 px-4 py-2 text-sm text-white transition-colors hover:bg-gray-700"
            >
              {t({ zh: '浏览市场', en: 'Browse Market' })}
            </Link>
          </div>
        </div>
      </MarketplaceLayout>
    );
  }

  // -------------------------------------------------------------------------
  // Derived values
  // -------------------------------------------------------------------------

  const gradient = CLAN_GRADIENTS[skin.clan] || 'from-gray-500 to-gray-600';
  const clanLabel = CLAN_LABELS[skin.clan] || skin.clan;
  const showCreator = skin.source !== 'platform';
  const isAuction = skin.listingMode === 'auction' && skin.auctionEndsAt;
  const hasPrice = skin.priceUsd !== null;
  const showAxp = skin.axpAccepted === true;

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  return (
    <MarketplaceLayout seo={seo} activeSection="skins">
      <div className="container mx-auto px-4 py-6 md:px-6">
        {/* Back button */}
        <Link
          href="/market"
          className="mb-6 inline-flex items-center gap-2 text-sm text-gray-400 transition-colors hover:text-white"
        >
          <ArrowLeft size={16} />
          {t({ zh: '返回市场', en: 'Back to Market' })}
        </Link>

        <div className="grid gap-8 lg:grid-cols-2">
          {/* ─── Section 1: Hero — Large Skin Preview ─── */}
          <div className="relative aspect-square overflow-hidden rounded-2xl border border-gray-700 bg-gray-900">
            {skin.thumbnailUrl ? (
              <Image
                src={skin.thumbnailUrl}
                alt={skin.displayName}
                fill
                className="object-cover"
                sizes="(max-width: 1024px) 100vw, 50vw"
                priority
              />
            ) : (
              <div
                className={`flex h-full w-full items-center justify-center bg-gradient-to-br ${gradient}`}
              >
                <span className="text-6xl font-bold text-white/40">{skin.clan}</span>
              </div>
            )}

            {/* 3D viewer placeholder overlay */}
            <div className="absolute bottom-4 left-4 right-4">
              <div className="rounded-lg bg-black/50 px-3 py-2 text-center text-xs text-white/60 backdrop-blur-sm">
                {t({
                  zh: '3D / VRM 实时预览（即将上线）',
                  en: '3D / VRM live preview (coming soon)',
                })}
              </div>
            </div>

            {/* Featured badge */}
            {skin.featured && (
              <div className="absolute left-3 top-3 rounded-md bg-yellow-500/90 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-black">
                Featured
              </div>
            )}
          </div>

          {/* ─── Right Column: Info + Actions ─── */}
          <div className="flex flex-col gap-6">
            {/* ─── Section 2: Info ─── */}
            <div>
              {/* Clan badge */}
              <span
                className={`inline-flex items-center rounded bg-gradient-to-r ${gradient} px-2 py-0.5 text-[10px] font-bold uppercase text-white`}
              >
                Clan {skin.clan} · {clanLabel}
              </span>

              {/* Display name */}
              <h1 className="mt-2 text-3xl font-extrabold text-white">
                {skin.displayName}
              </h1>

              {/* Creator */}
              {showCreator && (
                <p className="mt-1 text-sm text-gray-400">
                  {t({ zh: '创作者', en: 'Creator' })}: @{skin.creatorUsername}
                </p>
              )}
              {!showCreator && (
                <p className="mt-1 text-sm text-gray-400">
                  {t({ zh: '官方预制', en: 'Official' })}
                </p>
              )}

              {/* Stats */}
              <div className="mt-4 flex items-center gap-5 text-sm text-gray-400">
                <span className="flex items-center gap-1.5">
                  <Heart size={15} className="text-red-400" />
                  {skin.likeCount.toLocaleString()}
                </span>
                <span className="flex items-center gap-1.5">
                  <Eye size={15} className="text-blue-400" />
                  {skin.viewCount.toLocaleString()}
                </span>
                <span className="flex items-center gap-1.5">
                  <GitBranch size={15} className="text-green-400" />
                  {skin.remixCount.toLocaleString()} {t({ zh: '次 Remix', en: 'remixes' })}
                </span>
              </div>
            </div>

            {/* ─── Section 3: Price / Auction + Actions ─── */}
            <div className="rounded-xl border border-gray-700 bg-gray-800/50 p-5">
              {isAuction ? (
                <>
                  {/* Auction info */}
                  <div className="flex items-center gap-2 text-sm text-orange-400">
                    <Timer size={16} />
                    <span className="font-medium">
                      {formatTimeRemaining(skin.auctionEndsAt!)}
                    </span>
                  </div>
                  <div className="mt-3 flex items-end gap-2">
                    <span className="text-2xl font-extrabold text-white">
                      ${skin.currentBidUsd?.toFixed(2) ?? skin.startingBidUsd?.toFixed(2) ?? '0.00'}
                    </span>
                    <span className="text-sm text-gray-400">
                      {t({ zh: '当前出价', en: 'Current bid' })}
                    </span>
                  </div>
                  {showAxp && (
                    <div className="mt-2 flex items-center gap-1.5 text-xs text-yellow-400">
                      <Zap size={12} />
                      AXP {t({ zh: '可抵扣', en: 'accepted' })} (-{skin.axpDiscountPercent}%)
                    </div>
                  )}
                  {/* Primary CTA: Place Bid */}
                  <button
                    type="button"
                    onClick={() => router.push(`/pay/checkout?productId=${skin.listingId || skin.id}&mode=auction`)}
                    className="mt-4 flex w-full items-center justify-center gap-2 rounded-lg bg-orange-600 px-4 py-3 text-sm font-bold text-white transition-colors hover:bg-orange-500"
                  >
                    {t({ zh: '出价', en: 'Place Bid' })}
                  </button>
                  {/* Secondary: Mobile Deep Link */}
                  <div className="mt-3 rounded-lg border border-gray-700 bg-gray-900/50 p-3">
                    <p className="mb-2 text-xs text-gray-500">
                      {t({ zh: '也可在 App 中操作', en: 'Also available on mobile' })}
                    </p>
                    <MobileDeepLink
                      action="bid"
                      resourceId={skin.id}
                      showQR={false}
                    />
                  </div>
                </>
              ) : hasPrice ? (
                <>
                  {/* Fixed price */}
                  <div className="flex items-center gap-2 text-sm text-gray-400">
                    <DollarSign size={16} />
                    <span>{t({ zh: '一口价', en: 'Fixed price' })}</span>
                  </div>
                  <div className="mt-3 flex items-end gap-2">
                    <span className="text-2xl font-extrabold text-white">
                      ${skin.priceUsd!.toFixed(2)}
                    </span>
                    {skin.priceAxp != null && skin.priceAxp > 0 && (
                      <span className="ml-2 text-sm font-medium text-yellow-400">
                        / {skin.priceAxp.toLocaleString()} AXP
                      </span>
                    )}
                  </div>
                  {/* Primary CTA: Buy Now (Fiat/Crypto via SmartCheckout) */}
                  <button
                    type="button"
                    onClick={() => router.push(`/pay/checkout?productId=${skin.listingId || skin.id}`)}
                    className="mt-4 flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-3 text-sm font-bold text-white transition-colors hover:bg-blue-500"
                  >
                    <DollarSign size={14} />
                    {t({ zh: `法币/Crypto 支付 $${skin.priceUsd!.toFixed(2)}`, en: `Pay $${skin.priceUsd!.toFixed(2)} (Fiat/Crypto)` })}
                  </button>
                  {/* Alternative: Buy with AXP */}
                  {skin.priceAxp != null && skin.priceAxp > 0 && (
                    <button
                      type="button"
                      onClick={() => router.push(`/market?axpBuy=${skin.id}`)}
                      className="mt-2 flex w-full items-center justify-center gap-2 rounded-lg bg-yellow-600 px-4 py-2.5 text-sm font-bold text-white transition-colors hover:bg-yellow-500"
                    >
                      <Zap size={14} />
                      {t({ zh: `用 ${skin.priceAxp.toLocaleString()} AXP 购买`, en: `Buy for ${skin.priceAxp.toLocaleString()} AXP` })}
                    </button>
                  )}
                  {/* Alternative: Add to Cart */}
                  <button
                    type="button"
                    onClick={() => {
                      const productId = skin.listingId || skin.id;
                      addItem(productId, 1, {
                        id: productId,
                        name: skin.displayName,
                        price: skin.priceUsd || 0,
                        currency: 'USD',
                        stock: 1,
                      });
                    }}
                    className="mt-2 flex w-full items-center justify-center gap-2 rounded-lg border border-gray-600 bg-gray-800 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:border-gray-500 hover:bg-gray-700"
                  >
                    <ShoppingCart size={14} />
                    {t({ zh: '加入购物车', en: 'Add to Cart' })}
                  </button>
                  {/* Secondary: Mobile Deep Link */}
                  <div className="mt-3 rounded-lg border border-gray-700 bg-gray-900/50 p-3">
                    <p className="mb-2 text-xs text-gray-500">
                      {t({ zh: '也可在 App 中操作', en: 'Also available on mobile' })}
                    </p>
                    <MobileDeepLink
                      action="buy"
                      resourceId={skin.id}
                      showQR={false}
                    />
                  </div>
                </>
              ) : skin.priceAxp != null && skin.priceAxp > 0 ? (
                <>
                  {/* AXP-only price */}
                  <div className="flex items-center gap-2 text-sm text-yellow-400">
                    <Zap size={16} />
                    <span>{t({ zh: 'AXP 积分购买', en: 'AXP Purchase' })}</span>
                  </div>
                  <div className="mt-3 flex items-end gap-2">
                    <span className="text-2xl font-extrabold text-yellow-400">
                      {skin.priceAxp.toLocaleString()} AXP
                    </span>
                  </div>
                  {/* Primary CTA: Buy with AXP */}
                  <button
                    type="button"
                    onClick={() => router.push(`/market?axpBuy=${skin.id}`)}
                    className="mt-4 flex w-full items-center justify-center gap-2 rounded-lg bg-yellow-600 px-4 py-3 text-sm font-bold text-white transition-colors hover:bg-yellow-500"
                  >
                    <Zap size={14} />
                    {t({ zh: `用 ${skin.priceAxp} AXP 购买`, en: `Buy for ${skin.priceAxp} AXP` })}
                  </button>
                  {/* Secondary: Mobile Deep Link */}
                  <div className="mt-3 rounded-lg border border-gray-700 bg-gray-900/50 p-3">
                    <p className="mb-2 text-xs text-gray-500">
                      {t({ zh: '也可在 App 中操作', en: 'Also available on mobile' })}
                    </p>
                    <MobileDeepLink
                      action="buy"
                      resourceId={skin.id}
                      showQR={false}
                    />
                  </div>
                </>
              ) : (
                <div className="text-center text-sm text-gray-500">
                  {t({ zh: '该皮肤暂未上架出售', en: 'This skin is not listed for sale' })}
                </div>
              )}
            </div>

            {/* ─── Section 4: Remix Tree ─── */}
            <div className="rounded-xl border border-gray-700 bg-gray-800/50 p-5">
              <h3 className="flex items-center gap-2 text-sm font-bold text-white">
                <GitBranch size={15} />
                {t({ zh: 'Remix 树', en: 'Remix Tree' })}
              </h3>
              {skin.parentSkinId ? (
                <div className="mt-3">
                  <Link
                    href={`/market/skin/${skin.parentSkinId}`}
                    className="inline-flex items-center gap-2 rounded-lg border border-gray-600 bg-gray-900 px-3 py-2 text-sm text-blue-400 transition-colors hover:border-blue-500 hover:text-blue-300"
                  >
                    <GitBranch size={14} />
                    {t({ zh: '基于原作 Remix', en: 'Remixed from' })} →
                  </Link>
                  <p className="mt-2 text-xs text-gray-500">
                    {t({
                      zh: `此皮肤是从另一个皮肤 Remix 而来`,
                      en: `This skin was remixed from another skin`,
                    })}
                  </p>
                </div>
              ) : (
                <p className="mt-3 text-sm text-gray-500">
                  {skin.remixCount > 0
                    ? t({
                        zh: `此皮肤已被 Remix ${skin.remixCount} 次`,
                        en: `This skin has been remixed ${skin.remixCount} times`,
                      })
                    : t({ zh: '此皮肤为原创作品', en: 'This is an original creation' })}
                </p>
              )}
            </div>

            {/* ─── Section 5: Transaction History (placeholder) ─── */}
            <div className="rounded-xl border border-gray-700 bg-gray-800/50 p-5">
              <h3 className="flex items-center gap-2 text-sm font-bold text-white">
                <Clock size={15} />
                {t({ zh: '交易历史', en: 'Transaction History' })}
              </h3>
              <div className="mt-3 flex flex-col items-center justify-center rounded-lg border border-dashed border-gray-700 py-8">
                <Clock size={24} className="text-gray-600" />
                <p className="mt-2 text-sm text-gray-500">
                  {t({ zh: '暂无交易记录', en: 'No transactions yet' })}
                </p>
              </div>
            </div>

            {/* ─── Section 6: Price History (placeholder chart) ─── */}
            <div className="rounded-xl border border-gray-700 bg-gray-800/50 p-5">
              <h3 className="flex items-center gap-2 text-sm font-bold text-white">
                <DollarSign size={15} />
                {t({ zh: '价格历史', en: 'Price History' })}
              </h3>
              <div className="mt-3 flex flex-col items-center justify-center rounded-lg border border-dashed border-gray-700 py-8">
                <DollarSign size={24} className="text-gray-600" />
                <p className="mt-2 text-sm text-gray-500">
                  {t({ zh: '价格走势图即将上线', en: 'Price chart coming soon' })}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </MarketplaceLayout>
  );
}
