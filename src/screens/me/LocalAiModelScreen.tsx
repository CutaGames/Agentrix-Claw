import React, { useCallback, useEffect, useRef, useState } from 'react';
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
import {
  MobileLocalInferenceService,
  type MobileLocalRuntimeCapabilities,
} from '../../services/mobileLocalInference.service';
import { OtaModelDownloadService, type DownloadProgress } from '../../services/otaModelDownload.service';

interface LocalModelInfo {
  id: string;
  name: string;
  descriptionEn: string;
  descriptionZh: string;
  tier: string;
  recommended?: boolean;
}

const AVAILABLE_MODELS: LocalModelInfo[] = [
  {
    id: 'gemma-4-2b',
    name: 'Gemma 4 E2B',
    descriptionEn: 'Base 3.1 GB model plus a 986 MB multimodal projector. Full package enables local text and image turns; local audio file input only turns on when the runtime reports wav/mp3 support.',
    descriptionZh: '3.1 GB 基础模型外加 986 MB 多模态投影器。完整包下载后可在端侧处理文本和图片轮次；音频文件输入仅在运行时确认支持 wav/mp3 时启用。',
    tier: 'LOCAL',
    recommended: true,
  },
  {
    id: 'gemma-4-4b',
    name: 'Gemma 4 E4B',
    descriptionEn: 'Higher quality local Gemma package with the same multimodal projector bundle. Better reasoning, but it needs more RAM and still keeps heavy tool orchestration in the cloud path.',
    descriptionZh: '更高质量的本地 Gemma 包，包含同样的多模态投影器。推理更强，但更吃内存，重工具编排仍保留云端路径。',
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
  const setLocalAiModelId = useSettingsStore((s) => s.setLocalAiModelId);
  const setLocalAiProgress = useSettingsStore((s) => s.setLocalAiProgress);
  const selectedModelId = useSettingsStore((s) => s.selectedModelId);
  const setSelectedModel = useSettingsStore((s) => s.setSelectedModel);
  const [bridgeAvailable, setBridgeAvailable] = useState<boolean | null>(null);
  const [runtimeCapabilities, setRuntimeCapabilities] = useState<MobileLocalRuntimeCapabilities | null>(null);
  const [downloadSpeed, setDownloadSpeed] = useState('');
  const [downloadEta, setDownloadEta] = useState('');
  const pauseStateRef = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    void MobileLocalInferenceService.isAvailable(localAiModelId).then((available) => {
      if (!cancelled) {
        setBridgeAvailable(available);
      }
    });

    void MobileLocalInferenceService.getCapabilities({ model: localAiModelId })
      .then((capabilities) => {
        if (!cancelled) {
          setRuntimeCapabilities(capabilities);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setRuntimeCapabilities(MobileLocalInferenceService.getDeclaredCapabilities({ model: localAiModelId }));
        }
      });

    // Check if model already downloaded on mount
    const downloaded = OtaModelDownloadService.isModelDownloaded(localAiModelId);
    if (downloaded && localAiStatus !== 'ready') {
      setLocalAiStatus('ready');
      setLocalAiEnabled(true);
      setLocalAiProgress(100);
    }

    return () => {
      cancelled = true;
    };
  }, [localAiModelId, localAiStatus, setLocalAiEnabled, setLocalAiProgress, setLocalAiStatus]);

  const formatSpeed = (bps: number): string => {
    if (bps > 1_000_000) return `${(bps / 1_000_000).toFixed(1)} MB/s`;
    if (bps > 1_000) return `${(bps / 1_000).toFixed(0)} KB/s`;
    return `${bps.toFixed(0)} B/s`;
  };

  const formatEta = (seconds: number): string => {
    if (seconds > 3600) return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
    if (seconds > 60) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
    return `${seconds}s`;
  };

  const handleDownload = useCallback((modelId: string) => {
    setLocalAiModelId(modelId);
    setLocalAiStatus('downloading');
    setLocalAiProgress(0);
    setDownloadSpeed('');
    setDownloadEta('');

    void OtaModelDownloadService.startDownload(modelId, {
      onProgress: (progress: DownloadProgress) => {
        setLocalAiProgress(progress.percent);
        if (progress.speedBps > 0) {
          setDownloadSpeed(formatSpeed(progress.speedBps));
        }
        if (progress.etaSeconds > 0) {
          setDownloadEta(formatEta(progress.etaSeconds));
        }
        if (progress.state === 'verifying') {
          setLocalAiProgress(99);
        }
      },
      onComplete: () => {
        setLocalAiProgress(100);
        setLocalAiStatus('ready');
        setLocalAiEnabled(true);
        setSelectedModel(modelId);
        setDownloadSpeed('');
        setDownloadEta('');
        Alert.alert(
          t({ en: 'Download Complete', zh: '下载完成' }),
          t({ en: 'Local AI package is ready. Text and supported image turns can stay on-device; audio file input enables automatically if the runtime exposes wav/mp3 support.', zh: '本地 AI 完整包已就绪。文本和受支持的图片轮次可留在端侧；若运行时暴露 wav/mp3 支持，音频文件输入也会自动启用。' }),
        );
      },
      onError: (error: string) => {
        setLocalAiStatus('error');
        setLocalAiProgress(0);
        setDownloadSpeed('');
        setDownloadEta('');
        Alert.alert(
          t({ en: 'Download Failed', zh: '下载失败' }),
          error,
        );
      },
    });
  }, [setLocalAiEnabled, setLocalAiModelId, setLocalAiProgress, setLocalAiStatus, setSelectedModel, t]);

  const handlePause = useCallback(async () => {
    const state = await OtaModelDownloadService.pauseDownload();
    if (state) {
      pauseStateRef.current = state;
      setLocalAiStatus('not_downloaded');
    }
  }, [setLocalAiStatus]);

  const handleResume = useCallback(() => {
    if (!pauseStateRef.current) return;
    setLocalAiStatus('downloading');
    void OtaModelDownloadService.resumeDownload(pauseStateRef.current, {
      onProgress: (progress: DownloadProgress) => {
        setLocalAiProgress(progress.percent);
        if (progress.speedBps > 0) setDownloadSpeed(formatSpeed(progress.speedBps));
        if (progress.etaSeconds > 0) setDownloadEta(formatEta(progress.etaSeconds));
      },
      onComplete: () => {
        setLocalAiProgress(100);
        setLocalAiStatus('ready');
        setLocalAiEnabled(true);
        setSelectedModel(localAiModelId);
        pauseStateRef.current = null;
      },
      onError: (error: string) => {
        setLocalAiStatus('error');
        Alert.alert(t({ en: 'Resume Failed', zh: '恢复失败' }), error);
      },
    });
  }, [localAiModelId, setLocalAiEnabled, setLocalAiProgress, setLocalAiStatus, setSelectedModel, t]);

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
            OtaModelDownloadService.deleteModel(localAiModelId);
            setLocalAiStatus('not_downloaded');
            setLocalAiProgress(0);
            setLocalAiEnabled(false);
          },
        },
      ],
    );
  }, [localAiModelId, setLocalAiEnabled, setLocalAiProgress, setLocalAiStatus, t]);

  const currentModel = AVAILABLE_MODELS.find((m) => m.id === localAiModelId) ?? AVAILABLE_MODELS[0];
  const currentPackageReady = OtaModelDownloadService.areRequiredArtifactsDownloaded(localAiModelId);
  const currentModelEntry = OtaModelDownloadService.getModelEntry(localAiModelId);
  const currentPackageSize = OtaModelDownloadService.getPackageSizeLabel(localAiModelId);

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

        {localAiStatus === 'downloading' && (downloadSpeed || downloadEta) && (
          <View style={styles.downloadMeta}>
            {downloadSpeed ? <Text style={styles.downloadMetaText}>⚡ {downloadSpeed}</Text> : null}
            {downloadEta ? <Text style={styles.downloadMetaText}>⏱️ {downloadEta}</Text> : null}
            <TouchableOpacity onPress={handlePause} style={styles.pauseBtn}>
              <Text style={styles.pauseBtnText}>{t({ en: 'Pause', zh: '暂停' })}</Text>
            </TouchableOpacity>
          </View>
        )}

        {pauseStateRef.current && localAiStatus === 'not_downloaded' && (
          <TouchableOpacity onPress={handleResume} style={styles.resumeBtn}>
            <Text style={styles.resumeBtnText}>▶️ {t({ en: 'Resume Download', zh: '继续下载' })}</Text>
          </TouchableOpacity>
        )}

        {localAiStatus === 'ready' && (
          <View style={styles.readyInfo}>
            <Text style={styles.readyModel}>{currentModel.name}</Text>
            <Text style={styles.readyDesc}>
              {t({
                en: currentPackageReady
                  ? 'On-device package is active. Text is local, image turns stay local when runtime vision is enabled, and speech playback still uses the local TTS path until a vocoder package exists.'
                  : 'Base text model is active, but the multimodal projector add-on is still missing. Tap upgrade to finish the local image package.',
                zh: currentPackageReady
                  ? '端侧完整包已激活。文本可本地处理，图片轮次会在运行时视觉能力开启后留在端侧；语音播报暂时仍走本地 TTS 路径，等待后续 vocoder 包。'
                  : '基础文本模型已激活，但多模态投影器附件还未补齐。点击升级即可补完本地图片能力。',
              })}
            </Text>
            <Text style={styles.readyMeta}>{t({ en: `Full package size: ${currentPackageSize}`, zh: `完整包大小：${currentPackageSize}` })}</Text>
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

      <View style={styles.card}>
        <Text style={styles.cardTitle}>{t({ en: 'Local Multimodal Surface', zh: '本地多模态能力面' })}</Text>
        <View style={styles.routeRow}>
          <Text style={styles.routeLabel}>{t({ en: 'Image input', zh: '图片输入' })}</Text>
          <Text style={styles.routeValue}>
            {runtimeCapabilities?.supportsVisionInput
              ? t({ en: '📷 Local ready', zh: '📷 端侧可用' })
              : currentModelEntry?.multimodalProjector
                ? (currentPackageReady
                  ? t({ en: '⏳ Runtime not exposing vision yet', zh: '⏳ 运行时暂未暴露视觉能力' })
                  : t({ en: '⬇️ Download projector add-on', zh: '⬇️ 需下载投影器附件' }))
                : t({ en: '—', zh: '—' })}
          </Text>
        </View>
        <View style={styles.routeRow}>
          <Text style={styles.routeLabel}>{t({ en: 'Audio file input', zh: '音频文件输入' })}</Text>
          <Text style={styles.routeValue}>
            {runtimeCapabilities?.supportsAudioInput
              ? t({ en: '🎙️ Local ready (wav/mp3)', zh: '🎙️ 端侧可用（wav/mp3）' })
              : t({ en: '☁️ Still falls back to cloud/STT path', zh: '☁️ 仍回退到云端/STT 路径' })}
          </Text>
        </View>
        <View style={styles.routeRow}>
          <Text style={styles.routeLabel}>{t({ en: 'Audio output surface', zh: '音频输出面' })}</Text>
          <Text style={styles.routeValue}>
            {runtimeCapabilities?.supportsAudioOutput
              ? t({ en: '🔊 Model-native ready', zh: '🔊 模型原生可用' })
              : t({ en: '🗣️ Local TTS playback for now', zh: '🗣️ 当前仍走本地 TTS 播放' })}
          </Text>
        </View>
      </View>

      {/* Available models */}
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>{t({ en: 'Available Models', zh: '可用模型' })}</Text>
      </View>

      {AVAILABLE_MODELS.map((model) => {
        const packageReady = OtaModelDownloadService.areRequiredArtifactsDownloaded(model.id);
        const modelDownloaded = OtaModelDownloadService.isModelDownloaded(model.id);
        const packageSize = OtaModelDownloadService.getPackageSizeLabel(model.id);
        const modelEntry = OtaModelDownloadService.getModelEntry(model.id);
        const canUpgradePackage = modelDownloaded && !packageReady;

        return (
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
              {t({ en: model.descriptionEn, zh: model.descriptionZh })}
            </Text>
            <View style={styles.modelMeta}>
              <Text style={styles.metaText}>📦 {packageSize}</Text>
              <Text style={styles.metaText}>⚡ {model.tier}</Text>
              <Text style={styles.metaText}>💰 {t({ en: 'Free', zh: '免费' })}</Text>
              {modelEntry?.multimodalProjector ? <Text style={styles.metaText}>{t({ en: '🖼️ mmproj included', zh: '🖼️ 含 mmproj' })}</Text> : null}
            </View>

            {localAiModelId === model.id && localAiStatus === 'ready' && !canUpgradePackage ? (
              <View style={styles.modelActions}>
                <TouchableOpacity style={styles.activeBtn} disabled>
                  <Text style={styles.activeBtnText}>✅ {t({ en: 'Active', zh: '已激活' })}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.deleteBtn} onPress={handleDelete}>
                  <Text style={styles.deleteBtnText}>{t({ en: 'Delete', zh: '删除' })}</Text>
                </TouchableOpacity>
              </View>
            ) : localAiModelId === model.id && localAiStatus === 'ready' && canUpgradePackage ? (
              <View style={styles.modelActions}>
                <TouchableOpacity style={styles.activeBtn} disabled>
                  <Text style={styles.activeBtnText}>{t({ en: 'Text Ready', zh: '文本已就绪' })}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.downloadBtnCompact} onPress={() => handleDownload(model.id)}>
                  <Text style={styles.downloadBtnText}>{t({ en: 'Upgrade to Full Package', zh: '升级到完整包' })}</Text>
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
                  ⬇️ {canUpgradePackage
                    ? t({ en: 'Upgrade to Full Package', zh: '升级到完整包' })
                    : t({ en: `Download (${packageSize})`, zh: `下载 (${packageSize})` })}
                </Text>
              </TouchableOpacity>
            )}
          </View>
        );
      })}

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
          <Text style={styles.routeLabel}>{t({ en: 'Image turns', zh: '图片轮次' })}</Text>
          <Text style={styles.routeValue}>
            {runtimeCapabilities?.supportsVisionInput
              ? `📱 ${currentModel.name}`
              : t({ en: '☁️ Cloud / upgrade required', zh: '☁️ 云端 / 需升级完整包' })}
          </Text>
        </View>
        <View style={styles.routeRow}>
          <Text style={styles.routeLabel}>{t({ en: 'Audio file turns', zh: '音频文件轮次' })}</Text>
          <Text style={styles.routeValue}>
            {runtimeCapabilities?.supportsAudioInput
              ? `📱 ${currentModel.name} (wav/mp3)`
              : t({ en: '☁️ Cloud / STT path', zh: '☁️ 云端 / STT 路径' })}
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
  readyMeta: { fontSize: 11, color: colors.textMuted },
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
  downloadBtnCompact: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 10,
    backgroundColor: 'rgba(59,130,246,0.12)',
    alignItems: 'center',
  },
  downloadBtnText: { fontSize: 14, fontWeight: '700', color: '#3B82F6' },
  downloadingText: { fontSize: 13, color: '#3B82F6' },
  downloadMeta: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  downloadMetaText: { fontSize: 11, color: colors.textMuted },
  pauseBtn: {
    marginLeft: 'auto',
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 6,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  pauseBtnText: { fontSize: 11, fontWeight: '600', color: colors.textMuted },
  resumeBtn: {
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: 'rgba(59,130,246,0.12)',
    alignItems: 'center',
  },
  resumeBtnText: { fontSize: 13, fontWeight: '700', color: '#3B82F6' },
  routeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 4,
  },
  routeLabel: { fontSize: 12, color: colors.textMuted },
  routeValue: { fontSize: 12, fontWeight: '600', color: colors.textPrimary },
});
