/**
 * M0-c (2026-09-27) — push by type (product doc 5.2 / 5.4); since 09-28 on the
 * shared contract `shared/types/push-notification.ts` (agentrix.push.v1).
 *
 * Locks: the seven product types plus device_paired (E30) and order_update (T7), one zone + tab destination each, per-type Android
 * channels with private / secret lock-screen visibility, strict payload
 * parsing (references only, never a URL from the push), and the cold-start
 * tap queue.
 */
import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import * as fs from 'fs';
import * as path from 'path';

import {
  MOBILE_PUSH_CHANNELS,
  MOBILE_PUSH_DESTINATIONS,
  MOBILE_PUSH_FALLBACK_ROUTE,
  MOBILE_PUSH_SCHEMA_VERSION,
  MOBILE_PUSH_TYPES,
  __resetMobilePushStateForTests,
  flushPendingMobilePush,
  handleMobilePushResponse,
  mobilePushChannelList,
  parseMobilePushData,
  resolveMobilePushNavigation,
  setupMobilePushChannels,
  type MobilePushNavigator,
} from '../mobilePush';
import { isNavTab, isNavZoneId } from '../../navigation/navCatalog';
import * as contract from '../../../shared/types/push-notification';

function fakeNavigator(ready = true) {
  const calls: Array<{ name: string; params?: object }> = [];
  const nav: MobilePushNavigator & { ready: boolean } = {
    ready,
    isReady() {
      return this.ready;
    },
    navigate(name: string, params?: object) {
      calls.push({ name, params });
    },
  };
  return { nav, calls };
}

beforeEach(() => __resetMobilePushStateForTests());

