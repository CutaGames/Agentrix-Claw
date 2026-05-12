/**
 * LlmBudgetBar — Sprint G #14
 *
 * Displays LLM monthly budget usage in the Summon Tab footer.
 * Per cross-platform PRD §13.10: "Quota 可视化：钱包 / AXP 中心显示
 * '本月已用 $12.30 / $20'"
 *
 * Shows:
 *   - Progress bar (used / total)
 *   - Dollar amount used vs budget
 *   - Tier label
 *   - Tap → opens upgrade / AXP deduct / BYOK three-choice modal
 */
import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, Pressable, Alert } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { useNavigation } from '@react-navigation/native';
import { colors } from '../../theme/colors';
import { useI18n } from '../../stores/i18nStore';
import { fetchMyQuota, type TierQuota } from '../../services/subscription.api';
import { fetchQuotaStatus, type QuotaStatus } from '../../services/token-quota.service';

export function LlmBudgetBar() {
  const { t } = useI18n();
  const navigation = useNavigation<any>();

  const quotaQ = useQuery({
    queryKey: ['me-quota'],
    queryFn: fetchMyQuota,
    staleTime: 60_000,
    retry: 1,
  });

  const usageQ = useQuery({
    queryKey: ['token-quota-me'],
    queryFn: fetchQuotaStatus,
    staleTime: 30_000,
    retry: 1,
  });

  const quota = quotaQ.data;
  const usage = usageQ.data;

  if (!quota || !usage) return null;

  const budgetCents = quota.llm_budget_cents_monthly;
  const usedCents = Math.round((usage.usagePercent / 100) * budgetCents);
  const pct = Math.min(100, usage.usagePercent);
  const isExhausted = usage.quotaExhausted;
  const isWarning = pct >= 80;

  const barColor = isExhausted
    ? '#ef4444'
    : isWarning
      ? '#f59e0b'
      : colors.accent;

  const handlePress = useCallback(() => {
    if (isExhausted) {
      // Show three-choice modal per PRD §13.7 超额策略
      Alert.alert(
        t({ en: 'Budget Exhausted', zh: '预算已用完' }),
        t({
          en: 'Your monthly LLM budget is used up. Choose how to continue:',
          zh: '本月 LLM 预算已耗尽，选择继续方式：',
        }),
        [
          {
            text: t({ en: 'AXP Deduct', zh: 'AXP 抵扣' }),
            onPress: () => navigation.getParent?.()?.navigate('Me', { screen: 'AxpCenter' }),
          },
          {
            text: t({ en: 'Upgrade Plan', zh: '升级订阅' }),
            onPress: () => navigation.getParent?.()?.navigate('Me', { screen: 'Subscribe' }),
          },
          {
            text: t({ en: 'BYOK (Use own key)', zh: '自带 API Key' }),
            onPress: () => navigation.getParent?.()?.navigate('Me', { screen: 'ApiKeys' }),
          },
          { text: t({ en: 'Cancel', zh: '取消' }), style: 'cancel' },
        ],
      );
    } else {
      // Navigate to subscription page
      navigation.getParent?.()?.navigate('Me', { screen: 'Subscribe' });
    }
  }, [isExhausted, navigation, t]);

  return (
    <Pressable style={styles.container} onPress={handlePress}>
      <View style={styles.row}>
        <Text style={styles.label}>
          {t({ en: 'LLM Budget', zh: 'LLM 预算' })}
        </Text>
        <Text style={[styles.amount, isExhausted && styles.amountExhausted]}>
          ${(usedCents / 100).toFixed(2)} / ${(budgetCents / 100).toFixed(2)}
        </Text>
      </View>
      <View style={styles.track}>
        <View style={[styles.fill, { width: `${pct}%`, backgroundColor: barColor }]} />
      </View>
      <View style={styles.row}>
        <Text style={styles.tier}>
          {quota.effective_tier.toUpperCase()}
        </Text>
        <Text style={styles.pct}>
          {Math.round(pct)}%
          {isExhausted && ` · ${t({ en: 'Tap for options', zh: '点击选择' })}`}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: colors.bgCard,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  label: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.textMuted,
  },
  amount: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  amountExhausted: {
    color: '#ef4444',
  },
  track: {
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.bgSecondary,
    marginVertical: 6,
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    borderRadius: 2,
  },
  tier: {
    fontSize: 10,
    fontWeight: '600',
    color: colors.accent,
  },
  pct: {
    fontSize: 10,
    color: colors.textMuted,
  },
});
