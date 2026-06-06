/**
 * Subscription client — per docs §3.
 */
import { apiFetch } from './api';

export type SubscriptionTier =
  | 'free'
  | 'lite'
  | 'plus'
  | 'pro'
  | 'elite'
  | 'enterprise';

export interface SubscriptionView {
  tier: SubscriptionTier;
  status: string;
  currency: string;
  price_cents: number;
  billing_cycle: 'monthly' | 'yearly';
  current_period_start: number | null;
  current_period_end: number | null;
  cancel_at_period_end: boolean;
  axp_applied_current: number;
}

export interface TierQuota {
  tier: SubscriptionTier;
  llm_budget_cents_monthly: number;
  daily_chat_rounds: number;
  pets_max: number;
  devices_max: number;
  voice_minutes_daily: number;
  skills_publish_max: number;
  skins_publish_max: number;
  products_publish_max: number;
  hardware_l3_max: number;
  hardware_l2_max: number;
  games_publish_max: number;
  guilds_max: number;
  sandbox_instances: number;
  mcp_servers_max: number;
  api_calls_monthly_free: number;
  nft_mint_monthly_free: number;
  auction_fee_bps: number;
  stripe_fee_bps: number;
  axp_cashback_bps: number;
  auto_earn_parallel: number;
  a2a_priority_matching: boolean;
  l3_cosign: boolean;
  privacy_fence_tiers: number;
  agent_team_studio: 'none' | 'basic' | 'full' | 'full_plus';
  custom_system_prompt: boolean;
  custom_model_router: boolean;
  pet_sdk_beta: boolean;
  family_seats: number;
  review_sla_hours: number;
  support_response_hours: number;
  homepage_recommendation_weight: number;
  effective_tier: SubscriptionTier;
}

export interface TierCatalogEntry {
  tier: SubscriptionTier;
  pricing: { monthly_cents: number; yearly_cents: number };
  quota: TierQuota;
}

export async function fetchSubscriptionCatalog(): Promise<{ tiers: TierCatalogEntry[] }> {
  return apiFetch('/v1/subscription/catalog');
}

export async function fetchMySubscription(): Promise<SubscriptionView> {
  return apiFetch('/v1/subscription');
}

export async function fetchMyQuota(): Promise<TierQuota> {
  return apiFetch('/v1/me/quota');
}
