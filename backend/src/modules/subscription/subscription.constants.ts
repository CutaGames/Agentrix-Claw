/**
 * Subscription tier matrix — per docs §3.
 *
 * All abilities open at every tier; quotas scale with tier. Clients read
 * `GET /api/v1/me/quota` which assembles `TIER_QUOTAS[tier]` for the
 * current user's active subscription.
 */

export type SubscriptionTier = 'free' | 'lite' | 'plus' | 'pro' | 'elite' | 'enterprise';

export interface TierQuota {
  tier: SubscriptionTier;
  llm_budget_cents_monthly: number; // monthly cloud LLM budget in USD cents
  daily_chat_rounds: number; // -1 = unlimited
  pets_max: number; // -1 = unlimited
  devices_max: number;
  voice_minutes_daily: number; // -1 = unlimited
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
  auction_fee_bps: number; // basis points (100 = 1%)
  stripe_fee_bps: number;
  axp_cashback_bps: number; // basis points of USD cents → AXP multiplier
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
  homepage_recommendation_weight: number; // 100 = 1×
}

export const TIER_QUOTAS: Record<SubscriptionTier, TierQuota> = {
  free: {
    tier: 'free',
    llm_budget_cents_monthly: 30,
    daily_chat_rounds: 20,
    pets_max: 2,
    devices_max: 1,
    voice_minutes_daily: 5,
    skills_publish_max: 1,
    skins_publish_max: 1,
    products_publish_max: 1,
    hardware_l3_max: 0,
    hardware_l2_max: 0,
    games_publish_max: 0,
    guilds_max: 0,
    sandbox_instances: 0,
    mcp_servers_max: 0,
    api_calls_monthly_free: 0,
    nft_mint_monthly_free: 0,
    auction_fee_bps: 250,
    stripe_fee_bps: 290,
    axp_cashback_bps: 0,
    auto_earn_parallel: 0,
    a2a_priority_matching: false,
    l3_cosign: false,
    privacy_fence_tiers: 1,
    agent_team_studio: 'none',
    custom_system_prompt: false,
    custom_model_router: false,
    pet_sdk_beta: false,
    family_seats: 0,
    review_sla_hours: 72,
    support_response_hours: 168,
    homepage_recommendation_weight: 100,
  },
  lite: {
    tier: 'lite',
    llm_budget_cents_monthly: 250,
    daily_chat_rounds: -1,
    pets_max: 5,
    devices_max: 2,
    voice_minutes_daily: -1,
    skills_publish_max: 3,
    skins_publish_max: 3,
    products_publish_max: 5,
    hardware_l3_max: 1,
    hardware_l2_max: 0,
    games_publish_max: 0,
    guilds_max: 0,
    sandbox_instances: 1,
    mcp_servers_max: 1,
    api_calls_monthly_free: 1000,
    nft_mint_monthly_free: 2,
    auction_fee_bps: 180,
    stripe_fee_bps: 250,
    axp_cashback_bps: 500,
    auto_earn_parallel: 1,
    a2a_priority_matching: false,
    l3_cosign: false,
    privacy_fence_tiers: 2,
    agent_team_studio: 'none',
    custom_system_prompt: false,
    custom_model_router: false,
    pet_sdk_beta: false,
    family_seats: 1,
    review_sla_hours: 48,
    support_response_hours: 72,
    homepage_recommendation_weight: 120,
  },
  plus: {
    tier: 'plus',
    llm_budget_cents_monthly: 800,
    daily_chat_rounds: -1,
    pets_max: 15,
    devices_max: 4,
    voice_minutes_daily: -1,
    skills_publish_max: 10,
    skins_publish_max: 10,
    products_publish_max: 30,
    hardware_l3_max: 3,
    hardware_l2_max: 0,
    games_publish_max: 1,
    guilds_max: 1,
    sandbox_instances: 3,
    mcp_servers_max: 3,
    api_calls_monthly_free: 10000,
    nft_mint_monthly_free: 10,
    auction_fee_bps: 100,
    stripe_fee_bps: 200,
    axp_cashback_bps: 1000,
    auto_earn_parallel: 2,
    a2a_priority_matching: false,
    l3_cosign: false,
    privacy_fence_tiers: 3,
    agent_team_studio: 'basic',
    custom_system_prompt: false,
    custom_model_router: false,
    pet_sdk_beta: false,
    family_seats: 3,
    review_sla_hours: 48,
    support_response_hours: 48,
    homepage_recommendation_weight: 150,
  },
  pro: {
    tier: 'pro',
    llm_budget_cents_monthly: 2000,
    daily_chat_rounds: -1,
    pets_max: 40,
    devices_max: 6,
    voice_minutes_daily: -1,
    skills_publish_max: 30,
    skins_publish_max: -1,
    products_publish_max: 100,
    hardware_l3_max: -1,
    hardware_l2_max: 1,
    games_publish_max: 3,
    guilds_max: -1,
    sandbox_instances: 10,
    mcp_servers_max: 10,
    api_calls_monthly_free: 100000,
    nft_mint_monthly_free: -1,
    auction_fee_bps: 30,
    stripe_fee_bps: 180,
    axp_cashback_bps: 1500,
    auto_earn_parallel: 3,
    a2a_priority_matching: true,
    l3_cosign: true,
    privacy_fence_tiers: 4,
    agent_team_studio: 'full',
    custom_system_prompt: true,
    custom_model_router: true,
    pet_sdk_beta: false,
    family_seats: 6,
    review_sla_hours: 24,
    support_response_hours: 24,
    homepage_recommendation_weight: 200,
  },
  elite: {
    tier: 'elite',
    llm_budget_cents_monthly: 5000,
    daily_chat_rounds: -1,
    pets_max: -1,
    devices_max: 10,
    voice_minutes_daily: -1,
    skills_publish_max: -1,
    skins_publish_max: -1,
    products_publish_max: -1,
    hardware_l3_max: -1,
    hardware_l2_max: -1,
    games_publish_max: -1,
    guilds_max: -1,
    sandbox_instances: 50,
    mcp_servers_max: -1,
    api_calls_monthly_free: 1000000,
    nft_mint_monthly_free: -1,
    auction_fee_bps: 0,
    stripe_fee_bps: 150,
    axp_cashback_bps: 2000,
    auto_earn_parallel: -1,
    a2a_priority_matching: true,
    l3_cosign: true,
    privacy_fence_tiers: 4,
    agent_team_studio: 'full_plus',
    custom_system_prompt: true,
    custom_model_router: true,
    pet_sdk_beta: true,
    family_seats: 10,
    review_sla_hours: 2,
    support_response_hours: 4,
    homepage_recommendation_weight: 300,
  },
  enterprise: {
    tier: 'enterprise',
    llm_budget_cents_monthly: -1,
    daily_chat_rounds: -1,
    pets_max: -1,
    devices_max: -1,
    voice_minutes_daily: -1,
    skills_publish_max: -1,
    skins_publish_max: -1,
    products_publish_max: -1,
    hardware_l3_max: -1,
    hardware_l2_max: -1,
    games_publish_max: -1,
    guilds_max: -1,
    sandbox_instances: -1,
    mcp_servers_max: -1,
    api_calls_monthly_free: -1,
    nft_mint_monthly_free: -1,
    auction_fee_bps: 0,
    stripe_fee_bps: 150,
    axp_cashback_bps: 1500,
    auto_earn_parallel: -1,
    a2a_priority_matching: true,
    l3_cosign: true,
    privacy_fence_tiers: 4,
    agent_team_studio: 'full_plus',
    custom_system_prompt: true,
    custom_model_router: true,
    pet_sdk_beta: true,
    family_seats: -1,
    review_sla_hours: 2,
    support_response_hours: 1,
    homepage_recommendation_weight: 300,
  },
};

/** Publicly displayed price catalog. Stripe price IDs are configured via env vars per tier. */
export const TIER_PRICING = {
  free: { monthly_cents: 0, yearly_cents: 0 },
  lite: { monthly_cents: 499, yearly_cents: 4990 },
  plus: { monthly_cents: 1499, yearly_cents: 14990 },
  pro: { monthly_cents: 2999, yearly_cents: 29990 },
  elite: { monthly_cents: 6900, yearly_cents: 69000 },
  enterprise: { monthly_cents: -1, yearly_cents: -1 }, // contact sales
} as const;
