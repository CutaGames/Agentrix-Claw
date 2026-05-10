/**
 * AxpCenterScreen — Sprint A placeholder.
 *
 * Real impl in Sprint C3-C4:
 *   - Balance (large display)
 *   - Last 7 days earned / spent summary
 *   - Full ledger history
 *   - Redeem button → AxpRewardShopScreen
 *
 * Spec: MOBILE_REFACTOR_AND_ECOSYSTEM_PLAN_2026-05 §4
 */
import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { colors } from '../../theme/colors';
import { useI18n } from '../../stores/i18nStore';

export function AxpCenterScreen() {
  const navigation = useNavigation<any>();
  const { t } = useI18n();
  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>💎 {t({ en: 'AXP Center', zh: 'AXP 中心' })}</Text>
      <View style={styles.balanceCard}>
        <Text style={styles.balanceLabel}>{t({ en: 'Balance', zh: '余额' })}</Text>
        <Text style={styles.balanceValue}>0</Text>
        <Text style={styles.balanceSub}>≈ $0.00</Text>
      </View>

      <TouchableOpacity style={styles.actionBtn} onPress={() => navigation.navigate('AxpRewardShop')}>
        <Text style={styles.actionBtnText}>🛍 {t({ en: 'Open Redeem Shop', zh: '兑换中心' })}</Text>
      </TouchableOpacity>

      <Text style={styles.hint}>
        {t({
          en: 'Earn AXP by daily check-in, chatting, inviting friends, completing tasks, and selling skills/skins.',
          zh: '通过签到、对话、邀请好友、完成任务、售卖技能/皮肤获得 AXP。',
        })}
      </Text>
      <Text style={styles.footer}>
        {t({ en: 'Real balance + history goes live in Sprint C3.', zh: '真实余额与历史在 Sprint C3 启用。' })}
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bgPrimary },
  content: { padding: 16, paddingBottom: 40 },
  title: { fontSize: 22, fontWeight: '800', color: colors.textPrimary, marginBottom: 16 },
  balanceCard: {
    backgroundColor: colors.bgCard,
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 16,
  },
  balanceLabel: { fontSize: 12, color: colors.textMuted, marginBottom: 4 },
  balanceValue: { fontSize: 40, fontWeight: '800', color: colors.accent, marginBottom: 4 },
  balanceSub: { fontSize: 12, color: colors.textMuted },
  actionBtn: {
    backgroundColor: colors.accent,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    marginBottom: 16,
  },
  actionBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  hint: { fontSize: 13, color: colors.textMuted, lineHeight: 20, marginBottom: 12 },
  footer: { textAlign: 'center', fontSize: 11, color: colors.textMuted, opacity: 0.6 },
});
