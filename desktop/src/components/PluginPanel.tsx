import { useState, useCallback, useEffect, type CSSProperties } from "react";
import { API_BASE } from "../services/store";

interface OwnedCapability {
  type: "tool" | "hook" | "channel" | "service" | "memory" | "protocol" | "doctor" | "runtime";
  name: string;
  pluginId: string;
  pluginName: string;
  config: Record<string, any>;
}

interface RuntimeSnapshot {
  tools: OwnedCapability[];
  hooks: OwnedCapability[];
  channels: OwnedCapability[];
  services: OwnedCapability[];
  memory: OwnedCapability[];
  protocols: OwnedCapability[];
  doctors: OwnedCapability[];
  runtime: OwnedCapability[];
  summary: {
    pluginCount: number;
    capabilityCount: number;
    lastBuiltAt: string;
    counts: Record<string, number>;
    owners: Array<{
      pluginId: string;
      pluginName: string;
      capabilityCount: number;
      categories: string[];
    }>;
  };
}

interface Props {
  open: boolean;
  onClose: () => void;
}

const TAB_META = [
  { key: "tools" as const, emoji: "🔧", label: "Tools" },
  { key: "hooks" as const, emoji: "🪝", label: "Hooks" },
  { key: "channels" as const, emoji: "📡", label: "Channels" },
  { key: "services" as const, emoji: "⚙️", label: "Services" },
  { key: "memory" as const, emoji: "🧠", label: "Memory" },
  { key: "protocols" as const, emoji: "🔌", label: "Protocols" },
  { key: "doctors" as const, emoji: "🩺", label: "Doctor" },
  { key: "runtime" as const, emoji: "🧬", label: "Runtime" },
];

