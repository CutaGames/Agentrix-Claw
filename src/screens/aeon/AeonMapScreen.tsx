/**
 * AeonMapScreen — Aeon 地球地图层(Task 1.7 / R4)。
 *
 * 用法 a:真实地球作最外层选址/导航层。点地图可用点 → 圈地;显示已圈地块 markers;
 * 点已拥有地块 → 进入 2.5D 等距场景(AeonSceneScreen)。
 *
 * MapLibre(`@maplibre/maplibre-react-native`)为新原生依赖,需 EAS rebuild。
 * 本屏采用优雅降级:依赖未安装时退回"列表选址"模式(输入坐标/选已有地块),
 * 保证当前 build 可用,装上 MapLibre + rebuild 后自动升级为真地图。
 *
 * 不依赖设备 GPS 限制圈地(R4.7):坐标来自地图点选或手动输入,与实时定位解耦。
 */
import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { colors } from '../../theme/colors';
import {
  listPlotMarkers,
  listMyPlots,
  claimPlot,
  enterPlot,
} from '../../services/aeon/aeonApi';
import type { AeonPlotDto, AeonPlotMarker } from '../../../shared/types/aeon-world';

/** 尝试加载 MapLibre;未安装则 null(降级)。 */
function loadMapLibre(): any | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires, global-require
    return require('@maplibre/maplibre-react-native');
  } catch {
    return null;
  }
}

