/**
 * M1-e (2026-09-27) — appearance on the phone from the shared design tokens
 * (D11, product doc 11.3–11.5).
 */
import { describe, it, expect, afterEach, jest } from '@jest/globals';

import {
  ACCENT_IDS,
  COLOR_SCHEMES,
  DEFAULT_APPEARANCE,
  auditPaletteContrast,
  contrastRatio,
  resolvePalette,
} from '../../../shared/design-tokens';
import {
  APPEARANCE_STORAGE_KEY,
  LEGACY_THEME_STORAGE_KEY,
  legacyColorsFromTokens,
  readStoredAppearance,
} from '../../theme/appearance';

type ColorsModule = typeof import('../../theme/colors');

function loadColors(fourZone: boolean, stored: Record<string, string> = {}): ColorsModule {
  const previous = process.env.EXPO_PUBLIC_MOBILE_FOUR_ZONE_IA;
  if (fourZone) process.env.EXPO_PUBLIC_MOBILE_FOUR_ZONE_IA = '1';
  else delete process.env.EXPO_PUBLIC_MOBILE_FOUR_ZONE_IA;
  let mod: ColorsModule | undefined;
  jest.isolateModules(() => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires, global-require
    const { mmkv } = require('../../stores/mmkvStorage');
    for (const key of [APPEARANCE_STORAGE_KEY, LEGACY_THEME_STORAGE_KEY]) {
      try {
        mmkv.delete?.(key);
      } catch {
        /* ignore */
      }
    }
    for (const [key, value] of Object.entries(stored)) mmkv.set(key, value);
    // eslint-disable-next-line @typescript-eslint/no-var-requires, global-require
    mod = require('../../theme/colors');
  });
  if (previous === undefined) delete process.env.EXPO_PUBLIC_MOBILE_FOUR_ZONE_IA;
  else process.env.EXPO_PUBLIC_MOBILE_FOUR_ZONE_IA = previous;
  return mod!;
}

afterEach(() => {
  delete process.env.EXPO_PUBLIC_MOBILE_FOUR_ZONE_IA;
});

describe('token → legacy key mapping', () => {
  const legacy = loadColors(false);

  it('fills every legacy key for all 8 mode × accent combinations', () => {
    for (const scheme of COLOR_SCHEMES) {
      for (const accent of ACCENT_IDS) {
        const token = resolvePalette(scheme, accent);
        const base = scheme === 'light' ? legacy.lightColors : legacy.darkColors;
        const mapped = legacyColorsFromTokens(token, base);
        expect(Object.keys(mapped).sort()).toEqual(Object.keys(base).sort());
        expect(mapped.bgPrimary).toBe(token.bg);
        expect(mapped.bgCard).toBe(token.surface);
        expect(mapped.textPrimary).toBe(token.text);
        expect(mapped.textMuted).toBe(token.text3);
        expect(mapped.primary).toBe(token.accent);
        expect(mapped.onAccent).toBe(token.onAccent);
        expect(mapped.accent).toBe(token.accentText);
        expect(mapped.danger).toBe(token.danger);
        // Social brand colours are untouched.
        expect(mapped.google).toBe(base.google);
        expect(mapped.telegram).toBe(base.telegram);
      }
    }
  });

  it('the token palettes pass the 11.4 contrast audit', () => {
    for (const scheme of COLOR_SCHEMES) {
      for (const accent of ACCENT_IDS) {
        const failures = auditPaletteContrast(resolvePalette(scheme, accent)).filter((result) => !result.pass);
        expect(failures).toEqual([]);
      }
    }
  });

  it('mapped text pairs the phone relies on stay AA', () => {
    for (const scheme of COLOR_SCHEMES) {
      for (const accent of ACCENT_IDS) {
        const base = scheme === 'light' ? legacy.lightColors : legacy.darkColors;
        const c = legacyColorsFromTokens(resolvePalette(scheme, accent), base);
        const pairs: Array<[string, string]> = [
          [c.textPrimary, c.bgPrimary],
          [c.textPrimary, c.bgCard],
          [c.textSecondary, c.bgCard],
          [c.textMuted, c.input],
          [c.onAccent, c.primary],
          [c.accent, c.bgCard],
        ];
        for (const [fg, bg] of pairs) expect(contrastRatio(fg, bg)).toBeGreaterThanOrEqual(4.5);
      }
    }
  });
});

