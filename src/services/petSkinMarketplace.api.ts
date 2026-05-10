/**
 * Pet Skin Marketplace client — Sprint E5.
 *
 * Exposes the subset of `/pet-skin/*` endpoints needed for Plaza · Pets ·
 * Skins: browse marketplace + preview + install.
 */
import { apiFetch } from './api';

export type SkinSource = 'platform' | 'generated' | 'remixed';
export type SkinSort =
  | 'newest'
  | 'oldest'
  | 'price_asc'
  | 'price_desc'
  | 'name_asc';

export interface SkinDto {
  id: string;
  ownerUserId?: string | null;
  name: string;
  description?: string | null;
  source: SkinSource;
  format: 'svg' | 'rive' | 'vrm' | 'live2d';
  thumbnailUrl?: string | null;
  manifestUrl?: string | null;
  priceCents?: number | null;
  currency?: string | null;
  visibility?: 'public' | 'private' | 'listed';
  createdAt?: string;
  tags?: string[];
}

export interface MarketplaceResponse {
  items: SkinDto[];
  total: number;
}

export async function fetchSkinMarketplace(opts: {
  limit?: number;
  offset?: number;
  source?: SkinSource;
  q?: string;
  sort?: SkinSort;
  minPriceCents?: number;
  maxPriceCents?: number;
} = {}): Promise<MarketplaceResponse> {
  const qs = new URLSearchParams();
  if (opts.limit != null) qs.set('limit', String(opts.limit));
  if (opts.offset != null) qs.set('offset', String(opts.offset));
  if (opts.source) qs.set('source', opts.source);
  if (opts.q) qs.set('q', opts.q);
  if (opts.sort) qs.set('sort', opts.sort);
  if (opts.minPriceCents != null) qs.set('minPriceCents', String(opts.minPriceCents));
  if (opts.maxPriceCents != null) qs.set('maxPriceCents', String(opts.maxPriceCents));
  return apiFetch<MarketplaceResponse>(`/pet-skin/marketplace?${qs.toString()}`);
}

export async function fetchSkinPreview(skinId: string): Promise<{
  ok: boolean;
  skin?: SkinDto;
  preview_token?: string;
  expires_at?: number;
  error?: string;
}> {
  return apiFetch(`/pet-skin/preview/${skinId}`);
}

export async function installSkin(skinId: string, body: Record<string, unknown> = {}): Promise<{
  ok: boolean;
  skin?: SkinDto;
  error?: string;
  tx_id?: string;
  price_cents?: number;
}> {
  return apiFetch(`/pet-skin/marketplace/${skinId}/install`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}
