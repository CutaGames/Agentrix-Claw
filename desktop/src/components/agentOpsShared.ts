/**
 * agentOpsShared — shared CSSProperties + label helpers for the Agent Ops
 * panel suite (AgentOpsPanel / DeliveryPackagesPanel / TeamProductizationPanel).
 *
 * Styles mirror CrossDevicePanel.tsx conventions (dark sheet, var(--text-*)
 * tokens, rounded cards). Kept in one module so all Agent-Ops tabs render with
 * a consistent look without duplicating the style object.
 */
import type { CSSProperties } from "react";
import type { BillingSpec, DeliveryPackageStage } from "../services/agentOpsApi";

// ─── Label helpers ───

export function stageLabel(stage: DeliveryPackageStage | string): string {
  switch (stage) {
    case "S0":
      return "S0 建设期";
    case "S1":
      return "S1 增长";
    case "cross_cutting":
      return "贯穿层";
    default:
      return String(stage);
  }
}

export function billingLabel(billing: BillingSpec | undefined | null): string {
  if (!billing) return "—";
  const model: Record<string, string> = {
    one_time: "一次性 / one-time",
    subscription: "订阅 / subscription",
    per_result: "按结果 / per-result",
    subscription_or_per_result: "订阅或按结果",
  };
  const base = model[billing.model] || billing.model;
  return billing.unit ? `${base} · ${billing.unit}` : base;
}

export function decisionColor(decision: string): string {
  if (decision === "auto_execute") return "#22c55e";
  if (decision === "user_confirmation") return "#f59e0b";
  if (decision === "deny") return "#ef4444";
  return "#94a3b8";
}

export function decisionLabel(decision: string): string {
  if (decision === "auto_execute") return "自动执行 / auto_execute";
  if (decision === "user_confirmation") return "需人确认 / user_confirmation";
  if (decision === "deny") return "拒绝 / deny";
  return decision;
}

export function riskTierColor(tier: string): string {
  switch (tier) {
    case "low":
    case "read":
    case "safe":
      return "#22c55e";
    case "medium":
    case "caution":
      return "#f59e0b";
    case "high":
    case "danger":
      return "#f97316";
    case "redline":
      return "#ef4444";
    case "unknown":
    default:
      return "#94a3b8";
  }
}

export function fmtPercent(rate: number | null | undefined): string {
  if (rate === null || rate === undefined) return "—";
  return `${(rate * 100).toFixed(1)}%`;
}

