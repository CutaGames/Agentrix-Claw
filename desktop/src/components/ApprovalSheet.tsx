import { type CSSProperties } from "react";
import { createPortal } from "react-dom";
import type { ApprovalRiskLevel } from "../services/desktop";

const RISK_COPY: Record<ApprovalRiskLevel, { label: string; description: string }> = {
  L0: {
    label: "Read-only / safe by default",
    description: "Read context, list files, inspect windows, and other non-mutating actions. No approval is normally required.",
  },
  L1: {
    label: "Low-risk write / navigation",
    description: "Opens browser links or writes files with session-level remember support.",
  },
  L2: {
    label: "Command execution / medium risk",
    description: "Runs local commands or similar actions that may change workspace or environment state.",
  },
  L3: {
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
  if (!request) return null;
  if (typeof document === "undefined") return null;
  const riskCopy = RISK_COPY[request.riskLevel];

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
        aria-label="Approval Required"
        onPointerDown={(event) => event.stopPropagation()}
        onMouseDown={(event) => event.stopPropagation()}
        onClick={(event) => event.stopPropagation()}
      >
        <div style={{ fontSize: 11, color: "#fbbf24", textTransform: "uppercase", letterSpacing: 0.6 }}>
          Approval Required
        </div>
        <div style={{ fontSize: 18, fontWeight: 700, marginTop: 6 }}>{request.title}</div>
        <div style={{ fontSize: 13, color: "var(--text-dim)", marginTop: 8, lineHeight: 1.5 }}>
          {request.description}
        </div>
        <div style={riskPill}>Risk {request.riskLevel}</div>
        <div style={riskMetaCard}>
          <div style={riskMetaTitle}>{riskCopy.label}</div>
          <div style={riskMetaText}>{riskCopy.description}</div>
        </div>

        {request.canRememberForSession && (
          <label style={checkboxRow}>
            <input
              type="checkbox"
              checked={rememberForSession}
              disabled={submitting}
              onChange={(event) => onRememberChange(event.target.checked)}
            />
            Approve similar actions for this session
          </label>
        )}

        <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
          <button type="button" onClick={onReject} disabled={submitting} style={{ ...secondaryBtn, opacity: submitting ? 0.6 : 1, cursor: submitting ? "wait" : "pointer" }}>Reject</button>
          <button type="button" onClick={onApprove} disabled={submitting} style={{ ...primaryBtn, opacity: submitting ? 0.7 : 1, cursor: submitting ? "wait" : "pointer" }}>
            {submitting ? "Submitting..." : "Approve"}
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
  background: "rgba(0,0,0,0.55)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  zIndex: 2147483647,
  padding: 16,
  pointerEvents: "auto",
};

const panel: CSSProperties = {
  width: "100%",
  maxWidth: 360,
  background: "var(--bg-panel)",
  border: "1px solid var(--border)",
  borderRadius: 16,
  boxShadow: "var(--shadow)",
  padding: 20,
  pointerEvents: "auto",
};

const riskPill: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  marginTop: 12,
  borderRadius: 999,
  border: "1px solid rgba(251,191,36,0.3)",
  color: "#fbbf24",
  padding: "4px 8px",
  fontSize: 11,
  fontWeight: 600,
  background: "rgba(251,191,36,0.08)",
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
  background: "rgba(255,255,255,0.03)",
  padding: "10px 12px",
};

const riskMetaTitle: CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  color: "#f8fafc",
};

const riskMetaText: CSSProperties = {
  marginTop: 4,
  fontSize: 11,
  lineHeight: 1.5,
  color: "var(--text-dim)",
};

const primaryBtn: CSSProperties = {
  flex: 1,
  border: "none",
  borderRadius: 10,
  background: "var(--accent)",
  color: "white",
  padding: "10px 12px",
  fontWeight: 600,
  cursor: "pointer",
};

const secondaryBtn: CSSProperties = {
  flex: 1,
  border: "1px solid var(--border)",
  borderRadius: 10,
  background: "transparent",
  color: "var(--text)",
  padding: "10px 12px",
  fontWeight: 600,
  cursor: "pointer",
};