/**
 * Unit tests for petDetail.api pure helpers (P1a). Pure-Node jest — only
 * the pure xp/emotion helpers are tested; the fetch fns hit apiFetch.
 */
import { xpProgress, emotionEmoji } from '../petDetail.api';

describe('petDetail.xpProgress', () => {
  it('level 0 with 0 xp = 0%', () => {
    const p = xpProgress(0, 0);
    expect(p.pct).toBe(0);
    expect(p.intoLevel).toBe(0);
  });

  it('progress within a level is 0..100', () => {
    // level 0 band is [0, 100); 50 xp → ~50%
    const p = xpProgress(0, 50);
    expect(p.pct).toBeGreaterThan(0);
    expect(p.pct).toBeLessThanOrEqual(100);
  });

  it('max level (10) reports 100% and no next', () => {
    const p = xpProgress(10, 999999);
    expect(p.pct).toBe(100);
    expect(p.neededForNext).toBeNull();
  });

  it('clamps out-of-range level safely', () => {
    expect(() => xpProgress(-5, 0)).not.toThrow();
    expect(() => xpProgress(99, 0)).not.toThrow();
    expect(xpProgress(99, 0).pct).toBe(100);
  });

  it('pct never exceeds 100 even if xp overshoots the band', () => {
    const p = xpProgress(0, 100000);
    expect(p.pct).toBe(100);
  });
});

describe('petDetail.emotionEmoji', () => {
  it('maps known emotions', () => {
    expect(emotionEmoji('happy')).toBe('😄');
    expect(emotionEmoji('sleepy')).toBe('😴');
    expect(emotionEmoji('love')).toBe('🥰');
  });

  it('falls back to a neutral smile for unknown/missing', () => {
    expect(emotionEmoji(null)).toBe('😊');
    expect(emotionEmoji(undefined)).toBe('😊');
    expect(emotionEmoji('whatever')).toBe('😊');
  });
});
