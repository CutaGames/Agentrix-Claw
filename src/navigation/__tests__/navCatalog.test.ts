/**
 * M1-a (2026-09-27) — navigation catalog (D3 / D14, 5.3, 8.1); since 09-28 the
 * shared contract `shared/types/nav-catalog.ts` (agentrix.nav.v1).
 */
import { describe, it, expect } from '@jest/globals';

import {
  DESKTOP_ONLY_NAV_CATALOG,
  DESKTOP_ONLY_ZONE_IDS,
  NAV_CATALOG,
  NAV_ZONE_IDS,
  parseNavLink,
  navDestinationWebUrl,
  serializeNavDestination,
  visibleNavTabs,
} from '../navCatalog';
import { MOBILE_PUSH_DESTINATIONS, MOBILE_PUSH_TYPES } from '../../services/mobilePush';
import * as contract from '../../../shared/types/nav-catalog';

describe('shared contract (agentrix.nav.v1)', () => {
  it('the phone uses the contract objects, not a copy', () => {
    expect(NAV_CATALOG).toBe(contract.NAV_CATALOG);
    expect(DESKTOP_ONLY_NAV_CATALOG).toBe(contract.DESKTOP_ONLY_NAV_CATALOG);
    expect(parseNavLink).toBe(contract.parseNavLink);
    expect(contract.NAV_CATALOG_SCHEMA_VERSION).toBe('agentrix.nav.v1');
  });

  it('the phone shows the mobile zones in the contract order', () => {
    expect([...contract.NAV_ZONES_BY_SURFACE.mobile]).toEqual([...NAV_ZONE_IDS]);
  });

  it('a desktop-only destination lands on 事项 → 电脑上 on the phone', () => {
    expect(contract.resolveNavDestinationForSurface({ zone: 'my-ais', tab: 'sessions', ref: 's1' }, 'mobile')).toEqual({ zone: 'matters', tab: 'on-computer', ref: 's1' });
  });

  it('links with credentials or a port are not zone links', () => {
    expect(parseNavLink('https://user:pw@agentrix.top/go/my/devices')).toMatchObject({ ok: false, reason: 'not_a_zone_link' });
    expect(parseNavLink('https://agentrix.top:8443/go/my/devices')).toMatchObject({ ok: false, reason: 'not_a_zone_link' });
    expect(parseNavLink(`agentrix://my/devices?ref=${'a'.repeat(3000)}`)).toMatchObject({ ok: false, reason: 'not_a_zone_link' });
  });
});

describe('zones', () => {
  it('has exactly the four shared zones, in order 伙伴 / 事项 / 分身 / 我的', () => {
    expect([...NAV_ZONE_IDS]).toEqual(['companion', 'matters', 'twin', 'my']);
    expect(NAV_ZONE_IDS.map((zone) => NAV_CATALOG[zone].label.zh)).toEqual(['伙伴', '事项', '分身', '我的']);
  });

  it('desktop-only zones never collide with shared zones and have their own tabs', () => {
    for (const zone of DESKTOP_ONLY_ZONE_IDS) {
      expect(NAV_ZONE_IDS as readonly string[]).not.toContain(zone);
      const ids = DESKTOP_ONLY_NAV_CATALOG[zone].tabs.map((tab) => tab.id);
      expect(ids).toContain(DESKTOP_ONLY_NAV_CATALOG[zone].defaultTab);
      expect(new Set(ids).size).toBe(ids.length);
    }
    expect(DESKTOP_ONLY_NAV_CATALOG['my-ais'].defaultTab).toBe('sessions');
  });

  it('my has trust and appearance (7.3 / 11.3)', () => {
    expect(NAV_CATALOG.my.tabs.map((tab) => tab.id)).toEqual(expect.arrayContaining(['trust', 'appearance']));
  });

  it('every zone has unique tab ids and a default tab it contains', () => {
    for (const zone of NAV_ZONE_IDS) {
      const ids = NAV_CATALOG[zone].tabs.map((tab) => tab.id);
      expect(new Set(ids).size).toBe(ids.length);
      expect(ids).toContain(NAV_CATALOG[zone].defaultTab);
      for (const id of ids) expect(id).toMatch(/^[a-z][a-z-]*$/);
    }
  });

  it('matters → on-computer only shows with a paired computer (5.5)', () => {
    expect(visibleNavTabs('matters', { hasPairedComputer: false }).map((tab) => tab.id)).not.toContain('on-computer');
    expect(visibleNavTabs('matters', { hasPairedComputer: true }).map((tab) => tab.id)).toContain('on-computer');
  });

  it('every push destination is a catalog zone + tab', () => {
    for (const type of MOBILE_PUSH_TYPES) {
      const { zone, tab } = MOBILE_PUSH_DESTINATIONS[type];
      expect(NAV_CATALOG[zone].tabs.map((t) => t.id)).toContain(tab);
    }
  });
});

