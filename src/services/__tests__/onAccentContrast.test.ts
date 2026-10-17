/**
 * M1-g (2026-09-28) — no hard-coded white text on accent / primary / danger /
 * success fills (coord: hard prerequisite before EXPO_PUBLIC_MOBILE_FOUR_ZONE_IA
 * is turned on in any train; REQ-mobile-015 reply).
 *
 * Detection (same as the one-off codemod): a style object with
 * `color: '#fff'` is linked to a fill when it has the fill itself, or when a
 * sibling style key equals its key with the first Text / Label / Txt / Icon /
 * Title removed (primaryButtonText -> primaryButton, chipTextActive ->
 * chipActive). Linked text must use the matching on-colour key.
 */
import { describe, it, expect } from '@jest/globals';
import * as fs from 'fs';
import * as path from 'path';

import { ACCENT_IDS, COLOR_SCHEMES, contrastRatio, resolvePalette } from '../../../shared/design-tokens';
import { legacyColorsFromTokens } from '../../theme/appearance';
import { darkColors, lightColors } from '../../theme/colors';

const SRC = path.resolve(__dirname, '..', '..');
const WHITE = /color:\s*(['"])#(?:fff|FFF|ffffff|FFFFFF)\1/;
const BG = /backgroundColor:\s*(?:colors|c|C|palette)\.(\w+)/;
const OBJ = /(\w+):\s*\{([^{}]*)\}/g;
const FILLS = new Set(['accent', 'primary', 'accentDark', 'primaryLight', 'danger', 'error', 'success']);
const TOKENS = ['Text', 'Label', 'Txt', 'Icon', 'Title'];

function listSource(dir: string): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === '__tests__' || entry.name === '__mocks__' || entry.name === 'node_modules') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...listSource(full));
    else if (/\.(tsx?)$/.test(entry.name)) out.push(full);
  }
  return out;
}

function whiteOnFill(text: string): string[] {
  const entries = Array.from(text.matchAll(OBJ));
  const fills = new Map<string, string>();
  for (const m of entries) {
    const bg = BG.exec(m[2]);
    if (bg && FILLS.has(bg[1]) && !fills.has(m[1])) fills.set(m[1], bg[1]);
  }
  const hits: string[] = [];
  for (const m of entries) {
    const [, key, body] = m;
    if (!WHITE.test(body)) continue;
    const own = BG.exec(body);
    if (own && FILLS.has(own[1])) {
      hits.push(`${key} (on ${own[1]})`);
      continue;
    }
    for (const token of TOKENS) {
      if (!key.includes(token)) continue;
      const base = key.replace(token, '');
      if (fills.has(base)) {
        hits.push(`${key} (on ${base}: ${fills.get(base)})`);
        break;
      }
    }
  }
  return hits;
}

describe('hard-coded white text on fills', () => {
  const files = listSource(SRC);

  it('scans the real source tree', () => {
    expect(files.length).toBeGreaterThan(300);
  });

  it('no linked #fff text remains', () => {
    const offenders: string[] = [];
    for (const file of files) {
      for (const hit of whiteOnFill(fs.readFileSync(file, 'utf8'))) {
        offenders.push(`${path.relative(SRC, file)}: ${hit}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('the detector does catch the pattern it guards', () => {
    const sample = `const s = StyleSheet.create({
      primaryButton: { backgroundColor: colors.primary, borderRadius: 14 },
      primaryButtonText: { color: '#fff', fontWeight: '700' },
      chipActive: { backgroundColor: colors.accent },
      chipTextActive: { color: "#FFFFFF" },
      badge: { backgroundColor: colors.danger, color: '#fff' },
      photoCaption: { color: '#fff' },
    });`;
    expect(whiteOnFill(sample)).toEqual([
      'primaryButtonText (on primaryButton: primary)',
      'chipTextActive (on chipActive: accent)',
      'badge (on danger)',
    ]);
  });
});

describe('on-colour pairs', () => {
  it('shipped (legacy) palettes keep white, so the codemod changes nothing there', () => {
    for (const palette of [darkColors, lightColors]) {
      expect(palette.onAccent).toBe('#ffffff');
      expect(palette.onDanger).toBe('#ffffff');
      expect(palette.onSuccess).toBe('#ffffff');
    }
  });

  it('every token theme keeps the replaced pairs at AA (>= 4.5)', () => {
    const failures: string[] = [];
    for (const scheme of COLOR_SCHEMES) {
      for (const accent of ACCENT_IDS) {
        const c = legacyColorsFromTokens(resolvePalette(scheme, accent), scheme === 'light' ? lightColors : darkColors);
        const pairs: Array<[string, string, string]> = [
          ['onAccent/primary', c.onAccent, c.primary],
          ['onAccent/accent', c.onAccent, c.accent],
          ['onAccent/accentDark', c.onAccent, c.accentDark],
          ['onAccent/primaryLight', c.onAccent, c.primaryLight],
          ['onDanger/danger', c.onDanger, c.danger],
          ['onDanger/error', c.onDanger, c.error],
          ['onSuccess/success', c.onSuccess, c.success],
        ];
        for (const [name, fg, bg] of pairs) {
          const ratio = contrastRatio(fg, bg);
          if (ratio < 4.5) failures.push(`${scheme}/${accent} ${name} ${ratio.toFixed(2)}`);
        }
      }
    }
    expect(failures).toEqual([]);
  });
});
