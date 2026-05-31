/**
 * Mobile three-form mutex store (PRD mobile-prd-v3 §3).
 *
 *   home_console  → 主控制台（多 Agent 总览 + 钱包 + 任务）
 *   voice_quick   → 语音速答（全屏低延迟双工）
 *   pet_companion → 主宠陪伴（Live Pet + 锁屏小组件 / 灵动岛）
 *
 * Forms are mutually exclusive; switching emits a console signal that the
 * presence socket can forward to other surfaces if needed. Last selected form
 * is persisted to AsyncStorage so the app reopens in the user's preferred
 * surface.
 */
import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';

export type MobileForm = 'home_console' | 'voice_quick' | 'pet_companion';

const STORAGE_KEY = 'agentrix_mobile_form_v1';

interface MobileFormState {
  form: MobileForm;
  hydrated: boolean;
  setForm: (next: MobileForm) => void;
  hydrate: () => Promise<void>;
}

export const useMobileFormStore = create<MobileFormState>((set, get) => ({
  form: 'home_console',
  hydrated: false,
  setForm: (next) => {
    if (get().form === next) return;
    set({ form: next });
    void AsyncStorage.setItem(STORAGE_KEY, next).catch(() => {});
  },
  hydrate: async () => {
    if (get().hydrated) return;
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      if (raw === 'home_console' || raw === 'voice_quick' || raw === 'pet_companion') {
        set({ form: raw });
      }
    } catch {
      // ignore — first launch / corrupted store falls back to home_console
    }
    set({ hydrated: true });
  },
}));
