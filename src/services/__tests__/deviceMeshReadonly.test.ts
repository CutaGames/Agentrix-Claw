/**
 * The owner's devices and rental earnings, read-only on the phone (deviceMeshReadonly.ts).
 * Closed (404) and unreadable are told apart; only what the shared decoders accept is shown; earnings keep only
 * completed seller jobs and are totalled here; the flag is off unless exactly 1.
 */
import { describe, it, expect, jest } from '@jest/globals';
import type { HttpRequestV1, HttpResponseV1, HttpTransportV1 } from '../../../shared/client/transport';
import { isDeviceMeshReadonlyEnabled, readMyDevices, readRentalEarnings } from '../deviceMeshReadonly';

const NOW = new Date('2026-10-03T06:00:00.000Z');
const BASE = 'https://api.agentrix.top/api/';

const declaration = {
  schemaVersion: 0,
  declarationId: '33333333-4444-4555-8666-777777777777',
  deviceId: 'dev_mac_1',
  kind: 'desktop',
  shellBindingRef: { type: 'shell_session_binding', id: '22222222-3333-4444-8555-666666666666', version: 2 },
  attestedBy: 'device_key',
  signerRef: 'dsc_key_1',
  items: [{ type: 'llm.generate.v1', category: 'compute', state: 'available', limits: { maxOutputTokens: 1024 } }],
  conditions: { onPower: true, thermalOk: true, idle: true },
  observedAt: '2026-10-03T05:59:00Z',
  expiresAt: '2026-10-03T06:10:00Z',
};

const job = (overrides: Record<string, unknown> = {}) => ({
  schemaVersion: 0, jobRef: `drj_${'b'.repeat(32)}`, offerRef: `dro_${'a'.repeat(32)}`, role: 'seller', capabilityType: 'llm.generate.v1', unit: 'job',
  priceCentsPerUnit: 25, maxUnits: 2, maxAmountCents: 50, status: 'completed', escrowState: 'released', unitsUsed: 1, amountCents: 25,
  resultDigest: `sha256:${'c'.repeat(64)}`, output: null, createdAt: '2026-10-03T05:00:00Z', finishedAt: '2026-10-03T05:01:00Z', ...overrides,
});

function transport(answer: Partial<HttpResponseV1> | Error) {
  const requests: HttpRequestV1[] = [];
  const t: HttpTransportV1 & { requests: HttpRequestV1[] } = {
    requests,
    request: jest.fn(async (request: HttpRequestV1) => {
      requests.push(request);
      if (answer instanceof Error) throw answer;
      return { status: 200, headers: {}, body: undefined, ...answer } as HttpResponseV1;
    }) as never,
  };
  return t;
}

describe('deviceMeshReadonly', () => {
  it('reads my devices with my token; expired or malformed declarations are dropped', async () => {
    const t = transport({ body: { items: [declaration, { ...declaration, expiresAt: '2026-10-03T05:00:00Z' }, { nope: true }] } });
    const result = await readMyDevices(t, BASE, 'tok', NOW);
    expect(result).toEqual({ kind: 'ready', value: [declaration] });
    expect(t.requests[0]).toMatchObject({ method: 'GET', path: 'https://api.agentrix.top/api/device-mesh/devices', headers: { Authorization: 'Bearer tok' } });
  });

  it('closed, a server error, a network error and a non-list read differently from an empty list', async () => {
    expect(await readMyDevices(transport({ status: 404 }), BASE, 'tok', NOW)).toEqual({ kind: 'closed' });
    expect(await readMyDevices(transport({ status: 500 }), BASE, 'tok', NOW)).toEqual({ kind: 'unreadable' });
    expect(await readMyDevices(transport(new Error('offline')), BASE, 'tok', NOW)).toEqual({ kind: 'unreadable' });
    expect(await readMyDevices(transport({ body: { nope: [] } }), BASE, 'tok', NOW)).toEqual({ kind: 'unreadable' });
    expect(await readMyDevices(transport({ body: { items: [] } }), BASE, null, NOW)).toEqual({ kind: 'ready', value: [] });
  });

  it('earnings keep completed seller jobs only and are totalled here', async () => {
    const t = transport({ body: { items: [job(), job({ jobRef: `drj_${'d'.repeat(32)}`, amountCents: 50, unitsUsed: 2 }), job({ role: 'buyer' }), job({ status: 'failed', amountCents: 0, unitsUsed: 0 }), { junk: 1 }] } });
    const result = await readRentalEarnings(t, BASE, 'tok');
    expect(result.kind).toBe('ready');
    const value = (result as { value: { items: unknown[]; totalCents: number } }).value;
    expect(value.items).toHaveLength(2);
    expect(value.totalCents).toBe(75);
    expect(t.requests[0].path).toBe('https://api.agentrix.top/api/device-rental/earnings');
  });

  it('the flag is off unless exactly 1', () => {
    expect(isDeviceMeshReadonlyEnabled({ EXPO_PUBLIC_DEVICE_MESH_ENABLED: '1' })).toBe(true);
    expect(isDeviceMeshReadonlyEnabled({ EXPO_PUBLIC_DEVICE_MESH_ENABLED: 'true' })).toBe(false);
    expect(isDeviceMeshReadonlyEnabled({})).toBe(false);
  });
});
