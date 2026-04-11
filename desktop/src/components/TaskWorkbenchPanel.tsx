import { type CSSProperties, useMemo, useState } from "react";
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

interface PlaybackItem {
  id: string;
  title: string;
  detail?: string;
  createdAt: number;
  tone: TaskWorkbenchEvent["tone"];
  source: "timeline" | "event" | "checkpoint";
  statusLabel?: string;
  output?: string;
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
  const [selectedPlaybackId, setSelectedPlaybackId] = useState<string | null>(null);
  const sortedEvents = useMemo(
    () => [...events].sort((left, right) => right.createdAt - left.createdAt).slice(0, 10),
    [events],
  );
  const timelineStats = useMemo(() => {
    const counts = timelineEntries.reduce(
      (acc, entry) => {
        acc.total += 1;
        if (entry.status === "running") acc.running += 1;
        if (entry.status === "waiting-approval") acc.waiting += 1;
        if (entry.status === "completed") acc.completed += 1;
        if (entry.status === "failed" || entry.status === "rejected") acc.failed += 1;
        return acc;
      },
      { total: 0, running: 0, waiting: 0, completed: 0, failed: 0 },
    );

    const activeEntry = [...timelineEntries].reverse().find((entry) => entry.status === "running" || entry.status === "waiting-approval")
      || timelineEntries[timelineEntries.length - 1]
      || null;
    const laneCount = new Set(timelineEntries.map((entry) => entry.kind)).size;

    return { counts, activeEntry, laneCount };
  }, [timelineEntries]);
  const playbackItems = useMemo<PlaybackItem[]>(() => {
    const checkpointTone: PlaybackItem["tone"] = checkpoint?.taskStatus === "failed"
      ? "error"
      : checkpoint?.taskStatus === "completed"
        ? "success"
        : "info";
    const checkpointItem: PlaybackItem[] = checkpoint
      ? [{
          id: `checkpoint-${checkpoint.updatedAt}`,
          title: "Checkpoint captured",
          detail: checkpoint.lastAssistantPreview || `Session ${checkpoint.sessionId} checkpoint is available for resume-safe recovery.`,
          createdAt: checkpoint.updatedAt,
          tone: checkpointTone,
          source: "checkpoint" as const,
          statusLabel: checkpoint.planStatus || checkpoint.taskStatus || "idle",
          output: checkpoint.lastAssistantPreview,
        }]
      : [];

    const timelineItems = timelineEntries.map<PlaybackItem>((entry) => ({
      id: `timeline-${entry.id}`,
      title: entry.title,
      detail: entry.detail,
      createdAt: entry.finishedAt || entry.startedAt,
      tone: entry.status === "failed" || entry.status === "rejected"
        ? "error"
        : entry.status === "waiting-approval"
          ? "warning"
          : entry.status === "completed"
            ? "success"
            : "info",
      source: "timeline",
      statusLabel: entry.status,
      output: entry.output,
    }));

    const eventItems = sortedEvents.map<PlaybackItem>((event) => ({
      id: `event-${event.id}`,
      title: event.title,
      detail: event.detail,
      createdAt: event.createdAt,
      tone: event.tone,
      source: "event",
      statusLabel: "signal",
      output: event.detail,
    }));

    return [...checkpointItem, ...timelineItems, ...eventItems]
      .sort((left, right) => right.createdAt - left.createdAt)
      .slice(0, 18);
  }, [checkpoint, sortedEvents, timelineEntries]);
  const selectedPlayback = playbackItems.find((item) => item.id === selectedPlaybackId) || playbackItems[0] || null;

  if (!open) {
    return null;
  }

