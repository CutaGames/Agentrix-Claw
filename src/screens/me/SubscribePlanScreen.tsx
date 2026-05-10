/**
 * SubscribePlanScreen — Sprint A placeholder.
 *
 * Real impl in Sprint D2:
 *   - Show 5 tiers (Free / Lite $4.99 / Plus $14.99 / Pro $29.99 / Elite $69)
 *   - Yearly toggle (×10 annual discount)
 *   - Stripe subscription create flow
 *   - AXP redemption up to 20% of subscription fee
 *
 * Spec: MOBILE_REFACTOR_AND_ECOSYSTEM_PLAN_2026-05 §3
 */
import React from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { colors } from '../../theme/colors';
import { useI18n } from '../../stores/i18nStore';

const TIERS: Array<{ key: string; name: string; price: string; blurb: { en: string; zh: string } }> = [
  { key: 'free',  name: 'Free',   price: '$0',     blurb: { en: 'Try everything, small quotas', zh: '所有功能可试 · 小配额' } },
  { key: 'lite',  name: 'Lite',   price: '$4.99',  blurb: { en: 'Remove the hard limits', zh: '去除硬限制' } },
  { key: 'plus',  name: 'Plus',   price: '$14.99', blurb: { en: 'Golden tier · creator / small merchant', zh: '黄金档 · 创作者 / 小商户' } },
  { key: 'pro',   name: 'Pro',    price: '$29.99', blurb: { en: 'Power users · full dev toolkit', zh: '核心 · 全开发者套件' } },
  { key: 'elite', name: 'Elite',  price: '$69',    blurb: { en: 'Brand tier · 0% fees · Pet SDK beta', zh: '品牌档 · 0 手续费 · Pet SDK' } },
];

export function SubscribePlanScreen() {
  const { t } = useI18n();
  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>{t({ en: 'Choose your plan', zh: '选择你的订阅' })}</Text>
      <Text style={styles.subtitle}>
        {t({ en: 'All abilities available at every tier. Quotas scale with you.', zh: '所有能力在每档都开放 · 配额随订阅升级' })}
      </Text>
      {TIERS.map((tier) => (
        <View key={tier.key} style={styles.card}>
          <View style={styles.headerRow}>
            <Text style={styles.tierName}>{tier.name}</Text>
            <Text style={styles.tierPrice}>{tier.price}<Text style={styles.tierUnit}>/mo</Text></Text>
          </View>
          <Text style={styles.tierBlurb}>{t(tier.blurb)}</Text>
        </View>
      ))}
      <Text style={styles.footer}>
        {t({ en: 'Stripe integration coming in Sprint D2.', zh: 'Stripe 订阅在 Sprint D2 接入。' })}
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bgPrimary },
  content: { padding: 16, paddingBottom: 40 },
  title: { fontSize: 22, fontWeight: '800', color: colors.textPrimary, marginBottom: 4 },
  subtitle: { fontSize: 13, color: colors.textMuted, marginBottom: 16 },
  card: {
    backgroundColor: colors.bgCard,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 10,
  },
  headerRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 6 },
  tierName: { fontSize: 18, fontWeight: '700', color: colors.textPrimary },
  tierPrice: { fontSize: 22, fontWeight: '800', color: colors.accent },
  tierUnit: { fontSize: 12, color: colors.textMuted, fontWeight: '600' },
  tierBlurb: { fontSize: 13, color: colors.textMuted, lineHeight: 18 },
  footer: { textAlign: 'center', fontSize: 11, color: colors.textMuted, marginTop: 12 },
});
