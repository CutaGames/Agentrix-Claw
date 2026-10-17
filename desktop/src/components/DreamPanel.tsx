import { useState, useCallback, useEffect, type CSSProperties } from "react";
import { apiFetch, API_BASE } from "../services/store";
import { TOKEN_STORAGE_KEY } from "../services/apiTarget";
import { classifyDreamingFailure, readDreamingBody, type DreamingProblem } from "../services/dreaming";
import { useI18n } from "../i18n/I18nProvider";
import { fill } from "../i18n/strings";

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

const PHASE_EMOJI = {
  light: "🌙",
  deep: "🌊",
  rem: "⚡",
} as const;

const STATUS_EMOJI: Record<string, string> = {
  pending: "⏳",
  running: "💤",
  completed: "✅",
  failed: "❌",
};

export default function DreamPanel({ open, onClose }: Props) {
  const { t } = useI18n();
  const [sessions, setSessions] = useState<DreamSession[]>([]);
  const [loading, setLoading] = useState(false);
  const [starting, setStarting] = useState(false);
  const [selectedPhase, setSelectedPhase] = useState<"light" | "deep" | "rem">("light");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string>("");
  // "unavailable": the server says the engine is not switched on yet. "error": anything else that failed.
  const [problem, setProblem] = useState<DreamingProblem | null>(null);

  const token = localStorage.getItem(TOKEN_STORAGE_KEY);
  const phaseLabel = (phase: "light" | "deep" | "rem") => t(`dream.phase.${phase}`);

  const fetchSessions = useCallback(async () => {
    if (!token) {
      setSessions([]);
      return;
    }
    setLoading(true);
    try {
      const res = await apiFetch(`${API_BASE}/dreaming/sessions?limit=15`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setSessions(Array.isArray(data) ? data : data?.items || []);
        setProblem(null);
      } else {
        setSessions([]);
        setProblem(classifyDreamingFailure(res.status, await readDreamingBody(res)));
      }
    } catch {
      setSessions([]);
      setProblem("error");
    }
    setLoading(false);
  }, [token]);

  useEffect(() => {
    if (open) fetchSessions();
  }, [open, fetchSessions]);

  useEffect(() => {
    if (!open) {
      return;
    }
    if (!sessions.some((session) => session.status === "running" || session.status === "pending")) {
      return;
    }

    const timer = window.setInterval(() => {
      void fetchSessions();
    }, 2000);

    return () => window.clearInterval(timer);
  }, [fetchSessions, open, sessions]);

  const startDream = async () => {
    if (!token) return;
    setStarting(true);
    setStatusMessage("");
    try {
      const response = await apiFetch(`${API_BASE}/dreaming/start`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ phase: selectedPhase, triggerType: "manual" }),
      });
      if (response.ok) {
        setStatusMessage(fill(t("dream.started"), { phase: phaseLabel(selectedPhase) }));
        await fetchSessions();
      } else if (classifyDreamingFailure(response.status, await readDreamingBody(response)) === "unavailable") {
        setProblem("unavailable");
      } else {
        setStatusMessage(t("dream.startFailed"));
      }
    } catch {
      setStatusMessage(t("dream.startFailed"));
    }
    setStarting(false);
  };

  if (!open) return null;

  const insightLabel = (type: string) => {
    const key = `dream.insight.${type}`;
    return t(key) === key ? type : t(key);
  };

  return (
    <div style={overlay} onClick={onClose}>
      <div style={panel} onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div style={header}>
          <span style={{ fontSize: 14, fontWeight: 700 }}>💤 {t("dream.title")}</span>
          <button onClick={onClose} style={closeBtn} aria-label={t("common.close")}>✕</button>
        </div>

        {problem === "unavailable" ? (
          <div style={content}>
            <div role="status" data-testid="dream-unavailable" style={{ color: "var(--text-dim)", textAlign: "center", marginTop: 20 }}>
              {t("dream.unavailable")}
            </div>
          </div>
        ) : (
          <>
            {/* Phase selector */}
            <div style={phaseBar}>
              {(["light", "deep", "rem"] as const).map((p) => (
                <button
                  key={p}
                  onClick={() => setSelectedPhase(p)}
                  style={{ ...phaseBtn, ...(selectedPhase === p ? phaseBtnActive : {}) }}
                >
                  {PHASE_EMOJI[p]} {phaseLabel(p)}
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
                {starting ? t("dream.starting") : fill(t("dream.start"), { phase: phaseLabel(selectedPhase) })}
              </button>
              {statusMessage ? (
                <div style={statusCopy}>{statusMessage}</div>
              ) : null}
            </div>

            {/* Sessions */}
            <div style={content}>
              {loading && <div style={{ color: "var(--text-dim)", textAlign: "center" }}>{t("common.loading")}</div>}
              {!loading && problem === "error" && (
                <div role="status" data-testid="dream-error" style={{ color: "var(--text-dim)", textAlign: "center", marginTop: 20 }}>
                  {t("dream.error")}
                  <button type="button" style={retryBtn} onClick={() => void fetchSessions()}>{t("common.retry")}</button>
                </div>
              )}
              {!loading && problem === null && sessions.length === 0 && (
                <div style={{ color: "var(--text-dim)", textAlign: "center", marginTop: 20 }}>
                  {t("dream.empty")}
                </div>
              )}
              {sessions.map((s) => (
                <div key={s.id} style={sessionCard} onClick={() => setExpandedId(expandedId === s.id ? null : s.id)}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ color: "var(--tone-info-text)", fontSize: 12, fontWeight: 700 }}>
                      {PHASE_EMOJI[s.phase]} {phaseLabel(s.phase)}
                    </span>
                    <span style={{ color: "var(--text-dim)", fontSize: 11 }}>
                      {STATUS_EMOJI[s.status]} {t(`dream.status.${s.status}`)}
                    </span>
                  </div>
                  <div style={{ display: "flex", gap: 12, marginTop: 4, fontSize: 11, color: "var(--text-dim)" }}>
                    <span>🧠 {fill(t("dream.memories"), { n: s.memoriesProcessed })}</span>
                    <span>💡 {fill(t("dream.insights"), { n: s.insightsGenerated })}</span>
                  </div>
                  {expandedId === s.id && s.insights?.length > 0 && (
                    <div style={{ marginTop: 8 }}>
                      {s.insights.map((ins, i) => (
                        <div key={i} style={insightCard}>
                          <div style={{ color: "var(--accent-light)", fontSize: 10, fontWeight: 600 }}>
                            {ins.type === "pattern" ? "🔍" : ins.type === "consolidation" ? "📦" : "🎨"} {insightLabel(ins.type)}
                          </div>
                          <div style={{ color: "var(--text)", fontSize: 11, marginTop: 2 }}>{ins.content}</div>
                          <div style={{ color: "var(--text-dim)", fontSize: 9, marginTop: 2 }}>
                            {fill(t("dream.confidence"), { pct: Math.round(ins.confidence * 100) })}
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
          </>
        )}
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
  width: "100%", padding: "10px", background: "var(--accent)",
  border: "none", borderRadius: 10, color: "var(--text-on-accent)", fontSize: 13,
  fontWeight: 600, cursor: "pointer",
};
const content: CSSProperties = {
  flex: 1, overflowY: "auto", padding: 16,
};
const retryBtn: CSSProperties = {
  marginLeft: 8, padding: "4px 10px", borderRadius: 6, border: "1px solid var(--border, #2a3a52)",
  background: "transparent", color: "var(--text, #f0f6ff)", fontSize: 12, cursor: "pointer",
};
const statusCopy: CSSProperties = {
  marginTop: 8,
  fontSize: 11,
  color: "var(--text-dim, #8ba3be)",
  lineHeight: 1.5,
};
const sessionCard: CSSProperties = {
  background: "var(--bg-card, #1a2235)", borderRadius: 10,
  padding: 10, marginBottom: 8, cursor: "pointer",
};
const insightCard: CSSProperties = {
  background: "rgba(167,139,250,0.06)", borderRadius: 6,
  padding: 6, marginBottom: 4,
};
