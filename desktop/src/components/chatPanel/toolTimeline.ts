import type { TaskTimelineEntry, TaskTimelineStatus } from "../TaskTimeline";
import type { TaskWorkbenchEvent } from "../TaskWorkbenchPanel";

export function normalizeToolTimelineKind(toolName: string): string {
  const lower = toolName.toLowerCase();
  if (lower.startsWith("git_")) return lower;
  if (lower.includes("search")) return "search";
  if (lower.includes("read")) return "file_read";
  if (lower.includes("write") || lower.includes("edit")) return "file_write";
  if (lower.includes("command") || lower.includes("terminal")) return "command";
  if (lower.includes("browser") || lower.includes("web")) return "browser";
  return lower || "tool";
}

export function summarizeToolPayload(value: unknown, maxLength = 300): string {
  if (value == null) return "";
  const text = typeof value === "string" ? value : JSON.stringify(value, null, 2);
  return text.length > maxLength ? `${text.slice(0, maxLength)}...` : text;
}

export function buildToolTimelineEntry(args: {
  id: string;
  toolName: string;
  status: TaskTimelineStatus;
  input?: unknown;
  output?: unknown;
  startedAt?: number;
  finishedAt?: number;
  message?: string;
}): TaskTimelineEntry {
  const detail = args.status === "running"
    ? summarizeToolPayload(args.input)
    : summarizeToolPayload(args.output ?? args.message);

  return {
    id: args.id,
    kind: normalizeToolTimelineKind(args.toolName) as any,
    title: args.toolName.replace(/_/g, " "),
    status: args.status,
    riskLevel: "L0",
    startedAt: args.startedAt ?? Date.now(),
    finishedAt: args.finishedAt,
    detail: detail || undefined,
    output: args.output == null ? undefined : summarizeToolPayload(args.output, 1200),
  };
}

export function buildToolWorkbenchEvent(entry: TaskTimelineEntry): TaskWorkbenchEvent {
  return {
    id: `tool-${entry.id}-${entry.status}`,
    title: entry.title,
    detail: entry.detail || entry.output,
    tone: entry.status === "failed" ? "error" : entry.status === "completed" ? "success" : "info",
    createdAt: entry.finishedAt ?? entry.startedAt,
  };
}
