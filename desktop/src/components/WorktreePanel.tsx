import { useEffect, useState, type CSSProperties } from "react";
import { gitBranchList, gitStatus, type GitStatusResult } from "../services/git";
import { getWorkspaceDir } from "../services/workspace";

type LaneStatus = "idle" | "running" | "review" | "blocked";

interface WorktreeLane {
  id: string;
  agent: string;
  branch: string;
  mission: string;
  focusFiles: string;
  status: LaneStatus;
  updatedAt: number;
}

interface Props {
  open: boolean;
  onClose: () => void;
}

const STORAGE_KEY = "agentrix_desktop_worktree_board_v1";
const AGENT_OPTIONS = ["Architect", "Builder", "Reviewer", "Ops"];
const STATUS_META: Record<LaneStatus, { label: string; accent: string; tint: string }> = {
  idle: { label: "Idle", accent: "#94a3b8", tint: "rgba(148,163,184,0.12)" },
  running: { label: "Running", accent: "#38bdf8", tint: "rgba(56,189,248,0.12)" },
  review: { label: "In review", accent: "#fbbf24", tint: "rgba(251,191,36,0.12)" },
  blocked: { label: "Blocked", accent: "#f87171", tint: "rgba(248,113,113,0.12)" },
};

function sanitizeBranchName(value: string) {
  return value.replace(/^\*\s*/, "").trim();
}

