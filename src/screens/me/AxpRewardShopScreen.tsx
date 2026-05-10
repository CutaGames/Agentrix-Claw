/**
 * AxpRewardShopScreen — Sprint A placeholder.
 *
 * Real impl in Sprint C3-C4:
 *   - Subscription discount redemption (up to 20%)
 *   - Special skin / NFT preorder
 *   - Limited event tickets
 *   - Draw / lottery (100 AXP per pull)
 */
import React from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { colors } from '../../theme/colors';
import { useI18n } from '../../stores/i18nStore';

export function AxpRewardShopScreen() {
  const { t } = useI18n();
  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>🛍 {t({ en: 'Redeem Shop', zh: '兑换中心' })}</Text>
      <Text style={styles.hint}>
        {t({
          en: 'Redemption lineup coming in Sprint C4 — subscription discount, limited skins, event tickets, lottery.',
          zh: '兑换品将于 Sprint C4 上线 — 订阅抵扣 · 限定皮肤 · 活动门票 · 抽奖。',
        })}
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bgPrimary },
  content: { padding: 24, alignItems: 'center' },
  title: { fontSize: 22, fontWeight: '800', color: colors.textPrimary, marginBottom: 16 },
  hint: { fontSize: 13, color: colors.textMuted, textAlign: 'center', lineHeight: 20 },
});
