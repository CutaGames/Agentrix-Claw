import {
  DEVELOPER_REMOTE_WORKSPACE_CANONICALIZATION,
  DEVELOPER_REMOTE_WORKSPACE_SCHEMA_VERSION,
  type DeveloperApprovalDecisionV1,
  type DeveloperApprovalRequestV1,
} from "../../shared/types/developer-remote-workspace";
import { computeDigest } from "../../shared/types/trust-loop-primitives";
import type {
  DeveloperWorkspaceTransport,
  DeveloperWorkspaceTransportRequest,
  DeveloperWorkspaceTransportResponse,
} from "./developerWorkspaceAuth";
import {
  DEVELOPER_WORKSPACE_API_BASE,
  DEVELOPER_WORKSPACE_PENDING_APPROVAL,
} from "./developerWorkspaceFixtures";

/**
 * In-memory fixture backend for the approval inbox — M2 slice B4.
 *
 * `WorkApprovals { fixture: '1' }` runs the *same* chain as live
 * (re-auth → fresh read → digest → decision → read-back) against this
 * transport, so the Maestro flow 91 can walk a decision to its read-back copy
 * without a backend. It is a test harness, clearly labelled as such by the
 * fixture banner, and it never leaks into api mode: the screen only builds it
 * when the route says `fixture=1`.
 *
 * Behaviour mirrors the backend contract closely enough for the client-side
 * validators to accept every answer:
 * - GET  /approvals[?approvalRef=]  → the current record for `approval-1`
 * - POST /approvals/:ref/decisions  → first decision wins; the same body is
 *   replayed idempotently; a different body afterwards is 409
 *   `approval_already_decided`; a stale digest / version is 409.
 * - everything else                 → 404 `not_found`
 *
 * The clock is the fixture clock (`DEVELOPER_WORKSPACE_FIXTURE_NOW`), inside
 * the fixture request's [issuedAt, expiresAt) window, so the decision record
 * validates against the request exactly like a live one.
 */

export const DEVELOPER_WORKSPACE_FIXTURE_NOW = "2026-08-22T10:02:00.000Z";

const APPROVALS_PATH = `${DEVELOPER_WORKSPACE_API_BASE}/approvals`;
const DECISION_PATH = new RegExp(
  `^${DEVELOPER_WORKSPACE_API_BASE.replace(/\//g, "\\/")}\\/approvals\\/([A-Za-z0-9][A-Za-z0-9._~-]{0,127})\\/decisions$`,
);

type DecisionBody = {
  expectedApprovalVersion?: unknown;
  requestDigest?: { algorithm?: unknown; canonicalization?: unknown; value?: unknown };
  decision?: unknown;
  grantScope?: unknown;
  grantExpiresAt?: unknown;
  reasonCode?: unknown;
};

function fixtureDigest(seed: string) {
  return {
    algorithm: "sha-256" as const,
    canonicalization: DEVELOPER_REMOTE_WORKSPACE_CANONICALIZATION,
    value: computeDigest({ fixture: seed }).value,
  };
}

function ok(data: unknown): DeveloperWorkspaceTransportResponse {
  return { status: 200, json: { success: true, data } };
}

function fail(
  status: number,
  reason: string,
): DeveloperWorkspaceTransportResponse {
  return {
    status,
    json: {
      success: false,
      error: { code: reason, reason, retriable: false },
    },
  };
}

export type DeveloperWorkspaceFixtureTransportOptions = {
  /** Route agent the fixture pack is scoped to; approvals carry no agentId, so this is informational. */
  agentId?: string;
  /** Fixture clock used for `decidedAt`. Defaults to `DEVELOPER_WORKSPACE_FIXTURE_NOW`. */
  now?: string;
  /** Test hook: answer a request yourself; return `undefined` to fall through. */
  intercept?: (
    request: DeveloperWorkspaceTransportRequest,
  ) => DeveloperWorkspaceTransportResponse | undefined;
};

export type DeveloperWorkspaceFixtureTransport = {
  request: DeveloperWorkspaceTransport;
  /** Current record for the fixture approval (pending request or terminal decision). */
  current(): DeveloperApprovalRequestV1 | DeveloperApprovalDecisionV1;
  /** Requests seen so far, in order — for tests asserting request counts. */
  requests(): DeveloperWorkspaceTransportRequest[];
  reset(): void;
};

