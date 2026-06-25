/**
 * /market/creator/[userId] — Creator profile (Sprint W-1 P1).
 *
 * Pulls live data from:
 *   GET /api/v1/marketplace/pets?seller=<userId>     (active listings by seller)
 *
 * Computes stats client-side: count of active listings, total starting price,
 * mode distribution. GMV / followers come later when those endpoints land.
 */
import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import { MarketingLayout } from '../../../components/marketing/MarketingLayout';
import { buildSeo } from '../../../lib/seo';
import { useLocalization } from '../../../contexts/LocalizationContext';
import { Star, TrendingUp, Palette, Loader2, ArrowLeft } from 'lucide-react';
import { API_BASE_URL } from '../../../lib/api/client';

interface Listing {
  id: string;
  petSkinId: string;
  sellerUserId: string;
  mode: 'fixed_price' | 'auction' | 'rental';
  status: string;
  priceUsd: string | null;
  startingBidUsd: string | null;
  rentalPricePerDayUsd: string | null;
  description: string | null;
}

export default function CreatorProfilePage() {
  const router = useRouter();
  const { userId } = router.query;
  const { t } = useLocalization();
  const [listings, setListings] = useState<Listing[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const userIdStr = typeof userId === 'string' ? userId : '';

  const load = useCallback(async () => {
    if (!userIdStr) return;
    try {
      const r = await fetch(`${API_BASE_URL}/v1/marketplace/pets?seller=${encodeURIComponent(userIdStr)}`);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const data = await r.json();
      const items: Listing[] = Array.isArray(data?.items) ? data.items : Array.isArray(data) ? data : [];
      setListings(items);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [userIdStr]);

  useEffect(() => {
    if (router.isReady) void load();
  }, [router.isReady, load]);

  const seo = buildSeo({
    title: t({
      zh: `创作者 @${userIdStr.slice(0, 8)} · Agentrix`,
      en: `Creator @${userIdStr.slice(0, 8)} · Agentrix`,
    }),
    description: t({ zh: '查看创作者作品、活跃挂牌', en: 'View creator works and active listings' }),
    path: `/market/creator/${userIdStr}`,
  });

  // Compute stats from listings
  const activeCount = listings.filter((l) => l.status === 'active').length;
  const totalAsking = listings.reduce((sum, l) => {
    const price =
      Number(l.priceUsd) ||
      Number(l.startingBidUsd) ||
      Number(l.rentalPricePerDayUsd) ||
      0;
    return sum + price;
  }, 0);
  const modeBreakdown = listings.reduce<Record<string, number>>((acc, l) => {
    acc[l.mode] = (acc[l.mode] || 0) + 1;
    return acc;
  }, {});

  return (
    <MarketingLayout seo={seo}>
      <section className="bg-agentrix-ink py-12">
        <div className="container mx-auto px-6 max-w-4xl">
          <Link href="/market" className="mb-6 inline-flex items-center gap-2 text-sm text-agentrix-fog hover:text-white">
            <ArrowLeft size={14} />
            {t({ zh: '返回市场', en: 'Back to Market' })}
          </Link>

          {/* Hero */}
          <div className="flex items-center gap-4">
            <div className="h-16 w-16 rounded-full bg-gradient-to-br from-agentrix-purple to-agentrix-electric flex items-center justify-center text-2xl font-bold text-white">
              {userIdStr.charAt(0).toUpperCase() || '?'}
            </div>
            <div>
              <h1 className="text-2xl font-extrabold">
                @{userIdStr.length > 16 ? `${userIdStr.slice(0, 14)}…` : userIdStr}
              </h1>
              <p className="text-sm text-agentrix-fog font-mono">{userIdStr.slice(0, 32)}</p>
            </div>
          </div>

          {loading && (
            <div className="flex justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-agentrix-electric" />
            </div>
          )}

          {!loading && error && (
            <div className="mt-8 rounded-xl border border-red-500/30 bg-red-500/10 p-5 text-sm text-red-300">
              {t({ zh: '加载失败：', en: 'Failed to load: ' })}
              {error}
            </div>
          )}

          {!loading && !error && (
            <>
              {/* Stats */}
              <div className="mt-8 grid grid-cols-3 gap-4">
                <StatCard
                  icon={<Palette size={20} className="text-agentrix-electric" />}
                  value={listings.length.toString()}
                  label={t({ zh: '总作品', en: 'Total Works' })}
                />
                <StatCard
                  icon={<TrendingUp size={20} className="text-agentrix-solar" />}
                  value={`$${totalAsking.toFixed(0)}`}
                  label={t({ zh: '总挂牌额', en: 'Total Asking' })}
                />
                <StatCard
                  icon={<Star size={20} className="text-agentrix-purpleSoft" />}
                  value={activeCount.toString()}
                  label={t({ zh: '活跃中', en: 'Active' })}
                />
              </div>

              {/* Mode breakdown */}
              {listings.length > 0 && (
                <div className="mt-4 flex justify-center gap-3 text-xs text-agentrix-mist">
                  {Object.entries(modeBreakdown).map(([mode, count]) => (
                    <span key={mode} className="rounded-full bg-white/5 px-3 py-1">
                      {mode === 'fixed_price' && t({ zh: '一口价', en: 'Fixed' })}
                      {mode === 'auction' && t({ zh: '拍卖', en: 'Auction' })}
                      {mode === 'rental' && t({ zh: '租赁', en: 'Rental' })}
                      {' × '}
                      <span className="text-white font-semibold">{count}</span>
                    </span>
                  ))}
                </div>
              )}

              {/* Listings */}
              <h2 className="mt-10 text-lg font-bold">{t({ zh: '作品列表', en: 'Works' })}</h2>
              {listings.length === 0 ? (
                <div className="mt-4 rounded-xl border border-dashed border-agentrix-inkLine py-12 text-center">
                  <div className="text-3xl mb-2">🎨</div>
                  <p className="text-sm text-agentrix-fog">
                    {t({
                      zh: '该创作者还没有发布任何作品。',
                      en: 'This creator has not listed any works yet.',
                    })}
                  </p>
                </div>
              ) : (
                <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {listings.map((l) => {
                    const targetPath =
                      l.mode === 'auction' ? `/market/auction/${l.id}` : `/market/skin/${l.id}`;
                    const displayPrice =
                      l.mode === 'fixed_price'
                        ? `$${Number(l.priceUsd).toFixed(2)}`
                        : l.mode === 'auction'
                        ? `${t({ zh: '起拍 ', en: 'From ' })}$${Number(l.startingBidUsd).toFixed(2)}`
                        : `$${Number(l.rentalPricePerDayUsd).toFixed(2)}/${t({ zh: '天', en: 'day' })}`;
                    return (
                      <Link
                        key={l.id}
                        href={targetPath}
                        className="rounded-xl border border-agentrix-inkLine bg-agentrix-inkSoft overflow-hidden transition-colors hover:border-agentrix-electric/40"
                      >
                        <div className="aspect-square bg-gradient-to-br from-agentrix-purple/15 to-agentrix-electric/10 flex items-center justify-center">
                          <span className="text-3xl opacity-40">🐾</span>
                        </div>
                        <div className="p-3">
                          <p className="text-sm font-bold text-white truncate">
                            {l.description?.slice(0, 24) || `Listing #${l.id.slice(0, 6)}`}
                          </p>
                          <p className="text-xs text-agentrix-solar mt-1">{displayPrice}</p>
                          <p className="text-[10px] text-agentrix-mist mt-1">
                            {l.mode === 'fixed_price' && t({ zh: '一口价', en: 'Fixed price' })}
                            {l.mode === 'auction' && t({ zh: '拍卖', en: 'Auction' })}
                            {l.mode === 'rental' && t({ zh: '租赁', en: 'Rental' })}
                            {' · '}
                            {l.status}
                          </p>
                        </div>
                      </Link>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </div>
      </section>
    </MarketingLayout>
  );
}

function StatCard({ icon, value, label }: { icon: React.ReactNode; value: string; label: string }) {
  return (
    <div className="rounded-xl border border-agentrix-inkLine bg-agentrix-inkSoft p-4 text-center">
      <div className="flex justify-center">{icon}</div>
      <p className="mt-2 text-2xl font-bold text-white">{value}</p>
      <p className="text-xs text-agentrix-mist">{label}</p>
    </div>
  );
}
