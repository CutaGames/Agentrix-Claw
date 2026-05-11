/**
 * PetCreatorScreen — Mobile V4 (PRD mobile-prd-v4 §4).
 *
 * Pet生成主入口（V4 P1）。文生 + 图生 + Provider 选择（live + coming_soon）。
 * 提交后轮询 /pet-generation/tasks/:id 直至完成。
 */
import React, { useCallback, useEffect, useState } from 'react';
import {
  ScrollView, View, Text, StyleSheet, Pressable, TextInput,
  ActivityIndicator, Modal, FlatList,
} from 'react-native';
import { apiFetch } from '../../services/api';
import { colors } from '../../theme/colors';
import { showAxpToast } from '../../stores/axpToastStore';
import { useCapableDevices } from '../../hooks/useCapableDevices';
import type { ExecutionPreference } from '../../services/compute.api';
import { useI18n } from '../../stores/i18nStore';

type Mode = 'text' | 'image';
type Tier = 'free' | 'budget' | 'standard' | 'premium';
type Status = 'live' | 'coming_soon' | 'beta';

interface Provider {
  id: string; name: string; vendor: string; modality: '3d' | 'video';
  status: Status; tier: Tier; pricingLabel: string; strength: string;
  latencyHint?: string; chinaAvailable?: boolean;
}

interface PetTask {
  taskId: string; status: string; provider?: string;
  outputUrl?: string; vrmUrl?: string; thumbnailUrl?: string;
  error?: string; prompt?: string;
}

const TIER_ICON: Record<Tier, string> = {
  free: '🆓', budget: '💰', standard: '🔥', premium: '💎',
};

// Map backend task status → stepper progress. Backend uses meshy/hunyuan3d
// vocab (queued / processing / generating / texturing / completed / failed).
const STEP_LABELS = ['排队', '上传', '建模', '纹理', '完成'] as const;

function stepIndexFromStatus(status: string): number {
  const s = (status || '').toLowerCase();
  if (['queued', 'pending', 'created'].includes(s)) return 0;
  if (['uploading', 'submitted', 'preprocessing', 'started'].includes(s)) return 1;
  if (['processing', 'generating', 'modeling', 'running'].includes(s)) return 2;
  if (['texturing', 'post_processing', 'rendering'].includes(s)) return 3;
  if (['completed', 'finished', 'success', 'done'].includes(s)) return 4;
  // failed / canceled mapped by caller with hasError flag
  return 0;
}

function PetCreationStepper({ status, hasError }: { status: string; hasError: boolean }) {
  const idx = stepIndexFromStatus(status);
  const failedAt = hasError ? idx : -1;
  return (
    <View style={stepperStyles.wrap}>
      <View style={stepperStyles.row}>
        {STEP_LABELS.map((label, i) => {
          const done = i < idx;
          const active = i === idx && !hasError;
          const failed = i === failedAt;
          const dotStyle = failed
            ? stepperStyles.dotFailed
            : done
              ? stepperStyles.dotDone
              : active
                ? stepperStyles.dotActive
                : stepperStyles.dotIdle;
          return (
            <React.Fragment key={label}>
              <View style={stepperStyles.step}>
                <View style={[stepperStyles.dot, dotStyle]}>
                  {failed ? (
                    <Text style={stepperStyles.dotText}>✕</Text>
                  ) : done ? (
                    <Text style={stepperStyles.dotText}>✓</Text>
                  ) : active ? (
                    <ActivityIndicator size="small" color="#0B1220" />
                  ) : (
                    <Text style={stepperStyles.dotIdleText}>{i + 1}</Text>
                  )}
                </View>
                <Text style={[
                  stepperStyles.label,
                  (done || active) && !failed && stepperStyles.labelActive,
                  failed && stepperStyles.labelFailed,
                ]}>
                  {label}
                </Text>
              </View>
              {i < STEP_LABELS.length - 1 && (
                <View style={[stepperStyles.bar, i < idx && !hasError && stepperStyles.barDone]} />
              )}
            </React.Fragment>
          );
        })}
      </View>
      <Text style={stepperStyles.status}>
        {hasError
          ? `❌ 在"${STEP_LABELS[failedAt] ?? '未知阶段'}"阶段失败`
          : idx === 4
            ? '🎉 生成完成！'
            : `状态：${status || '—'} · 约 30-90 秒完成`}
      </Text>
    </View>
  );
}

