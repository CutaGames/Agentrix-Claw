import { apiFetch } from "./api";

/**
 * Two agent identifiers meet on the Work face (M2 slice A, board §0.35):
 *
 * - Mobile's stable relation is `SoulCoreRefV1.agentAccountId` — the
 *   `agent_accounts.id` uuid. It is what the directory, the Work routes and
 *   the transport's `agentAccountId` query carry.
 * - The DRW projections (`machine.agentId`, `session.agentId`, …) and the
 *   `x-agent-id` hint carry `agentUniqueId` (`AGT-…`). The DRW client layer
 *   filters and scopes records by that value, so handing it the uuid would
 *   silently drop every record (`filterAgent`) or fail the route match.
 *
 * The owner's `GET /agent-accounts` list is the only place Mobile can read
 * both for the same agent, so the mapping is resolved from it and nothing is
 * derived or guessed client-side.
 */

export const OWNER_AGENT_ACCOUNTS_PATH = "/agent-accounts";

export type OwnerAgentAccountRow = {
  id: string;
  agentUniqueId?: string;
};

export type DeveloperWorkspaceAgentIdentity = {
  agentAccountId: string;
  agentUniqueId: string;
};

export type DeveloperWorkspaceAgentIdentityReason =
  | "agent_account_required"
  | "agent_not_in_owner_directory"
  | "agent_unique_id_missing";

export type DeveloperWorkspaceAgentIdentityResolution =
  | { ok: true; identity: DeveloperWorkspaceAgentIdentity }
  | { ok: false; reason: DeveloperWorkspaceAgentIdentityReason };

/** Accepts the `{ success, data: [...] }` envelope or a bare array. */
export function normalizeOwnerAgentAccounts(payload: unknown): OwnerAgentAccountRow[] {
  const rows = Array.isArray(payload)
    ? payload
    : payload && typeof payload === "object" && Array.isArray((payload as { data?: unknown }).data)
      ? ((payload as { data: unknown[] }).data)
      : [];
  const out: OwnerAgentAccountRow[] = [];
  for (const row of rows) {
    if (!row || typeof row !== "object") continue;
    const record = row as { id?: unknown; agentUniqueId?: unknown };
    if (typeof record.id !== "string" || record.id.length === 0) continue;
    out.push({
      id: record.id,
      agentUniqueId:
        typeof record.agentUniqueId === "string" && record.agentUniqueId.length > 0
          ? record.agentUniqueId
          : undefined,
    });
  }
  return out;
}

export function resolveDeveloperWorkspaceAgentIdentity(
  agentAccountId: string | undefined,
  rows: readonly OwnerAgentAccountRow[],
): DeveloperWorkspaceAgentIdentityResolution {
  if (typeof agentAccountId !== "string" || agentAccountId.trim().length === 0) {
    return { ok: false, reason: "agent_account_required" };
  }
  const row = rows.find((candidate) => candidate.id === agentAccountId);
  if (!row) return { ok: false, reason: "agent_not_in_owner_directory" };
  if (!row.agentUniqueId) return { ok: false, reason: "agent_unique_id_missing" };
  return {
    ok: true,
    identity: { agentAccountId, agentUniqueId: row.agentUniqueId },
  };
}

export async function fetchOwnerAgentAccounts(): Promise<OwnerAgentAccountRow[]> {
  const response = await apiFetch<unknown>(OWNER_AGENT_ACCOUNTS_PATH);
  return normalizeOwnerAgentAccounts(response);
}
