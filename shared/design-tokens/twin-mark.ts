/**
 * Twin mark: the one geometry and colour spec for the avatar that stands for
 * an AI twin (brand-yowo-v1 §3, owner decision E131, direction A, refined per
 * twin-mark-ui brief §6: restrained, flat, no gradient, glow or shadow; the
 * numbers follow `.agents/tasks/video-l8-v3/mark-spec.md`, E133).
 * Web, Mobile and Desktop all draw from this file, so the ring, the white gap
 * and the badge keep the same proportions everywhere. Components must not
 * hard-code any of these numbers.
 *
 * What the mark is (mark-spec A1, the notched ring): the owner's own avatar
 * (photo or initial), a thin sky-blue twin ring with a gap between ring and
 * avatar, open at the lower right (4:30) with round ends, and a small flat
 * round badge with the AX chevron sitting in that opening. The echo ring (a
 * second, offset ring) stays in the spec behind `TWIN_MARK_ECHO_ENABLED`,
 * which is off. The owner's own avatar never gets the ring. Always put the
 * "AI 分身" / "AI twin" label next to the mark (`twinLabelGeometry`).
 *
 * `diameter` is the box the caller lays out (width = height = diameter). The
 * ring, avatar and badge all sit inside that box, so a slot of 32 px gets a
 * mark of 32 px. With the echo off the ring's outer edge is the box edge.
 * Widths are ratios of the diameter, with a pixel floor for small sizes.
 *
 * Draw order, back to front (all coordinates are px inside the box):
 * 1. echo ring (only when `showEcho`), hidden inside `maskRadius` around the
 *    centre: clip it with an SVG mask, or cover it with a disc in the colour
 *    behind the mark;
 * 2. gap: a disc of `gapRadius` filled with `colors.gap`, the colour behind
 *    the mark (the white seam on a white surface);
 * 3. twin ring: stroke the arc `ring.path` with `ring.width`, round line
 *    caps, no fill (it leaves the opening for the badge);
 * 4. photo or initial, cropped to the `photo` circle (initial size and weight:
 *    `twinMarkInitialFont`);
 * 5. badge cut: a disc of `badge.cutRadius` in `colors.gap` (the colour behind
 *    the mark, never a white outline; skip it on a see-through background);
 * 6. badge disc in `colors.badge`, then the chevron glyph only when
 *    `badge.showGlyph`. No outline, no shadow.
 *
 * Colours are existing palette tokens only (see `TWIN_MARK_COLOR_TOKENS`); the
 * mark adds no colour of its own. Plain data and pure functions, no runtime
 * dependencies, so Next.js, React Native / Metro and Vite + Tauri can all
 * import it as source.
 */
import { CSS_VAR_NAMES } from "./tokens";
import type { Palette } from "./tokens";

/**
 * Draw the echo ring by default? Off. The geometry for it is kept so the mark
 * can bring it back by flipping this one value (or per call, see
 * `TwinMarkOptions`).
 */
export const TWIN_MARK_ECHO_ENABLED = false;

/**
 * At or below this diameter (px) there is never an echo ring, even when it is
 * switched on. Brand §3: "32 像素以下只留分身环和徽章". 32 px itself has none.
 */
export const TWIN_MARK_NO_ECHO_AT_OR_BELOW = 32;

/** At or below this diameter (px) the chevron on the badge gets a little extra stroke so it stays legible. */
export const TWIN_MARK_THICK_GLYPH_AT_OR_BELOW = 48;

/**
 * Below this diameter (px) the badge is a plain dot without the chevron, which
 * would blur into a smudge (mark-spec §4). Below 16 px use the text label alone.
 */
export const TWIN_MARK_NO_GLYPH_BELOW = 20;

/** Direction of the badge and of the ring's opening: 45 degrees clockwise from 3 o'clock (4:30). */
export const TWIN_MARK_BADGE_ANGLE = Math.PI / 4;

