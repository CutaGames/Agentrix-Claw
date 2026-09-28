/**
 * M1-d (2026-09-27) — 我的 home from the catalog, and the global pet layer
 * following the IA switch (product doc 5.1 / 5.4 / 5.5).
 */
import { describe, it, expect } from '@jest/globals';
import * as fs from 'fs';
import * as path from 'path';

import { globalLayerPolicy } from '../four-zone/globalLayerPolicy';
import { MY_HOME_FEATURED_TABS, myHomeTabOrder } from '../four-zone/myHome';
import { fourZoneTarget, resolveFourZoneNavigation } from '../four-zone/fourZoneRoutes';
import { NAV_CATALOG } from '../navCatalog';

const ROOT = path.resolve(__dirname, '..', '..', '..');
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

describe('我的 home', () => {
  it('starts with 带入与备份 / 设备 / 钱包 and lists every other my tab once', () => {
    const order = myHomeTabOrder().map((tab) => tab.id);
    expect(order.slice(0, 3)).toEqual([...MY_HOME_FEATURED_TABS]);
    const expected = NAV_CATALOG.my.tabs.map((tab) => tab.id).filter((id) => id !== NAV_CATALOG.my.defaultTab);
    expect([...order].sort()).toEqual([...expected].sort());
  });

  it('my/home opens MyHome, not the legacy Profile menu', () => {
    expect(fourZoneTarget('my', 'home')).toEqual({ tab: 'My', screen: 'MyHome' });
    expect(resolveFourZoneNavigation({ zone: 'my', tab: 'home' })).toMatchObject({
      name: 'Main',
      params: { screen: 'My', params: { screen: 'MyHome' } },
    });
  });

  it('the four-zone My tab opens MyHome; the legacy Me stack still starts at Profile', () => {
    const navigator = read('src/navigation/four-zone/FourZoneTabNavigator.tsx');
    expect(navigator).toMatch(/<MeStackNavigator initialRouteName="MyHome" \/>/);
    expect(navigator).toMatch(/name="My"\s+component=\{FourZoneMyNavigator\}/);
    const meStack = read('src/navigation/MeStackNavigator.tsx');
    expect(meStack).toMatch(/initialRouteName=\{initialRouteName\}/);
    // Profile stays the first registered screen, so the default is unchanged.
    expect(meStack.indexOf('name="Profile"')).toBeLessThan(meStack.indexOf('name="MyHome"'));
  });

  it('MyHome only offers catalog tabs', () => {
    const screen = read('src/screens/four-zone/MyHomeScreen.tsx');
    expect(screen).toMatch(/myHomeTabOrder\(\)/);
    expect(screen).not.toMatch(/Axp|PetBreed|PetWardrobe|SkinMarket|Referral|AgentOps/);
  });
});

describe('global pet layer', () => {
  it('is off in the four-zone IA and unchanged otherwise', () => {
    expect(globalLayerPolicy(true)).toEqual({ companionBall: false, proactiveBanner: false, voiceGreeting: false, healthNudges: false });
    expect(globalLayerPolicy(false)).toEqual({ companionBall: true, proactiveBanner: true, voiceGreeting: true, healthNudges: true });
  });

  it('App.tsx gates the ball, the proactive bubble, voice greetings and health nudges on the policy', () => {
    const app = read('App.tsx');
    expect(app).toMatch(/const globalLayers = globalLayerPolicy\(isFourZoneBuild\);/);
    expect(app).toMatch(/if \(!globalLayers\.companionBall\) return null;\s*return <CompanionLayer/);
    expect(app).toMatch(/\{globalLayers\.proactiveBanner \? <MobilePetProactiveBanner \/> : null\}/);
    expect(app).toMatch(/globalLayers\.voiceGreeting \? bootVoiceGreetScheduler\(\)/);
    expect(app).toMatch(/globalLayers\.healthNudges \? bootCompanionHealthWatcher\(\)/);
    // No ungated mount left behind.
    expect(app.match(/<MobilePetProactiveBanner \/>/g)?.length).toBe(1);
    expect(app.match(/bootVoiceGreetScheduler\(\)/g)?.length).toBe(1);
  });
});
