/**
 * myDevices — 我的 → 设备 (M1-k; product doc 5.3 "设备（电脑 · 手表 · 家庭设备）",
 * 5.4 我的首屏三张卡之一).
 *
 * One list over what the backend already knows:
 *   - 电脑: desktop-sync devices (`GET /desktop-sync/state`), the same read as
 *     事项 → 电脑上;
 *   - 硬件设备: the device registry (`GET /v1/devices`).
 * Pairing and watch setup stay on their existing screens. Unlike
 * `ble.service.getPairedDevices` (which turns any error into an empty list),
 * a failed read here stays a failure, so "no devices" is only shown when the
 * backend said so.
 *
 * M1-l (E30 补偿措施①): one-tap 解绑 for a hardware device, a tightening
 * action. It sends the versioned lifecycle revoke with the fence the owner
 * saw (a device that changed since then is not revoked blindly: the list is
 * re-read). When the server runs without lifecycle v1 (503) it falls back to
 * the only revoke that mode accepts (`DELETE /v1/devices/:id`, which clears
 * the device's session credential). The list shown afterwards is the
 * backend read-back.
 */
import type { HttpTransportV1 } from '../../shared/client';
import {
  DEVICE_REGISTRY_PATHS,
  buildDeviceLifecycleRevokeCommand,
  fenceFromDeviceListItem,
  type DeviceRegistryListItemV1,
} from '../../shared/types/device-lifecycle-client';
import { apiFetch, getApiConfig } from './api';
import type { MobileDesktopState } from './desktopSync';
import { mobileV6HttpTransport } from './mobileV6Runtime';

export interface MobileComputer {
  deviceId: string;
  platform: string;
  appVersion: string | null;
  lastSeenAt: string | null;
  /** Milliseconds since the backend last heard from it, measured on the server clock. */
  lastSeenAgoMs: number | null;
}

export type MobileRegisteredDeviceStatus = 'active' | 'revoked' | 'retired' | 'unknown';

export interface MobileRegisteredDevice {
  deviceId: string;
  /** Owner-facing name; null when missing or when it looks like an old pairing code. */
  label: string | null;
  status: MobileRegisteredDeviceStatus;
  online: boolean;
  lastSeenAt: string | null;
  updatedAt: string | null;
  /** The lifecycle fence as read; sent back unchanged with a revoke. */
  fence: Pick<DeviceRegistryListItemV1, 'device_revocation_epoch' | 'credential_revocation_epoch' | 'optimistic_version' | 'credential_version'>;
}

const PLATFORM_LABELS: Readonly<Record<string, string>> = {
  darwin: 'macOS',
  macos: 'macOS',
  mac: 'macOS',
  win32: 'Windows',
  windows: 'Windows',
  linux: 'Linux',
};

export function computerPlatformLabel(platform: unknown): string {
  const raw = typeof platform === 'string' ? platform.trim() : '';
  if (!raw) return '—';
  return PLATFORM_LABELS[raw.toLowerCase()] ?? raw.replace(/[^\w .-]/g, '').slice(0, 24);
}

function parseTime(value: unknown): number | null {
  if (typeof value !== 'string' || !value) return null;
  const at = Date.parse(value);
  return Number.isFinite(at) ? at : null;
}

/** Computers from the desktop-sync state, most recently seen first. */
export function normalizeComputers(state: Pick<MobileDesktopState, 'devices' | 'serverTime'> | null | undefined, now: number = Date.now()): MobileComputer[] {
  if (!state || !Array.isArray(state.devices)) return [];
  // The server clock decides "how long ago", so a wrong phone clock cannot make a computer look online.
  const reference = parseTime(state.serverTime) ?? now;
  const seen = new Set<string>();
  const computers: MobileComputer[] = [];
  for (const device of state.devices) {
    const deviceId = typeof device?.deviceId === 'string' ? device.deviceId.trim() : '';
    if (!deviceId || seen.has(deviceId)) continue;
    seen.add(deviceId);
    const lastSeen = parseTime(device.lastSeenAt);
    computers.push({
      deviceId,
      platform: computerPlatformLabel(device.platform),
      appVersion: typeof device.appVersion === 'string' && device.appVersion.trim() ? device.appVersion.trim().slice(0, 32) : null,
      lastSeenAt: lastSeen === null ? null : String(device.lastSeenAt),
      lastSeenAgoMs: lastSeen === null ? null : Math.max(0, reference - lastSeen),
    });
  }
  return computers.sort((a, b) => (a.lastSeenAgoMs ?? Number.MAX_SAFE_INTEGER) - (b.lastSeenAgoMs ?? Number.MAX_SAFE_INTEGER));
}

