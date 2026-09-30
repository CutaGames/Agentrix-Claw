import { evaluateDeveloperMutationCta } from "../developerWorkspaceCapability";
import {
  buildDeveloperWorkspaceSnapshot,
  DEVELOPER_WORKSPACE_API_PATHS,
  isDeveloperWorkspaceFlagEnabled,
  loadDeveloperWorkspaceSnapshot,
  snapshotForbidsSuccessPaymentOrApproved,
} from "../developerWorkspaceClient";
import {
  DEVELOPER_WORKSPACE_FIXTURE_WIRE,
  DEVELOPER_WORKSPACE_SUPPORTED_CAPABILITY,
  DEVELOPER_WORKSPACE_UNSUPPORTED_CAPABILITY,
} from "../developerWorkspaceFixtures";
import { DEVELOPER_WORKSPACE_READ_STATES } from "../developerWorkspaceReadState";
import {
  buildDeveloperWorkHomeModel,
  workHomeForbidsMutation,
} from "../developerWorkspaceWorkModel";

describe("Developer workspace typed client", () => {
  it("points at future /v1/developer paths and stays default-off", () => {
    expect(DEVELOPER_WORKSPACE_API_PATHS.machines).toBe(
      "/v1/developer/machines",
    );
    expect(DEVELOPER_WORKSPACE_API_PATHS.approvals).toBe(
      "/v1/developer/approvals",
    );
    expect(isDeveloperWorkspaceFlagEnabled({})).toBe(false);
    expect(
      isDeveloperWorkspaceFlagEnabled({
        EXPO_PUBLIC_DEVELOPER_WORKSPACE_V1_ENABLED: "1",
      }),
    ).toBe(true);
    expect(
      isDeveloperWorkspaceFlagEnabled({
        EXPO_PUBLIC_DEVELOPER_WORKSPACE_V1_ENABLED: "true",
      }),
    ).toBe(false);
    expect(
      isDeveloperWorkspaceFlagEnabled({
        NEXT_PUBLIC_DEVELOPER_WORKSPACE_V1_ENABLED: "1",
      }),
    ).toBe(false);
  });

  it("covers every read-only UI state", () => {
    for (const kind of DEVELOPER_WORKSPACE_READ_STATES) {
      const snapshot = buildDeveloperWorkspaceSnapshot({
        agentId: "agent-1",
        stateOverride: kind,
      });
      expect(snapshot.machines.kind).toBe(kind);
    }
  });

  it("hides Send/Approve until API capability truth and never renders success claims", () => {
    const snapshot = buildDeveloperWorkspaceSnapshot({ agentId: "agent-1" });
    expect(snapshot.mutation.send.visible).toBe(false);
    expect(snapshot.mutation.approve.visible).toBe(false);
    expect(snapshotForbidsSuccessPaymentOrApproved(snapshot)).toBe(true);
    expect(
      evaluateDeveloperMutationCta({
        kind: "send",
        capability: DEVELOPER_WORKSPACE_UNSUPPORTED_CAPABILITY,
        mutationCapabilityPublished: false,
      }).visible,
    ).toBe(false);
    expect(
      evaluateDeveloperMutationCta({
        kind: "send",
        capability: DEVELOPER_WORKSPACE_SUPPORTED_CAPABILITY,
        mutationCapabilityPublished: false,
      }),
    ).toEqual({
      visible: false,
      enabled: false,
      reason: "api_capability_truth_unpublished",
    });
  });

  it("keeps Today/Next typed unavailable and Work home mutation-closed", () => {
    const model = buildDeveloperWorkHomeModel({
      agentId: "agent-1",
      flagEnabled: true,
      mode: "fixture",
    });
    expect(model.today).toEqual({
      kind: "unavailable",
      capability: "developer.schedule.today_v1",
      reason: "api_not_published",
    });
    expect(model.next.kind).toBe("unavailable");
    expect(workHomeForbidsMutation(model)).toBe(true);
    expect(model.openRoute).toEqual({
      ok: true,
      route: { agentId: "agent-1" },
    });
  });

  it("does not treat a live API miss as fixture success", async () => {
    const snapshot = await loadDeveloperWorkspaceSnapshot({
      agentId: "agent-1",
      flagEnabled: true,
      mode: "api",
    });
    expect(snapshot.machines.kind).toBe("unauthorized");
    expect(snapshot.machines).toEqual(
      expect.objectContaining({ reason: "authentication_required" }),
    );
    expect(snapshot.meta.fixture).not.toBe(true);
    expect(snapshot.machines.kind).not.toBe("ready");
  });

  it("does not load fixture when the Mobile flag is off", async () => {
    const snapshot = await loadDeveloperWorkspaceSnapshot({
      agentId: "owner-9",
    });
    expect(snapshot.machines).toEqual(
      expect.objectContaining({
        kind: "unavailable",
        reason: "feature_disabled",
      }),
    );
    expect(snapshot.machines.kind).not.toBe("ready");
  });

  it("scopes generated fixture to the route agent and fails closed on supplied wire mismatch", () => {
    const scoped = buildDeveloperWorkspaceSnapshot({ agentId: "owner-9" });
    expect(scoped.meta.agentId).toBe("owner-9");
    expect(scoped.machines.kind).toBe("ready");
    const mismatched = buildDeveloperWorkspaceSnapshot({
      agentId: "owner-9",
      wire: DEVELOPER_WORKSPACE_FIXTURE_WIRE,
    });
    expect(mismatched.machines).toEqual(
      expect.objectContaining({
        kind: "unauthorized",
        reason: "cross_agent_route_mismatch",
      }),
    );
  });
});
