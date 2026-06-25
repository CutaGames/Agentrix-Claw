/**
 * UnifiedWorldMapScreen — 统一世界地图(World Creation & Feed,task 6.1–6.4)。
 *
 * spec: ui-design §4;需求 4.1/4.2/4.3/4.7。
 *   - 单一地图取代原 Aeon 地图 + v6 WorldMap:标记 = Creation(读统一发现 map 形态)。
 *   - 区分商家(🏪)/ 游戏(🎮)/ 剧场(🎭🔴🎤)/ 居民场所(🏠);点标记 → 预览 → 进入/详情。
 *   - 与创作流一键切换(需求 4.7)。
 *
 * 渲染(v2,2026-06):从"标记列表"升级为**真·可平移视觉地图**——不依赖 MapLibre 原生底图
 * (那需 EAS rebuild),用分区地形画布 + 绝对定位标记呈现"地图感":按创作类型分 4 个城区
 * (商业区/游戏区/演艺区/居民区),标记在城区内按 id 稳定散布;双向滚动平移;点标记进入。
 * 这样无论 build 是否含原生地图,世界地图都不会"消失"成一张白名单列表。
 * 主题:走 useColors/useThemedStyles → 跟随 Light/Dark 实时换肤。
 */
import React, { useCallback, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Image,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { useColors, useThemedStyles, type Palette } from '../../theme/useTheme';
import { useI18n } from '../../stores/i18nStore';
import { discoverCreations } from '../../services/creationApi';
import type { CreationDiscoveryItem } from '../../../shared/types/creation';

// ── 地图画布尺寸(大于屏幕 → 可平移)。2×2 城区。 ──
const DISTRICT_W = 340;
const DISTRICT_H = 460;
const CANVAS_W = DISTRICT_W * 2;
const CANVAS_H = DISTRICT_H * 2;
const MARKER = 64;
const PAD = 18;

type DistrictKey = 'commerce' | 'arcade' | 'stage' | 'resident';

interface District {
  key: DistrictKey;
  col: 0 | 1;
  row: 0 | 1;
  emoji: string;
  label: { en: string; zh: string };
  hue: [string, string];
}

const DISTRICTS: Record<DistrictKey, District> = {
  commerce: { key: 'commerce', col: 0, row: 0, emoji: '🏪', label: { en: 'Market', zh: '商业区' }, hue: ['#1d4ed8', '#0ea5e9'] },
  arcade: { key: 'arcade', col: 1, row: 0, emoji: '🎮', label: { en: 'Arcade', zh: '游戏区' }, hue: ['#7c3aed', '#a855f7'] },
  stage: { key: 'stage', col: 0, row: 1, emoji: '🎭', label: { en: 'Stage', zh: '演艺区' }, hue: ['#db2777', '#f43f5e'] },
  resident: { key: 'resident', col: 1, row: 1, emoji: '🏠', label: { en: 'Living', zh: '居民区' }, hue: ['#059669', '#10b981'] },
};

function districtOf(item: CreationDiscoveryItem): DistrictKey {
  if (item.poi || item.type === 'shop') return 'commerce';
  if (item.type === 'game') return 'arcade';
  if (item.type === 'drama' || item.type === 'livestream' || item.type === 'stage') return 'stage';
  return 'resident';
}

function markerEmoji(item: CreationDiscoveryItem): string {
  if (item.poi) return '🏪';
  switch (item.type) {
    case 'game': return '🎮';
    case 'drama': return '🎭';
    case 'livestream': return '🔴';
    case 'stage': return '🎤';
    case 'shop': return '🛒';
    default: return '🏠';
  }
}

/** id → 稳定散点(0..1),用于在城区内放置标记(避免每次刷新跳动)。 */
function hash01(id: string, salt: number): number {
  let h = 2166136261 ^ salt;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 100000) / 100000;
}

interface Placed {
  item: CreationDiscoveryItem;
  left: number;
  top: number;
}

