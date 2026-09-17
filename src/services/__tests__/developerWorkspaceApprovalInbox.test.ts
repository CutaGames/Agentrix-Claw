/**
 * M2.2 quick approval inbox — LOCAL evidence for M2.2.1–M2.2.4 (MTR-R10),
 * decision d-50. Each case states the task-book rule it covers.
 */
import {
  canDecideDeveloperApproval,
  decideDeveloperApprovalWithReadBack,
  describeDeveloperApprovalInbox,
  openDeveloperApprovalInbox,
  readJwtExpiryMs,
  reauthenticateDeveloperWorkspace,
  type DeveloperApprovalInboxState,
} from "../developerWorkspaceApprovalInbox";
import type {
  DeveloperWorkspaceTransport,
  DeveloperWorkspaceTransportRequest,
  DeveloperWorkspaceTransportResponse,
} from "../developerWorkspaceAuth";
import { createDeveloperWorkspaceIdempotencyStore } from "../developerWorkspaceControl";
import { DEVELOPER_WORKSPACE_PENDING_APPROVAL } from "../developerWorkspaceFixtures";
import {
  buildFixtureApprovalDecision,
  createDeveloperWorkspaceFixtureTransport,
  DEVELOPER_WORKSPACE_FIXTURE_NOW,
} from "../developerWorkspaceFixtureTransport";
import type {
  DeveloperApprovalDecisionV1,
  DeveloperApprovalRequestV1,
} from "../../../shared/types/developer-remote-workspace";

const PENDING = DEVELOPER_WORKSPACE_PENDING_APPROVAL as DeveloperApprovalRequestV1;
const NOW = DEVELOPER_WORKSPACE_FIXTURE_NOW; // 10:02, inside [10:01, 10:05)
const AFTER_EXPIRY = "2026-08-22T10:06:00.000Z";

function ok(data: unknown): DeveloperWorkspaceTransportResponse {
  return { status: 200, json: { success: true, data } };
}

function fail(status: number, reason: string): DeveloperWorkspaceTransportResponse {
  return {
    status,
    json: { success: false, error: { code: reason, reason, retriable: false } },
  };
}

function recording(
  handler: (
    req: DeveloperWorkspaceTransportRequest,
    index: number,
  ) => DeveloperWorkspaceTransportResponse | Promise<DeveloperWorkspaceTransportResponse>,
): { transport: DeveloperWorkspaceTransport; requests: DeveloperWorkspaceTransportRequest[] } {
  const requests: DeveloperWorkspaceTransportRequest[] = [];
  return {
    requests,
    transport: async (req) => {
      requests.push(req);
      return handler(req, requests.length - 1);
    },
  };
}

function posts(requests: DeveloperWorkspaceTransportRequest[]) {
  return requests.filter((req) => req.method === "POST");
}

function gets(requests: DeveloperWorkspaceTransportRequest[]) {
  return requests.filter((req) => req.method === "GET");
}

/** True when the wire form of a state carries an approved decision. */
function saysApproved(state: DeveloperApprovalInboxState): boolean {
  return /"decision":"approved"|"resultingStatus":"approved"/.test(
    JSON.stringify(state),
  );
}

function jwt(exp: number): string {
  const b64 = (value: unknown) =>
    Buffer.from(JSON.stringify(value)).toString("base64url");
  return `${b64({ alg: "HS256" })}.${b64({ sub: "u1", exp })}.sig`;
}

