// 设置 Store
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { mmkvStorage } from './mmkvStorage';
import { API_BASE, APP_ENV } from '../config/env';
import type { LocalWakeWordModel, WakeWordEngine } from '../services/localWakeWord.service';

type Environment = 'sandbox' | 'production';

/** Progressive UI complexity — controls which features are visible */
export type UiComplexity = 'beginner' | 'advanced' | 'professional';

/** Model ID — now a plain string to support dynamic models from backend providers */
export type ModelId = string;

export interface WakeWordSettings {
  enabled: boolean;
  engine: WakeWordEngine;
  fallbackPhrases: string[];
  displayName: string;
  sensitivity: number;
  localModel: LocalWakeWordModel | null;
}

export interface ModelOption {
  id: string;
  label: string;
  provider: string;
  icon: string;
  badge?: string; // e.g. 'Default', 'Fast', 'Pro'
  availability: 'available' | 'coming_soon' | 'requires_key';
  costTier: string;
}

/** Hardcoded fallback models — used only when backend is unreachable */
export const SUPPORTED_MODELS: ModelOption[] = [
  { id: 'gemma-4-2b',       label: 'Gemma 4 2B (端侧本地)',          provider: 'On-device',         icon: '📱', badge: 'Local', availability: 'available', costTier: 'free' },
  { id: 'claude-haiku-4-5',  label: 'Claude Haiku 4.5 (平台默认 API)',    provider: 'Agentrix Platform', icon: '🤖', badge: 'Default', availability: 'available', costTier: 'free_trial' },
];

export type LocalAiStatus = 'not_downloaded' | 'downloading' | 'ready' | 'error';

interface SettingsState {
  customApiKeys: Record<string, string>;
  setCustomApiKey: (provider: string, key: string) => void;
  // 环境配置
  environment: Environment;
  apiBaseUrl: string;
  
  // AI Model
  selectedModelId: ModelId;

  // Local AI Model (端侧 Gemma)
  localAiEnabled: boolean;
  localAiStatus: LocalAiStatus;
  localAiModelId: string;
  localAiProgress: number; // 0-100 download progress
  
  // Progressive UI complexity
  uiComplexity: UiComplexity;

  wakeWordConfig: WakeWordSettings;

  // Voice / TTS settings
  /** TTS playback speed multiplier (0.8 - 1.5, default 1.0) */
  speechRate: number;
  /** VAD silence timeout in ms before auto-send (800 - 3000, default 1800) */
  silenceTimeoutMs: number;
  
  // 通知设置
  notificationsEnabled: boolean;
  airdropNotifications: boolean;
  earningsNotifications: boolean;
  paymentNotifications: boolean;
  
  // 安全设置
  biometricEnabled: boolean;
  
  // Actions
  setEnvironment: (env: Environment) => void;
  setApiBaseUrl: (url: string) => void;
  setSelectedModel: (modelId: ModelId) => void;
  setLocalAiEnabled: (enabled: boolean) => void;
  setLocalAiStatus: (status: LocalAiStatus) => void;
  setLocalAiModelId: (modelId: string) => void;
  setLocalAiProgress: (progress: number) => void;
  setUiComplexity: (level: UiComplexity) => void;
  setWakeWordConfig: (patch: Partial<WakeWordSettings>) => void;
  resetWakeWordConfig: () => void;
  setSpeechRate: (rate: number) => void;
  setSilenceTimeoutMs: (ms: number) => void;
  toggleNotifications: (enabled: boolean) => void;
  toggleBiometric: (enabled: boolean) => void;
}

const API_URLS = {
  sandbox: 'https://staging-api.agentrix.top/api',
  production: 'https://api.agentrix.top/api',
  local: 'http://localhost:3001/api',
};

const DEFAULT_ENVIRONMENT: Environment = APP_ENV === 'production' ? 'production' : 'sandbox';

const DEFAULT_WAKE_WORD_CONFIG: WakeWordSettings = {
  enabled: true,
  engine: 'auto',
  fallbackPhrases: [
    'Hey Agentrix',
    'Hi Agentrix',
    'Agentrix',
    'Hey Agent Tricks',
    'Hi Agent Tricks',
    'Agent Tricks',
    'Hey Agent Rix',
    'Agent Rix',
    '嘿 Agentrix',
    '你好 Agentrix',
  ],
  displayName: 'Hey Agentrix',
  sensitivity: 0.65,
  localModel: null,
};

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      environment: DEFAULT_ENVIRONMENT,
      apiBaseUrl: API_BASE,

      customApiKeys: {} as Record<string, string>,
      setCustomApiKey: (provider: string, key: string) => set((state) => ({
        customApiKeys: { ...state.customApiKeys, [provider]: key },
      })),
      
      selectedModelId: 'claude-haiku-4-5' as ModelId,

      localAiEnabled: false,
      localAiStatus: 'not_downloaded' as LocalAiStatus,
      localAiModelId: 'gemma-4-2b',
      localAiProgress: 0,

      uiComplexity: 'beginner' as UiComplexity,
      wakeWordConfig: DEFAULT_WAKE_WORD_CONFIG,

      speechRate: 1.0,
      silenceTimeoutMs: 1800,
      
      notificationsEnabled: false,
      airdropNotifications: false,
      earningsNotifications: false,
      paymentNotifications: false,
      
      biometricEnabled: false,
      
      setEnvironment: (env) => set({ 
        environment: env,
        apiBaseUrl: API_URLS[env] || API_BASE,
      }),
      
      setApiBaseUrl: (url) => set({ apiBaseUrl: url }),
      
      setSelectedModel: (modelId) => set({ selectedModelId: modelId }),

      setLocalAiEnabled: (enabled) => set({ localAiEnabled: enabled }),
      setLocalAiStatus: (status) => set({ localAiStatus: status }),
      setLocalAiModelId: (modelId) => set({ localAiModelId: modelId }),
      setLocalAiProgress: (progress) => set({ localAiProgress: progress }),

      setUiComplexity: (level) => set({ uiComplexity: level }),

      setWakeWordConfig: (patch) => set((state) => ({
        wakeWordConfig: {
          ...state.wakeWordConfig,
          ...patch,
        },
      })),

      resetWakeWordConfig: () => set({ wakeWordConfig: DEFAULT_WAKE_WORD_CONFIG }),

      setSpeechRate: (rate) => set({ speechRate: Math.max(0.8, Math.min(1.5, rate)) }),
      setSilenceTimeoutMs: (ms) => set({ silenceTimeoutMs: Math.max(800, Math.min(3000, ms)) }),

      toggleNotifications: (enabled) => set({ 
        notificationsEnabled: enabled,
        airdropNotifications: enabled,
        earningsNotifications: enabled,
        paymentNotifications: enabled,
      }),
      
      toggleBiometric: (enabled) => set({ biometricEnabled: enabled }),
    }),
    {
      name: 'agentrix-settings-storage',
      storage: createJSONStorage(() => mmkvStorage),
      version: 3,
      migrate: (persistedState: any, version) => {
        if (!persistedState || version >= 3) {
          return persistedState;
        }

        return {
          ...persistedState,
          notificationsEnabled: false,
          airdropNotifications: false,
          earningsNotifications: false,
          paymentNotifications: false,
          wakeWordConfig: {
            ...DEFAULT_WAKE_WORD_CONFIG,
            ...(persistedState.wakeWordConfig || {}),
          },
        };
      },
    }
  )
);
