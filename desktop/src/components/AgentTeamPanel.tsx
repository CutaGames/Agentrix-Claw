/**
 * AgentTeamPanel — top-level side panel showing the user's Agent_Team.
 *
 * Sections:
 *   1. Leader card
 *   2. Members grid
 *   3. Active Sub_Tasks list
 * Empty state: Provision-from-template CTA.
 *
 * Spec: multi-agent-collaboration-2026-06 W1.5
 * Design: §5.2, §5.3, §5.4, §5.5, §5.8
 *
 * Wired entry: ChatTitleBar More menu dispatches
 *   `agentrix:open-agent-team-panel` → ChatPanelImpl listens →
 *   sets `agentTeamPanelOpen` zustand selector → renders this panel
 */
import { useCallback, useEffect, useState, type CSSProperties } from "react";

import AgentIdentityCard from "./AgentIdentityCard";
import MemberSettingsModal, { type SubscriptionTier } from "./MemberSettingsModal";
import TeamWeeklyCard from "./TeamWeeklyCard";
import {
  bindLivingPets,
  getMyAgentTeam,
  listAgentTeamTemplates,
  promoteToLeader,
  provisionAgentTeam,
  type AgentTeamMember,
  type AgentTeamSnapshot,
  type AgentTeamTemplate,
} from "../services/agentTeam";

interface Props {
  open: boolean;
  onClose: () => void;
  /** "simple" | "standard" | "pro" — drives Edit button visibility per R8.6 */
  userMode?: "simple" | "standard" | "pro";
}

type Tab = "active" | "arena" | "ladder" | "marketplace";

export default function AgentTeamPanel({ open, onClose, userMode = "standard" }: Props) {
  const [snapshot, setSnapshot] = useState<AgentTeamSnapshot | null>(null);
  const [templates, setTemplates] = useState<AgentTeamTemplate[]>([]);
  const [loading, setLoading] = useState(false);
  const [provisioning, setProvisioning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("active");

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const team = await getMyAgentTeam();
      setSnapshot(team);
      if (!team) {
        const tpls = await listAgentTeamTemplates();
        setTemplates(tpls);
      }
    } catch (err) {
      setError(String(err instanceof Error ? err.message : err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    void reload();
  }, [open, reload]);

  const handleProvision = useCallback(
    async (templateSlug: string) => {
      setProvisioning(true);
      setError(null);
      try {
        const team = await provisionAgentTeam({ templateSlug });
        setSnapshot(team);
      } catch (err) {
        setError(String(err instanceof Error ? err.message : err));
      } finally {
        setProvisioning(false);
      }
    },
    [],
  );

  const handlePromote = useCallback(
    async (member: AgentTeamMember) => {
      if (!snapshot) return;
      try {
        const updated = await promoteToLeader({
          teamId: snapshot.team.id,
          agentId: member.agentId,
        });
        if (updated) setSnapshot(updated);
      } catch (err) {
        setError(String(err instanceof Error ? err.message : err));
      }
    },
    [snapshot],
  );

  if (!open) return null;

  return (
    <aside
      role="complementary"
      data-agent-team-panel="1"
      style={panelStyle}
    >
      <header style={headerStyle}>
        <h2 style={headerTitleStyle}>🤖 Agent 团队</h2>
        <button type="button" onClick={onClose} style={closeButtonStyle} aria-label="close">×</button>
      </header>

      {/* Tab strip — v1 had only "active". v2 W8 activates Arena +
          Ladder when MULTI_AGENT_PET_ARENA_ENABLED=1 on the backend.
          Frontend always renders all 3 tabs; calls fail with 400 if
          flag is OFF, which the panel catches and shows empty state. */}
      <div role="tablist" style={tabBarStyle}>
        <button
          type="button"
          role="tab"
          aria-selected={tab === "active"}
          onClick={() => setTab("active")}
          style={tab === "active" ? tabActiveStyle : tabStyle}
        >
          Active
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === "arena"}
          onClick={() => setTab("arena")}
          style={tab === "arena" ? tabActiveStyle : tabStyle}
        >
          Arena
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === "ladder"}
          onClick={() => setTab("ladder")}
          style={tab === "ladder" ? tabActiveStyle : tabStyle}
        >
          Ladder
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === "marketplace"}
          onClick={() => setTab("marketplace")}
          style={tab === "marketplace" ? tabActiveStyle : tabStyle}
        >
          Marketplace
        </button>
      </div>

      {error && <div style={errorStyle}>{error}</div>}

      {loading && <div style={loadingStyle}>Loading…</div>}

      {!loading && !snapshot && (
        <ProvisionEmptyState
          templates={templates}
          provisioning={provisioning}
          onProvision={handleProvision}
        />
      )}

      {!loading && snapshot && tab === "active" && (
        <PopulatedTeamView
          snapshot={snapshot}
          userMode={userMode}
          onPromote={handlePromote}
          onReload={reload}
        />
      )}

      {!loading && tab === "arena" && <PetArenaTab userMode={userMode} />}

      {!loading && tab === "ladder" && <PetLadderTab userMode={userMode} />}

      {!loading && tab === "marketplace" && <MarketplaceTab userMode={userMode} />}
    </aside>
  );
}