  return (
    <div style={overlay} onClick={onClose}>
      <div style={panel} onClick={(event) => event.stopPropagation()}>
        <div style={header}>
          <div>
            <div style={eyebrow}>Task Workbench</div>
            <div style={title}>Plan, approvals, playback, checkpoint</div>
          </div>
          <button onClick={onClose} style={closeButton}>✕</button>
        </div>

        <div style={overviewGrid}>
          <div style={overviewCard}>
            <div style={overviewLabel}>Run Status</div>
            <div style={overviewValue}>{taskStatus.replace(/-/g, " ")}</div>
            <div style={overviewSubtle}>{timelineStats.activeEntry?.title || "Waiting for the next task signal."}</div>
          </div>
          <div style={overviewCard}>
            <div style={overviewLabel}>Timeline</div>
            <div style={overviewValue}>{timelineStats.counts.completed}/{timelineStats.counts.total || 0}</div>
            <div style={overviewSubtle}>
              {timelineStats.counts.running} running · {timelineStats.counts.waiting} waiting · {timelineStats.counts.failed} failed
            </div>
          </div>
          <div style={overviewCard}>
            <div style={overviewLabel}>Parallel Lanes</div>
            <div style={overviewValue}>{timelineStats.laneCount || 0}</div>
            <div style={overviewSubtle}>{sortedEvents.length} recent signals available for playback.</div>
          </div>
          <div style={overviewCard}>
            <div style={overviewLabel}>Checkpoint</div>
            <div style={overviewValue}>{checkpoint ? formatRelativeTime(checkpoint.updatedAt) : "missing"}</div>
            <div style={overviewSubtle}>{checkpoint ? `${checkpoint.messageCount} messages captured` : "No server-backed checkpoint yet."}</div>
          </div>
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
          {!hasActiveWork && sortedEvents.length === 0 && !checkpoint && (
            <div style={onboardingCard}>
              <div style={onboardingTitle}>Welcome to Task Workbench</div>
              <div style={onboardingDesc}>
                This is your mission control for multi-step agent tasks. Here's how it works:
              </div>
              <div style={onboardingSteps}>
                <div style={onboardingStep}>
                  <span style={onboardingStepNum}>1</span>
                  <div>
                    <div style={onboardingStepTitle}>Start a Task</div>
                    <div style={onboardingStepDesc}>Ask your agent to do something complex — e.g. "refactor the auth module" or "research competitors and write a report".</div>
                  </div>
                </div>
                <div style={onboardingStep}>
                  <span style={onboardingStepNum}>2</span>
                  <div>
                    <div style={onboardingStepTitle}>Watch the Timeline</div>
                    <div style={onboardingStepDesc}>Each sub-task appears on the execution timeline with real-time status, parallel lanes, and output logs.</div>
                  </div>
                </div>
                <div style={onboardingStep}>
                  <span style={onboardingStepNum}>3</span>
                  <div>
                    <div style={onboardingStepTitle}>Review &amp; Approve</div>
                    <div style={onboardingStepDesc}>Risky actions require your approval. The plan panel shows what the agent intends to do before it executes.</div>
                  </div>
                </div>
                <div style={onboardingStep}>
                  <span style={onboardingStepNum}>4</span>
                  <div>
                    <div style={onboardingStepTitle}>Playback &amp; Resume</div>
                    <div style={onboardingStepDesc}>Checkpoints let you rewind and resume from any saved state. Playback shows the full history of decisions.</div>
                  </div>
                </div>
              </div>
            </div>
          )}
          <div style={column}>
            <div style={sectionTitle}>Execution Timeline</div>
            {hasActiveWork ? (
              <TaskTimeline status={taskStatus} entries={timelineEntries} />
            ) : (
              <div style={emptyCard}>No active task timeline for this session yet.</div>
            )}

            <div style={sectionTitle}>Run Playback</div>
            {playbackItems.length === 0 ? (
              <div style={emptyCard}>Timeline steps, wake-backs, and checkpoint snapshots will appear here once the task starts moving.</div>
            ) : (
              <div style={playbackShell}>
                <div style={playbackList}>
                  {playbackItems.map((item) => {
                    const active = selectedPlayback?.id === item.id;
                    return (
                      <button
                        key={item.id}
                        onClick={() => setSelectedPlaybackId(item.id)}
                        style={{
                          ...playbackItemButton,
                          borderColor: active ? `${toneColor[item.tone]}55` : "rgba(255,255,255,0.06)",
                          background: active ? "rgba(125,211,252,0.08)" : "rgba(255,255,255,0.02)",
                        }}
                      >
                        <div style={playbackItemMeta}>
                          <span style={{ ...playbackSourceChip, color: toneColor[item.tone], borderColor: `${toneColor[item.tone]}44` }}>
                            {item.source}
                          </span>
                          <span style={playbackTime}>{formatRelativeTime(item.createdAt)}</span>
                        </div>
                        <div style={playbackTitle}>{item.title}</div>
                        {item.detail && <div style={playbackDetailPreview}>{item.detail}</div>}
                      </button>
                    );
                  })}
                </div>

                {selectedPlayback && (
                  <div style={playbackDetailCard}>
                    <div style={playbackDetailHeader}>
                      <div>
                        <div style={playbackDetailEyebrow}>{selectedPlayback.source}</div>
                        <div style={playbackDetailTitle}>{selectedPlayback.title}</div>
                      </div>
                      <div style={{ ...playbackSourceChip, color: toneColor[selectedPlayback.tone], borderColor: `${toneColor[selectedPlayback.tone]}44` }}>
                        {selectedPlayback.statusLabel || "detail"}
                      </div>
                    </div>
                    <div style={playbackDetailMeta}>Recorded {formatRelativeTime(selectedPlayback.createdAt)}</div>
                    {selectedPlayback.detail && (
                      <div style={playbackNarrative}>{selectedPlayback.detail}</div>
                    )}
                    {selectedPlayback.output && (
                      <pre style={playbackOutput}>{selectedPlayback.output}</pre>
                    )}
                  </div>
                )}
              </div>
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

const overviewGrid: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
  gap: 12,
};

const overviewCard: CSSProperties = {
  borderRadius: 16,
  padding: 14,
  background: "rgba(255,255,255,0.03)",
  border: "1px solid rgba(255,255,255,0.06)",
  minWidth: 0,
};

const overviewLabel: CSSProperties = {
  fontSize: 10,
  color: "#94a3b8",
  textTransform: "uppercase",
  letterSpacing: 0.8,
};

const overviewValue: CSSProperties = {
  marginTop: 8,
  fontSize: 22,
  fontWeight: 700,
  color: "#f8fafc",
  textTransform: "capitalize",
};

const overviewSubtle: CSSProperties = {
  marginTop: 6,
  fontSize: 12,
  lineHeight: 1.45,
  color: "#94a3b8",
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

const onboardingCard: CSSProperties = {
  gridColumn: "1 / -1",
  borderRadius: 16,
  padding: "20px 24px",
  background: "linear-gradient(135deg, rgba(125,211,252,0.06), rgba(134,239,172,0.04))",
  border: "1px solid rgba(125,211,252,0.18)",
};

const onboardingTitle: CSSProperties = {
  fontSize: 16,
  fontWeight: 700,
  color: "#e2e8f0",
  marginBottom: 6,
};

const onboardingDesc: CSSProperties = {
  fontSize: 13,
  color: "#94a3b8",
  marginBottom: 16,
};

const onboardingSteps: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr 1fr",
  gap: 12,
};

const onboardingStep: CSSProperties = {
  display: "flex",
  gap: 10,
  alignItems: "flex-start",
  padding: 12,
  borderRadius: 10,
  background: "rgba(255,255,255,0.03)",
  border: "1px solid rgba(255,255,255,0.06)",
};

const onboardingStepNum: CSSProperties = {
  width: 22,
  height: 22,
  borderRadius: "50%",
  background: "rgba(125,211,252,0.15)",
  color: "#7dd3fc",
  fontSize: 12,
  fontWeight: 700,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  flexShrink: 0,
};

const onboardingStepTitle: CSSProperties = {
  fontSize: 13,
  fontWeight: 600,
  color: "#e2e8f0",
  marginBottom: 2,
};

const onboardingStepDesc: CSSProperties = {
  fontSize: 11,
  color: "#94a3b8",
  lineHeight: 1.4,
};

const playbackShell: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "minmax(250px, 0.9fr) minmax(0, 1.1fr)",
  gap: 12,
};

const playbackList: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 8,
  maxHeight: 420,
  overflowY: "auto",
  paddingRight: 4,
};

const playbackItemButton: CSSProperties = {
  textAlign: "left",
  borderRadius: 14,
  border: "1px solid rgba(255,255,255,0.06)",
  padding: 12,
  cursor: "pointer",
  color: "#f8fafc",
};

const playbackItemMeta: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 8,
};

