import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { colors } from '../../theme/colors';
import { useI18n } from '../../stores/i18nStore';
import { useSettingsStore } from '../../stores/settingsStore';
import type { LocalAiStatus } from '../../stores/settingsStore';
import { MobileLocalInferenceService } from '../../services/mobileLocalInference.service';

interface LocalModelInfo {
  id: string;
  name: string;
  size: string;
  description: string;
  tier: string;
  recommended?: boolean;
}

const AVAILABLE_MODELS: LocalModelInfo[] = [
  {
    id: 'gemma-4-2b',
    name: 'Gemma 4 2B',
    size: '1.5 GB',
    description: 'Fast on-device model for wake word, intent routing, simple queries, and privacy filtering.',
    tier: 'LOCAL',
    recommended: true,
  },
  {
    id: 'gemma-4-4b',
    name: 'Gemma 4 4B',
    size: '2.8 GB',
    description: 'Higher quality local model with better reasoning. Requires 6GB+ RAM.',
    tier: 'LOCAL',
  },
];

function statusColor(status: LocalAiStatus): string {
  switch (status) {
    case 'ready': return '#10B981';
    case 'downloading': return '#3B82F6';
    case 'error': return '#EF4444';
    default: return colors.textMuted;
  }
}

function statusLabel(status: LocalAiStatus, t: ReturnType<typeof useI18n>['t']): string {
  switch (status) {
    case 'ready': return t({ en: 'Ready', zh: '已就绪' });
    case 'downloading': return t({ en: 'Downloading...', zh: '下载中...' });
    case 'error': return t({ en: 'Error', zh: '出错' });
    default: return t({ en: 'Not Downloaded', zh: '未下载' });
  }
}

