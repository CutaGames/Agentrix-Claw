/**
 * NodeAllowlistSection — "这台电脑 → 常开节点（试验）"（L5 N0，REQ-desktop-057）。默认关。
 *
 * 主人在这里列白名单：网站（精确的 origin）和文件夹（系统选文件夹窗口里选）。打开以后，这台电脑上的 AI
 * 在白名单里的网站打开网页、在白名单里的文件夹写文件时不用逐步批准；其余照旧。每条 30 天后到期。
 * 只有这里能改，AI 调不到；急停拉着时打不开。
 */
import { useCallback, useEffect, useId, useState, type CSSProperties } from "react";
import {
  addNodeAllowlistFolder,
  addNodeAllowlistSite,
  describeNodeAllowlistReason,
  readNodeAllowlist,
  removeNodeAllowlistEntry,
  setNodeAllowlistEnabled,
  type NodeAllowlistEditResult,
  type NodeAllowlistView,
} from "../services/nodeAllowlist";
import { getKillSwitchState, onKillSwitchChange } from "../services/executionFence";

function formatDate(ms: number): string {
  try {
    return new Date(ms).toLocaleDateString("zh-CN", { month: "numeric", day: "numeric" });
  } catch {
    return "";
  }
}

export default function NodeAllowlistSection() {
  const [view, setView] = useState<NodeAllowlistView | null>(null);
  const [engaged, setEngaged] = useState(() => getKillSwitchState().engaged);
  const [origin, setOrigin] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const originId = useId();

  const refresh = useCallback(async () => setView(await readNodeAllowlist()), []);

  useEffect(() => {
    void refresh();
    return onKillSwitchChange((state) => setEngaged(state.engaged));
  }, [refresh]);

  const run = async (action: () => Promise<NodeAllowlistEditResult>, done: string) => {
    setBusy(true);
    setMessage("");
    try {
      const result = await action();
      if (!result.ok) setMessage(`没有完成：${describeNodeAllowlistReason(result.reason)}`);
      else if (result.view) {
        setView(result.view);
        setMessage(done);
      }
    } finally {
      setBusy(false);
    }
  };

  const enabled = view?.enabled === true;
  const live = (view?.entries ?? []).filter((entry) => !entry.expired);

  return (
    <section style={box} aria-labelledby="node-allowlist-title" data-testid="node-allowlist">
      <h2 id="node-allowlist-title" style={title}>常开节点（试验）</h2>
      <div style={hint} id="node-allowlist-desc">
        打开以后，这台电脑上的 AI 在下面这些网站打开网页、在这些文件夹里写文件时，不用一步步批准。点击、输入、运行命令、付钱、发消息、删除照旧每次问你；手机和云端发来的操作不看这份名单。急停拉下时名单不起作用。
      </div>

      {view?.integrity === "tampered" && (
        <div role="alert" style={warn} data-testid="node-allowlist-tampered">
          名单文件被改过或读不懂，已经按空名单、关闭处理。重新添加即可。
        </div>
      )}
      {view?.integrity === "key_unavailable" && (
        <div role="alert" style={warn}>读不到钥匙串，名单按空的、关闭处理。</div>
      )}

      <label style={{ ...hint, display: "flex", gap: 6, alignItems: "center" }}>
        <input
          type="checkbox"
          checked={enabled}
          disabled={busy || view === null || view.integrity === "unknown" || (engaged && !enabled)}
          aria-describedby="node-allowlist-desc"
          onChange={(e) => void run(() => setNodeAllowlistEnabled(e.target.checked), e.target.checked ? "已打开" : "已关闭")}
          data-testid="node-allowlist-toggle"
        />
        打开常开节点
      </label>
      {engaged && <div style={hint}>急停拉着，现在不能打开。</div>}

      <ul style={list} aria-label="白名单">
        {live.length === 0 && <li style={hint}>名单是空的。</li>}
        {live.map((entry) => (
          <li key={entry.id} style={item} data-testid="node-allowlist-entry">
            <span style={{ fontSize: 12, wordBreak: "break-all" }}>
              {entry.kind === "site" ? "网站 " : "文件夹 "}
              {entry.value}
            </span>
            <span style={hint}>到 {formatDate(entry.expiresAt)}</span>
            <button
              type="button"
              style={button}
              disabled={busy}
              aria-label={`从白名单删掉 ${entry.value}`}
              onClick={() => void run(() => removeNodeAllowlistEntry(entry.id), "已删掉")}
            >
              删掉
            </button>
          </li>
        ))}
      </ul>

      <form
        style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap" }}
        onSubmit={(e) => {
          e.preventDefault();
          if (!origin.trim()) return;
          void run(async () => {
            const result = await addNodeAllowlistSite(origin.trim());
            if (result.ok) setOrigin("");
            return result;
          }, "已加入，30 天后到期");
        }}
      >
        <label htmlFor={originId} style={{ ...hint, width: "100%" }}>
          加一个网站（写到域名为止，例如 https://mail.google.com）
        </label>
        <input
          id={originId}
          value={origin}
          onChange={(e) => setOrigin(e.target.value)}
          placeholder="https://"
          style={input}
          autoComplete="off"
          spellCheck={false}
        />
        <button type="submit" style={button} disabled={busy || !origin.trim()}>
          加入网站
        </button>
        <button type="button" style={button} disabled={busy} onClick={() => void run(() => addNodeAllowlistFolder(), "已加入，30 天后到期")}>
          选一个文件夹
        </button>
      </form>

      {message && (
        <div role="status" style={hint} data-testid="node-allowlist-message">
          {message}
        </div>
      )}
    </section>
  );
}

const box: CSSProperties = { padding: 12, borderRadius: 8, border: "1px solid var(--border)", marginBottom: 12 };
const title: CSSProperties = { fontSize: 13, fontWeight: 600, margin: 0 };
const hint: CSSProperties = { fontSize: 11, color: "var(--text-dim)", marginTop: 4, lineHeight: 1.5 };
const warn: CSSProperties = { ...hint, color: "var(--tone-warning-text)" };
const list: CSSProperties = { listStyle: "none", margin: "8px 0 0", padding: 0 };
const item: CSSProperties = { display: "flex", gap: 8, alignItems: "baseline", padding: "4px 0", borderTop: "1px solid var(--border)" };
const input: CSSProperties = {
  flex: 1,
  minWidth: 180,
  padding: "4px 8px",
  borderRadius: 6,
  border: "1px solid var(--border)",
  background: "var(--bg-elevated)",
  color: "var(--text)",
  fontSize: 12,
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
