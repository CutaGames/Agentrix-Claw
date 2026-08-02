/**
 * ReliabilityScreen — render /agent-ops/metrics/reliability snapshot.
 * Stat cards with threshold pass/fail coloring:
 *   - autonomous completion rate ≥ 80% target
 *   - quality pass rate ≥ 90% target
 *   - latency (avg / p95)
 *   - cold-start funnel
 */
import React from 'react';
import {
  View, Text, StyleSheet, ScrollView, ActivityIndicator, RefreshControl,
} from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { useColors, useThemedStyles, type Palette } from '../../theme/useTheme';
import { useI18n } from '../../stores/i18nStore';
import { fetchReliabilityMetrics, type ReliabilityMetrics } from '../../services/agentOpsApi';

const COMPLETION_TARGET = 0.8;
const QUALITY_TARGET = 0.9;

export function ReliabilityScreen() {
  const c = useColors();
  const styles = useThemedStyles(makeStyles);
  const { t } = useI18n();

  const metricsQ = useQuery({
    queryKey: ['agent-ops-reliability'],
    queryFn: fetchReliabilityMetrics,
    retry: 1,
  });

  const m = metricsQ.data;

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      testID="ao-reliability-screen"
      refreshControl={<RefreshControl refreshing={metricsQ.isFetching} onRefresh={() => metricsQ.refetch()} tintColor={c.accent} />}
    >
      {metricsQ.isLoading ? (
        <ActivityIndicator color={c.accent} style={{ marginTop: 24 }} />
      ) : metricsQ.isError || !m ? (
        <Text style={styles.empty}>{t({ en: 'Failed to load reliability metrics.', zh: '加载可靠性指标失败。' })}</Text>
      ) : (
        <>
          <View style={styles.statRow}>
            <ThresholdStat
              label={t({ en: 'Autonomous completion', zh: '自主完成率' })}
              value={m.autonomousCompletionRate}
              target={COMPLETION_TARGET}
              styles={styles}
              c={c}
              t={t}
              testID="ao-reliability-completion"
            />
            <ThresholdStat
              label={t({ en: 'Quality pass rate', zh: '质量合格率' })}
              value={m.qualityPassRate}
              target={QUALITY_TARGET}
              styles={styles}
              c={c}
              t={t}
              testID="ao-reliability-quality"
            />
          </View>

          <View style={styles.statRow}>
            <View style={styles.latencyCard}>
              <Text style={styles.statLabel}>{t({ en: 'Avg latency', zh: '平均时延' })}</Text>
              <Text style={styles.latencyValue}>{fmtMs(m.avgLatencyMs)}</Text>
            </View>
            <View style={styles.latencyCard}>
              <Text style={styles.statLabel}>{t({ en: 'P95 latency', zh: 'P95 时延' })}</Text>
              <Text style={styles.latencyValue}>{m.p95LatencyMs != null ? fmtMs(m.p95LatencyMs) : '—'}</Text>
            </View>
          </View>

          {(m.sampleSize != null || m.windowDays != null) ? (
            <Text style={styles.sampleNote}>
              {t({ en: 'Based on', zh: '样本' })}{' '}
              {m.sampleSize != null ? t({ en: `${m.sampleSize} samples`, zh: `${m.sampleSize} 个样本` }) : ''}
              {m.windowDays != null ? ` · ${t({ en: `last ${m.windowDays}d`, zh: `近 ${m.windowDays} 天` })}` : ''}
            </Text>
          ) : null}

          {m.coldStartFunnel?.length ? (
            <View style={styles.funnelCard} testID="ao-reliability-funnel">
              <Text style={styles.funnelTitle}>{t({ en: 'Cold-start funnel', zh: '冷启动漏斗' })}</Text>
              {renderFunnel(m.coldStartFunnel, styles, c)}
            </View>
          ) : null}

          {m.generatedAt ? (
            <Text style={styles.generatedAt}>
              {t({ en: 'Generated', zh: '生成时间' })}: {new Date(m.generatedAt).toLocaleString()}
            </Text>
          ) : null}
        </>
      )}
    </ScrollView>
  );
}

