/**
 * CompanionSettingsScreen — P-9 wave 11 T20.
 *
 * Phase 1 ships the 4 sections that are wired to real services:
 *   - Trust3 + signing settings (timeout, biometric)
 *   - 系统助手桥 (per-kind reverse-call policy + self wake word)
 *   - 自主交易 (Agentic Commerce limits + emergency freeze)
 *   - Form Variant 手动锁定 (30min / 2h / 4h presets)
 *
 * The remaining 5 sections (Quiet Hours, Voice Greet quotas, Push channels,
 * Ambient Presence, Local Model routing) wire in wave 12 when their
 * stores have UI to flip — Phase 1 already runs with sensible defaults.
 *
 * Spec: requirements.md R10.1-R10.8.
 */
import React, { useMemo, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Switch, Text, TouchableOpacity, View } from 'react-native';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system';
import { colors } from '../../theme/colors';
import {
  getReverseCallPolicy,
  setReverseCallPolicy,
  type ReverseCallKind,
} from '../../services/systemAssistantBridge';
import {
  getLimits as getAgenticLimits,
  setLimits as setAgenticLimits,
  emergencyFreeze,
  clearEmergencyFreeze,
  isFrozen,
  DEFAULT_LIMITS,
  type AgenticCategory,
} from '../../services/agenticCommerce.service';
import {
  setManualLock,
  clearManualLock,
  getPersistedFormVariant,
  evaluateAndApply,
  type FormVariant,
} from '../../services/formVariant.service';
import { useSettingsStore } from '../../stores/settingsStore';
import { getTodaySteps } from '../../services/companionHealth.service';
import {
  getVoiceDiagnostics,
  clearVoiceDiagnostics,
} from '../../services/voiceDiagnostics';
import {
  getPushChannels,
  setPushChannels,
  getQuietHours,
  setQuietHours,
  getVoiceGreetPrefs,
  setVoiceGreetPrefs,
  type PushChannels,
} from '../../stores/petCompanionSettings';
import { themedStyles } from '../../theme/useTheme';

const REVERSE_KINDS: Array<{ key: ReverseCallKind; label: string; hint: string }> = [
  { key: 'callPhone', label: '打电话', hint: '高摩擦,默认关闭' },
  { key: 'openMaps', label: '打开地图', hint: '默认开启' },
  { key: 'smartHome', label: '智能家居', hint: '默认关闭' },
  { key: 'timer', label: '设置倒计时', hint: '默认开启' },
  { key: 'calendar', label: '添加日程', hint: '默认关闭' },
];

const COMMERCE_CATEGORIES: Array<{ key: AgenticCategory; label: string }> = [
  { key: 'world-engine-quota', label: 'World Engine 配额' },
  { key: 'task-market-accept', label: '任务市场接单' },
  { key: 'free-skill-install', label: '免费技能安装' },
  { key: 'subscribed-skill-renew', label: '已订阅技能续费' },
  { key: 'world-asset-purchase', label: 'World 资产购买' },
];

