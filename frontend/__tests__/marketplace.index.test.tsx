import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import MarketplaceIndex from '../pages/marketplace/pets/index';

/**
 * WB-T3.1 — marketplace browse: search + mode filter render correctly.
 *
 * Mocks Next router + global fetch.
 */

const mockReplace = vi.fn();
let mockQuery: Record<string, string> = {};
let mockReady = true;

vi.mock('next/router', () => ({
  useRouter: () => ({
    isReady: mockReady,
    query: mockQuery,
    pathname: '/marketplace/pets',
    replace: (cfg: any) => {
      mockReplace(cfg);
      mockQuery = { ...mockQuery, ...(cfg.query || {}) };
    },
  }),
}));

vi.mock('next/head', () => ({ default: ({ children }: any) => <>{children}</> }));
vi.mock('next/link', () => ({
  default: ({ children, href }: any) => <a href={href}>{children}</a>,
}));

type TestListing = {
  id: string;
  petSkinId: string;
  sellerUserId: string;
  mode: 'fixed_price' | 'auction' | 'rental';
  status: string;
  priceUsd: string | null;
  startingBidUsd: string | null;
  rentalPricePerDayUsd: string | null;
  description: string | null;
  auctionEndsAt: string | null;
  createdAt: string;
};

const SAMPLE: TestListing[] = [
  {
    id: 'l1', petSkinId: 'skin-aaa-1', sellerUserId: 'u1', mode: 'fixed_price',
    status: 'active', priceUsd: '50.00', startingBidUsd: null, rentalPricePerDayUsd: null,
    description: 'Cute mascot', auctionEndsAt: null, createdAt: '2026-05-01',
  },
  {
    id: 'l2', petSkinId: 'skin-bbb-2', sellerUserId: 'u2', mode: 'auction',
    status: 'active', priceUsd: null, startingBidUsd: '10.00', rentalPricePerDayUsd: null,
    description: 'Rare dragon', auctionEndsAt: '2026-06-01', createdAt: '2026-05-02',
  },
  {
    id: 'l3', petSkinId: 'skin-ccc-3', sellerUserId: 'u3', mode: 'rental',
    status: 'active', priceUsd: null, startingBidUsd: null, rentalPricePerDayUsd: '2.00',
    description: 'Office helper', auctionEndsAt: null, createdAt: '2026-05-03',
  },
];

describe('MarketplaceIndex (WB-T3.1)', () => {
  beforeEach(() => {
    mockQuery = {};
    mockReplace.mockReset();
    global.fetch = vi.fn(async (url: any) => {
      const u = String(url);
      const mode = new URL(u, 'http://x').searchParams.get('mode');
      const items = mode ? SAMPLE.filter((s) => s.mode === mode) : SAMPLE;
      return { ok: true, json: async () => ({ items }) } as any;
    }) as any;
  });
  afterEach(() => vi.restoreAllMocks());

  it('renders all listings on mount', async () => {
    render(<MarketplaceIndex />);
    await waitFor(() => expect(screen.queryByTestId('mp-loading')).toBeNull());
    expect(screen.getAllByTestId('mp-card')).toHaveLength(3);
    // Mode badges visible
    const modes = screen.getAllByTestId('mp-mode').map((e) => e.textContent);
    expect(modes).toEqual(expect.arrayContaining(['Buy Now', 'Auction', 'Rental']));
  });

  it('mode filter narrows results', async () => {
    mockQuery = { mode: 'auction' };
    render(<MarketplaceIndex />);
    await waitFor(() => expect(screen.queryByTestId('mp-loading')).toBeNull());
    const cards = screen.getAllByTestId('mp-card');
    expect(cards).toHaveLength(1);
    expect(cards[0]).toHaveAttribute('data-listing-id', 'l2');
  });

  it('text search filters client-side', async () => {
    render(<MarketplaceIndex />);
    await waitFor(() => expect(screen.getAllByTestId('mp-card')).toHaveLength(3));
    const search = screen.getByTestId('mp-search');
    fireEvent.change(search, { target: { value: 'dragon' } });
    expect(mockReplace).toHaveBeenCalledWith(expect.objectContaining({
      query: expect.objectContaining({ q: 'dragon' }),
    }));
  });

  it('shows price labels per mode', async () => {
    render(<MarketplaceIndex />);
    await waitFor(() => expect(screen.getAllByTestId('mp-card')).toHaveLength(3));
    const prices = screen.getAllByTestId('mp-price').map((e) => e.textContent);
    expect(prices).toEqual(expect.arrayContaining(['$50.00', 'From $10.00', '$2.00/day']));
  });

  it('renders empty state when no matches', async () => {
    global.fetch = vi.fn(async () => ({ ok: true, json: async () => ({ items: [] as TestListing[] }) }) as any) as any;
    render(<MarketplaceIndex />);
    await waitFor(() => expect(screen.queryByTestId('mp-empty')).not.toBeNull());
  });

  it('renders error state on fetch failure', async () => {
    global.fetch = vi.fn(async () => ({ ok: false, status: 500 }) as any) as any;
    render(<MarketplaceIndex />);
    await waitFor(() => expect(screen.queryByTestId('mp-error')).not.toBeNull());
  });
});
