/**
 * InboxScreen — Global 🔔 bell (Sprint A8).
 *
 * Unifies three previously scattered feeds into one inbox:
 *   - Pending approvals (L0-L3) — from NotificationCenter (type=approval)
 *   - Handoffs (desktop → mobile, etc.) — from presence events
 *   - General notifications (task complete, social, etc.)
 *
 * Sprint A ships a thin wrapper around the existing
 * `NotificationCenterScreen` (real data, proven rendering) plus a section
 * layout that will receive Handoff + real-time Presence events in
 * Sprint B (after backend unified devices API lands).
 */
import React, { useCallback, useMemo } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, Pressable } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { colors } from '../../theme/colors';
import { useI18n } from '../../stores/i18nStore';
import { useNotificationStore } from '../../stores/notificationStore';
import { NotificationCenterScreen } from '../notifications/NotificationCenterScreen';

export function InboxScreen() {
  const navigation = useNavigation<any>();
  const { t } = useI18n();
  const unreadCount = useNotificationStore((s) => s.unreadCount);
  const approvalCount = useNotificationStore((s) => s.approvalCount);

  const close = useCallback(() => {
    if (navigation.canGoBack()) navigation.goBack();
    else navigation.navigate('Main');
  }, [navigation]);

  return (
    <View style={styles.container}>
      <View style={styles.topBar}>
        <TouchableOpacity onPress={close} style={styles.closeBtn}>
          <Text style={styles.closeBtnText}>✕</Text>
        </TouchableOpacity>
        <Text style={styles.title}>🔔 {t({ en: 'Inbox', zh: '通知' })}</Text>
        <View style={{ width: 32 }} />
      </View>

      <View style={styles.summaryRow}>
        <Pressable style={[styles.summaryCard, styles.approvalCard]} onPress={() => {/* filter in future */}}>
          <Text style={styles.summaryValue}>{approvalCount}</Text>
          <Text style={styles.summaryLabel}>{t({ en: 'Approvals', zh: '待审批' })}</Text>
        </Pressable>
        <Pressable style={styles.summaryCard}>
          <Text style={styles.summaryValue}>0</Text>
          <Text style={styles.summaryLabel}>{t({ en: 'Handoffs', zh: '接力' })}</Text>
        </Pressable>
        <Pressable style={styles.summaryCard}>
          <Text style={styles.summaryValue}>{unreadCount}</Text>
          <Text style={styles.summaryLabel}>{t({ en: 'Updates', zh: '通知' })}</Text>
        </Pressable>
      </View>

      <View style={{ flex: 1 }}>
        <NotificationCenterScreen />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bgPrimary },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
  },
  closeBtn: {
    width: 32, height: 32, borderRadius: 16,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: colors.bgCard,
  },
  closeBtnText: { fontSize: 16, color: colors.textPrimary, fontWeight: '600' },
  title: { fontSize: 18, fontWeight: '700', color: colors.textPrimary },
  summaryRow: {
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  summaryCard: {
    flex: 1,
    backgroundColor: colors.bgCard,
    borderRadius: 14,
    padding: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  approvalCard: { borderColor: colors.accent },
  summaryValue: { fontSize: 22, fontWeight: '800', color: colors.textPrimary },
  summaryLabel: { fontSize: 11, color: colors.textMuted, marginTop: 2 },
});
