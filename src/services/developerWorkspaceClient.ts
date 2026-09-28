import {
  validateDeveloperAdapterCapabilityV1,
  validateDeveloperApprovalRequestV1,
  validateDeveloperMachineProjectionV1,
  validateDeveloperRemoteWorkspaceContractV1,
  validateDeveloperSessionSummaryV1,
  validateDeveloperTerminalResultV1,
} from "../../shared/types/developer-remote-workspace";
import {
  createDeveloperWorkspaceAuthTransport,
  type DeveloperWorkspaceTransport,
} from "./developerWorkspaceAuth";
import {
  evaluateDeveloperMutationCta,
  type DeveloperMutationCtaDecision,
} from "./developerWorkspaceCapability";
import { evaluateDeveloperLiveMutationCta } from "./developerWorkspaceControl";
import {
  DEVELOPER_WORKSPACE_CONTRACT_FIXTURES,
  DEVELOPER_WORKSPACE_FIXTURE_META,
  DEVELOPER_WORKSPACE_FIXTURE_WIRE,
  parseDeveloperWorkspaceFixtureWire,
  scopeDeveloperWorkspaceFixtureWire,
  validateDeveloperWorkspaceFixturePack,
} from "./developerWorkspaceFixtures";
import {
  DEVELOPER_WORKSPACE_API_PATHS,
  getDeveloperReceipt,
  listDeveloperApprovals,
  listDeveloperMachineSessions,
  listDeveloperMachines,
  liveFailureToReadState,
  presentDeveloperReceipt,
} from "./developerWorkspaceLiveClient";
import {
  assertAgentRouteMatch,
  type DeveloperWorkspaceReadState,
} from "./developerWorkspaceReadState";

export { DEVELOPER_WORKSPACE_API_PATHS };

export type DeveloperWorkspaceReceiptLayer = {
  layer: "action" | "authority" | "outcome" | "settlement" | "fulfilment";
  state:
    | "unavailable"
    | "unknown"
    | "recorded"
    | "succeeded"
    | "failed"
    | "absent";
  reason: string;
};

export type DeveloperWorkspaceSnapshotMeta = {
  source: "fixture" | "api";
  fixture: boolean;
  defaultOff: boolean;
  capturedAt: string;
  mutationCapabilityPublished: boolean;
  apiBase: string;
  agentId: string;
};

export type DeveloperWorkspaceSnapshot = {
  meta: DeveloperWorkspaceSnapshotMeta;
  routeAgentId: string;
  machines: DeveloperWorkspaceReadState<unknown[]>;
  sessions: DeveloperWorkspaceReadState<unknown[]>;
  approvals: DeveloperWorkspaceReadState<unknown[]>;
  receipts: DeveloperWorkspaceReadState<{
    layers: DeveloperWorkspaceReceiptLayer[];
    terminal: unknown;
    completed: boolean;
  }>;
  today: DeveloperWorkspaceReadState<never>;
  next: DeveloperWorkspaceReadState<never>;
  diffTestResult: DeveloperWorkspaceReadState<{ summary: string }>;
  capabilities: {
    unsupported: unknown;
    supported: unknown;
  };
  mutation: {
    send: DeveloperMutationCtaDecision;
    approve: DeveloperMutationCtaDecision;
    published: boolean;
  };
};

export type DeveloperWorkspaceClientOptions = {
  agentId?: string;
  actionRef?: string;
  machineRef?: string;
  flagEnabled?: boolean;
  authenticated?: boolean;
  online?: boolean;
  token?: string | null;
  mode?: "fixture" | "api";
  wire?: string;
  fetchImpl?: typeof fetch;
  transport?: DeveloperWorkspaceTransport;
  stateOverride?: DeveloperWorkspaceReadStateKindOverride;
};

export type DeveloperWorkspaceReadStateKindOverride =
  DeveloperWorkspaceSnapshot["machines"]["kind"];

function scheduleUnavailable(
  capability: "developer.schedule.today_v1" | "developer.schedule.next_v1",
): DeveloperWorkspaceReadState<never> {
  return {
    kind: "unavailable",
    capability,
    reason: "api_not_published",
  };
}

function fixtureReady<T>(data: T): DeveloperWorkspaceReadState<T> {
  return {
    kind: "ready",
    data,
    capturedAt: DEVELOPER_WORKSPACE_FIXTURE_META.capturedAt,
    source: "fixture",
    defaultOff: true,
  };
}

export function isDeveloperWorkspaceFlagEnabled(
  env: Record<string, string | undefined> = {},
): boolean {
  return env.EXPO_PUBLIC_DEVELOPER_WORKSPACE_V1_ENABLED === "1";
}

