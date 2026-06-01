/**
 * LoadingWithTimeout — consistent "slow load" fallback.
 *
 * After `slowAfterMs` (default 3000 ms), escalates the spinner into a card that
 * exposes [Retry] and [Cancel] so the user never sees a 10-second silent spinner.
 *
 * Used across AgentChatScreen, WearableHub, SkillInstall, etc.
 */
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { colors } from '../../theme/colors';
import { useI18n } from '../../stores/i18nStore';

export interface LoadingWithTimeoutProps {
  /** Whether the async operation is still running. */
  loading: boolean;
  /** Display label for the idle spinner state. */
  label?: string;
  /** Milliseconds before escalating to the "taking longer" card. */
  slowAfterMs?: number;
  /** Optional retry callback. If omitted, no retry button is shown. */
  onRetry?: () => void;
  /** Optional cancel callback. If omitted, no cancel button is shown. */
  onCancel?: () => void;
  /** Extra context hint to show below the main message (e.g. "BLE scan 3/12s"). */
  hint?: string;
  /** Compact mode — smaller padding / text, useful for inline use. */
  compact?: boolean;
}

export function LoadingWithTimeout({
  loading,
  label,
  slowAfterMs = 3000,
  onRetry,
  onCancel,
  hint,
  compact,
}: LoadingWithTimeoutProps) {
  const { t } = useI18n();
  const [slow, setSlow] = useState(false);

  useEffect(() => {
    if (!loading) { setSlow(false); return; }
    const id = setTimeout(() => setSlow(true), slowAfterMs);
    return () => clearTimeout(id);
  }, [loading, slowAfterMs]);

  if (!loading) return null;

  const idleLabel = label || t({ en: 'Loading…', zh: '加载中…' });

  if (!slow) {
    return (
      <View style={[styles.idle, compact && styles.idleCompact]}>
        <ActivityIndicator color={colors.accent} size={compact ? 'small' : 'small'} />
        <Text style={[styles.idleText, compact && styles.idleTextCompact]}>{idleLabel}</Text>
      </View>
    );
  }

  return (
    <View style={[styles.slowCard, compact && styles.slowCardCompact]} accessibilityLiveRegion="polite">
      <View style={styles.slowHeader}>
        <ActivityIndicator color={colors.warning} size="small" />
        <Text style={styles.slowTitle}>
          {t({ en: 'Taking longer than expected…', zh: '等待时间较长…' })}
        </Text>
      </View>
      {hint ? <Text style={styles.slowHint}>{hint}</Text> : null}
      {(onRetry || onCancel) && (
        <View style={styles.slowActions}>
          {onRetry && (
            <TouchableOpacity
              testID="loading-retry-btn"
              accessibilityLabel="loading-retry-btn"
              style={[styles.actionBtn, styles.actionRetry]}
              onPress={onRetry}
              activeOpacity={0.8}
            >
              <Text style={styles.actionRetryText}>{t({ en: 'Retry', zh: '重试' })}</Text>
            </TouchableOpacity>
          )}
          {onCancel && (
            <TouchableOpacity
              testID="loading-cancel-btn"
              accessibilityLabel="loading-cancel-btn"
              style={[styles.actionBtn, styles.actionCancel]}
              onPress={onCancel}
              activeOpacity={0.8}
            >
              <Text style={styles.actionCancelText}>{t({ en: 'Cancel', zh: '取消' })}</Text>
            </TouchableOpacity>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  idle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 18,
  },
  idleCompact: { paddingVertical: 8 },
  idleText: { color: colors.textSecondary, fontSize: 14 },
  idleTextCompact: { fontSize: 12 },
  slowCard: {
    marginVertical: 8,
    padding: 14,
    borderRadius: 14,
    backgroundColor: colors.bgCard,
    borderWidth: 1,
    borderColor: colors.warning + '55',
    gap: 10,
  },
  slowCardCompact: { padding: 10, gap: 6 },
  slowHeader: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  slowTitle: { flex: 1, color: colors.textPrimary, fontSize: 14, fontWeight: '600' },
  slowHint: { color: colors.textMuted, fontSize: 12, lineHeight: 17 },
  slowActions: { flexDirection: 'row', gap: 8, marginTop: 4 },
  actionBtn: {
    flex: 1,
    borderRadius: 10,
    paddingVertical: 9,
    alignItems: 'center',
  },
  actionRetry: { backgroundColor: colors.primary },
  actionRetryText: { color: '#FFF', fontSize: 13, fontWeight: '700' },
  actionCancel: { backgroundColor: 'transparent', borderWidth: 1, borderColor: colors.border },
  actionCancelText: { color: colors.textSecondary, fontSize: 13, fontWeight: '600' },
});

export default LoadingWithTimeout;
