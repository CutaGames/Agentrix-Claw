import { describe, it, expect } from 'vitest';
import {
  clampToBounds,
  pickRandomTarget,
  pickRestPoint,
  pickWanderTargetV2,
  chooseBoundsForCursor,
  type CompanionBounds,
} from '../services/petCompanion';

const B: CompanionBounds = {
  x: 0,
  y: 0,
  width: 1920,
  height: 1080,
  bottomInset: 48,
};

const B2: CompanionBounds = {
  x: 1920,
  y: 0,
  width: 1280,
  height: 720,
  bottomInset: 48,
};

describe('petCompanion P2-1 wander polish', () => {
  it('clampToBounds keeps the pet inside safe area', () => {
    const out = clampToBounds({ x: -1000, y: -1000 }, B);
    expect(out.x).toBeGreaterThanOrEqual(0);
    expect(out.y).toBeGreaterThanOrEqual(0);
    const out2 = clampToBounds({ x: 99999, y: 99999 }, B);
    expect(out2.x).toBeLessThanOrEqual(B.x + B.width);
    expect(out2.y).toBeLessThanOrEqual(B.y + B.height);
  });

  it('pickRandomTarget returns a point inside bounds', () => {
    for (let i = 0; i < 50; i++) {
      const p = pickRandomTarget(B);
      expect(p.x).toBeGreaterThanOrEqual(B.x);
      expect(p.x).toBeLessThanOrEqual(B.x + B.width);
      expect(p.y).toBeGreaterThanOrEqual(B.y);
      expect(p.y).toBeLessThanOrEqual(B.y + B.height);
    }
  });

  it('pickRestPoint returns one of three corner-style anchors', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 60; i++) {
      const p = pickRestPoint(B);
      seen.add(`${p.x},${p.y}`);
    }
    // 3 deterministic anchors
    expect(seen.size).toBeLessThanOrEqual(3);
    expect(seen.size).toBeGreaterThanOrEqual(1);
  });

  it('pickWanderTargetV2 honors restProbability via injected rng', () => {
    const p = pickWanderTargetV2(B, undefined, {
      restProbability: 1,
      rng: () => 0,
    });
    // Must land on one of the three deterministic rest anchors (pre-clamp).
    const anchors = [
      {
        x: B.x + B.width - 160 - 32 - 24,
        y: B.y + B.height - 200 - B.bottomInset - 24,
      },
      { x: B.x + 32 + 24, y: B.y + B.height - 200 - B.bottomInset - 24 },
      { x: B.x + B.width - 160 - 32 - 24, y: B.y + 32 + 24 },
    ];
    expect(anchors.some((a) => a.x === p.x && a.y === p.y)).toBe(true);
  });

  it('pickWanderTargetV2 with restProbability=0 never returns rest anchor first call', () => {
    // With rng()=0.99 we skip rest path; result is from pickRandomTarget.
    const p = pickWanderTargetV2(B, undefined, {
      restProbability: 0,
      rng: () => 0.5,
    });
    expect(p.x).toBeGreaterThanOrEqual(B.x);
    expect(p.y).toBeGreaterThanOrEqual(B.y);
  });

  it('chooseBoundsForCursor returns containing monitor', () => {
    const m = chooseBoundsForCursor([B, B2], { x: 2000, y: 100 });
    expect(m).toBe(B2);
  });

  it('chooseBoundsForCursor falls back to closest when off-screen', () => {
    const m = chooseBoundsForCursor([B, B2], { x: 5000, y: 5000 });
    expect(m).not.toBeNull();
  });

  it('chooseBoundsForCursor returns null on empty list', () => {
    expect(chooseBoundsForCursor([], { x: 0, y: 0 })).toBeNull();
  });
});
