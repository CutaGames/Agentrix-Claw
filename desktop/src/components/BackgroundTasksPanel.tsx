// Sprint Pre-launch P-4 (2026-05-23) — Background Tasks panel.
//
// Modal panel that lists all background tasks for the signed-in user.
// Click a row to load its logs (poll while running). Cancel button on
// each pending/running row. "派一个新任务" entry composes a task without
// blocking the live chat — useful for long-running prompts the user
// doesn't want to babysit.

import { useCallback, useEffect, useMemo, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { useAuthStore } from "../services/store";
import {
  cancelBackgroundTask,
  fetchBackgroundTaskLogs,
  listBackgroundTasksCached,
  refreshBackgroundTasks,
  submitBackgroundTurn,
  type BackgroundTask,
  type BackgroundTaskLog,
  type BackgroundTaskStatus,
} from "../services/backgroundTasks";

interface Props {
  open: boolean;
  onClose: () => void;
}

const STATUS_LABEL: Record<BackgroundTaskStatus, string> = {
  pending: "排队中",
  queued: "排队中",
  running: "运行中",
  succeeded: "已完成",
  done: "已完成",
  failed: "失败",
  canceled: "已取消",
  cancelled: "已取消",
};

const STATUS_TONE: Record<BackgroundTaskStatus, string> = {
  pending: "var(--tone-warning-text)",
  queued: "var(--tone-warning-text)",
  running: "var(--tone-info-text)",
  succeeded: "var(--tone-success-text)",
  done: "var(--tone-success-text)",
  failed: "var(--tone-danger-text)",
  canceled: "var(--text-muted)",
  cancelled: "var(--text-muted)",
};

export default function BackgroundTasksPanel({ open, onClose }: Props) {
  const token = useAuthStore((s) => s.token);
  const activeAgentId = useAuthStore((s) => s.activeAgentId);
  const activeInstanceId = useAuthStore((s) => s.activeInstanceId);
  const [tasks, setTasks] = useState<BackgroundTask[]>(listBackgroundTasksCached);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [logs, setLogs] = useState<BackgroundTaskLog[]>([]);
  const [composeOpen, setComposeOpen] = useState(false);
  const [composeText, setComposeText] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Keep cache view in sync.
  useEffect(() => {
    const onUpdate = () => setTasks(listBackgroundTasksCached());
    window.addEventListener("agentrix:background-tasks-updated", onUpdate);
    return () => window.removeEventListener("agentrix:background-tasks-updated", onUpdate);
  }, []);

  // Refresh on open + every 6s while open.
  useEffect(() => {
    if (!open || !token) return;
    void refreshBackgroundTasks(token).catch(() => {});
    const t = window.setInterval(() => {
      void refreshBackgroundTasks(token).catch(() => {});
    }, 6_000);
    return () => window.clearInterval(t);
  }, [open, token]);

  // Load logs for selected task.
  useEffect(() => {
    if (!open || !token || !selectedId) {
      setLogs([]);
      return;
    }
    let cancelled = false;
    const tick = async () => {
      const fetched = await fetchBackgroundTaskLogs(token, selectedId).catch(() => []);
      if (!cancelled) setLogs(fetched);
    };
    void tick();
    const t = window.setInterval(tick, 4_000);
    return () => { cancelled = true; window.clearInterval(t); };
  }, [open, token, selectedId]);

  const selected = useMemo(() => tasks.find((t) => t.id === selectedId) || null, [tasks, selectedId]);

  const onCancelTask = useCallback(async (id: string) => {
    if (!token) return;
    await cancelBackgroundTask(token, id);
  }, [token]);

  const onSubmit = useCallback(async () => {
    if (!token || !composeText.trim() || submitting) return;
    setSubmitting(true);
    try {
      const task = await submitBackgroundTurn({
        token,
        prompt: composeText.trim(),
        agentId: activeAgentId || undefined,
        instanceId: activeInstanceId || undefined,
      });
      if (task) {
        setComposeText("");
        setComposeOpen(false);
        setSelectedId(task.id);
      }
    } finally {
      setSubmitting(false);
    }
  }, [token, composeText, submitting, activeAgentId, activeInstanceId]);

  if (!open) return null;
  if (typeof document === "undefined") return null;

  return createPortal(
    <div style={overlayStyle} onClick={onClose}>
      <div
        style={panelStyle}
        role="dialog"
        aria-modal="true"
        aria-label="后台任务"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div style={headerStyle}>
          <div>
            <div style={eyebrowStyle}>后台任务</div>
            <div style={titleStyle}>{tasks.length} 个任务</div>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={() => setComposeOpen((v) => !v)} style={primaryActionStyle}>
              {composeOpen ? "✕ 收起" : "+ 派一个新任务"}
            </button>
            <button onClick={onClose} style={closeBtnStyle} aria-label="关闭">✕</button>
          </div>
        </div>

        {/* Compose */}
        {composeOpen && (
          <div style={composeRowStyle}>
            <textarea
              value={composeText}
              onChange={(e) => setComposeText(e.target.value)}
              placeholder="把任务交给 Agent 后台跑,关掉桌面也不会中断..."
              rows={3}
              style={composeTextStyle}
            />
            <button
              onClick={() => void onSubmit()}
              disabled={submitting || !composeText.trim()}
              style={{
                ...submitBtnStyle,
                opacity: (submitting || !composeText.trim()) ? 0.5 : 1,
                cursor: (submitting || !composeText.trim()) ? "not-allowed" : "pointer",
              }}
            >
              {submitting ? "提交中…" : "派 →"}
            </button>
          </div>
        )}

        {/* Body: list + detail */}
        <div style={bodyStyle}>
          <div style={listStyle}>
            {tasks.length === 0 && (
              <div style={emptyStyle}>还没有后台任务。点击「派一个新任务」交给 Agent。</div>
            )}
            {tasks.map((task) => {
              const active = task.id === selectedId;
              const time = new Date(task.submittedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
              const open = task.status === "running" || task.status === "queued" || task.status === "pending";
              return (
                <button
                  key={task.id}
                  onClick={() => setSelectedId(task.id)}
                  style={{
                    ...rowStyle,
                    borderColor: active ? "var(--accent)" : "var(--border)",
                    background: active ? "var(--bg-card-hover)" : "var(--bg-elevated)",
                  }}
                >
                  <div style={rowTopStyle}>
                    <span style={{ fontSize: 11, fontWeight: 700, color: STATUS_TONE[task.status] }}>
                      {STATUS_LABEL[task.status]}
                    </span>
                    <span style={{ fontSize: 10, color: "var(--text-muted)" }}>{time}</span>
                  </div>
                  <div style={rowDescStyle}>{task.description}</div>
                  {task.progressMessage && (
                    <div style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 4 }}>
                      {task.progressMessage}
                    </div>
                  )}
                  {open && (
                    <button
                      onClick={(e) => { e.stopPropagation(); void onCancelTask(task.id); }}
                      style={inlineCancelBtnStyle}
                    >
                      取消
                    </button>
                  )}
                </button>
              );
            })}
          </div>
          <div style={detailStyle}>
            {selected ? (
              <>
                <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>
                  {selected.description}
                </div>
                <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 12 }}>
                  {STATUS_LABEL[selected.status]}{selected.costUsd ? ` · 花费 $${selected.costUsd.toFixed(4)}` : ""}
                </div>
                {selected.resultPreview && (
                  <div style={resultStyle}>{selected.resultPreview}</div>
                )}
                <div style={logHeaderStyle}>执行日志</div>
                <div style={logListStyle}>
                  {logs.length === 0 && <div style={emptyStyle}>暂无日志</div>}
                  {logs.map((log) => (
                    <div key={log.id} style={logRowStyle}>
                      <span style={{ fontSize: 10, color: "var(--text-muted)", marginRight: 8 }}>
                        {new Date(log.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                      </span>
                      <span style={{ fontSize: 11, fontWeight: 600, color: tonOfLogKind(log.kind) }}>
                        {log.kind}
                      </span>
                      <span style={{ fontSize: 11, marginLeft: 8 }}>{log.message}</span>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div style={emptyStyle}>选一条任务查看进度。</div>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function tonOfLogKind(kind: string): string {
  if (kind === "error") return "var(--tone-danger-text)";
  if (kind === "output" || kind === "tool_result") return "var(--tone-success-text)";
  if (kind === "tool_call") return "var(--tone-info-text)";
  return "var(--text-muted)";
}

// ── Styles ──────────────────────────────────────────────────────────────────

const overlayStyle: CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(2, 6, 23, 0.42)",
  backdropFilter: "blur(6px)",
  display: "flex",
  alignItems: "flex-start",
  justifyContent: "center",
  zIndex: 2147483646,
  paddingTop: "8vh",
};

const panelStyle: CSSProperties = {
  width: "min(880px, 94vw)",
  maxHeight: "82vh",
  display: "flex",
  flexDirection: "column",
  background: "var(--bg-card)",
  color: "var(--text)",
  border: "1px solid var(--border-strong)",
  borderRadius: 18,
  boxShadow: "var(--shadow)",
  overflow: "hidden",
};

const headerStyle: CSSProperties = {
  display: "flex",
  alignItems: "flex-start",
  justifyContent: "space-between",
  padding: "16px 20px",
  borderBottom: "1px solid var(--border)",
};

const eyebrowStyle: CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  color: "var(--accent-eyebrow)",
  textTransform: "uppercase",
  letterSpacing: 0.6,
};

const titleStyle: CSSProperties = {
  marginTop: 4,
  fontSize: 18,
  fontWeight: 700,
};

const primaryActionStyle: CSSProperties = {
  border: "none",
  background: "var(--accent)",
  color: "var(--text-on-accent)",
  borderRadius: 999,
  padding: "6px 14px",
  fontSize: 12,
  fontWeight: 700,
  cursor: "pointer",
};

const closeBtnStyle: CSSProperties = {
  border: "1px solid var(--border)",
  background: "transparent",
  color: "var(--text-muted)",
  borderRadius: 8,
  padding: "4px 10px",
  cursor: "pointer",
};

const composeRowStyle: CSSProperties = {
  display: "flex",
  gap: 8,
  padding: "12px 20px",
  borderBottom: "1px solid var(--border)",
};

const composeTextStyle: CSSProperties = {
  flex: 1,
  resize: "vertical",
  minHeight: 56,
  padding: "8px 10px",
  borderRadius: 10,
  border: "1px solid var(--border)",
  background: "var(--bg-input)",
  color: "var(--text)",
  fontSize: 13,
  fontFamily: "inherit",
};

const submitBtnStyle: CSSProperties = {
  alignSelf: "flex-end",
  border: "none",
  background: "var(--accent)",
  color: "var(--text-on-accent)",
  borderRadius: 12,
  padding: "10px 14px",
  fontSize: 13,
  fontWeight: 700,
};

const bodyStyle: CSSProperties = {
  flex: 1,
  display: "grid",
  gridTemplateColumns: "minmax(240px, 0.9fr) minmax(0, 1.4fr)",
  gap: 0,
  overflow: "hidden",
};

const listStyle: CSSProperties = {
  borderRight: "1px solid var(--border)",
  padding: 12,
  overflowY: "auto",
  display: "flex",
  flexDirection: "column",
  gap: 8,
};

const rowStyle: CSSProperties = {
  textAlign: "left",
  padding: "10px 12px",
  borderRadius: 10,
  border: "1px solid var(--border)",
  background: "var(--bg-elevated)",
  cursor: "pointer",
  position: "relative",
};

const rowTopStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "baseline",
  marginBottom: 4,
};

const rowDescStyle: CSSProperties = {
  fontSize: 12,
  fontWeight: 600,
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
};

const inlineCancelBtnStyle: CSSProperties = {
  position: "absolute",
  top: 8,
  right: 8,
  background: "transparent",
  border: "1px solid var(--border)",
  color: "var(--danger)",
  borderRadius: 999,
  padding: "2px 8px",
  fontSize: 10,
  cursor: "pointer",
};

const detailStyle: CSSProperties = {
  padding: 16,
  overflowY: "auto",
  display: "flex",
  flexDirection: "column",
};

const emptyStyle: CSSProperties = {
  textAlign: "center",
  color: "var(--text-muted)",
  fontSize: 12,
  padding: 24,
};

const resultStyle: CSSProperties = {
  padding: "10px 12px",
  borderRadius: 10,
  background: "var(--bg-overlay-light)",
  border: "1px solid var(--border)",
  fontSize: 12,
  whiteSpace: "pre-wrap",
  marginBottom: 12,
};

const logHeaderStyle: CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  color: "var(--text-dim)",
  marginBottom: 6,
  letterSpacing: 0.4,
  textTransform: "uppercase",
};

const logListStyle: CSSProperties = {
  flex: 1,
  display: "flex",
  flexDirection: "column",
  gap: 4,
  fontFamily: "monospace",
  fontSize: 11,
  borderRadius: 8,
  border: "1px solid var(--border)",
  background: "var(--code-bg)",
  color: "var(--code-fg)",
  padding: 10,
  overflowY: "auto",
};

const logRowStyle: CSSProperties = {
  whiteSpace: "pre-wrap",
  wordBreak: "break-word",
};
