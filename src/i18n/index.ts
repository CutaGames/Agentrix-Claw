import { getLocales } from 'expo-localization';
import en from './en';
import zhHans from './zh-Hans';

type Locale = typeof en;

const locales: Record<string, Locale> = {
  en,
  'zh-Hans': zhHans,
  zh: zhHans,
};

let currentLocale: Locale = en;

export function initI18n(lang?: string) {
  const deviceLang = lang ?? getLocales()[0]?.languageCode ?? 'en';
  const key = Object.keys(locales).find(k => deviceLang.startsWith(k)) ?? 'en';
  currentLocale = locales[key] ?? en;
}

export function t(key: string): string {
  const parts = key.split('.');
  let current: Record<string, unknown> = currentLocale as unknown as Record<string, unknown>;
  for (const part of parts) {
    if (current == null) return key;
    current = current[part] as Record<string, unknown>;
  }
  return (current as unknown as string) ?? key;
}

export function tObj<T extends keyof Locale>(section: T): Locale[T] {
  return currentLocale[section];
}

export { en, zhHans };
export type { Locale };
