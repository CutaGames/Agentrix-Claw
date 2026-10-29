/**
 * TwinAvatar (desktop): the twin mark (brand-yowo-v1 section 3, E131 direction A, L8-7,
 * mark-spec A1). The owner's own photo (or the first character of the name) inside a
 * thin sky-blue twin ring with a white gap; the ring is open at the lower right, where a
 * small flat AX badge sits, with a cut in the background colour around it.
 *
 * Same props and behaviour as the web `TwinAvatar`
 * (`frontend/components/digital-twin/TwinAvatar.tsx`) and the mobile one.
 *
 * Use it only where the AI twin is shown. The owner's own avatar gets no ring.
 * Put the "AI 分身" / "AI twin" label next to it (`label`, or `TwinLabel`, or text
 * already on the page).
 *
 * Every size, width and position comes from `shared/design-tokens/twin-mark.ts`
 * (`twinMarkGeometry`), every colour from the same file as `var(--ax-*)`. Nothing
 * here hard-codes a mark number or a colour, so Web, Mobile and Desktop stay
 * identical. The desktop loads `tokens.css` in `main.tsx`, so a theme or accent
 * change needs no JS.
 *
 * Accessibility: the avatar has one accessible name, "<name>的 AI 分身" /
 * "<name>'s AI twin" (the real name field), on the photo's `alt` or on the initial
 * disc. The ring, the white gap and the badge are decorative SVG (`aria-hidden`).
 *
 * A photo that fails to load falls back to the initial: no broken image, no blank.
 * That includes a photo the app's content security policy blocks (`img-src` only
 * lists the Agentrix hosts), because a blocked image fires the same `error` event.
 *
 * The words come from the existing inline zh/en picker (`i18n/pick.ts`): one
 * language at a time, English for every language other than Chinese.
 */
import { useId, useState, type CSSProperties } from "react";
import { twinLabelGeometry, twinMarkCssColors, twinMarkGeometry, twinMarkInitialFont } from "../../../shared/design-tokens/index.ts";
import { useI18n } from "../i18n/I18nProvider";
import { pickFor } from "../i18n/pick";

// var(--ax-*) references: a theme or accent change needs no JS.
const COLORS = twinMarkCssColors();

export interface TwinAvatarProps {
  /** The owner's real display name: used for the alt text and the initial. */
  name?: string | null;
  /** The owner's photo. Missing, empty or failing to load: the initial is shown. */
  photoUrl?: string | null;
  /** Box edge in px (width = height). */
  size?: number;
  /** Show the visible "AI 分身" / "AI twin" label next to the mark. */
  label?: boolean;
  /**
   * The colour behind the mark, painted as the white gap and the cut around the badge.
   * Default: the surface token. "transparent" on a gradient: no gap colour, no cut.
   */
  background?: string;
  /** Draw the echo ring. Default follows the shared spec (off); never drawn at 32 px and below. */
  echo?: boolean;
  className?: string;
  "data-testid"?: string;
}

/** First character of the name (code point aware, Latin upper-cased); empty when there is no name. */
export function twinAvatarInitial(name: string | null | undefined): string {
  const first = Array.from((name ?? "").trim())[0];
  return first ? first.toUpperCase() : "";
}

// Label chevron and spacing from the shared spec (mark-spec section 4): no pill, no fill.
const LABEL = twinLabelGeometry();
const LABEL_STYLE: CSSProperties = {
  display: "inline-flex",
  flexShrink: 0,
  alignItems: "center",
  gap: LABEL.gap,
  color: COLORS.label,
  fontSize: LABEL.fontSize,
  fontWeight: LABEL.fontWeight,
  lineHeight: 1,
  whiteSpace: "nowrap",
};

/**
 * The "AI 分身" / "AI twin" label that sits next to a twin avatar: the AX chevron and
 * the words in the label colour, no pill. The chevron is decorative.
 */
export function TwinLabel({ className }: { className?: string }) {
  const { locale } = useI18n();
  return (
    <span data-twin-label="" className={className} style={LABEL_STYLE}>
      <svg
        data-twin-label-chevron=""
        aria-hidden="true"
        focusable="false"
        width={LABEL.chevron.width}
        height={LABEL.chevron.height}
        viewBox={LABEL.chevron.viewBox}
        style={{ display: "block", flexShrink: 0 }}
      >
        <path d={LABEL.chevron.path} style={{ fill: COLORS.label }} />
      </svg>
      {pickFor(locale)("AI 分身", "AI twin")}
    </span>
  );
}

const LAYER: CSSProperties = { position: "absolute", left: 0, top: 0, overflow: "visible" };

