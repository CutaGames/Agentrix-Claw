/**
 * DeliveryPackagesPanel — B2B 交付包浏览器 / Delivery package browser.
 *
 * Rendered as the "Packages" tab inside {@link AgentOpsPanel}. Lists delivery
 * package templates (S0 / S1 A–F / cross-cutting / S2-S3), and on select shows
 * the five-element spec: 输入 schema · 步骤 (动作 + 交付物) · 量化验收 · 计费.
 *
 * Actions:
 *   - produce-deliverable  → produces a deliverable step (section-coverage判定)
 *   - request write-action → surfaces the graded-approval decision
 *     (auto_execute / user_confirmation / deny). NEVER auto-publishes — a
 *     write action only proceeds when the backend grants auto_execute, and even
 *     then the UI only reports the decision; nothing is published from here.
 *
 * Mirrors CrossDevicePanel.tsx styling (shared `aoStyles`).
 */
import { useCallback, useEffect, useState } from "react";
import agentOpsApi, {
  type DeliveryPackageTemplate,
  type DeliveryPackageStep,
  type DeliverableStepResult,
  type WriteActionStepResult,
} from "../services/agentOpsApi";
import { aoStyles, stageLabel, billingLabel, decisionColor, decisionLabel } from "./agentOpsShared";

interface Props {
  token: string;
  agentId: string | null;
  /** Optional task id to attach produced deliverables / write-actions to. */
  taskId?: string | null;
}

