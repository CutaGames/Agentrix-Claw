/**
 * M1-j (2026-09-28) — a catalog tab the phone has not built but Web serves
 * opens on Web through the shared `/go/<zone>/<tab>` link, instead of a dead
 * end (MyHome's first card 带入与备份 is one of them).
 */
import { describe, it, expect } from '@jest/globals';
import * as fs from 'fs';
import * as path from 'path';
import { NAV_ZONE_IDS, isNavTab, parseNavLink, type NavZoneId } from '../navCatalog';
import { fourZoneTarget } from '../four-zone/fourZoneRoutes';
import { WEB_SERVED_UNBUILT_TABS, getZoneWebPath, getZoneWebUrl } from '../../services/webHandoff';

describe('web handoff for unbuilt tabs', () => {
  it('lists only real catalog tabs that the phone has not built', () => {
    for (const [zone, tabs] of Object.entries(WEB_SERVED_UNBUILT_TABS)) {
      expect((NAV_ZONE_IDS as readonly string[]).includes(zone)).toBe(true);
      for (const tab of tabs) {
        expect([zone, tab, isNavTab(zone as NavZoneId, tab)]).toEqual([zone, tab, true]);
        // Once the phone builds the tab, it should leave this list.
        expect([zone, tab, fourZoneTarget(zone as NavZoneId, tab)]).toEqual([zone, tab, 'unavailable']);
      }
    }
  });

  it('builds the shared /go/ link, which the phone itself parses as the same zone link', () => {
    expect(getZoneWebPath('my', 'import')).toBe('/go/my/import');
    expect(getZoneWebUrl('my', 'import', 'https://www.agentrix.top/')).toBe('https://www.agentrix.top/go/my/import');
    const parsed = parseNavLink('https://agentrix.top/go/my/import');
    expect(parsed).toMatchObject({ ok: true, destination: { zone: 'my', tab: 'import' } });
  });

  it('opens on the www host, which the Android intent filter does not claim (no loop back into the app)', () => {
    const app = JSON.parse(fs.readFileSync(path.resolve(__dirname, '..', '..', '..', 'app.json'), 'utf8')).expo;
    const hosts = (app.android.intentFilters as Array<{ data: Array<{ host?: string }> }>).flatMap((filter) => filter.data.map((item) => item.host)).filter(Boolean);
    const url = new URL(getZoneWebUrl('my', 'import') as string);
    expect(hosts).not.toContain(url.host);
  });

  it('returns null for tabs Web does not serve, built tabs and odd input', () => {
    expect(getZoneWebPath('my', 'devices')).toBeNull();
    expect(getZoneWebPath('twin', 'income')).toBeNull();
    expect(getZoneWebPath('constructor', 'x')).toBeNull();
    expect(getZoneWebPath('__proto__', 'import')).toBeNull();
    expect(getZoneWebPath('my', '../import')).toBeNull();
  });

  it('the notice screen offers the web link only through getZoneWebUrl and carries no ref', () => {
    const screen = fs.readFileSync(path.resolve(__dirname, '..', '..', 'screens', 'four-zone', 'ZoneUnavailableScreen.tsx'), 'utf8');
    expect(screen).toMatch(/const webUrl = zone && tab \? getZoneWebUrl\(zone, tab\) : null;/);
    expect(screen).toMatch(/testID="zone-unavailable-open-web"/);
    expect(screen).not.toMatch(/params\?\.ref/);
  });
});