function ProvisionEmptyState({
  templates,
  provisioning,
  onProvision,
}: {
  templates: AgentTeamTemplate[];
  provisioning: boolean;
  onProvision: (slug: string) => void;
}) {
  return (
    <section style={emptyStateStyle}>
      <h3 style={{ fontSize: 16, marginBottom: 12 }}>从模板创建团队</h3>
      <p style={{ color: "var(--text-muted)", fontSize: 13, marginBottom: 16 }}>
        选一个模板,你的 Leader 会自动接管对话,Members 在后台帮你干活。
      </p>
      {templates.length === 0 ? (
        <p style={{ color: "var(--text-dim)" }}>没有可用模板。</p>
      ) : (
        <div style={templateGridStyle}>
          {templates.map((tpl) => (
            <button
              key={tpl.slug}
              type="button"
              onClick={() => onProvision(tpl.slug)}
              disabled={provisioning}
              style={templateCardStyle}
            >
              {tpl.iconUrl && (
                <img src={tpl.iconUrl} alt="" style={{ width: 32, height: 32, borderRadius: 6 }} />
              )}
              <div style={{ display: "flex", flexDirection: "column", textAlign: "left" }}>
                <span style={{ fontWeight: 600 }}>{tpl.name}</span>
                <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
                  {tpl.teamSize} agents · {tpl.description ?? ""}
                </span>
              </div>
            </button>
          ))}
        </div>
      )}
    </section>
  );
}

