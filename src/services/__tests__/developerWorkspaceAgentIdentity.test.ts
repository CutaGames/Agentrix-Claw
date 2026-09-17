import {
  normalizeOwnerAgentAccounts,
  resolveDeveloperWorkspaceAgentIdentity,
} from "../developerWorkspaceAgentIdentity";

// Shape and values as returned by `GET /api/agent-accounts` on the :3011 DRW
// canary for the staging owner on 2026-09-17 (board §0.35 / §0.40 sample).
const STAGING_OWNER_DIRECTORY = {
  success: true,
  data: [
    {
      id: "75e5c531-a5ce-4d14-ab9b-e7c4cd1f7ff2",
      agentUniqueId: "AGT-1789570903709-0bp0l1i7",
      name: "DRW M2 staging agent",
      status: "active",
    },
  ],
};

describe("developer workspace agent identity (M2 slice A, board §0.35)", () => {
  it("normalizes the {success,data} envelope and a bare array alike, dropping rows without an id", () => {
    expect(normalizeOwnerAgentAccounts(STAGING_OWNER_DIRECTORY)).toEqual([
      {
        id: "75e5c531-a5ce-4d14-ab9b-e7c4cd1f7ff2",
        agentUniqueId: "AGT-1789570903709-0bp0l1i7",
      },
    ]);
    expect(
      normalizeOwnerAgentAccounts([
        { id: "a", agentUniqueId: "AGT-a" },
        { agentUniqueId: "AGT-no-id" },
        null,
        { id: "", agentUniqueId: "AGT-empty" },
        { id: "b", agentUniqueId: "" },
      ]),
    ).toEqual([
      { id: "a", agentUniqueId: "AGT-a" },
      { id: "b", agentUniqueId: undefined },
    ]);
    expect(normalizeOwnerAgentAccounts(null)).toEqual([]);
    expect(normalizeOwnerAgentAccounts({ success: true, data: "nope" })).toEqual([]);
  });

  it("maps Mobile's agentAccountId (uuid) to the DRW-facing agentUniqueId (AGT-…)", () => {
    const rows = normalizeOwnerAgentAccounts(STAGING_OWNER_DIRECTORY);
    expect(
      resolveDeveloperWorkspaceAgentIdentity(
        "75e5c531-a5ce-4d14-ab9b-e7c4cd1f7ff2",
        rows,
      ),
    ).toEqual({
      ok: true,
      identity: {
        agentAccountId: "75e5c531-a5ce-4d14-ab9b-e7c4cd1f7ff2",
        agentUniqueId: "AGT-1789570903709-0bp0l1i7",
      },
    });
  });

  it("never guesses: no account, unknown account, or a row without agentUniqueId all fail closed", () => {
    const rows = normalizeOwnerAgentAccounts(STAGING_OWNER_DIRECTORY);
    expect(resolveDeveloperWorkspaceAgentIdentity(undefined, rows)).toEqual({
      ok: false,
      reason: "agent_account_required",
    });
    expect(resolveDeveloperWorkspaceAgentIdentity("   ", rows)).toEqual({
      ok: false,
      reason: "agent_account_required",
    });
    expect(
      resolveDeveloperWorkspaceAgentIdentity(
        "00000000-0000-4000-8000-000000000000",
        rows,
      ),
    ).toEqual({ ok: false, reason: "agent_not_in_owner_directory" });
    // The AGT id itself is not a key into the directory — only the uuid is.
    expect(
      resolveDeveloperWorkspaceAgentIdentity("AGT-1789570903709-0bp0l1i7", rows),
    ).toEqual({ ok: false, reason: "agent_not_in_owner_directory" });
    expect(
      resolveDeveloperWorkspaceAgentIdentity("b", [{ id: "b", agentUniqueId: undefined }]),
    ).toEqual({ ok: false, reason: "agent_unique_id_missing" });
  });
});
