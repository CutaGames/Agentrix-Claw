/**
 * TwinAvatar — the twin mark on the phone (brand-yowo-v1 §3, E131 direction A,
 * mark-spec A1): the owner's own photo (or the first character of the name)
 * inside a thin twin ring with a gap; the ring is open at the lower right, where
 * a small flat AX badge sits, with a cut in the background colour around it.
 *
 * Use it only where the AI twin is shown. The owner's own avatar gets no ring.
 * Put the "AI 分身" / "AI twin" label next to it (`label`, or `TwinLabel`, or
 * text already on the screen).
 *
 * Every size, width and position comes from `shared/design-tokens/twin-mark.ts`
 * (through `src/utils/twinAvatar.ts`, the pure part with the jest tests), and
 * every colour from the same file's palette mapping. Nothing here hard-codes a
 * number or a colour of the mark, so Web, Mobile and Desktop stay identical.
 *
 * Drawn with react-native-svg (already a dependency): ring, gap and badge are SVG
 * layers, the photo or initial sits between them.
 *
 * Accessibility: one accessible name, "<name>的 AI 分身" / "<name>'s AI twin"
 * (the real name). The ring, the gap and the badge are decorative and hidden
 * from screen readers.
 *
 * A photo that fails to load (Image onError) falls back to the initial.
 */
import React, { useId, useMemo, useState } from 'react';
import { Image, StyleSheet, Text, View, type StyleProp, type TextStyle, type ViewStyle } from 'react-native';
import Svg, { Circle, Defs, Mask, Path, Rect } from 'react-native-svg';
import { twinLabelGeometry, type ColorScheme } from '../../shared/design-tokens';
import { useI18n } from '../stores/i18nStore';
import { useAppearance, useThemeMode } from '../theme/useTheme';
import {
  twinAvatarAccessibleName,
  twinAvatarColors,
  twinAvatarGlyph,
  twinAvatarInitial,
  twinAvatarInitialFont,
  twinAvatarLayout,
  twinAvatarPhotoUrl,
} from '../utils/twinAvatar';

/** Label chevron and spacing from the shared spec (mark-spec §4). */
const LABEL = twinLabelGeometry();

/** Colours of the mark for the current accent, on the given scheme or the app's current one. */
function useTwinMarkColors(scheme?: ColorScheme) {
  const mode = useThemeMode();
  const [appearance] = useAppearance();
  const resolved: ColorScheme = scheme ?? mode;
  const accent = appearance.accent;
  return useMemo(() => twinAvatarColors(resolved, accent), [resolved, accent]);
}

