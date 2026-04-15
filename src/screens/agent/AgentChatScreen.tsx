import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, Image,
  FlatList, KeyboardAvoidingView, Platform, ActivityIndicator, Alert, Modal, ScrollView, Linking,
  Dimensions, Animated,
} from 'react-native';
import { useRoute, useNavigation, useFocusEffect, RouteProp } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Swipeable } from 'react-native-gesture-handler';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { colors } from '../../theme/colors';
import { useAuthStore } from '../../stores/authStore';
import { useSettingsStore, SUPPORTED_MODELS, type ModelOption, type LocalAiStatus } from '../../stores/settingsStore';
import { streamProxyChatSSE, streamDirectClaude } from '../../services/realtime.service';
import { getInstanceStatus, sendAgentMessage, switchInstanceModel } from '../../services/openclaw.service';
import { DeviceBridgingService } from '../../services/deviceBridging.service';
import { API_BASE } from '../../config/env';
import { useTokenQuota } from '../../hooks/useTokenQuota';
import { useVoiceSession } from '../../hooks/useVoiceSession';
import type { AgentStackParamList } from '../../navigation/types';
import * as Haptics from 'expo-haptics';
import { mmkv } from '../../stores/mmkvStorage';
import { useI18n } from '../../stores/i18nStore';
import DesktopDiscoveryBanner from '../../components/DesktopDiscoveryBanner';
import { VoiceOnboardingTooltip } from '../../components/VoiceOnboardingTooltip';
import { ChatSessionTabs, loadSessions, saveSessions, MAX_SESSIONS, type ChatSession } from '../../components/ChatSessionTabs';
import { uploadChatAttachment, apiFetch, syncLocalConversation, type UploadedChatAttachment } from '../../services/api';
import { mapRawInstance } from '../../services/auth';
import { fetchLatestDesktopClipboard, type MobileDesktopClipboardSnapshot } from '../../services/desktopSync';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { addVoiceDiagnostic } from '../../services/voiceDiagnostics';
import { getVoiceDiagnosticsText, clearVoiceDiagnostics } from '../../services/voiceDiagnostics';
import { MobileLocalInferenceService, StreamThinkingFilter } from '../../services/mobileLocalInference.service';
import { planLocalVoiceCapabilitySplit } from '../../services/localVoiceCapabilityPlanner.service';
import {
  buildLocalUserContent,
  resolveLocalTurnExecution,
  type LocalTurnExecutionDecision,
} from '../../services/mobileLocalMultimodalRouting.service';
import type { StreamEvent } from '../../../shared/stream-parser';

// expo-av: graceful degrade if missing
let Audio: any = null;
try { Audio = require('expo-av').Audio; } catch (_) {}

async function runSelectionHaptic() {
  if (typeof Haptics.selectionAsync !== 'function') return;
  try {
    await Haptics.selectionAsync();
  } catch {}
}

async function runImpactHaptic(style: Haptics.ImpactFeedbackStyle) {
  if (typeof Haptics.impactAsync !== 'function') return;
  try {
    await Haptics.impactAsync(style);
  } catch {}
}

type RouteT = RouteProp<AgentStackParamList, 'AgentChat'>;

const LOCAL_ONLY_MODEL_IDS = new Set([
  MobileLocalInferenceService.modelId,
  'gemma-4-2b',
  'gemma-4-4b',
  'qwen2.5-omni-3b',
  'gemma-nano-2b',
  'gemma-nano-2b-local',
]);

// ── Token budget estimation for local context management ──
const LOCAL_CONTEXT_WINDOW = 4096;
const LOCAL_RESPONSE_RESERVE = 2048; // n_predict default
const LOCAL_SYSTEM_PROMPT_ESTIMATE = 200; // tokens for enriched system prompt

/** Rough token estimate: ~2 chars/token for mixed CJK/Latin text */
function estimateTokens(text: string): number {
  if (!text) return 0;
  return Math.ceil(text.length / 2);
}

/** Trim history to fit within token budget, keeping most recent messages */
function trimHistoryToTokenBudget(
  history: Array<{ role: string; content: string }>,
  userMessageTokens: number,
): Array<{ role: string; content: string }> {
  const budget = LOCAL_CONTEXT_WINDOW - LOCAL_RESPONSE_RESERVE - LOCAL_SYSTEM_PROMPT_ESTIMATE - userMessageTokens;
  if (budget <= 0) return [];

  const result: Array<{ role: string; content: string }> = [];
  let used = 0;

  // Walk from newest to oldest, accumulate until budget exceeded
  for (let i = history.length - 1; i >= 0; i--) {
    const tokens = estimateTokens(history[i].content);
    if (used + tokens > budget) break;
    result.unshift(history[i]);
    used += tokens;
  }

  return result;
}
const MOBILE_AUTO_CONTINUE_LIMIT = 3;
const MOBILE_CONTINUE_PROMPT = 'Continue from exactly where you stopped. Do not repeat completed content. Preserve the same language, structure, and formatting. If you were in the middle of a tool-driven task, resume the unfinished steps first and only summarize after the task is complete.';

function isLocalOnlyModelId(modelId?: string | null) {
  return !!modelId && LOCAL_ONLY_MODEL_IDS.has(modelId);
}

function getLocalModelLabel(modelId: string) {
  switch (modelId) {
    case 'qwen2.5-omni-3b':
      return 'Qwen 2.5 Omni 3B (Local)';
    case 'gemma-4-4b':
      return 'Gemma 4 E4B (Local)';
    case 'gemma-nano-2b-local':
      return 'Gemma Nano 2B (Local)';
    case 'gemma-nano-2b':
      return 'Gemma Nano 2B (Local)';
    case 'gemma-4-2b':
    default:
      return 'Gemma 4 E2B (Local)';
  }
}

type TranslateFn = ReturnType<typeof useI18n>['t'];

function formatLocalTurnBlockedMessage({
  t,
  modelLabel,
  decision,
}: {
  t: TranslateFn;
  modelLabel: string;
  decision: Extract<LocalTurnExecutionDecision, { mode: 'blocked' }>;
}) {
  const attachmentName = decision.attachment?.originalName || t({ en: 'This attachment', zh: '这个附件' });

  switch (decision.reason) {
    case 'runtime-unavailable':
    case 'text-generation-unavailable':
      return t({
        en: `${modelLabel} is selected, but on-device inference is not ready on this device. Agentrix will not silently fall back to the cloud. Finish the local runtime/package setup or switch to a cloud model manually.`,
        zh: `当前已选 ${modelLabel}，但这台设备上的端侧推理还没有就绪。Agentrix 不会再偷偷回退到云端。请先确认本地运行时和模型包已准备好，或手动切换到云端模型。`,
      });
    case 'projector-required':
      return t({
        en: `${modelLabel} is still text-only on this device. Image turns need the multimodal projector add-on, and Agentrix will block them instead of auto-switching to the cloud. Open Local AI Models and finish the full package download first.`,
        zh: `当前设备上的 ${modelLabel} 仍是纯文本模式。图片轮次需要先补齐多模态投影器，Agentrix 现在会直接拦截，而不是自动切到云端。请先到“本地 AI 模型”页补齐完整包。`,
      });
    case 'audio-input-unavailable':
      return t({
        en: `${modelLabel} does not expose on-device audio file input yet. This turn was blocked instead of falling back to the cloud. Use text input for the local model, or switch models manually.`,
        zh: `当前 ${modelLabel} 还没有暴露端侧音频文件输入能力。本轮已被拦截，不会再自动回退到云端。请改用文本输入，或手动切换模型。`,
      });
    case 'audio-format-unsupported':
      return t({
        en: `${modelLabel} currently accepts local wav/mp3 audio files only. ${attachmentName} will not auto-fallback to the cloud. Re-upload it as wav/mp3, or switch models manually.`,
        zh: `当前 ${modelLabel} 仅接受本地 wav/mp3 音频文件。${attachmentName} 不会自动回退到云端。请改传 wav/mp3，或手动切换模型。`,
      });
    case 'attachment-not-local':
      return t({
        en: `${attachmentName} is missing a device-local file path, so ${modelLabel} cannot read it. Agentrix will not silently send it to the cloud. Re-attach the original local file, or switch models manually.`,
        zh: `${attachmentName} 缺少设备本地文件路径，${modelLabel} 无法读取，Agentrix 也不会再偷偷发到云端。请重新选择原始本地文件，或手动切换模型。`,
      });
    case 'attachment-unsupported':
      return t({
        en: `${modelLabel} currently supports short text plus supported local image/audio inputs. ${attachmentName} cannot run on-device and will not auto-fallback to the cloud. Switch to a cloud model for this turn.`,
        zh: `${modelLabel} 当前只支持简短文本，以及受支持的本地图片和音频输入。${attachmentName} 这类内容暂不支持端侧处理，也不会自动回退到云端。请切到云端模型后再发送。`,
      });
    case 'complex-turn':
    default:
      return t({
        en: `${modelLabel} is limited to short on-device turns. Long prompts, code/tool orchestration, and complex tasks are blocked instead of auto-falling back to the cloud. Switch to a cloud model to continue this request.`,
        zh: `${modelLabel} 目前只处理简短端侧轮次。长文本、代码或工具编排、复杂任务都会被直接拦截，不再自动回退到云端。请切换到云端模型后再继续这次请求。`,
      });
  }
}

interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  attachments?: UploadedChatAttachment[];
  streaming?: boolean;
  error?: boolean;
  createdAt: number;
  thoughts?: string[]; // Added for Thought Chain UI
}

function formatAttachmentSize(size?: number | null) {
  if (!size) return 'Unknown size';
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function buildOutgoingMessageContent(text: string, attachments: UploadedChatAttachment[]) {
  const trimmed = text.trim();
  if (attachments.length === 0) return trimmed;

  const multimodalContent: any[] = [];
  if (trimmed) {
    multimodalContent.push({ type: 'text', text: trimmed });
  }

  attachments.forEach((attachment, index) => {
    const attachmentUrl = attachment.publicUrl || attachment.localUri || '';

    if (attachment.kind === 'image') {
      multimodalContent.push({
        type: 'image',
        source: { type: 'url', url: attachmentUrl },
      });
    } else if (attachment.kind === 'video' || attachment.isVideo || attachment.mimetype?.startsWith('video/')) {
      multimodalContent.push({
        type: 'text',
        text: `[Video Attachment ${index + 1}: ${attachment.originalName}] URL: ${attachmentUrl}`,
      });
    } else if (attachment.mimetype?.startsWith('audio/') || attachment.originalName.match(/\.(mp3|wav|m4a|ogg)$/i)) {
      // Cloud models don't support input_audio — send as text reference
      // Voice audio is transcribed before reaching here in the normal flow;
      // this fallback handles edge cases where raw audio attachments slip through.
      if (attachmentUrl.startsWith('http')) {
        multimodalContent.push({
          type: 'text',
          text: `[Voice Message: ${attachment.originalName}] ${attachmentUrl}`,
        });
      } else {
        multimodalContent.push({
          type: 'text',
          text: `[Voice Message from user]`,
        });
      }
    } else {
      multimodalContent.push({
        type: 'text',
        text: `[Attachment ${index + 1}: ${attachment.originalName}] URL: ${attachmentUrl}`
      });
    }
  });

  return multimodalContent;
}

function serializeMessageForModel(message: Message) {
  const content = buildOutgoingMessageContent(message.content, message.attachments || []);
  if (typeof content === 'string') return content;
  // If array (multimodal), we try to format as text for direct claude fallback
  // The SSE proxy can handle the array directly.
  return typeof message.content === 'string' ? message.content 
    + (message.attachments ? '\n' + message.attachments.map(a => `[Attachment: ${a.publicUrl}]`).join('\n') : '')
    : '[Multimodal Message]';
}

function dedupeUrls(urls: string[]) {
  return [...new Set(urls)];
}

function extractUrlsFromMessage(content: string) {
  const markdownImageUrls = Array.from(content.matchAll(/!\[[^\]]*\]\((https?:\/\/[^)\s]+)\)/g)).map((match) => match[1]);
  const plainUrls = Array.from(content.matchAll(/https?:\/\/[^\s)]+/g)).map((match) => match[0].replace(/[),.;]+$/, ''));
  const allUrls = dedupeUrls([...markdownImageUrls, ...plainUrls]);
  const imageUrls = allUrls.filter((url) => /\.(png|jpe?g|gif|webp|bmp|svg)(\?.*)?$/i.test(url));
  const audioUrls = allUrls.filter((url) => /\.(mp3|wav|m4a|ogg|aac|flac|opus|wma)(\?.*)?$/i.test(url));
  const videoUrls = allUrls.filter((url) => /\.(mp4|webm|mov|m4v)(\?.*)?$/i.test(url));
  const fileUrls = allUrls.filter((url) => !imageUrls.includes(url) && !audioUrls.includes(url) && !videoUrls.includes(url) && /(\/api\/uploads\/|\.(pdf|txt|md|csv|json|docx?|xlsx?|pptx?))(\?.*)?$/i.test(url));
  return { imageUrls, audioUrls, videoUrls, fileUrls };
}

function getCopyableMessageText(message: Message) {
  const attachmentLines = (message.attachments || []).map((attachment) => `${attachment.originalName}: ${attachment.publicUrl || attachment.localUri || ''}`);
  return [message.content.trim(), ...attachmentLines].filter(Boolean).join('\n');
}

function buildDisplayMessageText(content: string) {
  if (!content) return '';

  const { imageUrls, audioUrls, videoUrls, fileUrls } = extractUrlsFromMessage(content);
  let display = content
    .replace(/!\[[^\]]*\]\((https?:\/\/[^)\s]+)\)/g, '')
    .replace(/\[User Attachments\][\s\S]*$/g, '')
    .trim();

  for (const url of [...imageUrls, ...audioUrls, ...videoUrls, ...fileUrls]) {
    display = display.replace(new RegExp(url.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), '');
  }

  return renderContent(display)
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

// Strip basic markdown: **bold** -> bold, *italic* -> italic
function renderContent(text: string) {
  return text
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/\*(.+?)\*/g, '$1')
    .replace(/`(.+?)`/g, '$1');
}

// Inline audio player for audio URLs in messages
const InlineAudioPlayer = ({ uri }: { uri: string }) => {
  const { t } = useI18n();
  const [playing, setPlaying] = useState(false);
  const soundRef = useRef<any>(null);

  const togglePlay = useCallback(async () => {
    if (!Audio) {
      Alert.alert(t({ en: 'Audio Unavailable', zh: '音频不可用' }));
      return;
    }
    try {
      if (playing && soundRef.current) {
        await soundRef.current.stopAsync();
        await soundRef.current.unloadAsync();
        soundRef.current = null;
        setPlaying(false);
        return;
      }
      const { sound } = await Audio.Sound.createAsync({ uri }, { shouldPlay: true });
      soundRef.current = sound;
      setPlaying(true);
      sound.setOnPlaybackStatusUpdate((status: any) => {
        if (status.didJustFinish) {
          sound.unloadAsync();
          soundRef.current = null;
          setPlaying(false);
        }
      });
    } catch (e: any) {
      setPlaying(false);
      Alert.alert(t({ en: 'Playback Error', zh: '播放错误' }), e?.message || '');
    }
  }, [playing, uri, t]);

  useEffect(() => {
    return () => {
      soundRef.current?.unloadAsync().catch(() => {});
    };
  }, []);

  return (
    <TouchableOpacity style={styles.audioPlayerCard} onPress={togglePlay} activeOpacity={0.7}>
      <Text style={styles.audioPlayerIcon}>{playing ? '⏹️' : '▶️'}</Text>
      <View style={styles.audioPlayerMeta}>
        <Text style={styles.audioPlayerLabel}>{playing ? t({ en: 'Playing...', zh: '播放中…' }) : t({ en: 'Audio message', zh: '音频消息' })}</Text>
        <Text style={styles.audioPlayerUrl} numberOfLines={1}>{uri}</Text>
      </View>
    </TouchableOpacity>
  );
};

// ─── Long-press context menu for messages ──────────────────────────────────
const MessageContextMenu = ({
  visible, onClose, message, onQuote, onExportNote, onDeepSearch, onCrossDevice, onCopy,
}: {
  visible: boolean; onClose: () => void; message: Message | null;
  onQuote: () => void; onExportNote: () => void; onDeepSearch: () => void;
  onCrossDevice: () => void; onCopy: () => void;
}) => {
  const { t } = useI18n();
  if (!visible || !message) return null;
  const actions = [
    { icon: '📋', label: t({ en: 'Copy', zh: '复制' }), onPress: onCopy },
    { icon: '💬', label: t({ en: 'Quote & Ask', zh: '引用追问' }), onPress: onQuote },
    { icon: '📝', label: t({ en: 'Save as Note', zh: '导出笔记' }), onPress: onExportNote },
    { icon: '🔍', label: t({ en: 'Deep Search', zh: '深度搜索' }), onPress: onDeepSearch },
    { icon: '💻', label: t({ en: 'Send to Desktop', zh: '发到电脑' }), onPress: onCrossDevice },
  ];
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <TouchableOpacity style={sf.ctxOverlay} onPress={onClose} activeOpacity={1}>
        <BlurView intensity={30} tint="dark" style={sf.ctxMenuWrap}>
          <View style={sf.ctxMenu}>
            <Text style={sf.ctxPreview} numberOfLines={2}>{message.content?.slice(0, 80)}</Text>
            <View style={sf.ctxDivider} />
            {actions.map((a, i) => (
              <TouchableOpacity key={i} style={sf.ctxItem} onPress={() => { a.onPress(); onClose(); }}>
                <Text style={sf.ctxIcon}>{a.icon}</Text>
                <Text style={sf.ctxLabel}>{a.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </BlurView>
      </TouchableOpacity>
    </Modal>
  );
};

// ─── Thought Ribbon (animated light strip for thinking chain) ───────────────
const ThoughtRibbon = ({ thoughts, streaming }: { thoughts: string[]; streaming?: boolean }) => {
  const { t } = useI18n();
  const [expanded, setExpanded] = useState(false);
  const shimmerAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (streaming) {
      const loop = Animated.loop(
        Animated.timing(shimmerAnim, { toValue: 1, duration: 2000, useNativeDriver: true }),
      );
      loop.start();
      return () => loop.stop();
    }
  }, [streaming, shimmerAnim]);

  const shimmerTranslate = shimmerAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [-200, 200],
  });

  return (
    <View style={sf.ribbonWrap}>
      <TouchableOpacity
        style={sf.ribbonHeader}
        onPress={() => setExpanded(!expanded)}
        activeOpacity={0.7}
      >
        <View style={sf.ribbonHeaderLeft}>
          {streaming ? (
            <View style={sf.ribbonShimmerWrap}>
              <Animated.View style={[sf.ribbonShimmer, { transform: [{ translateX: shimmerTranslate }] }]} />
              <ActivityIndicator size="small" color={colors.accent} style={{ transform: [{ scale: 0.55 }] }} />
            </View>
          ) : (
            <Text style={sf.ribbonDoneIcon}>⚡</Text>
          )}
          <Text style={sf.ribbonTitle} numberOfLines={1}>
            {streaming
              ? (thoughts[thoughts.length - 1]?.replace('[Tool Call]', '').trim().slice(0, 40) || t({ en: 'Processing…', zh: '处理中…' }))
              : t({ en: `${thoughts.length} steps`, zh: `${thoughts.length} 步` })}
          </Text>
        </View>
        <Text style={sf.ribbonChevron}>{expanded ? '▾' : '›'}</Text>
      </TouchableOpacity>

      {expanded && (
        <ScrollView style={sf.ribbonBody} nestedScrollEnabled showsVerticalScrollIndicator={false}>
          {thoughts.map((thought, idx) => {
            const isTool = thought.includes('[Tool Call]') || thought.includes('Using skill:') || thought.includes('Searching');
            const isError = thought.includes('Error') || thought.includes('Failed');
            return (
              <View key={idx} style={sf.ribbonStep}>
                <View style={[sf.ribbonStepDot, isTool && { backgroundColor: colors.primary }, isError && { backgroundColor: colors.error }]} />
                <Text style={[sf.ribbonStepText, isError && { color: colors.error }]}>
                  {thought.replace('[Tool Call]', '').trim()}
                </Text>
              </View>
            );
          })}
        </ScrollView>
      )}
    </View>
  );
};

