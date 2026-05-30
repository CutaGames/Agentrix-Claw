/**
 * PetSpriteImage — Sprint P-6 (2026-05-22) mobile mirror of
 * `desktop/src/components/PetSpriteCanvas.tsx`.
 *
 * Renders one of the 12 mobile-applicable pet sprites (the desktop
 * `cu-mouse` is omitted — no Computer Use on phone) and animates
 * through frames at the per-sprite FPS.
 *
 * Implementation:
 *   - Sprite sheets are horizontal strips (N frames laid out side-by-side).
 *   - We render an outer `View` with `overflow: hidden` clipped to one
 *     frame's worth of width, then translate the inner `Image` left by
 *     `frameIndex × frameWidth` to scroll through frames.
 *   - This is the same trick desktop uses with `background-position`,
 *     adapted to RN where CSS is unavailable.
 *
 * Asset discovery:
 *   - All sprites bundled via `require('../../assets/pets/sprites/default/<name>.png')`.
 *   - The require map is static — RN can't `require()` dynamic paths.
 *   - Sprite sheet's natural width is `frame_count × 256`; height is 256.
 *     (The desktop pipeline guarantees this.)
 */
import React, { useEffect, useRef, useState } from 'react';
import { Image, View, StyleSheet, type ImageSourcePropType } from 'react-native';
import type { PetSpriteKey } from '../services/petMode';

interface SpriteSpec {
  frames: number;
  fps: number;
  loop: boolean;
}

/**
 * Per-sprite frame counts mirror desktop's `SPRITE_SPECS` so the
 * animations line up across platforms.
 */
const SPRITE_SPECS: Record<PetSpriteKey, SpriteSpec> = {
  walk: { frames: 6, fps: 8, loop: true },
  idle: { frames: 4, fps: 4, loop: true },
  sleep: { frames: 2, fps: 1, loop: true },
  sit: { frames: 1, fps: 1, loop: true },
  jump: { frames: 4, fps: 12, loop: false },
  eat: { frames: 4, fps: 6, loop: true },
  listen: { frames: 4, fps: 5, loop: true },
  talk: { frames: 6, fps: 8, loop: true },
  'pro-thinking': { frames: 4, fps: 5, loop: true },
  'pro-typing': { frames: 4, fps: 8, loop: true },
  'pro-done': { frames: 4, fps: 8, loop: false },
  alert: { frames: 2, fps: 3, loop: true },
};

/**
 * Static require map — every sprite the mobile app ships. Adding a new
 * sprite = adding an entry here. RN bundler resolves these at build time.
 */
const SPRITE_SOURCES: Record<PetSpriteKey, ImageSourcePropType> = {
  walk: require('../../assets/pets/sprites/default/walk.png'),
  idle: require('../../assets/pets/sprites/default/idle.png'),
  sleep: require('../../assets/pets/sprites/default/sleep.png'),
  sit: require('../../assets/pets/sprites/default/sit.png'),
  jump: require('../../assets/pets/sprites/default/jump.png'),
  eat: require('../../assets/pets/sprites/default/eat.png'),
  listen: require('../../assets/pets/sprites/default/listen.png'),
  talk: require('../../assets/pets/sprites/default/talk.png'),
  'pro-thinking': require('../../assets/pets/sprites/default/pro-thinking.png'),
  'pro-typing': require('../../assets/pets/sprites/default/pro-typing.png'),
  'pro-done': require('../../assets/pets/sprites/default/pro-done.png'),
  alert: require('../../assets/pets/sprites/default/alert.png'),
};

interface Props {
  sprite: PetSpriteKey;
  /** Output size (square). Internal scaling preserves frame aspect. */
  size: number;
  /** Mirror sprite horizontally (e.g., facing left). */
  facing?: 'left' | 'right';
  /** Called once when a non-loop sprite (jump, pro-done) finishes. */
  onActionComplete?: (sprite: PetSpriteKey) => void;
  /** Test ID for E2E hooks. */
  testID?: string;
}

/**
 * Native frame size assumption: each frame is `256 × 256` px in the
 * source sheet. Sheet width = frames × 256.
 */
const FRAME_PX = 256;

export function PetSpriteImage({
  sprite,
  size,
  facing = 'right',
  onActionComplete,
  testID,
}: Props) {
  // Q1 hardening — never throw on an unknown/missing sprite key or a
  // require() that resolved to undefined. A bad sprite source was a prime
  // suspect for the GlobalFloatingBall mount crash that left users with the
  // dead fallback ball. Degrade to `idle`, then to a transparent box.
  const safeKey: PetSpriteKey = SPRITE_SPECS[sprite] ? sprite : 'idle';
  const spec = SPRITE_SPECS[safeKey];
  const source = SPRITE_SOURCES[safeKey];
  const [frame, setFrame] = useState(0);
  // Capture the active sprite key for the timer closure so we don't
  // accidentally fire `onActionComplete` for a stale sprite after a swap.
  const activeRef = useRef(safeKey);

  useEffect(() => {
    activeRef.current = safeKey;
    setFrame(0);

    if (!spec || spec.frames <= 1) return; // Static / missing sprite — no animation
    const intervalMs = Math.max(16, Math.floor(1000 / spec.fps));
    let f = 0;
    const id = setInterval(() => {
      f += 1;
      if (f >= spec.frames) {
        if (spec.loop) {
          f = 0;
          setFrame(0);
        } else {
          // Hold last frame, fire completion once.
          clearInterval(id);
          setFrame(spec.frames - 1);
          if (onActionComplete && activeRef.current === safeKey) {
            onActionComplete(safeKey);
          }
          return;
        }
      } else {
        setFrame(f);
      }
    }, intervalMs);
    return () => clearInterval(id);
  }, [safeKey, spec, onActionComplete]);

  // If the sprite asset failed to resolve, render a transparent box of the
  // requested size so the ball still lays out (no crash, no broken image).
  if (!spec || source == null) {
    return <View style={[styles.frame, { width: size, height: size }]} testID={testID} />;
  }

  // Image is rendered at `frame_count × size` width; translate left to
  // show only the current frame within the `size × size` clip window.
  const sheetWidth = spec.frames * size;
  const translateX = -frame * size;

  const flipScale = facing === 'left' ? -1 : 1;

  return (
    <View
      style={[styles.frame, { width: size, height: size }]}
      testID={testID}
    >
      <View
        style={[
          styles.sheetWrapper,
          {
            width: sheetWidth,
            height: size,
            transform: [{ translateX }, { scaleX: flipScale }],
          },
        ]}
      >
        <Image
          source={source}
          style={{ width: sheetWidth, height: size }}
          resizeMode="stretch"
          fadeDuration={0}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  frame: {
    overflow: 'hidden',
    backgroundColor: 'transparent',
  },
  sheetWrapper: {
    position: 'absolute',
    top: 0,
    left: 0,
  },
});

export default PetSpriteImage;
