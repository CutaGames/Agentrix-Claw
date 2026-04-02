import { type CSSProperties, useState, useMemo } from "react";
import type { ApprovalRiskLevel } from "../services/desktop";

export type TaskRunState = "idle" | "executing" | "need-approve" | "completed" | "failed";
export type TaskTimelineStatus = "running" | "waiting-approval" | "completed" | "failed" | "rejected";

export interface TaskTimelineEntry {
  id: string;
  title: string;
  detail?: string;
  kind: string;
  riskLevel: ApprovalRiskLevel;
  status: TaskTimelineStatus;
  startedAt: number;
  finishedAt?: number;
  output?: string;
}

interface Props {
  status: TaskRunState;
  entries: TaskTimelineEntry[];
}

const statusLabel: Record<TaskRunState, string> = {
  idle: "Idle",
  executing: "Executing",
  "need-approve": "Need Approval",
  completed: "Completed",
  failed: "Failed",
};

const statusColor: Record<TaskRunState, string> = {
  idle: "var(--text-dim)",
  executing: "#7dd3fc",
  "need-approve": "#fbbf24",
  completed: "#86efac",
  failed: "#fca5a5",
};

const stepIcon: Record<TaskTimelineStatus, string> = {
  running: "⏳",
  "waiting-approval": "🔐",
  completed: "✅",
  failed: "❌",
  rejected: "🚫",
};

const stepColor: Record<TaskTimelineStatus, string> = {
  running: "#7dd3fc",
  "waiting-approval": "#fbbf24",
  completed: "#86efac",
  failed: "#fca5a5",
  rejected: "#fda4af",
};

// Categorize low-level operations into high-level task groups
const KIND_GROUPS: Record<string, string> = {
  read_file: "📖 Analyzing code",
  list_directory: "📖 Analyzing code",
  search_files: "📖 Analyzing code",
  write_file: "✏️ Modifying files",
  create_file: "✏️ Modifying files",
  delete_file: "✏️ Modifying files",
  run_command: "⚡ Running commands",
  execute_command: "⚡ Running commands",
  git_status: "🔀 Git operations",
  git_diff: "🔀 Git operations",
  git_commit: "🔀 Git operations",
  git_branch_list: "🔀 Git operations",
  screen_capture: "📸 Screen capture",
  open_browser: "🌐 Browser actions",
  // P1: SubAgent operations
  agent_spawn: "🤖 Sub-Agent",
  agent_result: "🤖 Sub-Agent",
  agent_invoke: "🤖 Sub-Agent",
  // P1: Web search
  web_search: "🌐 Web search",
  tavily_search: "🌐 Web search",
  // P1: Memory operations
  memory_read: "🧠 Memory",
  memory_write: "🧠 Memory",
  memory_search: "🧠 Memory",
  rag_search: "🧠 Memory",
};

interface TaskGroup {
  label: string;
  entries: TaskTimelineEntry[];
  status: TaskTimelineStatus;
}

function groupEntries(entries: TaskTimelineEntry[]): TaskGroup[] {
  const groups: TaskGroup[] = [];
  let currentLabel = "";
  let currentEntries: TaskTimelineEntry[] = [];

  for (const entry of entries) {
    const label = KIND_GROUPS[entry.kind] || `🔧 ${entry.kind}`;
    if (label !== currentLabel && currentEntries.length > 0) {
      groups.push({
        label: currentLabel,
        entries: currentEntries,
        status: deriveGroupStatus(currentEntries),
      });
      currentEntries = [];
    }
    currentLabel = label;
    currentEntries.push(entry);
  }

  if (currentEntries.length > 0) {
    groups.push({
      label: currentLabel,
      entries: currentEntries,
      status: deriveGroupStatus(currentEntries),
    });
  }

  return groups;
}

function deriveGroupStatus(entries: TaskTimelineEntry[]): TaskTimelineStatus {
  if (entries.some(e => e.status === "failed")) return "failed";
  if (entries.some(e => e.status === "waiting-approval")) return "waiting-approval";
  if (entries.some(e => e.status === "running")) return "running";
  if (entries.every(e => e.status === "completed")) return "completed";
  return "running";
}