// ─── MessageBubble — Spatial Flow borderless design with swipe actions ──────
const MessageBubble = ({
  item,
  onSpeak,
  onStopSpeaking,
  speakingMessageId,
  onPreviewImage,
  onQuoteMessage,
  onExportNote,
}: {
  item: Message;
  onSpeak: (message: Message) => void;
  onStopSpeaking: () => void;
  speakingMessageId: string | null;
  onPreviewImage: (uri: string) => void;
  onQuoteMessage?: (msg: Message) => void;
  onExportNote?: (msg: Message) => void;
}) => {
  const { t } = useI18n();
  const isUser = item.role === 'user';
  const hasThoughts = item.thoughts && item.thoughts.length > 0;
  const bubbleText = buildDisplayMessageText(item.content) || (item.streaming ? '...' : '');
  const { imageUrls, audioUrls, videoUrls, fileUrls } = extractUrlsFromMessage(item.content || '');
  const canSpeak = !isUser && !!bubbleText && !item.streaming && !item.error;
  const isThisMessageSpeaking = speakingMessageId === item.id;
  const [ctxVisible, setCtxVisible] = useState(false);
  const swipeableRef = useRef<Swipeable>(null);

  const handleCopy = useCallback(async () => {
    const text = getCopyableMessageText(item);
    if (!text) return;
    await DeviceBridgingService.writeClipboard(text);
    void runSelectionHaptic();
    Alert.alert(t({ en: 'Copied', zh: '已复制' }), t({ en: 'Message copied to clipboard.', zh: '消息已复制到剪贴板。' }));
  }, [item, t]);

  const openExternalUrl = useCallback(async (url: string) => {
    try { await Linking.openURL(url); } catch { Alert.alert(t({ en: 'Open Failed', zh: '打开失败' }), url); }
  }, [t]);

  const handleLongPress = useCallback(() => {
    void runImpactHaptic(Haptics.ImpactFeedbackStyle.Medium);
    setCtxVisible(true);
  }, []);

  // Swipe left → Quote & Ask
  const renderLeftActions = useCallback(() => (
    <View style={sf.swipeAction}>
      <Text style={sf.swipeActionIcon}>💬</Text>
      <Text style={sf.swipeActionLabel}>{t({ en: 'Quote', zh: '引用' })}</Text>
    </View>
  ), [t]);

  // Swipe right → Export as note
  const renderRightActions = useCallback(() => (
    <View style={[sf.swipeAction, sf.swipeActionRight]}>
      <Text style={sf.swipeActionIcon}>📝</Text>
      <Text style={sf.swipeActionLabel}>{t({ en: 'Note', zh: '笔记' })}</Text>
    </View>
  ), [t]);

  const handleSwipeLeft = useCallback(() => {
    onQuoteMessage?.(item);
    swipeableRef.current?.close();
  }, [item, onQuoteMessage]);

  const handleSwipeRight = useCallback(() => {
    onExportNote?.(item);
    swipeableRef.current?.close();
  }, [item, onExportNote]);

  const messageContent = (
    <TouchableOpacity
      activeOpacity={0.9}
      onLongPress={handleLongPress}
      delayLongPress={400}
      style={[sf.msgContainer, isUser ? sf.msgContainerUser : sf.msgContainerBot]}
    >
      {/* AI avatar */}
      {!isUser && (
        <View style={sf.botAvatarCol}>
          <LinearGradient
            colors={['#6C5CE7', '#a78bfa']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={sf.avatarGradient}
          >
            <Text style={sf.avatarText}>AX</Text>
          </LinearGradient>
        </View>
      )}

      <View style={{ flex: 1, maxWidth: '100%' }}>
        {/* Thought Ribbon — replaces static thought chain */}
        {!isUser && hasThoughts && (
          <ThoughtRibbon thoughts={item.thoughts!} streaming={item.streaming} />
        )}

        {/* Main message body — borderless */}
        {(bubbleText || item.streaming) && (
          <View
            testID={`chat-message-${item.role}`}
            accessibilityLabel={`chat-message-${item.role}`}
            style={[
              sf.msgBody,
              isUser ? sf.msgBodyUser : sf.msgBodyBot,
              item.error && sf.msgBodyError,
            ]}
          >
            {/* Subtle gradient background for bot messages */}
            {!isUser && !item.error && (
              <LinearGradient
                colors={['rgba(108,92,231,0.06)', 'rgba(0,212,255,0.03)', 'transparent']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={[StyleSheet.absoluteFill, { borderRadius: 16 }]}
              />
            )}

            <Text
              testID={`chat-message-text-${item.role}`}
              accessibilityLabel={`chat-message-text-${item.role}`}
              style={[
                sf.msgText,
                isUser && sf.msgTextUser,
                item.streaming && !item.content && { opacity: 0.6 },
              ]}
              selectable
            >
              {bubbleText}
            </Text>
            {item.streaming && (
              <ActivityIndicator size="small" color={colors.accent} style={{ alignSelf: 'flex-start', marginTop: 4 }} />
            )}

            {/* Inline actions row */}
            {!item.streaming && (canSpeak || !!getCopyableMessageText(item)) && (
              <View style={sf.msgActions}>
                {canSpeak && (
                  <TouchableOpacity style={sf.actionChip} onPress={() => (isThisMessageSpeaking ? onStopSpeaking() : onSpeak(item))}>
                    <Text style={sf.actionChipText}>
                      {isThisMessageSpeaking ? t({ en: '⏹ Stop', zh: '⏹ 停止' }) : t({ en: '▶ Play', zh: '▶ 播放' })}
                    </Text>
                  </TouchableOpacity>
                )}
                {!!getCopyableMessageText(item) && (
                  <TouchableOpacity style={sf.actionChip} onPress={handleCopy}>
                    <Text style={sf.actionChipText}>{t({ en: 'Copy', zh: '复制' })}</Text>
                  </TouchableOpacity>
                )}
              </View>
            )}
          </View>
        )}

        {/* Attachments, images, audio, files — same structure, updated styles */}
        {!!item.attachments?.length && (
          <View style={sf.mediaList}>
            {item.attachments.map((attachment) => (
              <TouchableOpacity
                key={`${item.id}-${attachment.fileName}`}
                style={sf.mediaCard}
                activeOpacity={0.8}
                onPress={() => {
                  const attachmentUri = attachment.localUri || attachment.publicUrl;
                  if (!attachmentUri) return;
                  if (attachment.isImage) {
                    onPreviewImage(attachmentUri);
                    return;
                  }
                  openExternalUrl(attachmentUri);
                }}
              >
                {attachment.isImage ? (
                  <Image source={{ uri: attachment.localUri || attachment.publicUrl }} style={sf.mediaThumb} resizeMode="cover" />
                ) : attachment.isVideo ? (
                  <View style={sf.mediaFileIcon}><Text style={{ fontSize: 20 }}>🎬</Text></View>
                ) : attachment.isAudio ? (
                  <View style={sf.mediaFileIcon}><Text style={{ fontSize: 20 }}>🎵</Text></View>
                ) : (
                  <View style={sf.mediaFileIcon}><Text style={{ fontSize: 20 }}>📎</Text></View>
                )}
                <View style={sf.mediaMeta}>
                  <Text style={sf.mediaName} numberOfLines={1}>{attachment.originalName}</Text>
                  <Text style={sf.mediaSub} numberOfLines={1}>{attachment.mimetype} · {formatAttachmentSize(attachment.size)}</Text>
                </View>
              </TouchableOpacity>
            ))}
          </View>
        )}
        {!!imageUrls.length && (
          <View style={sf.mediaList}>
            {imageUrls.map((url) => (
              <TouchableOpacity key={`${item.id}-${url}`} style={sf.mediaCard} activeOpacity={0.8} onPress={() => onPreviewImage(url)}>
                <Image source={{ uri: url }} style={sf.mediaThumb} resizeMode="cover" />
                <View style={sf.mediaMeta}>
                  <Text style={sf.mediaName} numberOfLines={1}>{t({ en: 'Generated image', zh: '生成图片' })}</Text>
                  <Text style={sf.mediaSub} numberOfLines={1}>{url}</Text>
                </View>
              </TouchableOpacity>
            ))}
          </View>
        )}
        {!!audioUrls.length && (
          <View style={sf.mediaList}>
            {audioUrls.map((url) => (
              <InlineAudioPlayer key={`${item.id}-audio-${url}`} uri={url} />
            ))}
          </View>
        )}
        {!!videoUrls.length && (
          <View style={sf.mediaList}>
            {videoUrls.map((url) => (
              <TouchableOpacity key={`${item.id}-video-${url}`} style={sf.mediaCard} activeOpacity={0.8} onPress={() => openExternalUrl(url)}>
                <View style={sf.mediaFileIcon}><Text style={{ fontSize: 20 }}>🎬</Text></View>
                <View style={sf.mediaMeta}>
                  <Text style={sf.mediaName} numberOfLines={1}>{t({ en: 'Generated video', zh: '生成视频' })}</Text>
                  <Text style={sf.mediaSub} numberOfLines={1}>{url}</Text>
                </View>
              </TouchableOpacity>
            ))}
          </View>
        )}
        {!!fileUrls.length && (
          <View style={sf.mediaList}>
            {fileUrls.map((url) => (
              <TouchableOpacity key={`${item.id}-${url}`} style={sf.mediaCard} activeOpacity={0.8} onPress={() => openExternalUrl(url)}>
                <View style={sf.mediaFileIcon}><Text style={{ fontSize: 20 }}>📎</Text></View>
                <View style={sf.mediaMeta}>
                  <Text style={sf.mediaName} numberOfLines={1}>{t({ en: 'Generated file', zh: '生成文件' })}</Text>
                  <Text style={sf.mediaSub} numberOfLines={1}>{url}</Text>
                </View>
              </TouchableOpacity>
            ))}
          </View>
        )}
      </View>

      {/* Context menu */}
      <MessageContextMenu
        visible={ctxVisible}
        onClose={() => setCtxVisible(false)}
        message={item}
        onCopy={handleCopy}
        onQuote={() => onQuoteMessage?.(item)}
        onExportNote={() => onExportNote?.(item)}
        onDeepSearch={() => {
          const q = item.content?.slice(0, 200);
          if (q) Linking.openURL(`https://www.google.com/search?q=${encodeURIComponent(q)}`).catch(() => {});
        }}
        onCrossDevice={async () => {
          const text = getCopyableMessageText(item);
          if (text) {
            try {
              await DeviceBridgingService.writeClipboard(text);
              Alert.alert(t({ en: 'Sent', zh: '已发送' }), t({ en: 'Copied to shared clipboard for desktop pickup.', zh: '已复制到共享剪贴板，电脑端可接收。' }));
            } catch {}
          }
        }}
      />
    </TouchableOpacity>
  );

  return (
    <Swipeable
      ref={swipeableRef}
      renderLeftActions={renderLeftActions}
      renderRightActions={renderRightActions}
      onSwipeableOpen={(direction) => {
        if (direction === 'left') handleSwipeLeft();
        else handleSwipeRight();
      }}
      overshootLeft={false}
      overshootRight={false}
      friction={2}
    >
      {messageContent}
    </Swipeable>
  );
};

export function AgentChatScreen() {
  const route = useRoute<RouteT>();
  const navigation = useNavigation<any>();
  const { t, language } = useI18n();
  const activeInstance = useAuthStore((s) => s.activeInstance);
  const updateInstance = useAuthStore((s) => s.updateInstance);
  const token = useAuthStore((s) => s.token) || '';
  const instanceId = route.params?.instanceId || activeInstance?.id || '';
  const instanceName = route.params?.instanceName || activeInstance?.name || 'Agent';
  const voiceModeRequested = !!route.params?.voiceMode;
  const duplexModeRequested = !!route.params?.duplexMode;
  const selectedModelId = useSettingsStore((s) => s.selectedModelId);
  const setSelectedModel = useSettingsStore((s) => s.setSelectedModel);
  const localAiStatus = useSettingsStore((s) => s.localAiStatus);
  const localAiModelId = useSettingsStore((s) => s.localAiModelId);
  const setLocalAiStatus = useSettingsStore((s) => s.setLocalAiStatus);
  const setLocalAiEnabled = useSettingsStore((s) => s.setLocalAiEnabled);
  const preferOnDeviceVoice = useSettingsStore((s) => s.preferOnDeviceVoice);
  const setPreferOnDeviceVoice = useSettingsStore((s) => s.setPreferOnDeviceVoice);
  const speechRate = useSettingsStore((s) => s.speechRate);
  const setSpeechRate = useSettingsStore((s) => s.setSpeechRate);
  const [showSettingsSheet, setShowSettingsSheet] = useState(false);
  const [showDiagnostics, setShowDiagnostics] = useState(false);
  const [provisioning, setProvisioning] = useState(false);
  const [remoteClipboard, setRemoteClipboard] = useState<MobileDesktopClipboardSnapshot | null>(null);

  // Dynamic model list from backend (platform default + user's configured providers)
  const [availableModels, setAvailableModels] = useState<ModelOption[]>(SUPPORTED_MODELS);
  // The ACTUAL model this agent is running on (resolved by backend)
  const [resolvedModelLabel, setResolvedModelLabel] = useState<string | null>(null);
  // Per-agent preferred model (from agent account)
  const [agentPreferredModel, setAgentPreferredModel] = useState<string | null>(null);
  const [agentVoiceId, setAgentVoiceId] = useState<string | null>(null);
  // Cached agent context for local model system prompt enrichment
  const localAgentContextRef = useRef<string>('');
  const isLocalModelSelected = isLocalOnlyModelId(selectedModelId);
  const localCapabilityModelId = isLocalModelSelected ? selectedModelId : localAiModelId;
  const localVoiceRuntimeCapabilities = MobileLocalInferenceService.getDeclaredCapabilities({ model: localCapabilityModelId });
  const localVoicePlan = planLocalVoiceCapabilitySplit({
    localModelSelected: isLocalModelSelected,
    preferOnDeviceVoice,
    selectedVoiceId: agentVoiceId,
    runtimeCapabilities: localVoiceRuntimeCapabilities,
  });
  const duplexUsesRealtimeChannel = localVoicePlan.useRealtimeVoiceChannel;
  const remoteResolvedModelId = (!isLocalOnlyModelId(agentPreferredModel) ? agentPreferredModel : null)
    || (!isLocalOnlyModelId(activeInstance?.resolvedModel) ? activeInstance?.resolvedModel : null)
    || (!isLocalOnlyModelId(selectedModelId) ? selectedModelId : null)
    || 'claude-haiku-4-5';
  // The effective model ID to display and send
  const effectiveModelId = isLocalModelSelected
    ? selectedModelId
    : agentPreferredModel || activeInstance?.resolvedModel || selectedModelId;

  const sessionIdRef = useRef<string>(`session-${Date.now()}`);
  const storageKey = `chat_hist_${instanceId}`;
  const draftStorageKey = `chat_draft_${instanceId}`;
  const streamAbortRef = useRef<AbortController | null>(null);
  const autoContinueCountRef = useRef(0);
  const pendingAutoContinuePromptRef = useRef<string | null>(null);
  const pendingAutoContinueReasonRef = useRef<'max_tokens' | 'tool_use' | null>(null);
  const pendingAutoContinueSessionIdRef = useRef<string | null>(null);
  const autoContinueTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Multi-session state
  const [chatSessions, setChatSessions] = useState<ChatSession[]>(() => {
    const saved = loadSessions(instanceId);
    if (saved.length > 0) {
      sessionIdRef.current = saved[0].id;
      return saved;
    }
    const initial: ChatSession = { id: sessionIdRef.current, label: t({ en: 'New Chat', zh: '新对话' }), createdAt: Date.now() };
    return [initial];
  });
  const [activeSessionId, setActiveSessionId] = useState(sessionIdRef.current);

  const [messages, setMessages] = useState<Message[]>([
    {
      id: 'welcome',
      role: 'assistant',
      content: t({ en: `Hi! I'm **${instanceName}**, your personal AI agent. What would you like to do next?`, zh: `你好！我是 **${instanceName}**，你的个人智能体。接下来想让我帮你做什么？` }),
      createdAt: Date.now(),
    },
  ]);
  const [input, setInput] = useState('');
  const [quotedMessage, setQuotedMessage] = useState<Message | null>(null);
  const [sending, setSending] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [showModelPicker, setShowModelPicker] = useState(false);
  const [pendingAttachments, setPendingAttachments] = useState<UploadedChatAttachment[]>([]);
  const [uploadingAttachment, setUploadingAttachment] = useState(false);
  const [showAttachToolbar, setShowAttachToolbar] = useState(false);
  const [previewImageUri, setPreviewImageUri] = useState<string | null>(null);
  const [showCameraModal, setShowCameraModal] = useState(false);
  const [capturingPhoto, setCapturingPhoto] = useState(false);
  const flatListRef = useRef<FlatList>(null);
  const cameraRef = useRef<any>(null);
  const isNearBottomRef = useRef(true);
  const activeAssistantMessageIdRef = useRef<string | null>(null);
  const responseInterruptedRef = useRef(false);
  const handleSendRef = useRef<(overrideText?: string | any, overrideAttachments?: UploadedChatAttachment[]) => Promise<void>>(async () => {});
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  // Token quota for energy bar
  const { data: quota } = useTokenQuota();
  const used = quota?.usedTokens ?? 0;
  const total = quota?.totalQuota ?? 100000;
  const tokenPct = quota?.energyLevel ?? (total > 0 ? Math.min(100, (used / total) * 100) : 0);
  const tokenBarColor = tokenPct > 80 ? '#ef4444' : tokenPct > 50 ? '#f59e0b' : '#22c55e';

  // Offline detection + message queue
  const [isOffline, setIsOffline] = useState(false);
  const isOfflineRef = useRef(false);
  const offlineQueueRef = useRef<Array<{ text: string; attachments: UploadedChatAttachment[] }>>([]);
  const flushingOfflineQueueRef = useRef(false);
  const lastOfflineDiagnosticRef = useRef<string | null>(null);

  // Check connectivity periodically
  useEffect(() => {
    let mounted = true;
    const check = async () => {
      try {
        if (instanceId) {
          const status = await getInstanceStatus(instanceId);
          const normalizedStatus = String(status?.status || '').toLowerCase();
          const nextState = normalizedStatus === 'offline' || normalizedStatus === 'disconnected' || normalizedStatus === 'error';
          const nextDiagnostic = `instance:${instanceId}:${normalizedStatus}`;
          if (lastOfflineDiagnosticRef.current !== nextDiagnostic) {
            lastOfflineDiagnosticRef.current = nextDiagnostic;
            addVoiceDiagnostic('agent-chat', 'instance-status-check', {
              instanceId,
              status: normalizedStatus,
              isOffline: nextState,
            });
          }
          if (mounted) {
            setIsOffline(nextState);
          }
          return;
        }

        const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
        const timeout = setTimeout(() => controller?.abort(), 8000);
        try {
          const res = await fetch(`${API_BASE}/health`, {
            method: 'GET',
            signal: controller?.signal,
          });
          const nextDiagnostic = `api-health:${res.status}`;
          if (lastOfflineDiagnosticRef.current !== nextDiagnostic) {
            lastOfflineDiagnosticRef.current = nextDiagnostic;
            addVoiceDiagnostic('agent-chat', 'api-health-check', {
              status: res.status,
              ok: res.ok,
            });
          }
          if (mounted) setIsOffline(!res.ok);
        } finally {
          clearTimeout(timeout);
        }
      } catch (error) {
        addVoiceDiagnostic('agent-chat', 'connectivity-check-failed', {
          instanceId: instanceId || null,
          error,
        });
        if (mounted) setIsOffline(true);
      }
    };
    check();
    const timer = setInterval(check, 15000);
    return () => { mounted = false; clearInterval(timer); };
  }, [instanceId]);

  useEffect(() => {
    isOfflineRef.current = isOffline;
  }, [isOffline]);

  useEffect(() => {
    if (!token) {
      setRemoteClipboard(null);
      return;
    }

    let cancelled = false;
    const pollDesktopClipboard = async () => {
      try {
        const latest = await fetchLatestDesktopClipboard();
        if (!cancelled) {
          setRemoteClipboard((previous) => {
            if (!latest) return null;
            if (
              previous &&
              previous.deviceId === latest.deviceId &&
              previous.lastSeenAt === latest.lastSeenAt &&
              previous.text === latest.text
            ) {
              return previous;
            }
            return latest;
          });
        }
      } catch {
        if (!cancelled) {
          setRemoteClipboard(null);
        }
      }
    };

    void pollDesktopClipboard();
    const timer = setInterval(pollDesktopClipboard, 15000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [token]);

  // Auto-send queued messages when back online
  useEffect(() => {
    if (isOffline || flushingOfflineQueueRef.current || offlineQueueRef.current.length === 0) return;

    let cancelled = false;
    const flushQueuedMessages = async () => {
      flushingOfflineQueueRef.current = true;
      try {
        while (!cancelled && !isOfflineRef.current && offlineQueueRef.current.length > 0) {
          const item = offlineQueueRef.current.shift();
          if (!item) break;
          await handleSendRef.current(item.text, item.attachments);
        }
      } finally {
        flushingOfflineQueueRef.current = false;
      }
    };

    void flushQueuedMessages();
    return () => {
      cancelled = true;
    };
  }, [isOffline]);

  // Fetch dynamic model list from backend and per-agent model
  useEffect(() => {
    setAgentPreferredModel(null);
    setAgentVoiceId(null);
    setResolvedModelLabel(
      isLocalModelSelected
        ? getLocalModelLabel(selectedModelId)
        : activeInstance?.resolvedModelLabel || null,
    );
    (async () => {
      try {
        const models = await apiFetch<Array<{ id: string; label: string; provider: string; providerId: string; costTier: string; positioning?: string; isDefault?: boolean }>>('/ai-providers/available-models');
        if (Array.isArray(models) && models.length > 0) {
          const cloudModels: ModelOption[] = models.map((m) => ({
            id: m.id,
            label: m.label,
            provider: m.provider,
            icon: m.isDefault ? '🤖' : '💎',
            availability: 'available' as const,
            costTier: m.costTier,
          }));
          // Always prepend local model if downloaded and ready
          if (localAiStatus === 'ready') {
            const localEntry: ModelOption = {
              id: localAiModelId,
              label: `${getLocalModelLabel(localAiModelId)} (端侧)`,
              provider: 'On-device',
              icon: '📱',
              badge: 'Local',
              availability: 'available',
              costTier: 'free',
            };
            setAvailableModels([localEntry, ...cloudModels.filter(m => m.id !== localAiModelId)]);
          } else {
            setAvailableModels(cloudModels);
          }
        }
      } catch {}
      // Load per-agent preferred model from the bound agent account
      try {
        const agentAccountId = activeInstance?.metadata?.agentAccountId || activeInstance?.agentAccountId;
        if (agentAccountId) {
          const { getUnifiedAgent } = await import('../../services/unifiedAgent');
          const agent = await getUnifiedAgent(activeInstance!.id);
          if (agent.defaultModel) {
            setAgentPreferredModel(agent.defaultModel);
          }
          if (agent.metadata?.voice_id) {
            setAgentVoiceId(agent.metadata.voice_id);
          }
          // Build enriched context for local model system prompt
          const contextParts: string[] = [];
          if (agent.personality) {
            contextParts.push(`Personality: ${agent.personality}`);
          }
          if (agent.description) {
            contextParts.push(`Description: ${agent.description}`);
          }
          if (agent.systemPrompt) {
            contextParts.push(`Instructions: ${agent.systemPrompt}`);
          }
          // Fetch installed skills
          try {
            const { getInstanceSkills } = await import('../../services/openclaw.service');
            const skills = await getInstanceSkills(activeInstance!.id);
            const enabledSkills = (skills || []).filter((s) => s.enabled);
            if (enabledSkills.length > 0) {
              contextParts.push(`Installed skills: ${enabledSkills.map((s) => s.name).join(', ')}`);
            }
          } catch {}
          // Fetch recent agent memories
          try {
            const { recallMemories } = await import('../../services/memorySlot.api');
            const memories = await recallMemories({ agentId: activeInstance!.id, limit: 5, scopes: ['agent', 'user'] });
            if (memories?.length > 0) {
              const memSummary = memories.map((m) => `[${m.key}]: ${typeof m.value === 'string' ? m.value.slice(0, 200) : JSON.stringify(m.value).slice(0, 200)}`).join('\n');
              contextParts.push(`Memories:\n${memSummary}`);
            }
          } catch {}
          localAgentContextRef.current = contextParts.join('\n');
        }
      } catch {}
    })();
  }, [
    instanceId,
    activeInstance?.id,
    activeInstance?.metadata?.agentAccountId,
    activeInstance?.resolvedModelLabel,
    isLocalModelSelected,
    localAiModelId,
    localAiStatus,
    selectedModelId,
  ]);

  // Eagerly preload local model context when a local model is selected.
  // Model loading on Android (CPU-only, 3.1GB) takes ~20-30s. By starting
  // the load as soon as the chat screen mounts, the model is warm by the
  // time the user types their first message.
  useEffect(() => {
    if (!isLocalModelSelected) return;
    void MobileLocalInferenceService.isAvailable(effectiveModelId).catch(() => {});
  }, [isLocalModelSelected, effectiveModelId]);

  // All messages (persisted) and visible slice for lazy rendering
  const allMessagesRef = useRef<Message[]>([]);
  const PAGE_SIZE = 15;
  const [loadingOlder, setLoadingOlder] = useState(false);

  const loadOlderMessages = useCallback(() => {
    const all = allMessagesRef.current;
    if (all.length <= messages.length || loadingOlder) return;
    setLoadingOlder(true);
    const currentLen = messages.length;
    const nextSlice = all.slice(Math.max(0, all.length - currentLen - PAGE_SIZE), all.length - currentLen);
    setMessages((prev) => [...nextSlice, ...prev]);
    setLoadingOlder(false);
  }, [messages.length, loadingOlder]);

  // Load chat history on mount — MMKV is synchronous, then try API
  useEffect(() => {
    if (!instanceId) return;
    const raw = mmkv.getString(storageKey);
    if (raw) {
      try {
        const saved: Message[] = JSON.parse(raw);
        if (Array.isArray(saved) && saved.length > 0) {
          allMessagesRef.current = saved;
          // Show only last PAGE_SIZE messages initially
          setMessages(saved.slice(-PAGE_SIZE));
        }
      } catch {}
    }
    const draft = mmkv.getString(draftStorageKey);
    if (draft) setInput(draft);
    loadHistory();
    return () => {
      // Cancel any in-flight stream on unmount
      streamAbortRef.current?.abort();
    };
  }, [draftStorageKey, instanceId, storageKey]);

  // Persist messages to local storage whenever they change
  useEffect(() => {
    if (messages.length > 1) {
      const visibleMessages = messages.filter((m) => !m.streaming);
      const previousAll = allMessagesRef.current.filter((m) => !m.streaming);
      const visibleById = new Map(visibleMessages.map((message) => [message.id, message]));
      const seenIds = new Set<string>();

      const mergedMessages: Message[] = [];
      for (const message of previousAll) {
        const nextMessage = visibleById.get(message.id) ?? message;
        mergedMessages.push(nextMessage);
        seenIds.add(nextMessage.id);
      }

      for (const message of visibleMessages) {
        if (!seenIds.has(message.id)) {
          mergedMessages.push(message);
          seenIds.add(message.id);
        }
      }

      allMessagesRef.current = mergedMessages;
      try { mmkv.set(storageKey, JSON.stringify(mergedMessages.slice(-80))); } catch {}
    }
  }, [messages]);

  useEffect(() => {
    try { mmkv.set(draftStorageKey, input); } catch {}
  }, [draftStorageKey, input]);

  const loadHistory = async () => {
    if (!instanceId || !token) return;
    try {
      setLoadingHistory(true);
      const _acH = new AbortController();
      const _tH = setTimeout(() => _acH.abort(), 6000);
      let resp: Response;
      try {
        resp = await fetch(
          `${API_BASE}/openclaw/proxy/${instanceId}/history?sessionId=${sessionIdRef.current}`,
          { headers: { Authorization: `Bearer ${token}` }, signal: _acH.signal },
        );
      } finally {
        clearTimeout(_tH);
      }
      if (!resp.ok) return;
      const data = await resp.json();
      const historyItems: any[] = Array.isArray(data) ? data : data.messages ?? [];
      if (historyItems.length > 0) {
        const historyMessages: Message[] = historyItems.map((m: any) => ({
          id: m.id || `hist-${Math.random()}`,
          role: m.role,
          content: m.content,
          attachments: Array.isArray(m.attachments) ? m.attachments : undefined,
          createdAt: m.createdAt ? new Date(m.createdAt).getTime() : Date.now(),
        }));
        allMessagesRef.current = historyMessages;
        setMessages(historyMessages.slice(-PAGE_SIZE));
      }
    } catch {
      // Silently ignore — instance may not support history endpoint
    } finally {
      setLoadingHistory(false);
    }
  };

  const handleInsertDesktopClipboard = useCallback(() => {
    if (!remoteClipboard?.text) return;
    setInput((previous) => {
      const next = previous.trim().length > 0
        ? `${previous.trim()}\n\n${remoteClipboard.text}`
        : remoteClipboard.text;
      return next.slice(0, 2000);
    });
    void runSelectionHaptic();
  }, [remoteClipboard]);

  const handleCopyDesktopClipboard = useCallback(async () => {
    if (!remoteClipboard?.text) return;
    await DeviceBridgingService.writeClipboard(remoteClipboard.text);
    void runSelectionHaptic();
    Alert.alert(
      t({ en: 'Desktop Clipboard Copied', zh: '桌面剪贴板已复制' }),
      t({ en: 'The latest desktop clipboard text is now on your phone.', zh: '最新桌面剪贴板内容已复制到手机剪贴板。' }),
    );
  }, [remoteClipboard, t]);

  const scrollToBottom = useCallback((force = false) => {
    if (!force && !isNearBottomRef.current) return;
    setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
  }, []);

  useEffect(() => {
    const lastMessage = messages[messages.length - 1];
    if (!lastMessage) return;
    scrollToBottom(lastMessage.role === 'user');
  }, [messages.length, scrollToBottom]);

  const stopCurrentResponse = useCallback((showInterruptedHint = false) => {
    responseInterruptedRef.current = true;
    if (autoContinueTimerRef.current) {
      clearTimeout(autoContinueTimerRef.current);
      autoContinueTimerRef.current = null;
    }
    pendingAutoContinuePromptRef.current = null;
    pendingAutoContinueReasonRef.current = null;
    pendingAutoContinueSessionIdRef.current = null;
    streamAbortRef.current?.abort();
    streamAbortRef.current = null;
    setSending(false);
    const activeMessageId = activeAssistantMessageIdRef.current;
    if (!activeMessageId) return;

    setMessages((prev) => prev.map((m) => {
      if (m.id !== activeMessageId || !m.streaming) return m;
      if (m.content || m.thoughts?.length) {
        return { ...m, streaming: false };
      }
      return {
        ...m,
        content: showInterruptedHint
          ? t({ en: 'Reply stopped. You can continue speaking.', zh: '当前回复已停止，你可以继续说话。' })
          : m.content,
        streaming: false,
      };
    }));

    activeAssistantMessageIdRef.current = null;
  }, [t]);

  const clearAutoContinueTimer = useCallback(() => {
    if (autoContinueTimerRef.current) {
      clearTimeout(autoContinueTimerRef.current);
      autoContinueTimerRef.current = null;
    }
  }, []);

  const clearPendingAutoContinue = useCallback(() => {
    pendingAutoContinuePromptRef.current = null;
    pendingAutoContinueReasonRef.current = null;
    pendingAutoContinueSessionIdRef.current = null;
  }, []);

  const markAutoContinueNeeded = useCallback((reason: 'max_tokens' | 'tool_use') => {
    pendingAutoContinuePromptRef.current = MOBILE_CONTINUE_PROMPT;
    pendingAutoContinueReasonRef.current = reason;
    pendingAutoContinueSessionIdRef.current = sessionIdRef.current;
  }, []);

  const handleStructuredStreamEvent = useCallback((event: StreamEvent) => {
    if (event.type !== 'done') {
      return;
    }

    if (event.reason === 'max_tokens' || event.reason === 'tool_use') {
      markAutoContinueNeeded(event.reason);
      return;
    }

    clearPendingAutoContinue();
  }, [clearPendingAutoContinue, markAutoContinueNeeded]);

  useEffect(() => () => clearAutoContinueTimer(), [clearAutoContinueTimer]);

  const appendToStreamingMessage = useCallback((msgId: string, chunk: string) => {
    setMessages((prev) =>
      prev.map((m) => {
        if (m.id !== msgId) return m;

        let newContent = m.content + chunk;
        let newThoughts = m.thoughts || [];

        if (chunk.includes('[Tool Call]') || chunk.includes('Thinking...')) {
          newThoughts = [...newThoughts, chunk.trim()];
          return { ...m, thoughts: newThoughts };
        }

        return { ...m, content: newContent };
      })
    );
  }, []);

  const completeStreamingAssistantMessage = useCallback((errorMessage?: string) => {
    const activeMessageId = activeAssistantMessageIdRef.current;
    activeAssistantMessageIdRef.current = null;
    setSending(false);

    if (!activeMessageId) {
      return;
    }

    setMessages((prev) => prev.map((message) => {
      if (message.id !== activeMessageId) {
        return message;
      }
      return {
        ...message,
        content: errorMessage || message.content,
        streaming: false,
        error: !!errorMessage,
      };
    }));
  }, []);

  const beginRealtimeVoiceTurn = useCallback((text: string) => {
    const normalized = text.trim();
    if (!normalized) {
      return;
    }

    const userMsg: Message = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: normalized,
      createdAt: Date.now(),
    };
    const assistantMsgId = `assistant-${Date.now()}`;
    const assistantMsg: Message = {
      id: assistantMsgId,
      role: 'assistant',
      content: '',
      streaming: true,
      createdAt: Date.now(),
    };

    responseInterruptedRef.current = false;
    activeAssistantMessageIdRef.current = assistantMsgId;
    setMessages((prev) => [...prev, userMsg, assistantMsg]);
    setSending(true);

    setChatSessions((prev) => {
      const idx = prev.findIndex((session) => session.id === activeSessionId);
      if (idx >= 0 && (prev[idx].label === t({ en: 'New Chat', zh: '新对话' }) || prev[idx].label === 'New Chat' || prev[idx].label === '新对话')) {
        const updated = [...prev];
        updated[idx] = {
          ...updated[idx],
          label: normalized.slice(0, 24) + (normalized.length > 24 ? '…' : ''),
        };
        saveSessions(instanceId, updated);
        return updated;
      }
      return prev;
    });
  }, [activeSessionId, instanceId, t]);

  const {
    voiceMode,
    setVoiceMode,
    duplexMode,
    setDuplexMode,
    voicePhase,
    setVoicePhase,
    isRecording,
    isSpeaking,
    liveListening,
    liveVoiceVolume,
    transcriptPreview,
    setTranscriptPreview,
    voiceInteractionMode,
    setVoiceInteractionMode,
    autoSpeak,
    setAutoSpeak,
    liveVoiceAvailable,
    liveSpeechPermissionState,
    realtimeConnected,
    sendRealtimeInterrupt,
    speakingMessageId,
    handleVoicePressIn,
    handleVoicePressOut,
    handleVoiceTapToggle,
    speakText,
    stopSpeaking,
    handleSpeakMessage: speakMessageText,
    enqueueStreamedSpeech,
    resetVoicePhaseAfterResponse,
    resumeLiveSpeech,
    sendRealtimeImageFrame,
  } = useVoiceSession({
    token,
    language,
    voiceModeRequested,
    duplexModeRequested,
    agentVoiceId: agentVoiceId || undefined,
    instanceName,
    instanceId,
    isSending: sending,
    useRealtimeChannel: duplexUsesRealtimeChannel,
    realtimeModelId: remoteResolvedModelId,
    preferLocalSpeechRecognition: localVoicePlan.preferLocalSpeechRecognition,
    preferLocalTextToSpeech: localVoicePlan.preferLocalTextToSpeech,
    localModelSelected: isLocalModelSelected,
    localModelId: isLocalModelSelected ? localCapabilityModelId : undefined,
    localAudioInputAvailable: isLocalModelSelected && localVoiceRuntimeCapabilities.supportsAudioInput,
    speechRate,
    onSendMessage: (text, attachments) => {
      void handleSendRef.current(text, attachments);
    },
    onRealtimeUserMessage: beginRealtimeVoiceTurn,
    onRealtimeAssistantChunk: (chunk) => {
      const activeMessageId = activeAssistantMessageIdRef.current;
      if (!activeMessageId) {
        return;
      }
      appendToStreamingMessage(activeMessageId, chunk);
    },
    onRealtimeAssistantResponseEnd: () => {
      completeStreamingAssistantMessage();
    },
    onRealtimeError: (message) => {
      completeStreamingAssistantMessage(message || t({ en: 'Realtime voice reply failed.', zh: '实时语音回复失败。' }));
    },
    onStopCurrentResponse: stopCurrentResponse,
    t,
  });
  const duplexSessionConnected = !duplexUsesRealtimeChannel || realtimeConnected;
  const shouldShowVoiceQuickGuide = voiceMode && (voiceModeRequested || duplexModeRequested || liveSpeechPermissionState === 'denied' || messages.length <= 1);

  // Sync voiceMode/duplexMode when route params change on an already-mounted screen
  // (e.g. floating ball navigates here while this screen is still mounted in the tab).
  useEffect(() => {
    if (voiceModeRequested && !voiceMode) {
      setVoiceMode(true);
    }
    if (duplexModeRequested && !duplexMode) {
      setDuplexMode(true);
    }
  }, [voiceModeRequested, duplexModeRequested, voiceMode, duplexMode, setVoiceMode, setDuplexMode]);

  // Re-sync voice mode when screen gains focus (tab switch).
  // React Navigation may not re-run useEffect dependencies on a tab switch
  // because the component stays mounted. useFocusEffect fires every time the
  // screen comes back into view, ensuring voice params are consumed.
  useFocusEffect(
    React.useCallback(() => {
      if (voiceModeRequested && !voiceMode) {
        addVoiceDiagnostic('agent-chat', 'focus-voice-sync', { voiceModeRequested, duplexModeRequested, voiceMode, duplexMode });
        setVoiceMode(true);
      }
      if (duplexModeRequested && !duplexMode) {
        setDuplexMode(true);
      }
    }, [voiceModeRequested, duplexModeRequested, voiceMode, duplexMode, setVoiceMode, setDuplexMode])
  );

  // Clear stale voiceMode/duplexMode route params after they've been consumed,
  // so returning to this screen later doesn't re-activate voice.
  useEffect(() => {
    if (voiceMode && (voiceModeRequested || duplexModeRequested)) {
      navigation.setParams({ voiceMode: undefined, duplexMode: undefined });
    }
  }, [voiceMode, voiceModeRequested, duplexModeRequested, navigation]);

  // Diagnostic: log render state when voice mode is requested via navigation.
  // This helps debug the white-screen issue (screen navigated but appears blank).
  useEffect(() => {
    if (voiceModeRequested || duplexModeRequested) {
      addVoiceDiagnostic('agent-chat', 'voice-nav-render-state', {
        voiceModeRequested,
        duplexModeRequested,
        voiceMode,
        duplexMode,
        instanceId: instanceId || null,
        hasActiveInstance: !!activeInstance,
        realtimeConnected,
        voicePhase,
        messageCount: messages.length,
        token: token ? 'present' : 'missing',
      });
    }
  }, [voiceModeRequested, duplexModeRequested, voiceMode, duplexMode, instanceId, activeInstance, realtimeConnected, voicePhase, messages.length, token]);

  const handleSpeakMessage = useCallback((message: Message) => {
    const text = buildDisplayMessageText(message.content);
    if (!text) return;
    speakMessageText(text, message.id);
  }, [speakMessageText]);

  // Build conversation history for Claude direct fallback
  const buildHistory = (msgs: Message[], newText: string) =>
    [
      ...msgs
        .filter((m) => (m.role === 'user' || m.role === 'assistant') && m.content.trim())
        .slice(-20)
        .map((m) => ({ role: m.role as 'user' | 'assistant', content: serializeMessageForModel(m) })),
      { role: 'user' as const, content: newText },
    ];

  const enqueueAttachment = useCallback(async (localAttachment: {
    uri: string;
    fileName: string;
    mimeType: string;
  }) => {
    try {
      setUploadingAttachment(true);
      const uploaded = await uploadChatAttachment({
        uri: localAttachment.uri,
        name: localAttachment.fileName,
        type: localAttachment.mimeType,
      });
      setPendingAttachments((prev) => [...prev, uploaded]);
      await runSelectionHaptic();
    } catch (error: any) {
      Alert.alert(t({ en: 'Attachment Error', zh: '附件错误' }), error?.message || t({ en: 'Failed to upload attachment.', zh: '上传附件失败。' }));
    } finally {
      setUploadingAttachment(false);
    }
  }, [t]);

  const removePendingAttachment = useCallback((fileName: string) => {
    setPendingAttachments((prev) => prev.filter((attachment) => attachment.fileName !== fileName));
  }, []);

  const handleSend = async (overrideText?: string | any, overrideAttachments?: UploadedChatAttachment[]) => {
    const rawText = typeof overrideText === 'string' ? overrideText : input;
    const text = rawText.trim();
    const attachments = overrideAttachments ?? pendingAttachments;
    const isSyntheticContinueTurn = text === MOBILE_CONTINUE_PROMPT;
    const shouldDisplayUserTurn = !isSyntheticContinueTurn;
    if ((!text && attachments.length === 0) || sending || uploadingAttachment) return;

    clearAutoContinueTimer();
    clearPendingAutoContinue();
    if (!isSyntheticContinueTurn) {
      autoContinueCountRef.current = 0;
    }

    // Offline: queue the message instead of streaming
    if (isOffline) {
      offlineQueueRef.current.push({ text, attachments });
      const queueMsg: Message = { id: `user-${Date.now()}`, role: 'user', content: text, attachments, createdAt: Date.now() };
      if (shouldDisplayUserTurn) {
        setMessages((prev) => [...prev, queueMsg]);
      }
      setInput('');
      setPendingAttachments([]);
      return;
    }

    const outgoingText = buildOutgoingMessageContent(text, attachments);

    if (voiceMode || voicePhase !== 'idle') {
      setVoicePhase('thinking');
    }

    const userMsg: Message = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: text,
      attachments,
      createdAt: Date.now(),
    };

    const assistantMsgId = `assistant-${Date.now()}`;
    const assistantMsg: Message = {
      id: assistantMsgId,
      role: 'assistant',
      content: '',
      streaming: true,
      createdAt: Date.now(),
    };

    // Capture current messages before state update for history
    const currentMsgs = messages;
    responseInterruptedRef.current = false;
    activeAssistantMessageIdRef.current = assistantMsgId;
    setMessages((prev) => [...prev, ...(shouldDisplayUserTurn ? [userMsg] : []), assistantMsg]);
    setInput('');
    setPendingAttachments([]);
    try { mmkv.delete(draftStorageKey); } catch {}
    setTranscriptPreview('');
    setSending(true);
    streamAbortRef.current?.abort();

    // Auto-label session from first user message
    if (text && shouldDisplayUserTurn) {
      setChatSessions((prev) => {
        const idx = prev.findIndex(s => s.id === activeSessionId);
        if (idx >= 0 && (prev[idx].label === t({ en: 'New Chat', zh: '新对话' }) || prev[idx].label === 'New Chat' || prev[idx].label === '新对话')) {
          const updated = [...prev];
          updated[idx] = { ...updated[idx], label: text.slice(0, 24) + (text.length > 24 ? '…' : '') };
          saveSessions(instanceId, updated);
          return updated;
        }
        return prev;
      });
    }

    try {
      await runSelectionHaptic();

      let streamSucceeded = false;
      let proxyFailureMessage: string | null = null;
      const finishAssistantWithError = (message: string) => {
        resetVoicePhaseAfterResponse();
        enqueueStreamedSpeech('', true);
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantMsgId
              ? { ...m, content: `⚠️ ${message}`, streaming: false, error: true }
              : m
          )
        );
      };
      const localModelLabel = isLocalOnlyModelId(effectiveModelId)
        ? (effectiveModelId === MobileLocalInferenceService.modelId
          ? MobileLocalInferenceService.modelLabel
          : getLocalModelLabel(effectiveModelId))
        : null;
      const localRuntimeCapabilities = isLocalOnlyModelId(effectiveModelId)
        ? await MobileLocalInferenceService.getCapabilities({ model: effectiveModelId }).catch(() => (
          MobileLocalInferenceService.getDeclaredCapabilities({ model: effectiveModelId })
        ))
        : null;
      const localRuntimeSnapshot = isLocalOnlyModelId(effectiveModelId)
        ? (localRuntimeCapabilities || MobileLocalInferenceService.getDeclaredCapabilities({ model: effectiveModelId }))
        : null;
      const localTurnDecision = isLocalOnlyModelId(effectiveModelId) && localRuntimeSnapshot
        ? resolveLocalTurnExecution(text, attachments, localRuntimeSnapshot)
        : null;
      const shouldTryLocalNano = isLocalOnlyModelId(effectiveModelId) && localTurnDecision?.mode === 'local';

      if (localTurnDecision?.mode === 'blocked' && localModelLabel) {
        // All blocked reasons are recoverable — fall through to cloud
        addVoiceDiagnostic('agent-chat', 'local-turn-blocked-fallback-cloud', {
          model: effectiveModelId,
          reason: localTurnDecision.reason,
        });
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantMsgId
              ? { ...m, content: `⏳ ${t({ en: 'Local model unavailable for this turn, switching to cloud...', zh: '本地模型无法处理此轮，正在切换到云端…' })}\n`, streaming: true }
              : m
          )
        );
      }

      if (shouldTryLocalNano) {
        const localAbort = new AbortController();
        streamAbortRef.current = localAbort;
        if (localModelLabel) {
          setResolvedModelLabel(localModelLabel);
        }
        let localAssistantText = '';
        const localUserContent = await buildLocalUserContent(text, attachments, localRuntimeSnapshot || undefined);

        const rawLocalHistory = currentMsgs
          .filter((message) => (message.role === 'user' || message.role === 'assistant') && message.content.trim())
          .map((message) => ({
            role: message.role as 'user' | 'assistant',
            content: message.content,
          }));

        const userTokens = estimateTokens(typeof localUserContent === 'string' ? localUserContent : text);
        const trimmedHistory = trimHistoryToTokenBudget(rawLocalHistory, userTokens);
        const localHistory = await Promise.all(trimmedHistory.map(async (message) => ({
          role: message.role as 'user' | 'assistant',
          content: message.role === 'user'
            ? await buildLocalUserContent(message.content, [], localRuntimeSnapshot || undefined)
            : message.content,
        })));

        resetVoicePhaseAfterResponse();

        try {
          let localProducedOutput = false;
          const thinkFilter = new StreamThinkingFilter();
          const agentContext = localAgentContextRef.current;
          const identityBlock = `You are ${instanceName}. You are NOT Gemini, NOT GPT, NOT Claude — you are ${instanceName}, an Agentrix AI agent running locally on the user’s device. Never claim to be any other model or assistant.`;
          const systemPrompt = agentContext
            ? `${identityBlock}\n${agentContext}\nYou have tools available — use them when needed to help the user. You run locally for privacy and speed. Give complete, thorough answers. Reply in the user's language.`
            : `${identityBlock}\nYou run locally on the user's phone for privacy and speed — no cloud needed. Give complete, thorough answers. Reply in the user's language.`;

          const localMessages: Parameters<typeof MobileLocalInferenceService.generateTextStream>[0] = [
            { role: 'system', content: systemPrompt },
            ...localHistory,
            { role: 'user', content: localUserContent },
          ];

          // Try tool-calling path first (Gemma 3n supports tool calling via llama.rn)
          let toolCallingHandled = false;
          try {
            const { runLocalToolCallingLoop } = await import('../../services/localToolCalling.service');
            const localBridge = (globalThis as { __AGENTRIX_LOCAL_LLM__?: { generateWithTools?: unknown } }).__AGENTRIX_LOCAL_LLM__;
            if (localBridge?.generateWithTools) {
              const toolResult = await runLocalToolCallingLoop(localMessages as any, {
                model: effectiveModelId,
                instanceId: activeInstance?.id,
                agentId: activeInstance?.metadata?.agentAccountId || activeInstance?.id,
                temperature: 0.7,
                maxTokens: 2048,
                onToolCall: (name: string) => {
                  appendToStreamingMessage(assistantMsgId, `\n🔧 ${name}…\n`);
                },
                onToolResult: (name: string) => {
                  addVoiceDiagnostic('agent-chat', 'local-tool-result', { tool: name });
                },
                onStreamToken: (chunk: string) => {
                  const visible = thinkFilter.push(chunk);
                  if (visible) {
                    localProducedOutput = true;
                    streamSucceeded = true;
                    localAssistantText += visible;
                    appendToStreamingMessage(assistantMsgId, visible);
                    enqueueStreamedSpeech(visible);
                  }
                },
                abortSignal: localAbort.signal,
              });
              toolCallingHandled = true;
              // Handle non-streamed response (direct reply or post-tool result)
              if (toolResult.text && !localProducedOutput) {
                const visible = thinkFilter.push(toolResult.text);
                const flushed2 = thinkFilter.flush();
                const finalText = (visible || '') + (flushed2 || '');
                if (finalText) {
                  localProducedOutput = true;
                  streamSucceeded = true;
                  localAssistantText = finalText;
                  appendToStreamingMessage(assistantMsgId, finalText);
                  enqueueStreamedSpeech(finalText);
                }
              }
            }
          } catch (toolError: any) {
            addVoiceDiagnostic('agent-chat', 'tool-calling-fallback', {
              model: effectiveModelId,
              error: toolError?.message || String(toolError),
            });
          }

          // Fallback: plain streaming without tools
          if (!toolCallingHandled) {
            for await (const chunk of MobileLocalInferenceService.generateTextStream(localMessages, { model: effectiveModelId })) {
              if (localAbort.signal.aborted || responseInterruptedRef.current) break;
              if (!chunk) continue;
              const visible = thinkFilter.push(chunk);
              if (!visible) continue;
              localProducedOutput = true;
              streamSucceeded = true;
              localAssistantText += visible;
              appendToStreamingMessage(assistantMsgId, visible);
              enqueueStreamedSpeech(visible);
            }
          }
          // Flush any remaining buffered content
          const flushed = thinkFilter.flush();
          if (flushed) {
            localAssistantText += flushed;
            appendToStreamingMessage(assistantMsgId, flushed);
            enqueueStreamedSpeech(flushed);
          }
          enqueueStreamedSpeech('', true);

          if (responseInterruptedRef.current || localAbort.signal.aborted) {
            return;
          }

          const finalAssistant = localAssistantText.trim();
          if (!localProducedOutput || !finalAssistant) {
            addVoiceDiagnostic('agent-chat', 'local-empty-response', {
              model: effectiveModelId,
            });
            // Clear partial local output and fall through to cloud
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantMsgId
                  ? { ...m, content: `⏳ ${t({ en: 'Local model returned empty, switching to cloud...', zh: '本地模型返回为空，正在切换到云端…' })}\n`, streaming: true }
                  : m
              )
            );
          }

          if (token && finalAssistant) {
            void syncLocalConversation({
              sessionId: sessionIdRef.current,
              messages: [
                { role: 'user', content: text },
                { role: 'assistant', content: finalAssistant },
              ],
              model: effectiveModelId,
              platform: 'mobile',
            });
          }
        } catch (error: any) {
          if (responseInterruptedRef.current || localAbort.signal.aborted) {
            return;
          }

          const localErrorMessage = error?.message || t({ en: 'Local model inference failed.', zh: '本地模型推理失败。' });
          addVoiceDiagnostic('agent-chat', 'local-inference-failed', {
            model: effectiveModelId,
            message: localErrorMessage,
          });
          // Clear partial local output and fall through to cloud
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantMsgId
                ? { ...m, content: `⏳ ${t({ en: `Local failed (${localErrorMessage}), switching to cloud...`, zh: `端侧失败（${localErrorMessage}），正在切换到云端…` })}\n`, streaming: true }
                : m
            )
          );
        }
      }

      // Try OpenClaw proxy first (requires active instance)
      const proxyModelId = isLocalOnlyModelId(effectiveModelId)
        ? remoteResolvedModelId
        : effectiveModelId;
      const localFellBack = isLocalOnlyModelId(effectiveModelId) && !streamSucceeded;
      if (!streamSucceeded && instanceId) {
        // If falling back from local, clear the transitional status and reset content
        if (localFellBack) {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantMsgId ? { ...m, content: '', streaming: true } : m
            )
          );
          setResolvedModelLabel(null); // let cloud resolve its own label
        }
        await new Promise<void>((resolve) => {
          const ac = streamProxyChatSSE({
            instanceId,
            message: outgoingText,
            sessionId: sessionIdRef.current,
            token,
            model: proxyModelId,
            voiceId: agentVoiceId || undefined,
            onEvent: handleStructuredStreamEvent,
            onMeta: (meta) => {
              if (meta.resolvedModelLabel) setResolvedModelLabel(meta.resolvedModelLabel);
            },
            onChunk: (chunk) => {
              streamSucceeded = true;
              resetVoicePhaseAfterResponse();
              appendToStreamingMessage(assistantMsgId, chunk);
              enqueueStreamedSpeech(chunk);
            },
            onDone: () => resolve(),
            onError: (err) => {
              proxyFailureMessage = err || t({ en: 'OpenClaw agent connection failed.', zh: 'OpenClaw 智能体连接失败。' });
              resolve();
            },
          });
          streamAbortRef.current = ac;
        });
      }

      if (responseInterruptedRef.current) return;

      if (!streamSucceeded) {
        if (instanceId) {
          try {
            const proxyResult = await sendAgentMessage(instanceId, outgoingText, sessionIdRef.current, proxyModelId);
            const proxyReply = typeof proxyResult?.reply === 'string'
              ? proxyResult.reply
              : proxyResult?.reply?.content || '';

            if (proxyReply) {
              streamSucceeded = true;
              resetVoicePhaseAfterResponse();
              appendToStreamingMessage(assistantMsgId, proxyReply);
              enqueueStreamedSpeech(proxyReply, true);
              if (proxyResult?.stopReason === 'max_tokens' || proxyResult?.stopReason === 'tool_use') {
                markAutoContinueNeeded(proxyResult.stopReason);
              }
            }
          } catch (error: any) {
            proxyFailureMessage = error?.message || proxyFailureMessage || t({ en: 'OpenClaw agent is unavailable right now.', zh: 'OpenClaw 智能体当前不可用。' });
          }
        }
      }

      if (!streamSucceeded) {
        if (instanceId) {
          const message = proxyFailureMessage || t({ en: 'OpenClaw agent is offline. Reconnect the agent or try again shortly.', zh: 'OpenClaw 智能体当前离线，请重新连接后再试。' });
          addVoiceDiagnostic('agent-chat', 'proxy-send-failed', {
            instanceId,
            message,
          });
          resetVoicePhaseAfterResponse();
          appendToStreamingMessage(assistantMsgId, `⚠️ ${message}`);
        } else {
          const history = buildHistory(
            currentMsgs,
            typeof outgoingText === 'string' ? outgoingText : serializeMessageForModel(userMsg),
          );
          await new Promise<void>((resolve) => {
            const ac = streamDirectClaude({
              messages: history,
              token,
              model: proxyModelId,
              sessionId: sessionIdRef.current,
              onEvent: handleStructuredStreamEvent,
              onChunk: (chunk) => {
                streamSucceeded = true;
                resetVoicePhaseAfterResponse();
                appendToStreamingMessage(assistantMsgId, chunk);
                enqueueStreamedSpeech(chunk);
              },
              onDone: () => resolve(),
              onError: (err) => {
                resetVoicePhaseAfterResponse();
                appendToStreamingMessage(assistantMsgId, `⚠️ ${err || t({ en: 'Could not reach AI service. Check your connection.', zh: '无法连接 AI 服务，请检查网络后重试。' })}`);
                resolve();
              },
            });
            streamAbortRef.current = ac;
          });
        }
      }

      if (responseInterruptedRef.current) return;

      // If stream ran but produced no content, show a friendly error
      setMessages((prev) => {
        let finalContent = '';
        const updated = prev.map((m) => {
          if (m.id !== assistantMsgId) return m;
          if (!m.streaming) {
            finalContent = m.content;
            return m;
          }
          if (!m.content && !m.thoughts?.length) {
            return { ...m, content: t({ en: '⚠️ No response received. Please check your connection or try again.', zh: '⚠️ 暂未收到回复，请检查网络或稍后重试。' }), streaming: false, error: true };
          }
          finalContent = m.content;
          return { ...m, streaming: false };
        });
        if (finalContent && !finalContent.startsWith('⚠️')) {
          enqueueStreamedSpeech('', true);
        }
        return updated;
      });
    } catch (err: any) {
      resetVoicePhaseAfterResponse();
      if (responseInterruptedRef.current) {
        return;
      }
      const rawMsg = err?.message || '';
      const friendlyMsg = rawMsg.includes('UnknownError') || rawMsg.includes('AI service error')
        ? t({ en: 'AI service temporarily unavailable. Please try again or switch to another model.', zh: 'AI 服务暂时不可用，请重试或切换其他模型。' })
        : rawMsg || t({ en: 'Something went wrong', zh: '发生了一些问题' });
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantMsgId
            ? { ...m, content: `⚠️ ${friendlyMsg}`, streaming: false, error: true }
            : m
        )
      );
    } finally {
      if (activeAssistantMessageIdRef.current === assistantMsgId) {
        activeAssistantMessageIdRef.current = null;
      }
      resetVoicePhaseAfterResponse();
      setSending(false);
      streamAbortRef.current = null;

      const autoContinuePrompt = pendingAutoContinuePromptRef.current;
      const autoContinueReason = pendingAutoContinueReasonRef.current;
      const autoContinueSessionId = pendingAutoContinueSessionIdRef.current;
      if (
        !responseInterruptedRef.current
        && autoContinuePrompt
        && autoContinueReason
        && autoContinueSessionId === sessionIdRef.current
        && autoContinueCountRef.current < MOBILE_AUTO_CONTINUE_LIMIT
      ) {
        const scheduledSessionId = autoContinueSessionId;
        autoContinueCountRef.current += 1;
        clearPendingAutoContinue();
        autoContinueTimerRef.current = setTimeout(() => {
          autoContinueTimerRef.current = null;
          if (responseInterruptedRef.current || sessionIdRef.current !== scheduledSessionId) {
            return;
          }
          void handleSendRef.current(autoContinuePrompt, []);
        }, 180);
      } else if (
        autoContinuePrompt
        && autoContinueReason
        && autoContinueSessionId === sessionIdRef.current
        && autoContinueCountRef.current >= MOBILE_AUTO_CONTINUE_LIMIT
      ) {
        clearPendingAutoContinue();
        setMessages((prev) => [
          ...prev,
          {
            id: `assistant-${Date.now()}-continue-hint`,
            role: 'assistant',
            content: autoContinueReason === 'tool_use'
              ? t({ en: '⚠️ The task paused before finishing. Send "Continue" to resume the remaining steps.', zh: '⚠️ 任务在完成前暂停了，发送“继续”即可接着执行剩余步骤。' })
              : t({ en: '⚠️ The reply is still incomplete. Send "Continue" to keep generating.', zh: '⚠️ 回复仍未完成，发送“继续”即可继续生成。' }),
            createdAt: Date.now(),
          },
        ]);
      }

      resumeLiveSpeech();
    }
  };

  handleSendRef.current = handleSend;

  const openModelPicker = () => setShowModelPicker(true);

  const handleDeviceGPS = async () => {
    setShowAttachToolbar(false);
    try {
      const loc = await DeviceBridgingService.getCurrentLocation();
      handleSend(`[System] Current GPS Location:\nLatitude: ${loc.latitude}\nLongitude: ${loc.longitude}\nAccuracy: ${loc.accuracy}m`);
    } catch (e: any) {
      Alert.alert(t({ en: 'Location Error', zh: '定位错误' }), e.message);
    }
  };

  const handleAttachmentAction = () => {
    setShowAttachToolbar((prev) => !prev);
  };

  const openInAppCamera = useCallback(async () => {
    setShowAttachToolbar(false);
    try {
      const permission = cameraPermission?.granted
        ? cameraPermission
        : await requestCameraPermission();

      if (!permission?.granted) {
        Alert.alert(
          t({ en: 'Camera Permission Required', zh: '需要相机权限' }),
          t({ en: 'Allow camera access to take a photo.', zh: '请先授予相机权限后再拍照。' }),
        );
        return;
      }

      setShowCameraModal(true);
    } catch (error: any) {
      Alert.alert(t({ en: 'Camera Error', zh: '拍照错误' }), error?.message || t({ en: 'Failed to open camera.', zh: '打开相机失败。' }));
    }
  }, [cameraPermission, requestCameraPermission, t]);

  const handleCaptureCameraPhoto = useCallback(async () => {
    if (capturingPhoto || !cameraRef.current) return;

    try {
      setCapturingPhoto(true);
      const captured = await cameraRef.current.takePictureAsync({
        quality: 0.8,
        base64: localVoicePlan.relayCameraFramesToRealtime && duplexSessionConnected,
        exif: false,
        skipProcessing: false,
      });

      if (!captured?.uri) {
        return;
      }

      if (captured.base64 && localVoicePlan.relayCameraFramesToRealtime) {
        sendRealtimeImageFrame(captured.base64, 'image/jpeg');
      }

      await enqueueAttachment({
        uri: captured.uri,
        fileName: `photo-${Date.now()}.jpg`,
        mimeType: 'image/jpeg',
      });
      void runSelectionHaptic();
      setShowCameraModal(false);
    } catch (error: any) {
      Alert.alert(t({ en: 'Camera Error', zh: '拍照错误' }), error?.message || t({ en: 'Failed to capture photo.', zh: '拍照失败。' }));
    } finally {
      setCapturingPhoto(false);
    }
  }, [
    capturingPhoto,
    duplexSessionConnected,
    enqueueAttachment,
    localVoicePlan.relayCameraFramesToRealtime,
    sendRealtimeImageFrame,
    t,
  ]);

  const handleAttachCamera = async () => {
    await openInAppCamera();
  };

  const handleAttachAlbum = async () => {
    setShowAttachToolbar(false);
    setShowCameraModal(false);
    try {
      const image = await DeviceBridgingService.pickImageAttachment();
      if (image?.uri) {
        await enqueueAttachment({
          uri: image.uri,
          fileName: image.fileName || `image-${Date.now()}.jpg`,
          mimeType: image.mimeType || 'image/jpeg',
        });
      }
    } catch (e: any) {
      Alert.alert(t({ en: 'Photo Error', zh: '图片错误' }), e.message);
    }
  };

  const handleAttachFile = async () => {
    setShowAttachToolbar(false);
    try {
      const file = await DeviceBridgingService.pickFileAttachment();
      if (file?.uri) {
        await enqueueAttachment({
          uri: file.uri,
          fileName: file.fileName,
          mimeType: file.mimeType,
        });
      }
    } catch (e: any) {
      Alert.alert(t({ en: 'File Error', zh: '文件错误' }), e.message);
    }
  };

  const handleCopyDraft = useCallback(async () => {
    if (!input) return;
    try {
      await DeviceBridgingService.writeClipboard(input);
      void runSelectionHaptic();
      Alert.alert(t({ en: 'Copied', zh: '已复制' }), t({ en: 'Draft copied to clipboard.', zh: '未发送内容已复制到剪贴板。' }));
    } catch (error: any) {
      Alert.alert(t({ en: 'Copy Failed', zh: '复制失败' }), error?.message || t({ en: 'Failed to copy draft.', zh: '复制草稿失败。' }));
    }
  }, [input, t]);

  const handleClearChat = () => {
    Alert.alert(t({ en: 'Start new session?', zh: '开始新会话？' }), t({ en: 'Chat history will be cleared.', zh: '当前聊天记录将被清空。' }), [
      { text: t({ en: 'Cancel', zh: '取消' }), style: 'cancel' },
      {
        text: t({ en: 'New Session', zh: '新会话' }),
        style: 'destructive',
        onPress: () => {
          streamAbortRef.current?.abort();
          sessionIdRef.current = `session-${Date.now()}`;
          try { mmkv.delete(storageKey); } catch {}
          try { mmkv.delete(draftStorageKey); } catch {}
          setInput('');
          setMessages([{
            id: 'welcome',
            role: 'assistant',
            content: t({ en: `Hi! I'm **${instanceName}**, your personal AI agent. What would you like to do next?`, zh: `你好！我是 **${instanceName}**，你的个人智能体。接下来想让我帮你做什么？` }),
            createdAt: Date.now(),
          }]);
          // Update multi-session tracking
          const newSession: ChatSession = { id: sessionIdRef.current, label: t({ en: 'New Chat', zh: '新对话' }), createdAt: Date.now() };
          setChatSessions((prev) => {
            const updated = [newSession, ...prev].slice(0, MAX_SESSIONS);
            saveSessions(instanceId, updated);
            return updated;
          });
          setActiveSessionId(sessionIdRef.current);
        },
      },
    ]);
  };

  // Multi-session: switch to a different session
  const handleSessionSelect = useCallback((sid: string) => {
    if (sid === activeSessionId) return;
    // Save current messages
    try {
      const currentKey = `chat_hist_${instanceId}_${activeSessionId}`;
      mmkv.set(currentKey, JSON.stringify(messages.filter(m => !m.streaming)));
    } catch {}
    // Switch
    streamAbortRef.current?.abort();
    sessionIdRef.current = sid;
    setActiveSessionId(sid);
    // Load messages for new session
    try {
      const newKey = `chat_hist_${instanceId}_${sid}`;
      const raw = mmkv.getString(newKey);
      if (raw) {
        setMessages(JSON.parse(raw));
      } else {
        setMessages([{
          id: 'welcome',
          role: 'assistant',
          content: t({ en: `Hi! I'm **${instanceName}**, your personal AI agent. What would you like to do next?`, zh: `你好！我是 **${instanceName}**，你的个人智能体。接下来想让我帮你做什么？` }),
          createdAt: Date.now(),
        }]);
      }
    } catch {
      setMessages([]);
    }
    setInput('');
  }, [activeSessionId, instanceId, instanceName, messages, t]);

  // Multi-session: create new session
  const handleSessionNew = useCallback(() => {
    if (chatSessions.length >= MAX_SESSIONS) return;
    // Save current messages first
    try {
      const currentKey = `chat_hist_${instanceId}_${activeSessionId}`;
      mmkv.set(currentKey, JSON.stringify(messages.filter(m => !m.streaming)));
    } catch {}
    const newId = `session-${Date.now()}`;
    const newSession: ChatSession = { id: newId, label: t({ en: 'New Chat', zh: '新对话' }), createdAt: Date.now() };
    streamAbortRef.current?.abort();
    sessionIdRef.current = newId;
    setActiveSessionId(newId);
    setChatSessions((prev) => {
      const updated = [newSession, ...prev].slice(0, MAX_SESSIONS);
      saveSessions(instanceId, updated);
      return updated;
    });
    setMessages([{
      id: 'welcome',
      role: 'assistant',
      content: t({ en: `Hi! I'm **${instanceName}**, your personal AI agent. What would you like to do next?`, zh: `你好！我是 **${instanceName}**，你的个人智能体。接下来想让我帮你做什么？` }),
      createdAt: Date.now(),
    }]);
    setInput('');
  }, [activeSessionId, chatSessions.length, instanceId, instanceName, messages, t]);

  // Multi-session: close a session
  const handleSessionClose = useCallback((sid: string) => {
    setChatSessions((prev) => {
      const updated = prev.filter(s => s.id !== sid);
      if (updated.length === 0) return prev; // Don't close last session
      saveSessions(instanceId, updated);
      // If we closed the active session, switch to the first remaining one
      if (sid === activeSessionId) {
        const nextSession = updated[0];
        sessionIdRef.current = nextSession.id;
        setActiveSessionId(nextSession.id);
        try {
          const key = `chat_hist_${instanceId}_${nextSession.id}`;
          const raw = mmkv.getString(key);
          if (raw) setMessages(JSON.parse(raw));
        } catch {}
      }
      return updated;
    });
    // Clean up stored messages for closed session
    try { mmkv.delete(`chat_hist_${instanceId}_${sid}`); } catch {}
  }, [activeSessionId, instanceId]);

  const handleQuoteMessage = useCallback((msg: Message) => {
    setQuotedMessage(msg);
    const snippet = msg.content?.slice(0, 60)?.replace(/\n/g, ' ') || '';
    setInput((prev) => prev ? prev : `> ${snippet}…\n`);
    void runSelectionHaptic();
  }, []);

  const handleExportNote = useCallback((msg: Message) => {
    const text = getCopyableMessageText(msg);
    if (text) {
      DeviceBridgingService.writeClipboard(text);
      Alert.alert(t({ en: 'Saved', zh: '已保存' }), t({ en: 'Message copied — paste into Notes.', zh: '消息已复制，可粘贴到笔记。' }));
    }
  }, [t]);

  const renderMessage = ({ item }: { item: Message }) => {
    return (
      <MessageBubble
        item={item}
        onSpeak={handleSpeakMessage}
        onStopSpeaking={stopSpeaking}
        speakingMessageId={speakingMessageId}
        onPreviewImage={(uri) => setPreviewImageUri(uri)}
        onQuoteMessage={handleQuoteMessage}
        onExportNote={handleExportNote}
      />
    );
  };

  // Sprint 2: Auto-provision — when no agent instance exists, show friendly welcome
  const handleAutoProvision = useCallback(async () => {
    if (provisioning) return;
    setProvisioning(true);
    try {
      const result = await apiFetch<{ instance: any }>('/openclaw/auto-provision', { method: 'POST' });
      if (result?.instance) {
        const newInstance = mapRawInstance(result.instance, {
          name: result.instance.name || 'My Agent',
          instanceUrl: result.instance.instanceUrl || '',
          deployType: (result.instance.deployType || 'cloud') as 'cloud' | 'local' | 'server' | 'existing',
        });
        useAuthStore.getState().addInstance(newInstance);
        useAuthStore.getState().setActiveInstance(newInstance.id);
        useAuthStore.getState().setOnboardingComplete();
        // If triggered by voice activation, go straight to chat with voice mode
        if (voiceModeRequested) {
          navigation.replace('AgentChat', {
            instanceId: newInstance.id,
            instanceName: newInstance.name,
            voiceMode: true,
            duplexMode: true,
          });
        } else {
          // Navigate to skill pack for one-tap core skill installation
          navigation.navigate('SkillPack');
        }
      }
    } catch (err: any) {
      // Fallback: navigate to manual deploy
      navigation.navigate('DeploySelect');
    } finally {
      setProvisioning(false);
    }
  }, [provisioning, navigation, voiceModeRequested]);

  // Auto-trigger provisioning when arriving from floating ball voice activation
  useEffect(() => {
    if (!activeInstance && !instanceId && voiceModeRequested && !provisioning) {
      void handleAutoProvision();
    }
  }, [activeInstance, instanceId, voiceModeRequested, provisioning, handleAutoProvision]);

  // Sprint 1+2: No-instance welcome screen
  if (!activeInstance && !instanceId) {
    return (
      <SafeAreaView style={styles.welcomeContainer}>
        <View style={styles.welcomeContent}>
          <Text style={styles.welcomeEmoji}>{'🤖'}</Text>
          <Text style={styles.welcomeTitle}>{t({ en: 'Hi, I\'m your AI Agent!', zh: '你好，我是你的 AI 智能体！' })}</Text>
          <Text style={styles.welcomeSubtitle}>
            {t({ en: 'Let me set up everything for you. One tap and we can start chatting.', zh: '让我帮你准备好一切，一键即可开始对话。' })}
          </Text>
          <TouchableOpacity
            style={styles.welcomeBtn}
            onPress={handleAutoProvision}
            disabled={provisioning}
          >
            {provisioning ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.welcomeBtnText}>{t({ en: 'Get Started', zh: '立即开始' })}</Text>
            )}
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.welcomeSecondaryBtn}
            onPress={() => navigation.navigate('DeploySelect')}
          >
            <Text style={styles.welcomeSecondaryText}>{t({ en: 'Advanced Setup', zh: '高级配置' })}</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <KeyboardAvoidingView
      testID="agent-chat-screen"
      accessibilityLabel="agent-chat-screen"
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={88}
    >
      {/* Simplified Chat toolbar */}
      <SafeAreaView edges={['top']} style={{ backgroundColor: colors.bgCard }}>
        <View style={styles.chatBar}>
          <TouchableOpacity
            testID="agent-chat-drawer-button"
            accessibilityLabel="agent-chat-drawer-button"
            onPress={() => { try { (navigation as any).openDrawer(); } catch {} }}
            style={styles.chatBarBackBtn}
          >
            <Text style={styles.chatBarBackIcon}>{'☰'}</Text>
          </TouchableOpacity>
          <Text style={styles.chatBarTitle} numberOfLines={1}>🤖 {instanceName}</Text>
          <TouchableOpacity
            testID="agent-chat-settings-button"
            accessibilityLabel="agent-chat-settings-button"
            onPress={() => setShowSettingsSheet(true)}
            style={styles.chatBarGearBtn}
          >
            <Text style={styles.chatBarGearIcon}>⚙️</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>

      {/* Multi-session tabs */}
      <ChatSessionTabs
        instanceId={instanceId}
        sessions={chatSessions}
        activeSessionId={activeSessionId}
        onSelect={handleSessionSelect}
        onNew={handleSessionNew}
        onClose={handleSessionClose}
        t={t}
      />

      {/* Quick model switch bar */}
      <TouchableOpacity
        accessibilityLabel="quick-model-switch"
        onPress={() => setShowModelPicker(true)}
        style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 5, backgroundColor: colors.bgCard, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }}
      >
        <Text style={{ color: isLocalModelSelected ? '#f59e0b' : colors.accent, fontSize: 11, fontWeight: '600' }} numberOfLines={1}>
          {isLocalModelSelected ? '📱 ' : '☁️ '}
          {resolvedModelLabel || availableModels.find((m) => m.id === effectiveModelId)?.label || effectiveModelId}
        </Text>
        <Text style={{ color: colors.textMuted, fontSize: 11, marginLeft: 4 }}>{'▾'}</Text>
      </TouchableOpacity>

      {loadingHistory && (
        <View style={styles.historyLoader}>
          <ActivityIndicator size="small" color={colors.accent} />
          <Text style={styles.historyLoaderText}>{t({ en: 'Loading history…', zh: '正在加载历史记录…' })}</Text>
        </View>
      )}

      <DesktopDiscoveryBanner
        sessionId={sessionIdRef.current}
        agentId={activeInstance?.metadata?.agentAccountId || instanceId}
        instanceName={instanceName}
        messages={allMessagesRef.current.length > 0 ? allMessagesRef.current.slice(-10) : messages.slice(-10)}
      />

      {isOffline && (
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: '#f59e0b', paddingVertical: 6 }}>
          <Text style={{ color: '#fff', fontSize: 13, fontWeight: '600' }}>
            {t({ en: 'Offline — messages will be sent when reconnected', zh: '离线模式 — 恢复连接后自动发送' })}
          </Text>
        </View>
      )}

      {!!remoteClipboard?.text && (
        <View style={styles.remoteClipboardBanner}>
          <View style={styles.remoteClipboardTextWrap}>
            <Text style={styles.remoteClipboardTitle}>
              {t({ en: 'Desktop clipboard available', zh: '检测到桌面剪贴板' })}
            </Text>
            <Text style={styles.remoteClipboardSubtitle} numberOfLines={2}>
              {remoteClipboard.text}
            </Text>
          </View>
          <View style={styles.remoteClipboardActions}>
            <TouchableOpacity style={styles.remoteClipboardActionBtn} onPress={handleInsertDesktopClipboard}>
              <Text style={styles.remoteClipboardActionText}>{t({ en: 'Insert', zh: '插入' })}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.remoteClipboardActionBtn} onPress={handleCopyDesktopClipboard}>
              <Text style={styles.remoteClipboardActionText}>{t({ en: 'Copy', zh: '复制' })}</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      <FlatList
        ref={flatListRef}
        data={messages}
        keyExtractor={(m) => m.id}
        renderItem={renderMessage}
        contentContainerStyle={styles.messageList}
        showsVerticalScrollIndicator={false}
        onContentSizeChange={() => scrollToBottom()}
        onScroll={(event) => {
          const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
          const distanceFromBottom = contentSize.height - (contentOffset.y + layoutMeasurement.height);
          isNearBottomRef.current = distanceFromBottom < 120;
        }}
        scrollEventThrottle={16}
        initialNumToRender={PAGE_SIZE}
        maxToRenderPerBatch={10}
        windowSize={5}
        onStartReached={loadOlderMessages}
        onStartReachedThreshold={0.3}
        ListHeaderComponent={
          allMessagesRef.current.length > messages.length ? (
            <TouchableOpacity onPress={loadOlderMessages} style={{ alignItems: 'center', paddingVertical: 8 }}>
              <Text style={{ color: colors.accent, fontSize: 13 }}>
                {t({ en: 'Load older messages', zh: '加载更早消息' })}
              </Text>
            </TouchableOpacity>
          ) : null
        }
      />

      {voiceMode && (
        <>
          <View testID="voice-status-bar" accessibilityLabel="voice-status-bar" style={styles.voiceStatusBar}>
            <View
              testID="voice-session-state"
              accessibilityLabel={`voice-session-state:${voiceInteractionMode}:${duplexMode ? 'duplex' : 'basic'}:${voicePhase}:${duplexSessionConnected ? 'connected' : 'disconnected'}`}
              style={styles.e2eHiddenMarker}
            />
            <View
              testID="voice-permission-state"
              accessibilityLabel={`voice-permission-state:${liveSpeechPermissionState}`}
              style={styles.e2eHiddenMarker}
            />
            <View
              testID="chat-selected-voice"
              accessibilityLabel={`chat-selected-voice:${agentVoiceId || 'alloy'}`}
              style={styles.e2eHiddenMarker}
            />
            <Text style={styles.voiceStatusDots}>...</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.voiceStatusText}>
                  {voicePhase === 'idle' && (duplexMode
                    ? (duplexUsesRealtimeChannel
                      ? (realtimeConnected
                        ? t({ en: 'Realtime duplex is ready. Just speak naturally; no need to hold the button.', zh: '实时双工已就绪，直接说话即可，无需再按住按钮。' })
                        : t({ en: 'Voice session is ready. Listening will start automatically.', zh: '语音会话已就绪，正在连接实时通道并自动开始聆听。' }))
                      : (localVoicePlan.localAudioInputReady
                        ? t({ en: 'Live local voice is ready. Supported short turns can stay on-device; unsupported turns are blocked instead of silently switching to the cloud.', zh: '连续本地语音已就绪。受支持的简短轮次会留在端侧；不支持的轮次会被直接拦截，不会再偷偷切到云端。' })
                        : t({ en: 'Live voice is ready for the local text path. Unsupported multimodal turns will be blocked instead of silently switching to the cloud.', zh: '连续语音已就绪，可用于本地文本链路。不支持的多模态轮次会被直接拦截，不会再偷偷切到云端。' })))
                    : t({ en: 'Voice panel is open. Tap and hold or switch to live mode to start talking.', zh: '语音面板已打开。按住说话，或切到实时模式开始对话。' }))}
                  {voicePhase === 'recording' && (voiceInteractionMode === 'tap'
                    ? duplexMode
                      ? (duplexUsesRealtimeChannel
                        ? t({ en: 'Realtime listening… pause briefly to send', zh: '实时聆听中… 稍停即发送' })
                        : t({ en: 'Live listening… pause briefly to send', zh: '连续聆听中… 稍停即发送' }))
                      : t({ en: 'Listening… tap again to send', zh: '正在聆听… 再点一次发送' })
                    : t({ en: 'Listening… release to send', zh: '正在聆听… 松开发送' }))}
                {voicePhase === 'transcribing' && t({ en: 'Transcribing your voice…', zh: '正在转写你的语音…' })}
                {voicePhase === 'thinking' && t({ en: 'Agent is preparing a reply…', zh: '智能体正在准备回复…' })}
                  {voicePhase === 'speaking' && (voiceInteractionMode === 'tap'
                    ? t({ en: 'Agent is speaking… just speak to interrupt immediately', zh: '智能体正在说话… 你直接开口即可立刻打断' })
                    : t({ en: 'Agent is speaking… press and hold to interrupt', zh: '智能体正在播报… 按住即可打断' }))}
              </Text>
              {!!transcriptPreview && (voicePhase === 'transcribing' || voicePhase === 'thinking') && (
                <Text style={styles.voiceTranscriptPreview} numberOfLines={2}>
                  {transcriptPreview}
                </Text>
              )}
              {liveSpeechPermissionState === 'denied' && (
                <Text style={styles.voiceTranscriptPreview}>
                  {t({ en: 'Microphone permission is blocked. Re-enable it to resume live voice.', zh: '麦克风权限被拒绝，恢复权限后才能继续实时语音。' })}
                </Text>
              )}
              {duplexMode && liveListening && (
                <Text style={styles.voiceTranscriptPreview} numberOfLines={1}>
                  {t({ en: `Input level ${Math.max(0, liveVoiceVolume).toFixed(1)}`, zh: `输入音量 ${Math.max(0, liveVoiceVolume).toFixed(1)}` })}
                </Text>
              )}
            </View>
          </View>

          {shouldShowVoiceQuickGuide && (
            <View style={styles.voiceQuickGuideCard}>
              <Text style={styles.voiceQuickGuideTitle}>
                {t({ en: 'Voice Quick Start', zh: '语音快速开始' })}
              </Text>
              <Text style={styles.voiceQuickGuideText}>
                {t({ en: '1. From the home screen, say your wake phrase or tap the floating ball once.', zh: '1. 在首页直接说唤醒词，或点一次悬浮球进入语音。' })}
              </Text>
              <Text style={styles.voiceQuickGuideText}>
                {t({ en: '2. In live mode, speak naturally. If the mic is blocked, re-enable microphone and speech permissions.', zh: '2. 进入实时模式后直接自然说话。如果麦克风被拦截，请恢复麦克风和语音识别权限。' })}
              </Text>
              <Text style={styles.voiceQuickGuideText}>
                {t({ en: '3. Use the gear in the top-right corner to change wake phrase, voice persona, and playback behavior.', zh: '3. 右上角齿轮可以修改唤醒词、智能体音色和播报行为。' })}
              </Text>
              <View style={styles.voiceQuickGuideActions}>
                {liveSpeechPermissionState === 'denied' && (
                  <TouchableOpacity style={styles.voiceQuickGuideActionBtn} onPress={() => Linking.openSettings().catch(() => {})}>
                    <Text style={styles.voiceQuickGuideActionText}>{t({ en: 'Open System Settings', zh: '打开系统设置' })}</Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity style={styles.voiceQuickGuideActionBtn} onPress={() => setShowSettingsSheet(true)}>
                  <Text style={styles.voiceQuickGuideActionText}>{t({ en: 'Open Voice Settings', zh: '打开语音设置' })}</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
        </>
      )}

      {/* Floating glassmorphism input bar */}
      <BlurView intensity={40} tint="dark" style={sf.floatingInputWrap}>
        {/* Quoted message chip */}
        {quotedMessage && (
          <View style={sf.quoteChip}>
            <Text style={sf.quoteChipText} numberOfLines={1}>
              💬 {quotedMessage.content?.slice(0, 50)?.replace(/\n/g, ' ')}…
            </Text>
            <TouchableOpacity onPress={() => { setQuotedMessage(null); setInput(''); }}>
              <Text style={sf.quoteChipClose}>✕</Text>
            </TouchableOpacity>
          </View>
        )}
        {!!pendingAttachments.length && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.pendingAttachmentRow}>
            {pendingAttachments.map((attachment) => (
              <View key={attachment.fileName} style={styles.pendingAttachmentChip}>
                {attachment.isImage ? (
                  <Image source={{ uri: attachment.publicUrl }} style={styles.pendingAttachmentThumb} resizeMode="cover" />
                ) : (
                  <Text style={styles.pendingAttachmentIcon}>📎</Text>
                )}
                <View style={styles.pendingAttachmentMeta}>
                  <Text style={styles.pendingAttachmentName} numberOfLines={1}>{attachment.originalName}</Text>
                  <Text style={styles.pendingAttachmentSub}>{formatAttachmentSize(attachment.size)}</Text>
                </View>
                <TouchableOpacity onPress={() => removePendingAttachment(attachment.fileName)}>
                  <Text style={styles.pendingAttachmentRemove}>✕</Text>
                </TouchableOpacity>
              </View>
            ))}
          </ScrollView>
        )}
      {/* Attachment toolbar — slides above input */}
      {showAttachToolbar && (
        <View style={styles.attachToolbar}>
          <TouchableOpacity style={styles.attachToolbarItem} onPress={handleAttachCamera}>
            <Text style={styles.attachToolbarIcon}>📷</Text>
            <Text style={styles.attachToolbarLabel}>{t({ en: 'Camera', zh: '拍照' })}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.attachToolbarItem} onPress={handleAttachAlbum}>
            <Text style={styles.attachToolbarIcon}>🖼️</Text>
            <Text style={styles.attachToolbarLabel}>{t({ en: 'Album', zh: '相册' })}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.attachToolbarItem} onPress={handleAttachFile}>
            <Text style={styles.attachToolbarIcon}>📎</Text>
            <Text style={styles.attachToolbarLabel}>{t({ en: 'File', zh: '文件' })}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.attachToolbarItem} onPress={handleDeviceGPS}>
            <Text style={styles.attachToolbarIcon}>📍</Text>
            <Text style={styles.attachToolbarLabel}>{t({ en: 'GPS', zh: '位置' })}</Text>
          </TouchableOpacity>
        </View>
      )}

      <View style={styles.inputRow}>
        {voiceMode ? (
          duplexMode && duplexSessionConnected ? (
            /* Active duplex voice session — status display */
            <TouchableOpacity
              testID="chat-voice-action-button"
              accessibilityLabel={`chat-voice-action-button:call:${voicePhase}:${liveListening ? 'live' : 'idle'}`}
              style={[styles.holdTalkBtn, styles.holdTalkBtnCall]}
              onPress={() => {
                if (duplexUsesRealtimeChannel && liveListening) sendRealtimeInterrupt();
                setDuplexMode(false);
              }}
              activeOpacity={0.85}
            >
              <Text style={styles.holdTalkText}>
                {liveListening
                  ? t({ en: '🎙  Listening…', zh: '🎙  聆听中…' })
                  : voicePhase === 'thinking'
                  ? t({ en: '💭  Thinking…', zh: '💭  思考中…' })
                  : voicePhase === 'speaking'
                  ? t({ en: '🔊  Speaking…', zh: '🔊  回复中…' })
                  : (duplexUsesRealtimeChannel
                    ? t({ en: '📞  In Call — Tap to End', zh: '📞  通话中 — 点击挂断' })
                    : t({ en: '🎙  Live Voice — Tap to End', zh: '🎙  连续语音中 — 点击结束' }))}
              </Text>
            </TouchableOpacity>
          ) : duplexMode && duplexUsesRealtimeChannel && !realtimeConnected ? (
            /* Connecting to realtime voice — show connecting state */
            <View
              style={[styles.holdTalkBtn, styles.holdTalkBtnCall]}
            >
              <Text style={styles.holdTalkText}>
                {t({ en: '📞  Connecting…', zh: '📞  正在连接…' })}
              </Text>
            </View>
          ) : (
            /* Push-to-talk (hold to record) */
            <TouchableOpacity
              testID="chat-voice-action-button"
              accessibilityLabel={`chat-voice-action-button:ptt:${voicePhase}:${isRecording ? 'recording' : 'idle'}`}
              style={[styles.holdTalkBtn, isRecording && styles.holdTalkBtnActive]}
              onPressIn={handleVoicePressIn}
              onPressOut={handleVoicePressOut}
              activeOpacity={0.85}
            >
              <Text style={styles.holdTalkText}>
                {isRecording ? t({ en: '🔴  Release to Send', zh: '🔴  松开发送' }) : t({ en: '🎙  Hold to Talk', zh: '🎙  按住说话' })}
              </Text>
            </TouchableOpacity>
          )
        ) : (
          /* Text mode */
          <TextInput
            testID="chat-text-input"
            accessibilityLabel="chat-text-input"
            style={styles.input}
            placeholder={t({ en: `Message ${instanceName}...`, zh: `给 ${instanceName} 发消息…` })}
            placeholderTextColor={colors.textMuted}
            value={input}
            onChangeText={setInput}
            onFocus={() => setShowAttachToolbar(false)}
            multiline
            maxLength={2000}
            returnKeyType="send"
            onSubmitEditing={() => handleSend()}
          />
        )}

        {/* Attach button — always visible (both voice & text mode) */}
        <TouchableOpacity
          style={[styles.attachBtn, (sending || uploadingAttachment) && styles.sendBtnDisabled]}
          onPress={handleAttachmentAction}
          disabled={sending || uploadingAttachment}
        >
          {uploadingAttachment ? (
            <ActivityIndicator size="small" color={colors.textPrimary} />
          ) : (
            <Text style={styles.attachBtnIcon}>{showAttachToolbar ? '✕' : '+'}</Text>
          )}
        </TouchableOpacity>

        {/* Right: Send (when has text) or Mic toggle (when empty) */}
        {(input.trim().length > 0 || pendingAttachments.length > 0) && !voiceMode ? (
          <TouchableOpacity
            testID="chat-send-button"
            accessibilityLabel="chat-send-button"
            style={[styles.sendBtn, (sending || uploadingAttachment) && styles.sendBtnDisabled]}
            onPress={() => handleSend()}
            disabled={sending || uploadingAttachment}
          >
            {sending || uploadingAttachment ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text style={styles.sendIcon}>⬆</Text>
            )}
          </TouchableOpacity>
        ) : !voiceMode ? (
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <TouchableOpacity
              testID="chat-realtime-voice-btn"
              accessibilityLabel="chat-realtime-voice-btn"
              style={styles.modeToggleBtn}
              onPress={() => {
                if (!liveVoiceAvailable) {
                  Alert.alert(
                    t({ en: 'Live Voice Unavailable', zh: '连续语音不可用' }),
                    t({ en: 'This build does not have native live speech recognition available yet.', zh: '当前构建暂未提供原生实时语音识别能力。' }),
                  );
                  return;
                }
                setVoiceMode(true);
                setDuplexMode(true);
                setShowAttachToolbar(false);
              }}
            >
              <Text style={styles.modeToggleIcon}>📞</Text>
            </TouchableOpacity>
            <TouchableOpacity
              testID="chat-voice-mode-toggle"
              accessibilityLabel={`chat-voice-mode-toggle:text`}
              style={styles.modeToggleBtn}
              onPress={() => { setVoiceMode(true); setShowAttachToolbar(false); }}
            >
              <Text style={styles.modeToggleIcon}>🎤</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <TouchableOpacity
            testID="chat-voice-mode-toggle"
            accessibilityLabel={`chat-voice-mode-toggle:voice`}
            style={styles.modeToggleBtn}
            onPress={() => { setVoiceMode(false); setShowAttachToolbar(false); }}
          >
            <Text style={styles.modeToggleIcon}>⌨️</Text>
          </TouchableOpacity>
        )}

      </View>
      </BlurView>

      {/* Voice onboarding tooltip */}
      <VoiceOnboardingTooltip
        visible={voiceMode}
        voiceInteractionMode={voiceInteractionMode}
        duplexMode={duplexMode}
        t={t}
      />

      <Modal visible={showCameraModal} animationType="fade" onRequestClose={() => !capturingPhoto && setShowCameraModal(false)}>
        <View style={styles.cameraModalRoot}>
          {cameraPermission?.granted ? (
            <CameraView
              ref={cameraRef}
              style={StyleSheet.absoluteFill}
              facing="back"
              mode="picture"
            />
          ) : (
            <View style={styles.cameraPermissionState}>
              <Text style={styles.cameraPermissionTitle}>{t({ en: 'Camera Permission Required', zh: '需要相机权限' })}</Text>
              <Text style={styles.cameraPermissionText}>{t({ en: 'Enable camera access, then try again.', zh: '开启相机权限后再重试。' })}</Text>
            </View>
          )}

          <View style={styles.cameraTopBar}>
            <TouchableOpacity
              style={styles.cameraCloseBtn}
              onPress={() => !capturingPhoto && setShowCameraModal(false)}
              disabled={capturingPhoto}
            >
              <Text style={styles.cameraCloseBtnText}>✕</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.cameraBottomBar}>
            <TouchableOpacity style={styles.cameraAuxBtn} onPress={handleAttachAlbum} disabled={capturingPhoto}>
              <Text style={styles.cameraAuxBtnText}>{t({ en: 'Album', zh: '相册' })}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.cameraCaptureBtn, capturingPhoto && styles.cameraCaptureBtnDisabled]}
              onPress={handleCaptureCameraPhoto}
              disabled={capturingPhoto || !cameraPermission?.granted}
            >
              {capturingPhoto ? <ActivityIndicator color="#111827" /> : <View style={styles.cameraCaptureBtnInner} />}
            </TouchableOpacity>
            <View style={styles.cameraAuxSpacer} />
          </View>
        </View>
      </Modal>

      {/* Image preview modal */}
      <Modal visible={!!previewImageUri} transparent animationType="fade" onRequestClose={() => setPreviewImageUri(null)}>
        <TouchableOpacity style={styles.imagePreviewOverlay} activeOpacity={1} onPress={() => setPreviewImageUri(null)}>
          <View style={styles.imagePreviewContainer}>
            {previewImageUri && (
              <Image source={{ uri: previewImageUri }} style={styles.imagePreviewImage} resizeMode="contain" />
            )}
          </View>
          <TouchableOpacity style={styles.imagePreviewClose} onPress={() => setPreviewImageUri(null)}>
            <Text style={styles.imagePreviewCloseText}>✕</Text>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      {/* Settings Bottom Sheet — replaces cluttered chatBar controls */}
      <Modal visible={showSettingsSheet} transparent animationType="slide" onRequestClose={() => setShowSettingsSheet(false)}>
        <TouchableOpacity style={styles.modalOverlay} onPress={() => setShowSettingsSheet(false)} activeOpacity={1}>
          <View testID="chat-settings-sheet" accessibilityLabel="chat-settings-sheet" style={styles.settingsSheet}>
            <View style={styles.sheetHandle} />
            <Text style={styles.sheetTitle}>{t({ en: 'Chat Settings', zh: '对话设置' })}</Text>

            {/* Voice mode toggle */}
            <View style={styles.sheetRow}>
              <Text style={styles.sheetRowLabel}>{t({ en: 'Voice Mode', zh: '语音模式' })}</Text>
              <TouchableOpacity
                onPress={() => {
                  if (!liveVoiceAvailable && !duplexMode) {
                    Alert.alert(
                      t({ en: 'Live Voice Unavailable', zh: '连续语音不可用' }),
                      t({ en: 'This build does not have native live speech recognition available yet.', zh: '当前构建暂未提供原生实时语音识别能力。' }),
                    );
                    return;
                  }
                  setDuplexMode((prev) => !prev);
                }}
                style={[styles.sheetToggle, duplexMode && styles.sheetToggleActive]}
                testID="chat-duplex-toggle"
              >
                <Text style={[styles.sheetToggleText, duplexMode && { color: colors.accent }]}>
                  {duplexMode ? t({ en: 'Live', zh: '实时' }) : t({ en: 'Basic', zh: '基础' })}
                </Text>
              </TouchableOpacity>
            </View>

            <View style={styles.sheetRow}>
              <Text style={styles.sheetRowLabel}>{t({ en: 'On-device Voice First', zh: '端侧语音优先' })}</Text>
              <TouchableOpacity
                onPress={() => setPreferOnDeviceVoice(!preferOnDeviceVoice)}
                style={[styles.sheetToggle, preferOnDeviceVoice && styles.sheetToggleActive]}
              >
                <Text style={[styles.sheetToggleText, preferOnDeviceVoice && { color: colors.accent }]}>
                  {preferOnDeviceVoice ? t({ en: 'On', zh: '开' }) : t({ en: 'Off', zh: '关' })}
                </Text>
              </TouchableOpacity>
            </View>

            {/* Auto-speak toggle */}
            <View style={styles.sheetRow}>
              <Text style={styles.sheetRowLabel}>{t({ en: 'Auto Read Aloud', zh: '自动朗读' })}</Text>
              <TouchableOpacity
                onPress={() => { setAutoSpeak(!autoSpeak); if (isSpeaking) stopSpeaking(); }}
                style={[styles.sheetToggle, autoSpeak && styles.sheetToggleActive]}
              >
                <Text style={[styles.sheetToggleText, autoSpeak && { color: colors.accent }]}>
                  {autoSpeak ? t({ en: 'On', zh: '开' }) : t({ en: 'Off', zh: '关' })}
                </Text>
              </TouchableOpacity>
            </View>

            {/* Speech rate selector */}
            <View style={styles.sheetRow}>
              <Text style={styles.sheetRowLabel}>{t({ en: 'Speech Speed', zh: '语速' })}</Text>
              <View style={{ flexDirection: 'row', gap: 6 }}>
                {[0.8, 1.0, 1.2, 1.5].map((rate) => (
                  <TouchableOpacity
                    key={rate}
                    onPress={() => setSpeechRate(rate)}
                    style={[
                      styles.sheetToggle,
                      { minWidth: 40, paddingHorizontal: 8 },
                      speechRate === rate && styles.sheetToggleActive,
                    ]}
                  >
                    <Text style={[styles.sheetToggleText, speechRate === rate && { color: colors.accent }]}>
                      {rate === 1.0 ? '1×' : `${rate}×`}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* Voice persona selector */}
            <View style={styles.sheetRow}>
              <Text style={styles.sheetRowLabel}>{t({ en: 'Voice', zh: '声音' })}</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
                {[
                  { id: 'alloy', label: 'Alloy', emoji: '🗣️' },
                  { id: 'echo', label: 'Echo', emoji: '🎙️' },
                  { id: 'fable', label: 'Fable', emoji: '📖' },
                  { id: 'onyx', label: 'Onyx', emoji: '🪨' },
                  { id: 'nova', label: 'Nova', emoji: '✨' },
                  { id: 'shimmer', label: 'Shimmer', emoji: '💫' },
                ].map((v) => {
                  const isActive = (agentVoiceId || 'alloy') === v.id;
                  return (
                    <TouchableOpacity
                      key={v.id}
                      testID={`chat-voice-persona-${v.id}`}
                      accessibilityLabel={`chat-voice-persona-${v.id}:${isActive ? 'active' : 'inactive'}`}
                      onPress={() => setAgentVoiceId(v.id)}
                      style={[
                        styles.sheetToggle,
                        { minWidth: 52, paddingHorizontal: 6 },
                        isActive && styles.sheetToggleActive,
                      ]}
                    >
                      <Text style={[styles.sheetToggleText, isActive && { color: colors.accent }]}>
                        {v.emoji} {v.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            </View>

            {/* Model selector */}
            <View style={styles.sheetRow}>
              <Text style={styles.sheetRowLabel}>{t({ en: 'Model', zh: '模型' })}</Text>
              <TouchableOpacity
                onPress={() => { setShowSettingsSheet(false); setTimeout(() => setShowModelPicker(true), 300); }}
                style={styles.sheetModelBtn}
              >
                <Text style={styles.sheetModelText} numberOfLines={1}>
                  {resolvedModelLabel || availableModels.find((m) => m.id === effectiveModelId)?.label || effectiveModelId}
                </Text>
                <Text style={{ color: colors.textMuted, fontSize: 12 }}>›</Text>
              </TouchableOpacity>
            </View>

            {/* Token usage */}
            <View style={styles.sheetRow}>
              <Text style={styles.sheetRowLabel}>{t({ en: 'Tokens Used', zh: '已用额度' })}</Text>
              <Text style={{ color: colors.textSecondary, fontSize: 13 }}>{used.toLocaleString()} / {total.toLocaleString()}</Text>
            </View>

            {/* New chat */}
            <TouchableOpacity style={styles.sheetActionBtn} onPress={() => { setShowSettingsSheet(false); handleClearChat(); }}>
              <Text style={styles.sheetActionText}>{'✨ '}{t({ en: 'New Conversation', zh: '新建对话' })}</Text>
            </TouchableOpacity>

            {/* Agent management */}
            <TouchableOpacity
              style={[styles.sheetActionBtn, { backgroundColor: 'transparent', borderWidth: 1, borderColor: colors.border }]}
              onPress={() => { setShowSettingsSheet(false); navigation.navigate('AgentConsole'); }}
            >
              <Text style={[styles.sheetActionText, { color: colors.textSecondary }]}>{'⚙️ '}{t({ en: 'Agent Management', zh: '智能体管理' })}</Text>
            </TouchableOpacity>

            {/* Voice diagnostics */}
            <TouchableOpacity
              style={[styles.sheetActionBtn, { backgroundColor: 'transparent', borderWidth: 1, borderColor: colors.border }]}
              onPress={() => { setShowSettingsSheet(false); setTimeout(() => setShowDiagnostics(true), 300); }}
            >
              <Text style={[styles.sheetActionText, { color: colors.textSecondary }]}>{'🔍 '}{t({ en: 'Voice Diagnostics', zh: '语音诊断' })}</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Model picker modal — dynamic models from user's configured providers */}
      <Modal visible={showModelPicker} transparent animationType="slide">
        <TouchableOpacity style={styles.modalOverlay} onPress={() => setShowModelPicker(false)} activeOpacity={1}>
          <View style={styles.modelSheet}>
            <Text style={styles.modelSheetTitle}>{t({ en: 'Switch Model', zh: '切换模型' })}</Text>
            <Text style={styles.modelSheetSubtitle}>{t({ en: 'Syncs this agent engine. Permissions override this selection.', zh: '会同步当前智能体引擎；若权限里设置了专属模型，则专属模型优先。' })}</Text>
            <ScrollView>
              {availableModels.map((m) => {
                const isActive = m.id === effectiveModelId;
                return (
                  <TouchableOpacity
                    key={m.id}
                    style={[
                      styles.modelOption,
                      isActive && styles.modelOptionActive,
                    ]}
                    onPress={async () => {
                      const isLocalTargetModel = isLocalOnlyModelId(m.id);
                      setSelectedModel(m.id);
                      setResolvedModelLabel(isLocalTargetModel ? getLocalModelLabel(m.id) : m.label);
                      setShowModelPicker(false);
                      if (instanceId && !isLocalTargetModel) {
                        updateInstance(instanceId, {
                          capabilities: {
                            ...(activeInstance?.capabilities || {}),
                            activeModel: m.id,
                            modelPinned: true,
                          },
                          resolvedModel: m.id,
                          resolvedModelLabel: m.label,
                        });
                        try { await switchInstanceModel(instanceId, m.id); } catch {}
                      }
                    }}
                  >
                    <View style={styles.modelOptionRow}>
                      <Text style={styles.modelOptionIcon}>{m.icon}</Text>
                      <View style={styles.modelOptionInfo}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                          <Text style={styles.modelOptionLabel}>{m.label}</Text>
                          {m.badge && (
                            <View style={styles.modelBadge}>
                              <Text style={styles.modelBadgeText}>{m.badge}</Text>
                            </View>
                          )}
                        </View>
                        <Text style={styles.modelOptionProvider}>{m.provider}</Text>
                      </View>
                      {isActive && <Text style={styles.modelOptionCheck}>✓</Text>}
                    </View>
                  </TouchableOpacity>
                );
              })}
              {availableModels.length <= 1 && (
                <Text style={{ color: colors.textMuted, textAlign: 'center', paddingVertical: 16, fontSize: 13 }}>
                  {t({ en: 'Configure API keys in Settings → API Keys to unlock more models', zh: '前往 设置 → API密钥 配置厂商密钥以解锁更多模型' })}
                </Text>
              )}
            </ScrollView>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Voice diagnostics modal */}
      <Modal visible={showDiagnostics} transparent animationType="slide">
        <TouchableOpacity style={styles.modalOverlay} onPress={() => setShowDiagnostics(false)} activeOpacity={1}>
          <View style={[styles.modelSheet, { maxHeight: '70%' }]}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <Text style={styles.modelSheetTitle}>{t({ en: 'Voice Diagnostics', zh: '语音诊断日志' })}</Text>
              <TouchableOpacity onPress={() => { clearVoiceDiagnostics(); setShowDiagnostics(false); }}>
                <Text style={{ color: '#f44', fontSize: 13 }}>{t({ en: 'Clear', zh: '清除' })}</Text>
              </TouchableOpacity>
            </View>
            <ScrollView style={{ flex: 1 }}>
              <Text selectable style={{ color: colors.textSecondary, fontSize: 11, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' }}>
                {getVoiceDiagnosticsText() || t({ en: 'No voice events recorded yet.', zh: '暂无语音事件记录。' })}
              </Text>
            </ScrollView>
          </View>
        </TouchableOpacity>
      </Modal>
    </KeyboardAvoidingView>
  );
}

// ─── Spatial Flow Styles ────────────────────────────────────────────────────
const sf = StyleSheet.create({
  // ── Message layout (borderless) ──
  msgContainer: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: 16,
    paddingVertical: 6,
    gap: 10,
  },
  msgContainerUser: {
    flexDirection: 'row-reverse',
    paddingLeft: 48,
  },
  msgContainerBot: {
    paddingRight: 32,
  },
  botAvatarCol: {
    marginTop: 2,
  },
  avatarGradient: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#fff',
  },

  // ── Message body (borderless, subtle bg) ──
  msgBody: {
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 10,
    overflow: 'hidden',
  },
  msgBodyUser: {
    backgroundColor: colors.primary + '20',
    borderBottomRightRadius: 4,
  },
  msgBodyBot: {
    backgroundColor: 'transparent',
  },
  msgBodyError: {
    backgroundColor: colors.error + '12',
    borderLeftWidth: 2,
    borderLeftColor: colors.error,
  },
  msgText: {
    fontSize: 15,
    lineHeight: 22,
    color: colors.textPrimary,
  },
  msgTextUser: {
    color: colors.textPrimary,
  },
  msgActions: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 8,
    opacity: 0.7,
  },
  actionChip: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    backgroundColor: colors.bgCard,
  },
  actionChipText: {
    fontSize: 11,
    color: colors.textSecondary,
  },

  // ── Thought Ribbon ──
  ribbonWrap: {
    marginBottom: 6,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: colors.accent + '08',
    borderLeftWidth: 2,
    borderLeftColor: colors.accent + '40',
  },
  ribbonHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  ribbonHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flex: 1,
  },
  ribbonShimmerWrap: {
    width: 18,
    height: 18,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  ribbonShimmer: {
    position: 'absolute',
    width: 60,
    height: 18,
    backgroundColor: colors.accent + '20',
    borderRadius: 9,
  },
  ribbonDoneIcon: {
    fontSize: 12,
    color: colors.accent,
  },
  ribbonTitle: {
    fontSize: 12,
    color: colors.textSecondary,
    flex: 1,
  },
  ribbonChevron: {
    fontSize: 12,
    color: colors.textMuted,
    marginLeft: 4,
  },
  ribbonBody: {
    maxHeight: 160,
    paddingHorizontal: 10,
    paddingBottom: 8,
  },
  ribbonStep: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    paddingVertical: 3,
  },
  ribbonStepDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.accent,
    marginTop: 6,
  },
  ribbonStepText: {
    fontSize: 12,
    lineHeight: 18,
    color: colors.textSecondary,
    flex: 1,
  },

  // ── Swipe actions ──
  swipeAction: {
    width: 72,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.primary + '20',
    borderRadius: 12,
    marginVertical: 4,
    marginHorizontal: 4,
  },
  swipeActionRight: {
    backgroundColor: colors.accent + '18',
  },
  swipeActionIcon: {
    fontSize: 20,
    marginBottom: 2,
  },
  swipeActionLabel: {
    fontSize: 10,
    color: colors.textSecondary,
  },

  // ── Context menu ──
  ctxOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  ctxMenuWrap: {
    borderRadius: 16,
    overflow: 'hidden',
    width: 260,
  },
  ctxMenu: {
    padding: 12,
  },
  ctxPreview: {
    fontSize: 12,
    color: colors.textMuted,
    marginBottom: 8,
    lineHeight: 16,
  },
  ctxDivider: {
    height: 1,
    backgroundColor: colors.border,
    marginBottom: 4,
  },
  ctxItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    gap: 10,
  },
  ctxIcon: {
    fontSize: 18,
  },
  ctxLabel: {
    fontSize: 14,
    color: colors.textPrimary,
  },

  // ── Media attachments (updated) ──
  mediaList: {
    gap: 8,
    marginTop: 8,
  },
  mediaCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.bgCard,
    borderRadius: 12,
    padding: 8,
    gap: 10,
  },
  mediaThumb: {
    width: 48,
    height: 48,
    borderRadius: 8,
  },
  mediaFileIcon: {
    width: 48,
    height: 48,
    borderRadius: 8,
    backgroundColor: colors.bgSecondary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mediaMeta: {
    flex: 1,
  },
  mediaName: {
    fontSize: 13,
    color: colors.textPrimary,
    fontWeight: '500',
  },
  mediaSub: {
    fontSize: 11,
    color: colors.textMuted,
    marginTop: 2,
  },

  // ── Floating input ──
  floatingInputWrap: {
    borderTopWidth: 0,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    overflow: 'hidden',
    backgroundColor: colors.bgSecondary + 'CC',
  },
  quoteChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.primary + '15',
    marginHorizontal: 12,
    marginTop: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
    gap: 6,
  },
  quoteChipText: {
    fontSize: 12,
    color: colors.textSecondary,
    flex: 1,
  },
  quoteChipClose: {
    fontSize: 14,
    color: colors.textMuted,
    paddingLeft: 4,
  },
});

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bgPrimary },
  chatBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: colors.bgCard,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    gap: 12,
  },
  chatBarTitle: { color: colors.textPrimary, fontWeight: '700', fontSize: 16, flex: 1, textAlign: 'center' },
  chatBarBackBtn: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  chatBarBackIcon: { color: colors.textPrimary, fontSize: 28, fontWeight: '300', marginTop: -2 },
  chatBarGearBtn: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  chatBarGearIcon: { fontSize: 18 },
  chatBarCallBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.bgCard,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chatBarCallBtnActive: {
    backgroundColor: '#ef4444',
    borderColor: '#ef4444',
  },
  chatBarCallIcon: { fontSize: 16 },
  chatBarCallIconActive: { fontSize: 16 },
  chatBarBtn: { paddingVertical: 4, paddingHorizontal: 10, borderRadius: 8, backgroundColor: colors.bgSecondary },
  chatBarBtnText: { color: colors.textMuted, fontSize: 12 },
  // Welcome screen (no instance)
  welcomeContainer: { flex: 1, backgroundColor: colors.bgPrimary },
  welcomeContent: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 40 },
  welcomeEmoji: { fontSize: 72, marginBottom: 20 },
  welcomeTitle: { color: colors.textPrimary, fontSize: 24, fontWeight: '700', textAlign: 'center', marginBottom: 12 },
  welcomeSubtitle: { color: colors.textSecondary, fontSize: 15, textAlign: 'center', lineHeight: 22, marginBottom: 32 },
  welcomeBtn: {
    width: '100%', height: 52, borderRadius: 26,
    backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center',
    marginBottom: 12,
  },
  welcomeBtnText: { color: '#fff', fontSize: 17, fontWeight: '700' },
  welcomeSecondaryBtn: { paddingVertical: 10, paddingHorizontal: 20 },
  welcomeSecondaryText: { color: colors.textMuted, fontSize: 14 },
  // Settings Bottom Sheet
  settingsSheet: {
    backgroundColor: colors.bgCard, borderTopLeftRadius: 20, borderTopRightRadius: 20,
    paddingTop: 12, paddingBottom: 40, paddingHorizontal: 20,
  },
  sheetHandle: {
    width: 40, height: 4, borderRadius: 2, backgroundColor: colors.border,
    alignSelf: 'center', marginBottom: 16,
  },
  sheetTitle: { color: colors.textPrimary, fontWeight: '700', fontSize: 17, marginBottom: 20, textAlign: 'center' },
  sheetRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  sheetRowLabel: { color: colors.textPrimary, fontSize: 15 },
  sheetToggle: {
    paddingVertical: 5, paddingHorizontal: 14, borderRadius: 16,
    backgroundColor: colors.bgSecondary, borderWidth: 1, borderColor: colors.border,
  },
  sheetToggleActive: { backgroundColor: colors.accent + '20', borderColor: colors.accent + '40' },
  sheetToggleText: { color: colors.textMuted, fontSize: 13, fontWeight: '600' },
  sheetModelBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingVertical: 5, paddingHorizontal: 12, borderRadius: 12,
    backgroundColor: colors.bgSecondary, borderWidth: 1, borderColor: colors.border, maxWidth: 200,
  },
  sheetModelText: { color: colors.accent, fontSize: 13, fontWeight: '600', flex: 1 },
  sheetActionBtn: {
    marginTop: 14, paddingVertical: 14, borderRadius: 14,
    backgroundColor: colors.primary, alignItems: 'center',
  },
  sheetActionText: { color: '#fff', fontSize: 15, fontWeight: '600' },
  historyLoader: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 10, justifyContent: 'center' },
  historyLoaderText: { color: colors.textMuted, fontSize: 13 },
  remoteClipboardBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginHorizontal: 12,
    marginTop: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 14,
    backgroundColor: colors.bgCard,
    borderWidth: 1,
    borderColor: colors.border,
  },
  remoteClipboardTextWrap: { flex: 1, minWidth: 0 },
  remoteClipboardTitle: { color: colors.textPrimary, fontSize: 13, fontWeight: '700' },
  remoteClipboardSubtitle: { color: colors.textMuted, fontSize: 12, lineHeight: 18, marginTop: 4 },
  remoteClipboardActions: { flexDirection: 'row', gap: 8 },
  remoteClipboardActionBtn: {
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 10,
    backgroundColor: colors.bgSecondary,
    borderWidth: 1,
    borderColor: colors.border,
  },
  remoteClipboardActionText: { color: colors.accent, fontSize: 12, fontWeight: '700' },
  messageList: { paddingTop: 12, paddingBottom: 8, gap: 4 },
  e2eHiddenMarker: { position: 'absolute', width: 1, height: 1, opacity: 0 },
  msgRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, maxWidth: '85%' },
  msgRowUser: { alignSelf: 'flex-end', flexDirection: 'row-reverse' },
  avatarBot: { width: 32, height: 32, borderRadius: 16, backgroundColor: colors.bgCard, alignItems: 'center', justifyContent: 'center' },
  avatarBotText: { fontSize: 16 },
  bubble: {
    flexDirection: 'column',
    borderRadius: 18,
    padding: 12,
    maxWidth: '100%',
  },
  bubbleUser: {
    backgroundColor: colors.primary,
    borderBottomRightRadius: 4,
  },
  bubbleBot: {
    backgroundColor: colors.bgCard,
    borderWidth: 1,
    borderColor: colors.border,
    borderBottomLeftRadius: 4,
  },
  bubbleError: { borderColor: colors.error, backgroundColor: colors.error + '15' },
  bubbleText: { color: colors.textPrimary, fontSize: 15, lineHeight: 22 },
  bubbleTextUser: { color: '#fff' },
  bubbleTextPending: { opacity: 0.72 },
  bubbleActions: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'flex-end', gap: 8, marginTop: 8 },
  copyBtn: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: colors.bgSecondary,
  },
  copyBtnText: { color: colors.textMuted, fontSize: 11, fontWeight: '600' },
  voiceStatusBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginHorizontal: 16,
    marginBottom: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 16,
    backgroundColor: colors.bgCard,
    borderWidth: 1,
    borderColor: colors.border,
  },
  voiceStatusDots: { color: colors.accent, fontSize: 18, fontWeight: '700', lineHeight: 18 },
  voiceStatusText: { color: colors.textMuted, fontSize: 13, flex: 1 },
  voiceTranscriptPreview: { color: colors.textPrimary, fontSize: 12, marginTop: 4, lineHeight: 18 },
  inputArea: {
    // Legacy — now uses sf.floatingInputWrap via BlurView
    backgroundColor: 'transparent',
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    padding: 12,
    paddingBottom: Platform.OS === 'ios' ? 24 : 12,
    gap: 10,
  },
  pendingAttachmentRow: {
    paddingHorizontal: 12,
    paddingTop: 10,
    gap: 8,
  },
  pendingAttachmentChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.bgCard,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 10,
    paddingVertical: 8,
    maxWidth: 240,
  },
  pendingAttachmentThumb: { width: 28, height: 28, borderRadius: 8 },
  pendingAttachmentIcon: { fontSize: 16 },
  pendingAttachmentMeta: { flex: 1, minWidth: 0 },
  pendingAttachmentName: { color: colors.textPrimary, fontSize: 12, fontWeight: '600' },
  pendingAttachmentSub: { color: colors.textMuted, fontSize: 10, marginTop: 2 },
  pendingAttachmentRemove: { color: colors.textMuted, fontSize: 12, paddingHorizontal: 2 },
  attachToolbar: {
    flexDirection: 'row',
    justifyContent: 'space-evenly',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.bgCard,
  },
  attachToolbarItem: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 64,
    gap: 4,
  },
  attachToolbarIcon: { fontSize: 28 },
  attachToolbarLabel: { fontSize: 11, color: colors.textMuted, fontWeight: '500' },
  attachBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.bgCard,
    borderWidth: 1,
    borderColor: colors.border,
  },
  attachBtnIcon: { fontSize: 18, color: colors.textPrimary, fontWeight: '600' },
  utilityBtn: {
    minWidth: 54,
    height: 42,
    paddingHorizontal: 12,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.bgCard,
    borderWidth: 1,
    borderColor: colors.border,
  },
  utilityBtnText: { color: colors.textPrimary, fontSize: 12, fontWeight: '600' },
  input: {
    flex: 1,
    backgroundColor: colors.bgCard + '80',
    borderRadius: 22,
    paddingHorizontal: 16,
    paddingVertical: 10,
    color: colors.textPrimary,
    fontSize: 15,
    maxHeight: 120,
    borderWidth: 1,
    borderColor: colors.border + '60',
  },
  sendBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendBtnDisabled: { backgroundColor: colors.bgCard, borderWidth: 1, borderColor: colors.border },
  sendIcon: { color: '#fff', fontSize: 20, fontWeight: '700' },
  deviceBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: colors.bgCard,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  deviceIcon: { color: colors.textPrimary, fontSize: 22, fontWeight: '400', marginTop: -2 },
  modeToggleBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: colors.bgCard,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: colors.border,
  },
  modeToggleIcon: { fontSize: 18 },
  holdTalkBtn: {
    flex: 1,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.primary,
  },
  holdTalkBtnActive: {
    backgroundColor: '#ef4444',
    borderColor: '#ef4444',
  },
  holdTalkBtnCall: {
    backgroundColor: '#059669',
    borderColor: '#059669',
  },
  holdTalkText: { color: '#fff', fontSize: 15, fontWeight: '600' },
  voiceCallBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.bgCard,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  voiceCallBtnActive: {
    backgroundColor: '#ef4444',
    borderColor: '#ef4444',
  },
  voiceCallIcon: { fontSize: 20 },
  voiceCallIconActive: { fontSize: 20 },
  tokenBar: {
    height: 18, backgroundColor: colors.bgSecondary,
    flexDirection: 'row', alignItems: 'center', overflow: 'hidden', position: 'relative',
  },
  tokenBarFill: { position: 'absolute', left: 0, top: 0, bottom: 0, opacity: 0.35 },
  tokenBarLabel: { fontSize: 10, color: colors.textMuted, paddingHorizontal: 8, zIndex: 1 },
  modelBtn: {
    paddingVertical: 3, paddingHorizontal: 8, borderRadius: 8,
    backgroundColor: colors.bgSecondary, borderWidth: 1, borderColor: colors.border,
    maxWidth: 140,
  },
  modelBtnText: { color: colors.accent, fontSize: 11, fontWeight: '600' },
  modalOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: '#00000077' },
  modelSheet: {
    backgroundColor: colors.bgCard, borderTopLeftRadius: 16, borderTopRightRadius: 16,
    paddingTop: 16, paddingBottom: 32, maxHeight: '60%',
  },
  modelSheetTitle: { color: colors.textPrimary, fontWeight: '700', fontSize: 16, textAlign: 'center', marginBottom: 4 },
  modelSheetSubtitle: { color: colors.textMuted, fontSize: 12, textAlign: 'center', marginBottom: 12 },
  modelOption: {
    paddingVertical: 12, paddingHorizontal: 20,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  modelOptionActive: { backgroundColor: colors.bgSecondary },
  modelOptionDisabled: { opacity: 0.5 },
  modelOptionRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  modelOptionIcon: { fontSize: 22 },
  modelOptionInfo: { flex: 1 },
  modelOptionLabel: { color: colors.textPrimary, fontSize: 15, fontWeight: '500' },
  modelOptionProvider: { color: colors.textMuted, fontSize: 12, marginTop: 2 },
  modelOptionCheck: { color: colors.accent, fontSize: 16, fontWeight: '700' },
  modelBadge: { backgroundColor: colors.accent + '20', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 1 },
  modelBadgeText: { color: colors.accent, fontSize: 10, fontWeight: '700' },
  thoughtContainer: { marginBottom: 6 },
  thoughtCapsule: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: colors.accent + '12', borderRadius: 20,
    paddingHorizontal: 12, paddingVertical: 6,
    alignSelf: 'flex-start',
  },
  thoughtCapsuleText: { fontSize: 12, fontWeight: '500', color: colors.textSecondary, flex: 1 },
  thoughtHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 },
  thoughtHeaderText: { fontSize: 13, fontWeight: '600', color: colors.textMuted },
  thoughtList: { marginTop: 6, gap: 4 },
  thoughtItemRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 6 },
  thoughtIcon: { fontSize: 12, color: colors.textMuted, marginTop: 1 },
  thoughtItemText: { fontSize: 12, color: colors.textMuted, flex: 1, lineHeight: 16 },
  attachmentList: { marginTop: 8, gap: 8 },
  attachmentCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 10,
    borderRadius: 12,
    backgroundColor: colors.bgCard,
    borderWidth: 1,
    borderColor: colors.border,
  },
  attachmentImage: { width: 52, height: 52, borderRadius: 10 },
  attachmentFileIconWrap: {
    width: 52,
    height: 52,
    borderRadius: 10,
    backgroundColor: colors.bgSecondary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  attachmentFileIcon: { fontSize: 22 },
  attachmentMeta: { flex: 1, minWidth: 0 },
  attachmentName: { color: colors.textPrimary, fontSize: 13, fontWeight: '600' },
  attachmentSub: { color: colors.textMuted, fontSize: 11, marginTop: 2 },
  audioPlayerCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 10,
    borderRadius: 12,
    backgroundColor: colors.bgCard,
    borderWidth: 1,
    borderColor: colors.border,
  },
  audioPlayerIcon: { fontSize: 28 },
  audioPlayerMeta: { flex: 1, minWidth: 0 },
  audioPlayerLabel: { color: colors.textPrimary, fontSize: 13, fontWeight: '600' },
  audioPlayerUrl: { color: colors.textMuted, fontSize: 10, marginTop: 2 },
  imagePreviewOverlay: {
    flex: 1,
    backgroundColor: '#000000ee',
    justifyContent: 'center',
    alignItems: 'center',
  },
  imagePreviewContainer: {
    width: Dimensions.get('window').width,
    height: Dimensions.get('window').height * 0.75,
  },
  imagePreviewImage: {
    width: '100%',
    height: '100%',
  },
  imagePreviewClose: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 60 : 40,
    right: 20,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  imagePreviewCloseText: { color: '#fff', fontSize: 18, fontWeight: '700' },
  cameraModalRoot: {
    flex: 1,
    backgroundColor: '#000',
  },
  cameraPermissionState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  cameraPermissionTitle: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 10,
  },
  cameraPermissionText: {
    color: 'rgba(255,255,255,0.75)',
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
  },
  cameraTopBar: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 56 : 24,
    left: 16,
    right: 16,
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
  cameraCloseBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(15,23,42,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cameraCloseBtnText: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '700',
  },
  cameraBottomBar: {
    position: 'absolute',
    left: 20,
    right: 20,
    bottom: Platform.OS === 'ios' ? 34 : 24,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  cameraAuxBtn: {
    minWidth: 72,
    paddingHorizontal: 16,
    height: 42,
    borderRadius: 21,
    backgroundColor: 'rgba(15,23,42,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cameraAuxBtnText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
  },
  cameraCaptureBtn: {
    width: 78,
    height: 78,
    borderRadius: 39,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cameraCaptureBtnDisabled: {
    opacity: 0.7,
  },
  cameraCaptureBtnInner: {
    width: 62,
    height: 62,
    borderRadius: 31,
    borderWidth: 3,
    borderColor: '#111827',
    backgroundColor: '#fff',
  },
  cameraAuxSpacer: {
    width: 72,
  },
  voiceQuickGuideCard: {
    backgroundColor: colors.bgCard,
    borderRadius: 14,
    padding: 14,
    marginHorizontal: 16,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: colors.border,
  },
  voiceQuickGuideTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: 8,
  },
  voiceQuickGuideText: {
    fontSize: 12,
    color: colors.textSecondary,
    lineHeight: 18,
    marginBottom: 4,
  },
  voiceQuickGuideActions: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 8,
  },
  voiceQuickGuideActionBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: colors.primary,
  },
  voiceQuickGuideActionText: {
    fontSize: 12,
    color: '#fff',
    fontWeight: '600',
  },
});
