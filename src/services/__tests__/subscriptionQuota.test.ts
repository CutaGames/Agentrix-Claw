/**
 * Subscription tier monotonicity guard.
 *
 * Free → Lite → Plus → Pro → Elite must be a non-decreasing ladder
 * on every "more is better" quota.  If anyone accidentally bumps a
 * Free quota above Lite (or Plus below Lite), the subscribe page lies
 * to users and the business model breaks.
 *
 * Also checks pricing monotonicity: each paid tier's monthly price
 * must strictly exceed the previous.
 *
 * Source of truth: `backend/src/modules/subscription/subscription.constants.ts`
 */
import fs from 'node:fs';
import path from 'node:path';

const BACKEND_CONSTANTS = path.resolve(
  __dirname,
  '../../../backend/src/modules/subscription/subscription.constants.ts',
);

type Tier = 'free' | 'lite' | 'plus' | 'pro' | 'elite';

type QuotaNumeric = Record<string, number>;

function readQuotas(): Record<Tier, QuotaNumeric> {
  const src = fs.readFileSync(BACKEND_CONSTANTS, 'utf8');
  const tiers: Tier[] = ['free', 'lite', 'plus', 'pro', 'elite'];
  const out: Partial<Record<Tier, QuotaNumeric>> = {};
  for (const tier of tiers) {
    const re = new RegExp(`${tier}:\\s*\\{([\\s\\S]*?)\\n\\s*\\},`);
    const m = src.match(re);
    if (!m) throw new Error(`tier ${tier} not found in TIER_QUOTAS`);
    const body = m[1];
    const quota: QuotaNumeric = {};
    for (const line of body.split('\n')) {
      const mm = line.match(/^\s*(\w+)\s*:\s*(-?\d+)(?:,|$)/);
      if (mm) quota[mm[1]] = Number(mm[2]);
    }
    out[tier] = quota;
  }
  return out as Record<Tier, QuotaNumeric>;
}

function readPricing(): Record<Tier, { monthly_cents: number }> {
  const src = fs.readFileSync(BACKEND_CONSTANTS, 'utf8');
  const tiers: Tier[] = ['free', 'lite', 'plus', 'pro', 'elite'];
  const out: Partial<Record<Tier, { monthly_cents: number }>> = {};
  for (const tier of tiers) {
    const re = new RegExp(`${tier}:\\s*\\{\\s*monthly_cents:\\s*(-?\\d+)`);
    const m = src.match(re);
    if (!m) throw new Error(`tier ${tier} pricing not found`);
    out[tier] = { monthly_cents: Number(m[1]) };
  }
  return out as Record<Tier, { monthly_cents: number }>;
}

const TIERS: Tier[] = ['free', 'lite', 'plus', 'pro', 'elite'];

/**
 * For "more is better" fields, -1 means unlimited → treat as +Infinity.
 * For "less is better" fields (e.g. review_sla_hours, *_fee_bps), smaller
 * values at higher tiers — those are checked separately.
 */
function normalizeMoreIsBetter(v: number): number {
  return v < 0 ? Number.POSITIVE_INFINITY : v;
}

describe('Subscription tier ladder', () => {
  const quotas = readQuotas();
  const pricing = readPricing();

  // Fields where higher tier must be >= lower tier
  const MORE_IS_BETTER = [
    'llm_budget_cents_monthly',
    'daily_chat_rounds',
    'pets_max',
    'devices_max',
    'voice_minutes_daily',
    'skills_publish_max',
    'skins_publish_max',
    'products_publish_max',
    'games_publish_max',
    'guilds_max',
    'sandbox_instances',
    'mcp_servers_max',
    'api_calls_monthly_free',
    'nft_mint_monthly_free',
    'axp_cashback_bps',
    'auto_earn_parallel',
    'privacy_fence_tiers',
    'family_seats',
    'homepage_recommendation_weight',
  ];

  // Fields where higher tier must be <= lower tier (smaller = better)
  const LESS_IS_BETTER = [
    'auction_fee_bps',
    'stripe_fee_bps',
    'review_sla_hours',
    'support_response_hours',
  ];

  describe('"more is better" quotas are non-decreasing across tiers', () => {
    it.each(MORE_IS_BETTER)('%s: free ≤ lite ≤ plus ≤ pro ≤ elite', (field) => {
      const series = TIERS.map((t) => normalizeMoreIsBetter(quotas[t][field]));
      for (let i = 1; i < series.length; i++) {
        expect(series[i]).toBeGreaterThanOrEqual(series[i - 1]);
      }
    });
  });

  describe('"less is better" fees/SLA are non-increasing across tiers', () => {
    it.each(LESS_IS_BETTER)('%s: free ≥ lite ≥ plus ≥ pro ≥ elite', (field) => {
      const series = TIERS.map((t) => quotas[t][field]);
      for (let i = 1; i < series.length; i++) {
        expect(series[i]).toBeLessThanOrEqual(series[i - 1]);
      }
    });
  });

  describe('pricing', () => {
    it('free tier is $0', () => {
      expect(pricing.free.monthly_cents).toBe(0);
    });
    it('paid tier prices strictly increase: lite < plus < pro < elite', () => {
      const paid: Tier[] = ['lite', 'plus', 'pro', 'elite'];
      const prices = paid.map((t) => pricing[t].monthly_cents);
      for (let i = 1; i < prices.length; i++) {
        expect(prices[i]).toBeGreaterThan(prices[i - 1]);
      }
    });
    it('paid tier prices are within docs §3.1 ballpark', () => {
      // Source: docs/MOBILE_REFACTOR_AND_ECOSYSTEM_PLAN_2026-05 §3.1 table
      // Published: Lite $4.99 / Plus $14.99 / Pro $29.99 / Elite $69.00
      expect(pricing.lite.monthly_cents).toBe(499);
      expect(pricing.plus.monthly_cents).toBe(1499);
      expect(pricing.pro.monthly_cents).toBe(2999);
      expect(pricing.elite.monthly_cents).toBe(6900);
    });
  });

  describe('smoke values per tier', () => {
    it('free has the most restrictive defaults', () => {
      expect(quotas.free.llm_budget_cents_monthly).toBeLessThanOrEqual(100);
      expect(quotas.free.daily_chat_rounds).toBeGreaterThan(0); // must be positive, bounded
      expect(quotas.free.pets_max).toBeGreaterThanOrEqual(1);
    });
    it('elite has unlimited (-1) on the headline quotas', () => {
      expect(quotas.elite.pets_max).toBe(-1);
      expect(quotas.elite.skills_publish_max).toBe(-1);
      expect(quotas.elite.skins_publish_max).toBe(-1);
    });
  });
});