export interface TwinMarkRatios {
  /** Ring width, ratio of the diameter. */
  ringWidth: number;
  /** The ring is never thinner than this many px. */
  ringWidthMinPx: number;
  /** White gap between the avatar and the ring, ratio of the diameter. */
  gap: number;
  /** The gap is never thinner than this many px. */
  gapMinPx: number;
  /** Badge radius, ratio of the diameter (0.13 = a badge 26% of the diameter wide). */
  badgeRadius: number;
  /**
   * The badge is never narrower than this many px (its diameter), as long as it
   * still fits inside the box; below about 30 px the box edge wins.
   */
  badgeMinPx: number;
  /** Badge glyph width as a ratio of the badge radius (1.12 = 56% of the badge diameter). */
  glyphWidthPerBadgeRadius: number;
  /** Extra stroke on the glyph at small sizes, in glyph path units. */
  glyphStroke: number;
  /** Notch: on each side the ring's round end stops this many gaps clear of the badge edge. */
  notchClearGaps: number;
  /** Badge cut: a disc this many gaps wider than the badge, in the colour behind the mark. */
  badgeCutGaps: number;
  /**
   * Initial (mark-spec §4). Sizes are ratios of the photo diameter: `small` at 24 px and below
   * for every script, above that `latin` / `cjk`. Weights: `weightSmall` at 24 px and below for
   * every script, `weightMid` below 64 px, `weightLarge` from 64 px on; CJK is always a step
   * lighter than Latin above 24 px.
   */
  initial: {
    small: number;
    latin: number;
    cjk: number;
    weightSmall: number;
    weightMid: { latin: number; cjk: number };
    weightLarge: { latin: number; cjk: number };
  };
  /** Echo off: the ring fills the box. Ratios of the diameter. */
  plain: { center: number; outerRadius: number };
  /**
   * Echo on: the ring is drawn smaller and up-left, so the echo ring stays
   * inside the box. Ratios of the diameter.
   */
  withEcho: { center: number; outerRadius: number; echoDx: number; echoDy: number; echoWidth: number };
}

export const TWIN_MARK_RATIOS: Readonly<TwinMarkRatios> = {
  ringWidth: 0.04,
  ringWidthMinPx: 1.5,
  gap: 0.02,
  gapMinPx: 1,
  badgeRadius: 0.13,
  badgeMinPx: 10,
  glyphWidthPerBadgeRadius: 1.12,
  glyphStroke: 7,
  notchClearGaps: 2,
  badgeCutGaps: 1,
  initial: {
    small: 0.6,
    latin: 0.44,
    cjk: 0.42,
    weightSmall: 500,
    weightMid: { latin: 500, cjk: 400 },
    weightLarge: { latin: 400, cjk: 300 },
  },
  plain: { center: 0.5, outerRadius: 0.5 },
  withEcho: { center: 0.46, outerRadius: 0.4, echoDx: 0.07, echoDy: -0.02, echoWidth: 0.03 },
};

/**
 * The chevron of the AX mark (`frontend/public/brand/agentrix-logo.svg`),
 * bounding box x 36–108, y 26–94 in its own path units.
 */
export const TWIN_MARK_CHEVRON_PATH = "M36 94L72 26L108 94H92L72 57L52 94H36Z";
/** Width of the chevron path, in path units. */
export const TWIN_MARK_CHEVRON_WIDTH = 72;
/** Point of the chevron path that sits on the badge centre, in path units. */
export const TWIN_MARK_CHEVRON_CENTER = { x: 72, y: 61 } as const;
/** SVG viewBox that fits the chevron path exactly (its bounding box). */
export const TWIN_MARK_CHEVRON_VIEWBOX = "36 26 72 68";

/** Opacity of the echo ring, drawn in the same colour as the twin ring. */
export const TWIN_MARK_ECHO_OPACITY = 0.7;

/**
 * At or below this photo diameter (px) the initial is set bigger, at one
 * weight for every script: size, not boldness, carries a tiny avatar.
 */
const SMALL_PHOTO_AT_OR_BELOW = 24;

/**
 * From this photo diameter (px) on the initial is set a step lighter
 * (mark-spec §4). Above 24 px a CJK character is always a step lighter than a
 * Latin letter, so "澜" and "B" read equally heavy.
 */
const LARGE_PHOTO_AT_OR_ABOVE = 64;

export interface TwinMarkOptions {
  /** Draw the echo ring. Default `TWIN_MARK_ECHO_ENABLED`. Ignored at 32 px and below. */
  echo?: boolean;
}

