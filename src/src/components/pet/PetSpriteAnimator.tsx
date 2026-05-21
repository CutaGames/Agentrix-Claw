/**
 * PetSpriteAnimator — Mobile multi-frame sprite renderer (Phase C / C-4).
 *
 * Mirrors `desktop/src/components/PetSpriteCanvas.tsx` but for React Native.
 * Each sprite sheet is a horizontal strip of N equally-sized frames with a
 * transparent background. A single requestAnimationFrame loop advances the
 * `frame` index at the per-action FPS; we render the current frame by
 * cropping the sheet via `<View overflow="hidden">` containing an `<Image>`
 * shifted by `-frame * size` pixels.
 *
 * Why not Skia?
 *   - Skia would give us GPU compositing, but the sheet sizes here are tiny
 *     (256 px tall) and we run at ≤ 8 fps, so the overhead of Skia plus an
 *     extra dependency outweighs the benefit. RN's image bitmap path is
 *     already cached and HW-accelerated by both iOS UIImageView and Android
 *     ImageView, and `<View overflow:hidden>` with a translated child is the
 *     standard sprite-sheet trick that ships in production games.
 *
 * Sprite sheet contract:
 *   - Width  = frames * frameSize
 *   - Height = frameSize
 *   - PNG with alpha (transparent background)
 *
 * Action set (matches desktop):
 *   walk    — 6 frames, 8 fps
 *   idle    — 4 frames, 4 fps
 *   sleep   — 2 frames, 1 fps
 *   sit     — 1 frame static
 *   jump    — 4 frames, 12 fps, no loop → fires onActionComplete
 *   eat     — 4 frames, 6 fps
 *
 * Asset resolution:
 *   require('../../../assets/pets/sprites/default/{action}.png')
 *
 * Future: per-clan sheets at `assets/pets/sprites/{clan}/`. We bundle only
 * `default` for now; clan sheets will be lazy-loaded via expo-asset URL.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Image,
  StyleSheet,
  type ImageSourcePropType,
  AppState,
  type AppStateStatus,
} from 'react-native';

export type PetAction = 'walk' | 'idle' | 'sleep' | 'sit' | 'jump' | 'eat';

interface SpriteSpec {
  frames: number;
  fps: number;
  loop: boolean;
}

const SPRITE_SPECS: Record<PetAction, SpriteSpec> = {
  walk: { frames: 6, fps: 8, loop: true },
  idle: { frames: 4, fps: 4, loop: true },
  sleep: { frames: 2, fps: 1, loop: true },
  sit: { frames: 1, fps: 1, loop: true },
  jump: { frames: 4, fps: 12, loop: false },
  eat: { frames: 4, fps: 6, loop: true },
};

// Static require map — Metro can only follow `require` with literal strings,
// so we declare each variant explicitly here. When a clan-specific pack is
// shipped, add a new map keyed by clan id.
//
// The PNGs live at `assets/pets/sprites/default/{action}.png` (≈ 0.1-0.7 MB
// each). Total bundle hit ≈ 3 MB which is acceptable for a feature-flagged
// pet experience; if we ever need to ship lighter, swap to `expo-asset`
// remote download with a placeholder mid-load.
const DEFAULT_SHEETS: Record<PetAction, ImageSourcePropType> = {
  walk: require('../../../assets/pets/sprites/default/walk.png'),
  idle: require('../../../assets/pets/sprites/default/idle.png'),
  sleep: require('../../../assets/pets/sprites/default/sleep.png'),
  sit: require('../../../assets/pets/sprites/default/sit.png'),
  jump: require('../../../assets/pets/sprites/default/jump.png'),
  eat: require('../../../assets/pets/sprites/default/eat.png'),
};

interface Props {
  action: PetAction;
  size: number;
  facing?: 'left' | 'right';
  /** Fired once when a non-looping action (currently only `jump`) finishes. */
  onActionComplete?: (action: PetAction) => void;
  /** Optional opacity, useful for ghost / sleep dim states. */
  opacity?: number;
}

export function PetSpriteAnimator({
  action,
  size,
  facing = 'right',
  onActionComplete,
  opacity = 1,
}: Props) {
  const spec = SPRITE_SPECS[action];
  const [frame, setFrame] = useState(0);
  const startTsRef = useRef<number>(performance.now());
  const lastIdxRef = useRef<number>(-1);
  const rafRef = useRef<number | null>(null);
  const [appActive, setAppActive] = useState(true);

  // Pause sprite animation when app is backgrounded — saves battery.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s: AppStateStatus) => {
      setAppActive(s === 'active');
    });
    return () => sub.remove();
  }, []);

  // Reset animation when action changes
  useEffect(() => {
    startTsRef.current = performance.now();
    lastIdxRef.current = -1;
    setFrame(0);
  }, [action]);

  // Animation loop
  useEffect(() => {
    if (!appActive) return; // paused
    const frameDuration = 1000 / spec.fps;

    const tick = () => {
      const elapsed = performance.now() - startTsRef.current;
      const idx = Math.floor(elapsed / frameDuration);
      const next = spec.loop ? idx % spec.frames : Math.min(idx, spec.frames - 1);
      if (next !== lastIdxRef.current) {
        lastIdxRef.current = next;
        setFrame(next);
        if (!spec.loop && idx >= spec.frames) {
          onActionComplete?.(action);
          return; // stop scheduling further frames
        }
      }
      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    };
  }, [action, spec, appActive, onActionComplete]);

  const sheet = DEFAULT_SHEETS[action];
  const sheetWidthPx = size * spec.frames;

  // The `<View>` is `size×size` and clips. The inner `<Image>` is the full
  // sheet, translated horizontally by -(frame × size) so that the requested
  // frame is centred in the clip box. `transform: scaleX(-1)` mirrors the
  // pet horizontally for left-facing wander.
  const containerStyle = useMemo(
    () => ({
      width: size,
      height: size,
      overflow: 'hidden' as const,
      opacity,
      backgroundColor: 'transparent' as const,
      transform: facing === 'left' ? [{ scaleX: -1 as -1 }] : undefined,
    }),
    [size, opacity, facing],
  );

  return (
    <View style={containerStyle}>
      <Image
        source={sheet}
        style={{
          width: sheetWidthPx,
          height: size,
          transform: [{ translateX: -frame * size }],
        }}
        resizeMode="contain"
        // `fadeDuration={0}` avoids a 300 ms cross-fade between frames on
        // Android, which would otherwise smear the animation. iOS ignores it.
        fadeDuration={0}
      />
    </View>
  );
}

export default PetSpriteAnimator;

// ── Helper: pick a wander-friendly action sequence from emotion ──────────

/**
 * Map a pet emotion to its preferred idle action. Used by callers that want
 * the sprite to loop the most context-appropriate action when not actively
 * wandering or interacting.
 */
export function defaultActionForEmotion(emotion: string | null | undefined): PetAction {
  switch (emotion) {
    case 'sleepy':
    case 'tired':
      return 'sleep';
    case 'sad':
    case 'concerned':
      return 'sit';
    case 'happy':
    case 'excited':
    case 'love':
      return 'idle';
    default:
      return 'idle';
  }
}

// ── Style sentinel — ensures bundler doesn't tree-shake the assets above ──
// (Some bundlers strip require() return values if never read.)
StyleSheet.create({}); // no-op