function PopulatedTeamView({
  snapshot,
  userMode,
  onPromote,
  onReload,
}: {
  snapshot: AgentTeamSnapshot;
  userMode: "simple" | "standard" | "pro";
  onPromote: (member: AgentTeamMember) => void;
  onReload: () => void;
}) {
  const [contextMenu, setContextMenu] = useState<{
    member: AgentTeamMember;
    x: number;
    y: number;
  } | null>(null);

  // Multi-Agent v1 W3.5 — "Use my pets as members" CTA state
  const [bindingPets, setBindingPets] = useState(false);
  const [bindError, setBindError] = useState<string | null>(null);
  const [bindResult, setBindResult] = useState<string | null>(null);

  // Multi-Agent v1 W3.6 — MemberSettingsModal state
  const [editingMember, setEditingMember] = useState<AgentTeamMember | null>(null);

  const handleBindMyPets = useCallback(async () => {
    if (bindingPets) return;
    // R7.1 approval gate — surface a confirm before sending the request.
    // v1 simplification: W3.5 PRD calls for a styled approval modal but the
    // message is identical. v0.7.4 hotfix — Tauri 2.0 webview blocks native
    // window.confirm() (returns false silently). Use the official
    // `@tauri-apps/plugin-dialog` `ask()` API; fall back to native confirm
    // only when running outside Tauri (web/SSR/Vitest).
    const message =
      "你的所有 LivingPet 即将成为 Agent Team 成员,可以代你执行任务并花费预算 ($2/day cap)。继续?";
    let ok = false;
    if (typeof window === "undefined") {
      ok = true;
    } else {
      try {
        const { ask } = await import("@tauri-apps/plugin-dialog");
        ok = await ask(message, {
          title: "把宠物加入团队?",
          kind: "warning",
        });
      } catch {
        // Non-Tauri context (or plugin missing): fall back to native confirm.
        ok = window.confirm(message);
      }
    }
    if (!ok) return;

    setBindingPets(true);
    setBindError(null);
    setBindResult(null);
    try {
      // Fetch user's LivingPet ids first. v1 simplification: backend
      // accepts an empty list and binds all owned pets when called via
      // a `*` sentinel. For now pass the visible member ids' parent
      // pet ids if known; else send a sentinel that prompts the API
      // to bind all pets owned by the JWT subject.
      const result = await bindLivingPets({ livingPetIds: ["*"] });
      if (!result) {
        setBindError("绑定失败,请稍后再试");
        return;
      }
      setBindResult(
        result.bound > 0
          ? `✅ 已将 ${result.bound} 只宠物绑定为成员` + (result.skipped > 0 ? ` (${result.skipped} 已跳过)` : "")
          : "所有宠物都已绑定,无新增",
      );
      onReload();
    } catch (e) {
      setBindError(e instanceof Error ? e.message : String(e));
    } finally {
      setBindingPets(false);
    }
  }, [bindingPets, onReload]);

  // v1 simplification — derive subscription tier from userMode for the
  // MemberSettingsModal cap. Real workspace.plan resolution happens in W5.
  const tierForCap: SubscriptionTier =
    userMode === "pro" ? "pro" : userMode === "standard" ? "free" : "free";

  return (
    <section style={populatedStyle}>
      {/* Multi-Agent v1 W5.6 — Weekly summary at the top of the panel.
          Pro Mode shows full card, Simple/Standard shows 1-line summary. */}
      <TeamWeeklyCard mode={userMode} />

      {/* Leader */}
      <div style={leaderRowStyle}>
        <h3 style={sectionTitleStyle}>Leader</h3>
        {snapshot.leader ? (
          <AgentIdentityCard
            agentId={snapshot.leader.agentId}
            size="lg"
            status="idle"
            mode={userMode}
          />
        ) : (
          <p style={{ color: "var(--text-muted)" }}>No leader assigned.</p>
        )}
      </div>

      {/* Members */}
      <div style={memberRowStyle}>
        <h3 style={sectionTitleStyle}>
          Members ({snapshot.members.length})
        </h3>

        {/* Multi-Agent v1 W3.5 — bind LivingPets CTA */}
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 8 }}>
          <button
            type="button"
            onClick={handleBindMyPets}
            disabled={bindingPets}
            style={{
              padding: "6px 12px",
              borderRadius: 6,
              border: "1px solid var(--accent)",
              background: "var(--bg-card)",
              color: "var(--accent)",
              cursor: bindingPets ? "wait" : "pointer",
              fontSize: 12,
              fontWeight: 500,
            }}
          >
            🦊 把我的宠物加入团队
          </button>
          {bindResult && (
            <span style={{ fontSize: 11, color: "var(--tone-success-text, #86efac)" }}>{bindResult}</span>
          )}
          {bindError && (
            <span style={{ fontSize: 11, color: "var(--tone-danger-text, #f87171)" }}>{bindError}</span>
          )}
        </div>

        {snapshot.members.length === 0 ? (
          <p style={{ color: "var(--text-muted)" }}>No members yet.</p>
        ) : (
          <div style={memberGridStyle}>
            {snapshot.members.map((m) => (
              <div
                key={m.id}
                onContextMenu={(e) => {
                  e.preventDefault();
                  setContextMenu({ member: m, x: e.clientX, y: e.clientY });
                }}
                style={{ position: "relative" }}
              >
                <AgentIdentityCard
                  agentId={m.agentId}
                  size="md"
                  status="idle"
                  mode={userMode}
                  onEdit={
                    userMode === "pro"
                      ? () => setEditingMember(m)
                      : undefined
                  }
                />
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Active Sub-Tasks */}
      <div style={subTasksRowStyle}>
        <h3 style={sectionTitleStyle}>Active Sub-Tasks</h3>
        <SubTasksList />
      </div>

      {/* Multi-Agent v1 W6 — Task Graph collapsible section.
          OPTIONAL feature behind backend flag MULTI_AGENT_WORLD_ENGINE_VIZ.
          Renders any agent_tasks chain (parent_task_id non-null) as a
          tree. v1 ship: stubbed empty state until World Engine bridge
          starts emitting (W6.1 server-side). */}
      <TaskGraphSection userMode={userMode} />

      {/* Multi-Agent v1 W3.6 — MemberSettingsModal (Pro Mode) */}
      {editingMember && (
        <MemberSettingsModal
          open={!!editingMember}
          onClose={() => setEditingMember(null)}
          member={{
            id: editingMember.id,
            role: editingMember.role,
            displayName: editingMember.displayName ?? "",
            dailyBudgetUsd:
              typeof editingMember.dailyBudgetUsd === "number"
                ? editingMember.dailyBudgetUsd
                : Number(editingMember.dailyBudgetUsd ?? 2),
            scope: (editingMember.scope as { tools?: string[]; workspace_paths?: string[] } | undefined),
            status:
              editingMember.status === "paused" || editingMember.status === "revoked"
                ? editingMember.status
                : "active",
          }}
          tier={tierForCap}
          onSaved={() => {
            setEditingMember(null);
            onReload();
          }}
        />
      )}

      {contextMenu && (
        <>
          <div
            onClick={() => setContextMenu(null)}
            onContextMenu={(e) => {
              e.preventDefault();
              setContextMenu(null);
            }}
            style={contextMenuBackdrop}
          />
          <div
            role="menu"
            data-keep-dark="1"
            style={{
              position: "fixed",
              left: contextMenu.x,
              top: contextMenu.y,
              ...contextMenuStyle,
            }}
          >
            <button
              type="button"
              onClick={() => {
                onPromote(contextMenu.member);
                setContextMenu(null);
              }}
              style={contextMenuItemStyle}
            >
              ⭐ Promote to Leader
            </button>
          </div>
        </>
      )}
    </section>
  );
}

const panelStyle: CSSProperties = {
  position: "fixed",
  top: 0,
  right: 0,
  bottom: 0,
  width: 480,
  background: "var(--bg-panel)",
  borderLeft: "1px solid var(--border)",
  boxShadow: "var(--shadow)",
  display: "flex",
  flexDirection: "column",
  zIndex: 1500,
};

const headerStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  padding: "14px 18px",
  borderBottom: "1px solid var(--border)",
};

const headerTitleStyle: CSSProperties = {
  margin: 0,
  fontSize: 16,
  fontWeight: 700,
  color: "var(--text)",
};

const closeButtonStyle: CSSProperties = {
  background: "transparent",
  border: "none",
  color: "var(--text-muted)",
  fontSize: 22,
  cursor: "pointer",
  padding: 0,
  lineHeight: 1,
};

const tabBarStyle: CSSProperties = {
  display: "flex",
  gap: 8,
  padding: "8px 16px",
  borderBottom: "1px solid var(--border-light)",
  fontSize: 12,
};

const tabStyle: CSSProperties = {
  padding: "4px 10px",
  borderRadius: 999,
  border: "1px solid transparent",
  background: "transparent",
  color: "var(--text-muted)",
  cursor: "pointer",
};

const tabActiveStyle: CSSProperties = {
  ...tabStyle,
  border: "1px solid var(--border-strong)",
  background: "var(--bg-overlay-medium)",
  color: "var(--text)",
};

const tabPlaceholderStyle: CSSProperties = {
  padding: "4px 10px",
  color: "var(--text-dim)",
  opacity: 0.5,
  fontStyle: "italic",
};

const errorStyle: CSSProperties = {
  margin: "8px 16px",
  padding: 8,
  borderRadius: 6,
  background: "var(--tone-danger-bg)",
  border: "1px solid var(--tone-danger-border)",
  color: "var(--tone-danger-text)",
  fontSize: 12,
};

const loadingStyle: CSSProperties = {
  padding: 16,
  color: "var(--text-muted)",
};

const emptyStateStyle: CSSProperties = {
  padding: 16,
  overflowY: "auto",
};

const populatedStyle: CSSProperties = {
  padding: 16,
  overflowY: "auto",
  display: "flex",
  flexDirection: "column",
  gap: 16,
  flex: 1,
};

const sectionTitleStyle: CSSProperties = {
  fontSize: 12,
  fontWeight: 700,
  textTransform: "uppercase",
  letterSpacing: 0.4,
  color: "var(--text-muted)",
  margin: "0 0 8px",
};

const leaderRowStyle: CSSProperties = { display: "flex", flexDirection: "column" };
const memberRowStyle: CSSProperties = { display: "flex", flexDirection: "column" };
const subTasksRowStyle: CSSProperties = { display: "flex", flexDirection: "column" };

const memberGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))",
  gap: 8,
};

const templateGridStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 8,
};

const templateCardStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 12,
  padding: 10,
  borderRadius: 8,
  border: "1px solid var(--border)",
  background: "var(--bg-card)",
  cursor: "pointer",
  textAlign: "left",
  color: "var(--text)",
};

const contextMenuBackdrop: CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "transparent",
  zIndex: 1600,
};

const contextMenuStyle: CSSProperties = {
  background: "var(--bg-card)",
  border: "1px solid var(--border)",
  borderRadius: 6,
  padding: 4,
  minWidth: 200,
  boxShadow: "var(--shadow)",
  zIndex: 1700,
};

const contextMenuItemStyle: CSSProperties = {
  display: "block",
  width: "100%",
  padding: "8px 12px",
  background: "transparent",
  border: "none",
  color: "var(--text)",
  cursor: "pointer",
  textAlign: "left",
  fontSize: 13,
  borderRadius: 4,
};

// ─────────────────────────────────────────────────────────────────────
// Multi-Agent v1 W6 — Task Graph collapsible section.
//
// Renders the World Engine 4-stage chain (or any parent_task_id chain
// in the future) as a tree below "Active Sub-Tasks". Default collapsed
// + empty until backend flag `MULTI_AGENT_WORLD_ENGINE_VIZ` flips on.
//
// Spec: design.md §14.2; tasks.md W6.2 + W6.3
// ─────────────────────────────────────────────────────────────────────
function TaskGraphSection({ userMode }: { userMode: "simple" | "standard" | "pro" }) {
  const [expanded, setExpanded] = useState(false);

  // Simple Mode: collapse 4 stages into one ambient line per W6.3.
  // v1: until backend emits, render an ambient placeholder when expanded.
  if (userMode === "simple") {
    return (
      <div style={{ fontSize: 12, color: "var(--text-dim)", padding: "8px 0" }}>
        {/* Collapsed default for Simple Mode (per R14.4). When World
            Engine emits stages, this becomes "📷 阿喵 正在让你的玩具变成游戏角色…" */}
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column" }}>
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        style={{
          background: "transparent",
          border: "none",
          color: "var(--text-muted)",
          cursor: "pointer",
          fontSize: 12,
          fontWeight: 700,
          padding: "8px 0",
          textAlign: "left",
          display: "flex",
          alignItems: "center",
          gap: 6,
        }}
      >
        <span aria-hidden>{expanded ? "▼" : "▶"}</span>
        <span>Task Graph</span>
        <span style={{ fontSize: 10, opacity: 0.7, fontWeight: 400 }}>
          (W6 — World Engine 4-stage chain visualization)
        </span>
      </button>
      {expanded && (
        <div
          style={{
            padding: "8px 12px",
            background: "var(--bg-overlay-light, rgba(255,255,255,0.04))",
            borderRadius: 6,
            fontSize: 12,
            color: "var(--text-muted)",
          }}
        >
          {/* v1 placeholder until W6.1 backend bridge starts emitting.
              When MULTI_AGENT_WORLD_ENGINE_VIZ=1 on prod, this section
              fetches /api/agent-tasks?targetKind=leader-direct&groupBy=root
              and renders the chain as a tree per design §14.2. */}
          <div>📷 No World Engine runs yet.</div>
          <div style={{ marginTop: 4, fontSize: 10, opacity: 0.7 }}>
            Scan a real-world object via the World Engine scanner to see
            the 4 stages here (reconstruction → AI interpretation →
            character generation → battle-prep).
          </div>
        </div>
      )}
    </div>
  );
}


// ─────────────────────────────────────────────────────────────────────
// Multi-Agent v2 W8 — Pet Arena tab.
// Caller selects this tab → fetches /api/pet-arena/ladder/me. If
// flag MULTI_AGENT_PET_ARENA_ENABLED is OFF on backend, all calls
// return 400 and we render an "off" empty state.
// Spec: tasks.md W8.3
// ─────────────────────────────────────────────────────────────────────
function PetArenaTab({ userMode }: { userMode: "simple" | "standard" | "pro" }) {
  return (
    <section style={populatedStyle}>
      <h3 style={sectionTitleStyle}>Arena</h3>
      {userMode === "simple" ? (
        <p style={{ fontSize: 13, color: "var(--text-muted)" }}>
          🏟 你的宠物可以和别人的宠物一起玩对战。点这里看战绩。
        </p>
      ) : (
        <>
          <p style={{ fontSize: 13, color: "var(--text-muted)" }}>
            Pet Arena (v2 W8) — Pet vs Pet competitive matches with ELO ranking.
          </p>
          <ul style={{ paddingLeft: 18, fontSize: 12, color: "var(--text-dim)" }}>
            <li>
              <code>POST /api/pet-arena/match</code> — create match
            </li>
            <li>
              <code>POST /api/pet-arena/match/:id/resolve</code> — finalize
            </li>
            <li>
              <code>GET /api/pet-arena/ladder/me</code> — my ranking
            </li>
          </ul>
          <p style={{ fontSize: 11, color: "var(--text-dim)", marginTop: 8 }}>
            Backend feature flag: <code>MULTI_AGENT_PET_ARENA_ENABLED=1</code>
            <br />
            Default OFF — endpoints return 400 unless flipped on by ops.
            Match-creation UI ships in v2.1 sprint.
          </p>
        </>
      )}
    </section>
  );
}

// ─────────────────────────────────────────────────────────────────────
// SubTasksList — v0.7.18 ship. Real-time view of running + recently
// finished sub-tasks. Polls `/api/agent-tasks` every 5s + listens to
// `presence:multi-agent.sub-task-completed` socket event for instant
// updates. Replaces the W2 placeholder string.
// ─────────────────────────────────────────────────────────────────────
interface SubTaskRow {
  id: string;
  title: string;
  status: 'queued' | 'running' | 'awaiting_input' | 'succeeded' | 'failed' | 'canceled';
  parentTaskId: string | null;
  resultSummary: string | null;
  errorMessage: string | null;
  costUsd: number;
  progress: number;
  createdAt: string;
  completedAt: string | null;
}

function SubTasksList() {
  const [tasks, setTasks] = useState<SubTaskRow[]>([]);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const { API_BASE, useAuthStore } = await import("../services/store");
      const token = useAuthStore.getState().token;
      if (!token) return;
      const res = await fetch(`${API_BASE}/agent-tasks?limit=20`, {
        credentials: "include",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return;
      const json = await res.json();
      const list: SubTaskRow[] = Array.isArray(json) ? json : (json?.items || []);
      // Show sub-tasks (parent_task_id non-null) OR any non-terminal task
      // so spawn results are visible even when called from leader chat directly.
      const filtered = list
        .filter((t) =>
          t.parentTaskId !== null ||
          t.status === 'queued' || t.status === 'running' || t.status === 'awaiting_input'
        )
        .slice(0, 8);
      setTasks(filtered);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    setLoading(true);
    void refresh().finally(() => setLoading(false));
    const t = setInterval(refresh, 5_000);

    // Socket: instant refresh when a sub-task completes
    const onSocket = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (
        detail?.event === 'presence:multi-agent.sub-task-completed' ||
        detail?.event === 'presence:multi-agent.team-activity-update'
      ) {
        void refresh();
      }
    };
    window.addEventListener('agentrix:socket-event', onSocket as EventListener);
    return () => {
      clearInterval(t);
      window.removeEventListener('agentrix:socket-event', onSocket as EventListener);
    };
  }, [refresh]);

  if (loading && tasks.length === 0) {
    return <p style={{ color: 'var(--text-dim)', fontSize: 12 }}>Loading…</p>;
  }
  if (tasks.length === 0) {
    return (
      <p style={{ color: 'var(--text-dim)', fontSize: 12 }}>
        No active sub-tasks. The Leader will populate this when it calls `agent_run`.
      </p>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {tasks.map((t) => (
        <SubTaskRowCard key={t.id} task={t} />
      ))}
    </div>
  );
}

function SubTaskRowCard({ task }: { task: SubTaskRow }) {
  const statusColor =
    task.status === 'succeeded' ? '#4ade80' :
    task.status === 'failed' ? '#f87171' :
    task.status === 'canceled' ? '#9ca3af' :
    task.status === 'running' ? '#60a5fa' :
    task.status === 'awaiting_input' ? '#fbbf24' :
    'var(--text-dim)';

  const statusLabel =
    task.status === 'succeeded' ? '✓ done' :
    task.status === 'failed' ? '✗ failed' :
    task.status === 'canceled' ? '⊘ canceled' :
    task.status === 'running' ? '● running' :
    task.status === 'awaiting_input' ? '⏸ awaiting' :
    '◌ queued';

  const subtitle = task.resultSummary || task.errorMessage || `id ${task.id.slice(0, 8)}`;

  return (
    <div
      style={{
        padding: '8px 10px',
        background: 'var(--bg-elevated)',
        borderRadius: 6,
        border: '1px solid var(--border)',
        fontSize: 12,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
        <span style={{ fontWeight: 500, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {task.title}
        </span>
        <span style={{ color: statusColor, flexShrink: 0, fontSize: 11 }}>{statusLabel}</span>
      </div>
      <div style={{ color: 'var(--text-dim)', fontSize: 11, marginTop: 4, lineHeight: 1.4, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' as const }}>
        {subtitle}
      </div>
      {task.costUsd > 0 && (
        <div style={{ color: 'var(--text-dim)', fontSize: 10, marginTop: 2 }}>
          ${task.costUsd.toFixed(4)}
          {task.completedAt && task.createdAt && (
            <span style={{ marginLeft: 8 }}>
              {Math.round((new Date(task.completedAt).getTime() - new Date(task.createdAt).getTime()) / 1000)}s
            </span>
          )}
        </div>
      )}
    </div>
  );
}

function PetLadderTab({ userMode }: { userMode: "simple" | "standard" | "pro" }) {
  const [rows, setRows] = useState<
    Array<{
      livingPetId: string;
      petName: string;
      elo: number;
      wins: number;
      losses: number;
      rank: number;
      productivityScore: number;
    }>
  >([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    // Lazy-load fetch — we don't want to block tab switch on the
    // network call.
    void (async () => {
      try {
        const { API_BASE, useAuthStore } = await import("../services/store");
        const token = useAuthStore.getState().token;
        const res = await fetch(`${API_BASE}/pet-arena/ladder/me`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        if (!res.ok) {
          if (res.status === 400) {
            // Flag off — friendly empty state
            setError("arena_disabled");
            return;
          }
          throw new Error(`HTTP ${res.status}`);
        }
        const body = (await res.json()) as { data?: typeof rows };
        if (!cancelled) setRows(body.data ?? []);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <section style={populatedStyle}>
      <h3 style={sectionTitleStyle}>Ladder</h3>
      {loading && (
        <p style={{ fontSize: 12, color: "var(--text-muted)" }}>Loading…</p>
      )}
      {error === "arena_disabled" && (
        <p style={{ fontSize: 12, color: "var(--text-dim)" }}>
          🏟 Arena is not enabled on this server yet. Check back after v2 launch!
        </p>
      )}
      {error && error !== "arena_disabled" && (
        <p style={{ fontSize: 12, color: "var(--tone-danger-text, #f87171)" }}>
          Error: {error}
        </p>
      )}
      {!loading && !error && rows.length === 0 && (
        <p style={{ fontSize: 12, color: "var(--text-muted)" }}>
          {userMode === "simple"
            ? "你的宠物还没有打过比赛。"
            : "No matches played yet — create one in the Arena tab."}
        </p>
      )}
      {!loading && rows.length > 0 && (
        <ol style={{ paddingLeft: 0, listStyle: "none", margin: 0 }}>
          {rows.map((r) => (
            <li
              key={r.livingPetId}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "6px 8px",
                borderRadius: 6,
                background: "var(--bg-overlay-light, rgba(255,255,255,0.04))",
                marginBottom: 4,
              }}
            >
              <span style={{ fontSize: 11, fontWeight: 700, width: 24, opacity: 0.6 }}>
                #{r.rank}
              </span>
              <span style={{ fontSize: 13, fontWeight: 500, flex: 1 }}>{r.petName}</span>
              <span style={{ fontSize: 11, color: "var(--tone-info-text, #7dd3fc)" }}>
                {r.elo} ELO
              </span>
              {userMode !== "simple" && (
                <span style={{ fontSize: 10, color: "var(--text-muted)" }}>
                  {r.wins}W {r.losses}L
                </span>
              )}
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

// ─────────────────────────────────────────────────────────────────────
// MarketplaceTab — v2.1 W7.2 / P1 #13
//
// Lists the user's own marketplace pets (toggle list/unlist + view
// earnings) and shows a quick "雇佣 marketplace pet" panel that calls
// `dispatchMarketplaceHire`. Backend gated by env
// `MULTI_AGENT_MARKETPLACE_HIRE_ENABLED=1`; when off endpoints return
// 400 and we render a disabled state.
//
// Spec: MULTI_AGENT_V2_1_PRODUCT_DECISIONS §6 (Uber-ceiling pricing).
// ─────────────────────────────────────────────────────────────────────
function MarketplaceTab({ userMode }: { userMode: "simple" | "standard" | "pro" }) {
  const [myListings, setMyListings] = useState<
    Array<{
      livingPetId: string;
      petName: string;
      agentAccountId: string;
      listed: boolean;
      publishedHireCostUsd: number | null;
      lifetimeHireCount: number;
      lifetimeEarnedUsd: number;
    }>
  >([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hireRole, setHireRole] = useState("researcher");
  const [hirePrompt, setHirePrompt] = useState("");
  const [hireBudget, setHireBudget] = useState(0.5);
  const [hireBusy, setHireBusy] = useState(false);
  const [hireResult, setHireResult] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    void (async () => {
      try {
        const { API_BASE, useAuthStore } = await import("../services/store");
        const token = useAuthStore.getState().token;
        const res = await fetch(`${API_BASE}/multi-agent/marketplace/my-pets`, {
          credentials: "include",
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const body = await res.json();
        if (cancelled) return;
        const list = Array.isArray(body)
          ? body
          : Array.isArray(body?.data)
            ? body.data
            : [];
        setMyListings(list);
      } catch (e) {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (cancelled) return;
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const toggleListing = useCallback(
    async (
      livingPetId: string,
      currentlyListed: boolean,
      currentCost: number | null,
    ) => {
      try {
        const { API_BASE, useAuthStore } = await import("../services/store");
        const token = useAuthStore.getState().token;
        const r = await fetch(
          `${API_BASE}/multi-agent/marketplace/list/${livingPetId}`,
          {
            method: "POST",
            headers: {
              ...(token ? { Authorization: `Bearer ${token}` } : {}),
              "Content-Type": "application/json",
            },
            credentials: "include",
            body: JSON.stringify({
              listed: !currentlyListed,
              publishedHireCostUsd: currentCost ?? 0.5,
            }),
          },
        );
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        setMyListings((prev) =>
          prev.map((p) =>
            p.livingPetId === livingPetId ? { ...p, listed: !currentlyListed } : p,
          ),
        );
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    },
    [],
  );

  const handleHire = useCallback(async () => {
    if (hireBusy) return;
    if (!hireRole.trim() || !hirePrompt.trim()) {
      setHireResult("⚠️ 请填 role 和 prompt");
      return;
    }
    setHireBusy(true);
    setHireResult(null);
    try {
      const { dispatchMarketplaceHire } = await import("../services/spawnTool");
      const r = await dispatchMarketplaceHire({
        // No parent task id — Marketplace tab is standalone, server creates an
        // anonymous parent for testing. In production this CTA is wired into
        // a chat session and `parentTaskId` comes from the leader chat.
        parentTaskId: "marketplace-tab-test",
        role: hireRole.trim(),
        prompt: hirePrompt.trim(),
        budgetUsd: hireBudget,
      });
      const json = JSON.parse(r);
      if (json.error) {
        setHireResult(`⚠️ ${json.error}: ${json.message}`);
      } else if (json.subTaskId) {
        setHireResult(
          `✅ sub-task ${json.subTaskId.slice(0, 8)} dispatched (${json.targetKind})`,
        );
      } else {
        setHireResult("⚠️ 未知响应");
      }
    } catch (e) {
      setHireResult(e instanceof Error ? e.message : String(e));
    } finally {
      setHireBusy(false);
    }
  }, [hireRole, hirePrompt, hireBudget, hireBusy]);

  return (
    <section style={populatedStyle}>
      <h3 style={sectionTitleStyle}>Marketplace</h3>
      {userMode === "simple" ? (
        <p style={{ fontSize: 13, color: "var(--text-muted)" }}>
          🛒 你的宠物可以代别人完成任务,获得真实收入。这里管理上架与雇佣。
        </p>
      ) : null}

      {/* MY LISTINGS — earned-from-work badge (P1 #9) */}
      <div style={{ marginTop: 12 }}>
        <h4 style={{ fontSize: 13, margin: "8px 0", color: "var(--text)" }}>
          我的上架 Pet
        </h4>
        {loading ? (
          <div style={loadingStyle}>Loading…</div>
        ) : error ? (
          <div style={errorStyle}>{error}</div>
        ) : myListings.length === 0 ? (
          <p style={{ fontSize: 12, color: "var(--text-muted)" }}>
            没有上架的宠物。在 Pet 详情页打开 Marketplace 上架。
          </p>
        ) : (
          <ul style={{ margin: 0, padding: 0, listStyle: "none" }}>
            {myListings.map((p) => (
              <li
                key={p.livingPetId}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  padding: "6px 8px",
                  borderRadius: 4,
                  background: p.listed ? "rgba(76,175,80,0.08)" : "transparent",
                  border: p.listed ? "1px solid rgba(76,175,80,0.30)" : "1px solid var(--border)",
                  marginBottom: 6,
                }}
              >
                <div>
                  <span style={{ fontSize: 12, fontWeight: 600 }}>{p.petName}</span>
                  {p.lifetimeHireCount > 0 ? (
                    <span style={{ marginLeft: 8, fontSize: 11, color: "#4caf50" }}>
                      🏆 帮 {p.lifetimeHireCount} 人完成 · 赚 ${p.lifetimeEarnedUsd.toFixed(2)}
                    </span>
                  ) : null}
                </div>
                <button
                  type="button"
                  onClick={() =>
                    toggleListing(p.livingPetId, p.listed, p.publishedHireCostUsd)
                  }
                  style={tabStyle}
                >
                  {p.listed ? "下架" : "上架"}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* HIRE PANEL */}
      <div style={{ marginTop: 16 }}>
        <h4 style={{ fontSize: 13, margin: "8px 0", color: "var(--text)" }}>
          雇佣 marketplace pet
        </h4>
        <p style={{ fontSize: 11, color: "var(--text-muted)", margin: "4px 0 8px 0" }}>
          Uber-ceiling pricing — 实际只按真实成本计费,不超过你设定的上限。
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <input
            type="text"
            value={hireRole}
            onChange={(e) => setHireRole(e.target.value)}
            placeholder="role (e.g. researcher, coder, qa_ops)"
            style={{
              padding: 6,
              fontSize: 12,
              borderRadius: 4,
              border: "1px solid var(--border)",
              background: "var(--bg-elevated)",
              color: "var(--text)",
            }}
          />
          <textarea
            value={hirePrompt}
            onChange={(e) => setHirePrompt(e.target.value)}
            placeholder="prompt — 描述任务"
            rows={3}
            style={{
              padding: 6,
              fontSize: 12,
              borderRadius: 4,
              border: "1px solid var(--border)",
              background: "var(--bg-elevated)",
              color: "var(--text)",
              resize: "vertical",
            }}
          />
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <label style={{ fontSize: 11, color: "var(--text-muted)" }}>预算上限 USD</label>
            <input
              type="number"
              min={0.1}
              max={10}
              step={0.1}
              value={hireBudget}
              onChange={(e) => setHireBudget(parseFloat(e.target.value) || 0.5)}
              style={{
                width: 72,
                padding: 4,
                fontSize: 12,
                borderRadius: 4,
                border: "1px solid var(--border)",
                background: "var(--bg-elevated)",
                color: "var(--text)",
              }}
            />
            <button
              type="button"
              onClick={handleHire}
              disabled={hireBusy}
              style={{
                ...tabActiveStyle,
                opacity: hireBusy ? 0.6 : 1,
                cursor: hireBusy ? "wait" : "pointer",
              }}
            >
              {hireBusy ? "派遣中…" : `雇佣 (≤ $${hireBudget.toFixed(2)})`}
            </button>
          </div>
          {hireResult ? (
            <div
              style={{
                fontSize: 11,
                padding: 6,
                borderRadius: 4,
                background: hireResult.startsWith("✅")
                  ? "rgba(76,175,80,0.12)"
                  : "rgba(244,67,54,0.12)",
                color: "var(--text)",
              }}
            >
              {hireResult}
            </div>
          ) : null}
        </div>
        <p style={{ fontSize: 10, color: "var(--text-dim)", marginTop: 12 }}>
          Backend feature flag: <code>MULTI_AGENT_MARKETPLACE_HIRE_ENABLED=1</code>。Default
          OFF — endpoints return 400 直到 ops 翻开。
        </p>
      </div>
    </section>
  );
}
