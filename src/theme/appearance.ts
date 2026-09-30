/**
 * appearance — map the shared design tokens (D11, `shared/design-tokens/`)
 * onto the phone's legacy colour keys (`src/theme/colors.ts`).
 *
 * Pure: no react-native import, so the mapping and the stored-value
 * migration are testable under the root jest.
 *
 * Mapping (REQ-web-003 reply, confirmed by web):
 *   - surfaces: bg / background / bgPrimary → bg; bgCard / card /
 *     cardBackground → surface; bgSecondary / cardAlt / input → surface2;
 *     border → divider;
 *   - text: text / textPrimary → text; textSecondary → text2;
 *     textMuted / textTertiary / muted → text3;
 *   - accent: primary / accentDark → accent (button fill, pair with
 *     onAccent); accent / primaryLight / info / openclaw → accentText
 *     (links, selected state, bright text or icons); textInverse /
 *     onAccent → onAccent; onDanger → onDanger; onSuccess → onDanger's value;
 *   - semantic: success, warning, error / danger → the fixed semantic colours;
 *   - social brand colours stay as they are.
 */
import {
  DEFAULT_APPEARANCE,
  normalizeAppearance,
  resolveColorScheme,
  resolvePalette,
  type Appearance,
  type ColorScheme,
  type Palette as TokenPalette,
} from '../../shared/design-tokens';

export const APPEARANCE_STORAGE_KEY = 'app_appearance_v1' as const;
/** Pre-token key: stored 'light' | 'dark'. Read once to migrate. */
export const LEGACY_THEME_STORAGE_KEY = 'app_theme_mode' as const;

export type { Appearance, ColorScheme };

/** The legacy key set (mirrors `darkColors` in colors.ts). */
export interface LegacyColorSet {
  bg: string;
  background: string;
  bgPrimary: string;
  bgSecondary: string;
  bgCard: string;
  card: string;
  cardAlt: string;
  cardBackground: string;
  input: string;
  border: string;
  primary: string;
  primaryLight: string;
  accent: string;
  accentDark: string;
  onAccent: string;
  text: string;
  textPrimary: string;
  textSecondary: string;
  textMuted: string;
  textTertiary: string;
  muted: string;
  textInverse: string;
  success: string;
  warning: string;
  error: string;
  danger: string;
  onDanger: string;
  onSuccess: string;
  info: string;
  google: string;
  twitter: string;
  apple: string;
  discord: string;
  telegram: string;
  openclaw: string;
}

export function legacyColorsFromTokens<T extends LegacyColorSet>(token: TokenPalette, base: T): T {
  return {
    ...base,
    bg: token.bg,
    background: token.bg,
    bgPrimary: token.bg,
    bgSecondary: token.surface2,
    bgCard: token.surface,
    card: token.surface,
    cardAlt: token.surface2,
    cardBackground: token.surface,
    input: token.surface2,
    border: token.divider,
    primary: token.accent,
    primaryLight: token.accentText,
    accent: token.accentText,
    accentDark: token.accent,
    onAccent: token.onAccent,
    text: token.text,
    textPrimary: token.text,
    textSecondary: token.text2,
    textMuted: token.text3,
    textTertiary: token.text3,
    muted: token.text3,
    textInverse: token.onAccent,
    success: token.success,
    warning: token.warning,
    error: token.danger,
    danger: token.danger,
    onDanger: token.onDanger,
    // No token for text on success; the danger pair has the same light / dark
    // split (white on the dark light-mode fill, ink on the bright dark-mode fill).
    onSuccess: token.onDanger,
    info: token.accentText,
    openclaw: token.accentText,
    // Social brand colours are not part of the token system.
    apple: token.text,
  };
}

/**
 * Read the stored appearance. A missing or corrupt value falls back to the
 * default; a pre-token 'light' / 'dark' choice is kept as the mode.
 */
export function readStoredAppearance(get: (key: string) => string | undefined | null): Appearance {
  const raw = get(APPEARANCE_STORAGE_KEY);
  if (raw) {
    try {
      return normalizeAppearance(JSON.parse(raw));
    } catch {
      return { ...DEFAULT_APPEARANCE };
    }
  }
  const legacy = get(LEGACY_THEME_STORAGE_KEY);
  if (legacy === 'light' || legacy === 'dark') {
    return { mode: legacy, accent: DEFAULT_APPEARANCE.accent };
  }
  return { ...DEFAULT_APPEARANCE };
}

export function serializeAppearance(appearance: Appearance): string {
  return JSON.stringify(normalizeAppearance(appearance));
}

export function schemeFor(appearance: Appearance, systemPrefersDark: boolean): ColorScheme {
  return resolveColorScheme(appearance.mode, systemPrefersDark);
}

export function tokenPaletteFor(appearance: Appearance, systemPrefersDark: boolean): TokenPalette {
  return resolvePalette(schemeFor(appearance, systemPrefersDark), appearance.accent);
}
