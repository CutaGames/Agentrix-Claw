/**
 * deviceSafetyReceipts — the owner's emergency-stop receipts from their computers, on the phone
 * (device-safety event contract v1, `shared/types/device-safety-event.ts`; REQ-desktop-010,
 * REQ-backend-047; product doc 6.6 desktop D2: "the stop takes effect within 3 seconds and leaves a
 * receipt").
 *
 * Read-only. The phone never records, edits or clears a receipt; the computer reports its own
 * stop after the fact, and the server only keeps it.
 * - One GET for the newest receipts of every computer (the server keeps at most 50 per read);
 *   the screen groups them under each computer in 事项 → 电脑上.
 * - Every entry goes through the contract's `decodeDeviceSafetyEventReceiptV1`. An entry that does
 *   not decode (bad event, digest that does not match the event) is never shown, not even in part;
 *   it only counts as "a receipt that cannot be read".
 * - Receipts are reports, not live state: the newest receipt is not necessarily how the computer is
 *   right now, and the screen says so.
 *
 * Endpoint (under the API base, which already ends in `/api`; owner session only):
 *   GET /v1/device-safety-events?limit=50   { items: DeviceSafetyEventReceiptV1[] }, newest first
 */
import {
  DEVICE_SAFETY_BUDGET_MS,
  DEVICE_SAFETY_EVENT_ERROR_CODES,
  DEVICE_SAFETY_LIST_MAX,
  decodeDeviceSafetyEventReceiptV1,
  type DeviceSafetyEventOriginV1,
  type DeviceSafetyEventReceiptV1,
  type DeviceSafetyGateStateV1,
} from '../../shared/types/device-safety-event';
import { resolveTwinTransport, twinAuthHeaders, type TwinStatusTransportInput } from './twinStatus';

export type DeviceSafetyText = { en: string; zh: string };

export interface DeviceSafetyUnreadableEntry {
  /** The computer the entry names, when that much is readable; otherwise `null`. */
  deviceId: string | null;
  reason: string;
}

export type DeviceSafetyReceiptsRead =
  | { kind: 'ready'; receipts: DeviceSafetyEventReceiptV1[]; unreadable: DeviceSafetyUnreadableEntry[] }
  /** `not_enabled`: device signing credentials v1 are off on the server, so there are no receipts yet. */
  | { kind: 'unavailable'; reason: 'not_enabled' | 'authentication_required' }
  | { kind: 'error'; reason: string; retryable: boolean };

/** Newest receipts shown under one computer; older ones are counted, not listed. */
export const DEVICE_SAFETY_RECEIPTS_PER_COMPUTER = 5;

const DEVICE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function dataOf(body: unknown): unknown {
  return isRecord(body) && 'data' in body ? body.data : body;
}

function codeOf(body: unknown): string {
  if (!isRecord(body)) return '';
  if (typeof body.code === 'string') return body.code;
  // Nest wraps `new XException({ code })` as the body itself; some proxies nest it once more.
  return isRecord(body.message) && typeof body.message.code === 'string' ? body.message.code : '';
}

export function deviceSafetyReceiptsPath(limit: number = DEVICE_SAFETY_LIST_MAX): string {
  const bounded = Math.min(DEVICE_SAFETY_LIST_MAX, Math.max(1, Math.floor(limit)));
  return `/v1/device-safety-events?limit=${bounded}`;
}

function eventTime(receipt: DeviceSafetyEventReceiptV1): number {
  return Date.parse(receipt.event.at);
}

/** Decodes one list response body. Anything that is not `{ items: [] }` is malformed as a whole. */
export function decodeDeviceSafetyReceiptsBody(body: unknown): Extract<DeviceSafetyReceiptsRead, { kind: 'ready' }> | null {
  const data = dataOf(body);
  const items = isRecord(data) ? data.items : undefined;
  if (!Array.isArray(items)) return null;
  const receipts: DeviceSafetyEventReceiptV1[] = [];
  const unreadable: DeviceSafetyUnreadableEntry[] = [];
  const seen = new Set<string>();
  for (const item of items.slice(0, DEVICE_SAFETY_LIST_MAX)) {
    const decoded = decodeDeviceSafetyEventReceiptV1(item);
    if (decoded.ok === false) {
      const rawDeviceId = isRecord(item) ? item.deviceId : undefined;
      unreadable.push({ deviceId: typeof rawDeviceId === 'string' && DEVICE_ID.test(rawDeviceId) ? rawDeviceId : null, reason: decoded.reason });
      continue;
    }
    if (!DEVICE_ID.test(decoded.value.deviceId)) {
      unreadable.push({ deviceId: null, reason: 'deviceId' });
      continue;
    }
    // The same receipt twice is shown once.
    if (seen.has(decoded.value.receiptRef)) continue;
    seen.add(decoded.value.receiptRef);
    receipts.push(decoded.value);
  }
  // The server already sends newest first; sort again (stable) so the screen never depends on it.
  receipts.sort((a, b) => eventTime(b) - eventTime(a));
  return { kind: 'ready', receipts, unreadable };
}

