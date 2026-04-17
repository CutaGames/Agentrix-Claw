import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors } from '../../theme/colors';
import { useI18n } from '../../stores/i18nStore';
import { apiFetch } from '../../services/api';
import { WearableDataCollectorService } from '../../services/wearables/wearableDataCollector.service';
import { WearableAutomationEngineService } from '../../services/wearables/wearableAutomationEngine.service';
import { WearablePairingStoreService } from '../../services/wearables/wearablePairingStore.service';
import {
  type AutomationRule,
  type CollectorState,
  type MonitoredChannel,
  type PairedWearableRecord,
  type TelemetryChannel,
  type TelemetrySample,
  type TriggerEvent,
} from '../../services/wearables/wearableTypes';

type ScreenTab = 'live' | 'rules' | 'history';

const CHANNEL_META: Record<TelemetryChannel, { label: string; icon: string; unit: string; color: string }> = {
  heart_rate: { label: 'Heart Rate', icon: '♥', unit: 'bpm', color: '#EF4444' },
  spo2: { label: 'SpO₂', icon: '○', unit: '%', color: '#8B5CF6' },
  temperature: { label: 'Temperature', icon: '🌡', unit: '°C', color: '#F59E0B' },
  steps: { label: 'Steps', icon: '🚶', unit: '', color: '#3B82F6' },
  battery: { label: 'Battery', icon: '🔋', unit: '%', color: '#10B981' },
  accelerometer: { label: 'Accel', icon: '⟐', unit: '', color: '#6366F1' },
  custom: { label: 'Custom', icon: '◆', unit: '', color: '#6B7280' },
};

const DEFAULT_MONITORED_CHANNELS: MonitoredChannel[] = [
  {
    channel: 'heart_rate', serviceUuid: '180d', characteristicUuid: '2a37',
    label: 'Heart Rate', parser: 'heart_rate_measurement', intervalMs: 1000,
    enabled: true, lastValue: null, lastUpdatedAt: null,
  },
  {
    channel: 'battery', serviceUuid: '180f', characteristicUuid: '2a19',
    label: 'Battery', parser: 'battery_level', intervalMs: 5000,
    enabled: true, lastValue: null, lastUpdatedAt: null,
  },
  {
    channel: 'temperature', serviceUuid: '1809', characteristicUuid: '2a1c',
    label: 'Temperature', parser: 'temperature', intervalMs: 5000,
    enabled: true, lastValue: null, lastUpdatedAt: null,
  },
];

function buildCollectorChannels(device: PairedWearableRecord): MonitoredChannel[] {
  const supportsTemp = device.kind === 'sensor' || device.serviceLabels.some((l) => /temp/i.test(l));
  return DEFAULT_MONITORED_CHANNELS
    .filter((ch) => supportsTemp || ch.channel !== 'temperature')
    .map((ch) => ({ ...ch }));
}

