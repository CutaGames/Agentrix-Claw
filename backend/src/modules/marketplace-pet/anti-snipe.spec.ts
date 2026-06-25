import { applyAntiSnipe } from './anti-snipe';

const t = (s: string) => new Date(s);
const ORIGINAL = t('2026-05-06T12:00:00Z');

describe('applyAntiSnipe (BE-T3.9)', () => {
  it('bid outside trigger window → no extension', () => {
    const r = applyAntiSnipe({
      currentEndsAt: ORIGINAL,
      originalEndsAt: ORIGINAL,
      bidAt: t('2026-05-06T11:55:00Z'), // 5 min before
    });
    expect(r.extended).toBe(false);
    expect(r.newEndsAt.toISOString()).toBe(ORIGINAL.toISOString());
  });

  it('bid within 1-minute window → extend by 2 minutes', () => {
    const r = applyAntiSnipe({
      currentEndsAt: ORIGINAL,
      originalEndsAt: ORIGINAL,
      bidAt: t('2026-05-06T11:59:30Z'), // 30s before close
    });
    expect(r.extended).toBe(true);
    expect(r.cappedAtMax).toBe(false);
    expect(r.newEndsAt.toISOString()).toBe('2026-05-06T12:02:00.000Z');
  });

  it('bid AT current end (remaining=0ms) → still extends', () => {
    const r = applyAntiSnipe({
      currentEndsAt: ORIGINAL,
      originalEndsAt: ORIGINAL,
      bidAt: ORIGINAL,
    });
    expect(r.extended).toBe(true);
  });

  it('bid AFTER end (remaining<0) → no extension', () => {
    const r = applyAntiSnipe({
      currentEndsAt: ORIGINAL,
      originalEndsAt: ORIGINAL,
      bidAt: t('2026-05-06T12:00:01Z'),
    });
    expect(r.extended).toBe(false);
    expect(r.newEndsAt.toISOString()).toBe(ORIGINAL.toISOString());
  });

  it('chained extensions accumulate (same as current spec)', () => {
    let curr = ORIGINAL;
    for (let i = 0; i < 5; i++) {
      const out = applyAntiSnipe({
        currentEndsAt: curr,
        originalEndsAt: ORIGINAL,
        bidAt: new Date(curr.getTime() - 10_000),
      });
      expect(out.extended).toBe(true);
      curr = out.newEndsAt;
    }
    // 5 extensions × 2 min = 10 min after original
    expect(curr.toISOString()).toBe('2026-05-06T12:10:00.000Z');
  });

  it('caps total extension at maxTotalExtensionMs (24h default)', () => {
    // Push end already at original + 23h59min
    const nearMax = new Date(ORIGINAL.getTime() + (24 * 60 - 1) * 60_000);
    const out = applyAntiSnipe({
      currentEndsAt: nearMax,
      originalEndsAt: ORIGINAL,
      bidAt: new Date(nearMax.getTime() - 10_000),
    });
    expect(out.cappedAtMax).toBe(true);
    expect(out.newEndsAt.toISOString()).toBe(
      new Date(ORIGINAL.getTime() + 24 * 3600 * 1000).toISOString(),
    );
  });

  it('cap-already-reached → no further extension', () => {
    const atMax = new Date(ORIGINAL.getTime() + 24 * 3600 * 1000);
    const out = applyAntiSnipe({
      currentEndsAt: atMax,
      originalEndsAt: ORIGINAL,
      bidAt: new Date(atMax.getTime() - 10_000),
    });
    expect(out.cappedAtMax).toBe(true);
    expect(out.extended).toBe(false);
    expect(out.newEndsAt.toISOString()).toBe(atMax.toISOString());
  });

  it('respects custom trigger/extension windows', () => {
    const r = applyAntiSnipe({
      currentEndsAt: ORIGINAL,
      originalEndsAt: ORIGINAL,
      bidAt: new Date(ORIGINAL.getTime() - 30_000),
      triggerWindowMs: 10_000, // 10s trigger
      extensionMs: 5_000,
    });
    // Bid is 30s before close, but trigger is only 10s → no extension
    expect(r.extended).toBe(false);
  });
});
