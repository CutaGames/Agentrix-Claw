import React from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { useI18n } from "../../../stores/i18nStore";
import { type Palette, useThemedStyles } from "../../../theme/useTheme";
import { WorkReadStateCard } from "./WorkReadStateCard";

/**
 * The remote workspace read-state for this release. Fixed here — not fetched —
 * because the canonical service is excluded from the release scope (design §5
 * `unavailable`), and MTR-R07.3 requires the capability and reason to be shown
 * verbatim rather than an empty card.
 */
const REMOTE_WORKSPACE_STATE = {
  state: "unavailable",
  capability: "remote_workspace",
  reason: "release_scope_excluded",
} as const;

export function WorkHomeScreen() {
  const { t } = useI18n();
  const styles = useThemedStyles(makeStyles);

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
          en: "Use Mobile to review work status and keep your Agent close. Local execution and adapter settings stay on Desktop.",
          zh: "在 Mobile 查看工作状态并保持 Agent 在线；本地执行与适配器设置留在 Desktop。",
        })}
      </Text>

      {/* M1.2.1 / M1.2.2: read-state → display semantics come from the pure
          reducer; this card only lays them out. */}
      <WorkReadStateCard
        title={t({ en: "Remote workspace", zh: "远程工作区" })}
        state={REMOTE_WORKSPACE_STATE}
        testID="work-release-boundary"
        stateTestID="work-feature-unavailable"
      />

      <View style={styles.card} testID="work-desktop-boundary">
        <Text style={styles.cardTitle}>
          {t({ en: "Desktop execution", zh: "Desktop 执行" })}
        </Text>
        <Text style={styles.cardBody}>
          {t({
            en: "Commands, files, IDE and CLI side effects require the signed Desktop app and explicit local confirmation.",
            zh: "命令、文件、IDE 与 CLI 副作用必须通过已签名 Desktop 应用及明确的本机确认。",
          })}
        </Text>
      </View>
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
  });
}