/** The owner's newest emergency-stop receipts across their computers. GET only. */
export async function readDeviceSafetyReceipts(input: TwinStatusTransportInput = {}): Promise<DeviceSafetyReceiptsRead> {
  const { baseUrl, token, transport } = resolveTwinTransport(input);
  if (!token) return { kind: 'unavailable', reason: 'authentication_required' };
  let response: { status: number; body: unknown };
  try {
    response = await transport.request({ method: 'GET', path: `${baseUrl}${deviceSafetyReceiptsPath()}`, headers: twinAuthHeaders(token) });
  } catch {
    return { kind: 'error', reason: 'network', retryable: true };
  }
  const code = codeOf(response.body);
  if (response.status === 503 || code === DEVICE_SAFETY_EVENT_ERROR_CODES.unavailable) return { kind: 'unavailable', reason: 'not_enabled' };
  if (response.status === 401 || response.status === 403) return { kind: 'unavailable', reason: 'authentication_required' };
  if (response.status < 200 || response.status >= 300) {
    return { kind: 'error', reason: code || `http_${response.status}`, retryable: response.status >= 500 || response.status === 429 };
  }
  return decodeDeviceSafetyReceiptsBody(response.body) ?? { kind: 'error', reason: 'response_malformed', retryable: false };
}

export interface DeviceSafetyComputerGroup {
  /** `null` groups the unreadable entries that do not say which computer they came from. */
  deviceId: string | null;
  /** The computer is in the page's own device list. */
  listed: boolean;
  /** Newest first, at most {@link DEVICE_SAFETY_RECEIPTS_PER_COMPUTER}. */
  receipts: DeviceSafetyEventReceiptV1[];
  /** Readable receipts of this computer that are not listed. */
  more: number;
  unreadable: number;
}

/**
 * One group per computer: the page's own computers first (in the page's order, also when they have
 * no receipt), then other computers that sent receipts (newest first), then unreadable entries that
 * name no computer.
 */
export function groupDeviceSafetyReceipts(
  read: Extract<DeviceSafetyReceiptsRead, { kind: 'ready' }>,
  listedDeviceIds: readonly string[],
): DeviceSafetyComputerGroup[] {
  const order: string[] = [];
  const byDevice = new Map<string, { receipts: DeviceSafetyEventReceiptV1[]; unreadable: number; listed: boolean }>();
  const ensure = (deviceId: string, listed: boolean) => {
    let group = byDevice.get(deviceId);
    if (!group) {
      group = { receipts: [], unreadable: 0, listed };
      byDevice.set(deviceId, group);
      order.push(deviceId);
    }
    return group;
  };
  for (const deviceId of listedDeviceIds) if (deviceId) ensure(deviceId, true);
  for (const receipt of read.receipts) ensure(receipt.deviceId, false).receipts.push(receipt);
  let orphaned = 0;
  for (const entry of read.unreadable) {
    if (entry.deviceId) ensure(entry.deviceId, false).unreadable += 1;
    else orphaned += 1;
  }
  const groups: DeviceSafetyComputerGroup[] = order.map((deviceId) => {
    const group = byDevice.get(deviceId)!;
    return {
      deviceId,
      listed: group.listed,
      receipts: group.receipts.slice(0, DEVICE_SAFETY_RECEIPTS_PER_COMPUTER),
      more: Math.max(0, group.receipts.length - DEVICE_SAFETY_RECEIPTS_PER_COMPUTER),
      unreadable: group.unreadable,
    };
  });
  const newest = (group: DeviceSafetyComputerGroup) => (group.receipts[0] ? eventTime(group.receipts[0]) : -Infinity);
  const listed = groups.filter((group) => group.listed);
  const others = groups.filter((group) => !group.listed).sort((a, b) => newest(b) - newest(a));
  return [...listed, ...others, ...(orphaned ? [{ deviceId: null, listed: false, receipts: [], more: 0, unreadable: orphaned }] : [])];
}

