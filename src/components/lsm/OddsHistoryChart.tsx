// 赔率变化迷你折线图（赛事预测下单抽屉 / 盘口详情）。
//
// 数据源：后端 `GET /lsm/markets/:id/odds-history?range=all|30m|10m|5m`
// （来自 lsm_odds_snapshots 历史快照）。用 react-native-svg 画轻量折线，
// 不引新依赖。支持 全部/30M/10M/5M 时间范围切换。
import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import Svg, { Polyline, Line as SvgLine, Text as SvgText } from 'react-native-svg';
import { colors } from '../../theme/colors';
import { lsmApi } from '../../services/lsm.api';

type Range = 'all' | '30m' | '10m' | '5m';
const RANGES: Array<{ key: Range; label: { en: string; zh: string } }> = [
  { key: 'all', label: { en: 'All', zh: '全部' } },
  { key: '30m', label: { en: '30M', zh: '30M' } },
  { key: '10m', label: { en: '10M', zh: '10M' } },
  { key: '5m', label: { en: '5M', zh: '5M' } },
];

// 各 outcome 折线颜色（0=主/1=客/2=平）
const SERIES_COLORS = ['#16a34a', '#dc2626', '#eab308'];

interface Series {
  outcomeIdx: number;
  points: Array<{ ts: number; odds: number }>;
}

/** 叠加在赔率折线上的水平参考线（入场赔率 / 强平线）。赔率会被纳入 y 轴域以保证可见。 */
export interface OddsRefLine {
  odds: number;
  color: string;
  label: string;
  dashed?: boolean;
}

interface Props {
  marketId: string;
  /** 仅高亮某个 outcome（其余淡化）；不传则全部展示 */
  focusOutcomeIdx?: number;
  zh: boolean;
  labels: string[]; // [home, away, draw]
  height?: number;
  /** 风险参考线（入场/强平），叠加为水平虚线并显示右侧标签。 */
  refLines?: OddsRefLine[];
}

const CHART_W = 300;

