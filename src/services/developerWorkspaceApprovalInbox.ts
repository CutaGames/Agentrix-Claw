import {
  validateDeveloperApprovalDecisionAgainstRequestV1,
  type DeveloperApprovalDecisionV1,
  type DeveloperApprovalRequestV1,
} from "../../shared/types/developer-remote-workspace";
import {
  decideDeveloperApproval,
  loadFreshDeveloperApproval,
} from "./developerWorkspaceApprovals";
import type { DeveloperWorkspaceTransport } from "./developerWorkspaceAuth";
import type { DeveloperWorkspaceIdempotencyStore } from "./developerWorkspaceControl";
import type { DeveloperWorkspaceLiveFailure } from "./developerWorkspaceLiveClient";

/**
 * Quick approval inbox — M2.2 (MTR-R10), decision d-50.
 *
 * One chain, always in this order, never shortened:
 *
 *   push / in-app open → re-authenticate → fresh read → exact digest →
 *   decision → authoritative read-back
 *
 * Rules this module enforces (M2.2.2 / M2.2.3 / M2.2.4):
 * - Nothing shown to the user comes from the request we sent. The only thing
 *   that can produce `decided` is a decision record the backend handed back
 *   on the read-back GET. A 2xx on the POST alone never does.
 * - A timeout is an unknown outcome, not a success and not a failure: it is
 *   followed by a read-back, and if that is unreachable too the result is
 *   `blocked · decision_outcome_unknown` with "re-read" as the only action.
 * - Terminal approvals are read-only. Opening one lands on
 *   `terminal_read_only`; deciding one is refused locally with zero requests.
 * - Expired, revoked / deleted (404), unknown risk (validator failure) and any
 *   shape the contract validators reject all fail closed.
 *
 * Everything here is transport-agnostic so the same chain runs against the
 * live transport, the in-memory fixture transport and the jest mocks.
 */

export const DEVELOPER_APPROVAL_INBOX_TIMEOUT_MS = 15_000;

/** Tokens that expire inside this window are treated as already expired. */
export const DEVELOPER_APPROVAL_REAUTH_SKEW_MS = 30_000;

export type DeveloperApprovalInboxDecision = "approved" | "rejected";

export type DeveloperApprovalInboxSource = "api" | "fixture";

export type DeveloperApprovalInboxBlockedReason =
  | "authentication_required"
  | "session_expired"
  | "approval_not_found"
  | "approval_expired"
  | "approval_not_pending"
  | "request_digest_mismatch"
  | "client_offline"
  | "read_timeout"
  | "decision_timeout"
  | "decision_not_recorded"
  | "decision_outcome_unknown"
  | "read_back_failed_closed"
  | "unknown_risk_failed_closed"
  | string;

export type DeveloperApprovalInboxState =
  | { phase: "idle" }
  | { phase: "reauthenticating" }
  | { phase: "reading"; approvalRef: string }
  | {
      phase: "pending";
      approval: DeveloperApprovalRequestV1;
      capturedAt: string;
      source: DeveloperApprovalInboxSource;
      /** Set when a re-read (e.g. after returning from background) found a different request. */
      notice?: "request_changed_reread";
    }
  | {
      phase: "deciding";
      approval: DeveloperApprovalRequestV1;
      decision: DeveloperApprovalInboxDecision;
    }
  | {
      phase: "reading_back";
      approval: DeveloperApprovalRequestV1;
      decision: DeveloperApprovalInboxDecision;
    }
  | {
      /** L3 / requiresLocalConfirmation: the backend keeps the request pending until Desktop confirms locally. */
      phase: "awaiting_desktop";
      approval: DeveloperApprovalRequestV1;
      decision: "approved";
      readBackAt: string;
      source: DeveloperApprovalInboxSource;
    }
  | {
      /** Terminal record returned by the authoritative read-back after our decision. */
      phase: "decided";
      approval: DeveloperApprovalDecisionV1;
      readBackAt: string;
      source: DeveloperApprovalInboxSource;
    }
  | {
      /** The approval was already terminal when we read it; no decision is possible. */
      phase: "terminal_read_only";
      approval: DeveloperApprovalDecisionV1;
      capturedAt: string;
      source: DeveloperApprovalInboxSource;
    }
  | {
      phase: "blocked";
      reason: DeveloperApprovalInboxBlockedReason;
      failure: DeveloperWorkspaceLiveFailure;
      /** Whether "re-read" is a sensible next action (it never re-sends a decision). */
      canReread: boolean;
      approval?: DeveloperApprovalRequestV1;
    };