export interface TwinMarkGeometry {
  /** The box: width = height = size, in px. 0 when the input is not a positive number. */
  size: number;
  /** Draw the echo ring (switched on and diameter > 32). */
  showEcho: boolean;
  /** Centre of the ring and photo on both axes, px. */
  center: number;
  /** The circle the photo or initial is cropped to; `left` / `top` are its box corner. */
  photo: { left: number; top: number; diameter: number };
  /** Fill a disc of this radius with `colors.gap` behind the photo: the white gap. */
  gapRadius: number;
  /**
   * Twin ring (mark-spec A1, the notched ring): an arc of `radius` (the centre
   * line of the stroke) and `width`, open around the badge. Stroke `path` with
   * round line caps and no fill. `start` / `end` are the arc's end points (the
   * centres of the round caps), clockwise from just past the badge round to
   * just before it; `notchHalfAngle` is half the opening in radians, seen from
   * the mark centre. `path` is "" when there is nothing to draw (size 0).
   */
  ring: {
    radius: number;
    width: number;
    path: string;
    notchHalfAngle: number;
    start: { x: number; y: number };
    end: { x: number; y: number };
  };
  /** Echo ring, same radius as the ring. Only meaningful when `showEcho`. */
  echo: { centerX: number; centerY: number; radius: number; width: number; opacity: number };
  /** Hide the echo inside this radius around `center`. Only meaningful when `showEcho`. */
  maskRadius: number;
  badge: {
    centerX: number;
    centerY: number;
    radius: number;
    /** The cut: a disc of this radius in the colour behind the mark, drawn just under the badge. */
    cutRadius: number;
    /** Draw the chevron; false below `TWIN_MARK_NO_GLYPH_BELOW`, where the badge is a plain dot. */
    showGlyph: boolean;
    glyph: {
      path: string;
      /** Place the path point (centerX, centerY) on the badge centre, then scale by `scale`. */
      centerX: number;
      centerY: number;
      /** px per path unit. */
      scale: number;
      /** Stroke added to the glyph in path units, same colour as the glyph; 0 = none. */
      strokeWidth: number;
    };
  };
  /**
   * Initial (first character) set inside the photo disc, for an owner without
   * a photo: `fontSize` / `fontWeight` for a Latin letter, `fontSizeCjk` /
   * `fontWeightCjk` for a CJK character. Pick with `twinMarkInitialFont`.
   */
  initial: { fontSize: number; fontSizeCjk: number; fontWeight: number; fontWeightCjk: number };
}

/** Numbers in an SVG path, to 0.001 px. */
const pathNumber = (n: number): string => String(Math.round(n * 1000) / 1000);

/**
 * Geometry of the twin mark for a given diameter in px. Pure: the same input
 * gives the same numbers on every surface. Widths scale linearly with the
 * diameter above the pixel floors (ring 1.5 px, gap 1 px).
 */
