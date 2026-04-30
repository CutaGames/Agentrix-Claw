import { type CSSProperties } from "react";
import type { GitFileChange } from "../../services/git";

type StreamFeedbackTone = "info" | "warning" | "error" | "success";

interface FeedbackState {
  tone: StreamFeedbackTone;
  label: string;
  detail?: string;
}

interface TaskWorkbenchBannerProps {
  taskStatus: string;
  activePlanStatus?: string | null;
  pendingApprovalTitle?: string | null;
  workspaceChanges: GitFileChange[];
  timelineCount: number;
  onOpen: () => void;
}

interface StreamStatusBannerProps {
  feedback: FeedbackState | null;
  continuePrompt: string | null;
  sending: boolean;
  onContinue: () => void;
}

interface ChatQuickActionsProps {
  hasPendingApproval: boolean;
  approvalSubmitting: boolean;
  hasActiveWorkbench: boolean;
  workspaceChanges: GitFileChange[];
  continuePrompt: string | null;
  sending: boolean;
  onOpenWorkbench: () => void;
  onContinue: () => void;
}

export function TaskWorkbenchBanner({
  taskStatus,
  activePlanStatus,
  pendingApprovalTitle,
  workspaceChanges,
  timelineCount,
  onOpen,
}: TaskWorkbenchBannerProps) {
  const hasBanner = taskStatus !== "idle"
    || Boolean(activePlanStatus)
    || Boolean(pendingApprovalTitle)
    || workspaceChanges.length > 0;

  if (!hasBanner) {
    return null;
  }

  const previewChanges = workspaceChanges.slice(0, 2);
  const summary = pendingApprovalTitle
    ? `Approval pending · ${pendingApprovalTitle}`
    : workspaceChanges.length > 0
      ? `${workspaceChanges.length} workspace change${workspaceChanges.length === 1 ? "" : "s"}`
      : activePlanStatus
        ? `Plan ${activePlanStatus.replace(/_/g, " ")}`
        : `${timelineCount} timeline step${timelineCount === 1 ? "" : "s"} tracked`;

  return (
    <div style={bannerStyle}>
      <div style={{ minWidth: 0 }}>
        <div style={bannerEyebrowStyle}>Task Workbench</div>
        <div style={bannerSummaryStyle}>{summary}</div>
        {previewChanges.length > 0 && (
          <div style={bannerPreviewStyle}>
            {previewChanges.map((change) => (
              <span key={`${change.status}-${change.file}`} style={bannerPreviewItemStyle}>
                <span style={bannerPreviewStatusStyle}>{change.status}</span>
                <span style={bannerPreviewPathStyle}>{change.file}</span>
              </span>
            ))}
            {workspaceChanges.length > previewChanges.length && (
              <span style={bannerPreviewMoreStyle}>+{workspaceChanges.length - previewChanges.length} more</span>
            )}
          </div>
        )}
      </div>
      <button onClick={onOpen} style={bannerButtonStyle}>
        {pendingApprovalTitle || workspaceChanges.length > 0 ? "Review" : "Open"}
      </button>
    </div>
  );
}

export function StreamStatusBanner({
  feedback,
  continuePrompt,
  sending,
  onContinue,
}: StreamStatusBannerProps) {
  if (!feedback && !continuePrompt) {
    return null;
  }

  return (
    <div
      style={{
        ...getStreamFeedbackStyle(feedback?.tone || "warning"),
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12,
      }}
    >
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 12, fontWeight: 700 }}>
          {feedback?.label || "回复可继续"}
        </div>
        {(feedback?.detail || continuePrompt) && (
          <div style={feedbackDetailStyle}>
            {feedback?.detail || "从当前上下文继续输出，避免重复前文。"}
          </div>
        )}
      </div>
      {continuePrompt && (
        <button
          onClick={onContinue}
          disabled={sending}
          style={{
            ...continueActionBtnStyle,
            opacity: sending ? 0.6 : 1,
            cursor: sending ? "default" : "pointer",
          }}
        >
          Continue
        </button>
      )}
    </div>
  );
}

export function ChatQuickActions({
  hasPendingApproval,
  approvalSubmitting,
  hasActiveWorkbench,
  workspaceChanges,
  continuePrompt,
  sending,
  onOpenWorkbench,
  onContinue,
}: ChatQuickActionsProps) {
  return (
    <>
      {hasPendingApproval && (
        <button
          onClick={onOpenWorkbench}
          style={pendingApprovalButtonStyle}
          title="Open the Task Workbench to review approvals"
        >
          {approvalSubmitting ? "Submitting approval" : "Approval pending"}
        </button>
      )}
      {hasActiveWorkbench && (
        <button
          onClick={onOpenWorkbench}
          style={taskWorkbenchPillStyle}
          title="Open Task Workbench"
        >
          {workspaceChanges.length > 0 ? `Changes ${workspaceChanges.length}` : "Workbench"}
        </button>
      )}
      {continuePrompt && (
        <button
          onClick={onContinue}
          disabled={sending}
          style={{
            ...continueQuickActionStyle,
            opacity: sending ? 0.6 : 1,
            cursor: sending ? "default" : "pointer",
          }}
          title="Continue the previous response"
        >
          Continue
        </button>
      )}
    </>
  );
}

