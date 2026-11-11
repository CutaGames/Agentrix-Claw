/**
 * PetSpriteCanvas — Phase B multi-frame sprite animation renderer.
 *
 * Renders a pet from a sprite sheet (horizontal strip of N frames) and
 * cycles through them at the requested FPS. Falls back gracefully to
 * the single-frame PetCanvas if the sprite sheet asset is missing.
 *
 * Sprite sheet contract:
 *   - Single PNG with N frames laid out horizontally
 *   - All frames same width/height
 *   - Transparent background (PNG with alpha)
 *
 * Asset discovery (in order of preference):
 *   /pets/sprites/<clan>/<action>.png   — clan-specific sheet
 *   /pets/sprites/default/<action>.png  — default fallback
 *   PetCanvas single-frame                — final fallback (no sprite)
 *
 * Action set:
 *   walk    — 6 frames, 8 fps
 *   idle    — 4 frames, 4 fps (subtle breathing/blink loop)
 *   sleep   — 2 frames, 1 fps (chest rise/fall)
 *   sit     — 1 frame static (with optional 2-frame ear flick at 0.5 fps)
 *   jump    — 4 frames played once (squat → leap → peak → land)
 *   eat     — 4 frames, 6 fps (chew loop)
 */
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { buildVariantCandidates, usePetVariant } from "../services/petVariant";

export type PetAction =
  | "walk"
  | "idle"
  | "sleep"
  | "sit"
  | "jump"
  | "eat"
  // Sprint P-2 (2026-05-21) — form sprites driven by `PetMode` state.
  // See `docs/PET_FORMS_DESIGN_v5.zh-CN.md` for the full mode taxonomy.
  | "listen"
  | "talk"
  | "pro-thinking"
  | "pro-typing"
  | "pro-done"
  | "cu-mouse"
  | "alert";

interface SpriteSpec {
  frames: number;
  fps: number;
  loop: boolean;
}

const SPRITE_SPECS: Record<PetAction, SpriteSpec> = {
  walk:           { frames: 6, fps: 8,  loop: true  },
  idle:           { frames: 4, fps: 4,  loop: true  },
  sleep:          { frames: 2, fps: 1,  loop: true  },
  sit:            { frames: 1, fps: 1,  loop: true  },
  jump:           { frames: 4, fps: 12, loop: false },
  eat:            { frames: 4, fps: 6,  loop: true  },
  // v2 form sprites — every loopable form runs at 4–8 fps to feel alive
  // without burning CPU. `pro-done` plays once and the caller swaps back
  // to `idle`.
  listen:         { frames: 4, fps: 5,  loop: true  },
  talk:           { frames: 6, fps: 8,  loop: true  },
  "pro-thinking": { frames: 4, fps: 5,  loop: true  },
  "pro-typing":   { frames: 4, fps: 8,  loop: true  },
  "pro-done":     { frames: 4, fps: 8,  loop: false },
  "cu-mouse":     { frames: 4, fps: 6,  loop: true  },
  alert:          { frames: 2, fps: 3,  loop: true  },
};

interface Props {
  action: PetAction;
  size: number;
  facing?: "left" | "right";
  clan?: string;
  /** Called when a non-loop action finishes (e.g. jump completes). */
  onActionComplete?: (action: PetAction) => void;
  style?: CSSProperties;
}

// Cache: action → "loaded" | "missing"
const spriteCache = new Map<string, "loaded" | "missing">();

function buildSpriteUrl(action: PetAction, clan?: string): string {
  if (clan) return `/pets/sprites/${clan}/${action}.png`;
  return `/pets/sprites/default/${action}.png`;
}

async function probeSprite(url: string): Promise<boolean> {
  if (spriteCache.has(url)) return spriteCache.get(url) === "loaded";
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      spriteCache.set(url, "loaded");
      resolve(true);
    };
    img.onerror = () => {
      spriteCache.set(url, "missing");
      resolve(false);
    };
    img.src = url;
  });
}

