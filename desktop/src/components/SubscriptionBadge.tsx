/**
 * SubscriptionBadge — top-right chip in ChatPanel header showing current
 * tier + this-month LLM budget usage. Click opens SubscribeSheet.
 *
 * Sprint DB.
 */
import { useEffect, useState } from "react";
import type { CSSProperties } from "react";
import { fetchMyQuota, fetchMySubscription, type MyQuota, type MySubscription, type SubscriptionTier } from "../services/subscription";
import SubscribeSheet from "./SubscribeSheet";
import { useAuthStore } from "../services/store";

const TIER_COLORS: Record<SubscriptionTier, { bg: string; fg: string; border: string; bgLight: string; fgLight: string; borderLight: string }> = {
  free:       { bg: "rgba(156,163,175,0.18)", fg: "#d1d5db", border: "rgba(156,163,175,0.4)",
                bgLight: "#374151", fgLight: "#ffffff", borderLight: "#374151" },
  lite:       { bg: "rgba(96,165,250,0.18)",  fg: "#93c5fd", border: "rgba(96,165,250,0.4)",
                bgLight: "#1d4ed8", fgLight: "#ffffff", borderLight: "#1d4ed8" },
  plus:       { bg: "rgba(167,139,250,0.18)", fg: "#c4b5fd", border: "rgba(167,139,250,0.4)",
                bgLight: "#6d28d9", fgLight: "#ffffff", borderLight: "#6d28d9" },
  pro:        { bg: "rgba(244,114,182,0.18)", fg: "#f9a8d4", border: "rgba(244,114,182,0.4)",
                bgLight: "#be185d", fgLight: "#ffffff", borderLight: "#be185d" },
  elite:      { bg: "var(--tone-warning-bg)",  fg: "#fbbf24", border: "rgba(251,191,36,0.5)",
                bgLight: "#b45309", fgLight: "#ffffff", borderLight: "#b45309" },
  enterprise: { bg: "rgba(249,115,22,0.18)",  fg: "#fb923c", border: "rgba(249,115,22,0.4)",
                bgLight: "#c2410c", fgLight: "#ffffff", borderLight: "#c2410c" },
};

const TIER_LABEL: Record<SubscriptionTier, string> = {
  free: "FREE", lite: "LITE", plus: "PLUS", pro: "PRO", elite: "ELITE", enterprise: "ENT",
};

export default function SubscriptionBadge() {
  const token = useAuthStore((s) => s.token);
  const [sub, setSub] = useState<MySubscription | null>(null);
  const [quota, setQuota] = useState<MyQuota | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    const load = async () => {
      try {
        const [s, q] = await Promise.all([
          fetchMySubscription().catch(() => null),
          fetchMyQuota().catch(() => null),
        ]);
        if (!cancelled) {
          if (s) setSub(s);
          if (q) setQuota(q);
        }
      } catch {}
    };
    void load();
    const t = setInterval(load, 60_000);
    return () => { cancelled = true; clearInterval(t); };
  }, [token]);

  if (!token) return null;

  const tier: SubscriptionTier = sub?.effective_tier ?? "free";
  const c = TIER_COLORS[tier];
  // Sprint P-5 r4 (2026-05-22): solid filled badge on light theme so
  // FREE / LITE / PLUS pills don't dissolve into a white bg. Detect
  // theme via documentElement attribute (set by App.tsx on load).
  const isLight = typeof document !== "undefined"
    && document.documentElement.getAttribute("data-theme") === "light";
  const tierBg = isLight ? c.bgLight : c.bg;
  const tierFg = isLight ? c.fgLight : c.fg;
  const tierBorder = isLight ? c.borderLight : c.border;
  const budgetCents = quota?.quota.llm_budget_cents_monthly ?? 0;
  const usedCents = quota?.llm_usage_cents_this_month ?? 0;
  const pct = budgetCents > 0 ? Math.min(100, Math.round((usedCents / budgetCents) * 100)) : 0;
  const overBudget = budgetCents > 0 && usedCents >= budgetCents;

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        style={{ ...badgeStyle, background: tierBg, color: tierFg, borderColor: tierBorder }}
        title={budgetCents > 0 ? `本月 $${(usedCents / 100).toFixed(2)} / $${(budgetCents / 100).toFixed(2)} (${pct}%)` : ""}
      >
        <span style={{ fontWeight: 800, letterSpacing: 0.4 }}>{TIER_LABEL[tier]}</span>
        {budgetCents > 0 && (
          <span style={{ ...budgetStyle, color: overBudget ? "#f87171" : tierFg }}>
            {pct}%
          </span>
        )}
      </button>
      {open && <SubscribeSheet onClose={() => setOpen(false)} currentTier={tier} />}
    </>
  );
}

const badgeStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  padding: "3px 10px",
  borderRadius: 999,
  border: "1px solid",
  fontSize: 11,
  cursor: "pointer",
  userSelect: "none",
};

const budgetStyle: CSSProperties = {
  fontSize: 10,
  fontWeight: 600,
  padding: "0 4px",
  borderLeft: "1px solid currentColor",
  opacity: 0.85,
  marginLeft: 2,
};
