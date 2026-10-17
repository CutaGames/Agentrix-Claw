/**
 * Subscription client (Desktop) — DB per docs/DESKTOP_AUDIT_AND_REFACTOR_PLAN_2026-05.
 *
 * Shapes follow the backend `SubscriptionService` (checked 10-16, T7 r1):
 *   - `GET /v1/me/quota` answers a flat `TierQuota & { effective_tier }`;
 *   - `GET /v1/subscription` answers `{ tier, status, current_period_end, … }`
 *     with no `effective_tier` and no usage figure.
 * The desktop used to read `quota.quota.llm_budget_cents_monthly`, which threw
 * on the flat answer and took the whole chat-panel window down. Every quota
 * read now goes through `normalizeMyQuota`, which never throws.
 */
import { API_BASE, apiFetch } from "./store";

export type SubscriptionTier = "free" | "lite" | "plus" | "pro" | "elite" | "enterprise";

const TIERS: readonly SubscriptionTier[] = ["free", "lite", "plus", "pro", "elite", "enterprise"];

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

/** `GET /v1/subscription` as the backend sends it. */
export interface MySubscription {
  tier: SubscriptionTier;
  status: string;
  current_period_end: number | null;
  cancel_at_period_end?: boolean;
}

/** `GET /v1/me/quota`, flattened. Only the fields the desktop shows. */
export interface MyQuota {
  /** The tier the backend bills against (a past-due plan counts as free). */
  effective_tier: SubscriptionTier;
  llm_budget_cents_monthly: number;
  pets_max: number;
  devices_max: number;
  skills_publish_max: number;
  skins_publish_max: number;
  products_publish_max: number;
  games_publish_max: number;
  axp_cashback_bps: number;
  /** The backend does not send this today; the UI shows usage only when it is a number. */
  llm_usage_cents_this_month?: number;
}

function asTier(value: unknown): SubscriptionTier | null {
  return typeof value === "string" && (TIERS as readonly string[]).includes(value)
    ? (value as SubscriptionTier)
    : null;
}

function finite(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

/**
 * Accepts the flat backend answer, and the older nested
 * `{ effective_tier, quota: { … } }` shape some builds expected.
 * Returns null for anything that is not an object; never throws.
 */
export function normalizeMyQuota(raw: unknown): MyQuota | null {
  const top = asRecord(raw);
  if (!top) return null;
  const nested = asRecord(top.quota);
  const read = (key: string): number | undefined => finite(nested?.[key]) ?? finite(top[key]);
  return {
    effective_tier: asTier(top.effective_tier) ?? asTier(nested?.tier) ?? asTier(top.tier) ?? "free",
    llm_budget_cents_monthly: read("llm_budget_cents_monthly") ?? 0,
    pets_max: read("pets_max") ?? 0,
    devices_max: read("devices_max") ?? 0,
    skills_publish_max: read("skills_publish_max") ?? 0,
    skins_publish_max: read("skins_publish_max") ?? 0,
    products_publish_max: read("products_publish_max") ?? 0,
    games_publish_max: read("games_publish_max") ?? 0,
    axp_cashback_bps: read("axp_cashback_bps") ?? 0,
    llm_usage_cents_this_month: finite(top.llm_usage_cents_this_month),
  };
}

/**
 * The tier to show. The quota answer wins because the backend already turns a
 * past-due plan into free there; the subscription row is the fallback.
 */
export function effectiveTier(sub: MySubscription | null, quota: MyQuota | null): SubscriptionTier {
  if (quota) return quota.effective_tier;
  if (sub && sub.status !== "past_due") return asTier(sub.tier) ?? "free";
  return "free";
}

/** Budget use in whole percent, or null when the backend did not say how much was used. */
export function budgetPercent(quota: MyQuota | null): number | null {
  if (!quota) return null;
  const budget = quota.llm_budget_cents_monthly;
  const used = quota.llm_usage_cents_this_month;
  if (budget <= 0 || typeof used !== "number") return null;
  return Math.min(100, Math.max(0, Math.round((used / budget) * 100)));
}

function dollars(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

/**
 * Tooltip for the tier badge; `t` is the app-language lookup. Replacements use
 * functions so a "$" in the amount is never read as a replacement pattern.
 */
export function subscriptionBadgeTip(quota: MyQuota | null, t: (key: string) => string): string {
  if (!quota || quota.llm_budget_cents_monthly <= 0) return "";
  const budget = dollars(quota.llm_budget_cents_monthly);
  const pct = budgetPercent(quota);
  const usedCents = quota.llm_usage_cents_this_month;
  if (pct === null || typeof usedCents !== "number") {
    return t("subscription.badge.budgetTip").replace("{budget}", () => budget);
  }
  const used = dollars(usedCents);
  return t("subscription.badge.usageTip")
    .replace("{used}", () => used)
    .replace("{budget}", () => budget)
    .replace("{pct}", () => String(pct));
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

export async function fetchMyQuota(): Promise<MyQuota | null> {
  const res = await apiFetch(`${API_BASE}/v1/me/quota`);
  return normalizeMyQuota(await json<unknown>(res));
}
