import { Platform } from 'react-native';
import { setApiConfig } from '../services/api';
import type { AuthUser, OpenClawInstance } from '../stores/authStore';
import type { MobileLocalChatMessage, MobileLocalRuntimeCapabilities } from '../services/mobileLocalInference.service';
import type { LocalAiStatus } from '../stores/settingsStore';
import type { OtaModelArtifactKey } from '../services/otaModelDownload.service';

// Stores are imported lazily inside applyVoiceUiE2EBootstrap() to avoid
// circular dependency TDZ errors during module initialization.
// (AgentChatScreen → useVoiceSession → liveSpeech/realtimeVoice → e2e.ts → stores → TDZ)

const VOICE_UI_E2E_SCENARIO = 'voice-ui';
const VOICE_ONBOARDING_KEYS = ['voice_onboarding_completed', 'voice_onboarding_completed_v2'];

export type VoiceUiE2ELiveSpeechPermission = 'granted' | 'denied';

export interface VoiceUiE2ERealtimeBridge {
  onFinalTranscript: (text: string) => void;
  onAssistantChunk: (chunk: string) => void;
  onAssistantEnd: () => void;
  onError: (message: string) => void;
}

export interface VoiceUiE2ELiveSpeechBridge {
  onStart: () => void;
  onSpeechStart: () => void;
  onSpeechEnd: () => void;
  onInterimResult: (text: string) => void;
  onFinalResult: (text: string) => void;
  onError: (message: string) => void;
  onEnd: () => void;
}

export interface VoiceUiE2EHoldToTalkBridge {
  start: () => Promise<void> | void;
  stop: () => Promise<void> | void;
}

export interface VoiceUiE2ELocalBridgeCall {
  model?: string;
  userText: string;
  messageCount: number;
}

interface VoiceUiE2ELocalModelState {
  enabled: boolean;
  modelId: string;
  replyText: string;
  capabilities: MobileLocalRuntimeCapabilities;
  calls: VoiceUiE2ELocalBridgeCall[];
}

export interface VoiceUiE2ERuntime {
  liveSpeechPermission: VoiceUiE2ELiveSpeechPermission;
  setLiveSpeechPermission: (state: VoiceUiE2ELiveSpeechPermission) => void;
  triggerWakeWord: () => void;
  emitRealtimeFinalTranscript: (text: string) => void;
  emitRealtimeAssistantChunk: (chunk: string) => void;
  completeRealtimeAssistantResponse: () => void;
  emitRealtimeError: (message: string) => void;
  emitLiveSpeechInterimTranscript: (text: string) => void;
  emitLiveSpeechFinalTranscript: (text: string) => void;
  emitLiveSpeechError: (message: string) => void;
  completeLiveSpeechSession: () => void;
  startHoldToTalk: () => Promise<void>;
  stopHoldToTalk: () => Promise<void>;
  configureLocalModelScenario: (config?: {
    modelId?: string;
    replyText?: string;
    supportsVisionInput?: boolean;
    supportsAudioInput?: boolean;
    supportsAudioOutput?: boolean;
  }) => void;
  configureLocalPackageScenario: (config?: {
    modelId?: string;
    status?: LocalAiStatus;
    downloadedArtifactKeys?: OtaModelArtifactKey[];
    nextDownloadError?: string | null;
    selectedModelId?: string;
  }) => void;
  getLocalModelCalls: () => VoiceUiE2ELocalBridgeCall[];
  clearLocalModelCalls: () => void;
}

declare global {
  interface Window {
    __AGENTRIX_VOICE_UI_E2E_BOOTSTRAPPED__?: boolean;
    __AGENTRIX_VOICE_UI_E2E_FETCH_MOCKED__?: boolean;
    __AGENTRIX_VOICE_UI_E2E_RUNTIME__?: VoiceUiE2ERuntime;
    __AGENTRIX_VOICE_UI_E2E_LIVE_SPEECH_PERMISSION__?: VoiceUiE2ELiveSpeechPermission;
    __AGENTRIX_VOICE_UI_E2E_REALTIME_BRIDGE__?: VoiceUiE2ERealtimeBridge | null;
    __AGENTRIX_VOICE_UI_E2E_LIVE_SPEECH_BRIDGE__?: VoiceUiE2ELiveSpeechBridge | null;
    __AGENTRIX_VOICE_UI_E2E_HOLD_TO_TALK_BRIDGE__?: VoiceUiE2EHoldToTalkBridge | null;
    __AGENTRIX_VOICE_UI_E2E_LOCAL_MODEL_STATE__?: VoiceUiE2ELocalModelState;
    __AGENTRIX_LOCAL_LLM__?: {
      isAvailable?: (options?: { model?: string }) => boolean;
      getCapabilities?: (options?: { model?: string }) => Partial<MobileLocalRuntimeCapabilities>;
      generate?: (payload: {
        model?: string;
        messages: MobileLocalChatMessage[];
        temperature?: number;
        maxTokens?: number;
      }) => Promise<string>;
      generateStream?: (payload: {
        model?: string;
        messages: MobileLocalChatMessage[];
        temperature?: number;
        maxTokens?: number;
        onToken?: (chunk: string) => void;
      }) => Promise<string[]>;
    };
  }
}