export function fmtMs(ms: number | null | undefined): string {
  if (ms === null || ms === undefined) return "—";
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

// ─── Styles (mirror CrossDevicePanel.tsx) ───

export const aoStyles: Record<string, CSSProperties> = {
  overlay: {
    position: "fixed",
    inset: 0,
    zIndex: 999,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: "rgba(0,0,0,0.5)",
    backdropFilter: "blur(4px)",
  },
  panel: {
    width: 640,
    maxWidth: "94vw",
    maxHeight: "88vh",
    background: "var(--bg-panel)",
    borderRadius: 16,
    overflow: "hidden",
    display: "flex",
    flexDirection: "column",
    border: "1px solid var(--border)",
    boxShadow: "0 20px 60px rgba(0,0,0,0.4)",
  },
  header: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "16px 20px",
    borderBottom: "1px solid var(--border-light)",
  },
  headerRight: { display: "flex", alignItems: "center", gap: 8 },
  title: { fontSize: 16, fontWeight: 700, color: "var(--text-card)" },
  badge: {
    fontSize: 11,
    padding: "2px 8px",
    borderRadius: 10,
    background: "rgba(59,130,246,0.2)",
    color: "#60a5fa",
    whiteSpace: "nowrap",
  },
  alertBadge: {
    fontSize: 11,
    padding: "2px 8px",
    borderRadius: 10,
    background: "rgba(245,158,11,0.2)",
    color: "#fbbf24",
  },
  closeBtn: {
    background: "none",
    border: "none",
    color: "var(--text-muted)",
    fontSize: 16,
    cursor: "pointer",
    padding: "4px 8px",
  },
  tabBar: {
    display: "flex",
    gap: 0,
    borderBottom: "1px solid var(--border-light)",
    padding: "0 8px",
    overflowX: "auto",
  },
  tab: {
    padding: "10px 12px",
    background: "none",
    border: "none",
    color: "var(--text-muted)",
    fontSize: 12,
    cursor: "pointer",
    borderBottom: "2px solid transparent",
    whiteSpace: "nowrap",
    transition: "all 0.15s",
  },
  tabActive: { color: "#60a5fa", borderBottomColor: "#3b82f6" },
  refreshBtn: {
    background: "none",
    border: "none",
    color: "var(--text-muted)",
    fontSize: 14,
    cursor: "pointer",
    padding: "8px",
    marginLeft: "auto",
  },
  content: { flex: 1, overflow: "auto", padding: "12px 16px" },
  list: { display: "flex", flexDirection: "column", gap: 8 },
  card: {
    background: "var(--bg-card)",
    borderRadius: 10,
    padding: "12px 14px",
    cursor: "pointer",
    border: "1px solid var(--border-light)",
    display: "flex",
    flexDirection: "column",
    gap: 4,
  },
  cardHeader: { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 },
  cardTitle: { fontSize: 13, fontWeight: 600, color: "var(--text-card)" },
  cardMeta: { fontSize: 11, color: "var(--text-dim)" },
  muted: { fontSize: 12, color: "var(--text-muted)" },
  dim: { fontSize: 11, color: "var(--text-dim)" },
  rowItem: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 8,
    padding: "6px 10px",
    borderRadius: 8,
    background: "var(--bg-overlay-light)",
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: 700,
    color: "var(--text-muted)",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    padding: "10px 0 4px",
  },
  empty: { textAlign: "center", color: "var(--text-dim)", fontSize: 13, padding: 28 },
  actionBtn: {
    padding: "8px 14px",
    borderRadius: 8,
    border: "1px solid rgba(59,130,246,0.3)",
    background: "rgba(59,130,246,0.1)",
    color: "#60a5fa",
    fontSize: 12,
    cursor: "pointer",
    textAlign: "center",
  },
  primaryBtn: {
    padding: "8px 14px",
    borderRadius: 8,
    border: "none",
    background: "#3b82f6",
    color: "#fff",
    fontSize: 12,
    cursor: "pointer",
  },
  dangerBtn: {
    padding: "6px 12px",
    borderRadius: 6,
    border: "none",
    background: "#ef4444",
    color: "#fff",
    fontSize: 12,
    cursor: "pointer",
  },
  linkBtn: {
    background: "none",
    border: "none",
    color: "#60a5fa",
    fontSize: 12,
    cursor: "pointer",
    padding: "4px 0",
    textAlign: "left",
    alignSelf: "flex-start",
  },
  input: {
    width: "100%",
    boxSizing: "border-box",
    padding: "8px 10px",
    borderRadius: 8,
    border: "1px solid var(--border)",
    background: "var(--bg-input)",
    color: "var(--text-card)",
    fontSize: 12,
  },
  label: { fontSize: 11, color: "var(--text-muted)", marginBottom: 4, display: "block" },
  field: { marginBottom: 10 },
  formRow: { display: "flex", gap: 8 },
  resultBox: {
    marginTop: 8,
    padding: "10px 12px",
    borderRadius: 8,
    background: "var(--bg-overlay-light)",
    display: "flex",
    flexDirection: "column",
    gap: 4,
  },
  errorBox: {
    marginTop: 8,
    padding: "8px 12px",
    borderRadius: 8,
    background: "rgba(239,68,68,0.12)",
    color: "#fca5a5",
    fontSize: 12,
    borderLeft: "3px solid #ef4444",
  },
  notice: {
    fontSize: 11,
    color: "#fbbf24",
    background: "rgba(245,158,11,0.1)",
    borderRadius: 6,
    padding: "4px 8px",
    marginTop: 4,
  },
  metricGrid: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 },
  metricCard: {
    background: "var(--bg-card)",
    borderRadius: 10,
    padding: "12px 14px",
    border: "1px solid var(--border-light)",
  },
  metricValue: { fontSize: 22, fontWeight: 700, color: "var(--text-card)" },
};
