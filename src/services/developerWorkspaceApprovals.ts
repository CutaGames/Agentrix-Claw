import {
  evaluateDeveloperApprovalDecisionReplayV1,
  validateDeveloperApprovalDecisionAgainstRequestV1,
  validateDeveloperApprovalDecisionV1,
  validateDeveloperApprovalRequestV1,
  type DeveloperApprovalDecisionV1,
  type DeveloperApprovalRequestV1,
} from "../../shared/types/developer-remote-workspace";
import { computeDigest } from "../../shared/types/trust-loop-primitives";
import type { DeveloperWorkspaceTransport } from "./developerWorkspaceAuth";
import {
  DEVELOPER_WORKSPACE_API_PATHS,
  developerWorkspaceMutate,
  getDeveloperApprovalExact,
  type DeveloperWorkspaceLiveFailure,
  type DeveloperWorkspaceLiveResult,
} from "./developerWorkspaceLiveClient";
import type { DeveloperWorkspaceIdempotencyStore } from "./developerWorkspaceControl";
import { parseDeveloperWorkspaceOpenRoute } from "./developerWorkspaceOpenRoute";
import {
  assertDeveloperWorkspaceSafeToPersist,
  queueDeveloperWorkspaceMutation,
} from "./developerWorkspacePersistence";

const OPAQUE_REF = /^[A-Za-z0-9][A-Za-z0-9._~-]{0,127}$/;

export type DeveloperApprovalPushFailureReason =
  | "unsafe_parameter"
  | "invalid_identifier"
  | "unknown_field"
  | "empty_input";

export type DeveloperApprovalPushResult =
  | { ok: true; approvalRef: string }
  | { ok: false; reason: DeveloperApprovalPushFailureReason };

export type DeveloperApprovalPushDestinationResult =
  | {
      ok: true;
      root: "Main";
      tab: "Work";
      screen: "WorkApprovals";
      params: { approvalRef: string; source: "push" };
    }
  | { ok: false; reason: DeveloperApprovalPushFailureReason };

export function parseDeveloperWorkspacePushPayload(
  input: unknown,
): DeveloperApprovalPushResult {
  if (input == null || typeof input !== "object" || Array.isArray(input)) {
    return { ok: false, reason: "empty_input" };
  }
  const persist = assertDeveloperWorkspaceSafeToPersist(input, "push");
  if (persist.ok === false) return { ok: false, reason: "unsafe_parameter" };
  const record = input as Record<string, unknown>;
  const keys = Object.keys(record).filter((key) => record[key] !== undefined);
  if (keys.some((key) => key !== "approvalRef")) {
    return { ok: false, reason: "unknown_field" };
  }
  const approvalRef = record.approvalRef;
  if (typeof approvalRef !== "string" || !OPAQUE_REF.test(approvalRef)) {
    return { ok: false, reason: "invalid_identifier" };
  }
  return { ok: true, approvalRef };
}

export function resolveDeveloperApprovalPushDestination(
  input: unknown,
): DeveloperApprovalPushDestinationResult {
  const parsed = parseDeveloperWorkspacePushPayload(input);
  if (parsed.ok === false) return parsed;
  return {
    ok: true,
    root: "Main",
    tab: "Work",
    screen: "WorkApprovals",
    params: {
      approvalRef: parsed.approvalRef,
      source: "push",
    },
  };
}

export function developerWorkspaceApprovalRoute(input: {
  agentId: string;
  approvalRef: string;
}) {
  return parseDeveloperWorkspaceOpenRoute(input);
}

export async function loadFreshDeveloperApproval(input: {
  transport: DeveloperWorkspaceTransport;
  approvalRef: string;
  agentId?: string;
}): Promise<
  DeveloperWorkspaceLiveResult<
    DeveloperApprovalRequestV1 | DeveloperApprovalDecisionV1
  >
> {
  return getDeveloperApprovalExact(
    input.transport,
    input.approvalRef,
    input.agentId,
  );
}

export type DeveloperApprovalDecisionInput = {
  transport: DeveloperWorkspaceTransport;
  approval: DeveloperApprovalRequestV1;
  decision: "approved" | "rejected";
  requestDigest?: DeveloperApprovalRequestV1["requestDigest"];
  online: boolean;
  now: string;
  idempotency: DeveloperWorkspaceIdempotencyStore;
};

export type DeveloperApprovalDecisionResult =
  | {
      ok: true;
      approval: DeveloperApprovalRequestV1 | DeveloperApprovalDecisionV1;
      awaitingDesktopConfirmation: boolean;
      completed: false;
    }
  | { ok: false; state: DeveloperWorkspaceLiveFailure };

