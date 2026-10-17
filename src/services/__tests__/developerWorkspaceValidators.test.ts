import { validateDeveloperRemoteWorkspaceContractV1 } from "../../../shared/types/developer-remote-workspace";
import { evaluateDeveloperMutationCta } from "../developerWorkspaceCapability";
import {
  DEVELOPER_WORKSPACE_FIXTURE_WIRE,
  DEVELOPER_WORKSPACE_FIXTURE_WIRE_FINGERPRINT,
  DEVELOPER_WORKSPACE_PENDING_APPROVAL,
  DEVELOPER_WORKSPACE_READY_SESSION,
  DEVELOPER_WORKSPACE_STALE_MACHINE,
  DEVELOPER_WORKSPACE_SUPPORTED_CAPABILITY,
  DEVELOPER_WORKSPACE_WORKSPACE,
  listDeveloperWorkspaceContractFixtures,
  parseDeveloperWorkspaceFixtureWire,
  validateDeveloperWorkspaceFixturePack,
} from "../developerWorkspaceFixtures";
import { parseDeveloperWorkspaceOpenRoute } from "../developerWorkspaceOpenRoute";
import { assertAgentRouteMatch } from "../developerWorkspaceReadState";

describe("Developer workspace serialized fixtures", () => {
  it("round-trips the same fixture wire through strict validators", () => {
    const result = validateDeveloperWorkspaceFixturePack(
      DEVELOPER_WORKSPACE_FIXTURE_WIRE,
    );
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
    const again = JSON.stringify(
      parseDeveloperWorkspaceFixtureWire(DEVELOPER_WORKSPACE_FIXTURE_WIRE),
    );
    expect(again).toBe(DEVELOPER_WORKSPACE_FIXTURE_WIRE);
    expect(DEVELOPER_WORKSPACE_FIXTURE_WIRE_FINGERPRINT).toMatch(
      /^\d+:2026-08-22T10:01:00.000Z:agent-1:\/v1\/developer$/,
    );
  });

  it("marks the pack as capturedAt/fixture/default-off and never approved or payment", () => {
    const pack = parseDeveloperWorkspaceFixtureWire();
    expect(pack.meta).toEqual(
      expect.objectContaining({
        source: "fixture",
        fixture: true,
        defaultOff: true,
        mutationCapabilityPublished: false,
        capturedAt: "2026-08-22T10:01:00.000Z",
      }),
    );
    const wire = DEVELOPER_WORKSPACE_FIXTURE_WIRE;
    expect(wire).not.toContain('"decision":"approved"');
    expect(wire).not.toContain('"operationKind":"payment"');
    expect(wire).not.toContain('"status":"completed"');
    expect(wire).not.toContain("C:\\");
    expect(wire).not.toContain("/home/");
    expect(wire).not.toContain("super-secret");
  });

  it.each(
    listDeveloperWorkspaceContractFixtures().map(
      (item) => [item.key, item.contract] as const,
    ),
  )("accepts %s through the family validator", (_key, contract) => {
    expect(validateDeveloperRemoteWorkspaceContractV1(contract).valid).toBe(
      true,
    );
  });

  it("fails closed on unknown field, version and enum", () => {
    const session = {
      ...DEVELOPER_WORKSPACE_READY_SESSION,
      extraToken: "super-secret-provider-token",
    };
    expect(validateDeveloperRemoteWorkspaceContractV1(session).valid).toBe(
      false,
    );
    expect(
      validateDeveloperRemoteWorkspaceContractV1({
        ...DEVELOPER_WORKSPACE_READY_SESSION,
        schemaVersion: 2,
      }).valid,
    ).toBe(false);
    expect(
      validateDeveloperRemoteWorkspaceContractV1({
        ...DEVELOPER_WORKSPACE_READY_SESSION,
        state: "succeeded",
      }).valid,
    ).toBe(false);
  });

  it("fails closed on absolute paths and secret-bearing fields", () => {
    expect(
      validateDeveloperRemoteWorkspaceContractV1({
        ...DEVELOPER_WORKSPACE_WORKSPACE,
        displayLabel: "C:\\Users\\owner\\source",
      }).valid,
    ).toBe(false);
    expect(
      validateDeveloperRemoteWorkspaceContractV1({
        ...DEVELOPER_WORKSPACE_PENDING_APPROVAL,
        redactedArgumentsSummary: "/home/owner/source",
      }).valid,
    ).toBe(false);
    expect(
      parseDeveloperWorkspaceOpenRoute({
        agentId: "agent-1",
        token: "secret",
      }).ok,
    ).toBe(false);
    expect(
      parseDeveloperWorkspaceOpenRoute({
        agentId: "agent-1",
        sessionRef: "C:\\Users\\owner\\source",
      }).ok,
    ).toBe(false);
  });

  it("fails closed on stale/offline mutation CTAs and cross-Agent mismatch", () => {
    const stale = evaluateDeveloperMutationCta({
      kind: "send",
      capability: DEVELOPER_WORKSPACE_SUPPORTED_CAPABILITY,
      mutationCapabilityPublished: true,
      machineConnection: "stale",
      sessionState: "ready",
    });
    const offline = evaluateDeveloperMutationCta({
      kind: "approve",
      capability: DEVELOPER_WORKSPACE_SUPPORTED_CAPABILITY,
      mutationCapabilityPublished: true,
      machineConnection:
        DEVELOPER_WORKSPACE_STALE_MACHINE.connection.status === "stale"
          ? "offline"
          : "offline",
      sessionState: "ready",
    });
    expect(stale.enabled).toBe(false);
    expect(stale.reason).toBe("stale_mutation_denied");
    expect(offline.enabled).toBe(false);
    expect(offline.reason).toBe("offline_mutation_denied");
    expect(assertAgentRouteMatch("agent-2", "agent-1")).toEqual({
      kind: "unauthorized",
      reason: "cross_agent_route_mismatch",
    });
  });
});