export function snapshotUsesFixturePresentation(
  snapshot: DeveloperWorkspaceSnapshot,
): boolean {
  const machines = snapshot.machines;
  return (
    (machines.kind === "ready" ||
      machines.kind === "offline_stale" ||
      machines.kind === "partial") &&
    machines.source === "fixture"
  );
}

export function createDeveloperWorkspaceFeatureDisabledSnapshot(
  agentId?: string,
): DeveloperWorkspaceSnapshot {
  const state: DeveloperWorkspaceReadState<never> = {
    kind: "unavailable",
    capability: "developer.workspace_v1",
    reason: "feature_disabled",
  };
  return {
    ...buildEmptyUnknown(agentId),
    machines: state,
    sessions: state,
    approvals: state,
    receipts: state,
  };
}

export function createDeveloperWorkspaceUnpublishedApiSnapshot(
  agentId?: string,
): DeveloperWorkspaceSnapshot {
  return {
    ...buildEmptyUnknown(agentId),
    machines: {
      kind: "unavailable",
      capability: "developer.machines_v1",
      reason: "developer_api_not_published",
    },
    sessions: {
      kind: "unavailable",
      capability: "developer.sessions_v1",
      reason: "developer_api_not_published",
    },
    approvals: {
      kind: "unavailable",
      capability: "developer.approvals_v1",
      reason: "developer_api_not_published",
    },
    receipts: {
      kind: "unavailable",
      capability: "developer.receipts_v1",
      reason: "developer_api_not_published",
    },
  };
}

function resolveFixtureWire(options: DeveloperWorkspaceClientOptions): string {
  if (typeof options.wire === "string") {
    return options.wire;
  }
  if (typeof options.agentId === "string" && options.agentId.length > 0) {
    return scopeDeveloperWorkspaceFixtureWire(options.agentId);
  }
  return DEVELOPER_WORKSPACE_FIXTURE_WIRE;
}

export function buildDeveloperWorkspaceSnapshot(
  options: DeveloperWorkspaceClientOptions = {},
): DeveloperWorkspaceSnapshot {
  if (options.stateOverride) {
    return overlayState(options.stateOverride, options.agentId ?? "");
  }
  if (options.authenticated === false) {
    return unauthorizedSnapshot(options.agentId, "authentication_required");
  }

  const wire = resolveFixtureWire(options);
  const packResult = validateDeveloperWorkspaceFixturePack(wire);
  if (!packResult.valid) {
    return errorSnapshot(options.agentId, packResult.errors.join("; "));
  }
  const pack = packResult.pack ?? parseDeveloperWorkspaceFixtureWire(wire);
  const mismatch = assertAgentRouteMatch(options.agentId, pack.meta.agentId);
  if (mismatch) {
    return mismatchedSnapshot(options.agentId, mismatch);
  }

  const machines = [
    pack.contracts.onlineMachine,
    pack.contracts.offlineMachine,
    pack.contracts.staleMachine,
  ];
  const sessions = [
    pack.contracts.readySession,
    pack.contracts.unavailableSession,
  ];
  const approvals = [pack.contracts.pendingApproval];
  const layers: DeveloperWorkspaceReceiptLayer[] = [
    {
      layer: "action",
      state: "unavailable",
      reason: "canonical_receipt_not_published",
    },
    {
      layer: "authority",
      state: "unavailable",
      reason: "canonical_receipt_not_published",
    },
    {
      layer: "outcome",
      state: "unavailable",
      reason: "canonical_receipt_not_published",
    },
    {
      layer: "settlement",
      state: "unavailable",
      reason: "settlement_not_in_fixture",
    },
    {
      layer: "fulfilment",
      state: "unknown",
      reason: "provisioning_not_published",
    },
  ];

  const mutationBase = {
    capability: pack.contracts.supportedCapability,
    mutationCapabilityPublished: false as const,
    online: options.online !== false,
  };

  return {
    meta: pack.meta,
    routeAgentId: options.agentId as string,
    machines:
      options.online === false
        ? {
            kind: "offline_stale",
            data: machines,
            capturedAt: pack.meta.capturedAt,
            reason: "client_offline_fixture_cache",
            source: "fixture",
          }
        : fixtureReady(machines),
    sessions: fixtureReady(sessions),
    approvals: fixtureReady(approvals),
    receipts: fixtureReady({
      layers,
      terminal: pack.contracts.unavailableTerminal,
      completed: false,
    }),
    today: scheduleUnavailable("developer.schedule.today_v1"),
    next: scheduleUnavailable("developer.schedule.next_v1"),
    diffTestResult: {
      kind: "unavailable",
      capability: "developer.diff_test_result_v1",
      reason: "data_plane_not_published",
    },
    capabilities: {
      unsupported: pack.contracts.unsupportedCapability,
      supported: pack.contracts.supportedCapability,
    },
    mutation: {
      send: evaluateDeveloperMutationCta({
        kind: "send",
        ...mutationBase,
        machineConnection: "online",
        sessionState: "ready",
      }),
      approve: evaluateDeveloperMutationCta({
        kind: "approve",
        ...mutationBase,
        machineConnection: "online",
        sessionState: "ready",
      }),
      published: false,
    },
  };
}

