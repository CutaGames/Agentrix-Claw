/**
 * SpendApprovalCard — 对话里的一张付款批准卡（D2，`shared/types/spend-budget.ts`）。默认关（`SPEND_CARD_ENABLED_KEY`）。
 *
 * 先按 `approvalRef` 读批准记录，读到了才显示按钮；按钮由 `spendApprovalActionsV0` 决定。批准 / 拒绝只来自这里本人的点击。
 * 要最近登录的那种，桌面没有就地确认：提示去手机或网页批准。
 */
import { useCallback, useEffect, useState, type CSSProperties } from "react";
import type { SpendApprovalEventV0, SpendApprovalViewV0 } from "../../../../shared/types/spend-budget";
import {
  decideSpendApproval,
  describeSpendError,
  describeSpendPath,
  describeSpendStatus,
  formatCents,
  formatOriginal,
  readSpendApproval,
  spendApprovalActionsV0,
  type SpendActionError,
} from "../../services/spendApproval";
import { useSpendCards } from "./spendCardStore";

export function SpendApprovalCard({ event }: { event: SpendApprovalEventV0 }) {
  const [view, setView] = useState<SpendApprovalViewV0 | null>(null);
  const [error, setError] = useState<SpendActionError | null>(null);
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    const result = await readSpendApproval(event.approvalRef);
    if (result.ok) {
      setView(result.view);
      setError(null);
    } else setError(result.error);
  }, [event.approvalRef]);
  useEffect(() => {
    void load();
  }, [load]);
  const decide = async (decision: "approve" | "reject") => {
    setBusy(true);
    try {
      const result = await decideSpendApproval(event.approvalRef, decision);
      if (result.ok) {
        setView(result.view);
        setError(null);
      } else setError(result.error);
    } finally {
      setBusy(false);
    }
  };
  const spend = view?.spend ?? event.spend;
  const actions = view ? spendApprovalActionsV0(view) : { approve: false, reject: false };
  const original = formatOriginal(spend.original);
  return (
    <div role="group" aria-label={`付款批准：${spend.payeeLabel} ${formatCents(spend.amountCents)}`} style={card} data-testid="spend-card">
      <div style={{ fontSize: 12, fontWeight: 600 }}>
        {describeSpendPath(spend.path)} · 付给 {spend.payeeLabel}
      </div>
      <div style={{ fontSize: 16, fontWeight: 600, marginTop: 2 }} data-testid="spend-card-amount">
        {formatCents(spend.amountCents)}
        {original && <span style={dim}>（约，原价 {original}）</span>}
      </div>
      {event.reason && <div style={dim}>{event.reason}</div>}
      <div style={dim} data-testid="spend-card-status">
        {view ? describeSpendStatus(view.status) : "正在读取…"}
        {view?.status === "pending" && ` · ${new Date(view.expiresAt).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })} 前有效`}
        {view?.resultSummary && ` · ${view.resultSummary}`}
      </div>
      {spend.stepUpRequired && view?.status === "pending" && <div style={dim}>这笔要最近登录过才能批准。</div>}
      {error && (
        <div role="alert" style={{ ...dim, color: "var(--tone-warning-text)" }} data-testid="spend-card-error">
          {describeSpendError(error)}
        </div>
      )}
      {(actions.approve || actions.reject) && (
        <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
          {actions.approve && (
            <button type="button" style={primary} disabled={busy} onClick={() => void decide("approve")}>
              批准付款
            </button>
          )}
          {actions.reject && (
            <button type="button" style={button} disabled={busy} onClick={() => void decide("reject")}>
              拒绝
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export default function SpendApprovalCards({ sessionId }: { sessionId: string | null | undefined }) {
  const events = useSpendCards(sessionId);
  if (events.length === 0) return null;
  return (
    <div style={{ padding: "0 16px" }} aria-label="付款批准">
      {events.map((event) => (
        <SpendApprovalCard key={event.approvalRef} event={event} />
      ))}
    </div>
  );
}

const card: CSSProperties = { padding: 10, borderRadius: 8, border: "1px solid var(--border)", margin: "6px 0", background: "var(--bg-elevated)" };
const dim: CSSProperties = { fontSize: 11, color: "var(--text-dim)", marginTop: 2, lineHeight: 1.5 };
const button: CSSProperties = {
  padding: "4px 10px",
  borderRadius: 6,
  border: "1px solid var(--border)",
  background: "var(--bg-elevated)",
  color: "var(--text)",
  fontSize: 12,
  cursor: "pointer",
};
const primary: CSSProperties = { ...button, fontWeight: 600 };
