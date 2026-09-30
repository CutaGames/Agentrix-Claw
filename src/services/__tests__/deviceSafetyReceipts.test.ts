/**
 * Device-safety receipts on the phone (contract v1, `shared/types/device-safety-event.ts`;
 * REQ-backend-047, REQ-desktop-010): read-only, under each computer in 事项 → 电脑上.
 * Negatives run every time: only one GET is ever sent; an entry whose digest does not match its
 * event is never shown, not even in part; "within 3 seconds" is said only when the computer said
 * `withinBudget: true`.
 */
import { describe, it, expect } from '@jest/globals';
import * as fs from 'fs';
import * as path from 'path';
import type { HttpRequestV1, HttpResponseV1, HttpTransportV1 } from '../../../shared/client/transport';
import {
  DEVICE_SAFETY_EVENT_ORIGINS,
  DEVICE_SAFETY_EVENT_SCHEMA_VERSION,
  deviceSafetyEventDigestV1,
  type DeviceSafetyEventReceiptV1,
  type DeviceSafetyEventV1,
} from '../../../shared/types/device-safety-event';
import {
  DEVICE_SAFETY_RECEIPTS_PER_COMPUTER,
  decodeDeviceSafetyReceiptsBody,
  describeDeviceSafetyReceipt,
  describeDeviceSafetyReceiptsProblem,
  deviceSafetyReceiptsPath,
  groupDeviceSafetyReceipts,
  readDeviceSafetyReceipts,
  type DeviceSafetyReceiptsRead,
} from '../deviceSafetyReceipts';

const BASE = 'https://api.example.test/api';
const LIST = '/v1/device-safety-events?limit=50';
const base = { baseUrl: BASE, token: 'tok' };

type Route = { status: number; body: unknown } | 'throw';
function transport(routes: Record<string, Route>): HttpTransportV1 & { calls: HttpRequestV1[] } {
  const calls: HttpRequestV1[] = [];
  return {
    calls,
    async request(request: HttpRequestV1): Promise<HttpResponseV1> {
      calls.push(request);
      const route = routes[`${request.method} ${request.path.replace(BASE, '')}`];
      if (!route) return { status: 599, headers: {}, body: undefined };
      if (route === 'throw') throw new Error('offline');
      return { status: route.status, headers: {}, body: route.body };
    },
  };
}

let seq = 0;
function eventOf(overrides: Partial<DeviceSafetyEventV1> = {}): DeviceSafetyEventV1 {
  seq += 1;
  return {
    id: `es-1790000000000-${seq}`,
    kind: 'engaged',
    at: '2026-09-29T08:00:00.000Z',
    origin: 'tray',
    approvalsRejected: 2,
    nativeGate: 'confirmed',
    runtime: 'confirmed',
    settledAfterMs: 420,
    withinBudget: true,
    ...overrides,
  };
}
function receiptJson(deviceId: string, raw: DeviceSafetyEventV1, overrides: Record<string, unknown> = {}) {
  const hex = String(seq).padStart(32, '0');
  // As it arrives over the wire: absent fields are left out.
  const event = JSON.parse(JSON.stringify(raw)) as DeviceSafetyEventV1;
  return {
    schemaVersion: DEVICE_SAFETY_EVENT_SCHEMA_VERSION,
    receiptRef: `dse_${hex}`,
    deviceId,
    event,
    eventDigest: deviceSafetyEventDigestV1(event),
    verifiedBy: 'device_signature',
    recordedAt: '2026-09-29T08:00:05.000Z',
    ...overrides,
  };
}
function ready(read: DeviceSafetyReceiptsRead) {
  if (read.kind !== 'ready') throw new Error(`expected ready, got ${JSON.stringify(read)}`);
  return read;
}

