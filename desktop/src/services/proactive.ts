import type { DesktopContextResult } from "./desktop";
import type { ChatMessage } from "./store";
import type { TaskTimelineEntry } from "../components/TaskTimeline";

export type ProactiveSuggestionKind = "code" | "clipboard" | "browser" | "task" | "general";

export interface ProactiveSuggestion {
  id: string;
  signature: string;
  title: string;
  prompt: string;
  reason: string;
  kind: ProactiveSuggestionKind;
  freshnessLabel: string;
}

export interface WorkflowTemplate {
  id: string;
  title: string;
  prompt: string;
}

interface BuildSuggestionInput {
  context: DesktopContextResult | null;
  timelineEntries: TaskTimelineEntry[];
  messages: ChatMessage[];
  clipboardChangedAt?: number | null;
  contextChangedAt?: number | null;
  now?: number;
}

const ERROR_PATTERN = /(error|failed|exception|traceback|build failed|lint failed|cannot|denied)/i;
const BROWSER_PROCESS = /(chrome|msedge|edge|firefox|arc|safari)/i;
const CODE_PROCESS = /(code|cursor|windsurf|idea|pycharm)/i;

export function buildProactiveSuggestions({
  context,
  timelineEntries,
  messages,
  clipboardChangedAt,
  contextChangedAt,
  now = Date.now(),
}: BuildSuggestionInput): ProactiveSuggestion[] {
  const suggestions: ProactiveSuggestion[] = [];
  const processName = context?.activeWindow?.processName || "";
  const title = context?.activeWindow?.title || "";
  const latestTimeline = [...timelineEntries].reverse().find((entry) => entry.status === "failed" || entry.status === "rejected");
  const latestUserMessage = [...messages].reverse().find((message) => message.role === "user")?.content || "";
  const windowSignature = [processName, title, context?.workspaceHint || "", context?.fileHint || ""].join("|");
  const clipboardSignature = normalizePreview(context?.clipboardTextPreview || "");

  if (latestTimeline && ERROR_PATTERN.test(`${latestTimeline.detail || ""}\n${latestTimeline.output || ""}`)) {
    suggestions.push({
      id: "fix-latest-failure",
      signature: `task:${latestTimeline.id}:${normalizePreview(`${latestTimeline.detail || ""}\n${latestTimeline.output || ""}`)}`,
      title: "Fix latest failure",
      prompt: "Review the latest failed desktop step, explain the root cause, propose the minimal fix, and tell me what to run next.",
      reason: "Recent task output looks like a failure.",
      kind: "task",
      freshnessLabel: formatFreshness(latestTimeline.finishedAt || latestTimeline.startedAt, now),
    });
  }

  if (context?.clipboardTextPreview && context.clipboardTextPreview.trim().length >= 80 && clipboardChangedAt) {
    suggestions.push({
      id: "summarize-clipboard",
      signature: `clipboard:${clipboardSignature}`,
      title: "Summarize clipboard",
      prompt: `I just copied this text:\n\n${context.clipboardTextPreview}\n\nSummarize it and suggest the next action.`,
      reason: "Large clipboard content was detected.",
      kind: "clipboard",
      freshnessLabel: formatFreshness(clipboardChangedAt, now),
    });
  }

  if (CODE_PROCESS.test(processName)) {
    suggestions.push({
      id: "review-workspace",
      signature: `code:${windowSignature}`,
      title: "Review current workspace",
      prompt: "Use the current desktop context to infer my active workspace and file. Give me a focused next-step plan for what I am editing right now.",
      reason: `IDE detected${title ? `: ${title}` : ""}.`,
      kind: "code",
      freshnessLabel: formatFreshness(contextChangedAt, now),
    });
  }

  if (BROWSER_PROCESS.test(processName)) {
    suggestions.push({
      id: "summarize-browser",
      signature: `browser:${windowSignature}`,
      title: "Summarize current page",
      prompt: `I am viewing this browser window: ${title || processName}. Summarize what I am likely reading and draft the next useful action or output.`,
      reason: "Browser activity detected.",
      kind: "browser",
      freshnessLabel: formatFreshness(contextChangedAt, now),
    });
  }

  if (!latestTimeline && latestUserMessage.trim().length === 0 && context?.activeWindow?.title) {
    suggestions.push({
      id: "orient-me",
      signature: `general:${windowSignature}`,
      title: "Help with current context",
      prompt: `Based on my current desktop context (${context.activeWindow.title}), suggest three useful things you can help me do right now.`,
      reason: "No active task is running yet.",
      kind: "general",
      freshnessLabel: formatFreshness(contextChangedAt, now),
    });
  }

  return dedupeBySignature(suggestions).slice(0, 3);
}

export function getWorkflowTemplates(context: DesktopContextResult | null): WorkflowTemplate[] {
  const workspaceHint = context?.workspaceHint || "my current workspace";
  const fileHint = context?.fileHint || "the file I am focused on";

  return [
    {
      id: "template-workspace",
      title: "Inspect Workspace",
      prompt: `Inspect ${workspaceHint}, identify the active problem, and propose the highest-value next action.`,
    },
    {
      id: "template-file",
      title: "Review Current File",
      prompt: `Use desktop context to infer ${fileHint}. Review it and suggest a minimal, production-safe improvement.`,
    },
    {
      id: "template-clipboard",
      title: "Use Clipboard",
      prompt: "Read my clipboard preview, explain what it contains, and help me turn it into a useful output.",
    },
    {
      id: "template-debug",
      title: "Debug Latest Issue",
      prompt: "Look at the latest failed desktop action or active developer context and tell me the root cause, fix, and validation command.",
    },
  ];
}

function dedupeBySignature<T extends { signature: string }>(items: T[]) {
  const seen = new Set<string>();
  return items.filter((item) => {
    if (seen.has(item.signature)) return false;
    seen.add(item.signature);
    return true;
  });
}

function normalizePreview(text: string) {
  return text.replace(/\s+/g, " ").trim().slice(0, 120);
}

function formatFreshness(timestamp: number | null | undefined, now: number) {
  if (!timestamp) return "recent";
  const delta = Math.max(0, now - timestamp);
  if (delta < 15_000) return "just now";
  if (delta < 60_000) return `${Math.round(delta / 1000)}s ago`;
  if (delta < 3_600_000) return `${Math.round(delta / 60_000)}m ago`;
  return "earlier";
}