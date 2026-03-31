import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { watchColors } from '../theme/watchColors';
import { watchLayout } from '../theme/watchLayout';
import { API_BASE } from '../../config/env';

interface HomeState {
  agentOnline: boolean;
  lastMessage: string;
  heartRate: number | null;
  steps: number | null;
  unreadAlerts: number;
}

export function WatchHomeScreen() {
  const [state, setState] = useState<HomeState>({
    agentOnline: false,
    lastMessage: '',
    heartRate: null,
    steps: null,
    unreadAlerts: 0,
  });
  const [loading, setLoading] = useState(true);

  const fetchStatus = useCallback(async () => {
    try {
      // Parallel fetch: agent ping + unread alerts
      const [alertRes] = await Promise.allSettled([
        fetch(`${API_BASE}/wearable-telemetry/triggers/unacknowledged/count`, {
          headers: { 'Content-Type': 'application/json' },
        }),
      ]);

      const unread =
        alertRes.status === 'fulfilled' && alertRes.value.ok
          ? (await alertRes.value.json()).count ?? 0
          : 0;

      setState((prev) => ({
        ...prev,
        agentOnline: true,
        unreadAlerts: unread,
      }));
    } catch {
      setState((prev) => ({ ...prev, agentOnline: false }));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStatus();
    const timer = setInterval(fetchStatus, 30_000);
    return () => clearInterval(timer);
  }, [fetchStatus]);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={watchColors.accent} size="small" />
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      {/* Agent Status */}
      <View style={styles.statusRow}>
        <View
          style={[
            styles.statusDot,
            { backgroundColor: state.agentOnline ? watchColors.online : watchColors.offline },
          ]}
        />
        <Text style={styles.statusText}>
          {state.agentOnline ? 'Agent Online' : 'Offline'}
        </Text>
      </View>

      {/* Time */}
      <Text style={styles.timeText}>
        {new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
      </Text>

      {/* Health Mini Cards */}
      <View style={styles.miniCards}>
        <View style={styles.miniCard}>
          <Text style={[styles.miniIcon, { color: watchColors.heartRate }]}>❤</Text>
          <Text style={styles.miniValue}>
            {state.heartRate ?? '--'}
          </Text>
          <Text style={styles.miniUnit}>bpm</Text>
        </View>

        <View style={styles.miniCard}>
          <Text style={[styles.miniIcon, { color: watchColors.steps }]}>🚶</Text>
          <Text style={styles.miniValue}>
            {state.steps != null ? state.steps.toLocaleString() : '--'}
          </Text>
          <Text style={styles.miniUnit}>步</Text>
        </View>
      </View>

      {/* Last Message Preview */}
      {state.lastMessage ? (
        <View style={styles.messageCard}>
          <Text style={styles.messageLabel}>Agent</Text>
          <Text style={styles.messageText} numberOfLines={2}>
            {state.lastMessage}
          </Text>
        </View>
      ) : (
        <TouchableOpacity style={styles.messageCard}>
          <Text style={styles.messagePlaceholder}>← 滑动开始对话</Text>
        </TouchableOpacity>
      )}

      {/* Alerts Badge */}
      {state.unreadAlerts > 0 && (
        <View style={styles.alertBadge}>
          <Text style={styles.alertText}>🔔 {state.unreadAlerts} 条未读告警</Text>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: watchColors.bg,
  },
  content: {
    padding: watchLayout.safePadding,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: watchLayout.screenHeight,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: watchColors.bg,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  statusText: {
    color: watchColors.textSecondary,
    fontSize: watchLayout.fontCaption,
  },
  timeText: {
    color: watchColors.text,
    fontSize: watchLayout.fontHero,
    fontWeight: '200',
    textAlign: 'center',
    marginVertical: 8,
  },
  miniCards: {
    flexDirection: 'row',
    gap: watchLayout.gap,
    marginVertical: watchLayout.gap,
  },
  miniCard: {
    flex: 1,
    backgroundColor: watchColors.surface,
    borderRadius: watchLayout.radiusSm,
    padding: watchLayout.cardPadding,
    alignItems: 'center',
  },
  miniIcon: {
    fontSize: 16,
    marginBottom: 2,
  },
  miniValue: {
    color: watchColors.text,
    fontSize: watchLayout.fontTitle,
    fontWeight: '600',
  },
  miniUnit: {
    color: watchColors.textMuted,
    fontSize: watchLayout.fontMicro,
  },
  messageCard: {
    width: '100%',
    backgroundColor: watchColors.surface,
    borderRadius: watchLayout.radiusSm,
    padding: watchLayout.cardPadding,
    marginTop: watchLayout.gap,
  },
  messageLabel: {
    color: watchColors.accent,
    fontSize: watchLayout.fontMicro,
    marginBottom: 2,
  },
  messageText: {
    color: watchColors.text,
    fontSize: watchLayout.fontCaption,
    lineHeight: 16,
  },
  messagePlaceholder: {
    color: watchColors.textMuted,
    fontSize: watchLayout.fontCaption,
    textAlign: 'center',
  },
  alertBadge: {
    backgroundColor: watchColors.error + '30',
    borderRadius: watchLayout.radiusFull,
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginTop: watchLayout.gap,
  },
  alertText: {
    color: watchColors.error,
    fontSize: watchLayout.fontCaption,
    fontWeight: '600',
  },
});
