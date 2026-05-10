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
import { isLiveSpeechRecognitionAvailable } from '../../services/liveSpeech.service';
import { OtaModelDownloadService, type DownloadProgress } from '../../services/otaModelDownload.service';
import { RealtimeMicrophoneService } from '../../services/realtimeMicrophone.service';

interface DownloadRequestOptions {
  repair?: boolean;
}

interface LocalModelInfo {
  id: string;
  name: string;
  parameters?: string;
  description?: string;
  descriptionEn: string;
  descriptionZh: string;
  tier: string;
  recommended?: boolean;
}

const AVAILABLE_MODELS: LocalModelInfo[] = [
  {
    id: 'gemma-4-2b',
    name: 'Gemma 4 E2B',
    descriptionEn: 'Base 3.1 GB model plus a 986 MB multimodal projector. Full package enables local text and image turns. Realtime voice can still stay on-device through speech recognition -> local text; wav/mp3 audio-file turns only unlock when the runtime exposes direct audio support.',
    descriptionZh: '3.1 GB 基础模型外加 986 MB 多模态投影器。完整包下载后可在端侧处理文本和图片轮次。实时语音输入仍可先走端侧语音识别再喂给本地文本轮次；而 wav/mp3 音频文件轮次只有在运行时暴露直连音频能力后才会启用。',
    tier: 'LOCAL',
    recommended: true,
  },
  {
    id: 'gemma-4-4b',
    name: 'Gemma 4 E4B',
    descriptionEn: 'Higher quality local Gemma package with the same multimodal projector bundle. Better reasoning, but it needs more RAM; realtime voice still routes through on-device speech recognition -> local text, while heavy tool orchestration remains in the cloud path.',
    descriptionZh: '更高质量的本地 Gemma 包，包含同样的多模态投影器。推理更强，但更吃内存；实时语音仍会先走端侧语音识别再进入本地文本轮次，重工具编排则继续保留云端路径。',
    tier: 'LOCAL',
  },
  {
    id: 'qwen3.5-omni-light',
    name: 'Qwen 3.5 Omni Light (Beta)',
    parameters: '～3B',
    description: '端侧多模态对话模型（占位，等待官方 GGUF 发布）',
    descriptionEn: 'Preview local multimodal model package. The registry entry is prepared, but the official GGUF release is still pending.',
    descriptionZh: '预览版端侧多模态模型包。下载注册表已预置，但仍在等待官方 GGUF 发布。',
    tier: 'LOCAL BETA',
  },
  {
    id: 'qwen2.5-omni-3b',
    name: 'Qwen 2.5 Omni 3B',
    descriptionEn: 'Audio-first local multimodal package. The full bundle adds wav/mp3 audio input plus a real on-device speech-output stack (OuteTTS + WavTokenizer) instead of the old Expo speech fallback.',
    descriptionZh: '音频优先的本地多模态包。补齐完整包后，除 wav/mp3 音频输入外，还会带上真实端侧语音输出栈（OuteTTS + WavTokenizer），不再只是旧的 Expo 语音回退。',
    tier: 'LOCAL AUDIO',
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

function statusLabel(
  status: LocalAiStatus,
  t: ReturnType<typeof useI18n>['t'],
  options: {
    modelDownloaded?: boolean;
    packageReady?: boolean;
  } = {},
): string {
  switch (status) {
    case 'ready':
      return options.modelDownloaded && !options.packageReady
        ? t({ en: 'Text Ready', zh: '文本已就绪' })
        : t({ en: 'Ready', zh: '已就绪' });
    case 'downloading': return t({ en: 'Downloading...', zh: '下载中...' });
    case 'error': return t({ en: 'Runtime Blocked', zh: '运行时阻断' });
    default: return t({ en: 'Not Downloaded', zh: '未下载' });
  }
}

export function LocalAiModelScreen() {
  const { t } = useI18n();
  const localAiStatus = useSettingsStore((s) => s.localAiStatus);
  const localAiProgress = useSettingsStore((s) => s.localAiProgress);
  const localAiModelId = useSettingsStore((s) => s.localAiModelId);
  const setLocalAiEnabled = useSettingsStore((s) => s.setLocalAiEnabled);
  const setLocalAiStatus = useSettingsStore((s) => s.setLocalAiStatus);
  const setLocalAiModelId = useSettingsStore((s) => s.setLocalAiModelId);
  const setLocalAiProgress = useSettingsStore((s) => s.setLocalAiProgress);
  const setSelectedModel = useSettingsStore((s) => s.setSelectedModel);
  const [liveVoiceInputAvailable, setLiveVoiceInputAvailable] = useState(false);
  const [downloadSpeed, setDownloadSpeed] = useState('');
  const [downloadEta, setDownloadEta] = useState('');
  const [downloadArtifactKey, setDownloadArtifactKey] = useState<DownloadProgress['currentArtifactKey']>();
  const [downloadArtifactFilename, setDownloadArtifactFilename] = useState('');
  const [downloadArtifactIndex, setDownloadArtifactIndex] = useState(0);
  const [downloadArtifactCount, setDownloadArtifactCount] = useState(0);

  useEffect(() => {
    const downloaded = OtaModelDownloadService.isModelDownloaded(localAiModelId);
    const artifactStatuses = OtaModelDownloadService.getArtifactStatuses(localAiModelId);
    const downloadedBytes = artifactStatuses.reduce((sum, item) => sum + (item.downloaded ? item.sizeBytes : 0), 0);
    const totalBytes = artifactStatuses.reduce((sum, item) => sum + item.sizeBytes, 0);
    const packagePercent = totalBytes > 0 ? Math.round((downloadedBytes / totalBytes) * 100) : 0;

    if (localAiStatus !== 'downloading') {
      if (!downloaded) {
        if (localAiStatus !== 'not_downloaded') {
          setLocalAiStatus('not_downloaded');
        }
        setLocalAiEnabled(false);
        setLocalAiProgress(0);
      } else if (localAiStatus === 'error') {
        setLocalAiEnabled(false);
        setLocalAiProgress(packagePercent);
      } else {
        if (localAiStatus !== 'ready') {
          setLocalAiStatus('ready');
        }
        setLocalAiEnabled(true);
        setLocalAiProgress(packagePercent);
      }
    }

    setLiveVoiceInputAvailable(
      RealtimeMicrophoneService.isAvailable() || isLiveSpeechRecognitionAvailable(),
    );
  }, [localAiModelId, localAiStatus, setLocalAiEnabled, setLocalAiProgress, setLocalAiStatus]);

  const getArtifactLabel = useCallback((key?: DownloadProgress['currentArtifactKey']) => {
    switch (key) {
      case 'model':
        return t({ en: 'Base model', zh: '基础模型' });
      case 'multimodalProjector':
        return t({ en: 'Multimodal projector (vision)', zh: '多模态投影器（图像）' });
      case 'audioEncoder':
        return t({ en: 'Audio encoder (whisper-base, for voice input)', zh: '音频编码器（whisper-base，语音输入用）' });
      case 'audioOutputModel':
        return t({ en: 'Speech model', zh: '语音模型' });
      case 'vocoder':
        return t({ en: 'Vocoder', zh: '声码器' });
      default:
        return '';
    }
  }, [t]);

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

  const formatPackageBytes = (bytes: number): string => {
    if (bytes >= 1_000_000_000) return `${(bytes / 1_000_000_000).toFixed(1)} GB`;
    if (bytes >= 1_000_000) return `${Math.round(bytes / 1_000_000)} MB`;
    if (bytes >= 1_000) return `${Math.round(bytes / 1_000)} KB`;
    return `${bytes} B`;
  };

  const handleDownload = useCallback((modelId: string, options: DownloadRequestOptions = {}) => {
    const repairRequested = !!options.repair;

    setLocalAiModelId(modelId);
    setLocalAiStatus('downloading');
    setLocalAiProgress(0);
    setDownloadSpeed('');
    setDownloadEta('');
    setDownloadArtifactKey(undefined);
    setDownloadArtifactFilename('');
    setDownloadArtifactIndex(0);
    setDownloadArtifactCount(0);

    void OtaModelDownloadService.startDownload(modelId, {
      onProgress: (progress: DownloadProgress) => {
        setLocalAiProgress(progress.percent);
        setDownloadArtifactKey(progress.currentArtifactKey);
        setDownloadArtifactFilename(progress.currentArtifactFilename || '');
        setDownloadArtifactIndex(progress.currentArtifactIndex || 0);
        setDownloadArtifactCount(progress.artifactCount || 0);
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
        setDownloadSpeed('');
        setDownloadEta('');
        setDownloadArtifactKey(undefined);
        setDownloadArtifactFilename('');
        setDownloadArtifactIndex(0);
        setDownloadArtifactCount(0);
        setLocalAiStatus('ready');
        setLocalAiEnabled(true);
        setSelectedModel(modelId);
        Alert.alert(
          repairRequested
            ? t({ en: 'Repair Complete', zh: '修复完成' })
            : t({ en: 'Download Complete', zh: '下载完成' }),
          t({
            en: 'The model files are fully on disk now. Agentrix will initialize the native runtime lazily on the first real local turn instead of forcing a self-check immediately after download.',
            zh: '模型文件现在已经完整落盘。Agentrix 不会再在下载结束后立刻强制自检，而会在第一次真正的本地轮次发生时再初始化原生运行时。',
          }),
        );
      },
      onError: (error: string) => {
        const modelDownloaded = OtaModelDownloadService.isModelDownloaded(modelId);
        const artifactStatuses = OtaModelDownloadService.getArtifactStatuses(modelId);
        const downloadedBytes = artifactStatuses.reduce((sum, item) => sum + (item.downloaded ? item.sizeBytes : 0), 0);
        const totalBytes = artifactStatuses.reduce((sum, item) => sum + item.sizeBytes, 0);
        const packagePercent = totalBytes > 0 ? Math.round((downloadedBytes / totalBytes) * 100) : 0;

        setLocalAiStatus(modelDownloaded ? 'ready' : 'error');
        setLocalAiEnabled(modelDownloaded);
        setLocalAiProgress(modelDownloaded ? packagePercent : 0);
        setDownloadSpeed('');
        setDownloadEta('');
        setDownloadArtifactKey(undefined);
        setDownloadArtifactFilename('');
        setDownloadArtifactIndex(0);
        setDownloadArtifactCount(0);
        Alert.alert(
          repairRequested
            ? t({ en: 'Repair Download Failed', zh: '修复下载失败' })
            : t({ en: 'Download Failed', zh: '下载失败' }),
          error,
        );
      },
    }, {
      forceRedownload: repairRequested,
    });
  }, [setLocalAiEnabled, setLocalAiModelId, setLocalAiProgress, setLocalAiStatus, setSelectedModel, t]);

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
            setDownloadArtifactKey(undefined);
            setDownloadArtifactFilename('');
            setDownloadArtifactIndex(0);
            setDownloadArtifactCount(0);
          },
        },
      ],
    );
  }, [localAiModelId, setLocalAiEnabled, setLocalAiProgress, setLocalAiStatus, t]);

  const currentModel = AVAILABLE_MODELS.find((m) => m.id === localAiModelId) ?? AVAILABLE_MODELS[0];
  const currentArtifactStatuses = OtaModelDownloadService.getArtifactStatuses(localAiModelId);
  const currentPackageReady = OtaModelDownloadService.areRequiredArtifactsDownloaded(localAiModelId);
  const currentModelDownloaded = OtaModelDownloadService.isModelDownloaded(localAiModelId);
  const currentModelEntry = OtaModelDownloadService.getModelEntry(localAiModelId);
  const currentDeclaredCapabilities = OtaModelDownloadService.getDeclaredCapabilities(localAiModelId);
  const currentPackageSize = OtaModelDownloadService.getPackageSizeLabel(localAiModelId);
  const startupInvalidatedArtifactKeys = OtaModelDownloadService.getStartupInvalidatedArtifactKeys(localAiModelId);
  const startupInvalidatedArtifactLabels = startupInvalidatedArtifactKeys
    .map((key) => getArtifactLabel(key))
    .filter(Boolean);
  const missingAddOnBytes = [
    !OtaModelDownloadService.isMultimodalProjectorDownloaded(localAiModelId)
      ? currentModelEntry?.multimodalProjector?.sizeBytes || 0
      : 0,
    !OtaModelDownloadService.isAudioOutputModelDownloaded(localAiModelId)
      ? currentModelEntry?.audioOutputModel?.sizeBytes || 0
      : 0,
    !OtaModelDownloadService.isVocoderDownloaded(localAiModelId)
      ? currentModelEntry?.vocoder?.sizeBytes || 0
      : 0,
  ].reduce((sum, value) => sum + value, 0);
  const missingAddOnSizeLabel = missingAddOnBytes > 0 ? formatPackageBytes(missingAddOnBytes) : '';
  const missingSurfaceLabelsEn = [
    !OtaModelDownloadService.isMultimodalProjectorDownloaded(localAiModelId) ? 'local image turns' : null,
    currentDeclaredCapabilities.audioInput && !OtaModelDownloadService.isMultimodalProjectorDownloaded(localAiModelId)
      ? 'local wav/mp3 turns'
      : null,
    !OtaModelDownloadService.hasOnDeviceAudioOutputAssets(localAiModelId) && currentDeclaredCapabilities.onDeviceAudioOutput
      ? 'on-device speech output'
      : null,
  ].filter(Boolean).join(', ');
  const missingSurfaceLabelsZh = [
    !OtaModelDownloadService.isMultimodalProjectorDownloaded(localAiModelId) ? '本地图片轮次' : null,
    currentDeclaredCapabilities.audioInput && !OtaModelDownloadService.isMultimodalProjectorDownloaded(localAiModelId)
      ? '本地 wav/mp3 音频轮次'
      : null,
    !OtaModelDownloadService.hasOnDeviceAudioOutputAssets(localAiModelId) && currentDeclaredCapabilities.onDeviceAudioOutput
      ? '端侧语音输出'
      : null,
  ].filter(Boolean).join('、');
  const canUpgradeCurrentPackage = currentModelDownloaded && !currentPackageReady && missingAddOnBytes > 0 && localAiStatus !== 'downloading';
  const runtimeUnavailableWithDownloadedModel = currentModelDownloaded && localAiStatus === 'error';
  const canRepairCurrentPackage = localAiStatus === 'error' && currentModelDownloaded;
  const currentArtifactLabel = getArtifactLabel(downloadArtifactKey);

  return (
    <ScrollView testID="local-ai-model-screen" style={styles.container} contentContainerStyle={styles.content}>
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
      <View style={styles.card} testID="local-ai-status-card">
        <View style={styles.statusRow} testID="local-ai-status-row">
          <View style={[styles.statusDot, { backgroundColor: statusColor(localAiStatus) }]} />
          <Text testID="local-ai-status-label" style={styles.statusText}>
            {statusLabel(localAiStatus, t, {
              modelDownloaded: currentModelDownloaded,
              packageReady: currentPackageReady,
            })}
          </Text>
          {localAiStatus === 'downloading' && (
            <Text testID="local-ai-progress-text" style={styles.progressText}>{localAiProgress}%</Text>
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
          </View>
        )}

        {localAiStatus === 'downloading' && currentArtifactLabel ? (
          <Text testID="local-ai-current-artifact" style={styles.downloadArtifactText}>
            {t({ en: 'Current file', zh: '当前文件' })}: {currentArtifactLabel}
            {downloadArtifactCount > 0 ? ` (${downloadArtifactIndex}/${downloadArtifactCount})` : ''}
            {downloadArtifactFilename ? ` · ${downloadArtifactFilename}` : ''}
          </Text>
        ) : null}

        <View style={styles.artifactList}>
          {currentArtifactStatuses.map((artifact) => {
            const isCurrentArtifact = localAiStatus === 'downloading' && artifact.key === downloadArtifactKey;
            const artifactLabel = getArtifactLabel(artifact.key);
            const statusText = artifact.downloaded
              ? t({ en: '已完成', zh: '已完成' })
              : isCurrentArtifact
                ? t({ en: '下载中', zh: '下载中' })
                : t({ en: '待下载', zh: '待下载' });

            return (
              <View key={artifact.key} style={styles.artifactRow} testID={`local-ai-artifact-${artifact.key}`}>
                <Text style={styles.artifactLabel}>
                  {artifact.downloaded ? '✅' : isCurrentArtifact ? '⬇️' : '⏳'} {artifactLabel}
                </Text>
                <Text style={styles.artifactMeta}>{artifact.sizeLabel} · {statusText}</Text>
              </View>
            );
          })}
        </View>

        {startupInvalidatedArtifactLabels.length > 0 && currentModelDownloaded && !currentPackageReady && localAiStatus !== 'downloading' && (
          <Text style={styles.warningText}>
            {t({
              en: `On the last app start, Agentrix invalidated ${startupInvalidatedArtifactLabels.join(', ')} because the downloaded file could not be re-validated against the expected local package. Re-download the missing add-on once on this build.`,
              zh: `上次启动时，Agentrix 把 ${startupInvalidatedArtifactLabels.join('、')} 判成了无效安装，因为它没能重新通过本地包校验。请在这个构建里把缺失附件重下一次。`,
            })}
          </Text>
        )}

        {localAiStatus === 'downloading' && (
          <Text style={styles.downloadHintText}>
            {t({
              en: 'Agentrix still downloads the package as one queue, but the status above now shows which file is being fetched. Gemma needs both the base GGUF and the projector file for local image turns.',
              zh: '当前仍按一个下载队列顺序拉取，但上面会明确显示正在下哪个文件。Gemma 要本地处理图片，必须同时具备基础 GGUF 和投影器文件。',
            })}
          </Text>
        )}

        {localAiStatus === 'ready' && (
          <View style={styles.readyInfo} testID="local-ai-ready-info">
            <Text testID="local-ai-ready-model" style={styles.readyModel}>{currentModel.name}</Text>
            <Text style={styles.readyDesc}>
              {t({
                en: currentPackageReady
                  ? 'The required local files are on disk. Agentrix now initializes the native runtime lazily on the first real local turn, instead of forcing it at download time.'
                  : `Base text is active, but add-ons are still missing. Agentrix blocks ${missingSurfaceLabelsEn || 'the unfinished local surfaces'} until you finish the remaining package instead of silently switching them back to the cloud.`,
                zh: currentPackageReady
                  ? '所需本地文件已经全部落盘。Agentrix 现在会把原生运行时初始化延后到第一次真实的本地轮次，而不是在下载结束瞬间强拉。'
                  : `基础文本能力已激活，但剩余附件还没补齐。${missingSurfaceLabelsZh || '未完成的本地能力面'} 会继续被直接拦截，Agentrix 不会再偷偷切回云端。`,
              })}
            </Text>
            <Text style={styles.readyMeta}>{t({ en: `Full package size: ${currentPackageSize}`, zh: `完整包大小：${currentPackageSize}` })}</Text>
          </View>
        )}

        {localAiStatus === 'error' && runtimeUnavailableWithDownloadedModel && (
          <Text testID="local-ai-runtime-blocked-message" style={styles.warningText}>
            {t({
              en: 'The files are on disk, but a real local turn already failed to initialize the runtime on this device. Use repair to re-fetch the package, and keep the latest diagnostics for the next failure if it still happens.',
              zh: '文件虽然已经落盘，但这台设备在真实本地轮次里仍然初始化运行时失败。请先用“修复并重下”重新拉包；如果仍失败，保留最新诊断日志继续定位。',
            })}
          </Text>
        )}
      </View>

      {canRepairCurrentPackage && (
        <View style={styles.upgradeCard} testID="local-ai-repair-card">
          <Text style={styles.upgradeTitle}>{t({ en: 'Repair the on-device package', zh: '修复端侧模型包' })}</Text>
          <Text style={styles.upgradeDesc}>
            {t({
              en: 'Repair deletes the current local files, downloads the latest package revision again, and keeps the next runtime failure easier to diagnose.',
              zh: '修复会先删除当前本地文件，再重新下载最新包版本，并让下一次运行时失败更容易定位。',
            })}
          </Text>
          <TouchableOpacity testID="local-ai-repair-button" style={styles.upgradePrimaryBtn} onPress={() => handleDownload(localAiModelId, { repair: true })}>
            <Text style={styles.upgradePrimaryBtnText}>{t({ en: `Repair and Re-download (${currentPackageSize})`, zh: `修复并重下（${currentPackageSize}）` })}</Text>
          </TouchableOpacity>
        </View>
      )}

      {canUpgradeCurrentPackage && (
        <View style={styles.upgradeCard} testID="local-ai-upgrade-card">
          <Text style={styles.upgradeTitle}>{t({ en: 'Finish the remaining local add-ons', zh: '补齐剩余本地附件' })}</Text>
          <Text style={styles.upgradeDesc}>
            {t({
              en: `${currentModel.name} still has ${missingAddOnSizeLabel} of add-ons left. Download them to unlock ${missingSurfaceLabelsEn}. Until then, Agentrix blocks those local surfaces instead of silently switching them to the cloud or Expo speech.`,
              zh: `${currentModel.name} 还差 ${missingAddOnSizeLabel} 的附件未下载。补齐后才能解锁 ${missingSurfaceLabelsZh}。在此之前，Agentrix 会继续直接拦截这些本地能力面，不会再偷偷切到云端或 Expo 语音。`,
            })}
          </Text>
          <TouchableOpacity testID="local-ai-upgrade-addons-button" style={styles.upgradePrimaryBtn} onPress={() => handleDownload(localAiModelId)}>
            <Text style={styles.upgradePrimaryBtnText}>{t({ en: `Download remaining add-ons (${missingAddOnSizeLabel})`, zh: `下载剩余附件（${missingAddOnSizeLabel}）` })}</Text>
          </TouchableOpacity>
        </View>
      )}

      <View style={styles.card}>
        <Text style={styles.cardTitle}>{t({ en: 'Local Multimodal Surface', zh: '本地多模态能力面' })}</Text>
        <View style={styles.routeRow}>
          <Text style={styles.routeLabel}>{t({ en: 'Image input', zh: '图片输入' })}</Text>
          <Text style={styles.routeValue}>
            {currentModelEntry?.multimodalProjector
              ? (currentPackageReady && localAiStatus !== 'error'
                ? t({ en: '📷 Files ready; first local image turn will initialize vision lazily', zh: '📷 文件已齐；第一次本地图片轮次时再懒加载视觉能力' })
                : currentPackageReady
                  ? t({ en: '⛔ Files are present, but the runtime already failed on this device', zh: '⛔ 文件虽在，但该设备上的运行时已经失败过' })
                  : t({ en: '⬇️ Download projector add-on to unlock local image turns', zh: '⬇️ 需下载投影器附件后才能本地处理图片' }))
              : t({ en: '—', zh: '—' })}
          </Text>
        </View>
        <View style={styles.routeRow}>
          <Text style={styles.routeLabel}>{t({ en: 'Audio file input', zh: '音频文件输入' })}</Text>
          <Text style={styles.routeValue}>
            {currentDeclaredCapabilities.audioInput
                ? (currentPackageReady
                  ? (localAiStatus === 'error'
                    ? t({ en: '⛔ Files are present, but this device failed runtime initialization already', zh: '⛔ 文件已在本机，但该设备上的运行时已经初始化失败' })
                    : t({ en: '🎙️ Files ready; direct audio turns depend on runtime support on first use', zh: '🎙️ 文件已齐；首次使用时是否直连音频仍取决于运行时支持' }))
                  : t({ en: '⬇️ Download the full projector bundle to unlock local wav/mp3 audio turns', zh: '⬇️ 需补齐完整投影器包后才能解锁本地 wav/mp3 音频轮次' }))
                : t({ en: '⛔ This model family stays text/image-only on-device', zh: '⛔ 该模型族在端侧仅支持文本/图片，不支持本地音频输入' })}
          </Text>
        </View>
        <View style={styles.routeRow}>
          <Text style={styles.routeLabel}>{t({ en: 'Realtime voice input', zh: '实时语音输入' })}</Text>
          <Text style={styles.routeValue}>
            {liveVoiceInputAvailable
              ? t({
                en: localAiStatus === 'ready'
                  ? `🎤 On-device speech recognition ready -> transcripts can feed ${currentModel.name} local text turns`
                  : '🎤 On-device speech recognition is available; once the local text runtime is ready, hold-to-talk can stay on-device as text',
                zh: localAiStatus === 'ready'
                  ? `🎤 端侧实时语音识别可用 -> 转写结果可直接交给 ${currentModel.name} 的本地文本轮次`
                  : '🎤 端侧实时语音识别已可用；待本地文本运行时就绪后，按住说话即可先本地转写再走端侧文本轮次',
              })
              : t({ en: '⛔ This device build is not exposing realtime speech recognition yet', zh: '⛔ 当前设备/构建暂未暴露实时语音识别' })}
          </Text>
        </View>
        <View style={styles.routeRow}>
          <Text style={styles.routeLabel}>{t({ en: 'Audio output surface', zh: '音频输出面' })}</Text>
          <Text style={styles.routeValue}>
            {currentDeclaredCapabilities.onDeviceAudioOutput
                ? t({ en: '⬇️ Download the speech-output add-ons to unlock the local vocoder path', zh: '⬇️ 需下载语音输出附件后才能解锁本地 vocoder 链路' })
                : t({ en: '🗣️ Device speech fallback for now', zh: '🗣️ 当前先走设备语音回退' })}
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
          <View key={model.id} style={[styles.modelCard, localAiModelId === model.id && styles.modelCardSelected]} testID={`local-ai-model-card-${model.id}`}>
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
              {modelEntry && OtaModelDownloadService.declaresAudioInput(model.id) ? <Text style={styles.metaText}>{t({ en: '🎙️ audio in', zh: '🎙️ 含音频输入' })}</Text> : null}
              {modelEntry && OtaModelDownloadService.declaresOnDeviceAudioOutput(model.id) ? <Text style={styles.metaText}>{t({ en: '🔊 speech out', zh: '🔊 含语音输出' })}</Text> : null}
            </View>

            {localAiModelId === model.id && localAiStatus === 'ready' && !canUpgradePackage ? (
              <View style={styles.modelActions}>
                <TouchableOpacity testID={`local-ai-active-button-${model.id}`} style={styles.activeBtn} disabled>
                  <Text style={styles.activeBtnText}>✅ {t({ en: 'Active', zh: '已激活' })}</Text>
                </TouchableOpacity>
                <TouchableOpacity testID={`local-ai-delete-button-${model.id}`} style={styles.deleteBtn} onPress={handleDelete}>
                  <Text style={styles.deleteBtnText}>{t({ en: 'Delete', zh: '删除' })}</Text>
                </TouchableOpacity>
              </View>
            ) : localAiModelId === model.id && localAiStatus === 'ready' && canUpgradePackage ? (
              <View style={styles.modelActions}>
                <TouchableOpacity testID={`local-ai-partial-ready-button-${model.id}`} style={styles.activeBtn} disabled>
                  <Text style={styles.activeBtnText}>{t({ en: 'Text Ready', zh: '文本已就绪' })}</Text>
                </TouchableOpacity>
                <TouchableOpacity testID={`local-ai-download-button-${model.id}`} style={styles.downloadBtnCompact} onPress={() => handleDownload(model.id)}>
                  <Text style={styles.downloadBtnText}>{t({ en: 'Upgrade to Full Package', zh: '升级到完整包' })}</Text>
                </TouchableOpacity>
                <TouchableOpacity testID={`local-ai-delete-button-${model.id}`} style={styles.deleteBtn} onPress={handleDelete}>
                  <Text style={styles.deleteBtnText}>{t({ en: 'Delete', zh: '删除' })}</Text>
                </TouchableOpacity>
              </View>
            ) : localAiModelId === model.id && localAiStatus === 'error' ? (
              <View style={styles.modelActions}>
                <TouchableOpacity testID={`local-ai-download-button-${model.id}`} style={styles.downloadBtnCompact} onPress={() => handleDownload(model.id, { repair: true })}>
                  <Text style={styles.downloadBtnText}>{t({ en: 'Repair and Re-download', zh: '修复并重下' })}</Text>
                </TouchableOpacity>
                <TouchableOpacity testID={`local-ai-delete-button-${model.id}`} style={styles.deleteBtn} onPress={handleDelete}>
                  <Text style={styles.deleteBtnText}>{t({ en: 'Delete', zh: '删除' })}</Text>
                </TouchableOpacity>
              </View>
            ) : localAiModelId === model.id && localAiStatus === 'downloading' ? (
              <View style={styles.modelActions} testID={`local-ai-downloading-${model.id}`}>
                <ActivityIndicator size="small" color="#3B82F6" />
                <Text style={styles.downloadingText}>
                  {t({ en: 'Downloading...', zh: '下载中...' })} {localAiProgress}%
                  {downloadArtifactKey ? ` · ${getArtifactLabel(downloadArtifactKey)}` : ''}
                </Text>
              </View>
            ) : (
              <TouchableOpacity
                testID={`local-ai-download-button-${model.id}`}
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
          <Text style={styles.routeLabel}>{t({ en: 'Short text turns', zh: '简短文本轮次' })}</Text>
          <Text style={styles.routeValue}>
            {localAiStatus === 'ready'
              ? t({ en: `📱 ${currentModel.name} (when you select it in chat)`, zh: `📱 ${currentModel.name}（需在聊天中手动选中）` })
              : localAiStatus === 'error'
                ? t({ en: '⛔ Blocked until runtime/package issues are fixed', zh: '⛔ 需先修复运行时/模型包问题' })
                : t({ en: `☁️ Use a cloud model until the local package is ready`, zh: '☁️ 本地包就绪前请继续使用云端模型' })}
          </Text>
        </View>
        <View style={styles.routeRow}>
          <Text style={styles.routeLabel}>{t({ en: 'Image turns', zh: '图片轮次' })}</Text>
          <Text style={styles.routeValue}>
            {currentPackageReady && localAiStatus === 'ready'
              ? t({ en: `📱 ${currentModel.name}`, zh: `📱 ${currentModel.name}` })
              : t({ en: '⛔ Blocked until the projector/full package is ready', zh: '⛔ 补齐投影器/完整包前会被直接拦截' })}
          </Text>
        </View>
        <View style={styles.routeRow}>
          <Text style={styles.routeLabel}>{t({ en: 'Audio file turns', zh: '音频文件轮次' })}</Text>
          <Text style={styles.routeValue}>
            {currentDeclaredCapabilities.audioInput && currentPackageReady && localAiStatus === 'ready'
              ? t({ en: `📱 ${currentModel.name} (wav/mp3)`, zh: `📱 ${currentModel.name}（wav/mp3）` })
              : currentDeclaredCapabilities.audioInput
                ? t({ en: '⛔ Blocked until the full package and runtime audio path are both ready', zh: '⛔ 补齐完整包并暴露运行时音频链路前会被直接拦截' })
                : t({ en: '⛔ This local model family does not provide audio-file turns', zh: '⛔ 该本地模型族不提供音频文件轮次' })}
          </Text>
        </View>
        <View style={styles.routeRow}>
          <Text style={styles.routeLabel}>{t({ en: 'Hold-to-talk voice turns', zh: '按住说话轮次' })}</Text>
          <Text style={styles.routeValue}>
            {liveVoiceInputAvailable
              ? (localAiStatus === 'ready'
                ? t({ en: `📱 Speech recognition on-device -> ${currentModel.name} text turns`, zh: `📱 端侧语音识别 -> ${currentModel.name} 本地文本轮次` })
                : t({ en: '🎤 Speech recognition is ready; local text routing unlocks after the runtime is ready', zh: '🎤 语音识别已可用；本地文本运行时就绪后即可接入端侧路由' }))
              : t({ en: '⛔ Blocked until this device exposes realtime speech recognition', zh: '⛔ 需等待当前设备暴露实时语音识别能力' })}
          </Text>
        </View>
        <View style={styles.routeRow}>
          <Text style={styles.routeLabel}>{t({ en: 'Unsupported turns', zh: '不支持的轮次' })}</Text>
          <Text style={styles.routeValue}>{t({ en: '⛔ Blocked until you switch models manually', zh: '⛔ 会被直接拦截，需手动切到云端模型' })}</Text>
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
  downloadArtifactText: { fontSize: 11, color: '#93C5FD', lineHeight: 16 },
  artifactList: { gap: 6 },
  artifactRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  artifactLabel: { flex: 1, fontSize: 11, color: colors.textPrimary },
  artifactMeta: { fontSize: 11, color: colors.textMuted },
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
  downloadHintText: { fontSize: 11, color: colors.textMuted, lineHeight: 16 },
  upgradeCard: {
    backgroundColor: 'rgba(59,130,246,0.08)',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(59,130,246,0.22)',
    padding: 16,
    gap: 10,
  },
  upgradeTitle: { fontSize: 15, fontWeight: '700', color: colors.textPrimary },
  upgradeDesc: { fontSize: 12, color: colors.textMuted, lineHeight: 18 },
  upgradePrimaryBtn: {
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: 'rgba(59,130,246,0.16)',
    alignItems: 'center',
  },
  upgradePrimaryBtnText: { fontSize: 14, fontWeight: '700', color: '#3B82F6' },
  routeRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    paddingVertical: 6,
  },
  routeLabel: { flex: 1, fontSize: 12, color: colors.textMuted },
  routeValue: { flex: 1, fontSize: 12, fontWeight: '600', color: colors.textPrimary, textAlign: 'right' },
});