export function twinMarkGeometry(diameter: number, options?: TwinMarkOptions): TwinMarkGeometry {
  const size = Number.isFinite(diameter) && diameter > 0 ? diameter : 0;
  const wantEcho = options && options.echo !== undefined ? options.echo : TWIN_MARK_ECHO_ENABLED;
  const showEcho = wantEcho && size > TWIN_MARK_NO_ECHO_AT_OR_BELOW;
  const r = TWIN_MARK_RATIOS;
  const layout = showEcho ? r.withEcho : r.plain;

  const center = layout.center * size;
  const outerRadius = layout.outerRadius * size;
  // The floors never push a stroke past the box, so tiny sizes stay valid.
  const ringWidth = Math.min(Math.max(r.ringWidth * size, r.ringWidthMinPx), outerRadius);
  const ringRadius = outerRadius - ringWidth / 2;
  const gapRadius = outerRadius - ringWidth;
  const gap = Math.min(Math.max(r.gap * size, r.gapMinPx), gapRadius);
  const photoRadius = gapRadius - gap;
  const badgeCenter = center + ringRadius * Math.SQRT1_2;
  // The badge floor never pushes the badge past the box edge either.
  const badgeRadius = Math.min(Math.max(r.badgeRadius * size, r.badgeMinPx / 2), size - badgeCenter);

  // Notch: each round end of the arc sits `clear` away from the badge centre (a chord of the ring),
  // so the edge of its cap stops `notchClearGaps` gaps short of the badge edge.
  const clear = badgeRadius + r.notchClearGaps * gap + ringWidth / 2;
  const notchHalfAngle = ringRadius > 0 ? 2 * Math.asin(Math.min(1, clear / (2 * ringRadius))) : Math.PI;
  const startAngle = TWIN_MARK_BADGE_ANGLE + notchHalfAngle;
  const endAngle = TWIN_MARK_BADGE_ANGLE + 2 * Math.PI - notchHalfAngle;
  const span = endAngle - startAngle;
  const onRing = (angle: number) => ({ x: center + ringRadius * Math.cos(angle), y: center + ringRadius * Math.sin(angle) });
  const start = onRing(startAngle);
  const end = onRing(endAngle);
  const ringPath =
    ringRadius > 0 && span > 0
      ? `M${pathNumber(start.x)} ${pathNumber(start.y)}A${pathNumber(ringRadius)} ${pathNumber(ringRadius)} 0 ${span > Math.PI ? 1 : 0} 1 ${pathNumber(end.x)} ${pathNumber(end.y)}`
      : "";

  const photoDiameter = 2 * photoRadius;
  const smallPhoto = photoDiameter <= SMALL_PHOTO_AT_OR_BELOW;
  const weights = smallPhoto
    ? { latin: r.initial.weightSmall, cjk: r.initial.weightSmall }
    : photoDiameter >= LARGE_PHOTO_AT_OR_ABOVE
      ? r.initial.weightLarge
      : r.initial.weightMid;

  return {
    size,
    showEcho,
    center,
    photo: { left: center - photoRadius, top: center - photoRadius, diameter: photoDiameter },
    gapRadius,
    ring: { radius: ringRadius, width: ringWidth, path: ringPath, notchHalfAngle, start, end },
    echo: {
      centerX: center + r.withEcho.echoDx * size,
      centerY: center + r.withEcho.echoDy * size,
      radius: ringRadius,
      width: r.withEcho.echoWidth * size,
      opacity: TWIN_MARK_ECHO_OPACITY,
    },
    maskRadius: outerRadius + gap,
    badge: {
      centerX: badgeCenter,
      centerY: badgeCenter,
      radius: badgeRadius,
      cutRadius: badgeRadius + r.badgeCutGaps * gap,
      showGlyph: size >= TWIN_MARK_NO_GLYPH_BELOW,
      glyph: {
        path: TWIN_MARK_CHEVRON_PATH,
        centerX: TWIN_MARK_CHEVRON_CENTER.x,
        centerY: TWIN_MARK_CHEVRON_CENTER.y,
        scale: (badgeRadius * r.glyphWidthPerBadgeRadius) / TWIN_MARK_CHEVRON_WIDTH,
        strokeWidth: size <= TWIN_MARK_THICK_GLYPH_AT_OR_BELOW ? r.glyphStroke : 0,
      },
    },
    initial: {
      fontSize: photoDiameter * (smallPhoto ? r.initial.small : r.initial.latin),
      fontSizeCjk: photoDiameter * (smallPhoto ? r.initial.small : r.initial.cjk),
      fontWeight: weights.latin,
      fontWeightCjk: weights.cjk,
    },
  };
}

/** CJK ideographs, kana and hangul in the basic plane, plus the supplementary ideograph planes (surrogate pairs). */
const CJK_CHARACTER = /[\u2E80-\u9FFF\uAC00-\uD7AF\uF900-\uFAFF]|[\uD840-\uD887][\uDC00-\uDFFF]/;

/**
 * Font size and weight for the text shown in the initial disc (the name's
 * first character, or the no-name fallback): above 24 px a CJK character is
 * set a step smaller and a step lighter than a Latin letter, so both read the
 * same size and weight (mark-spec §4).
 */
export function twinMarkInitialFont(geometry: TwinMarkGeometry, text: string): { fontSize: number; fontWeight: number } {
  const cjk = CJK_CHARACTER.test(text);
  return {
    fontSize: cjk ? geometry.initial.fontSizeCjk : geometry.initial.fontSize,
    fontWeight: cjk ? geometry.initial.fontWeightCjk : geometry.initial.fontWeight,
  };
}

/** Default size (px) of the "AI 分身" / "AI twin" label words next to the mark. */
export const TWIN_LABEL_FONT_SIZE = 12;

/** The label's chevron and spacing, ratios of the label font size (mark-spec §4). */
export const TWIN_LABEL_RATIOS = { gap: 0.32, chevronWidth: 0.62, chevronHeight: 0.58, fontWeight: 600 } as const;

