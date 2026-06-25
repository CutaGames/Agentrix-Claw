/**
 * Plan SSE stream client (P0-#4 Desktop Claw 化).
 *
 * EventSource doesn't support custom headers on Tauri WebView2 reliably, so
 * we use fetch + ReadableStream to parse SSE manually with the Authorization
 * header attached. Subscribers receive parsed JSON events.
 */

import { API_BASE } from "./store";

export interface PlanArtifact {
  id: string;
  kind: "text" | "json" | "url" | "image" | "file" | "table" | "code";
  title: string;
  content?: string;
  url?: string;
  mime?: string;
  bytes?: number;
  createdAtMs: number;
}

export interface PlanStep {
  id: string;
  kind: string;
  description: string;
  args?: Record<string, unknown>;
  status: "pending" | "running" | "done" | "failed" | "skipped";
  result?: string;
  artifacts?: PlanArtifact[];
  error?: string;
  startedAtMs?: number;
  finishedAtMs?: number;
  durationMs?: number;
}

export interface Plan {
  id: string;
  userId: string;
  title: string;
  intent: string;
  steps: PlanStep[];
  approvalId?: string;
  status:
    | "draft"
    | "awaiting_approval"
    | "approved"
    | "denied"
    | "running"
    | "done"
    | "failed";
  createdAt: number;
  startedAt?: number;
  finishedAt?: number;
}

export type PlanEvent =
  | { type: "plan.snapshot"; plan: Plan; at: number }
  | { type: "plan.started"; planId: string; at: number }
  | { type: "plan.step.started"; planId: string; stepId: string; index: number; at: number }
  | { type: "plan.step.progress"; planId: string; stepId: string; message: string; at: number }
  | { type: "plan.step.artifact"; planId: string; stepId: string; artifact: PlanArtifact; at: number }
  | { type: "plan.step.done"; planId: string; stepId: string; result?: string; at: number }
  | { type: "plan.step.failed"; planId: string; stepId: string; error: string; at: number }
  | { type: "plan.done"; planId: string; at: number }
  | { type: "plan.failed"; planId: string; error: string; at: number };

export interface PlanStreamHandle {
  close(): void;
}

export function streamPlan(
  planId: string,
  token: string,
  onEvent: (e: PlanEvent) => void,
  onError?: (err: Error) => void,
): PlanStreamHandle {
  const controller = new AbortController();
  let closed = false;

  const close = () => {
    if (closed) return;
    closed = true;
    controller.abort();
  };

  (async () => {
    try {
      const res = await fetch(`${API_BASE}/v1/plan/${encodeURIComponent(planId)}/stream`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "text/event-stream",
        },
        signal: controller.signal,
      });
      if (!res.ok || !res.body) {
        throw new Error(`SSE stream failed: ${res.status}`);
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      while (!closed) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        // Split SSE frames (separated by blank line)
        let idx;
        while ((idx = buf.indexOf("\n\n")) !== -1) {
          const frame = buf.slice(0, idx);
          buf = buf.slice(idx + 2);
          const dataLines = frame
            .split("\n")
            .filter((l) => l.startsWith("data:"))
            .map((l) => l.slice(5).trimStart());
          if (dataLines.length === 0) continue;
          const json = dataLines.join("\n");
          try {
            const parsed = JSON.parse(json) as PlanEvent;
            onEvent(parsed);
          } catch (e) {
            // ignore malformed frame
          }
        }
      }
    } catch (e: any) {
      if (!closed) onError?.(e instanceof Error ? e : new Error(String(e)));
    }
  })();

  return { close };
}

/** REST helpers for plan-runner. */
export async function fetchPlan(planId: string, token: string): Promise<Plan> {
  const res = await fetch(`${API_BASE}/v1/plan/${encodeURIComponent(planId)}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`fetchPlan failed: ${res.status}`);
  return (await res.json()) as Plan;
}

export interface SubmitPlanInput {
  title: string;
  intent: string;
  steps: Array<{ kind: string; description: string; args?: Record<string, unknown> }>;
  initiator_surface?: "web" | "mobile" | "desktop";
}

export async function submitPlan(input: SubmitPlanInput, token: string): Promise<Plan> {
  const res = await fetch(`${API_BASE}/v1/plan/submit`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ initiator_surface: "desktop", ...input }),
  });
  if (!res.ok) throw new Error(`submitPlan failed: ${res.status} ${await res.text()}`);
  return (await res.json()) as Plan;
}