const ORIGIN_TEXT: Record<DeviceSafetyEventOriginV1, DeviceSafetyText> = {
  tray: { en: 'Tray menu', zh: '托盘' },
  settings: { en: 'Settings', zh: '设置' },
  shortcut: { en: 'Keyboard shortcut', zh: '快捷键' },
  'local-user': { en: 'You, on the computer', zh: '本人（在电脑上）' },
  'remote-stop': { en: 'Remote stop', zh: '远程停止' },
};

const GATE_TEXT: Record<DeviceSafetyGateStateV1, DeviceSafetyText> = {
  confirmed: { en: 'confirmed', zh: '已确认' },
  not_confirmed: { en: 'not confirmed', zh: '未确认' },
  unavailable: { en: 'could not be read', zh: '读不到' },
};

export interface DeviceSafetyReceiptLine {
  receiptRef: string;
  kind: 'engaged' | 'released';
  at: string;
  title: DeviceSafetyText;
  origin: DeviceSafetyText;
  /** The computer's own read-back of its two gates, as it reported them. */
  gates: DeviceSafetyText[];
  /** Whether it took effect within 3 seconds, in the computer's own words; `null` when there is nothing to say. */
  budget: DeviceSafetyText | null;
  /** `ok` only when the computer said `withinBudget: true`; `warn` for every other budget line. */
  budgetTone: 'ok' | 'warn' | null;
  approvalsRejected: DeviceSafetyText | null;
  reason: string | null;
}

/** What the phone says about one receipt. Mirrors the desktop's own wording (`emergencyStopLog.ts`). */
export function describeDeviceSafetyReceipt(receipt: DeviceSafetyEventReceiptV1): DeviceSafetyReceiptLine {
  const event = receipt.event;
  const engaged = event.kind === 'engaged';
  const gates: DeviceSafetyText[] = [
    { en: `Computer-side gate ${GATE_TEXT[event.nativeGate].en}`, zh: `电脑侧闸门${GATE_TEXT[event.nativeGate].zh}` },
  ];
  if (engaged && event.runtime) {
    gates.push({ en: `Local runtime revoke ${GATE_TEXT[event.runtime].en}`, zh: `本机运行时撤销${GATE_TEXT[event.runtime].zh}` });
  }
  let budget: DeviceSafetyText | null = null;
  const seconds = DEVICE_SAFETY_BUDGET_MS / 1000;
  if (typeof event.settledAfterMs === 'number') {
    budget =
      event.withinBudget === true
        ? { en: `Took effect in ${event.settledAfterMs} ms (within ${seconds} s)`, zh: `${event.settledAfterMs} ms 内生效（${seconds} 秒内）` }
        : { en: `Took ${event.settledAfterMs} ms; not everything was confirmed within ${seconds} s`, zh: `用时 ${event.settledAfterMs} ms，没有在 ${seconds} 秒内全部确认` };
  } else if (engaged) {
    // Only `true` counts as "within 3 seconds"; anything else is said as it is.
    budget = { en: `Not confirmed within ${seconds} s`, zh: `没有在 ${seconds} 秒内确认` };
  }
  const rejected = engaged && typeof event.approvalsRejected === 'number' && event.approvalsRejected > 0 ? event.approvalsRejected : 0;
  return {
    receiptRef: receipt.receiptRef,
    kind: event.kind,
    at: event.at,
    title: engaged ? { en: 'Emergency stop engaged', zh: '电脑急停了' } : { en: 'Emergency stop released', zh: '急停解除了' },
    origin: { en: `From: ${ORIGIN_TEXT[event.origin].en}`, zh: `来源：${ORIGIN_TEXT[event.origin].zh}` },
    gates,
    budget,
    budgetTone: budget === null ? null : event.withinBudget === true ? 'ok' : 'warn',
    approvalsRejected: rejected ? { en: `Rejected ${rejected} pending approval${rejected === 1 ? '' : 's'}`, zh: `同时拒绝了 ${rejected} 个待审批` } : null,
    reason: event.reason ?? null,
  };
}

/** What to say when there is no list to show. */
export function describeDeviceSafetyReceiptsProblem(read: Exclude<DeviceSafetyReceiptsRead, { kind: 'ready' }>): DeviceSafetyText {
  if (read.kind === 'unavailable') {
    return read.reason === 'not_enabled'
      ? { en: 'Emergency-stop receipts are not switched on yet.', zh: '急停回执还没有开通。' }
      : { en: 'Sign in again to see emergency-stop receipts.', zh: '请重新登录后查看急停回执。' };
  }
  return read.retryable
    ? { en: 'Emergency-stop receipts could not be read. Pull down to try again.', zh: '急停回执暂时读不到，下拉重试。' }
    : { en: 'Emergency-stop receipts could not be read.', zh: '急停回执读不到。' };
}