/** The only phase from which a decision may be sent (in-flight guard + monotonicity). */
export function canDecideDeveloperApproval(
  state: DeveloperApprovalInboxState,
): state is Extract<DeveloperApprovalInboxState, { phase: "pending" }> {
  return state.phase === "pending";
}

/** Phases in which a request is in flight; the UI must not start another. */
export function developerApprovalInboxBusy(
  state: DeveloperApprovalInboxState,
): boolean {
  return (
    state.phase === "reauthenticating" ||
    state.phase === "reading" ||
    state.phase === "deciding" ||
    state.phase === "reading_back"
  );
}

// ── Re-authentication ────────────────────────────────────────────────────────

export type DeveloperWorkspaceReauthResult =
  | { ok: true; token: string }
  | {
      ok: false;
      reason: "authentication_required" | "session_expired";
    };

/**
 * Reads `exp` (seconds) from a JWT payload without verifying the signature —
 * verification is the backend's job; this only decides whether a token is
 * worth sending at all. Non-JWT tokens (e.g. the Maestro seed) return null.
 */
export function readJwtExpiryMs(token: string): number | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  try {
    const payload = decodeBase64Url(parts[1]);
    const parsed = JSON.parse(payload) as { exp?: unknown };
    if (typeof parsed.exp !== "number" || !Number.isFinite(parsed.exp))
      return null;
    return parsed.exp * 1000;
  } catch {
    return null;
  }
}

function decodeBase64Url(input: string): string {
  const base64 = input.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
  if (typeof Buffer !== "undefined") {
    return Buffer.from(padded, "base64").toString("utf8");
  }
  const binary = atob(padded);
  let out = "";
  for (let i = 0; i < binary.length; i += 1) {
    out += `%${binary.charCodeAt(i).toString(16).padStart(2, "0")}`;
  }
  return decodeURIComponent(out);
}

/**
 * MTR-R10.1 step one. The token is read *now* by the caller (never the one
 * captured when the push arrived or when the screen mounted); an expired or
 * missing token is never reused — the chain stops before any read.
 *
 * `verify` is an optional server-side check (e.g. GET /auth/me). "invalid"
 * fails closed; "unknown" (network) lets the fresh read be the authority — it
 * answers 401 on its own if the token is dead.
 */
export async function reauthenticateDeveloperWorkspace(input: {
  token: string | null | undefined;
  now: string;
  skewMs?: number;
  verify?: (token: string) => Promise<"valid" | "invalid" | "unknown">;
}): Promise<DeveloperWorkspaceReauthResult> {
  const token =
    typeof input.token === "string" && input.token.trim().length > 0
      ? input.token.trim()
      : null;
  if (!token) return { ok: false, reason: "authentication_required" };
  const expiresAt = readJwtExpiryMs(token);
  const skew = input.skewMs ?? DEVELOPER_APPROVAL_REAUTH_SKEW_MS;
  if (expiresAt !== null && expiresAt <= Date.parse(input.now) + skew) {
    return { ok: false, reason: "session_expired" };
  }
  if (input.verify) {
    let verdict: "valid" | "invalid" | "unknown" = "unknown";
    try {
      verdict = await input.verify(token);
    } catch {
      verdict = "unknown";
    }
    if (verdict === "invalid")
      return { ok: false, reason: "authentication_required" };
  }
  return { ok: true, token };
}

export function developerApprovalInboxAuthBlocked(
  reason: "authentication_required" | "session_expired",
): DeveloperApprovalInboxState {
  return {
    phase: "blocked",
    reason,
    failure: { kind: "unauthorized", reason },
    canReread: true,
  };
}

// ── Timeouts ─────────────────────────────────────────────────────────────────

const TIMEOUT = Symbol("developer_approval_inbox_timeout");

