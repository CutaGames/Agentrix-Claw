/**
 * ActionReceiptsSection — 桌面 D2 切片 5："事项 → 回执"。
 *
 * 只读当前 Agent 在 backend 的 ActionReceipt（services/actionReceipts），按共享合同
 * 校验；不合规的显示为"拒绝展示"，不当成回执。桌面不写、不签、不补任何回执。
 * 产品文档 6.4："Receipts 放进任务详情"——桌面还没有任务详情页，先放在事项里，
 * 每一行就是一件事的详情入口。
 */
import { useCallback, useEffect, useState, type CSSProperties } from "react";
import {
  loadActionReceiptsForAgent,
  type ActionReceiptInventory,
  type ActionReceiptRow,
  type SoulCoreResolution,
} from "../services/actionReceipts";
import { useAuthStore } from "../services/store";
import { useI18n } from "../i18n/I18nProvider";
import { fill, type Translator } from "../i18n/strings";

/**
 * What the owner reads when the receipts list is not there (T7 r2, 10-16).
 * - The Agent has no receipts record on the server (the id lookup answered 404): "no receipts yet", no HTTP code.
 * - Anything else that went wrong: one plain sentence and a retry.
 */
export function receiptsNotice(
  inventory: ActionReceiptInventory,
  resolution: SoulCoreResolution | null,
  t: Translator,
): { text: string; retry: boolean } | null {
  switch (inventory.status) {
    case "ready":
      return null;
    case "no_agent":
      return { text: t("receipts.status.noAgent"), retry: false };
    case "unauthenticated":
      return { text: t("receipts.status.signedOut"), retry: false };
    case "disabled":
      return { text: t("receipts.status.disabled"), retry: false };
    case "no_soul_core":
      return resolution?.status === "unmapped" && resolution.httpStatus === 404
        ? { text: t("receipts.none"), retry: false }
        : { text: t("receipts.unavailable"), retry: true };
    default:
      return { text: t("receipts.unavailable"), retry: true };
  }
}

function environmentText(value: string, t: Translator): string {
  return value === "production" ? "" : fill(t("receipts.row.env"), { env: value });
}

export default function ActionReceiptsSection() {
  const { t } = useI18n();
  const rowStatusText: Record<ActionReceiptRow["receiptStatus"], string> = {
    ready: t("receipts.row.ready"),
    pending: t("receipts.row.pending"),
    not_found: t("receipts.row.notFound"),
    disabled: t("receipts.row.disabled"),
    invalid_contract: t("receipts.row.invalid"),
    http_error: t("receipts.row.httpError"),
  };
  const token = useAuthStore((state) => state.token);
  const agents = useAuthStore((state) => state.agents);
  const activeAgentId = useAuthStore((state) => state.activeAgentId);
  const activeAgent = agents.find((agent) => agent.id === activeAgentId);
  const [resolution, setResolution] = useState<SoulCoreResolution | null>(null);
  const [inventory, setInventory] = useState<ActionReceiptInventory | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async (isAlive: () => boolean = () => true) => {
    setLoading(true);
    const next = await loadActionReceiptsForAgent(token, activeAgent);
    if (!isAlive()) return;
    setResolution(next.resolution);
    setInventory(next.inventory);
    setLoading(false);
  }, [activeAgent, token]);

  useEffect(() => {
    let alive = true;
    void load(() => alive);
    return () => {
      alive = false;
    };
  }, [load]);

  const notice = inventory ? receiptsNotice(inventory, resolution, t) : null;

  return (
    <section style={box} aria-labelledby="action-receipts-title" data-testid="action-receipts">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
        <h2 id="action-receipts-title" style={title}>{t("receipts.title")}</h2>
        <button type="button" style={button} disabled={loading} onClick={() => void load()}>
          {loading ? t("receipts.loading") : t("receipts.reload")}
        </button>
      </div>
      <div style={hint}>{t("receipts.intro")}</div>
      {notice && (
        <div role="status" style={hint} data-testid="action-receipts-status">
          {notice.text}
          {notice.retry && (
            <button type="button" style={{ ...button, marginLeft: 8 }} disabled={loading} onClick={() => void load()} data-testid="action-receipts-retry">
              {t("common.retry")}
            </button>
          )}
        </div>
      )}
      {inventory?.status === "ready" && inventory.rows.length === 0 && (
        <div style={hint}>{t("receipts.noTasks")}</div>
      )}
      {inventory?.status === "ready" && inventory.rows.length > 0 && (
        <ul style={list}>
          {inventory.rows.map((row) => (
            <li key={row.taskId || `${row.actionType}:${row.toolName}`} style={item} data-testid={`receipt-row-${row.taskId}`}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                <span style={{ fontSize: 13 }}>{row.toolName}</span>
                <span style={row.receiptStatus === "invalid_contract" || row.receiptStatus === "http_error" ? badText : hint}>
                  {rowStatusText[row.receiptStatus]}
                </span>
              </div>
              {row.receipt && (
                <div style={hint}>
                  {fill(t("receipts.row.detail"), { id: row.receipt.receiptId, version: row.receipt.outcomeVersion })} · {new Date(row.receipt.recordedAt).toLocaleString()}
                  {environmentText(row.receipt.environment, t)}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

const box: CSSProperties = {
  padding: 12,
  borderRadius: 8,
  border: "1px solid var(--border)",
  marginBottom: 12,
};

const title: CSSProperties = {
  fontSize: 13,
  fontWeight: 600,
  margin: 0,
};

const hint: CSSProperties = {
  fontSize: 11,
  color: "var(--text-dim)",
  marginTop: 4,
  lineHeight: 1.5,
};

const badText: CSSProperties = {
  ...hint,
  color: "var(--tone-danger-text, #dc2626)",
};

const list: CSSProperties = {
  listStyle: "none",
  margin: "8px 0 0",
  padding: 0,
};

const item: CSSProperties = {
  padding: "6px 0",
  borderTop: "1px solid var(--border)",
};

const button: CSSProperties = {
  padding: "4px 10px",
  borderRadius: 6,
  border: "1px solid var(--border)",
  background: "var(--bg-elevated)",
  color: "var(--text)",
  fontSize: 12,
  cursor: "pointer",
};
