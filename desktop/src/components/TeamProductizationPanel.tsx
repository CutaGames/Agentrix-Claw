/**
 * TeamProductizationPanel — 可订阅 / 可租赁的定制 Agent 团队产品化 UI.
 *
 * Rendered as the "Team" tab inside {@link AgentOpsPanel}. Surfaces the
 * TeamProductization backend (需求 17):
 *   - provision team form (templateSlug / 名称前缀)
 *   - subscription quota snapshot
 *   - metering dashboard (订阅 / 租赁 / 按结果 + 结算/分佣记录)
 *   - team budget evaluation (团队上限优先于成员限额)
 *
 * Mirrors CrossDevicePanel.tsx styling (shared `aoStyles`).
 */
import { useCallback, useEffect, useState } from "react";
import agentOpsApi, {
  type SubscriptionQuotaDecision,
  type TeamMeteringDashboard,
  type TeamBudgetDecision,
  type SettlementRecord,
} from "../services/agentOpsApi";
import { aoStyles, decisionColor } from "./agentOpsShared";

interface Props {
  token: string;
}

export default function TeamProductizationPanel({ token }: Props) {
  const [quota, setQuota] = useState<SubscriptionQuotaDecision | null>(null);
  const [dashboard, setDashboard] = useState<TeamMeteringDashboard | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Provision form
  const [templateSlug, setTemplateSlug] = useState("");
  const [namePrefix, setNamePrefix] = useState("");
  const [provisioning, setProvisioning] = useState(false);
  const [provisionMsg, setProvisionMsg] = useState<string | null>(null);

  // Budget form
  const [budget, setBudget] = useState({ teamBudgetCap: 1000, teamUsed: 0, memberLimit: 200, memberUsed: 0, cost: 50 });
  const [budgetDecision, setBudgetDecision] = useState<TeamBudgetDecision | null>(null);

  const refresh = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      // Dashboard already folds in subscription quota; quota fetched separately
      // for the headline card (degrades to null if unavailable).
      const [q, d] = await Promise.all([
        agentOpsApi.getSubscriptionQuota(token).catch(() => null),
        agentOpsApi.getTeamDashboard(token, {}).catch(() => null),
      ]);
      setQuota(q);
      setDashboard(d);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const onProvision = useCallback(async () => {
    if (!token) return;
    if (!templateSlug.trim()) {
      setProvisionMsg("请填写模板 slug / templateSlug required");
      return;
    }
    setProvisioning(true);
    setProvisionMsg(null);
    try {
      await agentOpsApi.provisionTeam(token, {
        templateSlug: templateSlug.trim(),
        teamNamePrefix: namePrefix.trim() || undefined,
      });
      setProvisionMsg("✓ 团队已组建 / Team provisioned");
      void refresh();
    } catch (err) {
      setProvisionMsg(err instanceof Error ? err.message : String(err));
    } finally {
      setProvisioning(false);
    }
  }, [token, templateSlug, namePrefix, refresh]);

  const onEvaluateBudget = useCallback(async () => {
    if (!token) return;
    try {
      const d = await agentOpsApi.evaluateTeamBudget(token, budget);
      setBudgetDecision(d);
    } catch (err) {
      setBudgetDecision(null);
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [token, budget]);

  return (
    <div style={aoStyles.list} id="ao-team">
      {error && <div style={aoStyles.errorBox}>{error}</div>}

      {/* Provision team */}
      <div style={aoStyles.sectionTitle}>🏗 组建定制团队 / Provision team</div>
      <div style={aoStyles.card}>
        <div style={aoStyles.field}>
          <label style={aoStyles.label}>模板 slug / templateSlug</label>
          <input
            style={aoStyles.input}
            value={templateSlug}
            onChange={(e) => setTemplateSlug(e.target.value)}
            placeholder="e.g. growth-core / s0-launch"
            data-testid="ao-team-template-slug"
          />
        </div>
        <div style={aoStyles.field}>
          <label style={aoStyles.label}>团队名称前缀 / Name prefix (可选)</label>
          <input
            style={aoStyles.input}
            value={namePrefix}
            onChange={(e) => setNamePrefix(e.target.value)}
            placeholder="MyProject"
            data-testid="ao-team-name-prefix"
          />
        </div>
        <button
          style={aoStyles.primaryBtn}
          disabled={provisioning}
          onClick={onProvision}
          data-testid="ao-team-provision-btn"
        >
          {provisioning ? "组建中…" : "组建团队 / Provision"}
        </button>
        {provisionMsg && <div style={aoStyles.notice}>{provisionMsg}</div>}
      </div>

      {/* Subscription quota */}
      <div style={aoStyles.sectionTitle}>📊 订阅配额 / Subscription quota</div>
      {loading && !quota ? (
        <div style={aoStyles.empty}>加载中… / Loading…</div>
      ) : quota ? (
        <div style={aoStyles.card} data-testid="ao-team-quota">
          <div style={aoStyles.cardHeader}>
            <span style={aoStyles.cardTitle}>
              已用 {quota.used} / {quota.quota === null ? "∞" : quota.quota}
            </span>
            {quota.warn ? (
              <span style={aoStyles.alertBadge}>超配额告警</span>
            ) : (
              <span style={aoStyles.badge}>{quota.allowed ? "配额内" : "受限"}</span>
            )}
          </div>
          <div style={aoStyles.dim}>
            剩余 {quota.remaining === null ? "∞" : quota.remaining}
            {quota.overQuotaAction ? ` · 处置 ${quota.overQuotaAction}` : ""}
          </div>
          <div style={aoStyles.muted}>{quota.reason}</div>
        </div>
      ) : (
        <div style={aoStyles.empty}>配额服务不可用 / Quota unavailable（显式降级）</div>
      )}

      {/* Metering dashboard */}
      <div style={aoStyles.sectionTitle}>💹 三模式计量看板 / Metering dashboard</div>
      {dashboard ? (
        <>
          <div style={aoStyles.metricGrid} data-testid="ao-team-dashboard">
            <div style={aoStyles.metricCard}>
              <div style={aoStyles.dim}>订阅 / subscription</div>
              <div style={aoStyles.metricValue}>{dashboard.subscription.used}</div>
              <div style={aoStyles.dim}>
                配额 {dashboard.subscription.quota === null ? "∞" : dashboard.subscription.quota}
                {dashboard.subscription.warn ? " · ⚠" : ""}
              </div>
            </div>
            <div style={aoStyles.metricCard}>
              <div style={aoStyles.dim}>租赁 / rental</div>
              <div style={aoStyles.metricValue}>{dashboard.rental.activeLeases}</div>
              <div style={aoStyles.dim}>
                有效 · 过期 {dashboard.rental.expiredLeases}
                {dashboard.rental.nextExpiryAt ? ` · 下次到期 ${fmtDate(dashboard.rental.nextExpiryAt)}` : ""}
              </div>
            </div>
            <div style={aoStyles.metricCard}>
              <div style={aoStyles.dim}>按结果 / per-result</div>
              <div style={aoStyles.metricValue}>{dashboard.perResult.settledTasks}</div>
              <div style={aoStyles.dim}>结算总额 ${dashboard.perResult.totalSettledUsd.toFixed(2)}</div>
            </div>
            <div style={aoStyles.metricCard}>
              <div style={aoStyles.dim}>任务 / tasks</div>
              <div style={aoStyles.metricValue}>{dashboard.tasks.inProgress}</div>
              <div style={aoStyles.dim}>进行中 · 已交付 {dashboard.tasks.delivered}</div>
            </div>
          </div>

          {/* Settlement / 分佣 records */}
          <div style={aoStyles.sectionTitle}>🧾 结算 / 分佣记录 / Settlements</div>
          {dashboard.settlements.length ? (
            dashboard.settlements.map((s: SettlementRecord, i) => (
              <div key={`${s.taskId}-${i}`} style={aoStyles.card}>
                <div style={aoStyles.cardHeader}>
                  <span style={aoStyles.cardTitle}>{s.mode}</span>
                  <span style={aoStyles.badge}>${s.totalUsd.toFixed(2)}</span>
                </div>
                <div style={aoStyles.dim}>
                  执行净额 ${s.merchantNetUsd.toFixed(2)} · 分佣 {s.parties.length} 方 · {fmtDate(s.at)}
                </div>
                {s.parties.length > 0 && (
                  <div style={aoStyles.dim}>
                    {s.parties.map((p) => `${p.role}:$${p.amountUsd.toFixed(2)}`).join(" · ")}
                  </div>
                )}
              </div>
            ))
          ) : (
            <div style={aoStyles.empty}>暂无结算记录 / No settlements yet</div>
          )}
        </>
      ) : (
        <div style={aoStyles.empty}>看板不可用 / Dashboard unavailable</div>
      )}

      {/* Budget evaluation */}
      <div style={aoStyles.sectionTitle}>💰 团队预算评估 / Budget evaluation</div>
      <div style={aoStyles.card}>
        <div style={aoStyles.formRow}>
          <div style={{ flex: 1 }}>
            <label style={aoStyles.label}>团队上限 cap</label>
            <input
              style={aoStyles.input}
              type="number"
              value={budget.teamBudgetCap}
              onChange={(e) => setBudget({ ...budget, teamBudgetCap: Number(e.target.value) })}
              data-testid="ao-team-budget-cap"
            />
          </div>
          <div style={{ flex: 1 }}>
            <label style={aoStyles.label}>团队已用 used</label>
            <input
              style={aoStyles.input}
              type="number"
              value={budget.teamUsed}
              onChange={(e) => setBudget({ ...budget, teamUsed: Number(e.target.value) })}
            />
          </div>
        </div>
        <div style={aoStyles.formRow}>
          <div style={{ flex: 1 }}>
            <label style={aoStyles.label}>成员限额 limit</label>
            <input
              style={aoStyles.input}
              type="number"
              value={budget.memberLimit}
              onChange={(e) => setBudget({ ...budget, memberLimit: Number(e.target.value) })}
            />
          </div>
          <div style={{ flex: 1 }}>
            <label style={aoStyles.label}>成员已用 used</label>
            <input
              style={aoStyles.input}
              type="number"
              value={budget.memberUsed}
              onChange={(e) => setBudget({ ...budget, memberUsed: Number(e.target.value) })}
            />
          </div>
          <div style={{ flex: 1 }}>
            <label style={aoStyles.label}>本次成本 cost</label>
            <input
              style={aoStyles.input}
              type="number"
              value={budget.cost}
              onChange={(e) => setBudget({ ...budget, cost: Number(e.target.value) })}
            />
          </div>
        </div>
        <button style={aoStyles.actionBtn} onClick={onEvaluateBudget} data-testid="ao-team-budget-eval-btn">
          评估预算 / Evaluate
        </button>
        {budgetDecision && (
          <div
            style={{
              ...aoStyles.resultBox,
              borderLeft: `3px solid ${budgetDecision.decision === "allow" ? "#22c55e" : decisionColor("deny")}`,
            }}
            data-testid="ao-team-budget-result"
          >
            <div style={aoStyles.cardTitle}>决策 / Decision：{budgetDecision.decision}</div>
            <div style={aoStyles.dim}>
              团队触顶 {String(budgetDecision.teamCapped)} · 告警 {String(budgetDecision.alert)}
            </div>
            <div style={aoStyles.muted}>{budgetDecision.reason}</div>
          </div>
        )}
      </div>
    </div>
  );
}

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString();
  } catch {
    return iso;
  }
}