const stepperStyles = StyleSheet.create({
  wrap: { marginTop: 8, marginBottom: 8 },
  row: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 4 },
  step: { alignItems: 'center', width: 56 },
  dot: {
    width: 28, height: 28, borderRadius: 14,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1.5,
  },
  dotIdle: { backgroundColor: 'rgba(148,163,184,0.12)', borderColor: 'rgba(148,163,184,0.35)' },
  dotActive: { backgroundColor: '#22d3ee', borderColor: '#22d3ee' },
  dotDone: { backgroundColor: '#22c55e', borderColor: '#22c55e' },
  dotFailed: { backgroundColor: '#ef4444', borderColor: '#ef4444' },
  dotText: { color: '#0B1220', fontSize: 13, fontWeight: '800' },
  dotIdleText: { color: 'rgba(226,232,240,0.65)', fontSize: 12, fontWeight: '700' },
  bar: {
    flex: 1, height: 2, backgroundColor: 'rgba(148,163,184,0.25)',
    marginHorizontal: -4,
  },
  barDone: { backgroundColor: '#22c55e' },
  label: { fontSize: 10, color: 'rgba(226,232,240,0.55)', marginTop: 6, fontWeight: '600' },
  labelActive: { color: '#e5e7eb' },
  labelFailed: { color: '#fca5a5' },
  status: { marginTop: 10, fontSize: 12, color: '#cbd5e1', textAlign: 'center' },
});

// ── Quota Progress Bar ─────────────────────────────────────────────────────

interface QuotaInfo {
  used: number;
  limit: number;
}

function QuotaProgressBar() {
  const { t } = useI18n();
  const [quota, setQuota] = useState<QuotaInfo | null>(null);

  useEffect(() => {
    apiFetch<{ pet_generation_used?: number; pet_generation_limit?: number }>('/v1/me/quota')
      .then((data) => {
        if (data) {
          setQuota({
            used: data.pet_generation_used ?? 0,
            limit: data.pet_generation_limit ?? 3,
          });
        }
      })
      .catch(() => setQuota({ used: 0, limit: 3 }));
  }, []);

  if (!quota) return null;

  const pct = Math.min(100, Math.round((quota.used / quota.limit) * 100));
  const exhausted = quota.used >= quota.limit;

  return (
    <View style={quotaStyles.container}>
      <View style={quotaStyles.headerRow}>
        <Text style={quotaStyles.label}>
          {t({ en: `This month: ${quota.used}/${quota.limit} used`, zh: `本月已用 ${quota.used}/${quota.limit} 次` })}
        </Text>
        {exhausted && (
          <Text style={quotaStyles.upgrade}>
            {t({ en: 'Upgrade to unlock more', zh: '升级解锁更多' })} →
          </Text>
        )}
      </View>
      <View style={quotaStyles.barBg}>
        <View
          style={[
            quotaStyles.barFill,
            { width: `${pct}%` },
            exhausted && quotaStyles.barExhausted,
          ]}
        />
      </View>
    </View>
  );
}

const quotaStyles = StyleSheet.create({
  container: {
    marginBottom: 16,
    padding: 12,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  label: {
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: '600',
  },
  upgrade: {
    color: '#fbbf24',
    fontSize: 11,
    fontWeight: '600',
  },
  barBg: {
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.1)',
    overflow: 'hidden',
  },
  barFill: {
    height: '100%',
    borderRadius: 3,
    backgroundColor: '#22d3ee',
  },
  barExhausted: {
    backgroundColor: '#f87171',
  },
});