describe('parseNavLink / serializeNavDestination', () => {
  it.each([
    ['agentrix://matters/pending?ref=appr_1', { zone: 'matters', tab: 'pending', ref: 'appr_1' }],
    ['agentrix://twin', { zone: 'twin', tab: 'card' }],
    ['https://agentrix.top/go/my/devices', { zone: 'my', tab: 'devices' }],
    ['agentrix://go/twin', { zone: 'twin', tab: 'card' }],
    ['go/matters/pending?ref=a-1', { zone: 'matters', tab: 'pending', ref: 'a-1' }],
    ['/my/appearance', { zone: 'my', tab: 'appearance' }],
    ['/companion/activity?ref=rcpt-9', { zone: 'companion', tab: 'activity', ref: 'rcpt-9' }],
    ['matters/on-computer', { zone: 'matters', tab: 'on-computer' }],
  ])('parses %s', (input, destination) => {
    expect(parseNavLink(input)).toEqual({ ok: true, destination });
  });

  it.each([
    ['https://evil.example/matters/pending', 'not_a_zone_link'],
    ['https://nav.invalid/matters/pending', 'not_a_zone_link'],
    ['http://agentrix.top/matters/pending', 'not_a_zone_link'],
    // Site-root https pages are Web (marketing /twin, /companion), not zone links.
    ['https://agentrix.top/twin', 'not_a_zone_link'],
    ['https://agentrix.top/matters/pending', 'not_a_zone_link'],
    ['javascript:alert(1)', 'not_a_zone_link'],
    ['agentrix://agents/agent-1', 'not_a_zone_link'],
    ['/me/settings', 'not_a_zone_link'],
    ['/matters/unknown', 'unknown_tab'],
    ['/twin/card/extra', 'too_deep'],
    ['/matters/pending?ref=../x', 'invalid_ref'],
    ['/matters/pending?url=https://evil.example', 'unsupported_query'],
    ['/matters/pending?ref=a&ref=b', 'unsupported_query'],
  ])('rejects %s (%s)', (input, reason) => {
    expect(parseNavLink(input)).toEqual({ ok: false, reason });
  });

  it('round-trips every zone and tab', () => {
    for (const zone of NAV_ZONE_IDS) {
      for (const tab of NAV_CATALOG[zone].tabs) {
        const path = serializeNavDestination({ zone, tab: tab.id, ref: 'ref-1' });
        expect(parseNavLink(path)).toEqual({ ok: true, destination: { zone, tab: tab.id, ref: 'ref-1' } });
      }
    }
  });

  it('builds the shareable /go/ https form', () => {
    expect(navDestinationWebUrl({ zone: 'matters', tab: 'pending', ref: 'appr_1' })).toBe('https://agentrix.top/go/matters/pending?ref=appr_1');
    const parsed = parseNavLink(navDestinationWebUrl({ zone: 'twin', tab: 'passport' }));
    expect(parsed).toEqual({ ok: true, destination: { zone: 'twin', tab: 'passport' } });
  });

  it('refuses to serialize an unknown tab or unsafe ref', () => {
    expect(() => serializeNavDestination({ zone: 'twin', tab: 'nope' })).toThrow();
    expect(() => serializeNavDestination({ zone: 'twin', tab: 'card', ref: 'a/b' })).toThrow();
  });
});