const SAFE_DEVICE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;

function epoch(value: unknown): string | null {
  if (typeof value === 'number' && Number.isInteger(value) && value >= 0) return String(value);
  return typeof value === 'string' && /^\d{1,20}$/.test(value) ? value : null;
}

/**
 * Before M3 the phone sent the 6-digit pairing code as the device label;
 * such a label is not shown. Anything else is trimmed and capped.
 */
export function deviceDisplayLabel(label: unknown): string | null {
  if (typeof label !== 'string') return null;
  const clean = label.replace(/[\u0000-\u001f\u007f]/g, '').trim();
  if (!clean || /^\d{4,8}$/.test(clean)) return null;
  return clean.slice(0, 40);
}

function deviceStatus(item: Record<string, unknown>): MobileRegisteredDeviceStatus {
  if (item.registration_status === 'retired') return 'retired';
  if (item.credential_status === 'revoked') return 'revoked';
  if (item.credential_status === undefined || item.credential_status === 'active' || item.credential_status === null) return 'active';
  return 'unknown';
}

export function normalizeRegisteredDevices(items: unknown): MobileRegisteredDevice[] {
  if (!Array.isArray(items)) return [];
  const seen = new Set<string>();
  const devices: MobileRegisteredDevice[] = [];
  for (const raw of items) {
    if (!raw || typeof raw !== 'object') continue;
    const item = raw as Record<string, unknown>;
    const deviceId = typeof item.device_id === 'string' ? item.device_id.trim() : '';
    if (!deviceId || !SAFE_DEVICE_ID.test(deviceId) || seen.has(deviceId)) continue;
    seen.add(deviceId);
    const updated = item.lifecycle_updated_at;
    const updatedAt = typeof updated === 'string' ? updated : updated instanceof Date ? updated.toISOString() : null;
    devices.push({
      deviceId,
      label: deviceDisplayLabel(item.label),
      status: deviceStatus(item),
      online: item.online === true,
      lastSeenAt: typeof item.last_seen_at === 'string' ? item.last_seen_at : null,
      updatedAt,
      fence: {
        device_revocation_epoch: epoch(item.device_revocation_epoch) ?? '',
        credential_revocation_epoch: epoch(item.credential_revocation_epoch) ?? '',
        optimistic_version: epoch(item.optimistic_version) ?? '',
        credential_version: epoch(item.credential_version) ?? '',
      },
    });
  }
  return devices;
}

/**
 * The device a `device_paired` push points at (`ref` = device id, E30). Only
 * an exact match in the list the backend returned; anything else (unknown
 * id, malformed ref) highlights nothing, so the list opens as usual.
 */
export function findFocusedDevice(devices: readonly MobileRegisteredDevice[], ref: unknown): MobileRegisteredDevice | null {
  if (typeof ref !== 'string' || !SAFE_DEVICE_ID.test(ref)) return null;
  return devices.find((device) => device.deviceId === ref) ?? null;
}

/** 解绑 is offered only for an active device whose fence was read completely. */
export function canRevokeDevice(device: MobileRegisteredDevice | null | undefined): boolean {
  if (!device || device.status !== 'active') return false;
  return Object.values(device.fence).every((value) => value !== '');
}

export type DeviceRevokeOutcome =
  | { kind: 'revoked'; mode: 'lifecycle' | 'legacy' }
  /** The device changed since it was read (or is already revoked): re-read, do not retry blindly. */
  | { kind: 'conflict' }
  | { kind: 'blocked'; reason: 'not_revocable' | 'authentication_required' }
  | { kind: 'failed'; reason: string; retryable: boolean };

export interface DeviceRevokeTransportInput {
  baseUrl?: string;
  token?: string;
  transport?: HttpTransportV1;
  now?: () => Date;
}

/** Backend `requireLifecycleV1`: 503 with exactly this message. Any other 503 (proxy, outage) is not a fallback. */
export const DEVICE_LIFECYCLE_V1_OFF_MESSAGE = 'device lifecycle v1 disabled';

