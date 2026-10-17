/**
 * M3 device pairing (2026-09-27) — ble.service goes through the shared
 * DeviceRegistry client (`shared/types/device-lifecycle-client.ts`):
 * ticket -> pair with a requestId, list, and a fenced lifecycle revoke.
 * Port of recovery/wip/mobile-device-lifecycle 5c94aeda plus guards.
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';

const apiFetch = jest.fn() as jest.MockedFunction<
  (path: string, options?: RequestInit) => Promise<any>
>;
jest.mock('../api', () => ({
  apiFetch: (p: string, options?: RequestInit) => apiFetch(p, options),
}));
jest.mock('react-native-ble-plx', () => ({
  BleManager: class {},
  State: { PoweredOn: 'PoweredOn' },
}));
jest.mock('react-native', () => ({
  Platform: { OS: 'android', Version: 34 },
  PermissionsAndroid: { PERMISSIONS: {}, RESULTS: { GRANTED: 'granted' }, requestMultiple: jest.fn() },
}));

import { checkDeviceOta, getPairedDevices, pairDevice, unpairDevice } from '../ble.service';
import { DEVICE_REGISTRY_PATHS } from '../../../shared/types/device-lifecycle-client';

const LIST_ITEM = {
  device_id: 'AA:BB:CC:DD:EE:FF',
  device_revocation_epoch: '3',
  credential_revocation_epoch: '1',
  optimistic_version: '7',
  credential_version: '2',
};

function bodyOf(call: number): any {
  return JSON.parse(String(apiFetch.mock.calls[call][1]?.body ?? '{}'));
}

beforeEach(() => apiFetch.mockReset());

describe('pairDevice', () => {
  it('mints a ticket, then pairs with a request id; the code is never sent or shown', async () => {
    apiFetch
      .mockResolvedValueOnce({ ticket: 'tkt_123', expires_at: '2026-09-27T12:05:00Z' })
      .mockResolvedValueOnce({ device: { ...LIST_ITEM, device_class: 'claw_stick', firmware_version: '1.4.0' }, dst: 'dst-secret' });

    const result = await pairDevice('AA:BB:CC:DD:EE:FF', '482915');

    expect(apiFetch.mock.calls.map(([p, o]) => [p, o?.method])).toEqual([
      [DEVICE_REGISTRY_PATHS.ticket, 'POST'],
      [DEVICE_REGISTRY_PATHS.pair, 'POST'],
    ]);
    const body = bodyOf(1);
    expect(body).toMatchObject({
      ticket: 'tkt_123',
      device_id: 'AA:BB:CC:DD:EE:FF',
      label: 'AA:BB:CC:DD:EE:FF',
      device_class: 'claw_stick',
    });
    expect(body.request_id).toMatch(/^dlc_[A-Za-z0-9]+$/);
    expect(JSON.stringify(body)).not.toContain('482915');
    expect(result).toEqual({
      success: true,
      device: { id: 'AA:BB:CC:DD:EE:FF', name: 'AA:BB:CC:DD:EE:FF', type: 'claw_stick', firmwareVersion: '1.4.0' },
    });
    expect(JSON.stringify(result)).not.toContain('dst-secret');
  });

  it.each([
    ['', '482915', 'invalid_device_id'],
    ['../../v1/admin', '482915', 'invalid_device_id'],
    ['dev id', '482915', 'invalid_device_id'],
    ['AA:BB', '', 'invalid_pairing_code'],
    ['AA:BB', '12345', 'invalid_pairing_code'],
    ['AA:BB', '12345a', 'invalid_pairing_code'],
  ])('refuses %p / %p before any request (%s)', async (deviceId, code, error) => {
    await expect(pairDevice(deviceId, code)).resolves.toEqual({ success: false, error });
    expect(apiFetch).not.toHaveBeenCalled();
  });

  it('surfaces a registry refusal (e.g. device owned by another user)', async () => {
    apiFetch.mockResolvedValueOnce({ ticket: 'tkt_1' }).mockRejectedValueOnce(new Error('device already paired to another user'));
    await expect(pairDevice('AA:BB', '482915')).rejects.toThrow('device already paired to another user');
  });
});

describe('getPairedDevices / unpairDevice', () => {
  it('lists from the registry', async () => {
    apiFetch.mockResolvedValueOnce({ items: [LIST_ITEM] });
    await expect(getPairedDevices()).resolves.toEqual([
      { id: 'AA:BB:CC:DD:EE:FF', name: 'AA:BB:CC:DD:EE:FF', type: 'claw_stick', firmwareVersion: '' },
    ]);
    expect(apiFetch.mock.calls[0][0]).toBe(DEVICE_REGISTRY_PATHS.list);
  });

  it('degrades to an empty list when the registry is unavailable', async () => {
    apiFetch.mockRejectedValueOnce(new Error('503'));
    await expect(getPairedDevices()).resolves.toEqual([]);
  });

  it('revokes with the versioned lifecycle command and the current fence, never DELETE', async () => {
    apiFetch.mockResolvedValueOnce({ items: [LIST_ITEM] }).mockResolvedValueOnce({ receipt: {} });
    await unpairDevice('AA:BB:CC:DD:EE:FF');
    const [p, options] = apiFetch.mock.calls[1];
    expect(p).toBe(DEVICE_REGISTRY_PATHS.revokeLifecycle('AA:BB:CC:DD:EE:FF'));
    expect(options?.method).toBe('POST');
    const command = bodyOf(1);
    expect(command.reasonCode).toBe('owner_revoke');
    expect(command.requestId).toMatch(/^dlc_/);
    expect(command.expectedFence).toMatchObject({
      target: { kind: 'device_registry', deviceId: 'AA:BB:CC:DD:EE:FF' },
      deviceRevocationEpoch: '3',
      credentialRevocationEpoch: '1',
      optimisticVersion: '7',
      credentialVersion: '2',
    });
    expect(apiFetch.mock.calls.some(([, o]) => o?.method === 'DELETE')).toBe(false);
  });

  it('does nothing for a device that is not in the registry', async () => {
    apiFetch.mockResolvedValueOnce({ items: [] });
    await unpairDevice('AA:BB:CC:DD:EE:FF');
    expect(apiFetch).toHaveBeenCalledTimes(1);
  });
});

describe('checkDeviceOta', () => {
  it('reads the registry OTA manifest for the device class', async () => {
    apiFetch.mockResolvedValueOnce({ available: false });
    await checkDeviceOta('AA:BB');
    expect(apiFetch.mock.calls[0][0]).toBe('/v1/ota/manifest?device_class=claw_stick');
  });
});
