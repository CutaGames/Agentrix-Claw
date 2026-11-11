/**
 * PlanPanel — Renders an interactive plan view within the chat.
 * Shows plan steps, progress, and approve/reject actions.
 */
import { type CSSProperties } from "react";
import type { AgentPlan, PlanStep } from "../services/agentIntelligence";

interface Props {
  plan: AgentPlan;
  onApprove: () => void;
  onReject: () => void;
  /** Dismiss the panel without affecting plan state. Used to hide a
   *  completed/failed plan that the user is done reviewing. */
  onDismiss?: () => void;
}

const statusIcon: Record<string, string> = {
  pending: "⏳",
  running: "🔄",
  done: "✅",
  failed: "❌",
  skipped: "⏭️",
};

export default function PlanPanel({ plan, onApprove, onReject, onDismiss }: Props) {
  const totalSteps = plan.steps.length;
  const doneSteps = plan.steps.filter((s) => s.status === "done").length;
  const progress = totalSteps > 0 ? Math.round((doneSteps / totalSteps) * 100) : 0;

  const isAwaiting = plan.status === "awaiting_approval";
  const isExecuting = plan.status === "executing";
  const isCompleted = plan.status === "completed";
  const isFailed = plan.status === "failed";

  return (
    <div style={containerStyle}>
      <div style={headerStyle}>
        <span style={{ fontSize: 14, fontWeight: 600 }}>
          📋 Plan: {plan.goal}
        </span>
        <span style={badgeStyle(plan.status)}>
          {plan.status.replace(/_/g, " ")}
        </span>
        {onDismiss && (isCompleted || isFailed || plan.status === "rejected" || plan.status === "cancelled") && (
          <button
            onClick={onDismiss}
            style={dismissBtnStyle}
            title="Hide this plan from the chat (you can still see it in the Workbench)"
          >
            ✕
          </button>
        )}
      </div>

      {plan.reasoning && (
        <div style={reasoningStyle}>{plan.reasoning}</div>
      )}

      {(isExecuting || isCompleted || isFailed) && (
        <div style={progressBarOuter}>
          <div style={{ ...progressBarInner, width: `${progress}%` }} />
          <span style={progressLabel}>{doneSteps}/{totalSteps} steps</span>
        </div>
      )}

      <div style={stepsContainer}>
        {plan.steps.map((step, i) => (
          <div key={step.id} style={stepRow(i === plan.currentStepIndex && isExecuting)}>
            <span style={{ marginRight: 6, fontSize: 13 }}>{statusIcon[step.status] || "⏳"}</span>
            <span style={{ flex: 1, fontSize: 13 }}>
              <strong>{step.id}:</strong> {step.description}
            </span>
            {step.toolName && (
              <span style={toolChip}>{step.toolName}</span>
            )}
            {step.result && (
              <div style={resultStyle}>→ {step.result.substring(0, 200)}</div>
            )}
            {step.error && (
              <div style={{ ...resultStyle, color: "#ff6b6b" }}>✗ {step.error}</div>
            )}
          </div>
        ))}
      </div>

      {isAwaiting && (
        <div style={actionsRow}>
          <button onClick={onApprove} style={approveBtn}>
            ✓ Approve & Execute
          </button>
          <button onClick={onReject} style={rejectBtn}>
            ✗ Reject
          </button>
        </div>
      )}

      {isCompleted && (
        <div style={{ ...actionsRow, justifyContent: "center" }}>
          <span style={{ color: "#2ecc71", fontWeight: 600, fontSize: 13 }}>
            ✅ Plan completed successfully
          </span>
        </div>
      )}
    </div>
  );
}

// ── Styles ──────────────────────────────────────────────────

const containerStyle: CSSProperties = {
  background: "rgba(108,92,231,0.08)",
  border: "1px solid rgba(108,92,231,0.25)",
  borderRadius: 12,
  padding: "12px 14px",
  margin: "8px 0",
};

const headerStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  marginBottom: 8,
};

function badgeStyle(status: string): CSSProperties {
  const colors: Record<string, string> = {
    awaiting_approval: "#f39c12",
    executing: "#3498db",
    completed: "#2ecc71",
    failed: "#e74c3c",
    rejected: "#95a5a6",
    draft: "#bdc3c7",
  };
  return {
    fontSize: 11,
    fontWeight: 600,
    padding: "2px 8px",
    borderRadius: 999,
    background: `${colors[status] || "#777"}22`,
    color: colors[status] || "#777",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  };
}

const reasoningStyle: CSSProperties = {
  fontSize: 12,
  color: "var(--text-dim)",
  marginBottom: 8,
  fontStyle: "italic",
};

const progressBarOuter: CSSProperties = {
  position: "relative",
  height: 6,
  borderRadius: 3,
  background: "var(--bg-overlay-medium)",
  marginBottom: 10,
  overflow: "hidden",
};

const progressBarInner: CSSProperties = {
  height: "100%",
  borderRadius: 3,
  background: "linear-gradient(90deg, #6c5ce7, #a29bfe)",
  transition: "width 0.3s ease",
};

const progressLabel: CSSProperties = {
  position: "absolute",
  right: 0,
  top: -16,
  fontSize: 10,
  color: "var(--text-dim)",
};

const stepsContainer: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 4,
};

function stepRow(isActive: boolean): CSSProperties {
  return {
    display: "flex",
    alignItems: "flex-start",
    flexWrap: "wrap",
    padding: "6px 8px",
    borderRadius: 6,
    background: isActive ? "rgba(108,92,231,0.12)" : "transparent",
    borderLeft: isActive ? "2px solid #6c5ce7" : "2px solid transparent",
    transition: "background 0.15s",
  };
}

const toolChip: CSSProperties = {
  fontSize: 10,
  padding: "1px 6px",
  borderRadius: 4,
  background: "rgba(52,152,219,0.15)",
  color: "#3498db",
  marginLeft: 6,
};

const resultStyle: CSSProperties = {
  width: "100%",
  fontSize: 11,
  color: "var(--text-dim)",
  marginTop: 2,
  paddingLeft: 20,
};

const actionsRow: CSSProperties = {
  display: "flex",
  gap: 8,
  marginTop: 10,
  justifyContent: "flex-end",
};

const approveBtn: CSSProperties = {
  padding: "6px 16px",
  borderRadius: 6,
  border: "none",
  background: "#2ecc71",
  color: "#fff",
  fontWeight: 600,
  fontSize: 12,
  cursor: "pointer",
};

const dismissBtnStyle: CSSProperties = {
  border: "none",
  background: "transparent",
  color: "var(--text-dim)",
  cursor: "pointer",
  fontSize: 14,
  lineHeight: 1,
  padding: "4px 8px",
  marginLeft: 4,
  borderRadius: 6,
};

const rejectBtn: CSSProperties = {
  padding: "6px 16px",
  borderRadius: 6,
  border: "1px solid rgba(231,76,60,0.3)",
  background: "transparent",
  color: "#e74c3c",
  fontWeight: 600,
  fontSize: 12,
  cursor: "pointer",
};
