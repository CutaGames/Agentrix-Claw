import React from "react";
import { AppState, Text, TextInput, TouchableOpacity } from "react-native";
import { useDeveloperWorkspaceLive } from "../../../hooks/useDeveloperWorkspaceLive";
import {
  canDecideDeveloperApproval,
  decideDeveloperApprovalWithReadBack,
  describeDeveloperApprovalInbox,
  developerApprovalInboxAuthBlocked,
  developerApprovalInboxBusy,
  openDeveloperApprovalInbox,
  reauthenticateDeveloperWorkspace,
  type DeveloperApprovalInboxDecision,
  type DeveloperApprovalInboxState,
} from "../../../services/developerWorkspaceApprovalInbox";
import { isDeveloperWorkspaceBuildFlagEnabled } from "../../../services/developerWorkspaceBuildEnv";
import {
  DEVELOPER_WORKSPACE_FIXTURE_NOW,
  getSharedDeveloperWorkspaceFixtureTransport,
} from "../../../services/developerWorkspaceFixtureTransport";
import { liveFailureToReadState } from "../../../services/developerWorkspaceLiveClient";
import { useAuthStore } from "../../../stores/authStore";
import {
  evaluateDeveloperLiveMutationCta,
  reconcileDeveloperInstruction,
  submitDeveloperInstruction,
} from "../../../services/developerWorkspaceControl";
import { acceptDeveloperHandoff } from "../../../services/developerWorkspaceHandoff";
import {
  getDeveloperHandoff,
  listDeveloperInstructionEvents,
} from "../../../services/developerWorkspaceLiveClient";
import { parseDeveloperWorkspaceOpenRoute } from "../../../services/developerWorkspaceOpenRoute";
import { buildDeveloperWorkHomeModel } from "../../../services/developerWorkspaceWorkModel";
import { useI18n } from "../../../stores/i18nStore";
import { useMobileAgentDirectory } from "../useMobileAgentDirectory";
import {
  FixtureBanner,
  MutationGate,
  OpaqueRefText,
  WorkCard,
  WorkScreenFrame,
  WorkStateNotice,
} from "./WorkReadOnlyViews";
import type {
  DeveloperApprovalRequestV1,
  DeveloperHandoffV1,
  DeveloperInstructionV1,
  DeveloperMachineProjectionV1,
  DeveloperSessionEventV1,
  DeveloperSessionSummaryV1,
} from "../../../../shared/types/developer-remote-workspace";

function routeAgentId(route: any): string | undefined {
  return typeof route?.params?.agentId === "string"
    ? route.params.agentId
    : undefined;
}

function explicitFixtureParam(value: unknown): boolean {
  return value === true || value === "1";
}

function useWorkDetailModel(route: any, extra: Record<string, unknown> = {}) {
  const agentId = routeAgentId(route);
  const directory = useMobileAgentDirectory(agentId);
  const liveAgentId =
    directory.model.context.kind === "ready"
      ? directory.model.context.context.agentId
      : agentId;
  const fixture = explicitFixtureParam(route?.params?.fixture);
  const live = useDeveloperWorkspaceLive({
    agentId: liveAgentId,
    machineRef:
      typeof extra.machineRef === "string" ? extra.machineRef : undefined,
    actionRef:
      typeof extra.actionRef === "string" ? extra.actionRef : undefined,
    fixture,
  });
  const opened = parseDeveloperWorkspaceOpenRoute(
    agentId ? { agentId, ...extra } : extra,
  );
  return {
    opened,
    live,
    model: buildDeveloperWorkHomeModel({
      routeAgentId: agentId,
      directoryContext: directory.model.context,
      flagEnabled: isDeveloperWorkspaceBuildFlagEnabled(),
      mode: fixture ? "fixture" : "api",
      snapshot: live.snapshot ?? undefined,
      liveStatus: live.loading ? "loading" : live.snapshot ? "ready" : "idle",
      openRoute: opened.ok ? opened.route : agentId ? { agentId } : undefined,
    }),
  };
}

// Mutations and fresh reads reuse `live.transport` (carries the
// `agentAccountId` hint) and scope by `live.scopeAgentId` (`agentUniqueId`),
// never by the Mobile route uuid — board §0.35.

