import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors } from '../../theme/colors';
import { useI18n } from '../../stores/i18nStore';
import { WearableAgentCapabilityService } from '../../services/wearables/wearableAgentCapability.service';
import { WearableBleGatewayService } from '../../services/wearables/wearableBleGateway.service';
import { WearableDeviceAdapterService } from '../../services/wearables/wearableDeviceAdapter.service';
import { WearablePairingStoreService } from '../../services/wearables/wearablePairingStore.service';
import {
  type AgentCapabilityPreview,
  type BlePermissionState,
  type PairedWearableRecord,
  type WearableConnectionStage,
  type WearableKind,
  type WearableProfile,
  type WearableScanCandidate,
  type WearableServiceSnapshot,
} from '../../services/wearables/wearableTypes';

type DeviceFilter = 'all' | 'glass' | 'watch' | 'ring' | 'band' | 'clip' | 'sensor';

const KIND_CFG: Record<WearableKind | 'unknown', { icon: string; en: string; zh: string; color: string }> = {
  glass: { icon: '🕶️', en: 'AI Glasses', zh: 'AI 眼镜', color: '#EC4899' },
  watch: { icon: '⌚', en: 'Watch', zh: '手表', color: '#F59E0B' },
  ring: { icon: '💍', en: 'Ring', zh: '戒指', color: '#8B5CF6' },
  band: { icon: '⌚', en: 'Band', zh: '手环', color: '#3B82F6' },
  clip: { icon: '📎', en: 'Clip', zh: '夹扣', color: '#10B981' },
  sensor: { icon: '📡', en: 'Sensor', zh: '传感器', color: '#F59E0B' },
  unknown: { icon: '📱', en: 'Device', zh: '设备', color: '#6B7280' },
};

function upsertCandidate(list: WearableScanCandidate[], next: WearableScanCandidate): WearableScanCandidate[] {
  const map = new Map(list.map((c) => [c.id, c]));
  map.set(next.id, next);
  return Array.from(map.values()).sort((a, b) => (b.raw.rssi ?? -999) - (a.raw.rssi ?? -999));
}

function signalInfo(rssi: number | null): { bars: number; label: string } {
  if (rssi == null || rssi < -90) return { bars: 1, label: 'Weak' };
  if (rssi < -70) return { bars: 2, label: 'Fair' };
  if (rssi < -50) return { bars: 3, label: 'Good' };
  return { bars: 4, label: 'Strong' };
}

function relativeTime(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const m = Math.floor(ms / 60000);
  if (m < 1) return 'now';
  if (m < 60) return m + 'm';
  const h = Math.floor(m / 60);
  if (h < 24) return h + 'h';
  return Math.floor(h / 24) + 'd';
}

