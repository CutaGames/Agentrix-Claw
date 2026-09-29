import { useState, type CSSProperties } from "react";
import type { GitFileChange } from "../../services/git";
import type { TaskRunState, TaskTimelineEntry } from "../TaskTimeline";
import { TaskWorkbenchBanner } from "./taskStatusUi";

interface Props {
  taskStatus: TaskRunState;
  activePlanStatus?: string | null;
  pendingApprovalTitle?: string | null;
  workspaceChanges: GitFileChange[];
  timelineEntries: TaskTimelineEntry[];
  onOpenWorkbench: () => void;
}

const statusIcon: Record<TaskTimelineEntry["status"], string> = {
  running: "⏳",
  "waiting-approval": "🔐",
  completed: "✅",
  failed: "❌",
  rejected: "🚫",
};

function getPreviewText(entry: TaskTimelineEntry) {
  const source = entry.output || entry.detail || "";
  if (!source) return "Waiting for tool output";
  const normalized = source.split("\n").map((line) => line.trim()).filter(Boolean);
  return (normalized.slice(-2).join(" · ") || source).slice(0, 220);
}

/**
 * v0.7.8 — Compact Tool Execution panel.
 *
 * Previously this rendered a full live-feed card (220x80+ for each running
 * tool, up to 3) which together with the TASK WORKBENCH banner above and
 * the WORKSPACE CONTEXT footer below squeezed the actual chat down to ~30%
 * of the panel height during long agent tasks (user reported "对话框太满了").
 *
 * The new layout:
 *   - One thin ticker row: "Tool Execution · ⏳ 2 running · ✅ 8 done"
 *   - Click to expand the detail card (preserved old layout)
 *   - Auto-collapse when nothing is actively running
 */
export default function ToolExecutionBlock({
  taskStatus,
  activePlanStatus,
  pendingApprovalTitle,
  workspaceChanges,
  timelineEntries,
  onOpenWorkbench,
}: Props) {
  const [expanded, setExpanded] = useState(false);

  const RECENT_WINDOW_MS = 5_000;
  const now = Date.now();
  const liveEntries = timelineEntries.filter((entry) => {
    if (entry.status === "running" || entry.status === "waiting-approval") return true;
    const finishedAt = (entry as any).finishedAt as number | undefined;
    return typeof finishedAt === "number" && now - finishedAt < RECENT_WINDOW_MS;
  });
  const visibleEntries = liveEntries.slice(0, 3);
  const hasLiveFeed = visibleEntries.length > 0;

  const planActive = activePlanStatus === "executing" || activePlanStatus === "awaiting_approval";
  const taskActive = taskStatus === "executing" || taskStatus === "need-approve";
  if (!hasLiveFeed && !taskActive && !planActive && !pendingApprovalTitle && workspaceChanges.length === 0) {
    return null;
  }

  // Aggregate counts for the compact ticker.
  const runningCount = liveEntries.filter((e) => e.status === "running").length;
  const waitingCount = liveEntries.filter((e) => e.status === "waiting-approval").length;
  const completedCount = timelineEntries.filter((e) => e.status === "completed").length;
  const failedCount = timelineEntries.filter((e) => e.status === "failed").length;

  return (
    <>
      <TaskWorkbenchBanner
        taskStatus={taskStatus}
        activePlanStatus={activePlanStatus || null}
        pendingApprovalTitle={pendingApprovalTitle || null}
        workspaceChanges={workspaceChanges}
        timelineCount={timelineEntries.length}
        onOpen={onOpenWorkbench}
      />
      {hasLiveFeed && (
        <>
          {/* Compact one-line ticker */}
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            style={tickerStyle}
            aria-expanded={expanded}
            title={expanded ? "Hide tool detail" : "Show tool detail"}
          >
            <span style={tickerEyebrowStyle}>Tool Execution</span>
            {runningCount > 0 && <span style={tickerChipRunStyle}>⏳ {runningCount}</span>}
            {waitingCount > 0 && <span style={tickerChipWaitStyle}>🔐 {waitingCount}</span>}
            {completedCount > 0 && <span style={tickerChipDoneStyle}>✅ {completedCount}</span>}
            {failedCount > 0 && <span style={tickerChipFailStyle}>❌ {failedCount}</span>}
            <span style={tickerSpacerStyle}>{visibleEntries[0]?.title || ""}</span>
            <span style={tickerCaretStyle}>{expanded ? "▴" : "▾"}</span>
          </button>

          {expanded && (
            <div style={liveFeedStyle}>
              <div style={liveFeedListStyle}>
                {visibleEntries.map((entry) => (
                  <div key={entry.id} style={liveFeedItemStyle}>
                    <div style={liveFeedStatusStyle}>
                      <span>{statusIcon[entry.status]}</span>
                      <span>{entry.title}</span>
                    </div>
                    <div style={liveFeedDetailStyle}>{getPreviewText(entry)}</div>
                  </div>
                ))}
              </div>
              <button onClick={onOpenWorkbench} style={liveFeedButtonStyle}>
                Open Workbench
              </button>
            </div>
          )}
        </>
      )}
    </>
  );
}

const tickerStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  margin: "0 16px 8px",
  padding: "6px 10px",
  borderRadius: 999,
  border: "1px solid var(--border)",
  background: "var(--bg-overlay-light)",
  fontSize: 11,
  cursor: "pointer",
  width: "fit-content",
  maxWidth: "calc(100% - 32px)",
  color: "var(--text)",
};

const tickerEyebrowStyle: CSSProperties = {
  fontSize: 10,
  fontWeight: 700,
  letterSpacing: 0.6,
  textTransform: "uppercase",
  color: "var(--text-muted)",
};

const tickerChipBaseStyle: CSSProperties = {
  fontSize: 10,
  fontWeight: 700,
  padding: "1px 6px",
  borderRadius: 999,
  whiteSpace: "nowrap",
};

const tickerChipRunStyle: CSSProperties = {
  ...tickerChipBaseStyle,
  background: "var(--tone-info-bg)",
  color: "var(--tone-info-text)",
  border: "1px solid var(--tone-info-border)",
};

const tickerChipWaitStyle: CSSProperties = {
  ...tickerChipBaseStyle,
  background: "var(--tone-warning-bg)",
  color: "var(--tone-warning-text)",
  border: "1px solid var(--tone-warning-border)",
};

const tickerChipDoneStyle: CSSProperties = {
  ...tickerChipBaseStyle,
  background: "var(--tone-success-bg)",
  color: "var(--tone-success-text)",
  border: "1px solid var(--tone-success-border)",
};

const tickerChipFailStyle: CSSProperties = {
  ...tickerChipBaseStyle,
  background: "var(--tone-danger-bg)",
  color: "var(--tone-danger-text)",
  border: "1px solid var(--tone-danger-border)",
};

const tickerSpacerStyle: CSSProperties = {
  flex: 1,
  minWidth: 0,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
  color: "var(--text-muted)",
  fontSize: 11,
  marginLeft: 4,
};

const tickerCaretStyle: CSSProperties = {
  fontSize: 10,
  color: "var(--text-muted)",
  marginLeft: 4,
};

const liveFeedStyle: CSSProperties = {
  margin: "0 16px 12px",
  padding: "10px 12px",
  borderRadius: 12,
  border: "1px solid var(--border)",
  background: "var(--bg-card)",
  display: "flex",
  flexDirection: "column",
  gap: 8,
};

const liveFeedListStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
  gap: 8,
};

const liveFeedItemStyle: CSSProperties = {
  minWidth: 0,
  borderRadius: 10,
  padding: "8px 10px",
  background: "var(--bg-elevated)",
  border: "1px solid var(--border-light)",
  display: "flex",
  flexDirection: "column",
  gap: 4,
};

const liveFeedStatusStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 6,
  fontSize: 12,
  fontWeight: 600,
  color: "var(--text)",
};

const liveFeedDetailStyle: CSSProperties = {
  fontSize: 11,
  lineHeight: 1.5,
  color: "var(--text-muted)",
};

const liveFeedButtonStyle: CSSProperties = {
  alignSelf: "flex-end",
  border: "1px solid var(--border)",
  borderRadius: 999,
  background: "var(--tone-info-bg)",
  color: "var(--tone-info-text)",
  fontSize: 11,
  fontWeight: 700,
  padding: "5px 12px",
  cursor: "pointer",
};
