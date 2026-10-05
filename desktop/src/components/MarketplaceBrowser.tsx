/**
 * MarketplaceBrowser — Sprint DC #8 + #9
 *
 * Native Marketplace browser for desktop (replaces iframe placeholder).
 * Per desktop-prd-v4 §6: "桌面浏览 + 购买 + 上架"
 *
 * Features:
 *   - Browse skins with clan filter + sort
 *   - Purchase flow (Stripe checkout via web browser)
 *   - List your own skins for sale
 *   - AXP price display + discount
 */
import { useCallback, useEffect, useState, type CSSProperties } from "react";
import { apiFetch, API_BASE, useAuthStore } from "../services/store";

// ── Types ────────────────────────────────────────────────────

interface SkinListItem {
  id: string;
  displayName: string;
  thumbnailUrl: string | null;
  clan: "A" | "B" | "C" | "D" | "E" | "F";
  source: "platform" | "generated" | "purchased" | "remixed";
  creatorUsername: string;
  priceUsd: number | null;
  axpAccepted: boolean;
  axpDiscountPercent: number;
  featured: boolean;
  likeCount: number;
  viewCount: number;
}

interface MarketplaceResponse {
  items: SkinListItem[];
  total: number;
  nextCursor: string | null;
}

type SortMode = "featured" | "newest" | "popular";
type ClanFilter = "all" | "A" | "B" | "C" | "D" | "E" | "F";

interface Props {
  onClose: () => void;
  onEquipSkin?: (skinId: string) => void;
}

// ── API ──────────────────────────────────────────────────────

async function fetchMarketSkins(params: {
  sort?: SortMode;
  clan?: string;
  limit?: number;
  cursor?: string;
}): Promise<MarketplaceResponse> {
  const qs = new URLSearchParams();
  if (params.sort) qs.set("sort", params.sort);
  if (params.clan && params.clan !== "all") qs.set("clan", params.clan);
  qs.set("limit", String(params.limit || 20));
  if (params.cursor) qs.set("cursor", params.cursor);

  const res = await apiFetch(`${API_BASE}/v1/market/skins?${qs.toString()}`);
  if (!res.ok) throw new Error(`${res.status}`);
  return res.json();
}

async function purchaseSkin(skinId: string): Promise<{ checkout_url: string }> {
  const res = await apiFetch(`${API_BASE}/v1/marketplace/skins/${skinId}/buy`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Purchase failed: ${res.status} ${text}`);
  }
  return res.json();
}

async function listSkinForSale(skinId: string, priceUsd: number, mode: "fixed_price" | "auction"): Promise<{ listing_id: string }> {
  const res = await apiFetch(`${API_BASE}/v1/marketplace/skins/listing`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ skin_id: skinId, price_usd: priceUsd, mode }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Listing failed: ${res.status} ${text}`);
  }
  return res.json();
}

// ── Clan colors ──────────────────────────────────────────────

const CLAN_COLORS: Record<string, string> = {
  A: "#3B82F6", B: "#22C55E", C: "#A855F7",
  D: "#F97316", E: "#EC4899", F: "#14B8A6",
};

// ── Component ────────────────────────────────────────────────

