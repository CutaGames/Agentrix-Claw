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
  listNearbyPlots,
  checkInPlot,
} from '../../services/aeon/aeonApi';
import type { AeonPlotDto, AeonPlotMarker, AeonNearbyPlot } from '../../../shared/types/aeon-world';
import { resolveMapStyleUrl, defaultMapZoom, hasHighPrecisionMap } from '../../config/mapStyle';

/** 尝试加载 MapLibre;未安装则 null(降级)。 */
function loadMapLibre(): any | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires, global-require
    return require('@maplibre/maplibre-react-native');
  } catch {
    return null;
  }
}

/** 尝试取实时定位(expo-location 已是依赖);失败返回 null。 */
async function getMyLocation(): Promise<{ lat: number; lng: number } | null> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires, global-require
    const Location = require('expo-location');
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') return null;
    const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy?.Balanced ?? 3 });
    return { lat: pos.coords.latitude, lng: pos.coords.longitude };
  } catch {
    return null;
  }
}

function fmtDist(m: number): string {
  return m < 1000 ? `${m}m` : `${(m / 1000).toFixed(1)}km`;
}

export default function AeonMapScreen() {
  const navigation = useNavigation<any>();
  const MapLibre = loadMapLibre();
  const [markers, setMarkers] = useState<AeonPlotMarker[]>([]);
  const [mine, setMine] = useState<AeonPlotDto[]>([]);
  const [nearby, setNearby] = useState<AeonNearbyPlot[]>([]);
  const [myLoc, setMyLoc] = useState<{ lat: number; lng: number } | null>(null);
  const [locating, setLocating] = useState(false);
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

  /** 定位 + 拉附近领地(基于实时 GPS 的地理社交)。 */
  const locateAndLoadNearby = useCallback(async () => {
    setLocating(true);
    try {
      const loc = await getMyLocation();
      if (!loc) {
        Alert.alert('需要定位权限', '开启定位后即可看到你附近的领地、就近圈地和签到。');
        return null;
      }
      setMyLoc(loc);
      try {
        setNearby(await listNearbyPlots({ lat: loc.lat, lng: loc.lng, radiusM: 5000 }));
      } catch { /* ignore */ }
      return loc;
    } finally {
      setLocating(false);
    }
  }, []);

  // 进屏自动尝试定位(失败静默,不打断列表/坐标兜底)。
  useEffect(() => {
    void locateAndLoadNearby();
  }, [locateAndLoadNearby]);

  const onClaim = useCallback(
    async (la: number, ln: number) => {
      setClaiming(true);
      try {
        const plot = await claimPlot({ lat: la, lng: ln, displayName: '我的领地' });
        await refresh();
        if (myLoc) listNearbyPlots({ lat: myLoc.lat, lng: myLoc.lng, radiusM: 5000 }).then(setNearby).catch(() => {});
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
    [refresh, myLoc],
  );

  /** 在我当前真实位置圈地(基于实时 GPS)。 */
  const onClaimHere = useCallback(async () => {
    const loc = myLoc ?? (await locateAndLoadNearby());
    if (!loc) return;
    void onClaim(loc.lat, loc.lng);
  }, [myLoc, locateAndLoadNearby, onClaim]);

  /** 地理签到:到访某地块附近(用实测 GPS)→ 得 AXP。 */
  const onCheckIn = useCallback(
    async (plotId: string) => {
      const loc = myLoc ?? (await locateAndLoadNearby());
      if (!loc) return;
      try {
        const r = await checkInPlot(plotId, loc.lat, loc.lng);
        Alert.alert(r.alreadyCheckedInToday ? '今天已签到' : '签到成功', r.message);
      } catch (e: any) {
        Alert.alert('签到失败', e?.message || '走近一点再试');
      }
    },
    [myLoc, locateAndLoadNearby],
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

  // 地图社交:点别人(或任意)地块标记 → 拜访页(看地主、留言、私信)。
  const onVisit = useCallback(
    (m: AeonPlotMarker) => {
      navigation.navigate('AeonPlotVisit', {
        plotId: m.id,
        displayName: m.displayName,
        ownerUserId: m.ownerUserId,
        ownerName: m.ownerName,
      });
    },
    [navigation],
  );

  // 直接进入"我的领地"(主基地):优先建筑最多的那块,保证每次回到同一块地,
  // 解决"建好再进又是空的"(其实是落到了不同的沙盒地块)。
  const onEnterMyTerritory = useCallback(() => {
    if (mine.length === 0) {
      Alert.alert('还没有领地', '在地图上点一块空地圈地,或用下方坐标圈地,就有自己的领地了。');
      return;
    }
    // mine[0] 即用户主地块(后端按创建顺序返回);进同一块地。
    void onEnter(mine[0]);
  }, [mine, onEnter]);

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
          mapStyle={resolveMapStyleUrl()}
          onPress={onMapPress}
          compass
          attribution
        >
          <Camera
            initialViewState={{ zoom: defaultMapZoom() }}
            {...(myLoc ? { centerCoordinate: [myLoc.lng, myLoc.lat], zoomLevel: defaultMapZoom() } : {})}
          />
          {myLoc ? (
            <ViewAnnotation id="me" lngLat={[myLoc.lng, myLoc.lat]} anchor="center">
              <View style={styles.meDot}><View style={styles.meDotInner} /></View>
            </ViewAnnotation>
          ) : null}
          {markers.map((m) => (
            <ViewAnnotation
              key={m.id}
              id={m.id}
              lngLat={[m.lng, m.lat]}
              anchor="bottom"
              onSelect={() => onVisit(m)}
            >
              <TouchableOpacity onPress={() => onVisit(m)} hitSlop={8} style={styles.pinWrap}>
                <View style={styles.pinLabel}><Text style={styles.pinLabelText} numberOfLines={1}>{m.ownerName || m.displayName}</Text></View>
                <View style={styles.pin} />
              </TouchableOpacity>
            </ViewAnnotation>
          ))}
        </Map>
        {mine.length > 0 ? (
          <TouchableOpacity style={styles.myTerritoryBtn} onPress={onEnterMyTerritory}>
            <Text style={styles.myTerritoryText}>🏙️ 进入我的领地</Text>
          </TouchableOpacity>
        ) : null}
        <TouchableOpacity style={styles.locateFab} onPress={onClaimHere} disabled={claiming || locating}>
          <Text style={styles.locateFabText}>{locating ? '定位中…' : '📍 在我的位置圈地'}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.plazaFab} onPress={() => navigation.navigate('AeonPlaza')}>
          <Text style={styles.plazaFabText}>🎪 公共广场</Text>
        </TouchableOpacity>
        <View style={styles.hintBar}>
          <Text style={styles.hintText}>
            {claiming ? '圈地中…' : '点标记进入领地 · 点空白处圈地 · 蓝点是你的位置'}
          </Text>
        </View>
      </View>
    );
  }

  // ── 降级模式(MapLibre 未安装):列表 + 手动坐标圈地 ──
  return (
    <View style={styles.container}>
      <TouchableOpacity style={styles.plazaBanner} onPress={() => navigation.navigate('AeonPlaza')}>
        <Text style={styles.plazaBannerText}>🎪 全服公共广场</Text>
        <Text style={styles.plazaBannerSub}>和全服在线玩家实时同框、群聊 →</Text>
      </TouchableOpacity>
      {mine.length > 0 ? (
        <TouchableOpacity style={styles.myTerritoryBanner} onPress={onEnterMyTerritory}>
          <Text style={styles.myTerritoryBannerText}>🏙️ 进入我的领地</Text>
          <Text style={styles.myTerritoryBannerSub}>回到你的主基地(建筑都在这里)→</Text>
        </TouchableOpacity>
      ) : null}
      <View style={styles.banner}>
        <Text style={styles.bannerText}>
          {hasHighPrecisionMap()
            ? '🗺️ 高精地图已配置,装上 MapLibre 组件(需 EAS rebuild)后可看到城市街区。当前为列表/坐标选址模式。'
            : '🗺️ 地图组件待安装(MapLibre,需 EAS rebuild)。当前为列表/坐标选址模式。'}
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
      <TouchableOpacity style={[styles.hereBtn, (claiming || locating) && { opacity: 0.5 }]} onPress={onClaimHere} disabled={claiming || locating}>
        <Text style={styles.hereBtnText}>{locating ? '📍 定位中…' : '📍 在我的真实位置圈地'}</Text>
      </TouchableOpacity>
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

      {myLoc && nearby.length > 0 ? (
        <>
          <Text style={styles.sectionHeader}>📍 附近的领地({nearby.length})</Text>
          <FlatList
            data={nearby}
            keyExtractor={(m) => m.id}
            contentContainerStyle={{ paddingBottom: 40 }}
            renderItem={({ item }) => (
              <View style={styles.markerRow}>
                <TouchableOpacity style={{ flex: 1 }} onPress={() => onVisit(item)}>
                  <Text style={styles.markerName} numberOfLines={1}>{item.displayName}{item.mine ? '(你的)' : ''}</Text>
                  <Text style={styles.markerOwner} numberOfLines={1}>👤 {item.ownerName || '匿名居民'} · {fmtDist(item.distanceM)}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.checkinBtn} onPress={() => onCheckIn(item.id)}>
                  <Text style={styles.checkinBtnText}>签到</Text>
                </TouchableOpacity>
              </View>
            )}
          />
        </>
      ) : (
        <>
          <Text style={styles.sectionHeader}>🏙️ 镇上的领地({markers.length})</Text>
          <FlatList
            data={markers}
            keyExtractor={(m) => m.id}
            contentContainerStyle={{ paddingBottom: 40 }}
            renderItem={({ item }) => (
              <TouchableOpacity style={styles.markerRow} onPress={() => onVisit(item)}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.markerName} numberOfLines={1}>{item.displayName}</Text>
                  <Text style={styles.markerOwner} numberOfLines={1}>👤 {item.ownerName || '匿名居民'}</Text>
                </View>
                <Text style={styles.markerMeta}>{item.lat.toFixed(3)}, {item.lng.toFixed(3)}</Text>
              </TouchableOpacity>
            )}
            ListEmptyComponent={<Text style={styles.dim}>这个世界还很空旷,来当第一个居民</Text>}
          />
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bgPrimary, padding: 16 },
  center: { flex: 1, backgroundColor: colors.bgPrimary, alignItems: 'center', justifyContent: 'center' },
  map: { flex: 1, borderRadius: 12, overflow: 'hidden' },
  pin: { width: 16, height: 16, borderRadius: 8, backgroundColor: colors.accent, borderWidth: 2, borderColor: '#fff' },
  pinWrap: { alignItems: 'center' },
  pinLabel: { backgroundColor: 'rgba(0,0,0,0.7)', borderRadius: 8, paddingHorizontal: 6, paddingVertical: 2, marginBottom: 2, maxWidth: 120 },
  pinLabelText: { color: '#fff', fontSize: 10, fontWeight: '600' },
  hintBar: { position: 'absolute', bottom: 16, left: 16, right: 16, backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: 10, padding: 10 },
  hintText: { color: '#fff', fontSize: 12, textAlign: 'center' },
  myTerritoryBtn: { position: 'absolute', top: 16, left: 16, right: 16, backgroundColor: colors.accent, borderRadius: 12, paddingVertical: 12, alignItems: 'center' },
  myTerritoryText: { color: '#fff', fontSize: 15, fontWeight: '800' },
  myTerritoryBanner: { backgroundColor: colors.accent, borderRadius: 12, padding: 14, marginBottom: 12, alignItems: 'center' },
  myTerritoryBannerText: { color: '#fff', fontSize: 16, fontWeight: '800' },
  myTerritoryBannerSub: { color: 'rgba(255,255,255,0.85)', fontSize: 12, marginTop: 2 },
  plazaBanner: { backgroundColor: '#2a1f4d', borderRadius: 12, padding: 14, marginBottom: 12, alignItems: 'center', borderWidth: 1, borderColor: 'rgba(167,139,250,0.4)' },
  plazaBannerText: { color: '#fff', fontSize: 16, fontWeight: '800' },
  plazaBannerSub: { color: 'rgba(255,255,255,0.85)', fontSize: 12, marginTop: 2 },
  plazaFab: { position: 'absolute', bottom: 60, right: 16, backgroundColor: '#2a1f4d', borderRadius: 20, paddingHorizontal: 16, paddingVertical: 10, borderWidth: 1, borderColor: 'rgba(167,139,250,0.5)' },
  plazaFabText: { color: '#fff', fontSize: 13, fontWeight: '700' },
  locateFab: { position: 'absolute', bottom: 108, right: 16, backgroundColor: colors.accent, borderRadius: 20, paddingHorizontal: 16, paddingVertical: 10 },
  locateFabText: { color: '#fff', fontSize: 13, fontWeight: '700' },
  meDot: { width: 22, height: 22, borderRadius: 11, backgroundColor: 'rgba(0,122,255,0.25)', alignItems: 'center', justifyContent: 'center' },
  meDotInner: { width: 12, height: 12, borderRadius: 6, backgroundColor: '#007aff', borderWidth: 2, borderColor: '#fff' },
  hereBtn: { backgroundColor: colors.accent, borderRadius: 10, paddingVertical: 11, alignItems: 'center', marginBottom: 10 },
  hereBtnText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  checkinBtn: { backgroundColor: '#140e2e', borderRadius: 14, paddingHorizontal: 14, paddingVertical: 7, borderWidth: 1, borderColor: 'rgba(167,139,250,0.5)' },
  checkinBtnText: { color: '#fff', fontSize: 12, fontWeight: '700' },
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
  markerOwner: { color: colors.textMuted, fontSize: 11, marginTop: 2 },
  markerMeta: { color: colors.textMuted, fontSize: 11 },
});
