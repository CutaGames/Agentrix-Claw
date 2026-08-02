/**
 * CheckinCard — Home Tab daily check-in widget (Sprint E7).
 *
 * Surfaces the first AXP earn hook in the product:
 *   • Idle state → big "领取今日 AXP" button with today's pending amount.
 *   • Claimed state → shows streak + tomorrow's preview.
 *   • Streak policy mirrors backend: base 20 + 5 × priorStreak (cap 80).
 *
 * Success triggers a global AxpToast drift-in so users see the reward
 * materialize even after navigating away.
 */
import React from 'react';
import { Pressable, StyleSheet, Text, View, ActivityIndicator } from 'react-native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useI18n } from '../../stores/i18nStore';
import { colors } from '../../theme/colors';
import { doCheckin, fetchCheckinStatus } from '../../services/axp.api';
import { showAxpToast } from '../../stores/axpToastStore';
import { themedStyles } from '../../theme/useTheme';

export function CheckinCard() {
  const { t } = useI18n();
  const qc = useQueryClient();

  const statusQ = useQuery({
    queryKey: ['axp-checkin-status'],
    queryFn: fetchCheckinStatus,
    staleTime: 60_000,
    retry: 1,
  });

  const checkinM = useMutation({
    mutationFn: doCheckin,
    onSuccess: (res) => {
      showAxpToast({
        amount: res.earned,
        emoji: '☀️',
        reason:
          res.streak > 1
            ? { en: `Daily check-in · day ${res.streak}`, zh: `每日签到 · 连续 ${res.streak} 天` }
            : { en: 'Daily check-in reward', zh: '每日签到奖励' },
      });
      qc.invalidateQueries({ queryKey: ['axp-checkin-status'] });
      qc.invalidateQueries({ queryKey: ['axp-balance'] });
    },
  });

  if (statusQ.isLoading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="small" color={colors.accent} />
      </View>
    );
  }

  const status = statusQ.data;
  if (!status) return null;

  const canClaim = status.can_checkin_today && !checkinM.isPending;

  return (
    <View style={styles.card}>
      <View style={styles.row}>
        <Text style={styles.emoji}>☀️</Text>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>
            {t({ en: 'Daily Check-in', zh: '每日签到' })}
          </Text>
          <Text style={styles.sub}>
            {status.streak > 0
              ? t({
                  en: `🔥 ${status.streak}-day streak · base ${status.base_amount} + bonus ${status.streak_bonus}`,
                  zh: `🔥 连续 ${status.streak} 天 · 基础 ${status.base_amount} + 连击 ${status.streak_bonus}`,
                })
              : t({
                  en: `Earn ${status.base_amount} AXP today · keep streak for +${status.streak_bonus_cap} bonus`,
                  zh: `今日领 ${status.base_amount} AXP · 连击最多再送 ${status.streak_bonus_cap}`,
                })}
          </Text>
        </View>
      </View>

      {canClaim ? (
        <Pressable
          style={({ pressed }) => [styles.claimBtn, pressed && { opacity: 0.8 }]}
          onPress={() => checkinM.mutate()}
        >
          <Text style={styles.claimBtnText}>
            {t({
              en: `Claim +${status.pending_amount} AXP`,
              zh: `领取 +${status.pending_amount} AXP`,
            })}
          </Text>
          <Text style={styles.claimSparkle}>✨</Text>
        </Pressable>
      ) : (
        <View style={styles.doneBadge}>
          <Text style={styles.doneBadgeText}>
            {checkinM.isPending
              ? t({ en: 'Claiming…', zh: '领取中…' })
              : t({
                  en: `Claimed today · back in ~24h`,
                  zh: `今日已领 · 明天再来 +${status.pending_amount}`,
                })}
          </Text>
        </View>
      )}

      {checkinM.isError && (
        <Text style={styles.errorText}>
          {t({ en: 'Check-in failed. Tap to retry.', zh: '签到失败，点我重试' })}
        </Text>
      )}
    </View>
  );
}

const styles = themedStyles(() => StyleSheet.create({
  card: {
    backgroundColor: 'rgba(34,211,238,0.08)',
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: 'rgba(34,211,238,0.35)',
    marginBottom: 12,
    gap: 10,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  emoji: { fontSize: 26 },
  title: { fontSize: 14, fontWeight: '700', color: colors.textPrimary, marginBottom: 2 },
  sub: { fontSize: 12, color: colors.textSecondary, lineHeight: 17 },
  claimBtn: {
    backgroundColor: colors.accent,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  claimBtnText: { color: '#0B1220', fontSize: 14, fontWeight: '800', letterSpacing: 0.3 },
  claimSparkle: { fontSize: 14 },
  doneBadge: {
    backgroundColor: 'rgba(148,163,184,0.12)',
    paddingVertical: 10,
    borderRadius: 12,
    alignItems: 'center',
  },
  doneBadgeText: { fontSize: 12, color: colors.textMuted, fontWeight: '600' },
  errorText: { fontSize: 11, color: '#ef4444', textAlign: 'center' },
  loading: {
    paddingVertical: 24,
    alignItems: 'center',
    backgroundColor: 'rgba(34,211,238,0.06)',
    borderRadius: 16,
    marginBottom: 12,
  },
}));
