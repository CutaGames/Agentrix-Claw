/**
 * Agentrix design tokens: the one colour source for Web, Mobile and Desktop
 * (product doc §11.3–11.5, decision D11).
 *
 * - Mode: follow system (default) / light / dark.
 * - Accent: 曜石青 obsidian-cyan (default) / 晴空蓝 sky-blue / 星云紫
 *   nebula-violet / 墨石 ink.
 * - Neutral and semantic colours never change with the accent.
 *
 * Plain data and types only: no runtime dependencies, so every surface
 * (Next.js, React Native / Metro, Vite + Tauri) can import it as source.
 */

export const DESIGN_TOKENS_VERSION = 1 as const;

/** A concrete colour scheme, after "follow system" has been resolved. */
export type ColorScheme = "light" | "dark";
/** What the owner picks in 我的 → 设置 → 外观. */
export type AppearanceMode = "system" | ColorScheme;
export type AccentId = "obsidian-cyan" | "sky-blue" | "nebula-violet" | "ink";

export const COLOR_SCHEMES: readonly ColorScheme[] = ["light", "dark"];
export const APPEARANCE_MODES: readonly AppearanceMode[] = ["system", "light", "dark"];
export const ACCENT_IDS: readonly AccentId[] = [
  "obsidian-cyan",
  "sky-blue",
  "nebula-violet",
  "ink",
];

export interface Appearance {
  mode: AppearanceMode;
  accent: AccentId;
}

export const DEFAULT_APPEARANCE: Readonly<Appearance> = Object.freeze({
  mode: "system",
  accent: "obsidian-cyan",
});

export interface LocalizedLabel {
  zh: string;
  en: string;
}

export const APPEARANCE_MODE_LABELS: Readonly<Record<AppearanceMode, LocalizedLabel>> = {
  system: { zh: "跟随系统", en: "System" },
  light: { zh: "浅色", en: "Light" },
  dark: { zh: "深色", en: "Dark" },
};

export const ACCENT_LABELS: Readonly<Record<AccentId, LocalizedLabel>> = {
  "obsidian-cyan": { zh: "曜石青", en: "Obsidian Cyan" },
  "sky-blue": { zh: "晴空蓝", en: "Sky Blue" },
  "nebula-violet": { zh: "星云紫", en: "Nebula Violet" },
  ink: { zh: "墨石", en: "Ink" },
};

/** Shared by every accent. */
export interface NeutralPalette {
  /** Page background. */
  bg: string;
  /** Cards. */
  surface: string;
  /** Inputs, segmented controls, secondary buttons. */
  surface2: string;
  divider: string;
  /** Body text. */
  text: string;
  /** Secondary text. */
  text2: string;
  /** Placeholders and timestamps. */
  text3: string;
  /**
   * Unselected icon strokes. Graphics only (3:1); never use it for text.
   */
  iconIdle: string;
}

export interface AccentPalette {
  /** Primary button fill. */
  accent: string;
  /** Text and icons on `accent`. */
  onAccent: string;
  /** Links and selected state. */
  accentText: string;
  /** Tinted background. */
  accentSoft: string;
  /**
   * AI status halo and progress bars. Decorative: it never carries meaning on
   * its own and always sits next to text. Only obsidian-cyan light defines a
   * separate value (§11.4); every other combination reuses `accentText`.
   */
  accentDecor: string;
}

/** Fixed meanings, identical under every accent. */
export interface SemanticPalette {
  /** Done, verified, income (income is always this green, never gold). */
  success: string;
  successSoft: string;
  /** Needs confirmation, expiring soon. */
  warning: string;
  warningSoft: string;
  /** Emergency stop, reject, irreversible. */
  danger: string;
  dangerSoft: string;
  onDanger: string;
  /** The twin and you in person. */
  twin: string;
  twinSoft: string;
  onTwin: string;
}

export type Palette = NeutralPalette & AccentPalette & SemanticPalette;
export type PaletteToken = keyof Palette;

/**
 * §11.4 neutral values, with one correction: light `text3` is `#626F7A`
 * instead of `#66737E`. The documented value measures 4.29:1 on `surface2`,
 * which is exactly where placeholders sit (inputs), so it fails WCAG AA.
 * `#626F7A` is the lightest step that passes there (4.55:1).
 */
export const NEUTRAL: Readonly<Record<ColorScheme, NeutralPalette>> = {
  light: {
    bg: "#F6F8FA",
    surface: "#FFFFFF",
    surface2: "#EEF1F4",
    divider: "#E6EAEE",
    text: "#0E1419",
    text2: "#56636E",
    text3: "#626F7A",
    iconIdle: "#7A8994",
  },
  dark: {
    bg: "#0B0E11",
    surface: "#15191E",
    surface2: "#1C2127",
    divider: "#262C33",
    text: "#EEF2F5",
    text2: "#A8B4BD",
    text3: "#8C98A2",
    iconIdle: "#6E7A85",
  },
};