async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
): Promise<T | typeof TIMEOUT> {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) return promise;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<typeof TIMEOUT>((resolve) => {
    timer = setTimeout(() => resolve(TIMEOUT), timeoutMs);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

// ── Fresh read ───────────────────────────────────────────────────────────────

export type OpenDeveloperApprovalInboxInput = {
  transport: DeveloperWorkspaceTransport;
  approvalRef: string;
  agentId?: string;
  now: string;
  source?: DeveloperApprovalInboxSource;
  timeoutMs?: number;
  /** The pending request the user was last shown; a changed digest is surfaced as a notice. */
  previous?: DeveloperApprovalRequestV1;
};

function isDecisionRecord(
  record: DeveloperApprovalRequestV1 | DeveloperApprovalDecisionV1,
): record is DeveloperApprovalDecisionV1 {
  return record.contractType === "developer_approval_decision";
}

function digestValue(
  record: DeveloperApprovalRequestV1 | DeveloperApprovalDecisionV1,
): string {
  return `${record.requestDigest.algorithm}:${record.requestDigest.canonicalization}:${record.requestDigest.value}`;
}

/**
 * MTR-R10.1 steps two and three: fresh read, then classify. The payload that
 * opened the screen (push data, route params) is a routing hint only — the
 * request the user decides on is the one this read returned.
 */
export async function openDeveloperApprovalInbox(
  input: OpenDeveloperApprovalInboxInput,
): Promise<DeveloperApprovalInboxState> {
  const source = input.source ?? "api";
  const read = await withTimeout(
    loadFreshDeveloperApproval({
      transport: input.transport,
      approvalRef: input.approvalRef,
      agentId: input.agentId,
    }),
    input.timeoutMs ?? DEVELOPER_APPROVAL_INBOX_TIMEOUT_MS,
  );
  if (read === TIMEOUT) {
    return {
      phase: "blocked",
      reason: "read_timeout",
      failure: { kind: "unknown", reason: "read_timeout" },
      canReread: true,
    };
  }
  if (read.ok === false) {
    return blockedFromFailure(read.state);
  }
  const record = read.data;
  if (isDecisionRecord(record)) {
    return {
      phase: "terminal_read_only",
      approval: record,
      capturedAt: read.capturedAt,
      source,
    };
  }
  if (record.status !== "pending") {
    // The validator only admits `pending` requests; anything else is a contract breach.
    return {
      phase: "blocked",
      reason: "approval_not_pending",
      failure: {
        kind: "error",
        reason: "approval_not_pending",
        retryable: false,
      },
      canReread: true,
    };
  }
  if (Date.parse(input.now) >= Date.parse(record.expiresAt)) {
    return {
      phase: "blocked",
      reason: "approval_expired",
      failure: {
        kind: "unavailable",
        capability: "developer.approvals_v1",
        reason: "approval_expired",
      },
      canReread: true,
      approval: record,
    };
  }
  const changed =
    input.previous !== undefined &&
    (digestValue(input.previous) !== digestValue(record) ||
      input.previous.approvalVersion !== record.approvalVersion);
  return {
    phase: "pending",
    approval: record,
    capturedAt: read.capturedAt,
    source,
    ...(changed ? { notice: "request_changed_reread" as const } : {}),
  };
}

function blockedFromFailure(
  failure: DeveloperWorkspaceLiveFailure,
): DeveloperApprovalInboxState {
  if (failure.kind === "unauthorized") {
    if (failure.reason === "developer_not_found") {
      // 403 / 404 are one non-enumerating answer: revoked, deleted or never ours.
      return {
        phase: "blocked",
        reason: "approval_not_found",
        failure,
        canReread: true,
      };
    }
    return {
      phase: "blocked",
      reason: "authentication_required",
      failure,
      canReread: true,
    };
  }
  if (failure.kind === "unknown" && failure.reason === "client_offline") {
    return {
      phase: "blocked",
      reason: "client_offline",
      failure,
      canReread: true,
    };
  }
  return {
    phase: "blocked",
    reason: failure.reason,
    failure,
    canReread: true,
  };
}

// ── Decision + authoritative read-back ───────────────────────────────────────

export type DecideDeveloperApprovalWithReadBackInput = {
  transport: DeveloperWorkspaceTransport;
  approval: DeveloperApprovalRequestV1;
  decision: DeveloperApprovalInboxDecision;
  now: string;
  online: boolean;
  idempotency: DeveloperWorkspaceIdempotencyStore;
  agentId?: string;
  source?: DeveloperApprovalInboxSource;
  timeoutMs?: number;
  /** UI hook: the POST has been sent (or timed out) and the read-back is starting. */
  onReadingBack?: () => void;
};

/**
 * MTR-R10.1 steps four and five. Returns only states that the backend's
 * read-back justifies:
 *
 * - `decided`             read-back returned a terminal record bound to this request
 * - `awaiting_desktop`    L3: read-back still pending after an accepted approval
 * - `terminal_read_only`  read-back returned a terminal record that is not what we asked
 *                         for (revoked / expired / superseded / conflicting decision)
 * - `blocked`             everything else, with a reason; never "approved"
 */
export async function decideDeveloperApprovalWithReadBack(
  input: DecideDeveloperApprovalWithReadBackInput,
): Promise<DeveloperApprovalInboxState> {
  const timeoutMs = input.timeoutMs ?? DEVELOPER_APPROVAL_INBOX_TIMEOUT_MS;
  const approval = input.approval;

  // M2.2.4 — terminal state is never written twice. Zero requests.
  if (approval.status !== "pending") {
    return {
      phase: "blocked",
      reason: "approval_not_pending",
      failure: {
        kind: "error",
        reason: "approval_not_pending",
        retryable: false,
      },
      canReread: true,
    };
  }
  if (input.online !== true) {
    return {
      phase: "blocked",
      reason: "client_offline",
      failure: { kind: "unknown", reason: "client_offline" },
      canReread: true,
      approval,
    };
  }
  // Expired on our clock: no decision is sent; the read-back tells us what the
  // backend did with it (usually an `expired` terminal record).
  if (Date.parse(input.now) >= Date.parse(approval.expiresAt)) {
    return readBack(input, approval, input.decision, {
      kind: "unavailable",
      capability: "developer.approvals_v1",
      reason: "approval_expired",
    });
  }

  const posted = await withTimeout(
    decideDeveloperApproval({
      transport: input.transport,
      approval,
      decision: input.decision,
      requestDigest: approval.requestDigest,
      online: input.online,
      now: input.now,
      idempotency: input.idempotency,
    }),
    timeoutMs,
  );

  if (posted === TIMEOUT) {
    // Unknown outcome — the backend may or may not have recorded it. Only the
    // read-back can say; a second POST is never sent from here.
    return readBack(input, approval, input.decision, {
      kind: "unknown",
      reason: "decision_timeout",
    });
  }
  if (posted.ok === false) {
    const failure = posted.state;
    // Local refusals: nothing left the device, so there is nothing to read back.
    if (failure.kind === "unknown" && failure.reason === "client_offline") {
      return {
        phase: "blocked",
        reason: "client_offline",
        failure,
        canReread: true,
        approval,
      };
    }
    if (
      failure.kind === "error" &&
      (failure.reason === "request_digest_mismatch" ||
        failure.reason === "approval_not_pending")
    ) {
      return {
        phase: "blocked",
        reason: failure.reason,
        failure,
        canReread: true,
        approval,
      };
    }
    // Anything the backend answered (409 conflict, 401, 503, fail-closed
    // validation) or a transport error: learn the truth from the read-back.
    return readBack(input, approval, input.decision, failure);
  }

  // POST accepted. Still nothing is shown until the read-back agrees.
  return readBack(input, approval, input.decision, null);
}

async function readBack(
  input: DecideDeveloperApprovalWithReadBackInput,
  approval: DeveloperApprovalRequestV1,
  decision: DeveloperApprovalInboxDecision,
  postFailure: DeveloperWorkspaceLiveFailure | null,
): Promise<DeveloperApprovalInboxState> {
  const source = input.source ?? "api";
  const timeoutMs = input.timeoutMs ?? DEVELOPER_APPROVAL_INBOX_TIMEOUT_MS;
  input.onReadingBack?.();
  const read = await withTimeout(
    loadFreshDeveloperApproval({
      transport: input.transport,
      approvalRef: approval.approvalRef,
      agentId: input.agentId,
    }),
    timeoutMs,
  );
  if (read === TIMEOUT) {
    return {
      phase: "blocked",
      reason: "decision_outcome_unknown",
      failure: { kind: "unknown", reason: "decision_outcome_unknown" },
      canReread: true,
      approval,
    };
  }
  if (read.ok === false) {
    if (read.state.kind === "unauthorized") {
      // 403 / 404: the approval is gone (revoked / deleted / not ours) — fail
      // closed. 401: the session died between the POST and the read-back.
      return read.state.reason === "developer_not_found"
        ? {
            phase: "blocked",
            reason: "approval_not_found",
            failure: read.state,
            canReread: true,
          }
        : {
            phase: "blocked",
            reason: "authentication_required",
            failure: read.state,
            canReread: true,
            approval,
          };
    }
    // The read-back itself failed: the outcome is unknown. If the POST already
    // reported a concrete backend refusal, surface that reason instead.
    return postFailure !== null && postFailure.kind !== "unknown"
      ? {
          phase: "blocked",
          reason: postFailure.reason,
          failure: postFailure,
          canReread: true,
          approval,
        }
      : {
          phase: "blocked",
          reason: "decision_outcome_unknown",
          failure: { kind: "unknown", reason: "decision_outcome_unknown" },
          canReread: true,
          approval,
        };
  }
  const record = read.data;
  if (isDecisionRecord(record)) {
    const exact = validateDeveloperApprovalDecisionAgainstRequestV1(
      record,
      approval,
    );
    if (!exact.valid) {
      return {
        phase: "blocked",
        reason: "read_back_failed_closed",
        failure: {
          kind: "error",
          reason: "read_back_failed_closed",
          retryable: false,
        },
        canReread: true,
        approval,
      };
    }
    if (record.decision === decision) {
      return {
        phase: "decided",
        approval: record,
        readBackAt: read.capturedAt,
        source,
      };
    }
    // The backend closed it differently (expired / cancelled / superseded / the
    // other decision won a race). Show its truth, read-only.
    return {
      phase: "terminal_read_only",
      approval: record,
      capturedAt: read.capturedAt,
      source,
    };
  }
  // Still pending after our decision.
  const l3 = approval.risk === "L3" || approval.requiresLocalConfirmation === true;
  if (l3 && decision === "approved" && postFailure === null) {
    return {
      phase: "awaiting_desktop",
      approval: record,
      decision: "approved",
      readBackAt: read.capturedAt,
      source,
    };
  }
  if (postFailure) {
    return {
      phase: "blocked",
      reason:
        postFailure.kind === "unknown" ? "decision_outcome_unknown" : postFailure.reason,
      failure: postFailure,
      canReread: true,
      approval: record,
    };
  }
  // POST said 2xx but the backend still shows pending and this is not L3:
  // the decision was not recorded. Not a success.
  return {
    phase: "blocked",
    reason: "decision_not_recorded",
    failure: { kind: "unknown", reason: "decision_not_recorded" },
    canReread: true,
    approval: record,
  };
}

/** User-facing lead copy per phase; never says "approved" outside `decided`. */
export function describeDeveloperApprovalInbox(
  state: DeveloperApprovalInboxState,
  zh: boolean,
): string {
  switch (state.phase) {
    case "idle":
      return zh ? "等待打开审批。" : "Waiting to open the approval.";
    case "reauthenticating":
      return zh ? "正在重新鉴权…" : "Re-authenticating…";
    case "reading":
      return zh ? "正在从服务端刷新读取审批…" : "Fresh-reading the approval from the backend…";
    case "pending":
      return state.notice === "request_changed_reread"
        ? zh
          ? "请求内容已变化，已按最新内容重新读取；请重新确认后再决定。"
          : "The request changed; it was re-read. Review it again before deciding."
        : zh
          ? "以下内容来自刚刚的刷新读取；决定只对这一版摘要生效。"
          : "Shown from the fresh read just now; a decision applies to exactly this digest.";
    case "deciding":
      return zh
        ? "正在提交决定…（提交本身不算结果）"
        : "Submitting the decision… (the submit itself is not the result)";
    case "reading_back":
      return zh
        ? "已提交，等待服务端回读；回读之前不显示结果。"
        : "Submitted; waiting for the authoritative read-back. No result is shown before it.";
    case "awaiting_desktop":
      return zh
        ? "服务端回读：仍为待确认 —— L3 需要 Desktop 本机确认，Mobile 不会本地继续。"
        : "Read-back: still pending — L3 waits for Desktop local confirmation. Mobile never continues locally.";
    case "decided":
      return zh
        ? `服务端回读：${state.approval.decision}（authoritative read-back）。`
        : `Read-back from the backend: ${state.approval.decision} (authoritative).`;
    case "terminal_read_only":
      return zh
        ? `该审批已是终态（${state.approval.decision}），不可再次决策。`
        : `This approval is terminal (${state.approval.decision}); no further decision is possible.`;
    case "blocked":
      return zh
        ? `未落决策：${state.reason}。没有替你批准任何事。`
        : `No decision recorded: ${state.reason}. Nothing was approved on your behalf.`;
    default:
      return "";
  }
}