describe("M2.2.1 — push → re-auth → fresh read → exact digest → decision → authoritative read-back", () => {
  it("runs the whole chain against the fixture transport and shows only what the read-back returned", async () => {
    const fixture = createDeveloperWorkspaceFixtureTransport();
    const opened = await openDeveloperApprovalInbox({
      transport: fixture.request,
      approvalRef: PENDING.approvalRef,
      now: NOW,
      source: "fixture",
    });
    expect(opened.phase).toBe("pending");
    expect(canDecideDeveloperApproval(opened)).toBe(true);
    if (opened.phase !== "pending") return;
    expect(opened.approval.requestDigest.value).toBe(PENDING.requestDigest.value);

    const store = createDeveloperWorkspaceIdempotencyStore();
    const phases: string[] = [];
    const decided = await decideDeveloperApprovalWithReadBack({
      transport: fixture.request,
      approval: opened.approval,
      decision: "rejected",
      now: NOW,
      online: true,
      idempotency: store,
      source: "fixture",
      onReadingBack: () => phases.push("reading_back"),
    });
    expect(phases).toEqual(["reading_back"]);
    expect(decided.phase).toBe("decided");
    if (decided.phase !== "decided") return;
    expect(decided.approval.decision).toBe("rejected");
    expect(decided.approval.approvalRef).toBe(PENDING.approvalRef);
    expect(decided.source).toBe("fixture");

    // Exactly: fresh read, one POST, one read-back GET.
    const requests = fixture.requests();
    expect(posts(requests)).toHaveLength(1);
    expect(gets(requests)).toHaveLength(2);
    expect(posts(requests)[0].path).toBe(
      `/v1/developer/approvals/${PENDING.approvalRef}/decisions`,
    );
    // The record on screen is the backend's, not the request we sent.
    expect(decided.approval).toEqual(fixture.current());
    expect(describeDeveloperApprovalInbox(decided, true)).toContain("回读");
  });

  it("approve path: the approved record comes from the read-back GET, with the exact request digest", async () => {
    const fixture = createDeveloperWorkspaceFixtureTransport();
    const opened = await openDeveloperApprovalInbox({
      transport: fixture.request,
      approvalRef: PENDING.approvalRef,
      now: NOW,
    });
    if (opened.phase !== "pending") throw new Error(opened.phase);
    const decided = await decideDeveloperApprovalWithReadBack({
      transport: fixture.request,
      approval: opened.approval,
      decision: "approved",
      now: NOW,
      online: true,
      idempotency: createDeveloperWorkspaceIdempotencyStore(),
    });
    expect(decided.phase).toBe("decided");
    if (decided.phase !== "decided") return;
    expect(decided.approval.decision).toBe("approved");
    expect(decided.approval.requestDigest).toEqual(PENDING.requestDigest);
    const body = posts(fixture.requests())[0].body as Record<string, unknown>;
    expect(body.expectedApprovalVersion).toBe(PENDING.approvalVersion);
    expect(body.requestDigest).toEqual(PENDING.requestDigest);
    expect(body.grantScope).toBe("once");
    // Identity comes from the token, never from the body.
    for (const key of ["ownerUserId", "decidedByRef", "tenantRef"]) {
      expect(body).not.toHaveProperty(key);
    }
  });

  it("re-authenticates with the token as it is now: missing / expired JWTs are never reused", async () => {
    const nowMs = Date.parse(NOW);
    expect(
      await reauthenticateDeveloperWorkspace({ token: null, now: NOW }),
    ).toEqual({ ok: false, reason: "authentication_required" });
    expect(
      await reauthenticateDeveloperWorkspace({ token: "   ", now: NOW }),
    ).toEqual({ ok: false, reason: "authentication_required" });
    const expired = jwt(Math.floor(nowMs / 1000) - 60);
    expect(readJwtExpiryMs(expired)).toBe((Math.floor(nowMs / 1000) - 60) * 1000);
    expect(
      await reauthenticateDeveloperWorkspace({ token: expired, now: NOW }),
    ).toEqual({ ok: false, reason: "session_expired" });
    // Inside the skew window counts as expired too.
    const almost = jwt(Math.floor(nowMs / 1000) + 10);
    expect(
      await reauthenticateDeveloperWorkspace({ token: almost, now: NOW }),
    ).toEqual({ ok: false, reason: "session_expired" });
    const fresh = jwt(Math.floor(nowMs / 1000) + 3600);
    expect(
      await reauthenticateDeveloperWorkspace({ token: fresh, now: NOW }),
    ).toEqual({ ok: true, token: fresh });
    // Server-side verdict "invalid" fails closed; "unknown" defers to the fresh read.
    expect(
      await reauthenticateDeveloperWorkspace({
        token: fresh,
        now: NOW,
        verify: async () => "invalid",
      }),
    ).toEqual({ ok: false, reason: "authentication_required" });
    expect(
      await reauthenticateDeveloperWorkspace({
        token: fresh,
        now: NOW,
        verify: async () => "unknown",
      }),
    ).toEqual({ ok: true, token: fresh });
    // Non-JWT tokens (opaque / Maestro seed) carry no expiry claim.
    expect(readJwtExpiryMs("e2e-token")).toBeNull();
  });

  it("opening an already-terminal approval is read-only", async () => {
    const decision = buildFixtureApprovalDecision({
      request: PENDING,
      body: { decision: "rejected" },
      now: NOW,
    });
    const { transport } = recording(() => ok({ items: [decision] }));
    const opened = await openDeveloperApprovalInbox({
      transport,
      approvalRef: PENDING.approvalRef,
      now: NOW,
    });
    expect(opened.phase).toBe("terminal_read_only");
    expect(canDecideDeveloperApproval(opened)).toBe(false);
  });
});