export async function decideDeveloperApproval(
  input: DeveloperApprovalDecisionInput,
): Promise<DeveloperApprovalDecisionResult> {
  if (input.online !== true) {
    queueDeveloperWorkspaceMutation();
    return { ok: false, state: { kind: "unknown", reason: "client_offline" } };
  }
  if (input.approval.status !== "pending") {
    return {
      ok: false,
      state: {
        kind: "error",
        reason: "approval_not_pending",
        retryable: false,
      },
    };
  }
  const requestDigest = input.requestDigest ?? input.approval.requestDigest;
  if (
    requestDigest.algorithm !== input.approval.requestDigest.algorithm ||
    requestDigest.canonicalization !==
      input.approval.requestDigest.canonicalization ||
    requestDigest.value !== input.approval.requestDigest.value
  ) {
    return {
      ok: false,
      state: {
        kind: "error",
        reason: "request_digest_mismatch",
        retryable: false,
      },
    };
  }
  if (
    Date.parse(input.now) >= Date.parse(input.approval.expiresAt) &&
    input.decision !== "rejected"
  ) {
    return {
      ok: false,
      state: {
        kind: "unavailable",
        capability: "developer.approvals_v1",
        reason: "approval_expired",
      },
    };
  }

  const body =
    input.decision === "approved"
      ? {
          expectedApprovalVersion: input.approval.approvalVersion,
          requestDigest,
          decision: "approved" as const,
          grantScope: "once" as const,
          grantExpiresAt: input.approval.expiresAt,
        }
      : {
          expectedApprovalVersion: input.approval.approvalVersion,
          requestDigest,
          decision: "rejected" as const,
          reasonCode: "owner_rejected",
        };

  const digest = computeDigest(body).value;
  const operation = `approval_decision:${input.approval.approvalRef}`;
  const key = input.idempotency.begin(operation, digest);
  const replayed = input.idempotency.peek(operation, digest);
  if (replayed?.response) {
    return presentDecision(input.approval, replayed.response);
  }

  const decided = await developerWorkspaceMutate<
    DeveloperApprovalRequestV1 | DeveloperApprovalDecisionV1
  >(
    input.transport,
    DEVELOPER_WORKSPACE_API_PATHS.approvalDecision(input.approval.approvalRef),
    body,
    key,
    (raw) => {
      const l3 =
        input.approval.risk === "L3" ||
        input.approval.requiresLocalConfirmation === true;
      const decision = validateDeveloperApprovalDecisionV1(raw);
      if (decision.valid) {
        const exact = validateDeveloperApprovalDecisionAgainstRequestV1(
          raw,
          input.approval,
        );
        return {
          ...exact,
          value: exact.valid ? (raw as DeveloperApprovalDecisionV1) : undefined,
        };
      }
      if (l3) {
        const pending = validateDeveloperApprovalRequestV1(raw);
        const exactPending =
          pending.valid &&
          computeDigest(raw).value === computeDigest(input.approval).value;
        return {
          valid: exactPending,
          errors: exactPending
            ? []
            : pending.errors.concat(
                "approvalRequest: exact pending request mismatch",
              ),
          value: exactPending ? (raw as DeveloperApprovalRequestV1) : undefined,
        };
      }
      return decision;
    },
    "developer.approvals_v1",
  );
  if (decided.ok === false) {
    if (decided.state.kind === "error" && decided.state.retryable) {
      return {
        ok: false,
        state: { kind: "unknown", reason: decided.state.reason },
      };
    }
    if (
      decided.state.kind === "error" &&
      decided.state.reason === "developer_api_unreachable"
    ) {
      return {
        ok: false,
        state: { kind: "unknown", reason: "developer_api_unreachable" },
      };
    }
    return { ok: false, state: decided.state };
  }
  input.idempotency.commit(operation, digest, key, decided.data);
  return presentDecision(input.approval, decided.data);
}

export function replayDeveloperApprovalDecision(
  existing: DeveloperApprovalDecisionV1,
  incoming: DeveloperApprovalDecisionV1,
): "idempotent" | "conflict" {
  return evaluateDeveloperApprovalDecisionReplayV1(existing, incoming);
}

function presentDecision(
  request: DeveloperApprovalRequestV1,
  raw: unknown,
): DeveloperApprovalDecisionResult {
  const decision = validateDeveloperApprovalDecisionV1(raw);
  const l3 =
    request.risk === "L3" || request.requiresLocalConfirmation === true;
  if (l3) {
    if (decision.valid) {
      const exact = validateDeveloperApprovalDecisionAgainstRequestV1(
        raw,
        request,
      );
      if (!exact.valid) {
        return {
          ok: false,
          state: {
            kind: "error",
            reason: "approval_decision_failed_closed",
            retryable: false,
          },
        };
      }
      const terminalDecision = raw as DeveloperApprovalDecisionV1;
      if (terminalDecision.decision === "rejected") {
        return {
          ok: true,
          approval: terminalDecision,
          awaitingDesktopConfirmation: false,
          completed: false,
        };
      }
    } else {
      const pending = validateDeveloperApprovalRequestV1(raw);
      if (
        !pending.valid ||
        computeDigest(raw).value !== computeDigest(request).value
      ) {
        return {
          ok: false,
          state: {
            kind: "error",
            reason: "approval_decision_failed_closed",
            retryable: false,
          },
        };
      }
    }
    return {
      ok: true,
      approval: request,
      awaitingDesktopConfirmation: true,
      completed: false,
    };
  }
  const exact = validateDeveloperApprovalDecisionAgainstRequestV1(raw, request);
  if (!decision.valid || !exact.valid) {
    return {
      ok: false,
      state: {
        kind: "error",
        reason: "approval_decision_failed_closed",
        retryable: false,
      },
    };
  }
  return {
    ok: true,
    approval: raw as DeveloperApprovalDecisionV1,
    awaitingDesktopConfirmation: false,
    completed: false,
  };
}
