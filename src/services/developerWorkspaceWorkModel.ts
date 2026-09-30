import {
  buildDeveloperWorkspaceSnapshot,
  createDeveloperWorkspaceFeatureDisabledSnapshot,
  createDeveloperWorkspaceUnpublishedApiSnapshot,
  type DeveloperWorkspaceSnapshot,
} from "./developerWorkspaceClient";
import { parseDeveloperWorkspaceOpenRoute } from "./developerWorkspaceOpenRoute";
import type { DeveloperWorkspaceReadState } from "./developerWorkspaceReadState";
import type { MobileAgentContextResolution } from "./mobileV6AgentContext";

export type DeveloperWorkHomeModel = {
  snapshot: DeveloperWorkspaceSnapshot;
  today: DeveloperWorkspaceReadState;
  next: DeveloperWorkspaceReadState;
  machines: DeveloperWorkspaceReadState;
  sessions: DeveloperWorkspaceReadState;
  approvals: DeveloperWorkspaceReadState;
  diffTestResult: DeveloperWorkspaceReadState;
  receipt: DeveloperWorkspaceReadState;
  openRoute: ReturnType<typeof parseDeveloperWorkspaceOpenRoute>;
};

export type WorkSurfaceAgentResolution =
  | { ok: true; agentId: string; source: "route" | "directory" }
  | {
      ok: false;
      kind: "unavailable" | "unknown" | "unauthorized";
      reason: string;
    };

export function resolveWorkSurfaceAgent(input: {
  routeAgentId?: string | null;
  directoryContext?: MobileAgentContextResolution | null;
}): WorkSurfaceAgentResolution {
  if (
    typeof input.routeAgentId === "string" &&
    input.routeAgentId.trim().length > 0
  ) {
    return { ok: true, agentId: input.routeAgentId, source: "route" };
  }

  const context = input.directoryContext;
  if (!context) {
    return { ok: false, kind: "unknown", reason: "agent_context_unresolved" };
  }
  if (context.kind === "ready") {
    return { ok: true, agentId: context.context.agentId, source: "directory" };
  }
  if (context.kind === "unauthorized") {
    return { ok: false, kind: "unauthorized", reason: context.reason };
  }
  if (context.kind === "ambiguous") {
    return { ok: false, kind: "unknown", reason: context.reason };
  }
  if (
    context.kind === "missing" ||
    context.kind === "unavailable" ||
    context.kind === "stale"
  ) {
    return { ok: false, kind: "unavailable", reason: context.reason };
  }
  return { ok: false, kind: "unknown", reason: "agent_context_unresolved" };
}

function isUnresolvedWorkAgent(
  resolution: WorkSurfaceAgentResolution,
): resolution is Extract<WorkSurfaceAgentResolution, { ok: false }> {
  return resolution.ok === false;
}

function unresolvedAgentSnapshot(
  resolution: Extract<WorkSurfaceAgentResolution, { ok: false }>,
): DeveloperWorkspaceSnapshot {
  const base = createDeveloperWorkspaceFeatureDisabledSnapshot();
  const state =
    resolution.kind === "unknown"
      ? { kind: "unknown" as const, reason: resolution.reason }
      : resolution.kind === "unauthorized"
        ? { kind: "unauthorized" as const, reason: resolution.reason }
        : {
            kind: "unavailable" as const,
            capability: "developer.agent_scope_v1",
            reason: resolution.reason,
          };
  return {
    ...base,
    meta: { ...base.meta, agentId: "" },
    routeAgentId: "",
    machines: state,
    sessions: state,
    approvals: state,
    receipts: state,
    today: state,
    next: state,
    diffTestResult: state,
  };
}

export function buildDeveloperWorkHomeModel(input: {
  agentId?: string;
  routeAgentId?: string | null;
  directoryContext?: MobileAgentContextResolution | null;
  openRoute?: unknown;
  snapshot?: DeveloperWorkspaceSnapshot;
  online?: boolean;
  authenticated?: boolean;
  flagEnabled?: boolean;
  mode?: "fixture" | "api";
  liveStatus?: "idle" | "loading" | "ready";
}): DeveloperWorkHomeModel {
  const resolved = resolveWorkSurfaceAgent({
    routeAgentId: input.routeAgentId ?? input.agentId,
    directoryContext: input.directoryContext,
  });
  const agentId = resolved.ok ? resolved.agentId : undefined;
  const openRoute = parseDeveloperWorkspaceOpenRoute(
    input.openRoute ?? (agentId ? { agentId } : {}),
  );

  let snapshot: DeveloperWorkspaceSnapshot;
  if (input.snapshot) {
    snapshot = input.snapshot;
  } else if (isUnresolvedWorkAgent(resolved)) {
    snapshot = unresolvedAgentSnapshot(resolved);
  } else if (input.flagEnabled !== true) {
    snapshot = createDeveloperWorkspaceFeatureDisabledSnapshot(agentId);
  } else if (input.mode === "fixture") {
    snapshot = buildDeveloperWorkspaceSnapshot({
      agentId,
      online: input.online,
      authenticated: input.authenticated,
    });
  } else if (input.liveStatus === "loading") {
    const loading = createDeveloperWorkspaceUnpublishedApiSnapshot(agentId);
    const unknown = { kind: "unknown" as const, reason: "loading" };
    snapshot = {
      ...loading,
      meta: {
        ...loading.meta,
        source: "api",
        fixture: false,
        defaultOff: false,
      },
      machines: unknown,
      sessions: unknown,
      approvals: unknown,
      receipts: unknown,
    };
  } else {
    snapshot = createDeveloperWorkspaceUnpublishedApiSnapshot(agentId);
  }

  return {
    snapshot,
    today: snapshot.today,
    next: snapshot.next,
    machines: snapshot.machines,
    sessions: snapshot.sessions,
    approvals: snapshot.approvals,
    diffTestResult: snapshot.diffTestResult,
    receipt: snapshot.receipts,
    openRoute,
  };
}

export function workHomeForbidsMutation(
  model: DeveloperWorkHomeModel,
): boolean {
  if (model.snapshot.meta.fixture === true) {
    return (
      model.snapshot.mutation.send.visible === false &&
      model.snapshot.mutation.approve.visible === false &&
      model.snapshot.mutation.published === false &&
      model.today.kind !== "ready" &&
      model.next.kind !== "ready"
    );
  }
  return (
    model.snapshot.mutation.send.enabled !== true &&
    model.snapshot.mutation.approve.enabled !== true
  );
}
