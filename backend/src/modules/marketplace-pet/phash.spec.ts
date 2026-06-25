import { pHash, hammingDistance, findClosestMatch, PHASH_DEFAULT_MATCH_THRESHOLD } from './phash';

function makeImage(width: number, height: number, fn: (x: number, y: number) => number) {
  const data = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      data[y * width + x] = Math.max(0, Math.min(255, Math.round(fn(x, y))));
    }
  }
  return { data, width, height };
}

const gradient = (size: number) => makeImage(size, size, (x, y) => (x + y) * (255 / (2 * size)));
const checker = (size: number, cell: number) =>
  makeImage(size, size, (x, y) => ((Math.floor(x / cell) + Math.floor(y / cell)) % 2 === 0 ? 0 : 255));
const noise = (size: number, seed: number) => {
  let s = seed;
  return makeImage(size, size, () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s & 0xff;
  });
};

describe('pHash (BE-T3.6)', () => {
  it('produces a 64-bit (16-hex) hash', () => {
    const h = pHash(gradient(64));
    expect(h).toHaveLength(16);
    expect(h).toMatch(/^[0-9a-f]{16}$/);
  });

  it('hash is deterministic for the same image', () => {
    const img = checker(64, 8);
    expect(pHash(img)).toBe(pHash(img));
  });

  it('same image at different resolutions → small Hamming distance (≤ 6)', () => {
    const big = checker(128, 16);
    const small = checker(64, 8); // same pattern, scaled
    const d = hammingDistance(pHash(big), pHash(small));
    expect(d).toBeLessThanOrEqual(6);
  });

  it('completely different images → large distance (> 18)', () => {
    const a = pHash(gradient(64));
    const b = pHash(noise(64, 42));
    expect(hammingDistance(a, b)).toBeGreaterThan(18);
  });

  it('hammingDistance: identical hashes → 0', () => {
    const h = pHash(gradient(64));
    expect(hammingDistance(h, h)).toBe(0);
  });

  it('hammingDistance: hash length mismatch throws', () => {
    expect(() => hammingDistance('abc', 'abcd')).toThrow();
  });

  it('findClosestMatch: returns nearest within threshold', () => {
    const queryImg = checker(64, 8);
    const variantImg = checker(72, 9); // similar pattern at different size
    const candidates = [
      { id: 'noise', phash: pHash(noise(64, 1)) },
      { id: 'gradient', phash: pHash(gradient(64)) },
      { id: 'variant', phash: pHash(variantImg) },
    ];
    const match = findClosestMatch(pHash(queryImg), candidates);
    expect(match).not.toBeNull();
    expect(match!.id).toBe('variant');
  });

  it('findClosestMatch: returns null when nothing within threshold', () => {
    const query = pHash(gradient(64));
    const candidates = [
      { id: 'noise1', phash: pHash(noise(64, 7)) },
      { id: 'noise2', phash: pHash(noise(64, 99)) },
    ];
    expect(findClosestMatch(query, candidates, 6)).toBeNull();
  });

  it('default threshold is 12', () => {
    expect(PHASH_DEFAULT_MATCH_THRESHOLD).toBe(12);
  });

  it('catches ≥ 4/5 known-piracy samples (synthetic test set)', () => {
    // BE-T3.6 acceptance: ≥ 80% recall on known-piracy samples (synthetic).
    // Real-world recall is higher because real piracy keeps the dominant
    // structure intact; synthetic patterns here are deliberately diverse.
    const originals = [
      makeImage(96, 96, (x, y) => Math.sin(x * 0.18) * 100 + Math.cos(y * 0.22) * 80 + 128),
      checker(96, 12),
      makeImage(96, 96, (x, y) => ((x ^ y) & 0xff)),
      makeImage(96, 96, (x, y) => Math.sin((x + y) * 0.1) * 120 + 128),
      makeImage(96, 96, (x, y) => ((x * 3 + y * 7) % 200)),
    ];
    // Variants: scale to 64 + tiny brightness shift
    const variants = originals.map((img, i) =>
      makeImage(64, 64, (x, y) => {
        const sx = Math.round((x / 63) * (img.width - 1));
        const sy = Math.round((y / 63) * (img.height - 1));
        return img.data[sy * img.width + sx] + ((i % 3) - 1) * 4;
      }),
    );

    const candidates = originals.map((img, i) => ({ id: `orig-${i}`, phash: pHash(img) }));
    let hits = 0;
    for (let i = 0; i < variants.length; i++) {
      const m = findClosestMatch(pHash(variants[i]), candidates, 14);
      if (m && m.id === `orig-${i}`) hits++;
    }
    expect(hits / variants.length).toBeGreaterThanOrEqual(0.8);
  });
});