describe('readDeviceSafetyReceipts', () => {
  it('sends exactly one GET with the owner token, and decodes the Nest envelope', async () => {
    const engaged = receiptJson('desk-a', eventOf({ at: '2026-09-29T08:00:00.000Z' }));
    const released = receiptJson('desk-a', eventOf({ kind: 'released', at: '2026-09-29T08:10:00.000Z', runtime: undefined, approvalsRejected: undefined }));
    const http = transport({ [`GET ${LIST}`]: { status: 200, body: { success: true, data: { items: [released, engaged] } } } });
    const read = ready(await readDeviceSafetyReceipts({ ...base, transport: http }));
    expect(http.calls).toHaveLength(1);
    expect(http.calls[0]).toMatchObject({ method: 'GET', path: `${BASE}${LIST}` });
    expect(http.calls[0].body).toBeUndefined();
    expect(http.calls[0].headers?.Authorization).toBe('Bearer tok');
    expect(read.receipts.map((receipt) => receipt.event.kind)).toEqual(['released', 'engaged']);
    expect(read.unreadable).toEqual([]);
  });

  it('never sends without a token', async () => {
    const http = transport({});
    expect(await readDeviceSafetyReceipts({ baseUrl: BASE, token: '', transport: http })).toEqual({ kind: 'unavailable', reason: 'authentication_required' });
    expect(http.calls).toHaveLength(0);
  });

  it('maps failures without inventing a list', async () => {
    const cases: Array<[Route, DeviceSafetyReceiptsRead]> = [
      [{ status: 503, body: { code: 'device_safety_unavailable', message: 'device signing is not enabled' } }, { kind: 'unavailable', reason: 'not_enabled' }],
      [{ status: 500, body: { message: { code: 'device_safety_unavailable' } } }, { kind: 'unavailable', reason: 'not_enabled' }],
      [{ status: 401, body: { message: 'Unauthorized' } }, { kind: 'unavailable', reason: 'authentication_required' }],
      [{ status: 403, body: { message: 'Forbidden' } }, { kind: 'unavailable', reason: 'authentication_required' }],
      [{ status: 500, body: {} }, { kind: 'error', reason: 'http_500', retryable: true }],
      [{ status: 429, body: {} }, { kind: 'error', reason: 'http_429', retryable: true }],
      [{ status: 400, body: { code: 'odd' } }, { kind: 'error', reason: 'odd', retryable: false }],
      [{ status: 200, body: { data: { items: 'nope' } } }, { kind: 'error', reason: 'response_malformed', retryable: false }],
      [{ status: 200, body: null }, { kind: 'error', reason: 'response_malformed', retryable: false }],
      ['throw', { kind: 'error', reason: 'network', retryable: true }],
    ];
    for (const [route, expected] of cases) {
      const http = transport({ [`GET ${LIST}`]: route });
      expect(await readDeviceSafetyReceipts({ ...base, transport: http })).toEqual(expected);
    }
  });
});

describe('decodeDeviceSafetyReceiptsBody', () => {
  it('drops an entry whose digest does not match its event, keeping only the computer it names', () => {
    const good = receiptJson('desk-a', eventOf());
    const tamperedEvent = eventOf({ approvalsRejected: 0 });
    const tampered = receiptJson('desk-b', tamperedEvent, { eventDigest: deviceSafetyEventDigestV1({ ...tamperedEvent, approvalsRejected: 9 }) });
    const read = ready(decodeDeviceSafetyReceiptsBody({ items: [good, tampered] })!);
    expect(read.receipts.map((receipt) => receipt.deviceId)).toEqual(['desk-a']);
    expect(read.unreadable).toEqual([{ deviceId: 'desk-b', reason: 'eventDigest' }]);
  });

  it('refuses events the contract refuses (bad fields, claimed budget without a confirmed gate)', () => {
    const extra = receiptJson('desk-a', { ...eventOf(), command: 'rm -rf /' } as unknown as DeviceSafetyEventV1);
    const contradiction = receiptJson('desk-a', eventOf({ nativeGate: 'not_confirmed', withinBudget: true }));
    const releasedRuntime = receiptJson('desk-a', eventOf({ kind: 'released', runtime: 'confirmed' }));
    const noDevice = { ...receiptJson('x', eventOf()), deviceId: '../etc' };
    const read = ready(decodeDeviceSafetyReceiptsBody({ items: [extra, contradiction, releasedRuntime, noDevice, 'junk'] })!);
    expect(read.receipts).toEqual([]);
    expect(read.unreadable).toEqual([
      { deviceId: 'desk-a', reason: 'event' },
      { deviceId: 'desk-a', reason: 'event' },
      { deviceId: 'desk-a', reason: 'event' },
      { deviceId: null, reason: 'deviceId' },
      { deviceId: null, reason: 'schema' },
    ]);
  });

  it('shows the same receipt once and sorts newest first regardless of server order', () => {
    const older = receiptJson('desk-a', eventOf({ at: '2026-09-29T07:00:00.000Z' }));
    const newer = receiptJson('desk-a', eventOf({ at: '2026-09-29T09:00:00.000Z' }));
    const read = ready(decodeDeviceSafetyReceiptsBody({ items: [older, newer, older] })!);
    expect(read.receipts.map((receipt) => receipt.event.at)).toEqual(['2026-09-29T09:00:00.000Z', '2026-09-29T07:00:00.000Z']);
  });

  it('reads at most the contract maximum', () => {
    expect(deviceSafetyReceiptsPath()).toBe(LIST);
    expect(deviceSafetyReceiptsPath(500)).toBe(LIST);
    expect(deviceSafetyReceiptsPath(0)).toBe('/v1/device-safety-events?limit=1');
    const items = Array.from({ length: 60 }, (_, index) => receiptJson('desk-a', eventOf({ at: new Date(Date.UTC(2026, 8, 29, 0, index)).toISOString() })));
    expect(ready(decodeDeviceSafetyReceiptsBody({ items })!).receipts).toHaveLength(50);
  });
});

