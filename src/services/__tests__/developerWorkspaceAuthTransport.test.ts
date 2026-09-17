import {
  DEVELOPER_WORKSPACE_AGENT_ACCOUNT_QUERY,
  createDeveloperWorkspaceAuthTransport,
} from "../developerWorkspaceAuth";

type Call = { url: URL; init: RequestInit };

function recordingFetch(status = 200, body = '{"success":true,"data":{"items":[]}}') {
  const calls: Call[] = [];
  const fetchImpl = (async (input: string, init: RequestInit) => {
    calls.push({ url: new URL(input), init });
    return { status, text: async () => body };
  }) as unknown as typeof fetch;
  return { calls, fetchImpl };
}

const AGENT_ACCOUNT_ID = "75e5c531-a5ce-4d14-ab9b-e7c4cd1f7ff2";
const BASE = "http://127.0.0.1:3011/api";

describe("developer workspace auth transport — Mobile agent hint (board §0.35)", () => {
  it("adds `agentAccountId` to every request, GET and POST alike, and never sends x-agent-id", async () => {
    const { calls, fetchImpl } = recordingFetch();
    const transport = createDeveloperWorkspaceAuthTransport({
      token: "jwt",
      baseUrl: BASE,
      fetchImpl,
      agentAccountId: AGENT_ACCOUNT_ID,
    });
    expect(transport.authenticated).toBe(true);

    await transport.request({
      method: "GET",
      path: "/v1/developer/machines",
      query: { cursor: "Y3Vyc29y" },
    });
    await transport.request({
      method: "POST",
      path: "/v1/developer/approvals/apr_1/decisions",
      body: { expectedApprovalVersion: 1, decision: "approved" },
      idempotencyKey: "idem-1",
      digestHeaders: true,
    });

    expect(calls).toHaveLength(2);
    for (const call of calls) {
      expect(call.url.searchParams.get(DEVELOPER_WORKSPACE_AGENT_ACCOUNT_QUERY)).toBe(
        AGENT_ACCOUNT_ID,
      );
      const headers = call.init.headers as Record<string, string>;
      expect(headers.Authorization).toBe("Bearer jwt");
      expect(Object.keys(headers).map((key) => key.toLowerCase())).not.toContain(
        "x-agent-id",
      );
    }
    expect(calls[0].url.pathname).toBe("/api/v1/developer/machines");
    expect(calls[0].url.searchParams.get("cursor")).toBe("Y3Vyc29y");
    expect(calls[1].url.pathname).toBe("/api/v1/developer/approvals/apr_1/decisions");
    expect((calls[1].init.headers as Record<string, string>)["Idempotency-Key"]).toBe("idem-1");
    // The hint lives in the query only — the canonical JSON body is untouched.
    expect(calls[1].init.body).toBe('{"decision":"approved","expectedApprovalVersion":1}');
  });

  it("sends no agent hint when Mobile has no agent relation (blank or absent)", async () => {
    for (const agentAccountId of [undefined, "", "   "]) {
      const { calls, fetchImpl } = recordingFetch();
      const transport = createDeveloperWorkspaceAuthTransport({
        token: "jwt",
        baseUrl: BASE,
        fetchImpl,
        agentAccountId,
      });
      await transport.request({ method: "GET", path: "/v1/developer/approvals" });
      expect(calls[0].url.searchParams.has(DEVELOPER_WORKSPACE_AGENT_ACCOUNT_QUERY)).toBe(false);
    }
  });

  it("maps the backend's no-hint answer (503 canonical_tenant_agent_required) through untouched", async () => {
    const { fetchImpl } = recordingFetch(
      503,
      '{"success":false,"error":{"code":"canonical_tenant_agent_required","reason":"canonical_tenant_agent_required","retriable":true}}',
    );
    const transport = createDeveloperWorkspaceAuthTransport({
      token: "jwt",
      baseUrl: BASE,
      fetchImpl,
    });
    const response = await transport.request({ method: "GET", path: "/v1/developer/machines" });
    expect(response.status).toBe(503);
    expect((response.json as { error: { reason: string } }).error.reason).toBe(
      "canonical_tenant_agent_required",
    );
  });

  it("offline: throws `offline` before touching the network — nothing is queued (M2.4.1)", async () => {
    const { calls, fetchImpl } = recordingFetch();
    const transport = createDeveloperWorkspaceAuthTransport({
      token: "jwt",
      baseUrl: BASE,
      fetchImpl,
      online: false,
      agentAccountId: AGENT_ACCOUNT_ID,
    });
    expect(transport.online).toBe(false);
    await expect(
      transport.request({
        method: "POST",
        path: "/v1/developer/approvals/apr_1/decisions",
        body: { decision: "approved" },
        idempotencyKey: "idem-1",
      }),
    ).rejects.toMatchObject({ code: "offline" });
    expect(calls).toHaveLength(0);
  });
});
