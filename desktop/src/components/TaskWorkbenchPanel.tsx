import { type CSSProperties, useMemo } from "react";
import TaskTimeline, { type TaskRunState, type TaskTimelineEntry } from "./TaskTimeline";
import PlanPanel from "./PlanPanel";
import type { AgentPlan } from "../services/agentIntelligence";
import type { DesktopRemoteApproval } from "../services/desktopSync";

export interface TaskWorkbenchEvent {
  id: string;
  title: string;
  detail?: string;
  tone: "info" | "success" | "warning" | "error";
  createdAt: number;
}

export interface TaskCheckpoint {
  sessionId: string;
  updatedAt: number;
  messageCount: number;
  lastAssistantPreview?: string;
  planStatus?: string | null;
  taskStatus?: TaskRunState;
}

interface Props {
  open: boolean;
  onClose: () => void;
  plan: AgentPlan | null;
  taskStatus: TaskRunState;
  timelineEntries: TaskTimelineEntry[];
  pendingApproval: DesktopRemoteApproval | null;
  events: TaskWorkbenchEvent[];
  checkpoint: TaskCheckpoint | null;
  onApprovePlan: () => void | Promise<void>;
  onRejectPlan: () => void | Promise<void>;
  onOpenApprovals: () => void;
  onResumeFromCheckpoint: () => void;
}

const toneColor: Record<TaskWorkbenchEvent["tone"], string> = {
  info: "#7dd3fc",
  success: "#86efac",
  warning: "#fbbf24",
  error: "#fca5a5",
};

export default function TaskWorkbenchPanel({
  open,
  onClose,
  plan,
  taskStatus,
  timelineEntries,
  pendingApproval,
  events,
  checkpoint,
  onApprovePlan,
  onRejectPlan,
  onOpenApprovals,
  onResumeFromCheckpoint,
}: Props) {
  const hasActiveWork = taskStatus !== "idle" || timelineEntries.length > 0 || Boolean(plan) || Boolean(pendingApproval);
  const sortedEvents = useMemo(
    () => [...events].sort((left, right) => right.createdAt - left.createdAt).slice(0, 10),
    [events],
  );

  if (!open) {
    return null;
  }

  return (
    <div style={overlay} onClick={onClose}>
      <div style={panel} onClick={(event) => event.stopPropagation()}>
        <div style={header}>
          <div>
            <div style={eyebrow}>Task Workbench</div>
            <div style={title}>Plan, approvals, timeline, checkpoint</div>
          </div>
          <button onClick={onClose} style={closeButton}>✕</button>
        </div>

        {pendingApproval && (
          <div style={approvalCard}>
            <div>
              <div style={approvalTitle}>Approval pending · {pendingApproval.riskLevel}</div>
              <div style={approvalText}>{pendingApproval.title}</div>
              <div style={approvalSubtle}>{pendingApproval.description}</div>
            </div>
            <button onClick={onOpenApprovals} style={approvalAction}>Review</button>
          </div>
        )}

        {checkpoint && (
          <div style={checkpointCard}>
            <div style={sectionTitle}>Checkpoint</div>
            <div style={checkpointGrid}>
              <div>
                <div style={metricLabel}>Session</div>
                <div style={metricValue}>{checkpoint.sessionId}</div>
              </div>
              <div>
                <div style={metricLabel}>Messages</div>
                <div style={metricValue}>{checkpoint.messageCount}</div>
              </div>
              <div>
                <div style={metricLabel}>Updated</div>
                <div style={metricValue}>{formatRelativeTime(checkpoint.updatedAt)}</div>
              </div>
              <div>
                <div style={metricLabel}>Plan</div>
                <div style={metricValue}>{checkpoint.planStatus || "none"}</div>
              </div>
            </div>
            {checkpoint.lastAssistantPreview && (
              <div style={checkpointPreview}>{checkpoint.lastAssistantPreview}</div>
            )}
            <button onClick={onResumeFromCheckpoint} style={resumeButton}>Resume From Checkpoint</button>
          </div>
        )}

        <div style={content}>
          <div style={column}>
            <div style={sectionTitle}>Execution Timeline</div>
            {hasActiveWork ? (
              <TaskTimeline status={taskStatus} entries={timelineEntries} />
            ) : (
              <div style={emptyCard}>No active task timeline for this session yet.</div>
            )}
          </div>

          <div style={column}>
            <div style={sectionTitle}>Plan Control</div>
            {plan ? (
              <PlanPanel plan={plan} onApprove={onApprovePlan} onReject={onRejectPlan} />
            ) : (
              <div style={emptyCard}>No active plan for this session.</div>
            )}

            <div style={sectionTitle}>Recent Events</div>
            {sortedEvents.length === 0 ? (
              <div style={emptyCard}>Task, subtask, and wake-back events will appear here.</div>
            ) : (
              <div style={eventList}>
                {sortedEvents.map((event) => (
                  <div key={event.id} style={eventCard}>
                    <span style={{ ...eventDot, background: toneColor[event.tone] }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={eventTitle}>{event.title}</div>
                      {event.detail && <div style={eventDetail}>{event.detail}</div>}
                    </div>
                    <div style={eventTime}>{formatRelativeTime(event.createdAt)}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function formatRelativeTime(timestamp: number) {
  const delta = Math.max(0, Date.now() - timestamp);
  if (delta < 60_000) return "just now";
  if (delta < 3_600_000) return `${Math.round(delta / 60_000)}m ago`;
  if (delta < 86_400_000) return `${Math.round(delta / 3_600_000)}h ago`;
  return new Date(timestamp).toLocaleString();
}

const overlay: CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(4, 8, 18, 0.62)",
  display: "flex",
  justifyContent: "center",
  alignItems: "center",
  padding: 24,
  zIndex: 60,
};

const panel: CSSProperties = {
  width: "min(1180px, calc(100vw - 32px))",
  maxHeight: "calc(100vh - 32px)",
  overflow: "auto",
  borderRadius: 22,
  background: "linear-gradient(180deg, rgba(12,17,30,0.98), rgba(8,12,22,0.98))",
  border: "1px solid rgba(125,211,252,0.16)",
  boxShadow: "0 30px 80px rgba(0,0,0,0.45)",
  padding: 22,
  display: "flex",
  flexDirection: "column",
  gap: 18,
};

const header: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-start",
  gap: 12,
};

const eyebrow: CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  letterSpacing: 1.1,
  textTransform: "uppercase",
  color: "#7dd3fc",
};

const title: CSSProperties = {
  fontSize: 22,
  fontWeight: 700,
  color: "#f8fafc",
  marginTop: 4,
};

const closeButton: CSSProperties = {
  border: "1px solid rgba(255,255,255,0.12)",
  background: "rgba(255,255,255,0.04)",
  color: "#e2e8f0",
  width: 34,
  height: 34,
  borderRadius: 999,
  cursor: "pointer",
};

const content: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "minmax(0, 1.3fr) minmax(320px, 0.9fr)",
  gap: 18,
};

const column: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 12,
};

const sectionTitle: CSSProperties = {
  fontSize: 12,
  fontWeight: 700,
  color: "#cbd5e1",
  textTransform: "uppercase",
  letterSpacing: 0.8,
};

const approvalCard: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 12,
  padding: 14,
  borderRadius: 16,
  background: "rgba(251,191,36,0.08)",
  border: "1px solid rgba(251,191,36,0.22)",
};

const approvalTitle: CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  color: "#fbbf24",
  textTransform: "uppercase",
  letterSpacing: 0.8,
};

const approvalText: CSSProperties = {
  fontSize: 14,
  fontWeight: 600,
  color: "#f8fafc",
  marginTop: 4,
};

const approvalSubtle: CSSProperties = {
  fontSize: 12,
  color: "#cbd5e1",
  marginTop: 4,
};

const approvalAction: CSSProperties = {
  border: "none",
  borderRadius: 999,
  padding: "10px 14px",
  background: "#f59e0b",
  color: "#111827",
  fontWeight: 700,
  cursor: "pointer",
};

const checkpointCard: CSSProperties = {
  padding: 16,
  borderRadius: 16,
  background: "rgba(125,211,252,0.07)",
  border: "1px solid rgba(125,211,252,0.18)",
  display: "flex",
  flexDirection: "column",
  gap: 12,
};

const checkpointGrid: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
  gap: 10,
};

