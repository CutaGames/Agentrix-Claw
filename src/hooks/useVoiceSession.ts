/**
 * useVoiceSession — Unified voice session hook for mobile
 *
 * Extracts all voice logic from AgentChatScreen into a reusable hook:
 * - Voice recording (expo-av)
 * - Live speech recognition (expo-speech-recognition)
 * - TTS playback queue (AudioQueuePlayer)
 * - Duplex mode (listen → transcribe → send → speak → resume)
 * - Barge-in / interrupt / resume
 * - Streamed sentence-level TTS
 */
import { useState, useRef, useEffect, useCallback } from 'react';
import { Alert, Platform } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import { BleManager } from 'react-native-ble-plx';
import { AudioQueuePlayer } from '../services/AudioQueuePlayer';
import {
  isLiveSpeechRecognitionAvailable,
  requestLiveSpeechPermissions,
  startLiveSpeechRecognition,
  type LiveSpeechController,
} from '../services/liveSpeech.service';
import { API_BASE, WS_BASE } from '../config/env';
import type { UploadedChatAttachment } from '../services/api';
import { BackgroundVoiceService } from '../services/backgroundVoice.service';
import { addVoiceDiagnostic } from '../services/voiceDiagnostics';
import { RealtimeVoiceService, type RealtimeVoiceState } from '../services/realtimeVoice.service';
import { RealtimeMicrophoneService } from '../services/realtimeMicrophone.service';
import { VADService, createRecordingMeterFn } from '../services/vad.service';
import { WearablePairingStoreService } from '../services/wearables/wearablePairingStore.service';
import { WearableAudioRelay } from '../services/wearables/wearableAudioRelay.service';
import { WearableImageRelay } from '../services/wearables/wearableImageRelay.service';
import { GlassAuthInterceptor } from '../services/wearables/glassAuthInterceptor.service';
import type { PairedWearableRecord } from '../services/wearables/wearableTypes';
import {
  concatPcmChunks,
  encodePcm16ToWav,
  estimatePcmDurationMs,
} from '../services/localPcmWav.service';
import { LocalSpeechOutputService } from '../services/localSpeechOutput.service';
import { LocalWhisperService } from '../services/localWhisperService';

// Lazy import to avoid circular dependency TDZ during module initialization.
// testing/e2e.ts imports Zustand stores at top-level, which can cause
// "Cannot access before initialization" when AgentChatScreen is the initial route.
// Also checks the bootstrap flag since React Navigation rewrites the URL.
function isVoiceUiE2EEnabled(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const params = new URLSearchParams(window.location?.search || '');
    if (params.get('e2e') === 'voice-ui') return true;
  } catch {}
  return !!(window as any).__AGENTRIX_VOICE_UI_E2E_BOOTSTRAPPED__;
}

// expo-av: graceful degrade if missing
let Audio: any = null;
try { Audio = require('expo-av').Audio; } catch (_) {}

let Haptics: any = null;
try { Haptics = require('expo-haptics'); } catch (_) {}

function triggerHapticImpact(style: any): void {
  try {
    const pendingImpact = Haptics?.impactAsync?.(style);
    if (pendingImpact && typeof pendingImpact.catch === 'function') {
      void pendingImpact.catch(() => undefined);
    }
  } catch {}
}

// ── Types ──────────────────────────────────────────────────

export type VoicePhase = 'idle' | 'recording' | 'transcribing' | 'thinking' | 'speaking';

export interface UseVoiceSessionOptions {
  token: string | null;
  language: string;              // 'zh' | 'en'
  voiceModeRequested?: boolean;
  duplexModeRequested?: boolean;
  agentVoiceId?: string;
  instanceName?: string;
  instanceId?: string;
  isSending?: boolean;
  /** Use WebSocket realtime voice channel in duplex mode (lower latency) */
  useRealtimeChannel?: boolean;
  realtimeModelId?: string;
  /** Prefer on-device speech recognition before cloud transcription when feasible */
  preferLocalSpeechRecognition?: boolean;
  /** Prefer on-device text-to-speech playback when feasible */
  preferLocalTextToSpeech?: boolean;
  /** Whether a local-only model is currently selected for chat turns */
  localModelSelected?: boolean;
  /** Selected on-device model id when a local-only model is active */
  localModelId?: string;
  /** Whether the selected on-device model currently exposes audio-file input */
  localAudioInputAvailable?: boolean;
  /** TTS speech rate multiplier (0.8 - 1.5, default 1.0) */
  speechRate?: number;
  /** Called to send a transcript (and optional audio attachment) as a message */
  onSendMessage: (text: string, attachments?: UploadedChatAttachment[]) => void;
  onRealtimeUserMessage?: (text: string) => void;
  onRealtimeAssistantChunk?: (chunk: string) => void;
  onRealtimeAssistantResponseEnd?: () => void;
  onRealtimeError?: (message: string) => void;
  /** Called to stop/interrupt the current streaming response */
  onStopCurrentResponse: (showHint?: boolean) => void;
  /** i18n translation function */
  t: (opts: { en: string; zh: string }) => string;
}

export interface UseVoiceSessionReturn {
  // State
  voiceMode: boolean;
  setVoiceMode: (v: boolean) => void;
  duplexMode: boolean;
  setDuplexMode: (v: boolean) => void;
  voicePhase: VoicePhase;
  isRecording: boolean;
  isSpeaking: boolean;
  liveListening: boolean;
  liveVoiceVolume: number;
  transcriptPreview: string;
  voiceInteractionMode: 'hold' | 'tap';
  setVoiceInteractionMode: (m: 'hold' | 'tap') => void;
  autoSpeak: boolean;
  setAutoSpeak: (v: boolean) => void;
  liveVoiceAvailable: boolean;
  liveSpeechPermissionState: 'unknown' | 'granted' | 'denied';
  /** Whether the low-latency WebSocket realtime voice channel is connected */
  realtimeConnected: boolean;
  /** Send barge-in interrupt via realtime channel */
  sendRealtimeInterrupt: () => void;

  // Actions
  startVoiceRecording: () => Promise<void>;
  stopVoiceRecording: () => Promise<void>;
  handleVoicePressIn: () => Promise<void>;
  handleVoicePressOut: () => Promise<void>;
  handleVoiceTapToggle: () => Promise<void>;
  speakText: (text: string) => void;
  stopSpeaking: () => void;
  handleSpeakMessage: (text: string, messageId?: string) => void;
  enqueueStreamedSpeech: (chunk: string, flush?: boolean) => void;
  resetVoicePhaseAfterResponse: () => void;
  resumeLiveSpeech: () => void;
  sendRealtimeImageFrame: (frameBase64: string, mimeType?: string) => boolean;
  speakingMessageId: string | null;
  setVoicePhase: (phase: VoicePhase) => void;
  setTranscriptPreview: (text: string) => void;
}

type LocalDirectAudioCaptureState = {
  microphone: RealtimeMicrophoneService;
  pcmChunks: ArrayBuffer[];
};

const REALTIME_FINAL_TRANSCRIPT_DEDUPE_WINDOW_MS = 750;

function detectRecordedAudioExtension(uri: string): string {
  const normalized = uri.split('?')[0]?.toLowerCase() || '';
  if (normalized.endsWith('.mp3')) return 'mp3';
  if (normalized.endsWith('.wav')) return 'wav';
  if (normalized.endsWith('.m4a')) return 'm4a';
  if (normalized.endsWith('.aac')) return 'aac';
  if (normalized.endsWith('.caf')) return 'caf';
  return 'bin';
}

function isSupportedLocalAudioRecordingUri(uri: string): boolean {
  const extension = detectRecordedAudioExtension(uri);
  return extension === 'mp3' || extension === 'wav';
}

function inferRecordedAudioMimeType(uri: string): string {
  switch (detectRecordedAudioExtension(uri)) {
    case 'mp3':
      return 'audio/mpeg';
    case 'wav':
      return 'audio/wav';
    case 'aac':
      return 'audio/aac';
    case 'caf':
      return 'audio/x-caf';
    case 'm4a':
    default:
      return 'audio/m4a';
  }
}

// ── Hook ───────────────────────────────────────────────────

