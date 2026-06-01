/**
 * i18n Store — Chinese/English language switching for mobile app
 * Uses Zustand + AsyncStorage for persistence
 *
 * Architecture: Raw store holds language state, `useI18n` hook derives
 * a render-bound `t` function so any language change triggers fresh translations.
 */
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { mmkvStorage } from './mmkvStorage';
import { NativeModules, Platform } from 'react-native';
import { useCallback, useMemo } from 'react';
import { initI18n } from '../i18n';

export type Language = 'en' | 'zh';

export type TranslationDescriptor = string | { zh: string; en: string };

interface I18nStoreState {
  language: Language;
  /** Incremented on every language change to force re-renders */
  _rev: number;
  setLanguage: (lang: Language) => void;
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

// Initialise module-level locale on import
try { initI18n(getDeviceLanguage()); } catch (_) {}

// Raw Zustand store — holds language + revision
const useI18nStore = create<I18nStoreState>()(
  persist(
    (set, get) => ({
      language: getDeviceLanguage(),
      _rev: 0,

      setLanguage: (lang: Language) => {
        // Sync the module-level i18n locale first
        try { initI18n(lang); } catch (_) {}
        set({
          language: lang,
          _rev: get()._rev + 1,
        });
      },

    }),
    {
      name: 'agentrix-i18n',
      storage: createJSONStorage(() => mmkvStorage),
      partialize: (state) => ({ language: state.language }),
      onRehydrateStorage: () => (state) => {
        // After hydration, sync module-level i18n with persisted language
        if (state?.language) {
          try { initI18n(state.language); } catch (_) {}
        }
      },
    }
  )
);

/**
 * Derived hook: returns language, setLanguage, and a render-bound `t()` function.
 * The `t` function creates a fresh closure on every language change, which guarantees
 * component re-renders show the correct translation (without relying on store `get()`).
 */
export function useI18n() {
  const language = useI18nStore((s) => s.language);
  const setLanguage = useI18nStore((s) => s.setLanguage);
  // Subscribe to _rev so any language change triggers re-render in all consumers
  const _rev = useI18nStore((s) => s._rev); // eslint-disable-line @typescript-eslint/no-unused-vars

  const t = useCallback(
    (desc: TranslationDescriptor): string => {
      if (typeof desc === 'string') return desc;
      return desc[language] || desc.en || desc.zh || '';
    },
    [language],
  );

  return useMemo(
    () => ({ language, setLanguage, t }),
    [language, setLanguage, t],
  );
}