export async function loadDeveloperWorkspaceSnapshot(
  options: DeveloperWorkspaceClientOptions = {},
): Promise<DeveloperWorkspaceSnapshot> {
  if (options.flagEnabled !== true) {
    return createDeveloperWorkspaceFeatureDisabledSnapshot(options.agentId);
  }
  if (options.authenticated === false) {
    return unauthorizedSnapshot(options.agentId, "authentication_required");
  }
  if (options.mode === "fixture") {
    return buildDeveloperWorkspaceSnapshot(options);
  }
  if (options.online === false) {
    const base = buildEmptyUnknown(options.agentId);
    const state: DeveloperWorkspaceReadState<never> = {
      kind: "unknown",
      reason: "client_offline",
    };
    return {
      ...base,
      machines: state,
      sessions: state,
      approvals: state,
      receipts: state,
    };
  }
  return loadDeveloperWorkspaceLiveSnapshot(options);
}

export async function loadDeveloperWorkspaceLiveSnapshot(
  options: DeveloperWorkspaceClientOptions = {},
): Promise<DeveloperWorkspaceSnapshot> {
  const transport = resolveLiveTransport(options);
  if (transport.ok === false) {
    return transport.snapshot;
  }
  const capturedAt = new Date().toISOString();
  const machines = await listDeveloperMachines(transport.request, {
    agentId: options.agentId,
  });
  if (machines.ok === false) {
    return liveFailureSnapshot(options.agentId, machines.state, capturedAt);
  }
  const selectedMachine =
    typeof options.machineRef === "string"
      ? machines.data.items.find(
          (item) => item.machineRef === options.machineRef,
        )
      : (machines.data.items.find(
          (item) => item.connection.status === "online",
        ) ?? machines.data.items[0]);
  const sessions = selectedMachine
    ? await listDeveloperMachineSessions(
        transport.request,
        selectedMachine.machineRef,
        { agentId: options.agentId },
      )
    : { ok: true as const, data: { items: [] }, capturedAt };
  const approvals = await listDeveloperApprovals(transport.request, {
    agentId: options.agentId,
  });
  const receipts =
    typeof options.actionRef === "string"
      ? await getDeveloperReceipt(transport.request, options.actionRef)
      : null;

  const session = sessions.ok
    ? (sessions.data.items.find((item) => item.state === "ready") ??
      sessions.data.items[0])
    : undefined;
  const pendingApproval = approvals.ok
    ? approvals.data.items.find(
        (item) => "status" in item && item.status === "pending",
      )
    : undefined;
  const send = evaluateDeveloperLiveMutationCta({
    kind: "send",
    flagEnabled: true,
    online: options.online !== false,
    machine: selectedMachine,
    session,
  });
  const approve = evaluateDeveloperLiveMutationCta({
    kind: "approve",
    flagEnabled: true,
    online: options.online !== false,
    machine: selectedMachine,
    session,
    hasPendingApproval: Boolean(pendingApproval),
  });

  const receiptPresentation =
    receipts?.ok === true ? presentDeveloperReceipt(receipts.data) : null;
  const receiptState: DeveloperWorkspaceSnapshot["receipts"] = receipts
    ? receipts.ok === true
      ? {
          kind: "ready",
          data: {
            layers: receiptPresentation!.layers.map((layer) => ({
              layer: layer.layer as DeveloperWorkspaceReceiptLayer["layer"],
              state: receiptPresentation!.completed
                ? (layer.state as DeveloperWorkspaceReceiptLayer["state"])
                : layer.state === "succeeded"
                  ? "unknown"
                  : (layer.state as DeveloperWorkspaceReceiptLayer["state"]),
              reason: layer.reason,
            })),
            terminal: receipts.data,
            completed: receiptPresentation!.completed,
          },
          capturedAt: receipts.capturedAt,
          source: "api",
          defaultOff: false,
        }
      : liveFailureToReadState(receipts.state)
    : {
        kind: "unavailable",
        capability: "developer.receipts_v1",
        reason: "action_ref_required",
      };

  return {
    meta: {
      source: "api",
      fixture: false,
      defaultOff: false,
      capturedAt,
      mutationCapabilityPublished: true,
      apiBase: DEVELOPER_WORKSPACE_API_PATHS.machines.replace(
        /\/machines$/,
        "",
      ),
      agentId: options.agentId ?? "",
    },
    routeAgentId: options.agentId ?? "",
    machines: {
      kind: "ready",
      data: machines.data.items,
      capturedAt: machines.capturedAt,
      source: "api",
      defaultOff: false,
    },
    sessions:
      sessions.ok === true
        ? {
            kind: "ready",
            data: sessions.data.items,
            capturedAt: sessions.capturedAt,
            source: "api",
            defaultOff: false,
          }
        : liveFailureToReadState(sessions.state),
    approvals:
      approvals.ok === true
        ? {
            kind: "ready",
            data: approvals.data.items,
            capturedAt: approvals.capturedAt,
            source: "api",
            defaultOff: false,
          }
        : liveFailureToReadState(approvals.state),
    receipts: receiptState,
    today: scheduleUnavailable("developer.schedule.today_v1"),
    next: scheduleUnavailable("developer.schedule.next_v1"),
    diffTestResult: {
      kind: "unavailable",
      capability: "developer.diff_test_result_v1",
      reason: "data_plane_owner_upload_only",
    },
    capabilities: {
      unsupported: DEVELOPER_WORKSPACE_CONTRACT_FIXTURES.unsupportedCapability,
      supported: DEVELOPER_WORKSPACE_CONTRACT_FIXTURES.supportedCapability,
    },
    mutation: {
      send,
      approve,
      published: true,
    },
  };
}

