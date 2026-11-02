import { type CSSProperties } from "react";
import { createPortal } from "react-dom";
import type { ApprovalRiskLevel } from "../services/desktop";
import { useIsSimpleMode } from "../services/userMode";

// Sprint Pre-launch P-3 (2026-05-23) — Plain-language risk copy.
//
// In Simple mode (the default for L1 non-coder users) we drop the L0/L1/L2/L3
// engineering jargon and translate to 安全 / 需要你确认 / 危险. Standard/Pro
// users still see the original copy because they expect the granularity.
//
// `simple` and `pro` blocks both keep the same risk levels under the hood —
// only the user-visible text and accent treatment differ.

const SIMPLE_RISK_COPY: Record<ApprovalRiskLevel, { label: string; description: string; chip: string }> = {
  L0: {
    chip: "安全",
    label: "安全的操作",
    description: "只是查看你的内容,不会做任何改动。",
  },
  L1: {
    chip: "需要你确认",
    label: "Agent 想动一下你的文件",
    description: "Agent 准备保存或修改一个文件。如果你不确定,可以拒绝;之后还可以撤销。",
  },
  L2: {
    chip: "需要你确认",
    label: "Agent 想替你执行一条命令",
    description: "Agent 准备运行一条会改动你的电脑或项目的命令。请先看一下下面的内容再决定。",
  },
  L3: {
    chip: "危险",
    label: "可能不可逆的操作",
    description: "这是一个有可能造成损失或难以撤销的动作。除非你完全确定,否则请拒绝。",
  },
};

const PRO_RISK_COPY: Record<ApprovalRiskLevel, { label: string; description: string; chip: string }> = {
  L0: {
    chip: "L0",
    label: "Read-only / safe by default",
    description: "Read context, list files, inspect windows, and other non-mutating actions. No approval is normally required.",
  },
  L1: {
    chip: "L1",
    label: "Low-risk write / navigation",
    description: "Opens browser links or writes files with session-level remember support.",
  },
  L2: {
    chip: "L2",
    label: "Command execution / medium risk",
    description: "Runs local commands or similar actions that may change workspace or environment state.",
  },
  L3: {
    chip: "L3",
    label: "High-risk / destructive",
    description: "Potentially destructive actions such as dangerous shell commands always require explicit approval.",
  },
};

export interface PendingApprovalRequest {
  title: string;
  description: string;
  riskLevel: ApprovalRiskLevel;
  canRememberForSession: boolean;
}

interface Props {
  request: PendingApprovalRequest | null;
  rememberForSession: boolean;
  onRememberChange: (value: boolean) => void;
  onApprove: () => void;
  onReject: () => void;
  submitting?: boolean;
}

