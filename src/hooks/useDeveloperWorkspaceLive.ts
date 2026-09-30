import React from "react";
import { createDeveloperWorkspaceAuthTransport } from "../services/developerWorkspaceAuth";
import {
  isDeveloperWorkspaceFlagEnabled,
  loadDeveloperWorkspaceSnapshot,
  type DeveloperWorkspaceSnapshot,
} from "../services/developerWorkspaceClient";
import { createDeveloperWorkspaceIdempotencyStore } from "../services/developerWorkspaceControl";
import { useAuthStore } from "../stores/authStore";

export function useDeveloperWorkspaceLive(input: {
  agentId?: string;
  machineRef?: string;
  actionRef?: string;
  fixture?: boolean;
  online?: boolean;
}) {
  const token = useAuthStore((state) => state.token);
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const isGuest = useAuthStore((state) => state.isGuest);
  const flagEnabled = isDeveloperWorkspaceFlagEnabled(
    process.env as Record<string, string | undefined>,
  );
  const online = input.online !== false;
  const fixture = input.fixture === true;
  const [snapshot, setSnapshot] =
    React.useState<DeveloperWorkspaceSnapshot | null>(null);
  const [loading, setLoading] = React.useState(true);
  const idempotency = React.useMemo(
    () => createDeveloperWorkspaceIdempotencyStore(),
    [],
  );
  const requestSequence = React.useRef(0);
  const transport = React.useMemo(
    () => createDeveloperWorkspaceAuthTransport({ token, online }).request,
    [online, token],
  );

  const reload = React.useCallback(async () => {
    const sequence = requestSequence.current + 1;
    requestSequence.current = sequence;
    setLoading(true);
    if (!input.agentId) {
      setSnapshot(null);
      setLoading(false);
      return;
    }
    const next = await loadDeveloperWorkspaceSnapshot({
      agentId: input.agentId,
      machineRef: input.machineRef,
      actionRef: input.actionRef,
      flagEnabled,
      authenticated: isAuthenticated && !isGuest,
      online,
      token,
      mode: fixture ? "fixture" : "api",
      transport: fixture ? undefined : transport,
    });
    if (requestSequence.current !== sequence) return;
    setSnapshot(next);
    setLoading(false);
  }, [
    fixture,
    flagEnabled,
    input.actionRef,
    input.agentId,
    input.machineRef,
    isAuthenticated,
    isGuest,
    online,
    token,
    transport,
  ]);

  React.useEffect(() => {
    void reload();
    return () => {
      requestSequence.current += 1;
    };
  }, [reload]);

  return {
    snapshot,
    loading,
    flagEnabled,
    authenticated: isAuthenticated && !isGuest,
    idempotency,
    reload,
  };
}
