import { useEffect, useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';

/**
 * Listing detail page — Phase 3 W3 WB-T3.2 / WB-T3.6.
 *
 * Shows three modes side-by-side (Buy Now, Auction, Rental) so visitors
 * always see the full marketplace shape regardless of the listing type.
 * Inactive modes are visibly disabled.
 *
 * Includes a Remix CTA (WB-T3.6) that links to `/marketplace/remix?from=<id>`.
 */

type Mode = 'fixed_price' | 'auction' | 'rental';

interface Listing {
  id: string;
  petSkinId: string;
  sellerUserId: string;
  mode: Mode;
  status: string;
  priceUsd: string | null;
  startingBidUsd: string | null;
  reservePriceUsd: string | null;
  minBidIncrementUsd: string | null;
  auctionEndsAt: string | null;
  rentalPricePerDayUsd: string | null;
  rentalDurationDays: number | null;
  royaltyRateBps: number;
  description: string | null;
}

interface Bid {
  id: string;
  bidderUserId: string;
  amountUsd: string;
  createdAt: string;
  isLeading: boolean;
}

export default function ListingDetail() {
  const router = useRouter();
  const id = router.query.id as string | undefined;
  const [listing, setListing] = useState<Listing | null>(null);
  const [bids, setBids] = useState<Bid[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    fetch(`/api/v1/marketplace/pets/${encodeURIComponent(id)}`, { credentials: 'include' })
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((d) => setListing(d.listing))
      .catch((e) => setError(String(e?.message || e)));
    fetch(`/api/v1/marketplace/pets/${encodeURIComponent(id)}/bids`, { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : Promise.resolve({ items: [] as Bid[] })))
      .then((d) => setBids(d.items || []))
      .catch(() => setBids([]));
  }, [id]);

  if (error) return <main style={{ padding: 40 }}><div role="alert">Failed: {error}</div></main>;
  if (!listing) return <main style={{ padding: 40 }} data-testid="ld-loading">Loading…</main>;

  return (
    <>
      <Head>
        <title>{listing.description || 'Pet'} · Marketplace · Agentrix</title>
      </Head>
      <main style={{ maxWidth: 960, margin: '0 auto', padding: '32px 16px', fontFamily: 'system-ui' }}>
        <Link href="/marketplace/pets">← Back to marketplace</Link>
        <header style={{ display: 'flex', gap: 24, marginTop: 16, marginBottom: 32 }}>
          <div style={{ width: 240, height: 240, background: 'linear-gradient(135deg,#8b5cf6,#ec4899)', borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 88 }}>🐾</div>
          <div style={{ flex: 1 }}>
            <h1 style={{ fontSize: 28, margin: 0 }} data-testid="ld-title">{listing.description || 'Untitled Pet'}</h1>
            <div style={{ marginTop: 8, color: '#666', fontSize: 14 }}>Skin ID: {listing.petSkinId.slice(0, 8)}…</div>
            <div style={{ marginTop: 8, fontSize: 13 }}>Royalty: {(listing.royaltyRateBps / 100).toFixed(2)}%</div>
            <div style={{ marginTop: 24 }}>
              <button
                data-testid="ld-remix"
                onClick={() => router.push(`/marketplace/remix?from=${encodeURIComponent(listing.id)}`)}
                style={{ background: '#8b5cf6', color: 'white', border: 0, padding: '10px 18px', borderRadius: 8, cursor: 'pointer' }}
              >
                Remix this pet →
              </button>
            </div>
          </div>
        </header>

        {/* Three-tier action panel — WB-T3.2 */}
        <section data-testid="ld-tiers" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
          <Tier
            mode="fixed_price" active={listing.mode === 'fixed_price'} listing={listing}
            primary={listing.priceUsd ? `$${listing.priceUsd}` : '—'} cta="Buy Now"
            description="Instant purchase at fixed price."
          />
          <Tier
            mode="auction" active={listing.mode === 'auction'} listing={listing}
            primary={listing.startingBidUsd ? `From $${listing.startingBidUsd}` : '—'} cta="Place Bid"
            description={`Anti-snipe extends end +2min. ${bids.length} bid${bids.length === 1 ? '' : 's'} so far.`}
          />
          <Tier
            mode="rental" active={listing.mode === 'rental'} listing={listing}
            primary={listing.rentalPricePerDayUsd ? `$${listing.rentalPricePerDayUsd}/day` : '—'} cta="Rent"
            description={listing.rentalDurationDays ? `Default term: ${listing.rentalDurationDays} days.` : 'Choose your term.'}
          />
        </section>

        {listing.mode === 'auction' && bids.length > 0 && (
          <section style={{ marginTop: 32 }}>
            <h2 style={{ fontSize: 18 }}>Bid history</h2>
            <ol data-testid="ld-bids" style={{ paddingLeft: 18 }}>
              {bids.map((b) => (
                <li key={b.id} style={{ padding: '4px 0', color: b.isLeading ? '#000' : '#777' }}>
                  ${b.amountUsd} — {b.bidderUserId.slice(0, 8)} {b.isLeading ? '(leading)' : ''}
                </li>
              ))}
            </ol>
          </section>
        )}
      </main>
    </>
  );
}

function Tier({
  mode, active, listing, primary, cta, description,
}: {
  mode: Mode;
  active: boolean;
  listing: Listing;
  primary: string;
  cta: string;
  description: string;
}) {
  const enabled = active && listing.status === 'active';
  return (
    <div
      data-testid={`ld-tier-${mode}`}
      data-active={active}
      style={{
        border: '1px solid', borderColor: enabled ? '#8b5cf6' : '#eee', borderRadius: 12, padding: 16,
        opacity: enabled ? 1 : 0.55, background: enabled ? '#fafaff' : '#fff',
      }}
    >
      <div style={{ fontSize: 12, textTransform: 'uppercase', color: '#888', letterSpacing: 1 }}>
        {mode === 'fixed_price' ? 'Buy Now' : mode === 'auction' ? 'Auction' : 'Rental'}
      </div>
      <div style={{ fontSize: 22, fontWeight: 700, margin: '6px 0' }} data-testid={`ld-tier-${mode}-price`}>{primary}</div>
      <div style={{ fontSize: 13, color: '#555' }}>{description}</div>
      <button
        disabled={!enabled}
        data-testid={`ld-tier-${mode}-cta`}
        style={{
          marginTop: 12, width: '100%', padding: '10px 0', borderRadius: 6, border: 0,
          background: enabled ? '#8b5cf6' : '#ddd', color: enabled ? 'white' : '#888',
          cursor: enabled ? 'pointer' : 'not-allowed',
        }}
      >
        {cta}
      </button>
    </div>
  );
}
