/**
 * M1-k (2026-09-28) — 我的 → 设备: computers and hardware in one read-only
 * list; a failed read stays a failure, never "no devices".
 * M1-l — one-tap 解绑 (E30): lifecycle revoke with the fence the owner saw,
 * legacy revoke only when the server has lifecycle v1 off.
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import * as fs from 'fs';
import * as path from 'path';

const apiFetch = jest.fn() as jest.MockedFunction<(path: string, options?: RequestInit) => Promise<any>>;
jest.mock('../api', () => ({
  apiFetch: (p: string, options?: RequestInit) => apiFetch(p, options),
  getApiConfig: () => ({ baseUrl: 'https://api.example.test/api', token: 'tok' }),
}));

import type { HttpRequestV1, HttpResponseV1, HttpTransportV1 } from '../../../shared/client/transport';
import { validateDeviceLifecycleRevokeCommandV1 } from '../../../shared/types/device-lifecycle';

import {
  canRevokeDevice,
  computerPlatformLabel,
  findFocusedDevice,
  deviceDisplayLabel,
  fetchRegisteredDevices,
  lastSeenLabel,
  normalizeComputers,
  normalizeRegisteredDevices,
  revokeMyDevice,
  shortDeviceId,
  type MobileRegisteredDevice,
} from '../myDevices';
import { fourZoneTarget, FOUR_ZONE_STACK_SCREENS } from '../../navigation/four-zone/fourZoneRoutes';

beforeEach(() => apiFetch.mockReset());

const device = (overrides: Record<string, unknown> = {}) => ({
  deviceId: 'desk-1',
  platform: 'darwin',
  appVersion: '0.9.1',
  lastSeenAt: '2026-09-28T09:55:00.000Z',
  ...overrides,
});

describe('computers', () => {
  it('measures "last seen" on the server clock, most recent first, deduplicated', () => {
    const computers = normalizeComputers(
      {
        serverTime: '2026-09-28T10:00:00.000Z',
        devices: [
          device({ deviceId: 'old', platform: 'win32', lastSeenAt: '2026-09-25T10:00:00.000Z' }),
          device(),
          device(),
          device({ deviceId: 'never', lastSeenAt: 'not-a-date' }),
          device({ deviceId: '' }),
        ] as any,
      },
      Date.parse('2030-01-01T00:00:00Z'), // a wrong phone clock does not matter
    );
    expect(computers.map((computer) => computer.deviceId)).toEqual(['desk-1', 'old', 'never']);
    expect(computers[0]).toEqual({ deviceId: 'desk-1', platform: 'macOS', appVersion: '0.9.1', lastSeenAt: '2026-09-28T09:55:00.000Z', lastSeenAgoMs: 5 * 60_000 });
    expect(computers[1].platform).toBe('Windows');
    expect(computers[2]).toMatchObject({ lastSeenAt: null, lastSeenAgoMs: null });
  });

  it('no state means no rows (the screen shows loading or the error, not "none")', () => {
    expect(normalizeComputers(null)).toEqual([]);
    expect(normalizeComputers({ devices: undefined as any, serverTime: '' })).toEqual([]);
  });

  it('labels platforms and strips odd characters', () => {
    expect(computerPlatformLabel('Linux')).toBe('Linux');
    expect(computerPlatformLabel('<script>')).toBe('script');
    expect(computerPlatformLabel(undefined)).toBe('—');
  });

  it('formats last seen', () => {
    expect(lastSeenLabel(30_000, 'zh')).toBe('刚刚');
    expect(lastSeenLabel(5 * 60_000, 'en')).toBe('5 min ago');
    expect(lastSeenLabel(3 * 3_600_000, 'zh')).toBe('3 小时前');
    expect(lastSeenLabel(3 * 86_400_000, 'zh')).toBe('3 天前');
    expect(lastSeenLabel(null, 'zh')).toBe('—');
  });

  it('shortens long ids for display', () => {
    expect(shortDeviceId('dev_0123456789abcdef0123')).toBe('dev_0123…');
    expect(shortDeviceId('desk-1')).toBe('desk-1');
  });
});

describe('hardware devices', () => {
  it('GETs the registry and keeps what the list shows plus the fence', async () => {
    apiFetch.mockResolvedValue({
      items: [
        { device_id: 'dev_a', label: 'Kitchen stick', credential_status: 'active', online: true, last_seen_at: '2026-09-28T09:00:00Z', device_revocation_epoch: '1', credential_revocation_epoch: '1', optimistic_version: '3', credential_version: '1', lifecycle_updated_at: '2026-09-20T00:00:00Z', vendor: 'x', dst: 'SECRET' },
        { device_id: 'dev_a' },
        { device_id: '' },
        { device_id: '../x' },
        { device_id: 'dev_b', credential_status: 'revoked', lifecycle_updated_at: null },
      ],
    });
    const devices = await fetchRegisteredDevices();
    expect(devices).toEqual([
      {
        deviceId: 'dev_a',
        label: 'Kitchen stick',
        status: 'active',
        online: true,
        lastSeenAt: '2026-09-28T09:00:00Z',
        updatedAt: '2026-09-20T00:00:00Z',
        fence: { device_revocation_epoch: '1', credential_revocation_epoch: '1', optimistic_version: '3', credential_version: '1' },
      },
      {
        deviceId: 'dev_b',
        label: null,
        status: 'revoked',
        online: false,
        lastSeenAt: null,
        updatedAt: null,
        fence: { device_revocation_epoch: '', credential_revocation_epoch: '', optimistic_version: '', credential_version: '' },
      },
    ]);
    expect(JSON.stringify(devices)).not.toMatch(/SECRET/);
    expect(apiFetch).toHaveBeenCalledWith('/v1/devices', { method: 'GET' });
  });

  it('never shows an old pairing code as the device name', () => {
    expect(deviceDisplayLabel('482913')).toBeNull();
    expect(deviceDisplayLabel('  Desk lamp \u0007 ')).toBe('Desk lamp');
    expect(deviceDisplayLabel('x'.repeat(80))).toHaveLength(40);
    expect(deviceDisplayLabel(42)).toBeNull();
  });

  it('a failed or malformed read throws instead of returning an empty list', async () => {
    apiFetch.mockRejectedValue(new Error('Server error (502)'));
    await expect(fetchRegisteredDevices()).rejects.toThrow('502');
    apiFetch.mockResolvedValue({ devices: [] });
    await expect(fetchRegisteredDevices()).rejects.toThrow('device_registry_malformed');
    expect(normalizeRegisteredDevices('nope')).toEqual([]);
  });
});

describe('unbind (tightening, E30)', () => {
  const BASE = 'https://api.example.test/api';
  const active = (overrides: Partial<MobileRegisteredDevice> = {}): MobileRegisteredDevice => ({
    deviceId: 'dev_a',
    label: null,
    status: 'active',
    online: true,
    lastSeenAt: null,
    updatedAt: null,
    fence: { device_revocation_epoch: '1', credential_revocation_epoch: '2', optimistic_version: '3', credential_version: '4' },
    ...overrides,
  });
  // Shape after backend's global HttpExceptionFilter (common/filters/http-exception.filter.ts).
  const OFF = { success: false, code: 'ServiceUnavailableException', message: 'device lifecycle v1 disabled', timestamp: '2026-09-28T10:00:00.000Z', path: '/api/v1/devices/dev_a/lifecycle/revoke' };
  type Route = number | 'throw' | { status: number; body: unknown };
  function transport(routes: Record<string, Route>): HttpTransportV1 & { calls: HttpRequestV1[] } {
    const calls: HttpRequestV1[] = [];
    return {
      calls,
      async request(request: HttpRequestV1): Promise<HttpResponseV1> {
        calls.push(request);
        const route = routes[`${request.method} ${request.path.replace(BASE, '')}`];
        if (route === 'throw') throw new Error('offline');
        if (typeof route === 'object') return { status: route.status, headers: {}, body: route.body };
        return { status: route ?? 599, headers: {}, body: {} };
      },
    };
  }
  const now = () => new Date('2026-09-28T10:00:00.000Z');

  it('sends the lifecycle revoke with the fence the owner saw (valid for the shared validator)', async () => {
    const t = transport({ 'POST /v1/devices/dev_a/lifecycle/revoke': 200 });
    await expect(revokeMyDevice(active(), { transport: t, now })).resolves.toEqual({ kind: 'revoked', mode: 'lifecycle' });
    expect(t.calls).toHaveLength(1);
    const body = t.calls[0].body as any;
    expect(validateDeviceLifecycleRevokeCommandV1(body)).toEqual({ valid: true, errors: [] });
    expect(body.reasonCode).toBe('owner_revoke');
    expect(body.expectedFence).toMatchObject({ target: { kind: 'device_registry', deviceId: 'dev_a' }, deviceRevocationEpoch: '1', credentialRevocationEpoch: '2', optimisticVersion: '3', credentialVersion: '4' });
    expect(t.calls[0].headers).toMatchObject({ Authorization: 'Bearer tok', 'X-Agentrix-Surface': 'mobile' });
  });

  it('a stale fence (409) is a conflict: no fallback, no retry', async () => {
    const t = transport({ 'POST /v1/devices/dev_a/lifecycle/revoke': 409, 'DELETE /v1/devices/dev_a': 200 });
    await expect(revokeMyDevice(active(), { transport: t, now })).resolves.toEqual({ kind: 'conflict' });
    expect(t.calls).toHaveLength(1);
  });

  it('only when the server says lifecycle v1 is off does it use the legacy revoke', async () => {
    const t = transport({ 'POST /v1/devices/dev_a/lifecycle/revoke': { status: 503, body: OFF }, 'DELETE /v1/devices/dev_a': 200 });
    await expect(revokeMyDevice(active(), { transport: t, now })).resolves.toEqual({ kind: 'revoked', mode: 'legacy' });
    expect(t.calls.map((call) => call.method)).toEqual(['POST', 'DELETE']);
    const failing = transport({ 'POST /v1/devices/dev_a/lifecycle/revoke': 403, 'DELETE /v1/devices/dev_a': 200 });
    await expect(revokeMyDevice(active(), { transport: failing, now })).resolves.toEqual({ kind: 'failed', reason: 'http_403', retryable: false });
    expect(failing.calls).toHaveLength(1);
    // A proxy / outage 503 is not "lifecycle off".
    const outage = transport({ 'POST /v1/devices/dev_a/lifecycle/revoke': { status: 503, body: '<html>Bad gateway</html>' }, 'DELETE /v1/devices/dev_a': 200 });
    await expect(revokeMyDevice(active(), { transport: outage, now })).resolves.toEqual({ kind: 'failed', reason: 'http_503', retryable: true });
    expect(outage.calls).toHaveLength(1);
  });

  it('reports network and server failures without claiming success', async () => {
    await expect(revokeMyDevice(active(), { transport: transport({ 'POST /v1/devices/dev_a/lifecycle/revoke': 'throw' }), now })).resolves.toEqual({ kind: 'failed', reason: 'network', retryable: true });
    await expect(revokeMyDevice(active(), { transport: transport({ 'POST /v1/devices/dev_a/lifecycle/revoke': 500 }), now })).resolves.toEqual({ kind: 'failed', reason: 'http_500', retryable: true });
    await expect(
      revokeMyDevice(active(), { transport: transport({ 'POST /v1/devices/dev_a/lifecycle/revoke': { status: 503, body: OFF }, 'DELETE /v1/devices/dev_a': 500 }), now }),
    ).resolves.toEqual({ kind: 'failed', reason: 'legacy_http_500', retryable: true });
  });

  it('sends nothing for a device that is already unbound, has no complete fence, or without a token', async () => {
    const t = transport({ 'POST /v1/devices/dev_a/lifecycle/revoke': 200 });
    for (const device of [active({ status: 'revoked' }), active({ status: 'retired' }), active({ fence: { ...active().fence, optimistic_version: '' } })]) {
      expect(canRevokeDevice(device)).toBe(false);
      await expect(revokeMyDevice(device, { transport: t, now })).resolves.toEqual({ kind: 'blocked', reason: 'not_revocable' });
    }
    await expect(revokeMyDevice(active(), { transport: t, now, token: '' })).resolves.toEqual({ kind: 'blocked', reason: 'authentication_required' });
    expect(t.calls).toHaveLength(0);
  });
});

describe('device_paired push focus (E30)', () => {
  const list = normalizeRegisteredDevices([
    { device_id: 'dev_a', device_revocation_epoch: '1', credential_revocation_epoch: '1', optimistic_version: '1', credential_version: '1' },
    { device_id: 'dev_b', device_revocation_epoch: '1', credential_revocation_epoch: '1', optimistic_version: '1', credential_version: '1' },
  ]);

  it('highlights only an exact match from the backend list', () => {
    expect(findFocusedDevice(list, 'dev_b')?.deviceId).toBe('dev_b');
    expect(findFocusedDevice(list, 'dev_c')).toBeNull();
    expect(findFocusedDevice(list, 'DEV_B')).toBeNull();
    expect(findFocusedDevice(list, '../dev_b')).toBeNull();
    expect(findFocusedDevice(list, undefined)).toBeNull();
    expect(findFocusedDevice([], 'dev_a')).toBeNull();
  });

  it('the screen reads the ref only through findFocusedDevice', () => {
    const screen = fs.readFileSync(path.resolve(__dirname, '..', '..', 'screens', 'four-zone', 'MyDevicesScreen.tsx'), 'utf8');
    expect(screen).toMatch(/findFocusedDevice\(hardware, route\.params\?\.ref\)/);
    expect(screen.match(/route\.params/g)).toHaveLength(1);
  });
});

describe('wiring', () => {
  it('my/devices opens the device list, registered in the My stack', () => {
    expect(fourZoneTarget('my', 'devices')).toEqual({ tab: 'My', screen: 'MyDevices' });
    expect(FOUR_ZONE_STACK_SCREENS.My).toContain('MyDevices');
    const stack = fs.readFileSync(path.resolve(__dirname, '..', '..', 'navigation', 'MeStackNavigator.tsx'), 'utf8');
    expect(stack).toMatch(/<Stack\.Screen name="MyDevices" component=\{MyDevicesScreen\}/);
  });

  it('the screen writes only through revokeMyDevice; pairing and wearables stay on their screens', () => {
    const screen = fs.readFileSync(path.resolve(__dirname, '..', '..', 'screens', 'four-zone', 'MyDevicesScreen.tsx'), 'utf8');
    expect(screen).not.toMatch(/pairDevice|unpairDevice|apiFetch|method: 'POST'/);
    // Unbind only through the service, only when allowed, and the list is re-read afterwards.
    expect(screen).toMatch(/canRevokeDevice\(device\) \? \(/);
    expect(screen).toMatch(/revokeMyDevice\(device\)/);
    expect(screen).toMatch(/onSettled: \(\) => void queryClient\.invalidateQueries\(\{ queryKey: registryKey \}\)/);
    expect(screen).toMatch(/navigation\.navigate\('ToyBinding'\)/);
    expect(screen).toMatch(/navigation\.navigate\('WearableHub'\)/);
  });
});