export default function DeliveryPackagesPanel({ token, agentId, taskId }: Props) {
  const [templates, setTemplates] = useState<DeliveryPackageTemplate[]>([]);
  const [selected, setSelected] = useState<DeliveryPackageTemplate | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyStep, setBusyStep] = useState<string | null>(null);
  const [stepResults, setStepResults] = useState<
    Record<string, DeliverableStepResult | WriteActionStepResult | { error: string }>
  >({});

  const refresh = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const list = await agentOpsApi.listDeliveryPackages(token);
      setTemplates(Array.isArray(list) ? list : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const openDetail = useCallback(
    async (slug: string) => {
      if (!token) return;
      setError(null);
      setStepResults({});
      try {
        const tpl = await agentOpsApi.getDeliveryPackage(token, slug);
        setSelected(tpl);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
    },
    [token],
  );

  const runProduce = useCallback(
    async (step: DeliveryPackageStep) => {
      if (!token || !selected) return;
      if (!agentId) {
        setStepResults((p) => ({ ...p, [step.id]: { error: "缺少 Agent / No active agent" } }));
        return;
      }
      if (!taskId) {
        setStepResults((p) => ({
          ...p,
          [step.id]: { error: "请先在 Tasks 选择一个任务 / Pick a task in the Tasks tab first" },
        }));
        return;
      }
      setBusyStep(step.id);
      try {
        // Seed content with the step's required sections so the coverage check
        // can be exercised; the operator can refine before publishing.
        const sections = step.deliverable?.requiredSections ?? [];
        const content: Record<string, unknown> = {};
        for (const s of sections) content[s] = "";
        const res = await agentOpsApi.produceDeliverable(token, selected.slug, {
          taskId,
          agentId,
          stepId: step.id,
          content,
          persist: false,
        });
        setStepResults((p) => ({ ...p, [step.id]: res }));
      } catch (err) {
        setStepResults((p) => ({
          ...p,
          [step.id]: { error: err instanceof Error ? err.message : String(err) },
        }));
      } finally {
        setBusyStep(null);
      }
    },
    [token, selected, agentId, taskId],
  );

  const runWriteAction = useCallback(
    async (step: DeliveryPackageStep) => {
      if (!token || !selected) return;
      if (!agentId) {
        setStepResults((p) => ({ ...p, [step.id]: { error: "缺少 Agent / No active agent" } }));
        return;
      }
      if (!taskId) {
        setStepResults((p) => ({
          ...p,
          [step.id]: { error: "请先在 Tasks 选择一个任务 / Pick a task in the Tasks tab first" },
        }));
        return;
      }
      setBusyStep(step.id);
      try {
        const res = await agentOpsApi.requestWriteAction(token, selected.slug, {
          taskId,
          agentId,
          stepId: step.id,
          intent: `delivery-package:${selected.slug}:${step.id}`,
        });
        setStepResults((p) => ({ ...p, [step.id]: res }));
      } catch (err) {
        setStepResults((p) => ({
          ...p,
          [step.id]: { error: err instanceof Error ? err.message : String(err) },
        }));
      } finally {
        setBusyStep(null);
      }
    },
    [token, selected, agentId, taskId],
  );

  if (selected) {
    return (
      <div style={aoStyles.list} id="ao-delivery-detail">
        <button style={aoStyles.linkBtn} onClick={() => setSelected(null)} data-testid="ao-delivery-back">
          ← 返回交付包列表 / Back
        </button>
        <div style={aoStyles.card}>
          <div style={aoStyles.cardHeader}>
            <span style={aoStyles.cardTitle}>{selected.title}</span>
            <span style={aoStyles.badge}>{stageLabel(selected.stage)}</span>
          </div>
          <div style={aoStyles.muted}>{selected.summary}</div>
          <div style={aoStyles.dim}>计费 / Billing：{billingLabel(selected.billing)}</div>
          <div style={aoStyles.dim}>需求 / Refs：{(selected.requirementRefs || []).join(", ") || "—"}</div>
        </div>

        {/* Inputs schema */}
        <div style={aoStyles.sectionTitle}>📥 输入 Schema / Inputs</div>
        {(selected.inputs || []).length ? (
          (selected.inputs || []).map((f) => (
            <div key={f.key} style={aoStyles.rowItem}>
              <span style={aoStyles.cardTitle}>
                {f.label} {f.required && <span style={{ color: "#f87171" }}>*</span>}
              </span>
              <span style={aoStyles.dim}>
                {f.type}
                {f.enumValues?.length ? ` · ${f.enumValues.join("/")}` : ""}
              </span>
            </div>
          ))
        ) : (
          <div style={aoStyles.empty}>无输入字段 / No inputs</div>
        )}

        {/* Steps: actions + deliverables */}
        <div style={aoStyles.sectionTitle}>⚙️ 步骤 · 动作 + 交付物 / Steps</div>
        {(selected.steps || []).map((step) => {
          const result = stepResults[step.id];
          const isWrite = step.kind === "write_action";
          return (
            <div key={step.id} style={aoStyles.card}>
              <div style={aoStyles.cardHeader}>
                <span style={aoStyles.cardTitle}>
                  {isWrite ? "✍️" : "📄"} {step.label}
                </span>
                <span style={aoStyles.badge}>{isWrite ? "write_action" : "deliverable"}</span>
              </div>
              {step.deliverable && (
                <div style={aoStyles.dim}>
                  类型 {step.deliverable.deliverableType} · 必备章节 {step.deliverable.requiredSections.length}
                </div>
              )}
              {step.action && (
                <div style={aoStyles.dim}>
                  动作 {step.action.actionType} → {step.action.target}
                </div>
              )}
              <div style={{ marginTop: 8 }}>
                {isWrite ? (
                  <button
                    style={aoStyles.actionBtn}
                    disabled={busyStep === step.id}
                    onClick={() => runWriteAction(step)}
                    data-testid={`ao-delivery-write-${step.id}`}
                  >
                    {busyStep === step.id ? "评估中…" : "请求写动作审批 / Request write-action"}
                  </button>
                ) : (
                  <button
                    style={aoStyles.actionBtn}
                    disabled={busyStep === step.id}
                    onClick={() => runProduce(step)}
                    data-testid={`ao-delivery-produce-${step.id}`}
                  >
                    {busyStep === step.id ? "产出中…" : "产出交付物 / Produce deliverable"}
                  </button>
                )}
              </div>
              {result && "error" in result && (
                <div style={aoStyles.errorBox}>{result.error}</div>
              )}
              {result && !("error" in result) && "decision" in result && (
                <div style={{ ...aoStyles.resultBox, borderLeft: `3px solid ${decisionColor(result.decision)}` }}>
                  <div style={aoStyles.cardTitle}>
                    审批决策 / Decision：
                    <span style={{ color: decisionColor(result.decision) }}> {decisionLabel(result.decision)}</span>
                  </div>
                  <div style={aoStyles.dim}>风险档 {result.tier} · 可继续 {String(result.mayProceed)}</div>
                  {result.redline && <div style={{ color: "#f87171" }}>⛔ 命中红线 / Redline — 永久拒绝</div>}
                  {result.reason && <div style={aoStyles.dim}>{result.reason}</div>}
                  {result.decision !== "auto_execute" && (
                    <div style={aoStyles.notice}>
                      不会自动发布 / Never auto-published — 需人工确认后由你执行。
                    </div>
                  )}
                </div>
              )}
              {result && !("error" in result) && "coverage" in result && (
                <div
                  style={{
                    ...aoStyles.resultBox,
                    borderLeft: `3px solid ${result.qualified ? "#22c55e" : "#f59e0b"}`,
                  }}
                >
                  <div style={aoStyles.cardTitle}>
                    {result.qualified ? "✓ 章节覆盖合格" : "⚠ 章节未覆盖"} / Coverage
                  </div>
                  {result.coverage.missingSections.length > 0 && (
                    <div style={aoStyles.dim}>缺失章节：{result.coverage.missingSections.join(", ")}</div>
                  )}
                  {result.coverage.coveredSections.length > 0 && (
                    <div style={aoStyles.dim}>已覆盖：{result.coverage.coveredSections.join(", ")}</div>
                  )}
                </div>
              )}
            </div>
          );
        })}

        {/* Acceptance */}
        <div style={aoStyles.sectionTitle}>✅ 量化验收 / Acceptance</div>
        {(selected.acceptance || []).map((a) => (
          <div key={a.id} style={aoStyles.rowItem}>
            <span style={aoStyles.dim}>{a.id}</span>
            <span style={aoStyles.muted}>{a.description}</span>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div style={aoStyles.list} id="ao-delivery-list">
      {error && <div style={aoStyles.errorBox}>{error}</div>}
      {loading && <div style={aoStyles.empty}>加载中… / Loading…</div>}
      {!loading && !templates.length && (
        <div style={aoStyles.empty}>暂无交付包模板 / No delivery packages</div>
      )}
      {templates.map((tpl) => (
        <div
          key={tpl.slug}
          style={aoStyles.card}
          onClick={() => openDetail(tpl.slug)}
          data-testid={`ao-delivery-card-${tpl.slug}`}
        >
          <div style={aoStyles.cardHeader}>
            <span style={aoStyles.cardTitle}>{tpl.title}</span>
            <span style={aoStyles.badge}>{stageLabel(tpl.stage)}</span>
          </div>
          <div style={aoStyles.muted}>{tpl.summary}</div>
          <div style={aoStyles.dim}>计费 {billingLabel(tpl.billing)} · {(tpl.steps || []).length} 步骤</div>
        </div>
      ))}
    </div>
  );
}
