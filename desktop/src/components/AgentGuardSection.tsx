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
  claudeProtectionText,
  claudeSnapshotText,
  cursorProtectionText,
  cursorSnapshotText,
  describeAgentGuardReason,
  guardControls,
  installClaudeCodeGuard,
  installCursorGuard,
  isProtected,
  readAgentGuardStatus,
  snapshotsOn,
  uninstallClaudeCodeGuard,
  uninstallCursorGuard,
  type AgentGuardEditResult,
  type AgentGuardStatus,
  type ClaudeProtection,
  type ClaudeSnapshotProtection,
} from "../services/agentGuard";
import { getKillSwitchState, onKillSwitchChange } from "../services/executionFence";
import { useI18n } from "../i18n/I18nProvider";
import { fill } from "../i18n/strings";

export default function AgentGuardSection() {
  const { t } = useI18n();
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
        setMessage(fill(t("guard.msg.failed"), { reason: describeAgentGuardReason(result.reason, t) || t("common.unknown") }));
      } else if (!result.changed) {
        setMessage(t("guard.msg.nothingToChange"));
      } else {
        setMessage(result.backedUp ? fill(t("guard.msg.backedUp"), { done, dir: backupDir }) : done);
      }
    } finally {
      await refresh();
      setBusy(false);
    }
  };

  const recheck = async () => {
    setBusy(true);
    setMessage("");
    try {
      await refresh();
    } finally {
      setBusy(false);
    }
  };

  return (
    <section style={box} aria-labelledby="agent-guard-title" data-testid="agent-guard">
      <h2 id="agent-guard-title" style={title}>{t("guard.title")}</h2>
      <div style={hint}>{t("guard.intro")}</div>
      <ul style={list}>
        <GuardItem
          testId="agent-guard-claude"
          snapshotTestId="agent-guard-claude-snapshots"
          name="Claude Code"
          loaded={status !== null}
          state={status?.claudeCode ?? "unknown"}
          snapshots={status?.claudeCodeSnapshots ?? "unknown"}
          stateText={claudeProtectionText}
          snapshotText={claudeSnapshotText}
          busy={busy}
          killSwitchEngaged={killSwitchEngaged}
          descId="agent-guard-uninstall-desc"
          desc={t("guard.claude.desc")}
          onInstall={() => void run(installClaudeCodeGuard, t("guard.msg.claudeOn"))}
          onUninstall={() => void run(uninstallClaudeCodeGuard, t("guard.msg.claudeOff"))}
          onRecheck={() => void recheck()}
        />
        <GuardItem
          testId="agent-guard-cursor"
          snapshotTestId="agent-guard-cursor-snapshots"
          name="Cursor"
          loaded={status !== null}
          state={status?.cursor ?? "unknown"}
          snapshots={status?.cursorSnapshots ?? "unknown"}
          stateText={cursorProtectionText}
          snapshotText={cursorSnapshotText}
          busy={busy}
          killSwitchEngaged={killSwitchEngaged}
          descId="agent-guard-cursor-desc"
          desc={t("guard.cursor.desc")}
          enableLabel={t("guard.aria.cursorOn")}
          disableLabel={t("guard.aria.cursorOff")}
          onInstall={() => void run(installCursorGuard, t("guard.msg.cursorOn"), "~/.cursor")}
          onUninstall={() => void run(uninstallCursorGuard, t("guard.msg.cursorOff"), "~/.cursor")}
          onRecheck={() => void recheck()}
        />
      </ul>
      {message && (
        <div role="status" style={hint} data-testid="agent-guard-message">
          {message}
        </div>
      )}
    </section>
  );
}

/**
 * One row (Claude Code or Cursor). The buttons follow what was read (T7 r2, 10-16): a state that could not be read
 * offers only a quiet "Check again"; one read as off offers "Turn on protection"; one read as on offers "Remove".
 */
function GuardItem({
  testId,
  snapshotTestId,
  name,
  loaded,
  state,
  snapshots,
  stateText,
  snapshotText,
  busy,
  killSwitchEngaged,
  descId,
  desc,
  enableLabel,
  disableLabel,
  onInstall,
  onUninstall,
  onRecheck,
}: {
  testId: string;
  snapshotTestId: string;
  name: string;
  loaded: boolean;
  state: ClaudeProtection;
  snapshots: ClaudeSnapshotProtection;
  stateText: (state: ClaudeProtection, t: (key: string) => string) => string;
  snapshotText: (state: ClaudeSnapshotProtection, t: (key: string) => string) => string;
  busy: boolean;
  killSwitchEngaged: boolean;
  descId: string;
  desc: string;
  enableLabel?: string;
  disableLabel?: string;
  onInstall: () => void;
  onUninstall: () => void;
  onRecheck: () => void;
}) {
  const { t } = useI18n();
  const controls = guardControls(state, snapshots);
  const showSnapshots = loaded && controls.readable && state !== "not_installed" && state !== "unsupported";
  const showButtons = loaded && (controls.enable || controls.reinstall || controls.disable);
  return (
    <li style={item} data-testid={testId}>
      <div style={row}>
        <span style={{ fontSize: 13 }}>{name}</span>
        <span style={isProtected(state) ? okText : badText}>{loaded ? stateText(state, t) : t("runtime.loading")}</span>
      </div>
      {showSnapshots && (
        <div style={snapshotsOn(snapshots) ? okText : badText} data-testid={snapshotTestId}>
          {snapshotText(snapshots, t)}
        </div>
      )}
      {loaded && !controls.readable && (
        <div style={{ marginTop: 6 }}>
          <button type="button" style={quietButton} disabled={busy} onClick={onRecheck} data-testid={`${testId}-recheck`}>
            {t("common.checkAgain")}
          </button>
        </div>
      )}
      {showButtons && (
        <>
          <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
            {(controls.enable || controls.reinstall) && (
              <button type="button" style={button} disabled={busy} aria-label={enableLabel} onClick={onInstall}>
                {controls.reinstall ? t("guard.btn.reinstall") : t("guard.btn.enable")}
              </button>
            )}
            {controls.disable && (
              <button
                type="button"
                style={button}
                disabled={busy || killSwitchEngaged}
                aria-label={disableLabel}
                aria-describedby={descId}
                onClick={onUninstall}
              >
                {t("guard.btn.disable")}
              </button>
            )}
          </div>
          <div id={descId} style={hint}>
            {desc}
          </div>
        </>
      )}
    </li>
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

const quietButton: CSSProperties = {
  ...button,
  background: "transparent",
  color: "var(--text-dim)",
};
