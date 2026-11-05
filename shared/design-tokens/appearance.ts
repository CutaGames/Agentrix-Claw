/**
 * Pure helpers for resolving an owner's appearance choice into a palette.
 * Storage and system-scheme detection belong to each surface.
 */
import {
  ACCENTS,
  ACCENT_IDS,
  APPEARANCE_MODES,
  DEFAULT_APPEARANCE,
  NEUTRAL,
  SEMANTIC,
  type AccentId,
  type Appearance,
  type AppearanceMode,
  type ColorScheme,
  type Palette,
} from "./tokens";

export function isAppearanceMode(value: unknown): value is AppearanceMode {
  return typeof value === "string" && (APPEARANCE_MODES as readonly string[]).includes(value);
}

export function isAccentId(value: unknown): value is AccentId {
  return typeof value === "string" && (ACCENT_IDS as readonly string[]).includes(value);
}

/**
 * Accepts anything read back from storage or the network and returns a valid
 * appearance. Unknown fields fall back to the default one by one, so a bad
 * accent never resets a valid mode (or the other way round).
 */
export function normalizeAppearance(input: unknown): Appearance {
  const record =
    input && typeof input === "object" ? (input as Record<string, unknown>) : {};
  return {
    mode: isAppearanceMode(record.mode) ? record.mode : DEFAULT_APPEARANCE.mode,
    accent: isAccentId(record.accent) ? record.accent : DEFAULT_APPEARANCE.accent,
  };
}

/** "Follow system" resolves to whatever the OS currently prefers. */
export function resolveColorScheme(mode: AppearanceMode, systemPrefersDark: boolean): ColorScheme {
  if (mode === "light" || mode === "dark") return mode;
  return systemPrefersDark ? "dark" : "light";
}

export function resolvePalette(scheme: ColorScheme, accent: AccentId): Palette {
  const accentPalette = (ACCENTS[accent] ?? ACCENTS[DEFAULT_APPEARANCE.accent])[scheme];
  return { ...NEUTRAL[scheme], ...SEMANTIC[scheme], ...accentPalette };
}

/** Convenience for surfaces that already know the system preference. */
export function paletteForAppearance(appearance: Appearance, systemPrefersDark: boolean): Palette {
  return resolvePalette(resolveColorScheme(appearance.mode, systemPrefersDark), appearance.accent);
}