describe('groupDeviceSafetyReceipts', () => {
  it('puts the page’s computers first, then other computers by newest receipt, then entries naming no computer', () => {
    const a = receiptJson('desk-a', eventOf({ at: '2026-09-29T08:00:00.000Z' }));
    const other1 = receiptJson('desk-old', eventOf({ at: '2026-09-29T06:00:00.000Z' }));
    const other2 = receiptJson('desk-new', eventOf({ at: '2026-09-29T10:00:00.000Z' }));
    const read = ready(decodeDeviceSafetyReceiptsBody({ items: [a, other1, other2, { deviceId: 'desk-b' }, { deviceId: 42 }] })!);
    const groups = groupDeviceSafetyReceipts(read, ['desk-b', 'desk-a', 'desk-c']);
    expect(groups.map((group) => [group.deviceId, group.listed, group.receipts.length, group.unreadable])).toEqual([
      ['desk-b', true, 0, 1],
      ['desk-a', true, 1, 0],
      ['desk-c', true, 0, 0],
      ['desk-new', false, 1, 0],
      ['desk-old', false, 1, 0],
      [null, false, 0, 1],
    ]);
  });

  it('lists the newest few per computer and counts the rest', () => {
    const items = Array.from({ length: DEVICE_SAFETY_RECEIPTS_PER_COMPUTER + 3 }, (_, index) =>
      receiptJson('desk-a', eventOf({ at: new Date(Date.UTC(2026, 8, 29, 1, index)).toISOString() })),
    );
    const [group] = groupDeviceSafetyReceipts(ready(decodeDeviceSafetyReceiptsBody({ items })!), ['desk-a']);
    expect(group.receipts).toHaveLength(DEVICE_SAFETY_RECEIPTS_PER_COMPUTER);
    expect(group.more).toBe(3);
    expect(group.receipts[0].event.at).toBe(new Date(Date.UTC(2026, 8, 29, 1, DEVICE_SAFETY_RECEIPTS_PER_COMPUTER + 2)).toISOString());
  });
});

