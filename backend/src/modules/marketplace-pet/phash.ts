/**
 * Perceptual hash (pHash) — Phase 3 W2 BE-T3.6
 *
 * Image fingerprint robust to scaling/compression/minor edits, used for:
 *  - reverse-image-search on the marketplace ("已知盗版样本 100% 命中" target)
 *  - DMCA prior-art evidence
 *  - duplicate detection on PetCreator uploads
 *
 * This implementation is a faithful pure-TS pHash with the standard pipeline:
 *  1. Reduce to 32×32 grayscale
 *  2. Apply 2D DCT (type-II, scaled)
 *  3. Take top-left 8×8 sub-block (low-frequency)
 *  4. Compute median of those 64 coefficients (excluding DC)
 *  5. Each bit = 1 if coefficient > median else 0 → 64-bit fingerprint
 *
 * Distance metric: Hamming distance (popcount of XOR).
 * Threshold guidance: ≤ 6 = near-identical, ≤ 12 = likely same, > 18 = unrelated.
 *
 * IMPORTANT: This module is PURE — it does not import sharp/jimp. The caller
 * must pre-decode the image into a `GrayscaleImage` (raw Uint8Array of pixels).
 * The optional helper `loadImageGrayscale()` is provided in `phash-loader.ts`
 * for backend use (depends on sharp), kept separate so this file can be unit
 * tested without native deps.
 */

export interface GrayscaleImage {
  /** Pixel values in [0, 255], row-major. */
  data: Uint8Array | number[];
  width: number;
  height: number;
}

const TARGET_SIZE = 32;
const HASH_SIZE = 8; // 8×8 = 64-bit hash

/**
 * Compute the 64-bit perceptual hash. Returns hex string of length 16.
 */
export function pHash(img: GrayscaleImage): string {
  if (!img || !img.width || !img.height) throw new Error('pHash: invalid image');
  const reduced = bilinearResize(img, TARGET_SIZE, TARGET_SIZE);
  const dct = dct2d(reduced, TARGET_SIZE);
  // Top-left 8×8 (low frequencies). Exclude DC (0,0) when computing median.
  const block: number[] = [];
  for (let y = 0; y < HASH_SIZE; y++) {
    for (let x = 0; x < HASH_SIZE; x++) {
      block.push(dct[y * TARGET_SIZE + x]);
    }
  }
  const sorted = [...block.slice(1)].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  const median = sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];

  let bits = 0n;
  for (let i = 0; i < block.length; i++) {
    if (block[i] > median) bits |= 1n << BigInt(i);
  }
  return bits.toString(16).padStart(16, '0');
}

/**
 * Hamming distance between two 64-bit hex hashes.
 * Returns number of differing bits in [0, 64].
 */
export function hammingDistance(hashA: string, hashB: string): number {
  if (hashA.length !== hashB.length) {
    throw new Error('hammingDistance: hash length mismatch');
  }
  let diff = 0;
  // 4-bit nibble lookup is fastest in pure JS
  for (let i = 0; i < hashA.length; i++) {
    const a = parseInt(hashA[i], 16);
    const b = parseInt(hashB[i], 16);
    diff += POPCOUNT_4BIT[(a ^ b) & 0xf];
  }
  return diff;
}

/** Default reverse-search threshold. Distance ≤ this means "same image". */
export const PHASH_DEFAULT_MATCH_THRESHOLD = 12;

/**
 * Find the closest match in a candidate set. Returns null if best > threshold.
 */
export function findClosestMatch(
  query: string,
  candidates: Array<{ id: string; phash: string }>,
  threshold = PHASH_DEFAULT_MATCH_THRESHOLD,
): { id: string; distance: number } | null {
  let best: { id: string; distance: number } | null = null;
  for (const c of candidates) {
    if (c.phash.length !== query.length) continue;
    const d = hammingDistance(query, c.phash);
    if (!best || d < best.distance) best = { id: c.id, distance: d };
  }
  if (!best || best.distance > threshold) return null;
  return best;
}

// ─── helpers ──────────────────────────────────────────────────────────────

const POPCOUNT_4BIT = [0, 1, 1, 2, 1, 2, 2, 3, 1, 2, 2, 3, 2, 3, 3, 4];

function bilinearResize(src: GrayscaleImage, dstW: number, dstH: number): number[] {
  const data = src.data;
  const sw = src.width;
  const sh = src.height;
  const out = new Array<number>(dstW * dstH);
  const xRatio = sw <= 1 ? 0 : (sw - 1) / dstW;
  const yRatio = sh <= 1 ? 0 : (sh - 1) / dstH;

  for (let y = 0; y < dstH; y++) {
    for (let x = 0; x < dstW; x++) {
      const sx = x * xRatio;
      const sy = y * yRatio;
      const x0 = Math.floor(sx);
      const y0 = Math.floor(sy);
      const x1 = Math.min(x0 + 1, sw - 1);
      const y1 = Math.min(y0 + 1, sh - 1);
      const dx = sx - x0;
      const dy = sy - y0;
      const a = data[y0 * sw + x0];
      const b = data[y0 * sw + x1];
      const c = data[y1 * sw + x0];
      const d = data[y1 * sw + x1];
      const top = a + (b - a) * dx;
      const bot = c + (d - c) * dx;
      out[y * dstW + x] = top + (bot - top) * dy;
    }
  }
  return out;
}

/** Naive 2D DCT-II. O(N^4) but N=32 → 1M ops, ≪ 50ms in Node. */
function dct2d(input: number[], size: number): number[] {
  const out = new Array<number>(size * size).fill(0);
  const factor = Math.PI / size;
  // Pre-compute row DCT then column DCT
  const tmp = new Array<number>(size * size).fill(0);
  for (let y = 0; y < size; y++) {
    for (let u = 0; u < size; u++) {
      let sum = 0;
      for (let x = 0; x < size; x++) {
        sum += input[y * size + x] * Math.cos(factor * (x + 0.5) * u);
      }
      tmp[y * size + u] = sum;
    }
  }
  for (let v = 0; v < size; v++) {
    for (let u = 0; u < size; u++) {
      let sum = 0;
      for (let y = 0; y < size; y++) {
        sum += tmp[y * size + u] * Math.cos(factor * (y + 0.5) * v);
      }
      out[v * size + u] = sum;
    }
  }
  return out;
}
