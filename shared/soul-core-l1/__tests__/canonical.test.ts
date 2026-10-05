/** Canonical JSON + pure SHA-256 correctness (known NIST vectors) + determinism. */
import { canonicalize, sha256Hex, digestHex } from '../v1_1/canonical';

describe('Soul Core L1 v1.1 canonical + sha256', () => {
  it('matches known SHA-256 vectors', () => {
    expect(sha256Hex('')).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
    expect(sha256Hex('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
    expect(sha256Hex('The quick brown fox jumps over the lazy dog')).toBe(
      'd7a8fbb307d7809469ca9abcb0082e4f8d5651e46d3cdb762d02d0bf37c9e592',
    );
  });

  it('canonicalize is key-order independent (deterministic digests)', () => {
    const a = { b: 1, a: 2, c: [3, { y: 1, x: 2 }] };
    const b = { c: [3, { x: 2, y: 1 }], a: 2, b: 1 };
    expect(canonicalize(a)).toBe(canonicalize(b));
    expect(digestHex(a)).toBe(digestHex(b));
  });

  it('utf-8 multibyte hashing is stable', () => {
    expect(sha256Hex('元神芯')).toBe(sha256Hex('元神芯'));
    expect(sha256Hex('元神芯').length).toBe(64);
  });
});
