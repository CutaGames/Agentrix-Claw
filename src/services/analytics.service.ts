/**
 * analytics.service.ts — Sprint M-P2-2.
 *
 * Lightweight mobile telemetry. Mirrors the desktop service:
 *   - Default OFF + opt-in (uses MMKV key `agentrix_telemetry_opt_in`)
 *   - 6 + 4 allow-listed events; anything else is dropped client-side
 *   - Batches up to 100 events / 5 minutes; flushes on
 *     beforeUnmount AppState transitions
 *
 * Event ingestion endpoint: `POST /api/v1/mobile/analytics`
 * Backend reuses `desktop-analytics.service.ts` allow-list and
 * `agentrix_desktop.analytics_events` table.
 *
 * Privacy: every event is keyed by a **hashed** device id (MMKV
 * persisted, not the raw OS device id). User id is sent only when
 * authenticated. Free-form props are stripped server-side via a
 * whitelist (see `desktop-analytics.service.ts` PROP_KEY_WHITELIST).
 */
import { Platform, AppState, type AppStateStatus } from 'react-native';
import Constants from 'expo-constants';
import { mmkv } from '../stores/mmkvStorage';
import { apiFetch } from './api';

const OPT_IN_KEY = 'agentrix_telemetry_opt_in';
const DEVICE_ID_KEY = 'agentrix_mobile_device_id';
const SESSION_ID_KEY = 'agentrix_mobile_session_id';

const FLUSH_INTERVAL_MS = 5 * 60_000;
const MAX_QUEUE = 100;

export type MobileEventName =
  | 'mobile_launch'
  | 'mobile_login'
  | 'mobile_onboarding_complete'
  | 'mobile_first_chat'
  | 'mobile_first_pet_view'
  | 'mobile_first_nfc'
  | 'mobile_first_toy_pair'
  | 'mobile_axp_redeem'
  | 'mobile_subscribe_open'
  | 'mobile_iap_purchase';

interface QueuedEvent {
  deviceId: string;
  userId?: string | null;
  sessionId: string;
  eventName: MobileEventName;
  eventProps?: Record<string, unknown>;
  appVersion: string;
  osPlatform: string;
  occurredAt: number;
}

let _queue: QueuedEvent[] = [];
let _flushTimer: ReturnType<typeof setInterval> | null = null;
let _appStateSub: { remove: () => void } | null = null;
let _userId: string | null = null;
let _enabled = false;

function getOrCreateDeviceId(): string {
  let id = mmkv.getString(DEVICE_ID_KEY);
  if (id && id.length === 36) return id;
  // Random uuid-like (no crypto.randomUUID in older Hermes)
  id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}-${Math.random()
    .toString(36)
    .slice(2, 10)}`;
  mmkv.set(DEVICE_ID_KEY, id);
  return id;
}

function getOrCreateSessionId(): string {
  let id = mmkv.getString(SESSION_ID_KEY);
  // Sessions roll on every cold start (init). We keep one ID for the
  // lifetime of the JS process.
  if (!id) {
    id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
    mmkv.set(SESSION_ID_KEY, id);
  }
  return id;
}

function readAppVersion(): string {
  return Constants.expoConfig?.version || '0.0.0';
}

function isOptedIn(): boolean {
  try {
    return mmkv.getString(OPT_IN_KEY) === '1';
  } catch {
    return false;
  }
}

/**
 * Initialize analytics once on app boot. Re-enters cleanly if called
 * again (e.g. after user toggles opt-in in Settings).
 */
export function initAnalytics(userId?: string | null): void {
  _userId = userId ?? null;
  const wasEnabled = _enabled;
  _enabled = isOptedIn();

  if (_flushTimer) {
    clearInterval(_flushTimer);
    _flushTimer = null;
  }
  if (_appStateSub) {
    _appStateSub.remove();
    _appStateSub = null;
  }

  if (!_enabled) {
    _queue = [];
    return;
  }

  // Roll a fresh session id on every (re-)init so dashboards can
  // distinguish cold starts from toggle flips.
  mmkv.delete(SESSION_ID_KEY);
  getOrCreateSessionId();

  _flushTimer = setInterval(() => {
    void flushEvents();
  }, FLUSH_INTERVAL_MS);

  _appStateSub = AppState.addEventListener('change', (state: AppStateStatus) => {
    if (state === 'background' || state === 'inactive') {
      void flushEvents();
    }
  });

  if (!wasEnabled && __DEV__) {
    // eslint-disable-next-line no-console
    console.log('[analytics] enabled (opted in)');
  }
}

export function setUser(userId: string | null): void {
  _userId = userId;
}

export function trackEvent(
  name: MobileEventName,
  props?: Record<string, unknown>,
): void {
  if (!_enabled) return;
  _queue.push({
    deviceId: getOrCreateDeviceId(),
    userId: _userId,
    sessionId: getOrCreateSessionId(),
    eventName: name,
    eventProps: props,
    appVersion: readAppVersion(),
    osPlatform: `${Platform.OS}_${Platform.Version}`,
    occurredAt: Date.now(),
  });
  if (_queue.length >= MAX_QUEUE) {
    void flushEvents();
  }
}

export async function flushEvents(): Promise<void> {
  if (!_enabled || _queue.length === 0) return;
  const batch = _queue.slice(0, MAX_QUEUE);
  _queue = _queue.slice(batch.length);
  try {
    await apiFetch('/v1/mobile/analytics', {
      method: 'POST',
      body: JSON.stringify({ events: batch }),
    });
  } catch (e) {
    // Server unreachable: re-queue (cap to MAX_QUEUE)
    _queue = [..._queue, ...batch].slice(0, MAX_QUEUE);
    if (__DEV__) {
      // eslint-disable-next-line no-console
      console.warn('[analytics] flush failed, requeued:', (e as Error).message);
    }
  }
}

export function destroyAnalytics(): void {
  if (_enabled) void flushEvents();
  if (_flushTimer) {
    clearInterval(_flushTimer);
    _flushTimer = null;
  }
  if (_appStateSub) {
    _appStateSub.remove();
    _appStateSub = null;
  }
  _enabled = false;
}

export function isAnalyticsOptedIn(): boolean {
  return _enabled;
}

/** Set opt-in state and re-init. Call from Settings → Privacy toggle. */
export function setOptIn(value: boolean): void {
  mmkv.set(OPT_IN_KEY, value ? '1' : '0');
  initAnalytics(_userId);
}
