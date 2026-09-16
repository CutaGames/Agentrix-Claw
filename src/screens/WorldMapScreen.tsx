/**
 * WorldMapScreen — shared World_Map outer layer (Task 10.3, R13).
 *
 * Renders the shared map with React-Three-Fiber-style 3D (three.js via expo-gl,
 * the v5 mobile rendering stack) and adapts to the device:
 *   - full hardware profile → full-quality 3D map (R13.2);
 *   - below profile / GL unavailable / web → degraded 2D map that still keeps
 *     navigation and Plot entry working (R13.3).
 *
 * Tier_C handling (R13.4 / R13.5 / R17.8): when a player tries to enter a Tier_C
 * Plot on Mobile, the screen surfaces a Desktop-dispatch path; if the experience
 * cannot be instantiated on the device it reports unavailability and offers a
 * degraded or Desktop alternative.
 *
 * Device-tier resolution and launch planning are delegated to
 * {@link useDeviceTier} / {@link planExperienceLaunch}; 3D rendering to
 * {@link WorldMapRenderer}.
 *
 * @see .kiro/specs/ai-world-creation-platform/design.md — §1, §5.3, §13
 */

import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Platform,
  useWindowDimensions,
} from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';

import { useDeviceTier } from '../world-creation/useDeviceTier';
import { WorldMapRenderer } from '../world-creation/WorldMapRenderer';
import { getMapViewport, submitCreationTask } from '../services/worldCreationApi';
import type { MapPlotSummary } from '../../shared/types/world-creation-api';

// Default viewport window fetched on focus.
const DEFAULT_VIEWPORT = { minX: -8, minY: -8, maxX: 8, maxY: 8 };

// ============================================================
// Component
// ============================================================

export default function WorldMapScreen() {
  const navigation = useNavigation<any>();
  const { width } = useWindowDimensions();
  const { quality, params, isDegraded, profile, planLaunch } = useDeviceTier();

  const [plots, setPlots] = useState<MapPlotSummary[]>([]);
  const [self, setSelf] = useState<{ x: number; y: number } | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selected, setSelected] = useState<MapPlotSummary | null>(null);
  const [entering, setEntering] = useState(false);

  const mapHeight = Math.round((width * 4) / 3); // 3:4 portrait map surface

  // ─── Fetch viewport on focus ───────────────────────────────────────────
  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      (async () => {
        setLoading(true);
        setLoadError(null);
        try {
          const res = await getMapViewport(DEFAULT_VIEWPORT);
          if (cancelled) return;
          setPlots(res.plots ?? []);
          setSelf(res.self?.position);
        } catch (err: any) {
          if (cancelled) return;
          setLoadError(err?.message || '地图加载失败');
          setPlots([]);
        } finally {
          if (!cancelled) setLoading(false);
        }
      })();
      return () => {
        cancelled = true;
      };
    }, []),
  );

  // ─── Plot selection / preview (R1.3) ───────────────────────────────────
  const handleSelectPlot = useCallback((plot: MapPlotSummary) => {
    setSelected(plot);
  }, []);

  // ─── Tier_C → Desktop dispatch (R13.4) ─────────────────────────────────
  const dispatchToDesktop = useCallback(
    async (plot: MapPlotSummary) => {
      try {
        const res = await submitCreationTask({
          plotId: plot.plotId,
          target: 'desktop',
          substrateTier: plot.substrateTier,
          surface: 'mobile',
          input: { intent: 'playTierC', plotId: plot.plotId },
        });
        const taskId = res.task?.taskId;
        Alert.alert(
          '已派发到桌面端',
          `“${plot.title}”已作为创作/体验任务派发(目标:${res.effectiveTarget})。`,
          taskId
            ? [
                { text: '好', style: 'cancel' },
                { text: '查看任务', onPress: () => navigation.navigate('CreationTaskStatus', { taskId }) },
              ]
            : undefined,
        );
      } catch (err: any) {
        Alert.alert('派发失败', err?.message || '请稍后再试,或在桌面端直接打开。');
      }
    },
    [navigation],
  );

  // ─── Enter action (R1.4) + device-tier launch planning (R13.4/R13.5) ────
  const handleEnter = useCallback(
    async (plot: MapPlotSummary) => {
      const plan = planLaunch(plot.substrateTier);

      // Tier_C (or anything) that can't be instantiated on this device:
      // report unavailability and offer Desktop / degraded alternatives.
      if (!plan.canInstantiate) {
        const buttons: any[] = [];
        if (plan.offerDesktopDispatch) {
          buttons.push({ text: '派发到桌面端', onPress: () => dispatchToDesktop(plot) });
        }
        if (plan.offerDegradedAlternative) {
          buttons.push({
            text: '降级体验',
            onPress: () =>
              Alert.alert('降级体验', '将以降级模式进入(画质与交互受限)。'),
          });
        }
        buttons.push({ text: '取消', style: 'cancel' });
        Alert.alert(
          '当前设备暂不支持',
          plan.reason ||
            '该体验无法在当前设备实例化。可派发到桌面端,或尝试降级体验。',
          buttons,
        );
        return;
      }

      // Tier_C that CAN run on this device still surfaces a Desktop option (R13.4).
      if (plot.substrateTier === 'C' && plan.offerDesktopDispatch) {
        Alert.alert(
          '进入 Tier_C 体验',
          '这是高级(Tier_C)体验。可在本机进入,或派发到桌面端获得完整体验。',
          [
            { text: '本机进入', onPress: () => doEnter(plot) },
            { text: '派发到桌面端', onPress: () => dispatchToDesktop(plot) },
            { text: '取消', style: 'cancel' },
          ],
        );
        return;
      }

      await doEnter(plot);
    },
    [planLaunch, dispatchToDesktop],
  );

  // Actual enter call → navigate into the inner-experience host (R1.4).
  // The PlotExperienceScreen owns the enterPlot call + 10s timeout fallback (R1.7).
  const doEnter = useCallback(
    async (plot: MapPlotSummary) => {
      navigation.navigate('PlotExperience', { plotId: plot.plotId, title: plot.title });
    },
    [navigation],
  );

  // ─── Render ────────────────────────────────────────────────────────────
  return (
    <View style={styles.container} testID="world-map-screen">
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack?.()}>
          <Text style={styles.backText}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>🌍 世界地图</Text>
        <Text style={styles.tierTag}>
          {profile.deviceTier.toUpperCase()} · {isDegraded ? '降级' : '全画质'}
        </Text>
      </View>

      {/* Map surface */}
      <View style={{ width, height: mapHeight }}>
        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator color="#6c5ce7" />
            <Text style={styles.dimText}>加载地图…</Text>
          </View>
        ) : (
          <WorldMapRenderer
            plots={plots}
            self={self}
            params={params}
            width={width}
            height={mapHeight}
            selectedPlotId={selected?.plotId ?? null}
            onSelectPlot={handleSelectPlot}
          />
        )}
      </View>

      {/* Degraded-mode hint (R13.3) */}
      {isDegraded && !loading && (
        <Text style={styles.degradedHint}>
          已启用降级模式以适配当前设备 · 导航与进入功能完整保留
        </Text>
      )}

      {loadError && !loading && (
        <Text style={styles.errorText}>{loadError}</Text>
      )}

      {/* Plot preview panel (R1.3) */}
      {selected && (
        <View style={styles.previewPanel}>
          <View style={styles.previewRow}>
            <Text style={styles.previewTitle}>{selected.title}</Text>
            <View style={[styles.tierBadge, tierBadgeStyle(selected.substrateTier)]}>
              <Text style={styles.tierBadgeText}>Tier {selected.substrateTier}</Text>
            </View>
          </View>
          <Text style={styles.previewOwner}>by {selected.ownerDisplayName}</Text>
          <TouchableOpacity
            style={[styles.enterBtn, entering && styles.enterBtnDisabled]}
            disabled={entering}
            onPress={() => handleEnter(selected)}
          >
            <Text style={styles.enterBtnText}>{entering ? '进入中…' : '进入体验'}</Text>
          </TouchableOpacity>
        </View>
      )}

      {!selected && !loading && plots.length === 0 && !loadError && (
        <Text style={styles.dimText}>视口内暂无地块</Text>
      )}
    </View>
  );
}

