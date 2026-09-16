import React from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { useI18n } from "../../../stores/i18nStore";
import { type Palette, useThemedStyles } from "../../../theme/useTheme";

export function EconomyHomeScreen() {
  const { t } = useI18n();
  const styles = useThemedStyles(makeStyles);

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      testID="economy-home-screen"
    >
      <Text style={styles.eyebrow}>ECONOMY</Text>
      <Text style={styles.title}>{t({ en: "Economy", zh: "经济" })}</Text>
      <Text style={styles.intro}>
        {t({
          en: "Review the product boundary here. Live discovery, ordering and provisioning remain unavailable until their end-to-end release gate passes.",
          zh: "在这里查看产品边界。Live 发现、下单与交付在端到端发布门通过前保持不可用。",
        })}
      </Text>

      <View style={styles.card} testID="economy-release-boundary">
        <Text style={styles.cardTitle}>
          {t({ en: "Agent Economy", zh: "Agent Economy" })}
        </Text>
        <Text style={styles.cardBody}>
          {t({
            en: "Not included in this release. No payment, entitlement or fulfillment success is claimed by this screen.",
            zh: "本次发布暂不包含。本页面不会宣称支付、权益或交付已经成功。",
          })}
        </Text>
        <Text style={styles.state} testID="economy-feature-unavailable">
          unavailable · release_scope_excluded
        </Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>
          {t({ en: "Available now", zh: "当前可用" })}
        </Text>
        <Text style={styles.cardBody}>
          {t({
            en: "Agent identity, Companion and Soul Core remain available from the Agent tab. Account settings remain under My.",
            zh: "Agent 身份、Companion 与 Soul Core 仍可从 Agent Tab 使用；账户设置保留在 My。",
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
    state: { color: c.textMuted, fontSize: 12, fontWeight: "700" },
  });
}
