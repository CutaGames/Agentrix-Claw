/**
 * Generates `tokens.css`: CSS custom properties for Web and Desktop.
 *
 * Put the attributes on the root element (`<html>`):
 * - no `data-theme`            → follow the system (`prefers-color-scheme`);
 * - `data-theme="light|dark"`  → explicit mode;
 * - `data-accent="<AccentId>"` → accent (obsidian-cyan when absent).
 *
 * A nested container can scope a preview only with an explicit
 * `data-theme="light|dark"` and `data-accent` on the same element; the
 * follow-system rule matches the root only.
 *
 * `tokens.css` is checked in and must equal `buildDesignTokensCss()`
 * (the Web test suite fails on drift; `npm test -- __tests__/design-tokens -u`
 * in `frontend/` regenerates it).
 */
import {
  ACCENTS,
  ACCENT_ATTRIBUTE,
  ACCENT_IDS,
  CSS_VAR_NAMES,
  DEFAULT_APPEARANCE,
  DESIGN_TOKENS_VERSION,
  NEUTRAL,
  SEMANTIC,
  THEME_ATTRIBUTE,
  type AccentId,
  type ColorScheme,
  type PaletteToken,
} from "./tokens";

type Declarations = Partial<Record<PaletteToken, string>>;

function declare(values: Declarations, indent: string, extra: string[] = []): string {
  const lines = [...extra];
  for (const [token, value] of Object.entries(values) as [PaletteToken, string][]) {
    lines.push(`${CSS_VAR_NAMES[token]}: ${value};`);
  }
  return lines.map((line) => `${indent}${line}`).join("\n");
}

function rule(selector: string, body: string, indent = ""): string {
  return `${indent}${selector} {\n${body}\n${indent}}`;
}

function schemeBody(scheme: ColorScheme, indent: string): string {
  return declare(
    { ...NEUTRAL[scheme], ...SEMANTIC[scheme], ...ACCENTS[DEFAULT_APPEARANCE.accent][scheme] },
    indent,
    [`color-scheme: ${scheme};`],
  );
}

function accentBody(accent: AccentId, scheme: ColorScheme, indent: string): string {
  return declare({ ...ACCENTS[accent][scheme] }, indent);
}

const theme = (scheme: ColorScheme) => `[${THEME_ATTRIBUTE}="${scheme}"]`;
const accentAttr = (accent: AccentId) => `[${ACCENT_ATTRIBUTE}="${accent}"]`;
/** The root, when it follows the system and the system prefers dark. */
const SYSTEM_DARK_ROOT = `:root:not(${theme("light")})`;

export function buildDesignTokensCss(): string {
  const blocks: string[] = [
    `/* Agentrix design tokens v${DESIGN_TOKENS_VERSION}. Generated from shared/design-tokens; do not edit by hand. */`,
    rule(`:root,\n${theme("light")}`, schemeBody("light", "  ")),
    rule(theme("dark"), schemeBody("dark", "  ")),
    `@media (prefers-color-scheme: dark) {\n${rule(SYSTEM_DARK_ROOT, schemeBody("dark", "    "), "  ")}\n}`,
  ];
  for (const accent of ACCENT_IDS) {
    blocks.push(rule(accentAttr(accent), accentBody(accent, "light", "  ")));
    blocks.push(rule(`${theme("dark")}${accentAttr(accent)}`, accentBody(accent, "dark", "  ")));
    blocks.push(
      `@media (prefers-color-scheme: dark) {\n${rule(
        `${SYSTEM_DARK_ROOT}${accentAttr(accent)}`,
        accentBody(accent, "dark", "    "),
        "  ",
      )}\n}`,
    );
  }
  return `${blocks.join("\n\n")}\n`;
}
