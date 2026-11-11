/**
 * agentTeam — thin client wrapping the existing agent-team backend
 * endpoints + the new W1 multi-agent panel reads.
 *
 * Spec: multi-agent-collaboration-2026-06 W1.3
 * Design: §5.2, §5.7
 */
import { API_BASE, apiFetch, useAuthStore } from "./store";

export interface AgentTeamMember {
  id: string;
  agentId: string;
  displayName: string;
  avatarUrl?: string;
  role: string;
  status: "active" | "paused" | "revoked";
  petId?: string | null;
  boundAgentAccountId?: string | null;
  inFlightSubTasks?: number;
  /** Multi-Agent v1 W3 — populated by backend GET; client uses for MemberSettingsModal. */
  dailyBudgetUsd?: number | string;
  /** Multi-Agent v1 W3 — tools / workspace_paths whitelist scope. */
  scope?: Record<string, unknown>;
}

export interface AgentTeamSnapshot {
  team: { id: string; name: string; createdAt: string };
  leader: AgentTeamMember | null;
  members: AgentTeamMember[];
}

export interface AgentTeamTemplate {
  slug: string;
  name: string;
  description?: string;
  iconUrl?: string;
  teamSize: number;
  roles: Array<{
    codename: string;
    name: string;
    description: string;
    avatarUrl?: string;
  }>;
}