export function PetCreatorScreen() {
  const [mode, setMode] = useState<Mode>('text');
  const [provider, setProvider] = useState<string>('meshy');
  const [providers, setProviders] = useState<Provider[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [prompt, setPrompt] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [task, setTask] = useState<PetTask | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [executionPreference, setExecutionPreference] = useState<ExecutionPreference>('auto');

  // D-MESH: show "your desktop is online" hint
  const { hasCapable: hasDesktop, topDevice } = useCapableDevices('pet_gen');

  // Load provider catalog
  useEffect(() => {
    apiFetch<{ providers: Provider[] }>('/generation-providers/3d')
      .then((r) => setProviders(r?.providers || []))
      .catch(() => setProviders([]));
  }, []);

  // Poll task
  useEffect(() => {
    if (!task || ['completed', 'failed', 'canceled'].includes(task.status)) return;
    const id = setInterval(async () => {
      try {
        const fresh = await apiFetch<PetTask>(`/pet-generation/tasks/${task.taskId}`);
        if (fresh) {
          setTask((prev) => {
            // Fire a one-time completion toast when we cross into completed.
            if (prev && prev.status !== 'completed' && fresh.status === 'completed') {
              showAxpToast({
                amount: 50,
                emoji: '✨',
                reason: { en: 'Pet generated!', zh: '萌宠生成完成！' },
              });
            }
            return fresh;
          });
        }
      } catch (e: any) {
        console.warn('[PetCreator] poll', e?.message);
      }
    }, 5000);
    return () => clearInterval(id);
  }, [task]);

  const submit = useCallback(async () => {
    setError(null);
    if (mode === 'text' && !prompt.trim()) { setError('请填写描述'); return; }
    if (mode === 'image' && !imageUrl.trim()) { setError('请填写参考图 URL'); return; }
    setSubmitting(true);
    try {
      const body: any = { mode, provider, executionPreference };
      if (mode === 'text') body.prompt = prompt.trim();
      else { body.referenceImageUrl = imageUrl.trim(); if (prompt.trim()) body.prompt = prompt.trim(); }
      const res = await apiFetch<PetTask>('/pet-generation/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      setTask(res);
    } catch (e: any) {
      setError(e?.message || '提交失败');
    }
    setSubmitting(false);
  }, [mode, prompt, imageUrl, provider]);

  const selected = providers.find((p) => p.id === provider);
  const live = providers.filter((p) => p.status === 'live');
  const coming = providers.filter((p) => p.status === 'coming_soon');

  const isResourceErr = task?.error && /resource|insufficient|资源不足/i.test(task.error);

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
      <Text style={styles.title}>✨ 生成专属萌宠</Text>
      <Text style={styles.sub}>文字或图片 → 3D 模型 · 完成后可设为主宠</Text>

      {/* Quota progress bar (Sprint 2 · Task 2.7) */}
      <QuotaProgressBar />

      {/* Mode */}
      <View style={styles.section}>
        <Text style={styles.label}>生成模式</Text>
        <View style={styles.tabsRow}>
          {(['text', 'image'] as Mode[]).map((m) => (
            <Pressable
              key={m}
              onPress={() => setMode(m)}
              style={[styles.tab, mode === m && styles.tabActive]}
            >
              <Text style={[styles.tabText, mode === m && styles.tabTextActive]}>
                {m === 'text' ? '文字 → 3D' : '图片 → 3D'}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>

      {/* Provider picker */}
      <View style={styles.section}>
        <Text style={styles.label}>Provider</Text>
        <Pressable onPress={() => setPickerOpen(true)} style={styles.picker}>
          {selected ? (
            <>
              <Text style={styles.pickerIcon}>{TIER_ICON[selected.tier]}</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.pickerName}>
                  {selected.name}
                  {selected.chinaAvailable ? ' 🇨🇳' : ''}
                </Text>
                <Text style={styles.pickerSub}>{selected.vendor} · {selected.pricingLabel}</Text>
              </View>
            </>
          ) : (
            <Text style={styles.pickerPlaceholder}>选择 Provider</Text>
          )}
          <Text style={{ color: colors.textSecondary }}>▾</Text>
        </Pressable>
      </View>

      {/* Prompt / image */}
      {mode === 'text' ? (
        <View style={styles.section}>
          <Text style={styles.label}>描述 Prompt</Text>
          <TextInput
            value={prompt}
            onChangeText={setPrompt}
            placeholder="例如：一只蓝色发光的赛博朋克小狐狸，戴着耳机"
            placeholderTextColor={colors.textSecondary}
            multiline
            numberOfLines={4}
            style={styles.textarea}
          />
        </View>
      ) : (
        <>
          <View style={styles.section}>
            <Text style={styles.label}>参考图 URL</Text>
            <TextInput
              value={imageUrl}
              onChangeText={setImageUrl}
              placeholder="https://..."
              placeholderTextColor={colors.textSecondary}
              autoCapitalize="none"
              style={styles.input}
            />
          </View>
          <View style={styles.section}>
            <Text style={styles.label}>附加描述（可选）</Text>
            <TextInput
              value={prompt}
              onChangeText={setPrompt}
              placeholder="材质 / 姿势..."
              placeholderTextColor={colors.textSecondary}
              multiline
              numberOfLines={2}
              style={styles.textarea}
            />
          </View>
        </>
      )}

      {error && <Text style={styles.err}>{error}</Text>}

      {/* D-MESH: execution target */}
      <View style={styles.section}>
        <Text style={styles.label}>🖥 算力来源</Text>
        <View style={styles.tabsRow}>
          {(['auto', 'cloud', 'desktop'] as ExecutionPreference[]).map((p) => (
            <Pressable
              key={p}
              onPress={() => setExecutionPreference(p)}
              style={[styles.tab, executionPreference === p && styles.tabActive]}
            >
              <Text style={[styles.tabText, executionPreference === p && styles.tabTextActive]}>
                {p === 'auto' ? '⚡ 自动' : p === 'cloud' ? '☁️ 云端' : '🖥 桌面'}
              </Text>
            </Pressable>
          ))}
        </View>
        {hasDesktop && topDevice ? (
          <Text style={styles.deviceHint}>
            ✅ 你的 <Text style={{ color: '#22d3ee', fontWeight: '700' }}>{topDevice.deviceName}</Text>
            {topDevice.gpu ? ` (${topDevice.gpu})` : ''} 在线，可本地生成
          </Text>
        ) : (
          <Text style={styles.deviceHintMuted}>
            💡 桌面端在线时可本地生成（省流量 · 无等待 · 贡献桌面主人 +10 AXP）
          </Text>
        )}
      </View>

      <Pressable
        onPress={submit}
        disabled={submitting}
        style={[styles.submitBtn, submitting && { opacity: 0.5 }]}
      >
        {submitting ? <ActivityIndicator color="#fff" /> : <Text style={styles.submitText}>🚀 开始生成</Text>}
      </Pressable>

      {/* Task status */}
      {task && (
        <View style={styles.taskCard}>
          <Text style={styles.taskTitle}>{task.prompt || task.taskId}</Text>
          <PetCreationStepper status={task.status} hasError={!!task.error} />
          {task.error && (
            <View style={styles.errBox}>
              <Text style={styles.errBoxTitle}>❌ 生成失败</Text>
              <Text style={styles.errBoxMsg}>{task.error}</Text>
              {isResourceErr && (
                <Text style={styles.tipText}>
                  💡 腾讯云账户额度不足，请充值或切换其他 Provider。
                </Text>
              )}
            </View>
          )}
          {(task.outputUrl || task.vrmUrl) && (
            <>
              <Text style={styles.taskUrl} numberOfLines={2}>{task.outputUrl || task.vrmUrl}</Text>
              <View style={styles.guide}>
                <Text style={styles.guideTitle}>🎓 接下来可以怎么用？</Text>
                <Text style={styles.guideText}>
                  · ① 设为我的萌宠 → 切回「我的萌宠」页面查看{'\n'}
                  · ② 下载 .glb → 导入 Blender / VRChat / 元宇宙{'\n'}
                  · ③ 上架萌宠市场（开发中）
                </Text>
              </View>
            </>
          )}
        </View>
      )}

      {/* Provider modal */}
      <Modal visible={pickerOpen} transparent animationType="slide" onRequestClose={() => setPickerOpen(false)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setPickerOpen(false)}>
          <Pressable style={styles.modalSheet} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.modalTitle}>选择 Provider</Text>
            <FlatList
              data={[...live, ...coming]}
              keyExtractor={(p) => p.id}
              renderItem={({ item, index }) => {
                const isFirstLive = index === 0 && live.length > 0;
                const isFirstComing = item.status === 'coming_soon' && providers[index - 1]?.status === 'live';
                const disabled = item.status === 'coming_soon';
                return (
                  <>
                    {isFirstLive && <Text style={styles.groupLabel}>✅ 立即可用</Text>}
                    {isFirstComing && <Text style={styles.groupLabel}>🕐 Coming Soon</Text>}
                    <Pressable
                      disabled={disabled}
                      onPress={() => { setProvider(item.id); setPickerOpen(false); }}
                      style={[
                        styles.providerRow,
                        item.id === provider && styles.providerRowActive,
                        disabled && { opacity: 0.45 },
                      ]}
                    >
                      <Text style={{ fontSize: 22 }}>{TIER_ICON[item.tier]}</Text>
                      <View style={{ flex: 1, marginLeft: 10 }}>
                        <Text style={styles.providerName}>
                          {item.name}
                          {item.chinaAvailable ? ' 🇨🇳' : ''}
                          {disabled ? '  ·  Coming Soon' : ''}
                        </Text>
                        <Text style={styles.providerSub}>
                          {item.vendor} · {item.pricingLabel}
                          {item.latencyHint ? ` · ⏱ ${item.latencyHint}` : ''}
                        </Text>
                        <Text style={styles.providerStrength}>{item.strength}</Text>
                      </View>
                    </Pressable>
                  </>
                );
              }}
            />
          </Pressable>
        </Pressable>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  title: { color: colors.text, fontSize: 22, fontWeight: '700' },
  sub: { color: colors.textSecondary, fontSize: 12, marginTop: 4, marginBottom: 8 },
  section: { marginTop: 16 },
  label: { color: colors.textSecondary, fontSize: 12, marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 },
  tabsRow: { flexDirection: 'row', gap: 8 },
  tab: { flex: 1, paddingVertical: 10, borderRadius: 8, backgroundColor: 'rgba(255,255,255,0.05)', alignItems: 'center' },
  tabActive: { backgroundColor: '#6C5CE7' },
  tabText: { color: colors.textSecondary, fontSize: 13, fontWeight: '600' },
  tabTextActive: { color: '#fff' },
  picker: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 8, padding: 12, gap: 10 },
  pickerIcon: { fontSize: 22 },
  pickerName: { color: colors.text, fontSize: 14, fontWeight: '600' },
  pickerSub: { color: colors.textSecondary, fontSize: 11, marginTop: 2 },
  pickerPlaceholder: { color: colors.textSecondary, flex: 1 },
  input: { backgroundColor: 'rgba(255,255,255,0.05)', color: colors.text, padding: 12, borderRadius: 8, fontSize: 14 },
  textarea: { backgroundColor: 'rgba(255,255,255,0.05)', color: colors.text, padding: 12, borderRadius: 8, fontSize: 14, minHeight: 80, textAlignVertical: 'top' },
  err: { color: '#f87171', marginTop: 12, fontSize: 13 },
  submitBtn: { marginTop: 20, backgroundColor: '#6C5CE7', borderRadius: 10, paddingVertical: 14, alignItems: 'center' },
  submitText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  deviceHint: { marginTop: 8, fontSize: 11, color: colors.textSecondary, lineHeight: 16 },
  deviceHintMuted: { marginTop: 8, fontSize: 11, color: colors.textSecondary, opacity: 0.7, lineHeight: 16 },
  taskCard: { marginTop: 20, padding: 14, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.04)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)' },
  taskTitle: { color: colors.text, fontSize: 14, fontWeight: '600' },
  taskUrl: { color: '#22d3ee', fontSize: 11, marginTop: 8 },
  errBox: { marginTop: 10, padding: 10, backgroundColor: 'rgba(248,113,113,0.08)', borderRadius: 8, borderWidth: 1, borderColor: 'rgba(248,113,113,0.3)' },
  errBoxTitle: { color: '#f87171', fontWeight: '700', fontSize: 12 },
  errBoxMsg: { color: '#fca5a5', fontSize: 12, marginTop: 4 },
  tipText: { color: '#fbbf24', fontSize: 11, marginTop: 6, lineHeight: 18 },
  guide: { marginTop: 12, padding: 10, borderRadius: 8, backgroundColor: 'rgba(108,92,231,0.08)', borderWidth: 1, borderColor: 'rgba(108,92,231,0.25)' },
  guideTitle: { color: '#a78bfa', fontSize: 13, fontWeight: '700', marginBottom: 4 },
  guideText: { color: colors.textSecondary, fontSize: 12, lineHeight: 18 },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' },
  modalSheet: { backgroundColor: '#15151c', borderTopLeftRadius: 16, borderTopRightRadius: 16, maxHeight: '75%', padding: 16 },
  modalTitle: { color: colors.text, fontSize: 16, fontWeight: '700', marginBottom: 12 },
  groupLabel: { color: colors.textSecondary, fontSize: 11, fontWeight: '700', textTransform: 'uppercase', marginTop: 10, marginBottom: 6, letterSpacing: 0.6 },
  providerRow: { flexDirection: 'row', padding: 12, borderRadius: 10, alignItems: 'flex-start' },
  providerRowActive: { backgroundColor: 'rgba(108,92,231,0.2)' },
  providerName: { color: colors.text, fontSize: 14, fontWeight: '600' },
  providerSub: { color: colors.textSecondary, fontSize: 11, marginTop: 2 },
  providerStrength: { color: 'rgba(255,255,255,0.4)', fontSize: 11, marginTop: 2 },
});
