/**
 * AgentGuardSection — 桌面 D3 切片 4b："我的 AI 们 → 急停管得到哪些 AI"。
 *
 * - Claude Code：显示受保护 / 未受保护，本人点"开启保护"写入 hook（先备份原设置），
 *   点"移除保护"撤掉（急停拉下时不行）。
 * - Cursor：同样的拦截脚本和快照 hook 装进 `~/.cursor/hooks.json` 的 preToolUse；Cursor 改、删的文件
 *   也能从"今天的改动"撤回。
 */
import { useCallback, useEffect, useState, type CSSProperties } from "react";
import {
  CLAUDE_PROTECTION_TEXT,
  CLAUDE_SNAPSHOT_TEXT,
  CURSOR_PROTECTION_TEXT,
  CURSOR_SNAPSHOT_TEXT,
  snapshotsOn,
  describeAgentGuardReason,
  installClaudeCodeGuard,
  installCursorGuard,
  isProtected,
  readAgentGuardStatus,
  uninstallClaudeCodeGuard,
  uninstallCursorGuard,
  type AgentGuardEditResult,
  type AgentGuardStatus,
} from "../services/agentGuard";
import { getKillSwitchState, onKillSwitchChange } from "../services/executionFence";

export default function AgentGuardSection() {
  const [status, setStatus] = useState<AgentGuardStatus | null>(null);
  const [killSwitchEngaged, setKillSwitchEngaged] = useState(() => getKillSwitchState().engaged);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  const refresh = useCallback(async () => {
    const next = await readAgentGuardStatus();
    setStatus(next);
    return next;
  }, []);

  useEffect(() => {
    let alive = true;
    void readAgentGuardStatus().then((next) => {
      if (alive) setStatus(next);
    });
    const off = onKillSwitchChange((state) => setKillSwitchEngaged(state.engaged));
    return () => {
      alive = false;
      off();
    };
  }, []);

  const run = async (action: () => Promise<AgentGuardEditResult>, done: string, backupDir = "~/.claude") => {
    setBusy(true);
    setMessage("");
    try {
      const result = await action();
      if (!result.ok) {
        setMessage(`没有完成：${describeAgentGuardReason(result.reason) || "未知"}`);
      } else if (!result.changed) {
        setMessage("没有需要改动的");
      } else {
        setMessage(result.backedUp ? `${done}（原设置已备份在 ${backupDir} 里）` : done);
      }
    } finally {
      await refresh();
      setBusy(false);
    }
  };

  const claude = status?.claudeCode ?? "unknown";
  const snapshots = status?.claudeCodeSnapshots ?? "unknown";
  // 已受保护但快照没开（切片 4b 装的，或者 Agentrix 换了位置）：再点一次"开启保护"补上。
  const snapshotsNeedRepair = claude === "protected" && (snapshots === "off" || snapshots === "binary_missing");
  const canInstall = !busy && (claude === "unprotected" || claude === "script_missing" || snapshotsNeedRepair);
  const canUninstall = !busy && !killSwitchEngaged && (claude === "protected" || claude === "script_missing");
  const cursor = status?.cursor ?? "unknown";
  const cursorSnapshots = status?.cursorSnapshots ?? "unknown";
  // REQ-desktop-036 装的只有拦截：再点一次"开启保护"补上快照。
  const cursorSnapshotsNeedRepair =
    cursor === "protected" && (cursorSnapshots === "off" || cursorSnapshots === "binary_missing");
  const canInstallCursor =
    !busy && (cursor === "unprotected" || cursor === "script_missing" || cursorSnapshotsNeedRepair);
  const canUninstallCursor = !busy && !killSwitchEngaged && (cursor === "protected" || cursor === "script_missing");

  return (
    <section style={box} aria-labelledby="agent-guard-title" data-testid="agent-guard">
      <h2 id="agent-guard-title" style={title}>急停管得到哪些 AI</h2>
      <div style={hint}>Agentrix 自己的 AI 一直受急停管。别家的 AI 要装上拦截才管得到；没装的标"未受保护"。</div>
      <ul style={list}>
        <li style={item} data-testid="agent-guard-claude">
          <div style={row}>
            <span style={{ fontSize: 13 }}>Claude Code</span>
            <span style={isProtected(claude) ? okText : badText}>{status ? CLAUDE_PROTECTION_TEXT[claude] : "读取中…"}</span>
          </div>
          {status && claude !== "not_installed" && claude !== "unsupported" && (
            <div style={snapshotsOn(snapshots) ? okText : badText} data-testid="agent-guard-claude-snapshots">
              {CLAUDE_SNAPSHOT_TEXT[snapshots]}
            </div>
          )}
          <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
            <button type="button" style={button} disabled={!canInstall} onClick={() => void run(installClaudeCodeGuard, "已开启保护")}>
              {claude === "script_missing" || snapshotsNeedRepair ? "重新安装保护" : "开启保护"}
            </button>
            <button
              type="button"
              style={button}
              disabled={!canUninstall}
              aria-describedby="agent-guard-uninstall-desc"
              onClick={() => void run(uninstallClaudeCodeGuard, "已移除保护")}
            >
              移除保护
            </button>
          </div>
          <div id="agent-guard-uninstall-desc" style={hint}>
            开启保护会在 Claude Code 的用户设置里加两个工具调用前的检查：一个只在急停拉下时拦截；另一个在它写文件、改文件之前把原文件存一份快照（保留 7 天，大于 2 MB 的不存），存不下就拦下这次改动。平时不改变 Claude Code 自己的确认方式。急停拉下时不能移除。
          </div>
        </li>
        <li style={item} data-testid="agent-guard-cursor">
          <div style={row}>
            <span style={{ fontSize: 13 }}>Cursor</span>
            <span style={isProtected(cursor) ? okText : badText}>{status ? CURSOR_PROTECTION_TEXT[cursor] : "读取中…"}</span>
          </div>
          {status && cursor !== "not_installed" && cursor !== "unsupported" && (
            <>
              <div style={snapshotsOn(cursorSnapshots) ? okText : badText} data-testid="agent-guard-cursor-snapshots">
                {CURSOR_SNAPSHOT_TEXT[cursorSnapshots]}
              </div>
              <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
                <button
                  type="button"
                  style={button}
                  disabled={!canInstallCursor}
                  aria-label="开启 Cursor 的保护"
                  onClick={() => void run(installCursorGuard, "已开启 Cursor 的保护", "~/.cursor")}
                >
                  {cursor === "script_missing" || cursorSnapshotsNeedRepair ? "重新安装保护" : "开启保护"}
                </button>
                <button
                  type="button"
                  style={button}
                  disabled={!canUninstallCursor}
                  aria-label="移除 Cursor 的保护"
                  aria-describedby="agent-guard-cursor-desc"
                  onClick={() => void run(uninstallCursorGuard, "已移除 Cursor 的保护", "~/.cursor")}
                >
                  移除保护
                </button>
              </div>
              <div id="agent-guard-cursor-desc" style={hint}>
                开启保护会在 Cursor 的用户 hooks（~/.cursor/hooks.json）里加两个工具调用前的检查：一个只在急停拉下时拦截 Agent 的操作；另一个在它写文件、删文件之前把原文件存一份快照（保留 7 天，大于 2 MB 的不存），存不下就拦下这次改动。平时不改变 Cursor 自己的确认方式。急停拉下时不能移除。
              </div>
            </>
          )}
        </li>
      </ul>
      {message && (
        <div role="status" style={hint} data-testid="agent-guard-message">
          {message}
        </div>
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

const title: CSSProperties = { fontSize: 13, fontWeight: 600, margin: 0 };

const hint: CSSProperties = {
  fontSize: 11,
  color: "var(--text-dim)",
  marginTop: 4,
  lineHeight: 1.5,
};

const okText: CSSProperties = { ...hint, color: "var(--tone-success-text, #16a34a)" };
const badText: CSSProperties = { ...hint, color: "var(--tone-warning-text, #d97706)" };

const list: CSSProperties = { listStyle: "none", margin: "8px 0 0", padding: 0 };
const item: CSSProperties = { padding: "8px 0", borderTop: "1px solid var(--border)" };
const row: CSSProperties = { display: "flex", justifyContent: "space-between", gap: 8, alignItems: "baseline" };

const button: CSSProperties = {
  padding: "4px 10px",
  borderRadius: 6,
  border: "1px solid var(--border)",
  background: "var(--bg-elevated)",
  color: "var(--text)",
  fontSize: 12,
  cursor: "pointer",
};
