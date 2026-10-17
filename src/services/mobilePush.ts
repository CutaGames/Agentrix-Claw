/**
 * mobilePush — push notifications by type (product doc 5.2 / 5.4, M0).
 *
 * The contract is `shared/types/push-notification.ts` (`agentrix.push.v1`,
 * backend, commit 01833985, integration 3a9a7281). It started from this
 * file's earlier local draft; types, destinations, channels and lock-screen
 * visibility come from there now, and typed pushes are parsed with the
 * contract's `parsePushDataV1`. The mobile names below are aliases so the
 * call sites and tests stay as they were.
 *
 * Rules this module enforces on the phone:
 *   - A push carries references only: `v` + `type` + `ref` (+ optional
 *     `agentId`). Any text, amount, URL or deep link in the payload is
 *     ignored. The phone never navigates to a URL that came from a push.
 *   - A typed push must carry a version the contract accepts; one without
 *     `v` is neither the contract nor the old backend shape and is refused.
 *     The old backend shape `{ notificationId, type }` (no `v`) still opens
 *     the inbox (the contract leaves it to each surface).
 *   - Each type routes to one "zone + tab" destination (8.1).
 *   - Android channels are per type; twin digests, receipts and the legacy
 *     transactions channel are SECRET on the lock screen.
 */

import type { NavZoneId } from '../navigation/navCatalog';
import { resolveFourZoneNavigation, type FourZoneNavigation } from '../navigation/four-zone/fourZoneRoutes';
import {
  PUSH_ACCEPTED_SCHEMA_VERSIONS,
  PUSH_CHANNELS,
  PUSH_DESTINATIONS,
  PUSH_LEGACY_CHANNELS,
  PUSH_SCHEMA_VERSION,
  PUSH_TYPES,
  isPushRef,
  isPushType,
  parsePushDataV1,
  type PushChannelV1,
  type PushImportance,
  type PushLockscreen,
  type PushType,
} from '../../shared/types/push-notification';

export const MOBILE_PUSH_SCHEMA_VERSION = PUSH_SCHEMA_VERSION;
export const MOBILE_PUSH_ACCEPTED_VERSIONS: readonly string[] = PUSH_ACCEPTED_SCHEMA_VERSIONS;

export const MOBILE_PUSH_TYPES = PUSH_TYPES;
export type MobilePushType = PushType;

/** The four first-level zones (D3 / 8.1): 伙伴 / 事项 / 分身 / 我的 — see navCatalog. */
export type MobileZone = NavZoneId;

export interface MobilePushDestination {
  zone: MobileZone;
  /** Tab inside the zone; must exist in NAV_CATALOG (tested). */
  tab: string;
  /** What the `ref` in the payload points at. */
  refKind: string;
}

export const MOBILE_PUSH_DESTINATIONS: Readonly<Record<MobilePushType, MobilePushDestination>> = PUSH_DESTINATIONS;

export type MobilePushImportance = PushImportance;
export type MobilePushLockscreen = PushLockscreen;
export type MobilePushChannel = PushChannelV1;

export const MOBILE_PUSH_CHANNELS: Readonly<Record<MobilePushType, MobilePushChannel>> = PUSH_CHANNELS;

/**
 * Channels the old backend path still targets (`transactions`); kept so old
 * pushes do not fall back to the OS default channel.
 */
export const MOBILE_PUSH_LEGACY_CHANNELS: readonly MobilePushChannel[] = PUSH_LEGACY_CHANNELS;

/** Payload keys the phone reads. Everything else is ignored. */
const READ_KEYS = new Set(['v', 'type', 'ref', 'agentId', 'notificationId']);

export interface MobilePushPayload {
  type: MobilePushType;
  ref: string;
  agentId?: string;
}

export type MobilePushParseResult =
  | { ok: true; kind: 'typed'; payload: MobilePushPayload; ignoredKeys: string[] }
  | { ok: true; kind: 'legacy'; notificationId: string; ignoredKeys: string[] }
  | { ok: false; reason: 'not_an_object' | 'unknown_type' | 'invalid_ref' | 'invalid_agent' | 'unsupported_version'; ignoredKeys: string[] };

export function isMobilePushType(value: unknown): value is MobilePushType {
  return isPushType(value);
}

/**
 * Strictly parse the `data` object of a notification. Only `v`, `type`,
 * `ref`, `agentId` (and the old backend's `notificationId`) are read.
 */
export function parseMobilePushData(data: unknown): MobilePushParseResult {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return { ok: false, reason: 'not_an_object', ignoredKeys: [] };
  }
  const record = data as Record<string, unknown>;
  const ignoredKeys = Object.keys(record).filter((key) => !READ_KEYS.has(key)).sort();

  if (record.v !== undefined) {
    const parsed = parsePushDataV1(record);
    // strict:false does not narrow on `ok`; the failure arm is the one with `reason`.
    if ('reason' in parsed) return { ok: false, reason: parsed.reason, ignoredKeys };
    return { ok: true, kind: 'typed', payload: { ...parsed.data }, ignoredKeys };
  }

  // Old backend shape: { notificationId, type: <notification entity type> }, no `v`.
  if (isPushRef(record.notificationId)) {
    return { ok: true, kind: 'legacy', notificationId: record.notificationId as string, ignoredKeys };
  }

  // A typed-looking payload without a version is not the contract.
  if (isPushType(record.type)) return { ok: false, reason: 'unsupported_version', ignoredKeys };
  return { ok: false, reason: 'unknown_type', ignoredKeys };
}

/** Root-level route every push opens until the M1 zone navigator lands. */
export const MOBILE_PUSH_FALLBACK_ROUTE = 'Inbox' as const;