export interface TwinLabelGeometry {
  fontSize: number;
  fontWeight: number;
  /** Space between the chevron and the words, px. */
  gap: number;
  /** The AX chevron before the words: draw `path` in an SVG of `width` x `height` with `viewBox`. */
  chevron: { width: number; height: number; viewBox: string; path: string };
}

/**
 * The "AI 分身" / "AI twin" label that sits next to every twin mark (mark-spec
 * §4): the AX chevron and the words, both in `colors.label`. No pill, no fill,
 * no outline. The words themselves come from each surface's i18n, one
 * language at a time.
 */
export function twinLabelGeometry(fontSize?: number): TwinLabelGeometry {
  const size = fontSize !== undefined && Number.isFinite(fontSize) && fontSize > 0 ? fontSize : TWIN_LABEL_FONT_SIZE;
  const l = TWIN_LABEL_RATIOS;
  return {
    fontSize: size,
    fontWeight: l.fontWeight,
    gap: l.gap * size,
    chevron: { width: l.chevronWidth * size, height: l.chevronHeight * size, viewBox: TWIN_MARK_CHEVRON_VIEWBOX, path: TWIN_MARK_CHEVRON_PATH },
  };
}

/** Which existing palette token each part of the mark uses. No new colours. */
export const TWIN_MARK_COLOR_TOKENS = {
  /** Twin ring: the primary accent (sky blue by default, `--ax-accent`). */
  ring: "accent",
  /** Echo ring: the same accent at `TWIN_MARK_ECHO_OPACITY`. */
  echo: "accent",
  /** White gap between avatar and ring. Pass the real colour behind the mark if it is not the surface. */
  gap: "surface",
  /** Flat badge disc. */
  badge: "accent",
  /** Chevron on the badge. */
  badgeGlyph: "onAccent",
  /**
   * Disc and letter of the initial when the owner has no photo: the neutral
   * grey and the body text (mark-spec §3). The person takes no accent, so the
   * ring and the badge stay the only accent on screen.
   */
  initialBackground: "surface2",
  initialText: "text",
  /**
   * The label's words and chevron: the accent's text shade, which keeps 4.5:1
   * on `bg`, `surface` and `surface2` in every accent (TEXT_CONTRAST_PAIRS).
   */
  label: "accentText",
} as const;

export type TwinMarkColorRole = keyof typeof TWIN_MARK_COLOR_TOKENS;
export type TwinMarkPaletteToken = (typeof TWIN_MARK_COLOR_TOKENS)[TwinMarkColorRole];
export type TwinMarkColors = Record<TwinMarkColorRole, string>;

/** Resolved colours for a palette (Mobile: `resolvePalette(scheme, accent)`). */
export function twinMarkColors(palette: Pick<Palette, TwinMarkPaletteToken>): TwinMarkColors {
  return {
    ring: palette[TWIN_MARK_COLOR_TOKENS.ring],
    echo: palette[TWIN_MARK_COLOR_TOKENS.echo],
    gap: palette[TWIN_MARK_COLOR_TOKENS.gap],
    badge: palette[TWIN_MARK_COLOR_TOKENS.badge],
    badgeGlyph: palette[TWIN_MARK_COLOR_TOKENS.badgeGlyph],
    initialBackground: palette[TWIN_MARK_COLOR_TOKENS.initialBackground],
    initialText: palette[TWIN_MARK_COLOR_TOKENS.initialText],
    label: palette[TWIN_MARK_COLOR_TOKENS.label],
  };
}

/** The same colours as `var(--ax-*)` references (Web and Desktop), so a theme or accent change needs no JS. */
export function twinMarkCssColors(): TwinMarkColors {
  const css = (token: TwinMarkPaletteToken) => `var(${CSS_VAR_NAMES[token]})`;
  return {
    ring: css(TWIN_MARK_COLOR_TOKENS.ring),
    echo: css(TWIN_MARK_COLOR_TOKENS.echo),
    gap: css(TWIN_MARK_COLOR_TOKENS.gap),
    badge: css(TWIN_MARK_COLOR_TOKENS.badge),
    badgeGlyph: css(TWIN_MARK_COLOR_TOKENS.badgeGlyph),
    initialBackground: css(TWIN_MARK_COLOR_TOKENS.initialBackground),
    initialText: css(TWIN_MARK_COLOR_TOKENS.initialText),
    label: css(TWIN_MARK_COLOR_TOKENS.label),
  };
}
