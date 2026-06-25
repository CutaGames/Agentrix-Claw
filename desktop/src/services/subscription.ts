/**
 * Subscription client (Desktop) — DB per docs/DESKTOP_AUDIT_AND_REFACTOR_PLAN_2026-05.
 */
import { API_BASE, apiFetch } from "./store";

export type SubscriptionTier = "free" | "lite" | "plus" | "pro" | "elite" | "enterprise";

export interface TierQuota {
  tier: SubscriptionTier;
  llm_budget_cents_monthly: number;
  pets_max: number;
  devices_max: number;
  skills_publish_max: number;
  skins_publish_max: number;
  products_publish_max: number;
  hardware_sku_max: number;
  games_publish_max: number;
  guilds_max: number;
  auction_fee_bps: number;
  axp_cashback_bps: number;
  auto_earn_parallel: number;
}

export interface TierPricing {
  monthly_cents: number;
  yearly_cents: number;
}

export interface TierCatalogEntry {
  tier: SubscriptionTier;
  pricing: TierPricing;
  quota: TierQuota;
}

export interface MySubscription {
  tier: SubscriptionTier;
  status: string;
  current_period_end: string | null;
  effective_tier: SubscriptionTier;
  axp_cashback_bps: number;
}

export interface MyQuota {
  effective_tier: SubscriptionTier;
  quota: TierQuota;
  llm_usage_cents_this_month: number;
  axp_cashback_bps: number;
}

async function json<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`${res.status} ${res.statusText} ${body}`.slice(0, 300));
  }
  return res.json();
}

export async function fetchSubscriptionCatalog(): Promise<{ tiers: TierCatalogEntry[] }> {
  const res = await apiFetch(`${API_BASE}/v1/subscription/catalog`);
  return json(res);
}

export async function fetchMySubscription(): Promise<MySubscription> {
  const res = await apiFetch(`${API_BASE}/v1/subscription`);
  return json(res);
}

export async function fetchMyQuota(): Promise<MyQuota> {
  const res = await apiFetch(`${API_BASE}/v1/me/quota`);
  return json(res);
}