export interface MobilePushNavigation {
  name: typeof MOBILE_PUSH_FALLBACK_ROUTE;
  params: {
    source: 'push';
    pushType?: MobilePushType;
    zone?: MobileZone;
    tab?: string;
    refKind?: string;
    ref?: string;
    agentId?: string;
    notificationId?: string;
  };
}

export interface MobilePushRoutingOptions {
  /** M1 `mobile.four_zone_ia`: open the zone + tab directly instead of the inbox. */
  fourZone?: boolean;
}

export function resolveMobilePushNavigation(
  parsed: MobilePushParseResult,
  options: MobilePushRoutingOptions = {},
): MobilePushNavigation | FourZoneNavigation {
  if (options.fourZone && parsed.ok && parsed.kind === 'typed') {
    const destination = MOBILE_PUSH_DESTINATIONS[parsed.payload.type];
    return resolveFourZoneNavigation({ zone: destination.zone, tab: destination.tab, ref: parsed.payload.ref });
  }
  if (parsed.ok && parsed.kind === 'typed') {
    const destination = MOBILE_PUSH_DESTINATIONS[parsed.payload.type];
    return {
      name: MOBILE_PUSH_FALLBACK_ROUTE,
      params: {
        source: 'push',
        pushType: parsed.payload.type,
        zone: destination.zone,
        tab: destination.tab,
        refKind: destination.refKind,
        ref: parsed.payload.ref,
        ...(parsed.payload.agentId ? { agentId: parsed.payload.agentId } : {}),
      },
    };
  }
  if (parsed.ok && parsed.kind === 'legacy') {
    return { name: MOBILE_PUSH_FALLBACK_ROUTE, params: { source: 'push', notificationId: parsed.notificationId } };
  }
  // Malformed or unknown: open the inbox, carry nothing from the payload.
  return { name: MOBILE_PUSH_FALLBACK_ROUTE, params: { source: 'push' } };
}

// ── Tap handling with a cold-start queue ─────────────────────────────────

export interface MobilePushNavigator {
  isReady(): boolean;
  navigate(name: string, params?: object): void;
}

let pending: MobilePushNavigation | FourZoneNavigation | null = null;
const handledResponseIds = new Set<string>();

/**
 * Handle a tapped notification. Navigates now if the container is ready and
 * the user is signed in; otherwise keeps the latest tap until
 * `flushPendingMobilePush` is called. Each notification id is handled once
 * (a cold-start response can be reported twice by the OS).
 */
export function handleMobilePushResponse(input: {
  notificationId?: string | null;
  data: unknown;
  navigator: MobilePushNavigator;
  canNavigate: boolean;
  fourZone?: boolean;
}): MobilePushNavigation | FourZoneNavigation | null {
  const id = typeof input.notificationId === 'string' ? input.notificationId : '';
  if (id) {
    if (handledResponseIds.has(id)) return null;
    handledResponseIds.add(id);
    // Keep the de-dup set small; only the most recent taps matter.
    if (handledResponseIds.size > 100) {
      const oldest = handledResponseIds.values().next().value;
      if (oldest !== undefined) handledResponseIds.delete(oldest);
    }
  }
  const target = resolveMobilePushNavigation(parseMobilePushData(input.data), { fourZone: input.fourZone });
  if (input.canNavigate && input.navigator.isReady()) {
    input.navigator.navigate(target.name, target.params);
    pending = null;
  } else {
    pending = target;
  }
  return target;
}

export function flushPendingMobilePush(
  navigator: MobilePushNavigator,
  canNavigate: boolean,
): MobilePushNavigation | FourZoneNavigation | null {
  if (!pending || !canNavigate || !navigator.isReady()) return null;
  const target = pending;
  pending = null;
  navigator.navigate(target.name, target.params);
  return target;
}

/** Test helper. */
export function __resetMobilePushStateForTests(): void {
  pending = null;
  handledResponseIds.clear();
}

// ── Android channels ─────────────────────────────────────────────────────

/** Minimal slice of `expo-notifications` used here (injected for tests). */
export interface MobilePushNotificationsModule {
  setNotificationChannelAsync(id: string, channel: Record<string, unknown>): Promise<unknown>;
  AndroidImportance: { MAX: number; HIGH: number; DEFAULT: number };
  AndroidNotificationVisibility: { PRIVATE: number; SECRET: number };
}

export function mobilePushChannelList(): MobilePushChannel[] {
  const seen = new Set<string>();
  const out: MobilePushChannel[] = [];
  for (const channel of [...MOBILE_PUSH_TYPES.map((type) => MOBILE_PUSH_CHANNELS[type]), ...MOBILE_PUSH_LEGACY_CHANNELS]) {
    if (seen.has(channel.id)) continue;
    seen.add(channel.id);
    out.push(channel);
  }
  return out;
}

export async function setupMobilePushChannels(
  notifications: MobilePushNotificationsModule,
  lang: 'en' | 'zh' = 'zh',
): Promise<string[]> {
  const created: string[] = [];
  for (const channel of mobilePushChannelList()) {
    const importance =
      channel.importance === 'max'
        ? notifications.AndroidImportance.MAX
        : channel.importance === 'high'
          ? notifications.AndroidImportance.HIGH
          : notifications.AndroidImportance.DEFAULT;
    const lockscreenVisibility =
      channel.lockscreen === 'secret'
        ? notifications.AndroidNotificationVisibility.SECRET
        : notifications.AndroidNotificationVisibility.PRIVATE;
    await notifications.setNotificationChannelAsync(channel.id, {
      name: channel.name[lang],
      importance,
      lockscreenVisibility,
      ...(channel.importance === 'max' ? { vibrationPattern: [0, 250, 250, 250] } : {}),
    });
    created.push(channel.id);
  }
  return created;
}
