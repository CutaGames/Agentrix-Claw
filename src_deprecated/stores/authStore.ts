// ClawLink Auth Store (Zustand)
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { setApiConfig } from '../services/api';

export type AuthProvider = 'google' | 'apple' | 'x' | 'telegram' | 'discord' | 'wallet' | 'email' | 'openclaw';

export interface OpenClawInstance {
  id: string;
  name: string;
  instanceUrl: string;
  status: 'active' | 'disconnected' | 'error';
  version?: string;
  deployType: 'cloud' | 'local' | 'server' | 'existing';
  relayToken?: string;   // set for relay-mode connections (ClawLink Agent)
  wsRelayUrl?: string;  // wss:// relay endpoint
  lastSyncAt?: string;
}

export interface AuthUser {
  id: string;
  agentrixId: string;
  email?: string;
  nickname?: string;
  avatarUrl?: string;
  walletAddress?: string;
  roles: string[];
  provider?: AuthProvider;
  openClawInstances?: OpenClawInstance[];
  activeInstanceId?: string;
}

interface AuthState {
  // State
  user: AuthUser | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  isInitialized: boolean;
  hasCompletedOnboarding: boolean;
  activeInstance: OpenClawInstance | null;

  // Actions
  setAuth: (user: AuthUser, token: string) => Promise<void>;
  clearAuth: () => Promise<void>;
  setLoading: (loading: boolean) => void;
  setInitialized: (initialized: boolean) => void;
  restoreSession: () => Promise<boolean>;
  setOnboardingComplete: () => void;
  addInstance: (instance: OpenClawInstance) => void;
  setActiveInstance: (instanceId: string) => void;
  updateInstance: (instanceId: string, update: Partial<OpenClawInstance>) => void;
  removeInstance: (instanceId: string) => void;
  updateUser: (updates: Partial<AuthUser>) => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      token: null,
      isAuthenticated: false,
      isLoading: false,
      isInitialized: false,
      hasCompletedOnboarding: false,
      activeInstance: null,

      setAuth: async (user, token) => {
        // Sync token to api config immediately so apiFetch works in the same tick
        setApiConfig({ token });
        try {
          await SecureStore.setItemAsync('clawlink_token', token);
        } catch (e) {
          console.warn('Failed to save token to SecureStore:', e);
        }
        // Set active instance if user has instances
        const firstInstance = user.openClawInstances?.[0] ?? null;
        set({ user, token, isAuthenticated: true, isLoading: false, activeInstance: firstInstance });
      },

      clearAuth: async () => {
        try {
          await SecureStore.deleteItemAsync('clawlink_token');
          await SecureStore.deleteItemAsync('mpc_shard_a');
        } catch (e) {
          console.warn('Failed to clear SecureStore:', e);
        }
        set({ user: null, token: null, isAuthenticated: false, isLoading: false, activeInstance: null });
      },

      setLoading: (loading) => set({ isLoading: loading }),
      setInitialized: (initialized) => set({ isInitialized: initialized }),
      setOnboardingComplete: () => set({ hasCompletedOnboarding: true }),

      restoreSession: async () => {
        try {
          let token = await SecureStore.getItemAsync('clawlink_token');
          if (!token) {
            token = get().token;
          }
          if (!token) {
            set({ isInitialized: true });
            return false;
          }
          setApiConfig({ token });
          set({ token, isInitialized: true });
          return true;
        } catch (e) {
          console.warn('Failed to restore session:', e);
          set({ isInitialized: true });
          return false;
        }
      },

      addInstance: (instance) => {
        const user = get().user;
        if (!user) return;
        const existing = user.openClawInstances ?? [];
        const updated = [...existing, instance];
        const updatedUser = { ...user, openClawInstances: updated };
        set({ user: updatedUser, activeInstance: instance });
      },

      setActiveInstance: (instanceId) => {
        const user = get().user;
        if (!user) return;
        const instance = user.openClawInstances?.find(i => i.id === instanceId) ?? null;
        set({ activeInstance: instance });
      },

      updateInstance: (instanceId, update) => {
        const user = get().user;
        if (!user) return;
        const instances = (user.openClawInstances ?? []).map(i =>
          i.id === instanceId ? { ...i, ...update } : i
        );
        const updatedUser = { ...user, openClawInstances: instances };
        const activeInstance = instances.find(i => i.id === instanceId) ??
          get().activeInstance;
        set({ user: updatedUser, activeInstance });
      },

      removeInstance: (instanceId) => {
        const user = get().user;
        if (!user) return;
        const instances = (user.openClawInstances ?? []).filter(i => i.id !== instanceId);
        const updatedUser = { ...user, openClawInstances: instances };
        const currentActive = get().activeInstance;
        const newActive = currentActive?.id === instanceId
          ? (instances[0] ?? null)
          : currentActive;
        set({ user: updatedUser, activeInstance: newActive });
      },

      updateUser: (updates) => {
        const user = get().user;
        if (!user) return;
        set({ user: { ...user, ...updates } });
      },
    }),
    {
      name: 'clawlink-auth-storage',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        user: state.user,
        token: state.token,
        isAuthenticated: state.isAuthenticated,
        hasCompletedOnboarding: state.hasCompletedOnboarding,
        activeInstance: state.activeInstance,
      }),
    }
  )
);
