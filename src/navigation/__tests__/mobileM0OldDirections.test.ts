/**
 * M0 (EXPO_PUBLIC_MOBILE_M0=1, brief section 3): the old directions get no entry. Their screens stay in the code base
 * (D7); an M0 build does not register them, hides the buttons that led there and sends their links to the notice.
 * Other builds keep every route. Pure checks plus source guards (RN components cannot render under ts-jest).
 */
import { describe, it, expect } from '@jest/globals';
import * as fs from 'fs';
import * as path from 'path';
import {
  MOBILE_M0_RETIRED_HIDDEN_TABS,
  MOBILE_M0_RETIRED_ME_SCREENS,
  mobileM0Registers,
  mobileM0RetiresNotification,
} from '../../services/mobileM0';
import { classifyFourZoneLegacyPath, isMobileM0RetiredCanonicalPath } from '../four-zone/fourZoneLegacyLinks';
import { FOUR_ZONE_STACK_SCREENS } from '../four-zone/fourZoneRoutes';

const SRC = path.resolve(__dirname, '..', '..');
const read = (rel: string) => fs.readFileSync(path.join(SRC, rel), 'utf8');

describe('which routes an M0 build registers', () => {
  it('other builds register everything', () => {
    for (const route of [...MOBILE_M0_RETIRED_HIDDEN_TABS, ...MOBILE_M0_RETIRED_ME_SCREENS, 'MyHome']) {
      expect(mobileM0Registers(route, false)).toBe(true);
    }
  });

  it('an M0 build drops World, Plaza, AXP, pet earnings, the digest and the pet screens', () => {
    for (const route of [...MOBILE_M0_RETIRED_HIDDEN_TABS, ...MOBILE_M0_RETIRED_ME_SCREENS]) {
      expect([route, mobileM0Registers(route, true)]).toEqual([route, false]);
    }
  });

  it('keeps every 我的 screen the four-zone IA lands on, the chat tab and the legacy Me tab', () => {
    for (const route of [...FOUR_ZONE_STACK_SCREENS.My, 'Summon', 'Me', 'MemoryManagement', 'WearableHub', 'Profile']) {
      expect([route, mobileM0Registers(route, true)]).toEqual([route, true]);
    }
  });

  it('airdrop notifications open nothing in an M0 build', () => {
    expect(mobileM0RetiresNotification('airdrop_available', true)).toBe(true);
    expect(mobileM0RetiresNotification('airdrop_claimed', true)).toBe(true);
    expect(mobileM0RetiresNotification('airdrop_claimed', false)).toBe(false);
    expect(mobileM0RetiresNotification('payment_received', true)).toBe(false);
  });
});

describe('old links in an M0 build', () => {
  it.each([
    ['pet/wardrobe', 'me/pet/wardrobe'],
    ['pet/skin-marketplace', 'me/pet/skins'],
    ['market/skill/abc', 'plaza/skills/abc'],
    ['discover/marketplace', 'plaza/skills'],
    ['world/map', 'world/map'],
    ['world/create/text', 'world/create/text'],
    ['me/axp', 'me/axp'],
  ])('%s opens the notice (old route %s is not registered)', (p) => {
    expect(classifyFourZoneLegacyPath(p, true)).toEqual({ kind: 'notice', reason: 'link_retired' });
  });

  it('the same links still open their hidden route in other builds (D7)', () => {
    expect(classifyFourZoneLegacyPath('market/skill/abc', false)).toEqual({ kind: 'legacy', path: 'plaza/skills/abc' });
    expect(classifyFourZoneLegacyPath('pet/wardrobe', false)?.kind).toBe('legacy');
  });

  it('redirects win: world opens 伙伴, the old memory link opens 我的 → 身份, settings stay', () => {
    expect(classifyFourZoneLegacyPath('world', true)).toEqual({ kind: 'zone', destination: { zone: 'companion', tab: 'chat' } });
    expect(classifyFourZoneLegacyPath('agent/memory', true)).toEqual({ kind: 'zone', destination: { zone: 'my', tab: 'identity' } });
    expect(classifyFourZoneLegacyPath('me/settings', true)).toEqual({ kind: 'zone', destination: { zone: 'my', tab: 'settings' } });
  });

  it('matches on segment boundaries only', () => {
    expect(isMobileM0RetiredCanonicalPath('plaza')).toBe(true);
    expect(isMobileM0RetiredCanonicalPath('plazas')).toBe(false);
    expect(isMobileM0RetiredCanonicalPath('me/pet/memory')).toBe(false);
    expect(isMobileM0RetiredCanonicalPath('me/devices/wearable')).toBe(false);
  });
});

describe('source guards', () => {
  const tabs = read('navigation/four-zone/FourZoneTabNavigator.tsx');
  const me = read('navigation/MeStackNavigator.tsx');

  it('World and Plaza are registered only outside M0; Summon and Me always', () => {
    expect(tabs).toMatch(/mobileM0Registers\('World'\) \? <Tab\.Screen name="World"/);
    expect(tabs).toMatch(/mobileM0Registers\('Plaza'\) \? <Tab\.Screen name="Plaza"/);
    expect(tabs).toMatch(/\n\s*<Tab\.Screen name="Summon"/);
    expect(tabs).toMatch(/\n\s*<Tab\.Screen name="Me"/);
  });

  it('every retired Me screen sits inside the M0 gate', () => {
    const gate = me.indexOf('{MOBILE_M0_ENABLED ? null : (');
    const end = me.indexOf(')}', gate);
    expect(gate).toBeGreaterThan(0);
    for (const screen of MOBILE_M0_RETIRED_ME_SCREENS) {
      const at = me.indexOf(`name="${screen}"`);
      expect([screen, at > gate && at < end]).toEqual([screen, true]);
      expect(me.split(`name="${screen}"`).length - 1).toBe(1);
    }
  });

  it('the buttons into AXP and pet earnings, and the airdrop notification, follow the same switch', () => {
    const profile = read('screens/me/ProfileScreen.tsx');
    expect(profile).toMatch(/mobileM0Registers\('AxpCenter'\) \? \(\s*<Pressable/);
    expect(profile).toMatch(/mobileM0Registers\('PetEarnings'\) \? \(\s*<MenuItem/);
    expect(profile).toMatch(/enabled: mobileM0Registers\('AxpCenter'\)/);
    expect(read('services/notifications.ts')).toMatch(/if \(mobileM0RetiresNotification\(data\.type\)\) return;/);
  });
});
