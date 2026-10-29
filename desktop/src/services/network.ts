/**
 * Network connectivity monitor with graceful degradation.
 *
 * Listens for browser online/offline events and periodically pings
 * the backend health endpoint to detect real connectivity (not just
 * the OS network interface status).
 */

import { API_BASE, apiFetch } from "./store";

// ─── Types ─────────────────────────────────────────────

export type NetworkStatus = "online" | "offline" | "degraded";

type NetworkListener = (status: NetworkStatus) => void;

// ─── State ─────────────────────────────────────────────

let _status: NetworkStatus = navigator.onLine ? "online" : "offline";
let _listeners: NetworkListener[] = [];
let _healthTimer: ReturnType<typeof setInterval> | null = null;
let _retryTimer: ReturnType<typeof setInterval> | null = null;
let _started = false;

const HEALTH_INTERVAL_MS = 30_000;   // check every 30s when online
const RETRY_INTERVAL_MS = 5_000;     // retry every 5s when offline

// ─── Public API ────────────────────────────────────────

/** Get current network status */
export function getNetworkStatus(): NetworkStatus {
  return _status;
}

/** Subscribe to status changes. Returns unsubscribe function. */
export function onNetworkStatusChange(fn: NetworkListener): () => void {
  _listeners.push(fn);
  return () => { _listeners = _listeners.filter(l => l !== fn); };
}

/** Start monitoring */
export function startNetworkMonitor() {
  if (_started) {
    return;
  }

  _started = true;
  window.addEventListener("online", handleOnline);
  window.addEventListener("offline", handleOffline);

  // Do an initial health check
  checkHealth();

  // Periodic health checks
  _healthTimer = setInterval(checkHealth, HEALTH_INTERVAL_MS);
}

/** Stop monitoring */
export function stopNetworkMonitor() {
  if (!_started) {
    return;
  }

  _started = false;
  window.removeEventListener("online", handleOnline);
  window.removeEventListener("offline", handleOffline);
  if (_healthTimer) { clearInterval(_healthTimer); _healthTimer = null; }
  if (_retryTimer) { clearInterval(_retryTimer); _retryTimer = null; }
}

// ─── Internals ─────────────────────────────────────────

function setStatus(next: NetworkStatus) {
  if (next === _status) return;
  _status = next;
  _listeners.forEach(fn => { try { fn(next); } catch {} });
}

function handleOnline() {
  // OS says we're online — verify with health check
  checkHealth();
}

function handleOffline() {
  setStatus("offline");
  startRetry();
}

async function checkHealth() {
  try {
    const res = await apiFetch(`${API_BASE}/health`, {});
    if (res.ok || res.status < 500) {
      setStatus("online");
      stopRetry();
    } else {
      setStatus("degraded");
      startRetry();
    }
  } catch {
    if (!navigator.onLine) {
      setStatus("offline");
    } else {
      setStatus("degraded");
    }
    startRetry();
  }
}

function startRetry() {
  if (_retryTimer) return;
  _retryTimer = setInterval(checkHealth, RETRY_INTERVAL_MS);
}

function stopRetry() {
  if (_retryTimer) { clearInterval(_retryTimer); _retryTimer = null; }
}
