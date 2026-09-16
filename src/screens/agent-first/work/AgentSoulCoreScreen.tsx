import React from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { resolveAgentSoulCoreDestination } from "../../../navigation/agent-first/iaContract";
import { useI18n } from "../../../stores/i18nStore";
import { type Palette, useThemedStyles } from "../../../theme/useTheme";
import { useMobileAgentDirectory } from "../useMobileAgentDirectory";

export function AgentSoulCoreScreen({ route }: any) {
  const { t } = useI18n();
  const styles = useThemedStyles(makeStyles);
  const agentId =
    typeof route?.params?.agentId === "string" ? route.params.agentId : "";
  const destination = resolveAgentSoulCoreDestination(agentId);
  const directory = useMobileAgentDirectory(agentId);
  const agent = directory.model.agents.find((item) => item.agentId === agentId);
  const mappingReady = agent?.canonicalMapping === "ready";

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      testID="agent-soul-core-screen"
    >
      <Text style={styles.eyebrow}>AGENT</Text>
      <Text style={styles.title}>Soul Core</Text>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>
          {t({ en: "Identity continuity", zh: "身份连续性" })}
        </Text>
        <Text style={styles.row}>agentId: {agentId || "—"}</Text>
        <Text style={styles.row}>soulCoreId: {agent?.soulCoreId ?? "—"}</Text>
        <Text
          style={mappingReady ? styles.ready : styles.unavailable}
          testID="agent-soul-core-mapping"
        >
          {mappingReady
            ? t({ en: "Canonical active mapping", zh: "Canonical active 映射" })
            : t({ en: "Canonical mapping unavailable", zh: "Canonical 映射不可用" })}
        </Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>
          {t({ en: "Ownership & Authority", zh: "所有权与 Authority" })}
        </Text>
        <Text style={styles.unavailable}>
          unavailable · canonical_projection_required
        </Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>
          {t({ en: "Navigation boundary", zh: "导航边界" })}
        </Text>
        <Text testID="agent-soul-core-tab">{destination.tab}</Text>
        <Text testID="agent-soul-core-screen-name">{destination.screen}</Text>
        <Text style={styles.row}>
          {t({
            en: "This view stays on the Agent stack and never promotes an unavailable hardware or recovery claim.",
            zh: "该视图保留在 Agent 栈，不会把不可用的硬件或恢复能力宣称为已完成。",
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
    card: {
      backgroundColor: c.bgCard,
      borderRadius: 16,
      padding: 15,
      borderWidth: 1,
      borderColor: c.border,
      gap: 8,
    },
    cardTitle: { color: c.textPrimary, fontSize: 16, fontWeight: "700" },
    row: { color: c.textSecondary, fontSize: 13, lineHeight: 20 },
    ready: { color: "#25855a", fontSize: 13, fontWeight: "700" },
    unavailable: { color: c.textMuted, fontSize: 12, fontWeight: "700" },
  });
}
