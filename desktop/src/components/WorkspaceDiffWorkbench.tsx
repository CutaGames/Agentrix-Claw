// Sprint Pro Mode Coding Views (2026-05-24) — F1.
//
// Pro Mode-only fullscreen panel that shows raw git diff for all modified
// workspace files in the current session. Wraps the existing
// `WorkspaceFileStatus` + `DiffView` components — does NOT re-implement diff
// rendering. Hidden in Simple / Standard modes (gated by ChatTitleBar More
// menu `tier: "pro"` filter, but also defensively gated here).
//
// See:
//   - `.kiro/specs/pro-mode-coding-views-2026-05/requirements.md` Req 1
//   - `desktop/src/components/WorkspaceFileStatus.tsx`
//   - `docs/agentrix-positioning-2026-05.zh-CN.md` §3.4 (raw diff in Pro Mode)

import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import WorkspaceFileStatus from "./WorkspaceFileStatus";
import { gitStatus, type GitFileChange } from "../services/git";
import { useIsProMode } from "../services/userMode";

interface Props {
  open: boolean;
  onClose: () => void;
}

export default function WorkspaceDiffWorkbench({ open, onClose }: Props) {
  const isPro = useIsProMode();
  const [changes, setChanges] = useState<GitFileChange[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await gitStatus();
      setChanges(result.changes || []);
    } catch (err: any) {
      const msg = typeof err?.message === "string" ? err.message : String(err);
      setError(msg || "无法读取工作区 git 状态");
      setChanges([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    refresh();
  }, [open, refresh]);

  // Esc to close.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;
  // Defensive gate — should not be reachable from Simple/Standard, but guard
  // anyway so a stale state cannot leak Pro UI.
  if (!isPro) return null;

  const portalTarget = typeof document !== "undefined" ? document.body : null;
  if (!portalTarget) return null;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Workspace Diff"
      style={{
        position: "fixed",
        inset: 0,
        background: "var(--surface-overlay, rgba(0, 0, 0, 0.45))",
        display: "flex",
        alignItems: "stretch",
        justifyContent: "center",
        zIndex: 9000,
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        style={{
          background: "var(--surface-1, #fff)",
          color: "var(--text-1, inherit)",
          width: "90vw",
          height: "85vh",
          margin: "auto",
          borderRadius: 12,
          display: "flex",
          flexDirection: "column",
          boxShadow: "0 8px 32px rgba(0,0,0,0.2)",
          overflow: "hidden",
        }}
      >
        <header
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "12px 16px",
            borderBottom: "1px solid var(--border-subtle, rgba(120,120,140,0.2))",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 16, fontWeight: 600 }}>🔍 Workspace Diff</span>
            <span style={{ fontSize: 12, color: "var(--text-2, inherit)", opacity: 0.7 }}>
              {loading ? "正在读取…" : `${changes.length} 个文件改动`}
            </span>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              type="button"
              onClick={refresh}
              disabled={loading}
              style={{
                background: "var(--surface-2, rgba(120,120,140,0.12))",
                color: "var(--text-1, inherit)",
                border: "1px solid var(--border-subtle, rgba(120,120,140,0.3))",
                borderRadius: 6,
                padding: "4px 12px",
                cursor: loading ? "wait" : "pointer",
                fontSize: 12,
              }}
            >
              ↻ 刷新
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close Workspace Diff"
              style={{
                background: "transparent",
                color: "var(--text-2, inherit)",
                border: "1px solid var(--border-subtle, rgba(120,120,140,0.3))",
                borderRadius: 6,
                padding: "4px 12px",
                cursor: "pointer",
                fontSize: 12,
              }}
            >
              ✕ 关闭 (Esc)
            </button>
          </div>
        </header>

        <main style={{ flex: 1, overflow: "auto", padding: 12 }}>
          {error && (
            <div
              role="alert"
              style={{
                background: "var(--surface-warning, rgba(196, 64, 64, 0.08))",
                color: "var(--danger, #c33)",
                border: "1px solid var(--border-warning, rgba(196, 64, 64, 0.3))",
                borderRadius: 6,
                padding: 12,
                fontSize: 12,
                marginBottom: 12,
              }}
            >
              {error}
            </div>
          )}

          {!error && changes.length === 0 && !loading && (
            <div
              style={{
                textAlign: "center",
                padding: 48,
                color: "var(--text-2, inherit)",
                opacity: 0.6,
              }}
            >
              <div style={{ fontSize: 32, marginBottom: 8 }}>✨</div>
              <div style={{ fontSize: 14 }}>当前工作区没有未提交的改动</div>
              <div style={{ fontSize: 12, marginTop: 4, opacity: 0.7 }}>
                Agent 改动文件后,会自动出现在这里。
              </div>
            </div>
          )}

          {!error && changes.length > 0 && (
            <WorkspaceFileStatus changes={changes} />
          )}
        </main>

        <footer
          style={{
            padding: "8px 16px",
            borderTop: "1px solid var(--border-subtle, rgba(120,120,140,0.2))",
            fontSize: 11,
            color: "var(--text-2, inherit)",
            opacity: 0.7,
            display: "flex",
            justifyContent: "space-between",
          }}
        >
          <span>Pro Mode · 桌面专属 · `<a
            href="docs/agentrix-positioning-2026-05.zh-CN.md"
            style={{ color: "inherit" }}
            onClick={(e) => e.preventDefault()}
          >定位 §3.4</a>`</span>
          <span>Esc / 点击外部 = 关闭</span>
        </footer>
      </div>
    </div>,
    portalTarget,
  );
}
