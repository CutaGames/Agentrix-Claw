/**
 * M1-b (2026-09-27) — four-zone navigator skeleton (flag mobile.four_zone_ia).
 *
 * Pure checks on the route table plus source guards that the navigator files
 * register exactly the names the table uses (RN components cannot render
 * under the root ts-jest setup).
 */
import { describe, it, expect } from '@jest/globals';
import * as fs from 'fs';
import * as path from 'path';

import { NAV_CATALOG, NAV_ZONE_IDS } from '../navCatalog';
import {
  FOUR_ZONE_HIDDEN_LEGACY_TABS,
  FOUR_ZONE_HIDDEN_TAB_OPTIONS,
  FOUR_ZONE_STACK_SCREENS,
  FOUR_ZONE_TAB_ROUTES,
  ZONE_UNAVAILABLE_ROUTE,
  fourZoneTarget,
  resolveFourZoneNavigation,
  uncoveredCatalogTabs,
} from '../four-zone/fourZoneRoutes';
import { DEFAULT_MOBILE_V6_FEATURE_FLAGS } from '../../services/mobileV6FeatureFlags';

const NAV_DIR = path.resolve(__dirname, '..');
const read = (rel: string) => fs.readFileSync(path.join(NAV_DIR, rel), 'utf8');

describe('route table', () => {
  it('ships off by default', () => {
    expect(DEFAULT_MOBILE_V6_FEATURE_FLAGS['mobile.four_zone_ia']).toBe(false);
  });

  it('covers every catalog tab with a screen or the honest notice', () => {
    expect(uncoveredCatalogTabs()).toEqual([]);
  });

  it('every screen target is registered in its zone stack', () => {
    for (const zone of NAV_ZONE_IDS) {
      for (const tab of NAV_CATALOG[zone].tabs) {
        const target = fourZoneTarget(zone, tab.id);
        if (target === 'unavailable') continue;
        expect(target.tab).toBe(FOUR_ZONE_TAB_ROUTES[zone]);
        expect(FOUR_ZONE_STACK_SCREENS[target.tab]).toContain(target.screen);
      }
    }
  });

  it('each zone default tab lands on a real screen', () => {
    for (const zone of NAV_ZONE_IDS) {
      expect(fourZoneTarget(zone, NAV_CATALOG[zone].defaultTab)).not.toBe('unavailable');
    }
  });

  it('resolves a push-style destination with ref', () => {
    expect(resolveFourZoneNavigation({ zone: 'matters', tab: 'pending', ref: 'appr_1' })).toEqual({
      name: 'Main',
      params: { screen: 'Matters', params: { screen: 'MattersHome', params: { tab: 'pending', ref: 'appr_1' } } },
    });
  });

  it('unbuilt tabs open the notice, never a guessed screen', () => {
    expect(resolveFourZoneNavigation({ zone: 'twin', tab: 'visitors' })).toEqual({
      name: ZONE_UNAVAILABLE_ROUTE,
      params: { zone: 'twin', tab: 'visitors' },
    });
    // T7: 收入与回执 is built now.
    expect(resolveFourZoneNavigation({ zone: 'twin', tab: 'income' })).toEqual({
      name: 'Main',
      params: { screen: 'Twin', params: { screen: 'TwinIncome', params: { tab: 'income' } } },
    });
    expect(resolveFourZoneNavigation({ zone: 'twin', tab: 'no-such-tab' } as any).name).toBe(ZONE_UNAVAILABLE_ROUTE);
  });
});

describe('navigator source guards', () => {
  const navigator = read('four-zone/FourZoneTabNavigator.tsx');
  const meStack = read('MeStackNavigator.tsx');
  const root = read('RootNavigator.tsx');
  const main = read('MainTabNavigator.tsx');

  it('registers the four zone tabs and the hidden legacy tabs', () => {
    for (const name of [...Object.values(FOUR_ZONE_TAB_ROUTES), ...FOUR_ZONE_HIDDEN_LEGACY_TABS]) {
      expect(navigator).toMatch(new RegExp(`<Tab\\.Screen\\s+name="${name}"`));
    }
    expect(navigator).toMatch(/initialRouteName="Companion"/);
    for (const legacy of FOUR_ZONE_HIDDEN_LEGACY_TABS) {
      expect(navigator).toMatch(new RegExp(`name="${legacy}" component=\\{\\w+\\} options=\\{hiddenTabOptions\\}`));
    }
  });

  it('hidden legacy tabs take no room in the tab bar (preview build 528)', () => {
    expect(FOUR_ZONE_HIDDEN_TAB_OPTIONS.tabBarButton()).toBeNull();
    expect(FOUR_ZONE_HIDDEN_TAB_OPTIONS.tabBarItemStyle).toEqual({ display: 'none' });
    expect(navigator).toMatch(/const hiddenTabOptions = FOUR_ZONE_HIDDEN_TAB_OPTIONS;/);
  });

  it('registers every zone stack screen', () => {
    for (const screen of [...FOUR_ZONE_STACK_SCREENS.Companion, ...FOUR_ZONE_STACK_SCREENS.Matters, ...FOUR_ZONE_STACK_SCREENS.Twin]) {
      expect(navigator).toMatch(new RegExp(`name="${screen}"`));
    }
    for (const screen of FOUR_ZONE_STACK_SCREENS.My) {
      expect(meStack).toMatch(new RegExp(`name="${screen}"`));
    }
  });

  it('labels come from the catalog, not hard-coded strings', () => {
    for (const zone of NAV_ZONE_IDS) {
      expect(navigator).toContain(`t(NAV_CATALOG.${zone}.label)`);
    }
  });

  it('the notice route exists at the root and the flag gates the navigator', () => {
    expect(root).toMatch(new RegExp(`name="${ZONE_UNAVAILABLE_ROUTE}"`));
    expect(main).toMatch(/isMobileV6FeatureEnabled\('mobile\.four_zone_ia'\)\) return <FourZoneTabNavigator \/>/);
  });

  it('keeps retired and remote-execution screens out of the four-zone IA', () => {
    expect(navigator).not.toMatch(/LeverageSportsMarket|PredictionMarket|PredictScreen|AgentToolsScreen/);
  });
});
