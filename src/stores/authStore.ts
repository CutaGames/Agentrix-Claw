// ClawLink Auth Store (Zustand)
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { mmkvStorage } from './mmkvStorage';
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
  agentAccountId?: string;
  capabilities?: {
    [key: string]: any;
  };
  resolvedModel?: string;
  resolvedModelLabel?: string;
  resolvedProvider?: string;
  hasCustomProvider?: boolean;
  metadata?: {
    agentAccountId?: string;
    [key: string]: any;
  };
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
  hasValidInvitation: boolean;
  activeInstance: OpenClawInstance | null;

  // Actions
  setAuth: (user: AuthUser, token: string) => Promise<void>;
  clearAuth: () => Promise<void>;
  setLoading: (loading: boolean) => void;
  setInitialized: (initialized: boolean) => void;
  restoreSession: () => Promise<boolean>;
  setOnboardingComplete: () => void;
  setInvitationValid: () => void;
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
      hasValidInvitation: false,
      activeInstance: null,

      setAuth: async (user, token) => {
        // Sync token to api config immediately so apiFetch works in the same tick
        setApiConfig({ token });
        try {
          await SecureStore.setItemAsync('clawlink_token', token);
        } catch (e) {
          console.warn('Failed to save token to SecureStore:', e);
        }
        // Set active instance if user has instances; preserve existing if user object has none
        const previousUserId = get().user?.id;
        const currentActive = get().activeInstance;
        const previousActiveId = currentActive?.id ?? user.activeInstanceId;
        const refreshedActive = previousActiveId
          ? user.openClawInstances?.find((instance) => instance.id === previousActiveId) ?? null
          : null;
        const firstInstance = user.openClawInstances?.[0] ?? null;
        const activeInstance = refreshedActive ?? firstInstance ?? currentActive;
        set({
          user,
          token,
          isAuthenticated: true,
          isLoading: false,
          activeInstance,
          hasValidInvitation: previousUserId && previousUserId !== user.id ? false : get().hasValidInvitation,
        });
      },

      clearAuth: async () => {
        try {
          await SecureStore.deleteItemAsync('clawlink_token');
          await SecureStore.deleteItemAsync('mpc_shard_a');
          await SecureStore.deleteItemAsync('mpc_recovery_code');
          await SecureStore.deleteItemAsync('mpc_backup_confirmed');
        } catch (e) {
          console.warn('Failed to clear SecureStore:', e);
        }
        set({
          user: null,
          token: null,
          isAuthenticated: false,
          isLoading: false,
          hasValidInvitation: false,
          activeInstance: null,
        });
      },

      setLoading: (loading) => set({ isLoading: loading }),
      setInitialized: (initialized) => set({ isInitialized: initialized }),
      setOnboardingComplete: () => set({ hasCompletedOnboarding: true }),
      setInvitationValid: () => set({ hasValidInvitation: true }),

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
        const previous = existing.find((candidate) => candidate.id === instance.id);
        const metadata = instance.metadata ?? previous?.metadata;
        const agentAccountId = instance.agentAccountId
          ?? previous?.agentAccountId
          ?? metadata?.agentAccountId;
        const nextInstance: OpenClawInstance = previous
          ? {
            ...previous,
            ...instance,
            metadata,
            agentAccountId,
          }
          : {
            ...instance,
            metadata,
            agentAccountId,
          };
        const updated = existing.filter((candidate) => candidate.id !== instance.id);
        updated.push(nextInstance);
        const updatedUser = { ...user, openClawInstances: updated };
        set({ user: updatedUser, activeInstance: nextInstance });
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
          i.id === instanceId
            ? {
              ...i,
              ...update,
              metadata: update.metadata ?? i.metadata,
              agentAccountId: update.agentAccountId
                ?? update.metadata?.agentAccountId
                ?? i.agentAccountId
                ?? i.metadata?.agentAccountId,
            }
            : i
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
      storage: createJSONStorage(() => mmkvStorage),
      partialize: (state) => ({
        user: state.user,
        token: state.token,
        isAuthenticated: state.isAuthenticated,
        hasCompletedOnboarding: state.hasCompletedOnboarding,
        hasValidInvitation: state.hasValidInvitation,
        activeInstance: state.activeInstance,
      }),
    }
  )
);