describe('readStoredAppearance', () => {
  const store = (values: Record<string, string>) => (key: string) => values[key];

  it('defaults to follow system + 曜石青', () => {
    expect(readStoredAppearance(store({}))).toEqual(DEFAULT_APPEARANCE);
  });

  it('keeps a pre-token light / dark choice', () => {
    expect(readStoredAppearance(store({ [LEGACY_THEME_STORAGE_KEY]: 'light' }))).toEqual({ mode: 'light', accent: 'obsidian-cyan' });
  });

  it('normalizes field by field and survives corrupt JSON', () => {
    expect(readStoredAppearance(store({ [APPEARANCE_STORAGE_KEY]: JSON.stringify({ mode: 'dark', accent: 'neon' }) }))).toEqual({
      mode: 'dark',
      accent: 'obsidian-cyan',
    });
    expect(readStoredAppearance(store({ [APPEARANCE_STORAGE_KEY]: '{not json' }))).toEqual(DEFAULT_APPEARANCE);
  });
});

describe('theme store', () => {
  it('shipped builds (four-zone off) keep the legacy palettes and behaviour', () => {
    const colors = loadColors(false);
    expect(colors.isTokenThemed()).toBe(false);
    expect(colors.getPalette('dark')).toBe(colors.darkColors);
    colors.setThemeMode('light');
    expect(colors.colors.bgPrimary).toBe(colors.lightColors.bgPrimary);
    expect(colors.getThemeKey()).toBe('light');
    colors.setAppearance({ mode: 'system', accent: 'ink' });
    expect(colors.getThemeMode()).toBe('light');
  });

  it('four-zone builds resolve system / light / dark × accent and notify subscribers', () => {
    const colors = loadColors(true);
    expect(colors.isTokenThemed()).toBe(true);
    const seen: string[] = [];
    const off = colors.subscribeTheme(() => seen.push(colors.getThemeKey()));

    colors.setAppearance({ mode: 'light', accent: 'sky-blue' });
    expect(colors.getThemeKey()).toBe('light:sky-blue');
    expect(colors.colors.primary).toBe(resolvePalette('light', 'sky-blue').accent);
    expect(colors.colors.bgPrimary).toBe(resolvePalette('light', 'sky-blue').bg);

    colors.setAppearance({ mode: 'system', accent: 'nebula-violet' });
    expect(colors.getThemeMode()).toBe('dark'); // assumed dark until the OS reports
    colors.setSystemColorScheme('light');
    expect(colors.getThemeKey()).toBe('light:nebula-violet');
    colors.setSystemColorScheme('dark');
    expect(colors.getThemeMode()).toBe('dark');

    // Legacy setter maps onto the appearance mode and keeps the accent.
    colors.setThemeMode('light');
    expect(colors.getAppearance()).toEqual({ mode: 'light', accent: 'nebula-violet' });

    off();
    expect(seen).toEqual(['light:sky-blue', 'dark:nebula-violet', 'light:nebula-violet', 'dark:nebula-violet', 'light:nebula-violet']);
  });

  it('four-zone builds migrate a stored pre-token choice', () => {
    const colors = loadColors(true, { [LEGACY_THEME_STORAGE_KEY]: 'light' });
    expect(colors.getAppearance()).toEqual({ mode: 'light', accent: 'obsidian-cyan' });
    expect(colors.getThemeMode()).toBe('light');
  });
});
