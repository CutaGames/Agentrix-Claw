/**
 * SubscribeSheet — 5-tier subscription catalog + AXP discount slider.
 *
 * Sprint DB. Mirrors mobile SubscribePlanScreen but rendered as a
 * right-docked sheet (desktop pattern).
 */
import { useEffect, useMemo, useState } from "react";
import type { CSSProperties } from "react";
import { fetchSubscriptionCatalog, type SubscriptionTier, type TierCatalogEntry } from "../services/subscription";
import { fetchAxpBalance, type AxpBalanceView } from "../services/axp";

interface Props {
  onClose: () => void;
  currentTier: SubscriptionTier;
}

const TIER_LABELS: Record<SubscriptionTier, string> = {
  free: "Free", lite: "Lite", plus: "Plus", pro: "Pro", elite: "Elite", enterprise: "Enterprise",
};

const TIER_BLURB: Record<SubscriptionTier, string> = {
  free: "尝鲜 · 小配额 · 获 AXP",
  lite: "去硬限 · 5% AXP 返现",
  plus: "黄金档 · 10% 返现 · Auto-Earn",
  pro: "核心 · 全开发者 · 15% 返现",
  elite: "旗舰 · 0 手续费 · Pet SDK · 20% 返现",
  enterprise: "私有部署 · SLA · 白标",
};

const TIER_ACCENT: Record<SubscriptionTier, string> = {
  free: "#9ca3af", lite: "#60a5fa", plus: "#a78bfa",
  pro: "#f472b6", elite: "#fbbf24", enterprise: "#f97316",
};

function formatPrice(cents: number): string {
  if (cents < 0) return "Contact";
  if (cents === 0) return "Free";
  return `$${(cents / 100).toFixed(2)}`;
}

