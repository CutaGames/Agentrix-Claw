import {
  buildDeveloperWorkHomeModel,
  resolveWorkSurfaceAgent,
} from "../developerWorkspaceWorkModel";

describe("Developer work surface Agent resolution", () => {
  it("does not guess a fixture Agent when route and directory are missing", () => {
    const resolved = resolveWorkSurfaceAgent({});
    expect(resolved.ok).toBe(false);
    if (resolved.ok === false) {
      expect(resolved.kind).toBe("unknown");
      expect(resolved.reason).toBe("agent_context_unresolved");
    }

    const model = buildDeveloperWorkHomeModel({
      flagEnabled: true,
      mode: "fixture",
      directoryContext: {
        kind: "missing",
        reason: "canonical_primary_missing",
      },
    });
    expect(model.snapshot.machines.kind).toBe("unavailable");
    expect(model.snapshot.machines).toEqual(
      expect.objectContaining({
        kind: "unavailable",
        reason: "canonical_primary_missing",
      }),
    );
    expect(JSON.stringify(model.snapshot)).not.toContain("agent-1");
    expect(model.openRoute.ok).toBe(false);
  });

  it("uses ready directory context and keeps fixture opt-in", () => {
    const model = buildDeveloperWorkHomeModel({
      flagEnabled: true,
      mode: "fixture",
      directoryContext: {
        kind: "ready",
        context: {
          schemaVersion: "mobile-agent-context/v1",
          source: "user_selection",
          agentId: "owner-9",
          soulCoreId: "soul-9",
          scope: {
            queryKey: [
              "mobile-agent-context/v1",
              "agent",
              "owner-9",
              "soul-core",
              "soul-9",
            ],
            composeKey: "mobile-agent-context/v1:owner-9:soul-9",
          },
        },
      },
    });
    expect(model.snapshot.meta.agentId).toBe("owner-9");
    expect(model.snapshot.machines.kind).toBe("ready");
  });

  it("treats ambiguous directory context as unknown instead of fixture agent-1", () => {
    const resolved = resolveWorkSurfaceAgent({
      directoryContext: {
        kind: "ambiguous",
        reason: "multiple_canonical_primary_agents",
        candidateAgentIds: ["agent-a", "agent-b"],
      },
    });
    expect(resolved).toEqual({
      ok: false,
      kind: "unknown",
      reason: "multiple_canonical_primary_agents",
    });
  });

  it("keeps Work snapshots isolated across Agent switches", () => {
    const context = (agentId: string, soulCoreId: string) => ({
      kind: "ready" as const,
      context: {
        schemaVersion: "mobile-agent-context/v1" as const,
        source: "user_selection" as const,
        agentId,
        soulCoreId,
        scope: {
          queryKey: [
            "mobile-agent-context/v1",
            "agent",
            agentId,
            "soul-core",
            soulCoreId,
          ] as const,
          composeKey: `mobile-agent-context/v1:${agentId}:${soulCoreId}`,
        },
      },
    });
    const first = buildDeveloperWorkHomeModel({
      flagEnabled: true,
      mode: "fixture",
      directoryContext: context("agent-a", "soul-a"),
    });
    const second = buildDeveloperWorkHomeModel({
      flagEnabled: true,
      mode: "fixture",
      directoryContext: context("agent-b", "soul-b"),
    });
    expect(first.snapshot.meta.agentId).toBe("agent-a");
    expect(second.snapshot.meta.agentId).toBe("agent-b");
    expect(JSON.stringify(first.snapshot)).not.toContain("agent-b");
    expect(JSON.stringify(second.snapshot)).not.toContain("agent-a");
  });
});
