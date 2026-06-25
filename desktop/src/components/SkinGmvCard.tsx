/**
 * SkinGmvCard — Sprint DA #3
 *
 * Skin GMV revenue card for AgentEconomyPanel.
 * Per desktop-prd-v4 §2: "+ Skin GMV 收入卡片 + Remix 分成时间线"
 *
 * Shows:
 *   - Total skin sales revenue (lifetime + this month)
 *   - Number of skins sold
 *   - Top-selling skin
 *   - Remix earnings
 */
import { useEffect, useState, type CSSProperties } from "react";
import { apiFetch, API_BASE } from "../services/store";

interface SkinGmvData {
  lifetime_revenue_cents: number;
  this_month_revenue_cents: number;
  total_skins_sold: number;
  total_remix_earnings_cents: number;
  top_skin: { name: string; revenue_cents: number } | null;
  recent_sales: Array<{
    id: string;
    skin_name: string;
    amount_cents: number;
    buyer_name: string;
    sold_at: string;
  }>;
}

export default function SkinGmvCard() {
  const [data, setData] = useState<SkinGmvData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const res = await apiFetch(`${API_BASE}/v1/marketplace/my-sales/summary`);
        if (!res.ok) throw new Error(`${res.status}`);
        const json = await res.json();
        if (!cancelled) setData(json);
      } catch {
        // API not yet available — show empty state
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();

    // Listen for real-time sale events
    const onSale = (e: Event) => {
      void load(); // Refresh on new sale
    };
    window.addEventListener("agentrix:skin-sold", onSale);
    return () => {
      cancelled = true;
      window.removeEventListener("agentrix:skin-sold", onSale);
    };
  }, []);

  if (loading) {
    return (
      <div style={card}>
        <div style={headerStyle}>🎨 皮肤收入</div>
        <div style={{ color: "var(--text-muted)", fontSize: 12 }}>加载中...</div>
      </div>
    );
  }

  if (!data || (data.lifetime_revenue_cents === 0 && data.total_skins_sold === 0)) {
    return (
      <div style={card}>
        <div style={headerStyle}>🎨 皮肤收入</div>
        <div style={{ color: "var(--text-muted)", fontSize: 12, lineHeight: "18px" }}>
          还没有皮肤销售记录。去 PetCreator 创建皮肤，然后在 Marketplace 上架吧！
        </div>
      </div>
    );
  }

  return (
    <div style={card}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <div style={headerStyle}>🎨 皮肤收入</div>
        <div style={monthBadge}>
          本月 ${(data.this_month_revenue_cents / 100).toFixed(2)}
        </div>
      </div>

      {/* Revenue stats */}
      <div style={statsGrid}>
        <div style={statCell}>
          <div style={statValue}>${(data.lifetime_revenue_cents / 100).toFixed(2)}</div>
          <div style={statLabel}>累计收入</div>
        </div>
        <div style={statCell}>
          <div style={statValue}>{data.total_skins_sold}</div>
          <div style={statLabel}>已售皮肤</div>
        </div>
        <div style={statCell}>
          <div style={statValue}>${(data.total_remix_earnings_cents / 100).toFixed(2)}</div>
          <div style={statLabel}>Remix 分成</div>
        </div>
      </div>

      {/* Top skin */}
      {data.top_skin && (
        <div style={topSkinRow}>
          <span style={{ fontSize: 11, color: "var(--text-muted)" }}>🏆 最畅销：</span>
          <span style={{ fontSize: 11, color: "var(--text-card)", fontWeight: 600 }}>
            {data.top_skin.name} · ${(data.top_skin.revenue_cents / 100).toFixed(2)}
          </span>
        </div>
      )}

      {/* Recent sales */}
      {data.recent_sales.length > 0 && (
        <div style={{ marginTop: 10 }}>
          <div style={{ fontSize: 10, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6 }}>
            最近成交
          </div>
          {data.recent_sales.slice(0, 3).map((sale) => (
            <div key={sale.id} style={saleRow}>
              <span style={{ fontSize: 11, color: "var(--text-card)" }}>
                {sale.skin_name}
              </span>
              <span style={{ fontSize: 11, color: "#22c55e", fontWeight: 600 }}>
                +${(sale.amount_cents / 100).toFixed(2)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Styles ───────────────────────────────────────────────────

const card: CSSProperties = {
  padding: 14,
  background: "var(--bg-card)",
  border: "1px solid rgba(255,255,255,0.08)",
  borderRadius: 12,
};

const headerStyle: CSSProperties = {
  fontSize: 13,
  fontWeight: 700,
  color: "var(--text-card)",
};

const monthBadge: CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  color: "#22c55e",
  padding: "3px 8px",
  borderRadius: 6,
  background: "var(--tone-success-bg)",
  border: "1px solid rgba(34,197,94,0.3)",
};

const statsGrid: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr 1fr 1fr",
  gap: 8,
  marginBottom: 10,
};

const statCell: CSSProperties = {
  padding: 8,
  background: "var(--bg-card)",
  borderRadius: 8,
  textAlign: "center",
};

const statValue: CSSProperties = {
  fontSize: 15,
  fontWeight: 700,
  color: "var(--text-card)",
};

const statLabel: CSSProperties = {
  fontSize: 10,
  color: "var(--text-muted)",
  marginTop: 2,
};

const topSkinRow: CSSProperties = {
  display: "flex",
  gap: 6,
  alignItems: "center",
  padding: "6px 8px",
  background: "rgba(251,191,36,0.06)",
  borderRadius: 6,
  border: "1px solid rgba(251,191,36,0.15)",
};

const saleRow: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  padding: "4px 0",
  borderBottom: "1px solid rgba(255,255,255,0.04)",
};
