/**
 * /market/auction/[id] — Real-time auction hall (Sprint W-1 P1).
 *
 * Pulls live data from:
 *   GET /api/v1/marketplace/pets/:id          (listing + auction state)
 *   GET /api/v1/marketplace/pets/:id/bids     (bid history)
 *   POST /api/v1/marketplace/pets/:id/bid     (place bid)
 *
 * Polls every 10 s for new bids while user has the page open.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import { MarketingLayout } from '../../../components/marketing/MarketingLayout';
import { buildSeo } from '../../../lib/seo';
import { useLocalization } from '../../../contexts/LocalizationContext';
import { Gavel, Clock, Users, Loader2, ArrowLeft } from 'lucide-react';
import { API_BASE_URL } from '../../../lib/api/client';

interface Listing {
  id: string;
  petSkinId: string;
  sellerUserId: string;
  mode: 'fixed_price' | 'auction' | 'rental';
  status: string;
  startingBidUsd: string | null;
  minBidIncrementUsd: string;
  reservePriceUsd: string | null;
  auctionEndsAt: string | null;
  description: string | null;
}

interface Bid {
  id: string;
  bidderUserId: string;
  amountUsd: string;
  createdAt: string;
}

const POLL_INTERVAL_MS = 10_000;

export default function AuctionDetailPage() {
  const router = useRouter();
  const { id } = router.query;
  const { t } = useLocalization();
  const [listing, setListing] = useState<Listing | null>(null);
  const [bids, setBids] = useState<Bid[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [bidAmount, setBidAmount] = useState('');
  const [bidding, setBidding] = useState(false);
  const [bidError, setBidError] = useState<string | null>(null);
  const [bidOk, setBidOk] = useState(false);
  const [now, setNow] = useState(Date.now());
  const pollTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  const idStr = typeof id === 'string' ? id : '';

  const loadAll = useCallback(async () => {
    if (!idStr) return;
    try {
      const [listingResp, bidsResp] = await Promise.all([
        fetch(`${API_BASE_URL}/v1/marketplace/pets/${idStr}`),
        fetch(`${API_BASE_URL}/v1/marketplace/pets/${idStr}/bids`),
      ]);
      if (!listingResp.ok) throw new Error(`HTTP ${listingResp.status}`);
      const listingData = await listingResp.json();
      setListing(listingData?.listing || listingData);
      if (bidsResp.ok) {
        const bidsData = await bidsResp.json();
        const items: Bid[] = bidsData?.items || (Array.isArray(bidsData) ? bidsData : []);
        setBids(items);
      }
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [idStr]);

  useEffect(() => {
    if (!router.isReady) return;
    void loadAll();
    pollTimer.current = setInterval(() => {
      void loadAll();
    }, POLL_INTERVAL_MS);
    const tick = setInterval(() => setNow(Date.now()), 1000);
    return () => {
      if (pollTimer.current) clearInterval(pollTimer.current);
      clearInterval(tick);
    };
  }, [router.isReady, loadAll]);

  const placeBid = async () => {
    setBidError(null);
    setBidOk(false);
    const token = typeof window !== 'undefined' ? localStorage.getItem('access_token') : null;
    if (!token) {
      setBidError(t({ zh: '请先登录', en: 'Please sign in first' }));
      return;
    }
    const amt = Number(bidAmount);
    if (!Number.isFinite(amt) || amt <= 0) {
      setBidError(t({ zh: '请输入有效金额', en: 'Enter a valid amount' }));
      return;
    }
    setBidding(true);
    try {
      const r = await fetch(`${API_BASE_URL}/v1/marketplace/pets/${idStr}/bid`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ amount_usd: bidAmount }),
      });
      if (!r.ok) {
        const txt = await r.text().catch(() => '');
        throw new Error(`HTTP ${r.status}: ${txt.slice(0, 150)}`);
      }
      setBidOk(true);
      setBidAmount('');
      void loadAll();
    } catch (e) {
      setBidError((e as Error).message);
    } finally {
      setBidding(false);
    }
  };

  const seo = buildSeo({
    title: t({ zh: `拍卖 #${idStr.slice(0, 8)} · Agentrix`, en: `Auction #${idStr.slice(0, 8)} · Agentrix` }),
    description: t({ zh: '实时出价拍卖大厅', en: 'Real-time bidding auction hall' }),
    path: `/market/auction/${idStr}`,
  });

  // Compute current high bid + countdown
  const highBidUsd =
    bids.length > 0 ? Math.max(...bids.map((b) => Number(b.amountUsd) || 0)) : Number(listing?.startingBidUsd) || 0;
  const minNextBid = highBidUsd + (Number(listing?.minBidIncrementUsd) || 1);
  const endsAt = listing?.auctionEndsAt ? new Date(listing.auctionEndsAt).getTime() : 0;
  const remainingMs = Math.max(0, endsAt - now);
  const isLive = listing?.status === 'active' && remainingMs > 0;

  function formatRemaining(ms: number): string {
    if (ms <= 0) return t({ zh: '已结束', en: 'Ended' });
    const totalSec = Math.floor(ms / 1000);
    const d = Math.floor(totalSec / 86400);
    const h = Math.floor((totalSec % 86400) / 3600);
    const m = Math.floor((totalSec % 3600) / 60);
    const s = totalSec % 60;
    if (d > 0) return `${d}d ${h}h`;
    if (h > 0) return `${h}h ${m}m`;
    return `${m}m ${s}s`;
  }

  return (
    <MarketingLayout seo={seo}>
      <section className="bg-agentrix-ink py-12">
        <div className="container mx-auto px-6 max-w-5xl">
          <Link href="/market" className="mb-6 inline-flex items-center gap-2 text-sm text-agentrix-fog hover:text-white">
            <ArrowLeft size={14} />
            {t({ zh: '返回市场', en: 'Back to Market' })}
          </Link>

          {loading && (
            <div className="flex justify-center py-20">
              <Loader2 className="w-8 h-8 animate-spin text-agentrix-electric" />
            </div>
          )}

          {!loading && error && (
            <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-6 text-center">
              <p className="text-sm text-red-300">{error}</p>
              <Link href="/market" className="mt-3 inline-block text-xs text-agentrix-electric hover:underline">
                {t({ zh: '返回市场列表 →', en: 'Browse market →' })}
              </Link>
            </div>
          )}

          {!loading && !error && listing && (
            <div className="grid gap-8 lg:grid-cols-2">
              {/* Hero */}
              <div className="aspect-square rounded-2xl border border-agentrix-inkLine overflow-hidden relative">
                <div className="absolute inset-0 bg-gradient-to-br from-rose-600/30 via-purple-900/50 to-cyan-500/20" />
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_40%_30%,rgba(250,204,21,0.1)_0%,transparent_60%)]" />
                {isLive && (
                  <div className="absolute top-4 left-4 rounded-full bg-red-500/90 px-3 py-1 text-xs font-bold text-white animate-pulse">
                    LIVE
                  </div>
                )}
                {!isLive && remainingMs <= 0 && (
                  <div className="absolute top-4 left-4 rounded-full bg-gray-700 px-3 py-1 text-xs font-bold text-white">
                    {t({ zh: '已结束', en: 'ENDED' })}
                  </div>
                )}
              </div>

              <div>
                <h1 className="text-3xl font-extrabold">
                  {t({ zh: '拍卖大厅', en: 'Auction Hall' })}
                </h1>
                <p className="text-xs text-agentrix-mist font-mono mt-1">#{idStr}</p>

                <div className="mt-4 flex gap-4 text-sm text-agentrix-fog">
                  <span className="inline-flex items-center gap-1">
                    <Clock size={14} />
                    {isLive
                      ? `${t({ zh: '剩余', en: '' })} ${formatRemaining(remainingMs)}`
                      : t({ zh: '已结束', en: 'Ended' })}
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <Users size={14} />
                    {bids.length} {t({ zh: '次出价', en: 'bids' })}
                  </span>
                </div>

                {listing.description && (
                  <p className="mt-3 text-sm text-agentrix-fog">{listing.description}</p>
                )}

                <div className="mt-8 rounded-xl border border-agentrix-inkLine bg-agentrix-inkSoft p-6">
                  <p className="text-xs text-agentrix-mist">
                    {bids.length > 0
                      ? t({ zh: '当前最高出价', en: 'Current highest bid' })
                      : t({ zh: '起拍价', en: 'Starting bid' })}
                  </p>
                  <p className="mt-1 text-3xl font-extrabold text-agentrix-solar">
                    ${highBidUsd.toFixed(2)}
                  </p>
                  <p className="mt-1 text-xs text-agentrix-fog">
                    {t({ zh: '起拍价', en: 'Starting' })} ${listing.startingBidUsd ?? '—'} ·{' '}
                    {t({ zh: '加价幅度', en: 'Min increment' })} ${listing.minBidIncrementUsd}
                  </p>

                  {isLive && (
                    <>
                      <div className="mt-6 flex gap-3">
                        <input
                          type="number"
                          step="0.01"
                          min={minNextBid}
                          placeholder={`$${minNextBid.toFixed(2)}`}
                          value={bidAmount}
                          onChange={(e) => setBidAmount(e.target.value)}
                          disabled={bidding}
                          className="flex-1 rounded-lg border border-agentrix-inkLine bg-white/5 px-4 py-2.5 text-sm text-white placeholder-agentrix-mist focus:border-agentrix-electric focus:outline-none"
                        />
                        <button
                          type="button"
                          onClick={() => void placeBid()}
                          disabled={bidding || !bidAmount}
                          className="inline-flex items-center gap-2 rounded-full bg-agentrix-solar px-6 py-2.5 text-sm font-bold text-agentrix-ink hover:opacity-90 disabled:opacity-50"
                        >
                          {bidding ? <Loader2 size={14} className="animate-spin" /> : <Gavel size={16} />}
                          {t({ zh: '出价', en: 'Bid' })}
                        </button>
                      </div>
                      {bidError && (
                        <p className="mt-2 text-xs text-red-400">{bidError}</p>
                      )}
                      {bidOk && (
                        <p className="mt-2 text-xs text-green-400">✓ {t({ zh: '出价成功', en: 'Bid placed' })}</p>
                      )}
                    </>
                  )}
                </div>

                {/* Bid history */}
                <div className="mt-6">
                  <h3 className="text-sm font-bold text-white">{t({ zh: '出价记录', en: 'Bid History' })}</h3>
                  <div className="mt-3 space-y-2">
                    {bids.length === 0 ? (
                      <p className="rounded-lg border border-dashed border-agentrix-inkLine px-4 py-8 text-center text-xs text-agentrix-mist">
                        {t({ zh: '暂无出价。第一个出价将获得 Cinderella Boost +5%', en: 'No bids yet. First bidder gets +5% Cinderella Boost.' })}
                      </p>
                    ) : (
                      [...bids]
                        .sort((a, b) => Number(b.amountUsd) - Number(a.amountUsd))
                        .slice(0, 10)
                        .map((b, i) => (
                          <div key={b.id || i} className="flex items-center justify-between rounded-lg bg-white/5 px-4 py-2 text-xs">
                            <span className="text-agentrix-fog font-mono">@{b.bidderUserId.slice(0, 8)}</span>
                            <span className="font-bold text-white">${Number(b.amountUsd).toFixed(2)}</span>
                          </div>
                        ))
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </section>
    </MarketingLayout>
  );
}
