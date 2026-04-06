/**
 * Lightweight user analytics / telemetry service.
 *
 * Collects anonymous usage events and periodically flushes them to the
 * backend analytics endpoint.  Respects the user's opt-out preference.
 */

import { API_BASE, apiFetch } from "./store";

// ─── Types ─────────────────────────────────────────────

export interface AnalyticsEvent {
  event: string;
  props?: Record<string, string | number | boolean>;
  ts: number;
}

// ─── State ─────────────────────────────────────────────

let _queue: AnalyticsEvent[] = [];
let _flushTimer: ReturnType<typeof setInterval> | null = null;
let _token: string | null = null;
let _enabled = true;
const MAX_QUEUE = 100;
const FLUSH_INTERVAL_MS = 30_000; // 30s

// Device ID (reuse desktop device ID to correlate)
function getDeviceId(): string {
  return localStorage.getItem("agentrix_desktop_device_id") || "unknown";
}

// ─── Public API ────────────────────────────────────────

/** Initialize analytics. Call once on app start. */
export function initAnalytics(token: string | null) {
  _token = token;
  _enabled = localStorage.getItem("agentrix_analytics_optout") !== "1";
  if (!_enabled) return;

  // Auto-flush at interval
  if (_flushTimer) clearInterval(_flushTimer);
  _flushTimer = setInterval(flushEvents, FLUSH_INTERVAL_MS);

  // Flush before unload
  window.addEventListener("beforeunload", flushEvents);

  // Track app start
  trackEvent("app_start", { platform: navigator.platform });
}

/** Shut down analytics (flush remaining events) */
export function destroyAnalytics() {
  flushEvents();
  if (_flushTimer) { clearInterval(_flushTimer); _flushTimer = null; }
}

/** Track a named event with optional properties */
export function trackEvent(event: string, props?: Record<string, string | number | boolean>) {
  if (!_enabled) return;
  _queue.push({ event, props, ts: Date.now() });
  if (_queue.length >= MAX_QUEUE) flushEvents();
}

/** Opt the user out of analytics */
export function optOutAnalytics() {
  _enabled = false;
  localStorage.setItem("agentrix_analytics_optout", "1");
  _queue = [];
}

/** Opt the user back in */
export function optInAnalytics() {
  localStorage.removeItem("agentrix_analytics_optout");
  _enabled = true;
}

// ─── Internals ─────────────────────────────────────────

function flushEvents() {
  if (_queue.length === 0) return;
  const batch = _queue.splice(0, MAX_QUEUE);
  const payload = {
    deviceId: getDeviceId(),
    deviceType: "desktop",
    appVersion: "0.1.1",
    events: batch,
  };

  // Fire-and-forget POST
  apiFetch(`${API_BASE}/analytics/events`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(_token ? { Authorization: `Bearer ${_token}` } : {}),
    },
    body: JSON.stringify(payload),
  }).catch(() => {
    // If flush fails, re-queue the events (up to limit)
    _queue.unshift(...batch.slice(0, MAX_QUEUE - _queue.length));
  });
}