export function WearableMonitorScreen({ navigation, route }: any) {
  const { t } = useI18n();
  const routeDeviceId = route?.params?.deviceId as string | undefined;
  const [activeTab, setActiveTab] = useState<ScreenTab>('live');
  const [collectorState, setCollectorState] = useState<CollectorState | null>(null);
  const [recentSamples, setRecentSamples] = useState<TelemetrySample[]>([]);
  const [rules, setRules] = useState<AutomationRule[]>([]);
  const [triggerHistory, setTriggerHistory] = useState<TriggerEvent[]>([]);
  const [pairedDevices, setPairedDevices] = useState<PairedWearableRecord[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string | null>(routeDeviceId || null);
  const mountedRef = useRef(true);

  useEffect(() => {
    void initialize();
    return () => { mountedRef.current = false; };
  }, []);

  useEffect(() => {
    const unsub = WearableDataCollectorService.onStateChange((state) => {
      if (mountedRef.current) setCollectorState(state);
    });
    return unsub;
  }, []);

  useEffect(() => {
    const unsub = WearableDataCollectorService.onSample((sample) => {
      if (mountedRef.current) setRecentSamples((prev) => [sample, ...prev].slice(0, 50));
    });
    return unsub;
  }, []);

  useEffect(() => {
    const unsub = WearableAutomationEngineService.onTrigger((event) => {
      if (mountedRef.current) setTriggerHistory((prev) => [event, ...prev].slice(0, 100));
    });
    return unsub;
  }, []);

  const initialize = async () => {
    const devices = await WearablePairingStoreService.list();
    if (!mountedRef.current) return;
    setPairedDevices(devices);
    if (!selectedDeviceId && devices.length > 0) setSelectedDeviceId(devices[0].id);
    await WearableAutomationEngineService.initialize();
    setRules(WearableAutomationEngineService.getRules());
    setTriggerHistory(WearableAutomationEngineService.getHistory());
  };

  const handleStartCollector = async () => {
    if (!selectedDeviceId) return;
    try {
      const device = pairedDevices.find((d) => d.id === selectedDeviceId);
      if (!device) throw new Error('Selected device not found');
      WearableDataCollectorService.configure(
        {
          deviceId: device.id, deviceName: device.name,
          channels: buildCollectorChannels(device),
          flushIntervalMs: 30_000, maxBufferSize: 50,
          reconnectMaxAttempts: 5, reconnectDelayMs: 3_000,
        },
        async (payload) => {
          await apiFetch('/wearable-telemetry/upload', { method: 'POST', body: JSON.stringify(payload) });
        },
      );
      await WearableDataCollectorService.start();
      WearableAutomationEngineService.start();
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to start collector');
    }
  };

  const handleStopCollector = () => {
    WearableDataCollectorService.stop();
    WearableAutomationEngineService.stop();
  };

  const handlePauseCollector = () => { WearableDataCollectorService.pause(); };
  const handleResumeCollector = async () => { await WearableDataCollectorService.resume(); };

  const handleAddTemplate = async (templateIndex: number) => {
    if (!selectedDeviceId) return;
    const templates = WearableAutomationEngineService.getTemplates();
    const template = templates[templateIndex];
    if (!template) return;
    await WearableAutomationEngineService.addRule({ ...template.rule, deviceId: selectedDeviceId });
    setRules(WearableAutomationEngineService.getRules());
  };

  const handleToggleRule = async (ruleId: string) => {
    await WearableAutomationEngineService.toggleRule(ruleId);
    setRules(WearableAutomationEngineService.getRules());
  };

  const handleDeleteRule = async (ruleId: string) => {
    Alert.alert(
      t({ en: 'Delete Rule', zh: '删除规则' }),
      t({ en: 'Are you sure?', zh: '确定删除？' }),
      [
        { text: t({ en: 'Cancel', zh: '取消' }), style: 'cancel' },
        {
          text: t({ en: 'Delete', zh: '删除' }), style: 'destructive',
          onPress: async () => {
            await WearableAutomationEngineService.deleteRule(ruleId);
            setRules(WearableAutomationEngineService.getRules());
          },
        },
      ],
    );
  };

  const handleAcknowledgeEvent = async (eventId: string) => {
    await WearableAutomationEngineService.acknowledgeEvent(eventId);
    setTriggerHistory(WearableAutomationEngineService.getHistory());
  };

  const unacknowledgedCount = useMemo(
    () => triggerHistory.filter((e) => !e.acknowledged).length,
    [triggerHistory],
  );

  const statusColor = useMemo(() => {
    switch (collectorState?.status) {
      case 'collecting': return colors.success;
      case 'connecting': case 'reconnecting': return colors.warning;
      case 'error': return colors.error;
      case 'paused': return '#8B8B8B';
      default: return colors.textMuted;
    }
  }, [collectorState?.status]);

  const statusLabel = useMemo(() => {
    switch (collectorState?.status) {
      case 'collecting': return t({ en: 'Monitoring', zh: '监控中' });
      case 'connecting': return t({ en: 'Connecting', zh: '连接中' });
      case 'reconnecting': return t({ en: 'Reconnecting', zh: '重连中' });
      case 'error': return t({ en: 'Error', zh: '错误' });
      case 'paused': return t({ en: 'Paused', zh: '已暂停' });
      default: return t({ en: 'Idle', zh: '空闲' });
    }
  }, [collectorState?.status, t]);

  const selectedDevice = pairedDevices.find((d) => d.id === selectedDeviceId);

  return (
    <SafeAreaView style={st.safe} edges={['top']}>
      {/* Header */}
      <View style={st.header}>
        <TouchableOpacity onPress={() => navigation?.goBack?.()} style={st.backBtn}>
          <Text style={st.backIcon}>‹</Text>
        </TouchableOpacity>
        <View style={st.headerCenter}>
          <Text style={st.headerTitle}>
            {selectedDevice?.name || t({ en: 'Wearable Monitor', zh: '穿戴监控' })}
          </Text>
          <View style={st.statusRow}>
            <View style={[st.statusDot, { backgroundColor: statusColor }]} />
            <Text style={[st.statusLabel, { color: statusColor }]}>{statusLabel}</Text>
          </View>
        </View>
        <View style={{ width: 36 }} />
      </View>

      {/* Device selector */}
      {pairedDevices.length > 1 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={st.deviceBar} contentContainerStyle={{ paddingHorizontal: 16 }}>
          {pairedDevices.map((device) => (
            <TouchableOpacity
              key={device.id}
              onPress={() => setSelectedDeviceId(device.id)}
              style={[st.deviceChip, selectedDeviceId === device.id && st.deviceChipOn]}
            >
              <Text style={[st.deviceChipText, selectedDeviceId === device.id && st.deviceChipTextOn]}>
                {device.name}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}

      {/* Controls */}
      <View style={st.controls}>
        {(!collectorState || collectorState.status === 'idle' || collectorState.status === 'error') && (
          <TouchableOpacity style={st.ctrlBtnStart} onPress={handleStartCollector}>
            <Text style={st.ctrlBtnText}>▶ {t({ en: 'Start', zh: '开始' })}</Text>
          </TouchableOpacity>
        )}
        {collectorState?.status === 'collecting' && (
          <>
            <TouchableOpacity style={st.ctrlBtnPause} onPress={handlePauseCollector}>
              <Text style={st.ctrlBtnText}>⏸ {t({ en: 'Pause', zh: '暂停' })}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={st.ctrlBtnStop} onPress={handleStopCollector}>
              <Text style={st.ctrlBtnText}>⏹ {t({ en: 'Stop', zh: '停止' })}</Text>
            </TouchableOpacity>
          </>
        )}
        {collectorState?.status === 'paused' && (
          <>
            <TouchableOpacity style={st.ctrlBtnStart} onPress={handleResumeCollector}>
              <Text style={st.ctrlBtnText}>▶ {t({ en: 'Resume', zh: '恢复' })}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={st.ctrlBtnStop} onPress={handleStopCollector}>
              <Text style={st.ctrlBtnText}>⏹ {t({ en: 'Stop', zh: '停止' })}</Text>
            </TouchableOpacity>
          </>
        )}
        <View style={st.statsRow}>
          <Text style={st.stat}>{t({ en: 'Collected', zh: '已采集' })}: {collectorState?.samplesCollected ?? 0}</Text>
          <Text style={st.stat}>{t({ en: 'Uploaded', zh: '已上传' })}: {collectorState?.samplesUploaded ?? 0}</Text>
          <Text style={st.stat}>{t({ en: 'Buffer', zh: '缓冲' })}: {WearableDataCollectorService.getBufferSize()}</Text>
        </View>
      </View>

      {/* Tabs */}
      <View style={st.tabBar}>
        {([
          { key: 'live' as const, label: t({ en: 'Live Data', zh: '实时数据' }) },
          { key: 'rules' as const, label: t({ en: 'Rules', zh: '规则' }) },
          { key: 'history' as const, label: `${t({ en: 'Alerts', zh: '告警' })}${unacknowledgedCount > 0 ? ` (${unacknowledgedCount})` : ''}` },
        ]).map((tab) => (
          <TouchableOpacity
            key={tab.key}
            onPress={() => setActiveTab(tab.key)}
            style={[st.tab, activeTab === tab.key && st.tabOn]}
          >
            <Text style={[st.tabText, activeTab === tab.key && st.tabTextOn]}>{tab.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Tab Content */}
      {activeTab === 'live' && <LiveDataTab collectorState={collectorState} recentSamples={recentSamples} t={t} />}
      {activeTab === 'rules' && <RulesTab rules={rules} onToggle={handleToggleRule} onDelete={handleDeleteRule} onAddTemplate={handleAddTemplate} t={t} />}
      {activeTab === 'history' && <HistoryTab events={triggerHistory} onAcknowledge={handleAcknowledgeEvent} t={t} />}
    </SafeAreaView>
  );
}

// ── Live Data Tab ────────────────────────────────────────────────────────────

function LiveDataTab({
  collectorState, recentSamples, t,
}: {
  collectorState: CollectorState | null;
  recentSamples: TelemetrySample[];
  t: ReturnType<typeof useI18n>['t'];
}) {
  const channels = collectorState?.channels ?? [];

  return (
    <ScrollView style={st.tabContent} contentContainerStyle={{ paddingBottom: 40 }}>
      {channels.length > 0 ? (
        <View style={st.channelGrid}>
          {channels.filter((ch) => ch.enabled).map((ch) => {
            const meta = CHANNEL_META[ch.channel] || CHANNEL_META.custom;
            return (
              <View key={ch.characteristicUuid} style={st.channelCard}>
                <View style={[st.channelIconBg, { backgroundColor: meta.color + '18' }]}>
                  <Text style={[st.channelIcon, { color: meta.color }]}>{meta.icon}</Text>
                </View>
                <Text style={st.channelLabel}>{meta.label}</Text>
                <Text style={st.channelValue}>
                  {ch.lastValue != null ? ch.lastValue.toFixed(1) : '--'}
                </Text>
                <Text style={st.channelUnit}>{meta.unit}</Text>
                {ch.lastUpdatedAt && (
                  <Text style={st.channelTime}>{new Date(ch.lastUpdatedAt).toLocaleTimeString()}</Text>
                )}
              </View>
            );
          })}
        </View>
      ) : (
        <View style={st.emptyState}>
          <Text style={st.emptyIcon}>📡</Text>
          <Text style={st.emptyText}>
            {t({ en: 'No channels configured. Start the collector to begin monitoring.', zh: '暂无配置通道。启动采集器开始监控。' })}
          </Text>
        </View>
      )}

      <Text style={st.sectionTitle}>
        {t({ en: 'Recent Samples', zh: '最近数据' })} ({recentSamples.length})
      </Text>
      {recentSamples.slice(0, 20).map((sample) => {
        const meta = CHANNEL_META[sample.channel] || CHANNEL_META.custom;
        return (
          <View key={sample.id} style={st.sampleRow}>
            <View style={[st.sampleDot, { backgroundColor: meta.color }]} />
            <Text style={st.sampleChannel}>{meta.label}</Text>
            <Text style={st.sampleValue}>{sample.value.toFixed(1)} {sample.unit}</Text>
            <Text style={st.sampleTime}>{new Date(sample.timestamp).toLocaleTimeString()}</Text>
          </View>
        );
      })}
    </ScrollView>
  );
}

// ── Rules Tab ────────────────────────────────────────────────────────────────

function RulesTab({
  rules, onToggle, onDelete, onAddTemplate, t,
}: {
  rules: AutomationRule[];
  onToggle: (id: string) => void;
  onDelete: (id: string) => void;
  onAddTemplate: (index: number) => void;
  t: ReturnType<typeof useI18n>['t'];
}) {
  const templates = WearableAutomationEngineService.getTemplates();

  return (
    <ScrollView style={st.tabContent} contentContainerStyle={{ paddingBottom: 40 }}>
      <Text style={st.sectionTitle}>
        {t({ en: 'Active Rules', zh: '已有规则' })} ({rules.length})
      </Text>

      {rules.length === 0 ? (
        <View style={st.emptyState}>
          <Text style={st.emptyIcon}>⚡</Text>
          <Text style={st.emptyText}>
            {t({ en: 'No automation rules yet. Add a template below.', zh: '暂无自动化规则。请从下方模板添加。' })}
          </Text>
        </View>
      ) : (
        rules.map((rule) => {
          const meta = CHANNEL_META[rule.channel] || CHANNEL_META.custom;
          return (
            <View key={rule.id} style={[st.ruleCard, !rule.enabled && st.ruleCardOff]}>
              <View style={st.ruleHeader}>
                <View style={[st.ruleIconBg, { backgroundColor: meta.color + '18' }]}>
                  <Text style={{ fontSize: 18 }}>{meta.icon}</Text>
                </View>
                <View style={st.ruleInfo}>
                  <Text style={st.ruleName}>{rule.name}</Text>
                  <Text style={st.ruleCondition}>
                    {meta.label} {rule.condition} {rule.threshold}{rule.thresholdHigh != null ? `–${rule.thresholdHigh}` : ''} {meta.unit}
                  </Text>
                </View>
                <TouchableOpacity onPress={() => onToggle(rule.id)} style={st.ruleToggle}>
                  <View style={[st.toggleTrack, rule.enabled && st.toggleTrackOn]}>
                    <View style={[st.toggleThumb, rule.enabled && st.toggleThumbOn]} />
                  </View>
                </TouchableOpacity>
              </View>
              <View style={st.ruleFooter}>
                <Text style={st.ruleStats}>{t({ en: 'Fired', zh: '触发' })}: {rule.triggerCount}x</Text>
                <TouchableOpacity onPress={() => onDelete(rule.id)}>
                  <Text style={st.ruleDelete}>✕</Text>
                </TouchableOpacity>
              </View>
            </View>
          );
        })
      )}

      <Text style={[st.sectionTitle, { marginTop: 24 }]}>
        {t({ en: 'Rule Templates', zh: '规则模板' })}
      </Text>
      {templates.map((tmpl, idx) => (
        <TouchableOpacity key={idx} style={st.templateCard} onPress={() => onAddTemplate(idx)}>
          <View style={st.templateInfo}>
            <Text style={st.templateName}>{tmpl.name}</Text>
            <Text style={st.templateDesc}>{tmpl.description}</Text>
          </View>
          <Text style={st.templateAdd}>＋</Text>
        </TouchableOpacity>
      ))}
    </ScrollView>
  );
}

// ── History Tab ──────────────────────────────────────────────────────────────

function HistoryTab({
  events, onAcknowledge, t,
}: {
  events: TriggerEvent[];
  onAcknowledge: (id: string) => void;
  t: ReturnType<typeof useI18n>['t'];
}) {
  return (
    <ScrollView style={st.tabContent} contentContainerStyle={{ paddingBottom: 40 }}>
      <Text style={st.sectionTitle}>
        {t({ en: 'Trigger History', zh: '触发历史' })} ({events.length})
      </Text>

      {events.length === 0 ? (
        <View style={st.emptyState}>
          <Text style={st.emptyIcon}>🔔</Text>
          <Text style={st.emptyText}>{t({ en: 'No trigger events yet.', zh: '暂无触发事件。' })}</Text>
        </View>
      ) : (
        events.map((ev) => {
          const meta = CHANNEL_META[ev.channel] || CHANNEL_META.custom;
          return (
            <View key={ev.id} style={[st.triggerCard, !ev.acknowledged && st.triggerCardNew]}>
              <View style={st.triggerHeader}>
                <View style={[st.ruleIconBg, { backgroundColor: meta.color + '18' }]}>
                  <Text style={{ fontSize: 18 }}>{meta.icon}</Text>
                </View>
                <View style={st.triggerInfo}>
                  <Text style={st.triggerName}>{ev.ruleName}</Text>
                  <Text style={st.triggerDetail}>
                    {meta.label}: {ev.value.toFixed(1)} {ev.condition} {ev.threshold}
                  </Text>
                  <Text style={st.triggerTime}>{new Date(ev.triggeredAt).toLocaleString()}</Text>
                </View>
                {!ev.acknowledged && (
                  <TouchableOpacity style={st.ackBtn} onPress={() => onAcknowledge(ev.id)}>
                    <Text style={st.ackBtnText}>✓</Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>
          );
        })
      )}
    </ScrollView>
  );
}

// ── Styles ───────────────────────────────────────────────────────────────────

const st = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bgPrimary },

  // Header
  header: {
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16,
    paddingVertical: 10, gap: 12,
  },
  backBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: colors.bgSecondary, alignItems: 'center', justifyContent: 'center',
  },
  backIcon: { fontSize: 22, color: colors.textPrimary, marginTop: -2 },
  headerCenter: { flex: 1 },
  headerTitle: { fontSize: 18, fontWeight: '700', color: colors.textPrimary },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  statusLabel: { fontSize: 12, fontWeight: '600', textTransform: 'capitalize' },

  // Device bar
  deviceBar: { maxHeight: 48, marginBottom: 4 },
  deviceChip: {
    paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20,
    backgroundColor: colors.bgSecondary, marginRight: 8,
    borderWidth: 1, borderColor: 'transparent',
  },
  deviceChipOn: { borderColor: colors.primary, backgroundColor: colors.primary + '18' },
  deviceChipText: { fontSize: 13, color: colors.textMuted, fontWeight: '500' },
  deviceChipTextOn: { color: colors.primary },

  // Controls
  controls: {
    paddingHorizontal: 16, paddingVertical: 10,
    borderBottomWidth: 1, borderBottomColor: colors.border,
    flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8,
  },
  ctrlBtnStart: { backgroundColor: colors.success, paddingHorizontal: 18, paddingVertical: 9, borderRadius: 10 },
  ctrlBtnPause: { backgroundColor: colors.warning, paddingHorizontal: 18, paddingVertical: 9, borderRadius: 10 },
  ctrlBtnStop: { backgroundColor: colors.error, paddingHorizontal: 18, paddingVertical: 9, borderRadius: 10 },
  ctrlBtnText: { color: '#FFF', fontSize: 13, fontWeight: '700' },
  statsRow: { flexDirection: 'row', gap: 16, marginTop: 4, width: '100%' },
  stat: { fontSize: 11, color: colors.textMuted },

  // Tabs
  tabBar: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: colors.border },
  tab: { flex: 1, paddingVertical: 12, alignItems: 'center' },
  tabOn: { borderBottomWidth: 2, borderBottomColor: colors.primary },
  tabText: { fontSize: 13, fontWeight: '600', color: colors.textMuted },
  tabTextOn: { color: colors.primary },

  tabContent: { flex: 1, paddingHorizontal: 16, paddingTop: 16 },

  sectionTitle: {
    fontSize: 13, fontWeight: '700', color: colors.textMuted,
    marginBottom: 12, textTransform: 'uppercase', letterSpacing: 0.5,
  },

  // Channel cards
  channelGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 24 },
  channelCard: {
    width: '47%', backgroundColor: colors.bgCard, borderRadius: 16,
    padding: 16, alignItems: 'center', gap: 4,
    borderWidth: 1, borderColor: colors.border,
  },
  channelIconBg: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  channelIcon: { fontSize: 20 },
  channelLabel: { fontSize: 13, color: colors.textSecondary, fontWeight: '600', marginTop: 4 },
  channelValue: { fontSize: 28, fontWeight: '700', color: colors.textPrimary },
  channelUnit: { fontSize: 12, color: colors.textSecondary, fontWeight: '500' },
  channelTime: { fontSize: 11, color: colors.textMuted, marginTop: 4 },

  // Empty
  emptyState: { alignItems: 'center', paddingVertical: 40 },
  emptyIcon: { fontSize: 32, marginBottom: 8 },
  emptyText: { fontSize: 13, color: colors.textMuted, textAlign: 'center', paddingHorizontal: 20 },

  // Samples
  sampleRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  sampleDot: { width: 8, height: 8, borderRadius: 4 },
  sampleChannel: { fontSize: 12, color: colors.textMuted, width: 80 },
  sampleValue: { fontSize: 13, fontWeight: '600', color: colors.textPrimary, flex: 1 },
  sampleTime: { fontSize: 11, color: colors.textMuted },

  // Rules
  ruleCard: {
    backgroundColor: colors.bgCard, borderRadius: 14, padding: 14, marginBottom: 10,
    borderWidth: 1, borderColor: colors.border,
  },
  ruleCardOff: { opacity: 0.5 },
  ruleHeader: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  ruleIconBg: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  ruleInfo: { flex: 1 },
  ruleName: { fontSize: 14, fontWeight: '600', color: colors.textPrimary },
  ruleCondition: { fontSize: 11, color: colors.textMuted, marginTop: 2 },
  ruleToggle: { padding: 4 },
  toggleTrack: {
    width: 40, height: 22, borderRadius: 11,
    backgroundColor: colors.border, justifyContent: 'center', paddingHorizontal: 2,
  },
  toggleTrackOn: { backgroundColor: colors.primary },
  toggleThumb: { width: 18, height: 18, borderRadius: 9, backgroundColor: '#FFF' },
  toggleThumbOn: { alignSelf: 'flex-end' },
  ruleFooter: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    marginTop: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: colors.border,
  },
  ruleStats: { fontSize: 11, color: colors.textMuted },
  ruleDelete: { fontSize: 16, color: colors.error, padding: 4 },

  // Templates
  templateCard: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: colors.bgCard, borderRadius: 14, padding: 14, marginBottom: 8,
    borderWidth: 1, borderColor: colors.border, borderStyle: 'dashed',
  },
  templateInfo: { flex: 1 },
  templateName: { fontSize: 13, fontWeight: '600', color: colors.textPrimary },
  templateDesc: { fontSize: 11, color: colors.textMuted, marginTop: 2 },
  templateAdd: { fontSize: 22, color: colors.primary, paddingLeft: 12 },

  // Triggers
  triggerCard: {
    backgroundColor: colors.bgCard, borderRadius: 14, padding: 14, marginBottom: 8,
    borderWidth: 1, borderColor: colors.border,
  },
  triggerCardNew: { borderColor: colors.warning, backgroundColor: colors.warning + '10' },
  triggerHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  triggerInfo: { flex: 1 },
  triggerName: { fontSize: 14, fontWeight: '600', color: colors.textPrimary },
  triggerDetail: { fontSize: 11, color: colors.textMuted, marginTop: 2 },
  triggerTime: { fontSize: 10, color: colors.textMuted, marginTop: 4 },
  ackBtn: {
    backgroundColor: colors.success, width: 30, height: 30,
    borderRadius: 15, alignItems: 'center', justifyContent: 'center',
  },
  ackBtnText: { color: '#FFF', fontSize: 14, fontWeight: '700' },
});
