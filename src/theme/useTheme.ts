// Reactive theme hooks — runtime (no-reload) light/dark switching.
//
// Why this exists: most legacy screens build `const styles = StyleSheet.create({...colors.x})`
// at MODULE scope, which bakes the color values at import time — so switching theme only
// repaints them after an app reload. Screens that want to switch LIVE should:
//   • read palette via useColors()/useTheme(), and
//   • build styles via useThemedStyles(makeStyles) instead of a module-scope StyleSheet.
// These hooks subscribe to the theme store and re-render the instant the mode changes.
import { useSyncExternalStore, useMemo } from 'react';
import {
  getAppearance,
  getThemeKey,
  getThemeMode,
  getPalette,
  setAppearance,
  subscribeTheme,
  setThemeMode,
  type ThemeMode,
  darkColors,
} from './colors';
import type { Appearance } from './appearance';

export type Palette = typeof darkColors;

/** Current theme mode; re-renders the component when it changes. */
export function useThemeMode(): ThemeMode {
  return useSyncExternalStore(subscribeTheme, getThemeMode, getThemeMode);
}

/** Mode + accent key; changes on an accent switch too (token-themed builds). */
export function useThemeKey(): string {
  return useSyncExternalStore(subscribeTheme, getThemeKey, getThemeKey);
}

/** Current appearance choice and setter (M1-e 外观). */
export function useAppearance(): [Appearance, (next: Appearance) => Appearance] {
  useThemeKey();
  return [getAppearance(), setAppearance];
}

/** Current palette (light/dark); stable per mode, re-renders on switch. */
export function useColors(): Palette {
  const key = useThemeKey();
  const mode = getThemeMode();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => getPalette(mode), [key]);
}

/** Full theme handle: mode + palette + setters. */
export function useTheme() {
  const key = useThemeKey();
  const mode = getThemeMode();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const colors = useMemo(() => getPalette(mode), [key]);
  return {
    mode,
    colors,
    isDark: mode === 'dark',
    setMode: setThemeMode,
    toggle: () => setThemeMode(mode === 'dark' ? 'light' : 'dark'),
  };
}

/**
 * Build a memoized StyleSheet from the current palette. Pass a factory that maps the
 * palette → styles. Recomputes only when the mode changes (the factory should be a
 * stable module-scope function for best results).
 *
 *   const makeStyles = (c: typeof darkColors) => StyleSheet.create({ box: { backgroundColor: c.bg } });
 *   const styles = useThemedStyles(makeStyles);
 */
export function useThemedStyles<T>(factory: (c: Palette) => T): T {
  const key = useThemeKey();
  // Intentionally keyed on mode + accent only — a stable module-scope factory keeps this cheap.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => factory(getPalette(getThemeMode())), [key]);
}

/**
 * themedStyles — drop-in wrapper for a MODULE-SCOPE `StyleSheet.create(...)` that makes the styles
 * theme-reactive WITHOUT a per-component hook. Returns a Proxy that, on every property access,
 * returns the StyleSheet for the CURRENT theme mode (built lazily + cached per mode).
 *
 * Usage (what the codemod produces):
 *   const styles = themedStyles(() => StyleSheet.create({ box: { backgroundColor: colors.bg } }));
 *
 * The factory reads the live `colors` object (setThemeMode mutates it in place); we build each
 * mode by briefly aligning `colors` to that mode. Components then show the right theme on their
 * next render/focus (no app reload). Screens migrated to useThemedStyles/useColors switch instantly.
 */
export function themedStyles<T extends Record<string, any>>(factory: () => T): T {
  // Keyed on mode + accent (getThemeKey) so an accent switch rebuilds too.
  const cache = new Map<string, T>();
  const current = (): T => {
    const key = getThemeKey();
    let s = cache.get(key);
    if (!s) {
      // `colors` already holds the current palette (setThemeMode / setAppearance
      // mutate it in place before notifying).
      s = factory();
      cache.set(key, s);
    }
    return s;
  };
  return new Proxy({} as T, {
    get: (_t, p) => (current() as any)[p],
    ownKeys: () => Reflect.ownKeys(current() as any),
    has: (_t, p) => p in (current() as any),
    getOwnPropertyDescriptor: (_t, p) => Object.getOwnPropertyDescriptor(current() as any, p),
  });
}