export function buildFixtureApprovalDecision(input: {
  request: DeveloperApprovalRequestV1;
  body: {
    decision: "approved" | "rejected";
    grantScope?: "once" | "session";
    grantExpiresAt?: string;
    reasonCode?: string;
  };
  now: string;
}): DeveloperApprovalDecisionV1 {
  const { request, body } = input;
  const base = {
    schemaVersion: DEVELOPER_REMOTE_WORKSPACE_SCHEMA_VERSION,
    contractType: "developer_approval_decision" as const,
    decisionRef: `decision-${request.approvalRef}`,
    approvalRef: request.approvalRef,
    approvalVersion: request.approvalVersion,
    previousStatus: "pending" as const,
    decisionSequence: 1 as const,
    instructionRef: request.instructionRef,
    actionRef: request.actionRef,
    sessionRef: request.sessionRef,
    sessionVersion: request.sessionVersion,
    adapterSessionRef: request.adapterSessionRef,
    adapterRequestRef: request.adapterRequestRef,
    requestDigest: request.requestDigest,
    instructionRequestDigest: request.instructionRequestDigest,
    toolArgumentsDigest: request.toolArgumentsDigest,
    workspaceScopeDigest: request.workspaceScopeDigest,
    decidedAt: input.now,
    decisionDigest: fixtureDigest(`decision:${request.approvalRef}:${body.decision}`),
    authorityDecisionRef: {
      type: "authority_decision" as const,
      id: `authority-decision-${request.approvalRef}`,
      version: 1,
      digest: fixtureDigest(`authority-decision:${request.approvalRef}`),
    },
  };
  if (body.decision === "rejected") {
    return {
      ...base,
      decision: "rejected",
      resultingStatus: "rejected",
      decidedByRef: "principal-1",
      reasonCode: body.reasonCode ?? "owner_rejected",
    };
  }
  return {
    ...base,
    decision: "approved",
    resultingStatus: "approved",
    decidedByRef: "principal-1",
    grantScope: body.grantScope ?? "once",
    grantExpiresAt: body.grantExpiresAt ?? request.expiresAt,
    authorityGrantRef: {
      type: "authority_grant" as const,
      id: `authority-grant-${request.approvalRef}`,
      version: 1,
      digest: fixtureDigest(`authority-grant:${request.approvalRef}`),
    },
    ...(request.requiresLocalConfirmation
      ? { localConfirmationRef: `local-confirmation-${request.approvalRef}` }
      : {}),
  };
}

const shared = new Map<string, DeveloperWorkspaceFixtureTransport>();

/**
 * One fixture backend per agent scope for the lifetime of the JS runtime, so
 * re-opening a fixture approval after deciding it shows the terminal record
 * (read-only) exactly like the live backend would. Tests use
 * `createDeveloperWorkspaceFixtureTransport` directly for isolation.
 */
export function getSharedDeveloperWorkspaceFixtureTransport(
  agentId: string | undefined,
): DeveloperWorkspaceFixtureTransport {
  const key = agentId ?? "";
  let existing = shared.get(key);
  if (!existing) {
    existing = createDeveloperWorkspaceFixtureTransport({ agentId });
    shared.set(key, existing);
  }
  return existing;
}

export function createDeveloperWorkspaceFixtureTransport(
  options: DeveloperWorkspaceFixtureTransportOptions = {},
): DeveloperWorkspaceFixtureTransport {
  const now = options.now ?? DEVELOPER_WORKSPACE_FIXTURE_NOW;
  const pending: DeveloperApprovalRequestV1 = {
    ...(DEVELOPER_WORKSPACE_PENDING_APPROVAL as DeveloperApprovalRequestV1),
  };
  let current: DeveloperApprovalRequestV1 | DeveloperApprovalDecisionV1 = pending;
  let decidedWithKey: string | undefined;
  let decidedBodyDigest: string | undefined;
  const seen: DeveloperWorkspaceTransportRequest[] = [];

  const request: DeveloperWorkspaceTransport = async (input) => {
    seen.push(input);
    const intercepted = options.intercept?.(input);
    if (intercepted) return intercepted;

    if (input.method === "GET" && input.path === APPROVALS_PATH) {
      const wanted = input.query?.approvalRef;
      if (wanted && wanted !== pending.approvalRef) return ok({ items: [] });
      return ok({ items: [current] });
    }

    const decisionMatch =
      input.method === "POST" ? DECISION_PATH.exec(input.path) : null;
    if (decisionMatch) {
      const approvalRef = decisionMatch[1];
      if (approvalRef !== pending.approvalRef) return fail(404, "not_found");
      const body = (input.body ?? {}) as DecisionBody;
      const bodyDigest = computeDigest(body).value;

      if (current.contractType === "developer_approval_decision") {
        // Same body (or same Idempotency-Key) → idempotent receipt; anything
        // else against a terminal approval is a conflict (M2.2.4).
        if (
          bodyDigest === decidedBodyDigest ||
          (input.idempotencyKey && input.idempotencyKey === decidedWithKey)
        ) {
          return ok(current);
        }
        return fail(409, "approval_already_decided");
      }
      if (body.expectedApprovalVersion !== pending.approvalVersion) {
        return fail(409, "approval_version_mismatch");
      }
      if (
        !body.requestDigest ||
        body.requestDigest.algorithm !== pending.requestDigest.algorithm ||
        body.requestDigest.canonicalization !==
          pending.requestDigest.canonicalization ||
        body.requestDigest.value !== pending.requestDigest.value
      ) {
        return fail(409, "request_digest_mismatch");
      }
      if (body.decision !== "approved" && body.decision !== "rejected") {
        return fail(400, "invalid_decision");
      }
      if (Date.parse(now) >= Date.parse(pending.expiresAt)) {
        return fail(409, "approval_expired");
      }
      const decision = buildFixtureApprovalDecision({
        request: pending,
        body: {
          decision: body.decision,
          grantScope:
            body.grantScope === "session" || body.grantScope === "once"
              ? body.grantScope
              : undefined,
          grantExpiresAt:
            typeof body.grantExpiresAt === "string"
              ? body.grantExpiresAt
              : undefined,
          reasonCode:
            typeof body.reasonCode === "string" ? body.reasonCode : undefined,
        },
        now,
      });
      current = decision;
      decidedWithKey = input.idempotencyKey;
      decidedBodyDigest = bodyDigest;
      return ok(current);
    }

    return fail(404, "not_found");
  };

  return {
    request,
    current: () => current,
    requests: () => seen.slice(),
    reset: () => {
      current = pending;
      decidedWithKey = undefined;
      decidedBodyDigest = undefined;
      seen.length = 0;
    },
  };
}
