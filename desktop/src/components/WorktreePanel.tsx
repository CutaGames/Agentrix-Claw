import { useEffect, useState, type CSSProperties } from "react";
import { runDesktopCommand, type DesktopCommandResult } from "../services/desktop";
import { gitBranchList, gitStatus, type GitStatusResult } from "../services/git";
import { getWorkspaceDir } from "../services/workspace";
import AgentIdentityCard from "./AgentIdentityCard";

type LaneStatus = "idle" | "running" | "review" | "blocked";

interface WorktreeCommandState {
  command: string;
  worktreePath: string;
  stdout: string;
  stderr: string;
  exitCode?: number | null;
  timedOut: boolean;
  durationMs: number;
  succeeded: boolean;
}

interface WorktreeLane {
  id: string;
  agent: string;
  baseBranch: string;
  worktreeBranch: string;
  worktreeDirectory: string;
  mission: string;
  focusFiles: string;
  status: LaneStatus;
  updatedAt: number;
  worktreePath?: string;
  lastCommand?: WorktreeCommandState;
  /**
   * Multi-agent v1 W1 (2026-05-26) — optional binding to an
   * AgentAccount.id. NULL for human-owned lanes;auto-set when a
   * sub-task creates the lane (W2 will populate). UI renders an
   * Agent_Identity_Card next to the lane row when set.
   */
  agentId?: string | null;
  /** ID of the agent_tasks row that created this lane (W2 will populate). */
  agentTaskId?: string | null;
}

interface Props {
  open: boolean;
  onClose: () => void;
}

const STORAGE_KEY = "agentrix_desktop_worktree_board_v1";
const AGENT_OPTIONS = ["Architect", "Builder", "Reviewer", "Ops"];
const STATUS_META: Record<LaneStatus, { label: string; accent: string; tint: string }> = {
  idle: { label: "Idle", accent: "#94a3b8", tint: "var(--border-subtle)" },
  running: { label: "Running", accent: "#38bdf8", tint: "rgba(56,189,248,0.12)" },
  review: { label: "In review", accent: "#fbbf24", tint: "var(--tone-warning-bg)" },
  blocked: { label: "Blocked", accent: "#f87171", tint: "var(--tone-danger-bg)" },
};

function sanitizeBranchName(value: string) {
  return value.replace(/^\*\s*/, "").trim();
}

function sanitizeWorktreeBranch(value: string) {
  return sanitizeBranchName(value)
    .replace(/[^a-zA-Z0-9._/-]+/g, "-")
    .replace(/\/{2,}/g, "/")
    .replace(/^[-/.]+|[-/.]+$/g, "") || "lane";
}

function sanitizeDirectoryName(value: string) {
  return value.trim().replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "worktree";
}

function isLaneStatus(value: unknown): value is LaneStatus {
  return value === "idle" || value === "running" || value === "review" || value === "blocked";
}