function isLifecycleV1Off(status: number, body: unknown): boolean {
  return status === 503 && !!body && typeof body === 'object' && (body as { message?: unknown }).message === DEVICE_LIFECYCLE_V1_OFF_MESSAGE;
}

/** Unbind one hardware device (tightening). The caller re-reads the list afterwards. */
export async function revokeMyDevice(device: MobileRegisteredDevice, input: DeviceRevokeTransportInput = {}): Promise<DeviceRevokeOutcome> {
  if (!canRevokeDevice(device) || !SAFE_DEVICE_ID.test(device.deviceId)) return { kind: 'blocked', reason: 'not_revocable' };
  const config = getApiConfig();
  const baseUrl = (input.baseUrl ?? config.baseUrl ?? '').replace(/\/+$/, '');
  const token = input.token ?? config.token;
  if (!token) return { kind: 'blocked', reason: 'authentication_required' };
  const transport = input.transport ?? mobileV6HttpTransport;
  const now = input.now ?? (() => new Date());
  const headers = { Accept: 'application/json', Authorization: `Bearer ${token}`, 'X-Agentrix-Surface': 'mobile' };
  const listItem: DeviceRegistryListItemV1 = { device_id: device.deviceId, ...device.fence };
  const command = buildDeviceLifecycleRevokeCommand({
    deviceId: device.deviceId,
    fence: fenceFromDeviceListItem(listItem, now().toISOString()),
    reasonCode: 'owner_revoke',
  });
  let status: number;
  let body: unknown;
  try {
    const response = await transport.request({
      method: 'POST',
      path: `${baseUrl}${DEVICE_REGISTRY_PATHS.revokeLifecycle(device.deviceId)}`,
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: command,
    });
    status = response.status;
    body = response.body;
  } catch {
    return { kind: 'failed', reason: 'network', retryable: true };
  }
  if (status >= 200 && status < 300) return { kind: 'revoked', mode: 'lifecycle' };
  if (status === 409) return { kind: 'conflict' };
  if (!isLifecycleV1Off(status, body)) return { kind: 'failed', reason: `http_${status}`, retryable: status >= 500 || status === 429 };
  // Lifecycle v1 is off on this server: the legacy revoke is the one it accepts.
  try {
    const legacy = await transport.request({
      method: 'DELETE',
      path: `${baseUrl}${DEVICE_REGISTRY_PATHS.revokeLegacy(device.deviceId)}`,
      headers,
    });
    if (legacy.status >= 200 && legacy.status < 300) return { kind: 'revoked', mode: 'legacy' };
    if (legacy.status === 409) return { kind: 'conflict' };
    return { kind: 'failed', reason: `legacy_http_${legacy.status}`, retryable: legacy.status >= 500 };
  } catch {
    return { kind: 'failed', reason: 'network', retryable: true };
  }
}

/** `GET /v1/devices`. Throws on failure (the screen shows "could not load", not "none"). */
export async function fetchRegisteredDevices(): Promise<MobileRegisteredDevice[]> {
  const result = await apiFetch<{ items?: unknown }>(DEVICE_REGISTRY_PATHS.list, { method: 'GET' });
  if (!result || typeof result !== 'object' || !Array.isArray((result as { items?: unknown }).items)) {
    throw new Error('device_registry_malformed');
  }
  return normalizeRegisteredDevices((result as { items: unknown }).items);
}

/** "刚刚" / "5 分钟前" / "3 小时前" / "2 天前"; "—" when unknown. */
export function lastSeenLabel(agoMs: number | null, lang: 'zh' | 'en'): string {
  if (agoMs === null) return '—';
  const minutes = Math.floor(agoMs / 60_000);
  if (minutes < 2) return lang === 'zh' ? '刚刚' : 'just now';
  if (minutes < 60) return lang === 'zh' ? `${minutes} 分钟前` : `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return lang === 'zh' ? `${hours} 小时前` : `${hours} h ago`;
  const days = Math.floor(hours / 24);
  return lang === 'zh' ? `${days} 天前` : `${days} d ago`;
}

/** Short, non-secret display id: the first 8 characters. */
export function shortDeviceId(deviceId: string): string {
  const clean = deviceId.replace(/[^\w.:-]/g, '');
  return clean.length > 12 ? `${clean.slice(0, 8)}…` : clean;
}