function renderFunnel(
  funnel: NonNullable<ReliabilityMetrics['coldStartFunnel']>,
  styles: ReturnType<typeof makeStyles>,
  c: Palette,
) {
  const top = Math.max(...funnel.map((f) => f.count), 1);
  return funnel.map((stage, i) => {
    const pct = Math.round((stage.count / top) * 100);
    return (
      <View key={i} style={styles.funnelRow}>
        <Text style={styles.funnelStage} numberOfLines={1}>{stage.stage}</Text>
        <View style={styles.funnelBarTrack}>
          <View style={[styles.funnelBarFill, { width: `${pct}%`, backgroundColor: c.accent }]} />
        </View>
        <Text style={styles.funnelCount}>{stage.count}</Text>
      </View>
    );
  });
}

function ThresholdStat({
  label, value, target, styles, c, t, testID,
}: {
  label: string;
  value: number;
  target: number;
  styles: ReturnType<typeof makeStyles>;
  c: Palette;
  t: (d: { en: string; zh: string }) => string;
  testID?: string;
}) {
  const pass = value >= target;
  const color = pass ? c.success : c.error;
  return (
    <View style={[styles.statCard, { borderColor: color + '55' }]} testID={testID}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={[styles.statValue, { color }]}>{fmtPct(value)}</Text>
      <View style={[styles.thresholdPill, { backgroundColor: color + '1c' }]}>
        <Text style={[styles.thresholdText, { color }]}>
          {pass ? t({ en: '✓ Pass', zh: '✓ 达标' }) : t({ en: '✕ Below', zh: '✕ 未达标' })}
          {' · '}
          {t({ en: 'target', zh: '目标' })} {fmtPct(target)}
        </Text>
      </View>
    </View>
  );
}

function fmtPct(v: number): string {
  if (v == null || Number.isNaN(v)) return '—';
  // Accept either 0..1 ratios or already-percent values.
  const pct = v <= 1 ? v * 100 : v;
  return `${pct.toFixed(1)}%`;
}

function fmtMs(ms: number): string {
  if (ms == null || Number.isNaN(ms)) return '—';
  if (ms >= 1000) return `${(ms / 1000).toFixed(2)}s`;
  return `${Math.round(ms)}ms`;
}

function makeStyles(c: Palette) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: c.bgPrimary },
    content: { padding: 16, paddingBottom: 40, gap: 12 },
    empty: { fontSize: 13, color: c.textMuted, textAlign: 'center', padding: 24 },
    statRow: { flexDirection: 'row', gap: 12 },
    statCard: { flex: 1, backgroundColor: c.bgCard, borderRadius: 14, padding: 14, gap: 8, borderWidth: 1 },
    statLabel: { fontSize: 12, color: c.textMuted, fontWeight: '600' },
    statValue: { fontSize: 26, fontWeight: '800' },
    thresholdPill: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, alignSelf: 'flex-start' },
    thresholdText: { fontSize: 10, fontWeight: '700' },
    latencyCard: { flex: 1, backgroundColor: c.bgCard, borderRadius: 14, padding: 14, gap: 6, borderWidth: 1, borderColor: c.border },
    latencyValue: { fontSize: 22, fontWeight: '800', color: c.textPrimary },
    sampleNote: { fontSize: 11, color: c.textMuted },
    funnelCard: { backgroundColor: c.bgCard, borderRadius: 14, padding: 14, gap: 10, borderWidth: 1, borderColor: c.border },
    funnelTitle: { fontSize: 14, fontWeight: '700', color: c.textPrimary },
    funnelRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    funnelStage: { fontSize: 12, color: c.textSecondary, width: 90 },
    funnelBarTrack: { flex: 1, height: 14, borderRadius: 7, backgroundColor: c.bgPrimary, overflow: 'hidden' },
    funnelBarFill: { height: '100%', borderRadius: 7 },
    funnelCount: { fontSize: 12, fontWeight: '700', color: c.textPrimary, width: 44, textAlign: 'right' },
    generatedAt: { fontSize: 11, color: c.textMuted, marginTop: 4 },
  });
}
