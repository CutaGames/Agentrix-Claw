import { useEffect, useMemo, useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';

/**
 * Marketplace listing browser — Phase 3 W3 WB-T3.1 / WB-T3.2 entry.
 *
 * Pure client-side fetch (no SSR), so the browser cookie can carry the user JWT.
 * Server returns: `{ items: MarketplacePetListing[] }`
 *
 * Filters:
 *   ?mode=fixed_price | auction | rental
 *   ?seller=<userId>
 *   ?q=<text>  (client-side filter on description / id)
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
  rentalPricePerDayUsd: string | null;
  description: string | null;
  auctionEndsAt: string | null;
  createdAt: string;
}

const MODES: Array<{ value: Mode | ''; label: string }> = [
  { value: '', label: 'All' },
  { value: 'fixed_price', label: 'Buy Now' },
  { value: 'auction', label: 'Auction' },
  { value: 'rental', label: 'Rental' },
];

function modeLabel(m: Mode): string {
  return m === 'fixed_price' ? 'Buy Now' : m === 'auction' ? 'Auction' : 'Rental';
}

function priceLabel(l: Listing): string {
  if (l.mode === 'fixed_price') return l.priceUsd ? `$${l.priceUsd}` : '—';
  if (l.mode === 'auction') return l.startingBidUsd ? `From $${l.startingBidUsd}` : '—';
  if (l.mode === 'rental') return l.rentalPricePerDayUsd ? `$${l.rentalPricePerDayUsd}/day` : '—';
  return '—';
}

export default function MarketplaceIndex() {
  const router = useRouter();
  const [items, setItems] = useState<Listing[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const queryMode = ((router.query.mode as string) || '') as Mode | '';
  const queryText = (router.query.q as string) || '';

  useEffect(() => {
    if (!router.isReady) return;
    setLoading(true);
    const qs = new URLSearchParams();
    if (queryMode) qs.set('mode', queryMode);
    fetch(`/api/v1/marketplace/pets${qs.toString() ? `?${qs.toString()}` : ''}`, {
      credentials: 'include',
    })
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((data) => {
        setItems(data.items || []);
        setError(null);
      })
      .catch((e) => setError(String(e?.message || e)))
      .finally(() => setLoading(false));
  }, [router.isReady, queryMode]);

  const filtered = useMemo(() => {
    if (!items) return [];
    if (!queryText) return items;
    const q = queryText.toLowerCase();
    return items.filter(
      (l) =>
        (l.description || '').toLowerCase().includes(q) ||
        l.petSkinId.toLowerCase().includes(q) ||
        l.id.toLowerCase().includes(q),
    );
  }, [items, queryText]);

  function setQuery(patch: Record<string, string>) {
    const next = { ...router.query, ...patch };
    Object.keys(next).forEach((k) => {
      if (!next[k]) delete next[k];
    });
    router.replace({ pathname: router.pathname, query: next }, undefined, { shallow: true });
  }

  return (
    <>
      <Head>
        <title>Pet Marketplace — Agentrix</title>
        <meta name="description" content="Browse, buy, auction, and rent AI pets on Agentrix." />
      </Head>
      <main style={{ maxWidth: 1100, margin: '0 auto', padding: '32px 16px', fontFamily: 'system-ui' }}>
        <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
          <h1 style={{ fontSize: 28, fontWeight: 700, margin: 0 }}>Pet Marketplace</h1>
          <Link href="/marketplace/pets/new" style={{ background: '#8b5cf6', color: 'white', padding: '8px 16px', borderRadius: 8, textDecoration: 'none' }}>
            + List a Pet
          </Link>
        </header>
        <section style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' }} aria-label="filters">
          <input
            type="search"
            placeholder="Search by description or id…"
            defaultValue={queryText}
            onChange={(e) => setQuery({ q: e.target.value })}
            data-testid="mp-search"
            style={{ flex: '1 1 240px', padding: '8px 12px', border: '1px solid #ddd', borderRadius: 6 }}
          />
          <select
            value={queryMode}
            onChange={(e) => setQuery({ mode: e.target.value })}
            data-testid="mp-mode-filter"
            style={{ padding: '8px 12px', border: '1px solid #ddd', borderRadius: 6 }}
          >
            {MODES.map((m) => (
              <option key={m.value} value={m.value}>{m.label}</option>
            ))}
          </select>
        </section>
        {loading && <div data-testid="mp-loading">Loading…</div>}
        {error && <div data-testid="mp-error" role="alert" style={{ color: '#b00020' }}>Failed to load: {error}</div>}
        {!loading && !error && filtered.length === 0 && (
          <div data-testid="mp-empty" style={{ padding: 40, textAlign: 'center', color: '#666' }}>
            No listings match your filters.
          </div>
        )}
        <ul data-testid="mp-grid" style={{ listStyle: 'none', padding: 0, display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 16 }}>
          {filtered.map((l) => (
            <li key={l.id} data-testid="mp-card" data-listing-id={l.id} style={{ border: '1px solid #eee', borderRadius: 12, padding: 16 }}>
              <Link href={`/marketplace/pets/${encodeURIComponent(l.id)}`} style={{ textDecoration: 'none', color: 'inherit' }}>
                <div style={{ aspectRatio: '1 / 1', background: 'linear-gradient(135deg,#8b5cf6,#ec4899)', borderRadius: 8, marginBottom: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 48 }}>🐾</div>
                <div style={{ fontWeight: 600 }}>{l.description || `Pet ${l.petSkinId.slice(0, 8)}`}</div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8, fontSize: 13 }}>
                  <span data-testid="mp-mode" style={{ background: '#f3f4f6', padding: '2px 8px', borderRadius: 4 }}>{modeLabel(l.mode)}</span>
                  <span data-testid="mp-price" style={{ fontWeight: 600 }}>{priceLabel(l)}</span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      </main>
    </>
  );
}