function toSlugSegment(value: string) {
  return sanitizeWorktreeBranch(value).replace(/\//g, "-").toLowerCase();
}

function ensureUniqueValue(baseValue: string, existingValues: string[]) {
  const normalizedExisting = new Set(existingValues.map((value) => value.toLowerCase()));
  let candidate = baseValue;
  let counter = 2;
  while (normalizedExisting.has(candidate.toLowerCase())) {
    candidate = `${baseValue}-${counter}`;
    counter += 1;
  }
  return candidate;
}

function buildDefaultWorktreeBranch(agent: string, baseBranch: string) {
  return `lanes/${toSlugSegment(agent)}/${toSlugSegment(baseBranch.replace(/^origin\//, ""))}`;
}

function buildDefaultWorktreeDirectory(worktreeBranch: string) {
  return `worktree-${sanitizeDirectoryName(worktreeBranch.replace(/\//g, "-"))}`;
}

function buildDraftDefaults(agent: string, baseBranch: string, lanes: WorktreeLane[], excludeLaneId?: string) {
  if (!baseBranch) {
    return { worktreeBranch: "", worktreeDirectory: "" };
  }

  const laneScope = lanes.filter((lane) => lane.id !== excludeLaneId);
  const worktreeBranch = ensureUniqueValue(
    buildDefaultWorktreeBranch(agent, baseBranch),
    laneScope.map((lane) => lane.worktreeBranch),
  );
  const worktreeDirectory = ensureUniqueValue(
    buildDefaultWorktreeDirectory(worktreeBranch),
    laneScope.map((lane) => lane.worktreeDirectory),
  );
  return { worktreeBranch, worktreeDirectory };
}

function useWindowsSeparators(path: string | null | undefined) {
  return Boolean(path && path.includes("\\"));
}

function buildRelativeWorktreePath(worktreeDirectory: string, workspaceDir?: string | null) {
  const separator = useWindowsSeparators(workspaceDir) ? "\\" : "/";
  return `..${separator}${sanitizeDirectoryName(worktreeDirectory)}`;
}

function resolveWorktreePath(workspaceDir: string, worktreeDirectory: string) {
  const separator = useWindowsSeparators(workspaceDir) ? "\\" : "/";
  const normalized = workspaceDir.replace(/[\\/]+$/, "");
  const cutIndex = Math.max(normalized.lastIndexOf("\\"), normalized.lastIndexOf("/"));
  const parentDir = cutIndex >= 0 ? normalized.slice(0, cutIndex) : normalized;
  return `${parentDir}${separator}${sanitizeDirectoryName(worktreeDirectory)}`;
}

function quoteCommandArg(value: string) {
  return `"${value.replace(/"/g, "")}"`;
}

function buildWorktreePreview(baseBranch: string, worktreeBranch: string, worktreeDirectory: string, workspaceDir?: string | null) {
  const targetPath = buildRelativeWorktreePath(worktreeDirectory, workspaceDir);
  return `git worktree add ${quoteCommandArg(targetPath)} -b ${quoteCommandArg(sanitizeWorktreeBranch(worktreeBranch))} ${quoteCommandArg(sanitizeBranchName(baseBranch))}`;
}

function normalizeLane(rawLane: Partial<WorktreeLane & { branch?: string }> | null | undefined, index: number): WorktreeLane {
  const agent = typeof rawLane?.agent === "string" && rawLane.agent.trim() ? rawLane.agent : AGENT_OPTIONS[0];
  const baseBranch = sanitizeBranchName(typeof rawLane?.baseBranch === "string" ? rawLane.baseBranch : typeof rawLane?.branch === "string" ? rawLane.branch : "");
  const draftDefaults = buildDraftDefaults(agent, baseBranch, []);

  return {
    id: typeof rawLane?.id === "string" && rawLane.id.trim() ? rawLane.id : `lane-${index + 1}`,
    agent,
    baseBranch,
    worktreeBranch: sanitizeWorktreeBranch(typeof rawLane?.worktreeBranch === "string" ? rawLane.worktreeBranch : draftDefaults.worktreeBranch),
    worktreeDirectory: sanitizeDirectoryName(typeof rawLane?.worktreeDirectory === "string" ? rawLane.worktreeDirectory : buildDefaultWorktreeDirectory(draftDefaults.worktreeBranch)),
    mission: typeof rawLane?.mission === "string" ? rawLane.mission : "",
    focusFiles: typeof rawLane?.focusFiles === "string" ? rawLane.focusFiles : "",
    status: isLaneStatus(rawLane?.status) ? rawLane.status : "idle",
    updatedAt: Number.isFinite(rawLane?.updatedAt) ? Number(rawLane?.updatedAt) : Date.now(),
    worktreePath: typeof rawLane?.worktreePath === "string" ? rawLane.worktreePath : undefined,
    lastCommand: rawLane?.lastCommand,
  };
}

function loadStoredLanes(): WorktreeLane[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.map((lane, index) => normalizeLane(lane, index)) : [];
  } catch {
    return [];
  }
}

