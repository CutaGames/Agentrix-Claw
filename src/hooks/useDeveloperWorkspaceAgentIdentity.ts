import React from "react";
import { useQuery } from "@tanstack/react-query";
import {
  fetchOwnerAgentAccounts,
  resolveDeveloperWorkspaceAgentIdentity,
  type DeveloperWorkspaceAgentIdentity,
} from "../services/developerWorkspaceAgentIdentity";
import { useAuthStore } from "../stores/authStore";

export type DeveloperWorkspaceAgentIdentityState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready"; identity: DeveloperWorkspaceAgentIdentity }
  | { status: "unresolved"; reason: string }
  | { status: "error"; reason: string };

/**
 * Maps Mobile's `agentAccountId` (uuid) to the DRW-facing `agentUniqueId`
 * through the owner's `GET /agent-accounts` directory. `enabled: false` (flag
 * off, unauthenticated, offline, fixture) keeps the hook idle so those read
 * states never wait on a directory round-trip.
 */
export function useDeveloperWorkspaceAgentIdentity(
  agentAccountId: string | undefined,
  enabled: boolean,
): DeveloperWorkspaceAgentIdentityState {
  const userId = useAuthStore((state) => state.user?.id);
  const active = enabled && typeof agentAccountId === "string" && agentAccountId.length > 0;
  const query = useQuery({
    queryKey: ["mobile-v7", "developer-workspace", "owner-agent-accounts", userId ?? "guest"],
    queryFn: fetchOwnerAgentAccounts,
    enabled: active,
    retry: 0,
    staleTime: 60_000,
  });

  return React.useMemo<DeveloperWorkspaceAgentIdentityState>(() => {
    if (!active) return { status: "idle" };
    if (query.isError) {
      return { status: "error", reason: "owner_agent_directory_unavailable" };
    }
    if (!query.data) return { status: "loading" };
    const resolved = resolveDeveloperWorkspaceAgentIdentity(agentAccountId, query.data);
    // `=== true` on purpose: the app tsconfig is strict:false, so a bare
    // truthiness check does not narrow the result union (see memory gotcha).
    if (resolved.ok === true) {
      return { status: "ready", identity: resolved.identity };
    }
    return { status: "unresolved", reason: resolved.reason };
  }, [active, agentAccountId, query.data, query.isError]);
}
