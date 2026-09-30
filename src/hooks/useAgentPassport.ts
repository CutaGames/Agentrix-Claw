import { useQuery } from "@tanstack/react-query";
import {
  AGENT_PASSPORT_CAPABILITY,
  fetchAgentPassportProjection,
  type AgentPassportReadState,
} from "../services/agentPassport";
import { useAuthStore } from "../stores/authStore";

/**
 * Owner projection for one Agent (`GET /agent-accounts/:id/passport`),
 * as a read state. Unauthenticated / no agent → `unauthorized` /
 * `unavailable` without a round-trip; the screen still renders the shared
 * card underneath with every stamp "unconfirmed".
 */
export function useAgentPassport(agentAccountId: string | undefined): {
  state: AgentPassportReadState;
  refetch: () => void;
} {
  const userId = useAuthStore((state) => state.user?.id);
  const token = useAuthStore((state) => state.token);
  const active = Boolean(userId && token) && typeof agentAccountId === "string" && agentAccountId.length > 0;
  const query = useQuery({
    queryKey: ["mobile-v7", "agent-passport", userId ?? "guest", agentAccountId ?? ""],
    queryFn: () => fetchAgentPassportProjection(agentAccountId as string),
    enabled: active,
    retry: 0,
    staleTime: 60_000,
  });

  let state: AgentPassportReadState;
  if (!agentAccountId) {
    state = { kind: "unavailable", capability: AGENT_PASSPORT_CAPABILITY, reason: "agent_account_required" };
  } else if (!active) {
    state = { kind: "unauthorized", reason: "authentication_required" };
  } else if (query.data) {
    state = query.data;
  } else if (query.isError) {
    state = { kind: "error", retryable: true, reason: "query_failed" };
  } else {
    state = { kind: "unknown", reason: "loading" };
  }
  return { state, refetch: () => void query.refetch() };
}