export default function UnifiedWorldMapScreen() {
  const { t } = useI18n();
  const navigation = useNavigation<any>();
  const c = useColors();
  const styles = useThemedStyles(makeStyles);
  const [markers, setMarkers] = useState<CreationDiscoveryItem[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await discoverCreations({ mode: 'map' });
      setMarkers(res.mode === 'map' ? res.markers : []);
    } catch {
      setMarkers([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  // 将标记分配到城区,并在城区内稳定散布。
  const placed = useMemo<Placed[]>(() => {
    const byDistrict: Record<DistrictKey, CreationDiscoveryItem[]> = { commerce: [], arcade: [], stage: [], resident: [] };
    markers.forEach((m) => byDistrict[districtOf(m)].push(m));
    const out: Placed[] = [];
    (Object.keys(byDistrict) as DistrictKey[]).forEach((dk) => {
      const d = DISTRICTS[dk];
      const x0 = d.col * DISTRICT_W;
      const y0 = d.row * DISTRICT_H + 34; // 给城区标题留白
      const innerW = DISTRICT_W - PAD * 2 - MARKER;
      const innerH = DISTRICT_H - PAD * 2 - MARKER - 34;
      byDistrict[dk].forEach((item) => {
        out.push({
          item,
          left: x0 + PAD + hash01(item.id, 1) * innerW,
          top: y0 + PAD + hash01(item.id, 7) * innerH,
        });
      });
    });
    return out;
  }, [markers]);

  const onOpen = useCallback(
    (item: CreationDiscoveryItem) => {
      const playable = item.type === 'game' || item.type === 'drama' || item.canEnter;
      if (playable) {
        navigation.navigate('CreationExperience', { creationId: item.id, type: item.type, title: item.title });
      } else {
        navigation.navigate('CreationDetail', { creationId: item.id, title: item.title });
      }
    },
    [navigation],
  );

  const total = markers.length;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>🗺️ {t({ en: 'World Map', zh: '世界地图' })}</Text>
          <Text style={styles.subtitle}>{t({ en: `${total} places · drag to explore`, zh: `${total} 个地点 · 拖动探索` })}</Text>
        </View>
        <TouchableOpacity style={styles.switchBtn} onPress={() => navigation.navigate('CreationFeed')} testID="map-switch-feed">
          <Text style={styles.switchText}>🎬 {t({ en: 'Feed', zh: '创作流' })}</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator color={c.accent} /><Text style={styles.dim}>{t({ en: 'Loading map…', zh: '加载地图…' })}</Text></View>
      ) : (
        <ScrollView style={styles.scrollV} contentContainerStyle={styles.scrollVContent} showsVerticalScrollIndicator={false}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.scrollHContent}>
            <View style={styles.canvas}>
              {/* 地形底:深色海面 / 浅色草地 */}
              <LinearGradient
                colors={c.bg === '#0B1220' ? ['#0a1326', '#0e1b30', '#0a1326'] : ['#dfe9f7', '#eef3fb', '#e3edf9']}
                style={StyleSheet.absoluteFill}
              />
              {/* 网格线(经纬感) */}
              {Array.from({ length: 7 }).map((_, i) => (
                <View key={`v${i}`} style={[styles.gridV, { left: (CANVAS_W / 7) * (i + 1) }]} />
              ))}
              {Array.from({ length: 9 }).map((_, i) => (
                <View key={`h${i}`} style={[styles.gridH, { top: (CANVAS_H / 9) * (i + 1) }]} />
              ))}

              {/* 4 个城区底色 + 标题 */}
              {(Object.keys(DISTRICTS) as DistrictKey[]).map((dk) => {
                const d = DISTRICTS[dk];
                return (
                  <View
                    key={dk}
                    style={[
                      styles.district,
                      { left: d.col * DISTRICT_W, top: d.row * DISTRICT_H, width: DISTRICT_W, height: DISTRICT_H },
                    ]}
                  >
                    <LinearGradient
                      colors={[d.hue[0] + '22', d.hue[1] + '0D']}
                      style={StyleSheet.absoluteFill}
                    />
                    <Text style={[styles.districtLabel, { color: d.hue[1] }]}>{d.emoji} {t(d.label)}</Text>
                  </View>
                );
              })}

              {/* 标记 */}
              {placed.map(({ item, left, top }) => {
                const cover = item.preview?.url;
                return (
                  <TouchableOpacity
                    key={item.id}
                    style={[styles.marker, { left, top }]}
                    onPress={() => onOpen(item)}
                    activeOpacity={0.8}
                  >
                    <View style={styles.pin}>
                      {cover ? (
                        <Image source={{ uri: cover }} style={styles.pinThumb} resizeMode="cover" />
                      ) : (
                        <Text style={styles.pinEmoji}>{markerEmoji(item)}</Text>
                      )}
                    </View>
                    <Text style={styles.pinLabel} numberOfLines={1}>{item.title}</Text>
                  </TouchableOpacity>
                );
              })}

              {/* 空世界:中心引导 */}
              {total === 0 ? (
                <View style={styles.emptyPin}>
                  <Text style={styles.emptyEmoji}>✨</Text>
                  <Text style={styles.emptyText}>{t({ en: 'This world is empty.\nBe the first to create here.', zh: '这个世界还很空旷\n来当第一个创作者' })}</Text>
                </View>
              ) : null}
            </View>
          </ScrollView>
        </ScrollView>
      )}

      <TouchableOpacity style={styles.fab} onPress={() => navigation.navigate('CreationCreator')} testID="map-create">
        <Text style={styles.fabText}>✨ {t({ en: 'Create here', zh: '在这创作' })}</Text>
      </TouchableOpacity>
    </View>
  );
}

