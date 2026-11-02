/**
 * AxpEconomyTab — compact AXP + subscription + quota view embedded into
 * AgentEconomyPanel (via a new 'axp' tab). Sprint DD.
 */
import { useEffect, useState } from "react";
import type { CSSProperties } from "react";
import { fetchAxpBalance, type AxpBalanceView } from "../services/axp";
import {
  budgetPercent,
  effectiveTier,
  fetchMySubscription,
  fetchMyQuota,
  type MySubscription,
  type MyQuota,
  type SubscriptionTier,
} from "../services/subscription";

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

  const tier: SubscriptionTier = effectiveTier(sub, quota);
  const tierColor = TIER_COLORS[tier];
  const budgetCents = quota?.llm_budget_cents_monthly ?? 0;
  // The backend does not send this month's usage yet; without it the bar
  // would always read 0% (T7 r1), so only the budget is shown.
  const pct = budgetPercent(quota);
  const usedCents = quota?.llm_usage_cents_this_month;
  const overBudget = pct !== null && pct >= 100;
  const cashbackBps = quota?.axp_cashback_bps ?? 0;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {/* AXP Balance */}
      <div style={card}>
        <div style={{ fontSize: 11, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: 0.5 }}>
          AXP 积分余额
        </div>
        <div style={{ fontSize: 26, fontWeight: 800, color: "#22d3ee", marginTop: 4 }}>
          💎 {(balance?.balance ?? 0).toLocaleString()}
        </div>
        {balance && (
          <div style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 4 }}>
            累计获得 {balance.lifetime_earned.toLocaleString()} · 消耗 {balance.lifetime_spent.toLocaleString()}
            {balance.lifetime_expired > 0 ? ` · 过期 ${balance.lifetime_expired.toLocaleString()}` : ""}
          </div>
        )}
      </div>

      {/* Subscription tier + budget */}
      <div style={card}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
          <div style={{ fontSize: 11, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: 0.5 }}>
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
        {budgetCents > 0 && pct !== null && typeof usedCents === "number" ? (
          <>
            <div style={{ fontSize: 12, color: "var(--text-card)", marginBottom: 6 }}>
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
                ⚠️ 预算已用完。可用 AXP 积分抵扣 / 绑卡续用 / BYOK 自带 key。
              </div>
            )}
          </>
        ) : budgetCents > 0 ? (
          <div style={{ fontSize: 12, color: "var(--text-card)" }}>
            每月模型额度 ${(budgetCents / 100).toFixed(2)}
          </div>
        ) : (
          <div style={{ fontSize: 11, color: "var(--text-muted)" }}>
            Free 档无独立 LLM 预算 · 升级解锁更多配额
          </div>
        )}
        {cashbackBps > 0 ? (
          <div style={{ marginTop: 8, fontSize: 11, color: "#22d3ee" }}>
            💎 消费赠送 {(cashbackBps / 100).toFixed(0)}% AXP 积分
          </div>
        ) : null}
      </div>

      {/* Quota grid */}
      {quota && (
        <div style={card}>
          <div style={{ fontSize: 11, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 10 }}>
            配额
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
            <Quota label="🐾 主宠" value={quota.pets_max} />
            <Quota label="🖥 设备" value={quota.devices_max} />
            <Quota label="⚡ 技能" value={quota.skills_publish_max} />
            <Quota label="👗 皮肤" value={quota.skins_publish_max} />
            <Quota label="📦 商品" value={quota.products_publish_max} />
            <Quota label="🎮 游戏" value={quota.games_publish_max} />
          </div>
        </div>
      )}

      <div style={{ fontSize: 10, color: "var(--text-muted)", textAlign: "center", opacity: 0.7 }}>
        点击右上角档位 Badge → 订阅目录 / AXP 积分抵扣
      </div>
    </div>
  );
}

function Quota({ label, value }: { label: string; value: number }) {
  return (
    <div style={quotaCell}>
      <div style={{ fontSize: 10, color: "var(--text-muted)" }}>{label}</div>
      <div style={{ fontSize: 15, fontWeight: 700, color: "var(--text-card)", marginTop: 2 }}>
        {value < 0 ? "∞" : value.toLocaleString()}
      </div>
    </div>
  );
}

const card: CSSProperties = {
  padding: 12,
  background: "var(--bg-card)",
  border: "1px solid rgba(255,255,255,0.08)",
  borderRadius: 10,
};

const progressWrap: CSSProperties = {
  height: 6,
  background: "var(--bg-overlay-medium)",
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
  background: "var(--bg-card)",
  borderRadius: 8,
};
