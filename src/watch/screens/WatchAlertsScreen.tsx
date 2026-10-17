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
import type { TriggerEvent } from '../../services/wearables/wearableTypes';
import { useWatchAuth } from '../hooks/useWatchAuth';

export function WatchAlertsScreen() {
  const { authFetch, loading: authLoading, requestAuthState } = useWatchAuth();
  const [alerts, setAlerts] = useState<TriggerEvent[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchAlerts = useCallback(async () => {
    try {
      const res = await authFetch(`${API_BASE}/wearable-telemetry/triggers?limit=20`, {
        headers: { 'Content-Type': 'application/json' },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setAlerts(Array.isArray(data) ? data : data.items ?? []);
    } catch {
      void requestAuthState();
      // silent on watch
    } finally {
      setLoading(false);
    }
  }, [authFetch, requestAuthState]);

  useEffect(() => {
    if (authLoading) return;
    fetchAlerts();
    const timer = setInterval(fetchAlerts, 30_000);
    return () => clearInterval(timer);
  }, [authLoading, fetchAlerts]);

  const acknowledge = useCallback(async (eventId: string) => {
    try {
      await authFetch(`${API_BASE}/wearable-telemetry/triggers/${eventId}/acknowledge`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      setAlerts((prev) =>
        prev.map((a) => (a.id === eventId ? { ...a, acknowledged: true } : a)),
      );
    } catch {
      // silent
    }
  }, [authFetch]);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={watchColors.accent} size="small" />
      </View>
    );
  }

  const unread = alerts.filter((a) => !a.acknowledged);
  const read = alerts.filter((a) => a.acknowledged);

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      <Text style={styles.title}>
        告警 {unread.length > 0 ? `(${unread.length})` : ''}
      </Text>

      {alerts.length === 0 && (
        <Text style={styles.emptyText}>暂无告警 ✓</Text>
      )}

      {/* Unacknowledged alerts first */}
      {unread.map((alert) => (
        <AlertCard
          key={alert.id}
          alert={alert}
          onAcknowledge={() => acknowledge(alert.id)}
        />
      ))}

      {/* Acknowledged alerts */}
      {read.map((alert) => (
        <AlertCard key={alert.id} alert={alert} />
      ))}
    </ScrollView>
  );
}

function AlertCard({
  alert,
  onAcknowledge,
}: {
  alert: TriggerEvent;
  onAcknowledge?: () => void;
}) {
  const channelIcon: Record<string, string> = {
    heart_rate: '❤',
    spo2: '○',
    temperature: '🌡',
    steps: '🚶',
    battery: '🔋',
  };

  const timeStr = new Date(alert.triggeredAt).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    <View
      style={[
        alertStyles.card,
        alert.acknowledged && alertStyles.cardAcked,
      ]}
    >
      <View style={alertStyles.header}>
        <Text style={alertStyles.icon}>
          {channelIcon[alert.channel] ?? '⚡'}
        </Text>
        <Text
          style={[alertStyles.name, alert.acknowledged && alertStyles.nameAcked]}
          numberOfLines={1}
        >
          {alert.ruleName}
        </Text>
        <Text style={alertStyles.time}>{timeStr}</Text>
      </View>

      <Text style={alertStyles.detail}>
        {alert.channel} {alert.condition} {alert.threshold} → 实际值 {alert.value}
      </Text>

      {!alert.acknowledged && onAcknowledge && (
        <View style={alertStyles.actions}>
          <TouchableOpacity style={alertStyles.ackBtn} onPress={onAcknowledge}>
            <Text style={alertStyles.ackBtnText}>✓ 确认</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: watchColors.bg,
  },
  content: {
    padding: watchLayout.safePadding,
    minHeight: watchLayout.screenHeight,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: watchColors.bg,
  },
  title: {
    color: watchColors.textSecondary,
    fontSize: watchLayout.fontCaption,
    textAlign: 'center',
    marginBottom: watchLayout.gap,
  },
  emptyText: {
    color: watchColors.textMuted,
    fontSize: watchLayout.fontCaption,
    textAlign: 'center',
    marginTop: watchLayout.screenHeight * 0.25,
  },
});

const alertStyles = StyleSheet.create({
  card: {
    backgroundColor: watchColors.surface,
    borderRadius: watchLayout.radiusSm,
    padding: watchLayout.cardPadding,
    marginBottom: watchLayout.gap,
    borderLeftWidth: 3,
    borderLeftColor: watchColors.alert,
  },
  cardAcked: {
    borderLeftColor: watchColors.textMuted,
    opacity: 0.6,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  icon: {
    fontSize: 14,
  },
  name: {
    flex: 1,
    color: watchColors.text,
    fontSize: watchLayout.fontCaption,
    fontWeight: '600',
  },
  nameAcked: {
    color: watchColors.textMuted,
  },
  time: {
    color: watchColors.textMuted,
    fontSize: watchLayout.fontMicro,
  },
  detail: {
    color: watchColors.textSecondary,
    fontSize: watchLayout.fontMicro,
    marginBottom: 6,
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 8,
  },
  ackBtn: {
    backgroundColor: watchColors.success + '30',
    borderRadius: watchLayout.radiusFull,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  ackBtnText: {
    color: watchColors.success,
    fontSize: watchLayout.fontMicro,
    fontWeight: '600',
  },
});