export default function TaskTimeline({ status, entries }: Props) {
  const [expandedGroups, setExpandedGroups] = useState<Set<number>>(new Set());
  const groups = useMemo(() => groupEntries(entries), [entries]);

  const toggleGroup = (idx: number) => {
    setExpandedGroups(prev => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  };

  const totalDone = entries.filter(e => e.status === "completed").length;
  const progress = entries.length > 0 ? Math.round((totalDone / entries.length) * 100) : 0;
  const hasSubAgents = entries.some(e => e.kind === "agent_spawn" || e.kind === "agent_invoke" || e.kind === "agent_result");

  return (
    <div style={container}>
      {/* Header */}
      <div style={headerRow}>
        <div>
          <div style={{ fontSize: 11, color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: 0.6 }}>
            Task Progress
          </div>
          <div style={{ fontSize: 13, fontWeight: 600 }}>
            {status === "executing" ? "Agent is working..." : statusLabel[status]}
          </div>
        </div>
        <div style={{ ...statusBadge, color: statusColor[status], borderColor: `${statusColor[status]}55` }}>
          {status === "executing" && (
            <span style={{
              display: "inline-block", width: 8, height: 8, marginRight: 4,
              border: "2px solid rgba(125,211,252,0.3)", borderTopColor: "#7dd3fc",
              borderRadius: "50%", animation: "spin-slow 0.8s linear infinite",
            }} />
          )}
          {statusLabel[status]}
        </div>
      </div>

      {/* Progress bar */}
      {entries.length > 0 && (
        <div style={progressBarOuter}>
          <div style={{ ...progressBarInner, width: `${progress}%` }} />
          <span style={progressLabel}>
            {totalDone}/{entries.length}
            {hasSubAgents && " · 🤖 Sub-Agents active"}
          </span>
        </div>
      )}

      {entries.length === 0 ? (
        <div style={emptyState}>
          Task plan and execution progress will appear here.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {groups.map((group, gIdx) => {
            const isExpanded = expandedGroups.has(gIdx);
            return (
              <div key={gIdx} style={groupCard}>
                {/* Group header (click to expand details) */}
                <div
                  style={groupHeaderStyle}
                  onClick={() => toggleGroup(gIdx)}
                >
                  <span style={{ ...dot, background: stepColor[group.status] }} />
                  <span style={{ flex: 1, fontSize: 12, fontWeight: 600 }}>
                    {group.label}
                  </span>
                  <span style={{ fontSize: 10, color: "var(--text-dim)" }}>
                    {group.entries.length} step{group.entries.length > 1 ? "s" : ""}
                  </span>
                  <span style={{ fontSize: 10, color: "var(--text-dim)", marginLeft: 4 }}>
                    {isExpanded ? "▼" : "▶"}
                  </span>
                </div>

                {/* Expanded detail steps */}
                {isExpanded && (
                  <div style={{ paddingLeft: 20, display: "flex", flexDirection: "column", gap: 4, marginTop: 4 }}>
                    {group.entries.map((entry) => (
                      <div key={entry.id} style={detailStepStyle}>
                        <span style={{ fontSize: 11, flexShrink: 0 }}>{stepIcon[entry.status]}</span>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 11, fontWeight: 500 }}>{entry.title}</div>
                          {entry.detail && (
                            <div style={{ fontSize: 10, color: "var(--text-dim)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                              {entry.detail}
                            </div>
                          )}
                        </div>
                        <span style={{ fontSize: 9, color: "var(--text-dim)", flexShrink: 0 }}>
                          {formatDuration(entry)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function formatDuration(entry: TaskTimelineEntry) {
  const durationMs = (entry.finishedAt || Date.now()) - entry.startedAt;
  if (durationMs < 1000) return `${durationMs}ms`;
  if (durationMs < 60_000) return `${(durationMs / 1000).toFixed(1)}s`;
  return `${(durationMs / 60_000).toFixed(1)}m`;
}

const container: CSSProperties = {
  padding: "10px 12px",
  borderBottom: "1px solid var(--border)",
  background: "rgba(255,255,255,0.03)",
  display: "flex",
  flexDirection: "column",
  gap: 10,
};

const headerRow: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 12,
};

const statusBadge: CSSProperties = {
  fontSize: 11,
  fontWeight: 600,
  padding: "4px 8px",
  borderRadius: 999,
  border: "1px solid var(--border)",
  background: "rgba(255,255,255,0.03)",
  display: "flex",
  alignItems: "center",
};

const progressBarOuter: CSSProperties = {
  height: 4,
  borderRadius: 2,
  background: "rgba(255,255,255,0.06)",
  position: "relative",
  overflow: "hidden",
};

const progressBarInner: CSSProperties = {
  height: "100%",
  borderRadius: 2,
  background: "linear-gradient(90deg, #6C5CE7, #a78bfa)",
  transition: "width 0.4s ease",
};

const progressLabel: CSSProperties = {
  position: "absolute",
  right: 0,
  top: -14,
  fontSize: 9,
  color: "var(--text-dim)",
};

const emptyState: CSSProperties = {
  fontSize: 12,
  color: "var(--text-dim)",
  lineHeight: 1.5,
};

const groupCard: CSSProperties = {
  border: "1px solid var(--border)",
  borderRadius: 10,
  padding: "8px 10px",
  background: "rgba(255,255,255,0.03)",
};

const groupHeaderStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  cursor: "pointer",
  userSelect: "none",
};

const dot: CSSProperties = {
  width: 8,
  height: 8,
  borderRadius: "50%",
  flexShrink: 0,
};

const detailStepStyle: CSSProperties = {
  display: "flex",
  alignItems: "flex-start",
  gap: 6,
  padding: "3px 0",
  borderTop: "1px solid rgba(255,255,255,0.03)",
};