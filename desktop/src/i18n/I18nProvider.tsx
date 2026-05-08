/**
 * Desktop I18nProvider — Context + localStorage-backed locale switcher.
 *
 * Mirrors `frontend/lib/i18n/I18nProvider.tsx` but without next/router. The
 * desktop has no URL routing, so locale comes from (in order):
 *   1. localStorage `agentrix-locale`
 *   2. navigator.language (first 2 chars)
 *   3. DEFAULT_LOCALE (en)
 *
 * Other components broadcast a `agentrix:locale-changed` CustomEvent so any
 * non-React surface (e.g. tray menu refresh in Rust via window.eval) can
 * react. To set programmatically: `useI18n().setLocale("zh")`.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { DEFAULT_LOCALE, LOCALES, translate, type Locale } from "./strings";

interface I18nContextValue {
  locale: Locale;
  setLocale: (next: Locale) => void;
  t: (key: string) => string;
}

const I18nContext = createContext<I18nContextValue | null>(null);
const STORAGE_KEY = "agentrix-locale";

function detectInitialLocale(): Locale {
  if (typeof window === "undefined") return DEFAULT_LOCALE;
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored && (LOCALES as readonly string[]).includes(stored)) return stored as Locale;
  } catch {
    // localStorage may be unavailable in some Tauri sandbox modes.
  }
  const navLang = (window.navigator?.language || "").slice(0, 2).toLowerCase();
  if ((LOCALES as readonly string[]).includes(navLang)) return navLang as Locale;
  return DEFAULT_LOCALE;
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(DEFAULT_LOCALE);

  useEffect(() => {
    setLocaleState(detectInitialLocale());
  }, []);

  // Cross-window sync (tray menu rebuild via Rust eval, secondary windows).
  useEffect(() => {
    function onChange(ev: Event) {
      const next = (ev as CustomEvent<string>).detail;
      if (typeof next === "string" && (LOCALES as readonly string[]).includes(next)) {
        setLocaleState(next as Locale);
      }
    }
    window.addEventListener("agentrix:locale-changed", onChange);
    window.addEventListener("storage", () => setLocaleState(detectInitialLocale()));
    return () => {
      window.removeEventListener("agentrix:locale-changed", onChange);
    };
  }, []);

  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
      document.documentElement.setAttribute("lang", next);
    } catch {
      // ignore
    }
    window.dispatchEvent(new CustomEvent("agentrix:locale-changed", { detail: next }));
  }, []);

  const value = useMemo<I18nContextValue>(
    () => ({
      locale,
      setLocale,
      t: (key: string) => translate(locale, key),
    }),
    [locale, setLocale],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nContextValue {
  const ctx = useContext(I18nContext);
  if (!ctx) {
    return {
      locale: DEFAULT_LOCALE,
      setLocale: () => undefined,
      t: (key: string) => translate(DEFAULT_LOCALE, key),
    };
  }
  return ctx;
}
