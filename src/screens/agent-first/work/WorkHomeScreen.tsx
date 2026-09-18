import React from "react";
import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useDeveloperWorkspaceLive } from "../../../hooks/useDeveloperWorkspaceLive";
import { isDeveloperWorkspaceBuildFlagEnabled } from "../../../services/developerWorkspaceBuildEnv";
import { parseDeveloperWorkspaceOpenRoute } from "../../../services/developerWorkspaceOpenRoute";
import { buildDeveloperWorkHomeModel } from "../../../services/developerWorkspaceWorkModel";
import {
  summarizeWorkspaceReadState,
  toWorkReadStateInput,
  workspaceIsOpen,
} from "../../../services/workRemoteWorkspaceReadState";
import { useI18n } from "../../../stores/i18nStore";
import { getWorkflowEditorWebUrl } from "../../../services/webHandoff";
import { type Palette, useThemedStyles } from "../../../theme/useTheme";
import { useMobileAgentDirectory } from "../useMobileAgentDirectory";
import { FixtureBanner } from "./WorkReadOnlyViews";
import { WorkReadStateCard } from "./WorkReadStateCard";

/**
 * Work home — M1.2.1 read-state cards (theme, testIDs) laid over the DRW
 * remote-workspace model (M2 slice A2, decision d-50).
 *
 * Data comes from `useDeveloperWorkspaceLive` → `buildDeveloperWorkHomeModel`
 * exactly as the DRW candidate wired it; presentation stays the M1.2.1
 * `WorkReadStateCard`, so the flag-off / unpublished / unauthorised / loading
 * cases are one of the eight read states — never a blank screen — and the
 * per-section cards only appear when at least one section carries data.
 */

function explicitFixtureParam(value: unknown): boolean {
  return value === true || value === "1";
}

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