export function WorkMachinesScreen({ navigation, route }: any) {
  const { t } = useI18n();
  const { model } = useWorkDetailModel(route, {
    machineRef: route?.params?.machineRef,
  });
  const machines =
    model.snapshot.machines.kind === "ready"
      ? model.snapshot.machines.data
      : [];
  return (
    <WorkScreenFrame
      title={t({ en: "Machines", zh: "机器" })}
      testID="work-machines-screen"
    >
      <FixtureBanner snapshot={model.snapshot} />
      <Text>
        {t({
          en: "Select a verified machine. Adapter, credential and path settings stay on Desktop.",
          zh: "选择已验证机器。适配器、凭据与路径设置留在 Desktop。",
        })}
      </Text>
      {model.machines.kind !== "ready" ? (
        <WorkStateNotice state={model.machines} />
      ) : (
        machines.map((machine, index) => {
          const record = machine as DeveloperMachineProjectionV1;
          return (
            <WorkCard
              key={index}
              title={record.displayLabel ?? record.machineRef}
            >
              <OpaqueRefText label="ref" value={record.machineRef} />
              <OpaqueRefText
                label="connection"
                value={record.connection.status}
              />
              <OpaqueRefText
                label="workspaceTrust"
                value={record.axes.workspaceTrust}
              />
              {record.connection.status === "online" ? (
                <TouchableOpacity
                  testID={`work-machine-open-sessions-${record.machineRef}`}
                  onPress={() =>
                    navigation.navigate("WorkSessions", {
                      agentId: record.agentId,
                      machineRef: record.machineRef,
                    })
                  }
                >
                  <Text>{t({ en: "Open sessions", zh: "打开会话" })}</Text>
                </TouchableOpacity>
              ) : (
                <WorkStateNotice
                  state={{
                    kind: "unavailable",
                    capability: "developer.sessions_v1",
                    reason: record.connection.status,
                  }}
                />
              )}
            </WorkCard>
          );
        })
      )}
      <MutationGate snapshot={model.snapshot} />
    </WorkScreenFrame>
  );
}