export function WearableHubScreen({ navigation }: any) {
  const { t } = useI18n();
  const [permissionState, setPermissionState] = useState<BlePermissionState | null>(null);
  const [scanFilter, setScanFilter] = useState<DeviceFilter>('all');
  const [scanCandidates, setScanCandidates] = useState<WearableScanCandidate[]>([]);
  const [selectedCandidateId, setSelectedCandidateId] = useState<string | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [connectionStage, setConnectionStage] = useState<WearableConnectionStage | null>(null);
  const [profile, setProfile] = useState<WearableProfile | null>(null);
  const [capabilityPreview, setCapabilityPreview] = useState<AgentCapabilityPreview | null>(null);
  const [serviceSnapshots, setServiceSnapshots] = useState<WearableServiceSnapshot[]>([]);
  const [pairedRecords, setPairedRecords] = useState<PairedWearableRecord[]>([]);
  const scanStopRef = useRef<null | (() => void)>(null);
  const connectedDeviceIdRef = useRef<string | null>(null);
  const mountedRef = useRef(true);
  const pulseAnim = useRef(new Animated.Value(1)).current;

  const filteredCandidates = useMemo(
    () => scanCandidates.filter((c) => scanFilter === 'all' || c.kind === scanFilter),
    [scanCandidates, scanFilter],
  );

  // ── Lifecycle ──────────────────────────────────────────────────────────────

  useEffect(() => {
    void loadPairedRecords();
    return () => {
      mountedRef.current = false;
      scanStopRef.current?.();
      const cid = connectedDeviceIdRef.current;
      if (cid) void WearableBleGatewayService.disconnectDevice(cid);
    };
  }, []);

  useEffect(() => {
    if (!isScanning) return;
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.15, duration: 700, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 700, useNativeDriver: true }),
      ]),
    );
    anim.start();
    return () => anim.stop();
  }, [isScanning]);

  // ── Actions ────────────────────────────────────────────────────────────────

  const loadPairedRecords = async () => {
    const records = await WearablePairingStoreService.list();
    if (mountedRef.current) setPairedRecords(records);
  };

  const requestPermissions = async (): Promise<BlePermissionState | null> => {
    setScanError(null);
    try {
      const s = await WearableBleGatewayService.requestPermissions();
      if (!mountedRef.current) return null;
      setPermissionState(s);
      if (!s.granted) {
        setScanError(t({ en: 'Please enable Bluetooth, nearby devices, and location permissions.', zh: '请开启蓝牙、附近设备和定位权限。' }));
      }
      return s;
    } catch (e: any) {
      if (mountedRef.current) setScanError(e?.message || 'Permission error');
      return null;
    }
  };

  const stopScan = () => {
    scanStopRef.current?.();
    scanStopRef.current = null;
    if (mountedRef.current) setIsScanning(false);
  };

  const startScan = async () => {
    stopScan();
    setScanError(null);
    setConnectionError(null);
    setConnectionStage(null);
    setProfile(null);
    setCapabilityPreview(null);
    setSelectedCandidateId(null);
    if (connectedDeviceIdRef.current) {
      await WearableBleGatewayService.disconnectDevice(connectedDeviceIdRef.current);
      connectedDeviceIdRef.current = null;
    }
    const perm = permissionState?.granted ? permissionState : await requestPermissions();
    if (!perm?.granted) return;
    setScanCandidates([]);
    setIsScanning(true);
    try {
      scanStopRef.current = await WearableBleGatewayService.startScan({
        durationMs: 12000,
        onDevice: (device) => {
          if (!mountedRef.current) return;
          setScanCandidates((prev) => upsertCandidate(prev, WearableDeviceAdapterService.buildScanCandidate(device)));
        },
        onFinished: (devices) => {
          if (!mountedRef.current) return;
          setIsScanning(false);
          setScanCandidates(devices.map((d) => WearableDeviceAdapterService.buildScanCandidate(d)));
        },
        onError: (err) => {
          if (!mountedRef.current) return;
          setIsScanning(false);
          setScanError(err.message);
        },
      });
    } catch (e: any) {
      if (mountedRef.current) { setIsScanning(false); setScanError(e?.message || 'Scan error'); }
    }
  };

  const connectCandidate = async (candidate: WearableScanCandidate) => {
    stopScan();
    setSelectedCandidateId(candidate.id);
    setConnectionError(null);
    setProfile(null);
    setCapabilityPreview(null);
    setServiceSnapshots([]);
    setConnectionStage('connecting');
    if (connectedDeviceIdRef.current && connectedDeviceIdRef.current !== candidate.id) {
      await WearableBleGatewayService.disconnectDevice(connectedDeviceIdRef.current);
      connectedDeviceIdRef.current = null;
    }
    try {
      const snap = await WearableBleGatewayService.connectAndInspect(candidate.raw, (stage) => {
        if (mountedRef.current) setConnectionStage(stage);
      });
      if (!mountedRef.current) return;
      connectedDeviceIdRef.current = snap.device.id;
      setServiceSnapshots(snap.services);
      const p = WearableDeviceAdapterService.adaptConnectionSnapshot(snap);
      const cap = WearableAgentCapabilityService.buildCapabilityPreview(p);
      setProfile(p);
      setCapabilityPreview(cap);
      setConnectionStage('done');
      const records = await WearablePairingStoreService.save(p, cap.verificationEvent);
      if (mountedRef.current) setPairedRecords(records);
    } catch (e: any) {
      if (mountedRef.current) { setConnectionStage(null); setConnectionError(e?.message || 'Connection failed'); }
    }
  };

  const removePairedRecord = async (deviceId: string) => {
    const records = await WearablePairingStoreService.remove(deviceId);
    if (mountedRef.current) setPairedRecords(records);
  };

  const openMonitor = (deviceId: string) => {
    navigation?.navigate?.('WearableMonitor', { deviceId });
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <SafeAreaView style={st.safe} edges={['top']}>
      <ScrollView style={st.scroll} contentContainerStyle={st.content} showsVerticalScrollIndicator={false}>

        {/* ── Header ── */}
        <View style={st.header}>
          <Text style={st.headerTitle}>{t({ en: 'Wearable Devices', zh: '穿戴设备' })}</Text>
          <Text style={st.headerSub}>
            {pairedRecords.length > 0
              ? `${pairedRecords.length} ${t({ en: 'paired', zh: '已配对' })}`
              : t({ en: 'Scan to add a device', zh: '搜索添加设备' })}
          </Text>
        </View>

        {/* ── Supported device types ── */}
        <View style={st.supportedRow}>
          {([
            { icon: '🕶️', label: t({ en: 'AI Glasses', zh: 'AI 眼镜' }), color: '#EC4899' },
            { icon: '⌚', label: t({ en: 'Watch', zh: '手表' }), color: '#F59E0B' },
            { icon: '💍', label: t({ en: 'Ring', zh: '戒指' }), color: '#8B5CF6' },
            { icon: '📡', label: t({ en: 'Sensor', zh: '传感器' }), color: '#10B981' },
          ]).map((d) => (
            <View key={d.label} style={[st.supportedChip, { borderColor: d.color + '40' }]}>
              <Text style={{ fontSize: 18 }}>{d.icon}</Text>
              <Text style={[st.supportedText, { color: d.color }]}>{d.label}</Text>
            </View>
          ))}
        </View>

        {/* ── Paired devices ── */}
        {pairedRecords.length > 0 && (
          <View style={st.section}>
            <Text style={st.sectionLabel}>{t({ en: 'MY DEVICES', zh: '我的设备' })}</Text>
            {pairedRecords.map((rec) => {
              const kc = KIND_CFG[rec.kind] || KIND_CFG.unknown;
              return (
                <TouchableOpacity key={rec.id} style={st.pairedCard} onPress={() => openMonitor(rec.id)} activeOpacity={0.7}>
                  <View style={[st.kindBadge, { backgroundColor: kc.color + '20' }]}>
                    <Text style={st.kindEmoji}>{kc.icon}</Text>
                  </View>
                  <View style={st.pairedInfo}>
                    <Text style={st.pairedName} numberOfLines={1}>{rec.name}</Text>
                    <Text style={st.pairedMeta}>{t({ en: kc.en, zh: kc.zh })} · {relativeTime(rec.lastSeenAt)}</Text>
                    <View style={st.chipRow}>
                      {rec.serviceLabels.slice(0, 3).map((lbl) => (
                        <View key={`${rec.id}-${lbl}`} style={st.chip}><Text style={st.chipText}>{lbl}</Text></View>
                      ))}
                    </View>
                  </View>
                  <View style={st.pairedRight}>
                    <TouchableOpacity style={st.monitorBtn} onPress={() => openMonitor(rec.id)}>
                      <Text style={st.monitorBtnText}>{t({ en: 'Monitor', zh: '监控' })}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => { void removePairedRecord(rec.id); }}>
                      <Text style={st.removeText}>✕</Text>
                    </TouchableOpacity>
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        )}

        {/* ── Quick health summary ── */}
        {pairedRecords.length > 0 && (
          <View style={st.healthRow}>
            {[
              { icon: '♥', label: t({ en: 'Heart', zh: '心率' }), val: '--', unit: 'bpm', c: '#EF4444' },
              { icon: '🔋', label: t({ en: 'Battery', zh: '电量' }), val: '--', unit: '%', c: '#10B981' },
              { icon: '🚶', label: t({ en: 'Steps', zh: '步数' }), val: '--', unit: '', c: '#3B82F6' },
            ].map((m) => (
              <View key={m.label} style={st.healthCard}>
                <Text style={[st.healthIcon, { color: m.c }]}>{m.icon}</Text>
                <Text style={st.healthVal}>{m.val}</Text>
                <Text style={st.healthUnit}>{m.unit}</Text>
                <Text style={st.healthLabel}>{m.label}</Text>
              </View>
            ))}
          </View>
        )}

        {/* ── Add device ── */}
        <View style={st.section}>
          <Text style={st.sectionLabel}>{t({ en: 'ADD DEVICE', zh: '添加设备' })}</Text>

          {(scanError || connectionError) && (
            <View style={st.alertCard}>
              <Text style={st.alertEmoji}>⚠️</Text>
              <Text style={st.alertText}>{scanError || connectionError}</Text>
            </View>
          )}

          <TouchableOpacity
            testID="wearable-scan-btn"
            accessibilityLabel="wearable-scan-btn"
            style={[st.scanBtn, isScanning && st.scanBtnActive]}
            onPress={() => {
              if (isScanning) { stopScan(); return; }
              void startScan();
            }}
            activeOpacity={0.8}
          >
            {isScanning ? (
              <Animated.View style={{ transform: [{ scale: pulseAnim }] }}>
                <Text style={st.scanBtnIcon}>⌁</Text>
              </Animated.View>
            ) : (
              <Text style={st.scanBtnIcon}>📡</Text>
            )}
            <Text style={st.scanBtnText}>
              {isScanning
                ? t({ en: 'Scanning… Tap to cancel', zh: '搜索中… 点击取消' })
                : t({ en: 'Scan for Devices', zh: '搜索设备' })}
            </Text>
          </TouchableOpacity>

          {/* BLE state hint — makes the scan progress visible and exposes a cancel affordance
              so users aren't stuck watching a 12-second silent spinner with BT off. */}
          {isScanning && (
            <View testID="wearable-scan-status" style={st.scanStatus}>
              <ActivityIndicator size="small" color={colors.primary} />
              <Text style={st.scanStatusText}>
                {permissionState?.granted === false
                  ? t({ en: 'Bluetooth permission denied — grant access in Settings', zh: '蓝牙权限未授权 — 请在设置中开启' })
                  : t({ en: 'Looking for nearby BLE wearables (up to 12s)…', zh: '正在搜索附近蓝牙设备（最多 12 秒）…' })}
              </Text>
              <TouchableOpacity
                testID="wearable-scan-cancel"
                onPress={stopScan}
                style={st.scanCancelBtn}
                activeOpacity={0.8}
              >
                <Text style={st.scanCancelText}>{t({ en: 'Cancel', zh: '取消' })}</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Filter chips */}
          {(isScanning || scanCandidates.length > 0) && (
            <View style={st.filterRow}>
              {(['all', 'glass', 'watch', 'ring', 'band', 'clip', 'sensor'] as DeviceFilter[]).map((f) => {
                const lbl = f === 'all'
                  ? t({ en: 'All', zh: '全部' })
                  : t({ en: KIND_CFG[f].en, zh: KIND_CFG[f].zh });
                return (
                  <TouchableOpacity key={f} style={[st.filterChip, scanFilter === f && st.filterChipOn]} onPress={() => setScanFilter(f)}>
                    <Text style={[st.filterText, scanFilter === f && st.filterTextOn]}>
                      {lbl}{f === 'all' ? ` (${scanCandidates.length})` : ''}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          )}

          {/* Scan results */}
          {filteredCandidates.map((c) => {
            const kc = KIND_CFG[c.kind] || KIND_CFG.unknown;
            const sig = signalInfo(c.raw.rssi);
            const isSel = selectedCandidateId === c.id;
            const connecting = isSel && connectionStage != null && connectionStage !== 'done';
            const connected = isSel && connectionStage === 'done';
            return (
              <View key={c.id} style={[st.scanCard, isSel && st.scanCardSel]}>
                <View style={st.scanTop}>
                  <View style={[st.kindBadge, { backgroundColor: kc.color + '20' }]}>
                    <Text style={st.kindEmoji}>{kc.icon}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={st.scanName} numberOfLines={1}>{c.name}</Text>
                    <Text style={st.scanMeta}>{t({ en: kc.en, zh: kc.zh })} · {sig.label}</Text>
                  </View>
                  <View style={st.sigBars}>
                    {[1, 2, 3, 4].map((i) => (
                      <View key={i} style={[st.sigBar, { height: 4 + i * 3, backgroundColor: i <= sig.bars ? kc.color : colors.border }]} />
                    ))}
                  </View>
                </View>
                {c.serviceLabels.length > 0 && (
                  <View style={st.chipRow}>
                    {c.serviceLabels.slice(0, 4).map((lbl) => (
                      <View key={`${c.id}-${lbl}`} style={st.chip}><Text style={st.chipText}>{lbl}</Text></View>
                    ))}
                  </View>
                )}
                {isSel && connectionStage && (
                  <View style={st.stageRow}>
                    {(['connecting', 'discovering', 'reading', 'done'] as const).map((s, i) => {
                      const idx = ['connecting', 'discovering', 'reading', 'done'].indexOf(connectionStage);
                      const past = idx >= i;
                      return (
                        <View key={s} style={st.stageItem}>
                          <View style={[st.stageDot, past && st.stageDotDone, connectionStage === s && st.stageDotCur]} />
                          <Text style={[st.stageText, past && st.stageTextDone]}>
                            {s === 'connecting' ? t({ en: 'Connect', zh: '连接' })
                              : s === 'discovering' ? t({ en: 'Discover', zh: '发现' })
                                : s === 'reading' ? t({ en: 'Verify', zh: '验证' })
                                  : t({ en: 'Done', zh: '完成' })}
                          </Text>
                        </View>
                      );
                    })}
                  </View>
                )}
                {!connected && !connecting && (
                  <TouchableOpacity style={st.connectBtn} onPress={() => { void connectCandidate(c); }} activeOpacity={0.8}>
                    <Text style={st.connectBtnText}>{t({ en: 'Connect & Pair', zh: '连接配对' })}</Text>
                  </TouchableOpacity>
                )}
                {connecting && (
                  <View style={st.connectingBar}>
                    <Text style={st.connectingText}>{t({ en: 'Connecting...', zh: '正在连接...' })}</Text>
                  </View>
                )}
                {connected && profile && (
                  <View style={st.connectedBar}>
                    <Text style={st.connectedIcon}>✓</Text>
                    <Text style={st.connectedText}>{t({ en: 'Paired', zh: '已配对' })}</Text>
                    <TouchableOpacity style={st.goMonitorBtn} onPress={() => openMonitor(c.id)}>
                      <Text style={st.goMonitorText}>{t({ en: 'Open Monitor →', zh: '打开监控 →' })}</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            );
          })}

          {/* Empty */}
          {!isScanning && scanCandidates.length === 0 && pairedRecords.length === 0 && (
            <View style={st.empty}>
              <Text style={st.emptyEmoji}>⌚</Text>
              <Text style={st.emptyTitle}>{t({ en: 'No Wearable Devices', zh: '无穿戴设备' })}</Text>
              <Text style={st.emptyDesc}>
                {t({ en: 'Tap the scan button to discover nearby Bluetooth LE wearables.', zh: '点击搜索按钮，发现附近的蓝牙低功耗穿戴设备。' })}
              </Text>
            </View>
          )}
        </View>

        {/* ── Supported devices ── */}
        <View style={st.supportSection}>
          <Text style={st.supportTitle}>{t({ en: 'Supported Devices', zh: '支持的设备' })}</Text>
          <View style={st.supportGrid}>
            {(['ring', 'band', 'clip', 'sensor'] as const).map((k) => (
              <View key={k} style={st.supportItem}>
                <View style={[st.supportBadge, { backgroundColor: KIND_CFG[k].color + '15' }]}>
                  <Text style={{ fontSize: 24 }}>{KIND_CFG[k].icon}</Text>
                </View>
                <Text style={st.supportLabel}>{t({ en: KIND_CFG[k].en, zh: KIND_CFG[k].zh })}</Text>
              </View>
            ))}
          </View>
          <Text style={st.supportHint}>
            {t({ en: 'Any BLE device with standard GATT services is automatically recognized.', zh: '支持任何具有标准 GATT 服务的低功耗蓝牙设备。' })}
          </Text>
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

// ── Styles ───────────────────────────────────────────────────────────────────

const st = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bgPrimary },
  scroll: { flex: 1 },
  content: { padding: 16, gap: 14 },
  header: { paddingVertical: 8 },
  headerTitle: { fontSize: 22, fontWeight: '700', color: colors.textPrimary },
  headerSub: { fontSize: 13, color: colors.textMuted, marginTop: 2 },
  supportedRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  supportedChip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingVertical: 8, paddingHorizontal: 12,
    borderRadius: 12, borderWidth: 1,
    backgroundColor: colors.bgCard,
  },
  supportedText: { fontSize: 12, fontWeight: '600' },
  section: { gap: 10 },
  sectionLabel: { fontSize: 11, fontWeight: '700', color: colors.textMuted, letterSpacing: 1, textTransform: 'uppercase' },
  pairedCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: colors.bgCard, borderRadius: 16, padding: 14,
    borderWidth: 1, borderColor: colors.border,
  },
  kindBadge: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  kindEmoji: { fontSize: 22 },
  pairedInfo: { flex: 1 },
  pairedName: { fontSize: 15, fontWeight: '700', color: colors.textPrimary },
  pairedMeta: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 6 },
  chip: { backgroundColor: colors.bgSecondary, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  chipText: { fontSize: 10, fontWeight: '600', color: colors.textMuted },
  pairedRight: { alignItems: 'flex-end', gap: 8 },
  monitorBtn: { backgroundColor: colors.primary, borderRadius: 8, paddingHorizontal: 14, paddingVertical: 7 },
  monitorBtnText: { color: '#FFF', fontSize: 12, fontWeight: '700' },
  removeText: { fontSize: 14, color: colors.textMuted, padding: 4 },
  healthRow: { flexDirection: 'row', gap: 10 },
  healthCard: {
    flex: 1, backgroundColor: colors.bgCard, borderRadius: 14, padding: 12,
    alignItems: 'center', gap: 2, borderWidth: 1, borderColor: colors.border,
  },
  healthIcon: { fontSize: 20 },
  healthVal: { fontSize: 22, fontWeight: '800', color: colors.textPrimary },
  healthUnit: { fontSize: 11, color: colors.textMuted },
  healthLabel: { fontSize: 11, color: colors.textMuted, marginTop: 2 },
  alertCard: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 8,
    backgroundColor: '#FEF3C720', borderRadius: 12, padding: 12,
  },
  alertEmoji: { fontSize: 16 },
  alertText: { flex: 1, fontSize: 13, color: colors.warning, lineHeight: 19 },
  scanBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 10, backgroundColor: colors.primary, borderRadius: 16, paddingVertical: 16,
  },
  scanBtnActive: { opacity: 0.85 },
  scanBtnIcon: { fontSize: 20, color: '#FFF' },
  scanBtnText: { fontSize: 16, fontWeight: '700', color: '#FFF' },
  scanStatus: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: colors.bgSecondary, borderRadius: 12,
    paddingVertical: 10, paddingHorizontal: 14,
    borderWidth: 1, borderColor: colors.border,
  },
  scanStatusText: { flex: 1, fontSize: 13, color: colors.textSecondary, lineHeight: 18 },
  scanCancelBtn: {
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 10,
    backgroundColor: colors.bgCard, borderWidth: 1, borderColor: colors.border,
  },
  scanCancelText: { color: colors.textPrimary, fontSize: 12, fontWeight: '700' },
  filterRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  filterChip: {
    paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20,
    backgroundColor: colors.bgSecondary, borderWidth: 1, borderColor: colors.border,
  },
  filterChipOn: { backgroundColor: colors.primary + '18', borderColor: colors.primary },
  filterText: { fontSize: 12, fontWeight: '600', color: colors.textMuted },
  filterTextOn: { color: colors.primary },
  scanCard: {
    backgroundColor: colors.bgCard, borderRadius: 16, padding: 14,
    borderWidth: 1, borderColor: colors.border, gap: 10,
  },
  scanCardSel: { borderColor: colors.primary },
  scanTop: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  scanName: { fontSize: 15, fontWeight: '700', color: colors.textPrimary },
  scanMeta: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  sigBars: { flexDirection: 'row', alignItems: 'flex-end', gap: 2, height: 18 },
  sigBar: { width: 4, borderRadius: 2 },
  stageRow: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 8 },
  stageItem: { alignItems: 'center', gap: 4 },
  stageDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.border },
  stageDotDone: { backgroundColor: colors.success },
  stageDotCur: { backgroundColor: colors.primary, borderWidth: 2, borderColor: colors.primary + '55' },
  stageText: { fontSize: 10, color: colors.textMuted },
  stageTextDone: { color: colors.success, fontWeight: '600' },
  connectBtn: { backgroundColor: colors.primary, borderRadius: 12, paddingVertical: 12, alignItems: 'center' },
  connectBtnText: { color: '#FFF', fontSize: 14, fontWeight: '700' },
  connectingBar: { backgroundColor: colors.primary + '15', borderRadius: 12, paddingVertical: 12, alignItems: 'center' },
  connectingText: { color: colors.primary, fontSize: 14, fontWeight: '600' },
  connectedBar: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: colors.success + '15', borderRadius: 12, paddingVertical: 10, paddingHorizontal: 14,
  },
  connectedIcon: { color: colors.success, fontSize: 16, fontWeight: '700' },
  connectedText: { color: colors.success, fontSize: 14, fontWeight: '600', flex: 1 },
  goMonitorBtn: { paddingHorizontal: 12, paddingVertical: 6, backgroundColor: colors.primary, borderRadius: 8 },
  goMonitorText: { color: '#FFF', fontSize: 12, fontWeight: '700' },
  empty: { alignItems: 'center', paddingVertical: 40, paddingHorizontal: 32 },
  emptyEmoji: { fontSize: 48, marginBottom: 12 },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: colors.textPrimary, marginBottom: 6 },
  emptyDesc: { fontSize: 14, color: colors.textMuted, textAlign: 'center', lineHeight: 22 },
  supportSection: { gap: 12 },
  supportTitle: { fontSize: 12, fontWeight: '700', color: colors.textMuted, letterSpacing: 0.5 },
  supportGrid: { flexDirection: 'row', gap: 12 },
  supportItem: { flex: 1, alignItems: 'center', gap: 8 },
  supportBadge: { width: 52, height: 52, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  supportLabel: { fontSize: 12, fontWeight: '600', color: colors.textPrimary },
  supportHint: { fontSize: 12, color: colors.textMuted, lineHeight: 18, textAlign: 'center' },
});
