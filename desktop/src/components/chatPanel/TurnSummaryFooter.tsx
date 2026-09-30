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

interface Props {
  message: ChatMessage;
  workspaceChanges: GitFileChange[];
}

export default function TurnSummaryFooter({ message, workspaceChanges }: Props) {
  const summary = useMemo(() => buildSummary(message, workspaceChanges), [message, workspaceChanges]);
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
      setVerifyError(err?.message || "截图失败,可在 Settings 启用 Computer Use 后再试");
    } finally {
      setVerifying(false);
    }
  };

  return (
    <div style={containerStyle} role="note" aria-label="本次任务总结">
      <div style={lineStyle}>
        <span style={leadStyle}>✓ 刚才</span>
        <span style={textStyle}>{summary.what}</span>
      </div>
      {summary.next && (
        <div style={lineStyle}>
          <span style={leadStyle}>→ 下一步</span>
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
            {verifying ? "正在抓取屏幕…" : "📸 看一下当前屏幕"}
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

function buildSummary(message: ChatMessage, workspaceChanges: GitFileChange[]): BuiltSummary | null {
  if (message.role !== "assistant") return null;
  if (message.streaming) return null;
  if (message.error) {
    return {
      what: "执行没有顺利完成,看上面的错误信息",
      next: "可以点 Continue 重试,或者改一下问法再试一次",
    };
  }
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
  if (workspaceChanges.length > 0) {
    parts.push(`改了 ${workspaceChanges.length} 个文件`);
  } else if (buckets.files > 0) {
    parts.push(`保存/写入 ${buckets.files} 处`);
  }
  if (buckets.commands > 0) parts.push(`运行了 ${buckets.commands} 条命令`);
  if (buckets.git > 0) parts.push(`做了 ${buckets.git} 次 Git 操作`);
  if (buckets.screenshots > 0) parts.push(`抓了 ${buckets.screenshots} 张截图`);
  if (buckets.browser > 0) parts.push(`操作了浏览器 ${buckets.browser} 次`);

  if (parts.length === 0) {
    // Pure-text answer. Use the first heading / bullet as a one-line summary.
    const first = firstNonTrivialLine(text);
    if (first) {
      return {
        what: truncate(first, 70),
        next: suggestNextStep(buckets, workspaceChanges),
      };
    }
    return null;
  }

  return {
    what: parts.join("、"),
    next: suggestNextStep(buckets, workspaceChanges, toolErr),
  };
}

function firstNonTrivialLine(text: string): string | null {
  const lines = text.split("\n").map((l) => l.replace(/^[#>\-*\s\d.]+/, "").trim()).filter(Boolean);
  return lines[0] || null;
}

function suggestNextStep(
  buckets: { files: number; commands: number; screenshots: number; git: number; browser: number; other: number },
  changes: GitFileChange[],
  errors: string[] = [],
): string | undefined {
  if (errors.length > 0) {
    return `有 ${errors.length} 个步骤失败,看一下细节再决定怎么继续`;
  }
  if (changes.length > 0) {
    return "去 Workbench 看一下改动,确认或者撤销";
  }
  if (buckets.commands > 0) {
    return "看一下命令的输出有没有意外";
  }
  if (buckets.git > 0) {
    return "如果改动 OK,可以让 agent 提交并推送";
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
