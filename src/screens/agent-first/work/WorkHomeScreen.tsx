import React from "react";
import { Text, TouchableOpacity } from "react-native";
import { useDeveloperWorkspaceLive } from "../../../hooks/useDeveloperWorkspaceLive";
import { isDeveloperWorkspaceFlagEnabled } from "../../../services/developerWorkspaceClient";
import { parseDeveloperWorkspaceOpenRoute } from "../../../services/developerWorkspaceOpenRoute";
import { buildDeveloperWorkHomeModel } from "../../../services/developerWorkspaceWorkModel";
import { useI18n } from "../../../stores/i18nStore";
import { useMobileAgentDirectory } from "../useMobileAgentDirectory";
import {
  FixtureBanner,
  OpaqueRefText,
  WorkCard,
  WorkScreenFrame,
  WorkStateNotice,
} from "./WorkReadOnlyViews";

function machineLabel(machine: unknown): string {
  if (!machine || typeof machine !== "object") return "machine";
  const record = machine as {
    displayLabel?: string;
    machineRef?: string;
    connection?: { status?: string };
  };
  return `${record.displayLabel ?? record.machineRef ?? "machine"} · ${record.connection?.status ?? "unknown"}`;
}

function sessionLabel(session: unknown): string {
  if (!session || typeof session !== "object") return "session";
  const record = session as { sessionRef?: string; state?: string };
  return `${record.sessionRef ?? "session"} · ${record.state ?? "unknown"}`;
}

function explicitFixtureParam(value: unknown): boolean {
  return value === true || value === "1";
}

