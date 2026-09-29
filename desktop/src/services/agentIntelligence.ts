/**
 * Agent Intelligence Service — Desktop client for P4/P5 APIs
 * Provides: Plan Mode, Session Resume, Memory management, Subtasks, Teams
 */
import { API_BASE } from "./store";
import { fetch as tauriFetch } from "@tauri-apps/plugin-http";

async function apiFetch(token: string, path: string, options?: RequestInit) {
  const res = await tauriFetch(`${API_BASE}/agent-intelligence${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...(options?.headers || {}),
    },
  });
  if (!res.ok) throw new Error(`API ${res.status}: ${await res.text()}`);
  return res.json();
}

// ── Plan Mode ──────────────────────────────────────────────

export interface PlanStep {
  id: string;
  description: string;
  toolName?: string;
  status: "pending" | "running" | "done" | "failed" | "skipped";
  result?: string;
  error?: string;
}

export interface AgentPlan {
  id: string;
  sessionId: string;
  goal: string;
  reasoning: string;
  steps: PlanStep[];
  status: string;
  currentStepIndex: number;
  createdAt: string;
  updatedAt: string;
}

export async function getActivePlan(token: string, sessionId: string): Promise<AgentPlan | null> {
  const data = await apiFetch(token, `/plan/${sessionId}`);
  return data.plan || null;
}

export async function approvePlan(token: string, sessionId: string): Promise<AgentPlan | null> {
  const data = await apiFetch(token, `/plan/${sessionId}/approve`, { method: "POST" });
  return data.plan || null;
}

export async function rejectPlan(token: string, sessionId: string, feedback?: string): Promise<AgentPlan | null> {
  const data = await apiFetch(token, `/plan/${sessionId}/reject`, {
    method: "POST",
    body: JSON.stringify({ feedback }),
  });
  return data.plan || null;
}

// ── Session Resume ─────────────────────────────────────────

export interface SessionListItem {
  id: string;
  sessionId: string;
  title: string;
  status: string;
  messageCount: number;
  lastMessageAt: string;
  createdAt: string;
}

export async function listServerSessions(
  token: string,
  options?: { search?: string; limit?: number; offset?: number },
): Promise<{ sessions: SessionListItem[]; total: number }> {
  const params = new URLSearchParams();
  if (options?.search) params.set("search", options.search);
  if (options?.limit) params.set("limit", String(options.limit));
  if (options?.offset) params.set("offset", String(options.offset));
  const qs = params.toString();
  return apiFetch(token, `/sessions${qs ? `?${qs}` : ""}`);
}

export async function resumeSession(token: string, sessionId: string) {
  return apiFetch(token, `/sessions/${sessionId}/resume`);
}

export async function archiveSession(token: string, sessionId: string) {
  return apiFetch(token, `/sessions/${sessionId}/archive`, { method: "POST" });
}

export async function deleteServerSession(token: string, sessionId: string) {
  return apiFetch(token, `/sessions/${sessionId}`, { method: "DELETE" });
}

export async function getContextUsage(token: string, sessionId: string) {
  return apiFetch(token, `/sessions/${sessionId}/context-usage`);
}

// ── Memory ─────────────────────────────────────────────────

export interface AgentMemoryItem {
  id: string;
  key: string;
  value: any;
  type: string;
  scope: string;
  updatedAt: string;
}

export async function listMemories(
  token: string,
  agentId?: string,
  scope?: string,
): Promise<AgentMemoryItem[]> {
  const params = new URLSearchParams();
  if (agentId) params.set("agentId", agentId);
  if (scope) params.set("scope", scope);
  const qs = params.toString();
  return apiFetch(token, `/memories${qs ? `?${qs}` : ""}`);
}

export async function deleteMemory(token: string, memoryId: string) {
  return apiFetch(token, `/memories/${memoryId}`, { method: "DELETE" });
}

// ── Subtasks ───────────────────────────────────────────────

export interface Subtask {
  id: string;
  title: string;
  description: string;
  status: string;
  childSessionId: string;
  result?: string;
}

export async function listSubtasks(token: string, parentSessionId: string): Promise<Subtask[]> {
  return apiFetch(token, `/subtasks/${parentSessionId}`);
}

// ── Teams ──────────────────────────────────────────────────

export async function getTeam(token: string, parentSessionId: string) {
  return apiFetch(token, `/teams/${parentSessionId}`);
}