export function CompanionSettingsScreen() {
  // Reverse-call policy
  const [policy, setPolicy] = useState(() => getReverseCallPolicy());
  const togglePolicy = (kind: ReverseCallKind) => {
    setPolicy((cur) => {
      const next = setReverseCallPolicy({ [kind]: !cur[kind] });
      return next;
    });
  };

  // Self wake word toggle (R9.13)
  const wakeWordEnabled = useSettingsStore((s) => s.wakeWordConfig.enabled);
  const setWakeWord = useSettingsStore((s) => s.setWakeWordConfig);

  // Agentic Commerce
  const [limits, setLimitsState] = useState(() => getAgenticLimits());
  const [frozenNow, setFrozenNow] = useState(() => isFrozen());
  const updateLimits = (patch: Parameters<typeof setAgenticLimits>[0]) => {
    setLimitsState(setAgenticLimits(patch));
    setFrozenNow(isFrozen());
  };
  const onFreeze = () => {
    emergencyFreeze(24);
    setFrozenNow(true);
    setLimitsState(getAgenticLimits());
  };
  const onUnfreeze = () => {
    clearEmergencyFreeze();
    setFrozenNow(false);
    setLimitsState(getAgenticLimits());
  };

  // Form Variant manual lock
  const [variantState, setVariantState] = useState(() => getPersistedFormVariant());
  const lockVariant = (variant: FormVariant, hours: number) => {
    setManualLock(variant, hours);
    setVariantState(getPersistedFormVariant());
    void evaluateAndApply();
  };
  const unlockVariant = () => {
    clearManualLock();
    setVariantState(getPersistedFormVariant());
    void evaluateAndApply();
  };

  // ── Wave 15 — Push channels (T21.4) ────────────────────────────
  const [pushChannels, setPushChannelsState] = useState(() => getPushChannels());
  const togglePushChannel = (kind: keyof PushChannels) => {
    setPushChannelsState((cur) => setPushChannels({ [kind]: !cur[kind] }));
  };

  // ── Wave 15 — Quiet Hours ──────────────────────────────────────
  const [quietHours, setQuietHoursState] = useState(() => getQuietHours());
  const updateQuietStart = (h: number) => setQuietHoursState(setQuietHours({ startHour: Math.max(0, Math.min(23, h)) }));
  const updateQuietEnd = (h: number) => setQuietHoursState(setQuietHours({ endHour: Math.max(0, Math.min(23, h)) }));

  // ── Wave 15 — Voice_Greet quotas (T20 voiceGreet section) ──────
  const [voiceGreetPrefs, setVoiceGreetPrefsState] = useState(() => getVoiceGreetPrefs());
  const toggleScenario = (key: keyof typeof voiceGreetPrefs.scenarios) => {
    setVoiceGreetPrefsState((cur) => setVoiceGreetPrefs({
      scenarios: { ...cur.scenarios, [key]: !cur.scenarios[key] },
    }));
  };
  const updateDailyMax = (n: number) => setVoiceGreetPrefsState(setVoiceGreetPrefs({ dailyMax: Math.max(0, Math.min(20, n)) }));

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content}>
      <Text style={styles.intro}>陪伴行为的总开关。修改即时生效。</Text>

      {/* ── 今日陪伴小结 (T20.3) ─────────────────────────────────── */}
      <TodaySummaryCard />

      {/* ── 形态变体 ─────────────────────────────────────────────── */}
      <Section title="🔄 形态变体">
        <Text style={styles.sectionHint}>
          手动锁定让 Aira 暂时进入指定形态(夜间静默 / 工作专注 / 同行)。
          {variantState.manualLockedUntilMs
            ? `\n当前: ${variantState.manualVariant ?? '默认'},至 ${new Date(variantState.manualLockedUntilMs).toLocaleString()}`
            : '\n当前: 无锁定(自动检测)'}
        </Text>
        <View style={styles.row}>
          <PresetBtn label="安静 30 分钟" onPress={() => lockVariant('night', 0.5)} />
          <PresetBtn label="工作 2 小时" onPress={() => lockVariant('work', 2)} />
          <PresetBtn label="同行 1 小时" onPress={() => lockVariant('journey', 1)} />
        </View>
        <View style={styles.row}>
          <PresetBtn label="清除锁定" onPress={unlockVariant} variant="ghost" />
        </View>
      </Section>

      {/* ── 勿扰时段 (Wave 15) ──────────────────────────────────── */}
      <Section title="🌙 勿扰时段">
        <Text style={styles.sectionHint}>
          这段时间内除手动唤起外,自动陪伴一律静音。当前: {quietHours.startHour}:00 — {quietHours.endHour}:00
        </Text>
        <View style={styles.row}>
          <PresetBtn label={`开始 -1h (${(quietHours.startHour + 23) % 24}:00)`} onPress={() => updateQuietStart(quietHours.startHour - 1)} variant="ghost" />
          <PresetBtn label={`开始 +1h (${(quietHours.startHour + 1) % 24}:00)`} onPress={() => updateQuietStart(quietHours.startHour + 1)} variant="ghost" />
        </View>
        <View style={styles.row}>
          <PresetBtn label={`结束 -1h (${(quietHours.endHour + 23) % 24}:00)`} onPress={() => updateQuietEnd(quietHours.endHour - 1)} variant="ghost" />
          <PresetBtn label={`结束 +1h (${(quietHours.endHour + 1) % 24}:00)`} onPress={() => updateQuietEnd(quietHours.endHour + 1)} variant="ghost" />
        </View>
      </Section>

      {/* ── 主动问候 (Wave 15 voice greet prefs) ──────────────────── */}
      <Section title="🎙 主动问候">
        <Text style={styles.sectionHint}>
          每天最多 {voiceGreetPrefs.dailyMax} 次自动问候,manual 触发不计入。
        </Text>
        <View style={styles.row}>
          <PresetBtn label={`每天 ${Math.max(0, voiceGreetPrefs.dailyMax - 1)}`} onPress={() => updateDailyMax(voiceGreetPrefs.dailyMax - 1)} variant="ghost" />
          <PresetBtn label={`每天 ${voiceGreetPrefs.dailyMax + 1}`} onPress={() => updateDailyMax(voiceGreetPrefs.dailyMax + 1)} variant="ghost" />
        </View>
        <View style={styles.row}>
          {(['morning', 'evening', 'comeback', 'milestone'] as const).map((k) => (
            <View key={k} style={styles.toggleRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.toggleLabel}>
                  {k === 'morning' ? '早安' : k === 'evening' ? '晚安' : k === 'comeback' ? '想你了' : '里程碑'}
                </Text>
              </View>
              <Switch
                value={voiceGreetPrefs.scenarios[k]}
                onValueChange={() => toggleScenario(k)}
                thumbColor={voiceGreetPrefs.scenarios[k] ? colors.accent : colors.textMuted}
                trackColor={{ false: colors.border, true: colors.accent + '88' }}
              />
            </View>
          ))}
        </View>
      </Section>

      {/* ── 推送频道 (T21.4) ──────────────────────────────────── */}
      <Section title="🔔 推送频道">
        <Text style={styles.sectionHint}>
          独立控制每类推送。关闭后该类事件依然在 App 内显示,只是不再发系统通知。
        </Text>
        {(
          [
            ['moodDiary', '今日小记 (19-21 推送)'],
            ['walletDelta', '钱包变动'],
            ['approval', '待审批提醒'],
            ['agenticCommerce', '宠物自主交易'],
            ['stepsReminder', '步数里程碑'],
            ['sittingReminder', '久坐提醒'],
          ] as Array<[keyof PushChannels, string]>
        ).map(([k, label]) => (
          <View key={k} style={styles.toggleRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.toggleLabel}>{label}</Text>
            </View>
            <Switch
              value={pushChannels[k]}
              onValueChange={() => togglePushChannel(k)}
              thumbColor={pushChannels[k] ? colors.accent : colors.textMuted}
              trackColor={{ false: colors.border, true: colors.accent + '88' }}
            />
          </View>
        ))}
      </Section>

      {/* ── Trust 3 / 系统助手桥 ────────────────────────────────── */}
      <Section title="🔐 Trust 3 与系统助手桥">
        <Text style={styles.sectionHint}>
          每次让 Aira "做点什么"前,你都能看到并确认。下面是 5 类反向调用的总开关。
        </Text>
        {REVERSE_KINDS.map((rk) => (
          <View key={rk.key} style={styles.toggleRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.toggleLabel}>{rk.label}</Text>
              <Text style={styles.toggleHint}>{rk.hint}</Text>
            </View>
            <Switch
              value={policy[rk.key]}
              onValueChange={() => togglePolicy(rk.key)}
              thumbColor={policy[rk.key] ? colors.accent : colors.textMuted}
              trackColor={{ false: colors.border, true: colors.accent + '88' }}
            />
          </View>
        ))}
        <View style={styles.toggleRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.toggleLabel}>启用 "Hey Aira" 唤醒词</Text>
            <Text style={styles.toggleHint}>关闭后只用长按浮球或系统助手</Text>
          </View>
          <Switch
            value={wakeWordEnabled}
            onValueChange={(v) => setWakeWord({ enabled: v })}
            thumbColor={wakeWordEnabled ? colors.accent : colors.textMuted}
            trackColor={{ false: colors.border, true: colors.accent + '88' }}
          />
        </View>
      </Section>

      {/* ── Agentic Commerce ─────────────────────────────────────── */}
      <Section title="💳 自主交易额度">
        <Text style={styles.sectionHint}>
          Aira 在限额内可自主消费 (World Engine 续费 / 接任务 / 免费技能等)。超出额度仍需你签名。
        </Text>
        <View style={styles.toggleRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.toggleLabel}>启用自主交易</Text>
            <Text style={styles.toggleHint}>关闭则全部需要签名</Text>
          </View>
          <Switch
            value={limits.enabled}
            onValueChange={(v) => updateLimits({ enabled: v })}
            thumbColor={limits.enabled ? colors.accent : colors.textMuted}
            trackColor={{ false: colors.border, true: colors.accent + '88' }}
          />
        </View>
        <View style={styles.row}>
          <LimitBox label="单笔上限" value={`$${limits.perTransactionMax}`} />
          <LimitBox label="日累计上限" value={`$${limits.dailyMax}`} />
          <LimitBox label="最低留存" value={`$${limits.minSafeBalance}`} />
        </View>
        <View style={styles.row}>
          <PresetBtn label="单笔 $30 / 日 $100" onPress={() => updateLimits({ perTransactionMax: 30, dailyMax: 100 })} variant="ghost" />
          <PresetBtn label="单笔 $100 / 日 $300" onPress={() => updateLimits({ perTransactionMax: 100, dailyMax: 300 })} variant="ghost" />
        </View>
        <Text style={styles.sectionHint}>白名单类别:</Text>
        <View style={styles.row}>
          {COMMERCE_CATEGORIES.map((cat) => {
            const enabled = limits.whitelistCategories.includes(cat.key);
            return (
              <TouchableOpacity
                key={cat.key}
                style={[styles.tagBtn, enabled ? styles.tagBtnOn : null]}
                onPress={() => {
                  const set = new Set(limits.whitelistCategories);
                  if (enabled) set.delete(cat.key);
                  else set.add(cat.key);
                  updateLimits({ whitelistCategories: Array.from(set) });
                }}
              >
                <Text style={[styles.tagText, enabled ? styles.tagTextOn : null]}>{cat.label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
        {frozenNow ? (
          <PresetBtn label="🚨 紧急冻结生效中 - 解除" onPress={onUnfreeze} variant="danger" />
        ) : (
          <PresetBtn label="🚨 紧急冻结 24 小时" onPress={onFreeze} variant="danger" />
        )}
      </Section>

      {/* ── 重置 + 导出 (T20.4) ─────────────────────────────────── */}
      <Section title="🛠 维护">
        <View style={styles.row}>
          <PresetBtn
            label="重置为默认"
            onPress={() =>
              Alert.alert(
                '重置陪伴设置',
                '会清除所有自定义偏好(签名时长 / 自主交易额度 / 反向调用开关 / 形态锁),不会清除亲密度 / MPC 私钥 / 已配对设备。',
                [
                  { text: '取消', style: 'cancel' },
                  {
                    text: '确认重置',
                    style: 'destructive',
                    onPress: () => {
                      setAgenticLimits({ ...DEFAULT_LIMITS });
                      setReverseCallPolicy({
                        callPhone: false,
                        openMaps: true,
                        smartHome: false,
                        timer: true,
                        calendar: false,
                      });
                      clearManualLock();
                      void evaluateAndApply();
                      // Refresh local state
                      setLimitsState(getAgenticLimits());
                      setPolicy(getReverseCallPolicy());
                      setVariantState(getPersistedFormVariant());
                      setFrozenNow(isFrozen());
                    },
                  },
                ],
              )
            }
            variant="ghost"
          />
          <PresetBtn
            label="导出陪伴日志"
            onPress={async () => {
              try {
                const entries = getVoiceDiagnostics();
                const json = JSON.stringify(entries, null, 2);
                // expo-file-system v19 type defs lost cacheDirectory; the
                // runtime export is still a top-level string. Cast to any
                // to bypass the same TS error worldEngineCache.ts has.
                const cacheDir = (FileSystem as any).cacheDirectory ?? '';
                const path = `${cacheDir}companion-diagnostics-${Date.now()}.json`;
                await FileSystem.writeAsStringAsync(path, json);
                if (await Sharing.isAvailableAsync()) {
                  await Sharing.shareAsync(path, {
                    mimeType: 'application/json',
                    dialogTitle: 'Companion Diagnostics',
                  });
                } else {
                  Alert.alert('已导出', `已写入: ${path}`);
                }
              } catch (err) {
                Alert.alert('导出失败', (err as Error).message);
              }
            }}
            variant="ghost"
          />
          <PresetBtn
            label="清空诊断日志"
            onPress={() => {
              Alert.alert('清空陪伴诊断日志?', '会删除最近 150 条事件,不影响其他数据。', [
                { text: '取消', style: 'cancel' },
                { text: '清空', style: 'destructive', onPress: () => clearVoiceDiagnostics() },
              ]);
            }}
            variant="ghost"
          />
        </View>
      </Section>
    </ScrollView>
  );
}

interface SummaryStat {
  label: string;
  value: string;
}

function TodaySummaryCard() {
  // Compute summary from voiceDiagnostics today + persisted state.
  const stats = useMemo<SummaryStat[]>(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const cutoff = today.getTime();
    const entries = getVoiceDiagnostics().filter((e) => Date.parse(e.timestamp) >= cutoff);

    const byScope = (scope: string, eventStarts?: string) => {
      return entries.filter(
        (e) => e.scope === scope && (!eventStarts || e.event.startsWith(eventStarts)),
      ).length;
    };

    const modeChanges = entries.filter(
      (e) => e.scope === 'companion-events' && e.event === 'mode-changed',
    ).length;
    const greets = byScope('voice-greet-scheduler', 'fired');
    const trust3 = entries.filter(
      (e) => e.scope === 'companion-events' && e.event === 'trust3-signing-completed',
    ).length;
    const remoteSent = entries.filter(
      (e) => e.scope === 'companion-events' && e.event === 'remote-control-sent',
    ).length;
    const agentic = entries.filter(
      (e) => e.scope === 'agentic-commerce' && e.event === 'auto-execute',
    ).length;
    const steps = getTodaySteps();

    return [
      { label: '心情切换', value: `${modeChanges}` },
      { label: '主动招呼', value: `${greets}` },
      { label: '签名通过', value: `${trust3}` },
      { label: '跨端命令', value: `${remoteSent}` },
      { label: '自主交易', value: `${agentic}` },
      { label: '今日步数', value: steps.toLocaleString() },
    ];
  }, []);

  return (
    <View style={styles.summaryCard}>
      <Text style={styles.summaryTitle}>📊 今日陪伴小结</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.summaryRow}>
        {stats.map((s) => (
          <View key={s.label} style={styles.summaryTile}>
            <Text style={styles.summaryValue}>{s.value}</Text>
            <Text style={styles.summaryLabel}>{s.label}</Text>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

interface SectionProps {
  title: string;
  children: React.ReactNode;
}
function Section({ title, children }: SectionProps) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

interface PresetBtnProps {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'ghost' | 'danger';
}
function PresetBtn({ label, onPress, variant = 'primary' }: PresetBtnProps) {
  const style: any[] = [styles.presetBtn];
  if (variant === 'ghost') style.push(styles.presetGhost);
  if (variant === 'danger') style.push(styles.presetDanger);
  const textStyle: any[] = [styles.presetText];
  if (variant === 'ghost') textStyle.push(styles.presetTextGhost);
  if (variant === 'danger') textStyle.push(styles.presetTextDanger);
  return (
    <TouchableOpacity style={style} onPress={onPress} accessibilityLabel={label}>
      <Text style={textStyle}>{label}</Text>
    </TouchableOpacity>
  );
}

interface LimitBoxProps {
  label: string;
  value: string;
}
function LimitBox({ label, value }: LimitBoxProps) {
  return (
    <View style={styles.limitBox}>
      <Text style={styles.limitLabel}>{label}</Text>
      <Text style={styles.limitValue}>{value}</Text>
    </View>
  );
}

const styles = themedStyles(() => StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bgPrimary },
  content: { paddingHorizontal: 16, paddingVertical: 12 },
  intro: { color: colors.textMuted, fontSize: 13, marginBottom: 12 },
  section: {
    backgroundColor: colors.bgCard,
    borderRadius: 14,
    padding: 14,
    marginBottom: 14,
    borderColor: colors.border,
    borderWidth: 1,
  },
  sectionTitle: { color: colors.textPrimary, fontSize: 15, fontWeight: '700', marginBottom: 6 },
  sectionHint: { color: colors.textMuted, fontSize: 12, lineHeight: 18, marginBottom: 8 },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomColor: colors.border,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  toggleLabel: { color: colors.textPrimary, fontSize: 13, fontWeight: '500' },
  toggleHint: { color: colors.textMuted, fontSize: 11, marginTop: 2 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginVertical: 8 },
  presetBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: colors.accent,
    borderRadius: 10,
    flexShrink: 1,
  },
  presetGhost: {
    backgroundColor: 'transparent',
    borderColor: colors.border,
    borderWidth: 1,
  },
  presetDanger: {
    backgroundColor: colors.danger,
  },
  presetText: { color: '#0B1220', fontSize: 12, fontWeight: '700' },
  presetTextGhost: { color: colors.textPrimary },
  presetTextDanger: { color: '#fff' },
  limitBox: {
    flex: 1,
    paddingVertical: 8,
    paddingHorizontal: 10,
    backgroundColor: colors.bgPrimary,
    borderRadius: 10,
    borderColor: colors.border,
    borderWidth: 1,
    alignItems: 'center',
  },
  limitLabel: { color: colors.textMuted, fontSize: 11 },
  limitValue: { color: colors.textPrimary, fontSize: 16, fontWeight: '700', marginTop: 2 },
  tagBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: colors.bgPrimary,
    borderRadius: 8,
    borderColor: colors.border,
    borderWidth: 1,
  },
  tagBtnOn: {
    backgroundColor: colors.accent + '22',
    borderColor: colors.accent,
  },
  tagText: { color: colors.textMuted, fontSize: 11 },
  tagTextOn: { color: colors.accent, fontWeight: '600' },
  // ── Today summary card ───────────────────────────────────────
  summaryCard: {
    backgroundColor: colors.bgCard,
    borderRadius: 14,
    padding: 14,
    marginBottom: 14,
    borderColor: colors.accent + '55',
    borderWidth: 1,
  },
  summaryTitle: { color: colors.textPrimary, fontSize: 14, fontWeight: '700' },
  summaryRow: { marginTop: 10 },
  summaryTile: {
    width: 90,
    paddingVertical: 8,
    paddingHorizontal: 8,
    backgroundColor: colors.bgPrimary,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 10,
    alignItems: 'center',
    marginRight: 8,
  },
  summaryValue: { color: colors.accent, fontSize: 18, fontWeight: '700' },
  summaryLabel: { color: colors.textMuted, fontSize: 11, marginTop: 4 },
}));