function getDefaultLocalModelState(): VoiceUiE2ELocalModelState {
  return {
    enabled: false,
    modelId: 'qwen2.5-omni-3b',
    replyText: '本地模型回复：链路已接通。',
    capabilities: {
      available: true,
      runtimeSource: 'global',
      supportsTextGeneration: true,
      supportsStreaming: true,
      supportsVisionInput: true,
      supportsAudioInput: true,
      supportsAudioOutput: true,
    },
    calls: [],
  };
}

function getLocalModelState(): VoiceUiE2ELocalModelState {
  if (!window.__AGENTRIX_VOICE_UI_E2E_LOCAL_MODEL_STATE__) {
    window.__AGENTRIX_VOICE_UI_E2E_LOCAL_MODEL_STATE__ = getDefaultLocalModelState();
  }

  return window.__AGENTRIX_VOICE_UI_E2E_LOCAL_MODEL_STATE__;
}

function serializeUserText(messages: MobileLocalChatMessage[]): string {
  const userMessages = messages.filter((message) => message.role === 'user');
  const lastUserMessage = userMessages[userMessages.length - 1];
  if (!lastUserMessage) {
    return '';
  }

  if (typeof lastUserMessage.content === 'string') {
    return lastUserMessage.content;
  }

  return lastUserMessage.content
    .map((part) => {
      if (part.type === 'text') {
        return part.text;
      }
      if (part.type === 'image_url') {
        return '[image]';
      }
      return `[audio:${part.input_audio.format}]`;
    })
    .join(' ')
    .trim();
}

function installVoiceUiE2ELocalBridge(): void {
  if (typeof window === 'undefined') {
    return;
  }

  window.__AGENTRIX_LOCAL_LLM__ = {
    isAvailable: (options?: { model?: string }) => {
      const state = getLocalModelState();
      return state.enabled && (!options?.model || options.model === state.modelId);
    },
    getCapabilities: (options?: { model?: string }) => {
      const state = getLocalModelState();
      const supportedModel = !options?.model || options.model === state.modelId;
      return {
        ...state.capabilities,
        available: state.enabled && supportedModel,
      };
    },
    generate: async (payload) => {
      const state = getLocalModelState();
      state.calls.push({
        model: payload.model,
        userText: serializeUserText(payload.messages),
        messageCount: payload.messages.length,
      });
      return state.replyText;
    },
    generateStream: async (payload) => {
      const state = getLocalModelState();
      state.calls.push({
        model: payload.model,
        userText: serializeUserText(payload.messages),
        messageCount: payload.messages.length,
      });
      if (state.replyText) {
        payload.onToken?.(state.replyText);
      }
      return state.replyText ? [state.replyText] : [];
    },
  };
}

