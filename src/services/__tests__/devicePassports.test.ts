/**
 * L7-4 v0 device passports on the phone (devicePassports.ts): one GET through the shared decoder, read only.
 */
import { describe, it, expect, jest } from '@jest/globals';
import * as fs from 'fs';
import * as path from 'path';
import type { HttpRequestV1, HttpResponseV1, HttpTransportV1 } from '../../../shared/client/transport';
import { devicePassportV0, type DevicePassportV0 } from '../../../shared/types/device-market';
import {
  devicePassportJobsText,
  devicePassportServicesText,
  isDevicePassportsEnabled,
  readDevicePassports,
} from '../devicePassports';

const BASE = 'https://api.agentrix.top/api/';

const gadget: DevicePassportV0 = devicePassportV0(
  {
    schemaVersion: 0,
    declarationId: '33333333-4444-4555-8666-777777777777',
    deviceId: 'dev_gadget_1',
    kind: 'hardware',
    shellBindingRef: { type: 'shell_session_binding', id: '22222222-3333-4444-8555-666666666666', version: 1 },
    attestedBy: 'device_key',
    signerRef: 'dsc_key_1',
    items: [
      { type: 'gadget.display.v1', category: 'actuator', state: 'available', limits: {} },
      { type: 'hardware.print.v1', category: 'actuator', state: 'busy', limits: {} },
      { type: 'llm.generate.v1', category: 'compute', state: 'available', limits: {} },
    ],
    conditions: { onPower: true, thermalOk: null, idle: null },
    observedAt: '2026-10-05T08:55:00Z',
    expiresAt: '2026-10-05T09:10:00Z',
  } as never,
  { completed: 3, failed: 1 },
);

function transport(status: number, body: unknown, fail = false) {
  const calls: HttpRequestV1[] = [];
  const t: HttpTransportV1 = {
    request: jest.fn(async (req: HttpRequestV1): Promise<HttpResponseV1> => {
      calls.push(req);
      if (fail) throw new Error('offline');
      return { status, headers: {}, body } as HttpResponseV1;
    }) as never,
  };
  return { t, calls };
}

describe('device passports (L7-4 v0)', () => {
  it('is on only when the build sets exactly 1', () => {
    expect(isDevicePassportsEnabled({ EXPO_PUBLIC_DEVICE_MARKET_ENABLED: '1' })).toBe(true);
    for (const v of [undefined, '', '0', 'true']) expect(isDevicePassportsEnabled({ EXPO_PUBLIC_DEVICE_MARKET_ENABLED: v })).toBe(false);
  });

  it('GETs the passports with the session token and reads them with the shared decoder', async () => {
    const { t, calls } = transport(200, { passports: [gadget] });
    await expect(readDevicePassports(t, BASE, 'tok')).resolves.toEqual({ kind: 'ready', value: [gadget] });
    expect(calls[0]).toMatchObject({ method: 'GET', path: 'https://api.agentrix.top/api/device-market/passports' });
    expect(calls[0].headers?.Authorization).toBe('Bearer tok');
  });

  it('404 is closed; anything else, a broken passport, a network error or no session is unreadable', async () => {
    await expect(readDevicePassports(transport(404, null).t, BASE, 'tok')).resolves.toEqual({ kind: 'closed' });
    await expect(readDevicePassports(transport(500, null).t, BASE, 'tok')).resolves.toEqual({ kind: 'unreadable' });
    await expect(readDevicePassports(transport(200, { passports: [{ ...gadget, reputation: 9 }] }).t, BASE, 'tok')).resolves.toEqual({ kind: 'unreadable' });
    await expect(readDevicePassports(transport(200, null, true).t, BASE, 'tok')).resolves.toEqual({ kind: 'unreadable' });
    const signedOut = transport(200, { passports: [] });
    await expect(readDevicePassports(signedOut.t, BASE, null)).resolves.toEqual({ kind: 'unreadable' });
    expect(signedOut.calls).toHaveLength(0);
  });

  it('says which market services the device offers, which ask the owner each time, and its jobs', () => {
    expect(devicePassportServicesText(gadget, 'zh')).toBe('显示 · 打印（每次先问你）（忙）');
    expect(devicePassportServicesText(gadget, 'en')).toBe('Display · Printing (asks you each time) (busy)');
    expect(devicePassportServicesText({ ...gadget, marketServices: [] }, 'zh')).toBeNull();
    expect(devicePassportJobsText(gadget, 'zh')).toBe('完成 3 单 · 失败 1 单 · 信誉 2');
    expect(devicePassportJobsText(gadget, 'en')).toBe('3 done · 1 failed · reputation 2');
  });

  it('the screen shows it only behind the build switch and never writes', () => {
    const screen = fs.readFileSync(path.resolve(__dirname, '..', '..', 'screens', 'four-zone', 'MyDevicesScreen.tsx'), 'utf8');
    expect(screen).toContain('{passportsOn ? (');
    expect(screen).toContain('enabled: signedIn && passportsOn,');
    const service = fs.readFileSync(path.resolve(__dirname, '..', 'devicePassports.ts'), 'utf8');
    expect(service).not.toMatch(/method: '(POST|PUT|DELETE)'|from 'react-native'/);
  });
});
