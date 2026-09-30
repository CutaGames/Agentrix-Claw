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

const ROW_STATUS_TEXT: Record<ActionReceiptRow["receiptStatus"], string> = {
  ready: "有回执",
  pending: "还没结束",
  not_found: "没有回执",
  disabled: "回执功能未开启",
  invalid_contract: "拒绝展示（不合规）",
  http_error: "读取失败",
};

const INVENTORY_TEXT: Record<ActionReceiptInventory["status"], string> = {
  ready: "",
  no_agent: "没有当前 Agent。",
  no_soul_core: "这个 Agent 在服务端没有 Soul Core，读不到回执。",
  unauthenticated: "登录后才能读回执。",
  http_error: "服务端的事项列表读不到。",
  network_error: "连不上服务端。",
  invalid_contract: "服务端返回的列表格式无法识别，不当成没有回执。",
  disabled: "回执功能未开启。",
};

function environmentText(value: string): string {
  return value === "production" ? "" : `（${value} 环境）`;
}

export default function ActionReceiptsSection() {
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

  return (
    <section style={box} aria-labelledby="action-receipts-title" data-testid="action-receipts">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
        <h2 id="action-receipts-title" style={title}>回执</h2>
        <button type="button" style={button} disabled={loading} onClick={() => void load()}>
          {loading ? "读取中…" : "重新读取"}
        </button>
      </div>
      <div style={hint}>服务端签发的回执，按共享合同校验过才显示。这台电脑不写、不补回执。</div>
      {inventory && inventory.status !== "ready" && (
        <div role="status" style={hint} data-testid="action-receipts-status">
          {INVENTORY_TEXT[inventory.status] || inventory.status}
          {resolution?.status === "unmapped" && `（HTTP ${resolution.httpStatus}）`}
        </div>
      )}
      {inventory?.status === "ready" && inventory.rows.length === 0 && (
        <div style={hint}>这个 Agent 还没有做过的事。</div>
      )}
      {inventory?.status === "ready" && inventory.rows.length > 0 && (
        <ul style={list}>
          {inventory.rows.map((row) => (
            <li key={row.taskId || `${row.actionType}:${row.toolName}`} style={item} data-testid={`receipt-row-${row.taskId}`}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                <span style={{ fontSize: 13 }}>{row.toolName}</span>
                <span style={row.receiptStatus === "invalid_contract" || row.receiptStatus === "http_error" ? badText : hint}>
                  {ROW_STATUS_TEXT[row.receiptStatus]}
                </span>
              </div>
              {row.receipt && (
                <div style={hint}>
                  回执 {row.receipt.receiptId} · 第 {row.receipt.outcomeVersion} 版 · {new Date(row.receipt.recordedAt).toLocaleString()}
                  {environmentText(row.receipt.environment)}
                </div>
              )}
              {!row.receipt && row.receiptErrors && row.receiptErrors.length > 0 && (
                <div style={hint}>原因：{row.receiptErrors.slice(0, 3).join("；")}</div>
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
