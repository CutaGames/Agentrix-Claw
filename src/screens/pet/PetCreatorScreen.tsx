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
        if (fresh) setTask(fresh);
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
      const body: any = { mode, provider };
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
          <Text style={styles.taskStatus}>状态: {task.status}</Text>
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
  taskCard: { marginTop: 20, padding: 14, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.04)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)' },
  taskTitle: { color: colors.text, fontSize: 14, fontWeight: '600' },
  taskStatus: { color: colors.textSecondary, fontSize: 12, marginTop: 4 },
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