function getStreamFeedbackStyle(tone: StreamFeedbackTone): CSSProperties {
  if (tone === "success") {
    return {
      padding: "10px 12px",
      borderRadius: 10,
      background: "rgba(74, 222, 128, 0.12)",
      border: "1px solid rgba(74, 222, 128, 0.28)",
      color: "#86efac",
    };
  }

  if (tone === "error") {
    return {
      padding: "10px 12px",
      borderRadius: 10,
      background: "rgba(248, 113, 113, 0.12)",
      border: "1px solid rgba(248, 113, 113, 0.3)",
      color: "#fca5a5",
    };
  }

  if (tone === "warning") {
    return {
      padding: "10px 12px",
      borderRadius: 10,
      background: "rgba(251, 191, 36, 0.12)",
      border: "1px solid rgba(251, 191, 36, 0.3)",
      color: "#fcd34d",
    };
  }

  return {
    padding: "10px 12px",
    borderRadius: 10,
    background: "rgba(96, 165, 250, 0.12)",
    border: "1px solid rgba(96, 165, 250, 0.28)",
    color: "#93c5fd",
  };
}

const bannerStyle: CSSProperties = {
  margin: "0 16px 10px",
  padding: "10px 12px",
  borderRadius: 12,
  border: "1px solid rgba(125,211,252,0.18)",
  background: "rgba(15,23,42,0.72)",
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 12,
};

const bannerEyebrowStyle: CSSProperties = {
  fontSize: 11,
  color: "#7dd3fc",
  textTransform: "uppercase",
  letterSpacing: 0.8,
  fontWeight: 700,
};

const bannerSummaryStyle: CSSProperties = {
  fontSize: 13,
  fontWeight: 600,
  marginTop: 2,
};

const bannerPreviewStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 6,
  marginTop: 8,
};

const bannerPreviewItemStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  minWidth: 0,
  padding: "3px 8px",
  borderRadius: 999,
  background: "rgba(255,255,255,0.05)",
  border: "1px solid rgba(255,255,255,0.08)",
  fontSize: 11,
};

const bannerPreviewStatusStyle: CSSProperties = {
  color: "#fbbf24",
  fontWeight: 700,
  textTransform: "uppercase",
};

const bannerPreviewPathStyle: CSSProperties = {
  color: "var(--text-dim)",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
  maxWidth: 240,
};

const bannerPreviewMoreStyle: CSSProperties = {
  fontSize: 11,
  color: "var(--text-dim)",
  alignSelf: "center",
};

const bannerButtonStyle: CSSProperties = {
  border: "1px solid rgba(125,211,252,0.22)",
  borderRadius: 999,
  background: "rgba(125,211,252,0.12)",
  color: "#dbeafe",
  fontSize: 11,
  fontWeight: 700,
  padding: "7px 12px",
  cursor: "pointer",
  flexShrink: 0,
};

const feedbackDetailStyle: CSSProperties = {
  fontSize: 11,
  opacity: 0.9,
  marginTop: 2,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};

const continueActionBtnStyle: CSSProperties = {
  border: "1px solid rgba(134,239,172,0.32)",
  borderRadius: 999,
  background: "linear-gradient(135deg, rgba(74,222,128,0.24), rgba(34,197,94,0.16))",
  color: "#dcfce7",
  fontSize: 12,
  fontWeight: 700,
  padding: "10px 14px",
  whiteSpace: "nowrap",
  boxShadow: "0 8px 18px rgba(22,163,74,0.16)",
};

const pendingApprovalButtonStyle: CSSProperties = {
  fontSize: 10,
  fontWeight: 700,
  borderRadius: 999,
  border: "1px solid rgba(251,191,36,0.3)",
  background: "rgba(251,191,36,0.08)",
  color: "#fcd34d",
  padding: "6px 10px",
  cursor: "pointer",
};

const taskWorkbenchPillStyle: CSSProperties = {
  fontSize: 10,
  fontWeight: 700,
  borderRadius: 999,
  border: "1px solid rgba(125,211,252,0.22)",
  background: "rgba(125,211,252,0.08)",
  color: "#bae6fd",
  padding: "6px 10px",
  cursor: "pointer",
};

const continueQuickActionStyle: CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  borderRadius: 999,
  border: "1px solid rgba(134,239,172,0.34)",
  background: "linear-gradient(135deg, rgba(74,222,128,0.18), rgba(34,197,94,0.1))",
  color: "#dcfce7",
  padding: "7px 12px",
  boxShadow: "0 8px 18px rgba(22,163,74,0.14)",
};