export function WorkSessionsScreen({ navigation, route }: any) {
  const { t } = useI18n();
  const { opened, live, model } = useWorkDetailModel(route, {
    sessionRef: route?.params?.sessionRef,
    machineRef: route?.params?.machineRef,
  });
  const transport = live.transport;
  const [summary, setSummary] = React.useState("");
  const [instructionBody, setInstructionBody] = React.useState("");
  const [notice, setNotice] = React.useState<string>("");
  const [events, setEvents] = React.useState<DeveloperSessionEventV1[]>([]);
  const [submittedInstruction, setSubmittedInstruction] =
    React.useState<DeveloperInstructionV1 | null>(null);
  const session = (
    model.snapshot.sessions.kind === "ready" ? model.snapshot.sessions.data : []
  ).find(
    (item) =>
      (item as DeveloperSessionSummaryV1).sessionRef ===
      route?.params?.sessionRef,
  ) as DeveloperSessionSummaryV1 | undefined;
  const machine = (
    model.snapshot.machines.kind === "ready" ? model.snapshot.machines.data : []
  ).find(
    (item) =>
      (item as DeveloperMachineProjectionV1).machineRef ===
      (session?.machineRef ?? route?.params?.machineRef),
  ) as DeveloperMachineProjectionV1 | undefined;
  const send = evaluateDeveloperLiveMutationCta({
    kind: "send",
    flagEnabled: live.flagEnabled,
    online: true,
    machine,
    session,
  });

  const sendInstruction = async () => {
    if (!machine || !session || !send.enabled) return;
    const controlSummary = summary.trim();
    const plaintext = instructionBody.trim();
    if (!controlSummary || !plaintext) return;
    const result = await submitDeveloperInstruction({
      transport,
      machine,
      workspaceRef: session.workspaceRef,
      session,
      userVisibleSummary: controlSummary.slice(0, 160),
      plaintext,
      now: new Date().toISOString(),
      online: true,
      idempotency: live.idempotency,
    });
    // `=== false`, not `!ok`: the Mobile app tsconfig has `strict: false`, so
    // truthiness does not narrow a discriminated union here.
    if (result.ok === false) {
      setNotice(result.state.reason);
      return;
    }
    setSummary("");
    setInstructionBody("");
    setSubmittedInstruction(result.instruction ?? null);
    setNotice(
      result.awaitingDesktop
        ? "waiting_desktop_session"
        : (result.instruction?.instructionRef ?? "submitted"),
    );
    if (result.instruction) {
      const listed = await listDeveloperInstructionEvents(
        transport,
        result.instruction.instructionRef,
      );
      if (listed.ok) setEvents(listed.data.items);
    }
  };

  const reconcile = async () => {
    const instructionRef =
      route?.params?.instructionRef ?? submittedInstruction?.instructionRef;
    const actionRef =
      route?.params?.actionRef ?? submittedInstruction?.actionRef;
    if (
      !session ||
      typeof instructionRef !== "string" ||
      typeof actionRef !== "string"
    ) {
      setNotice("reconcile_refs_required");
      return;
    }
    const result = await reconcileDeveloperInstruction({
      transport,
      sessionRef: session.sessionRef,
      instructionRef,
      actionRef,
      agentId: live.scopeAgentId,
    });
    setNotice(result.completed ? "receipt_completed" : "receipt_not_completed");
    if (result.events.ok) setEvents(result.events.data.items);
  };

  const cancel = evaluateDeveloperLiveMutationCta({
    kind: "cancel",
    flagEnabled: live.flagEnabled,
    online: true,
    session,
    expectedInstructionVersion: undefined,
  });

  return (
    <WorkScreenFrame
      title={t({ en: "Sessions", zh: "会话" })}
      testID="work-sessions-screen"
    >
      <FixtureBanner snapshot={model.snapshot} />
      {opened.ok === true ? (
        <Text testID="work-open-route-refs">
          {opened.route.sessionRef ?? opened.route.agentId}
        </Text>
      ) : (
        <WorkStateNotice
          state={{ kind: "unauthorized", reason: opened.reason }}
        />
      )}
      {model.sessions.kind !== "ready" ? (
        <WorkStateNotice state={model.sessions} />
      ) : (
        (model.snapshot.sessions.kind === "ready"
          ? model.snapshot.sessions.data
          : []
        ).map((item, index) => {
          const record = item as DeveloperSessionSummaryV1;
          return (
            <TouchableOpacity
              key={index}
              testID={`work-select-session-${record.sessionRef}`}
              onPress={() =>
                navigation.setParams({
                  sessionRef: record.sessionRef,
                  machineRef: record.machineRef,
                })
              }
            >
              <WorkCard title={record.sessionRef}>
                <OpaqueRefText label="state" value={record.state} />
                <OpaqueRefText label="workspace" value={record.workspaceRef} />
              </WorkCard>
            </TouchableOpacity>
          );
        })
      )}
      {send.visible ? (
        <WorkCard title={t({ en: "Quick continue", zh: "快速续接" })}>
          <TextInput
            testID="work-instruction-summary"
            value={summary}
            onChangeText={setSummary}
            placeholder={t({
              en: "Notification-safe summary",
              zh: "可用于通知的安全摘要",
            })}
          />
          <TextInput
            testID="work-instruction-body"
            value={instructionBody}
            onChangeText={setInstructionBody}
            multiline
            textAlignVertical="top"
            placeholder={t({
              en: "Private instruction body (encrypted data plane)",
              zh: "私密指令正文（加密数据面）",
            })}
          />
          <Text>
            {t({
              en: "The summary enters the control plane. The private body is uploaded once to the encrypted data plane and is never placed in navigation or cache keys.",
              zh: "摘要进入控制面；私密正文只上传到加密数据面，不进入导航参数或缓存键。",
            })}
          </Text>
          <TouchableOpacity
            disabled={
              !send.enabled ||
              summary.trim().length === 0 ||
              instructionBody.trim().length === 0
            }
            testID="developer-send-cta"
            onPress={() => void sendInstruction()}
          >
            <Text>{t({ en: "Send", zh: "发送" })}</Text>
          </TouchableOpacity>
        </WorkCard>
      ) : (
        <MutationGate snapshot={model.snapshot} />
      )}
      {cancel.visible ? (
        <WorkCard title={t({ en: "Cancel instruction", zh: "取消指令" })}>
          <TouchableOpacity
            disabled={!cancel.enabled}
            testID="work-session-cancel"
          >
            <Text>
              {cancel.enabled ? t({ en: "Cancel", zh: "取消" }) : cancel.reason}
            </Text>
          </TouchableOpacity>
        </WorkCard>
      ) : null}
      <TouchableOpacity
        testID="work-session-reconcile"
        onPress={() => void reconcile()}
      >
        <Text>{t({ en: "Reconcile", zh: "对账" })}</Text>
      </TouchableOpacity>
      {notice ? <OpaqueRefText label="status" value={notice} /> : null}
      {submittedInstruction ? (
        <WorkCard title={t({ en: "Submitted instruction", zh: "已提交指令" })}>
          <OpaqueRefText
            label="instructionRef"
            value={submittedInstruction.instructionRef}
          />
          <OpaqueRefText
            label="actionRef"
            value={submittedInstruction.actionRef}
          />
        </WorkCard>
      ) : null}
      {events.map((event) => (
        <OpaqueRefText
          key={event.eventRef}
          label={event.eventType}
          value={String(event.sequence)}
        />
      ))}
    </WorkScreenFrame>
  );
}

