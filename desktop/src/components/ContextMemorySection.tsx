/**
 * ContextMemorySection — 桌面 A6 / D4"共用记忆"："我的 AI 们 → 哪个 AI 能读我的记忆"。
 *
 * 每个客户端（Cursor、Claude Code、Kiro）一行：开通 / 撤销，并且单独决定要不要让它读 `agent_memory`。
 * 打开或关闭记忆 = 用新的类别重新开通一次。默认关；本机开关 `VITE_CONTEXT_MEMORY_MCP_ENABLED=1`
 * 才会显示（DesktopShell 里判断）。凭据由 Rust 存在系统钥匙串里，这里看不到 token。
 */
import { useCallback, useEffect, useState, type CSSProperties } from "react";
import {
  MEMORY_CLIENT_NAME,
  describeCredentialReason,
  issueMemoryCredential,
  readMcpLaunchSnippet,
  readMemoryClientStatuses,
  refreshMemoryCredential,
  revokeMemoryCredential,
  type CredentialActionResult,
  type MemoryClientStatus,
} from "../services/contextMemoryCredentials";
import { getKillSwitchState, onKillSwitchChange } from "../services/executionFence";

export default function ContextMemorySection() {
  const [rows, setRows] = useState<MemoryClientStatus[] | null>(null);
  const [killSwitchEngaged, setKillSwitchEngaged] = useState(() => getKillSwitchState().engaged);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [snippet, setSnippet] = useState<{ clientId: string; text: string } | null>(null);

  const refresh = useCallback(async () => setRows(await readMemoryClientStatuses()), []);

  useEffect(() => {
    let alive = true;
    void readMemoryClientStatuses().then((next) => {
      if (alive) setRows(next);
    });
    const off = onKillSwitchChange((state) => setKillSwitchEngaged(state.engaged));
    return () => {
      alive = false;
      off();
    };
  }, []);

  // 凭据 30 分钟到期；窗口开着时，过了 20 分钟的就刷新一次（急停拉着时 Rust 会拒绝）。
  useEffect(() => {
    if (!rows || killSwitchEngaged) return;
    const timer = setInterval(() => {
      void (async () => {
        const current = await readMemoryClientStatuses();
        for (const row of current) if (row.issued && !row.expired) await refreshMemoryCredential(row.clientId);
        setRows(await readMemoryClientStatuses());
      })();
    }, 10 * 60 * 1000);
    return () => clearInterval(timer);
  }, [rows, killSwitchEngaged]);

  const run = async (action: () => Promise<CredentialActionResult>, done: string) => {
    setBusy(true);
    setMessage("");
    try {
      const result = await action();
      setMessage(result.ok ? done : `没有成功：${describeCredentialReason(result.reason)}`);
    } finally {
      await refresh();
      setBusy(false);
    }
  };

  const showSnippet = async (row: MemoryClientStatus) => {
    const text = await readMcpLaunchSnippet(row.clientId);
    setSnippet(text ? { clientId: row.clientId, text } : null);
    if (!text) setMessage("没有成功：读不到启动命令");
  };

  return (
    <section style={box} aria-labelledby="context-memory-title" data-testid="context-memory">
      <h2 id="context-memory-title" style={title}>共用记忆</h2>
      <div style={hint}>
        让你装在这台电脑上的 AI 读到你允许的资料。默认只给个人资料和偏好；记忆要你给每个 AI 单独打开。每条内容都带来源，AI
        提议的新记忆要你在手机或网页上确认才算数。急停拉下时，它们全部停止读取。
      </div>
      <ul style={list}>
        {(rows ?? []).map((row) => (
          <li key={row.clientId} style={item} data-testid={`context-memory-${row.clientId}`}>
            <div style={rowStyle}>
              <span style={{ fontSize: 13 }}>{MEMORY_CLIENT_NAME[row.clientId]}</span>
              <span style={row.issued && !row.expired ? okText : badText}>
                {row.error ? "读不到凭据" : !row.issued ? "未开通" : row.expired ? "已过期" : row.memoryOn ? "已开通（含记忆）" : "已开通（不含记忆）"}
              </span>
            </div>
            <div style={{ display: "flex", gap: 8, marginTop: 6, flexWrap: "wrap" }}>
              {(!row.issued || row.expired) && (
                <button type="button" style={button} disabled={busy || killSwitchEngaged} onClick={() => void run(() => issueMemoryCredential(row.clientId, false), `${MEMORY_CLIENT_NAME[row.clientId]} 已开通`)}>
                  开通
                </button>
              )}
              {row.issued && (
                <>
                  <button
                    type="button"
                    style={button}
                    disabled={busy || killSwitchEngaged}
                    onClick={() =>
                      void run(
                        () => issueMemoryCredential(row.clientId, !row.memoryOn),
                        row.memoryOn ? `${MEMORY_CLIENT_NAME[row.clientId]} 不再读你的记忆` : `${MEMORY_CLIENT_NAME[row.clientId]} 现在可以读你的记忆`,
                      )
                    }
                  >
                    {row.memoryOn ? "关闭记忆" : "允许读记忆"}
                  </button>
                  <button type="button" style={button} disabled={busy || killSwitchEngaged} onClick={() => void showSnippet(row)}>
                    启动命令
                  </button>
                  <button
                    type="button"
                    style={button}
                    disabled={busy}
                    onClick={() => void run(() => revokeMemoryCredential(row.clientId, row.deviceId), `${MEMORY_CLIENT_NAME[row.clientId]} 已撤销`)}
                  >
                    撤销
                  </button>
                </>
              )}
            </div>
            {snippet?.clientId === row.clientId && (
              <>
                <div style={hint}>把下面的内容放进 {MEMORY_CLIENT_NAME[row.clientId]} 的 MCP 设置里（Agentrix 不会替你改它的设置文件）：</div>
                <pre style={code}>{snippet.text}</pre>
              </>
            )}
          </li>
        ))}
      </ul>
      {message && (
        <div role="status" style={hint} data-testid="context-memory-message">
          {message}
        </div>
      )}
    </section>
  );
}

const box: CSSProperties = { padding: 12, borderRadius: 8, border: "1px solid var(--border)", marginBottom: 12 };
const title: CSSProperties = { fontSize: 13, fontWeight: 600, margin: 0 };
const hint: CSSProperties = { fontSize: 11, color: "var(--text-dim)", marginTop: 4, lineHeight: 1.5 };
const okText: CSSProperties = { ...hint, color: "var(--tone-success-text, #16a34a)" };
const badText: CSSProperties = { ...hint, color: "var(--tone-warning-text, #d97706)" };
const list: CSSProperties = { listStyle: "none", margin: "8px 0 0", padding: 0 };
const item: CSSProperties = { padding: "8px 0", borderTop: "1px solid var(--border)" };
const rowStyle: CSSProperties = { display: "flex", justifyContent: "space-between", gap: 8, alignItems: "baseline" };
const code: CSSProperties = { fontSize: 11, padding: 8, borderRadius: 6, border: "1px solid var(--border)", overflowX: "auto", userSelect: "all" };
const button: CSSProperties = {
  padding: "4px 10px",
  borderRadius: 6,
  border: "1px solid var(--border)",
  background: "var(--bg-elevated)",
  color: "var(--text)",
  fontSize: 12,
  cursor: "pointer",
};