export default function AeonMapScreen() {
  const navigation = useNavigation<any>();
  const MapLibre = loadMapLibre();
  const [markers, setMarkers] = useState<AeonPlotMarker[]>([]);
  const [mine, setMine] = useState<AeonPlotDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [lat, setLat] = useState('');
  const [lng, setLng] = useState('');
  const [claiming, setClaiming] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [mk, my] = await Promise.all([listPlotMarkers('earth'), listMyPlots()]);
      setMarkers(mk);
      setMine(my);
    } catch (e: any) {
      Alert.alert('加载失败', e?.message || '请稍后再试');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const onClaim = useCallback(
    async (la: number, ln: number) => {
      setClaiming(true);
      try {
        const plot = await claimPlot({ lat: la, lng: ln, displayName: '我的领地' });
        await refresh();
        Alert.alert('圈地成功', `已在 (${la.toFixed(3)}, ${ln.toFixed(3)}) 圈定领地`, [
          { text: '进入', onPress: () => onEnter(plot) },
          { text: '好', style: 'cancel' },
        ]);
      } catch (e: any) {
        Alert.alert('圈地失败', e?.message || '该位置可能已被占用');
      } finally {
        setClaiming(false);
      }
    },
    [refresh],
  );

  const onEnter = useCallback(
    async (plot: AeonPlotDto | AeonPlotMarker) => {
      try {
        await enterPlot(plot.id);
      } catch {
        /* 非 owner 拜访不刷新活动,忽略 */
      }
      navigation.navigate('AeonScene', { plotId: plot.id, displayName: plot.displayName });
    },
    [navigation],
  );

  const onManualClaim = useCallback(() => {
    const la = parseFloat(lat);
    const ln = parseFloat(lng);
    if (!Number.isFinite(la) || !Number.isFinite(ln)) {
      Alert.alert('坐标无效', '请输入有效的纬度/经度');
      return;
    }
    void onClaim(la, ln);
  }, [lat, lng, onClaim]);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.accent} />
        <Text style={styles.dim}>加载地球地图…</Text>
      </View>
    );
  }

  // ── 真地图模式(MapLibre 已安装)──
  // v11: MapView→Map, PointAnnotation→ViewAnnotation(lngLat), Camera 用 center/zoom。
  // 点空白处圈地: Map 的 onPress 回调 nativeEvent.lngLat = [lng, lat]。
  if (MapLibre?.Map) {
    const { Map, Camera, ViewAnnotation } = MapLibre;
    const onMapPress = (event: any) => {
      const lngLat = event?.nativeEvent?.lngLat;
      if (!Array.isArray(lngLat) || lngLat.length < 2) return;
      const [ln, la] = lngLat;
      Alert.alert(
        '圈一块新地?',
        `在 (${la.toFixed(3)}, ${ln.toFixed(3)}) 圈定你的领地?`,
        [
          { text: '取消', style: 'cancel' },
          { text: '圈地', onPress: () => void onClaim(la, ln) },
        ],
      );
    };
    return (
      <View style={styles.container}>
        <Map
          style={styles.map}
          mapStyle="https://demotiles.maplibre.org/style.json"
          onPress={onMapPress}
          compass
          attribution
        >
          <Camera initialViewState={{ zoom: 2 }} />
          {markers.map((m) => (
            <ViewAnnotation
              key={m.id}
              id={m.id}
              lngLat={[m.lng, m.lat]}
              anchor="bottom"
              onSelect={() => onEnter(m)}
            >
              <TouchableOpacity onPress={() => onEnter(m)} hitSlop={8}>
                <View style={styles.pin} />
              </TouchableOpacity>
            </ViewAnnotation>
          ))}
        </Map>
        <View style={styles.hintBar}>
          <Text style={styles.hintText}>
            {claiming ? '圈地中…' : '点标记进入领地 · 点空白处圈一块新地'}
          </Text>
        </View>
      </View>
    );
  }

  // ── 降级模式(MapLibre 未安装):列表 + 手动坐标圈地 ──
  return (
    <View style={styles.container}>
      <View style={styles.banner}>
        <Text style={styles.bannerText}>
          🗺️ 地图组件待安装(MapLibre,需 EAS rebuild)。当前为列表/坐标选址模式。
        </Text>
      </View>

      <Text style={styles.sectionHeader}>📍 我的领地</Text>
      {mine.length === 0 ? (
        <Text style={styles.dim}>还没有领地,在下方圈一块地</Text>
      ) : (
        <FlatList
          horizontal
          data={mine}
          keyExtractor={(p) => p.id}
          showsHorizontalScrollIndicator={false}
          renderItem={({ item }) => (
            <TouchableOpacity style={styles.plotCard} onPress={() => onEnter(item)}>
              <Text style={styles.plotName} numberOfLines={1}>{item.displayName}</Text>
              <Text style={styles.plotMeta}>{item.lat.toFixed(3)}, {item.lng.toFixed(3)}</Text>
              <Text style={styles.plotEnter}>进入 →</Text>
            </TouchableOpacity>
          )}
        />
      )}

      <Text style={styles.sectionHeader}>🌍 圈一块新地</Text>
      <View style={styles.claimRow}>
        <TextInput
          style={styles.input}
          placeholder="纬度 lat"
          placeholderTextColor={colors.textMuted}
          keyboardType="numbers-and-punctuation"
          value={lat}
          onChangeText={setLat}
        />
        <TextInput
          style={styles.input}
          placeholder="经度 lng"
          placeholderTextColor={colors.textMuted}
          keyboardType="numbers-and-punctuation"
          value={lng}
          onChangeText={setLng}
        />
        <TouchableOpacity
          style={[styles.claimBtn, claiming && { opacity: 0.5 }]}
          onPress={onManualClaim}
          disabled={claiming}
        >
          <Text style={styles.claimBtnText}>{claiming ? '…' : '圈地'}</Text>
        </TouchableOpacity>
      </View>

      <Text style={styles.sectionHeader}>🏙️ 镇上的领地({markers.length})</Text>
      <FlatList
        data={markers}
        keyExtractor={(m) => m.id}
        contentContainerStyle={{ paddingBottom: 40 }}
        renderItem={({ item }) => (
          <TouchableOpacity style={styles.markerRow} onPress={() => onEnter(item)}>
            <Text style={styles.markerName} numberOfLines={1}>{item.displayName}</Text>
            <Text style={styles.markerMeta}>{item.lat.toFixed(3)}, {item.lng.toFixed(3)}</Text>
          </TouchableOpacity>
        )}
        ListEmptyComponent={<Text style={styles.dim}>这个世界还很空旷,来当第一个居民</Text>}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bgPrimary, padding: 16 },
  center: { flex: 1, backgroundColor: colors.bgPrimary, alignItems: 'center', justifyContent: 'center' },
  map: { flex: 1, borderRadius: 12, overflow: 'hidden' },
  pin: { width: 16, height: 16, borderRadius: 8, backgroundColor: colors.accent, borderWidth: 2, borderColor: '#fff' },
  hintBar: { position: 'absolute', bottom: 16, left: 16, right: 16, backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: 10, padding: 10 },
  hintText: { color: '#fff', fontSize: 12, textAlign: 'center' },
  banner: { backgroundColor: 'rgba(167,139,250,0.10)', borderColor: 'rgba(167,139,250,0.30)', borderWidth: 1, borderRadius: 12, padding: 12, marginBottom: 12 },
  bannerText: { color: colors.textPrimary, fontSize: 12 },
  sectionHeader: { color: colors.textSecondary, fontSize: 13, fontWeight: '600', marginTop: 16, marginBottom: 8 },
  dim: { color: colors.textMuted, fontSize: 13, marginTop: 8 },
  plotCard: { width: 140, backgroundColor: colors.bgCard, borderRadius: 12, padding: 12, marginRight: 10, borderWidth: 1, borderColor: colors.border },
  plotName: { color: colors.textPrimary, fontSize: 14, fontWeight: '600' },
  plotMeta: { color: colors.textMuted, fontSize: 11, marginTop: 4 },
  plotEnter: { color: colors.accent, fontSize: 12, fontWeight: '600', marginTop: 8 },
  claimRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  input: { flex: 1, backgroundColor: colors.bgCard, borderColor: colors.border, borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, color: colors.textPrimary },
  claimBtn: { backgroundColor: colors.accent, borderRadius: 10, paddingHorizontal: 18, paddingVertical: 10 },
  claimBtnText: { color: '#fff', fontWeight: '700' },
  markerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: colors.bgCard, borderRadius: 10, padding: 12, marginBottom: 8, borderWidth: 1, borderColor: colors.border },
  markerName: { color: colors.textPrimary, fontSize: 14, fontWeight: '500', flex: 1 },
  markerMeta: { color: colors.textMuted, fontSize: 11 },
});
