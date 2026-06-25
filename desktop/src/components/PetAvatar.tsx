/**
 * PetAvatar — embedded pet head used in the ChatPanel title bar.
 *
 * Sprint P-1 (2026-05-21) — replaces the old `<FloatingBall />` that
 *   was awkwardly stuffed into the ChatTitleBar. P-1 used a static
 *   idle sprite as placeholder.
 *
 * Sprint P-2 (2026-05-21) — now subscribes to the unified `PetMode` bus
 *   so the title-bar pet animates the same activity the desktop pet
 *   does (thinking when the AI is generating, typing when streaming
 *   long output, done after a turn completes, alert on approval modal,
 *   cu-mouse during Computer Use). When `mode` prop is passed, that
 *   wins over the bus — useful for previews / Storybook.
 *
 * Click / drag / right-click are NOT handled here — that workflow has
 * moved to the PetCompanionWindow. The avatar is purely visual.
 */
import { useEffect, useState, type CSSProperties } from "react";
import PetSpriteCanvas, { spriteAssetsAvailable, type PetAction } from "./PetSpriteCanvas";
import PetCanvas from "./PetCanvas";
import { getPetMode, subscribePetMode, PET_MODE_TO_SPRITE, type PetMode } from "../services/petMode";

interface Props {
  /**
   * Optional explicit mode override. When omitted (the common case)
   * PetAvatar reads the live mode from the petMode bus.
   */
  mode?: PetMode;
  size?: number;
  style?: CSSProperties;
  /** Show a glow / aura behind the head. Off in dense title bars. */
  glow?: boolean;
}

/**
 * For the in-window 48–64 px avatar slot, some sprites read better than
 * others. This map lets us deviate from the default mode→sprite mapping
 * in cases where the global mapping uses a sprite that's optimized for
 * the 160 px desktop pet (e.g. `cu-mouse` is full body — too small at
 * 48 px to be readable). The avatar is allowed to fall back to a
 * cousin sprite that pictures the same activity at the head level.
 */
const AVATAR_OVERRIDES: Partial<Record<PetMode, PetAction>> = {
  // Computer Use: full-body "握鼠标" reads as a blob at 48 px;
  // typing sprite (前爪在键盘上) carries the same "我在帮你操作" vibe
  // and is head-centric so it reads at small sizes.
  "computer-use": "pro-typing",
  // Sleep at 48 px is hard to recognize — fall back to idle so the
  // user still sees their pet face. Desktop pet still plays the real
  // sleep sprite.
  "sleep": "idle",
};

function modeToSprite(mode: PetMode): PetAction {
  return AVATAR_OVERRIDES[mode] ?? PET_MODE_TO_SPRITE[mode];
}

export default function PetAvatar({ mode: modeProp, size = 48, style, glow = false }: Props) {
  const [spritesAvailable, setSpritesAvailable] = useState<boolean | null>(null);
  const [busMode, setBusMode] = useState<PetMode>(() => getPetMode());
  // Sprint P-7 phase 2 (2026-05-22): flying-in transition. When Pro Mode
  // opens, the title-bar avatar appears to "fly in" from the bottom-
  // right corner where the desktop pet companion lives. A 480 ms CSS
  // transform from `translate(120%, 80%) scale(0.4)` → identity. The
  // class is applied for a single render then removed.
  const [flyingIn, setFlyingIn] = useState(false);
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail as { mode?: string } | undefined;
      if (detail?.mode === "pro-mode") {
        setFlyingIn(true);
        const t = window.setTimeout(() => setFlyingIn(false), 520);
        return () => window.clearTimeout(t);
      }
    };
    window.addEventListener("agentrix:app-mode-changed", handler);
    return () => window.removeEventListener("agentrix:app-mode-changed", handler);
  }, []);

  // Probe sprite availability once.
  useEffect(() => {
    let cancelled = false;
    void spriteAssetsAvailable().then((available) => {
      if (!cancelled) setSpritesAvailable(available);
    });
    return () => { cancelled = true; };
  }, []);

  // Subscribe to mode bus when no explicit prop given.
  useEffect(() => {
    if (modeProp !== undefined) return;
    return subscribePetMode((m) => setBusMode(m));
  }, [modeProp]);

  const effectiveMode = modeProp ?? busMode;
  const action = modeToSprite(effectiveMode);

  // Sprint P-3 (2026-05-21): tiny opacity dip on mode change so the
  // sprite swap feels like a deliberate transition rather than a hard
  // texture pop. Uses CSS transition + a key-driven mount so React
  // remounts the canvas when the mode changes (clean reset of the
  // PetSpriteCanvas RAF timer).
  const containerStyle: CSSProperties = {
    width: size,
    height: size,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: "50%",
    background: glow
      ? "radial-gradient(circle at 50% 45%, rgba(167,139,250,0.30), transparent 70%)"
      : "transparent",
    transition: "opacity 180ms ease, transform 480ms cubic-bezier(0.34, 1.56, 0.64, 1)",
    transform: flyingIn ? "translate(120%, 80%) scale(0.4) rotate(-12deg)" : "translate(0,0) scale(1) rotate(0)",
    opacity: flyingIn ? 0.2 : 1,
    ...style,
  };

  // Sprite available → use the multi-frame canvas. Key-by-action so
  // React remounts the inner canvas on mode change → clean RAF reset.
  if (spritesAvailable) {
    return (
      <div style={containerStyle} title="Living Pet" data-pet-mode={effectiveMode}>
        <PetSpriteCanvas key={action} action={action} size={size} facing="right" />
      </div>
    );
  }

  // Fallback: static PNG via PetCanvas (P-1 default while we wait for
  // sprite probing or while assets are missing).
  return (
    <div style={containerStyle} title="Living Pet" data-pet-mode={effectiveMode}>
      <PetCanvas size={size} noHalo showLevelBadge={false} />
    </div>
  );
}
