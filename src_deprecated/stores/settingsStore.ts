// 设置 Store
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

type Environment = 'sandbox' | 'production';

export type ModelId =
  | 'claude-haiku-4-5'
  | 'claude-sonnet-4-5'
  | 'claude-opus-4'
  | 'gemini-2.0-flash'
  | 'gpt-4o'
  | 'deepseek-v3'
  | 'llama-3.3-70b';

export interface ModelOption {
  id: ModelId;
  label: string;
  provider: string;
  icon: string;
  badge?: string; // e.g. 'Default', 'Fast', 'Pro'
}

export const SUPPORTED_MODELS: ModelOption[] = [
  { id: 'claude-haiku-4-5',  label: 'Claude Haiku 4.5',    provider: 'AWS Bedrock', icon: '🤖', badge: 'Default' },
  { id: 'claude-sonnet-4-5', label: 'Claude Sonnet 4.5',   provider: 'AWS Bedrock', icon: '💎', badge: 'Pro' },
  { id: 'claude-opus-4',     label: 'Claude Opus 4',       provider: 'AWS Bedrock', icon: '🏆', badge: 'Max' },
  { id: 'gemini-2.0-flash',  label: 'Gemini 2.0 Flash',    provider: 'Google',      icon: '✨', badge: 'Fast' },
  { id: 'gpt-4o',            label: 'GPT-4o',               provider: 'OpenAI',      icon: '🧠' },
  { id: 'deepseek-v3',       label: 'DeepSeek-V3',         provider: 'DeepSeek',    icon: '🔬' },
  { id: 'llama-3.3-70b',     label: 'Llama 3.3 70B',       provider: 'Groq',        icon: '🦙', badge: 'Free' },
];

interface SettingsState {
  // 环境配置
  environment: Environment;
  apiBaseUrl: string;
  
  // AI Model
  selectedModelId: ModelId;
  
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
  toggleNotifications: (enabled: boolean) => void;
  toggleBiometric: (enabled: boolean) => void;
}

const API_URLS = {
  sandbox: 'https://sandbox-api.agentrix.io',
  production: 'https://api.agentrix.io',
  local: 'http://localhost:3001/api',
};

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      environment: 'sandbox',
      apiBaseUrl: API_URLS.local, // 开发时使用本地
      
      selectedModelId: 'claude-haiku-4-5' as ModelId,
      
      notificationsEnabled: true,
      airdropNotifications: true,
      earningsNotifications: true,
      paymentNotifications: true,
      
      biometricEnabled: false,
      
      setEnvironment: (env) => set({ 
        environment: env,
        apiBaseUrl: API_URLS[env],
      }),
      
      setApiBaseUrl: (url) => set({ apiBaseUrl: url }),
      
      setSelectedModel: (modelId) => set({ selectedModelId: modelId }),
      
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
      storage: createJSONStorage(() => AsyncStorage),
    }
  )
);
