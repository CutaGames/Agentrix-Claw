/**
 * Unit tests for the shared `clanShortCode()` bridge (audit P1 — clan
 * dual-track unification). Pure function, no RN runtime.
 */
import { clanShortCode } from '../../../shared/types/pet';

describe('clanShortCode', () => {
  it('maps canonical slugs to single-letter codes', () => {
    expect(clanShortCode('A_office')).toBe('A');
    expect(clanShortCode('B_life')).toBe('B');
    expect(clanShortCode('C_learn')).toBe('C');
    expect(clanShortCode('D_play')).toBe('D');
    expect(clanShortCode('E_web3')).toBe('E');
    expect(clanShortCode('F_family')).toBe('F');
  });

  it('passes through already-short codes (case-insensitive)', () => {
    expect(clanShortCode('A')).toBe('A');
    expect(clanShortCode('f')).toBe('F');
    expect(clanShortCode('c')).toBe('C');
  });

  it('falls back to A for missing / unknown input', () => {
    expect(clanShortCode(null)).toBe('A');
    expect(clanShortCode(undefined)).toBe('A');
    expect(clanShortCode('')).toBe('A');
    expect(clanShortCode('Z_unknown')).toBe('A');
    expect(clanShortCode('garbage')).toBe('A');
  });

  it('derives from a soul_template_id-like prefix when it starts A..F', () => {
    // e.g. some backends pass the clan via the first char of a code
    expect(clanShortCode('Boffice')).toBe('B');
  });
});
