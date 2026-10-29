/**
 * twinAvatar — the pure part of the mobile twin mark (brand-yowo-v1 §3, E131 direction A).
 *
 * `src/components/TwinAvatar.tsx` draws the mark; everything that can be decided
 * without React Native lives here so the root jest can test it (mobile jest does
 * not render RN components). Every size, width, position and colour comes from
 * `shared/design-tokens/twin-mark.ts`; nothing in this file hard-codes a number
 * or a colour of the mark.
 *
 * Pure: no react-native import.
 */
import {
  resolvePalette,
  twinMarkColors,
  twinMarkGeometry,
  twinMarkInitialFont,
  type AccentId,
  type ColorScheme,
  type TwinMarkColors,
  type TwinMarkGeometry,
} from '../../shared/design-tokens';

export type TwinAvatarLang = 'zh' | 'en';

/** Who the twin belongs to: the owner's real name and, when there is one, the owner's photo. */
export interface TwinAvatarIdentity {
  name?: string | null;
  photoUrl?: string | null;
}

export interface TwinAvatarLayout {
  /** Box edge in px (width = height). 0 when the input is not a positive number: draw nothing. */
  size: number;
  /** Draw the echo ring. Off by default (shared spec) and never at 32 px and below. */
  showEcho: boolean;
  geometry: TwinMarkGeometry;
}

/**
 * Size and echo-ring decision for one avatar. `echo` undefined follows the
 * shared spec default (off); passing `true` still draws nothing at 32 px and below.
 */
export function twinAvatarLayout(size: number, echo?: boolean): TwinAvatarLayout {
  const geometry = twinMarkGeometry(size, echo === undefined ? undefined : { echo });
  return { size: geometry.size, showEcho: geometry.showEcho, geometry };
}

/** First character of the name (code point aware, Latin upper-cased); the fallback text when there is no name. */
export function twinAvatarInitial(name: string | null | undefined, lang: TwinAvatarLang): string {
  const first = Array.from((name ?? '').trim())[0];
  if (first) return first.toUpperCase();
  return lang === 'zh' ? '分' : 'AI';
}

/**
 * Font for the text in the initial disc, from the shared spec: above 24 px a CJK character
 * is a step smaller and a step lighter than a Latin letter, and the weight steps down at
 * 64 px (mark-spec §4). The weight is a string, as RN takes it.
 */
export function twinAvatarInitialFont(geometry: TwinMarkGeometry, text: string): { fontSize: number; fontWeight: string } {
  const font = twinMarkInitialFont(geometry, text);
  return { fontSize: font.fontSize, fontWeight: String(font.fontWeight) };
}

/** The one accessible name of the avatar: "阿澜的 AI 分身" / "Lan's AI twin"; without a name just "AI 分身" / "AI twin". */
export function twinAvatarAccessibleName(name: string | null | undefined, lang: TwinAvatarLang): string {
  const real = (name ?? '').trim();
  if (!real) return lang === 'zh' ? 'AI 分身' : 'AI twin';
  return lang === 'zh' ? `${real}的 AI 分身` : `${real}'s AI twin`;
}

/**
 * The photo address to try, or null to show the initial. A missing or empty
 * address, or the one address that already failed to load, gives null; a new
 * address gets a fresh try.
 */
export function twinAvatarPhotoUrl(photoUrl: string | null | undefined, failedUrl: string | null | undefined): string | null {
  const url = (photoUrl ?? '').trim();
  if (url === '' || url === failedUrl) return null;
  return url;
}

/** Resolved hex colours of the mark for a colour scheme and accent (existing palette tokens only). */
export function twinAvatarColors(scheme: ColorScheme, accent: AccentId): TwinMarkColors {
  return twinMarkColors(resolvePalette(scheme, accent));
}

const round3 = (n: number): number => Math.round(n * 1000) / 1000;

/**
 * The badge chevron placed and scaled onto the badge, as a plain SVG path in
 * avatar px, so the component needs no SVG transform. Handles the absolute
 * M / L / H / V / Z commands the AX chevron path uses; a path with any other
 * command is returned as an empty string rather than drawn wrong.
 */
export function twinAvatarGlyph(geometry: TwinMarkGeometry): { d: string; strokeWidth: number } {
  const { badge } = geometry;
  const { glyph } = badge;
  const s = glyph.scale;
  const x = (v: number) => round3(badge.centerX + (v - glyph.centerX) * s);
  const y = (v: number) => round3(badge.centerY + (v - glyph.centerY) * s);
  const strokeWidth = round3(glyph.strokeWidth * s);

  if (/[^MLHVZ\d\s.,-]/.test(glyph.path)) return { d: '', strokeWidth };
  const parts: string[] = [];
  const re = /([MLHVZ])([^MLHVZ]*)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(glyph.path)) !== null) {
    const cmd = m[1];
    const nums = (m[2].match(/-?\d*\.?\d+/g) || []).map(Number);
    if (cmd === 'Z') parts.push('Z');
    else if (cmd === 'H') parts.push(`H${x(nums[0])}`);
    else if (cmd === 'V') parts.push(`V${y(nums[0])}`);
    else parts.push(`${cmd}${x(nums[0])} ${y(nums[1])}`);
  }
  return { d: parts.join(''), strokeWidth };
}
