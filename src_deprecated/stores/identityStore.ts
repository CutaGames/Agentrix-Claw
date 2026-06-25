// 身份管理 Store (Zustand)
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { IdentityType, User, UserIdentities } from '../types/identity';

interface IdentityState {
  // 当前用户
  user: User | null;
  // 当前活跃身份
  activeIdentity: IdentityType;
  // 是否已登录
  isAuthenticated: boolean;
  // 加载状态
  isLoading: boolean;

  // Actions
  setUser: (user: User | null) => void;
  setActiveIdentity: (identity: IdentityType) => void;
  login: (user: User) => void;
  logout: () => void;
  updateIdentityStatus: (type: IdentityType, activated: boolean, pending?: boolean) => void;
  canSwitchTo: (identity: IdentityType) => boolean;
}

const defaultIdentities: UserIdentities = {
  personal: { type: 'personal', activated: true, pending: false },
  merchant: { type: 'merchant', activated: false, pending: false },
  developer: { type: 'developer', activated: false, pending: false },
};

export const useIdentityStore = create<IdentityState>()(
  persist(
    (set, get) => ({
      user: null,
      activeIdentity: 'personal',
      isAuthenticated: false,
      isLoading: false,

      setUser: (user) => set({ user, isAuthenticated: !!user }),

      setActiveIdentity: (identity) => {
        const state = get();
        // 只能切换到已激活的身份
        if (state.canSwitchTo(identity)) {
          set({ activeIdentity: identity });
        }
      },

      login: (user) => set({ 
        user, 
        isAuthenticated: true, 
        activeIdentity: 'personal' // 登录默认回到个人身份
      }),

      logout: () => set({ 
        user: null, 
        isAuthenticated: false, 
        activeIdentity: 'personal' 
      }),

      updateIdentityStatus: (type, activated, pending = false) => {
        const state = get();
        if (!state.user) return;
        
        set({
          user: {
            ...state.user,
            identities: {
              ...state.user.identities,
              [type]: {
                ...state.user.identities[type],
                activated,
                pending,
                activatedAt: activated ? new Date().toISOString() : undefined,
              },
            },
          },
        });
      },

      canSwitchTo: (identity) => {
        const state = get();
        if (!state.user) return false;
        // 个人身份始终可用
        if (identity === 'personal') return true;
        // 其他身份需要已激活
        return state.user.identities[identity]?.activated || false;
      },
    }),
    {
      name: 'agentrix-identity-storage',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        user: state.user,
        activeIdentity: state.activeIdentity,
        isAuthenticated: state.isAuthenticated,
      }),
    }
  )
);

// 辅助 hooks
export const useCurrentIdentity = () => {
  const activeIdentity = useIdentityStore((s) => s.activeIdentity);
  const user = useIdentityStore((s) => s.user);
  return {
    type: activeIdentity,
    status: user?.identities[activeIdentity],
    isPersonal: activeIdentity === 'personal',
    isMerchant: activeIdentity === 'merchant',
    isDeveloper: activeIdentity === 'developer',
  };
};

export const useIdentitySwitch = () => {
  const setActiveIdentity = useIdentityStore((s) => s.setActiveIdentity);
  const canSwitchTo = useIdentityStore((s) => s.canSwitchTo);
  const user = useIdentityStore((s) => s.user);
  
  return {
    switchTo: setActiveIdentity,
    canSwitchTo,
    identities: user?.identities || defaultIdentities,
  };
};