describe("M2.2.2 — no local optimistic side effects, no timeout-as-success", () => {
  it("a 2xx POST whose read-back still shows pending is NOT a decision", async () => {
    const approvedRecord = buildFixtureApprovalDecision({
      request: PENDING,
      body: { decision: "approved" },
      now: NOW,
    });
    const { transport, requests } = recording((req) => {
      if (req.method === "POST") return ok(approvedRecord); // backend says 200…
      return ok({ items: [PENDING] }); // …but the read-back still shows pending
    });
    const result = await decideDeveloperApprovalWithReadBack({
      transport,
      approval: PENDING,
      decision: "approved",
      now: NOW,
      online: true,
      idempotency: createDeveloperWorkspaceIdempotencyStore(),
    });
    expect(result.phase).toBe("blocked");
    if (result.phase !== "blocked") return;
    expect(result.reason).toBe("decision_not_recorded");
    expect(saysApproved(result)).toBe(false);
    expect(posts(requests)).toHaveLength(1);
  });

  it("a POST timeout is an unknown outcome: the read-back decides, never the clock", async () => {
    // (a) the backend did record it → the read-back is the only source of "decided"
    const recorded = buildFixtureApprovalDecision({
      request: PENDING,
      body: { decision: "approved" },
      now: NOW,
    });
    const a = recording((req) =>
      req.method === "POST"
        ? new Promise<DeveloperWorkspaceTransportResponse>(() => {})
        : ok({ items: [recorded] }),
    );
    const resultA = await decideDeveloperApprovalWithReadBack({
      transport: a.transport,
      approval: PENDING,
      decision: "approved",
      now: NOW,
      online: true,
      idempotency: createDeveloperWorkspaceIdempotencyStore(),
      timeoutMs: 20,
    });
    expect(resultA.phase).toBe("decided");

    // (b) the backend did not record it → unknown, not failed, not approved
    const b = recording((req) =>
      req.method === "POST"
        ? new Promise<DeveloperWorkspaceTransportResponse>(() => {})
        : ok({ items: [PENDING] }),
    );
    const resultB = await decideDeveloperApprovalWithReadBack({
      transport: b.transport,
      approval: PENDING,
      decision: "approved",
      now: NOW,
      online: true,
      idempotency: createDeveloperWorkspaceIdempotencyStore(),
      timeoutMs: 20,
    });
    expect(resultB.phase).toBe("blocked");
    if (resultB.phase === "blocked") {
      expect(resultB.reason).toBe("decision_outcome_unknown");
      expect(resultB.failure.kind).toBe("unknown");
      expect(resultB.canReread).toBe(true);
    }
    expect(saysApproved(resultB)).toBe(false);
    // Exactly one POST left the device; the timeout never re-sends.
    expect(posts(b.requests)).toHaveLength(1);

    // (c) read-back unreachable as well → still unknown
    const c = recording(
      () => new Promise<DeveloperWorkspaceTransportResponse>(() => {}),
    );
    const resultC = await decideDeveloperApprovalWithReadBack({
      transport: c.transport,
      approval: PENDING,
      decision: "rejected",
      now: NOW,
      online: true,
      idempotency: createDeveloperWorkspaceIdempotencyStore(),
      timeoutMs: 20,
    });
    expect(resultC.phase).toBe("blocked");
    if (resultC.phase === "blocked")
      expect(resultC.reason).toBe("decision_outcome_unknown");
  });

  it("a read-back record that is not bound to this exact request fails closed", async () => {
    const foreign = buildFixtureApprovalDecision({
      request: { ...PENDING, sessionVersion: PENDING.sessionVersion + 1 },
      body: { decision: "approved" },
      now: NOW,
    });
    const { transport } = recording((req) =>
      req.method === "POST" ? ok(foreign) : ok({ items: [foreign] }),
    );
    const result = await decideDeveloperApprovalWithReadBack({
      transport,
      approval: PENDING,
      decision: "approved",
      now: NOW,
      online: true,
      idempotency: createDeveloperWorkspaceIdempotencyStore(),
    });
    expect(result.phase).toBe("blocked");
    if (result.phase === "blocked")
      expect(result.reason).toBe("read_back_failed_closed");
    expect(saysApproved(result)).toBe(false);
  });
});

