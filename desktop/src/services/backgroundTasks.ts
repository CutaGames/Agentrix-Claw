// Sprint Pre-launch P-4 (2026-05-23) — Background tasks: backend wiring.
//
// P-3 shipped a localStorage-only stub. This sprint connects the desktop
// client to the existing `agent-task` backend module:
//
//   POST   /api/agent-tasks            -> create (status=queued)
//   GET    /api/agent-tasks            -> list user's recent tasks
//   GET    /api/agent-tasks/:id        -> single task snapshot
//   GET    /api/agent-tasks/:id/log    -> log entries for streaming UI
//   POST   /api/agent-tasks/:id/cancel -> mark canceled
//
// `AgentTaskWorker` (backend/src/modules/agent-task/agent-task.worker.ts)
// drains the queue every 5 s, claims rows via FOR UPDATE SKIP LOCKED, runs
// the prompt against Bedrock, and writes status/output logs. Closing the
// desktop does NOT abort the task — it keeps running on the server. When
// the desktop reopens (or any other device polls /agent-tasks), the user
// sees the result.
//
// Local mirror: we keep a thin localStorage cache so the UI has data on
// first paint before the network round-trip lands. Server is the source
// of truth on every refresh.

import { API_BASE, apiFetch } from "./store";

export type BackgroundTaskStatus =
  | "pending"
  | "queued"
  | "running"
  | "succeeded"
  | "failed"
  | "canceled"
  | "done"
  | "cancelled";

export interface BackgroundTask {
  id: string;
  description: string;
  sessionId?: string;
  instanceId?: string;
  status: BackgroundTaskStatus;
  submittedAt: number;
  finishedAt?: number;
  progressMessage?: string;
  resultPreview?: string;
  costUsd?: number;
}

export interface BackgroundTaskLog {
  id: string;
  taskId: string;
  kind: string;
  message: string;
  payload: Record<string, unknown> | null;
  createdAt: number;
}

const LS_KEY = "agentrix_background_tasks_v2";

// ── Local cache (offline-friendly, written-through on every fetch) ──────────

function readCache(): BackgroundTask[] {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return [];
    const list = JSON.parse(raw);
    return Array.isArray(list) ? (list as BackgroundTask[]) : [];
  } catch { return []; }
}

function writeCache(tasks: BackgroundTask[]) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(tasks.slice(-50)));
  } catch { /* ignore */ }
}

function broadcast() {
  try {
    window.dispatchEvent(new CustomEvent("agentrix:background-tasks-updated"));
  } catch { /* ignore */ }
}

// ── Server <-> client mapping ───────────────────────────────────────────────

interface ServerTask {
  id: string;
  userId: string;
  agentId: string | null;
  instanceId: string | null;
  title: string;
  prompt: string;
  status: BackgroundTaskStatus;
  progress: number;
  tier: string | null;
  costUsd: number;
  resultSummary: string | null;
  errorMessage: string | null;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

function toClientTask(srv: ServerTask): BackgroundTask {
  return {
    id: srv.id,
    description: srv.title,
    instanceId: srv.instanceId || undefined,
    status: srv.status,
    submittedAt: new Date(srv.createdAt).getTime(),
    finishedAt: srv.completedAt ? new Date(srv.completedAt).getTime() : undefined,
    progressMessage: progressMessageFor(srv),
    resultPreview: srv.resultSummary || srv.errorMessage || undefined,
    costUsd: srv.costUsd,
  };
}

function progressMessageFor(srv: ServerTask): string | undefined {
  if (srv.status === "queued" || srv.status === "pending") return "已接收,稍后会自己跑";
  if (srv.status === "running") {
    if (srv.progress >= 0) return `运行中 · ${srv.progress}%`;
    return "Agent 正在干活";
  }
  if (srv.status === "succeeded" || srv.status === "done") return "已完成";
  if (srv.status === "failed") return srv.errorMessage || "执行失败";
  if (srv.status === "canceled" || srv.status === "cancelled") return "已取消";
  return undefined;
}

// ── Public API ──────────────────────────────────────────────────────────────

export function listBackgroundTasksCached(): BackgroundTask[] {
  return readCache().sort((a, b) => b.submittedAt - a.submittedAt);
}

export function getRunningTasksCached(): BackgroundTask[] {
  const open = (s: BackgroundTaskStatus) =>
    s === "queued" || s === "pending" || s === "running";
  return listBackgroundTasksCached().filter((t) => open(t.status));
}

export async function refreshBackgroundTasks(token: string): Promise<BackgroundTask[]> {
  const res = await apiFetch(`${API_BASE}/agent-tasks?limit=50`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    return listBackgroundTasksCached();
  }
  const list = (await res.json()) as ServerTask[];
  const mapped = list.map(toClientTask);
  writeCache(mapped);
  broadcast();
  return mapped;
}

export async function fetchBackgroundTask(token: string, id: string): Promise<BackgroundTask | null> {
  const res = await apiFetch(`${API_BASE}/agent-tasks/${encodeURIComponent(id)}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) return null;
  const data = (await res.json()) as ServerTask | null;
  return data ? toClientTask(data) : null;
}

export async function fetchBackgroundTaskLogs(token: string, id: string): Promise<BackgroundTaskLog[]> {
  const res = await apiFetch(`${API_BASE}/agent-tasks/${encodeURIComponent(id)}/log?limit=200`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) return [];
  const list = (await res.json()) as Array<{
    id: string;
    taskId: string;
    kind: string;
    message: string;
    payload: Record<string, unknown> | null;
    createdAt: string;
  }>;
  return list.map((l) => ({
    id: l.id,
    taskId: l.taskId,
    kind: l.kind,
    message: l.message,
    payload: l.payload,
    createdAt: new Date(l.createdAt).getTime(),
  }));
}

export interface SubmitBackgroundTurnArgs {
  token: string;
  sessionId?: string;
  instanceId?: string;
  agentId?: string;
  prompt: string;
  /** Short title for listings. Derived from prompt if not given. */
  title?: string;
  tier?: string;
}

export async function submitBackgroundTurn(args: SubmitBackgroundTurnArgs): Promise<BackgroundTask | null> {
  const title = args.title || args.prompt.slice(0, 80);
  const res = await apiFetch(`${API_BASE}/agent-tasks`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${args.token}`,
    },
    body: JSON.stringify({
      title,
      prompt: args.prompt,
      agentId: args.agentId,
      instanceId: args.instanceId,
      tier: args.tier,
    }),
  });
  if (!res.ok) {
    return null;
  }
  const data = (await res.json()) as ServerTask;
  const task = toClientTask(data);
  // Optimistic: stick into local cache so banner appears immediately.
  const cur = readCache();
  writeCache([...cur.filter((t) => t.id !== task.id), task]);
  broadcast();
  return task;
}