/**
 * Quick approval inbox — M2.2 (MTR-R10), decision d-50.
 *
 * Open (push or in-app) → re-authenticate with the token as it is *now* →
 * fresh read → the user decides on exactly that digest → decision →
 * authoritative read-back. The screen renders only what the read-back
 * returned: no optimistic "approved", no timeout-as-success, one decision per
 * approval (in-flight guard + terminal read-only). `fixture=1` runs the same
 * chain against the in-memory fixture transport (Maestro 91).
 */
export function WorkApprovalsScreen({ route }: any) {
  const { t, language } = useI18n();
  const { live, model } = useWorkDetailModel(route, {
    approvalRef: route?.params?.approvalRef,
  });
  const fixture = explicitFixtureParam(route?.params?.fixture);
  const source: "push" | "internal" =
    route?.params?.source === "push" ? "push" : "internal";
  const routeApprovalRef =
    typeof route?.params?.approvalRef === "string"
      ? route.params.approvalRef
      : undefined;
  // In-app open without a ref: the first pending approval of the snapshot.
  const snapshotPendingRef =
    !routeApprovalRef && model.snapshot.approvals.kind === "ready"
      ? (
          model.snapshot.approvals.data.find(
            (item) =>
              !!item &&
              typeof item === "object" &&
              (item as DeveloperApprovalRequestV1).contractType ===
                "developer_approval_request" &&
              (item as DeveloperApprovalRequestV1).status === "pending",
          ) as DeveloperApprovalRequestV1 | undefined
        )?.approvalRef
      : undefined;
  const approvalRef = routeApprovalRef ?? snapshotPendingRef;
  const scopeAgentId = live.scopeAgentId;
  // Flag off = the M1.2.1 read-state card, in fixture mode too: `fixture=1`
  // never bypasses the release flag (Maestro 92).
  const flagEnabled = live.flagEnabled;

  const fixtureTransport = React.useMemo(
    () =>
      fixture
        ? getSharedDeveloperWorkspaceFixtureTransport(scopeAgentId)
        : null,
    [fixture, scopeAgentId],
  );
  const transport = fixtureTransport ? fixtureTransport.request : live.transport;
  const readAgentId = fixture ? undefined : scopeAgentId;
  const inboxSource = fixture ? ("fixture" as const) : ("api" as const);
  const nowIso = () =>
    fixture ? DEVELOPER_WORKSPACE_FIXTURE_NOW : new Date().toISOString();

  const [inbox, setInbox] = React.useState<DeveloperApprovalInboxState>({
    phase: "idle",
  });
  const inFlight = React.useRef(false);
  const lastPending = React.useRef<DeveloperApprovalRequestV1 | undefined>(
    undefined,
  );
  const inboxRef = React.useRef(inbox);
  inboxRef.current = inbox;

  const open = React.useCallback(async () => {
    if (!approvalRef || !flagEnabled) return;
    // No scope yet (directory still resolving, or the agent is not in the
    // owner directory) → no read; the model's read state says why.
    if (!fixture && !scopeAgentId) return;
    if (inFlight.current) return;
    // A decision that reached the read-back is final for *this* approval;
    // returning from the background must not restart the chain on top of it.
    // (A different approvalRef on the same screen instance does re-read.)
    const current = inboxRef.current;
    const settledFor =
      current.phase === "decided" ||
      current.phase === "awaiting_desktop" ||
      current.phase === "terminal_read_only"
        ? current.approval.approvalRef
        : undefined;
    if (settledFor === approvalRef) return;
    inFlight.current = true;
    try {
      if (!fixture) {
        // MTR-R10.1 step one — the token as the store holds it *now*, never the
        // one captured when the push arrived; expired → stop before any read.
        setInbox({ phase: "reauthenticating" });
        const reauth = await reauthenticateDeveloperWorkspace({
          token: useAuthStore.getState().token,
          now: nowIso(),
        });
        if (reauth.ok === false) {
          setInbox(developerApprovalInboxAuthBlocked(reauth.reason));
          return;
        }
      }
      setInbox({ phase: "reading", approvalRef });
      const next = await openDeveloperApprovalInbox({
        transport,
        approvalRef,
        agentId: readAgentId,
        now: nowIso(),
        source: inboxSource,
        previous: lastPending.current,
      });
      if (next.phase === "pending") lastPending.current = next.approval;
      setInbox(next);
    } finally {
      inFlight.current = false;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [approvalRef, fixture, flagEnabled, inboxSource, readAgentId, scopeAgentId, transport]);

  React.useEffect(() => {
    void open();
  }, [open]);

  // MTR-R10.3 "background → return": the request is re-read (and a changed
  // digest is surfaced) instead of trusting what was on screen before.
  React.useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") void open();
    });
    return () => subscription.remove();
  }, [open]);

  const decide = async (decision: DeveloperApprovalInboxDecision) => {
    const current = inboxRef.current;
    // Duplicate tap / terminal state: exactly one decision leaves the device.
    if (!canDecideDeveloperApproval(current) || inFlight.current) return;
    inFlight.current = true;
    const approval = current.approval;
    setInbox({ phase: "deciding", approval, decision });
    try {
      const next = await decideDeveloperApprovalWithReadBack({
        transport,
        approval,
        decision,
        now: nowIso(),
        online: true,
        idempotency: live.idempotency,
        agentId: readAgentId,
        source: inboxSource,
        onReadingBack: () =>
          setInbox({ phase: "reading_back", approval, decision }),
      });
      setInbox(next);
    } finally {
      inFlight.current = false;
    }
  };

  const busy = developerApprovalInboxBusy(inbox);
  const pendingCard =
    inbox.phase === "pending" ||
    inbox.phase === "deciding" ||
    inbox.phase === "reading_back" ||
    inbox.phase === "awaiting_desktop" ||
    inbox.phase === "blocked"
      ? inbox.approval
      : undefined;
  const terminal =
    inbox.phase === "decided" || inbox.phase === "terminal_read_only"
      ? inbox.approval
      : undefined;
  const canDecide = canDecideDeveloperApproval(inbox);

  return (
    <WorkScreenFrame
      title={t({ en: "Approvals", zh: "审批" })}
      testID="work-approvals-screen"
    >
      <FixtureBanner snapshot={model.snapshot} />
      {source === "push" ? (
        <Text testID="work-approval-source-push">
          {t({
            en: "Opened from a notification. The payload was only a pointer: this screen re-authenticated and fresh-read the request.",
            zh: "来自推送。推送只是指针：本页已重新鉴权并从服务端刷新读取该请求。",
          })}
        </Text>
      ) : null}
      {!flagEnabled ? (
        <WorkStateNotice
          state={model.approvals}
          testID="work-approval-flag-off"
        />
      ) : null}
      {flagEnabled && !approvalRef && model.approvals.kind !== "ready" ? (
        <WorkStateNotice state={model.approvals} />
      ) : null}
      {flagEnabled && !approvalRef && model.approvals.kind === "ready" ? (
        <WorkStateNotice
          state={{ kind: "unauthorized", reason: "developer_not_found" }}
          testID="work-approval-none-pending"
        />
      ) : null}
      {approvalRef && !fixture && !scopeAgentId ? (
        <WorkStateNotice state={model.approvals} />
      ) : null}

      {flagEnabled ? (
        <>
          <OpaqueRefText label="phase" value={inbox.phase} />
          <Text testID={`work-approval-phase-${inbox.phase}`}>
            {describeDeveloperApprovalInbox(inbox, language === "zh")}
          </Text>
        </>
      ) : null}

      {pendingCard ? (
        <WorkCard title={pendingCard.approvalRef} testID="work-approval-card">
          <OpaqueRefText label="status" value={pendingCard.status} />
          <OpaqueRefText label="risk" value={pendingCard.risk} />
          <OpaqueRefText
            label="scope"
            value={pendingCard.requestedGrantScopes.join(",")}
          />
          <OpaqueRefText label="expiry" value={pendingCard.expiresAt} />
          <OpaqueRefText
            label="digest"
            value={pendingCard.requestDigest.value}
          />
          <OpaqueRefText label="cost" value={pendingCard.estimatedCost.status} />
          <Text>{pendingCard.userVisibleSummary}</Text>
          {pendingCard.risk === "L3" || pendingCard.requiresLocalConfirmation ? (
            <Text testID="work-approval-l3-wait">
              {t({
                en: "L3 waits for Desktop local confirmation. Mobile never continues locally.",
                zh: "L3 等待 Desktop 本机确认；Mobile 不会本地继续。",
              })}
            </Text>
          ) : null}
          {inbox.phase === "reading_back" ? (
            <Text testID="work-approval-reading-back">
              {t({
                en: "Waiting for the backend read-back — nothing is shown as decided before it.",
                zh: "等待服务端回读——回读之前不会显示任何「已批准 / 已拒绝」。",
              })}
            </Text>
          ) : null}
          {inbox.phase === "blocked" || inbox.phase === "awaiting_desktop" ? null : (
            <>
              <TouchableOpacity
                disabled={!canDecide || busy}
                testID="developer-approve-cta"
                onPress={() => void decide("approved")}
              >
                <Text>{t({ en: "Allow once", zh: "允许一次" })}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                disabled={!canDecide || busy}
                testID="developer-reject-cta"
                onPress={() => void decide("rejected")}
              >
                <Text>{t({ en: "Reject", zh: "拒绝" })}</Text>
              </TouchableOpacity>
            </>
          )}
        </WorkCard>
      ) : null}

      {terminal ? (
        <WorkCard
          title={terminal.approvalRef}
          testID={
            inbox.phase === "decided"
              ? "work-approval-readback"
              : "work-approval-terminal"
          }
        >
          <OpaqueRefText label="read-back" value={terminal.decision} />
          <OpaqueRefText label="resultingStatus" value={terminal.resultingStatus} />
          <OpaqueRefText label="decisionRef" value={terminal.decisionRef} />
          <OpaqueRefText label="decidedAt" value={terminal.decidedAt} />
          <OpaqueRefText label="digest" value={terminal.requestDigest.value} />
          <OpaqueRefText
            label="source"
            value={"source" in inbox ? inbox.source : undefined}
          />
          <Text testID={`work-approval-readback-${terminal.decision}`}>
            {t({
              en: `Backend read-back: ${terminal.decision}. Terminal — no further decision is possible.`,
              zh: `服务端回读：${terminal.decision}。已终态，不可再次决策。`,
            })}
          </Text>
        </WorkCard>
      ) : null}

      {inbox.phase === "blocked" ? (
        <>
          <WorkStateNotice
            state={liveFailureToReadState(inbox.failure)}
            testID={`work-approval-blocked-${inbox.reason}`}
          />
          {inbox.canReread ? (
            <TouchableOpacity
              disabled={busy}
              testID="work-approval-reread"
              onPress={() => void open()}
            >
              <Text>
                {inbox.reason === "authentication_required" ||
                inbox.reason === "session_expired"
                  ? t({ en: "Signed in again? Re-read", zh: "已重新登录？重新读取" })
                  : t({ en: "Re-read from the backend", zh: "从服务端重新读取" })}
              </Text>
            </TouchableOpacity>
          ) : null}
        </>
      ) : null}
    </WorkScreenFrame>
  );
}