export interface TwinAvatarProps {
  /** The owner's real display name: used for the accessible name and the initial. */
  name?: string | null;
  /** The owner's photo. Missing, empty or failing to load: the initial is shown. */
  photoUrl?: string | null;
  /** Box edge in px (width = height). */
  size?: number;
  /** Show the visible "AI 分身" / "AI twin" label next to the mark. */
  label?: boolean;
  /**
   * Colour scheme of the mark. Default: the app's current scheme. Pass 'dark' on a
   * screen that is always dark (the QR screen, the share poster).
   */
  scheme?: ColorScheme;
  /**
   * The colour behind the mark, painted as the gap and the cut around the badge.
   * Default: the scheme's surface colour. Pass the real background colour on a
   * coloured screen, or 'transparent' on a gradient (no gap colour, no cut).
   */
  background?: string;
  /** Draw the echo ring. Default follows the shared spec (off); never drawn at 32 px and below. */
  echo?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

/**
 * The "AI 分身" / "AI twin" label that sits next to a twin avatar (mark-spec §4):
 * the AX chevron and the words in the label colour, no pill. The chevron is decorative.
 */
export function TwinLabel({ scheme }: { scheme?: ColorScheme }) {
  const { t } = useI18n();
  const colors = useTwinMarkColors(scheme);
  return (
    <View style={[styles.label, { gap: LABEL.gap }]} testID="twin-label">
      <Svg
        width={LABEL.chevron.width}
        height={LABEL.chevron.height}
        viewBox={LABEL.chevron.viewBox}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        <Path d={LABEL.chevron.path} fill={colors.label} />
      </Svg>
      <Text
        style={{ color: colors.label, fontSize: LABEL.fontSize, fontWeight: String(LABEL.fontWeight) as TextStyle['fontWeight'] }}
        allowFontScaling={false}
      >
        {t({ zh: 'AI 分身', en: 'AI twin' })}
      </Text>
    </View>
  );
}

export function TwinAvatar({
  name,
  photoUrl,
  size = 40,
  label = false,
  scheme,
  background,
  echo,
  style,
  testID = 'twin-avatar',
}: TwinAvatarProps) {
  const { language } = useI18n();
  const lang = language === 'zh' ? 'zh' : 'en';
  const colors = useTwinMarkColors(scheme);
  // The id must stay plain inside url(#...).
  const maskId = `twin-avatar-echo-${useId().replace(/[^A-Za-z0-9_-]/g, '')}`;
  const [failedUrl, setFailedUrl] = useState<string | null>(null);

  const layout = twinAvatarLayout(size, echo);
  if (layout.size <= 0) return null;
  const g = layout.geometry;
  const glyph = twinAvatarGlyph(g);
  const url = twinAvatarPhotoUrl(photoUrl, failedUrl);
  // The gap and the badge cut take the colour behind the mark; on a see-through background there is nothing to paint.
  const gapColor = background ?? colors.gap;
  const initialText = twinAvatarInitial(name, lang);
  const initialFont = twinAvatarInitialFont(g, initialText);

  const disc = {
    left: g.photo.left,
    top: g.photo.top,
    width: g.photo.diameter,
    height: g.photo.diameter,
    borderRadius: g.photo.diameter / 2,
    backgroundColor: colors.initialBackground,
  };

  const mark = (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={twinAvatarAccessibleName(name, lang)}
      testID={testID}
      style={[{ width: g.size, height: g.size }, label ? null : style]}
    >
      {/* Behind the avatar: echo ring (only when drawn), the gap, the twin ring. Decorative. */}
      <Svg
        width={g.size}
        height={g.size}
        viewBox={`0 0 ${g.size} ${g.size}`}
        style={styles.layer}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        {layout.showEcho ? (
          <>
            <Defs>
              <Mask id={maskId} maskUnits="userSpaceOnUse" x={-g.size} y={-g.size} width={g.size * 3} height={g.size * 3}>
                <Rect x={-g.size} y={-g.size} width={g.size * 3} height={g.size * 3} fill="white" />
                <Circle cx={g.center} cy={g.center} r={g.maskRadius} fill="black" />
              </Mask>
            </Defs>
            <Circle
              cx={g.echo.centerX}
              cy={g.echo.centerY}
              r={g.echo.radius}
              fill="none"
              stroke={colors.echo}
              strokeWidth={g.echo.width}
              strokeOpacity={g.echo.opacity}
              mask={`url(#${maskId})`}
            />
          </>
        ) : null}
        {gapColor !== 'transparent' ? <Circle cx={g.center} cy={g.center} r={g.gapRadius} fill={gapColor} /> : null}
        {/* The notched ring: one arc with round ends, open where the badge sits. */}
        {g.ring.path ? (
          <Path d={g.ring.path} fill="none" stroke={colors.ring} strokeWidth={g.ring.width} strokeLinecap="round" />
        ) : null}
      </Svg>
      {url ? (
        <Image
          source={{ uri: url }}
          accessible={false}
          resizeMode="cover"
          onError={() => setFailedUrl(url)}
          style={[styles.disc, disc]}
        />
      ) : (
        <View style={[styles.disc, styles.initialDisc, disc]}>
          <Text
            allowFontScaling={false}
            style={[
              styles.initial,
              // Size and weight come straight from the shared spec (CJK a step smaller), never a local mapping.
              { color: colors.initialText, fontSize: initialFont.fontSize, fontWeight: initialFont.fontWeight as TextStyle['fontWeight'] },
            ]}
          >
            {initialText}
          </Text>
        </View>
      )}
      {/* In front of the avatar: the cut in the background colour, the flat badge, the AX chevron (not on a tiny dot). Decorative. */}
      <Svg
        width={g.size}
        height={g.size}
        viewBox={`0 0 ${g.size} ${g.size}`}
        style={styles.layer}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        {gapColor !== 'transparent' ? (
          <Circle cx={g.badge.centerX} cy={g.badge.centerY} r={g.badge.cutRadius} fill={gapColor} />
        ) : null}
        <Circle cx={g.badge.centerX} cy={g.badge.centerY} r={g.badge.radius} fill={colors.badge} />
        {g.badge.showGlyph && glyph.d ? (
          <Path
            d={glyph.d}
            fill={colors.badgeGlyph}
            stroke={glyph.strokeWidth > 0 ? colors.badgeGlyph : 'none'}
            strokeWidth={glyph.strokeWidth}
            strokeLinejoin="round"
          />
        ) : null}
      </Svg>
    </View>
  );

  if (!label) return mark;
  return (
    <View style={[styles.row, style]}>
      {mark}
      <TwinLabel scheme={scheme} />
    </View>
  );
}

const styles = StyleSheet.create({
  layer: { position: 'absolute', left: 0, top: 0 },
  disc: { position: 'absolute', overflow: 'hidden' },
  initialDisc: { alignItems: 'center', justifyContent: 'center' },
  initial: { includeFontPadding: false, textAlign: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  label: { flexDirection: 'row', alignItems: 'center', alignSelf: 'center' },
});