describe("M2.2.3 — negative matrix: duplicate tap / background / timeout / revoke / expired / unknown-risk", () => {
  it("duplicate tap: the second decision replays the first (one POST on the wire), UI state settles once", async () => {
    const fixture = createDeveloperWorkspaceFixtureTransport();
    const store = createDeveloperWorkspaceIdempotencyStore();
    const first = await decideDeveloperApprovalWithReadBack({
      transport: fixture.request,
      approval: PENDING,
      decision: "rejected",
      now: NOW,
      online: true,
      idempotency: store,
    });
    const second = await decideDeveloperApprovalWithReadBack({
      transport: fixture.request,
      approval: PENDING,
      decision: "rejected",
      now: NOW,
      online: true,
      idempotency: store,
    });
    expect(first.phase).toBe("decided");
    expect(second.phase).toBe("decided");
    expect(posts(fixture.requests())).toHaveLength(1);
    if (first.phase === "decided" && second.phase === "decided") {
      expect(second.approval.decisionRef).toBe(first.approval.decisionRef);
    }
    // The screen-level guard: a settled state cannot decide again at all.
    expect(canDecideDeveloperApproval(second)).toBe(false);
  });

  it("duplicate tap racing two POSTs: both carry the same Idempotency-Key; a 409 on the loser resolves to the server's record", async () => {
    const recordedDecision = buildFixtureApprovalDecision({
      request: PENDING,
      body: { decision: "rejected" },
      now: NOW,
    });
    let postCount = 0;
    const { transport, requests } = recording((req) => {
      if (req.method === "POST") {
        postCount += 1;
        return postCount === 1
          ? ok(recordedDecision)
          : fail(409, "approval_already_decided");
      }
      return ok({ items: [postCount === 0 ? PENDING : recordedDecision] });
    });
    const storeA = createDeveloperWorkspaceIdempotencyStore();
    const storeB = createDeveloperWorkspaceIdempotencyStore();
    const [a, b] = await Promise.all([
      decideDeveloperApprovalWithReadBack({
        transport,
        approval: PENDING,
        decision: "rejected",
        now: NOW,
        online: true,
        idempotency: storeA,
      }),
      decideDeveloperApprovalWithReadBack({
        transport,
        approval: PENDING,
        decision: "rejected",
        now: NOW,
        online: true,
        idempotency: storeB,
      }),
    ]);
    const keys = posts(requests).map((req) => req.idempotencyKey);
    expect(keys).toHaveLength(2);
    expect(keys[0]).toBe(keys[1]);
    expect(a.phase).toBe("decided");
    expect(b.phase).toBe("decided");
  });

  it("background → return: the request is re-read; a changed digest is surfaced, a terminal one is read-only", async () => {
    const changed: DeveloperApprovalRequestV1 = {
      ...PENDING,
      approvalVersion: 2,
      requestDigest: { ...PENDING.requestDigest, value: "9".repeat(64) },
    };
    const { transport } = recording(() => ok({ items: [changed] }));
    const reread = await openDeveloperApprovalInbox({
      transport,
      approvalRef: PENDING.approvalRef,
      now: NOW,
      previous: PENDING,
    });
    expect(reread.phase).toBe("pending");
    if (reread.phase === "pending") {
      expect(reread.notice).toBe("request_changed_reread");
      expect(reread.approval.requestDigest.value).toBe("9".repeat(64));
    }
    // Deciding on the stale (pre-background) digest: the backend answers 409
    // request_digest_mismatch → no decision, "re-read" is the only next step.
    const stale = recording((req) =>
      req.method === "POST"
        ? fail(409, "request_digest_mismatch")
        : ok({ items: [changed] }),
    );
    const refused = await decideDeveloperApprovalWithReadBack({
      transport: stale.transport,
      approval: { ...changed, requestDigest: PENDING.requestDigest },
      decision: "approved",
      now: NOW,
      online: true,
      idempotency: createDeveloperWorkspaceIdempotencyStore(),
    });
    expect(refused.phase).toBe("blocked");
    if (refused.phase === "blocked") {
      expect(refused.reason).toBe("request_digest_mismatch");
      expect(refused.canReread).toBe(true);
    }
    expect(saysApproved(refused)).toBe(false);

    const terminal = buildFixtureApprovalDecision({
      request: PENDING,
      body: { decision: "rejected" },
      now: NOW,
    });
    const gone = recording(() => ok({ items: [terminal] }));
    const rereadTerminal = await openDeveloperApprovalInbox({
      transport: gone.transport,
      approvalRef: PENDING.approvalRef,
      now: NOW,
      previous: PENDING,
    });
    expect(rereadTerminal.phase).toBe("terminal_read_only");
  });

  it("revoke: a revoked / deleted approval reads back as not found and a revoke conflict resolves to the server's terminal record", async () => {
    const gone = recording(() => ok({ items: [] }));
    const opened = await openDeveloperApprovalInbox({
      transport: gone.transport,
      approvalRef: PENDING.approvalRef,
      now: NOW,
    });
    expect(opened.phase).toBe("blocked");
    if (opened.phase === "blocked") expect(opened.reason).toBe("approval_not_found");

    const cancelled: DeveloperApprovalDecisionV1 = {
      ...(buildFixtureApprovalDecision({
        request: PENDING,
        body: { decision: "rejected" },
        now: NOW,
      }) as Extract<DeveloperApprovalDecisionV1, { decision: "rejected" }>),
    };
    const revokedRecord = {
      ...cancelled,
      decision: "cancelled" as const,
      resultingStatus: "cancelled" as const,
      cancelledByRef: "principal-1",
      reasonCode: "owner_revoked",
    };
    delete (revokedRecord as { decidedByRef?: string }).decidedByRef;
    const revoked = recording((req) =>
      req.method === "POST"
        ? fail(409, "approval_revoked")
        : ok({ items: [revokedRecord] }),
    );
    const result = await decideDeveloperApprovalWithReadBack({
      transport: revoked.transport,
      approval: PENDING,
      decision: "approved",
      now: NOW,
      online: true,
      idempotency: createDeveloperWorkspaceIdempotencyStore(),
    });
    expect(result.phase).toBe("terminal_read_only");
    if (result.phase === "terminal_read_only")
      expect(result.approval.decision).toBe("cancelled");
    expect(saysApproved(result)).toBe(false);
  });

  it("expired: no decision is sent for an expired request; the read-back shows what the backend did", async () => {
    const { transport, requests } = recording(() => ok({ items: [PENDING] }));
    const opened = await openDeveloperApprovalInbox({
      transport,
      approvalRef: PENDING.approvalRef,
      now: AFTER_EXPIRY,
    });
    expect(opened.phase).toBe("blocked");
    if (opened.phase === "blocked") expect(opened.reason).toBe("approval_expired");

    const result = await decideDeveloperApprovalWithReadBack({
      transport,
      approval: PENDING,
      decision: "approved",
      now: AFTER_EXPIRY,
      online: true,
      idempotency: createDeveloperWorkspaceIdempotencyStore(),
    });
    expect(posts(requests)).toHaveLength(0);
    expect(result.phase).toBe("blocked");
    if (result.phase === "blocked") expect(result.reason).toBe("approval_expired");
    expect(saysApproved(result)).toBe(false);
  });

  it("unknown risk fails closed before anything is shown as decidable", async () => {
    const { transport } = recording(() =>
      ok({ items: [{ ...PENDING, risk: "L9" }] }),
    );
    const opened = await openDeveloperApprovalInbox({
      transport,
      approvalRef: PENDING.approvalRef,
      now: NOW,
    });
    expect(opened.phase).toBe("blocked");
    if (opened.phase === "blocked") {
      expect(opened.reason).toBe("live_api_failed_closed");
      expect(opened.failure.kind).toBe("error");
    }
    expect(canDecideDeveloperApproval(opened)).toBe(false);
  });

  it("offline: the decision is refused locally and nothing is queued", async () => {
    const { transport, requests } = recording(() => ok({ items: [PENDING] }));
    const result = await decideDeveloperApprovalWithReadBack({
      transport,
      approval: PENDING,
      decision: "approved",
      now: NOW,
      online: false,
      idempotency: createDeveloperWorkspaceIdempotencyStore(),
    });
    expect(result.phase).toBe("blocked");
    if (result.phase === "blocked") expect(result.reason).toBe("client_offline");
    expect(requests).toHaveLength(0);
  });

  it("session died between open and decide: 401 on the POST reads back as authentication_required", async () => {
    const { transport } = recording((req) =>
      req.method === "POST" ? fail(401, "token_expired") : fail(401, "token_expired"),
    );
    const result = await decideDeveloperApprovalWithReadBack({
      transport,
      approval: PENDING,
      decision: "approved",
      now: NOW,
      online: true,
      idempotency: createDeveloperWorkspaceIdempotencyStore(),
    });
    expect(result.phase).toBe("blocked");
    if (result.phase === "blocked") {
      expect(result.reason).toBe("authentication_required");
      expect(result.failure.kind).toBe("unauthorized");
    }
  });
});

