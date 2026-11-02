// Sprint Pre-launch P-3 (2026-05-23) — Per-turn summary footer.
//
// Renders a compact "刚才做了什么 · 下一步可能要 X" pill below an assistant
// message. Surfaces the agent's last turn in plain language so non-coder
// users (Simple mode) feel a concrete sense of progress instead of staring
// at a wall of streamed text.
//
// v0 strategy: derive the summary from already-known signals in the message
// itself + the turn's tool timeline. No extra LLM round trip. Fields used:
//   - tool calls fired this turn (file writes, commands, screenshots)
//   - workspace changes detected post-turn
//   - error / max_tokens flags
//   - the assistant's own bullet/heading lines
// A v1 upgrade (later) can call a tiny summarizer LLM to refine wording.

import { useMemo, useState, type CSSProperties } from "react";
import type { ChatMessage } from "../../services/store";
import type { GitFileChange } from "../../services/git";
import { captureScreen } from "../../services/screenshot";
import { useI18n } from "../../i18n/I18nProvider";
import { pickFor, type Pick } from "../../i18n/pick";

interface Props {
  message: ChatMessage;
  workspaceChanges: GitFileChange[];
}

export default function TurnSummaryFooter({ message, workspaceChanges }: Props) {
  const { locale } = useI18n();
  const p = pickFor(locale);
  const summary = useMemo(() => buildSummary(message, workspaceChanges, p), [message, workspaceChanges, locale]); // eslint-disable-line react-hooks/exhaustive-deps
  const [verifying, setVerifying] = useState(false);
  const [verifyError, setVerifyError] = useState<string | null>(null);
  if (!summary) return null;

  // Sprint Pre-launch P-3 (2026-05-23) — "Show me the result" button.
  // Triggers a screenshot via the existing `captureScreen` service and
  // surfaces it as a workspace artifact event the chat layer can pick up.
  const canVerify = workspaceChanges.length > 0 || /改|create|generate|build/i.test(message.content || "");
  const onVerify = async () => {
    if (verifying) return;
    setVerifying(true);
    setVerifyError(null);
    try {
      const result = await captureScreen();
      const dataUrl = `data:image/png;base64,${result.dataBase64}`;
      window.dispatchEvent(new CustomEvent("agentrix:turn-screenshot", {
        detail: { messageId: message.id, dataUrl, capturedAt: Date.now() },
      }));
    } catch (err: any) {
      setVerifyError(err?.message || p("截图失败，可在设置里开启「操作电脑」后再试", "The screenshot failed. Turn on \"Use the computer\" in Settings and try again"));
    } finally {
      setVerifying(false);
    }
  };

  return (
    <div style={containerStyle} role="note" aria-label={p("本次任务总结", "Summary of this task")}>
      <div style={lineStyle}>
        <span style={leadStyle}>{p("✓ 刚才", "✓ Just now")}</span>
        <span style={textStyle}>{summary.what}</span>
      </div>
      {summary.next && (
        <div style={lineStyle}>
          <span style={leadStyle}>{p("→ 下一步", "→ Next")}</span>
          <span style={textStyle}>{summary.next}</span>
        </div>
      )}
      {canVerify && (
        <div style={{ display: "flex", gap: 6, marginTop: 4, flexWrap: "wrap" }}>
          <button
            onClick={onVerify}
            disabled={verifying}
            style={{
              ...verifyBtnStyle,
              opacity: verifying ? 0.6 : 1,
              cursor: verifying ? "wait" : "pointer",
            }}
            data-testid="turn-summary-verify"
          >
            {verifying ? p("正在抓取屏幕…", "Capturing the screen…") : p("📸 看一下当前屏幕", "📸 Look at the screen now")}
          </button>
          {verifyError && (
            <span style={{ fontSize: 11, color: "var(--danger)", alignSelf: "center" }}>
              {verifyError}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

interface BuiltSummary {
  what: string;
  next?: string;
}

function buildSummary(message: ChatMessage, workspaceChanges: GitFileChange[], p: Pick): BuiltSummary | null {
  if (message.role !== "assistant") return null;
  if (message.streaming) return null;
  // A failed turn already says what happened and offers 重试 in its own bubble (chatFailureCopy.ts); a second
  // summary under it repeated that and pointed at a Continue button that is not there (T7 r1, 10-16).
  if (message.error) return null;
  const text = message.content || "";
  const len = text.trim().length;
  if (len === 0) return null;

  // Tool calls — extracted from `[Tool Done] X` markers in the message text
  // (MessageBubble strips them during render, but they're still in content).
  const toolDone = Array.from(text.matchAll(/\[Tool Done\]\s*([^\n]+)/g)).map((m) => m[1].trim());
  const toolErr  = Array.from(text.matchAll(/\[Tool Error\]\s*([^\n:]+)/g)).map((m) => m[1].trim());

  // Bucket tools into user-friendly verbs.
  const buckets = {
    files: 0,
    commands: 0,
    screenshots: 0,
    git: 0,
    browser: 0,
    other: 0,
  };
  for (const t of toolDone) {
    if (/write_file|delete_workspace_file/.test(t)) buckets.files++;
    else if (/run_command/.test(t)) buckets.commands++;
    else if (/screenshot/.test(t)) buckets.screenshots++;
    else if (/^git_|git_status|git_diff|git_commit|git_push/.test(t)) buckets.git++;
    else if (/browser/.test(t)) buckets.browser++;
    else if (/read_file|list_directory|search/.test(t)) { /* listed below */ }
    else buckets.other++;
  }

  const parts: string[] = [];
  const n = (count: number, one: string, many: string) => (count === 1 ? one : many);
  if (workspaceChanges.length > 0) {
    parts.push(p(`改了 ${workspaceChanges.length} 个文件`, `changed ${workspaceChanges.length} ${n(workspaceChanges.length, "file", "files")}`));
  } else if (buckets.files > 0) {
    parts.push(p(`保存/写入 ${buckets.files} 处`, `saved/wrote ${buckets.files} ${n(buckets.files, "place", "places")}`));
  }
  if (buckets.commands > 0) parts.push(p(`运行了 ${buckets.commands} 条命令`, `ran ${buckets.commands} ${n(buckets.commands, "command", "commands")}`));
  if (buckets.git > 0) parts.push(p(`做了 ${buckets.git} 次 Git 操作`, `did ${buckets.git} Git ${n(buckets.git, "operation", "operations")}`));
  if (buckets.screenshots > 0) parts.push(p(`抓了 ${buckets.screenshots} 张截图`, `took ${buckets.screenshots} ${n(buckets.screenshots, "screenshot", "screenshots")}`));
  if (buckets.browser > 0) parts.push(p(`操作了浏览器 ${buckets.browser} 次`, `used the browser ${buckets.browser} ${n(buckets.browser, "time", "times")}`));

  if (parts.length === 0) {
    // Pure-text answer. Use the first heading / bullet as a one-line summary.
    const first = firstNonTrivialLine(text);
    if (first) {
      return {
        what: truncate(first, 70),
        next: suggestNextStep(buckets, workspaceChanges, p),
      };
    }
    return null;
  }

  return {
    what: parts.join(p("、", ", ")),
    next: suggestNextStep(buckets, workspaceChanges, p, toolErr),
  };
}

function firstNonTrivialLine(text: string): string | null {
  const lines = text.split("\n").map((l) => l.replace(/^[#>\-*\s\d.]+/, "").trim()).filter(Boolean);
  return lines[0] || null;
}

function suggestNextStep(
  buckets: { files: number; commands: number; screenshots: number; git: number; browser: number; other: number },
  changes: GitFileChange[],
  p: Pick,
  errors: string[] = [],
): string | undefined {
  if (errors.length > 0) {
    return p(`有 ${errors.length} 个步骤失败,看一下细节再决定怎么继续`, `${errors.length} ${errors.length === 1 ? "step" : "steps"} failed; check the details before deciding how to continue`);
  }
  if (changes.length > 0) {
    return p("去 Workbench 看一下改动,确认或者撤销", "Open the Workbench to review the changes, then confirm or undo them");
  }
  if (buckets.commands > 0) {
    return p("看一下命令的输出有没有意外", "Check the command output for anything unexpected");
  }
  if (buckets.git > 0) {
    return p("如果改动 OK,可以让 agent 提交并推送", "If the changes look right, ask the agent to commit and push");
  }
  return undefined;
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max - 1) + "…";
}

// ── Styles ─────────────────────────────────────────────────────────────────

const containerStyle: CSSProperties = {
  marginTop: 8,
  padding: "8px 12px",
  borderRadius: 10,
  border: "1px solid var(--border)",
  background: "var(--bg-overlay-light)",
  display: "flex",
  flexDirection: "column",
  gap: 4,
};

const lineStyle: CSSProperties = {
  display: "flex",
  gap: 8,
  alignItems: "baseline",
  fontSize: 12,
  lineHeight: 1.4,
};

const leadStyle: CSSProperties = {
  flexShrink: 0,
  fontWeight: 700,
  color: "var(--accent-eyebrow)",
  fontSize: 11,
  letterSpacing: 0.3,
};

const textStyle: CSSProperties = {
  color: "var(--text)",
  flex: 1,
  minWidth: 0,
};

const verifyBtnStyle: CSSProperties = {
  border: "1px solid var(--border)",
  background: "var(--bg-card)",
  color: "var(--text)",
  borderRadius: 999,
  padding: "4px 12px",
  fontSize: 11,
  fontWeight: 600,
};