const metricLabel: CSSProperties = {
  fontSize: 10,
  color: "#94a3b8",
  textTransform: "uppercase",
  letterSpacing: 0.7,
};

const metricValue: CSSProperties = {
  fontSize: 13,
  fontWeight: 600,
  color: "#f8fafc",
  marginTop: 3,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};

const checkpointPreview: CSSProperties = {
  fontSize: 12,
  lineHeight: 1.5,
  color: "#cbd5e1",
  padding: 12,
  borderRadius: 12,
  background: "rgba(255,255,255,0.03)",
  border: "1px solid rgba(255,255,255,0.06)",
};

const resumeButton: CSSProperties = {
  alignSelf: "flex-start",
  border: "none",
  borderRadius: 999,
  padding: "10px 14px",
  background: "#38bdf8",
  color: "#082f49",
  fontWeight: 700,
  cursor: "pointer",
};

const emptyCard: CSSProperties = {
  borderRadius: 14,
  padding: 14,
  background: "rgba(255,255,255,0.03)",
  border: "1px solid rgba(255,255,255,0.06)",
  color: "#94a3b8",
  fontSize: 12,
};

const eventList: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 8,
};

const eventCard: CSSProperties = {
  display: "flex",
  alignItems: "flex-start",
  gap: 10,
  padding: 12,
  borderRadius: 14,
  background: "rgba(255,255,255,0.03)",
  border: "1px solid rgba(255,255,255,0.06)",
};

const eventDot: CSSProperties = {
  width: 9,
  height: 9,
  borderRadius: 999,
  marginTop: 5,
  flexShrink: 0,
};

const eventTitle: CSSProperties = {
  fontSize: 13,
  fontWeight: 600,
  color: "#f8fafc",
};

const eventDetail: CSSProperties = {
  fontSize: 12,
  lineHeight: 1.45,
  color: "#94a3b8",
  marginTop: 3,
};

const eventTime: CSSProperties = {
  fontSize: 10,
  color: "#64748b",
  flexShrink: 0,
  marginTop: 2,
};