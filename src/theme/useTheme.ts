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
  getThemeMode,
  getPalette,
  subscribeTheme,
  setThemeMode,
  colors,
  type ThemeMode,
  darkColors,
} from './colors';

export type Palette = typeof darkColors;

/** Current theme mode; re-renders the component when it changes. */
export function useThemeMode(): ThemeMode {
  return useSyncExternalStore(subscribeTheme, getThemeMode, getThemeMode);
}

/** Current palette (light/dark); stable per mode, re-renders on switch. */
export function useColors(): Palette {
  const mode = useThemeMode();
  return useMemo(() => getPalette(mode), [mode]);
}

/** Full theme handle: mode + palette + setters. */
export function useTheme() {
  const mode = useThemeMode();
  const colors = useMemo(() => getPalette(mode), [mode]);
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
  const mode = useThemeMode();
  // Intentionally keyed on mode only — a stable module-scope factory keeps this cheap.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => factory(getPalette(mode)), [mode]);
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
  const cache = new Map<ThemeMode, T>();
  const buildFor = (m: ThemeMode): T => {
    const cur = getThemeMode();
    if (m === cur) return factory();
    Object.assign(colors, getPalette(m));
    try {
      return factory();
    } finally {
      Object.assign(colors, getPalette(cur));
    }
  };
  const current = (): T => {
    const m = getThemeMode();
    let s = cache.get(m);
    if (!s) {
      s = buildFor(m);
      cache.set(m, s);
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