function makeStyles(c: Palette) { return StyleSheet.create({
  container: { flex: 1, backgroundColor: c.bgPrimary },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 56, paddingBottom: 12 },
  title: { color: c.textPrimary, fontSize: 20, fontWeight: '800' },
  subtitle: { color: c.textMuted, fontSize: 12, marginTop: 2 },
  switchBtn: { backgroundColor: c.bgCard, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8, borderWidth: 1, borderColor: c.border },
  switchText: { color: c.accent, fontSize: 13, fontWeight: '600' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10 },
  dim: { color: c.textMuted, fontSize: 13, textAlign: 'center', paddingHorizontal: 24 },
  scrollV: { flex: 1 },
  scrollVContent: { },
  scrollHContent: { },
  canvas: { width: CANVAS_W, height: CANVAS_H, overflow: 'hidden' },
  gridV: { position: 'absolute', top: 0, bottom: 0, width: 1, backgroundColor: 'rgba(255,255,255,0.05)' },
  gridH: { position: 'absolute', left: 0, right: 0, height: 1, backgroundColor: 'rgba(255,255,255,0.05)' },
  district: { position: 'absolute', overflow: 'hidden', borderWidth: 1, borderColor: c.border + '55' },
  districtLabel: { position: 'absolute', top: 10, left: 12, fontSize: 13, fontWeight: '800', opacity: 0.85 },
  marker: { position: 'absolute', width: MARKER, alignItems: 'center' },
  pin: { width: MARKER, height: MARKER, borderRadius: 16, backgroundColor: c.bgCard, borderWidth: 2, borderColor: c.accent, alignItems: 'center', justifyContent: 'center', overflow: 'hidden', shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 6, shadowOffset: { width: 0, height: 3 }, elevation: 5 },
  pinThumb: { width: '100%', height: '100%' },
  pinEmoji: { fontSize: 30 },
  pinLabel: { marginTop: 4, fontSize: 11, fontWeight: '700', color: c.textPrimary, maxWidth: MARKER + 16, textAlign: 'center', backgroundColor: c.bgPrimary + 'CC', borderRadius: 6, paddingHorizontal: 4, overflow: 'hidden' },
  emptyPin: { position: 'absolute', left: CANVAS_W / 2 - 120, top: CANVAS_H / 2 - 60, width: 240, alignItems: 'center', gap: 8 },
  emptyEmoji: { fontSize: 48 },
  emptyText: { color: c.textSecondary, fontSize: 14, textAlign: 'center', lineHeight: 21, fontWeight: '600' },
  fab: { position: 'absolute', right: 16, bottom: 24, backgroundColor: c.accent, borderRadius: 24, paddingHorizontal: 20, paddingVertical: 14, shadowColor: c.accent, shadowOpacity: 0.4, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 6 },
  fabText: { color: '#fff', fontSize: 14, fontWeight: '700' },
}); }