export default function MarketplaceBrowser({ onClose, onEquipSkin }: Props) {
  const [items, setItems] = useState<SkinListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [sort, setSort] = useState<SortMode>("featured");
  const [clan, setClan] = useState<ClanFilter>("all");
  const [error, setError] = useState<string | null>(null);
  const [purchasing, setPurchasing] = useState<string | null>(null);

  const loadSkins = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchMarketSkins({ sort, clan: clan === "all" ? undefined : clan });
      setItems(data.items);
    } catch (err: any) {
      setError(err?.message || "Failed to load marketplace");
    } finally {
      setLoading(false);
    }
  }, [sort, clan]);

  useEffect(() => {
    void loadSkins();
  }, [loadSkins]);

  const handlePurchase = useCallback(async (skin: SkinListItem) => {
    setPurchasing(skin.id);
    try {
      const result = await purchaseSkin(skin.id);
      // Open Stripe checkout in system browser
      if (result.checkout_url) {
        const { open } = await import("@tauri-apps/plugin-shell");
        await open(result.checkout_url);
      }
    } catch (err: any) {
      setError(err?.message || "Purchase failed");
    } finally {
      setPurchasing(null);
    }
  }, []);

  return (
    <div style={container}>
      {/* Header */}
      <div style={header}>
        <h2 style={title}>🛒 Skin Marketplace</h2>
        <button style={closeBtn} onClick={onClose}>✕</button>
      </div>

      {/* Filters */}
      <div style={filterRow}>
        <div style={filterGroup}>
          {(["featured", "newest", "popular"] as SortMode[]).map((s) => (
            <button
              key={s}
              style={{ ...filterBtn, ...(sort === s ? filterBtnActive : {}) }}
              onClick={() => setSort(s)}
            >
              {s === "featured" ? "🔥 精选" : s === "newest" ? "🆕 最新" : "📈 热门"}
            </button>
          ))}
        </div>
        <div style={filterGroup}>
          {(["all", "A", "B", "C", "D", "E", "F"] as ClanFilter[]).map((c) => (
            <button
              key={c}
              style={{
                ...clanBtn,
                ...(clan === c ? { borderColor: CLAN_COLORS[c] || "#6366f1", background: (CLAN_COLORS[c] || "#6366f1") + "20" } : {}),
              }}
              onClick={() => setClan(c)}
            >
              {c === "all" ? "全部" : c}
            </button>
          ))}
        </div>
      </div>

      {/* Error */}
      {error && <div style={errorBox}>{error}</div>}

      {/* Grid */}
      <div style={grid}>
        {loading ? (
          <div style={emptyState}>加载中...</div>
        ) : items.length === 0 ? (
          <div style={emptyState}>暂无皮肤上架</div>
        ) : (
          items.map((skin) => (
            <div key={skin.id} style={card}>
              {/* Thumbnail */}
              <div style={{ ...thumbWrap, backgroundColor: (CLAN_COLORS[skin.clan] || "#333") + "20" }}>
                {skin.thumbnailUrl ? (
                  <img src={skin.thumbnailUrl} style={thumbImg} alt={skin.displayName} />
                ) : (
                  <div style={thumbPlaceholder}>🎨</div>
                )}
                {skin.featured && <div style={featuredBadge}>🔥</div>}
                <div style={{ ...clanBadge, backgroundColor: CLAN_COLORS[skin.clan] }}>{skin.clan}</div>
              </div>

              {/* Info */}
              <div style={cardBody}>
                <div style={cardName}>{skin.displayName}</div>
                <div style={cardMeta}>
                  @{skin.creatorUsername} · ❤️ {skin.likeCount}
                </div>

                {/* Price + actions */}
                <div style={cardFooter}>
                  {skin.priceUsd != null && skin.priceUsd > 0 ? (
                    <div>
                      <span style={priceText}>${skin.priceUsd.toFixed(2)}</span>
                      {skin.axpAccepted && (
                        <span style={axpBadge}>AXP -{skin.axpDiscountPercent}%</span>
                      )}
                    </div>
                  ) : (
                    <span style={{ ...priceText, color: "#22c55e" }}>免费</span>
                  )}
                  <button
                    style={buyBtn}
                    disabled={purchasing === skin.id}
                    onClick={() => handlePurchase(skin)}
                  >
                    {purchasing === skin.id ? "..." : "购买"}
                  </button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

// ── Styles ───────────────────────────────────────────────────

const container: CSSProperties = {
  display: "flex", flexDirection: "column", height: "100%",
  background: "var(--bg-dark, #0b0b13)", color: "var(--text-card)",
};
const header: CSSProperties = {
  display: "flex", justifyContent: "space-between", alignItems: "center",
  padding: "12px 16px", borderBottom: "1px solid rgba(255,255,255,0.08)",
};
const title: CSSProperties = { fontSize: 16, fontWeight: 700, margin: 0 };
const closeBtn: CSSProperties = {
  background: "none", border: "none", color: "var(--text-muted)", fontSize: 18, cursor: "pointer",
};
const filterRow: CSSProperties = {
  display: "flex", justifyContent: "space-between", padding: "8px 16px", gap: 8, flexWrap: "wrap",
};
const filterGroup: CSSProperties = { display: "flex", gap: 4 };
const filterBtn: CSSProperties = {
  padding: "4px 10px", borderRadius: 6, border: "1px solid rgba(255,255,255,0.1)",
  background: "none", color: "var(--text-muted)", fontSize: 11, fontWeight: 600, cursor: "pointer",
};
const filterBtnActive: CSSProperties = {
  borderColor: "#6366f1", background: "rgba(99,102,241,0.15)", color: "#a5b4fc",
};
const clanBtn: CSSProperties = {
  width: 28, height: 28, borderRadius: 14, border: "1px solid rgba(255,255,255,0.1)",
  background: "none", color: "var(--text-muted)", fontSize: 11, fontWeight: 700, cursor: "pointer",
  display: "flex", alignItems: "center", justifyContent: "center",
};
const errorBox: CSSProperties = {
  margin: "8px 16px", padding: 10, borderRadius: 8,
  background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)",
  color: "#fca5a5", fontSize: 12,
};
const grid: CSSProperties = {
  display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))",
  gap: 12, padding: 16, overflowY: "auto", flex: 1,
};
const emptyState: CSSProperties = {
  gridColumn: "1 / -1", textAlign: "center", color: "var(--text-muted)", padding: 40,
};
const card: CSSProperties = {
  borderRadius: 12, overflow: "hidden",
  border: "1px solid rgba(255,255,255,0.08)", background: "var(--bg-card)",
};
const thumbWrap: CSSProperties = {
  width: "100%", height: 120, position: "relative",
  display: "flex", alignItems: "center", justifyContent: "center",
};
const thumbImg: CSSProperties = { width: "100%", height: "100%", objectFit: "cover" };
const thumbPlaceholder: CSSProperties = { fontSize: 36, opacity: 0.6 };
const featuredBadge: CSSProperties = {
  position: "absolute", top: 6, left: 6, fontSize: 12,
  background: "rgba(239,68,68,0.9)", borderRadius: 4, padding: "2px 5px",
};
const clanBadge: CSSProperties = {
  position: "absolute", top: 6, right: 6, width: 20, height: 20, borderRadius: 10,
  display: "flex", alignItems: "center", justifyContent: "center",
  fontSize: 9, fontWeight: 900, color: "#fff",
};
const cardBody: CSSProperties = { padding: 10 };
const cardName: CSSProperties = { fontSize: 12, fontWeight: 700, color: "var(--text-card)", marginBottom: 2 };
const cardMeta: CSSProperties = { fontSize: 10, color: "var(--text-muted)", marginBottom: 8 };
const cardFooter: CSSProperties = { display: "flex", justifyContent: "space-between", alignItems: "center" };
const priceText: CSSProperties = { fontSize: 13, fontWeight: 700, color: "#22d3ee" };
const axpBadge: CSSProperties = {
  fontSize: 9, fontWeight: 700, color: "#fbbf24", marginLeft: 4,
  padding: "1px 4px", borderRadius: 3, background: "var(--tone-warning-bg)",
};
const buyBtn: CSSProperties = {
  padding: "4px 12px", borderRadius: 6, border: "none",
  background: "#6366f1", color: "#fff", fontSize: 11, fontWeight: 700, cursor: "pointer",
};