export const ACCENTS: Readonly<Record<AccentId, Readonly<Record<ColorScheme, AccentPalette>>>> = {
  // Pure cyan cannot be both bright and AA on white, so the light primary
  // button is black and cyan stays an AI-status accent.
  "obsidian-cyan": {
    light: {
      accent: "#0B0E11",
      onAccent: "#FFFFFF",
      accentText: "#007686",
      accentSoft: "#E3FAFC",
      accentDecor: "#22C7D8",
    },
    dark: {
      accent: "#35D9E8",
      onAccent: "#04191C",
      accentText: "#35D9E8",
      accentSoft: "#1A383E",
      accentDecor: "#35D9E8",
    },
  },
  "sky-blue": {
    light: {
      accent: "#1460ED",
      onAccent: "#FFFFFF",
      accentText: "#1460ED",
      accentSoft: "#E8EFFD",
      accentDecor: "#1460ED",
    },
    dark: {
      accent: "#6EA8FF",
      onAccent: "#06142E",
      accentText: "#6EA8FF",
      accentSoft: "#233042",
      accentDecor: "#6EA8FF",
    },
  },
  // Solid colour only; no gradients (brand rule).
  "nebula-violet": {
    light: {
      accent: "#6D4CF2",
      onAccent: "#FFFFFF",
      accentText: "#6D4CF2",
      accentSoft: "#F0EDFE",
      accentDecor: "#6D4CF2",
    },
    dark: {
      accent: "#A898FF",
      onAccent: "#140B33",
      accentText: "#A898FF",
      accentSoft: "#2D2D42",
      accentDecor: "#A898FF",
    },
  },
  ink: {
    light: {
      accent: "#0B0E11",
      onAccent: "#FFFFFF",
      accentText: "#0B0E11",
      accentSoft: "#EEF1F4",
      accentDecor: "#0B0E11",
    },
    dark: {
      accent: "#EEF2F5",
      onAccent: "#0B0E11",
      accentText: "#EEF2F5",
      accentSoft: "#383C40",
      accentDecor: "#EEF2F5",
    },
  },
};

/**
 * §11.4 semantic values. The text colour on danger / twin buttons is not
 * listed in §11.4; white (light) and obsidian `#0B0E11` (dark) are used, and
 * both pass AA (see contrast.ts).
 */
export const SEMANTIC: Readonly<Record<ColorScheme, SemanticPalette>> = {
  light: {
    success: "#1D7A58",
    successSoft: "#E3F4EC",
    warning: "#8A6100",
    warningSoft: "#FFF4D6",
    danger: "#C0392B",
    dangerSoft: "#FDECEA",
    onDanger: "#FFFFFF",
    twin: "#B44A35",
    twinSoft: "#FDECE7",
    onTwin: "#FFFFFF",
  },
  dark: {
    success: "#4FD1A5",
    successSoft: "#1D3331",
    warning: "#E1B866",
    warningSoft: "#322F28",
    danger: "#F2766B",
    dangerSoft: "#342629",
    onDanger: "#0B0E11",
    twin: "#FF8A73",
    twinSoft: "#36292A",
    onTwin: "#0B0E11",
  },
};

/** CSS custom property for every palette token (Web and Desktop). */
export const CSS_VAR_NAMES: Readonly<Record<PaletteToken, string>> = {
  bg: "--ax-bg",
  surface: "--ax-surface",
  surface2: "--ax-surface-2",
  divider: "--ax-divider",
  text: "--ax-text",
  text2: "--ax-text-2",
  text3: "--ax-text-3",
  iconIdle: "--ax-icon-idle",
  accent: "--ax-accent",
  onAccent: "--ax-on-accent",
  accentText: "--ax-accent-text",
  accentSoft: "--ax-accent-soft",
  accentDecor: "--ax-accent-decor",
  success: "--ax-success",
  successSoft: "--ax-success-soft",
  warning: "--ax-warning",
  warningSoft: "--ax-warning-soft",
  danger: "--ax-danger",
  dangerSoft: "--ax-danger-soft",
  onDanger: "--ax-on-danger",
  twin: "--ax-twin",
  twinSoft: "--ax-twin-soft",
  onTwin: "--ax-on-twin",
};

/** Root attributes the generated CSS keys on. */
export const THEME_ATTRIBUTE = "data-theme" as const;
export const ACCENT_ATTRIBUTE = "data-accent" as const;