function createVoiceUiE2ERuntime(): VoiceUiE2ERuntime {
  window.__AGENTRIX_VOICE_UI_E2E_LIVE_SPEECH_PERMISSION__ = 'granted';

  const runtime: VoiceUiE2ERuntime = {
    liveSpeechPermission: 'granted',
    setLiveSpeechPermission(state) {
      runtime.liveSpeechPermission = state;
      window.__AGENTRIX_VOICE_UI_E2E_LIVE_SPEECH_PERMISSION__ = state;
      window.dispatchEvent(new CustomEvent('agentrix:e2e-live-speech-permission', { detail: state }));
    },
    triggerWakeWord() {
      window.dispatchEvent(new CustomEvent('agentrix:e2e-wake-word'));
    },
    emitRealtimeFinalTranscript(text) {
      window.__AGENTRIX_VOICE_UI_E2E_REALTIME_BRIDGE__?.onFinalTranscript(text);
    },
    emitRealtimeAssistantChunk(chunk) {
      window.__AGENTRIX_VOICE_UI_E2E_REALTIME_BRIDGE__?.onAssistantChunk(chunk);
    },
    completeRealtimeAssistantResponse() {
      window.__AGENTRIX_VOICE_UI_E2E_REALTIME_BRIDGE__?.onAssistantEnd();
    },
    emitRealtimeError(message) {
      window.__AGENTRIX_VOICE_UI_E2E_REALTIME_BRIDGE__?.onError(message);
    },
    emitLiveSpeechInterimTranscript(text) {
      window.__AGENTRIX_VOICE_UI_E2E_LIVE_SPEECH_BRIDGE__?.onSpeechStart();
      window.__AGENTRIX_VOICE_UI_E2E_LIVE_SPEECH_BRIDGE__?.onInterimResult(text);
    },
    emitLiveSpeechFinalTranscript(text) {
      window.__AGENTRIX_VOICE_UI_E2E_LIVE_SPEECH_BRIDGE__?.onSpeechStart();
      window.__AGENTRIX_VOICE_UI_E2E_LIVE_SPEECH_BRIDGE__?.onFinalResult(text);
    },
    emitLiveSpeechError(message) {
      window.__AGENTRIX_VOICE_UI_E2E_LIVE_SPEECH_BRIDGE__?.onError(message);
    },
    completeLiveSpeechSession() {
      window.__AGENTRIX_VOICE_UI_E2E_LIVE_SPEECH_BRIDGE__?.onSpeechEnd();
      window.__AGENTRIX_VOICE_UI_E2E_LIVE_SPEECH_BRIDGE__?.onEnd();
    },
    async startHoldToTalk() {
      await window.__AGENTRIX_VOICE_UI_E2E_HOLD_TO_TALK_BRIDGE__?.start?.();
    },
    async stopHoldToTalk() {
      await window.__AGENTRIX_VOICE_UI_E2E_HOLD_TO_TALK_BRIDGE__?.stop?.();
    },
    configureLocalModelScenario(config) {
      const nextModelId = config?.modelId || 'qwen2.5-omni-3b';
      const state = getLocalModelState();
      state.enabled = true;
      state.modelId = nextModelId;
      state.replyText = config?.replyText || '本地模型回复：链路已接通。';
      state.capabilities = {
        available: true,
        runtimeSource: 'global',
        supportsTextGeneration: true,
        supportsStreaming: true,
        supportsVisionInput: config?.supportsVisionInput ?? true,
        supportsAudioInput: config?.supportsAudioInput ?? true,
        supportsAudioOutput: config?.supportsAudioOutput ?? true,
      };
      state.calls = [];
      installVoiceUiE2ELocalBridge();

      const { useSettingsStore } = require('../stores/settingsStore');
      useSettingsStore.setState({
        localAiEnabled: true,
        localAiStatus: 'ready',
        localAiModelId: nextModelId,
        selectedModelId: nextModelId,
        preferOnDeviceVoice: true,
      });
    },
    configureLocalPackageScenario(config) {
      const nextModelId = config?.modelId || 'gemma-4-2b';
      const downloadedArtifactKeys = config?.downloadedArtifactKeys ?? [];
      const nextStatus = config?.status ?? (downloadedArtifactKeys.includes('model') ? 'ready' : 'not_downloaded');
      const { OtaModelDownloadService } = require('../services/otaModelDownload.service');
      const { useSettingsStore } = require('../stores/settingsStore');

      OtaModelDownloadService.resetE2EMockState();
      OtaModelDownloadService.configureE2EMockState(nextModelId, {
        downloadedArtifactKeys,
        nextDownloadError: config?.nextDownloadError ?? null,
      });

      useSettingsStore.setState({
        localAiEnabled: nextStatus === 'ready',
        localAiStatus: nextStatus,
        localAiProgress: nextStatus === 'not_downloaded' ? 0 : 100,
        localAiModelId: nextModelId,
        selectedModelId: config?.selectedModelId ?? nextModelId,
        preferOnDeviceVoice: nextStatus === 'ready',
      });
    },
    getLocalModelCalls() {
      return [...getLocalModelState().calls];
    },
    clearLocalModelCalls() {
      getLocalModelState().calls = [];
    },
  };

  return runtime;
}

export function setVoiceUiE2ERealtimeBridge(bridge: VoiceUiE2ERealtimeBridge | null): void {
  if (typeof window === 'undefined') {
    return;
  }

  window.__AGENTRIX_VOICE_UI_E2E_REALTIME_BRIDGE__ = bridge;
}

export function setVoiceUiE2ELiveSpeechBridge(bridge: VoiceUiE2ELiveSpeechBridge | null): void {
  if (typeof window === 'undefined') {
    return;
  }

  window.__AGENTRIX_VOICE_UI_E2E_LIVE_SPEECH_BRIDGE__ = bridge;
}

function createJsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
    },
  });
}

function installVoiceUiE2EFetchMock() {
  if (typeof window === 'undefined' || window.__AGENTRIX_VOICE_UI_E2E_FETCH_MOCKED__) {
    return;
  }

  const originalFetch = globalThis.fetch.bind(globalThis);

  const mockedFetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const requestUrl = typeof input === 'string'
      ? input
      : input instanceof URL
        ? input.toString()
        : input.url;

    const requestMethod = (init?.method || (typeof Request !== 'undefined' && input instanceof Request ? input.method : 'GET')).toUpperCase();
    const parsedUrl = new URL(requestUrl, window.location.origin);
    const normalizedPath = parsedUrl.pathname.replace(/^\/api/, '');

    if (requestMethod === 'OPTIONS') {
      return new Response(null, { status: 204 });
    }

    if (normalizedPath === '/health') {
      return createJsonResponse({ ok: true, status: 'ok' });
    }

    if (normalizedPath === '/ai-providers/available-models') {
      return createJsonResponse([
        {
          id: 'claude-haiku-4-5',
          label: 'Claude Haiku 4.5 (平台默认 API)',
          provider: 'Agentrix Platform',
          providerId: 'agentrix-platform',
          costTier: 'free_trial',
          isDefault: true,
        },
      ]);
    }

    if (normalizedPath === '/token-quota/me') {
      return createJsonResponse({
        planType: 'free_trial',
        totalQuota: 100000,
        usedTokens: 1250,
        remainingTokens: 98750,
        usagePercent: 1.25,
        callCount: 8,
        periodStart: '2026-03-01T00:00:00.000Z',
        periodEnd: '2026-03-31T23:59:59.999Z',
        quotaExhausted: false,
        energyLevel: 98,
      });
    }

    if (normalizedPath === '/desktop-sync/state') {
      return createJsonResponse({
        devices: [],
        tasks: [],
        approvals: [],
        sessions: [],
        commands: [],
        pendingApprovalCount: 0,
        serverTime: '2026-03-25T00:00:00.000Z',
      });
    }

    if (normalizedPath === '/agent-presence/devices/unified/online') {
      return createJsonResponse([]);
    }

    if (normalizedPath === '/skills/installed') {
      return createJsonResponse({ items: [] });
    }

    if (normalizedPath === '/notifications/recent') {
      return createJsonResponse({ notifications: [] });
    }

    if (normalizedPath === '/agent-presence/agents/e2e-agent-account-1') {
      return createJsonResponse({
        success: true,
        data: {
          id: 'e2e-agent-account-1',
          name: 'Voice QA Agent',
          slug: 'voice-qa-agent',
          status: 'active',
          defaultModel: 'claude-haiku-4-5',
          createdAt: '2026-03-25T00:00:00.000Z',
          updatedAt: '2026-03-25T00:00:00.000Z',
          metadata: {
            voice_id: 'alloy',
            accountCompatibility: {
              agentType: 'personal',
              spendingLimits: {
                singleTxLimit: 100,
                dailyLimit: 500,
                monthlyLimit: 2000,
                currency: 'USD',
              },
              balance: 0,
              balanceCurrency: 'USD',
            },
          },
        },
      });
    }

    if (/^\/openclaw\/proxy\/e2e-instance-1\/skills$/.test(normalizedPath)) {
      return createJsonResponse([]);
    }

    if (/^\/openclaw\/proxy\/e2e-instance-1\/status$/.test(normalizedPath)) {
      return createJsonResponse({
        status: 'active',
        cpuPercent: 12,
        memoryMb: 384,
        uptimeSeconds: 86400,
        version: 'e2e',
      });
    }

    if (/^\/openclaw\/proxy\/e2e-instance-1\/history$/.test(normalizedPath)) {
      return createJsonResponse([]);
    }

    if (/^\/openclaw\/storage\/info$/.test(normalizedPath)) {
      return createJsonResponse({
        tier: 'free',
        totalGb: 10,
        usedGb: 1.2,
        availableGb: 8.8,
        usedPercent: 12,
        isGiftStorage: true,
        upgradePlans: [],
      });
    }

    if (/^\/openclaw\/proxy\/e2e-instance-1\/chat$/.test(normalizedPath) && requestMethod === 'POST') {
      return createJsonResponse({
        sessionId: 'e2e-session',
        reply: {
          id: 'e2e-reply',
          role: 'assistant',
          content: 'Mock voice UI reply',
          timestamp: Date.now(),
        },
      });
    }

    if (/^\/openclaw\/proxy\/e2e-instance-1\/stream$/.test(normalizedPath) && requestMethod === 'POST') {
      return new Response('data: {"chunk":"Mock voice UI reply."}\n\ndata: [DONE]\n\n', {
        status: 200,
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
        },
      });
    }

    if (/^\/claude\/chat$/.test(normalizedPath) && requestMethod === 'POST') {
      return createJsonResponse({ text: 'Mock Claude reply' });
    }

    return originalFetch(input as any, init);
  };

  window.fetch = mockedFetch as typeof window.fetch;
  globalThis.fetch = mockedFetch as typeof globalThis.fetch;

  window.__AGENTRIX_VOICE_UI_E2E_FETCH_MOCKED__ = true;
}

