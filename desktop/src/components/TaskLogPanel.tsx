import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { apiFetch, API_BASE } from "../services/store";

/**
 * TaskLogPanel — desktop "Work Log" surface for AgentTask (long-running tasks).
 *
 * Lists user's tasks (queued/running/succeeded/failed/canceled), polls
 * `GET /agent-tasks` while open, and lets the user expand any task to
 * stream its event log. Pairs with the AgentTaskWorker autonomy loop.
 */

interface TaskRow {
  id: string;
  title: string;
  status: "queued" | "running" | "awaiting_input" | "succeeded" | "failed" | "canceled";
  progress: number;
  tier: string | null;
  costUsd: number;
  resultSummary: string | null;
  errorMessage: string | null;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
}

interface LogRow {
  id: string;
  kind: string;
  message: string;
  payload: Record<string, unknown> | null;
  createdAt: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  token: string | null;
}

const STATUS_META: Record<TaskRow["status"], { color: string; emoji: string; label: string }> = {
  queued: { color: "#94a3b8", emoji: "⏳", label: "Queued" },
  running: { color: "#38bdf8", emoji: "⚙️", label: "Running" },
  awaiting_input: { color: "#fbbf24", emoji: "❓", label: "Needs input" },
  succeeded: { color: "#34d399", emoji: "✅", label: "Done" },
  failed: { color: "#f87171", emoji: "✖", label: "Failed" },
  canceled: { color: "#64748b", emoji: "⊘", label: "Canceled" },
};

