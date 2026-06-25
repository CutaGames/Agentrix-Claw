/**
 * i18n Store — Chinese/English language switching for mobile app
 * Uses Zustand + AsyncStorage for persistence
 */
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { NativeModules, Platform } from 'react-native';

export type Language = 'en' | 'zh';

export type TranslationDescriptor = string | { zh: string; en: string };

interface I18nState {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: (desc: TranslationDescriptor) => string;
}

// Detect device language
function getDeviceLanguage(): Language {
  try {
    let locale = 'en';
    if (Platform.OS === 'ios') {
      locale = NativeModules.SettingsManager?.settings?.AppleLocale ||
               NativeModules.SettingsManager?.settings?.AppleLanguages?.[0] || 'en';
    } else {
      locale = NativeModules.I18nManager?.localeIdentifier || 'en';
    }
    return locale.startsWith('zh') ? 'zh' : 'en';
  } catch {
    return 'en';
  }
}

export const useI18n = create<I18nState>()(
  persist(
    (set, get) => ({
      language: getDeviceLanguage(),

      setLanguage: (lang: Language) => set({ language: lang }),

      t: (desc: TranslationDescriptor): string => {
        if (typeof desc === 'string') return desc;
        const lang = get().language;
        return desc[lang] || desc.en || desc.zh || '';
      },
    }),
    {
      name: 'agentrix-i18n',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({ language: state.language }),
    }
  )
);
