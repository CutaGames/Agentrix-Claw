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
import * as fs from 'fs';
import * as path from 'path';
import {
  APPEARANCE_STORAGE_KEY,
  LEGACY_THEME_STORAGE_KEY,
  PRE_E83_DEFAULT_APPEARANCE,
  legacyColorsFromTokens,
  readStoredAppearance,
} from '../../theme/appearance';
import { APPEARANCE_SYNC_STORAGE_KEY } from '../appearanceSync';

type ColorsModule = typeof import('../../theme/colors');

function loadColors(fourZone: boolean, stored: Record<string, string> = {}): ColorsModule {
  const previous = process.env.EXPO_PUBLIC_MOBILE_FOUR_ZONE_IA;
  if (fourZone) process.env.EXPO_PUBLIC_MOBILE_FOUR_ZONE_IA = '1';
  else delete process.env.EXPO_PUBLIC_MOBILE_FOUR_ZONE_IA;
  let mod: ColorsModule | undefined;
  jest.isolateModules(() => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires, global-require
    const { mmkv } = require('../../stores/mmkvStorage');
    for (const key of [APPEARANCE_STORAGE_KEY, LEGACY_THEME_STORAGE_KEY, APPEARANCE_SYNC_STORAGE_KEY]) {
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

  it('with nothing stored, uses the shared default (light + 晴空蓝 since E83)', () => {
    expect(readStoredAppearance(store({}))).toEqual(DEFAULT_APPEARANCE);
  });

  it('keeps a pre-token light / dark choice', () => {
    // The mode was a choice (written only by the settings toggle); the accent never was, so it follows the default.
    expect(readStoredAppearance(store({ [LEGACY_THEME_STORAGE_KEY]: 'dark' }))).toEqual({ mode: 'dark', accent: DEFAULT_APPEARANCE.accent });
    expect(readStoredAppearance(store({ [LEGACY_THEME_STORAGE_KEY]: 'light' }))).toEqual({ mode: 'light', accent: DEFAULT_APPEARANCE.accent });
  });

  it('normalizes field by field and survives corrupt JSON', () => {
    expect(readStoredAppearance(store({ [APPEARANCE_STORAGE_KEY]: JSON.stringify({ mode: 'dark', accent: 'neon' }) }))).toEqual({
      mode: 'dark',
      accent: DEFAULT_APPEARANCE.accent,
    });
    // A stored choice that equals the old default (跟随系统 + 曜石青) is still a choice and is kept (E83, I-050).
    expect(readStoredAppearance(store({ [APPEARANCE_STORAGE_KEY]: JSON.stringify({ mode: 'system', accent: 'obsidian-cyan' }) }))).toEqual({
      mode: 'system',
      accent: 'obsidian-cyan',
    });
    expect(readStoredAppearance(store({ [APPEARANCE_STORAGE_KEY]: '{not json' }))).toEqual(DEFAULT_APPEARANCE);
  });
});

describe('native start-up colours follow the default appearance (E83)', () => {
  const root = path.resolve(__dirname, '..', '..', '..');
  const expo = JSON.parse(fs.readFileSync(path.join(root, 'app.json'), 'utf8')).expo;
  const scheme = DEFAULT_APPEARANCE.mode === 'dark' ? 'dark' : 'light';
  const bg = resolvePalette(scheme, DEFAULT_APPEARANCE.accent).bg;

  it('the splash is the default page colour, so a cold start does not flash another scheme', () => {
    expect(expo.splash.backgroundColor.toUpperCase()).toBe(bg.toUpperCase());
    // CI runs `expo prebuild` without --clean: the checked-in Android colour must agree with app.json.
    const colorsXml = fs.readFileSync(path.join(root, 'android/app/src/main/res/values/colors.xml'), 'utf8');
    expect(colorsXml).toContain(`<color name="splashscreen_background">${expo.splash.backgroundColor}</color>`);
  });

  it('the OS scheme is not forced, so 跟随系统 and system dialogs can follow it', () => {
    expect(expo.userInterfaceStyle).toBe('automatic');
  });
});

describe('values stored by 1.3.0 without a sync record (E83, I-050)', () => {
  const store = (values: Record<string, string>) => (key: string) => values[key];
  const stored = (value: object) => store({ [APPEARANCE_STORAGE_KEY]: JSON.stringify(value) });

  it('a field equal to the pre-E83 default was never chosen: it follows the current default', () => {
    expect(PRE_E83_DEFAULT_APPEARANCE).toEqual({ mode: 'system', accent: 'obsidian-cyan' });
    expect(readStoredAppearance(stored(PRE_E83_DEFAULT_APPEARANCE), false)).toEqual(DEFAULT_APPEARANCE);
    // The legacy 主题 switch stored the mode it was asked for and the accent that happened to be current.
    expect(readStoredAppearance(stored({ mode: 'dark', accent: 'obsidian-cyan' }), false)).toEqual({ mode: 'dark', accent: DEFAULT_APPEARANCE.accent });
    expect(readStoredAppearance(stored({ mode: 'system', accent: 'nebula-violet' }), false)).toEqual({ mode: DEFAULT_APPEARANCE.mode, accent: 'nebula-violet' });
  });

  it('with a sync record every field is a choice, even one equal to the old default', () => {
    expect(readStoredAppearance(stored(PRE_E83_DEFAULT_APPEARANCE), true)).toEqual(PRE_E83_DEFAULT_APPEARANCE);
    expect(readStoredAppearance(stored(PRE_E83_DEFAULT_APPEARANCE))).toEqual(PRE_E83_DEFAULT_APPEARANCE);
  });

  it('the theme store applies the rule from what MMKV holds, so nothing unchosen is uploaded', () => {
    const unrecorded = loadColors(true, { [APPEARANCE_STORAGE_KEY]: JSON.stringify(PRE_E83_DEFAULT_APPEARANCE) });
    expect(unrecorded.getAppearance()).toEqual(DEFAULT_APPEARANCE);
    const recorded = loadColors(true, {
      [APPEARANCE_STORAGE_KEY]: JSON.stringify(PRE_E83_DEFAULT_APPEARANCE),
      [APPEARANCE_SYNC_STORAGE_KEY]: JSON.stringify({ revision: 3, dirty: false, changedAt: null }),
    });
    expect(recorded.getAppearance()).toEqual(PRE_E83_DEFAULT_APPEARANCE);
  });

  it('from 1.4.0 the 主题 switch in 设置与隐私 records its choice like 外观 (four-zone builds)', () => {
    const screen = fs.readFileSync(path.join(__dirname, '../../screens/me/ClawSettingsScreen.tsx'), 'utf8');
    expect(screen).toContain('if (isTokenThemed()) changeAppearance({ ...getAppearance(), mode: next });');
    expect(screen).toContain('else setThemeMode(next);');
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

  it('a four-zone build with nothing stored starts in the default scheme at once, before the OS reports (E83)', () => {
    const colors = loadColors(true);
    expect(colors.getAppearance()).toEqual(DEFAULT_APPEARANCE);
    const expected = DEFAULT_APPEARANCE.mode === 'system' ? 'dark' : DEFAULT_APPEARANCE.mode;
    expect(colors.getThemeMode()).toBe(expected);
    expect(colors.colors.bgPrimary).toBe(resolvePalette(expected, DEFAULT_APPEARANCE.accent).bg);
  });

  it('four-zone builds migrate a stored pre-token choice', () => {
    const colors = loadColors(true, { [LEGACY_THEME_STORAGE_KEY]: 'light' });
    expect(colors.getAppearance()).toEqual({ mode: 'light', accent: DEFAULT_APPEARANCE.accent });
    expect(colors.getThemeMode()).toBe('light');
  });
});