describe('push types and destinations', () => {
  it('has exactly the seven product types plus device_paired (E30) and order_update (T7)', () => {
    expect([...MOBILE_PUSH_TYPES]).toEqual([
      'approval_required',
      'incoming_call',
      'agenda_reminder',
      'handoff_ready',
      'twin_digest',
      'goal_update',
      'receipt_ready',
      'device_paired',
      'order_update',
    ]);
  });

  it('order_update opens 事项 → 待我处理 with the order ref, on its own orders channel, never on the lock screen', () => {
    expect(MOBILE_PUSH_DESTINATIONS.order_update).toEqual({ zone: 'matters', tab: 'pending', refKind: 'order' });
    expect(MOBILE_PUSH_CHANNELS.order_update).toMatchObject({ id: 'orders', importance: 'high', lockscreen: 'secret' });
    const nav = resolveMobilePushNavigation(parseMobilePushData({ v: 'agentrix.push.v1', type: 'order_update', ref: 'ord_01HZX9' }), { fourZone: true });
    expect(nav).toEqual({ name: 'Main', params: { screen: 'Matters', params: { screen: 'MattersHome', params: { tab: 'pending', ref: 'ord_01HZX9' } } } });
    expect(mobilePushChannelList().map((channel) => channel.id)).toContain('orders');
  });

  it('device_paired opens 我的 → 设备 on its own security channel (not the approvals channel)', () => {
    expect(MOBILE_PUSH_DESTINATIONS.device_paired).toEqual({ zone: 'my', tab: 'devices', refKind: 'device' });
    expect(MOBILE_PUSH_CHANNELS.device_paired).toMatchObject({ id: 'security', importance: 'high', lockscreen: 'private' });
    expect(MOBILE_PUSH_CHANNELS.device_paired.id).not.toBe(MOBILE_PUSH_CHANNELS.approval_required.id);
    const nav = resolveMobilePushNavigation(parseMobilePushData({ v: 'agentrix.push.v1', type: 'device_paired', ref: 'dev_0123abcd' }), { fourZone: true });
    expect(nav).toEqual({ name: 'Main', params: { screen: 'My', params: { screen: 'MyDevices', params: { tab: 'devices', ref: 'dev_0123abcd' } } } });
  });

  it('maps every type to one of the four zones', () => {
    for (const type of MOBILE_PUSH_TYPES) {
      const destination = MOBILE_PUSH_DESTINATIONS[type];
      expect(isNavZoneId(destination.zone)).toBe(true);
      expect(isNavTab(destination.zone, destination.tab)).toBe(true);
      expect(destination.refKind).toMatch(/^[a-z_]+$/);
    }
    expect(MOBILE_PUSH_DESTINATIONS.approval_required).toMatchObject({ zone: 'matters', tab: 'pending' });
    expect(MOBILE_PUSH_DESTINATIONS.handoff_ready).toMatchObject({ zone: 'matters', tab: 'pending' });
    expect(MOBILE_PUSH_DESTINATIONS.twin_digest.zone).toBe('twin');
  });

  it('twin digests and receipts never show on the lock screen; nothing is public', () => {
    expect(MOBILE_PUSH_CHANNELS.twin_digest.lockscreen).toBe('secret');
    expect(MOBILE_PUSH_CHANNELS.receipt_ready.lockscreen).toBe('secret');
    for (const channel of mobilePushChannelList()) {
      expect(['private', 'secret']).toContain(channel.lockscreen);
    }
  });

  it('keeps the legacy channels the backend already targets', () => {
    const ids = mobilePushChannelList().map((channel) => channel.id);
    expect(ids).toEqual(expect.arrayContaining(['approvals', 'transactions']));
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('parseMobilePushData', () => {
  it('reads type + ref (+ agentId) and nothing else', () => {
    const parsed = parseMobilePushData({
      v: MOBILE_PUSH_SCHEMA_VERSION,
      type: 'approval_required',
      ref: 'appr_123',
      agentId: 'agent-01',
      title: 'Pay $500 to Bob?',
      body: 'Visitor asked: …',
      url: 'https://evil.example/phish',
      deepLink: 'agentrix://agents/other',
      amount: 500,
    });
    expect(parsed).toEqual({
      ok: true,
      kind: 'typed',
      payload: { type: 'approval_required', ref: 'appr_123', agentId: 'agent-01' },
      ignoredKeys: ['amount', 'body', 'deepLink', 'title', 'url'],
    });
  });

  it.each([
    [null, 'not_an_object'],
    ['approval_required', 'not_an_object'],
    [['approval_required'], 'not_an_object'],
    [{ v: 'agentrix.push.v1', type: 'approval_required' }, 'invalid_ref'],
    [{ v: 'agentrix.push.v1', type: 'approval_required', ref: '../secret' }, 'invalid_ref'],
    [{ v: 'agentrix.push.v1', type: 'approval_required', ref: 'a b' }, 'invalid_ref'],
    [{ v: 'agentrix.push.v1', type: 'approval_required', ref: 'x'.repeat(200) }, 'invalid_ref'],
    [{ v: 'agentrix.push.v1', type: 'twin_digest', ref: 'd-1', agentId: 'https://evil' }, 'invalid_agent'],
    [{ type: 'receipt_ready', ref: 'r-1', v: 'agentrix.push.v9' }, 'unsupported_version'],
    [{ type: 'open_url', ref: 'x-1', url: 'https://evil.example' }, 'unknown_type'],
    [{ url: 'https://evil.example' }, 'unknown_type'],
  ])('rejects %p (%s)', (data, reason) => {
    expect(parseMobilePushData(data)).toMatchObject({ ok: false, reason });
  });

  it.each(['agentrix.push.v1', 'agentrix.push.v0-draft'])('accepts wire version %s (backend contract v1 and the earlier draft)', (v) => {
    expect(parseMobilePushData({ v, type: 'approval_required', ref: 'appr_1' })).toMatchObject({ ok: true, kind: 'typed' });
  });

  it.each([1, 'agentrix.push.v2', '', null])('refuses any other version %p', (v) => {
    expect(parseMobilePushData({ v, type: 'approval_required', ref: 'appr_1' })).toMatchObject({ ok: false, reason: 'unsupported_version' });
  });

  it('a typed payload without a version is refused (neither the contract nor the old backend shape)', () => {
    expect(parseMobilePushData({ type: 'approval_required', ref: 'appr_1' })).toMatchObject({ ok: false, reason: 'unsupported_version' });
    const target = resolveMobilePushNavigation(parseMobilePushData({ type: 'approval_required', ref: 'appr_1' }), { fourZone: true });
    expect(target).toEqual({ name: 'Inbox', params: { source: 'push' } });
  });

  it('the old backend shape wins when there is no version, whatever its type says', () => {
    expect(parseMobilePushData({ notificationId: 'n-7', type: 'approval_required', ref: 'appr_1' })).toMatchObject({ ok: true, kind: 'legacy', notificationId: 'n-7' });
  });

  it('uses the shared contract (one copy of types, destinations and channels)', () => {
    expect(MOBILE_PUSH_SCHEMA_VERSION).toBe(contract.PUSH_SCHEMA_VERSION);
    expect(MOBILE_PUSH_TYPES).toBe(contract.PUSH_TYPES);
    expect(MOBILE_PUSH_DESTINATIONS).toBe(contract.PUSH_DESTINATIONS);
    expect(MOBILE_PUSH_CHANNELS).toBe(contract.PUSH_CHANNELS);
    // What backend's buildPushMessageV1 sends is what the phone reads.
    const sent = contract.buildPushMessageV1({ type: 'receipt_ready', ref: 'rcpt_1', agentId: 'agent-1' });
    expect(parseMobilePushData(sent.data)).toEqual({ ok: true, kind: 'typed', payload: { type: 'receipt_ready', ref: 'rcpt_1', agentId: 'agent-1' }, ignoredKeys: [] });
    expect(mobilePushChannelList().map((channel) => channel.id)).toContain(sent.channelId);
  });

  it('accepts the current backend payload as legacy', () => {
    expect(parseMobilePushData({ notificationId: 'n-42', type: 'approval' })).toEqual({
      ok: true,
      kind: 'legacy',
      notificationId: 'n-42',
      ignoredKeys: [],
    });
  });
});

describe('resolveMobilePushNavigation', () => {
  it.each([...MOBILE_PUSH_TYPES])('%s opens the inbox with its zone, tab and ref', (type) => {
    const nav = resolveMobilePushNavigation(parseMobilePushData({ v: 'agentrix.push.v1', type, ref: 'ref-1' }));
    expect(nav).toEqual({
      name: MOBILE_PUSH_FALLBACK_ROUTE,
      params: {
        source: 'push',
        pushType: type,
        zone: MOBILE_PUSH_DESTINATIONS[type].zone,
        tab: MOBILE_PUSH_DESTINATIONS[type].tab,
        refKind: MOBILE_PUSH_DESTINATIONS[type].refKind,
        ref: 'ref-1',
      },
    });
  });

  it('malformed payloads carry nothing from the push', () => {
    expect(resolveMobilePushNavigation(parseMobilePushData({ url: 'https://evil.example', ref: 'x' }))).toEqual({
      name: MOBILE_PUSH_FALLBACK_ROUTE,
      params: { source: 'push' },
    });
  });
});

describe('tap handling', () => {
  it('navigates immediately when ready and signed in', () => {
    const { nav, calls } = fakeNavigator(true);
    handleMobilePushResponse({ notificationId: 'n1', data: { v: 'agentrix.push.v1', type: 'goal_update', ref: 'g-1' }, navigator: nav, canNavigate: true });
    expect(calls).toHaveLength(1);
    expect(calls[0].name).toBe('Inbox');
    expect(calls[0].params).toMatchObject({ pushType: 'goal_update', ref: 'g-1' });
  });

  it('queues a cold-start tap until the container is ready and the user is signed in', () => {
    const { nav, calls } = fakeNavigator(false);
    handleMobilePushResponse({ notificationId: 'n2', data: { v: 'agentrix.push.v1', type: 'incoming_call', ref: 'c-1' }, navigator: nav, canNavigate: false });
    expect(calls).toHaveLength(0);
    expect(flushPendingMobilePush(nav, true)).toBeNull();
    nav.ready = true;
    expect(flushPendingMobilePush(nav, false)).toBeNull();
    expect(calls).toHaveLength(0);
    const flushed = flushPendingMobilePush(nav, true);
    expect(flushed?.params).toMatchObject({ pushType: 'incoming_call', ref: 'c-1' });
    expect(calls).toHaveLength(1);
    expect(flushPendingMobilePush(nav, true)).toBeNull();
  });

  it('handles the same notification only once', () => {
    const { nav, calls } = fakeNavigator(true);
    const input = { notificationId: 'n3', data: { v: 'agentrix.push.v1', type: 'receipt_ready', ref: 'r-1' }, navigator: nav, canNavigate: true };
    handleMobilePushResponse(input);
    expect(handleMobilePushResponse(input)).toBeNull();
    expect(calls).toHaveLength(1);
  });
});

describe('setupMobilePushChannels', () => {
  it('creates every channel with mapped importance and lock-screen visibility', async () => {
    const setNotificationChannelAsync = jest.fn(async (_id: string, _channel: Record<string, unknown>) => undefined);
    const created = await setupMobilePushChannels({
      setNotificationChannelAsync,
      AndroidImportance: { MAX: 5, HIGH: 4, DEFAULT: 3 },
      AndroidNotificationVisibility: { PRIVATE: 0, SECRET: -1 },
    });
    expect(created).toEqual(mobilePushChannelList().map((channel) => channel.id));
    const byId = new Map(setNotificationChannelAsync.mock.calls.map(([id, channel]) => [id, channel]));
    expect(byId.get('approvals')).toMatchObject({ importance: 5, lockscreenVisibility: 0 });
    expect(byId.get('twin')).toMatchObject({ importance: 3, lockscreenVisibility: -1 });
    expect(byId.get('receipts')).toMatchObject({ lockscreenVisibility: -1 });
    expect(byId.get('transactions')).toMatchObject({ lockscreenVisibility: -1 });
  });
});

describe('App.tsx wiring (source guard)', () => {
  const app = fs.readFileSync(path.resolve(__dirname, '..', '..', '..', 'App.tsx'), 'utf8');

  it('creates channels before asking for permission and routes taps through mobilePush', () => {
    const channelIdx = app.indexOf('setupMobilePushChannels(Notifications');
    const permissionIdx = app.indexOf('Notifications.getPermissionsAsync()');
    expect(channelIdx).toBeGreaterThan(-1);
    expect(permissionIdx).toBeGreaterThan(channelIdx);
    expect(app).toMatch(/addNotificationResponseReceivedListener\(onResponse\)/);
    expect(app).toMatch(/getLastNotificationResponseAsync\(\)/);
    expect(app).toMatch(/onReady=\{\(\) => flushPendingMobilePush\(/);
  });

  it('never opens a URL taken from a notification', () => {
    expect(app).not.toMatch(/content\.data\??\.(url|deepLink|link)/);
  });
});