function loadStoredLanes(): WorktreeLane[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function buildWorktreePreview(branch: string) {
  const safeDir = sanitizeBranchName(branch).replace(/[^a-zA-Z0-9._-]+/g, "-");
  return `git worktree add ../${safeDir} ${sanitizeBranchName(branch)}`;
}

export default function WorktreePanel({ open, onClose }: Props) {
  const [lanes, setLanes] = useState<WorktreeLane[]>(() => loadStoredLanes());
  const [branches, setBranches] = useState<string[]>([]);
  const [workspaceDir, setWorkspaceDir] = useState<string | null>(null);
  const [gitState, setGitState] = useState<GitStatusResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [draft, setDraft] = useState({
    agent: AGENT_OPTIONS[0],
    branch: "",
    mission: "",
    focusFiles: "",
  });
  const [copyFeedback, setCopyFeedback] = useState<string | null>(null);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(lanes));
    } catch {}
  }, [lanes]);

  useEffect(() => {
    if (!copyFeedback) return;
    const timer = window.setTimeout(() => setCopyFeedback(null), 1200);
    return () => window.clearTimeout(timer);
  }, [copyFeedback]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const refresh = async () => {
      setLoading(true);
      try {
        const [branchList, status, workspace] = await Promise.all([
          gitBranchList(),
          gitStatus(),
          getWorkspaceDir(),
        ]);
        if (cancelled) return;
        const normalizedBranches = branchList.map(sanitizeBranchName).filter(Boolean);
        setBranches(normalizedBranches);
        setGitState(status);
        setWorkspaceDir(workspace);
        setDraft((prev) => ({
          ...prev,
          branch: prev.branch || status.branch || normalizedBranches[0] || "",
        }));
      } catch {
        if (!cancelled) {
          setBranches([]);
          setGitState(null);
          setWorkspaceDir(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void refresh();
    return () => {
      cancelled = true;
    };
  }, [open]);

  if (!open) return null;

  const activeLaneCount = lanes.filter((lane) => lane.status === "running" || lane.status === "review").length;
  const currentBranch = gitState?.branch || draft.branch || "(unknown)";

  const addLane = () => {
    if (!draft.branch.trim() || !draft.mission.trim()) return;
    const nextLane: WorktreeLane = {
      id: `lane-${Date.now()}`,
      agent: draft.agent,
      branch: sanitizeBranchName(draft.branch),
      mission: draft.mission.trim(),
      focusFiles: draft.focusFiles.trim(),
      status: "idle",
      updatedAt: Date.now(),
    };
    setLanes((prev) => [nextLane, ...prev]);
    setDraft((prev) => ({ ...prev, mission: "", focusFiles: "" }));
  };

  const updateLane = (laneId: string, patch: Partial<WorktreeLane>) => {
    setLanes((prev) => prev.map((lane) => lane.id === laneId ? { ...lane, ...patch, updatedAt: Date.now() } : lane));
  };

  const removeLane = (laneId: string) => {
    setLanes((prev) => prev.filter((lane) => lane.id !== laneId));
  };

  const copyPreview = async (branch: string) => {
    try {
      await navigator.clipboard.writeText(buildWorktreePreview(branch));
      setCopyFeedback(`Copied command for ${branch}`);
    } catch {
      setCopyFeedback("Clipboard unavailable");
    }
  };

  return (
    <div style={overlay} onClick={onClose}>
      <div style={panel} onClick={(event) => event.stopPropagation()}>
        <div style={header}>
          <div>
            <div style={title}>Multi-Agent Worktree</div>
            <div style={subtitle}>Assign branches to focused agent lanes without leaving the desktop shell.</div>
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
                onChange={(event) => setDraft((prev) => ({ ...prev, agent: event.target.value }))}
                style={input}
              >
                {AGENT_OPTIONS.map((agent) => (
                  <option key={agent} value={agent}>{agent}</option>
                ))}
              </select>
              <label style={fieldLabel}>Branch</label>
              <select
                value={draft.branch}
                onChange={(event) => setDraft((prev) => ({ ...prev, branch: event.target.value }))}
                style={input}
              >
                {branches.length === 0 && <option value="">No branches found</option>}
                {branches.map((branch) => (
                  <option key={branch} value={branch}>{branch}</option>
                ))}
              </select>
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
              <button onClick={addLane} style={primaryButton}>Add lane</button>
              <div style={previewBox}>
                <div style={previewLabel}>CLI preview</div>
                <code style={previewCode}>{draft.branch ? buildWorktreePreview(draft.branch) : "Select a branch to preview the worktree command."}</code>
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
                    onClick={() => setDraft((prev) => ({ ...prev, branch }))}
                    style={{ ...branchChip, ...(draft.branch === branch ? branchChipActive : {}) }}
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
              {copyFeedback && <div style={copyFeedbackText}>{copyFeedback}</div>}
            </div>
            {lanes.length === 0 && (
              <div style={emptyState}>
                Create a lane to pin a branch, mission, and focus files for a specific agent role.
              </div>
            )}
            {lanes.map((lane) => {
              const statusMeta = STATUS_META[lane.status];
              return (
                <div key={lane.id} style={{ ...laneCard, borderColor: statusMeta.accent, background: statusMeta.tint }}>
                  <div style={laneTopRow}>
                    <div>
                      <div style={laneAgent}>{lane.agent}</div>
                      <div style={laneBranch}>{lane.branch}</div>
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
                    <span style={metaPill}>Updated {new Date(lane.updatedAt).toLocaleTimeString()}</span>
                  </div>
                  <div style={previewBox}>
                    <div style={previewLabel}>Command preview</div>
                    <code style={previewCode}>{buildWorktreePreview(lane.branch)}</code>
                  </div>
                  <div style={laneActions}>
                    <button onClick={() => copyPreview(lane.branch)} style={secondaryButton}>Copy command</button>
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
  background: "rgba(9, 14, 24, 0.58)",
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
  background: "linear-gradient(180deg, rgba(18,24,37,0.98) 0%, rgba(11,16,26,0.98) 100%)",
  border: "1px solid rgba(125,211,252,0.16)",
  borderRadius: 24,
  boxShadow: "0 24px 80px rgba(0,0,0,0.45)",
};

const header: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 16,
  alignItems: "flex-start",
  padding: "20px 24px 16px",
  borderBottom: "1px solid rgba(148,163,184,0.16)",
};

const title: CSSProperties = { fontSize: 22, fontWeight: 700, color: "#f8fafc" };
const subtitle: CSSProperties = { marginTop: 6, fontSize: 13, color: "#94a3b8", maxWidth: 560 };
const closeButton: CSSProperties = {
  border: "1px solid rgba(148,163,184,0.22)",
  background: "rgba(15,23,42,0.72)",
  color: "#e2e8f0",
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
  background: "rgba(15,23,42,0.52)",
};
const summaryLabel: CSSProperties = { fontSize: 11, letterSpacing: 0.8, textTransform: "uppercase", color: "#94a3b8" };
const summaryValue: CSSProperties = { marginTop: 6, fontSize: 15, fontWeight: 600, color: "#f8fafc", wordBreak: "break-word" };

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
  background: "rgba(15,23,42,0.48)",
  display: "flex",
  flexDirection: "column",
  gap: 10,
};
const sectionTitle: CSSProperties = { fontSize: 15, fontWeight: 700, color: "#f8fafc" };
const fieldLabel: CSSProperties = { fontSize: 11, textTransform: "uppercase", letterSpacing: 0.8, color: "#94a3b8", marginTop: 4 };
const input: CSSProperties = {
  borderRadius: 12,
  border: "1px solid rgba(148,163,184,0.18)",
  background: "rgba(15,23,42,0.84)",
  color: "#e2e8f0",
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
  background: "rgba(15,23,42,0.72)",
  color: "#bae6fd",
  padding: "9px 12px",
  cursor: "pointer",
};
const ghostButton: CSSProperties = {
  border: "1px solid rgba(148,163,184,0.18)",
  borderRadius: 12,
  background: "transparent",
  color: "#cbd5e1",
  padding: "9px 12px",
  cursor: "pointer",
};
const previewBox: CSSProperties = {
  padding: 12,
  borderRadius: 14,
  background: "rgba(2,8,23,0.62)",
  border: "1px solid rgba(148,163,184,0.14)",
};
const previewLabel: CSSProperties = { fontSize: 11, textTransform: "uppercase", letterSpacing: 0.7, color: "#64748b" };
const previewCode: CSSProperties = {
  display: "block",
  marginTop: 8,
  color: "#e2e8f0",
  fontSize: 12,
  lineHeight: 1.5,
  whiteSpace: "pre-wrap",
  wordBreak: "break-word",
};
const chipWrap: CSSProperties = { display: "flex", flexWrap: "wrap", gap: 8, marginTop: 4 };
const branchChip: CSSProperties = {
  borderRadius: 999,
  border: "1px solid rgba(148,163,184,0.16)",
  background: "rgba(15,23,42,0.64)",
  color: "#cbd5e1",
  padding: "8px 11px",
  cursor: "pointer",
  fontSize: 12,
};
const branchChipActive: CSSProperties = {
  borderColor: "rgba(56,189,248,0.48)",
  color: "#67e8f9",
  background: "rgba(34,211,238,0.12)",
};
const subtleText: CSSProperties = { fontSize: 12, color: "#94a3b8" };
const changesBox: CSSProperties = { marginTop: 8, display: "flex", flexDirection: "column", gap: 8 };
const changeRow: CSSProperties = { display: "grid", gridTemplateColumns: "52px minmax(0, 1fr)", gap: 10, alignItems: "center" };
const changeStatus: CSSProperties = { color: "#67e8f9", fontSize: 11, fontWeight: 700 };
const changeFile: CSSProperties = { color: "#e2e8f0", fontSize: 12, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" };
const laneHeaderRow: CSSProperties = { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16 };
const copyFeedbackText: CSSProperties = { fontSize: 12, color: "#67e8f9" };
const emptyState: CSSProperties = {
  padding: 22,
  borderRadius: 18,
  border: "1px dashed rgba(148,163,184,0.24)",
  color: "#94a3b8",
  background: "rgba(15,23,42,0.28)",
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
const laneAgent: CSSProperties = { fontSize: 16, fontWeight: 700, color: "#f8fafc" };
const laneBranch: CSSProperties = { marginTop: 4, fontSize: 12, color: "#94a3b8" };
const statusSelect: CSSProperties = {
  borderRadius: 999,
  background: "rgba(2,8,23,0.44)",
  border: "1px solid",
  padding: "7px 10px",
  fontSize: 12,
};
const laneMission: CSSProperties = { color: "#e2e8f0", fontSize: 14, lineHeight: 1.5 };
const laneMetaRow: CSSProperties = { display: "flex", flexWrap: "wrap", gap: 8 };
const metaPill: CSSProperties = {
  borderRadius: 999,
  padding: "6px 10px",
  background: "rgba(15,23,42,0.7)",
  border: "1px solid rgba(148,163,184,0.16)",
  color: "#cbd5e1",
  fontSize: 11,
};
const laneActions: CSSProperties = { display: "flex", gap: 10, flexWrap: "wrap" };
