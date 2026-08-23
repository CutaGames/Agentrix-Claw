import React from "react";
import { Text, TextInput, TouchableOpacity } from "react-native";
import { useDeveloperWorkspaceLive } from "../../../hooks/useDeveloperWorkspaceLive";
import {
  decideDeveloperApproval,
  loadFreshDeveloperApproval,
} from "../../../services/developerWorkspaceApprovals";
import { createDeveloperWorkspaceAuthTransport } from "../../../services/developerWorkspaceAuth";
import { isDeveloperWorkspaceFlagEnabled } from "../../../services/developerWorkspaceClient";
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
import { useAuthStore } from "../../../stores/authStore";
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
      flagEnabled: isDeveloperWorkspaceFlagEnabled(
        process.env as Record<string, string | undefined>,
      ),
      mode: fixture ? "fixture" : "api",
      snapshot: live.snapshot ?? undefined,
      liveStatus: live.loading ? "loading" : live.snapshot ? "ready" : "idle",
      openRoute: opened.ok ? opened.route : agentId ? { agentId } : undefined,
    }),
  };
}

function useLiveTransport() {
  const token = useAuthStore((state) => state.token);
  return React.useMemo(
    () => createDeveloperWorkspaceAuthTransport({ token }).request,
    [token],
  );
}

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
  const transport = useLiveTransport();
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
    if (!result.ok) {
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
      agentId: routeAgentId(route),
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
      {opened.ok ? (
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

export function WorkApprovalsScreen({ route }: any) {
  const { t } = useI18n();
  const { live, model } = useWorkDetailModel(route, {
    approvalRef: route?.params?.approvalRef,
  });
  const transport = useLiveTransport();
  const [fresh, setFresh] = React.useState<DeveloperApprovalRequestV1 | null>(
    null,
  );
  const [status, setStatus] = React.useState("");
  const approvalRef =
    typeof route?.params?.approvalRef === "string"
      ? route.params.approvalRef
      : undefined;
  const agentId = routeAgentId(route);

  React.useEffect(() => {
    if (!approvalRef || explicitFixtureParam(route?.params?.fixture)) return;
    let active = true;
    void loadFreshDeveloperApproval({
      transport,
      approvalRef,
      agentId,
    }).then((result) => {
      if (!active) return;
      if (!result.ok) {
        setStatus(result.state.reason);
        return;
      }
      if ("status" in result.data && result.data.status === "pending")
        setFresh(result.data);
      else setStatus("not_pending");
    });
    return () => {
      active = false;
    };
  }, [agentId, approvalRef, route?.params?.fixture, transport]);

  const decide = async (decision: "approved" | "rejected") => {
    if (!fresh) return;
    const result = await decideDeveloperApproval({
      transport,
      approval: fresh,
      decision,
      online: true,
      now: new Date().toISOString(),
      idempotency: live.idempotency,
    });
    if (!result.ok) {
      setStatus(result.state.reason);
      return;
    }
    setStatus(
      result.awaitingDesktopConfirmation
        ? "waiting_desktop_confirmation"
        : result.approval && "decision" in result.approval
          ? result.approval.decision
          : "recorded",
    );
  };

  const card =
    fresh ??
    (!approvalRef && model.snapshot.approvals.kind === "ready"
      ? (model.snapshot.approvals.data.find(
          (item) =>
            !!item &&
            typeof item === "object" &&
            (item as DeveloperApprovalRequestV1).contractType ===
              "developer_approval_request" &&
            (item as DeveloperApprovalRequestV1).status === "pending",
        ) as DeveloperApprovalRequestV1 | undefined)
      : undefined);
  const decisionRecorded =
    status === "approved" ||
    status === "rejected" ||
    status === "waiting_desktop_confirmation";

  return (
    <WorkScreenFrame
      title={t({ en: "Approvals", zh: "审批" })}
      testID="work-approvals-screen"
    >
      <FixtureBanner snapshot={model.snapshot} />
      {model.approvals.kind !== "ready" && !fresh ? (
        <WorkStateNotice state={model.approvals} />
      ) : null}
      {card ? (
        <WorkCard title={card.approvalRef}>
          <OpaqueRefText label="status" value={card.status} />
          <OpaqueRefText label="risk" value={card.risk} />
          <OpaqueRefText
            label="scope"
            value={card.requestedGrantScopes.join(",")}
          />
          <OpaqueRefText label="expiry" value={card.expiresAt} />
          <OpaqueRefText label="digest" value={card.requestDigest.value} />
          <OpaqueRefText label="cost" value={card.estimatedCost.status} />
          <Text>{card.userVisibleSummary}</Text>
          {card.risk === "L3" || card.requiresLocalConfirmation ? (
            <Text testID="work-approval-l3-wait">
              {t({
                en: "L3 waits for Desktop local confirmation. Mobile never continues locally.",
                zh: "L3 等待 Desktop 本机确认；Mobile 不会本地继续。",
              })}
            </Text>
          ) : null}
          <TouchableOpacity
            disabled={decisionRecorded}
            testID="developer-approve-cta"
            onPress={() => void decide("approved")}
          >
            <Text>{t({ en: "Allow once", zh: "允许一次" })}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            disabled={decisionRecorded}
            testID="developer-reject-cta"
            onPress={() => void decide("rejected")}
          >
            <Text>{t({ en: "Reject", zh: "拒绝" })}</Text>
          </TouchableOpacity>
        </WorkCard>
      ) : (
        <WorkStateNotice
          state={{
            kind: "unauthorized",
            reason: status || "developer_not_found",
          }}
        />
      )}
      {status ? <OpaqueRefText label="decision" value={status} /> : null}
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
  const transport = useLiveTransport();
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

  React.useEffect(() => {
    if (!handoffRef) return;
    const agentId = routeAgentId(route);
    let active = true;
    void getDeveloperHandoff(transport, handoffRef, agentId).then((result) => {
      if (!active) return;
      if (!result.ok) setStatus(result.state.reason);
      else setHandoff(result.data);
    });
    return () => {
      active = false;
    };
  }, [handoffRef, route?.params?.agentId, transport]);

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
    if (result.ok) {
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