function getWebSearchParam(name: string): string | null {
  if (Platform.OS !== 'web' || typeof window === 'undefined') {
    return null;
  }

  try {
    return new URLSearchParams(window.location.search).get(name);
  } catch {
    return null;
  }
}

// Cache the E2E enabled check at first evaluation time because
// React Navigation's web linking rewrites the URL (stripping query params)
// shortly after mount, making later window.location.search checks unreliable.
let _cachedE2EEnabled: boolean | null = null;

export function isVoiceUiE2EEnabled(): boolean {
  if (_cachedE2EEnabled !== null) return _cachedE2EEnabled;
  _cachedE2EEnabled = getWebSearchParam('e2e') === VOICE_UI_E2E_SCENARIO;
  // Also check the bootstrap flag as a fallback
  if (!_cachedE2EEnabled && typeof window !== 'undefined' && (window as any).__AGENTRIX_VOICE_UI_E2E_BOOTSTRAPPED__) {
    _cachedE2EEnabled = true;
  }
  return _cachedE2EEnabled;
}

export function getVoiceUiE2ERuntime(): VoiceUiE2ERuntime | null {
  if (!isVoiceUiE2EEnabled() || typeof window === 'undefined') {
    return null;
  }

  if (!window.__AGENTRIX_VOICE_UI_E2E_RUNTIME__) {
    window.__AGENTRIX_VOICE_UI_E2E_RUNTIME__ = createVoiceUiE2ERuntime();
  }

  return window.__AGENTRIX_VOICE_UI_E2E_RUNTIME__;
}

export function applyVoiceUiE2EBootstrap(): boolean {
  if (!isVoiceUiE2EEnabled() || typeof window === 'undefined') {
    return false;
  }

  if (window.__AGENTRIX_VOICE_UI_E2E_BOOTSTRAPPED__) {
    return true;
  }

  const instance: OpenClawInstance = {
    id: 'e2e-instance-1',
    name: 'Voice QA Agent',
    instanceUrl: 'https://agentrix.top/e2e',
    status: 'active',
    deployType: 'cloud',
    metadata: {
      agentAccountId: 'e2e-agent-account-1',
    },
  };

  const user: AuthUser = {
    id: 'e2e-user-1',
    agentrixId: 'voice-ui-e2e',
    nickname: 'Voice UI E2E',
    roles: ['tester'],
    provider: 'email',
    activeInstanceId: instance.id,
    openClawInstances: [instance],
  };

  VOICE_ONBOARDING_KEYS.forEach((key) => {
    const { mmkv } = require('../stores/mmkvStorage');
    mmkv.delete(key);
  });

  const { useAuthStore } = require('../stores/authStore');
  useAuthStore.setState({
    user,
    token: 'e2e-token',
    isAuthenticated: true,
    isLoading: false,
    isInitialized: true,
    hasCompletedOnboarding: true,
    hasValidInvitation: true,
    activeInstance: instance,
  });

  const { useSettingsStore } = require('../stores/settingsStore');
  useSettingsStore.setState((state: any) => ({
    wakeWordConfig: {
      ...state.wakeWordConfig,
      enabled: false,
    },
  }));

  setApiConfig({ token: 'e2e-token' });
  installVoiceUiE2EFetchMock();
  installVoiceUiE2ELocalBridge();
  window.__AGENTRIX_VOICE_UI_E2E_RUNTIME__ = window.__AGENTRIX_VOICE_UI_E2E_RUNTIME__ || createVoiceUiE2ERuntime();
  window.__AGENTRIX_VOICE_UI_E2E_LIVE_SPEECH_PERMISSION__ = 'granted';
  window.__AGENTRIX_VOICE_UI_E2E_BOOTSTRAPPED__ = true;
  return true;
}