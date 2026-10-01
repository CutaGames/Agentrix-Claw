/**
 * Lightweight user analytics / telemetry service.
 *
 * Sprint G-2 (US-G2-4): default OFF + opt-in. Events are written to the
 * server only when the user explicitly enables telemetry via
 * SettingsPanel toggle (or the FirstRunTelemetryPrompt).
 *
 * - Storage key: `agentrix_telemetry_opt_in === '1'` enables.
 * - Old key `agentrix_analytics_optout` is migrated transparently below.
 * - Only events whose names match the server allow-list are kept.
 *
 * @see .kiro/specs/desktop-go-live/requirements.md US-G2-4
 */

import { API_BASE, apiFetch } from "./store";
import { getDesktopDeviceId } from "./desktop";

// ─── Types ─────────────────────────────────────────────

export interface AnalyticsEvent {
  event: string;
  props?: Record<string, string | number | boolean>;
  ts: number;
}

const OPT_IN_KEY = "agentrix_telemetry_opt_in";
const LEGACY_OPT_OUT_KEY = "agentrix_analytics_optout";

// ─── State ─────────────────────────────────────────────

let _queue: AnalyticsEvent[] = [];
let _flushTimer: ReturnType<typeof setInterval> | null = null;
let _token: string | null = null;
let _enabled = false;
const MAX_QUEUE = 100;
const FLUSH_INTERVAL_MS = 5 * 60_000; // 5 minutes per requirements

function readAppVersion(): string {
  try {
    return (window as any).__AGENTRIX_DESKTOP_VERSION__ || "0.0.0";
  } catch {
    return "0.0.0";
  }
}

function isOptedIn(): boolean {
  // Migration: any historical user that explicitly opted OUT stays out.
  // New users default to OFF.
  if (localStorage.getItem(LEGACY_OPT_OUT_KEY) === "1") return false;
  return localStorage.getItem(OPT_IN_KEY) === "1";
}

// ─── Public API ────────────────────────────────────────

/** Initialize analytics. Call once on app start. */
export function initAnalytics(token: string | null) {
  _token = token;
  _enabled = isOptedIn();

  // Always reset the timer so re-init after opt-in flips state cleanly.
  if (_flushTimer) clearInterval(_flushTimer);

  if (!_enabled) {
    _queue = [];
    return;
  }

  _flushTimer = setInterval(flushEvents, FLUSH_INTERVAL_MS);
  window.addEventListener("beforeunload", flushEvents);
}

/** Shut down analytics (flush remaining events) */
export function destroyAnalytics() {
  if (_enabled) flushEvents();
  if (_flushTimer) { clearInterval(_flushTimer); _flushTimer = null; }
}

/** Track a named event with optional properties */
export function trackEvent(event: string, props?: Record<string, string | number | boolean>) {
  if (!_enabled) return;
  _queue.push({ event, props, ts: Date.now() });
  if (_queue.length >= MAX_QUEUE) flushEvents();
}

/** Whether telemetry is currently enabled (opt-in). */
export function isAnalyticsOptedIn(): boolean {
  return _enabled;
}

/** Opt the user out of analytics. Clears any queued events. */
export function optOutAnalytics() {
  _enabled = false;
  localStorage.setItem(OPT_IN_KEY, "0");
  // Don't write the legacy key — we're past that.
  _queue = [];
  if (_flushTimer) { clearInterval(_flushTimer); _flushTimer = null; }
}

/** Opt the user in to analytics. Starts the flush loop. */
export function optInAnalytics() {
  localStorage.setItem(OPT_IN_KEY, "1");
  _enabled = true;
  if (_flushTimer) clearInterval(_flushTimer);
  _flushTimer = setInterval(flushEvents, FLUSH_INTERVAL_MS);
  // Re-register the beforeunload flush listener (idempotent — same fn ref)
  window.addEventListener("beforeunload", flushEvents);
}

// ─── Internals ─────────────────────────────────────────

function flushEvents() {
  if (!_enabled || _queue.length === 0) return;
  const batch = _queue.splice(0, MAX_QUEUE);
  const deviceId = getDesktopDeviceId();
  const appVersion = readAppVersion();

  // Map to the server schema expected by /api/v1/desktop/analytics
  const events = batch.map((e) => ({
    deviceId,
    eventName: e.event,
    eventProps: e.props || null,
    appVersion,
    osPlatform: typeof navigator !== "undefined" ? navigator.platform : null,
    occurredAt: e.ts,
  }));

  apiFetch(`${API_BASE}/desktop/analytics`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(_token ? { Authorization: `Bearer ${_token}` } : {}),
    },
    body: JSON.stringify({ events }),
  }).catch(() => {
    // Re-queue on failure (up to cap)
    _queue.unshift(...batch.slice(0, MAX_QUEUE - _queue.length));
  });
}