export function useVoiceSession(options: UseVoiceSessionOptions): UseVoiceSessionReturn {
  const {
    token,
    language,
    voiceModeRequested,
    duplexModeRequested,
    agentVoiceId,
    instanceName,
    instanceId,
    isSending,
    onSendMessage,
    onRealtimeUserMessage,
    onRealtimeAssistantChunk,
    onRealtimeAssistantResponseEnd,
    onRealtimeError,
    onStopCurrentResponse,
    t,
    useRealtimeChannel,
    realtimeModelId,
    preferLocalSpeechRecognition,
    preferLocalTextToSpeech,
    localModelSelected,
    localModelId,
    localAudioInputAvailable,
    speechRate,
  } = options;
  const isVoiceUiE2E = isVoiceUiE2EEnabled();

  // ── State ──
  const [voiceMode, setVoiceMode] = useState(!!voiceModeRequested);
  const [voiceInteractionMode, setVoiceInteractionMode] = useState<'hold' | 'tap'>(duplexModeRequested ? 'tap' : 'hold');
  const [duplexMode, setDuplexMode] = useState(!!duplexModeRequested);
  const [isRecording, setIsRecording] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [autoSpeak, setAutoSpeak] = useState(false);
  const [voicePhase, setVoicePhase] = useState<VoicePhase>('idle');
  const [transcriptPreview, setTranscriptPreview] = useState('');
  const [liveVoiceAvailable, setLiveVoiceAvailable] = useState(false);
  const [liveSpeechPermissionState, setLiveSpeechPermissionState] = useState<'unknown' | 'granted' | 'denied'>('unknown');
  const [liveListening, setLiveListening] = useState(false);
  const [liveVoiceVolume, setLiveVoiceVolume] = useState(-2);
  const [speakingMessageId, setSpeakingMessageId] = useState<string | null>(null);

  // ── Refs ──
  const audioPlayerRef = useRef<AudioQueuePlayer | null>(null);
  const recordingRef = useRef<any>(null);
  const isRecordingRef = useRef(false);
  const liveSpeechRef = useRef<LiveSpeechController | null>(null);
  const localHoldSpeechRef = useRef<LiveSpeechController | null>(null);
  const localHoldTranscriptRef = useRef('');
  const liveSpeechManualStopRef = useRef(false);
  const lastLiveFinalTranscriptRef = useRef('');
  const lastRealtimeFinalTranscriptRef = useRef('');
  const lastRealtimeFinalAtRef = useRef(0);
  const voiceModeRef = useRef(voiceMode);
  const duplexModeRef = useRef(duplexMode);
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  // Global watchdog: if `voicePhase` is stuck on 'transcribing' for more than
  // 20s — typical causes are a silently-dropped speech-recognition callback,
  // a stalled cloud STT request where the timeout promise never won the race,
  // or a local Whisper context that never returned — force the UI back to
  // idle with a clear error so the user isn't staring at "正在转写你的语音…"
  // forever. If there is an interim preview transcript, promote it to the
  // final message instead of dropping the turn.
  useEffect(() => {
    if (voicePhase !== 'transcribing') return;
    const timer = setTimeout(() => {
      if (!isMountedRef.current) return;
      if (voicePhase !== 'transcribing') return;
      const interim = transcriptPreview?.trim() || '';
      addVoiceDiagnostic('voice-session', 'transcribing-watchdog-fired', {
        hasInterim: interim.length > 0,
        interimChars: interim.length,
      });
      if (interim && interim !== '[Local voice message]' && interim !== '[本地语音消息]') {
        setVoicePhase('thinking');
        setTimeout(() => onSendMessageRef.current(interim), 40);
        return;
      }
      setVoicePhase('idle');
      setTranscriptPreview('');
      try { Alert.alert(
        t({ en: 'Transcription Timeout', zh: '转写超时' }),
        t({
          en: 'Transcription took too long. Please try again or type your message.',
          zh: '语音转写耗时过长，请重试或直接输入文字。',
        }),
      ); } catch {}
    }, 20_000);
    return () => clearTimeout(timer);
  }, [voicePhase, transcriptPreview, t]);

  const liveVoiceAvailableRef = useRef(false);
  const sendingRef = useRef(false);
  const backgroundVoiceRef = useRef<BackgroundVoiceService | null>(null);
  const pendingTtsSentenceRef = useRef('');
  const streamedTtsStartedRef = useRef(false);
  const lastLiveSpeechSkipReasonRef = useRef('');
  const startLiveSpeechInternalRef = useRef<(() => Promise<void>) | null>(null);
  const liveSpeechConsecutiveErrorsRef = useRef(0);
  const liveSpeechLastErrorTimeRef = useRef(0);
  const liveSpeechStartingRef = useRef(false);
  const realtimeAudioSequenceRef = useRef(0);
  const realtimeMicrophoneRef = useRef<RealtimeMicrophoneService | null>(null);
  const localDirectAudioCaptureRef = useRef<LocalDirectAudioCaptureState | null>(null);
  const localSpeechPlaybackQueueRef = useRef<Promise<void>>(Promise.resolve());
  const localSpeechGenerationRef = useRef(0);
  const onSendMessageRef = useRef(onSendMessage);
  const onRealtimeUserMessageRef = useRef(onRealtimeUserMessage);
  const onRealtimeAssistantChunkRef = useRef(onRealtimeAssistantChunk);
  const onRealtimeAssistantResponseEndRef = useRef(onRealtimeAssistantResponseEnd);
  const onRealtimeErrorRef = useRef(onRealtimeError);
  const onStopCurrentResponseRef = useRef(onStopCurrentResponse);

  const isSpeakingRef = useRef(false);
  const realtimeVoiceRef = useRef<RealtimeVoiceService | null>(null);
  const activeGlassRef = useRef<PairedWearableRecord | null>(null);
  const wearableRelayCleanupRef = useRef<(() => Promise<void>) | null>(null);
  const vadRef = useRef<VADService | null>(null);
    const persistRealtimeAudioChunk = useCallback(async (audioBase64: string, format: string) => {
      const directory = FileSystem.cacheDirectory || FileSystem.documentDirectory;
      if (!directory) {
        // Fallback: return a data URI so expo-av can play directly without file I/O
        const mime = format === 'pcm' ? 'audio/wav' : 'audio/mpeg';
        return `data:${mime};base64,${audioBase64}`;
      }

      realtimeAudioSequenceRef.current += 1;
      const extension = format === 'pcm' ? 'wav' : 'mp3';
      const fileUri = `${directory}realtime-voice-${Date.now()}-${realtimeAudioSequenceRef.current}.${extension}`;
      await FileSystem.writeAsStringAsync(fileUri, audioBase64, {
        encoding: FileSystem.EncodingType.Base64,
      });
      return fileUri;
    }, []);

  const [realtimeConnected, setRealtimeConnected] = useState(false);
  const voiceLanguageHint = language === 'zh' ? 'zh' : 'en';
  const voiceLanguageCode = voiceLanguageHint === 'zh' ? 'zh-CN' : 'en-US';

  // Refs for values used inside the realtime connection but that should NOT
  // tear down the socket when they change (e.g., voice ID settling from undefined).
  const agentVoiceIdRef = useRef(agentVoiceId);
  const realtimeModelIdRef = useRef(realtimeModelId);
  const voiceLanguageHintRef = useRef(voiceLanguageHint);

  // Keep refs in sync
  useEffect(() => { voiceModeRef.current = voiceMode; }, [voiceMode]);
  useEffect(() => { duplexModeRef.current = duplexMode; }, [duplexMode]);
  useEffect(() => { sendingRef.current = !!isSending; }, [isSending]);
  useEffect(() => { isSpeakingRef.current = isSpeaking; }, [isSpeaking]);
  useEffect(() => { agentVoiceIdRef.current = agentVoiceId; }, [agentVoiceId]);
  useEffect(() => { realtimeModelIdRef.current = realtimeModelId; }, [realtimeModelId]);
  useEffect(() => { voiceLanguageHintRef.current = voiceLanguageHint; }, [voiceLanguageHint]);
  useEffect(() => { onSendMessageRef.current = onSendMessage; }, [onSendMessage]);
  useEffect(() => { onRealtimeUserMessageRef.current = onRealtimeUserMessage; }, [onRealtimeUserMessage]);
  useEffect(() => { onRealtimeAssistantChunkRef.current = onRealtimeAssistantChunk; }, [onRealtimeAssistantChunk]);
  useEffect(() => { onRealtimeAssistantResponseEndRef.current = onRealtimeAssistantResponseEnd; }, [onRealtimeAssistantResponseEnd]);
  useEffect(() => { onRealtimeErrorRef.current = onRealtimeError; }, [onRealtimeError]);
  useEffect(() => { onStopCurrentResponseRef.current = onStopCurrentResponse; }, [onStopCurrentResponse]);

  // ── Recording options ──
  const iosMp3RecordingFormat = Audio ? (Audio as any).RECORDING_OPTION_IOS_OUTPUT_FORMAT_MPEGLAYER3 : undefined;
  const canRecordSupportedLocalAudioFormat = Platform.OS === 'ios' && !!iosMp3RecordingFormat;
  const voiceRecordingOptions = Audio ? {
    android: {
      extension: '.m4a',
      outputFormat: Audio.RECORDING_OPTION_ANDROID_OUTPUT_FORMAT_MPEG_4,
      audioEncoder: Audio.RECORDING_OPTION_ANDROID_AUDIO_ENCODER_AAC,
      sampleRate: 16000,
      numberOfChannels: 1,
      bitRate: 32000,
    },
    ios: {
      extension: canRecordSupportedLocalAudioFormat ? '.mp3' : '.m4a',
      outputFormat: canRecordSupportedLocalAudioFormat
        ? iosMp3RecordingFormat
        : Audio.RECORDING_OPTION_IOS_OUTPUT_FORMAT_MPEG4AAC,
      audioQuality: Audio.RECORDING_OPTION_IOS_AUDIO_QUALITY_HIGH,
      sampleRate: 16000,
      numberOfChannels: 1,
      bitRate: 32000,
      linearPCMBitDepth: 16,
      linearPCMIsBigEndian: false,
      linearPCMIsFloat: false,
    },
    web: {},
  } : null;

  const buildLocalRecordedAudioAttachment = useCallback(async (uri: string): Promise<UploadedChatAttachment> => {
    const extension = detectRecordedAudioExtension(uri);
    const mimeType = inferRecordedAudioMimeType(uri);
    const inferredName = uri.split('/').pop()?.split('?')[0] || `voice-${Date.now()}.${extension}`;

    let size = 0;
    try {
      const getInfoAsync = (FileSystem as any).getInfoAsync;
      if (typeof getInfoAsync === 'function') {
        const info = await getInfoAsync(uri);
        if (info && typeof info.size === 'number') {
          size = info.size;
        }
      }
    } catch {}

    return {
      url: uri,
      publicUrl: uri,
      localUri: uri,
      fileName: inferredName,
      originalName: inferredName,
      mimetype: mimeType,
      size,
      kind: 'audio',
      isImage: false,
      isAudio: true,
      isVideo: false,
    };
  }, []);

  const persistDirectLocalAudioCaptureAsWav = useCallback(async (pcmChunks: ArrayBuffer[]): Promise<string> => {
    const pcmBuffer = concatPcmChunks(pcmChunks);
    const wavBuffer = encodePcm16ToWav(pcmBuffer);
    const directory = FileSystem.cacheDirectory || FileSystem.documentDirectory;
    if (!directory) {
      return `data:audio/wav;base64,${wavBuffer.toString('base64')}`;
    }

    const fileUri = `${directory}local-direct-voice-${Date.now()}.wav`;
    await FileSystem.writeAsStringAsync(fileUri, wavBuffer.toString('base64'), {
      encoding: FileSystem.EncodingType.Base64,
    });
    return fileUri;
  }, []);

  const showLocalVoicePathBlockedAlert = useCallback((reason: 'audio-input-unavailable' | 'recording-format-unsupported') => {
    if (reason === 'audio-input-unavailable') {
      Alert.alert(
        t({ en: 'Local Audio Unavailable', zh: '本地音频不可用' }),
        t({
          en: 'The selected local model does not expose on-device audio input on this device yet. Agentrix will not send this recording to cloud transcription. Use the on-device live speech path when available, attach a wav/mp3 file manually, or switch models yourself.',
          zh: '当前选中的本地模型在这台设备上暂时还没有暴露端侧音频输入能力。Agentrix 不会再把这段录音偷偷送去云端转写。请优先使用端侧实时语音链路、手动附加 wav/mp3 文件，或自行切换模型。',
        }),
      );
      return;
    }

    Alert.alert(
      t({ en: 'Recording Format Blocked', zh: '录音格式受限' }),
      t({
        en: Platform.OS === 'android'
          ? 'This device does not currently expose a direct local microphone path that the on-device audio model can consume. Agentrix will not upload this recording for cloud transcription. Use on-device live speech recognition when available, or attach a wav/mp3 file manually until this build exposes direct PCM or wav/mp3 capture.'
          : 'This device did not produce a local microphone capture that the on-device audio model can consume. Agentrix will not upload this recording for cloud transcription. Use on-device live speech recognition when available, or attach a wav/mp3 file manually until direct local capture is available.',
        zh: Platform.OS === 'android'
          ? '当前设备暂时还没有暴露可被端侧音频模型直接消费的本地麦克风链路。Agentrix 不会再把这段录音上传到云端转写。请优先使用端侧实时语音识别，或在当前构建补齐直出 PCM / wav/mp3 前手动附加 wav/mp3 文件。'
          : '当前设备没有产出端侧音频模型可直接消费的本地麦克风录音。Agentrix 不会再把这段录音上传到云端转写。请优先使用端侧实时语音识别，或在直连本地采集可用前手动附加 wav/mp3 文件。',
      }),
    );
  }, [t]);

  // ── Live Speech stop (declared early so realtime useEffect can reference it) ──

  const stopLiveSpeech = useCallback((abort = false, manual = false) => {
    liveSpeechManualStopRef.current = manual;
    const realtimeMicrophone = realtimeMicrophoneRef.current;
    realtimeMicrophoneRef.current = null;
    const ctrl = liveSpeechRef.current;
    liveSpeechRef.current = null;
    if (isMountedRef.current) {
      setLiveListening(false);
      setLiveVoiceVolume(-2);
    }
    if (realtimeMicrophone) {
      void realtimeMicrophone.stop();
    }
    if (!ctrl) return;
    try {
      if (abort) ctrl.abort(); else void ctrl.stop();
    } catch {}
  }, []);

  const stopLocalHoldSpeech = useCallback((abort = false) => {
    const ctrl = localHoldSpeechRef.current;
    localHoldSpeechRef.current = null;
    localHoldTranscriptRef.current = '';
    if (isMountedRef.current) {
      setLiveListening(false);
      setLiveVoiceVolume(-2);
    }
    if (!ctrl) return;
    try {
      if (abort) ctrl.abort(); else void ctrl.stop();
    } catch {}
  }, []);

  // ── Check live speech availability ──
  useEffect(() => {
    const supportsRealtimeMicrophone = RealtimeMicrophoneService.isAvailable();
    const supportsLocalDuplexAudio = !!localModelSelected && !!localAudioInputAvailable && supportsRealtimeMicrophone;
    const available = isVoiceUiE2E
      ? true
      : ((useRealtimeChannel || supportsLocalDuplexAudio)
        ? supportsRealtimeMicrophone || isLiveSpeechRecognitionAvailable()
        : isLiveSpeechRecognitionAvailable());
    liveVoiceAvailableRef.current = available;
    setLiveVoiceAvailable(available);
  }, [isVoiceUiE2E, localAudioInputAvailable, localModelSelected, useRealtimeChannel]);

  // ── Realtime WebSocket Voice Channel ──
  // When useRealtimeChannel is true and duplex mode is active,
  // use the low-latency WebSocket path instead of HTTP serial.
  useEffect(() => {
    if (!useRealtimeChannel || !duplexMode || !token || !instanceId) {
      // Clean up existing realtime connection
      activeGlassRef.current = null;
      if (wearableRelayCleanupRef.current) {
        void wearableRelayCleanupRef.current();
        wearableRelayCleanupRef.current = null;
      }
      if (realtimeVoiceRef.current) {
        realtimeVoiceRef.current.disconnect();
        realtimeVoiceRef.current = null;
        setRealtimeConnected(false);
      }
      return;
    }

    const wsBaseUrl = (typeof WS_BASE === 'string' && WS_BASE)
      ? WS_BASE
      : API_BASE.replace(/^http/, 'ws').replace(/\/api$/, '');
    const wsUrl = `${wsBaseUrl}/voice`;
    let cancelled = false;
    let service: RealtimeVoiceService | null = null;

    const setupWearableRelay = async (sessionId: string) => {
      const pairedGlass = activeGlassRef.current;
      const voiceSocket = service?.getSocketClient();

      if (!pairedGlass || !voiceSocket || cancelled) {
        return;
      }

      if (wearableRelayCleanupRef.current) {
        await wearableRelayCleanupRef.current();
        wearableRelayCleanupRef.current = null;
      }

      const bleManager = new BleManager();
      const audioRelay = new WearableAudioRelay(bleManager, {
        deviceId: pairedGlass.id,
        sessionId,
      }, {
        onError: (error, direction) => {
          addVoiceDiagnostic('wearable-relay', 'audio-error', {
            direction,
            message: error.message,
            deviceId: pairedGlass.id,
          });
        },
      });
      const imageRelay = new WearableImageRelay(bleManager, {
        deviceId: pairedGlass.id,
        sessionId,
      }, {
        onError: (error) => {
          addVoiceDiagnostic('wearable-relay', 'image-error', {
            message: error.message,
            deviceId: pairedGlass.id,
          });
        },
      });
      const authInterceptor = new GlassAuthInterceptor(sessionId, {
        onPaymentDetected: (intent) => {
          addVoiceDiagnostic('wearable-relay', 'payment-detected', {
            intentId: intent.intentId,
            token: intent.token,
            amount: intent.amount,
          });
        },
        onPaymentResult: (result) => {
          addVoiceDiagnostic('wearable-relay', 'payment-result', result);
        },
      });

      try {
        await audioRelay.startUpstream(voiceSocket);
        audioRelay.startDownstream(voiceSocket);
        await imageRelay.start(voiceSocket);
        authInterceptor.attach(voiceSocket);
        wearableRelayCleanupRef.current = async () => {
          authInterceptor.detach();
          await imageRelay.stop().catch(() => {});
          await audioRelay.stop().catch(() => {});
          bleManager.destroy();
        };
        addVoiceDiagnostic('wearable-relay', 'bridge-ready', {
          deviceId: pairedGlass.id,
          sessionId,
        });
      } catch (error) {
        authInterceptor.detach();
        await imageRelay.stop().catch(() => {});
        await audioRelay.stop().catch(() => {});
        bleManager.destroy();
        addVoiceDiagnostic('wearable-relay', 'bridge-failed', {
          deviceId: pairedGlass.id,
          message: error instanceof Error ? error.message : String(error),
        });
      }
    };

    void (async () => {
      const pairedWearables = await WearablePairingStoreService.list().catch(() => []);
      activeGlassRef.current = pairedWearables.find((item) => item.kind === 'glass') || null;

      if (cancelled) {
        return;
      }

      service = new RealtimeVoiceService({
        onStateChange: (state) => {
          addVoiceDiagnostic('realtime-voice', 'state-change', { state });
          setRealtimeConnected(state !== 'disconnected' && state !== 'connecting' && state !== 'error');
          if (state === 'connected' && duplexModeRef.current && voiceModeRef.current) {
            void startLiveSpeechInternalRef.current?.();
          }
          switch (state) {
            case 'listening': setVoicePhase('recording'); break;
            case 'thinking': setVoicePhase('thinking'); break;
            case 'speaking': setVoicePhase('speaking'); break;
            case 'connected': setVoicePhase('idle'); break;
          }
        },
        onSessionReady: (sessionId) => {
          void setupWearableRelay(sessionId);
        },
        onInterimTranscript: (text) => {
          setTranscriptPreview(text);
        },
        onFinalTranscript: (text) => {
          const normalized = text.trim();
          if (!normalized) {
            setTranscriptPreview('');
            return;
          }

          setTranscriptPreview(normalized);
          addVoiceDiagnostic('realtime-voice', 'final-transcript', { text: normalized.slice(0, 160) });

          const now = Date.now();
          const isDuplicateFinal = normalized === lastRealtimeFinalTranscriptRef.current
            && now - lastRealtimeFinalAtRef.current < REALTIME_FINAL_TRANSCRIPT_DEDUPE_WINDOW_MS;

          if (isDuplicateFinal) {
            addVoiceDiagnostic('realtime-voice', 'final-transcript-duplicate-skipped', {
              text: normalized.slice(0, 160),
            });
            return;
          }

          lastRealtimeFinalTranscriptRef.current = normalized;
          lastRealtimeFinalAtRef.current = now;
          onRealtimeUserMessageRef.current?.(normalized);
        },
        onAgentTextChunk: (chunk) => {
          if (!chunk) return;
          onRealtimeAssistantChunkRef.current?.(chunk);
        },
        onAgentAudioChunk: (audioBase64, format) => {
          if (audioBase64 && audioPlayerRef.current) {
            setIsSpeaking(true);
            isSpeakingRef.current = true;
            setVoicePhase('speaking');
            void persistRealtimeAudioChunk(audioBase64, format)
              .then((fileUri) => {
                audioPlayerRef.current?.enqueue(fileUri);
              })
              .catch((error) => {
                addVoiceDiagnostic('realtime-voice', 'audio-persist-failed', {
                  error: error instanceof Error ? error.message : String(error),
                });
                console.warn('[RealtimeVoice] Failed to persist audio chunk:', error);
              });
          }
        },
        onAgentSpeechStart: () => {
          realtimeMicrophoneRef.current?.muteForEchoCancel();
          setIsSpeaking(true);
          isSpeakingRef.current = true;
          setVoicePhase('speaking');
        },
        onAgentResponseEnd: () => {
          setVoicePhase('idle');
          onRealtimeAssistantResponseEndRef.current?.();
        },
        onToolCall: (tool, status) => {
          addVoiceDiagnostic('realtime-voice', `tool-${status}`, { tool });
        },
        onError: (error) => {
          addVoiceDiagnostic('realtime-voice', 'error', { error });
          console.warn('[RealtimeVoice] Error:', error);
          onRealtimeErrorRef.current?.(error);
        },
        onDisconnect: (reason) => {
          setRealtimeConnected(false);
          addVoiceDiagnostic('realtime-voice', 'disconnected', { reason });
          if (wearableRelayCleanupRef.current) {
            void wearableRelayCleanupRef.current();
            wearableRelayCleanupRef.current = null;
          }
          onRealtimeAssistantResponseEndRef.current?.();
        },
      });

      if (cancelled) {
        service.disconnect();
        return;
      }

      realtimeVoiceRef.current = service;
      service.connect({
        wsUrl,
        token,
        instanceId,
        language: voiceLanguageHintRef.current,
        modelId: realtimeModelIdRef.current,
        agentVoiceId: agentVoiceIdRef.current,
        deviceType: activeGlassRef.current ? 'glass' : 'phone',
      });
    })();

    return () => {
      cancelled = true;
      activeGlassRef.current = null;
      if (wearableRelayCleanupRef.current) {
        void wearableRelayCleanupRef.current();
        wearableRelayCleanupRef.current = null;
      }
      service?.disconnect();
      if (realtimeVoiceRef.current === service) {
        realtimeVoiceRef.current = null;
      }
      setRealtimeConnected(false);
    };
  }, [
    duplexMode,
    instanceId,
    persistRealtimeAudioChunk,
    token,
    isVoiceUiE2E,
    useRealtimeChannel,
    stopLiveSpeech,
  ]);

  // ── TTS ──

  const resumeLiveSpeechFn = useCallback(() => {
    if (!duplexModeRef.current || sendingRef.current) return;
    // Will be called after TTS finishes; startLiveSpeech defined below
  }, []);

  const cancelPendingLocalSpeechOutput = useCallback(() => {
    localSpeechGenerationRef.current += 1;
    localSpeechPlaybackQueueRef.current = Promise.resolve();
    void LocalSpeechOutputService.cancelActiveSynthesis();
  }, []);

  // Init AudioQueuePlayer
  useEffect(() => {
    try {
      audioPlayerRef.current = new AudioQueuePlayer(() => {
        setIsSpeaking(false);
        isSpeakingRef.current = false;
        setVoicePhase((prev) => (prev === 'speaking' ? 'idle' : prev));
        setSpeakingMessageId(null);
        // Resume duplex listening after TTS finishes
        if (duplexModeRef.current && voiceModeRef.current && !sendingRef.current) {
          // Unmute mic (it was muted for echo cancellation)
          realtimeMicrophoneRef.current?.unmuteInput();
          setTimeout(() => {
            if (duplexModeRef.current && voiceModeRef.current && !isSpeakingRef.current) {
              // Only restart mic if it's not already running
              if (!realtimeMicrophoneRef.current) {
                startLiveSpeechInternalRef.current?.();
              }
            }
          }, 200);
        }
      });
    } catch (err) {
      console.warn('[useVoiceSession] AudioQueuePlayer init failed:', err);
    }
    return () => {
      cancelPendingLocalSpeechOutput();
      void LocalSpeechOutputService.release();
      try { audioPlayerRef.current?.destroy(); } catch {}
      stopLocalHoldSpeech(true);
      stopLiveSpeech(true, true);
    };
  }, [cancelPendingLocalSpeechOutput, stopLiveSpeech, stopLocalHoldSpeech]);

  // voiceModeRequested sync
  useEffect(() => {
    if (voiceModeRequested) setVoiceMode(true);
  }, [voiceModeRequested]);

  useEffect(() => {
    if (duplexModeRequested) setDuplexMode(true);
  }, [duplexModeRequested]);

  // voiceMode off → reset
  useEffect(() => {
    if (!voiceMode) {
      setDuplexMode(false);
      setVoicePhase('idle');
      setIsRecording(false);
      isRecordingRef.current = false;
      cancelPendingLocalSpeechOutput();
      audioPlayerRef.current?.stopAll();
      setIsSpeaking(false);
      setSpeakingMessageId(null);
      stopLocalHoldSpeech(true);
      stopLiveSpeech(true, true);
    }
  }, [cancelPendingLocalSpeechOutput, stopLiveSpeech, stopLocalHoldSpeech, voiceMode]);

  // duplexMode → enable voiceMode, autoSpeak, tap mode
  useEffect(() => {
    if (duplexMode) {
      setVoiceMode(true);
      setAutoSpeak(true);
      setVoiceInteractionMode('tap');
    } else {
      setAutoSpeak(false);
      setVoiceInteractionMode('hold');
    }
  }, [duplexMode]);

  useEffect(() => {
    const shouldKeepBackgroundSession = voiceMode || duplexMode || isRecording || liveListening || isSpeaking;
    const backgroundVoice = backgroundVoiceRef.current;
    if (!backgroundVoice) return;
    if (shouldKeepBackgroundSession) {
      backgroundVoice.activate();
    } else {
      backgroundVoice.deactivate();
    }
  }, [duplexMode, isRecording, isSpeaking, liveListening, voiceMode]);

  const enqueueSpeechSegment = useCallback((segment: string) => {
    const trimmed = segment.trim();
    if (!trimmed || trimmed.length < 2) return;

    if (preferLocalTextToSpeech) {
      if (!LocalSpeechOutputService.hasOnDeviceSpeechPack(localModelId)) {
        audioPlayerRef.current?.enqueueLocal(trimmed, voiceLanguageCode, speechRate);
        return;
      }

      const generation = localSpeechGenerationRef.current;
      localSpeechPlaybackQueueRef.current = localSpeechPlaybackQueueRef.current
        .catch(() => undefined)
        .then(async () => {
          if (generation !== localSpeechGenerationRef.current) {
            return;
          }

          try {
            const synthesized = await LocalSpeechOutputService.synthesizeToFile({
              modelId: localModelId,
              text: trimmed,
            });
            if (generation !== localSpeechGenerationRef.current || audioPlayerRef.current?.destroyed) {
              return;
            }

            audioPlayerRef.current?.enqueueGeneratedAudio(
              synthesized.fileUri,
              trimmed,
              voiceLanguageCode,
              speechRate,
            );
            return;
          } catch (error) {
            if (LocalSpeechOutputService.isCancellationError(error)) {
              return;
            }

            console.warn('[useVoiceSession] Local speech synthesis failed, falling back to device speech:', error);
          }

          if (generation !== localSpeechGenerationRef.current || audioPlayerRef.current?.destroyed) {
            return;
          }

          audioPlayerRef.current?.enqueueLocal(trimmed, voiceLanguageCode, speechRate);
        });
      return;
    }

    const rateParam = speechRate && speechRate !== 1.0 ? `&rate=${speechRate}` : '';
    const url = `${API_BASE}/voice/tts?text=${encodeURIComponent(trimmed)}${agentVoiceId ? `&voice=${agentVoiceId}` : ''}${rateParam}`;
    audioPlayerRef.current?.enqueue(url, trimmed, voiceLanguageCode, speechRate);
  }, [agentVoiceId, localModelId, preferLocalTextToSpeech, speechRate, voiceLanguageCode]);

  const speakText = useCallback((text: string) => {
    if (!text || text.startsWith('⚠️') || text.startsWith('Error:')) return;
    if (duplexModeRef.current) {
      stopLiveSpeech(true, false);
    }
    // Strip markdown formatting before TTS
    const cleanText = text
      .replace(/\*\*(.+?)\*\*/g, '$1')
      .replace(/\*(.+?)\*/g, '$1')
      .replace(/`{1,3}[^`]*`{1,3}/g, '')
      .replace(/^#{1,6}\s+/gm, '')
      .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
      .replace(/[*_~`#>|]/g, '')
      .trim();
    if (!cleanText) return;
    setIsSpeaking(true);
    setVoicePhase((prev) => (prev === 'recording' || prev === 'transcribing' ? prev : 'speaking'));
    const sentences = cleanText.match(/[^。！？.!?\n]+[。！？.!?\n]*/g) || [cleanText];
    for (const s of sentences) {
      enqueueSpeechSegment(s);
    }
  }, [enqueueSpeechSegment, stopLiveSpeech]);

  const stopSpeaking = useCallback(() => {
    cancelPendingLocalSpeechOutput();
    audioPlayerRef.current?.stopAll();
    setIsSpeaking(false);
    setVoicePhase((prev) => (prev === 'speaking' ? 'idle' : prev));
    setSpeakingMessageId(null);
  }, [cancelPendingLocalSpeechOutput]);

  useEffect(() => {
    try {
      const service = new BackgroundVoiceService();
      backgroundVoiceRef.current = service;
      void service.init({
        onTimeout: () => {
          setDuplexMode(false);
          setVoiceMode(false);
          stopSpeaking();
          stopLocalHoldSpeech(true);
          stopLiveSpeech(true, true);
        },
      });

      return () => {
        service.destroy();
        backgroundVoiceRef.current = null;
      };
    } catch (err) {
      console.warn('[useVoiceSession] BackgroundVoiceService init failed:', err);
    }
  }, [stopLiveSpeech, stopLocalHoldSpeech, stopSpeaking]);

  const handleSpeakMessage = useCallback((text: string, messageId?: string) => {
    if (!text) return;
    if (messageId) setSpeakingMessageId(messageId);
    speakText(text);
  }, [speakText]);

  const enqueueStreamedSpeech = useCallback((chunk: string, flush = false) => {
    // Only auto-speak in duplex/realtime mode or when user explicitly enabled autoSpeak.
    // PTT (hold-to-talk) mode should NOT auto-read agent responses.
    if (!(duplexModeRef.current || autoSpeak)) return;

    if (duplexModeRef.current) {
      stopLiveSpeech(true, false);
    }

    if (chunk) {
      pendingTtsSentenceRef.current += chunk;
    }

    const sentenceRegex = /[^。！？.!?\n]+[。！？.!?\n]+/g;
    const matches = pendingTtsSentenceRef.current.match(sentenceRegex) || [];
    const shouldEarlyFlush =
      !matches.length &&
      pendingTtsSentenceRef.current.trim().length >= 36 &&
      /[，,、:;； ]/.test(pendingTtsSentenceRef.current);

    let segmentsToSpeak = matches.map((s) => s.trim()).filter(Boolean);

    if (shouldEarlyFlush) {
      const earlySegment = pendingTtsSentenceRef.current.trim();
      if (earlySegment) {
        segmentsToSpeak = [earlySegment];
        pendingTtsSentenceRef.current = '';
      }
    }

    if (segmentsToSpeak.length > 0) {
      setIsSpeaking(true);
      setVoicePhase((prev) => (prev === 'recording' || prev === 'transcribing' ? prev : 'speaking'));
      streamedTtsStartedRef.current = true;
      for (const sentence of segmentsToSpeak) {
        enqueueSpeechSegment(sentence);
      }
      if (!shouldEarlyFlush) {
        pendingTtsSentenceRef.current = pendingTtsSentenceRef.current.slice(matches.join('').length);
      }
    }

    if (flush) {
      const remainder = pendingTtsSentenceRef.current.trim();
      if (remainder) {
        setIsSpeaking(true);
        setVoicePhase((prev) => (prev === 'recording' || prev === 'transcribing' ? prev : 'speaking'));
        streamedTtsStartedRef.current = true;
        enqueueSpeechSegment(remainder);
      }
      pendingTtsSentenceRef.current = '';
    }
  }, [autoSpeak, enqueueSpeechSegment, stopLiveSpeech]);

  const resetVoicePhaseAfterResponse = useCallback(() => {
    setVoicePhase((prev) => (prev === 'recording' || prev === 'transcribing' ? prev : 'idle'));
    // Reset streamed TTS tracking for next message
    pendingTtsSentenceRef.current = '';
    streamedTtsStartedRef.current = false;
  }, []);

  // ── Live Speech Recognition (duplex) ──

  const startLiveSpeechInternal = useCallback(async () => {
    if (!isMountedRef.current) return;

    if (
      !isVoiceUiE2E
      && !useRealtimeChannel
      && duplexModeRef.current
      && voiceModeRef.current
      && !!localModelSelected
      && !!localAudioInputAvailable
      && RealtimeMicrophoneService.isAvailable()
    ) {
      if (realtimeMicrophoneRef.current || liveSpeechStartingRef.current) {
        return;
      }

      liveSpeechStartingRef.current = true;
      addVoiceDiagnostic('voice-session', 'local-duplex-audio-start-request', {
        model: localModelId || 'local-model',
      });

      try {
        const pcmChunks: ArrayBuffer[] = [];
        const realtimeMicrophone = new RealtimeMicrophoneService({
          onFrame: (audioChunk) => {
            pcmChunks.push(audioChunk);
          },
          onVolumeChange: (value) => {
            if (!isMountedRef.current) return;
            setLiveVoiceVolume(value * 100 - 2);
          },
          onSpeechStart: () => {
            if (!isMountedRef.current) return;
            setLiveListening(true);
            setVoicePhase('recording');
            setTranscriptPreview('');
          },
          onSpeechEnd: () => {
            const capturedChunks = pcmChunks.splice(0, pcmChunks.length);
            const activeMicrophone = realtimeMicrophoneRef.current;
            realtimeMicrophoneRef.current = null;

            if (isMountedRef.current) {
              setLiveListening(false);
              setLiveVoiceVolume(-2);
              setVoicePhase('transcribing');
            }

            void (async () => {
              try {
                await activeMicrophone?.stop();
              } catch {}

              const pcmBuffer = concatPcmChunks(capturedChunks);
              if (pcmBuffer.length === 0) {
                addVoiceDiagnostic('voice-session', 'local-duplex-audio-empty', {
                  model: localModelId || 'local-model',
                });
                if (!isMountedRef.current) return;
                setVoicePhase('idle');
                if (duplexModeRef.current && voiceModeRef.current && !sendingRef.current) {
                  void startLiveSpeechInternalRef.current?.();
                }
                return;
              }

              const durationMs = Math.round(estimatePcmDurationMs(pcmBuffer.length));
              addVoiceDiagnostic('voice-session', 'local-duplex-audio-stop', {
                model: localModelId || 'local-model',
                pcmBytes: pcmBuffer.length,
                durationMs,
              });

              const wavUri = await persistDirectLocalAudioCaptureAsWav(capturedChunks);
              const localAudioAttachment = await buildLocalRecordedAudioAttachment(wavUri);
              if (!isMountedRef.current) return;
              setTranscriptPreview(t({ en: '[Local voice message]', zh: '[本地语音消息]' }));
              setVoicePhase('thinking');
              setTimeout(() => onSendMessageRef.current('', [localAudioAttachment]), 60);
            })();
          },
          onError: (error) => {
            if (!isMountedRef.current) return;
            const message = error?.message || 'Local duplex audio error';
            if (/permission denied/i.test(message)) {
              setLiveSpeechPermissionState('denied');
            }
            addVoiceDiagnostic('voice-session', 'local-duplex-audio-error', {
              message,
              model: localModelId || 'local-model',
            });
            realtimeMicrophoneRef.current = null;
            setLiveListening(false);
            setLiveVoiceVolume(-2);
            setVoicePhase('idle');
            setTranscriptPreview('');
          },
        });

        await realtimeMicrophone.start();
        realtimeMicrophoneRef.current = realtimeMicrophone;
        liveSpeechManualStopRef.current = false;
        setLiveSpeechPermissionState('granted');
        setLiveListening(true);
        setVoicePhase('recording');
        setTranscriptPreview('');
        addVoiceDiagnostic('voice-session', 'local-duplex-audio-started', {
          model: localModelId || 'local-model',
        });
        return;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (/permission denied/i.test(message)) {
          setLiveSpeechPermissionState('denied');
        }
        addVoiceDiagnostic('voice-session', 'local-duplex-audio-start-failed', {
          message,
          model: localModelId || 'local-model',
        });
        console.warn('Local duplex audio start failed:', error);
      } finally {
        liveSpeechStartingRef.current = false;
      }
    }

    if (
      !isVoiceUiE2E
      && useRealtimeChannel
      && duplexModeRef.current
      && voiceModeRef.current
      && realtimeVoiceRef.current?.isConnected
      && RealtimeMicrophoneService.isAvailable()
    ) {
      if (realtimeMicrophoneRef.current || liveSpeechStartingRef.current) {
        return;
      }

      liveSpeechStartingRef.current = true;
      addVoiceDiagnostic('voice-session', 'realtime-mic-start-request');

      try {
        const realtimeMicrophone = new RealtimeMicrophoneService({
          onFrame: (audioChunk) => {
            realtimeVoiceRef.current?.sendAudioChunk(audioChunk);
          },
          onVolumeChange: (value) => {
            if (!isMountedRef.current) return;
            setLiveVoiceVolume(value * 100 - 2);
          },
          onSpeechStart: () => {
            if (!isMountedRef.current) return;
            setVoicePhase('recording');
          },
          onBargeIn: () => {
            if (!isMountedRef.current) return;
            // User spoke over agent — interrupt playback and resume mic
            addVoiceDiagnostic('voice-session', 'barge-in');
            cancelPendingLocalSpeechOutput();
            audioPlayerRef.current?.stopAll();
            setIsSpeaking(false);
            isSpeakingRef.current = false;
            realtimeVoiceRef.current?.sendInterrupt();
            realtimeMicrophoneRef.current?.unmuteInput();
            setVoicePhase('recording');
          },
          onSpeechEnd: () => {
            if (!isMountedRef.current) return;
            realtimeMicrophoneRef.current?.pauseInput(2500);
            realtimeVoiceRef.current?.endAudioInput();
            setVoicePhase((prev) => (prev === 'recording' ? 'thinking' : prev));
          },
          onError: (error) => {
            if (!isMountedRef.current) return;
            const message = error?.message || 'Realtime microphone error';
            if (/permission denied/i.test(message)) {
              setLiveSpeechPermissionState('denied');
            }
            addVoiceDiagnostic('voice-session', 'realtime-mic-error', { message });
            setLiveListening(false);
            setVoicePhase('idle');
            setTranscriptPreview('');
          },
        });

        await realtimeMicrophone.start();
        realtimeMicrophoneRef.current = realtimeMicrophone;
        liveSpeechManualStopRef.current = false;
        setLiveSpeechPermissionState('granted');
        setLiveListening(true);
        setVoicePhase('recording');
        setTranscriptPreview('');
        addVoiceDiagnostic('voice-session', 'realtime-mic-started');
        return;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (/permission denied/i.test(message)) {
          setLiveSpeechPermissionState('denied');
        }
        addVoiceDiagnostic('voice-session', 'realtime-mic-start-failed', { message });
        console.warn('Realtime microphone start failed:', error);
      } finally {
        liveSpeechStartingRef.current = false;
      }
    }

    const skipReasons = [
      !duplexModeRef.current ? 'duplex-off' : '',
      liveSpeechRef.current ? 'already-listening' : '',
      liveSpeechStartingRef.current ? 'already-starting' : '',
      !liveVoiceAvailableRef.current ? 'live-voice-unavailable' : '',
      !voiceModeRef.current ? 'voice-mode-off' : '',
    ].filter(Boolean);

    if (skipReasons.length > 0) {
      const nextReason = skipReasons.join(',');
      if (lastLiveSpeechSkipReasonRef.current !== nextReason) {
        lastLiveSpeechSkipReasonRef.current = nextReason;
        addVoiceDiagnostic('voice-session', 'live-speech-skip', {
          reasons: skipReasons,
          isSpeaking,
        });
      }
      return;
    }

    liveSpeechStartingRef.current = true;
    lastLiveSpeechSkipReasonRef.current = '';
    addVoiceDiagnostic('voice-session', 'live-speech-start-request', { language: voiceLanguageHint });

    try {
    const permission = await requestLiveSpeechPermissions();
    if (!permission?.granted) {
      setLiveSpeechPermissionState('denied');
      addVoiceDiagnostic('voice-session', 'live-speech-permission-denied');
      Alert.alert(
        t({ en: 'Speech Permission', zh: '语音权限' }),
        t({ en: 'Realtime voice needs microphone and speech recognition permissions.', zh: '实时语音需要麦克风和语音识别权限。' }),
      );
      return;
    }

    setLiveSpeechPermissionState('granted');

    liveSpeechManualStopRef.current = false;
    lastLiveFinalTranscriptRef.current = '';
    liveSpeechRef.current = startLiveSpeechRecognition(
      voiceLanguageHint,
      {
        onStart: () => {
          if (!isMountedRef.current) return;
          addVoiceDiagnostic('voice-session', 'live-speech-started');
          liveSpeechConsecutiveErrorsRef.current = 0;
          setLiveListening(true);
          setVoicePhase('recording');
          setTranscriptPreview('');
        },
        onEnd: () => {
          if (!isMountedRef.current) return;
          addVoiceDiagnostic('voice-session', 'live-speech-ended', {
            manualStop: liveSpeechManualStopRef.current,
            duplexMode: duplexModeRef.current,
          });
          liveSpeechRef.current = null;
          setLiveListening(false);
          setLiveVoiceVolume(-2);
          if (!duplexModeRef.current || liveSpeechManualStopRef.current) {
            setVoicePhase((prev) => (prev === 'recording' ? 'idle' : prev));
            return;
          }
          // Don't auto-restart if errors exceeded threshold
          if (liveSpeechConsecutiveErrorsRef.current >= 3) {
            addVoiceDiagnostic('voice-session', 'live-speech-auto-restart-blocked', {
              errors: liveSpeechConsecutiveErrorsRef.current,
            });
            setVoicePhase('idle');
            // Auto-recovery: retry after 10s cooldown
            setTimeout(() => {
              if (duplexModeRef.current && voiceModeRef.current && !liveSpeechManualStopRef.current) {
                liveSpeechConsecutiveErrorsRef.current = 0;
                liveSpeechLastErrorTimeRef.current = 0;
                addVoiceDiagnostic('voice-session', 'live-speech-auto-recovery');
                startLiveSpeechInternalRef.current?.();
              }
            }, 10000);
            return;
          }
          // Auto-restart with backoff
          const delay = 300 + liveSpeechConsecutiveErrorsRef.current * 500;
          setTimeout(() => {
            startLiveSpeechInternalRef.current?.();
          }, delay);
        },
        onSpeechStart: () => {
          if (!isMountedRef.current) return;
          // Use ref to avoid stale closure
          if (isSpeakingRef.current) {
            stopSpeaking();
            realtimeVoiceRef.current?.sendInterrupt();
          }
        },
        onInterimResult: (transcript) => {
          setTranscriptPreview(transcript);
          setVoicePhase('recording');
        },
        onFinalResult: (transcript) => {
          if (!isMountedRef.current) return;
          const normalized = transcript.trim();
          if (!normalized || normalized === lastLiveFinalTranscriptRef.current) return;
          liveSpeechConsecutiveErrorsRef.current = 0;
          addVoiceDiagnostic('voice-session', 'live-speech-final', { transcript: normalized.slice(0, 160) });
          lastLiveFinalTranscriptRef.current = normalized;
          setTranscriptPreview(normalized);
          stopLiveSpeech(true, false);
          // Use ref to avoid stale closure
          if (isSpeakingRef.current) stopSpeaking();
          realtimeVoiceRef.current?.sendInterrupt();
          onStopCurrentResponseRef.current?.(true);
          setVoicePhase('thinking');
          setTimeout(() => {
            if (useRealtimeChannel && realtimeVoiceRef.current?.isConnected) {
              onRealtimeUserMessageRef.current?.(normalized);
              realtimeVoiceRef.current.sendText(normalized);
              return;
            }
            onSendMessageRef.current(normalized);
          }, 60);
        },
        onError: (error) => {
          if (!isMountedRef.current) return;
          if (error?.error === 'aborted' || error?.error === 'no-speech') return;
          // Reset counter if last error was >5s ago (time-windowed backoff)
          const now = Date.now();
          if (now - liveSpeechLastErrorTimeRef.current > 5000) {
            liveSpeechConsecutiveErrorsRef.current = 0;
          }
          liveSpeechConsecutiveErrorsRef.current++;
          liveSpeechLastErrorTimeRef.current = now;
          addVoiceDiagnostic('voice-session', 'live-speech-error', {
            ...error,
            consecutiveErrors: liveSpeechConsecutiveErrorsRef.current,
          });
          setLiveListening(false);
          setVoicePhase('idle');
          setTranscriptPreview('');
        },
        onVolumeChange: (value) => {
          if (!isMountedRef.current) return;
          setLiveVoiceVolume(value);
        },
      },
      [instanceName || '', agentVoiceId || '', 'Agentrix'],
      { mode: 'duplex' },
    );
    } catch (err) {
      addVoiceDiagnostic('voice-session', 'live-speech-start-failed', err);
      console.warn('startLiveSpeechInternal failed:', err);
      liveSpeechRef.current = null;
      setLiveListening(false);
      setVoicePhase('idle');
    } finally {
      liveSpeechStartingRef.current = false;
    }
  }, [
    agentVoiceId,
    buildLocalRecordedAudioAttachment,
    cancelPendingLocalSpeechOutput,
    instanceName,
    localAudioInputAvailable,
    localModelId,
    localModelSelected,
    persistDirectLocalAudioCaptureAsWav,
    stopLiveSpeech,
    stopSpeaking,
    t,
    isVoiceUiE2E,
    useRealtimeChannel,
    voiceLanguageHint,
  ]);

  // Keep startLiveSpeechInternal ref in sync for callbacks
  useEffect(() => { startLiveSpeechInternalRef.current = startLiveSpeechInternal; }, [startLiveSpeechInternal]);

  useEffect(() => {
    if (!isVoiceUiE2E || typeof window === 'undefined') {
      return;
    }

    const handlePermissionChange = (event: Event) => {
      const nextState = (event as CustomEvent<'granted' | 'denied'>).detail;
      if (nextState !== 'granted' && nextState !== 'denied') {
        return;
      }

      setLiveSpeechPermissionState(nextState);
      if (nextState === 'denied') {
        stopLiveSpeech(true, true);
        setVoicePhase('idle');
        setTranscriptPreview('');
      }
    };

    window.addEventListener('agentrix:e2e-live-speech-permission', handlePermissionChange as EventListener);
    return () => {
      window.removeEventListener('agentrix:e2e-live-speech-permission', handlePermissionChange as EventListener);
    };
  }, [isVoiceUiE2E, stopLiveSpeech]);

  useEffect(() => {
    if (!isVoiceUiE2E || typeof window === 'undefined') {
      return;
    }

    const nextState = window.__AGENTRIX_VOICE_UI_E2E_LIVE_SPEECH_PERMISSION__;
    if (!nextState || nextState === liveSpeechPermissionState) {
      return;
    }

    setLiveSpeechPermissionState(nextState);
    if (nextState === 'denied') {
      stopLiveSpeech(true, true);
      setVoicePhase('idle');
      setTranscriptPreview('');
    }
  }, [isVoiceUiE2E, liveSpeechPermissionState, stopLiveSpeech]);

  // Duplex mode toggle → start/stop live speech
  useEffect(() => {
    if (duplexMode) {
      // Brief delay to allow mic handoff from wake word listener
      const timer = setTimeout(() => {
        void startLiveSpeechInternal();
      }, 300);
      return () => clearTimeout(timer);
    } else {
      stopLiveSpeech(true, true);
    }
  }, [duplexMode, startLiveSpeechInternal, stopLiveSpeech]);

  useEffect(() => {
    if (useRealtimeChannel && !realtimeConnected && realtimeMicrophoneRef.current) {
      stopLiveSpeech(true, true);
    }
  }, [realtimeConnected, stopLiveSpeech, useRealtimeChannel]);

  // Auto-restart live speech when TTS finishes (isSpeaking: true → false)
  const wasSpeakingRef = useRef(false);
  useEffect(() => {
    if (isSpeaking) {
      wasSpeakingRef.current = true;
      return;
    }
    // Only restart if transitioning from speaking → not speaking
    if (wasSpeakingRef.current && duplexMode && voiceMode) {
      wasSpeakingRef.current = false;
      const timer = setTimeout(() => { void startLiveSpeechInternal(); }, 200);
      return () => clearTimeout(timer);
    }
  }, [duplexMode, isSpeaking, startLiveSpeechInternal, voiceMode]);

  // ── Voice Recording ──

  const resetAudioModeAfterRecording = useCallback(async () => {
    if (!Audio) return;
    try {
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
        playsInSilentModeIOS: true,
        staysActiveInBackground: false,
      });
    } catch {}
  }, []);

  const startVoiceRecording = useCallback(async () => {
    const canUseRealtimePcmForHold = !duplexModeRef.current
      && !!localModelSelected
      && !!localAudioInputAvailable
      && RealtimeMicrophoneService.isAvailable();

    if (!Audio && !canUseRealtimePcmForHold && !(preferLocalSpeechRecognition && (isVoiceUiE2E || isLiveSpeechRecognitionAvailable()))) {
      Alert.alert(t({ en: 'Voice Unavailable', zh: '语音不可用' }), t({ en: 'Audio module not available.', zh: '当前音频模块不可用。' }));
      return;
    }
    if (voicePhase === 'transcribing') {
      Alert.alert(t({ en: 'Voice Busy', zh: '语音处理中' }), t({ en: 'Still transcribing. Please wait.', zh: '上一段录音还在转写中，请稍等。' }));
      return;
    }
    try {
      if (!isRecordingRef.current) {
        isRecordingRef.current = true;
        if (isSpeaking) {
          cancelPendingLocalSpeechOutput();
          await audioPlayerRef.current?.stopAll();
          setIsSpeaking(false);
        }
        onStopCurrentResponseRef.current?.(true);
        setVoicePhase('recording');
        setTranscriptPreview('');

        const shouldPreferDirectLocalAudioForHold = canUseRealtimePcmForHold || (
          !duplexModeRef.current
          && !!localModelSelected
          && !!localAudioInputAvailable
          && canRecordSupportedLocalAudioFormat
        );
        const canUseLocalSpeechForHold = !duplexModeRef.current
          && !shouldPreferDirectLocalAudioForHold
          && preferLocalSpeechRecognition
          && (isVoiceUiE2E || isLiveSpeechRecognitionAvailable());

        // When the local model can't handle audio directly (e.g. Gemma text+vision),
        // don't block — fall through to cloud recording path which transcribes
        // audio to text and sends the text to the local model.
        const shouldBlockLocalRecordingStart = false;

        if (shouldBlockLocalRecordingStart) {
          isRecordingRef.current = false;
          setVoicePhase('idle');
          showLocalVoicePathBlockedAlert(
            localAudioInputAvailable ? 'recording-format-unsupported' : 'audio-input-unavailable',
          );
          return;
        }

        if (canUseRealtimePcmForHold) {
          addVoiceDiagnostic('voice-session', 'hold-local-audio-start-request', {
            model: localModelId || 'local-model',
          });

          const pcmChunks: ArrayBuffer[] = [];
          const realtimeMicrophone = new RealtimeMicrophoneService({
            onFrame: (audioChunk) => {
              pcmChunks.push(audioChunk);
            },
            onVolumeChange: (value) => {
              if (!isMountedRef.current) return;
              setLiveVoiceVolume(value * 100 - 2);
            },
            onSpeechStart: () => {
              if (!isMountedRef.current) return;
              setVoicePhase('recording');
            },
            onError: (error) => {
              if (!isMountedRef.current) return;
              const message = error?.message || 'Local audio capture error';
              if (/permission denied/i.test(message)) {
                setLiveSpeechPermissionState('denied');
              }
              addVoiceDiagnostic('voice-session', 'hold-local-audio-error', {
                message,
                model: localModelId || 'local-model',
              });
              localDirectAudioCaptureRef.current = null;
              isRecordingRef.current = false;
              setIsRecording(false);
              setLiveVoiceVolume(-2);
              setVoicePhase('idle');
              Alert.alert(t({ en: 'Voice Error', zh: '语音错误' }), message);
            },
          });

          localDirectAudioCaptureRef.current = {
            microphone: realtimeMicrophone,
            pcmChunks,
          };

          try {
            // Pre-flight: request RECORD_AUDIO via expo-av so the system permission
            // dialog is shown on first use. The Picovoice VoiceProcessor only
            // exposes hasRecordAudioPermission() (read-only) — without this prep
            // Android users see "permission denied" even on cold install.
            if (Audio) {
              try {
                const permResult = await Audio.requestPermissionsAsync();
                if (!permResult?.granted) {
                  setLiveSpeechPermissionState('denied');
                  localDirectAudioCaptureRef.current = null;
                  isRecordingRef.current = false;
                  setIsRecording(false);
                  setVoicePhase('idle');
                  Alert.alert(
                    t({ en: 'Microphone Permission', zh: '麦克风权限' }),
                    t({
                      en: 'Please enable microphone access in Settings to use hold-to-talk with local models.',
                      zh: '请在系统设置中授予麦克风权限，才能使用本地模型的按住说话。',
                    }),
                  );
                  return;
                }
              } catch {
                // Non-fatal: fall through; realtimeMicrophone.start() will surface a clearer error
              }
            }

            await realtimeMicrophone.start();
            setLiveSpeechPermissionState('granted');
            setIsRecording(true);
            setLiveListening(false);
            addVoiceDiagnostic('voice-session', 'hold-local-audio-started', {
              model: localModelId || 'local-model',
            });
            triggerHapticImpact(Haptics?.ImpactFeedbackStyle?.Medium);
            return;
          } catch (error) {
            localDirectAudioCaptureRef.current = null;
            const message = error instanceof Error ? error.message : String(error);
            if (/permission denied/i.test(message)) {
              setLiveSpeechPermissionState('denied');
            }
            addVoiceDiagnostic('voice-session', 'hold-local-audio-start-failed', {
              message,
              model: localModelId || 'local-model',
            });
            // Surface a user-actionable error instead of silently dying. The most
            // common causes are: (a) RECORD_AUDIO denied, (b) another app holding
            // the mic (music player / video call), (c) Picovoice native module
            // not linked in this build.
            isRecordingRef.current = false;
            setIsRecording(false);
            setVoicePhase('idle');
            let hint = message;
            if (/permission denied/i.test(message)) {
              hint = t({
                en: 'Microphone permission was denied. Enable it in Settings.',
                zh: '麦克风权限被拒绝，请到系统设置中开启。',
              });
            } else if (/unavailable|not.*linked|undefined/i.test(message)) {
              hint = t({
                en: 'Local voice capture is not available in this build. Falling back to cloud recording next time.',
                zh: '当前版本暂不支持本地直采，下一次将尝试云端录音路径。',
              });
            } else {
              hint = t({
                en: 'Microphone is busy. Close other audio apps and try again.',
                zh: '麦克风被占用，请关闭其他音频应用后重试。',
              });
            }
            Alert.alert(t({ en: 'Voice Error', zh: '语音错误' }), hint);
            return;
          }
        }

        if (canUseLocalSpeechForHold) {
          const permission = await requestLiveSpeechPermissions();
          if (!permission?.granted) {
            setLiveSpeechPermissionState('denied');
            isRecordingRef.current = false;
            setVoicePhase('idle');
            Alert.alert(
              t({ en: 'Speech Permission', zh: '语音权限' }),
              t({ en: 'Please enable microphone and speech recognition access.', zh: '请开启麦克风和语音识别权限。' }),
            );
            return;
          }

          setLiveSpeechPermissionState('granted');
          localHoldTranscriptRef.current = '';
          localHoldSpeechRef.current = startLiveSpeechRecognition(
            voiceLanguageHint,
            {
              onStart: () => {
                if (!isMountedRef.current) return;
                addVoiceDiagnostic('voice-session', 'hold-local-speech-started');
                setLiveListening(true);
                setIsRecording(true);
                setVoicePhase('recording');
                setTranscriptPreview('');
              },
              onEnd: () => {
                if (!isMountedRef.current) return;
                setLiveListening(false);
                setLiveVoiceVolume(-2);
              },
              onInterimResult: (transcript) => {
                const normalized = transcript.trim();
                if (!normalized) return;
                localHoldTranscriptRef.current = normalized;
                setTranscriptPreview(normalized);
              },
              onFinalResult: (transcript) => {
                const normalized = transcript.trim();
                if (!normalized) return;
                localHoldTranscriptRef.current = normalized;
                setTranscriptPreview(normalized);
              },
              onError: (error) => {
                if (!isMountedRef.current) return;
                if (error?.error === 'aborted' || error?.error === 'no-speech') return;
                addVoiceDiagnostic('voice-session', 'hold-local-speech-error', error);
                setLiveListening(false);
                setLiveVoiceVolume(-2);
              },
              onVolumeChange: (value) => {
                if (!isMountedRef.current) return;
                setLiveVoiceVolume(value);
              },
            },
            [instanceName || '', agentVoiceId || '', 'Agentrix'],
            { mode: 'hold' },
          );
          setIsRecording(true);
          triggerHapticImpact(Haptics?.ImpactFeedbackStyle?.Medium);
          return;
        }

        const permResult = await Audio.requestPermissionsAsync();
        if (!permResult.granted) {
          setLiveSpeechPermissionState('denied');
          isRecordingRef.current = false;
          setVoicePhase('idle');
          Alert.alert(t({ en: 'Microphone Permission', zh: '麦克风权限' }), t({ en: 'Please enable microphone access.', zh: '请开启麦克风权限。' }));
          return;
        }
        setLiveSpeechPermissionState('granted');
        await Audio.setAudioModeAsync({
          allowsRecordingIOS: true,
          playsInSilentModeIOS: true,
          staysActiveInBackground: false,
        });
        if (recordingRef.current) {
          try { await recordingRef.current.stopAndUnloadAsync(); } catch (_) {}
          recordingRef.current = null;
        }
        const { recording } = await Audio.Recording.createAsync(
          voiceRecordingOptions || Audio.RecordingOptionsPresets.HIGH_QUALITY,
        );
        recordingRef.current = recording;
        setIsRecording(true);
        triggerHapticImpact(Haptics?.ImpactFeedbackStyle?.Medium);

        // Start VAD monitoring on the recording for volume feedback
        try {
          if (!vadRef.current) {
            vadRef.current = new VADService({
              onSpeechStart: () => {
                addVoiceDiagnostic('vad', 'speech-detected-recording');
              },
              onSpeechEnd: () => {
                addVoiceDiagnostic('vad', 'silence-detected-recording');
              },
              onVolumeChange: (level) => {
                setLiveVoiceVolume(level * 100 - 2);
              },
            });
          }
          vadRef.current.start(createRecordingMeterFn(recording));
        } catch {}
      }
    } catch (e: any) {
      isRecordingRef.current = false;
      setIsRecording(false);
      setVoicePhase('idle');
      Alert.alert(t({ en: 'Voice Error', zh: '语音错误' }), e?.message || 'Unknown error');
    }
  }, [
    agentVoiceId,
    cancelPendingLocalSpeechOutput,
    canRecordSupportedLocalAudioFormat,
    instanceName,
    isSpeaking,
    isVoiceUiE2E,
    localAudioInputAvailable,
    localModelId,
    localModelSelected,
    preferLocalSpeechRecognition,
    showLocalVoicePathBlockedAlert,
    t,
    voiceLanguageHint,
    voicePhase,
    voiceRecordingOptions,
  ]);

  const stopVoiceRecording = useCallback(async () => {
    if (
      !isRecordingRef.current
      && !localDirectAudioCaptureRef.current
      && !localHoldSpeechRef.current
      && !recordingRef.current
    ) {
      return;
    }

    try {
      if (localDirectAudioCaptureRef.current) {
        const directCapture = localDirectAudioCaptureRef.current;
        localDirectAudioCaptureRef.current = null;
        isRecordingRef.current = false;
        setIsRecording(false);
        setLiveVoiceVolume(-2);
        setVoicePhase('transcribing');
        triggerHapticImpact(Haptics?.ImpactFeedbackStyle?.Light);

        try {
          await directCapture.microphone.stop();
        } catch {}

        const pcmBuffer = concatPcmChunks(directCapture.pcmChunks);
        if (pcmBuffer.length === 0) {
          addVoiceDiagnostic('voice-session', 'hold-local-audio-empty', {
            model: localModelId || 'local-model',
          });
          setVoicePhase('idle');
          // 0 bytes almost always means: mic was never actually granted live frames.
          // Tell the user what to check instead of just "no speech".
          Alert.alert(
            t({ en: 'No Audio Captured', zh: '未采集到音频' }),
            t({
              en: 'The microphone did not produce any audio. Make sure permission is granted and no other app is using the mic, then try again.',
              zh: '麦克风未输出任何音频。请确认已授予权限，且没有其他应用在占用麦克风，然后重试。',
            }),
          );
          return;
        }

        const durationMs = Math.round(estimatePcmDurationMs(pcmBuffer.length));
        addVoiceDiagnostic('voice-session', 'hold-local-audio-stop', {
          model: localModelId || 'local-model',
          pcmBytes: pcmBuffer.length,
          durationMs,
        });

        const wavUri = await persistDirectLocalAudioCaptureAsWav(directCapture.pcmChunks);

        // ── Native audio path (Qwen2.5-Omni / qwen3.5-omni-light) ─────────
        // When the on-device model accepts raw audio as an input_audio content
        // part, bypass STT entirely: hand the WAV straight to the model.
        // This is the "真正的端云一致原生链路" — no STT round-trip, no
        // transcription latency, and the model hears the user's actual voice
        // (tone, pause, language mixing) instead of a lossy text rendering.
        if (localModelSelected && localAudioInputAvailable) {
          try {
            const localAudioAttachment = await buildLocalRecordedAudioAttachment(wavUri);
            setTranscriptPreview(t({ en: '[Local voice message]', zh: '[本地语音消息]' }));
            setVoicePhase('thinking');
            setTimeout(() => onSendMessageRef.current('', [localAudioAttachment]), 60);
            return;
          } catch (nativeAudioErr: any) {
            addVoiceDiagnostic('voice-session', 'hold-local-native-audio-failed', {
              model: localModelId || 'local-model',
              error: String(nativeAudioErr?.message || nativeAudioErr),
            });
            // Fall through to Whisper / cloud STT below.
          }
        }

        // ── On-device STT (whisper.rn) ────────────────────────
        // If the whisper-base audio encoder is downloaded alongside the model,
        // transcribe locally — no cloud round-trip, no privacy leak, works offline.
        // On any failure, fall through to cloud STT below.
        if (LocalWhisperService.isAvailableForModel(localModelId)) {
          try {
            const whisperTranscript = await LocalWhisperService.transcribe(
              localModelId!,
              wavUri,
              voiceLanguageHint,
            );
            if (whisperTranscript) {
              setTranscriptPreview(whisperTranscript);
              setVoicePhase('thinking');
              setTimeout(() => onSendMessageRef.current(whisperTranscript), 80);
              return;
            }
          } catch (whisperErr: any) {
            addVoiceDiagnostic('voice-session', 'hold-local-whisper-failed', {
              model: localModelId || 'local-model',
              error: String(whisperErr?.message || whisperErr),
            });
            // Fall through to cloud STT
          }
        }

        // ── Cloud STT fallback ────────────────────────────────
        let pcmTranscript = '';
        let pcmTranscribeTimedOut = false;
        let pcmTranscribeFailed = false;
        let pcmTranscribeErrorDetail = '';
        const pcmFormData = new FormData();
        pcmFormData.append('audio', { uri: wavUri, name: 'voice.wav', type: 'audio/wav' } as any);
        const pcmAc = new AbortController();
        const TRANSCRIBE_TIMEOUT_MS = 45_000;
        const pcmTimeout = setTimeout(() => pcmAc.abort(), TRANSCRIBE_TIMEOUT_MS);
        try {
          const resp = await Promise.race([
            fetch(`${API_BASE}/voice/transcribe?lang=${voiceLanguageHint}`, {
              method: 'POST',
              headers: { Authorization: `Bearer ${token}` },
              body: pcmFormData,
              signal: pcmAc.signal,
            }),
            new Promise<never>((_, reject) =>
              setTimeout(() => reject(new Error('transcribe-timeout')), TRANSCRIBE_TIMEOUT_MS + 1_000),
            ),
          ]);
          if (resp.ok) {
            const data = await resp.json();
            pcmTranscript = data?.text || data?.transcript || '';
          } else {
            pcmTranscribeFailed = true;
            try { pcmTranscribeErrorDetail = await resp.text(); } catch { /* ignore */ }
          }
        } catch (err: any) {
          if (err?.message === 'transcribe-timeout' || err?.name === 'AbortError') {
            pcmTranscribeTimedOut = true;
          } else {
            pcmTranscribeFailed = true;
            pcmTranscribeErrorDetail = String(err?.message || err);
          }
        } finally {
          clearTimeout(pcmTimeout);
          try { pcmAc.abort(); } catch {}
        }

        if (pcmTranscript) {
          setTranscriptPreview(pcmTranscript);
          setVoicePhase('thinking');
          setTimeout(() => onSendMessageRef.current(pcmTranscript), 80);
        } else if (pcmTranscribeTimedOut) {
          setVoicePhase('idle');
          Alert.alert(
            t({ en: 'Transcription Timeout', zh: '转写超时' }),
            t({ en: 'Audio transcription took too long. Please try again.', zh: '语音转写超时，请重试。' }),
          );
        } else {
          setVoicePhase('idle');
          if (pcmTranscribeFailed) {
            const detail = pcmTranscribeErrorDetail ? `\n\n${pcmTranscribeErrorDetail.slice(0, 200)}` : '';
            Alert.alert(
              t({ en: 'Transcription Failed', zh: '转写失败' }),
              t({
                en: `Transcription service unavailable. Please retry or type your message.${detail}`,
                zh: `转写服务暂时不可用，请稍后重试或直接输入文字。${detail}`,
              }),
            );
          } else {
            Alert.alert(
              t({ en: 'No Speech', zh: '未检测到语音' }),
              t({ en: 'No speech detected.', zh: '未检测到有效语音。' }),
            );
          }
        }
        return;
      }

      if (localHoldSpeechRef.current) {
        const controller = localHoldSpeechRef.current;
        localHoldSpeechRef.current = null;
        isRecordingRef.current = false;
        setIsRecording(false);
        setLiveListening(false);
        setLiveVoiceVolume(-2);
        setVoicePhase('transcribing');
        triggerHapticImpact(Haptics?.ImpactFeedbackStyle?.Light);
        let stopResultTranscript = '';
        try {
          const stopResult = await controller.stop();
          stopResultTranscript = stopResult?.transcript?.trim() || '';
        } catch {}

        const transcript = stopResultTranscript || localHoldTranscriptRef.current.trim();
        localHoldTranscriptRef.current = '';
        if (transcript) {
          setTranscriptPreview(transcript);
          setVoicePhase('thinking');
          setTimeout(() => {
            onSendMessageRef.current(transcript);
          }, 80);
        } else {
          setVoicePhase('idle');
          Alert.alert(t({ en: 'No Speech', zh: '未检测到语音' }), t({ en: 'No speech detected.', zh: '未检测到有效语音。' }));
        }
        return;
      }

      if (!Audio) {
        return;
      }

      // Stop VAD monitoring
      vadRef.current?.stop();
      isRecordingRef.current = false;
      setIsRecording(false);
      setVoicePhase('transcribing');
      triggerHapticImpact(Haptics?.ImpactFeedbackStyle?.Light);

      if (recordingRef.current) {
        await recordingRef.current.stopAndUnloadAsync();
        const uri = recordingRef.current.getURI();
        recordingRef.current = null;
        if (uri) {
          // ── On-device STT (whisper.rn) ────────────────────────
          // When the whisper-base encoder is downloaded, transcribe locally
          // for any local model (replaces both the raw-audio-to-model path
          // and the cloud transcription path). Falls through to cloud STT
          // on any error or if encoder is not yet downloaded.
          if (localModelSelected && LocalWhisperService.isAvailableForModel(localModelId)) {
            try {
              const whisperTranscript = await LocalWhisperService.transcribe(
                localModelId!,
                uri,
                voiceLanguageHint,
              );
              if (whisperTranscript) {
                setTranscriptPreview(whisperTranscript);
                setVoicePhase('thinking');
                setTimeout(() => onSendMessageRef.current(whisperTranscript), 80);
                return;
              }
            } catch (whisperErr: any) {
              addVoiceDiagnostic('voice-session', 'local-whisper-m4a-failed', {
                model: localModelId || 'local-model',
                error: String(whisperErr?.message || whisperErr),
              });
              // Fall through to cloud STT path
            }
          }

          if (localModelSelected && localAudioInputAvailable && isSupportedLocalAudioRecordingUri(uri)) {
            // Send audio directly to local model that supports audio input
            const localAudioAttachment = await buildLocalRecordedAudioAttachment(uri);
            setTranscriptPreview(t({ en: '[Local voice message]', zh: '[本地语音消息]' }));
            setVoicePhase('thinking');
            setTimeout(() => onSendMessageRef.current('', [localAudioAttachment]), 80);
            return;
          }

          // For local models without audio input (e.g. Gemma): record → cloud
          // transcribe → send text to local model. Also used for all cloud models.
          let transcript = '';
          let transcribeTimedOut = false;
          let transcribeFailed = false;
          let transcribeErrorDetail = '';
          const formData = new FormData();
          formData.append('audio', { uri, name: 'voice.m4a', type: 'audio/m4a' } as any);
          const ac = new AbortController();
          // Upper bound tolerant of worst case: Gemini STT chain (3 keys × ~15s) → AWS fallback.
          // We intentionally race an independent timeout promise because some RN builds do not
          // actually reject the in-flight fetch when AbortController.abort() fires, which would
          // otherwise leave the UI stuck in the 'transcribing' phase forever.
          const TRANSCRIBE_TIMEOUT_MS = 45_000;
          const timeout = setTimeout(() => ac.abort(), TRANSCRIBE_TIMEOUT_MS);
          try {
            const resp = await Promise.race([
              fetch(`${API_BASE}/voice/transcribe?lang=${voiceLanguageHint}`, {
                method: 'POST',
                headers: { Authorization: `Bearer ${token}` },
                body: formData,
                signal: ac.signal,
              }),
              new Promise<never>((_, reject) =>
                setTimeout(
                  () => reject(new Error('transcribe-timeout')),
                  TRANSCRIBE_TIMEOUT_MS + 1_000,
                ),
              ),
            ]);
            if (resp.ok) {
              const data = await resp.json();
              transcript = data?.text || data?.transcript || '';
            } else {
              transcribeFailed = true;
              // Capture server response body so the alert (and logs) show the
              // actual upstream reason (e.g. "Multipart: Unexpected end of form",
              // "model unavailable", auth errors). Without this the user just
              // sees a generic "转写失败" with no way to triage.
              try { transcribeErrorDetail = await resp.text(); } catch { /* ignore */ }
              console.warn('Transcription HTTP error', resp.status, transcribeErrorDetail.slice(0, 300));
            }
          } catch (err: any) {
            if (err?.message === 'transcribe-timeout' || err?.name === 'AbortError') {
              transcribeTimedOut = true;
            } else {
              transcribeFailed = true;
              transcribeErrorDetail = String(err?.message || err);
            }
            console.warn('Transcription failed', err);
          } finally {
            clearTimeout(timeout);
            try { ac.abort(); } catch {}
          }

          if (transcript) {
            setTranscriptPreview(transcript);
            setVoicePhase('thinking');
            setTimeout(() => onSendMessageRef.current(transcript), 80);
          } else if (transcribeTimedOut) {
            setVoicePhase('idle');
            Alert.alert(
              t({ en: 'Transcription Timeout', zh: '转写超时' }),
              t({
                en: 'Audio transcription took too long. Please try again.',
                zh: '语音转写超时，请重试。',
              }),
            );
          } else {
            // Do NOT silently upload the raw m4a and ship it to the text model.
            // Most cloud chat models (e.g. Gemini Pro text) will simply reply
            // "I cannot process audio", which looks like the voice button is
            // broken. Surface a clear error and let the user retry or type.
            setVoicePhase('idle');
            if (transcribeFailed) {
              const detail = transcribeErrorDetail ? `\n\n${transcribeErrorDetail.slice(0, 200)}` : '';
              Alert.alert(
                t({ en: 'Transcription Failed', zh: '转写失败' }),
                t({
                  en: `Transcription service is unavailable right now. Please try again or type your message.${detail}`,
                  zh: `转写服务暂时不可用，请稍后重试或直接输入文字。${detail}`,
                }),
              );
            } else {
              Alert.alert(
                t({ en: 'No Speech', zh: '未检测到语音' }),
                t({ en: 'No speech detected.', zh: '未检测到有效语音。' }),
              );
            }
          }
        } else {
          setVoicePhase('idle');
        }
      }
    } catch (e: any) {
      isRecordingRef.current = false;
      setIsRecording(false);
      setVoicePhase('idle');
      Alert.alert(t({ en: 'Voice Error', zh: '语音错误' }), e?.message || 'Unknown');
    } finally {
      await resetAudioModeAfterRecording();
    }
  }, [
    buildLocalRecordedAudioAttachment,
    localModelId,
    localAudioInputAvailable,
    localModelSelected,
    persistDirectLocalAudioCaptureAsWav,
    resetAudioModeAfterRecording,
    showLocalVoicePathBlockedAlert,
    t,
    token,
    voiceLanguageHint,
  ]);

  useEffect(() => {
    if (!isVoiceUiE2E || typeof window === 'undefined') {
      return;
    }

    (window as any).__AGENTRIX_VOICE_UI_E2E_HOLD_TO_TALK_BRIDGE__ = {
      start: async () => {
        await startVoiceRecording();
      },
      stop: async () => {
        await stopVoiceRecording();
      },
    };

    return () => {
      if ((window as any).__AGENTRIX_VOICE_UI_E2E_HOLD_TO_TALK_BRIDGE__) {
        (window as any).__AGENTRIX_VOICE_UI_E2E_HOLD_TO_TALK_BRIDGE__ = null;
      }
    };
  }, [isVoiceUiE2E, startVoiceRecording, stopVoiceRecording]);

  // ── Interaction wrappers ──

  const handleVoicePressIn = useCallback(async () => {
    if (voiceInteractionMode !== 'hold') return;
    await startVoiceRecording();
  }, [voiceInteractionMode, startVoiceRecording]);

  const handleVoicePressOut = useCallback(async () => {
    if (voiceInteractionMode !== 'hold') return;
    await stopVoiceRecording();
  }, [voiceInteractionMode, stopVoiceRecording]);

  const handleVoiceTapToggle = useCallback(async () => {
    if (duplexMode) {
      if (liveSpeechRef.current || realtimeMicrophoneRef.current) {
        stopLiveSpeech(true, true);
        setVoicePhase('idle');
        setTranscriptPreview('');
        return;
      }
      if (isSpeaking) stopSpeaking();
      onStopCurrentResponseRef.current?.(true);
      await startLiveSpeechInternal();
      return;
    }
    if (isRecordingRef.current) {
      await stopVoiceRecording();
      return;
    }
    await startVoiceRecording();
  }, [duplexMode, isSpeaking, startLiveSpeechInternal, startVoiceRecording, stopLiveSpeech, stopSpeaking, stopVoiceRecording]);

  const resumeLiveSpeech = useCallback(() => {
    if (!duplexModeRef.current || sendingRef.current || isSpeakingRef.current || !voiceModeRef.current) return;
    void startLiveSpeechInternal();
  }, [startLiveSpeechInternal]);

  const sendRealtimeImageFrame = useCallback((frameBase64: string, mimeType = 'image/jpeg') => {
    if (!frameBase64 || !realtimeVoiceRef.current?.isConnected) {
      return false;
    }

    realtimeVoiceRef.current.sendImageFrame(frameBase64, mimeType);
    return true;
  }, []);

  return {
    // State
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
    sendRealtimeInterrupt: useCallback(() => {
      realtimeVoiceRef.current?.sendInterrupt();
    }, []),
    speakingMessageId,

    // Actions
    startVoiceRecording,
    stopVoiceRecording,
    handleVoicePressIn,
    handleVoicePressOut,
    handleVoiceTapToggle,
    speakText,
    stopSpeaking,
    handleSpeakMessage,
    enqueueStreamedSpeech,
    resetVoicePhaseAfterResponse,
    resumeLiveSpeech,
    sendRealtimeImageFrame,
  };
}
