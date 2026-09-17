/**
 * Mobile-named acceptance assertions for M2 slice A (V7 tasks M2.4.1 / M2.4.2 /
 * M2.4.3, decision d-50). The DRW-authored suites cover the implementation;
 * these pin the three product properties the slice is accepted on, in the
 * words of the task book:
 *   - offline never queues and never falls back to the cloud (M2.4.1);
 *   - a handoff is a one-time opaque ref, accepted only on a verified online
 *     machine (M2.4.2);
 *   - the cache may hold non-sensitive refs + capturedAt only, and a revoked
 *     or deleted record never comes back from a cache (M2.4.3).
 */
import type {
  DeveloperWorkspaceTransport,
  DeveloperWorkspaceTransportRequest,
} from "../developerWorkspaceAuth";
import { loadDeveloperWorkspaceSnapshot } from "../developerWorkspaceClient";
import { createDeveloperWorkspaceIdempotencyStore } from "../developerWorkspaceControl";
import {
  DEVELOPER_WORKSPACE_FIXTURE_AGENT_ID,
  DEVELOPER_WORKSPACE_OFFLINE_MACHINE,
  DEVELOPER_WORKSPACE_ONLINE_MACHINE,
  DEVELOPER_WORKSPACE_PENDING_APPROVAL,
  DEVELOPER_WORKSPACE_READY_SESSION,
} from "../developerWorkspaceFixtures";
import { acceptDeveloperHandoff } from "../developerWorkspaceHandoff";
import {
  assertDeveloperWorkspaceSafeToPersist,
  developerWorkspaceCacheKey,
  queueDeveloperWorkspaceMutation,
} from "../developerWorkspacePersistence";
import {
  DEVELOPER_REMOTE_WORKSPACE_CANONICALIZATION,
  DEVELOPER_REMOTE_WORKSPACE_SCHEMA_VERSION,
  type DeveloperHandoffV1,
} from "../../../shared/types/developer-remote-workspace";

const T1 = "2026-09-17T00:01:00.000Z";
const T4 = "2026-09-17T00:04:00.000Z";
const T5 = "2026-09-17T00:05:00.000Z";

function digest(char: string) {
  return {
    algorithm: "sha-256" as const,
    canonicalization: DEVELOPER_REMOTE_WORKSPACE_CANONICALIZATION,
    value: char.repeat(64),
  };
}

const ISSUED_HANDOFF: DeveloperHandoffV1 = {
  schemaVersion: DEVELOPER_REMOTE_WORKSPACE_SCHEMA_VERSION,
  contractType: "developer_handoff",
  handoffRef: "hnd_acceptance_1",
  handoffVersion: 1,
  ownerPrincipalRef: "principal-1",
  agentId: DEVELOPER_WORKSPACE_FIXTURE_AGENT_ID,
  machineRef: DEVELOPER_WORKSPACE_ONLINE_MACHINE.machineRef,
  deviceRef: DEVELOPER_WORKSPACE_ONLINE_MACHINE.deviceRef,
  runtimeRef: DEVELOPER_WORKSPACE_ONLINE_MACHINE.runtimeRef,
  sessionRef: DEVELOPER_WORKSPACE_READY_SESSION.sessionRef,
  sessionVersion: DEVELOPER_WORKSPACE_READY_SESSION.sessionVersion,
  adapterSessionRef: DEVELOPER_WORKSPACE_READY_SESSION.adapterSessionRef,
  fromSurface: "web",
  toSurface: "mobile",
  target: { kind: "session" },
  oneTime: true,
  issuedAt: T1,
  expiresAt: T5,
  handoffDigest: digest("d"),
  status: "issued",
};

function ok(data: unknown) {
  return { success: true, data };
}

function spyTransport(
  handler: (req: DeveloperWorkspaceTransportRequest) => { status: number; json: unknown },
) {
  const requests: DeveloperWorkspaceTransportRequest[] = [];
  const transport: DeveloperWorkspaceTransport = async (req) => {
    requests.push(req);
    return handler(req);
  };
  return { requests, transport };
}