export default function TaskLogPanel({ open, onClose, token }: Props) {
  const [tasks, setTasks] = useState<TaskRow[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [logs, setLogs] = useState<LogRow[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [draftTitle, setDraftTitle] = useState("");
  const [draftPrompt, setDraftPrompt] = useState("");
  const pollRef = useRef<number | null>(null);

  const fetchTasks = useCallback(async () => {
    if (!token) return;
    try {
      const res = await apiFetch(`${API_BASE}/agent-tasks?limit=50`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setTasks(Array.isArray(data) ? data : []);
      }
    } catch {
      // Silently swallow — panel keeps stale data on transient errors.
    }
  }, [token]);

  const fetchLogs = useCallback(
    async (id: string) => {
      if (!token) return;
      try {
        const res = await apiFetch(`${API_BASE}/agent-tasks/${id}/log?limit=300`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const data = await res.json();
          setLogs(Array.isArray(data) ? data : []);
        }
      } catch {
        // ignore
      }
    },
    [token],
  );

  useEffect(() => {
    if (!open) return;
    fetchTasks();
    pollRef.current = window.setInterval(() => {
      fetchTasks();
      if (expandedId) fetchLogs(expandedId);
    }, 4000);
    return () => {
      if (pollRef.current) {
        window.clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, [open, expandedId, fetchTasks, fetchLogs]);

  useEffect(() => {
    if (expandedId) fetchLogs(expandedId);
    else setLogs([]);
  }, [expandedId, fetchLogs]);

  const handleSubmit = useCallback(async () => {
    if (!token || !draftTitle.trim() || !draftPrompt.trim() || submitting) return;
    setSubmitting(true);
    try {
      const res = await apiFetch(`${API_BASE}/agent-tasks`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ title: draftTitle.trim(), prompt: draftPrompt.trim() }),
      });
      if (res.ok) {
        setDraftTitle("");
        setDraftPrompt("");
        fetchTasks();
      }
    } catch {
      // ignore — UI keeps user input so they can retry.
    } finally {
      setSubmitting(false);
    }
  }, [token, draftTitle, draftPrompt, submitting, fetchTasks]);

  const handleCancel = useCallback(
    async (id: string) => {
      if (!token) return;
      try {
        await apiFetch(`${API_BASE}/agent-tasks/${id}/cancel`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
        });
        fetchTasks();
      } catch {
        // ignore
      }
    },
    [token, fetchTasks],
  );

  const expanded = useMemo(
    () => tasks.find((t) => t.id === expandedId) ?? null,
    [tasks, expandedId],
  );

  if (!open) return null;

  return (
    <div style={overlayStyle} onClick={onClose}>
      <div style={panelStyle} onClick={(e) => e.stopPropagation()}>
        <header style={headerStyle}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 600 }}>📋 Work Log</div>
            <div style={{ fontSize: 12, opacity: 0.65 }}>
              Long-running tasks · drained by the AgentTask worker
            </div>
          </div>
          <button onClick={onClose} style={closeBtnStyle} aria-label="Close">
            ✕
          </button>
        </header>

        {/* Compose */}
        <section style={sectionStyle}>
          <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 6, opacity: 0.8 }}>
            New task
          </div>
          <input
            value={draftTitle}
            onChange={(e) => setDraftTitle(e.target.value)}
            placeholder="Short title (e.g. 'weekly competitor pricing scan')"
            style={inputStyle}
          />
          <textarea
            value={draftPrompt}
            onChange={(e) => setDraftPrompt(e.target.value)}
            placeholder="Detailed instructions for the agent…"
            rows={3}
            style={{ ...inputStyle, marginTop: 6, resize: "vertical", fontFamily: "inherit" }}
          />
          <button
            onClick={handleSubmit}
            disabled={!draftTitle.trim() || !draftPrompt.trim() || submitting || !token}
            style={primaryBtnStyle}
          >
            {submitting ? "Submitting…" : "Submit task"}
          </button>
        </section>

        {/* List */}
        <section style={{ ...sectionStyle, flex: 1, overflow: "auto" }}>
          {tasks.length === 0 ? (
            <div style={{ opacity: 0.6, fontSize: 13, padding: "16px 4px" }}>
              No tasks yet. Submit one above and the autonomy worker will pick it up.
            </div>
          ) : (
            tasks.map((t) => {
              const meta = STATUS_META[t.status];
              const isExpanded = expandedId === t.id;
              return (
                <div key={t.id} style={taskCardStyle}>
                  <div
                    style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }}
                    onClick={() => setExpandedId(isExpanded ? null : t.id)}
                  >
                    <span style={{ fontSize: 16 }}>{meta.emoji}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div
                        style={{
                          fontSize: 13,
                          fontWeight: 500,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {t.title}
                      </div>
                      <div style={{ fontSize: 11, opacity: 0.6, marginTop: 2 }}>
                        <span style={{ color: meta.color }}>{meta.label}</span>
                        {t.tier ? <> · {t.tier}</> : null}
                        <> · ${t.costUsd.toFixed(4)}</>
                        <> · {new Date(t.createdAt).toLocaleString()}</>
                      </div>
                    </div>
                    {(t.status === "queued" || t.status === "running") && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleCancel(t.id);
                        }}
                        style={cancelBtnStyle}
                      >
                        Cancel
                      </button>
                    )}
                    <span style={{ opacity: 0.5, fontSize: 11 }}>{isExpanded ? "▾" : "▸"}</span>
                  </div>

                  {isExpanded && (
                    <div style={expandedBodyStyle}>
                      {t.resultSummary && (
                        <div style={summaryBoxStyle}>
                          <div style={{ fontWeight: 600, fontSize: 11, marginBottom: 4 }}>
                            Result
                          </div>
                          <div style={{ whiteSpace: "pre-wrap", fontSize: 12 }}>
                            {t.resultSummary}
                          </div>
                        </div>
                      )}
                      {t.errorMessage && (
                        <div style={{ ...summaryBoxStyle, borderColor: "#7f1d1d" }}>
                          <div
                            style={{ fontWeight: 600, fontSize: 11, marginBottom: 4, color: "#fca5a5" }}
                          >
                            Error
                          </div>
                          <div style={{ whiteSpace: "pre-wrap", fontSize: 12 }}>
                            {t.errorMessage}
                          </div>
                        </div>
                      )}
                      <div style={{ fontWeight: 600, fontSize: 11, margin: "8px 0 4px" }}>
                        Event log
                      </div>
                      {logs.length === 0 ? (
                        <div style={{ opacity: 0.5, fontSize: 12 }}>No events yet.</div>
                      ) : (
                        logs.map((l) => (
                          <div key={l.id} style={logRowStyle}>
                            <div style={{ fontSize: 10, opacity: 0.55 }}>
                              {new Date(l.createdAt).toLocaleTimeString()} · {l.kind}
                            </div>
                            <div style={{ fontSize: 12, whiteSpace: "pre-wrap" }}>{l.message}</div>
                          </div>
                        ))
                      )}
                      {expanded && expanded.status === "succeeded" && (
                        <div style={{ marginTop: 8 }}>
                          <a
                            href={`https://agentrix.top/spark/${expanded.id}`}
                            target="_blank"
                            rel="noreferrer"
                            style={{ color: "#a78bfa", fontSize: 12 }}
                          >
                            Open public Sparkpage ↗
                          </a>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </section>
      </div>
    </div>
  );
}

const overlayStyle: CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(0,0,0,0.5)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  zIndex: 1000,
};

const panelStyle: CSSProperties = {
  width: "min(720px, 92vw)",
  maxHeight: "86vh",
  background: "var(--bg, #0f172a)",
  color: "var(--text, #f0f6ff)",
  borderRadius: 12,
  border: "1px solid rgba(255,255,255,0.08)",
  display: "flex",
  flexDirection: "column",
  overflow: "hidden",
  boxShadow: "0 30px 80px rgba(0,0,0,0.5)",
};

const headerStyle: CSSProperties = {
  padding: "14px 18px",
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  borderBottom: "1px solid rgba(255,255,255,0.06)",
};

const closeBtnStyle: CSSProperties = {
  background: "transparent",
  color: "inherit",
  border: "1px solid rgba(255,255,255,0.12)",
  borderRadius: 6,
  width: 28,
  height: 28,
  cursor: "pointer",
};

const sectionStyle: CSSProperties = {
  padding: "12px 18px",
  borderBottom: "1px solid rgba(255,255,255,0.05)",
};

const inputStyle: CSSProperties = {
  width: "100%",
  padding: "8px 10px",
  borderRadius: 6,
  border: "1px solid rgba(255,255,255,0.12)",
  background: "rgba(255,255,255,0.04)",
  color: "inherit",
  fontSize: 13,
  boxSizing: "border-box",
};

const primaryBtnStyle: CSSProperties = {
  marginTop: 8,
  padding: "8px 14px",
  borderRadius: 6,
  border: "none",
  background: "linear-gradient(135deg, #8b5cf6, #6366f1)",
  color: "#fff",
  fontSize: 13,
  fontWeight: 500,
  cursor: "pointer",
};

const taskCardStyle: CSSProperties = {
  padding: "10px 12px",
  marginBottom: 6,
  borderRadius: 8,
  background: "rgba(255,255,255,0.03)",
  border: "1px solid rgba(255,255,255,0.06)",
};

const expandedBodyStyle: CSSProperties = {
  marginTop: 10,
  paddingTop: 10,
  borderTop: "1px solid rgba(255,255,255,0.06)",
};

const summaryBoxStyle: CSSProperties = {
  padding: "8px 10px",
  marginTop: 6,
  border: "1px solid rgba(255,255,255,0.08)",
  borderRadius: 6,
  background: "rgba(255,255,255,0.02)",
};

const logRowStyle: CSSProperties = {
  padding: "4px 8px",
  marginBottom: 3,
  borderLeft: "2px solid rgba(255,255,255,0.1)",
  background: "rgba(255,255,255,0.02)",
};

const cancelBtnStyle: CSSProperties = {
  fontSize: 11,
  padding: "3px 8px",
  borderRadius: 4,
  border: "1px solid rgba(255,255,255,0.15)",
  background: "transparent",
  color: "inherit",
  cursor: "pointer",
};
