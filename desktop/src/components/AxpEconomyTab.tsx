/**
 * AxpEconomyTab — compact AXP + subscription + quota view embedded into
 * AgentEconomyPanel (via a new 'axp' tab). Sprint DD.
 */
import { useEffect, useState } from "react";
import type { CSSProperties } from "react";
import { fetchAxpBalance, type AxpBalanceView } from "../services/axp";
import { fetchMySubscription, fetchMyQuota, type MySubscription, type MyQuota, type SubscriptionTier } from "../services/subscription";

const TIER_LABEL: Record<SubscriptionTier, string> = {
  free: "FREE", lite: "LITE", plus: "PLUS", pro: "PRO", elite: "ELITE", enterprise: "ENT",
};

const TIER_COLORS: Record<SubscriptionTier, string> = {
  free: "#9ca3af", lite: "#60a5fa", plus: "#a78bfa",
  pro: "#f472b6", elite: "#fbbf24", enterprise: "#f97316",
};

export default function AxpEconomyTab() {
  const [balance, setBalance] = useState<AxpBalanceView | null>(null);
  const [sub, setSub] = useState<MySubscription | null>(null);
  const [quota, setQuota] = useState<MyQuota | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const [b, s, q] = await Promise.all([
          fetchAxpBalance().catch(() => null),
          fetchMySubscription().catch(() => null),
          fetchMyQuota().catch(() => null),
        ]);
        if (!cancelled) {
          if (b) setBalance(b);
          if (s) setSub(s);
          if (q) setQuota(q);
        }
      } catch {}
    };
    void load();
    const bump = () => load();
    window.addEventListener("agentrix:axp-changed", bump);
    const t = setInterval(load, 30_000);
    return () => {
      cancelled = true;
      window.removeEventListener("agentrix:axp-changed", bump);
      clearInterval(t);
    };
  }, []);

  const tier: SubscriptionTier = sub?.effective_tier ?? "free";
  const tierColor = TIER_COLORS[tier];
  const budgetCents = quota?.quota.llm_budget_cents_monthly ?? 0;
  const usedCents = quota?.llm_usage_cents_this_month ?? 0;
  const pct = budgetCents > 0 ? Math.min(100, Math.round((usedCents / budgetCents) * 100)) : 0;
  const overBudget = budgetCents > 0 && usedCents >= budgetCents;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {/* AXP Balance */}
      <div style={card}>
        <div style={{ fontSize: 11, color: "#9ca3af", textTransform: "uppercase", letterSpacing: 0.5 }}>
          AXP 余额
        </div>
        <div style={{ fontSize: 26, fontWeight: 800, color: "#22d3ee", marginTop: 4 }}>
          💎 {(balance?.balance ?? 0).toLocaleString()}
        </div>
        {balance && (
          <div style={{ fontSize: 10, color: "#9ca3af", marginTop: 4 }}>
            累计获得 {balance.lifetime_earned.toLocaleString()} · 消耗 {balance.lifetime_spent.toLocaleString()}
            {balance.lifetime_expired > 0 ? ` · 过期 ${balance.lifetime_expired.toLocaleString()}` : ""}
          </div>
        )}
      </div>

      {/* Subscription tier + budget */}
      <div style={card}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
          <div style={{ fontSize: 11, color: "#9ca3af", textTransform: "uppercase", letterSpacing: 0.5 }}>
            订阅档位
          </div>
          <div
            style={{
              padding: "3px 10px",
              borderRadius: 999,
              border: `1px solid ${tierColor}55`,
              color: tierColor,
              fontSize: 11,
              fontWeight: 800,
            }}
          >
            {TIER_LABEL[tier]}
          </div>
        </div>
        {budgetCents > 0 ? (
          <>
            <div style={{ fontSize: 12, color: "#e5e7eb", marginBottom: 6 }}>
              本月 LLM ${(usedCents / 100).toFixed(2)} / ${(budgetCents / 100).toFixed(2)}
            </div>
            <div style={progressWrap}>
              <div
                style={{
                  ...progressBar,
                  width: `${pct}%`,
                  background: overBudget ? "#f87171" : "#22d3ee",
                }}
              />
            </div>
            {overBudget && (
              <div style={{ fontSize: 10, color: "#f87171", marginTop: 6 }}>
                ⚠️ 预算已用完。可用 AXP 抵扣 / 绑卡续用 / BYOK 自带 key。
              </div>
            )}
          </>
        ) : (
          <div style={{ fontSize: 11, color: "#9ca3af" }}>
            Free 档无独立 LLM 预算 · 升级解锁更多配额
          </div>
        )}
        {sub?.axp_cashback_bps ? (
          <div style={{ marginTop: 8, fontSize: 11, color: "#22d3ee" }}>
            💎 消费返现 {(sub.axp_cashback_bps / 100).toFixed(0)}% AXP
          </div>
        ) : null}
      </div>

      {/* Quota grid */}
      {quota && (
        <div style={card}>
          <div style={{ fontSize: 11, color: "#9ca3af", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 10 }}>
            配额
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
            <Quota label="🐾 主宠" value={quota.quota.pets_max} />
            <Quota label="🖥 设备" value={quota.quota.devices_max} />
            <Quota label="⚡ 技能" value={quota.quota.skills_publish_max} />
            <Quota label="👗 皮肤" value={quota.quota.skins_publish_max} />
            <Quota label="📦 商品" value={quota.quota.products_publish_max} />
            <Quota label="🎮 游戏" value={quota.quota.games_publish_max} />
          </div>
        </div>
      )}

      <div style={{ fontSize: 10, color: "#9ca3af", textAlign: "center", opacity: 0.7 }}>
        点击右上角档位 Badge → 订阅目录 / AXP 抵扣 slider
      </div>
    </div>
  );
}

function Quota({ label, value }: { label: string; value: number }) {
  return (
    <div style={quotaCell}>
      <div style={{ fontSize: 10, color: "#9ca3af" }}>{label}</div>
      <div style={{ fontSize: 15, fontWeight: 700, color: "#e5e7eb", marginTop: 2 }}>
        {value < 0 ? "∞" : value.toLocaleString()}
      </div>
    </div>
  );
}

const card: CSSProperties = {
  padding: 12,
  background: "rgba(255,255,255,0.04)",
  border: "1px solid rgba(255,255,255,0.08)",
  borderRadius: 10,
};

const progressWrap: CSSProperties = {
  height: 6,
  background: "rgba(255,255,255,0.08)",
  borderRadius: 3,
  overflow: "hidden",
};

const progressBar: CSSProperties = {
  height: "100%",
  transition: "width 400ms ease",
  borderRadius: 3,
};

const quotaCell: CSSProperties = {
  padding: 8,
  background: "rgba(255,255,255,0.03)",
  borderRadius: 8,
};