export function OddsHistoryChart({ marketId, focusOutcomeIdx, zh, labels, height = 120, refLines = [] }: Props) {
  const [range, setRange] = useState<Range>('all');
  const [series, setSeries] = useState<Series[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await lsmApi.oddsHistory(marketId, range);
      setSeries(r.series || []);
    } catch {
      setSeries([]);
    } finally {
      setLoading(false);
    }
  }, [marketId, range]);

  useEffect(() => {
    load();
  }, [load]);

  // 计算 y 轴范围（所有展示点的赔率 min/max）
  const shown = series.filter(
    (s) => focusOutcomeIdx == null || s.outcomeIdx === focusOutcomeIdx,
  );
  const allOdds = shown.flatMap((s) => s.points.map((p) => p.odds));
  const hasData = allOdds.length >= 2;
  // 参考线赔率纳入 y 轴域（extend domain），否则强平线常在可视区外不可见。
  const refOdds = refLines.map((r) => r.odds).filter((v) => Number.isFinite(v) && v > 0);
  const domainOdds = [...allOdds, ...refOdds];
  const minO = domainOdds.length ? Math.min(...domainOdds) : 0;
  const maxO = domainOdds.length ? Math.max(...domainOdds) : 1;
  const span = maxO - minO || 1;

  // 用所有展示序列的 ts 全集作为 x 轴范围
  const allTs = shown.flatMap((s) => s.points.map((p) => p.ts));
  const minT = allTs.length ? Math.min(...allTs) : 0;
  const maxT = allTs.length ? Math.max(...allTs) : 1;
  const tSpan = maxT - minT || 1;

  const oddsToY = (odds: number) => height - ((odds - minO) / span) * (height - 16) - 8;
  const toXY = (p: { ts: number; odds: number }) => {
    const x = ((p.ts - minT) / tSpan) * CHART_W;
    return `${x.toFixed(1)},${oddsToY(p.odds).toFixed(1)}`;
  };

  const fmtTime = (ts: number) =>
    new Date(ts).toLocaleTimeString(zh ? 'zh-CN' : 'en-US', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });

  return (
    <View style={styles.wrap}>
      <View style={styles.headerRow}>
        <Text style={styles.title}>{zh ? '赔率走势' : 'Odds trend'}</Text>
        <View style={styles.rangeRow}>
          {RANGES.map((r) => (
            <TouchableOpacity
              key={r.key}
              onPress={() => setRange(r.key)}
              style={[styles.rangeChip, range === r.key && styles.rangeChipActive]}
            >
              <Text style={[styles.rangeText, range === r.key && styles.rangeTextActive]}>
                {zh ? r.label.zh : r.label.en}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {loading ? (
        <View style={[styles.chartBox, { height }]}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : !hasData ? (
        <View style={[styles.chartBox, { height }]}>
          <Text style={styles.empty}>{zh ? '该时间范围暂无赔率数据' : 'No odds data in range'}</Text>
        </View>
      ) : (
        <View style={styles.plotRow}>
          {/* 纵轴：赔率 max/min */}
          <View style={[styles.yAxis, { height }]}>
            <Text style={styles.axisText}>{maxO.toFixed(2)}</Text>
            <Text style={styles.axisText}>{((maxO + minO) / 2).toFixed(2)}</Text>
            <Text style={styles.axisText}>{minO.toFixed(2)}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <View style={[styles.chartBox, { height }]}>
              <Svg width="100%" height={height} viewBox={`0 0 ${CHART_W} ${height}`} preserveAspectRatio="none">
                {/* 网格基线 */}
                <SvgLine x1="0" y1="8" x2={CHART_W} y2="8" stroke={colors.border} strokeWidth="0.5" strokeOpacity="0.5" />
                <SvgLine x1="0" y1={height / 2} x2={CHART_W} y2={height / 2} stroke={colors.border} strokeWidth="0.5" strokeOpacity="0.5" />
                <SvgLine x1="0" y1={height - 8} x2={CHART_W} y2={height - 8} stroke={colors.border} strokeWidth="1" />
                {shown.map((s) => {
                  const dim = focusOutcomeIdx != null && s.outcomeIdx !== focusOutcomeIdx;
                  const color = SERIES_COLORS[s.outcomeIdx] || colors.primary;
                  return (
                    <Polyline
                      key={s.outcomeIdx}
                      points={s.points.map(toXY).join(' ')}
                      fill="none"
                      stroke={color}
                      strokeWidth={dim ? 1 : 2}
                      strokeOpacity={dim ? 0.35 : 1}
                    />
                  );
                })}
                {/* 风险参考线：入场（实/虚线，本方色）+ 强平（玫红虚线）。赔率已纳入 y 轴域故必可见。 */}
                {refLines.map((r, i) => {
                  const y = oddsToY(r.odds);
                  return (
                    <React.Fragment key={`ref-${i}`}>
                      <SvgLine
                        x1="0"
                        y1={y}
                        x2={CHART_W}
                        y2={y}
                        stroke={r.color}
                        strokeWidth="1.2"
                        strokeDasharray={r.dashed === false ? undefined : '5,4'}
                        strokeOpacity="0.95"
                      />
                      <SvgText x={CHART_W - 2} y={Math.max(9, y - 3)} fill={r.color} fontSize="9" fontWeight="700" textAnchor="end">
                        {r.label}
                      </SvgText>
                    </React.Fragment>
                  );
                })}
              </Svg>
            </View>
            {/* 横轴：起止时间 */}
            <View style={styles.xAxis}>
              <Text style={styles.axisText}>{fmtTime(minT)}</Text>
              <Text style={styles.axisText}>{fmtTime(maxT)}</Text>
            </View>
          </View>
        </View>
      )}

      {hasData && (
        <View style={styles.legendRow}>
          {shown.map((s) => (
            <View key={s.outcomeIdx} style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: SERIES_COLORS[s.outcomeIdx] || colors.primary }]} />
              <Text style={styles.legendText}>
                {labels[s.outcomeIdx] ?? `#${s.outcomeIdx}`}
                {s.points.length ? ` ${s.points[s.points.length - 1].odds.toFixed(2)}` : ''}
              </Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginTop: 8, marginBottom: 4 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  title: { fontSize: 13, color: colors.textSecondary, fontWeight: '700' },
  rangeRow: { flexDirection: 'row', gap: 4 },
  rangeChip: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, backgroundColor: colors.background, borderWidth: 1, borderColor: colors.border },
  rangeChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  rangeText: { fontSize: 11, color: colors.textSecondary, fontWeight: '600' },
  rangeTextActive: { color: '#fff' },
  chartBox: { backgroundColor: colors.background, borderRadius: 10, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  empty: { fontSize: 12, color: colors.textSecondary },
  plotRow: { flexDirection: 'row', alignItems: 'flex-start' },
  yAxis: { width: 38, justifyContent: 'space-between', paddingVertical: 4, paddingRight: 4 },
  xAxis: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 2 },
  axisText: { fontSize: 9, color: colors.textSecondary, textAlign: 'right' },
  legendRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 6 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendText: { fontSize: 11, color: colors.textSecondary },
});