function resolveLiveTransport(
  options: DeveloperWorkspaceClientOptions,
):
  | { ok: true; request: DeveloperWorkspaceTransport }
  | { ok: false; snapshot: DeveloperWorkspaceSnapshot } {
  if (options.transport) return { ok: true, request: options.transport };
  const auth = createDeveloperWorkspaceAuthTransport({
    token: options.token,
    fetchImpl: options.fetchImpl,
    online: options.online,
  });
  if (!auth.authenticated) {
    return {
      ok: false,
      snapshot: unauthorizedSnapshot(
        options.agentId,
        "authentication_required",
      ),
    };
  }
  return { ok: true, request: auth.request };
}

function liveFailureSnapshot(
  agentId: string | undefined,
  failure: Parameters<typeof liveFailureToReadState>[0],
  _capturedAt: string,
): DeveloperWorkspaceSnapshot {
  const base = buildEmptyUnknown(agentId);
  const state = liveFailureToReadState(failure);
  return {
    ...base,
    meta: {
      ...base.meta,
      source: "api",
      fixture: false,
      defaultOff: false,
      mutationCapabilityPublished: false,
    },
    machines: state,
    sessions: state,
    approvals: state,
    receipts: state,
  };
}

export function listValidatedDeveloperContracts(input: unknown[]): {
  valid: unknown[];
  errors: string[];
} {
  const valid: unknown[] = [];
  const errors: string[] = [];
  input.forEach((item, index) => {
    const result = validateDeveloperRemoteWorkspaceContractV1(item);
    if (result.valid) valid.push(item);
    else errors.push(`${index}: ${result.errors.join("; ")}`);
  });
  return { valid, errors };
}

export function validateDeveloperWorkspaceSection(
  kind: "machine" | "session" | "approval" | "receipt" | "capability",
  input: unknown,
) {
  switch (kind) {
    case "machine":
      return validateDeveloperMachineProjectionV1(input);
    case "session":
      return validateDeveloperSessionSummaryV1(input);
    case "approval":
      return validateDeveloperApprovalRequestV1(input);
    case "receipt":
      return validateDeveloperTerminalResultV1(input);
    case "capability":
      return validateDeveloperAdapterCapabilityV1(input);
    default:
      return { valid: false, errors: ["unknown_section"] };
  }
}

function snapshotMetaForAgent(
  agentId?: string,
): DeveloperWorkspaceSnapshotMeta {
  return {
    ...DEVELOPER_WORKSPACE_FIXTURE_META,
    agentId: agentId ?? "",
  };
}

