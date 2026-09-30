/**
 * AgentOpsPanel — crypto-native Agent Ops 工作台 (desktop "pro" surface).
 *
 * Launched via the floating-ball menu / ChatPanel through the
 * `agentrix:open-agent-ops` custom event. Mirrors CrossDevicePanel.tsx
 * conventions: a tabbed overlay panel fetching the backend through the
 * `agentOpsApi` client (apiFetch + bearer token from useAuthStore).
 *
 * Tabs:
 *   Tasks · Due Diligence · Monitors · Security · Deliverables · Metrics
 *   · Packages (B2B 交付包) · Team (团队产品化)
 *
 * Honesty / safety guarantees surfaced in the UI (per spec Property 4 / 8):
 *   - Security simulate → available:false renders an explicit "未启用/降级" state.
 *   - Scam check → risk 'unknown' renders as an explicit unknown, never faked.
 *   - Due diligence → 「未获取」(notFetched) markers + degraded honesty.
 *   - Revoke guidance / write-actions → show the UNSIGNED plan / graded
 *     decision; the panel NEVER auto-executes funds or auto-publishes.
 */
import { useCallback, useEffect, useState } from "react";
import { useAuthStore } from "../services/store";
import agentOpsApi, {
  type AgentOpsTask,
  type AgentOpsTaskType,
  type AgentOpsRiskTier,
  type AgentOpsDeliverable,
  type MonitorSubscription,
  type MonitorType,
  type DueDiligenceRunResult,
  type DueDiligenceTargetKind,
  type ApprovalScanResult,
  type ScamCheckResult,
  type ScamTargetKind,
  type TransactionSimulationResult,
  type RevokeGuidance,
  type ReliabilitySnapshot,
} from "../services/agentOpsApi";
import { aoStyles, riskTierColor, decisionColor, decisionLabel, fmtPercent, fmtMs } from "./agentOpsShared";
import DeliveryPackagesPanel from "./DeliveryPackagesPanel";
import TeamProductizationPanel from "./TeamProductizationPanel";

type AoTab =
  | "tasks"
  | "duediligence"
  | "monitors"
  | "security"
  | "deliverables"
  | "metrics"
  | "packages"
  | "team";

const TAB_DEFS: { key: AoTab; label: string }[] = [
  { key: "tasks", label: "📋 Tasks" },
  { key: "duediligence", label: "🔍 尽调" },
  { key: "monitors", label: "📡 Monitors" },
  { key: "security", label: "🛡 Security" },
  { key: "deliverables", label: "📦 Deliverables" },
  { key: "metrics", label: "📈 Metrics" },
  { key: "packages", label: "🧩 Packages" },
  { key: "team", label: "👥 Team" },
];

const TASK_TYPES: AgentOpsTaskType[] = [
  "due_diligence",
  "monitor",
  "security",
  "growth_social",
  "growth_content",
  "growth_kol",
  "growth_quest",
  "growth_moderation",
  "growth_whitelist",
  "sybil_detection",
  "other",
];

const MONITOR_TYPES: MonitorType[] = [
  "price",
  "liquidation",
  "depeg",
  "governance",
  "token_unlock",
  "airdrop_window",
  "approval_security",
  "protocol_metric",
  "treasury",
  "other",
];

interface Props {
  visible: boolean;
  onClose: () => void;
  /** Optional starting tab (event detail). */
  initialTab?: AoTab;
}

export default function AgentOpsPanel({ visible, onClose, initialTab = "tasks" }: Props) {
  const { token, agents, activeAgentId } = useAuthStore();
  const agentId = activeAgentId || agents[0]?.id || null;

  const [activeTab, setActiveTab] = useState<AoTab>(initialTab);
  const [tasks, setTasks] = useState<AgentOpsTask[]>([]);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Bumped by the header refresh button to remount tab-local fetchers.
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (visible) setActiveTab(initialTab);
  }, [visible, initialTab]);

  const refreshTasks = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const list = await agentOpsApi.listTasks(token);
      setTasks(Array.isArray(list) ? list : []);
      setSelectedTaskId((prev) => prev || (Array.isArray(list) && list[0]?.id) || null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    if (visible) void refreshTasks();
  }, [visible, refreshTasks]);

  if (!visible) return null;

  const refresh = () => {
    if (activeTab === "tasks" || activeTab === "deliverables") void refreshTasks();
    // Tab-local refreshers manage their own data; bump a reload via key change.
    setReloadKey((k) => k + 1);
  };

  return (
    <div style={aoStyles.overlay} onClick={onClose}>
      <div style={aoStyles.panel} id="agent-ops-panel" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div style={aoStyles.header}>
          <span style={aoStyles.title}>🛠 Agent Ops</span>
          <div style={aoStyles.headerRight}>
            <span style={aoStyles.badge}>{tasks.length} tasks</span>
            <button onClick={onClose} style={aoStyles.closeBtn} data-testid="ao-close" aria-label="Close">
              ✕
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div style={aoStyles.tabBar}>
          {TAB_DEFS.map((t) => (
            <button
              key={t.key}
              id={`ao-tab-${t.key}`}
              data-testid={`ao-tab-${t.key}`}
              onClick={() => setActiveTab(t.key)}
              style={activeTab === t.key ? { ...aoStyles.tab, ...aoStyles.tabActive } : aoStyles.tab}
            >
              {t.label}
            </button>
          ))}
          <button onClick={refresh} style={aoStyles.refreshBtn} disabled={loading} data-testid="ao-refresh">
            {loading ? "↻" : "⟳"}
          </button>
        </div>

        {/* Content */}
        <div style={aoStyles.content} data-testid={`ao-content-${activeTab}`}>
          {!token && <div style={aoStyles.empty}>请先登录 / Sign in required</div>}
          {token && error && activeTab === "tasks" && <div style={aoStyles.errorBox}>{error}</div>}

          {token && activeTab === "tasks" && (
            <TasksTab
              tasks={tasks}
              loading={loading}
              agentId={agentId}
              token={token}
              selectedTaskId={selectedTaskId}
              onSelect={setSelectedTaskId}
              onCreated={refreshTasks}
            />
          )}
          {token && activeTab === "duediligence" && (
            <DueDiligenceTab key={reloadKey} token={token} agentId={agentId} tasks={tasks} defaultTaskId={selectedTaskId} />
          )}
          {token && activeTab === "monitors" && (
            <MonitorsTab key={reloadKey} token={token} agentId={agentId} />
          )}
          {token && activeTab === "security" && (
            <SecurityTab key={reloadKey} token={token} agentId={agentId} />
          )}
          {token && activeTab === "deliverables" && (
            <DeliverablesTab key={reloadKey} token={token} tasks={tasks} selectedTaskId={selectedTaskId} onSelectTask={setSelectedTaskId} />
          )}
          {token && activeTab === "metrics" && <MetricsTab key={reloadKey} token={token} agentId={agentId} />}
          {token && activeTab === "packages" && (
            <DeliveryPackagesPanel key={reloadKey} token={token} agentId={agentId} taskId={selectedTaskId} />
          )}
          {token && activeTab === "team" && <TeamProductizationPanel key={reloadKey} token={token} />}
        </div>
      </div>
    </div>
  );
}


