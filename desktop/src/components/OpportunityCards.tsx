/**
 * OpportunityCards — 桌面端对话内「全网机会结果卡片」。
 *
 * 在主对话框气泡内渲染聚合检索结果，每卡含来源徽标/品类/报价 + 围栏内「接单/下注/购买/雇佣」
 * （→ participate → /ard/participate）；仅链接发现条目「跳转外部」（Tauri 浏览器打开）。
 * 升级既有桌面对话框(MessageBubble)，非独立面板。
 */
import { useState, useCallback, type CSSProperties } from "react";
import {
  participate,
  actionFor,
  CATEGORY_LABEL_ZH,
  type OpportunityListing,
  type ParticipateResult,
} from "../services/aggregatedMarket";

async function openExternal(url: string) {
  try {
    const { invoke } = await import("@tauri-apps/api/core");
    await invoke("desktop_bridge_open_browser", { url });
  } catch {
    window.open(url, "_blank");
  }
}

export default function OpportunityCards({ listings }: { listings: OpportunityListing[] }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [results, setResults] = useState<Record<string, ParticipateResult>>({});

  const onAct = useCallback(async (l: OpportunityListing) => {
    if (!l.canAccept) {
      if (l.externalUrl) void openExternal(l.externalUrl);
      return;
    }
    setBusy(l.identifier);
    try {
      const r = await participate(l);
      setResults((prev) => ({ ...prev, [l.identifier]: r }));
    } finally {
      setBusy(null);
    }
  }, []);

  return (
    <div style={wrap}>
      {listings.map((l) => {
        const { label } = actionFor(l.category);
        const r = results[l.identifier];
        const isBusy = busy === l.identifier;
        const priceText = l.gmv > 0 ? `${l.gmv.toLocaleString()} ${l.currency}` : "价格待定";
        return (
          <div key={l.identifier} style={card}>
            <div style={title}>{l.displayName}</div>
            <div style={badgeRow}>
              <span style={{ ...badge, background: l.internal ? "#16a34a" : "#6366f1", color: "#fff" }}>
                {l.internal ? "自营" : l.source}
              </span>
              {l.category ? <span style={badgeCat}>{CATEGORY_LABEL_ZH[l.category]}</span> : null}
              <span style={price}>{priceText}</span>
            </div>
            {l.description ? <div style={desc}>{l.description}</div> : null}
            {r ? (
              <div style={{ ...resultLine, color: r.ok ? "#16a34a" : "#d97706" }}>
                {r.ok
                  ? `已成交 · ${r.status}`
                  : r.status === "backend_gap"
                    ? "代成交后端待上线，请用跳转外部"
                    : `未完成：${r.reason || r.status}`}
              </div>
            ) : null}
            <div style={btnRow}>
              <button style={{ ...btn, ...btnPrimary, opacity: isBusy ? 0.5 : 1 }} disabled={isBusy} onClick={() => onAct(l)}>
                {isBusy ? "处理中…" : l.canAccept ? label : "跳转外部"}
              </button>
              {l.externalUrl ? (
                <button style={{ ...btn, ...btnGhost }} onClick={() => l.externalUrl && openExternal(l.externalUrl)}>
                  详情
                </button>
              ) : null}
            </div>
          </div>
        );
      })}
    </div>
  );
}

const wrap: CSSProperties = { display: "flex", flexDirection: "column", gap: 8, marginTop: 8 };
const card: CSSProperties = { background: "var(--bg-overlay-light)", border: "1px solid var(--border-subtle, rgba(255,255,255,0.1))", borderRadius: 12, padding: 12 };
const title: CSSProperties = { fontWeight: 700, fontSize: 14, color: "var(--text)" };
const badgeRow: CSSProperties = { display: "flex", alignItems: "center", flexWrap: "wrap", gap: 6, marginTop: 6 };
const badge: CSSProperties = { fontSize: 10, fontWeight: 800, borderRadius: 999, padding: "2px 8px" };
const badgeCat: CSSProperties = { fontSize: 10, fontWeight: 700, color: "var(--text-dim)", background: "var(--bg-overlay-light)", borderRadius: 999, padding: "2px 8px", border: "1px solid var(--border-subtle, rgba(255,255,255,0.1))" };
const price: CSSProperties = { marginLeft: "auto", fontSize: 12, fontWeight: 700, color: "var(--text)" };
const desc: CSSProperties = { fontSize: 12, lineHeight: 1.5, color: "var(--text-dim)", marginTop: 6 };
const resultLine: CSSProperties = { fontSize: 12, fontWeight: 700, marginTop: 8 };
const btnRow: CSSProperties = { display: "flex", gap: 8, marginTop: 10 };
const btn: CSSProperties = { flex: 1, padding: "8px 10px", borderRadius: 10, fontSize: 13, fontWeight: 700, cursor: "pointer", border: "none" };
const btnPrimary: CSSProperties = { background: "var(--accent)", color: "var(--text-on-accent, #fff)" };
const btnGhost: CSSProperties = { background: "transparent", color: "var(--text)", border: "1px solid var(--border-subtle, rgba(255,255,255,0.15))" };