function buildEmptyUnknown(agentId?: string): DeveloperWorkspaceSnapshot {
  return {
    meta: snapshotMetaForAgent(agentId),
    routeAgentId: agentId ?? "",
    machines: { kind: "unknown", reason: "unresolved" },
    sessions: { kind: "unknown", reason: "unresolved" },
    approvals: { kind: "unknown", reason: "unresolved" },
    receipts: { kind: "unknown", reason: "unresolved" },
    today: scheduleUnavailable("developer.schedule.today_v1"),
    next: scheduleUnavailable("developer.schedule.next_v1"),
    diffTestResult: { kind: "unknown", reason: "unresolved" },
    capabilities: {
      unsupported: DEVELOPER_WORKSPACE_CONTRACT_FIXTURES.unsupportedCapability,
      supported: DEVELOPER_WORKSPACE_CONTRACT_FIXTURES.supportedCapability,
    },
    mutation: {
      send: {
        visible: false,
        enabled: false,
        reason: "api_capability_truth_unpublished",
      },
      approve: {
        visible: false,
        enabled: false,
        reason: "api_capability_truth_unpublished",
      },
      published: false,
    },
  };
}

function unauthorizedSnapshot(
  agentId: string | undefined,
  reason: string,
): DeveloperWorkspaceSnapshot {
  const base = buildEmptyUnknown(agentId);
  const state: DeveloperWorkspaceReadState<never> = {
    kind: "unauthorized",
    reason,
  };
  return {
    ...base,
    meta: {
      ...base.meta,
      source: "api",
      fixture: false,
    },
    machines: state,
    sessions: state,
    approvals: state,
    receipts: state,
  };
}

function errorSnapshot(
  agentId: string | undefined,
  reason: string,
): DeveloperWorkspaceSnapshot {
  const base = buildEmptyUnknown(agentId);
  const state: DeveloperWorkspaceReadState<never> = {
    kind: "error",
    reason,
    retryable: false,
  };
  return {
    ...base,
    machines: state,
    sessions: state,
    approvals: state,
    receipts: state,
  };
}

function mismatchedSnapshot(
  agentId: string | undefined,
  mismatch: DeveloperWorkspaceReadState<never>,
): DeveloperWorkspaceSnapshot {
  const base = buildEmptyUnknown(agentId);
  return {
    ...base,
    machines: mismatch,
    sessions: mismatch,
    approvals: mismatch,
    receipts: mismatch,
  };
}

function overlayState(
  kind: DeveloperWorkspaceReadStateKindOverride,
  agentId: string,
): DeveloperWorkspaceSnapshot {
  const base = buildDeveloperWorkspaceSnapshot({
    agentId: agentId || DEVELOPER_WORKSPACE_FIXTURE_META.agentId,
  });
  const capturedAt = DEVELOPER_WORKSPACE_FIXTURE_META.capturedAt;
  const state = ((): DeveloperWorkspaceReadState<unknown> => {
    switch (kind) {
      case "ready":
        return fixtureReady([]);
      case "partial":
        return {
          kind: "partial",
          data: {},
          missing: ["sessions"],
          capturedAt,
          source: "fixture",
          defaultOff: true,
        };
      case "offline_stale":
        return {
          kind: "offline_stale",
          capturedAt,
          reason: "injected_offline_stale",
          source: "fixture",
        };
      case "unavailable":
        return {
          kind: "unavailable",
          capability: "developer.workspace_v1",
          reason: "injected_unavailable",
        };
      case "unknown":
        return { kind: "unknown", reason: "injected_unknown" };
      case "unauthorized":
        return { kind: "unauthorized", reason: "injected_unauthorized" };
      case "unsupported":
        return {
          kind: "unsupported",
          capability: "developer.adapter_v1",
          reason: "injected_unsupported",
        };
      case "error":
        return { kind: "error", reason: "injected_error", retryable: true };
      default:
        return { kind: "error", reason: "unknown_overlay", retryable: false };
    }
  })();
  return {
    ...base,
    routeAgentId: agentId,
    machines: state as DeveloperWorkspaceSnapshot["machines"],
    sessions: state as DeveloperWorkspaceSnapshot["sessions"],
    approvals: state as DeveloperWorkspaceSnapshot["approvals"],
    receipts: state as DeveloperWorkspaceSnapshot["receipts"],
  };
}

export function snapshotForbidsSuccessPaymentOrApproved(
  snapshot: DeveloperWorkspaceSnapshot,
): boolean {
  const wire = JSON.stringify(snapshot);
  return (
    !/"decision":"approved"/.test(wire) &&
    !/"resultingStatus":"approved"/.test(wire) &&
    !/"operationKind":"payment"/.test(wire) &&
    !/"status":"completed"/.test(wire) &&
    snapshot.mutation.send.visible === false &&
    snapshot.mutation.approve.visible === false &&
    snapshot.mutation.send.enabled === false &&
    snapshot.mutation.approve.enabled === false &&
    snapshot.meta.fixture === true &&
    snapshot.meta.defaultOff === true
  );
}