const playbackSourceChip: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  borderRadius: 999,
  border: "1px solid rgba(125,211,252,0.25)",
  padding: "3px 8px",
  fontSize: 10,
  textTransform: "uppercase",
  letterSpacing: 0.7,
};

const playbackTime: CSSProperties = {
  fontSize: 10,
  color: "#64748b",
  flexShrink: 0,
};

const playbackTitle: CSSProperties = {
  marginTop: 8,
  fontSize: 13,
  fontWeight: 600,
  color: "#f8fafc",
};

const playbackDetailPreview: CSSProperties = {
  marginTop: 5,
  fontSize: 11,
  lineHeight: 1.4,
  color: "#94a3b8",
  display: "-webkit-box",
  WebkitLineClamp: 2,
  WebkitBoxOrient: "vertical",
  overflow: "hidden",
};

const playbackDetailCard: CSSProperties = {
  borderRadius: 16,
  border: "1px solid rgba(125,211,252,0.14)",
  background: "rgba(8,12,22,0.72)",
  padding: 16,
  display: "flex",
  flexDirection: "column",
  gap: 10,
  minWidth: 0,
};

const playbackDetailHeader: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-start",
  gap: 12,
};

const playbackDetailEyebrow: CSSProperties = {
  fontSize: 10,
  textTransform: "uppercase",
  letterSpacing: 0.8,
  color: "#7dd3fc",
};

const playbackDetailTitle: CSSProperties = {
  marginTop: 4,
  fontSize: 16,
  fontWeight: 700,
  color: "#f8fafc",
};

const playbackDetailMeta: CSSProperties = {
  fontSize: 11,
  color: "#64748b",
};

const playbackNarrative: CSSProperties = {
  fontSize: 13,
  lineHeight: 1.55,
  color: "#cbd5e1",
};

const playbackOutput: CSSProperties = {
  margin: 0,
  padding: 12,
  borderRadius: 12,
  background: "rgba(255,255,255,0.03)",
  border: "1px solid rgba(255,255,255,0.06)",
  color: "#e2e8f0",
  whiteSpace: "pre-wrap",
  wordBreak: "break-word",
  fontSize: 11,
  lineHeight: 1.5,
  maxHeight: 260,
  overflowY: "auto",
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