export default function PluginPanel({ open, onClose }: Props) {
  const [snapshot, setSnapshot] = useState<RuntimeSnapshot | null>(null);
  const [activeTab, setActiveTab] = useState<keyof Omit<RuntimeSnapshot, "summary">>("tools");
  const [loading, setLoading] = useState(false);
  const [rebuilding, setRebuilding] = useState(false);

  const token = localStorage.getItem("agentrix_token");

  const fetchSnapshot = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/plugin-owned/snapshot`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) setSnapshot(await res.json());
    } catch {}
    setLoading(false);
  }, [token]);

  useEffect(() => {
    if (open) fetchSnapshot();
  }, [open, fetchSnapshot]);

  const rebuild = async () => {
    if (!token) return;
    setRebuilding(true);
    try {
      await fetch(`${API_BASE}/plugin-owned/rebuild`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      await fetchSnapshot();
    } catch {}
    setRebuilding(false);
  };

  if (!open) return null;

  const list = snapshot?.[activeTab] ?? [];
  const total = snapshot?.summary?.capabilityCount ?? 0;
  const pluginCount = snapshot?.summary?.pluginCount ?? 0;
  const ownerLeaders = snapshot?.summary?.owners?.slice(0, 4) ?? [];

  return (
    <div style={overlay} onClick={onClose}>
      <div style={panel} onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div style={header}>
          <span style={{ fontSize: 14, fontWeight: 700 }}>🧩 Plugin Hub — {total} owned capabilities</span>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <button
              onClick={rebuild}
              disabled={rebuilding}
              style={{ ...rebuildBtn, opacity: rebuilding ? 0.5 : 1 }}
            >
              🔄 {rebuilding ? "..." : "Rebuild"}
            </button>
            <button onClick={onClose} style={closeBtn}>✕</button>
          </div>
        </div>

        <div style={summaryGrid}>
          <div style={summaryCard}>
            <div style={summaryLabel}>Plugins</div>
            <div style={summaryValue}>{pluginCount}</div>
          </div>
          <div style={summaryCard}>
            <div style={summaryLabel}>Capabilities</div>
            <div style={summaryValue}>{total}</div>
          </div>
          <div style={summaryCardWide}>
            <div style={summaryLabel}>Top Owners</div>
            {ownerLeaders.length === 0 ? (
              <div style={summarySubtle}>No plugin-owned runtime snapshot yet.</div>
            ) : (
              <div style={ownerList}>
                {ownerLeaders.map((owner) => (
                  <div key={owner.pluginId} style={ownerChip}>
                    <span>{owner.pluginName}</span>
                    <span style={ownerChipCount}>{owner.capabilityCount}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Tab bar */}
        <div style={tabBar}>
          {TAB_META.map((tab) => {
            const count = snapshot?.summary?.counts?.[tab.key] ?? snapshot?.[tab.key]?.length ?? 0;
            return (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                style={{ ...tabBtn, ...(activeTab === tab.key ? tabBtnActive : {}) }}
              >
                {tab.emoji} {tab.label} ({count})
              </button>
            );
          })}
        </div>

        {/* Content */}
        <div style={content}>
          {loading && <div style={{ color: "var(--text-dim)", textAlign: "center" }}>Loading...</div>}
          {!loading && list.length === 0 && (
            <div style={{ color: "var(--text-dim)", textAlign: "center", marginTop: 20 }}>
              No {activeTab} found. Install plugins to add capabilities.
            </div>
          )}
          {list.map((cap, i) => (
            <div key={`${cap.pluginId}-${cap.name}-${i}`} style={capCard}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ color: "var(--text, #f0f6ff)", fontSize: 13, fontWeight: 600 }}>
                  {cap.name}
                </span>
                <span style={{ color: "var(--text-dim, #4d6278)", fontSize: 10 }}>
                  📦 {cap.pluginName}
                </span>
              </div>
              {cap.config?.description && (
                <div style={{ color: "var(--text-dim, #8ba3be)", fontSize: 11, marginTop: 3 }}>
                  {cap.config.description}
                </div>
              )}
              <div style={metaRow}>
                {Object.entries(cap.config || {})
                  .filter(([key, value]) => key !== "description" && value !== undefined && value !== null && typeof value !== "object")
                  .slice(0, 3)
                  .map(([key, value]) => (
                    <span key={key} style={metaChip}>{key}: {String(value)}</span>
                  ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

const overlay: CSSProperties = {
  position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 9000,
  display: "flex", alignItems: "center", justifyContent: "center",
};
const panel: CSSProperties = {
  width: 420, maxHeight: "80vh", background: "var(--bg-panel, #1a1a2e)",
  border: "1px solid var(--border, #2a3a52)", borderRadius: 16,
  display: "flex", flexDirection: "column", overflow: "hidden",
};
const header: CSSProperties = {
  display: "flex", alignItems: "center", justifyContent: "space-between",
  padding: "12px 16px", borderBottom: "1px solid var(--border, #2a3a52)",
};
const summaryGrid: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
  gap: 10,
  padding: "12px 16px",
  borderBottom: "1px solid var(--border, #2a3a52)",
};
const summaryCard: CSSProperties = {
  borderRadius: 12,
  border: "1px solid rgba(255,255,255,0.08)",
  background: "rgba(255,255,255,0.03)",
  padding: "10px 12px",
};
const summaryCardWide: CSSProperties = {
  ...summaryCard,
  minWidth: 0,
};
const summaryLabel: CSSProperties = {
  fontSize: 10,
  textTransform: "uppercase",
  letterSpacing: 0.7,
  color: "var(--text-dim, #8ba3be)",
};
const summaryValue: CSSProperties = {
  marginTop: 4,
  fontSize: 20,
  fontWeight: 700,
  color: "var(--text, #f0f6ff)",
};
const summarySubtle: CSSProperties = {
  marginTop: 6,
  fontSize: 11,
  color: "var(--text-dim, #8ba3be)",
};
const ownerList: CSSProperties = {
  marginTop: 8,
  display: "flex",
  flexWrap: "wrap",
  gap: 6,
};
const ownerChip: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  padding: "4px 8px",
  borderRadius: 999,
  background: "rgba(0,212,255,0.08)",
  border: "1px solid rgba(0,212,255,0.18)",
  color: "var(--text, #f0f6ff)",
  fontSize: 10,
};
const ownerChipCount: CSSProperties = {
  color: "#00d4ff",
  fontWeight: 700,
};
const closeBtn: CSSProperties = {
  background: "none", border: "none", color: "var(--text-dim, #8ba3be)",
  fontSize: 16, cursor: "pointer",
};
const rebuildBtn: CSSProperties = {
  background: "rgba(0,212,255,0.1)", border: "1px solid rgba(0,212,255,0.2)",
  borderRadius: 6, padding: "4px 8px", fontSize: 10, color: "#00d4ff",
  cursor: "pointer",
};
const tabBar: CSSProperties = {
  display: "flex", gap: 4, padding: "8px 12px",
  borderBottom: "1px solid var(--border, #2a3a52)", overflowX: "auto",
};
const tabBtn: CSSProperties = {
  flex: 1, background: "none", border: "1px solid transparent", borderRadius: 8,
  padding: "5px 6px", fontSize: 10, color: "var(--text-dim, #8ba3be)",
  cursor: "pointer", transition: "all 0.2s", whiteSpace: "nowrap", textAlign: "center",
};
const tabBtnActive: CSSProperties = {
  background: "rgba(108,92,231,0.15)", borderColor: "rgba(108,92,231,0.3)",
  color: "#a78bfa", fontWeight: 600,
};
const content: CSSProperties = {
  flex: 1, overflowY: "auto", padding: 16,
};
const capCard: CSSProperties = {
  background: "var(--bg-card, #1a2235)", borderRadius: 8,
  padding: 10, marginBottom: 6,
};
const metaRow: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 6,
  marginTop: 8,
};
const metaChip: CSSProperties = {
  fontSize: 10,
  color: "#8fd3ff",
  border: "1px solid rgba(143,211,255,0.2)",
  borderRadius: 999,
  padding: "3px 7px",
  background: "rgba(143,211,255,0.06)",
};