function authHeaders(): Record<string, string> {
  const token = useAuthStore.getState().token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function jsonOrNull<T>(res: Response): Promise<T | null> {
  try {
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

/**
 * GET /api/agent-teams/:teamId — existing endpoint that returns
 * the team + leader + members shape used by AgentTeamPanel.
 *
 * Returns null if no team exists for this user.
 */
export async function getAgentTeam(teamId: string): Promise<AgentTeamSnapshot | null> {
  const res = await apiFetch(
    `${API_BASE}/agent-teams/${encodeURIComponent(teamId)}`,
    { headers: authHeaders() },
  );
  return jsonOrNull<AgentTeamSnapshot>(res);
}

/**
 * GET /api/agent-teams/my-teams — list of teams user has provisioned.
 * v1 W1 wraps to a single AgentTeamSnapshot using the first team.
 *
 * R3.6: panel reads this on mount to decide between empty-state and
 * populated view.
 */
export async function getMyAgentTeam(): Promise<AgentTeamSnapshot | null> {
  const res = await apiFetch(`${API_BASE}/agent-teams/my-teams`, {
    headers: authHeaders(),
  });
  if (!res.ok) return null;
  const body = (await res.json().catch(() => null)) as
    | { success?: boolean; data?: any[] }
    | null;
  const teams = body?.data;
  if (!Array.isArray(teams) || teams.length === 0) return null;
  const first = teams[0];
  // Already in snapshot shape?
  if (first?.team && Array.isArray(first?.members)) {
    return first as AgentTeamSnapshot;
  }
  // Legacy shape from `getMyTeams` — synthesize a snapshot.
  if (Array.isArray(first?.agents)) {
    const agents = first.agents as Array<{
      id: string;
      name: string;
      codename: string;
      status: string;
    }>;
    return {
      team: {
        id: first.templateSlug ?? "team",
        name: first.templateName ?? "My Team",
        createdAt: new Date().toISOString(),
      },
      leader: agents[0]
        ? {
            id: agents[0].id,
            agentId: agents[0].id,
            displayName: agents[0].name,
            role: agents[0].codename,
            status: "active",
          }
        : null,
      members: agents.slice(1).map((a) => ({
        id: a.id,
        agentId: a.id,
        displayName: a.name,
        role: a.codename,
        status: "active",
      })),
    };
  }
  return null;
}

/**
 * GET /api/agent-teams/templates — public + official + this user's
 * private templates (R3.6 Provision CTA).
 */
export async function listAgentTeamTemplates(): Promise<AgentTeamTemplate[]> {
  const res = await apiFetch(`${API_BASE}/agent-teams/templates`, {
    headers: authHeaders(),
  });
  const body = await jsonOrNull<{ data?: AgentTeamTemplate[]; templates?: AgentTeamTemplate[] }>(res);
  // Backend returns `{ success, data: [...] }`; tolerate legacy
  // `{ templates: [...] }` shape too.
  return body?.data ?? body?.templates ?? [];
}

/**
 * POST /api/agent-teams/provision — create a new team from a template.
 * R3.7: panel must refresh within 2s after success.
 */
export async function provisionAgentTeam(input: {
  templateSlug: string;
  name?: string;
}): Promise<AgentTeamSnapshot | null> {
  const res = await apiFetch(`${API_BASE}/agent-teams/provision`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify({
      templateSlug: input.templateSlug,
      teamNamePrefix: input.name,
    }),
  });
  if (!res.ok) return null;
  // Backend returns `{ success, data: ProvisionedTeamResult, message }`.
  // Re-shape into AgentTeamSnapshot for the panel; refresh via getMyAgentTeam
  // afterwards is also OK.
  const body = (await res.json().catch(() => null)) as
    | { success?: boolean; data?: any }
    | null;
  const provisioned = body?.data;
  if (!provisioned || !Array.isArray(provisioned.agents)) return null;
  const agents = provisioned.agents as Array<{
    id: string;
    name: string;
    codename: string;
    status: string;
  }>;
  return {
    team: {
      id: input.templateSlug,
      name: provisioned.templateName ?? "My Team",
      createdAt: new Date().toISOString(),
    },
    leader: agents[0]
      ? {
          id: agents[0].id,
          agentId: agents[0].id,
          displayName: agents[0].name,
          role: agents[0].codename,
          status: "active",
        }
      : null,
    members: agents.slice(1).map((a) => ({
      id: a.id,
      agentId: a.id,
      displayName: a.name,
      role: a.codename,
      status: "active",
    })),
  };
}

/**
 * PATCH /api/agent-teams/:teamId/leader — promote a member to leader.
 * R3.4. Triggers `agentrix:leader-changed` event for ChatPanelImpl
 * to reload system prompt + tool list.
 */
export async function promoteToLeader(input: {
  teamId: string;
  agentId: string;
}): Promise<AgentTeamSnapshot | null> {
  const res = await apiFetch(
    `${API_BASE}/agent-teams/${encodeURIComponent(input.teamId)}/leader`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify({ agentId: input.agentId }),
    },
  );
  const result = await jsonOrNull<AgentTeamSnapshot>(res);
  if (result && typeof window !== "undefined") {
    try {
      window.dispatchEvent(
        new CustomEvent("agentrix:leader-changed", {
          detail: { teamId: input.teamId, agentId: input.agentId },
        }),
      );
    } catch {
      /* SSR safety */
    }
  }
  return result;
}

/**
 * POST /api/agent-teams/bind-pets — bind LivingPet → AgentAccount.
 * W3 implementation: each pet gets a dedicated AgentAccount + PetTeamMember
 * row. Returns { bound, skipped, members[] }.
 */
export async function bindLivingPets(input: {
  livingPetIds: string[];
}): Promise<{ bound: number; skipped: number; members: AgentTeamMember[] } | null> {
  const res = await apiFetch(
    `${API_BASE}/agent-teams/bind-pets`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify({ livingPetIds: input.livingPetIds }),
    },
  );
  if (!res.ok) return null;
  const body = (await res.json()) as { data?: { bound: number; skipped: number; members: AgentTeamMember[] } };
  return body.data ?? null;
}

/**
 * POST /api/agent-teams/unbind-pet/:livingPetId — soft-unbind.
 * AgentAccount preserved (revoked status), pet history kept.
 */
export async function unbindLivingPet(livingPetId: string): Promise<boolean> {
  const res = await apiFetch(
    `${API_BASE}/agent-teams/unbind-pet/${encodeURIComponent(livingPetId)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders() },
    },
  );
  return res.ok;
}

/**
 * @deprecated W1 stub. Use `bindLivingPets` (W3) instead.
 */
export async function bindPetsToTeam(input: {
  teamId: string;
  livingPetIds: string[];
}): Promise<AgentTeamSnapshot | null> {
  // Forward to the new W3 endpoint and ignore the teamId.
  await bindLivingPets({ livingPetIds: input.livingPetIds });
  return null;
}
