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
  Modal,
  ScrollView,
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
  findNearbyPeople,
  clearGeoPresence,
  checkinLeaderboard,
} from '../../services/aeon/aeonApi';
import type { AeonPlotDto, AeonPlotMarker, AeonNearbyPlot, AeonNearbyPerson, AeonCheckinLeaderEntry } from '../../../shared/types/aeon-world';
import { wgs84ToGcj02 } from '../../../shared/types/aeon-world';
import { resolveMapStyle, defaultMapZoom, hasHighPrecisionMap, mapBaseIsGcj02 } from '../../config/mapStyle';

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
  const [people, setPeople] = useState<AeonNearbyPerson[]>([]);
  const [myLoc, setMyLoc] = useState<{ lat: number; lng: number } | null>(null);
  const [locating, setLocating] = useState(false);
  const [loading, setLoading] = useState(true);
  const [lat, setLat] = useState('');
  const [lng, setLng] = useState('');
  const [claiming, setClaiming] = useState(false);
  const [boardOpen, setBoardOpen] = useState(false);
  const [board, setBoard] = useState<AeonCheckinLeaderEntry[]>([]);

  const openBoard = useCallback(async () => {
    setBoardOpen(true);
    try {
      setBoard(await checkinLeaderboard(30));
    } catch { setBoard([]); }
  }, []);

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
      // 附近的人:上报我的位置 + 拉附近在线玩家(在场聚合)。
      try {
        setPeople(await findNearbyPeople({ lat: loc.lat, lng: loc.lng, radiusM: 5000 }));
      } catch { /* ignore */ }
      return loc;
    } finally {
      setLocating(false);
    }
  }, []);

  // 进屏自动尝试定位(失败静默,不打断列表/坐标兜底)。
  useEffect(() => {
    void locateAndLoadNearby();
    // 退出地图清除我的实时位置(不再出现在别人"附近的人")。
    return () => {
      clearGeoPresence().catch(() => {});
    };
  }, [locateAndLoadNearby]);

  /**
   * 把 WGS-84(GPS/存库)坐标投影到当前底图坐标系用于渲染:
   * 国内底图(天地图,GCJ-02)需转换,否则标记会偏移数百米;国外底图(WGS-84)原样。
   * 返回 [lng, lat](MapLibre 坐标顺序)。
   */
  const toBase = useCallback((la: number, ln: number): [number, number] => {
    if (mapBaseIsGcj02()) {
      const g = wgs84ToGcj02(la, ln);
      return [g.lng, g.lat];
    }
    return [ln, la];
  }, []);

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

  /** 打卡榜弹窗(两模式共用)。 */
  const renderBoardModal = () => (
    <Modal visible={boardOpen} transparent animationType="slide" onRequestClose={() => setBoardOpen(false)}>
      <View style={styles.boardBackdrop}>
        <View style={styles.boardCard}>
          <Text style={styles.boardTitle}>🏆 打卡榜(近 30 天)</Text>
          <ScrollView style={{ maxHeight: 380 }}>
            {board.length === 0 ? (
              <Text style={styles.dim}>还没有人打卡。去附近的领地签到,登上榜首!</Text>
            ) : (
              board.map((b, i) => (
                <View key={b.userId} style={styles.boardRow}>
                  <Text style={styles.boardRank}>{i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}`}</Text>
                  <Text style={styles.boardName} numberOfLines={1}>{b.displayName}</Text>
                  <Text style={styles.boardStat}>{b.checkins}次·{b.distinctPlots}地·连{b.streakDays}天</Text>
                </View>
              ))
            )}
          </ScrollView>
          <TouchableOpacity style={styles.boardClose} onPress={() => setBoardOpen(false)}>
            <Text style={styles.boardCloseText}>关闭</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );

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
      let [ln, la] = lngLat;
      // 国内底图点选得到的是 GCJ-02,圈地存库需转回 WGS-84(与 GPS/距离计算一致)。
      if (mapBaseIsGcj02()) {
        // 动态 require 避免顶层耦合;gcj02ToWgs84 在 shared 里。
        // eslint-disable-next-line @typescript-eslint/no-var-requires, global-require
        const { gcj02ToWgs84 } = require('../../../shared/types/aeon-world');
        const w = gcj02ToWgs84(la, ln);
        la = w.lat; ln = w.lng;
      }
      Alert.alert(
        '圈一块新地?',
        `在 (${la.toFixed(3)}, ${ln.toFixed(3)}) 圈定你的领地?`,
        [
          { text: '取消', style: 'cancel' },
          { text: '圈地', onPress: () => void onClaim(la, ln) },
        ],
      );
    };
    const meBase = myLoc ? toBase(myLoc.lat, myLoc.lng) : null;
    return (
      <View style={styles.container}>
        <Map
          style={styles.map}
          mapStyle={resolveMapStyle()}
          onPress={onMapPress}
          compass
          attribution
        >
          <Camera
            initialViewState={{ zoom: defaultMapZoom() }}
            {...(meBase ? { centerCoordinate: meBase, zoomLevel: defaultMapZoom() } : {})}
          />
          {meBase ? (
            <ViewAnnotation id="me" lngLat={meBase} anchor="center">
              <View style={styles.meDot}><View style={styles.meDotInner} /></View>
            </ViewAnnotation>
          ) : null}
          {markers.map((m) => (
            <ViewAnnotation
              key={m.id}
              id={m.id}
              lngLat={toBase(m.lat, m.lng)}
              anchor="bottom"
              onSelect={() => onVisit(m)}
            >
              <TouchableOpacity onPress={() => onVisit(m)} hitSlop={8} style={styles.pinWrap}>
                <View style={[styles.pinLabel, m.poiName && styles.pinLabelShop]}>
                  <Text style={styles.pinLabelText} numberOfLines={1}>{m.poiName ? `🏪 ${m.poiName}` : (m.ownerName || m.displayName)}</Text>
                </View>
                <View style={[styles.pin, m.poiName && styles.pinShop]} />
              </TouchableOpacity>
            </ViewAnnotation>
          ))}
        </Map>
        {mine.length > 0 ? (
          <TouchableOpacity style={styles.myTerritoryBtn} onPress={onEnterMyTerritory}>
            <Text style={styles.myTerritoryText}>🏙️ 进入我的领地</Text>
          </TouchableOpacity>
        ) : null}
        {people.length > 0 ? (
          <View style={styles.peopleBar}>
            <Text style={styles.peopleBarText} numberOfLines={1}>👥 附近 {people.length} 人在线 · 最近 {people[0].displayName}({people[0].distanceM < 1000 ? `${people[0].distanceM}m` : `${(people[0].distanceM / 1000).toFixed(1)}km`})</Text>
          </View>
        ) : null}
        <TouchableOpacity style={styles.locateFab} onPress={onClaimHere} disabled={claiming || locating}>
          <Text style={styles.locateFabText}>{locating ? '定位中…' : '📍 在我的位置圈地'}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.plazaFab} onPress={() => navigation.navigate('AeonPlaza')}>
          <Text style={styles.plazaFabText}>🎪 公共广场</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.boardFab} onPress={openBoard}>
          <Text style={styles.boardFabText}>🏆 打卡榜</Text>
        </TouchableOpacity>
        <View style={styles.hintBar}>
          <Text style={styles.hintText}>
            {claiming ? '圈地中…' : '点标记进入领地 · 🏪是商家 · 蓝点是你 · 点空白圈地'}
          </Text>
        </View>
        {renderBoardModal()}
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
      <TouchableOpacity style={styles.boardBanner} onPress={openBoard}>
        <Text style={styles.boardBannerText}>🏆 打卡榜 · 看谁去过最多地方</Text>
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

      {people.length > 0 ? (
        <>
          <Text style={styles.sectionHeader}>👥 附近的人({people.length})</Text>
          <FlatList
            horizontal
            data={people}
            keyExtractor={(p) => p.userId}
            showsHorizontalScrollIndicator={false}
            renderItem={({ item }) => (
              <View style={styles.personCard}>
                <Text style={styles.personAvatar}>🧑</Text>
                <Text style={styles.personName} numberOfLines={1}>{item.displayName}</Text>
                <Text style={styles.personMeta}>{item.distanceM < 1000 ? `${item.distanceM}m` : `${(item.distanceM / 1000).toFixed(1)}km`}</Text>
              </View>
            )}
          />
        </>
      ) : null}

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
      {renderBoardModal()}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bgPrimary, padding: 16 },
  center: { flex: 1, backgroundColor: colors.bgPrimary, alignItems: 'center', justifyContent: 'center' },
  map: { flex: 1, borderRadius: 12, overflow: 'hidden' },
  pin: { width: 16, height: 16, borderRadius: 8, backgroundColor: colors.accent, borderWidth: 2, borderColor: '#fff' },
  pinShop: { backgroundColor: '#f5a623' },
  pinWrap: { alignItems: 'center' },
  pinLabel: { backgroundColor: 'rgba(0,0,0,0.7)', borderRadius: 8, paddingHorizontal: 6, paddingVertical: 2, marginBottom: 2, maxWidth: 120 },
  pinLabelShop: { backgroundColor: 'rgba(245,166,35,0.85)' },
  pinLabelText: { color: '#fff', fontSize: 10, fontWeight: '600' },
  peopleBar: { position: 'absolute', top: 16, left: 16, right: 16, backgroundColor: 'rgba(20,14,46,0.85)', borderRadius: 10, padding: 8, borderWidth: 1, borderColor: 'rgba(167,139,250,0.4)' },
  peopleBarText: { color: '#fff', fontSize: 12, textAlign: 'center' },
  personCard: { width: 80, alignItems: 'center', backgroundColor: colors.bgCard, borderRadius: 12, padding: 10, marginRight: 10, borderWidth: 1, borderColor: colors.border },
  personAvatar: { fontSize: 24 },
  personName: { color: colors.textPrimary, fontSize: 11, fontWeight: '600', marginTop: 4, maxWidth: 64, textAlign: 'center' },
  personMeta: { color: colors.textMuted, fontSize: 10, marginTop: 2 },
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
  boardFab: { position: 'absolute', bottom: 16, left: 16, backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8 },
  boardFabText: { color: '#f5c84c', fontSize: 13, fontWeight: '700' },
  boardBanner: { backgroundColor: colors.bgCard, borderRadius: 12, padding: 12, marginBottom: 12, alignItems: 'center', borderWidth: 1, borderColor: colors.border },
  boardBannerText: { color: '#f5c84c', fontSize: 14, fontWeight: '700' },
  boardBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' },
  boardCard: { backgroundColor: colors.bgSecondary, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, paddingBottom: 36 },
  boardTitle: { color: colors.textPrimary, fontSize: 17, fontWeight: '800', marginBottom: 12, textAlign: 'center' },
  boardRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  boardRank: { color: colors.textPrimary, fontSize: 15, fontWeight: '800', width: 28, textAlign: 'center' },
  boardName: { color: colors.textPrimary, fontSize: 14, flex: 1 },
  boardStat: { color: colors.textMuted, fontSize: 11 },
  boardClose: { marginTop: 14, paddingVertical: 12, alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 10 },
  boardCloseText: { color: colors.textSecondary, fontSize: 14 },
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
