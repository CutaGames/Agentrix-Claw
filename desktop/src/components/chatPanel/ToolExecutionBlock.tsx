import type { CSSProperties } from "react";
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

const statusTone: Record<TaskTimelineEntry["status"], string> = {
  running: "#7dd3fc",
  "waiting-approval": "#fbbf24",
  completed: "#86efac",
  failed: "#fca5a5",
  rejected: "#fda4af",
};

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

export default function ToolExecutionBlock({
  taskStatus,
  activePlanStatus,
  pendingApprovalTitle,
  workspaceChanges,
  timelineEntries,
  onOpenWorkbench,
}: Props) {
  const liveEntries = timelineEntries.slice(0, 3);
  const hasLiveFeed = liveEntries.length > 0;

  if (!hasLiveFeed && taskStatus === "idle" && !activePlanStatus && !pendingApprovalTitle && workspaceChanges.length === 0) {
    return null;
  }

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
        <div style={liveFeedStyle}>
          <div style={liveFeedHeaderStyle}>
            <div>
              <div style={liveFeedEyebrowStyle}>Tool Execution</div>
              <div style={liveFeedTitleStyle}>实时工具状态树</div>
            </div>
            <button onClick={onOpenWorkbench} style={liveFeedButtonStyle}>Workbench</button>
          </div>
          <div style={liveFeedListStyle}>
            {liveEntries.map((entry) => (
              <div key={entry.id} style={liveFeedItemStyle}>
                <div style={{ ...liveFeedStatusStyle, color: statusTone[entry.status] }}>
                  <span>{statusIcon[entry.status]}</span>
                  <span>{entry.title}</span>
                </div>
                <div style={liveFeedDetailStyle}>{getPreviewText(entry)}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
}

const liveFeedStyle: CSSProperties = {
  margin: "0 16px 12px",
  padding: "12px 14px",
  borderRadius: 14,
  border: "1px solid rgba(125,211,252,0.18)",
  background: "rgba(8,12,22,0.8)",
  display: "flex",
  flexDirection: "column",
  gap: 10,
};

const liveFeedHeaderStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 12,
};

const liveFeedEyebrowStyle: CSSProperties = {
  fontSize: 10,
  fontWeight: 700,
  letterSpacing: 0.8,
  textTransform: "uppercase",
  color: "#7dd3fc",
};

const liveFeedTitleStyle: CSSProperties = {
  marginTop: 3,
  fontSize: 13,
  fontWeight: 600,
  color: "#e2e8f0",
};

const liveFeedButtonStyle: CSSProperties = {
  border: "1px solid rgba(125,211,252,0.18)",
  borderRadius: 999,
  background: "rgba(125,211,252,0.08)",
  color: "#bae6fd",
  fontSize: 11,
  fontWeight: 700,
  padding: "6px 12px",
  cursor: "pointer",
};

const liveFeedListStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
  gap: 10,
};

const liveFeedItemStyle: CSSProperties = {
  minWidth: 0,
  borderRadius: 12,
  padding: "10px 12px",
  background: "rgba(255,255,255,0.03)",
  border: "1px solid rgba(255,255,255,0.06)",
  display: "flex",
  flexDirection: "column",
  gap: 6,
};

const liveFeedStatusStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  fontSize: 12,
  fontWeight: 700,
};

const liveFeedDetailStyle: CSSProperties = {
  fontSize: 11,
  lineHeight: 1.45,
  color: "#94a3b8",
};