describe("M2.4.1 — offline never queues, never falls back", () => {
  it("an offline client renders every face as unknown/client_offline without one transport call", async () => {
    const { requests, transport } = spyTransport(() => ({ status: 200, json: ok({ items: [] }) }));
    const snapshot = await loadDeveloperWorkspaceSnapshot({
      agentId: DEVELOPER_WORKSPACE_FIXTURE_AGENT_ID,
      flagEnabled: true,
      authenticated: true,
      online: false,
      mode: "api",
      transport,
    });
    const offline = { kind: "unknown", reason: "client_offline" };
    expect(snapshot.machines).toEqual(offline);
    expect(snapshot.sessions).toEqual(offline);
    expect(snapshot.approvals).toEqual(offline);
    expect(snapshot.receipts).toEqual(offline);
    expect(requests).toHaveLength(0);
  });

  it("an offline mutation is refused up front — there is no offline queue to put it in", async () => {
    const { requests, transport } = spyTransport(() => ({ status: 200, json: ok(ISSUED_HANDOFF) }));
    const result = await acceptDeveloperHandoff({
      transport,
      handoff: ISSUED_HANDOFF,
      targetMachine: DEVELOPER_WORKSPACE_ONLINE_MACHINE,
      consumerSession: DEVELOPER_WORKSPACE_READY_SESSION,
      online: false,
      idempotency: createDeveloperWorkspaceIdempotencyStore(),
    });
    expect(result).toEqual({ ok: false, state: { kind: "unknown", reason: "client_offline" } });
    expect(requests).toHaveLength(0);
    expect(queueDeveloperWorkspaceMutation()).toEqual({
      ok: false,
      reason: "offline_queue_forbidden",
    });
  });
});

describe("M2.4.2 — handoff is a one-time opaque ref accepted only on a verified online machine", () => {
  it("refuses an offline or unbound target machine before any request", async () => {
    const { requests, transport } = spyTransport(() => ({ status: 200, json: ok(ISSUED_HANDOFF) }));
    const offlineTarget = await acceptDeveloperHandoff({
      transport,
      handoff: ISSUED_HANDOFF,
      targetMachine: DEVELOPER_WORKSPACE_OFFLINE_MACHINE,
      consumerSession: DEVELOPER_WORKSPACE_READY_SESSION,
      online: true,
      idempotency: createDeveloperWorkspaceIdempotencyStore(),
    });
    expect(offlineTarget.ok).toBe(false);
    if (offlineTarget.ok === false) {
      expect(offlineTarget.state).toEqual({
        kind: "unavailable",
        capability: "developer.handoffs_v1",
        reason: "handoff_target_unpublished",
      });
    }
    const unbound = await acceptDeveloperHandoff({
      transport,
      handoff: ISSUED_HANDOFF,
      targetMachine: { ...DEVELOPER_WORKSPACE_ONLINE_MACHINE, shellBindingRef: undefined },
      consumerSession: DEVELOPER_WORKSPACE_READY_SESSION,
      online: true,
      idempotency: createDeveloperWorkspaceIdempotencyStore(),
    });
    expect(unbound.ok).toBe(false);
    expect(requests).toHaveLength(0);
  });

  it("a handoff that is no longer `issued` cannot be accepted again, and a repeat accept reuses the same idempotency key", async () => {
    const consumed: DeveloperHandoffV1 = {
      ...ISSUED_HANDOFF,
      status: "consumed",
      consumedAt: T4,
      consumerSessionRef: DEVELOPER_WORKSPACE_READY_SESSION.sessionRef,
      consumptionReceiptRef: { type: "evidence", id: "hcr_1", version: 1, digest: digest("f") },
    } as DeveloperHandoffV1;
    const { requests, transport } = spyTransport(() => ({ status: 200, json: ok(consumed) }));
    const idempotency = createDeveloperWorkspaceIdempotencyStore();

    const first = await acceptDeveloperHandoff({
      transport,
      handoff: ISSUED_HANDOFF,
      targetMachine: DEVELOPER_WORKSPACE_ONLINE_MACHINE,
      consumerSession: DEVELOPER_WORKSPACE_READY_SESSION,
      online: true,
      idempotency,
    });
    expect(first.ok).toBe(true);
    expect(requests[0].path).toBe(`/v1/developer/handoffs/${ISSUED_HANDOFF.handoffRef}/accept`);
    expect(requests[0].digestHeaders).toBe(true);

    // Same ref, same store → same Idempotency-Key: the backend sees a replay,
    // never a second consumption.
    const replay = await acceptDeveloperHandoff({
      transport,
      handoff: ISSUED_HANDOFF,
      targetMachine: DEVELOPER_WORKSPACE_ONLINE_MACHINE,
      consumerSession: DEVELOPER_WORKSPACE_READY_SESSION,
      online: true,
      idempotency,
    });
    expect(replay.ok).toBe(true);
    expect(requests).toHaveLength(2);
    expect(requests[1].idempotencyKey).toBe(requests[0].idempotencyKey);

    // Once the server-side state is `consumed`, the client refuses locally.
    const again = await acceptDeveloperHandoff({
      transport,
      handoff: consumed,
      targetMachine: DEVELOPER_WORKSPACE_ONLINE_MACHINE,
      consumerSession: DEVELOPER_WORKSPACE_READY_SESSION,
      online: true,
      idempotency,
    });
    expect(again).toEqual({
      ok: false,
      state: {
        kind: "unavailable",
        capability: "developer.handoffs_v1",
        reason: "handoff_not_issued",
      },
    });
    expect(requests).toHaveLength(2);
  });
});

