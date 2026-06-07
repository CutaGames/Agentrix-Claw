/**
 * ConnectExistingScreen — 4-step wizard for existing OpenClaw users
 *
 * Step 1  DISCOVER  — LAN auto-scan / manual URL
 * Step 2  VERIFY    — Ping instance, show metadata (skills, memory, version)
 * Step 3  MIGRATE   — Pull skills, memory, config, chat sessions into Agentrix
 * Step 4  DONE      — Summary card, navigate to SocialBind
 */

import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Alert,
  Animated,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { colors } from '../../theme/colors';
import { useAuthStore } from '../../stores/authStore';
import { mapRawInstance } from '../../services/auth';
import { bindOpenClaw } from '../../services/openclaw.service';
import {
  probeInstanceUrl,
  migrateInstance,
  getDiscoveryConfig,
  lanScan,
  type ProbeResult,
  type MigrationResult,
  type LanCandidate,
} from '../../services/openclaw-bridge.service';

type WizardStep = 'discover' | 'verify' | 'migrate' | 'done';
type DiscoverTab = 'manual' | 'lan';

// ─────────────────────────────────────────────────────────────────────────────

export function ConnectExistingScreen() {
  const navigation = useNavigation<any>();
  const { addInstance, setActiveInstance, setOnboardingComplete } = useAuthStore.getState();

  // Wizard state
  const [step, setStep] = useState<WizardStep>('discover');
  const [discoverTab, setDiscoverTab] = useState<DiscoverTab>('manual');

  // Form fields
  const [instanceUrl, setInstanceUrl] = useState('');
  const [apiToken, setApiToken] = useState('');

  // Operation state
  const [loading, setLoading] = useState(false);
  const [probeResult, setProbeResult] = useState<ProbeResult | null>(null);
  const [boundInstanceId, setBoundInstanceId] = useState<string | null>(null);
  const [migrationResult, setMigrationResult] = useState<MigrationResult | null>(null);

  // LAN scan state
  const [lanCandidates, setLanCandidates] = useState<LanCandidate[]>([]);
  const [lanProgress, setLanProgress] = useState(0);
  const [lanScanning, setLanScanning] = useState(false);

  // Migrate progress animation
  const migrateProgress = useRef(new Animated.Value(0)).current;

  // ── Step 1a: Manual URL probe ──────────────────────────────────────────────

  const handleProbeManual = useCallback(async () => {
    const url = instanceUrl.trim();
    if (!url) {
      Alert.alert('需要输入地址', '请输入 OpenClaw 实例的 URL\n例如：http://192.168.1.42:3001');
      return;
    }
    setLoading(true);
    setProbeResult(null);
    try {
      // Try direct device-to-instance probe first (LAN)
      let result: ProbeResult;
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 3000);
        const res = await fetch(`${url.replace(/\/$/, '')}/api/health`, { signal: controller.signal });
        clearTimeout(timer);
        let data: Record<string, unknown> = {};
        try { data = await res.json(); } catch (_) { /* ignore */ }
        result = {
          reachable: res.ok || res.status === 401 || res.status === 403,
          instanceName: (data.name ?? data.agentName) as string | undefined,
          version: data.version as string | undefined,
          model: (data.model ?? data.currentModel) as string | undefined,
        };
      } catch (_) {
        // Fallback: proxy through backend (public/HTTPS instances)
        result = await probeInstanceUrl(url, apiToken.trim() || undefined);
      }

      setProbeResult(result);
      if (result.reachable) {
        setStep('verify');
      } else {
        Alert.alert(
          '无法连接',
          result.error ?? '连接失败。请确认 OpenClaw 正在运行，且手机与实例在同一网络。',
        );
      }
    } catch (err: any) {
      Alert.alert('错误', err?.message ?? '检测失败');
    } finally {
      setLoading(false);
    }
  }, [instanceUrl, apiToken]);

  // ── Step 1b: LAN auto-scan ─────────────────────────────────────────────────

  const startLanScan = useCallback(async () => {
    setLanScanning(true);
    setLanCandidates([]);
    setLanProgress(0);
    try {
      const config = await getDiscoveryConfig();
      const found = await lanScan(
        config,
        '192.168.1',
        (checked, total) => setLanProgress(Math.round((checked / total) * 100)),
      );
      setLanCandidates(found);
    } catch (err: any) {
      Alert.alert('扫描失败', err?.message ?? 'LAN 扫描错误');
    } finally {
      setLanScanning(false);
      setLanProgress(100);
    }
  }, []);

  const selectLanCandidate = useCallback((candidate: LanCandidate) => {
    setInstanceUrl(candidate.url);
    setProbeResult(candidate.probe);
    setStep('verify');
  }, []);

  // ── Step 2 → 3: Bind then migrate ─────────────────────────────────────────

  const handleBindAndMigrate = useCallback(async () => {
    const url = instanceUrl.trim();
    setLoading(true);
    try {
      // Derive a safe name from probe discovery; fallback to hostname so the
      // backend never receives a null on the NOT-NULL `name` column.
      const derivedName =
        probeResult?.instanceName ||
        `OpenClaw-${url.replace(/^https?:\/\//, '').split('/')[0].replace(/[^a-zA-Z0-9.-]/g, '-')}`;
      const result = await bindOpenClaw({
        instanceUrl: url,
        apiToken: apiToken.trim() || '',
        instanceName: derivedName,
        deployType: 'existing',
      });
      const instance = mapRawInstance(result, {
        name: result.name || probeResult?.instanceName || 'My OpenClaw',
        instanceUrl: url,
        deployType: 'existing',
      });
      addInstance(instance);
      setActiveInstance(instance.id);
      setBoundInstanceId(result.id);
      setStep('migrate');
      Animated.timing(migrateProgress, { toValue: 30, duration: 600, useNativeDriver: false }).start();
    } catch (err: any) {
      Alert.alert('绑定失败', err?.message ?? '请检查地址和 Token 是否正确');
    } finally {
      setLoading(false);
    }
  }, [instanceUrl, apiToken, probeResult, addInstance, setActiveInstance, migrateProgress]);

  const handleRunMigration = useCallback(async () => {
    if (!boundInstanceId) return;
    setLoading(true);
    Animated.timing(migrateProgress, { toValue: 60, duration: 800, useNativeDriver: false }).start();
    try {
      const result = await migrateInstance(boundInstanceId);
      setMigrationResult(result);
      Animated.timing(migrateProgress, { toValue: 100, duration: 400, useNativeDriver: false }).start();
      setStep('done');
    } catch (_) {
      Animated.timing(migrateProgress, { toValue: 100, duration: 300, useNativeDriver: false }).start();
      setStep('done');
    } finally {
      setLoading(false);
    }
  }, [boundInstanceId, migrateProgress]);

  useEffect(() => {
    if (step === 'migrate' && boundInstanceId) {
      handleRunMigration();
    }
  }, [step, boundInstanceId]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleFinish = useCallback(() => {
    setOnboardingComplete();
    try {
      navigation.navigate('AgentChat');
    } catch (_) {
      // In onboarding context: setOnboardingComplete() triggers RootNavigator to show Main
    }
  }, [navigation, setOnboardingComplete]);

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">

      <StepDots current={step} />

      {/* ═══ STEP 1: DISCOVER ═══ */}
      {step === 'discover' && (
        <View>
          <Text style={styles.title}>连接现有实例</Text>
          <Text style={styles.subtitle}>将您现有的 OpenClaw 实例接入 Agentrix，数据完整保留</Text>

          <View style={styles.tabBar}>
            {(['manual', 'lan'] as DiscoverTab[]).map((t) => (
              <TouchableOpacity
                key={t}
                style={[styles.tab, discoverTab === t && styles.tabActive]}
                onPress={() => setDiscoverTab(t)}
              >
                <Text style={[styles.tabText, discoverTab === t && styles.tabTextActive]}>
                  {t === 'manual' ? '⌨️ 手动输入' : '📡 局域网扫描'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {discoverTab === 'manual' && (
            <View>
              <Text style={styles.label}>实例地址</Text>
              <TextInput
                style={styles.input}
                placeholder="http://192.168.1.42:3001"
                placeholderTextColor={colors.textMuted}
                value={instanceUrl}
                onChangeText={setInstanceUrl}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="url"
              />
              <Text style={styles.label}>API Token（可选）</Text>
              <TextInput
                style={styles.input}
                placeholder="留空若未设置密码"
                placeholderTextColor={colors.textMuted}
                value={apiToken}
                onChangeText={setApiToken}
                autoCapitalize="none"
                autoCorrect={false}
                secureTextEntry
              />
              <TouchableOpacity
                style={[styles.primaryBtn, loading && styles.primaryBtnDisabled]}
                onPress={handleProbeManual}
                disabled={loading}
              >
                {loading
                  ? <ActivityIndicator color="#fff" />
                  : <Text style={styles.primaryBtnText}>检测连接</Text>}
              </TouchableOpacity>
            </View>
          )}

          {discoverTab === 'lan' && (
            <View>
              <Text style={styles.sectionHint}>自动扫描本地网络，发现正在运行的 OpenClaw 实例</Text>

              {!lanScanning && lanProgress === 0 && (
                <TouchableOpacity style={styles.primaryBtn} onPress={startLanScan}>
                  <Text style={styles.primaryBtnText}>📡 开始扫描</Text>
                </TouchableOpacity>
              )}

              {lanScanning && (
                <View>
                  <View style={styles.progressBarBg}>
                    <View style={[styles.progressBarFill, { width: `${lanProgress}%` }]} />
                  </View>
                  <Text style={styles.progressLabel}>扫描中… {lanProgress}%</Text>
                  <ActivityIndicator color={colors.primary} style={{ marginTop: 8 }} />
                </View>
              )}

              {!lanScanning && lanProgress === 100 && lanCandidates.length === 0 && (
                <View style={styles.emptyState}>
                  <Text style={styles.emptyStateIcon}>🔍</Text>
                  <Text style={styles.emptyStateText}>未发现实例</Text>
                  <Text style={styles.emptyStateHint}>请确认 OpenClaw 已启动，或切换到手动输入</Text>
                  <TouchableOpacity style={[styles.primaryBtn, { marginTop: 12 }]} onPress={startLanScan}>
                    <Text style={styles.primaryBtnText}>重新扫描</Text>
                  </TouchableOpacity>
                </View>
              )}

              {!lanScanning && lanCandidates.length > 0 && (
                <View>
                  <Text style={styles.sectionHint}>发现 {lanCandidates.length} 个实例：</Text>
                  {lanCandidates.map((c) => (
                    <TouchableOpacity key={c.url} style={styles.candidateCard} onPress={() => selectLanCandidate(c)}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.candidateName}>{c.probe.instanceName ?? 'OpenClaw Instance'}</Text>
                        <Text style={styles.candidateUrl}>{c.url}</Text>
                        {c.probe.version && <Text style={styles.candidateMeta}>v{c.probe.version}</Text>}
                      </View>
                      <Text style={styles.arrowIcon}>›</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}
            </View>
          )}
        </View>
      )}

      {/* ═══ STEP 2: VERIFY ═══ */}
      {step === 'verify' && probeResult && (
        <View>
          <Text style={styles.title}>确认实例信息</Text>
          <Text style={styles.subtitle}>请确认以下信息无误后，继续绑定并迁移数据</Text>

          <View style={styles.infoCard}>
            <InfoRow icon="🤖" label="名称" value={probeResult.instanceName ?? '未知'} />
            <InfoRow icon="🔧" label="版本" value={probeResult.version ?? '未知'} />
            <InfoRow icon="🧠" label="模型" value={probeResult.model ?? '未知'} />
            {probeResult.skillCount !== undefined && (
              <InfoRow icon="⚡" label="已安装技能" value={`${probeResult.skillCount} 个`} />
            )}
            {probeResult.memoryEntries !== undefined && (
              <InfoRow icon="💾" label="记忆条目" value={`${probeResult.memoryEntries} 条`} />
            )}
            {probeResult.latencyMs !== undefined && (
              <InfoRow icon="⏱" label="延迟" value={`${probeResult.latencyMs} ms`} />
            )}
            <InfoRow icon="🌐" label="地址" value={instanceUrl} small />
          </View>

          <View style={styles.migrationNotice}>
            <Text style={styles.migrationNoticeTitle}>🔄 即将迁移的数据</Text>
            <Text style={styles.migrationNoticeBody}>
              {'• 已安装的技能列表\n• AI 记忆和上下文\n• 代理配置（名称、个性、提示词）\n• 对话历史摘要'}
            </Text>
          </View>

          <TouchableOpacity
            style={[styles.primaryBtn, loading && styles.primaryBtnDisabled]}
            onPress={handleBindAndMigrate}
            disabled={loading}
          >
            {loading
              ? <ActivityIndicator color="#fff" />
              : <Text style={styles.primaryBtnText}>绑定并迁移数据 →</Text>}
          </TouchableOpacity>

          <TouchableOpacity style={styles.secondaryBtn} onPress={() => setStep('discover')}>
            <Text style={styles.secondaryBtnText}>← 返回修改</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* ═══ STEP 3: MIGRATE ═══ */}
      {step === 'migrate' && (
        <View>
          <Text style={styles.title}>正在迁移数据…</Text>
          <Text style={styles.subtitle}>Agentrix 正在读取并同步您的 OpenClaw 数据，请稍候</Text>

          <View style={styles.progressBarBg}>
            <Animated.View
              style={[
                styles.progressBarFill,
                { width: migrateProgress.interpolate({ inputRange: [0, 100], outputRange: ['0%', '100%'] }) },
              ]}
            />
          </View>

          <View style={styles.migrationStepList}>
            {[
              { icon: '🔧', label: '代理配置' },
              { icon: '⚡', label: '技能列表' },
              { icon: '💾', label: '记忆与上下文' },
              { icon: '💬', label: '对话历史' },
            ].map((item) => (
              <View key={item.label} style={styles.migrationStepItem}>
                <Text style={styles.migrationStepIcon}>{item.icon}</Text>
                <Text style={styles.migrationStepLabel}>{item.label}</Text>
                <ActivityIndicator size="small" color={colors.primary} />
              </View>
            ))}
          </View>
        </View>
      )}

      {/* ═══ STEP 4: DONE ═══ */}
      {step === 'done' && (
        <View>
          <View style={styles.successBadge}>
            <Text style={styles.successIcon}>✅</Text>
          </View>
          <Text style={styles.title}>迁移完成！</Text>
          <Text style={styles.subtitle}>您的 OpenClaw 实例已成功接入 Agentrix，数据完整保留</Text>

          {migrationResult && (
            <View style={styles.summaryGrid}>
              {[
                { icon: '⚡', label: '已同步技能', value: String(migrationResult.skills.length) },
                { icon: '💾', label: '记忆条目', value: String(migrationResult.memoryEntries.length) },
                { icon: '💬', label: '对话历史', value: String(migrationResult.sessionSummaries.length) },
                { icon: '🔧', label: '配置同步', value: migrationResult.config ? '完成' : '跳过' },
              ].map((t) => (
                <View key={t.label} style={styles.summaryTile}>
                  <Text style={styles.summaryTileIcon}>{t.icon}</Text>
                  <Text style={styles.summaryTileValue}>{t.value}</Text>
                  <Text style={styles.summaryTileLabel}>{t.label}</Text>
                </View>
              ))}
            </View>
          )}

          {!migrationResult && (
            <View style={styles.migrationNotice}>
              <Text style={styles.migrationNoticeBody}>
                实例已绑定成功。您可在设置中手动触发数据迁移。
              </Text>
            </View>
          )}

          <TouchableOpacity style={styles.primaryBtn} onPress={handleFinish}>
            <Text style={styles.primaryBtnText}>开始使用 →</Text>
          </TouchableOpacity>
        </View>
      )}
    </ScrollView>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────────────────────

const STEPS: WizardStep[] = ['discover', 'verify', 'migrate', 'done'];
const STEP_LABELS: Record<WizardStep, string> = { discover: '发现', verify: '验证', migrate: '迁移', done: '完成' };

function StepDots({ current }: { current: WizardStep }) {
  const idx = STEPS.indexOf(current);
  return (
    <View style={styles.stepRow}>
      {STEPS.map((s, i) => (
        <React.Fragment key={s}>
          <View style={[styles.dot, i <= idx && styles.dotActive]}>
            <Text style={[styles.dotLabel, i <= idx && styles.dotLabelActive]}>{STEP_LABELS[s]}</Text>
          </View>
          {i < STEPS.length - 1 && <View style={[styles.stepLine, i < idx && styles.stepLineActive]} />}
        </React.Fragment>
      ))}
    </View>
  );
}

function InfoRow({ icon, label, value, small }: { icon: string; label: string; value: string; small?: boolean }) {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoRowIcon}>{icon}</Text>
      <Text style={styles.infoRowLabel}>{label}</Text>
      <Text style={[styles.infoRowValue, small && { fontSize: 12 }]} numberOfLines={1} ellipsizeMode="middle">
        {value}
      </Text>
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: 24, paddingBottom: 60 },

  stepRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginBottom: 28 },
  dot: {
    alignItems: 'center', justifyContent: 'center',
    width: 54, height: 26, borderRadius: 13,
    backgroundColor: colors.bgCard, borderWidth: 1, borderColor: colors.border,
  },
  dotActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  dotLabel: { fontSize: 11, color: colors.textMuted },
  dotLabelActive: { color: '#fff', fontWeight: '600' },
  stepLine: { flex: 1, height: 1, backgroundColor: colors.border, marginHorizontal: 2 },
  stepLineActive: { backgroundColor: colors.primary },

  title: { fontSize: 22, fontWeight: '700', color: colors.text, marginBottom: 6 },
  subtitle: { fontSize: 14, color: colors.textMuted, marginBottom: 20, lineHeight: 20 },
  label: { fontSize: 13, color: colors.textSecondary, marginBottom: 6, marginTop: 12 },
  sectionHint: { fontSize: 13, color: colors.textMuted, marginBottom: 12, lineHeight: 18 },

  tabBar: {
    flexDirection: 'row', borderRadius: 10, overflow: 'hidden',
    borderWidth: 1, borderColor: colors.border,
  },
  tab: { flex: 1, paddingVertical: 10, alignItems: 'center', backgroundColor: colors.bgCard },
  tabActive: { backgroundColor: colors.primary },
  tabText: { fontSize: 13, color: colors.textMuted },
  tabTextActive: { color: '#fff', fontWeight: '600' },

  input: {
    backgroundColor: colors.bgCard,
    borderWidth: 1, borderColor: colors.border,
    borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12,
    fontSize: 14, color: colors.text, marginBottom: 4,
  },

  primaryBtn: {
    backgroundColor: colors.primary, borderRadius: 12,
    paddingVertical: 15, alignItems: 'center', marginTop: 16,
  },
  primaryBtnDisabled: { opacity: 0.6 },
  primaryBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  secondaryBtn: { paddingVertical: 12, alignItems: 'center', marginTop: 8 },
  secondaryBtnText: { color: colors.textMuted, fontSize: 14 },

  progressBarBg: {
    height: 8, backgroundColor: colors.bgCard, borderRadius: 4,
    overflow: 'hidden', marginVertical: 16,
  },
  progressBarFill: { height: '100%', backgroundColor: colors.primary, borderRadius: 4 },
  progressLabel: { fontSize: 13, color: colors.textMuted, textAlign: 'center' },

  candidateCard: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: colors.bgCard,
    borderWidth: 1, borderColor: colors.border,
    borderRadius: 12, padding: 14, marginBottom: 10,
  },
  candidateName: { fontSize: 15, fontWeight: '600', color: colors.text },
  candidateUrl: { fontSize: 11, color: colors.textMuted, marginTop: 2 },
  candidateMeta: { fontSize: 11, color: colors.textSecondary, marginTop: 2 },
  arrowIcon: { fontSize: 22, color: colors.textMuted },

  emptyState: { alignItems: 'center', paddingVertical: 24 },
  emptyStateIcon: { fontSize: 40, marginBottom: 8 },
  emptyStateText: { fontSize: 16, fontWeight: '600', color: colors.text },
  emptyStateHint: { fontSize: 13, color: colors.textMuted, textAlign: 'center', marginTop: 6, lineHeight: 18 },

  infoCard: {
    backgroundColor: colors.bgCard, borderRadius: 14, padding: 16,
    borderWidth: 1, borderColor: colors.border,
  },
  infoRow: {
    flexDirection: 'row', alignItems: 'center', paddingVertical: 7,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  infoRowIcon: { fontSize: 16, width: 28 },
  infoRowLabel: { fontSize: 13, color: colors.textSecondary, flex: 1 },
  infoRowValue: { fontSize: 13, color: colors.text, fontWeight: '500', maxWidth: '55%' },

  migrationNotice: {
    backgroundColor: `${colors.primary}15`,
    borderRadius: 12, padding: 14, marginBottom: 16,
    borderWidth: 1, borderColor: `${colors.primary}30`,
  },
  migrationNoticeTitle: { fontSize: 13, fontWeight: '700', color: colors.primary, marginBottom: 6 },
  migrationNoticeBody: { fontSize: 13, color: colors.textSecondary, lineHeight: 20 },

  migrationStepList: { marginTop: 16 },
  migrationStepItem: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: colors.bgCard, borderRadius: 10, padding: 12, marginBottom: 8,
    borderWidth: 1, borderColor: colors.border,
  },
  migrationStepIcon: { fontSize: 16, marginRight: 10 },
  migrationStepLabel: { flex: 1, fontSize: 14, color: colors.text },

  successBadge: { alignItems: 'center', marginBottom: 12 },
  successIcon: { fontSize: 56 },
  summaryGrid: { flexDirection: 'row', flexWrap: 'wrap', marginBottom: 16, marginHorizontal: -6 },
  summaryTile: {
    width: '46%', margin: '2%',
    backgroundColor: colors.bgCard, borderRadius: 12, padding: 16, alignItems: 'center',
    borderWidth: 1, borderColor: colors.border,
  },
  summaryTileIcon: { fontSize: 24, marginBottom: 6 },
  summaryTileValue: { fontSize: 22, fontWeight: '700', color: colors.text },
  summaryTileLabel: { fontSize: 12, color: colors.textMuted, marginTop: 2, textAlign: 'center' },
});