export function WorkHomeScreen({ navigation, route }: any) {
  const { t } = useI18n();
  const routeAgentId =
    typeof route?.params?.agentId === "string"
      ? route.params.agentId
      : undefined;
  const directory = useMobileAgentDirectory(routeAgentId);
  const liveAgentId =
    directory.model.context.kind === "ready"
      ? directory.model.context.context.agentId
      : routeAgentId;
  const fixture = explicitFixtureParam(route?.params?.fixture);
  const live = useDeveloperWorkspaceLive({
    agentId: liveAgentId,
    fixture,
  });
  const model = buildDeveloperWorkHomeModel({
    routeAgentId,
    directoryContext: directory.model.context,
    flagEnabled: isDeveloperWorkspaceFlagEnabled(
      process.env as Record<string, string | undefined>,
    ),
    mode: fixture ? "fixture" : "api",
    snapshot: live.snapshot ?? undefined,
    liveStatus: live.loading ? "loading" : live.snapshot ? "ready" : "idle",
    openRoute: routeAgentId ? { agentId: routeAgentId } : undefined,
  });
  const snapshot = model.snapshot;
  const machines =
    snapshot.machines.kind === "ready" ? snapshot.machines.data : [];
  const sessions =
    snapshot.sessions.kind === "ready" ? snapshot.sessions.data : [];
  const approvals =
    snapshot.approvals.kind === "ready" ? snapshot.approvals.data : [];
  const pendingApprovals = approvals.filter(
    (approval) =>
      !!approval &&
      typeof approval === "object" &&
      (approval as { status?: string }).status === "pending",
  );
  const agentId = model.openRoute.ok
    ? model.openRoute.route.agentId
    : routeAgentId;

  const open = (screen: string, extra: Record<string, string> = {}) => {
    const opened = parseDeveloperWorkspaceOpenRoute(
      agentId ? { agentId, ...extra } : extra,
    );
    if (!opened.ok || !agentId) return;
    navigation.navigate(screen, opened.route);
  };

  return (
    <WorkScreenFrame
      title={t({ en: "Work", zh: "工作" })}
      testID="work-home-screen"
    >
      <Text>
        {t({
          en: "Notifications, approvals and quick resume stay on Mobile. Adapter settings stay on Desktop.",
          zh: "通知、审批与快速续接在 Mobile；适配器设置留在 Desktop。",
        })}
      </Text>
      <FixtureBanner snapshot={snapshot} />
      <WorkCard
        title={t({
          en: `Needs approval (${pendingApprovals.length})`,
          zh: `待我审批（${pendingApprovals.length}）`,
        })}
        testID="work-approvals"
      >
        {snapshot.approvals.kind !== "ready" ? (
          <WorkStateNotice state={snapshot.approvals} />
        ) : pendingApprovals.length === 0 ? (
          <Text>
            {t({
              en: "Nothing needs your decision right now.",
              zh: "当前没有需要你决策的事项。",
            })}
          </Text>
        ) : (
          pendingApprovals.map((approval, index) => {
            const record = approval as {
              approvalRef?: string;
              status?: string;
              risk?: string;
            };
            return (
              <TouchableOpacity
                key={index}
                testID={`work-approval-${record.approvalRef ?? index}`}
                onPress={() =>
                  record.approvalRef &&
                  open("WorkApprovals", { approvalRef: record.approvalRef })
                }
              >
                <OpaqueRefText
                  label={`${record.approvalRef ?? "approval"} · ${record.status ?? "pending"} · ${record.risk ?? ""}`}
                  value={record.approvalRef}
                />
                <Text>
                  {t({
                    en: "Open details and fresh-check →",
                    zh: "查看详情并刷新校验 →",
                  })}
                </Text>
              </TouchableOpacity>
            );
          })
        )}
      </WorkCard>

      <WorkCard
        title={t({ en: "Active sessions", zh: "活跃会话" })}
        testID="work-sessions"
      >
        {snapshot.sessions.kind !== "ready" ? (
          <WorkStateNotice state={snapshot.sessions} />
        ) : sessions.length === 0 ? (
          <Text>
            {t({
              en: "No resumable sessions on the selected machine.",
              zh: "所选机器暂无可续接会话。",
            })}
          </Text>
        ) : (
          sessions.map((session, index) => {
            const record = session as { sessionRef?: string; state?: string };
            return (
              <TouchableOpacity
                key={index}
                testID={`work-session-${record.sessionRef ?? index}`}
                onPress={() =>
                  record.sessionRef &&
                  open("WorkSessions", { sessionRef: record.sessionRef })
                }
              >
                <OpaqueRefText
                  label={sessionLabel(session)}
                  value={record.sessionRef}
                />
                {record.state === "ready" ? (
                  <Text>{t({ en: "Quick continue →", zh: "快速续接 →" })}</Text>
                ) : null}
              </TouchableOpacity>
            );
          })
        )}
      </WorkCard>

      <WorkCard
        title={t({ en: "Machines", zh: "机器" })}
        testID="work-machines"
      >
        {snapshot.machines.kind !== "ready" ? (
          <WorkStateNotice state={snapshot.machines} />
        ) : machines.length === 0 ? (
          <Text>
            {t({
              en: "Pair and verify a Desktop Runtime before continuing work.",
              zh: "请先配对并验证 Desktop Runtime，再继续工作。",
            })}
          </Text>
        ) : (
          machines.map((machine, index) => {
            const record = machine as { machineRef?: string };
            return (
              <TouchableOpacity
                key={index}
                testID={`work-machine-${record.machineRef ?? index}`}
                onPress={() =>
                  record.machineRef &&
                  open("WorkMachines", { machineRef: record.machineRef })
                }
              >
                <OpaqueRefText
                  label={machineLabel(machine)}
                  value={record.machineRef}
                />
              </TouchableOpacity>
            );
          })
        )}
      </WorkCard>

      <WorkCard
        title={t({ en: "Today / Next", zh: "今日 / 下一项" })}
        testID="work-today"
      >
        <WorkStateNotice state={model.today} testID="read-state-today" />
        <WorkStateNotice state={model.next} testID="read-state-next" />
        <Text>
          {t({
            en: "Mobile handles today, snooze and lightweight rescheduling. Complex calendars and RRULE stay on Web.",
            zh: "Mobile 负责今日、贪睡与轻量改期；复杂日历和 RRULE 留在 Web。",
          })}
        </Text>
      </WorkCard>

      <WorkCard
        title={t({ en: "Recent result / Receipt", zh: "最近结果 / 回执" })}
        testID="work-receipt"
      >
        {snapshot.receipts.kind !== "ready" ? (
          <WorkStateNotice state={snapshot.receipts} />
        ) : (
          <>
            <OpaqueRefText
              label="completed"
              value={snapshot.receipts.data.completed ? "true" : "false"}
            />
            {snapshot.receipts.data.layers.map((layer) => (
              <OpaqueRefText
                key={layer.layer}
                label={layer.layer}
                value={`${layer.state}:${layer.reason}`}
              />
            ))}
          </>
        )}
        <WorkStateNotice state={model.diffTestResult} testID="work-diff" />
      </WorkCard>

      <WorkCard
        title={t({ en: "Secure handoff", zh: "安全交接" })}
        testID="work-handoff-summary"
      >
        <Text>
          {t({
            en: "A handoff opens from its one-time opaque ref and is accepted only on a verified online machine.",
            zh: "交接通过一次性 opaque ref 打开，并且只能在已验证的在线机器上接受。",
          })}
        </Text>
      </WorkCard>

      {agentId ? (
        <TouchableOpacity
          testID="work-open-actions"
          onPress={() => navigation.navigate("ActionsHome", { agentId })}
        >
          <Text>
            {t({ en: "Action (Work sub-route)", zh: "行动（Work 子路由）" })}
          </Text>
        </TouchableOpacity>
      ) : null}
    </WorkScreenFrame>
  );
}