export function LocalAiModelScreen() {
  const { t } = useI18n();
  const localAiEnabled = useSettingsStore((s) => s.localAiEnabled);
  const localAiStatus = useSettingsStore((s) => s.localAiStatus);
  const localAiProgress = useSettingsStore((s) => s.localAiProgress);
  const localAiModelId = useSettingsStore((s) => s.localAiModelId);
  const setLocalAiEnabled = useSettingsStore((s) => s.setLocalAiEnabled);
  const setLocalAiStatus = useSettingsStore((s) => s.setLocalAiStatus);
  const setLocalAiProgress = useSettingsStore((s) => s.setLocalAiProgress);
  const selectedModelId = useSettingsStore((s) => s.selectedModelId);
  const setSelectedModel = useSettingsStore((s) => s.setSelectedModel);
  const [bridgeAvailable, setBridgeAvailable] = useState<boolean | null>(null);

  useEffect(() => {
    void MobileLocalInferenceService.isAvailable().then(setBridgeAvailable);
  }, []);

  const handleDownload = useCallback((modelId: string) => {
    setLocalAiStatus('downloading');
    setLocalAiProgress(0);

    // Simulate download progress — in production this would use a native download manager
    let progress = 0;
    const timer = setInterval(() => {
      progress += Math.random() * 15 + 5;
      if (progress >= 100) {
        progress = 100;
        clearInterval(timer);
        setLocalAiProgress(100);
        setLocalAiStatus('ready');
        setLocalAiEnabled(true);
        Alert.alert(
          t({ en: 'Download Complete', zh: '下载完成' }),
          t({ en: 'Local AI model is ready. Simple queries will now be processed on-device.', zh: '本地 AI 模型已就绪。简单查询将在设备端处理。' }),
        );
      } else {
        setLocalAiProgress(Math.round(progress));
      }
    }, 500);
  }, [setLocalAiEnabled, setLocalAiProgress, setLocalAiStatus, t]);

  const handleDelete = useCallback(() => {
    Alert.alert(
      t({ en: 'Delete Local Model', zh: '删除本地模型' }),
      t({ en: 'This will remove the downloaded model and free up storage space.', zh: '将删除已下载的模型并释放存储空间。' }),
      [
        { text: t({ en: 'Cancel', zh: '取消' }), style: 'cancel' },
        {
          text: t({ en: 'Delete', zh: '删除' }),
          style: 'destructive',
          onPress: () => {
            setLocalAiStatus('not_downloaded');
            setLocalAiProgress(0);
            setLocalAiEnabled(false);
          },
        },
      ],
    );
  }, [setLocalAiEnabled, setLocalAiProgress, setLocalAiStatus, t]);

  const currentModel = AVAILABLE_MODELS.find((m) => m.id === localAiModelId) ?? AVAILABLE_MODELS[0];

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Tri-tier explanation */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>{t({ en: 'Tri-Tier AI Architecture', zh: '三级混合 AI 架构' })}</Text>
        <Text style={styles.cardDesc}>
          {t({
            en: 'Agentrix uses a 3-tier model: on-device local model for speed & privacy, cloud API for daily conversations, and frontier models for complex tasks.',
            zh: 'Agentrix 采用三级模型：端侧本地模型（快速+隐私）→ 云端 API（日常对话）→ 超脑模型（复杂任务）',
          })}
        </Text>
        <View style={styles.tierRow}>
          <View style={[styles.tierBadge, { backgroundColor: 'rgba(16,185,129,0.15)' }]}>
            <Text style={styles.tierIcon}>📱</Text>
            <Text style={[styles.tierLabel, { color: '#10B981' }]}>{t({ en: 'Local', zh: '端侧' })}</Text>
            <Text style={styles.tierCost}>{t({ en: 'Free', zh: '免费' })}</Text>
          </View>
          <Text style={styles.tierArrow}>→</Text>
          <View style={[styles.tierBadge, { backgroundColor: 'rgba(59,130,246,0.15)' }]}>
            <Text style={styles.tierIcon}>☁️</Text>
            <Text style={[styles.tierLabel, { color: '#3B82F6' }]}>{t({ en: 'Cloud API', zh: '云端' })}</Text>
            <Text style={styles.tierCost}>{t({ en: 'Platform/Own', zh: '平台/自有' })}</Text>
          </View>
          <Text style={styles.tierArrow}>→</Text>
          <View style={[styles.tierBadge, { backgroundColor: 'rgba(139,92,246,0.15)' }]}>
            <Text style={styles.tierIcon}>🧠</Text>
            <Text style={[styles.tierLabel, { color: '#8B5CF6' }]}>{t({ en: 'Ultra', zh: '超脑' })}</Text>
            <Text style={styles.tierCost}>Opus/GPT-5</Text>
          </View>
        </View>
      </View>

      {/* Status card */}
      <View style={styles.card}>
        <View style={styles.statusRow}>
          <View style={[styles.statusDot, { backgroundColor: statusColor(localAiStatus) }]} />
          <Text style={styles.statusText}>{statusLabel(localAiStatus, t)}</Text>
          {localAiStatus === 'downloading' && (
            <Text style={styles.progressText}>{localAiProgress}%</Text>
          )}
        </View>

        {localAiStatus === 'downloading' && (
          <View style={styles.progressBar}>
            <View style={[styles.progressFill, { width: `${localAiProgress}%` }]} />
          </View>
        )}

        {localAiStatus === 'ready' && (
          <View style={styles.readyInfo}>
            <Text style={styles.readyModel}>{currentModel.name}</Text>
            <Text style={styles.readyDesc}>
              {t({
                en: 'On-device inference active. Wake word, intent routing, and simple queries run locally.',
                zh: '端侧推理已激活。唤醒词、意图路由和简单查询在本地运行。',
              })}
            </Text>
          </View>
        )}

        {bridgeAvailable === false && localAiStatus !== 'ready' && (
          <Text style={styles.warningText}>
            {t({
              en: 'Native inference bridge not available on this device. Model will be downloaded and ready for future updates.',
              zh: '当前设备暂不支持原生推理。模型将下载供后续版本使用。',
            })}
          </Text>
        )}
      </View>

      {/* Available models */}
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>{t({ en: 'Available Models', zh: '可用模型' })}</Text>
      </View>

      {AVAILABLE_MODELS.map((model) => (
        <View key={model.id} style={[styles.modelCard, localAiModelId === model.id && styles.modelCardSelected]}>
          <View style={styles.modelHeader}>
            <Text style={styles.modelName}>{model.name}</Text>
            {model.recommended && (
              <View style={styles.recommendBadge}>
                <Text style={styles.recommendText}>{t({ en: 'Recommended', zh: '推荐' })}</Text>
              </View>
            )}
          </View>
          <Text style={styles.modelDesc}>
            {t({ en: model.description, zh: model.description })}
          </Text>
          <View style={styles.modelMeta}>
            <Text style={styles.metaText}>📦 {model.size}</Text>
            <Text style={styles.metaText}>⚡ {model.tier}</Text>
            <Text style={styles.metaText}>💰 {t({ en: 'Free', zh: '免费' })}</Text>
          </View>

          {localAiModelId === model.id && localAiStatus === 'ready' ? (
            <View style={styles.modelActions}>
              <TouchableOpacity style={styles.activeBtn} disabled>
                <Text style={styles.activeBtnText}>✅ {t({ en: 'Active', zh: '已激活' })}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.deleteBtn} onPress={handleDelete}>
                <Text style={styles.deleteBtnText}>{t({ en: 'Delete', zh: '删除' })}</Text>
              </TouchableOpacity>
            </View>
          ) : localAiModelId === model.id && localAiStatus === 'downloading' ? (
            <View style={styles.modelActions}>
              <ActivityIndicator size="small" color="#3B82F6" />
              <Text style={styles.downloadingText}>{t({ en: 'Downloading...', zh: '下载中...' })} {localAiProgress}%</Text>
            </View>
          ) : (
            <TouchableOpacity
              style={styles.downloadBtn}
              onPress={() => handleDownload(model.id)}
              disabled={localAiStatus === 'downloading'}
            >
              <Text style={styles.downloadBtnText}>
                ⬇️ {t({ en: `Download (${model.size})`, zh: `下载 (${model.size})` })}
              </Text>
            </TouchableOpacity>
          )}
        </View>
      ))}

      {/* Current routing explanation */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>{t({ en: 'Current Model Routing', zh: '当前模型路由' })}</Text>
        <View style={styles.routeRow}>
          <Text style={styles.routeLabel}>{t({ en: 'Simple queries', zh: '简单查询' })}</Text>
          <Text style={styles.routeValue}>
            {localAiStatus === 'ready' ? `📱 ${currentModel.name}` : `☁️ ${selectedModelId}`}
          </Text>
        </View>
        <View style={styles.routeRow}>
          <Text style={styles.routeLabel}>{t({ en: 'Daily conversations', zh: '日常对话' })}</Text>
          <Text style={styles.routeValue}>☁️ {selectedModelId}</Text>
        </View>
        <View style={styles.routeRow}>
          <Text style={styles.routeLabel}>{t({ en: 'Complex tasks', zh: '复杂任务' })}</Text>
          <Text style={styles.routeValue}>🧠 {t({ en: 'Auto (Opus/GPT-5)', zh: '自动 (Opus/GPT-5)' })}</Text>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bgPrimary },
  content: { padding: 16, paddingBottom: 48, gap: 16 },
  card: {
    backgroundColor: colors.bgCard,
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 10,
  },
  cardTitle: { fontSize: 15, fontWeight: '700', color: colors.textPrimary },
  cardDesc: { fontSize: 12, color: colors.textMuted, lineHeight: 18 },
  tierRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 4 },
  tierBadge: { alignItems: 'center', paddingVertical: 8, paddingHorizontal: 10, borderRadius: 10, minWidth: 70 },
  tierIcon: { fontSize: 20 },
  tierLabel: { fontSize: 11, fontWeight: '700', marginTop: 2 },
  tierCost: { fontSize: 9, color: colors.textMuted, marginTop: 1 },
  tierArrow: { fontSize: 16, color: colors.textMuted },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  statusDot: { width: 10, height: 10, borderRadius: 5 },
  statusText: { fontSize: 14, fontWeight: '600', color: colors.textPrimary },
  progressText: { fontSize: 14, fontWeight: '700', color: '#3B82F6', marginLeft: 'auto' },
  progressBar: {
    height: 6,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressFill: { height: '100%', backgroundColor: '#3B82F6', borderRadius: 3 },
  readyInfo: { gap: 4 },
  readyModel: { fontSize: 13, fontWeight: '600', color: '#10B981' },
  readyDesc: { fontSize: 11, color: colors.textMuted, lineHeight: 16 },
  warningText: { fontSize: 11, color: '#F59E0B', lineHeight: 16 },
  sectionHeader: { marginTop: 4 },
  sectionTitle: { fontSize: 12, fontWeight: '700', color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.5 },
  modelCard: {
    backgroundColor: colors.bgCard,
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 8,
  },
  modelCardSelected: { borderColor: '#10B981' },
  modelHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  modelName: { fontSize: 15, fontWeight: '700', color: colors.textPrimary },
  recommendBadge: { backgroundColor: 'rgba(16,185,129,0.15)', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 },
  recommendText: { fontSize: 10, fontWeight: '700', color: '#10B981' },
  modelDesc: { fontSize: 12, color: colors.textMuted, lineHeight: 17 },
  modelMeta: { flexDirection: 'row', gap: 12 },
  metaText: { fontSize: 11, color: colors.textMuted },
  modelActions: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 4 },
  activeBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: 'rgba(16,185,129,0.12)',
    alignItems: 'center',
  },
  activeBtnText: { fontSize: 13, fontWeight: '600', color: '#10B981' },
  deleteBtn: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 10,
    backgroundColor: 'rgba(239,68,68,0.1)',
  },
  deleteBtnText: { fontSize: 13, fontWeight: '600', color: '#EF4444' },
  downloadBtn: {
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: 'rgba(59,130,246,0.12)',
    alignItems: 'center',
    marginTop: 4,
  },
  downloadBtnText: { fontSize: 14, fontWeight: '700', color: '#3B82F6' },
  downloadingText: { fontSize: 13, color: '#3B82F6' },
  routeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 4,
  },
  routeLabel: { fontSize: 12, color: colors.textMuted },
  routeValue: { fontSize: 12, fontWeight: '600', color: colors.textPrimary },
});
