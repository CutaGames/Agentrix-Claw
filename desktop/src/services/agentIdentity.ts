/**
 * agentIdentity — fetch + cache AgentAccount info for the
 * AgentIdentityCard component (W1 task 1.4).
 *
 * Spec: multi-agent-collaboration-2026-06 W1.4
 * Design: §5.2 (AgentIdentityCard data needs)
 */
import { API_BASE, apiFetch, useAuthStore } from "./store";

export interface AgentIdentity {
  id: string;
  displayName: string;
  avatarUrl?: string;
  role?: string;
  status?: "active" | "paused" | "revoked";
  /** ISO string when this row was last fetched, used for stale check. */
  fetchedAt?: number;
}

const CACHE_TTL_MS = 60_000;
const cache = new Map<string, AgentIdentity>();

function authHeaders(): Record<string, string> {
  const token = useAuthStore.getState().token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export function getCachedAgentIdentity(agentId: string): AgentIdentity | null {
  return cache.get(agentId) ?? null;
}

/**
 * Fetch agent identity, with a 60s in-memory cache. Returns null on
 * any failure so callers can fall back to placeholder rendering.
 */
export async function fetchAgentIdentity(
  agentId: string,
): Promise<AgentIdentity | null> {
  const cached = cache.get(agentId);
  if (cached && cached.fetchedAt && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    return cached;
  }
  try {
    const res = await apiFetch(
      `${API_BASE}/agent-accounts/${encodeURIComponent(agentId)}`,
      { headers: authHeaders() },
    );
    if (!res.ok) return null;
    const body = (await res.json()) as {
      id: string;
      displayName?: string;
      avatarUrl?: string;
      role?: string;
      status?: AgentIdentity["status"];
      // Extra fields may be present; ignore
    };
    const identity: AgentIdentity = {
      id: body.id,
      displayName: body.displayName ?? agentId.slice(0, 8),
      avatarUrl: body.avatarUrl,
      role: body.role,
      status: body.status,
      fetchedAt: Date.now(),
    };
    cache.set(agentId, identity);
    return identity;
  } catch {
    return null;
  }
}

/** Invalidate a single agent's cache entry. */
export function invalidateAgentIdentity(agentId: string): void {
  cache.delete(agentId);
}
