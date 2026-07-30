// ClawLink Design System — Color Tokens (theme-aware: dark / light).
//
// Architecture note: most screens use module-scope StyleSheet.create({...colors.x...}),
// which captures the color VALUE at import time. So switching theme recolors everything
// only after the JS bundle re-evaluates — i.e. on app reload. We therefore:
//   1) read the persisted mode synchronously at module load and build `colors` from it;
//   2) expose setThemeMode() which persists + mutates `colors` in place (for dynamic
//      readers) and the caller reloads the app so module StyleSheets pick up the palette.
import { mmkv } from '../stores/mmkvStorage';

export type ThemeMode = 'dark' | 'light';
const THEME_KEY = 'app_theme_mode';

export const darkColors = {
  // ── Backgrounds ──
  bg: '#0B1220',
  background: '#0B1220',
  bgPrimary: '#0B1220',
  bgSecondary: '#111827',
  bgCard: '#1a2235',
  card: '#1a2235',
  cardAlt: '#1f2d42',
  cardBackground: '#1a2235',
  input: '#162030',
  border: '#2a3a52',
  // ── Brand ──
  primary: '#1a77e0',
  primaryLight: '#3b97f5',
  accent: '#00d4ff',
  accentDark: '#009dbf',
  // ── Text ──
  text: '#f0f6ff',
  textPrimary: '#f0f6ff',
  textSecondary: '#a6bdd6',
  textMuted: '#7b93ab',
  textTertiary: '#7b93ab',
  muted: '#7b93ab',
  textInverse: '#0B1220',
  // ── Status ──
  success: '#10B981',
  warning: '#F59E0B',
  error: '#EF4444',
  danger: '#EF4444',
  info: '#3b82f6',
  // ── Social brand ──
  google: '#4285F4',
  twitter: '#1DA1F2',
  apple: '#f0f6ff',
  discord: '#5865F2',
  telegram: '#0088CC',
  openclaw: '#00d4ff',
};

export type ColorKey = keyof typeof darkColors;

// Light palette — overrides surfaces/text for contrast; keeps brand/status hues.
export const lightColors: typeof darkColors = {
  ...darkColors,
  bg: '#f4f6fb',
  background: '#f4f6fb',
  bgPrimary: '#f4f6fb',
  bgSecondary: '#eaeef6',
  bgCard: '#ffffff',
  card: '#ffffff',
  cardAlt: '#eef2f9',
  cardBackground: '#ffffff',
  input: '#eef2f9',
  border: '#d3dceb',
  primary: '#1666c7',
  primaryLight: '#2f86e6',
  accent: '#0094c7',
  accentDark: '#0079a3',
  text: '#0b1220',
  textPrimary: '#0b1220',
  textSecondary: '#3c4a5e',
  textMuted: '#64748b',
  textTertiary: '#64748b',
  muted: '#64748b',
  textInverse: '#ffffff',
  apple: '#0b1220',
  openclaw: '#0094c7',
};

function readMode(): ThemeMode {
  try {
    return mmkv.getString(THEME_KEY) === 'light' ? 'light' : 'dark';
  } catch {
    return 'dark';
  }
}

let _mode: ThemeMode = readMode();

/** Live, stable-reference color object. Built from the persisted mode at load. */
export const colors: typeof darkColors = { ...darkColors };
Object.assign(colors, _mode === 'light' ? lightColors : darkColors);

export function getThemeMode(): ThemeMode {
  return _mode;
}

/** Resolve the full palette for a mode (defaults to the current mode). */
export function getPalette(mode: ThemeMode = _mode): typeof darkColors {
  return mode === 'light' ? lightColors : darkColors;
}

// ── Live theme subscription (for runtime, no-reload switching) ──────────────
// Screens that opt into useTheme()/useThemedStyles() re-render the instant the
// mode changes; module-scope StyleSheets (legacy) still need an app reload.
type ThemeListener = () => void;
const themeListeners = new Set<ThemeListener>();

/** Subscribe to theme-mode changes. Returns an unsubscribe fn (useSyncExternalStore-friendly). */
export function subscribeTheme(listener: ThemeListener): () => void {
  themeListeners.add(listener);
  return () => {
    themeListeners.delete(listener);
  };
}

/**
 * Persist + apply a theme mode. Mutates `colors` in place (legacy dynamic readers
 * update) AND notifies subscribers so any screen using useTheme()/useThemedStyles()
 * recolors immediately — no reload. Module-scope StyleSheets that captured colors at
 * import still need a reload to fully repaint. Returns the applied mode.
 */
export function setThemeMode(mode: ThemeMode): ThemeMode {
  _mode = mode;
  try {
    mmkv.set(THEME_KEY, mode);
  } catch {
    /* best-effort persistence */
  }
  Object.assign(colors, mode === 'light' ? lightColors : darkColors);
  // Notify live consumers (defensive: a bad listener must not break the switch).
  themeListeners.forEach((l) => {
    try {
      l();
    } catch {
      /* ignore */
    }
  });
  return _mode;
}

// Gradient pairs [from, to]
export const gradients = {
  brand: ['#1a77e0', '#00d4ff'] as const,
  card: ['#1a2235', '#111827'] as const,
  success: ['#059669', '#10b981'] as const,
  celebrate: ['#7c3aed', '#1a77e0', '#00d4ff'] as const,
  dark: ['#0B1220', '#111827'] as const,
  openclaw: ['#00d4ff', '#0088CC'] as const,
};