export default function ApprovalSheet({
  request,
  rememberForSession,
  onRememberChange,
  onApprove,
  onReject,
  submitting = false,
}: Props) {
  const isSimple = useIsSimpleMode();
  if (!request) return null;
  if (typeof document === "undefined") return null;
  const RISK_COPY = isSimple ? SIMPLE_RISK_COPY : PRO_RISK_COPY;
  const riskCopy = RISK_COPY[request.riskLevel];
  const riskTheme = RISK_THEME[request.riskLevel];
  const eyebrowText = isSimple ? "需要你确认一下" : "Approval Required";
  const approveLabel = isSimple ? "同意" : "Approve";
  const rejectLabel = isSimple ? "拒绝" : "Reject";
  const submittingLabel = isSimple ? "提交中…" : "Submitting...";
  const decisionHintIdle = isSimple
    ? "同意后 Agent 会继续执行,拒绝则中止本次动作。"
    : "Approve to continue the task, or reject to stop this action now.";
  const rememberLabel = isSimple
    ? "本次对话内类似操作不再询问"
    : "Approve similar actions for this session";

  return createPortal(
    <div
      style={overlay}
      onPointerDown={(event) => event.stopPropagation()}
      onMouseDown={(event) => event.stopPropagation()}
      onClick={(event) => event.stopPropagation()}
    >
      <div
        style={panel}
        role="dialog"
        aria-modal="true"
        aria-label={eyebrowText}
        onPointerDown={(event) => event.stopPropagation()}
        onMouseDown={(event) => event.stopPropagation()}
        onClick={(event) => event.stopPropagation()}
      >
        <div style={headerRow}>
          <div>
            <div style={eyebrow}>{eyebrowText}</div>
            <div style={title}>{request.title}</div>
          </div>
          <div style={{ ...riskBadge, borderColor: riskTheme.border, color: riskTheme.text, background: riskTheme.background }}>
            {riskCopy.chip}
          </div>
        </div>
        <div style={descriptionCard}>
          <div style={descriptionLabel}>{isSimple ? "Agent 想做的事" : "Requested action"}</div>
          <div style={descriptionText}>{request.description}</div>
        </div>
        <div style={{ ...riskMetaCard, borderColor: riskTheme.border, background: riskTheme.surface }}>
          <div style={riskMetaTitle}>{riskCopy.label}</div>
          <div style={riskMetaText}>{riskCopy.description}</div>
        </div>

        <div style={decisionHint}>
          {submitting
            ? (isSimple ? "正在提交你的决定…" : "Submitting your decision to the desktop agent…")
            : decisionHintIdle}
        </div>

        {request.canRememberForSession && (
          <label style={checkboxRow}>
            <input
              type="checkbox"
              checked={rememberForSession}
              disabled={submitting}
              onChange={(event) => onRememberChange(event.target.checked)}
            />
            {rememberLabel}
          </label>
        )}

        <div style={buttonRow}>
          <button type="button" onClick={onReject} disabled={submitting} style={{ ...secondaryBtn, opacity: submitting ? 0.6 : 1, cursor: submitting ? "wait" : "pointer" }}>{rejectLabel}</button>
          <button type="button" onClick={onApprove} disabled={submitting} style={{ ...primaryBtn, opacity: submitting ? 0.7 : 1, cursor: submitting ? "wait" : "pointer" }}>
            {submitting ? submittingLabel : approveLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

const overlay: CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(2, 6, 23, 0.72)",
  backdropFilter: "blur(10px)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  zIndex: 2147483647,
  padding: 16,
  pointerEvents: "auto",
};

const panel: CSSProperties = {
  width: "100%",
  maxWidth: 430,
  // Sprint Pre-launch P-2 hotfix (2026-05-24): light-mode 残留修复。
  background: "var(--bg-panel, #16213e)",
  border: "1px solid var(--border-subtle, rgba(148,163,184,0.24))",
  borderRadius: 20,
  boxShadow: "0 30px 80px rgba(2, 6, 23, 0.48)",
  padding: 22,
  pointerEvents: "auto",
};

const headerRow: CSSProperties = {
  display: "flex",
  alignItems: "flex-start",
  justifyContent: "space-between",
  gap: 12,
};

const eyebrow: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  color: "#93c5fd",
  fontSize: 11,
  fontWeight: 700,
  textTransform: "uppercase",
  letterSpacing: 0.8,
};

const title: CSSProperties = {
  marginTop: 6,
  fontSize: 20,
  fontWeight: 700,
  color: "var(--text-strong)",
  lineHeight: 1.25,
};

const riskBadge: CSSProperties = {
  borderRadius: 999,
  border: "1px solid rgba(251,191,36,0.3)",
  padding: "6px 10px",
  fontSize: 11,
  fontWeight: 700,
  flexShrink: 0,
};

const descriptionCard: CSSProperties = {
  marginTop: 14,
  borderRadius: 14,
  border: "1px solid rgba(148,163,184,0.18)",
  background: "var(--bg-panel-deep)",
  padding: "12px 14px",
};

const descriptionLabel: CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  letterSpacing: 0.4,
  textTransform: "uppercase",
  color: "var(--text-muted)",
};

const descriptionText: CSSProperties = {
  fontSize: 13,
  color: "var(--text-dim)",
  marginTop: 8,
  lineHeight: 1.6,
};

const checkboxRow: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  marginTop: 14,
  fontSize: 12,
  color: "var(--text)",
};

const riskMetaCard: CSSProperties = {
  marginTop: 10,
  borderRadius: 12,
  border: "1px solid rgba(255,255,255,0.08)",
  background: "var(--bg-card)",
  padding: "10px 12px",
};

const riskMetaTitle: CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  color: "var(--text-strong)",
};

const riskMetaText: CSSProperties = {
  marginTop: 4,
  fontSize: 11,
  lineHeight: 1.5,
  color: "var(--text-dim)",
};

const decisionHint: CSSProperties = {
  marginTop: 12,
  fontSize: 12,
  lineHeight: 1.5,
  color: "var(--text-muted)",
};

const buttonRow: CSSProperties = {
  display: "flex",
  gap: 10,
  marginTop: 18,
};

const primaryBtn: CSSProperties = {
  flex: 1,
  border: "none",
  borderRadius: 12,
  background: "linear-gradient(135deg, #2563eb 0%, #0ea5e9 100%)",
  color: "white",
  padding: "11px 12px",
  fontWeight: 700,
  cursor: "pointer",
};

const secondaryBtn: CSSProperties = {
  flex: 1,
  border: "1px solid rgba(148,163,184,0.28)",
  borderRadius: 12,
  background: "var(--bg-panel-deep)",
  color: "var(--text)",
  padding: "11px 12px",
  fontWeight: 700,
  cursor: "pointer",
};

const RISK_THEME: Record<ApprovalRiskLevel, { border: string; text: string; background: string; surface: string }> = {
  L0: {
    border: "rgba(34,197,94,0.35)",
    text: "#86efac",
    background: "var(--tone-success-bg)",
    surface: "rgba(20,83,45,0.18)",
  },
  L1: {
    border: "rgba(56,189,248,0.35)",
    text: "#7dd3fc",
    background: "rgba(14,165,233,0.12)",
    surface: "rgba(8,47,73,0.26)",
  },
  L2: {
    border: "var(--tone-warning-border)",
    text: "#fcd34d",
    background: "var(--tone-warning-bg)",
    surface: "rgba(120,53,15,0.22)",
  },
  L3: {
    border: "rgba(248,113,113,0.4)",
    text: "#fca5a5",
    background: "var(--tone-danger-bg)",
    surface: "rgba(127,29,29,0.24)",
  },
};