import React from "react";
import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import type { DeveloperWorkspaceSnapshot } from "../../../services/developerWorkspaceClient";
import { snapshotUsesFixturePresentation } from "../../../services/developerWorkspaceClient";
import {
  developerWorkspaceStateCopy,
  type DeveloperWorkspaceReadState,
} from "../../../services/developerWorkspaceReadState";
import { useI18n } from "../../../stores/i18nStore";
import { useThemedStyles, type Palette } from "../../../theme/useTheme";

export function WorkStateNotice({
  state,
  testID,
}: {
  state: DeveloperWorkspaceReadState;
  testID?: string;
}) {
  const { language } = useI18n();
  const styles = useThemedStyles(makeStyles);
  const copy = developerWorkspaceStateCopy(state, language === "zh");
  return (
    <View style={styles.notice} testID={testID ?? `read-state-${state.kind}`}>
      <Text style={styles.noticeTitle}>{copy.title}</Text>
      <Text style={styles.noticeText}>{copy.detail}</Text>
    </View>
  );
}

export function FixtureBanner({
  snapshot,
}: {
  snapshot: DeveloperWorkspaceSnapshot;
}) {
  const { t } = useI18n();
  const styles = useThemedStyles(makeStyles);
  if (!snapshotUsesFixturePresentation(snapshot)) return null;
  return (
    <View style={styles.notice} testID="developer-workspace-fixture-banner">
      <Text style={styles.noticeTitle}>
        {t({ en: "Fixture · default-off", zh: "Fixture · 默认关闭" })}
      </Text>
      <Text style={styles.noticeText}>
        {t({
          en: `capturedAt ${snapshot.meta.capturedAt}. Local contract fixture only. Not live success, settlement, or approval.`,
          zh: `capturedAt ${snapshot.meta.capturedAt}。仅本地 contract fixture，不是 live 成功、结算或已审批。`,
        })}
      </Text>
    </View>
  );
}

export function MutationGate({
  snapshot,
  onSend,
  onApprove,
}: {
  snapshot: DeveloperWorkspaceSnapshot;
  onSend?: () => void;
  onApprove?: () => void;
}) {
  const { t } = useI18n();
  const styles = useThemedStyles(makeStyles);
  if (snapshot.mutation.send.visible || snapshot.mutation.approve.visible) {
    return (
      <View style={styles.blocked} testID="developer-mutation-cta">
        {snapshot.mutation.send.visible ? (
          <TouchableOpacity
            disabled={!snapshot.mutation.send.enabled}
            style={
              snapshot.mutation.send.enabled
                ? styles.enabledButton
                : styles.disabledButton
            }
            testID="developer-send-cta"
            onPress={snapshot.mutation.send.enabled ? onSend : undefined}
          >
            <Text
              style={
                snapshot.mutation.send.enabled
                  ? styles.enabledButtonText
                  : styles.disabledButtonText
              }
            >
              {t({ en: "Send", zh: "发送" })}
            </Text>
          </TouchableOpacity>
        ) : null}
        {snapshot.mutation.approve.visible ? (
          <TouchableOpacity
            disabled={!snapshot.mutation.approve.enabled}
            style={
              snapshot.mutation.approve.enabled
                ? styles.enabledButton
                : styles.disabledButton
            }
            testID="developer-approve-cta"
            onPress={snapshot.mutation.approve.enabled ? onApprove : undefined}
          >
            <Text
              style={
                snapshot.mutation.approve.enabled
                  ? styles.enabledButtonText
                  : styles.disabledButtonText
              }
            >
              {t({ en: "Approve once", zh: "一次性批准" })}
            </Text>
          </TouchableOpacity>
        ) : null}
      </View>
    );
  }
  return (
    <View style={styles.helperBox} testID="developer-mutation-cta-absent">
      <Text style={styles.helper}>
        {t({
          en: "Send/Approve stay hidden until a live session or approval capability is present.",
          zh: "没有 live session/approval capability 时，不显示 Send/Approve。",
        })}
      </Text>
    </View>
  );
}

export function OpaqueRefText({
  label,
  value,
}: {
  label: string;
  value?: string;
}) {
  const styles = useThemedStyles(makeStyles);
  return (
    <Text style={styles.muted}>
      {label}: {value ?? "—"}
    </Text>
  );
}

export function WorkScreenFrame({
  title,
  children,
  testID,
  eyebrow = "WORK",
}: {
  title: string;
  children: React.ReactNode;
  testID: string;
  eyebrow?: string;
}) {
  const styles = useThemedStyles(makeStyles);
  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      testID={testID}
    >
      <Text style={styles.eyebrow}>{eyebrow}</Text>
      <Text style={styles.pageTitle}>{title}</Text>
      {children}
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
    pageTitle: {
      color: c.textPrimary,
      fontSize: 28,
      fontWeight: "800",
      letterSpacing: -0.5,
    },
    notice: {
      backgroundColor: "#fff7dd",
      borderRadius: 16,
      padding: 14,
      borderWidth: 1,
      borderColor: "#ead8a2",
    },
    noticeTitle: { color: "#5f4b22", fontSize: 14, fontWeight: "800" },
    noticeText: {
      color: "#75633c",
      fontSize: 12,
      lineHeight: 18,
      marginTop: 4,
    },
    muted: { color: c.textMuted, fontSize: 12, lineHeight: 18 },
    helper: { color: c.textMuted, fontSize: 11, lineHeight: 16 },
    helperBox: {
      backgroundColor: c.bgCard,
      borderRadius: 14,
      padding: 12,
      borderWidth: 1,
      borderColor: c.border,
    },
    blocked: { gap: 8 },
    disabledButton: {
      minHeight: 48,
      borderRadius: 14,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: "#d9d3cd",
    },
    disabledButtonText: { color: "#7a736c", fontSize: 15, fontWeight: "800" },
    enabledButton: {
      minHeight: 48,
      borderRadius: 14,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: "#2f6fed",
    },
    enabledButtonText: { color: "#fff", fontSize: 15, fontWeight: "800" },
    card: {
      backgroundColor: c.bgCard,
      borderRadius: 16,
      padding: 15,
      borderWidth: 1,
      borderColor: c.border,
      gap: 5,
    },
    cardTitle: { color: c.textPrimary, fontSize: 15, fontWeight: "700" },
  });
}

export function WorkCard({
  title,
  children,
  testID,
}: {
  title: string;
  children: React.ReactNode;
  testID?: string;
}) {
  const styles = useThemedStyles(makeStyles);
  return (
    <View style={styles.card} testID={testID}>
      <Text style={styles.cardTitle}>{title}</Text>
      {children}
    </View>
  );
}
