import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useRouter } from "next/router";
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
  const fromQuery = new URLSearchParams(window.location.search).get("lang");
  if (fromQuery && (LOCALES as readonly string[]).includes(fromQuery)) return fromQuery as Locale;
  const stored = window.localStorage.getItem(STORAGE_KEY);
  if (stored && (LOCALES as readonly string[]).includes(stored)) return stored as Locale;
  const navLang = (window.navigator?.language || "").slice(0, 2).toLowerCase();
  if ((LOCALES as readonly string[]).includes(navLang)) return navLang as Locale;
  return DEFAULT_LOCALE;
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(DEFAULT_LOCALE);
  const router = useRouter();

  // Hydrate on mount.
  useEffect(() => {
    setLocaleState(detectInitialLocale());
  }, []);

  // Re-sync when ?lang= query changes.
  useEffect(() => {
    const q = router.query?.lang;
    const candidate = Array.isArray(q) ? q[0] : q;
    if (candidate && (LOCALES as readonly string[]).includes(candidate)) {
      setLocaleState(candidate as Locale);
      if (typeof window !== "undefined") {
        window.localStorage.setItem(STORAGE_KEY, candidate);
      }
    }
  }, [router.query?.lang]);

  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(STORAGE_KEY, next);
      try {
        document.documentElement.setAttribute("lang", next);
      } catch {
        // ignore
      }
    }
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
    // Safe default for components rendered outside the provider (e.g. tests).
    return {
      locale: DEFAULT_LOCALE,
      setLocale: () => undefined,
      t: (key: string) => translate(DEFAULT_LOCALE, key),
    };
  }
  return ctx;
}