describe("M2.4.3 — cache holds non-sensitive refs + capturedAt only; nothing revoked comes back", () => {
  it("accepts a refs + capturedAt record and rejects secrets, prompts, paths and unsafe keys", () => {
    expect(
      assertDeveloperWorkspaceSafeToPersist({
        machineRef: DEVELOPER_WORKSPACE_ONLINE_MACHINE.machineRef,
        sessionRef: DEVELOPER_WORKSPACE_READY_SESSION.sessionRef,
        approvalRef: DEVELOPER_WORKSPACE_PENDING_APPROVAL.approvalRef,
        capturedAt: T1,
      }),
    ).toEqual({ ok: true });
    for (const record of [
      { approvalRef: "apr_1", token: "jwt" },
      { approvalRef: "apr_1", prompt: "run the tests" },
      { approvalRef: "apr_1", plaintext: "rm -rf" },
      { sessionRef: "ses_1", workspace: { path: "/home/dev/repo" } },
      { sessionRef: "ses_1", label: "C:\\Users\\dev\\repo" },
    ]) {
      expect(assertDeveloperWorkspaceSafeToPersist(record).ok).toBe(false);
    }
    expect(developerWorkspaceCacheKey(["work", "agent-1", "apr_1"])).toEqual({
      ok: true,
      key: "work:agent-1:apr_1",
    });
    expect(developerWorkspaceCacheKey(["work", "Bearer abc"]).ok).toBe(false);
    expect(developerWorkspaceCacheKey(["work", "/home/dev"]).ok).toBe(false);
  });

  it("the live snapshot is authoritative: an approval revoked server-side is gone on the next read", async () => {
    let pending: unknown[] = [DEVELOPER_WORKSPACE_PENDING_APPROVAL];
    const { transport } = spyTransport((req) => {
      if (req.path === "/v1/developer/machines")
        return { status: 200, json: ok({ items: [DEVELOPER_WORKSPACE_ONLINE_MACHINE] }) };
      if (req.path.endsWith("/sessions"))
        return { status: 200, json: ok({ items: [DEVELOPER_WORKSPACE_READY_SESSION] }) };
      if (req.path === "/v1/developer/approvals") return { status: 200, json: ok({ items: pending }) };
      throw new Error(`unexpected ${req.path}`);
    });
    const load = () =>
      loadDeveloperWorkspaceSnapshot({
        agentId: DEVELOPER_WORKSPACE_FIXTURE_AGENT_ID,
        flagEnabled: true,
        authenticated: true,
        online: true,
        mode: "api",
        transport,
      });

    const before = await load();
    expect(before.approvals.kind).toBe("ready");
    if (before.approvals.kind === "ready") expect(before.approvals.data).toHaveLength(1);

    pending = [];
    const after = await load();
    expect(after.approvals.kind).toBe("ready");
    if (after.approvals.kind === "ready") expect(after.approvals.data).toHaveLength(0);
    expect(after.meta.source).toBe("api");
  });
});
