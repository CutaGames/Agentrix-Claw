/**
 * M1-c (2026-09-27) — deep links and push taps into the four-zone IA.
 */
import { describe, it, expect, beforeEach } from '@jest/globals';
import * as fs from 'fs';
import * as path from 'path';

import { describeLinkState, fourZoneStateFromPath } from '../four-zone/fourZoneLinking';
import {
  __resetMobilePushStateForTests,
  handleMobilePushResponse,
  resolveMobilePushNavigation,
  parseMobilePushData,
} from '../../services/mobilePush';

beforeEach(() => __resetMobilePushStateForTests());

describe('fourZoneStateFromPath', () => {
  it('builds Main > zone tab > screen with tab and ref', () => {
    expect(fourZoneStateFromPath('agentrix://matters/pending?ref=appr_1')).toEqual({
      routes: [
        {
          name: 'Main',
          state: {
            routes: [{ name: 'Matters', state: { routes: [{ name: 'MattersHome', params: { tab: 'pending', ref: 'appr_1' } }] } }],
          },
        },
      ],
    });
  });

  it('a zone root opens its default tab', () => {
    const state = fourZoneStateFromPath('/twin');
    expect(state?.routes[0].state?.routes[0]).toEqual({ name: 'Twin', state: { routes: [{ name: 'TwinHome', params: { tab: 'card' } }] } });
  });

  it('my/devices lands on the device list (M1-k)', () => {
    const state = fourZoneStateFromPath('https://agentrix.top/go/my/devices');
    expect(state?.routes[0].state?.routes[0]).toEqual({ name: 'My', state: { routes: [{ name: 'MyDevices', params: { tab: 'devices' } }] } });
  });

  it('an unbuilt tab opens the notice over Main', () => {
    expect(fourZoneStateFromPath('/twin/visitors')).toEqual({
      routes: [{ name: 'Main' }, { name: 'ZoneUnavailable', params: { zone: 'twin', tab: 'visitors' } }],
    });
  });
  it('twin/income lands on the orders screen, with an order ref from the order_update push (T7)', () => {
    const state = fourZoneStateFromPath('agentrix://twin/income?ref=ord_0123456789abcdef0123456789abcdef');
    expect(state?.routes[0].state?.routes[0]).toEqual({
      name: 'Twin',
      state: { routes: [{ name: 'TwinIncome', params: { tab: 'income', ref: 'ord_0123456789abcdef0123456789abcdef' } }] },
    });
  });

  it.each(['/matters/nope', '/matters/pending?url=https://evil.example', '/twin/card/x', '/matters/pending?ref=../x'])(
    'an invalid zone link %s fails closed with no params',
    (input) => {
      expect(fourZoneStateFromPath(input)).toEqual({ routes: [{ name: 'Main' }, { name: 'ZoneUnavailable' }] });
    },
  );

  it.each(['/agents/agent-1', 'agentrix://me/settings', '/plaza/skills', 'https://evil.example/matters', 'https://agentrix.top/twin'])(
    'non-zone link %s falls through',
    (input) => {
      expect(fourZoneStateFromPath(input)).toBeNull();
    },
  );
});

describe('push taps in four-zone mode', () => {
  it('opens the zone + tab with the ref', () => {
    expect(resolveMobilePushNavigation(parseMobilePushData({ v: 'agentrix.push.v1', type: 'approval_required', ref: 'appr_9' }), { fourZone: true })).toEqual({
      name: 'Main',
      params: { screen: 'Matters', params: { screen: 'MattersHome', params: { tab: 'pending', ref: 'appr_9' } } },
    });
  });

  it('an unbuilt destination opens the notice', () => {
    expect(resolveMobilePushNavigation(parseMobilePushData({ v: 'agentrix.push.v1', type: 'twin_digest', ref: 'd-1' }), { fourZone: true })).toEqual({
      name: 'ZoneUnavailable',
      params: { zone: 'twin', tab: 'visitors' },
    });
  });

  it('legacy and malformed payloads still open the inbox', () => {
    expect(resolveMobilePushNavigation(parseMobilePushData({ notificationId: 'n-1', type: 'approval' }), { fourZone: true }).name).toBe('Inbox');
    expect(resolveMobilePushNavigation(parseMobilePushData({ url: 'https://evil.example' }), { fourZone: true })).toEqual({
      name: 'Inbox',
      params: { source: 'push' },
    });
  });

  it('handleMobilePushResponse passes the four-zone target to the navigator', () => {
    const calls: Array<[string, object | undefined]> = [];
    handleMobilePushResponse({
      notificationId: 'n-1',
      data: { v: 'agentrix.push.v1', type: 'goal_update', ref: 'g-1' },
      navigator: { isReady: () => true, navigate: (name, params) => calls.push([name, params]) },
      canNavigate: true,
      fourZone: true,
    });
    expect(calls).toEqual([['ZoneUnavailable', { zone: 'matters', tab: 'goals' }]]);
  });
});

describe('App.tsx wiring (source guard)', () => {
  const app = fs.readFileSync(path.resolve(__dirname, '..', '..', '..', 'App.tsx'), 'utf8');

  it('tries zone links first, behind the literal four-zone env flag', () => {
    expect(app).toMatch(/const isFourZoneBuild = process\.env\.EXPO_PUBLIC_MOBILE_FOUR_ZONE_IA === 'true'/);
    // resolveFourZoneLinkState runs fourZoneStateFromPath first (fourZoneLegacyLinks.test.ts).
    const fourZoneIdx = app.indexOf('resolveFourZoneLinkState(path, ');
    const v7Idx = app.indexOf('isMobileV7RouteCandidate(path)');
    expect(fourZoneIdx).toBeGreaterThan(-1);
    expect(v7Idx).toBeGreaterThan(fourZoneIdx);
    expect(app).toMatch(/fourZone: isFourZoneBuild/);
  });
});

describe('describeLinkState (Maestro E2E log line)', () => {
  it('names the focused route at each level, never params', () => {
    const state = fourZoneStateFromPath('agentrix://matters/pending?ref=appr_1');
    expect(describeLinkState(state)).toBe('Main > Matters > MattersHome');
    expect(describeLinkState(state)).not.toContain('appr_1');
  });
  it('follows index in a full navigation state', () => {
    const full = {
      index: 0,
      routes: [
        { name: 'Main', state: { index: 3, routes: [{ name: 'Companion' }, { name: 'Matters' }, { name: 'Twin' }, { name: 'My', state: { index: 1, routes: [{ name: 'MyHome' }, { name: 'Appearance' }] } }] } },
        { name: 'Inbox' },
      ],
    };
    expect(describeLinkState(full)).toBe('Main > My > Appearance');
  });
  it('handles nothing', () => {
    expect(describeLinkState(undefined)).toBe('(none)');
    expect(describeLinkState({ routes: [] })).toBe('(none)');
  });
});