// ════════════════════════════ Tasks ════════════════════════════

function statusColor(status: string): string {
  switch (status) {
    case "completed":
      return "#22c55e";
    case "running":
      return "#60a5fa";
    case "awaiting_approval":
      return "#f59e0b";
    case "failed":
    case "cancelled":
      return "#ef4444";
    default:
      return "#94a3b8";
  }
}

function TasksTab({
  tasks,
  loading,
  agentId,
  token,
  selectedTaskId,
  onSelect,
  onCreated,
}: {
  tasks: AgentOpsTask[];
  loading: boolean;
  agentId: string | null;
  token: string;
  selectedTaskId: string | null;
  onSelect: (id: string) => void;
  onCreated: () => void;
}) {
  const [showForm, setShowForm] = useState(false);
  const [type, setType] = useState<AgentOpsTaskType>("due_diligence");
  const [riskTier, setRiskTier] = useState<AgentOpsRiskTier>("read");
  const [creating, setCreating] = useState(false);
  const [formErr, setFormErr] = useState<string | null>(null);

  const create = useCallback(async () => {
    if (!agentId) {
      setFormErr("无可用 Agent / No active agent");
      return;
    }
    setCreating(true);
    setFormErr(null);
    try {
      await agentOpsApi.createTask(token, { agentId, type, riskTier });
      setShowForm(false);
      onCreated();
    } catch (err) {
      setFormErr(err instanceof Error ? err.message : String(err));
    } finally {
      setCreating(false);
    }
  }, [agentId, token, type, riskTier, onCreated]);

  return (
    <div style={aoStyles.list}>
      <button
        style={aoStyles.actionBtn}
        onClick={() => setShowForm((s) => !s)}
        data-testid="ao-task-new-toggle"
      >
        {showForm ? "✕ 取消 / Cancel" : "+ 新建任务 / New task"}
      </button>

      {showForm && (
        <div style={aoStyles.card}>
          <div style={aoStyles.dim}>Agent: {agentId ? agentId.slice(0, 8) + "…" : "—"}</div>
          <div style={aoStyles.field}>
            <label style={aoStyles.label}>任务类型 / Type</label>
            <select
              style={aoStyles.input}
              value={type}
              onChange={(e) => setType(e.target.value as AgentOpsTaskType)}
              data-testid="ao-task-type"
            >
              {TASK_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>
          <div style={aoStyles.field}>
            <label style={aoStyles.label}>风险分级 / Risk tier</label>
            <select
              style={aoStyles.input}
              value={riskTier}
              onChange={(e) => setRiskTier(e.target.value as AgentOpsRiskTier)}
              data-testid="ao-task-risk"
            >
              {(["read", "medium", "high", "redline"] as AgentOpsRiskTier[]).map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </div>
          <button style={aoStyles.primaryBtn} disabled={creating} onClick={create} data-testid="ao-task-create-btn">
            {creating ? "创建中…" : "创建 / Create"}
          </button>
          {formErr && <div style={aoStyles.errorBox}>{formErr}</div>}
        </div>
      )}

      {loading && !tasks.length && <div style={aoStyles.empty}>加载中… / Loading…</div>}
      {!loading && !tasks.length && <div style={aoStyles.empty}>暂无任务 / No tasks yet</div>}

      {tasks.map((t) => (
        <div
          key={t.id}
          style={{
            ...aoStyles.card,
            borderLeft: selectedTaskId === t.id ? "3px solid #3b82f6" : aoStyles.card.border as string,
          }}
          onClick={() => onSelect(t.id)}
          data-testid={`ao-task-card-${t.id}`}
        >
          <div style={aoStyles.cardHeader}>
            <span style={aoStyles.cardTitle}>{t.type}</span>
            <span style={{ ...aoStyles.badge, background: "transparent", color: statusColor(t.status) }}>
              ● {t.status}
            </span>
          </div>
          <div style={aoStyles.dim}>
            风险 <span style={{ color: riskTierColor(t.riskTier) }}>{t.riskTier}</span> · 审批 {t.approvalState} ·{" "}
            {t.id.slice(0, 8)}…
          </div>
        </div>
      ))}
    </div>
  );
}


// ════════════════════════ Due Diligence ════════════════════════

function DueDiligenceTab({
  token,
  agentId,
  tasks,
  defaultTaskId,
}: {
  token: string;
  agentId: string | null;
  tasks: AgentOpsTask[];
  defaultTaskId: string | null;
}) {
  const [taskId, setTaskId] = useState<string>(defaultTaskId || "");
  const [kind, setKind] = useState<DueDiligenceTargetKind>("token");
  const [chain, setChain] = useState("ethereum");
  const [address, setAddress] = useState("");
  const [name, setName] = useState("");
  const [project, setProject] = useState("");
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<DueDiligenceRunResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(async () => {
    if (!agentId) {
      setError("无可用 Agent / No active agent");
      return;
    }
    if (!taskId) {
      setError("请选择关联任务 / Pick a task");
      return;
    }
    setRunning(true);
    setError(null);
    setResult(null);
    try {
      const res = await agentOpsApi.runDueDiligence(token, {
        taskId,
        agentId,
        target: {
          kind,
          chain: chain.trim() || undefined,
          address: address.trim() || undefined,
          name: name.trim() || undefined,
          project: project.trim() || undefined,
        },
        persist: false,
      });
      setResult(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setRunning(false);
    }
  }, [token, agentId, taskId, kind, chain, address, name, project]);

  const report = result?.report;
  const validation = result?.validation;

  return (
    <div style={aoStyles.list}>
      <div style={aoStyles.card}>
        <div style={aoStyles.field}>
          <label style={aoStyles.label}>关联任务 / Task</label>
          <select
            style={aoStyles.input}
            value={taskId}
            onChange={(e) => setTaskId(e.target.value)}
            data-testid="ao-dd-task"
          >
            <option value="">— 选择任务 / select —</option>
            {tasks.map((t) => (
              <option key={t.id} value={t.id}>
                {t.type} · {t.id.slice(0, 8)}…
              </option>
            ))}
          </select>
        </div>
        <div style={aoStyles.formRow}>
          <div style={{ flex: 1 }}>
            <label style={aoStyles.label}>标的类型 / Kind</label>
            <select
              style={aoStyles.input}
              value={kind}
              onChange={(e) => setKind(e.target.value as DueDiligenceTargetKind)}
              data-testid="ao-dd-kind"
            >
              {(["token", "wallet", "contract", "project"] as DueDiligenceTargetKind[]).map((k) => (
                <option key={k} value={k}>
                  {k}
                </option>
              ))}
            </select>
          </div>
          <div style={{ flex: 1 }}>
            <label style={aoStyles.label}>链 / Chain</label>
            <input style={aoStyles.input} value={chain} onChange={(e) => setChain(e.target.value)} data-testid="ao-dd-chain" />
          </div>
        </div>
        <div style={aoStyles.field}>
          <label style={aoStyles.label}>地址 / Address</label>
          <input style={aoStyles.input} value={address} onChange={(e) => setAddress(e.target.value)} placeholder="0x…" data-testid="ao-dd-address" />
        </div>
        <div style={aoStyles.formRow}>
          <div style={{ flex: 1 }}>
            <label style={aoStyles.label}>名称 / Name</label>
            <input style={aoStyles.input} value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div style={{ flex: 1 }}>
            <label style={aoStyles.label}>项目 / Project</label>
            <input style={aoStyles.input} value={project} onChange={(e) => setProject(e.target.value)} />
          </div>
        </div>
        <button style={aoStyles.primaryBtn} disabled={running} onClick={run} data-testid="ao-dd-run-btn">
          {running ? "尽调运行中…" : "运行尽调 / Run due diligence"}
        </button>
        {error && <div style={aoStyles.errorBox}>{error}</div>}
      </div>

      {report && validation && (
        <div id="ao-dd-report" data-testid="ao-dd-report">
          {/* Qualified verdict */}
          <div
            style={{
              ...aoStyles.card,
              borderLeft: `3px solid ${validation.qualified ? "#22c55e" : "#f59e0b"}`,
            }}
          >
            <div style={aoStyles.cardHeader}>
              <span style={aoStyles.cardTitle}>
                {validation.qualified ? "✓ 合格交付物 / Qualified" : "⚠ 不合格 / Not qualified"}
              </span>
              <span style={aoStyles.badge}>
                风险 {report.conclusion.riskRating ?? "未获取"}
              </span>
            </div>
            <div style={aoStyles.dim}>
              采集时间 {report.collectedAt ?? "未获取"} · 时延 {fmtMs(report.latencyMs)}
            </div>
            {report.conclusion.summary ? (
              <div style={aoStyles.muted}>{report.conclusion.summary}</div>
            ) : (
              <div style={aoStyles.notice}>结论摘要「未获取」— 未编造 / not fabricated</div>
            )}
          </div>

          {/* Checklist */}
          <div style={aoStyles.sectionTitle}>✅ 验收清单 / Checklist</div>
          {validation.checks.map((c) => (
            <div key={c.id} style={aoStyles.rowItem}>
              <span style={aoStyles.muted}>
                {c.passed ? "✓" : "✗"} {c.id} · {c.label}
              </span>
              {!c.passed && c.reason && <span style={{ ...aoStyles.dim, color: "#f87171" }}>{c.reason}</span>}
            </div>
          ))}

          {/* Not-fetched markers (degraded honesty) */}
          {report.notFetched.length > 0 && (
            <>
              <div style={aoStyles.sectionTitle}>🚫 未获取字段 / Not fetched</div>
              <div style={aoStyles.card}>
                <div style={aoStyles.dim}>
                  以下字段显式标「未获取」,绝不编造 / explicitly not fetched, never fabricated:
                </div>
                <div style={aoStyles.muted}>{report.notFetched.join(" · ")}</div>
              </div>
            </>
          )}

          {/* Source links (provenance) */}
          <div style={aoStyles.sectionTitle}>🔗 可核来源 / Sources</div>
          {report.sourceLinks.length ? (
            report.sourceLinks.map((s, i) => (
              <div key={`${s.url}-${i}`} style={aoStyles.rowItem}>
                <span style={aoStyles.dim}>
                  {s.status === "fetched" ? "✓" : "○"} {s.source}
                </span>
                <span style={{ ...aoStyles.dim, maxWidth: 280, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {s.url || "(无链接 / no url)"}
                </span>
              </div>
            ))
          ) : (
            <div style={aoStyles.empty}>无来源链接 / No source links</div>
          )}
        </div>
      )}
    </div>
  );
}


// ════════════════════════════ Monitors ════════════════════════════

function MonitorsTab({ token, agentId }: { token: string; agentId: string | null }) {
  const [monitors, setMonitors] = useState<MonitorSubscription[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [monitorType, setMonitorType] = useState<MonitorType>("price");
  const [conditionText, setConditionText] = useState('{"target":"","threshold":0}');
  const [interval, setIntervalSecs] = useState(3600);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const list = await agentOpsApi.listMonitors(token);
      setMonitors(Array.isArray(list) ? list : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const create = useCallback(async () => {
    if (!agentId) {
      setError("无可用 Agent / No active agent");
      return;
    }
    let condition: Record<string, unknown> = {};
    try {
      condition = conditionText.trim() ? JSON.parse(conditionText) : {};
    } catch {
      setError("条件 JSON 无效 / Invalid condition JSON");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await agentOpsApi.createMonitor(token, { agentId, monitorType, condition, interval });
      setShowForm(false);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }, [agentId, token, monitorType, conditionText, interval, refresh]);

  const toggle = useCallback(
    async (m: MonitorSubscription) => {
      try {
        if (m.status === "active") await agentOpsApi.pauseMonitor(token, m.id);
        else await agentOpsApi.resumeMonitor(token, m.id);
        await refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
    },
    [token, refresh],
  );

  const remove = useCallback(
    async (m: MonitorSubscription) => {
      try {
        await agentOpsApi.deleteMonitor(token, m.id);
        await refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
    },
    [token, refresh],
  );

  return (
    <div style={aoStyles.list}>
      {error && <div style={aoStyles.errorBox}>{error}</div>}
      <button style={aoStyles.actionBtn} onClick={() => setShowForm((s) => !s)} data-testid="ao-monitor-new-toggle">
        {showForm ? "✕ 取消 / Cancel" : "+ 新建监控 / New monitor"}
      </button>

      {showForm && (
        <div style={aoStyles.card}>
          <div style={aoStyles.field}>
            <label style={aoStyles.label}>监控类型 / Type</label>
            <select
              style={aoStyles.input}
              value={monitorType}
              onChange={(e) => setMonitorType(e.target.value as MonitorType)}
              data-testid="ao-monitor-type"
            >
              {MONITOR_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>
          <div style={aoStyles.field}>
            <label style={aoStyles.label}>触发条件 (JSON) / Condition</label>
            <textarea
              style={{ ...aoStyles.input, minHeight: 56, fontFamily: "monospace" }}
              value={conditionText}
              onChange={(e) => setConditionText(e.target.value)}
              data-testid="ao-monitor-condition"
            />
          </div>
          <div style={aoStyles.field}>
            <label style={aoStyles.label}>周期 (秒) / Interval — 最小 30</label>
            <input
              style={aoStyles.input}
              type="number"
              value={interval}
              onChange={(e) => setIntervalSecs(Number(e.target.value))}
              data-testid="ao-monitor-interval"
            />
          </div>
          <button style={aoStyles.primaryBtn} disabled={busy} onClick={create} data-testid="ao-monitor-create-btn">
            {busy ? "创建中…" : "创建 / Create"}
          </button>
        </div>
      )}

      {loading && !monitors.length && <div style={aoStyles.empty}>加载中… / Loading…</div>}
      {!loading && !monitors.length && <div style={aoStyles.empty}>暂无监控订阅 / No monitors</div>}

      {monitors.map((m) => (
        <div key={m.id} style={aoStyles.card} data-testid={`ao-monitor-card-${m.id}`}>
          <div style={aoStyles.cardHeader}>
            <span style={aoStyles.cardTitle}>📡 {m.monitorType}</span>
            <span style={{ ...aoStyles.badge, color: m.status === "active" ? "#22c55e" : "#94a3b8" }}>{m.status}</span>
          </div>
          <div style={aoStyles.dim}>
            周期 {m.interval}s · 上次检查 {m.lastCheckedAt ? new Date(m.lastCheckedAt).toLocaleString() : "尚未检查 / never"}
          </div>
          {m.lastResult && (
            <div style={aoStyles.dim}>上次结果 / last: {JSON.stringify(m.lastResult).slice(0, 120)}</div>
          )}
          <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
            <button style={aoStyles.actionBtn} onClick={() => toggle(m)} data-testid={`ao-monitor-toggle-${m.id}`}>
              {m.status === "active" ? "暂停 / Pause" : "恢复 / Resume"}
            </button>
            <button style={aoStyles.dangerBtn} onClick={() => remove(m)} data-testid={`ao-monitor-delete-${m.id}`}>
              删除 / Delete
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}


// ════════════════════════════ Security ════════════════════════════

function SecurityTab({ token, agentId }: { token: string; agentId: string | null }) {
  // Scan approvals
  const [wallet, setWallet] = useState("");
  const [chain, setChain] = useState("ethereum");
  const [scan, setScan] = useState<ApprovalScanResult | null>(null);
  const [scanBusy, setScanBusy] = useState(false);

  // Scam check
  const [scamKind, setScamKind] = useState<ScamTargetKind>("address");
  const [scamValue, setScamValue] = useState("");
  const [scam, setScam] = useState<ScamCheckResult | null>(null);
  const [scamBusy, setScamBusy] = useState(false);

  // Simulate
  const [simTo, setSimTo] = useState("");
  const [simFrom, setSimFrom] = useState("");
  const [sim, setSim] = useState<TransactionSimulationResult | null>(null);
  const [simBusy, setSimBusy] = useState(false);

  // Revoke guidance (unsigned plan)
  const [revoke, setRevoke] = useState<RevokeGuidance | null>(null);
  const [revokeConfirmed, setRevokeConfirmed] = useState(false);

  const [error, setError] = useState<string | null>(null);

  const runScan = useCallback(async () => {
    if (!agentId) {
      setError("无可用 Agent / No active agent");
      return;
    }
    setScanBusy(true);
    setError(null);
    setRevoke(null);
    try {
      const res = await agentOpsApi.scanApprovals(token, { agentId, wallet: wallet.trim(), chain: chain.trim() });
      setScan(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setScanBusy(false);
    }
  }, [token, agentId, wallet, chain]);

  const runScam = useCallback(async () => {
    setScamBusy(true);
    setError(null);
    try {
      const res = await agentOpsApi.checkScam(token, {
        kind: scamKind,
        value: scamValue.trim(),
        chain: scamKind === "domain" ? undefined : chain.trim(),
        agentId: agentId || undefined,
      });
      setScam(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setScamBusy(false);
    }
  }, [token, scamKind, scamValue, chain, agentId]);

  const runSim = useCallback(async () => {
    setSimBusy(true);
    setError(null);
    try {
      const res = await agentOpsApi.simulateTransaction(token, {
        chain: chain.trim(),
        from: simFrom.trim(),
        to: simTo.trim(),
      });
      setSim(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSimBusy(false);
    }
  }, [token, chain, simFrom, simTo]);

  const buildRevoke = useCallback(
    async (a: ApprovalScanResult["approvals"][number]) => {
      setError(null);
      setRevokeConfirmed(false);
      try {
        const res = await agentOpsApi.revokeGuidance(token, {
          chain: a.chain,
          token: a.token,
          spender: a.spender,
          tokenSymbol: a.tokenSymbol,
          spenderLabel: a.spenderLabel,
        });
        setRevoke(res);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
    },
    [token],
  );

  return (
    <div style={aoStyles.list}>
      {error && <div style={aoStyles.errorBox}>{error}</div>}

      {/* Scan approvals */}
      <div style={aoStyles.sectionTitle}>🔎 授权扫描 / Scan approvals (只读)</div>
      <div style={aoStyles.card}>
        <div style={aoStyles.formRow}>
          <div style={{ flex: 2 }}>
            <label style={aoStyles.label}>钱包 / Wallet</label>
            <input style={aoStyles.input} value={wallet} onChange={(e) => setWallet(e.target.value)} placeholder="0x…" data-testid="ao-sec-wallet" />
          </div>
          <div style={{ flex: 1 }}>
            <label style={aoStyles.label}>链 / Chain</label>
            <input style={aoStyles.input} value={chain} onChange={(e) => setChain(e.target.value)} data-testid="ao-sec-chain" />
          </div>
        </div>
        <button style={aoStyles.primaryBtn} disabled={scanBusy} onClick={runScan} data-testid="ao-sec-scan-btn">
          {scanBusy ? "扫描中…" : "扫描授权 / Scan"}
        </button>
      </div>

      {scan && (
        <div data-testid="ao-sec-scan-result">
          {!scan.fetched && (
            <div style={aoStyles.notice}>
              ⚠ 取数失败,显式降级 / fetch failed — degraded. {scan.note || ""} 不编造数据。
            </div>
          )}
          <div style={aoStyles.dim}>
            高风险 {scan.highRiskCount} 项 · 来源 {scan.sourceUrl}
          </div>
          {scan.approvals.map((a, i) => (
            <div key={`${a.token}-${a.spender}-${i}`} style={{ ...aoStyles.card, borderLeft: `3px solid ${riskTierColor(a.riskTier)}` }}>
              <div style={aoStyles.cardHeader}>
                <span style={aoStyles.cardTitle}>
                  {a.tokenSymbol || a.token.slice(0, 10)} → {a.spenderLabel || a.spender.slice(0, 10)}
                </span>
                <span style={{ ...aoStyles.badge, color: riskTierColor(a.riskTier) }}>{a.riskTier}</span>
              </div>
              <div style={aoStyles.dim}>
                {a.isUnlimited ? "♾ 无限授权 / unlimited" : `额度 ${a.allowance ?? "未知"}`} · {a.riskSignals.join(", ")}
              </div>
              <div style={aoStyles.muted}>{a.recommendation}</div>
              <button style={aoStyles.actionBtn} onClick={() => buildRevoke(a)} data-testid={`ao-sec-revoke-${i}`}>
                生成撤销计划 / Revoke guidance
              </button>
            </div>
          ))}
          {scan.fetched && !scan.approvals.length && <div style={aoStyles.empty}>未发现授权 / No approvals</div>}
        </div>
      )}

      {/* Revoke guidance — UNSIGNED plan, never auto-executed */}
      {revoke && (
        <div style={{ ...aoStyles.card, borderLeft: "3px solid #f59e0b" }} data-testid="ao-sec-revoke-plan">
          <div style={aoStyles.cardTitle}>📝 未签名撤销计划 / Unsigned revoke plan</div>
          <div style={aoStyles.notice}>
            绝不代执行资金 / never auto-executed · decision = {decisionLabel(revoke.decision)} · 需人工签名确认
          </div>
          <div style={aoStyles.dim}>链 {revoke.plan.chain}</div>
          <div style={aoStyles.dim}>合约 to: {revoke.plan.to}</div>
          <div style={aoStyles.dim}>
            方法 {revoke.plan.method}(spender={revoke.plan.args.spender.slice(0, 12)}…, amount={revoke.plan.args.amount})
          </div>
          <div style={aoStyles.muted}>{revoke.plan.description}</div>
          <label style={{ ...aoStyles.dim, display: "flex", gap: 6, alignItems: "center", marginTop: 6 }}>
            <input
              type="checkbox"
              checked={revokeConfirmed}
              onChange={(e) => setRevokeConfirmed(e.target.checked)}
              data-testid="ao-sec-revoke-confirm"
            />
            我已了解需在钱包中手动签名执行 / I understand I must sign this manually in my wallet
          </label>
          <button
            style={{ ...aoStyles.primaryBtn, opacity: revokeConfirmed ? 1 : 0.4 }}
            disabled={!revokeConfirmed}
            data-testid="ao-sec-revoke-copy"
            onClick={() => {
              try {
                void navigator.clipboard.writeText(JSON.stringify(revoke.plan, null, 2));
              } catch {
                /* clipboard unavailable */
              }
            }}
          >
            复制计划到钱包 / Copy plan
          </button>
        </div>
      )}

      {/* Scam check */}
      <div style={aoStyles.sectionTitle}>🚨 骗局检查 / Scam check</div>
      <div style={aoStyles.card}>
        <div style={aoStyles.formRow}>
          <div style={{ flex: 1 }}>
            <label style={aoStyles.label}>类型 / Kind</label>
            <select style={aoStyles.input} value={scamKind} onChange={(e) => setScamKind(e.target.value as ScamTargetKind)} data-testid="ao-sec-scam-kind">
              {(["address", "contract", "domain"] as ScamTargetKind[]).map((k) => (
                <option key={k} value={k}>
                  {k}
                </option>
              ))}
            </select>
          </div>
          <div style={{ flex: 2 }}>
            <label style={aoStyles.label}>标的 / Value</label>
            <input style={aoStyles.input} value={scamValue} onChange={(e) => setScamValue(e.target.value)} data-testid="ao-sec-scam-value" />
          </div>
        </div>
        <button style={aoStyles.primaryBtn} disabled={scamBusy} onClick={runScam} data-testid="ao-sec-scam-btn">
          {scamBusy ? "检查中…" : "检查 / Check"}
        </button>
      </div>
      {scam && (
        <div style={{ ...aoStyles.card, borderLeft: `3px solid ${riskTierColor(scam.risk)}` }} data-testid="ao-sec-scam-result">
          <div style={aoStyles.cardHeader}>
            <span style={aoStyles.cardTitle}>{scam.value.slice(0, 24)}</span>
            <span style={{ ...aoStyles.badge, color: riskTierColor(scam.risk) }}>
              {scam.risk === "unknown" ? "未知 / unknown" : scam.risk}
            </span>
          </div>
          {scam.risk === "unknown" && (
            <div style={aoStyles.notice}>情报不可得,显式标 unknown / intel unavailable — not fabricated</div>
          )}
          {scam.signals.length > 0 && <div style={aoStyles.dim}>信号 {scam.signals.join(", ")}</div>}
          <div style={aoStyles.muted}>{scam.advice}</div>
          {scam.sources.length > 0 && <div style={aoStyles.dim}>来源 {scam.sources.join(", ")}</div>}
        </div>
      )}

      {/* Simulate transaction */}
      <div style={aoStyles.sectionTitle}>🧪 交易模拟 / Simulate (签名前只读)</div>
      <div style={aoStyles.card}>
        <div style={aoStyles.formRow}>
          <div style={{ flex: 1 }}>
            <label style={aoStyles.label}>from</label>
            <input style={aoStyles.input} value={simFrom} onChange={(e) => setSimFrom(e.target.value)} placeholder="0x…" data-testid="ao-sec-sim-from" />
          </div>
          <div style={{ flex: 1 }}>
            <label style={aoStyles.label}>to</label>
            <input style={aoStyles.input} value={simTo} onChange={(e) => setSimTo(e.target.value)} placeholder="0x…" data-testid="ao-sec-sim-to" />
          </div>
        </div>
        <button style={aoStyles.primaryBtn} disabled={simBusy} onClick={runSim} data-testid="ao-sec-sim-btn">
          {simBusy ? "模拟中…" : "模拟 / Simulate"}
        </button>
      </div>
      {sim && (
        <div style={aoStyles.card} data-testid="ao-sec-sim-result">
          {!sim.available ? (
            <div style={aoStyles.notice}>
              ⚠ 模拟适配器未启用,显式降级 / simulator unavailable ({sim.provider}). {sim.note || ""} 不伪造资产变动。
            </div>
          ) : (
            <>
              <div style={aoStyles.cardTitle}>提供方 {sim.provider}</div>
              <div style={aoStyles.muted}>{sim.summary}</div>
              {(sim.assetChanges || []).map((c, i) => (
                <div key={i} style={aoStyles.dim}>
                  {c.direction === "in" ? "⬇ 流入" : "⬆ 流出"} {c.symbol || c.asset} {c.amount ?? ""}
                </div>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}


// ════════════════════════════ Deliverables ════════════════════════════

function DeliverablesTab({
  token,
  tasks,
  selectedTaskId,
  onSelectTask,
}: {
  token: string;
  tasks: AgentOpsTask[];
  selectedTaskId: string | null;
  onSelectTask: (id: string) => void;
}) {
  const [deliverables, setDeliverables] = useState<AgentOpsDeliverable[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [viewing, setViewing] = useState<AgentOpsDeliverable | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const taskId = selectedTaskId || "";

  const refresh = useCallback(async () => {
    if (!token || !taskId) {
      setDeliverables([]);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const list = await agentOpsApi.listTaskDeliverables(token, taskId);
      setDeliverables(Array.isArray(list) ? list : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [token, taskId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const share = useCallback(
    async (d: AgentOpsDeliverable) => {
      setBusyId(d.id);
      try {
        await agentOpsApi.shareDeliverable(token, d.id);
        await refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setBusyId(null);
      }
    },
    [token, refresh],
  );

  const spotCheck = useCallback(
    async (d: AgentOpsDeliverable, qualified: boolean) => {
      setBusyId(d.id);
      try {
        await agentOpsApi.spotCheckDeliverable(token, d.id, { qualified });
        await refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setBusyId(null);
      }
    },
    [token, refresh],
  );

  if (viewing) {
    return (
      <div style={aoStyles.list}>
        <button style={aoStyles.linkBtn} onClick={() => setViewing(null)} data-testid="ao-deliverable-back">
          ← 返回 / Back
        </button>
        <div style={aoStyles.card}>
          <div style={aoStyles.cardHeader}>
            <span style={aoStyles.cardTitle}>{viewing.type}</span>
            <span style={{ ...aoStyles.badge, color: viewing.qualified ? "#22c55e" : "#f59e0b" }}>
              {viewing.qualified === null ? "未判定" : viewing.qualified ? "合格" : "不合格"}
            </span>
          </div>
          <div style={aoStyles.dim}>采集时间 {viewing.collectedAt ?? "未获取"}</div>
          <pre style={{ ...aoStyles.dim, whiteSpace: "pre-wrap", wordBreak: "break-word", maxHeight: 220, overflow: "auto" }}>
            {JSON.stringify(viewing.content, null, 2)}
          </pre>
          {viewing.sourceLinks?.length > 0 && (
            <>
              <div style={aoStyles.sectionTitle}>🔗 来源 / Sources</div>
              {viewing.sourceLinks.map((s, i) => (
                <div key={i} style={aoStyles.dim}>
                  {s.status === "fetched" ? "✓" : "○"} {s.source}: {s.url || "—"}
                </div>
              ))}
            </>
          )}
        </div>
      </div>
    );
  }

  return (
    <div style={aoStyles.list}>
      <div style={aoStyles.field}>
        <label style={aoStyles.label}>任务 / Task</label>
        <select
          style={aoStyles.input}
          value={taskId}
          onChange={(e) => onSelectTask(e.target.value)}
          data-testid="ao-deliverable-task"
        >
          <option value="">— 选择任务 / select —</option>
          {tasks.map((t) => (
            <option key={t.id} value={t.id}>
              {t.type} · {t.id.slice(0, 8)}…
            </option>
          ))}
        </select>
      </div>

      {error && <div style={aoStyles.errorBox}>{error}</div>}
      {!taskId && <div style={aoStyles.empty}>选择一个任务查看交付物 / Pick a task</div>}
      {taskId && loading && <div style={aoStyles.empty}>加载中… / Loading…</div>}
      {taskId && !loading && !deliverables.length && <div style={aoStyles.empty}>该任务暂无交付物 / No deliverables</div>}

      {deliverables.map((d) => (
        <div key={d.id} style={aoStyles.card} data-testid={`ao-deliverable-card-${d.id}`}>
          <div style={aoStyles.cardHeader} onClick={() => setViewing(d)}>
            <span style={aoStyles.cardTitle}>📦 {d.type}</span>
            <span style={{ ...aoStyles.badge, color: d.qualified ? "#22c55e" : "#f59e0b" }}>
              {d.qualified === null ? "未判定" : d.qualified ? "合格" : "不合格"}
            </span>
          </div>
          <div style={aoStyles.dim}>
            来源 {d.sourceLinks?.length ?? 0} · {d.sharedAt ? "已分享" : "未分享"} ·{" "}
            {d.humanReviewState ? `抽检:${d.humanReviewState}` : "未抽检"}
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 6, flexWrap: "wrap" }}>
            <button style={aoStyles.actionBtn} onClick={() => setViewing(d)} data-testid={`ao-deliverable-view-${d.id}`}>
              查看 / View
            </button>
            <button style={aoStyles.actionBtn} disabled={busyId === d.id} onClick={() => share(d)} data-testid={`ao-deliverable-share-${d.id}`}>
              分享 / Share
            </button>
            <button style={aoStyles.actionBtn} disabled={busyId === d.id} onClick={() => spotCheck(d, true)} data-testid={`ao-deliverable-pass-${d.id}`}>
              抽检合格 / Pass
            </button>
            <button style={aoStyles.dangerBtn} disabled={busyId === d.id} onClick={() => spotCheck(d, false)} data-testid={`ao-deliverable-fail-${d.id}`}>
              抽检不合格 / Fail
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

// ════════════════════════════ Metrics ════════════════════════════

function MetricsTab({ token, agentId }: { token: string; agentId: string | null }) {
  const [snap, setSnap] = useState<ReliabilitySnapshot | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [scoped, setScoped] = useState(false);

  const refresh = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const res = await agentOpsApi.getReliabilityMetrics(token, scoped && agentId ? { agentId } : {});
      setSnap(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [token, scoped, agentId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  if (loading && !snap) return <div style={aoStyles.empty}>加载中… / Loading…</div>;
  if (error) return <div style={aoStyles.errorBox}>{error}</div>;
  if (!snap) return <div style={aoStyles.empty}>暂无度量 / No metrics</div>;

  const ac = snap.autonomousCompletion;
  const qp = snap.qualityPass;

  return (
    <div style={aoStyles.list} data-testid="ao-metrics">
      {agentId && (
        <label style={{ ...aoStyles.dim, display: "flex", gap: 6, alignItems: "center" }}>
          <input type="checkbox" checked={scoped} onChange={(e) => setScoped(e.target.checked)} data-testid="ao-metrics-scope" />
          仅当前 Agent / This agent only
        </label>
      )}

      <div style={aoStyles.metricGrid}>
        <div style={{ ...aoStyles.metricCard, borderLeft: `3px solid ${ac.meetsThreshold ? "#22c55e" : "#ef4444"}` }} data-testid="ao-metric-autonomous">
          <div style={aoStyles.dim}>自主完成率 / Autonomous ≥{fmtPercent(ac.threshold)}</div>
          <div style={{ ...aoStyles.metricValue, color: ac.meetsThreshold ? "#22c55e" : "#f87171" }}>{fmtPercent(ac.rate)}</div>
          <div style={aoStyles.dim}>
            {ac.autonomousQualified}/{ac.attempts} 尝试 · {ac.meetsThreshold ? "达标 ✓" : "未达标 ✗"}
          </div>
        </div>
        <div style={{ ...aoStyles.metricCard, borderLeft: `3px solid ${qp.meetsThreshold ? "#22c55e" : "#ef4444"}` }} data-testid="ao-metric-quality">
          <div style={aoStyles.dim}>质量合格率 / Quality ≥{fmtPercent(qp.threshold)}</div>
          <div style={{ ...aoStyles.metricValue, color: qp.meetsThreshold ? "#22c55e" : "#f87171" }}>{fmtPercent(qp.rate)}</div>
          <div style={aoStyles.dim}>
            抽检 {qp.spotCheckQualified}/{qp.spotChecked} · 已交付 {qp.delivered}
          </div>
        </div>
        <div style={aoStyles.metricCard}>
          <div style={aoStyles.dim}>时延 / Latency p50</div>
          <div style={aoStyles.metricValue}>{fmtMs(snap.latency.p50Ms)}</div>
          <div style={aoStyles.dim}>p95 {fmtMs(snap.latency.p95Ms)} · n={snap.latency.count}</div>
        </div>
        <div style={aoStyles.metricCard}>
          <div style={aoStyles.dim}>类型 / Task type</div>
          <div style={{ ...aoStyles.metricValue, fontSize: 16 }}>{snap.window.taskType}</div>
          <div style={aoStyles.dim}>{snap.generatedAt ? new Date(snap.generatedAt).toLocaleString() : ""}</div>
        </div>
      </div>

      <div style={aoStyles.sectionTitle}>🪜 冷启动漏斗 / Cold-start funnel</div>
      {snap.funnel.stages.map((s) => (
        <div key={s.stage} style={aoStyles.rowItem}>
          <span style={aoStyles.muted}>{s.stage}</span>
          <span style={aoStyles.dim}>
            {s.count}
            {s.conversionFromPrev !== null ? ` · 转化 ${fmtPercent(s.conversionFromPrev)}` : ""}
          </span>
        </div>
      ))}
    </div>
  );
}