export function WorkHomeScreen({ navigation, route }: any) {
  const { t } = useI18n();
  const styles = useThemedStyles(makeStyles);

  const routeAgentId =
    typeof route?.params?.agentId === "string" ? route.params.agentId : undefined;
  const directory = useMobileAgentDirectory(routeAgentId);
  const liveAgentId =
    directory.model.context.kind === "ready"
      ? directory.model.context.context.agentId
      : routeAgentId;
  const fixture = explicitFixtureParam(route?.params?.fixture);
  const live = useDeveloperWorkspaceLive({ agentId: liveAgentId, fixture });
  const model = buildDeveloperWorkHomeModel({
    routeAgentId,
    directoryContext: directory.model.context,
    flagEnabled: isDeveloperWorkspaceBuildFlagEnabled(),
    mode: fixture ? "fixture" : "api",
    snapshot: live.snapshot ?? undefined,
    liveStatus: live.loading ? "loading" : live.snapshot ? "ready" : "idle",
    openRoute: routeAgentId ? { agentId: routeAgentId } : undefined,
  });
  const snapshot = model.snapshot;
  const summary = summarizeWorkspaceReadState(snapshot);
  const open = workspaceIsOpen(summary);

  const machines = snapshot.machines.kind === "ready" ? snapshot.machines.data : [];
  const sessions = snapshot.sessions.kind === "ready" ? snapshot.sessions.data : [];
  const approvals = snapshot.approvals.kind === "ready" ? snapshot.approvals.data : [];
  const pendingApprovals = approvals.filter(
    (approval) =>
      !!approval &&
      typeof approval === "object" &&
      (approval as { status?: string }).status === "pending",
  );
  // `=== true`, not truthiness: the app tsconfig has `strict: false`, so only an
  // explicit discriminant check narrows these unions.
  const agentId = model.openRoute.ok === true ? model.openRoute.route.agentId : routeAgentId;

  // In-app opens go through the same opaque-ref validator as deep links; a
  // ref that fails it is simply not navigable (no guessed destination).
  const openFace = (screen: string, extra: Record<string, string> = {}) => {
    if (!agentId) return;
    const opened = parseDeveloperWorkspaceOpenRoute({ agentId, ...extra });
    if (opened.ok !== true) return;
    navigation?.navigate?.(screen, { ...opened.route, ...(fixture ? { fixture: "1" } : {}) });
  };

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      testID="work-home-screen"
    >
      <Text style={styles.eyebrow}>WORK</Text>
      <Text style={styles.title}>{t({ en: "Work", zh: "工作" })}</Text>
      <Text style={styles.intro}>
        {t({
          en: "Notifications, approvals and quick resume stay on Mobile. Local execution and adapter settings stay on Desktop.",
          zh: "通知、审批与快速续接在 Mobile；本地执行与适配器设置留在 Desktop。",
        })}
      </Text>

      <FixtureBanner snapshot={snapshot} />

      {/* M1.2.1 / M1.2.2 + M2 A2: one read state for the whole remote
          workspace. Flag off → `unavailable · developer.workspace_v1 ·
          feature_disabled`; loading → `unknown · loading`; live → ready /
          partial / offline_stale with the section counts below. */}
      <WorkReadStateCard
        title={t({ en: "Remote workspace", zh: "远程工作区" })}
        state={summary}
        testID="work-release-boundary"
        stateTestID="work-feature-unavailable"
      >
        <Text style={styles.cardBody} testID="work-remote-summary">
          {t({
            en: `${machines.length} machines · ${sessions.length} sessions · ${pendingApprovals.length} pending approvals`,
            zh: `${machines.length} 台机器 · ${sessions.length} 个会话 · ${pendingApprovals.length} 条待审批`,
          })}
        </Text>
      </WorkReadStateCard>

      {open ? (
        <>
          <WorkReadStateCard
            title={t({
              en: `Needs approval (${pendingApprovals.length})`,
              zh: `待我审批（${pendingApprovals.length}）`,
            })}
            state={toWorkReadStateInput(snapshot.approvals)}
            testID="work-approvals"
          >
            {pendingApprovals.length === 0 ? (
              <Text style={styles.cardBody}>
                {t({ en: "Nothing needs your decision right now.", zh: "当前没有需要你决策的事项。" })}
              </Text>
            ) : (
              pendingApprovals.map((approval, index) => {
                const record = approval as { approvalRef?: string; status?: string; risk?: string };
                return (
                  <Pressable
                    key={record.approvalRef ?? index}
                    style={styles.row}
                    testID={`work-approval-${record.approvalRef ?? index}`}
                    onPress={() =>
                      record.approvalRef && openFace("WorkApprovals", { approvalRef: record.approvalRef })
                    }
                  >
                    <Text style={styles.rowLabel}>
                      {`${record.approvalRef ?? "approval"} · ${record.status ?? "pending"}${record.risk ? ` · ${record.risk}` : ""}`}
                    </Text>
                    <Text style={styles.rowAction}>
                      {t({ en: "Open details and fresh-check →", zh: "查看详情并刷新校验 →" })}
                    </Text>
                  </Pressable>
                );
              })
            )}
          </WorkReadStateCard>

          <WorkReadStateCard
            title={t({ en: "Active sessions", zh: "活跃会话" })}
            state={toWorkReadStateInput(snapshot.sessions)}
            testID="work-sessions"
          >
            {sessions.length === 0 ? (
              <Text style={styles.cardBody}>
                {t({ en: "No resumable sessions on the selected machine.", zh: "所选机器暂无可续接会话。" })}
              </Text>
            ) : (
              sessions.map((session, index) => {
                const record = session as { sessionRef?: string; state?: string };
                return (
                  <Pressable
                    key={record.sessionRef ?? index}
                    style={styles.row}
                    testID={`work-session-${record.sessionRef ?? index}`}
                    onPress={() =>
                      record.sessionRef && openFace("WorkSessions", { sessionRef: record.sessionRef })
                    }
                  >
                    <Text style={styles.rowLabel}>{sessionLabel(session)}</Text>
                    {record.state === "ready" ? (
                      <Text style={styles.rowAction}>{t({ en: "Quick continue →", zh: "快速续接 →" })}</Text>
                    ) : null}
                  </Pressable>
                );
              })
            )}
          </WorkReadStateCard>

          <WorkReadStateCard
            title={t({ en: "Machines", zh: "机器" })}
            state={toWorkReadStateInput(snapshot.machines)}
            testID="work-machines"
          >
            {machines.length === 0 ? (
              <Text style={styles.cardBody}>
                {t({
                  en: "Pair and verify a Desktop Runtime before continuing work.",
                  zh: "请先配对并验证 Desktop Runtime，再继续工作。",
                })}
              </Text>
            ) : (
              machines.map((machine, index) => {
                const record = machine as { machineRef?: string };
                return (
                  <Pressable
                    key={record.machineRef ?? index}
                    style={styles.row}
                    testID={`work-machine-${record.machineRef ?? index}`}
                    onPress={() =>
                      record.machineRef && openFace("WorkMachines", { machineRef: record.machineRef })
                    }
                  >
                    <Text style={styles.rowLabel}>{machineLabel(machine)}</Text>
                  </Pressable>
                );
              })
            )}
          </WorkReadStateCard>

          <WorkReadStateCard
            title={t({ en: "Recent result / Receipt", zh: "最近结果 / 回执" })}
            state={toWorkReadStateInput(snapshot.receipts)}
            testID="work-receipt"
          >
            {snapshot.receipts.kind === "ready" ? (
              <>
                <Text style={styles.rowLabel}>
                  {t({ en: "completed", zh: "已完成" })}: {snapshot.receipts.data.completed ? "true" : "false"}
                </Text>
                {snapshot.receipts.data.layers.map((layer) => (
                  <Text key={layer.layer} style={styles.cardBody}>
                    {layer.layer}: {layer.state}:{layer.reason}
                  </Text>
                ))}
                {agentId ? (
                  <Pressable
                    style={styles.row}
                    testID="work-open-receipts"
                    onPress={() => openFace("WorkReceipts")}
                  >
                    <Text style={styles.rowAction}>{t({ en: "All receipts →", zh: "全部回执 →" })}</Text>
                  </Pressable>
                ) : null}
              </>
            ) : null}
          </WorkReadStateCard>
        </>
      ) : null}

      {/* M2.3 (schedule projection) is not in this wave: the backend has no
          `today / next` projection, so this stays an honest `unavailable`
          with the "open on Web" next action (MTR-R07.3). */}
      <WorkReadStateCard
        title={t({ en: "Today / Next", zh: "今日 / 下一项" })}
        state={toWorkReadStateInput(model.today)}
        testID="work-today"
        stateTestID="work-today-state"
      />

      <View style={styles.card} testID="work-desktop-boundary">
        <Text style={styles.cardTitle}>
          {t({ en: "Desktop execution", zh: "Desktop 执行" })}
        </Text>
        <Text style={styles.cardBody}>
          {t({
            en: "Commands, files, IDE and CLI side effects require the signed Desktop app and explicit local confirmation. A handoff opens from its one-time opaque ref and is accepted only on a verified online machine.",
            zh: "命令、文件、IDE 与 CLI 副作用必须通过已签名 Desktop 应用及明确的本机确认；交接通过一次性 opaque ref 打开，且只能在已验证的在线机器上接受。",
          })}
        </Text>
        {open && agentId ? (
          <Pressable
            style={styles.row}
            testID="work-open-handoffs"
            onPress={() => openFace("WorkHandoffs")}
          >
            <Text style={styles.rowAction}>{t({ en: "Secure handoff →", zh: "安全交接 →" })}</Text>
          </Pressable>
        ) : null}
      </View>

      {/* M1.4.4 / MTR-R09.5 (matrix #38): the full Workflow editor is offline on
          Mobile; this card is the "open in Web" handoff, nothing more. */}
      <View style={styles.card} testID="work-workflow-web-handoff">
        <Text style={styles.cardTitle}>
          {t({ en: "Workflow editor", zh: "工作流编辑器" })}
        </Text>
        <Text style={styles.cardBody}>
          {t({
            en: "Workflows are edited on Web. Mobile keeps only this handoff; runs and schedules stay on the Backend.",
            zh: "工作流在 Web 上编辑；Mobile 只保留这个接力入口，运行与排期仍在 Backend。",
          })}
        </Text>
        <Pressable
          accessibilityRole="link"
          onPress={() => {
            void Linking.openURL(getWorkflowEditorWebUrl()).catch(() => {});
          }}
          style={styles.linkButton}
          testID="work-workflow-open-web"
        >
          <Text style={styles.linkButtonText}>
            {t({ en: "Open in Web ↗", zh: "在 Web 打开 ↗" })}
          </Text>
        </Pressable>
      </View>

      {agentId ? (
        <Pressable
          style={styles.linkButton}
          testID="work-open-actions"
          onPress={() => navigation?.navigate?.("ActionsHome", { agentId })}
        >
          <Text style={styles.linkButtonText}>
            {t({ en: "Actions (Work sub-route) →", zh: "行动（Work 子路由）→" })}
          </Text>
        </Pressable>
      ) : null}
    </ScrollView>
  );
}

function makeStyles(c: Palette) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: c.bgPrimary },
    content: { padding: 18, paddingBottom: 48, gap: 14 },
    eyebrow: {
      color: c.accent,
      fontSize: 11,
      fontWeight: "800",
      letterSpacing: 1.2,
    },
    title: { color: c.textPrimary, fontSize: 28, fontWeight: "800" },
    intro: { color: c.textSecondary, fontSize: 14, lineHeight: 21 },
    card: {
      backgroundColor: c.bgCard,
      borderRadius: 16,
      padding: 15,
      borderWidth: 1,
      borderColor: c.border,
      gap: 8,
    },
    cardTitle: { color: c.textPrimary, fontSize: 16, fontWeight: "700" },
    cardBody: { color: c.textSecondary, fontSize: 13, lineHeight: 20 },
    row: { paddingVertical: 6, gap: 2 },
    rowLabel: { color: c.textPrimary, fontSize: 13, lineHeight: 19 },
    rowAction: { color: c.accent, fontSize: 13, fontWeight: "600" },
    linkButton: {
      alignSelf: "flex-start",
      marginTop: 4,
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: c.accent,
    },
    linkButtonText: { color: c.accent, fontSize: 13, fontWeight: "700" },
  });
}
