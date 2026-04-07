import { useState, useCallback, useEffect, type CSSProperties } from "react";

interface DreamInsight {
  type: string;
  content: string;
  confidence: number;
  createdAt: string;
}

interface DreamSession {
  id: string;
  phase: "light" | "deep" | "rem";
  status: "pending" | "running" | "completed" | "failed";
  memoriesProcessed: number;
  insightsGenerated: number;
  insights: DreamInsight[];
  createdAt: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
}

const PHASE_META = {
  light: { emoji: "🌙", label: "Light" },
  deep: { emoji: "🌊", label: "Deep" },
  rem: { emoji: "⚡", label: "REM" },
};

const STATUS_EMOJI: Record<string, string> = {
  pending: "⏳",
  running: "💤",
  completed: "✅",
  failed: "❌",
};

export default function DreamPanel({ open, onClose }: Props) {
  const [sessions, setSessions] = useState<DreamSession[]>([]);
  const [loading, setLoading] = useState(false);
  const [starting, setStarting] = useState(false);
  const [selectedPhase, setSelectedPhase] = useState<"light" | "deep" | "rem">("light");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const token = localStorage.getItem("agentrix_token");

  const fetchSessions = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const res = await fetch("/dreaming/sessions?limit=15", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) setSessions(await res.json());
    } catch {}
    setLoading(false);
  }, [token]);

  useEffect(() => {
    if (open) fetchSessions();
  }, [open, fetchSessions]);

  const startDream = async () => {
    if (!token) return;
    setStarting(true);
    try {
      await fetch("/dreaming/start", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ phase: selectedPhase, triggerType: "manual" }),
      });
      await fetchSessions();
    } catch {}
    setStarting(false);
  };

  if (!open) return null;

  return (
    <div style={overlay} onClick={onClose}>
      <div style={panel} onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div style={header}>
          <span style={{ fontSize: 14, fontWeight: 700 }}>💤 Dreaming Engine</span>
          <button onClick={onClose} style={closeBtn}>✕</button>
        </div>

        {/* Phase selector */}
        <div style={phaseBar}>
          {(["light", "deep", "rem"] as const).map((p) => (
            <button
              key={p}
              onClick={() => setSelectedPhase(p)}
              style={{ ...phaseBtn, ...(selectedPhase === p ? phaseBtnActive : {}) }}
            >
              {PHASE_META[p].emoji} {PHASE_META[p].label}
            </button>
          ))}
        </div>

        {/* Start button */}
        <div style={{ padding: "0 16px 8px" }}>
          <button
            onClick={startDream}
            disabled={starting}
            style={{
              ...startBtn,
              opacity: starting ? 0.5 : 1,
            }}
          >
            {starting ? "Starting..." : `Start ${PHASE_META[selectedPhase].label} Dream`}
          </button>
        </div>

        {/* Sessions */}
        <div style={content}>
          {loading && <div style={{ color: "var(--text-dim)", textAlign: "center" }}>Loading...</div>}
          {!loading && sessions.length === 0 && (
            <div style={{ color: "var(--text-dim)", textAlign: "center", marginTop: 20 }}>
              No dream sessions yet. Start your first dream!
            </div>
          )}
          {sessions.map((s) => (
            <div key={s.id} style={sessionCard} onClick={() => setExpandedId(expandedId === s.id ? null : s.id)}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ color: "#00d4ff", fontSize: 12, fontWeight: 700 }}>
                  {PHASE_META[s.phase]?.emoji} {s.phase.toUpperCase()}
                </span>
                <span style={{ color: "var(--text-dim)", fontSize: 11 }}>
                  {STATUS_EMOJI[s.status]} {s.status}
                </span>
              </div>
              <div style={{ display: "flex", gap: 12, marginTop: 4, fontSize: 11, color: "var(--text-dim)" }}>
                <span>🧠 {s.memoriesProcessed} memories</span>
                <span>💡 {s.insightsGenerated} insights</span>
              </div>
              {expandedId === s.id && s.insights?.length > 0 && (
                <div style={{ marginTop: 8 }}>
                  {s.insights.map((ins, i) => (
                    <div key={i} style={insightCard}>
                      <div style={{ color: "#a78bfa", fontSize: 10, fontWeight: 600 }}>
                        {ins.type === "pattern" ? "🔍" : ins.type === "consolidation" ? "📦" : "🎨"} {ins.type}
                      </div>
                      <div style={{ color: "var(--text)", fontSize: 11, marginTop: 2 }}>{ins.content}</div>
                      <div style={{ color: "var(--text-dim)", fontSize: 9, marginTop: 2 }}>
                        Confidence: {Math.round(ins.confidence * 100)}%
                      </div>
                    </div>
                  ))}
                </div>
              )}
              <div style={{ color: "var(--text-dim)", fontSize: 9, marginTop: 4 }}>
                {new Date(s.createdAt).toLocaleString()}
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
  width: 400, maxHeight: "80vh", background: "var(--bg-panel, #1a1a2e)",
  border: "1px solid var(--border, #2a3a52)", borderRadius: 16,
  display: "flex", flexDirection: "column", overflow: "hidden",
};
const header: CSSProperties = {
  display: "flex", alignItems: "center", justifyContent: "space-between",
  padding: "12px 16px", borderBottom: "1px solid var(--border, #2a3a52)",
};
const closeBtn: CSSProperties = {
  background: "none", border: "none", color: "var(--text-dim, #8ba3be)",
  fontSize: 16, cursor: "pointer",
};
const phaseBar: CSSProperties = {
  display: "flex", gap: 6, padding: "10px 16px",
};
const phaseBtn: CSSProperties = {
  flex: 1, background: "var(--bg-card, #1a2235)", border: "1px solid transparent",
  borderRadius: 8, padding: "8px 4px", fontSize: 11, color: "var(--text, #f0f6ff)",
  cursor: "pointer", textAlign: "center", transition: "all 0.2s",
};
const phaseBtnActive: CSSProperties = {
  background: "rgba(0,212,255,0.1)", borderColor: "#00d4ff",
};
const startBtn: CSSProperties = {
  width: "100%", padding: "10px", background: "#1a77e0",
  border: "none", borderRadius: 10, color: "#fff", fontSize: 13,
  fontWeight: 600, cursor: "pointer",
};
const content: CSSProperties = {
  flex: 1, overflowY: "auto", padding: 16,
};
const sessionCard: CSSProperties = {
  background: "var(--bg-card, #1a2235)", borderRadius: 10,
  padding: 10, marginBottom: 8, cursor: "pointer",
};
const insightCard: CSSProperties = {
  background: "rgba(167,139,250,0.06)", borderRadius: 6,
  padding: 6, marginBottom: 4,
};