export default function WorktreePanel({ open, onClose }: Props) {
  const [lanes, setLanes] = useState<WorktreeLane[]>(() => loadStoredLanes());
  const [branches, setBranches] = useState<string[]>([]);
  const [workspaceDir, setWorkspaceDir] = useState<string | null>(null);
  const [gitState, setGitState] = useState<GitStatusResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [executingLaneId, setExecutingLaneId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [draft, setDraft] = useState({
    agent: AGENT_OPTIONS[0],
    baseBranch: "",
    worktreeBranch: "",
    worktreeDirectory: "",
    mission: "",
    focusFiles: "",
  });

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(lanes));
    } catch {
      // Ignore local persistence failures.
    }
  }, [lanes]);

  useEffect(() => {
    if (!feedback) return;
    const timer = window.setTimeout(() => setFeedback(null), 1800);
    return () => window.clearTimeout(timer);
  }, [feedback]);

  const refreshWorkspaceState = async () => {
    setLoading(true);
    try {
      const [branchList, status, workspace] = await Promise.all([
        gitBranchList(),
        gitStatus(),
        getWorkspaceDir(),
      ]);
      const normalizedBranches = branchList.map(sanitizeBranchName).filter(Boolean);
      setBranches(normalizedBranches);
      setGitState(status);
      setWorkspaceDir(workspace);
      setDraft((prev) => {
        const nextBaseBranch = prev.baseBranch || status.branch || normalizedBranches[0] || "";
        const defaults = prev.worktreeBranch && prev.worktreeDirectory
          ? { worktreeBranch: prev.worktreeBranch, worktreeDirectory: prev.worktreeDirectory }
          : buildDraftDefaults(prev.agent, nextBaseBranch, lanes);
        return {
          ...prev,
          baseBranch: nextBaseBranch,
          worktreeBranch: defaults.worktreeBranch,
          worktreeDirectory: defaults.worktreeDirectory,
        };
      });
    } catch {
      setBranches([]);
      setGitState(null);
      setWorkspaceDir(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const refresh = async () => {
      await refreshWorkspaceState();
      if (cancelled) return;
    };
    void refresh();
    return () => {
      cancelled = true;
    };
  }, [open]);

  if (!open) return null;

  const activeLaneCount = lanes.filter((lane) => lane.status === "running" || lane.status === "review").length;
  const currentBranch = gitState?.branch || draft.baseBranch || "(unknown)";
  const draftPreview = draft.baseBranch
    ? buildWorktreePreview(
        draft.baseBranch,
        draft.worktreeBranch || buildDefaultWorktreeBranch(draft.agent, draft.baseBranch),
        draft.worktreeDirectory || buildDefaultWorktreeDirectory(draft.worktreeBranch || buildDefaultWorktreeBranch(draft.agent, draft.baseBranch)),
        workspaceDir,
      )
    : "Select a base branch to preview the worktree command.";

  const updateLane = (laneId: string, patch: Partial<WorktreeLane>) => {
    setLanes((prev) => prev.map((lane) => lane.id === laneId ? { ...lane, ...patch, updatedAt: Date.now() } : lane));
  };

  const addLane = () => {
    if (!draft.baseBranch.trim() || !draft.mission.trim()) return;

    const baseBranch = sanitizeBranchName(draft.baseBranch);
    const worktreeBranch = ensureUniqueValue(
      sanitizeWorktreeBranch(draft.worktreeBranch || buildDefaultWorktreeBranch(draft.agent, baseBranch)),
      lanes.map((lane) => lane.worktreeBranch),
    );
    const worktreeDirectory = ensureUniqueValue(
      sanitizeDirectoryName(draft.worktreeDirectory || buildDefaultWorktreeDirectory(worktreeBranch)),
      lanes.map((lane) => lane.worktreeDirectory),
    );

    const nextLane: WorktreeLane = {
      id: `lane-${Date.now()}`,
      agent: draft.agent,
      baseBranch,
      worktreeBranch,
      worktreeDirectory,
      mission: draft.mission.trim(),
      focusFiles: draft.focusFiles.trim(),
      status: "idle",
      updatedAt: Date.now(),
    };
    setLanes((prev) => [nextLane, ...prev]);
    const defaults = buildDraftDefaults(draft.agent, baseBranch, [nextLane, ...lanes]);
    setDraft((prev) => ({
      ...prev,
      worktreeBranch: defaults.worktreeBranch,
      worktreeDirectory: defaults.worktreeDirectory,
      mission: "",
      focusFiles: "",
    }));
  };

  const removeLane = (laneId: string) => {
    setLanes((prev) => prev.filter((lane) => lane.id !== laneId));
  };

  const copyPreview = async (lane: Pick<WorktreeLane, "baseBranch" | "worktreeBranch" | "worktreeDirectory">) => {
    try {
      await navigator.clipboard.writeText(buildWorktreePreview(lane.baseBranch, lane.worktreeBranch, lane.worktreeDirectory, workspaceDir));
      setFeedback(`Copied command for ${lane.worktreeBranch}`);
    } catch {
      setFeedback("Clipboard unavailable");
    }
  };

  const executeWorktree = async (lane: WorktreeLane) => {
    if (!workspaceDir) {
      setFeedback("Select a workspace before creating a worktree.");
      return;
    }

    const command = buildWorktreePreview(lane.baseBranch, lane.worktreeBranch, lane.worktreeDirectory, workspaceDir);
    setExecutingLaneId(lane.id);

    try {
      const result = await runDesktopCommand(command, workspaceDir, 120_000);
      const worktreePath = resolveWorktreePath(workspaceDir, lane.worktreeDirectory);
      const commandState: WorktreeCommandState = {
        command,
        worktreePath,
        stdout: result.stdout,
        stderr: result.stderr,
        exitCode: result.exitCode,
        timedOut: result.timedOut,
        durationMs: result.durationMs,
        succeeded: !result.timedOut && (result.exitCode ?? -1) === 0,
      };

      updateLane(lane.id, {
        status: commandState.succeeded ? "running" : "blocked",
        worktreePath,
        lastCommand: commandState,
      });

      setFeedback(commandState.succeeded ? `Created ${lane.worktreeBranch}` : `Worktree command failed for ${lane.worktreeBranch}`);

      if (commandState.succeeded) {
        await refreshWorkspaceState();
      }
    } catch (error) {
      updateLane(lane.id, {
        status: "blocked",
        lastCommand: {
          command,
          worktreePath: resolveWorktreePath(workspaceDir, lane.worktreeDirectory),
          stdout: "",
          stderr: error instanceof Error ? error.message : "Unknown desktop command failure.",
          exitCode: null,
          timedOut: false,
          durationMs: 0,
          succeeded: false,
        },
      });
      setFeedback(error instanceof Error ? error.message : "Failed to run git worktree add.");
    } finally {
      setExecutingLaneId(null);
    }
  };

  const applyDraftBaseBranch = (baseBranch: string, agent: string = draft.agent) => {
    const normalizedBaseBranch = sanitizeBranchName(baseBranch);
    const defaults = buildDraftDefaults(agent, normalizedBaseBranch, lanes);
    setDraft((prev) => ({
      ...prev,
      agent,
      baseBranch: normalizedBaseBranch,
      worktreeBranch: defaults.worktreeBranch,
      worktreeDirectory: defaults.worktreeDirectory,
    }));
  };

  return (
    <div style={overlay} onClick={onClose}>
      <div style={panel} onClick={(event) => event.stopPropagation()}>
        <div style={header}>
          <div>
            <div style={title}>Multi-Agent Worktree</div>
            <div style={subtitle}>Turn a base branch into an executable lane branch and create the worktree without leaving the desktop shell.</div>
          </div>
          <button onClick={onClose} style={closeButton}>Close</button>
        </div>

        <div style={summaryGrid}>
          <div style={summaryCard}>
            <div style={summaryLabel}>Workspace</div>
            <div style={summaryValue}>{workspaceDir || "No workspace selected"}</div>
          </div>
          <div style={summaryCard}>
            <div style={summaryLabel}>Current branch</div>
            <div style={summaryValue}>{currentBranch}</div>
          </div>
          <div style={summaryCard}>
            <div style={summaryLabel}>Lane load</div>
            <div style={summaryValue}>{activeLaneCount} active / {lanes.length} total</div>
          </div>
        </div>

        <div style={body}>
          <div style={leftColumn}>
            <div style={sectionCard}>
              <div style={sectionTitle}>Draft lane</div>
              <label style={fieldLabel}>Agent role</label>
              <select
                value={draft.agent}
                onChange={(event) => applyDraftBaseBranch(draft.baseBranch, event.target.value)}
                style={input}
              >
                {AGENT_OPTIONS.map((agent) => (
                  <option key={agent} value={agent}>{agent}</option>
                ))}
              </select>
              <label style={fieldLabel}>Base branch</label>
              <select
                value={draft.baseBranch}
                onChange={(event) => applyDraftBaseBranch(event.target.value)}
                style={input}
              >
                {branches.length === 0 && <option value="">No branches found</option>}
                {branches.map((branch) => (
                  <option key={branch} value={branch}>{branch}</option>
                ))}
              </select>
              <label style={fieldLabel}>Lane branch</label>
              <input
                value={draft.worktreeBranch}
                onChange={(event) => setDraft((prev) => ({ ...prev, worktreeBranch: event.target.value }))}
                placeholder="lanes/builder/main"
                style={input}
              />
              <label style={fieldLabel}>Worktree folder</label>
              <input
                value={draft.worktreeDirectory}
                onChange={(event) => setDraft((prev) => ({ ...prev, worktreeDirectory: event.target.value }))}
                placeholder="worktree-builder-main"
                style={input}
              />
              <label style={fieldLabel}>Mission</label>
              <textarea
                value={draft.mission}
                onChange={(event) => setDraft((prev) => ({ ...prev, mission: event.target.value }))}
                placeholder="What should this lane deliver?"
                style={textarea}
              />
              <label style={fieldLabel}>Focus files</label>
              <input
                value={draft.focusFiles}
                onChange={(event) => setDraft((prev) => ({ ...prev, focusFiles: event.target.value }))}
                placeholder="backend/src/... , desktop/src/..."
                style={input}
              />
              <div style={laneActions}>
                <button onClick={addLane} style={primaryButton}>Add lane</button>
                <button onClick={() => void refreshWorkspaceState()} style={secondaryButton}>Refresh git</button>
              </div>
              <div style={previewBox}>
                <div style={previewLabel}>CLI preview</div>
                <code style={previewCode}>{draftPreview}</code>
              </div>
            </div>

            <div style={sectionCard}>
              <div style={sectionTitle}>Branch pool</div>
              {loading && <div style={subtleText}>Refreshing git metadata...</div>}
              {!loading && branches.length === 0 && <div style={subtleText}>No branches available.</div>}
              <div style={chipWrap}>
                {branches.map((branch) => (
                  <button
                    key={branch}
                    onClick={() => applyDraftBaseBranch(branch)}
                    style={{ ...branchChip, ...(draft.baseBranch === branch ? branchChipActive : {}) }}
                  >
                    {branch}
                  </button>
                ))}
              </div>
              {gitState?.changes?.length ? (
                <div style={changesBox}>
                  <div style={previewLabel}>Dirty files</div>
                  {gitState.changes.slice(0, 6).map((change) => (
                    <div key={`${change.status}:${change.file}`} style={changeRow}>
                      <span style={changeStatus}>{change.status}</span>
                      <span style={changeFile}>{change.file}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <div style={subtleText}>Working tree is clean.</div>
              )}
            </div>
          </div>

          <div style={rightColumn}>
            <div style={laneHeaderRow}>
              <div style={sectionTitle}>Agent lanes</div>
              {feedback && <div style={copyFeedbackText}>{feedback}</div>}
            </div>
            {lanes.length === 0 && (
              <div style={emptyState}>
                Create a lane to pin a base branch, derived lane branch, mission, and focus files for a specific agent role.
              </div>
            )}
            {lanes.map((lane) => {
              const statusMeta = STATUS_META[lane.status];
              const commandPreview = buildWorktreePreview(lane.baseBranch, lane.worktreeBranch, lane.worktreeDirectory, workspaceDir);
              const lastOutput = lane.lastCommand?.stderr || lane.lastCommand?.stdout || "";
              const laneCreated = Boolean(lane.lastCommand?.succeeded);

              return (
                <div key={lane.id} style={{ ...laneCard, borderColor: statusMeta.accent, background: statusMeta.tint }}>
                  <div style={laneTopRow}>
                    <div style={{ display: "flex", alignItems: "center", gap: 12, flex: 1 }}>
                      {/* Multi-Agent v1 W1 (R4.3): show Agent_Identity_Card
                          when lane.agentId is set (sub-task created the lane).
                          Click to open AgentTeamPanel filtered to that agent. */}
                      {lane.agentId && (
                        <AgentIdentityCard
                          agentId={lane.agentId}
                          size="sm"
                          status={
                            lane.status === "running"
                              ? "running"
                              : lane.status === "blocked"
                                ? "error"
                                : lane.status === "review"
                                  ? "done"
                                  : "idle"
                          }
                          onClick={() => {
                            try {
                              window.dispatchEvent(
                                new CustomEvent("agentrix:open-agent-team-panel", {
                                  detail: { filterAgentId: lane.agentId },
                                }),
                              );
                            } catch {
                              /* SSR */
                            }
                          }}
                        />
                      )}
                      <div>
                        <div style={laneAgent}>{lane.agent}</div>
                        <div style={laneBranch}>{lane.worktreeBranch}</div>
                        <div style={laneBaseBranch}>from {lane.baseBranch}</div>
                      </div>
                    </div>
                    <select
                      value={lane.status}
                      onChange={(event) => updateLane(lane.id, { status: event.target.value as LaneStatus })}
                      style={{ ...statusSelect, borderColor: statusMeta.accent, color: statusMeta.accent }}
                    >
                      {Object.entries(STATUS_META).map(([value, meta]) => (
                        <option key={value} value={value}>{meta.label}</option>
                      ))}
                    </select>
                  </div>
                  <div style={laneMission}>{lane.mission}</div>
                  <div style={laneMetaRow}>
                    <span style={metaPill}>Focus: {lane.focusFiles || "No files pinned"}</span>
                    <span style={metaPill}>Folder: {lane.worktreeDirectory}</span>
                    {lane.worktreePath && <span style={metaPill}>Path: {lane.worktreePath}</span>}
                    <span style={metaPill}>Updated {new Date(lane.updatedAt).toLocaleTimeString()}</span>
                  </div>
                  <div style={previewBox}>
                    <div style={previewLabel}>Command preview</div>
                    <code style={previewCode}>{commandPreview}</code>
                  </div>
                  {lane.lastCommand && (
                    <div style={resultCard}>
                      <div style={resultHeaderRow}>
                        <span style={previewLabel}>Last execution</span>
                        <span style={{ ...resultBadge, ...(lane.lastCommand.succeeded ? resultBadgeSuccess : resultBadgeFailure) }}>
                          {lane.lastCommand.succeeded ? "success" : lane.lastCommand.timedOut ? "timed out" : "failed"}
                        </span>
                      </div>
                      <div style={subtleText}>exit={lane.lastCommand.exitCode ?? "n/a"} · duration={lane.lastCommand.durationMs}ms</div>
                      <code style={resultCode}>{lastOutput || lane.lastCommand.command}</code>
                    </div>
                  )}
                  <div style={laneActions}>
                    <button
                      onClick={() => void executeWorktree(lane)}
                      style={primaryButton}
                      disabled={!workspaceDir || laneCreated || executingLaneId === lane.id}
                    >
                      {executingLaneId === lane.id ? "Creating..." : laneCreated ? "Worktree created" : "Create worktree"}
                    </button>
                    <button onClick={() => void copyPreview(lane)} style={secondaryButton}>Copy command</button>
                    <button onClick={() => removeLane(lane.id)} style={ghostButton}>Archive</button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

const overlay: CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "var(--bg-panel-deep)",
  zIndex: 9100,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: 24,
};

const panel: CSSProperties = {
  width: "min(1080px, 96vw)",
  maxHeight: "88vh",
  overflow: "hidden",
  display: "flex",
  flexDirection: "column",
  // Sprint Pre-launch P-2 hotfix (2026-05-24): light mode残留修复。
  // 之前是写死深色渐变 rgba(18,24,37,0.98) → rgba(11,16,26,0.98),
  // 在 light mode 下白字白底看不清。改为主题变量。
  background: "var(--bg-panel, #16213e)",
  border: "1px solid var(--border-subtle, rgba(125,211,252,0.16))",
  borderRadius: 24,
  boxShadow: "0 24px 80px rgba(0,0,0,0.25)",
};

const header: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 16,
  alignItems: "flex-start",
  padding: "20px 24px 16px",
  borderBottom: "1px solid rgba(148,163,184,0.16)",
};

const title: CSSProperties = { fontSize: 22, fontWeight: 700, color: "var(--text-strong)" };
const subtitle: CSSProperties = { marginTop: 6, fontSize: 13, color: "var(--text-muted)", maxWidth: 560 };
const closeButton: CSSProperties = {
  border: "1px solid rgba(148,163,184,0.22)",
  background: "var(--bg-panel-deep)",
  color: "var(--text-card)",
  borderRadius: 999,
  padding: "8px 14px",
  cursor: "pointer",
};

const summaryGrid: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
  gap: 12,
  padding: "16px 24px",
  borderBottom: "1px solid rgba(148,163,184,0.12)",
};

const summaryCard: CSSProperties = {
  padding: "14px 16px",
  borderRadius: 18,
  border: "1px solid rgba(148,163,184,0.12)",
  background: "var(--bg-panel-deep)",
};
const summaryLabel: CSSProperties = { fontSize: 11, letterSpacing: 0.8, textTransform: "uppercase", color: "var(--text-muted)" };
const summaryValue: CSSProperties = { marginTop: 6, fontSize: 15, fontWeight: 600, color: "var(--text-strong)", wordBreak: "break-word" };

const body: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "minmax(320px, 0.95fr) minmax(0, 1.45fr)",
  gap: 18,
  padding: 24,
  overflow: "auto",
};
const leftColumn: CSSProperties = { display: "flex", flexDirection: "column", gap: 16 };
const rightColumn: CSSProperties = { display: "flex", flexDirection: "column", gap: 14 };
const sectionCard: CSSProperties = {
  borderRadius: 20,
  padding: 18,
  border: "1px solid rgba(148,163,184,0.14)",
  background: "var(--bg-card)",
  display: "flex",
  flexDirection: "column",
  gap: 10,
};
const sectionTitle: CSSProperties = { fontSize: 15, fontWeight: 700, color: "var(--text-strong)" };
const fieldLabel: CSSProperties = { fontSize: 11, textTransform: "uppercase", letterSpacing: 0.8, color: "var(--text-muted)", marginTop: 4 };
const input: CSSProperties = {
  borderRadius: 12,
  border: "1px solid rgba(148,163,184,0.18)",
  background: "var(--bg-elevated)",
  color: "var(--text-card)",
  padding: "11px 12px",
  fontSize: 13,
};
const textarea: CSSProperties = { ...input, minHeight: 92, resize: "vertical", fontFamily: "inherit" };
const primaryButton: CSSProperties = {
  border: "none",
  borderRadius: 14,
  background: "linear-gradient(135deg, #38bdf8 0%, #0f766e 100%)",
  color: "#06121c",
  fontWeight: 700,
  padding: "11px 14px",
  cursor: "pointer",
};
const secondaryButton: CSSProperties = {
  border: "1px solid rgba(56,189,248,0.3)",
  borderRadius: 12,
  background: "var(--bg-panel-deep)",
  color: "var(--accent-card-action)",
  padding: "9px 12px",
  cursor: "pointer",
};
const ghostButton: CSSProperties = {
  border: "1px solid rgba(148,163,184,0.18)",
  borderRadius: 12,
  background: "transparent",
  color: "var(--text-muted)",
  padding: "9px 12px",
  cursor: "pointer",
};
const previewBox: CSSProperties = {
  padding: 12,
  borderRadius: 14,
  background: "var(--bg-panel-deep)",
  border: "1px solid rgba(148,163,184,0.14)",
};
const previewLabel: CSSProperties = { fontSize: 11, textTransform: "uppercase", letterSpacing: 0.7, color: "var(--text-muted)" };
const previewCode: CSSProperties = {
  display: "block",
  marginTop: 8,
  color: "var(--text-card)",
  fontSize: 12,
  lineHeight: 1.5,
  whiteSpace: "pre-wrap",
  wordBreak: "break-word",
};
const chipWrap: CSSProperties = { display: "flex", flexWrap: "wrap", gap: 8, marginTop: 4 };
const branchChip: CSSProperties = {
  borderRadius: 999,
  border: "1px solid rgba(148,163,184,0.16)",
  background: "var(--bg-panel-deep)",
  color: "var(--text-muted)",
  padding: "8px 11px",
  cursor: "pointer",
  fontSize: 12,
};
const branchChipActive: CSSProperties = {
  borderColor: "rgba(56,189,248,0.48)",
  color: "#67e8f9",
  background: "rgba(34,211,238,0.12)",
};
const subtleText: CSSProperties = { fontSize: 12, color: "var(--text-muted)" };
const changesBox: CSSProperties = { marginTop: 8, display: "flex", flexDirection: "column", gap: 8 };
const changeRow: CSSProperties = { display: "grid", gridTemplateColumns: "52px minmax(0, 1fr)", gap: 10, alignItems: "center" };
const changeStatus: CSSProperties = { color: "#67e8f9", fontSize: 11, fontWeight: 700 };
const changeFile: CSSProperties = { color: "var(--text-card)", fontSize: 12, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" };
const laneHeaderRow: CSSProperties = { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16 };
const copyFeedbackText: CSSProperties = { fontSize: 12, color: "#67e8f9" };
const emptyState: CSSProperties = {
  padding: 22,
  borderRadius: 18,
  border: "1px dashed rgba(148,163,184,0.24)",
  color: "var(--text-muted)",
  background: "var(--bg-card)",
};
const laneCard: CSSProperties = {
  borderRadius: 20,
  border: "1px solid transparent",
  padding: 18,
  display: "flex",
  flexDirection: "column",
  gap: 12,
};
const laneTopRow: CSSProperties = { display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start" };
const laneAgent: CSSProperties = { fontSize: 16, fontWeight: 700, color: "var(--text-strong)" };
const laneBranch: CSSProperties = { marginTop: 4, fontSize: 13, color: "var(--accent-card-title)", fontWeight: 600 };
const laneBaseBranch: CSSProperties = { marginTop: 4, fontSize: 12, color: "var(--text-muted)" };
const statusSelect: CSSProperties = {
  borderRadius: 999,
  background: "var(--bg-card)",
  border: "1px solid",
  padding: "7px 10px",
  fontSize: 12,
};
const laneMission: CSSProperties = { color: "var(--text-card)", fontSize: 14, lineHeight: 1.5 };
const laneMetaRow: CSSProperties = { display: "flex", flexWrap: "wrap", gap: 8 };
const metaPill: CSSProperties = {
  borderRadius: 999,
  padding: "6px 10px",
  background: "var(--bg-panel-deep)",
  border: "1px solid rgba(148,163,184,0.16)",
  color: "var(--text-muted)",
  fontSize: 11,
};
const laneActions: CSSProperties = { display: "flex", gap: 10, flexWrap: "wrap" };
const resultCard: CSSProperties = {
  padding: 12,
  borderRadius: 14,
  background: "var(--bg-panel-deep)",
  border: "1px solid rgba(148,163,184,0.14)",
  display: "flex",
  flexDirection: "column",
  gap: 8,
};
const resultHeaderRow: CSSProperties = { display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center" };
const resultBadge: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  borderRadius: 999,
  padding: "5px 9px",
  fontSize: 11,
  textTransform: "uppercase",
  letterSpacing: 0.7,
  border: "1px solid transparent",
};
const resultBadgeSuccess: CSSProperties = { color: "#bbf7d0", borderColor: "var(--tone-success-border)", background: "rgba(20,83,45,0.24)" };
const resultBadgeFailure: CSSProperties = { color: "#fecaca", borderColor: "var(--tone-danger-border)", background: "rgba(127,29,29,0.22)" };
const resultCode: CSSProperties = {
  display: "block",
  color: "var(--text-card)",
  fontSize: 12,
  lineHeight: 1.5,
  whiteSpace: "pre-wrap",
  wordBreak: "break-word",
  maxHeight: 140,
  overflow: "auto",
};
