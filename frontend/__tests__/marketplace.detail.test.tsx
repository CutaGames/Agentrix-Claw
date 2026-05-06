import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import ListingDetail from '../pages/marketplace/pets/[id]';

/**
 * WB-T3.2 — detail page renders all 3 tiers (Buy / Auction / Rental).
 * WB-T3.6 — Remix CTA present and routes correctly.
 */

const mockPush = vi.fn();
vi.mock('next/router', () => ({
  useRouter: () => ({ query: { id: 'L1' }, push: mockPush }),
}));
vi.mock('next/head', () => ({ default: ({ children }: any) => <>{children}</> }));
vi.mock('next/link', () => ({
  default: ({ children, href }: any) => <a href={href}>{children}</a>,
}));

const LISTING = {
  id: 'L1', petSkinId: 'skin-1', sellerUserId: 'u1',
  mode: 'auction', status: 'active',
  priceUsd: null, startingBidUsd: '10.00',
  reservePriceUsd: null, minBidIncrementUsd: '1.00',
  auctionEndsAt: '2026-06-01', rentalPricePerDayUsd: null,
  rentalDurationDays: null, royaltyRateBps: 500,
  description: 'Rare dragon',
};

describe('ListingDetail (WB-T3.2 / WB-T3.6)', () => {
  beforeEach(() => {
    mockPush.mockReset();
    global.fetch = vi.fn(async (url: any) => {
      const u = String(url);
      if (u.includes('/bids')) return { ok: true, json: async () => ({ items: [{ id: 'b1', bidderUserId: 'u9', amountUsd: '11.00', createdAt: '', isLeading: true }] }) } as any;
      return { ok: true, json: async () => ({ listing: LISTING }) } as any;
    }) as any;
  });
  afterEach(() => vi.restoreAllMocks());

  it('renders three tiers with active mode highlighted', async () => {
    render(<ListingDetail />);
    await waitFor(() => expect(screen.queryByTestId('ld-loading')).toBeNull());
    expect(screen.getByTestId('ld-tier-fixed_price')).toHaveAttribute('data-active', 'false');
    expect(screen.getByTestId('ld-tier-auction')).toHaveAttribute('data-active', 'true');
    expect(screen.getByTestId('ld-tier-rental')).toHaveAttribute('data-active', 'false');
    // Auction CTA enabled, others disabled
    expect(screen.getByTestId('ld-tier-auction-cta')).not.toBeDisabled();
    expect(screen.getByTestId('ld-tier-fixed_price-cta')).toBeDisabled();
    expect(screen.getByTestId('ld-tier-rental-cta')).toBeDisabled();
  });

  it('shows tier prices', async () => {
    render(<ListingDetail />);
    await waitFor(() => expect(screen.queryByTestId('ld-tier-auction-price')).not.toBeNull());
    expect(screen.getByTestId('ld-tier-auction-price').textContent).toBe('From $10.00');
    expect(screen.getByTestId('ld-tier-fixed_price-price').textContent).toBe('—');
    expect(screen.getByTestId('ld-tier-rental-price').textContent).toBe('—');
  });

  it('Remix button navigates to remix page (WB-T3.6)', async () => {
    render(<ListingDetail />);
    await waitFor(() => expect(screen.queryByTestId('ld-remix')).not.toBeNull());
    screen.getByTestId('ld-remix').click();
    expect(mockPush).toHaveBeenCalledWith('/marketplace/remix?from=L1');
  });

  it('renders bid history when auction has bids', async () => {
    render(<ListingDetail />);
    await waitFor(() => expect(screen.queryByTestId('ld-bids')).not.toBeNull());
    expect(screen.getByTestId('ld-bids').textContent).toContain('$11.00');
  });
});
