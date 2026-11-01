/**
 * WCAG 2.x contrast checks for the palette (§11.4). Surfaces can reuse the
 * pair list to test their own mappings. Passing these ratios is only the
 * baseline: full accessibility compliance still needs manual testing with
 * assistive technology and an expert review.
 */
import type { Palette, PaletteToken } from "./tokens";

/** Normal-size text, WCAG AA. */
export const TEXT_CONTRAST_MIN = 4.5;
/** Graphical objects and UI component boundaries, WCAG AA (1.4.11). */
export const GRAPHIC_CONTRAST_MIN = 3;

function channel(value: number): number {
  const c = value / 255;
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

/** Relative luminance of a `#RRGGBB` colour. */
export function relativeLuminance(hex: string): number {
  const match = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!match) throw new Error(`Expected #RRGGBB, got ${hex}`);
  const n = parseInt(match[1], 16);
  const r = channel((n >> 16) & 0xff);
  const g = channel((n >> 8) & 0xff);
  const b = channel(n & 0xff);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const [hi, lo] = la >= lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

export interface ContrastPair {
  fg: PaletteToken;
  bg: PaletteToken;
  min: number;
}

const text = (fg: PaletteToken, bg: PaletteToken): ContrastPair => ({ fg, bg, min: TEXT_CONTRAST_MIN });
const graphic = (fg: PaletteToken, bg: PaletteToken): ContrastPair => ({
  fg,
  bg,
  min: GRAPHIC_CONTRAST_MIN,
});

/**
 * The 31 text pairs from §11.4, checked for every mode × accent:
 * - three text levels on bg, surface and surface2 (9);
 * - accent text on bg, surface and accentSoft (3);
 * - text on the primary button (1);
 * - four semantic colours on bg, surface and their own soft block (12);
 * - body text on each semantic soft block (4);
 * - text on danger and twin buttons (2).
 */
export const TEXT_CONTRAST_PAIRS: readonly ContrastPair[] = [
  ...(["text", "text2", "text3"] as const).flatMap((fg) =>
    (["bg", "surface", "surface2"] as const).map((bg) => text(fg, bg)),
  ),
  text("accentText", "bg"),
  text("accentText", "surface"),
  text("accentText", "accentSoft"),
  text("onAccent", "accent"),
  ...(
    [
      ["success", "successSoft"],
      ["warning", "warningSoft"],
      ["danger", "dangerSoft"],
      ["twin", "twinSoft"],
    ] as const
  ).flatMap(([fg, soft]) => [text(fg, "bg"), text(fg, "surface"), text(fg, soft)]),
  text("text", "successSoft"),
  text("text", "warningSoft"),
  text("text", "dangerSoft"),
  text("text", "twinSoft"),
  text("onDanger", "danger"),
  text("onTwin", "twin"),
];

/** Unselected icon strokes on every neutral background. */
export const GRAPHIC_CONTRAST_PAIRS: readonly ContrastPair[] = [
  graphic("iconIdle", "bg"),
  graphic("iconIdle", "surface"),
  graphic("iconIdle", "surface2"),
];

export interface ContrastResult extends ContrastPair {
  ratio: number;
  pass: boolean;
}

export function auditPaletteContrast(
  palette: Palette,
  pairs: readonly ContrastPair[] = [...TEXT_CONTRAST_PAIRS, ...GRAPHIC_CONTRAST_PAIRS],
): ContrastResult[] {
  return pairs.map((pair) => {
    const ratio = contrastRatio(palette[pair.fg], palette[pair.bg]);
    return { ...pair, ratio, pass: ratio >= pair.min };
  });
}