export default function TwinAvatar({
  name,
  photoUrl,
  size = 40,
  label = false,
  background,
  echo,
  className,
  "data-testid": testId = "twin-avatar",
}: TwinAvatarProps) {
  const { locale } = useI18n();
  const p = pickFor(locale);
  // `useId` has colons; keep the id safe inside url(#...).
  const maskId = `twin-avatar-echo-${useId().replace(/:/g, "")}`;
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const g = twinMarkGeometry(size, echo === undefined ? undefined : { echo });
  if (g.size <= 0) return null;

  const realName = (name ?? "").trim();
  const alt = realName ? p(`${realName}的 AI 分身`, `${realName}'s AI twin`) : p("AI 分身", "AI twin");
  const url = (photoUrl ?? "").trim();
  // A different URL gets a fresh try; the same URL that failed stays on the initial.
  const showPhoto = url !== "" && failedUrl !== url;
  const initialText = twinAvatarInitial(realName) || p("分", "AI");
  const initialFont = twinMarkInitialFont(g, initialText);
  // The gap and the badge cut take the colour behind the mark; on a see-through background there is nothing to paint.
  const behind = background ?? COLORS.gap;
  const disc: CSSProperties = {
    position: "absolute",
    left: g.photo.left,
    top: g.photo.top,
    width: g.photo.diameter,
    height: g.photo.diameter,
    borderRadius: "50%",
    background: COLORS.initialBackground,
  };
  const { badge } = g;

  const mark = (
    <span
      data-twin-avatar=""
      data-twin-kind={showPhoto ? "photo" : "initial"}
      data-testid={testId}
      className={label ? undefined : className}
      style={{ position: "relative", display: "inline-block", flexShrink: 0, width: g.size, height: g.size }}
    >
      {/* Behind the avatar: echo ring (only when drawn), white gap, twin ring. */}
      <svg aria-hidden="true" focusable="false" width={g.size} height={g.size} viewBox={`0 0 ${g.size} ${g.size}`} style={LAYER}>
        {g.showEcho ? (
          <>
            <defs>
              <mask id={maskId} maskUnits="userSpaceOnUse" x={-g.size} y={-g.size} width={g.size * 3} height={g.size * 3}>
                <rect x={-g.size} y={-g.size} width={g.size * 3} height={g.size * 3} fill="white" />
                <circle cx={g.center} cy={g.center} r={g.maskRadius} fill="black" />
              </mask>
            </defs>
            <circle
              data-twin-part="echo"
              cx={g.echo.centerX}
              cy={g.echo.centerY}
              r={g.echo.radius}
              fill="none"
              strokeWidth={g.echo.width}
              strokeOpacity={g.echo.opacity}
              style={{ stroke: COLORS.echo }}
              mask={`url(#${maskId})`}
            />
          </>
        ) : null}
        <circle data-twin-part="gap" cx={g.center} cy={g.center} r={g.gapRadius} style={{ fill: behind }} />
        {/* The notched ring: one arc with round ends, open where the badge sits. */}
        <path
          data-twin-part="ring"
          d={g.ring.path}
          fill="none"
          strokeWidth={g.ring.width}
          strokeLinecap="round"
          style={{ stroke: COLORS.ring }}
        />
      </svg>
      {showPhoto ? (
        <img
          data-twin-part="photo"
          src={url}
          alt={alt}
          width={g.photo.diameter}
          height={g.photo.diameter}
          draggable={false}
          decoding="async"
          onError={() => setFailedUrl(url)}
          style={{ ...disc, display: "block", objectFit: "cover" }}
        />
      ) : (
        <span
          data-twin-part="initial"
          role="img"
          aria-label={alt}
          style={{
            ...disc,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            overflow: "hidden",
            color: COLORS.initialText,
            fontSize: initialFont.fontSize,
            fontWeight: initialFont.fontWeight,
            lineHeight: 1,
            userSelect: "none",
          }}
        >
          <span aria-hidden="true">{initialText}</span>
        </span>
      )}
      {/* In front of the avatar: the cut in the background colour, the flat badge, the AX chevron (not on a tiny dot). */}
      <svg aria-hidden="true" focusable="false" width={g.size} height={g.size} viewBox={`0 0 ${g.size} ${g.size}`} style={LAYER}>
        {behind !== "transparent" ? (
          <circle data-twin-part="badge-cut" cx={badge.centerX} cy={badge.centerY} r={badge.cutRadius} style={{ fill: behind }} />
        ) : null}
        <circle data-twin-part="badge" cx={badge.centerX} cy={badge.centerY} r={badge.radius} style={{ fill: COLORS.badge }} />
        {badge.showGlyph ? (
          <g
            data-twin-part="badge-glyph"
            transform={`translate(${badge.centerX} ${badge.centerY}) scale(${badge.glyph.scale}) translate(${-badge.glyph.centerX} ${-badge.glyph.centerY})`}
          >
            <path
              d={badge.glyph.path}
              strokeWidth={badge.glyph.strokeWidth}
              strokeLinejoin="round"
              style={{ fill: COLORS.badgeGlyph, stroke: badge.glyph.strokeWidth > 0 ? COLORS.badgeGlyph : "none" }}
            />
          </g>
        ) : null}
      </svg>
    </span>
  );

  if (!label) return mark;
  return (
    <span className={className} style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
      {mark}
      <TwinLabel />
    </span>
  );
}