export async function cancelBackgroundTask(token: string, id: string): Promise<void> {
  await apiFetch(`${API_BASE}/agent-tasks/${encodeURIComponent(id)}/cancel`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
  });
  const cur = readCache();
  const next = cur.map((t) => t.id === id ? { ...t, status: "canceled" as BackgroundTaskStatus, finishedAt: Date.now() } : t);
  writeCache(next);
  broadcast();
}

// ── Polling subscription helper (used by BackgroundTasksBanner) ─────────────

/**
 * Start a periodic refresh of the user's background tasks. Returns a
 * teardown function. The interval is 6 s while at least one task is
 * pending/running, and 30 s otherwise — keeps server load bounded but
 * still feels responsive when users are watching for completion.
 */
export function subscribeBackgroundTasks(token: string): () => void {
  let timer: number | null = null;
  let stopped = false;

  const tick = async () => {
    if (stopped) return;
    try {
      const list = await refreshBackgroundTasks(token);
      const hasOpen = list.some((t) => t.status === "queued" || t.status === "pending" || t.status === "running");
      const intervalMs = hasOpen ? 6_000 : 30_000;
      if (!stopped) timer = window.setTimeout(tick, intervalMs);
    } catch {
      if (!stopped) timer = window.setTimeout(tick, 30_000);
    }
  };
  tick();

  return () => {
    stopped = true;
    if (timer != null) {
      window.clearTimeout(timer);
      timer = null;
    }
  };
}

// ── Backwards-compat (P-3 stub) shims ───────────────────────────────────────
// Some P-3 callers used these names; keep them exported as aliases so we
// don't break existing imports.
export const listBackgroundTasks = listBackgroundTasksCached;
export const getRunningTasks = getRunningTasksCached;

export function upsertBackgroundTask(task: BackgroundTask) {
  const tasks = readCache();
  const i = tasks.findIndex((t) => t.id === task.id);
  if (i >= 0) tasks[i] = task; else tasks.push(task);
  writeCache(tasks);
  broadcast();
}

export function markBackgroundTaskDone(id: string, resultPreview?: string) {
  const tasks = readCache();
  const i = tasks.findIndex((t) => t.id === id);
  if (i < 0) return;
  tasks[i] = { ...tasks[i], status: "succeeded", finishedAt: Date.now(), resultPreview };
  writeCache(tasks);
  broadcast();
}

export function markBackgroundTaskFailed(id: string, error?: string) {
  const tasks = readCache();
  const i = tasks.findIndex((t) => t.id === id);
  if (i < 0) return;
  tasks[i] = { ...tasks[i], status: "failed", finishedAt: Date.now(), resultPreview: error };
  writeCache(tasks);
  broadcast();
}
