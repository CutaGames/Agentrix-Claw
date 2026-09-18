import React from "react";
import { createDeveloperWorkspaceAuthTransport } from "../services/developerWorkspaceAuth";
import { isDeveloperWorkspaceBuildFlagEnabled } from "../services/developerWorkspaceBuildEnv";
import {
  loadDeveloperWorkspaceSnapshot,
  type DeveloperWorkspaceSnapshot,
} from "../services/developerWorkspaceClient";
import { createDeveloperWorkspaceIdempotencyStore } from "../services/developerWorkspaceControl";
import { developerWorkspaceUnresolvedAgentSnapshot } from "../services/developerWorkspaceWorkModel";
import { useAuthStore } from "../stores/authStore";
import { useDeveloperWorkspaceAgentIdentity } from "./useDeveloperWorkspaceAgentIdentity";

/**
 * `input.agentId` is Mobile's agent relation (`agentAccountId`, uuid). The
 * transport carries it as the backend's `agentAccountId` hint; the DRW client
 * layer is scoped by the matching `agentUniqueId` resolved from the owner
 * directory (`scopeAgentId`). Fixture mode bypasses both and scopes by the
 * route value, exactly as the DRW candidate did.
 */
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
  // Literal `process.env.EXPO_PUBLIC_*` read (inlined by babel-preset-expo);
  // passing `process.env` as an object is never inlined and reads `undefined`
  // in the APK (Claw #524 / Maestro 91).
  const flagEnabled = isDeveloperWorkspaceBuildFlagEnabled();
  const online = input.online !== false;
  const fixture = input.fixture === true;
  const authenticated = isAuthenticated && !isGuest;
  const needsIdentity =
    !fixture && flagEnabled && authenticated && online && !!input.agentId;
  const identity = useDeveloperWorkspaceAgentIdentity(
    needsIdentity ? input.agentId : undefined,
    needsIdentity,
  );
  const scopeAgentId = fixture
    ? input.agentId
    : identity.status === "ready"
      ? identity.identity.agentUniqueId
      : undefined;
  const [snapshot, setSnapshot] =
    React.useState<DeveloperWorkspaceSnapshot | null>(null);
  const [loading, setLoading] = React.useState(true);
  const idempotency = React.useMemo(
    () => createDeveloperWorkspaceIdempotencyStore(),
    [],
  );
  const requestSequence = React.useRef(0);
  const agentAccountId = fixture ? undefined : input.agentId;
  const transport = React.useMemo(
    () =>
      createDeveloperWorkspaceAuthTransport({ token, online, agentAccountId })
        .request,
    [agentAccountId, online, token],
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
    if (needsIdentity) {
      if (identity.status === "idle" || identity.status === "loading") {
        // Directory round-trip still in flight: stay on the loading read state.
        return;
      }
      if (identity.status !== "ready") {
        setSnapshot(
          developerWorkspaceUnresolvedAgentSnapshot(
            identity.status === "error"
              ? { ok: false, kind: "unknown", reason: identity.reason }
              : { ok: false, kind: "unavailable", reason: identity.reason },
          ),
        );
        setLoading(false);
        return;
      }
    }
    const next = await loadDeveloperWorkspaceSnapshot({
      agentId: needsIdentity ? scopeAgentId : input.agentId,
      machineRef: input.machineRef,
      actionRef: input.actionRef,
      flagEnabled,
      authenticated,
      online,
      token,
      mode: fixture ? "fixture" : "api",
      transport: fixture ? undefined : transport,
    });
    if (requestSequence.current !== sequence) return;
    setSnapshot(next);
    setLoading(false);
  }, [
    authenticated,
    fixture,
    flagEnabled,
    identity,
    input.actionRef,
    input.agentId,
    input.machineRef,
    needsIdentity,
    online,
    scopeAgentId,
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
    authenticated,
    idempotency,
    reload,
    /** Transport already carrying the `agentAccountId` hint (api mode). */
    transport,
    /** Value the DRW client layer scopes records by (`agentUniqueId`, or the fixture route id). */
    scopeAgentId,
    /** Mobile's agent relation as passed in (uuid); `undefined` in fixture mode. */
    agentAccountId,
    identity,
  };
}