describe('describeDeviceSafetyReceipt', () => {
  const decode = (event: DeviceSafetyEventV1): DeviceSafetyEventReceiptV1 => ready(decodeDeviceSafetyReceiptsBody({ items: [receiptJson('desk-a', event)] })!).receipts[0];

  it('says "within 3 seconds" only when the computer said so', () => {
    const within = describeDeviceSafetyReceipt(decode(eventOf({ settledAfterMs: 420, withinBudget: true })));
    expect(within.title.zh).toBe('电脑急停了');
    expect(within.budget?.zh).toBe('420 ms 内生效（3 秒内）');
    expect(within.budgetTone).toBe('ok');
    expect(within.approvalsRejected?.zh).toBe('同时拒绝了 2 个待审批');
    expect(within.gates.map((gate) => gate.zh)).toEqual(['电脑侧闸门已确认', '本机运行时撤销已确认']);

    const slow = describeDeviceSafetyReceipt(decode(eventOf({ settledAfterMs: 4200, withinBudget: false, runtime: 'not_confirmed' })));
    expect(slow.budget?.zh).toBe('用时 4200 ms，没有在 3 秒内全部确认');
    expect(slow.budgetTone).toBe('warn');
    expect(slow.gates.map((gate) => gate.zh)).toEqual(['电脑侧闸门已确认', '本机运行时撤销未确认']);

    // Settled in time but the computer did not claim the budget (for example a gate it could not read).
    const unclaimed = describeDeviceSafetyReceipt(decode(eventOf({ settledAfterMs: 800, withinBudget: undefined, nativeGate: 'unavailable' })));
    expect(unclaimed.budget?.zh).toBe('用时 800 ms，没有在 3 秒内全部确认');
    expect(unclaimed.gates[0].zh).toBe('电脑侧闸门读不到');

    const unknown = describeDeviceSafetyReceipt(decode(eventOf({ settledAfterMs: undefined, withinBudget: undefined, runtime: undefined, approvalsRejected: 0 })));
    expect(unknown.budget?.zh).toBe('没有在 3 秒内确认');
    expect(unknown.budgetTone).toBe('warn');
    expect(unknown.approvalsRejected).toBeNull();
    expect(unknown.gates).toHaveLength(1);
  });

  it('a release has no budget line when it has no timing, and never lists rejected approvals', () => {
    const released = describeDeviceSafetyReceipt(decode(eventOf({ kind: 'released', runtime: undefined, settledAfterMs: undefined, withinBudget: undefined, approvalsRejected: 3, origin: 'settings' })));
    expect(released.title.zh).toBe('急停解除了');
    expect(released.budget).toBeNull();
    expect(released.budgetTone).toBeNull();
    expect(released.approvalsRejected).toBeNull();
    expect(released.origin.zh).toBe('来源：设置');
  });

  it('names every origin in the contract and keeps the reason as sent', () => {
    for (const origin of DEVICE_SAFETY_EVENT_ORIGINS) {
      const line = describeDeviceSafetyReceipt(decode(eventOf({ origin, reason: '离开座位' })));
      expect(line.origin.zh).toMatch(/^来源：\S/);
      expect(line.origin.zh).not.toContain(origin);
      expect(line.origin.en).toMatch(/^From: \S/);
      expect(line.reason).toBe('离开座位');
    }
  });

  it('says why there is no list', () => {
    expect(describeDeviceSafetyReceiptsProblem({ kind: 'unavailable', reason: 'not_enabled' }).zh).toBe('急停回执还没有开通。');
    expect(describeDeviceSafetyReceiptsProblem({ kind: 'unavailable', reason: 'authentication_required' }).zh).toBe('请重新登录后查看急停回执。');
    expect(describeDeviceSafetyReceiptsProblem({ kind: 'error', reason: 'network', retryable: true }).zh).toBe('急停回执暂时读不到，下拉重试。');
    expect(describeDeviceSafetyReceiptsProblem({ kind: 'error', reason: 'response_malformed', retryable: false }).zh).toBe('急停回执读不到。');
  });
});

describe('screen wiring (事项 → 电脑上)', () => {
  const screen = fs.readFileSync(path.join(__dirname, '../../screens/agent/DesktopControlScreen.tsx'), 'utf8');
  const service = fs.readFileSync(path.join(__dirname, '../deviceSafetyReceipts.ts'), 'utf8');

  it('reads receipts through the service and never writes them', () => {
    expect(screen).toContain('readDeviceSafetyReceipts()');
    expect(screen).toContain('groupDeviceSafetyReceipts(safety, devices.map((device) => device.deviceId))');
    expect(screen).not.toMatch(/device-safety-events/);
    // The service has one request, and it is a GET.
    expect(service.match(/transport\.request\(/g)).toHaveLength(1);
    expect(service).toMatch(/transport\.request\(\{ method: 'GET'/);
    expect(service).not.toMatch(/method: '(POST|PUT|PATCH|DELETE)'/);
  });

  it('a failed page read is said on the page, never in a dialog (the 5 s poll would raise one every 5 s)', () => {
    const start = screen.indexOf('const loadState = useCallback(');
    const load = screen.slice(start, screen.indexOf('useEffect(() => {', start));
    expect(load.length).toBeGreaterThan(100);
    expect(load).toContain('setLoadFailed(true)');
    expect(load).not.toContain('Alert.alert');
    expect(screen).toContain('testID="desktop-control-load-error"');
  });

  it('does not put the receipts on the 5 second poll', () => {
    const poll = screen.slice(screen.indexOf('const timer = setInterval('), screen.indexOf('return () => clearInterval(timer);'));
    expect(poll).not.toContain('loadSafety');
  });
});
