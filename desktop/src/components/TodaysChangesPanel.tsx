// Sprint Pre-launch P-3 (2026-05-23) — "Today's changes" panel.
//
// Surfaces every backed-up workspace file change that the agent made
// today, in chronological order. Each row gets an "Undo" button that
// reverts to the pre-change content via `revertWorkspaceFileBackup`.
// A footer button reverts ALL of today's changes in one go.
//
// Why this exists: non-coder users need a recoverable, visible audit
// trail. Currently the data lives in `workspaceBackups` zustand store
// but there's no UI surface — it's only consumed by the file-change
// chip row inside the chat. This panel makes it first-class.

import { useMemo, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { useChatPanelRuntimeStore } from "./chatPanel/runtimeStore";
import {
  revertWorkspaceFileBackup,
  type WorkspaceFileBackup,
} from "../services/workspaceBackups";

interface Props {
  open: boolean;
  onClose: () => void;
}

export default function TodaysChangesPanel({ open, onClose }: Props) {
  const backups = useChatPanelRuntimeStore((s) => s.workspaceBackups);
  const removeBackup = useChatPanelRuntimeStore((s) => s.removeWorkspaceBackup);
  const [reverting, setReverting] = useState<Set<string>>(new Set());
  const [revertingAll, setRevertingAll] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const todaysBackups = useMemo(() => {
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const start = startOfToday.getTime();
    return Object.values(backups)
      .filter((b) => b.createdAt >= start)
      .sort((a, b) => b.createdAt - a.createdAt);
  }, [backups]);

  if (!open) return null;
  if (typeof document === "undefined") return null;

  const handleRevertOne = async (backup: WorkspaceFileBackup) => {
    setReverting((prev) => new Set(prev).add(backup.targetPath));
    setErrors((prev) => {
      const next = { ...prev };
      delete next[backup.targetPath];
      return next;
    });
    try {
      await revertWorkspaceFileBackup(backup);
      removeBackup(backup.targetPath);
      // Let the rest of the app know so workspaceChanges can refresh.
      window.dispatchEvent(new CustomEvent("agentrix:workspace-reverted", { detail: { path: backup.targetPath } }));
    } catch (err: any) {
      setErrors((prev) => ({ ...prev, [backup.targetPath]: err?.message || "撤销失败" }));
    } finally {
      setReverting((prev) => {
        const next = new Set(prev);
        next.delete(backup.targetPath);
        return next;
      });
    }
  };

  const handleRevertAll = async () => {
    if (todaysBackups.length === 0) return;
    setRevertingAll(true);
    for (const b of todaysBackups) {
      try {
        await revertWorkspaceFileBackup(b);
        removeBackup(b.targetPath);
      } catch (err: any) {
        setErrors((prev) => ({ ...prev, [b.targetPath]: err?.message || "撤销失败" }));
      }
    }
    setRevertingAll(false);
    window.dispatchEvent(new CustomEvent("agentrix:workspace-reverted", { detail: { all: true } }));
  };

  return createPortal(
    <div style={overlayStyle} onClick={onClose}>
      <div
        style={panelStyle}
        role="dialog"
        aria-modal="true"
        aria-label="今天的改动"
        onClick={(e) => e.stopPropagation()}
      >
        <div style={headerStyle}>
          <div>
            <div style={eyebrowStyle}>今天 Agent 做了什么</div>
            <div style={titleStyle}>{todaysBackups.length} 个文件被改动</div>
          </div>
          <button onClick={onClose} style={closeBtnStyle} aria-label="关闭">✕</button>
        </div>

        <div style={listStyle}>
          {todaysBackups.length === 0 && (
            <div style={emptyStyle}>今天 Agent 还没有动过任何文件。</div>
          )}
          {todaysBackups.map((backup) => {
            const isReverting = reverting.has(backup.targetPath);
            const error = errors[backup.targetPath];
            const time = new Date(backup.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
            return (
              <div key={backup.id} style={rowStyle}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={pathStyle}>{backup.targetPath}</div>
                  <div style={metaStyle}>{time}{error && <span style={errorTagStyle}> · {error}</span>}</div>
                </div>
                <button
                  onClick={() => handleRevertOne(backup)}
                  disabled={isReverting || revertingAll}
                  style={{
                    ...rowBtnStyle,
                    opacity: (isReverting || revertingAll) ? 0.5 : 1,
                    cursor: (isReverting || revertingAll) ? "wait" : "pointer",
                  }}
                  title="撤销这一处改动"
                >
                  {isReverting ? "撤销中…" : "撤销"}
                </button>
              </div>
            );
          })}
        </div>

        {todaysBackups.length > 0 && (
          <div style={footerStyle}>
            <button
              onClick={handleRevertAll}
              disabled={revertingAll}
              style={{
                ...primaryBtnStyle,
                opacity: revertingAll ? 0.6 : 1,
                cursor: revertingAll ? "wait" : "pointer",
              }}
            >
              {revertingAll ? "正在撤销全部…" : `撤销今天全部 ${todaysBackups.length} 个改动`}
            </button>
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────

const overlayStyle: CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(2, 6, 23, 0.4)",
  backdropFilter: "blur(6px)",
  display: "flex",
  alignItems: "flex-start",
  justifyContent: "center",
  zIndex: 2147483646,
  paddingTop: "10vh",
};

const panelStyle: CSSProperties = {
  width: "min(560px, 92vw)",
  maxHeight: "70vh",
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

const closeBtnStyle: CSSProperties = {
  border: "1px solid var(--border)",
  background: "transparent",
  color: "var(--text-muted)",
  borderRadius: 8,
  padding: "4px 10px",
  cursor: "pointer",
};

const listStyle: CSSProperties = {
  flex: 1,
  overflowY: "auto",
  padding: "12px 20px",
  display: "flex",
  flexDirection: "column",
  gap: 8,
};

const emptyStyle: CSSProperties = {
  textAlign: "center",
  color: "var(--text-muted)",
  fontSize: 13,
  padding: "32px 0",
};

const rowStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 12,
  padding: "10px 12px",
  borderRadius: 10,
  border: "1px solid var(--border)",
  background: "var(--bg-elevated)",
};

const pathStyle: CSSProperties = {
  fontSize: 13,
  fontWeight: 600,
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
};

const metaStyle: CSSProperties = {
  fontSize: 11,
  color: "var(--text-muted)",
  marginTop: 2,
};

const errorTagStyle: CSSProperties = {
  color: "var(--danger)",
};

const rowBtnStyle: CSSProperties = {
  flexShrink: 0,
  border: "1px solid var(--border)",
  background: "var(--bg-card)",
  color: "var(--text)",
  borderRadius: 999,
  padding: "6px 14px",
  fontSize: 12,
  fontWeight: 600,
};

const footerStyle: CSSProperties = {
  padding: "12px 20px",
  borderTop: "1px solid var(--border)",
  background: "var(--bg-elevated)",
};

const primaryBtnStyle: CSSProperties = {
  width: "100%",
  border: "none",
  background: "var(--accent)",
  color: "var(--text-on-accent)",
  borderRadius: 12,
  padding: "10px 12px",
  fontSize: 13,
  fontWeight: 700,
};
