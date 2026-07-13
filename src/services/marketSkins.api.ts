/**
 * Market Skins API client — Sprint 1 (跨端链路打通).
 *
 * Calls `GET /api/v1/market/skins` — the new unified marketplace endpoint
 * that supports sort, clan filter, and cursor-based pagination.
 *
 * Replaces the older `/pet-skin/marketplace` endpoint for the
 * SkinAuctionScreen listing.
 */
import { apiFetch } from './api';

// ── Types ────────────────────────────────────────────────────

export type SkinClan = 'A' | 'B' | 'C' | 'D' | 'E' | 'F';
export type SkinSortV2 = 'featured' | 'newest' | 'popular';
export type SkinFormat = 'svg' | 'rive' | 'vrm' | 'live2d';
export type SkinSource = 'platform' | 'generated' | 'purchased' | 'remixed' | 'gifted';
export type ListingMode = 'fixed_price' | 'auction' | 'rental';

export interface SkinListItem {
  id: string;
  displayName: string;
  thumbnailUrl: string | null;
  url: string;
  format: SkinFormat;
  clan: SkinClan;
  source: SkinSource;
  creatorUsername: string;
  creatorUserId: string | null;
  likeCount: number;
  viewCount: number;
  remixCount: number;
  listingId: string | null;
  listingMode: ListingMode | null;
  priceUsd: number | null;
  startingBidUsd: number | null;
  currentBidUsd: number | null;
  auctionEndsAt: string | null;
  axpAccepted: boolean;
  axpDiscountPercent: number;
  featured: boolean;
  createdAt: string;
  parentSkinId: string | null;
}

export interface MarketSkinsResponse {
  items: SkinListItem[];
  total: number;
  nextCursor: string | null;
}

// ── Query params ─────────────────────────────────────────────

export interface MarketSkinsParams {
  sort?: SkinSortV2;
  clan?: SkinClan;
  limit?: number;
  cursor?: string;
}

// ── API call ─────────────────────────────────────────────────

export async function fetchMarketSkins(
  params: MarketSkinsParams = {},
): Promise<MarketSkinsResponse> {
  const qs = new URLSearchParams();
  if (params.sort) qs.set('sort', params.sort);
  if (params.clan) qs.set('clan', params.clan);
  if (params.limit != null) qs.set('limit', String(params.limit));
  if (params.cursor) qs.set('cursor', params.cursor);

  const query = qs.toString();
  const path = `/v1/market/skins${query ? `?${query}` : ''}`;
  return apiFetch<MarketSkinsResponse>(path);
}