describe("M2.2.4 — decision monotonicity: a terminal state is never written twice", () => {
  it("a second decision against the fixture backend is a 409 and the screen shows the server's first decision", async () => {
    const fixture = createDeveloperWorkspaceFixtureTransport();
    const first = await decideDeveloperApprovalWithReadBack({
      transport: fixture.request,
      approval: PENDING,
      decision: "rejected",
      now: NOW,
      online: true,
      idempotency: createDeveloperWorkspaceIdempotencyStore(),
    });
    expect(first.phase).toBe("decided");
    // A different decision from another device / store: the backend refuses,
    // the read-back shows the recorded rejection, nothing flips to approved.
    const second = await decideDeveloperApprovalWithReadBack({
      transport: fixture.request,
      approval: PENDING,
      decision: "approved",
      now: NOW,
      online: true,
      idempotency: createDeveloperWorkspaceIdempotencyStore(),
    });
    expect(second.phase).toBe("terminal_read_only");
    if (second.phase === "terminal_read_only")
      expect(second.approval.decision).toBe("rejected");
    expect(saysApproved(second)).toBe(false);
    expect(fixture.current().contractType).toBe("developer_approval_decision");
  });

  it("a non-pending request is refused locally with zero requests", async () => {
    const { transport, requests } = recording(() => ok({ items: [] }));
    const result = await decideDeveloperApprovalWithReadBack({
      transport,
      approval: { ...PENDING, status: "approved" as unknown as "pending" },
      decision: "approved",
      now: NOW,
      online: true,
      idempotency: createDeveloperWorkspaceIdempotencyStore(),
    });
    expect(result.phase).toBe("blocked");
    if (result.phase === "blocked") expect(result.reason).toBe("approval_not_pending");
    expect(requests).toHaveLength(0);
  });

  it("the fixture transport never fabricates success: its snapshot-facing pack stays pending until a decision is posted", () => {
    const fixture = createDeveloperWorkspaceFixtureTransport();
    expect(fixture.current()).toEqual(PENDING);
    expect(JSON.stringify(fixture.current())).not.toMatch(/"decision":"approved"/);
  });
});