function tierBadgeStyle(tier: 'A' | 'B' | 'C') {
  switch (tier) {
    case 'A':
      return { backgroundColor: 'rgba(76,175,80,0.2)', borderColor: '#4CAF50' };
    case 'B':
      return { backgroundColor: 'rgba(108,92,231,0.2)', borderColor: '#6c5ce7' };
    case 'C':
      return { backgroundColor: 'rgba(255,112,67,0.2)', borderColor: '#ff7043' };
  }
}

// ============================================================
// Styles
// ============================================================

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a0a14',
  },
  header: {
    paddingTop: Platform.OS === 'ios' ? 60 : 20,
    paddingHorizontal: 20,
    paddingBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  backText: {
    color: '#6c5ce7',
    fontSize: 22,
    fontWeight: '700',
  },
  headerTitle: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '700',
    flex: 1,
  },
  tierTag: {
    color: '#888',
    fontSize: 12,
    fontWeight: '600',
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
  },
  dimText: {
    color: '#666',
    fontSize: 13,
    textAlign: 'center',
    marginTop: 12,
  },
  degradedHint: {
    color: '#ffb74d',
    fontSize: 12,
    textAlign: 'center',
    paddingHorizontal: 20,
    paddingVertical: 8,
  },
  errorText: {
    color: '#ef5350',
    fontSize: 13,
    textAlign: 'center',
    paddingHorizontal: 20,
    paddingVertical: 8,
  },
  previewPanel: {
    backgroundColor: '#1a1a2e',
    margin: 16,
    borderRadius: 14,
    padding: 16,
  },
  previewRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  previewTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
    flex: 1,
  },
  tierBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
    borderWidth: 1,
  },
  tierBadgeText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
  },
  previewOwner: {
    color: '#888',
    fontSize: 13,
    marginTop: 4,
  },
  enterBtn: {
    backgroundColor: '#6c5ce7',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 16,
  },
  enterBtnDisabled: {
    opacity: 0.6,
  },
  enterBtnText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
  },
});