export default function SubscribeSheet({ onClose, currentTier }: Props) {
  const [cycle, setCycle] = useState<"monthly" | "yearly">("monthly");
  const [catalog, setCatalog] = useState<TierCatalogEntry[]>([]);
  const [balance, setBalance] = useState<AxpBalanceView | null>(null);
  const [selected, setSelected] = useState<SubscriptionTier | null>(null);
  const [axpToApply, setAxpToApply] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [c, b] = await Promise.all([
          fetchSubscriptionCatalog().catch(() => ({ tiers: [] as TierCatalogEntry[] })),
          fetchAxpBalance().catch(() => null),
        ]);
        if (!cancelled) {
          setCatalog(c.tiers || []);
          if (b) setBalance(b);
        }
      } catch {}
      if (!cancelled) setLoading(false);
    })();
    return () => { cancelled = true; };
  }, []);

  const axpBalance = balance?.balance ?? 0;
  const selectedEntry = useMemo(
    () => catalog.find((e) => e.tier === selected),
    [catalog, selected],
  );
  const selectedPriceCents = selectedEntry
    ? cycle === "monthly"
      ? selectedEntry.pricing.monthly_cents
      : selectedEntry.pricing.yearly_cents
    : 0;
  const priceInAxp = selectedPriceCents > 0 ? Math.floor(selectedPriceCents / 0.1) : 0;
  const maxAxpDiscount = Math.min(axpBalance, Math.floor(priceInAxp * 0.2));
  const discountUsd = axpToApply * 0.001;

  const onCheckout = () => {
    if (!selectedEntry) return;
    // Desktop: subscribe flow goes to web (Stripe checkout runs in browser)
    const url = `https://agentrix.top/subscribe?tier=${encodeURIComponent(selectedEntry.tier)}&cycle=${cycle}&axp=${axpToApply}`;
    void import("@tauri-apps/plugin-shell")
      .then(({ open }) => open(url))
      .catch(() => window.open(url, "_blank"));
  };

  return (
    <div style={backdropStyle} onClick={onClose}>
      <div style={sheetStyle} onClick={(e) => e.stopPropagation()}>
        <div style={headerStyle}>
          <div>
            <div style={titleStyle}>选择订阅档位</div>
            <div style={subtitleStyle}>所有能力全档开放 · 配额随订阅升级</div>
          </div>
          <button onClick={onClose} style={closeBtn}>✕</button>
        </div>

        <div style={cycleRow}>
          <button
            onClick={() => setCycle("monthly")}
            style={{ ...cycleBtn, ...(cycle === "monthly" ? cycleBtnActive : {}) }}
          >
            月付
          </button>
          <button
            onClick={() => setCycle("yearly")}
            style={{ ...cycleBtn, ...(cycle === "yearly" ? cycleBtnActive : {}) }}
          >
            年付 · 约省 17%
          </button>
        </div>

        <div style={listStyle}>
          {loading ? (
            <div style={emptyStyle}>加载中…</div>
          ) : (
            catalog.map((entry) => {
              const price = cycle === "monthly" ? entry.pricing.monthly_cents : entry.pricing.yearly_cents;
              const accent = TIER_ACCENT[entry.tier];
              const isCurrent = entry.tier === currentTier;
              const isSelected = entry.tier === selected;
              return (
                <button
                  key={entry.tier}
                  onClick={() => {
                    if (!isCurrent) {
                      setSelected(entry.tier);
                      setAxpToApply(0);
                    }
                  }}
                  disabled={isCurrent}
                  style={{
                    ...cardStyle,
                    borderColor: isSelected ? accent : `${accent}44`,
                    borderWidth: isSelected ? 2 : 1,
                    opacity: isCurrent ? 0.65 : 1,
                    cursor: isCurrent ? "default" : "pointer",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                    <div style={{ color: accent, fontWeight: 800, fontSize: 16 }}>{TIER_LABELS[entry.tier]}</div>
                    <div style={{ fontSize: 18, fontWeight: 800, color: "var(--text-card)" }}>
                      {formatPrice(price)}
                      <span style={{ fontSize: 10, color: "var(--text-muted)", fontWeight: 600 }}>
                        {price > 0 ? (cycle === "monthly" ? " /mo" : " /yr") : ""}
                      </span>
                    </div>
                  </div>
                  <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 4 }}>
                    {TIER_BLURB[entry.tier]}
                  </div>
                  {isCurrent && <div style={currentTag}>当前</div>}
                </button>
              );
            })
          )}
        </div>

        {/* AXP discount */}
        {selectedEntry && selectedPriceCents > 0 && (
          <div style={axpBlock}>
            <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text-card)", marginBottom: 6 }}>
              💎 使用 AXP 抵扣
            </div>
            <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 10 }}>
              余额 {axpBalance.toLocaleString()} · 最多可抵 {maxAxpDiscount.toLocaleString()} AXP (20%)
            </div>
            {axpBalance === 0 ? (
              <div style={{ fontSize: 11, color: "var(--text-muted)", fontStyle: "italic" }}>
                通过每日签到、对话、共养即可获取 AXP
              </div>
            ) : (
              <>
                <input
                  type="range"
                  min={0}
                  max={maxAxpDiscount}
                  value={axpToApply}
                  onChange={(e) => setAxpToApply(Number(e.target.value))}
                  style={{ width: "100%", accentColor: "#22d3ee" }}
                />
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "var(--text-muted)", marginTop: 4 }}>
                  <span>0%</span>
                  <span>20%</span>
                </div>
                <div style={{ marginTop: 8, padding: "8px 10px", background: "rgba(34,211,238,0.12)", borderRadius: 8, fontSize: 12, textAlign: "center", color: "#22d3ee", fontWeight: 600 }}>
                  抵扣 {axpToApply.toLocaleString()} AXP = 省 ${discountUsd.toFixed(3)}
                </div>
              </>
            )}
          </div>
        )}

        <div style={footerStyle}>
          <button
            onClick={onCheckout}
            disabled={!selectedEntry || selectedEntry.tier === "enterprise"}
            style={{
              ...checkoutBtn,
              opacity: !selectedEntry || selectedEntry.tier === "enterprise" ? 0.5 : 1,
              cursor: !selectedEntry ? "not-allowed" : "pointer",
            }}
          >
            {selectedEntry
              ? selectedEntry.tier === "enterprise"
                ? "联系销售"
                : `继续到结算 · ${formatPrice(selectedPriceCents)}${cycle === "monthly" ? "/月" : "/年"}`
              : "选择一个档位"}
          </button>
          <div style={{ fontSize: 10, color: "var(--text-muted)", textAlign: "center", marginTop: 6 }}>
            结算将在浏览器中打开 (Stripe)
          </div>
        </div>
      </div>
    </div>
  );
}

