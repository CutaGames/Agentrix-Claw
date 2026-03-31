import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { watchColors } from '../theme/watchColors';
import { watchLayout } from '../theme/watchLayout';

interface HealthState {
  heartRate: number | null;
  steps: number | null;
  battery: number | null;
  spo2: number | null;
  lastSync: string | null;
}

/**
 * Real-time health data display.
 * MVP: simulated sensor reading + periodic upload.
 * On real Wear OS, replace with Health Services API.
 */
export function WatchHealthScreen() {
  const [health, setHealth] = useState<HealthState>({
    heartRate: null,
    steps: null,
    battery: null,
    spo2: null,
    lastSync: null,
  });
  const [collecting, setCollecting] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | undefined>(undefined);

  const startCollection = useCallback(() => {
    setCollecting(true);
    // MVP: simulated sensor data (replace with Health Services API on device)
    timerRef.current = setInterval(() => {
      setHealth({
        heartRate: 60 + Math.floor(Math.random() * 40),
        steps: 2000 + Math.floor(Math.random() * 8000),
        battery: Math.floor(50 + Math.random() * 50),
        spo2: 95 + Math.floor(Math.random() * 5),
        lastSync: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
      });
    }, 2000);
  }, []);

  useEffect(() => {
    startCollection();
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [startCollection]);

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      <Text style={styles.title}>健康数据</Text>

      {/* Heart Rate — hero display */}
      <View style={styles.heroCard}>
        <Text style={[styles.heroIcon, { color: watchColors.heartRate }]}>❤</Text>
        <Text style={styles.heroValue}>
          {health.heartRate ?? '--'}
        </Text>
        <Text style={styles.heroUnit}>bpm</Text>
        {collecting && (
          <View style={styles.liveIndicator}>
            <View style={styles.liveDot} />
            <Text style={styles.liveText}>LIVE</Text>
          </View>
        )}
      </View>

      {/* Metric Grid */}
      <View style={styles.grid}>
        <MetricCard
          icon="🚶"
          label="步数"
          value={health.steps != null ? health.steps.toLocaleString() : '--'}
          color={watchColors.steps}
        />
        <MetricCard
          icon="🔋"
          label="电量"
          value={health.battery != null ? `${health.battery}%` : '--'}
          color={watchColors.battery}
        />
        <MetricCard
          icon="○"
          label="SpO₂"
          value={health.spo2 != null ? `${health.spo2}%` : '--'}
          color={watchColors.spo2}
        />
      </View>

      {/* Sync Status */}
      <View style={styles.syncRow}>
        {collecting ? (
          <ActivityIndicator color={watchColors.accent} size="small" />
        ) : null}
        <Text style={styles.syncText}>
          {health.lastSync ? `同步于 ${health.lastSync}` : '等待传感器…'}
        </Text>
      </View>
    </ScrollView>
  );
}

function MetricCard({
  icon,
  label,
  value,
  color,
}: {
  icon: string;
  label: string;
  value: string;
  color: string;
}) {
  return (
    <View style={metricStyles.card}>
      <Text style={[metricStyles.icon, { color }]}>{icon}</Text>
      <Text style={metricStyles.value}>{value}</Text>
      <Text style={metricStyles.label}>{label}</Text>
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
    alignItems: 'center',
    minHeight: watchLayout.screenHeight,
  },
  title: {
    color: watchColors.textSecondary,
    fontSize: watchLayout.fontCaption,
    marginBottom: watchLayout.gap,
  },
  heroCard: {
    alignItems: 'center',
    marginBottom: watchLayout.gapLg,
  },
  heroIcon: {
    fontSize: 24,
    marginBottom: 4,
  },
  heroValue: {
    color: watchColors.text,
    fontSize: watchLayout.fontHero,
    fontWeight: '300',
    lineHeight: watchLayout.fontHero + 4,
  },
  heroUnit: {
    color: watchColors.textMuted,
    fontSize: watchLayout.fontCaption,
  },
  liveIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 4,
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: watchColors.heartRate,
  },
  liveText: {
    color: watchColors.heartRate,
    fontSize: watchLayout.fontMicro,
    fontWeight: '700',
  },
  grid: {
    flexDirection: 'row',
    gap: watchLayout.gap,
    width: '100%',
  },
  syncRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: watchLayout.gapLg,
  },
  syncText: {
    color: watchColors.textMuted,
    fontSize: watchLayout.fontMicro,
  },
});

const metricStyles = StyleSheet.create({
  card: {
    flex: 1,
    backgroundColor: watchColors.surface,
    borderRadius: watchLayout.radiusSm,
    padding: watchLayout.cardPadding,
    alignItems: 'center',
  },
  icon: {
    fontSize: 16,
    marginBottom: 2,
  },
  value: {
    color: watchColors.text,
    fontSize: watchLayout.fontBody,
    fontWeight: '600',
  },
  label: {
    color: watchColors.textMuted,
    fontSize: watchLayout.fontMicro,
  },
});
