/**
 * RemixTimeline — Sprint DC #10
 *
 * Per desktop-prd-v4 §2: "Remix 分成时间线"
 * Shows chronological remix earnings from skins that were remixed by others.
 *
 * Backend: GET /api/v1/marketplace/my-remix-earnings
 */
import { useEffect, useState, type CSSProperties } from "react";
import { apiFetch, API_BASE } from "../services/store";

interface RemixEarning {
  id: string;
  original_skin_name: string;
  remixer_name: string;
  remix_skin_name: string;
  earning_cents: number;
  remix_rate_pct: number;
  chain_depth: number; // 1 = direct remix, 2 = remix of remix, etc.
  created_at: string;
}

export default function RemixTimeline() {
  const [earnings, setEarnings] = useState<RemixEarning[]>([]);
  const [loading, setLoading] = useState(true);
  const [totalCents, setTotalCents] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const res = await apiFetch(`${API_BASE}/v1/marketplace/my-remix-earnings?limit=20`);
        if (!res.ok) throw new Error(`${res.status}`);
        const data = await res.json();
        if (!cancelled) {
          setEarnings(data.items || []);
          setTotalCents(data.total_cents || 0);
        }
      } catch {
        // API not yet available
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => { cancelled = true; };
  }, []);

  if (loading) {
    return (
      <div style={container}>
        <div style={headerStyle}>🔄 Remix 分成时间线</div>
        <div style={{ color: "var(--text-muted)", fontSize: 12 }}>加载中...</div>
      </div>
    );
  }

  if (earnings.length === 0) {
    return (
      <div style={container}>
        <div style={headerStyle}>🔄 Remix 分成时间线</div>
        <div style={{ color: "var(--text-muted)", fontSize: 12, lineHeight: "18px" }}>
          还没有 Remix 分成收入。当其他用户基于你的皮肤二创并售出时，你将获得 10-50% 的链式分成。
        </div>
      </div>
    );
  }

  return (
    <div style={container}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <div style={headerStyle}>🔄 Remix 分成时间线</div>
        <div style={totalBadge}>
          累计 ${(totalCents / 100).toFixed(2)}
        </div>
      </div>

      <div style={timeline}>
        {earnings.map((e) => (
          <div key={e.id} style={timelineItem}>
            <div style={dot} />
            <div style={itemContent}>
              <div style={itemHeader}>
                <span style={itemAmount}>+${(e.earning_cents / 100).toFixed(2)}</span>
                <span style={itemRate}>{e.remix_rate_pct}% · L{e.chain_depth}</span>
              </div>
              <div style={itemDesc}>
                @{e.remixer_name} 基于你的「{e.original_skin_name}」创作了「{e.remix_skin_name}」
              </div>
              <div style={itemTime}>
                {new Date(e.created_at).toLocaleDateString()}
              </div>
            </div>
          </div>
        ))}
      </div>

      <div style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 8, opacity: 0.7 }}>
        链式上限 3 层祖先（A→B→C→D），D 之后归入版权金池。
      </div>
    </div>
  );
}

// ── Styles ───────────────────────────────────────────────────

const container: CSSProperties = {
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

const totalBadge: CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  color: "#a78bfa",
  padding: "3px 8px",
  borderRadius: 6,
  background: "rgba(167,139,250,0.12)",
  border: "1px solid rgba(167,139,250,0.3)",
};

const timeline: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 0,
  borderLeft: "2px solid rgba(167,139,250,0.2)",
  marginLeft: 8,
  paddingLeft: 16,
};

const timelineItem: CSSProperties = {
  position: "relative",
  paddingBottom: 12,
};

const dot: CSSProperties = {
  position: "absolute",
  left: -21,
  top: 4,
  width: 8,
  height: 8,
  borderRadius: 4,
  background: "#a78bfa",
};

const itemContent: CSSProperties = {};

const itemHeader: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  marginBottom: 2,
};

const itemAmount: CSSProperties = {
  fontSize: 13,
  fontWeight: 700,
  color: "#22c55e",
};

const itemRate: CSSProperties = {
  fontSize: 10,
  color: "var(--text-muted)",
};

const itemDesc: CSSProperties = {
  fontSize: 11,
  color: "var(--text-card)",
  lineHeight: "16px",
};

const itemTime: CSSProperties = {
  fontSize: 10,
  color: "var(--text-muted)",
  marginTop: 2,
};