export function WorkReceiptsScreen({ route }: any) {
  const { t } = useI18n();
  const { model } = useWorkDetailModel(route, {
    actionRef: route?.params?.actionRef,
  });
  const completed =
    model.snapshot.receipts.kind === "ready" &&
    model.snapshot.receipts.data.completed;
  return (
    <WorkScreenFrame
      title={t({ en: "Receipts", zh: "回执" })}
      testID="work-receipts-screen"
    >
      <FixtureBanner snapshot={model.snapshot} />
      {model.receipt.kind !== "ready" ? (
        <WorkStateNotice state={model.receipt} />
      ) : model.snapshot.receipts.kind === "ready" ? (
        model.snapshot.receipts.data.layers.map((layer) => (
          <WorkCard key={layer.layer} title={layer.layer}>
            <OpaqueRefText label={layer.state} value={layer.reason} />
          </WorkCard>
        ))
      ) : null}
      <OpaqueRefText label="completed" value={completed ? "true" : "false"} />
      <MutationGate snapshot={model.snapshot} />
    </WorkScreenFrame>
  );
}

export function WorkHandoffsScreen({ route }: any) {
  const { t } = useI18n();
  const { live, model } = useWorkDetailModel(route, {
    handoffRef: route?.params?.handoffRef,
  });
  const transport = live.transport;
  const [handoff, setHandoff] = React.useState<DeveloperHandoffV1 | null>(null);
  const [status, setStatus] = React.useState("");
  const handoffRef =
    typeof route?.params?.handoffRef === "string"
      ? route.params.handoffRef
      : undefined;
  const machines =
    model.snapshot.machines.kind === "ready"
      ? (model.snapshot.machines.data as DeveloperMachineProjectionV1[])
      : [];
  const sessions =
    model.snapshot.sessions.kind === "ready"
      ? (model.snapshot.sessions.data as DeveloperSessionSummaryV1[])
      : [];

  const scopeAgentId = live.scopeAgentId;
  React.useEffect(() => {
    if (!handoffRef || !scopeAgentId) return;
    let active = true;
    void getDeveloperHandoff(transport, handoffRef, scopeAgentId).then((result) => {
      if (!active) return;
      if (result.ok === false) setStatus(result.state.reason);
      else setHandoff(result.data);
    });
    return () => {
      active = false;
    };
  }, [handoffRef, scopeAgentId, transport]);

  const accept = async (machine: DeveloperMachineProjectionV1) => {
    if (!handoff) return;
    const consumer = sessions.find(
      (session) =>
        session.machineRef === machine.machineRef && session.state === "ready",
    );
    if (!consumer) {
      setStatus("consumer_session_required");
      return;
    }
    const result = await acceptDeveloperHandoff({
      transport,
      handoff,
      targetMachine: machine,
      consumerSession: consumer,
      online: true,
      idempotency: live.idempotency,
    });
    if (result.ok === true) {
      setHandoff(result.handoff);
      setStatus(result.handoff.status);
    } else {
      setStatus(result.state.reason);
    }
  };

  return (
    <WorkScreenFrame
      title={t({ en: "Handoff", zh: "交接" })}
      testID="work-handoffs-screen"
    >
      <FixtureBanner snapshot={model.snapshot} />
      {handoff ? (
        <WorkCard title={handoff.handoffRef}>
          <OpaqueRefText label="status" value={handoff.status} />
          <OpaqueRefText label="digest" value={handoff.handoffDigest.value} />
          <Text>
            {t({
              en: "Accept binds the selected verified machine. Mobile does not self-report runtime.",
              zh: "接受绑定所选已验证机器；Mobile 不自报 runtime。",
            })}
          </Text>
          {machines
            .filter((machine) => machine.connection.status === "online")
            .map((machine) => (
              <TouchableOpacity
                key={machine.machineRef}
                testID={`work-handoff-accept-${machine.machineRef}`}
                onPress={() => void accept(machine)}
              >
                <Text>
                  {t({ en: "Accept on", zh: "接受于" })} {machine.displayLabel}
                </Text>
              </TouchableOpacity>
            ))}
        </WorkCard>
      ) : (
        <WorkStateNotice
          state={
            status === "developer_not_found"
              ? { kind: "unauthorized", reason: "developer_not_found" }
              : { kind: "unknown", reason: status || "handoff_unresolved" }
          }
        />
      )}
    </WorkScreenFrame>
  );
}