export default function PetSpriteCanvas({
  action,
  size,
  facing = "right",
  clan,
  onActionComplete,
  style,
}: Props) {
  const [spriteUrl, setSpriteUrl] = useState<string | null>(null);
  const [frame, setFrame] = useState(0);
  const rafRef = useRef<number | null>(null);
  const startTsRef = useRef<number>(0);
  const lastFrameRef = useRef<number>(-1);

  // Sprint P-7 phases 3-5 (2026-05-22): consume variant context so the
  // active wardrobe skin / clan / festival decoration can override
  // which sprite folder is used. Falls back through the candidate
  // chain in petVariant.buildVariantCandidates(); the final candidate
  // is always the default `/pets/sprites/default/<action>.png`.
  const variant = usePetVariant();
  // The `clan` prop on this component still wins over the variant
  // context — useful for tests / Storybook overrides.
  const effectiveVariant = clan ? { ...variant, clan } : variant;

  // Resolve sprite URL — walk the candidate list, first match wins.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const candidates = buildVariantCandidates(action, effectiveVariant);
      for (const url of candidates) {
        // eslint-disable-next-line no-await-in-loop
        if (await probeSprite(url)) {
          if (!cancelled) setSpriteUrl(url);
          return;
        }
      }
      if (!cancelled) setSpriteUrl(null); // signal fallback
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [action, clan, effectiveVariant.skin, effectiveVariant.festival, effectiveVariant.clan]);

  // Animate frames
  useEffect(() => {
    if (!spriteUrl) return;
    const spec = SPRITE_SPECS[action];
    const frameDuration = 1000 / spec.fps;
    startTsRef.current = performance.now();
    lastFrameRef.current = -1;

    const tick = (ts: number) => {
      const elapsed = ts - startTsRef.current;
      const idx = Math.floor(elapsed / frameDuration);
      const finalFrame = spec.loop ? idx % spec.frames : Math.min(idx, spec.frames - 1);

      if (finalFrame !== lastFrameRef.current) {
        lastFrameRef.current = finalFrame;
        setFrame(finalFrame);

        // Non-looping action finished
        if (!spec.loop && finalFrame === spec.frames - 1 && idx >= spec.frames) {
          onActionComplete?.(action);
          return; // stop the RAF
        }
      }

      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [spriteUrl, action, onActionComplete]);

  if (!spriteUrl) {
    // Asset missing — caller should fall back to PetCanvas
    return null;
  }

  const spec = SPRITE_SPECS[action];
  const sheetWidth = size * spec.frames;

  // The v9 sprite sheets are RGBA PNGs (colorType=6) with true alpha
  // around the pet body. We therefore display them as a CSS-cropped
  // background-image and let the browser composite the alpha channel
  // against the transparent pet window. No canvas / no white→alpha
  // remapping needed — that path was historical and caused black
  // holes when the sprite already had pre-multiplied alpha.
  return (
    <div
      style={{
        width: size,
        height: size,
        overflow: "hidden",
        position: "relative",
        transform: facing === "left" ? "scaleX(-1)" : "scaleX(1)",
        background: "transparent",
        ...style,
      }}
    >
      <div
        style={{
          width: sheetWidth,
          height: size,
          backgroundImage: `url(${spriteUrl})`,
          backgroundSize: `${sheetWidth}px ${size}px`,
          backgroundPosition: `-${frame * size}px 0`,
          backgroundRepeat: "no-repeat",
          background: `transparent url(${spriteUrl}) -${frame * size}px 0 / ${sheetWidth}px ${size}px no-repeat`,
        }}
      />
    </div>
  );
}

/**
 * Check whether sprite assets are available for the given clan.
 * Used to decide whether to use Phase B sprite renderer or fall back to
 * Phase A PetCanvas single-frame mode.
 */
export async function spriteAssetsAvailable(clan?: string): Promise<boolean> {
  // We treat "walk" as the canary asset. If walk.png exists we assume the
  // full sprite set is shipped.
  const url = buildSpriteUrl("walk", clan);
  return probeSprite(url);
}
