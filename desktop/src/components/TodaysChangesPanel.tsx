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

import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { useChatPanelRuntimeStore } from "./chatPanel/runtimeStore";
import {
  backupCurrentState,
  groupBackupsByFile,
  listWorkspaceFileBackups,
  mergeBackups,
  planRevertAll,
  revertWorkspaceFileBackup,
  type BackupCurrentState,
  type WorkspaceBackupFileRow,
  type WorkspaceFileBackup,
} from "../services/workspaceBackups";
import {
  SNAPSHOT_SKIPPED_TEXT,
  canRevertSnapshot,
  describeSnapshotAgents,
  describeSnapshotReason,
  groupSnapshotsByFile,
  listAgentSnapshots,
  revertAgentSnapshot,
  type AgentSnapshot,
  type AgentSnapshotFileRow,
} from "../services/agentSnapshots";

function ownRowKey(row: WorkspaceBackupFileRow) {
  return `${row.earliest.id}@${row.latestAt}`;
}

function startOfToday() {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  return start.getTime();
}

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

  // Desktop D3 — also read today's snapshots from disk, so undo survives a
  // restart and covers changes made by other windows / remote commands.
  const [diskBackups, setDiskBackups] = useState<WorkspaceFileBackup[]>([]);
  // Set once 撤销全部 starts: a mount-time read that lands after that is stale
  // and would bring the just-reverted rows back.
  const mountReadStale = useRef(false);
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    mountReadStale.current = false;
    void listWorkspaceFileBackups({ since: startOfToday() }).then((list) => {
      if (!cancelled && !mountReadStale.current) setDiskBackups(list);
    });
    return () => {
      cancelled = true;
    };
  }, [open]);

  const allTodaysBackups = useMemo(() => {
    const start = startOfToday();
    return mergeBackups(Object.values(backups), diskBackups).filter((b) => b.createdAt >= start);
  }, [backups, diskBackups]);

  // One row per file; undo goes back to before today's first change
  // (REQ-desktop-052 a — the same rule as the other AIs' rows below).
  const ownRows = useMemo(() => groupBackupsByFile(allTodaysBackups), [allTodaysBackups]);

  // Is each file already back to how it was? Snapshots stay on disk after an
  // undo (so they can still be restored), so a reopened panel lists them
  // again; "same" rows cannot be undone and do not count. Keyed by snapshot id.
  // Keyed by the first snapshot and the time of the last one: a new AI edit
  // to a file that was back to "same" makes it undoable again.
  const [ownState, setOwnState] = useState<Record<string, BackupCurrentState>>({});
  const ownRowsKey = ownRows.map(ownRowKey).join("|");
  useEffect(() => {
    if (!open || ownRows.length === 0) return;
    let cancelled = false;
    void Promise.all(
      ownRows.map(async (row) => [ownRowKey(row), await backupCurrentState(row.earliest).catch(() => "unknown" as const)] as const),
    ).then((entries) => {
      if (!cancelled) setOwnState((prev) => ({ ...prev, ...Object.fromEntries(entries) }));
    });
    return () => {
      cancelled = true;
    };
    // ownRowsKey stands for ownRows (same keys, same rows).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, ownRowsKey]);
  const isOwnRowSame = (row: WorkspaceBackupFileRow) => ownState[ownRowKey(row)] === "same";
  const undoableOwnRows = ownRows.filter((row) => !isOwnRowSame(row));

  // Desktop D3 slice 5 — files other AIs (Claude Code, Cursor) changed today. Rust took
  // the snapshot in the hook; the WebView only sees summaries and passes an id.
  const [agentSnapshots, setAgentSnapshots] = useState<AgentSnapshot[]>([]);
  const [agentBusy, setAgentBusy] = useState<Set<string>>(new Set());
  const [agentErrors, setAgentErrors] = useState<Record<string, string>>({});
  const reloadAgentSnapshots = async () => {
    const list = await listAgentSnapshots(startOfToday());
    setAgentSnapshots(list);
  };
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void listAgentSnapshots(startOfToday()).then((list) => {
      if (!cancelled) setAgentSnapshots(list);
    });
    return () => {
      cancelled = true;
    };
  }, [open]);
  const agentRows = useMemo(() => groupSnapshotsByFile(agentSnapshots), [agentSnapshots]);
  const revertableAgentRows = agentRows.filter((row) => canRevertSnapshot(row.earliest));

  if (!open) return null;
  if (typeof document === "undefined") return null;

  /**
   * Today's oldest snapshot per file, planned from a fresh disk read merged
   * with what is already known. The in-memory store keeps only the newest
   * snapshot per file, so planning before the mount-time read lands would
   * undo only the last change.
   */
  const planFromFreshRead = async (): Promise<WorkspaceFileBackup[]> => {
    const start = startOfToday();
    const fresh = await listWorkspaceFileBackups({ since: start }).catch(() => [] as WorkspaceFileBackup[]);
    return planRevertAll(
      mergeBackups(Object.values(useChatPanelRuntimeStore.getState().workspaceBackups), allTodaysBackups, fresh)
        .filter((b) => b.createdAt >= start),
    );
  };

  /** Undo one file: back to before today's first AI change to it. */
  const handleRevertOne = async (row: WorkspaceBackupFileRow) => {
    const path = row.targetPath;
    setReverting((prev) => new Set(prev).add(path));
    setErrors((prev) => {
      const next = { ...prev };
      delete next[path];
      return next;
    });
    try {
      const earliest = (await planFromFreshRead()).find((b) => b.targetPath === path) ?? row.earliest;
      await revertWorkspaceFileBackup(earliest);
      removeBackup(path);
      setDiskBackups((prev) => prev.filter((b) => b.targetPath !== path));
      // Let the rest of the app know so workspaceChanges can refresh.
      window.dispatchEvent(new CustomEvent("agentrix:workspace-reverted", { detail: { path } }));
    } catch (err: any) {
      setErrors((prev) => ({ ...prev, [path]: err?.message || "撤销失败" }));
    } finally {
      setReverting((prev) => {
        const next = new Set(prev);
        next.delete(path);
        return next;
      });
    }
  };

  /** Undo other AIs' changes to one file today: restore its earliest snapshot. */
  const revertAgentRow = async (row: AgentSnapshotFileRow): Promise<boolean> => {
    const result = await revertAgentSnapshot(row.earliest.id);
    if (!result.ok) {
      setAgentErrors((prev) => ({ ...prev, [row.targetPath]: describeSnapshotReason(result.reason) || "撤销失败" }));
      return false;
    }
    setAgentErrors((prev) => {
      const next = { ...prev };
      delete next[row.targetPath];
      return next;
    });
    return true;
  };

  const handleRevertAgentRow = async (row: AgentSnapshotFileRow) => {
    setAgentBusy((prev) => new Set(prev).add(row.targetPath));
    try {
      if (await revertAgentRow(row)) {
        window.dispatchEvent(new CustomEvent("agentrix:workspace-reverted", { detail: { path: row.targetPath, agent: row.earliest.agent } }));
      }
    } finally {
      await reloadAgentSnapshots();
      setAgentBusy((prev) => {
        const next = new Set(prev);
        next.delete(row.targetPath);
        return next;
      });
    }
  };

  const totalChanges = undoableOwnRows.length + revertableAgentRows.length;

  const handleRevertAll = async () => {
    if (totalChanges === 0) return;
    setRevertingAll(true);
    mountReadStale.current = true;
    // Files already back to how they were are skipped (they were not counted).
    const alreadySame = new Set(ownRows.filter(isOwnRowSame).map((row) => row.targetPath));
    const plan = (await planFromFreshRead()).filter((b) => !alreadySame.has(b.targetPath));
    // Oldest snapshot per file: back to how it was before today's first change.
    for (const b of plan) {
      try {
        await revertWorkspaceFileBackup(b);
        removeBackup(b.targetPath);
        setDiskBackups((prev) => prev.filter((item) => item.targetPath !== b.targetPath));
      } catch (err: any) {
        setErrors((prev) => ({ ...prev, [b.targetPath]: err?.message || "撤销失败" }));
      }
    }
    for (const row of revertableAgentRows) {
      await revertAgentRow(row);
    }
    await reloadAgentSnapshots();
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
            <div style={titleStyle}>{ownRows.length + agentRows.length} 个文件被改动</div>
          </div>
          <button onClick={onClose} style={closeBtnStyle} aria-label="关闭">✕</button>
        </div>

        <div style={listStyle}>
          {ownRows.length === 0 && agentRows.length === 0 && (
            <div style={emptyStyle}>今天 Agent 还没有动过任何文件。</div>
          )}
          {ownRows.map((row) => {
            const path = row.targetPath;
            const isReverting = reverting.has(path);
            const same = isOwnRowSame(row);
            const busy = isReverting || revertingAll;
            const error = errors[path];
            const time = new Date(row.latestAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
            const note = same
              ? "和改之前一样（没改成或已撤销）"
              : !row.earliest.existedBefore
                ? "新建的文件，撤销会删掉它"
                : row.edits > 1
                  ? `改了 ${row.edits} 次`
                  : "";
            return (
              <div key={path} style={rowStyle} data-testid="todays-changes-own-row">
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={pathStyle}>{path}</div>
                  <div style={metaStyle}>
                    {time}
                    {note && ` · ${note}`}
                    {error && <span style={errorTagStyle}> · {error}</span>}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => void handleRevertOne(row)}
                  disabled={same || busy}
                  style={{
                    ...rowBtnStyle,
                    opacity: same || busy ? 0.5 : 1,
                    cursor: same ? "not-allowed" : busy ? "wait" : "pointer",
                  }}
                  aria-label={`撤销今天对 ${path} 的改动`}
                  title="回到今天第一次改它之前"
                >
                  {isReverting ? "撤销中…" : "撤销"}
                </button>
              </div>
            );
          })}

          {agentRows.length > 0 && (
            <div style={groupTitleStyle} data-testid="todays-changes-agent-group">
              {describeSnapshotAgents(agentRows.flatMap((row) => row.agents))} 改的
            </div>
          )}
          {agentRows.map((row) => {
            const isBusy = agentBusy.has(row.targetPath);
            const error = agentErrors[row.targetPath];
            const revertable = canRevertSnapshot(row.earliest);
            const who = describeSnapshotAgents(row.agents);
            const time = new Date(row.latestAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
            const note = row.earliest.skipped
              ? SNAPSHOT_SKIPPED_TEXT[row.earliest.skipped] || "没有留快照"
              : !row.earliest.verified
                ? "没法确认这张快照是 Agentrix 自己留的，不能一键撤回"
              : row.earliest.current === "same"
                ? "和改之前一样（没改成或已撤回）"
                : row.earliest.current === "unknown"
                  ? "现在读不到这个文件"
                  : row.earliest.existedBefore
                    ? `改了 ${row.edits} 次`
                    : "新建的文件，撤回会删掉它";
            return (
              <div key={row.targetPath} style={rowStyle} data-testid="todays-changes-agent-row">
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={pathStyle} title={row.targetPath}>{row.targetPath}</div>
                  <div style={metaStyle}>
                    {time} · {note}
                    {error && <span style={errorTagStyle}> · {error}</span>}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => void handleRevertAgentRow(row)}
                  disabled={!revertable || isBusy || revertingAll}
                  style={{
                    ...rowBtnStyle,
                    opacity: !revertable || isBusy || revertingAll ? 0.5 : 1,
                    cursor: !revertable ? "not-allowed" : isBusy || revertingAll ? "wait" : "pointer",
                  }}
                  aria-label={`撤销 ${who} 今天对 ${row.targetPath} 的改动`}
                  title={`回到 ${who} 今天第一次改它之前`}
                >
                  {isBusy ? "撤销中…" : "撤销"}
                </button>
              </div>
            );
          })}
        </div>

        {totalChanges > 0 && (
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
              {revertingAll ? "正在撤销全部…" : `撤销今天全部 ${totalChanges} 个改动`}
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

const groupTitleStyle: CSSProperties = {
  marginTop: 8,
  fontSize: 11,
  fontWeight: 700,
  color: "var(--text-muted)",
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