const backdropStyle: CSSProperties = {
  position: "fixed", inset: 0, background: "rgba(0,0,0,0.65)", zIndex: 9800, display: "flex", justifyContent: "flex-end",
};
const sheetStyle: CSSProperties = {
  width: 400, height: "100%", background: "rgba(18,22,32,0.98)", borderLeft: "1px solid rgba(255,255,255,0.08)",
  display: "flex", flexDirection: "column", color: "var(--text-card)",
};
const headerStyle: CSSProperties = {
  padding: 16, borderBottom: "1px solid rgba(255,255,255,0.06)",
  display: "flex", justifyContent: "space-between", alignItems: "flex-start",
};
const titleStyle: CSSProperties = { fontSize: 18, fontWeight: 800 };
const subtitleStyle: CSSProperties = { fontSize: 11, color: "var(--text-muted)", marginTop: 3 };
const closeBtn: CSSProperties = {
  background: "transparent", border: "1px solid rgba(255,255,255,0.12)", color: "var(--text-muted)",
  borderRadius: 8, padding: "4px 9px", cursor: "pointer", fontSize: 12,
};
const cycleRow: CSSProperties = { display: "flex", gap: 6, padding: "10px 16px", borderBottom: "1px solid rgba(255,255,255,0.06)" };
const cycleBtn: CSSProperties = {
  flex: 1, padding: "6px", fontSize: 12, fontWeight: 600, borderRadius: 999,
  background: "var(--bg-card)", border: "1px solid rgba(255,255,255,0.08)", color: "var(--text-muted)", cursor: "pointer",
};
const cycleBtnActive: CSSProperties = { background: "#22d3ee", color: "#0b1220", border: "1px solid #22d3ee" };
const listStyle: CSSProperties = { flex: 1, overflowY: "auto", padding: "10px 14px", display: "flex", flexDirection: "column", gap: 8 };
const cardStyle: CSSProperties = {
  position: "relative", padding: "12px 14px", borderRadius: 12, borderStyle: "solid",
  background: "var(--bg-card)", textAlign: "left", color: "var(--text-card)",
};
const currentTag: CSSProperties = {
  position: "absolute", top: 10, right: 10, fontSize: 9, fontWeight: 700,
  padding: "2px 6px", borderRadius: 999, background: "rgba(34,211,238,0.2)", color: "#22d3ee",
};
const axpBlock: CSSProperties = {
  margin: "0 14px 14px", padding: 14, borderRadius: 12,
  background: "rgba(34,211,238,0.08)", border: "1px solid rgba(34,211,238,0.25)",
};
const footerStyle: CSSProperties = { padding: 14, borderTop: "1px solid rgba(255,255,255,0.06)" };
const checkoutBtn: CSSProperties = {
  width: "100%", padding: "12px", background: "#22d3ee", border: "none",
  borderRadius: 10, color: "#0b1220", fontWeight: 800, fontSize: 14,
};
const emptyStyle: CSSProperties = { padding: 24, textAlign: "center", color: "var(--text-muted)", fontSize: 12 };
